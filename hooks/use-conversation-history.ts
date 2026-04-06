"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/providers/auth-provider"
import {
  listUserSessions,
  findSessionById,
  loadSessionWithMessages,
  deleteSession,
} from "@/lib/firestore-client-storage"
import type { ChatState, AgentType, ClinicalMode, PaginationOptions, PaginatedResponse } from "@/types/clinical-types"
import type { SessionSummary } from "@/lib/firestore-client-storage"

interface ConversationSummary {
  sessionId: string
  title: string
  lastMessage: string
  lastUpdated: Date
  activeAgent: AgentType
  mode: ClinicalMode
  messageCount: number
  preview: string
  patientId: string
}

interface UseConversationHistoryReturn {
  conversations: ConversationSummary[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasNextPage: boolean
  totalCount: number

  // Gestion de conversaciones
  loadConversations: (userId: string) => Promise<void>
  loadMoreConversations: () => Promise<void>
  openConversation: (sessionId: string) => Promise<ChatState | null>
  deleteConversation: (sessionId: string) => Promise<void>
  searchConversations: (query: string) => ConversationSummary[]

  // Filtros
  filterByAgent: (agent: AgentType | 'all') => ConversationSummary[]
  filterByMode: (mode: ClinicalMode | 'all') => ConversationSummary[]

  // Utilidades
  clearError: () => void
  refreshConversations: () => Promise<void>
}

export function useConversationHistory(): UseConversationHistoryReturn {
  const { psychologistId } = useAuth()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [allConversations, setAllConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Cache para evitar recargas innecesarias
  const conversationCache = useRef<Map<string, ConversationSummary>>(new Map())
  const lastLoadedUserId = useRef<string | null>(null)

  // Funcion para convertir SessionSummary a ConversationSummary
  const createConversationSummary = useCallback((summary: SessionSummary): ConversationSummary => {
    const title = summary.title || `Sesion ${summary.activeAgent}`
    const preview = summary.messageCount
      ? `${summary.messageCount} mensajes`
      : 'Sin mensajes'

    return {
      sessionId: summary.sessionId,
      title,
      lastMessage: '',
      lastUpdated: summary.lastUpdated,
      activeAgent: summary.activeAgent as AgentType,
      mode: summary.mode as ClinicalMode,
      messageCount: summary.messageCount || 0,
      preview,
      patientId: summary.patientId,
    }
  }, [])

  // Cargar conversaciones del usuario con paginacion
  const loadConversations = useCallback(async (_userId: string, resetCache: boolean = true) => {
    if (!psychologistId) return

    setIsLoading(true)
    setError(null)
    setCurrentUserId(_userId)

    if (resetCache) {
      conversationCache.current.clear()
      setConversations([])
      setAllConversations([])
      setNextPageToken(undefined)
    }

    try {
      console.log(`Cargando conversaciones paginadas para usuario: ${_userId}`)

      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }

      const result = await listUserSessions(psychologistId, paginationOptions)

      console.log(`Cargada pagina con ${result.items.length} conversaciones de ${result.totalCount} totales`)

      const summaries = result.items.map(createConversationSummary)

      // Actualizar cache
      summaries.forEach((summary: ConversationSummary) => {
        conversationCache.current.set(summary.sessionId, summary)
      })

      setAllConversations(summaries)
      setConversations(summaries)
      setHasNextPage(result.hasNextPage)
      setTotalCount(result.totalCount)
      setNextPageToken(result.nextPageToken)
      lastLoadedUserId.current = _userId

      console.log(`Primera pagina de conversaciones cargada exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando conversaciones: ${errorMessage}`)
      console.error('Error cargando conversaciones:', err)
    } finally {
      setIsLoading(false)
    }
  }, [psychologistId, createConversationSummary])

  // Cargar mas conversaciones (lazy loading)
  const loadMoreConversations = useCallback(async () => {
    if (!psychologistId || !currentUserId || !hasNextPage || !nextPageToken || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      console.log(`Cargando mas conversaciones...`)

      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        pageToken: nextPageToken,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }

      const result = await listUserSessions(psychologistId, paginationOptions)

      console.log(`Cargadas ${result.items.length} conversaciones adicionales`)

      const newSummaries = result.items.map(createConversationSummary)

      // Actualizar cache
      newSummaries.forEach((summary: ConversationSummary) => {
        conversationCache.current.set(summary.sessionId, summary)
      })

      // Combinar con conversaciones existentes
      const updatedConversations = [...allConversations, ...newSummaries]

      setAllConversations(updatedConversations)
      setConversations(searchQuery ?
        updatedConversations.filter(conv =>
          conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
        ) : updatedConversations
      )
      setHasNextPage(result.hasNextPage)
      setNextPageToken(result.nextPageToken)

      console.log(`Conversaciones adicionales cargadas exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando mas conversaciones: ${errorMessage}`)
      console.error('Error cargando mas conversaciones:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [psychologistId, currentUserId, hasNextPage, nextPageToken, isLoadingMore, allConversations, createConversationSummary, searchQuery])

  // Abrir conversacion especifica
  const openConversation = useCallback(async (sessionId: string): Promise<ChatState | null> => {
    if (!psychologistId) return null

    try {
      setError(null)

      const result = await findSessionById(psychologistId, sessionId)

      if (!result) {
        throw new Error(`Conversacion no encontrada: ${sessionId}`)
      }

      // Load full session with messages
      const chatState = await loadSessionWithMessages(psychologistId, result.patientId, sessionId)

      if (!chatState) {
        throw new Error(`Conversacion no encontrada: ${sessionId}`)
      }

      console.log(`Conversacion cargada: ${sessionId}`)
      return chatState
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error abriendo conversacion: ${errorMessage}`)
      console.error('Error abriendo conversacion:', err)
      return null
    }
  }, [psychologistId])

  // Eliminar conversacion
  const deleteConversation = useCallback(async (sessionId: string) => {
    if (!psychologistId) return

    try {
      setError(null)

      // Get patientId from cached conversation data
      const cachedConv = conversationCache.current.get(sessionId)
      let patientId: string

      if (cachedConv?.patientId) {
        patientId = cachedConv.patientId
      } else {
        // Fallback: look up the session to get patientId
        const found = await findSessionById(psychologistId, sessionId)
        if (!found) {
          throw new Error(`Conversacion no encontrada para eliminar: ${sessionId}`)
        }
        patientId = found.patientId
      }

      await deleteSession(psychologistId, patientId, sessionId)

      // Actualizar la lista local
      const updatedConversations = allConversations.filter(conv => conv.sessionId !== sessionId)
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      conversationCache.current.delete(sessionId)

      console.log(`Conversacion eliminada: ${sessionId}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error eliminando conversacion: ${errorMessage}`)
      console.error('Error eliminando conversacion:', err)
    }
  }, [psychologistId, allConversations])

  // Buscar conversaciones
  const searchConversations = useCallback((query: string): ConversationSummary[] => {
    setSearchQuery(query)

    if (!query.trim()) {
      setConversations(allConversations)
      return allConversations
    }

    const lowercaseQuery = query.toLowerCase()
    const filtered = allConversations.filter(conv =>
      conv.title.toLowerCase().includes(lowercaseQuery) ||
      conv.lastMessage.toLowerCase().includes(lowercaseQuery) ||
      conv.preview.toLowerCase().includes(lowercaseQuery)
    )

    setConversations(filtered)
    return filtered
  }, [allConversations])

  // Filtrar por agente
  const filterByAgent = useCallback((agent: AgentType | 'all'): ConversationSummary[] => {
    if (agent === 'all') {
      return allConversations
    }
    return allConversations.filter(conv => conv.activeAgent === agent)
  }, [allConversations])

  // Filtrar por modo
  const filterByMode = useCallback((mode: ClinicalMode | 'all'): ConversationSummary[] => {
    if (mode === 'all') {
      return allConversations
    }
    return allConversations.filter(conv => conv.mode === mode)
  }, [allConversations])

  // Estado para debouncing de refresh
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Refrescar conversaciones con debouncing
  const refreshConversations = useCallback(async () => {
    // Prevenir multiples refreshes simultaneos
    if (isRefreshing) {
      console.log('Refresh ya en progreso, ignorando solicitud duplicada')
      return
    }

    // Limpiar timeout anterior si existe
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Implementar debouncing de 200ms
    refreshTimeoutRef.current = setTimeout(async () => {
      if (currentUserId) {
        try {
          setIsRefreshing(true)
          console.log('Iniciando refresh debounced de conversaciones')
          await loadConversations(currentUserId, true)
          console.log('Refresh de conversaciones completado')
        } catch (error) {
          console.error('Error en refresh de conversaciones:', error)
        } finally {
          setIsRefreshing(false)
        }
      }
    }, 200)
  }, [currentUserId, loadConversations, isRefreshing])

  // Limpiar error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    hasNextPage,
    totalCount,
    loadConversations,
    loadMoreConversations,
    openConversation,
    deleteConversation,
    searchConversations,
    filterByAgent,
    filterByMode,
    clearError,
    refreshConversations
  }
}
