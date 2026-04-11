export type AgentType = "socratico" | "clinico" | "academico" | "orquestador"

export type ClinicalMode = "therapeutic_assistance" | "clinical_supervision" | "research_support"

export interface ChatMessage {
  id: string
  content: string
  role: "user" | "model"
  agent?: AgentType
  timestamp: Date
  // ARQUITECTURA OPTIMIZADA: Archivos se referencian por ID, no objetos completos
  // Esto previene la acumulación exponencial que causa RESOURCE_EXHAUSTED
  fileReferences?: string[]  // IDs de archivos, no objetos completos
  // 📚 MEJORADO: groundingUrls ahora soporta referencias académicas completas de ParallelAI
  groundingUrls?: Array<{
    title: string
    url: string
    domain?: string
    // Campos académicos opcionales extraídos de ParallelAI
    doi?: string
    authors?: string
    year?: number
    journal?: string
  }>
  // ELIMINADO: attachments duplicados - usar solo fileReferences por ID
  // NUEVA FUNCIONALIDAD: Bullets de razonamiento específicos por mensaje
  reasoningBullets?: ReasoningBullet[]
  // Persistent execution timeline: hierarchical log of the AI's process for this turn
  executionTimeline?: ExecutionTimeline
}

// Persistent, hierarchical log of the agent execution pipeline for a single message
export interface ExecutionTimeline {
  agentType: AgentType
  agentDisplayName: string
  steps: ExecutionStep[]
  durationMs?: number
}

// A single step in the agent execution pipeline
export interface ExecutionStep {
  id: string
  label: string
  status: 'completed' | 'error' | 'active'
  toolName?: string
  query?: string
  /** Optional expandable detail text shown when the step accordion is opened */
  detail?: string
  /** Milliseconds the step took (shown as a badge on completed steps) */
  durationMs?: number
  result?: {
    sourcesFound?: number
    sourcesValidated?: number
  }
  /** Academic sources retrieved from Parallel AI, displayed as a readable list */
  sources?: AcademicSourceReference[]
  /** Human-readable summary of what the tool/sub-agent did */
  completionDetail?: string
  /** Accumulated progress steps from sub-agent execution (rendered as sub-items in accordion) */
  progressSteps?: string[]
}
export interface AcademicSourceReference {
  title: string
  url: string
  doi?: string
  authors?: string
  year?: number
  journal?: string
}

// Tipos para bullets progresivos de razonamiento
export interface ReasoningBullet {
  id: string
  content: string
  status: "generating" | "completed" | "error"
  timestamp: Date
  order?: number
  type?: "reasoning" | "separator"  // ARQUITECTURA MEJORADA: Soporte para separadores visuales
}

export interface ReasoningBulletsState {
  sessionId: string
  bullets: ReasoningBullet[]
  isGenerating: boolean
  currentStep: number
  totalSteps?: number
  error?: string
}

// Cognitive Transparency Layer: Granular processing lifecycle phases
export type ProcessingPhase =
  | 'idle'
  | 'analyzing_intent'
  | 'routing_agent'
  | 'agent_selected'
  | 'executing_tools'
  | 'synthesizing'
  | 'streaming'
  | 'complete'
  | 'error'

// Processing step event: emitted during server-side pipeline to provide
// visibility into what happens between "message sent" and "first response chunk"
export interface ProcessingStepEvent {
  id: string
  label: string
  status: 'active' | 'completed'
  /** Milliseconds the step took (set on 'completed' events) */
  durationMs?: number
  /** Optional secondary detail (e.g. "3 memorias, 1 ficha") */
  detail?: string
}

// Tool execution event emitted during processing
export interface ToolExecutionEvent {
  id: string
  toolName: string
  displayName: string
  query?: string
  status: 'started' | 'in_progress' | 'completed' | 'error'
  timestamp: Date
  /** Optional progress message for intermediate states */
  progressMessage?: string
  /** Accumulated progress steps from sub-agent internal execution (displayed as sub-items) */
  progressSteps?: string[]
  result?: {
    sourcesFound?: number
    sourcesValidated?: number
  }
  /** Academic sources from Parallel AI, attached on completion */
  academicSources?: AcademicSourceReference[]
  /** Human-readable summary of what the tool/sub-agent did (e.g. "12 fuentes, 8.2s") */
  completionDetail?: string
}

// ---------------------------------------------------------------------------
// Document Preview Types — Real-time document generation with live preview
// ---------------------------------------------------------------------------

/** Supported clinical document section identifiers */
export type DocumentSectionId =
  | 'header'
  | 'subjetivo' | 'objetivo' | 'analisis' | 'plan'       // SOAP
  | 'datos' | 'intervencion' | 'respuesta'                 // DAP / BIRP (some overlap with SOAP)
  | 'comportamiento'                                        // BIRP
  | 'objetivos' | 'intervenciones' | 'timeline' | 'indicadores' // plan_tratamiento
  | 'resumen' | 'evolucion' | 'conclusiones'               // resumen_caso
  | 'firma'                                                 // signature block
  | string                                                  // extensible

/** A single section of a document being generated in real-time */
export interface DocumentSection {
  id: DocumentSectionId
  title: string
  content: string
  /** 0-1 progress within this section (1 = complete) */
  progress: number
}

/** SSE event: a partial or complete preview of a document section */
export interface DocumentPreviewEvent {
  /** Unique document generation ID (stable across sections) */
  documentId: string
  /** The section being updated */
  section: DocumentSection
  /** Overall generation progress 0-1 */
  overallProgress: number
  /** Document type being generated */
  documentType: string
  /** Cumulative markdown of the full document so far */
  accumulatedMarkdown: string
}

/** SSE event: final document ready for download */
export interface DocumentReadyEvent {
  /** Same documentId as DocumentPreviewEvent */
  documentId: string
  /** Full markdown content of the completed document */
  markdown: string
  /** Document type */
  documentType: string
  /** Format(s) available for export */
  availableFormats: Array<'pdf' | 'docx' | 'markdown'>
  /** Generation duration in ms */
  durationMs: number
}

// ---------------------------------------------------------------------------
// Persisted Clinical Document — Survives page reload and session switches
// ---------------------------------------------------------------------------

/** A clinical document persisted to Firestore under the session's documents subcollection */
export interface ClinicalDocument {
  /** Unique document ID (matches documentId from generation events) */
  id: string
  /** The session this document belongs to */
  sessionId: string
  /** Patient ID (denormalized for queries) */
  patientId?: string
  /** Document type (SOAP, DAP, BIRP, plan_tratamiento, resumen_caso) */
  documentType: string
  /** Full markdown content — editable by user or AI */
  markdown: string
  /** Current version number (incremented on each edit) */
  version: number
  /** Who created the document */
  createdBy: 'ai' | 'user'
  /** Timestamp of creation */
  createdAt: Date
  /** Timestamp of last modification */
  updatedAt: Date
  /** Generation duration in ms (original generation only) */
  generationDurationMs?: number
  /** Estado de verdad y metadatos de verificación */
  verificationMetadata?: import('@/types/memory-types').VerificationMetadata
}

// Granular message processing status for transparency UI
export interface MessageProcessingStatus {
  phase: ProcessingPhase
  startedAt: Date
  routingInfo?: {
    targetAgent: AgentType
    confidence: number
    reasoning: string
  }
  toolExecutions: ToolExecutionEvent[]
  bullets: ReasoningBullet[]
  isComplete: boolean
  /** Server-side processing steps visible during the analyzing_intent phase */
  processingSteps?: ProcessingStepEvent[]
}

export interface BulletGenerationContext {
  userInput: string
  sessionContext: any[]
  selectedAgent: string
  extractedEntities: any[]
  clinicalContext?: {
    patientId?: string
    patientSummary?: string
    sessionType: string
  }
  // NUEVOS CAMPOS para coherencia con el razonamiento del agente
  orchestrationReasoning?: string
  agentConfidence?: number
  contextualTools?: any[]
}

export interface ClinicalFile {
  id: string
  name: string
  type: string
  size: number
  uploadDate: Date
  status: "uploading" | "processing" | "processed" | "error"
  geminiFileId?: string
  geminiFileUri?: string  // URI real para createPartFromUri
  sessionId?: string
  processingStatus?: "processing" | "active" | "error" | "timeout"
  // Índice ligero para optimizar referencias contextuales
  summary?: string
  outline?: string
  keywords?: string[]
}

export interface ChatState {
  sessionId: string
  userId: string
  mode: ClinicalMode
  activeAgent: AgentType
  history: ChatMessage[]
  title?: string  // Optional custom title for the conversation
  metadata: {
    createdAt: Date
    lastUpdated: Date
    totalTokens: number
    fileReferences: string[]
  }
  clinicalContext: {
    patientId?: string
    supervisorId?: string
    sessionType: string
    confidentialityLevel: "high" | "medium" | "low"
  }
  // 🚨 RISK STATE: Mantiene el estado de riesgo durante toda la sesión
  riskState?: {
    isRiskSession: boolean;           // Si la sesión tiene contenido de riesgo
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    detectedAt: Date;                 // Cuándo se detectó el riesgo
    riskType?: 'risk' | 'stress' | 'sensitive_content';
    lastRiskCheck: Date;              // Última vez que se verificó el riesgo
    consecutiveSafeTurns: number;     // Turnos consecutivos sin contenido de riesgo
  }
  // 🏥 PATIENT SESSION META: Full patient context metadata persisted to storage
  // This ensures patient context survives page reloads and session recovery
  sessionMeta?: PatientSessionMeta
  // AI-generated summary produced at session close or after significant exchanges
  sessionSummary?: SessionSummaryData
}

/**
 * AI-generated session summary for progressive context loading.
 *
 * Generated by a sub-agent at session close (or periodically for long sessions).
 * Stored as a field on the session document so it can be read without loading messages.
 * Inspired by Claude Code's `session-memory.md` pattern.
 *
 * Typical size: 500-1200 chars (fits in a single Firestore document field).
 */
export interface SessionSummaryData {
  /** Main clinical topics discussed */
  mainTopics: string[]
  /** Brief assessment of therapeutic progress */
  therapeuticProgress: string
  /** Risk flags identified during the session */
  riskFlags: string[]
  /** Suggested next steps for the following session */
  nextSteps: string[]
  /** Key clinical observations by the agent */
  keyInsights: string[]
  /** When the summary was generated */
  generatedAt: Date
  /** Approximate token count of the summary */
  tokenCount: number
}

export interface FichaClinicaState {
  fichaId: string
  pacienteId: string
  estado: 'generando' | 'completado' | 'error' | 'actualizando'
  contenido: string
  version: number
  ultimaActualizacion: Date
  historialVersiones: { version: number, fecha: Date }[]
}

export interface AgentConfig {
  name: string
  systemInstruction: string
  tools: any[]
  config: any
  color: string
  description: string
}

// Interfaces para paginación optimizada
export interface PaginationOptions {
  pageSize?: number
  pageToken?: string
  sortBy?: 'lastUpdated' | 'created'
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  items: T[]
  nextPageToken?: string
  totalCount: number
  hasNextPage: boolean
}

// Interface para adaptadores de storage con paginación
export interface StorageAdapter {
  initialize(): Promise<void>
  saveChatSession(chatState: ChatState): Promise<void>
  loadChatSession(sessionId: string): Promise<ChatState | null>
  getUserSessions(userId: string): Promise<ChatState[]>
  getUserSessionsPaginated(userId: string, options?: PaginationOptions): Promise<PaginatedResponse<ChatState>>
  deleteChatSession(sessionId: string): Promise<void>
  saveClinicalFile(file: ClinicalFile): Promise<void>
  getClinicalFiles(sessionId: string): Promise<ClinicalFile[]>
  // Fichas clínicas
  saveFichaClinica(ficha: FichaClinicaState): Promise<void>
  getFichaClinicaById(fichaId: string): Promise<FichaClinicaState | null>
  getFichasClinicasByPaciente(pacienteId: string): Promise<FichaClinicaState[]>
  clearAllData(): Promise<void>
}

// Patient Library Types - Phase 1 Implementation
export interface PatientDemographics {
  ageRange?: string
  gender?: string
  occupation?: string
  location?: string
}

export interface PatientAttachment {
  id: string
  name: string
  type: string
  uri?: string
  hash?: string
  uploadDate: Date
  size?: number
}

export interface PatientSummaryCache {
  text: string
  version: number
  updatedAt: string // ISO string
  tokenCount?: number
}

export interface PatientConfidentiality {
  pii: boolean
  redactionRules?: string[]
  accessLevel: "high" | "medium" | "low"
}

export interface PatientRecord {
  id: string
  displayName: string
  demographics?: PatientDemographics
  tags?: string[] // conditions, therapy focus areas
  notes?: string // clinician notes
  attachments?: PatientAttachment[]
  summaryCache?: PatientSummaryCache
  confidentiality?: PatientConfidentiality
  createdAt: Date
  updatedAt: Date
  // Soft delete fields to prevent cascade deletion of conversations
  isDeleted?: boolean
  deletedAt?: Date
}

// Patient session metadata for orchestrator injection
export interface PatientSessionMeta {
  sessionId: string
  userId: string
  patient: {
    reference: string
    summaryHash: string
    version: number
    confidentialityLevel: "high" | "medium" | "low"
    // Optional full summary text for first-turn enrichment
    summaryText?: string
  }
  clinicalMode: string
  activeAgent: string
  createdAt: string
  // LOCAL-FIRST: Pre-computed at session start, reused on every message
  operationalHints?: ClientContext['operationalHints']
}

// LOCAL-FIRST: Pre-computed context sent from client to avoid server Firestore reads
export interface ClientContext {
  // Replaces loadPatientFromFirestore + getFichasClinicasByPaciente
  patientSummary: string

  // Replaces collectOperationalMetadata's patient/fichas Firestore reads
  operationalHints: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    requiresImmediateAttention: boolean
    sessionCount: number
    therapeuticPhase: 'assessment' | 'intervention' | 'maintenance' | 'closure'
    treatmentModality?: string
  }

  // Replaces getRelevantMemories() — pre-ranked client-side
  rankedMemories: Array<{
    category: 'observation' | 'pattern' | 'therapeutic-preference'
    content: string
  }>
}

// Enhanced ChatState to support patient context
export interface PatientChatState extends ChatState {
  patientContext?: {
    patientId: string
    patientSummary: string
    sessionMeta: PatientSessionMeta
  }
}

// Patient storage adapter interface
export interface PatientStorageAdapter {
  initialize(): Promise<void>
  savePatientRecord(patient: PatientRecord): Promise<void>
  loadPatientRecord(patientId: string): Promise<PatientRecord | null>
  getAllPatients(): Promise<PatientRecord[]>
  searchPatients(query: string): Promise<PatientRecord[]>
  deletePatientRecord(patientId: string): Promise<void>
  updatePatientSummaryCache(patientId: string, summary: PatientSummaryCache): Promise<void>
  clearAllPatients(): Promise<void>
}
