# Lessons Learned

## Patterns & Rules

### 2026-04-06: Always cross-reference existing architectural decisions before proposing changes
- **Error:** Proposed decomposing `hipaa-compliant-storage.ts` into 6 sub-modules (P1 target), when an existing spec (`docs/architecture/data-layer-architecture-firestore.md`, dated 2026-04-04) already mandates eliminating it entirely in favor of Firestore.
- **Root Cause:** Performed static code analysis without first checking for existing architectural decisions, migration plans, or strategic documents that override the current codebase state.
- **Rule:** Before proposing ANY structural change, always search `docs/`, `ARCHITECTURE.md`, `STRATEGIC_PRIORITIES.md`, and `tasks/` for existing decisions that may supersede static analysis. The codebase represents the present; the docs may represent the approved future.

### 2026-04-06: Storage layer has a defined target architecture — do not redesign independently
- **Error:** Treated storage files as decomposition targets when they are migration/elimination targets.
- **Root Cause:** Analyzed files in isolation by size/coupling without checking their lifecycle status in the project roadmap.
- **Rule:** For Aurora's storage layer specifically: the target is Firebase+IndexedDB offline-first with optimistic updates. Files marked for elimination: `clinical-context-storage.ts`, `client-context-persistence.ts`, `patient-persistence.ts`, `hipaa-compliant-storage.ts`, `server-storage-adapter.ts`, `server-storage-memory.ts`. Reference: `docs/architecture/data-layer-architecture-firestore.md`.

### 2026-04-06: Purge dead code before decomposing — don't decompose what should be deleted
- **Observation:** Cross-agent analysis found ~2,400 lines of disabled/dead code in the orchestration stack (bridge, bullets, recommendations, edge-case detection, user preferences). Decomposing these files without first removing dead code would mean creating new module boundaries around code that should be deleted.
- **Rule:** Before decomposing any file, first identify and remove dead/disabled code within it. Dead code includes: features behind `enabled: false` configs, methods behind `// DISABLED` comments, unreachable code paths from completed migrations, entire modules that feed only into disabled systems.

### 2026-04-06: Triangulate with multiple analysis sources — independent convergence builds confidence
- **Observation:** Two independent AI agents (different models, no shared context) converged on the same 4 core findings about Aurora's orchestration. This convergence increases confidence compared to a single analysis.
- **Rule:** For architectural assessments of critical systems, prefer triangulation: run independent analyses and look for convergent findings. Unique findings from single sources should be marked for manual verification.

## Session Log

- **2026-04-06:** User corrected priority ordering. Static decomposition analysis missed the Firebase offline-first migration spec. Updated P1 from file decomposition to migration completion. Lesson captured above.
- **2026-04-06:** Cross-agent analysis synthesis completed. Both Claude and Copilot agents converge on cascading LLM calls + dead code as primary bottlenecks. New P2 (dead code purge) inserted before orchestration decomposition. Firebase Auth promoted to P0 (blocks all storage work). ADR-002 recorded.
