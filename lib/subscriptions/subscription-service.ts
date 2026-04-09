import 'server-only'

/**
 * Subscription Service — Server-side Subscription State Management
 *
 * Manages the subscription lifecycle in Firestore using firebase-admin.
 * Handles:
 * - Creating initial freemium subscriptions on registration
 * - Reading subscription state for guard evaluation
 * - Updating token consumption (atomic increments)
 * - Processing tier upgrades/downgrades from Stripe webhooks
 * - Checking and expiring freemium trials
 *
 * Firestore path: `psychologists/{uid}/subscription/current`
 *
 * Pattern: Follows Claude Code's backend-owns-truth model where
 * subscription state is only written server-side and read by the client.
 *
 * @module lib/subscriptions/subscription-service
 */

import { getAdminFirestore } from '@/lib/firebase-admin-config'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { TIER_CONFIGS, calculateTrialExpiry } from './tier-config'
import type {
  SubscriptionTier,
  SubscriptionStatus,
  UserSubscription,
  TokenUsage,
} from '@/types/subscription-types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('subscription')

// ============================================================================
// FIRESTORE PATH HELPERS
// ============================================================================

/**
 * Returns the Firestore document reference for a user's subscription.
 * Path: `psychologists/{uid}/subscription/current`
 */
function getSubscriptionDocRef(userId: string) {
  const db = getAdminFirestore()
  return db.collection('psychologists').doc(userId)
    .collection('subscription').doc('current')
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Load the current subscription for a user.
 *
 * Returns null if no subscription document exists (user has never
 * been provisioned — should trigger createFreemiumSubscription).
 */
export async function getUserSubscription(
  userId: string,
): Promise<UserSubscription | null> {
  try {
    const docRef = getSubscriptionDocRef(userId)
    const snap = await docRef.get()

    if (!snap.exists) {
      logger.info(`[Subscription] No subscription found for user ${userId}`)
      return null
    }

    const data = snap.data()!
    return reviveTimestamps(data) as unknown as UserSubscription
  } catch (error) {
    logger.error(`[Subscription] Failed to load subscription for ${userId}:`, error)
    throw error
  }
}

/**
 * Quick check: get just the tier and status without full document.
 * Optimized for the hot path in the subscription guard.
 */
export async function getSubscriptionTierAndStatus(
  userId: string,
): Promise<{ tier: SubscriptionTier; status: SubscriptionStatus; tokenUsage: TokenUsage } | null> {
  const sub = await getUserSubscription(userId)
  if (!sub) return null

  return {
    tier: sub.tier,
    status: sub.status,
    tokenUsage: sub.tokenUsage,
  }
}

// ============================================================================
// WRITE OPERATIONS — Subscription Lifecycle
// ============================================================================

/**
 * Create a freemium subscription for a newly registered user.
 *
 * Called during user registration flow. Sets up the 7-day trial
 * with the base agent access and 500K token limit.
 */
export async function createFreemiumSubscription(
  userId: string,
): Promise<UserSubscription> {
  const now = new Date()
  const trialExpiry = calculateTrialExpiry(now)

  const subscription: UserSubscription = {
    tier: 'freemium',
    status: 'trialing',
    registeredAt: now,
    trialExpiresAt: trialExpiry,
    currentPeriodStart: now,
    currentPeriodEnd: trialExpiry,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastPaymentAt: null,
    tokenUsage: {
      totalTokens: 0,
      tokenLimit: TIER_CONFIGS.freemium.tokenLimit,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      periodResetAt: now,
    },
    featureFlags: [],
    createdAt: now,
    updatedAt: now,
  }

  const docRef = getSubscriptionDocRef(userId)
  await docRef.set(serializeForFirestore(subscription))

  logger.info(`[Subscription] Created freemium subscription for user ${userId}, trial expires ${trialExpiry.toISOString()}`)
  return subscription
}

/**
 * Upgrade a user's subscription to a paid tier.
 *
 * Called when Stripe webhook confirms payment (checkout.session.completed
 * or customer.subscription.created).
 */
export async function upgradeSubscription(
  userId: string,
  tier: 'pro' | 'max',
  stripeCustomerId: string,
  stripeSubscriptionId: string,
): Promise<void> {
  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setDate(periodEnd.getDate() + TIER_CONFIGS[tier].periodDays)

  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    tier,
    status: 'active',
    currentPeriodStart: Timestamp.fromDate(now),
    currentPeriodEnd: Timestamp.fromDate(periodEnd),
    stripeCustomerId,
    stripeSubscriptionId,
    lastPaymentAt: Timestamp.fromDate(now),
    // Reset token counter for new billing period
    'tokenUsage.totalTokens': 0,
    'tokenUsage.inputTokens': 0,
    'tokenUsage.outputTokens': 0,
    'tokenUsage.cacheReadTokens': 0,
    'tokenUsage.tokenLimit': TIER_CONFIGS[tier].tokenLimit,
    'tokenUsage.periodResetAt': Timestamp.fromDate(now),
    // Enable feature flags for Max tier
    featureFlags: tier === 'max' ? ['experimental_features', 'priority_access'] : [],
    updatedAt: Timestamp.fromDate(now),
  })

  logger.info(`[Subscription] Upgraded user ${userId} to ${tier} (Stripe: ${stripeSubscriptionId})`)
}

/**
 * Handle subscription cancellation from Stripe webhook.
 */
export async function cancelSubscription(
  userId: string,
): Promise<void> {
  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    status: 'canceled',
    updatedAt: Timestamp.fromDate(new Date()),
  })

  logger.info(`[Subscription] Canceled subscription for user ${userId}`)
}

/**
 * Handle subscription expiration (period ended without renewal).
 */
export async function expireSubscription(
  userId: string,
): Promise<void> {
  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    status: 'expired',
    featureFlags: [],
    updatedAt: Timestamp.fromDate(new Date()),
  })

  logger.info(`[Subscription] Expired subscription for user ${userId}`)
}

/**
 * Mark subscription as past_due when payment fails.
 */
export async function markPaymentFailed(
  userId: string,
): Promise<void> {
  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    status: 'past_due',
    updatedAt: Timestamp.fromDate(new Date()),
  })

  logger.warn(`[Subscription] Payment failed for user ${userId}, marked as past_due`)
}

/**
 * Renew subscription for a new billing period.
 * Called on invoice.payment_succeeded webhook.
 */
export async function renewSubscription(
  userId: string,
  tier: 'pro' | 'max',
): Promise<void> {
  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setDate(periodEnd.getDate() + TIER_CONFIGS[tier].periodDays)

  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    status: 'active',
    currentPeriodStart: Timestamp.fromDate(now),
    currentPeriodEnd: Timestamp.fromDate(periodEnd),
    lastPaymentAt: Timestamp.fromDate(now),
    // Reset token counters for new period
    'tokenUsage.totalTokens': 0,
    'tokenUsage.inputTokens': 0,
    'tokenUsage.outputTokens': 0,
    'tokenUsage.cacheReadTokens': 0,
    'tokenUsage.periodResetAt': Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  })

  logger.info(`[Subscription] Renewed ${tier} subscription for user ${userId}`)
}

// ============================================================================
// TOKEN METERING — Atomic Consumption Tracking
// ============================================================================

/**
 * Record token consumption for an interaction.
 *
 * Uses Firestore FieldValue.increment() for atomic updates,
 * avoiding read-then-write race conditions in concurrent requests.
 *
 * This is the HOT PATH — called on every AI interaction.
 * Pattern adapted from Claude Code's cost-tracker.ts addToTotalSessionCost().
 */
export async function recordTokenConsumption(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
): Promise<void> {
  const totalTokens = inputTokens + outputTokens + cacheReadTokens

  const docRef = getSubscriptionDocRef(userId)
  await docRef.update({
    'tokenUsage.totalTokens': FieldValue.increment(totalTokens),
    'tokenUsage.inputTokens': FieldValue.increment(inputTokens),
    'tokenUsage.outputTokens': FieldValue.increment(outputTokens),
    'tokenUsage.cacheReadTokens': FieldValue.increment(cacheReadTokens),
    'tokenUsage.lastInteractionTokens': totalTokens,
    updatedAt: Timestamp.fromDate(new Date()),
  })
}

// ============================================================================
// TRIAL EXPIRATION CHECK
// ============================================================================

/**
 * Check and update trial expiration status.
 *
 * Called during subscription guard evaluation for freemium users.
 * If the trial has expired, updates the status to 'trial_expired'.
 *
 * Returns true if the trial is still active, false if expired.
 */
export async function checkAndUpdateTrialStatus(
  userId: string,
  subscription: UserSubscription,
): Promise<boolean> {
  if (subscription.tier !== 'freemium' || subscription.status !== 'trialing') {
    return subscription.status === 'active'
  }

  const now = new Date()
  if (now > subscription.trialExpiresAt) {
    // Trial expired — update status
    const docRef = getSubscriptionDocRef(userId)
    await docRef.update({
      status: 'trial_expired',
      updatedAt: Timestamp.fromDate(now),
    })

    logger.info(`[Subscription] Trial expired for user ${userId}`)
    return false
  }

  return true
}

// ============================================================================
// FIRESTORE SERIALIZATION HELPERS
// ============================================================================

/**
 * Convert Date fields to Firestore Timestamps for writing.
 */
function serializeForFirestore(sub: UserSubscription): Record<string, unknown> {
  return {
    ...sub,
    registeredAt: Timestamp.fromDate(sub.registeredAt),
    trialExpiresAt: Timestamp.fromDate(sub.trialExpiresAt),
    currentPeriodStart: Timestamp.fromDate(sub.currentPeriodStart),
    currentPeriodEnd: Timestamp.fromDate(sub.currentPeriodEnd),
    lastPaymentAt: sub.lastPaymentAt ? Timestamp.fromDate(sub.lastPaymentAt) : null,
    createdAt: Timestamp.fromDate(sub.createdAt),
    updatedAt: Timestamp.fromDate(sub.updatedAt),
    tokenUsage: {
      ...sub.tokenUsage,
      periodResetAt: Timestamp.fromDate(sub.tokenUsage.periodResetAt),
    },
  }
}

/**
 * Revive Firestore Timestamps back to Date objects on read.
 */
function reviveTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  const dateFields = [
    'registeredAt', 'trialExpiresAt', 'currentPeriodStart',
    'currentPeriodEnd', 'lastPaymentAt', 'createdAt', 'updatedAt',
  ]
  for (const field of dateFields) {
    const val = result[field]
    if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: unknown }).toDate === 'function') {
      result[field] = (val as { toDate: () => Date }).toDate()
    }
  }
  // Revive nested tokenUsage.periodResetAt
  const tokenUsage = result['tokenUsage'] as Record<string, unknown> | undefined
  if (tokenUsage?.periodResetAt && typeof tokenUsage.periodResetAt === 'object' &&
    'toDate' in (tokenUsage.periodResetAt as object) &&
    typeof (tokenUsage.periodResetAt as { toDate: unknown }).toDate === 'function') {
    tokenUsage.periodResetAt = (tokenUsage.periodResetAt as { toDate: () => Date }).toDate()
  }

  return result
}
