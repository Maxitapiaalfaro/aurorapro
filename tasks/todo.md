# Aurora Task Tracker

## Active Tasks
<!-- Format: - [ ] Task description | Priority: H/M/L | Status: pending/in-progress/done -->

### ARCH-2: Parallel Firestore Lookups in Sub-Agents (HIGH)
> Follow-up to ARCH-1: sub-agents had sequential Firestore calls that should be parallelized

#### Phase 1: Parallelize explore-patient-context.ts | Priority: H ✅ DONE
- [x] 1a. Convert 3 sequential Firestore calls (record → memories → semantic) to single `Promise.all`
- [x] 1b. All 3 reads are independent — no data dependency between them
- [x] 1c. Latency: 3 sequential round-trips → 1 parallel round-trip (≈3x faster)

#### Phase 2: Parallelize analyze-longitudinal-patterns.ts | Priority: M ✅ DONE
- [x] 2a. Run patient name fetch + analyzer import + message conversion in parallel
- [x] 2b. Patient name fetch uses non-blocking fallback to 'Paciente' on error

#### Phase 3: Validation | Priority: H
- [ ] 3a. Run tests (2/2 passed, pre-existing upload-document failure)
- [ ] 3b. Run parallel_validation for code review + CodeQL security scan

### ARCH-1: Agent-Tree MCP Architecture Improvements (HIGH)
> Based on PR analysis `copilot/revise-agent-architecture-relationship`
> Source: `docs/architecture/agent-tree-mcp-relationship-analysis.md`

#### Phase 2: Sub-Agent Parallelization | Priority: H ✅ DONE
- [x] 2a. Convert `research-evidence.ts` sequential search loop → parallel Promise.all with per-query error isolation
- [x] 2b. Add progress reporting that works with parallel execution (report when each search completes, not just start)
- [x] 2c. Verify no regressions with vitest

#### Phase 3: Semantic Memory Selection | Priority: H ✅ DONE
- [x] 3a. Add `getRelevantMemoriesSemantic()` to `clinical-memory-system.ts` that uses Gemini Flash to select top-K relevant memories
- [x] 3b. Automatic fallback to keyword-based `getRelevantMemories()` on LLM failure
- [x] 3c. Wire new function to `explore_patient_context.ts` sub-agent (replace `getRelevantMemories` call)
- [x] 3d. Verify no regressions with vitest

#### Phase 4: MCP Foundation Types | Priority: M ✅ DONE
- [x] 4a. Create `lib/mcp/types.ts` — MCPServerConfig, MCPToolDefinition, MCPToolResult interfaces
- [x] 4b. Create `lib/mcp/mcp-tool-wrapper.ts` — wraps MCP tool calls into ToolHandler interface
- [x] 4c. Create `lib/mcp/mcp-registry.ts` — singleton registry for MCP server connections
- [x] 4d. Create `lib/mcp/index.ts` — barrel export
- [x] 4e. Verify type-check passes (no new errors in lib/mcp/)

#### Phase 5: Documentation Update | Priority: L ✅ DONE
- [x] 5a. Update `gap-analysis-aurora-vs-claude.md` status section
- [x] 5b. Add ARCH-1 results to `tasks/todo.md` completed section

#### Phase 6: Validation
- [ ] 6a. Run parallel_validation for code review + CodeQL security scan

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
- [x] 2026-04-07: PERF — Firestore I/O Optimization (~630→~12 ops/msg)
- [x] 2026-04-07: Promptware 2026 Audit (COMPLETE)
- [x] 2026-04-07: Gap P2.1 — Clinical Memory System Wiring (COMPLETE)
- [x] 2026-04-07: PT — Patient Tools (`create_patient` + `list_patients`, 6 files, +256 lines)
- [x] 2026-04-07: patientId Threading — Fixed `save_clinical_memory` tool failure (3 files)
- [x] 2026-04-07: SRF — Session Recovery Fix — non-blocking sessionMeta, eliminated double-read, defensive dates (3 files)
- [x] 2026-04-08: ARCH-1 — Agent-Tree/MCP Architecture Improvements (3 phases):
  - Phase 2: Sub-agent parallel search execution (research-evidence.ts: sequential→Promise.all)
  - Phase 3: Semantic memory selection via Gemini Flash (clinical-memory-system.ts + explore-patient-context.ts)
  - Phase 4: MCP foundation types (`lib/mcp/`: types, tool wrapper, registry — 4 files, +538 lines)
- [x] 2026-04-08: MCP-TRANSPORT — Real MCP transport implementation:
  - `mcp-registry.ts` rewritten: SSE, HTTP Streamable, stdio transports via @modelcontextprotocol/sdk v1.28.0
  - `mcp-init.ts` added: env-var-driven server config (MCP_SENTRY_URL, MCP_PUBMED_URL, MCP_LOCAL_COMMAND)
  - Wired into `hopeai-system.ts` initialization (non-blocking)
  - 14 tests added (tests/mcp-registry.test.ts), all passing
