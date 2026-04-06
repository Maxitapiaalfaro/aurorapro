
import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    logger.info('🔄 API: Obteniendo agentes disponibles...')
    
    // Lazy import to avoid build-time issues
    const { clinicalAgentRouter } = await import('@/lib/clinical-agent-router')
    
    const agents = clinicalAgentRouter.getAllAgents()
    const agentsList = Array.from(agents.entries()).map(([type, config]) => ({
      type,
      ...config,
    }))
    
    logger.info('✅ API: Agentes obtenidos:', agentsList.length)
    
    return NextResponse.json({
      success: true,
      agents: agentsList
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