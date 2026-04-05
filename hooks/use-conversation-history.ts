"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { clinicalStorage } from "@/lib/clinical-context-storage"
import type { ChatState, AgentType, ClinicalMode, PaginationOptions, PaginatedResponse } from "@/types/clinical-types"

interface ConversationSummary {
  sessionId: string
  title: string
  lastMessage: string
  lastUpdated: Date
  activeAgent: AgentType
  mode: ClinicalMode
  messageCount: number
  preview: string
}

interface UseConversationHistoryReturn {
  conversations: ConversationSummary[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasNextPage: boolean
  totalCount: number
  
  // Gestión de conversaciones
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

  // Función para convertir ChatState a ConversationSummary
  const createConversationSummary = useCallback((chatState: ChatState): ConversationSummary => {
    const lastUserMessage = chatState.history
      .filter(msg => msg.role === 'user')
      .pop()
    
    const lastMessage = chatState.history[chatState.history.length - 1]
    
    // Generar título inteligente basado en el primer mensaje del usuario
    const firstUserMessage = chatState.history.find(msg => msg.role === 'user')
    const title = firstUserMessage 
      ? firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
      : `Sesión ${chatState.activeAgent}`
    
    // Crear preview del último intercambio
    const preview = lastMessage
      ? `${lastMessage.role === 'user' ? 'Tú' : 'HopeAI'}: ${lastMessage.content.substring(0, 100)}${lastMessage.content.length > 100 ? '...' : ''}`
      : 'Sin mensajes'

    return {
      sessionId: chatState.sessionId,
      title,
      lastMessage: lastMessage?.content || '',
      lastUpdated: chatState.metadata.lastUpdated,
      activeAgent: chatState.activeAgent,
      mode: chatState.mode,
      messageCount: chatState.history.length,
      preview
    }
  }, [])

  // Cargar conversaciones del usuario con paginación
  const loadConversations = useCallback(async (userId: string, resetCache: boolean = true) => {
    setIsLoading(true)
    setError(null)
    setCurrentUserId(userId)
    
    if (resetCache) {
      conversationCache.current.clear()
      setConversations([])
      setAllConversations([])
      setNextPageToken(undefined)
    }

    try {
      console.log(`🔄 Cargando conversaciones paginadas para usuario: ${userId}`)
      
      const paginationOptions: PaginationOptions = {
        pageSize: 20, // Tamaño de página optimizado según el SDK
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }
      
      const result = await clinicalStorage.getUserSessionsPaginated(userId, paginationOptions)
      
      console.log(`📊 Cargada página con ${result.items.length} conversaciones de ${result.totalCount} totales`)
      
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
      lastLoadedUserId.current = userId
      
      console.log(`✅ Primera página de conversaciones cargada exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando conversaciones: ${errorMessage}`)
      console.error('❌ Error cargando conversaciones:', err)
    } finally {
      setIsLoading(false)
    }
  }, [createConversationSummary])

  // Cargar más conversaciones (lazy loading)
  const loadMoreConversations = useCallback(async () => {
    if (!currentUserId || !hasNextPage || !nextPageToken || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      console.log(`🔄 Cargando más conversaciones...`)
      
      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        pageToken: nextPageToken,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }
      
      const result = await clinicalStorage.getUserSessionsPaginated(currentUserId, paginationOptions)
      
      console.log(`📊 Cargadas ${result.items.length} conversaciones adicionales`)
      
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
      
      console.log(`✅ Conversaciones adicionales cargadas exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando más conversaciones: ${errorMessage}`)
      console.error('❌ Error cargando más conversaciones:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [currentUserId, hasNextPage, nextPageToken, isLoadingMore, allConversations, createConversationSummary, searchQuery])

  // Abrir conversación específica
  const openConversation = useCallback(async (sessionId: string): Promise<ChatState | null> => {
    try {
      setError(null)
      
      const chatState = await clinicalStorage.loadChatSession(sessionId)
      
      if (!chatState) {
        throw new Error(`Conversación no encontrada: ${sessionId}`)
      }
      
      console.log(`✅ Conversación cargada: ${sessionId}`)
      return chatState
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error abriendo conversación: ${errorMessage}`)
      console.error('❌ Error abriendo conversación:', err)
      return null
    }
  }, [])

  // Eliminar conversación
  const deleteConversation = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      
      await clinicalStorage.deleteChatSession(sessionId)
      
      // Actualizar la lista local
      const updatedConversations = allConversations.filter(conv => conv.sessionId !== sessionId)
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      
      console.log(`✅ Conversación eliminada: ${sessionId}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error eliminando conversación: ${errorMessage}`)
      console.error('❌ Error eliminando conversación:', err)
    }
  }, [allConversations])

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
    // Prevenir múltiples refreshes simultáneos
    if (isRefreshing) {
      console.log('⚠️ Refresh ya en progreso, ignorando solicitud duplicada')
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
          console.log('🔄 Iniciando refresh debounced de conversaciones')
          await loadConversations(currentUserId, true) // Resetear cache
          console.log('✅ Refresh de conversaciones completado')
        } catch (error) {
          console.error('❌ Error en refresh de conversaciones:', error)
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