"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/providers/auth-provider"
import { useOptimizedContext } from "./use-optimized-context"
import {
  listUserSessions,
  findSessionById,
  saveSessionMetadata,
  loadSessionWithMessages,
  resolvePatientId,
} from "@/lib/firestore-client-storage"
import type { AgentType, ClinicalMode, ChatMessage, ChatState } from "@/types/clinical-types"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// Interfaz para el estado de la sesion optimizada
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
  // Estado de la sesion
  sessionState: OptimizedSessionState

  // Gestion de sesiones
  createOptimizedSession: (userId: string, mode: ClinicalMode, agent: AgentType) => Promise<string | null>
  loadOptimizedSession: (sessionId: string) => Promise<boolean>

  // Comunicacion optimizada
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
  const { psychologistId } = useAuth()
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

  // Track the current patientId for the active session
  const currentPatientId = useRef<string>('default_patient')
  const sessionStartTime = useRef<Date | null>(null)

  // Inicializacion del sistema optimizado
  useEffect(() => {
    if (!psychologistId) return

    const initializeOptimizedSystem = async () => {
      try {
        setSessionState(prev => ({ ...prev, isLoading: true }))

        // Intentar restaurar la sesion mas reciente via Firestore
        const result = await listUserSessions(psychologistId, {
          pageSize: 1,
          sortBy: 'lastUpdated',
          sortOrder: 'desc'
        })

        if (result.items.length > 0) {
          const mostRecentSummary = result.items[0]
          logger.info('Restaurando sesion mas reciente:', mostRecentSummary.sessionId)

          // Load full session with messages
          const fullSession = await loadSessionWithMessages(
            psychologistId,
            mostRecentSummary.patientId,
            mostRecentSummary.sessionId
          )

          if (fullSession) {
            currentPatientId.current = mostRecentSummary.patientId

            // Recrear el chat optimizado con el historial existente
            await createOptimizedChat(
              fullSession.activeAgent,
              fullSession.history || []
            )

            // Actualizar estado de la sesion
            setSessionState(prev => ({
              ...prev,
              sessionId: fullSession.sessionId,
              activeAgent: fullSession.activeAgent,
              isInitialized: true,
              isLoading: false,
              performanceMetrics: {
                ...prev.performanceMetrics,
                totalInteractions: fullSession.history?.length || 0,
              }
            }))

            sessionStartTime.current = fullSession.metadata?.createdAt
              ? new Date(fullSession.metadata.createdAt)
              : new Date()

            logger.info('Sesion restaurada exitosamente')
          } else {
            logger.info('No hay sesiones previas, sistema listo para nueva sesion')
            setSessionState(prev => ({ ...prev, isInitialized: true, isLoading: false }))
          }
        } else {
          logger.info('No hay sesiones previas, sistema listo para nueva sesion')
          setSessionState(prev => ({ ...prev, isInitialized: true, isLoading: false }))
        }

        // No cleanup needed — Firestore manages its own data lifecycle

      } catch (error) {
        logger.error('Error inicializando sistema optimizado:', error)
        setSessionState(prev => ({
          ...prev,
          error: 'Error al inicializar el sistema optimizado',
          isLoading: false,
          isInitialized: true
        }))
      }
    }

    initializeOptimizedSystem()
  }, [psychologistId])

  // Crear nueva sesion optimizada
  const createOptimizedSession = useCallback(async (
    userId: string,
    mode: ClinicalMode,
    agent: AgentType
  ): Promise<string | null> => {
    if (!psychologistId) return null

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // Crear chat optimizado con SDK nativo
      await createOptimizedChat(agent, [])

      // Actualizar estado de la sesion
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
      currentPatientId.current = 'default_patient'

      // Guardar contexto inicial en Firestore
      const initialSession = {
        sessionId,
        userId,
        mode,
        activeAgent: agent,
        history: [],
        metadata: {
          createdAt: new Date(),
          lastUpdated: new Date(),
        },
        clinicalContext: {
          patientId: currentPatientId.current,
        },
      } as unknown as ChatState

      await saveSessionMetadata(psychologistId, currentPatientId.current, initialSession)

      logger.info('Sesion optimizada creada:', sessionId)
      return sessionId
    } catch (error) {
      logger.error('Error creando sesion optimizada:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al crear la sesion optimizada',
        isLoading: false
      }))
      return null
    }
  }, [psychologistId, createOptimizedChat])

  // Cargar sesion optimizada existente
  const loadOptimizedSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!psychologistId) return false

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const result = await findSessionById(psychologistId, sessionId)

      if (!result) {
        throw new Error('Sesion no encontrada')
      }

      const { session: savedSession, patientId } = result
      currentPatientId.current = patientId

      // Recrear chat optimizado con historial
      await createOptimizedChat(
        savedSession.activeAgent,
        savedSession.history || []
      )

      // Actualizar estado
      setSessionState(prev => ({
        ...prev,
        sessionId: savedSession.sessionId,
        activeAgent: savedSession.activeAgent,
        isLoading: false,
        performanceMetrics: {
          ...prev.performanceMetrics,
          totalInteractions: savedSession.history?.length || 0,
        }
      }))

      sessionStartTime.current = savedSession.metadata?.createdAt
        ? new Date(savedSession.metadata.createdAt)
        : new Date()

      logger.info('Sesion cargada exitosamente:', sessionId)
      return true
    } catch (error) {
      logger.error('Error cargando sesion:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al cargar la sesion',
        isLoading: false
      }))
      return false
    }
  }, [psychologistId, createOptimizedChat])

  // Enviar mensaje optimizado con metricas avanzadas
  const sendMessage = useCallback(async (
    message: string,
    useStreaming = true
  ): Promise<any> => {
    if (!sessionState.sessionId) {
      throw new Error('No hay sesion activa')
    }
    if (!psychologistId) {
      throw new Error('Not authenticated')
    }

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      const startTime = Date.now()

      // Enviar mensaje a traves del contexto optimizado
      const { response, usageMetadata } = await sendOptimizedMessage(message, useStreaming)

      const endTime = Date.now()
      const responseTime = endTime - startTime

      // Actualizar metricas de rendimiento
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

      // Save session metadata to Firestore
      const sessionData: ChatState = {
        sessionId: sessionState.sessionId,
        userId: sessionState.userId,
        mode: sessionState.mode,
        activeAgent: sessionState.activeAgent,
        history: getContextCuratedHistory(),
        metadata: {
          createdAt: sessionStartTime.current || new Date(),
          lastUpdated: new Date(),
        },
        clinicalContext: {
          patientId: currentPatientId.current,
        },
      } as unknown as ChatState

      await saveSessionMetadata(psychologistId, currentPatientId.current, sessionData)

      logger.info('Mensaje enviado y contexto guardado', {
        responseTime,
        tokenEfficiency: updatedMetrics.tokenEfficiency,
        compressionRatio: updatedMetrics.compressionRatio
      })

      return response
    } catch (error) {
      logger.error('Error enviando mensaje:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al enviar el mensaje',
        isLoading: false
      }))
      throw error
    }
  }, [psychologistId, sessionState, sendOptimizedMessage, getContextCuratedHistory, getUsageMetadata, contextState.modalityDetails])

  // Cambiar agente con transferencia optimizada de contexto
  const switchAgent = useCallback(async (newAgent: AgentType): Promise<boolean> => {
    if (!sessionState.sessionId) {
      throw new Error('No hay sesion activa')
    }
    if (!psychologistId) {
      throw new Error('Not authenticated')
    }

    try {
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }))

      // Transferir contexto al nuevo agente
      await transferContextToAgent(newAgent)

      // Actualizar metricas de rendimiento
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

      // Save updated session metadata to Firestore
      const sessionData: ChatState = {
        sessionId: sessionState.sessionId,
        userId: sessionState.userId,
        mode: sessionState.mode,
        activeAgent: newAgent,
        history: getContextCuratedHistory(),
        metadata: {
          createdAt: sessionStartTime.current || new Date(),
          lastUpdated: new Date(),
        },
        clinicalContext: {
          patientId: currentPatientId.current,
        },
      } as unknown as ChatState

      await saveSessionMetadata(psychologistId, currentPatientId.current, sessionData)

      logger.info('Agente cambiado exitosamente:', newAgent)
      return true
    } catch (error) {
      logger.error('Error cambiando agente:', error)
      setSessionState(prev => ({
        ...prev,
        error: 'Error al cambiar el agente',
        isLoading: false
      }))
      return false
    }
  }, [psychologistId, sessionState, transferContextToAgent, getContextCuratedHistory, getUsageMetadata, contextState.modalityDetails])

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
    currentPatientId.current = 'default_patient'
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
