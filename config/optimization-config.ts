/**
 * Configuración de Optimización HopeAI
 * 
 * Este archivo controla qué implementación usar y permite
 * alternar entre la versión original y optimizada para pruebas.
 */

export interface OptimizationConfig {
  // Control de características principales
  useOptimizedContext: boolean
  useNativeGoogleGenAI: boolean
  enableContextCompression: boolean
  enablePerformanceMetrics: boolean
  
  // Configuración de contexto
  contextWindow: {
    maxTokens: number
    compressionThreshold: number
    slidingWindowSize?: number
  }
  
  // Configuración de persistencia
  persistence: {
    enableClientPersistence: boolean
    maxStoredSessions: number
    compressionEnabled: boolean
  }
  
  // Configuración de desarrollo
  development: {
    showPerformanceMetrics: boolean
    enableDetailedLogging: boolean
    enableDebugMode: boolean
    showDebugElements: boolean
  }
}

// Configuración por defecto para Fase 1
export const defaultOptimizationConfig: OptimizationConfig = {
  // Características principales - Fase 1
  useOptimizedContext: true,
  useNativeGoogleGenAI: true,
  enableContextCompression: true,
  enablePerformanceMetrics: true,
  
  // Configuración de contexto optimizada
  contextWindow: {
    maxTokens: 1000000, // Gemini 2.0 Flash context window
    compressionThreshold: 50000, // Comprimir cuando supere 50k caracteres
    slidingWindowSize: 20 // Mantener últimos 20 mensajes en ventana deslizante
  },
  
  // Persistencia optimizada
  persistence: {
    enableClientPersistence: true,
    maxStoredSessions: 50,
    compressionEnabled: true
  },
  
  // Configuración de desarrollo
  development: {
    showPerformanceMetrics: process.env.NODE_ENV === 'development',
    enableDetailedLogging: process.env.NODE_ENV === 'development',
    enableDebugMode: process.env.NODE_ENV === 'development',
    showDebugElements: process.env.NODE_ENV === 'development'
  }
}

// Configuración conservadora (fallback)
export const conservativeOptimizationConfig: OptimizationConfig = {
  useOptimizedContext: false,
  useNativeGoogleGenAI: false,
  enableContextCompression: false,
  enablePerformanceMetrics: false,
  
  contextWindow: {
    maxTokens: 100000,
    compressionThreshold: 20000
  },
  
  persistence: {
    enableClientPersistence: false,
    maxStoredSessions: 25,
    compressionEnabled: false
  },
  
  development: {
    showPerformanceMetrics: false,
    enableDetailedLogging: false,
    enableDebugMode: false,
    showDebugElements: false
  }
}

// Función para obtener configuración desde variables de entorno
export function getOptimizationConfig(): OptimizationConfig {
  const envConfig = process.env.NEXT_PUBLIC_OPTIMIZATION_MODE
  
  switch (envConfig) {
    case 'conservative':
      return conservativeOptimizationConfig
    case 'disabled':
      return {
        ...conservativeOptimizationConfig,
        useOptimizedContext: false,
        useNativeGoogleGenAI: false
      }
    case 'optimized':
    default:
      return defaultOptimizationConfig
  }
}

// Hook para usar la configuración en componentes
export function useOptimizationConfig() {
  return getOptimizationConfig()
}

// Utilidades para verificar características
export const OptimizationFeatures = {
  isOptimizedContextEnabled: () => getOptimizationConfig().useOptimizedContext,
  isNativeGenAIEnabled: () => getOptimizationConfig().useNativeGoogleGenAI,
  isCompressionEnabled: () => getOptimizationConfig().enableContextCompression,
  isPerformanceMetricsEnabled: () => getOptimizationConfig().enablePerformanceMetrics,
  isDevelopmentMode: () => getOptimizationConfig().development.enableDebugMode,
  shouldShowDebugElements: () => getOptimizationConfig().development.showDebugElements
}

// Constantes para logging
export const LOG_PREFIXES = {
  OPTIMIZATION: '🚀 [OPTIMIZATION]',
  CONTEXT: '🧠 [CONTEXT]',
  PERFORMANCE: '⚡ [PERFORMANCE]',
  PERSISTENCE: '💾 [PERSISTENCE]',
  GENAI: '🤖 [GENAI]',
  ERROR: '❌ [ERROR]',
  SUCCESS: '✅ [SUCCESS]',
  WARNING: '⚠️ [WARNING]',
  INFO: 'ℹ️ [INFO]'
} as const

// Función de logging optimizada
export function optimizedLog(prefix: keyof typeof LOG_PREFIXES, message: string, data?: any) {
  if (!getOptimizationConfig().development.enableDetailedLogging) return
  
  const logPrefix = LOG_PREFIXES[prefix]
  if (data) {
    console.log(`${logPrefix} ${message}`, data)
  } else {
    console.log(`${logPrefix} ${message}`)
  }
}