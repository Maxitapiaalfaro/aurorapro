"use client"

/**
 * WorkspaceLayout — Collapsible desktop / swipeable-tabs mobile layout.
 *
 * Desktop (≥ 768px): Collapsible canvas with animated transitions.
 *   Default    → Chat full-width, canvas collapsed to a 40px rail
 *   Expanded   → Chat ~45%, Canvas ~55%
 *   Toggle     → Click rail / header button, or Ctrl+. keyboard shortcut
 *   Auto-expand when canvas content arrives (documents, fichas)
 *   Auto-collapse ~2s after content is dismissed
 *
 * Mobile (< 768px): Tab-based navigation with swipe gesture support.
 *   Tab "Chat"   → Chat interface (default)
 *   Tab "Canvas"  → Clinical Canvas
 *
 * The layout is purely structural — it receives Chat and Canvas as children
 * and arranges them spatially. No business logic lives here.
 *
 * **Scroll Persistence** (mobile): Both panels stay mounted at all times so
 * that DOM state, including scroll position, is preserved across tab switches.
 */

import React, { memo, useState, useCallback, useRef, useEffect } from 'react'
import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageSquare, LayoutDashboard, PanelRightOpen, PanelRightClose } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceLayoutProps {
  /** Whether the current viewport is mobile */
  isMobile: boolean
  /** The chat panel content */
  chatPanel: React.ReactNode
  /** The canvas panel content */
  canvasPanel: React.ReactNode
  /** Whether the canvas has active content (affects mobile tab indicator) */
  hasCanvasContent?: boolean
  /** Optional className for the root container */
  className?: string
}

// ---------------------------------------------------------------------------
// Canvas Rail — Collapsed state affordance (40px vertical strip)
// ---------------------------------------------------------------------------

function CanvasRail({ onClick, hasContent }: { onClick: () => void; hasContent: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 w-full h-full py-4 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      aria-label={hasContent ? 'Abrir Canvas — contenido disponible (Ctrl+.)' : 'Abrir Canvas (Ctrl+.)'}
      aria-expanded={false}
      title="Abrir Canvas (Ctrl+.)"
    >
      <PanelRightOpen className="h-4 w-4" />
      <span className="text-[10px] font-medium tracking-wide [writing-mode:vertical-lr] rotate-180 select-none">
        Canvas
      </span>
      {hasContent && (
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse mt-1" aria-hidden="true" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Desktop Layout — Collapsible Canvas
// ---------------------------------------------------------------------------
//
// Canvas starts collapsed (40px rail). Auto-expands when content arrives.
// Auto-collapses ~2s after content is dismissed (if auto-opened).
// User can toggle with click or Ctrl+.
//
// States:
//   Collapsed  → Chat 100% (minus 40px rail)
//   Expanded   → Chat ~45%, Canvas ~55%

const DesktopWorkspaceLayout = memo(function DesktopWorkspaceLayout({
  chatPanel,
  canvasPanel,
  hasCanvasContent,
  className,
}: Pick<WorkspaceLayoutProps, 'chatPanel' | 'canvasPanel' | 'hasCanvasContent' | 'className'>) {
  const [isCanvasOpen, setIsCanvasOpen] = useState(false)
  // Tracks whether canvas was opened by user or auto-expand
  const openSourceRef = useRef<'auto' | 'user'>('auto')
  // When true, auto-expand is suppressed (user explicitly collapsed)
  const [userCollapsed, setUserCollapsed] = useState(false)
  const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Auto-expand when content arrives (unless user explicitly collapsed)
  useEffect(() => {
    if (hasCanvasContent && !isCanvasOpen && !userCollapsed) {
      setIsCanvasOpen(true)
      openSourceRef.current = 'auto'
    }
  }, [hasCanvasContent, isCanvasOpen, userCollapsed])

  // Auto-collapse ~2s after content dismissed (only if auto-opened)
  useEffect(() => {
    clearTimeout(autoCollapseTimerRef.current)
    if (!hasCanvasContent && isCanvasOpen && openSourceRef.current === 'auto') {
      autoCollapseTimerRef.current = setTimeout(() => {
        setIsCanvasOpen(false)
      }, 2000)
    }
    return () => clearTimeout(autoCollapseTimerRef.current)
  }, [hasCanvasContent, isCanvasOpen])

  // Toggle handler
  const handleToggle = useCallback(() => {
    setIsCanvasOpen(prev => {
      if (prev) {
        // Collapsing — mark as user-collapsed
        setUserCollapsed(true)
        return false
      } else {
        // Expanding — clear user-collapsed flag
        setUserCollapsed(false)
        openSourceRef.current = 'user'
        return true
      }
    })
  }, [])

  // Keyboard shortcut: Ctrl+. (or Cmd+.)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault()
        handleToggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleToggle])

  return (
    <div className={cn('flex-1 flex overflow-hidden', className)}>
      {/* Chat panel — takes remaining space */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {chatPanel}
      </div>

      {/* Canvas container — smooth width transition */}
      <div
        className={cn(
          'flex flex-col overflow-hidden transition-[width] duration-300 ease-out flex-none border-l',
          isCanvasOpen
            ? 'w-[55%] border-border/40'
            : 'w-10 border-border/30'
        )}
        role="complementary"
        aria-label="Clinical Canvas"
      >
        {isCanvasOpen ? (
          <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200 fill-mode-both" style={{ animationDelay: '150ms' }}>
            {/* Canvas header with collapse toggle */}
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/20 bg-background/50">
              <span className="text-xs font-medium text-muted-foreground select-none">Canvas</span>
              <button
                type="button"
                onClick={handleToggle}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Cerrar Canvas (Ctrl+.)"
                title="Cerrar Canvas (Ctrl+.)"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {canvasPanel}
            </div>
          </div>
        ) : (
          <CanvasRail onClick={handleToggle} hasContent={!!hasCanvasContent} />
        )}
      </div>

      {/* Screen reader live region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isCanvasOpen ? 'Canvas abierto' : 'Canvas cerrado'}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Mobile Layout — Dual-Mounted Sliding Panels
// ---------------------------------------------------------------------------
//
// Both chat and canvas panels are always mounted (never unmounted) to preserve
// scroll position and DOM state. The visible panel is determined by translating
// a container that holds both panels side-by-side.
//
// Tab switch → animate translateX to 0% (chat) or -100% (canvas)
// Swipe      → real-time drag feedback, snap to nearest panel on release

const SWIPE_THRESHOLD = 50 // px drag before committing to a tab switch
const SWIPE_VELOCITY_THRESHOLD = 300 // px/s velocity for quick swipe

const MobileWorkspaceLayout = memo(function MobileWorkspaceLayout({
  chatPanel,
  canvasPanel,
  hasCanvasContent,
  className,
}: Pick<WorkspaceLayoutProps, 'chatPanel' | 'canvasPanel' | 'hasCanvasContent' | 'className'>) {
  const [activeTab, setActiveTab] = useState<'chat' | 'canvas'>('chat')
  const containerRef = useRef<HTMLDivElement>(null)
  const dragBoundsRef = useRef<HTMLDivElement>(null)

  // x tracks the pixel offset of the sliding container during drag.
  // When idle, it's animated to 0 (chat) or -containerWidth (canvas).
  const x = useMotionValue(0)

  /** Animate the sliding container to show the given tab. */
  const slideTo = useCallback(
    (tab: 'chat' | 'canvas') => {
      const width = containerRef.current?.offsetWidth ?? 0
      const target = tab === 'chat' ? 0 : -width
      animate(x, target, {
        type: 'spring',
        stiffness: 350,
        damping: 35,
        mass: 0.8,
      })
      setActiveTab(tab)
    },
    [x],
  )

  /** Handle drag end — decide whether to switch tabs or snap back. */
  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info
      const width = containerRef.current?.offsetWidth ?? 0

      // Determine intent based on distance or velocity
      const swipedRight = offset.x > SWIPE_THRESHOLD || velocity.x > SWIPE_VELOCITY_THRESHOLD
      const swipedLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -SWIPE_VELOCITY_THRESHOLD

      if (activeTab === 'chat' && swipedLeft) {
        slideTo('canvas')
      } else if (activeTab === 'canvas' && swipedRight) {
        slideTo('chat')
      } else {
        // Snap back to current tab
        const target = activeTab === 'chat' ? 0 : -width
        animate(x, target, {
          type: 'spring',
          stiffness: 400,
          damping: 30,
        })
      }
    },
    [activeTab, slideTo, x],
  )

  /** Handle tab button click — animate to target. */
  const handleTabClick = useCallback(
    (tab: 'chat' | 'canvas') => {
      if (tab !== activeTab) {
        slideTo(tab)
      }
    },
    [activeTab, slideTo],
  )

  return (
    <div className={cn('flex-1 flex flex-col overflow-hidden', className)} ref={containerRef}>
      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-center border-b border-border/50 bg-background/95 backdrop-blur-sm px-2">
        <MobileTab
          active={activeTab === 'chat'}
          onClick={() => handleTabClick('chat')}
          icon={<MessageSquare className="h-4 w-4" />}
          label="Chat"
        />
        <MobileTab
          active={activeTab === 'canvas'}
          onClick={() => handleTabClick('canvas')}
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Canvas"
          badge={hasCanvasContent}
        />
      </div>

      {/* Swipeable Content Area — both panels mounted side by side */}
      <div className="flex-1 overflow-hidden relative" ref={dragBoundsRef}>
        <motion.div
          className="absolute inset-0 flex touch-pan-y"
          style={{ x, width: '200%' }}
          drag="x"
          dragConstraints={dragBoundsRef}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          dragMomentum={false}
        >
          {/* Chat Panel — always mounted, left half */}
          <div className="w-1/2 h-full flex flex-col overflow-hidden">
            {chatPanel}
          </div>

          {/* Canvas Panel — always mounted, right half */}
          <div className="w-1/2 h-full flex flex-col overflow-hidden">
            {canvasPanel}
          </div>
        </motion.div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Mobile Tab Button
// ---------------------------------------------------------------------------

function MobileTab({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium font-sans transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground/70',
      )}
      role="tab"
      aria-selected={active}
    >
      {icon}
      <span>{label}</span>

      {/* Active indicator bar */}
      {active && (
        <motion.div
          layoutId="mobile-workspace-tab-indicator"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      {/* Content badge — small dot when canvas has content. Offset from center by ~24px to sit near icon. */}
      {badge && !active && (
        <span className="absolute top-1.5 right-[calc(50%-24px)] w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export const WorkspaceLayout = memo(function WorkspaceLayout({
  isMobile,
  chatPanel,
  canvasPanel,
  hasCanvasContent,
  className,
}: WorkspaceLayoutProps) {
  if (isMobile) {
    return (
      <MobileWorkspaceLayout
        chatPanel={chatPanel}
        canvasPanel={canvasPanel}
        hasCanvasContent={hasCanvasContent}
        className={className}
      />
    )
  }

  return (
    <DesktopWorkspaceLayout
      chatPanel={chatPanel}
      canvasPanel={canvasPanel}
      hasCanvasContent={hasCanvasContent}
      className={className}
    />
  )
})
