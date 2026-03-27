"use client"

import { useState, useCallback } from "react"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { PatientSummaryBuilder, PatientContextComposer } from "@/lib/patient-summary-builder"
import { PatientPersistence } from "@/lib/patient-persistence"
import type { PatientRecord, AgentType, ClinicalMode, PatientSessionMeta, FichaClinicaState } from "@/types/clinical-types"
import * as Sentry from "@sentry/nextjs"

interface UsePatientChatSessionReturn {
  startPatientConversation: (patient: PatientRecord, initialMessage?: string) => Promise<string | null>
  isStartingConversation: boolean
  error: string | null
  clearError: () => void
}

/**
 * Hook for managing patient-scoped chat sessions
 * Handles patient context retrieval, first-message composition, and session creation
 */
export function usePatientChatSession(): UsePatientChatSessionReturn {
  const [isStartingConversation, setIsStartingConversation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { createSession, sendMessage, systemState } = useHopeAISystem()
  
  const clearError = useCallback(() => {
    setError(null)
  }, [])
  
  /**
   * Starts a new patient-scoped conversation
   * @param patient - The patient record to create conversation for
   * @param initialMessage - Optional initial user message
   * @returns Session ID if successful, null if failed
   */
  const startPatientConversation = useCallback(async (
    patient: PatientRecord,
    initialMessage?: string
  ): Promise<string | null> => {
    if (isStartingConversation) {
      console.log('⚠️ Patient conversation start already in progress')
      return null
    }
    
    return Sentry.startSpan(
      {
        op: "patient.conversation.start",
        name: "Start Patient-Scoped Conversation",
      },
      async (span) => {
        try {
          setIsStartingConversation(true)
          setError(null)
          
          span.setAttribute("patient.id", patient.id)
          span.setAttribute("patient.has_initial_message", !!initialMessage)
          span.setAttribute("user.id", systemState.userId)
          
          console.log('🏥 Starting patient-scoped conversation for:', patient.displayName)
          
          // Step 1: Create new clinical session with default agent (Socrático)
          const defaultAgent: AgentType = 'socratico'
          const clinicalMode: ClinicalMode = 'clinical_supervision'
          
          const sessionId = await createSession(
            systemState.userId,
            clinicalMode,
            defaultAgent
          )
          
          if (!sessionId) {
            throw new Error('Failed to create clinical session')
          }
          
          console.log('✅ Clinical session created:', sessionId)
          span.setAttribute("session.id", sessionId)
          
          // Step 2: Load latest ficha clínica (if exists) and generate patient context summary
          let patientSummary: string
          let usedFicha = false
          
          try {
            // Cargar fichas clínicas del paciente
            const { getStorageAdapter } = await import("@/lib/server-storage-adapter")
            const storage = await getStorageAdapter()
            const fichas = await storage.getFichasClinicasByPaciente(patient.id)
            
            // Obtener la ficha más reciente completada
            const latestFicha = fichas
            .filter((f: FichaClinicaState) => f.estado === 'completado')
            .sort((a: FichaClinicaState, b: FichaClinicaState) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]
            
            if (latestFicha) {
              console.log(`📋 Found latest ficha clínica for patient (version ${latestFicha.version})`)
              span.setAttribute("ficha.version", latestFicha.version)
              span.setAttribute("ficha.used", true)
              usedFicha = true
            }
            
            // Usar el nuevo método getSummaryWithFicha que prioriza ficha sobre summary
            patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patient, latestFicha)
          } catch (error) {
            console.warn('⚠️ Error loading ficha clínica, using standard summary:', error)
            span.setAttribute("ficha.used", false)
            // Fallback al summary estándar si hay error
            patientSummary = PatientSummaryBuilder.getSummary(patient)
          }
          
          console.log(`📋 Patient summary generated${usedFicha ? ' (using ficha clínica)' : ''}:`, patientSummary.substring(0, 100) + '...')
          span.setAttribute("summary.length", patientSummary.length)
          
          // Step 3: Create session metadata for Orchestrator
          const composer = new PatientContextComposer()
          const sessionMeta: PatientSessionMeta = composer.createSessionMetadata(patient, {
            sessionId,
            userId: systemState.userId,
            clinicalMode,
            activeAgent: defaultAgent
          }, patientSummary)
          
          console.log('🔗 Session metadata created for patient:', sessionMeta.patient.reference)
          
          // Step 4: If there's an initial message, compose and send it
          if (initialMessage && initialMessage.trim()) {
            const { systemPart, userPart } = composer.composeFirstMessageParts(
              patientSummary,
              initialMessage.trim()
            )
            
            console.log('📝 Composing first message with patient context')
            console.log('System part length:', systemPart.length)
            console.log('User part:', userPart.substring(0, 100) + '...')
            
            // Combine both parts to include patient context in the message
            const fullMessage = `${systemPart}\n\n${userPart}`
            console.log('🔗 Full message with patient context length:', fullMessage.length)
            
            // Send the composed message with patient context
            await sendMessage(fullMessage, true, [], sessionMeta)
            
            span.setAttribute("message.sent", true)
            span.setAttribute("message.length", userPart.length)
          } else {
            // No initial message - session is ready for patient-contextualized conversation
            console.log('🎯 Patient-scoped session ready for conversation')
            span.setAttribute("message.sent", false)
          }
          
          // Step 5: Patient access tracking (future enhancement)
          // Note: updatePatientLastAccessed method not yet implemented
          console.log('⏰ Patient conversation started successfully')
          
          console.log('🎉 Patient conversation started successfully')
          return sessionId
          
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error starting patient conversation'
          console.error('❌ Error starting patient conversation:', err)
          
          setError(errorMessage)
          span.recordException(err as Error)
          span.setStatus({ code: 2, message: errorMessage })
          
          return null
        } finally {
          setIsStartingConversation(false)
        }
      }
    )
  }, [isStartingConversation, createSession, sendMessage, systemState.userId])
  
  return {
    startPatientConversation,
    isStartingConversation,
    error,
    clearError
  }
}