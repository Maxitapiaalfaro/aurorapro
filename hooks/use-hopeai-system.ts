"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AgentType, ClinicalMode, ChatMessage, ChatState, ClinicalFile, ReasoningBullet, ReasoningBulletsState, PatientSessionMeta, MessageProcessingStatus, ToolExecutionEvent, ProcessingPhase, ExecutionTimeline } from "@/types/clinical-types"
import {
  findSessionById,
  saveSessionMetadata,
  loadSessionWithMessages,
  getClinicalFile,
  getClinicalFilesBySession,
  resolvePatientId,
  listUserSessions,
} from '@/lib/firestore-client-storage'
import { getSSEClient } from '@/lib/sse-client'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { snapshotExecutionTimeline } from '@/lib/dynamic-status'
import { useAuth } from '@/providers/auth-provider'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ARQUITECTURA MEJORADA: Constante para límite de bullets históricos
const MAX_HISTORICAL_BULLETS = 15

// Estados de transición explícitos para HopeAI
export type TransitionState = 'idle' | 'thinking' | 'selecting_agent' | 'specialist_responding'

// Interfaz para el estado del sistema HopeAI
interface HopeAISystemState {
  sessionId: string | null
  userId: string
  mode: ClinicalMode
  activeAgent: AgentType
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  history: ChatMessage[]
  // Nuevo estado de transición explícito
  transitionState: TransitionState
  // Contexto del paciente para sesiones clínicas
  sessionMeta?: any
  routingInfo?: {
    detectedIntent: string
    targetAgent: AgentType
    confidence: number
    extractedEntities: any[]
  }
  // Estado de bullets progresivos
  reasoningBullets: ReasoningBulletsState
  // Cognitive Transparency Layer: granular processing lifecycle
  processingStatus: MessageProcessingStatus
}

interface UseHopeAISystemReturn {
  // Estado del sistema
  systemState: HopeAISystemState
  
  // Gestión de sesiones
  createSession: (userId: string, mode: ClinicalMode, agent: AgentType) => Promise<string | null>
  loadSession: (sessionId: string) => Promise<boolean>
  
  // Comunicación con enrutamiento inteligente
  sendMessage: (message: string, useStreaming?: boolean, attachedFiles?: ClinicalFile[], sessionMeta?: any) => Promise<any>
  switchAgent: (newAgent: AgentType) => Promise<boolean>
  
  // Acceso al historial
  getHistory: () => ChatMessage[]
  
  // Control de estado
  clearError: () => void
  resetSystem: () => void
  addStreamingResponseToHistory: (
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBulletsForThisResponse?: ReasoningBullet[],
    executionTimeline?: ExecutionTimeline
  ) => Promise<void>
  setSessionMeta: (sessionMeta: any) => void
  
  // Bullets progresivos
  clearReasoningBullets: () => void
  addReasoningBullet: (bullet: ReasoningBullet) => void
}

export function useHopeAISystem(): UseHopeAISystemReturn {
  // Firebase Auth: psychologistId reemplaza al hardcoded 'demo_user'
  const { psychologistId } = useAuth()

  const initialProcessingStatus: MessageProcessingStatus = {
    phase: 'idle',
    startedAt: new Date(),
    toolExecutions: [],
    bullets: [],
    isComplete: true
  }

  const [systemState, setSystemState] = useState<HopeAISystemState>({
    sessionId: null,
    userId: psychologistId ?? 'anonymous',
    mode: 'clinical_supervision',
    activeAgent: 'socratico',
    isLoading: false,
    error: null,
    isInitialized: false,
    history: [],
    transitionState: 'idle',
    sessionMeta: undefined, // Estado inicial sin contexto de paciente
    reasoningBullets: {
      sessionId: '',
      bullets: [],
      isGenerating: false,
      currentStep: 0,
      totalSteps: undefined,
      error: undefined
    },
    processingStatus: initialProcessingStatus
  })

  // Sincronizar userId cuando psychologistId cambia (login/logout)
  useEffect(() => {
    if (psychologistId) {
      setSystemState(prev => ({ ...prev, userId: psychologistId }))
    }
  }, [psychologistId])

  const lastSessionIdRef = useRef<string | null>(null)
  // Ref to access the latest history in callbacks without adding it to dependency arrays
  const historyRef = useRef<ChatMessage[]>(systemState.history)
  historyRef.current = systemState.history
  // Ref to access the latest processingStatus in callbacks without re-renders
  const processingStatusRef = useRef<MessageProcessingStatus>(systemState.processingStatus)
  processingStatusRef.current = systemState.processingStatus

  // NUEVA FUNCIONALIDAD: Estado temporal para bullets del mensaje actual
  const [currentMessageBullets, setCurrentMessageBullets] = useState<ReasoningBullet[]>([])

  // Cargar sesión existente
  const loadSession = useCallback(async (sessionId: string, allowDuringInit = false): Promise<boolean> => {
    if (!systemState.isInitialized && !allowDuringInit) {
      logger.error('Sistema HopeAI no inicializado')
      return false
    }

    try {
      setSystemState(prev => ({ ...prev, isLoading: true, error: null }))

      // Load session from Firestore (with offline cache)
      const result = psychologistId ? await findSessionById(psychologistId, sessionId) : null
      const chatState = result?.session ?? null

      if (!chatState) {
        throw new Error(`Sesión no encontrada: ${sessionId}`)
      }

      // 🏥 FIX: Try to use sessionMeta from storage first, then reconstruct if needed
      let sessionMetaToUse: PatientSessionMeta | undefined = undefined

      // Priority 1: Use sessionMeta from ChatState if available
      if (chatState.sessionMeta) {
        logger.info(`✅ Using existing sessionMeta from ChatState for patient: ${chatState.sessionMeta.patient.reference}`)
        sessionMetaToUse = chatState.sessionMeta
      }
      // Priority 2: Reconstruct sessionMeta if session has patient context but no sessionMeta
      else if (chatState.clinicalContext?.patientId) {
        try {
          const { loadPatient } = await import('@/lib/firestore-client-storage')
          const { PatientContextComposer } = await import('@/lib/patient-summary-builder')
          const { PatientSummaryBuilder } = await import('@/lib/patient-summary-builder')

          const patient = psychologistId ? await loadPatient(psychologistId, chatState.clinicalContext.patientId!) : null

          if (patient) {
            logger.info(`🔄 Reconstructing sessionMeta for patient: ${patient.displayName}`)
            const composer = new PatientContextComposer()

            // Get full patient summary to enrich sessionMeta
            const patientSummary = await PatientSummaryBuilder.getSummaryWithFicha(patient)

            sessionMetaToUse = composer.createSessionMetadata(patient, {
              sessionId: chatState.sessionId,
              userId: chatState.userId,
              clinicalMode: chatState.clinicalContext.sessionType || 'clinical_supervision',
              activeAgent: chatState.activeAgent
            }, patientSummary)

            logger.info(`✅ SessionMeta reconstructed for patient: ${sessionMetaToUse.patient.reference}`)

            // 🏥 FIX: Save reconstructed sessionMeta back to storage
            chatState.sessionMeta = sessionMetaToUse
            if (psychologistId) {
              const pid = resolvePatientId(chatState)
              await saveSessionMetadata(psychologistId, pid, chatState)
            }
            logger.info(`💾 Reconstructed sessionMeta saved to storage`)
          } else {
            logger.warn(`⚠️ Patient not found for ID: ${chatState.clinicalContext.patientId}`)
          }
        } catch (error) {
          logger.error('Failed to reconstruct sessionMeta:', error)
        }
      }

      // Actualizar el estado del sistema con los datos de la sesión cargada
      setSystemState(prev => ({
        ...prev,
        sessionId: chatState.sessionId,
        userId: chatState.userId,
        mode: chatState.mode,
        activeAgent: chatState.activeAgent,
        history: chatState.history,
        isLoading: false,
        sessionMeta: sessionMetaToUse
      }))
      lastSessionIdRef.current = chatState.sessionId

      logger.info('✅ Sesión HopeAI cargada:', sessionId)
      logger.info('📊 Historial cargado con', chatState.history.length, 'mensajes')
      return true
    } catch (error) {
      logger.error('❌ Error cargando sesión:', error)
      setSystemState(prev => ({
        ...prev,
        error: 'Error al cargar la sesión',
        isLoading: false
      }))
      return false
    }
  }, [systemState.isInitialized, systemState.sessionMeta])

  // Función para intentar restaurar la sesión más reciente
  const attemptSessionRestoration = useCallback(async () => {
    try {
      if (!psychologistId) return false

      const recent = await listUserSessions(psychologistId, { pageSize: 1, sortBy: 'lastUpdated', sortOrder: 'desc' })
      const mostRecent = recent.items[0]

      if (mostRecent) {
        logger.info('🔄 Intentando restaurar sesión más reciente:', mostRecent.sessionId)

        // Verificar que la sesión sea válida y no muy antigua (ej: menos de 24 horas)
        const sessionAge = Date.now() - new Date(mostRecent.lastUpdated).getTime()
        const maxAge = 24 * 60 * 60 * 1000 // 24 horas en milisegundos

        if (sessionAge < maxAge) {
          const success = await loadSession(mostRecent.sessionId, true) // Permitir carga durante inicialización
          if (success) {
            logger.info('✅ Sesión más reciente restaurada exitosamente')
            return true // Indicar que se restauró una sesión
          } else {
            logger.info('⚠️ No se pudo restaurar la sesión más reciente')
          }
        } else {
          logger.info('⚠️ Sesión más reciente demasiado antigua, no se restaurará')
        }
      } else {
        logger.info('ℹ️ No hay sesiones recientes para restaurar')
      }
    } catch (error) {
      logger.error('❌ Error intentando restaurar sesión:', error)
      // No lanzamos el error para no interrumpir la inicialización
    }
    return false // No se restauró ninguna sesión
  }, [loadSession, psychologistId])

  // Inicialización del sistema HopeAI (sin dependencias para evitar re-inicializaciones)
  useEffect(() => {
    // Client-side storage uses Firestore with offline persistence.
    // No server-side HopeAISystem needed — messages are sent via /api/send-message.
    setSystemState(prev => ({
      ...prev,
      isInitialized: true,
      isLoading: false
    }))
    logger.info('🚀 HopeAI Client System initialized (client-side storage + SSE)')
  }, []) // Sin dependencias para evitar re-inicializaciones

  // Estado para prevenir creación múltiple simultánea
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // Crear nueva sesión con protección contra llamadas simultáneas
  const createSession = useCallback(async (
    userId: string,
    mode: ClinicalMode,
    agent: AgentType
  ): Promise<string | null> => {
    // Prevenir múltiples ejecuciones simultáneas
    if (isCreatingSession) {
      logger.info('⚠️ Hook: Creación de sesión ya en progreso, ignorando solicitud duplicada')
      return null
    }

    try {
      setIsCreatingSession(true)
      setSystemState(prev => ({ ...prev, isLoading: true, error: null }))

      // 🔥 FIX: Llamar al endpoint API en lugar de ejecutar código de IA en el cliente.
      // createClinicalSession() invoca ai.chats.create() que requiere credenciales del servidor
      // (Vertex AI). En el navegador no hay credenciales y lanzaba "Error al crear la sesión".
      const response = await authenticatedFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode, agent }),
      })

      let data: any
      try {
        data = await response.json()
      } catch {
        throw new Error(`Error al crear la sesión (HTTP ${response.status})`)
      }

      if (!response.ok) {
        throw new Error(data?.details || data?.error || `Error al crear la sesión (HTTP ${response.status})`)
      }

      const { sessionId, chatState } = data

      setSystemState(prev => ({
        ...prev,
        sessionId,
        userId,
        mode,
        activeAgent: agent,
        history: chatState.history,
        isLoading: false
      }))
      lastSessionIdRef.current = sessionId

      logger.info('✅ Sesión HopeAI creada:', sessionId)
      return sessionId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('❌ Error creando sesión: ' + errorMessage)
      setSystemState(prev => ({
        ...prev,
        error: errorMessage || 'Error al crear la sesión',
        isLoading: false
      }))
      return null
    } finally {
      setIsCreatingSession(false)
    }
  }, [isCreatingSession])



  // Enviar mensaje con enrutamiento inteligente
  const sendMessage = useCallback(async (
    message: string,
    useStreaming = true,
    attachedFiles?: ClinicalFile[],
    sessionMeta?: any
  ): Promise<any> => {
    // 🔍 CRITICAL DIAGNOSTIC: Log what we receive at entry point
    logger.info('🔍 [HOOK.sendMessage] ENTRY POINT:', {
      messageLength: message.length,
      useStreaming,
      attachedFilesProvided: !!attachedFiles,
      attachedFilesCount: attachedFiles?.length || 0,
      attachedFilesDetails: attachedFiles?.map(f => ({
        id: f.id,
        name: f.name,
        status: f.status,
        geminiFileUri: f.geminiFileUri
      })) || [],
      sessionMetaProvided: !!sessionMeta,
      timestamp: new Date().toISOString()
    })

    // Lazy-create session on first message send
    let sessionIdToUse = systemState.sessionId
    let sessionMetaToUse = sessionMeta || systemState.sessionMeta
    
    if (!sessionIdToUse) {
      const userId = systemState.userId || 'anonymous'
      const mode = systemState.mode || 'clinical_supervision'
      const agent = systemState.activeAgent || 'socratico'
      
      logger.info('🔄 Creando sesión lazy con contexto:', {
        hasSessionMeta: !!systemState.sessionMeta,
        patientRef: systemState.sessionMeta?.patient?.reference
      })
      
      const newSessionId = await createSession(userId, mode, agent)
      if (!newSessionId) {
        throw new Error('No se pudo crear la sesión')
      }
      sessionIdToUse = newSessionId
      lastSessionIdRef.current = newSessionId
      
      // CRÍTICO: Si hay sessionMeta (contexto del paciente) preestablecido,
      // actualizarlo con el sessionId recién creado ANTES de enviarlo
      if (systemState.sessionMeta) {
        const updatedSessionMeta = {
          ...systemState.sessionMeta,
          sessionId: newSessionId
        }
        sessionMetaToUse = updatedSessionMeta
        setSystemState(prev => ({
          ...prev,
          sessionId: newSessionId,
          sessionMeta: updatedSessionMeta
        }))
        logger.info('✅ SessionMeta actualizado con sessionId:', newSessionId)
        logger.info('🏥 Contexto del paciente:', updatedSessionMeta.patient?.reference)

        // 🏥 FIX: Also persist the updated sessionMeta to Firestore immediately
        try {
          if (psychologistId) {
            const result = await findSessionById(psychologistId, newSessionId)
            if (result) {
              const { session: currentState, patientId: pid } = result
              currentState.sessionMeta = updatedSessionMeta
              currentState.clinicalContext = {
                ...currentState.clinicalContext,
                patientId: updatedSessionMeta.patient.reference,
                confidentialityLevel: updatedSessionMeta.patient.confidentialityLevel
              }
              await saveSessionMetadata(psychologistId, pid, currentState)
              logger.info('💾 SessionMeta persisted to Firestore after lazy session creation')
            }
          }
        } catch (error) {
          logger.error('⚠️ Failed to persist sessionMeta after lazy creation:', error)
        }
      }
    }

    try {
      // Crear mensaje del usuario inmediatamente para mostrar en la UI
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
        agent: systemState.activeAgent,
        // ARQUITECTURA OPTIMIZADA: Solo usar fileReferences con IDs
        fileReferences: attachedFiles?.map(file => file.id) || []
      }
      // NUEVA FUNCIONALIDAD: Limpiar bullets temporales del mensaje anterior
      setCurrentMessageBullets([])
      
      // Actualizar el historial inmediatamente con el mensaje del usuario
      setSystemState(prev => {
        return {
          ...prev,
          history: [...prev.history, userMessage],
          // 🏥 FIX: Explicitly preserve sessionMeta to prevent loss during state updates
          sessionMeta: prev.sessionMeta,
          isLoading: true,
          error: null,
          transitionState: 'thinking',
          reasoningBullets: {
            ...prev.reasoningBullets,
            sessionId: sessionIdToUse!,
            bullets: [], // Limpiar bullets globales para el nuevo mensaje
            isGenerating: true,
            currentStep: 0
          },
          processingStatus: {
            phase: 'analyzing_intent',
            startedAt: new Date(),
            toolExecutions: [],
            bullets: [],
            isComplete: false
          }
        }
      })

      // 💾 Ensure session doc exists in Firestore (best-effort, non-blocking for UI)
      // NOTE: User message is NOT persisted here to avoid duplication.
      // The server persists the user message as part of saveChatSessionBoth() after processing.
      try {
        if (psychologistId) {
          const patientId = resolvePatientId({
            clinicalContext: {
              patientId: systemState.sessionMeta?.patient?.reference,
              sessionType: systemState.mode || 'clinical_supervision',
              confidentialityLevel: systemState.sessionMeta?.patient?.confidentialityLevel || 'high',
            },
            sessionMeta: systemState.sessionMeta,
          })

          // Check if session doc exists; if not, create it
          const existingResult = await findSessionById(psychologistId, sessionIdToUse!)
          if (!existingResult) {
            // New session — create the session document
            const newSession: ChatState = {
              sessionId: sessionIdToUse!,
              userId: systemState.userId || psychologistId,
              mode: systemState.mode || 'clinical_supervision',
              activeAgent: systemState.activeAgent,
              history: [],
              metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: userMessage.fileReferences || [] },
              clinicalContext: {
                sessionType: systemState.mode || 'clinical_supervision',
                confidentialityLevel: systemState.sessionMeta?.patient?.confidentialityLevel || 'high',
                patientId: systemState.sessionMeta?.patient?.reference
              },
              sessionMeta: systemState.sessionMeta
            }
            await saveSessionMetadata(psychologistId, patientId, newSession)
          }
        }
      } catch (persistError) {
        logger.error('❌ [Firestore] Error al verificar/crear sesión:', persistError)
      }

      logger.info('📤 Enviando mensaje vía SSE con enrutamiento inteligente:', message.substring(0, 50) + '...')

      // 📁 Obtener metadata completa de archivos desde IndexedDB para bypass de serverless storage
      let fileMetadata: any[] | undefined = undefined
      if (attachedFiles && attachedFiles.length > 0) {
        try {
          fileMetadata = attachedFiles.map(file => ({
            id: file.id,
            name: file.name,
            type: file.type,
            size: file.size,
            geminiFileUri: file.geminiFileUri,
            geminiFileId: file.geminiFileId,
            status: file.status,
            uploadDate: file.uploadDate,
            sessionId: file.sessionId
          }))
          logger.info('📁 [Client] Passing file metadata to bypass serverless storage:', fileMetadata.map(f => f.name))
        } catch (e) {
          logger.warn('⚠️ [Client] Could not extract file metadata:', e)
        }
      } else {
        // 🔄 FALLBACK: If attachedFiles is empty, try loading from IndexedDB directly
        logger.info('🔄 [Client] attachedFiles is empty, attempting IndexedDB fallback...')

        // First, check if we have file IDs from the user message's fileReferences
        const fileIdsToLoad: string[] = []

        // Get file IDs from the most recent user message's fileReferences if available
        if (systemState.history.length > 0) {
          const lastUserMessage = [...systemState.history].reverse().find(m => m.role === 'user')
          if (lastUserMessage?.fileReferences && lastUserMessage.fileReferences.length > 0) {
            fileIdsToLoad.push(...lastUserMessage.fileReferences)
            logger.info('📁 [Client] Found file IDs from last user message:', fileIdsToLoad)
          }
        }

        try {
          let loadedFiles: any[] = []

          // Try loading by specific file IDs first (most reliable)
          if (fileIdsToLoad.length > 0 && psychologistId) {
            logger.info('📁 [Client] Loading files by ID:', fileIdsToLoad)
            const filePromises = fileIdsToLoad.map(id => getClinicalFile(psychologistId, id))
            const filesResults = await Promise.all(filePromises)
            loadedFiles = filesResults.filter(f => f !== null)
            logger.info('📁 [Client] Loaded by ID:', {
              requested: fileIdsToLoad.length,
              loaded: loadedFiles.length,
              files: loadedFiles.map(f => ({ id: f.id, name: f.name, status: f.status }))
            })
          }

          // If no files loaded by ID, try loading by sessionId
          if (loadedFiles.length === 0 && sessionIdToUse && psychologistId) {
            logger.info('📁 [Client] No files loaded by ID, trying by sessionId:', sessionIdToUse)
            loadedFiles = await getClinicalFilesBySession(psychologistId, sessionIdToUse)
            logger.info('📁 [Client] Loaded by sessionId:', {
              count: loadedFiles.length,
              files: loadedFiles.map(f => ({ id: f.id, name: f.name, status: f.status }))
            })
          }

          // Last resort: load ALL recent processed files and filter by recency
          if (loadedFiles.length === 0 && psychologistId) {
            logger.info('📁 [Client] No files found by ID or sessionId, loading all recent files...')
            const allFiles = await getClinicalFilesBySession(psychologistId, sessionIdToUse || '')
            // Get files uploaded in the last 5 minutes that are processed
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
            const recentFiles = allFiles.filter(f =>
              f.status === 'processed' &&
              new Date(f.uploadDate) > fiveMinutesAgo
            )
            // Sort by upload date descending and take the most recent one
            recentFiles.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
            if (recentFiles.length > 0) {
              loadedFiles = [recentFiles[0]] // Take only the most recent file
              logger.info('📁 [Client] Found recent file:', {
                id: loadedFiles[0].id,
                name: loadedFiles[0].name,
                uploadDate: loadedFiles[0].uploadDate
              })
            } else {
              logger.info('⚠️ [Client] No recent processed files found in IndexedDB')
            }
          }

          if (loadedFiles.length > 0) {
            // Filter for processed files only
            const processedFiles = loadedFiles.filter(f => f.status === 'processed')
            logger.info('📁 [Client] Filtered to processed files:', {
              processedCount: processedFiles.length,
              totalCount: loadedFiles.length
            })

            if (processedFiles.length > 0) {
              fileMetadata = processedFiles.map(file => ({
                id: file.id,
                name: file.name,
                type: file.type,
                size: file.size,
                geminiFileUri: file.geminiFileUri,
                geminiFileId: file.geminiFileId,
                status: file.status,
                uploadDate: file.uploadDate,
                sessionId: file.sessionId
              }))
              logger.info('✅ [Client] IndexedDB fallback succeeded, passing file metadata:', fileMetadata.map(f => f.name))
            } else {
              logger.info('⚠️ [Client] IndexedDB fallback found files but none are processed')
            }
          } else {
            logger.info('⚠️ [Client] IndexedDB fallback found no files')
          }
        } catch (idbError) {
          logger.error('❌ [Client] IndexedDB fallback failed:', idbError)
        }
      }

      // Callback para manejar bullets progresivos
      const handleBulletUpdate = (bullet: ReasoningBullet) => {
        logger.info('🎯 Bullet recibido:', bullet.content)
        addReasoningBullet(bullet)
      }

      // 🎯 CALLBACK: Cuando se selecciona el agente INMEDIATAMENTE
      const handleAgentSelected = (routingInfo: { targetAgent: string; confidence: number; reasoning: string }) => {
        logger.info('🎯 Agente seleccionado INMEDIATAMENTE:', routingInfo.targetAgent)
        setSystemState(prev => {
          // 🔥 ACTUALIZAR el mensaje del usuario con el agente REAL
          const updatedHistory = [...prev.history]
          const lastMessage = updatedHistory[updatedHistory.length - 1]
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.agent = routingInfo.targetAgent as AgentType
            logger.info('🔄 Mensaje del usuario actualizado con agente real:', routingInfo.targetAgent)
          }

          return {
            ...prev,
            history: updatedHistory,
            activeAgent: routingInfo.targetAgent as AgentType, // 🔥 ACTUALIZAR activeAgent INMEDIATAMENTE
            routingInfo: {
              detectedIntent: 'agent_selected',
              targetAgent: routingInfo.targetAgent as AgentType,
              confidence: routingInfo.confidence,
              extractedEntities: []
            },
            transitionState: 'specialist_responding',
            processingStatus: {
              ...prev.processingStatus,
              phase: 'agent_selected',
              routingInfo: {
                targetAgent: routingInfo.targetAgent as AgentType,
                confidence: routingInfo.confidence,
                reasoning: routingInfo.reasoning
              }
            }
          }
        })

        // 💾 Persistir actualización del agente para el último mensaje de usuario en Firestore
        void (async () => {
          try {
            if (!psychologistId) return
            const result = await findSessionById(psychologistId, sessionIdToUse!)
            if (result) {
              const { session: existingState, patientId: pid } = result
              existingState.activeAgent = routingInfo.targetAgent as AgentType
              existingState.metadata = { ...existingState.metadata, lastUpdated: new Date() }
              await saveSessionMetadata(psychologistId, pid, existingState)
              logger.info('💾 [Firestore] Agente del mensaje de usuario actualizado en persistencia')
            }
          } catch (e) {
            logger.warn('⚠️ [Firestore] No se pudo actualizar el agente en persistencia:', e)
          }
        })()
      }

      // Simular estado de selección de agente
      setTimeout(() => {
        setSystemState(prev => ({
          ...prev,
          transitionState: 'selecting_agent'
        }))
      }, 500)

      // 🔥 NUEVA ARQUITECTURA: Usar SSE Client y retornar AsyncGenerator para streaming real
      const sseClient = getSSEClient()

      // 🔍 FINAL DIAGNOSTIC: Log what we're about to send to the API
      logger.info('🔍 [HOOK.sendMessage] ABOUT TO SEND TO API:', {
        sessionId: sessionIdToUse,
        messagePreview: message.substring(0, 50) + '...',
        fileReferencesCount: attachedFiles?.map(file => file.id).length || 0,
        fileReferences: attachedFiles?.map(file => file.id) || [],
        fileMetadataCount: fileMetadata?.length || 0,
        fileMetadataDetails: fileMetadata?.map(f => ({
          id: f.id,
          name: f.name,
          geminiFileUri: f.geminiFileUri
        })) || [],
        timestamp: new Date().toISOString()
      })

      // Variables para acumular datos durante el streaming
      let finalRoutingInfo: any = null

      // Crear AsyncGenerator que yielde chunks en tiempo real
      const streamGenerator = (async function* () {
        try {
          // Usar el nuevo método sendMessageStream que yielda chunks
          for await (const chunk of sseClient.sendMessageStream(
            {
              sessionId: sessionIdToUse!,
              message,
              useStreaming,
              userId: systemState.userId || 'anonymous',
              suggestedAgent: undefined,
              sessionMeta: sessionMetaToUse,
              fileReferences: attachedFiles?.map(file => file.id) || [],
              fileMetadata // Pasar metadata completa de archivos
            },
            {
              onBullet: handleBulletUpdate,
              onAgentSelected: handleAgentSelected,
              onToolExecution: (tool: ToolExecutionEvent) => {
                logger.info('🔧 Tool execution event:', tool.toolName, tool.status)
                setSystemState(prev => {
                  if (tool.status === 'started') {
                    // Deduplicate: skip if a tool with the same toolName and query is already in 'started' state
                    const alreadyStarted = prev.processingStatus.toolExecutions.some(
                      t => t.toolName === tool.toolName && t.status === 'started' && t.query === tool.query
                    )
                    if (alreadyStarted) {
                      return prev
                    }
                    return {
                      ...prev,
                      processingStatus: {
                        ...prev.processingStatus,
                        phase: 'executing_tools',
                        toolExecutions: [...prev.processingStatus.toolExecutions, tool]
                      }
                    }
                  }
                  if (tool.status === 'in_progress') {
                    // Update progress message on the matching started tool
                    const updatedExecutions = prev.processingStatus.toolExecutions.map(t => {
                      if (t.toolName === tool.toolName && (t.status === 'started' || t.status === 'in_progress')) {
                        return { ...t, status: 'in_progress' as const, progressMessage: tool.progressMessage }
                      }
                      return t
                    })
                    return {
                      ...prev,
                      processingStatus: {
                        ...prev.processingStatus,
                        toolExecutions: updatedExecutions
                      }
                    }
                  }
                  // For completed/error: find the first matching tool still in 'started' or 'in_progress' state
                  let matched = false
                  const updatedExecutions = prev.processingStatus.toolExecutions.map(t => {
                    if (!matched && t.toolName === tool.toolName && (t.status === 'started' || t.status === 'in_progress')) {
                      matched = true
                      return { ...t, status: tool.status, result: tool.result, academicSources: tool.academicSources } as ToolExecutionEvent
                    }
                    return t
                  })
                  // Bridge the latency gap: when ALL tools finish, transition to
                  // 'synthesizing' so the UI shows an active "analyzing evidence"
                  // step instead of freezing with no spinner until the first
                  // streaming text chunk arrives from the model.
                  const allToolsDone = updatedExecutions.length > 0 &&
                    updatedExecutions.every(t => t.status === 'completed' || t.status === 'error')
                  const nextPhase = allToolsDone ? 'synthesizing' : prev.processingStatus.phase
                  return {
                    ...prev,
                    processingStatus: {
                      ...prev.processingStatus,
                      phase: nextPhase,
                      toolExecutions: updatedExecutions
                    }
                  }
                })
              },
              onChunk: (chunk) => {
                // Este callback se ejecuta pero no necesitamos hacer nada aquí
                // porque el generator ya está yieldando los chunks
                logger.info('📝 Chunk procesado en callback')
                // Update phase to streaming on first chunk
                setSystemState(prev => {
                  if (prev.processingStatus.phase !== 'streaming') {
                    return {
                      ...prev,
                      processingStatus: {
                        ...prev.processingStatus,
                        phase: 'streaming'
                      }
                    }
                  }
                  return prev
                })
              },
              onResponse: (responseData) => {
                logger.info('✅ Respuesta final recibida vía SSE')

                // 🎯 ACTUALIZAR ROUTING INFO si está disponible
                if (responseData.response?.routingInfo) {
                  finalRoutingInfo = responseData.response.routingInfo
                  setSystemState(prev => ({
                    ...prev,
                    routingInfo: responseData.response.routingInfo,
                    transitionState: 'specialist_responding'
                  }))
                  logger.info('🎯 Agente seleccionado:', responseData.response.routingInfo.targetAgent)
                }

                // 🛠️ FIX: Finalizar indicador de generación de bullets si el backend
                // no envía bullets progresivos (o ya terminó la generación).
                // Don't regress the phase: if we've already reached 'streaming'
                // (from onChunk), keep it — only advance to 'synthesizing' if
                // we're still in an earlier phase (e.g. executing_tools).
                setSystemState(prev => {
                  const phase = prev.processingStatus.phase
                  const shouldAdvance = phase !== 'streaming' && phase !== 'complete'
                  return {
                    ...prev,
                    reasoningBullets: {
                      ...prev.reasoningBullets,
                      isGenerating: false
                    },
                    processingStatus: {
                      ...prev.processingStatus,
                      phase: shouldAdvance ? 'synthesizing' : phase
                    }
                  }
                })
              },
              onError: (error, details) => {
                logger.error('❌ Error SSE:', error, details)
                throw new Error(error)
              },
              onComplete: () => {
                logger.info('✅ Stream SSE completado')
                // 🛠️ FIX: Asegurar que isGenerating quede en false al cerrar el stream
                setSystemState(prev => ({
                  ...prev,
                  reasoningBullets: {
                    ...prev.reasoningBullets,
                    isGenerating: false
                  },
                  processingStatus: {
                    ...prev.processingStatus,
                    phase: 'complete',
                    isComplete: true
                  }
                }))
              }
            }
          )) {
            // ✅ YIELDAR CADA CHUNK INMEDIATAMENTE para que la UI se actualice
            logger.info('🚀 [Hook] Yielding chunk:', chunk.text?.substring(0, 50))
            yield chunk
          }
        } catch (error) {
          logger.error('❌ Error en stream generator:', error)
          throw error
        }
      })()

      // Agregar routingInfo como propiedad del generator (para compatibilidad con chat-interface.tsx)
      // Esto se actualizará cuando llegue el evento 'response'
      Object.defineProperty(streamGenerator, 'routingInfo', {
        get: () => finalRoutingInfo,
        enumerable: true
      })

      logger.info('✅ Retornando AsyncGenerator para streaming en tiempo real')

      // Retornar el generator directamente - chat-interface.tsx lo consumirá
      return streamGenerator
    } catch (error) {
      logger.error('❌ Error enviando mensaje:', error)
      setSystemState(prev => ({
        ...prev,
        error: 'Error al enviar el mensaje',
        isLoading: false,
        transitionState: 'idle',
        processingStatus: {
          ...prev.processingStatus,
          phase: 'error',
          isComplete: true
        }
      }))
      throw error
    }
  }, [systemState.sessionId, systemState.activeAgent])

  // Cambiar agente manualmente (aunque el sistema puede hacerlo automáticamente)
  const switchAgent = useCallback(async (newAgent: AgentType): Promise<boolean> => {
    if (!systemState.sessionId) {
      logger.error('No hay sesión activa para cambiar agente')
      return false
    }

    try {
      setSystemState(prev => ({ ...prev, isLoading: true }))
      
      // El cambio de agente se maneja internamente por el intelligent router
      // Aquí solo actualizamos el estado local
      setSystemState(prev => ({
        ...prev,
        activeAgent: newAgent,
        isLoading: false
      }))

      logger.info('✅ Agente cambiado a:', newAgent)
      return true
    } catch (error) {
      logger.error('❌ Error cambiando agente:', error)
      setSystemState(prev => ({ ...prev, isLoading: false }))
      return false
    }
  }, [systemState.sessionId])

  // Obtener historial
  const getHistory = useCallback((): ChatMessage[] => {
    return systemState.history
  }, [systemState.history])

  // Limpiar error
  const clearError = useCallback(() => {
    setSystemState(prev => ({ ...prev, error: null }))
  }, [])

  // Resetear sistema
  const resetSystem = useCallback(() => {
    setSystemState({
      sessionId: null,
      userId: psychologistId ?? 'anonymous',
      mode: 'clinical_supervision',
      activeAgent: 'socratico',
      isLoading: false,
      error: null,
      isInitialized: systemState.isInitialized,
      history: [],
      transitionState: 'idle',
      sessionMeta: undefined, // CRÍTICO: Limpiar contexto del paciente
      reasoningBullets: {
        sessionId: '',
        bullets: [],
        isGenerating: false,
        currentStep: 0,
        totalSteps: undefined,
        error: undefined
      },
      processingStatus: initialProcessingStatus
    })
    lastSessionIdRef.current = null
  }, [systemState.isInitialized, psychologistId])

  // Agregar respuesta de streaming al historial
  const addStreamingResponseToHistory = useCallback(async (
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBulletsForThisResponse?: ReasoningBullet[],
    executionTimelineForThisResponse?: ExecutionTimeline,
    sessionIdOverride?: string
  ): Promise<void> => {
    // Resolver sessionId objetivo de forma robusta
    let targetSessionId: string | null = sessionIdOverride || systemState.sessionId || lastSessionIdRef.current
    if (!targetSessionId) {
      try {
        if (psychologistId) {
          const recent = await listUserSessions(psychologistId, { pageSize: 1, sortBy: 'lastUpdated', sortOrder: 'desc' })
          targetSessionId = recent.items[0]?.sessionId || null
        }
      } catch (e) {
        // ignore
      }
    }

    if (!targetSessionId) {
      logger.warn('⚠️ addStreamingResponseToHistory: Sin sessionId, se omite la escritura del historial')
      return
    }

    // Crear el mensaje AI
    const aiMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      content: responseContent,
      role: "model",
      agent: agent,
      timestamp: new Date(),
      groundingUrls: groundingUrls || [],
      reasoningBullets: undefined,
      executionTimeline: executionTimelineForThisResponse
    }

    // Asociar bullets si existen
    const bulletsToAttach = (reasoningBulletsForThisResponse && reasoningBulletsForThisResponse.length > 0)
      ? reasoningBulletsForThisResponse
      : currentMessageBullets

    if (bulletsToAttach.length > 0) {
      aiMessage.reasoningBullets = [...bulletsToAttach]
      logger.info('🎯 Bullets asociados al mensaje:', bulletsToAttach.length)
    }

    logger.info('🔄 [addStreamingResponseToHistory] Agregando mensaje del modelo al historial local:', {
      currentHistoryLength: historyRef.current.length,
      aiMessageId: aiMessage.id,
      aiMessageContent: aiMessage.content.substring(0, 50)
    })

    // 🔧 CRITICAL: Update React state FIRST so the AI message appears in the UI immediately.
    // Persistence to IndexedDB/localStorage is best-effort and must not block the UI update.
    setSystemState(prev => ({
      ...prev,
      history: [...prev.history, aiMessage],
      activeAgent: agent,
      isLoading: false
    }))

    // Limpiar bullets temporales después de asociarlos
    setCurrentMessageBullets([])

    logger.info('✅ Respuesta de streaming agregada al historial')
    logger.info('📊 Historial actualizado con', historyRef.current.length + 1, 'mensajes')

    // NOTE: AI message is NOT persisted from the frontend to avoid duplication.
    // The server already persists AI messages as part of saveChatSessionBoth() during streaming/response handling.
  }, [systemState.sessionId, currentMessageBullets])

  // Establecer contexto del paciente
  const setSessionMeta = useCallback((sessionMeta: any) => {
    logger.info('🏥 Estableciendo contexto del paciente:', sessionMeta?.patient?.reference || 'None')
    setSystemState(prev => ({
      ...prev,
      sessionMeta
    }))
  }, [])

  // Funciones para manejar bullets progresivos
  const clearReasoningBullets = useCallback((clearAll = false) => {
    setCurrentMessageBullets([])
    setSystemState(prev => ({
      ...prev,
      reasoningBullets: {
        ...prev.reasoningBullets,
        bullets: [],
        isGenerating: false,
        currentStep: 0,
        error: undefined
      }
    }))
  }, [])

  const addReasoningBullet = useCallback((bullet: ReasoningBullet) => {
    // Agregar bullet al estado temporal del mensaje actual
    setCurrentMessageBullets(prev => [...prev, bullet])
    
    // Mantener compatibilidad con el estado global para la UI actual
    setSystemState(prev => ({
      ...prev,
      reasoningBullets: {
        ...prev.reasoningBullets,
        bullets: [...prev.reasoningBullets.bullets, bullet],
        currentStep: prev.reasoningBullets.currentStep + 1,
        isGenerating: bullet.status === 'generating'
      }
    }))
  }, [])

  return {
    systemState,
    createSession,
    loadSession,
    sendMessage,
    switchAgent,
    getHistory,
    clearError,
    resetSystem,
    addStreamingResponseToHistory,
    setSessionMeta,
    clearReasoningBullets,
    addReasoningBullet
  }
}