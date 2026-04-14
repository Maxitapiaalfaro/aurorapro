import 'server-only'

/**
 * Academic Trigger — Pattern-Driven Research Gate (Pipeline Step 4)
 *
 * Evaluates whether a clinical pattern node warrants automatic
 * academic cross-referencing. Uses a restrictive compound gate:
 *
 *   TRIGGER = confidence > 0.8 AND sourceSessionIds.length >= 2
 *
 * When both conditions are met, invokes the research agent in a
 * fire-and-forget pattern (no await) to avoid blocking the main
 * persistence pipeline.
 *
 * @module lib/services/academic-trigger
 */

import { createLogger } from '@/lib/logger'
import type { KnowledgeGraphNode } from '@/types/clinical-schema'

const logger = createLogger('agent')

/** Minimum confidence threshold for triggering academic research. */
const CONFIDENCE_THRESHOLD = 0.8

/** Minimum number of distinct sessions that must mention the pattern. */
const MIN_SESSION_COUNT = 2

// ---------------------------------------------------------------------------
// Research agent invocation (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Invokes the research agent to find academic evidence for a clinical query.
 *
 * This is called in fire-and-forget mode (not awaited by the caller)
 * so it never blocks the persistence pipeline. Errors are caught and
 * logged internally.
 *
 * The research agent writes its results to Firestore asynchronously;
 * the results are picked up on subsequent retrieval operations.
 *
 * @param query - The clinical search query derived from the pattern node.
 */
async function invokeResearchAgent(query: string): Promise<void> {
  try {
    // Dynamic import to avoid circular dependency with the sub-agent system
    const { executeResearchEvidence } = await import(
      '@/lib/agents/subagents/research-evidence'
    )

    const result = await executeResearchEvidence(
      { research_question: query },
      {
        psychologistId: 'system',
        sessionId: 'academic-trigger',
        academicReferences: [],
      },
    )

    logger.info('Academic trigger: research agent completed', {
      query,
      resultName: result.name,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn('Academic trigger: research agent invocation failed', {
      query,
      error: errorMessage,
    })
  }
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

/**
 * Builds a research query string from a knowledge graph node.
 * Combines node type, label, and semantic tags for specificity.
 */
function buildResearchQuery(node: KnowledgeGraphNode): string {
  const base = `${node.nodeType}: ${node.label}`
  const tags = node.ontology.semanticTags.slice(0, 3).join(', ')
  const domainQualifier = `dominio ${node.ontology.domain}`

  return tags.length > 0
    ? `${base} (${tags}) — ${domainQualifier}`
    : `${base} — ${domainQualifier}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of the academic trigger evaluation.
 */
export interface AcademicTriggerResult {
  /** Whether the compound gate was satisfied. */
  triggered: boolean
  /** Reason for the decision (for logging/auditing). */
  reason: string
}

/**
 * Evaluates whether a clinical pattern warrants academic cross-referencing.
 *
 * Implements Pipeline Step 4 (Academic Trigger):
 * - Compound gate: confidence > 0.8 AND sourceSessionIds.length >= 2
 * - If TRUE: invokes the research agent in fire-and-forget mode.
 * - If FALSE: returns immediately with reason for rejection.
 *
 * The fire-and-forget pattern ensures this function returns instantly
 * regardless of the research agent's execution time.
 *
 * @param patternNode     - The knowledge graph node to evaluate.
 * @param sourceSessionIds - Session IDs that mentioned this pattern.
 * @returns Trigger evaluation result (synchronous return, async side-effect).
 */
export function evaluateAcademicTrigger(
  patternNode: KnowledgeGraphNode,
  sourceSessionIds: string[],
): AcademicTriggerResult {
  // Gate 1: Confidence threshold
  if (patternNode.confidence <= CONFIDENCE_THRESHOLD) {
    logger.debug('Academic trigger: below confidence threshold', {
      nodeId: patternNode.nodeId,
      confidence: patternNode.confidence,
      threshold: CONFIDENCE_THRESHOLD,
    })
    return {
      triggered: false,
      reason: `confidence ${patternNode.confidence} <= ${CONFIDENCE_THRESHOLD}`,
    }
  }

  // Gate 2: Minimum session count
  const uniqueSessions = new Set(sourceSessionIds)
  if (uniqueSessions.size < MIN_SESSION_COUNT) {
    logger.debug('Academic trigger: insufficient session coverage', {
      nodeId: patternNode.nodeId,
      sessionCount: uniqueSessions.size,
      minRequired: MIN_SESSION_COUNT,
    })
    return {
      triggered: false,
      reason: `sessions ${uniqueSessions.size} < ${MIN_SESSION_COUNT}`,
    }
  }

  // Both gates passed — fire research agent (no await)
  const query = buildResearchQuery(patternNode)

  logger.info('Academic trigger: FIRED', {
    nodeId: patternNode.nodeId,
    label: patternNode.label,
    confidence: patternNode.confidence,
    sessionCount: uniqueSessions.size,
    query,
  })

  // Fire-and-forget: intentionally not awaited
  void invokeResearchAgent(query)

  return {
    triggered: true,
    reason: `confidence ${patternNode.confidence} > ${CONFIDENCE_THRESHOLD} AND sessions ${uniqueSessions.size} >= ${MIN_SESSION_COUNT}`,
  }
}
