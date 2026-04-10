# Technical Decisions & Architecture Context

**Document Purpose:** Externalize critical technical decisions, sync strategies, and database relations discovered during PR audits to prevent context loss during compaction.

**Last Updated:** 2026-04-10

---

## PR Audit Summary

### PR #1: `copilot/explore-firebase-database-relations`
**Status:** MERGED
**Key Decisions:**
- **Memory Taxonomy Expansion:** Added `feedback` and `reference` to `ClinicalMemoryCategory` (now 5 types total)
  - Updated: `types/memory-types.ts`, `lib/tool-input-schemas.ts`, `lib/agents/unified-tool-declarations.ts`, `lib/agents/unified-system-prompt.ts`
- **AI-Generated Session Summaries:** New `SessionSummaryData` type using `gemini-3.1-flash-lite-preview`
  - Generates at 6-message milestones
  - Persisted as `chatState.sessionSummary` field on session document
- **LLM-Powered Memory Extraction:** Replaced regex-based extraction with semantic extraction
  - Sub-agent: `lib/agents/subagents/extract-session-memories.ts`
  - Uses all 5 memory categories with confidence scores and tags
- **Progressive Context Loading:** 3-level pattern inspired by Claude Code
  - Level 1: AI-generated session summaries (loaded without reading messages)
  - Level 2: Current session messages
  - Level 3: Clinical memories
  - Implementation: `loadPriorSessionSummaries()` in `FirestoreStorageAdapter`

### PR #2: `copilot/revise-agent-architecture-relationship`
**Status:** MERGED
**Key Decisions:**
- **Tool Orchestration:** Parallelizes read-only tools (max 3 concurrent)
- **Sub-Agent Parallelization:**
  - `explore-patient-context.ts`: 3 sequential Firestore calls → single `Promise.all` (≈3x faster)
  - `research-evidence.ts`: Sequential search loop → parallel `Promise.all` with per-query error isolation
  - `analyze-longitudinal-patterns.ts`: Patient name fetch + analyzer import in parallel
- **Semantic Memory Selection:** New `getRelevantMemoriesSemantic()` using Gemini Flash
  - Automatic fallback to keyword-based on LLM failure
- **MCP Foundation:** Created `lib/mcp/` module
  - `types.ts`: MCPServerConfig, MCPToolDefinition, MCPRegisteredTool, MCPToolCallResult, IMCPRegistry
  - `mcp-tool-wrapper.ts`: Bridges MCP tools into Aurora's ToolHandler interface
  - `mcp-registry.ts`: Singleton registry for MCP server connections
- **System Prompt §8.2:** Added concrete tool combination strategies table
  - Teaches model WHEN to combine tools (e.g., "cuéntame todo" → explore_patient_context)
  - Exhaustivity rule and multi-step rule
- **Multi-Tool Response Fix:** Non-streaming path now sends ALL function responses, not just first
- **Recursive Function Call Fix:** Full orchestrator pipeline instead of `{ acknowledged: true }`

### PR #3: `copilot/check-firebase-mcp-access-one-more-time`
**Status:** MERGED
**Key Decisions:**
- **Firebase ADC Setup:** `.github/agents/copilot-setup-steps.yml` (NOT `.github/workflows/`)
  - Format: only `steps:` list (no workflow headers)
  - Configures `GOOGLE_APPLICATION_CREDENTIALS` from secret
  - Enables Firebase MCP tools without explicit `firebase_login`

### PR #4: `copilot/audit-sync-strategy-firestore-fix`
**Status:** MERGED
**Key Decisions:**
- **Optimistic UI Fix:** `compatibleSession` condition now uses `(systemState.sessionId || systemState.history.length > 0)`
  - Renders user message immediately without waiting for `createSession()`
- **Parameter Ordering Bug Fix:** Removed unused `sessionIdOverride` parameter
  - `serverAiMessageId` now at correct position in `addStreamingResponseToHistory`
- **Server-Side ExecutionTimeline:** Now captures both tool steps AND processing phases
  - `emitStep()` accumulates completed steps into `collectedProcessingSteps[]`
  - `wrappedStream.finally` merges processing + tool steps
  - Server pre-generates `aiMessageId`, exposes via SSE
  - Client overwrites with richer metadata using same doc ID
- **Single-Writer Pattern:** Server writes to Firestore, client manages React state via SSE
  - `subscribeToMessages()` exists but unused (available for future real-time sync)

### PR #5: `copilot/analizar-proyecto-aurora`
**Status:** MERGED
**Key Decisions:**
- **Beta Readiness Assessment:** Comprehensive audit across 6 domains
- **Critical Gaps Identified:**
  - Billing/subscriptions: zero implementation
  - 5 API routes missing auth (expose PHI)
  - ~7,500 TypeScript errors silenced
  - No CI/CD pipeline
  - No landing page or onboarding flow
  - Stop generation button missing
- **P1 Issues:**
  - In-memory rate limiter resets on Vercel cold starts
  - PHI logged in plaintext
  - CSP includes `unsafe-eval`
  - No `.env.example`
  - HIPAA encryption skeleton exists but not enforced

---

## Database Schema & Relations

### Firestore Structure
```
psychologists/{uid}/
  ├── subscription/current (tier, tokenUsage, etc.)
  ├── patients/{patientId}/
  │   ├── record (PatientRecord)
  │   ├── sessions/{sessionId}/
  │   │   ├── metadata (ChatState without history)
  │   │   ├── sessionSummary (SessionSummaryData)
  │   │   └── messages/{messageId}/ (Message with executionTimeline)
  │   ├── memories/{memoryId}/ (ClinicalMemory with 5 categories)
  │   └── documents/{documentId}/ (uploaded files)
```

### Key Firestore Patterns
1. **Subcollection-based messages:** O(1) writes via `addMessage()` instead of O(N) session rewrites
2. **Parallel I/O:** All independent reads use `Promise.all` (patient record, fichas, memories, files)
3. **Offline-first:** Firebase offline persistence via `persistentLocalCache` + IndexedDB
4. **Single-writer:** Server writes to Firestore, client reads via SSE (not real-time listeners)

---

## Sync Strategy

### Current Implementation
- **Server → Firestore:** `wrappedStream` writes AI messages with `executionTimeline`, `groundingUrls`, tool metadata
- **Client → State:** SSE chunks update React state optimistically
- **Client → Firestore:** Client overwrites AI message with richer metadata (processingSteps, reasoningBullets) using server's pre-generated ID

### Future Optimization Paths
- Real-time sync via `subscribeToMessages()` (currently exists but unused)
- Consider event sourcing for conflict resolution in multi-device scenarios

---

## Agent Architecture

### Current Agent System (v7 Unified Agent)
- **Main Agent:** Unified clinical agent with 18+ tools
- **Sub-Agents:** 8 specialized (explore-patient-context, research-evidence, analyze-longitudinal-patterns, generate-session-summary, extract-session-memories, etc.)
- **Tool Orchestration:** Parallel execution (max 3 concurrent read-only tools)
- **MCP Integration:** Foundation types exist, awaiting full integration

### Agent Governance
- **Subscription Tiers:** freemium (base agent only), pro (all agents/tools), max (all + feature flags)
- **RBAC:** `evaluateAgentAccess()` and `evaluateToolAccess()` in `lib/subscriptions/subscription-guard.ts`
- **Token Metering:** `recordTokenConsumption()` with graduated warnings at 70/85/95/100%

---

## Promptware 2026 Patterns Applied
1. **Calidez como Protocolo Conductual:** 5 deterministic communication rules (VALIDACIÓN-PRIMERO, ENMARCADO COLABORATIVO, etc.)
2. **Eliminate Meta-Reasoning:** Replaced with API-level `thinkingConfig`
3. **Convert Negations to Positive Affirmations:** "NO hagas X" → "Haz Y"
4. **Concrete Tool Combination Strategies:** System prompt §8.2 with exhaustivity rule

---

## Performance Optimizations Applied
1. **Firestore I/O:** ~630→~12 ops/msg
   - Eliminated read-before-write
   - O(1) message appends via subcollections
   - Parallel prefetch
   - File fallback short-circuit
2. **LLM Orchestration:** 2→1 LLM calls per message
   - Eliminated pre-classification
   - 300-700ms→<5ms orchestration latency
3. **Sub-Agent Parallelization:** Sequential→Promise.all for Firestore lookups

---

## Security & Compliance

### Current State
- **Authentication:** Firebase Auth (email/password)
- **Authorization:** Subscription-based RBAC
- **PHI Protection:** PII/PHI filtering in logs (lib/utils/pii-filter.ts)
- **Encryption:** HIPAA skeleton exists but not enforced

### Known Gaps (from PR #5)
- 5 API routes missing auth
- PHI logged in plaintext in some routes
- CSP includes `unsafe-eval`
- In-memory rate limiter (needs Redis/Upstash)

---

## CI/CD & Deployment

### Current State
- **Build:** `npx next build` (compiles successfully, prerender fails without Firebase env vars)
- **Type Check:** `npx tsc --noEmit` (~7,500 errors silenced via `ignoreBuildErrors: true`)
- **Testing:** vitest
- **Deployment:** Vercel
- **CI:** CodeQL (GitHub Actions)

### Gaps
- No CI/CD pipeline for build/test/lint on PRs
- No automated deployment verification
- No `.env.example` for 37 required env vars

---

## Cross-Cutting Concerns

### Lessons Learned (from tasks/lessons.md)
1. Never read-before-write with `set({merge:true})`
2. Use O(1) message appends, not O(N) full-history rewrites
3. Parallelize independent Firestore reads with Promise.all
4. Server and client storage backends MUST match
5. Thread context identifiers through full tool execution pipeline
6. Guard `.toISOString()` calls — values may not always be Date objects

### Design System
- **CSS Variables:** Softer borders (opacity /40-/60), translucent cards (bg-card/80-/95)
- **Animations:** framer-motion v12.23.12 with `reducedMotion="user"` support
- **Accessibility:** prefers-reduced-motion via CSS + framer-motion MotionConfig

### PR #6: `claude/fix-academic-research-workflow`
**Status:** IN PROGRESS
**Key Decisions:**
- **Loop Detection System:** SHA-256 hash-based duplicate detection for research tools
  - Request-scoped `toolCallHistory` Map (auto-garbage collected)
  - 60-second window for detecting duplicate queries
  - Triggers pharmacological fallback on 3rd identical attempt
  - Implementation: `lib/agents/streaming-handler.ts` (~220 lines)
  - Prevents infinite retry loops consuming ~16,500 tokens
- **4-Level Fallback Strategy for Polypharmacy:**
  - Level 1: Full query (all drugs + comorbidities, minResults: 3)
  - Level 2: Pairwise interactions (if 3+ drugs, minResults: 2)
  - Level 3: Individual mechanisms + comorbidity (minResults: 1)
  - Level 4: Drug classes + general principles (always executes)
  - Sequential execution with early exit on success
  - Progressive trust score relaxation (60 → 50 → 40 → 30)
- **Automatic Polypharmacy Detection:** Regex-based detection for 12 common psychiatric medications
  - Venlafaxine, Lisdexamfetamine, Mirtazapine, Sertraline, Fluoxetine, Escitalopram, Quetiapine, Aripiprazole, Lamotrigine, Bupropion, Clonazepam, Methylphenidate
- **Pharmacological Reasoning Fallback:** Gemini Flash-Lite generates mechanism-based analysis when no literature exists
  - ~400 tokens cost
  - Provides actionable clinical guidance instead of "No results"
  - Clear disclaimer about theoretical nature
- **Parallel AI Prioritization:** All search levels use Parallel AI exclusively (per user request)
  - No fallback to PubMed or Crossref during testing phase
- **PICO Format Guidance:** Tool declaration now documents PICO (Population, Intervention, Comparison, Outcome) query structure
  - Improves LLM's query construction for better search results
- **Token Efficiency:**
  - Loop detection overhead: ~150 tokens per tool call
  - Pharmacological fallback: ~400 tokens (Gemini Flash-Lite)
  - 4-level fallback: Progressive search with early exit (avg 2-3 levels executed)
  - Total worst-case: <8,000 tokens (vs original ~16,500 in infinite loops)

---

**End of Technical Decisions Document**
