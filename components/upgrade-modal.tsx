'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lock, Sparkles, Crown, ArrowRight } from 'lucide-react'
import { TIER_DISPLAY } from '@/lib/subscriptions/tier-config'
import type { SubscriptionTier } from '@/lib/subscriptions/types'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Context — allows any component to trigger the upgrade modal
// ---------------------------------------------------------------------------

interface UpgradePromptPayload {
  feature: string
  requiredTier: SubscriptionTier
  currentTier: SubscriptionTier
}

interface UpgradeModalContextValue {
  showUpgradePrompt: (payload: UpgradePromptPayload) => void
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null)

export function useUpgradeModal() {
  const ctx = useContext(UpgradeModalContext)
  if (!ctx) {
    // Return a no-op if not wrapped (graceful degradation)
    return {
      showUpgradePrompt: () => {
        console.warn('[UpgradeModal] Provider not found — cannot show modal')
      },
    }
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Provider + Modal
// ---------------------------------------------------------------------------

const tierIcons: Record<SubscriptionTier, typeof Sparkles> = {
  free: Lock,
  pro: Sparkles,
  max: Crown,
}

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [payload, setPayload] = useState<UpgradePromptPayload | null>(null)
  const router = useRouter()

  const showUpgradePrompt = useCallback((p: UpgradePromptPayload) => {
    setPayload(p)
    setIsOpen(true)
  }, [])

  const handleUpgrade = () => {
    setIsOpen(false)
    router.push('/pricing')
  }

  const RequiredIcon = payload ? tierIcons[payload.requiredTier] : Sparkles

  return (
    <UpgradeModalContext.Provider value={{ showUpgradePrompt }}>
      {children}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">
              Función no disponible
            </DialogTitle>
            <DialogDescription className="text-center">
              {payload && (
                <>
                  <strong className="text-foreground">{payload.feature}</strong>{' '}
                  requiere el plan{' '}
                  <Badge
                    variant="secondary"
                    className={cn(
                      'ml-1 inline-flex items-center gap-1',
                      payload.requiredTier === 'max' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                      payload.requiredTier === 'pro' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    )}
                  >
                    <RequiredIcon className="h-3 w-3" />
                    {TIER_DISPLAY[payload.requiredTier].name}
                  </Badge>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {payload && (
            <div className="rounded-lg border border-border/50 bg-muted/50 p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tu plan actual</span>
                <Badge variant="outline">{TIER_DISPLAY[payload.currentTier].name}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan requerido</span>
                <Badge variant="secondary">
                  <RequiredIcon className="h-3 w-3 mr-1" />
                  {TIER_DISPLAY[payload.requiredTier].name}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-col gap-2 mt-2">
            <Button onClick={handleUpgrade} className="w-full gap-2">
              Ver planes
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsOpen(false)}
              className="w-full"
            >
              Ahora no
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UpgradeModalContext.Provider>
  )
}
