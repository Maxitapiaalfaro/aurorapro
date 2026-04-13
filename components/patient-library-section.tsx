"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
  MessageSquare,
  Trash2,
  Edit,
  X,
  Clock,
  MoreVertical,
  BarChart3,
  FileText,
  Brain,
  Stethoscope,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { usePatientLibrary, type PatientClinicalStats } from "@/hooks/use-patient-library"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/providers/auth-provider"
import type { PatientRecord } from "@/types/clinical-types"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { FichaClinicaPanel } from "@/components/patient-library/FichaClinicaPanel"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"

import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ---------------------------------------------------------------------------
// Clinical Depth Bar â€” visual richness indicator per case
// ---------------------------------------------------------------------------

function ClinicalDepthBar({ stats }: { stats: PatientClinicalStats | undefined }) {
  if (!stats) return null

  const { sessionCount, memoryCount, fichaCount } = stats
  const depth = Math.min(100, sessionCount * 15 + memoryCount * 8 + fichaCount * 20)

  if (depth === 0) return null

  const barColor =
    depth <= 30
      ? 'bg-muted-foreground/30'
      : depth <= 60
        ? 'bg-clarity-blue-400'
        : 'bg-gradient-to-r from-clarity-blue-500 to-academic-plum-500'

  // Compact summary label
  const parts: string[] = []
  if (sessionCount > 0) parts.push(`${sessionCount}s`)
  if (memoryCount > 0) parts.push(`${memoryCount}m`)
  if (fichaCount > 0) {
    parts.push(stats.latestFichaStatus === 'generando' ? 'ficha â³' : 'ficha âœ“')
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <div
        className="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden"
        role="meter"
        aria-valuenow={depth}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Profundidad clÃ­nica: ${sessionCount} sesiones, ${memoryCount} memorias, ${fichaCount} fichas`}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300 ease-out', barColor)}
          style={{ width: `${depth}%` }}
        />
      </div>
      {parts.length > 0 && (
        <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap flex-shrink-0">
          {parts.join(' Â· ')}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props interface (unchanged for consumers)
// ---------------------------------------------------------------------------

interface PatientLibrarySectionProps {
  isOpen: boolean
  onPatientSelect?: (patient: PatientRecord) => void
  onStartConversation?: (patient: PatientRecord) => void
  onClearPatientContext?: () => void
  onConversationSelect?: (sessionId: string) => void
  onDialogOpenChange?: (isOpen: boolean) => void
  clearSelectionTrigger?: number
  onOpenFicha?: (patient: PatientRecord) => void
}

// ---------------------------------------------------------------------------
// Main Component â€” Clinical Cases Workhub
// ---------------------------------------------------------------------------

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
    fichasClinicas,
    patientStats,
  } = usePatientLibrary()
  const { systemState } = useHopeAISystem()
  const { toast } = useToast()

  // UI state
  const [isCreating, setIsCreating] = useState(false)
  const [isFichaOpen, setIsFichaOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<PatientRecord | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [patientInsights, setPatientInsights] = useState<Map<string, number>>(new Map())
  const createInputRef = useRef<HTMLInputElement>(null)

  // Inline creator form (simplified: only identifier + tags)
  const [createName, setCreateName] = useState("")
  const [createTags, setCreateTags] = useState("")

  // Edit form state (full form for editing)
  const [formData, setFormData] = useState({
    displayName: "",
    ageRange: "",
    gender: "",
    occupation: "",
    tags: "",
    notes: "",
    confidentialityLevel: "medium" as "high" | "medium" | "low"
  })

  // Notify parent when dialogs open/close
  useEffect(() => {
    const hasOpenDialog = isCreating || isEditDialogOpen || isFichaOpen || openDropdownId !== null
    onDialogOpenChange?.(hasOpenDialog)
  }, [isCreating, isEditDialogOpen, isFichaOpen, openDropdownId, onDialogOpenChange])

  // Clear selection from external trigger
  useEffect(() => {
    if (clearSelectionTrigger !== undefined && clearSelectionTrigger > 0) {
      selectPatient(null)
    }
  }, [clearSelectionTrigger, selectPatient])

  // Clean form when edit dialog closes
  useEffect(() => {
    if (!isEditDialogOpen && editingPatient) {
      setEditingPatient(null)
      resetEditForm()
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
        logger.error('Failed to load insight counts:', err)
      }
    }
    if (isOpen) {
      loadInsightCounts()
      const interval = setInterval(loadInsightCounts, 30000)
      return () => clearInterval(interval)
    }
  }, [isOpen])

  const hasPatientInsights = useCallback((patientId: string): boolean => {
    return (patientInsights.get(patientId) || 0) > 0
  }, [patientInsights])

  // -----------------------------------------------------------------------
  // Inline Case Creator
  // -----------------------------------------------------------------------

  const handleOpenCreator = () => {
    setIsCreating(true)
    setCreateName("")
    setCreateTags("")
  }

  const handleCreateCase = async () => {
    if (!createName.trim()) return
    try {
      const patientData = {
        displayName: createName.trim(),
        tags: createTags.split(',').map(t => t.trim()).filter(Boolean),
        confidentiality: { pii: true, accessLevel: "medium" as const },
      }
      const newPatient = await createPatient(patientData)
      setIsCreating(false)
      setCreateName("")
      setCreateTags("")
      // Auto-select and start conversation
      selectPatient(newPatient)
      onPatientSelect?.(newPatient)
      onStartConversation?.(newPatient)
    } catch (err) {
      logger.error("Failed to create case:", err)
    }
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setCreateName("")
    setCreateTags("")
  }

  // -----------------------------------------------------------------------
  // Edit handlers
  // -----------------------------------------------------------------------

  const resetEditForm = () => {
    setFormData({
      displayName: "", ageRange: "", gender: "", occupation: "",
      tags: "", notes: "", confidentialityLevel: "medium"
    })
  }

  const handleEditPatient = (patient: PatientRecord) => {
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
      resetEditForm()
    } catch (err) {
      logger.error("Failed to update case:", err)
    }
  }

  const handleDeletePatient = async (patientId: string) => {
    try {
      await deletePatient(patientId)
    } catch (err) {
      logger.error("Failed to delete case:", err)
    }
  }

  // -----------------------------------------------------------------------
  // Case card interaction
  // -----------------------------------------------------------------------

  const handleCaseClick = (patient: PatientRecord) => {
    if (openDropdownId === patient.id) return
    if (selectedPatient?.id === patient.id) {
      selectPatient(null)
      onClearPatientContext?.()
      return
    }
    selectPatient(patient)
    onPatientSelect?.(patient)
    onStartConversation?.(patient)
  }

  const handleOpenFicha = async (patient: PatientRecord) => {
    if (onOpenFichaFromParent) {
      onOpenFichaFromParent(patient)
      return
    }
    if (selectedPatient?.id !== patient.id) {
      selectPatient(patient)
      onPatientSelect?.(patient)
      onStartConversation?.(patient)
    }
    await loadFichasClinicas(patient.id)
    setIsFichaOpen(true)
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const caseCount = getPatientCount()
  const showSearch = caseCount > 0 || searchQuery.length > 0

  return (
    <div
      className="flex flex-col h-full"
      style={{
        clipPath: isOpen ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
        transition: 'clip-path 400ms cubic-bezier(0.25, 0.1, 0.25, 1)'
      }}
    >
      {/* â”€â”€ Header â”€â”€ */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground font-sans">
            Casos ClÃ­nicos
          </span>
          <div className="flex items-center gap-2">
            {caseCount > 0 && (
              <Badge variant="secondary" className="text-xs font-sans">
                {caseCount} {caseCount === 1 ? 'caso' : 'casos'}
              </Badge>
            )}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0"
                    onClick={handleOpenCreator}
                    aria-label="Crear nuevo caso clÃ­nico"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Nuevo caso clÃ­nico
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Search â€” only when cases exist */}
        {showSearch && (
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar casos..."
              value={searchQuery}
              onChange={(e) => searchPatients(e.target.value)}
              className="pl-9 h-9 text-sm font-sans"
            />
            {searchQuery && (
              <button
                onClick={() => searchPatients("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-secondary"
                aria-label="Limpiar bÃºsqueda"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* â”€â”€ Inline Case Creator â”€â”€ */}
      <AnimatePresence initial={false}>
        {isCreating && (
          <motion.div
            key="inline-creator"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="mx-3 mb-2 p-4 bg-card border border-border/40 rounded-2xl space-y-3">
              <span className="text-sm font-semibold text-foreground font-sans block">
                Nuevo Caso ClÃ­nico
              </span>

              <div>
                <Input
                  ref={createInputRef}
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="ej. MarÃ­a G., Caso 012"
                  className="h-11 rounded-xl text-sm font-sans"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreate()
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-sans">Identificador del caso *</p>
              </div>

              <div>
                <Input
                  value={createTags}
                  onChange={(e) => setCreateTags(e.target.value)}
                  placeholder="ej. ansiedad, duelo, relaciones"
                  className="h-11 rounded-xl text-sm font-sans"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreate()
                    if (e.key === 'Enter' && createName.trim()) handleCreateCase()
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-sans">Ãreas de enfoque Â· Separa con comas</p>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleCreateCase}
                  disabled={!createName.trim()}
                  className="flex-1 h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm font-sans disabled:opacity-50"
                >
                  Abrir Caso
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCancelCreate}
                  className="h-10 rounded-xl text-sm font-sans"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* â”€â”€ Case List â”€â”€ */}
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto scrollbar-hide">
          <div className="px-3 py-2 space-y-2">
            {isLoading ? (
              /* Loading skeleton */
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-[110px] rounded-2xl bg-secondary/50 animate-pulse" />
                ))}
                <p className="text-sm text-muted-foreground text-center pt-2 font-sans">Cargando casos...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              /* Empty state */
              searchQuery ? (
                <div className="text-center py-10 px-4">
                  <p className="text-sm text-muted-foreground font-sans font-medium">
                    Sin resultados para &ldquo;{searchQuery}&rdquo;
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1 font-sans">
                    Intenta con otro tÃ©rmino
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => searchPatients("")}
                    className="mt-3 text-xs font-sans"
                  >
                    Limpiar bÃºsqueda
                  </Button>
                </div>
              ) : (
                <div className="text-center py-10 px-4">
                  <div className="bg-secondary/30 rounded-2xl p-8 border border-border/30">
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-20 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground font-sans">
                      Tu espacio clÃ­nico estÃ¡ listo
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 font-sans">
                      Crea tu primer caso para comenzar a trabajar con Aurora.
                    </p>
                    <Button
                      onClick={handleOpenCreator}
                      className="mt-4 h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm font-sans"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Crear primer caso
                    </Button>
                  </div>
                </div>
              )
            ) : (
              /* Case cards */
              filteredPatients.map((patient) => (
                <div key={patient.id} className="relative group">
                  <button
                    onClick={() => handleCaseClick(patient)}
                    aria-label={`${patient.displayName}, Ãºltima actividad ${formatDistanceToNow(patient.updatedAt, { addSuffix: true, locale: es })}`}
                    className={cn(
                      "w-full p-4 h-auto rounded-2xl border transition-all duration-200 relative overflow-hidden text-left cursor-pointer",
                      selectedPatient?.id === patient.id
                        ? "bg-clarity-blue-50/70 dark:bg-clarity-blue-900/20 border-clarity-blue-200/60 dark:border-clarity-blue-700"
                        : "bg-card border-border/40 hover:bg-secondary/50 hover:border-border/60",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clarity-blue-200 dark:focus-visible:ring-clarity-blue-700 focus-visible:ring-offset-2"
                    )}
                  >
                    {/* Active accent bar */}
                    {selectedPatient?.id === patient.id && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 bg-clarity-blue-600 rounded-r-full" />
                    )}

                    <div className="pl-2 min-w-0">
                      {/* Case identifier */}
                      <div className="font-sans text-sm text-foreground font-medium leading-snug truncate pr-8">
                        {patient.displayName}
                      </div>

                      {/* Demographics line */}
                      {(patient.demographics?.ageRange || patient.demographics?.gender || patient.demographics?.occupation) && (
                        <div className="text-xs text-muted-foreground mt-1 font-sans truncate">
                          {[
                            patient.demographics.ageRange && `${patient.demographics.ageRange} aÃ±os`,
                            patient.demographics.gender,
                            patient.demographics.occupation,
                          ].filter(Boolean).join(' Â· ')}
                        </div>
                      )}

                      {/* Focus area pills */}
                      {patient.tags && patient.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {patient.tags.slice(0, 3).map((tag, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground border border-border/30"
                            >
                              {tag}
                            </span>
                          ))}
                          {patient.tags.length > 3 && (
                            <span className="text-[11px] text-muted-foreground/60 self-center">
                              +{patient.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Clinical depth bar */}
                      <ClinicalDepthBar stats={patientStats.get(patient.id)} />

                      {/* Footer: timestamp + insights */}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="text-xs text-muted-foreground/60 font-sans flex items-center gap-1.5">
                          <Clock className="h-3 w-3 opacity-60" />
                          {formatDistanceToNow(patient.updatedAt, { addSuffix: true, locale: es })}
                        </div>
                        {hasPatientInsights(patient.id) && (
                          <Badge
                            variant="secondary"
                            className="bg-purple-50 text-purple-700 text-[11px] font-medium border-purple-200 flex items-center gap-1 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800"
                          >
                            <BarChart3 className="h-3 w-3" />
                            AnÃ¡lisis disponible
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Kebab menu */}
                  <div className="absolute top-3 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu onOpenChange={(open) => setOpenDropdownId(open ? patient.id : null)}>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 opacity-60 group-hover:opacity-100"
                                aria-label={`Opciones del caso ${patient.displayName}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            MÃ¡s opciones
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <DropdownMenuContent
                        align="end"
                        className="w-48 font-sans"
                        onClick={(e) => e.stopPropagation()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenFicha(patient)
                            setOpenDropdownId(null)
                          }}
                          className="gap-2 cursor-pointer"
                        >
                          <FileText className="h-4 w-4" />
                          <span>Ver Ficha ClÃ­nica</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditPatient(patient)
                            setOpenDropdownId(null)
                          }}
                          className="gap-2 cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                          <span>Editar caso</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="gap-2 cursor-pointer text-destructive focus:text-white focus:bg-destructive/90"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>Eliminar caso</span>
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Â¿Eliminar caso clÃ­nico?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acciÃ³n no se puede deshacer. El caso &ldquo;{patient.displayName}&rdquo; y sus datos clÃ­nicos asociados serÃ¡n eliminados permanentemente.
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

      {/* â”€â”€ Edit Dialog (full form) â”€â”€ */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto bg-gradient-to-b from-secondary/20 to-background paper-noise">
          <DialogHeader className="space-y-3">
            <DialogTitle className="font-sans text-2xl">Editar Caso ClÃ­nico</DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground">
              Modifica la informaciÃ³n del caso clÃ­nico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-6 font-sans">
            <div className="grid gap-3">
              <Label htmlFor="edit-displayName" className="text-sm font-semibold text-foreground">
                Identificador del caso *
              </Label>
              <Input
                id="edit-displayName"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="ej. MarÃ­a G., Caso 012"
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
                  GÃ©nero
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
                OcupaciÃ³n
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
                Ãreas de enfoque
              </Label>
              <Input
                id="edit-tags"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="ej. ansiedad, trauma, relaciones"
                className="h-11 rounded-xl border-border/60 focus-visible:ring-clarity-blue-200 focus-visible:border-clarity-blue-400 transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1">Separa mÃºltiples Ã¡reas con comas</p>
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
                Notas clÃ­nicas
              </Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="InformaciÃ³n relevante del caso..."
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
                resetEditForm()
              }}
              className="w-full sm:w-auto h-11 rounded-xl border-border/60 hover:bg-secondary transition-all"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdatePatient}
              disabled={!formData.displayName.trim()}
              className="w-full sm:w-auto h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* â”€â”€ Error display â”€â”€ */}
      {error && (
        <div className="px-3 mt-2 flex-shrink-0">
          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded font-sans flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-destructive hover:text-destructive/80"
              onClick={clearError}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* â”€â”€ Ficha ClÃ­nica Panel â”€â”€ */}
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
    </div>
  )
}
