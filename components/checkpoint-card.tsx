"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CheckpointRequest, CheckpointStatus } from '@/types/clinical-types'

// ─── Constants ─────────────────────────────────────────────────────────────

/** Auto-cancel timeout in milliseconds (120 seconds) */
const CHECKPOINT_TIMEOUT_MS = 120_000

// ─── Props ─────────────────────────────────────────────────────────────────

interface CheckpointCardProps {
  checkpoint: CheckpointRequest
  /** Called when the user confirms the destructive action */
  onConfirm: (checkpointId: string) => void
  /** Called when the user cancels the destructive action */
  onCancel: (checkpointId: string) => void
  className?: string
}

/**
 * CheckpointCard — Destructive Action Confirmation UI
 *
 * Renders a prominent but clinical confirmation card when a tool call
 * would mutate or delete patient data. The execution pipeline pauses
 * until the user explicitly confirms or cancels.
 *
 * Design principles:
 * - Subtle destructive border (not alarming red background)
 * - Before/After diff preview when available
 * - Timeout auto-cancel (120s)
 * - Cannot be bypassed by chat messages (enforced by parent)
 */
export function CheckpointCard({
  checkpoint,
  onConfirm,
  onCancel,
  className,
}: CheckpointCardProps) {
  const [localStatus, setLocalStatus] = useState<CheckpointStatus>(checkpoint.status)
  const [countdown, setCountdown] = useState(Math.ceil(CHECKPOINT_TIMEOUT_MS / 1000))

  // Sync with external status changes
  useEffect(() => {
    setLocalStatus(checkpoint.status)
  }, [checkpoint.status])

  // Countdown timer for auto-expiry
  useEffect(() => {
    if (localStatus !== 'pending') return

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setLocalStatus('expired')
          onCancel(checkpoint.checkpointId)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [localStatus, checkpoint.checkpointId, onCancel])

  const handleConfirm = useCallback(() => {
    setLocalStatus('confirmed')
    onConfirm(checkpoint.checkpointId)
  }, [checkpoint.checkpointId, onConfirm])

  const handleCancel = useCallback(() => {
    setLocalStatus('cancelled')
    onCancel(checkpoint.checkpointId)
  }, [checkpoint.checkpointId, onCancel])

  const isResolved = localStatus !== 'pending'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{
        opacity: isResolved ? 0.5 : 1,
        y: 0,
      }}
      transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "rounded-md border overflow-hidden transition-all duration-300",
        isResolved
          ? "border-border/30 bg-transparent"
          : "border-destructive/30 bg-destructive/[0.03]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <AlertTriangle className={cn(
          "w-4 h-4 flex-shrink-0",
          isResolved ? "text-muted-foreground/40" : "text-destructive/70"
        )} />
        <span className={cn(
          "text-xs font-medium",
          isResolved ? "text-muted-foreground/50" : "text-foreground"
        )}>
          {isResolved
            ? localStatus === 'confirmed'
              ? 'Cambio confirmado'
              : localStatus === 'expired'
                ? 'Confirmación expirada'
                : 'Cambio cancelado'
            : 'Acción que requiere confirmación'
          }
        </span>
        {!isResolved && (
          <span className="text-[10px] text-muted-foreground/40 ml-auto tabular-nums">
            {countdown}s
          </span>
        )}
      </div>

      {/* Body — only shown while pending */}
      {!isResolved && (
        <div className="px-4 pb-4 space-y-3">
          {/* Description */}
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            {checkpoint.humanDescription}
          </p>

          {/* Before/After comparison */}
          {(checkpoint.preview.before || checkpoint.preview.after) && (
            <div className="space-y-2">
              {checkpoint.preview.before && (
                <div className="space-y-1">
                  <span className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                    Antes
                  </span>
                  <pre className="text-[11px] leading-relaxed bg-secondary/50 rounded px-3 py-2 overflow-x-auto text-muted-foreground/60 whitespace-pre-wrap break-words">
                    {checkpoint.preview.before}
                  </pre>
                </div>
              )}
              <div className="space-y-1">
                <span className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider">
                  {checkpoint.preview.before ? 'Después' : 'Datos a registrar'}
                </span>
                <pre className="text-[11px] leading-relaxed bg-secondary/50 rounded px-3 py-2 overflow-x-auto text-foreground/80 whitespace-pre-wrap break-words">
                  {checkpoint.preview.after}
                </pre>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:bg-secondary/60 transition-colors"
            >
              <X className="w-3 h-3" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Check className="w-3 h-3" />
              Confirmar cambio
            </button>
          </div>

          {/* Footer notice */}
          <p className="text-[9px] text-muted-foreground/40 leading-relaxed">
            Esta acción modifica datos del paciente. Requiere confirmación explícita.
          </p>
        </div>
      )}

      {/* Resolved summary */}
      {isResolved && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
            {localStatus === 'confirmed'
              ? 'Confirmado por el terapeuta'
              : localStatus === 'expired'
                ? 'La confirmación expiró. No se realizaron cambios.'
                : 'Cancelado por el terapeuta. No se realizaron cambios.'
            }
          </p>
        </div>
      )}
    </motion.div>
  )
}
