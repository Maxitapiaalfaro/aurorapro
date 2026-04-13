'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useSubscription } from '@/hooks/use-subscription'
import { useAuth } from '@/providers/auth-provider'
import {
  TOKEN_BUDGETS,
  TIER_LIMITS,
  TIER_DISPLAY,
} from '@/lib/subscriptions/tier-config'
import type { SubscriptionTier } from '@/lib/subscriptions/types'
import {
  Check,
  X as XIcon,
  Sparkles,
  Zap,
  Crown,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Tier feature definitions
// ---------------------------------------------------------------------------

interface TierFeature {
  label: string
  free: boolean | string
  pro: boolean | string
  max: boolean | string
}

const FEATURES: TierFeature[] = [
  { label: 'Agente Socrático (base)', free: true, pro: true, max: true },
  { label: 'Agente Clínico', free: false, pro: true, max: true },
  { label: 'Agente Académico', free: false, pro: true, max: true },
  { label: 'Agentes experimentales', free: false, pro: false, max: true },
  { label: 'Pacientes activos', free: '5', pro: 'Ilimitados', max: 'Ilimitados' },
  { label: 'Memorias clínicas', free: 'Lectura', pro: 'Lectura + Escritura', max: 'Lectura + Escritura' },
  { label: 'Fichas clínicas', free: false, pro: true, max: true },
  { label: 'Búsqueda académica', free: false, pro: true, max: true },
  { label: 'Transcripción de voz', free: false, pro: true, max: true },
  { label: 'Exportar datos', free: false, pro: true, max: true },
  { label: 'Herramientas MCP', free: false, pro: true, max: true },
  { label: 'Subida de documentos', free: '10/mes', pro: 'Ilimitado', max: 'Ilimitado' },
]

// ---------------------------------------------------------------------------
// Pricing data (static, matching pricing-engine.ts base prices)
// ---------------------------------------------------------------------------

interface PricingOption {
  monthly: number // cents
  yearly: number  // cents (total year)
}

const PRICES: Record<Exclude<SubscriptionTier, 'free'>, PricingOption> = {
  pro: { monthly: 2000, yearly: 20000 },
  max: { monthly: 5000, yearly: 50000 },
}

function formatPrice(cents: number, yearly: boolean): string {
  const amount = yearly ? cents / 100 / 12 : cents / 100
  return `$${Math.round(amount)}`
}

function formatTokenBudget(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000) return `${tokens / 1_000}K`
  return tokens.toString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const { user } = useAuth()
  const { effectiveTier, status, isLoaded } = useSubscription()
  const router = useRouter()

  const handleSubscribe = async (tier: Exclude<SubscriptionTier, 'free'>) => {
    if (!user) {
      router.push('/')
      return
    }

    setLoadingTier(tier)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/payments/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tier,
          interval: isYearly ? 'year' : 'month',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear la sesión de pago')
      }

      const { checkoutUrl } = await res.json()
      window.location.href = checkoutUrl
    } catch (error) {
      console.error('[Pricing] Checkout error:', error)
    } finally {
      setLoadingTier(null)
    }
  }

  const handleManageBilling = async () => {
    if (!user) return

    setLoadingTier('portal')
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/payments/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      })

      if (!res.ok) throw new Error('Error al abrir el portal de facturación')

      const { portalUrl } = await res.json()
      window.location.href = portalUrl
    } catch (error) {
      console.error('[Pricing] Portal error:', error)
    } finally {
      setLoadingTier(null)
    }
  }

  const tiers = useMemo(() => [
    {
      id: 'free' as SubscriptionTier,
      name: 'Free',
      description: 'Para explorar Aurora',
      icon: Zap,
      price: '$0',
      period: '',
      tokens: formatTokenBudget(TOKEN_BUDGETS.free),
      messages: '~180 msgs/mes',
      highlight: false,
    },
    {
      id: 'pro' as SubscriptionTier,
      name: 'Pro',
      description: 'Toolkit clínico completo',
      icon: Sparkles,
      price: formatPrice(isYearly ? PRICES.pro.yearly : PRICES.pro.monthly, isYearly),
      period: '/mes',
      tokens: formatTokenBudget(TOKEN_BUDGETS.pro),
      messages: '~900 msgs/mes',
      highlight: true,
    },
    {
      id: 'max' as SubscriptionTier,
      name: 'Max',
      description: 'Todo en Pro + experimental',
      icon: Crown,
      price: formatPrice(isYearly ? PRICES.max.yearly : PRICES.max.monthly, isYearly),
      period: '/mes',
      tokens: formatTokenBudget(TOKEN_BUDGETS.max),
      messages: '~2,700 msgs/mes',
      highlight: false,
    },
  ], [isYearly])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <h1 className="text-lg font-semibold">Planes</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight">
            Elige tu plan
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Comienza con 14 días de prueba Pro gratuita. Sin compromiso.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={cn('text-sm', !isYearly && 'font-semibold text-foreground', isYearly && 'text-muted-foreground')}>
            Mensual
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            aria-label="Alternar entre facturación mensual y anual"
          />
          <span className={cn('text-sm', isYearly && 'font-semibold text-foreground', !isYearly && 'text-muted-foreground')}>
            Anual
          </span>
          {isYearly && (
            <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Ahorra 17%
            </Badge>
          )}
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {tiers.map((tier) => {
            const isCurrent = isLoaded && effectiveTier === tier.id
            const isActive = isLoaded && (status === 'active' || status === 'trialing')

            return (
              <Card
                key={tier.id}
                className={cn(
                  'relative flex flex-col border-border/50',
                  tier.highlight && 'border-primary/50 shadow-lg shadow-primary/5',
                )}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      Más popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <tier.icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                  </div>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>

                <CardContent className="flex-1">
                  {/* Price */}
                  <div className="mb-6">
                    <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                    {tier.period && (
                      <span className="text-muted-foreground text-sm">{tier.period}</span>
                    )}
                  </div>

                  {/* Token budget */}
                  <div className="space-y-2 mb-6 p-3 rounded-lg bg-muted/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tokens/mes</span>
                      <span className="font-medium">{tier.tokens}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Mensajes est.</span>
                      <span className="font-medium">{tier.messages}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2">
                    {FEATURES.map((f) => {
                      const val = f[tier.id as keyof TierFeature]
                      const isIncluded = val === true || (typeof val === 'string' && val !== 'false')
                      const displayText = typeof val === 'string' ? val : null

                      return (
                        <li key={f.label} className="flex items-start gap-2 text-sm">
                          {isIncluded ? (
                            <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XIcon className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                          )}
                          <span className={cn(!isIncluded && 'text-muted-foreground/60')}>
                            {f.label}
                            {displayText && isIncluded && (
                              <span className="text-muted-foreground ml-1">({displayText})</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>

                <CardFooter className="pt-4">
                  {tier.id === 'free' ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={isCurrent}
                    >
                      {isCurrent ? 'Plan actual' : 'Plan gratuito'}
                    </Button>
                  ) : isCurrent && isActive ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleManageBilling}
                      disabled={loadingTier === 'portal'}
                    >
                      {loadingTier === 'portal' ? 'Abriendo...' : 'Administrar suscripción'}
                    </Button>
                  ) : (
                    <Button
                      className={cn(
                        'w-full',
                        tier.highlight && 'bg-primary hover:bg-primary/90',
                      )}
                      onClick={() => handleSubscribe(tier.id as Exclude<SubscriptionTier, 'free'>)}
                      disabled={loadingTier === tier.id}
                    >
                      {loadingTier === tier.id
                        ? 'Redirigiendo...'
                        : status === 'trialing'
                          ? `Suscribirse a ${tier.name}`
                          : `Probar ${tier.name} gratis`
                      }
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>

        {/* FAQ / fine print */}
        <div className="text-center text-sm text-muted-foreground max-w-2xl mx-auto space-y-2">
          <p>La prueba gratuita de 14 días incluye acceso completo a Pro. Se requiere método de pago.</p>
          <p>Puedes cancelar en cualquier momento. Tus datos clínicos siempre se conservan.</p>
        </div>
      </div>
    </div>
  )
}
