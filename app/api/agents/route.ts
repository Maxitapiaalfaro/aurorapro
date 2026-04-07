
import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    logger.info('🔄 API: Obteniendo agente unificado...')

    const { clinicalAgentRouter } = await import('@/lib/clinical-agent-router')

    const config = clinicalAgentRouter.getAgentConfig()

    logger.info('✅ API: Agente unificado obtenido')

    return NextResponse.json({
      success: true,
      agents: [{
        type: 'aurora',
        name: config.name,
        description: config.description,
        color: config.color,
      }]
    })
  } catch (error) {
    logger.error('❌ API Error (Get Agents):', error)
    return NextResponse.json(
      {
        error: 'Error al obtener agentes',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
