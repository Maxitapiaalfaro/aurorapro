/**
 * Humanized Step Labels
 *
 * Maps technical pipeline step IDs to empathetic, human-readable messages.
 * Provides progressive disclosure: users see friendly descriptions while
 * technical details remain available on expansion.
 */

import type { ExecutionStep } from '@/types/clinical-types'

interface HumanizedLabel {
  active: string
  completed: string
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
const TOOL_LABELS: Record<string, HumanizedLabel & { activeWithQuery?: string; completedWithQuery?: string }> = {
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

/** Truncates text for inline display in humanized labels. */
function truncateLabel(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).trimEnd() + '…'
}

/**
 * Calculates overall progress as a percentage (0–100).
 *
 * Active steps count as 50% progress so the bar advances smoothly.
 */
export function calculateProgress(steps: ExecutionStep[]): number {
  if (steps.length === 0) return 0
  const completed = steps.filter(s => s.status === 'completed').length
  const active = steps.filter(s => s.status === 'active').length
  return Math.round(((completed + active * 0.5) / steps.length) * 100)
}
