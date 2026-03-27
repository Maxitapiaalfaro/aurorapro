"use client"

import { Settings, Type, Maximize2, Space, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  useDisplayPreferences,
  type DisplayPreferences
} from "@/providers/display-preferences-provider"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"

interface DisplaySettingsPopoverProps {
  className?: string
}

export function DisplaySettingsPopover({ className }: DisplaySettingsPopoverProps) {
  const { preferences, updatePreference, resetPreferences } = useDisplayPreferences()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detectar si es mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Cerrar al presionar Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const fontSizeOptions: { value: DisplayPreferences['fontSize']; label: string }[] = [
    { value: 'small', label: 'S' },
    { value: 'medium', label: 'M' },
    { value: 'large', label: 'L' },
    { value: 'x-large', label: 'XL' }
  ]

  const widthOptions: { value: DisplayPreferences['messageWidth']; label: string }[] = [
    { value: 'narrow', label: '━' },
    { value: 'comfortable', label: '━━' },
    { value: 'wide', label: '━━━' },
    { value: 'full', label: '━━━━' }
  ]

  const spacingOptions: { value: DisplayPreferences['messageSpacing']; label: string }[] = [
    { value: 'compact', label: '⋮' },
    { value: 'normal', label: '⋮⋮' },
    { value: 'relaxed', label: '⋮⋮⋮' }
  ]

  const drawerContent = isOpen && (
    <>
      {/* Overlay semi-transparente que permite ver el contenido */}
      <div 
        className={cn(
          "fixed inset-0 z-[100] transition-all duration-300",
          isMobile ? "bg-black/40" : "bg-black/10"
        )}
        onClick={() => setIsOpen(false)}
      />
      
      {/* Drawer / Sheet */}
      <div 
        className={cn(
          "fixed z-[101] bg-background/95 backdrop-blur-md border shadow-2xl transition-all duration-300 ease-out",
          isMobile 
            ? "inset-x-0 bottom-0 rounded-t-2xl border-t border-x animate-in slide-in-from-bottom-full" 
            : "top-0 right-0 h-full w-80 border-l animate-in slide-in-from-right-full"
        )}
      >
        <div className={cn(
          "flex flex-col h-full",
          isMobile ? "max-h-[65vh]" : ""
        )}>
          {/* Header Compacto */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="font-sans text-sm font-semibold">Ajustes de visualización</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetPreferences}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                title="Restaurar valores por defecto"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Tamaño de Texto - Compacto */}
            <div className="space-y-2">
              <Label className="font-sans text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3 w-3" />
                Texto
              </Label>
              <div className="flex gap-1.5">
                {fontSizeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updatePreference('fontSize', option.value)}
                    className={cn(
                      "font-sans flex-1 py-1.5 rounded-md text-xs font-medium transition-all",
                      preferences.fontSize === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ancho - Compacto */}
            <div className="space-y-2">
              <Label className="font-sans text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Maximize2 className="h-3 w-3" />
                Ancho
              </Label>
              <div className="flex gap-1.5">
                {widthOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updatePreference('messageWidth', option.value)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-xs font-mono transition-all",
                      preferences.messageWidth === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Espaciado - Compacto */}
            <div className="space-y-2">
              <Label className="font-sans text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Space className="h-3 w-3" />
                Espaciado
              </Label>
              <div className="flex gap-1.5">
                {spacingOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updatePreference('messageSpacing', option.value)}
                    className={cn(
                      "font-sans flex-1 py-1.5 rounded-md text-sm transition-all",
                      preferences.messageSpacing === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vista previa en vivo */}
            <div className="mt-6 space-y-2">
              <Label className="font-sans text-xs font-medium text-muted-foreground">
                Vista Previa
              </Label>
              <div className="border border-border/50 rounded-lg p-3 bg-muted/20 flex flex-col items-center">
                <div className={cn(
                  "w-full transition-all duration-300 ease-out",
                  preferences.messageSpacing === 'compact' && 'space-y-1',
                  preferences.messageSpacing === 'normal' && 'space-y-2',
                  preferences.messageSpacing === 'relaxed' && 'space-y-3',
                  preferences.messageWidth === 'narrow' && 'max-w-[150px]',
                  preferences.messageWidth === 'comfortable' && 'max-w-[200px]',
                  preferences.messageWidth === 'wide' && 'max-w-[230px]',
                  preferences.messageWidth === 'full' && 'max-w-full'
                )}>
                  <div className={cn(
                    "bg-primary/10 rounded-md p-2 transition-all duration-300 ease-out",
                    preferences.messageSpacing === 'compact' && 'py-1',
                    preferences.messageSpacing === 'relaxed' && 'py-3',
                    preferences.fontSize === 'small' && 'text-xs',
                    preferences.fontSize === 'medium' && 'text-sm',
                    preferences.fontSize === 'large' && 'text-base',
                    preferences.fontSize === 'x-large' && 'text-lg'
                  )}>
                    <p className="font-sans text-foreground/80 transition-all duration-300 ease-out">Tu mensaje</p>
                  </div>
                  <div className={cn(
                    "bg-secondary rounded-md p-2 transition-all duration-300 ease-out",
                    preferences.messageSpacing === 'compact' && 'py-1',
                    preferences.messageSpacing === 'relaxed' && 'py-3',
                    preferences.fontSize === 'small' && 'text-xs',
                    preferences.fontSize === 'medium' && 'text-sm',
                    preferences.fontSize === 'large' && 'text-base',
                    preferences.fontSize === 'x-large' && 'text-lg'
                  )}>
                    <p className="font-sans text-foreground/80 transition-all duration-300 ease-out">Respuesta del especialista</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer con información - Solo desktop */}
          {!isMobile && (
            <div className="px-4 py-3 border-t border-border/50 shrink-0">
              <p className="font-sans text-xs text-muted-foreground leading-relaxed">
                Los cambios se aplican en tiempo real. Observa el chat mientras ajustas.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        onClick={() => setIsOpen(!isOpen)}
        title="Ajustes de visualización"
      >
        <Settings className="h-4 w-4" />
      </Button>
      
      {typeof window !== 'undefined' && drawerContent && createPortal(
        drawerContent,
        document.body
      )}
    </>
  )
}
