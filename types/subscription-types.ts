/**
 * Subscription Types — Aurora SaaS Membership Architecture
 *
 * Defines the complete type system for Aurora's subscription model:
 * - Tier definitions (Freemium, Pro, Max)
 * - Token metering types
 * - RBAC agent-access types
 * - Payment/billing types
 *
 * Based on reverse-engineering of Claude Code's billing architecture
 * (docs/architecture/claude/claude-code-main) adapted for Aurora's
 * clinical psychology SaaS model with CLP pricing.
 *
 * @module types/subscription-types
 */

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

/**
 * Aurora subscription tiers.
 *
 * - `freemium`  → Trial access (7 days from registration)
 * - `pro`       → CLP $20.000/mes — 3M tokens, full agent access
 * - `max`       → CLP $50.000/mes — 8M tokens, full access + feature flags
 */
export type SubscriptionTier = 'freemium' | 'pro' | 'max'

/**
 * Status of the user's subscription lifecycle.
 */
export type SubscriptionStatus =
  | 'active'          // Subscription is current and paid
  | 'trialing'        // Within freemium 7-day window
  | 'trial_expired'   // Freemium period ended, no paid plan selected
  | 'past_due'        // Payment failed, grace period active
  | 'canceled'        // User canceled, access until period end
  | 'expired'         // Subscription period ended without renewal

// ============================================================================
// FIRESTORE SCHEMA — Subscription Document
// ============================================================================

/**
 * Firestore document: `psychologists/{uid}/subscription/current`
 *
 * Single document per user that holds the full subscription state.
 * Uses a subcollection path under the psychologist document for
 * consistency with the existing data model.
 */
export interface UserSubscription {
  /** The user's current tier */
  tier: SubscriptionTier

  /** Lifecycle status of the subscription */
  status: SubscriptionStatus

  /** When the user first registered (used to calculate freemium expiry) */
  registeredAt: Date

  /** Freemium trial expiration (registeredAt + 7 days) */
  trialExpiresAt: Date

  /**
   * Current billing period end date.
   * For freemium: same as trialExpiresAt.
   * For paid: end of current monthly cycle.
   */
  currentPeriodEnd: Date

  /**
   * Current billing period start date.
   * For freemium: registeredAt.
   * For paid: start of current monthly cycle.
   */
  currentPeriodStart: Date

  /** Stripe customer ID (null for freemium users) */
  stripeCustomerId: string | null

  /** Stripe subscription ID (null for freemium users) */
  stripeSubscriptionId: string | null

  /** Last successful payment date */
  lastPaymentAt: Date | null

  /** Token consumption for the current billing period */
  tokenUsage: TokenUsage

  /** Feature flags enabled for this user (Max tier gets experimental features) */
  featureFlags: string[]

  /** Metadata timestamps */
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// TOKEN METERING
// ============================================================================

/**
 * Token consumption tracking for the current billing period.
 *
 * Stored as a nested object within UserSubscription for atomic
 * reads (single Firestore read to get both tier + usage).
 *
 * Pattern adapted from Claude Code's cost-tracker.ts:
 * - Per-model breakdown for cost attribution
 * - Separate input/output tracking for accurate billing
 */
export interface TokenUsage {
  /** Total tokens consumed this period (input + output) */
  totalTokens: number

  /** Maximum tokens allowed for the current tier */
  tokenLimit: number

  /** Input tokens consumed (user messages + context) */
  inputTokens: number

  /** Output tokens consumed (model responses) */
  outputTokens: number

  /** Cache read tokens (cheaper, tracked separately for cost accuracy) */
  cacheReadTokens: number

  /** When this period's counter was last reset */
  periodResetAt: Date

  /** Per-interaction log for the last 24h (for debugging/auditing) */
  lastInteractionTokens?: number
}

// ============================================================================
// TIER CONFIGURATION — Static tier metadata
// ============================================================================

/**
 * Static configuration for each tier. Used by the subscription guard
 * and paywall logic. Not stored in Firestore — defined as constants.
 */
export interface TierConfig {
  tier: SubscriptionTier
  displayName: string
  /** Monthly price in CLP (Chilean Pesos). 0 for freemium. */
  priceCLP: number
  /** Monthly price in USD (for Stripe, approximate) */
  priceUSD: number
  /** Maximum tokens per billing period */
  tokenLimit: number
  /** Duration in days (7 for freemium trial, 30 for paid) */
  periodDays: number
  /** Which agents are accessible */
  allowedAgents: AgentAccessLevel
  /** Which tools are accessible */
  allowedTools: ToolAccessLevel
  /** Whether feature flags for experimental features are enabled */
  experimentalFeatures: boolean
  /** Stripe Price ID for this tier (null for freemium) */
  stripePriceId: string | null
}

// ============================================================================
// RBAC — Agent & Tool Access Control
// ============================================================================

/**
 * Agent access levels by tier.
 *
 * Adapted from Claude Code's billing.ts pattern where `subscriptionType`
 * gates access to different model tiers (opus, sonnet).
 *
 * For Aurora, agent types map to clinical functionality levels:
 * - base: Socratic agent only (general clinical assistant)
 * - full: All agents (socratico, clinico, academico, orquestador)
 */
export type AgentAccessLevel = 'base' | 'full'

/**
 * Tool access levels by tier.
 *
 * - basic: Core tools only (no external searches, no document generation)
 * - standard: All currently registered tools
 * - premium: All tools + experimental/beta tools (feature-flagged)
 */
export type ToolAccessLevel = 'basic' | 'standard' | 'premium'

/**
 * Maps agent types to the minimum tier required to use them.
 */
export interface AgentPermission {
  agentType: string
  requiredTier: SubscriptionTier
  description: string
}

/**
 * Maps tool names to the minimum tier required to use them.
 */
export interface ToolPermission {
  toolName: string
  requiredTier: SubscriptionTier
  description: string
}

// ============================================================================
// SUBSCRIPTION GUARD — Evaluation Result
// ============================================================================

/**
 * Result of evaluating whether a user can perform an action.
 * Returned by the subscription guard middleware.
 */
export type SubscriptionGuardResult =
  | SubscriptionAllowed
  | SubscriptionBlocked

export interface SubscriptionAllowed {
  allowed: true
  tier: SubscriptionTier
  /** Percentage of token quota used (0–100) */
  tokenUtilization: number
  /** Warning if approaching limit (>= 80%) */
  warning?: string
}

export interface SubscriptionBlocked {
  allowed: false
  /** Reason the action was blocked */
  reason: BlockReason
  /** Human-readable message to display to the user */
  message: string
  /** Which tier the user should upgrade to */
  suggestedTier?: SubscriptionTier
  /** URL to redirect user to for upgrade */
  upgradeUrl?: string
}

export type BlockReason =
  | 'trial_expired'       // Freemium period ended
  | 'token_limit_reached' // Monthly token quota exceeded
  | 'agent_not_allowed'   // Agent requires higher tier
  | 'tool_not_allowed'    // Tool requires higher tier
  | 'subscription_expired' // Paid subscription expired
  | 'payment_failed'      // Payment past due

// ============================================================================
// PAYMENT / BILLING TYPES
// ============================================================================

/**
 * Stripe webhook events relevant to subscription management.
 */
export type StripeWebhookEvent =
  | 'checkout.session.completed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'

/**
 * Paywall trigger context — sent to the client when access is blocked.
 */
export interface PaywallTrigger {
  /** What triggered the paywall */
  trigger: 'token_limit' | 'trial_expired' | 'agent_blocked' | 'tool_blocked'
  /** Current tier */
  currentTier: SubscriptionTier
  /** Recommended upgrade tier */
  suggestedTier: SubscriptionTier
  /** Current usage percentage (0–100) */
  usagePercent: number
  /** User-facing message in Spanish */
  message: string
}

/**
 * Token usage warning thresholds.
 * Adapted from Claude Code's rateLimitMessages.ts pattern.
 */
export interface UsageThreshold {
  /** Percentage threshold (0–100) */
  percent: number
  /** Severity level */
  severity: 'info' | 'warning' | 'error'
  /** Message to show to the user */
  message: string
}
