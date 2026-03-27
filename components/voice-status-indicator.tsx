"use client"

import React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Mic, MicOff, Volume2, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

/**
 * Indicador de Estado de Voz para HopeAI
 * 
 * Muestra información en tiempo real sobre:
 * - Estado de grabación
 * - Nivel de confianza
 * - Calidad de audio
 * - Errores y advertencias
 * 
 * @author Arquitecto Principal de Sistemas de IA (A-PSI)
 * @version 1.0.0
 */

interface VoiceStatusIndicatorProps {
  isListening: boolean
  isSupported: boolean
  isMicrophoneAvailable: boolean
  confidence: number
  transcript: string
  interimTranscript: string
  error: string | null
  className?: string
  compact?: boolean
}

export function VoiceStatusIndicator({
  isListening,
  isSupported,
  isMicrophoneAvailable,
  confidence,
  transcript,
  interimTranscript,
  error,
  className,
  compact = false
}: VoiceStatusIndicatorProps) {
  // Determinar el estado principal
  const getMainStatus = () => {
    if (!isSupported) return 'unsupported'
    if (!isMicrophoneAvailable) return 'no-mic'
    if (error) return 'error'
    if (isListening) return 'listening'
    return 'ready'
  }

  const mainStatus = getMainStatus()

  // Configuración de estados
  const statusConfig = {
    unsupported: {
      icon: MicOff,
      label: 'No Soportado',
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      borderColor: 'border-gray-300'
    },
    'no-mic': {
      icon: MicOff,
      label: 'Sin Micrófono',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    error: {
      icon: AlertTriangle,
      label: 'Error',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    listening: {
      icon: Mic,
      label: 'Grabando',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    ready: {
      icon: Mic,
      label: 'Listo',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    }
  }

  const config = statusConfig[mainStatus]
  const IconComponent = config.icon

  // Calcular nivel de confianza visual
  const getConfidenceLevel = () => {
    if (confidence >= 0.8) return { level: 'high', color: 'bg-green-500' }
    if (confidence >= 0.6) return { level: 'medium', color: 'bg-yellow-500' }
    return { level: 'low', color: 'bg-red-500' }
  }

  const confidenceLevel = getConfidenceLevel()

  // Versión compacta para el botón de voz
  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {isListening && (
          <>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {confidence > 0 && (
                <Badge variant="secondary" className="text-xs px-1 py-0">
                  {Math.round(confidence * 100)}%
                </Badge>
              )}
            </div>
          </>
        )}
        
        {error && (
          <AlertTriangle className="w-3 h-3 text-red-500" />
        )}
      </div>
    )
  }

  // Versión completa
  return (
    <div className={cn(
      "p-3 rounded-lg border transition-all duration-200 paper-noise",
      config.bgColor,
      config.borderColor,
      className
    )}>
      {/* Header con estado principal */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <IconComponent className={cn("w-4 h-4", config.color)} />
          <span className={cn("text-sm font-medium", config.color)}>
            {config.label}
          </span>
          
          {isListening && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <Volume2 className="w-3 h-3 text-red-600 animate-pulse" />
            </div>
          )}
        </div>

        {/* Indicador de conectividad */}
        <div className="flex items-center gap-1">
          {isSupported && isMicrophoneAvailable ? (
            <Wifi className="w-3 h-3 text-green-500" />
          ) : (
            <WifiOff className="w-3 h-3 text-gray-400" />
          )}
        </div>
      </div>

      {/* Barra de confianza */}
      {isListening && confidence > 0 && (
        <div className="space-y-1 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Confianza</span>
            <span className="text-xs font-medium">
              {Math.round(confidence * 100)}%
            </span>
          </div>
          <Progress 
            value={confidence * 100} 
            className="h-1"
          />
        </div>
      )}

      {/* Transcripción en tiempo real */}
      {(transcript || interimTranscript) && (
        <div className="space-y-1">
          {transcript && (
            <div className="text-xs">
              <span className="text-gray-500">Final:</span>
              <p className="text-foreground font-medium mt-1 p-2 bg-card rounded border">
                "{transcript}"
              </p>
            </div>
          )}
          
          {interimTranscript && interimTranscript !== transcript && (
            <div className="text-xs">
              <span className="text-gray-500">Procesando:</span>
              <p className="text-muted-foreground italic mt-1 p-2 bg-muted rounded border border-dashed">
                "{interimTranscript}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded">
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            <span className="text-xs font-medium text-red-800">Error:</span>
          </div>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Instrucciones cuando está escuchando */}
      {isListening && !transcript && !interimTranscript && !error && (
        <div className="mt-2 text-xs text-gray-600 italic">
          Habla ahora... El sistema está escuchando.
        </div>
      )}

      {/* Estado listo para usar */}
      {mainStatus === 'ready' && !isListening && (
        <div className="mt-2 text-xs text-gray-600">
          Presiona el botón de micrófono para comenzar a hablar.
        </div>
      )}
    </div>
  )
}

// Componente simplificado para mostrar solo el estado
export function VoiceStatusBadge({
  isListening,
  isSupported,
  isMicrophoneAvailable,
  error,
  className
}: Pick<VoiceStatusIndicatorProps, 'isListening' | 'isSupported' | 'isMicrophoneAvailable' | 'error' | 'className'>) {
  const getStatus = () => {
    if (!isSupported) return { label: 'No Soportado', variant: 'secondary' as const }
    if (!isMicrophoneAvailable) return { label: 'Sin Micrófono', variant: 'destructive' as const }
    if (error) return { label: 'Error', variant: 'destructive' as const }
    if (isListening) return { label: 'Grabando', variant: 'default' as const }
    return { label: 'Listo', variant: 'secondary' as const }
  }

  const status = getStatus()

  return (
    <Badge 
      variant={status.variant} 
      className={cn(
        isListening && "bg-red-500 text-white animate-pulse",
        className
      )}
    >
      {status.label}
    </Badge>
  )
}