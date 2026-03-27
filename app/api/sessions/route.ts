import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'

// POST: Create new session
export async function POST(request: NextRequest) {
  try {
    const { userId, mode, agent, patientSessionMeta } = await request.json()
    
    console.log('🔄 API: Creando nueva sesión...', { userId, mode, agent })
    
    const hopeAISystem = await getGlobalOrchestrationSystem()

    // Crear sesión clínica usando el sistema HopeAI
    const { sessionId, chatState } = await hopeAISystem.createClinicalSession(
      userId,
      mode,
      agent,
      undefined,
      patientSessionMeta
    )

    console.log('✅ API: Sesión creada exitosamente', { sessionId })

    return NextResponse.json({
      success: true,
      sessionId,
      chatState
    })
  } catch (error) {
    console.error('❌ API Error (Create Session):', error)
    return NextResponse.json(
      { 
        error: 'Error al crear sesión',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

// GET: Get user sessions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId es requerido' },
        { status: 400 }
      )
    }
    
    console.log('🔄 API: Obteniendo sesiones del usuario:', userId)
    
    // Obtener sesiones del usuario mediante el singleton de HopeAI
    const hopeAISystem = await getGlobalOrchestrationSystem()
    const sessions = await hopeAISystem.getUserSessions(userId)
    
    console.log('✅ API: Sesiones obtenidas:', sessions.length)
    
    return NextResponse.json({
      success: true,
      sessions
    })
  } catch (error) {
    console.error('❌ API Error (Get Sessions):', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener sesiones',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}