import 'server-only'

/**
 * POST /api/payments/portal
 *
 * Creates a Stripe Customer Portal session for self-service billing management.
 * The portal allows users to:
 * - Update payment method
 * - View invoices
 * - Cancel or pause subscription
 * - Upgrade/downgrade tier
 *
 * Requires Firebase authentication.
 *
 * Request body:
 * - returnUrl: string (optional, defaults to /settings/billing)
 *
 * Response:
 * - { portalUrl: string } on success
 */

import { NextResponse } from 'next/server'
import { verifyFirebaseAuth } from '@/lib/security/firebase-auth-verify'
import { getStripe } from '@/lib/payments/stripe-client'
import { getSubscription } from '@/lib/subscriptions/subscription-guard'

export async function POST(request: Request) {
  // 1. Authenticate
  const auth = await verifyFirebaseAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  // 2. Get Stripe customer ID
  const sub = await getSubscription(auth.uid)
  if (!sub.externalCustomerId) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe first.' },
      { status: 404 }
    )
  }

  // 3. Parse optional return URL
  let returnUrl: string
  try {
    const body = await request.json()
    const origin = request.headers.get('origin') || request.headers.get('referer') || 'https://aurorapro.cl'
    returnUrl = body.returnUrl || `${origin}/settings/billing`
  } catch {
    const origin = request.headers.get('origin') || 'https://aurorapro.cl'
    returnUrl = `${origin}/settings/billing`
  }

  try {
    const stripe = getStripe()

    // 4. Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.externalCustomerId,
      return_url: returnUrl,
    })

    return NextResponse.json({ portalUrl: portalSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Portal] Error creating session:', message)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
