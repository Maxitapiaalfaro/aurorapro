"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { HopeAISystemSingleton, HopeAISystem } from "@/lib/hopeai-system"
import type { AgentType, ClinicalMode, ChatMessage, ChatState, ClinicalFile, ReasoningBullet, ReasoningBulletsState, PatientSessionMeta } from "@/types/clinical-types"
import { ClientContextPersistence } from '@/lib/client-context-persistence'
import { getSSEClient } from '@/lib/sse-client'

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
    reasoningBulletsForThisResponse?: ReasoningBullet[]
  ) => Promise<void>
  setSessionMeta: (sessionMeta: any) => void
  
  // Bullets progresivos
  clearReasoningBullets: () => void
  addReasoningBullet: (bullet: ReasoningBullet) => void
}

export function useHopeAISystem(): UseHopeAISystemReturn {
  const [systemState, setSystemState] = useState<HopeAISystemState>({
    sessionId: null,
    userId: 'demo_user',
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
    }
  })

  const hopeAISystem = useRef<HopeAISystem | null>(null)
  const lastSessionIdRef = useRef<string | null>(null)

  // NUEVA FUNCIONALIDAD: Estado temporal para bullets del mensaje actual
  const [currentMessageBullets, setCurrentMessageBullets] = useState<ReasoningBullet[]>([])

  // Cargar sesión existente
  const loadSession = useCallback(async (sessionId: string, allowDuringInit = false): Promise<boolean> => {
    if (!hopeAISystem.current || (!systemState.isInitialized && !allowDuringInit)) {
      console.error('Sistema HopeAI no inicializado')
      return false
    }

    try {
      setSystemState(prev => ({ ...prev, isLoading: true, error: null }))

      // Cargar el estado de la sesión desde el almacenamiento
      const chatState = await hopeAISystem.current.getChatState(sessionId)
      
      if (!chatState) {
        throw new Error(`Sesión no encontrada: ${sessionId}`)
      }

      // Reconstruct sessionMeta if session has patient context
      let reconstructedSessionMeta: PatientSessionMeta | undefined = undefined
      if (chatState.clinicalContext?.patientId) {
        try {
          const { getPatientPersistence } = await import('@/lib/patient-persistence')
          const { PatientContextComposer } = await import('@/lib/patient-summary-builder')
          
          const persistence = getPatientPersistence()
          await persistence.initialize()
          const patient = await persistence.loadPatientRecord(chatState.clinicalContext.patientId)
          
          if (patient) {
            console.log(`🔄 Reconstructing sessionMeta for patient: ${patient.displayName}`)
            const composer = new PatientContextComposer()
            reconstructedSessionMeta = composer.createSessionMetadata(patient, {
              sessionId: chatState.sessionId,
              userId: chatState.userId,
              clinicalMode: chatState.clinicalContext.sessionType || 'clinical_supervision',
              activeAgent: chatState.activeAgent
            })
            console.log(`✅ SessionMeta reconstructed for patient: ${reconstructedSessionMeta.patient.reference}`)
          } else {
            console.warn(`⚠️ Patient not found for ID: ${chatState.clinicalContext.patientId}`)
          }
        } catch (error) {
          console.error('Failed to reconstruct sessionMeta:', error)
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
        sessionMeta: reconstructedSessionMeta
      }))
      lastSessionIdRef.current = chatState.sessionId

      console.log('✅ Sesión HopeAI cargada:', sessionId)
      console.log('📊 Historial cargado con', chatState.history.length, 'mensajes')
      return true
    } catch (error) {
      console.error('❌ Error cargando sesión:', error)
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
      const persistence = ClientContextPersistence.getInstance()
      const recentSession = await persistence.getMostRecentSession()
      
      if (recentSession) {
        console.log('🔄 Intentando restaurar sesión más reciente:', recentSession.sessionId)
        
        // Verificar que la sesión sea válida y no muy antigua (ej: menos de 24 horas)
         const sessionAge = Date.now() - new Date(recentSession.metadata.lastUpdated).getTime()
        const maxAge = 24 * 60 * 60 * 1000 // 24 horas en milisegundos
        
        if (sessionAge < maxAge) {
          const success = await loadSession(recentSession.sessionId, true) // Permitir carga durante inicialización
          if (success) {
            console.log('✅ Sesión más reciente restaurada exitosamente')
            return true // Indicar que se restauró una sesión
          } else {
            console.log('⚠️ No se pudo restaurar la sesión más reciente')
          }
        } else {
          console.log('⚠️ Sesión más reciente demasiado antigua, no se restaurará')
        }
      } else {
        console.log('ℹ️ No hay sesiones recientes para restaurar')
      }
    } catch (error) {
      console.error('❌ Error intentando restaurar sesión:', error)
      // No lanzamos el error para no interrumpir la inicialización
    }
    return false // No se restauró ninguna sesión
  }, [loadSession])

  // Inicialización del sistema HopeAI (sin dependencias para evitar re-inicializaciones)
  useEffect(() => {
    const initializeSystem = async () => {
      try {
        setSystemState(prev => ({ ...prev, isLoading: true }))
        
        // Obtener instancia singleton inicializada del sistema HopeAI
        hopeAISystem.current = await HopeAISystemSingleton.getInitializedInstance()
        console.log('🚀 HopeAI Singleton System inicializado con Intelligent Intent Router')
        
        // Automatic session restoration disabled to prevent unwanted conversation loading
        // when users navigate to the Patients tab. Sessions should only be restored
        // through explicit user actions (e.g., clicking on a conversation or starting a new one)
        console.log('ℹ️ Automatic session restoration disabled - sessions load only on explicit user action')
        
        setSystemState(prev => ({
          ...prev,
          isInitialized: true,
          isLoading: false
        }))
        
      } catch (error) {
        console.error('❌ Error inicializando HopeAI System:', error)
        setSystemState(prev => ({
          ...prev,
          error: 'Error al inicializar el sistema HopeAI',
          isLoading: false,
          isInitialized: true
        }))
      }
    }

    initializeSystem()
  }, []) // Sin dependencias para evitar re-inicializaciones

  // Estado para prevenir creación múltiple simultánea
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // Crear nueva sesión con protección contra llamadas simultáneas
  const createSession = useCallback(async (
    userId: string,
    mode: ClinicalMode,
    agent: AgentType
  ): Promise<string | null> => {
    if (!hopeAISystem.current) {
      console.error('Sistema HopeAI no inicializado')
      return null
    }

    // Prevenir múltiples ejecuciones simultáneas
    if (isCreatingSession) {
      console.log('⚠️ Hook: Creación de sesión ya en progreso, ignorando solicitud duplicada')
      return null
    }

    try {
      setIsCreatingSession(true)
      setSystemState(prev => ({ ...prev, isLoading: true, error: null }))

      const { sessionId, chatState } = await hopeAISystem.current.createClinicalSession(
        userId,
        mode,
        agent
      )

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

      console.log('✅ Sesión HopeAI creada:', sessionId)
      return sessionId
    } catch (error) {
      console.error('❌ Error creando sesión:', error)
      setSystemState(prev => ({
        ...prev,
        error: 'Error al crear la sesión',
        isLoading: false
      }))
      return null
    } finally {
      setIsCreatingSession(false)
    }
  }, [systemState.isInitialized, isCreatingSession])



  // Enviar mensaje con enrutamiento inteligente
  const sendMessage = useCallback(async (
    message: string,
    useStreaming = true,
    attachedFiles?: ClinicalFile[],
    sessionMeta?: any
  ): Promise<any> => {
    if (!hopeAISystem.current) {
      throw new Error('Sistema no inicializado')
    }

    // Lazy-create session on first message send
    let sessionIdToUse = systemState.sessionId
    let sessionMetaToUse = sessionMeta || systemState.sessionMeta
    
    if (!sessionIdToUse) {
      const userId = systemState.userId || 'demo_user'
      const mode = systemState.mode || 'clinical_supervision'
      const agent = systemState.activeAgent || 'socratico'
      
      console.log('🔄 Creando sesión lazy con contexto:', {
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
          sessionMeta: updatedSessionMeta
        }))
        console.log('✅ SessionMeta actualizado con sessionId:', newSessionId)
        console.log('🏥 Contexto del paciente:', updatedSessionMeta.patient?.reference)
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
      const localUserMessageId = userMessage.id

      // NUEVA FUNCIONALIDAD: Limpiar bullets temporales del mensaje anterior
      setCurrentMessageBullets([])
      
      // Actualizar el historial inmediatamente con el mensaje del usuario
      setSystemState(prev => {
        return {
          ...prev,
          history: [...prev.history, userMessage],
          isLoading: true,
          error: null,
          transitionState: 'thinking',
          reasoningBullets: {
            ...prev.reasoningBullets,
            sessionId: sessionIdToUse!,
            bullets: [], // Limpiar bullets globales para el nuevo mensaje
            isGenerating: true,
            currentStep: 0
          }
        }
      })

      // 💾 Persistencia inmediata en IndexedDB para no perder el mensaje del usuario en un reload
      try {
        const existingState = await hopeAISystem.current.getChatState(sessionIdToUse!)
        const updatedState: ChatState = {
          ...(existingState || {
            sessionId: sessionIdToUse!,
            userId: systemState.userId || 'demo_user',
            mode: systemState.mode || 'clinical_supervision',
            activeAgent: systemState.activeAgent,
            history: [],
            metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: [] },
            clinicalContext: {
              sessionType: systemState.mode || 'clinical_supervision',
              confidentialityLevel: systemState.sessionMeta?.patient?.confidentialityLevel || 'high',
              patientId: systemState.sessionMeta?.patient?.reference
            }
          }),
          history: [...((existingState?.history) || []), userMessage],
          metadata: {
            ...((existingState?.metadata) || { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: [] }),
            lastUpdated: new Date(),
            fileReferences: Array.from(new Set([...(existingState?.metadata?.fileReferences || []), ...(userMessage.fileReferences || [])]))
          }
        }
        await hopeAISystem.current.storageAdapter.saveChatSession(updatedState)
        console.log('💾 [IndexedDB] Mensaje de usuario persistido inmediatamente:', { sessionId: sessionIdToUse, messageId: localUserMessageId })
      } catch (persistError) {
        console.error('❌ [IndexedDB] Error al persistir el mensaje del usuario:', persistError)
      }

      console.log('📤 Enviando mensaje vía SSE con enrutamiento inteligente:', message.substring(0, 50) + '...')

      // Callback para manejar bullets progresivos
      const handleBulletUpdate = (bullet: ReasoningBullet) => {
        console.log('🎯 Bullet recibido:', bullet.content)
        addReasoningBullet(bullet)
      }

      // 🎯 CALLBACK: Cuando se selecciona el agente INMEDIATAMENTE
      const handleAgentSelected = (routingInfo: { targetAgent: string; confidence: number; reasoning: string }) => {
        console.log('🎯 Agente seleccionado INMEDIATAMENTE:', routingInfo.targetAgent)
        setSystemState(prev => {
          // 🔥 ACTUALIZAR el mensaje del usuario con el agente REAL
          const updatedHistory = [...prev.history]
          const lastMessage = updatedHistory[updatedHistory.length - 1]
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.agent = routingInfo.targetAgent as AgentType
            console.log('🔄 Mensaje del usuario actualizado con agente real:', routingInfo.targetAgent)
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
            transitionState: 'specialist_responding'
          }
        })

        // 💾 Persistir actualización del agente para el último mensaje de usuario en IndexedDB
        void (async () => {
          try {
            const existingState = await hopeAISystem.current!.getChatState(sessionIdToUse!)
            if (existingState) {
              const updatedHistory = existingState.history.map(m =>
                m.id === localUserMessageId ? { ...m, agent: routingInfo.targetAgent as AgentType } : m
              )
              const updatedState: ChatState = {
                ...existingState,
                activeAgent: routingInfo.targetAgent as AgentType,
                history: updatedHistory,
                metadata: { ...existingState.metadata, lastUpdated: new Date() }
              }
              await hopeAISystem.current!.storageAdapter.saveChatSession(updatedState)
              console.log('💾 [IndexedDB] Agente del mensaje de usuario actualizado en persistencia')
            }
          } catch (e) {
            console.warn('⚠️ [IndexedDB] No se pudo actualizar el agente en persistencia:', e)
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
              userId: systemState.userId || 'demo_user',
              suggestedAgent: undefined,
              sessionMeta: sessionMetaToUse
            },
            {
              onBullet: handleBulletUpdate,
              onAgentSelected: handleAgentSelected,
              onChunk: (chunk) => {
                // Este callback se ejecuta pero no necesitamos hacer nada aquí
                // porque el generator ya está yieldando los chunks
                console.log('📝 Chunk procesado en callback')
              },
              onResponse: (responseData) => {
                console.log('✅ Respuesta final recibida vía SSE')

                // 🎯 ACTUALIZAR ROUTING INFO si está disponible
                if (responseData.response?.routingInfo) {
                  finalRoutingInfo = responseData.response.routingInfo
                  setSystemState(prev => ({
                    ...prev,
                    routingInfo: responseData.response.routingInfo,
                    transitionState: 'specialist_responding'
                  }))
                  console.log('🎯 Agente seleccionado:', responseData.response.routingInfo.targetAgent)
                }

                // 🛠️ FIX: Finalizar indicador de generación de bullets si el backend
                // no envía bullets progresivos (o ya terminó la generación)
                setSystemState(prev => ({
                  ...prev,
                  reasoningBullets: {
                    ...prev.reasoningBullets,
                    isGenerating: false
                  }
                }))
              },
              onError: (error, details) => {
                console.error('❌ Error SSE:', error, details)
                throw new Error(error)
              },
              onComplete: () => {
                console.log('✅ Stream SSE completado')
                // 🛠️ FIX: Asegurar que isGenerating quede en false al cerrar el stream
                setSystemState(prev => ({
                  ...prev,
                  reasoningBullets: {
                    ...prev.reasoningBullets,
                    isGenerating: false
                  }
                }))
              }
            }
          )) {
            // ✅ YIELDAR CADA CHUNK INMEDIATAMENTE para que la UI se actualice
            console.log('🚀 [Hook] Yielding chunk:', chunk.text?.substring(0, 50))
            yield chunk
          }
        } catch (error) {
          console.error('❌ Error en stream generator:', error)
          throw error
        }
      })()

      // Agregar routingInfo como propiedad del generator (para compatibilidad con chat-interface.tsx)
      // Esto se actualizará cuando llegue el evento 'response'
      Object.defineProperty(streamGenerator, 'routingInfo', {
        get: () => finalRoutingInfo,
        enumerable: true
      })

      console.log('✅ Retornando AsyncGenerator para streaming en tiempo real')

      // Retornar el generator directamente - chat-interface.tsx lo consumirá
      return streamGenerator
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error)
      setSystemState(prev => ({
        ...prev,
        error: 'Error al enviar el mensaje',
        isLoading: false,
        transitionState: 'idle'
      }))
      throw error
    }
  }, [systemState.sessionId, systemState.activeAgent])

  // Cambiar agente manualmente (aunque el sistema puede hacerlo automáticamente)
  const switchAgent = useCallback(async (newAgent: AgentType): Promise<boolean> => {
    if (!systemState.sessionId) {
      console.error('No hay sesión activa para cambiar agente')
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

      console.log('✅ Agente cambiado a:', newAgent)
      return true
    } catch (error) {
      console.error('❌ Error cambiando agente:', error)
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
      userId: 'demo_user',
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
      }
    })
    lastSessionIdRef.current = null
  }, [systemState.isInitialized])

  // Agregar respuesta de streaming al historial
  const addStreamingResponseToHistory = useCallback(async (
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBulletsForThisResponse?: ReasoningBullet[],
    sessionIdOverride?: string
  ): Promise<void> => {
    if (!hopeAISystem.current) {
      throw new Error('Sistema no inicializado')
    }

    // Resolver sessionId objetivo de forma robusta
    let targetSessionId: string | null = sessionIdOverride || systemState.sessionId || lastSessionIdRef.current
    if (!targetSessionId) {
      try {
        const persistence = ClientContextPersistence.getInstance()
        const recent = await persistence.getMostRecentSession()
        targetSessionId = recent?.sessionId || null
      } catch (e) {
        // ignore
      }
    }

    if (!targetSessionId) {
      console.warn('⚠️ addStreamingResponseToHistory: Sin sessionId, se omite la escritura del historial')
      return
    }

    try {
      await hopeAISystem.current.addStreamingResponseToHistory(
        targetSessionId,
        responseContent,
        agent,
        groundingUrls,
        reasoningBulletsForThisResponse && reasoningBulletsForThisResponse.length > 0
          ? reasoningBulletsForThisResponse
          : currentMessageBullets
      )

      // 🔧 FIX: NO cargar desde DB (cliente y servidor tienen DBs separadas)
      // En su lugar, agregar el mensaje del modelo al historial local existente

      const aiMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: responseContent,
        role: "model",
        agent: agent,
        timestamp: new Date(),
        groundingUrls: groundingUrls || [],
        reasoningBullets: undefined // Los bullets se agregan después si existen
      }

      // Asociar bullets si existen
      const bulletsToAttach = (reasoningBulletsForThisResponse && reasoningBulletsForThisResponse.length > 0)
        ? reasoningBulletsForThisResponse
        : currentMessageBullets

      if (bulletsToAttach.length > 0) {
        aiMessage.reasoningBullets = [...bulletsToAttach]
        console.log('🎯 Bullets asociados al mensaje:', bulletsToAttach.length)
      }

      console.log('🔄 [addStreamingResponseToHistory] Agregando mensaje del modelo al historial local:', {
        currentHistoryLength: systemState.history.length,
        aiMessageId: aiMessage.id,
        aiMessageContent: aiMessage.content.substring(0, 50)
      })

      setSystemState(prev => ({
        ...prev,
        history: [...prev.history, aiMessage],
        activeAgent: agent,
        isLoading: false
      }))

      // Limpiar bullets temporales después de asociarlos
      setCurrentMessageBullets([])

      console.log('✅ Respuesta de streaming agregada al historial')
      console.log('📊 Historial actualizado con', systemState.history.length + 1, 'mensajes')
    } catch (error) {
      console.error('❌ Error agregando respuesta al historial:', error)
      throw error
    }
  }, [systemState.sessionId, currentMessageBullets])

  // Establecer contexto del paciente
  const setSessionMeta = useCallback((sessionMeta: any) => {
    console.log('🏥 Estableciendo contexto del paciente:', sessionMeta?.patient?.reference || 'None')
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