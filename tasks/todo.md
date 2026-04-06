# Aurora Task Tracker

## Active Tasks
<!-- Format: - [ ] Task description | Priority: H/M/L | Status: pending/in-progress/done -->

### P2: Orchestration Dead Code Purge (HIGH — do before decomposition)
- [ ] Delete `hopeai-orchestration-bridge.ts` (501 lines, migration complete) | Priority: H | Status: pending
- [ ] Delete bullet generation system (~600 lines in dynamic-orchestrator.ts) | Priority: H | Status: pending
- [ ] Delete recommendations engine (~400 lines in dynamic-orchestrator.ts) | Priority: M | Status: pending
- [ ] Delete user-preferences-manager.ts (~315 lines, feeds disabled recs) | Priority: M | Status: pending
- [ ] Delete edge-case forced routing (~400 lines in intelligent-intent-router.ts) | Priority: M | Status: pending
- [ ] Delete empty files: `search-query-middleware.ts`, `academic-search-enhancer.ts` | Priority: L | Status: pending

### P3: Decompose `clinical-agent-router.ts` → `lib/agents/` (HIGH)
- [ ] Extract agent prompt templates (~1,400 lines) to `lib/agents/agent-definitions.ts` | Priority: H | Status: pending
- [ ] Extract streaming handler to `lib/agents/streaming-handler.ts` | Priority: M | Status: pending
- [ ] Align session manager with Firestore paths | Priority: M | Status: pending

### P4: Orchestration Simplification (MEDIUM)
- [ ] Remove DynamicOrchestrator bridge dependency (after P2 bridge deletion) | Priority: M | Status: pending
- [ ] Consolidate 8 session Maps into single bounded state structure | Priority: M | Status: pending
- [ ] Unify dual public API: keep `orchestrateWithTools()`, deprecate `routeUserInput()` | Priority: M | Status: pending
- [ ] Decompose `dynamic-orchestrator.ts` → `lib/orchestration/` | Priority: M | Status: pending
- [ ] Decompose `intelligent-intent-router.ts` → `lib/routing/` | Priority: M | Status: pending

### P5: Further Module Decomposition (MEDIUM)
- [ ] Decompose `clinical-pattern-analyzer.ts` → `lib/patterns/` | Priority: M | Status: pending
- [ ] Decompose `entity-extraction-engine.ts` → `lib/entities/` | Priority: M | Status: pending

### P6: Decompose `hopeai-system.ts` → `lib/system/` (LOW — do last)
- [ ] Decompose after P2-P5 simplify dependencies (also enables server-side storage file elimination) | Priority: L | Status: pending

### P7: Observability & Performance (LOW)
- [ ] Replace 30+ console.log calls with structured telemetry | Priority: M | Status: pending
- [ ] Consolidate 5 metrics modules into unified tracker | Priority: L | Status: pending
- [ ] Complete markdown parser migration (remove legacy `markdown-parser.ts`) | Priority: L | Status: pending

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
- [x] 2026-04-06: **P1 — Firebase+IndexedDB Offline-First Migration** (COMPLETE)
  - Created `lib/firestore-client-storage.ts` (545 lines) — replaces 3 client-side storage files (~1,195 lines deleted)
  - Deleted: `clinical-context-storage.ts`, `patient-persistence.ts`, `client-context-persistence.ts`
  - Migrated: 5 hooks, 5 components, server-side patient reads (firebase-admin)
  - Messages as Firestore subcollection (O(1) writes), `onSnapshot` real-time subscriptions
  - `firestore.rules` created with psychologist-scoped access + collectionGroup rule
  - Server-side files (`server-storage-adapter.ts`, `hipaa-compliant-storage.ts`, `server-storage-memory.ts`) intentionally kept — still used by server pipeline

## Review Notes
<!-- Post-task review observations -->

- Two independent agents converge on same diagnosis: cascading LLM calls + dead code are primary bottlenecks
- Agent B (Copilot) found unique memory concerns: 8 Maps, ~565KB/session, no LRU eviction
- Agent A (Claude) quantified token waste: 4.7x more tokens per request
- New task inserted: P2 (dead code purge) before orchestration decomposition — prevents decomposing code that should be deleted
- P1 lesson: Server-side storage files can't be eliminated yet — `hopeai-system.ts` uses `ServerStorageAdapter` for server-side session persistence
