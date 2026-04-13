/**
 * Streaming & Tool Handler — Extracted from clinical-agent-router.ts (P3 decomposition)
 *
 * Handles streaming responses from Gemini, function call orchestration,
 * academic search execution, vertex link conversion, and token metrics capture.
 */

import { sessionMetricsTracker } from "../session-metrics-comprehensive-tracker"
import { academicSourceValidator } from "../academic-source-validator"
import { crossrefDOIResolver } from "../crossref-doi-resolver"
import { vertexLinkConverter } from "../vertex-link-converter"
import { checkToolPermission } from "../security/tool-permissions"
import { ToolRegistry } from "../tool-registry"
import { executeToolsSafely, type PreparedToolCall, type ToolCallResult } from "../utils/tool-orchestrator"
import { ProgressQueue } from "../utils/progress-queue"
import { createLogger } from "@/lib/logger"
import type { TokenConsumption } from "../subscriptions/types"
import type { DocumentPreviewEvent, DocumentReadyEvent } from "@/types/clinical-types"

const logger = createLogger('agent')

/**
 * The streaming handler needs access to some router state.
 * This interface defines the subset of state it needs.
 */
export interface StreamingContext {
  activeChatSessions: Map<string, { chat: any; agent: any; usesApiKeyClient?: boolean; history?: any[] }>
}

// ---- Text extraction utilities ----

export function b64ToUtf8(data: string): string {
  try {
    // Node/browser compatible
    if (typeof Buffer !== 'undefined') return Buffer.from(data, 'base64').toString('utf-8')
    // @ts-ignore
    if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(data)))
  } catch {}
  return ''
}

export function csvToMarkdown(csv: string): string {
  const rows = csv.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim()))
  if (!rows.length) return ''
  const header = rows[0]
  const align = header.map(() => '---')
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  const toRow = (cols: string[]) => `| ${cols.map(esc).join(' | ')} |`
  const lines = [toRow(header), `| ${align.join(' | ')} |`, ...rows.slice(1).map(toRow)]
  return lines.join('\n')
}

export function jsonToMarkdownTableSafe(jsonText: string): string | null {
  try {
    const data = JSON.parse(jsonText)
    return jsonToMarkdownTable(data)
  } catch { return null }
}

export function jsonToMarkdownTable(data: any): string {
  if (!data) return ''
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : [])
  if (!Array.isArray(arr) || arr.length === 0) return ''
  // Build columns from union of keys
  const colsSet = new Set<string>()
  for (const row of arr) {
    if (row && typeof row === 'object') for (const k of Object.keys(row)) colsSet.add(k)
  }
  const cols = Array.from(colsSet)
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|')
  const toRow = (obj: any) => `| ${cols.map(c => esc(obj?.[c])).join(' | ')} |`
  const header = `| ${cols.join(' | ')} |`
  const align = `| ${cols.map(() => '---').join(' | ')} |`
  const body = arr.map(toRow)
  return [header, align, ...body].join('\n')
}

// Extracts user-viewable text from a streaming chunk, converting common non-text parts
export function extractTextFromChunk(chunk: any): string {
  try {
    let out = ''
    const parts = chunk?.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text) {
        out += part.text
      } else if (part?.inlineData?.data) {
        const mime = part.inlineData.mimeType || ''
        const decoded = b64ToUtf8(part.inlineData.data)
        if (!decoded) continue
        if (mime.includes('text/markdown') || mime.includes('text/plain')) {
          out += decoded
        } else if (mime.includes('text/csv')) {
          out += '\n' + csvToMarkdown(decoded) + '\n'
        } else if (mime.includes('application/json')) {
          const table = jsonToMarkdownTableSafe(decoded)
          if (table) out += '\n' + table + '\n'
        }
      }
    }
    // Fallback to SDK-provided text only if nothing was extracted
    if (!out && typeof chunk?.text === 'string') {
      out = chunk.text
    }
    return out
  } catch {
    return typeof chunk?.text === 'string' ? chunk.text : ''
  }
}

/**
 * Estimate token count for content array (rough approximation)
 */
export function estimateTokenCount(content: any[]): number {
  let totalChars = 0;

  content.forEach((msg: any) => {
    if (msg.parts) {
      msg.parts.forEach((part: any) => {
        if ('text' in part && part.text) {
          totalChars += part.text.length;
        }
      });
    }
  });

   // Rough estimate: 4 characters per token on average
  return Math.ceil(totalChars / 4);
}

// ---- Grounding URL extraction ----

export function sanitizeAcademicUrl(rawUrl: string): string | null {
  if (!rawUrl) return null
  let normalized = rawUrl.trim()
  const compact = normalized.replace(/\s+/g, '')
  const doiMatch = compact.match(/^(?:https?:\/\/)?(?:doi\.org\/)?(10\.\d{4,9}\/.+)$/i)
  if (doiMatch) {
    normalized = `https://doi.org/${doiMatch[1]}`
  } else {
    normalized = compact
  }
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`
  }
  try {
    const parsed = new URL(normalized)
    if (!/^https?:$/.test(parsed.protocol)) return null
    parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Extrae URLs de los metadatos de grounding para crear hipervínculos
 * MEJORADO: Ahora valida DOIs y verifica accesibilidad de URLs
 * Basado en la documentación del SDK: GroundingMetadata -> GroundingChunk -> GroundingChunkWeb
 */
export async function extractUrlsFromGroundingMetadata(groundingMetadata: any): Promise<Array<{title: string, url: string, domain?: string, doi?: string, trustScore?: number}>> {
  const urls: Array<{title: string, url: string, domain?: string, doi?: string, trustScore?: number}> = []
  const seen = new Set<string>()

  try {
    if (groundingMetadata.groundingChunks && Array.isArray(groundingMetadata.groundingChunks)) {
      // Extraer URLs raw primero
      const rawUrls: Array<{title: string, url: string}> = []

      groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          const sanitized = sanitizeAcademicUrl(chunk.web.uri)
          if (sanitized && !seen.has(sanitized)) {
            seen.add(sanitized)
            rawUrls.push({
              title: chunk.web.title || 'Fuente académica',
              url: sanitized
            })
          }
        }

        if (chunk.retrievedContext && chunk.retrievedContext.uri) {
          const sanitized = sanitizeAcademicUrl(chunk.retrievedContext.uri)
          if (sanitized && !seen.has(sanitized)) {
            seen.add(sanitized)
            rawUrls.push({
              title: chunk.retrievedContext.title || 'Contexto recuperado',
              url: sanitized
            })
          }
        }
      })

      // MEJORADO: Extraer DOIs y calcular trust score sin filtrar
      // Parallel AI ya validó estas fuentes, solo agregamos metadata adicional
      for (const rawUrl of rawUrls) {
        try {
          // Extraer DOI si existe
          const doi = academicSourceValidator.extractDOI(rawUrl.url)

          // Validar DOI si existe (pero no filtrar por esto)
          let isValidDOI = false
          if (doi) {
            isValidDOI = await crossrefDOIResolver.validateDOI(doi)
          }

          // Calcular trust score para metadata (pero no filtrar)
          const trustScore = academicSourceValidator.calculateTrustScore({
            url: rawUrl.url,
            doi: isValidDOI && doi ? doi : undefined,
            sourceType: academicSourceValidator.determineSourceType(rawUrl.url)
          })

          // ✅ SIEMPRE incluir la URL - Parallel AI ya hizo el filtrado
          urls.push({
            title: rawUrl.title,
            url: rawUrl.url,
            domain: new URL(rawUrl.url).hostname,
            doi: isValidDOI && doi ? doi : undefined,
            trustScore
          })

          logger.info(`URL incluida: ${rawUrl.url} (trust: ${trustScore})`)
        } catch (error) {
          logger.warn(`Error procesando URL ${rawUrl.url}:`, error)
          // Incluir de todas formas - mejor mostrar la referencia que perderla
          urls.push({
            title: rawUrl.title,
            url: rawUrl.url,
            domain: new URL(rawUrl.url).hostname
          })
        }
      }
    }

    logger.info(`Extracted and validated ${urls.length} URLs from grounding metadata`)
  } catch (error) {
    logger.error('Error extracting URLs from grounding metadata:', error)
  }

  return urls
}

// ---- Shared tool helpers (deduplicated from streaming/non-streaming paths) ----

const KNOWN_DYNAMIC_TOOLS = new Set([
  'google_search',
  'search_academic_literature',
  'get_patient_memories',
  'get_patient_record',
  'save_clinical_memory',
  'create_patient',
  'list_patients',
  // Sub-agent tools
  'explore_patient_context',
  'generate_clinical_document',
  'update_clinical_document',
  'get_session_documents',
  'research_evidence',
  'analyze_longitudinal_patterns',
  // Legacy tool names (may appear in existing sessions)
  'search_evidence_for_reflection',
  'search_evidence_for_documentation',
]);

/**
 * Validates a single function call against security policies and prepares it for execution.
 * Returns a PreparedToolCall with either a denied executor or the real executor.
 */
export function prepareFunctionCallWithSecurity(
  call: any,
  psychologistId: string | null,
  sessionId: string,
  academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}>,
  onProgress?: (message: string) => void,
  patientId?: string,
  onDocumentPreview?: (preview: DocumentPreviewEvent) => void,
  onDocumentReady?: (document: DocumentReadyEvent) => void,
  toolCallHistory?: Map<string, ToolCallRecord[]>
): PreparedToolCall {
  const toolRegistry = ToolRegistry.getInstance();
  const registeredTool = toolRegistry.getToolByDeclarationName(call.name);
  const securityCategory = registeredTool?.metadata.securityCategory ?? 'external';

  // Unregistered + unknown → return a "denied" executor
  if (!registeredTool && !KNOWN_DYNAMIC_TOOLS.has(call.name)) {
    logger.warn(`UNREGISTERED tool BLOCKED: ${call.name}`);
    return {
      call,
      securityCategory,
      execute: async (): Promise<ToolCallResult> => ({
        name: call.name,
        response: {
          error: "Execution denied for security reasons",
          reason: `Tool "${call.name}" is not registered in ToolRegistry. Unregistered tools are blocked.`,
          security_category: 'unknown',
        },
      }),
    } as PreparedToolCall;
  }

  const permissionResult = checkToolPermission(
    call.name,
    securityCategory,
    call.args || {},
    { psychologistId, sessionId }
  );

  if (permissionResult.decision === 'deny') {
    logger.warn(`Tool execution DENIED: ${call.name} — ${permissionResult.reason}`);
    return {
      call,
      securityCategory,
      execute: async (): Promise<ToolCallResult> => ({
        name: call.name,
        response: {
          error: "Execution denied for security reasons",
          reason: permissionResult.reason,
          security_category: securityCategory,
        },
      }),
    } as PreparedToolCall;
  }

  logger.info(`Tool execution ALLOWED: ${call.name} (${securityCategory})`);

  // Build the actual executor function
  return {
    call,
    securityCategory,
    execute: async (): Promise<ToolCallResult> => executeToolCall(call, academicReferences, { psychologistId: psychologistId || undefined, sessionId, patientId, onProgress, onDocumentPreview, onDocumentReady }, toolCallHistory),
  } as PreparedToolCall;
}

/**
 * Executes a single tool call. Shared between streaming and non-streaming paths.
 * Mutates academicReferences array as a side-effect for academic search tools.
 */
async function executeToolCall(
  call: any,
  academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}>,
  context?: {
    psychologistId?: string;
    sessionId?: string;
    patientId?: string;
    onProgress?: (message: string) => void;
    onDocumentPreview?: (preview: DocumentPreviewEvent) => void;
    onDocumentReady?: (document: DocumentReadyEvent) => void;
  },
  toolCallHistory?: Map<string, ToolCallRecord[]>
): Promise<ToolCallResult> {
  // Loop detection: check if this is a duplicate retry
  if (toolCallHistory) {
    const loopCheck = detectToolLoop(call.name, call.args || {}, toolCallHistory)
    if (loopCheck.isLoop) {
      // Escape hatch: return pharmacological fallback instead of executing
      logger.warn(`[LOOP ESCAPE] ${call.name} loop detected at attempt #${loopCheck.attemptCount}, returning fallback`)
      return await generatePharmacologyFallbackResponse(call.name, call.args || {}, loopCheck.attemptCount)
    }
  }

  // Registry-based dispatch — delegates to tool-handlers.ts
  const { getToolHandler } = await import('./tool-handlers');
  const handler = getToolHandler(call.name);

  if (handler) {
    const result = await handler(call.args || {}, {
      psychologistId: context?.psychologistId || '',
      sessionId: context?.sessionId || '',
      patientId: context?.patientId,
      academicReferences,
      onProgress: context?.onProgress,
      onDocumentPreview: context?.onDocumentPreview,
      onDocumentReady: context?.onDocumentReady,
    });

    // Record this tool call in history for loop detection
    if (toolCallHistory) {
      recordToolCall(toolCallHistory, call.name, call.args || {}, result)
    }

    return result;
  }

  // Unknown tool that passed security — return null-like
  logger.warn(`No handler registered for tool: ${call.name}`);
  return { name: call.name, response: null };
}

// ---- Query & completion detail helpers for UX transparency ----

/**
 * Extracts the most user-relevant argument from a tool call for display in the timeline.
 */
function extractQueryFromArgs(toolName: string, args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  switch (toolName) {
    case 'search_academic_literature':
    case 'search_evidence_for_reflection':
    case 'search_evidence_for_documentation':
      return args.query as string | undefined;
    case 'research_evidence':
      return args.research_question as string | undefined;
    case 'explore_patient_context':
      return args.context_hint as string | undefined;
    case 'generate_clinical_document':
      return args.document_type as string | undefined;
    case 'update_clinical_document':
      return args.modification_instructions as string | undefined;
    case 'get_session_documents':
      return args.document_id as string | undefined;
    case 'create_patient':
      return args.displayName as string | undefined;
    case 'list_patients':
      return args.search_query as string | undefined;
    default:
      return undefined;
  }
}

/**
 * Builds a human-readable completion summary for the ExecutionTimeline accordion detail.
 */
function extractCompletionDetail(resp: { name: string; response: unknown }): string | undefined {
  const data = resp.response as Record<string, unknown> | null;
  if (!data || data.error) return undefined;
  switch (resp.name) {
    case 'explore_patient_context':
      return `Sintetizó: ${data.memoriesCount ?? 0} memorias, ${formatMs(data.durationMs)}`;
    case 'generate_clinical_document':
      return `Documento ${data.documentType || '?'}, ${formatMs(data.durationMs)}`;
    case 'update_clinical_document':
      return `Documento actualizado, ${formatMs(data.durationMs)}`;
    case 'get_session_documents':
      return `${data.count ?? 0} documento(s) encontrado(s)`;
    case 'research_evidence':
      return `${data.sourcesCount ?? 0} fuentes, ${formatMs(data.durationMs)}`;
    case 'analyze_longitudinal_patterns':
      return `${data.sessionCount ?? 0} sesiones, ${formatMs(data.durationMs)}`;
    case 'create_patient':
      return `Paciente creado: ${data.displayName || '?'}`;
    case 'list_patients':
      return `${data.count ?? 0} pacientes encontrados`;
    default:
      return undefined;
  }
}

function formatMs(ms: unknown): string {
  if (typeof ms !== 'number') return '';
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---- Streaming handlers ----

/**
 * Create a streaming wrapper that captures metrics when the stream completes
 */
export function createMetricsStreamingWrapper(streamResult: any, interactionId: string | undefined, enhancedMessage: string, psychologistId?: string) {
  // Return an async generator that wraps the original stream
  const wrappedGenerator = (async function* () {
    let accumulatedText = "";
    let finalResponse: any = null;

    try {
      // 🔥 CRÍTICO: Iterar sobre streamResult.stream (no streamResult directamente)
      // Según SDK de Vertex AI: sendMessageStream() retorna { stream: AsyncIterator, response: Promise }
      const stream = streamResult.stream || streamResult;

      // Process all chunks from the original stream
      for await (const chunk of stream) {
        const extracted = extractTextFromChunk(chunk);
        if (extracted) {
          accumulatedText += extracted;
          // ✅ Yield INMEDIATAMENTE con texto normalizado
          yield { ...chunk, text: extracted };
        } else {
          // Yield the chunk unchanged if no text could be extracted
          yield chunk;
        }

        // Store the final response object for token extraction
        if (chunk.candidates && chunk.candidates[0]) {
          finalResponse = chunk;
        }
      }

      // 📊 CAPTURE METRICS AFTER STREAM COMPLETION
      logger.info(`Stream complete - interactionId: ${interactionId}, finalResponse exists: ${!!finalResponse}, accumulated text length: ${accumulatedText.length}`);

      if (interactionId && finalResponse) {
        try {
          // Try to extract token usage from the final response
          const usageMetadata = finalResponse.usageMetadata;
          if (usageMetadata) {
            sessionMetricsTracker.recordModelCallComplete(
              interactionId,
              usageMetadata.promptTokenCount || 0,
              usageMetadata.candidatesTokenCount || 0,
              accumulatedText
            );

            const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
            const cacheHitRatio = usageMetadata.promptTokenCount ? cachedTokens / usageMetadata.promptTokenCount : 0;
            logger.info(`Streaming Token usage - Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}, Cached: ${cachedTokens}, CacheHitRatio: ${(cacheHitRatio * 100).toFixed(1)}%`);
          } else {
            // Fallback: estimate tokens
            const inputTokens = Math.ceil(enhancedMessage.length / 4);
            const outputTokens = Math.ceil(accumulatedText.length / 4);
            sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, accumulatedText);

            logger.info(`Streaming Token usage (estimated) - Input: ${inputTokens}, Output: ${outputTokens}`);
          }

          // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
          const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
          if (completedMetrics) {
            logger.info(`Streaming interaction completed - Cost: $${completedMetrics.tokens.estimatedCost.toFixed(6)}, Tokens: ${completedMetrics.tokens.totalTokens}, Time: ${completedMetrics.timing.totalResponseTime}ms`);

            // 🔥 PERSIST TOKEN CONSUMPTION TO FIRESTORE (fire-and-forget, dynamic import to avoid server-only in client bundle)
            if (psychologistId && completedMetrics.tokens.totalTokens > 0) {
              const cachedTokens = finalResponse?.usageMetadata?.cachedContentTokenCount ?? 0;
              const promptTokens = completedMetrics.tokens.inputTokens;
              const consumption: TokenConsumption = {
                promptTokens,
                responseTokens: completedMetrics.tokens.outputTokens,
                totalTokens: completedMetrics.tokens.totalTokens,
                timestamp: new Date().toISOString(),
                sessionId: completedMetrics.sessionId,
                agentType: completedMetrics.computational?.agentUsed || 'unknown',
                cachedContentTokens: cachedTokens,
                cacheHitRatio: promptTokens > 0 ? cachedTokens / promptTokens : 0,
              };
              import('../subscriptions/subscription-service').then(({ recordTokenConsumption }) =>
                recordTokenConsumption(psychologistId!, consumption)
              ).catch((err) =>
                logger.error('Failed to persist token consumption to Firestore', { error: err instanceof Error ? err.message : String(err) })
              );
            }
          }
        } catch (error) {
          logger.warn(`Could not extract streaming token usage:`, error);
        }
      }

    } catch (error) {
      logger.error(`Error in streaming wrapper:`, error);
      throw error;
    }
  })();

   // Copy any properties from the original stream result
  if (streamResult.routingInfo) {
    (wrappedGenerator as any).routingInfo = streamResult.routingInfo;
  }

  return wrappedGenerator;
}

export async function handleStreamingWithTools(
  result: any,
  sessionId: string,
  ctx: StreamingContext,
  interactionId?: string,
  psychologistId?: string,
  patientId?: string
): Promise<any> {
  const sessionData = ctx.activeChatSessions.get(sessionId)
  if (!sessionData) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  // 📊 Get enhanced message for token estimation fallback
  const currentHistory = sessionData.history || [];
  const lastUserMessage = currentHistory.filter((m: any) => m.role === 'user').pop();
  const enhancedMessage = lastUserMessage?.content || '';

  // 🔁 LOOP DETECTION: Per-message tool call history (request-scoped, auto-collected)
  const toolCallHistory = new Map<string, ToolCallRecord[]>();

  // Create a new async generator that properly handles function calls during streaming
  return (async function* () {
    let accumulatedText = ""
    let functionCalls: any[] = []
    let hasYieldedContent = false
    let finalResponse: any = null

    try {
      // 🔥 CRÍTICO: Iterar sobre result.stream (no result directamente)
      // Según SDK de Vertex AI: sendMessageStream() retorna { stream: AsyncIterator, response: Promise }
      const stream = result.stream || result;

      // Process the streaming result chunk by chunk
      for await (const chunk of stream) {
        // Always yield text chunks immediately for responsive UI
        const extractedText = extractTextFromChunk(chunk)
        if (extractedText) {
          accumulatedText += extractedText
          hasYieldedContent = true

          // Convertir vertex links en tiempo real
          let processedText = extractedText
          if (vertexLinkConverter.hasVertexLinks(processedText)) {
            logger.info('Detected vertex links in initial stream, converting...')
            const conversionResult = await vertexLinkConverter.convertResponse(
              processedText,
              chunk.groundingMetadata
            )
            processedText = conversionResult.convertedResponse

            if (conversionResult.conversionCount > 0) {
              logger.info(`Converted ${conversionResult.conversionCount} vertex links`)
            }
          }

          yield {
            ...chunk,
            text: processedText
          }
        }

        // Collect function calls as they arrive
        if (chunk.functionCalls) {
          functionCalls.push(...chunk.functionCalls)
        }

        // 📊 Store the final response object for token extraction
        if (chunk.candidates && chunk.candidates[0]) {
          finalResponse = chunk;
        }
      }

      // After the initial stream is complete, handle function calls if any
      if (functionCalls.length > 0) {
        logger.info(`Processing ${functionCalls.length} function calls`)

        // 🎯 Almacenar referencias académicas obtenidas de ParallelAI
        let academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}> = []

        // 🎨 UX: Emit tool_call_start for EVERY tool (generic, not just academic search)
        for (const call of functionCalls) {
          yield {
            text: "",
            metadata: {
              type: "tool_call_start",
              toolName: call.name,
              query: extractQueryFromArgs(call.name, call.args),
            }
          }
        }

        // 🎨 ProgressQueue: sub-agents push messages, generator drains them in real-time
        // Discriminated union supports both text progress and structured document events
        type ProgressEvent =
          | { kind: 'progress'; toolName: string; message: string }
          | { kind: 'document_preview'; toolName: string; preview: DocumentPreviewEvent }
          | { kind: 'document_ready'; toolName: string; document: DocumentReadyEvent };

        const progressQueue = new ProgressQueue<ProgressEvent>();
        const createProgressCallback = (toolName: string) => (message: string) => {
          progressQueue.push({ kind: 'progress', toolName, message });
        };
        const createDocumentPreviewCallback = (toolName: string) => (preview: DocumentPreviewEvent) => {
          progressQueue.push({ kind: 'document_preview', toolName, preview });
        };
        const createDocumentReadyCallback = (toolName: string) => (document: DocumentReadyEvent) => {
          progressQueue.push({ kind: 'document_ready', toolName, document });
        };

        // ─── P1.2: Build PreparedToolCall[] with security pre-checks + progress callbacks ───
        const preparedCalls: PreparedToolCall[] = functionCalls.map((call: any) =>
          prepareFunctionCallWithSecurity(call, psychologistId ?? null, sessionId, academicReferences, createProgressCallback(call.name), patientId, createDocumentPreviewCallback(call.name), createDocumentReadyCallback(call.name), toolCallHistory)
        );

        // Start tool execution WITHOUT awaiting — drain progress concurrently
        const executionPromise = executeToolsSafely(preparedCalls, { maxConcurrent: 3 })
          .then(results => { progressQueue.finish(); return results; })
          .catch(err => { progressQueue.finish(); throw err; });

        // Drain progress events in real-time while tools execute
        for await (const p of progressQueue) {
          switch (p.kind) {
            case 'progress':
              yield {
                text: "",
                metadata: {
                  type: "tool_call_progress",
                  toolName: p.toolName,
                  message: p.message,
                }
              };
              break;
            case 'document_preview':
              yield {
                text: "",
                metadata: {
                  type: "document_preview",
                  toolName: p.toolName,
                  preview: p.preview,
                }
              };
              break;
            case 'document_ready':
              yield {
                text: "",
                metadata: {
                  type: "document_ready",
                  toolName: p.toolName,
                  document: p.document,
                }
              };
              break;
          }
        }

        // Tools are done — get results
        const functionResponses = await executionPromise;

        // Filter out null responses
        const validResponses = functionResponses.filter(response => response !== null)

        // 🎨 UX: Emit tool_call_complete for EVERY tool
        for (const resp of validResponses) {
          const responseData = resp.response as any;
          yield {
            text: "",
            metadata: {
              type: "tool_call_complete",
              toolName: resp.name,
              sourcesFound: responseData?.total_found || responseData?.sourcesCount || responseData?.count || 0,
              sourcesValidated: responseData?.validated_count || responseData?.sourcesCount || 0,
              academicSources: (resp.name === 'search_academic_literature' || resp.name === 'research_evidence')
                ? (academicReferences.length > 0 ? academicReferences : undefined)
                : undefined,
              completionDetail: extractCompletionDetail(resp),
            }
          }
        }

        if (validResponses.length > 0) {
          logger.info(`Sending ${validResponses.length} function responses back to model`)

          // Send ALL function results back to the model (not just the first one)
          // Build an array of functionResponse parts for all valid responses
          const functionResponseParts = validResponses.map((resp: any) => ({
            functionResponse: {
              name: resp.name,
              response: {
                output: resp.response
              },
            },
          }))

          // Send all function responses using consistent array format
          const followUpResult = await sessionData.chat.sendMessageStream({
            message: functionResponseParts,
          })

          // 🔥 CRÍTICO: Iterar sobre followUpResult.stream (no followUpResult directamente)
          let currentStream = followUpResult.stream || followUpResult;

          // Handle recursive function calls: the follow-up response may itself contain
          // function calls that need another round-trip (max 3 iterations to prevent infinite loops)
          const MAX_FOLLOWUP_ROUNDS = 3
          for (let round = 0; round < MAX_FOLLOWUP_ROUNDS; round++) {
            let followUpFunctionCalls: any[] = []

            // Yield the follow-up response chunks
            for await (const chunk of currentStream) {
              const extractedText = extractTextFromChunk(chunk)
              if (extractedText) {
                hasYieldedContent = true

                // Convertir vertex links en el texto antes de enviar
                let processedText = extractedText
                if (vertexLinkConverter.hasVertexLinks(processedText)) {
                  logger.info('Detected vertex links in response, converting...')
                  const conversionResult = await vertexLinkConverter.convertResponse(
                    processedText,
                    chunk.groundingMetadata
                  )
                  processedText = conversionResult.convertedResponse

                  if (conversionResult.conversionCount > 0) {
                    logger.info(`Converted ${conversionResult.conversionCount} vertex links`)
                  }
                }

                yield {
                  ...chunk,
                  text: processedText
                }
              }

              // Collect any recursive function calls from the follow-up
              if (chunk.functionCalls) {
                followUpFunctionCalls.push(...chunk.functionCalls)
              }

              // Extract and yield grounding metadata with URLs if available
              if (chunk.groundingMetadata) {
                const urls = await extractUrlsFromGroundingMetadata(chunk.groundingMetadata)
                if (urls.length > 0) {
                  // 🎯 UX: Emitir evento con el número REAL de fuentes usadas por Gemini
                  yield {
                    text: "",
                    metadata: {
                      type: "sources_used_by_ai",
                      sourcesUsed: urls.length
                    }
                  }

                  yield {
                    text: "",
                    groundingUrls: urls,
                    metadata: {
                      type: "grounding_references",
                      sources: urls
                    }
                  }
                }
              }
            }

            // If no more function calls, we're done
            if (followUpFunctionCalls.length === 0) break

            // Execute recursive function calls (multi-step agentic chains)
            // The model may call list_patients → get result → then call explore_patient_context
            // We must execute each step and return real results, not just acknowledge
            logger.info(`Follow-up round ${round + 1}: executing ${followUpFunctionCalls.length} recursive function calls`)

            // Emit tool_call_start for recursive calls
            for (const call of followUpFunctionCalls) {
              yield {
                text: "",
                metadata: {
                  type: "tool_call_start",
                  toolName: call.name,
                  query: extractQueryFromArgs(call.name, call.args),
                }
              }
            }

            // Build PreparedToolCalls with security checks
            // Pass document callbacks for recursive calls too (e.g., generate_clinical_document may be called in a follow-up round)
            // Create a fresh progress queue for this recursive round so events are drained in real-time
            const recursiveProgressQueue = new ProgressQueue<ProgressEvent>();
            const createRecursiveProgressCb = (toolName: string) => (message: string) => {
              recursiveProgressQueue.push({ kind: 'progress', toolName, message });
            };
            const createRecursiveDocPreviewCb = (toolName: string) => (preview: DocumentPreviewEvent) => {
              recursiveProgressQueue.push({ kind: 'document_preview', toolName, preview });
            };
            const createRecursiveDocReadyCb = (toolName: string) => (document: DocumentReadyEvent) => {
              recursiveProgressQueue.push({ kind: 'document_ready', toolName, document });
            };

            const recursivePreparedCalls: PreparedToolCall[] = followUpFunctionCalls.map((call: any) =>
              prepareFunctionCallWithSecurity(call, psychologistId ?? null, sessionId, academicReferences, createRecursiveProgressCb(call.name), patientId, createRecursiveDocPreviewCb(call.name), createRecursiveDocReadyCb(call.name), toolCallHistory)
            );

            // Start execution without awaiting — drain progress concurrently (same pattern as initial round)
            const recursiveExecutionPromise = executeToolsSafely(recursivePreparedCalls, { maxConcurrent: 3 })
              .then(results => { recursiveProgressQueue.finish(); return results; })
              .catch(err => { recursiveProgressQueue.finish(); throw err; });

            // Drain recursive progress events in real-time
            for await (const p of recursiveProgressQueue) {
              switch (p.kind) {
                case 'progress':
                  yield { text: "", metadata: { type: "tool_call_progress", toolName: p.toolName, message: p.message } };
                  break;
                case 'document_preview':
                  yield { text: "", metadata: { type: "document_preview", toolName: p.toolName, preview: p.preview } };
                  break;
                case 'document_ready':
                  yield { text: "", metadata: { type: "document_ready", toolName: p.toolName, document: p.document } };
                  break;
              }
            }

            // Execute with orchestrator (parallel read, sequential write)
            const recursiveResponses = await recursiveExecutionPromise;
            const validRecursiveResponses = recursiveResponses.filter(r => r !== null);

            // Emit tool_call_complete for recursive calls
            for (const resp of validRecursiveResponses) {
              const responseData = resp.response as any;
              yield {
                text: "",
                metadata: {
                  type: "tool_call_complete",
                  toolName: resp.name,
                  sourcesFound: responseData?.total_found || responseData?.sourcesCount || responseData?.count || 0,
                  completionDetail: extractCompletionDetail(resp),
                }
              }
            }

            // Send real results back to the model
            const recursiveResponseParts = validRecursiveResponses.map((resp: any) => ({
              functionResponse: {
                name: resp.name,
                response: {
                  output: resp.response
                },
              },
            }))

            const recursiveResult = await sessionData.chat.sendMessageStream({
              message: recursiveResponseParts,
            })
            currentStream = recursiveResult.stream || recursiveResult
          }

          // 🎯 NUEVA FUNCIONALIDAD: Emitir referencias académicas de ParallelAI al final del streaming
          if (academicReferences.length > 0) {
            logger.info(`Emitting ${academicReferences.length} academic references from ParallelAI`)
            yield {
              text: "",
              metadata: {
                type: "academic_references",
                references: academicReferences
              }
            }
          }
        }
      }

      // If no content was yielded at all, yield an empty chunk to prevent UI hanging
      if (!hasYieldedContent) {
        logger.warn('No content yielded, providing fallback')
        yield { text: "" }
      }

      // 📊 CAPTURE METRICS AFTER STREAM COMPLETION (with tools)
      logger.info(`Stream with tools complete - interactionId: ${interactionId}, finalResponse exists: ${!!finalResponse}, accumulated text length: ${accumulatedText.length}`);

      if (interactionId && finalResponse) {
        try {
          // Try to extract token usage from the final response
          const usageMetadata = finalResponse.usageMetadata;
          if (usageMetadata) {
            sessionMetricsTracker.recordModelCallComplete(
              interactionId,
              usageMetadata.promptTokenCount || 0,
              usageMetadata.candidatesTokenCount || 0,
              accumulatedText
            );

            const cachedTokens = usageMetadata.cachedContentTokenCount ?? 0;
            const cacheHitRatio = usageMetadata.promptTokenCount ? cachedTokens / usageMetadata.promptTokenCount : 0;
            logger.info(`Streaming with tools - Token usage - Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}, Cached: ${cachedTokens}, CacheHitRatio: ${(cacheHitRatio * 100).toFixed(1)}%`);
          } else {
            // Fallback: estimate tokens
            const inputTokens = Math.ceil(enhancedMessage.length / 4);
            const outputTokens = Math.ceil(accumulatedText.length / 4);
            sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, accumulatedText);

            logger.info(`Streaming with tools - Token usage (estimated) - Input: ${inputTokens}, Output: ${outputTokens}`);
          }

          // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
          const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
          if (completedMetrics) {
            logger.info(`Streaming with tools interaction completed - Cost: $${completedMetrics.tokens.estimatedCost.toFixed(6)}, Tokens: ${completedMetrics.tokens.totalTokens}, Time: ${completedMetrics.timing.totalResponseTime}ms`);

            // 🔥 PERSIST TOKEN CONSUMPTION TO FIRESTORE (fire-and-forget, dynamic import to avoid server-only in client bundle)
            if (psychologistId && completedMetrics.tokens.totalTokens > 0) {
              const cachedTokens = finalResponse?.usageMetadata?.cachedContentTokenCount ?? 0;
              const promptTokens = completedMetrics.tokens.inputTokens;
              const consumption: TokenConsumption = {
                promptTokens,
                responseTokens: completedMetrics.tokens.outputTokens,
                totalTokens: completedMetrics.tokens.totalTokens,
                timestamp: new Date().toISOString(),
                sessionId: completedMetrics.sessionId,
                agentType: completedMetrics.computational?.agentUsed || 'unknown',
                cachedContentTokens: cachedTokens,
                cacheHitRatio: promptTokens > 0 ? cachedTokens / promptTokens : 0,
              };
              import('../subscriptions/subscription-service').then(({ recordTokenConsumption }) =>
                recordTokenConsumption(psychologistId!, consumption)
              ).catch((err) =>
                logger.error('Failed to persist token consumption to Firestore', { error: err instanceof Error ? err.message : String(err) })
              );
            }
          }
        } catch (error) {
          logger.warn(`Could not extract streaming with tools token usage:`, error);
        }
      }

    } catch (error) {
      logger.error("Error in streaming with tools:", error)
      // Yield error information as a chunk
      yield {
        text: "Lo siento, hubo un error procesando tu solicitud. Por favor, inténtalo de nuevo.",
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  })()
}

export async function handleNonStreamingWithTools(
  result: any,
  sessionId: string,
  ctx: StreamingContext,
  psychologistId?: string,
  patientId?: string
): Promise<any> {
  const functionCalls = result.functionCalls
  let academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}> = []

  // 🔁 LOOP DETECTION: Per-message tool call history (request-scoped, auto-collected)
  const toolCallHistory = new Map<string, ToolCallRecord[]>();

  if (functionCalls && functionCalls.length > 0) {
    // ─── P1.2: Build PreparedToolCall[] with security pre-checks, then orchestrate ───
    const preparedCalls: PreparedToolCall[] = functionCalls.map((call: any) =>
      prepareFunctionCallWithSecurity(call, psychologistId ?? null, sessionId, academicReferences, undefined, patientId, undefined, undefined, toolCallHistory)
    );

    // 🎯 P1.2: Execute with concurrency limits and per-tool error isolation
    const functionResponses = await executeToolsSafely(preparedCalls, { maxConcurrent: 3 });

    // Filter out null responses
    const validResponses = functionResponses.filter(response => response !== null);

    // Send function results back to the model
    const sessionData = ctx.activeChatSessions.get(sessionId)
    if (sessionData) {
      // Send ALL function responses back (not just the first one)
      // This matches the streaming path behavior and is required for
      // parallel function calls to work correctly with Gemini's thoughtSignature
      const functionResponseParts = validResponses.map((resp: any) => ({
        functionResponse: {
          name: resp.name,
          response: {
            output: resp.response
          },
        },
      }));

      const followUpResult = await sessionData.chat.sendMessage({
        message: functionResponseParts,
      })

      // NUEVO: Convertir vertex links en la respuesta
      if (followUpResult.text && vertexLinkConverter.hasVertexLinks(followUpResult.text)) {
        logger.info('Detected vertex links in non-streaming response, converting...')
        const conversionResult = await vertexLinkConverter.convertResponse(
          followUpResult.text,
          followUpResult.groundingMetadata
        )
        followUpResult.text = conversionResult.convertedResponse

        if (conversionResult.conversionCount > 0) {
          logger.info(`Converted ${conversionResult.conversionCount} vertex links`)
        }
      }

      // Extract URLs from grounding metadata if available
      if (followUpResult.groundingMetadata) {
        const urls = await extractUrlsFromGroundingMetadata(followUpResult.groundingMetadata)
        if (urls.length > 0) {
          followUpResult.groundingUrls = urls
          followUpResult.metadata = {
            ...followUpResult.metadata,
            type: "grounding_references",
            sources: urls
          }
        }
      }

      // 📚 Agregar referencias académicas de ParallelAI
      if (academicReferences.length > 0) {
        logger.info(`Adding ${academicReferences.length} academic references to non-streaming response`)
        followUpResult.groundingUrls = [
          ...(followUpResult.groundingUrls || []),
          ...academicReferences
        ]
      }

      return followUpResult
    }
  }

  return result
}

// ============================================================================
// LOOP DETECTION & RETRY PREVENTION (Phase 2 Academic Research Optimization)
// ============================================================================

interface ToolCallRecord {
  queryHash: string
  timestamp: number
  attempt: number
  result?: 'success' | 'empty' | 'error'
}

/**
 * Normalizes tool arguments for consistent hashing across retries
 */
function normalizeToolArgs(toolName: string, args: Record<string, any>): string {
  if (toolName === 'research_evidence') {
    // Normalize research question: lowercase, trim, remove extra spaces
    const query = (args.research_question || args.query || '').toLowerCase().trim().replace(/\s+/g, ' ')
    const focus = (args.focus_area || '').toLowerCase().trim().replace(/\s+/g, ' ')
    return `research_evidence:${query}${focus ? '|' + focus : ''}`
  }

  if (toolName === 'search_academic_literature') {
    // Normalize query: lowercase, trim, remove extra spaces
    const query = (args.query || '').toLowerCase().trim().replace(/\s+/g, ' ')
    return `search_academic_literature:${query}`
  }

  // Default: JSON stringify with sorted keys for consistent hashing
  const sortedKeys = Object.keys(args).sort()
  const normalized: Record<string, any> = {}
  for (const key of sortedKeys) {
    normalized[key] = args[key]
  }
  return `${toolName}:${JSON.stringify(normalized)}`
}

/**
 * Generates SHA-256 hash of normalized tool arguments
 */
function sha256(input: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Detects if a tool call is a duplicate retry within the same message
 */
function detectToolLoop(
  toolName: string,
  args: Record<string, any>,
  history: Map<string, ToolCallRecord[]>
): { isLoop: boolean; attemptCount: number } {
  // Only track research-related tools that can loop
  const trackedTools = new Set(['research_evidence', 'search_academic_literature'])
  if (!trackedTools.has(toolName)) {
    return { isLoop: false, attemptCount: 1 }
  }

  // Normalize and hash arguments
  const normalizedQuery = normalizeToolArgs(toolName, args)
  const queryHash = sha256(normalizedQuery)

  // Get tool's call history
  const toolHistory = history.get(toolName) || []

  // Find matching previous calls within last 60 seconds (request window)
  const now = Date.now()
  const recentMatches = toolHistory.filter(record =>
    record.queryHash === queryHash &&
    (now - record.timestamp) < 60000  // 60s window
  )

  // Determine if loop (≥2 previous identical calls = 3rd attempt triggers loop)
  const attemptCount = recentMatches.length + 1  // +1 for current call
  const isLoop = attemptCount > 2  // After 2 attempts, 3rd triggers escape hatch

  if (isLoop) {
    logger.warn(`[LOOP DETECTED] ${toolName} attempt #${attemptCount}, query hash: ${queryHash.substring(0, 8)}...`)
  }

  return { isLoop, attemptCount }
}

/**
 * Records a tool call execution in the history
 */
function recordToolCall(
  history: Map<string, ToolCallRecord[]>,
  toolName: string,
  args: Record<string, any>,
  result: ToolCallResult
): void {
  // Only track research-related tools
  const trackedTools = new Set(['research_evidence', 'search_academic_literature'])
  if (!trackedTools.has(toolName)) {
    return
  }

  const normalizedQuery = normalizeToolArgs(toolName, args)
  const queryHash = sha256(normalizedQuery)

  const responseData = result.response as Record<string, any> | null
  const sourcesCount = responseData?.sourcesCount ?? responseData?.results?.length ?? 0

  const record: ToolCallRecord = {
    queryHash,
    timestamp: Date.now(),
    attempt: (history.get(toolName)?.length || 0) + 1,
    result: responseData?.error ? 'error' : (sourcesCount === 0 ? 'empty' : 'success')
  }

  const toolHistory = history.get(toolName) || []
  toolHistory.push(record)
  history.set(toolName, toolHistory)

  logger.info(`[TOOL RECORDED] ${toolName} attempt #${record.attempt}, result: ${record.result}, sources: ${sourcesCount}`)
}

/**
 * Generates fallback response when research tool loop is detected
 * Uses general pharmacological knowledge instead of failing silently
 */
async function generatePharmacologyFallbackResponse(
  toolName: string,
  args: Record<string, any>,
  attemptCount: number
): Promise<ToolCallResult> {
  const query = args.research_question || args.query || 'unknown query'

  logger.info(`[FALLBACK TRIGGER] Generating pharmacology fallback for: "${query}" (attempt #${attemptCount})`)

  // Use Gemini Flash-Lite for fast, low-cost fallback generation
  const { ai } = await import('../google-genai-config')
  const SUBAGENT_MODEL = 'gemini-2.0-flash-lite'

  const prompt = `Eres un asistente de farmacología clínica. El usuario investigó sobre:
"${query}"

No se encontraron estudios académicos específicos en bases de datos. Sin embargo, proporciona una síntesis basada en:

1. **Principios farmacológicos generales** relevantes al tema
2. **Mecanismos de acción** de los fármacos mencionados (si aplica)
3. **Consideraciones clínicas estándar** basadas en farmacología básica
4. **Advertencia clara**: Esta respuesta se basa en principios farmacológicos generales, no en estudios específicos. Se recomienda consultar literatura actualizada y guías clínicas oficiales para el caso particular.

**Formato**: Profesional, conciso (máximo 200 palabras), en español clínico.
**Tono**: Informativo pero cauteloso, reconociendo la limitación de evidencia específica.`

  try {
    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        maxOutputTokens: 400, // ~200 words
      },
    })

    const synthesis = result.text || 'No se pudo generar síntesis de farmacología.'

    return {
      name: toolName,
      response: {
        synthesis,
        sourcesCount: 0,
        metadata: {
          fallbackReason: 'loop_detected',
          originalQuery: query,
          attemptCount,
          synthesisMethod: 'pharmacological-principles',
          evidenceLevel: 'expert-opinion',
          warningFlags: ['no-specific-literature-found', 'general-pharmacology-only']
        }
      }
    }
  } catch (error) {
    logger.error(`[FALLBACK ERROR] Failed to generate pharmacology fallback:`, error)

    // Ultra-safe fallback: structured error response
    return {
      name: toolName,
      response: {
        synthesis: `⚠️ No se encontró literatura específica para: "${query}"\n\nEsta búsqueda ha sido intentada múltiples veces sin resultados. Recomendaciones:\n\n1. Reformular la pregunta con términos más generales\n2. Consultar fuentes farmacológicas básicas (monografías de fármacos)\n3. Considerar consulta con especialista en psicofarmacología\n\nLa falta de literatura específica puede indicar:\n- Combinación de fármacos poco estudiada\n- Necesidad de evaluar interacciones por mecanismos farmacológicos\n- Importancia del monitoreo clínico individualizado`,
        sourcesCount: 0,
        metadata: {
          fallbackReason: 'loop_detected',
          originalQuery: query,
          attemptCount,
          synthesisMethod: 'static-guidance',
          evidenceLevel: 'general-recommendations'
        }
      }
    }
  }
}
