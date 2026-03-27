"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useOptimizedContext } from "./use-optimized-context"
import { ClientContextPersistence } from "@/lib/client-context-persistence"
import type { AgentType, ClinicalMode, ChatMessage } from "@/types/clinical-types"

// Interfaz para el estado de la sesión optimizada
interface OptimizedSessionState {
  sessionId: string | null
  userId: string
  mode: ClinicalMode
  activeAgent: AgentType
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  performanceMetrics: {
    sessionAge: number // en minutos
    totalInteractions: number
    averageResponseTime: number
    tokenEfficiency: number
    modalityUsage: Record<string, number>
    compressionRatio: number
  }
}

interface UseHopeAIOptimizedReturn {
  // Estado de la sesión
  sessionState: OptimizedSessionState
  
  // Gestión de sesiones
  createOptimizedSession: (userId: string, mode: ClinicalMode, agent: AgentType) => Promise<string | null>
  loadOptimizedSession: (sessionId: string) => Promise<boolean>
  
  // Comunicación optimizada
  sendMessage: (message: string, useStreaming?: boolean) => Promise<any>
  switchAgent: (newAgent: AgentType) => Promise<boolean>
  
  // Acceso al contexto
  getCuratedHistory: () => ChatMessage[]
  getComprehensiveHistory: () => ChatMessage[]
  getPerformanceReport: () => any
  
  // Control de estado
  clearError: () => void
  resetSession: () => void
}

export function useHopeAIOptimized(): UseHopeAIOptimizedReturn {
  const {
    contextState,
    createOptimizedChat,
    sendOptimizedMessage,
    transferContextToAgent,
    getCuratedHistory: getContextCuratedHistory,
    getComprehensiveHistory: getContextComprehensiveHistory,
    getUsageMetadata,
    resetContext
  } = useOptimizedContext()

  const [sessionState, setSessionState] = useState<OptimizedSessionState>({
    sessionId: null,
    userId: 'current_user',
    mode: 'therapeutic_assistance',
    activeAgent: 'socratico',
    isLoading: false,
    error: null,
    isInitialized: false,
    performanceMetrics: {
      sessionAge: 0,
      totalInteractions: 0,
      averageResponseTime: 0,
      tokenEfficiency: 0,
      modalityUsage: { text: 0, audio: 0, video: 0 },
      compressionRatio: 1.0
    }
  })

  const contextPersistence = useRef(ClientContextPersistence.getInstance())
  const sessionStartTime = useRef<Date | null>(null)

  // Inicialización del sistema optimizado
  useEffect(() => {
    const initializeOptimizedSystem = async () => {
      try {
        setSessionState(prev => ({ ...prev, isLoading: true }))

        // Intentar restaurar la sesión más reciente
        const mostRecentSession = await contextPersistence.current.getMostRecentSession()
        
        if (mostRecentSession) {
          console.log('🔄 Restaurando sesión más reciente:', mostRecentSession.sessionId)
          
          // Recrear el chat optimizado con el historial existente
          await createOptimizedChat(
            mostRecentSession.activeAgent,
            mostRecentSession.comprehensiveHistory
          )

          // Actualizar estado de la sesión
          setSessionState(prev => ({
            ...prev,
            sessionId: mostRecentSession.sessionId,
            activeAgent: mostRecentSession.activeAgent,
            isInitialized: true,
            isLoading: false,
            performanceMetrics: {
              ...prev.performanceMetrics,
              totalInteractions: mostRecentSession.metadata.usageMetadata.totalMessages,
              averageResponseTime: mostRecentSession.metadata.usageMetadata.averageResponseTime,
              compressionRatio: mostRecentSession.metadata.usageMetadata.compressionRatio,
              modalityUsage: mostRecentSession.metadata.usageMetadata.modalityUsage
            }
          }))

          sessionStartTime.current = new Date(mostRecentSession.metadata.createdAt)
          
          console.log('✅ Sesión restaurada exitosamente')
        } else {
          console.log('ℹ️ No hay sesiones previas, sistema listo para nueva sesión')
          setSessionState(prev => ({ ...prev, isInitialized: true, isLoading: false }))
        }

        // Limpiar sesiones antiguas en segundo plano
        contextPersistence.current.cleanupOldSessions().catch(console.warn)
        
      } catch (error) {
        console.error('Error inicializando sistema optimizado:', error)
        setSessionState(prev => ({
          ...prev,
          error: 'Error al inicializar el sistema optimizado',
          isLoading: false,
          isInitialized: true
        }))
      }
    }

    initializeOptimizedSystem()
  }, [])

  // Crear nueva sesión optimizada
  const createOptimizedSession = useCallback(async (
    userId: string,
    mode: ClinicalMode,
    agent: AgentType
  ): Promise<string | null> => {
    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // Crear chat optimizado con SDK nativo
      await createOptimizedChat(agent, [])
      
      // Actualizar estado de la sesión
      setSessionState(prev => ({
        ...prev,
        sessionId,
        userId,
        mode,
        activeAgent: agent,
        isLoading: false,
        performanceMetrics: {
          sessionAge: 0,
          totalInteractions: 0,
          averageResponseTime: 0,
          tokenEfficiency: 0,
          modalityUsage: { text: 0, audio: 0, video: 0 },
          compressionRatio: 1.0
        }
      }))

      sessionStartTime.current = new Date()

      // Guardar contexto inicial
      await contextPersistence.current.saveOptimizedContext(
        sessionId,
        agent,
        [],
        {
          usageMetadata: {
            totalMessages: 0,
            averageResponseTime: 0,
            compressionRatio: 1.0,
            modalityUsage: { text: 0, audio: 0, video: 0 }
          },
          modalityDetails: {
            textTokens: 0,
            audioTokens: 0,
            videoTokens: 0
          }
        }
      )

      console.log('✅ Sesión optimizada creada:', sessionId)
      return sessionId
    } catch (error) {
      console.error('Error creando sesión optimizada:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al crear la sesión optimizada',
        isLoading: false
      }))
      return null
    }
  }, [createOptimizedChat])

  // Cargar sesión optimizada existente
  const loadOptimizedSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const savedContext = await contextPersistence.current.loadOptimizedContext(sessionId)
      
      if (!savedContext) {
        throw new Error('Sesión no encontrada')
      }

      // Recrear chat optimizado con historial
      await createOptimizedChat(
        savedContext.activeAgent,
        savedContext.comprehensiveHistory
      )

      // Actualizar estado
      setSessionState(prev => ({
        ...prev,
        sessionId: savedContext.sessionId,
        activeAgent: savedContext.activeAgent,
        isLoading: false,
        performanceMetrics: {
          ...prev.performanceMetrics,
          totalInteractions: savedContext.metadata.usageMetadata.totalMessages,
          averageResponseTime: savedContext.metadata.usageMetadata.averageResponseTime,
          compressionRatio: savedContext.metadata.usageMetadata.compressionRatio,
          modalityUsage: savedContext.metadata.usageMetadata.modalityUsage
        }
      }))

      sessionStartTime.current = new Date(savedContext.metadata.createdAt)
      
      console.log('✅ Sesión cargada exitosamente:', sessionId)
      return true
    } catch (error) {
      console.error('Error cargando sesión:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al cargar la sesión',
        isLoading: false
      }))
      return false
    }
  }, [createOptimizedChat])

  // Enviar mensaje optimizado con métricas avanzadas
  const sendMessage = useCallback(async (
    message: string,
    useStreaming = true
  ): Promise<any> => {
    if (!sessionState.sessionId) {
      throw new Error('No hay sesión activa')
    }

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const startTime = Date.now()
      
      // Enviar mensaje a través del contexto optimizado
      const { response, usageMetadata } = await sendOptimizedMessage(message, useStreaming)
      
      const endTime = Date.now()
      const responseTime = endTime - startTime

      // Actualizar métricas de rendimiento
      const updatedMetrics = {
        sessionAge: sessionStartTime.current ? 
          Math.floor((Date.now() - sessionStartTime.current.getTime()) / 60000) : 0,
        totalInteractions: sessionState.performanceMetrics.totalInteractions + 1,
        averageResponseTime: (
          (sessionState.performanceMetrics.averageResponseTime * sessionState.performanceMetrics.totalInteractions + responseTime) /
          (sessionState.performanceMetrics.totalInteractions + 1)
        ),
        tokenEfficiency: usageMetadata.totalTokens > 0 ? 
          (usageMetadata.responseTokens / usageMetadata.totalTokens) : 0,
        modalityUsage: {
          ...sessionState.performanceMetrics.modalityUsage,
          text: sessionState.performanceMetrics.modalityUsage.text + 1
        },
        compressionRatio: getUsageMetadata().compressionRatio
      }

      setSessionState(prev => ({
        ...prev,
        isLoading: false,
        performanceMetrics: updatedMetrics
      }))

      // Guardar contexto optimizado con métricas extendidas
      await contextPersistence.current.saveOptimizedContext(
        sessionState.sessionId,
        sessionState.activeAgent,
        getContextCuratedHistory(),
        {
          usageMetadata: {
            totalMessages: updatedMetrics.totalInteractions,
            averageResponseTime: updatedMetrics.averageResponseTime,
            compressionRatio: updatedMetrics.compressionRatio,
            modalityUsage: updatedMetrics.modalityUsage
          },
          modalityDetails: contextState.modalityDetails
        }
      )

      console.log('✅ Mensaje enviado y contexto guardado', {
        responseTime,
        tokenEfficiency: updatedMetrics.tokenEfficiency,
        compressionRatio: updatedMetrics.compressionRatio
      })

      return response
    } catch (error) {
      console.error('Error enviando mensaje:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al enviar el mensaje',
        isLoading: false
      }))
      throw error
    }
  }, [sessionState, sendOptimizedMessage, getContextCuratedHistory, getUsageMetadata, contextState.modalityDetails])

  // Cambiar agente con transferencia optimizada de contexto
  const switchAgent = useCallback(async (newAgent: AgentType): Promise<boolean> => {
    if (!sessionState.sessionId) {
      throw new Error('No hay sesión activa')
    }

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      // Transferir contexto al nuevo agente
      await transferContextToAgent(newAgent)

      // Actualizar métricas de rendimiento
      const updatedMetrics = {
        ...sessionState.performanceMetrics,
        compressionRatio: getUsageMetadata().compressionRatio,
        averageResponseTime: getUsageMetadata().averageResponseTime
      }

      setSessionState(prev => ({
        ...prev,
        activeAgent: newAgent,
        isLoading: false,
        performanceMetrics: updatedMetrics
      }))

      // Guardar contexto optimizado con metadatos actualizados
      await contextPersistence.current.saveOptimizedContext(
        sessionState.sessionId,
        newAgent,
        getContextCuratedHistory(),
        {
          usageMetadata: {
            totalMessages: updatedMetrics.totalInteractions,
            averageResponseTime: updatedMetrics.averageResponseTime,
            compressionRatio: updatedMetrics.compressionRatio,
            modalityUsage: updatedMetrics.modalityUsage
          },
          modalityDetails: contextState.modalityDetails
        }
      )

      console.log('✅ Agente cambiado exitosamente:', newAgent)
      return true
    } catch (error) {
      console.error('Error cambiando agente:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al cambiar el agente',
        isLoading: false
      }))
      return false
    }
  }, [sessionState, transferContextToAgent, getContextCuratedHistory, getUsageMetadata, contextState.modalityDetails])

  // Obtener reporte de rendimiento completo
  const getPerformanceReport = useCallback(() => {
    return {
      session: {
        id: sessionState.sessionId,
        age: sessionState.performanceMetrics.sessionAge,
        activeAgent: sessionState.activeAgent
      },
      interactions: {
        total: sessionState.performanceMetrics.totalInteractions,
        averageResponseTime: sessionState.performanceMetrics.averageResponseTime,
        tokenEfficiency: sessionState.performanceMetrics.tokenEfficiency
      },
      context: {
        tokenCount: contextState.tokenCount,
        contextWindowUtilization: (
          contextState.contextWindow.utilized / contextState.contextWindow.available
        ) * 100,
        compressionRatio: sessionState.performanceMetrics.compressionRatio,
        compressionActive: contextState.contextWindow.compressionActive
      },
      modality: {
        usage: sessionState.performanceMetrics.modalityUsage,
        details: contextState.modalityDetails
      },
      history: {
        curatedMessages: contextState.curatedHistory.length,
        comprehensiveMessages: contextState.comprehensiveHistory.length
      }
    }
  }, [sessionState, contextState])

  // Utilidades de acceso
  const getCuratedHistory = useCallback(() => getContextCuratedHistory(), [getContextCuratedHistory])
  const getComprehensiveHistory = useCallback(() => getContextComprehensiveHistory(), [getContextComprehensiveHistory])
  
  const clearError = useCallback(() => {
    setSessionState(prev => ({ ...prev, error: null }))
  }, [])

  const resetSession = useCallback(() => {
    resetContext()
    setSessionState({
      sessionId: null,
      userId: 'current_user',
      mode: 'therapeutic_assistance',
      activeAgent: 'socratico',
      isLoading: false,
      error: null,
      isInitialized: true,
      performanceMetrics: {
        sessionAge: 0,
        totalInteractions: 0,
        averageResponseTime: 0,
        tokenEfficiency: 0,
        modalityUsage: { text: 0, audio: 0, video: 0 },
        compressionRatio: 1.0
      }
    })
    sessionStartTime.current = null
  }, [resetContext])

  return {
    sessionState,
    createOptimizedSession,
    loadOptimizedSession,
    sendMessage,
    switchAgent,
    getCuratedHistory,
    getComprehensiveHistory,
    getPerformanceReport,
    clearError,
    resetSession
  }
}