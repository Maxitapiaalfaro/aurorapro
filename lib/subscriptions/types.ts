/**
 * Subscription System Types — Aurora Pro
 *
 * Core type definitions for the subscription, billing, and token metering system.
 * These types are shared between server (Firestore/Stripe) and client (hooks/components).
 *
 * @module lib/subscriptions/types
 */

// ---------------------------------------------------------------------------
// Tier & Status Enums
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'max' | 'clinic'

export type SubscriptionStatus =
  | 'trialing'    // 14-day Reverse Trial (full Pro access)
  | 'active'      // Paying customer
  | 'past_due'    // Payment failed, retrying
  | 'paused'      // User-initiated pause (max 3 months)
  | 'canceled'    // Subscription canceled (grace period)
  | 'downgraded'  // Trial/cancellation completed → free tier

export type TokenWarningLevel = 'none' | '70' | '85' | '95' | '100'

// ---------------------------------------------------------------------------
// Agent & Tool Identifiers
// ---------------------------------------------------------------------------

export type AgentId = 'socratico' | 'clinico' | 'academico' | 'experimental'

export type ToolId =
  | 'explore_patient_context'
  | 'get_patient_record'
  | 'list_patients'
  | 'save_clinical_memory'
  | 'get_clinical_memories'
  | 'search_academic'
  | 'generate_ficha'
  | 'upload_document'
  | 'pattern_analysis'
  | 'session_summary'
  | 'experimental_tools'

// ---------------------------------------------------------------------------
// Subscription Record (Firestore: psychologists/{uid}/subscription/current)
// ---------------------------------------------------------------------------

export interface SubscriptionRecord {
  /** Current subscription tier */
  tier: SubscriptionTier
  /** Current lifecycle status */
  status: SubscriptionStatus

  // Trial fields
  /** When the Reverse Trial started (null if skipped payment) */
  trialStartDate: string | null
  /** When the trial ends (trialStart + 14 days) */
  trialEndDate: string | null

  // Billing cycle
  /** Start of current billing period */
  currentPeriodStart: string | null
  /** End of current billing period */
  currentPeriodEnd: string | null

  // External payment provider IDs
  /** Stripe/Paddle customer ID */
  externalCustomerId: string | null
  /** Stripe/Paddle subscription ID */
  externalSubscriptionId: string | null
  /** Which payment provider is active */
  paymentProvider: 'stripe' | 'paddle' | null
  /** Currency code (lowercase ISO 4217) */
  currency: string | null
  /** External price ID for current tier */
  priceId: string | null

  // Token metering
  /** Monthly token budget for this tier */
  tokenBudget: number
  /** Tokens consumed this billing month */
  tokensUsedThisMonth: number
  /** When the monthly token counter resets */
  tokenResetDate: string | null
  /** Which warning thresholds have been triggered (dedup) */
  warningsSent: TokenWarningLevel[]

  // Metadata
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Token Consumption Event
// ---------------------------------------------------------------------------

export interface TokenConsumption {
  promptTokens: number
  responseTokens: number
  totalTokens: number
  timestamp: string
  sessionId: string
  agentType: AgentId | string
  /** Tokens served from Gemini implicit/explicit context cache */
  cachedContentTokens?: number
  /** Ratio of cached tokens to total prompt tokens (0-1) */
  cacheHitRatio?: number
}

// ---------------------------------------------------------------------------
// Access Evaluation Results
// ---------------------------------------------------------------------------

export interface AccessResult {
  allowed: boolean
  reason?: string
  /** Which tier is required for this resource */
  requiredTier?: SubscriptionTier
  /** The user's current tier */
  currentTier?: SubscriptionTier
}

export interface TokenBudgetResult {
  allowed: boolean
  reason?: string
  /** Remaining tokens in this billing period */
  remaining: number
  /** Current usage as percentage (0-100) */
  usagePercent: number
  /** Current warning level */
  warningLevel: TokenWarningLevel
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface RegionalPrice {
  /** Stripe price ID */
  priceId: string
  /** Display amount (in minor units for the currency) */
  amount: number
  /** ISO 4217 currency code */
  currency: string
  /** Human-readable label e.g. "$20/mo" */
  displayPrice: string
  /** Billing interval */
  interval: 'month' | 'year'
}

export interface PricingTier {
  tier: SubscriptionTier
  name: string
  description: string
  features: string[]
  monthlyPrice: RegionalPrice
  yearlyPrice: RegionalPrice
  tokenBudget: number
  /** Estimated messages per month at ~5.5K tokens/message */
  estimatedMessages: number
}

// ---------------------------------------------------------------------------
// Webhook Events (internal, after Stripe → Aurora mapping)
// ---------------------------------------------------------------------------

export interface SubscriptionEvent {
  type:
    | 'subscription.created'
    | 'subscription.updated'
    | 'subscription.canceled'
    | 'subscription.paused'
    | 'subscription.resumed'
    | 'trial.will_end'
    | 'payment.succeeded'
    | 'payment.failed'
  /** Firebase UID of the psychologist */
  uid: string
  /** Raw Stripe/Paddle event ID for idempotency */
  externalEventId: string
  /** Mapped subscription data */
  data: Partial<SubscriptionRecord>
  timestamp: string
}
