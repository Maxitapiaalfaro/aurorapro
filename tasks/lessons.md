# Lessons Learned

## Patterns & Rules

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

## Session Log

- **2026-04-06:** User corrected priority ordering. Static decomposition analysis missed the Firebase offline-first migration spec. Updated P1 from file decomposition to migration completion. Lesson captured above.
- **2026-04-06:** Cross-agent analysis synthesis completed. Both Claude and Copilot agents converge on cascading LLM calls + dead code as primary bottlenecks. New P2 (dead code purge) inserted before orchestration decomposition. Firebase Auth promoted to P0 (blocks all storage work). ADR-002 recorded.
- **2026-04-06:** P0 (Firebase Auth) and P1 (Firestore offline-first migration) completed. 3 client files deleted (~1,195 lines), replaced by `firestore-client-storage.ts` (545 lines). Net reduction: 650 lines. 5 hooks + 5 components + server-side patient reads migrated.
