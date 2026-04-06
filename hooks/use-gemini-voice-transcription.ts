"use client"

import { useState, useRef, useCallback, useEffect } from 'react'
import { authenticatedFetch } from '@/lib/authenticated-fetch'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

/**
 * Hook para transcripción de voz a texto usando Gemini API
 * 
 * Proporciona funcionalidad de grabación de audio y transcripción usando
 * el SDK de Gemini GenAI con soporte para audio en tiempo real.
 * 
 * Features:
 * - Grabación de audio usando MediaRecorder API
 * - Transcripción con Gemini API (server-side)
 * - Formateo automático de texto transcrito
 * - Manejo de errores y estados
 * - Soporte para múltiples formatos de audio (WAV, MP3, WEBM)
 * 
 * @version 1.0.0
 */

export interface VoiceTranscriptionState {
  isRecording: boolean
  isTranscribing: boolean
  isSupported: boolean
  transcript: string
  error: string | null
  duration: number
}

export interface VoiceTranscriptionActions {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  cancelRecording: () => void
  cancelTranscription: () => void
  resetTranscript: () => void
}

export function useGeminiVoiceTranscription(): VoiceTranscriptionState & VoiceTranscriptionActions {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isCancelledRef = useRef<boolean>(false)
  
  // Verificar soporte del navegador
  const isSupported = typeof window !== 'undefined' && 
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Tu navegador no soporta grabación de audio')
      return
    }

    try {
      setError(null)
      audioChunksRef.current = []
      isCancelledRef.current = false // Resetear flag de cancelación
      
      // Solicitar acceso al micrófono con máxima compresión
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1, // Mono para reducir tamaño
          sampleRate: 8000, // 8kHz óptimo para voz (reduce tamaño ~50%)
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      // Determinar el mejor formato soportado
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '' // Usar formato por defecto del navegador
          }
        }
      }
      
      const options = mimeType ? { mimeType } : {}
      const mediaRecorder = new MediaRecorder(stream, options)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        // Detener el stream
        stream.getTracks().forEach(track => track.stop())
        
        // Detener el contador de duración
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current)
          durationIntervalRef.current = null
        }
        
        // Si fue cancelado, no transcribir
        if (isCancelledRef.current) {
          logger.info('🚫 Grabación cancelada - omitiendo transcripción')
          return
        }
        
        // Crear blob de audio
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType || 'audio/webm' 
        })
        
        // Transcribir el audio
        await transcribeAudio(audioBlob)
      }
      
      mediaRecorder.onerror = (event: any) => {
        logger.error('Error en MediaRecorder:', event.error)
        setError('Error al grabar audio: ' + event.error?.message || 'Error desconocido')
        setIsRecording(false)
      }
      
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      
      // Iniciar contador de duración
      startTimeRef.current = Date.now()
      durationIntervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
      
      // Timeout de seguridad: 10 minutos (crítico para sesiones clínicas completas)
      const maxRecordingTime = 600000 // 10 minutos = 600,000 ms
      recordingTimeoutRef.current = setTimeout(() => {
        logger.info('⏰ Límite de 10 minutos alcanzado - deteniendo grabación automáticamente')
        stopRecording()
      }, maxRecordingTime)
      
    } catch (err) {
      logger.error('Error al iniciar grabación:', err)
      
      let errorMessage = 'Error al acceder al micrófono'
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage = 'Permisos de micrófono denegados. Por favor, permite el acceso al micrófono.'
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No se encontró ningún micrófono. Verifica que tu dispositivo tenga un micrófono conectado.'
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'El micrófono está siendo usado por otra aplicación.'
        }
      }
      
      setError(errorMessage)
      setIsRecording(false)
    }
  }, [isSupported])

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      // Limpiar timeout de grabación
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
        recordingTimeoutRef.current = null
      }
    }
  }, [isRecording])

  const transcribeAudio = async (audioBlob: Blob) => {
    // Crear AbortController ANTES de setear isTranscribing
    const controller = new AbortController()
    abortControllerRef.current = controller
    
    setIsTranscribing(true)
    setError(null)
    
    try {
      // Crear FormData para enviar el audio
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      
      // Verificar si ya fue cancelado antes de hacer el fetch
      if (controller.signal.aborted) {
        logger.info('❌ Cancelado antes de enviar request')
        return
      }
      
      // Enviar al endpoint de transcripción
      const response = await authenticatedFetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      
      // Verificar si fue cancelado después del fetch
      if (controller.signal.aborted) {
        logger.info('❌ Cancelado después de recibir respuesta')
        return
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Error al transcribir audio')
      }
      
      const data = await response.json()
      
      // Verificar OTRA VEZ antes de procesar datos
      if (controller.signal.aborted) {
        logger.info('❌ Cancelado antes de procesar transcripción')
        return
      }
      
      if (data.transcript) {
        setTranscript(data.transcript)
      } else {
        throw new Error('No se recibió transcripción del servidor')
      }
      
      // Solo limpiar si NO fue cancelado
      if (!controller.signal.aborted) {
        setIsTranscribing(false)
        setDuration(0)
      }
      
    } catch (err) {
      // Si fue cancelado, no hacer nada (ya se limpió en cancelTranscription)
      if (err instanceof Error && err.name === 'AbortError') {
        logger.info('Transcripción cancelada por el usuario')
        return
      }
      
      // Solo setear error si no fue cancelado
      if (!controller.signal.aborted) {
        logger.error('Error al transcribir:', err)
        setError(err instanceof Error ? err.message : 'Error al transcribir audio')
        setIsTranscribing(false)
        setDuration(0)
      }
    } finally {
      // Solo limpiar la referencia si es el mismo controller
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  const cancelRecording = useCallback(() => {
    logger.info('🚫 Cancelando grabación sin transcribir...')
    
    // Marcar como cancelado ANTES de detener
    isCancelledRef.current = true
    
    // Detener MediaRecorder si está activo
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
    }
    
    // Limpiar chunks de audio (descartar grabación)
    audioChunksRef.current = []
    
    // Limpiar timers
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
    
    // Limpiar estado
    setIsRecording(false)
    setDuration(0)
    setError(null)
    logger.info('✅ Grabación cancelada y descartada')
  }, [isRecording])

  const cancelTranscription = useCallback(() => {
    logger.info('🚫 Cancelando transcripción...', { 
      hasController: !!abortControllerRef.current, 
      isTranscribing 
    })
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      logger.info('✅ AbortController.abort() llamado')
    }
    
    // Limpiar estado inmediatamente (esto hace que el overlay desaparezca)
    logger.info('🔄 Llamando setIsTranscribing(false)...')
    setIsTranscribing(false)
    logger.info('🔄 Llamando setDuration(0)...')
    setDuration(0)
    logger.info('🔄 Llamando setError(null)...')
    setError(null)
    logger.info('✅ Estado limpiado, isTranscribing ahora debería ser false')
  }, [isTranscribing])

  const resetTranscript = useCallback(() => {
    setTranscript("")
    setError(null)
    setDuration(0)
  }, [])

  // 🔒 PROTECCIÓN CRÍTICA: Advertir antes de cerrar pestaña durante grabación
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault()
        e.returnValue = '¿Estás seguro? La grabación en curso se perderá.'
        return '¿Estás seguro? La grabación en curso se perderá.'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isRecording])

  // 🔒 PROTECCIÓN CRÍTICA: Detener grabación al cambiar visibilidad de página
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRecording) {
        logger.warn('⚠️ Página oculta durante grabación - manteniendo grabación activa')
        // NO detenemos la grabación, solo advertimos
        // MediaRecorder continúa grabando en background
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isRecording])

  // 🔒 PROTECCIÓN CRÍTICA: Cleanup al desmontar componente
  useEffect(() => {
    return () => {
      // Limpiar timeouts al desmontar
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current)
      }
      
      // Si hay transcripción activa, cancelarla
      if (abortControllerRef.current) {
        logger.warn('⚠️ Componente desmontado durante transcripción - cancelando')
        abortControllerRef.current.abort()
      }
      
      // Si hay grabación activa al desmontar, intentar detenerla
      if (mediaRecorderRef.current && isRecording) {
        logger.warn('⚠️ Componente desmontado durante grabación - deteniendo automáticamente')
        mediaRecorderRef.current.stop()
      }
    }
  }, [isRecording])

  return {
    // Estado
    isRecording,
    isTranscribing,
    isSupported,
    transcript,
    error,
    duration,
    
    // Acciones
    startRecording,
    stopRecording,
    cancelRecording,
    cancelTranscription,
    resetTranscript,
  }
}
