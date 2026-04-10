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
 */

import React, { memo, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
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
// Mobile Layout — Swipeable Tabs
// ---------------------------------------------------------------------------

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
  const x = useMotionValue(0)

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info
      const swipeRight = offset.x > SWIPE_THRESHOLD || velocity.x > SWIPE_VELOCITY_THRESHOLD
      const swipeLeft = offset.x < -SWIPE_THRESHOLD || velocity.x < -SWIPE_VELOCITY_THRESHOLD

      if (activeTab === 'chat' && swipeLeft) {
        setActiveTab('canvas')
      } else if (activeTab === 'canvas' && swipeRight) {
        setActiveTab('chat')
      }
    },
    [activeTab],
  )

  return (
    <div className={cn('flex-1 flex flex-col overflow-hidden', className)} ref={containerRef}>
      {/* Tab Bar */}
      <div className="flex-shrink-0 flex items-center border-b border-border/50 bg-background/95 backdrop-blur-sm px-2">
        <MobileTab
          active={activeTab === 'chat'}
          onClick={() => setActiveTab('chat')}
          icon={<MessageSquare className="h-4 w-4" />}
          label="Chat"
        />
        <MobileTab
          active={activeTab === 'canvas'}
          onClick={() => setActiveTab('canvas')}
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Canvas"
          badge={hasCanvasContent}
        />
      </div>

      {/* Swipeable Content Area */}
      <motion.div
        className="flex-1 overflow-hidden relative touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ x }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'chat' ? (
            <motion.div
              key="mobile-chat"
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              {chatPanel}
            </motion.div>
          ) : (
            <motion.div
              key="mobile-canvas"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              {canvasPanel}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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

      {/* Content badge — small dot when canvas has content */}
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
