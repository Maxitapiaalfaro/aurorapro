/**
 * Agent Events (SSE vocabulary v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical, typed event vocabulary for the agent-transparency SSE stream.
 *
 * Design constraints (from [tasks/agent-transparency-redesign.md § 4](../tasks/agent-transparency-redesign.md)):
 *  - Additive only. The legacy v1 union (`bullet | agent_selected | tool_execution |
 *    processing_step | chunk | document_preview | document_ready | response |
 *    error | complete`) remains valid; these new types extend it.
 *  - Every event carries `turnId` so the UI can reconcile concurrent turns.
 *  - Every event is serialisable (no `Date`, no functions); timestamps are
 *    epoch-ms numbers. This keeps the wire format stable across server/client
 *    and survives `JSON.stringify` in Firestore persistence.
 *  - Every event kind MUST have a humanized label in `lib/humanized-steps.ts`.
 *    This invariant is enforced by the unit test
 *    `tests/agent-event-vocabulary.test.ts`.
 */

import type { AcademicSourceReference, CheckpointRequest } from './clinical-types'
import type { RoutingDecision } from './operational-metadata'

// ─── Turn lifecycle ──────────────────────────────────────────────────────────

export interface TurnStartedEvent {
  type: 'turn_started'
  turnId: string
  /** Epoch ms */
  startedAt: number
  userMessageId: string
}

/**
 * Plan emitted at the beginning of a turn. Fixes D12 (progress denominator is
 * unknown until now) by giving the UI a stable list of anticipated steps.
 */
export interface PlanEvent {
  type: 'plan'
  turnId: string
  plannedSteps: Array<{
    id: string
    /** Coarse category — drives the step icon */
    kind: 'routing' | 'thinking' | 'tool' | 'synthesis' | 'checkpoint'
    label: string
  }>
}

export interface TurnCompletedEvent {
  type: 'turn_completed'
  turnId: string
  durationMs: number
  /** `cancelled` ≠ `error` on purpose (P4) */
  outcome: 'success' | 'error' | 'cancelled' | 'partial'
  /** Optional short summary to show in the collapsed historical state */
  summary?: string
}

// ─── Routing (replaces the free-text reasoning string in `agent_selected`) ──

export interface RoutingDecisionEvent {
  type: 'routing_decision'
  turnId: string
  decision: RoutingDecision
  alternatives: Array<{ agent: string; confidence: number }>
  /** When true, the UI renders a "Cambiar especialista" override affordance (P6) */
  contestable: boolean
}

// ─── Thinking — emitted ONLY when `thinkingConfig` is enabled ───────────────

export interface ThinkingStartedEvent {
  type: 'thinking_started'
  turnId: string
  stepId: string
  /** Exact model id (e.g. `gemini-2.5-pro`) so users see what actually thought */
  model: string
  /** Matches Gemini thinking budget tiers; the UI surfaces this verbatim */
  level: 'low' | 'medium' | 'high'
}

export interface ThinkingDeltaEvent {
  type: 'thinking_delta'
  turnId: string
  stepId: string
  /** Partial reasoning text. May be a summary or a raw trace slice. */
  delta: string
  /** When true, `delta` is a summary chunk (safe to show by default). */
  isSummary: boolean
}

export interface ThinkingCompletedEvent {
  type: 'thinking_completed'
  turnId: string
  stepId: string
  durationMs: number
  /** Reasoning tokens consumed (when reported by the model) */
  tokenCount?: number
}

// ─── Tool lifecycle (extends v1 `tool_execution` with richer state) ─────────

/** First-class tool lifecycle states (P4). Amber states (`retry`, `fallback`,
 *  `partial`, `timeout`, `rejected_by_policy`) drive a distinct amber UI so
 *  non-fatal issues are not conflated with hard errors. */
export type ToolLifecycleStatus =
  | 'planned'
  | 'started'
  | 'progress'
  | 'retry'
  | 'fallback'
  | 'partial'
  | 'completed'
  | 'timeout'
  | 'error'
  | 'rejected_by_policy'

/** Scope of data the tool touches. Drives the PHI badge (P5 / D11). */
export type ToolScope = 'phi' | 'literature' | 'system'

export interface ToolLifecycleEvent {
  type: 'tool_lifecycle'
  turnId: string
  tool: {
    id: string
    toolName: string
    displayName: string
    query?: string
    status: ToolLifecycleStatus
    /** Epoch ms */
    timestamp: number
    /** 1-based. `maxAttempts` is the policy ceiling. */
    attempt: number
    maxAttempts: number
    /** Stable group id so the UI can cluster concurrent tools as a swarm */
    parallelGroupId?: string
    scope: ToolScope
    progressMessage?: string
    progressSteps?: string[]
    completionDetail?: string
    result?: {
      sourcesFound?: number
      sourcesAccepted?: number
      sourcesRejected?: Array<{ id: string; reason: string }>
    }
  }
}

// ─── Provenance (P7, D4) ─────────────────────────────────────────────────────

export interface SourceValidatedEvent {
  type: 'source_validated'
  turnId: string
  source: AcademicSourceReference & {
    /** `accepted` / `rejected` / `pending` — mirrors the validation pipeline */
    validationStatus: 'accepted' | 'rejected' | 'pending'
    /** 0..1. Drives the inline ranking in `<SourcesChipRow>`. */
    relevanceScore: number
    /** Populated when `validationStatus === 'rejected'` */
    rejectionReason?: string
    /** The tool call that produced this source (for provenance drill-down) */
    fromToolId: string
  }
}

/**
 * Links a specific span of the final answer to the source(s) that support it.
 * Enables inline `[n]` markers in the bubble body (P2, fixes D4).
 */
export interface CitationSpanEvent {
  type: 'citation_span'
  turnId: string
  /** Opaque id stable across re-renders — the UI uses this to highlight on hover */
  claimId: string
  sourceIds: string[]
  /** Character offsets into the accumulated response markdown */
  startOffset: number
  endOffset: number
}

// ─── Checkpoint (D6 / P9) — destructive actions as first-class timeline rows ─

export interface CheckpointRequestedEvent {
  type: 'checkpoint_requested'
  turnId: string
  checkpoint: CheckpointRequest
}

export interface CheckpointResolvedEvent {
  type: 'checkpoint_resolved'
  turnId: string
  checkpointId: string
  resolution: 'confirmed' | 'cancelled' | 'expired'
  /** User id that resolved the checkpoint — required for the audit row */
  actorId: string
  /** Epoch ms */
  resolvedAt: number
}

// ─── Non-fatal warnings (P4, D7) — amber, not red ───────────────────────────

export interface NonFatalWarningEvent {
  type: 'non_fatal_warning'
  turnId: string
  /** Machine-readable code; must have a humanized label */
  code: NonFatalWarningCode
  /** Server-provided context; fallback used if empty */
  message: string
  /** Optional back-reference to the step that triggered the warning */
  affectedStepId?: string
}

/** Enumerated non-fatal warning codes. Extend here + in humanized-steps in the
 *  same PR so the CI invariant never drifts. */
export const NON_FATAL_WARNING_CODES = [
  'tool_retry',
  'tool_fallback',
  'tool_partial_result',
  'tool_timeout',
  'tool_rejected_by_policy',
  'source_rejected_irrelevant',
  'source_rejected_low_quality',
  'thinking_budget_exceeded',
  'checkpoint_expired',
] as const
export type NonFatalWarningCode = (typeof NON_FATAL_WARNING_CODES)[number]

// ─── Aggregate discriminated union ──────────────────────────────────────────

export type AgentEventV2 =
  | TurnStartedEvent
  | PlanEvent
  | TurnCompletedEvent
  | RoutingDecisionEvent
  | ThinkingStartedEvent
  | ThinkingDeltaEvent
  | ThinkingCompletedEvent
  | ToolLifecycleEvent
  | SourceValidatedEvent
  | CitationSpanEvent
  | CheckpointRequestedEvent
  | CheckpointResolvedEvent
  | NonFatalWarningEvent

/** All v2 event kinds. Ordered to match the union above. */
export const AGENT_EVENT_KINDS = [
  'turn_started',
  'plan',
  'turn_completed',
  'routing_decision',
  'thinking_started',
  'thinking_delta',
  'thinking_completed',
  'tool_lifecycle',
  'source_validated',
  'citation_span',
  'checkpoint_requested',
  'checkpoint_resolved',
  'non_fatal_warning',
] as const
export type AgentEventKind = (typeof AGENT_EVENT_KINDS)[number]

/** Compile-time check: union kinds == literal array. If a new event is added
 *  to `AgentEventV2` but forgotten in `AGENT_EVENT_KINDS`, TS errors here. */
// prettier-ignore
type _AgentEventExhaustive =
  Exclude<AgentEventV2['type'], AgentEventKind> extends never ? true : false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _agentEventExhaustive: _AgentEventExhaustive = true
