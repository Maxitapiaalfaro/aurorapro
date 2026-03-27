import { NextRequest, NextResponse } from 'next/server'
import { hopeAI } from '@/lib/hopeai-system'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'
import { sentryMetricsTracker } from '@/lib/sentry-metrics-tracker'
import * as Sentry from '@sentry/nextjs'
import type { AgentType, ReasoningBullet } from '@/types/clinical-types'
// 🔥 PREWARM: Importar módulo de pre-warming para inicializar el sistema automáticamente
import '@/lib/server-prewarm'

/**
 * SSE Event Types
 */
type SSEEvent =
  | { type: 'bullet', bullet: ReasoningBullet }
  | { type: 'agent_selected', info: { targetAgent: string; confidence: number; reasoning: string } }
  | { type: 'chunk', chunk: { text: string; groundingUrls?: any[]; academicReferences?: any[] } }
  | { type: 'response', result: any }
  | { type: 'error', error: string, details?: string }
  | { type: 'complete' }

/**
 * Helper para formatear eventos SSE
 */
function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export async function POST(request: NextRequest) {
  let requestBody: any
  const startTime = Date.now();

  console.log('🖥️ [API /send-message] POST request received on SERVER')
  console.log('🖥️ [API /send-message] Environment:', {
    hasWindow: typeof window !== 'undefined',
    nodeEnv: process.env.NODE_ENV
  })

  try {
    requestBody = await request.json()
    const { sessionId, message, useStreaming = true, userId = 'default-user', suggestedAgent, sessionMeta } = requestBody

    console.log('🔄 [API /send-message] Enviando mensaje con sistema optimizado...', {
      sessionId,
      message: message.substring(0, 50) + '...',
      useStreaming,
      userId,
      suggestedAgent,
      patientReference: sessionMeta?.patient?.reference || 'None'
    })

    // Crear stream SSE con auto-flush
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        // Helper para enviar y hacer flush inmediato
        const sendSSE = (event: SSEEvent) => {
          const data = formatSSE(event)
          const encoded = encoder.encode(data)
          controller.enqueue(encoded)

          // 🔥 CRÍTICO: Forzar flush inmediato enviando un comentario SSE vacío
          // Esto previene buffering en proxies y navegadores
          controller.enqueue(encoder.encode(':\n\n'))
        }

        try {
          // 🔥 CRÍTICO: Enviar evento inicial inmediatamente para establecer conexión SSE
          // Esto previene buffering y confirma que el stream está activo
          controller.enqueue(encoder.encode(': connected\n\n'))

          console.log('🔧 [API /send-message] Getting global orchestration system...')
          const systemStartTime = Date.now()
          const orchestrationSystem = await getGlobalOrchestrationSystem()
          const systemInitTime = Date.now() - systemStartTime
          console.log(`✅ [API /send-message] Orchestration system obtained in ${systemInitTime}ms`)

          // Callback para bullets progresivos
          const onBulletUpdate = (bullet: ReasoningBullet) => {
            console.log('🎯 [API /send-message] Bullet emitido:', bullet.content.substring(0, 50) + '...')
            sendSSE({
              type: 'bullet',
              bullet
            })
          }

          // Callback para selección de agente
          const onAgentSelected = (info: { targetAgent: string; confidence: number; reasoning: string }) => {
            console.log('🎯 [API /send-message] Agente seleccionado:', info.targetAgent)
            sendSSE({
              type: 'agent_selected',
              info
            })
          }

          // Enviar mensaje con callbacks
          const result = await orchestrationSystem.sendMessage(
            sessionId,
            message,
            useStreaming,
            suggestedAgent,
            sessionMeta,
            onBulletUpdate,    // ← Callback para bullets
            onAgentSelected    // ← Callback para agente
          )

          console.log('🎯 [API /send-message] Orquestación completada:', {
            sessionId: result.updatedState.sessionId,
            agentType: result.updatedState.activeAgent,
            responseLength: result.response?.text?.length || 0,
            responseKeys: result.response ? Object.keys(result.response) : [],
            hasText: !!result.response?.text,
            hasRoutingInfo: !!result.response?.routingInfo,
            isAsyncIterator: result.response && typeof result.response[Symbol.asyncIterator] === 'function'
          })

          // Calcular tiempo de respuesta y registrar métricas
          const responseTime = Date.now() - startTime;
          const activeAgent: AgentType = result.updatedState.activeAgent as AgentType || 'socratico';

          // Actualizar actividad de sesión con el agente correcto
          sentryMetricsTracker.updateSessionActivity(userId, sessionId, activeAgent);

          // Registrar métricas del mensaje del usuario
          sentryMetricsTracker.trackMessageSent({
            userId,
            sessionId,
            agentType: activeAgent,
            timestamp: new Date(),
            messageLength: message.length,
            responseTime
          });

          // 🔥 STREAMING: Si la respuesta es un AsyncGenerator, consumirlo y enviar chunks INMEDIATAMENTE
          if (result.response && typeof result.response[Symbol.asyncIterator] === 'function') {
            console.log('🌊 [API /send-message] Procesando respuesta streaming...')

            let fullText = ''
            let chunkCount = 0

            try {
              for await (const chunk of result.response) {
                chunkCount++

                if (chunk.text) {
                  fullText += chunk.text

                  // 🚀 CRÍTICO: Log CADA chunk para debugging
                  console.log(`📝 [API /send-message] Chunk #${chunkCount} recibido (${chunk.text.length} chars): "${chunk.text.substring(0, 50)}..."`)

                  // 🚀 CRÍTICO: Enviar chunk INMEDIATAMENTE vía SSE (no esperar a acumular)
                  sendSSE({
                    type: 'chunk',
                    chunk: {
                      text: chunk.text,
                      groundingUrls: chunk.groundingUrls,
                      academicReferences: chunk.academicReferences
                    }
                  } as any)

                  console.log(`✅ [API /send-message] Chunk #${chunkCount} enviado vía SSE`)
                }
              }

              console.log(`✅ [API /send-message] Streaming completado: ${chunkCount} chunks, ${fullText.length} caracteres`)

              // Enviar respuesta final con texto completo
              sendSSE({
                type: 'response',
                result: {
                  success: true,
                  sessionId: result.updatedState.sessionId,
                  response: {
                    text: fullText,
                    routingInfo: (result.response as any).routingInfo
                  },
                  updatedState: result.updatedState,
                  optimized: true
                }
              })

            } catch (streamError) {
              console.error('❌ [API /send-message] Error procesando stream:', streamError)
              throw streamError
            }
          } else {
            // Respuesta no-streaming
            console.log('📄 [API /send-message] Respuesta no-streaming')

            sendSSE({
              type: 'response',
              result: {
                success: true,
                sessionId: result.updatedState.sessionId,
                response: result.response,
                updatedState: result.updatedState,
                optimized: true
              }
            })
          }

          // Enviar evento de completado
          sendSSE({
            type: 'complete'
          })

          console.log('✅ [API /send-message] Stream completado exitosamente')

        } catch (error) {
          console.error('❌ [API /send-message] Error en stream:', error)

          // Enviar error vía SSE
          sendSSE({
            type: 'error',
            error: 'Error al procesar mensaje',
            details: error instanceof Error ? error.message : 'Error desconocido'
          })

          // Seguimiento de errores
          Sentry.captureException(error, {
            tags: {
              context: 'send-message-api-sse',
              sessionId: requestBody?.sessionId,
              userId: requestBody?.userId
            }
          })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Transfer-Encoding': 'chunked' // Force chunked encoding
      },
    })

  } catch (error) {
    console.error('❌ [API /send-message] Error inicial:', error)

    // Seguimiento mejorado de errores
    Sentry.captureException(error, {
      tags: {
        context: 'send-message-api-sse-init',
        sessionId: requestBody?.sessionId,
        userId: requestBody?.userId
      }
    })

    return NextResponse.json(
      {
        error: 'Error al inicializar stream',
        details: error instanceof Error ? error.message : 'Error desconocido',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}