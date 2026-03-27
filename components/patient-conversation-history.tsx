"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Search, MessageCircle, Clock, User, Filter, ChevronDown, Trash2, ExternalLink, Plus, Edit2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
// Removed ScrollArea to rely on parent modal body scroll for better mobile behavior
// import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, Loader2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { usePatientConversationHistory } from "@/hooks/use-patient-conversation-history"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"
import type { AgentType, ClinicalMode, PatientRecord } from "@/types/clinical-types"

interface PatientConversationHistoryProps {
  patient: PatientRecord
  userId: string
  onConversationSelect?: (sessionId: string) => void
  onNewConversation?: (patientId: string) => void
  className?: string
}

type FilterType = 'all' | AgentType
type ModeFilterType = 'all' | ClinicalMode
type SortType = 'recent' | 'oldest' | 'messages'

export function PatientConversationHistory({
  patient,
  userId,
  onConversationSelect,
  onNewConversation,
  className = ""
}: PatientConversationHistoryProps) {
  const {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    hasNextPage,
    totalCount,
    loadPatientConversations,
    loadMoreConversations,
    deleteConversation,
    updateConversationTitle,
    searchConversations,
    filterByAgent,
    filterByMode,
    clearError,
    refreshConversations
  } = usePatientConversationHistory()

  // Estados locales para filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState("")
  const [agentFilter, setAgentFilter] = useState<FilterType>('all')
  const [modeFilter, setModeFilter] = useState<ModeFilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('recent')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  
  // Estados para edición de títulos
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")

  // Cargar conversaciones al montar el componente
  useEffect(() => {
    if (patient.id && userId) {
      loadPatientConversations(patient.id, userId)
    }
  }, [patient.id, userId, loadPatientConversations])

  // Aplicar filtros y búsqueda
  const filteredAndSortedConversations = useMemo(() => {
    let filtered = conversations

    // Aplicar búsqueda
    if (searchQuery.trim()) {
      filtered = searchConversations(searchQuery)
    }

    // Aplicar filtro por agente
    if (agentFilter !== 'all') {
      filtered = filterByAgent(agentFilter)
    }

    // Aplicar filtro por modo
    if (modeFilter !== 'all') {
      filtered = filterByMode(modeFilter)
    }

    // Aplicar ordenamiento
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'recent':
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        case 'oldest':
          return new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime()
        case 'messages':
          return b.messageCount - a.messageCount
        default:
          return 0
      }
    })

    return sorted
  }, [conversations, searchQuery, agentFilter, modeFilter, sortBy, searchConversations, filterByAgent, filterByMode])

  // Manejar selección de conversación
  const handleConversationSelect = (sessionId: string) => {
    onConversationSelect?.(sessionId)
  }

  // Manejar eliminación de conversación
  const handleDeleteConversation = async () => {
    if (conversationToDelete) {
      await deleteConversation(conversationToDelete)
      setDeleteDialogOpen(false)
      setConversationToDelete(null)
    }
  }

  // Funciones para edición de títulos
  const startEditing = (sessionId: string, currentTitle: string) => {
    setEditingId(sessionId)
    setEditingTitle(currentTitle)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingTitle("")
  }

  const saveTitle = async (sessionId: string) => {
    if (editingTitle.trim() && editingTitle !== conversations.find(c => c.sessionId === sessionId)?.title) {
      try {
        await updateConversationTitle(sessionId, editingTitle.trim())
      } catch (error) {
        console.error('Error actualizando título:', error)
      }
    }
    setEditingId(null)
    setEditingTitle("")
  }

  const handleKeyPress = (e: React.KeyboardEvent, sessionId: string) => {
    if (e.key === 'Enter') {
      saveTitle(sessionId)
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  // Formatear fecha relativa
  const formatRelativeTime = (date: Date) => {
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Hace menos de 1 hora'
    if (diffInHours < 24) return `Hace ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `Hace ${diffInDays} día${diffInDays > 1 ? 's' : ''}`
    
    const diffInWeeks = Math.floor(diffInDays / 7)
    if (diffInWeeks < 4) return `Hace ${diffInWeeks} semana${diffInWeeks > 1 ? 's' : ''}`
    
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  // Obtener configuración visual del agente
  const getAgentConfig = (agent: AgentType) => {
    return getAgentVisualConfigSafe(agent)
  }

  if (isLoading && conversations.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Sticky: Header + búsqueda/filtros dentro del contenedor que desplaza (cuerpo del modal) */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b -mx-4 px-4 pt-3 pb-2 sm:mx-0 sm:px-0">
        {/* Barra de búsqueda con botón integrado */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en conversaciones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 sm:h-10"
                aria-label="Buscar en conversaciones"
              />
            </div>
            <Button
              onClick={() => onNewConversation?.(patient.id)}
              className="h-11 sm:h-10 w-11 sm:w-10 p-0 shrink-0"
              aria-label="Nueva conversación"
            >
              <Plus className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de conversaciones - rely on parent scroll, avoid nested scroll areas */}
      <div className="space-y-2 sm:space-y-3">
        {isLoading ? (
          <div className="space-y-2 sm:space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardHeader className="pb-2 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <Skeleton className="h-6 w-6 sm:h-8 sm:w-8" />
                      <Skeleton className="h-6 w-6 sm:h-8 sm:w-8" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-0">
                  <Skeleton className="h-3 w-full mb-1" />
                  <Skeleton className="h-3 w-2/3 mb-2 sm:mb-3" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredAndSortedConversations.length === 0 ? (
          <Card>
            <CardContent className="pt-4 sm:pt-6">
              <div className="text-center text-muted-foreground px-4">
                <MessageCircle className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="font-sans text-base sm:text-lg font-medium mb-2">
                  {searchQuery ? 'No se encontraron conversaciones' : 'Sin conversaciones'}
                </p>
                <p className="font-sans text-xs sm:text-sm">
                  {searchQuery 
                    ? 'Intenta con otros términos de búsqueda o ajusta los filtros'
                    : 'Inicia una nueva conversación con este paciente'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredAndSortedConversations.map((conversation) => {
            const agentConfig = getAgentConfig(conversation.activeAgent)
            
            return (
              <Card 
                key={conversation.sessionId} 
                className="hover:shadow-md transition-all duration-200 cursor-pointer group"
                onClick={() => handleConversationSelect(conversation.sessionId)}
              >
                <CardHeader className="pb-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {editingId === conversation.sessionId ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => handleKeyPress(e, conversation.sessionId)}
                            className="text-sm sm:text-base font-semibold h-8"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              saveTitle(conversation.sessionId)
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              cancelEditing()
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group/title">
                          <h4 className="font-sans font-medium text-sm sm:text-base leading-tight text-foreground group-hover:text-primary transition-colors duration-200 mb-1 flex-1">
                            {conversation.title}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover/title:opacity-100 transition-opacity h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditing(conversation.sessionId, conversation.title)
                            }}
                            aria-label="Editar título"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-0.5 sm:gap-1 ml-1 sm:ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-10 w-10 sm:h-8 sm:w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConversationSelect(conversation.sessionId)
                        }}
                        aria-label="Abrir conversación"
                      >
                        <ExternalLink className="h-4 w-4 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-10 w-10 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setConversationToDelete(conversation.sessionId)
                          setDeleteDialogOpen(true)
                        }}
                        aria-label="Eliminar conversación"
                      >
                        <Trash2 className="h-4 w-4 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-4 sm:p-5 pt-0">
                  <p className="text-sm sm:text-base text-muted-foreground/80 leading-relaxed mb-4 line-clamp-2 font-normal">
                    {conversation.preview}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 min-w-0">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{formatRelativeTime(new Date(conversation.lastUpdated))}</span>
                    </span>
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 ml-2">
                      {conversation.messageCount} mensaje{conversation.messageCount !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
        
        {/* Botón para cargar más */}
        {hasNextPage && (
          <div className="flex justify-center pt-2 sm:pt-4">
            <Button
              variant="outline"
              onClick={loadMoreConversations}
              disabled={isLoadingMore}
              className="gap-1 sm:gap-2 text-xs sm:text-sm h-11 sm:h-9"
            >
              {isLoadingMore ? (
                <Loader2 className="h-4 w-4 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4 sm:h-4 sm:w-4" />
              )}
              <span className="hidden sm:inline">
                {isLoadingMore ? 'Cargando...' : 'Cargar más conversaciones'}
              </span>
              <span className="sm:hidden">
                {isLoadingMore ? 'Cargando...' : 'Cargar más'}
              </span>
            </Button>
          </div>
        )}
      </div>

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La conversación será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConversation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default PatientConversationHistory