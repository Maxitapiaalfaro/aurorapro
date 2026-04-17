"use client"

/**
 * PatientContextCard
 * ─────────────────────────────────────────────────────────────────────────
 * Critical layer of the Session-Start flow (§3 Step 2 of the approved UX
 * spec). Presentational only — parent owns data fetching and the actual
 * "Iniciar Sesión" handler.
 *
 * Contract — enforced, not optional:
 *   • PHI-safe loading: renders a neutral skeleton with the generic text
 *     "Cargando paciente…". It will NEVER render a partial name. The real
 *     content only appears once `status === 'ready'` AND `patient` is given.
 *   • Atomic critical render: name + tags + latest summary appear together.
 *   • Non-blocking errors for non-critical sub-regions: a missing summary
 *     does not disable "Iniciar Sesión".
 *   • Keyboard & SR: <h1> gets tabindex=-1 focus on mount for screen-reader
 *     announcement; skeleton carries aria-busy; status changes announce via
 *     a polite live region.
 *   • Reduced motion honored by the global media-query rule in
 *     app/globals.css (no local framer-motion).
 *   • Responsive 320–2560px; CTA ≥ 44×44 px touch target.
 */

import * as React from "react"
import { AlertCircle, Play, RefreshCw, ShieldAlert, WifiOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PatientRecord } from "@/types/clinical-types"

// ─── Types ────────────────────────────────────────────────────────────────

export type PatientContextStatus = "loading" | "ready" | "error"

export interface PatientContextSummary {
  /** Relative date string already formatted by caller (e.g. "hace 3 días"). */
  relativeDate: string
  /** Short summary text, ≤ ~300 chars. Caller decides truncation. */
  summaryText: string
  /** Open therapeutic threads to surface. Optional. */
  openThreads?: string[]
}

export interface PatientContextCardProps {
  status: PatientContextStatus
  /** Required when status === 'ready'. Ignored otherwise to guarantee
   *  no PHI leaks during loading. */
  patient?: PatientRecord | null
  /** Latest session summary. `null` means "loaded but empty" (first-time
   *  patient). `undefined` means "still loading / failed". */
  latestSummary?: PatientContextSummary | null
  /** Status of the summary sub-region. Non-blocking — controls its own UI. */
  summaryStatus?: "loading" | "ready" | "error" | "empty"
  /** Source of currently-displayed data. Drives the offline banner. */
  source?: "local" | "remote"
  /** Patient has active crisis / risk flag. Shows top banner. */
  crisisFlag?: boolean
  /** Viewer is accessing another clinician's patient. */
  supervisorView?: boolean
  /** Pre-session scheduled time, if any (ISO or already-formatted string). */
  scheduledLabel?: string
  /** Fired when user clicks primary CTA. Disabled until status === 'ready'. */
  onStartSession: () => void
  /** Fired when user hits retry on the critical error state. */
  onRetry?: () => void
  /** Fired when user hits retry on the summary-only failure. */
  onRetrySummary?: () => void
  className?: string
}

// ─── Component ────────────────────────────────────────────────────────────

export function PatientContextCard({
  status,
  patient,
  latestSummary,
  summaryStatus = "ready",
  source = "remote",
  crisisFlag,
  supervisorView,
  scheduledLabel,
  onStartSession,
  onRetry,
  onRetrySummary,
  className,
}: PatientContextCardProps) {
  const headingRef = React.useRef<HTMLHeadingElement | null>(null)

  // Move focus to the patient name once the critical layer resolves so
  // screen readers announce the patient context atomically.
  React.useEffect(() => {
    if (status === "ready" && headingRef.current) {
      headingRef.current.focus()
    }
  }, [status, patient?.id])

  // ── Polite live-region text. Only changes on state transitions. ────────
  const liveMessage = React.useMemo(() => {
    if (status === "loading") return "Cargando paciente"
    if (status === "error") return "No pudimos cargar los datos del paciente"
    if (status === "ready" && patient) {
      const last =
        latestSummary && summaryStatus === "ready"
          ? `, última sesión ${latestSummary.relativeDate}`
          : ""
      return `Paciente ${patient.displayName} cargado${last}`
    }
    return ""
  }, [status, patient, latestSummary, summaryStatus])

  return (
    <section
      aria-labelledby="patient-context-heading"
      aria-busy={status === "loading"}
      className={cn(
        "relative rounded-lg border border-border/50 bg-card/90 text-card-foreground",
        "shadow-warm-sm backdrop-blur-sm",
        "p-4 sm:p-6",
        className
      )}
    >
      {/* Polite announcement region — never contains PHI while loading. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      {/* ── Banners (rendered above the heading so they are first in
             tab order immediately after the offline/supervisor chip) ── */}
      {source === "local" && status !== "loading" && (
        <OfflineBanner />
      )}
      {supervisorView && status === "ready" && (
        <SupervisorBanner />
      )}
      {crisisFlag && status === "ready" && (
        <CrisisBanner />
      )}

      {/* ── Main body ─────────────────────────────────────────────────── */}
      {status === "loading" && <LoadingSkeleton />}
      {status === "error" && <CriticalError onRetry={onRetry} />}
      {status === "ready" && patient && (
        <ReadyBody
          headingRef={headingRef}
          patient={patient}
          latestSummary={latestSummary ?? null}
          summaryStatus={summaryStatus}
          scheduledLabel={scheduledLabel}
          onStartSession={onStartSession}
          onRetrySummary={onRetrySummary}
        />
      )}
    </section>
  )
}

// ─── Sub-views ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* Generic title ONLY — no name fragment ever appears here. */}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cargando paciente…
        </p>
        <div className="h-7 w-56 max-w-full animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex justify-end pt-2">
        <div className="h-11 w-40 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  )
}

function CriticalError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex-1 space-y-2">
        <h2 className="text-sm font-semibold text-destructive">
          No pudimos cargar los datos del paciente
        </h2>
        <p className="text-sm text-muted-foreground">
          Revisa tu conexión e intenta nuevamente. Si el problema persiste,
          vuelve a la lista de pacientes y selecciona otro.
        </p>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-1"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Reintentar
          </Button>
        )}
      </div>
    </div>
  )
}

function ReadyBody({
  headingRef,
  patient,
  latestSummary,
  summaryStatus,
  scheduledLabel,
  onStartSession,
  onRetrySummary,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>
  patient: PatientRecord
  latestSummary: PatientContextSummary | null
  summaryStatus: NonNullable<PatientContextCardProps["summaryStatus"]>
  scheduledLabel?: string
  onStartSession: () => void
  onRetrySummary?: () => void
}) {
  const demographicsLine = buildDemographicsLine(patient)

  return (
    <div className="space-y-5">
      {/* Header — name + demographics + tags */}
      <header className="space-y-2">
        {scheduledLabel && (
          <p className="text-xs font-medium uppercase tracking-wide text-accent-foreground/80">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-accent-foreground">
              {scheduledLabel}
            </span>
          </p>
        )}
        <h1
          id="patient-context-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-xl sm:text-2xl font-semibold leading-tight tracking-tight text-foreground focus:outline-none"
        >
          {patient.displayName}
        </h1>
        {demographicsLine && (
          <p className="text-sm text-muted-foreground">{demographicsLine}</p>
        )}
        {patient.tags && patient.tags.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5 pt-1"
            aria-label="Etiquetas clínicas"
          >
            {patient.tags.slice(0, 8).map((tag) => (
              <li key={tag}>
                <Badge
                  variant="secondary"
                  className="rounded-full text-[11px] font-medium"
                >
                  {tag}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* Latest session summary sub-region (non-blocking) */}
      <SummaryRegion
        status={summaryStatus}
        summary={latestSummary}
        onRetry={onRetrySummary}
      />

      {/* Primary CTA — always enabled at ready, even if summary failed. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:items-center">
        <Button
          type="button"
          size="lg"
          onClick={onStartSession}
          className={cn(
            // Ensure ≥ 44×44 px touch target on every surface
            "min-h-[44px] w-full sm:w-auto px-6",
            "font-medium"
          )}
        >
          <Play className="mr-2 h-4 w-4" aria-hidden="true" />
          Iniciar Sesión
        </Button>
      </div>
    </div>
  )
}

function SummaryRegion({
  status,
  summary,
  onRetry,
}: {
  status: NonNullable<PatientContextCardProps["summaryStatus"]>
  summary: PatientContextSummary | null
  onRetry?: () => void
}) {
  if (status === "loading") {
    return (
      <div
        aria-busy="true"
        aria-label="Cargando resumen de última sesión"
        className="space-y-2 rounded-md border border-border/40 bg-background/40 p-3"
      >
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-10/12 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (status === "error") {
    return (
      <div
        role="note"
        className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 p-3 text-sm"
      >
        <AlertCircle
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="flex-1">
          <p className="text-foreground">
            Resumen no disponible — puedes iniciar sesión de todos modos.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    )
  }

  if (status === "empty" || !summary) {
    return (
      <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-3 text-sm text-muted-foreground">
        Primera sesión con este paciente — sin contexto previo.
      </div>
    )
  }

  return (
    <article
      aria-labelledby="last-session-heading"
      className="space-y-2 rounded-md border border-border/40 bg-background/40 p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <h2
          id="last-session-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Última sesión
        </h2>
        <span className="text-xs text-muted-foreground">{summary.relativeDate}</span>
      </header>
      <p className="text-sm leading-relaxed text-foreground/90">
        {summary.summaryText}
      </p>
      {summary.openThreads && summary.openThreads.length > 0 && (
        <div className="pt-1">
          <h3 className="sr-only">Temas abiertos</h3>
          <ul className="flex flex-wrap gap-1.5">
            {summary.openThreads.map((thread) => (
              <li key={thread}>
                <Badge
                  variant="outline"
                  className="rounded-full text-[11px] font-normal"
                >
                  {thread}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

// ─── Banners ──────────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        Modo offline — algunos datos pueden estar desactualizados.
      </span>
    </div>
  )
}

function SupervisorBanner() {
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground"
    >
      <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
      <span>Acceso como supervisor — acción auditada.</span>
    </div>
  )
}

function CrisisBanner() {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-md border-2 border-destructive/60 bg-destructive/10 px-3 py-2 text-sm"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold text-destructive">
          Paciente marcado con riesgo activo
        </p>
        <p className="text-xs text-destructive/90">
          Revisa el protocolo de crisis antes de iniciar la sesión.
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildDemographicsLine(patient: PatientRecord): string | null {
  const d = patient.demographics
  if (!d) return null
  const parts: string[] = []
  if (d.ageRange) parts.push(d.ageRange)
  if (d.gender) parts.push(d.gender)
  if (d.occupation) parts.push(d.occupation)
  return parts.length > 0 ? parts.join(" · ") : null
}
