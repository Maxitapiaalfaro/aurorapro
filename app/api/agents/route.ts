import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 API: Obteniendo agentes disponibles...')
    
    // Lazy import to avoid build-time issues
    const { clinicalAgentRouter } = await import('@/lib/clinical-agent-router')
    
    const agents = clinicalAgentRouter.getAllAgents()
    const agentsList = Array.from(agents.entries()).map(([type, config]) => ({
      type,
      ...config,
    }))
    
    console.log('✅ API: Agentes obtenidos:', agentsList.length)
    
    return NextResponse.json({
      success: true,
      agents: agentsList
    })
  } catch (error) {
    console.error('❌ API Error (Get Agents):', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener agentes',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}