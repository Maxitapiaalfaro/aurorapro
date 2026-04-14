import 'server-only'

/**
 * Memory Writer — Unified Persistence Service (Pipeline Step 5)
 *
 * Persists a V2 clinical memory together with its associated knowledge-graph
 * nodes, edges, and timeline event in a single Firestore batch write.
 *
 * Guarantees:
 * - Atomicity: all documents are committed in one batch (or chunked batches
 *   when the operation count exceeds the Firestore 500-op limit).
 * - Idempotency: all writes use `merge: true` for safe retries.
 * - Edge explosion control: `co_occurs` edges are only created when BOTH
 *   referenced nodes already existed in Firestore prior to this write.
 *
 * Firestore hierarchy:
 *   psychologists/{psyId}/patients/{patId}/memories/{memoryId}
 *   psychologists/{psyId}/patients/{patId}/knowledge_graph/nodes/{nodeId}
 *   psychologists/{psyId}/patients/{patId}/knowledge_graph/edges/{edgeId}
 *   psychologists/{psyId}/patients/{patId}/timeline_events/{eventId}
 *
 * @module lib/services/memory-writer
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import { createLogger } from '@/lib/logger'
import { FieldValue } from 'firebase-admin/firestore'
import type { WriteBatch } from 'firebase-admin/firestore'
import {
  CLINICAL_MEMORY_SCHEMA_VERSION,
  type ClinicalMemoryWriteInput,
  type KnowledgeGraphNodeInput,
  type KnowledgeGraphEdgeInput,
} from '@/types/clinical-schema'

const logger = createLogger('storage')

/** Firestore batch writes are limited to 500 operations per commit. */
const FIRESTORE_BATCH_LIMIT = 500

/** Edge weight must be in [0, 1]. Clamps out-of-range values. */
function clampWeight(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// ---------------------------------------------------------------------------
// Collection reference helpers
// ---------------------------------------------------------------------------

function patientBasePath(psychologistId: string, patientId: string): string {
  return `psychologists/${psychologistId}/patients/${patientId}`
}

function memoriesCol(psychologistId: string, patientId: string) {
  return getAdminFirestore()
    .collection(`${patientBasePath(psychologistId, patientId)}/memories`)
}

function nodesCol(psychologistId: string, patientId: string) {
  return getAdminFirestore()
    .collection(`${patientBasePath(psychologistId, patientId)}/knowledge_graph/nodes`)
}

function edgesCol(psychologistId: string, patientId: string) {
  return getAdminFirestore()
    .collection(`${patientBasePath(psychologistId, patientId)}/knowledge_graph/edges`)
}

function timelineCol(psychologistId: string, patientId: string) {
  return getAdminFirestore()
    .collection(`${patientBasePath(psychologistId, patientId)}/timeline_events`)
}

// ---------------------------------------------------------------------------
// ID generator (collision-resistant, no external deps)
// ---------------------------------------------------------------------------

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 10)
  return `${ts}_${rand}`
}

// ---------------------------------------------------------------------------
// Batch chunking helper
// ---------------------------------------------------------------------------

interface BatchOperation {
  type: 'set' | 'update'
  ref: FirebaseFirestore.DocumentReference
  data: FirebaseFirestore.DocumentData
  merge: boolean
}

/**
 * Commits a list of batch operations in chunks of `FIRESTORE_BATCH_LIMIT`.
 * Each chunk is committed as a single Firestore batch.
 */
async function commitBatchOperations(ops: BatchOperation[]): Promise<void> {
  const db = getAdminFirestore()

  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = ops.slice(i, i + FIRESTORE_BATCH_LIMIT)
    const batch: WriteBatch = db.batch()

    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data, { merge: op.merge })
      } else {
        batch.update(op.ref, op.data)
      }
    }

    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Core: save_clinical_memory_v2
// ---------------------------------------------------------------------------

/**
 * Result of a successful memory write operation.
 */
export interface MemoryWriteResult {
  memoryId: string
  nodesUpserted: number
  edgesUpserted: number
  timelineEventId: string
  totalOperations: number
}

/**
 * Persists a V2 clinical memory with its associated knowledge-graph
 * entities and a timeline event in an atomic Firestore batch.
 *
 * Implements Pipeline Step 5 (Unified Persistence):
 * 1. Upsert ClinicalMemoryV2 with ontology + optional embedding
 * 2. Upsert KnowledgeGraphNode for each extracted entity
 * 3. Upsert KnowledgeGraphEdge (co_occurs only if both nodes pre-existed)
 * 4. Create TimelineEvent for longitudinal tracking
 *
 * @param psychologistId - UID of the psychologist (Firestore security scope)
 * @param patientId      - Patient document ID
 * @param memoryData     - Core memory content and ontology metadata
 * @param nodes          - Knowledge graph nodes extracted from this memory
 * @param edges          - Knowledge graph edges (causal/co-occurrence relations)
 */
export async function saveClinicalMemoryV2(
  psychologistId: string,
  patientId: string,
  memoryData: ClinicalMemoryWriteInput,
  nodes: KnowledgeGraphNodeInput[] = [],
  edges: KnowledgeGraphEdgeInput[] = [],
): Promise<MemoryWriteResult> {
  const memoryId = memoryData.memoryId ?? generateId()
  const now = new Date()
  const timelineEventId = generateId()

  // -- Pre-check: which graph nodes already exist (for co_occurs gating) --
  const existingNodeIds = await resolveExistingNodeIds(
    psychologistId,
    patientId,
    nodes.map((n) => n.nodeId),
  )

  // -- Build all batch operations --
  const ops: BatchOperation[] = []

  // 1. Memory document
  const memoryDoc = buildMemoryDocument(
    psychologistId,
    patientId,
    memoryId,
    memoryData,
    now,
  )
  ops.push({
    type: 'set',
    ref: memoriesCol(psychologistId, patientId).doc(memoryId),
    data: memoryDoc,
    merge: true,
  })

  // 2. Knowledge graph nodes
  let nodesUpserted = 0
  for (const nodeInput of nodes) {
    const isExisting = existingNodeIds.has(nodeInput.nodeId)
    const nodeDoc = buildNodeDocument(patientId, memoryId, nodeInput, isExisting, now)
    ops.push({
      type: 'set',
      ref: nodesCol(psychologistId, patientId).doc(nodeInput.nodeId),
      data: nodeDoc,
      merge: true,
    })
    nodesUpserted++
  }

  // 3. Knowledge graph edges (co_occurs gated)
  let edgesUpserted = 0
  for (const edgeInput of edges) {
    const shouldWrite = shouldCreateEdge(edgeInput, existingNodeIds)
    if (!shouldWrite) {
      logger.debug('Edge skipped: co_occurs requires both pre-existing nodes', {
        edgeId: edgeInput.edgeId,
        sourceNodeId: edgeInput.sourceNodeId,
        targetNodeId: edgeInput.targetNodeId,
      })
      continue
    }

    const edgeDoc = buildEdgeDocument(patientId, memoryId, memoryData.sourceSessionIds, edgeInput, now)
    ops.push({
      type: 'set',
      ref: edgesCol(psychologistId, patientId).doc(edgeInput.edgeId),
      data: edgeDoc,
      merge: true,
    })
    edgesUpserted++
  }

  // 4. Timeline event
  const timelineDoc = buildTimelineDocument(
    patientId,
    memoryId,
    timelineEventId,
    memoryData,
    now,
  )
  ops.push({
    type: 'set',
    ref: timelineCol(psychologistId, patientId).doc(timelineEventId),
    data: timelineDoc,
    merge: false,
  })

  // -- Commit --
  await commitBatchOperations(ops)

  logger.info('ClinicalMemoryV2 persisted', {
    memoryId,
    nodesUpserted,
    edgesUpserted,
    totalOps: ops.length,
  })

  return {
    memoryId,
    nodesUpserted,
    edgesUpserted,
    timelineEventId,
    totalOperations: ops.length,
  }
}

// ---------------------------------------------------------------------------
// Document builders (pure functions — no I/O)
// ---------------------------------------------------------------------------

function buildMemoryDocument(
  psychologistId: string,
  patientId: string,
  memoryId: string,
  input: ClinicalMemoryWriteInput,
  now: Date,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    memoryId,
    patientId,
    psychologistId,
    category: input.category,
    content: input.content,
    sourceSessionIds: input.sourceSessionIds,
    confidence: input.confidence,
    isActive: true,
    tags: input.tags,
    relevanceScore: input.relevanceScore,
    ontology: {
      domain: input.ontology.domain,
      valence: input.ontology.valence,
      chronicity: input.ontology.chronicity,
      snomedCode: input.ontology.snomedCode,
      dsm5Code: input.ontology.dsm5Code,
      semanticTags: input.ontology.semanticTags,
    },
    _schemaVersion: CLINICAL_MEMORY_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Embedding: store as Firestore VectorValue when available
  if (input.embedding && input.embedding.length > 0) {
    doc.embedding = FieldValue.vector(input.embedding)
    doc.contentHash = input.contentHash ?? null
  }

  return doc
}

function buildNodeDocument(
  patientId: string,
  sourceMemoryId: string,
  input: KnowledgeGraphNodeInput,
  isExisting: boolean,
  now: Date,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    nodeId: input.nodeId,
    patientId,
    nodeType: input.nodeType,
    label: input.label,
    ontology: {
      domain: input.ontology.domain,
      valence: input.ontology.valence,
      chronicity: input.ontology.chronicity,
      snomedCode: input.ontology.snomedCode,
      dsm5Code: input.ontology.dsm5Code,
      semanticTags: input.ontology.semanticTags,
    },
    sourceMemoryId,
    lastSeen: FieldValue.serverTimestamp(),
    status: input.status ?? 'active',
    confidence: input.confidence,
  }

  // Only set firstSeen on new nodes (merge: true preserves existing value)
  if (!isExisting) {
    doc.firstSeen = now
  }

  return doc
}

function buildEdgeDocument(
  patientId: string,
  sourceMemoryId: string,
  sourceSessionIds: string[],
  input: KnowledgeGraphEdgeInput,
  now: Date,
): Record<string, unknown> {
  return {
    edgeId: input.edgeId,
    patientId,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    relationType: input.relationType,
    weight: clampWeight(input.weight),
    evidence: {
      sourceMemoryIds: FieldValue.arrayUnion(sourceMemoryId),
      sourceSessionIds: FieldValue.arrayUnion(...sourceSessionIds),
      evidenceLevel: input.evidenceLevel,
    },
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

function buildTimelineDocument(
  patientId: string,
  memoryId: string,
  eventId: string,
  input: ClinicalMemoryWriteInput,
  now: Date,
): Record<string, unknown> {
  return {
    eventId,
    patientId,
    memoryId,
    eventType: input.category,
    domain: input.ontology.domain,
    valence: input.ontology.valence,
    chronicity: input.ontology.chronicity,
    confidence: input.confidence,
    timestamp: now,
  }
}

// ---------------------------------------------------------------------------
// Pre-check: resolve which node IDs already exist in Firestore
// ---------------------------------------------------------------------------

/**
 * Queries Firestore to determine which of the provided node IDs already exist.
 * Returns a Set of existing node IDs.
 *
 * Uses batched getAll() for efficiency (single round-trip).
 */
async function resolveExistingNodeIds(
  psychologistId: string,
  patientId: string,
  nodeIds: string[],
): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set()

  const db = getAdminFirestore()
  const col = nodesCol(psychologistId, patientId)

  // Deduplicate
  const uniqueIds = [...new Set(nodeIds)]

  const refs = uniqueIds.map((id) => col.doc(id))
  const snapshots = await db.getAll(...refs)

  const existing = new Set<string>()
  for (const snap of snapshots) {
    if (snap.exists) {
      existing.add(snap.id)
    }
  }

  return existing
}

// ---------------------------------------------------------------------------
// Edge explosion control
// ---------------------------------------------------------------------------

/**
 * Determines if an edge should be created.
 *
 * - `co_occurs` edges require BOTH source and target nodes to already exist
 *   in Firestore prior to this write (prevents O(n²) growth on first mention).
 * - All other relation types (causes, mitigates, etc.) are always created
 *   because they represent explicit clinical relationships detected by the LLM.
 */
function shouldCreateEdge(
  edge: KnowledgeGraphEdgeInput,
  existingNodeIds: Set<string>,
): boolean {
  if (edge.relationType !== 'co_occurs') {
    return true
  }

  return existingNodeIds.has(edge.sourceNodeId) && existingNodeIds.has(edge.targetNodeId)
}
