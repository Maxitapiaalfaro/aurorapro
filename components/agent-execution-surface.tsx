"use client"

/**
 * <AgentExecutionSurface>
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical composition shell for the agent-transparency subsystem.
 *
 * This is the single public entry point consumed by feature code
 * (e.g. `chat-interface.tsx`). Internally it composes `AgenticTransparencyFlow`
 * (the timeline / steps / sources surface) and—over the next phases of the
 * redesign—will additionally compose reasoning-trace, artifact-first, and
 * cancellation affordances behind this same API.
 *
 * Call sites MUST prefer this shell over importing `AgenticTransparencyFlow`
 * directly; that keeps future structural changes (new SSE events, new panels,
 * layout re-organisation) to a single file.
 *
 * Two modes, one component:
 *   - `mode="live"`     → streaming, expanded by default, supports `onCancel`.
 *   - `mode="historical"` → collapsed by default, read-only snapshot.
 */

import * as React from 'react'
import { AgenticTransparencyFlow } from '@/components/agentic-transparency-flow'
import type { ExecutionTimeline } from '@/types/clinical-types'
import { cn } from '@/lib/utils'

export interface AgentExecutionSurfaceProps {
  /** Persisted (historical) or live-built execution timeline. */
  timeline: ExecutionTimeline
  /**
   * `live` — streaming run, expanded, cancel button visible when `onCancel` is set.
   * `historical` — persisted message, collapsed, read-only.
   */
  mode: 'live' | 'historical'
  /**
   * Abort handler. Only meaningful when `mode="live"`. When omitted, no Stop
   * button is shown (the underlying surface already guards on this).
   */
  onCancel?: () => void
  className?: string
}

export function AgentExecutionSurface({
  timeline,
  mode,
  onCancel,
  className,
}: AgentExecutionSurfaceProps) {
  return (
    <div className={cn('w-full', className)}>
      <AgenticTransparencyFlow
        timeline={timeline}
        defaultCollapsed={mode === 'historical'}
        onCancel={mode === 'live' ? onCancel : undefined}
      />
    </div>
  )
}
