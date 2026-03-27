import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/orchestration-singleton'

/**
 * GET /api/orchestration/alerts
 * Obtiene todas las alertas activas del sistema
 */
export async function GET(request: NextRequest) {
  try {
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    const alerts = orchestrationSystem.getActiveAlerts()
    
    console.log('🚨 Alertas activas:', {
      total: alerts.length,
      critical: alerts.filter(a => a.level === 'critical').length,
      warnings: alerts.filter(a => a.level === 'warning').length
    })
    
    return NextResponse.json({
      success: true,
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.level === 'critical').length,
        warnings: alerts.filter(a => a.level === 'warning').length,
        info: alerts.filter(a => a.level === 'info').length
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error obteniendo alertas:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener alertas del sistema',
        details: error instanceof Error ? error.message : 'Error desconocido',
        alerts: [],
        summary: {
          total: 0,
          critical: 0,
          warnings: 0,
          info: 0
        }
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/orchestration/alerts/resolve
 * Resuelve una alerta específica
 */
export async function POST(request: NextRequest) {
  try {
    const { alertId, resolutionNote } = await request.json()
    
    if (!alertId) {
      return NextResponse.json(
        {
          success: false,
          error: 'ID de alerta requerido'
        },
        { status: 400 }
      )
    }
    
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    const resolved = orchestrationSystem.resolveAlert(alertId)
    
    if (resolved) {
      console.log(`✅ Alerta ${alertId} resuelta:`, resolutionNote)
      
      return NextResponse.json({
        success: true,
        message: `Alerta ${alertId} resuelta correctamente`,
        alertId,
        resolutionNote,
        timestamp: new Date().toISOString()
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: `Alerta ${alertId} no encontrada o ya resuelta`
        },
        { status: 404 }
      )
    }
    
  } catch (error) {
    console.error('❌ Error resolviendo alerta:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al resolver alerta',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}