"use client"

/**
 * Sync Status Indicator — Aurora Local-First UX
 *
 * A minimal, non-intrusive indicator that communicates the synchronization
 * state between the local Firestore cache and the Firebase backend.
 *
 * Design principles:
 * - **Invisible when synced**: A fully synced state shows a subtle green dot
 *   that fades to near-invisible after a few seconds — the user should forget
 *   about sync when everything is working.
 * - **Gentle amber pulse when syncing**: Indicates background activity without
 *   alarming the user or blocking interaction.
 * - **Clear offline badge**: Uses a static gray dot and "Sin conexión" label
 *   so the user knows their changes are safe locally but not yet uploaded.
 *
 * Accessibility: Uses aria-live="polite" to announce state changes to
 * screen readers without interrupting their current task.
 *
 * @module components/sync-status-indicator
 */

import { useSyncStatus, type SyncState } from "@/hooks/use-sync-status"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { CloudCheckIcon, CloudArrowUpIcon, CloudSlashIcon } from "@phosphor-icons/react"

// ────────────────────────────────────────────────────────────────────────────
// Config per state
// ────────────────────────────────────────────────────────────────────────────

interface StateConfig {
  label: string
  tooltipText: string
  dotClass: string
  iconClass: string
  Icon: React.ComponentType<{ className?: string; weight?: "regular" | "duotone" | "bold" }>
}

const STATE_CONFIG: Record<SyncState, StateConfig> = {
  synced: {
    label: "Sincronizado",
    tooltipText: "Todos los cambios están guardados",
    dotClass: "bg-emerald-500/80 dark:bg-emerald-400/80",
    iconClass: "text-emerald-600/70 dark:text-emerald-400/70",
    Icon: CloudCheckIcon,
  },
  syncing: {
    label: "Sincronizando…",
    tooltipText: "Guardando cambios en la nube",
    dotClass: "bg-amber-500/80 dark:bg-amber-400/80 animate-sync-pulse",
    iconClass: "text-amber-600/70 dark:text-amber-400/70",
    Icon: CloudArrowUpIcon,
  },
  offline: {
    label: "Sin conexión",
    tooltipText: "Trabajando en modo offline — los cambios se sincronizarán al reconectar",
    dotClass: "bg-muted-foreground/40",
    iconClass: "text-muted-foreground/50",
    Icon: CloudSlashIcon,
  },
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface SyncStatusIndicatorProps {
  /** Show the full label text (for wider layouts) */
  showLabel?: boolean
  className?: string
}

export function SyncStatusIndicator({ showLabel = false, className }: SyncStatusIndicatorProps) {
  const { state, lastSyncedAt } = useSyncStatus()
  const [isVisible, setIsVisible] = useState(true)

  const config = STATE_CONFIG[state]

  // Auto-fade the synced state after 4 seconds — the user doesn't need
  // a permanent "synced" indicator once they've seen it.
  useEffect(() => {
    if (state === "synced") {
      const timer = setTimeout(() => setIsVisible(false), 4000)
      return () => clearTimeout(timer)
    }
    // Always visible for syncing or offline
    setIsVisible(true)
  }, [state])

  const formattedTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            aria-label={config.label}
            className={cn(
              "inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-all duration-500 select-none cursor-default",
              // Only fade for synced state, stay visible for others
              state === "synced" && !isVisible && "opacity-0",
              state === "synced" && isVisible && "opacity-100",
              state !== "synced" && "opacity-100",
              className,
            )}
          >
            {/* Dot indicator */}
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 transition-colors duration-300",
                config.dotClass,
              )}
            />

            {/* Optional label for wider screens */}
            {showLabel && (
              <span className="text-[10px] font-medium text-muted-foreground/70 whitespace-nowrap">
                {config.label}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px]">
          <div className="flex items-center gap-2">
            <config.Icon className={cn("h-4 w-4 flex-shrink-0", config.iconClass)} weight="duotone" />
            <div>
              <p className="text-xs font-medium">{config.label}</p>
              <p className="text-[10px] text-muted-foreground">
                {config.tooltipText}
                {formattedTime && state === "synced" && (
                  <> · Última sync: {formattedTime}</>
                )}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
