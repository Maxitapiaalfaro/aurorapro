import { clinicalAgentRouter } from "./clinical-agent-router"
import { getStorageAdapter } from "./server-storage-adapter"
import { clinicalFileManager } from "./clinical-file-manager"
import { createIntelligentIntentRouter, type EnrichedContext } from "./intelligent-intent-router"
import { DynamicOrchestrator } from "./dynamic-orchestrator"
import { sessionMetricsTracker } from "./session-metrics-comprehensive-tracker"
import { trackAgentSwitch } from "./sentry-metrics-tracker"
import { getPatientPersistence } from "./patient-persistence"
import { PatientSummaryBuilder } from "./patient-summary-builder"
// Removed singleton-monitor import to avoid circular dependency
import * as Sentry from '@sentry/nextjs'
import type { AgentType, ClinicalMode, ChatState, ChatMessage, ClinicalFile, PatientSessionMeta, ReasoningBullet } from "@/types/clinical-types"
import type { OperationalMetadata, AgentTransition } from "@/types/operational-metadata"

export class HopeAISystem {
  private _initialized = false
  private storage: any = null
  private intentRouter: any = null
  private dynamicOrchestrator: DynamicOrchestrator | null = null
  private useAdvancedOrchestration: boolean = true
  
  // Public getter for initialization status
  public get initialized(): boolean {
    return this._initialized
  }
  
  // Método privado para guardar en el sistema de almacenamiento del servidor con verificación de existencia
  private async saveChatSessionBoth(chatState: ChatState): Promise<void> {
    try {
      // Verificar si la sesión ya existe para prevenir duplicaciones
      const existingSession = await this.storage.loadChatSession(chatState.sessionId)
      
      if (existingSession) {
        console.log(`⚠️ Sesión ya existe, actualizando: ${chatState.sessionId}`)
        // Actualizar metadata de la sesión existente
        chatState.metadata.lastUpdated = new Date()
      } else {
        console.log(`📝 Creando nueva sesión: ${chatState.sessionId}`)
      }
      
      // Guardar en el storage adapter principal (servidor)
      await this.storage.saveChatSession(chatState)
      console.log(`💾 Chat session saved: ${chatState.sessionId}`)
    } catch (error) {
      console.error(`❌ Error saving chat session ${chatState.sessionId}:`, error)
      throw error
    }
  }
  
  // Getter público para acceder al storage desde la API
  get storageAdapter() {
    return this.storage
  }

  async initialize(): Promise<void> {
    const isServer = typeof window === 'undefined'
    const startTime = Date.now()
    console.log('🚀 [HopeAISystem] initialize() called', { isServer })

    if (this._initialized) {
      console.log('✅ [HopeAISystem] Already initialized, skipping')
      return
    }

    try {
      console.log('🔧 [HopeAISystem] Starting PARALLEL initialization...')

      // 🚀 OPTIMIZACIÓN: Inicializar componentes en PARALELO para reducir cold start
      const [storage, intentRouter, orchestrator] = await Promise.all([
        // 1. Storage adapter
        (async () => {
          console.log('🔧 [HopeAISystem] Getting storage adapter...')
          const storageAdapter = await getStorageAdapter()
          console.log('✅ [HopeAISystem] Storage adapter obtained:', storageAdapter?.constructor?.name)

          // Asegurar que el storage esté inicializado
          if (storageAdapter && typeof storageAdapter.initialize === 'function') {
            console.log('🔧 [HopeAISystem] Calling storage.initialize()...')
            await storageAdapter.initialize()
            console.log('✅ [HopeAISystem] Storage initialized successfully')
          } else {
            console.warn('⚠️ [HopeAISystem] Storage does not have initialize method')
          }

          return storageAdapter
        })(),

        // 2. Intent router (independiente del storage)
        (async () => {
          console.log('🔧 [HopeAISystem] Creating intent router...')
          const router = createIntelligentIntentRouter(clinicalAgentRouter, {
            confidenceThreshold: 0.8,
            fallbackAgent: 'socratico',
            enableLogging: true,
            maxRetries: 2
          })
          console.log('✅ [HopeAISystem] Intent router created')
          return router
        })(),

        // 3. Dynamic orchestrator (independiente del storage)
        (async () => {
          if (!this.useAdvancedOrchestration) {
            return null
          }

          console.log('🔧 [HopeAISystem] Creating dynamic orchestrator...')
          const orch = new DynamicOrchestrator(clinicalAgentRouter, {
            enableAdaptiveLearning: false,
            enableRecommendations: false,
            asyncRecommendations: false,          // 🚀 Performance optimization
            toolContinuityThreshold: 3,         // 🛠️ Smart tool persistence
            dominantTopicsUpdateInterval: 5,    // 📊 Optimized update frequency
            maxToolsPerSession: 20,
            confidenceThreshold: 0.75,
            sessionTimeoutMinutes: 60,
            logLevel: 'info'
          })
          console.log('✅ [HopeAISystem] Dynamic orchestrator created')
          return orch
        })()
      ])

      // Asignar resultados
      this.storage = storage
      this.intentRouter = intentRouter
      this.dynamicOrchestrator = orchestrator

      const initTime = Date.now() - startTime
      console.log(`✅ [HopeAISystem] PARALLEL initialization completed in ${initTime}ms`)

      this._initialized = true
      // 🔒 SECURITY: Console logging disabled in production
    } catch (error) {
      console.error("Failed to initialize HopeAI System:", error)
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
          console.log(`♻️ Restaurando sesión existente: ${sessionId}`)
          chatHistory = existingState.history
          isExistingSession = true
          
          // Update patient context if provided in patientSessionMeta
          if (patientSessionMeta?.patient?.reference) {
            console.log(`🏥 Actualizando contexto de paciente: ${patientSessionMeta.patient.reference}`)
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
        console.log(`⚠️ Error verificando sesión existente ${sessionId}, creando nueva:`, error)
      }
    }

    // Verificación adicional para prevenir duplicación por ID generado
    if (!sessionId) {
      try {
        const potentialExisting = await this.storage.loadChatSession(finalSessionId)
        if (potentialExisting) {
          console.log(`⚠️ ID de sesión generado ya existe, regenerando...`)
          // Regenerar ID único
          const newId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          return this.createClinicalSession(userId, mode, agent, newId)
        }
      } catch (error) {
        // Error esperado si la sesión no existe, continuar con la creación
      }
    }

    console.log(`🆕 Creando nueva sesión clínica: ${finalSessionId}`)

    // Create chat session with agent router
    await clinicalAgentRouter.createChatSession(finalSessionId, agent, chatHistory)

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
   */
  private async collectOperationalMetadata(
    sessionId: string,
    userId: string,
    currentState: ChatState,
    patientReference?: string
  ): Promise<OperationalMetadata> {
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

    // 2. RISK METADATA (desde patient context si está disponible)
    let riskFlags: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let requiresImmediateAttention = false;
    let lastRiskAssessment: Date | null = null;

    if (patientReference) {
      try {
        const patientPersistence = getPatientPersistence();
        const patientRecord = await patientPersistence.loadPatientRecord(patientReference);

        if (patientRecord) {
          // Extraer risk flags desde tags del paciente
          const riskTags = patientRecord.tags?.filter(tag =>
            tag.toLowerCase().includes('riesgo') ||
            tag.toLowerCase().includes('suicid') ||
            tag.toLowerCase().includes('autolesión') ||
            tag.toLowerCase().includes('crisis') ||
            tag.toLowerCase().includes('urgente')
          ) || [];

          riskFlags = riskTags;

          // Determinar nivel de riesgo basado en tags
          if (riskTags.some(tag => tag.toLowerCase().includes('crítico') || tag.toLowerCase().includes('suicid'))) {
            riskLevel = 'critical';
            requiresImmediateAttention = true;
          } else if (riskTags.some(tag => tag.toLowerCase().includes('alto') || tag.toLowerCase().includes('crisis'))) {
            riskLevel = 'high';
          } else if (riskTags.length > 0) {
            riskLevel = 'medium';
          }

          // Last risk assessment desde updatedAt del paciente
          lastRiskAssessment = patientRecord.updatedAt;
        }
      } catch (error) {
        console.warn(`⚠️ [HopeAI] Error loading patient risk metadata for ${patientReference}:`, error);
      }
    }

    // 3. AGENT HISTORY METADATA
    // Extraer transiciones de agentes desde el historial de mensajes
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

        // Detectar transiciones
        if (previousAgent && previousAgent !== msg.agent) {
          const transition: AgentTransition = {
            from: previousAgent,
            to: msg.agent,
            timestamp: msg.timestamp,
            reason: 'detected_from_history'
          };
          agentTransitions.push(transition);
          lastAgentSwitch = msg.timestamp;

          // Contar switches consecutivos en últimos 5 minutos
          if (msg.timestamp.getTime() >= fiveMinutesAgo) {
            consecutiveSwitches++;
          }
        }

        previousAgent = msg.agent;
      }
    }

    // 4. PATIENT CONTEXT METADATA
    let therapeuticPhase: 'assessment' | 'intervention' | 'maintenance' | 'closure' | null = null;
    let sessionCount = 0;
    let lastSessionDate: Date | null = null;
    let treatmentModality: string | null = null;
    let patientSummaryAvailable = false;

    if (patientReference) {
      try {
        const patientPersistence = getPatientPersistence();
        const patientRecord = await patientPersistence.loadPatientRecord(patientReference);

        if (patientRecord) {
          patientSummaryAvailable = !!patientRecord.summaryCache;

          // Extraer modalidad de tratamiento desde tags
          const modalityTags = patientRecord.tags?.filter(tag =>
            tag.toLowerCase().includes('tcc') ||
            tag.toLowerCase().includes('cbt') ||
            tag.toLowerCase().includes('psicodinámico') ||
            tag.toLowerCase().includes('humanista') ||
            tag.toLowerCase().includes('sistémica')
          ) || [];

          if (modalityTags.length > 0) {
            treatmentModality = modalityTags[0];
          }

          // Estimar fase terapéutica basada en número de notas clínicas
          try {
            const fichas = await this.storage.getFichasClinicasByPaciente(patientReference);
            sessionCount = fichas.length;

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

            // Last session date desde última ficha
            if (fichas.length > 0) {
              const sortedFichas = fichas.sort((a: any, b: any) =>
                new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime()
              );
              lastSessionDate = new Date(sortedFichas[0].ultimaActualizacion);
            }
          } catch (error) {
            console.warn(`⚠️ [HopeAI] Error loading patient session count for ${patientReference}:`, error);
          }
        }
      } catch (error) {
        console.warn(`⚠️ [HopeAI] Error loading patient context metadata for ${patientReference}:`, error);
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

    console.log(`📊 [HopeAI] Operational metadata collected:`, {
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
    suggestedAgent?: string,
    sessionMeta?: PatientSessionMeta,
    onBulletUpdate?: (bullet: import('@/types/clinical-types').ReasoningBullet) => void,
    onAgentSelected?: (routingInfo: { targetAgent: string; confidence: number; reasoning: string }) => void
  ): Promise<{
    response: any
    updatedState: ChatState
    interactionMetrics?: any
  }> {
    if (!this._initialized) await this.initialize()

    // 🎯 START COMPREHENSIVE METRICS TRACKING
    const interactionId = sessionMetricsTracker.startInteraction(sessionId, 'demo_user', message);

    // Load current session state or create a new one if it doesn't exist
    let currentState = await this.storage.loadChatSession(sessionId)
    if (!currentState) {
      console.log(`[HopeAI] Creating new session: ${sessionId}`)
      currentState = {
        sessionId,
        userId: 'default-user',
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
        }
      }
      // Save the new session
      await this.saveChatSessionBoth(currentState)
    } else if (sessionMeta?.patient?.reference && currentState.clinicalContext?.patientId !== sessionMeta.patient.reference) {
      // Update existing session with patient context if provided and different
      console.log(`🏥 [HopeAI] Updating existing session with patient context: ${sessionMeta.patient.reference}`)
      currentState.clinicalContext = {
        ...currentState.clinicalContext,
        patientId: sessionMeta.patient.reference,
        confidentialityLevel: sessionMeta.patient.confidentialityLevel || currentState.clinicalContext?.confidentialityLevel || "high"
      }
      await this.saveChatSessionBoth(currentState)
    }

    // Get session files automatically - no longer passed as parameter
    const sessionFiles = await this.getPendingFilesForSession(sessionId)

    // Fallback: if no pending files, reuse most recently referenced processed files from history
    let resolvedSessionFiles = sessionFiles || []
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
            console.log(`📎 [HopeAI] Reusing last referenced files for context: ${reuseFiles.map((f: any) => f.name).join(', ')}`)
          }
        }
      } catch (e) {
        console.warn('⚠️ [HopeAI] Could not reuse last referenced files for context:', e)
      }
    }

    try {
      // 🔧 FIX: Aplicar Context Window Manager para comprimir historial ANTES de enviar al agente
      // Esto previene sobrecarga con archivos grandes + conversaciones largas
      const { ContextWindowManager } = await import('./context-window-manager');
      const contextWindowManager = new ContextWindowManager({
        maxExchanges: 6,        // Últimos 6 intercambios = 12 mensajes max
        triggerTokens: 50000,   // Activar compresión a 50k tokens
        targetTokens: 30000,    // Reducir a 30k tokens después de compresión
        enableLogging: true
      });

      // Convertir historial completo al formato Content[] 
      const rawSessionContext = currentState.history.map((msg: ChatMessage) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      // Aplicar compresión inteligente del contexto
      const contextResult = contextWindowManager.processContext(rawSessionContext, message);
      
      // Usar contexto optimizado (comprimido si es necesario)
      const sessionContext = contextResult.processedContext;
      
      console.log(`🔄 [HopeAI] Context Window Applied:`, {
        originalMessages: rawSessionContext.length,
        optimizedMessages: sessionContext.length,
        estimatedTokens: contextResult.metrics.tokensEstimated,
        compressionApplied: contextResult.metrics.compressionApplied,
        hasFiles: resolvedSessionFiles.length > 0
      });

      // ARQUITECTURA OPTIMIZADA: Crear contexto enriquecido para detección de intención
      // Incluir archivos de la sesión actual para análisis contextual
      console.log(`🏥 [HopeAI] SessionMeta received:`, {
        hasSessionMeta: !!sessionMeta,
        patientReference: sessionMeta?.patient?.reference || 'None',
        sessionId: sessionMeta?.sessionId || sessionId
      });
      
      // PATIENT CONTEXT: Retrieve full patient summary if available
      let patientSummary: string | undefined = undefined;
      const patientReference = sessionMeta?.patient?.reference || currentState.clinicalContext?.patientId;

      // 🔹 Prefer client-provided summaryText on first turn to avoid client-only persistence lookup
      const providedSummary = sessionMeta?.patient?.summaryText;
      if (providedSummary) {
        patientSummary = providedSummary;
        console.log(`🏥 [HopeAI] Using provided patient summaryText from sessionMeta (length=${providedSummary.length})`);
      } else if (patientReference) {
        try {
          const patientPersistence = getPatientPersistence();
          const patientRecord = await patientPersistence.loadPatientRecord(patientReference);

          if (patientRecord) {
            // 🎯 OPTIMIZACIÓN: Detectar si es el primer mensaje con este paciente
            const isFirstPatientMessage = currentState.history.length === 0 ||
              !currentState.history.some((msg: any) => msg.content?.includes(patientRecord.displayName));

            console.log(`🏥 [HopeAI] Checking if first patient message:`, {
              historyLength: currentState.history.length,
              patientName: patientRecord.displayName,
              isFirstMessage: isFirstPatientMessage
            })

            if (isFirstPatientMessage) {
              // 📋 PRIMER MENSAJE: Cargar ficha clínica completa
              let latestFicha = null;
              try {
                const fichas = await this.storage.getFichasClinicasByPaciente(patientReference);
                latestFicha = fichas
                  .filter((f: any) => f.estado === 'completado')
                  .sort((a: any, b: any) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0];

                if (latestFicha) {
                  console.log(`🏥 [HopeAI] Found latest ficha clínica (version ${latestFicha.version}) for ${patientRecord.displayName}`);
                }
              } catch (fichaError) {
                console.warn(`🏥 [HopeAI] Error loading ficha clínica for ${patientReference}:`, fichaError);
              }

              // Usar getSummaryWithFicha que prioriza ficha sobre summary
              patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patientRecord, latestFicha);

              if (latestFicha) {
                console.log(`🏥 [HopeAI] ✅ First message: Using FULL ficha clínica v${latestFicha.version} as patient context`);
              } else if (patientRecord.summaryCache && PatientSummaryBuilder.isCacheValid(patientRecord)) {
                console.log(`🏥 [HopeAI] ✅ First message: Using cached patient summary (${patientRecord.summaryCache.tokenCount || 'unknown'} tokens)`);
              } else {
                console.log(`🏥 [HopeAI] ✅ First message: Built fresh patient summary for ${patientRecord.displayName}`);
              }
            } else {
              // 🔄 MENSAJES SUBSECUENTES: Solo referencia breve (el modelo ya tiene el contexto)
              patientSummary = `Continuing conversation with ${patientRecord.displayName}. Patient context already provided in previous messages.`;
              console.log(`🏥 [HopeAI] ⚡ Subsequent message: Using brief patient reference (context already in model memory)`);
            }
          }
        } catch (error) {
          console.error(`🏥 [HopeAI] Error retrieving patient summary for ${patientReference}:`, error);
        }
      }
      
      const enrichedSessionContext: EnrichedContext = {
        sessionFiles: resolvedSessionFiles || [],
        currentMessage: message,
        conversationHistory: currentState.history.slice(-5), // Últimos 5 mensajes para contexto
        activeAgent: currentState.activeAgent,
        clinicalMode: currentState.mode,
        sessionMetadata: currentState.metadata,
        // PATIENT CONTEXT: Inject patient reference and full summary if available
        patient_reference: patientReference,
        patient_summary: patientSummary,
        // Required fields for EnrichedContext interface
        originalQuery: message,
        detectedIntent: '',
        extractedEntities: [],
        entityExtractionResult: { 
          entities: [], 
          primaryEntities: [],
          secondaryEntities: [],
          confidence: 0,
          processingTime: 0
        },
        sessionHistory: [],
        transitionReason: '',
        confidence: 0
      }

      // 📊 METADATA COLLECTION: Recolectar metadata operativa ANTES de routing
      // Esta metadata está disponible para todos los tipos de routing
      console.log(`[HopeAI] Collecting operational metadata`)
      const operationalMetadata = await this.collectOperationalMetadata(
        sessionId,
        currentState.userId,
        currentState,
        patientReference
      );

      // 🚨 EDGE CASE PRE-CHECK: Detectar contenido sensible ANTES de orchestration
      // Si detectamos contenido sensible, forzamos routing estándar con override al clínico
      const hasSensitiveContent = this.detectSensitiveContent(message, operationalMetadata);

      // 🚨 RISK STATE PERSISTENCE: Verificar si la sesión ya está marcada como de riesgo
      const isExistingRiskSession = currentState.riskState?.isRiskSession || false;
      const consecutiveSafeTurns = currentState.riskState?.consecutiveSafeTurns || 0;

      // Decidir si forzar routing estándar:
      // 1. Si detectamos contenido sensible en este turno
      // 2. Si la sesión ya está marcada como de riesgo Y no ha habido suficientes turnos seguros
      const SAFE_TURNS_THRESHOLD = 3; // Número de turnos seguros para desescalar
      const forceStandardRouting = hasSensitiveContent ||
                                   (isExistingRiskSession && consecutiveSafeTurns < SAFE_TURNS_THRESHOLD);

      if (hasSensitiveContent) {
        console.log(`🚨 [HopeAI] SENSITIVE CONTENT DETECTED - Forcing standard routing with edge case detection`);

        // Actualizar estado de riesgo en la sesión
        currentState.riskState = {
          isRiskSession: true,
          riskLevel: operationalMetadata.risk_level,
          detectedAt: currentState.riskState?.detectedAt || new Date(),
          riskType: 'sensitive_content',
          lastRiskCheck: new Date(),
          consecutiveSafeTurns: 0 // Reset contador
        };
      } else if (isExistingRiskSession) {
        console.log(`⚠️ [HopeAI] RISK SESSION ACTIVE - Maintaining standard routing (safe turns: ${consecutiveSafeTurns}/${SAFE_TURNS_THRESHOLD})`);

        // Incrementar contador de turnos seguros
        currentState.riskState!.consecutiveSafeTurns = consecutiveSafeTurns + 1;
        currentState.riskState!.lastRiskCheck = new Date();

        // Si alcanzamos el umbral, desescalar
        if (currentState.riskState!.consecutiveSafeTurns >= SAFE_TURNS_THRESHOLD) {
          console.log(`✅ [HopeAI] RISK SESSION DEESCALATED - Returning to normal orchestration`);
          currentState.riskState!.isRiskSession = false;
        }
      }

      // Determinar si usar orquestación avanzada o routing directo
      let routingResult: { enrichedContext: any; targetAgent: any; routingDecision?: any };
      let orchestrationResult = null;

      if (suggestedAgent) {
        console.log(`[HopeAI] Usando agente sugerido por orquestador: ${suggestedAgent}`)
        routingResult = {
          targetAgent: suggestedAgent,
          enrichedContext: {
            detectedIntent: 'orchestrator_suggestion',
            confidence: 0.95,
            extractedEntities: [],
            isExplicitRequest: false
          },
          routingDecision: undefined // No hay decisión de routing explícita
        }
      } else if (this.useAdvancedOrchestration && this.dynamicOrchestrator && !forceStandardRouting) {
        // 🧠 USAR ORQUESTACIÓN AVANZADA CON APRENDIZAJE CROSS-SESSION
        console.log(`[HopeAI] 🧠 Using Advanced Orchestration with cross-session learning`)
        
        // Construir conversación completa (usuario + modelo) en formato Content[] para bullets coherentes
        const externalConversationHistory = (currentState.history || []).map((msg: ChatMessage) => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }))

        // Contexto de paciente para bullets
        const patientIdForBullets = patientReference
        const patientSummaryForBullets = patientSummary
        const sessionTypeForBullets = currentState.mode

        orchestrationResult = await this.dynamicOrchestrator.orchestrate(
          message,
          sessionId,
          currentState.userId || 'demo_user',
          resolvedSessionFiles,
          onBulletUpdate,
          externalConversationHistory,
          patientIdForBullets,
          patientSummaryForBullets,
          sessionTypeForBullets
        )
        
        // 📊 RECORD ORCHESTRATION COMPLETION 
        sessionMetricsTracker.recordOrchestrationComplete(
          interactionId,
          orchestrationResult.selectedAgent,
          orchestrationResult.contextualTools.map(tool => tool.name || 'unknown_tool'),
          currentState.activeAgent
        );
        
        // Convertir resultado de orquestación a formato de routing
        routingResult = {
          targetAgent: orchestrationResult.selectedAgent,
          enrichedContext: {
            detectedIntent: orchestrationResult.reasoning,
            confidence: orchestrationResult.confidence,
            extractedEntities: [],
            isExplicitRequest: false,
            // 🎯 Información adicional del orchestrator
            recommendations: orchestrationResult.recommendations,
            contextualTools: orchestrationResult.contextualTools,
            sessionContext: orchestrationResult.sessionContext,
            // 🏥 PATIENT CONTEXT: Preserve patient context from enrichedSessionContext
            patient_reference: enrichedSessionContext.patient_reference,
            patient_summary: enrichedSessionContext.patient_summary
          }
        }
        
        console.log(`[HopeAI] 🎯 Advanced orchestration result:`, {
          selectedAgent: orchestrationResult.selectedAgent,
          confidence: orchestrationResult.confidence,
          toolsSelected: orchestrationResult.contextualTools.length,
          hasRecommendations: !!orchestrationResult.recommendations
        })
        
        // 🎯 CALLBACK: Notificar al frontend del agente seleccionado INMEDIATAMENTE
        if (onAgentSelected) {
          onAgentSelected({
            targetAgent: orchestrationResult.selectedAgent,
            confidence: orchestrationResult.confidence,
            reasoning: orchestrationResult.reasoning
          })
        }
      } else {
        // Usar el router inteligente para clasificar la intención y enrutar automáticamente
        console.log(`[HopeAI] Using standard intelligent routing with metadata-informed decisions`)

        // Construir historial en formato Content[] para el router
        const sessionContextArray = (currentState.history || []).map((msg: ChatMessage) => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        }))

        // 🚨 RISK STATE: Enriquecer metadata con estado de riesgo de la sesión
        const enrichedMetadata = {
          ...operationalMetadata,
          session_risk_state: currentState.riskState
        };

        // 🔍 DEBUG: Verificar que el estado de riesgo se está pasando
        if (enrichedMetadata.session_risk_state?.isRiskSession) {
          console.log(`🔍 [HopeAI] Passing risk state to router:`, {
            isRiskSession: enrichedMetadata.session_risk_state.isRiskSession,
            consecutiveSafeTurns: enrichedMetadata.session_risk_state.consecutiveSafeTurns,
            riskType: enrichedMetadata.session_risk_state.riskType
          });
        }

        routingResult = await this.intentRouter.routeUserInput(
          message,
          sessionContextArray,
          currentState.activeAgent,
          enrichedSessionContext,
          enrichedMetadata
        )

        // 🎯 CALLBACK: Notificar al frontend del agente seleccionado INMEDIATAMENTE
        if (onAgentSelected && routingResult.enrichedContext) {
          onAgentSelected({
            targetAgent: routingResult.targetAgent,
            confidence: routingResult.enrichedContext.confidence,
            reasoning: routingResult.enrichedContext.transitionReason || 'Routing based on intent classification'
          })
        }
      }

      // Manejar solicitudes explícitas de cambio de agente
      if (routingResult.enrichedContext?.isExplicitRequest) {
        // Para solicitudes explícitas, NO agregamos el mensaje del usuario al historial
        // ya que es solo un comando de cambio de agente
        
        // Si se detectó un cambio de agente, actualizar la sesión
        if (routingResult.targetAgent !== currentState.activeAgent) {
          console.log(`[HopeAI] Explicit agent switch request: ${currentState.activeAgent} → ${routingResult.targetAgent}`)
          
          // Instrumentar cambio de agente con Sentry
          const agentSwitchSpan = Sentry.startSpan(
            { name: 'agent.switch.explicit', op: 'orchestration' },
            () => {
              // Registrar métricas del cambio de agente
              trackAgentSwitch({
                userId: currentState.userId || 'demo_user',
                sessionId,
                fromAgent: currentState.activeAgent,
                toAgent: routingResult.targetAgent,
                switchType: 'explicit',
                confidence: routingResult.enrichedContext?.confidence || 1.0
              })
              
              // Close current chat session
              clinicalAgentRouter.closeChatSession(sessionId)
              
              // Create new chat session with new agent - mark as transition to maintain flow
              return clinicalAgentRouter.createChatSession(sessionId, routingResult.targetAgent, currentState.history, true)
            }
          )
          
          await agentSwitchSpan
          
          // Update state
          currentState.activeAgent = routingResult.targetAgent
          currentState.metadata.lastUpdated = new Date()
        }

        // Para solicitudes explícitas, crear un prompt especial para que el agente genere la confirmación
        const confirmationPrompt = this.createAgentConfirmationPrompt(routingResult.targetAgent, message)
        
        // Enviar el prompt de confirmación al agente correspondiente con streaming
        // 🏥 PATIENT CONTEXT: Include patient context in confirmation context
        const confirmationContext = {
          ...routingResult.enrichedContext,
          isConfirmationRequest: true,
          patient_reference: patientReference,
          patient_summary: patientSummary
        }
        
        const confirmationResponse = await clinicalAgentRouter.sendMessage(
          sessionId, 
          confirmationPrompt, 
          useStreaming, // Usar streaming también para confirmaciones
          confirmationContext
        )

        // Manejar respuesta según si es streaming o no
        if (useStreaming) {
          // Para streaming, agregar routing info y retornar el generator
          if (confirmationResponse && typeof confirmationResponse[Symbol.asyncIterator] === 'function') {
            confirmationResponse.routingInfo = {
              detectedIntent: 'explicit_agent_switch',
              targetAgent: routingResult.targetAgent,
              confidence: 1.0,
              extractedEntities: routingResult.enrichedContext?.extractedEntities || [],
              isExplicitRequest: true
            }
          }
          
          return { 
            response: confirmationResponse, 
            updatedState: currentState 
          }
        } else {
          // Para no-streaming, agregar al historial y retornar
          const confirmationMessage: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: confirmationResponse.text,
            role: "model",
            agent: currentState.activeAgent,
            timestamp: new Date(),
          }

          currentState.history.push(confirmationMessage)
          currentState.metadata.lastUpdated = new Date()
          await this.saveChatSessionBoth(currentState)

          return {
            response: {
              text: confirmationResponse.text,
              // Mark non-streaming confirmation as already persisted server-side
              persistedInServer: true,
              routingInfo: {
                detectedIntent: 'explicit_agent_switch',
                targetAgent: routingResult.targetAgent,
                confidence: 1.0,
                extractedEntities: routingResult.enrichedContext?.extractedEntities || [],
                isExplicitRequest: true
              }
            },
            updatedState: currentState
          }
        }
      }

      // Para mensajes normales (no explícitos), agregar el mensaje del usuario al historial
      // ARQUITECTURA OPTIMIZADA: Separar gestión de archivos del historial de conversación
      // Los archivos se almacenan a nivel de sesión y se referencian por ID, no se duplican en cada mensaje
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

      console.log('📝 [HopeAI] Mensaje del usuario agregado al historial:', {
        historyLength: currentState.history.length,
        userMessageId: userMessage.id,
        userMessageContent: userMessage.content.substring(0, 50)
      })

      // Si se detectó un cambio de agente (routing automático), actualizar la sesión
      if (routingResult.targetAgent !== currentState.activeAgent) {
        console.log(`[HopeAI] Intelligent routing: ${currentState.activeAgent} → ${routingResult.targetAgent}`)
        
        // Instrumentar cambio de agente automático con Sentry
        const agentSwitchSpan = Sentry.startSpan(
          { name: 'agent.switch.automatic', op: 'orchestration' },
          () => {
            // Registrar métricas del cambio de agente
            trackAgentSwitch({
              userId: currentState.userId || 'demo_user',
              sessionId,
              fromAgent: currentState.activeAgent,
              toAgent: routingResult.targetAgent,
              switchType: 'automatic',
              confidence: routingResult.enrichedContext?.confidence || 0.8
            })
            
            // Close current chat session
            clinicalAgentRouter.closeChatSession(sessionId)
            
            // Create new chat session with new agent - mark as transition to maintain flow
            return clinicalAgentRouter.createChatSession(sessionId, routingResult.targetAgent, currentState.history, true)
          }
        )
        
        await agentSwitchSpan
        
        // Update state
        currentState.activeAgent = routingResult.targetAgent
        currentState.metadata.lastUpdated = new Date()
      }

      // Send message through agent router with enriched context
      // La búsqueda académica ahora es manejada por el agente como herramienta (tool)
      // Session files are handled through conversation history, not as attachments
      // 🏥 PATIENT CONTEXT: Include patient context from sessionMeta
      // 📊 METADATA: Include operational metadata and routing decision
      const enrichedAgentContext = {
        ...routingResult.enrichedContext,
        // Ensure document context is available to the agent at generation time
        sessionFiles: resolvedSessionFiles || [],
        patient_reference: patientReference,
        patient_summary: patientSummary,
        // NUEVO: Metadata operativa y decisión de routing
        operationalMetadata: operationalMetadata,
        routingDecision: routingResult.routingDecision
      }

      console.log(`[HopeAI] SessionMeta patient reference: ${sessionMeta?.patient?.reference || 'None'}`)

      const response = await clinicalAgentRouter.sendMessage(
        sessionId,
        message,
        useStreaming,
        enrichedAgentContext,
        interactionId  // 📊 Pass interaction ID for metrics tracking
      )

      // Save state with user message immediately (for both streaming and non-streaming)
      currentState.metadata.lastUpdated = new Date()
      await this.saveChatSessionBoth(currentState)

      console.log('💾 [HopeAI] Estado guardado en DB con mensaje del usuario:', {
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
        if (streamingResponse && typeof streamingResponse[Symbol.asyncIterator] === 'function') {
          (streamingResponse as any).routingInfo = {
            detectedIntent: routingResult.enrichedContext?.detectedIntent || 'unknown',
            targetAgent: routingResult.targetAgent,
            confidence: routingResult.enrichedContext?.confidence || 0,
            extractedEntities: routingResult.enrichedContext?.extractedEntities || []
          }
        }
        
        // 📊 METRICS TRACKING for streaming
        // Note: Streaming metrics will be automatically completed in the wrapper async generator
        // when the stream finishes. DO NOT call completeInteraction here - it would complete
        // with 0 tokens before the stream has finished.
        
        console.log(`🎉 [SessionMetrics] Streaming interaction setup completed: ${sessionId} | Metrics will be captured on stream completion`);
        
        return { 
          response: streamingResponse, 
          updatedState: currentState,
          interactionMetrics: null // Will be captured by wrapper when stream completes
        }
      } else {
        responseContent = response.text

        // Add AI response to history
        const aiMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          content: responseContent,
          role: "model",
          agent: currentState.activeAgent,
          timestamp: new Date(),
        }

        currentState.history.push(aiMessage)
      }

      // Update metadata
      currentState.metadata.lastUpdated = new Date()
      currentState.metadata.totalTokens += this.estimateTokens(message + responseContent)

      // Save updated state
      await this.saveChatSessionBoth(currentState)

      // 🔍 PATTERN MIRROR: Check if we should trigger automatic analysis
      if (this.shouldTriggerPatternAnalysis(currentState)) {
        this.triggerPatternAnalysisAsync(currentState).catch(error => {
          console.error('❌ [Análisis Longitudinal] Automatic trigger failed:', error)
          // Don't block user flow, just log the error
        })
      }

      // 📊 METRICS TRACKING for non-streaming
      // Note: Metrics are already completed in clinical-agent-router.ts after token extraction
      // Attempting to call completeInteraction here would return null as interaction is already completed
      
      console.log(`🎉 [SessionMetrics] Non-streaming interaction completed: ${sessionId}`);

      return { 
        response: {
          ...response,
          // Mark non-streaming responses as already persisted server-side
          persistedInServer: true,
          routingInfo: {
            detectedIntent: routingResult.enrichedContext?.detectedIntent || 'unknown',
            targetAgent: routingResult.targetAgent,
            confidence: routingResult.enrichedContext?.confidence || 0,
            extractedEntities: routingResult.enrichedContext?.extractedEntities || []
          }
        }, 
        updatedState: currentState,
        interactionMetrics: null // Already captured and completed in router
      }
    } catch (error) {
      console.error("Error sending message:", error)
      throw error
    }
  }

  async switchAgent(sessionId: string, newAgent: AgentType): Promise<ChatState> {
    if (!this._initialized) await this.initialize()

    const currentState = await this.storage.loadChatSession(sessionId)
    if (!currentState) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Instrumentar cambio manual de agente con Sentry
    return await Sentry.startSpan(
      { name: 'agent.switch.manual', op: 'orchestration' },
      async () => {
        // Registrar métricas del cambio de agente
        trackAgentSwitch({
          userId: currentState.userId || 'demo_user',
          sessionId,
          fromAgent: currentState.activeAgent,
          toAgent: newAgent,
          switchType: 'manual',
          confidence: 1.0
        })
        
        // Close current chat session
        clinicalAgentRouter.closeChatSession(sessionId)

        // Create new chat session with new agent - mark as transition to maintain flow
        await clinicalAgentRouter.createChatSession(sessionId, newAgent, currentState.history, true)

        // Update state
        currentState.activeAgent = newAgent
        currentState.metadata.lastUpdated = new Date()

        // Save updated state
        await this.saveChatSessionBoth(currentState)

        return currentState
      }
    )
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
   * Crea un prompt específico para que cada agente genere su propia confirmación de activación
   */
  private createAgentConfirmationPrompt(targetAgent: string, originalMessage: string): string {
    const agentConfirmationPrompts = {
      socratico: `El usuario me ha solicitado activar el modo socrático con el mensaje: "${originalMessage}".

Como Supervisor Clínico, núcleo reflexivo de la plataforma integral Aurora, debo confirmar mi activación de manera cálida y contextual. Mi respuesta debe reflejar naturalmente mi capacidad de exploración reflexiva profunda, desarrollo de insights terapéuticos y análisis de casos clínicos, mientras mantengo una conciencia implícita de formar parte de un ecosistema más amplio de apoyo clínico. Luego debo hacer una pregunta reflexiva que invite al usuario a comenzar nuestra exploración socrática.

Por favor, genera una confirmación natural y empática que refleje mi personalidad socrática integrada.`,
      
      clinico: `El usuario me ha solicitado activar el modo clínico con el mensaje: "${originalMessage}".

Como Especialista en Documentación, núcleo organizacional de la plataforma integral Aurora, debo confirmar mi activación de manera profesional y estructurada. Mi respuesta debe reflejar naturalmente mi capacidad de documentación clínica, resúmenes de sesión, notas SOAP y estructuración de información profesional, mientras mantengo una conciencia implícita de formar parte de un ecosistema que integra exploración reflexiva, documentación estructurada y validación empírica. Luego debo preguntar específicamente qué tipo de documentación o tarea clínica necesita.

Por favor, genera una confirmación clara y profesional que refleje mi enfoque clínico organizativo integrado.`,
      
      academico: `El usuario me ha solicitado activar el modo académico con el mensaje: "${originalMessage}".

Como Aurora Académico, núcleo científico de la plataforma integral Aurora, debo confirmar mi activación de manera rigurosa y científica. Mi respuesta debe reflejar naturalmente mi capacidad de búsqueda de investigación científica, evidencia empírica y revisión de literatura especializada, mientras mantengo una conciencia implícita de formar parte de un ecosistema que conecta rigor científico con exploración reflexiva y documentación profesional. Luego debo preguntar específicamente qué tema de investigación o evidencia científica necesita explorar.

Por favor, genera una confirmación precisa y académica que refleje mi enfoque científico integrado.`
    }

    return agentConfirmationPrompts[targetAgent as keyof typeof agentConfirmationPrompts] || 
           `El usuario me ha solicitado cambiar al modo ${targetAgent}. Por favor, confirma la activación y pregunta en qué puedo ayudar.`
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
    reasoningBullets?: ReasoningBullet[]
  ): Promise<void> {
    if (!this._initialized) await this.initialize()

    console.log('🔍 [addStreamingResponseToHistory] Cargando estado desde DB para sessionId:', sessionId)

    const currentState = await this.storage.loadChatSession(sessionId)
    if (!currentState) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    console.log('📊 [addStreamingResponseToHistory] Estado cargado desde DB:', {
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
      reasoningBullets: reasoningBullets && reasoningBullets.length > 0 ? [...reasoningBullets] : undefined
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
      console.log(`[HopeAI] Recreando sesión activa para: ${sessionId}`)
      await clinicalAgentRouter.createChatSession(
        sessionId, 
        currentState.activeAgent, 
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
      console.log(`📁 Uploading document: ${file.name} for session: ${sessionId}`)
      
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
        console.log(`📋 Document already exists in session: ${file.name} (${duplicateFile.id})`)
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
      
      console.log(`✅ Document uploaded successfully: ${uploadedFile.id}`)
      return uploadedFile
    } catch (error) {
      console.error(`❌ Error uploading document ${file.name}:`, error)
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
      console.log(`📋 [OPTIMIZED] Getting pending files for session: ${sessionId}`)

      // Obtener TODOS los archivos clínicos procesados de la sesión
      const clinicalFiles = await this.storage.getClinicalFiles(sessionId)

      // Filtrar solo archivos que están procesados (listos para usar)
      const processedFiles = clinicalFiles.filter((file: ClinicalFile) =>
        file.sessionId === sessionId &&
        file.status === 'processed'
      )

      console.log(`📋 [OPTIMIZED] Found ${processedFiles.length} truly pending files for session ${sessionId} (${clinicalFiles.length} total, 0 already sent)`)
      return processedFiles
    } catch (error) {
      console.error(`❌ Error getting pending files for session ${sessionId}:`, error)
      return []
    }
  }

  /**
   * NUEVA FUNCIÓN: Obtener archivos por IDs para procesamiento dinámico
   * Implementa patrón de referencia por ID siguiendo mejores prácticas del SDK
   */
  async getFilesByIds(fileIds: string[]): Promise<ClinicalFile[]> {
    if (!this._initialized) await this.initialize()
    
    try {
      const files: ClinicalFile[] = []
      for (const fileId of fileIds) {
        const file = await this.storage.getClinicalFileById(fileId)
        if (file && file.status === 'processed') {
          files.push(file)
        }
      }
      return files
    } catch (error) {
      console.error(`❌ Error getting files by IDs:`, error)
      return []
    }
  }

  async removeDocumentFromSession(sessionId: string, fileId: string): Promise<void> {
    if (!this._initialized) await this.initialize()
    
    try {
      console.log(`🗑️ Removing document ${fileId} from session: ${sessionId}`)
      
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
      
      console.log(`✅ Document ${fileId} removed successfully from session ${sessionId}`)
    } catch (error) {
      console.error(`❌ Error removing document ${fileId} from session ${sessionId}:`, error)
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
      activeAgents: Array.from(clinicalAgentRouter.getAllAgents().keys()),
      totalSessions: allSessions.length,
    }
  }

  /**
   * Get comprehensive user analytics and insights
   */
  async getUserAnalytics(userId: string): Promise<any> {
    if (!this._initialized) await this.initialize()
    
    if (this.useAdvancedOrchestration && this.dynamicOrchestrator) {
      return await this.dynamicOrchestrator.getUserAnalytics(userId)
    }
    
    // Fallback for systems without advanced orchestration
    return {
      totalSessions: 0,
      favoriteAgent: 'socratico',
      topTools: [],
      learningTrends: [],
      efficiency: 0,
      sessionInsights: {
        averageLength: 0,
        dominantTopics: [],
        toolEffectiveness: {}
      }
    }
  }

  /**
   * Enable or disable advanced orchestration features
   */
  setAdvancedOrchestration(enabled: boolean): void {
    this.useAdvancedOrchestration = enabled
    console.log(`🧠 Advanced orchestration ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Get current orchestration status
   */
  getOrchestrationStatus(): {
    useAdvancedOrchestration: boolean
    hasDynamicOrchestrator: boolean
    initialized: boolean
  } {
    return {
      useAdvancedOrchestration: this.useAdvancedOrchestration,
      hasDynamicOrchestrator: !!this.dynamicOrchestrator,
      initialized: this._initialized
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
    
    console.log(`📊 [SessionAnalytics] Complete session metrics for ${sessionId}:`, {
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
      console.log(`🔍 [Análisis Longitudinal] Milestone reached: ${sessionCount} sessions with patient ${patientId}`)
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

    console.log(`🔍 [Análisis Longitudinal] Triggering automatic analysis for patient ${patientId}`)

    try {
      // Get patient info
      const patientPersistence = getPatientPersistence()
      const patient = await patientPersistence.loadPatientRecord(patientId)

      if (!patient) {
        console.warn(`⚠️ [Análisis Longitudinal] Patient not found: ${patientId}`)
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

      console.log(`✅ [Análisis Longitudinal] Automatic analysis triggered successfully for patient ${patientId}`)

    } catch (error) {
      console.error(`❌ [Análisis Longitudinal] Error triggering automatic analysis:`, error)
      
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
      console.error('❌ Failed to initialize HopeAI Singleton System:', error)
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
      console.warn('⚠️ resetInstance should only be used in test/development environments')
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
  console.warn('⚠️ getHopeAIInstance() is deprecated. Use HopeAISystemSingleton.getInstance() instead.')
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
  console.warn('⚠️ getOrchestrationSystem() is deprecated. Use getGlobalOrchestrationSystem() instead.')
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

// Re-export control de orquestación del bridge para endpoints de métricas/alerts
// Evita importaciones directas de lib/orchestration-singleton en rutas críticas
export { getGlobalOrchestrationSystem as getBridgeOrchestrationSystem } from './orchestration-singleton'
