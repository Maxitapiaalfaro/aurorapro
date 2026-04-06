# ADR-001: Corrected Decomposition Priorities — Storage Migration Before Decomposition

**Date**: 2026-04-06
**Status**: Accepted
**Context**: User correction during workspace initialization

---

## Decision

**P1 is the Firebase+IndexedDB offline-first migration, NOT file decomposition.**

The initial decomposition analysis (targets.md) ranked `hipaa-compliant-storage.ts` as P1 based on static analysis (low risk, 1 dependent, self-contained). This was wrong — the file is slated for **elimination**, not decomposition.

## Options Considered

### Option A: Decompose existing storage files, then migrate (REJECTED)
- Would create 6 new modules (`lib/storage/`) from `hipaa-compliant-storage.ts`
- All 6 modules would then be deleted during the Firestore migration
- Net result: ~2 weeks of decomposition work thrown away

### Option B: Execute Firestore migration first, then decompose orchestration layer (CHOSEN)
- Eliminates ~2,458 lines of code (6 storage files) rather than reorganizing them
- Foundation files already exist (`firebase-config.ts`, `firebase-admin-config.ts`, `firestore-storage-adapter.ts`)
- Unblocks client-side offline-first capability
- After storage stabilizes, decompose the orchestration layer (P2-P7) on a stable foundation

## Rationale

- The `data-layer-architecture-firestore.md` spec (v1.1, 2026-04-04) is the current approved architecture
- 3 of 4 migration phases have foundational code already implemented
- Decomposing doomed files is negative velocity (creates work, then creates deletion work)
- The orchestration layer (P2-P7) has no dependency on the storage redesign — those decompositions remain valid

## Consequences

- `hipaa-compliant-storage.ts` removed from decomposition targets
- `targets.md` priorities renumbered (P1 = migration, P2-P7 = decomposition)
- `tasks/todo.md` updated with migration sub-tasks
- Lesson captured in `tasks/lessons.md`
