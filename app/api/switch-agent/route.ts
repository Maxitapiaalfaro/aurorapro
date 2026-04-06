import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

export async function POST(request: NextRequest) {
  try {
    const { sessionId, newAgent } = await request.json()
    
    logger.info('🔄 API: Cambiando agente...', { sessionId, newAgent })
    
    const hopeAISystem = await getGlobalOrchestrationSystem()

    // Usar la API explícita de cambio de agente del sistema HopeAI
    const updatedState = await hopeAISystem.switchAgent(sessionId, newAgent)

    logger.info('✅ API: Agente cambiado exitosamente')

    return NextResponse.json({
      success: true,
      sessionId: updatedState.sessionId,
      activeAgent: updatedState.activeAgent,
      metadata: updatedState.metadata
    })
  } catch (error) {
    logger.error('❌ API Error (Switch Agent):', error)
    return NextResponse.json(
      { 
        error: 'Error al cambiar agente',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}