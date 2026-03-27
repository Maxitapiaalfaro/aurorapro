"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { 
  Search, 
  MessageSquare, 
  Trash2, 
  RefreshCw, 
  Filter,
  Calendar,
  User,
  Brain,
  FileText,
  Microscope,
  Zap
} from "lucide-react"
import { useConversationHistory } from "@/hooks/use-conversation-history"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import type { AgentType, ClinicalMode } from "@/types/clinical-types"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface ConversationHistoryListProps {
  userId: string
  onConversationSelect?: (sessionId: string) => void
  className?: string
}

// Aurora Branding: Import centralized agent visual config
import { getAgentVisualConfig } from "@/config/agent-visual-config"

// Legacy mapping for backward compatibility - now uses Aurora palette
const agentConfig = {
  'socratico': {
    icon: Brain,
    label: 'Perspectiva',
    color: 'bg-clarity-blue-100 text-clarity-blue-800 border-clarity-blue-200'
  },
  'clinico': {
    icon: FileText,
    label: 'Memoria',
    color: 'bg-serene-teal-100 text-serene-teal-800 border-serene-teal-200'
  },
  'academico': {
    icon: Microscope,
    label: 'Evidencia',
    color: 'bg-academic-plum-100 text-academic-plum-800 border-academic-plum-200'
  },
  'orquestador': {
    icon: Zap,
    label: 'Coordinación',
    color: 'bg-mineral-gray/20 text-deep-charcoal border-mineral-gray'
  }
} as const

// Mapeo de modos clínicos - Aurora palette
const modeConfig = {
  'therapeutic_assistance': {
    label: 'Asistencia Terapéutica',
    color: 'bg-clarity-blue-100 dark:bg-clarity-blue-900/30 text-clarity-blue-800 dark:text-clarity-blue-200'
  },
  'clinical_supervision': {
    label: 'Supervisión Clínica',
    color: 'bg-serene-teal-100 dark:bg-serene-teal-900/30 text-serene-teal-800 dark:text-serene-teal-200'
  },
  'research_support': {
    label: 'Soporte de Investigación',
    color: 'bg-academic-plum-100 dark:bg-academic-plum-900/30 text-academic-plum-800 dark:text-academic-plum-200'
  }
} as const

export function ConversationHistoryList({ 
  userId, 
  onConversationSelect,
  className = ""
}: ConversationHistoryListProps) {
  const {
    conversations,
    isLoading,
    error,
    loadConversations,
    openConversation,
    deleteConversation,
    searchConversations,
    filterByAgent,
    filterByMode,
    clearError,
    refreshConversations
  } = useConversationHistory()

  const { } = useHopeAISystem()

  // Estados locales para filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedAgent, setSelectedAgent] = useState<AgentType | 'all'>('all')
  const [selectedMode, setSelectedMode] = useState<ClinicalMode | 'all'>('all')
  const [filteredConversations, setFilteredConversations] = useState(conversations)

  // Cargar conversaciones al montar el componente
  useEffect(() => {
    if (userId) {
      loadConversations(userId)
    }
  }, [userId, loadConversations])

  // Aplicar filtros cuando cambien los criterios
  useEffect(() => {
    let filtered = conversations
    
    // Aplicar búsqueda
    if (searchQuery.trim()) {
      filtered = searchConversations(searchQuery)
    }
    
    // Aplicar filtro de agente
    if (selectedAgent !== 'all') {
      filtered = filterByAgent(selectedAgent)
    }
    
    // Aplicar filtro de modo
    if (selectedMode !== 'all') {
      filtered = filterByMode(selectedMode)
    }
    
    setFilteredConversations(filtered)
  }, [conversations, searchQuery, selectedAgent, selectedMode, searchConversations, filterByAgent, filterByMode])

  // Manejar selección de conversación
  const handleConversationSelect = async (sessionId: string) => {
    try {
      const chatState = await openConversation(sessionId)
      if (chatState) {
        // TODO: Implementar loadSession cuando esté disponible en useHopeAISystem
        onConversationSelect?.(sessionId)
      }
    } catch (err) {
      console.error('Error al cargar la conversación:', err)
    }
  }

  // Manejar eliminación de conversación
  const handleDeleteConversation = async (sessionId: string) => {
    await deleteConversation(sessionId)
  }

  // Limpiar todos los filtros
  const clearFilters = () => {
    setSearchQuery("")
    setSelectedAgent('all')
    setSelectedMode('all')
  }

  if (error) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <MessageSquare className="h-5 w-5" />
            Error en Historial
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="flex gap-2">
            <Button onClick={clearError} variant="outline">
              Limpiar Error
            </Button>
            <Button onClick={refreshConversations} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Historial de Conversaciones
            <Badge variant="secondary">{filteredConversations.length}</Badge>
          </div>
          <Button 
            onClick={refreshConversations} 
            variant="ghost" 
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        
        {/* Controles de búsqueda y filtros */}
        <div className="space-y-3">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar conversaciones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Filtros */}
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedAgent} onValueChange={(value) => setSelectedAgent(value as AgentType | 'all')}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por agente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los agentes</SelectItem>
                <SelectItem value="socratico">Supervisor Clínico</SelectItem>
                <SelectItem value="clinico">Especialista en Documentación</SelectItem>
                <SelectItem value="academico">Investigador Académico</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedMode} onValueChange={(value) => setSelectedMode(value as ClinicalMode | 'all')}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filtrar por modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los modos</SelectItem>
                <SelectItem value="therapeutic_assistance">Asistencia Terapéutica</SelectItem>
                <SelectItem value="clinical_supervision">Supervisión Clínica</SelectItem>
                <SelectItem value="research_support">Soporte de Investigación</SelectItem>
              </SelectContent>
            </Select>
            
            {(searchQuery || selectedAgent !== 'all' || selectedMode !== 'all') && (
              <Button onClick={clearFilters} variant="outline" size="sm">
                Limpiar Filtros
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="paper-noise">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span className="font-sans">Cargando conversaciones...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-sans text-lg font-medium mb-2">
              {conversations.length === 0 ? 'No hay conversaciones' : 'No se encontraron conversaciones'}
            </p>
            <p className="font-sans text-sm">
              {conversations.length === 0 
                ? 'Inicia una nueva conversación para comenzar'
                : 'Intenta ajustar los filtros de búsqueda'
              }
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {filteredConversations.map((conversation, index) => {
                const AgentIcon = agentConfig[conversation.activeAgent]?.icon || User
                const agentStyle = agentConfig[conversation.activeAgent]?.color || 'bg-gray-100 text-gray-800'
                const modeStyle = modeConfig[conversation.mode]?.color || 'bg-gray-100 text-gray-800'
                
                return (
                  <div key={conversation.sessionId}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div 
                            className="flex-1 min-w-0"
                            onClick={() => handleConversationSelect(conversation.sessionId)}
                          >
                            {/* Título y badges */}
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-sans font-medium text-sm truncate flex-1">
                                {conversation.title}
                              </h3>
                              <Badge className={`text-xs ${agentStyle}`}>
                                <AgentIcon className="h-3 w-3 mr-1" />
                                {agentConfig[conversation.activeAgent]?.label || conversation.activeAgent}
                              </Badge>
                            </div>
                            
                            {/* Preview del último mensaje */}
                            <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                              {conversation.preview}
                            </p>
                            
                            {/* Metadatos */}
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDistanceToNow(new Date(conversation.lastUpdated), { 
                                  addSuffix: true, 
                                  locale: es 
                                })}
                              </div>
                              <div className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {conversation.messageCount} mensajes
                              </div>
                              <Badge variant="outline" className={`text-xs ${modeStyle}`}>
                                {modeConfig[conversation.mode]?.label || conversation.mode}
                              </Badge>
                            </div>
                          </div>
                          
                          {/* Botón de eliminar */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="ml-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta acción no se puede deshacer. La conversación "{conversation.title}" 
                                  será eliminada permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteConversation(conversation.sessionId)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                    {index < filteredConversations.length - 1 && <Separator className="my-2" />}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}