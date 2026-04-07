import { NextRequest, NextResponse } from 'next/server'

import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

/**
 * @deprecated Agent switching is no longer supported — unified agent handles all capabilities.
 * This endpoint returns a no-op success for backward compatibility with existing clients.
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, newAgent } = await request.json()

    logger.info('🔄 API: switch-agent called (no-op in unified agent architecture)', { sessionId, newAgent })

    return NextResponse.json({
      success: true,
      sessionId,
      activeAgent: 'socratico', // Legacy value for backward compat
      message: 'Agent switching is no longer needed — unified agent handles all capabilities.'
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
