import 'server-only'

/**
 * Stripe Webhook Handler — Payment Event Processing
 *
 * Processes Stripe webhook events to update subscription state.
 * This follows Claude Code's pattern where the backend is the single
 * source of truth for subscription state — the client never modifies it.
 *
 * Webhook Events Handled:
 * - checkout.session.completed → Create/upgrade subscription
 * - invoice.payment_succeeded → Renew billing period
 * - invoice.payment_failed → Mark as past_due
 * - customer.subscription.deleted → Cancel subscription
 * - customer.subscription.updated → Handle tier changes
 *
 * Setup:
 * 1. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in env vars
 * 2. Register webhook endpoint: POST /api/webhooks/stripe
 * 3. Subscribe to events listed above in Stripe Dashboard
 *
 * @module lib/subscriptions/stripe-webhook-handler
 */

import {
  upgradeSubscription,
  cancelSubscription,
  markPaymentFailed,
  renewSubscription,
} from './subscription-service'
import type { SubscriptionTier } from '@/types/subscription-types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('subscription')

// ============================================================================
// TYPES
// ============================================================================

/**
 * Minimal Stripe event shape — avoids depending on the full Stripe SDK
 * at compile time. The actual Stripe SDK should be used for signature
 * verification in the API route.
 */
export interface StripeEvent {
  id: string
  type: string
  data: {
    object: Record<string, unknown>
  }
}

/**
 * Maps Stripe Price IDs to Aurora tiers.
 * Configure via environment variables.
 */
function getPriceToTierMap(): Record<string, SubscriptionTier> {
  const map: Record<string, SubscriptionTier> = {}

  const proPriceId = process.env['STRIPE_PRICE_PRO']
  const maxPriceId = process.env['STRIPE_PRICE_MAX']

  if (proPriceId) map[proPriceId] = 'pro'
  if (maxPriceId) map[maxPriceId] = 'max'

  return map
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process a verified Stripe webhook event.
 *
 * IMPORTANT: The caller (API route) is responsible for:
 * 1. Verifying the webhook signature using stripe.webhooks.constructEvent()
 * 2. Passing the verified event to this handler
 *
 * @param event - Verified Stripe event
 */
export async function handleStripeWebhook(event: StripeEvent): Promise<void> {
  const { type, data } = event
  const obj = data.object

  logger.info(`[Stripe] Processing webhook: ${type} (${event.id})`)

  switch (type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(obj)
      break

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(obj)
      break

    case 'invoice.payment_failed':
      await handlePaymentFailed(obj)
      break

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(obj)
      break

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(obj)
      break

    default:
      logger.info(`[Stripe] Unhandled event type: ${type}`)
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle checkout.session.completed — new subscription created.
 *
 * Flow:
 * 1. Extract userId from metadata (set during checkout session creation)
 * 2. Map Stripe Price ID → Aurora tier
 * 3. Create/upgrade subscription in Firestore
 */
async function handleCheckoutComplete(obj: Record<string, unknown>): Promise<void> {
  const metadata = obj['metadata'] as Record<string, string> | undefined
  const userId = metadata?.['userId'] || metadata?.['firebase_uid']
  const customerId = obj['customer'] as string | undefined
  const subscriptionId = obj['subscription'] as string | undefined

  if (!userId || !customerId || !subscriptionId) {
    logger.error('[Stripe] checkout.session.completed missing required fields', {
      hasUserId: !!userId,
      hasCustomerId: !!customerId,
      hasSubscriptionId: !!subscriptionId,
    })
    return
  }

  // Resolve tier from the line items or metadata
  const tier = resolveTierFromCheckout(obj)
  if (!tier) {
    logger.error('[Stripe] Could not resolve tier from checkout session')
    return
  }

  await upgradeSubscription(userId, tier, customerId, subscriptionId)
  logger.info(`[Stripe] Checkout complete: user ${userId} → ${tier}`)
}

/**
 * Handle invoice.payment_succeeded — renewal payment processed.
 */
async function handlePaymentSucceeded(obj: Record<string, unknown>): Promise<void> {
  const customerId = obj['customer'] as string | undefined
  const subscriptionId = obj['subscription'] as string | undefined

  if (!customerId || !subscriptionId) {
    logger.warn('[Stripe] invoice.payment_succeeded missing customer/subscription')
    return
  }

  // Resolve userId and tier from subscription metadata
  const { userId, tier } = await resolveUserFromSubscription(obj)
  if (!userId || !tier) {
    logger.error('[Stripe] Could not resolve user/tier for payment succeeded', { customerId })
    return
  }

  await renewSubscription(userId, tier)
  logger.info(`[Stripe] Payment succeeded: user ${userId}, tier ${tier}`)
}

/**
 * Handle invoice.payment_failed — payment declined.
 */
async function handlePaymentFailed(obj: Record<string, unknown>): Promise<void> {
  const { userId } = await resolveUserFromSubscription(obj)
  if (!userId) {
    logger.error('[Stripe] Could not resolve user for payment failed')
    return
  }

  await markPaymentFailed(userId)
  logger.warn(`[Stripe] Payment failed: user ${userId}`)
}

/**
 * Handle customer.subscription.deleted — subscription canceled at Stripe.
 */
async function handleSubscriptionDeleted(obj: Record<string, unknown>): Promise<void> {
  const { userId } = await resolveUserFromSubscription(obj)
  if (!userId) {
    logger.error('[Stripe] Could not resolve user for subscription deleted')
    return
  }

  await cancelSubscription(userId)
  logger.info(`[Stripe] Subscription deleted: user ${userId}`)
}

/**
 * Handle customer.subscription.updated — tier change or status change.
 */
async function handleSubscriptionUpdated(obj: Record<string, unknown>): Promise<void> {
  const status = obj['status'] as string | undefined
  const { userId, tier } = await resolveUserFromSubscription(obj)

  if (!userId) {
    logger.error('[Stripe] Could not resolve user for subscription updated')
    return
  }

  // If subscription was canceled at period end
  if (status === 'canceled') {
    await cancelSubscription(userId)
    return
  }

  // If tier changed (upgrade/downgrade), handle at next renewal
  if (tier) {
    logger.info(`[Stripe] Subscription updated: user ${userId}, new tier: ${tier}`)
  }
}

// ============================================================================
// RESOLUTION HELPERS
// ============================================================================

/**
 * Resolve the Aurora tier from a checkout session object.
 */
function resolveTierFromCheckout(obj: Record<string, unknown>): 'pro' | 'max' | null {
  // Check metadata first (most reliable)
  const metadata = obj['metadata'] as Record<string, string> | undefined
  if (metadata?.['tier']) {
    const tier = metadata['tier']
    if (tier === 'pro' || tier === 'max') return tier
  }

  // Fall back to price ID mapping
  const priceToTier = getPriceToTierMap()

  // Check line_items if available
  const lineItems = obj['line_items'] as { data?: Array<{ price?: { id: string } }> } | undefined
  if (lineItems?.data) {
    for (const item of lineItems.data) {
      const priceId = item.price?.id
      if (priceId && priceToTier[priceId]) {
        return priceToTier[priceId] as 'pro' | 'max'
      }
    }
  }

  return null
}

/**
 * Resolve userId and tier from a subscription/invoice object.
 *
 * NOTE: In production, this should look up the Firestore subscription
 * document by stripeCustomerId or stripeSubscriptionId.
 * For now, it extracts from metadata.
 */
async function resolveUserFromSubscription(
  obj: Record<string, unknown>,
): Promise<{ userId: string | null; tier: 'pro' | 'max' | null }> {
  const metadata = obj['metadata'] as Record<string, string> | undefined
  const userId = metadata?.['userId'] || metadata?.['firebase_uid'] || null

  let tier: 'pro' | 'max' | null = null
  if (metadata?.['tier'] === 'pro' || metadata?.['tier'] === 'max') {
    tier = metadata['tier']
  }

  // Fall back to price-based resolution
  if (!tier) {
    const priceToTier = getPriceToTierMap()
    const items = obj['items'] as { data?: Array<{ price?: { id: string } }> } | undefined
    if (items?.data) {
      for (const item of items.data) {
        const priceId = item.price?.id
        if (priceId && priceToTier[priceId]) {
          tier = priceToTier[priceId] as 'pro' | 'max'
          break
        }
      }
    }
  }

  return { userId, tier }
}
