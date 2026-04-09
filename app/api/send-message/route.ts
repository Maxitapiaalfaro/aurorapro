import { NextRequest, NextResponse } from 'next/server'
import { hopeAI } from '@/lib/hopeai-system'
import { getGlobalOrchestrationSystem } from '@/lib/hopeai-system'
import { sentryMetricsTracker } from '@/lib/sentry-metrics-tracker'
import { verifyFirebaseAuth } from '@/lib/security/firebase-auth-verify'
import * as Sentry from '@sentry/nextjs'
import type { AgentType, ReasoningBullet, ToolExecutionEvent, ProcessingStepEvent } from '@/types/clinical-types'
import { startQueryProfile, queryCheckpoint, finishQueryProfile } from '@/lib/utils/query-profiler'
// 🔥 PREWARM: Importar módulo de pre-warming para inicializar el sistema automáticamente
import '@/lib/server-prewarm'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

// Allow sufficient time for AI streaming responses (Gemini API + orchestration)
export const maxDuration = 60

/**
 * SSE Event Types
 */
type SSEEvent =
  | { type: 'bullet', bullet: ReasoningBullet }
  | { type: 'agent_selected', info: { targetAgent: string; confidence: number; reasoning: string } }
  | { type: 'tool_execution', tool: ToolExecutionEvent }
  | { type: 'processing_step', step: ProcessingStepEvent }
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
  const profile = startQueryProfile()

  logger.info('🖥️ [API /send-message] POST request received on SERVER')
  logger.info('🖥️ [API /send-message] Environment:', {
    hasWindow: typeof window !== 'undefined',
    nodeEnv: process.env.NODE_ENV
  })

  try {
    // Verify Firebase Auth token
    const authResult = await verifyFirebaseAuth(request)
    queryCheckpoint(profile, 'auth_verified')
    if (!authResult.authenticated) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Unauthorized', message: authResult.error },
          { status: 401 }
        )
      }
      logger.warn('[API /send-message] No valid auth token (dev mode)')
    }

    requestBody = await request.json()
    queryCheckpoint(profile, 'body_parsed')
    const { sessionId, message, useStreaming = true, userId, suggestedAgent, sessionMeta, fileReferences, fileMetadata, clientContext } = requestBody

    // Use verified uid from token; fall back to body userId only in dev
    const verifiedUserId = authResult.authenticated ? authResult.uid : userId

    logger.info('🔄 [API /send-message] Enviando mensaje con sistema optimizado...', {
      sessionId,
      message: message.substring(0, 50) + '...',
      useStreaming,
      userId: verifiedUserId,
      patientReference: sessionMeta?.patient?.reference || 'None',
      fileReferences: fileReferences?.length || 0,
      fileMetadata: fileMetadata?.length || 0
    })

    // 📁 If files are attached, log them for transparency
    if (fileReferences && fileReferences.length > 0) {
      logger.info('📁 [API /send-message] Files attached to this message:', fileReferences)
    }

    // 📁 If file metadata provided (bypass serverless storage)
    if (fileMetadata && fileMetadata.length > 0) {
      logger.info('📁 [API /send-message] File metadata provided by client (bypass storage):', fileMetadata.map((f: any) => f.name))
    }

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

        // 🛡️ Guard flag for fire-and-forget bullets arriving after controller closes
        let controllerClosed = false

        try {
          // 🔥 CRÍTICO: Enviar evento inicial inmediatamente para establecer conexión SSE
          // Esto previene buffering y confirma que el stream está activo
          controller.enqueue(encoder.encode(': connected\n\n'))

          // 📁 If files are present, emit file processing event IMMEDIATELY
          if (fileReferences && fileReferences.length > 0) {
            logger.info('📁 [API /send-message] Emitting file processing start event')
            sendSSE({
              type: 'tool_execution',
              tool: {
                id: crypto.randomUUID(),
                toolName: 'process_clinical_files',
                displayName: 'Procesando archivos clínicos',
                status: 'started',
                progressMessage: `Preparando ${fileReferences.length} archivo(s) para análisis...`,
                timestamp: new Date()
              }
            })
          }

          logger.info('🔧 [API /send-message] Getting global orchestration system...')
          const systemStartTime = Date.now()
          const orchestrationSystem = await getGlobalOrchestrationSystem()
          queryCheckpoint(profile, 'orchestration_ready')
          const systemInitTime = Date.now() - systemStartTime
          logger.info(`✅ [API /send-message] Orchestration system obtained in ${systemInitTime}ms`)

          // Callback para bullets progresivos (con guardia contra controller cerrado)
          const onBulletUpdate = (bullet: ReasoningBullet) => {
            if (controllerClosed) return // Guard: bullets may arrive after stream closes
            try {
              logger.info('🎯 [API /send-message] Bullet emitido:', bullet.content.substring(0, 50) + '...')
              sendSSE({
                type: 'bullet',
                bullet
              })
            } catch (err) {
              logger.warn('[SSE] Failed to send bullet (controller likely closed):', err)
              controllerClosed = true // Mark as closed to avoid further attempts
            }
          }

          // Callback para selección de agente
          const onAgentSelected = (info: { targetAgent: string; confidence: number; reasoning: string }) => {
            logger.info('🎯 [API /send-message] Agente seleccionado:', info.targetAgent)
            sendSSE({
              type: 'agent_selected',
              info
            })
          }

          // Callback para pasos de procesamiento del pipeline (transparencia)
          const onProcessingStep = (step: ProcessingStepEvent) => {
            if (controllerClosed) return
            try {
              sendSSE({ type: 'processing_step', step })
            } catch (err) {
              logger.warn('[SSE] Failed to send processing_step (controller likely closed):', err)
              controllerClosed = true
            }
          }

          // Enviar mensaje con callbacks
          const result = await orchestrationSystem.sendMessage(
            sessionId,
            message,
            useStreaming,
            suggestedAgent,
            sessionMeta,
            onBulletUpdate,    // ← Callback para bullets
            onAgentSelected,   // ← Callback para agente
            fileReferences,    // ← File IDs from client
            fileMetadata,      // ← File metadata from client (bypass storage)
            verifiedUserId,    // ← Verified psychologistId from auth token
            profile,           // ← Pipeline profiler
            clientContext,      // ← LOCAL-FIRST: pre-computed patient context
            onProcessingStep   // ← Callback para pasos de procesamiento
          )

          // Finish profiling before streaming begins
          finishQueryProfile(profile)

          // 📁 If files were attached, emit completion event
          if (fileReferences && fileReferences.length > 0) {
            logger.info('📁 [API /send-message] Emitting file processing completion event')
            sendSSE({
              type: 'tool_execution',
              tool: {
                id: crypto.randomUUID(),
                toolName: 'process_clinical_files',
                displayName: 'Procesando archivos clínicos',
                status: 'completed',
                timestamp: new Date(),
                result: {
                  sourcesFound: fileReferences.length,
                  sourcesValidated: fileReferences.length
                }
              }
            })
          }

          logger.info('🎯 [API /send-message] Orquestación completada:', {
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
          sentryMetricsTracker.updateSessionActivity(verifiedUserId, sessionId, activeAgent);

          // Registrar métricas del mensaje del usuario
          sentryMetricsTracker.trackMessageSent({
            userId: verifiedUserId,
            sessionId,
            agentType: activeAgent,
            timestamp: new Date(),
            messageLength: message.length,
            responseTime
          });

          // 🔥 STREAMING: Si la respuesta es un AsyncGenerator, consumirlo y enviar chunks INMEDIATAMENTE
          if (result.response && typeof result.response[Symbol.asyncIterator] === 'function') {
            logger.info('🌊 [API /send-message] Procesando respuesta streaming...')

            let fullText = ''
            let chunkCount = 0

            try {
              for await (const chunk of result.response) {
                chunkCount++

                // 🔍 TRANSPARENCY: Intercept tool execution metadata and emit as dedicated SSE events
                if (chunk.metadata) {
                  if (chunk.metadata.type === 'tool_call_start') {
                    sendSSE({
                      type: 'tool_execution',
                      tool: {
                        id: crypto.randomUUID(),
                        toolName: chunk.metadata.toolName,
                        displayName: getToolDisplayName(chunk.metadata.toolName),
                        query: chunk.metadata.query,
                        status: 'started',
                        timestamp: new Date()
                      }
                    })
                  } else if (chunk.metadata.type === 'tool_call_progress') {
                    sendSSE({
                      type: 'tool_execution',
                      tool: {
                        id: crypto.randomUUID(),
                        toolName: chunk.metadata.toolName,
                        displayName: getToolDisplayName(chunk.metadata.toolName),
                        status: 'in_progress',
                        progressMessage: chunk.metadata.message,
                        timestamp: new Date()
                      }
                    })
                  } else if (chunk.metadata.type === 'tool_call_complete') {
                    sendSSE({
                      type: 'tool_execution',
                      tool: {
                        id: crypto.randomUUID(),
                        toolName: chunk.metadata.toolName,
                        displayName: getToolDisplayName(chunk.metadata.toolName),
                        status: 'completed',
                        timestamp: new Date(),
                        result: {
                          sourcesFound: chunk.metadata.sourcesFound,
                          sourcesValidated: chunk.metadata.sourcesValidated
                        },
                        academicSources: chunk.metadata.academicSources,
                        completionDetail: chunk.metadata.completionDetail,
                      }
                    })
                  }
                }

                if (chunk.text) {
                  fullText += chunk.text

                  // 🚀 CRÍTICO: Log CADA chunk para debugging
                  logger.info(`📝 [API /send-message] Chunk #${chunkCount} recibido (${chunk.text.length} chars): "${chunk.text.substring(0, 50)}..."`)

                  // 🚀 CRÍTICO: Enviar chunk INMEDIATAMENTE vía SSE (no esperar a acumular)
                  sendSSE({
                    type: 'chunk',
                    chunk: {
                      text: chunk.text,
                      groundingUrls: chunk.groundingUrls,
                      academicReferences: chunk.academicReferences
                    }
                  } as any)

                  logger.info(`✅ [API /send-message] Chunk #${chunkCount} enviado vía SSE`)
                }
              }

              logger.info(`✅ [API /send-message] Streaming completado: ${chunkCount} chunks, ${fullText.length} caracteres`)

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
              logger.error('❌ [API /send-message] Error procesando stream:', streamError)
              throw streamError
            }
          } else {
            // Respuesta no-streaming
            logger.info('📄 [API /send-message] Respuesta no-streaming')

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

          logger.info('✅ [API /send-message] Stream completado exitosamente')

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error('❌ [API /send-message] Error en stream: ' + errorMessage)

          // Enviar error vía SSE
          sendSSE({
            type: 'error',
            error: 'Error al procesar mensaje',
            details: errorMessage
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
          controllerClosed = true
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('❌ [API /send-message] Error inicial: ' + errorMessage)

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
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * Maps internal tool names to human-readable display names
 */
function getToolDisplayName(toolName: string): string {
  const displayNames: Record<string, string> = {
    'search_academic_literature': 'Búsqueda académica',
    'search_evidence_for_reflection': 'Búsqueda de evidencia reflexiva',
    'search_evidence_for_documentation': 'Búsqueda de evidencia documental',
    'get_patient_memories': 'Recuperando memorias clínicas',
    'get_patient_record': 'Cargando registro del paciente',
    'save_clinical_memory': 'Guardando memoria clínica',
    'google_search': 'Búsqueda web',
    'explore_patient_context': 'Sintetizando contexto del paciente',
    'generate_clinical_document': 'Generando documento clínico',
    'research_evidence': 'Investigación de evidencia multi-fuente',
    'analyze_longitudinal_patterns': 'Analizando patrones longitudinales',
  }
  return displayNames[toolName] || toolName
}