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
