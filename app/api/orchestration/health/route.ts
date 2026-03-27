import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/orchestration-singleton'

/**
 * GET /api/orchestration/health
 * Obtiene el estado de salud del sistema de orquestación
 */
export async function GET(request: NextRequest) {
  try {
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    const healthStatus = orchestrationSystem.getHealthStatus()
    
    console.log('📊 Estado de salud del sistema:', {
      overall: healthStatus.overall,
      components: healthStatus.components,
      alerts: healthStatus.alerts
    })
    
    return NextResponse.json({
      success: true,
      health: healthStatus,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error obteniendo estado de salud:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener estado de salud del sistema',
        details: error instanceof Error ? error.message : 'Error desconocido',
        health: {
          overall: 'unhealthy',
          components: {
            toolRegistry: 'unhealthy',
            orchestrationBridge: 'unhealthy',
            monitoring: 'unhealthy'
          },
          metrics: {
            uptime: 0,
            totalOrchestrations: 0,
            currentSessions: 0,
            averageResponseTime: 0,
            errorRate: 1
          },
          alerts: {
            critical: 1,
            warnings: 0
          },
          lastHealthCheck: new Date()
        }
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/orchestration/health
 * Actualiza la configuración del sistema de orquestación
 */
export async function POST(request: NextRequest) {
  try {
    const { migrationPercentage, enableDynamicOrchestration, enableMonitoring } = await request.json()
    
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    
    // Actualizar configuración
    const newConfig: any = {}
    
    if (typeof migrationPercentage === 'number') {
      newConfig.bridge = { migrationPercentage }
    }
    
    if (typeof enableDynamicOrchestration === 'boolean') {
      newConfig.bridge = { 
        ...newConfig.bridge, 
        enableDynamicOrchestration 
      }
    }
    
    if (typeof enableMonitoring === 'boolean') {
      newConfig.monitoring = { 
        enableRealTimeMetrics: enableMonitoring,
        enableEventLogging: enableMonitoring
      }
    }
    
    orchestrationSystem.updateConfig(newConfig)
    
    console.log('⚙️ Configuración actualizada:', newConfig)
    
    return NextResponse.json({
      success: true,
      message: 'Configuración actualizada correctamente',
      config: newConfig,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error actualizando configuración:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al actualizar configuración del sistema',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}