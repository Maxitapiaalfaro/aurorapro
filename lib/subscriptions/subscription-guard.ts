import 'server-only'

/**
 * Subscription Guard — Pre-execution Access Control for Agent Router
 *
 * Evaluates the user's subscription tier, token consumption, and
 * feature access BEFORE allowing any agentic step to execute.
 *
 * This is the central enforcement point — every API route that
 * triggers AI processing MUST call evaluateAccess() before proceeding.
 *
 * Flow (adapted from Claude Code's billing.ts + rateLimitMessages.ts):
 *
 *   1. Load subscription state from Firestore
 *   2. Check subscription status (active, trialing, expired, etc.)
 *   3. Check freemium trial expiration
 *   4. Validate agent access (RBAC by tier)
 *   5. Validate tool access (RBAC by tier)
 *   6. Check token quota utilization
 *   7. Return allowed/blocked result with appropriate messaging
 *
 * @module lib/subscriptions/subscription-guard
 */

import {
  getUserSubscription,
  createFreemiumSubscription,
  checkAndUpdateTrialStatus,
} from './subscription-service'
import {
  TIER_CONFIGS,
  isAgentAllowedForTier,
  isToolAllowedForTier,
  getUsageWarning,
  getSuggestedUpgradeTier,
  AGENT_PERMISSIONS,
  TOOL_PERMISSIONS,
} from './tier-config'
import type {
  SubscriptionTier,
  SubscriptionGuardResult,
  SubscriptionAllowed,
  SubscriptionBlocked,
  PaywallTrigger,
  UserSubscription,
} from '@/types/subscription-types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('subscription')

// ============================================================================
// MAIN GUARD FUNCTION
// ============================================================================

/**
 * Evaluate whether a user can perform an AI interaction.
 *
 * This is the PRIMARY guard — called before every send-message request.
 * Checks: subscription status → trial expiry → token quota.
 *
 * @param userId - Firebase Auth UID
 * @param estimatedTokens - Estimated tokens for this request (optional pre-check)
 * @returns SubscriptionGuardResult indicating allowed/blocked
 */
export async function evaluateAccess(
  userId: string,
  estimatedTokens: number = 0,
): Promise<SubscriptionGuardResult> {
  try {
    // 1. Load or create subscription
    let subscription = await getUserSubscription(userId)
    if (!subscription) {
      // First-time user — auto-provision freemium trial
      logger.info(`[Guard] Auto-provisioning freemium for new user ${userId}`)
      subscription = await createFreemiumSubscription(userId)
    }

    // 2. Check subscription status
    const statusResult = checkSubscriptionStatus(subscription)
    if (statusResult) return statusResult

    // 3. Check freemium trial expiration
    if (subscription.tier === 'freemium' && subscription.status === 'trialing') {
      const trialActive = await checkAndUpdateTrialStatus(userId, subscription)
      if (!trialActive) {
        return createBlocked(
          'trial_expired',
          'Tu período de prueba gratuito de 7 días ha expirado. Actualiza a un plan Pro o Max para seguir usando Aurora.',
          'pro',
        )
      }
    }

    // 4. Check token quota
    const { tokenUsage } = subscription
    const currentUtilization = (tokenUsage.totalTokens / tokenUsage.tokenLimit) * 100

    // Pre-check: would this request exceed the limit?
    if (estimatedTokens > 0) {
      const projectedTotal = tokenUsage.totalTokens + estimatedTokens
      if (projectedTotal > tokenUsage.tokenLimit) {
        const suggestedTier = getSuggestedUpgradeTier(subscription.tier)
        return createBlocked(
          'token_limit_reached',
          `Esta consulta excedería tu límite de tokens (${formatTokenCount(tokenUsage.tokenLimit)}). ` +
          (suggestedTier
            ? `Actualiza a ${TIER_CONFIGS[suggestedTier].displayName} para obtener ${formatTokenCount(TIER_CONFIGS[suggestedTier].tokenLimit)} tokens mensuales.`
            : 'Has alcanzado el máximo disponible.'),
          suggestedTier ?? undefined,
        )
      }
    }

    // Hard limit check
    if (tokenUsage.totalTokens >= tokenUsage.tokenLimit) {
      const suggestedTier = getSuggestedUpgradeTier(subscription.tier)
      return createBlocked(
        'token_limit_reached',
        `Has alcanzado el límite de ${formatTokenCount(tokenUsage.tokenLimit)} tokens de tu plan ${TIER_CONFIGS[subscription.tier].displayName}. ` +
        (suggestedTier
          ? `Actualiza a ${TIER_CONFIGS[suggestedTier].displayName} para continuar.`
          : 'Espera al próximo período de facturación.'),
        suggestedTier ?? undefined,
      )
    }

    // 5. Return allowed with usage warning if approaching limit
    const warning = getUsageWarning(currentUtilization)
    const result: SubscriptionAllowed = {
      allowed: true,
      tier: subscription.tier,
      tokenUtilization: Math.round(currentUtilization),
      ...(warning ? { warning: warning.message } : {}),
    }

    return result
  } catch (error) {
    // Fail open in case of Firestore errors to not block users
    logger.error(`[Guard] Error evaluating access for ${userId}:`, error)
    return {
      allowed: true,
      tier: 'freemium',
      tokenUtilization: 0,
      warning: 'No se pudo verificar tu suscripción. Acceso temporal concedido.',
    }
  }
}

// ============================================================================
// AGENT-LEVEL GUARD
// ============================================================================

/**
 * Check if a specific agent is allowed for the user's tier.
 *
 * Called by the agent router before selecting/executing an agent.
 * Freemium users are restricted to the 'socratico' base agent.
 */
export async function evaluateAgentAccess(
  userId: string,
  agentType: string,
): Promise<SubscriptionGuardResult> {
  try {
    let subscription = await getUserSubscription(userId)
    if (!subscription) {
      subscription = await createFreemiumSubscription(userId)
    }

    // Check status first
    const statusResult = checkSubscriptionStatus(subscription)
    if (statusResult) return statusResult

    // Check agent permission
    if (!isAgentAllowedForTier(agentType, subscription.tier)) {
      const permission = AGENT_PERMISSIONS.find(p => p.agentType === agentType)
      const requiredTier = permission?.requiredTier ?? 'pro'
      return createBlocked(
        'agent_not_allowed',
        `El agente "${agentType}" requiere un plan ${TIER_CONFIGS[requiredTier].displayName} o superior. ` +
        `Tu plan actual es ${TIER_CONFIGS[subscription.tier].displayName}.`,
        requiredTier === 'freemium' ? 'pro' : requiredTier,
      )
    }

    const currentUtilization = (subscription.tokenUsage.totalTokens / subscription.tokenUsage.tokenLimit) * 100
    return {
      allowed: true,
      tier: subscription.tier,
      tokenUtilization: Math.round(currentUtilization),
    }
  } catch (error) {
    logger.error(`[Guard] Error evaluating agent access for ${userId}/${agentType}:`, error)
    return { allowed: true, tier: 'freemium', tokenUtilization: 0 }
  }
}

// ============================================================================
// TOOL-LEVEL GUARD
// ============================================================================

/**
 * Check if a specific tool is allowed for the user's tier.
 *
 * Called by the streaming handler before executing a tool call.
 * Freemium users are restricted to read-only tools.
 */
export async function evaluateToolAccess(
  userId: string,
  toolName: string,
): Promise<SubscriptionGuardResult> {
  try {
    let subscription = await getUserSubscription(userId)
    if (!subscription) {
      subscription = await createFreemiumSubscription(userId)
    }

    // Check status first
    const statusResult = checkSubscriptionStatus(subscription)
    if (statusResult) return statusResult

    // Check tool permission
    if (!isToolAllowedForTier(toolName, subscription.tier)) {
      const permission = TOOL_PERMISSIONS.find(p => p.toolName === toolName)
      const requiredTier = permission?.requiredTier ?? 'pro'
      return createBlocked(
        'tool_not_allowed',
        `La herramienta "${toolName}" requiere un plan ${TIER_CONFIGS[requiredTier].displayName} o superior. ` +
        `Tu plan actual es ${TIER_CONFIGS[subscription.tier].displayName}.`,
        requiredTier === 'freemium' ? 'pro' : requiredTier,
      )
    }

    const currentUtilization = (subscription.tokenUsage.totalTokens / subscription.tokenUsage.tokenLimit) * 100
    return {
      allowed: true,
      tier: subscription.tier,
      tokenUtilization: Math.round(currentUtilization),
    }
  } catch (error) {
    logger.error(`[Guard] Error evaluating tool access for ${userId}/${toolName}:`, error)
    return { allowed: true, tier: 'freemium', tokenUtilization: 0 }
  }
}

// ============================================================================
// FEATURE FLAG GUARD
// ============================================================================

/**
 * Check if a user has access to a specific feature flag.
 * Only Max tier users get experimental feature access.
 */
export async function evaluateFeatureAccess(
  userId: string,
  featureFlag: string,
): Promise<boolean> {
  try {
    const subscription = await getUserSubscription(userId)
    if (!subscription) return false

    return subscription.featureFlags.includes(featureFlag) ||
           subscription.featureFlags.includes('experimental_features')
  } catch {
    return false
  }
}

// ============================================================================
// PAYWALL TRIGGER GENERATION
// ============================================================================

/**
 * Generate a paywall trigger for the client.
 * Called when access is blocked, to provide the client with
 * context for displaying the appropriate upgrade UI.
 */
export function generatePaywallTrigger(
  guardResult: SubscriptionBlocked,
  currentTier: SubscriptionTier,
): PaywallTrigger {
  const suggestedTier = guardResult.suggestedTier ?? getSuggestedUpgradeTier(currentTier) ?? 'pro'

  const triggerMap: Record<string, PaywallTrigger['trigger']> = {
    token_limit_reached: 'token_limit',
    trial_expired: 'trial_expired',
    agent_not_allowed: 'agent_blocked',
    tool_not_allowed: 'tool_blocked',
    subscription_expired: 'trial_expired',
    payment_failed: 'trial_expired',
  }

  return {
    trigger: triggerMap[guardResult.reason] ?? 'trial_expired',
    currentTier,
    suggestedTier,
    usagePercent: 100,
    message: guardResult.message,
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Check if the subscription status allows access.
 * Returns a blocked result if the status is not active/trialing,
 * or null if access should continue to further checks.
 */
function checkSubscriptionStatus(
  subscription: UserSubscription,
): SubscriptionBlocked | null {
  switch (subscription.status) {
    case 'active':
    case 'trialing':
      // Check if paid subscription period has ended
      if (subscription.status === 'active' && new Date() > subscription.currentPeriodEnd) {
        return createBlocked(
          'subscription_expired',
          'Tu suscripción ha expirado. Renueva tu plan para continuar usando Aurora.',
          subscription.tier === 'max' ? 'max' : 'pro',
        )
      }
      return null // Continue to further checks

    case 'trial_expired':
      return createBlocked(
        'trial_expired',
        'Tu período de prueba ha expirado. Elige un plan Pro o Max para seguir usando Aurora.',
        'pro',
      )

    case 'past_due':
      return createBlocked(
        'payment_failed',
        'Tu último pago no fue procesado. Actualiza tu método de pago para restaurar el acceso.',
        subscription.tier,
      )

    case 'canceled':
      // Allow access until period end
      if (new Date() <= subscription.currentPeriodEnd) {
        return null
      }
      return createBlocked(
        'subscription_expired',
        'Tu suscripción cancelada ha llegado a su fecha de fin. Reactiva tu plan para continuar.',
        'pro',
      )

    case 'expired':
      return createBlocked(
        'subscription_expired',
        'Tu suscripción ha expirado. Elige un plan para volver a usar Aurora.',
        'pro',
      )

    default:
      return null
  }
}

/**
 * Helper to create a blocked result.
 */
function createBlocked(
  reason: SubscriptionBlocked['reason'],
  message: string,
  suggestedTier?: SubscriptionTier,
): SubscriptionBlocked {
  return {
    allowed: false,
    reason,
    message,
    suggestedTier,
    upgradeUrl: '/settings/billing',
  }
}

/**
 * Format token count for display (e.g., 3000000 → "3M").
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1)}K`
  }
  return tokens.toString()
}
