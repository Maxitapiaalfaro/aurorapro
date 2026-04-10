"use client"

/**
 * ClinicalCanvas — Workspace area for agent-generated content.
 *
 * This component renders in the "Canvas" column of the split-screen layout.
 * It listens to global state (documents, patient data, summaries) and renders
 * the appropriate content independently from the chat column.
 *
 * Content priority:
 * 1. DocumentPreviewPanel (when document generation is active or ready)
 * 2. FichaClinicaPanel (when patient context and ficha panel are open)
 * 3. Empty state (default — encourages starting a conversation)
 */

import React, { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Stethoscope, Sparkles, MessageSquare } from 'lucide-react'
import { DocumentPreviewPanel } from '@/components/document-preview-panel'
import FichaClinicaPanel from '@/components/patient-library/FichaClinicaPanel'
import { cn } from '@/lib/utils'
import type { DocumentPreviewEvent, DocumentReadyEvent, FichaClinicaState, PatientRecord } from '@/types/clinical-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClinicalCanvasProps {
  /** Document generation preview event (SSE stream) */
  documentPreview: DocumentPreviewEvent | null
  /** Document ready event — null while still generating */
  documentReady: DocumentReadyEvent | null
  /** Whether the document panel is visible */
  isDocumentPanelOpen: boolean
  /** Close the document panel */
  onCloseDocumentPanel: () => void
  /** Open the document panel */
  onOpenDocumentPanel: () => void
  /** Callback to save user edits to the document markdown */
  onSaveDocumentEdit: (documentId: string, newMarkdown: string) => Promise<void>

  /** Patient context for ficha panel */
  patient: PatientRecord | null
  /** Whether the ficha panel is open */
  isFichaOpen: boolean
  /** Toggle ficha panel */
  onFichaOpenChange: (open: boolean) => void
  /** Local ficha state */
  fichasClinicas: FichaClinicaState[]
  /** Refresh ficha list */
  onRefreshFichas: () => Promise<void>
  /** Generate ficha from chat context */
  onGenerateFicha: () => Promise<void>
  /** Is ficha generation loading */
  isGeneratingFicha: boolean
  /** Cancel ficha generation */
  onCancelFichaGeneration: () => void
  /** Can revert last ficha */
  canRevertFicha: boolean
  /** Revert last ficha */
  onRevertFicha: () => Promise<void>
  /** Initial tab for ficha panel */
  fichaInitialTab: "ficha" | "insights"

  /** Optional className */
  className?: string
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const CanvasEmptyState = memo(function CanvasEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-md"
      >
        <div className="relative mx-auto mb-6 w-16 h-16">
          <div className="absolute inset-0 bg-primary/10 rounded-2xl rotate-6" />
          <div className="absolute inset-0 bg-primary/5 rounded-2xl -rotate-3" />
          <div className="relative flex items-center justify-center w-full h-full bg-card border border-border/60 rounded-2xl shadow-sm">
            <Sparkles className="h-7 w-7 text-primary/70" />
          </div>
        </div>

        <h3 className="text-lg font-medium text-foreground/90 mb-2 font-sans">
          Clinical Canvas
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed font-sans">
          Aquí aparecerán los documentos, fichas clínicas y contenido generado por los agentes de IA durante tu conversación.
        </p>

        <div className="mt-8 grid gap-3 text-left">
          <FeatureHint
            icon={<FileText className="h-4 w-4" />}
            title="Documentos clínicos"
            description="Generados automáticamente durante la conversación"
          />
          <FeatureHint
            icon={<Stethoscope className="h-4 w-4" />}
            title="Fichas clínicas"
            description="Resúmenes estructurados del paciente"
          />
          <FeatureHint
            icon={<MessageSquare className="h-4 w-4" />}
            title="Análisis en tiempo real"
            description="Resultados que se actualizan con cada interacción"
          />
        </div>
      </motion.div>
    </div>
  )
})

function FeatureHint({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/30">
      <div className="flex-shrink-0 mt-0.5 text-primary/60">{icon}</div>
      <div>
        <div className="text-sm font-medium text-foreground/80">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ClinicalCanvas = memo(function ClinicalCanvas({
  documentPreview,
  documentReady,
  isDocumentPanelOpen,
  onCloseDocumentPanel,
  onOpenDocumentPanel,
  onSaveDocumentEdit,
  patient,
  isFichaOpen,
  onFichaOpenChange,
  fichasClinicas,
  onRefreshFichas,
  onGenerateFicha,
  isGeneratingFicha,
  onCancelFichaGeneration,
  canRevertFicha,
  onRevertFicha,
  fichaInitialTab,
  className,
}: ClinicalCanvasProps) {
  const hasDocumentContent = !!(documentPreview || documentReady)
  const hasFichaContent = !!(patient && isFichaOpen)
  const hasContent = hasDocumentContent || hasFichaContent

  return (
    <div className={cn('flex flex-col h-full overflow-hidden bg-background', className)}>
      <AnimatePresence mode="wait">
        {hasDocumentContent ? (
          <motion.div
            key="document"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            <DocumentPreviewPanel
              previewEvent={documentPreview}
              readyEvent={documentReady}
              isOpen={true}
              onClose={onCloseDocumentPanel}
              onSaveEdit={onSaveDocumentEdit}
              className="border-l-0 w-full md:w-full lg:w-full"
            />
          </motion.div>
        ) : hasFichaContent ? (
          <motion.div
            key="ficha"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col h-full overflow-hidden"
          >
            <FichaClinicaPanel
              open={isFichaOpen}
              onOpenChange={onFichaOpenChange}
              patient={patient!}
              fichas={fichasClinicas}
              onRefresh={onRefreshFichas}
              onGenerate={onGenerateFicha}
              isGenerating={isGeneratingFicha}
              onCancelGeneration={onCancelFichaGeneration}
              canRevert={canRevertFicha}
              onRevert={onRevertFicha}
              initialTab={fichaInitialTab}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col h-full"
          >
            <CanvasEmptyState />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
