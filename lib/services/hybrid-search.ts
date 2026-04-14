import 'server-only'

/**
 * Hybrid Search — Reciprocal Rank Fusion (RRF) of Vector + Keyword Results
 *
 * Implements Pillar 2 of the Aurora clinical intelligence architecture:
 * combines Firestore Vector Search (semantic KNN) with the existing
 * keyword-based scorer into a single ranked list using the RRF algorithm
 * (Cormack et al., 2009) with k = 60.
 *
 * Pipeline:
 *   1. Execute vector KNN search on the `embedding` field (cosine distance).
 *   2. Receive pre-computed keyword results from the existing scorer.
 *   3. Fuse both ranked lists via RRF: score(doc) = Σ 1/(k + rank_i(doc)).
 *   4. Deduplicate by memoryId, sort by RRF score descending, return top 10.
 *
 * Firestore collection: psychologists/{psyId}/patients/{patId}/memories
 *
 * @module lib/services/hybrid-search
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import { FieldValue } from 'firebase-admin/firestore'
import { createLogger } from '@/lib/logger'
import type {
  KeywordSearchResult,
  HybridSearchResult,
} from '@/types/clinical-schema'

const logger = createLogger('storage')

/**
 * RRF constant. Standard value from Cormack, Clarke & Büttcher (2009).
 * Higher k reduces the influence of high-ranking documents;
 * k = 60 is the accepted default in the literature.
 */
const RRF_K = 60

/** Default number of top results returned from vector KNN. */
const VECTOR_SEARCH_LIMIT = 20

/** Default final result count after RRF fusion. */
const DEFAULT_TOP_K = 10

/** Distance field injected by Firestore's findNearest. */
const DISTANCE_RESULT_FIELD = '_cosineDistance'

/** Maximum cosine distance (1.0 = completely dissimilar). Used as fallback. */
const MAX_COSINE_DISTANCE = 1.0

// ---------------------------------------------------------------------------
// Collection helper
// ---------------------------------------------------------------------------

function memoriesCol(psychologistId: string, patientId: string) {
  return getAdminFirestore()
    .collection(`psychologists/${psychologistId}/patients/${patientId}/memories`)
}

// ---------------------------------------------------------------------------
// Vector search: Firestore findNearest
// ---------------------------------------------------------------------------

/**
 * Result of a single Firestore vector KNN search hit.
 */
interface VectorSearchHit {
  memoryId: string
  distance: number
  data: FirebaseFirestore.DocumentData
}

/**
 * Executes a cosine-distance KNN search on the `embedding` field.
 *
 * Only active memories (`isActive == true`) participate.
 * Uses Firestore's native `findNearest` API (GA in firebase-admin ≥ 12.x).
 *
 * @returns Hits ordered by ascending cosine distance (closest first).
 */
async function vectorSearch(
  psychologistId: string,
  patientId: string,
  queryVector: number[],
  limit: number = VECTOR_SEARCH_LIMIT,
): Promise<VectorSearchHit[]> {
  const col = memoriesCol(psychologistId, patientId)

  // Pre-filter: only active memories
  const baseQuery = col.where('isActive', '==', true)

  const vectorQuery = baseQuery.findNearest({
    vectorField: 'embedding',
    queryVector: FieldValue.vector(queryVector),
    limit,
    distanceMeasure: 'COSINE',
    distanceResultField: DISTANCE_RESULT_FIELD,
  })

  const snapshot = await vectorQuery.get()

  const hits: VectorSearchHit[] = []
  for (const doc of snapshot.docs) {
    const data = doc.data()
    hits.push({
      memoryId: data.memoryId ?? doc.id,
      distance: data[DISTANCE_RESULT_FIELD] ?? MAX_COSINE_DISTANCE,
      data,
    })
  }

  return hits
}

// ---------------------------------------------------------------------------
// RRF Fusion algorithm
// ---------------------------------------------------------------------------

/**
 * Applies Reciprocal Rank Fusion to merge two ranked lists.
 *
 * For each document, computes:
 *   score = 1/(k + rank_vector) + 1/(k + rank_keyword)
 *
 * Documents present in only one list receive the contribution from that
 * list only (the missing list contributes 0).
 *
 * @param vectorHits  - Vector search results ordered by distance (closest first).
 * @param keywordHits - Keyword search results ordered by score (highest first).
 * @param k           - RRF constant (default: 60).
 */
function fuseRRF(
  vectorHits: VectorSearchHit[],
  keywordHits: KeywordSearchResult[],
  k: number = RRF_K,
): HybridSearchResult[] {
  // Map: memoryId → { vectorRank, keywordRank }
  const rankMap = new Map<string, { vectorRank: number | null; keywordRank: number | null }>()

  // Assign vector ranks (1-indexed: rank 1 = closest)
  for (let i = 0; i < vectorHits.length; i++) {
    const id = vectorHits[i].memoryId
    if (!rankMap.has(id)) {
      rankMap.set(id, { vectorRank: i + 1, keywordRank: null })
    }
  }

  // Assign keyword ranks (1-indexed: rank 1 = highest keyword score)
  for (let i = 0; i < keywordHits.length; i++) {
    const id = keywordHits[i].memoryId
    const entry = rankMap.get(id)
    if (entry) {
      entry.keywordRank = i + 1
    } else {
      rankMap.set(id, { vectorRank: null, keywordRank: i + 1 })
    }
  }

  // Compute RRF scores
  const results: HybridSearchResult[] = []
  for (const [memoryId, ranks] of rankMap) {
    let rrfScore = 0
    if (ranks.vectorRank !== null) {
      rrfScore += 1 / (k + ranks.vectorRank)
    }
    if (ranks.keywordRank !== null) {
      rrfScore += 1 / (k + ranks.keywordRank)
    }
    results.push({
      memoryId,
      rrfScore,
      vectorRank: ranks.vectorRank,
      keywordRank: ranks.keywordRank,
    })
  }

  // Sort descending by RRF score
  results.sort((a, b) => b.rrfScore - a.rrfScore)

  return results
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Searches for the most relevant clinical memories using hybrid retrieval
 * (vector KNN + keyword scorer) fused via Reciprocal Rank Fusion.
 *
 * Steps:
 *   1. Run Firestore vector search (cosine KNN) using the provided embedding.
 *   2. Merge with pre-computed keyword results via RRF (k=60).
 *   3. Deduplicate by memoryId (handled intrinsically by the Map).
 *   4. Return the top `topK` results sorted by RRF score descending.
 *
 * @param psychologistId - UID of the psychologist (Firestore security scope).
 * @param patientId      - Patient document ID.
 * @param queryVector    - 768-D embedding of the search query (from gemini-embedding-001).
 * @param keywordResults - Pre-ranked keyword search results from the existing scorer.
 * @param topK           - Number of top results to return (default: 10).
 * @returns Top-K memories ranked by fused RRF score.
 */
export async function searchRelevantMemories(
  psychologistId: string,
  patientId: string,
  queryVector: number[],
  keywordResults: KeywordSearchResult[],
  topK: number = DEFAULT_TOP_K,
): Promise<HybridSearchResult[]> {
  // Step 1: Vector search
  const vectorHits = await vectorSearch(
    psychologistId,
    patientId,
    queryVector,
    VECTOR_SEARCH_LIMIT,
  )

  logger.debug('Vector search completed', {
    hitsCount: vectorHits.length,
    patientId,
  })

  // Step 2 + 3: RRF fusion (deduplication is intrinsic to the Map-based merge)
  const fused = fuseRRF(vectorHits, keywordResults)

  // Step 4: Top-K
  const topResults = fused.slice(0, topK)

  logger.debug('Hybrid search completed', {
    vectorHits: vectorHits.length,
    keywordHits: keywordResults.length,
    fusedTotal: fused.length,
    returned: topResults.length,
  })

  return topResults
}
