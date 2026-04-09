/**
 * Animation Tokens - Aurora Design System
 *
 * Unified animation system for consistent motion across the application.
 * This file centralizes all easing curves, durations, and spring physics configurations.
 *
 * @module animation-tokens
 * @see https://m3.material.io/styles/motion/easing-and-duration for design rationale
 */

// ============================================================================
// EASING CURVES
// ============================================================================

/**
 * Easing curves for CSS transitions
 * Based on Material Design 3 motion system
 */
export const EASING = {
  /**
   * Fast, snappy transitions for quick interactions
   * Use for: hover effects, focus states, button presses
   * Characteristics: Quick acceleration and deceleration
   */
  fast: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /**
   * Default easing for most layout changes
   * Use for: panel slides, content reveals, layout shifts
   * Characteristics: Smooth, balanced motion
   * Note: Same as Material Design's 'standard' easing
   */
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',

  /**
   * Smooth, gentle transitions
   * Use for: fade effects, opacity changes, subtle movements
   * Characteristics: Equal acceleration and deceleration
   */
  smooth: 'ease-in-out',

  /**
   * Emphasized entrance animations
   * Use for: modals appearing, overlays entering
   * Characteristics: Starts slowly, ends quickly
   */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',

  /**
   * Emphasized exit animations
   * Use for: modals closing, overlays leaving
   * Characteristics: Starts quickly, ends slowly
   */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',

  /**
   * Linear motion for continuous animations
   * Use for: loading spinners, infinite rotations
   */
  linear: 'linear',
} as const;

/**
 * Framer Motion easing presets
 * Use these with framer-motion's `ease` property
 */
export const FRAMER_EASING = {
  fast: [0.4, 0, 0.2, 1],
  default: [0.4, 0, 0.2, 1],
  smooth: [0.42, 0, 0.58, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  linear: [0, 0, 1, 1],
} as const;

// ============================================================================
// DURATION
// ============================================================================

/**
 * Duration values in milliseconds
 * Following the 12-factor scale: 100ms * 1.5^n
 */
export const DURATION = {
  /**
   * Ultra-fast micro-interactions (100ms)
   * Use for: checkbox toggles, radio button selection, icon changes
   */
  instant: 100,

  /**
   * Fast interactions (150ms)
   * Use for: hover effects, focus states, button active states
   */
  fast: 150,

  /**
   * Default medium transitions (200ms)
   * Use for: tooltips, dropdown menus, small panel expansions
   */
  medium: 200,

  /**
   * Default for most UI transitions (300ms)
   * Use for: layout changes, content reveals, modal openings
   */
  default: 300,

  /**
   * Slower, more deliberate transitions (400ms)
   * Use for: large panel slides, full-page transitions, drawer animations
   */
  slow: 400,

  /**
   * Extended transitions (600ms)
   * Use for: complex multi-step animations, choreographed sequences
   */
  extended: 600,
} as const;

// ============================================================================
// SPRING PHYSICS (Framer Motion)
// ============================================================================

/**
 * Spring physics configurations for natural, physics-based animations
 * Use with framer-motion's `transition={{ type: 'spring', ...SPRING.gentle }}`
 *
 * Spring parameters:
 * - damping: Resistance to motion (higher = less bouncy)
 * - stiffness: Spring tension (higher = faster, snappier)
 * - mass: Object weight (higher = slower, heavier feel)
 */
export const SPRING = {
  /**
   * Gentle, smooth spring (high damping, low stiffness)
   * Use for: calm, professional interactions, subtle movements
   * Visual feel: Smooth slide, no bounce
   */
  gentle: {
    damping: 28,
    stiffness: 300,
    mass: 1,
  },

  /**
   * Default balanced spring
   * Use for: standard interactions, panel slides, drawer animations
   * Visual feel: Slight overshoot, natural movement
   */
  default: {
    damping: 20,
    stiffness: 300,
    mass: 1,
  },

  /**
   * Snappy, responsive spring
   * Use for: button presses, quick toggles, playful interactions
   * Visual feel: Fast response, noticeable bounce
   */
  snappy: {
    damping: 22,
    stiffness: 400,
    mass: 0.8,
  },

  /**
   * Bouncy, energetic spring (low damping, high stiffness)
   * Use for: attention-grabbing animations, playful moments
   * Visual feel: Pronounced bounce, energetic
   */
  bouncy: {
    damping: 15,
    stiffness: 500,
    mass: 0.8,
  },

  /**
   * Smooth, no-bounce spring
   * Use for: professional contexts, clinical UI, serious content
   * Visual feel: Smooth, controlled, no overshoot
   */
  smooth: {
    damping: 30,
    stiffness: 300,
    mass: 1.2,
  },
} as const;

// ============================================================================
// ANIMATION PRESETS
// ============================================================================

/**
 * Complete animation presets combining easing and duration
 * Use for common animation patterns
 */
export const ANIMATION = {
  /**
   * Fast hover/focus transitions
   * Example: `transition: all ${ANIMATION.hover}`
   */
  hover: `${DURATION.fast}ms ${EASING.fast}`,

  /**
   * Standard UI transitions
   * Example: `transition: opacity ${ANIMATION.fade}`
   */
  fade: `${DURATION.default}ms ${EASING.smooth}`,

  /**
   * Layout shift transitions
   * Example: `transition: max-width ${ANIMATION.layout}`
   */
  layout: `${DURATION.default}ms ${EASING.default}`,

  /**
   * Slide-in transitions
   * Example: `transition: transform ${ANIMATION.slideIn}`
   */
  slideIn: `${DURATION.slow}ms ${EASING.enter}`,

  /**
   * Slide-out transitions
   * Example: `transition: transform ${ANIMATION.slideOut}`
   */
  slideOut: `${DURATION.default}ms ${EASING.exit}`,

  /**
   * Color transitions
   * Example: `transition: color ${ANIMATION.color}`
   */
  color: `${DURATION.medium}ms ${EASING.smooth}`,

  /**
   * All-purpose smooth transition
   * Example: `transition: all ${ANIMATION.all}`
   */
  all: `${DURATION.medium}ms ${EASING.default}`,
} as const;

// ============================================================================
// FRAMER MOTION VARIANTS
// ============================================================================

/**
 * Common framer-motion animation variants
 * Use with: <motion.div variants={VARIANTS.fadeIn} initial="hidden" animate="visible" />
 */
export const VARIANTS = {
  /**
   * Simple fade in/out
   */
  fadeIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },

  /**
   * Fade + slide up (common for modals, dialogs)
   */
  slideUp: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },

  /**
   * Fade + slide down
   */
  slideDown: {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },

  /**
   * Slide from right (common for panels, drawers)
   */
  slideRight: {
    hidden: { x: '100%', opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
  },

  /**
   * Slide from left
   */
  slideLeft: {
    hidden: { x: '-100%', opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
  },

  /**
   * Scale in (zoom effect)
   */
  scaleIn: {
    hidden: { scale: 0.95, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
    exit: { scale: 0.95, opacity: 0 },
  },
} as const;

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * CSS TRANSITION EXAMPLES:
 *
 * // Quick hover effect
 * transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1)
 * // Or using tokens:
 * transition: color ${ANIMATION.hover}
 *
 * // Layout change
 * transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)
 * // Or using tokens:
 * transition: max-width ${ANIMATION.layout}
 *
 * // Multiple properties
 * transition:
 *   opacity ${ANIMATION.fade},
 *   transform ${ANIMATION.slideIn};
 *
 * ============================================================================
 * FRAMER MOTION EXAMPLES:
 *
 * // Simple fade with duration
 * <motion.div
 *   initial={{ opacity: 0 }}
 *   animate={{ opacity: 1 }}
 *   transition={{ duration: DURATION.medium / 1000 }}
 * />
 *
 * // Spring animation
 * <motion.div
 *   initial={{ x: -100 }}
 *   animate={{ x: 0 }}
 *   transition={{ type: 'spring', ...SPRING.gentle }}
 * />
 *
 * // Using variants
 * <motion.div
 *   variants={VARIANTS.slideUp}
 *   initial="hidden"
 *   animate="visible"
 *   exit="exit"
 *   transition={{ duration: DURATION.default / 1000 }}
 * />
 *
 * // Custom easing
 * <motion.div
 *   animate={{ y: 0 }}
 *   transition={{
 *     duration: DURATION.slow / 1000,
 *     ease: FRAMER_EASING.enter
 *   }}
 * />
 *
 * ============================================================================
 * CSS KEYFRAME EXAMPLES:
 *
 * // Cursor blink
 * @keyframes cursor-blink {
 *   0%, 45% { opacity: 1; }
 *   50%, 95% { opacity: 0; }
 *   100% { opacity: 1; }
 * }
 * .animate-cursor-blink {
 *   animation: cursor-blink 1.2s ${EASING.smooth} infinite;
 * }
 *
 * // Gentle pulse
 * @keyframes gentle-pulse {
 *   0%, 100% { opacity: 0.7; transform: scale(1); }
 *   50% { opacity: 1; transform: scale(1.05); }
 * }
 * .animate-gentle-pulse {
 *   animation: gentle-pulse 2s ${EASING.smooth} infinite;
 * }
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type EasingKey = keyof typeof EASING;
export type DurationKey = keyof typeof DURATION;
export type SpringKey = keyof typeof SPRING;
export type AnimationKey = keyof typeof ANIMATION;
export type VariantKey = keyof typeof VARIANTS;
