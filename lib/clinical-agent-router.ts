import { ai, aiFiles } from "./google-genai-config"
import { createAgentDefinitions, GLOBAL_BASE_INSTRUCTION } from "./agents/agent-definitions"
import { createUserContent } from "@google/genai"
import { clinicalFileManager, createPartFromUri } from "./clinical-file-manager"
import { sessionMetricsTracker } from "./session-metrics-comprehensive-tracker"
// Academic source validation and multi-source search
import { academicSourceValidator } from "./academic-source-validator"
import { crossrefDOIResolver } from "./crossref-doi-resolver"
import { vertexLinkConverter } from "./vertex-link-converter"
// P0.1: Tool permission engine — pre-execution security validation
import { checkToolPermission } from "./security/tool-permissions"
import { ToolRegistry } from "./tool-registry"
// P1.1: Reactive context compaction — detect context-exhausted errors and compact history
import { ContextWindowManager, isContextExhaustedError } from "./context-window-manager"
// P1.2: Concurrency-limited tool orchestration — replaces raw Promise.all()
import { executeToolsSafely, type PreparedToolCall, type ToolCallResult } from "./utils/tool-orchestrator"
import type { AgentType, AgentConfig, ChatMessage } from "@/types/clinical-types"
import type { OperationalMetadata, RoutingDecision } from "@/types/operational-metadata"

// Import academicMultiSourceSearch only on server to avoid bundling in client
// Removed top-level require to avoid build issues, will import dynamically


// Escape XML-special characters in strings interpolated into XML-style tags
function escapeXml(str: string): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class ClinicalAgentRouter {
  private agents: Map<AgentType, AgentConfig> = new Map()
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
    this.agents = createAgentDefinitions()
  }

  async createChatSession(sessionId: string, agent: AgentType, history?: ChatMessage[], isAgentTransition = false): Promise<any> {
    const agentConfig = this.agents.get(agent)
    if (!agentConfig) {
      throw new Error(`Agent not found: ${agent}`)
    }

    try {
      // Convert history to Gemini format if provided - NOW AGENT-AWARE
      let geminiHistory = history ? await this.convertHistoryToGeminiFormat(sessionId, history, agent) : []

      // Add transition context if this is an agent switch to maintain conversational flow
      if (isAgentTransition && history && history.length > 0) {
        geminiHistory = this.addAgentTransitionContext(geminiHistory, agent)
      }

      // Detect if any message in history references files uploaded via API-key Files API.
      // When Vertex AI is the main client, it cannot resolve file URIs from the API-key
      // endpoint (generativelanguage.googleapis.com vs aiplatform.googleapis.com).
      // In that case, we must use the API-key client (aiFiles) for the chat session.
      const historyHasFiles = history?.some(m => m.fileReferences && m.fileReferences.length > 0) || false
      const client = historyHasFiles ? aiFiles : ai

      // Create chat session using the correct SDK API
      const chat = client.chats.create({
        model: agentConfig.config.model || 'gemini-2.5-flash',
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

      this.activeChatSessions.set(sessionId, { chat, agent, usesApiKeyClient: historyHasFiles })
      // Prepare caches for this session
      if (!this.sessionFileCache.has(sessionId)) this.sessionFileCache.set(sessionId, new Map())
      if (!this.verifiedActiveMap.has(sessionId)) this.verifiedActiveMap.set(sessionId, new Set())
      if (!this.filesFullySentMap.has(sessionId)) this.filesFullySentMap.set(sessionId, new Set())

      // 🧹 CLEANUP: Track session activity
      this.updateSessionActivity(sessionId)

      return chat
    } catch (error) {
      console.error("Error creating chat session: " + (error instanceof Error ? error.message : String(error)))
      throw error
    }
  }

  async convertHistoryToGeminiFormat(sessionId: string, history: ChatMessage[], agentType: AgentType) {
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
        console.log(`[ClinicalRouter] Processing files for latest message only: ${msg.fileReferences.length} file IDs`)

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
                    console.error(`[ClinicalRouter] No valid URI found for file reference: ${fileRef.name}`)
                    continue
                  }

                  console.log(`[ClinicalRouter] Adding file to context: ${fileRef.name}, URI: ${fileUri}`)

                  // Verify ACTIVE only once per session
                  const verifiedSet = this.verifiedActiveMap.get(sessionId) || new Set<string>()
                  this.verifiedActiveMap.set(sessionId, verifiedSet)
                  const fileIdForCheck = fileRef.geminiFileId || fileUri
                  if (!verifiedSet.has(fileIdForCheck)) {
                    try {
                      await clinicalFileManager.waitForFileToBeActive(fileIdForCheck, 30000)
                      verifiedSet.add(fileIdForCheck)
                    } catch (fileError) {
                      console.error(`[ClinicalRouter] File not ready or not found: ${fileUri}`, fileError)
                      continue
                    }
                  }

                  // Usar createPartFromUri para crear la parte del archivo correctamente
                  const filePart = createPartFromUri(fileUri, fileRef.type)

                  parts.push(filePart)
                  console.log(`[ClinicalRouter] Successfully added file part for: ${fileRef.name}`)
                } catch (error) {
                  console.error(`[ClinicalRouter] Error processing file reference ${fileRef.name}:`, error)
                  // Continuar con el siguiente archivo en lugar de fallar completamente
                  continue
                }
              }
            }
          }
        } catch (error) {
          console.error(`[ClinicalRouter] Error retrieving files by IDs:`, error)
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
    const agent = sessionData.agent

    // 🧹 CLEANUP: Update session activity on every message
    this.updateSessionActivity(sessionId)

    try {
      // 🎯 ROLE METADATA: Agregar metadata de rol que acompaña al agente en cada mensaje
      const roleMetadata = this.getRoleMetadata(agent)

      // Enriquecer el mensaje con contexto si está disponible
      let enhancedMessage = message
      if (enrichedContext) {
        enhancedMessage = this.buildEnhancedMessage(message, enrichedContext, agent)
      }

      // 🎯 Prefijar mensaje con metadata de rol (invisible para el usuario, visible para el agente)
      enhancedMessage = `${roleMetadata}\n\n${enhancedMessage}`

      // 📊 RECORD MODEL CALL START - Estimate context tokens if interaction tracking enabled
      if (interactionId) {
        const currentHistory = sessionData.history || [];
        const contextTokens = this.estimateTokenCount(currentHistory);
        // Get the actual model used by this agent
        const agentConfig = this.agents.get(agent);
        const modelUsed = agentConfig?.config?.model || 'gemini-2.5-flash';
        sessionMetricsTracker.recordModelCallStart(interactionId, modelUsed, contextTokens);
      }

      // Switch to API-key client when files are attached and current session uses Vertex AI.
      // Files uploaded via the API-key Files API have URIs from generativelanguage.googleapis.com
      // which are not accessible from the Vertex AI endpoint (aiplatform.googleapis.com).
      // Only recreate the chat if we're not already on the API-key client.
      const hasFileAttachments = Array.isArray(enrichedContext?.sessionFiles) && enrichedContext.sessionFiles.length > 0

      if (hasFileAttachments && !sessionData.usesApiKeyClient) {
        try {
          const agentConfig = this.agents.get(agent)
          const geminiHistory = await this.convertHistoryToGeminiFormat(sessionId, sessionData.history || [], agent)
          const fileChat = aiFiles.chats.create({
            model: agentConfig?.config?.model || 'gemini-2.5-flash',
            config: {
              temperature: agentConfig?.config?.temperature,
              topK: agentConfig?.config?.topK,
              topP: agentConfig?.config?.topP,
              maxOutputTokens: agentConfig?.config?.maxOutputTokens,
              safetySettings: agentConfig?.config?.safetySettings,
              systemInstruction: agentConfig?.systemInstruction,
              tools: agentConfig?.tools && agentConfig?.tools.length > 0 ? agentConfig.tools : undefined,
              thinkingConfig: agentConfig?.config?.thinkingConfig,
            },
            history: geminiHistory,
          })
          this.activeChatSessions.set(sessionId, { chat: fileChat, agent, usesApiKeyClient: true })
          chat = fileChat
        } catch (switchErr) {
          console.warn('[ClinicalRouter] ⚠️ Could not switch to API-key client for file-attached message:', switchErr)
        }
      }

      // Construir las partes del mensaje (texto + archivos adjuntos)
      const messageParts: any[] = [{ text: enhancedMessage }]

      // 🔧 FIX: Estrategia de archivos - SOLO enviar completo en primer turno
      // Turnos posteriores: solo referencia ligera para evitar sobrecarga de tokens
      if (enrichedContext?.sessionFiles && Array.isArray(enrichedContext.sessionFiles) && enrichedContext.sessionFiles.length > 0) {
        console.log(`📁 [ClinicalRouter] Processing sessionFiles for attachment:`, {
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

        console.log(`📁 [ClinicalRouter] File attachment decision:`, {
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
          console.log(`🔵 [ClinicalRouter] First turn detected: Attaching FULL files (${files.length}) via URI`);

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
                  console.warn(`[ClinicalRouter] Skipping non-active file: ${fileUri}`)
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

              console.log(`[ClinicalRouter] ✅ Attached FULL file: ${fileRef.name} (${fileRef.size ? Math.round(fileRef.size / 1024) + 'KB' : 'size unknown'})`)
            } catch (err) {
              console.error('[ClinicalRouter] Error attaching session file:', err)
            }
          }
        } else {
          // ✅ TURNOS POSTERIORES: Solo referencia ligera textual (ahorra ~60k tokens)
          console.log(`🟢 [ClinicalRouter] Subsequent turn detected: Using LIGHTWEIGHT file references (saves ~60k tokens)`);

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
          console.log(`[ClinicalRouter] ✅ Added lightweight file context (~${fileReferences.length} chars vs ~60k tokens)`);
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
              console.warn(`🗜️ [ClinicalRouter] Context window exhausted on streaming attempt ${attempt}. Triggering reactive compaction...`);

              const compactionResult = await this.performReactiveCompaction(sessionId, agent);
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
              console.warn(`⏳ [ClinicalRouter] 429 rate limit on attempt ${attempt}/${MAX_RETRIES}, retrying in ${backoffMs}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
            throw err; // Non-retryable or exhausted retries
          }
        }

        // Handle function calls for ALL agents that have tools (academico, socratico, clinico)
        // Estos agentes tienen acceso a herramientas de búsqueda académica
        if (agent === "academico" || agent === "socratico" || agent === "clinico") {
          result = await this.handleStreamingWithTools(streamResult, sessionId, interactionId)
        } else {
          // 📊 Create streaming wrapper that captures metrics when stream completes
          result = this.createMetricsStreamingWrapper(streamResult, interactionId, enhancedMessage)
        }
      } else {
        // ─── Non-streaming path with P1.1 reactive compaction ───
        try {
          result = await chat.sendMessage(messageParams)
        } catch (err: any) {
          if (isContextExhaustedError(err)) {
            console.warn(`🗜️ [ClinicalRouter] Context window exhausted on non-streaming call. Triggering reactive compaction...`);

            const compactionResult = await this.performReactiveCompaction(sessionId, agent);
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
            const responseText = this.extractTextFromChunk(response) || '';

            // Extract token usage from response metadata if available
            const usageMetadata = response.usageMetadata;
            if (usageMetadata) {
              sessionMetricsTracker.recordModelCallComplete(
                interactionId,
                usageMetadata.promptTokenCount || 0,
                usageMetadata.candidatesTokenCount || 0,
                responseText
              );

              console.log(`📊 [ClinicalRouter] Token usage - Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}`);
            } else {
              // Fallback: estimate tokens if usage metadata not available
              const inputTokens = Math.ceil(enhancedMessage.length / 4);
              const outputTokens = Math.ceil(responseText.length / 4);
              sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, responseText);

              console.log(`📊 [ClinicalRouter] Token usage (estimated) - Input: ${inputTokens}, Output: ${outputTokens}`);
            }

            // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
            const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
            if (completedMetrics) {
              console.log(`✅ [ClinicalRouter] Interaction completed - Cost: $${completedMetrics.tokens.estimatedCost.toFixed(6)}, Tokens: ${completedMetrics.tokens.totalTokens}, Time: ${completedMetrics.timing.totalResponseTime}ms`);
            }
          } catch (error) {
            console.warn(`⚠️ [ClinicalRouter] Could not extract token usage:`, error);
          }
        }
      }

      return result;

    } catch (error) {
      console.error(`[ClinicalRouter] Error sending message to ${agent}:`, error)
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
    sessionId: string,
    agent: AgentType
  ): Promise<boolean> {
    try {
      const sessionData = this.activeChatSessions.get(sessionId);
      if (!sessionData || !sessionData.history || sessionData.history.length < 4) {
        console.warn(`🗜️ [ClinicalRouter] Cannot compact: insufficient history for session ${sessionId}`);
        return false;
      }

      const currentHistory: ChatMessage[] = sessionData.history;

      // Compact using the context window manager
      const compactionResult = this.contextWindowManager.compactReactively(currentHistory);

      if (compactionResult.metrics.messagesCompacted === 0) {
        console.warn(`🗜️ [ClinicalRouter] Compaction yielded no reduction — history too short`);
        return false;
      }

      console.log(`🗜️ [ClinicalRouter] Compaction complete:`, {
        before: compactionResult.metrics.originalMessageCount,
        after: compactionResult.metrics.compactedMessageCount,
        tokensSaved: compactionResult.metrics.estimatedTokensSaved,
      });

      // Destroy old session and recreate with compacted history
      this.activeChatSessions.delete(sessionId);
      await this.createChatSession(sessionId, agent, compactionResult.compactedHistory);

      // Update the stored history reference so Firestore persistence stays in sync
      const newSessionData = this.activeChatSessions.get(sessionId);
      if (newSessionData) {
        newSessionData.history = compactionResult.compactedHistory;
      }

      return true;
    } catch (compactionError) {
      console.error(`🗜️ [ClinicalRouter] Reactive compaction failed:`, compactionError);
      return false;
    }
  }

    /**
   * Create a streaming wrapper that captures metrics when the stream completes
   */
  private createMetricsStreamingWrapper(streamResult: any, interactionId: string | undefined, enhancedMessage: string) {
    const self = this;

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
          const extracted = self.extractTextFromChunk(chunk);
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
        console.log(`📊 [ClinicalRouter] Stream complete - interactionId: ${interactionId}, finalResponse exists: ${!!finalResponse}, accumulated text length: ${accumulatedText.length}`);

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

              console.log(`📊 [ClinicalRouter] Streaming Token usage - Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}`);
            } else {
              // Fallback: estimate tokens
              const inputTokens = Math.ceil(enhancedMessage.length / 4);
              const outputTokens = Math.ceil(accumulatedText.length / 4);
              sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, accumulatedText);

              console.log(`📊 [ClinicalRouter] Streaming Token usage (estimated) - Input: ${inputTokens}, Output: ${outputTokens}`);
            }

            // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
            const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
            if (completedMetrics) {
              console.log(`✅ [ClinicalRouter] Streaming interaction completed - Cost: $${completedMetrics.tokens.estimatedCost.toFixed(6)}, Tokens: ${completedMetrics.tokens.totalTokens}, Time: ${completedMetrics.timing.totalResponseTime}ms`);
            }
          } catch (error) {
            console.warn(`⚠️ [ClinicalRouter] Could not extract streaming token usage:`, error);
          }
        }

      } catch (error) {
        console.error(`❌ [ClinicalRouter] Error in streaming wrapper:`, error);
        throw error;
      }
    })();

         // Copy any properties from the original stream result
     if (streamResult.routingInfo) {
       (wrappedGenerator as any).routingInfo = streamResult.routingInfo;
     }

     return wrappedGenerator;
  }

  /**
   * Estimate token count for content array (rough approximation)
   */
  private estimateTokenCount(content: any[]): number {
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

  // Extracts user-viewable text from a streaming chunk, converting common non-text parts
  private extractTextFromChunk(chunk: any): string {
    try {
      let out = ''
      const parts = chunk?.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        if (typeof part?.text === 'string' && part.text) {
          out += part.text
        } else if (part?.inlineData?.data) {
          const mime = part.inlineData.mimeType || ''
          const decoded = this.b64ToUtf8(part.inlineData.data)
          if (!decoded) continue
          if (mime.includes('text/markdown') || mime.includes('text/plain')) {
            out += decoded
          } else if (mime.includes('text/csv')) {
            out += '\n' + this.csvToMarkdown(decoded) + '\n'
          } else if (mime.includes('application/json')) {
            const table = this.jsonToMarkdownTableSafe(decoded)
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

  private b64ToUtf8(data: string): string {
    try {
      // Node/browser compatible
      if (typeof Buffer !== 'undefined') return Buffer.from(data, 'base64').toString('utf-8')
      // @ts-ignore
      if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(data)))
    } catch {}
    return ''
  }

  private csvToMarkdown(csv: string): string {
    const rows = csv.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim()))
    if (!rows.length) return ''
    const header = rows[0]
    const align = header.map(() => '---')
    const esc = (s: string) => s.replace(/\|/g, '\\|')
    const toRow = (cols: string[]) => `| ${cols.map(esc).join(' | ')} |`
    const lines = [toRow(header), `| ${align.join(' | ')} |`, ...rows.slice(1).map(toRow)]
    return lines.join('\n')
  }

  private jsonToMarkdownTableSafe(jsonText: string): string | null {
    try {
      const data = JSON.parse(jsonText)
      return this.jsonToMarkdownTable(data)
    } catch { return null }
  }

  private jsonToMarkdownTable(data: any): string {
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


  private async handleStreamingWithTools(result: any, sessionId: string, interactionId?: string): Promise<any> {
    const sessionData = this.activeChatSessions.get(sessionId)
    if (!sessionData) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Capture 'this' context before entering the async generator
    const self = this

    // 📊 Get enhanced message for token estimation fallback
    const currentHistory = sessionData.history || [];
    const lastUserMessage = currentHistory.filter((m: any) => m.role === 'user').pop();
    const enhancedMessage = lastUserMessage?.content || '';

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
          const extractedText = self.extractTextFromChunk(chunk)
          if (extractedText) {
            accumulatedText += extractedText
            hasYieldedContent = true

            // Convertir vertex links en tiempo real
            let processedText = extractedText
            if (vertexLinkConverter.hasVertexLinks(processedText)) {
              console.log('[ClinicalRouter] Detected vertex links in initial stream, converting...')
              const conversionResult = await vertexLinkConverter.convertResponse(
                processedText,
                chunk.groundingMetadata
              )
              processedText = conversionResult.convertedResponse

              if (conversionResult.conversionCount > 0) {
                console.log(`[ClinicalRouter] Converted ${conversionResult.conversionCount} vertex links`)
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
          console.log(`[ClinicalRouter] Processing ${functionCalls.length} function calls`)

          // 🎨 UX: Emitir indicador de inicio de búsqueda académica (todas las variantes)
          const academicSearchCalls = functionCalls.filter((call: any) =>
            call.name === "search_academic_literature" ||
            call.name === "search_evidence_for_reflection" ||
            call.name === "search_evidence_for_documentation"
          )
          if (academicSearchCalls.length > 0) {
            const toolName = academicSearchCalls[0].name
            yield {
              text: "",
              metadata: {
                type: "tool_call_start",
                toolName: toolName,
                query: academicSearchCalls[0].args.query
              }
            }
            // 🔍 Intermediate progress: connecting to academic databases
            yield {
              text: "",
              metadata: {
                type: "tool_call_progress",
                toolName: toolName,
                message: "Conectando con bases de datos académicas (Parallel AI)…"
              }
            }
          }

          // 🎯 Almacenar referencias académicas obtenidas de ParallelAI
          let academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}> = []

          // ─── P1.2: Build PreparedToolCall[] with security pre-checks, then orchestrate ───
          const KNOWN_DYNAMIC_TOOLS = new Set([
            'google_search',
            'search_academic_literature',
            'search_evidence_for_reflection',
            'search_evidence_for_documentation',
          ]);

          const preparedCalls: PreparedToolCall[] = functionCalls.map((call: any) => {
            const toolRegistry = ToolRegistry.getInstance();
            const registeredTool = toolRegistry.getToolByDeclarationName(call.name);
            const securityCategory = registeredTool?.metadata.securityCategory ?? 'external';

            // ─── Security pre-check (synchronous, before orchestration) ───
            // Unregistered + unknown → return a "denied" executor
            if (!registeredTool && !KNOWN_DYNAMIC_TOOLS.has(call.name)) {
              console.warn(`🔒 [Security] UNREGISTERED tool BLOCKED: ${call.name}`);
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
              { psychologistId: psychologistId ?? null, sessionId }
            );

            if (permissionResult.decision === 'deny') {
              console.warn(`🔒 [Security] Tool execution DENIED: ${call.name} — ${permissionResult.reason}`);
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

            console.log(`✅ [Security] Tool execution ALLOWED: ${call.name} (${securityCategory})`);

            // ─── Build the actual executor function ───
            return {
              call,
              securityCategory,
              execute: async (): Promise<ToolCallResult> => {
                if (call.name === "google_search") {
                  console.log(`[ClinicalRouter] Executing Google Search:`, call.args)
                  return {
                    name: call.name,
                    response: "Search completed with automatic processing",
                  }
                }

                if (call.name === "search_academic_literature" ||
                    call.name === "search_evidence_for_reflection" ||
                    call.name === "search_evidence_for_documentation") {
                  console.log(`🔍 [ClinicalRouter] Executing Academic Search (${call.name}):`, call.args)
                  let searchResults: any

                  const defaultMaxResults = call.name === "search_academic_literature" ? 10 : 5

                  if (typeof window === 'undefined') {
                    try {
                      const { academicMultiSourceSearch } = await import('./academic-multi-source-search');
                      console.log(`🔍 [Server] Calling academicMultiSourceSearch directly for ${call.name}`)
                      searchResults = await academicMultiSourceSearch.search({
                        query: call.args.query,
                        maxResults: call.args.max_results || defaultMaxResults,
                        language: 'both',
                        minTrustScore: 60
                      })
                    } catch (error) {
                      console.error('❌ Error importing academicMultiSourceSearch:', error);
                      const response = await fetch('/api/academic-search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: call.args.query,
                          maxResults: call.args.max_results || defaultMaxResults
                        })
                      });
                      if (response.ok) {
                        searchResults = await response.json();
                      }
                    }
                  } else {
                    console.warn('⚠️ [Client] Academic search called from client - using API route')
                    const response = await fetch('/api/academic-search', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        query: call.args.query,
                        maxResults: call.args.max_results || defaultMaxResults,
                        language: 'both',
                        minTrustScore: 60
                      })
                    })

                    if (!response.ok) {
                      throw new Error(`API returned ${response.status}`)
                    }

                    const data = await response.json()
                    searchResults = data.results
                  }

                  console.log(`✅ [ClinicalRouter] Academic search completed:`, {
                    totalFound: searchResults.metadata.totalFound,
                    validated: searchResults.sources.length,
                    fromParallelAI: searchResults.metadata.fromParallelAI
                  })

                  // 🎯 Side-effect: capture academic references for UI emission
                  academicReferences = searchResults.sources.map((source: any) => ({
                    title: source.title,
                    url: source.url,
                    doi: source.doi,
                    authors: source.authors?.join?.(', ') || (Array.isArray(source.authors) ? source.authors.join(', ') : source.authors),
                    year: source.year,
                    journal: source.journal
                  }))
                  console.log(`📚 [ClinicalRouter] Stored ${academicReferences.length} academic references from ParallelAI`)

                  const formattedResults = {
                    total_found: searchResults.metadata.totalFound,
                    validated_count: searchResults.sources.length,
                    sources: searchResults.sources.map((source: any) => ({
                      title: source.title,
                      authors: source.authors?.join(', ') || 'Unknown',
                      year: source.year,
                      journal: source.journal,
                      doi: source.doi,
                      url: source.url,
                      abstract: source.abstract,
                      excerpts: source.excerpts || [],
                      trust_score: source.trustScore
                    }))
                  }

                  return {
                    name: call.name,
                    response: formattedResults
                  }
                }

                // Unknown tool that passed security — return null-like
                return { name: call.name, response: null }
              },
            } as PreparedToolCall;
          });

          // 🎯 P1.2: Execute with concurrency limits and per-tool error isolation
          const functionResponses = await executeToolsSafely(preparedCalls, { maxConcurrent: 3 });

          // Filter out null responses
          const validResponses = functionResponses.filter(response => response !== null)

          // 🎨 UX: Emitir indicador de finalización de búsqueda académica (todas las variantes)
          if (academicSearchCalls.length > 0 && validResponses.length > 0) {
            const academicResponse = validResponses.find((r: any) =>
              r?.name === "search_academic_literature" ||
              r?.name === "search_evidence_for_reflection" ||
              r?.name === "search_evidence_for_documentation"
            )
            if (academicResponse && typeof academicResponse.response === 'object') {
              const responseData = academicResponse.response as any
              const sourcesCount = responseData.validated_count || responseData.sources?.length || 0

              // 🔍 Intermediate progress: parsing sources
              if (sourcesCount > 0) {
                yield {
                  text: "",
                  metadata: {
                    type: "tool_call_progress",
                    toolName: academicResponse.name,
                    message: `Validando ${responseData.total_found || sourcesCount} fuentes académicas…`
                  }
                }
              }

              yield {
                text: "",
                metadata: {
                  type: "tool_call_complete",
                  toolName: academicResponse.name,
                  sourcesFound: responseData.total_found || 0,
                  sourcesValidated: sourcesCount,
                  // 📚 Include academic sources for timeline display
                  academicSources: academicReferences
                }
              }
            }
          }

          if (validResponses.length > 0) {
            console.log(`[ClinicalRouter] Sending ${validResponses.length} function responses back to model`)

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
                const extractedText = self.extractTextFromChunk(chunk)
                if (extractedText) {
                  hasYieldedContent = true

                  // Convertir vertex links en el texto antes de enviar
                  let processedText = extractedText
                  if (vertexLinkConverter.hasVertexLinks(processedText)) {
                    console.log('[ClinicalRouter] Detected vertex links in response, converting...')
                    const conversionResult = await vertexLinkConverter.convertResponse(
                      processedText,
                      chunk.groundingMetadata
                    )
                    processedText = conversionResult.convertedResponse

                    if (conversionResult.conversionCount > 0) {
                      console.log(`[ClinicalRouter] Converted ${conversionResult.conversionCount} vertex links`)
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
                  const urls = await self.extractUrlsFromGroundingMetadata(chunk.groundingMetadata)
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

              // Otherwise, send empty responses for the recursive function calls
              // so the model can proceed to generate text
              console.log(`[ClinicalRouter] Follow-up round ${round + 1}: handling ${followUpFunctionCalls.length} recursive function calls`)
              const recursiveResponseParts = followUpFunctionCalls.map((call: any) => ({
                functionResponse: {
                  name: call.name,
                  response: {
                    output: { acknowledged: true }
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
              console.log(`📚 [ClinicalRouter] Emitting ${academicReferences.length} academic references from ParallelAI`)
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
          console.warn('[ClinicalRouter] No content yielded, providing fallback')
          yield { text: "" }
        }

        // 📊 CAPTURE METRICS AFTER STREAM COMPLETION (with tools)
        console.log(`📊 [ClinicalRouter] Stream with tools complete - interactionId: ${interactionId}, finalResponse exists: ${!!finalResponse}, accumulated text length: ${accumulatedText.length}`);

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

              console.log(`📊 [ClinicalRouter] Streaming with tools - Token usage - Input: ${usageMetadata.promptTokenCount}, Output: ${usageMetadata.candidatesTokenCount}, Total: ${usageMetadata.totalTokenCount}`);
            } else {
              // Fallback: estimate tokens
              const inputTokens = Math.ceil(enhancedMessage.length / 4);
              const outputTokens = Math.ceil(accumulatedText.length / 4);
              sessionMetricsTracker.recordModelCallComplete(interactionId, inputTokens, outputTokens, accumulatedText);

              console.log(`📊 [ClinicalRouter] Streaming with tools - Token usage (estimated) - Input: ${inputTokens}, Output: ${outputTokens}`);
            }

            // 📊 FINALIZE INTERACTION - Calculate performance metrics and save to snapshot
            const completedMetrics = sessionMetricsTracker.completeInteraction(interactionId);
            if (completedMetrics) {
              console.log(`✅ [ClinicalRouter] Streaming with tools interaction completed - Cost: $${completedMetrics.tokens.estimatedCost.toFixed(6)}, Tokens: ${completedMetrics.tokens.totalTokens}, Time: ${completedMetrics.timing.totalResponseTime}ms`);
            }
          } catch (error) {
            console.warn(`⚠️ [ClinicalRouter] Could not extract streaming with tools token usage:`, error);
          }
        }

      } catch (error) {
        console.error("[ClinicalRouter] Error in streaming with tools:", error)
        // Yield error information as a chunk
        yield {
          text: "Lo siento, hubo un error procesando tu solicitud. Por favor, inténtalo de nuevo.",
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      }
    })()
  }

  /**
   * ARCHITECTURAL FIX: Generate agent-specific context for file attachments
   * Provides flexible, conversation-aware context that maintains flow between agents
   * while enabling specialized responses based on agent expertise.
   */
  private buildAgentSpecificFileContext(agentType: AgentType, fileCount: number, fileNames: string): string {
    const baseContext = `**Archivos en contexto:** ${fileNames} (${fileCount} archivo${fileCount > 1 ? 's' : ''}).`;

    switch (agentType) {
      case 'socratico':
        return `${baseContext}

Como especialista en exploración reflexiva, puedes aprovechar este material para enriquecer el diálogo terapéutico. Responde naturalmente integrando tu perspectiva socrática según el flujo de la conversación.`;

      case 'clinico':
        return `${baseContext}

Como especialista en documentación clínica, este material está disponible para síntesis profesional. Integra tu perspectiva organizacional según sea relevante para la conversación en curso.`;

      case 'academico':
        return `${baseContext}

Como especialista en evidencia científica, puedes utilizar este material para informar tu análisis académico. Integra tu perspectiva basada en investigación según el contexto conversacional.`;

      default:
        return `${baseContext} Material disponible para análisis contextual apropiado.`;
    }
  }

  /**
   * METADATA SECTION: Identidad del usuario (TERAPEUTA)
   * Clarifica sin ambigüedad que el usuario es el terapeuta, no el paciente
   */
  private buildUserIdentitySection(): string {
    return `El usuario de este sistema es un TERAPEUTA/PSICÓLOGO profesional consultando sobre su trabajo clínico. El usuario NO es el paciente.`;
  }

  /**
   * METADATA SECTION: Metadata operativa del sistema
   * Información temporal, de riesgo, y de contexto de sesión
   */
  private buildOperationalMetadataSection(metadata: OperationalMetadata): string {
    let section = `Tiempo: ${metadata.local_time} (${metadata.timezone}), Región: ${metadata.region}, Duración de sesión: ${metadata.session_duration_minutes} min`;

    // Riesgo (solo si hay flags activos)
    if (metadata.risk_flags_active.length > 0) {
      section += `\n⚠️ BANDERAS DE RIESGO ACTIVAS: ${metadata.risk_flags_active.join(', ')}. Nivel: ${metadata.risk_level.toUpperCase()}`;
      if (metadata.requires_immediate_attention) {
        section += ` 🚨 REQUIERE ATENCIÓN INMEDIATA`;
      }
    }

    // Historial de agentes (solo si hay switches recientes)
    if (metadata.consecutive_switches > 2) {
      section += `\nCambios de agente recientes: ${metadata.consecutive_switches} en últimos 5 min. Mantén coherencia con el contexto previo.`;
    }

    return section;
  }

  /**
   * METADATA SECTION: Decisión de routing
   * Explica por qué este agente fue seleccionado
   */
  private buildRoutingDecisionSection(decision: RoutingDecision, agent: AgentType): string {
    let section = `Agente seleccionado: ${agent} (confianza: ${(decision.confidence * 100).toFixed(0)}%). Razón: ${decision.reason}`;

    if (decision.is_edge_case) {
      section += `. Caso límite: ${decision.edge_case_type} (${decision.metadata_factors.join(', ')})`;
    }

    return section;
  }

  /**
   * METADATA SECTION: Contexto del caso clínico
   * Información del paciente si está disponible (sin ambigüedad)
   */
  private buildClinicalCaseContextSection(enrichedContext: any): string {
    if (!enrichedContext.patient_reference) {
      return '';
    }

    let section = `Paciente en consulta: ${enrichedContext.patient_reference}`;

    if (enrichedContext.patient_summary) {
      section += `\nResumen del caso: ${enrichedContext.patient_summary}`;
    }

    return section;
  }

  /**
   * 🎯 ROLE METADATA: Genera metadata conciso que refuerza el rol del agente en cada mensaje
   * Este metadata acompaña al agente en su recorrido sin depender del system prompt
   */
  private getRoleMetadata(agent: AgentType): string {
    const roleDefinitions: Record<string, string> = {
      socratico: `<rol_activo>Supervisor Clínico — Exploración reflexiva, formulación de caso, discriminación diagnóstica.</rol_activo>`,

      clinico: `<rol_activo>Especialista en Documentación — Síntesis en registros SOAP/DAP/BIRP con profundidad reflexiva.</rol_activo>`,

      academico: `<rol_activo>Investigador Académico — Búsqueda sistemática y síntesis crítica de evidencia científica.</rol_activo>`
    }

    return roleDefinitions[agent] || `<rol_activo>${agent}</rol_activo>`
  }

  /**
   * Adds subtle transition context when switching agents to maintain conversational flow
   */
  private addAgentTransitionContext(geminiHistory: any[], newAgentType: AgentType): any[] {
    if (geminiHistory.length === 0) return geminiHistory;

    // Internal system note for orchestration-only transition (not user-initiated and not user-facing)
    const transitionMessage = {
      role: 'model' as const,
      parts: [{
        text: `<nota_sistema>Transición interna del orquestador. No fue solicitada por el usuario. No agradezcas ni anuncies el cambio. Continúa la conversación con perspectiva especializada en ${this.getAgentSpecialtyName(newAgentType)}, manteniendo el flujo y objetivos previos.</nota_sistema>`
      }]
    };

    // Insert the transition context before the last user message to maintain natural flow
    const historyWithTransition = [...geminiHistory];
    if (historyWithTransition.length > 0) {
      historyWithTransition.splice(-1, 0, transitionMessage);
    }

    return historyWithTransition;
  }

  /**
   * Gets human-readable specialty name for agent types
   */
  private getAgentSpecialtyName(agentType: AgentType): string {
    switch (agentType) {
      case 'socratico': return 'exploración reflexiva y cuestionamiento socrático';
      case 'clinico': return 'documentación clínica y síntesis profesional';
      case 'academico': return 'evidencia científica e investigación académica';
      default: return 'análisis especializado';
    }
  }

  private buildEnhancedMessage(originalMessage: string, enrichedContext: any, agent: AgentType): string {
    // Si es una solicitud de confirmación, devolver el mensaje tal como está
    // (ya viene formateado como prompt de confirmación desde Aurora System)
    if (enrichedContext.isConfirmationRequest) {
      return originalMessage
    }

    // ARQUITECTURA DE CONTEXTO: XML tags claras para separar metadata del sistema
    // de la consulta real del usuario. Esto previene que el modelo confunda
    // instrucciones internas con contenido del usuario.
    const contextSections: string[] = []

    // 1. IDENTIDAD DEL USUARIO (siempre presente)
    contextSections.push(this.buildUserIdentitySection())

    // 2. METADATA OPERATIVA (si está disponible)
    if (enrichedContext.operationalMetadata) {
      contextSections.push(this.buildOperationalMetadataSection(enrichedContext.operationalMetadata))
      console.log(`📊 [ClinicalRouter] Operational metadata included in message`)
    }

    // 3. DECISIÓN DE ROUTING (si está disponible)
    if (enrichedContext.routingDecision) {
      contextSections.push(this.buildRoutingDecisionSection(enrichedContext.routingDecision, agent))
      console.log(`🎯 [ClinicalRouter] Routing decision included: ${enrichedContext.routingDecision.reason}`)
    }

    // 4. CONTEXTO DEL CASO CLÍNICO (si hay paciente)
    if (enrichedContext.patient_reference) {
      contextSections.push(this.buildClinicalCaseContextSection(enrichedContext))
      console.log(`🏥 [ClinicalRouter] Clinical case context included`)
    }

    // 5. ENTIDADES EXTRAÍDAS (si están disponibles)
    if (enrichedContext.extractedEntities && enrichedContext.extractedEntities.length > 0) {
      contextSections.push(`Entidades detectadas: ${enrichedContext.extractedEntities.join(", ")}`)
    }

    // 6. INFORMACIÓN DE SESIÓN (si está disponible)
    if (enrichedContext.sessionSummary) {
      contextSections.push(`Resumen de sesión: ${enrichedContext.sessionSummary}`)
    }

    // 7. PRIORIDADES DEL AGENTE (si están disponibles)
    if (enrichedContext.agentPriorities && enrichedContext.agentPriorities.length > 0) {
      contextSections.push(`Enfoques prioritarios: ${enrichedContext.agentPriorities.join(", ")}`)
    }

    // Construir mensaje con separación clara entre contexto del sistema y consulta del usuario
    const systemContext = contextSections.join('\n')
    return `<contexto_sistema>\n${systemContext}\n</contexto_sistema>\n\n<consulta_terapeuta>\n${originalMessage}\n</consulta_terapeuta>`
  }



  private async handleNonStreamingWithTools(result: any, sessionId: string, psychologistId?: string): Promise<any> {
    const functionCalls = result.functionCalls
    let academicReferences: Array<{title: string, url: string, doi?: string, authors?: string, year?: number, journal?: string}> = []

    if (functionCalls && functionCalls.length > 0) {
      // ─── P1.2: Build PreparedToolCall[] with security pre-checks, then orchestrate ───
      const KNOWN_DYNAMIC_TOOLS = new Set([
        'google_search',
        'search_academic_literature',
        'search_evidence_for_reflection',
        'search_evidence_for_documentation',
      ]);

      const preparedCalls: PreparedToolCall[] = functionCalls.map((call: any) => {
        const toolRegistry = ToolRegistry.getInstance();
        const registeredTool = toolRegistry.getToolByDeclarationName(call.name);
        const securityCategory = registeredTool?.metadata.securityCategory ?? 'external';

        if (!registeredTool && !KNOWN_DYNAMIC_TOOLS.has(call.name)) {
          console.warn(`🔒 [Security] UNREGISTERED tool BLOCKED (non-streaming): ${call.name}`);
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
          { psychologistId: psychologistId ?? null, sessionId }
        );

        if (permissionResult.decision === 'deny') {
          console.warn(`🔒 [Security] Tool execution DENIED (non-streaming): ${call.name} — ${permissionResult.reason}`);
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

        console.log(`✅ [Security] Tool execution ALLOWED (non-streaming): ${call.name} (${securityCategory})`);

        return {
          call,
          securityCategory,
          execute: async (): Promise<ToolCallResult> => {
            if (call.name === "google_search") {
              console.log(`[ClinicalRouter] Executing Google Search (non-streaming):`, call.args)
              return {
                name: call.name,
                response: "Search completed with automatic processing",
              }
            }

            if (call.name === "search_academic_literature" ||
                call.name === "search_evidence_for_reflection" ||
                call.name === "search_evidence_for_documentation") {
              console.log(`🔍 [ClinicalRouter] Academic search in non-streaming mode`)
              const { academicMultiSourceSearch } = await import('./academic-multi-source-search');
              const defaultMaxResults = call.name === "search_academic_literature" ? 10 : 5
              const searchResults = await academicMultiSourceSearch.search({
                query: call.args.query,
                maxResults: call.args.max_results || defaultMaxResults,
                language: 'both',
                minTrustScore: 60
              })

              academicReferences = searchResults.sources.map((source: any) => ({
                title: source.title,
                url: source.url,
                doi: source.doi,
                authors: source.authors?.join?.(', ') || (Array.isArray(source.authors) ? source.authors.join(', ') : source.authors),
                year: source.year,
                journal: source.journal
              }))
              console.log(`📚 [ClinicalRouter] Stored ${academicReferences.length} academic references (non-streaming)`)

              return {
                name: call.name,
                response: {
                  total_found: searchResults.metadata.totalFound,
                  validated_count: searchResults.sources.length,
                  sources: searchResults.sources.map((source: any) => ({
                    title: source.title,
                    authors: source.authors?.join(', ') || 'Unknown',
                    year: source.year,
                    journal: source.journal,
                    doi: source.doi,
                    url: source.url,
                    abstract: source.abstract,
                    excerpts: source.excerpts || [],
                    trust_score: source.trustScore
                  }))
                }
              }
            }

            return { name: call.name, response: null }
          },
        } as PreparedToolCall;
      });

      // 🎯 P1.2: Execute with concurrency limits and per-tool error isolation
      const functionResponses = await executeToolsSafely(preparedCalls, { maxConcurrent: 3 });

      // Send function results back to the model
      const sessionData = this.activeChatSessions.get(sessionId)
      if (sessionData) {
        const followUpResult = await sessionData.chat.sendMessage({
          message: {
            functionResponse: {
              name: functionResponses[0]?.name,
              response: {
                output: functionResponses[0]?.response
              },
            },
          },
        })

        // NUEVO: Convertir vertex links en la respuesta
        if (followUpResult.text && vertexLinkConverter.hasVertexLinks(followUpResult.text)) {
          console.log('[ClinicalRouter] Detected vertex links in non-streaming response, converting...')
          const conversionResult = await vertexLinkConverter.convertResponse(
            followUpResult.text,
            followUpResult.groundingMetadata
          )
          followUpResult.text = conversionResult.convertedResponse

          if (conversionResult.conversionCount > 0) {
            console.log(`[ClinicalRouter] Converted ${conversionResult.conversionCount} vertex links`)
          }
        }

        // Extract URLs from grounding metadata if available
        if (followUpResult.groundingMetadata) {
          const urls = await this.extractUrlsFromGroundingMetadata(followUpResult.groundingMetadata)
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
          console.log(`📚 [ClinicalRouter] Adding ${academicReferences.length} academic references to non-streaming response`)
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

  getAgentConfig(agent: AgentType): AgentConfig | undefined {
    return this.agents.get(agent)
  }

  getAllAgents(): Map<AgentType, AgentConfig> {
    return this.agents
  }

  closeChatSession(sessionId: string): void {
    this.activeChatSessions.delete(sessionId)
    this.sessionFileCache.delete(sessionId)
    this.verifiedActiveMap.delete(sessionId)
    this.filesFullySentMap.delete(sessionId)
    this.sessionLastActivity.delete(sessionId)
    console.log(`🗑️ [ClinicalAgentRouter] Closed session: ${sessionId}`)
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

    console.log(`⏰ [ClinicalAgentRouter] Automatic cleanup started (interval: ${this.CLEANUP_INTERVAL_MS / 60000} minutes)`)
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
      console.log(`🧹 [ClinicalAgentRouter] Cleaned up ${cleanedCount} inactive sessions`)
      console.log(`📊 [ClinicalAgentRouter] Active sessions remaining: ${this.activeChatSessions.size}`)
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
      console.log(`⏹️ [ClinicalAgentRouter] Automatic cleanup stopped`)
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

  /**
   * Extrae URLs de los metadatos de grounding para crear hipervínculos
   * MEJORADO: Ahora valida DOIs y verifica accesibilidad de URLs
   * Basado en la documentación del SDK: GroundingMetadata -> GroundingChunk -> GroundingChunkWeb
   */
  private async extractUrlsFromGroundingMetadata(groundingMetadata: any): Promise<Array<{title: string, url: string, domain?: string, doi?: string, trustScore?: number}>> {
    const urls: Array<{title: string, url: string, domain?: string, doi?: string, trustScore?: number}> = []
    const seen = new Set<string>()

    try {
      if (groundingMetadata.groundingChunks && Array.isArray(groundingMetadata.groundingChunks)) {
        // Extraer URLs raw primero
        const rawUrls: Array<{title: string, url: string}> = []

        groundingMetadata.groundingChunks.forEach((chunk: any) => {
          if (chunk.web && chunk.web.uri) {
            const sanitized = this.sanitizeAcademicUrl(chunk.web.uri)
            if (sanitized && !seen.has(sanitized)) {
              seen.add(sanitized)
              rawUrls.push({
                title: chunk.web.title || 'Fuente académica',
                url: sanitized
              })
            }
          }

          if (chunk.retrievedContext && chunk.retrievedContext.uri) {
            const sanitized = this.sanitizeAcademicUrl(chunk.retrievedContext.uri)
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

            console.log(`[ClinicalRouter] ✅ URL incluida: ${rawUrl.url} (trust: ${trustScore})`)
          } catch (error) {
            console.warn(`[ClinicalRouter] Error procesando URL ${rawUrl.url}:`, error)
            // Incluir de todas formas - mejor mostrar la referencia que perderla
            urls.push({
              title: rawUrl.title,
              url: rawUrl.url,
              domain: new URL(rawUrl.url).hostname
            })
          }
        }
      }

      console.log(`[ClinicalRouter] Extracted and validated ${urls.length} URLs from grounding metadata`)
    } catch (error) {
      console.error('[ClinicalRouter] Error extracting URLs from grounding metadata:', error)
    }

    return urls
  }

  private sanitizeAcademicUrl(rawUrl: string): string | null {
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
}

// Singleton instance
export const clinicalAgentRouter = new ClinicalAgentRouter()
