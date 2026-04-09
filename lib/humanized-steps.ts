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
 * Returns a humanized label for a given step.
 *
 * - Known step IDs are mapped to empathetic, non-technical messages.
 * - Tool execution steps keep their display name but get a friendlier wrapper.
 * - Unknown steps fall back to their original label.
 */
export function humanizeStepLabel(step: ExecutionStep): string {
  const mapping = STEP_LABELS[step.id]
  if (mapping) {
    return step.status === 'active' ? mapping.active : mapping.completed
  }

  // For tool execution steps, the label is already reasonably descriptive
  // (e.g. "Consulta Parallel AI: "ansiedad"").  Keep it as-is.
  if (step.toolName) {
    return step.label
  }

  // Fallback to original server-provided label
  return step.label
}

/**
 * Calculates overall progress as a percentage (0–100).
 *
 * Active steps count as 50 % progress so the bar advances smoothly.
 */
export function calculateProgress(steps: ExecutionStep[]): number {
  if (steps.length === 0) return 0
  const completed = steps.filter(s => s.status === 'completed').length
  const active = steps.filter(s => s.status === 'active').length
  return Math.round(((completed + active * 0.5) / steps.length) * 100)
}
