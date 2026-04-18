/**
 * Humanized Step Labels
 *
 * Maps technical pipeline step IDs to empathetic, human-readable messages.
 * Provides progressive disclosure: users see friendly descriptions while
 * technical details remain available on expansion.
 */

import type { ExecutionStep } from '@/types/clinical-types'
import {
  AGENT_EVENT_KINDS,
  NON_FATAL_WARNING_CODES,
  type AgentEventKind,
  type NonFatalWarningCode,
} from '@/types/agent-events'
import { RoutingReason } from '@/types/operational-metadata'

interface HumanizedLabel {
  active: string
  completed: string
}

/** Extends HumanizedLabel with optional query-enriched variants for tool steps. */
interface ToolLabelConfig extends HumanizedLabel {
  activeWithQuery?: string
  completedWithQuery?: string
}

/**
 * Known pipeline step IDs → human-friendly labels.
 *
 * Server-emitted processing steps arrive with the `ps_` prefix
 * (e.g. `ps_session_load`).  Client-generated steps use plain IDs.
 */
const STEP_LABELS: Record<string, HumanizedLabel> = {
  // ── Server-emitted processing steps ──────────────────────────
  'ps_session_load': {
    active: 'Preparando tu espacio…',
    completed: 'Espacio listo',
  },
  'ps_patient_context': {
    active: 'Revisando historial del paciente…',
    completed: 'Historial integrado',
  },
  'ps_build_context': {
    active: 'Organizando información clínica…',
    completed: 'Información organizada',
  },
  'ps_model_call': {
    active: 'Aurora está reflexionando…',
    completed: 'Reflexión completada',
  },

  // ── Client-side generated steps ──────────────────────────────
  'analyzing_intent': {
    active: 'Comprendiendo tu consulta…',
    completed: 'Consulta comprendida',
  },
  'routing': {
    active: 'Seleccionando especialista…',
    completed: 'Especialista asignado',
  },
  'synthesis': {
    active: 'Integrando resultados…',
    completed: 'Resultados integrados',
  },
  'streaming': {
    active: 'Elaborando respuesta…',
    completed: 'Respuesta elaborada',
  },
}

/**
 * Tool-name → human-friendly labels for semantic translation.
 *
 * Maps technical tool names to clinically appropriate messages so users
 * never see raw function names like "search_academic_literature".
 * The `query` placeholder is replaced at runtime with the actual query.
 */
const TOOL_LABELS: Record<string, ToolLabelConfig> = {
  'search_academic_literature': {
    active: 'Consultando literatura científica…',
    completed: 'Literatura revisada',
    activeWithQuery: 'Consultando literatura sobre "{query}"…',
    completedWithQuery: 'Literatura sobre "{query}" revisada',
  },
  'research_evidence': {
    active: 'Buscando evidencia clínica…',
    completed: 'Evidencia integrada',
    activeWithQuery: 'Buscando evidencia sobre "{query}"…',
    completedWithQuery: 'Evidencia sobre "{query}" integrada',
  },
  'explore_patient_context': {
    active: 'Revisando contexto del paciente…',
    completed: 'Contexto revisado',
  },
  'save_clinical_memory': {
    active: 'Guardando observación clínica…',
    completed: 'Observación registrada',
  },
  'generate_clinical_document': {
    active: 'Generando documento clínico…',
    completed: 'Documento preparado',
    activeWithQuery: 'Generando documento {query}…',
    completedWithQuery: 'Documento {query} preparado',
  },
  'update_clinical_document': {
    active: 'Actualizando registro del paciente…',
    completed: 'Registro actualizado',
  },
  'create_patient': {
    active: 'Creando perfil del paciente…',
    completed: 'Perfil creado',
    activeWithQuery: 'Creando perfil de {query}…',
    completedWithQuery: 'Perfil de {query} creado',
  },
  'get_patient_memories': {
    active: 'Consultando memorias clínicas…',
    completed: 'Memorias consultadas',
  },
  'get_patient_record': {
    active: 'Consultando ficha del paciente…',
    completed: 'Ficha consultada',
  },
  'list_patients': {
    active: 'Buscando pacientes…',
    completed: 'Búsqueda completada',
  },
  'get_session_documents': {
    active: 'Recuperando documentos de sesión…',
    completed: 'Documentos recuperados',
  },
  'analyze_longitudinal_patterns': {
    active: 'Analizando patrones longitudinales…',
    completed: 'Patrones analizados',
  },
  'google_search': {
    active: 'Buscando información…',
    completed: 'Búsqueda completada',
  },
}

/**
 * Returns a humanized label for a given step.
 *
 * - Known step IDs are mapped to empathetic, non-technical messages.
 * - Tool execution steps use TOOL_LABELS for semantic clinical translation.
 * - Unknown steps fall back to their original label.
 */
export function humanizeStepLabel(step: ExecutionStep): string {
  const mapping = STEP_LABELS[step.id]
  if (mapping) {
    return step.status === 'active' ? mapping.active : mapping.completed
  }

  // Semantic translation for tool execution steps
  if (step.toolName) {
    const toolMapping = TOOL_LABELS[step.toolName]
    if (toolMapping) {
      const isActive = step.status === 'active'
      const query = step.query ? truncateLabel(step.query, 40) : undefined
      // Use query-enriched variant if available and there's a query
      if (query) {
        const template = isActive ? toolMapping.activeWithQuery : toolMapping.completedWithQuery
        if (template) {
          return template.replace('{query}', query)
        }
      }
      return isActive ? toolMapping.active : toolMapping.completed
    }
    // Fallback: keep the original label for unrecognized tools
    return step.label
  }

  // Fallback to original server-provided label
  return step.label
}

/** Simple Spanish pluralization helper. */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

/**
 * Generates a human-readable group label for a parallel tool cluster.
 *
 * Used by `ParallelToolLanes` to summarize the swarm activity as a single
 * status line instead of repeating tool-by-tool descriptions.
 *
 * Examples:
 * - 2 active → "Realizando 2 comprobaciones en paralelo…"
 * - 3 completed, 1 active → "3 de 4 comprobaciones completadas…"
 * - all completed → "4 comprobaciones completadas"
 */
export function humanizeParallelGroup(steps: ExecutionStep[]): string {
  const activeCount = steps.filter(s => s.status === 'active').length
  const completedCount = steps.filter(s => s.status === 'completed').length
  const errorCount = steps.filter(s => s.status === 'error').length
  const total = steps.length

  if (activeCount === 0 && errorCount === 0) {
    // All completed
    return `${completedCount} ${pluralize(completedCount, 'comprobación completada', 'comprobaciones completadas')}`
  }

  if (activeCount === total) {
    // All running
    return `Realizando ${total} comprobaciones en paralelo…`
  }

  // Mixed state
  if (completedCount > 0 && activeCount > 0) {
    return `${completedCount} de ${total} comprobaciones completadas…`
  }

  if (errorCount > 0 && activeCount > 0) {
    return `${activeCount} ${pluralize(activeCount, 'comprobación', 'comprobaciones')} en curso, ${errorCount} con error`
  }

  if (activeCount > 0) {
    return `Ejecutando ${activeCount} ${pluralize(activeCount, 'comprobación clínica', 'comprobaciones clínicas')}…`
  }

  // All errored
  return `${total} ${pluralize(total, 'comprobación', 'comprobaciones')} con error`
}

/** Truncates text for inline display in humanized labels. */
function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '…'
}

/**
 * Calculates overall progress as a percentage (0–100).
 *
 * Active steps count as 50% progress so the bar advances smoothly.
 * Parallel groups are weighted as a single unit to prevent jumpy progress
 * when many concurrent tools complete simultaneously.
 */
export function calculateProgress(steps: ExecutionStep[]): number {
  if (steps.length === 0) return 0

  // Identify parallel groups vs. sequential steps
  let totalWeight = 0
  let completedWeight = 0
  let i = 0

  while (i < steps.length) {
    const step = steps[i]

    if (step.parallelGroup) {
      // Collect the entire parallel group
      const groupStart = i
      while (i < steps.length && steps[i].parallelGroup) i++
      const groupSteps = steps.slice(groupStart, i)
      const groupTotal = groupSteps.length
      const groupCompleted = groupSteps.filter(s => s.status === 'completed').length
      const groupActive = groupSteps.filter(s => s.status === 'active').length

      // Parallel group counts as 1 weighted unit for overall progress,
      // with internal fractional progress based on lane completion
      totalWeight += 1
      completedWeight += (groupCompleted + groupActive * 0.5) / groupTotal
    } else {
      // Sequential step: 1 unit each
      totalWeight += 1
      if (step.status === 'completed') completedWeight += 1
      else if (step.status === 'active') completedWeight += 0.5
      i++
    }
  }

  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
}

// ─── Agent-event vocabulary v2 — humanized registry ─────────────────────────
// Every new SSE event kind MUST appear here. Every `RoutingReason` enum value
// MUST have a label. Every `NonFatalWarningCode` MUST have a label. The unit
// test `tests/agent-event-vocabulary.test.ts` enforces this invariant.

/**
 * Humanized label per v2 event kind. Used in the fallback path when a richer
 * per-event string (e.g. a tool's own `displayName`) is unavailable.
 */
export const AGENT_EVENT_LABELS: Record<AgentEventKind, string> = {
  turn_started: 'Iniciando turno',
  plan: 'Planificando pasos',
  turn_completed: 'Turno completado',
  routing_decision: 'Seleccionando especialista',
  thinking_started: 'Razonando',
  thinking_delta: 'Razonando…',
  thinking_completed: 'Razonamiento completado',
  tool_lifecycle: 'Ejecutando herramienta',
  source_validated: 'Validando fuente',
  citation_span: 'Vinculando cita',
  checkpoint_requested: 'Confirmación requerida',
  checkpoint_resolved: 'Confirmación resuelta',
  non_fatal_warning: 'Aviso no crítico',
}

/**
 * Humanized label per `RoutingReason`. Surfaced inside the `RoutingChip` so
 * the clinician sees *why* a specific agent was chosen, in plain language.
 */
export const ROUTING_REASON_LABELS: Record<RoutingReason, string> = {
  [RoutingReason.CRITICAL_RISK_OVERRIDE]: 'Derivación por riesgo crítico detectado',
  [RoutingReason.HIGH_RISK_OVERRIDE]: 'Derivación por riesgo alto detectado',
  [RoutingReason.STRESS_OVERRIDE]: 'Ajuste por señales de estrés en el caso',
  [RoutingReason.SENSITIVE_CONTENT_OVERRIDE]: 'Ajuste por contenido sensible',
  [RoutingReason.NORMAL_CLASSIFICATION]: 'Clasificación estándar',
  [RoutingReason.HIGH_CONFIDENCE_CLASSIFICATION]: 'Clasificación con alta confianza',
  [RoutingReason.FALLBACK_LOW_CONFIDENCE]: 'Opción por defecto (confianza baja)',
  [RoutingReason.FALLBACK_AMBIGUOUS_QUERY]: 'Consulta ambigua — se usó opción por defecto',
  [RoutingReason.FALLBACK_ERROR]: 'Opción por defecto tras un error interno',
  [RoutingReason.STABILITY_OVERRIDE]: 'Manteniendo continuidad del especialista',
  [RoutingReason.CONTINUITY_MAINTAINED]: 'Continuidad del especialista anterior',
  [RoutingReason.CLOSURE_PHASE_SUGGESTED]: 'Fase de cierre — documentación sugerida',
  [RoutingReason.ASSESSMENT_PHASE_SUGGESTED]: 'Fase de evaluación — exploración sugerida',
  [RoutingReason.EXPLICIT_USER_REQUEST]: 'Solicitud explícita del usuario',
}

/**
 * Humanized label per non-fatal warning code. Drives the amber state row
 * text in the timeline (P4, D7).
 */
export const NON_FATAL_WARNING_LABELS: Record<NonFatalWarningCode, string> = {
  tool_retry: 'Reintentando la herramienta',
  tool_fallback: 'Usando una alternativa tras un error transitorio',
  tool_partial_result: 'Resultado parcial — algunos datos no estuvieron disponibles',
  tool_timeout: 'La herramienta superó el tiempo permitido',
  tool_rejected_by_policy: 'Herramienta rechazada por política de seguridad',
  source_rejected_irrelevant: 'Fuente descartada por baja relevancia',
  source_rejected_low_quality: 'Fuente descartada por baja calidad académica',
  thinking_budget_exceeded: 'Se alcanzó el límite de razonamiento',
  checkpoint_expired: 'La confirmación pendiente expiró',
}

/** Typed accessors — preferred over direct record access so misses surface. */
export function humanizeAgentEvent(kind: AgentEventKind): string {
  return AGENT_EVENT_LABELS[kind]
}

export function humanizeRoutingReason(reason: RoutingReason): string {
  return ROUTING_REASON_LABELS[reason]
}

export function humanizeNonFatalWarning(code: NonFatalWarningCode): string {
  return NON_FATAL_WARNING_LABELS[code]
}

// Compile-time exhaustiveness guard: TS errors if a new `AgentEventKind` /
// `NonFatalWarningCode` is added without updating the label tables above.
// (The `Record<K, V>` type in the declarations already enforces this, but
// re-checking via the runtime arrays catches the case of silent drift when
// someone widens the union but keeps the record typed to the old keys.)
{
  const _kindCheck: Record<(typeof AGENT_EVENT_KINDS)[number], string> = AGENT_EVENT_LABELS
  const _warnCheck: Record<(typeof NON_FATAL_WARNING_CODES)[number], string> = NON_FATAL_WARNING_LABELS
  void _kindCheck
  void _warnCheck
}
