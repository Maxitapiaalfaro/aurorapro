"use client"

import { useState, useEffect } from "react"
import {
  PlusIcon,
  ChatsCircleIcon,
  TrashIcon,
  ArrowClockwiseIcon,
  FoldersIcon
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
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
import { ClinicalMode, AgentType, PatientRecord } from "@/types/clinical-types"
import { PatientLibrarySection } from "@/components/patient-library-section"
import { FichaClinicaPanel } from "@/components/patient-library/FichaClinicaPanel"
import { useConversationHistory } from "@/hooks/use-conversation-history"
import { usePatientLibrary } from "@/hooks/use-patient-library"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

interface MobileNavProps {
  userId: string
  createSession: (userId: string, mode: ClinicalMode, agent: AgentType) => Promise<string | null>
  onConversationSelect: (sessionId: string) => Promise<void>
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onPatientConversationStart?: (patient: PatientRecord) => void
  onClearPatientContext?: () => void
  clearPatientSelectionTrigger?: number
  onNewChat?: () => void
  initialTab?: 'conversations' | 'patients'
}

// Mapeo de agentes para etiquetas legibles
const agentLabels: Record<string, string> = {
  socratico: 'Socrático',
  archivista: 'Archivista',
  investigador: 'Investigador'
}

export function MobileNav({ userId, createSession, onConversationSelect, isOpen: externalIsOpen, onOpenChange: externalOnOpenChange, onPatientConversationStart, onClearPatientContext, clearPatientSelectionTrigger, onNewChat, initialTab = 'conversations' }: MobileNavProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [activeTab, setActiveTab] = useState<'conversations' | 'patients'>(initialTab)

  // Estado para manejar la ficha clínica en mobile
  const [fichaPatient, setFichaPatient] = useState<PatientRecord | null>(null)
  const [isFichaOpen, setIsFichaOpen] = useState(false)

  // Usar estado externo si está disponible, sino usar estado interno
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalOnOpenChange || setInternalIsOpen

  // Hook para gestión de conversaciones
  const {
    conversations,
    isLoading,
    isLoadingMore,
    error,
    hasNextPage,
    loadConversations,
    loadMoreConversations,
    deleteConversation,
    refreshConversations
  } = useConversationHistory()

  // Hooks para gestión de fichas clínicas
  const { loadFichasClinicas, fichasClinicas, selectPatient } = usePatientLibrary()
  const { systemState } = useHopeAISystem()

  // Cargar conversaciones cuando se abre el sheet
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && conversations.length === 0) {
      loadConversations(userId)
    }
  }

  // Efecto para cargar conversaciones cuando se abre externamente
  useEffect(() => {
    if (isOpen && conversations.length === 0) {
      loadConversations(userId)
    }
  }, [isOpen, conversations.length, loadConversations, userId])

  // Efecto para actualizar tab cuando cambia initialTab
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  // Manejar nueva conversación
  const handleNewConversation = async () => {
    if (isCreatingSession) return
    try {
      setIsCreatingSession(true)
      logger.info('📱 Mobile: Preparando nueva conversación (sin crear sesión hasta enviar)...')
      // Solo cerrar el sheet; la sesión se creará al enviar el primer mensaje
      setIsOpen(false)
      onNewChat?.()
    } finally {
      setIsCreatingSession(false)
    }
  }

  // Manejar selección de conversación
  const handleConversationSelect = async (sessionId: string) => {
    try {
      await onConversationSelect(sessionId)
      setIsOpen(false) // Cerrar el sheet después de seleccionar
    } catch (err) {
      logger.error('❌ Mobile: Error seleccionando conversación:', err)
    }
  }

  // Manejar eliminación de conversación
  const handleDeleteConversation = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await deleteConversation(sessionId)
    } catch (err) {
      logger.error('❌ Mobile: Error eliminando conversación:', err)
    }
  }

  // Scroll infinito para cargar más conversaciones
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
    const isNearBottom = scrollHeight - scrollTop <= clientHeight * 1.5

    if (isNearBottom && hasNextPage && !isLoadingMore) {
      loadMoreConversations()
    }
  }

  // Handler para abrir ficha clínica desde PatientLibrarySection
  const handleOpenFicha = async (patient: PatientRecord) => {
    // Establecer el contexto del paciente
    selectPatient(patient)

    // CRÍTICO: Propagar al sistema HopeAI para establecer el contexto clínico completo
    // Esto asegura que cualquier actualización de ficha ocurra en el contexto correcto
    if (onPatientConversationStart) {
      onPatientConversationStart(patient)
    }

    // Cargar fichas y abrir el panel
    await loadFichasClinicas(patient.id)
    setFichaPatient(patient)
    setIsFichaOpen(true)

    // NO cerrar el MobileNav aquí - el panel de ficha ocupa toda la pantalla
    // y el usuario nunca ve el MobileNav detrás de él
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
          
          <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 backdrop-blur-md border-r border-border/20 overflow-hidden bg-background/95 shadow-xl">
            <div className="flex flex-col h-full relative">
              
              {/* Navigation Icons - Mobile optimized */}
              <div className="flex flex-col flex-shrink-0 p-4 py-5 gap-2 overflow-visible border-b border-border/20">
                {/* Nueva consulta button */}
                <Button
                  onClick={handleNewConversation}
                  disabled={isCreatingSession}
                  className={cn(
                    "w-full h-11 px-4 gap-3 justify-start rounded-xl font-medium",
                    "bg-secondary text-foreground/80 hover:bg-secondary/70 border border-border/30",
                    "active:scale-[0.98] transition-all"
                  )}
                >
                  <PlusIcon className="h-4.5 w-4.5 flex-shrink-0" weight="regular" />
                  <span className="text-[13px]">
                    {isCreatingSession ? 'Creando...' : 'Nueva consulta'}
                  </span>
                </Button>

                {/* Consultas button */}
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab('conversations')}
                  className={cn(
                    "w-full h-10 px-4 gap-3 justify-start rounded-xl font-medium relative transition-all duration-200",
                    "active:scale-[0.98]",
                    activeTab === 'conversations'
                      ? "bg-secondary/60 text-foreground/80 hover:bg-secondary/50"
                      : "text-muted-foreground/60 hover:text-foreground/70 hover:bg-secondary/30"
                  )}
                >
                  {/* Active indicator */}
                  {activeTab === 'conversations' && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground/25 rounded-r-full" />
                  )}
                  <ChatsCircleIcon className="h-4.5 w-4.5 flex-shrink-0" weight="regular" />
                  <span className="text-[13px]">Consultas</span>
                </Button>

                {/* Casos clínicos button */}
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab('patients')}
                  className={cn(
                    "w-full h-10 px-4 gap-3 justify-start rounded-xl font-medium relative transition-all duration-200",
                    "active:scale-[0.98]",
                    activeTab === 'patients'
                      ? "bg-secondary/60 text-foreground/80 hover:bg-secondary/50"
                      : "text-muted-foreground/60 hover:text-foreground/70 hover:bg-secondary/30"
                  )}
                >
                  {/* Active indicator */}
                  {activeTab === 'patients' && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground/25 rounded-r-full" />
                  )}
                  <FoldersIcon className="h-4.5 w-4.5 flex-shrink-0" weight="regular" />
                  <span className="text-[13px]">Casos clínicos</span>
                </Button>
              </div>

              {/* Section header */}
              <div className="px-5 py-2.5 flex-shrink-0 border-b border-border/15">
                <h2 className="text-[10px] text-muted-foreground/40 font-sans font-medium tracking-[0.12em] uppercase whitespace-nowrap">
                  {activeTab === 'conversations' ? 'Conversaciones recientes' : 'Casos clínicos'}
                </h2>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === 'conversations' ? (
                  <div className="h-full overflow-hidden relative">
                    <div onScroll={handleScroll} className="h-full overflow-y-auto scrollbar-hide">
                      <div className="px-3 py-4 space-y-1">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="flex flex-col items-center gap-2">
                              <ArrowClockwiseIcon className="h-4 w-4 animate-spin text-muted-foreground/40" weight="regular" />
                              <span className="text-[11px] text-muted-foreground/40">Cargando conversaciones...</span>
                            </div>
                          </div>
                        ) : conversations.length === 0 ? (
                          <div className="text-center py-12 px-4">
                            <ChatsCircleIcon className="h-8 w-8 mx-auto mb-2.5 text-muted-foreground/15" weight="light" />
                            <p className="text-[13px] text-muted-foreground/50 font-medium">
                                No hay conversaciones aún
                            </p>
                            <p className="text-[11px] mt-1 text-muted-foreground/30">
                                Inicia una nueva consulta
                            </p>
                          </div>
                        ) : (
                          conversations.map((conversation) => {
                            const agentConfig = getAgentVisualConfigSafe(conversation.activeAgent as AgentType)

                            return (
                              <div key={conversation.sessionId} className="relative group">
                                <Button
                                  variant="ghost"
                                  className={cn(
                                    "w-full transition-all duration-200 relative overflow-visible",
                                    "justify-start p-3 pr-11 h-auto text-left rounded-lg",
                                    "hover:bg-secondary/40 active:scale-[0.98]"
                                  )}
                                  onClick={() => handleConversationSelect(conversation.sessionId)}
                                >
                                  <div className="flex items-start gap-2.5 w-full pl-1.5 min-w-0">
                                    <div className={cn(
                                      "mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0",
                                      agentConfig.button.bg,
                                    )} />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-sans text-[13px] truncate leading-snug text-foreground/70 font-medium min-w-0">
                                        {conversation.title}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/35 mt-1 min-w-0 flex items-center gap-1.5">
                                        <span className="truncate">
                                          {formatDistanceToNow(new Date(conversation.lastUpdated), {
                                            addSuffix: true,
                                            locale: es
                                          })}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn(
                                        "absolute top-1/2 -translate-y-1/2 right-1.5 h-7 w-7 rounded-md z-10",
                                        "opacity-0 group-hover:opacity-100 transition-all duration-200",
                                        "text-muted-foreground/30 hover:text-destructive/60 hover:bg-destructive/5"
                                      )}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <TrashIcon className="h-3.5 w-3.5" weight="regular" />
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
                              </div>
                            )
                          })
                        )}

                        {isLoadingMore && (
                          <div className="flex items-center justify-center py-4">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/35">
                              <ArrowClockwiseIcon className="h-3 w-3 animate-spin" weight="regular" />
                              <span>Cargando más...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    <PatientLibrarySection
                      isOpen={true}
                      onPatientSelect={() => {
                        // Patient selected but no automatic conversation start
                        // User must explicitly start conversation
                      }}
                      onStartConversation={(patient) => {
                        onPatientConversationStart?.(patient)
                        setIsOpen(false)
                      }}
                      onClearPatientContext={onClearPatientContext}
                      clearSelectionTrigger={clearPatientSelectionTrigger}
                      onConversationSelect={async (sessionId: string) => {
                        // Handle conversation selection from patient history modal
                        logger.info('📱 Mobile: Conversación seleccionada desde historial de paciente:', sessionId);
                        await onConversationSelect(sessionId);
                        setIsOpen(false); // Close mobile nav after selecting conversation
                      }}
                      onOpenFicha={handleOpenFicha}
                    />
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Ficha Clínica Panel - Renderizado fuera del Sheet para que no se cierre cuando el Sheet se cierra */}
        {fichaPatient && (
          <FichaClinicaPanel
            open={isFichaOpen}
            onOpenChange={(open) => setIsFichaOpen(open)}
            patient={fichaPatient}
            fichas={fichasClinicas as any}
            onRefresh={async () => {
              if (fichaPatient) {
                await loadFichasClinicas(fichaPatient.id)
              }
            }}
            onGenerate={async () => {
              // En mobile, la generación de ficha se maneja desde el chat
              // Este callback no debería ser llamado, pero lo dejamos por compatibilidad
              logger.info('📱 Mobile: Generación de ficha solicitada desde panel')
            }}
            isGenerating={false}
          />
        )}
    </>
  )
}
