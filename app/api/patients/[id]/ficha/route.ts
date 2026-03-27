import { NextRequest, NextResponse } from 'next/server'
import { clinicalTaskOrchestrator } from '@/lib/clinical-task-orchestrator'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json()
    const { fichaId, sessionId, sessionState, patientForm, conversationSummary, previousFichaContent } = body
    if (!fichaId) {
      return NextResponse.json({ error: 'fichaId es requerido' }, { status: 400 })
    }
    const { id } = await params
    let effectiveSessionState = sessionState
    if (!effectiveSessionState && sessionId) {
      // No server-side storage for fichas; session must be provided by client or looked up elsewhere
      return NextResponse.json({ error: 'Debe proveerse sessionState en el cuerpo cuando no hay persistencia de servidor' }, { status: 400 })
    }
    if (!effectiveSessionState) {
      return NextResponse.json({ error: 'Debe proveerse sessionId o sessionState' }, { status: 400 })
    }
    const ficha = await clinicalTaskOrchestrator.generateFichaClinica({
      fichaId,
      pacienteId: id,
      sessionState: effectiveSessionState,
      patientForm,
      conversationSummary,
      previousFichaContent // Pasar contenido anterior para actualización incremental
    })
    return NextResponse.json({ success: true, ficha })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  // Server no longer returns ficha data; client IndexedDB is the source of truth
  return NextResponse.json({ items: [] })
}


