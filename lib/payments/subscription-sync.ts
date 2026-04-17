import 'server-only'

/**
 * Subscription Sync — Aurora Pro
 *
 * Maps Stripe webhook events to Firestore subscription state.
 * This is the single point of truth for converting Stripe objects
 * into Aurora's internal SubscriptionRecord format.
 *
 * Called exclusively by the webhook API route.
 *
 * @module lib/payments/subscription-sync
 */

import type Stripe from 'stripe'
import { updateSubscription } from '@/lib/subscriptions/subscription-service'
import { TOKEN_BUDGETS, TRIAL_TOKEN_BUDGET } from '@/lib/subscriptions/tier-config'
import type { SubscriptionTier, SubscriptionStatus } from '@/lib/subscriptions/types'
import { executeDowngrade, handlePaymentFailed } from './downgrade-handler'

// ---------------------------------------------------------------------------
// Stripe → Aurora Mapping
// ---------------------------------------------------------------------------

/**
 * Map a Stripe subscription status to Aurora's internal status.
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'unpaid':
      return 'canceled'
    case 'incomplete':
    case 'incomplete_expired':
      return 'downgraded'
    default:
      return 'downgraded'
  }
}

/**
 * Resolve the Aurora tier from Stripe subscription metadata or price ID.
 * The tier is stored in subscription metadata during checkout.
 */
function resolveAuroraTier(subscription: Stripe.Subscription): SubscriptionTier {
  // Check metadata first (most reliable)
  const metaTier = subscription.metadata?.tier as SubscriptionTier | undefined
  if (metaTier && ['free', 'starter', 'pro', 'max', 'clinic'].includes(metaTier)) {
    return metaTier
  }

  // Fallback: infer from price ID naming convention
  const priceId = subscription.items?.data?.[0]?.price?.id || ''
  if (priceId.includes('clinic'))  return 'clinic'
  if (priceId.includes('max'))     return 'max'
  if (priceId.includes('starter')) return 'starter'
  if (priceId.includes('pro'))     return 'pro'

  return 'pro' // Default to pro for paid subscriptions
}

/**
 * Extract Firebase UID from Stripe subscription or customer metadata.
 */
export function extractFirebaseUid(
  subscription: Stripe.Subscription,
  customer?: Stripe.Customer
): string | null {
  // Check subscription metadata
  const subUid = subscription.metadata?.firebaseUid
  if (subUid) return subUid

  // Check customer metadata
  if (customer && 'metadata' in customer) {
    const custUid = customer.metadata?.firebaseUid
    if (custUid) return custUid
  }

  return null
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * Sync a Stripe subscription object to Firestore.
 * Called on checkout.session.completed, customer.subscription.updated, etc.
 */
export async function syncSubscriptionToFirestore(
  uid: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const tier = resolveAuroraTier(subscription)
  const status = mapStripeStatus(subscription.status)
  const isTrialing = subscription.status === 'trialing'

  const tokenBudget = isTrialing
    ? TRIAL_TOKEN_BUDGET
    : TOKEN_BUDGETS[tier] || TOKEN_BUDGETS.free

  await updateSubscription(uid, {
    tier,
    status,
    externalSubscriptionId: subscription.id,
    externalCustomerId:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id || null,
    paymentProvider: 'stripe',
    priceId: subscription.items?.data?.[0]?.price?.id || null,
    currency: subscription.currency || null,
    tokenBudget,

    // Trial dates
    trialStartDate: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trialEndDate: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,

    // Billing period: derived from start_date + latest_invoice or items
    currentPeriodStart: subscription.start_date
      ? new Date(subscription.start_date * 1000).toISOString()
      : null,
    currentPeriodEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  })
}

/**
 * Handle checkout.session.completed event.
 * This fires when the user completes the Stripe Checkout form.
 */
export async function handleCheckoutCompleted(
  uid: string,
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription
): Promise<void> {
  // Sync the subscription state
  await syncSubscriptionToFirestore(uid, subscription)
}

/**
 * Handle customer.subscription.updated event.
 * Fires on tier changes, trial end, payment method updates, etc.
 */
export async function handleSubscriptionUpdated(
  uid: string,
  subscription: Stripe.Subscription
): Promise<void> {
  await syncSubscriptionToFirestore(uid, subscription)
}

/**
 * Handle customer.subscription.deleted event.
 * Fires when subscription is fully canceled (not just canceled at period end).
 */
export async function handleSubscriptionDeleted(uid: string): Promise<void> {
  await executeDowngrade(uid, 'subscription_canceled')
}

/**
 * Handle invoice.payment_failed event.
 */
export async function handleInvoicePaymentFailed(uid: string): Promise<void> {
  await handlePaymentFailed(uid)
}

/**
 * Handle invoice.paid event — confirms active status.
 */
export async function handleInvoicePaid(
  uid: string,
  subscription: Stripe.Subscription
): Promise<void> {
  // Re-sync to ensure status is 'active' after successful payment
  await syncSubscriptionToFirestore(uid, subscription)
}
