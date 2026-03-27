"use client"

import { useState, useEffect, useCallback } from "react"
import type { AgentType, ClinicalMode, ChatState } from "@/types/clinical-types"

export function useHopeAI() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [currentSession, setCurrentSession] = useState<ChatState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize system (client-side initialization)
  useEffect(() => {
    // For client-side, we just mark as initialized since API handles backend initialization
    setIsInitialized(true)
  }, [])

  // Create new clinical session
  const createSession = useCallback(
    async (userId: string, mode: ClinicalMode, agent: AgentType) => {
      if (!isInitialized) return null

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, mode, agent }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to create session')
        }

        setCurrentSession(data.chatState)
        return data.chatState
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session")
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [isInitialized],
  )

  // Load existing session
  const loadSession = useCallback(
    async (sessionId: string, userId: string = "current_user") => {
      if (!isInitialized) return null

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to load sessions')
        }

        const session = data.sessions.find((s: ChatState) => s.sessionId === sessionId)
        if (session) {
          setCurrentSession(session)
          return session
        }
        return null
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session")
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [isInitialized],
  )

  // Send message
  const sendMessage = useCallback(
    async (message: string, useStreaming = true, sessionMeta?: any) => {
      console.log('🔄 Hook: sendMessage llamado', {
        hasSession: !!currentSession,
        sessionId: currentSession?.sessionId,
        message: message.substring(0, 50) + '...',
        useStreaming
      })
      
      if (!currentSession) {
        console.log('❌ Hook: No hay sesión actual')
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        console.log('📡 Hook: Enviando request a /api/send-message', {
          hasSessionMeta: !!sessionMeta,
          patientReference: sessionMeta?.patient?.reference
        })
        const response = await fetch('/api/send-message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            sessionId: currentSession.sessionId, 
            message, 
            useStreaming,
            sessionMeta
          }),
        })

        console.log('📡 Hook: Response status:', response.status)
        const data = await response.json()
        console.log('📡 Hook: Response data:', data)

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to send message')
        }

        setCurrentSession(data.updatedState)
        console.log('✅ Hook: Mensaje enviado exitosamente')
        return data.response
      } catch (err) {
        console.error('❌ Hook: Error en sendMessage:', err)
        setError(err instanceof Error ? err.message : "Failed to send message")
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [currentSession],
  )

  // Switch agent
  const switchAgent = useCallback(
    async (newAgent: AgentType) => {
      if (!currentSession) return null

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/switch-agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            sessionId: currentSession.sessionId, 
            newAgent 
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to switch agent')
        }

        setCurrentSession(data.updatedState)
        return data.updatedState
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch agent")
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [currentSession],
  )

  // Upload document
  const uploadDocument = useCallback(
    async (file: File, userId: string = "current_user") => {
      if (!currentSession) return null

      setIsLoading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('sessionId', currentSession.sessionId)
        formData.append('userId', userId)

        const response = await fetch('/api/upload-document', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.details || data.error || 'Failed to upload document')
        }

        return data.uploadedFile
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload document")
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [currentSession],
  )

  // Get available agents
  const getAvailableAgents = useCallback(async () => {
    try {
      const response = await fetch('/api/agents')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to get agents')
      }

      return data.agents
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get available agents")
      return []
    }
  }, [])

  return {
    // State
    isInitialized,
    currentSession,
    isLoading,
    error,

    // Actions
    createSession,
    loadSession,
    sendMessage,
    switchAgent,
    uploadDocument,
    getAvailableAgents,

    // Utilities
    clearError: () => setError(null),
  }
}
