"use client"

import { MotionConfig } from 'framer-motion'

/**
 * MotionProvider — Wraps the app with framer-motion's MotionConfig
 *
 * Sets `reducedMotion="user"` so that framer-motion automatically respects
 * the user's OS-level "prefers-reduced-motion" setting. When enabled,
 * all framer-motion animations are instantly resolved (no visual motion).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  )
}
