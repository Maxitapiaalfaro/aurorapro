import 'server-only'

/**
 * POST /api/payments/create-checkout
 *
 * Creates a Stripe Checkout Session for the Reverse Trial or direct subscription.
 * Requires Firebase authentication.
 *
 * Request body:
 * - tier: 'pro' | 'max' (required)
 * - interval: 'month' | 'year' (default: 'month')
 * - successUrl: string (optional, defaults to /dashboard?checkout=success)
 * - cancelUrl: string (optional, defaults to /pricing?checkout=canceled)
 *
 * Response:
 * - { checkoutUrl: string } on success
 * - { error: string } on failure
 */

import { NextResponse } from 'next/server'
import { verifyFirebaseAuth } from '@/lib/security/firebase-auth-verify'
import { getStripe } from '@/lib/payments/stripe-client'
import { getStripePriceId, getCountryFromRequest } from '@/lib/payments/pricing-engine'
import { getSubscription } from '@/lib/subscriptions/subscription-guard'
import { updateSubscription } from '@/lib/subscriptions/subscription-service'
import { TRIAL_CONFIG } from '@/lib/subscriptions/tier-config'
import type { SubscriptionTier } from '@/lib/subscriptions/types'

export async function POST(request: Request) {
  // 1. Authenticate
  const auth = await verifyFirebaseAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  // 2. Parse request
  let body: {
    tier?: string
    interval?: string
    successUrl?: string
    cancelUrl?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const tier = body.tier as Exclude<SubscriptionTier, 'free'> | undefined
  if (!tier || !['pro', 'max'].includes(tier)) {
    return NextResponse.json(
      { error: 'Invalid tier. Must be "pro" or "max".' },
      { status: 400 }
    )
  }

  const interval = (body.interval as 'month' | 'year') || 'month'
  if (!['month', 'year'].includes(interval)) {
    return NextResponse.json(
      { error: 'Invalid interval. Must be "month" or "year".' },
      { status: 400 }
    )
  }

  // 3. Build URLs with origin validation
  const origin = request.headers.get('origin') || request.headers.get('referer') || ''
  const baseUrl = origin || 'https://aurorapro.cl'
  const successUrl = body.successUrl || `${baseUrl}/dashboard?checkout=success`
  const cancelUrl = body.cancelUrl || `${baseUrl}/pricing?checkout=canceled`

  try {
    const stripe = getStripe()
    const uid = auth.uid
    const countryCode = getCountryFromRequest(request)

    // 4. Get or create Stripe customer
    const sub = await getSubscription(uid)
    let customerId = sub.externalCustomerId

    if (!customerId) {
      // Fetch user email from Firebase Auth token claims
      const customer = await stripe.customers.create({
        metadata: {
          firebaseUid: uid,
        },
      })
      customerId = customer.id

      await updateSubscription(uid, {
        externalCustomerId: customerId,
        paymentProvider: 'stripe',
      })
    }

    // 5. Get regional price
    const priceId = getStripePriceId(tier, interval, countryCode)

    // 6. Determine if this should be a trial
    const isNewUser = !sub.externalSubscriptionId && sub.status !== 'active'
    const trialDays = isNewUser ? TRIAL_CONFIG.durationDays : undefined

    // 7. Create Checkout Session
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
        ...(trialDays ? { trial_period_days: trialDays } : {}),
        metadata: {
          firebaseUid: uid,
          tier,
        },
      },
      metadata: {
        firebaseUid: uid,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    })

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ checkoutUrl: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Checkout] Error creating session:', message)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
