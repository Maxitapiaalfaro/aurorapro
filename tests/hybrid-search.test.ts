/**
 * Hybrid Search — RRF Algorithm Unit Tests (Vector 2: Deduplication Precision)
 *
 * Validates that the Reciprocal Rank Fusion algorithm with k=60:
 *   1. Computes scores correctly via Σ 1/(60 + rank).
 *   2. Deduplicates memories appearing in both vector and keyword lists.
 *   3. Sorts results in descending RRF score order.
 *   4. Handles edge cases (empty lists, single-source results).
 *
 * These tests target the pure `fuseRRF` logic. Firestore vector search is
 * mocked so we test only the algorithmic layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Firestore + server-only before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

/** Shared mock function — reassigned per test via `mockVectorSearchResults`. */
const mockGetFn = vi.fn(async () => ({ docs: [] as unknown[] }))

vi.mock('@/lib/firebase-admin-config', () => ({
  getAdminFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        findNearest: vi.fn(() => ({
          get: (...args: unknown[]) => mockGetFn(...args),
        })),
      })),
    })),
  })),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    vector: vi.fn((v: number[]) => v),
  },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Import the module under test — access internals via the public API
// ---------------------------------------------------------------------------

// Since fuseRRF is not exported, we test it indirectly through searchRelevantMemories.
// We control the vector search results via the Firestore mock.
import { searchRelevantMemories } from '@/lib/services/hybrid-search'
import type { KeywordSearchResult, HybridSearchResult } from '@/types/clinical-schema'

// ---------------------------------------------------------------------------
// Constants matching the source module
// ---------------------------------------------------------------------------

const RRF_K = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calculates expected RRF contribution for a single rank. */
function rrfScore(rank: number): number {
  return 1 / (RRF_K + rank)
}

/**
 * Sets up the Firestore mock to return specific vector search hits.
 * The hits array simulates docs returned by findNearest, ordered by distance.
 */
function mockVectorSearchResults(
  hits: Array<{ memoryId: string; distance: number }>,
) {
  const mockDocs = hits.map((h) => ({
    id: h.memoryId,
    data: () => ({
      memoryId: h.memoryId,
      _cosineDistance: h.distance,
    }),
  }))

  mockGetFn.mockResolvedValue({ docs: mockDocs })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Hybrid Search — RRF Algorithm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should compute correct RRF scores for overlapping results (deduplication)', async () => {
    // Setup: memoryA at vector rank 1, keyword rank 2
    // memoryB at vector rank 2, keyword rank 1
    // memoryC only in vector rank 3
    // memoryD only in keyword rank 3
    const vectorHits = [
      { memoryId: 'memA', distance: 0.1 },
      { memoryId: 'memB', distance: 0.3 },
      { memoryId: 'memC', distance: 0.5 },
    ]

    const keywordResults: KeywordSearchResult[] = [
      { memoryId: 'memB', score: 0.95 },
      { memoryId: 'memA', score: 0.80 },
      { memoryId: 'memD', score: 0.60 },
    ]

    mockVectorSearchResults(vectorHits)

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      keywordResults,
    )

    // Expected scores:
    // memA: 1/(60+1) + 1/(60+2) = 1/61 + 1/62
    const expectedMemA = rrfScore(1) + rrfScore(2)
    // memB: 1/(60+2) + 1/(60+1) = 1/62 + 1/61 — same as memA
    const expectedMemB = rrfScore(2) + rrfScore(1)
    // memC: 1/(60+3) only
    const expectedMemC = rrfScore(3)
    // memD: 1/(60+3) only
    const expectedMemD = rrfScore(3)

    // Verify: no duplicates (4 unique memoryIds)
    const ids = results.map((r) => r.memoryId)
    expect(ids.length).toBe(4)
    expect(new Set(ids).size).toBe(4)

    // Verify: correct RRF scores
    const resultMap = new Map(results.map((r) => [r.memoryId, r]))

    expect(resultMap.get('memA')!.rrfScore).toBeCloseTo(expectedMemA, 10)
    expect(resultMap.get('memB')!.rrfScore).toBeCloseTo(expectedMemB, 10)
    expect(resultMap.get('memC')!.rrfScore).toBeCloseTo(expectedMemC, 10)
    expect(resultMap.get('memD')!.rrfScore).toBeCloseTo(expectedMemD, 10)

    // Verify: descending sort order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].rrfScore).toBeGreaterThanOrEqual(results[i].rrfScore)
    }
  })

  it('should assign rank metadata correctly', async () => {
    const vectorHits = [
      { memoryId: 'memA', distance: 0.1 },
      { memoryId: 'memB', distance: 0.3 },
    ]

    const keywordResults: KeywordSearchResult[] = [
      { memoryId: 'memB', score: 0.9 },
      { memoryId: 'memC', score: 0.7 },
    ]

    mockVectorSearchResults(vectorHits)

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      keywordResults,
    )

    const resultMap = new Map(results.map((r) => [r.memoryId, r]))

    // memA: vector rank 1, no keyword rank
    expect(resultMap.get('memA')!.vectorRank).toBe(1)
    expect(resultMap.get('memA')!.keywordRank).toBeNull()

    // memB: vector rank 2, keyword rank 1
    expect(resultMap.get('memB')!.vectorRank).toBe(2)
    expect(resultMap.get('memB')!.keywordRank).toBe(1)

    // memC: no vector rank, keyword rank 2
    expect(resultMap.get('memC')!.vectorRank).toBeNull()
    expect(resultMap.get('memC')!.keywordRank).toBe(2)
  })

  it('should handle empty vector results gracefully', async () => {
    mockVectorSearchResults([])

    const keywordResults: KeywordSearchResult[] = [
      { memoryId: 'memX', score: 0.9 },
      { memoryId: 'memY', score: 0.8 },
    ]

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      keywordResults,
    )

    expect(results.length).toBe(2)
    expect(results[0].memoryId).toBe('memX')
    expect(results[0].rrfScore).toBeCloseTo(rrfScore(1), 10)
    expect(results[0].vectorRank).toBeNull()
    expect(results[0].keywordRank).toBe(1)
  })

  it('should handle empty keyword results gracefully', async () => {
    const vectorHits = [
      { memoryId: 'memX', distance: 0.1 },
      { memoryId: 'memY', distance: 0.2 },
    ]

    mockVectorSearchResults(vectorHits)

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      [],
    )

    expect(results.length).toBe(2)
    expect(results[0].memoryId).toBe('memX')
    expect(results[0].rrfScore).toBeCloseTo(rrfScore(1), 10)
    expect(results[0].keywordRank).toBeNull()
    expect(results[0].vectorRank).toBe(1)
  })

  it('should respect topK limit', async () => {
    // Create 15 unique vector hits
    const vectorHits = Array.from({ length: 15 }, (_, i) => ({
      memoryId: `mem${i}`,
      distance: i * 0.05,
    }))

    mockVectorSearchResults(vectorHits)

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      [],
      5, // topK = 5
    )

    expect(results.length).toBe(5)
    // First result should be the one with the highest RRF score (rank 1)
    expect(results[0].memoryId).toBe('mem0')
    expect(results[0].rrfScore).toBeCloseTo(rrfScore(1), 10)
  })

  it('should produce symmetric RRF scores for swapped positions', async () => {
    // memA at vector=1, keyword=3 and memB at vector=3, keyword=1
    // Both should have the same total RRF score: 1/(60+1) + 1/(60+3)
    const vectorHits = [
      { memoryId: 'memA', distance: 0.1 },
      { memoryId: 'memZ', distance: 0.2 }, // filler at rank 2
      { memoryId: 'memB', distance: 0.3 },
    ]

    const keywordResults: KeywordSearchResult[] = [
      { memoryId: 'memB', score: 0.95 },
      { memoryId: 'memZ', score: 0.80 },
      { memoryId: 'memA', score: 0.60 },
    ]

    mockVectorSearchResults(vectorHits)

    const results = await searchRelevantMemories(
      'psyId',
      'patId',
      new Array(768).fill(0.1),
      keywordResults,
    )

    const resultMap = new Map(results.map((r) => [r.memoryId, r]))

    const scoreA = resultMap.get('memA')!.rrfScore
    const scoreB = resultMap.get('memB')!.rrfScore

    // Both = 1/(60+1) + 1/(60+3)
    const expectedSymmetric = rrfScore(1) + rrfScore(3)
    expect(scoreA).toBeCloseTo(expectedSymmetric, 10)
    expect(scoreB).toBeCloseTo(expectedSymmetric, 10)
    expect(scoreA).toBeCloseTo(scoreB, 10)
  })
})
