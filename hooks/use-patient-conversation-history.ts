"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/providers/auth-provider"
import {
  listUserSessions,
  findSessionById,
  loadSessionWithMessages,
  deleteSession,
  saveSessionMetadata,
} from "@/lib/firestore-client-storage"
import type { ChatState, AgentType, ClinicalMode, PaginationOptions, PaginatedResponse, PatientRecord } from "@/types/clinical-types"
import type { SessionSummary } from "@/lib/firestore-client-storage"

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

  // Gestion de conversaciones por paciente
  loadPatientConversations: (patientId: string, userId: string) => Promise<void>
  loadMoreConversations: () => Promise<void>
  openConversation: (sessionId: string) => Promise<ChatState | null>
  deleteConversation: (sessionId: string) => Promise<void>
  updateConversationTitle: (sessionId: string, newTitle: string) => Promise<void>
  searchConversations: (query: string) => PatientConversationSummary[]

  // Filtros especificos para pacientes
  filterByAgent: (agent: AgentType | 'all') => PatientConversationSummary[]
  filterByMode: (mode: ClinicalMode | 'all') => PatientConversationSummary[]
  filterByDateRange: (startDate: Date, endDate: Date) => PatientConversationSummary[]

  // Utilidades
  clearError: () => void
  refreshConversations: () => Promise<void>
  getConversationsByPatient: (patientId: string) => PatientConversationSummary[]
}

/**
 * Hook especializado para gestionar el historial de conversaciones especificas de pacientes
 * Extiende la funcionalidad base de conversaciones con filtrado por paciente
 */
export function usePatientConversationHistory(): UsePatientConversationHistoryReturn {
  const { psychologistId } = useAuth()
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

  // Funcion para convertir SessionSummary a PatientConversationSummary
  const createPatientConversationSummary = useCallback((summary: SessionSummary): PatientConversationSummary | null => {
    const patientId = summary.patientId

    if (!patientId || patientId === 'default_patient') {
      console.log(`No se encontro patientId para sesion ${summary.sessionId}`)
      return null
    }

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
      patientId,
      patientName: `Paciente ${patientId}`
    }
  }, [])

  // Cargar conversaciones especificas de un paciente
  const loadPatientConversations = useCallback(async (patientId: string, userId: string, resetCache: boolean = true) => {
    if (!psychologistId) return

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
      console.log(`Cargando conversaciones para paciente: ${patientId}`)

      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }

      const result = await listUserSessions(psychologistId, paginationOptions)

      console.log(`Procesando ${result.items.length} conversaciones para filtrar por paciente`)

      // Filtrar y convertir solo las conversaciones del paciente especifico
      const patientSummaries = result.items
        .map(createPatientConversationSummary)
        .filter((summary: PatientConversationSummary | null): summary is PatientConversationSummary =>
          summary !== null && summary.patientId === patientId
        )

      console.log(`Encontradas ${patientSummaries.length} conversaciones para el paciente ${patientId}`)

      // Actualizar cache
      patientSummaries.forEach((summary: PatientConversationSummary) => {
        conversationCache.current.set(summary.sessionId, summary)
      })

      setAllConversations(patientSummaries)
      setConversations(patientSummaries)
      setHasNextPage(result.hasNextPage)
      setTotalCount(patientSummaries.length)
      setNextPageToken(result.nextPageToken)
      lastLoadedPatientId.current = patientId
      lastLoadedUserId.current = userId

      console.log(`Conversaciones del paciente cargadas exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error cargando conversaciones del paciente: ${errorMessage}`)
      console.error('Error cargando conversaciones del paciente:', err)
    } finally {
      setIsLoading(false)
    }
  }, [psychologistId, createPatientConversationSummary])

  // Cargar mas conversaciones (lazy loading)
  const loadMoreConversations = useCallback(async () => {
    if (!psychologistId || !currentUserId || !currentPatientId || !hasNextPage || !nextPageToken || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setError(null)

    try {
      console.log(`Cargando mas conversaciones para paciente: ${currentPatientId}`)

      const paginationOptions: PaginationOptions = {
        pageSize: 20,
        pageToken: nextPageToken,
        sortBy: 'lastUpdated',
        sortOrder: 'desc'
      }

      const result = await listUserSessions(psychologistId, paginationOptions)

      // Filtrar nuevas conversaciones del paciente
      const newPatientSummaries = result.items
        .map(createPatientConversationSummary)
        .filter((summary: PatientConversationSummary | null): summary is PatientConversationSummary =>
          summary !== null &&
          summary.patientId === currentPatientId &&
          !conversationCache.current.has(summary.sessionId)
        )

      console.log(`Cargadas ${newPatientSummaries.length} nuevas conversaciones del paciente`)

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
      setError(`Error cargando mas conversaciones: ${errorMessage}`)
      console.error('Error cargando mas conversaciones:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [psychologistId, currentUserId, currentPatientId, hasNextPage, nextPageToken, isLoadingMore, allConversations, createPatientConversationSummary])

  // Abrir una conversacion especifica
  const openConversation = useCallback(async (sessionId: string): Promise<ChatState | null> => {
    if (!psychologistId) return null

    setError(null)

    try {
      console.log(`Abriendo conversacion: ${sessionId}`)

      const result = await findSessionById(psychologistId, sessionId)

      if (!result) {
        throw new Error('Conversacion no encontrada')
      }

      // Load full session with messages
      const chatState = await loadSessionWithMessages(psychologistId, result.patientId, sessionId)

      if (!chatState) {
        throw new Error('Conversacion no encontrada')
      }

      console.log(`Conversacion cargada exitosamente`)
      return chatState
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error abriendo conversacion: ${errorMessage}`)
      console.error('Error abriendo conversacion:', err)
      return null
    }
  }, [psychologistId])

  // Eliminar una conversacion
  const deleteConversation = useCallback(async (sessionId: string) => {
    if (!psychologistId) return

    setError(null)

    try {
      console.log(`Eliminando conversacion: ${sessionId}`)

      // Get patientId from cached conversation data
      const cachedConv = conversationCache.current.get(sessionId)
      let patientId: string

      if (cachedConv?.patientId) {
        patientId = cachedConv.patientId
      } else {
        const found = await findSessionById(psychologistId, sessionId)
        if (!found) {
          throw new Error(`Conversacion no encontrada para eliminar: ${sessionId}`)
        }
        patientId = found.patientId
      }

      await deleteSession(psychologistId, patientId, sessionId)

      // Actualizar estado local
      const updatedConversations = allConversations.filter(conv => conv.sessionId !== sessionId)
      setAllConversations(updatedConversations)
      setConversations(updatedConversations)
      setTotalCount(updatedConversations.length)

      // Limpiar cache
      conversationCache.current.delete(sessionId)

      console.log(`Conversacion eliminada exitosamente`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error eliminando conversacion: ${errorMessage}`)
      console.error('Error eliminando conversacion:', err)
    }
  }, [psychologistId, allConversations])

  // Actualizar titulo de conversacion (persistente)
  const updateConversationTitle = useCallback(async (sessionId: string, newTitle: string) => {
    if (!psychologistId) return

    setError(null)

    try {
      console.log(`Actualizando titulo de conversacion: ${sessionId} -> ${newTitle}`)

      // Find the session to get patientId and full data
      const result = await findSessionById(psychologistId, sessionId)

      if (result) {
        // Update the title in the ChatState
        const updatedChatState = {
          ...result.session,
          title: newTitle
        }

        // Save to Firestore
        await saveSessionMetadata(psychologistId, result.patientId, updatedChatState)
        console.log(`Titulo guardado en Firestore`)
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

      console.log(`Titulo actualizado exitosamente en Firestore y estado local`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error actualizando titulo: ${errorMessage}`)
      console.error('Error actualizando titulo:', err)
    }
  }, [psychologistId, allConversations])

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

  // Filtrar por modo clinico
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

  // Obtener conversaciones por paciente especifico
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

  // Aplicar filtros de busqueda cuando cambie la query
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
