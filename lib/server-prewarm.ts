/**
 * Server Pre-warming Module
 * 
 * Este módulo se encarga de pre-inicializar el sistema HopeAI cuando el servidor arranca,
 * eliminando el cold start del primer request.
 * 
 * ARQUITECTURA:
 * - Se ejecuta automáticamente cuando Next.js importa este módulo
 * - Inicializa el sistema en background sin bloquear el arranque del servidor
 * - Proporciona un endpoint de health check para verificar el estado
 */

import { getGlobalOrchestrationSystem } from './hopeai-system'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

let isPrewarming = false
let isPrewarmed = false
let prewarmError: Error | null = null
let prewarmStartTime = 0
let prewarmEndTime = 0

/**
 * Pre-warm del sistema HopeAI
 * Se ejecuta en background cuando el servidor arranca
 */
async function prewarmSystem() {
  if (isPrewarming || isPrewarmed) {
    logger.info('⚠️ [Prewarm] System already prewarming or prewarmed, skipping')
    return
  }

  isPrewarming = true
  prewarmStartTime = Date.now()
  
  logger.info('🔥 [Prewarm] Starting HopeAI system pre-warming...')

  try {
    // Inicializar el sistema global
    await getGlobalOrchestrationSystem()
    
    prewarmEndTime = Date.now()
    const duration = prewarmEndTime - prewarmStartTime
    
    isPrewarmed = true
    logger.info(`✅ [Prewarm] HopeAI system pre-warmed successfully in ${duration}ms`)
  } catch (error) {
    prewarmError = error as Error
    logger.error('❌ [Prewarm] Failed to pre-warm HopeAI system:', error)
  } finally {
    isPrewarming = false
  }
}

/**
 * Obtener el estado del pre-warming
 */
export function getPrewarmStatus() {
  return {
    isPrewarming,
    isPrewarmed,
    hasError: prewarmError !== null,
    error: prewarmError?.message ?? null,
    duration: prewarmEndTime > 0 ? prewarmEndTime - prewarmStartTime : null
  }
}

/**
 * Esperar a que el pre-warming complete (útil para health checks)
 */
export async function waitForPrewarm(timeoutMs = 10000): Promise<boolean> {
  const startWait = Date.now()
  
  while (isPrewarming && (Date.now() - startWait) < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return isPrewarmed
}

// 🔥 AUTO-EJECUTAR: Iniciar pre-warming INMEDIATAMENTE cuando se importa este módulo
// Solo en servidor (Next.js) y no durante la fase de build
const isServer = typeof window === 'undefined'
const isBuildPhase = typeof process.env.NEXT_PHASE === 'string' && process.env.NEXT_PHASE.includes('build')

if (isServer && !isBuildPhase) {
  logger.info('🚀 [Prewarm] Module loaded, starting IMMEDIATE pre-warm...')

  // Ejecutar INMEDIATAMENTE (no esperar al siguiente tick)
  // Esto asegura que el sistema se inicialice antes del primer request
  prewarmSystem().catch(error => {
    logger.error('❌ [Prewarm] Unhandled error during pre-warm:', error)
  })
} else if (isServer && isBuildPhase) {
  logger.info('⚠️ [Prewarm] Skipping pre-warm during build phase')
}

