import 'server-only'

/**
 * Subscription Service — Aurora Pro
 *
 * Server-side service for managing subscription lifecycle:
 * - Token consumption recording (atomic Firestore increments)
 * - Monthly token resets
 * - Subscription creation and updates
 * - Warning threshold checks
 *
 * @module lib/subscriptions/subscription-service
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import { FieldValue } from 'firebase-admin/firestore'
import type {
  SubscriptionRecord,
  SubscriptionTier,
  SubscriptionStatus,
  TokenConsumption,
  TokenWarningLevel,
} from './types'
import {
  TOKEN_BUDGETS,
  TRIAL_TOKEN_BUDGET,
  TOKEN_WARNING_THRESHOLDS,
  TRIAL_CONFIG,
  getEffectiveTier,
} from './tier-config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subscriptionDocRef(uid: string) {
  const db = getAdminFirestore()
  return db.doc(`psychologists/${uid}/subscription/current`)
}

// ---------------------------------------------------------------------------
// Subscription CRUD
// ---------------------------------------------------------------------------

/**
 * Create or reset a subscription document for a new user.
 * Called during signup or when initializing a user who has no subscription doc.
 *
 * Uses set({ merge: true }) — safe to call multiple times (idempotent).
 */
export async function initializeSubscription(
  uid: string,
  tier: SubscriptionTier = 'free',
  status: SubscriptionStatus = 'downgraded'
): Promise<void> {
  const now = new Date().toISOString()
  const record: SubscriptionRecord = {
    tier,
    status,
    trialStartDate: null,
    trialEndDate: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    externalCustomerId: null,
    externalSubscriptionId: null,
    paymentProvider: null,
    currency: null,
    priceId: null,
    tokenBudget: TOKEN_BUDGETS[tier],
    tokensUsedThisMonth: 0,
    tokenResetDate: null,
    warningsSent: [],
    createdAt: now,
    updatedAt: now,
  }

  await subscriptionDocRef(uid).set(record, { merge: true })
}

/**
 * Start a Reverse Trial for the user.
 * Grants Pro-tier access for TRIAL_CONFIG.durationDays days.
 */
export async function startTrial(uid: string): Promise<void> {
  const now = new Date()
  const trialEnd = new Date(now)
  trialEnd.setDate(trialEnd.getDate() + TRIAL_CONFIG.durationDays)

  await subscriptionDocRef(uid).set(
    {
      tier: TRIAL_CONFIG.trialTier,
      status: 'trialing' as SubscriptionStatus,
      trialStartDate: now.toISOString(),
      trialEndDate: trialEnd.toISOString(),
      tokenBudget: TRIAL_TOKEN_BUDGET,
      tokensUsedThisMonth: 0,
      warningsSent: [],
      updatedAt: now.toISOString(),
    },
    { merge: true }
  )
}

/**
 * Update subscription fields.
 * Called by webhook handler when Stripe events arrive.
 */
export async function updateSubscription(
  uid: string,
  updates: Partial<SubscriptionRecord>
): Promise<void> {
  await subscriptionDocRef(uid).set(
    {
      ...updates,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

/**
 * Downgrade a user to free tier.
 * Called when trial expires or subscription is canceled.
 * NEVER deletes patient data — only restricts access level.
 */
export async function downgradeToFree(uid: string): Promise<void> {
  await subscriptionDocRef(uid).set(
    {
      tier: 'free' as SubscriptionTier,
      status: 'downgraded' as SubscriptionStatus,
      tokenBudget: TOKEN_BUDGETS.free,
      tokensUsedThisMonth: 0,
      warningsSent: [],
      trialStartDate: null,
      trialEndDate: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

// ---------------------------------------------------------------------------
// Token Metering
// ---------------------------------------------------------------------------

/**
 * Record token consumption for a user.
 * Uses atomic increment — safe for concurrent requests.
 *
 * @returns The warning level after recording consumption
 */
export async function recordTokenConsumption(
  uid: string,
  consumption: TokenConsumption
): Promise<TokenWarningLevel> {
  const docRef = subscriptionDocRef(uid)

  // Atomic increment — no read-before-write needed
  await docRef.set(
    {
      tokensUsedThisMonth: FieldValue.increment(consumption.totalTokens),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )

  // Read back to check warning thresholds
  const snap = await docRef.get()
  if (!snap.exists) return 'none'

  const data = snap.data() as SubscriptionRecord
  const effectiveTier = getEffectiveTier(data.tier, data.status)
  const budget =
    data.status === 'trialing' ? TRIAL_TOKEN_BUDGET : TOKEN_BUDGETS[effectiveTier]
  const used = data.tokensUsedThisMonth || 0
  const usagePercent = budget > 0 ? Math.round((used / budget) * 100) : 100

  // Determine current warning level
  let warningLevel: TokenWarningLevel = 'none'
  for (const threshold of TOKEN_WARNING_THRESHOLDS) {
    if (usagePercent >= threshold) {
      warningLevel = String(threshold) as TokenWarningLevel
    }
  }

  // Send warning if it hasn't been sent yet
  const warningsSent = data.warningsSent || []
  if (warningLevel !== 'none' && !warningsSent.includes(warningLevel)) {
    await docRef.set(
      {
        warningsSent: FieldValue.arrayUnion(warningLevel),
      },
      { merge: true }
    )
  }

  return warningLevel
}

/**
 * Get current token usage stats for a user.
 */
export async function getTokenUsage(uid: string): Promise<{
  used: number
  budget: number
  remaining: number
  usagePercent: number
  warningLevel: TokenWarningLevel
}> {
  const docRef = subscriptionDocRef(uid)
  const snap = await docRef.get()

  if (!snap.exists) {
    return {
      used: 0,
      budget: TOKEN_BUDGETS.free,
      remaining: TOKEN_BUDGETS.free,
      usagePercent: 0,
      warningLevel: 'none',
    }
  }

  const data = snap.data() as SubscriptionRecord
  const effectiveTier = getEffectiveTier(data.tier, data.status)
  const budget =
    data.status === 'trialing' ? TRIAL_TOKEN_BUDGET : TOKEN_BUDGETS[effectiveTier]
  const used = data.tokensUsedThisMonth || 0
  const remaining = Math.max(0, budget - used)
  const usagePercent = budget > 0 ? Math.round((used / budget) * 100) : 100

  let warningLevel: TokenWarningLevel = 'none'
  for (const threshold of TOKEN_WARNING_THRESHOLDS) {
    if (usagePercent >= threshold) {
      warningLevel = String(threshold) as TokenWarningLevel
    }
  }

  return { used, budget, remaining, usagePercent, warningLevel }
}

/**
 * Reset monthly token counter for a user.
 * Called by a scheduled Cloud Function at the start of each billing cycle.
 */
export async function resetMonthlyTokens(uid: string): Promise<void> {
  const now = new Date()
  const nextReset = new Date(now)
  nextReset.setMonth(nextReset.getMonth() + 1)
  nextReset.setDate(1)
  nextReset.setHours(0, 0, 0, 0)

  await subscriptionDocRef(uid).set(
    {
      tokensUsedThisMonth: 0,
      tokenResetDate: nextReset.toISOString(),
      warningsSent: [],
      updatedAt: now.toISOString(),
    },
    { merge: true }
  )
}
