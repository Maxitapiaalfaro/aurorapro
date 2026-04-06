"use client"

import { useState, useCallback } from "react"
import { useAuth } from "@/providers/auth-provider"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { PatientSummaryBuilder, PatientContextComposer } from "@/lib/patient-summary-builder"
import { getFichasByPatient } from "@/lib/firestore-client-storage"
import type { PatientRecord, AgentType, ClinicalMode, PatientSessionMeta, FichaClinicaState } from "@/types/clinical-types"
import * as Sentry from "@sentry/nextjs"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

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
  const { psychologistId } = useAuth()
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
      logger.info('Patient conversation start already in progress')
      return null
    }

    if (!psychologistId) {
      setError('Not authenticated')
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

          logger.info('Starting patient-scoped conversation for:', patient.displayName)

          // Step 1: Create new clinical session with default agent (Socratico)
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

          logger.info('Clinical session created:', sessionId)
          span.setAttribute("session.id", sessionId)

          // Step 2: Load latest ficha clinica (if exists) and generate patient context summary
          let patientSummary: string
          let usedFicha = false

          try {
            // Cargar fichas clinicas del paciente from Firestore
            const fichas = await getFichasByPatient(psychologistId, patient.id)

            // Obtener la ficha mas reciente completada
            const latestFicha = fichas
            .filter((f: FichaClinicaState) => f.estado === 'completado')
            .sort((a: FichaClinicaState, b: FichaClinicaState) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]

            if (latestFicha) {
              logger.info(`Found latest ficha clinica for patient (version ${latestFicha.version})`)
              span.setAttribute("ficha.version", latestFicha.version)
              span.setAttribute("ficha.used", true)
              usedFicha = true
            }

            // Usar el nuevo metodo getSummaryWithFicha que prioriza ficha sobre summary
            patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patient, latestFicha)
          } catch (error) {
            logger.warn('Error loading ficha clinica, using standard summary:', error)
            span.setAttribute("ficha.used", false)
            // Fallback al summary estandar si hay error
            patientSummary = PatientSummaryBuilder.getSummary(patient)
          }

          logger.info(`Patient summary generated${usedFicha ? ' (using ficha clinica)' : ''}:`, patientSummary.substring(0, 100) + '...')
          span.setAttribute("summary.length", patientSummary.length)

          // Step 3: Create session metadata for Orchestrator
          const composer = new PatientContextComposer()
          const sessionMeta: PatientSessionMeta = composer.createSessionMetadata(patient, {
            sessionId,
            userId: systemState.userId,
            clinicalMode,
            activeAgent: defaultAgent
          }, patientSummary)

          logger.info('Session metadata created for patient:', sessionMeta.patient.reference)

          // Step 4: If there's an initial message, compose and send it
          if (initialMessage && initialMessage.trim()) {
            const { systemPart, userPart } = composer.composeFirstMessageParts(
              patientSummary,
              initialMessage.trim()
            )

            logger.info('Composing first message with patient context')
            logger.info('System part length:', systemPart.length)
            logger.info('User part:', userPart.substring(0, 100) + '...')

            // Combine both parts to include patient context in the message
            const fullMessage = `${systemPart}\n\n${userPart}`
            logger.info('Full message with patient context length:', fullMessage.length)

            // Send the composed message with patient context
            await sendMessage(fullMessage, true, [], sessionMeta)

            span.setAttribute("message.sent", true)
            span.setAttribute("message.length", userPart.length)
          } else {
            // No initial message - session is ready for patient-contextualized conversation
            logger.info('Patient-scoped session ready for conversation')
            span.setAttribute("message.sent", false)
          }

          // Step 5: Patient access tracking (future enhancement)
          logger.info('Patient conversation started successfully')

          return sessionId

        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error starting patient conversation'
          logger.error('Error starting patient conversation:', err)

          setError(errorMessage)
          span.recordException(err as Error)
          span.setStatus({ code: 2, message: errorMessage })

          return null
        } finally {
          setIsStartingConversation(false)
        }
      }
    )
  }, [isStartingConversation, psychologistId, createSession, sendMessage, systemState.userId])

  return {
    startPatientConversation,
    isStartingConversation,
    error,
    clearError
  }
}
