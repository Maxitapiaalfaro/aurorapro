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
      const activeTool = processingStatus.toolExecutions.find(t => t.status === 'started')
      if (activeTool) {
        return {
          message: buildToolStatusText(activeTool, agentName),
          key: `tool_${activeTool.id}`
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

// ---------------------------------------------------------------------------
// Area 1 – Snapshot: build a persistent ExecutionTimeline from live status
// ---------------------------------------------------------------------------

/**
 * Captures the current `MessageProcessingStatus` into an immutable
 * `ExecutionTimeline` object suitable for storing on the `ChatMessage`.
 *
 * This is called once when the streaming response is finalized, converting
 * the ephemeral processing state into a permanent historical record.
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
    steps.push({
      id: 'routing',
      label: processingStatus.routingInfo.reasoning
        ? truncate(processingStatus.routingInfo.reasoning, 120)
        : `Especialista seleccionado: ${agentConfig.name}`,
      status: 'completed'
    })
  }

  // Steps from tool executions
  for (const tool of processingStatus.toolExecutions) {
    steps.push({
      id: tool.id,
      label: tool.query
        ? `${tool.displayName}: "${truncate(tool.query, 60)}"`
        : tool.displayName,
      status: tool.status === 'error' ? 'error' : 'completed',
      toolName: tool.toolName,
      query: tool.query,
      result: tool.result
    })
  }

  return {
    agentType: agent,
    agentDisplayName: agentConfig.name,
    steps,
    durationMs
  }
}
