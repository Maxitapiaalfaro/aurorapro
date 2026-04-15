import 'server-only'

/**
 * Pipeline Orchestrator — Clinical Intelligence Hot Path
 *
 * Coordinates the five-step clinical intelligence pipeline with
 * latency-optimized concurrency (target: < 1 300 ms total).
 *
 * Concurrency strategy (Section 4.1):
 *
 *   T0 ─┬─ extractClinicalEntities(userMessage)   ← Step 1
 *        └─ generateMemoryEmbedding(userMessage)    ← Step 2 (parallel)
 *
 *   T1 ─┬─ searchRelevantMemories(embedding)        ← Step 3
 *        └─ evaluateAcademicTrigger(patternNode)     ← Step 4 (fire-and-forget)
 *
 *   T2 ── saveClinicalMemoryV2(memory)               ← Step 5
 *
 *   Return enriched context for the conversational LLM.
 *
 * @module lib/orchestrator/pipeline
 */

import { createLogger } from '@/lib/logger'
import { extractClinicalEntities } from '@/lib/services/entity-extractor'
import { generateMemoryEmbedding } from '@/lib/services/embedding-generator'
import type { EmbeddingResult } from '@/lib/services/embedding-generator'
import { searchRelevantMemories } from '@/lib/services/hybrid-search'
import { evaluateAcademicTrigger } from '@/lib/services/academic-trigger'
import { saveClinicalMemoryV2 } from '@/lib/services/memory-writer'
import type { MemoryWriteResult } from '@/lib/services/memory-writer'
import type {
  ClinicalOntologyMetadata,
  HybridSearchResult,
  KeywordSearchResult,
} from '@/types/clinical-schema'
import type { AcademicTriggerResult } from '@/lib/services/academic-trigger'
import type { KnowledgeGraphNode } from '@/types/clinical-schema'
import type { ClinicalMemoryCategory } from '@/types/memory-types'

const logger = createLogger('orchestrator')

// ---------------------------------------------------------------------------
// Pipeline step callback (UX telemetry)
// ---------------------------------------------------------------------------

/**
 * Callback signature for emitting pipeline progress events to the SSE layer.
 * Compatible with the `ProcessingStepEvent` shape defined in clinical-types.ts.
 *
 * @param id     - Unique step identifier (e.g. 'ci_entities').
 * @param label  - Human-readable label (e.g. 'Extrayendo entidades clínicas…').
 * @param status - 'active' when starting, 'completed' when done.
 * @param detail - Optional secondary detail (e.g. '3 entidades, 768-D vector').
 */
export type PipelineStepCallback = (
  id: string,
  label: string,
  status: 'active' | 'completed',
  detail?: string,
) => void

/** No-op step callback used when no listener is provided. */
const noopStep: PipelineStepCallback = () => {}

// ---------------------------------------------------------------------------
// Pipeline context types
// ---------------------------------------------------------------------------

/** Input context provided by the conversational layer. */
export interface PipelineContext {
  /** Authenticated psychologist UID. */
  psychologistId: string
  /** Target patient document ID. */
  patientId: string
  /** Current session ID. */
  sessionId: string
  /** Recent conversation turns for entity extraction disambiguation. */
  conversationHistory: string[]
  /** Pre-computed keyword search results (from existing scorer). */
  keywordResults: KeywordSearchResult[]
  /** Memory category for the new memory. */
  category: ClinicalMemoryCategory
  /** Flat tags for backward-compat. */
  tags: string[]
  /** Relevance score assigned by the upstream ranker. */
  relevanceScore: number
  /** Confidence score from upstream analysis. */
  confidence: number
  /** Optional knowledge graph node for academic trigger evaluation. */
  patternNode?: KnowledgeGraphNode
}

/** Enriched output returned to the conversational LLM. */
export interface PipelineResult {
  /** Whether the pipeline completed successfully. */
  success: boolean
  /** Retrieved relevant memories (for LLM context injection). */
  relevantMemories: HybridSearchResult[]
  /** Extracted clinical ontology entities. */
  entities: ClinicalOntologyMetadata[]
  /** Embedding result (null if generation failed). */
  embeddingResult: EmbeddingResult | null
  /** Academic trigger evaluation outcome. */
  academicTrigger: AcademicTriggerResult | null
  /** Memory persistence result (null if persistence was skipped). */
  writeResult: MemoryWriteResult | null
  /** Total pipeline latency in milliseconds. */
  latencyMs: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Processes a clinical message through the full intelligence pipeline.
 *
 * Orchestrates Steps 1–5 with optimized concurrency:
 *
 * **T0 — Parallel extraction + embedding** (Promise.all)
 *   Step 1: extractClinicalEntities — LLM structured output
 *   Step 2: generateMemoryEmbedding — vector generation + SHA-256 hash
 *
 * **T1 — Parallel search + trigger** (Promise.allSettled)
 *   Step 3: searchRelevantMemories — hybrid KNN + keyword RRF fusion
 *   Step 4: evaluateAcademicTrigger — fire-and-forget research gate
 *
 * **T2 — Sequential persistence**
 *   Step 5: saveClinicalMemoryV2 — atomic Firestore batch write
 *
 * Returns enriched context (prior memories + new entities) for the
 * conversational LLM to incorporate in its response.
 *
 * @param userMessage - Raw user message text.
 * @param context     - Pipeline execution context (IDs, history, keyword results).
 * @param onStep      - Optional callback for emitting progress events to the SSE layer.
 * @returns Enriched pipeline result for LLM context injection.
 */
export async function processClinicalMessage(
  userMessage: string,
  context: PipelineContext,
  onStep: PipelineStepCallback = noopStep,
): Promise<PipelineResult> {
  const startTime = performance.now()

  // -----------------------------------------------------------------------
  // T0: Parallel — Entity extraction (Step 1) + Embedding generation (Step 2)
  // -----------------------------------------------------------------------

  onStep('ci_entities', 'Extrayendo entidades clínicas…', 'active')
  onStep('ci_embedding', 'Generando embedding semántico…', 'active')

  const [entitiesResult, embeddingResult] = await Promise.all([
    extractClinicalEntities(userMessage, context.conversationHistory)
      .catch((err): ClinicalOntologyMetadata[] => {
        logger.warn('Pipeline T0: entity extraction failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        return []
      }),
    generateMemoryEmbedding(userMessage)
      .catch((): EmbeddingResult | null => {
        logger.warn('Pipeline T0: embedding generation failed')
        return null
      }),
  ])

  const entities = entitiesResult
  const t0LatencyMs = performance.now() - startTime

  onStep('ci_entities', 'Entidades extraídas', 'completed',
    entities.length > 0 ? `${entities.length} entidad${entities.length !== 1 ? 'es' : ''}` : 'sin entidades')
  onStep('ci_embedding', embeddingResult ? 'Embedding generado' : 'Embedding omitido', 'completed',
    embeddingResult ? '768-D vector' : 'degradado')

  logger.debug('Pipeline T0 complete', {
    entitiesCount: entities.length,
    hasEmbedding: embeddingResult !== null,
    latencyMs: Math.round(t0LatencyMs),
  })

  // -----------------------------------------------------------------------
  // T1: Parallel — Hybrid search (Step 3) + Academic trigger (Step 4)
  // Uses Promise.allSettled to prevent one failure from blocking the other.
  // -----------------------------------------------------------------------

  const t1Start = performance.now()

  onStep('ci_search', 'Buscando memorias relevantes…', 'active')

  const searchPromise = embeddingResult
    ? searchRelevantMemories(
        context.psychologistId,
        context.patientId,
        embeddingResult.embedding,
        context.keywordResults,
      )
    : Promise.resolve([] as HybridSearchResult[])

  // Academic trigger is synchronous (fire-and-forget internally),
  // but wrap it consistently for the Promise.allSettled pattern.
  // Pass the current sessionId — the trigger internally deduplicates via Set.
  const triggerPromise = Promise.resolve<AcademicTriggerResult | null>(
    context.patternNode
      ? evaluateAcademicTrigger(context.patternNode, [context.sessionId])
      : null,
  )

  const [searchSettled, triggerSettled] = await Promise.allSettled([
    searchPromise,
    triggerPromise,
  ])

  const relevantMemories =
    searchSettled.status === 'fulfilled' ? searchSettled.value : []
  const academicTrigger =
    triggerSettled.status === 'fulfilled' ? triggerSettled.value : null

  if (searchSettled.status === 'rejected') {
    logger.warn('Pipeline T1: hybrid search failed', {
      error: String(searchSettled.reason),
    })
  }

  const t1LatencyMs = performance.now() - t1Start

  onStep('ci_search', 'Memorias recuperadas', 'completed',
    relevantMemories.length > 0 ? `${relevantMemories.length} memoria${relevantMemories.length !== 1 ? 's' : ''}` : 'sin coincidencias')

  logger.debug('Pipeline T1 complete', {
    memoriesRetrieved: relevantMemories.length,
    triggerResult: academicTrigger?.triggered ?? 'skipped',
    latencyMs: Math.round(t1LatencyMs),
  })

  // -----------------------------------------------------------------------
  // T2: Sequential — Unified persistence (Step 5)
  // -----------------------------------------------------------------------

  let writeResult: MemoryWriteResult | null = null

  // Only persist if we have at least one entity to write
  if (entities.length > 0) {
    onStep('ci_persist', 'Persistiendo memoria clínica…', 'active')
    const primaryOntology = entities[0]
    try {
      writeResult = await saveClinicalMemoryV2(
        context.psychologistId,
        context.patientId,
        {
          category: context.category,
          content: userMessage,
          sourceSessionIds: [context.sessionId],
          confidence: context.confidence,
          tags: context.tags,
          relevanceScore: context.relevanceScore,
          ontology: primaryOntology,
          embedding: embeddingResult?.embedding,
          contentHash: embeddingResult?.contentHash,
        },
      )
      onStep('ci_persist', 'Memoria persistida', 'completed')
    } catch (err) {
      logger.error('Pipeline T2: memory persistence failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      onStep('ci_persist', 'Persistencia omitida', 'completed', 'error')
    }
  } else {
    logger.debug('Pipeline T2: skipped persistence — no entities extracted')
  }

  // -----------------------------------------------------------------------
  // Result assembly
  // -----------------------------------------------------------------------

  const totalLatencyMs = performance.now() - startTime

  logger.info('Pipeline completed', {
    entitiesCount: entities.length,
    memoriesRetrieved: relevantMemories.length,
    persisted: writeResult !== null,
    academicTriggered: academicTrigger?.triggered ?? false,
    totalLatencyMs: Math.round(totalLatencyMs),
  })

  return {
    success: true,
    relevantMemories,
    entities,
    embeddingResult,
    academicTrigger,
    writeResult,
    latencyMs: Math.round(totalLatencyMs),
  }
}
