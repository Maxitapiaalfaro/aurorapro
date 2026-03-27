/**
 * Singleton del Sistema de Orquestación HopeAI
 * 
 * Garantiza que todas las operaciones del sistema compartan la misma instancia
 * del sistema de orquestación, eliminando la fragmentación de métricas y
 * asegurando la coherencia de los datos de monitoreo.
 * 
 * PROBLEMA ARQUITECTÓNICO RESUELTO:
 * - Fragmentación de instancias entre endpoints
 * - Silos de métricas aislados
 * - Inconsistencia en el estado del sistema
 * 
 * @author HopeAI Development Team
 * @version 2.0.0
 */

import { hopeAI } from './hopeai-system'
import { ClinicalAgentRouter } from './clinical-agent-router'
import { createHopeAIOrchestrationSystem, HopeAIOrchestrationSystem } from './index'

/**
 * Instancia singleton del sistema de orquestación
 */
let globalOrchestrationSystem: HopeAIOrchestrationSystem | null = null

/**
 * Configuración del sistema de orquestación
 */
const ORCHESTRATION_CONFIG = {
  bridge: {
    enableDynamicOrchestration: true,
    fallbackToLegacy: true,
    enablePerformanceMonitoring: true,
    migrationPercentage: 75,
    logLevel: 'info' as const
  },
  monitoring: {
    enableRealTimeMetrics: true,
    enableEventLogging: true,
    enableAnomalyDetection: true,
    enablePerformanceAlerts: true,
    maxEventsInMemory: 10000,
    metricsRetentionDays: 30,
    alertThresholds: {
      responseTimeMs: 5000,
      confidenceThreshold: 0.6,
      errorRateThreshold: 0.1,
      sessionFailureThreshold: 0.2
    },
    logLevel: 'info' as const
  },
  system: {
    enableAutoCleanup: true,
    cleanupIntervalMinutes: 60,
    enableHealthChecks: true,
    healthCheckIntervalMinutes: 15
  }
}

/**
 * Obtiene la instancia singleton del sistema de orquestación
 * 
 * Esta función garantiza que:
 * 1. Solo existe una instancia del sistema en toda la aplicación
 * 2. Todas las métricas se registran en el mismo sistema de monitoreo
 * 3. El estado del sistema es coherente entre todos los endpoints
 * 
 * @returns Instancia singleton del sistema de orquestación
 */
export async function getGlobalOrchestrationSystem(): Promise<HopeAIOrchestrationSystem> {
  if (!globalOrchestrationSystem) {
    console.log('🔧 Inicializando sistema de orquestación singleton...')
    
    // Inicializar HopeAI si no está inicializado
    await hopeAI.initialize()
    
    // Crear router de agentes clínicos
    const agentRouter = new ClinicalAgentRouter()
    
    // Crear sistema de orquestación con configuración unificada
    globalOrchestrationSystem = createHopeAIOrchestrationSystem(
      hopeAI,
      agentRouter,
      ORCHESTRATION_CONFIG
    )
    
    // Inicializar el sistema completo
    await globalOrchestrationSystem.initialize()
    
    console.log('✅ Sistema de orquestación singleton inicializado correctamente')
    console.log('📊 Configuración de monitoreo:', {
      realTimeMetrics: ORCHESTRATION_CONFIG.monitoring.enableRealTimeMetrics,
      eventLogging: ORCHESTRATION_CONFIG.monitoring.enableEventLogging,
      anomalyDetection: ORCHESTRATION_CONFIG.monitoring.enableAnomalyDetection,
      performanceAlerts: ORCHESTRATION_CONFIG.monitoring.enablePerformanceAlerts
    })
  }
  
  return globalOrchestrationSystem
}

/**
 * Reinicia el sistema singleton (útil para testing o reconfiguración)
 */
export function resetGlobalOrchestrationSystem(): void {
  if (globalOrchestrationSystem) {
    console.log('🔄 Reiniciando sistema de orquestación singleton...')
    globalOrchestrationSystem.shutdown()
    globalOrchestrationSystem = null
    console.log('✅ Sistema singleton reiniciado')
  }
}

/**
 * Obtiene el estado del sistema singleton
 */
export function getSystemStatus(): {
  isInitialized: boolean
  instanceId: string | null
  uptime: number | null
} {
  return {
    isInitialized: globalOrchestrationSystem !== null,
    instanceId: globalOrchestrationSystem ? 'singleton-instance' : null,
    uptime: globalOrchestrationSystem ? Date.now() - globalOrchestrationSystem['startTime']?.getTime() : null
  }
}

/**
 * Verifica la salud del sistema singleton
 */
export async function checkSystemHealth(): Promise<{
  healthy: boolean
  components: Record<string, string>
  metrics: Record<string, any>
}> {
  if (!globalOrchestrationSystem) {
    return {
      healthy: false,
      components: {
        orchestrationSystem: 'not-initialized'
      },
      metrics: {}
    }
  }
  
  try {
    const healthStatus = globalOrchestrationSystem.getHealthStatus()
    return {
      healthy: healthStatus.overall === 'healthy',
      components: healthStatus.components,
      metrics: healthStatus.metrics
    }
  } catch (error) {
    return {
      healthy: false,
      components: {
        orchestrationSystem: 'error'
      },
      metrics: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

/**
 * Exporta la configuración para referencia
 */
export { ORCHESTRATION_CONFIG }