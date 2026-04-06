# Aurora `lib/` Architecture Analysis Report

**Date**: 2026-04-06
**Commit**: 7d483bd (main branch)

---

## 1. File Inventory

The `lib/` directory contains **65 TypeScript files** across 3 directories, totaling **~30,010 lines of code**.

### Directory Structure

```
lib/                          (62 files)
lib/security/                 ( 6 files)
lib/utils/                    ( 1 file)
```

### Complete File Listing (sorted by size, descending)

| File | Lines | Description |
|------|------:|-------------|
| `clinical-agent-router.ts` | 3,248 | Core agent routing engine for all clinical agent types |
| `hopeai-system.ts` | 1,980 | Top-level HopeAI system orchestrator and singleton |
| `intelligent-intent-router.ts` | 1,786 | Semantic intent classification using GenAI function calling |
| `dynamic-orchestrator.ts` | 1,091 | Dynamic agent/tool selection orchestrator |
| `entity-extraction-engine.ts` | 834 | NLP entity extraction for clinical conversations |
| `hipaa-compliant-storage.ts` | 778 | SQLite-based HIPAA-compliant encrypted storage |
| `clinical-pattern-analyzer.ts` | 773 | Longitudinal therapeutic pattern analysis |
| `enhanced-sentry-metrics-tracker.ts` | 727 | Market validation metrics extending Sentry |
| `orchestrator-monitoring.ts` | 722 | Real-time monitoring and alerting for the orchestrator |
| `context-window-manager.ts` | 619 | Reactive context compaction and sliding window |
| `vertex-link-converter.ts` | 550 | Converts Google Vertex internal links to public URLs |
| `index.ts` | 549 | Barrel file and HopeAIOrchestrationSystem facade |
| `sentry-metrics-tracker.ts` | 547 | Core Sentry metrics: messages, sessions, agent switches |
| `tool-registry.ts` | 534 | Central registry of clinical tool declarations |
| `pubmed-research-tool.ts` | 525 | PubMed E-utilities API integration |
| `client-context-persistence.ts` | 516 | Client-side context persistence (IndexedDB) |
| `session-metrics-comprehensive-tracker.ts` | 509 | Comprehensive per-session token/latency metrics |
| `hopeai-orchestration-bridge.ts` | 500 | Bridge between dynamic orchestrator and legacy system |
| `parallel-ai-search.ts` | 469 | Parallel web search via Parallel AI SDK |
| `sse-client.ts` | 463 | Client-side SSE consumer for streaming responses |
| `clinical-task-orchestrator.ts` | 463 | Clinical task extraction from files and chat history |
| `logger.ts` | 454 | Centralized logging with IP protection in production |
| `academic-multi-source-search.ts` | 450 | Multi-source academic search aggregator |
| `firestore-storage-adapter.ts` | 416 | Firestore server-side persistent storage adapter |
| `chilean-clinical-vocabulary.ts` | 401 | Chilean Spanish clinical speech recognition vocabulary |
| `academic-source-validator.ts` | 394 | Multi-layer DOI/URL validation for academic sources |
| `pattern-analysis-storage.ts` | 393 | IndexedDB persistence for pattern analysis results |
| `crossref-doi-resolver.ts` | 374 | Crossref REST API integration for DOI resolution |
| `markdown-parser-streamdown.ts` | 371 | Unified/remark/rehype markdown pipeline for streaming |
| `dynamic-status.ts` | 366 | Context-aware status text generation from live metadata |
| `rehype-aurora-classes.ts` | 355 | Custom rehype plugins for Aurora CSS classes |
| `clinical-context-storage.ts` | 354 | Client-side IndexedDB storage for clinical state |
| `enhanced-metrics-types.ts` | 353 | Type definitions for market validation metrics |
| `markdown-parser.ts` | 345 | Legacy markdown-it based parser |
| `security/audit-logger.ts` | 325 | Security event audit logging |
| `patient-persistence.ts` | 325 | Client-side patient record persistence (IndexedDB) |
| `user-preferences-manager.ts` | 315 | Cross-session user preference learning |
| `google-genai-config.ts` | 313 | Google GenAI client initialization and model config |
| `singleton-monitor.ts` | 303 | Diagnostic tool validating singleton pattern usage |
| `chilean-clinical-corrections.ts` | 291 | Post-processing corrections for Chilean clinical STT |
| `env-validator.ts` | 287 | Environment variable validation |
| `security/error-sanitizer.ts` | 282 | Error message sanitization for production |
| `incremental-markdown-parser.ts` | 278 | Incremental delta-only markdown parser |
| `patient-summary-builder.ts` | 275 | Builds patient context summaries |
| `clinical-file-manager.ts` | 263 | Clinical file upload and URI management |
| `encryption-utils.ts` | 251 | AES-256-GCM encryption/decryption utilities |
| `server-storage-memory.ts` | 247 | In-memory server storage fallback |
| `server-storage-adapter.ts` | 238 | Server storage abstraction (SQLite or memory) |
| `security/rate-limiter.ts` | 238 | In-memory rate limiting |
| `markdown-sanitize-schema.ts` | 237 | Rehype sanitization schemas for Aurora |
| `context-optimization-manager.ts` | 235 | Context window optimization strategies |
| `utils/tool-orchestrator.ts` | 226 | Concurrent tool execution with security partitioning |
| `security/admin-auth.ts` | 224 | Admin endpoint authentication |
| `security/tool-permissions.ts` | 216 | Pre-execution tool permission engine |
| `tool-input-schemas.ts` | 206 | Zod schemas for tool input validation |
| `response-watermark.ts` | 198 | Invisible watermarking for IP protection |
| `orchestration-singleton.ts` | 169 | Global singleton for orchestration system |
| `security/console-blocker.ts` | 166 | Production console log suppression |
| `ui-preferences-storage.ts` | 161 | IndexedDB storage for UI preferences |
| `academic-reference-validator.ts` | 155 | Zod validation for academic references |
| `firebase-admin-config.ts` | 124 | Firebase Admin SDK server singleton |
| `firebase-config.ts` | 115 | Firebase Client SDK initialization |
| `server-prewarm.ts` | 95 | Server cold-start pre-warming |
| `entity-extraction-plugin-registry.ts` | 37 | Plugin registry for entity extraction |
| `utils.ts` | 6 | Tailwind `cn()` utility |
| `search-query-middleware.ts` | 0 | Empty file (unused) |
| `academic-search-enhancer.ts` | 0 | Empty file (unused) |

---

## 2. Module Categorization

### A. AI/LLM Orchestration (33% — 9,881 lines)
- `clinical-agent-router.ts` (3,248) — Routes messages to specialized clinical agents
- `hopeai-system.ts` (1,980) — Top-level system facade
- `intelligent-intent-router.ts` (1,786) — Intent classification via GenAI
- `dynamic-orchestrator.ts` (1,091) — Dynamic agent/tool selection
- `hopeai-orchestration-bridge.ts` (500) — Bridge between orchestrators
- `clinical-task-orchestrator.ts` (463) — Clinical task extraction
- `index.ts` (549) — Barrel file and facade class
- `orchestration-singleton.ts` (169) — Singleton access
- `server-prewarm.ts` (95) — Cold start elimination

### B. NLP & Entity Processing (6% — 1,725 lines)
- `entity-extraction-engine.ts` (834)
- `context-window-manager.ts` (619)
- `context-optimization-manager.ts` (235)
- `entity-extraction-plugin-registry.ts` (37)

### C. Academic Research Pipeline (10% — 2,917 lines)
- `vertex-link-converter.ts` (550)
- `pubmed-research-tool.ts` (525)
- `parallel-ai-search.ts` (469)
- `academic-multi-source-search.ts` (450)
- `academic-source-validator.ts` (394)
- `crossref-doi-resolver.ts` (374)
- `academic-reference-validator.ts` (155)
- `search-query-middleware.ts` (0) — Dead code
- `academic-search-enhancer.ts` (0) — Dead code

### D. Clinical Domain Knowledge (8% — 2,328 lines)
- `clinical-pattern-analyzer.ts` (773)
- `chilean-clinical-vocabulary.ts` (401)
- `patient-persistence.ts` (325)
- `chilean-clinical-corrections.ts` (291)
- `patient-summary-builder.ts` (275)
- `clinical-file-manager.ts` (263)

### E. Storage & Persistence (11% — 3,354 lines)
- `hipaa-compliant-storage.ts` (778)
- `client-context-persistence.ts` (516)
- `firestore-storage-adapter.ts` (416)
- `pattern-analysis-storage.ts` (393)
- `clinical-context-storage.ts` (354)
- `encryption-utils.ts` (251)
- `server-storage-memory.ts` (247)
- `server-storage-adapter.ts` (238)
- `ui-preferences-storage.ts` (161)

### F. Metrics & Monitoring (11% — 3,161 lines)
- `enhanced-sentry-metrics-tracker.ts` (727)
- `orchestrator-monitoring.ts` (722)
- `sentry-metrics-tracker.ts` (547)
- `session-metrics-comprehensive-tracker.ts` (509)
- `enhanced-metrics-types.ts` (353)
- `singleton-monitor.ts` (303)

### G. Security (5% — 1,649 lines)
- `security/audit-logger.ts` (325)
- `security/error-sanitizer.ts` (282)
- `security/rate-limiter.ts` (238)
- `security/admin-auth.ts` (224)
- `security/tool-permissions.ts` (216)
- `security/console-blocker.ts` (166)
- `response-watermark.ts` (198)

### H. Tool System (3% — 966 lines)
- `tool-registry.ts` (534)
- `utils/tool-orchestrator.ts` (226)
- `tool-input-schemas.ts` (206)

### I. UI & Rendering (8% — 2,415 lines)
- `sse-client.ts` (463)
- `markdown-parser-streamdown.ts` (371)
- `dynamic-status.ts` (366)
- `rehype-aurora-classes.ts` (355)
- `markdown-parser.ts` (345)
- `incremental-markdown-parser.ts` (278)
- `markdown-sanitize-schema.ts` (237)

### J. Configuration & Utilities (5% — 1,614 lines)
- `logger.ts` (454)
- `user-preferences-manager.ts` (315)
- `google-genai-config.ts` (313)
- `env-validator.ts` (287)
- `firebase-admin-config.ts` (124)
- `firebase-config.ts` (115)
- `utils.ts` (6)

---

## 3. Dependency Map (Top 5 Files)

### Fan-out (outgoing dependencies)

```
clinical-agent-router [10 deps]
  -> google-genai-config, clinical-file-manager, session-metrics-comprehensive-tracker,
     academic-source-validator, crossref-doi-resolver, vertex-link-converter,
     security/tool-permissions, tool-registry, context-window-manager,
     utils/tool-orchestrator

hopeai-system [8 deps]
  -> clinical-agent-router, intelligent-intent-router, dynamic-orchestrator,
     session-metrics-comprehensive-tracker, sentry-metrics-tracker,
     patient-persistence, patient-summary-builder, orchestration-singleton

dynamic-orchestrator [7 deps]
  -> intelligent-intent-router, clinical-agent-router, tool-registry,
     entity-extraction-engine, sentry-metrics-tracker, user-preferences-manager,
     google-genai-config

index.ts [7 deps]
  -> hopeai-system, clinical-agent-router, hopeai-orchestration-bridge,
     intelligent-intent-router, dynamic-orchestrator, orchestrator-monitoring,
     tool-registry

intelligent-intent-router [5 deps]
  -> google-genai-config, clinical-agent-router, entity-extraction-engine,
     tool-registry, context-window-manager
```

### Fan-in (most depended upon)

| Module | Depended on by | Risk |
|--------|---------------:|------|
| `google-genai-config.ts` | 6 | HIGH — SPOF for AI calls |
| `clinical-agent-router.ts` | 5 | HIGH — change cascades |
| `tool-registry.ts` | 5 | HIGH |
| `academic-source-validator.ts` | 5 | MEDIUM |
| `context-window-manager.ts` | 3 | MEDIUM |
| `dynamic-orchestrator.ts` | 3 | HIGH |
| `hopeai-system.ts` | 3 | HIGH |
| `entity-extraction-engine.ts` | 3 | MEDIUM |
| `sentry-metrics-tracker.ts` | 3 | LOW |

---

## 4. Coupling Analysis

### Circular Dependencies

**Cycle 1 (critical):**
```
orchestration-singleton -> index -> hopeai-system -> orchestration-singleton
```

**Cycle 2 (structural):**
```
hopeai-orchestration-bridge -> hopeai-system + dynamic-orchestrator + clinical-agent-router
                              (all of which cross-reference each other through the orchestration chain)
```

### Tightly Coupled Clusters

**Orchestration Core** (5 files, 8,605 lines):
`clinical-agent-router` ↔ `hopeai-system` ↔ `intelligent-intent-router` ↔ `dynamic-orchestrator` ↔ `hopeai-orchestration-bridge`

These five files form a strongly connected component where changes to any one frequently require awareness of the others.

---

## 5. Oversized File Analysis (>1,000 lines — SRP Violations)

| File | Lines | Responsibilities | SRP Violations |
|------|------:|:----------------|:---------------|
| `clinical-agent-router.ts` | 3,248 | 8+ (prompts, sessions, streaming, tools, academics, files, context, metrics) | SEVERE |
| `hopeai-system.ts` | 1,980 | 7+ (facade, sensitive content, metadata, history, docs, analytics, singleton) | SEVERE |
| `intelligent-intent-router.ts` | 1,786 | 5+ (classification, entity extraction, edge cases, routing, retries) | HIGH |
| `dynamic-orchestrator.ts` | 1,091 | 6+ (sessions, reasoning, tools, recommendations, learning, cleanup) | MODERATE |

---

## 6. Entry Points

### API Route Consumers
- `orchestration-singleton.ts` — Primary entry for most API routes
- `google-genai-config.ts` — Direct GenAI access from API routes
- `security/admin-auth.ts` — Admin middleware
- `sentry-metrics-tracker.ts` — Metrics from API routes

### Component/Hook Consumers
- `utils.ts` — 64 imports (universal `cn()`)
- `clinical-context-storage.ts` — 8 imports
- `hopeai-system.ts` — Via `use-hopeai-system.ts` hook

### Dead Code
- `search-query-middleware.ts` (0 lines, never imported)
- `academic-search-enhancer.ts` (0 lines, never imported)

---

## 7. Key Architectural Observations

### 7.1 Orchestration Stack is 5 Layers Deep
```
API Route -> orchestration-singleton -> hopeai-system -> intelligent-intent-router
  -> dynamic-orchestrator -> clinical-agent-router (GenAI call)
```
Plus a parallel path via `index.ts` -> `HopeAIOrchestrationSystem` -> `hopeai-orchestration-bridge`.

### 7.2 Metrics Fragmented Across 5 Modules
No unified metrics interface. Five separate trackers with overlapping scopes.

### 7.3 Markdown Parsing: 3 Competing Implementations
Legacy (`markdown-it`), modern (`unified/remark/rehype`), incremental. Migration incomplete.

### 7.4 Storage: 6 Adapters, No Unified Interface
Client: 5 IndexedDB adapters. Server: SQLite + Firestore + memory. No common contract.

---

*Report generated from static analysis of `lib/` at commit 7d483bd (main branch).*
