"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  PlusIcon,
  ClockIcon,
  ChatsCircleIcon,
  TrashIcon,
  ArrowClockwiseIcon,
  FoldersIcon,
  EyeIcon,
  NotebookIcon,
  MicroscopeIcon,
  LightningIcon
} from "@phosphor-icons/react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { cn } from "@/lib/utils"
import { useConversationHistory } from "@/hooks/use-conversation-history"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import type { AgentType, PatientRecord } from "@/types/clinical-types"
import { getAgentVisualConfig } from "@/config/agent-visual-config"
import { PatientLibrarySection } from "@/components/patient-library-section"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeTab?: 'conversations' | 'patients'
  onActiveTabChange?: (tab: 'conversations' | 'patients') => void
  userId?: string
  createSession?: (userId: string, mode: any, agent: any) => Promise<string | null>
  onConversationSelect?: (sessionId: string) => void
  onPatientConversationStart?: (patient: PatientRecord) => void
  onClearPatientContext?: () => void
  clearPatientSelectionTrigger?: number
  onNewChat?: () => void
  hasOpenDialog?: boolean
}

// Mapeo de agentes para compatibilidad con el sistema anterior
const agentIcons = {
  'socratico': EyeIcon,
  'clinico': NotebookIcon,
  'academico': MicroscopeIcon,
  'orquestador': LightningIcon,
}

const agentLabels = {
  'socratico': 'Socrático',
  'clinico': 'Clínico',
  'academico': 'Académico',
  'orquestador': 'Orquestador',
}

export function Sidebar({ isOpen, onToggle, activeTab: activeTabProp, onActiveTabChange, userId, createSession: createSessionProp, onConversationSelect, onPatientConversationStart, onClearPatientContext, clearPatientSelectionTrigger, onNewChat, hasOpenDialog }: SidebarProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [hasOpenPatientDialog, setHasOpenPatientDialog] = useState(false)
  
  // Usar estado controlado si se proporciona, de lo contrario usar estado local
  const [internalActiveTab, setInternalActiveTab] = useState<'conversations' | 'patients'>('conversations')
  const activeTab = activeTabProp !== undefined ? activeTabProp : internalActiveTab
  const setActiveTab = onActiveTabChange || setInternalActiveTab
  
  // Combinar el estado de diálogos externo e interno
  const shouldPreventAutoClose = hasOpenDialog || hasOpenPatientDialog
  
  // Hooks para gestión de conversaciones
  const {
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

    clearError,
    refreshConversations
  } = useConversationHistory()
  
  const { createSession, loadSession, systemState } = useHopeAISystem()
  
  // Cargar conversaciones al montar el componente
  useEffect(() => {
    const effectiveUserId = userId || systemState.userId
    if (effectiveUserId && isOpen && conversations.length === 0 && !isLoading) {
      loadConversations(effectiveUserId)
    }
  }, [userId, systemState.userId, isOpen, loadConversations, isLoading, conversations.length])

  // Detectar scroll para lazy loading
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight
    
    // Cargar más cuando se llega al 80% del scroll
    if (scrollPercentage > 0.8 && hasNextPage && !isLoadingMore) {
      loadMoreConversations()
    }
  }, [hasNextPage, isLoadingMore, loadMoreConversations])
  
  // Usar todas las conversaciones sin filtrado
  const filteredConversations = conversations
  
  // Manejar selección de conversación
  const handleConversationSelect = async (sessionId: string) => {
    try {
      setSelectedConversation(sessionId)
      
      // Usar la función proporcionada por el componente padre si está disponible
      if (onConversationSelect) {
        await onConversationSelect(sessionId)
      } else {
        // Fallback a la lógica anterior si no se proporciona la función
        const success = await loadSession(sessionId)
        
        if (!success) {
          setSelectedConversation(null)
        }
      }
    } catch (err) {
      logger.error('❌ Error al cargar la conversación:', err)
      setSelectedConversation(null)
    }
  }
  
  // Estado para prevenir creación múltiple simultánea
  const [isCreatingSession, setIsCreatingSession] = useState(false)

  // Abrir y navegar a una sección específica cuando el sidebar está colapsado
  const handleCollapsedOpenTo = useCallback((tab: 'conversations' | 'patients') => {
    setActiveTab(tab)
    if (!isOpen) {
      onToggle()
    }
  }, [isOpen, onToggle])

  // Manejar nueva conversación con patrón de transacción atómica
  const handleNewConversation = async () => {
    // Prevenir múltiples ejecuciones simultáneas
    if (isCreatingSession) {
      return
    }

    try {
      setIsCreatingSession(true)
      const effectiveUserId = userId || systemState.userId
      
      // No crear sesión aquí. Limpiar selección y delegar al padre para resetear estado.
      setSelectedConversation(null)
      onNewChat?.()
    } catch (err) {
      logger.error('❌ Sidebar: Error en transacción de nueva conversación:', err)
    } finally {
      setIsCreatingSession(false)
    }
  }
  
  // Manejar eliminación de conversación
  const handleDeleteConversation = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await deleteConversation(sessionId)
      if (selectedConversation === sessionId) {
        setSelectedConversation(null)
      }
    } catch (err) {
      logger.error('Error al eliminar conversación:', err)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col relative backdrop-blur-md overflow-hidden",
        "bg-sidebar/90 border-r border-border/30",
        "h-full",
        isOpen ? "w-72" : "w-14",
      )}
      style={{
        transition: 'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1)'
      }}
      onMouseEnter={() => !isOpen && onToggle()}
      onMouseLeave={() => isOpen && !shouldPreventAutoClose && onToggle()}
      role="navigation"
      aria-label="Navegación principal y biblioteca de casos"
    >
      {/* Navigation Icons - Always visible */}
      <div className="flex flex-col flex-shrink-0 p-2.5 py-4 gap-1.5 overflow-visible border-b border-border/30">
        {/* Nueva consulta button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip open={isOpen ? false : undefined}>
            <TooltipTrigger asChild>
              <Button
                onClick={isOpen ? handleNewConversation : onToggle}
                disabled={isOpen && isCreatingSession}
                onMouseEnter={(e) => {
                  if (isOpen) {
                    e.preventDefault()
                  }
                }}
                className={cn(
                  "h-9 rounded-lg font-medium relative",
                  "bg-foreground/90 text-background hover:bg-foreground/80",
                  isOpen
                    ? "w-full px-3 gap-2.5 justify-start"
                    : "w-9 px-0 justify-center"
                )}
                style={{
                  transition: 'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1), padding 350ms cubic-bezier(0.25, 0.1, 0.25, 1), gap 350ms cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              >
                <PlusIcon className="h-4 w-4 flex-shrink-0" weight="bold" />
                {isOpen && (
                  <span
                    className="text-xs whitespace-nowrap overflow-hidden"
                    style={{
                      transition: 'opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1) 120ms'
                    }}
                    aria-hidden={!isOpen}
                  >
                    Nueva consulta
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" className="font-sans text-xs">
                Nueva consulta
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Consultas (Historial) button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip open={isOpen ? false : undefined}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={() => {
                  setActiveTab('conversations')
                  if (!isOpen) onToggle()
                }}
                onMouseEnter={(e) => {
                  if (isOpen) {
                    e.preventDefault()
                  }
                }}
                className={cn(
                  "h-9 rounded-lg font-medium relative transition-colors duration-150",
                  isOpen
                    ? "w-full px-3 gap-2.5 justify-start"
                    : "w-9 px-0 justify-center",
                  activeTab === 'conversations'
                    ? "bg-secondary text-foreground/90 hover:bg-secondary/80"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
                style={{
                  transition: 'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1), padding 350ms cubic-bezier(0.25, 0.1, 0.25, 1), gap 350ms cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              >
                {/* Active indicator */}
                {activeTab === 'conversations' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/60 rounded-r-full" />
                )}
                <ChatsCircleIcon className="h-4 w-4 flex-shrink-0" weight="bold" />
                {isOpen && (
                  <span
                    className="text-xs whitespace-nowrap overflow-hidden"
                    style={{
                      transition: 'opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1) 120ms'
                    }}
                  >
                    Consultas
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" className="font-sans text-xs">
                Historial de consultas
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Pacientes (Biblioteca) button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip open={isOpen ? false : undefined}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={() => {
                  setActiveTab('patients')
                  if (!isOpen) onToggle()
                }}
                onMouseEnter={(e) => {
                  if (isOpen) {
                    e.preventDefault()
                  }
                }}
                className={cn(
                  "h-9 rounded-lg font-medium relative transition-colors duration-150",
                  isOpen
                    ? "w-full px-3 gap-2.5 justify-start"
                    : "w-9 px-0 justify-center",
                  activeTab === 'patients'
                    ? "bg-secondary text-foreground/90 hover:bg-secondary/80"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                )}
                style={{
                  transition: 'width 350ms cubic-bezier(0.25, 0.1, 0.25, 1), padding 350ms cubic-bezier(0.25, 0.1, 0.25, 1), gap 350ms cubic-bezier(0.25, 0.1, 0.25, 1)'
                }}
              >
                {/* Active indicator */}
                {activeTab === 'patients' && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-foreground/60 rounded-r-full" />
                )}
                <FoldersIcon className="h-4 w-4 flex-shrink-0" weight="bold" />
                {isOpen && (
                  <span
                    className="text-xs whitespace-nowrap overflow-hidden"
                    style={{
                      transition: 'opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1) 120ms'
                    }}
                  >
                    Casos clínicos
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right" className="font-sans text-xs">
                Casos clínicos
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Section header - always rendered, visible only when expanded */}
      <div
        className={cn(
          "px-4 py-3 flex-shrink-0 border-b border-border/20 overflow-hidden",
          isOpen ? "h-auto opacity-100" : "h-0 opacity-0"
        )}
        style={{
          transition: 'height 350ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity 250ms cubic-bezier(0.25, 0.1, 0.25, 1)'
        }}
      >
        <h2 className="text-[11px] text-muted-foreground/60 font-sans font-medium tracking-widest uppercase whitespace-nowrap">
          {activeTab === 'conversations' ? 'Recientes' : 'Casos clínicos'}
        </h2>
      </div>

      {/* Tab Content - always rendered, visibility controlled by clip-path */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{
          clipPath: isOpen ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: 'clip-path 350ms cubic-bezier(0.25, 0.1, 0.25, 1)'
        }}
      >
          {activeTab === 'conversations' ? (
            <div className="h-full overflow-hidden relative">
              <div onScroll={handleScroll} className="h-full overflow-y-auto scrollbar-hide">
              <div className="px-2.5 py-3 space-y-0.5">
                {isLoading && isOpen ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <ArrowClockwiseIcon className="h-4 w-4 animate-spin text-muted-foreground" weight="bold" />
                      <span className="text-xs text-muted-foreground/60">Cargando...</span>
                    </div>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  isOpen && (
                    <div className="text-center py-12 px-4">
                      <ChatsCircleIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" weight="duotone" />
                      <p className="text-xs text-muted-foreground/60">
                        Sin conversaciones
                      </p>
                    </div>
                  )
                ) : (
                  filteredConversations.map((conversation) => {
                    const agentConfig = getAgentVisualConfig(conversation.activeAgent as AgentType)
                    
                    return (
                      <div key={conversation.sessionId} className="relative group">
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full transition-colors duration-150 relative overflow-visible",
                            isOpen ? "justify-start p-2.5 pr-10 h-auto text-left rounded-lg" : "justify-center p-2 h-9 rounded-lg",
                            selectedConversation === conversation.sessionId
                              ? "bg-secondary hover:bg-secondary/80"
                              : "hover:bg-secondary/50",
                          )}
                          onClick={() => handleConversationSelect(conversation.sessionId)}
                          title={!isOpen ? conversation.title : undefined}
                        >
                          {/* Accent border on active */}
                          {selectedConversation === conversation.sessionId && isOpen && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground/50 rounded-r-full" />
                          )}
                          {isOpen ? (
                            <div className="flex items-start gap-2.5 w-full pl-1.5 min-w-0">
                              <div className={cn(
                                "mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0",
                                agentConfig.button.bg
                              )} />
                              <div className="flex-1 min-w-0">
                                <div className="font-sans text-[13px] truncate leading-snug text-foreground/80 min-w-0">
                                  {conversation.title}
                                </div>
                                <div className="text-[11px] text-muted-foreground/50 mt-0.5 min-w-0 truncate">
                                  {formatDistanceToNow(new Date(conversation.lastUpdated), {
                                    addSuffix: true,
                                    locale: es
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className={cn("w-1.5 h-1.5 rounded-full", agentConfig.button.bg)} />
                          )}
                        </Button>
                        
                        {isOpen && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className={cn(
                                  "absolute top-1/2 -translate-y-1/2 right-1 h-7 w-7 rounded-md z-10",
                                  "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                                  "text-muted-foreground/40 hover:text-destructive/70 hover:bg-destructive/5"
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <TrashIcon className="h-3.5 w-3.5" weight="bold" />
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
                                  onClick={(e) => handleDeleteConversation(conversation.sessionId, e)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )
                  })
                )}
                
                {isLoadingMore && (
                  <div className="flex items-center justify-center py-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                      <ArrowClockwiseIcon className="h-3 w-3 animate-spin" weight="bold" />
                      <span>Cargando...</span>
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          ) : (
            <PatientLibrarySection 
              isOpen={isOpen}
              onStartConversation={(patient) => {
                onPatientConversationStart?.(patient)
              }}
              onClearPatientContext={onClearPatientContext}
              clearSelectionTrigger={clearPatientSelectionTrigger}
              onPatientSelect={(patient) => {
                // Handle patient selection if needed
              }}
              onConversationSelect={onConversationSelect}
              onDialogOpenChange={setHasOpenPatientDialog}
            />
          )}
        </div>

    </div>
  )
}
