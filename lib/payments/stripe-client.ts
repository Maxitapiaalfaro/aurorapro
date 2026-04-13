import 'server-only'

/**
 * Stripe Client — Aurora Pro
 *
 * Server-side Stripe SDK singleton.
 * NEVER import this on the client — use NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY instead.
 *
 * Required env vars:
 * - STRIPE_SECRET_KEY: Stripe secret API key (server only)
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret
 *
 * @module lib/payments/stripe-client
 */

import Stripe from 'stripe'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function env(name: string): string | undefined {
  return process.env[name] || undefined
}

function requireEnv(name: string): string {
  const value = env(name)
  if (!value) {
    throw new Error(
      `[Stripe] Missing required environment variable: ${name}. ` +
      `Set it in your .env.local or Vercel dashboard.`
    )
  }
  return value
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null

/**
 * Returns the server-side Stripe instance.
 * Safe to call multiple times — returns the singleton.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const secretKey = requireEnv('STRIPE_SECRET_KEY')

  _stripe = new Stripe(secretKey, {
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
    appInfo: {
      name: 'Aurora Pro',
      version: '1.0.0',
      url: 'https://aurorapro.cl',
    },
  })

  return _stripe
}

/**
 * Returns the webhook signing secret.
 * Used by the webhook route to verify Stripe signatures.
 */
export function getWebhookSecret(): string {
  return requireEnv('STRIPE_WEBHOOK_SECRET')
}

/**
 * Verify a Stripe webhook signature and construct the event.
 * Throws if verification fails.
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe()
  const secret = getWebhookSecret()
  return stripe.webhooks.constructEvent(payload, signature, secret)
}
