"use client"

import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Volume2, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useMobileSpeechConfig, useMobileDetection } from '@/hooks/use-mobile'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { VoiceStatusIndicator } from '@/components/voice-status-indicator'

/**
 * Componente de Botón de Entrada de Voz para HopeAI
 * 
 * Proporciona una interfaz intuitiva para speech-to-text con:
 * - Estados visuales claros (inactivo, grabando, procesando, error)
 * - Integración automática con el input de chat
 * - Feedback visual y de confianza en tiempo real
 * - Manejo robusto de errores
 * 
 * @author Arquitecto Principal de Sistemas de IA (A-PSI)
 * @version 1.0.0
 */

interface VoiceInputButtonProps {
  /** Función para actualizar el valor del input de chat */
  onTranscriptUpdate: (transcript: string) => void
  /** Estado de procesamiento del chat (deshabilita el botón si está enviando mensaje) */
  disabled?: boolean
  /** Tamaño del botón */
  size?: 'sm' | 'md' | 'lg'
  /** Variante visual */
  variant?: 'default' | 'ghost' | 'outline'
  /** Configuración de idioma (por defecto es-CL) */
  language?: string
  /** Clase CSS adicional */
  className?: string
  /** Clase para colorear el icono (permite color por agente y hover) */
  iconClassName?: string
}

export function VoiceInputButton({
  onTranscriptUpdate,
  disabled = false,
  size = 'md',
  variant = 'ghost',
  language = 'es-CL',
  className,
  iconClassName
}: VoiceInputButtonProps) {
  
  // Configuración optimizada para móviles
  const mobileConfig = useMobileSpeechConfig()
  const mobileDetection = useMobileDetection()
  
  const {
    isListening,
    isSupported,
    isMicrophoneAvailable,
    transcript,
    interimTranscript,
    finalTranscript,
    confidence,
    error,
    isProcessing,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechToText({ 
    language: mobileConfig.language,
    continuous: mobileConfig.continuous,
    interimResults: mobileConfig.interimResults,
    maxAlternatives: 1
  })

  // Efecto para actualizar el input cuando hay transcripción final
  useEffect(() => {
    if (finalTranscript.trim()) {
      onTranscriptUpdate(finalTranscript.trim())
      resetTranscript()
    }
  }, [finalTranscript, onTranscriptUpdate, resetTranscript])

  // Manejar click del botón con feedback háptico en móviles
  const handleVoiceToggle = async () => {
    // Feedback háptico para dispositivos táctiles
    if (mobileConfig.hapticFeedback && navigator.vibrate) {
      navigator.vibrate(50) // Vibración corta de 50ms
    }
    
    if (isListening) {
      stopListening()
    } else {
      try {
        await startListening()
      } catch (error) {
        console.error('Error al iniciar grabación:', error)
      }
    }
  }

  // Determinar el estado visual del botón con lógica optimizada para móviles
  const getButtonState = () => {
    // Solo bloquear en casos de error real, no en advertencias preventivas
    if (!isSupported) return 'unsupported'
    if (error) return 'error'
    if (isListening) return 'listening'
    if (isProcessing) return 'processing'
    
    // Mostrar advertencias solo como información, no como bloqueo
    if (mobileConfig.showPlatformWarnings.safari && !isListening && !isProcessing) return 'safari-warning'
    if (mobileConfig.showPlatformWarnings.ios && !isListening && !isProcessing) return 'ios-warning'
    
    return 'ready'
  }

  const buttonState = getButtonState()

  // Configuración visual por estado con optimizaciones móviles
  const stateConfig = {
    ready: {
      icon: Mic,
      className: 'text-gray-600 hover:text-blue-600 hover:bg-blue-50',
      tooltip: mobileDetection.isTouch ? 'Tocar para hablar' : 'Hacer clic para comenzar a grabar'
    },
    listening: {
      icon: Volume2,
      className: 'text-red-600 bg-red-50 hover:bg-red-100 animate-pulse',
      tooltip: mobileDetection.isTouch ? 'Grabando... Tocar para detener' : 'Grabando... Hacer clic para detener'
    },
    processing: {
      icon: MicOff,
      className: 'text-amber-600 bg-amber-50',
      tooltip: 'Procesando audio...'
    },
    error: {
      icon: AlertCircle,
      className: 'text-red-600 bg-red-50',
      tooltip: error || 'Error en el reconocimiento de voz'
    },
    unsupported: {
      icon: MicOff,
      className: 'text-gray-400 cursor-not-allowed',
      tooltip: 'Reconocimiento de voz no soportado en este navegador'
    },
    'no-mic': {
      icon: MicOff,
      className: 'text-gray-400 cursor-not-allowed',
      tooltip: 'Micrófono no disponible'
    },
    'safari-warning': {
      icon: AlertCircle,
      className: 'text-orange-500 hover:bg-orange-50',
      tooltip: 'Safari puede tener limitaciones con el reconocimiento de voz. Considera usar Chrome o Firefox.'
    },
    'ios-warning': {
      icon: AlertCircle,
      className: 'text-orange-500 hover:bg-orange-50',
      tooltip: 'iOS puede requerir permisos adicionales para el micrófono. Verifica la configuración de Safari.'
    }
  }

  const config = stateConfig[buttonState]
  const IconComponent = config.icon

  // Determinar si el botón debe estar deshabilitado (solo en casos críticos)
  const isButtonDisabled = disabled || 
    buttonState === 'unsupported' || 
    buttonState === 'processing'

  // Tamaños del botón
  const sizeClasses = {
    sm: 'h-6 w-6 p-0',
    md: 'h-8 w-8 p-0',
    lg: 'h-10 w-10 p-0'
  }

  // Tamaños de iconos optimizados para móviles
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }
  
  // Usar tamaño optimizado para móviles
  const effectiveSize = mobileConfig.buttonSize as 'sm' | 'md' | 'lg'

  return (
    <TooltipProvider>
      <div className={cn("relative", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={variant}
              size={effectiveSize === 'md' ? 'default' : effectiveSize}
              onClick={handleVoiceToggle}
              disabled={isButtonDisabled}
              className={cn(
                sizeClasses[effectiveSize],
                'transition-all duration-200',
                // Estilos adicionales para móviles
                mobileDetection.isTouch && 'active:scale-95 touch-manipulation',
                mobileDetection.isMobile && 'min-h-[44px] min-w-[44px]', // Tamaño mínimo táctil
                className
              )}
            >
              {isProcessing ? (
                <Loader2 className={cn(iconSizes[effectiveSize], 'animate-spin', iconClassName)} />
              ) : (
                <IconComponent className={cn(iconSizes[effectiveSize], iconClassName)} />
              )}
            </Button>
          </TooltipTrigger>
          
          <TooltipContent side="top" className="max-w-sm p-0">
            <VoiceStatusIndicator
              isListening={isListening}
              isSupported={isSupported}
              isMicrophoneAvailable={isMicrophoneAvailable}
              confidence={confidence}
              transcript={transcript}
              interimTranscript={interimTranscript}
              error={error}
              className="border-0 bg-card shadow-lg paper-noise"
            />
          </TooltipContent>
        </Tooltip>
        
        {/* Indicador de grabación activa */}
        {isListening && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
            </div>
          </div>
        )}
        

        
        {/* Indicador de error cuando no está grabando */}
        {error && !isListening && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
          </div>
        )}
        
        {/* Indicador de confianza alta (solo si está habilitado en móviles) */}
        {confidence > 0.8 && finalTranscript && mobileConfig.showConfidence && (
          <div className="absolute -top-1 -right-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// Componente de estado de voz para mostrar información adicional
export function VoiceStatus({ 
  isListening, 
  interimTranscript, 
  confidence, 
  error 
}: {
  isListening: boolean
  interimTranscript: string
  confidence: number
  error: string | null
}) {
  const mobileDetection = useMobileDetection()
  const mobileConfig = useMobileSpeechConfig()
  
  if (!isListening && !error) return null

  // En móviles, mostrar un overlay elegante y sutil
  if (mobileDetection.isMobile && isListening) {
    return (
      <div className="fixed inset-x-6 top-24 z-50 mx-auto max-w-sm">
        <div className="bg-white/95 backdrop-blur-md border border-gray-200/50 p-4 rounded-2xl shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75"></div>
            </div>
            <span className="text-gray-700 text-sm font-medium">Escuchando...</span>
          </div>
          
          {interimTranscript ? (
            <div className="mb-3">
              <div className="text-gray-900 text-base leading-relaxed font-normal">
                "{interimTranscript}"
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm mb-3">
              Habla ahora...
            </div>
          )}
          
          <div className="text-center text-xs text-gray-400 border-t border-gray-100 pt-2">
            Toca el micrófono para detener
          </div>
        </div>
      </div>
    )
  }

  // Versión desktop (original)
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
      {isListening && (
        <>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span>Grabando...</span>
          </div>
          
          {interimTranscript && (
            <div className="flex-1 truncate">
              <span className="italic">"{interimTranscript}"</span>
            </div>
          )}
          
          {confidence > 0 && mobileConfig.showConfidence && (
            <div className="text-xs">
              {Math.round(confidence * 100)}%
            </div>
          )}
        </>
      )}
      
      {error && (
        <div className="flex items-center gap-1 text-red-600">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}