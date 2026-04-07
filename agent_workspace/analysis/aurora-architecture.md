# Aurora `lib/` Architecture Analysis Report

**Date**: 2026-04-06 (original) | **Updated**: 2026-04-07
**Baseline Commit**: 7d483bd (main branch)
**Update context**: Post P0 (Firebase Auth), P1 (Firestore migration), P2 (dead code purge), partial P5/P6 decomposition.

---

## 1. File Inventory

The `lib/` directory contains **68 TypeScript files** across 5 directories, totaling **~23,368 lines of code**.

### Directory Structure

```
lib/                          (54 files)
lib/agents/                   ( 3 files)
lib/routing/                  ( 4 files)
lib/security/                 ( 7 files)
lib/utils/                    ( 1 file)
```

### Complete File Listing (sorted by size, descending)

| File | Lines | Description |
|------|------:|-------------|
| `hopeai-system.ts` | 1,684 | Top-level HopeAI system orchestrator |
| `agents/agent-definitions.ts` | 1,182 | Agent system prompt templates and config maps |
| `entity-extraction-engine.ts` | 806 | NLP entity extraction for clinical conversations |
| `agents/streaming-handler.ts` | 798 | Streaming message dispatch with tool/function-call handling |
| `clinical-pattern-analyzer.ts` | 686 | Longitudinal therapeutic pattern analysis |
| `hipaa-compliant-storage.ts` | 657 | SQLite-based HIPAA-compliant encrypted storage |
| `enhanced-sentry-metrics-tracker.ts` | 645 | Market validation metrics extending Sentry |
| `clinical-agent-router.ts` | 612 | Core agent routing engine (slim facade post-decomposition) |
| `context-window-manager.ts` | 575 | Reactive context compaction and sliding window |
| `sentry-metrics-tracker.ts` | 501 | Core Sentry metrics: messages, sessions, agent switches |
| `routing/intent-classifier.ts` | 499 | Intent classification via Gemini API with retry |
| `tool-registry.ts` | 494 | Central registry of clinical tool declarations |
| `firestore-client-storage.ts` | 486 | Client-side Firestore CRUD (pure functions) |
| `session-metrics-comprehensive-tracker.ts` | 484 | Comprehensive per-session token/latency metrics |
| `vertex-link-converter.ts` | 469 | Converts Google Vertex internal links to public URLs |
| `pubmed-research-tool.ts` | 466 | PubMed E-utilities API integration |
| `firestore-storage-adapter.ts` | 450 | Firestore server-side persistent storage adapter |
| `logger.ts` | 440 | Centralized logging with IP protection in production |
| `parallel-ai-search.ts` | 421 | Parallel web search via Parallel AI SDK |
| `sse-client.ts` | 393 | Client-side SSE consumer for streaming responses |
| `chilean-clinical-vocabulary.ts` | 388 | Chilean Spanish clinical speech recognition vocabulary |
| `dynamic-orchestrator.ts` | 388 | Dynamic agent/tool selection orchestrator (post-purge) |
| `clinical-task-orchestrator.ts` | 385 | Clinical task extraction from files and chat history |
| `academic-multi-source-search.ts` | 384 | Multi-source academic search aggregator |
| `academic-source-validator.ts` | 348 | Multi-layer DOI/URL validation for academic sources |
| `pattern-analysis-storage.ts` | 337 | IndexedDB persistence for pattern analysis results |
| `enhanced-metrics-types.ts` | 332 | Type definitions for market validation metrics |
| `crossref-doi-resolver.ts` | 330 | Crossref REST API integration for DOI resolution |
| `markdown-parser-streamdown.ts` | 329 | Unified/remark/rehype markdown pipeline for streaming |
| `dynamic-status.ts` | 326 | Context-aware status text generation from live metadata |
| `rehype-aurora-classes.ts` | 323 | Custom rehype plugins for Aurora CSS classes |
| `markdown-parser.ts` | 298 | Legacy markdown-it based parser |
| `clinical-memory-system.ts` | 291 | Inter-session clinical memory extraction and retrieval |
| `security/audit-logger.ts` | 287 | Security event audit logging |
| `chilean-clinical-corrections.ts` | 284 | Post-processing corrections for Chilean clinical STT |
| `google-genai-config.ts` | 283 | Google GenAI client initialization and model config |
| `singleton-monitor.ts` | 274 | Diagnostic tool validating singleton pattern usage |
| `security/error-sanitizer.ts` | 271 | Error message sanitization for production |
| `patient-summary-builder.ts` | 256 | Builds patient context summaries |
| `env-validator.ts` | 255 | Environment variable validation |
| `encryption-utils.ts` | 243 | AES-256-GCM encryption/decryption utilities |
| `incremental-markdown-parser.ts` | 242 | Incremental delta-only markdown parser |
| `clinical-file-manager.ts` | 238 | Clinical file upload and URI management |
| `markdown-sanitize-schema.ts` | 234 | Rehype sanitization schemas for Aurora |
| `server-storage-memory.ts` | 221 | In-memory server storage fallback |
| `server-storage-adapter.ts` | 214 | Server storage abstraction (SQLite or memory) |
| `security/rate-limiter.ts` | 213 | In-memory rate limiting |
| `security/admin-auth.ts` | 200 | Admin endpoint authentication |
| `utils/tool-orchestrator.ts` | 200 | Concurrent tool execution with security partitioning |
| `intelligent-intent-router.ts` | 200 | Slim intent routing facade (post-decomposition) |
| `security/tool-permissions.ts` | 194 | Pre-execution tool permission engine |
| `context-optimization-manager.ts` | 192 | Context window optimization strategies |
| `response-watermark.ts` | 181 | Invisible watermarking for IP protection |
| `tool-input-schemas.ts` | 178 | Zod schemas for tool input validation |
| `routing/intent-declarations.ts` | 171 | Function declaration constants for intent classification |
| `security/console-blocker.ts` | 154 | Production console log suppression |
| `agents/message-context-builder.ts` | 150 | File context injection and format conversion |
| `academic-reference-validator.ts` | 148 | Zod validation for academic references |
| `ui-preferences-storage.ts` | 140 | IndexedDB storage for UI preferences |
| `firebase-admin-config.ts` | 125 | Firebase Admin SDK server singleton |
| `firebase-config.ts` | 106 | Firebase Client SDK initialization |
| `server-prewarm.ts` | 86 | Server cold-start pre-warming |
| `routing/routing-types.ts` | 81 | Exported interfaces/types for intent routing |
| `authenticated-fetch.ts` | 39 | Authenticated fetch wrapper for Firebase |
| `routing/index.ts` | 34 | Barrel re-export for routing module |
| `security/firebase-auth-verify.ts` | 33 | Server-side Firebase auth token verification |
| `entity-extraction-plugin-registry.ts` | 29 | Plugin registry for entity extraction |
| `utils.ts` | 5 | Tailwind `cn()` utility |

### Files Deleted Since Baseline (2026-04-06)

| File | Lines (at deletion) | Reason |
|------|--------------------:|--------|
| `hopeai-orchestration-bridge.ts` | 500 | P2: Dead code — migration 100%, always returned `'dynamic'` |
| `index.ts` | 549 | P2: Barrel file removed, direct imports adopted |
| `orchestrator-monitoring.ts` | 722 | P2: Coupled to deleted bridge and dead features |
| `orchestration-singleton.ts` | 169 | P2: Singleton indirection eliminated |
| `user-preferences-manager.ts` | 315 | P2: Only fed disabled recommendations engine |
| `search-query-middleware.ts` | 0 | P2: Empty file, never imported |
| `academic-search-enhancer.ts` | 0 | P2: Empty file, never imported |
| `client-context-persistence.ts` | 516 | P1: Replaced by Firestore client storage |
| `clinical-context-storage.ts` | 354 | P1: Replaced by Firestore client storage |
| `patient-persistence.ts` | 325 | P1: Replaced by Firestore client storage |

**Total deleted**: ~3,450 lines across 10 files.

---

## 2. Module Categorization

### A. AI/LLM Orchestration (24% — 5,547 lines)
- `hopeai-system.ts` (1,684) — Top-level system facade
- `agents/agent-definitions.ts` (1,182) — Agent system prompt templates
- `agents/streaming-handler.ts` (798) — Streaming dispatch with tool/function-call handling
- `clinical-agent-router.ts` (612) — Core agent routing (slim facade)
- `dynamic-orchestrator.ts` (388) — Dynamic agent/tool selection
- `intelligent-intent-router.ts` (200) — Slim intent routing facade
- `routing/intent-classifier.ts` (499) — Intent classification via Gemini
- `routing/intent-declarations.ts` (171) — Function declaration constants
- `routing/routing-types.ts` (81) — Exported interfaces for routing
- `routing/index.ts` (34) — Barrel re-export
- `agents/message-context-builder.ts` (150) — File context injection
- `server-prewarm.ts` (86) — Cold start elimination

### B. NLP & Entity Processing (6% — 1,602 lines)
- `entity-extraction-engine.ts` (806)
- `context-window-manager.ts` (575)
- `context-optimization-manager.ts` (192)
- `entity-extraction-plugin-registry.ts` (29)

### C. Academic Research Pipeline (10% — 2,316 lines)
- `vertex-link-converter.ts` (469)
- `pubmed-research-tool.ts` (466)
- `parallel-ai-search.ts` (421)
- `academic-multi-source-search.ts` (384)
- `academic-source-validator.ts` (348)
- `crossref-doi-resolver.ts` (330)
- `academic-reference-validator.ts` (148)

### D. Clinical Domain Knowledge (9% — 2,237 lines)
- `clinical-pattern-analyzer.ts` (686)
- `chilean-clinical-vocabulary.ts` (388)
- `clinical-memory-system.ts` (291)
- `chilean-clinical-corrections.ts` (284)
- `patient-summary-builder.ts` (256)
- `clinical-file-manager.ts` (238)
- `clinical-task-orchestrator.ts` (385) — overlaps with orchestration

### E. Storage & Persistence (12% — 2,839 lines)
- `hipaa-compliant-storage.ts` (657)
- `firestore-client-storage.ts` (486)
- `firestore-storage-adapter.ts` (450)
- `pattern-analysis-storage.ts` (337)
- `encryption-utils.ts` (243)
- `server-storage-memory.ts` (221)
- `server-storage-adapter.ts` (214)
- `ui-preferences-storage.ts` (140)
- `authenticated-fetch.ts` (39)

### F. Metrics & Monitoring (10% — 2,236 lines)
- `enhanced-sentry-metrics-tracker.ts` (645)
- `sentry-metrics-tracker.ts` (501)
- `session-metrics-comprehensive-tracker.ts` (484)
- `enhanced-metrics-types.ts` (332)
- `singleton-monitor.ts` (274)

### G. Security (6% — 1,352 lines)
- `security/audit-logger.ts` (287)
- `security/error-sanitizer.ts` (271)
- `security/rate-limiter.ts` (213)
- `security/admin-auth.ts` (200)
- `security/tool-permissions.ts` (194)
- `security/console-blocker.ts` (154)
- `security/firebase-auth-verify.ts` (33)
- `response-watermark.ts` (181) — overlaps with IP protection

### H. Tool System (4% — 872 lines)
- `tool-registry.ts` (494)
- `utils/tool-orchestrator.ts` (200)
- `tool-input-schemas.ts` (178)

### I. UI & Rendering (8% — 1,819 lines)
- `sse-client.ts` (393)
- `markdown-parser-streamdown.ts` (329)
- `dynamic-status.ts` (326)
- `rehype-aurora-classes.ts` (323)
- `markdown-parser.ts` (298)
- `incremental-markdown-parser.ts` (242)
- `markdown-sanitize-schema.ts` (234)

### J. Configuration & Utilities (5% — 1,214 lines)
- `logger.ts` (440)
- `google-genai-config.ts` (283)
- `env-validator.ts` (255)
- `firebase-admin-config.ts` (125)
- `firebase-config.ts` (106)
- `utils.ts` (5)

---

## 3. Dependency Map (Top Files)

### Fan-out (outgoing dependencies)

```
clinical-agent-router [6 deps]
  -> google-genai-config, agents/agent-definitions, agents/streaming-handler,
     agents/message-context-builder, context-window-manager, tool-registry

hopeai-system [5 deps]
  -> clinical-agent-router, intelligent-intent-router, dynamic-orchestrator,
     session-metrics-comprehensive-tracker, sentry-metrics-tracker

dynamic-orchestrator [4 deps]
  -> intelligent-intent-router, clinical-agent-router, tool-registry,
     google-genai-config

intelligent-intent-router [3 deps]
  -> routing/intent-classifier, routing/intent-declarations, routing/routing-types
```

### Fan-in (most depended upon)

| Module | Depended on by | Risk |
|--------|---------------:|------|
| `google-genai-config.ts` | 6 | HIGH — SPOF for AI calls |
| `clinical-agent-router.ts` | 4 | HIGH — change cascades |
| `tool-registry.ts` | 5 | HIGH |
| `academic-source-validator.ts` | 5 | MEDIUM |
| `context-window-manager.ts` | 3 | MEDIUM |
| `dynamic-orchestrator.ts` | 1 | LOW (post-purge) |
| `hopeai-system.ts` | 3 | HIGH |
| `entity-extraction-engine.ts` | 3 | MEDIUM |
| `sentry-metrics-tracker.ts` | 3 | LOW |

---

## 4. Coupling Analysis

### Circular Dependencies

**Cycle 1 (resolved):** The `orchestration-singleton -> index -> hopeai-system -> orchestration-singleton` cycle was eliminated by deleting `orchestration-singleton.ts` and `index.ts` during P2.

**Cycle 2 (resolved):** The `hopeai-orchestration-bridge` cross-references were eliminated by deleting the bridge during P2.

### Remaining Tight Coupling

**Orchestration Core** (3 files post-purge):
`clinical-agent-router` ↔ `hopeai-system` ↔ `dynamic-orchestrator`

These three files form the remaining strongly connected orchestration component.

---

## 5. Oversized File Analysis (>600 lines — SRP Risks)

| File | Lines | Responsibilities | SRP Status |
|------|------:|:----------------|:-----------|
| `hopeai-system.ts` | 1,684 | 7+ (facade, sensitive content, metadata, history, docs, analytics) | SEVERE — P7 decomposition pending |
| `agents/agent-definitions.ts` | 1,182 | Agent prompt templates across all agent types | MODERATE — extracted from clinical-agent-router.ts |
| `entity-extraction-engine.ts` | 806 | 5+ (dictionaries, synonyms, extraction, dedup, validation) | MODERATE — P3 decomposition pending |
| `agents/streaming-handler.ts` | 798 | Streaming dispatch + function-call resolution | MODERATE — extracted from clinical-agent-router.ts |
| `clinical-pattern-analyzer.ts` | 686 | 6 (extraction, categorization, unexplored, reflection, alliance, meta) | MODERATE — P2 decomposition pending |
| `hipaa-compliant-storage.ts` | 657 | 6 (schema, CRUD, cache, files, ficha, audit) | LOW — slated for elimination during Firestore migration |

---

## 6. Entry Points

### API Route Consumers
- `hopeai-system.ts` — Primary entry for most API routes (direct import post-P2)
- `google-genai-config.ts` — Direct GenAI access from API routes
- `security/admin-auth.ts` — Admin middleware
- `security/firebase-auth-verify.ts` — Firebase auth token verification
- `sentry-metrics-tracker.ts` — Metrics from API routes

### Component/Hook Consumers
- `utils.ts` — ~64 imports (universal `cn()`)
- `firestore-client-storage.ts` — Client-side Firestore CRUD
- `hopeai-system.ts` — Via `use-hopeai-system.ts` hook

---

## 7. Key Architectural Observations

### 7.1 Orchestration Stack Reduced to 3 Functional Layers (Post-P2)
```
API Route -> hopeai-system -> dynamic-orchestrator -> clinical-agent-router (GenAI call)
```
The bridge, singleton indirection, and barrel file layers were eliminated during P2.

### 7.2 Partial Decomposition Executed (P5/P6)
- `intelligent-intent-router.ts` decomposed into `lib/routing/` (4 files: index.ts, intent-classifier.ts, intent-declarations.ts, routing-types.ts). Original file reduced from 1,786 to 200 lines.
- `clinical-agent-router.ts` decomposed into `lib/agents/` (3 files: agent-definitions.ts, streaming-handler.ts, message-context-builder.ts). Original file reduced from 3,248 to 612 lines.

### 7.3 Metrics Fragmented Across 4 Modules
No unified metrics interface. Four separate trackers with overlapping scopes (orchestrator-monitoring.ts was deleted in P2).

### 7.4 Markdown Parsing: 3 Competing Implementations
Legacy (`markdown-it`), modern (`unified/remark/rehype`), incremental. Migration incomplete.

### 7.5 Storage: Transitional State
- Client: Firestore (`firestore-client-storage.ts`) replaced 3 IndexedDB adapters during P1.
- Server: SQLite (`hipaa-compliant-storage.ts`) + Firestore (`firestore-storage-adapter.ts`) + memory fallback. Messages subcollection mismatch between client/server pending resolution.
- `clinical-memory-system.ts` added for inter-session memory (implements Task D from parallel briefing).

---

*Original report generated from static analysis at commit 7d483bd. Updated 2026-04-07 to reflect P0/P1/P2 completions and partial P5/P6 decompositions.*
