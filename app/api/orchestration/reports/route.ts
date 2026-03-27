import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/orchestration-singleton'

/**
 * GET /api/orchestration/reports
 * Genera un reporte clínico del sistema de orquestación
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const format = searchParams.get('format') || 'json'
    const includeMetrics = searchParams.get('includeMetrics') === 'true'
    const includeAlerts = searchParams.get('includeAlerts') === 'true'
    
    // Validar fechas
    let startDate: Date | undefined
    let endDate: Date | undefined
    
    if (startDateParam) {
      startDate = new Date(startDateParam)
      if (isNaN(startDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Fecha de inicio inválida. Use formato ISO 8601.'
          },
          { status: 400 }
        )
      }
    }
    
    if (endDateParam) {
      endDate = new Date(endDateParam)
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: 'Fecha de fin inválida. Use formato ISO 8601.'
          },
          { status: 400 }
        )
      }
    }
    
    // Validar que la fecha de inicio sea anterior a la de fin
    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'La fecha de inicio debe ser anterior a la fecha de fin.'
        },
        { status: 400 }
      )
    }
    
    const orchestrationSystem = await getGlobalOrchestrationSystem()
    
    // Generar reporte clínico
    const clinicalReport = orchestrationSystem.generateClinicalReport(startDate, endDate)
    
    // Preparar respuesta
    const response: any = {
      success: true,
      report: clinicalReport,
      parameters: {
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        format,
        includeMetrics,
        includeAlerts
      },
      timestamp: new Date().toISOString()
    }
    
    // Incluir métricas adicionales si se solicita
    if (includeMetrics) {
      response.systemMetrics = orchestrationSystem.getSystemMetrics()
    }
    
    // Incluir alertas si se solicita
    if (includeAlerts) {
      response.activeAlerts = orchestrationSystem.getActiveAlerts()
    }
    
    console.log('📋 Reporte clínico generado:', {
      period: {
        start: startDate?.toISOString() || 'inicio del sistema',
        end: endDate?.toISOString() || 'ahora'
      },
      totalSessions: clinicalReport.summary.totalSessions,
      totalOrchestrations: clinicalReport.summary.totalSessions,
      includeMetrics,
      includeAlerts
    })
    
    // Manejar diferentes formatos de respuesta
    if (format === 'csv') {
      // Generar CSV simple del resumen
      const csvData = [
        'Métrica,Valor',
        `Total de Sesiones,${clinicalReport.summary.totalSessions}`,
        `Usuarios Únicos,${clinicalReport.summary.uniqueUsers}`,
        `Agente Más Usado,${clinicalReport.summary.mostUsedAgent}`,
        `Herramientas Más Efectivas,${clinicalReport.summary.mostEffectiveTools.join('; ')}`,
        `Éxito Promedio de Sesión,${clinicalReport.summary.averageSessionSuccess}`
      ].join('\n')
      
      return new NextResponse(csvData, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="reporte-clinico-${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    }
    
    return NextResponse.json(response)
    
  } catch (error) {
    console.error('❌ Error generando reporte clínico:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al generar reporte clínico',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/orchestration/reports
 * Programa la generación automática de reportes
 */
export async function POST(request: NextRequest) {
  try {
    const { frequency, recipients, format } = await request.json()
    
    // Validar parámetros
    const validFrequencies = ['daily', 'weekly', 'monthly']
    if (!frequency || !validFrequencies.includes(frequency)) {
      return NextResponse.json(
        {
          success: false,
          error: `Frecuencia inválida. Use una de: ${validFrequencies.join(', ')}`
        },
        { status: 400 }
      )
    }
    
    const validFormats = ['json', 'csv']
    if (format && !validFormats.includes(format)) {
      return NextResponse.json(
        {
          success: false,
          error: `Formato inválido. Use uno de: ${validFormats.join(', ')}`
        },
        { status: 400 }
      )
    }
    
    // Simular programación de reportes (en una implementación real, esto se guardaría en base de datos)
    const reportConfig = {
      id: `report-${Date.now()}`,
      frequency,
      recipients: recipients || [],
      format: format || 'json',
      createdAt: new Date().toISOString(),
      nextExecution: getNextExecutionDate(frequency)
    }
    
    console.log('📅 Reporte programado:', reportConfig)
    
    return NextResponse.json({
      success: true,
      message: 'Reporte programado correctamente',
      config: reportConfig,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Error programando reporte:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Error al programar reporte',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

// Función auxiliar para calcular la próxima fecha de ejecución
function getNextExecutionDate(frequency: string): string {
  const now = new Date()
  
  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1)
      break
    case 'weekly':
      now.setDate(now.getDate() + 7)
      break
    case 'monthly':
      now.setMonth(now.getMonth() + 1)
      break
  }
  
  return now.toISOString()
}