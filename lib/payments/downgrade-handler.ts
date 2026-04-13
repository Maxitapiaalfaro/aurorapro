import 'server-only'

/**
 * Downgrade Handler — Aurora Pro
 *
 * Handles the downgrade flow when a user's subscription is canceled,
 * trial expires, or payment fails permanently.
 *
 * CRITICAL HIPAA CONSTRAINT: Patient data is NEVER deleted on downgrade.
 * Users retain read-only access to all clinical data on the free tier.
 *
 * @module lib/payments/downgrade-handler
 */

import {
  updateSubscription,
  downgradeToFree,
} from '@/lib/subscriptions/subscription-service'
import { getSubscription } from '@/lib/subscriptions/subscription-guard'
import { TOKEN_BUDGETS, TIER_DISPLAY } from '@/lib/subscriptions/tier-config'
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/subscriptions/types'

// ---------------------------------------------------------------------------
// Downgrade Execution
// ---------------------------------------------------------------------------

export interface DowngradeResult {
  success: boolean
  previousTier: SubscriptionTier
  newTier: SubscriptionTier
  reason: string
  /** Features the user loses */
  lostFeatures: string[]
  /** Features the user keeps */
  retainedFeatures: string[]
}

/**
 * Execute a downgrade from any paid tier to free.
 *
 * What changes:
 * - Tier → free
 * - Status → downgraded
 * - Token budget → 1M (free tier)
 * - Agent access → base only
 * - Tool access → read-only only
 * - Patient limit → 5 active patients
 *
 * What is preserved:
 * - ALL patient data (records, sessions, memories, documents)
 * - ALL session history
 * - ALL clinical memories
 * - Account and authentication
 */
export async function executeDowngrade(
  uid: string,
  reason: 'trial_expired' | 'subscription_canceled' | 'payment_failed' | 'user_requested'
): Promise<DowngradeResult> {
  const sub = await getSubscription(uid)
  const previousTier = sub.tier

  // Perform the downgrade
  await downgradeToFree(uid)

  return {
    success: true,
    previousTier,
    newTier: 'free',
    reason: DOWNGRADE_REASONS[reason],
    lostFeatures: getLostFeatures(previousTier),
    retainedFeatures: RETAINED_FEATURES,
  }
}

// ---------------------------------------------------------------------------
// Pause Handling
// ---------------------------------------------------------------------------

/**
 * Pause a subscription (user-initiated, max 3 months).
 * Paused users lose premium access but retain all data.
 * They can resume at any time.
 */
export async function pauseSubscription(uid: string): Promise<void> {
  const sub = await getSubscription(uid)

  if (sub.status !== 'active') {
    throw new Error(`Cannot pause subscription with status: ${sub.status}`)
  }

  const pauseUntil = new Date()
  pauseUntil.setMonth(pauseUntil.getMonth() + 3) // Max 3-month pause

  await updateSubscription(uid, {
    status: 'paused',
    tokenBudget: TOKEN_BUDGETS.free, // Reduce budget during pause
  })
}

/**
 * Resume a paused subscription.
 */
export async function resumeSubscription(uid: string): Promise<void> {
  const sub = await getSubscription(uid)

  if (sub.status !== 'paused') {
    throw new Error(`Cannot resume subscription with status: ${sub.status}`)
  }

  await updateSubscription(uid, {
    status: 'active',
    tokenBudget: TOKEN_BUDGETS[sub.tier],
    tokensUsedThisMonth: 0, // Reset on resume
    warningsSent: [],
  })
}

// ---------------------------------------------------------------------------
// Past Due Handling
// ---------------------------------------------------------------------------

/**
 * Handle payment failure.
 * Sets status to past_due — user keeps access while Stripe retries.
 * After all retries fail (typically 3 attempts over ~2 weeks), execute hard downgrade.
 */
export async function handlePaymentFailed(uid: string): Promise<void> {
  await updateSubscription(uid, {
    status: 'past_due',
  })
}

/**
 * Handle final payment failure after all retries.
 * This triggers a hard downgrade to free tier.
 */
export async function handlePaymentFailedFinal(uid: string): Promise<DowngradeResult> {
  return executeDowngrade(uid, 'payment_failed')
}

// ---------------------------------------------------------------------------
// Feature Diff for UI
// ---------------------------------------------------------------------------

const DOWNGRADE_REASONS: Record<string, string> = {
  trial_expired: 'Your 14-day Pro trial has ended.',
  subscription_canceled: 'Your subscription has been canceled.',
  payment_failed: 'We were unable to process your payment after multiple attempts.',
  user_requested: 'You requested to downgrade your plan.',
}

function getLostFeatures(previousTier: SubscriptionTier): string[] {
  if (previousTier === 'free') return []

  const lost: string[] = [
    'Clinical agent (advanced therapeutic analysis)',
    'Academic agent (research and literature search)',
    'Clinical memory write access',
    'Document generation (fichas)',
    'Voice transcription',
    'Data export',
    'Unlimited patients (limited to 5 on free tier)',
    'MCP tool access',
  ]

  if (previousTier === 'max') {
    lost.push('Experimental features and agents')
  }

  return lost
}

const RETAINED_FEATURES: string[] = [
  'All patient records and session history (read-only)',
  'All clinical memories (read-only)',
  'All uploaded documents (read-only)',
  'Base agent (Socrático)',
  'Patient context exploration',
  'Up to 5 active patients',
  `${TOKEN_BUDGETS.free.toLocaleString()} tokens/month`,
]
