# Lessons Learned

## Patterns & Rules

### 2026-04-07: Never read-before-write in Firestore when using set({merge:true})
- **Error:** `saveChatSessionBoth` ran `loadChatSession()` (collectionGroup + ALL messages) before every `saveChatSession()` just to check existence. Called 3-5x per message = 260+ unnecessary reads per message for a 50-msg session.
- **Root Cause:** Defensive "check-then-set" pattern that made sense with a non-idempotent backend but is pure waste with Firestore's `set({merge:true})`.
- **Rule:** If the storage layer uses `set({merge:true})` (creates or updates idempotently), NEVER read before writing. The caller already knows whether the session exists from the initial load.

### 2026-04-07: Use O(1) message appends, not O(N) full-history rewrites
- **Error:** `saveChatSession()` batch-wrote the entire `history[]` on every save. For a 50-message session saved 3-5x per request → 150-250 message writes per user message.
- **Root Cause:** `addMessage()` existed (O(1) per message) but was never wired to `HopeAISystem`. All code used the full-session save.
- **Rule:** For subcollection-based message storage, use `addMessage()` for incremental saves. Only use full-history writes on initial session creation. Separate `saveSessionMetadataOnly()` from `saveChatSession()`.

### 2026-04-07: Parallelize independent Firestore reads with Promise.all
- **Error:** `sendMessage()` ran 10+ sequential Firestore reads (patient record, fichas, memories, files, metadata) before calling the AI. Total sequential latency: 400-1200ms.
- **Root Cause:** Organic accumulation of features — each feature added its own await without considering the pipeline.
- **Rule:** At the start of any request handler, identify all independent I/O operations and run them in a single `Promise.all`. Pass prefetched results to downstream functions instead of having each function fetch its own data.

### 2026-04-07: Server and client storage backends MUST match
- **Error:** After migrating client to Firestore, the server-side `ServerStorageAdapter` continued using SQLite (HIPAACompliantStorage) in local dev because the backend selection depended on `VERCEL` env var — which is only set in production. Server wrote to SQLite, client read from Firestore → zero persistence visible to the user.
- **Root Cause:** Backend selection logic was environment-based (`isVercel`) instead of capability-based (Firebase credentials available). The migration added Firestore support but gated it behind a Vercel-only condition, leaving local dev on the old backend.
- **Rule:** When client and server share a storage layer, the backend selector must use **capability detection** (are credentials present?) not **environment detection** (are we on Vercel?). Always verify that both sides of a read/write split point to the same database.

### 2026-04-06: Always cross-reference existing architectural decisions before proposing changes
- **Error:** Proposed decomposing `hipaa-compliant-storage.ts` into 6 sub-modules (P1 target), when an existing spec (`docs/architecture/data-layer-architecture-firestore.md`, dated 2026-04-04) already mandates eliminating it entirely in favor of Firestore.
- **Root Cause:** Performed static code analysis without first checking for existing architectural decisions, migration plans, or strategic documents that override the current codebase state.
- **Rule:** Before proposing ANY structural change, always search `docs/`, `ARCHITECTURE.md`, `STRATEGIC_PRIORITIES.md`, and `tasks/` for existing decisions that may supersede static analysis. The codebase represents the present; the docs may represent the approved future.

### 2026-04-06: Storage layer has a defined target architecture — do not redesign independently
- **Error:** Treated storage files as decomposition targets when they are migration/elimination targets.
- **Root Cause:** Analyzed files in isolation by size/coupling without checking their lifecycle status in the project roadmap.
- **Rule:** For Aurora's storage layer specifically: the target is Firebase+IndexedDB offline-first with optimistic updates. **Client-side files eliminated (P1 DONE):** `clinical-context-storage.ts`, `client-context-persistence.ts`, `patient-persistence.ts`. **Server-side files kept (future P6 target):** `hipaa-compliant-storage.ts`, `server-storage-adapter.ts`, `server-storage-memory.ts` — still used by `hopeai-system.ts` server pipeline. Reference: `docs/architecture/data-layer-architecture-firestore.md`.

### 2026-04-06: Purge dead code before decomposing — don't decompose what should be deleted
- **Observation:** Cross-agent analysis found ~2,400 lines of disabled/dead code in the orchestration stack (bridge, bullets, recommendations, edge-case detection, user preferences). Decomposing these files without first removing dead code would mean creating new module boundaries around code that should be deleted.
- **Rule:** Before decomposing any file, first identify and remove dead/disabled code within it. Dead code includes: features behind `enabled: false` configs, methods behind `// DISABLED` comments, unreachable code paths from completed migrations, entire modules that feed only into disabled systems.

### 2026-04-06: Triangulate with multiple analysis sources — independent convergence builds confidence
- **Observation:** Two independent AI agents (different models, no shared context) converged on the same 4 core findings about Aurora's orchestration. This convergence increases confidence compared to a single analysis.
- **Rule:** For architectural assessments of critical systems, prefer triangulation: run independent analyses and look for convergent findings. Unique findings from single sources should be marked for manual verification.

### 2026-04-06: Server-side storage files cannot be eliminated with client-side migration alone
- **Observation:** P1 plan originally listed 6 files for deletion. Only 3 client-side files could be deleted. Server-side files (`server-storage-adapter.ts`, `hipaa-compliant-storage.ts`, `server-storage-memory.ts`) are still consumed by `hopeai-system.ts`'s server pipeline and cannot be removed without a separate server-side refactor.
- **Rule:** When planning file deletions, verify the full dependency graph (both client-side and server-side consumers) before committing to a deletion count. Server-side files used by API routes survive client-side migrations.

### 2026-04-06: O(1) message writes via subcollection outperform O(N) session rewrites
- **Pattern:** Storing chat messages as individual Firestore documents in a `messages/{mid}` subcollection enables O(1) writes per message instead of rewriting the entire session document (O(N) where N = message count). The old IndexedDB approach rewrote the entire `ChatState.history[]` array on every message.
- **Implementation:** `addMessage()` writes a single doc + touches `metadata.lastUpdated` on the session. `loadSessionWithMessages()` reads session doc + queries subcollection. Falls back to inline `history[]` for legacy compatibility.

### 2026-04-07: Trace actual data consumers before optimizing producers
- **Discovery:** The LLM-driven tool selection system (`classifyIntentAndExtractEntities()` → `selectContextualTools()` → `contextualTools`) produced results that **no consumer ever used**. The Gemini chat session gets its tools from `agentConfig.tools` (agent-definitions.ts), NOT from the orchestrator's dynamic selection. ~300-700ms per request was spent producing dead output.
- **Rule:** Before optimizing a system, trace what actually consumes its output. If the output is only logged or stored but never read by downstream code, the entire producer can be replaced with a simpler mechanism or eliminated entirely.

### 2026-04-07: Prefer deterministic routing over LLM classification for bounded decision spaces
- **Decision:** Replaced LLM-based intent classification (3 agents) with deterministic keyword heuristic. The decision space is small (3 options), the keywords are predictable, and the main model can handle cross-domain queries natively.
- **Rule:** LLM calls for routing/classification are only justified when the decision space is large, when the options themselves change dynamically, or when natural language understanding is genuinely required. For fixed categories with strong keyword signals, heuristics are faster, cheaper, and more predictable.

### 2026-04-07: Encode warmth as deterministic behavioral protocols, not abstract adjectives
- **Problem:** Promptware 2026 best practices demand eliminating abstract adjectives ("sé cálida", "profesional"), but clinical agents need conversational warmth to avoid robotic output.
- **Solution:** "Calidez como Protocolo Conductual" — 5 deterministic communication rules (VALIDACIÓN-PRIMERO, ENMARCADO COLABORATIVO, ESPEJO EMOCIONAL, NOMBRAMIENTO DEL ACIERTO, LÍMITE EMPÁTICO) that produce warm output through observable behaviors.
- **Rule:** If a prompt quality (e.g., "warmth", "empathy") can't be observed in the output, it doesn't belong in the prompt. Convert abstract qualities into specific behavioral rules with measurable constraints (e.g., "≤1 oración", "≤10 palabras").

### 2026-04-07: Eliminate meta-reasoning instructions when API-level thinking is configured
- **Discovery:** All 3 agents had "think before responding" prompt sections (~20-40 lines each) that duplicated `thinkingLevel: 'medium'` already in the Gemini API config.
- **Rule:** When the model API provides a thinking/reasoning parameter (e.g., Gemini's `thinkingConfig`), remove all prompt-level meta-reasoning instructions. They waste tokens and can conflict with the API behavior.

### 2026-04-07: Convert negations to positive affirmations with routes
- **Pattern:** Per SCORE framework, "NO eres un transcriptor" keeps residual attention on "transcriptor". Better: "Sintetizas información clínica en documentación profesional" — directs attention to the desired behavior.
- **Rule:** Replace "NO hagas X" / "NUNCA hagas X" with "Haz Y" where Y is the positive behavior. Include the verb + specific output format when possible.

### 2026-04-07: Never block UI rendering on background data reconstruction

### 2026-04-07: Use refs for state accessed inside useCallback with minimal deps
- **Error:** `sendMessage` useCallback had `[systemState.sessionId, systemState.activeAgent]` deps, but accessed `systemState.sessionMeta`, `.mode`, `.userId` inside the body. When patient was selected (updating sessionMeta), sendMessage kept its stale closure — patient context was invisible.
- **Root Cause:** React `useCallback` captures a closure snapshot at creation time. Only values in the dependency array trigger re-creation. Any other state accessed inside the callback is stale.
- **Rule:** For complex callbacks with many state dependencies, use a ref pattern (`systemStateRef.current = systemState` on every render) and read from the ref inside the callback. This avoids both stale closures AND excessive re-creation.

### 2026-04-07: Keep fallback/default values consistent across client and server
- **Error:** Server `addMessageToSession()` used `'_general'` as patientId fallback. Client and server-storage-adapter both used `'default_patient'`. Messages went to `patients/_general/`, session metadata to `patients/default_patient/` — creating ghost session docs.
- **Rule:** Define default values as constants in one place and import them, OR use the same literal everywhere. Grep for the default value before using it to check for inconsistencies.

### 2026-04-07: Never block UI rendering on background data reconstruction
- **Error:** `loadSession()` set `isLoading: true`, then ran a heavy async waterfall (3 dynamic imports + 2 Firestore reads + 1 Firestore write) to reconstruct `sessionMeta`, and only THEN set `history` in state. Users saw a blank screen for seconds while I/O completed.
- **Root Cause:** The sessionMeta reconstruction was treated as a prerequisite for showing messages, when in reality messages can be displayed without sessionMeta.
- **Rule:** When loading a view, immediately render what you already have (e.g., chat history). Reconstruct missing metadata in the background (fire-and-forget async IIFE) and update state when done. Never gate visible content on non-visible metadata.

### 2026-04-07: Avoid double-reads — check if the first query already returned the needed data
- **Error:** `openConversation()` called `findSessionById()` (collectionGroup query + messages subcollection load), then called `loadSessionWithMessages()` which read the exact same session doc + messages again. 2× the Firestore reads for identical data.
- **Root Cause:** `openConversation` was written before `findSessionById` was enhanced to also load messages. The code wasn't updated when the underlying function gained the needed capability.
- **Rule:** After modifying a data-loading function to return more data, audit all callers to remove any now-redundant secondary loads. This is especially important for Firestore where each read has latency and cost.

### 2026-04-07: Guard `.toISOString()` calls — values may not always be Date objects
- **Error:** `generateSummaryHash()` called `patient.updatedAt.toISOString()` unconditionally. If `updatedAt` arrived as a string (Firestore offline cache edge case, JSON serialization), this crashed, breaking the sessionMeta reconstruction path.
- **Rule:** When calling Date methods (`.toISOString()`, `.getTime()`, etc.) on data from external sources (Firestore, API, deserialization), always guard with `instanceof Date` or convert first. Use `x instanceof Date ? x.toISOString() : String(x)` pattern.

### 2026-04-07: Thread context identifiers through the full tool execution pipeline
- **Error:** `save_clinical_memory` tool handler used `ctx.patientId` which was always `undefined` because no caller passed it through the `streaming-handler.ts` → `executeToolCall` → handler chain.
- **Root Cause:** When the tool execution pipeline was built, `patientId` was expected to come from Gemini's `args.patientId`. But Gemini doesn't always include it, and the authoritative source (session context) was never threaded through.
- **Rule:** For any context identifier (userId, patientId, sessionId), thread it from the entry point (API route or session context) through every middleware layer to the final handler. Don't rely on the LLM to provide identifiers that the system already knows.

### 2026-04-10: Balancing token optimization with clinical integrity
- **Context:** Optimized unified-system-prompt.ts from 5,492→5,175 tokens (5.7% reduction) with Promptware 2026 audit. Target was 10%, actual 5.7%. Gap due to clinical quality preservation constraints.
- **Discovery:** ~46% of system prompt tokens are non-compressible without compromising clinical efficacy: (1) 5 behavioral communication rules (VALIDACIÓN-PRIMERO, ENMARCADO COLABORATIVO, etc.) — deterministic warmth encoding that replaces abstract adjectives, (2) Tool combination strategies table (§8.2) — prevents tool underutilization and ensures comprehensive responses, (3) Ethics and consent sections (§7) — HIPAA compliance and therapeutic integrity constraints.
- **Rule:** For health-tech agent prompts, establish "sacred sections" that are off-limits for compression: behavioral protocols (therapeutic quality), tool strategies (agent competence), ethics/compliance (regulatory requirements). Apply aggressive optimization only to meta-instructions, redundancies, and abstract language. Measure token ROI per section — some verbose sections prevent expensive errors downstream (e.g., tool strategy table prevents multi-turn clarification loops that cost more tokens than the table itself).

### 2026-04-10: Remove prompt-level meta-reasoning when API provides thinking configuration
- **Pattern:** Gemini API's `thinkingConfig: { thinkingLevel: 'medium' }` makes prompt instructions like "Antes de responder, evalúa internamente..." redundant and potentially conflicting.
- **Example:** Removed §4.1's pre-response evaluation checklist (8 lines, ~150 tokens) because it duplicated API-level thinking. Changed "Antes de responder, evalúa internamente:" → "Componentes de evaluación:" (directive list instead of meta-instruction).
- **Rule:** When model API exposes reasoning/thinking parameters (Gemini's thinkingConfig, Claude's extended thinking, etc.), eliminate all prompt-level "think before responding" instructions. They waste tokens and may interfere with API implementation. Convert meta-cognitive instructions ("evalúa", "considera", "reflexiona") to direct imperative instructions ("identifica", "lista", "compara").

### 2026-04-10: Convert negations to positive affirmations with specific routes
- **Principle:** Per SCORE framework (Steering, Context, Outcome, Route, Examples), "NO hagas X" keeps residual attention on undesired behavior X. Positive framing directs full attention to desired behavior Y.
- **Examples Applied:**
  - ❌ "NO eres un transcriptor" → ✅ "Sintetizas información clínica en documentación profesional estructurada"
  - ❌ "NUNCA inventes información" → ✅ "Cada afirmación rastreable al material fuente"
  - ❌ "NO generes documentación automáticamente" → ✅ "Analiza y responde directamente"
- **Rule:** Replace "NO/NUNCA + [behavior]" with "[positive alternative] + [concrete constraint]". Include verb + specific output format when possible. For critical safety constraints (e.g., PHI handling), keep negation but balance with positive route: "NUNCA [danger]. En su lugar, [safe alternative]."

### 2026-04-10: Freemium tier viability requires multi-phase token optimization
- **Discovery:** Performance Agent revealed critical business constraint: Freemium tier (500K tokens/month) was already exceeded at baseline. With 5,492-token prompt × 100 messages/month = 549,200 tokens (110% of limit), users would hit quota before normal usage.
- **Impact:** 5.7% optimization (5,492→5,175 tokens) improved to 517,500 tokens/month (103.5% of limit) — still over but gained 6.3% headroom. To achieve full viability (≤450K tokens to allow 50K margin), would need 18% reduction from baseline or 13% reduction from current state.
- **Rule:** For subscription-tiered AI products, measure token consumption per-tier at baseline BEFORE optimization. Calculate: (prompt_tokens × expected_msgs_per_month) + (avg_completion_tokens × expected_msgs_per_month) + tool_tokens. Freemium tiers need 10-20% safety margin because users max out usage. Design optimization roadmap in phases with incremental measurements rather than one-shot targets.

## Session Log

- **2026-04-06:** User corrected priority ordering. Static decomposition analysis missed the Firebase offline-first migration spec. Updated P1 from file decomposition to migration completion. Lesson captured above.
- **2026-04-06:** Cross-agent analysis synthesis completed. Both Claude and Copilot agents converge on cascading LLM calls + dead code as primary bottlenecks. New P2 (dead code purge) inserted before orchestration decomposition. Firebase Auth promoted to P0 (blocks all storage work). ADR-002 recorded.
- **2026-04-06:** P0 (Firebase Auth) and P1 (Firestore offline-first migration) completed. 3 client files deleted (~1,195 lines), replaced by `firestore-client-storage.ts` (545 lines). Net reduction: 650 lines. 5 hooks + 5 components + server-side patient reads migrated.
- **2026-04-07:** R1 (Single-Call Architecture) completed. LLM pre-classification eliminated. 2→1 LLM calls per message. 300-700ms→<5ms orchestration latency. Key discovery: contextualTools were never consumed by chat sessions.
- **2026-04-07:** Promptware 2026 audit completed. All 3 agent prompts refactored: 1,414→456 lines (68% reduction), ~13,134→~5,520 tokens. Key synthesis: "Calidez como Protocolo Conductual" — encoding warmth as behavioral rules instead of abstract adjectives. 3 lessons captured above.
- **2026-04-07:** PERF — Firestore I/O Optimization completed. ~630→~12 ops/msg. 5 phases: eliminated read-before-write, O(1) message appends, parallel prefetch, eliminated client-side findSessionById calls, file fallback short-circuit.
- **2026-04-07:** Patient Tools — Added `create_patient` + `list_patients` tools (6 files, +256 lines). Server-side firebase-admin CRUD. Agent can now autonomously create and discover patients.
- **2026-04-07:** patientId Threading — Fixed `save_clinical_memory` tool failure. Threaded `patientId` from `clinical-agent-router.ts` through `streaming-handler.ts` to `tool-handlers.ts`.
- **2026-04-07:** Session Recovery Fix — Fixed blank screen on loading conversations with patient context. Non-blocking sessionMeta reconstruction, eliminated double-read, defensive date handling.
- **2026-04-07:** Patient Session Path Fix — Sessions with patient context saved under `_general` instead of patient-specific path. 4-part bug chain: (1) stale closure in sendMessage (sessionMeta not in deps → used ref pattern), (2) createSession didn't send patientSessionMeta to server, (3) server fallback `_general` inconsistent with `default_patient` everywhere else, (4) ghost session docs via server's `addMessage` set({merge:true}).
- **2026-04-10:** System Prompt Architecture Optimization — Conducted Promptware 2026 audit of unified-system-prompt.ts. Parallel execution: AIExpert Agent (audit) + Performance Agent (baseline measurement). 23 violations found (77% compliance → 95% target). 3-phase optimization executed: (P0) remove meta-reasoning + add schema refs (-97 tokens), (P1) eliminate abstract adjectives (-233 tokens), (P2) convert negations + deduplicate (-370 tokens). **Result: 5,492→5,175 tokens (5.7% reduction, -315 tokens)** vs 10% target. Key learnings: (1) Freemium tier crisis revealed — 549,200 tokens/100 msgs vs 500K limit, optimization improves to 517,500 tokens (103.5% of limit, still over), (2) Calidez como Protocolo Conductual scales across agent types, (3) token efficiency vs clinical quality requires careful balance — no shortcuts in therapeutic integrity or HIPAA sections.
