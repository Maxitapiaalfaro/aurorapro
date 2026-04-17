import 'server-only'

/**
 * Pricing Engine — Aurora Pro
 *
 * Determines the correct Stripe price ID based on the user's geographic region.
 * Uses PPP-adjusted pricing for global accessibility.
 *
 * Region detection: Vercel's `x-vercel-ip-country` header → country code → PPP tier.
 * Fallback: USD base price.
 *
 * @module lib/payments/pricing-engine
 */

import type { SubscriptionTier, RegionalPrice } from '@/lib/subscriptions/types'

// ---------------------------------------------------------------------------
// PPP Tiers
// ---------------------------------------------------------------------------

/**
 * PPP tier groups countries by purchasing power parity.
 * Each tier maps to a price multiplier relative to the USD base price.
 */
type PPPTier = 'base' | 'eu' | 'latam_high' | 'latam_mid' | 'latam_low' | 'asia'

interface PPPConfig {
  multiplier: number
  currency: string
  /** Countries in this PPP tier (ISO 3166-1 alpha-2) */
  countries: string[]
}

const PPP_TIERS: Record<PPPTier, PPPConfig> = {
  base: {
    multiplier: 1.0,
    currency: 'usd',
    countries: ['US', 'CA', 'AU', 'NZ', 'SG', 'HK', 'JP', 'KR', 'IL', 'CH'],
  },
  eu: {
    multiplier: 0.9,
    currency: 'eur',
    countries: [
      'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'FI', 'IE',
      'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT',
      'GB', 'SE', 'DK', 'NO', 'PL', 'CZ', 'HU', 'RO', 'BG', 'HR',
    ],
  },
  latam_high: {
    multiplier: 0.75,
    currency: 'usd',
    countries: ['CL', 'UY', 'CR', 'PA'],
  },
  latam_mid: {
    multiplier: 0.7,
    currency: 'usd',
    countries: ['MX', 'CO', 'PE', 'EC', 'DO', 'GT'],
  },
  latam_low: {
    multiplier: 0.65,
    currency: 'usd',
    countries: ['BR', 'AR', 'BO', 'PY', 'VE', 'HN', 'NI', 'SV'],
  },
  asia: {
    multiplier: 0.6,
    currency: 'usd',
    countries: ['IN', 'ID', 'TH', 'VN', 'PH', 'MY', 'BD', 'PK', 'LK', 'NP'],
  },
}

// Build reverse lookup: country → PPP tier
const COUNTRY_TO_PPP: Map<string, PPPTier> = new Map()
for (const [tier, config] of Object.entries(PPP_TIERS)) {
  for (const country of config.countries) {
    COUNTRY_TO_PPP.set(country, tier as PPPTier)
  }
}

// ---------------------------------------------------------------------------
// Base Prices (USD cents)
// ---------------------------------------------------------------------------

interface BasePricing {
  monthly: number  // in cents
  yearly: number   // in cents (total for year, not per month)
}

const BASE_PRICES: Record<Exclude<SubscriptionTier, 'free'>, BasePricing> = {
  starter: {
    monthly: 1200,    // $12/mo
    yearly: 12000,    // $120/yr (2 months free)
  },
  pro: {
    monthly: 2900,    // $29/mo
    yearly: 29000,    // $290/yr (2 months free)
  },
  max: {
    monthly: 7900,    // $79/mo
    yearly: 79000,    // $790/yr (2 months free)
  },
  clinic: {
    monthly: 19900,   // $199/mo (5 seats)
    yearly: 199000,   // $1,990/yr (2 months free)
  },
}

// ---------------------------------------------------------------------------
// Stripe Price ID Mapping
// ---------------------------------------------------------------------------

/**
 * Maps (tier, interval, ppp_tier) → Stripe Price ID.
 *
 * These IDs must be created in the Stripe Dashboard or via API first.
 * Format: price_{tier}_{interval}_{ppp_tier}
 *
 * TODO: Replace placeholder IDs with actual Stripe price IDs after setup.
 */
interface StripePriceMap {
  [key: string]: string // key: `${tier}_${interval}_${pppTier}`
}

const STRIPE_PRICE_IDS: StripePriceMap = {
  // Starter monthly
  'starter_month_base':       process.env.STRIPE_PRICE_STARTER_MONTH_BASE       || 'price_starter_month_base',
  'starter_month_eu':         process.env.STRIPE_PRICE_STARTER_MONTH_EU         || 'price_starter_month_eu',
  'starter_month_latam_high': process.env.STRIPE_PRICE_STARTER_MONTH_LATAM_HIGH || 'price_starter_month_latam_high',
  'starter_month_latam_mid':  process.env.STRIPE_PRICE_STARTER_MONTH_LATAM_MID  || 'price_starter_month_latam_mid',
  'starter_month_latam_low':  process.env.STRIPE_PRICE_STARTER_MONTH_LATAM_LOW  || 'price_starter_month_latam_low',
  'starter_month_asia':       process.env.STRIPE_PRICE_STARTER_MONTH_ASIA       || 'price_starter_month_asia',

  // Starter yearly
  'starter_year_base':       process.env.STRIPE_PRICE_STARTER_YEAR_BASE       || 'price_starter_year_base',
  'starter_year_eu':         process.env.STRIPE_PRICE_STARTER_YEAR_EU         || 'price_starter_year_eu',
  'starter_year_latam_high': process.env.STRIPE_PRICE_STARTER_YEAR_LATAM_HIGH || 'price_starter_year_latam_high',
  'starter_year_latam_mid':  process.env.STRIPE_PRICE_STARTER_YEAR_LATAM_MID  || 'price_starter_year_latam_mid',
  'starter_year_latam_low':  process.env.STRIPE_PRICE_STARTER_YEAR_LATAM_LOW  || 'price_starter_year_latam_low',
  'starter_year_asia':       process.env.STRIPE_PRICE_STARTER_YEAR_ASIA       || 'price_starter_year_asia',

  // Pro monthly
  'pro_month_base':       process.env.STRIPE_PRICE_PRO_MONTH_BASE       || 'price_pro_month_base',
  'pro_month_eu':         process.env.STRIPE_PRICE_PRO_MONTH_EU         || 'price_pro_month_eu',
  'pro_month_latam_high': process.env.STRIPE_PRICE_PRO_MONTH_LATAM_HIGH || 'price_pro_month_latam_high',
  'pro_month_latam_mid':  process.env.STRIPE_PRICE_PRO_MONTH_LATAM_MID  || 'price_pro_month_latam_mid',
  'pro_month_latam_low':  process.env.STRIPE_PRICE_PRO_MONTH_LATAM_LOW  || 'price_pro_month_latam_low',
  'pro_month_asia':       process.env.STRIPE_PRICE_PRO_MONTH_ASIA       || 'price_pro_month_asia',

  // Pro yearly
  'pro_year_base':       process.env.STRIPE_PRICE_PRO_YEAR_BASE       || 'price_pro_year_base',
  'pro_year_eu':         process.env.STRIPE_PRICE_PRO_YEAR_EU         || 'price_pro_year_eu',
  'pro_year_latam_high': process.env.STRIPE_PRICE_PRO_YEAR_LATAM_HIGH || 'price_pro_year_latam_high',
  'pro_year_latam_mid':  process.env.STRIPE_PRICE_PRO_YEAR_LATAM_MID  || 'price_pro_year_latam_mid',
  'pro_year_latam_low':  process.env.STRIPE_PRICE_PRO_YEAR_LATAM_LOW  || 'price_pro_year_latam_low',
  'pro_year_asia':       process.env.STRIPE_PRICE_PRO_YEAR_ASIA       || 'price_pro_year_asia',

  // Max monthly
  'max_month_base':       process.env.STRIPE_PRICE_MAX_MONTH_BASE       || 'price_max_month_base',
  'max_month_eu':         process.env.STRIPE_PRICE_MAX_MONTH_EU         || 'price_max_month_eu',
  'max_month_latam_high': process.env.STRIPE_PRICE_MAX_MONTH_LATAM_HIGH || 'price_max_month_latam_high',
  'max_month_latam_mid':  process.env.STRIPE_PRICE_MAX_MONTH_LATAM_MID  || 'price_max_month_latam_mid',
  'max_month_latam_low':  process.env.STRIPE_PRICE_MAX_MONTH_LATAM_LOW  || 'price_max_month_latam_low',
  'max_month_asia':       process.env.STRIPE_PRICE_MAX_MONTH_ASIA       || 'price_max_month_asia',

  // Max yearly
  'max_year_base':       process.env.STRIPE_PRICE_MAX_YEAR_BASE       || 'price_max_year_base',
  'max_year_eu':         process.env.STRIPE_PRICE_MAX_YEAR_EU         || 'price_max_year_eu',
  'max_year_latam_high': process.env.STRIPE_PRICE_MAX_YEAR_LATAM_HIGH || 'price_max_year_latam_high',
  'max_year_latam_mid':  process.env.STRIPE_PRICE_MAX_YEAR_LATAM_MID  || 'price_max_year_latam_mid',
  'max_year_latam_low':  process.env.STRIPE_PRICE_MAX_YEAR_LATAM_LOW  || 'price_max_year_latam_low',
  'max_year_asia':       process.env.STRIPE_PRICE_MAX_YEAR_ASIA       || 'price_max_year_asia',

  // Clinic monthly (team plan, 5 seats)
  'clinic_month_base':       process.env.STRIPE_PRICE_CLINIC_MONTH_BASE       || 'price_clinic_month_base',
  'clinic_month_eu':         process.env.STRIPE_PRICE_CLINIC_MONTH_EU         || 'price_clinic_month_eu',
  'clinic_month_latam_high': process.env.STRIPE_PRICE_CLINIC_MONTH_LATAM_HIGH || 'price_clinic_month_latam_high',
  'clinic_month_latam_mid':  process.env.STRIPE_PRICE_CLINIC_MONTH_LATAM_MID  || 'price_clinic_month_latam_mid',
  'clinic_month_latam_low':  process.env.STRIPE_PRICE_CLINIC_MONTH_LATAM_LOW  || 'price_clinic_month_latam_low',
  'clinic_month_asia':       process.env.STRIPE_PRICE_CLINIC_MONTH_ASIA       || 'price_clinic_month_asia',

  // Clinic yearly
  'clinic_year_base':       process.env.STRIPE_PRICE_CLINIC_YEAR_BASE       || 'price_clinic_year_base',
  'clinic_year_eu':         process.env.STRIPE_PRICE_CLINIC_YEAR_EU         || 'price_clinic_year_eu',
  'clinic_year_latam_high': process.env.STRIPE_PRICE_CLINIC_YEAR_LATAM_HIGH || 'price_clinic_year_latam_high',
  'clinic_year_latam_mid':  process.env.STRIPE_PRICE_CLINIC_YEAR_LATAM_MID  || 'price_clinic_year_latam_mid',
  'clinic_year_latam_low':  process.env.STRIPE_PRICE_CLINIC_YEAR_LATAM_LOW  || 'price_clinic_year_latam_low',
  'clinic_year_asia':       process.env.STRIPE_PRICE_CLINIC_YEAR_ASIA       || 'price_clinic_year_asia',
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the user's PPP tier from a country code.
 * Returns 'base' (USD full price) if country is unknown.
 */
export function getPPPTier(countryCode: string | null | undefined): PPPTier {
  if (!countryCode) return 'base'
  return COUNTRY_TO_PPP.get(countryCode.toUpperCase()) || 'base'
}

/**
 * Get the country code from a request using Vercel's geo header.
 */
export function getCountryFromRequest(request: Request): string | null {
  // Vercel automatically sets this header
  const country = request.headers.get('x-vercel-ip-country')
  if (country) return country.toUpperCase()

  // Fallback: Cloudflare header
  const cfCountry = request.headers.get('cf-ipcountry')
  if (cfCountry) return cfCountry.toUpperCase()

  return null
}

/**
 * Get the Stripe price ID for a given tier, interval, and region.
 */
export function getStripePriceId(
  tier: Exclude<SubscriptionTier, 'free'>,
  interval: 'month' | 'year',
  countryCode: string | null | undefined
): string {
  const pppTier = getPPPTier(countryCode)
  const key = `${tier}_${interval}_${pppTier}`
  return STRIPE_PRICE_IDS[key] || STRIPE_PRICE_IDS[`${tier}_${interval}_base`] || ''
}

/**
 * Get display pricing info for a tier and region.
 */
export function getRegionalPrice(
  tier: Exclude<SubscriptionTier, 'free'>,
  interval: 'month' | 'year',
  countryCode: string | null | undefined
): RegionalPrice {
  const pppTier = getPPPTier(countryCode)
  const pppConfig = PPP_TIERS[pppTier]
  const basePrice = BASE_PRICES[tier]
  const baseCents = interval === 'month' ? basePrice.monthly : basePrice.yearly
  const adjustedCents = Math.round(baseCents * pppConfig.multiplier)

  // Format display price
  const amount = adjustedCents / 100
  const currency = pppConfig.currency
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  const suffix = interval === 'month' ? '/mo' : '/yr'
  const displayPrice = `${formatter.format(amount)}${suffix}`

  return {
    priceId: getStripePriceId(tier, interval, countryCode),
    amount: adjustedCents,
    currency,
    displayPrice,
    interval,
  }
}

/**
 * Get all pricing options for a region (for pricing page display).
 */
export function getAllPricingForRegion(countryCode: string | null | undefined): {
  starter: { monthly: RegionalPrice; yearly: RegionalPrice }
  pro: { monthly: RegionalPrice; yearly: RegionalPrice }
  max: { monthly: RegionalPrice; yearly: RegionalPrice }
  clinic: { monthly: RegionalPrice; yearly: RegionalPrice }
  pppTier: PPPTier
  savingsPercent: number
} {
  return {
    starter: {
      monthly: getRegionalPrice('starter', 'month', countryCode),
      yearly: getRegionalPrice('starter', 'year', countryCode),
    },
    pro: {
      monthly: getRegionalPrice('pro', 'month', countryCode),
      yearly: getRegionalPrice('pro', 'year', countryCode),
    },
    max: {
      monthly: getRegionalPrice('max', 'month', countryCode),
      yearly: getRegionalPrice('max', 'year', countryCode),
    },
    clinic: {
      monthly: getRegionalPrice('clinic', 'month', countryCode),
      yearly: getRegionalPrice('clinic', 'year', countryCode),
    },
    pppTier: getPPPTier(countryCode),
    savingsPercent: 17, // 2 months free on annual = ~17% savings
  }
}
