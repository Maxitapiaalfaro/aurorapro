import 'server-only'

/**
 * GET /api/payments/status
 *
 * Returns the current subscription status for the authenticated user.
 * Used by the `useSubscription` hook on the client.
 *
 * Response: SubscriptionStatusInfo object
 */

import { NextResponse } from 'next/server'
import { verifyFirebaseAuth } from '@/lib/security/firebase-auth-verify'
import { getSubscriptionStatus } from '@/lib/subscriptions/subscription-guard'

export async function GET(request: Request) {
  const auth = await verifyFirebaseAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const status = await getSubscriptionStatus(auth.uid)
    return NextResponse.json(status)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[SubscriptionStatus] Error:', message)
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    )
  }
}
