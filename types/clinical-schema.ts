/**
 * Clinical Intelligence Schema — Aurora/HopeAI
 *
 * Type definitions for the semantic clinical intelligence subsystem.
 * Covers the 5 architectural pillars:
 *   P1: Structured clinical ontology (semantic tagging)
 *   P2: Hybrid retrieval (vector + keyword)
 *   P3: Longitudinal trajectory analysis (temporality)
 *   P4: Automatic cross-referencing (clinical + academic)
 *   P5: Patient knowledge graph
 *
 * All types are server-side oriented and designed for Firestore persistence
 * under: psychologists/{psyId}/patients/{patId}/...
 *
 * @module types/clinical-schema
 */

import type { ClinicalMemoryCategory } from '@/types/memory-types'

// ---------------------------------------------------------------------------
// Pilar 1: Ontología Clínica Estructurada
// ---------------------------------------------------------------------------

/** Biopsychosocial domains — closed taxonomy with 4 primary domains. */
export type ClinicalDomain =
  | 'cognitive'
  | 'somatic'
  | 'interpersonal'
  | 'functional'

/** Clinical valence: whether the data point is a protective resource or risk factor. */
export type ClinicalValence = 'strength' | 'risk_factor'

/** Chronicity classifier: stable trait vs. transient state. */
export type Chronicity = 'trait' | 'state'

/**
 * Structured clinical ontology metadata.
 * Replaces flat `tags: string[]` for V2 memories.
 * Every field is mandatory at write-time for new memories.
 */
export interface ClinicalOntologyMetadata {
  /** Primary clinical domain (biopsychosocial model). */
  domain: ClinicalDomain

  /** Whether this is a protective resource or risk factor. */
  valence: ClinicalValence

  /** Stable trait vs. transient state — affects longitudinal weighting. */
  chronicity: Chronicity

  /**
   * Optional SNOMED-CT concept ID (6–18 digit string).
   * Populated by the entity extraction engine when confidence > 0.7.
   * Null when no reliable mapping exists.
   */
  snomedCode: string | null

  /**
   * Optional DSM-5 code (e.g. "F32.1", "F41.0").
   * Applies only to 'pattern' and 'observation' categories with diagnostic relevance.
   */
  dsm5Code: string | null

  /**
   * Hierarchical semantic tags. Format: "domain.subdomain.concept".
   * Example: "cognitive.attention.sustained", "interpersonal.attachment.anxious".
   * Maximum 5 tags. Validated against registered vocabulary.
   */
  semanticTags: string[]
}

// ---------------------------------------------------------------------------
// V2 Clinical Memory (extends V1 with ontology + embedding)
// ---------------------------------------------------------------------------

/** Schema version discriminator for lazy migration. */
export const CLINICAL_MEMORY_SCHEMA_VERSION = 2

/**
 * Clinical memory V2 — backward-compatible extension of ClinicalMemory.
 *
 * Adds:
 * - `ontology`: structured metadata (Pillar 1)
 * - `embedding`: 768-D Float32 vector for semantic search (Pillar 2)
 * - `contentHash`: SHA-256 of normalized content for embedding cache invalidation
 * - `_schemaVersion`: discriminator for lazy migration of legacy docs
 *
 * Firestore path: psychologists/{psyId}/patients/{patId}/memories/{memoryId}
 */
export interface ClinicalMemoryV2 {
  memoryId: string
  patientId: string
  psychologistId: string
  category: ClinicalMemoryCategory
  content: string
  sourceSessionIds: string[]
  confidence: number
  createdAt: Date
  updatedAt: Date
  isActive: boolean

  /** Legacy flat tags — preserved for backward-compatibility during migration. */
  tags: string[]

  relevanceScore: number

  /** Structured ontology metadata (Pillar 1). Null on legacy docs pre-migration. */
  ontology: ClinicalOntologyMetadata | null

  /**
   * 768-dimensional embedding vector from gemini-embedding-001.
   * Stored as Firestore VectorValue via FieldValue.vector().
   * Undefined when embedding generation is pending (async pipeline).
   */
  embedding?: number[]

  /** SHA-256 hex digest of normalized content — used to detect stale embeddings. */
  contentHash?: string

  /** Schema version. Legacy docs have undefined or 1; enriched docs have 2. */
  _schemaVersion: number
}

// ---------------------------------------------------------------------------
// Input type for the memory writer (what callers provide)
// ---------------------------------------------------------------------------

/**
 * Data required to persist a V2 clinical memory.
 * The writer derives `memoryId` (if not provided) and enriches with timestamps.
 */
export interface ClinicalMemoryWriteInput {
  /** Optional — auto-generated if omitted. */
  memoryId?: string
  category: ClinicalMemoryCategory
  content: string
  sourceSessionIds: string[]
  confidence: number
  tags: string[]
  relevanceScore: number
  ontology: ClinicalOntologyMetadata
  embedding?: number[]
  contentHash?: string
}

// ---------------------------------------------------------------------------
// Pilar 5: Patient Knowledge Graph
// ---------------------------------------------------------------------------

/** Closed taxonomy of node types in the clinical knowledge graph. */
export type KnowledgeGraphNodeType =
  | 'symptom'
  | 'interpersonal'
  | 'medication'
  | 'milestone'
  | 'intervention'
  | 'diagnosis'
  | 'protective_factor'

/** Activity status of a graph node. */
export type KnowledgeGraphNodeStatus = 'active' | 'historical' | 'hypothesized'

/**
 * Node in the patient knowledge graph.
 * Firestore path: psychologists/{psyId}/patients/{patId}/knowledge_graph/nodes/{nodeId}
 */
export interface KnowledgeGraphNode {
  nodeId: string
  patientId: string
  nodeType: KnowledgeGraphNodeType
  label: string
  ontology: ClinicalOntologyMetadata
  sourceMemoryId: string | null
  firstSeen: Date
  lastSeen: Date
  status: KnowledgeGraphNodeStatus
  confidence: number
}

/** Directed relationship types between graph nodes (clinical causality vectors). */
export type KnowledgeGraphRelationType =
  | 'causes'
  | 'exacerbates'
  | 'mitigates'
  | 'co_occurs'
  | 'triggers'
  | 'replaces'
  | 'precedes'
  | 'contradicts'

/** Evidence level for a graph edge. */
export type EdgeEvidenceLevel = 'confirmed' | 'observed' | 'hypothesized'

/**
 * Directed edge in the patient knowledge graph.
 * Firestore path: psychologists/{psyId}/patients/{patId}/knowledge_graph/edges/{edgeId}
 */
export interface KnowledgeGraphEdge {
  edgeId: string
  patientId: string
  sourceNodeId: string
  targetNodeId: string
  relationType: KnowledgeGraphRelationType
  weight: number
  evidence: {
    sourceMemoryIds: string[]
    sourceSessionIds: string[]
    evidenceLevel: EdgeEvidenceLevel
  }
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// Pilar 3: Timeline events (longitudinal trajectory tracking)
// ---------------------------------------------------------------------------

/**
 * A timeline event recorded on each memory write.
 * Used by Cloud Functions to compute frequency/severity deltas.
 *
 * Firestore path: psychologists/{psyId}/patients/{patId}/timeline_events/{eventId}
 */
export interface TimelineEvent {
  eventId: string
  patientId: string
  memoryId: string
  eventType: ClinicalMemoryCategory
  domain: ClinicalDomain
  valence: ClinicalValence
  chronicity: Chronicity
  confidence: number
  timestamp: Date
}

// ---------------------------------------------------------------------------
// Pilar 2: Hybrid search result types
// ---------------------------------------------------------------------------

/** A single scored result from keyword-based memory search. */
export interface KeywordSearchResult {
  memoryId: string
  score: number
}

/** A scored result from the hybrid RRF fusion. */
export interface HybridSearchResult {
  memoryId: string
  rrfScore: number
  vectorRank: number | null
  keywordRank: number | null
}

// ---------------------------------------------------------------------------
// Node/Edge input types for the memory writer
// ---------------------------------------------------------------------------

/** Input data for upserting a knowledge graph node alongside a memory write. */
export interface KnowledgeGraphNodeInput {
  nodeId: string
  nodeType: KnowledgeGraphNodeType
  label: string
  ontology: ClinicalOntologyMetadata
  status?: KnowledgeGraphNodeStatus
  confidence: number
}

/** Input data for creating/updating a knowledge graph edge alongside a memory write. */
export interface KnowledgeGraphEdgeInput {
  edgeId: string
  sourceNodeId: string
  targetNodeId: string
  relationType: KnowledgeGraphRelationType
  weight: number
  evidenceLevel: EdgeEvidenceLevel
}
