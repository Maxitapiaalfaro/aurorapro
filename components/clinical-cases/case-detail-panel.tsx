"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Edit,
  MessageSquare,
  Brain,
  FileText,
  BarChart3,
  ClipboardList,
  CalendarDays,
  Save,
  Loader2,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Eye,
  Sparkles,
  Tag,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PatientRecord, ClinicalDocument } from "@/types/clinical-types"
import type { ClinicalMemory, ClinicalMemoryCategory } from "@/types/memory-types"
import type { PatientClinicalStats } from "@/hooks/use-patient-library"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import { listUserSessions, getActivePatientMemories, loadPatientDocumentsAcrossSessions } from "@/lib/firestore-client-storage"
import { useAuth } from "@/providers/auth-provider"
import { getAgentVisualConfigSafe } from "@/config/agent-visual-config"

import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ---------------------------------------------------------------------------
// Memory category config
// ---------------------------------------------------------------------------

const MEMORY_CATEGORY_CONFIG: Record<ClinicalMemoryCategory, { label: string; color: string; bgLight: string; bgDark: string }> = {
  observation: { label: 'Observación', color: 'text-clarity-blue-600', bgLight: 'bg-clarity-blue-50', bgDark: 'dark:bg-clarity-blue-900/20' },
  pattern: { label: 'Patrón', color: 'text-academic-plum-600', bgLight: 'bg-academic-plum-50', bgDark: 'dark:bg-academic-plum-900/20' },
  'therapeutic-preference': { label: 'Preferencia terapéutica', color: 'text-serene-teal-600', bgLight: 'bg-serene-teal-50', bgDark: 'dark:bg-serene-teal-900/20' },
  feedback: { label: 'Feedback', color: 'text-amber-600', bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20' },
  reference: { label: 'Referencia', color: 'text-muted-foreground', bgLight: 'bg-muted/30', bgDark: 'dark:bg-muted/20' },
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  SOAP: 'SOAP',
  DAP: 'DAP',
  BIRP: 'BIRP',
  plan_tratamiento: 'Plan de Tratamiento',
  resumen_caso: 'Resumen de Caso',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionSummary {
  sessionId: string
  patientId: string
  title?: string
  activeAgent?: string
  lastUpdated: Date
  createdAt: Date
  messageCount?: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CaseDetailPanelProps {
  patient: PatientRecord
  stats: PatientClinicalStats | undefined
  hasInsights: boolean
  onUpdatePatient: (updated: PatientRecord) => Promise<void>
  onConversationSelect?: (sessionId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CaseDetailPanel({
  patient,
  stats,
  hasInsights,
  onUpdatePatient,
  onConversationSelect,
}: CaseDetailPanelProps) {
  const { psychologistId } = useAuth()
  const [activeTab, setActiveTab] = useState('resumen')
  const [isEditing, setIsEditing] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [notes, setNotes] = useState(patient.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null)

  // Memories state
  const [memories, setMemories] = useState<ClinicalMemory[]>([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [memoriesError, setMemoriesError] = useState<string | null>(null)

  // Documents state
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsExpanded, setDocumentsExpanded] = useState(false)

  // Edit form
  const [editForm, setEditForm] = useState({
    displayName: patient.displayName,
    ageRange: patient.demographics?.ageRange || '',
    gender: patient.demographics?.gender || '',
    occupation: patient.demographics?.occupation || '',
    tags: patient.tags?.join(', ') || '',
    confidentialityLevel: (patient.confidentiality?.accessLevel || 'medium') as 'high' | 'medium' | 'low',
  })

  // Reset when patient changes
  useEffect(() => {
    setActiveTab('resumen')
    setIsEditing(false)
    setNotes(patient.notes || '')
    setNotesSaved(false)
    setNotesSaveError(null)
    setEditForm({
      displayName: patient.displayName,
      ageRange: patient.demographics?.ageRange || '',
      gender: patient.demographics?.gender || '',
      occupation: patient.demographics?.occupation || '',
      tags: patient.tags?.join(', ') || '',
      confidentialityLevel: (patient.confidentiality?.accessLevel || 'medium') as 'high' | 'medium' | 'low',
    })
    setSessions([])
    setSessionsError(null)
    setMemories([])
    setMemoriesError(null)
    setDocuments([])
    setDocumentsExpanded(false)
  }, [patient.id])

  // Load memories eagerly (used in Resumen preview + Memorias tab)
  useEffect(() => {
    if (psychologistId && patient.id) {
      loadMemories()
    }
  }, [patient.id, psychologistId])

  // Load sessions when tab is activated
  useEffect(() => {
    if (activeTab === 'sesiones' && psychologistId && sessions.length === 0) {
      loadSessions()
    }
  }, [activeTab, psychologistId])

  // Load documents when memorias tab is activated
  useEffect(() => {
    if (activeTab === 'memorias' && psychologistId && documents.length === 0) {
      loadDocuments()
    }
  }, [activeTab, psychologistId])

  const loadSessions = async () => {
    if (!psychologistId) return
    setSessionsLoading(true)
    setSessionsError(null)
    try {
      const result = await listUserSessions(psychologistId, { pageSize: 200 })
      const patientSessions = (result.items || [])
        .filter((s: any) => s.patientId === patient.id)
        .sort((a: any, b: any) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      setSessions(patientSessions)
    } catch (err) {
      logger.error('Failed to load sessions:', err)
      setSessionsError('No se pudieron cargar las sesiones.')
    } finally {
      setSessionsLoading(false)
    }
  }

  const loadMemories = async () => {
    if (!psychologistId) return
    setMemoriesLoading(true)
    setMemoriesError(null)
    try {
      const result = await getActivePatientMemories(psychologistId, patient.id)
      setMemories(result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()))
    } catch (err) {
      logger.error('Failed to load memories:', err)
      setMemoriesError('No se pudieron cargar las memorias.')
    } finally {
      setMemoriesLoading(false)
    }
  }

  const loadDocuments = async () => {
    if (!psychologistId) return
    setDocumentsLoading(true)
    try {
      const result = await loadPatientDocumentsAcrossSessions(psychologistId, patient.id)
      setDocuments(result)
    } catch (err) {
      logger.error('Failed to load documents:', err)
    } finally {
      setDocumentsLoading(false)
    }
  }

  // Notes auto-save
  const saveNotes = useCallback(async () => {
    if (notes === (patient.notes || '')) return
    setNotesSaving(true)
    setNotesSaveError(null)
    try {
      await onUpdatePatient({ ...patient, notes: notes.trim() || undefined })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (err) {
      logger.error('Failed to save notes:', err)
      setNotesSaveError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setNotesSaving(false)
    }
  }, [notes, patient, onUpdatePatient])

  const handleSaveEdit = async () => {
    const updated: PatientRecord = {
      ...patient,
      displayName: editForm.displayName.trim(),
      demographics: {
        ageRange: editForm.ageRange.trim() || undefined,
        gender: editForm.gender.trim() || undefined,
        occupation: editForm.occupation.trim() || undefined,
      },
      tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      confidentiality: {
        ...patient.confidentiality,
        accessLevel: editForm.confidentialityLevel,
        pii: patient.confidentiality?.pii ?? false,
      },
    }
    await onUpdatePatient(updated)
    setIsEditing(false)
  }

  // Depth calculation
  const depth = stats
    ? Math.min(100, stats.sessionCount * 15 + stats.memoryCount * 12)
    : 0
  const depthColor =
    depth <= 30 ? 'bg-muted-foreground/30' : depth <= 60 ? 'bg-clarity-blue-400' : 'bg-gradient-to-r from-clarity-blue-500 to-academic-plum-500'

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
      {/* Case Header */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-border/20">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground font-sans truncate">
              {patient.displayName}
            </h1>
            {(patient.demographics?.ageRange || patient.demographics?.gender || patient.demographics?.occupation) && (
              <p className="text-sm text-muted-foreground mt-1 font-sans">
                {[
                  patient.demographics?.ageRange && `${patient.demographics.ageRange} años`,
                  patient.demographics?.gender,
                  patient.demographics?.occupation,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
            {patient.tags && patient.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {patient.tags.map((tag, i) => (
                  <span key={i} className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground border border-border/30">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/50 font-sans">
              <span>Creado: {format(patient.createdAt, "d MMM yyyy", { locale: es })}</span>
              <span>Última actividad: {formatDistanceToNow(patient.updatedAt, { addSuffix: true, locale: es })}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="flex-shrink-0 gap-1.5 rounded-lg border-border/40 h-9 text-sm font-sans"
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>

        {/* Full-width depth bar */}
        {depth > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-muted/40 overflow-hidden" role="meter" aria-valuenow={depth} aria-valuemin={0} aria-valuemax={100} aria-label={`Profundidad clínica: ${depth}%`}>
              <div className={cn('h-full rounded-full transition-all duration-500 ease-out', depthColor)} style={{ width: `${depth}%` }} />
            </div>
            <span className="text-xs text-muted-foreground/50 font-sans whitespace-nowrap">
              {stats?.sessionCount || 0} sesiones · {stats?.memoryCount || 0} memorias
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 grid grid-rows-[auto_1fr] min-h-0">
        <TabsList className="mx-6 mt-3 mb-0 h-10 bg-transparent border-b border-border/20 rounded-none justify-start gap-0 px-0">
          <TabsTrigger value="resumen" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 text-sm font-sans">
            Resumen
          </TabsTrigger>
          <TabsTrigger value="sesiones" aria-label={stats && stats.sessionCount > 0 ? `Sesiones, ${stats.sessionCount} registros` : 'Sesiones'} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 text-sm font-sans">
            Sesiones{stats && stats.sessionCount > 0 && <Badge variant="secondary" className="ml-1.5 h-5 text-[10px]">{stats.sessionCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="memorias" aria-label={stats && stats.memoryCount > 0 ? `Memorias, ${stats.memoryCount} registros` : 'Memorias'} className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 text-sm font-sans">
            Memorias{stats && stats.memoryCount > 0 && <Badge variant="secondary" className="ml-1.5 h-5 text-[10px]">{stats.memoryCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="notas" className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 text-sm font-sans">
            Notas
          </TabsTrigger>
        </TabsList>

        {/* ── Resumen ── */}
        <TabsContent value="resumen" className="overflow-y-auto min-h-0 mt-0 px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Demographics card */}
            <div className="rounded-xl border border-border/30 bg-card/50 p-5">
              <h3 className="text-sm font-semibold text-foreground font-sans mb-3">Datos del caso</h3>
              <dl className="space-y-2.5 text-sm font-sans">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Identificador</dt>
                  <dd className="text-foreground font-medium">{patient.displayName}</dd>
                </div>
                {patient.demographics?.ageRange && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Edad</dt>
                    <dd className="text-foreground">{patient.demographics.ageRange} años</dd>
                  </div>
                )}
                {patient.demographics?.gender && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Género</dt>
                    <dd className="text-foreground">{patient.demographics.gender}</dd>
                  </div>
                )}
                {patient.demographics?.occupation && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ocupación</dt>
                    <dd className="text-foreground">{patient.demographics.occupation}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Confidencialidad</dt>
                  <dd className="text-foreground capitalize">{patient.confidentiality?.accessLevel || 'medio'}</dd>
                </div>
              </dl>
            </div>

            {/* Stats card */}
            <div className="rounded-xl border border-border/30 bg-card/50 p-5">
              <h3 className="text-sm font-semibold text-foreground font-sans mb-3">Actividad clínica</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-clarity-blue-50 dark:bg-clarity-blue-900/20 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-clarity-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground font-sans">{stats?.sessionCount || 0} sesiones</p>
                    <p className="text-xs text-muted-foreground font-sans">Conversaciones clínicas</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-academic-plum-50 dark:bg-academic-plum-900/20 flex items-center justify-center">
                    <Brain className="h-4 w-4 text-academic-plum-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground font-sans">{stats?.memoryCount || 0} memorias</p>
                    <p className="text-xs text-muted-foreground font-sans">Datos clínicos persistentes</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-serene-teal-50 dark:bg-serene-teal-900/20 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-serene-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground font-sans">{documents.length || 0} documentos</p>
                    <p className="text-xs text-muted-foreground font-sans">Documentos clínicos generados por IA</p>
                  </div>
                </div>
                {hasInsights && (
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground font-sans">Análisis disponible</p>
                      <p className="text-xs text-muted-foreground font-sans">Patrones longitudinales detectados</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Notes preview */}
            <div className="rounded-xl border border-border/30 bg-card/50 p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground font-sans">Notas clínicas</h3>
                <Button variant="ghost" size="sm" className="h-7 text-xs font-sans" onClick={() => setActiveTab('notas')}>
                  Editar
                </Button>
              </div>
              {patient.notes ? (
                <p className="text-sm text-muted-foreground font-sans line-clamp-3 whitespace-pre-wrap">{patient.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground/50 font-sans italic">Sin notas clínicas. Usa la pestaña Notas para agregar.</p>
              )}
            </div>

            {/* Latest memories preview */}
            {memories.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card/50 p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground font-sans">Últimas memorias clínicas</h3>
                  <Button variant="ghost" size="sm" className="h-7 text-xs font-sans gap-1" onClick={() => setActiveTab('memorias')}>
                    Ver todas <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {memories.slice(0, 3).map((mem) => {
                    const catConfig = MEMORY_CATEGORY_CONFIG[mem.category]
                    return (
                      <div key={mem.memoryId} className="flex items-start gap-2">
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5', catConfig.bgLight, catConfig.bgDark, catConfig.color)}>
                          {catConfig.label}
                        </span>
                        <p className="text-xs text-muted-foreground font-sans line-clamp-1 flex-1">{mem.content}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Sesiones ── */}
        <TabsContent value="sesiones" className="overflow-y-auto min-h-0 mt-0 px-6 py-5">
          <div className="space-y-3">
            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
                ))}
              </div>
            ) : sessionsError ? (
              <div className="text-center py-16">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/40" />
                <p className="text-sm text-destructive font-sans">{sessionsError}</p>
                <Button variant="outline" size="sm" onClick={loadSessions} className="mt-3 text-xs font-sans gap-1.5 rounded-lg">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </Button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-16">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-15 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground font-sans">Sin sesiones registradas</p>
                <p className="text-xs text-muted-foreground mt-1 font-sans">
                  Las sesiones aparecen aquí automáticamente al consultar con Aurora sobre este caso.
                </p>
              </div>
            ) : (
              sessions.map((session) => {
                const agentConfig = session.activeAgent ? getAgentVisualConfigSafe(session.activeAgent as any) : null
                return (
                  <div key={session.sessionId} className="rounded-xl border border-border/30 bg-card/50 p-4 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/50" />
                          <span className="text-sm font-medium text-foreground font-sans">
                            {format(session.createdAt, "d MMM yyyy, HH:mm", { locale: es })}
                          </span>
                          {agentConfig && (
                            <Badge variant="outline" className="text-[10px] h-5 gap-1">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agentConfig.bgColor }} />
                              {agentConfig.name}
                            </Badge>
                          )}
                        </div>
                        {session.title && (
                          <p className="text-sm text-muted-foreground font-sans truncate">{session.title}</p>
                        )}
                        {session.messageCount && (
                          <p className="text-xs text-muted-foreground/50 font-sans mt-1">{session.messageCount} mensajes</p>
                        )}
                      </div>
                      {onConversationSelect && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onConversationSelect(session.sessionId)}
                          className="h-8 text-xs font-sans gap-1 flex-shrink-0"
                        >
                          Ver en chat
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>

        {/* ── Memorias ── */}
        <TabsContent value="memorias" className="overflow-y-auto min-h-0 mt-0 px-6 py-5">
          <div className="space-y-6">
            {/* Memories section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground font-sans">Memorias Clínicas</h3>
                {memories.length > 0 && (
                  <Button variant="outline" size="sm" onClick={loadMemories} className="h-8 text-xs font-sans rounded-lg gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                  </Button>
                )}
              </div>

              {memoriesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 rounded-xl bg-secondary/30 animate-pulse" />
                  ))}
                </div>
              ) : memoriesError ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive/40" />
                  <p className="text-sm text-destructive font-sans">{memoriesError}</p>
                  <Button variant="outline" size="sm" onClick={loadMemories} className="mt-3 text-xs font-sans gap-1.5 rounded-lg">
                    <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                  </Button>
                </div>
              ) : memories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="h-10 w-10 mx-auto mb-3 opacity-15 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground font-sans">Sin memorias clínicas</p>
                  <p className="text-xs text-muted-foreground mt-1 font-sans max-w-[320px] mx-auto">
                    Las memorias se generan automáticamente durante las sesiones con Aurora. Cada conversación extrae observaciones, patrones y preferencias terapéuticas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {memories.map((mem) => {
                    const catConfig = MEMORY_CATEGORY_CONFIG[mem.category]
                    return (
                      <div key={mem.memoryId} className="rounded-xl border border-border/30 bg-card/50 p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', catConfig.bgLight, catConfig.bgDark)}>
                            <Brain className={cn('h-4 w-4', catConfig.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium', catConfig.bgLight, catConfig.bgDark, catConfig.color)}>
                                {catConfig.label}
                              </span>
                              {mem.confidence >= 0.8 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-serene-teal-600">
                                  <ShieldCheck className="h-3 w-3" /> Alta confianza
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground/40 ml-auto">
                                {formatDistanceToNow(mem.updatedAt, { addSuffix: true, locale: es })}
                              </span>
                            </div>
                            <p className="text-sm text-foreground/80 font-sans leading-relaxed">{mem.content}</p>
                            {mem.tags && mem.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {mem.tags.map((tag, i) => (
                                  <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                                    <Tag className="h-2.5 w-2.5" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {mem.sourceSessionIds && mem.sourceSessionIds.length > 0 && (
                              <p className="text-[10px] text-muted-foreground/40 mt-1.5 font-sans">
                                Extraída de {mem.sourceSessionIds.length} {mem.sourceSessionIds.length === 1 ? 'sesión' : 'sesiones'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Documents section — collapsible */}
            <div className="border-t border-border/20 pt-5">
              <button
                type="button"
                onClick={() => setDocumentsExpanded(!documentsExpanded)}
                className="flex items-center justify-between w-full mb-4 group"
              >
                <h3 className="text-sm font-semibold text-foreground font-sans flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-academic-plum-500" />
                  Documentos Clínicos
                  {documents.length > 0 && (
                    <Badge variant="secondary" className="h-5 text-[10px]">{documents.length}</Badge>
                  )}
                </h3>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', documentsExpanded && 'rotate-180')} />
              </button>

              {documentsExpanded && (
                <>
                  {documentsLoading ? (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
                      ))}
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-15 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground font-sans">Sin documentos clínicos generados</p>
                      <p className="text-xs text-muted-foreground/50 mt-1 font-sans">
                        Pide a Aurora que genere un documento SOAP, DAP o resumen de caso.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents.map((doc) => (
                        <div key={doc.id} className="rounded-xl border border-border/30 bg-card/50 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-[10px] h-5 gap-1">
                              <FileText className="h-3 w-3" />
                              {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                              <Sparkles className="h-2.5 w-2.5" />
                              {doc.createdBy === 'ai' ? 'IA' : 'Manual'}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground/40 font-sans ml-auto">
                              {format(doc.createdAt, "d MMM yyyy, HH:mm", { locale: es })}
                            </span>
                          </div>
                          {doc.markdown && (
                            <p className="text-xs text-muted-foreground font-sans line-clamp-3 whitespace-pre-wrap">
                              {doc.markdown.replace(/^#+\s+/gm, '').slice(0, 300)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Notas ── */}
        <TabsContent value="notas" className="overflow-hidden min-h-0 mt-0 px-6 py-5 flex flex-col">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground font-sans">Notas Clínicas</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/50 font-sans">
                {notesSaving && <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>}
                {notesSaved && <><Save className="h-3 w-3 text-serene-teal-500" /> Guardado ✓</>}
                {notesSaveError && (
                  <span className="text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {notesSaveError}
                  </span>
                )}
                <span>{notes.length} caracteres</span>
              </div>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setNotesSaved(false); setNotesSaveError(null) }}
              onBlur={saveNotes}
              placeholder="Escribe notas clínicas sobre este caso..."
              aria-label="Notas clínicas del caso"
              className="flex-1 min-h-[200px] rounded-xl border-border/30 text-sm font-sans resize-none focus-visible:ring-clarity-blue-200"
            />
          </div>
        </TabsContent>

      </Tabs>

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans text-xl">Editar Caso Clínico</DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground">
              Modifica la información del caso.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">Identificador *</Label>
              <Input id="edit-name" value={editForm.displayName} onChange={(e) => setEditForm(p => ({ ...p, displayName: e.target.value }))} className="h-10 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Rango de edad</Label>
                <Input value={editForm.ageRange} onChange={(e) => setEditForm(p => ({ ...p, ageRange: e.target.value }))} placeholder="25-30" className="h-10 rounded-lg" />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm font-medium">Género</Label>
                <Input value={editForm.gender} onChange={(e) => setEditForm(p => ({ ...p, gender: e.target.value }))} placeholder="Femenino" className="h-10 rounded-lg" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Ocupación</Label>
              <Input value={editForm.occupation} onChange={(e) => setEditForm(p => ({ ...p, occupation: e.target.value }))} placeholder="Estudiante" className="h-10 rounded-lg" />
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Áreas de enfoque</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm(p => ({ ...p, tags: e.target.value }))} placeholder="ansiedad, trauma, relaciones" className="h-10 rounded-lg" />
              <p className="text-xs text-muted-foreground">Separa con comas</p>
            </div>
            <div className="grid gap-2">
              <Label className="text-sm font-medium">Confidencialidad</Label>
              <Select value={editForm.confidentialityLevel} onValueChange={(v: any) => setEditForm(p => ({ ...p, confidentialityLevel: v }))}>
                <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="medium">Medio</SelectItem>
                  <SelectItem value="low">Bajo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-lg">Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={!editForm.displayName.trim()} className="rounded-lg bg-foreground text-background hover:bg-foreground/90">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state when no case is selected
// ---------------------------------------------------------------------------

export function CaseDetailEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/5">
      <div className="text-center px-8">
        <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground/15" />
        <h2 className="text-base font-medium text-muted-foreground/60 font-sans">
          Selecciona un caso clínico
        </h2>
        <p className="text-sm text-muted-foreground/40 mt-1 font-sans max-w-[300px] mx-auto">
          Elige un caso del panel izquierdo para ver su información completa.
        </p>
      </div>
    </div>
  )
}
