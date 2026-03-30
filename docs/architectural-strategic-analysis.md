# Architectural Strategic Analysis — AuroraPro Chat Messaging

## 1. System Overview

AuroraPro is a Next.js 15 (App Router) clinical psychology AI assistant using:
- **AI Backend**: Google Gemini API via `@google/genai` SDK (pinned to `^1.10.0`)
- **Streaming Protocol**: Server-Sent Events (SSE) via `ReadableStream`
- **Deployment**: Vercel serverless functions
- **Monitoring**: Sentry for error tracking

---

## 2. Complete Message Lifecycle

### 2.1 Client-Side Flow

```
1. ChatInterface.handleSubmit()
   └─ main-interface-optimized.tsx: handleSendMessage(message, useStreaming)
      └─ use-hopeai-system.ts: sendMessage(message, useStreaming, files, sessionMeta)
         ├─ Lazy-creates session via POST /api/sessions (if needed)
         ├─ Adds user message to local state immediately
         ├─ Persists user message to IndexedDB
         ├─ Creates SSEClient instance
         └─ Returns AsyncGenerator wrapping sseClient.sendMessageStream()

2. ChatInterface consumes AsyncGenerator:
   for await (const chunk of response) {
     setStreamingResponse(fullResponse += chunk.text)
   }
   └─ After stream completes: addStreamingResponseToHistory()
```

### 2.2 Server-Side Flow (API Route)

```
POST /api/send-message → app/api/send-message/route.ts
├─ Creates ReadableStream (returns 200 immediately with SSE headers)
├─ Inside stream.start():
│   ├─ getGlobalOrchestrationSystem() → HopeAISystem singleton
│   ├─ orchestrationSystem.sendMessage()
│   │   ├─ Load/create session state from SQLite storage
│   │   ├─ Get pending files, apply Context Window Manager
│   │   ├─ Collect operational metadata
│   │   ├─ DynamicOrchestrator.orchestrate() → agent selection + reasoning bullets
│   │   ├─ Intent routing (automatic/explicit agent switching)
│   │   ├─ clinicalAgentRouter.sendMessage()
│   │   │   ├─ Build enhanced message with context
│   │   │   ├─ chat.sendMessageStream() → Gemini SDK streaming
│   │   │   ├─ handleStreamingWithTools() OR createMetricsStreamingWrapper()
│   │   │   └─ Returns AsyncGenerator yielding {text, ...} chunks
│   │   └─ Returns { response: AsyncGenerator, updatedState }
│   ├─ Iterates response AsyncGenerator:
│   │   for await (chunk of result.response) → sendSSE({type:'chunk',...})
│   ├─ sendSSE({type:'response',...}) with full text
│   └─ sendSSE({type:'complete'})
└─ controller.close()
```

### 2.3 SSE Event Types

| Event | Purpose |
|-------|---------|
| `bullet` | Progressive reasoning bullets (AI thinking) |
| `agent_selected` | Agent routing notification |
| `chunk` | Streaming text from Gemini |
| `response` | Final complete response with metadata |
| `error` | Error information |
| `complete` | Stream end signal |

---

## 3. Critical Components

| Component | File | Role |
|-----------|------|------|
| API Route | `app/api/send-message/route.ts` | SSE stream creation, chunk relay |
| HopeAI System | `lib/hopeai-system.ts` | Orchestration, routing, session management |
| Dynamic Orchestrator | `lib/dynamic-orchestrator.ts` | Agent selection, tool management |
| Clinical Agent Router | `lib/clinical-agent-router.ts` | Gemini SDK chat sessions, streaming |
| GenAI Config | `lib/google-genai-config.ts` | Gemini client initialization |
| SSE Client | `lib/sse-client.ts` | Client-side SSE stream parsing |
| Hook | `hooks/use-hopeai-system.ts` | React state management, SSE integration |
| Chat Interface | `components/chat-interface.tsx` | UI rendering, stream consumption |
| Main Interface | `components/main-interface-optimized.tsx` | App wrapper, message handler |

---

## 4. Root Cause Analysis

### 4.1 Evidence from Logs

**Working case** (`logs_funcionando.md`):
- Session created → Orchestration → Agent selected (academico)
- Streaming setup completed
- Client receives AsyncGenerator
- Chunks flow for ~16 seconds (5534 chars)
- Stream completes → Response added to history

**Non-working case** (`logs_nofuncionando.md`):
- Identical flow up to "Streaming interaction setup completed"
- Client receives AsyncGenerator (suspended state)
- Client enters "Procesando respuesta streaming..."
- **NO chunks ever arrive** — only auto-scroll events
- No error events, no completion events — SILENT FAILURE

### 4.2 Identified Issues

#### ISSUE 1: Missing `maxDuration` on API Route (HIGH — Likely Primary Cause)
The `/api/send-message` route does NOT export a `maxDuration` configuration. On Vercel:
- Hobby plan: 10s default timeout
- Pro plan: 60s default timeout
- The working case took 16.17 seconds (over Hobby default)
- Without explicit `maxDuration`, the serverless function may be killed mid-stream

**Evidence**: POST returns 200 (stream opens), but no chunks arrive (function killed before Gemini responds).

#### ISSUE 2: `handleStreamingWithTools` Not Awaited (MEDIUM)
In `clinical-agent-router.ts` line 1844:
```typescript
result = this.handleStreamingWithTools(streamResult, sessionId, interactionId)
```
The function is `async` but not `await`ed. While JavaScript Promise flattening handles this in most cases, it creates a fragile pattern where:
- Error propagation timing is unpredictable
- The Promise is resolved lazily when `sendMessage()` returns

#### ISSUE 3: `@google/genai` Version Pinning (MEDIUM — FIXED)
Using `"latest"` in `package.json` meant every deployment could install a different SDK version. The code contains comments referencing the Vertex AI SDK's API (`{ stream, response }`), but the unified `@google/genai` SDK returns `Promise<AsyncGenerator>`. A version change could silently break the streaming. **Resolution**: Pinned to `^1.10.0` in this PR.

#### ISSUE 4: No Client-Side Stream Timeout (LOW)
The SSE client has no timeout. If the server stops sending events (due to timeout or error), the client waits indefinitely with no feedback to the user.

#### ISSUE 5: Silent Error Swallowing in Generator (LOW)
`handleStreamingWithTools` catches errors and yields a text message instead of throwing. This prevents the error from propagating to the API route's error handler, so no SSE `error` event is sent.

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT (Browser)                                             │
│                                                              │
│  ChatInterface ──► handleSendMessage ──► useHopeAISystem     │
│       ▲                                       │              │
│       │ for await (chunk)                     │              │
│       │                                       ▼              │
│  AsyncGenerator ◄── SSEClient.sendMessageStream()            │
│                         │                                    │
│                         │ POST /api/send-message             │
│                         ▼                                    │
├─────────────────────────────────────────────────────────────┤
│ SERVER (Vercel Serverless Function)                          │
│                                                              │
│  ReadableStream (SSE) ──► HopeAISystem.sendMessage()         │
│       │                       │                              │
│  sendSSE(chunk/response)      ├── DynamicOrchestrator        │
│       ▲                       ├── IntentRouter               │
│       │                       └── ClinicalAgentRouter        │
│       │                              │                       │
│       │                              ▼                       │
│       │                    chat.sendMessageStream()           │
│       │                              │                       │
│       │                              ▼                       │
│       └───── for await(chunk) ◄── AsyncGenerator             │
│                                      │                       │
│                                      ▼                       │
│                              Google Gemini API               │
└─────────────────────────────────────────────────────────────┘
```
