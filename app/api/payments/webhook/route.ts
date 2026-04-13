/**
 * POST /api/payments/webhook
 *
 * Stripe webhook handler. Receives events from Stripe and syncs subscription
 * state to Firestore.
 *
 * SECURITY:
 * - Does NOT require Firebase auth (Stripe calls this endpoint directly)
 * - Verifies Stripe webhook signature for authenticity
 * - Uses event ID for idempotency
 *
 * Required env vars:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 */

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { constructWebhookEvent, getStripe } from '@/lib/payments/stripe-client'
import {
  extractFirebaseUid,
  syncSubscriptionToFirestore,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaid,
} from '@/lib/payments/subscription-sync'

// ---------------------------------------------------------------------------
// Idempotency: Track processed event IDs (in-memory, resets on cold start)
// For production, consider using Firestore or Redis for persistent dedup.
// ---------------------------------------------------------------------------

const processedEvents = new Set<string>()
const MAX_PROCESSED_EVENTS = 10_000

function markEventProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) return false // Already processed
  if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
    // Evict oldest entries (rough LRU — Set preserves insertion order)
    const iterator = processedEvents.values()
    for (let i = 0; i < 1000; i++) {
      const entry = iterator.next()
      if (entry.done) break
      processedEvents.delete(entry.value)
    }
  }
  processedEvents.add(eventId)
  return true // New event
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Firebase UID from various Stripe event objects.
 */
async function resolveUid(event: Stripe.Event): Promise<string | null> {
  const stripe = getStripe()
  const data = event.data.object as unknown as Record<string, unknown>

  // Check metadata directly on the object
  const metadata = data.metadata as Record<string, string> | undefined
  if (metadata?.firebaseUid) return metadata.firebaseUid

  // For subscription events, check subscription metadata
  if ('subscription' in data && data.subscription) {
    const subId = typeof data.subscription === 'string'
      ? data.subscription
      : (data.subscription as { id: string }).id

    try {
      const subscription = await stripe.subscriptions.retrieve(subId)
      const uid = extractFirebaseUid(subscription)
      if (uid) return uid

      // Check customer metadata
      if (subscription.customer) {
        const customerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id
        const customer = await stripe.customers.retrieve(customerId)
        if ('metadata' in customer && customer.metadata?.firebaseUid) {
          return customer.metadata.firebaseUid
        }
      }
    } catch {
      // Subscription lookup failed — try customer directly
    }
  }

  // For invoice events, check customer
  if ('customer' in data && data.customer) {
    const customerId = typeof data.customer === 'string'
      ? data.customer
      : (data.customer as { id: string }).id

    try {
      const customer = await stripe.customers.retrieve(customerId)
      if ('metadata' in customer && customer.metadata?.firebaseUid) {
        return customer.metadata.firebaseUid
      }
    } catch {
      // Customer lookup failed
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. Read raw body for signature verification
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  // 2. Verify webhook signature
  let event: Stripe.Event
  try {
    event = constructWebhookEvent(rawBody, signature)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signature verification failed'
    console.error('[Webhook] Signature verification failed:', message)
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    )
  }

  // 3. Idempotency check
  if (!markEventProcessed(event.id)) {
    // Already processed — return 200 to prevent Stripe retries
    return NextResponse.json({ received: true, duplicate: true })
  }

  // 4. Resolve Firebase UID
  const uid = await resolveUid(event)
  if (!uid) {
    console.warn(`[Webhook] Could not resolve Firebase UID for event ${event.type} (${event.id})`)
    // Return 200 — don't let Stripe retry events we can't map
    return NextResponse.json({ received: true, unmapped: true })
  }

  // 5. Handle event
  try {
    const stripe = getStripe()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
          const subscription = await stripe.subscriptions.retrieve(subId)
          await handleCheckoutCompleted(uid, session, subscription)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(uid, subscription)
        break
      }

      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(uid)
        break
      }

      case 'customer.subscription.trial_will_end': {
        // Notification event — could trigger email
        // For now, just log it. Email sending is Phase 7.
        console.info(`[Webhook] Trial ending soon for user ${uid}`)
        break
      }

      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription
        await syncSubscriptionToFirestore(uid, subscription)
        break
      }

      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription
        await syncSubscriptionToFirestore(uid, subscription)
        break
      }

      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(uid)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const subDetails = invoice.parent?.subscription_details
        if (subDetails?.subscription) {
          const subId = typeof subDetails.subscription === 'string'
            ? subDetails.subscription
            : subDetails.subscription.id
          const subscription = await stripe.subscriptions.retrieve(subId)
          await handleInvoicePaid(uid, subscription)
        }
        break
      }

      default:
        // Unhandled event type — acknowledge to prevent retries
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Webhook] Error handling ${event.type}:`, message)
    // Return 500 so Stripe retries
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
