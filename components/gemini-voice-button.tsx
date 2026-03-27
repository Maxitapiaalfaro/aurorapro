"use client"

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { MicrophoneIcon, MicrophoneSlashIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useGeminiVoiceTranscription } from '@/hooks/use-gemini-voice-transcription'
import { toast } from '@/hooks/use-toast'

/**
 * Componente de botón para grabación y transcripción de voz con Gemini
 * 
 * Features:
 * - Grabación de audio con indicador visual
 * - Transcripción automática usando Gemini API
 * - Estados visuales claros (idle, grabando, transcribiendo)
 * - Manejo de errores con toasts
 * - Contador de duración de grabación
 * 
 * @param onTranscriptReady - Callback cuando la transcripción está lista
 * @param disabled - Deshabilitar el botón
 */

interface GeminiVoiceButtonProps {
  onTranscriptReady: (transcript: string) => void
  onTranscribingChange?: (isTranscribing: boolean) => void
  onRecordingChange?: (isRecording: boolean, duration: number) => void
  stopRecordingRef?: React.MutableRefObject<(() => void) | null>
  cancelRecordingRef?: React.MutableRefObject<(() => void) | null>
  cancelTranscriptionRef?: React.MutableRefObject<(() => void) | null>
  disabled?: boolean
  className?: string
}

export function GeminiVoiceButton({ 
  onTranscriptReady,
  onTranscribingChange,
  onRecordingChange,
  stopRecordingRef,
  cancelRecordingRef,
  cancelTranscriptionRef,
  disabled = false,
  className 
}: GeminiVoiceButtonProps) {
  const {
    isRecording,
    isTranscribing,
    isSupported,
    transcript,
    error,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    cancelTranscription,
    resetTranscript,
  } = useGeminiVoiceTranscription()

  // Manejar transcripción completada
  useEffect(() => {
    if (transcript && !isTranscribing) {
      onTranscriptReady(transcript)
      resetTranscript()
      
      toast({
        title: "Transcripción completada",
        description: "El audio ha sido transcrito exitosamente",
      })
    }
  }, [transcript, isTranscribing, onTranscriptReady, resetTranscript])

  // Manejar errores
  useEffect(() => {
    if (error) {
      toast({
        title: "Error de transcripción",
        description: error,
        variant: "destructive",
      })
    }
  }, [error])

  // Notificar cambios en estado de transcripción
  useEffect(() => {
    console.log('🔔 GeminiVoiceButton: Notificando isTranscribing =', isTranscribing)
    onTranscribingChange?.(isTranscribing)
  }, [isTranscribing, onTranscribingChange])

  // Notificar cambios en estado de grabación y duración
  useEffect(() => {
    onRecordingChange?.(isRecording, duration)
  }, [isRecording, duration, onRecordingChange])

  // Exponer función stopRecording mediante ref
  useEffect(() => {
    if (stopRecordingRef) {
      stopRecordingRef.current = stopRecording
    }
  }, [stopRecording, stopRecordingRef])

  // Exponer función cancelRecording mediante ref
  useEffect(() => {
    if (cancelRecordingRef) {
      cancelRecordingRef.current = cancelRecording
    }
  }, [cancelRecording, cancelRecordingRef])

  // Exponer función cancelTranscription mediante ref
  useEffect(() => {
    if (cancelTranscriptionRef) {
      cancelTranscriptionRef.current = cancelTranscription
    }
  }, [cancelTranscription, cancelTranscriptionRef])

  const handleClick = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  // Si no está soportado, no mostrar el botón
  if (!isSupported) {
    return null
  }

  // Formatear duración (mm:ss)
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleClick}
        disabled={disabled || isTranscribing}
        className={cn(
          "h-10 w-10 rounded-full transition-all duration-200",
          isRecording && "bg-red-500 hover:bg-red-600 text-white animate-pulse",
          isTranscribing && "opacity-50 cursor-not-allowed",
          className
        )}
        title={
          isRecording 
            ? "Detener grabación" 
            : isTranscribing 
            ? "Transcribiendo..." 
            : "Grabar audio"
        }
      >
        {isTranscribing ? (
          <CircleNotchIcon className="h-5 w-5 animate-spin" weight="bold" />
        ) : isRecording ? (
          <MicrophoneSlashIcon className="h-5 w-5" weight="fill" />
        ) : (
          <MicrophoneIcon className="h-5 w-5" weight="bold" />
        )}
      </Button>
      
      {/* Contador de duración mientras graba */}
      {isRecording && duration > 0 && (
        <span className="text-sm font-mono text-red-500 animate-pulse">
          {formatDuration(duration)}
        </span>
      )}
      
      {/* Indicador de transcripción */}
      {isTranscribing && (
        <span className="text-sm text-muted-foreground">
          Transcribiendo...
        </span>
      )}
    </div>
  )
}
