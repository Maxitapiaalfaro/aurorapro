"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { AgentType, ClinicalMode, ChatMessage, ChatState, ClinicalFile, ClinicalDocument, ReasoningBullet, ReasoningBulletsState, MessageProcessingStatus, ToolExecutionEvent, ProcessingPhase, ProcessingStepEvent, ExecutionTimeline, ClientContext, DocumentPreviewEvent, DocumentReadyEvent } from "@/types/clinical-types"
import {
  findSessionById,
  saveSessionMetadata,
  loadSessionWithMessages,
  getClinicalFile,
  getClinicalFilesBySession,
  resolvePatientId,
  listUserSessions,
  saveClinicalDocument,
  updateClinicalDocumentContent,
  loadSessionDocuments,
  getActivePatientMemories,
  addMessage,
} from '@/lib/firestore-client-storage'
import { getSSEClient } from '@/lib/sse-client'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { snapshotExecutionTimeline } from '@/lib/dynamic-status'
import { useAuth } from '@/providers/auth-provider'
import { rankMemories } from '@/lib/client-memory-ranker'
import type { ClinicalMemory } from '@/types/memory-types'


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
  /** Inline send error — shown as a retry banner, NOT a full-screen crash */
  sendError: { message: string; retryable: boolean } | null
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
  clearSendError: () => void
  resetSystem: () => void
  addStreamingResponseToHistory: (
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBulletsForThisResponse?: ReasoningBullet[],
    executionTimeline?: ExecutionTimeline,
    serverAiMessageId?: string
  ) => Promise<void>
  setSessionMeta: (sessionMeta: any) => void
  
  // Bullets progresivos
  clearReasoningBullets: () => void
  addReasoningBullet: (bullet: ReasoningBullet) => void

  // Document preview — real-time document generation state
  documentPreview: DocumentPreviewEvent | null
  documentReady: DocumentReadyEvent | null
  isDocumentPanelOpen: boolean
  closeDocumentPanel: () => void
  openDocumentPanel: () => void
  // Persisted document state
  activeDocument: ClinicalDocument | null
  sessionDocuments: ClinicalDocument[]
  saveDocumentEdit: (documentId: string, newMarkdown: string) => Promise<void>
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
    sendError: null,
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
  // Ref to access the latest systemState in sendMessage without stale closures
  const systemStateRef = useRef<HopeAISystemState>(systemState)
  systemStateRef.current = systemState

  // NUEVA FUNCIONALIDAD: Estado temporal para bullets del mensaje actual
  const [currentMessageBullets, setCurrentMessageBullets] = useState<ReasoningBullet[]>([])

  // Document preview state — real-time document generation
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewEvent | null>(null)
  const [documentReady, setDocumentReady] = useState<DocumentReadyEvent | null>(null)
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false)
  // Persisted documents for the current session (survives reload)
  const [sessionDocuments, setSessionDocuments] = useState<ClinicalDocument[]>([])
  // The currently active/visible document (from sessionDocuments or just generated)
  const [activeDocument, setActiveDocument] = useState<ClinicalDocument | null>(null)

  const closeDocumentPanel = useCallback(() => {
    setIsDocumentPanelOpen(false)
  }, [])

  const openDocumentPanel = useCallback(() => {
    setIsDocumentPanelOpen(true)
  }, [])

  // LOCAL-FIRST: Cache clinical memories for the active patient
  const patientMemoriesRef = useRef<{ patientId: string; memories: ClinicalMemory[] } | null>(null)

  useEffect(() => {
    const patientId = systemState.sessionMeta?.patient?.reference
    if (!psychologistId || !patientId) {
      patientMemoriesRef.current = null
      return
    }
    // Skip if already cached for this patient
    if (patientMemoriesRef.current?.patientId === patientId) return

    getActivePatientMemories(psychologistId, patientId)
      .then(memories => {
        patientMemoriesRef.current = { patientId, memories }
        logger.info(`🧠 [LOCAL-FIRST] Cached ${memories.length} memories for patient ${patientId}`)
      })
      .catch(err => {
        logger.warn('⚠️ [LOCAL-FIRST] Failed to cache patient memories:', err)
        patientMemoriesRef.current = null
      })
  }, [psychologistId, systemState.sessionMeta?.patient?.reference])

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

      // Show messages IMMEDIATELY — never block rendering on sessionMeta reconstruction
      const existingSessionMeta = chatState.sessionMeta || undefined

      setSystemState(prev => ({
        ...prev,
        sessionId: chatState.sessionId,
        userId: chatState.userId,
        mode: chatState.mode,
        activeAgent: chatState.activeAgent,
        history: chatState.history,
        isLoading: false,
        sessionMeta: existingSessionMeta
      }))
      lastSessionIdRef.current = chatState.sessionId

      logger.info('✅ Sesión HopeAI cargada:', sessionId)
      logger.info('📊 Historial cargado con', chatState.history.length, 'mensajes')

      // 📄 Restore persisted documents for this session (non-blocking)
      // Clear previous session's document state first
      setDocumentPreview(null)
      setDocumentReady(null)
      setActiveDocument(null)
      setSessionDocuments([])

      if (psychologistId) {
        const patientId = resolvePatientId(chatState)
        loadSessionDocuments(psychologistId, patientId, sessionId)
          .then(docs => {
            if (docs.length > 0) {
              logger.info(`📄 Restored ${docs.length} document(s) for session ${sessionId}`)
              setSessionDocuments(docs)
              // Restore the most recent document as active
              const latestDoc = docs[0] // already sorted by createdAt desc
              setActiveDocument(latestDoc)
              // Reconstruct a DocumentReadyEvent so the panel can show it
              setDocumentReady({
                documentId: latestDoc.id,
                markdown: latestDoc.markdown,
                documentType: latestDoc.documentType,
                availableFormats: ['markdown', 'pdf', 'docx'],
                durationMs: latestDoc.generationDurationMs ?? 0,
              })
            }
          })
          .catch(err => logger.error('Failed to restore session documents:', err))
      }

      // Background reconstruction: if session has patient context but no sessionMeta, reconstruct without blocking UI
      if (!existingSessionMeta && chatState.clinicalContext?.patientId) {
        const patientIdToReconstruct = chatState.clinicalContext.patientId
        ;(async () => {
          try {
            const { loadPatient } = await import('@/lib/firestore-client-storage')
            const { PatientContextComposer, PatientSummaryBuilder } = await import('@/lib/patient-summary-builder')

            const patient = psychologistId ? await loadPatient(psychologistId, patientIdToReconstruct) : null
            if (!patient) {
              logger.warn(`⚠️ Patient not found for background reconstruction: ${patientIdToReconstruct}`)
              return
            }

            logger.info(`🔄 Background: reconstructing sessionMeta for patient: ${patient.displayName}`)
            const composer = new PatientContextComposer()
            const patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patient)
            const reconstructed = composer.createSessionMetadata(patient, {
              sessionId: chatState.sessionId,
              userId: chatState.userId,
              clinicalMode: chatState.clinicalContext?.sessionType || 'clinical_supervision',
              activeAgent: chatState.activeAgent
            }, patientSummary)

            // Update state with reconstructed sessionMeta (non-blocking)
            setSystemState(prev => prev.sessionId === chatState.sessionId ? { ...prev, sessionMeta: reconstructed } : prev)

            // Persist to Firestore in background
            if (psychologistId) {
              const pid = resolvePatientId({ ...chatState, sessionMeta: reconstructed })
              await saveSessionMetadata(psychologistId, pid, { ...chatState, sessionMeta: reconstructed })
            }
            logger.info(`💾 Background: sessionMeta reconstructed and saved`)
          } catch (error) {
            logger.error('Background sessionMeta reconstruction failed (non-blocking):', error)
          }
        })()
      }
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
  }, [systemState.isInitialized, psychologistId])

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

      // Use ref to get latest sessionMeta (avoids stale closure)
      const patientSessionMeta = systemStateRef.current.sessionMeta

      // 🔥 FIX: Llamar al endpoint API en lugar de ejecutar código de IA en el cliente.
      // createClinicalSession() invoca ai.chats.create() que requiere credenciales del servidor
      // (Vertex AI). En el navegador no hay credenciales y lanzaba "Error al crear la sesión".
      const response = await authenticatedFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode, agent, patientSessionMeta }),
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
        // CRITICAL FIX: Preserve existing history (including optimistic user messages)
        // instead of overwriting with the server's empty history for new sessions.
        // This prevents the race condition where the first user message disappears.
        history: prev.history.length > 0 ? prev.history : (chatState.history || []),
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
    const currentState = systemStateRef.current
    let sessionIdToUse = currentState.sessionId
    let sessionMetaToUse = sessionMeta || currentState.sessionMeta

    // ─── OPTIMISTIC UI: Show user message IMMEDIATELY, before any async work ───
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      agent: currentState.activeAgent,
      fileReferences: attachedFiles?.map(file => file.id) || []
    }
    setCurrentMessageBullets([])

    setSystemState(prev => ({
      ...prev,
      history: [...prev.history, userMessage],
      sessionMeta: prev.sessionMeta,
      isLoading: true,
      error: null,
      sendError: null,
      transitionState: 'thinking',
      reasoningBullets: {
        ...prev.reasoningBullets,
        sessionId: sessionIdToUse || 'pending',
        bullets: [],
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
    }))

    // ─── All async work wrapped in try/catch — errors surface as retry, never crash ───
    try {
      // Lazy-create session on first message send
      if (!sessionIdToUse) {
        const userId = currentState.userId || 'anonymous'
        const mode = currentState.mode || 'clinical_supervision'
        const agent = currentState.activeAgent || 'socratico'

        const newSessionId = await createSession(userId, mode, agent)
        if (!newSessionId) {
          throw new Error('No se pudo crear la sesión')
        }
        sessionIdToUse = newSessionId
        lastSessionIdRef.current = newSessionId

        if (currentState.sessionMeta) {
          const updatedSessionMeta = {
            ...currentState.sessionMeta,
            sessionId: newSessionId
          }
          sessionMetaToUse = updatedSessionMeta
          setSystemState(prev => ({
            ...prev,
            sessionId: newSessionId,
            sessionMeta: updatedSessionMeta
          }))

          // Fire-and-forget persistence
          if (psychologistId) {
            const patientId = resolvePatientId({
              clinicalContext: { patientId: updatedSessionMeta.patient.reference, sessionType: currentState.mode || 'clinical_supervision', confidentialityLevel: updatedSessionMeta.patient.confidentialityLevel || 'high' },
              sessionMeta: updatedSessionMeta,
            })
            saveSessionMetadata(psychologistId, patientId, {
              sessionId: newSessionId,
              userId: currentState.userId || psychologistId,
              mode: currentState.mode || 'clinical_supervision',
              activeAgent: currentState.activeAgent,
              history: [],
              metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: [] },
              clinicalContext: { patientId: updatedSessionMeta.patient.reference, sessionType: currentState.mode || 'clinical_supervision', confidentialityLevel: updatedSessionMeta.patient.confidentialityLevel || 'high' },
              sessionMeta: updatedSessionMeta,
            } as ChatState).catch(err =>
              logger.error('⚠️ Background: Failed to persist sessionMeta after lazy creation:', err)
            )
          }
        }
      }

      // Update reasoningBullets sessionId now that we have it (was 'pending' if lazy-created)
      if (sessionIdToUse !== currentState.sessionId) {
        setSystemState(prev => ({
          ...prev,
          sessionId: sessionIdToUse,
          reasoningBullets: { ...prev.reasoningBullets, sessionId: sessionIdToUse! }
        }))
      }

      // Reset document streaming state for the new message.
      // Keep documentReady so the user can still see the previous document.
      // documentReady is only cleared when a *new* document starts streaming (onDocumentPreview).
      setDocumentPreview(null)
      // Don't auto-close panel — user may want to keep viewing previous doc

      // 💾 Ensure session doc exists in Firestore (fire-and-forget, not on critical path)
      // NOTE: User message is NOT persisted here to avoid duplication.
      // The server persists the user message as part of addMessageToSession() after processing.
      // PERF: Fire-and-forget with set({merge:true}) — idempotent, no need to block SSE on this.
      if (psychologistId) {
        const patientId = resolvePatientId({
          clinicalContext: {
            patientId: currentState.sessionMeta?.patient?.reference,
            sessionType: currentState.mode || 'clinical_supervision',
            confidentialityLevel: currentState.sessionMeta?.patient?.confidentialityLevel || 'high',
          },
          sessionMeta: currentState.sessionMeta,
        })

        const sessionDoc: ChatState = {
          sessionId: sessionIdToUse!,
          userId: currentState.userId || psychologistId,
          mode: currentState.mode || 'clinical_supervision',
          activeAgent: currentState.activeAgent,
          history: [],
          metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: userMessage.fileReferences || [] },
          clinicalContext: {
            sessionType: currentState.mode || 'clinical_supervision',
            confidentialityLevel: currentState.sessionMeta?.patient?.confidentialityLevel || 'high',
            patientId: currentState.sessionMeta?.patient?.reference
          },
          sessionMeta: currentState.sessionMeta
        }
        saveSessionMetadata(psychologistId, patientId, sessionDoc).catch(err =>
          logger.error('❌ [Firestore] Background: Error ensuring session doc:', err)
        )
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
        // PERF: Short-circuit if no files attached and no historical file references exist
        const hasHistoricalFiles = historyRef.current.some(m => m.role === 'user' && m.fileReferences && m.fileReferences.length > 0)
        if (!hasHistoricalFiles) {
          logger.info('📁 [Client] No files attached and no historical file references — skipping fallback chain')
        } else {
        // 🔄 FALLBACK: If attachedFiles is empty, try loading from IndexedDB directly
        logger.info('🔄 [Client] attachedFiles is empty, attempting IndexedDB fallback...')

        // First, check if we have file IDs from the user message's fileReferences
        const fileIdsToLoad: string[] = []

        // Get file IDs from the most recent user message's fileReferences if available
        if (historyRef.current.length > 0) {
          const lastUserMessage = [...historyRef.current].reverse().find(m => m.role === 'user')
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
        } // end hasHistoricalFiles
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
        // PERF: Write directly with set({merge:true}) — no need to read first
        void (async () => {
          try {
            if (!psychologistId) return
            const patientId = resolvePatientId({
              clinicalContext: { patientId: currentState.sessionMeta?.patient?.reference, sessionType: 'clinical_supervision', confidentialityLevel: 'high' },
              sessionMeta: currentState.sessionMeta,
            })
            await saveSessionMetadata(psychologistId, patientId, {
              sessionId: sessionIdToUse!,
              activeAgent: routingInfo.targetAgent as AgentType,
              metadata: { lastUpdated: new Date() },
            } as any) // merge: true handles partial writes
            logger.info('💾 [Firestore] Agente del mensaje de usuario actualizado en persistencia')
          } catch (e) {
            logger.warn('⚠️ [Firestore] No se pudo actualizar el agente en persistencia:', e)
          }
        })()
      }

      // 🔥 NUEVA ARQUITECTURA: Usar SSE Client y retornar AsyncGenerator para streaming real
      const sseClient = getSSEClient()

      // LOCAL-FIRST: Build clientContext so the server skips all Firestore reads
      let clientContext: ClientContext | undefined
      const sessionMetaCurrent = sessionMetaToUse || currentState.sessionMeta
      if (sessionMetaCurrent?.patient?.summaryText) {
        const cached = patientMemoriesRef.current
        const cachedMemories = (cached && cached.patientId === sessionMetaCurrent.patient.reference)
          ? cached.memories
          : []

        clientContext = {
          patientSummary: sessionMetaCurrent.patient.summaryText,
          operationalHints: sessionMetaCurrent.operationalHints ?? {
            riskLevel: 'low',
            requiresImmediateAttention: false,
            sessionCount: 0,
            therapeuticPhase: 'assessment',
          },
          rankedMemories: rankMemories(cachedMemories, message, 5),
        }
        logger.info('🚀 [LOCAL-FIRST] clientContext built:', {
          summaryLength: clientContext.patientSummary.length,
          riskLevel: clientContext.operationalHints.riskLevel,
          memoriesRanked: clientContext.rankedMemories.length,
        })
      }

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
              userId: currentState.userId || 'anonymous',
              suggestedAgent: undefined,
              sessionMeta: sessionMetaToUse,
              fileReferences: attachedFiles?.map(file => file.id) || [],
              fileMetadata, // Pasar metadata completa de archivos
              clientContext, // LOCAL-FIRST: pre-computed patient context
            },
            {
              onBullet: handleBulletUpdate,
              onAgentSelected: handleAgentSelected,
              onProcessingStep: (step: ProcessingStepEvent) => {
                setSystemState(prev => {
                  const existing = prev.processingStatus.processingSteps || []
                  // Update existing step or append new one
                  const idx = existing.findIndex(s => s.id === step.id)
                  const updated = idx >= 0
                    ? [...existing.slice(0, idx), step, ...existing.slice(idx + 1)]
                    : [...existing, step]
                  return {
                    ...prev,
                    processingStatus: {
                      ...prev.processingStatus,
                      processingSteps: updated
                    }
                  }
                })
              },
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
                    // Accumulate progress steps and update progress message on the matching tool
                    const updatedExecutions = prev.processingStatus.toolExecutions.map(t => {
                      if (t.toolName === tool.toolName && (t.status === 'started' || t.status === 'in_progress')) {
                        const prevSteps = t.progressSteps || []
                        const newStep = tool.progressMessage
                        return {
                          ...t,
                          status: 'in_progress' as const,
                          progressMessage: tool.progressMessage,
                          progressSteps: newStep ? [...prevSteps, newStep] : prevSteps,
                        }
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
                      return { ...t, status: tool.status, result: tool.result, academicSources: tool.academicSources, completionDetail: tool.completionDetail } as ToolExecutionEvent
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
              onDocumentPreview: (preview: DocumentPreviewEvent) => {
                logger.info('📄 Document preview:', preview.section.id, `${(preview.overallProgress * 100).toFixed(0)}%`)
                // Clear previous ready state when a new document starts streaming
                // so isGenerating correctly returns true for the new document
                setDocumentReady(null)
                setDocumentPreview(preview)
                // Auto-open the panel on first preview event
                setIsDocumentPanelOpen(true)
              },
              onDocumentReady: (document: DocumentReadyEvent) => {
                logger.info('📄 Document ready:', document.documentType, `${(document.durationMs / 1000).toFixed(1)}s`)
                setDocumentReady(document)

                // 💾 Auto-persist the generated document to Firestore
                const currentSessionId = systemStateRef.current.sessionId
                if (psychologistId && currentSessionId) {
                  const clinicalDoc: ClinicalDocument = {
                    id: document.documentId,
                    sessionId: currentSessionId,
                    patientId: systemStateRef.current.clinicalContext?.patientId,
                    documentType: document.documentType,
                    markdown: document.markdown,
                    version: 1,
                    createdBy: 'ai',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    generationDurationMs: document.durationMs,
                  }
                  setActiveDocument(clinicalDoc)
                  setSessionDocuments(prev => [clinicalDoc, ...prev.filter(d => d.id !== clinicalDoc.id)])

                  // Fire-and-forget Firestore write
                  const patientId = resolvePatientId(systemStateRef.current as Partial<ChatState>)
                  saveClinicalDocument(psychologistId, patientId, currentSessionId, clinicalDoc)
                    .then(() => logger.info('💾 Document persisted to Firestore:', clinicalDoc.id))
                    .catch(err => logger.error('❌ Failed to persist document:', err))
                }
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
                // 🛠️ FIX: Only set isComplete=true and stop bullet generation.
                // Do NOT change processingStatus.phase to 'complete' here — this
                // callback fires in a separate microtask (before the streaming
                // cleanup code in chat-interface), so React may render an
                // intermediate frame where the transparency flow dims to 0.6 opacity
                // ("grayed-out" blink). The phase is reset to 'idle' later in
                // addStreamingResponseToHistory, batched with setIsStreaming(false).
                setSystemState(prev => ({
                  ...prev,
                  reasoningBullets: {
                    ...prev.reasoningBullets,
                    isGenerating: false
                  },
                  processingStatus: {
                    ...prev.processingStatus,
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
          // Surface stream errors as inline sendError for retry
          setSystemState(prev => ({
            ...prev,
            sendError: { message: 'Se perdió la conexión. Intenta de nuevo.', retryable: true },
            isLoading: false,
            transitionState: 'idle',
            processingStatus: {
              ...prev.processingStatus,
              phase: 'error',
              isComplete: true
            }
          }))
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
        sendError: { message: 'No se pudo enviar el mensaje. Intenta de nuevo.', retryable: true },
        isLoading: false,
        transitionState: 'idle',
        processingStatus: {
          ...prev.processingStatus,
          phase: 'error',
          isComplete: true
        }
      }))
      // Don't re-throw — the error is captured in sendError for inline retry
      return null
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

  const clearSendError = useCallback(() => {
    setSystemState(prev => ({ ...prev, sendError: null }))
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
      sendError: null,
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
    serverAiMessageId?: string
  ): Promise<void> => {
    // Resolver sessionId objetivo de forma robusta
    let targetSessionId: string | null = systemState.sessionId || lastSessionIdRef.current
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

    // Crear el mensaje AI (usar el ID del servidor si está disponible para coordinación con Firestore)
    const aiMessage: ChatMessage = {
      id: serverAiMessageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
    // Also reset processingStatus to idle — this is batched with setIsStreaming(false) in the
    // caller (chat-interface.tsx), so the streaming bubble unmounts cleanly without showing
    // a "grayed-out" intermediate frame from the 'complete' phase.
    setSystemState(prev => ({
      ...prev,
      history: [...prev.history, aiMessage],
      activeAgent: agent,
      isLoading: false,
      processingStatus: initialProcessingStatus
    }))

    // Limpiar bullets temporales después de asociarlos
    setCurrentMessageBullets([])

    logger.info('✅ Respuesta de streaming agregada al historial')
    logger.info('📊 Historial actualizado con', historyRef.current.length + 1, 'mensajes')

    // 💾 Persist the client-side AI message to Firestore using the server's message ID.
    // This overwrites the server's initial write with richer metadata:
    // - Full executionTimeline (processingSteps + tool steps) from snapshotExecutionTimeline
    // - reasoningBullets from the streaming session
    // The server writes first; the client writes ~100ms later with the same doc ID (idempotent).
    if (serverAiMessageId && psychologistId && targetSessionId) {
      const patientId = resolvePatientId(systemStateRef.current as Partial<ChatState>)
      addMessage(psychologistId, patientId, targetSessionId, aiMessage).catch(err =>
        logger.warn('⚠️ Client-side AI message Firestore write failed (non-blocking):', err)
      )
    }
  }, [systemState.sessionId, currentMessageBullets, psychologistId])

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

  // Save user edits to a clinical document (persists to Firestore)
  const saveDocumentEdit = useCallback(async (documentId: string, newMarkdown: string) => {
    const currentSessionId = systemState.sessionId
    if (!psychologistId || !currentSessionId) {
      logger.error('Cannot save document edit: no session or psychologist')
      return
    }
    const existing = sessionDocuments.find(d => d.id === documentId) || activeDocument
    if (!existing) {
      logger.error('Cannot save document edit: document not found', documentId)
      return
    }

    const newVersion = (existing.version || 1) + 1
    const updated: ClinicalDocument = { ...existing, markdown: newMarkdown, version: newVersion, updatedAt: new Date() }

    // Update local state immediately
    setActiveDocument(updated)
    setSessionDocuments(prev => prev.map(d => d.id === documentId ? updated : d))
    // Update the documentReady event so the panel reflects the edit
    setDocumentReady(prev => prev && prev.documentId === documentId
      ? { ...prev, markdown: newMarkdown }
      : prev
    )

    // Persist to Firestore
    const patientId = resolvePatientId(systemStateRef.current as Partial<ChatState>)
    try {
      await updateClinicalDocumentContent(psychologistId, patientId, currentSessionId, documentId, newMarkdown, newVersion)
      logger.info(`💾 Document edit saved: ${documentId} v${newVersion}`)
    } catch (err) {
      logger.error('❌ Failed to save document edit:', err)
    }
  }, [systemState.sessionId, psychologistId, sessionDocuments, activeDocument])

  return {
    systemState,
    createSession,
    loadSession,
    sendMessage,
    switchAgent,
    getHistory,
    clearError,
    clearSendError,
    resetSystem,
    addStreamingResponseToHistory,
    setSessionMeta,
    clearReasoningBullets,
    addReasoningBullet,
    // Document preview + persistence
    documentPreview,
    documentReady,
    isDocumentPanelOpen,
    closeDocumentPanel,
    openDocumentPanel,
    activeDocument,
    sessionDocuments,
    saveDocumentEdit,
  }
}