/**
 * Singleton Monitor - Sistema de monitoreo para validar el patrón Singleton
 * Parte de la implementación de optimización arquitectónica
 * 
 * Este módulo proporciona herramientas para:
 * - Monitorear el estado del singleton HopeAISystem
 * - Detectar múltiples inicializaciones
 * - Validar la integridad del sistema
 * - Generar métricas de rendimiento
 */

import * as Sentry from '@sentry/nextjs'

interface SingletonMetrics {
  instanceCreationCount: number
  initializationAttempts: number
  lastInitializationTime: Date | null
  currentStatus: 'uninitialized' | 'initializing' | 'initialized' | 'error'
  performanceMetrics: {
    averageInitTime: number
    lastInitTime: number
    totalUptime: number
  }
  warnings: string[]
  errors: string[]
}

class SingletonMonitor {
  private static instance: SingletonMonitor | null = null
  private metrics: SingletonMetrics
  private startTime: Date
  private initializationTimes: number[] = []

  private constructor() {
    this.startTime = new Date()
    this.metrics = {
      instanceCreationCount: 0,
      initializationAttempts: 0,
      lastInitializationTime: null,
      currentStatus: 'uninitialized',
      performanceMetrics: {
        averageInitTime: 0,
        lastInitTime: 0,
        totalUptime: 0
      },
      warnings: [],
      errors: []
    }

    // Monitorear el estado del singleton cada 30 segundos
    this.startPeriodicMonitoring()
  }

  public static getInstance(): SingletonMonitor {
    if (!SingletonMonitor.instance) {
      SingletonMonitor.instance = new SingletonMonitor()
    }
    return SingletonMonitor.instance
  }

  /**
   * Registra un intento de inicialización
   */
  public recordInitializationAttempt(): void {
    this.metrics.initializationAttempts++
    this.metrics.lastInitializationTime = new Date()
    this.metrics.currentStatus = 'initializing'

    // Detectar múltiples inicializaciones (problema que estamos resolviendo)
    if (this.metrics.initializationAttempts > 1) {
      const warning = `⚠️ Múltiples intentos de inicialización detectados: ${this.metrics.initializationAttempts}`
      this.metrics.warnings.push(warning)
      console.warn(warning)
      
      // Reportar a Sentry
      Sentry.captureException(new Error('Multiple initialization attempts detected'), {
        tags: {
          context: 'singleton-monitor',
          attempts: this.metrics.initializationAttempts.toString()
        }
      })
    }
  }

  /**
   * Registra una inicialización completada
   */
  public recordInitializationComplete(initTime: number): void {
    this.metrics.currentStatus = 'initialized'
    this.metrics.performanceMetrics.lastInitTime = initTime
    this.initializationTimes.push(initTime)
    
    // Calcular tiempo promedio de inicialización
    this.metrics.performanceMetrics.averageInitTime = 
      this.initializationTimes.reduce((a, b) => a + b, 0) / this.initializationTimes.length

    console.log(`✅ Singleton inicializado en ${initTime}ms (promedio: ${this.metrics.performanceMetrics.averageInitTime.toFixed(2)}ms)`)
  }

  /**
   * Registra un error de inicialización
   */
  public recordInitializationError(error: Error): void {
    this.metrics.currentStatus = 'error'
    const errorMsg = `❌ Error de inicialización: ${error.message}`
    this.metrics.errors.push(errorMsg)
    console.error(errorMsg)

    Sentry.captureException(error, {
      tags: {
        context: 'singleton-initialization-error'
      }
    })
  }

  /**
   * Registra la creación de una nueva instancia
   */
  public recordInstanceCreation(): void {
    this.metrics.instanceCreationCount++
    
    // Detectar múltiples instancias (no debería ocurrir con singleton)
    if (this.metrics.instanceCreationCount > 1) {
      const warning = `🚨 CRÍTICO: Múltiples instancias del singleton detectadas: ${this.metrics.instanceCreationCount}`
      this.metrics.warnings.push(warning)
      console.error(warning)
      
      Sentry.captureException(new Error('Multiple singleton instances detected'), {
        tags: {
          context: 'singleton-violation',
          instances: this.metrics.instanceCreationCount.toString()
        }
      })
    }
  }

  /**
   * Obtiene el estado actual del singleton
   */
  public getSystemStatus(): {
    singletonStatus: {
      hasInstance: boolean
      isInitialized: boolean
      isInitializing: boolean
    }
    monitorMetrics: SingletonMetrics
    healthCheck: {
      isHealthy: boolean
      issues: string[]
      recommendations: string[]
    }
  } {
    // Evitar dependencia circular - usar estado interno del monitor
    const singletonStatus = {
      hasInstance: this.metrics.instanceCreationCount > 0,
      isInitialized: this.metrics.currentStatus === 'initialized',
      isInitializing: this.metrics.currentStatus === 'initializing'
    }
    const uptime = Date.now() - this.startTime.getTime()
    this.metrics.performanceMetrics.totalUptime = uptime

    // Análisis de salud del sistema
    const issues: string[] = []
    const recommendations: string[] = []

    if (this.metrics.instanceCreationCount > 1) {
      issues.push('Múltiples instancias del singleton detectadas')
      recommendations.push('Revisar el código para eliminar creaciones directas de HopeAISystem')
    }

    if (this.metrics.initializationAttempts > 2) {
      issues.push('Demasiados intentos de inicialización')
      recommendations.push('Implementar cache de inicialización más robusto')
    }

    if (this.metrics.errors.length > 0) {
      issues.push(`${this.metrics.errors.length} errores de inicialización registrados`)
      recommendations.push('Revisar logs de errores y mejorar manejo de excepciones')
    }

    return {
      singletonStatus,
      monitorMetrics: { ...this.metrics },
      healthCheck: {
        isHealthy: issues.length === 0,
        issues,
        recommendations
      }
    }
  }

  /**
   * Genera un reporte detallado del estado del singleton
   */
  public generateReport(): string {
    const status = this.getSystemStatus()
    const uptime = Math.floor(status.monitorMetrics.performanceMetrics.totalUptime / 1000)
    
    return `
🔍 REPORTE DEL SINGLETON HOPEAI SYSTEM
=====================================

📊 Estado del Singleton:
- Tiene Instancia: ${status.singletonStatus.hasInstance}
- Está Inicializado: ${status.singletonStatus.isInitialized}
- Está Inicializando: ${status.singletonStatus.isInitializing}

📈 Métricas de Rendimiento:
- Instancias Creadas: ${status.monitorMetrics.instanceCreationCount}
- Intentos de Inicialización: ${status.monitorMetrics.initializationAttempts}
- Tiempo Promedio de Init: ${status.monitorMetrics.performanceMetrics.averageInitTime.toFixed(2)}ms
- Último Tiempo de Init: ${status.monitorMetrics.performanceMetrics.lastInitTime}ms
- Tiempo de Actividad: ${uptime}s

🏥 Estado de Salud:
- Sistema Saludable: ${status.healthCheck.isHealthy ? '✅' : '❌'}
- Problemas Detectados: ${status.healthCheck.issues.length}
- Recomendaciones: ${status.healthCheck.recommendations.length}

${status.healthCheck.issues.length > 0 ? `
🚨 Problemas:
${status.healthCheck.issues.map(issue => `- ${issue}`).join('\n')}` : ''}

${status.healthCheck.recommendations.length > 0 ? `
💡 Recomendaciones:
${status.healthCheck.recommendations.map(rec => `- ${rec}`).join('\n')}` : ''}

${status.monitorMetrics.warnings.length > 0 ? `
⚠️ Advertencias Recientes:
${status.monitorMetrics.warnings.slice(-5).map(warning => `- ${warning}`).join('\n')}` : ''}

${status.monitorMetrics.errors.length > 0 ? `
❌ Errores Recientes:
${status.monitorMetrics.errors.slice(-3).map(error => `- ${error}`).join('\n')}` : ''}
    `
  }

  /**
   * Inicia el monitoreo periódico del sistema
   */
  private startPeriodicMonitoring(): void {
    setInterval(() => {
      const status = this.getSystemStatus()
      
      // Log periódico del estado (solo si hay problemas)
      if (!status.healthCheck.isHealthy) {
        console.warn('🔍 Singleton Monitor - Problemas detectados:', status.healthCheck.issues)
      }
      
      // Reportar métricas a Sentry cada 5 minutos
      if (Date.now() % (5 * 60 * 1000) < 30000) { // Aproximadamente cada 5 minutos
        Sentry.addBreadcrumb({
          message: 'Singleton health check',
          category: 'metrics',
          data: {
            metric: 'singleton_health_check',
            value: status.healthCheck.isHealthy ? 1 : 0,
            instances: status.monitorMetrics.instanceCreationCount.toString(),
            init_attempts: status.monitorMetrics.initializationAttempts.toString(),
            status: status.monitorMetrics.currentStatus
          }
        })
      }
    }, 30000) // Cada 30 segundos
  }

  /**
   * Resetea las métricas (para testing)
   */
  public resetMetrics(): void {
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
      console.warn('⚠️ resetMetrics should only be used in test/development environments')
    }
    
    this.metrics = {
      instanceCreationCount: 0,
      initializationAttempts: 0,
      lastInitializationTime: null,
      currentStatus: 'uninitialized',
      performanceMetrics: {
        averageInitTime: 0,
        lastInitTime: 0,
        totalUptime: 0
      },
      warnings: [],
      errors: []
    }
    this.initializationTimes = []
    this.startTime = new Date()
  }
}

// Exportar instancia singleton del monitor
export const singletonMonitor = SingletonMonitor.getInstance()

// Función de conveniencia para obtener el reporte
export function getSingletonReport(): string {
  return singletonMonitor.generateReport()
}

// Función de conveniencia para obtener el estado
export function getSingletonStatus() {
  return singletonMonitor.getSystemStatus()
}