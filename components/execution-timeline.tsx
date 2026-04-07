"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight, Loader2, ExternalLink, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import type { ExecutionTimeline as ExecutionTimelineType, ExecutionStep, AcademicSourceReference } from '@/types/clinical-types'

/**
 * Small elapsed-time counter rendered next to active (in-progress) steps.
 * Provides continuous visual feedback so the user never thinks the UI froze.
 */
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [])
  return (
    <span className="text-[10px] text-muted-foreground/50 ml-auto tabular-nums flex-shrink-0">
      {elapsed}s
    </span>
  )
}

interface ExecutionTimelineProps {
  timeline: ExecutionTimelineType
  className?: string
  /** Start collapsed (default true for historical messages) */
  defaultCollapsed?: boolean
}

/**
 * Persistent Execution Timeline
 *
 * Renders a sequence of independent, collapsible items — one per
 * discrete step in the agent's execution pipeline.
 *
 * - Completed steps display a ✓ icon and are collapsed by default.
 * - Active steps (live mode) display a spinner.
 * - Steps with a `detail` field get an expand/collapse toggle.
 * - Steps without `detail` have no toggle (simple action statements).
 *
 * The component is designed to be:
 * 1. Used **during** streaming (fed a live timeline built from processingStatus).
 * 2. **Persisted** on the ChatMessage and rendered in history.
 */
export function ExecutionTimeline({
  timeline,
  className,
  defaultCollapsed = true
}: ExecutionTimelineProps) {
  const agentConfig = getAgentVisualConfig(timeline.agentType)

  if (!timeline.steps || timeline.steps.length === 0) {
    return null
  }

  const summaryParts: string[] = []
  const toolSteps = timeline.steps.filter(s => !!s.toolName)
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
    <div className={cn("space-y-1", className)}>
      {/* Agent header line */}
      <div className="flex items-center gap-1.5 px-1 py-0.5">
        <span className={cn("text-[11px] font-semibold", agentConfig.textColor)}>
          {timeline.agentDisplayName}
        </span>
        {summaryText && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {summaryText}
          </span>
        )}
      </div>

      {/* Sequential independent items */}
      <ul className="space-y-1">
        {timeline.steps.map((step) => (
          <TimelineStepItem key={step.id} step={step} defaultCollapsed={defaultCollapsed} />
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual step item – each step is its own independent accordion
// ---------------------------------------------------------------------------

function TimelineStepItem({ step, defaultCollapsed }: { step: ExecutionStep; defaultCollapsed: boolean }) {
  // Build the detail string to show inside the expanded area
  const detailText = buildDetailText(step)
  const hasSources = step.sources && step.sources.length > 0
  const hasProgressSteps = step.progressSteps && step.progressSteps.length > 0
  const hasExpandableContent = !!detailText || hasSources
  const [isOpen, setIsOpen] = useState(!defaultCollapsed && step.status === 'active')

  // Auto-collapse when a step transitions from active → completed
  const prevStatusRef = useRef(step.status)
  useEffect(() => {
    if (prevStatusRef.current === 'active' && step.status !== 'active') {
      setIsOpen(false)
    }
    prevStatusRef.current = step.status
  }, [step.status])

  const icon = step.status === 'active'
    ? <Loader2 className="w-3 h-3 animate-spin text-clarity-blue-500 flex-shrink-0" />
    : step.status === 'error'
      ? <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
      : <CheckCircle className="w-3 h-3 text-serene-teal-500/70 flex-shrink-0" />

  // Steps with progress sub-items OR expandable detail get the bordered container
  if (!hasProgressSteps && !hasExpandableContent) {
    // Simple action statement — no sub-items, no toggle
    return (
      <motion.li
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground leading-relaxed",
          step.status === 'active' && "bg-secondary/40"
        )}
      >
        <div className="flex-shrink-0">{icon}</div>
        <span className={step.status === 'active' ? 'animate-pulse' : ''}>{step.label}</span>
        {step.status === 'active' && <ElapsedTimer />}
      </motion.li>
    )
  }

  // Tool step with progress sub-items and/or expandable detail
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "rounded-md border border-border/40 bg-secondary/20 overflow-hidden",
        step.status === 'active' && "border-clarity-blue-500/30 bg-secondary/30"
      )}
    >
      {/* Main label row — clickable if there's expandable detail */}
      {hasExpandableContent ? (
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-secondary/40 transition-colors"
        >
          <div className="flex-shrink-0">{icon}</div>
          <span className={cn(
            "text-[11px] text-muted-foreground leading-relaxed flex-1 min-w-0 truncate",
            step.status === 'active' && "animate-pulse"
          )}>
            {step.label}
          </span>
          {step.status === 'active' && <ElapsedTimer />}
          {isOpen
            ? <ChevronDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
          }
        </button>
      ) : (
        <div className="flex items-center gap-1.5 px-2 py-1">
          <div className="flex-shrink-0">{icon}</div>
          <span className={cn(
            "text-[11px] text-muted-foreground leading-relaxed flex-1 min-w-0 truncate",
            step.status === 'active' && "animate-pulse"
          )}>
            {step.label}
          </span>
          {step.status === 'active' && <ElapsedTimer />}
        </div>
      )}

      {/* Progress sub-steps — always visible (not collapsible) */}
      {hasProgressSteps && (
        <ProgressStepsList
          steps={step.progressSteps!}
          isActive={step.status === 'active'}
        />
      )}

      {/* Expandable detail section (collapsed by default for historical) */}
      <AnimatePresence>
        {isOpen && hasExpandableContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-1.5 pt-0.5 pl-7 text-[10px] text-muted-foreground/70 leading-relaxed">
              {detailText && <div>{detailText}</div>}
              {hasSources && <SourcesList sources={step.sources!} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

// ---------------------------------------------------------------------------
// Progress sub-steps – rendered inline under the tool label (always visible)
// ---------------------------------------------------------------------------

function ProgressStepsList({ steps, isActive }: { steps: string[]; isActive: boolean }) {
  return (
    <div className="px-2 pb-1.5 pl-7 space-y-0.5">
      {steps.map((msg, idx) => {
        const isLast = idx === steps.length - 1
        const isCurrentStep = isActive && isLast
        return (
          <motion.div
            key={`${idx}-${msg}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.12, delay: 0.02 }}
            className="flex items-center gap-1.5"
          >
            {isCurrentStep ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin text-clarity-blue-500/70 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-2.5 h-2.5 text-serene-teal-500/50 flex-shrink-0" />
            )}
            <span className={cn(
              "text-[10px] leading-relaxed",
              isCurrentStep
                ? "text-muted-foreground/80 animate-pulse"
                : "text-muted-foreground/60"
            )}>
              {msg}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

function buildDetailText(step: ExecutionStep): string | null {
  const parts: string[] = []
  if (step.detail) parts.push(step.detail)
  if (step.result) {
    if (step.result.sourcesFound != null && step.result.sourcesValidated != null) {
      parts.push(`${step.result.sourcesValidated}/${step.result.sourcesFound} fuentes validadas`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

// ---------------------------------------------------------------------------
// Academic Sources List – renders validated sources from Parallel AI
// ---------------------------------------------------------------------------

function SourcesList({ sources }: { sources: AcademicSourceReference[] }) {
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80">
        <BookOpen className="w-3 h-3" />
        <span>Fuentes académicas validadas ({sources.length})</span>
      </div>
      <ul className="space-y-0.5">
        {sources.map((source, idx) => (
          <li key={idx} className="flex items-start gap-1 text-[10px] text-muted-foreground/70">
            <span className="text-muted-foreground/40 flex-shrink-0 mt-px">{idx + 1}.</span>
            <div className="min-w-0 flex-1">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-clarity-blue-500 hover:underline inline-flex items-center gap-0.5 leading-tight"
              >
                <span className="line-clamp-2">{source.title}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
              {(source.authors || source.year || source.journal) && (
                <div className="text-[9px] text-muted-foreground/50 mt-0.5">
                  {[
                    source.authors,
                    source.year ? `(${source.year})` : null,
                    source.journal
                  ].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
