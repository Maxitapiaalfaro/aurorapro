"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PaperPlaneRightIcon, PaperclipIcon, MicrophoneIcon, MicrophoneSlashIcon, UserIcon, LightningIcon, CaretDownIcon, BrainIcon, MagnifyingGlassIcon, StethoscopeIcon, BookOpenIcon, ArrowsOutIcon, ArrowsInIcon, FileTextIcon, CopyIcon, CheckIcon, ThumbsUpIcon, ThumbsDownIcon, CaretRightIcon, FoldersIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import type { AgentType, ChatState, ClinicalFile, ReasoningBullet } from "@/types/clinical-types"
import { VoiceInputButton, VoiceStatus } from "@/components/voice-input-button"
import { useSpeechToText } from "@/hooks/use-speech-to-text"
import { GeminiVoiceButton } from "@/components/gemini-voice-button"
import { VoiceTranscriptionOverlay } from "@/components/voice-transcription-overlay"
import { VoiceRecordingOverlay } from "@/components/voice-recording-overlay"
import { MarkdownRenderer, StreamingMarkdownRenderer } from "@/components/markdown-renderer"
import { getAgentVisualConfig, getAgentVisualConfigSafe } from "@/config/agent-visual-config"
import { trackMessage } from "@/lib/sentry-metrics-tracker"
import { parseMarkdown } from "@/lib/markdown-parser"
import { toast } from "@/hooks/use-toast"
import { FileUploadButton } from "@/components/file-upload-button"
import { MessageFileAttachments } from "@/components/message-file-attachments"
import { getFilesByIds } from "@/lib/hopeai-system"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import * as Sentry from "@sentry/nextjs"
import type { TransitionState } from "@/hooks/use-hopeai-system"
import { ReasoningBullets } from "@/components/reasoning-bullets"
import type { ReasoningBulletsState } from "@/types/clinical-types"
import { useDisplayPreferences, getFontSizeClass, getMessageWidthClass, getMessageSpacingClass, getChatContainerWidthClass } from "@/providers/display-preferences-provider"
import { motion, AnimatePresence } from "framer-motion"
import { useUIPreferences } from "@/hooks/use-ui-preferences"
import { DevMetricsIndicator } from "@/components/dev-metrics-indicator"
import { DevMessageMetrics } from "@/components/dev-message-metrics"

interface ChatInterfaceProps {
  activeAgent: AgentType
  isProcessing: boolean
  isUploading?: boolean
  currentSession: ChatState | null
  sendMessage: (message: string, useStreaming?: boolean, attachedFiles?: ClinicalFile[]) => Promise<any>
  uploadDocument: (file: File) => Promise<any>
  addStreamingResponseToHistory?: (
    responseContent: string,
    agent: AgentType,
    groundingUrls?: Array<{title: string, url: string, domain?: string}>,
    reasoningBulletsForThisResponse?: ReasoningBullet[]
  ) => Promise<void>
  pendingFiles?: ClinicalFile[]
  onRemoveFile?: (fileId: string) => void
  transitionState?: TransitionState
  routingInfo?: {
    detectedIntent: string
    targetAgent: AgentType
    confidence: number
    extractedEntities: any[]
  }
  onGenerateFichaClinica?: () => void
  onCancelFichaGeneration?: () => void
  onDiscardFicha?: () => void
  onOpenFichaClinica?: (tab?: "ficha" | "insights") => void
  onOpenPatientLibrary?: () => void
  hasExistingFicha?: boolean
  fichaLoading?: boolean
  generateLoading?: boolean
  canRevertFicha?: boolean
  reasoningBullets?: ReasoningBulletsState
}

// Configuración de agentes ahora centralizada en agent-visual-config.ts

// Componente para el botón deshabilitado de Ficha Clínica con tooltip
function FichaClinicaDisabledButton({ 
  onOpenPatientLibrary, 
  config 
}: { 
  onOpenPatientLibrary?: () => void
  config: any 
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window)
  }, [])

  return (
    <div 
      className="relative"
      onMouseEnter={() => !isTouchDevice && setShowTooltip(true)}
      onMouseLeave={() => !isTouchDevice && setShowTooltip(false)}
    >
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          "h-10 md:h-12 px-3 w-auto", 
          config.ghostButton.hoverBg, 
          config.ghostButton.text,
          isTouchDevice ? "opacity-100" : "opacity-50 cursor-not-allowed"
        )}
        disabled={!isTouchDevice}
        onClick={() => isTouchDevice && setShowTooltip(!showTooltip)}
        onTouchStart={(e) => {
          e.preventDefault()
          setShowTooltip(!showTooltip)
        }}
        title={!isTouchDevice ? "Crea o selecciona un paciente para acceder a la Ficha Clínica" : undefined}
      >
        <span className="text-sm font-medium">Ficha Clínica</span>
      </Button>
      
      {/* Puente invisible para mantener hover activo en desktop */}
      {showTooltip && (
        <div className="hidden md:block absolute top-full left-0 right-0 h-3 z-40" />
      )}
      
      {/* Tooltip Popover */}
      {showTooltip && (
        <div 
          className="absolute bottom-full left-0 mb-0.5 z-50"
          onMouseEnter={() => !isTouchDevice && setShowTooltip(true)}
        >
          {/* Popover Card - Light Academia Palette con acento amarillo */}
          <div className="relative bg-card/95 backdrop-blur-2xl border-2 border-border/80 rounded-2xl shadow-[0_20px_70px_-10px_rgba(0,0,0,0.12)] w-[290px] sm:w-[310px] animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-300 paper-noise">
            {/* Subtle warm overlay complementando el amarillo */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] via-transparent to-amber-600/[0.03] rounded-2xl pointer-events-none" />
            
            <div className="relative p-5">
              {/* Header con diseño académico */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-clarity-blue-50 dark:bg-clarity-blue-900/30 ring-1 ring-clarity-blue-200 dark:ring-clarity-blue-700/50 shadow-sm">
                  <FoldersIcon className="h-5 w-5 text-clarity-blue-700 dark:text-clarity-blue-300" weight="bold" />
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="text-base font-sans font-semibold tracking-tight text-foreground mb-0.5">
                    Casos Clínicos
                  </h3>
                  <p className="text-xs text-muted-foreground font-sans">
                    Requiere caso activo
                  </p>
                </div>
              </div>
              
              {/* Divider sutil con tono cálido academia */}
              <div className="h-px bg-gradient-to-r from-transparent via-academic-plum-200/40 dark:via-academic-plum-700/40 to-transparent mb-4" />
              
              {/* Descripción */}
              <p className="text-[13px] text-muted-foreground font-sans leading-relaxed mb-5">
                Selecciona un caso clínico para acceder a herramientas de documentación clínica profesional
              </p>
              
              {/* Action button con verde sage academia */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowTooltip(false);
                  if (onOpenPatientLibrary) {
                    onOpenPatientLibrary();
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold rounded-xl bg-clarity-blue-600 hover:bg-clarity-blue-700 active:bg-clarity-blue-800 text-white shadow-lg shadow-clarity-blue-600/25 ring-1 ring-clarity-blue-600/30 transition-colors"
              >
                <span className="tracking-wide">Abrir Casos Clínicos</span>
                <CaretRightIcon className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
            
            {/* Arrow mejorada para desktop con colores academia */}
            <div className="hidden md:block absolute top-full left-6 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-border"></div>
            <div className="hidden md:block absolute top-full left-6 w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-l-transparent border-r-transparent border-t-card/95 translate-y-[-1px]"></div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ChatInterface({ activeAgent, isProcessing, isUploading = false, currentSession, sendMessage, uploadDocument, addStreamingResponseToHistory, pendingFiles = [], onRemoveFile, transitionState = 'idle', routingInfo, onGenerateFichaClinica, onCancelFichaGeneration, onDiscardFicha, onOpenFichaClinica, onOpenPatientLibrary, hasExistingFicha = false, fichaLoading = false, generateLoading = false, canRevertFicha = false, reasoningBullets }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("")
  const [streamingResponse, setStreamingResponse] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const voiceButtonStopRef = useRef<(() => void) | null>(null)
  const voiceCancelRecordingRef = useRef<(() => void) | null>(null)
  const voiceCancelTranscriptionRef = useRef<(() => void) | null>(null)
  const [forceUpdate, setForceUpdate] = useState(0)
  // 🎨 UX: Estado para indicador de búsqueda académica
  const [academicSearchState, setAcademicSearchState] = useState<'idle' | 'searching' | 'analyzing' | 'complete'>('idle')
  const [academicSearchQuery, setAcademicSearchQuery] = useState("")
  const [academicSearchResults, setAcademicSearchResults] = useState<{
    found: number
    validated: number
  } | null>(null)
  // 📚 Estado para almacenar referencias académicas extraídas de ParallelAI
  const [streamingAcademicReferences, setStreamingAcademicReferences] = useState<Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}>>([])
  // Estado para controlar colapso/expansión de referencias
  const [collapsedReferences, setCollapsedReferences] = useState<Record<string, boolean>>({})
  const academicSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 🔄 Resetear estado del indicador académico cuando cambia la sesión
  useEffect(() => {
    // Limpiar timeout pendiente
    if (academicSearchTimeoutRef.current) {
      clearTimeout(academicSearchTimeoutRef.current)
      academicSearchTimeoutRef.current = null
    }

    setAcademicSearchState('idle')
    setAcademicSearchQuery("")
    setAcademicSearchResults(null)
  }, [currentSession?.sessionId])
  const [autoScroll, setAutoScroll] = useState(true)
  const [visibleMessageCount, setVisibleMessageCount] = useState(20)
  const [streamingGroundingUrls, setStreamingGroundingUrls] = useState<Array<{title: string, url: string, domain?: string}>>([])  
  const [messageFiles, setMessageFiles] = useState<Record<string, ClinicalFile[]>>({})
  const [isInputExpanded, setIsInputExpanded] = useState(false)
  const [capabilityIndex, setCapabilityIndex] = useState(0)
  const [typedHint, setTypedHint] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [viewportInset, setViewportInset] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [previewAgent, setPreviewAgent] = useState<AgentType | null>(null)
  // Collapse states for reasoning bullets - CLOSED BY DEFAULT
  const [areBulletsCollapsed, setAreBulletsCollapsed] = useState(true)
  const [collapsedMessageBullets, setCollapsedMessageBullets] = useState<Record<string, boolean>>({})
  const [shouldScrollOnce, setShouldScrollOnce] = useState(false)

  const toggleExternalBullets = () => setAreBulletsCollapsed(prev => !prev)
  const toggleMessageBullets = (id: string) => setCollapsedMessageBullets(prev => ({ ...prev, [id]: !prev[id] }))

  // Hook para preferencias de visualización
  const { preferences } = useDisplayPreferences()
  const fontSizeClass = getFontSizeClass(preferences.fontSize)
  const messageSpacingClass = getMessageSpacingClass(preferences.messageSpacing)
  const chatContainerWidthClass = getChatContainerWidthClass(preferences.messageWidth)

  // Hook para preferencias de UI (sugerencias dinámicas)
  const { shouldShowDynamicSuggestions, hideDynamicSuggestions, isLoading: isLoadingUIPreferences } = useUIPreferences()

  // MANTENER bullets COLAPSADOS - siempre cerrados por defecto
  useEffect(() => {
    if (isStreaming) {
      setAreBulletsCollapsed(true)
    } else {
      // Mantener colapsado después del streaming (usuario debe hacer clic para ver)
      setAreBulletsCollapsed(true)
    }
  }, [isStreaming])
  // Snapshot of reasoning bullets for current streaming response
  const bulletsSnapshotRef = useRef<ReasoningBullet[]>([])
  
  // Hook para speech-to-text con Chilean Spanish
  const { isListening, interimTranscript, error: speechError} = useSpeechToText({
    language: 'es-CL'
  })

  // Load files for messages with fileReferences
  useEffect(() => {
    const loadMessageFiles = async () => {
      const newMessageFiles: Record<string, ClinicalFile[]> = {}
      
      for (const message of currentSession?.history || []) {
        if (message.fileReferences && message.fileReferences.length > 0) {
          try {
            const files = await getFilesByIds(message.fileReferences)
            if (files.length > 0) {
              newMessageFiles[message.id] = files
            }
          } catch (error) {
            console.error('Error loading files for message:', message.id, error)
          }
        }
      }
      
      setMessageFiles(newMessageFiles)
    }

    loadMessageFiles()
  }, [currentSession?.history])

  // Keep snapshot of reasoning bullets during streaming cycle
  useEffect(() => {
    if (isStreaming && reasoningBullets?.bullets) {
      bulletsSnapshotRef.current = [...reasoningBullets.bullets]
    }
  }, [isStreaming, reasoningBullets?.bullets])

  // Default-collapse reasoning inside the freshly added model message (post-stream commit)
  useEffect(() => {
    const last = currentSession?.history && currentSession.history[currentSession.history.length - 1]
    if (!last) return
    if (last.role === 'model' && last.reasoningBullets && last.reasoningBullets.length > 0) {
      setCollapsedMessageBullets(prev => (prev[last.id] === undefined ? { ...prev, [last.id]: true } : prev))
    }
  }, [currentSession?.history?.length])

  // Auto-scroll ÚNICO cuando el usuario envía un mensaje
  // Solo se activa una vez por mensaje del usuario, no bloquea al usuario durante el streaming
  useEffect(() => {
    if (shouldScrollOnce) {
      // Usar requestAnimationFrame para asegurar que el DOM se actualizó
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      })
      setShouldScrollOnce(false)
    }
  }, [shouldScrollOnce])

  // NO hacer auto-scroll automático durante streaming - el usuario tiene control total del scroll
  // Botón flotante "Ir al final" disponible cuando el usuario no está al fondo

  // Auto-resize textarea when input value changes
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const maxHeight = isInputExpanded ? 400 : 200
      const newHeight = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${newHeight}px`
    }
  }, [inputValue, isInputExpanded])

  // Detect on-screen keyboard via VisualViewport to adjust bottom padding precisely
  useEffect(() => {
    const vv: any = (window as any).visualViewport
    if (!vv) return
    const handler = () => {
      const vh = window.innerHeight
      const inset = Math.max(0, vh - vv.height - (vv.offsetTop || 0))
      setViewportInset(inset)
    }
    handler()
    vv.addEventListener('resize', handler)
    vv.addEventListener('scroll', handler)
    return () => {
      vv.removeEventListener('resize', handler)
      vv.removeEventListener('scroll', handler)
    }
  }, [])

  // Minimal, unobtrusive rotating capability hint for new sessions
  const capabilityHints = [
    // Perspectiva adicional sobre casos difíciles - con contexto suficiente
    'Paciente de 28 años con depresión no responde a TCC tras 8 sesiones. ¿Qué hipótesis alternativas considerar?',
    'Adolescente de 16 años evita hablar de conflictos familiares y desvía con humor. ¿Cómo abordar esta resistencia?',
    'Paciente con ansiedad mejora en sesión pero no aplica técnicas en casa. ¿Qué podría estar bloqueando la generalización?',
    // Cuestionar suposiciones y aprender - con contexto clínico
    'Paciente llega tarde, cancela sesiones y me critica sutilmente. ¿Es transferencia negativa o algo más?',
    'Mujer de 35 años con relaciones inestables y miedo al abandono. ¿Apego ansioso o patrón borderline?',
    '¿Cuál es la diferencia práctica entre reestructuración cognitiva y defusión cognitiva en ACT?',
    // Estructurar sesiones y planificación - casos concretos
    'Primera sesión con adolescente de 15 años derivado por colegio, no quiere estar aquí. ¿Cómo estructurarla?',
    'Paciente con trauma de abuso infantil, lista para procesamiento. ¿Cómo planificar protocolo EMDR en 6 sesiones?',
    'Paciente intelectualiza todo y evita emociones. ¿Qué intervenciones experienciales usar en terapia cognitiva?'
  ]

  // Resetear animación cuando se ocultan las sugerencias
  useEffect(() => {
    if (!shouldShowDynamicSuggestions) {
      setTypedHint("")
      setIsDeleting(false)
      setCapabilityIndex(0)
    }
  }, [shouldShowDynamicSuggestions])

  useEffect(() => {
    const isNewSession = !currentSession?.history || currentSession.history.length === 0
    if (!isNewSession) return
    if (inputValue.trim()) return
    // No iniciar animación hasta que las preferencias estén cargadas
    if (isLoadingUIPreferences) return
    // No animar si el usuario no quiere ver sugerencias
    if (!shouldShowDynamicSuggestions) return

    const fullText = capabilityHints[capabilityIndex]
    let timeoutId: any

    if (!isDeleting) {
      if (typedHint.length < fullText.length) {
        timeoutId = setTimeout(() => {
          setTypedHint(fullText.slice(0, typedHint.length + 1))
        }, 20)
      } else {
        // Calm pause: double the previous pulse total (~2.4s * 2 = ~4.8s)
        timeoutId = setTimeout(() => setIsDeleting(true), 4800)
      }
    } else {
      if (typedHint.length > 0) {
        timeoutId = setTimeout(() => {
          setTypedHint(fullText.slice(0, typedHint.length - 1))
        }, 6)
      } else {
        setIsDeleting(false)
        setCapabilityIndex((i) => (i + 1) % capabilityHints.length)
      }
    }

    return () => clearTimeout(timeoutId)
  }, [capabilityIndex, typedHint, isDeleting, currentSession?.history, inputValue, isLoadingUIPreferences, shouldShowDynamicSuggestions])

  // Manejar scroll manual para detectar si el usuario está en el fondo
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const { scrollTop, scrollHeight, clientHeight } = target
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50
    const isAtTop = scrollTop < 100
    
    setAutoScroll(isAtBottom)
    
    // Cargar más mensajes cuando se llega al top
    if (isAtTop && currentSession?.history && visibleMessageCount < currentSession.history.length) {
      setVisibleMessageCount(prev => Math.min(prev + 10, currentSession.history?.length || 0))
    }
  }

  // Attach scroll listener to the ScrollArea viewport (Radix UI)
  useEffect(() => {
    // Find the Radix ScrollArea viewport element
    const scrollAreaRoot = scrollAreaRef.current
    if (!scrollAreaRoot) {
      return
    }

    const viewport = scrollAreaRoot.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement
    if (!viewport) {
      return
    }

    const handleScrollEvent = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50
      const isAtTop = scrollTop < 100

      setAutoScroll(isAtBottom)
      
      // Cargar más mensajes cuando se llega al top
      if (isAtTop && currentSession?.history && visibleMessageCount < currentSession.history.length) {
        setVisibleMessageCount(prev => Math.min(prev + 10, currentSession.history?.length || 0))
      }
    }

    viewport.addEventListener('scroll', handleScrollEvent)
    
    // Initial check
    handleScrollEvent()
    
    return () => viewport.removeEventListener('scroll', handleScrollEvent)
  }, [currentSession?.history, visibleMessageCount])





  // Función para ir al final de la conversación
  const scrollToBottom = () => {
    setAutoScroll(true)
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handleSendMessage = async (explicitMessage?: string) => {
    console.log('🔄 Frontend: Iniciando envío de mensaje...', {
      hasInput: !!inputValue.trim(),
      hasSession: !!currentSession,
      sessionId: currentSession?.sessionId,
      pendingFilesCount: pendingFiles.length
    })
    
    const messageToSend = (explicitMessage ?? inputValue).trim()
    if (!messageToSend) {
      console.log('❌ Frontend: Envío cancelado - falta input o sesión')
      return
    }

    const message = messageToSend

    // Limpiar input y preparar UI para streaming
    setInputValue("")
    setIsStreaming(true)
    bulletsSnapshotRef.current = []
    setStreamingResponse("")

    // 🔄 Resetear indicador académico para el nuevo mensaje
    console.log('🔄 Frontend: Reseteando indicador académico antes de enviar mensaje', {
      estadoAnterior: academicSearchState,
      resultadosAnteriores: academicSearchResults
    })
    if (academicSearchTimeoutRef.current) {
      clearTimeout(academicSearchTimeoutRef.current)
      academicSearchTimeoutRef.current = null
    }
    setAcademicSearchState('idle')
    setAcademicSearchQuery("")
    setAcademicSearchResults(null)

    // Activar scroll único para mostrar el mensaje del usuario
    setShouldScrollOnce(true)

    console.log('📤 Frontend: Enviando mensaje:', message.substring(0, 50) + '...')

    // Instrumentación Sentry para envío de mensaje desde UI
    return Sentry.startSpan(
      {
        op: "message.ui.send",
        name: "Send Message from Chat Interface",
      },
      async (span) => {
        const startTime = Date.now()
        
        try {
          span.setAttribute("message.length", message.length)
          span.setAttribute("message.agent", activeAgent)
          span.setAttribute("session.id", currentSession?.sessionId)
          span.setAttribute("session.message_count", currentSession?.history?.length || 0)
          span.setAttribute("ui.streaming_enabled", true)
          
          // Tracking de mensaje enviado
          trackMessage({
            agentType: activeAgent,
            messageLength: message.length,
            responseTime: 0, // Se actualizará cuando llegue la respuesta
            isStreaming: true
          })
          
          // CRITICAL: Capturar archivos adjuntos antes del envío para mostrar en historial
          const attachedFilesForMessage = [...pendingFiles]
          
          const response = await sendMessage(message, true, attachedFilesForMessage)
          
          // ARCHITECTURAL FIX: Limpiar estado visual inmediatamente después del envío exitoso
          // Los archivos ya están en el contexto de sesión, no necesitamos mostrarlos más en UI
          console.log('🧹 Frontend: Limpiando estado visual de archivos adjuntos post-envío')
          
          const responseTime = Date.now() - startTime
          
          span.setAttribute("message.response_time", responseTime)
          span.setAttribute("response.received", true)

          // Verificar si la respuesta tiene un AsyncGenerator (streaming)
          if (response && typeof response[Symbol.asyncIterator] === 'function') {

            // Extraer routingInfo si está disponible
            if (response.routingInfo) {
              span.setAttribute("routing.target_agent", response.routingInfo.targetAgent)
              span.setAttribute("routing.confidence", response.routingInfo.confidence || 0)
            }
            
            let fullResponse = ""
            let accumulatedGroundingUrls: Array<{title: string, url: string, domain?: string}> = []
            let accumulatedAcademicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}> = []
            let chunkCount = 0
            const streamingStartTime = Date.now()
            
            try {
              let hasReceivedText = false
              let isAcademicSearch = false // Flag local para tracking
              let lastUpdateTs = 0

              for await (const chunk of response) {
                chunkCount++
                if (chunk.text) {
                  fullResponse += chunk.text
                  const now = Date.now()

                  // 🚀 OPTIMIZACIÓN: Actualizar INMEDIATAMENTE el primer chunk para mejor UX
                  // Luego usar throttle (50ms = ~20fps) para chunks subsecuentes
                  // 20 FPS proporciona streaming muy fluido y responsivo sin comprometer performance
                  const isFirstChunk = chunkCount === 1
                  const shouldUpdate = isFirstChunk || (now - lastUpdateTs > 50)

                  if (shouldUpdate) {
                    setStreamingResponse(fullResponse)
                    lastUpdateTs = now

                    if (isFirstChunk) {
                      console.log('🚀 [ChatInterface] Primer chunk mostrado inmediatamente:', fullResponse.substring(0, 50))
                    }
                  }

                  // 🎯 Cuando empieza el streaming, programar ocultación del indicador
                  if (!hasReceivedText && isAcademicSearch) {
                    hasReceivedText = true

                    // Transición a 'complete' para mostrar brevemente el estado final
                    setAcademicSearchState('complete')

                    // Limpiar timeout anterior si existe
                    if (academicSearchTimeoutRef.current) {
                      clearTimeout(academicSearchTimeoutRef.current)
                    }

                    // Ocultar después de 1.5 segundos (da tiempo a ver el número final)
                    academicSearchTimeoutRef.current = setTimeout(() => {
                      setAcademicSearchState('idle')
                      setAcademicSearchQuery("")
                      setAcademicSearchResults(null)
                      academicSearchTimeoutRef.current = null
                    }, 1500)

                    isAcademicSearch = false // Reset flag
                  }
                }
                // Capturar groundingUrls de los chunks
                if (chunk.groundingUrls && chunk.groundingUrls.length > 0) {
                  accumulatedGroundingUrls = [...accumulatedGroundingUrls, ...chunk.groundingUrls]
                  setStreamingGroundingUrls(accumulatedGroundingUrls)
                }
                // 📚 Capturar referencias académicas de ParallelAI
                if (chunk.metadata?.type === "academic_references" && chunk.metadata.references) {
                  accumulatedAcademicReferences = chunk.metadata.references
                  setStreamingAcademicReferences(accumulatedAcademicReferences)
                }
                // 🎨 UX: Capturar eventos de tool calls
                if (chunk.metadata) {
                  if (chunk.metadata.type === "tool_call_start" &&
                      (chunk.metadata.toolName === "search_academic_literature" ||
                       chunk.metadata.toolName === "search_evidence_for_reflection" ||
                       chunk.metadata.toolName === "search_evidence_for_documentation")) {
                    isAcademicSearch = true // Activar flag local
                    setAcademicSearchState('searching')
                    setAcademicSearchQuery(chunk.metadata.query || "")
                    setAcademicSearchResults(null)
                  } else if (chunk.metadata.type === "tool_call_complete" &&
                             (chunk.metadata.toolName === "search_academic_literature" ||
                              chunk.metadata.toolName === "search_evidence_for_reflection" ||
                              chunk.metadata.toolName === "search_evidence_for_documentation")) {
                    isAcademicSearch = true // Mantener flag activo
                    setAcademicSearchState('analyzing')
                    setAcademicSearchResults({
                      found: chunk.metadata.sourcesFound || 0,
                      validated: chunk.metadata.sourcesValidated || 0
                    })
                  } else if (chunk.metadata.type === "sources_used_by_ai") {
                    // 🎯 Actualizar con el número REAL de fuentes que Gemini usó
                    setAcademicSearchResults(prev => {
                      if (!prev) {
                        return null
                      }
                      return {
                        ...prev,
                        validated: chunk.metadata.sourcesUsed || prev.validated
                      }
                    })

                    // No cambiar estado aquí - el timeout ya está programado
                    // Esto permite que el usuario vea el número actualizado antes de que se oculte
                  }
                }
              }
              
              const streamingDuration = Date.now() - streamingStartTime
              
              // Métricas de streaming
              span.setAttribute("streaming.chunk_count", chunkCount)
              span.setAttribute("streaming.duration", streamingDuration)
              span.setAttribute("streaming.response_length", fullResponse.length)
              span.setAttribute("streaming.grounding_urls_count", accumulatedGroundingUrls.length)
              
              // Tracking adicional de mensaje con métricas de streaming
              trackMessage({
                agentType: response?.routingInfo?.targetAgent || activeAgent,
                messageLength: fullResponse.length,
                responseTime: responseTime,
                isStreaming: true,
                chunkCount,
                groundingUrlsCount: accumulatedGroundingUrls.length
              })

              // Ensure latest content is rendered
              setStreamingResponse(fullResponse)

              // Agregar la respuesta completa al historial
              if (fullResponse.trim() && addStreamingResponseToHistory) {
                try {
                  // Usar el agente de la información de enrutamiento si está disponible,
                  // de lo contrario usar el agente activo actual
                  const responseAgent = response?.routingInfo?.targetAgent || activeAgent
                  // 📚 Combinar groundingUrls y referencias académicas
                  const allReferences = [...accumulatedGroundingUrls, ...accumulatedAcademicReferences]
                  await addStreamingResponseToHistory(fullResponse, responseAgent, allReferences, bulletsSnapshotRef.current)
                } catch (historyError) {
                  console.error('❌ Frontend: Error agregando al historial:', historyError)
                  Sentry.captureException(historyError)
                }
              }
              
              setStreamingResponse("")
              setStreamingGroundingUrls([])
              setStreamingAcademicReferences([])
              setIsStreaming(false)
              // Resetear estado de búsqueda académica si quedó activo
              if (academicSearchState !== 'idle') {
                setAcademicSearchState('idle')
                setAcademicSearchQuery("")
                setAcademicSearchResults(null)
              }
              span.setStatus({ code: 1, message: "Streaming completed successfully" })
            } catch (streamError) {
              console.error('❌ Frontend: Error en streaming:', streamError)
              span.setStatus({ code: 2, message: "Streaming failed" })
              Sentry.captureException(streamError)
              setIsStreaming(false)
              setStreamingResponse("")
            }
          } else if (response && response.text) {
            // Respuesta no streaming o respuesta con function calls procesadas
            console.log('✅ Frontend: Respuesta con texto recibida:', response.text.substring(0, 100) + '...')
            
            span.setAttribute("response.type", "non_streaming")
            span.setAttribute("response.length", response.text.length)
            span.setAttribute("response.grounding_urls_count", response.groundingUrls?.length || 0)
            
            // Si hay function calls, mostrar información adicional
            if (response.functionCalls) {
              console.log('🔧 Frontend: Function calls detectadas:', response.functionCalls.length)
              span.setAttribute("response.function_calls_count", response.functionCalls.length)
            }
            
            // Tracking de mensaje no streaming
            trackMessage({
              agentType: response?.routingInfo?.targetAgent || activeAgent,
              messageLength: response.text.length,
              responseTime: responseTime,
              isStreaming: false,
              groundingUrlsCount: response.groundingUrls?.length || 0,
              functionCallsCount: response.functionCalls?.length || 0
            })
            
            // Agregar la respuesta al historial únicamente si NO fue persistida por el servidor
            if (response.text.trim() && addStreamingResponseToHistory && !response.persistedInServer) {
              try {
                // Usar el agente de la información de enrutamiento si está disponible,
                // de lo contrario usar el agente activo actual
                const responseAgent = response?.routingInfo?.targetAgent || activeAgent
                await addStreamingResponseToHistory(response.text, responseAgent, response.groundingUrls || [])
                console.log('✅ Frontend: Respuesta agregada al historial con agente:', responseAgent)
              } catch (historyError) {
                console.error('❌ Frontend: Error agregando al historial:', historyError)
                Sentry.captureException(historyError)
              }
            }
            
            setIsStreaming(false)
            span.setStatus({ code: 1, message: "Non-streaming response processed successfully" })
          } else {
            console.log('⚠️ Frontend: Respuesta inesperada o nula:', response)
            span.setAttribute("response.type", "unexpected")
            span.setStatus({ code: 2, message: "Unexpected or null response" })
            setIsStreaming(false)
          }
        } catch (error) {
          console.error("❌ Frontend: Error sending message:", error)
          span.setStatus({ code: 2, message: "Message send failed" })
          Sentry.captureException(error)
          setIsStreaming(false)
          setStreamingResponse("")
        }
      }
    )
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        await uploadDocument(file)
      } catch (error) {
        console.error("Error uploading file:", error)
      }
    }
  }

  // Manejar transcripción de voz
  const handleVoiceTranscript = (transcript: string) => {
    setInputValue(prev => {
      const newValue = prev.trim() ? `${prev} ${transcript}` : transcript
      return newValue
    })
  }

  // (removed quick-start tips handler; capabilities are now informational only)

  const handleSelectHint = () => {
    const fullText = capabilityHints[capabilityIndex]
    const cleaned = fullText.replace(/^"(.*)"$/, '$1')
    setInputValue(cleaned)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (textarea) {
        textarea.focus()
        const len = cleaned.length
        textarea.setSelectionRange(len, len)
      }
    })
  }

  const copyMessageContent = async (markdownContent: string, messageId?: string) => {
    const htmlContent = parseMarkdown(markdownContent)

    const fallbackCopyPlainText = (text: string): boolean => {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.top = '0'
        textarea.style.left = '0'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textarea)
        return successful
      } catch {
        return false
      }
    }

    let copied = false
    try {
      const clipboard: any = (navigator as any).clipboard
      const ClipboardItemCtor: any = (window as any).ClipboardItem
      if (clipboard && typeof clipboard.write === 'function' && ClipboardItemCtor) {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' })
        const textBlob = new Blob([markdownContent], { type: 'text/plain' })
        const item = new ClipboardItemCtor({ 'text/html': htmlBlob, 'text/plain': textBlob })
        await clipboard.write([item])
        copied = true
      }
    } catch {
      // ignore and try next method
    }

    if (!copied) {
      try {
        await navigator.clipboard.writeText(markdownContent)
        copied = true
      } catch {
        // fallback for iOS Safari and older browsers
        copied = fallbackCopyPlainText(markdownContent)
      }
    }

    if (copied && messageId) {
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId((id) => (id === messageId ? null : id)), 1500)
    }
  }

  // Available agents for cycling
  const availableAgents: AgentType[] = ["socratico", "clinico", "academico", "orquestador"]
  
  // Cycle to next agent for preview
  const cycleToNextAgent = () => {
    const currentIndex = availableAgents.indexOf(previewAgent || activeAgent)
    const nextIndex = (currentIndex + 1) % availableAgents.length
    setPreviewAgent(availableAgents[nextIndex])
  }

  // Reset preview when tooltip is hidden
  const resetPreview = () => {
    setPreviewAgent(null)
  }

  // Badge always shows active agent, only tooltip shows preview
  const config = getAgentVisualConfig(activeAgent)
  const IconComponent = config.icon
  
  // Tooltip shows preview agent or active agent
  const tooltipAgent = previewAgent || activeAgent
  const tooltipConfig = getAgentVisualConfig(tooltipAgent)
  const TooltipIconComponent = tooltipConfig.icon
  
  // Determine if the latest model message already contains persisted reasoning bullets
  const lastHistoryMessage = currentSession?.history && currentSession.history.length > 0
    ? currentSession.history[currentSession.history.length - 1]
    : undefined
  const lastModelMessageHasBullets = !!(
    lastHistoryMessage?.role === 'model' &&
    ((lastHistoryMessage?.reasoningBullets?.length ?? 0) > 0)
  )

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden font-sans bg-background relative">
      <ScrollArea
        ref={scrollAreaRef}
        className={cn("flex-1 pt-0 overscroll-contain")}
        style={{
          paddingBottom: '0px' // Remove padding to allow content to extend behind input gradient
        }}
      >
        <div className={cn("w-full mx-auto h-full flex flex-col space-y-4 md:space-y-8 pt-1 md:pt-2 pb-32", chatContainerWidthClass)}>
          {/* Indicador de mensajes anteriores */}
          {currentSession?.history && currentSession.history.length > visibleMessageCount && (
            <div className="text-center py-2">
              <div className="text-sm text-mineral-gray-600 bg-ash rounded-lg p-2">
                Mostrando {visibleMessageCount} de {currentSession.history.length} mensajes
                <br />
                <span className="text-xs">Desplázate hacia arriba para cargar más</span>
              </div>
            </div>
          )}

          {/* Welcome greeting with minimal rotating capability hint */}
          {(!currentSession?.history || currentSession.history.length === 0) && (
            <div className="flex-1 min-h-[55svh] md:min-h-[65svh] animate-in fade-in duration-700 ease-out flex flex-col items-center justify-center text-center color-fragment px-2">
              <h1 className="font-sans text-4xl md:text-5xl tracking-tight text-foreground mb-4">
                ¿En qué piensas?
              </h1>
              {!isLoadingUIPreferences && shouldShowDynamicSuggestions && (
                <div className="mt-8 md:mt-12 w-full max-w-3xl mx-auto px-4">
                  <div
                    className="group relative bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-clarity-blue-200 dark:hover:border-clarity-blue-700 hover:shadow-sm transition-all duration-200 flex items-stretch"
                    onClick={handleSelectHint}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectHint() } }}
                  >
                    <div className="flex-1 p-4 md:p-5">
                      <p className="text-base md:text-lg text-foreground font-sans leading-relaxed text-left">
                        {typedHint || '\u00A0'}
                        <span className="inline-block w-0.5 h-[1.2em] bg-clarity-blue-600 dark:bg-clarity-blue-400 ml-0.5 align-text-bottom animate-cursor-blink" style={{ verticalAlign: '-0.1em' }} />
                      </p>
                    </div>
                    {typedHint && (
                      <div className="flex items-center justify-center px-4 border-l border-transparent group-hover:border-border transition-all duration-200">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                          <CopyIcon className="h-3.5 w-3.5" />
                          <span className="font-medium">Usar</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Checkbox "No mostrar de nuevo" */}
                  <div className="mt-4 flex items-center justify-center">
                    <label
                      className="flex items-center gap-2 cursor-pointer group/checkbox"
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-ash text-clarity-blue-600 focus:ring-2 focus:ring-clarity-blue-500 focus:ring-offset-0 cursor-pointer"
                        onChange={(e) => {
                          if (e.target.checked) {
                            hideDynamicSuggestions()
                          }
                        }}
                      />
                      <span className="text-sm text-muted-foreground group-hover/checkbox:text-foreground transition-colors select-none">
                        No mostrar sugerencias de nuevo
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat History - Solo mensajes visibles */}
          {currentSession?.history?.slice(-visibleMessageCount).map((message, index) => {
            // Usar la configuración del agente que generó el mensaje, no el agente activo
            const messageAgentConfig = getAgentVisualConfigSafe(message.agent);
            const MessageIconComponent = messageAgentConfig.icon;
            const isFirstMessage = index === 0;
            
            return (
              <div key={message.id} className={cn(
                "flex items-start justify-start",
                isFirstMessage ? "pt-6" : messageSpacingClass
              )}>
                <div
                  className={cn(
                    "chat-message-bubble relative rounded-lg border ring-1 ring-transparent overflow-hidden w-full min-w-0",
                    fontSizeClass,
                    message.role === "user"
                      ? "text-[hsl(var(--user-bubble-text))] bg-[hsl(var(--user-bubble-bg))] border-[hsl(var(--user-bubble-bg))] shadow-[0_3px_12px_rgba(0,0,0,0.12)]"
                      : `${messageAgentConfig.bgColor} ${messageAgentConfig.borderColor}`,
                  )}
                >
                  {/* Indicador mínimo de archivo adjunto (solo icono) */}
                  {message.role === "user" && (message.fileReferences?.length ?? 0) > 0 && (
                    <div className="absolute top-2 right-2" title="Archivo adjunto">
                      <PaperclipIcon
                        className="w-3 h-3 text-mineral-gray-600/70 hover:text-mineral-gray-800 transition-colors"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Archivo adjunto</span>
                    </div>
                  )}
                  {/* Agent Context Header - Aurora v2.0 Design */}
                  {message.role === "model" && (
                    <div className="px-4 md:px-5 pt-4 pb-3 border-b border-border/30">
                      <div className="flex items-start gap-3">
                        {/* Agent Icon - Larger, more prominent */}
                        <div className={cn(
                          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                          messageAgentConfig.bgColor,
                          "ring-1 ring-inset",
                          messageAgentConfig.borderColor
                        )}>
                          <MessageIconComponent
                            className={cn("w-5 h-5", messageAgentConfig.textColor)}
                            weight="duotone"
                          />
                        </div>

                        {/* Agent Info */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <h3 className={cn(
                              "text-base font-semibold font-sans tracking-tight",
                              messageAgentConfig.textColor
                            )}>
                              {messageAgentConfig.name}
                            </h3>
                            {/* Toggle de bullets para mensajes históricos */}
                            {((message.reasoningBullets?.length ?? 0) > 0) && (
                              <button
                                type="button"
                                onClick={() => toggleMessageBullets(message.id)}
                                className={cn(
                                  "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium rounded-lg transition-all",
                                  "hover:bg-ash text-mineral-gray-600 hover:text-deep-charcoal"
                                )}
                                aria-label={collapsedMessageBullets[message.id] ? 'Expandir razonamiento' : 'Colapsar razonamiento'}
                              >
                                {collapsedMessageBullets[message.id] ? 'Mostrar' : 'Ocultar'}
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground/80 font-sans leading-relaxed">
                            {messageAgentConfig.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Reasoning bullets en mensajes históricos */}
                  {message.role === 'model' && ((message.reasoningBullets?.length ?? 0) > 0) && !collapsedMessageBullets[message.id] && (
                    <div className="p-3 md:p-4">
                      <ReasoningBullets
                        bullets={message.reasoningBullets ?? []}
                        isGenerating={false}
                        showHeader={false}
                        className="text-sm"
                      />
                    </div>
                  )}
                  <div className="p-3 md:p-4 min-w-0 overflow-hidden">
                    <MarkdownRenderer
                      content={message.content}
                      className="leading-relaxed"
                      trusted={message.role === "model"}
                    />
                  </div>
                  {/* Mostrar archivos adjuntos si existen */}
                  {messageFiles[message.id] && messageFiles[message.id].length > 0 && (
                        <div className="p-3 md:p-4 border-t border-border/80">
                          <MessageFileAttachments 
                            files={messageFiles[message.id]} 
                            variant="compact"
                            isUserMessage={message.role === 'user'}
                          />
                        </div>
                      )}
                  {/* Mostrar referencias de grounding si existen */}
                  {message.groundingUrls && message.groundingUrls.length > 0 && (
                    <div className="p-3 md:p-4 border-t border-border/80">
                      <button
                        type="button"
                        onClick={() => setCollapsedReferences(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                        className="w-full text-xs font-sans font-medium text-muted-foreground mb-3 flex items-center gap-2 hover:text-foreground transition-colors"
                      >
                        <BookOpenIcon className="h-4 w-4" weight="duotone" />
                        <span>Referencias ({message.groundingUrls.length})</span>
                        <CaretDownIcon 
                          className={cn(
                            "h-3.5 w-3.5 ml-auto transition-transform duration-200",
                            !collapsedReferences[message.id] && "-rotate-90"
                          )} 
                        />
                      </button>
                      <AnimatePresence>
                        {collapsedReferences[message.id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-2.5">
                              {message.groundingUrls.map((ref: any, index: number) => {
                                // Detectar si es una referencia académica (tiene autores, DOI, journal o year)
                                const isAcademicRef = ref.authors || ref.doi || ref.journal || ref.year
                                
                                return (
                                  <motion.div 
                                    key={index} 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ 
                                      duration: 0.2, 
                                      delay: index * 0.05
                                    }}
                                    className="text-sm font-sans break-words"
                                  >
                                    <a 
                                      href={ref.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "hover:underline inline-flex items-start gap-1.5 group",
                                        isAcademicRef ? "text-academic-plum-600 hover:text-academic-plum-700" : "text-primary"
                                      )}
                                    >
                                      <span className="flex-1">
                                        <span className="font-medium">{index + 1}. {ref.title}</span>
                                        {ref.authors && <span className="text-muted-foreground text-xs block mt-0.5">{ref.authors}</span>}
                                        {(ref.journal || ref.year) && (
                                          <span className="text-muted-foreground text-xs block mt-0.5">
                                            {ref.journal}{ref.journal && ref.year && ', '}{ref.year}
                                          </span>
                                        )}
                                        {ref.doi && (
                                          <span className="text-muted-foreground text-xs block mt-0.5">
                                            DOI: {ref.doi}
                                          </span>
                                        )}
                                        {!isAcademicRef && ref.domain && (
                                          <span className="text-muted-foreground text-xs block mt-0.5">({ref.domain})</span>
                                        )}
                                      </span>
                                      <CaretRightIcon className={cn(
                                        "h-3.5 w-3.5 text-muted-foreground transition-colors flex-shrink-0 mt-0.5",
                                        isAcademicRef ? "group-hover:text-academic-plum-600" : "group-hover:text-primary"
                                      )} />
                                    </a>
                                  </motion.div>
                                )
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                  {/* Copy to clipboard for AI messages */}
                  {message.role === 'model' && (
                    <div className="p-2 md:p-3 border-t border-border/80">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyMessageContent(message.content, message.id)}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-ash text-mineral-gray-600 hover:text-deep-charcoal transition-colors transition-transform active:scale-95 select-none touch-manipulation"
                          aria-label="Copiar contenido"
                          title="Copiar contenido"
                        >
                          {copiedMessageId === message.id ? (
                            <CheckIcon className="h-4 w-4 text-green-600 animate-in fade-in zoom-in-50 duration-150" />
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                        </button>
                        <DevMessageMetrics 
                          sessionId={currentSession?.sessionId || ''} 
                          messageIndex={index} 
                        />
                        <button
                          type="button"
                          onClick={() => { toast({ description: "Gracias por tu feedback." }); }}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-ash text-mineral-gray-600 hover:text-deep-charcoal transition-colors transition-transform active:scale-95 select-none touch-manipulation"
                          aria-label="Me gusta"
                          title="Me gusta"
                        >
                          <ThumbsUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { toast({ description: "Gracias por tu feedback." }); }}
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-ash text-mineral-gray-600 hover:text-deep-charcoal transition-colors transition-transform active:scale-95 select-none touch-manipulation"
                          aria-label="No me gusta"
                          title="No me gusta"
                        >
                          <ThumbsDownIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming Response - aparece inmediatamente cuando comienza isStreaming */}
          {isStreaming && (() => {
            // 🎯 DETERMINAR EL AGENTE REAL que está respondiendo
            const realAgent = routingInfo?.targetAgent || activeAgent
            const realConfig = getAgentVisualConfig(realAgent)
            const RealIconComponent = realConfig.icon
            
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={cn("flex items-start", messageSpacingClass)}
              >
                <motion.div
                  animate={{
                    borderColor: realConfig.borderColor,
                    backgroundColor: realConfig.bgColor
                  }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className={cn("chat-message-bubble relative rounded-lg border w-full min-w-0 overflow-hidden", fontSizeClass, realConfig.bgColor, realConfig.borderColor)}
                >
                  {/* Agent Context Header - Aurora v2.0 Design with Animation */}
                  <div className="px-4 md:px-5 pt-4 pb-3 border-b border-border/30">
                    <div className="flex items-start gap-3">
                      {/* Agent Icon - Animated */}
                      <motion.div
                        key={`agent-icon-${realAgent}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={cn(
                          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                          realConfig.bgColor,
                          "ring-1 ring-inset",
                          realConfig.borderColor
                        )}
                      >
                        <RealIconComponent
                          className={cn("w-5 h-5", realConfig.textColor)}
                          weight="duotone"
                        />
                      </motion.div>

                      {/* Agent Info */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <motion.h3
                            key={`agent-name-${realAgent}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className={cn(
                              "text-base font-semibold font-sans tracking-tight",
                              realConfig.textColor
                            )}
                          >
                            {realConfig.name}
                          </motion.h3>
                          {/* Toggle de bullets en streaming */}
                          {((reasoningBullets?.bullets?.length ?? 0) > 0) && (
                            <button
                              type="button"
                              onClick={() => setAreBulletsCollapsed(prev => !prev)}
                              className={cn(
                                "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium rounded-lg transition-all",
                                "hover:bg-secondary text-muted-foreground hover:text-foreground"
                              )}
                              aria-label={areBulletsCollapsed ? 'Expandir razonamiento' : 'Colapsar razonamiento'}
                            >
                              {areBulletsCollapsed ? 'Mostrar' : 'Ocultar'}
                            </button>
                          )}
                        </div>
                        <motion.p
                          key={`agent-desc-${realAgent}`}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
                          className="text-xs text-muted-foreground/80 font-sans leading-relaxed"
                        >
                          {realConfig.description}
                        </motion.p>
                      </div>
                    </div>
                  </div>
                {/* ⚠️ BULLETS INHABILITADOS: Bullets dentro de streaming deshabilitados para optimizar latencia */}
                {((reasoningBullets?.bullets?.length ?? 0) > 0) && !areBulletsCollapsed && (
                  <div className="px-4 pt-4 pb-2">
                    <ReasoningBullets
                      bullets={reasoningBullets?.bullets ?? []}
                      isGenerating={!!reasoningBullets?.isGenerating}
                      className="w-full"
                      showHeader={false}
                    />
                  </div>
                )}
                {/* Indicador clínico contextual - refleja el proceso REAL según transitionState CON ANIMACIONES */}
                {!streamingResponse && (() => {
                  // Determinar el agente que REALMENTE está respondiendo
                  const respondingAgent = routingInfo?.targetAgent || activeAgent
                  
                  // Mensajes contextuales según la fase real del proceso
                  let statusMessage = ''
                  let statusKey = ''
                  
                  if (transitionState === 'thinking' || transitionState === 'selecting_agent') {
                    statusMessage = 'Evaluando consulta y determinando modalidad de análisis...'
                    statusKey = 'selecting'
                  } else if (transitionState === 'specialist_responding') {
                    // Mostrar el agente que REALMENTE fue seleccionado - mensaje genérico
                    if (respondingAgent === 'socratico') {
                      statusMessage = 'procesando análisis...'
                      statusKey = 'socratico-responding'
                    } else if (respondingAgent === 'clinico') {
                      statusMessage = 'procesando análisis...'
                      statusKey = 'clinico-responding'
                    } else if (respondingAgent === 'academico') {
                      statusMessage = 'procesando análisis...'
                      statusKey = 'academico-responding'
                    } else {
                      statusMessage = 'procesando análisis...'
                      statusKey = 'preparing'
                    }
                  } else {
                    statusMessage = 'Inicializando sistema...'
                    statusKey = 'idle'
                  }
                  
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="p-4 flex items-center gap-3 text-muted-foreground/80"
                    >
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ 
                          duration: 1.2, 
                          repeat: Infinity, 
                          ease: "linear" 
                        }}
                        className="relative flex items-center justify-center w-5 h-5"
                      >
                        <div className="absolute w-full h-full rounded-full border-2 border-muted-foreground/20"></div>
                        <div className="absolute w-full h-full rounded-full border-2 border-t-muted-foreground/60"></div>
                      </motion.div>
                      <motion.span 
                        key={statusKey}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="text-sm font-sans"
                      >
                        {statusMessage}
                      </motion.span>
                    </motion.div>
                  )
                })()}
                {/* Contenido de streaming - solo cuando hay texto */}
                {streamingResponse && (
                  <div className="p-4 min-w-0 overflow-hidden">
                    <StreamingMarkdownRenderer
                      content={streamingResponse}
                      className="text-base leading-relaxed"
                      showTypingIndicator={true}
                    />
                    {/* 📚 Referencias académicas de ParallelAI */}
                    {streamingAcademicReferences.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-border/60">
                        <button
                          type="button"
                          onClick={() => setCollapsedReferences(prev => ({ ...prev, 'streaming': !prev['streaming'] }))}
                          className="w-full text-xs font-sans font-medium text-muted-foreground mb-3 flex items-center gap-2 hover:text-foreground transition-colors"
                        >
                          <BookOpenIcon className="h-4 w-4" weight="duotone" />
                          <span>Referencias Académicas ({streamingAcademicReferences.length})</span>
                          <CaretDownIcon 
                            className={cn(
                              "h-3.5 w-3.5 ml-auto transition-transform duration-200",
                              !collapsedReferences['streaming'] && "-rotate-90"
                            )} 
                          />
                        </button>
                        <AnimatePresence>
                          {collapsedReferences['streaming'] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-2.5">
                                {streamingAcademicReferences.map((ref, index) => (
                                  <motion.div 
                                    key={index} 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ 
                                      duration: 0.2, 
                                      delay: index * 0.05
                                    }}
                                    className="text-sm font-sans break-words"
                                  >
                                    <a 
                                      href={ref.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer" 
                                      className="text-academic-plum-600 hover:text-academic-plum-700 hover:underline inline-flex items-start gap-1.5 group"
                                    >
                                      <span className="flex-1">
                                        <span className="font-medium">{index + 1}. {ref.title}</span>
                                        {ref.authors && <span className="text-muted-foreground text-xs block mt-0.5">{ref.authors}</span>}
                                        {(ref.journal || ref.year) && (
                                          <span className="text-muted-foreground text-xs block mt-0.5">
                                            {ref.journal}{ref.journal && ref.year && ', '}{ref.year}
                                          </span>
                                        )}
                                        {ref.doi && (
                                          <span className="text-muted-foreground text-xs block mt-0.5">
                                            DOI: {ref.doi}
                                          </span>
                                        )}
                                      </span>
                                      <CaretRightIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-academic-plum-600 transition-colors flex-shrink-0 mt-0.5" />
                                    </a>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}

                {/* 🎨 UX: Indicador de búsqueda académica - Diseño Aurora elegante optimizado para mobile */}
                {academicSearchState !== 'idle' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="mx-3 sm:mx-4 mb-2 sm:mb-3"
                  >
                    <div className="relative px-3 py-2.5 sm:px-4 sm:py-3.5 rounded-lg bg-gradient-to-br from-academic-plum-50/80 to-academic-plum-50/40 border border-academic-plum-200/60 shadow-sm paper-noise backdrop-blur-sm">
                      {/* Sutil brillo superior */}
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-academic-plum-300/40 to-transparent" />

                      <div className="flex items-start gap-2.5 sm:gap-3.5">
                        {/* Icono con animación elegante */}
                        <div className="flex-shrink-0 mt-0.5">
                          {academicSearchState === 'searching' && (
                            <motion.div
                              animate={{
                                opacity: [0.5, 1, 0.5],
                                scale: [0.95, 1, 0.95]
                              }}
                              transition={{
                                duration: 2.5,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }}
                              className="relative"
                            >
                              <div className="absolute inset-0 bg-academic-plum-400/20 rounded-full blur-md" />
                              <MagnifyingGlassIcon className="relative h-4 w-4 sm:h-5 sm:w-5 text-academic-plum-600" weight="duotone" />
                            </motion.div>
                          )}
                          {academicSearchState === 'analyzing' && (
                            <motion.div
                              animate={{
                                opacity: [0.6, 1, 0.6],
                                rotate: [0, 5, -5, 0]
                              }}
                              transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: "easeInOut"
                              }}
                              className="relative"
                            >
                              <div className="absolute inset-0 bg-academic-plum-500/20 rounded-full blur-md" />
                              <BrainIcon className="relative h-4 w-4 sm:h-5 sm:w-5 text-academic-plum-700" weight="duotone" />
                            </motion.div>
                          )}
                          {academicSearchState === 'complete' && (
                            <motion.div
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              className="relative"
                            >
                              <div className="absolute inset-0 bg-academic-plum-400/20 rounded-full blur-sm" />
                              <CheckIcon className="relative h-4 w-4 sm:h-5 sm:w-5 text-academic-plum-600" weight="bold" />
                            </motion.div>
                          )}
                        </div>

                        {/* Contenido textual con tipografía refinada y optimizado para mobile */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <motion.div
                            key={academicSearchState}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="text-xs sm:text-sm font-sans font-medium text-academic-plum-900 leading-relaxed tracking-tight"
                          >
                            {academicSearchState === 'searching' && (
                              <>
                                <span className="hidden sm:inline">Consultando bases de datos académicas</span>
                                <span className="sm:hidden">Consultando bases académicas</span>
                              </>
                            )}
                            {academicSearchState === 'analyzing' && academicSearchResults !== null && (
                              <>
                                {academicSearchResults.found === academicSearchResults.validated ? (
                                  // Caso simple: todas las fuentes fueron validadas
                                  <>
                                    <span className="hidden sm:inline">Sintetizando evidencia de {academicSearchResults.validated} {academicSearchResults.validated === 1 ? 'fuente' : 'fuentes'}</span>
                                    <span className="sm:hidden">Sintetizando {academicSearchResults.validated} {academicSearchResults.validated === 1 ? 'fuente' : 'fuentes'}</span>
                                  </>
                                ) : (
                                  // Caso con filtrado: mostrar el proceso inteligente
                                  <>
                                    <span className="hidden sm:inline">{academicSearchResults.validated} {academicSearchResults.validated === 1 ? 'fuente validada' : 'fuentes validadas'} de {academicSearchResults.found} {academicSearchResults.found === 1 ? 'encontrada' : 'encontradas'}</span>
                                    <span className="sm:hidden">{academicSearchResults.validated} de {academicSearchResults.found} {academicSearchResults.found === 1 ? 'fuente' : 'fuentes'}</span>
                                  </>
                                )}
                              </>
                            )}
                            {academicSearchState === 'complete' && academicSearchResults !== null && (
                              <>
                                <span className="hidden sm:inline">Sintetizando evidencia de {academicSearchResults.validated} {academicSearchResults.validated === 1 ? 'fuente' : 'fuentes'}</span>
                                <span className="sm:hidden">Sintetizando {academicSearchResults.validated} {academicSearchResults.validated === 1 ? 'fuente' : 'fuentes'}</span>
                              </>
                            )}
                          </motion.div>
                          {/* Query solo visible en desktop */}
                          {academicSearchQuery && academicSearchState === 'searching' && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.3, delay: 0.1 }}
                              className="hidden sm:block text-xs font-serif text-academic-plum-700/80 mt-1.5 truncate italic leading-relaxed"
                            >
                              "{academicSearchQuery}"
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {streamingGroundingUrls && streamingGroundingUrls.length > 0 && (
                  <div className="mx-4 mb-4 pt-3 border-t border-border/80 animate-in fade-in duration-300 ease-out">
                    <div className="text-xs font-sans font-medium text-muted-foreground mb-2">Referencias:</div>
                    <div className="space-y-1">
                      {streamingGroundingUrls.map((ref, index) => (
                        <div key={index} className="text-sm font-sans animate-in fade-in duration-200 ease-out" style={{ animationDelay: `${index * 100}ms` }}>
                          <a 
                            href={ref.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {ref.title}
                          </a>
                          {ref.domain && (
                            <span className="text-muted-foreground ml-1">({ref.domain})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </motion.div>
              </motion.div>
            )
          })()}

          {/* Contenedor de bullets externos (post-stream) con toggle y colapsado por defecto */}
          {/* Los bullets añadían ~500-1000ms de latencia al streaming */}
          {!isStreaming && reasoningBullets && (
            (!!reasoningBullets?.isGenerating) || ((reasoningBullets?.bullets?.length ?? 0) > 0 && !lastModelMessageHasBullets)
          ) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-start pt-4"
            >
              <motion.div
                initial={{ scale: 0.98 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn("relative rounded-lg border w-full", fontSizeClass, config.bgColor, config.borderColor)}
              >
                {/* Mobile: Agent icon in corner - Aurora v2.0 */}
                <div className={cn(
                  "mobile-icon-corner mobile-icon-left absolute -top-2.5 -left-2.5 sm:hidden",
                  "w-7 h-7 rounded-lg flex items-center justify-center shadow-md",
                  "ring-1 ring-inset border-2 border-cloud-white",
                  config.bgColor,
                  config.borderColor
                )}>
                  <IconComponent
                    className={cn("w-3.5 h-3.5", config.textColor)}
                    weight="duotone"
                  />
                </div>
                {/* Agent Context Header - Aurora v2.0 con toggle */}
                <div className="px-4 md:px-5 pt-4 pb-3 border-b border-border/30">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                      config.bgColor,
                      "ring-1 ring-inset",
                      config.borderColor
                    )}>
                      <IconComponent
                        className={cn("w-5 h-5", config.textColor)}
                        weight="duotone"
                      />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <h3 className={cn(
                          "text-base font-semibold font-sans tracking-tight",
                          config.textColor
                        )}>
                          {config.name}
                        </h3>
                        {((reasoningBullets?.bullets?.length ?? 0) > 0) && (
                          <button
                            type="button"
                            onClick={() => setAreBulletsCollapsed(prev => !prev)}
                            className={cn(
                              "inline-flex items-center justify-center h-7 px-2.5 text-xs font-medium rounded-lg transition-all",
                              "hover:bg-secondary text-muted-foreground hover:text-foreground"
                            )}
                            aria-label={areBulletsCollapsed ? 'Expandir razonamiento' : 'Colapsar razonamiento'}
                          >
                            {areBulletsCollapsed ? 'Mostrar' : 'Ocultar'}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground/80 font-sans leading-relaxed">
                        {config.description}
                      </p>
                    </div>
                  </div>
                </div>
                {!areBulletsCollapsed && (
                  <div className="p-4">
                    <ReasoningBullets
                      bullets={reasoningBullets?.bullets ?? []}
                      isGenerating={!!reasoningBullets?.isGenerating}
                      className="w-full"
                      showHeader={false}
                    />
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Removed typing indicator; reasoning bullets serve as the only thinking indicator */}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area - Floating */}
      <div className="absolute bottom-0 left-0 right-0 py-3 md:py-4 pt-6 z-20">
        {/* Botón flotante para ir al final - Independiente y elegante */}
        {!autoScroll && currentSession?.history && currentSession.history.length > 0 && (
          <div className="absolute left-0 right-0 bottom-full mb-3 md:mb-4 pointer-events-none flex justify-center">
            <Button
              onClick={scrollToBottom}
              className={cn(
                "pointer-events-auto rounded-full w-11 h-11 shadow-lg transition-all duration-300 hover:scale-110 active:scale-95",
                "bg-card/95 backdrop-blur-sm border-2 border-border/50 hover:border-border",
                "text-foreground hover:bg-card"
              )}
              size="icon"
              variant="ghost"
              title={isStreaming ? "Nuevo contenido - Ir al final" : "Ir al final de la conversación"}
            >
              <CaretDownIcon className="h-5 w-5" weight="bold" />
            </Button>
          </div>
        )}

        {/* Ficha Clínica controls moved into input toolbar */}
        <div className={cn("w-full mx-auto relative z-10", chatContainerWidthClass)}>
          <div className="relative">
            {/* Pending files compact bar (overlay above input, no extra bottom space) */}
            {pendingFiles.length > 0 && !isStreaming && (
              <div className="absolute -top-10 left-0 right-0 px-1 md:px-0">
                <div className="max-w-full overflow-x-auto no-scrollbar">
                  <div className="inline-flex items-center gap-2 bg-ash border border-ash rounded-lg px-2 py-1">
                    {pendingFiles.map((file) => (
                      <div key={file.id} className="flex items-center gap-1 text-[11px] font-sans bg-card/70 border border-border/70 rounded px-1.5 py-0.5 whitespace-nowrap">
                        <PaperclipIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[140px] truncate">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className={cn(
                "rounded-[28px] border bg-card dark:bg-card transition-all shadow-lg p-1",
                "border-border/50",
                config.focusWithinBorderColor
              )}>
              {/* Text Input Section */}
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  placeholder="Escribe tu mensaje o pregunta..."
                  className="w-full min-h-[52px] resize-none border-0 bg-transparent px-4 md:px-5 py-3 md:pr-32 text-base placeholder:text-muted-foreground focus:ring-0 focus-visible:ring-0 font-sans overflow-hidden"
                  rows={1}
                  disabled={isProcessing || isStreaming || isUploading || isTranscribing}
                  style={{
                    boxShadow: 'none',
                  }}
                />
              </div>

              {/* Buttons Section - Both mobile and desktop: Full width row below input */}
              <div className="flex items-center justify-between gap-2 md:gap-3 px-4 md:px-5 pb-3 pt-3">
                {/* Left side buttons (mobile) / All buttons (desktop) */}
                <div className="flex items-center gap-1.5 md:gap-2">
                  <FileUploadButton
                    onFilesSelected={(files) => {
                      // Append to pendingFiles visual list via parent state already provided
                      // No-op here; parent hook updates pendingFiles after uploadDocument
                    }}
                    uploadDocument={uploadDocument}
                    disabled={isProcessing || isStreaming || isUploading || isTranscribing}
                    pendingFiles={pendingFiles}
                    onRemoveFile={onRemoveFile}
                    buttonClassName={cn(config.ghostButton.hoverBg, config.ghostButton.text)}
                  />

                  {(onOpenFichaClinica || onGenerateFichaClinica) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "h-10 md:h-12 px-3 w-auto", 
                            config.ghostButton.hoverBg, 
                            config.ghostButton.text
                          )}
                          title="Ficha Clínica"
                        >
                          <span className="text-sm font-medium">Ficha Clínica</span>
                          {(fichaLoading || generateLoading) && (
                            <span className="absolute -top-1 -right-1 inline-flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-clarity-blue-600 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-clarity-blue-600"></span>
                            </span>
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 font-sans">
                        <DropdownMenuItem
                          disabled={!onOpenFichaClinica}
                          onSelect={() => { if (!fichaLoading) onOpenFichaClinica && onOpenFichaClinica("ficha") }}
                        >
                          {fichaLoading ? 'Abriendo…' : 'Ver Ficha Clínica'}
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem
                          disabled={!onOpenFichaClinica}
                          onSelect={() => { if (!fichaLoading) onOpenFichaClinica && onOpenFichaClinica("insights") }}
                        >
                          Ver Análisis Longitudinal
                        </DropdownMenuItem>
                        
                        {generateLoading && (
                          <DropdownMenuItem
                            disabled={!onCancelFichaGeneration}
                            onSelect={() => { onCancelFichaGeneration && onCancelFichaGeneration() }}
                            className="text-red-600 focus:text-white"
                          >
                            ✋ Cancelar Generación
                          </DropdownMenuItem>
                        )}
                        
                        {canRevertFicha && !generateLoading && (
                          <DropdownMenuItem
                            disabled={!onDiscardFicha}
                            onSelect={() => { onDiscardFicha && onDiscardFicha() }}
                            className="text-orange-600 focus:text-white"
                          >
                            ↩️ Descartar y Volver a Anterior
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <FichaClinicaDisabledButton 
                      onOpenPatientLibrary={onOpenPatientLibrary}
                      config={config}
                    />
                  )}
                  
                </div>

                {/* Right side buttons (voice and send) */}
                <div className="flex items-center gap-1.5">
                  <GeminiVoiceButton
                    onTranscriptReady={(transcript) => {
                      setInputValue(prev => {
                        const newValue = prev.trim() ? `${prev} ${transcript}` : transcript
                        return newValue
                      })
                    }}
                    onTranscribingChange={setIsTranscribing}
                    onRecordingChange={(isRecording, duration) => {
                      setIsRecordingVoice(isRecording)
                      setRecordingDuration(duration)
                    }}
                    stopRecordingRef={voiceButtonStopRef}
                    cancelRecordingRef={voiceCancelRecordingRef}
                    cancelTranscriptionRef={voiceCancelTranscriptionRef}
                    disabled={isProcessing || isStreaming || isUploading || isTranscribing || isRecordingVoice}
                    className={cn("h-10 w-10 md:h-12 md:w-12", config.ghostButton.hoverBg, config.ghostButton.text)}
                  />
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={
                      !inputValue.trim() || 
                      isProcessing || 
                      isStreaming ||
                      isUploading ||
                      isTranscribing ||
                      pendingFiles.some(file => 
                        (file as any).processingStatus && 
                        (file as any).processingStatus === 'processing'
                      )
                    }
                    size="icon"
                    className={cn("h-10 w-10 md:h-12 md:w-12", config.button.bg, config.button.hoverBg, config.button.text)}
                  >
                    <PaperPlaneRightIcon className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

          </div>

          {/* Removed bottom pending files block to avoid extra space */}

          
        </div>
      </div>
      
      {/* Overlay de estado de voz para móviles */}
      <VoiceStatus 
        isListening={isListening}
        interimTranscript={interimTranscript}
        confidence={0}
        error={speechError}
      />
      
      {/* Overlay elegante de transcripción con Gemini */}
      <VoiceTranscriptionOverlay isTranscribing={isTranscribing} />
      
      {/* Overlay elegante de grabación de voz */}
      <VoiceRecordingOverlay 
        isRecording={isRecordingVoice} 
        duration={recordingDuration}
        onStop={() => {
          voiceButtonStopRef.current?.()
        }}
        onCancel={() => {
          voiceCancelRecordingRef.current?.()
        }}
      />
      
      {/* Dev Metrics Indicator - Only visible in development */}
      {currentSession?.sessionId && (
        <DevMetricsIndicator sessionId={currentSession.sessionId} />
      )}
    </div>
  )
}
