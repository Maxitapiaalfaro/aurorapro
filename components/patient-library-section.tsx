"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Search,
  Users,
  MessageSquare,
  Trash2,
  Edit,
  User,
  Tag,
  Calendar,
  RefreshCw,
  X,
  Clock,
  MoreVertical,
  BarChart3,
  FileText
} from "lucide-react"
import { cn } from "@/lib/utils"
import { usePatientLibrary } from "@/hooks/use-patient-library"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { useToast } from "@/hooks/use-toast"
import type { PatientRecord } from "@/types/clinical-types"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { FichaClinicaPanel } from "@/components/patient-library/FichaClinicaPanel"
import { PatientConversationHistory } from "@/components/patient-conversation-history"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"

/**
 * Component to display session count for a patient
 */
function PatientSessionCount({ patient }: { patient: PatientRecord }) {
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { systemState } = useHopeAISystem()

  useEffect(() => {
    const loadSessionCount = async () => {
      try {
        setLoading(true)
        const { clinicalStorage } = await import('@/lib/clinical-context-storage')
        await clinicalStorage.initialize()
        
        const allSessions = await clinicalStorage.getUserSessions(systemState.userId || 'demo_user')
        const patientSessions = allSessions.filter(session => 
          session.clinicalContext?.patientId === patient.id
        )
        
        // Count user messages across all sessions
        let userMessageCount = 0
        patientSessions.forEach(session => {
          if (session.history) {
            userMessageCount += session.history.filter(msg => msg.role === 'user').length
          }
        })
        
        setSessionCount(userMessageCount)
      } catch (err) {
        console.error('Error loading session count:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadSessionCount()
  }, [patient.id, systemState.userId])

  if (loading) return null

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mb-2">
      <MessageSquare className="h-3 w-3" />
      <span>{sessionCount} sesiones</span>
      
      {/* Milestone indicator */}
      {sessionCount >= 3 && sessionCount < 4 && (
        <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
          1 sesión más para insights
        </Badge>
      )}
      {sessionCount >= 4 && (
        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
          Listo para análisis
        </Badge>
      )}
    </div>
  )
}

interface PatientLibrarySectionProps {
  isOpen: boolean
  onPatientSelect?: (patient: PatientRecord) => void
  onStartConversation?: (patient: PatientRecord) => void
  onClearPatientContext?: () => void
  onConversationSelect?: (sessionId: string) => void
  onDialogOpenChange?: (isOpen: boolean) => void
  clearSelectionTrigger?: number // Trigger para limpiar selección desde fuera
  onOpenFicha?: (patient: PatientRecord) => void // Callback específico para abrir ficha (usado en mobile para no cerrar el nav)
}

export function PatientLibrarySection({
  isOpen,
  onPatientSelect,
  onStartConversation,
  onClearPatientContext,
  onConversationSelect,
  onDialogOpenChange,
  clearSelectionTrigger,
  onOpenFicha: onOpenFichaFromParent
}: PatientLibrarySectionProps) {
  const {
    patients,
    isLoading,
    error,
    searchQuery,
    filteredPatients,
    selectedPatient,
    loadPatients,
    createPatient,
    updatePatient,
    deletePatient,
    searchPatients,
    selectPatient,
    getPatientCount,
    clearError,
    refreshPatientSummary,
    generateFichaClinica,
    loadFichasClinicas,
    fichasClinicas
  } = usePatientLibrary()
  const { systemState } = useHopeAISystem()
  const { toast } = useToast()
  const [isFichaOpen, setIsFichaOpen] = useState(false)
  const [showConversationHistory, setShowConversationHistory] = useState(false)

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [historyPatient, setHistoryPatient] = useState<PatientRecord | null>(null)
  const [patientInsights, setPatientInsights] = useState<Map<string, number>>(new Map())

  // Notificar al componente padre cuando se abre/cierra un diálogo o dropdown
  useEffect(() => {
    const hasOpenDialog = isCreateDialogOpen || isEditDialogOpen || isFichaOpen || showConversationHistory || openDropdownId !== null
    onDialogOpenChange?.(hasOpenDialog)
  }, [isCreateDialogOpen, isEditDialogOpen, isFichaOpen, showConversationHistory, openDropdownId, onDialogOpenChange])

  // Limpiar selección cuando se recibe trigger desde el padre (por ej. desde badge del header)
  useEffect(() => {
    if (clearSelectionTrigger !== undefined && clearSelectionTrigger > 0) {
      selectPatient(null)
      console.log('🧹 Selección de paciente limpiada desde trigger externo')
    }
  }, [clearSelectionTrigger, selectPatient])

  // CRÍTICO: Limpiar formulario cuando se abre el diálogo de CREACIÓN
  // Esto previene que datos de edición previa contaminen un nuevo registro
  useEffect(() => {
    if (isCreateDialogOpen && !editingPatient) {
      resetForm()
    }
  }, [isCreateDialogOpen, editingPatient])

  // CRÍTICO: Limpiar estado cuando se CIERRA el diálogo de edición
  // Esto asegura que no queden datos residuales del paciente editado
  useEffect(() => {
    if (!isEditDialogOpen && editingPatient) {
      setEditingPatient(null)
      resetForm()
    }
  }, [isEditDialogOpen, editingPatient])

  // Load Longitudinal Analysis insights count per patient
  useEffect(() => {
    const loadInsightCounts = async () => {
      try {
        const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage')
        const storage = getPatternAnalysisStorage()
        await storage.initialize()
        
        const pending = await storage.getPendingReviewAnalyses()
        const countMap = new Map<string, number>()
        
        pending.forEach(analysis => {
          const current = countMap.get(analysis.patientId) || 0
          countMap.set(analysis.patientId, current + 1)
        })
        
        setPatientInsights(countMap)
      } catch (err) {
        console.error('Failed to load insight counts:', err)
      }
    }
    
    if (isOpen) {
      loadInsightCounts()
      // Refresh counts every 30 seconds
      const interval = setInterval(loadInsightCounts, 30000)
      return () => clearInterval(interval)
    }
  }, [isOpen])

  // Helper function to check if patient has pending insights
  const hasPatientInsights = useCallback((patientId: string): boolean => {
    return (patientInsights.get(patientId) || 0) > 0
  }, [patientInsights])

  // CRÍTICO: Asegurar que solo un diálogo esté abierto a la vez
  // Si se abre el diálogo de creación, cerrar el de edición
  useEffect(() => {
    if (isCreateDialogOpen && isEditDialogOpen) {
      setIsEditDialogOpen(false)
      setEditingPatient(null)
    }
  }, [isCreateDialogOpen, isEditDialogOpen])

  // Form state for patient creation/editing
  const [formData, setFormData] = useState({
    displayName: "",
    ageRange: "",
    gender: "",
    occupation: "",
    tags: "",
    notes: "",
    confidentialityLevel: "medium" as "high" | "medium" | "low"
  })

  const resetForm = () => {
    setFormData({
      displayName: "",
      ageRange: "",
      gender: "",
      occupation: "",
      tags: "",
      notes: "",
      confidentialityLevel: "medium"
    })
  }

  const handleCreatePatient = async () => {
    try {
      const patientData = {
        displayName: formData.displayName.trim(),
        demographics: {
          ageRange: formData.ageRange.trim() || undefined,
          gender: formData.gender.trim() || undefined,
          occupation: formData.occupation.trim() || undefined
        },
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        notes: formData.notes.trim() || undefined,
        confidentiality: {
          pii: true,
          accessLevel: formData.confidentialityLevel
        }
      }

      await createPatient(patientData)
      setIsCreateDialogOpen(false)
      resetForm()
    } catch (err) {
      console.error("Failed to create patient:", err)
    }
  }

  const handleEditPatient = (patient: PatientRecord) => {
    // Cerrar diálogo de creación si está abierto
    if (isCreateDialogOpen) {
      setIsCreateDialogOpen(false)
    }
    
    setEditingPatient(patient)
    setFormData({
      displayName: patient.displayName,
      ageRange: patient.demographics?.ageRange || "",
      gender: patient.demographics?.gender || "",
      occupation: patient.demographics?.occupation || "",
      tags: patient.tags?.join(", ") || "",
      notes: patient.notes || "",
      confidentialityLevel: patient.confidentiality?.accessLevel || "medium"
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdatePatient = async () => {
    if (!editingPatient) return

    try {
      const updatedPatient: PatientRecord = {
        ...editingPatient,
        displayName: formData.displayName.trim(),
        demographics: {
          ageRange: formData.ageRange.trim() || undefined,
          gender: formData.gender.trim() || undefined,
          occupation: formData.occupation.trim() || undefined
        },
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        notes: formData.notes.trim() || undefined,
        confidentiality: {
          ...editingPatient.confidentiality,
          accessLevel: formData.confidentialityLevel,
          pii: editingPatient.confidentiality?.pii ?? false
        }
      }

      await updatePatient(updatedPatient)
      setIsEditDialogOpen(false)
      setEditingPatient(null)
      resetForm()
    } catch (err) {
      console.error("Failed to update patient:", err)
    }
  }

  const handleDeletePatient = async (patientId: string) => {
    try {
      await deletePatient(patientId)
    } catch (err) {
      console.error("Failed to delete patient:", err)
    }
  }

  const handlePatientClick = (patient: PatientRecord) => {
    selectPatient(patient)
    onPatientSelect?.(patient)
    // Removed automatic conversation start - user must explicitly start conversation
  }

  // Función para abrir historial sin seleccionar visualmente la card
  const handleOpenHistoryForPatient = (patient: PatientRecord) => {
    setHistoryPatient(patient)
    setShowConversationHistory(true)
  }

  const handleStartConversation = (patient: PatientRecord, event: React.MouseEvent) => {
    event.stopPropagation()
    onStartConversation?.(patient)
  }

  const handleOpenFicha = async (patient: PatientRecord) => {
    // Si hay un callback específico del padre (ej. mobile), usarlo en lugar de la lógica local
    if (onOpenFichaFromParent) {
      onOpenFichaFromParent(patient)
      return
    }

    // Si el paciente no está seleccionado, propagamos el estado completo
    // como si se hubiera hecho click en la card
    if (selectedPatient?.id !== patient.id) {
      selectPatient(patient)
      onPatientSelect?.(patient)

      // CRÍTICO: Propagar al sistema HopeAI para establecer el contexto clínico completo
      // Esto asegura que cualquier actualización de ficha ocurra en el contexto correcto
      if (onStartConversation) {
        onStartConversation(patient)
      }
    }

    // Cargar y abrir la ficha
    await loadFichasClinicas(patient.id)
    setIsFichaOpen(true)
  }

  const handleGenerateFicha = async (patient: PatientRecord) => {
    try {
      const sessionState = {
        sessionId: systemState.sessionId || `temp_${Date.now()}`,
        userId: systemState.userId,
        mode: systemState.mode,
        activeAgent: systemState.activeAgent,
        history: systemState.history,
        metadata: {
          createdAt: new Date(),
          lastUpdated: new Date(),
          totalTokens: 0,
          fileReferences: []
        },
        clinicalContext: {
          patientId: patient.id,
          supervisorId: undefined,
          sessionType: 'standard',
          confidentialityLevel: patient.confidentiality?.accessLevel || 'medium'
        }
      }
      const patientForm = {
        displayName: patient.displayName,
        demographics: patient.demographics,
        tags: patient.tags,
        notes: patient.notes,
        confidentiality: patient.confidentiality
      }
      const conversationSummary = systemState.history.slice(-6).map(m => `${m.role === 'user' ? 'Paciente' : 'Modelo'}: ${m.content}`).join('\n')
      const fichaId = `ficha_${patient.id}_${Date.now()}`
      await generateFichaClinica(patient.id, fichaId, { ...sessionState, patientForm, conversationSummary } as any)
      await loadFichasClinicas(patient.id)
    } catch (err) {
      console.error('Error generating ficha clínica:', err)
    }
  }


  return (
    <div
      className="flex flex-col h-full"
      style={{
        clipPath: isOpen ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
        transition: 'clip-path 400ms cubic-bezier(0.25, 0.1, 0.25, 1)'
      }}
    >
      {/* Actions bar */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                title="Agregar paciente"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto bg-gradient-to-b from-secondary/20 to-background paper-noise">
              <DialogHeader className="space-y-3">
                <DialogTitle className="font-sans text-2xl">Agregar Paciente</DialogTitle>
                <DialogDescription className="font-sans text-muted-foreground">
                  Crea un nuevo registro de paciente para conversaciones contextualizadas.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-6 font-sans">
                <div className="grid gap-3">
                  <Label htmlFor="displayName" className="text-sm font-semibold text-foreground">
                    Nombre de identificación *
                  </Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="ej. Paciente A, Caso 001"
                    className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="grid gap-3">
                    <Label htmlFor="ageRange" className="text-sm font-semibold text-foreground">
                      Rango de edad
                    </Label>
                    <Input
                      id="ageRange"
                      value={formData.ageRange}
                      onChange={(e) => setFormData(prev => ({ ...prev, ageRange: e.target.value }))}
                      placeholder="ej. 25-30"
                      className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor="gender" className="text-sm font-semibold text-foreground">
                      Género
                    </Label>
                    <Input
                      id="gender"
                      value={formData.gender}
                      onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                      placeholder="ej. Femenino"
                      className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="occupation" className="text-sm font-semibold text-foreground">
                    Ocupación
                  </Label>
                  <Input
                    id="occupation"
                    value={formData.occupation}
                    onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                    placeholder="ej. Estudiante"
                    className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                  />
                </div>
                
                <div className="grid gap-3">
                  <Label htmlFor="tags" className="text-sm font-semibold text-foreground">
                    Áreas de enfoque
                  </Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="ej. ansiedad, trauma, relaciones"
                    className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Separa múltiples áreas con comas</p>
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="confidentiality" className="text-sm font-semibold text-foreground">
                    Nivel de confidencialidad
                  </Label>
                  <Select
                    value={formData.confidentialityLevel}
                    onValueChange={(value: "high" | "medium" | "low") =>
                      setFormData(prev => ({ ...prev, confidentialityLevel: value }))
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-border/60 focus:ring-clarity-blue-200 focus:border-clarity-blue-400 transition-all">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="high" className="rounded-lg">Alto</SelectItem>
                      <SelectItem value="medium" className="rounded-lg">Medio</SelectItem>
                      <SelectItem value="low" className="rounded-lg">Bajo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-3">
                  <Label htmlFor="notes" className="text-sm font-semibold text-foreground">
                    Notas clínicas
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Información relevante del caso..."
                    rows={4}
                    className="rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all resize-none"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-3 pt-4 border-t border-border/40">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false)
                    resetForm()
                  }}
                  className="w-full sm:w-auto h-11 rounded-xl border-border/60 hover:bg-ash transition-all"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreatePatient}
                  disabled={!formData.displayName.trim()}
                  className="w-full sm:w-auto h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Crear Paciente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Badge de conteo - siempre renderizado, sin animación para evitar compensación */}
          <Badge
            variant="secondary"
            className="text-xs font-sans ml-auto"
          >
            {getPatientCount()} {getPatientCount() === 1 ? 'paciente' : 'pacientes'}
          </Badge>
        </div>

        {/* Search - siempre renderizado, sin animación para evitar compensación */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar pacientes..."
            value={searchQuery}
            onChange={(e) => searchPatients(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Patient List */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto scrollbar-hide">
          <div className="px-3 py-3 space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-5 w-5 animate-spin text-clarity-blue-600" />
                <span className="font-sans text-sm text-muted-foreground font-medium">Cargando pacientes...</span>
              </div>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="text-center py-12 px-4 text-mineral-gray-600">
              <div className="bg-ash rounded-xl p-6 border border-ash">
                <User className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-sans text-sm font-medium">
                  {searchQuery ? 'No se encontraron pacientes' : 'No hay pacientes registrados'}
                </p>
                {!searchQuery && (
                  <p className="font-sans text-xs mt-1 opacity-70">
                    Crea tu primer paciente
                  </p>
                )}
              </div>
            </div>
          ) : (
            filteredPatients.map((patient) => (
              <div key={patient.id} className="relative group">
                {/* Clickable card to start conversation */}
                <button
                  onClick={() => {
                    // No iniciar conversación si el dropdown está abierto
                    if (openDropdownId === patient.id) {
                      return
                    }
                    
                    // Si el paciente ya está seleccionado, deseleccionarlo
                    if (selectedPatient?.id === patient.id) {
                      selectPatient(null)
                      // Limpiar el contexto del paciente en el sistema global
                      onClearPatientContext?.()
                      return
                    }
                    
                    // Seleccionar e iniciar conversación con el nuevo paciente
                    if (onStartConversation) {
                      handlePatientClick(patient)
                      onStartConversation(patient)
                    }
                  }}
                  className={cn(
                    "w-full p-4 h-auto rounded-xl border transition-all duration-200 relative overflow-hidden text-left cursor-pointer",
                    selectedPatient?.id === patient.id
                      ? "bg-clarity-blue-50 dark:bg-clarity-blue-900/20 border-clarity-blue-200 dark:border-clarity-blue-700 shadow-sm hover:shadow-md"
                      : "bg-card border-border hover:bg-secondary hover:border-muted-foreground hover:shadow-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clarity-blue-200 dark:focus-visible:ring-clarity-blue-700 focus-visible:ring-offset-2"
                  )}
                >
                  {/* Accent border on active */}
                  {selectedPatient?.id === patient.id && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-clarity-blue-600 rounded-r-full" />
                  )}
                  
                  
                  <div className="flex items-start gap-3 w-full pl-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      {/* Header con nombre */}
                      <div className="mb-2">
                        <div className="font-sans text-sm text-foreground truncate font-medium leading-snug">
                          {patient.displayName}
                        </div>
                      </div>
                      
                      {/* Información demográfica */}
                      {(patient.demographics?.ageRange || patient.demographics?.gender || patient.demographics?.occupation) && (
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2 font-sans">
                          {patient.demographics.ageRange && (
                            <span className="flex items-center gap-1 flex-shrink-0">
                              <User className="h-3 w-3 opacity-60" />
                              {patient.demographics.ageRange} años
                            </span>
                          )}
                          {patient.demographics.gender && (
                            <span className="flex-shrink-0">• {patient.demographics.gender}</span>
                          )}
                          {patient.demographics.occupation && (
                            <span className="truncate max-w-[150px]" title={patient.demographics.occupation}>
                              • {patient.demographics.occupation}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Áreas de enfoque - compactas */}
                      {patient.tags && patient.tags.length > 0 && (
                        <div className="text-xs text-muted-foreground mb-2 font-sans min-w-0">
                          <span className="opacity-70">Enfoque: </span>
                          <span className="font-medium truncate inline-block max-w-[180px] align-bottom" title={patient.tags.slice(0, 3).join(', ')}>
                            {patient.tags.slice(0, 3).join(', ')}
                          </span>
                          {patient.tags.length > 3 && <span className="flex-shrink-0"> +{patient.tags.length - 3}</span>}
                        </div>
                      )}
                      
                      {/* Notas clínicas - preview */}
                      {patient.notes && (
                        <div className="text-xs text-muted-foreground/80 mb-2 font-sans line-clamp-2 italic">
                          "{patient.notes}"
                        </div>
                      )}

                      {/* Session count and insights status */}
                      {selectedPatient?.id === patient.id && <PatientSessionCount patient={patient} />}
                      
                      {/* Timestamp and Insights Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground/60 font-sans flex items-center gap-1.5">
                          <Clock className="h-3 w-3 opacity-60" />
                          {formatDistanceToNow(patient.updatedAt, { 
                            addSuffix: true, 
                            locale: es 
                          })}
                        </div>
                        
                        {/* Longitudinal Analysis Badge */}
                        {hasPatientInsights(patient.id) && (
                          <Badge 
                            variant="secondary" 
                            className="bg-purple-100 text-purple-700 text-xs font-medium border-purple-200 flex items-center gap-1"
                          >
                            <BarChart3 className="h-3 w-3" />
                            Nuevo análisis
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                
                {/* Dropdown menu for secondary actions */}
                <div className="absolute top-3 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu
                    onOpenChange={(open) => {
                      setOpenDropdownId(open ? patient.id : null)
                    }}
                  >
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-mineral-gray-600 hover:text-deep-charcoal hover:bg-ash transition-all duration-200 opacity-60 group-hover:opacity-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          Más opciones
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-52 font-sans" 
                      onClick={(e) => e.stopPropagation()}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            // Abrir historial sin seleccionar visualmente la card
                            handleOpenHistoryForPatient(patient)
                            setOpenDropdownId(null) // Cerrar dropdown al seleccionar
                          }}
                        className="gap-2 cursor-pointer"
                      >
                        <Clock className="h-4 w-4" />
                        <span>Historial de conversaciones</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenFicha(patient)
                          setOpenDropdownId(null) // Cerrar dropdown al seleccionar
                        }}
                        className="gap-2 cursor-pointer"
                      >
                        <FileText className="h-4 w-4" />
                        <span>Ver Ficha Clínica</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditPatient(patient)
                          setOpenDropdownId(null) // Cerrar dropdown al seleccionar
                        }}
                        className="gap-2 cursor-pointer"
                      >
                        <Edit className="h-4 w-4" />
                        <span>Editar paciente</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            className="gap-2 cursor-pointer text-destructive focus:text-white focus:bg-destructive/90"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Eliminar paciente</span>
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar paciente?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción no se puede deshacer. El registro de "{patient.displayName}" 
                              será eliminado permanentemente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePatient(patient.id)
                              }}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto bg-gradient-to-b from-secondary/20 to-background paper-noise">
          <DialogHeader className="space-y-3">
            <DialogTitle className="font-sans text-2xl">Editar Paciente</DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground">
              Modifica la información del paciente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-6 font-sans">
            <div className="grid gap-3">
              <Label htmlFor="edit-displayName" className="text-sm font-semibold text-foreground">
                Nombre de identificación *
              </Label>
              <Input
                id="edit-displayName"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="ej. Paciente A, Caso 001"
                className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-3">
                <Label htmlFor="edit-ageRange" className="text-sm font-semibold text-foreground">
                  Rango de edad
                </Label>
                <Input
                  id="edit-ageRange"
                  value={formData.ageRange}
                  onChange={(e) => setFormData(prev => ({ ...prev, ageRange: e.target.value }))}
                  placeholder="ej. 25-30"
                  className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="edit-gender" className="text-sm font-semibold text-foreground">
                  Género
                </Label>
                <Input
                  id="edit-gender"
                  value={formData.gender}
                  onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                  placeholder="ej. Femenino"
                  className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
                />
              </div>
            </div>
            
            <div className="grid gap-3">
              <Label htmlFor="edit-occupation" className="text-sm font-semibold text-foreground">
                Ocupación
              </Label>
              <Input
                id="edit-occupation"
                value={formData.occupation}
                onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                placeholder="ej. Estudiante"
                className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
              />
            </div>

            <div className="grid gap-3">
              <Label htmlFor="edit-tags" className="text-sm font-semibold text-foreground">
                Áreas de enfoque
              </Label>
              <Input
                id="edit-tags"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="ej. ansiedad, trauma, relaciones"
                className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1">Separa múltiples áreas con comas</p>
            </div>
            
            <div className="grid gap-3">
              <Label htmlFor="edit-confidentiality" className="text-sm font-semibold text-foreground">
                Nivel de confidencialidad
              </Label>
              <Select
                value={formData.confidentialityLevel}
                onValueChange={(value: "high" | "medium" | "low") => 
                  setFormData(prev => ({ ...prev, confidentialityLevel: value }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl border-border/60 focus:ring-clarity-blue-200 focus:border-clarity-blue-400 transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="high" className="rounded-lg">Alto</SelectItem>
                  <SelectItem value="medium" className="rounded-lg">Medio</SelectItem>
                  <SelectItem value="low" className="rounded-lg">Bajo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3">
              <Label htmlFor="edit-notes" className="text-sm font-semibold text-foreground">
                Notas clínicas
              </Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Información relevante del caso..."
                rows={4}
                className="rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all resize-none"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3 pt-4 border-t border-border/40">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false)
                setEditingPatient(null)
                resetForm()
              }}
              className="w-full sm:w-auto h-11 rounded-xl border-border/60 hover:bg-ash transition-all"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdatePatient}
              disabled={!formData.displayName.trim()}
              className="w-full sm:w-auto h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 shadow-sm hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="px-4 mt-2">
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded font-sans">
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 h-auto p-0 text-destructive hover:text-destructive/80"
              onClick={clearError}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* Ficha Clínica Panel */}
      {selectedPatient && (
        <FichaClinicaPanel
          open={isFichaOpen}
          onOpenChange={(open) => setIsFichaOpen(open)}
          patient={selectedPatient}
          fichas={fichasClinicas as any}
          onRefresh={async () => { await loadFichasClinicas(selectedPatient.id) }}
          onGenerate={async () => {
            const sessionState = {
              sessionId: systemState.sessionId || `temp_${Date.now()}`,
              userId: systemState.userId,
              mode: systemState.mode,
              activeAgent: systemState.activeAgent,
              history: systemState.history,
              metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: [] },
              clinicalContext: { patientId: selectedPatient.id, supervisorId: undefined, sessionType: 'standard', confidentialityLevel: selectedPatient.confidentiality?.accessLevel || 'medium' }
            }
            const patientForm = {
              displayName: selectedPatient.displayName,
              demographics: selectedPatient.demographics,
              tags: selectedPatient.tags,
              notes: selectedPatient.notes,
              confidentiality: selectedPatient.confidentiality
            }
            const conversationSummary = systemState.history.slice(-6).map(m => `${m.role === 'user' ? 'Paciente' : 'Modelo'}: ${m.content}`).join('\n')
            const fichaId = `ficha_${selectedPatient.id}_${Date.now()}`
            await generateFichaClinica(selectedPatient.id, fichaId, { ...sessionState, patientForm, conversationSummary } as any)
            await loadFichasClinicas(selectedPatient.id)
          }}
        />
      )}

      {/* Patient Conversation History */}
      {historyPatient && (
        <Dialog open={showConversationHistory} onOpenChange={(open) => {
          setShowConversationHistory(open)
          if (!open) {
            setHistoryPatient(null) // Limpiar paciente del historial al cerrar
          }
        }}>
          <DialogContent className="w-[100vw] max-w-none h-[100svh] p-0 sm:w-full sm:max-w-4xl sm:h-auto sm:max-h-[80vh] sm:p-0">
            <DialogHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3 border-b sm:px-6 sm:py-4 pt-[env(safe-area-inset-top)]">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <DialogTitle className="text-base sm:text-lg truncate">Historial de Conversaciones - {historyPatient.displayName}</DialogTitle>
                  <DialogDescription className="hidden sm:block">
                    Revisa las conversaciones anteriores con este paciente
                  </DialogDescription>
                </div>
                <DialogClose asChild>
                  <button
                    aria-label="Cerrar historial"
                    className="inline-flex items-center justify-center rounded-md h-10 w-10 sm:h-8 sm:w-8 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </DialogClose>
              </div>
            </DialogHeader>
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 overflow-y-auto max-h-[calc(100svh-7rem)] sm:max-h-[60vh] overscroll-contain touch-pan-y">
              <PatientConversationHistory
                patient={historyPatient}
                userId={"demo_user"}
                className="pb-2"
                onConversationSelect={async (sessionId: string) => {
                    console.log('📱 Cargando conversación desde historial de paciente:', sessionId);
                    
                    // Cerrar el modal inmediatamente para mejor UX
                    setShowConversationHistory(false);
                    setHistoryPatient(null); // Limpiar paciente del historial
                    
                    // Delegar completamente la carga de la sesión al handleConversationSelect
                    // No necesitamos getChatState aquí ya que handleConversationSelect usa loadSession
                    if (onConversationSelect) {
                      await onConversationSelect(sessionId);
                    }
                  }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}