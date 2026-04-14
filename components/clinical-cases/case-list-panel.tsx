"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  Search,
  Trash2,
  Edit,
  X,
  Clock,
  MoreVertical,
  BarChart3,
  ClipboardList,
  ArrowDownAZ,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PatientRecord } from "@/types/clinical-types"
import type { PatientClinicalStats } from "@/hooks/use-patient-library"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

// ---------------------------------------------------------------------------
// Clinical Depth Bar
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

  const parts: string[] = []
  if (sessionCount > 0) parts.push(`${sessionCount}s`)
  if (memoryCount > 0) parts.push(`${memoryCount}m`)
  if (fichaCount > 0) parts.push(`${fichaCount}f`)

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div
        className="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden"
        role="meter"
        aria-valuenow={depth}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Profundidad clínica: ${sessionCount} sesiones, ${memoryCount} memorias, ${fichaCount} fichas`}
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300 ease-out', barColor)}
          style={{ width: `${depth}%` }}
        />
      </div>
      {parts.length > 0 && (
        <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap flex-shrink-0">
          {parts.join(' · ')}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SortMode = 'recent' | 'oldest' | 'alpha' | 'activity'

interface CaseListPanelProps {
  patients: PatientRecord[]
  filteredPatients: PatientRecord[]
  isLoading: boolean
  searchQuery: string
  selectedPatientId: string | null
  patientStats: Map<string, PatientClinicalStats>
  patientInsights: Map<string, number>
  onSearchChange: (query: string) => void
  onSelectCase: (patient: PatientRecord) => void
  onCreateCase: (data: { displayName: string; tags: string[] }) => Promise<void>
  onEditCase: (patient: PatientRecord) => void
  onDeleteCase: (patientId: string) => void
  caseCount: number
  className?: string
  error?: string | null
  onRetry?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CaseListPanel({
  patients,
  filteredPatients,
  isLoading,
  searchQuery,
  className,
  selectedPatientId,
  patientStats,
  patientInsights,
  onSearchChange,
  onSelectCase,
  onCreateCase,
  onEditCase,
  onDeleteCase,
  caseCount,
  error,
  onRetry,
}: CaseListPanelProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createTags, setCreateTags] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const createInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // Sort patients
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    switch (sortMode) {
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case 'alpha':
        return a.displayName.localeCompare(b.displayName)
      case 'activity': {
        const sa = patientStats.get(a.id)
        const sb = patientStats.get(b.id)
        const da = sa ? sa.sessionCount * 15 + sa.memoryCount * 8 + sa.fichaCount * 20 : 0
        const db = sb ? sb.sessionCount * 15 + sb.memoryCount * 8 + sb.fichaCount * 20 : 0
        return db - da
      }
      default: // recent
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
  })

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreateError(null)
    try {
      await onCreateCase({
        displayName: createName.trim(),
        tags: createTags.split(',').map(t => t.trim()).filter(Boolean),
      })
      setIsCreating(false)
      setCreateName("")
      setCreateTags("")
    } catch {
      setCreateError('No se pudo crear el caso. Inténtalo de nuevo.')
    }
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setCreateName("")
    setCreateTags("")
    setCreateError(null)
  }

  const showSearch = caseCount > 0 || searchQuery.length > 0

  return (
    <div className={cn("w-[340px] flex-shrink-0 border-r border-border/30 flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground font-sans">
              Casos Clínicos
            </h2>
            {caseCount > 0 && (
              <Badge variant="secondary" className="text-[11px] font-sans h-5">
                {caseCount}
              </Badge>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Ordenar casos">
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-sans">
              <DropdownMenuItem onClick={() => setSortMode('recent')} className={cn(sortMode === 'recent' && 'font-semibold')}>
                Más reciente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('oldest')} className={cn(sortMode === 'oldest' && 'font-semibold')}>
                Más antiguo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('alpha')} className={cn(sortMode === 'alpha' && 'font-semibold')}>
                Nombre A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode('activity')} className={cn(sortMode === 'activity' && 'font-semibold')}>
                Más actividad
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showSearch && (
          <div className="relative mt-2.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              placeholder="Buscar casos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-10 text-sm font-sans bg-secondary/30 border-border/30 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-secondary"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline Creator */}
      <AnimatePresence initial={false}>
        {isCreating && (
          <motion.div
            key="inline-creator"
            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden flex-shrink-0"
          >
            <div className="mx-4 mb-3 p-4 bg-card border border-border/40 rounded-xl space-y-3">
              <span className="text-sm font-semibold text-foreground font-sans block">
                Nuevo Caso Clínico
              </span>
              <div>
                <Input
                  ref={createInputRef}
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="ej. María G., Caso 012"
                  className="h-10 rounded-lg text-sm font-sans"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreate()
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-sans">Identificador *</p>
              </div>
              <div>
                <Input
                  value={createTags}
                  onChange={(e) => setCreateTags(e.target.value)}
                  placeholder="ej. ansiedad, duelo, relaciones"
                  className="h-10 rounded-lg text-sm font-sans"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelCreate()
                    if (e.key === 'Enter' && createName.trim()) handleCreate()
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-sans">Áreas de enfoque · Comas</p>
              </div>
              {createError && (
                <div className="flex items-center gap-2 text-xs text-destructive font-sans" role="alert">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {createError}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleCreate}
                  disabled={!createName.trim()}
                  className="flex-1 h-9 rounded-lg bg-foreground text-background hover:bg-foreground/90 text-sm font-sans"
                >
                  Crear Caso
                </Button>
                <Button variant="ghost" onClick={handleCancelCreate} className="h-9 rounded-lg text-sm font-sans">
                  Cancelar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Case List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="px-3 pb-6 space-y-1.5">
          {error ? (
            <div className="text-center py-12 px-4">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/40" />
              <p className="text-sm text-destructive font-sans">Error al cargar casos</p>
              <p className="text-xs text-muted-foreground mt-1 font-sans">{error}</p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 text-xs font-sans gap-1.5 rounded-lg">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              )}
            </div>
          ) : isLoading ? (
            <div className="space-y-1.5 pt-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-[88px] rounded-xl bg-secondary/40 animate-pulse" />
              ))}
              <p className="text-xs text-muted-foreground/50 text-center pt-2 font-sans">Cargando casos...</p>
            </div>
          ) : sortedPatients.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm text-muted-foreground font-sans">
                  Sin resultados para &ldquo;{searchQuery}&rdquo;
                </p>
                <Button variant="ghost" size="sm" onClick={() => onSearchChange("")} className="mt-2 text-xs font-sans">
                  Limpiar búsqueda
                </Button>
              </div>
            ) : (
              <div className="text-center py-16 px-6">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-15 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground font-sans">
                  Tu espacio clínico está listo
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 font-sans">
                  Crea tu primer caso para comenzar.
                </p>
                <Button
                  onClick={() => setIsCreating(true)}
                  className="mt-4 h-10 rounded-xl bg-foreground text-background hover:bg-foreground/90 text-sm font-sans"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear primer caso
                </Button>
              </div>
            )
          ) : (
            sortedPatients.map((patient) => {
              const isSelected = selectedPatientId === patient.id
              const insights = patientInsights.get(patient.id) || 0

              return (
                <div key={patient.id} className="relative group">
                  <button
                    onClick={() => onSelectCase(patient)}
                    aria-label={`Caso clínico: ${patient.displayName}`}
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      "w-full px-3 py-3 rounded-xl border transition-all duration-150 text-left cursor-pointer",
                      isSelected
                        ? "bg-clarity-blue-50/70 dark:bg-clarity-blue-900/20 border-clarity-blue-200/60 dark:border-clarity-blue-700"
                        : "bg-transparent border-transparent hover:bg-secondary/40 hover:border-border/30",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clarity-blue-200 focus-visible:ring-offset-1"
                    )}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-clarity-blue-500 rounded-r-full" />
                    )}

                    <div className="pl-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans text-sm text-foreground font-medium leading-snug truncate">
                          {patient.displayName}
                        </span>
                        {insights > 0 && (
                          <BarChart3 className="h-3.5 w-3.5 text-academic-plum-500 flex-shrink-0" />
                        )}
                      </div>

                      {(patient.demographics?.ageRange || patient.demographics?.gender) && (
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 font-sans truncate">
                          {[patient.demographics.ageRange, patient.demographics.gender, patient.demographics.occupation].filter(Boolean).join(' · ')}
                        </p>
                      )}

                      {patient.tags && patient.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {patient.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="inline-flex rounded-full bg-secondary/80 px-1.5 py-0 text-[10px] text-muted-foreground/70 border border-border/20">
                              {tag}
                            </span>
                          ))}
                          {patient.tags.length > 3 && (
                            <span className="text-[10px] text-muted-foreground/40">+{patient.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      <ClinicalDepthBar stats={patientStats.get(patient.id)} />

                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground/40 font-sans">
                          {formatDistanceToNow(patient.updatedAt, { addSuffix: true, locale: es })}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Kebab */}
                  <div className="absolute top-2.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/50 hover:text-foreground" aria-label={`Opciones de ${patient.displayName}`}>
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 font-sans" onCloseAutoFocus={(e) => e.preventDefault()}>
                        <DropdownMenuItem onClick={() => onEditCase(patient)} className="gap-2 cursor-pointer">
                          <Edit className="h-3.5 w-3.5" /> Editar
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 cursor-pointer text-destructive focus:bg-destructive/10">
                              <Trash2 className="h-3.5 w-3.5" /> Eliminar
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar caso clínico?</AlertDialogTitle>
                              <AlertDialogDescription>
                                El caso &ldquo;{patient.displayName}&rdquo; y sus datos clínicos serán eliminados permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onDeleteCase(patient.id)} className="bg-destructive hover:bg-destructive/90">
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Sticky footer CTA */}
      {caseCount > 0 && !isCreating && (
        <div className="px-4 py-3 border-t border-border/20 flex-shrink-0">
          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            className="w-full h-10 rounded-xl border-border/40 text-sm font-sans gap-1.5 hover:bg-secondary/50"
          >
            <Plus className="h-4 w-4" />
            Nuevo caso clínico
          </Button>
        </div>
      )}
    </div>
  )
}
