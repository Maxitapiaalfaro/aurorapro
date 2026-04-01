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
  result?: {
    sourcesFound?: number
    sourcesValidated?: number
  }
  /** Academic sources retrieved from Parallel AI, displayed as a readable list */
  sources?: AcademicSourceReference[]
}

/** A single academic source reference for display in the execution timeline */
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
  result?: {
    sourcesFound?: number
    sourcesValidated?: number
  }
  /** Academic sources from Parallel AI, attached on completion */
  academicSources?: AcademicSourceReference[]
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
