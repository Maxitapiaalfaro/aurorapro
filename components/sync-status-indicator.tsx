"use client"

/**
 * Sync Status Indicator — Aurora Local-First UX
 *
 * A minimal, self-descriptive indicator that communicates the synchronization
 * state between the local Firestore cache and the Firebase backend.
 *
 * Design principles:
 * - **Icon-driven**: Uses Phosphor cloud icons (CloudCheck, CloudArrowUp,
 *   CloudSlash) so the meaning is immediately clear without needing a tooltip.
 * - **Invisible when synced**: Fades away after a few seconds — the user
 *   should forget about sync when everything is working.
 * - **Label for non-synced states**: Shows a short text label ("Guardando…"
 *   or "Sin conexión") next to the icon so the state is unambiguous.
 * - **Tooltip for detail**: Provides extra context on hover/tap.
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
  /** Short label shown next to the icon for non-synced states */
  label: string
  /** Longer description for the tooltip */
  tooltipText: string
  /** Tailwind classes for the icon color + animation */
  iconClass: string
  /** Phosphor icon component */
  Icon: React.ComponentType<{ className?: string; weight?: "regular" | "duotone" | "bold" }>
}

const STATE_CONFIG: Record<SyncState, StateConfig> = {
  synced: {
    label: "Guardado",
    tooltipText: "Todos los cambios están guardados en la nube",
    iconClass: "text-emerald-600/60 dark:text-emerald-400/60",
    Icon: CloudCheckIcon,
  },
  syncing: {
    label: "Guardando…",
    tooltipText: "Sincronizando cambios con la nube",
    iconClass: "text-amber-600/70 dark:text-amber-400/70 animate-sync-pulse",
    Icon: CloudArrowUpIcon,
  },
  offline: {
    label: "Sin conexión",
    tooltipText: "Trabajando en modo offline — los cambios se sincronizarán al reconectar",
    iconClass: "text-muted-foreground/50",
    Icon: CloudSlashIcon,
  },
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

interface SyncStatusIndicatorProps {
  className?: string
}

export function SyncStatusIndicator({ className }: SyncStatusIndicatorProps) {
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
              "inline-flex items-center gap-1 px-1.5 py-1 rounded-md transition-all duration-500 select-none cursor-default",
              // Only fade for synced state, stay visible for others
              state === "synced" && !isVisible && "opacity-0",
              state === "synced" && isVisible && "opacity-100",
              state !== "synced" && "opacity-100",
              className,
            )}
          >
            {/* Cloud icon — self-descriptive indicator */}
            <config.Icon
              className={cn("h-3.5 w-3.5 flex-shrink-0 transition-colors duration-300", config.iconClass)}
              weight="duotone"
            />

            {/* Short label for non-synced states — always visible so the user
                understands the state without needing to hover */}
            {state !== "synced" && (
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
