# Aurora Animation System

## Overview

The Aurora animation system provides a unified, consistent approach to motion design across the application. This system is built on three pillars:

1. **Design Tokens** (`/lib/animation-tokens.ts`) - Centralized constants for all animation values
2. **CSS Transitions** - For simple, performance-optimized state changes
3. **Framer Motion** - For complex, physics-based animations

## Design Philosophy

### Principles

1. **Purpose-Driven Motion**: Every animation serves a functional purpose (feedback, spatial relationships, attention)
2. **Performance First**: Prefer CSS transitions over JavaScript animations when possible
3. **Accessibility**: Respect `prefers-reduced-motion` media query
4. **Consistency**: Use design tokens to ensure uniform motion language

### Motion Hierarchy

- **Micro-interactions** (100-150ms): Instant feedback for user actions
- **UI Transitions** (200-300ms): Standard interface changes
- **Layout Shifts** (300-600ms): Significant structural changes

## When to Use What

### Use CSS Transitions When:

- Animating simple property changes (color, opacity, transform)
- Interaction requires immediate visual feedback (hover, focus)
- Animation is triggered by CSS pseudo-classes
- Performance is critical (mobile devices)

**Examples**: Button hovers, input focus states, link underlines

### Use Framer Motion When:

- Complex entrance/exit animations needed
- Coordinating multiple elements (stagger, sequence)
- Physics-based motion required (springs, inertia)
- Orchestrating multi-step animations
- Need gesture support (drag, pan, swipe)

**Examples**: Modal animations, panel slides, list item reveals, drag-and-drop

## Animation Categories

### 1. Fast Interactions (100-150ms)

**Use for**: Hover effects, focus states, button presses, toggles

**CSS Approach**:
```css
/* Import tokens in your CSS-in-JS or use values directly */
transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Framer Motion Approach**:
```tsx
import { DURATION, FRAMER_EASING } from '@/lib/animation-tokens';

<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ duration: DURATION.fast / 1000 }}
/>
```

**Examples in Codebase**:
- Button hover states in `/components/header.tsx`
- Link color transitions in `/app/globals.css` (line 234)
- Input focus rings

### 2. UI Transitions (200-300ms)

**Use for**: Tooltips, dropdowns, content reveals, modal openings, panel slides

**CSS Approach**:
```css
transition:
  font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1),
  line-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
  max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

**Framer Motion Approach**:
```tsx
import { DURATION, VARIANTS } from '@/lib/animation-tokens';

<motion.div
  variants={VARIANTS.fadeIn}
  initial="hidden"
  animate="visible"
  transition={{ duration: DURATION.default / 1000 }}
/>
```

**Examples in Codebase**:
- Message customization transitions in `/app/globals.css` (lines 659-667)
- Reasoning bullets in `/components/reasoning-bullets.tsx` (line 75)
- Display settings popover transitions

### 3. Layout Changes (300-600ms)

**Use for**: Large panel slides, drawer animations, full-page transitions, complex reveals

**CSS Approach**:
```css
transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
```

**Framer Motion Approach (Spring Physics)**:
```tsx
import { SPRING, VARIANTS } from '@/lib/animation-tokens';

<motion.div
  variants={VARIANTS.slideRight}
  initial="hidden"
  animate="visible"
  transition={{ type: 'spring', ...SPRING.gentle }}
/>
```

**Examples in Codebase**:
- Document preview panel in `/components/document-preview-panel.tsx` (line 225)
- Agentic transparency flow in `/components/agentic-transparency-flow.tsx` (line 229)
- Patient library section clip-path animation (line 460)

## Easing Functions Explained

### cubic-bezier(0.4, 0, 0.2, 1) - "Material Standard"

**Visual**: Starts quickly, smooth middle, ends quickly
**Use**: Default for most UI transitions
**Feel**: Confident, purposeful
**Examples**: Panel slides, content reveals, layout shifts

### ease-in-out

**Visual**: Equal acceleration and deceleration
**Feel**: Gentle, calm
**Use**: Fade effects, opacity changes, subtle movements
**Examples**: Cursor blink, gentle pulse animations

### cubic-bezier(0, 0, 0.2, 1) - "Enter"

**Visual**: Slow start, fast end
**Feel**: Elements "snap into place"
**Use**: Entrance animations, modals appearing
**Examples**: Modal openings, overlay entrances

### cubic-bezier(0.4, 0, 1, 1) - "Exit"

**Visual**: Fast start, slow end
**Feel**: Elements "drift away"
**Use**: Exit animations, dismissals
**Examples**: Modal closings, tooltip disappearing

## Spring Physics Guide

Springs create natural, physics-based motion. Key parameters:

- **damping**: Resistance (higher = less bouncy)
- **stiffness**: Tension (higher = faster)
- **mass**: Weight (higher = slower, heavier)

### SPRING.gentle (damping: 28, stiffness: 300)

**Feel**: Smooth, professional, no bounce
**Use**: Clinical UI, serious content, professional contexts
**Example**:
```tsx
transition={{ type: 'spring', damping: 28, stiffness: 300 }}
```

### SPRING.default (damping: 20, stiffness: 300)

**Feel**: Slight overshoot, natural movement
**Use**: Standard interactions, panel slides
**Example**:
```tsx
transition={{ type: 'spring', damping: 20, stiffness: 300 }}
```

### SPRING.snappy (damping: 22, stiffness: 400)

**Feel**: Fast response, noticeable bounce
**Use**: Button presses, quick toggles, playful interactions
**Example**:
```tsx
transition={{ type: 'spring', damping: 22, stiffness: 400 }}
```

### SPRING.smooth (damping: 30, stiffness: 300)

**Feel**: Very smooth, controlled, no overshoot
**Use**: High-precision interactions, clinical data
**Example**:
```tsx
transition={{ type: 'spring', damping: 30, stiffness: 300 }}
```

## Migration Guide

### Existing Patterns → Token-Based

#### Pattern 1: CSS Transitions
```css
/* BEFORE */
transition: color 0.15s ease-in-out;

/* AFTER (using tokens) */
@import { ANIMATION } from '@/lib/animation-tokens';
transition: color ${ANIMATION.color};
```

#### Pattern 2: Framer Motion Durations
```tsx
// BEFORE
transition={{ duration: 0.18 }}

// AFTER
import { DURATION } from '@/lib/animation-tokens';
transition={{ duration: DURATION.fast / 1000 }}
```

#### Pattern 3: Spring Physics
```tsx
// BEFORE
transition={{ type: 'spring', damping: 28, stiffness: 300 }}

// AFTER
import { SPRING } from '@/lib/animation-tokens';
transition={{ type: 'spring', ...SPRING.gentle }}
```

#### Pattern 4: Custom Easings
```tsx
// BEFORE
transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}

// AFTER
import { DURATION, FRAMER_EASING } from '@/lib/animation-tokens';
transition={{ duration: DURATION.default / 1000, ease: FRAMER_EASING.default }}
```

## Keyframe Animations

For repeating or complex CSS animations, use keyframes with standardized easings.

### Example: Cursor Blink
```css
@keyframes cursor-blink {
  0%, 45% { opacity: 1; }
  50%, 95% { opacity: 0; }
  100% { opacity: 1; }
}

.animate-cursor-blink {
  animation: cursor-blink 1.2s ease-in-out infinite;
}
```

### Example: Gentle Pulse
```css
@keyframes gentle-pulse {
  0%, 100% {
    opacity: 0.7;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.animate-gentle-pulse {
  animation: gentle-pulse 2s ease-in-out infinite;
}
```

### Example: Scroll Hint
```css
@keyframes scroll-hint {
  0%, 100% {
    opacity: 0.3;
    transform: translateY(-50%) translateX(0);
  }
  50% {
    opacity: 0.7;
    transform: translateY(-50%) translateX(5px);
  }
}

.scroll-indicator {
  animation: scroll-hint 2s ease-in-out infinite;
}
```

## Accessibility Considerations

Always respect user preferences for reduced motion:

### CSS Approach
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Framer Motion Approach
```tsx
import { useReducedMotion } from 'framer-motion';

const shouldReduceMotion = useReducedMotion();

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: shouldReduceMotion ? 0 : 0 }}
  transition={{
    duration: shouldReduceMotion ? 0 : DURATION.default / 1000
  }}
/>
```

## Performance Best Practices

### 1. Prefer Transforms Over Layout Properties

**Good** (GPU-accelerated):
```tsx
animate={{ transform: 'translateX(100px)' }}
```

**Bad** (triggers layout):
```tsx
animate={{ left: '100px' }}
```

### 2. Use `will-change` Sparingly

Only on elements actively animating:
```css
.animating-element {
  will-change: transform, opacity;
}

.animating-element:not(:hover) {
  will-change: auto;
}
```

### 3. Batch Animation Updates

Use `layoutId` for shared element transitions:
```tsx
<motion.div layoutId="shared-element" />
```

### 4. Optimize Heavy Animations

Use `useReducedMotion` and conditional rendering:
```tsx
{!shouldReduceMotion && <ComplexAnimation />}
```

## Current Animation Inventory

### globals.css Keyframes (7 total)

1. **cursor-blink** (1.2s, ease-in-out, infinite)
   - Location: line 24
   - Usage: Typing indicators

2. **scroll-hint** (2s, ease-in-out, infinite)
   - Location: line 496
   - Usage: Mobile table scroll indicators

3. **gentle-pulse** (2s, ease-in-out, infinite)
   - Location: line 593
   - Usage: Status indicators

4. **gentle-fade** (ease-in-out)
   - Location: line 604
   - Usage: Subtle fade effects

5. **gentle-bounce** (ease-in-out)
   - Location: line 613
   - Usage: Attention indicators

6. **slide-up** (0.6s, ease-out)
   - Location: line 625
   - Usage: Message preload animations

7. **gentle-glow** (2s, ease-in-out, infinite)
   - Location: line 636
   - Usage: Focus indicators

### CSS Transitions (standardized)

- **Link hover**: 0.15s ease-in-out (line 234)
- **Table row hover**: 0.15s ease (line 413)
- **Customization changes**: 0.3s cubic-bezier(0.4, 0, 0.2, 1) (lines 659-667)

### Framer Motion Patterns

- **Reasoning bullets**: 0.18s duration (gentle micro-interaction)
- **Voice transcription overlay**: 0.2s duration (quick feedback)
- **Document preview panel**: spring (damping: 28, stiffness: 300) - smooth professional
- **Agentic transparency**: spring (stiffness: 400, damping: 22) - snappy response
- **Chat interface**: Various (0.2s - 0.4s for different elements)

## Quick Reference

| Use Case | Duration | Easing | Implementation |
|----------|----------|--------|----------------|
| Hover effects | 150ms | cubic-bezier(0.4, 0, 0.2, 1) | CSS transition |
| Focus states | 150ms | cubic-bezier(0.4, 0, 0.2, 1) | CSS transition |
| Tooltips | 200ms | ease-in-out | Framer Motion |
| Dropdowns | 200ms | cubic-bezier(0.4, 0, 0.2, 1) | Framer Motion |
| Modal opening | 300ms | cubic-bezier(0, 0, 0.2, 1) | Framer Motion + spring |
| Panel slides | spring | gentle (28, 300) | Framer Motion |
| Drawer animations | spring | default (20, 300) | Framer Motion |
| Layout shifts | 300ms | cubic-bezier(0.4, 0, 0.2, 1) | CSS transition |
| Fade effects | 300ms | ease-in-out | CSS transition or Framer |
| Complex reveals | 400-600ms | cubic-bezier(0.4, 0, 0.2, 1) | Framer Motion |

## Examples from Codebase

### Example 1: Button Hover (Fast Interaction)

**File**: `/components/header.tsx` (line 114)

```tsx
className="h-10 w-10 rounded-xl hover:bg-clarity-blue-50/80 transition-colors"
```

**Improvement**:
```tsx
import { ANIMATION } from '@/lib/animation-tokens';

className="h-10 w-10 rounded-xl hover:bg-clarity-blue-50/80"
style={{ transition: ANIMATION.color }}
```

### Example 2: Text Size Transition (Layout Change)

**File**: `/app/globals.css` (lines 659-667)

```css
transition: font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1),
            line-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

**Improvement**:
```css
/* Using token values */
transition: font-size 300ms cubic-bezier(0.4, 0, 0.2, 1),
            line-height 300ms cubic-bezier(0.4, 0, 0.2, 1);
```

### Example 3: Document Panel Slide (Spring)

**File**: `/components/document-preview-panel.tsx` (line 225)

```tsx
transition={{ type: 'spring', damping: 28, stiffness: 300 }}
```

**Improvement**:
```tsx
import { SPRING } from '@/lib/animation-tokens';

transition={{ type: 'spring', ...SPRING.gentle }}
```

### Example 4: Reasoning Bullets (Micro-Interaction)

**File**: `/components/reasoning-bullets.tsx` (line 75)

```tsx
transition={{ duration: 0.18 }}
```

**Improvement**:
```tsx
import { DURATION } from '@/lib/animation-tokens';

transition={{ duration: DURATION.fast / 1000 }}
```

## Future Enhancements

1. **Shared Element Transitions**: Implement `layoutId` for seamless state changes
2. **Gesture Support**: Add drag, swipe, pan gestures using Framer Motion
3. **Animation Orchestration**: Create stagger and sequence utilities
4. **Theme-Aware Animations**: Different speeds for light/dark mode
5. **Performance Monitoring**: Track animation FPS and jank

## Resources

- [Material Design Motion](https://m3.material.io/styles/motion)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [CSS Easing Functions](https://easings.net/)
- [Animation Principles](https://www.interaction-design.org/literature/article/the-12-principles-of-animation)
