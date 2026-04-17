'use client'

import { useRouter } from 'next/navigation'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { useSubscription } from '@/hooks/use-subscription'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return tokens.toString()
}

export function TokenUsageBar({ compact = false }: { compact?: boolean }) {
  const {
    tokensRemaining,
    tokenBudget,
    usagePercent,
    warningLevel,
    effectiveTier,
    isLoaded,
    isTrialing,
  } = useSubscription()
  const router = useRouter()

  if (!isLoaded) return null

  // Color based on usage
  const barColor =
    usagePercent >= 95 ? 'bg-red-500' :
    usagePercent >= 85 ? 'bg-orange-500' :
    usagePercent >= 70 ? 'bg-amber-500' :
    'bg-primary'

  const textColor =
    usagePercent >= 95 ? 'text-red-500 dark:text-red-400' :
    usagePercent >= 85 ? 'text-orange-500 dark:text-orange-400' :
    usagePercent >= 70 ? 'text-amber-500 dark:text-amber-400' :
    'text-muted-foreground'

  const tierLabel = isTrialing ? 'Pro (prueba)' : effectiveTier.charAt(0).toUpperCase() + effectiveTier.slice(1)

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => router.push('/pricing')}
              className={cn(
                // Mobile: icon-only pill (avoids competing with title/patient name)
                // sm+: shows progress bar + remaining-token count
                'flex items-center gap-1.5 rounded-md text-xs transition-colors',
                'px-1.5 py-1 sm:px-2',
                'hover:bg-muted/80',
                textColor,
              )}
              aria-label={`Uso de tokens: ${usagePercent}%`}
            >
              <Zap className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', barColor)}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <span className="hidden sm:inline font-mono tabular-nums">
                {formatTokens(tokensRemaining)}
              </span>
              {/* Mobile-only: show a tiny colored dot when usage is elevated */}
              {usagePercent >= 70 && (
                <span
                  className={cn(
                    'sm:hidden h-1.5 w-1.5 rounded-full',
                    usagePercent >= 95 ? 'bg-red-500' :
                    usagePercent >= 85 ? 'bg-orange-500' :
                    'bg-amber-500',
                  )}
                  aria-hidden="true"
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <div className="space-y-1">
              <div>Plan: <strong>{tierLabel}</strong></div>
              <div>Usado: {formatTokens(tokenBudget - tokensRemaining)} / {formatTokens(tokenBudget)}</div>
              <div>Restante: {formatTokens(tokensRemaining)}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="space-y-1.5 px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" />
          Tokens ({tierLabel})
        </span>
        <span className={cn('font-mono tabular-nums', textColor)}>
          {formatTokens(tokensRemaining)} restantes
        </span>
      </div>
      <div className="relative">
        <Progress
          value={usagePercent}
          className="h-2 bg-muted"
        />
        {/* Override the indicator color */}
        <div
          className={cn(
            'absolute top-0 left-0 h-2 rounded-full transition-all duration-500',
            barColor,
          )}
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
        />
      </div>
      {warningLevel !== 'none' && usagePercent >= 85 && (
        <button
          onClick={() => router.push('/pricing')}
          className={cn(
            'text-xs w-full text-center py-1 rounded',
            usagePercent >= 95
              ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
          )}
        >
          {usagePercent >= 100
            ? 'Tokens agotados — Actualiza tu plan'
            : `${usagePercent}% usado — Considera actualizar`
          }
        </button>
      )}
    </div>
  )
}
