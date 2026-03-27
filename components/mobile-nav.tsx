"use client"

import { useState, useEffect } from "react"
import {
  PlusIcon,
  ClockIcon,
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
      console.log('📱 Mobile: Preparando nueva conversación (sin crear sesión hasta enviar)...')
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
      console.error('❌ Mobile: Error seleccionando conversación:', err)
    }
  }

  // Manejar eliminación de conversación
  const handleDeleteConversation = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await deleteConversation(sessionId)
    } catch (err) {
      console.error('❌ Mobile: Error eliminando conversación:', err)
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
          
          <SheetContent side="left" className="w-80 p-0 backdrop-blur-sm border-r paper-noise overflow-hidden bg-gradient-to-b from-secondary/40 via-secondary/30 to-secondary/20 border-border/60 shadow-sm">
            <div className="flex flex-col h-full relative">
              {/* Subtle accent line */}
              <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
              
              {/* Navigation Icons - Mobile optimized */}
              <div className="flex flex-col flex-shrink-0 p-4 py-5 gap-3 overflow-visible border-b border-ash/50">
                {/* Nueva consulta button */}
                <Button
                  onClick={handleNewConversation}
                  disabled={isCreatingSession}
                  className={cn(
                    "w-full h-12 px-4 gap-3 justify-start rounded-xl font-medium",
                    "bg-clarity-blue-600 text-white hover:bg-clarity-blue-700",
                    "shadow-sm active:scale-[0.98] transition-transform"
                  )}
                >
                  <PlusIcon className="h-5 w-5 flex-shrink-0" weight="bold" />
                  <span className="text-sm">
                    {isCreatingSession ? 'Creando...' : 'Nueva consulta'}
                  </span>
                </Button>

                {/* Consultas button */}
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab('conversations')}
                  className={cn(
                    "w-full h-11 px-4 gap-3 justify-start rounded-xl font-medium relative transition-all duration-200",
                    "active:scale-[0.98]",
                    activeTab === 'conversations'
                      ? "bg-clarity-blue-50 text-clarity-blue-600 hover:bg-clarity-blue-100"
                      : "text-mineral-gray-600 hover:text-deep-charcoal hover:bg-ash"
                  )}
                >
                  {/* Active indicator */}
                  {activeTab === 'conversations' && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-clarity-blue-600 rounded-r-full" />
                  )}
                  <ChatsCircleIcon className="h-5 w-5 flex-shrink-0" weight="bold" />
                  <span className="text-sm">Consultas</span>
                </Button>

                {/* Casos clínicos button */}
                <Button
                  variant="ghost"
                  onClick={() => setActiveTab('patients')}
                  className={cn(
                    "w-full h-11 px-4 gap-3 justify-start rounded-xl font-medium relative transition-all duration-200",
                    "active:scale-[0.98]",
                    activeTab === 'patients'
                      ? "bg-clarity-blue-50 text-clarity-blue-600 hover:bg-clarity-blue-100"
                      : "text-mineral-gray-600 hover:text-deep-charcoal hover:bg-ash"
                  )}
                >
                  {/* Active indicator */}
                  {activeTab === 'patients' && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-clarity-blue-600 rounded-r-full" />
                  )}
                  <FoldersIcon className="h-5 w-5 flex-shrink-0" weight="bold" />
                  <span className="text-sm">Casos clínicos</span>
                </Button>
              </div>

              {/* Section header */}
              <div className="px-5 py-3 flex-shrink-0 border-b border-ash/30">
                <h2 className="text-xs text-mineral-gray-600 font-sans font-semibold tracking-wider uppercase whitespace-nowrap">
                  {activeTab === 'conversations' ? 'Conversaciones recientes' : 'Casos clínicos'}
                </h2>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === 'conversations' ? (
                  <div className="h-full overflow-hidden relative">
                    <div onScroll={handleScroll} className="h-full overflow-y-auto scrollbar-hide">
                      <div className="px-3 py-5 space-y-1.5">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <ArrowClockwiseIcon className="h-5 w-5 animate-spin text-clarity-blue-600" weight="bold" />
                              <span className="text-sm text-muted-foreground font-medium">Cargando conversaciones...</span>
                            </div>
                          </div>
                        ) : conversations.length === 0 ? (
                          <div className="text-center py-12 px-4 text-mineral-gray-600">
                            <div className="bg-ash rounded-xl p-6">
                              <ChatsCircleIcon className="h-10 w-10 mx-auto mb-3 opacity-40" weight="duotone" />
                              <p className="text-sm font-medium">
                                No hay conversaciones aún
                              </p>
                              <p className="text-xs mt-1 opacity-70">
                                Inicia una nueva consulta
                              </p>
                            </div>
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
                                    "justify-start p-3 pr-12 h-auto text-left rounded-xl",
                                    "hover:bg-secondary hover:shadow-sm active:scale-[0.98]"
                                  )}
                                  onClick={() => handleConversationSelect(conversation.sessionId)}
                                >
                                  <div className="flex items-start gap-3 w-full pl-2 min-w-0">
                                    <div className={cn(
                                      "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                      agentConfig.button.bg,
                                      "ring-2 ring-background"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-sans text-sm truncate leading-snug text-foreground font-medium min-w-0">
                                        {conversation.title}
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-1.5 min-w-0 flex items-center gap-1.5">
                                        <ClockIcon className="h-3 w-3 opacity-60 flex-shrink-0" weight="bold" />
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
                                        "absolute top-1/2 -translate-y-1/2 right-2 h-8 w-8 rounded-lg z-10",
                                        "opacity-0 group-hover:opacity-100 transition-all duration-200",
                                        "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      )}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <TrashIcon className="h-4 w-4" weight="bold" />
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
                          <div className="flex items-center justify-center py-6">
                            <div className="flex items-center gap-2.5 text-sm text-muted-foreground bg-secondary/40 px-4 py-2.5 rounded-full border border-border/40">
                              <ArrowClockwiseIcon className="h-4 w-4 animate-spin text-primary" weight="bold" />
                              <span className="font-medium">Cargando más...</span>
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
                        console.log('📱 Mobile: Conversación seleccionada desde historial de paciente:', sessionId);
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
              console.log('📱 Mobile: Generación de ficha solicitada desde panel')
            }}
            isGenerating={false}
          />
        )}
    </>
  )
}
