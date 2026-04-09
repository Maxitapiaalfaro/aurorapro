/**
 * Subscriptions Module — Public API
 *
 * Re-exports all subscription-related functions and types
 * for clean imports throughout the application.
 *
 * Usage:
 *   import { evaluateAccess, recordTokenConsumption, TIER_CONFIGS } from '@/lib/subscriptions'
 *
 * @module lib/subscriptions
 */

// Guard functions (server-only — used in API routes)
export {
  evaluateAccess,
  evaluateAgentAccess,
  evaluateToolAccess,
  evaluateFeatureAccess,
  generatePaywallTrigger,
} from './subscription-guard'

// Subscription lifecycle (server-only — used in API routes & webhooks)
export {
  getUserSubscription,
  getSubscriptionTierAndStatus,
  createFreemiumSubscription,
  upgradeSubscription,
  cancelSubscription,
  expireSubscription,
  markPaymentFailed,
  renewSubscription,
  recordTokenConsumption,
  checkAndUpdateTrialStatus,
} from './subscription-service'

// Tier configuration (shared — safe for client import)
export {
  TIER_CONFIGS,
  AGENT_PERMISSIONS,
  TOOL_PERMISSIONS,
  USAGE_THRESHOLDS,
  isAgentAllowedForTier,
  isToolAllowedForTier,
  getUsageWarning,
  getSuggestedUpgradeTier,
  getTierConfig,
  calculateTrialExpiry,
} from './tier-config'
