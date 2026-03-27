"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ListIcon, UserCircleIcon, BookOpenIcon, SunIcon, MoonIcon, FileIcon, CalendarBlankIcon, XIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import type { PatientSessionMeta, FichaClinicaState } from "@/types/clinical-types"
import { usePatientRecord } from "@/hooks/use-patient-library"
import { clinicalStorage } from "@/lib/clinical-context-storage"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { DisplaySettingsPopover } from "@/components/display-settings-popover"

interface HeaderProps {
  onHistoryToggle?: () => void
  sessionMeta?: PatientSessionMeta | null
  onClearPatientContext?: () => void
  hasActiveSession?: boolean
}

export function Header({ onHistoryToggle, sessionMeta, onClearPatientContext, hasActiveSession = false }: HeaderProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const patientId = sessionMeta?.patient?.reference
  const { patient } = usePatientRecord(patientId || null)
  
  const [fichas, setFichas] = useState<FichaClinicaState[]>([])
  const [showFichaPreview, setShowFichaPreview] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [canShowPreview, setCanShowPreview] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  
  const isPatientSession = !!(sessionMeta && patient)
  const patientName = patient?.displayName
  const ultimaFicha = fichas.length > 0 ? fichas[0] : null
  
  // Detectar si es dispositivo táctil
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window)
  }, [])
  
  // CRÍTICO: Evitar que el preview se abra automáticamente cuando recién aparece el badge
  // Dar un delay para que el usuario pueda mover el mouse intencionalmente
  useEffect(() => {
    if (isPatientSession) {
      // Resetear permiso al cambiar de paciente
      setCanShowPreview(false)
      setShowFichaPreview(false)
      setIsClosing(false)
      
      // Dar 300ms para que el cursor se estabilice después del click
      const timer = setTimeout(() => {
        setCanShowPreview(true)
      }, 300)
      
      return () => clearTimeout(timer)
    } else {
      setCanShowPreview(false)
      setShowFichaPreview(false)
      setIsClosing(false)
    }
  }, [isPatientSession, patientId])
  
  // Función helper para cerrar el preview con protección temporal
  const handleClosePreview = () => {
    setShowFichaPreview(false)
    setIsClosing(true)
    
    // Protección temporal de 500ms para evitar reaperturas inmediatas
    setTimeout(() => {
      setIsClosing(false)
    }, 500)
  }
  
  // Cargar fichas clínicas del paciente
  useEffect(() => {
    if (patientId) {
      clinicalStorage.getFichasClinicasByPaciente(patientId)
        .then(items => {
          const sorted = items.sort((a, b) => 
            new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime()
          )
          setFichas(sorted)
        })
        .catch(err => {
          console.error('Error cargando fichas:', err)
          setFichas([])
        })
    } else {
      setFichas([])
    }
  }, [patientId])

  return (
    <header className="sticky top-0 left-0 right-0 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between z-50 border-b border-border backdrop-blur-sm bg-background/95">
      {/* Gradient background for subtle separation - only in light mode */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background/0 pointer-events-none" />

      <div className="relative flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-clarity-blue-600 dark:hover:text-clarity-blue-400 hover:bg-clarity-blue-50 dark:hover:bg-clarity-blue-900/30"
          onClick={onHistoryToggle}
        >
          <ListIcon className="h-5 w-5" weight="bold" />
        </Button>
        
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-clarity-blue-600 via-serene-teal-600 to-academic-plum-600 dark:from-clarity-blue-400 dark:via-serene-teal-400 dark:to-academic-plum-400 bg-clip-text text-transparent">
              Aurora
            </h1>
          </div>
        </div>
        
        {isPatientSession && (
          <div className="flex items-center gap-1.5 md:gap-2 ml-2 md:ml-4 min-w-0 flex-1">
            <div className="hidden md:block h-4 w-px bg-border flex-shrink-0"></div>
            <div 
              className="relative flex items-center gap-1 md:gap-1.5 min-w-0"
              onMouseEnter={() => !isTouchDevice && canShowPreview && setShowFichaPreview(true)}
              onMouseLeave={() => !isTouchDevice && setShowFichaPreview(false)}
            >
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 cursor-help transition-all min-w-0",
                  "bg-serene-teal-50 dark:bg-serene-teal-900/40 border-serene-teal-200 dark:border-serene-teal-700 hover:bg-serene-teal-100 dark:hover:bg-serene-teal-800/50",
                  showFichaPreview && "bg-serene-teal-100 dark:bg-serene-teal-800/50"
                )}
                onClick={(e) => {
                  if (isTouchDevice) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                }}
                onTouchStart={(e) => {
                  if (!canShowPreview || isClosing) return
                  e.preventDefault()
                  e.stopPropagation()
                  setShowFichaPreview(!showFichaPreview)
                }}
              >
                <UserCircleIcon className="h-3 w-3 md:h-3.5 md:w-3.5 text-serene-teal-600 dark:text-serene-teal-400 flex-shrink-0" />
                <span className="text-xs font-semibold text-serene-teal-900 dark:text-serene-teal-100 truncate max-w-[100px] md:max-w-none">{patientName}</span>
                {ultimaFicha && (
                  <FileIcon className="hidden md:block h-3.5 w-3.5 text-serene-teal-500 dark:text-serene-teal-400 flex-shrink-0" />
                )}
              </Badge>
              
              {/* Botón elegante para limpiar contexto - solo visible antes de enviar el primer mensaje */}
              {!hasActiveSession && onClearPatientContext && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClearPatientContext()
                  }}
                  className="group relative flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-full bg-secondary hover:bg-destructive/10 dark:hover:bg-destructive/20 border border-border hover:border-destructive/20 dark:hover:border-destructive/40 transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0"
                  title="Remover contexto del paciente"
                >
                  <XIcon className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground group-hover:text-destructive transition-colors duration-200" />
                  
                  {/* Efecto de resplandor sutil al hover */}
                  <div className="absolute inset-0 rounded-full bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 blur-sm" />
                </button>
              )}
              
              {/* Puente invisible para mantener hover activo en desktop */}
              {ultimaFicha && showFichaPreview && canShowPreview && (
                <div className="hidden md:block absolute top-full left-0 right-0 h-3 z-[60]" />
              )}

              {/* Ficha Preview Popover - Interactivo y con Scroll */}
              {ultimaFicha && showFichaPreview && canShowPreview && (
                <div
                  className="fixed inset-0 z-[70] flex items-start justify-center pt-20 px-4 md:absolute md:inset-auto md:top-full md:left-0 md:mt-2 md:pt-0 md:px-0"
                  onMouseEnter={() => !isTouchDevice && setShowFichaPreview(true)}
                  onClick={(e) => {
                    // Cerrar al hacer clic en el overlay (solo mobile)
                    if (e.target === e.currentTarget) {
                      handleClosePreview()
                    }
                  }}
                >
                  {/* Overlay oscuro solo en mobile */}
                  <div className="absolute inset-0 bg-black/20 backdrop-blur-sm md:hidden" />
                  
                  {/* Popover Card - Interactivo */}
                  <div 
                    className="relative bg-popover border border-border rounded-lg shadow-2xl w-full max-w-2xl md:max-w-[520px] md:min-w-[420px] animate-in fade-in slide-in-from-top-4 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header con botón de cerrar */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold font-sans">Ficha Clínica</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(ultimaFicha.ultimaActualizacion), { 
                            addSuffix: true, 
                            locale: es 
                          })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClosePreview()
                          }}
                          className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Cerrar"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Contenido con Scroll - Altura fija para permitir scroll */}
                    <div className="h-[60vh] md:h-[450px] overflow-y-auto px-4 py-3">
                      {ultimaFicha.estado === 'completado' && ultimaFicha.contenido ? (
                        <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
                          <MarkdownRenderer 
                            content={ultimaFicha.contenido}
                            className="text-sm"
                            trusted={true}
                          />
                        </div>
                      ) : ultimaFicha.estado === 'generando' ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Generando ficha clínica...</span>
                        </div>
                      ) : ultimaFicha.estado === 'error' ? (
                        <div className="text-sm text-red-600 dark:text-red-400 py-8 text-center">
                          Error al generar la ficha clínica
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                          No hay contenido disponible
                        </div>
                      )}
                    </div>
                    
                    {/* Arrow para desktop */}
                    <div className="hidden md:block absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-border"></div>
                    <div className="hidden md:block absolute bottom-full left-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-popover translate-y-[1px]"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-1 md:gap-2 flex-shrink-0">
        <DisplaySettingsPopover />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-mineral-gray hover:text-clarity-blue-600 hover:bg-clarity-blue-50 dark:text-mineral-gray dark:hover:text-clarity-blue-400 dark:hover:bg-clarity-blue-900/30 transition-colors"
          onClick={() => setTheme((resolvedTheme === 'dark' || theme === 'dark') ? 'light' : 'dark')}
          title={(resolvedTheme === 'dark' || theme === 'dark') ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {(resolvedTheme === 'dark' || theme === 'dark') ? (
            <SunIcon className="h-5 w-5" weight="duotone" />
          ) : (
            <MoonIcon className="h-5 w-5" weight="duotone" />
          )}
        </Button>
      </div>
    </header>
  )
}
