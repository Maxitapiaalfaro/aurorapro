'use client'

import { useState, useEffect } from 'react'
import { InfoIcon } from '@phosphor-icons/react'

const STORAGE_KEY = 'aurora-design-transition-dismissed'

/**
 * One-time notice informing existing users that configurable display settings
 * have been replaced by a research-optimized fixed design.
 * Dismisses permanently after the user clicks "Entendido".
 */
export function DesignTransitionNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (!dismissed) {
        setShow(true)
      }
    } catch {
      // localStorage unavailable — don't show
    }
  }, [])

  const handleDismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Best-effort persistence
    }
  }

  if (!show) return null

  return (
    <div className="w-full px-3 md:px-0 py-2">
      <div className="bg-card border border-border/40 rounded-lg p-4 text-sm font-sans">
        <div className="flex items-start gap-3">
          <InfoIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" weight="duotone" />
          <div className="flex-1 space-y-2">
            <p className="text-foreground/80 leading-relaxed">
              Aurora ahora usa un diseño optimizado para lectura clínica. Los controles de visualización se han reemplazado por un diseño fijo basado en investigación.
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Si necesitas texto más grande, usa el zoom del navegador (Ctrl/Cmd +).
            </p>
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={handleDismiss}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-md hover:bg-primary/5"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
