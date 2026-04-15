/**
 * Pipeline Orchestrator — Graceful Degradation Tests (Vector 1)
 *
 * Validates that process_clinical_message:
 *   1. Survives embedding generation failure (returns degraded result, no throw).
 *   2. Survives entity extraction failure (persists flat memory, no throw).
 *   3. Survives hybrid search failure (returns empty memories, no throw).
 *   4. Survives simultaneous failures in T0 (extraction + embedding both fail).
 *   5. Executes T0 concurrently (embedding + extraction in parallel).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock all external dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock sub-services with controllable implementations
const mockExtractClinicalEntities = vi.fn()
const mockGenerateMemoryEmbedding = vi.fn()
const mockSearchRelevantMemories = vi.fn()
const mockEvaluateAcademicTrigger = vi.fn()
const mockSaveClinicalMemoryV2 = vi.fn()

vi.mock('@/lib/services/entity-extractor', () => ({
  extractClinicalEntities: (...args: unknown[]) => mockExtractClinicalEntities(...args),
}))

vi.mock('@/lib/services/embedding-generator', () => ({
  generateMemoryEmbedding: (...args: unknown[]) => mockGenerateMemoryEmbedding(...args),
}))

vi.mock('@/lib/services/hybrid-search', () => ({
  searchRelevantMemories: (...args: unknown[]) => mockSearchRelevantMemories(...args),
}))

vi.mock('@/lib/services/academic-trigger', () => ({
  evaluateAcademicTrigger: (...args: unknown[]) => mockEvaluateAcademicTrigger(...args),
}))

vi.mock('@/lib/services/memory-writer', () => ({
  saveClinicalMemoryV2: (...args: unknown[]) => mockSaveClinicalMemoryV2(...args),
}))

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

import { processClinicalMessage, type PipelineContext } from '@/lib/orchestrator/pipeline'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    psychologistId: 'psy-001',
    patientId: 'pat-001',
    sessionId: 'sess-001',
    conversationHistory: ['previous message'],
    keywordResults: [{ memoryId: 'kw-mem-1', score: 0.9 }],
    category: 'observation',
    tags: ['anxiety', 'sleep'],
    relevanceScore: 0.85,
    confidence: 0.75,
    ...overrides,
  }
}

const MOCK_ENTITIES = [
  {
    domain: 'cognitive' as const,
    valence: 'risk_factor' as const,
    chronicity: 'state' as const,
    snomedCode: null,
    dsm5Code: null,
    semanticTags: ['cognitive.attention.sustained'],
  },
]

const MOCK_EMBEDDING = {
  embedding: new Array(768).fill(0.01),
  contentHash: 'abc123hash',
}

const MOCK_SEARCH_RESULTS = [
  { memoryId: 'mem-1', rrfScore: 0.033, vectorRank: 1, keywordRank: 2 },
]

const MOCK_WRITE_RESULT = {
  memoryId: 'mem-new-1',
  nodesUpserted: 1,
  edgesUpserted: 0,
  timelineEventId: 'evt-1',
  totalOperations: 3,
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Pipeline Orchestrator — Graceful Degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: all services succeed
    mockExtractClinicalEntities.mockResolvedValue(MOCK_ENTITIES)
    mockGenerateMemoryEmbedding.mockResolvedValue(MOCK_EMBEDDING)
    mockSearchRelevantMemories.mockResolvedValue(MOCK_SEARCH_RESULTS)
    mockEvaluateAcademicTrigger.mockReturnValue({ triggered: false, reason: 'test' })
    mockSaveClinicalMemoryV2.mockResolvedValue(MOCK_WRITE_RESULT)
  })

  // -------------------------------------------------------------------------
  // Happy path baseline
  // -------------------------------------------------------------------------

  it('should complete successfully when all services succeed', async () => {
    const result = await processClinicalMessage('Patient reports insomnia', buildContext())

    expect(result.success).toBe(true)
    expect(result.entities).toEqual(MOCK_ENTITIES)
    expect(result.embeddingResult).toEqual(MOCK_EMBEDDING)
    expect(result.relevantMemories).toEqual(MOCK_SEARCH_RESULTS)
    expect(result.writeResult).toEqual(MOCK_WRITE_RESULT)
    expect(typeof result.latencyMs).toBe('number')
  })

  // -------------------------------------------------------------------------
  // Vector 1: Embedding failure — degraded but functional
  // -------------------------------------------------------------------------

  it('should return degraded result when embedding generation fails', async () => {
    mockGenerateMemoryEmbedding.mockRejectedValue(new Error('Embedding API timeout'))

    const result = await processClinicalMessage('Patient reports anxiety', buildContext())

    // Must NOT throw — the pipeline catches the error
    expect(result.success).toBe(true)
    expect(result.embeddingResult).toBeNull()
    // Search should receive empty vector → skip to empty results
    expect(result.relevantMemories).toEqual([])
    // Entities should still be extracted
    expect(result.entities).toEqual(MOCK_ENTITIES)
    // Memory should still be persisted (without embedding)
    expect(mockSaveClinicalMemoryV2).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Vector 1: Entity extraction failure — degraded but functional
  // -------------------------------------------------------------------------

  it('should return degraded result when entity extraction fails', async () => {
    mockExtractClinicalEntities.mockRejectedValue(new Error('LLM structured output timeout'))

    const result = await processClinicalMessage('Patient reports stress', buildContext())

    // Must NOT throw
    expect(result.success).toBe(true)
    expect(result.entities).toEqual([])
    // Embedding should still succeed
    expect(result.embeddingResult).toEqual(MOCK_EMBEDDING)
    // With no entities, persistence is skipped
    expect(result.writeResult).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Vector 1: Both T0 services fail simultaneously
  // -------------------------------------------------------------------------

  it('should survive simultaneous T0 failures (extraction + embedding)', async () => {
    mockExtractClinicalEntities.mockRejectedValue(new Error('LLM down'))
    mockGenerateMemoryEmbedding.mockRejectedValue(new Error('Embedding API down'))

    const result = await processClinicalMessage('Critical session note', buildContext())

    // Must NOT throw an unhandled rejection
    expect(result.success).toBe(true)
    expect(result.entities).toEqual([])
    expect(result.embeddingResult).toBeNull()
    expect(result.relevantMemories).toEqual([])
    expect(result.writeResult).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Vector 1: Hybrid search failure in T1 (Promise.allSettled)
  // -------------------------------------------------------------------------

  it('should survive hybrid search failure in T1', async () => {
    mockSearchRelevantMemories.mockRejectedValue(new Error('Firestore vector search failed'))

    const result = await processClinicalMessage('Patient reports insomnia', buildContext())

    // Must NOT throw
    expect(result.success).toBe(true)
    // Search failed → empty memories
    expect(result.relevantMemories).toEqual([])
    // Everything else should still work
    expect(result.entities).toEqual(MOCK_ENTITIES)
    expect(result.writeResult).toEqual(MOCK_WRITE_RESULT)
  })

  // -------------------------------------------------------------------------
  // Vector 1: Persistence failure in T2
  // -------------------------------------------------------------------------

  it('should survive memory persistence failure in T2', async () => {
    mockSaveClinicalMemoryV2.mockRejectedValue(new Error('Firestore batch commit failed'))

    const result = await processClinicalMessage('Patient reports panic', buildContext())

    // Must NOT throw
    expect(result.success).toBe(true)
    expect(result.writeResult).toBeNull()
    // Everything else should be populated
    expect(result.entities).toEqual(MOCK_ENTITIES)
    expect(result.relevantMemories).toEqual(MOCK_SEARCH_RESULTS)
  })

  // -------------------------------------------------------------------------
  // Concurrency: T0 runs extraction + embedding in parallel
  // -------------------------------------------------------------------------

  it('should execute extraction and embedding concurrently in T0', async () => {
    const callOrder: string[] = []

    mockExtractClinicalEntities.mockImplementation(async () => {
      callOrder.push('extraction-start')
      await new Promise((r) => setTimeout(r, 50))
      callOrder.push('extraction-end')
      return MOCK_ENTITIES
    })

    mockGenerateMemoryEmbedding.mockImplementation(async () => {
      callOrder.push('embedding-start')
      await new Promise((r) => setTimeout(r, 50))
      callOrder.push('embedding-end')
      return MOCK_EMBEDDING
    })

    await processClinicalMessage('Concurrent test', buildContext())

    // Both should start before either ends (concurrent via Promise.all)
    const extractionStartIdx = callOrder.indexOf('extraction-start')
    const embeddingStartIdx = callOrder.indexOf('embedding-start')
    const extractionEndIdx = callOrder.indexOf('extraction-end')
    const embeddingEndIdx = callOrder.indexOf('embedding-end')

    // Both started before either finished
    expect(extractionStartIdx).toBeLessThan(extractionEndIdx)
    expect(embeddingStartIdx).toBeLessThan(embeddingEndIdx)
    expect(Math.max(extractionStartIdx, embeddingStartIdx)).toBeLessThan(
      Math.min(extractionEndIdx, embeddingEndIdx),
    )
  })

  // -------------------------------------------------------------------------
  // Pipeline skips search when no embedding available
  // -------------------------------------------------------------------------

  it('should skip search when embedding is null', async () => {
    mockGenerateMemoryEmbedding.mockResolvedValue(null)

    const result = await processClinicalMessage('Test without embedding', buildContext())

    expect(result.relevantMemories).toEqual([])
    // searchRelevantMemories should NOT have been called
    expect(mockSearchRelevantMemories).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Pipeline skips persistence when no entities extracted
  // -------------------------------------------------------------------------

  it('should skip persistence when entities array is empty', async () => {
    mockExtractClinicalEntities.mockResolvedValue([])

    const result = await processClinicalMessage('Ambiguous message', buildContext())

    expect(result.entities).toEqual([])
    expect(result.writeResult).toBeNull()
    expect(mockSaveClinicalMemoryV2).not.toHaveBeenCalled()
  })
})
