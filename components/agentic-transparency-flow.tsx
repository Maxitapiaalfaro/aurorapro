"use client"

import React, { useState, useEffect, useRef, useContext, createContext } from 'react'
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion'
import { Check, Loader2, AlertCircle, ChevronDown, ChevronRight, ExternalLink, BookOpen, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import { humanizeStepLabel, humanizeParallelGroup, calculateProgress } from '@/lib/humanized-steps'
import type { ExecutionTimeline as ExecutionTimelineType, ExecutionStep, AcademicSourceReference, AgentType } from '@/types/clinical-types'

// ─── Agent identity context ──────────────────────────────────────
// Lets nested step / lane components consume the active agent's facet color
// (Perspectiva / Memoria / Evidencia) without prop-drilling.
const AgentContext = createContext<AgentType>('orquestador' as AgentType)
const useAgentConfig = () => getAgentVisualConfig(useContext(AgentContext))

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum character length for inline detail display; longer details go into the expandable section. */
const INLINE_DETAIL_MAX_LENGTH = 40

/** Maximum height in pixels for the scrollable step list area to prevent infinite growth. */
const STEP_LIST_MAX_HEIGHT = 250

/** Maximum number of parallel lanes shown before batching into a summary. */
const PARALLEL_BATCH_THRESHOLD = 4

/** Shared spring config for layout animations — avoids abrupt DOM jumps */
const LAYOUT_SPRING = { type: 'spring' as const, stiffness: 350, damping: 30, mass: 0.8 }

/** Shared ease curve for opacity/transform transitions */
const EASE_OUT_QUAD: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94]

/** Format milliseconds as a readable seconds string (e.g. "1.2s"). */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Elapsed Timer ─────────────────────────────────────────────────────────
/**
 * Honest elapsed-time counter.
 *
 * - When `startedAt` is provided (epoch ms), the counter reflects the *real*
 *   elapsed time since the step started, even if the component remounts mid-stream.
 * - When `startedAt` is absent, falls back to a lazily-initialised timestamp so
 *   we never render a misleading “0s” for a step that has been running for a while.
 */
function ElapsedTimer({ startedAt }: { startedAt?: number }) {
  const [origin] = useState<number>(() => startedAt ?? Date.now())
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.max(0, Math.floor((now - origin) / 1000))
  return (
    <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
      {elapsed}s
    </span>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────
interface AgenticTransparencyFlowProps {
  timeline: ExecutionTimelineType
  className?: string
  /** Collapsed by default for historical messages */
  defaultCollapsed?: boolean  /**
   * Clinical escape hatch. When provided, a Stop button appears in the live
   * header while any step is active. The caller is responsible for actually
   * aborting the in-flight agent run (SSE / fetch AbortController).
   * Gated by a prop so the button never appears without a working backend.
   */
  onCancel?: () => void
}

/** localStorage key for per-agent expand preference (fix #7) */
const EXPAND_PREF_KEY = 'aurora:transparency:expand'

function readExpandPref(agentType: string): boolean | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`${EXPAND_PREF_KEY}:${agentType}`)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    /* private mode, quota, etc. — fall back to default */
  }
  return null
}

function writeExpandPref(agentType: string, expanded: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${EXPAND_PREF_KEY}:${agentType}`, String(expanded))
  } catch {
    /* ignore */
  }}

/**
 * Agentic Transparency Flow
 *
 * Elegant, progressive disclosure component that visualizes the AI agent's
 * execution pipeline with human-readable labels and smooth transitions.
 *
 * Architecture:
 * - **LayoutGroup** wraps the step list so every `motion.li` with `layout`
 *   animates position when siblings enter/exit (no abrupt DOM jumps).
 * - **ParallelToolLanes** renders concurrent tools as a swarm cluster
 *   instead of a plain vertical list.
 * - **Live mode** (`defaultCollapsed=false`): progress bar + expanding step list.
 * - **Historical mode** (`defaultCollapsed=true`): compact summary, expandable.
 */
export function AgenticTransparencyFlow({
  timeline,
  className,
  defaultCollapsed = true,
  onCancel,
}: AgenticTransparencyFlowProps) {
  const agentConfig = getAgentVisualConfig(timeline.agentType)
  const prefersReducedMotion = useReducedMotion()
  // Per-agent sticky expand preference (fix #7). Read lazily once.
  const [isExpanded, setIsExpanded] = useState(() => {
    const pref = readExpandPref(timeline.agentType)
    return pref ?? !defaultCollapsed
  })

  const handleToggleExpand = () => {
    setIsExpanded(prev => {
      const next = !prev
      writeExpandPref(timeline.agentType, next)
      return next
    })
  }
  const stepListRef = useRef<HTMLUListElement>(null)

  const stepsLength = timeline.steps?.length ?? 0
  const hasActiveStep = timeline.steps?.some(s => s.status === 'active') ?? false
  const isLive = !defaultCollapsed || hasActiveStep

  // Auto-scroll step list to bottom when new steps arrive in live mode.
  // Fix #5: honour prefers-reduced-motion — no smooth scroll for that audience.
  useEffect(() => {
    if (isLive && stepListRef.current) {
      stepListRef.current.scrollTo({
        top: stepListRef.current.scrollHeight,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }
  }, [isLive, stepsLength, prefersReducedMotion])

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
    <AgentContext.Provider value={timeline.agentType}>
      <div className={cn("overflow-hidden rounded-md", className)}>
      {/* ── Progress bar ────────────────────────────────────────── */}
      <ProgressBar progress={progress} agentType={timeline.agentType} />

      {/* ── Historical collapsed header ────────────────────────── */}
      {defaultCollapsed && !hasActiveStep && (
        <button
          type="button"
          onClick={handleToggleExpand}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary/30 transition-colors pointer-coarse:min-h-[44px] [@media(pointer:coarse)]:min-h-[44px]"
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
                    ? cn(agentConfig.typingDotColor, 'opacity-70')
                    : step.status === 'error'
                      ? 'bg-red-400/70'
                      : 'bg-muted-foreground/30',
                )}
              />
            ))}
            {timeline.steps.length > 8 && (
              <span className="text-[10px] text-muted-foreground/70 ml-0.5">
                +{timeline.steps.length - 8}
              </span>
            )}
          </div>

          <span className={cn("text-[11px] font-medium", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
          <span className="text-[10px] text-muted-foreground/70 ml-auto">
            {summaryParts.join(' · ')}
          </span>
          {isExpanded
            ? <ChevronDown className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
          }
        </button>
      )}

      {/* ── Live mode agent name + stop action ────────────────── */}
      {isLive && (
        <div
          className="flex items-center gap-1.5 px-3 py-1"
          role="status"
          aria-live="polite"
          aria-label="Procesamiento de IA en curso"
        >
          <span className={cn("text-[11px] font-semibold", agentConfig.textColor)}>
            {timeline.agentDisplayName}
          </span>
          {/* Clinical escape hatch — renders only when a cancel handler is wired */}
          {onCancel && hasActiveStep && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Detener proceso del agente"
              title="Detener proceso del agente"
              className="ml-auto inline-flex items-center justify-center rounded-md text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors min-h-[28px] min-w-[28px] p-1 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* ── Step list with LayoutGroup for smooth reflow ────────
             Fix #5: gate the height:auto animation on prefers-reduced-motion.
             Framer respects the media query for layout props, but custom
             height transitions still run unless we set duration: 0. */}
      <AnimatePresence initial={false}>
        {(isLive || isExpanded) && (
          <motion.div
            initial={defaultCollapsed ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.3, ease: EASE_OUT_QUAD }
            }
            className="overflow-hidden"
          >
            <LayoutGroup id={`timeline-${timeline.agentType}`}>
              <ul
                ref={stepListRef}
                className="px-2 pb-2 space-y-0.5 overflow-y-auto scrollbar-thin"
                style={{ maxHeight: STEP_LIST_MAX_HEIGHT }}
              >
                {renderStepsWithParallelGroups(timeline.steps, isLive)}
              </ul>
            </LayoutGroup>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </AgentContext.Provider>
  )
}

// ─── Progress Bar ──────────────────────────────────────────────────────────

function ProgressBar({
  progress,
  agentType,
}: {
  progress: number
  agentType: string
}) {
  const agentConfig = getAgentVisualConfig(agentType as import('@/types/clinical-types').AgentType)
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div
      className="h-[2px] w-full bg-border/20 overflow-hidden"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progreso del agente"
    >
      <motion.div
        className={cn("h-full rounded-full", agentConfig.typingDotColor)}
        initial={{ width: '0%' }}
        animate={{ width: `${clamped}%` }}
        transition={{
          ...LAYOUT_SPRING,
          stiffness: 200, // softer for the progress bar
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

// ─── Parallel Tool Lanes (Swarm Visualization) ─────────────────────────────

/**
 * Renders concurrent tool executions as a swarm cluster with shared header.
 * When >4 tools are active, collapses into a batched summary expandable on demand.
 *
 * Layout: All lanes share a single `<li>` wrapper with `layout` so the entire
 * parallel group animates as one unit when it enters/exits the timeline.
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
  const agentConfig = useAgentConfig()
  const shouldBatch = steps.length > PARALLEL_BATCH_THRESHOLD
  const activeCount = steps.filter(s => s.status === 'active').length
  const completedCount = steps.filter(s => s.status === 'completed').length
  const allCompleted = activeCount === 0 && completedCount === steps.length

  // Humanized group header
  const groupLabel = humanizeParallelGroup(steps)

  // Batching protocol: collapse into summary
  if (shouldBatch && !isBatchExpanded) {
    return (
      <motion.li
        layout
        layoutId={`parallel-batch-${steps[0].id}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: allCompleted ? 0.6 : 1, y: 0 }}
        transition={{ layout: LAYOUT_SPRING, duration: 0.3, ease: EASE_OUT_QUAD }}
        className="group"
      >
        <button
          type="button"
          onClick={() => setIsBatchExpanded(true)}
          className="w-full flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed hover:bg-secondary/30 transition-colors"
          aria-label={groupLabel}
        >
          <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
            {activeCount > 0 ? (
              <Loader2 className={cn('w-3 h-3 animate-spin flex-shrink-0', agentConfig.textColor)} />
            ) : (
              <Check className={cn('w-3 h-3 flex-shrink-0', agentConfig.textColor)} />
            )}
          </div>
          <span className="flex-1 min-w-0 truncate text-foreground/80 font-medium">
            {groupLabel}
          </span>
          {/* Mini progress: dots for each lane */}
          <div className="flex items-center gap-[3px] mr-1">
            {steps.map(s => (
              <div
                key={s.id}
                className={cn(
                  "w-[4px] h-[4px] rounded-full transition-colors duration-300",
                  s.status === 'active' ? cn(agentConfig.typingDotColor, 'animate-pulse') :
                  s.status === 'completed' ? cn(agentConfig.typingDotColor, 'opacity-60') :
                  'bg-red-400/60'
                )}
              />
            ))}
          </div>
          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/60 flex-shrink-0" />
        </button>
      </motion.li>
    )
  }

  return (
    <motion.li
      layout
      layoutId={`parallel-group-${steps[0].id}`}
      transition={{ layout: LAYOUT_SPRING }}
      className="space-y-0.5"
    >
      {/* Swarm header — shows count and group status */}
      <motion.div
        layout="position"
        className="flex items-center gap-2 px-2 py-[2px]"
      >
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          {activeCount > 0 ? (
            <Loader2 className={cn('w-2.5 h-2.5 animate-spin flex-shrink-0', agentConfig.textColor)} />
          ) : (
            <Check className={cn('w-2.5 h-2.5 flex-shrink-0', agentConfig.textColor)} />
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/70 font-medium">
          {groupLabel}
        </span>
      </motion.div>

      {/* Lane cluster — indented, each with its own layoutId */}
      <div className="pl-5 space-y-0.5">
        <AnimatePresence initial={false}>
          {steps.map((step, idx) => (
            <ParallelLane
              key={step.id}
              step={step}
              index={startIndex + idx}
              isLive={isLive}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.li>
  )
}

/**
 * A single parallel lane: horizontal indeterminate progress bar + label.
 * Uses `layoutId` so that when a lane transitions active → completed,
 * it smoothly slides into its new visual state instead of jumping.
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
  const agentConfig = useAgentConfig()
  const isActive = step.status === 'active'
  const isCompleted = step.status === 'completed'
  const isError = step.status === 'error'

  return (
    <motion.div
      layout
      layoutId={`lane-${step.id}`}
      initial={{ opacity: 0, x: -8 }}
      animate={{
        opacity: isCompleted ? 0.6 : 1,
        x: 0,
      }}
      exit={{ opacity: 0, x: -8 }}
      transition={{
        layout: LAYOUT_SPRING,
        opacity: { duration: 0.3 },
        x: { duration: 0.25, delay: isLive ? index * 0.03 : 0, ease: EASE_OUT_QUAD },
      }}
      className="space-y-0.5"
    >
      <div className="flex items-center gap-2 rounded-md px-2 py-[2px] text-[11px] leading-relaxed">
        {/* Status icon with smooth transition */}
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {isActive ? (
              <motion.div
                key="active"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Loader2 className={cn('w-3 h-3 animate-spin flex-shrink-0', agentConfig.textColor)} />
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                <Check className={cn('w-3 h-3 flex-shrink-0', agentConfig.textColor)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Label */}
        <span className={cn(
          'flex-1 min-w-0 truncate transition-colors duration-300',
          isActive ? 'text-foreground/90 font-medium' : 'text-muted-foreground/70',
        )}>
          {humanLabel}
        </span>

        {isActive && <ElapsedTimer startedAt={step.startedAt} />}
        {/* Duration badge */}
        {isCompleted && step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}
      </div>

      {/* Indeterminate progress bar for active lanes */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_QUAD }}
            className="mx-2 ml-7 h-[2px] bg-muted-foreground/15 rounded-full overflow-hidden origin-top"
          >
            <div className={cn('h-full w-[25%] rounded-full animate-slide-right', agentConfig.typingDotColor)} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
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
  const agentConfig = useAgentConfig()
  const hasSources = step.sources && step.sources.length > 0
  const hasProgressSteps = step.progressSteps && step.progressSteps.length > 0
  const hasExpandableContent = hasSources || hasProgressSteps || (step.detail && step.detail.length > INLINE_DETAIL_MAX_LENGTH)
  const [isOpen, setIsOpen] = useState(false)

  // Note: do NOT auto-collapse on active → completed transition.
  // The clinician may be reading the detail to decide whether to trust
  // the result; yanking it closed mid-read erodes confidence.

  const isActive = step.status === 'active'
  const isCompleted = step.status === 'completed'
  const isError = step.status === 'error'

  return (
    <motion.li
      layout
      layoutId={`step-${step.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        layout: LAYOUT_SPRING,
        opacity: { duration: 0.3 },
        y: { duration: 0.3, delay: isLive ? index * 0.04 : 0, ease: EASE_OUT_QUAD },
      }}
      className="group"
    >
      {/* ── Main row ──────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-[3px] text-[11px] leading-relaxed transition-all duration-300 [@media(pointer:coarse)]:min-h-[44px]",
          isActive && agentConfig.bgColor,
          isCompleted && 'bg-transparent',
          hasExpandableContent && 'cursor-pointer hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onClick={hasExpandableContent ? () => setIsOpen(prev => !prev) : undefined}
        role={hasExpandableContent ? 'button' : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        onKeyDown={hasExpandableContent ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(prev => !prev)
          }
        } : undefined}
        aria-expanded={hasExpandableContent ? isOpen : undefined}
        aria-label={hasExpandableContent ? `${humanLabel} - ${isOpen ? 'Expandido' : 'Contraído'}` : humanLabel}
      >
        {/* Icon with crossfade between states */}
        <div className="flex-shrink-0 w-3 h-3 flex items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {isActive ? (
              <motion.div
                key="spinner"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative flex items-center justify-center"
              >
                <Loader2 className={cn('relative w-3 h-3 animate-spin flex-shrink-0', agentConfig.textColor)} />
              </motion.div>
            ) : isError ? (
              <motion.div
                key="error"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              </motion.div>
            ) : (
              <motion.div
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                <Check className={cn('w-3 h-3 flex-shrink-0', agentConfig.textColor)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span
          className={cn(
            'flex-1 min-w-0 truncate transition-colors duration-300',
            isActive
              ? 'text-foreground font-medium'
              : isError
                ? 'text-red-500'
                : 'text-muted-foreground/80',
          )}
        >
          {humanLabel}
          {/* Short inline detail */}
          {step.detail && isCompleted && step.detail.length <= INLINE_DETAIL_MAX_LENGTH && (
            <span className="text-[10px] text-muted-foreground/70 ml-1.5">
              — {step.detail}
            </span>
          )}
        </span>

        {isActive && <ElapsedTimer startedAt={step.startedAt} />}
        {isCompleted && step.durationMs != null && step.durationMs > 0 && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
            {formatDuration(step.durationMs)}
          </span>
        )}

        {hasExpandableContent && (
          isOpen
            ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/60 flex-shrink-0" />
            : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/60 flex-shrink-0" />
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
            transition={{ duration: 0.2, ease: EASE_OUT_QUAD }}
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
  const agentConfig = useAgentConfig()

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
          <Loader2 className={cn('w-2.5 h-2.5 animate-spin flex-shrink-0', agentConfig.textColor)} />
          <span className="text-[10px] text-muted-foreground/70 truncate leading-relaxed">
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
  const agentConfig = useAgentConfig()
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
              <Loader2 className={cn('w-2.5 h-2.5 animate-spin flex-shrink-0', agentConfig.textColor)} />
            ) : (
              <Check className={cn('w-2.5 h-2.5 flex-shrink-0', agentConfig.textColor)} />
            )}
            <span
              className={cn(
                'text-[10px] leading-relaxed',
                isActive ? 'text-muted-foreground/80' : 'text-muted-foreground/60',
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
  const agentConfig = useAgentConfig()
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70">
        <BookOpen className="w-3 h-3" />
        <span>Fuentes académicas ({sources.length})</span>
      </div>
      <ul className="space-y-0.5">
        {sources.map((source, idx) => (
          <li key={idx} className="flex items-start gap-1 text-[10px] text-muted-foreground/70">
            <span className="text-muted-foreground/60 flex-shrink-0 mt-px">{idx + 1}.</span>
            <div className="min-w-0 flex-1">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('hover:underline inline-flex items-center gap-0.5 leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded', agentConfig.textColor)}
              >
                <span className="line-clamp-2">{source.title}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
              {(source.authors || source.year || source.journal) && (
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">
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
