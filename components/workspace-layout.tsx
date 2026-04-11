"use client"

/**
 * WorkspaceLayout — Split-screen desktop / swipeable-tabs mobile layout.
 *
 * Desktop (≥ 768px): Resizable two-panel layout using react-resizable-panels.
 *   Left panel  ~30% → Chat
 *   Right panel ~70% → Clinical Canvas
 *
 * Mobile (< 768px): Tab-based navigation with swipe gesture support.
 *   Tab "Chat"   → Chat interface (default)
 *   Tab "Canvas"  → Clinical Canvas
 *
 * The layout is purely structural — it receives Chat and Canvas as children
 * and arranges them spatially. No business logic lives here.
 *
 * **Scroll Persistence**: Both panels stay mounted at all times (translated
 * off-screen when inactive) so that DOM state, including scroll position,
 * is preserved across tab switches.
 */

import React, { memo, useState, useCallback, useRef } from 'react'
import { motion, useMotionValue, animate, type PanInfo } from 'framer-motion'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { MessageSquare, LayoutDashboard } from 'lucide-react'

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
// Desktop Layout — Resizable Split Panels
// ---------------------------------------------------------------------------

const DesktopWorkspaceLayout = memo(function DesktopWorkspaceLayout({
  chatPanel,
  canvasPanel,
  className,
}: Pick<WorkspaceLayoutProps, 'chatPanel' | 'canvasPanel' | 'className'>) {
  return (
    <ResizablePanelGroup
      direction="horizontal"
      className={cn('flex-1 overflow-hidden', className)}
    >
      {/* Chat Panel — ~30% default, min 20%, max 50% */}
      <ResizablePanel
        defaultSize={30}
        minSize={20}
        maxSize={50}
        className="flex flex-col overflow-hidden"
      >
        <div className="flex-1 flex flex-col overflow-hidden h-full min-h-0">
          {chatPanel}
        </div>
      </ResizablePanel>

      {/* Resize Handle */}
      <ResizableHandle
        withHandle
        className="bg-border/40 hover:bg-border/60 transition-colors data-[resize-handle-active]:bg-primary/20"
      />

      {/* Canvas Panel — ~70% default */}
      <ResizablePanel
        defaultSize={70}
        minSize={30}
        className="flex flex-col overflow-hidden"
      >
        <div className="flex-1 flex flex-col overflow-hidden h-full min-h-0 border-l border-border/40">
          {canvasPanel}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
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
      className={className}
    />
  )
})
