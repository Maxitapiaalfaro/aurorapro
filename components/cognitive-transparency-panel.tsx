"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { MagnifyingGlass, Brain, Lightning, ArrowsClockwise, BookOpen } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import type { MessageProcessingStatus, ProcessingPhase, ToolExecutionEvent } from '@/types/clinical-types'

interface CognitiveTransparencyPanelProps {
  processingStatus: MessageProcessingStatus
  className?: string
}

/**
 * Maps a processing phase to a human-readable Spanish label
 */
function getPhaseLabel(phase: ProcessingPhase): string {
  const labels: Record<ProcessingPhase, string> = {
    idle: 'Esperando',
    analyzing_intent: 'Analizando intención...',
    routing_agent: 'Determinando especialista...',
    agent_selected: 'Especialista seleccionado',
    executing_tools: 'Ejecutando herramientas...',
    synthesizing: 'Sintetizando respuesta...',
    streaming: 'Generando respuesta...',
    complete: 'Completado',
    error: 'Error en el procesamiento'
  }
  return labels[phase] || phase
}

/**
 * Returns the icon for a processing phase
 */
function getPhaseIcon(phase: ProcessingPhase) {
  switch (phase) {
    case 'analyzing_intent':
      return <Brain className="w-4 h-4" weight="duotone" />
    case 'routing_agent':
      return <ArrowsClockwise className="w-4 h-4" weight="duotone" />
    case 'agent_selected':
      return <Lightning className="w-4 h-4" weight="duotone" />
    case 'executing_tools':
      return <MagnifyingGlass className="w-4 h-4" weight="duotone" />
    case 'synthesizing':
      return <BookOpen className="w-4 h-4" weight="duotone" />
    case 'streaming':
      return <Loader2 className="w-4 h-4 animate-spin" />
    case 'complete':
      return <CheckCircle className="w-4 h-4 text-serene-teal-500" />
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-500" />
    default:
      return <Loader2 className="w-4 h-4 animate-spin" />
  }
}

/**
 * Cognitive Transparency Panel
 *
 * Progressive disclosure component that shows the AI's internal workflow
 * in real-time. Collapsed by default, users can expand to see details.
 */
export function CognitiveTransparencyPanel({
  processingStatus,
  className
}: CognitiveTransparencyPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Don't render when idle or complete
  if (processingStatus.phase === 'idle' || processingStatus.isComplete) {
    return null
  }

  const hasToolExecutions = processingStatus.toolExecutions.length > 0
  const hasRouting = !!processingStatus.routingInfo
  const agentConfig = hasRouting
    ? getAgentVisualConfig(processingStatus.routingInfo!.targetAgent)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className={cn("rounded-lg border border-border/60 bg-secondary/30 overflow-hidden", className)}
    >
      {/* Compact status bar - always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          {getPhaseIcon(processingStatus.phase)}
          <span className="text-xs font-medium">
            {getPhaseLabel(processingStatus.phase)}
          </span>
        </div>

        {/* Agent badge when selected */}
        {hasRouting && agentConfig && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
              agentConfig.bgColor,
              agentConfig.textColor
            )}
          >
            {agentConfig.name}
          </motion.span>
        )}

        <div className="ml-auto flex items-center gap-1 text-muted-foreground/60">
          {hasToolExecutions && (
            <span className="text-[10px]">
              {processingStatus.toolExecutions.length} herramienta{processingStatus.toolExecutions.length !== 1 ? 's' : ''}
            </span>
          )}
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </div>
      </button>

      {/* Expanded details - progressive disclosure */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-border/40 pt-2">
              {/* Routing info */}
              {hasRouting && processingStatus.routingInfo && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Enrutamiento
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {processingStatus.routingInfo.reasoning}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60">
                    Confianza: {Math.round(processingStatus.routingInfo.confidence * 100)}%
                  </div>
                </div>
              )}

              {/* Tool executions */}
              {hasToolExecutions && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Herramientas
                  </div>
                  <ul className="space-y-1">
                    {processingStatus.toolExecutions.map((tool, idx) => (
                      <ToolExecutionItem key={tool.id || idx} tool={tool} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ToolExecutionItem({ tool }: { tool: ToolExecutionEvent }) {
  const statusIcon = tool.status === 'started'
    ? <Loader2 className="w-3 h-3 animate-spin text-clarity-blue-500" />
    : tool.status === 'completed'
      ? <CheckCircle className="w-3 h-3 text-serene-teal-500" />
      : <AlertCircle className="w-3 h-3 text-red-500" />

  return (
    <motion.li
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-start gap-1.5"
    >
      <div className="mt-0.5 flex-shrink-0">{statusIcon}</div>
      <div className="min-w-0">
        <span className="text-xs text-foreground font-medium">
          {tool.displayName}
        </span>
        {tool.query && (
          <span className="text-[10px] text-muted-foreground ml-1">
            {`— "${tool.query}"`}
          </span>
        )}
        {tool.result && tool.status === 'completed' && (
          <span className="text-[10px] text-muted-foreground ml-1">
            ({tool.result.sourcesFound} encontradas, {tool.result.sourcesValidated} validadas)
          </span>
        )}
      </div>
    </motion.li>
  )
}
