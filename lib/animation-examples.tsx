/**
 * Animation Tokens - Quick Start Examples
 *
 * This file contains practical examples of how to use the Aurora animation system.
 * For full documentation, see /docs/animation-system.md
 */

import {
  EASING,
  DURATION,
  SPRING,
  ANIMATION,
  VARIANTS,
  FRAMER_EASING
} from '@/lib/animation-tokens';
import { motion } from 'framer-motion';

// ============================================================================
// EXAMPLE 1: Simple Button Hover (CSS-in-JS)
// ============================================================================

export function ButtonExample() {
  return (
    <button
      style={{
        transition: ANIMATION.hover, // "150ms cubic-bezier(0.4, 0, 0.2, 1)"
      }}
      className="hover:bg-blue-500"
    >
      Hover Me
    </button>
  );
}

// ============================================================================
// EXAMPLE 2: Fade In Animation (Framer Motion)
// ============================================================================

export function FadeInExample() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.default / 1000 }} // 0.3 seconds
    >
      I fade in!
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 3: Using Variants (Recommended Pattern)
// ============================================================================

export function VariantExample() {
  return (
    <motion.div
      variants={VARIANTS.slideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: DURATION.default / 1000 }}
    >
      I slide up and fade in!
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 4: Spring Animation (Natural Motion)
// ============================================================================

export function SpringExample() {
  return (
    <motion.div
      initial={{ x: -100 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', ...SPRING.gentle }}
    >
      I slide in with smooth physics!
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 5: Panel Slide (Common Pattern)
// ============================================================================

export function PanelExample({ isOpen }: { isOpen: boolean }) {
  return (
    <motion.div
      variants={VARIANTS.slideRight}
      initial="hidden"
      animate={isOpen ? "visible" : "hidden"}
      transition={{ type: 'spring', ...SPRING.gentle }}
      className="fixed right-0 top-0 h-full w-80 bg-white"
    >
      Panel content
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 6: Staggered List Animation
// ============================================================================

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: DURATION.fast / 1000, // 0.15s between items
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function StaggeredListExample({ items }: { items: string[] }) {
  return (
    <motion.ul
      variants={listVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, i) => (
        <motion.li
          key={i}
          variants={itemVariants}
          transition={{ duration: DURATION.medium / 1000 }}
        >
          {item}
        </motion.li>
      ))}
    </motion.ul>
  );
}

// ============================================================================
// EXAMPLE 7: Hover Scale (Micro-Interaction)
// ============================================================================

export function HoverScaleExample() {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: DURATION.fast / 1000 }}
    >
      Click Me
    </motion.button>
  );
}

// ============================================================================
// EXAMPLE 8: Loading Spinner (Continuous Animation)
// ============================================================================

export function LoadingSpinnerExample() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: EASING.linear,
      }}
      className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
    />
  );
}

// ============================================================================
// EXAMPLE 9: Multiple Properties (CSS)
// ============================================================================

export function MultiplePropertiesExample() {
  return (
    <div
      style={{
        transition: `
          opacity ${ANIMATION.fade},
          transform ${ANIMATION.slideIn}
        `,
      }}
      className="opacity-0 translate-y-4 hover:opacity-100 hover:translate-y-0"
    >
      Hover to fade and slide up
    </div>
  );
}

// ============================================================================
// EXAMPLE 10: Custom Spring Configuration
// ============================================================================

export function CustomSpringExample() {
  // When you need precise control, you can customize spring values
  const customSpring = {
    type: 'spring' as const,
    damping: SPRING.gentle.damping + 5, // Slightly more damped
    stiffness: SPRING.gentle.stiffness,
    mass: 1.2, // Heavier feel
  };

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={customSpring}
    >
      Custom spring animation
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 11: Conditional Animation (Reduced Motion)
// ============================================================================

import { useReducedMotion } from 'framer-motion';

export function AccessibleAnimationExample() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : DURATION.default / 1000,
      }}
    >
      Respects user motion preferences
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 12: Exit Animation (Modal Close)
// ============================================================================

import { AnimatePresence } from 'framer-motion';

export function ModalExample({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.medium / 1000 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50"
          />

          {/* Modal */}
          <motion.div
            variants={VARIANTS.scaleIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: 'spring', ...SPRING.snappy }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg"
          >
            <h2>Modal Content</h2>
            <button onClick={onClose}>Close</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// EXAMPLE 13: Tailwind Classes with Tokens
// ============================================================================

export function TailwindExample() {
  // For inline styles with Tailwind
  return (
    <div
      className="hover:bg-blue-500 hover:scale-105"
      style={{
        // Override Tailwind's default transition
        transitionProperty: 'background-color, transform',
        transitionDuration: `${DURATION.fast}ms`,
        transitionTimingFunction: EASING.fast,
      }}
    >
      Custom transition with Tailwind
    </div>
  );
}

// ============================================================================
// EXAMPLE 14: Layout Animation (Shared Element)
// ============================================================================

export function SharedElementExample({ isExpanded }: { isExpanded: boolean }) {
  return (
    <motion.div
      layout // Automatically animates layout changes
      transition={{ type: 'spring', ...SPRING.default }}
      className={isExpanded ? 'w-full h-96' : 'w-64 h-48'}
    >
      Click to expand
    </motion.div>
  );
}

// ============================================================================
// EXAMPLE 15: Gesture Animations
// ============================================================================

export function GestureExample() {
  return (
    <motion.div
      drag
      dragConstraints={{ left: -100, right: 100, top: -100, bottom: 100 }}
      dragElastic={0.2}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
      transition={{ type: 'spring', ...SPRING.snappy }}
      className="w-24 h-24 bg-blue-500 rounded-lg cursor-grab"
    >
      Drag me!
    </motion.div>
  );
}

// ============================================================================
// QUICK REFERENCE
// ============================================================================

/**
 * WHEN TO USE WHAT:
 *
 * CSS Transitions:
 * - Simple state changes (hover, focus)
 * - Color/opacity changes
 * - Performance-critical animations
 *
 * Framer Motion (Duration):
 * - Complex entrance/exit animations
 * - Coordinated multi-element animations
 * - When you need programmatic control
 *
 * Framer Motion (Spring):
 * - Natural, physics-based motion
 * - Panel slides, drawer animations
 * - When you want subtle bounce/overshoot
 *
 * DURATION GUIDE:
 * - DURATION.fast (150ms): Hover, focus, quick feedback
 * - DURATION.medium (200ms): Tooltips, dropdowns
 * - DURATION.default (300ms): Most UI transitions
 * - DURATION.slow (400ms): Panel slides, complex animations
 * - DURATION.extended (600ms): Multi-step animations
 *
 * SPRING GUIDE:
 * - SPRING.gentle: Professional, no bounce (clinical UI)
 * - SPRING.default: Balanced, slight overshoot
 * - SPRING.snappy: Quick, responsive
 * - SPRING.bouncy: Playful, attention-grabbing
 * - SPRING.smooth: Ultra-smooth, no overshoot
 */
