/**
 * Tier Configuration — Aurora Pro
 *
 * Central source of truth for subscription tiers, permissions, and token budgets.
 * Referenced by subscription-guard.ts for access control decisions.
 *
 * Token Budget Rationale (calibrated against real COGS with Gemini 3.1 Pro / Flash-Lite
 * as of Apr 2026 — see lib/session-metrics-comprehensive-tracker.ts MODEL_PRICING):
 *
 * - Free:     500K  tokens/month (discovery — ~30 msgs, CAC)
 * - Starter:    2M  tokens/month → ~120 msgs/mo ($12/mo, ~71% gross margin)
 * - Pro:        7M  tokens/month → ~430 msgs/mo ($29/mo, ~65% gross margin)
 * - Max:       25M  tokens/month → ~1.5K msgs/mo ($79/mo, ~56% gross margin)
 * - Clinic:   100M  tokens/month (pooled across 5 seats, $199/mo, ~30% margin + lock-in)
 * - Trial:     Same as Pro (full experience for conversion)
 *
 * The token cap — not the model — is the economic gating mechanism.
 * Heavy users naturally migrate upward; margin is structurally protected.
 *
 * @module lib/subscriptions/tier-config
 */

import type {
  SubscriptionTier,
  SubscriptionStatus,
  AgentId,
  ToolId,
} from './types'

// ---------------------------------------------------------------------------
// Token Budgets
// ---------------------------------------------------------------------------

export const TOKEN_BUDGETS: Record<SubscriptionTier, number> = {
  free:       500_000,     // 500K  tokens/month — discovery tier
  starter:  2_000_000,     //   2M  tokens/month — solo practitioners starting out
  pro:      7_000_000,     //   7M  tokens/month — active clinical practice
  max:     25_000_000,     //  25M  tokens/month — power users / heavy caseload
  clinic: 100_000_000,     // 100M  tokens/month — pooled across 5 seats (team plan)
}

/** Trial users get the same budget as Pro */
export const TRIAL_TOKEN_BUDGET = TOKEN_BUDGETS.pro

/** Warning thresholds as percentages */
export const TOKEN_WARNING_THRESHOLDS = [70, 85, 95, 100] as const

// ---------------------------------------------------------------------------
// Reverse Trial Configuration
// ---------------------------------------------------------------------------

export const TRIAL_CONFIG = {
  /** Duration in days */
  durationDays: 14,
  /** Which tier the user gets during trial */
  trialTier: 'pro' as SubscriptionTier,
  /** Which tier user falls to after trial expiry without conversion */
  fallbackTier: 'free' as SubscriptionTier,
  /** Grace period in hours after trial ends before hard downgrade */
  graceHours: 24,
} as const

// ---------------------------------------------------------------------------
// Agent Permissions
// ---------------------------------------------------------------------------

/**
 * Maps each agent to the minimum tier required to access it.
 * During trial, user has 'pro' tier access.
 */
export const AGENT_PERMISSIONS: Record<AgentId, SubscriptionTier> = {
  socratico:    'free',     // Base agent — always available
  clinico:      'starter',  // Clinical agent — Starter and above
  academico:    'pro',      // Academic agent — Pro and above
  experimental: 'max',      // Experimental agents — Max and Clinic
}

// ---------------------------------------------------------------------------
// Tool Permissions
// ---------------------------------------------------------------------------

/**
 * Maps each tool to the minimum tier required to use it.
 * Free tier gets read-only tools; Pro unlocks write tools; Max adds experimental.
 */
export const TOOL_PERMISSIONS: Record<ToolId, SubscriptionTier> = {
  // Read-only tools (Free tier)
  explore_patient_context: 'free',
  get_patient_record:      'free',
  list_patients:           'free',
  get_clinical_memories:   'free',

  // Basic write tools (Starter tier) — required for the plan to be useful
  save_clinical_memory:    'starter',
  upload_document:         'starter',
  session_summary:         'starter',

  // Advanced clinical tools (Pro tier)
  search_academic:         'pro',
  generate_ficha:          'pro',
  pattern_analysis:        'pro',

  // Experimental tools (Max / Clinic tier)
  experimental_tools:      'max',
}

// ---------------------------------------------------------------------------
// Feature Limits Per Tier
// ---------------------------------------------------------------------------

export interface TierLimits {
  /** Max active patients (null = unlimited) */
  maxActivePatients: number | null
  /** Max document uploads per month (null = unlimited) */
  maxDocumentUploads: number | null
  /** Max session length in messages (null = unlimited) */
  maxSessionMessages: number | null
  /** MCP tool access */
  mcpAccess: boolean
  /** Can export session data */
  canExportData: boolean
  /** Can use voice transcription */
  voiceTranscription: boolean
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    maxActivePatients: 3,
    maxDocumentUploads: 5,
    maxSessionMessages: 30,
    mcpAccess: false,
    canExportData: false,
    voiceTranscription: false,
  },
  starter: {
    maxActivePatients: 15,
    maxDocumentUploads: 50,
    maxSessionMessages: null,
    mcpAccess: false,
    canExportData: true,
    voiceTranscription: true,
  },
  pro: {
    maxActivePatients: null,  // unlimited
    maxDocumentUploads: null,
    maxSessionMessages: null,
    mcpAccess: true,
    canExportData: true,
    voiceTranscription: true,
  },
  max: {
    maxActivePatients: null,
    maxDocumentUploads: null,
    maxSessionMessages: null,
    mcpAccess: true,
    canExportData: true,
    voiceTranscription: true,
  },
  clinic: {
    maxActivePatients: null,
    maxDocumentUploads: null,
    maxSessionMessages: null,
    mcpAccess: true,
    canExportData: true,
    voiceTranscription: true,
  },
}

// ---------------------------------------------------------------------------
// Tier Hierarchy (for comparison)
// ---------------------------------------------------------------------------

/** Numeric rank for tier comparison: higher = more permissions */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  free:    0,
  starter: 1,
  pro:     2,
  max:     3,
  clinic:  4,  // Team plan — highest rank (includes all features + multi-seat)
}

/**
 * Check if a user's tier meets the minimum required tier.
 */
export function tierMeetsMinimum(
  userTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier]
}

// ---------------------------------------------------------------------------
// Status Helpers
// ---------------------------------------------------------------------------

/** Statuses that grant active access (tier-based permissions apply) */
export const ACTIVE_STATUSES: Set<SubscriptionStatus> = new Set([
  'trialing',
  'active',
])

/** Statuses with limited/grace access */
export const GRACE_STATUSES: Set<SubscriptionStatus> = new Set([
  'past_due',
  'paused',
])

/** Statuses that restrict to free tier */
export const RESTRICTED_STATUSES: Set<SubscriptionStatus> = new Set([
  'canceled',
  'downgraded',
])

/**
 * Resolve the effective tier based on subscription status.
 * - trialing/active → actual tier
 * - past_due → actual tier (grace period, retrying payment)
 * - paused → free tier (paused users lose premium access)
 * - canceled/downgraded → free tier
 */
export function getEffectiveTier(
  tier: SubscriptionTier,
  status: SubscriptionStatus
): SubscriptionTier {
  if (ACTIVE_STATUSES.has(status)) return tier
  if (status === 'past_due') return tier // Grace: keep access while retrying
  return 'free' // paused, canceled, downgraded
}

// ---------------------------------------------------------------------------
// Display Metadata
// ---------------------------------------------------------------------------

export const TIER_DISPLAY: Record<SubscriptionTier, { name: string; description: string }> = {
  free: {
    name: 'Free',
    description: 'Para explorar Aurora sin compromiso',
  },
  starter: {
    name: 'Starter',
    description: 'Para iniciar tu práctica con Aurora',
  },
  pro: {
    name: 'Pro',
    description: 'Toolkit clínico completo para profesionales activos',
  },
  max: {
    name: 'Max',
    description: 'Pro + experimental para práctica intensiva',
  },
  clinic: {
    name: 'Clinic',
    description: 'Plan multi-usuario para clínicas y equipos',
  },
}
