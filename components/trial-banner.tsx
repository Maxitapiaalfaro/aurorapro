'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSubscription } from '@/hooks/use-subscription'
import { X, Clock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'aurora-trial-banner-dismissed'

export function TrialBanner() {
  const { isTrialing, trialDaysRemaining, isLoaded } = useSubscription()
  const [isDismissed, setIsDismissed] = useState(true) // default hidden to avoid flash
  const router = useRouter()

  // Check dismissal state on mount
  useEffect(() => {
    if (!isLoaded || !isTrialing) return
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const dismissDate = new Date(dismissedAt).toDateString()
      const today = new Date().toDateString()
      // Re-show next day
      setIsDismissed(dismissDate === today)
    } else {
      setIsDismissed(false)
    }
  }, [isLoaded, isTrialing])

  if (!isLoaded || !isTrialing || isDismissed) return null

  const days = trialDaysRemaining ?? 0

  // Urgency levels
  const urgency =
    days <= 2 ? 'critical' :
    days <= 5 ? 'warning' :
    'info'

  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-200',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200',
    critical: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200',
  }

  const iconColors = {
    info: 'text-blue-500 dark:text-blue-400',
    warning: 'text-amber-500 dark:text-amber-400',
    critical: 'text-red-500 dark:text-red-400',
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString())
    setIsDismissed(true)
  }

  const dayLabel = days === 1 ? 'día' : 'días'

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5 border-b text-sm',
        colors[urgency],
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Clock className={cn('h-4 w-4 shrink-0', iconColors[urgency])} />
        <span className="truncate">
          <strong>Prueba Pro:</strong>{' '}
          {days > 0
            ? `${days} ${dayLabel} restante${days !== 1 ? 's' : ''}`
            : 'Tu prueba termina hoy'
          }
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant={urgency === 'critical' ? 'default' : 'outline'}
          className="h-7 text-xs gap-1.5"
          onClick={() => router.push('/pricing')}
        >
          <Sparkles className="h-3 w-3" />
          Suscribirse
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-sm hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Cerrar banner de prueba"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
