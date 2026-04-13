"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/providers/auth-provider"
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import {
  savePatient,
  loadPatient,
  getAllPatients,
  subscribeToPatients,
  deletePatient as deletePatientFromFirestore,
  getFichasByPatient,
  getActivePatientMemories,
  listUserSessions,
  saveFicha,
} from "@/lib/firestore-client-storage"
import type { PatientRecord, FichaClinicaState } from "@/types/clinical-types"
import { PatientSummaryBuilder } from "@/lib/patient-summary-builder"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ---------------------------------------------------------------------------
// Clinical stats per patient — aggregated from subcollections
// ---------------------------------------------------------------------------

export interface PatientClinicalStats {
  memoryCount: number
  fichaCount: number
  latestFichaStatus: FichaClinicaState['estado'] | null
  sessionCount: number
}

export interface UsePatientLibraryReturn {
  // State
  patients: PatientRecord[]
  isLoading: boolean
  error: string | null
  searchQuery: string
  filteredPatients: PatientRecord[]
  selectedPatient: PatientRecord | null

  // Clinical stats
  patientStats: Map<string, PatientClinicalStats>
  loadPatientStats: (patientId: string) => Promise<void>

  // Actions
  loadPatients: () => Promise<void>
  createPatient: (patient: Omit<PatientRecord, "id" | "createdAt" | "updatedAt">) => Promise<PatientRecord>
  updatePatient: (patient: PatientRecord) => Promise<void>
  deletePatient: (patientId: string) => Promise<void>
  searchPatients: (query: string) => void
  selectPatient: (patient: PatientRecord | null) => void
  refreshPatientSummary: (patientId: string) => Promise<void>
  // Ficha clinica
  generateFichaClinica: (patientId: string, fichaId: string, sessionState: any) => Promise<void>
  loadFichasClinicas: (patientId: string) => Promise<FichaClinicaState[]>
  fichasClinicas: FichaClinicaState[]
  beginFichaPolling: (patientId: string, intervalMs?: number) => void
  stopFichaPolling: () => void

  // Utilities
  getPatientCount: () => number
  clearError: () => void
}

/**
 * Hook for managing patient library operations
 * Provides CRUD operations and search functionality for patient records
 */
export function usePatientLibrary(): UsePatientLibraryReturn {
  const { psychologistId } = useAuth()
  const [patients, setPatients] = useState<PatientRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null)
  const [fichasClinicas, setFichasClinicas] = useState<FichaClinicaState[]>([])
  const [patientStats, setPatientStats] = useState<Map<string, PatientClinicalStats>>(new Map())
  const fichaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statsLoadedRef = useRef<Set<string>>(new Set())

  // -----------------------------------------------------------------------
  // Real-time subscription to patients collection
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!psychologistId) return

    setIsLoading(true)
    const unsubscribe = subscribeToPatients(psychologistId, (updatedPatients, _hasPendingWrites) => {
      setPatients(updatedPatients)
      setIsLoading(false)

      // Auto-load stats for new patients we haven't fetched yet
      for (const p of updatedPatients) {
        if (!statsLoadedRef.current.has(p.id)) {
          statsLoadedRef.current.add(p.id)
          loadPatientStatsInternal(p.id)
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [psychologistId])

  // -----------------------------------------------------------------------
  // Clinical stats loader (memories, fichas, sessions per patient)
  // -----------------------------------------------------------------------
  const loadPatientStatsInternal = useCallback(async (patientId: string) => {
    if (!psychologistId) return

    try {
      // Fire all three reads in parallel
      const [memories, fichas, sessionResult] = await Promise.all([
        getActivePatientMemories(psychologistId, patientId).catch(() => []),
        getFichasByPatient(psychologistId, patientId).catch(() => []),
        listUserSessions(psychologistId, { pageSize: 200 }).catch(() => ({ items: [] })),
      ])

      const patientSessions = sessionResult.items?.filter(
        (s: { patientId?: string }) => s.patientId === patientId
      ) ?? []

      const latestFicha = fichas.length > 0 ? fichas[0] : null

      const stats: PatientClinicalStats = {
        memoryCount: memories.length,
        fichaCount: fichas.length,
        latestFichaStatus: latestFicha?.estado ?? null,
        sessionCount: patientSessions.length,
      }

      setPatientStats(prev => {
        const next = new Map(prev)
        next.set(patientId, stats)
        return next
      })
    } catch (err) {
      logger.warn(`Failed to load clinical stats for patient ${patientId}:`, err)
    }
  }, [psychologistId])

  const loadPatientStats = useCallback(async (patientId: string) => {
    statsLoadedRef.current.add(patientId)
    await loadPatientStatsInternal(patientId)
  }, [loadPatientStatsInternal])

  /**
   * Internal load patients (uses psychologistId from closure)
   */
  const loadPatientsInternal = useCallback(async () => {
    if (!psychologistId) return

    setIsLoading(true)
    setError(null)

    try {
      const loadedPatients = await getAllPatients(psychologistId)
      setPatients(loadedPatients)
    } catch (err) {
      logger.error("Failed to load patients:", err)
      setError("Failed to load patients")
    } finally {
      setIsLoading(false)
    }
  }, [psychologistId])

  /**
   * Load all patients from storage
   */
  const loadPatients = useCallback(async () => {
    await loadPatientsInternal()
  }, [loadPatientsInternal])

  /**
   * Create a new patient record
   */
  const createPatient = useCallback(async (
    patientData: Omit<PatientRecord, "id" | "createdAt" | "updatedAt">
  ): Promise<PatientRecord> => {
    if (!psychologistId) throw new Error("Not authenticated")

    setError(null)

    try {
      const now = new Date()
      const newPatient: PatientRecord = {
        ...patientData,
        id: generatePatientId(),
        createdAt: now,
        updatedAt: now
      }

      // Generate initial summary cache
      if (!newPatient.summaryCache) {
        newPatient.summaryCache = PatientSummaryBuilder.buildAndCache(newPatient)
      }

      await savePatient(psychologistId, newPatient)
      // No manual refresh needed — real-time subscription updates automatically

      return newPatient
    } catch (err) {
      logger.error("Failed to create patient:", err)
      setError("Failed to create patient")
      throw err
    }
  }, [psychologistId])

  /**
   * Update an existing patient record
   */
  const updatePatient = useCallback(async (patient: PatientRecord) => {
    if (!psychologistId) throw new Error("Not authenticated")

    setError(null)

    try {
      const updatedPatient = {
        ...patient,
        updatedAt: new Date()
      }

      // Regenerate summary cache if needed
      if (!PatientSummaryBuilder.isCacheValid(updatedPatient)) {
        updatedPatient.summaryCache = PatientSummaryBuilder.buildAndCache(updatedPatient)
      }

      await savePatient(psychologistId, updatedPatient)
      // No manual refresh needed — real-time subscription updates automatically

      // Update selected patient if it's the one being updated
      if (selectedPatient?.id === patient.id) {
        setSelectedPatient(updatedPatient)
      }
    } catch (err) {
      logger.error("Failed to update patient:", err)
      setError("Failed to update patient")
      throw err
    }
  }, [psychologistId, selectedPatient])

  /**
   * Delete a patient record
   */
  const handleDeletePatient = useCallback(async (patientId: string) => {
    if (!psychologistId) throw new Error("Not authenticated")

    setError(null)

    try {
      await deletePatientFromFirestore(psychologistId, patientId)
      // No manual refresh needed — real-time subscription updates automatically

      // Clear selection if deleted patient was selected
      if (selectedPatient?.id === patientId) {
        setSelectedPatient(null)
      }
    } catch (err) {
      logger.error("Failed to delete patient:", err)
      setError("Failed to delete patient")
      throw err
    }
  }, [psychologistId, selectedPatient])

  /**
   * Search patients by query
   */
  const searchPatientsHandler = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  /**
   * Select a patient for detailed view or operations
   */
  const selectPatient = useCallback((patient: PatientRecord | null) => {
    setSelectedPatient(patient)
  }, [])

  /**
   * Refresh patient summary cache
   */
  const refreshPatientSummary = useCallback(async (patientId: string) => {
    if (!psychologistId) throw new Error("Not authenticated")

    setError(null)

    try {
      const patient = await loadPatient(psychologistId, patientId)
      if (!patient) {
        throw new Error("Patient not found")
      }

      const newSummaryCache = PatientSummaryBuilder.buildAndCache(patient)
      // Load patient, update summaryCache, then save
      const updatedPatient = {
        ...patient,
        summaryCache: newSummaryCache,
        updatedAt: new Date()
      }
      await savePatient(psychologistId, updatedPatient)
      // No manual refresh needed — real-time subscription updates automatically
    } catch (err) {
      logger.error("Failed to refresh patient summary:", err)
      setError("Failed to refresh patient summary")
      throw err
    }
  }, [psychologistId])

  // --- Ficha clinica API integration ---
  const generateFichaClinica = useCallback(async (patientId: string, fichaId: string, sessionState: any) => {
    if (!psychologistId) throw new Error("Not authenticated")

    try {
      // Cargar la ultima ficha existente para continuidad clinica
      const fichasExistentes = await getFichasByPatient(psychologistId, patientId)
      const ultimaFicha = fichasExistentes
        .filter(f => f.estado === 'completado')
        .sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]

      const { patientForm, conversationSummary, ...sessionStateCore } = sessionState || {}
      const res = await authenticatedFetch(`/api/patients/${encodeURIComponent(patientId)}/ficha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fichaId,
          sessionState: sessionStateCore,
          patientForm,
          conversationSummary,
          previousFichaContent: ultimaFicha?.contenido
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error generando ficha')
      }

      // Persistir inmediatamente un registro local como "generando"
      const placeholder: FichaClinicaState = {
        fichaId,
        pacienteId: patientId,
        estado: 'generando',
        contenido: '',
        version: 1,
        ultimaActualizacion: new Date(),
        historialVersiones: []
      }
      try {
        await saveFicha(psychologistId, patientId, placeholder)
        // Actualizar estado local de fichas para reflejar progreso inmediato
        setFichasClinicas(prev => {
          const map = new Map(prev.map(i => [i.fichaId, i]))
          map.set(placeholder.fichaId, placeholder)
          return Array.from(map.values()).sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())
        })
      } catch (persistErr) {
        logger.warn('No se pudo persistir placeholder de ficha en Firestore:', persistErr)
      }
      // Guardar resultado final en Firestore y estado local
      if (data.ficha) {
        try {
          const completed: FichaClinicaState = {
            ...data.ficha,
            ultimaActualizacion: new Date(data.ficha.ultimaActualizacion)
          }
          await saveFicha(psychologistId, patientId, completed)
          setFichasClinicas(prev => {
            const map = new Map(prev.map(i => [i.fichaId, i]))
            map.set(completed.fichaId, completed)
            return Array.from(map.values()).sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())
          })
        } catch (persistFinalErr) {
          logger.warn('No se pudo persistir ficha final en Firestore:', persistFinalErr)
        }
      }
    } catch (err) {
      logger.error('Failed to generate ficha clinica:', err)
      setError('Failed to generate ficha clinica')
      throw err
    }
  }, [psychologistId])

  const loadFichasClinicas = useCallback(async (patientId: string): Promise<FichaClinicaState[]> => {
    if (!psychologistId) return []

    try {
      const items = await getFichasByPatient(psychologistId, patientId)
      const sorted = (items || []).sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())
      setFichasClinicas(sorted)
      return sorted
    } catch (localErr) {
      logger.warn('No se pudieron cargar fichas:', localErr)
      setError('Failed to load fichas clinicas')
      setFichasClinicas([])
      return []
    }
  }, [psychologistId])

  const beginFichaPolling = useCallback((patientId: string, intervalMs = 3000) => {
    if (fichaPollRef.current) return
    fichaPollRef.current = setInterval(async () => {
      const items = await loadFichasClinicas(patientId)
      const pending = items.some(i => i.estado === 'generando' || i.estado === 'actualizando')
      if (!pending && fichaPollRef.current) {
        clearInterval(fichaPollRef.current)
        fichaPollRef.current = null
      }
    }, intervalMs)
  }, [loadFichasClinicas])

  const stopFichaPolling = useCallback(() => {
    if (fichaPollRef.current) {
      clearInterval(fichaPollRef.current)
      fichaPollRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (fichaPollRef.current) {
        clearInterval(fichaPollRef.current)
      }
    }
  }, [])

  /**
   * Get patient count
   */
  const getPatientCount = useCallback(() => {
    return patients.length
  }, [patients])

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Filter patients based on search query
  const filteredPatients = searchQuery.trim()
    ? patients.filter(patient => {
        const query = searchQuery.toLowerCase()
        return (
          patient.displayName.toLowerCase().includes(query) ||
          patient.tags?.some(tag => tag.toLowerCase().includes(query)) ||
          patient.notes?.toLowerCase().includes(query)
        )
      })
    : patients

  return {
    // State
    patients,
    isLoading,
    error,
    fichasClinicas,
    searchQuery,
    filteredPatients,
    selectedPatient,

    // Clinical stats
    patientStats,
    loadPatientStats,

    // Actions
    loadPatients,
    createPatient,
    updatePatient,
    deletePatient: handleDeletePatient,
    searchPatients: searchPatientsHandler,
    selectPatient,
    refreshPatientSummary,
    generateFichaClinica,
    loadFichasClinicas,
    beginFichaPolling,
    stopFichaPolling,

    // Utilities
    getPatientCount,
    clearError
  }
}

/**
 * Generate a unique patient ID
 */
function generatePatientId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 8)
  return `patient_${timestamp}_${randomPart}`
}

/**
 * Hook for managing a single patient record
 */
export function usePatientRecord(patientId: string | null) {
  const { psychologistId } = useAuth()
  const [patient, setPatient] = useState<PatientRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId || !psychologistId) {
      setPatient(null)
      return
    }

    const loadPatientData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const loadedPatient = await loadPatient(psychologistId, patientId)
        setPatient(loadedPatient)
      } catch (err) {
        logger.error("Failed to load patient:", err)
        setError("Failed to load patient")
      } finally {
        setIsLoading(false)
      }
    }

    loadPatientData()
  }, [patientId, psychologistId])

  return {
    patient,
    isLoading,
    error,
    clearError: () => setError(null)
  }
}
