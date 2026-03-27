/**
 * Transcript Post-Processor Hook
 * 
 * Applies Chilean Spanish clinical corrections to speech-to-text transcripts
 * 
 * @author HopeAI Clinical Team
 * @version 1.0.0
 */

import { useCallback, useMemo } from 'react'
import { applyChileanClinicalCorrections } from '@/lib/chilean-clinical-corrections'

export interface TranscriptCorrection {
  original: string
  corrected: string
  position: number
}

export interface ProcessedTranscript {
  original: string
  processed: string
  corrections: TranscriptCorrection[]
  hasCorrections: boolean
  correctionCount: number
}

export interface PostProcessorOptions {
  enabled?: boolean
  showCorrections?: boolean
  autoApply?: boolean
}

/**
 * Hook for post-processing speech-to-text transcripts
 * with Chilean Spanish clinical corrections
 */
export function useTranscriptPostProcessor(options: PostProcessorOptions = {}) {
  const {
    enabled = true,
    showCorrections = false,
    autoApply = true
  } = options

  /**
   * Process a transcript and apply corrections
   */
  const processTranscript = useCallback((transcript: string): ProcessedTranscript => {
    if (!enabled || !transcript.trim()) {
      return {
        original: transcript,
        processed: transcript,
        corrections: [],
        hasCorrections: false,
        correctionCount: 0
      }
    }

    const { corrected, corrections } = applyChileanClinicalCorrections(transcript)

    return {
      original: transcript,
      processed: corrected,
      corrections,
      hasCorrections: corrections.length > 0,
      correctionCount: corrections.length
    }
  }, [enabled])

  /**
   * Get the final transcript (corrected or original based on autoApply)
   */
  const getFinalTranscript = useCallback((transcript: string): string => {
    if (!enabled || !autoApply) {
      return transcript
    }

    const processed = processTranscript(transcript)
    return processed.processed
  }, [enabled, autoApply, processTranscript])

  /**
   * Check if a transcript would be corrected
   */
  const wouldCorrect = useCallback((transcript: string): boolean => {
    if (!enabled || !transcript.trim()) {
      return false
    }

    const processed = processTranscript(transcript)
    return processed.hasCorrections
  }, [enabled, processTranscript])

  return {
    processTranscript,
    getFinalTranscript,
    wouldCorrect,
    isEnabled: enabled
  }
}

/**
 * Hook for displaying correction feedback to users
 */
export function useCorrectionFeedback() {
  const formatCorrection = useCallback((correction: TranscriptCorrection): string => {
    return `"${correction.original}" → "${correction.corrected}"`
  }, [])

  const formatAllCorrections = useCallback((corrections: TranscriptCorrection[]): string => {
    if (corrections.length === 0) {
      return 'No se realizaron correcciones'
    }

    if (corrections.length === 1) {
      return `Se corrigió: ${formatCorrection(corrections[0])}`
    }

    return `Se corrigieron ${corrections.length} términos clínicos`
  }, [formatCorrection])

  return {
    formatCorrection,
    formatAllCorrections
  }
}

