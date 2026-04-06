# Lib Decomposition Targets — Priority Analysis

**Date**: 2026-04-06
**Commit**: 7d483bd (main branch)

---

## Overview

7 files exceed 700 lines and represent 40.6% of all `lib/` code (11,490 of 28,333 lines). This report analyzes each for decomposition potential and ranks them by implementation priority.

---

## Priority Ranking Summary

| Priority | File | Lines | Risk | Quick Win |
|:--------:|------|------:|:----:|:---------:|
| P1 | `hipaa-compliant-storage.ts` | 778 | LOW | Schema + cache extraction |
| P2 | `clinical-pattern-analyzer.ts` | 773 | LOW | Types + domain extractor |
| P3 | `entity-extraction-engine.ts` | 834 | LOW | Static dictionaries |
| P4 | `dynamic-orchestrator.ts` | 1,091 | MED | Reasoning bullet generator |
| P5 | `intelligent-intent-router.ts` | 1,786 | MED | Function declarations |
| P6 | `clinical-agent-router.ts` | 3,248 | HIGH | Agent prompt templates (~1,400 lines) |
| P7 | `hopeai-system.ts` | 1,980 | CRIT | Decompose last (God Object) |

---

## Detailed Analysis

### P1: `hipaa-compliant-storage.ts` — 778 lines (LOW risk)

**Exports:** 1 (`HIPAACompliantStorage` class)
**Dependents:** 1 (`server-storage-adapter.ts` via dynamic import)
**Dependencies:** `encryption-utils`

**Responsibilities:**
1. SQLite schema creation and migration
2. Session CRUD with AES-256-GCM encryption at rest
3. Hot cache (RAM) with TTL-based eviction
4. Clinical file storage and retrieval
5. Ficha clinica (clinical record) persistence
6. HIPAA audit logging for all data access

**Decomposition Plan → `lib/storage/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `hipaa-schema.ts` | ~100 | Schema DDL, migrations |
| `hipaa-cache.ts` | ~100 | Hot cache, TTL eviction, cleanup |
| `hipaa-audit.ts` | ~80 | Audit logging, log retrieval |
| `clinical-file-storage.ts` | ~120 | File CRUD operations |
| `ficha-clinica-storage.ts` | ~100 | Ficha clinica CRUD |
| `hipaa-compliant-storage.ts` | ~280 | Session CRUD, composition facade |

**Why P1:** Only 1 dependent (dynamic import). Self-contained. Zero circular dependency risk. Establishes the `lib/storage/` pattern as proof-of-concept.

---

### P2: `clinical-pattern-analyzer.ts` — 773 lines (LOW risk)

**Exports:** 8 (1 enum, 3 interfaces, 1 type, 1 config interface, 1 class, 1 factory)
**Dependents:** 4 (`pattern-analysis-storage.ts`, 1 API route, 2 components)
**Dependencies:** `google-genai-config`

**Responsibilities:**
1. Domain extraction via Gemini function-calling
2. Domain categorization and frequency analysis
3. Unexplored domain identification
4. Reflective question generation
5. Therapeutic alliance analysis
6. Meta-insight generation

**Decomposition Plan → `lib/patterns/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `pattern-types.ts` | ~120 | All exported types/interfaces/enums |
| `domain-extractor.ts` | ~250 | Gemini function declarations, extraction, parsing |
| `insight-generator.ts` | ~150 | Reflective questions, alliance analysis, meta-insights |
| `clinical-pattern-analyzer.ts` | ~250 | Composition class, factory |

**Why P2:** Clean domain boundary. Types importable independently. No circular deps.

---

### P3: `entity-extraction-engine.ts` — 834 lines (LOW risk)

**Exports:** 8 (4 interfaces, 1 type, 1 class, 1 factory, 1 singleton)
**Dependents:** 3 (all internal: `intelligent-intent-router`, `dynamic-orchestrator`, `entity-extraction-plugin-registry`)
**Dependencies:** `google-genai-config`

**Responsibilities:**
1. Known entity dictionary initialization (~250 lines of static data)
2. Synonym map management
3. Gemini function-calling-based extraction
4. Entity deduplication and confidence scoring
5. Entity validation against dictionaries

**Decomposition Plan → `lib/entities/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `entity-types.ts` | ~60 | All exported interfaces and types |
| `known-entity-dictionaries.ts` | ~250 | Static dictionaries, synonym maps |
| `entity-validator.ts` | ~100 | Validation against known entities |
| `entity-extraction-engine.ts` | ~420 | Core extraction, factory, singleton |

**Why P3:** Static dictionaries are trivial to extract (30% of file). Zero behavioral risk.

---

### P4: `dynamic-orchestrator.ts` — 1,091 lines (MEDIUM risk)

**Exports:** 3 (`DynamicOrchestrator` class, factory, type re-exports)
**Dependents:** 4 (`hopeai-system`, `hopeai-orchestration-bridge`, `orchestrator-monitoring`, `index.ts`)
**Dependencies:** 7 modules

**Responsibilities:**
1. Session management with conversation history
2. Reasoning bullet generation (streaming async generator, ~350 lines)
3. Tool selection optimization
4. Recommendation generation and caching
5. Interaction learning and session analytics
6. Expired session cleanup

**Decomposition Plan → `lib/orchestration/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `reasoning-bullet-generator.ts` | ~350 | Prompt construction, streaming generator |
| `recommendation-engine.ts` | ~200 | Recommendation generation, caching |
| `session-context-manager.ts` | ~200 | Session CRUD, history, topic tracking, cleanup |
| `dynamic-orchestrator.ts` | ~340 | Slim coordination facade |

**Why P4:** Reasoning bullet generator is self-contained and the largest single concern.

---

### P5: `intelligent-intent-router.ts` — 1,786 lines (MEDIUM risk)

**Exports:** 7 (5 interfaces, 1 class, 1 factory)
**Dependents:** 3 (`dynamic-orchestrator`, `hopeai-system`, `index.ts`)
**Dependencies:** 5 modules

**Responsibilities:**
1. Intent classification via Gemini function-calling (inlined declarations ~200 lines)
2. Combined intent + entity extraction optimization
3. Edge case detection (risk signals, stress markers)
4. Agent routing with confidence thresholds
5. Context optimization for prompts
6. Retry with exponential backoff

**Decomposition Plan → `lib/routing/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `intent-function-declarations.ts` | ~200 | Function declaration constants |
| `intent-classifier.ts` | ~300 | Gemini API call, retry, parsing |
| `edge-case-detector.ts` | ~200 | Risk/stress/sensitive detection |
| `agent-mapper.ts` | ~150 | Function-to-agent mapping, transitions |
| `routing-types.ts` | ~80 | All exported interfaces |
| `intelligent-intent-router.ts` | ~800 | Composition, factory |

**Why P5:** Function declarations and edge-case detection are clean extractions. The combined optimization path ties to EntityExtractionEngine.

---

### P6: `clinical-agent-router.ts` — 3,248 lines (HIGH risk)

**Exports:** 2 (`ClinicalAgentRouter` class, `clinicalAgentRouter` singleton)
**Dependents:** 6 files (the highest in the codebase)
**Dependencies:** 10 modules (the highest fan-out)

**Responsibilities:**
1. Agent system prompt construction (~1,400 lines of inlined templates)
2. Gemini chat session lifecycle management
3. Streaming message dispatch with tool/function-call handling
4. Multi-round recursive function call resolution
5. Academic search tool orchestration
6. File context injection and format conversion
7. Reactive context compaction
8. Session cleanup with TTL-based GC
9. Metrics streaming wrapper

**Decomposition Plan → `lib/agents/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `agent-definitions.ts` | ~800 | System prompt constants, agent config maps |
| `agent-session-manager.ts` | ~400 | Chat session lifecycle, cleanup |
| `streaming-handler.ts` | ~600 | Streaming dispatch, function-call resolution |
| `tool-execution-bridge.ts` | ~500 | Tool call prep, academic search orchestration |
| `file-context-builder.ts` | ~300 | File injection, format conversion |
| `context-compaction.ts` | ~200 | Reactive compaction, token estimation |
| `clinical-agent-router.ts` | ~400 | Thin facade preserving class + singleton API |

**Why P6:** Highest impact (removes 43% of largest file just by extracting prompts), but 6 dependents make interface changes risky. Must preserve public API exactly.

**Quick win:** Extract the ~1,400 lines of agent prompt templates first. Zero behavioral risk, massive size reduction.

---

### P7: `hopeai-system.ts` — 1,980 lines (CRITICAL risk)

**Exports:** 8 (2 classes, 4 functions, 1 re-export, 1 utility)
**Dependents:** 10+ files (API routes, hooks, bridge, singleton, index)
**Dependencies:** 8 modules

**Responsibilities:**
1. Top-level orchestration facade
2. Sensitive content detection
3. Operational metadata collection
4. Conversation history management
5. Document upload/removal lifecycle
6. System status and analytics
7. Async pattern analysis triggering
8. Singleton management with initialization promises

**Decomposition Plan → `lib/system/`:**

| New Module | Lines | Responsibility |
|------------|------:|----------------|
| `sensitive-content-detector.ts` | ~150 | Regex-based content classification |
| `operational-metadata-collector.ts` | ~250 | Device/locale/context assembly |
| `document-manager.ts` | ~200 | Upload, removal, retrieval |
| `session-analytics.ts` | ~200 | User/session analytics, status |
| `conversation-manager.ts` | ~300 | History, title derivation, streaming capture |
| `singleton.ts` | ~150 | HopeAISystemSingleton, init promise |
| `hopeai-system.ts` | ~700 | Slim HopeAISystem composing the above |

**Why P7 (last):** God Object. 10+ dependents. 8 exports that must remain stable. Decompose only after its dependencies (P4, P5, P6) have been simplified first.

---

## Summary

| Metric | Value |
|--------|-------|
| Total lines across 7 targets | 11,490 |
| Total lines in `lib/` | ~30,010 |
| Concentration ratio | 38.3% of all lib code in 7 files |
| Proposed new modules | 37 |
| New subdirectories | 6 (`agents/`, `system/`, `routing/`, `orchestration/`, `entities/`, `patterns/`, `storage/`) |
| Est. post-decomposition max file | ~800 lines |
| Single highest-ROI action | Extract ~1,400 lines of agent prompts from `clinical-agent-router.ts` |
