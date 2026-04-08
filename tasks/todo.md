# Aurora Task Tracker

## Active Tasks
<!-- Format: - [ ] Task description | Priority: H/M/L | Status: pending/in-progress/done -->

### Fix: Session Recovery with Patient Context (CRITICAL)
**Problem**: UI doesn't respond / shows nothing when loading a conversation with patient context.

- [ ] Fix 1: Non-blocking sessionMeta reconstruction — show messages FIRST, reconstruct in background | Priority: H | Status: pending
- [ ] Fix 2: Eliminate double-read in `use-patient-conversation-history.ts:openConversation` | Priority: H | Status: pending
- [ ] Fix 3: Defensive date handling in `PatientSummaryBuilder.generateSummaryHash` | Priority: M | Status: pending
- [ ] Verify build passes | Priority: H | Status: pending

### Fix: `save_clinical_memory` tool failure (IN PROGRESS)
- [x] Thread `patientId` from `clinical-agent-router.ts` to `streaming-handler.ts` | Priority: H | Status: done
- [ ] Thread `patientId` through `streaming-handler.ts` → `tool-handlers.ts` | Priority: H | Status: pending
- [ ] Update `save_clinical_memory` handler to prefer `ctx.patientId` | Priority: H | Status: pending

### P5: Further Module Decomposition (MEDIUM)
- [ ] Decompose `clinical-pattern-analyzer.ts` → `lib/patterns/` | Priority: M | Status: pending
- [ ] Decompose `entity-extraction-engine.ts` → `lib/entities/` | Priority: M | Status: pending

### P6: Decompose `hopeai-system.ts` → `lib/system/` (LOW — do last)
- [ ] Decompose after P2-P5 simplify dependencies (also enables server-side storage file elimination) | Priority: L | Status: pending

### P7: Observability & Performance (LOW)
- [ ] Consolidate 5 metrics modules into unified tracker | Priority: L | Status: pending
- [ ] Complete markdown parser migration (remove legacy `markdown-parser.ts`) | Priority: L | Status: pending

### Firebase CLI
- [ ] Deploy rules via `firebase deploy --only firestore:rules` | Priority: H | Status: pending (manual)

## Completed Tasks
<!-- Move completed items here with date -->

- [x] 2026-04-06: P0 — Firebase Auth Integration (COMPLETE)
- [x] 2026-04-06: P1 — Firestore Offline-First Migration (COMPLETE)
- [x] 2026-04-06: P2 — Orchestration Dead Code Purge (COMPLETE)
- [x] 2026-04-06: Gap P0.2 — PII/PHI Filtering in Logs (COMPLETE)
- [x] 2026-04-06: Phase 4a — Server-Side Messages Subcollection (COMPLETE)
- [x] 2026-04-06: Gap P2.1 — Clinical Memory System Foundation (COMPLETE)
- [x] 2026-04-06: P3 — Decompose clinical-agent-router.ts (COMPLETE)
- [x] 2026-04-07: P4 — Unify Dual Public API (COMPLETE)
- [x] 2026-04-07: R1 — Single-Call Architecture (COMPLETE)
- [x] 2026-04-07: UA — Unified Agent Architecture (COMPLETE)
- [x] 2026-04-07: SA — Sub-Agent Architecture (COMPLETE)
- [x] 2026-04-07: PERF — Firestore I/O Optimization (COMPLETE)
- [x] 2026-04-07: Promptware 2026 Audit (COMPLETE)
- [x] 2026-04-07: Gap P2.1 — Clinical Memory System Wiring (COMPLETE)
