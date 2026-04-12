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

/** Maximum height in pixels for the scrollable step list area to prevent infinite growth. */
const STEP_LIST_MAX_HEIGHT = 250

/** Maximum number of parallel lanes shown before batching into a summary. */
const PARALLEL_BATCH_THRESHOLD = 4

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
  const stepListRef = useRef<HTMLUListElement>(null)

  const stepsLength = timeline.steps?.length ?? 0
  const hasActiveStep = timeline.steps?.some(s => s.status === 'active') ?? false
  const isLive = !defaultCollapsed || hasActiveStep

  // Auto-scroll step list to bottom when new steps arrive in live mode
  useEffect(() => {
    if (isLive && stepListRef.current) {
      stepListRef.current.scrollTo({
        top: stepListRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [isLive, stepsLength])

  if (!timeline.steps || timeline.steps.length === 0) return null

  const progress = calculateProgress(timeline.steps)
  const completedCount = timeline.steps.filter(s => s.status === 'completed').length

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
          aria-expanded={isExpanded}
          aria-label={`${timeline.agentDisplayName} - ${completedCount} paso${completedCount !== 1 ? 's' : ''} completados`}
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
        <div className="flex items-center gap-1.5 px-3 py-1" role="status" aria-live="polite" aria-label="Procesamiento de IA en curso">
          <span className={cn("text-[11px] font-semibold", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
        </div>
      )}

      {/* ── Step list with smooth height transition ────────────── */}
      <AnimatePresence initial={false}>
        {(isLive || isExpanded) && (
          <motion.div
            initial={defaultCollapsed ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <ul
              ref={stepListRef}
              className="px-2 pb-2 space-y-0.5 overflow-y-auto scrollbar-thin"
              style={{ maxHeight: STEP_LIST_MAX_HEIGHT }}
            >
              {renderStepsWithParallelGroups(timeline.steps, isLive)}
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

// ─── Step Grouping Logic ───────────────────────────────────────────────────

/**
 * Renders timeline steps, grouping parallel tool executions into
 * a `ParallelToolLanes` component instead of rendering them sequentially.
 * Implements the batching protocol: >4 concurrent tools collapse into a summary.
 */
function renderStepsWithParallelGroups(steps: ExecutionStep[], isLive: boolean): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let i = 0

  while (i < steps.length) {
    const step = steps[i]

    // Check if this starts a parallel group
    if (step.parallelGroup) {
      const parallelSteps: ExecutionStep[] = [step]
      let j = i + 1
      while (j < steps.length && steps[j].parallelGroup) {
        parallelSteps.push(steps[j])
        j++
      }
      result.push(
        <ParallelToolLanes
          key={`parallel-${step.id}`}
          steps={parallelSteps}
          isLive={isLive}
          startIndex={i}
        />
      )
      i = j
    } else {
      result.push(
        <TransparencyStepItem
          key={step.id}
          step={step}
          index={i}
          isLive={isLive}
        />
      )
      i++
    }
  }

  return result
}

// ─── Parallel Tool Lanes ──────────────────────────────────────────────────

/**
 * Renders multiple concurrent tool executions as horizontal progress lanes.
 * When >4 tools are active, collapses into a batched summary expandable on demand.
 */
function ParallelToolLanes({
  steps,
  isLive,
  startIndex,
}: {
  steps: ExecutionStep[]
  isLive: boolean
  startIndex: number
}) {
  const [isBatchExpanded, setIsBatchExpanded] = useState(false)
  const shouldBatch = steps.length > PARALLEL_BATCH_THRESHOLD

  // Batching protocol: collapse into summary
  if (shouldBatch && !isBatchExpanded) {
    const activeCount = steps.filter(s => s.status === 'active').length
    const completedCount = steps.filter(s => s.status === 'completed').length
    return (
      <motion.li
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="group"
      >
        <button
          type="button"
          onClick={() => setIsBatchExpanded(true)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed hover:bg-secondary/30 transition-colors"
          aria-label={`${steps.length} comprobaciones en paralelo`}
        >
          <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
            {activeCount > 0 ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60 flex-shrink-0" />
            ) : (
              <Check className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
            )}
          </div>
          <span className="flex-1 min-w-0 truncate text-foreground/80 font-medium">
            {activeCount > 0
              ? `Ejecutando ${activeCount} comprobaciones clínicas…`
              : `${completedCount} comprobaciones completadas`
            }
          </span>
          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
        </button>
      </motion.li>
    )
  }

  return (
    <>
      {steps.map((step, idx) => (
        <ParallelLane
          key={step.id}
          step={step}
          index={startIndex + idx}
          isLive={isLive}
        />
      ))}
    </>
  )
}

/**
 * A single parallel lane: horizontal indeterminate progress bar + label.
 * Active lanes show an animated bar; completed lanes fade to muted state.
 */
function ParallelLane({
  step,
  index,
  isLive,
}: {
  step: ExecutionStep
  index: number
  isLive: boolean
}) {
  const humanLabel = humanizeStepLabel(step)
  const isActive = step.status === 'active'
  const isCompleted = step.status === 'completed'
  const isError = step.status === 'error'

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{
        opacity: isCompleted ? 0.5 : 1,
        y: 0,
      }}
      transition={{
        duration: 0.28,
        delay: isLive ? index * 0.03 : 0,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      layout
      className="space-y-1"
    >
      <div className="flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed">
        {/* Status icon */}
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          {isActive ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60 flex-shrink-0" />
          ) : isError ? (
            <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
          ) : (
            <Check className="w-3 h-3 text-muted-foreground/35 flex-shrink-0" />
          )}
        </div>

        {/* Label */}
        <span className={cn(
          'flex-1 min-w-0 truncate transition-colors duration-280',
          isActive ? 'text-foreground/80' : 'text-muted-foreground/45',
        )}>
          {humanLabel}
        </span>

        {/* Duration badge */}
        {isCompleted && step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground/25 tabular-nums flex-shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}
      </div>

      {/* Indeterminate progress bar for active lanes */}
      {isActive && (
        <div className="mx-2 ml-7 h-[2px] bg-muted-foreground/10 rounded-full overflow-hidden">
          <div className="h-full w-[25%] bg-muted-foreground/30 rounded-full animate-slide-right" />
        </div>
      )}
    </motion.li>
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

  const isActive = step.status === 'active'
  const isCompleted = step.status === 'completed'
  const isError = step.status === 'error'

  const icon =
    isActive ? (
      <div className="relative flex items-center justify-center">
        {/* Subtle glow behind active spinner */}
        <div className="absolute inset-0 bg-clarity-blue-500/20 rounded-full blur-[3px]" />
        <Loader2 className="relative w-3 h-3 animate-spin text-clarity-blue-500 flex-shrink-0" />
      </div>
    ) : isError ? (
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
      animate={{
        opacity: isCompleted ? 0.6 : 1,
        y: 0,
      }}
      transition={{
        duration: 0.3,
        delay: isLive ? index * 0.04 : 0,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      layout
      className="group"
    >
      {/* ── Main row ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed transition-all duration-300",
          isActive && 'bg-clarity-blue-500/[0.08]',
          isCompleted && 'bg-transparent',
          hasExpandableContent && 'cursor-pointer hover:bg-secondary/30',
        )}
        onClick={hasExpandableContent ? () => setIsOpen(prev => !prev) : undefined}
        role={hasExpandableContent ? 'button' : undefined}
        aria-expanded={hasExpandableContent ? isOpen : undefined}
        aria-label={hasExpandableContent ? `${humanLabel} - ${isOpen ? 'Expandido' : 'Contraído'}` : humanLabel}
      >
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          {icon}
        </div>

        <span
          className={cn(
            'flex-1 min-w-0 truncate transition-colors duration-300',
            isActive
              ? 'text-foreground font-medium'
              : isError
                ? 'text-red-400/70'
                : 'text-muted-foreground/50',
          )}
        >
          {humanLabel}
          {/* Short inline detail */}
          {step.detail && isCompleted && step.detail.length <= INLINE_DETAIL_MAX_LENGTH && (
            <span className="text-[10px] text-muted-foreground/30 ml-1.5">
              — {step.detail}
            </span>
          )}
        </span>

        {isActive && <ElapsedTimer />}
        {isCompleted && step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground/25 tabular-nums flex-shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}

        {hasExpandableContent && (
          isOpen
            ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0" />
            : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/30 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* ── Progress sub-steps: single crossfading line instead of stacking list ── */}
      {hasProgressSteps && isActive && (
        <CurrentSubStepLine steps={step.progressSteps!} />
      )}

      {/* ── Expandable detail ──────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-1 pl-7 space-y-1">
              {step.detail && step.detail.length > INLINE_DETAIL_MAX_LENGTH && (
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  {step.detail}
                </p>
              )}
              {hasProgressSteps && isCompleted && (
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

// ─── Current Sub-Step Line (Crossfade) ─────────────────────────────────────
/**
 * Instead of stacking every sub-step as a new row, this component shows only
 * the *current* sub-step text in a single line with a crossfade animation.
 * This avoids infinite vertical growth from low-level technical sub-steps
 * like "Conectando con Firestore", "Procesando embeddings", etc.
 */
function CurrentSubStepLine({ steps }: { steps: string[] }) {
  const current = steps[steps.length - 1] || ''

  return (
    <div className="px-2 pl-7 min-h-5 flex items-center overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex items-center gap-1.5"
        >
          <Loader2 className="w-2 h-2 animate-spin text-clarity-blue-500/60 flex-shrink-0" />
          <span className="text-[9px] text-muted-foreground/60 truncate leading-relaxed">
            {current}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ─── Progress Sub-Steps (full list, used in expandable detail for completed steps) ──

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
