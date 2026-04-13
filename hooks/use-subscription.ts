'use client'

/**
 * useSubscription Hook — Aurora Pro
 *
 * Real-time subscription status for client components.
 * Reads from Firestore directly (offline-capable) with API fallback.
 *
 * Provides:
 * - Current tier and effective tier
 * - Token usage and warnings
 * - Trial status and days remaining
 * - Feature limits for the current tier
 * - Helper functions: canUseAgent(), canUseTool(), isFeatureAvailable()
 *
 * @module hooks/use-subscription
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase-config'
import { useAuth } from '@/providers/auth-provider'
import type { SubscriptionTier, SubscriptionStatus, TokenWarningLevel } from '@/lib/subscriptions/types'
import {
  AGENT_PERMISSIONS,
  TOOL_PERMISSIONS,
  TIER_LIMITS,
  TOKEN_BUDGETS,
  TRIAL_TOKEN_BUDGET,
  TIER_RANK,
  getEffectiveTier,
  type TierLimits,
} from '@/lib/subscriptions/tier-config'
import type { AgentId, ToolId } from '@/lib/subscriptions/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionState {
  /** Raw tier from Firestore */
  tier: SubscriptionTier
  /** Effective tier (accounts for status — paused/canceled → free) */
  effectiveTier: SubscriptionTier
  /** Current subscription status */
  status: SubscriptionStatus
  /** Monthly token budget */
  tokenBudget: number
  /** Tokens consumed this month */
  tokensUsed: number
  /** Remaining tokens */
  tokensRemaining: number
  /** Usage as percentage (0-100) */
  usagePercent: number
  /** Current warning level */
  warningLevel: TokenWarningLevel
  /** Days remaining in trial (null if not trialing) */
  trialDaysRemaining: number | null
  /** Feature limits for effective tier */
  limits: TierLimits
  /** Whether subscription data has loaded */
  isLoaded: boolean
  /** Whether there was an error loading subscription */
  error: string | null
}

const DEFAULT_STATE: SubscriptionState = {
  tier: 'free',
  effectiveTier: 'free',
  status: 'downgraded',
  tokenBudget: TOKEN_BUDGETS.free,
  tokensUsed: 0,
  tokensRemaining: TOKEN_BUDGETS.free,
  usagePercent: 0,
  warningLevel: 'none',
  trialDaysRemaining: null,
  limits: TIER_LIMITS.free,
  isLoaded: false,
  error: null,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSubscription() {
  const { user, psychologistId } = useAuth()
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE)

  // Subscribe to Firestore subscription document
  useEffect(() => {
    if (!psychologistId) {
      setState({ ...DEFAULT_STATE, isLoaded: true })
      return
    }

    const docRef = doc(db, 'psychologists', psychologistId, 'subscription', 'current')

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          // No subscription doc — user is on free tier
          setState({ ...DEFAULT_STATE, isLoaded: true })
          return
        }

        const data = snap.data()
        const tier = (data.tier as SubscriptionTier) || 'free'
        const status = (data.status as SubscriptionStatus) || 'downgraded'
        const effectiveTier = getEffectiveTier(tier, status)

        const budget =
          status === 'trialing' ? TRIAL_TOKEN_BUDGET : TOKEN_BUDGETS[effectiveTier]
        const used = (data.tokensUsedThisMonth as number) || 0
        const remaining = Math.max(0, budget - used)
        const usagePercent = budget > 0 ? Math.round((used / budget) * 100) : 100

        // Calculate trial days remaining
        let trialDaysRemaining: number | null = null
        if (status === 'trialing' && data.trialEndDate) {
          const endDate = new Date(data.trialEndDate as string)
          const now = new Date()
          const diffMs = endDate.getTime() - now.getTime()
          trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
        }

        // Resolve warning level
        let warningLevel: TokenWarningLevel = 'none'
        if (usagePercent >= 100) warningLevel = '100'
        else if (usagePercent >= 95) warningLevel = '95'
        else if (usagePercent >= 85) warningLevel = '85'
        else if (usagePercent >= 70) warningLevel = '70'

        setState({
          tier,
          effectiveTier,
          status,
          tokenBudget: budget,
          tokensUsed: used,
          tokensRemaining: remaining,
          usagePercent: Math.min(usagePercent, 100),
          warningLevel,
          trialDaysRemaining,
          limits: TIER_LIMITS[effectiveTier],
          isLoaded: true,
          error: null,
        })
      },
      (error) => {
        console.error('[useSubscription] Firestore listener error:', error.message)
        setState((prev) => ({
          ...prev,
          isLoaded: true,
          error: error.message,
        }))
      }
    )

    return () => unsubscribe()
  }, [psychologistId])

  // ---------------------------------------------------------------------------
  // Helper functions
  // ---------------------------------------------------------------------------

  /** Check if user can access a specific agent */
  const canUseAgent = useCallback(
    (agentId: AgentId): boolean => {
      const requiredTier = AGENT_PERMISSIONS[agentId]
      if (!requiredTier) return false
      return TIER_RANK[state.effectiveTier] >= TIER_RANK[requiredTier]
    },
    [state.effectiveTier]
  )

  /** Check if user can use a specific tool */
  const canUseTool = useCallback(
    (toolId: ToolId): boolean => {
      const requiredTier = TOOL_PERMISSIONS[toolId]
      if (!requiredTier) return false
      return TIER_RANK[state.effectiveTier] >= TIER_RANK[requiredTier]
    },
    [state.effectiveTier]
  )

  /** Check a named feature limit */
  const isFeatureAvailable = useCallback(
    (feature: keyof TierLimits): boolean => {
      const value = state.limits[feature]
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return value > 0
      return value !== null
    },
    [state.limits]
  )

  /** Whether the user is on a paid/trial plan (not free) */
  const isPremium = useMemo(
    () => state.effectiveTier !== 'free',
    [state.effectiveTier]
  )

  /** Whether the user is currently in a trial */
  const isTrialing = useMemo(
    () => state.status === 'trialing',
    [state.status]
  )

  /** Whether tokens are critically low (>= 85%) */
  const isTokenCritical = useMemo(
    () => state.usagePercent >= 85,
    [state.usagePercent]
  )

  return {
    ...state,
    canUseAgent,
    canUseTool,
    isFeatureAvailable,
    isPremium,
    isTrialing,
    isTokenCritical,
  }
}
