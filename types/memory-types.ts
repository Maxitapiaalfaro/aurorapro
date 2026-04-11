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
// Estado de Verdad (Truth State) — Flags de verificación para agentes
// ---------------------------------------------------------------------------

/**
 * Estado de verificación de un dato clínico.
 *
 * Permite a los agentes saber en qué estado epistemológico se encuentra
 * cada pieza de información almacenada, facilitando la toma de decisiones
 * informada y la actualización progresiva del conocimiento clínico.
 *
 * - `hypothesis`:       Hipótesis preliminar, aún no confirmada por el terapeuta
 * - `pending_review`:   Información registrada que espera revisión del terapeuta
 * - `therapist_confirmed`: Confirmado explícitamente por el terapeuta
 * - `ai_inferred`:      Inferido por IA a partir de patrones (requiere validación humana)
 * - `outdated`:         Información que fue relevante pero ya no refleja el estado actual
 * - `contradicted`:     Información que ha sido contradicha por datos más recientes
 */
export type VerificationStatus =
  | 'hypothesis'
  | 'pending_review'
  | 'therapist_confirmed'
  | 'ai_inferred'
  | 'outdated'
  | 'contradicted'

/**
 * Flags de contenido que describen las características clínicas de un dato.
 *
 * - `includes_pharmacology`:  Contiene información farmacológica (fármacos, dosis, interacciones)
 * - `includes_risk_factors`:  Contiene factores de riesgo clínico
 * - `includes_diagnosis`:     Contiene información diagnóstica (DSM-5/CIE-11)
 * - `includes_intervention`:  Contiene técnicas o intervenciones terapéuticas
 * - `is_patient_reported`:    Información reportada directamente por el paciente
 * - `is_clinician_observed`:  Observación directa del clínico en sesión
 */
export type ContentFlag =
  | 'includes_pharmacology'
  | 'includes_risk_factors'
  | 'includes_diagnosis'
  | 'includes_intervention'
  | 'is_patient_reported'
  | 'is_clinician_observed'

/**
 * Metadatos de verificación y estado de verdad de un dato clínico.
 *
 * Cada entidad persistida (memoria, documento, registro) puede incluir
 * estos metadatos para que los agentes tomen decisiones informadas sobre
 * la relevancia, fiabilidad y actualidad de la información.
 */
export interface VerificationMetadata {
  /** Estado de verificación actual */
  verificationStatus: VerificationStatus

  /** Flags de contenido clínico */
  contentFlags: ContentFlag[]

  /** Quién o qué estableció el estado de verificación actual */
  verifiedBy?: 'therapist' | 'ai_agent' | 'system'

  /** Cuándo se verificó por última vez */
  verifiedAt?: Date

  /** Razón del último cambio de estado (ej: "Terapeuta confirmó en sesión 5") */
  statusReason?: string
}

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
 * - `feedback`:               Corrección o confirmación del terapeuta sobre el abordaje de Aurora
 *                             (ej. "terapeuta prefiere que Aurora no sugiera diagnósticos directamente")
 * - `reference`:              Puntero a recurso externo relevante para el caso
 *                             (ej. "usar escala PHQ-9 para monitoreo de depresión en este paciente")
 */
export type ClinicalMemoryCategory =
  | 'observation'
  | 'pattern'
  | 'therapeutic-preference'
  | 'feedback'
  | 'reference'

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

  /** Estado de verdad y metadatos de verificación */
  verificationMetadata?: VerificationMetadata
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

  /** Filtrar por estado de verificación */
  verificationStatus?: VerificationStatus
}
