/**
 * Tier Configuration — Aurora Pro
 *
 * Central source of truth for subscription tiers, permissions, and token budgets.
 * Referenced by subscription-guard.ts for access control decisions.
 *
 * Token Budget Rationale (baseline ~5,500 tokens/message):
 * - Free:  1M tokens → ~180 messages/month → ~6/day
 * - Pro:   5M tokens → ~900 messages/month → ~30/day
 * - Max:  15M tokens → ~2,700 messages/month → ~90/day
 * - Trial: Same as Pro (full experience)
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
  free: 1_000_000,    // 1M tokens/month
  pro:  5_000_000,    // 5M tokens/month
  max: 15_000_000,    // 15M tokens/month
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
  socratico:    'free',   // Base agent — always available
  clinico:      'pro',    // Clinical agent — Pro and above
  academico:    'pro',    // Academic agent — Pro and above
  experimental: 'max',    // Experimental agents — Max only
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

  // Write tools (Pro tier)
  save_clinical_memory:    'pro',
  search_academic:         'pro',
  generate_ficha:          'pro',
  upload_document:         'pro',
  session_summary:         'pro',
  pattern_analysis:        'pro',

  // Experimental tools (Max tier)
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
    maxActivePatients: 5,
    maxDocumentUploads: 10,
    maxSessionMessages: 50,
    mcpAccess: false,
    canExportData: false,
    voiceTranscription: false,
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
}

// ---------------------------------------------------------------------------
// Tier Hierarchy (for comparison)
// ---------------------------------------------------------------------------

/** Numeric rank for tier comparison: higher = more permissions */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  pro:  1,
  max:  2,
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
    description: 'Basic access with limited features',
  },
  pro: {
    name: 'Pro',
    description: 'Full clinical toolkit for professionals',
  },
  max: {
    name: 'Max',
    description: 'Everything in Pro plus experimental features',
  },
}
