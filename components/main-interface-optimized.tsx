"use client"

import { useState, useEffect } from "react"
import { ChatInterface } from "@/components/chat-interface"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

import { WorkspaceLayout } from "@/components/workspace-layout"
import { ClinicalCanvas } from "@/components/clinical-canvas"
import { MobileNav } from "@/components/mobile-nav"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useHopeAISystem } from "@/hooks/use-hopeai-system"
import { useSessionMetrics } from "@/hooks/use-session-metrics"
import { useConversationHistory } from "@/hooks/use-conversation-history"
import { usePioneerInvitation } from "@/hooks/use-pioneer-invitation"
// Hook removido: usePatientChatSession - Ya no se usa porque implementamos lazy creation
import { PioneerCircleInvitation } from "@/components/pioneer-circle-invitation"
import { DebugPioneerInvitation } from "@/components/debug-pioneer-invitation"
import type { AgentType, ClinicalFile, PatientRecord, FichaClinicaState } from "@/types/clinical-types"
import { usePatientRecord } from "@/hooks/use-patient-library"
import { PatientContextComposer, PatientSummaryBuilder } from "@/lib/patient-summary-builder"
import * as Sentry from "@sentry/nextjs"
import { getFichasByPatient, saveFicha, deleteFicha } from "@/lib/firestore-client-storage"
import { useAuth } from "@/providers/auth-provider"
import { authenticatedFetch } from '@/lib/authenticated-fetch'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// Componente de métricas de rendimiento (opcional, para desarrollo)
function PerformanceMetrics({ performanceReport }: { performanceReport: any }) {
  if (process.env.NODE_ENV !== 'development') return null

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white text-xs p-2 rounded-lg max-w-xs">
      <div className="font-semibold mb-1">Métricas de Rendimiento</div>
      <div>Sesión: {performanceReport.session.age}min</div>
      <div>Interacciones: {performanceReport.interactions.total}</div>
      <div>Resp. promedio: {Math.round(performanceReport.interactions.averageResponseTime)}ms</div>
      <div>Compresión: {(performanceReport.context.compressionRatio * 100).toFixed(1)}%</div>
      <div>Tokens: {performanceReport.context.tokenCount}</div>
      <div>Ventana: {performanceReport.context.contextWindowUtilization.toFixed(1)}%</div>
    </div>
  )
}

export function MainInterfaceOptimized({ showDebugElements = true }: { showDebugElements?: boolean }) {
  const { psychologistId } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarActiveTab, setSidebarActiveTab] = useState<'conversations' | 'patients'>('conversations')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileNavInitialTab, setMobileNavInitialTab] = useState<'conversations' | 'patients'>('conversations')

  const [pendingFiles, setPendingFiles] = useState<ClinicalFile[]>([])
  // 📁 Accumulator: Track ALL files uploaded during this session so they persist across messages.
  // pendingFiles is cleared after each send; sessionUploadedFiles retains them for fileMetadata.
  const [sessionUploadedFiles, setSessionUploadedFiles] = useState<ClinicalFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isFichaOpen, setIsFichaOpen] = useState(false)
  const [isDebugCardVisible, setIsDebugCardVisible] = useState(true)
  const [fichasClinicasLocal, setFichasClinicasLocal] = useState<FichaClinicaState[]>([])
  const [isFichaLoading, setIsFichaLoading] = useState(false)
  const [isGenerateFichaLoading, setIsGenerateFichaLoading] = useState(false)
  const [fichaAbortController, setFichaAbortController] = useState<AbortController | null>(null)
  const [previousFichaBackup, setPreviousFichaBackup] = useState<FichaClinicaState | null>(null)
  const [lastGeneratedFichaId, setLastGeneratedFichaId] = useState<string | null>(null)
  const [clearPatientSelectionTrigger, setClearPatientSelectionTrigger] = useState(0)
  const [fichaInitialTab, setFichaInitialTab] = useState<"ficha" | "insights">("ficha")
  const isMobile = useMediaQuery("(max-width: 768px)")

  // Usar el sistema HopeAI
  const {
    systemState,
    createSession,
    sendMessage,
    switchAgent,
    getHistory,
    clearError,
    addStreamingResponseToHistory,
    loadSession,
    setSessionMeta,
    resetSystem,
    // Document preview + persistence
    documentPreview,
    documentReady,
    isDocumentPanelOpen,
    closeDocumentPanel,
    openDocumentPanel,
    activeDocument,
    sessionDocuments,
    saveDocumentEdit,
    clearSendError,
  } = useHopeAISystem()

  // Selected patient for current session (must be before any conditional returns)
  const patientId = (systemState.sessionMeta && systemState.sessionMeta.patient?.reference) || null
  const { patient } = usePatientRecord(patientId)

  // Integración de métricas Sentry - Fase 1
  const {
    startSession: startMetricsSession,
    endSession: endMetricsSession,
    updateActivity,
    trackAgentChange,
    getSessionStats
  } = useSessionMetrics({
    userId: systemState.userId ?? '',
    sessionId: systemState.sessionId ?? '',
    currentAgent: systemState.activeAgent
  })

  // Hook para obtener el conteo real de conversaciones (fuente de verdad)
  const { totalCount: totalConversationsCount, loadConversations } = useConversationHistory()

  // Cargar conversaciones para asegurar que tenemos el conteo correcto
  useEffect(() => {
    const userId = systemState.userId
    if (userId) {
      loadConversations(userId)
    }
  }, [systemState.userId, loadConversations])

  // Hook de invitación al Círculo de Pioneros
  const {
    shouldShowInvitation,
    markAsShown,
    recordResponse,
    eligibilityMetrics
  } = usePioneerInvitation({
    userId: systemState.userId ?? '',
    sessionId: systemState.sessionId ?? '',
    currentAgent: systemState.activeAgent,
    isActive: true,
    currentMessageCount: systemState.history?.length || 0, // Usar el count real
    totalConversations: totalConversationsCount || 0 // NUEVA: Pasar el conteo real de conversaciones
  })

  // Hook removido: usePatientChatSession
  // Ya no se necesita porque implementamos lazy creation directamente en handlePatientConversationStart
  const patientConversationError = null
  const clearPatientError = () => {}



  // Estado para controlar la creación de sesión por defecto
  // Eliminado: no crear sesión por defecto; se creará en el primer envío de mensaje
  // const [sessionCreationAttempted, setSessionCreationAttempted] = useState(false)

  // 🔥 CRITICAL FIX: NO recargar archivos desde server storage
  // En serverless, el storage está vacío y esto borra los archivos del cliente
  // Los archivos ya están en IndexedDB del cliente y en pendingFiles state
  // Solo se deben limpiar al enviar mensaje o remover explícitamente
  // useEffect(() => {
  //   const loadPendingFiles = async () => {
  //     if (systemState.sessionId) {
  //       try {
  //         const files = await HopeAISystemSingleton.getPendingFilesForSession(systemState.sessionId)
  //         setPendingFiles(files)  // ← ESTO BORRABA LOS ARCHIVOS EN SERVERLESS
  //       } catch (error) {
  //         logger.error('❌ Error cargando archivos pendientes:', error)
  //       }
  //     } else {
  //       setPendingFiles([])
  //     }
  //   }
  //   loadPendingFiles()
  // }, [systemState.sessionId])
  
  // Crear sesión por defecto si no existe (optimizado para evitar condiciones de carrera)
  // Eliminado: la creación automática de sesión provocaba sesiones vacías
  // useEffect(() => { ... }, [])

  // Responsive sidebar management
  useEffect(() => {
    const handleResize = () => {
      // El sidebar permanece cerrado por defecto en todas las pantallas
      // Solo se cierra automáticamente en móviles si estaba abierto
      if (window.innerWidth < 768 && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [sidebarOpen])

  // Manejar cambio de agente con métricas Sentry
  const handleAgentChange = async (agent: AgentType) => {
    if (systemState.sessionId) {
      logger.info('🔄 Cambiando a agente:', agent)
      
      // Instrumentación Sentry para cambio de agente
      return Sentry.startSpan(
        {
          op: "agent.switch",
          name: `Switch Agent: ${systemState.activeAgent} -> ${agent}`,
        },
        async (span) => {
          try {
            span.setAttribute("agent.from", systemState.activeAgent)
            span.setAttribute("agent.to", agent)
            span.setAttribute("session.id", systemState.sessionId || "unknown_session")
            
            const success = await switchAgent(agent)
            
            if (success) {
              // Tracking de cambio de agente en métricas
              trackAgentChange(systemState.activeAgent, agent)
              
              span.setAttribute("switch.success", true)
              span.setStatus({ code: 1, message: "Agent switch successful" })
              logger.info('✅ Agente cambiado exitosamente a:', agent)
            } else {
              span.setAttribute("switch.success", false)
              span.setStatus({ code: 2, message: "Agent switch failed" })
              logger.error('❌ Error cambiando agente')
            }
            
            return success
          } catch (err) {
            span.setStatus({ code: 2, message: "Agent switch error" })
            Sentry.captureException(err)
            logger.error('❌ Error en cambio de agente:', err)
            return false
          }
        }
      )
    }
    return false
  }

  // Función de envío de mensaje adaptada con métricas
  const handleSendMessage = async (message: string, useStreaming = true) => {
    return Sentry.startSpan(
      {
        op: "message.send",
        name: "Send Message to HopeAI",
      },
      async (span) => {
        try {
          span.setAttribute("message.length", message.length)
          span.setAttribute("message.streaming", useStreaming)
          span.setAttribute("agent.current", systemState.activeAgent)
          span.setAttribute("session.id", systemState.sessionId || "unknown_session")
          span.setAttribute("attached_files_count", pendingFiles.length)
          
          // Validar que todos los archivos estén en estado 'active' antes de enviar
          const nonActiveFiles = pendingFiles.filter(file => 
            (file as any).processingStatus && (file as any).processingStatus !== 'active'
          )
          
          if (nonActiveFiles.length > 0) {
            const fileNames = nonActiveFiles.map(f => f.name).join(', ')
            const errorMessage = `No se puede enviar el mensaje. Los siguientes archivos aún están procesándose: ${fileNames}. Por favor, espera a que terminen de procesarse.`
            logger.warn('⚠️ Archivos no listos:', nonActiveFiles)
            throw new Error(errorMessage)
          }
          
          const startTime = Date.now()
          logger.info('📤 Enviando mensaje HopeAI:', message.substring(0, 50) + '...')
          logger.info('📎 Archivos adjuntos:', pendingFiles.length)
          logger.info('🏥 Contexto del paciente:', {
            hasSessionMeta: !!systemState.sessionMeta,
            patientRef: systemState.sessionMeta?.patient?.reference || 'None',
            sessionId: systemState.sessionMeta?.sessionId || 'None'
          })
          
          // Actualizar actividad del usuario
          updateActivity()

          // CRITICAL: Capturar archivos antes de envío para mostrar inmediatamente en historial
          const attachedFilesForMessage = [...pendingFiles]

          // 📁 Merge current pending files with ALL previously uploaded session files
          // This ensures files from previous messages are available for the conversation
          const allSessionFilesMap = new Map<string, ClinicalFile>()
          for (const f of sessionUploadedFiles) {
            allSessionFilesMap.set(f.id, f)
          }
          for (const f of attachedFilesForMessage) {
            allSessionFilesMap.set(f.id, f) // Current files override if duplicate
          }
          const allSessionFiles = Array.from(allSessionFilesMap.values())

          logger.info('📁 [MainInterface.handleSendMessage] pendingFiles state:', {
            count: pendingFiles.length,
            files: pendingFiles.map(f => ({ id: f.id, name: f.name, status: f.status }))
          })
          logger.info('📁 [MainInterface.handleSendMessage] allSessionFiles (pending + history):', {
            count: allSessionFiles.length,
            files: allSessionFiles.map(f => ({ id: f.id, name: f.name, status: f.status }))
          })

          // CRÍTICO: Pasar el sessionMeta para que el backend pueda cargar la ficha clínica del paciente
          // Pass ALL session files so previous message files are not lost
          const response = await sendMessage(message, useStreaming, allSessionFiles, systemState.sessionMeta)

          if (!response) {
            // sendMessage returned null — error is in systemState.sendError
            span.setAttribute("message.success", false)
            span.setStatus({ code: 2, message: "Message send captured by sendError" })
            return null
          }

          // Limpiar archivos pendientes después del envío exitoso
          setPendingFiles([])

          const responseTime = Date.now() - startTime
          span.setAttribute("message.response_time", responseTime)
          span.setAttribute("message.success", true)
          span.setStatus({ code: 1, message: "Message sent successfully" })

          return response
        } catch (error) {
          span.setAttribute("message.success", false)
          span.setStatus({ code: 2, message: "Message send failed" })
          Sentry.captureException(error)
          logger.error('❌ Error enviando mensaje:', error)
          // Don't re-throw — error is handled inline via sendError
        }
      }
    )
  }

  // Manejar respuesta de invitación al Círculo de Pioneros
  const handlePioneerResponse = (response: 'interested' | 'not_now' | 'not_interested') => {
    recordResponse(response)
    
    // Log para tracking
    logger.info('🎯 Respuesta Pioneer Circle:', {
      userId: systemState.userId,
      sessionId: systemState.sessionId,
      response,
      eligibilityMetrics
    })
    
    // Enviar evento a Sentry para analytics
    Sentry.addBreadcrumb({
      message: 'Pioneer Circle Response',
      category: 'user_engagement',
      data: {
        user_id: systemState.userId,
        session_id: systemState.sessionId,
        response,
        message_count: eligibilityMetrics.messageCount,
        session_duration_minutes: Math.round(eligibilityMetrics.sessionDuration / 1000 / 60)
      }
    })
  }

  // Mostrar invitación cuando sea elegible
  const handleShowPioneerInvitation = () => {
    markAsShown()
    logger.info('📋 Invitación Pioneer Circle mostrada')
  }

  // Manejar inicio de conversación con paciente
  // CRÍTICO: NO crea sesión inmediatamente, solo prepara el contexto
  // La sesión se crea "lazily" cuando el usuario envía el primer mensaje
  const handlePatientConversationStart = async (patient: PatientRecord, initialMessage?: string) => {
    try {
      logger.info('🏥 Preparando conversación con paciente:', patient.displayName)
      
      // Limpiar cualquier error previo
      if (patientConversationError) {
        clearPatientError()
      }
      
      // Limpiar archivos pendientes
      setPendingFiles([])
      setSessionUploadedFiles([])
      
      // CRÍTICO: Resetear sistema para limpiar sesión anterior
      // Esto asegura que no haya sesión activa hasta que se envíe el primer mensaje
      resetSystem()
      
      // Crear el metadata del paciente SIN sessionId (se creará lazily)
      const composer = new PatientContextComposer()

      // Generar resumen del paciente priorizando ficha clínica más reciente si existe
      let patientSummary: string
      try {
        const fichas = psychologistId
          ? await getFichasByPatient(psychologistId, patient.id)
          : []
        const latestFicha = fichas
          .filter((f: FichaClinicaState) => f.estado === 'completado')
          .sort((a: FichaClinicaState, b: FichaClinicaState) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]
        patientSummary = PatientSummaryBuilder.getSummaryWithFicha(patient, latestFicha)
      } catch (e) {
        logger.warn('⚠️ No se pudo cargar ficha clínica, usando resumen estándar:', e)
        patientSummary = PatientSummaryBuilder.getSummary(patient)
      }

      const patientSessionMeta = composer.createSessionMetadata(
        patient,
        {
          sessionId: '', // Vacío - se llenará cuando se cree la sesión al enviar primer mensaje
          userId: systemState.userId,
          clinicalMode: "clinical",
          activeAgent: 'socratico' // Agente por defecto
        },
        patientSummary
      )
      
      // Establecer el contexto del paciente ANTES de crear la sesión
      // Esto permite que ChatInterface muestre el paciente activo
      // y cree la sesión con el contexto correcto al enviar el primer mensaje
      setSessionMeta(patientSessionMeta)
      
      logger.info('✅ Contexto del paciente preparado (sesión se creará al enviar primer mensaje):', patient.displayName)
      
      // Cerrar sidebar en mobile después de seleccionar paciente
      if (isMobile) {
        setSidebarOpen(false)
        setMobileNavOpen(false)
      }
    } catch (error) {
      logger.error('❌ Error en handlePatientConversationStart:', error)
    }
  }

  // Manejar limpieza del contexto del paciente
  // Solo disponible cuando NO hay sesión activa (antes del primer mensaje)
  const handleClearPatientContext = () => {
    logger.info('🧹 Limpiando contexto del paciente')
    // Limpiar archivos pendientes también
    setPendingFiles([])
    // Resetear sistema completo - vuelve a estado inicial sin paciente
    resetSystem()
    // Incrementar trigger para limpiar selección en la librería de pacientes
    setClearPatientSelectionTrigger(prev => prev + 1)
    logger.info('✅ Contexto del paciente removido - listo para conversación general')
  }

  // Función de subida de documentos usando HopeAI System con estado reactivo
  const handleUploadDocument = async (file: File) => {
    // Ensure we have a session ID to associate the upload with
    let sessionIdForUpload: string | null = systemState.sessionId
    if (!sessionIdForUpload) {
      try {
        const userId = systemState.userId
        const mode = systemState.mode || 'clinical_supervision'
        const agent = systemState.activeAgent || 'socratico'
        const sid = await createSession(userId, mode, agent)
        if (!sid) throw new Error('No se pudo crear la sesión para subir documento')
        sessionIdForUpload = sid
      } catch (e) {
        logger.error('❌ No se pudo crear sesión para subir documento', e)
        throw e
      }
    }

    setIsUploading(true) // ⭐ Bloquear chat mientras se sube archivo

    try {
      logger.info('📎 Subiendo documento:', file.name)

      // 🔧 FIX: Llamar al endpoint del servidor para que el archivo se guarde en SQLite
      // ANTES: Llamaba directamente a HopeAISystemSingleton.uploadDocument() que guardaba en IndexedDB (cliente)
      // AHORA: Llama al endpoint /api/upload-document que guarda en SQLite (servidor)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('sessionId', sessionIdForUpload as string)
      formData.append('userId', systemState.userId)

      const response = await authenticatedFetch('/api/upload-document', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.details || errorData.error || 'Error al subir documento')
      }

      const { uploadedFile } = await response.json()

      // Agregar archivo con estado inicial de procesamiento
      setPendingFiles(prev => {
        const newFiles = [...prev, {
          ...uploadedFile,
          processingStatus: uploadedFile.status === 'processed' ? 'active' : 'processing'
        }]
        logger.info('📁 [MainInterface.handleUploadDocument] File added to pendingFiles:', {
          fileId: uploadedFile.id,
          fileName: uploadedFile.name,
          totalPendingFiles: newFiles.length
        })
        return newFiles
      })

      // 📁 Also accumulate in session-level file tracker (survives pendingFiles clear after send)
      setSessionUploadedFiles(prev => {
        // Avoid duplicates by ID
        if (prev.some(f => f.id === uploadedFile.id)) return prev
        return [...prev, uploadedFile]
      })

      // Si el archivo aún está procesando, iniciar polling para verificar estado
      if (uploadedFile.status !== 'processed') {
        pollFileStatus(uploadedFile.id, uploadedFile.geminiFileId)
      }

      logger.info('✅ Documento subido exitosamente:', uploadedFile.name)
      return uploadedFile
    } catch (error) {
      logger.error('❌ Error subiendo documento:', error)
      throw error
    } finally {
      setIsUploading(false) // ⭐ Desbloquear chat
    }
  }

  // Función para verificar el estado de procesamiento de archivos
  const pollFileStatus = async (fileId: string, geminiFileId?: string) => {
    if (!geminiFileId) return
    
    const maxAttempts = 30 // 60 segundos máximo (2s * 30)
    let attempts = 0
    
    const checkStatus = async () => {
      try {
        attempts++
        
        // Verificar estado del archivo en Google GenAI
        const response = await authenticatedFetch('/api/check-file-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geminiFileId })
        })
        
        if (response.ok) {
          const { state } = await response.json()
          
          setPendingFiles(prev => prev.map(file => 
            file.id === fileId 
              ? { ...file, processingStatus: state === 'ACTIVE' ? 'active' : 'processing' }
              : file
          ))
          
          if (state === 'ACTIVE') {
            logger.info('✅ Archivo procesado y listo:', fileId)
            return
          }
          
          if (state === 'FAILED') {
            logger.error('❌ Archivo falló en procesamiento:', fileId)
            setPendingFiles(prev => prev.map(file => 
              file.id === fileId 
                ? { ...file, processingStatus: 'error' }
                : file
            ))
            return
          }
        }
        
        // Continuar polling si no ha alcanzado el máximo de intentos
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000) // Verificar cada 2 segundos
        } else {
          logger.warn('⚠️ Timeout verificando estado del archivo:', fileId)
          setPendingFiles(prev => prev.map(file => 
            file.id === fileId 
              ? { ...file, processingStatus: 'timeout' }
              : file
          ))
        }
      } catch (error) {
        logger.error('❌ Error verificando estado del archivo:', error)
        setPendingFiles(prev => prev.map(file => 
          file.id === fileId 
            ? { ...file, processingStatus: 'error' }
            : file
        ))
      }
    }
    
    // Iniciar verificación después de 1 segundo
    setTimeout(checkStatus, 1000)
  }

  // Función para remover archivos pendientes
  const handleRemoveFile = (fileId: string) => {
    setPendingFiles(prev => prev.filter(file => file.id !== fileId))
  }

  // Handle new conversation - Delegado completamente al Sidebar para evitar duplicación
  const handleNewConversation = async () => {
    // La lógica de creación de sesión se maneja completamente en el Sidebar
    // para evitar la creación duplicada de sesiones
    logger.info('🔄 Main: Delegando creación de nueva conversación al Sidebar')
  }

  // Handle conversation selection from history
  const handleConversationSelect = async (sessionId: string) => {
    try {
      logger.info('🔄 Cargando conversación desde historial:', sessionId)
      // Clear file state when switching sessions
      setPendingFiles([])
      setSessionUploadedFiles([])
      const success = await loadSession(sessionId)
      if (success) {
        logger.info('✅ Conversación cargada exitosamente')
        // Close sidebar and mobile nav on mobile after selecting conversation
        if (isMobile) {
          setSidebarOpen(false)
          setMobileNavOpen(false) // Also close mobile nav
        }
      } else {
        logger.error('❌ Error cargando la conversación')
      }
    } catch (err) {
      logger.error('❌ Error al cargar conversación:', err)
    }
  }

  // Crear objeto de sesión compatible con ChatInterface.
  // Importante: crear el objeto incluso cuando sessionId es null pero hay mensajes en el historial,
  // para que los mensajes optimistas del usuario se muestren ANTES de que se resuelva createSession().
  const compatibleSession = (systemState.sessionId || systemState.history.length > 0) ? {
    sessionId: systemState.sessionId || 'pending',
    userId: systemState.userId,
    mode: systemState.mode,
    activeAgent: systemState.activeAgent,
    history: systemState.history, // Usar directamente systemState.history para reactividad
    metadata: {
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalTokens: systemState.history.length * 100, // Estimación aproximada
      fileReferences: []
    },
    clinicalContext: {
      sessionType: systemState.mode,
      confidentialityLevel: 'high' as const
    }
  } : null

  // Estados de carga y error
  if (!systemState.isInitialized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background animate-in fade-in duration-300">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground/80">Inicializando HopeAI System...</p>
          <p className="text-sm text-foreground/60 mt-2">Cargando contexto y configuraciones avanzadas</p>
        </div>
      </div>
    )
  }

  const handleGenerateFichaFromChat = async () => {
    // Crear AbortController para permitir cancelación
    const abortController = new AbortController()
    setFichaAbortController(abortController)
    
    try {
      setIsGenerateFichaLoading(true)
      if (!systemState.sessionId || !patient) return
      
      // Cargar la última ficha existente para continuidad clínica
      const fichasExistentes = psychologistId
        ? await getFichasByPatient(psychologistId, patient.id)
        : []
      const ultimaFicha = fichasExistentes
        .filter(f => f.estado === 'completado')
        .sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())[0]
      
      // Guardar backup de la última ficha para permitir reversión
      setPreviousFichaBackup(ultimaFicha || null)
      
      const sessionState = {
        sessionId: systemState.sessionId,
        userId: systemState.userId,
        mode: systemState.mode,
        activeAgent: systemState.activeAgent,
        history: systemState.history,
        metadata: { createdAt: new Date(), lastUpdated: new Date(), totalTokens: 0, fileReferences: [] },
        clinicalContext: {
          patientId: patient.id,
          supervisorId: undefined,
          sessionType: systemState.mode,
          confidentialityLevel: patient.confidentiality?.accessLevel || 'medium'
        }
      }
      const patientForm = {
        displayName: patient.displayName,
        demographics: patient.demographics,
        tags: patient.tags,
        notes: patient.notes,
        confidentiality: patient.confidentiality
      }
      const conversationSummary = systemState.history.slice(-6).map(m => `${m.role === 'user' ? 'Paciente' : 'Modelo'}: ${m.content}`).join('\n')
      const fichaId = `ficha_${patient.id}_${Date.now()}`

      const res = await authenticatedFetch(`/api/patients/${encodeURIComponent(patient.id)}/ficha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fichaId, 
          sessionId: systemState.sessionId, 
          sessionState, 
          patientForm, 
          conversationSummary,
          previousFichaContent: ultimaFicha?.contenido // Incluir ficha anterior para continuidad
        }),
        signal: abortController.signal // Permitir cancelación
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error generando ficha clínica')
      }
      // Persist to Firestore
      if (data.ficha && psychologistId) {
        await saveFicha(psychologistId, patient.id, {
          ...data.ficha,
          ultimaActualizacion: new Date(data.ficha.ultimaActualizacion)
        })
        // Guardar ID de la ficha recién generada para permitir descarte
        setLastGeneratedFichaId(fichaId)
      }
      await refreshFichaList()
      setIsFichaOpen(true)
    } catch (err: any) {
      // Diferenciar cancelación de otros errores
      if (err.name === 'AbortError') {
        logger.info('✋ Generación de ficha clínica cancelada por el usuario')
      } else {
        logger.error('❌ Error generando ficha clínica desde chat:', err)
      }
    } finally {
      setIsGenerateFichaLoading(false)
      setFichaAbortController(null)
    }
  }

  const handleCancelFichaGeneration = () => {
    if (fichaAbortController) {
      fichaAbortController.abort()
      logger.info('🛑 Cancelando generación de ficha clínica...')
    }
  }

  const handleDiscardFichaAndRevert = async () => {
    if (!patient || !lastGeneratedFichaId || !psychologistId) return

    try {
      // Eliminar la ficha recién generada de Firestore
      await deleteFicha(psychologistId, patient.id, lastGeneratedFichaId)

      // Si había una ficha anterior, asegurarse de que esté en Firestore
      if (previousFichaBackup) {
        await saveFicha(psychologistId, patient.id, previousFichaBackup)
      }
      
      // Refrescar la lista
      await refreshFichaList()
      
      // Limpiar estados
      setLastGeneratedFichaId(null)
      setPreviousFichaBackup(null)
      
      logger.info('↩️ Ficha descartada, revertida a la versión anterior')
    } catch (err) {
      logger.error('❌ Error descartando ficha:', err)
    }
  }

  const handleOpenFichaFromChat = async (tab: "ficha" | "insights" = "ficha") => {
    try {
      setIsFichaLoading(true)
      await refreshFichaList()
      setFichaInitialTab(tab)
      setIsFichaOpen(true)
    } finally {
      setIsFichaLoading(false)
    }
  }

  const refreshFichaList = async () => {
    if (!patient || !psychologistId) return
    try {
      const items = await getFichasByPatient(psychologistId, patient.id)
      const sorted = (items || []).sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())
      setFichasClinicasLocal(sorted)
    } catch (e) {
      logger.error('Error loading fichas clínicas:', e)
    }
  }

  if (systemState.error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-destructive mb-4">Error: {systemState.error}</div>
          <div className="space-x-2">
            <Button
              onClick={clearError}
              variant="outline"
            >
              Limpiar Error
            </Button>
            <Button
              onClick={() => window.location.reload()}
            >
              Reiniciar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] h-[100dvh] md:h-screen overflow-hidden bg-background font-sans animate-in fade-in duration-500">
      {!isMobile && (
        <Sidebar
          isOpen={sidebarOpen} 
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeTab={sidebarActiveTab}
          onActiveTabChange={setSidebarActiveTab}
          userId={systemState.userId}
          createSession={createSession}
          onConversationSelect={handleConversationSelect}
          onPatientConversationStart={handlePatientConversationStart}
          onClearPatientContext={handleClearPatientContext}
          clearPatientSelectionTrigger={clearPatientSelectionTrigger}
          onNewChat={() => {
            // Reset local pending UI state and HopeAI system
            setPendingFiles([])
            setSessionUploadedFiles([])
            // Clear HopeAI state so ChatInterface shows welcome and first send lazily creates a session
            resetSystem()
          }}
        />
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          onHistoryToggle={() => setMobileNavOpen(true)} 
          sessionMeta={systemState.sessionMeta}
          onClearPatientContext={handleClearPatientContext}
          hasActiveSession={!!systemState.sessionId}
        />

        {isMobile && (
          <MobileNav 
            userId={systemState.userId}
            createSession={createSession}
            onConversationSelect={handleConversationSelect}
            isOpen={mobileNavOpen}
            onOpenChange={(open) => {
              setMobileNavOpen(open)
              if (!open) {
                // Reset to conversations tab when closing
                setMobileNavInitialTab('conversations')
              }
            }}
            onPatientConversationStart={handlePatientConversationStart}
            onClearPatientContext={handleClearPatientContext}
            clearPatientSelectionTrigger={clearPatientSelectionTrigger}
            onNewChat={() => {
              setPendingFiles([])
              setSessionUploadedFiles([])
              resetSystem()
            }}
            initialTab={mobileNavInitialTab}
          />
        )}

        <main className="flex-1 flex overflow-hidden">
          <WorkspaceLayout
            isMobile={isMobile}
            hasCanvasContent={!!(documentPreview || documentReady) || (!!patient && isFichaOpen)}
            chatPanel={
              <ChatInterface
                activeAgent={systemState.activeAgent}
                isProcessing={systemState.isLoading}
                isUploading={isUploading}
                currentSession={compatibleSession}
                sendMessage={handleSendMessage}
                uploadDocument={handleUploadDocument}
                addStreamingResponseToHistory={addStreamingResponseToHistory}
                pendingFiles={pendingFiles}
                onRemoveFile={handleRemoveFile}
                transitionState={systemState.transitionState}
                routingInfo={systemState.routingInfo}
                reasoningBullets={systemState.reasoningBullets}
                processingStatus={systemState.processingStatus}
                onGenerateFichaClinica={patient ? handleGenerateFichaFromChat : undefined}
                onCancelFichaGeneration={handleCancelFichaGeneration}
                onDiscardFicha={lastGeneratedFichaId ? handleDiscardFichaAndRevert : undefined}
                onOpenFichaClinica={patient ? handleOpenFichaFromChat : undefined}
                onOpenPatientLibrary={() => {
                  if (isMobile) {
                    setMobileNavInitialTab('patients')
                    setMobileNavOpen(true)
                  } else {
                    setSidebarActiveTab('patients')
                    if (!sidebarOpen) {
                      setSidebarOpen(true)
                    }
                  }
                }}
                hasExistingFicha={(fichasClinicasLocal && fichasClinicasLocal.length > 0) || false}
                fichaLoading={isFichaLoading}
                generateLoading={isGenerateFichaLoading}
                canRevertFicha={!!lastGeneratedFichaId && !!previousFichaBackup}
                sendError={systemState.sendError}
                onClearSendError={clearSendError}
              />
            }
            canvasPanel={
              <ClinicalCanvas
                documentPreview={documentPreview}
                documentReady={documentReady}
                isDocumentPanelOpen={isDocumentPanelOpen}
                onCloseDocumentPanel={closeDocumentPanel}
                onOpenDocumentPanel={openDocumentPanel}
                onSaveDocumentEdit={saveDocumentEdit}
                patient={patient ?? null}
                isFichaOpen={isFichaOpen}
                onFichaOpenChange={setIsFichaOpen}
                fichasClinicas={fichasClinicasLocal}
                onRefreshFichas={refreshFichaList}
                onGenerateFicha={handleGenerateFichaFromChat}
                isGeneratingFicha={isGenerateFichaLoading}
                onCancelFichaGeneration={handleCancelFichaGeneration}
                canRevertFicha={!!lastGeneratedFichaId && !!previousFichaBackup}
                onRevertFicha={handleDiscardFichaAndRevert}
                fichaInitialTab={fichaInitialTab}
              />
            }
          />
        </main>
      </div>

      {shouldShowInvitation && (
        <PioneerCircleInvitation
          isOpen={shouldShowInvitation}
          onClose={handleShowPioneerInvitation}
          onResponse={handlePioneerResponse}
          userMetrics={{
            messageCount: eligibilityMetrics.messageCount,
            sessionDuration: eligibilityMetrics.sessionDuration
          }}
          currentAgent={systemState.activeAgent}
        />
      )}

      {systemState.sessionId && process.env.NODE_ENV === 'development' && showDebugElements && isDebugCardVisible && (
        <div className="fixed bottom-4 right-4 bg-card text-card-foreground p-2 rounded-lg shadow-lg text-xs border border-border">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold">Debug Info</div>
            <button
              onClick={() => setIsDebugCardVisible(false)}
              className="hover:bg-muted rounded p-0.5 transition-colors"
              aria-label="Close debug card"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div>Sesión: {systemState.sessionId}</div>
          <div>Agente: {systemState.activeAgent}</div>
          <div>Mensajes: {systemState.history.length}</div>
          {systemState.routingInfo && (
            <div>Intent: {systemState.routingInfo.detectedIntent}</div>
          )}
        </div>
      )}
    </div>
  )
}