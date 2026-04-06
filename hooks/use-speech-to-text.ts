"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition'
import { useMobileDetection } from './use-mobile'
import { useTranscriptPostProcessor } from './use-transcript-post-processor'
import { HIGH_PRIORITY_TERMS_CL } from '@/lib/chilean-clinical-vocabulary'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

/**
 * Hook personalizado para Speech-to-Text integrado con HopeAI
 * 
 * Proporciona funcionalidad robusta de reconocimiento de voz con:
 * - Detección automática de soporte del navegador
 * - Manejo de estados de grabación y transcripción
 * - Integración con el input de chat existente
 * - Configuración optimizada para uso clínico
 * - Intento de suprimir el sonido de notificación del navegador (beep)
 *   Nota: El beep es una característica de seguridad del navegador que puede
 *   no ser completamente suprimible en todos los navegadores móviles.
 * 
 * @author Arquitecto Principal de Sistemas de IA (A-PSI)
 * @version 1.1.0
 */

interface SpeechToTextConfig {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
  confidenceThreshold?: number
}

interface SpeechToTextState {
  isListening: boolean
  isSupported: boolean
  isMicrophoneAvailable: boolean
  transcript: string
  interimTranscript: string
  finalTranscript: string
  confidence: number
  error: string | null
  isProcessing: boolean
}

interface SpeechToTextActions {
  startListening: () => void
  stopListening: () => void
  resetTranscript: () => void
  appendToInput: (inputSetter: (value: string | ((prev: string) => string)) => void) => void
}

const DEFAULT_CONFIG: SpeechToTextConfig = {
  language: 'es-CL', // Chilean Spanish por defecto para psicólogos chilenos
  continuous: true,
  interimResults: true,
  maxAlternatives: 1,
  confidenceThreshold: 0.7
}

export function useSpeechToText(
  config: Partial<SpeechToTextConfig> = {}
): SpeechToTextState & SpeechToTextActions {
  // Detección móvil para optimizaciones adaptativas
  const mobileDetection = useMobileDetection()

  // Post-processor para correcciones de términos clínicos chilenos
  const { getFinalTranscript } = useTranscriptPostProcessor({
    enabled: true,
    autoApply: true
  })

  // Configuración adaptativa basada en el dispositivo
  const adaptiveConfig = {
    ...DEFAULT_CONFIG,
    // Optimizaciones móviles
    continuous: mobileDetection.isMobile ? false : DEFAULT_CONFIG.continuous,
    confidenceThreshold: mobileDetection.isMobile ? 0.6 : DEFAULT_CONFIG.confidenceThreshold,
    ...config
  }

  const finalConfig = adaptiveConfig
  
  // Estados locales
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [microphoneChecked, setMicrophoneChecked] = useState(false)
  const [actualMicAvailable, setActualMicAvailable] = useState(false)
  
  // Referencias para manejo de timeouts
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Hook de react-speech-recognition con configuración adaptativa
  const {
    transcript,
    interimTranscript,
    finalTranscript,
    listening,
    resetTranscript: resetSpeechTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    browserSupportsContinuousListening
  } = useSpeechRecognition({
    transcribing: true,
    clearTranscriptOnListen: false
  })

  // Verificación inicial del soporte del navegador (sin solicitar permisos prematuramente)
  useEffect(() => {
    const checkBrowserSupport = () => {
      if (!browserSupportsSpeechRecognition) {
        setMicrophoneChecked(true)
        setActualMicAvailable(false)
        return
      }

      // Solo verificar que la API esté disponible, sin solicitar permisos
      const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost'
      
      if (hasMediaDevices && isSecureContext) {
        // Asumir que el micrófono está disponible hasta que se demuestre lo contrario
        setActualMicAvailable(true)
        logger.info('✅ Contexto seguro y API de medios disponible')
      } else {
        setActualMicAvailable(false)
        logger.warn('⚠️ Contexto inseguro o API de medios no disponible')
      }
      
      setMicrophoneChecked(true)
    }

    checkBrowserSupport()
  }, [browserSupportsSpeechRecognition])

  // Configurar eventos adicionales para manejo de confianza
  useEffect(() => {
    // Solo manejar eventos de confianza si hay transcript final
    if (finalTranscript) {
      // Simular confianza alta para móviles (ya que no siempre está disponible)
      const simulatedConfidence = mobileDetection.isMobile ? 0.85 : 0.8
      setConfidence(simulatedConfidence)
      
      if (simulatedConfidence < finalConfig.confidenceThreshold!) {
        setError(`Confianza baja en el reconocimiento (${Math.round(simulatedConfidence * 100)}%). Intenta hablar más claro.`)
      } else {
        setError(null)
      }
    }
  }, [finalTranscript, finalConfig.confidenceThreshold, mobileDetection.isMobile])

  // Manejo de eventos de error de SpeechRecognition
  useEffect(() => {
    const handleSpeechError = (event: any) => {
      logger.error('🚨 Error de SpeechRecognition:', event)
      
      let errorMessage = 'Error en el reconocimiento de voz'
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = mobileDetection.isMobile
            ? 'Permisos del micrófono denegados. Ve a configuración del navegador y permite el acceso al micrófono.'
            : 'Permisos del micrófono denegados. Haz clic en el ícono de candado y permite el acceso al micrófono.'
          setActualMicAvailable(false)
          break
        case 'no-speech':
          errorMessage = mobileDetection.isMobile
            ? 'No se detectó voz. Mantén el dispositivo cerca de tu boca e intenta de nuevo.'
            : 'No se detectó voz. Habla más cerca del micrófono.'
          break
        case 'audio-capture':
          errorMessage = 'Error de captura de audio. Verifica que el micrófono esté funcionando.'
          setActualMicAvailable(false)
          break
        case 'network':
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.'
          break
        case 'service-not-allowed':
          errorMessage = 'Servicio de reconocimiento de voz no permitido. Verifica la configuración del navegador.'
          break
        default:
          errorMessage = `Error de reconocimiento: ${event.error}`
      }
      
      setError(errorMessage)
      setIsProcessing(false)
    }

    // Agregar listener de errores si SpeechRecognition está disponible
    if (browserSupportsSpeechRecognition && (window as any).webkitSpeechRecognition) {
      const recognition = new (window as any).webkitSpeechRecognition()
      recognition.addEventListener('error', handleSpeechError)
      
      return () => {
        recognition.removeEventListener('error', handleSpeechError)
      }
    }
  }, [mobileDetection.isMobile, browserSupportsSpeechRecognition])

  // Manejo de timeouts para detección de silencio (deshabilitado en modo toggle)
  useEffect(() => {
    // En modo toggle, no usar timeout de silencio automático
    // El usuario controla manualmente cuándo detener
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
    
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [listening, interimTranscript, mobileDetection.isMobile])

  // Resetear estado de procesamiento cuando cambie el estado de listening
  useEffect(() => {
    if (!listening && isProcessing) {
      // Si no está escuchando pero está procesando, resetear después de un delay
      const resetTimeout = setTimeout(() => {
        logger.info('🔄 Reseteando estado de procesamiento automáticamente')
        setIsProcessing(false)
      }, 1000)
      
      return () => clearTimeout(resetTimeout)
    }
  }, [listening, isProcessing])

  // Funciones de control
  const startListening = useCallback(async () => {
    logger.info('🎤 Iniciando grabación...', {
      browserSupport: browserSupportsSpeechRecognition,
      micAvailable: isMicrophoneAvailable,
      isMobile: mobileDetection.isMobile,
      config: finalConfig,
      currentlyListening: listening
    })
    
    if (!browserSupportsSpeechRecognition) {
      const errorMsg = mobileDetection.isMobile 
        ? 'Reconocimiento de voz no disponible en este navegador móvil. Intenta con Chrome o Safari.'
        : 'Tu navegador no soporta reconocimiento de voz. Prueba con Chrome, Edge o Safari.'
      setError(errorMsg)
      return
    }
    
    // Si ya está escuchando, detener (toggle functionality)
    if (listening) {
      logger.info('🔄 Toggle: deteniendo grabación activa')
      stopListening()
      return
    }
    
    // Verificar contexto seguro antes de proceder
    if (!window.isSecureContext && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      const errorMsg = 'El reconocimiento de voz requiere una conexión segura (HTTPS). Verifica que estés usando HTTPS.'
      setError(errorMsg)
      return
    }
    
    // Resetear estados antes de iniciar
    setError(null)
    setIsProcessing(true)
    setConfidence(0)
    
    try {
      // ESTRATEGIA ANTI-SONIDO: Intentar silenciar el beep del navegador
      
      // Estrategia 1: Acceder directamente a la instancia de SpeechRecognition y deshabilitar sonidos
      try {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (SpeechRecognitionAPI) {
          // Acceder a la instancia global si existe
          const recognitionInstance = SpeechRecognition.getRecognition ? SpeechRecognition.getRecognition() : null
          
          if (recognitionInstance) {
            // Intentar deshabilitar sonidos usando propiedades no estándar
            // Estas propiedades pueden existir en algunos navegadores
            (recognitionInstance as any).soundstart = null;
            (recognitionInstance as any).soundend = null;
            (recognitionInstance as any).audiostart = null;
            (recognitionInstance as any).audioend = null;
          }
        }
      } catch (err) {
        logger.info('No se pudo acceder a la instancia de SpeechRecognition:', err)
      }
      
      // Estrategia 2: Mutar temporalmente el audio del contexto web
      let originalVolume = 1
      let audioContextMuted = false
      
      try {
        // Crear contexto de audio para controlar el volumen
        const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
        if (AudioContext) {
          const audioCtx = new AudioContext()
          const gainNode = audioCtx.createGain()
          gainNode.connect(audioCtx.destination)
          originalVolume = gainNode.gain.value
          gainNode.gain.value = 0 // Silenciar
          audioContextMuted = true
          
          // Restaurar después de 100ms (después de que el beep se haya reproducido)
          setTimeout(() => {
            if (audioContextMuted) {
              gainNode.gain.value = originalVolume
              audioCtx.close()
            }
          }, 100)
        }
      } catch (audioErr) {
        logger.info('No se pudo mutar el contexto de audio:', audioErr)
      }
      
      // Configuración optimizada para toggle functionality con vocabulario clínico chileno
      const options = {
        continuous: true, // Siempre continuo para permitir toggle manual
        language: finalConfig.language,
        interimResults: true,
        maxAlternatives: 1
      }

      logger.info('🎤 Iniciando grabación en modo toggle (sin sonido) con vocabulario clínico chileno:', options)

      // Intentar agregar gramática clínica si el navegador lo soporta
      try {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        const SpeechGrammarList = (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList

        if (SpeechRecognitionAPI && SpeechGrammarList) {
          const recognition = SpeechRecognition.getRecognition ? SpeechRecognition.getRecognition() : null

          if (recognition) {
            const grammarList = new SpeechGrammarList()

            // Crear gramática JSGF con términos clínicos de alta prioridad
            const clinicalTerms = HIGH_PRIORITY_TERMS_CL.join(' | ')
            const grammar = `#JSGF V1.0; grammar clinical; public <term> = ${clinicalTerms};`

            // Agregar gramática con peso alto (1.0 = máxima prioridad)
            grammarList.addFromString(grammar, 1.0)
            recognition.grammars = grammarList

            logger.info('✅ Gramática clínica chilena aplicada:', HIGH_PRIORITY_TERMS_CL.length, 'términos')
          }
        }
      } catch (grammarError) {
        logger.info('⚠️ No se pudo aplicar gramática clínica (navegador no soporta):', grammarError)
        // Continuar sin gramática - no es crítico
      }

      SpeechRecognition.startListening(options)
      
      // Timeout de seguridad más largo para modo toggle
      const maxRecordingTime = mobileDetection.isMobile ? 300000 : 180000 // 5min móvil, 3min desktop
      processingTimeoutRef.current = setTimeout(() => {
        logger.info('⏰ Timeout de seguridad alcanzado en modo toggle')
        stopListening()
      }, maxRecordingTime)
      
      // Timeout de seguridad para evitar bloqueo infinito
      setTimeout(() => {
        if (isProcessing && !listening) {
          logger.info('🚨 Timeout de seguridad: reseteando estado de procesamiento')
          setIsProcessing(false)
        }
      }, 3000)
      
    } catch (err) {
      logger.error('Error starting speech recognition:', err)
      
      // Manejo específico de errores de SpeechRecognition
      let errorMessage = 'Error al iniciar el reconocimiento de voz'
      
      if (err instanceof Error) {
        if (err.message.includes('not-allowed')) {
          errorMessage = mobileDetection.isMobile
            ? 'Permisos del micrófono denegados. Ve a configuración del navegador y permite el acceso al micrófono.'
            : 'Permisos del micrófono denegados. Haz clic en el ícono de candado y permite el acceso al micrófono.'
        } else if (err.message.includes('audio-capture')) {
          errorMessage = 'Error de captura de audio. Verifica que el micrófono esté funcionando correctamente.'
        } else if (err.message.includes('network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.'
        }
      }
      
      setError(errorMessage)
      setIsProcessing(false)
      setActualMicAvailable(false)
    }
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable, browserSupportsContinuousListening, finalConfig, mobileDetection.isMobile])

  const stopListening = useCallback(() => {
    logger.info('🛑 Deteniendo grabación...')
    
    try {
      SpeechRecognition.stopListening()
      
      // Limpiar timeouts
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
        processingTimeoutRef.current = null
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
      
      // Resetear estado de procesamiento después de un breve delay
      setTimeout(() => {
        setIsProcessing(false)
      }, 100)
      
    } catch (err) {
      logger.error('Error stopping speech recognition:', err)
      setError('Error al detener el reconocimiento de voz')
      setIsProcessing(false)
    }
  }, [])

  const resetTranscript = useCallback(() => {
    logger.info('🔄 Reseteando transcript...')
    resetSpeechTranscript()
    setError(null)
    setConfidence(0)
    setIsProcessing(false)
  }, [resetSpeechTranscript])

  // Función para integrar con el input del chat (con post-procesamiento)
  const appendToInput = useCallback((inputSetter: (value: string | ((prev: string) => string)) => void) => {
    if (finalTranscript.trim()) {
      // Aplicar correcciones clínicas chilenas
      const correctedTranscript = getFinalTranscript(finalTranscript.trim())

      inputSetter((prev: string) => {
        const newValue = prev.trim() ? `${prev} ${correctedTranscript}` : correctedTranscript
        return newValue
      })
      resetTranscript()
    }
  }, [finalTranscript, resetTranscript, getFinalTranscript])

  // Limpiar timeouts al desmontar
  useEffect(() => {
    return () => {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }
    }
  }, [])

  return {
    // Estado
    isListening: listening,
    isSupported: browserSupportsSpeechRecognition,
    isMicrophoneAvailable: microphoneChecked ? actualMicAvailable : false,
    transcript,
    interimTranscript,
    finalTranscript: getFinalTranscript(finalTranscript), // Aplicar correcciones al transcript final
    confidence,
    error,
    isProcessing,

    // Acciones
    startListening,
    stopListening,
    resetTranscript,
    appendToInput
  }
}

// Función auxiliar para mensajes de error más amigables con contexto móvil
function getErrorMessage(errorCode: string, isMobile: boolean = false): string {
  const mobileHint = isMobile ? ' En dispositivos móviles, asegúrate de que la aplicación tenga permisos de micrófono.' : ''
  
  switch (errorCode) {
    case 'no-speech':
      return `No se detectó voz. Intenta hablar más cerca del micrófono.${isMobile ? ' En móviles, mantén el dispositivo cerca de tu boca.' : ''}`
    case 'audio-capture':
      return `Error de captura de audio. Verifica que el micrófono esté funcionando.${mobileHint}`
    case 'not-allowed':
      return `Permisos de micrófono denegados. Habilita el acceso al micrófono en tu navegador.${mobileHint}`
    case 'network':
      return `Error de red. Verifica tu conexión a internet.${isMobile ? ' En móviles, verifica que tengas una conexión estable.' : ''}`
    case 'service-not-allowed':
      return `Servicio de reconocimiento de voz no disponible.${isMobile ? ' Algunos navegadores móviles tienen limitaciones.' : ''}`
    case 'bad-grammar':
      return 'Error en la configuración del reconocimiento de voz.'
    case 'language-not-supported':
      return `Idioma no soportado para reconocimiento de voz.${isMobile ? ' Verifica la configuración de idioma en tu dispositivo.' : ''}`
    default:
      return `Error de reconocimiento de voz: ${errorCode}${mobileHint}`
  }
}

// Tipos para extensión de Window (TypeScript)
declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}