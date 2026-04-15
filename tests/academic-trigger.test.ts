/**
 * Academic Trigger — Compound Gate Parametric Tests (Vector 3)
 *
 * Validates the restrictive compound gate:
 *   TRIGGER = confidence > 0.8 AND sourceSessionIds.length >= 2
 *
 * Uses parametric test tables (test.each) to exhaustively verify
 * boundary conditions and ensure no false triggers.
 */

import { describe, it, expect, vi, beforeEach, test } from 'vitest'

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock the research agent (fire-and-forget) — we only verify it's called
vi.mock('@/lib/agents/subagents/research-evidence', () => ({
  executeResearchEvidence: vi.fn(async () => ({ name: 'mock-result' })),
}))

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------

import { evaluateAcademicTrigger } from '@/lib/services/academic-trigger'
import type { KnowledgeGraphNode, ClinicalOntologyMetadata } from '@/types/clinical-schema'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildOntology(overrides: Partial<ClinicalOntologyMetadata> = {}): ClinicalOntologyMetadata {
  return {
    domain: 'cognitive',
    valence: 'risk_factor',
    chronicity: 'trait',
    snomedCode: null,
    dsm5Code: 'F41.1',
    semanticTags: ['cognitive.anxiety.generalized'],
    ...overrides,
  }
}

function buildPatternNode(confidence: number, overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    nodeId: 'node-test-001',
    patientId: 'pat-001',
    nodeType: 'symptom',
    label: 'Generalized Anxiety Pattern',
    ontology: buildOntology(),
    sourceMemoryId: 'mem-001',
    firstSeen: new Date('2026-01-01'),
    lastSeen: new Date('2026-03-15'),
    status: 'active',
    confidence,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Academic Trigger — Compound Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // Parametric table: boundary conditions
  // -----------------------------------------------------------------------

  describe('parametric gate evaluation', () => {
    test.each([
      // [description, confidence, sessions, expectedTriggered]
      ['high confidence + 2 sessions → TRIGGER', 0.81, ['sess-1', 'sess-2'], true],
      ['high confidence + 3 sessions → TRIGGER', 0.9, ['sess-1', 'sess-2', 'sess-3'], true],
      ['high confidence + 1 session → NO-OP', 0.81, ['sess-1'], false],
      ['low confidence + 3 sessions → NO-OP', 0.79, ['sess-1', 'sess-2', 'sess-3'], false],
      ['exact threshold (0.8) + 2 sessions → NO-OP (strictly >)', 0.8, ['sess-1', 'sess-2'], false],
      ['just above threshold (0.801) + 2 sessions → TRIGGER', 0.801, ['sess-1', 'sess-2'], true],
      ['zero confidence + 5 sessions → NO-OP', 0.0, ['s1', 's2', 's3', 's4', 's5'], false],
      ['max confidence + 0 sessions → NO-OP', 1.0, [], false],
      ['max confidence + 1 session → NO-OP', 1.0, ['sess-1'], false],
      ['max confidence + 2 sessions → TRIGGER', 1.0, ['sess-1', 'sess-2'], true],
    ])(
      '%s',
      (_desc, confidence, sessions, expectedTriggered) => {
        const node = buildPatternNode(confidence as number)
        const result = evaluateAcademicTrigger(node, sessions as string[])

        expect(result.triggered).toBe(expectedTriggered)
        expect(typeof result.reason).toBe('string')
        expect(result.reason.length).toBeGreaterThan(0)
      },
    )
  })

  // -----------------------------------------------------------------------
  // Session deduplication: duplicate session IDs should count as 1
  // -----------------------------------------------------------------------

  it('should deduplicate session IDs (2 identical = 1 unique → NO-OP)', () => {
    const node = buildPatternNode(0.85)
    const result = evaluateAcademicTrigger(node, ['sess-1', 'sess-1'])

    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('sessions 1')
  })

  it('should deduplicate session IDs (3 with 2 unique → TRIGGER)', () => {
    const node = buildPatternNode(0.85)
    const result = evaluateAcademicTrigger(node, ['sess-1', 'sess-2', 'sess-1'])

    expect(result.triggered).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Reason string verification
  // -----------------------------------------------------------------------

  it('should include confidence value in rejection reason', () => {
    const node = buildPatternNode(0.5)
    const result = evaluateAcademicTrigger(node, ['sess-1', 'sess-2'])

    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('0.5')
    expect(result.reason).toContain('0.8')
  })

  it('should include session count in rejection reason', () => {
    const node = buildPatternNode(0.9)
    const result = evaluateAcademicTrigger(node, ['sess-1'])

    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('sessions 1')
    expect(result.reason).toContain('2')
  })

  it('should include both values in trigger reason', () => {
    const node = buildPatternNode(0.85)
    const result = evaluateAcademicTrigger(node, ['sess-1', 'sess-2'])

    expect(result.triggered).toBe(true)
    expect(result.reason).toContain('0.85')
    expect(result.reason).toContain('0.8')
    expect(result.reason).toContain('sessions 2')
  })

  // -----------------------------------------------------------------------
  // Gate 1 takes priority (checked first): confidence fails → no session check
  // -----------------------------------------------------------------------

  it('should reject on confidence first when both gates would fail', () => {
    const node = buildPatternNode(0.3)
    const result = evaluateAcademicTrigger(node, [])

    expect(result.triggered).toBe(false)
    // Reason should mention confidence, not sessions
    expect(result.reason).toContain('confidence')
    expect(result.reason).toContain('0.3')
  })

  // -----------------------------------------------------------------------
  // Edge case: empty session list
  // -----------------------------------------------------------------------

  it('should handle empty session list without error', () => {
    const node = buildPatternNode(0.9)
    const result = evaluateAcademicTrigger(node, [])

    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('sessions 0')
  })
})
