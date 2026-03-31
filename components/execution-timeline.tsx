"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import type { ExecutionTimeline as ExecutionTimelineType, ExecutionStep } from '@/types/clinical-types'

interface ExecutionTimelineProps {
  timeline: ExecutionTimelineType
  className?: string
  /** Start collapsed (default true for historical messages) */
  defaultCollapsed?: boolean
}

/**
 * Persistent Execution Timeline
 *
 * Renders a hierarchical, collapsed-by-default summary of the AI's
 * execution pipeline for a completed message turn.
 *
 * Level 1 (Parent): Agent name + step count summary
 * Level 2 (Children): Individual execution steps (routing, tool calls, etc.)
 *
 * This component is meant to be stored as part of the ChatMessage and
 * rendered permanently above the Markdown response, NOT as an ephemeral
 * loading indicator.
 */
export function ExecutionTimeline({
  timeline,
  className,
  defaultCollapsed = true
}: ExecutionTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed)
  const agentConfig = getAgentVisualConfig(timeline.agentType)

  if (!timeline.steps || timeline.steps.length === 0) {
    return null
  }

  const errorCount = timeline.steps.filter(s => s.status === 'error').length
  const toolSteps = timeline.steps.filter(s => !!s.toolName)

  // Build compact summary text
  const summaryParts: string[] = []
  if (toolSteps.length > 0) {
    summaryParts.push(`${toolSteps.length} herramienta${toolSteps.length !== 1 ? 's' : ''}`)
  }
  const totalSources = toolSteps.reduce((sum, s) => sum + (s.result?.sourcesValidated ?? 0), 0)
  if (totalSources > 0) {
    summaryParts.push(`${totalSources} fuente${totalSources !== 1 ? 's' : ''}`)
  }
  if (timeline.durationMs && timeline.durationMs > 0) {
    summaryParts.push(`${(timeline.durationMs / 1000).toFixed(1)}s`)
  }
  const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : ''

  return (
    <div className={cn("rounded-lg border border-border/40 bg-secondary/20 overflow-hidden", className)}>
      {/* Level 1: Parent – Agent + summary */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isExpanded
            ? <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
          }
          <span className={cn("text-[11px] font-semibold", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
          {errorCount > 0 && (
            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          )}
        </div>

        {summaryText && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
            {summaryText}
          </span>
        )}
      </button>

      {/* Level 2: Children – Individual steps */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <ul className="px-3 pb-2 space-y-0.5 border-t border-border/30 pt-1.5">
              {timeline.steps.map((step) => (
                <TimelineStep key={step.id} step={step} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TimelineStep({ step }: { step: ExecutionStep }) {
  const icon = step.status === 'error'
    ? <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
    : <CheckCircle className="w-3 h-3 text-serene-teal-500/70 flex-shrink-0" />

  return (
    <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
      <div className="mt-[3px]">{icon}</div>
      <span>{step.label}</span>
      {step.result && step.result.sourcesValidated != null && (
        <span className="text-[10px] text-muted-foreground/50 ml-auto flex-shrink-0">
          {step.result.sourcesValidated}/{step.result.sourcesFound ?? '?'}
        </span>
      )}
    </li>
  )
}
