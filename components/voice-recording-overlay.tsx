"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { MicrophoneIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface VoiceRecordingOverlayProps {
  isRecording: boolean
  duration: number
  onStop: () => void
  onCancel?: () => void
}

export function VoiceRecordingOverlay({ isRecording, duration, onStop, onCancel }: VoiceRecordingOverlayProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <AnimatePresence mode="wait">
      {isRecording && (
        <motion.div
          key="recording-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col items-center gap-5 px-10 py-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-lg">
              {/* Icono simple */}
              <div className="flex items-center justify-center w-16 h-16 bg-red-500/10 dark:bg-red-500/20 rounded-full">
                <MicrophoneIcon className="w-7 h-7 text-red-600 dark:text-red-500" weight="bold" />
              </div>
              
              {/* Texto */}
              <div className="flex flex-col items-center gap-3">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Grabando audio
                </h3>
                
                {/* Ondas de frecuencia sutiles */}
                <div className="flex items-center gap-1 h-8">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-0.5 bg-red-500/60 rounded-full"
                      animate={{
                        height: [8, 24, 8],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.1
                      }}
                    />
                  ))}
                </div>
                
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  Tu voz está siendo captada
                </p>
              </div>
              
              {/* Botones de acción */}
              <div className="flex items-center gap-3">
                {onCancel && (
                  <Button
                    onClick={onCancel}
                    variant="ghost"
                    size="sm"
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50"
                  >
                    Cancelar
                  </Button>
                )}
                <Button
                  onClick={onStop}
                  className="h-10 px-8 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
                >
                  Transcribir
                </Button>
              </div>
              
              {/* Advertencia suave solo cerca del límite */}
              {duration > 540 && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-amber-600 dark:text-amber-500"
                >
                  Acercándose al límite de tiempo
                </motion.p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
