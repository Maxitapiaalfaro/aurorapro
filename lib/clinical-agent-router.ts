import { ai, aiFiles } from "./google-genai-config"
import { createUnifiedAgentConfig } from "./agents/agent-definitions"
import { clinicalFileManager, createPartFromUri } from "./clinical-file-manager"
import { sessionMetricsTracker } from "./session-metrics-comprehensive-tracker"
import { PerformanceLogger } from "./performance-logger"
// P1.1: Reactive context compaction — detect context-exhausted errors and compact history
import { ContextWindowManager, isContextExhaustedError } from "./context-window-manager"
// P3: Streaming & Tool handler — extracted to agents/streaming-handler.ts
import { createMetricsStreamingWrapper, handleStreamingWithTools, extractTextFromChunk, estimateTokenCount } from "./agents/streaming-handler"
import { buildEnhancedMessage } from "./agents/message-context-builder"
import type { AgentType, AgentConfig, ChatMessage } from "@/types/clinical-types"
import { createLogger } from '@/lib/logger'

const logger = createLogger('agent')

// Import academicMultiSourceSearch only on server to avoid bundling in client
// Removed top-level require to avoid build issues, will import dynamically


// Escape XML-special characters in strings interpolated into XML-style tags
function escapeXml(str: string): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class ClinicalAgentRouter {
  private unifiedConfig!: AgentConfig
  private activeChatSessions: Map<string, { chat: any; agent: AgentType; usesApiKeyClient?: boolean; history?: any[] }> = new Map()
  // Session-scoped caches to avoid re-fetching and re-verifying files each turn
  private sessionFileCache: Map<string, Map<string, any>> = new Map()
  private verifiedActiveMap: Map<string, Set<string>> = new Map()
  // 🔧 FIX: Track which files have been sent FULLY (via URI) per session to avoid re-sending
  private filesFullySentMap: Map<string, Set<string>> = new Map()

  // 🧹 CLEANUP: Track session activity for automatic cleanup
  private sessionLastActivity = new Map<string, number>()
  private cleanupTimer: NodeJS.Timeout | null = null
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutos de inactividad

  // P1.1: Context window manager for reactive compaction
  private contextWindowManager = new ContextWindowManager()
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000  // Verificar cada 5 minutos

  constructor() {
    this.initializeAgents()
    this.startAutomaticCleanup()
  }

  // Prompt Information Block
  // Version: 6.0
  // Author: Synapse Architect
  // Changelog v5.0 → v6.0: Expert clinical supervision architecture. Replaced PPM model with
  // comprehensive case formulation framework based on hypothesis generation/testing, functional
  // analysis, diagnostic discrimination, and testable predictions. Emphasizes parsimony,
  // explanatory power, and development of clinical competencies. Research-informed approach
  // aligned with expert supervisor competencies (Eells, Gilboa-Schechtman, Page et al.).

  private initializeAgents() {
    this.unifiedConfig = createUnifiedAgentConfig()
  }

  async createChatSession(sessionId: string, _agent?: AgentType, history?: ChatMessage[]): Promise<any> {
    const agentConfig = this.unifiedConfig

    try {
      let geminiHistory = history ? await this.convertHistoryToGeminiFormat(sessionId, history) : []

      // Detect if any message in history references files uploaded via API-key Files API.
      // When Vertex AI is the main client, it cannot resolve file URIs from the API-key
      // endpoint (generativelanguage.googleapis.com vs aiplatform.googleapis.com).
      // In that case, we must use the API-key client (aiFiles) for the chat session.
      const historyHasFiles = history?.some(m => m.fileReferences && m.fileReferences.length > 0) || false
      const client = historyHasFiles ? aiFiles : ai

      // Create chat session using the correct SDK API
      const chat = client.chats.create({
        model: agentConfig.config.model || 'gemini-3.1-flash-lite-preview',
        config: {
          temperature: agentConfig.config.temperature,
          topK: agentConfig.config.topK,
          topP: agentConfig.config.topP,
          maxOutputTokens: agentConfig.config.maxOutputTokens,
          safetySettings: agentConfig.config.safetySettings,
          systemInstruction: agentConfig.systemInstruction,
          tools: agentConfig.tools && agentConfig.tools.length > 0 ? agentConfig.tools : undefined,
          thinkingConfig: agentConfig.config.thinkingConfig,
        },
        history: geminiHistory,
      })

      this.activeChatSessions.set(sessionId, { chat, agent: 'socratico', usesApiKeyClient: historyHasFiles })
      // Prepare caches for this session
      if (!this.sessionFileCache.has(sessionId)) this.sessionFileCache.set(sessionId, new Map())
      if (!this.verifiedActiveMap.has(sessionId)) this.verifiedActiveMap.set(sessionId, new Set())
      if (!this.filesFullySentMap.has(sessionId)) this.filesFullySentMap.set(sessionId, new Set())

      // 🧹 CLEANUP: Track session activity
      this.updateSessionActivity(sessionId)

      return chat
    } catch (error) {
      logger.error("Error creating chat session", { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  async convertHistoryToGeminiFormat(sessionId: string, history: ChatMessage[]) {
    // Find the most recent message that actually has file references
    const lastMsgWithFilesIdx = [...history].reverse().findIndex(m => m.fileReferences && m.fileReferences.length > 0)
    const attachIndex = lastMsgWithFilesIdx === -1 ? -1 : history.length - 1 - lastMsgWithFilesIdx

    return Promise.all(history.map(async (msg, idx) => {
      const parts: any[] = [{ text: msg.content }]

      // OPTIMIZATION (FIXED): Attach files for the most recent message that included fileReferences
      // This ensures agent switches recreate context with the actual file parts
      const isAttachmentCarrier = idx === attachIndex

      // ARQUITECTURA OPTIMIZADA: Procesamiento dinámico de archivos por ID
      if (isAttachmentCarrier && msg.fileReferences && msg.fileReferences.length > 0) {
        logger.debug(`Processing files for latest message only: ${msg.fileReferences.length} file IDs`)

        try {
          // Resolve file objects using session cache first
          const cache = this.sessionFileCache.get(sessionId) || new Map<string, any>()
          this.sessionFileCache.set(sessionId, cache)
          const missing: string[] = []
          const fileObjects: any[] = []
          for (const id of msg.fileReferences) {
            const cached = cache.get(id)
            if (cached) fileObjects.push(cached)
            else missing.push(id)
          }
          if (missing.length > 0) {
            const { getFilesByIds } = await import('./hopeai-system')
            const fetched = await getFilesByIds(missing)
            fetched.forEach((f: any) => {
              cache.set(f.id, f)
              fileObjects.push(f)
            })
          }

          if (fileObjects.length > 0) {
            // Prepend a clear textual annotation so the agent knows files are attached
            const fileDescriptions = fileObjects
              .filter(f => f.geminiFileUri || f.geminiFileId)
              .map(f => `- ${escapeXml(f.name)} (${escapeXml(f.type || 'unknown')})`)
            if (fileDescriptions.length > 0) {
              parts[0] = {
                text: `<archivos_adjuntos>\nEl terapeuta adjuntó los siguientes documentos a este mensaje. Su contenido completo está disponible en las partes de archivo que acompañan este turno.\n${fileDescriptions.join('\n')}\n</archivos_adjuntos>\n\n${msg.content}`
              }
            }

            for (const fileRef of fileObjects) {
              if (fileRef.geminiFileUri || fileRef.geminiFileId) {
                try {
                  // Usar geminiFileUri si está disponible, sino usar geminiFileId como fallback
                  const fileUri = fileRef.geminiFileUri || (fileRef.geminiFileId?.startsWith('files/')
                    ? fileRef.geminiFileId
                    : `files/${fileRef.geminiFileId}`)

                  if (!fileUri) {
                    logger.error(`No valid URI found for file reference: ${fileRef.name}`)
                    continue
                  }

                  logger.debug(`Adding file to context: ${fileRef.name}`, { uri: fileUri })

                  // Verify ACTIVE only once per session
                  const verifiedSet = this.verifiedActiveMap.get(sessionId) || new Set<string>()
                  this.verifiedActiveMap.set(sessionId, verifiedSet)
                  const fileIdForCheck = fileRef.geminiFileId || fileUri
                  if (!verifiedSet.has(fileIdForCheck)) {
                    try {
                      await clinicalFileManager.waitForFileToBeActive(fileIdForCheck, 30000)
                      verifiedSet.add(fileIdForCheck)
                    } catch (fileError) {
                      logger.error(`File not ready or not found: ${fileUri}`, { error: fileError instanceof Error ? fileError.message : String(fileError) })
                      continue
                    }
                  }

                  // Usar createPartFromUri para crear la parte del archivo correctamente
                  const filePart = createPartFromUri(fileUri, fileRef.type)

                  parts.push(filePart)
                  logger.debug(`Successfully added file part for: ${fileRef.name}`)
                } catch (error) {
                  logger.error(`Error processing file reference ${fileRef.name}`, { error: error instanceof Error ? error.message : String(error) })
                  // Continuar con el siguiente archivo en lugar de fallar completamente
                  continue
                }
              }
            }
          }
        } catch (error) {
          logger.error(`Error retrieving files by IDs`, { error: error instanceof Error ? error.message : String(error) })
          // Continuar sin archivos si hay error en la recuperación
        }
      }

      return {
        role: msg.role,
        parts: parts,
      }
    }))
  }

  async sendMessage(
  sessionId: string,
  message: string,
  useStreaming = true,
  enrichedContext?: any,
  interactionId?: string,  // 📊 Add interaction ID for metrics tracking
  psychologistId?: string  // 🔒 P0.1: Identity for tool permission checks
): Promise<any> {
    const sessionData = this.activeChatSessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Chat session not found: ${sessionId}. Active sessions: ${Array.from(this.activeChatSessions.keys()).join(', ')}`)
    }

    let chat = sessionData.chat

    // 🧹 CLEANUP: Update session activity on every message
    this.updateSessionActivity(sessionId)

    try {
      // Enriquecer el mensaje con contexto si está disponible
      // 📊 PHASE 5: Measure message context building (this is what "routing" measures in the orchestration path)
      const contextBuildStart = performance.now()
      let enhancedMessage = message
      if (enrichedContext) {
        enhancedMessage = buildEnhancedMessage(message, enrichedContext, 'socratico')
      }
      const contextBuildDuration = performance.now() - contextBuildStart
      PerformanceLogger.log('context-building', contextBuildDuration)

      // 📊 RECORD MODEL CALL START - Estimate context tokens if interaction tracking enabled
      if (interactionId) {
        const currentHistory = sessionData.history || [];
        const contextTokens = estimateTokenCount(currentHistory);
        const modelUsed = this.unifiedConfig.config?.model || 'gemini-3.1-flash-lite-preview';
        sessionMetricsTracker.recordModelCallStart(interactionId, modelUsed, contextTokens);
      }

      // Construir las partes del mensaje (texto + archivos adjuntos)
      const messageParts: any[] = [{ text: enhancedMessage }]

      // 🔧 FIX: Estrategia de archivos - SOLO enviar completo en primer turno
      // Turnos posteriores: solo referencia ligera para evitar sobrecarga de tokens
      if (enrichedContext?.sessionFiles && Array.isArray(enrichedContext.sessionFiles) && enrichedContext.sessionFiles.length > 0) {
        logger.debug(`📁 Processing sessionFiles for attachment`, {
          totalFiles: enrichedContext.sessionFiles.length,
          fileNames: enrichedContext.sessionFiles.map((f: any) => f.name)
        })

        // Heurística: adjuntar solo los archivos más recientes o con índice
        const files = (enrichedContext.sessionFiles as any[])
          .slice(-2) // preferir los últimos 2
          .sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0)) // ligera priorización si tienen índice
          .slice(0, 2)

        // 🔧 FIX CRÍTICO: Usar Map dedicado para detectar si es primer turno
        // filesFullySentMap rastrea qué archivos ya fueron enviados completos en esta sesión
        const fullySentFiles = this.filesFullySentMap.get(sessionId) || new Set<string>();
        this.filesFullySentMap.set(sessionId, fullySentFiles);

        // Detectar si ALGUNO de estos archivos NO ha sido enviado completo aún
        const hasUnsentFiles = files.some(f => !fullySentFiles.has(f.id || f.geminiFileId || f.geminiFileUri));

        logger.debug(`📁 File attachment decision`, {
          hasUnsentFiles,
          filesToProcess: files.length,
          filesAlreadySent: Array.from(fullySentFiles),
          currentFiles: files.map((f: any) => ({
            id: f.id,
            name: f.name,
            geminiFileUri: f.geminiFileUri,
            alreadySent: fullySentFiles.has(f.id || f.geminiFileId || f.geminiFileUri)
          }))
        })

        if (hasUnsentFiles) {
          // ✅ PRIMER TURNO: Adjuntar archivo completo vía URI
          logger.info(`🔵 First turn detected: Attaching FULL files (${files.length}) via URI`);

          // Prepend textual file annotation so the agent knows files are attached
          const fileDescriptions = files
            .filter(f => f.geminiFileUri || f.geminiFileId)
            .map(f => `- ${escapeXml(f.name)} (${escapeXml(f.type || 'unknown')})`)
          if (fileDescriptions.length > 0) {
            messageParts[0].text = `<archivos_adjuntos>\nEl terapeuta adjuntó los siguientes documentos. Su contenido completo está en las partes de archivo de este mensaje.\n${fileDescriptions.join('\n')}\n</archivos_adjuntos>\n\n${enhancedMessage}`
          }

          for (const fileRef of files) {
            try {
              // Cache session-level
              const cache = this.sessionFileCache.get(sessionId) || new Map<string, any>()
              this.sessionFileCache.set(sessionId, cache)
              if (fileRef?.id) cache.set(fileRef.id, fileRef)
              if (!fileRef?.geminiFileId && !fileRef?.geminiFileUri) continue
              const fileUri = fileRef.geminiFileUri || (fileRef.geminiFileId?.startsWith('files/')
                ? fileRef.geminiFileId
                : `files/${fileRef.geminiFileId}`)
              if (!fileUri) continue

              // Verificar que esté ACTIVE antes de adjuntar
              const verifiedSet = this.verifiedActiveMap.get(sessionId) || new Set<string>()
              this.verifiedActiveMap.set(sessionId, verifiedSet)
              const fileIdForCheck = fileRef.geminiFileId || fileUri
              if (!verifiedSet.has(fileIdForCheck)) {
                try {
                  await clinicalFileManager.waitForFileToBeActive(fileIdForCheck, 30000)
                  verifiedSet.add(fileIdForCheck)
                } catch (e) {
                  logger.warn(`Skipping non-active file: ${fileUri}`)
                  continue
                }
              }

              const filePart = createPartFromUri(fileUri, fileRef.type)
              messageParts.push(filePart)

              // 🔧 FIX: Marcar archivo como "enviado completo" para que próximos turnos usen referencia ligera
              const fileIdentifier = fileRef.id || fileRef.geminiFileId || fileRef.geminiFileUri;
              if (fileIdentifier) {
                fullySentFiles.add(fileIdentifier);
              }

              logger.info(`✅ Attached FULL file: ${fileRef.name} (${fileRef.size ? Math.round(fileRef.size / 1024) + 'KB' : 'size unknown'})`)
            } catch (err) {
              logger.error('Error attaching session file', { error: err instanceof Error ? err.message : String(err) })
            }
          }
        } else {
          // ✅ TURNOS POSTERIORES: Solo referencia ligera textual (ahorra ~60k tokens)
          logger.info(`🟢 Subsequent turn detected: Using LIGHTWEIGHT file references (saves ~60k tokens)`);

          const fileReferences = files.map(f => {
            const safeName = escapeXml(f.name)
            const summary = f.summary || `Documento: ${safeName}`;
            const fileInfo = [
              `- ${safeName}`,
              f.type ? `(${escapeXml(f.type)})` : '',
              f.outline ? `| Contenido: ${escapeXml(f.outline)}` : `| ${escapeXml(summary)}`,
              f.keywords?.length ? `| Keywords: ${f.keywords.slice(0, 5).map(escapeXml).join(', ')}` : ''
            ].filter(Boolean).join(' ');
            return fileInfo;
          }).join('\n');

          // Prefijar el mensaje con contexto ligero de archivos usando XML tags
          messageParts[0].text = `<archivos_en_contexto>\nDocumentos previamente procesados en esta sesión (contenido completo ya fue compartido):\n${fileReferences}\n</archivos_en_contexto>\n\n${enhancedMessage}`;
          logger.info(`✅ Added lightweight file context (~${fileReferences.length} chars vs ~60k tokens)`);
        }
      }

      // Convert message to correct SDK format
      // La búsqueda académica ahora es manejada por el agente como herramienta (tool)
      const messageParams = {
        message: messageParts
      }

      let result;

      // ================================================================
      // P1.1: REACTIVE CONTEXT COMPACTION — Try-Catch with Transparent Retry
      //
      // Flow:
      // 1. Attempt the API call (streaming or non-streaming)
      // 2. If a context-exhausted error occurs (prompt too long / RESOURCE_EXHAUSTED
      //    due to token limits), compact the history and retry ONCE
      // 3. Rate-limit 429s are handled separately with exponential backoff (existing)
      // 4. The compacted history is stored back into sessionData so Firestore
      //    persistence and the UI layer stay in sync
      // ================================================================

      if (useStreaming) {
        // 🔁 Retry with exponential backoff for 429 RESOURCE_EXHAUSTED errors
        const MAX_RETRIES = 3;
        let streamResult: any;
        let contextCompacted = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            streamResult = await chat.sendMessageStream(messageParams);
            break; // Success - exit retry loop
          } catch (err: any) {
            // ─── P1.1: Check if this is a context-window-exhausted error ───
            if (isContextExhaustedError(err) && !contextCompacted) {
              logger.warn(`🗜️ Context window exhausted on streaming attempt ${attempt}. Triggering reactive compaction...`);

              const compactionResult = await this.performReactiveCompaction(sessionId);
              if (compactionResult) {
                // Update chat reference after session recreation
                const newSessionData = this.activeChatSessions.get(sessionId);
                if (newSessionData) {
                  chat = newSessionData.chat;
                }
                contextCompacted = true;
                // Retry from the next iteration
                continue;
              }
              // If compaction failed, fall through to throw
              throw err;
            }

            // ─── Existing: Rate-limit 429 backoff ───
            const is429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
            if (is429 && !isContextExhaustedError(err) && attempt < MAX_RETRIES) {
              const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
              logger.warn(`⏳ 429 rate limit on attempt ${attempt}/${MAX_RETRIES}, retrying in ${backoffMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
            throw err; // Non-retryable or exhausted retries
          }
        }

        // Unified agent always has tools — handle function calls via streaming handler
        const patientId = enrichedContext?.patient_reference as string | undefined
        result = await handleStreamingWithTools(streamResult, sessionId, { activeChatSessions: this.activeChatSessions }, interactionId, psychologistId, patientId)
      } else {
        // ─── Non-streaming path with P1.1 reactive compaction ───
        try {
          result = await chat.sendMessage(messageParams)
        } catch (err: any) {
          if (isContextExhaustedError(err)) {
            logger.warn(`🗜️ Context window exhausted on non-streaming call. Triggering reactive compaction...`);

            const compactionResult = await this.performReactiveCompaction(sessionId);
            if (compactionResult) {
              // Update chat reference after session recreation
              const newSessionData = this.activeChatSessions.get(sessionId);
              if (newSessionData) {
                chat = newSessionData.chat;
              }
              // Retry once with compacted history
              result = await chat.sendMessage(messageParams);
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }

        // 📊 RECORD MODEL CALL COMPLETION for non-streaming
        if (interactionId && result?.response) {
          try {
            const response = result.response;
            const responseText = extractTextFromChunk(response) || '';

            // Extract token usage from response metadata if available
            const usageMetadata = response.usageMetadata;
            if (usageMetadata) {
              sessionMetricsTracker.recordModelCallComplete(
                interactionId,
                usageMetadata.promptTokenCount || 0,
                usageMetadata.candidatesTokenCount || 0,
                responseText
              );

              logger.debug(`📊 Token usage`, { input: usageMetadata.promptTokenCount, output: usageMetadata.candidatesTokenCount, total: usageMetadata.totalTokenCount });
            } else {
              // Fallback: estimate tokens if usage metadata not available
              const inputTokens = Math.ceil(enhancedMessage.length / 4);
              const outputTokens = Math.ceil(responseText.length / 4);
              sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, responseText);

              logger.debug(`📊 Token usage (estimated)`, { input: inputTokens, output: outputTokens });
            }

            // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
            const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
            if (completedMetrics) {
              logger.info(`✅ Interaction completed`, { cost: `$${completedMetrics.tokens.estimatedCost.toFixed(6)}`, tokens: completedMetrics.tokens.totalTokens, time: `${completedMetrics.timing.totalResponseTime}ms` });
            }
          } catch (error) {
            logger.warn(`⚠️ Could not extract token usage`, { error: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      return result;

    } catch (error) {
      logger.error(`Error sending message`, { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  // ============================================================================
  // P1.1: REACTIVE COMPACTION — Compact history and recreate chat session
  // ============================================================================

  /**
   * Performs reactive context compaction when a context-exhausted error is detected.
   *
   * 1. Retrieves the current session's history
   * 2. Uses ContextWindowManager.compactReactively() to consolidate old messages
   *    into a clinical summary, preserving system prompt and recent messages
   * 3. Destroys the current chat session
   * 4. Creates a new chat session with the compacted history
   * 5. Stores the compacted history back into sessionData for Firestore sync
   *
   * @returns true if compaction and session recreation succeeded, false otherwise
   */
  private async performReactiveCompaction(
    sessionId: string
  ): Promise<boolean> {
    try {
      const sessionData = this.activeChatSessions.get(sessionId);
      if (!sessionData || !sessionData.history || sessionData.history.length < 4) {
        logger.warn(`🗜️ Cannot compact: insufficient history for session ${sessionId}`);
        return false;
      }

      const currentHistory: ChatMessage[] = sessionData.history;

      // Compact using the context window manager
      const compactionResult = this.contextWindowManager.compactReactively(currentHistory);

      if (compactionResult.metrics.messagesCompacted === 0) {
        logger.warn(`🗜️ Compaction yielded no reduction — history too short`);
        return false;
      }

      logger.info(`🗜️ Compaction complete`, {
        before: compactionResult.metrics.originalMessageCount,
        after: compactionResult.metrics.compactedMessageCount,
        tokensSaved: compactionResult.metrics.estimatedTokensSaved,
      });

      // Destroy old session and recreate with compacted history
      this.activeChatSessions.delete(sessionId);
      await this.createChatSession(sessionId, undefined, compactionResult.compactedHistory);

      // Update the stored history reference so Firestore persistence stays in sync
      const newSessionData = this.activeChatSessions.get(sessionId);
      if (newSessionData) {
        newSessionData.history = compactionResult.compactedHistory;
      }

      return true;
    } catch (compactionError) {
      logger.error(`🗜️ Reactive compaction failed`, { error: compactionError instanceof Error ? compactionError.message : String(compactionError) });
      return false;
    }
  }


  getAgentConfig(): AgentConfig {
    return this.unifiedConfig
  }

  closeChatSession(sessionId: string): void {
    this.activeChatSessions.delete(sessionId)
    this.sessionFileCache.delete(sessionId)
    this.verifiedActiveMap.delete(sessionId)
    this.filesFullySentMap.delete(sessionId)
    this.sessionLastActivity.delete(sessionId)
    logger.info(`🗑️ Closed session: ${sessionId}`)
  }

  getActiveChatSessions(): Map<string, any> {
    return this.activeChatSessions
  }

  /**
   * 🧹 CLEANUP: Inicia el timer de limpieza automática de sesiones inactivas
   * Previene memory leaks eliminando sesiones que no han tenido actividad
   */
  private startAutomaticCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions()
    }, this.CLEANUP_INTERVAL_MS)

    logger.info(`⏰ Automatic cleanup started (interval: ${this.CLEANUP_INTERVAL_MS / 60000} minutes)`)
  }

  /**
   * 🧹 CLEANUP: Limpia sesiones inactivas que exceden el timeout
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [sessionId, lastActivity] of this.sessionLastActivity.entries()) {
      const inactiveTime = now - lastActivity

      if (inactiveTime > this.SESSION_TIMEOUT_MS) {
        this.closeChatSession(sessionId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logger.info(`🧹 Cleaned up ${cleanedCount} inactive sessions`)
      logger.info(`📊 Active sessions remaining: ${this.activeChatSessions.size}`)
    }
  }

  /**
   * 🧹 CLEANUP: Actualiza la última actividad de una sesión
   * Llamar este método cada vez que hay interacción con la sesión
   */
  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now())
  }

  /**
   * 🧹 CLEANUP: Detiene el timer de limpieza automática
   * Útil para testing o shutdown del sistema
   */
  stopAutomaticCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
      logger.info(`⏹️ Automatic cleanup stopped`)
    }
  }

  /**
   * 📊 STATS: Obtiene estadísticas de sesiones activas
   */
  getSessionStats(): {
    activeSessions: number
    cachedFiles: number
    verifiedFiles: number
    oldestSessionAge: number | null
  } {
    let oldestAge: number | null = null
    const now = Date.now()

    for (const lastActivity of this.sessionLastActivity.values()) {
      const age = now - lastActivity
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age
      }
    }

    return {
      activeSessions: this.activeChatSessions.size,
      cachedFiles: this.sessionFileCache.size,
      verifiedFiles: this.verifiedActiveMap.size,
      oldestSessionAge: oldestAge
    }
  }
}

// Singleton instance
export const clinicalAgentRouter = new ClinicalAgentRouter()
