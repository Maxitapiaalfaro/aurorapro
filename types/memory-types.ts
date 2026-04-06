/**
 * Tipos para el sistema de memoria clínica persistente de Aurora/HopeAI.
 *
 * Las memorias clínicas son observaciones, patrones y preferencias terapéuticas
 * extraídas de sesiones con pacientes. Se almacenan en Firestore bajo:
 *   psychologists/{psychologistId}/patients/{patientId}/memories/{memoryId}
 *
 * @module types/memory-types
 */

// ---------------------------------------------------------------------------
// Categorías de memoria clínica
// ---------------------------------------------------------------------------

/**
 * Categoría de una memoria clínica.
 *
 * - `observation`:            Observación factual registrada en una sesión
 *                             (ej. "paciente reporta insomnio hace 3 semanas")
 * - `pattern`:                Patrón conductual/emocional detectado entre sesiones
 *                             (ej. "evitación al hablar de familia")
 * - `therapeutic-preference`: Enfoque terapéutico efectivo o inefectivo
 *                             (ej. "responde bien al cuestionamiento socrático")
 */
export type ClinicalMemoryCategory =
  | 'observation'
  | 'pattern'
  | 'therapeutic-preference'

// ---------------------------------------------------------------------------
// Documento principal de memoria clínica
// ---------------------------------------------------------------------------

/**
 * Documento de memoria clínica persistente.
 *
 * Representa una unidad atómica de conocimiento clínico sobre un paciente,
 * extraída de una o más sesiones terapéuticas.
 */
export interface ClinicalMemory {
  /** Identificador único de la memoria */
  memoryId: string

  /** ID del paciente al que pertenece esta memoria */
  patientId: string

  /** UID del psicólogo/profesional que la registró */
  psychologistId: string

  /** Categoría de la memoria */
  category: ClinicalMemoryCategory

  /** Texto de la observación, patrón o preferencia (en español) */
  content: string

  /** IDs de las sesiones que contribuyeron a esta memoria */
  sourceSessionIds: string[]

  /** Nivel de confianza del sistema (0 = nula, 1 = máxima) */
  confidence: number

  /** Fecha de creación */
  createdAt: Date

  /** Fecha de última actualización */
  updatedAt: Date

  /** Si la memoria está activa (false = soft-deleted) */
  isActive: boolean

  /** Etiquetas clínicas (ej. "ansiedad", "familia", "tratamiento") */
  tags: string[]

  /** Relevancia estimada para el tratamiento actual (0 = irrelevante, 1 = crítica) */
  relevanceScore: number
}

// ---------------------------------------------------------------------------
// Opciones de consulta
// ---------------------------------------------------------------------------

/**
 * Opciones de filtrado para consultar memorias de un paciente.
 */
export interface ClinicalMemoryQueryOptions {
  /** Filtrar por categoría */
  category?: ClinicalMemoryCategory

  /** Filtrar por estado activo/inactivo (por defecto: true) */
  isActive?: boolean

  /** Número máximo de resultados */
  limit?: number
}
