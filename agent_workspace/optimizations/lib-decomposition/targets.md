# Lib Decomposition Targets — Priority Analysis

**Date**: 2026-04-06 (original) | **Updated**: 2026-04-07
**Baseline Commit**: 7d483bd (main branch)
**Update context**: Post P0, P1, P2, partial P5/P6 execution.

> **Status Notes (2026-04-07):**
> - P0 (Firebase Auth) and P1 (Firestore offline-first migration) are COMPLETE.
> - P2 (Dead Code Purge) is COMPLETE — ~2,400+ lines purged, 7 files deleted.
> - P5 (intent-router decomposition) PARTIALLY EXECUTED — `lib/routing/` created with 4 files.
> - P6 (agent-router decomposition) PARTIALLY EXECUTED — `lib/agents/` created with 3 files.
> - `hipaa-compliant-storage.ts` is slated for **elimination** during Firestore server migration (per ADR-001), NOT decomposition.
> - The total `lib/` is now 68 files across 5 directories, ~23,368 lines.

---

## Overview

Post-purge and partial decomposition, **4 files** exceed 700 lines. The remaining decomposition targets focus on these files plus pending extractions from partially decomposed modules.

---

## Priority Ranking Summary (Updated)

| Priority | File | Lines (current) | Risk | Status |
|:--------:|------|----------------:|:----:|:------:|
| ~~P1~~ | ~~`hipaa-compliant-storage.ts`~~ | 657 | — | **REMOVED** — ADR-001: will be eliminated, not decomposed |
| P2 | `clinical-pattern-analyzer.ts` | 686 | LOW | PENDING |
| P3 | `entity-extraction-engine.ts` | 806 | LOW | PENDING |
| P4 | `dynamic-orchestrator.ts` | 388 | LOW | **SCOPE REDUCED** — was 1,091; dead code purged |
| P5 | `intelligent-intent-router.ts` | 200 | — | ✅ **EXECUTED** — decomposed into `lib/routing/` |
| P6 | `clinical-agent-router.ts` | 612 | MED | ✅ **PARTIALLY EXECUTED** — decomposed into `lib/agents/` |
| P7 | `hopeai-system.ts` | 1,684 | CRIT | PENDING |

---

## Detailed Analysis

### ~~P1: `hipaa-compliant-storage.ts`~~ — REMOVED FROM TARGETS

Per ADR-001 (`decision-log/001-storage-migration-before-decomposition.md`), this file is slated for elimination during the Firestore server-side migration, not decomposition. Current size: 657 lines.

---

### P2: `clinical-pattern-analyzer.ts` — 686 lines (LOW risk) — PENDING

**Exports:** 8 (1 enum, 3 interfaces, 1 type, 1 config interface, 1 class, 1 factory)
**Dependents:** 4 (`pattern-analysis-storage.ts`, 1 API route, 2 components)
**Dependencies:** `google-genai-config`

**Decomposition Plan → `lib/patterns/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `pattern-types.ts` | ~120 | All exported types/interfaces/enums |
| `domain-extractor.ts` | ~250 | Gemini function declarations, extraction, parsing |
| `insight-generator.ts` | ~150 | Reflective questions, alliance analysis, meta-insights |
| `clinical-pattern-analyzer.ts` | ~250 | Composition class, factory |

---

### P3: `entity-extraction-engine.ts` — 806 lines (LOW risk) — PENDING

**Exports:** 8 (4 interfaces, 1 type, 1 class, 1 factory, 1 singleton)
**Dependents:** 3 (`routing/intent-classifier`, `dynamic-orchestrator`, `entity-extraction-plugin-registry`)
**Dependencies:** `google-genai-config`

**Decomposition Plan → `lib/entities/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `entity-types.ts` | ~60 | All exported interfaces and types |
| `known-entity-dictionaries.ts` | ~250 | Static dictionaries, synonym maps |
| `entity-validator.ts` | ~100 | Validation against known entities |
| `entity-extraction-engine.ts` | ~420 | Core extraction, factory, singleton |

---

### P4: `dynamic-orchestrator.ts` — 370 lines (LOW risk) — SCOPE REDUCED + R1

**Previous size:** 1,091 lines → 388 (P2 dead code purge) → **370 lines** (R1: removed EntityExtractionEngine + GoogleGenAI dependencies, keyword-frequency dominant topics).
**Exports:** 3 (`DynamicOrchestrator` class, factory, type re-exports)
**Dependents:** 1 (`hopeai-system`) — was 4, but `hopeai-orchestration-bridge`, `orchestrator-monitoring`, `index.ts` all deleted.
**Dependencies:** reduced from 7 to 4 modules (removed `entity-extraction-engine`, `google-genai-config`, `@google/genai.GoogleGenAI`).

**Decomposition assessment:** At 370 lines with reduced responsibility and zero LLM calls, this file does not warrant further decomposition.

---

### P5: `intelligent-intent-router.ts` — ✅ EXECUTED + R1

**Previous size:** 1,786 lines → 200 lines (P4 decomposition) → **135 lines** (R1: eliminated LLM dependency, deterministic heuristic router).

**R1 changes:** Removed `EntityExtractionEngine`, `ContextWindowManager`, `classifyIntentAndExtractEntities()` call. Now uses `classifyIntentByHeuristic()` — zero LLM calls, deterministic routing.

**Decomposed into `lib/routing/` (4 files):**

| Actual File | Lines | Responsibility |
|-------------|------:|----------------|
| `routing/intent-classifier.ts` | ~580 | Heuristic + LLM classification (LLM deprecated), confidence scoring |
| `routing/intent-declarations.ts` | 171 | Function declaration constants |
| `routing/routing-types.ts` | 81 | Exported interfaces for routing |
| `routing/index.ts` | 35 | Barrel re-export |

**Diff from original plan:** `edge-case-detector.ts` and `agent-mapper.ts` were not created as separate files. Edge-case detection and agent mapping were absorbed into `intent-classifier.ts` or removed during P2.

---

### P6: `clinical-agent-router.ts` — ✅ PARTIALLY EXECUTED

**Previous size:** 3,248 lines → **Current size:** 612 lines.

**Decomposed into `lib/agents/` (3 files):**

| Actual File | Lines | Responsibility |
|-------------|------:|----------------|
| `agents/agent-definitions.ts` | 1,182 | Agent system prompt templates and config maps |
| `agents/streaming-handler.ts` | 798 | Streaming dispatch with tool/function-call handling |
| `agents/message-context-builder.ts` | 150 | File context injection and format conversion |

**Diff from original plan:** `agent-session-manager.ts`, `tool-execution-bridge.ts`, `context-compaction.ts`, and `file-context-builder.ts` were not created. Session management remains in `clinical-agent-router.ts`. `message-context-builder.ts` replaced the proposed `file-context-builder.ts`.

**Remaining extraction opportunities:**
- Session lifecycle management (~200 lines still in `clinical-agent-router.ts`)
- Tool execution orchestration (in `streaming-handler.ts`, could be separated if it grows)

---

### P7: `hopeai-system.ts` — 1,684 lines (CRITICAL risk) — PENDING

**Previous size:** 1,980 → **Current size:** 1,684 lines (reduced by P2 import cleanup).
**Exports:** 8 (2 classes, 4 functions, 1 re-export, 1 utility)
**Dependents:** Reduced from 10+ (bridge, singleton, index deleted) to ~6 (API routes, hooks)
**Dependencies:** Reduced from 8 to ~5 modules

**Decomposition Plan → `lib/system/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `sensitive-content-detector.ts` | ~150 | Regex-based content classification |
| `operational-metadata-collector.ts` | ~250 | Device/locale/context assembly |
| `document-manager.ts` | ~200 | Upload, removal, retrieval |
| `session-analytics.ts` | ~200 | User/session analytics, status |
| `conversation-manager.ts` | ~300 | History, title derivation, streaming capture |
| `hopeai-system.ts` | ~500 | Slim HopeAISystem composing the above |

**Why P7 (last):** Still a God Object. Decompose only after its dependencies have stabilized.

---

## Summary (Updated)

| Metric | Baseline (2026-04-06) | Current (2026-04-07) |
|--------|----------------------:|---------------------:|
| Total lines across targets | 11,490 | 4,176 (P2+P7+P3+P6 remaining) |
| Total lines in `lib/` | ~30,010 | ~23,368 |
| Files >700 lines | 7 | 4 |
| Decomposition targets remaining | 7 | 3 (P2, P3, P7) + re-evaluate P4 |
| Executed decompositions | 0 | 2 partial (P5, P6) |
| New subdirectories created | 0 of 6 | 2 of 6 (`agents/`, `routing/`) |
| Single highest-ROI remaining action | Extract agent prompts (done) | Decompose `hopeai-system.ts` (P7) |
