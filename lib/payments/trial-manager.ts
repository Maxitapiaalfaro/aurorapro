import 'server-only'

/**
 * Trial Manager — Aurora Pro
 *
 * Manages the Reverse Trial lifecycle:
 * - Start 14-day trial with Pro access
 * - Check trial status and days remaining
 * - Handle trial expiry (downgrade to free)
 * - Support trial extension (admin win-back)
 *
 * @module lib/payments/trial-manager
 */

import { getStripe } from './stripe-client'
import { getStripePriceId, getCountryFromRequest } from './pricing-engine'
import {
  startTrial,
  updateSubscription,
  downgradeToFree,
} from '@/lib/subscriptions/subscription-service'
import { getSubscription } from '@/lib/subscriptions/subscription-guard'
import { TRIAL_CONFIG } from '@/lib/subscriptions/tier-config'
import type { SubscriptionRecord } from '@/lib/subscriptions/types'

// ---------------------------------------------------------------------------
// Start Reverse Trial
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout Session for the Reverse Trial.
 *
 * Flow:
 * 1. Creates a Stripe customer (or reuses existing)
 * 2. Creates a Checkout Session with a 14-day trial
 * 3. User enters payment method → Stripe creates subscription in 'trialing' status
 * 4. Webhook handler (subscription-sync.ts) writes to Firestore
 *
 * @param uid - Firebase UID of the psychologist
 * @param email - User's email for Stripe customer creation
 * @param request - The incoming request (for geo detection)
 * @param successUrl - Redirect URL after successful checkout
 * @param cancelUrl - Redirect URL if user cancels checkout
 */
export async function createTrialCheckoutSession(
  uid: string,
  email: string,
  request: Request,
  successUrl: string,
  cancelUrl: string
): Promise<{ checkoutUrl: string }> {
  const stripe = getStripe()
  const countryCode = getCountryFromRequest(request)

  // Get or create Stripe customer
  const sub = await getSubscription(uid)
  let customerId = sub.externalCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        firebaseUid: uid,
      },
    })
    customerId = customer.id

    // Save customer ID to Firestore immediately
    await updateSubscription(uid, {
      externalCustomerId: customerId,
      paymentProvider: 'stripe',
    })
  }

  // Get the regional price for Pro tier (default to monthly)
  const priceId = getStripePriceId('pro', 'month', countryCode)

  // Create Checkout Session with trial
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: TRIAL_CONFIG.durationDays,
      metadata: {
        firebaseUid: uid,
        tier: 'pro',
      },
    },
    metadata: {
      firebaseUid: uid,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Allow promotion codes for win-back campaigns
    allow_promotion_codes: true,
  })

  if (!session.url) {
    throw new Error('Stripe Checkout Session created without a URL')
  }

  return { checkoutUrl: session.url }
}

// ---------------------------------------------------------------------------
// Trial Status
// ---------------------------------------------------------------------------

export interface TrialStatus {
  isTrialing: boolean
  daysRemaining: number | null
  trialEndDate: string | null
  /** Whether the trial has expired (past end date) */
  isExpired: boolean
}

/**
 * Check the user's trial status.
 */
export async function checkTrialStatus(uid: string): Promise<TrialStatus> {
  const sub = await getSubscription(uid)

  if (sub.status !== 'trialing' || !sub.trialEndDate) {
    return {
      isTrialing: false,
      daysRemaining: null,
      trialEndDate: null,
      isExpired: false,
    }
  }

  const endDate = new Date(sub.trialEndDate)
  const now = new Date()
  const diffMs = endDate.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  const isExpired = diffMs <= 0

  return {
    isTrialing: true,
    daysRemaining,
    trialEndDate: sub.trialEndDate,
    isExpired,
  }
}

// ---------------------------------------------------------------------------
// Trial Expiry (called by webhook when trial ends)
// ---------------------------------------------------------------------------

/**
 * Handle trial expiry.
 * If the user hasn't converted (no active subscription), downgrade to free.
 * This is called by the webhook handler when Stripe sends `customer.subscription.updated`
 * with `status: 'active'` (converted) or `customer.subscription.deleted` (not converted).
 */
export async function handleTrialExpiry(uid: string): Promise<void> {
  const sub = await getSubscription(uid)

  // If already active (converted during trial), do nothing
  if (sub.status === 'active') return

  // Downgrade to free tier — preserves all patient data
  await downgradeToFree(uid)
}

// ---------------------------------------------------------------------------
// Trial Extension (admin/win-back action)
// ---------------------------------------------------------------------------

/**
 * Extend a user's trial by additional days.
 * Used for win-back campaigns or customer support.
 */
export async function extendTrial(uid: string, additionalDays: number): Promise<void> {
  const sub = await getSubscription(uid)

  if (!sub.trialEndDate) {
    // Start a new trial if none exists
    await startTrial(uid)
    return
  }

  const currentEnd = new Date(sub.trialEndDate)
  const now = new Date()
  // Extend from current end date or from now, whichever is later
  const extensionBase = currentEnd > now ? currentEnd : now
  const newEnd = new Date(extensionBase)
  newEnd.setDate(newEnd.getDate() + additionalDays)

  await updateSubscription(uid, {
    status: 'trialing',
    tier: TRIAL_CONFIG.trialTier,
    trialEndDate: newEnd.toISOString(),
  })

  // Also extend on Stripe side if there's an active subscription
  if (sub.externalSubscriptionId) {
    const stripe = getStripe()
    await stripe.subscriptions.update(sub.externalSubscriptionId, {
      trial_end: Math.floor(newEnd.getTime() / 1000),
    })
  }
}

// ---------------------------------------------------------------------------
// Skip Trial (enter free tier directly)
// ---------------------------------------------------------------------------

/**
 * User chose to skip the trial and go straight to free tier.
 * No payment method collected.
 */
export async function skipTrial(uid: string): Promise<void> {
  await downgradeToFree(uid)
}
