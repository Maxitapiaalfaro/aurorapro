import 'server-only'

/**
 * Subscription Guard — Aurora Pro
 *
 * Server-side access control functions that check a user's subscription
 * tier and status before granting access to agents, tools, or features.
 *
 * All functions read from Firestore: psychologists/{uid}/subscription/current
 *
 * @module lib/subscriptions/subscription-guard
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import type {
  SubscriptionTier,
  SubscriptionRecord,
  AccessResult,
  TokenBudgetResult,
  TokenWarningLevel,
  AgentId,
  ToolId,
} from './types'
import {
  AGENT_PERMISSIONS,
  TOOL_PERMISSIONS,
  TIER_LIMITS,
  TOKEN_BUDGETS,
  TRIAL_TOKEN_BUDGET,
  tierMeetsMinimum,
  getEffectiveTier,
  TIER_DISPLAY,
  type TierLimits,
} from './tier-config'

// ---------------------------------------------------------------------------
// Internal: Fetch subscription from Firestore
// ---------------------------------------------------------------------------

const DEFAULT_SUBSCRIPTION: SubscriptionRecord = {
  tier: 'free',
  status: 'downgraded',
  trialStartDate: null,
  trialEndDate: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  externalCustomerId: null,
  externalSubscriptionId: null,
  paymentProvider: null,
  currency: null,
  priceId: null,
  tokenBudget: TOKEN_BUDGETS.free,
  tokensUsedThisMonth: 0,
  tokenResetDate: null,
  warningsSent: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/**
 * Fetch the user's subscription record from Firestore.
 * Returns a default free-tier record if no subscription document exists.
 */
export async function getSubscription(uid: string): Promise<SubscriptionRecord> {
  const db = getAdminFirestore()
  const docRef = db.doc(`psychologists/${uid}/subscription/current`)
  const snap = await docRef.get()

  if (!snap.exists) {
    return { ...DEFAULT_SUBSCRIPTION }
  }

  const data = snap.data() as Partial<SubscriptionRecord>
  return {
    ...DEFAULT_SUBSCRIPTION,
    ...data,
  }
}

// ---------------------------------------------------------------------------
// Agent Access
// ---------------------------------------------------------------------------

/**
 * Check if a user can access a specific agent.
 *
 * @example
 * const result = await evaluateAgentAccess(uid, 'clinico')
 * if (!result.allowed) return { error: result.reason }
 */
export async function evaluateAgentAccess(
  uid: string,
  agentId: AgentId
): Promise<AccessResult> {
  const sub = await getSubscription(uid)
  const effectiveTier = getEffectiveTier(sub.tier, sub.status)
  const requiredTier = AGENT_PERMISSIONS[agentId]

  if (!requiredTier) {
    return { allowed: false, reason: `Unknown agent: ${agentId}` }
  }

  if (tierMeetsMinimum(effectiveTier, requiredTier)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Agent "${agentId}" requires ${TIER_DISPLAY[requiredTier].name} tier or above. Current tier: ${TIER_DISPLAY[effectiveTier].name}.`,
    requiredTier,
    currentTier: effectiveTier,
  }
}

// ---------------------------------------------------------------------------
// Tool Access
// ---------------------------------------------------------------------------

/**
 * Check if a user can use a specific tool.
 *
 * @example
 * const result = await evaluateToolAccess(uid, 'save_clinical_memory')
 * if (!result.allowed) return { error: result.reason }
 */
export async function evaluateToolAccess(
  uid: string,
  toolId: ToolId
): Promise<AccessResult> {
  const sub = await getSubscription(uid)
  const effectiveTier = getEffectiveTier(sub.tier, sub.status)
  const requiredTier = TOOL_PERMISSIONS[toolId]

  if (!requiredTier) {
    return { allowed: false, reason: `Unknown tool: ${toolId}` }
  }

  if (tierMeetsMinimum(effectiveTier, requiredTier)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `Tool "${toolId}" requires ${TIER_DISPLAY[requiredTier].name} tier or above. Current tier: ${TIER_DISPLAY[effectiveTier].name}.`,
    requiredTier,
    currentTier: effectiveTier,
  }
}

// ---------------------------------------------------------------------------
// Token Budget
// ---------------------------------------------------------------------------

function resolveWarningLevel(usagePercent: number): TokenWarningLevel {
  if (usagePercent >= 100) return '100'
  if (usagePercent >= 95) return '95'
  if (usagePercent >= 85) return '85'
  if (usagePercent >= 70) return '70'
  return 'none'
}

/**
 * Check if a user has enough token budget for an estimated consumption.
 *
 * @param uid - Firebase UID
 * @param estimatedTokens - Estimated tokens for the upcoming request (0 = just check status)
 */
export async function evaluateTokenBudget(
  uid: string,
  estimatedTokens: number = 0
): Promise<TokenBudgetResult> {
  const sub = await getSubscription(uid)
  const effectiveTier = getEffectiveTier(sub.tier, sub.status)

  // Resolve budget: trial users get Pro-level budget
  const budget =
    sub.status === 'trialing' ? TRIAL_TOKEN_BUDGET : TOKEN_BUDGETS[effectiveTier]

  const used = sub.tokensUsedThisMonth || 0
  const remaining = Math.max(0, budget - used)
  const usagePercent = budget > 0 ? Math.round((used / budget) * 100) : 100
  const warningLevel = resolveWarningLevel(usagePercent)

  if (estimatedTokens > 0 && used + estimatedTokens > budget) {
    return {
      allowed: false,
      reason: `Token budget exceeded. Used: ${used.toLocaleString()} / ${budget.toLocaleString()} tokens. Upgrade to increase your limit.`,
      remaining,
      usagePercent: Math.min(usagePercent, 100),
      warningLevel,
    }
  }

  return {
    allowed: true,
    remaining,
    usagePercent: Math.min(usagePercent, 100),
    warningLevel,
  }
}

// ---------------------------------------------------------------------------
// Feature Limits
// ---------------------------------------------------------------------------

/**
 * Get the feature limits for the user's effective tier.
 */
export async function getFeatureLimits(uid: string): Promise<TierLimits> {
  const sub = await getSubscription(uid)
  const effectiveTier = getEffectiveTier(sub.tier, sub.status)
  return TIER_LIMITS[effectiveTier]
}

// ---------------------------------------------------------------------------
// Convenience: Get full subscription status for client
// ---------------------------------------------------------------------------

export interface SubscriptionStatusInfo {
  tier: SubscriptionTier
  effectiveTier: SubscriptionTier
  status: SubscriptionRecord['status']
  tokenBudget: number
  tokensUsed: number
  tokensRemaining: number
  usagePercent: number
  warningLevel: TokenWarningLevel
  trialDaysRemaining: number | null
  limits: TierLimits
}

/**
 * Get a comprehensive subscription status summary for the client.
 * This is the primary data source for the `useSubscription` hook.
 */
export async function getSubscriptionStatus(uid: string): Promise<SubscriptionStatusInfo> {
  const sub = await getSubscription(uid)
  const effectiveTier = getEffectiveTier(sub.tier, sub.status)
  const budget =
    sub.status === 'trialing' ? TRIAL_TOKEN_BUDGET : TOKEN_BUDGETS[effectiveTier]
  const used = sub.tokensUsedThisMonth || 0
  const remaining = Math.max(0, budget - used)
  const usagePercent = budget > 0 ? Math.round((used / budget) * 100) : 100

  // Calculate trial days remaining
  let trialDaysRemaining: number | null = null
  if (sub.status === 'trialing' && sub.trialEndDate) {
    const endDate = new Date(sub.trialEndDate)
    const now = new Date()
    const diffMs = endDate.getTime() - now.getTime()
    trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }

  return {
    tier: sub.tier,
    effectiveTier,
    status: sub.status,
    tokenBudget: budget,
    tokensUsed: used,
    tokensRemaining: remaining,
    usagePercent: Math.min(usagePercent, 100),
    warningLevel: resolveWarningLevel(usagePercent),
    trialDaysRemaining,
    limits: TIER_LIMITS[effectiveTier],
  }
}
