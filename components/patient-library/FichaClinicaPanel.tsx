"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { PatternMirrorPanel } from "@/components/pattern-mirror-panel"
import { usePatternMirror } from "@/hooks/use-pattern-mirror"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { 
  FileText, 
  RefreshCw, 
  Download, 
  Copy, 
  XCircle, 
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  TrendingUp,
  Check
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "@/hooks/use-toast"
import { parseMarkdown } from "@/lib/markdown-parser"
import type { FichaClinicaState, PatientRecord } from "@/types/clinical-types"

interface FichaClinicaPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: PatientRecord
  fichas: FichaClinicaState[]
  onRefresh: () => Promise<void>
  onGenerate: () => Promise<void>
  isGenerating?: boolean
  onCancelGeneration?: () => void
  canRevert?: boolean
  onRevert?: () => Promise<void>
  initialTab?: "ficha" | "insights"
}

export function FichaClinicaPanel({ open, onOpenChange, patient, fichas, onRefresh, onGenerate, isGenerating = false, onCancelGeneration, canRevert = false, onRevert, initialTab = "ficha" }: FichaClinicaPanelProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const { pendingCount, loadLatestAnalysis } = usePatternMirror()
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [copiedFicha, setCopiedFicha] = useState(false)
  const copyResetTimeoutRef = useRef<number | null>(null)
  
  // Update tab when initialTab changes and panel opens
  useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab)
    }
  }, [open, initialTab])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  const copyFichaContent = async (markdownContent: string) => {
    const htmlContent = parseMarkdown(markdownContent)

    const fallbackCopyPlainText = (text: string): boolean => {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.top = '0'
        textarea.style.left = '0'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textarea)
        return successful
      } catch {
        return false
      }
    }

    let copied = false
    try {
      const clipboard: any = (navigator as any).clipboard
      const ClipboardItemCtor: any = (window as any).ClipboardItem
      if (clipboard && typeof clipboard.write === 'function' && ClipboardItemCtor) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' })
        const textBlob = new Blob([markdownContent], { type: 'text/plain' })
        const item = new ClipboardItemCtor({ 'text/html': htmlBlob, 'text/plain': textBlob })
        await clipboard.write([item])
        copied = true
      }
    } catch {
      // ignore and try next method
    }

    if (!copied) {
      try {
        await navigator.clipboard.writeText(markdownContent)
        copied = true
      } catch {
        copied = fallbackCopyPlainText(markdownContent)
      }
    }

    if (copied) {
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      setCopiedFicha(true)
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedFicha(false)
        copyResetTimeoutRef.current = null
      }, 1500)

      toast({
        title: "Contenido copiado",
        description: "Se copió la ficha con formato clínico renderizado.",
        variant: "default"
      })
    } else {
      toast({
        title: "No se pudo copiar",
        description: "Intenta nuevamente o copia manualmente el contenido.",
        variant: "destructive"
      })
    }
  }
  
  const latest = useMemo(() => {
    if (!fichas || fichas.length === 0) return null
    // Assume latest by ultimaActualizacion
    return [...fichas].sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]
  }, [fichas])

  // Get pending insights count for this patient
  const [patientPendingCount, setPatientPendingCount] = useState(0)
  
  useEffect(() => {
    const loadPendingCount = async () => {
      if (!patient?.id) return
      const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage')
      const storage = getPatternAnalysisStorage()
      await storage.initialize()
      const pending = await storage.getPendingReviewAnalyses()
      const count = pending.filter(a => a.patientId === patient.id).length
      setPatientPendingCount(count)
    }
    
    if (open && patient?.id) {
      loadPendingCount()
    }
  }, [open, patient?.id, pendingCount])

  useEffect(() => {
    // noop for now
  }, [latest])

  /**
   * Generate Longitudinal Analysis for the patient
   */
  const handleGeneratePatternInsights = async () => {
    try {
      setIsGeneratingInsights(true)

      console.log('🔍 [Análisis Longitudinal] Panel trigger clicked for patient:', patient.displayName, patient.id)

      // Notify start: background-safe hint
      toast({
        title: "Análisis iniciado",
        description: "El análisis longitudinal se está generando en segundo plano. Puede cerrar esta ventana y volver cuando guste.",
        variant: "default"
      })

      // Get ALL saved sessions for this patient from storage
      const { clinicalStorage } = await import('@/lib/clinical-context-storage')
      const { useHopeAISystem } = await import('@/hooks/use-hopeai-system')
      
      await clinicalStorage.initialize()
      
      // Get system state for userId
      const systemState = (window as any).__hopeai_system_state__?.systemState || { userId: 'demo_user' }
      
      const allSessions = await clinicalStorage.getUserSessions(systemState.userId || 'demo_user')
      
      // Filter sessions that belong to this patient
      const patientSessions = allSessions.filter(session => 
        session.clinicalContext?.patientId === patient.id
      )

      console.log('📊 [Análisis Longitudinal] Found patient sessions:', patientSessions.length)

      // Combine all messages from all patient sessions
      const allMessages: any[] = []
      patientSessions.forEach(session => {
        if (session.history && session.history.length > 0) {
          allMessages.push(...session.history)
        }
      })

      // Count user messages (each represents a session interaction)
      const userMessageCount = allMessages.filter(msg => msg.role === 'user').length

      console.log('📊 [Análisis Longitudinal] Total messages:', allMessages.length, 'User messages:', userMessageCount)

      if (userMessageCount < 3) {
        toast({
          title: "Sesiones insuficientes",
          description: `Se necesitan al menos 3 sesiones para generar insights significativos. Actualmente: ${userMessageCount} sesiones.`,
          variant: "default"
        })
        return
      }

      // Call Pattern Analysis API with all patient messages
      const response = await fetch(`/api/patients/${encodeURIComponent(patient.id)}/pattern-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionHistory: allMessages,
          patientName: patient.displayName,
          triggerReason: 'manual_request',
          culturalContext: 'general'
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al generar análisis')
      }

      console.log('✅ [Análisis Longitudinal] Analysis received from server:', data.analysisId)

      // Save analysis to IndexedDB (client-side storage)
      const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage')
      const storage = getPatternAnalysisStorage()
      await storage.initialize()

      const analysisState = {
        analysisId: data.analysisId,
        patientId: data.patientId,
        status: 'completed' as const,
        analysis: data.analysis,
        createdAt: new Date(data.createdAt),
        completedAt: new Date(),
        viewCount: 0
      }

      await storage.saveAnalysisState(analysisState)

      console.log('💾 [Análisis Longitudinal] Analysis saved to IndexedDB:', data.analysisId)

      toast({
        title: "Análisis completado",
        description: `Análisis longitudinal generado exitosamente. ${userMessageCount} sesiones analizadas.`,
        variant: "default"
      })

      // Refresh the analysis in the panel
      await loadLatestAnalysis(patient.id)

      // Refresh insights count
      const pending = await storage.getPendingReviewAnalyses()
      const count = pending.filter(a => a.patientId === patient.id).length
      setPatientPendingCount(count)

    } catch (err) {
      console.error('❌ [Análisis Longitudinal] Error generating insights:', err)
      
      toast({
        title: "Error al generar análisis",
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: "destructive"
      })
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  const statusConfig: Record<FichaClinicaState['estado'], { 
    label: string
    icon: React.ReactNode
    className: string
    dotClassName: string
  }> = {
    generando: { 
      label: 'Generando', 
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className: 'bg-blue-50 text-blue-700 border-blue-200/50',
      dotClassName: 'bg-blue-500 animate-pulse'
    },
    actualizando: { 
      label: 'Actualizando', 
      icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" />,
      className: 'bg-primary/10 text-primary border-primary/20',
      dotClassName: 'bg-primary animate-pulse'
    },
    completado: { 
      label: 'Actualizada', 
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
      dotClassName: 'bg-emerald-500'
    },
    error: { 
      label: 'Error', 
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      className: 'bg-destructive/10 text-destructive border-destructive/20',
      dotClassName: 'bg-destructive'
    },
  }

  const renderStatusBadge = () => {
    if (!latest?.estado) return null
    // Don't show badge for completed state
    if (latest.estado === 'completado') return null

    
    const config = statusConfig[latest.estado]
    
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 font-medium text-xs transition-all duration-300",
          config.className
        )}
      >
        {config.icon}
        <span>{config.label}</span>
      </Badge>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="sm:max-w-2xl w-full paper-noise flex flex-col p-0 gap-0"
      >
        {/* Modern Header with gradient */}
        <div className="shrink-0 border-b border-border/50 bg-gradient-to-b from-secondary/30 to-background/50 backdrop-blur-sm">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                    {activeTab === "ficha" ? (
                      <FileText className="h-5 w-5 text-primary" />
                    ) : (
                      <TrendingUp className="h-5 w-5 text-purple-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="font-sans text-2xl text-foreground tracking-tight mb-0.5">
                      {patient.displayName}
                    </SheetTitle>
                    <SheetDescription className="font-sans text-sm font-medium text-muted-foreground truncate">
                      Documentación clínica e insights de desarrollo
                    </SheetDescription>
                  </div>
                </div>
                {/* Metadata row - moved under patient name */}
                {latest && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 font-sans ml-[52px]">
                    <Clock className="h-3 w-3 opacity-60" />
                    <span>
                      Actualizada {formatDistanceToNow(new Date(latest.ultimaActualizacion), { 
                        addSuffix: true, 
                        locale: es 
                      })}
                    </span>
                  </div>
                )}
              </div>
              {renderStatusBadge()}
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="px-6 pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-11 p-1">
                <TabsTrigger value="ficha" className="font-sans flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  Ficha Clínica
                </TabsTrigger>
                <TabsTrigger value="insights" className="font-sans flex items-center gap-2 text-sm relative">
                  <TrendingUp className="h-4 w-4" />
                  Análisis Longitudinal
                  {patientPendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
                      {patientPendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Action toolbar - only show on ficha tab */}
          {activeTab === "ficha" && (
            <div className="px-6 pb-4 pt-4">
              <TooltipProvider delayDuration={500} skipDelayDuration={0}>
                <div className="flex items-center gap-2 flex-wrap">
                {/* Primary actions */}
                <div className="flex gap-2">
                  {!isGenerating && (
                    <Tooltip delayDuration={500}>
                      <TooltipTrigger asChild>
                        <Button 
                          size="sm"
                          onClick={onGenerate} 
                          disabled={isGenerating}
                          className="h-9 px-4 rounded-lg bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/95 hover:via-primary/90 hover:to-primary/85 text-white shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
                          onPointerDown={(e) => e.preventDefault()}
                        >
                          {/* Subtle shine effect overlay */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                          
                          <span className="font-sans font-medium text-white relative z-10">Actualizar Ficha</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs" sideOffset={5}>
                        Regenera la ficha con la información más reciente
                      </TooltipContent>
                    </Tooltip>
                  )}
                  
                  {isGenerating && onCancelGeneration && (
                    <Button 
                      size="sm"
                      variant="destructive" 
                      onClick={onCancelGeneration}
                      className="h-9 gap-2 rounded-lg shadow-sm hover:shadow-md transition-all"
                    >
                      <XCircle className="h-4 w-4" />
                      <span className="font-sans font-medium">Cancelar</span>
                    </Button>
                  )}

                  {canRevert && onRevert && !isGenerating && (
                    <Tooltip delayDuration={500}>
                      <TooltipTrigger asChild>
                        <Button 
                          size="sm"
                          variant="outline" 
                          onClick={onRevert} 
                          className="h-9 gap-2 rounded-lg text-orange-600 border-orange-300 hover:bg-orange-50 hover:border-orange-400 transition-all"
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="font-sans font-medium">Revertir</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs" sideOffset={5}>
                        Descartar cambios y volver a la versión anterior
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Divider */}
                {latest?.contenido && (
                  <div className="h-6 w-px bg-border/50 mx-1" />
                )}

                {/* Secondary actions */}
                <div className="flex gap-1.5">
                  {latest?.contenido && (
                    <>
                      <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyFichaContent(latest.contenido)}
                            aria-label={copiedFicha ? "Contenido copiado" : "Copiar ficha clínica"}
                            title={copiedFicha ? "Contenido copiado" : "Copiar ficha clínica"}
                            className="h-9 w-9 p-0 rounded-lg hover:bg-secondary/80 transition-all"
                          >
                            {copiedFicha ? (
                              <Check className="h-4 w-4 text-emerald-600 animate-in fade-in zoom-in-50 duration-150" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs" sideOffset={5}>
                          Copiar al portapapeles
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const blob = new Blob([latest.contenido], { type: 'text/markdown;charset=utf-8' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `${patient.displayName.replace(/\s+/g, '_')}_ficha.md`
                              document.body.appendChild(a)
                              a.click()
                              a.remove()
                              URL.revokeObjectURL(url)
                            }}
                            className="h-9 w-9 p-0 rounded-lg hover:bg-secondary/80 transition-all"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs" sideOffset={5}>
                          Descargar
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
            </TooltipProvider>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <TabsContent value="ficha" className="h-full mt-0">
              <ScrollArea className="h-full">
                <div className="px-6 py-6">
              {!latest && (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="h-20 w-20 rounded-2xl bg-secondary/50 flex items-center justify-center mb-6 ring-1 ring-border/30">
                    <FileText className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                  <h3 className="font-sans text-lg font-semibold text-foreground mb-2">
                    No hay ficha disponible
                  </h3>
                  <p className="font-sans text-sm text-muted-foreground text-center max-w-sm mb-6">
                    Genera una ficha clínica para visualizar un resumen estructurado de la información del paciente.
                  </p>
                  <Button 
                    onClick={onGenerate}
                    disabled={isGenerating}
                    className="rounded-lg shadow-sm hover:shadow-md transition-all bg-gradient-to-r from-primary via-primary to-primary/90 hover:from-primary/95 hover:via-primary/90 hover:to-primary/85 text-white relative overflow-hidden group"
                  >
                    {/* Subtle shine effect overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    
                    <span className="font-sans relative z-10">Generar Ficha Clínica</span>
                  </Button>
                </div>
              )}

              {latest && latest.estado !== 'completado' && latest.estado !== 'error' && (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="font-sans text-sm font-medium text-muted-foreground">
                      {latest.estado === 'generando' ? 'Generando ficha clínica...' : 'Actualizando...'}
                    </span>
                  </div>
                  {/* Elegant loading skeleton */}
                  <div className="space-y-4 animate-pulse">
                    <div className="h-8 bg-gradient-to-r from-muted via-muted/60 to-muted rounded-lg" />
                    <div className="space-y-2">
                      <div className="h-4 bg-gradient-to-r from-muted via-muted/60 to-muted rounded w-full" />
                      <div className="h-4 bg-gradient-to-r from-muted via-muted/60 to-muted rounded w-5/6" />
                      <div className="h-4 bg-gradient-to-r from-muted via-muted/60 to-muted rounded w-4/6" />
                    </div>
                    <div className="h-6 bg-gradient-to-r from-muted via-muted/60 to-muted rounded-lg w-3/4 mt-6" />
                    <div className="space-y-2">
                      <div className="h-4 bg-gradient-to-r from-muted via-muted/60 to-muted rounded w-full" />
                      <div className="h-4 bg-gradient-to-r from-muted via-muted/60 to-muted rounded w-4/5" />
                    </div>
                  </div>
                </div>
              )}

              {latest && latest.estado === 'completado' && (
                <div className="prose prose-sans prose-sm max-w-none">
                  <MarkdownRenderer content={latest.contenido} />
                </div>
              )}

              {latest && latest.estado === 'error' && (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="h-20 w-20 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6 ring-1 ring-destructive/20">
                    <AlertCircle className="h-10 w-10 text-destructive" />
                  </div>
                  <h3 className="font-sans text-lg font-semibold text-foreground mb-2">
                    Error al generar la ficha
                  </h3>
                  <p className="font-sans text-sm text-muted-foreground text-center max-w-sm mb-6">
                    Ocurrió un problema al intentar generar la ficha clínica. Por favor, intenta nuevamente.
                  </p>
                  <Button 
                    onClick={onGenerate}
                    disabled={isGenerating}
                    variant="outline"
                    className="gap-2 rounded-lg"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Intentar de nuevo
                  </Button>
                </div>
              )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="insights" className="h-full mt-0">
              <ScrollArea className="h-full">
                <div className="px-6 py-6">
                  <PatternMirrorPanel
                    patientId={patient.id}
                    patientName={patient.displayName}
                    onGenerate={handleGeneratePatternInsights}
                    isGenerating={isGeneratingInsights}
                  />
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default FichaClinicaPanel


