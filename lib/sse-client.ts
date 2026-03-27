/**
 * SSE Client para manejar Server-Sent Events desde /api/send-message
 * 
 * Este cliente procesa eventos en tiempo real:
 * - Bullets progresivos
 * - Selección de agente
 * - Respuesta final
 */

import type { ReasoningBullet } from '@/types/clinical-types'

/**
 * Tipos de eventos SSE
 */
export type SSEEvent =
  | { type: 'bullet', bullet: ReasoningBullet }
  | { type: 'agent_selected', info: { targetAgent: string; confidence: number; reasoning: string } }
  | { type: 'chunk', chunk: { text: string; groundingUrls?: any[]; academicReferences?: any[] } }
  | { type: 'response', result: any }
  | { type: 'error', error: string, details?: string }
  | { type: 'complete' }

/**
 * Callbacks para eventos SSE
 */
export interface SSECallbacks {
  onBullet?: (bullet: ReasoningBullet) => void
  onAgentSelected?: (info: { targetAgent: string; confidence: number; reasoning: string }) => void
  onChunk?: (chunk: { text: string; groundingUrls?: any[]; academicReferences?: any[] }) => void
  onResponse?: (result: any) => void
  onError?: (error: string, details?: string) => void
  onComplete?: () => void
}

/**
 * Parámetros para enviar mensaje
 */
export interface SendMessageParams {
  sessionId: string
  message: string
  useStreaming?: boolean
  userId?: string
  suggestedAgent?: string
  sessionMeta?: any
}

/**
 * Cliente SSE para /api/send-message
 */
export class SSEClient {
  private abortController: AbortController | null = null

  /**
   * Envía un mensaje y procesa eventos SSE
   */
  async sendMessage(
    params: SendMessageParams,
    callbacks: SSECallbacks
  ): Promise<any> {
    // Crear AbortController para poder cancelar la request
    this.abortController = new AbortController()

    try {
      console.log('🔄 [SSEClient] Enviando mensaje vía SSE...')

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          message: params.message,
          useStreaming: params.useStreaming ?? true,
          userId: params.userId ?? 'default-user',
          suggestedAgent: params.suggestedAgent,
          sessionMeta: params.sessionMeta,
        }),
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en la respuesta del servidor')
      }

      if (!response.body) {
        throw new Error('No se recibió stream del servidor')
      }

      console.log('✅ [SSEClient] Stream iniciado, procesando eventos...')

      // Procesar stream SSE
      const result = await this.processSSEStream(response.body, callbacks)

      console.log('✅ [SSEClient] Stream completado exitosamente')

      return result

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('⚠️ [SSEClient] Request cancelada por el usuario')
        throw new Error('Request cancelada')
      }

      console.error('❌ [SSEClient] Error:', error)
      
      if (callbacks.onError) {
        callbacks.onError(
          error instanceof Error ? error.message : 'Error desconocido',
          error instanceof Error ? error.stack : undefined
        )
      }

      throw error
    } finally {
      this.abortController = null
    }
  }

  /**
   * Enviar mensaje y retornar AsyncGenerator que yielde chunks en tiempo real
   */
  async *sendMessageStream(
    params: SendMessageParams,
    callbacks: SSECallbacks
  ): AsyncGenerator<any, any, unknown> {
    // Crear AbortController para poder cancelar la request
    this.abortController = new AbortController()

    try {
      console.log('🔄 [SSEClient] Enviando mensaje vía SSE (streaming)...')

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: params.sessionId,
          message: params.message,
          useStreaming: params.useStreaming ?? true,
          userId: params.userId ?? 'default-user',
          suggestedAgent: params.suggestedAgent,
          sessionMeta: params.sessionMeta,
        }),
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error en la respuesta del servidor')
      }

      if (!response.body) {
        throw new Error('No se recibió stream del servidor')
      }

      console.log('✅ [SSEClient] Stream iniciado, yielding chunks...')

      // Procesar stream y yieldar chunks en tiempo real
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalResult: any = null

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            console.log('✅ [SSEClient] Stream terminado')
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue

            if (line.startsWith('data: ')) {
              const eventData = line.slice(6)

              try {
                const event: SSEEvent = JSON.parse(eventData)

                switch (event.type) {
                  case 'bullet':
                    if (callbacks.onBullet) {
                      callbacks.onBullet(event.bullet)
                    }
                    break

                  case 'agent_selected':
                    console.log('🎯 [SSEClient] Agente seleccionado:', event.info.targetAgent)
                    if (callbacks.onAgentSelected) {
                      callbacks.onAgentSelected(event.info)
                    }
                    break

                  case 'chunk':
                    const timestamp = new Date().toISOString()
                    console.log(`📝 [SSEClient] Chunk recibido en ${timestamp} (${event.chunk.text?.length || 0} chars) - YIELDING`)

                    // ✅ YIELDAR CHUNK INMEDIATAMENTE para streaming real
                    yield {
                      text: event.chunk.text,
                      groundingUrls: event.chunk.groundingUrls,
                      academicReferences: event.chunk.academicReferences
                    }

                    if (callbacks.onChunk) {
                      callbacks.onChunk(event.chunk)
                    }
                    break

                  case 'response':
                    console.log('✅ [SSEClient] Respuesta final recibida')
                    finalResult = event.result
                    if (callbacks.onResponse) {
                      callbacks.onResponse(event.result)
                    }
                    break

                  case 'error':
                    console.error('❌ [SSEClient] Error recibido:', event.error)
                    if (callbacks.onError) {
                      callbacks.onError(event.error, event.details)
                    }
                    throw new Error(event.error)

                  case 'complete':
                    console.log('✅ [SSEClient] Stream completado')
                    if (callbacks.onComplete) {
                      callbacks.onComplete()
                    }
                    break
                }
              } catch (parseError) {
                console.error('❌ [SSEClient] Error parseando evento:', parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      console.log('✅ [SSEClient] Stream completado exitosamente')

      return finalResult

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('⚠️ [SSEClient] Request cancelada por el usuario')
        throw new Error('Request cancelada')
      }

      console.error('❌ [SSEClient] Error:', error)

      if (callbacks.onError) {
        callbacks.onError(
          error instanceof Error ? error.message : 'Error desconocido',
          error instanceof Error ? error.stack : undefined
        )
      }

      throw error
    } finally {
      this.abortController = null
    }
  }

  /**
   * Procesa el stream SSE línea por línea
   */
  private async processSSEStream(
    body: ReadableStream<Uint8Array>,
    callbacks: SSECallbacks
  ): Promise<any> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finalResult: any = null

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          console.log('✅ [SSEClient] Stream terminado')
          break
        }

        // Decodificar chunk
        buffer += decoder.decode(value, { stream: true })

        // Procesar líneas completas
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Guardar línea incompleta

        for (const line of lines) {
          if (!line.trim()) continue // Ignorar líneas vacías

          // Parsear evento SSE
          if (line.startsWith('data: ')) {
            const eventData = line.slice(6) // Remover "data: "
            
            try {
              const event: SSEEvent = JSON.parse(eventData)
              
              // Procesar evento según tipo
              switch (event.type) {
                case 'bullet':
                  console.log('🎯 [SSEClient] Bullet recibido:', event.bullet.content.substring(0, 50) + '...')
                  if (callbacks.onBullet) {
                    callbacks.onBullet(event.bullet)
                  }
                  break

                case 'agent_selected':
                  console.log('🎯 [SSEClient] Agente seleccionado:', event.info.targetAgent)
                  if (callbacks.onAgentSelected) {
                    callbacks.onAgentSelected(event.info)
                  }
                  break

                case 'chunk':
                  const timestamp = new Date().toISOString()
                  console.log(`📝 [SSEClient] Chunk recibido en ${timestamp} (${event.chunk.text?.length || 0} chars): "${event.chunk.text?.substring(0, 50)}..."`)
                  if (callbacks.onChunk) {
                    callbacks.onChunk(event.chunk)
                  }
                  break

                case 'response':
                  console.log('✅ [SSEClient] Respuesta final recibida')
                  finalResult = event.result
                  if (callbacks.onResponse) {
                    callbacks.onResponse(event.result)
                  }
                  break

                case 'error':
                  console.error('❌ [SSEClient] Error del servidor:', event.error)
                  if (callbacks.onError) {
                    callbacks.onError(event.error, event.details)
                  }
                  throw new Error(event.error)

                case 'complete':
                  console.log('✅ [SSEClient] Stream completado')
                  if (callbacks.onComplete) {
                    callbacks.onComplete()
                  }
                  break

                default:
                  console.warn('⚠️ [SSEClient] Tipo de evento desconocido:', (event as any).type)
              }
            } catch (parseError) {
              console.error('❌ [SSEClient] Error parseando evento:', parseError)
              console.error('Datos del evento:', eventData)
            }
          }
        }
      }

      return finalResult

    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Cancela la request actual
   */
  cancel(): void {
    if (this.abortController) {
      console.log('⚠️ [SSEClient] Cancelando request...')
      this.abortController.abort()
    }
  }
}

/**
 * Instancia singleton del cliente SSE
 */
let sseClientInstance: SSEClient | null = null

/**
 * Obtiene la instancia singleton del cliente SSE
 */
export function getSSEClient(): SSEClient {
  if (!sseClientInstance) {
    sseClientInstance = new SSEClient()
  }
  return sseClientInstance
}

