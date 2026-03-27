import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, newAgent } = await request.json()
    
    console.log('🔄 API: Cambiando agente...', { sessionId, newAgent })
    
    const hopeAISystem = await getGlobalOrchestrationSystem()

    // Usar la API explícita de cambio de agente del sistema HopeAI
    const updatedState = await hopeAISystem.switchAgent(sessionId, newAgent)

    console.log('✅ API: Agente cambiado exitosamente')

    return NextResponse.json({
      success: true,
      sessionId: updatedState.sessionId,
      activeAgent: updatedState.activeAgent,
      metadata: updatedState.metadata
    })
  } catch (error) {
    console.error('❌ API Error (Switch Agent):', error)
    return NextResponse.json(
      { 
        error: 'Error al cambiar agente',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}