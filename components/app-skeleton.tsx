"use client"

/**
 * App Skeleton — Aurora Post-Login Loading State
 *
 * A skeleton UI that mirrors the final layout structure (header, sidebar,
 * chat area) so the transition from loading → ready is seamless. No spinners,
 * no text, no jarring cuts — just a gentle pulse that dissolves into the
 * real interface.
 *
 * Uses the same dimensional classes as the real components:
 * - Sidebar: w-14 (collapsed default) on desktop, hidden on mobile
 * - Header:  py-3 / py-3.5 with border-b
 * - Chat:    centered area with message-like shapes
 *
 * @module components/app-skeleton
 */

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

/** Header skeleton — matches components/header.tsx dimensions */
function HeaderSkeleton() {
  return (
    <div className="sticky top-0 left-0 right-0 px-4 md:px-6 py-3 md:py-3.5 flex items-center justify-between border-b border-border/40 bg-background/95">
      <div className="flex items-center gap-3 md:gap-4">
        {/* Mobile hamburger placeholder */}
        <Skeleton className="md:hidden h-9 w-9 rounded-lg" />
        {/* Logo */}
        <Skeleton className="h-5 w-16 rounded" />
      </div>
      <div className="flex items-center gap-1.5">
        {/* Sync indicator */}
        <Skeleton className="h-4 w-4 rounded-full" />
        {/* Settings button */}
        <Skeleton className="h-9 w-9 rounded-lg" />
        {/* Theme toggle */}
        <Skeleton className="h-9 w-9 rounded-lg" />
        {/* Sign out */}
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
    </div>
  )
}

/** Sidebar skeleton — matches collapsed sidebar w-14 */
function SidebarSkeleton() {
  return (
    <div className="hidden md:flex flex-col w-14 border-r border-border/30 bg-background/90 py-4 items-center gap-3">
      {/* New chat button */}
      <Skeleton className="h-9 w-9 rounded-lg" />
      {/* Nav items */}
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-9 w-9 rounded-lg" />
    </div>
  )
}

/** Chat area skeleton — empty state with input bar */
function ChatAreaSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Message area — centered welcome-like block */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 px-4">
          {/* Welcome heading placeholder */}
          <Skeleton className="h-5 w-40 rounded mx-auto" />
          <Skeleton className="h-3 w-56 rounded mx-auto" />
          {/* Suggestion chips placeholder */}
          <div className="flex flex-wrap gap-2 justify-center pt-4">
            <Skeleton className="h-8 w-32 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-36 rounded-full" />
          </div>
        </div>
      </div>
      {/* Input bar placeholder */}
      <div className="px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

interface AppSkeletonProps {
  className?: string
}

/**
 * Full-page skeleton that matches the Aurora interface layout.
 * Used as the single loading state between auth resolution and UI readiness.
 */
export function AppSkeleton({ className }: AppSkeletonProps) {
  return (
    <div
      className={cn(
        "flex min-h-[100dvh] h-[100dvh] md:h-screen overflow-hidden bg-background font-sans animate-in fade-in duration-300",
        className,
      )}
    >
      {/* Sidebar (desktop only, collapsed) */}
      <SidebarSkeleton />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <HeaderSkeleton />
        <ChatAreaSkeleton />
      </div>
    </div>
  )
}
