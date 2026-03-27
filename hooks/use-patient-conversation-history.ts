"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { clinicalStorage } from "@/lib/clinical-context-storage"
import { getStorageAdapter } from "@/lib/server-storage-adapter"
import type { ChatState, AgentType, ClinicalMode, PaginationOptions, PaginatedResponse, PatientRecord } from "@/types/clinical-types"

interface PatientConversationSummary {
  sessionId: string
  title: string
  lastMessage: string
  lastUpdated: Date
  activeAgent: AgentType
  mode: ClinicalMode
  messageCount: number
  preview: string
  patientId: string
  patientName: string
}

interface UsePatientConversationHistoryReturn {
  conversations: PatientConversationSummary[]
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  hasNextPage: boolean
  totalCount: number
  
  // Gestión de conversaciones por paciente
  loadPatientConversations: (patientId: string, userId: string) => Promise<void>
  loadMoreConversations: () => Promise<void>
  openConversation: (sessionId: string) => Promise<ChatState | null>
  deleteConversation: (sessionId: string) => Promise<void>
  updateConversationTitle: (sessionId: string, newTitle: string) => Promise<void>
  searchConversations: (query: string) => PatientConversationSummary[]
  
  // Filtros específicos para pacientes
  filterByAgent: (agent: AgentType | 'all') => PatientConversationSummary[]
  filterByMode: (mode: ClinicalMode | 'all') => PatientConversationSummary[]
  filterByDateRange: (startDate: Date, endDate: Date) => PatientConversationSummary[]
  
  // Utilidades
  clearError: () => void
  refreshConversations: () => Promise<void>
  getConversationsByPatient: (patientId: string) => PatientConversationSummary[]
}

/**
 * Hook especializado para gestionar el historial de conversaciones específicas de pacientes
 * Extiende la funcionalidad base de conversaciones con filtrado por paciente
 */
export function usePatientConversationHistory(): UsePatientConversationHistoryReturn {
  const [conversations, setConversations] = useState<PatientConversationSummary[]>([])
  const [allConversations, setAllConversations] = useState<PatientConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [searchQuery, setSearchQuery] = useState<string>('')
  
  // Cache para evitar recargas innecesarias
  const conversationCache = useRef<Map<string, PatientConversationSummary>>(new Map())
  const lastLoadedPatientId = useRef<string | null>(null)
  const lastLoadedUserId = useRef<string | null>(null)

  // Función para convertir ChatState a PatientConversationSummary
  const createPatientConversationSummary = useCallback((chatState: ChatState): PatientConversationSummary | null => {
    // Buscar patientId en múltiples ubicaciones posibles
    let patientId = chatState.clinicalContext?.patientId
    
    // Si no está en clinicalContext, buscar en sessionMeta (para conversaciones legacy)
    if (!patientId && (chatState as any).sessionMeta?.patient?.reference) {
      patientId = (chatState as any).sessionMeta.patient.reference
    }
    
    // También buscar en patientContext si existe (para PatientChatState)
    if (!patientId && (chatState as any).patientContext?.patientId) {
      patientId = (chatState as any).patientContext.patientId
    }
    
    // Debug: mostrar qué patientId se encontró
    console.log(`🔍 PatientId encontrado para sesión ${chatState.sessionId}:`, patientId)
    
    // Solo incluir conversaciones que tienen contexto de paciente
    if (!patientId) {
      console.log(`❌ No se encontró patientId para sesión ${chatState.sessionId}`)
      return null
    }

    const lastUserMessage = chatState.history
      .filter(msg => msg.role === 'user')
      .pop()
    
    const lastMessage = chatState.history[chatState.history.length - 1]
    
    // Usar el título guardado en ChatState, o generar uno si no existe
    const firstUserMessage = chatState.history.find(msg => msg.role === 'user')
    const title = chatState.title || (firstUserMessage 
      ? firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
      : `Sesión ${chatState.activeAgent}`)
    
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
      preview,
      patientId,
      patientName: `Paciente ${patientId}` // Se puede mejorar con datos reales del paciente
    }
  }, [])

  // Cargar conversaciones específicas de un paciente
  const loadPatientConversations = useCallback(async (patientId: string, userId: string, resetCache: boolean = true) => {
    setIsLoading(true)
    setError(null)
    setCurrentPatientId(patientId)
    setCurrentUserId(userId)
    
    if (resetCache) {
      conversationCache.current.clear()
      setConversations([])
      setAllConversations([])
      setNextPageToken(undefined)
    }

    try {
      console.log(`🔄 Cargando conversaciones para paciente: ${patientId}`)
      
      const storage = await getStorageAdapter()
      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }
      
      // Cargar todas las conversaciones del usuario y filtrar por paciente
      const result = await storage.getUserSessionsPaginated(userId, paginationOptions)
      
      console.log(`📊 Procesando ${result.items.length} conversaciones para filtrar por paciente`)
      
      // Debug: mostrar estructura de las primeras conversaciones
      if (result.items.length > 0) {
        const firstItem = result.items[0]
        console.log('🔍 Estructura de la primera conversación:', {
          sessionId: firstItem.sessionId,
          clinicalContext: firstItem.clinicalContext,
          sessionMeta: (firstItem as any).sessionMeta,
          patientContext: (firstItem as any).patientContext
        })
      }
      
      // Filtrar y convertir solo las conversaciones del paciente específico
      const patientSummaries = result.items
        .map(createPatientConversationSummary)
        .filter((summary: PatientConversationSummary | null): summary is PatientConversationSummary => 
          summary !== null && summary.patientId === patientId
        )
      
      console.log(`🏥 Encontradas ${patientSummaries.length} conversaciones para el paciente ${patientId}`)
      
      // Actualizar cache
      patientSummaries.forEach((summary: PatientConversationSummary) => {
        conversationCache.current.set(summary.sessionId, summary)
      })
      
      setAllConversations(patientSummaries)
      setConversations(patientSummaries)
      setHasNextPage(result.hasNextPage) // Nota: esto es para todas las conversaciones, no solo del paciente
      setTotalCount(patientSummaries.length)
      setNextPageToken(result.nextPageToken)
      lastLoadedPatientId.current = patientId
      lastLoadedUserId.current = userId
      
      console.log(`✅ Conversaciones del paciente cargadas exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando conversaciones del paciente: ${errorMessage}`)
      console.error('❌ Error cargando conversaciones del paciente:', err)
    } finally {
      setIsLoading(false)
    }
  }, [createPatientConversationSummary])

  // Cargar más conversaciones (lazy loading)
  const loadMoreConversations = useCallback(async () => {
    if (!currentUserId || !currentPatientId || !hasNextPage || !nextPageToken || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      console.log(`🔄 Cargando más conversaciones para paciente: ${currentPatientId}`)
      
      const storage = await getStorageAdapter()
      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        pageToken: nextPageToken,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }
      
      const result = await storage.getUserSessionsPaginated(currentUserId, paginationOptions)
      
      // Filtrar nuevas conversaciones del paciente
      const newPatientSummaries = result.items
        .map(createPatientConversationSummary)
        .filter((summary: PatientConversationSummary | null): summary is PatientConversationSummary => 
          summary !== null && 
          summary.patientId === currentPatientId &&
          !conversationCache.current.has(summary.sessionId)
        )
      
      console.log(`📊 Cargadas ${newPatientSummaries.length} nuevas conversaciones del paciente`)
      
      // Actualizar cache y estado
      newPatientSummaries.forEach((summary: PatientConversationSummary) => {
        conversationCache.current.set(summary.sessionId, summary)
      })
      
      const updatedConversations = [...allConversations, ...newPatientSummaries]
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      setHasNextPage(result.hasNextPage)
      setTotalCount(updatedConversations.length)
      setNextPageToken(result.nextPageToken)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando más conversaciones: ${errorMessage}`)
      console.error('❌ Error cargando más conversaciones:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [currentUserId, currentPatientId, hasNextPage, nextPageToken, isLoadingMore, allConversations, createPatientConversationSummary])

  // Abrir una conversación específica
  const openConversation = useCallback(async (sessionId: string): Promise<ChatState | null> => {
    setError(null)
    
    try {
      console.log(`🔓 Abriendo conversación: ${sessionId}`)
      const storage = await getStorageAdapter()
      const chatState = await storage.loadChatSession(sessionId)
      
      if (!chatState) {
        throw new Error('Conversación no encontrada')
      }
      
      console.log(`✅ Conversación cargada exitosamente`)
      return chatState
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error abriendo conversación: ${errorMessage}`)
      console.error('❌ Error abriendo conversación:', err)
      return null
    }
  }, [])

  // Eliminar una conversación
  const deleteConversation = useCallback(async (sessionId: string) => {
    setError(null)
    
    try {
      console.log(`🗑️ Eliminando conversación: ${sessionId}`)
      const storage = await getStorageAdapter()
      await storage.deleteChatSession(sessionId)
      
      // Actualizar estado local
      const updatedConversations = allConversations.filter(conv => conv.sessionId !== sessionId)
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      setTotalCount(updatedConversations.length)
      
      // Limpiar cache
      conversationCache.current.delete(sessionId)
      
      console.log(`✅ Conversación eliminada exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error eliminando conversación: ${errorMessage}`)
      console.error('❌ Error eliminando conversación:', err)
    }
  }, [allConversations])

  // Actualizar título de conversación (persistente)
  const updateConversationTitle = useCallback(async (sessionId: string, newTitle: string) => {
    setError(null)
    
    try {
      console.log(`✏️ Actualizando título de conversación: ${sessionId} -> ${newTitle}`)
      
      // Primero actualizar en el storage persistente
      const storage = await getStorageAdapter()
      const chatState = await storage.loadChatSession(sessionId)
      
      if (chatState) {
        // Actualizar el título en el ChatState
        const updatedChatState = {
          ...chatState,
          title: newTitle
        }
        
        // Guardar en storage
        await storage.saveChatSession(updatedChatState)
        console.log(`💾 Título guardado en storage persistente`)
      }
      
      // Luego actualizar estado local inmediatamente
      const updatedConversations = allConversations.map(conv => 
        conv.sessionId === sessionId 
          ? { ...conv, title: newTitle }
          : conv
      )
      
      // Actualizar ambos estados para asegurar consistencia
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      
      // Actualizar cache
      const cachedConv = conversationCache.current.get(sessionId)
      if (cachedConv) {
        conversationCache.current.set(sessionId, { ...cachedConv, title: newTitle })
      }
      
      console.log(`✅ Título actualizado exitosamente en storage y estado local`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error actualizando título: ${errorMessage}`)
      console.error('❌ Error actualizando título:', err)
    }
  }, [allConversations])

  // Buscar conversaciones
  const searchConversations = useCallback((query: string): PatientConversationSummary[] => {
    setSearchQuery(query)
    
    if (!query.trim()) {
      return allConversations
    }
    
    const lowercaseQuery = query.toLowerCase()
    return allConversations.filter(conv => 
      conv.title.toLowerCase().includes(lowercaseQuery) ||
      conv.preview.toLowerCase().includes(lowercaseQuery) ||
      conv.lastMessage.toLowerCase().includes(lowercaseQuery)
    )
  }, [allConversations])

  // Filtrar por agente
  const filterByAgent = useCallback((agent: AgentType | 'all'): PatientConversationSummary[] => {
    if (agent === 'all') {
      return conversations
    }
    return conversations.filter(conv => conv.activeAgent === agent)
  }, [conversations])

  // Filtrar por modo clínico
  const filterByMode = useCallback((mode: ClinicalMode | 'all'): PatientConversationSummary[] => {
    if (mode === 'all') {
      return conversations
    }
    return conversations.filter(conv => conv.mode === mode)
  }, [conversations])

  // Filtrar por rango de fechas
  const filterByDateRange = useCallback((startDate: Date, endDate: Date): PatientConversationSummary[] => {
    return conversations.filter(conv => {
      const convDate = new Date(conv.lastUpdated)
      return convDate >= startDate && convDate <= endDate
    })
  }, [conversations])

  // Obtener conversaciones por paciente específico
  const getConversationsByPatient = useCallback((patientId: string): PatientConversationSummary[] => {
    return allConversations.filter(conv => conv.patientId === patientId)
  }, [allConversations])

  // Limpiar error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Refrescar conversaciones
  const refreshConversations = useCallback(async () => {
    if (currentPatientId && currentUserId) {
      await loadPatientConversations(currentPatientId, currentUserId, true)
    }
  }, [currentPatientId, currentUserId, loadPatientConversations])

  // Aplicar filtros de búsqueda cuando cambie la query
  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = searchConversations(searchQuery)
      setConversations(filtered)
    } else {
      setConversations(allConversations)
    }
  }, [searchQuery, allConversations, searchConversations])

  return {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    hasNextPage,
    totalCount,
    loadPatientConversations,
    loadMoreConversations,
    openConversation,
    deleteConversation,
    updateConversationTitle,
    searchConversations,
    filterByAgent,
    filterByMode,
    filterByDateRange,
    getConversationsByPatient,
    clearError,
    refreshConversations
  }
}