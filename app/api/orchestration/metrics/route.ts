import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/orchestration-singleton'

/**
 * GET /api/orchestration/metrics
 * Obtiene métricas detalladas del sistema de orquestación
 */
export async function GET(request: NextRequest) {
  try {
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    const metrics = orchestrationSystem.getSystemMetrics()
    
    console.log('📈 Métricas del sistema:', {
      orchestrator: metrics.orchestrator,
      bridge: metrics.bridge,
      toolRegistry: metrics.toolRegistry,
      system: metrics.system
    })
    
    return NextResponse.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error obteniendo métricas:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener métricas del sistema',
        details: error instanceof Error ? error.message : 'Error desconocido',
        metrics: {
          orchestrator: {
            totalOrchestrations: 0,
            successfulOrchestrations: 0,
            failedOrchestrations: 1,
            averageResponseTime: 0,
            averageConfidence: 0,
            agentUsage: {},
            toolUsage: {},
            sessionMetrics: {
              averageSessionLength: 0,
              averageInteractionsPerSession: 0,
              mostCommonTopics: [],
              sessionSuccessRate: 0
            },
            hourlyDistribution: {},
            dailyTrends: {}
          },
          bridge: {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 1,
            averageResponseTime: 0,
            errorRate: 1
          },
          toolRegistry: {
            totalTools: 0,
            activeTools: 0,
            toolCategories: []
          },
          system: {
            uptime: 0,
            initialized: false,
            startTime: new Date()
          }
        }
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/orchestration/metrics
 * Reinicia las métricas del sistema
 */
export async function DELETE(request: NextRequest) {
  try {
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    orchestrationSystem.resetMetrics()
    
    console.log('🔄 Métricas reiniciadas')
    
    return NextResponse.json({
      success: true,
      message: 'Métricas reiniciadas correctamente',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error reiniciando métricas:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al reiniciar métricas del sistema',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}