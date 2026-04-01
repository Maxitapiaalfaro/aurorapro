/**
 * Dynamic Status Generation Utility
 *
 * Generates context-aware, clinically appropriate status text from
 * live processing metadata — never from hardcoded dictionaries.
 *
 * The status text is derived from the actual tool arguments, orchestrator
 * reasoning, and agent context so that each processing cycle produces
 * unique, request-specific UI strings.
 */

import type { MessageProcessingStatus, ToolExecutionEvent, AgentType, ExecutionTimeline, ExecutionStep } from '@/types/clinical-types'
import { getAgentVisualConfig } from '@/config/agent-visual-config'

// ---------------------------------------------------------------------------
// Area 2 – Dynamic, context-aware status string generation
// ---------------------------------------------------------------------------

/**
 * Produces a single human-readable status string that reflects the *current*
 * processing phase and the specific data flowing through the pipeline.
 *
 * It reads the live `processingStatus` object and extracts dynamic text from:
 * - `routingInfo.reasoning` (orchestrator explanation)
 * - `toolExecutions[].query`  (the actual search term the user triggered)
 * - `toolExecutions[].displayName` (human-friendly tool label)
 * - agent display name from the visual config
 *
 * This avoids all hardcoded status dictionaries.
 */
export function generateDynamicStatus(
  processingStatus: MessageProcessingStatus | undefined,
  activeAgent: AgentType,
  targetAgent?: AgentType
): { message: string; key: string } {
  if (!processingStatus || processingStatus.phase === 'idle') {
    return { message: 'Inicializando...', key: 'idle' }
  }

  const agent = targetAgent || activeAgent
  const agentConfig = getAgentVisualConfig(agent)
  const agentName = agentConfig.name // e.g. "Perspectiva", "Evidencia", "Memoria"

  switch (processingStatus.phase) {
    case 'analyzing_intent':
      return {
        message: 'Evaluando consulta y determinando modalidad de análisis...',
        key: 'analyzing_intent'
      }

    case 'routing_agent':
      return {
        message: processingStatus.routingInfo?.reasoning
          ? truncate(processingStatus.routingInfo.reasoning, 80)
          : 'Determinando especialista más adecuado...',
        key: 'routing_agent'
      }

    case 'agent_selected':
      return {
        message: `${agentName} iniciando análisis...`,
        key: `agent_selected_${agent}`
      }

    case 'executing_tools': {
      const activeTool = processingStatus.toolExecutions.find(t => t.status === 'started' || t.status === 'in_progress')
      if (activeTool) {
        return {
          message: buildToolStatusText(activeTool, agentName),
          key: `tool_${activeTool.id}_${activeTool.status}`
        }
      }
      return {
        message: `${agentName} ejecutando herramientas de análisis...`,
        key: 'executing_tools'
      }
    }

    case 'synthesizing':
      return {
        message: buildSynthesisText(processingStatus, agentName),
        key: 'synthesizing'
      }

    case 'streaming':
      return {
        message: `${agentName} generando respuesta...`,
        key: 'streaming'
      }

    case 'complete':
      return { message: 'Análisis completado', key: 'complete' }

    case 'error':
      return { message: 'Error en el procesamiento', key: 'error' }

    default:
      return { message: `${agentName} procesando...`, key: 'default' }
  }
}

// ---------------------------------------------------------------------------
// Helpers for dynamic text composition
// ---------------------------------------------------------------------------

/**
 * Builds a dynamic tool-execution status line from the live tool event.
 * Instead of "Searching database" it produces e.g.
 * "Consultando literatura sobre terapia cognitivo-conductual..."
 */
function buildToolStatusText(tool: ToolExecutionEvent, agentName: string): string {
  // Show progress message if available (e.g. "Conectando con Parallel AI...")
  if (tool.progressMessage) {
    return tool.progressMessage
  }
  if (tool.query) {
    // Dynamic: use the actual query the model sent
    return `${tool.displayName}: "${truncate(tool.query, 50)}"...`
  }
  // Fallback: use the human-readable tool display name
  return `${agentName} — ${tool.displayName}...`
}

/**
 * Builds a synthesis status message that reflects the amount of work done.
 */
function buildSynthesisText(status: MessageProcessingStatus, agentName: string): string {
  const completedTools = status.toolExecutions.filter(t => t.status === 'completed')
  if (completedTools.length > 0) {
    const totalSources = completedTools.reduce((sum, t) => sum + (t.result?.sourcesValidated ?? 0), 0)
    if (totalSources > 0) {
      return `${agentName} sintetizando ${totalSources} fuente${totalSources !== 1 ? 's' : ''} validada${totalSources !== 1 ? 's' : ''}...`
    }
  }
  return `${agentName} sintetizando resultados del análisis...`
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '…'
}

/**
 * Builds a detail string from tool execution result data.
 * Shared by both snapshot and live timeline builders.
 */
function buildToolResultDetail(result: { sourcesFound?: number; sourcesValidated?: number } | undefined, status: string): string | undefined {
  if (!result || status !== 'completed') return undefined
  const parts: string[] = []
  if (result.sourcesFound != null) parts.push(`${result.sourcesFound} encontradas`)
  if (result.sourcesValidated != null) parts.push(`${result.sourcesValidated} validadas`)
  return parts.length > 0 ? parts.join(', ') : undefined
}

// ---------------------------------------------------------------------------
// Area 1 – Snapshot: build a persistent ExecutionTimeline from live status
// ---------------------------------------------------------------------------

/**
 * Captures the current `MessageProcessingStatus` into an immutable
 * `ExecutionTimeline` object suitable for storing on the `ChatMessage`.
 *
 * This is called once when the streaming response is finalized, converting
 * the ephemeral processing state into a permanent historical record.
 *
 * Each discrete phase of the pipeline is captured as its own step so that
 * the resulting timeline is a sequence of independent accordion items.
 */
export function snapshotExecutionTimeline(
  processingStatus: MessageProcessingStatus,
  agent: AgentType,
  durationMs?: number
): ExecutionTimeline {
  const agentConfig = getAgentVisualConfig(agent)

  const steps: ExecutionStep[] = []

  // Step from routing
  if (processingStatus.routingInfo) {
    const fullReasoning = processingStatus.routingInfo.reasoning || `Especialista seleccionado: ${agentConfig.name}`
    steps.push({
      id: 'routing',
      label: truncate(fullReasoning, 120),
      status: 'completed',
      detail: fullReasoning.length > 120 ? fullReasoning : undefined  // 🔧 FIX: Store full text for expandable accordion
    })
  }

  // Steps from tool executions
  for (const tool of processingStatus.toolExecutions) {
    const fullQuery = tool.query || tool.displayName
    const truncatedLabel = tool.query
      ? `${tool.displayName}: "${truncate(tool.query, 60)}"`
      : tool.displayName

    steps.push({
      id: tool.id,
      label: truncatedLabel,
      status: tool.status === 'error' ? 'error' : 'completed',
      toolName: tool.toolName,
      query: tool.query,
      detail: fullQuery.length > 60 ? fullQuery : buildToolResultDetail(tool.result, tool.status),  // 🔧 FIX: Full query as detail for expandable accordion
      result: tool.result,
      sources: tool.academicSources
    })
  }

  // Synthesis step (if tools were executed)
  if (processingStatus.toolExecutions.length > 0) {
    const completedTools = processingStatus.toolExecutions.filter(t => t.status === 'completed')
    const totalSources = completedTools.reduce((sum, t) => sum + (t.result?.sourcesValidated ?? 0), 0)
    steps.push({
      id: 'synthesis',
      label: totalSources > 0
        ? `${agentConfig.name} sintetizó ${totalSources} fuente${totalSources !== 1 ? 's' : ''}`
        : `${agentConfig.name} sintetizó resultados del análisis`,
      status: 'completed'
    })
  }

  return {
    agentType: agent,
    agentDisplayName: agentConfig.name,
    steps,
    durationMs
  }
}

// ---------------------------------------------------------------------------
// Live timeline: real-time ExecutionTimeline from ephemeral processingStatus
// ---------------------------------------------------------------------------

const PHASE_ORDER: ReadonlyArray<string> = [
  'analyzing_intent',
  'routing_agent',
  'agent_selected',
  'executing_tools',
  'synthesizing',
  'streaming'
]

/**
 * Builds a *live* `ExecutionTimeline` from the current `MessageProcessingStatus`.
 *
 * Unlike `snapshotExecutionTimeline` (called once at the end), this function
 * is called on every render during streaming so that the UI can display
 * sequential accordion items that update in real-time.
 *
 * - Past phases → status `'completed'`
 * - Current phase → status `'active'`
 * - Future phases → not included
 */
export function buildLiveTimeline(
  processingStatus: MessageProcessingStatus,
  activeAgent: AgentType,
  targetAgent?: AgentType
): ExecutionTimeline {
  const agent = targetAgent || activeAgent
  const agentConfig = getAgentVisualConfig(agent)
  const steps: ExecutionStep[] = []
  const currentPhaseIdx = PHASE_ORDER.indexOf(processingStatus.phase)

  // 1. Analyzing intent
  if (currentPhaseIdx >= PHASE_ORDER.indexOf('analyzing_intent')) {
    const isActive = processingStatus.phase === 'analyzing_intent'
    steps.push({
      id: 'analyzing_intent',
      label: `Analizando consulta…`,
      status: isActive ? 'active' : 'completed'
    })
  }

  // 2. Routing / agent selection
  if (processingStatus.routingInfo) {
    const isActive = processingStatus.phase === 'routing_agent' || processingStatus.phase === 'agent_selected'
    const fullReasoning = processingStatus.routingInfo.reasoning || `Especialista seleccionado: ${agentConfig.name}`
    steps.push({
      id: 'routing',
      label: truncate(fullReasoning, 120),
      status: isActive ? 'active' : 'completed',
      detail: fullReasoning.length > 120 ? fullReasoning : undefined  // 🔧 FIX: Store full text for expandable accordion
    })
  } else if (processingStatus.phase === 'routing_agent') {
    steps.push({
      id: 'routing',
      label: `Seleccionando especialista…`,
      status: 'active'
    })
  }

  // 3. Tool executions – each gets its own step
  for (const tool of processingStatus.toolExecutions) {
    const isToolActive = tool.status === 'started' || tool.status === 'in_progress'
    // When in_progress, show the progress message instead of the generic label
    const toolLabel = tool.status === 'in_progress' && tool.progressMessage
      ? tool.progressMessage
      : tool.query
        ? `${tool.displayName}: "${truncate(tool.query, 60)}"`
        : tool.displayName

    const fullQuery = tool.query || tool.displayName

    steps.push({
      id: tool.id,
      label: toolLabel,
      status: isToolActive ? 'active' : tool.status === 'error' ? 'error' : 'completed',
      toolName: tool.toolName,
      query: tool.query,
      detail: fullQuery.length > 60 ? fullQuery : buildToolResultDetail(tool.result, tool.status),  // 🔧 FIX: Full query as detail for expandable accordion
      result: tool.result,
      sources: tool.academicSources
    })
  }

  // 4. Synthesizing
  if (currentPhaseIdx >= PHASE_ORDER.indexOf('synthesizing')) {
    const isActive = processingStatus.phase === 'synthesizing'
    const completedTools = processingStatus.toolExecutions.filter(t => t.status === 'completed')
    const totalSources = completedTools.reduce((sum, t) => sum + (t.result?.sourcesValidated ?? 0), 0)
    steps.push({
      id: 'synthesis',
      label: totalSources > 0
        ? `${agentConfig.name} sintetizando ${totalSources} fuente${totalSources !== 1 ? 's' : ''}…`
        : `${agentConfig.name} sintetizando resultados del análisis…`,
      status: isActive ? 'active' : 'completed'
    })
  }

  // 5. Streaming
  if (currentPhaseIdx >= PHASE_ORDER.indexOf('streaming')) {
    const isActive = processingStatus.phase === 'streaming'
    steps.push({
      id: 'streaming',
      label: `${agentConfig.name} generando respuesta…`,
      status: isActive ? 'active' : 'completed'
    })
  }

  return {
    agentType: agent,
    agentDisplayName: agentConfig.name,
    steps
  }
}
