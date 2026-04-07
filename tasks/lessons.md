# Lessons Learned

## Patterns & Rules

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

## Session Log

- **2026-04-06:** User corrected priority ordering. Static decomposition analysis missed the Firebase offline-first migration spec. Updated P1 from file decomposition to migration completion. Lesson captured above.
- **2026-04-06:** Cross-agent analysis synthesis completed. Both Claude and Copilot agents converge on cascading LLM calls + dead code as primary bottlenecks. New P2 (dead code purge) inserted before orchestration decomposition. Firebase Auth promoted to P0 (blocks all storage work). ADR-002 recorded.
- **2026-04-06:** P0 (Firebase Auth) and P1 (Firestore offline-first migration) completed. 3 client files deleted (~1,195 lines), replaced by `firestore-client-storage.ts` (545 lines). Net reduction: 650 lines. 5 hooks + 5 components + server-side patient reads migrated.
- **2026-04-07:** R1 (Single-Call Architecture) completed. LLM pre-classification eliminated. 2→1 LLM calls per message. 300-700ms→<5ms orchestration latency. Key discovery: contextualTools were never consumed by chat sessions.
- **2026-04-07:** Promptware 2026 audit completed. All 3 agent prompts refactored: 1,414→456 lines (68% reduction), ~13,134→~5,520 tokens. Key synthesis: "Calidez como Protocolo Conductual" — encoding warmth as behavioral rules instead of abstract adjectives. 3 lessons captured above.
