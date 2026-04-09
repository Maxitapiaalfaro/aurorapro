import 'server-only'

import { clinicalAgentRouter } from "./clinical-agent-router"
import { sessionMetricsTracker } from "./session-metrics-comprehensive-tracker"
import { getAdminApp } from './firebase-admin-config'
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { PatientSummaryBuilder } from "./patient-summary-builder"
// Removed singleton-monitor import to avoid circular dependency
import * as Sentry from '@sentry/nextjs'
import type { AgentType, ClinicalMode, ChatState, ChatMessage, ClinicalFile, PatientSessionMeta, PatientRecord, ReasoningBullet, ExecutionTimeline, ExecutionStep } from "@/types/clinical-types"
import type { OperationalMetadata, AgentTransition } from "@/types/operational-metadata"
import { queryCheckpoint, type QueryProfile } from '@/lib/utils/query-profiler'

import { createLogger } from '@/lib/logger'

const systemLogger = createLogger('system')
const sessionLogger = createLogger('session')

/** Load a PatientRecord from Firestore (server-side, using firebase-admin). */
export async function loadPatientFromFirestore(userId: string, patientId: string): Promise<PatientRecord | null> {
  try {
    const adminDb = getAdminFirestore(getAdminApp())
    const snap = await adminDb
      .collection('psychologists').doc(userId)
      .collection('patients').doc(patientId)
      .get()
    if (!snap.exists) return null
    const data = snap.data() as any
    // Revive Timestamps to Dates
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate()
    if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate()
    return data as PatientRecord
  } catch (err) {
    sessionLogger.warn(`⚠️ Failed to load patient ${patientId}`, { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** Generate a patient ID (server-side). Same format as client-side. */
export function generatePatientId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 8)
  return `patient_${timestamp}_${randomPart}`
}

/** Save a PatientRecord to Firestore (server-side, using firebase-admin). */
export async function savePatientToFirestore(
  psychologistId: string,
  patient: PatientRecord
): Promise<void> {
  const adminDb = getAdminFirestore(getAdminApp())
  const ref = adminDb
    .collection('psychologists').doc(psychologistId)
    .collection('patients').doc(patient.id)

  const data: Record<string, unknown> = { ...patient }
  // Convert Dates to Firestore Timestamps
  if (data.createdAt instanceof Date) {
    data.createdAt = AdminTimestamp.fromDate(data.createdAt as Date)
  }
  if (data.updatedAt instanceof Date) {
    data.updatedAt = AdminTimestamp.fromDate(data.updatedAt as Date)
  }

  await ref.set(data, { merge: true })
}

/** List patients for a psychologist from Firestore (server-side). */
export async function listPatientsFromFirestore(
  psychologistId: string,
  options?: { searchTerm?: string; limit?: number }
): Promise<PatientRecord[]> {
  const adminDb = getAdminFirestore(getAdminApp())
  const limit = Math.min(options?.limit ?? 50, 100)

  const snapshot = await adminDb
    .collection('psychologists').doc(psychologistId)
    .collection('patients')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get()

  let patients: PatientRecord[] = snapshot.docs.map(doc => {
    const data = doc.data() as any
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate()
    if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate()
    return data as PatientRecord
  })

  // In-memory search (patient count per psychologist is small)
  if (options?.searchTerm) {
    const term = options.searchTerm.toLowerCase()
    patients = patients.filter(p =>
      p.displayName.toLowerCase().includes(term) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(term))) ||
      (p.notes && p.notes.toLowerCase().includes(term))
    )
  }

  return patients
}

export class HopeAISystem {
  private _initialized = false
  private storage: any = null

  // Public getter for initialization status
  public get initialized(): boolean {
    return this._initialized
  }
  
  // Método privado para guardar en el sistema de almacenamiento del servidor
  // PERF: No pre-read — set({merge:true}) in the storage adapter is idempotent (creates or updates).
  private async saveChatSessionBoth(chatState: ChatState): Promise<void> {
    try {
      chatState.metadata.lastUpdated = new Date()
      await this.storage.saveChatSession(chatState)
      sessionLogger.info(`💾 Chat session saved: ${chatState.sessionId}`)
    } catch (error) {
      sessionLogger.error(`❌ Error saving chat session ${chatState.sessionId}`, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * PERF: Save only session metadata without rewriting all messages.
   * Use for metadata-only updates (sessionMeta, clinicalContext, activeAgent).
   */
  private async saveSessionMetadataOnly(chatState: ChatState): Promise<void> {
    try {
      chatState.metadata.lastUpdated = new Date()
      await this.storage.saveSessionMetadataOnly(chatState)
      sessionLogger.debug(`Session metadata saved: ${chatState.sessionId}`)
    } catch (error) {
      sessionLogger.error(`❌ Error saving session metadata ${chatState.sessionId}`, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * PERF: Add a single message to the subcollection (O(1) instead of O(N) full-history rewrite).
   * Resolves userId/patientId from the ChatState automatically.
   */
  private async addMessageToSession(chatState: ChatState, message: ChatMessage): Promise<void> {
    const userId = chatState.userId || 'anonymous'
    const patientId = chatState.clinicalContext?.patientId || chatState.sessionMeta?.patient?.reference || 'default_patient'
    await this.storage.addMessage(userId, patientId, chatState.sessionId, message)
  }

  // Getter público para acceder al storage desde la API
  get storageAdapter() {
    return this.storage
  }

  async initialize(): Promise<void> {
    const isServer = typeof window === 'undefined'
    const startTime = Date.now()
    systemLogger.info('🚀 initialize() called', { isServer })

    if (this._initialized) {
      systemLogger.info('✅ Already initialized, skipping')
      return
    }

    try {
      systemLogger.info('🔧 Starting initialization...')

      // Storage adapter initialization
      systemLogger.debug('🔧 Getting storage adapter...')
      const { getStorageAdapter } = await import('./server-storage-adapter')
      const storage = await getStorageAdapter()
      systemLogger.info('✅ Storage adapter obtained', { adapter: storage?.constructor?.name })

      // Asegurar que el storage esté inicializado
      if (storage && typeof storage.initialize === 'function') {
        systemLogger.debug('🔧 Calling storage.initialize()...')
        await storage.initialize()
        systemLogger.info('✅ Storage initialized successfully')
      } else {
        systemLogger.warn('⚠️ Storage does not have initialize method')
      }

      // Asignar resultados
      this.storage = storage

      // Initialize MCP servers (non-blocking: failures are logged, not thrown)
      try {
        const { initializeMCP } = await import('@/lib/mcp/mcp-init')
        const mcpResult = await initializeMCP()
        if (mcpResult.toolsDiscovered > 0) {
          systemLogger.info(`✅ MCP: ${mcpResult.serversConnected} server(s), ${mcpResult.toolsDiscovered} tool(s)`)
        }
      } catch (mcpErr) {
        systemLogger.warn('⚠️ MCP initialization failed', { error: mcpErr instanceof Error ? mcpErr.message : String(mcpErr) })
      }

      const initTime = Date.now() - startTime
      systemLogger.info(`✅ PARALLEL initialization completed in ${initTime}ms`)

      this._initialized = true
      // 🔒 SECURITY: Console logging disabled in production
    } catch (error) {
      systemLogger.error('❌ Failed to initialize HopeAI System', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  async createClinicalSession(
    userId: string,
    mode: ClinicalMode,
    agent: AgentType,
    sessionId?: string,
    patientSessionMeta?: PatientSessionMeta
  ): Promise<{ sessionId: string; chatState: ChatState }> {
    if (!this._initialized) await this.initialize()

    const finalSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    let chatHistory: ChatMessage[] = []
    let isExistingSession = false

    // Verificación robusta de sesión existente
    if (sessionId) {
      try {
        const existingState = await this.storage.loadChatSession(sessionId)
        if (existingState) {
          sessionLogger.info(`♻️ Restaurando sesión existente: ${sessionId}`)
          chatHistory = existingState.history
          isExistingSession = true
          
          // Update patient context if provided in patientSessionMeta
          if (patientSessionMeta?.patient?.reference) {
            sessionLogger.info(`🏥 Actualizando contexto de paciente: ${patientSessionMeta.patient.reference}`)
            existingState.clinicalContext = {
              ...existingState.clinicalContext,
              patientId: patientSessionMeta.patient.reference,
              confidentialityLevel: patientSessionMeta.patient.confidentialityLevel || existingState.clinicalContext?.confidentialityLevel || "high"
            }
            
            // Save the updated state with patient context
            await this.saveChatSessionBoth(existingState)
          }
          
          // Retornar la sesión existente (ahora con contexto de paciente actualizado si aplica)
          return { sessionId: finalSessionId, chatState: existingState }
        }
      } catch (error) {
        sessionLogger.warn(`⚠️ Error verificando sesión existente ${sessionId}, creando nueva`, { error: error instanceof Error ? error.message : String(error) })
      }
    }

    // Verificación adicional para prevenir duplicación por ID generado
    if (!sessionId) {
      try {
        const potentialExisting = await this.storage.loadChatSession(finalSessionId)
        if (potentialExisting) {
          sessionLogger.warn('⚠️ ID de sesión generado ya existe, regenerando...')
          // Regenerar ID único
          const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          return this.createClinicalSession(userId, mode, agent, newId)
        }
      } catch (error) {
        // Error esperado si la sesión no existe, continuar con la creación
      }
    }

    sessionLogger.info(`🆕 Creando nueva sesión clínica: ${finalSessionId}`)

    // NOTE: The Gemini chat session is created lazily on first sendMessage call
    // (see the getActiveChatSessions guard further below in sendMessage())
    // to avoid triggering Vertex AI initialization during session metadata creation.

    // Create initial chat state with optional patient context
    const chatState: ChatState = {
      sessionId: finalSessionId,
      userId,
      mode,
      activeAgent: agent,
      history: chatHistory,
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalTokens: 0,
        fileReferences: [],
      },
      clinicalContext: {
        patientId: patientSessionMeta?.patient?.reference,
        sessionType: mode,
        confidentialityLevel: patientSessionMeta?.patient?.confidentialityLevel || "high",
      },
    }

    // Save initial state with verification
    await this.saveChatSessionBoth(chatState)

    return { sessionId: finalSessionId, chatState }
  }

  /**
   * 🚨 EDGE CASE DETECTION: Detectar contenido sensible en el mensaje del usuario
   * Usa las mismas keywords que el router, pero sin requerir contexto de paciente
   */
  private detectSensitiveContent(userInput: string, metadata: OperationalMetadata): boolean {
    const inputLower = userInput.toLowerCase();

    // Keywords críticas que siempre requieren routing al clínico
    const criticalKeywords = [
      // Riesgo suicida
      'suicidio', 'suicida', 'matarme', 'acabar con mi vida', 'quitarme la vida',
      // Autolesiones
      'autolesión', 'autolesiones', 'cortarme', 'hacerme daño', 'lastimarme',
      // Violencia y maltrato
      'abuso', 'violencia', 'maltrato', 'agresión', 'golpe', 'golpear', 'pegar', 'pegó',
      'maltrato infantil', 'abuso infantil', 'violencia doméstica', 'violencia intrafamiliar',
      'golpear a un niño', 'golpear a su hijo', 'pegar a un niño', 'pegar a su hijo',
      'le pegó a su hijo', 'le pego a su hijo', 'se le pegó', 'se le pego',
      // Crisis
      'crisis', 'emergencia', 'urgente', 'inmediato',
      // Obligación de informar
      'no quiero informar', 'no informar', 'ocultar', 'no reportar'
    ];

    // Detectar si el mensaje contiene alguna keyword crítica
    const hasCriticalKeyword = criticalKeywords.some(keyword =>
      inputLower.includes(keyword.toLowerCase())
    );

    // También verificar si hay risk flags activos en el paciente
    const hasRiskFlags = metadata.risk_flags_active.length > 0 ||
                        metadata.risk_level === 'high' ||
                        metadata.risk_level === 'critical';

    return hasCriticalKeyword || hasRiskFlags;
  }

  /**
   * METADATA COLLECTION: Recolecta metadata operativa para decisiones de routing
   * Esta metadata informa las decisiones del router, no es un delivery pasivo
   * PERF: Accepts pre-fetched patientRecord and fichas to avoid redundant Firestore reads.
   */
  private collectOperationalMetadata(
    sessionId: string,
    userId: string,
    currentState: ChatState,
    patientReference?: string,
    prefetchedPatientRecord?: any,
    prefetchedFichas?: any[],
    clientOperationalHints?: import('@/types/clinical-types').ClientContext['operationalHints']
  ): OperationalMetadata {
    // 1. TEMPORAL METADATA
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const sessionStartTime = currentState.metadata.createdAt;
    const sessionDurationMs = now.getTime() - sessionStartTime.getTime();
    const sessionDurationMinutes = Math.floor(sessionDurationMs / (1000 * 60));

    const hour = now.getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    // Detectar región basada en timezone
    let region: 'LATAM' | 'EU' | 'US' | 'ASIA' | 'OTHER' = 'OTHER';
    if (timezone.includes('America/')) region = 'LATAM';
    else if (timezone.includes('Europe/')) region = 'EU';
    else if (timezone.includes('US/') || timezone.includes('America/New_York') || timezone.includes('America/Los_Angeles')) region = 'US';
    else if (timezone.includes('Asia/')) region = 'ASIA';

    // 2. RISK METADATA (from client hints or pre-fetched patient record)
    let riskFlags: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = clientOperationalHints?.riskLevel ?? 'low';
    let requiresImmediateAttention = clientOperationalHints?.requiresImmediateAttention ?? false;
    let lastRiskAssessment: Date | null = null;

    if (clientOperationalHints) {
      // LOCAL-FIRST: Use client-computed hints, skip Firestore-derived risk flags
      sessionLogger.debug('🚀 [LOCAL-FIRST] Using client operationalHints for risk metadata');
    } else if (prefetchedPatientRecord) {
      const riskTags = prefetchedPatientRecord.tags?.filter((tag: string) =>
        tag.toLowerCase().includes('riesgo') ||
        tag.toLowerCase().includes('suicid') ||
        tag.toLowerCase().includes('autolesión') ||
        tag.toLowerCase().includes('crisis') ||
        tag.toLowerCase().includes('urgente')
      ) || [];

      riskFlags = riskTags;

      if (riskTags.some((tag: string) => tag.toLowerCase().includes('crítico') || tag.toLowerCase().includes('suicid'))) {
        riskLevel = 'critical';
        requiresImmediateAttention = true;
      } else if (riskTags.some((tag: string) => tag.toLowerCase().includes('alto') || tag.toLowerCase().includes('crisis'))) {
        riskLevel = 'high';
      } else if (riskTags.length > 0) {
        riskLevel = 'medium';
      }

      lastRiskAssessment = prefetchedPatientRecord.updatedAt;
    }

    // 3. AGENT HISTORY METADATA (CPU-only, no I/O)
    const agentTransitions: AgentTransition[] = [];
    const agentTurnCounts: Record<AgentType, number> = {
      socratico: 0,
      clinico: 0,
      academico: 0,
      orquestador: 0
    };

    let lastAgentSwitch: Date | null = null;
    let consecutiveSwitches = 0;
    let previousAgent: AgentType | null = null;
    const fiveMinutesAgo = now.getTime() - (5 * 60 * 1000);

    for (const msg of currentState.history) {
      if (msg.role === 'model' && msg.agent) {
        agentTurnCounts[msg.agent]++;

        if (previousAgent && previousAgent !== msg.agent) {
          const transition: AgentTransition = {
            from: previousAgent,
            to: msg.agent,
            timestamp: msg.timestamp,
            reason: 'detected_from_history'
          };
          agentTransitions.push(transition);
          lastAgentSwitch = msg.timestamp;

          if (msg.timestamp.getTime() >= fiveMinutesAgo) {
            consecutiveSwitches++;
          }
        }

        previousAgent = msg.agent;
      }
    }

    // 4. PATIENT CONTEXT METADATA (from client hints or pre-fetched data)
    let therapeuticPhase: 'assessment' | 'intervention' | 'maintenance' | 'closure' | null = clientOperationalHints?.therapeuticPhase ?? null;
    let sessionCount = clientOperationalHints?.sessionCount ?? 0;
    let lastSessionDate: Date | null = null;
    let treatmentModality: string | null = clientOperationalHints?.treatmentModality ?? null;
    let patientSummaryAvailable = false;

    if (clientOperationalHints) {
      patientSummaryAvailable = true; // Client always provides summary when hints exist
    } else if (prefetchedPatientRecord) {
      patientSummaryAvailable = !!prefetchedPatientRecord.summaryCache;

      const modalityTags = prefetchedPatientRecord.tags?.filter((tag: string) =>
        tag.toLowerCase().includes('tcc') ||
        tag.toLowerCase().includes('cbt') ||
        tag.toLowerCase().includes('psicodinámico') ||
        tag.toLowerCase().includes('humanista') ||
        tag.toLowerCase().includes('sistémica')
      ) || [];

      if (modalityTags.length > 0) {
        treatmentModality = modalityTags[0];
      }

      if (prefetchedFichas) {
        sessionCount = prefetchedFichas.length;

        if (sessionCount === 0) {
          therapeuticPhase = 'assessment';
        } else if (sessionCount <= 3) {
          therapeuticPhase = 'assessment';
        } else if (sessionCount <= 12) {
          therapeuticPhase = 'intervention';
        } else if (sessionCount <= 24) {
          therapeuticPhase = 'maintenance';
        } else {
          therapeuticPhase = 'closure';
        }

        if (prefetchedFichas.length > 0) {
          const sortedFichas = [...prefetchedFichas].sort((a: any, b: any) =>
            new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime()
          );
          lastSessionDate = new Date(sortedFichas[0].ultimaActualizacion);
        }
      }
    }

    // Construir metadata operativa completa
    const operationalMetadata: OperationalMetadata = {
      // Temporal
      timestamp_utc: now.toISOString(),
      timezone,
      local_time: now.toLocaleString('es-ES', { timeZone: timezone }),
      region,
      session_duration_minutes: sessionDurationMinutes,
      time_of_day: timeOfDay,

      // Risk
      risk_flags_active: riskFlags,
      risk_level: riskLevel,
      last_risk_assessment: lastRiskAssessment,
      requires_immediate_attention: requiresImmediateAttention,

      // Agent History
      agent_transitions: agentTransitions,
      agent_turn_counts: agentTurnCounts,
      last_agent_switch: lastAgentSwitch,
      consecutive_switches: consecutiveSwitches,

      // Patient Context
      patient_id: patientReference || null,
      patient_summary_available: patientSummaryAvailable,
      therapeutic_phase: therapeuticPhase,
      session_count: sessionCount,
      last_session_date: lastSessionDate,
      treatment_modality: treatmentModality
    };

    sessionLogger.debug('📊 Operational metadata collected', {
      session_duration_minutes: sessionDurationMinutes,
      time_of_day: timeOfDay,
      region,
      risk_level: riskLevel,
      risk_flags_count: riskFlags.length,
      consecutive_switches: consecutiveSwitches,
      therapeutic_phase: therapeuticPhase,
      session_count: sessionCount
    });

    return operationalMetadata;
  }

  async sendMessage(
    sessionId: string,
    message: string,
    useStreaming = true,
    _suggestedAgent?: string,
    sessionMeta?: PatientSessionMeta,
    onBulletUpdate?: (bullet: import('@/types/clinical-types').ReasoningBullet) => void,
    _onAgentSelected?: (routingInfo: { targetAgent: string; confidence: number; reasoning: string }) => void,
    clientFileReferences?: string[],
    clientFileMetadata?: any[], // Metadata completa de archivos desde el cliente
    psychologistId?: string, // Verified userId from API route
    queryProfile?: QueryProfile, // Pipeline profiler
    clientContext?: import('@/types/clinical-types').ClientContext, // LOCAL-FIRST: pre-computed patient context
    onProcessingStep?: (step: import('@/types/clinical-types').ProcessingStepEvent) => void // Pipeline transparency
  ): Promise<{
    response: any
    updatedState: ChatState
    interactionMetrics?: any
  }> {
    if (!this._initialized) await this.initialize()

    // Helper: emit a processing step event to the client for pipeline transparency
    // Tracks per-step elapsed time so the UI can show durations like Claude Code does.
    const stepTimers = new Map<string, number>()
    const emitStep = (id: string, label: string, status: 'active' | 'completed', detail?: string) => {
      let durationMs: number | undefined
      if (status === 'active') {
        stepTimers.set(id, Date.now())
      } else if (status === 'completed') {
        const start = stepTimers.get(id)
        if (start) durationMs = Date.now() - start
      }
      onProcessingStep?.({ id, label, status, durationMs, detail })
    }
    /** Spanish pluralization helper: returns `${n} ${word}` or `${n} ${word}s` */
    const pl = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`

    emitStep('session_load', 'Cargando sesión…', 'active')

    // Load current session state or create a new one if it doesn't exist
    let currentState = await this.storage.loadChatSession(sessionId)
    queryCheckpoint(queryProfile, 'session_loaded')
    emitStep('session_load', 'Sesión cargada', 'completed')
    if (!currentState) {
      sessionLogger.info(`🆕 Creating new session: ${sessionId}`)
      currentState = {
        sessionId,
        userId: psychologistId || '',
        activeAgent: 'socratic-philosopher', // Default agent
        history: [],
        metadata: {
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalTokens: 0,
          messageCount: 0,
          fileReferences: []
        },
        clinicalContext: {
          patientId: sessionMeta?.patient?.reference,
          sessionType: 'general',
          confidentialityLevel: sessionMeta?.patient?.confidentialityLevel || "high"
        },
        // 🏥 FIX: Persist full sessionMeta to ensure patient context survives reloads
        sessionMeta: sessionMeta
      }
      // Save the new session (fire-and-forget — data already in memory)
      void this.saveChatSessionBoth(currentState).catch(e =>
        sessionLogger.error('Fire-and-forget: saveChatSessionBoth failed:', e)
      )
    } else if (sessionMeta?.patient?.reference && currentState.clinicalContext?.patientId !== sessionMeta.patient.reference) {
      // Update existing session with patient context if provided and different
      sessionLogger.info(`🏥 Updating existing session with patient context: ${sessionMeta.patient.reference}`)
      currentState.clinicalContext = {
        ...currentState.clinicalContext,
        patientId: sessionMeta.patient.reference,
        confidentialityLevel: sessionMeta.patient.confidentialityLevel || currentState.clinicalContext?.confidentialityLevel || "high"
      }
      // 🏥 FIX: Also update sessionMeta in storage
      currentState.sessionMeta = sessionMeta
      // PERF: metadata-only update — no messages changed, skip full history rewrite (fire-and-forget)
      void this.saveSessionMetadataOnly(currentState).catch(e =>
        sessionLogger.error('Fire-and-forget: saveSessionMetadataOnly (patient context) failed:', e)
      )
    } else if (sessionMeta && !currentState.sessionMeta) {
      // 🏥 FIX: If sessionMeta is provided but not yet saved, save it now
      sessionLogger.info(`🏥 Adding sessionMeta to existing session: ${sessionId}`)
      currentState.sessionMeta = sessionMeta
      // PERF: metadata-only update — no messages changed (fire-and-forget)
      void this.saveSessionMetadataOnly(currentState).catch(e =>
        sessionLogger.error('Fire-and-forget: saveSessionMetadataOnly (sessionMeta) failed:', e)
      )
    }

    // 🎯 START COMPREHENSIVE METRICS TRACKING (after currentState is loaded)
    queryCheckpoint(queryProfile, 'saves_dispatched')
    const interactionId = sessionMetricsTracker.startInteraction(sessionId, currentState.userId, message);

    // Hoist patient reference derivation (needed by parallel I/O below)
    const patientReference = sessionMeta?.patient?.reference || currentState.clinicalContext?.patientId;
    const providedSummary = sessionMeta?.patient?.summaryText;

    // ─── PERF: Parallel I/O — fire ALL independent operations at once ───
    // LOCAL-FIRST: When clientContext is provided, skip all 3 Firestore reads
    // (patient record, fichas, clinical memories). Client already has this data.
    const hasClientContext = !!clientContext
    if (hasClientContext) {
      sessionLogger.info('🚀 [LOCAL-FIRST] clientContext provided — skipping Firestore reads for patient/fichas/memories')
      emitStep('patient_context', 'Contexto del paciente (local)…', 'active')
      emitStep('patient_context', 'Contexto del paciente (local)', 'completed')
    } else if (patientReference) {
      emitStep('patient_context', 'Consultando historial clínico…', 'active')
    }

    const [
      sessionFiles,
      { ContextWindowManager },
      patientRecord,
      fichas,
      clinicalMemories,
      priorSessionSummaries,
    ] = await Promise.all([
      // 1. Session files from server storage
      this.getPendingFilesForSession(sessionId),

      // 2. Context window manager (dynamic import)
      import('./context-window-manager'),

      // 3. Patient record from Firestore — SKIPPED when clientContext provided
      (!hasClientContext && patientReference && !providedSummary && currentState.userId)
        ? loadPatientFromFirestore(currentState.userId, patientReference).catch((err: unknown) => {
            sessionLogger.warn(`⚠️ Error loading patient record: ${err instanceof Error ? err.message : String(err)}`)
            return null
          })
        : Promise.resolve(null),

      // 4. Fichas clínicas — SKIPPED when clientContext provided
      (!hasClientContext && patientReference)
        ? this.storage.getFichasClinicasByPaciente(patientReference).catch((err: unknown) => {
            sessionLogger.warn(`⚠️ Error loading fichas: ${err instanceof Error ? err.message : String(err)}`)
            return [] as any[]
          })
        : Promise.resolve([] as any[]),

      // 5. Clinical memories — SKIPPED when clientContext provided
      (!hasClientContext && patientReference && currentState.userId)
        ? import('./clinical-memory-system').then(m =>
            m.getRelevantMemories(currentState.userId, patientReference, message, 5)
          ).catch((err: unknown) => {
            sessionLogger.warn('⚠️ Failed to retrieve clinical memories (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
            return [] as any[]
          })
        : Promise.resolve([] as any[]),

      // 6. Prior session summaries — progressive context loading (Level 1)
      // Loads AI-generated summaries of recent sessions without reading all messages.
      (patientReference && currentState.userId)
        ? this.storage.loadPriorSessionSummaries(
            currentState.userId,
            patientReference,
            sessionId,
            5, // Max 5 prior session summaries
          ).catch((err: unknown) => {
            sessionLogger.warn('⚠️ Failed to load prior session summaries (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
            return [] as any[]
          })
        : Promise.resolve([] as any[]),
    ])
    queryCheckpoint(queryProfile, 'parallel_io_complete')
    if (!hasClientContext && patientReference) {
      // Build a personalized detail string showing what was loaded
      const detailParts: string[] = []
      if (patientRecord) detailParts.push('registro')
      const fichaCount = (fichas as any[] | null)?.length ?? 0
      if (fichaCount > 0) detailParts.push(pl(fichaCount, 'ficha'))
      const memoryCount = (clinicalMemories as any[] | null)?.length ?? 0
      if (memoryCount > 0) detailParts.push(pl(memoryCount, 'memoria'))
      // Use the loaded patient record's displayName for a personalized label
      const patientName = (patientRecord as any)?.displayName
      const completedLabel = patientName
        ? `Historial de ${patientName} cargado`
        : 'Historial clínico cargado'
      emitStep('patient_context', completedLabel, 'completed', detailParts.length > 0 ? detailParts.join(', ') : undefined)
    }

    // 📁 DEBUG: Log fallback chain parameters
    sessionLogger.debug('📁 File resolution fallback chain', {
      sessionFiles: sessionFiles?.length || 0,
      clientFileReferences: clientFileReferences?.length || 0,
      clientFileReferencesIds: clientFileReferences || [],
      clientFileMetadata: clientFileMetadata?.length || 0,
      historyMessagesWithFiles: currentState?.history?.filter((m: any) => m.fileReferences?.length > 0).length || 0
    })

    // Fallback chain for resolving session files:
    // 0. Client-provided fileMetadata (HIGHEST PRIORITY - bypass serverless storage)
    // 1. getPendingFilesForSession (server storage) — from parallel I/O above
    // 2. Client-provided fileReferences (survives serverless cold starts)
    // 3. Most recent message with fileReferences from history
    let resolvedSessionFiles = sessionFiles || []

    // 🚀 NEW: Priority bypass - use client metadata if provided (serverless-safe)
    if (clientFileMetadata && clientFileMetadata.length > 0) {
      try {
        sessionLogger.debug('📁 Using client-provided file metadata (bypass storage)', { files: clientFileMetadata.map((f: any) => f.name) })
        // Convert metadata to ClinicalFile format
        resolvedSessionFiles = clientFileMetadata.map((meta: any) => ({
          ...meta,
          uploadDate: new Date(meta.uploadDate) // Ensure Date object
        }))
        sessionLogger.info(`✅ Resolved ${resolvedSessionFiles.length} files from client metadata`)
      } catch (e) {
        sessionLogger.error('❌ Error parsing client file metadata', { error: e instanceof Error ? e.message : String(e) })
        // Fall through to other resolution methods
      }
    }

    if ((!resolvedSessionFiles || resolvedSessionFiles.length === 0) && clientFileReferences && clientFileReferences.length > 0) {
      // Fallback: use file IDs sent from the client (reliable across serverless invocations)
      sessionLogger.debug('📁 Attempting to resolve client file references...', { clientFileReferences })
      try {
        let clientFiles = await this.getFilesByIds(clientFileReferences)
        sessionLogger.debug('📁 getFilesByIds returned', {
          count: clientFiles?.length || 0,
          files: clientFiles?.map((f: any) => ({ id: f.id, name: f.name })) || []
        })
        if (clientFiles && clientFiles.length > 0) {
          try {
            const { clinicalFileManager } = await import('./clinical-file-manager')
            clientFiles = await Promise.all(clientFiles.map(f => clinicalFileManager.buildLightweightIndex(f)))
          } catch {}
          resolvedSessionFiles = clientFiles
          sessionLogger.info(`📎 Resolved files from client fileReferences: ${clientFiles.map((f: any) => f.name).join(', ')}`)
        } else {
          sessionLogger.warn('⚠️ getFilesByIds returned empty array for IDs', { clientFileReferences })
        }
      } catch (e) {
        sessionLogger.warn('⚠️ Could not resolve client file references', { error: e instanceof Error ? e.message : String(e) })
      }
    }

    if ((!resolvedSessionFiles || resolvedSessionFiles.length === 0) && currentState?.history?.length) {
      try {
        const lastMsgWithFiles = [...currentState.history].reverse().find((m: any) => m.fileReferences && m.fileReferences.length > 0)
        if (lastMsgWithFiles) {
          let reuseFiles = await this.getFilesByIds(lastMsgWithFiles.fileReferences)
          // Build lightweight indices for smarter referencing when needed
          try {
            const { clinicalFileManager } = await import('./clinical-file-manager')
            reuseFiles = await Promise.all(reuseFiles.map(f => clinicalFileManager.buildLightweightIndex(f)))
          } catch {}
          if (reuseFiles && reuseFiles.length > 0) {
            resolvedSessionFiles = reuseFiles
            sessionLogger.info(`📎 Reusing last referenced files for context: ${reuseFiles.map((f: any) => f.name).join(', ')}`)
          }
        }
      } catch (e) {
        sessionLogger.warn('⚠️ Could not reuse last referenced files for context', { error: e instanceof Error ? e.message : String(e) })
      }
    }

    try {
      emitStep('build_context', 'Preparando contexto de conversación…', 'active')

      // 🔧 Context Window Manager — compress history BEFORE sending to agent
      const contextWindowManager = new ContextWindowManager({
        maxExchanges: 50,       // Preservar últimos 50 intercambios = 100 mensajes max para evitar pérdida de contexto
        triggerTokens: 800000,  // Activar compresión a 800k tokens (80% del context window de 1M)
        targetTokens: 600000,   // Reducir a 600k tokens después de compresión
        enableLogging: true
      });

      // Convertir historial completo al formato Content[]
      const rawSessionContext = currentState.history.map((msg: ChatMessage) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      // Aplicar compresión inteligente del contexto (CPU-only, no I/O)
      const contextResult = contextWindowManager.processContext(rawSessionContext, message);

      // Usar contexto optimizado (comprimido si es necesario)
      const sessionContext = contextResult.processedContext;

      sessionLogger.debug('🔄 Context Window Applied', {
        originalMessages: rawSessionContext.length,
        optimizedMessages: sessionContext.length,
        estimatedTokens: contextResult.metrics.tokensEstimated,
        compressionApplied: contextResult.metrics.compressionApplied,
        hasFiles: resolvedSessionFiles.length > 0
      });

      sessionLogger.debug('🏥 SessionMeta received', {
        hasSessionMeta: !!sessionMeta,
        patientReference: sessionMeta?.patient?.reference || 'None',
        sessionId: sessionMeta?.sessionId || sessionId
      });

      // ─── Build patient summary from pre-fetched data (CPU-only) ───
      let patientSummary: string | undefined = undefined;

      if (clientContext?.patientSummary) {
        // LOCAL-FIRST: Client already built the summary
        patientSummary = clientContext.patientSummary;
        sessionLogger.info(`🚀 [LOCAL-FIRST] Using clientContext.patientSummary (length=${patientSummary.length})`);
      } else if (providedSummary) {
        patientSummary = providedSummary;
        sessionLogger.info(`🏥 Using provided patient summaryText from sessionMeta (length=${providedSummary.length})`);
      } else if (patientRecord) {
        const isFirstPatientMessage = currentState.history.length === 0 ||
          !currentState.history.some((msg: any) => msg.content?.includes(patientRecord.displayName));

        if (isFirstPatientMessage) {
          const latestFicha = fichas
            .filter((f: any) => f.estado === 'completado')
            .sort((a: any, b: any) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0] || null;

          patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patientRecord, latestFicha);

          if (latestFicha) {
            sessionLogger.info(`🏥 ✅ First message: Using FULL ficha clínica v${latestFicha.version} as patient context`);
          } else if (patientRecord.summaryCache && PatientSummaryBuilder.isCacheValid(patientRecord)) {
            sessionLogger.info(`🏥 ✅ First message: Using cached patient summary`);
          } else {
            sessionLogger.info(`🏥 ✅ First message: Built fresh patient summary for ${patientRecord.displayName}`);
          }
        } else {
          patientSummary = `Continuing conversation with ${patientRecord.displayName}. Patient context already provided in previous messages.`;
          sessionLogger.info('🏥 ⚡ Subsequent message: Using brief patient reference');
        }
      }

      const enrichedSessionContext: {
        patient_reference?: string;
        patient_summary?: string;
        clinicalMemories?: any[];
        priorSessionSummaries?: any[];
      } = {
        patient_reference: patientReference,
        patient_summary: patientSummary,
      }

      // LOCAL-FIRST: Use client-ranked memories when available, fall back to server-fetched
      const effectiveMemories = clientContext?.rankedMemories?.length
        ? clientContext.rankedMemories
        : clinicalMemories

      if (effectiveMemories.length > 0) {
        enrichedSessionContext.clinicalMemories = effectiveMemories
        sessionLogger.info(`🧠 Clinical memories injected: ${effectiveMemories.length} memories for patient ${patientReference}${clientContext ? ' (client-ranked)' : ''}`)
      }

      // PROGRESSIVE CONTEXT: Inject prior session summaries (Level 1 — no message reads)
      const effectiveSummaries = (priorSessionSummaries as any[])?.filter(
        (s: any) => s.sessionSummary
      ).map((s: any) => s.sessionSummary) || []
      if (effectiveSummaries.length > 0) {
        enrichedSessionContext.priorSessionSummaries = effectiveSummaries
        sessionLogger.info(`📋 Prior session summaries injected: ${effectiveSummaries.length} summaries for patient ${patientReference}`)
      }

      // ─── Operational metadata (now synchronous — uses pre-fetched or client-provided data) ───
      const operationalMetadata = this.collectOperationalMetadata(
        sessionId,
        currentState.userId,
        currentState,
        patientReference,
        patientRecord,
        fichas,
        clientContext?.operationalHints
      );

      // Agregar el mensaje del usuario al historial
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: message,
        role: "user",
        timestamp: new Date(),
        // OPTIMIZACIÓN: Solo referenciar IDs de archivos, no objetos completos
        fileReferences: resolvedSessionFiles?.map(file => file.id) || [],
        // ELIMINADO: attachments duplicados - usar solo fileReferences
      }

      currentState.history.push(userMessage)

      // Derivar título de conversación si es el primer mensaje del usuario y no existe título
      const userMessageCount = currentState.history.filter((m: ChatMessage) => m.role === 'user').length
      if (!currentState.title && userMessageCount === 1) {
        const derivedTitle = this.deriveConversationTitleFromFirstUserMessage(userMessage.content, 50)
        currentState.title = derivedTitle || `Sesión ${currentState.activeAgent}`
      }

      sessionLogger.debug('📝 Mensaje del usuario agregado al historial', {
        historyLength: currentState.history.length,
        userMessageId: userMessage.id,
        userMessageContent: userMessage.content.substring(0, 50),
        fileReferences: userMessage.fileReferences || [],
        fileCount: userMessage.fileReferences?.length || 0
      })

      // Build enriched context for the unified agent (no routing needed)
      const enrichedAgentContext = {
        sessionFiles: resolvedSessionFiles || [],
        patient_reference: patientReference,
        patient_summary: patientSummary,
        operationalMetadata: operationalMetadata,
        clinicalMemories: enrichedSessionContext.clinicalMemories || [],
        priorSessionSummaries: enrichedSessionContext.priorSessionSummaries || [],
      }

      sessionLogger.debug(`🏥 SessionMeta patient reference: ${sessionMeta?.patient?.reference || 'None'}`)
      sessionLogger.debug('📁 Files in enrichedAgentContext.sessionFiles', {
        count: resolvedSessionFiles?.length || 0,
        files: resolvedSessionFiles?.map((f: any) => ({
          id: f.id,
          name: f.name,
          geminiFileUri: f.geminiFileUri,
          geminiFileId: f.geminiFileId,
          status: f.status
        })) || []
      })

      // Ensure the Gemini chat session exists in the router (lazy creation / cross-invocation recovery)
      queryCheckpoint(queryProfile, 'gemini_session_ready')
      // Personalized detail: show what went into the context
      const ctxParts: string[] = []
      if (currentState.history.length > 1) ctxParts.push(pl(currentState.history.length, 'mensaje'))
      if (resolvedSessionFiles && resolvedSessionFiles.length > 0) ctxParts.push(pl(resolvedSessionFiles.length, 'archivo'))
      if (enrichedSessionContext.clinicalMemories && enrichedSessionContext.clinicalMemories.length > 0) ctxParts.push(pl(enrichedSessionContext.clinicalMemories.length, 'memoria'))
      if (enrichedSessionContext.priorSessionSummaries && enrichedSessionContext.priorSessionSummaries.length > 0) ctxParts.push(pl(enrichedSessionContext.priorSessionSummaries.length, 'resumen previo'))
      emitStep('build_context', 'Contexto preparado', 'completed', ctxParts.length > 0 ? ctxParts.join(', ') : undefined)

      if (!clinicalAgentRouter.getActiveChatSessions().has(sessionId)) {
        try {
          // CRITICAL FIX: Exclude the current user message (just pushed above) from the
          // history passed to createChatSession. The SDK concatenates getHistory()
          // with the new sendMessage() content, so including the current message in
          // the initial history produces consecutive user turns (user→user) in the
          // Gemini API `contents` array. The model may then ignore the second user
          // turn — which carries the file parts — causing the "files sent but agent
          // can't see them" bug.
          const historyForSession = currentState.history.slice(0, -1)
          await clinicalAgentRouter.createChatSession(sessionId, undefined, historyForSession)
        } catch (chatSessionError) {
          const msg = chatSessionError instanceof Error ? chatSessionError.message : String(chatSessionError)
          throw new Error(`Error al inicializar la sesión de chat: ${msg}`)
        }
      }

      emitStep('model_call', 'Conectando con modelo de análisis…', 'active')

      const response = await clinicalAgentRouter.sendMessage(
        sessionId,
        message,
        useStreaming,
        enrichedAgentContext,
        interactionId,  // 📊 Pass interaction ID for metrics tracking
        currentState.userId  // 🔒 P0.1: Pass psychologistId for tool permission checks
      )

      emitStep('model_call', 'Modelo conectado', 'completed')

      // Save user message: O(1) append + metadata update (instead of rewriting ALL messages)
      currentState.metadata.lastUpdated = new Date()
      await Promise.all([
        this.addMessageToSession(currentState, userMessage),
        this.saveSessionMetadataOnly(currentState),
      ])

      sessionLogger.info('💾 Estado guardado en DB con mensaje del usuario', {
        sessionId: sessionId,
        historyLength: currentState.history.length
      })

      // Handle response based on streaming or not
      let responseContent = ""
      if (useStreaming) {
        // For streaming, we need to preserve the async generator while adding routing info
        // The response from clinical router is already an async generator
        const streamingResponse = response
        
        // Add routing info as a property on the async generator
        const routingInfo = {
          detectedIntent: 'unified_agent',
          targetAgent: 'aurora',
          confidence: 1.0,
          extractedEntities: [] as string[]
        }
        if (streamingResponse && typeof streamingResponse[Symbol.asyncIterator] === 'function') {
          (streamingResponse as any).routingInfo = routingInfo
        }
        
        // 📊 METRICS TRACKING for streaming
        // Note: Streaming metrics will be automatically completed in the wrapper async generator
        // when the stream finishes. DO NOT call completeInteraction here - it would complete
        // with 0 tokens before the stream has finished.
        
        sessionLogger.info(`🎉 Streaming interaction setup completed: ${sessionId} | Metrics will be captured on stream completion`);
        
        // Wrap the async generator to save the assistant response to history
        // when the stream is fully consumed by the API route
        const self = this
        const wrappedStream = (async function* () {
          let accumulatedText = ''
          // ── METADATA COLLECTION: Accumulate metadata as it flows through chunks ──
          const collectedGroundingUrls: Array<{title: string, url: string, domain?: string, doi?: string, authors?: string, year?: number, journal?: string}> = []
          const collectedToolSteps: ExecutionStep[] = []
          // Track active tool calls so we can compute duration on completion
          const toolStartTimes = new Map<string, number>()
          try {
            for await (const chunk of streamingResponse as AsyncIterable<any>) {
              if (chunk.text) {
                accumulatedText += chunk.text
              }
              // ── Collect grounding URLs from streaming chunks ──
              if (chunk.groundingUrls && Array.isArray(chunk.groundingUrls)) {
                for (const url of chunk.groundingUrls) {
                  // Deduplicate by URL
                  if (url?.url && !collectedGroundingUrls.some(u => u.url === url.url)) {
                    collectedGroundingUrls.push(url)
                  }
                }
              }
              // ── Collect tool execution metadata for ExecutionTimeline ──
              if (chunk.metadata) {
                if (chunk.metadata.type === 'tool_call_start') {
                  toolStartTimes.set(chunk.metadata.toolName, Date.now())
                  collectedToolSteps.push({
                    id: `tool_${collectedToolSteps.length}`,
                    label: chunk.metadata.toolName,
                    status: 'active',
                    toolName: chunk.metadata.toolName,
                    query: chunk.metadata.query,
                  })
                } else if (chunk.metadata.type === 'tool_call_complete') {
                  const startTime = toolStartTimes.get(chunk.metadata.toolName)
                  const durationMs = startTime ? Date.now() - startTime : undefined
                  // Find and update the matching active step
                  const stepIdx = [...collectedToolSteps].reverse().findIndex(
                    s => s.toolName === chunk.metadata.toolName && s.status === 'active'
                  )
                  if (stepIdx >= 0) {
                    const realIdx = collectedToolSteps.length - 1 - stepIdx
                    collectedToolSteps[realIdx] = {
                      ...collectedToolSteps[realIdx],
                      status: 'completed',
                      durationMs,
                      result: {
                        sourcesFound: chunk.metadata.sourcesFound,
                        sourcesValidated: chunk.metadata.sourcesValidated,
                      },
                      sources: chunk.metadata.academicSources,
                      completionDetail: chunk.metadata.completionDetail,
                    }
                  }
                }
              }
              yield chunk
            }
          } finally {
            // Stream fully consumed (or aborted) — persist the assistant response
            if (accumulatedText) {
              // Build ExecutionTimeline from collected tool steps
              const executionTimeline: ExecutionTimeline | undefined =
                collectedToolSteps.length > 0
                  ? {
                      agentType: currentState.activeAgent,
                      agentDisplayName: currentState.activeAgent,
                      steps: collectedToolSteps.map(s => ({
                        ...s,
                        // Mark any still-active steps as completed (stream ended)
                        status: s.status === 'active' ? 'completed' as const : s.status,
                      })),
                    }
                  : undefined

              const aiMessage: ChatMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                content: accumulatedText,
                role: "model",
                agent: currentState.activeAgent,
                timestamp: new Date(),
                groundingUrls: collectedGroundingUrls.length > 0 ? collectedGroundingUrls : undefined,
                executionTimeline,
              }
              currentState.history.push(aiMessage)
              currentState.metadata.lastUpdated = new Date()
              currentState.metadata.totalTokens += self.estimateTokens(message + accumulatedText)
              try {
                // PERF: O(1) message append + metadata update
                await Promise.all([
                  self.addMessageToSession(currentState, aiMessage),
                  self.saveSessionMetadataOnly(currentState),
                ])
                sessionLogger.info('💾 Streaming response saved to history', {
                  sessionId,
                  historyLength: currentState.history.length,
                  responseLength: accumulatedText.length
                })
              } catch (saveError) {
                sessionLogger.error('❌ Failed to save streaming response to history', { error: saveError instanceof Error ? saveError.message : String(saveError) })
              }

              // 🧠 MEMORY EXTRACTION: Extract and save clinical memories (fire-and-forget)
              self.extractAndSaveMemoriesAsync(currentState, message, accumulatedText, sessionId).catch(err => {
                sessionLogger.warn('⚠️ Memory extraction failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
              })

              // 📋 SESSION SUMMARY: Generate progressive summary at milestones (fire-and-forget)
              if (self.shouldGenerateSessionSummary(currentState)) {
                self.generateSessionSummaryAsync(currentState).catch(err => {
                  sessionLogger.warn('⚠️ Session summary generation failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
                })
              }
            }
          }
        })();
        
        // Preserve routing info on the wrapped stream
        (wrappedStream as any).routingInfo = routingInfo
        
        return { 
          response: wrappedStream, 
          updatedState: currentState,
          interactionMetrics: null // Will be captured by wrapper when stream completes
        }
      } else {
        responseContent = response.text

        // Add AI response to history (include metadata if available)
        const aiMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: responseContent,
          role: "model",
          agent: currentState.activeAgent,
          timestamp: new Date(),
          groundingUrls: response.groundingUrls?.length > 0 ? response.groundingUrls : undefined,
        }

        currentState.history.push(aiMessage)

        // Update metadata
        currentState.metadata.lastUpdated = new Date()
        currentState.metadata.totalTokens += this.estimateTokens(message + responseContent)

        // PERF: O(1) message append + metadata update (instead of rewriting ALL messages)
        await Promise.all([
          this.addMessageToSession(currentState, aiMessage),
          this.saveSessionMetadataOnly(currentState),
        ])
      }

      // 🔍 PATTERN MIRROR: Check if we should trigger automatic analysis
      if (this.shouldTriggerPatternAnalysis(currentState)) {
        this.triggerPatternAnalysisAsync(currentState).catch(error => {
          sessionLogger.error('❌ Análisis Longitudinal: Automatic trigger failed', { error: error instanceof Error ? error.message : String(error) })
          // Don't block user flow, just log the error
        })
      }

      // 🧠 MEMORY EXTRACTION: Extract and save clinical memories (fire-and-forget)
      this.extractAndSaveMemoriesAsync(currentState, message, responseContent, sessionId).catch(err => {
        sessionLogger.warn('⚠️ Memory extraction failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
      })

      // 📋 SESSION SUMMARY: Generate progressive summary at milestones (fire-and-forget)
      if (this.shouldGenerateSessionSummary(currentState)) {
        this.generateSessionSummaryAsync(currentState).catch(err => {
          sessionLogger.warn('⚠️ Session summary generation failed (non-blocking)', { error: err instanceof Error ? err.message : String(err) })
        })
      }

      // 📊 METRICS TRACKING for non-streaming
      // Note: Metrics are already completed in clinical-agent-router.ts after token extraction
      // Attempting to call completeInteraction here would return null as interaction is already completed
      
      sessionLogger.info(`🎉 Non-streaming interaction completed: ${sessionId}`);

      return { 
        response: {
          ...response,
          // Mark non-streaming responses as already persisted server-side
          persistedInServer: true,
          routingInfo: {
            detectedIntent: 'unified_agent',
            targetAgent: 'aurora',
            confidence: 1.0,
            extractedEntities: [] as string[]
          }
        }, 
        updatedState: currentState,
        interactionMetrics: null // Already captured and completed in router
      }
    } catch (error) {
      sessionLogger.error('❌ Error sending message', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  // Método uploadDocument implementado más abajo con mejor manejo de errores

  async getUserSessions(userId: string): Promise<ChatState[]> {
    if (!this._initialized) await this.initialize()
    return await this.storage.getUserSessions(userId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this._initialized) await this.initialize()

    // Close active chat session
    clinicalAgentRouter.closeChatSession(sessionId)

    // Delete from storage
    await this.storage.deleteChatSession(sessionId)
  }

  /**
   * Deriva el título de la conversación a partir del primer mensaje del usuario.
   * Aplica truncado inteligente a 50 caracteres con '...'.
   */
  private deriveConversationTitleFromFirstUserMessage(text: string, maxChars = 50): string {
    const normalized = (text || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    if (normalized.length <= maxChars) return normalized
    const truncated = normalized.slice(0, maxChars)
    const lastSpace = truncated.lastIndexOf(' ')
    if (lastSpace > Math.floor(maxChars * 0.6)) {
      return truncated.slice(0, lastSpace) + '...'
    }
    return truncated + '...'
  }

  async addStreamingResponseToHistory(
    sessionId: string,
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBullets?: ReasoningBullet[],
    executionTimeline?: ExecutionTimeline  // 🔧 FIX: Accept executionTimeline to persist reasoning transparency
  ): Promise<void> {
    if (!this._initialized) await this.initialize()

    sessionLogger.debug('🔍 Cargando estado desde DB para addStreamingResponseToHistory', { sessionId })

    const currentState = await this.storage.loadChatSession(sessionId)
    if (!currentState) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    sessionLogger.debug('📊 Estado cargado desde DB para addStreamingResponseToHistory', {
      historyLength: currentState.history.length,
      lastMessages: currentState.history.slice(-3).map((m: ChatMessage) => ({
        role: m.role,
        content: m.content.substring(0, 50),
        id: m.id
      }))
    })
    // Idempotency: if the last model message has identical content, merge extras instead of duplicating
    const normalize = (s?: string) => (s || '').replace(/\s+/g, ' ').trim()
    const lastMessage = currentState.history[currentState.history.length - 1]
    if (lastMessage && lastMessage.role === 'model' && normalize(lastMessage.content) === normalize(responseContent)) {
      // Merge grounding URLs (unique by URL)
      if (groundingUrls && groundingUrls.length > 0) {
        const existing = Array.isArray((lastMessage as any).groundingUrls) ? (lastMessage as any).groundingUrls : []
        const combined = [...existing, ...groundingUrls]
        const seen = new Set<string>()
        ;(lastMessage as any).groundingUrls = combined.filter((ref: any) => {
          const key = (ref && typeof ref === 'object') ? (ref.url || `${ref.title}-${ref.domain || ''}`) : String(ref)
          if (!key) return false
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }

      // Attach reasoning bullets if not already present
      if (reasoningBullets && reasoningBullets.length > 0) {
        const existingBullets: ReasoningBullet[] | undefined = (lastMessage as any).reasoningBullets
        if (!existingBullets || existingBullets.length === 0) {
          (lastMessage as any).reasoningBullets = [...reasoningBullets]
        }
      }

      // 🔧 FIX: Attach executionTimeline if not already present
      if (executionTimeline && !(lastMessage as any).executionTimeline) {
        (lastMessage as any).executionTimeline = executionTimeline
        sessionLogger.debug('🔧 ExecutionTimeline attached to existing message')
      }

      // Update metadata and save without adding tokens again
      currentState.metadata.lastUpdated = new Date()
      await this.saveChatSessionBoth(currentState)
      return
    }

    // Add AI response to history (no duplicate detected)
    const aiMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: responseContent,
      role: "model",
      agent: agent,
      timestamp: new Date(),
      groundingUrls: groundingUrls || [],
      reasoningBullets: reasoningBullets && reasoningBullets.length > 0 ? [...reasoningBullets] : undefined,
      executionTimeline: executionTimeline  // 🔧 FIX: Persist executionTimeline for reasoning transparency
    }

    currentState.history.push(aiMessage)

    // Update metadata
    currentState.metadata.lastUpdated = new Date()
    currentState.metadata.totalTokens += this.estimateTokens(responseContent)

    // Save updated state
    await this.saveChatSessionBoth(currentState)
  }

  async getChatState(sessionId: string): Promise<ChatState> {
    if (!this._initialized) await this.initialize()

    const currentState = await this.storage.loadChatSession(sessionId)
    if (!currentState) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Verificar si existe sesión activa en el router, si no, recrearla
    // Esto es crítico para mantener la sincronización entre persistencia y sesiones activas
    const hasActiveSession = clinicalAgentRouter.getActiveChatSessions().has(sessionId)
    if (!hasActiveSession) {
      sessionLogger.info(`♻️ Recreando sesión activa para: ${sessionId}`)
      await clinicalAgentRouter.createChatSession(
        sessionId,
        undefined,
        currentState.history
      )
    }

    return currentState
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  async uploadDocument(sessionId: string, file: File, userId: string): Promise<ClinicalFile> {
    if (!this._initialized) await this.initialize()
    
    try {
      sessionLogger.info(`📁 Uploading document: ${file.name} for session: ${sessionId}`)
      
      // Dynamic import to keep firebase-admin out of client bundle
      const { clinicalFileManager } = await import('./clinical-file-manager')
      
      // Validate file before upload
      if (!clinicalFileManager.isValidClinicalFile(file)) {
        throw new Error("Invalid file type or size. Please upload PDF, Word, or image files under 10MB.")
      }
      
      // Check for duplicate files in the session (file deduplication)
      const existingFiles = await this.getPendingFilesForSession(sessionId)
      const duplicateFile = existingFiles.find(existingFile => 
        existingFile.name === file.name && 
        existingFile.size === file.size &&
        existingFile.status !== 'error'
      )
      
      if (duplicateFile) {
        sessionLogger.info(`📋 Document already exists in session: ${file.name} (${duplicateFile.id})`)
        return duplicateFile
      }
      
      const uploadedFile = await clinicalFileManager.uploadFile(file, sessionId, userId)
      
      // Update session metadata
      const currentState = await this.storage.loadChatSession(sessionId)
      if (currentState) {
        currentState.metadata.fileReferences.push(uploadedFile.id)
        currentState.metadata.lastUpdated = new Date()
        await this.saveChatSessionBoth(currentState)
      }
      
      sessionLogger.info(`✅ Document uploaded successfully: ${uploadedFile.id}`)
      return uploadedFile
    } catch (error) {
      sessionLogger.error(`❌ Error uploading document ${file.name}`, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * 🔧 FIX: Obtener TODOS los archivos procesados de una sesión
   *
   * CAMBIO CRÍTICO: Ya NO filtramos por "archivos no enviados" porque:
   * 1. Cliente y servidor tienen DBs separadas (IndexedDB vs SQLite)
   * 2. El historial del cliente no se sincroniza con el servidor
   * 3. El clinical-agent-router YA tiene lógica para manejar archivos enviados previamente
   *
   * El router usa filesFullySentMap para detectar primer turno y enviar archivo completo,
   * luego solo envía referencias ligeras en turnos subsecuentes.
   */
  async getPendingFilesForSession(sessionId: string): Promise<ClinicalFile[]> {
    if (!this._initialized) await this.initialize()

    try {
      sessionLogger.debug(`📋 Getting pending files for session: ${sessionId}`)

      // Obtener TODOS los archivos clínicos procesados de la sesión
      const clinicalFiles = await this.storage.getClinicalFiles(sessionId)

      sessionLogger.debug('📋 All files from storage for getPendingFilesForSession', {
        totalFiles: clinicalFiles.length,
        files: clinicalFiles.map((f: ClinicalFile) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          sessionId: f.sessionId
        }))
      })

      // Filtrar solo archivos que están procesados (listos para usar)
      const processedFiles = clinicalFiles.filter((file: ClinicalFile) =>
        file.sessionId === sessionId &&
        file.status === 'processed'
      )

      sessionLogger.debug(`📋 Found ${processedFiles.length} truly pending files for session ${sessionId} (${clinicalFiles.length} total, 0 already sent)`)
      return processedFiles
    } catch (error) {
      sessionLogger.error(`❌ Error getting pending files for session ${sessionId}`, { error: error instanceof Error ? error.message : String(error) })
      return []
    }
  }

  /**
   * NUEVA FUNCIÓN: Obtener archivos por IDs para procesamiento dinámico
   * Implementa patrón de referencia por ID siguiendo mejores prácticas del SDK
   */
  async getFilesByIds(fileIds: string[]): Promise<ClinicalFile[]> {
    if (!this._initialized) await this.initialize()

    sessionLogger.debug('📁 getFilesByIds called', { fileIds })

    try {
      const files: ClinicalFile[] = []
      for (const fileId of fileIds) {
        const file = await this.storage.getClinicalFileById(fileId)
        sessionLogger.debug(`📁 getFilesByIds file ${fileId}`, {
          found: !!file,
          status: file?.status,
          name: file?.name,
          willInclude: !!(file && file.status === 'processed')
        })
        if (file && file.status === 'processed') {
          files.push(file)
        } else if (file && file.status !== 'processed') {
          sessionLogger.warn(`⚠️ getFilesByIds: File ${fileId} (${file.name}) has status "${file.status}", not "processed" - skipping`)
        } else {
          sessionLogger.warn(`⚠️ getFilesByIds: File ${fileId} not found in storage`)
        }
      }
      sessionLogger.debug(`📁 getFilesByIds returning ${files.length} files out of ${fileIds.length} requested`)
      return files
    } catch (error) {
      sessionLogger.error('❌ Error getting files by IDs', { error: error instanceof Error ? error.message : String(error) })
      return []
    }
  }

  async removeDocumentFromSession(sessionId: string, fileId: string): Promise<void> {
    if (!this._initialized) await this.initialize()
    
    try {
      sessionLogger.info(`🗑️ Removing document ${fileId} from session: ${sessionId}`)
      
      // Remove file from clinical storage
      await this.storage.deleteClinicalFile(fileId)
      
      // Update session metadata to remove file reference
      const currentState = await this.storage.loadChatSession(sessionId)
      if (currentState) {
        currentState.metadata.fileReferences = currentState.metadata.fileReferences.filter(
          (ref: string) => ref !== fileId
        )
        currentState.metadata.lastUpdated = new Date()
        await this.saveChatSessionBoth(currentState)
      }
      
      sessionLogger.info(`✅ Document ${fileId} removed successfully from session ${sessionId}`)
    } catch (error) {
      sessionLogger.error(`❌ Error removing document ${fileId} from session ${sessionId}`, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  async getSystemStatus(): Promise<{
    initialized: boolean
    activeAgents: string[]
    totalSessions: number
  }> {
    const allSessions = await this.storage.getUserSessions("all") // This would need to be implemented

    return {
      initialized: this._initialized,
      activeAgents: ['aurora'],
      totalSessions: allSessions.length,
    }
  }

  /**
   * Get comprehensive session analytics for behavioral analysis
   */
  async getSessionAnalytics(sessionId: string): Promise<{
    metrics: any;
    behavioralInsights: any;
  }> {
    if (!this._initialized) await this.initialize()
    
    const sessionMetrics = sessionMetricsTracker.getSessionMetrics(sessionId);
    
    if (!sessionMetrics.snapshot) {
      return {
        metrics: null,
        behavioralInsights: null
      };
    }
    
    sessionLogger.debug(`📊 Complete session metrics for ${sessionId}`, {
      totalTokens: sessionMetrics.snapshot.totals.tokensConsumed,
      totalCost: `$${sessionMetrics.snapshot.totals.totalCost.toFixed(6)}`,
      averageResponseTime: `${sessionMetrics.snapshot.totals.averageResponseTime}ms`,
      preferredAgent: sessionMetrics.snapshot.patterns.preferredAgent,
      efficiency: `${sessionMetrics.snapshot.efficiency.averageTokensPerSecond.toFixed(1)} tokens/sec`,
      interactions: sessionMetrics.interactions.length
    });
    
    return {
      metrics: sessionMetrics.snapshot,
      behavioralInsights: sessionMetrics.interactions
    };
  }

  /**
   * 🧠 LLM-POWERED MEMORY EXTRACTION (replaces regex-based extraction)
   *
   * Uses a Gemini sub-agent (gemini-3.1-flash-lite-preview) to extract
   * clinically significant memories from each conversation turn.
   * Supports all 5 memory categories including feedback and reference.
   *
   * Inspired by Claude Code's extractMemories.ts — runs as a "forked agent"
   * after each model response.
   *
   * Runs every 3rd user message for a patient to avoid overloading Firestore writes.
   */
  private async extractAndSaveMemoriesAsync(
    chatState: ChatState,
    userMessage: string,
    modelResponse: string,
    sessionId: string
  ): Promise<void> {
    const patientId = chatState.clinicalContext?.patientId
    if (!patientId || !chatState.userId) return

    // Only run every 3rd interaction to limit writes and cost
    const userMessages = chatState.history.filter(msg => msg.role === 'user')
    if (userMessages.length % 3 !== 0) return

    if (!modelResponse || modelResponse.length < 50) return

    try {
      const { extractSessionMemories } = await import('./agents/subagents/extract-session-memories')
      const { saveMemory } = await import('./clinical-memory-system')

      const extractedMemories = await extractSessionMemories(userMessage, modelResponse)

      if (extractedMemories.length === 0) return

      for (const mem of extractedMemories) {
        const memoryDoc = {
          memoryId: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          patientId,
          psychologistId: chatState.userId,
          category: mem.category,
          content: mem.content,
          sourceSessionIds: [sessionId],
          confidence: mem.confidence,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
          tags: mem.tags,
          relevanceScore: mem.confidence * 0.8, // Initial relevance derived from confidence
        }
        await saveMemory(memoryDoc)
      }

      sessionLogger.info(`🧠 LLM-extracted clinical memories saved: ${extractedMemories.length} for patient ${patientId}`)
    } catch (error) {
      sessionLogger.warn('⚠️ Memory extraction error (non-blocking)', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * 🔍 PATTERN MIRROR: Determine if we should trigger automatic pattern analysis
   * Triggers at session milestones: 4, 8, 15, 30
   */
  private shouldTriggerPatternAnalysis(chatState: ChatState): boolean {
    const patientId = chatState.clinicalContext?.patientId
    if (!patientId) return false

    // Count user messages for this patient (each represents a session interaction)
    const userMessages = chatState.history.filter(msg => msg.role === 'user')
    const sessionCount = userMessages.length

    // Trigger at specific milestones
    const milestones = [4, 8, 15, 30]
    const shouldTrigger = milestones.includes(sessionCount)

    if (shouldTrigger) {
      sessionLogger.info(`🔍 Análisis Longitudinal: Milestone reached: ${sessionCount} sessions with patient ${patientId}`)
    }

    return shouldTrigger
  }

  /**
   * 🔍 PATTERN MIRROR: Trigger pattern analysis asynchronously
   * Non-blocking - runs in background and doesn't affect user flow
   */
  private async triggerPatternAnalysisAsync(chatState: ChatState): Promise<void> {
    const patientId = chatState.clinicalContext?.patientId
    if (!patientId) return

    sessionLogger.info(`🔍 Análisis Longitudinal: Triggering automatic analysis for patient ${patientId}`)

    try {
      // Get patient info
      const patient = await loadPatientFromFirestore(chatState.userId, patientId)

      if (!patient) {
        sessionLogger.warn(`⚠️ Análisis Longitudinal: Patient not found: ${patientId}`)
        return
      }

      // Get all messages for this patient
      const patientHistory = chatState.history

      // Call API to generate analysis in background
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/patients/${encodeURIComponent(patientId)}/pattern-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionHistory: patientHistory,
          patientName: patient.displayName,
          triggerReason: 'session_milestone',
          culturalContext: 'general'
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to trigger pattern analysis')
      }

      sessionLogger.info(`✅ Análisis Longitudinal: Automatic analysis triggered successfully for patient ${patientId}`)

    } catch (error) {
      sessionLogger.error('❌ Análisis Longitudinal: Error triggering automatic analysis', { error: error instanceof Error ? error.message : String(error) })
      
      // Report to Sentry but don't throw - this is a background operation
      Sentry.captureException(error, {
        tags: {
          component: 'pattern-mirror-trigger',
          patient_id: patientId,
          trigger_type: 'automatic'
        }
      })
    }
  }

  // ─── SESSION SUMMARY GENERATION ──────────────────────────────────────────

  /**
   * Determine if the session has enough content to warrant generating a summary.
   * Triggers at every 6th user message (i.e., 6, 12, 18…) to progressively update
   * the session summary without waiting for explicit session close.
   */
  private shouldGenerateSessionSummary(chatState: ChatState): boolean {
    const userMessages = chatState.history.filter(msg => msg.role === 'user')
    // Generate at 6-message milestones (enough context to summarize)
    return userMessages.length >= 6 && userMessages.length % 6 === 0
  }

  /**
   * 📋 SESSION SUMMARY: Generate and persist a session summary (fire-and-forget).
   * Uses a sub-agent (gemini-3.1-flash-lite-preview) to produce a structured summary
   * that is stored on the session document for progressive context loading.
   */
  private async generateSessionSummaryAsync(chatState: ChatState): Promise<void> {
    if (!chatState.userId || !chatState.clinicalContext?.patientId) return

    try {
      const { generateSessionSummary } = await import('./agents/subagents/generate-session-summary')

      // Format the last N messages as conversation text
      const recentMessages = chatState.history.slice(-20) // Last 20 messages
      const conversationText = recentMessages
        .map(msg => `[${msg.role === 'user' ? 'Terapeuta' : 'Aurora'}]: ${msg.content.substring(0, 500)}`)
        .join('\n\n')

      const summary = await generateSessionSummary(conversationText)
      if (!summary) return

      // Persist to session metadata
      chatState.sessionSummary = summary
      await this.saveSessionMetadataOnly(chatState)

      sessionLogger.info('📋 Session summary generated and persisted', {
        sessionId: chatState.sessionId,
        topicCount: summary.mainTopics.length,
      })
    } catch (error) {
      sessionLogger.warn('⚠️ Session summary generation failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

// Global singleton instance for server-side usage
let globalHopeAI: HopeAISystem | null = null

/**
 * Singleton implementation for HopeAISystem
 * Ensures only one instance exists across the entire application
 * Prevents multiple reinitializations and state conflicts
 */
export class HopeAISystemSingleton {
  private static instance: HopeAISystem | null = null
  private static initializationPromise: Promise<HopeAISystem> | null = null
  private static isInitializing = false

  /**
   * Gets the singleton instance of HopeAISystem
   * Implements lazy initialization with thread safety
   */
  public static getInstance(): HopeAISystem {
    if (!HopeAISystemSingleton.instance) {
      // 🔒 SECURITY: Console logging disabled in production
      HopeAISystemSingleton.instance = new HopeAISystem()
    }
    return HopeAISystemSingleton.instance
  }

  /**
   * Gets the singleton instance with guaranteed initialization
   * Returns a promise that resolves when the system is fully initialized
   */
  public static async getInitializedInstance(): Promise<HopeAISystem> {
    // If already initialized, return immediately
    if (HopeAISystemSingleton.instance?.initialized) {
      return HopeAISystemSingleton.instance
    }

    // If initialization is in progress, wait for it
    if (HopeAISystemSingleton.initializationPromise) {
      return HopeAISystemSingleton.initializationPromise
    }

    // Start initialization
    HopeAISystemSingleton.initializationPromise = HopeAISystemSingleton.initializeInstance()
    return HopeAISystemSingleton.initializationPromise
  }

  /**
   * Private method to handle the initialization process
   */
  private static async initializeInstance(): Promise<HopeAISystem> {
    if (HopeAISystemSingleton.isInitializing) {
      // Wait for current initialization to complete
      while (HopeAISystemSingleton.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      return HopeAISystemSingleton.instance!
    }

    HopeAISystemSingleton.isInitializing = true
    // 🔒 SECURITY: Console logging disabled in production

    try {
      const instance = HopeAISystemSingleton.getInstance()
      await instance.initialize()

      // 🔒 SECURITY: Console logging disabled in production
      return instance
    } catch (error) {
      systemLogger.error('❌ Failed to initialize HopeAI Singleton System', { error: error instanceof Error ? error.message : String(error) })
      Sentry.captureException(error, {
        tags: {
          context: 'hopeai-system-initialization'
        }
      })
      throw error
    } finally {
      HopeAISystemSingleton.isInitializing = false
    }
  }

  /**
   * Resets the singleton instance (for testing purposes only)
   * @internal
   */
  public static resetInstance(): void {
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
      systemLogger.warn('⚠️ resetInstance should only be used in test/development environments')
    }
    HopeAISystemSingleton.instance = null
    HopeAISystemSingleton.initializationPromise = null
    HopeAISystemSingleton.isInitializing = false
  }

  /**
   * Gets the current initialization status
   */
  public static getStatus(): {
    hasInstance: boolean
    isInitialized: boolean
    isInitializing: boolean
  } {
    return {
      hasInstance: HopeAISystemSingleton.instance !== null,
      isInitialized: HopeAISystemSingleton.instance?.initialized || false,
      isInitializing: HopeAISystemSingleton.isInitializing
    }
  }

  /**
   * Upload a document through the singleton instance
   */
  public static async uploadDocument(sessionId: string, file: File, userId: string): Promise<ClinicalFile> {
    const instance = await HopeAISystemSingleton.getInitializedInstance()
    return instance.uploadDocument(sessionId, file, userId)
  }

  /**
   * Get pending files for a session through the singleton instance
   */
  public static async getPendingFilesForSession(sessionId: string): Promise<ClinicalFile[]> {
    const instance = await HopeAISystemSingleton.getInitializedInstance()
    return instance.getPendingFilesForSession(sessionId)
  }

  /**
   * Remove a document from a session through the singleton instance
   */
  public static async removeDocumentFromSession(sessionId: string, fileId: string): Promise<void> {
    const instance = await HopeAISystemSingleton.getInitializedInstance()
    return instance.removeDocumentFromSession(sessionId, fileId)
  }
}

// Legacy function for backward compatibility
export function getHopeAIInstance(): HopeAISystem {
  systemLogger.warn('⚠️ getHopeAIInstance() is deprecated. Use HopeAISystemSingleton.getInstance() instead.')
  return HopeAISystemSingleton.getInstance()
}

// Export singleton instance using the new pattern
export const hopeAI = HopeAISystemSingleton.getInstance()

/**
 * Global orchestration system for server-side usage
 * Ensures consistent singleton access across API routes
 * Replaces the previous getGlobalOrchestrationSystem function
 */
export async function getGlobalOrchestrationSystem(): Promise<HopeAISystem> {
  return await HopeAISystemSingleton.getInitializedInstance()
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getGlobalOrchestrationSystem() instead
 */
export function getOrchestrationSystem(): HopeAISystem {
  systemLogger.warn('⚠️ getOrchestrationSystem() is deprecated. Use getGlobalOrchestrationSystem() instead.')
  return HopeAISystemSingleton.getInstance()
}

/**
 * ARQUITECTURA OPTIMIZADA: Función exportada para obtener archivos por IDs
 * Permite procesamiento dinámico sin acumulación en el contexto
 */
export async function getFilesByIds(fileIds: string[]): Promise<ClinicalFile[]> {
  const instance = await HopeAISystemSingleton.getInitializedInstance()
  return instance.getFilesByIds(fileIds)
}

