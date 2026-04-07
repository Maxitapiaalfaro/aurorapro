# Aurora Task Tracker

## Active Tasks
<!-- Format: - [ ] Task description | Priority: H/M/L | Status: pending/in-progress/done -->

### P2: Orchestration Dead Code Purge — COMPLETE (2026-04-06)
- [x] ALL ITEMS COMPLETE — see Completed Tasks section

### P3: Decompose `clinical-agent-router.ts` → `lib/agents/` — COMPLETE (2026-04-06)
- [x] Extract agent prompt templates (~1,413 lines) to `lib/agents/agent-definitions.ts` | Priority: H | Status: done
- [x] Extract streaming handler (~987 lines) to `lib/agents/streaming-handler.ts` | Priority: H | Status: done
- [x] Extract message context builder (~210 lines) to `lib/agents/message-context-builder.ts` | Priority: M | Status: done
- [x] Router reduced from 3,248 → 706 lines (78% reduction) | Status: done
- [ ] Align session manager with Firestore paths | Priority: M | Status: pending (moved to P4)

### P4: Orchestration Simplification — COMPLETE (2026-04-07)
- [x] Remove DynamicOrchestrator bridge dependency (already done in P2) | Priority: M | Status: done
- [x] Session Maps consolidated: only 1 Map (`activeSessions`) remains after P2 purge (was 8 pre-P2) | Status: done
- [x] Unify dual public API: deleted `routeUserInput()` + 3 helpers + `classifyIntent()` standalone, migrated explicit agent detection to `orchestrateWithTools()` | Priority: M | Status: done
- [x] Remove dead methods from DynamicOrchestrator (cleanupExpiredSessions, getStats, updateConfig) | Priority: M | Status: done
- [x] Remove dead methods from IntelligentIntentRouter (getPerformanceMetrics, validateOptimizations) | Priority: M | Status: done
- [x] Decompose `intelligent-intent-router.ts` → `lib/routing/` (1,538→460 lines, 70% reduction) | Priority: M | Status: done
  - `lib/routing/routing-types.ts` — shared type definitions
  - `lib/routing/intent-declarations.ts` — Gemini function-calling schemas
  - `lib/routing/intent-classifier.ts` — classification, confidence, prompt building
  - `lib/routing/index.ts` — barrel exports
- [x] Removed `useAdvancedOrchestration`, `setAdvancedOrchestration()`, `getOrchestrationStatus()`, `forceStandardRouting` from `hopeai-system.ts` | Status: done
- [ ] Decompose `dynamic-orchestrator.ts` → `lib/orchestration/` | Priority: M | Status: pending (file is only 370 lines post-R1, not needed)

### R1: Single-Call Architecture — COMPLETE (2026-04-07)
- [x] Add `classifyIntentByHeuristic()` to `lib/routing/intent-classifier.ts` — 3-tier deterministic router (regex → keywords → sticky) | Status: done
- [x] Rewrite `intelligent-intent-router.ts` — eliminated LLM Call #1 (intent classification via `gemini-3.1-flash-lite-preview`). 215→135 lines | Status: done
- [x] Rewrite `dynamic-orchestrator.ts` `updateDominantTopics()` — eliminated LLM Call #3 (entity extraction). Now uses keyword-frequency extraction. 392→370 lines | Status: done
- [x] Clean `hopeai-system.ts` — removed dead `intentRouter` field + initialization block | Status: done
- [x] TypeScript compilation verified — zero new errors | Status: done
- **Impact**: 2→1 LLM calls per message, 300-700ms orchestration latency → <5ms, ~800 tokens/msg overhead eliminated

### P5: Further Module Decomposition (MEDIUM)
- [ ] Decompose `clinical-pattern-analyzer.ts` → `lib/patterns/` | Priority: M | Status: pending
- [ ] Decompose `entity-extraction-engine.ts` → `lib/entities/` | Priority: M | Status: pending

### P6: Decompose `hopeai-system.ts` → `lib/system/` (LOW — do last)
- [ ] Decompose after P2-P5 simplify dependencies (also enables server-side storage file elimination) | Priority: L | Status: pending

### P7: Observability & Performance (LOW)
- [x] PII/PHI redaction in logger + Sentry (Gap P0.2) | Priority: H | Status: done
- [x] Replace console.log in orchestration layer (116/164 calls, 71%): `hopeai-system.ts`, `clinical-agent-router.ts`, `dynamic-orchestrator.ts`, `intelligent-intent-router.ts`, `routing/intent-classifier.ts` | Priority: M | Status: done
- [x] Replace remaining console.log calls in `lib/agents/` — already clean (0 calls found) | Priority: M | Status: done
- [ ] Consolidate 5 metrics modules into unified tracker | Priority: L | Status: pending
- [ ] Complete markdown parser migration (remove legacy `markdown-parser.ts`) | Priority: L | Status: pending

### Gap Analysis: Clinical Memory (P2.1)
- [x] Create `types/memory-types.ts` (ClinicalMemory types) | Priority: H | Status: done
- [x] Create `lib/clinical-memory-system.ts` (CRUD + relevance search) | Priority: H | Status: done
- [ ] Wire into `hopeai-system.ts` (after P2 merges) | Priority: M | Status: pending
- [ ] Add memory extraction at session end | Priority: M | Status: pending

### Server-Side Subcollection Alignment (Phase 4a)
- [x] Add `addMessage()` to `firestore-storage-adapter.ts` | Priority: H | Status: done
- [x] Strip `history[]` from session doc, write to subcollection | Priority: H | Status: done
- [x] `loadChatSession()` reads from subcollection + legacy fallback | Priority: H | Status: done
- [x] Pass-through in `server-storage-adapter.ts` | Priority: H | Status: done

## Completed Tasks
<!-- Move completed items here with date -->

- [x] 2026-04-06: Workspace initialization (agent_workspace/ + tasks/)
- [x] 2026-04-06: Baseline architecture analysis → `agent_workspace/analysis/aurora-architecture.md`
- [x] 2026-04-06: Claude Code pattern extraction → `agent_workspace/analysis/claude-code-patterns.md`
- [x] 2026-04-06: Decomposition targets identified → `agent_workspace/optimizations/lib-decomposition/targets.md`
- [x] 2026-04-06: Firebase Auth integration plan → planned (5 phases, 15 files)
- [x] 2026-04-06: Cross-agent orchestration analysis synthesis → `agent_workspace/analysis/orchestration-bottleneck-synthesis.md`
- [x] 2026-04-06: **P0 — Firebase Auth Integration** (COMPLETE)
  - `providers/auth-provider.tsx`, `components/auth-gate.tsx`, `lib/security/firebase-auth-verify.ts`
  - 4 API routes secured, `demo_user` hardcodes removed, sign-out in header
- [x] 2026-04-06: **P1 — Firestore Offline-First Migration** (COMPLETE)
  - Created `lib/firestore-client-storage.ts` (545 lines) — replaces 3 client-side storage files (~1,195 lines deleted)
  - Deleted: `clinical-context-storage.ts`, `patient-persistence.ts`, `client-context-persistence.ts`
  - Messages as Firestore subcollection (O(1) writes), `onSnapshot` real-time subscriptions
  - `firestore.rules` created (not yet deployed)
  - Server-side files intentionally kept — future P6 target
- [x] 2026-04-06: **P2 — Orchestration Dead Code Purge** (COMPLETE)
  - **12 files deleted**: `hopeai-orchestration-bridge.ts`, `user-preferences-manager.ts`, `index.ts`, `orchestration-singleton.ts`, `orchestrator-monitoring.ts`, `search-query-middleware.ts`, `academic-search-enhancer.ts`, 4 `/api/orchestration/` routes, `examples/orchestration-setup.ts`
  - **1 file cleaned**: `dynamic-orchestrator.ts` (1,092→452 lines, -640 lines)
  - `intelligent-intent-router.ts` already clean (1,538 lines — dead code removed in prior session)
  - **3 files surgically edited**: `hopeai-system.ts` (dead re-export + getUserAnalytics), `pioneer-circle/route.ts` (unused import), `admin-auth.ts` (dead orchestration routes)
  - Total removed: ~3,838 lines of dead/disabled code
  - Verification: zero new TypeScript errors (4 pre-existing remain unchanged), zero dangling imports
- [x] 2026-04-06: **Gap P0.2 — PII/PHI Filtering in Logs** (COMPLETE)
  - Extended `lib/logger.ts` with `PHI_REDACTION_PATTERNS` (RUT, SSN, email, phone, DOB, address, patient names)
  - `redactPHI()` applies in ALL environments (HIPAA compliance), exported for reuse
  - `sanitizeContext()` now redacts PHI in all envs (not just production)
  - Sentry `warn()` and `error()` calls now redact PHI before sending
  - Added `beforeBreadcrumb` + PHI redaction to `beforeSend` in all 3 Sentry configs (server, edge, client)
  - Removed PII from highest-risk console.log calls: patient names, userIds, service account emails
  - Files modified: `logger.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `clinical-pattern-analyzer.ts`, `firestore-storage-adapter.ts`, `enhanced-sentry-metrics-tracker.ts`, `firebase-admin-config.ts`, `clinical-agent-router.ts`, `sse-client.ts`
- [x] 2026-04-06: **Phase 4a — Server-Side Messages Subcollection** (COMPLETE)
  - Added `addMessage()` to `firestore-storage-adapter.ts` (O(1) per message, matches client-side)
  - `saveChatSession()` strips `history[]` from session doc, writes messages to subcollection in batches
  - `loadChatSession()` reads from `messages` subcollection with legacy inline fallback
  - Pass-through `addMessage()` added to `server-storage-adapter.ts`
- [x] 2026-04-06: **Gap P2.1 — Clinical Memory System Foundation** (COMPLETE)
  - Created `types/memory-types.ts` (ClinicalMemory, ClinicalMemoryCategory, ClinicalMemoryQueryOptions)
  - Created `lib/clinical-memory-system.ts` — CRUD (save, get, update, deactivate) + keyword relevance search
  - Firestore path: `psychologists/{uid}/patients/{pid}/memories/{memoryId}`
  - Spanish stop-words tokenizer, combined scoring (60% keyword, 20% relevance, 20% confidence)
  - Uses safe logger (no console.log), firebase-admin SDK, immutable field protection
- [x] 2026-04-06: **P3 — Decompose `clinical-agent-router.ts` → `lib/agents/`** (COMPLETE)
  - **3 new modules**: `agent-definitions.ts` (1,413 lines), `streaming-handler.ts` (987 lines), `message-context-builder.ts` (210 lines)
  - Router reduced from 3,248 → 706 lines (**78% reduction**)
  - `agent-definitions.ts`: GLOBAL_BASE_INSTRUCTION + createAgentDefinitions() factory (socratico, clinico, academico)
  - `streaming-handler.ts`: handleStreamingWithTools, handleNonStreamingWithTools, text extraction, grounding URL validation
  - `message-context-builder.ts`: 9 context-building functions (buildEnhancedMessage, getRoleMetadata, addAgentTransitionContext, etc.)
  - Verification: zero new TypeScript errors, all imports updated
- [x] 2026-04-07: **P4 — Unify Dual Public API** (COMPLETE)
  - Deleted `routeUserInput()` + 3 private helpers (`handleFallback`, `logRoutingDecision`, `convertToLocalContentType`) from `intelligent-intent-router.ts`
  - Deleted `classifyIntent()` standalone function from `intent-classifier.ts` (~70 lines)
  - Migrated explicit agent detection (regex-based) into `orchestrateWithTools()` fast path
  - Removed `useAdvancedOrchestration` flag, `setAdvancedOrchestration()`, `getOrchestrationStatus()` from `hopeai-system.ts`
  - Removed dead `forceStandardRouting` variable and fallback routing branch (~40 lines)
  - Updated barrel file `routing/index.ts` (removed `classifyIntent` export)
  - `intelligent-intent-router.ts`: 559 → 216 lines (**61% reduction**)
  - Net reduction: ~340 lines removed
  - Verification: zero new TypeScript errors, zero dangling references

## Review Notes
<!-- Post-task review observations -->

- Two independent agents converge on same diagnosis: cascading LLM calls + dead code are primary bottlenecks
- Agent B (Copilot) found unique memory concerns: 8 Maps, ~565KB/session, no LRU eviction
- Agent A (Claude) quantified token waste: 4.7x more tokens per request
- New task inserted: P2 (dead code purge) before orchestration decomposition — prevents decomposing code that should be deleted
- P1 lesson: Server-side storage files can't be eliminated yet — `hopeai-system.ts` uses `ServerStorageAdapter` for server-side session persistence
