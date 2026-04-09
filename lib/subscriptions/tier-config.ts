/**
 * Tier Configuration — Static Aurora Subscription Tier Definitions
 *
 * Defines the immutable configuration for each subscription tier.
 * This is the single source of truth for tier limits, pricing,
 * and access control rules.
 *
 * Pattern: Claude Code uses billingType + subscriptionType enums
 * with static lookup. Aurora follows the same pattern with TierConfig.
 *
 * @module lib/subscriptions/tier-config
 */

import type {
  SubscriptionTier,
  TierConfig,
  AgentPermission,
  ToolPermission,
  UsageThreshold,
} from '@/types/subscription-types'
import type { AgentType } from '@/types/clinical-types'

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

/**
 * Static tier configuration.
 * Prices in CLP. Token limits per 30-day billing cycle.
 *
 * NOTE: priceUSD values are approximate and used only for reference.
 * Stripe handles actual CLP→USD conversion at checkout time using
 * real-time exchange rates. The CLP price is the authoritative price.
 *
 * NOTE: stripePriceId values should be set from environment variables
 * in production. The placeholders here are for development only.
 */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  freemium: {
    tier: 'freemium',
    displayName: 'Freemium (Trial)',
    priceCLP: 0,
    priceUSD: 0,
    tokenLimit: 500_000,     // 500K tokens during 7-day trial
    periodDays: 7,
    allowedAgents: 'base',
    allowedTools: 'basic',
    experimentalFeatures: false,
    stripePriceId: null,
  },
  pro: {
    tier: 'pro',
    displayName: 'Pro',
    priceCLP: 20_000,
    priceUSD: 20,            // ~20 USD approximate
    tokenLimit: 3_000_000,   // 3M tokens/month
    periodDays: 30,
    allowedAgents: 'full',
    allowedTools: 'standard',
    experimentalFeatures: false,
    stripePriceId: process.env['STRIPE_PRICE_PRO'] ?? null,
  },
  max: {
    tier: 'max',
    displayName: 'Max',
    priceCLP: 50_000,
    priceUSD: 50,            // ~50 USD approximate
    tokenLimit: 8_000_000,   // 8M tokens/month
    periodDays: 30,
    allowedAgents: 'full',
    allowedTools: 'premium',
    experimentalFeatures: true,
    stripePriceId: process.env['STRIPE_PRICE_MAX'] ?? null,
  },
}

// ============================================================================
// AGENT ACCESS CONTROL
// ============================================================================

/**
 * Agent-level RBAC definitions.
 *
 * Freemium users can only access the base Socratic agent.
 * Pro and Max users can access all agents.
 */
export const AGENT_PERMISSIONS: AgentPermission[] = [
  {
    agentType: 'socratico',
    requiredTier: 'freemium',
    description: 'Agente base socrático — disponible en todos los planes',
  },
  {
    agentType: 'clinico',
    requiredTier: 'pro',
    description: 'Agente clínico especializado — requiere plan Pro o superior',
  },
  {
    agentType: 'academico',
    requiredTier: 'pro',
    description: 'Agente académico de investigación — requiere plan Pro o superior',
  },
  {
    agentType: 'orquestador',
    requiredTier: 'pro',
    description: 'Agente orquestador multi-agente — requiere plan Pro o superior',
  },
]

/**
 * Check if a given agent is allowed for a specific tier.
 */
export function isAgentAllowedForTier(
  agentType: AgentType | string,
  tier: SubscriptionTier,
): boolean {
  const permission = AGENT_PERMISSIONS.find(p => p.agentType === agentType)
  if (!permission) return false

  const tierHierarchy: Record<SubscriptionTier, number> = {
    freemium: 0,
    pro: 1,
    max: 2,
  }

  return tierHierarchy[tier] >= tierHierarchy[permission.requiredTier]
}

// ============================================================================
// TOOL ACCESS CONTROL
// ============================================================================

/**
 * Tool-level permissions.
 *
 * Freemium: Only read-only tools (get_patient_memories, get_patient_record, list_patients)
 * Pro: All standard tools
 * Max: All tools including experimental/beta
 */
export const TOOL_PERMISSIONS: ToolPermission[] = [
  // === Freemium tools (basic) ===
  { toolName: 'get_patient_memories', requiredTier: 'freemium', description: 'Lectura de memorias del paciente' },
  { toolName: 'get_patient_record', requiredTier: 'freemium', description: 'Lectura de ficha del paciente' },
  { toolName: 'list_patients', requiredTier: 'freemium', description: 'Listado de pacientes' },

  // === Pro tools (standard) ===
  { toolName: 'save_clinical_memory', requiredTier: 'pro', description: 'Guardar memorias clínicas' },
  { toolName: 'create_patient', requiredTier: 'pro', description: 'Crear pacientes' },
  { toolName: 'search_academic_literature', requiredTier: 'pro', description: 'Búsqueda académica' },
  { toolName: 'google_search', requiredTier: 'pro', description: 'Búsqueda web' },
  { toolName: 'explore_patient_context', requiredTier: 'pro', description: 'Exploración de contexto del paciente' },
  { toolName: 'generate_clinical_document', requiredTier: 'pro', description: 'Generación de documentos clínicos' },
  { toolName: 'update_clinical_document', requiredTier: 'pro', description: 'Edición de documentos clínicos' },
  { toolName: 'get_session_documents', requiredTier: 'pro', description: 'Lectura de documentos de sesión' },
  { toolName: 'research_evidence', requiredTier: 'pro', description: 'Investigación de evidencia' },
  { toolName: 'analyze_longitudinal_patterns', requiredTier: 'pro', description: 'Análisis longitudinal de patrones' },
]

/**
 * Check if a given tool is allowed for a specific tier.
 */
export function isToolAllowedForTier(
  toolName: string,
  tier: SubscriptionTier,
): boolean {
  const permission = TOOL_PERMISSIONS.find(p => p.toolName === toolName)
  // If tool is not in the permission list, default to requiring Pro
  if (!permission) {
    return tier === 'pro' || tier === 'max'
  }

  const tierHierarchy: Record<SubscriptionTier, number> = {
    freemium: 0,
    pro: 1,
    max: 2,
  }

  return tierHierarchy[tier] >= tierHierarchy[permission.requiredTier]
}

// ============================================================================
// USAGE THRESHOLDS — Warning Messages
// ============================================================================

/**
 * Token usage warning thresholds.
 * Adapted from Claude Code's rateLimitMessages.ts graduated warning system.
 */
export const USAGE_THRESHOLDS: UsageThreshold[] = [
  {
    percent: 70,
    severity: 'info',
    message: 'Has utilizado el 70% de tus tokens mensuales. Considera optimizar tus consultas.',
  },
  {
    percent: 85,
    severity: 'warning',
    message: 'Has utilizado el 85% de tus tokens mensuales. Te queda poco consumo disponible.',
  },
  {
    percent: 95,
    severity: 'warning',
    message: '⚠️ Has utilizado el 95% de tus tokens mensuales. Estás por alcanzar el límite.',
  },
  {
    percent: 100,
    severity: 'error',
    message: '🚫 Has alcanzado el límite de tokens de tu plan. Actualiza a un plan superior para continuar.',
  },
]

/**
 * Get the appropriate usage warning for the current utilization percentage.
 * Returns null if utilization is below the first threshold.
 */
export function getUsageWarning(utilizationPercent: number): UsageThreshold | null {
  // Find the highest threshold that has been exceeded
  const exceeded = USAGE_THRESHOLDS.filter(t => utilizationPercent >= t.percent)
  return exceeded.length > 0 ? exceeded[exceeded.length - 1]! : null
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the tier that the user should upgrade to from their current tier.
 */
export function getSuggestedUpgradeTier(currentTier: SubscriptionTier): SubscriptionTier | null {
  switch (currentTier) {
    case 'freemium': return 'pro'
    case 'pro': return 'max'
    case 'max': return null // Already at highest tier
    default: return 'pro'
  }
}

/**
 * Get the TierConfig for a given tier.
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_CONFIGS[tier]
}

/**
 * Calculate the freemium trial expiration date from registration date.
 */
export function calculateTrialExpiry(registeredAt: Date): Date {
  const expiry = new Date(registeredAt)
  expiry.setDate(expiry.getDate() + TIER_CONFIGS.freemium.periodDays)
  return expiry
}
