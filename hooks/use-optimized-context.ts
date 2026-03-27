"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { ai } from "@/lib/google-genai-config"
import { clinicalAgentRouter } from "@/lib/clinical-agent-router"
import type { ChatMessage, AgentType } from "@/types/clinical-types"

// Tipos específicos para el contexto optimizado
interface OptimizedContextState {
  nativeChat: any | null
  currentAgent: AgentType
  curatedHistory: ChatMessage[]
  comprehensiveHistory: ChatMessage[]
  tokenCount: number
  usageMetadata: {
    totalMessages: number
    averageResponseTime: number
    compressionRatio: number
    modalityUsage: Record<string, number>
  }
  modalityDetails: {
    textTokens: number
    audioTokens: number
    videoTokens: number
  }
  contextWindow: {
    utilized: number
    available: number
    compressionActive: boolean
  }
}

interface UseOptimizedContextReturn {
  // Estado del contexto
  contextState: OptimizedContextState
  
  // Funciones de gestión
  createOptimizedChat: (agent: AgentType, history?: ChatMessage[]) => Promise<any>
  optimizeHistoryForAgent: (targetAgent: AgentType) => Promise<ChatMessage[]>
  sendOptimizedMessage: (message: string, useStreaming?: boolean) => Promise<{
    response: any
    usageMetadata: any
  }>
  transferContextToAgent: (newAgent: AgentType) => Promise<any>
  
  // Utilidades de contexto
  getCuratedHistory: () => ChatMessage[]
  getComprehensiveHistory: () => ChatMessage[]
  getTokenCount: () => Promise<number>
  getUsageMetadata: () => any
  getModalityDetails: () => any
  isContextOptimized: () => boolean
  
  // Control de estado
  resetContext: () => void
}

const COMPRESSION_THRESHOLD = 50000 // caracteres
const MAX_CONTEXT_WINDOW = 1000000 // tokens aproximados

export function useOptimizedContext(): UseOptimizedContextReturn {
  // Estado inicial del contexto optimizado
  const [contextState, setContextState] = useState<OptimizedContextState>({
    nativeChat: null,
    currentAgent: 'socratico',
    curatedHistory: [],
    comprehensiveHistory: [],
    tokenCount: 0,
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
    },
    contextWindow: {
      utilized: 0,
      available: MAX_CONTEXT_WINDOW,
      compressionActive: false
    }
  })

  const responseTimeRef = useRef<number>(0)

  // Función para contar tokens de forma proactiva
  const countTokens = useCallback(async (content: string): Promise<number> => {
    try {
      // Estimación básica: ~4 caracteres por token para español
      // En una implementación real, usaríamos el método countTokens del SDK
      return Math.ceil(content.length / 4)
    } catch (error) {
      console.warn('Error counting tokens, using estimation:', error)
      return Math.ceil(content.length / 4)
    }
  }, [])

  // Crear chat optimizado con configuraciones específicas de agente del ClinicalAgentRouter
  const createOptimizedChat = useCallback(async (
    agent: AgentType,
    history: ChatMessage[] = []
  ): Promise<any> => {
    try {
      // Obtener configuración específica del agente desde ClinicalAgentRouter
      const agentConfig = clinicalAgentRouter.getAgentConfig(agent)
      if (!agentConfig) {
        throw new Error(`Configuración no encontrada para agente: ${agent}`)
      }

      // Convertir historial al formato Gemini usando la función optimizada del router clínico
      // que maneja archivos eficientemente (solo procesa archivos del último mensaje)
      const geminiHistory = history.length > 0 
        ? await clinicalAgentRouter.convertHistoryToGeminiFormat('optimized_context_session', history, agent)
        : []

      // Configuración optimizada con configuraciones específicas del agente
      const chatConfig = {
        model: agentConfig.config.model || 'gemini-2.5-flash',
        config: {
          temperature: agentConfig.config.temperature,
          topK: agentConfig.config.topK,
          topP: agentConfig.config.topP,
          maxOutputTokens: agentConfig.config.maxOutputTokens,
          safetySettings: agentConfig.config.safetySettings,
          // Configuración de compresión de ventana de contexto optimizada
          contextWindowCompression: {
            slidingWindow: true,
            triggerTokens: Math.floor(MAX_CONTEXT_WINDOW * 0.8) // 80% del límite
          }
        },
        systemInstruction: agentConfig.systemInstruction,
        tools: agentConfig.tools && agentConfig.tools.length > 0 ? [{ functionDeclarations: agentConfig.tools }] : undefined,
        history: geminiHistory
      }

      const chat = ai.chats.create(chatConfig)
      
      // Actualizar estado con el nuevo chat
      setContextState(prev => ({
        ...prev,
        nativeChat: chat,
        currentAgent: agent,
        curatedHistory: history.slice(-10), // Mantener últimos 10 mensajes
        comprehensiveHistory: history,
        contextWindow: {
          ...prev.contextWindow,
          compressionActive: history.length > 20
        }
      }))

      console.log('✅ Chat optimizado creado con configuraciones específicas del agente:', { agent, systemInstruction: agentConfig.systemInstruction.substring(0, 50) + '...' })
      return chat
    } catch (error) {
      console.error('Error creating optimized chat:', error)
      throw error
    }
  }, [])

  // Optimizar historial para transferencia entre agentes
  const optimizeHistoryForAgent = useCallback(async (
    targetAgent: AgentType
  ): Promise<ChatMessage[]> => {
    const { comprehensiveHistory } = contextState
    
    // Estrategia de optimización basada en el agente objetivo
    switch (targetAgent) {
      case "clinico":
        // Para el agente clínico, priorizar información diagnóstica y de tratamiento
        return comprehensiveHistory.filter(msg => 
          msg.content.toLowerCase().includes('diagnóstico') ||
          msg.content.toLowerCase().includes('tratamiento') ||
          msg.content.toLowerCase().includes('síntoma') ||
          msg.role === 'user'
        ).slice(-15)
        
      case "academico":
        // Para el agente académico, priorizar consultas de investigación
        return comprehensiveHistory.filter(msg =>
          msg.content.toLowerCase().includes('investigación') ||
          msg.content.toLowerCase().includes('estudio') ||
          msg.content.toLowerCase().includes('evidencia') ||
          msg.role === 'user'
        ).slice(-15)
        
      case "socratico":
      default:
        // Para el agente socrático, mantener contexto conversacional completo
        return comprehensiveHistory.slice(-20)
    }
  }, [contextState])

  // Enviar mensaje optimizado con extracción de métricas de uso
  const sendOptimizedMessage = useCallback(async (
    message: string,
    useStreaming = true
  ): Promise<{ response: any; usageMetadata: any }> => {
    if (!contextState.nativeChat) {
      throw new Error('No active optimized chat session')
    }

    const startTime = Date.now()
    responseTimeRef.current = startTime

    try {
      let response: any
      let responseText = ''

      if (useStreaming) {
        response = await contextState.nativeChat.sendMessageStream({ message: message })
        
        // Procesar stream y extraer texto completo, incluyendo URLs de grounding
        let groundingUrls: Array<{title: string, url: string, domain?: string}> = []
        for await (const chunk of response) {
          responseText += chunk.text || ''
          
          // Capturar URLs de grounding si están disponibles
          if (chunk.groundingUrls && Array.isArray(chunk.groundingUrls)) {
            groundingUrls.push(...chunk.groundingUrls)
          }
        }
        
        // Agregar URLs de grounding al response si existen
        if (groundingUrls.length > 0) {
          response.groundingUrls = groundingUrls
        }
      } else {
        response = await contextState.nativeChat.sendMessage({ message: message })
        responseText = response.text || ''
      }

      const endTime = Date.now()
      const responseTime = endTime - startTime

      // Calcular tokens
      const messageTokens = await countTokens(message)
      const responseTokens = await countTokens(responseText)
      const totalTokens = messageTokens + responseTokens

      // Crear mensajes para el historial
      const userMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: message,
        role: 'user',
        timestamp: new Date()
      }

      const aiMessage: ChatMessage = {
        id: `msg_${Date.now() + 1}_${Math.random().toString(36).substr(2, 9)}`,
        content: responseText,
        role: 'model',
        agent: contextState.currentAgent,
        timestamp: new Date(),
        groundingUrls: response.groundingUrls || []
      }

      // Actualizar estado del contexto
      setContextState(prev => {
        const newTotalMessages = prev.usageMetadata.totalMessages + 1
        const newAverageResponseTime = (
          (prev.usageMetadata.averageResponseTime * prev.usageMetadata.totalMessages + responseTime) /
          newTotalMessages
        )

        const updatedCurated = [...prev.curatedHistory, userMessage, aiMessage].slice(-20)
        const updatedComprehensive = [...prev.comprehensiveHistory, userMessage, aiMessage]
        
        const compressionRatio = updatedCurated.length / updatedComprehensive.length

        return {
          ...prev,
          curatedHistory: updatedCurated,
          comprehensiveHistory: updatedComprehensive,
          tokenCount: prev.tokenCount + totalTokens,
          usageMetadata: {
            totalMessages: newTotalMessages,
            averageResponseTime: newAverageResponseTime,
            compressionRatio,
            modalityUsage: {
              ...prev.usageMetadata.modalityUsage,
              text: prev.usageMetadata.modalityUsage.text + 1
            }
          },
          modalityDetails: {
            ...prev.modalityDetails,
            textTokens: prev.modalityDetails.textTokens + totalTokens
          },
          contextWindow: {
            ...prev.contextWindow,
            utilized: prev.tokenCount + totalTokens,
            compressionActive: (prev.tokenCount + totalTokens) > (MAX_CONTEXT_WINDOW * 0.8)
          }
        }
      })

      const usageMetadata = {
        responseTime,
        messageTokens,
        responseTokens,
        totalTokens,
        timestamp: new Date()
      }

      return { response, usageMetadata }
    } catch (error) {
      console.error('Error sending optimized message:', error)
      throw error
    }
  }, [contextState, countTokens])

  // Transferir contexto optimizado entre agentes con configuraciones específicas
  const transferContextToAgent = useCallback(async (newAgent: AgentType): Promise<any> => {
    try {
      // Optimizar historial para el nuevo agente
      const optimizedHistory = await optimizeHistoryForAgent(newAgent)
      
      // Crear nuevo chat con el agente objetivo usando configuraciones específicas
      const newChat = await createOptimizedChat(newAgent, optimizedHistory)
      
      // Actualizar el agente actual en el estado
      setContextState(prev => ({
        ...prev,
        currentAgent: newAgent
      }))
      
      console.log(`✅ Contexto transferido exitosamente a agente: ${newAgent} con configuraciones específicas`)
      return newChat
    } catch (error) {
      console.error('Error transferring context to agent:', error)
      throw error
    }
  }, [createOptimizedChat, optimizeHistoryForAgent])

  // Utilidades de acceso al contexto
  const getCuratedHistory = useCallback(() => contextState.curatedHistory, [contextState.curatedHistory])
  const getComprehensiveHistory = useCallback(() => contextState.comprehensiveHistory, [contextState.comprehensiveHistory])
  const getTokenCount = useCallback(async () => {
    // En una implementación real, esto consultaría el SDK para obtener el conteo exacto
    return contextState.tokenCount
  }, [contextState.tokenCount])
  const getUsageMetadata = useCallback(() => contextState.usageMetadata, [contextState.usageMetadata])
  const getModalityDetails = useCallback(() => contextState.modalityDetails, [contextState.modalityDetails])
  const isContextOptimized = useCallback(() => !!contextState.nativeChat, [contextState.nativeChat])

  // Resetear contexto
  const resetContext = useCallback(() => {
    setContextState({
      nativeChat: null,
      currentAgent: 'socratico',
      curatedHistory: [],
      comprehensiveHistory: [],
      tokenCount: 0,
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
      },
      contextWindow: {
        utilized: 0,
        available: MAX_CONTEXT_WINDOW,
        compressionActive: false
      }
    })
  }, [])

  return {
    contextState,
    createOptimizedChat,
    optimizeHistoryForAgent,
    sendOptimizedMessage,
    transferContextToAgent,
    getCuratedHistory,
    getComprehensiveHistory,
    getTokenCount,
    getUsageMetadata,
    getModalityDetails,
    isContextOptimized,
    resetContext
  }
}