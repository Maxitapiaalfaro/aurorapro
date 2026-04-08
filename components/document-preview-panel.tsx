"use client"

/**
 * DocumentPreviewPanel — Real-time document generation preview
 *
 * Renders a live preview of clinical documents as they are generated section-by-section
 * via SSE `document_preview` events. Shows a professional styled view of the markdown
 * content and provides export controls once the document is ready.
 *
 * Used alongside the chat interface — opens as a side panel when document generation
 * is detected.
 */

import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { FileText, Download, X, Loader2, CheckCircle, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { parseMarkdownSync, parseMarkdownStreamingSync } from '@/lib/markdown-parser-streamdown'
import type { DocumentPreviewEvent, DocumentReadyEvent, DocumentSection } from '@/types/clinical-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentPreviewPanelProps {
  /** Latest preview event from SSE stream */
  previewEvent: DocumentPreviewEvent | null
  /** Document ready event — null while still generating */
  readyEvent: DocumentReadyEvent | null
  /** Whether the panel is visible */
  isOpen: boolean
  /** Close the panel */
  onClose: () => void
  /** Optional className for the root container */
  className?: string
}

// ---------------------------------------------------------------------------
// Section Progress Indicator
// ---------------------------------------------------------------------------

const SectionBadge = memo(function SectionBadge({
  section,
  isActive,
}: {
  section: DocumentSection
  isActive: boolean
}) {
  const isComplete = section.progress >= 1

  return (
    <Badge
      variant={isComplete ? 'default' : isActive ? 'secondary' : 'outline'}
      className={cn(
        'text-xs transition-all duration-300',
        isActive && !isComplete && 'animate-pulse',
      )}
    >
      {isComplete ? (
        <CheckCircle className="mr-1 h-3 w-3" />
      ) : isActive ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : null}
      {section.title}
    </Badge>
  )
})

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

const ProgressBar = memo(function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100)
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Export Buttons
// ---------------------------------------------------------------------------

const ExportButtons = memo(function ExportButtons({
  readyEvent,
}: {
  readyEvent: DocumentReadyEvent
}) {
  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([readyEvent.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `documento_${readyEvent.documentType}_${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [readyEvent])

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExportMarkdown}>
        <FileDown className="mr-1.5 h-4 w-4" />
        Markdown
      </Button>
      {readyEvent.availableFormats.includes('pdf') && (
        <Button variant="outline" size="sm" disabled title="PDF export requiere MCP docrender server">
          <Download className="mr-1.5 h-4 w-4" />
          PDF
        </Button>
      )}
      {readyEvent.availableFormats.includes('docx') && (
        <Button variant="outline" size="sm" disabled title="DOCX export requiere MCP docrender server">
          <Download className="mr-1.5 h-4 w-4" />
          Word
        </Button>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const DocumentPreviewPanelComponent = ({
  previewEvent,
  readyEvent,
  isOpen,
  onClose,
  className,
}: DocumentPreviewPanelProps) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const [completedSections, setCompletedSections] = useState<DocumentSection[]>([])

  // Track completed sections from preview events
  useEffect(() => {
    if (!previewEvent) return
    setCompletedSections(prev => {
      const existing = prev.findIndex(s => s.id === previewEvent.section.id)
      if (existing >= 0) {
        // Update existing section
        const updated = [...prev]
        updated[existing] = previewEvent.section
        return updated
      }
      return [...prev, previewEvent.section]
    })
  }, [previewEvent])

  // Reset state when a new document starts (different documentId)
  const currentDocId = useRef<string | null>(null)
  useEffect(() => {
    if (previewEvent && previewEvent.documentId !== currentDocId.current) {
      currentDocId.current = previewEvent.documentId
      setCompletedSections([])
    }
  }, [previewEvent])

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [previewEvent?.accumulatedMarkdown])

  // Render the accumulated markdown
  const markdownContent = previewEvent?.accumulatedMarkdown ?? readyEvent?.markdown ?? ''
  const isGenerating = !readyEvent
  const progress = previewEvent?.overallProgress ?? (readyEvent ? 1 : 0)
  const documentType = previewEvent?.documentType ?? readyEvent?.documentType ?? ''

  const renderedHtml = useMemo(() => {
    if (!markdownContent) return ''
    return isGenerating
      ? parseMarkdownStreamingSync(markdownContent)
      : parseMarkdownSync(markdownContent)
  }, [markdownContent, isGenerating])

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'flex flex-col h-full border-l bg-background',
        'w-full md:w-[480px] lg:w-[560px]',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">
            Documento {documentType.toUpperCase()}
          </span>
          {isGenerating && (
            <Badge variant="secondary" className="text-xs animate-pulse">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Generando…
            </Badge>
          )}
          {!isGenerating && readyEvent && (
            <Badge variant="default" className="text-xs">
              <CheckCircle className="mr-1 h-3 w-3" />
              Listo ({(readyEvent.durationMs / 1000).toFixed(1)}s)
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-2">
        <ProgressBar progress={progress} />
      </div>

      {/* Section badges */}
      {completedSections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {completedSections.map((section) => (
            <SectionBadge
              key={section.id}
              section={section}
              isActive={previewEvent?.section.id === section.id && section.progress < 1}
            />
          ))}
        </div>
      )}

      {/* Document content */}
      <div
        ref={contentRef}
        className={cn(
          'flex-1 overflow-y-auto px-6 py-4',
          // Professional document styling
          'prose prose-sm max-w-none',
          'prose-headings:text-foreground prose-headings:font-semibold',
          'prose-h2:text-base prose-h2:border-b prose-h2:pb-1 prose-h2:mb-3',
          'prose-p:text-muted-foreground prose-p:leading-relaxed',
          'prose-strong:text-foreground',
          'prose-li:text-muted-foreground',
          isGenerating && 'document-streaming',
        )}
      >
        {markdownContent ? (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Esperando generación del documento…</p>
          </div>
        )}
      </div>

      {/* Footer with export buttons */}
      {readyEvent && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            {readyEvent.documentType.toUpperCase()} • {readyEvent.markdown.length} caracteres
          </span>
          <ExportButtons readyEvent={readyEvent} />
        </div>
      )}
    </div>
  )
}

export const DocumentPreviewPanel = memo(DocumentPreviewPanelComponent)
