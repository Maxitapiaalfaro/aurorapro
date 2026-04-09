"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader2, AlertCircle, ChevronDown, ChevronRight, ExternalLink, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import { humanizeStepLabel, calculateProgress } from '@/lib/humanized-steps'
import type { ExecutionTimeline as ExecutionTimelineType, ExecutionStep, AcademicSourceReference } from '@/types/clinical-types'

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum character length for inline detail display; longer details go into the expandable section. */
const INLINE_DETAIL_MAX_LENGTH = 40

/** Format milliseconds as a readable seconds string (e.g. "1.2s"). */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Elapsed Timer ─────────────────────────────────────────────────────────
function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="text-[10px] text-muted-foreground/50 tabular-nums flex-shrink-0">
      {elapsed}s
    </span>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────
interface AgenticTransparencyFlowProps {
  timeline: ExecutionTimelineType
  className?: string
  /** Collapsed by default for historical messages */
  defaultCollapsed?: boolean
}

/**
 * Agentic Transparency Flow
 *
 * Elegant, progressive disclosure component that visualizes the AI agent's
 * execution pipeline with human-readable labels and smooth transitions.
 *
 * - **Live mode** (`defaultCollapsed=false`): progress bar + expanding step list.
 * - **Historical mode** (`defaultCollapsed=true`): compact summary, expandable.
 */
export function AgenticTransparencyFlow({
  timeline,
  className,
  defaultCollapsed = true,
}: AgenticTransparencyFlowProps) {
  const agentConfig = getAgentVisualConfig(timeline.agentType)
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed)

  if (!timeline.steps || timeline.steps.length === 0) return null

  const progress = calculateProgress(timeline.steps)
  const completedCount = timeline.steps.filter(s => s.status === 'completed').length
  const hasActiveStep = timeline.steps.some(s => s.status === 'active')
  const isLive = !defaultCollapsed || hasActiveStep

  // Summary text for collapsed view
  const summaryParts: string[] = []
  summaryParts.push(`${completedCount} paso${completedCount !== 1 ? 's' : ''}`)
  const toolSteps = timeline.steps.filter(s => !!s.toolName)
  if (toolSteps.length > 0) {
    const totalSources = toolSteps.reduce((sum, s) => sum + (s.result?.sourcesValidated ?? 0), 0)
    if (totalSources > 0) {
      summaryParts.push(`${totalSources} fuente${totalSources !== 1 ? 's' : ''}`)
    }
  }
  if (timeline.durationMs && timeline.durationMs > 0) {
    summaryParts.push(formatDuration(timeline.durationMs))
  }

  return (
    <div className={cn("overflow-hidden rounded-md", className)}>
      {/* ── Progress bar ────────────────────────────────────────── */}
      <ProgressBar progress={progress} isLive={isLive} agentType={timeline.agentType} />

      {/* ── Historical collapsed header ────────────────────────── */}
      {defaultCollapsed && !hasActiveStep && (
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/30 transition-colors"
        >
          {/* Mini stepper dots */}
          <div className="flex items-center gap-[3px]">
            {timeline.steps.slice(0, 8).map((step) => (
              <div
                key={step.id}
                className={cn(
                  "w-[5px] h-[5px] rounded-full transition-colors",
                  step.status === 'completed'
                    ? 'bg-serene-teal-500/60'
                    : step.status === 'error'
                      ? 'bg-red-400/60'
                      : 'bg-muted-foreground/20',
                )}
              />
            ))}
            {timeline.steps.length > 8 && (
              <span className="text-[8px] text-muted-foreground/40 ml-0.5">
                +{timeline.steps.length - 8}
              </span>
            )}
          </div>

          <span className={cn("text-[11px] font-medium", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {summaryParts.join(' · ')}
          </span>
          {isExpanded
            ? <ChevronDown className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
          }
        </button>
      )}

      {/* ── Live mode agent name ───────────────────────────────── */}
      {isLive && (
        <div className="flex items-center gap-1.5 px-3 py-1">
          <span className={cn("text-[11px] font-semibold", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
        </div>
      )}

      {/* ── Step list ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {(isLive || isExpanded) && (
          <motion.div
            initial={defaultCollapsed ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <ul className="px-2 pb-2 space-y-0.5">
              {timeline.steps.map((step, idx) => (
                <TransparencyStepItem
                  key={step.id}
                  step={step}
                  index={idx}
                  isLive={isLive}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Progress Bar ──────────────────────────────────────────────────────────

function ProgressBar({
  progress,
  isLive,
  agentType,
}: {
  progress: number
  isLive: boolean
  agentType: string
}) {
  const agentConfig = getAgentVisualConfig(agentType as import('@/types/clinical-types').AgentType)

  return (
    <div className="h-[2px] w-full bg-border/20 overflow-hidden">
      <motion.div
        className={cn("h-full rounded-full", agentConfig.typingDotColor)}
        initial={{ width: '0%' }}
        animate={{ width: `${progress}%` }}
        transition={{
          duration: 0.8,
          ease: [0.25, 0.46, 0.45, 0.94], // ease-out-quad
        }}
      />
    </div>
  )
}

// ─── Step Item ─────────────────────────────────────────────────────────────

function TransparencyStepItem({
  step,
  index,
  isLive,
}: {
  step: ExecutionStep
  index: number
  isLive: boolean
}) {
  const humanLabel = humanizeStepLabel(step)
  const hasSources = step.sources && step.sources.length > 0
  const hasProgressSteps = step.progressSteps && step.progressSteps.length > 0
  const hasExpandableContent = hasSources || hasProgressSteps || (step.detail && step.detail.length > INLINE_DETAIL_MAX_LENGTH)
  const [isOpen, setIsOpen] = useState(false)

  // Auto-collapse when a step transitions active → completed
  const prevStatusRef = useRef(step.status)
  useEffect(() => {
    if (prevStatusRef.current === 'active' && step.status !== 'active') {
      setIsOpen(false)
    }
    prevStatusRef.current = step.status
  }, [step.status])

  const icon =
    step.status === 'active' ? (
      <Loader2 className="w-3 h-3 animate-spin text-clarity-blue-500 flex-shrink-0" />
    ) : step.status === 'error' ? (
      <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
    ) : (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      >
        <Check className="w-3 h-3 text-serene-teal-500/70 flex-shrink-0" />
      </motion.div>
    )

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: isLive ? index * 0.04 : 0,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="group"
    >
      {/* ── Main row ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed transition-colors",
          step.status === 'active' && 'bg-secondary/40',
          hasExpandableContent && 'cursor-pointer hover:bg-secondary/30',
        )}
        onClick={hasExpandableContent ? () => setIsOpen(prev => !prev) : undefined}
        role={hasExpandableContent ? 'button' : undefined}
      >
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          {icon}
        </div>

        <span
          className={cn(
            'flex-1 min-w-0 truncate',
            step.status === 'active'
              ? 'text-foreground/90 font-medium'
              : 'text-muted-foreground/70',
          )}
        >
          {humanLabel}
          {/* Short inline detail */}
          {step.detail && step.status === 'completed' && step.detail.length <= INLINE_DETAIL_MAX_LENGTH && (
            <span className="text-[10px] text-muted-foreground/40 ml-1.5">
              — {step.detail}
            </span>
          )}
        </span>

        {step.status === 'active' && <ElapsedTimer />}
        {step.status === 'completed' && step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground/30 tabular-nums flex-shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}

        {hasExpandableContent && (
          isOpen
            ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
            : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* ── Progress sub-steps (visible while active) ─────────── */}
      {hasProgressSteps && step.status === 'active' && (
        <ProgressSubSteps steps={step.progressSteps!} />
      )}

      {/* ── Expandable detail ──────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-1 pl-7 space-y-1">
              {step.detail && step.detail.length > INLINE_DETAIL_MAX_LENGTH && (
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  {step.detail}
                </p>
              )}
              {hasProgressSteps && step.status === 'completed' && (
                <ProgressSubSteps steps={step.progressSteps!} allCompleted />
              )}
              {hasSources && <SourcesList sources={step.sources!} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

// ─── Progress Sub-Steps ────────────────────────────────────────────────────

function ProgressSubSteps({
  steps,
  allCompleted = false,
}: {
  steps: string[]
  allCompleted?: boolean
}) {
  return (
    <div className="px-2 pb-1 pl-7 space-y-px">
      {steps.map((msg, idx) => {
        const isLast = idx === steps.length - 1
        const isActive = !allCompleted && isLast
        return (
          <motion.div
            key={`${idx}-${msg}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            {isActive ? (
              <Loader2 className="w-2 h-2 animate-spin text-clarity-blue-500/60 flex-shrink-0" />
            ) : (
              <Check className="w-2 h-2 text-serene-teal-500/40 flex-shrink-0" />
            )}
            <span
              className={cn(
                'text-[9px] leading-relaxed',
                isActive ? 'text-muted-foreground/70' : 'text-muted-foreground/40',
              )}
            >
              {msg}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Academic Sources ──────────────────────────────────────────────────────

function SourcesList({ sources }: { sources: AcademicSourceReference[] }) {
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground/50">
        <BookOpen className="w-2.5 h-2.5" />
        <span>Fuentes académicas ({sources.length})</span>
      </div>
      <ul className="space-y-0.5">
        {sources.map((source, idx) => (
          <li key={idx} className="flex items-start gap-1 text-[9px] text-muted-foreground/50">
            <span className="text-muted-foreground/30 flex-shrink-0 mt-px">{idx + 1}.</span>
            <div className="min-w-0 flex-1">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-clarity-blue-500/80 hover:underline inline-flex items-center gap-0.5 leading-tight"
              >
                <span className="line-clamp-1">{source.title}</span>
                <ExternalLink className="w-2 h-2 flex-shrink-0" />
              </a>
              {(source.authors || source.year || source.journal) && (
                <div className="text-[8px] text-muted-foreground/40 mt-0.5">
                  {[
                    source.authors,
                    source.year ? `(${source.year})` : null,
                    source.journal,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
