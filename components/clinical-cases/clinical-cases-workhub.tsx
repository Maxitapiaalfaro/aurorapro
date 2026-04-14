"use client"

import { useState, useEffect, useCallback } from "react"
import { CaseListPanel } from "./case-list-panel"
import { CaseDetailPanel, CaseDetailEmptyState } from "./case-detail-panel"
import { usePatientLibrary } from "@/hooks/use-patient-library"
import { useMediaQuery } from "@/hooks/use-media-query"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import type { PatientRecord } from "@/types/clinical-types"

import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ClinicalCasesWorkhubProps {
  onConversationSelect?: (sessionId: string) => void
  onSwitchToChat?: () => void
}

// ---------------------------------------------------------------------------
// Main orchestrator — master-detail layout
// ---------------------------------------------------------------------------

export function ClinicalCasesWorkhub({
  onConversationSelect,
  onSwitchToChat,
}: ClinicalCasesWorkhubProps) {
  const {
    patients,
    isLoading,
    error,
    searchQuery,
    filteredPatients,
    selectedPatient,
    createPatient,
    updatePatient,
    deletePatient,
    searchPatients,
    selectPatient,
    getPatientCount,
    clearError,
    patientStats,
  } = usePatientLibrary()

  const [patientInsights, setPatientInsights] = useState<Map<string, number>>(new Map())

  // Load insights counts
  useEffect(() => {
    const loadInsightCounts = async () => {
      try {
        const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage')
        const storage = getPatternAnalysisStorage()
        await storage.initialize()
        const pending = await storage.getPendingReviewAnalyses()
        const countMap = new Map<string, number>()
        pending.forEach(analysis => {
          const current = countMap.get(analysis.patientId) || 0
          countMap.set(analysis.patientId, current + 1)
        })
        setPatientInsights(countMap)
      } catch (err) {
        logger.error('Failed to load insight counts:', err)
      }
    }
    loadInsightCounts()
    const interval = setInterval(loadInsightCounts, 30000)
    return () => clearInterval(interval)
  }, [])

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSelectCase = useCallback((patient: PatientRecord) => {
    selectPatient(patient)
  }, [selectPatient])

  const handleCreateCase = useCallback(async (data: { displayName: string; tags: string[] }) => {
    try {
      const newPatient = await createPatient({
        displayName: data.displayName,
        tags: data.tags,
        confidentiality: { pii: true, accessLevel: "medium" },
      })
      selectPatient(newPatient)
    } catch (err) {
      logger.error("Failed to create case:", err)
    }
  }, [createPatient, selectPatient])

  const handleEditCase = useCallback((patient: PatientRecord) => {
    // Select the patient so detail panel shows it, then detail panel handles the edit dialog
    selectPatient(patient)
  }, [selectPatient])

  const handleDeleteCase = useCallback(async (patientId: string) => {
    try {
      if (selectedPatient?.id === patientId) {
        selectPatient(null)
      }
      await deletePatient(patientId)
    } catch (err) {
      logger.error("Failed to delete case:", err)
    }
  }, [deletePatient, selectPatient, selectedPatient])

  const handleUpdatePatient = useCallback(async (updated: PatientRecord) => {
    await updatePatient(updated)
  }, [updatePatient])

  // When "Ver en chat" is clicked in sessions tab, switch to conversations view
  const handleConversationSelect = useCallback((sessionId: string) => {
    onConversationSelect?.(sessionId)
    onSwitchToChat?.()
  }, [onConversationSelect, onSwitchToChat])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isMobile = useMediaQuery("(max-width: 768px)")

  // Mobile: stacked view — list OR detail (with back button)
  if (isMobile) {
    if (selectedPatient) {
      return (
        <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden bg-background">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selectPatient(null)}
              className="h-9 gap-1.5 text-sm font-sans -ml-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Casos
            </Button>
            <span className="text-sm font-medium text-foreground font-sans truncate">{selectedPatient.displayName}</span>
          </div>
          <CaseDetailPanel
            patient={selectedPatient}
            stats={patientStats.get(selectedPatient.id)}
            hasInsights={(patientInsights.get(selectedPatient.id) || 0) > 0}
            onUpdatePatient={handleUpdatePatient}
            onConversationSelect={handleConversationSelect}
          />
        </div>
      )
    }

    return (
      <CaseListPanel
        patients={patients}
        filteredPatients={filteredPatients}
        isLoading={isLoading}
        searchQuery={searchQuery}
        selectedPatientId={null}
        patientStats={patientStats}
        patientInsights={patientInsights}
        onSearchChange={searchPatients}
        onSelectCase={handleSelectCase}
        onCreateCase={handleCreateCase}
        onEditCase={handleEditCase}
        onDeleteCase={handleDeleteCase}
        caseCount={getPatientCount()}
        error={error}
        onRetry={clearError}
        className="w-full border-r-0"
      />
    )
  }

  // Desktop: side-by-side master-detail
  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      <CaseListPanel
        patients={patients}
        filteredPatients={filteredPatients}
        isLoading={isLoading}
        searchQuery={searchQuery}
        selectedPatientId={selectedPatient?.id ?? null}
        patientStats={patientStats}
        patientInsights={patientInsights}
        onSearchChange={searchPatients}
        onSelectCase={handleSelectCase}
        onCreateCase={handleCreateCase}
        onEditCase={handleEditCase}
        onDeleteCase={handleDeleteCase}
        caseCount={getPatientCount()}
        error={error}
        onRetry={clearError}
      />

      {selectedPatient ? (
        <CaseDetailPanel
          patient={selectedPatient}
          stats={patientStats.get(selectedPatient.id)}
          hasInsights={(patientInsights.get(selectedPatient.id) || 0) > 0}
          onUpdatePatient={handleUpdatePatient}
          onConversationSelect={handleConversationSelect}
        />
      ) : (
        <CaseDetailEmptyState />
      )}
    </div>
  )
}
