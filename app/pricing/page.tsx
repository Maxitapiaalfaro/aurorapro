'use client'

import { useState, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useSubscription } from '@/hooks/use-subscription'
import { useAuth } from '@/providers/auth-provider'
import type { SubscriptionTier } from '@/lib/subscriptions/types'
import {
  ArrowLeftIcon,
  CheckIcon,
  MinusIcon,
  CaretDownIcon,
  CompassIcon,
  BookOpenIcon,
  CrownSimpleIcon,
  UsersThreeIcon,
  ShieldCheckIcon,
  HeartIcon,
  BrainIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Pricing (matches pricing-engine.ts BASE_PRICES)
// ---------------------------------------------------------------------------

interface PricingOption {
  monthly: number
  yearly: number
}

const PRICES: Record<Exclude<SubscriptionTier, 'free'>, PricingOption> = {
  starter: { monthly: 1200,  yearly: 12000 },
  pro:     { monthly: 2900,  yearly: 29000 },
  max:     { monthly: 7900,  yearly: 79000 },
  clinic:  { monthly: 19900, yearly: 199000 },
}

function formatPrice(cents: number, yearly: boolean): string {
  const amount = yearly ? cents / 100 / 12 : cents / 100
  return `$${Math.round(amount)}`
}

function formatTotal(cents: number): string {
  return `$${Math.round(cents / 100)}`
}

// ---------------------------------------------------------------------------
// Comparison features — curated, grouped by clinical intent
// ---------------------------------------------------------------------------

interface FeatureRow {
  label: string
  starter: boolean | string
  pro:     boolean | string
  max:     boolean | string
  clinic:  boolean | string
}

interface FeatureGroup {
  title: string
  rows: FeatureRow[]
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: 'Acompañamiento clínico',
    rows: [
      { label: 'Diálogo socrático con Aurora',       starter: true,                   pro: true,                        max: true,                        clinic: true },
      { label: 'Acompañamiento clínico activo',      starter: true,                   pro: true,                        max: true,                        clinic: true },
      { label: 'Búsqueda de evidencia académica',    starter: false,                  pro: true,                        max: true,                        clinic: true },
      { label: 'Modos experimentales (beta)',        starter: false,                  pro: false,                       max: true,                        clinic: true },
    ],
  },
  {
    title: 'Tu consulta',
    rows: [
      { label: 'Pacientes activos',                  starter: '15',                   pro: 'Ilimitados',                max: 'Ilimitados',                clinic: 'Ilimitados' },
      { label: 'Memorias clínicas continuas',        starter: 'Lectura + escritura',  pro: 'Lectura + escritura',       max: 'Lectura + escritura',       clinic: 'Lectura + escritura' },
      { label: 'Fichas clínicas automáticas',        starter: false,                  pro: true,                        max: true,                        clinic: true },
      { label: 'Análisis longitudinal de patrones',  starter: false,                  pro: true,                        max: true,                        clinic: true },
    ],
  },
  {
    title: 'Productividad',
    rows: [
      { label: 'Transcripción de notas por voz',     starter: true,                   pro: true,                        max: true,                        clinic: true },
      { label: 'Adjuntar documentos clínicos',       starter: '50/mes',               pro: 'Ilimitado',                 max: 'Ilimitado',                 clinic: 'Ilimitado' },
      { label: 'Exportar tus datos',                 starter: true,                   pro: true,                        max: true,                        clinic: true },
      { label: 'Integraciones externas',             starter: false,                  pro: true,                        max: true,                        clinic: true },
    ],
  },
  {
    title: 'Equipo y soporte',
    rows: [
      { label: 'Profesionales incluidos',            starter: '1',                    pro: '1',                         max: '1',                         clinic: '5' },
      { label: 'Soporte',                            starter: 'Email',                pro: 'Prioritario',               max: 'Prioritario',               clinic: 'Dedicado 1:1' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Per-tier differentiators (progressive disclosure — what unlocks at each tier)
// ---------------------------------------------------------------------------

interface TierCopy {
  id: Exclude<SubscriptionTier, 'free' | 'clinic'>
  name: string
  tagline: string
  forWho: string
  icon: typeof CompassIcon
  capacity: string
  highlights: string[]
  featured: boolean
}

const TIERS: TierCopy[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para iniciar tu práctica',
    forWho: 'Psicólogas y psicólogos que empiezan a integrar IA en su trabajo clínico.',
    icon: CompassIcon,
    capacity: '≈ 120 consultas al mes',
    highlights: [
      'Acompañamiento clínico activo con Aurora',
      'Memorias clínicas que mantienen continuidad entre sesiones',
      'Transcripción de notas por voz',
    ],
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Tu compañera clínica',
    forWho: 'Profesionales con práctica establecida que buscan profundizar su trabajo clínico.',
    icon: BookOpenIcon,
    capacity: '≈ 430 consultas al mes',
    highlights: [
      'Búsqueda de evidencia académica en tiempo real',
      'Fichas clínicas generadas automáticamente',
      'Análisis longitudinal de patrones en tus pacientes',
    ],
    featured: true,
  },
  {
    id: 'max',
    name: 'Max',
    tagline: 'Para práctica intensiva',
    forWho: 'Casuística compleja, alta demanda o interés en explorar lo experimental.',
    icon: CrownSimpleIcon,
    capacity: '≈ 1,500 consultas al mes',
    highlights: [
      'Acceso anticipado a modos experimentales (beta)',
      'Capacidad 3.5× mayor que Pro',
      'Soporte prioritario',
    ],
    featured: false,
  },
]

// Shared across all paid plans — removed from per-card noise
const ALWAYS_INCLUDED = [
  { icon: HeartIcon,         label: 'Diálogo socrático con Aurora, en todos los planes' },
  { icon: ShieldCheckIcon,   label: 'Tus datos clínicos permanecen tuyos, siempre' },
  { icon: ArrowRightIcon,    label: 'Exporta o cancela cuando lo necesites, sin fricción' },
  { icon: BrainIcon,         label: '14 días para conocer Aurora, sin compromiso' },
]

// ---------------------------------------------------------------------------
// FAQ — reduce purchase anxiety
// ---------------------------------------------------------------------------

const FAQS = [
  {
    q: '¿Qué pasa con mis datos clínicos?',
    a: 'Toda la información de tus pacientes permanece bajo tu control. Aurora no utiliza datos clínicos para entrenar modelos y puedes exportar o eliminar todo en cualquier momento.',
  },
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí, en cualquier momento. Subir o bajar de plan se refleja de inmediato y el cobro se prorratea automáticamente.',
  },
  {
    q: '¿Qué sucede cuando termina la prueba?',
    a: 'Al día 14 continúas en el plan que elegiste con el método de pago registrado. Si decides no seguir, cancelas con un clic y conservas el acceso Free para revisar tus notas.',
  },
  {
    q: '¿Cómo elijo entre Starter, Pro y Max?',
    a: 'Si atiendes menos de 5 pacientes semanales, Starter basta. Si tu agenda está consolidada, Pro es el estándar. Max es para quienes atienden alta demanda o quieren explorar lo experimental.',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false)
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [showComparison, setShowComparison] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
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

  const tiersWithPrice = useMemo(() => TIERS.map((t) => {
    const cents = isYearly ? PRICES[t.id].yearly : PRICES[t.id].monthly
    return {
      ...t,
      price: formatPrice(cents, isYearly),
      annualHint: isYearly ? `${formatTotal(PRICES[t.id].yearly)} al año` : null,
    }
  }), [isYearly])

  const clinicCents = isYearly ? PRICES.clinic.yearly : PRICES.clinic.monthly
  const clinicPrice = formatPrice(clinicCents, isYearly)
  const clinicAnnual = isYearly ? `${formatTotal(PRICES.clinic.yearly)} al año` : null

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      {/* Header — minimal, hairline border */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-3.5 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeftIcon className="h-4 w-4" weight="regular" />
            <span className="hidden sm:inline text-sm">Volver</span>
          </Button>
          <h1 className="font-serif text-lg tracking-tight text-foreground/90">Planes</h1>
          {isLoaded && effectiveTier !== 'free' && (
            <span className="ml-auto text-xs text-muted-foreground tracking-wide">
              Plan actual · <span className="text-foreground/80 font-medium">{effectiveTier.charAt(0).toUpperCase() + effectiveTier.slice(1)}</span>
            </span>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* HERO — single clear question, generous whitespace */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-6">
          Planes Aurora
        </p>
        <h2 className="font-serif text-[2.5rem] sm:text-5xl md:text-[3.75rem] leading-[1.08] tracking-tight text-foreground font-normal">
          ¿Cuánto espacio
          <br />
          <span className="text-foreground/70 italic">merece tu práctica?</span>
        </h2>
        <p className="mt-7 text-[17px] leading-relaxed text-muted-foreground max-w-xl mx-auto">
          Tres planes pensados para acompañar tu crecimiento profesional.
          Elige el que refleja tu ritmo hoy — cambia cuando quieras.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BILLING TOGGLE — quiet, centered */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-12">
        <div className="flex items-center justify-center gap-4">
          <span className={cn(
            'text-sm transition-colors',
            !isYearly ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}>
            Mensual
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            aria-label="Alternar entre facturación mensual y anual"
          />
          <span className={cn(
            'text-sm transition-colors inline-flex items-center gap-2',
            isYearly ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}>
            Anual
            <span className={cn(
              'text-[11px] tracking-wide text-primary/80 transition-opacity',
              isYearly ? 'opacity-100' : 'opacity-0'
            )}>
              · 2 meses sin costo
            </span>
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PRIMARY TIER GRID — 3 choices only (Hick's law) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
          {tiersWithPrice.map((tier) => {
            const isCurrent = isLoaded && effectiveTier === tier.id
            const isActive = isLoaded && (status === 'active' || status === 'trialing')
            const Icon = tier.icon

            return (
              <article
                key={tier.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-background p-8 sm:p-9 transition-all',
                  tier.featured
                    ? 'border-foreground/80 shadow-[0_1px_0_0_rgb(0_0_0/0.02),0_12px_32px_-12px_rgb(0_0_0/0.12)] lg:scale-[1.02]'
                    : 'border-border/60 hover:border-border',
                )}
              >
                {tier.featured && (
                  <span className="absolute -top-2.5 left-8 bg-foreground text-background text-[10px] uppercase tracking-[0.16em] font-medium px-2.5 py-1 rounded-sm">
                    Recomendado
                  </span>
                )}

                {/* Identity */}
                <div className="mb-8">
                  <Icon className="h-5 w-5 text-foreground/70 mb-5" weight="light" />
                  <h3 className="font-serif text-[1.75rem] tracking-tight text-foreground leading-none mb-2">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-muted-foreground/90 italic">
                    {tier.tagline}
                  </p>
                </div>

                {/* Price anchor */}
                <div className="mb-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-5xl tracking-tight text-foreground tabular-nums leading-none">
                      {tier.price}
                    </span>
                    <span className="text-sm text-muted-foreground">/mes</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground/70 h-4">
                    {tier.annualHint ?? '\u00A0'}
                  </p>
                </div>

                {/* For whom */}
                <p className="text-[13px] leading-relaxed text-muted-foreground mb-8 pb-8 border-b border-border/40 min-h-[3.75rem]">
                  {tier.forWho}
                </p>

                {/* Capacity — single clinical line */}
                <div className="mb-6">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">
                    Alcance clínico
                  </p>
                  <p className="text-[15px] text-foreground/90">
                    {tier.capacity}
                  </p>
                </div>

                {/* Differentiators — 3 only, curated per tier */}
                <div className="mb-8 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70 mb-4">
                    {tier.id === 'starter' ? 'Lo esencial' : tier.id === 'pro' ? 'Todo lo de Starter, y además' : 'Todo lo de Pro, y además'}
                  </p>
                  <ul className="space-y-3">
                    {tier.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2.5 text-[14px] leading-snug text-foreground/85">
                        <CheckIcon className="h-3.5 w-3.5 text-foreground/60 mt-[5px] shrink-0" weight="bold" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA — large, single-purpose (Fitts) */}
                {isCurrent && isActive ? (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-border/60 bg-transparent"
                    onClick={handleManageBilling}
                    disabled={loadingTier === 'portal'}
                  >
                    {loadingTier === 'portal' ? 'Abriendo...' : 'Administrar mi plan'}
                  </Button>
                ) : (
                  <Button
                    className={cn(
                      'w-full h-11 text-[14px]',
                      tier.featured
                        ? 'bg-foreground text-background hover:bg-foreground/90'
                        : 'bg-background border border-border/60 text-foreground hover:border-foreground/40 hover:bg-muted/30',
                    )}
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={loadingTier === tier.id}
                  >
                    {loadingTier === tier.id
                      ? 'Redirigiendo...'
                      : status === 'trialing'
                        ? `Activar ${tier.name}`
                        : 'Comenzar 14 días gratis'
                    }
                  </Button>
                )}
              </article>
            )
          })}
        </div>

        {/* Free plan — de-emphasized text link (not competing with primary choice) */}
        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground">
            ¿Solo quieres explorar?{' '}
            <button
              onClick={() => user ? router.push('/') : router.push('/')}
              className="text-foreground/80 hover:text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground/40 transition-colors"
            >
              Comienza gratis con el plan Free
            </button>
          </p>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* INCLUDED IN ALL — moves shared features out of cards */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-24 pb-20">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-4">
            Incluido en todos los planes
          </p>
          <h3 className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground font-normal">
            Lo que nunca cambia
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {ALWAYS_INCLUDED.map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-start gap-3">
              <Icon className="h-5 w-5 text-foreground/60" weight="light" />
              <p className="text-sm leading-relaxed text-foreground/80">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CLINIC — secondary decision, separated spatially */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 sm:p-12">
          <div className="flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-16">
            <div className="flex-1 min-w-0 max-w-xl">
              <div className="flex items-center gap-3 mb-5">
                <UsersThreeIcon className="h-5 w-5 text-foreground/70" weight="light" />
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                  Equipos clínicos
                </span>
              </div>
              <h3 className="font-serif text-3xl sm:text-[2.5rem] leading-tight tracking-tight text-foreground mb-4 font-normal">
                Clinic
              </h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">
                Para clínicas y equipos multidisciplinarios. Cinco profesionales comparten la capacidad
                clínica, acceden a todas las herramientas Pro y Max, y cuentan con un equipo de soporte dedicado.
              </p>
              <div className="grid grid-cols-3 gap-x-6 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">Profesionales</div>
                  <div className="text-foreground/90">5 incluidos</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">Herramientas</div>
                  <div className="text-foreground/90">Sin límite</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">Soporte</div>
                  <div className="text-foreground/90">Dedicado</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 shrink-0 lg:border-l lg:border-border/40 lg:pl-16 lg:min-w-[220px]">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-5xl tracking-tight tabular-nums text-foreground leading-none">
                    {clinicPrice}
                  </span>
                  <span className="text-sm text-muted-foreground">/mes</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground/70 h-4">
                  {clinicAnnual ?? '\u00A0'}
                </p>
              </div>
              <Button
                className="bg-foreground text-background hover:bg-foreground/90 w-full lg:w-auto px-7 h-11"
                onClick={() => handleSubscribe('clinic')}
                disabled={loadingTier === 'clinic'}
              >
                {loadingTier === 'clinic' ? 'Redirigiendo...' : 'Activar Clinic'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* COMPARISON — progressive disclosure, grouped by intent */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        <div className="flex justify-center">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2.5 px-1 border-b border-transparent hover:border-border/60"
            aria-expanded={showComparison}
          >
            <span>{showComparison ? 'Ocultar' : 'Ver'} comparación detallada</span>
            <CaretDownIcon className={cn('h-3.5 w-3.5 transition-transform', showComparison && 'rotate-180')} weight="bold" />
          </button>
        </div>

        {showComparison && (
          <div className="mt-10 overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-border/50 bg-muted/20">
                <tr>
                  <th className="text-left font-medium text-muted-foreground px-5 py-4 text-[11px] uppercase tracking-[0.12em] w-[40%]">
                    Herramienta clínica
                  </th>
                  {(['Starter','Pro','Max','Clinic'] as const).map((label) => (
                    <th
                      key={label}
                      className={cn(
                        'text-center font-medium px-3 py-4 text-[11px] uppercase tracking-[0.12em]',
                        label === 'Pro' ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group, gi) => (
                  <Fragment key={group.title}>
                    <tr className="bg-muted/10">
                      <td
                        colSpan={5}
                        className="px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 font-medium border-t border-border/40"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 text-foreground/85 text-[13px]">{row.label}</td>
                        {(['starter','pro','max','clinic'] as const).map((t) => {
                          const v = row[t]
                          return (
                            <td
                              key={t}
                              className={cn(
                                'text-center px-3 py-3',
                                t === 'pro' && 'bg-foreground/[0.015]'
                              )}
                            >
                              {typeof v === 'boolean' ? (
                                v ? (
                                  <CheckIcon className="h-3.5 w-3.5 text-foreground/70 inline-block" weight="bold" />
                                ) : (
                                  <MinusIcon className="h-3.5 w-3.5 text-muted-foreground/25 inline-block" weight="bold" />
                                )
                              ) : (
                                <span className="text-[13px] text-foreground/75">{v}</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* FAQ — reduce purchase anxiety */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-5 sm:px-8 pb-24">
        <div className="text-center mb-12">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-4">
            Preguntas frecuentes
          </p>
          <h3 className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground font-normal">
            Lo que suele preguntarse antes de comenzar
          </h3>
        </div>
        <div className="divide-y divide-border/50 border-y border-border/50">
          {FAQS.map((faq, i) => {
            const isOpen = openFaq === i
            return (
              <div key={faq.q}>
                <button
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="w-full flex items-start justify-between gap-6 py-5 text-left group"
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] text-foreground/90 group-hover:text-foreground transition-colors leading-snug">
                    {faq.q}
                  </span>
                  <CaretDownIcon
                    className={cn(
                      'h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform',
                      isOpen && 'rotate-180'
                    )}
                    weight="regular"
                  />
                </button>
                {isOpen && (
                  <p className="pb-5 text-[14px] text-muted-foreground leading-relaxed max-w-[90%]">
                    {faq.a}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CLOSING — gentle restatement */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-xl px-5 sm:px-8 pb-24 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60 mb-4">
          Precios en USD · ajustados automáticamente según tu región
        </p>
      </section>
    </div>
  )
}
