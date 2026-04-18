/**
 * Agent-event vocabulary v2 — CI invariant.
 *
 * Every SSE event kind MUST have a humanized label. Every `RoutingReason` and
 * every `NonFatalWarningCode` MUST have a humanized label. This test is the
 * enforcement point for that contract.
 *
 * If you add a new event kind / routing reason / warning code and forget to
 * update `lib/humanized-steps.ts`, this test fails.
 */
import { describe, it, expect } from 'vitest'
import {
  AGENT_EVENT_KINDS,
  NON_FATAL_WARNING_CODES,
} from '@/types/agent-events'
import { RoutingReason } from '@/types/operational-metadata'
import {
  AGENT_EVENT_LABELS,
  ROUTING_REASON_LABELS,
  NON_FATAL_WARNING_LABELS,
  humanizeAgentEvent,
  humanizeRoutingReason,
  humanizeNonFatalWarning,
} from '@/lib/humanized-steps'

describe('Agent-event vocabulary invariants', () => {
  it('every v2 event kind has a non-empty humanized label', () => {
    for (const kind of AGENT_EVENT_KINDS) {
      const label = AGENT_EVENT_LABELS[kind]
      expect(label, `missing label for event kind "${kind}"`).toBeTruthy()
      expect(label.trim().length, `empty label for event kind "${kind}"`).toBeGreaterThan(0)
      expect(humanizeAgentEvent(kind)).toBe(label)
    }
  })

  it('the label registry does not carry stale keys outside AGENT_EVENT_KINDS', () => {
    const known = new Set<string>(AGENT_EVENT_KINDS)
    for (const key of Object.keys(AGENT_EVENT_LABELS)) {
      expect(known.has(key), `stale label key "${key}" not in AGENT_EVENT_KINDS`).toBe(true)
    }
    expect(Object.keys(AGENT_EVENT_LABELS).length).toBe(AGENT_EVENT_KINDS.length)
  })

  it('every RoutingReason enum value has a non-empty humanized label', () => {
    const reasons = Object.values(RoutingReason) as RoutingReason[]
    for (const reason of reasons) {
      const label = ROUTING_REASON_LABELS[reason]
      expect(label, `missing label for RoutingReason "${reason}"`).toBeTruthy()
      expect(label.trim().length).toBeGreaterThan(0)
      expect(humanizeRoutingReason(reason)).toBe(label)
    }
  })

  it('every NonFatalWarningCode has a non-empty humanized label', () => {
    for (const code of NON_FATAL_WARNING_CODES) {
      const label = NON_FATAL_WARNING_LABELS[code]
      expect(label, `missing label for warning code "${code}"`).toBeTruthy()
      expect(label.trim().length).toBeGreaterThan(0)
      expect(humanizeNonFatalWarning(code)).toBe(label)
    }
  })
})
