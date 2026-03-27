"use client"

import { motion, AnimatePresence } from 'framer-motion'

interface VoiceTranscriptionOverlayProps {
  isTranscribing: boolean
}

export function VoiceTranscriptionOverlay({ isTranscribing }: VoiceTranscriptionOverlayProps) {
  return (
    <AnimatePresence mode="wait">
      {isTranscribing && (
        <motion.div
          key="transcription-overlay"
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
              <div className="flex items-center justify-center w-16 h-16 bg-blue-500/10 dark:bg-blue-500/20 rounded-full">
                <motion.div
                  animate={{
                    rotate: 360
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear'
                  }}
                  className="w-6 h-6 border-2 border-blue-600 dark:border-blue-500 border-t-transparent rounded-full"
                />
              </div>
              
              {/* Texto */}
              <div className="flex flex-col items-center gap-2">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Transcribiendo audio
                </h3>
                
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                  Esto puede tomar unos segundos
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
