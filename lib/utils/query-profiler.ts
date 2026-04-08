/**
 * Pipeline profiler for Aurora message processing.
 * Inspired by Claude Code's queryProfiler.ts pattern.
 *
 * Tracks checkpoint timings from API request to first Gemini token.
 * Zero overhead in production (returns no-op objects when disabled).
 */

import { createLogger } from '../logger'

const logger = createLogger('performance')

// --- Types ---

interface Checkpoint {
  name: string
  timestamp: number
}

export interface QueryProfile {
  id: string
  startTime: number
  checkpoints: Checkpoint[]
  enabled: boolean
}

interface PhaseReport {
  name: string
  durationMs: number
  warning: string
}

interface ProfileReport {
  id: string
  totalMs: number
  phases: PhaseReport[]
  preApiOverheadMs: number | null
}

// --- No-op singleton (zero allocations in production) ---

const NOOP_PROFILE: QueryProfile = {
  id: 'noop',
  startTime: 0,
  checkpoints: [],
  enabled: false,
}

// --- Core API ---

function isProfilingEnabled(): boolean {
  return (
    process.env.AURORA_PROFILE_QUERY === '1' ||
    process.env.NODE_ENV === 'development'
  )
}

export function startQueryProfile(): QueryProfile {
  if (!isProfilingEnabled()) return NOOP_PROFILE

  const now = Date.now()
  const profile: QueryProfile = {
    id: `qp_${now}_${Math.random().toString(36).slice(2, 6)}`,
    startTime: now,
    checkpoints: [{ name: 'request_received', timestamp: now }],
    enabled: true,
  }
  return profile
}

export function queryCheckpoint(profile: QueryProfile | undefined, name: string): void {
  if (!profile?.enabled) return
  profile.checkpoints.push({ name, timestamp: Date.now() })
}

function getWarning(deltaMs: number): string {
  if (deltaMs > 1000) return ' ⚠️  VERY SLOW'
  if (deltaMs > 100) return ' ⚠️  SLOW'
  return ''
}

export function finishQueryProfile(profile: QueryProfile | undefined): ProfileReport | null {
  if (!profile?.enabled) return null

  const now = Date.now()
  profile.checkpoints.push({ name: 'profile_end', timestamp: now })

  const totalMs = now - profile.startTime
  const phases: PhaseReport[] = []

  for (let i = 1; i < profile.checkpoints.length; i++) {
    const prev = profile.checkpoints[i - 1]
    const curr = profile.checkpoints[i]
    const durationMs = curr.timestamp - prev.timestamp
    phases.push({
      name: `${prev.name} → ${curr.name}`,
      durationMs,
      warning: getWarning(durationMs),
    })
  }

  // Pre-API overhead: everything before gemini_session_ready
  const geminiReady = profile.checkpoints.find(c => c.name === 'gemini_session_ready')
  const preApiOverheadMs = geminiReady
    ? geminiReady.timestamp - profile.startTime
    : null

  const report: ProfileReport = { id: profile.id, totalMs, phases, preApiOverheadMs }

  // Log the report
  const lines = [
    `\n📊 Query Profile [${profile.id}] — Total: ${totalMs}ms`,
    ...phases.map(p =>
      `  ${p.name.padEnd(50)} ${String(p.durationMs).padStart(6)}ms${p.warning}`
    ),
  ]
  if (preApiOverheadMs !== null) {
    lines.push(`  ${'Pre-API overhead'.padEnd(50)} ${String(preApiOverheadMs).padStart(6)}ms`)
  }
  logger.info(lines.join('\n'))

  return report
}
