import { NextRequest, NextResponse } from 'next/server'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'
import { verifyFirebaseAuth } from '@/lib/security/firebase-auth-verify'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

// Allow sufficient time for session creation and retrieval
export const maxDuration = 30

// POST: Create new session
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyFirebaseAuth(request)
    if (!authResult.authenticated && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized', message: authResult.error }, { status: 401 })
    }

    const { userId, mode, agent, patientSessionMeta } = await request.json()
    const verifiedUserId = authResult.authenticated ? authResult.uid : userId

    logger.info('🔄 API: Creando nueva sesión...', { userId: verifiedUserId, mode, agent })

    const hopeAISystem = await getGlobalOrchestrationSystem()

    // Crear sesión clínica usando el sistema HopeAI
    const { sessionId, chatState } = await hopeAISystem.createClinicalSession(
      verifiedUserId,
      mode,
      agent,
      undefined,
      patientSessionMeta
    )

    logger.info('✅ API: Sesión creada exitosamente', { sessionId })

    return NextResponse.json({
      success: true,
      sessionId,
      chatState
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ API Error (Create Session): ' + errorMessage)
    return NextResponse.json(
      {
        error: 'Error al crear sesión',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}

// GET: Get user sessions
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyFirebaseAuth(request)
    if (!authResult.authenticated && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized', message: authResult.error }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const verifiedUserId = authResult.authenticated ? authResult.uid : userId

    if (!verifiedUserId) {
      return NextResponse.json(
        { error: 'userId es requerido' },
        { status: 400 }
      )
    }

    logger.info('🔄 API: Obteniendo sesiones del usuario:', verifiedUserId)

    // Obtener sesiones del usuario mediante el singleton de HopeAI
    const hopeAISystem = await getGlobalOrchestrationSystem()
    const sessions = await hopeAISystem.getUserSessions(verifiedUserId)

    logger.info('✅ API: Sesiones obtenidas:', sessions.length)

    return NextResponse.json({
      success: true,
      sessions
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ API Error (Get Sessions): ' + errorMessage)
    return NextResponse.json(
      {
        error: 'Error al obtener sesiones',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}