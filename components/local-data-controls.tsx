"use client"

/**
 * Local Data Controls Panel — Aurora Local-First UX
 *
 * A privacy-focused panel that allows the psychologist to manage locally
 * stored clinical data. Since Aurora uses Firestore's persistent local cache,
 * PHI (Protected Health Information) resides on the device. This component
 * provides clear controls and information about local data storage.
 *
 * Features:
 * - View estimated local storage usage
 * - Clear all locally cached clinical data
 * - Explanatory text about what "local-first" means for their data
 *
 * @module components/local-data-controls
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useLocalDataControls } from "@/hooks/use-local-data-controls"
import { cn } from "@/lib/utils"
import {
  DevicesIcon,
  TrashIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  CloudCheckIcon,
  InfoIcon,
} from "@phosphor-icons/react"

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface LocalDataControlsProps {
  className?: string
}

export function LocalDataControls({ className }: LocalDataControlsProps) {
  const {
    estimatedCacheSize,
    isClearing,
    error,
    clearLocalCache,
    estimateCacheSize,
  } = useLocalDataControls()

  const [showConfirm, setShowConfirm] = useState(false)

  // Estimate cache size on mount
  useEffect(() => {
    estimateCacheSize()
  }, [estimateCacheSize])

  const handleClear = async () => {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }
    await clearLocalCache()
    setShowConfirm(false)
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <DevicesIcon className="h-4 w-4 text-muted-foreground" weight="duotone" />
        <h3 className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
          Datos Locales
        </h3>
      </div>

      {/* Info Card */}
      <div className="rounded-lg border border-border/40 bg-secondary/30 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-600/70 dark:text-emerald-400/70 mt-0.5 flex-shrink-0" weight="duotone" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Aurora almacena datos clínicos localmente para funcionar sin conexión.
            Los datos se sincronizan automáticamente con la nube cuando hay conexión.
          </p>
        </div>

        {/* Storage usage */}
        {estimatedCacheSize !== null && (
          <div className="flex items-center gap-2 pt-1">
            <InfoIcon className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground/70">
              Almacenamiento local: ~{formatBytes(estimatedCacheSize)}
            </span>
          </div>
        )}
      </div>

      {/* Clear Cache Action */}
      <div className="space-y-2">
        {!showConfirm ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground hover:text-destructive/70 hover:bg-destructive/5"
            onClick={handleClear}
            disabled={isClearing}
          >
            <TrashIcon className="h-3.5 w-3.5" weight="regular" />
            Limpiar datos locales
          </Button>
        ) : (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <WarningCircleIcon className="h-4 w-4 text-destructive/70 mt-0.5 flex-shrink-0" weight="duotone" />
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-destructive/80">
                  ¿Limpiar caché local?
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Esto eliminará los datos almacenados en este dispositivo.
                  Tus datos en la nube no se verán afectados. La página se recargará.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-[11px] px-3"
                onClick={handleClear}
                disabled={isClearing}
              >
                {isClearing ? (
                  <>
                    <span className="inline-block h-2.5 w-2.5 border border-current border-t-transparent rounded-full animate-spin mr-1.5" />
                    Limpiando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-3"
                onClick={() => setShowConfirm(false)}
                disabled={isClearing}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <p className="text-[10px] text-destructive/80 flex items-center gap-1">
            <WarningCircleIcon className="h-3 w-3 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Sync info footer */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
        <CloudCheckIcon className="h-3 w-3 text-muted-foreground/40" weight="regular" />
        <span className="text-[10px] text-muted-foreground/50">
          Los datos en la nube permanecen intactos al limpiar el caché local
        </span>
      </div>
    </div>
  )
}
