# Claude Code Architectural Patterns Report

**Purpose**: Extract architectural patterns from the Claude Code reference codebase (`claude-code-main/src/`) and map them to actionable refactoring recommendations for Aurora's `lib/` directory.

**Date**: 2026-04-06

---

## Executive Summary

Claude Code's `src/` contains **1,884 TypeScript files** totaling **512,664 lines** with a **median file size of 131 lines** and a **mean of 272 lines**. Only 5% of files exceed 969 lines. Aurora's `lib/` contains **67 files** totaling **30,010 lines** with a **median of 345 lines** and a **mean of 447 lines** -- but its top files are critically oversized: `clinical-agent-router.ts` at 3,248 lines, `hopeai-system.ts` at 1,980 lines, and `intelligent-intent-router.ts` at 1,786 lines. These three files alone account for 23% of all lib/ code.

The following six patterns from Claude Code directly address Aurora's architectural pain points.

---

## Pattern 1: Modular Decomposition (Directory-per-Domain)

**Priority: HIGH**

### How claude-code implements it

Every tool in Claude Code lives in its own directory under `src/tools/<ToolName>/`, decomposed by responsibility. For example, `AgentTool/` contains **20 files** totaling **6,782 lines** across these concerns:

| File | Lines | Responsibility |
|------|------:|----------------|
| `AgentTool.tsx` | 1,397 | Core tool definition, input schema, `call()` method |
| `runAgent.ts` | 973 | Agent execution loop |
| `UI.tsx` | 871 | Rendering/display logic |
| `loadAgentsDir.ts` | 755 | Discovery and loading of agent definitions |
| `agentToolUtils.ts` | 686 | Utility functions (tool filtering, result finalization, lifecycle) |
| `prompt.ts` | 287 | Prompt construction and template generation |
| `resumeAgent.ts` | 265 | Session resume logic |
| `forkSubagent.ts` | 210 | Fork semantics for child agents |
| `agentMemorySnapshot.ts` | 197 | Memory snapshot persistence |
| `agentMemory.ts` | 177 | Memory scope and directory management |
| `agentDisplay.ts` | 104 | Display utilities (overrides, sorting) |
| `builtInAgents.ts` | 72 | Built-in agent registry |
| `agentColorManager.ts` | 66 | Color assignment for UI |
| `constants.ts` | 12 | Shared constants |
| `built-in/*.ts` | ~630 | 6 individual agent definition files |

The decomposition principle: **each file has one axis of change**. The prompt template (`prompt.ts`) can evolve independently from the execution loop (`runAgent.ts`), which can evolve independently from the UI (`UI.tsx`).

Similarly, `BashTool/` contains **19 files** totaling **12,411 lines**, decomposed into:
- `BashTool.tsx` (1,143 lines) -- core tool
- `bashPermissions.ts` (2,621 lines) -- permission evaluation
- `bashSecurity.ts` (2,592 lines) -- security validation
- `readOnlyValidation.ts` (1,990 lines) -- read-only mode checks
- `pathValidation.ts` (1,303 lines) -- path safety
- `sedValidation.ts` (684 lines) -- sed command validation
- `commandSemantics.ts` (141 lines) -- exit code interpretation
- `destructiveCommandWarning.ts` (103 lines) -- destructive command detection
- `bashCommandHelpers.ts` (266 lines) -- compound command permission checks

Even the largest files in BashTool (permissions, security) are domain-isolated. A change to path validation cannot accidentally break sed validation.

### How it applies to Aurora

Aurora's `clinical-agent-router.ts` (3,248 lines) is doing what Claude Code splits across an entire directory. Based on the Claude Code pattern, this file should be decomposed into:

```
lib/clinical-agent/
  router.ts              (~400 lines) -- Core routing logic, intent matching
  prompt-templates.ts    (~300 lines) -- System prompts, clinical context builders
  tool-orchestration.ts  (~300 lines) -- Tool selection and invocation
  safety-validation.ts   (~400 lines) -- Clinical safety checks, guardrails
  response-formatter.ts  (~200 lines) -- Response construction, citation formatting
  context-builder.ts     (~300 lines) -- Patient context assembly, history retrieval
  types.ts               (~100 lines) -- Shared interfaces and type definitions
  constants.ts           (~50 lines)  -- Clinical thresholds, model configs
```

Similarly, `hopeai-system.ts` (1,980 lines) should decompose into:

```
lib/hopeai/
  system.ts              (~300 lines) -- Core system initialization
  orchestration.ts       (~300 lines) -- Multi-agent orchestration logic
  prompt-builder.ts      (~250 lines) -- System prompt construction
  tool-registry.ts       (~200 lines) -- Tool registration and lookup
  context-manager.ts     (~200 lines) -- Context window management
  safety-layer.ts        (~200 lines) -- HIPAA/clinical safety enforcement
  types.ts               (~100 lines) -- Shared types
```

And `intelligent-intent-router.ts` (1,786 lines):

```
lib/intent-router/
  router.ts              (~300 lines) -- Core intent classification
  clinical-intents.ts    (~250 lines) -- Clinical intent handlers
  entity-extraction.ts   (~250 lines) -- Entity extraction from user input
  confidence-scoring.ts  (~200 lines) -- Confidence thresholds, fallback logic
  route-registry.ts      (~150 lines) -- Route definitions
  types.ts               (~100 lines) -- Intent types, route types
```

**Key principle from claude-code**: The largest file in the most complex tool (AgentTool) is 1,397 lines, and it is purely the tool's `call()` method and schema definition. Everything else is extracted into purpose-specific files. No file handles more than one axis of concern.

---

## Pattern 2: Minimal Store + Derived State via Selectors

**Priority: HIGH**

### How claude-code implements it

The state management in Claude Code follows a deliberate three-layer architecture:

**Layer 1: Generic store primitive** (`src/state/store.ts` -- 35 lines)

```typescript
export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()
  return {
    getState: () => state,
    setState: (updater: (prev: T) => T) => void,
    subscribe: (listener: Listener) => () => void,
  }
}
```

This is the entire state management infrastructure -- a 35-line generic store with `getState`, `setState` (taking an updater function, not raw state), and `subscribe`. No framework dependency. No middleware. No reducers. The `onChange` callback allows side effects to be registered declaratively.

**Layer 2: Typed state definition** (`src/state/AppStateStore.ts` -- 570 lines)

The `AppState` type is a single immutable object that uses `DeepImmutable<>` for most fields. State is structured into logical groups:

```typescript
export type AppState = DeepImmutable<{
  settings: SettingsJson
  toolPermissionContext: ToolPermissionContext
  mainLoopModel: ModelSetting
  // ... UI state
}> & {
  tasks: { [taskId: string]: TaskState }      // Mutable (function types)
  mcp: { clients: ..., tools: ..., ... }      // Plugin system
  plugins: { enabled: ..., disabled: ..., ... }
}
```

Key design choice: state that contains function types (like `TaskState`) is excluded from `DeepImmutable` with an explicit `&` intersection, documented with a comment explaining why.

**Layer 3: Pure selector functions** (`src/state/selectors.ts` -- 77 lines)

```typescript
export function getViewedTeammateTask(
  appState: Pick<AppState, 'viewingAgentTaskId' | 'tasks'>,
): InProcessTeammateTaskState | undefined { ... }

export function getActiveAgentForInput(
  appState: AppState,
): ActiveAgentForInput { ... }
```

Selectors are pure functions that take `AppState` (or a `Pick` of it) and return derived data. They use discriminated unions for type-safe result routing.

**Layer 4: Side effects on state change** (`src/state/onChangeAppState.ts`)

The `onChange` callback registered with the store handles cross-cutting effects (CCR sync, permission mode propagation). This separates "what changed" from "what happens when it changes."

### How it applies to Aurora

Aurora likely manages clinical state (patient context, conversation history, active tools, safety flags) across multiple files without a unified store. The Claude Code pattern suggests:

1. **Create a single `ClinicalSessionStore`** using a 35-line generic store (copy the pattern exactly):

```typescript
// lib/state/store.ts
export function createStore<T>(initialState: T, onChange?: OnChange<T>): Store<T>

// lib/state/clinical-session.ts
export type ClinicalSessionState = DeepImmutable<{
  patientContext: PatientContext
  conversationHistory: Message[]
  activeTools: ToolDefinition[]
  safetyFlags: SafetyFlags
  routingDecision: RoutingDecision | null
  // ...
}>
```

2. **Extract derived state into selectors** rather than computing it inline:

```typescript
// lib/state/selectors.ts
export function getActiveClinicalTools(state: ClinicalSessionState): ToolDefinition[]
export function requiresSafetyReview(state: ClinicalSessionState): boolean
export function getCurrentPatientRisk(state: ClinicalSessionState): RiskLevel
```

3. **Use `onChangeState` for side effects** (logging, metrics, HIPAA audit trail) rather than scattering them through business logic.

---

## Pattern 3: Concurrency-Safe Tool Orchestration

**Priority: HIGH**

### How claude-code implements it

`src/services/tools/toolOrchestration.ts` (189 lines) implements a partition-based concurrency model:

```typescript
export async function* runTools(
  toolUseMessages: ToolUseBlock[],
  ...
): AsyncGenerator<MessageUpdate, void> {
  for (const { isConcurrencySafe, blocks } of partitionToolCalls(toolUseMessages, context)) {
    if (isConcurrencySafe) {
      // Run read-only batch concurrently with bounded parallelism
      yield* runToolsConcurrently(blocks, ..., getMaxToolUseConcurrency())
    } else {
      // Run non-read-only batch serially
      yield* runToolsSerially(blocks, ...)
    }
  }
}
```

The key architectural decisions:

1. **Partition by safety**: `partitionToolCalls()` groups consecutive tool calls into batches. Each batch is either entirely concurrency-safe (all tools in the batch report `isConcurrencySafe: true`) or contains a single non-safe tool.

2. **Each tool self-declares concurrency safety** via `tool.isConcurrencySafe(input)`. This is input-dependent -- a bash command might be safe for `ls` but not for `rm`.

3. **Bounded concurrency**: `getMaxToolUseConcurrency()` defaults to 10, configurable via `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`.

4. **Context modification is deferred for concurrent batches**: When tools run concurrently, context modifiers are queued per tool-use ID and applied after the batch completes. Serial tools apply context modifications inline.

5. **AsyncGenerator streaming**: Results stream back via `AsyncGenerator<MessageUpdate>`, enabling progressive UI updates without buffering.

### How it applies to Aurora

Aurora's `dynamic-orchestrator.ts` (1,091 lines) likely handles tool invocation sequentially. The Claude Code pattern suggests:

1. **Add `isConcurrencySafe` to each clinical tool definition**:
   - PubMed search: concurrency-safe (read-only)
   - Patient context retrieval: concurrency-safe (read-only)
   - Clinical note generation: NOT concurrency-safe (writes)
   - Drug interaction check: concurrency-safe (read-only)

2. **Implement partition-based orchestration** so that multiple research tools (PubMed, drug DB, clinical guidelines) run in parallel, while write operations (note generation, prescription drafting) run serially.

3. **Use the bounded-concurrency pattern** with `Promise.all` limited to N concurrent requests to avoid overwhelming external APIs (Vertex AI, PubMed).

---

## Pattern 4: Bounded Memory with File-Based Persistence

**Priority: MEDIUM**

### How claude-code implements it

`src/memdir/memdir.ts` (508 lines) implements a file-based memory system with strict size bounds:

```typescript
export const ENTRYPOINT_NAME = 'MEMORY.md'
export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000
```

Key design principles:

1. **Index + topic file architecture**: `MEMORY.md` is an index (max 200 lines, max 25KB) containing one-line pointers to topic files. Actual memory content lives in separate `.md` files. This prevents the index from growing unbounded.

2. **Truncation with warning injection**: When the index exceeds limits, `truncateEntrypointContent()` truncates and appends a warning visible to the model:
   ```
   > WARNING: MEMORY.md is 247 lines (limit: 200). Only part of it was loaded.
   ```

3. **Three-scope memory model**: Agent memory supports `user`, `project`, and `local` scopes, each with its own directory path. This allows shared team knowledge vs. local-only state.

4. **Lazy directory creation**: `ensureMemoryDirExists()` is fire-and-forget (non-blocking). The directory is guaranteed to exist by the time the model tries to write, because there is always at least one API round-trip between prompt building and file writing.

5. **Typed memory taxonomy**: Memory is constrained to four types (user, feedback, project, reference) with explicit exclusions -- "content that is derivable from the current project state" is explicitly NOT saved.

### How it applies to Aurora

Clinical context management in Aurora needs similar bounds:

1. **Implement a bounded clinical context window** with hard limits (e.g., 8,000 tokens for patient history, 4,000 for conversation, 2,000 for clinical references). Aurora's `context-window-manager.ts` (619 lines) already exists but should adopt the truncation-with-warning pattern.

2. **Adopt the index + detail pattern for patient history**: A summary index of key clinical facts (conditions, medications, allergies) with references to detailed entries. This prevents context overflow on patients with extensive histories.

3. **Scope-based memory**: Separate `session` (current conversation), `patient` (persistent per-patient), and `provider` (provider preferences) scopes -- analogous to Claude Code's user/project/local.

---

## Pattern 5: Coordinator Pattern (Multi-Agent Orchestration)

**Priority: MEDIUM**

### How claude-code implements it

`src/coordinator/coordinatorMode.ts` (370 lines) implements a coordinator-worker architecture:

1. **The coordinator never executes tools directly**. It has only three tools: `Agent` (spawn worker), `SendMessage` (continue worker), and `TaskStop` (stop worker).

2. **Workers are fully autonomous**. Each worker has its own tool set, context, and execution loop. The coordinator synthesizes results.

3. **Strict phase discipline**: Research -> Synthesis -> Implementation -> Verification. The coordinator's system prompt enforces this:
   ```
   | Phase          | Who              | Purpose                                        |
   | Research       | Workers (parallel) | Investigate codebase, find files, understand |
   | Synthesis      | You (coordinator)  | Read findings, craft implementation specs    |
   | Implementation | Workers            | Make targeted changes per spec, commit       |
   | Verification   | Workers            | Test changes work                            |
   ```

4. **Anti-delegation rule**: The coordinator must never write "based on your findings, fix the bug." It must synthesize research results into specific, actionable specs with file paths and line numbers before delegating implementation.

5. **Concurrency management by operation type**:
   - Read-only tasks: run in parallel freely
   - Write-heavy tasks: one at a time per set of files
   - Verification: can run alongside implementation on different files

6. **Worker context determines continuation vs. spawn**:
   - High overlap with next task -> continue via `SendMessage`
   - Low overlap -> spawn fresh worker
   - Failed approach -> spawn fresh (avoid anchoring on failed path)

### How it applies to Aurora

Aurora's clinical agent routing is currently monolithic. The coordinator pattern suggests:

1. **Clinical coordinator as orchestrator**: A thin coordinator that receives patient queries and dispatches to specialized workers:
   - `clinical-research-worker` -- searches PubMed, clinical guidelines
   - `drug-interaction-worker` -- checks drug databases
   - `note-generation-worker` -- writes clinical notes
   - `safety-check-worker` -- validates clinical safety

2. **Synthesis before action**: The coordinator reads research results, identifies the clinical approach, then writes a specific implementation spec for the note-generation worker. This matches the clinical workflow: assessment precedes plan.

3. **Apply the continuation heuristic**: If the drug-interaction worker just looked up medications, continue it for dosage checking (high context overlap). For unrelated clinical questions, spawn fresh.

---

## Pattern 6: File Size Discipline

**Priority: HIGH**

### How claude-code implements it

Statistical analysis of Claude Code's 1,884 source files:

| Metric | Claude Code (`src/`) | Aurora (`lib/`) |
|--------|--------------------:|----------------:|
| Files | 1,884 | 67 |
| Total lines | 512,664 | 30,010 |
| **Median** | **131** | **345** |
| **Mean** | **272** | **447** |
| **P90** | **597** | **773** |
| **P95** | **969** | **1,091** |
| **Max** | **5,594** | **3,248** |

The largest files in Claude Code and their justifications:

| File | Lines | Why it is large |
|------|------:|----------------|
| `cli/print.ts` | 5,594 | CLI output formatting (many format cases) |
| `utils/messages.ts` | 5,512 | Message type constructors (data-heavy, low logic) |
| `utils/sessionStorage.ts` | 5,105 | Session persistence (many field serializers) |
| `screens/REPL.tsx` | 5,005 | Top-level React screen (UI composition root) |
| `main.tsx` | 4,683 | Application entry point (orchestration root) |

Notice: the largest files are **composition roots** (entry points, screens) or **data-heavy utilities** (message constructors, serializers). No file containing **core business logic** exceeds ~3,400 lines, and even that is the API client (`services/api/claude.ts`).

**Within the tools directory** (the closest analogy to Aurora's `lib/`):

| Metric | Claude Code Tools |
|--------|------------------:|
| Largest tool directory | 12,411 lines (BashTool, 19 files) |
| Largest single tool file | 2,621 lines (bashPermissions.ts) |
| Mean file size in tools/ | ~270 lines |
| Files > 1,000 lines in tools/ | 14 out of ~120 |

The discipline: **when a file approaches 1,000 lines, extract a new file by responsibility boundary**. The threshold is not rigid, but the pattern is consistent -- files grow until they contain multiple concerns, then they split.

### How it applies to Aurora

Aurora's top offenders and recommended actions:

| File | Lines | Action |
|------|------:|--------|
| `clinical-agent-router.ts` | 3,248 | **Split into 7-8 files** in `clinical-agent/` directory (see Pattern 1) |
| `hopeai-system.ts` | 1,980 | **Split into 6-7 files** in `hopeai/` directory |
| `intelligent-intent-router.ts` | 1,786 | **Split into 5-6 files** in `intent-router/` directory |
| `dynamic-orchestrator.ts` | 1,091 | **Split into 3-4 files** in `orchestrator/` directory |
| `entity-extraction-engine.ts` | 834 | Borderline -- review for natural split points |
| `hipaa-compliant-storage.ts` | 778 | Borderline -- review for natural split points |

**Target**: Reduce Aurora's mean file size from 447 to ~300 lines and median from 345 to ~200 lines. No file should exceed 1,000 lines unless it is a pure data/type file.

---

## Implementation Roadmap

### Phase 1: Structural Decomposition (Week 1-2)
**Impact: Highest. Addresses the root cause of monolithic complexity.**

1. Create directory structure for `clinical-agent/`, `hopeai/`, `intent-router/`
2. Extract files by responsibility from the three largest monoliths
3. Ensure all imports resolve correctly
4. Run existing tests to verify no behavioral change

### Phase 2: State Management (Week 2-3)
**Impact: High. Enables clean data flow across decomposed modules.**

1. Implement a 35-line generic store (copy claude-code pattern)
2. Define `ClinicalSessionState` type with `DeepImmutable`
3. Extract inline state computations into pure selector functions
4. Register `onChangeState` for audit logging and metrics

### Phase 3: Tool Orchestration (Week 3-4)
**Impact: High. Enables parallel clinical research queries.**

1. Add `isConcurrencySafe` property to each tool definition
2. Implement `partitionToolCalls` for clinical tools
3. Add bounded concurrency (max 5 concurrent API calls)
4. Implement AsyncGenerator-based streaming for progressive results

### Phase 4: Context Bounding (Week 4-5)
**Impact: Medium. Prevents context window overflow on complex cases.**

1. Implement hard token limits per context section
2. Add truncation-with-warning pattern
3. Adopt index + detail file pattern for patient histories
4. Add scope-based memory (session / patient / provider)

### Phase 5: Coordinator Pattern (Week 5-6)
**Impact: Medium. Enables multi-agent clinical workflows.**

1. Define worker agent types (research, drug-interaction, note-generation, safety)
2. Implement coordinator that dispatches to workers
3. Add synthesis step between research and implementation
4. Implement continue-vs-spawn heuristic

---

## Appendix: Key File References

### Claude Code Reference Files
- `src/state/store.ts` -- 35-line generic store implementation
- `src/state/AppStateStore.ts` -- Full state type definition with `DeepImmutable`
- `src/state/selectors.ts` -- Pure selector functions
- `src/state/onChangeAppState.ts` -- Side effects on state change
- `src/services/tools/toolOrchestration.ts` -- Concurrency partition pattern
- `src/services/tools/toolExecution.ts` -- Individual tool execution
- `src/tools/AgentTool/` -- Directory-per-tool decomposition exemplar (20 files)
- `src/tools/BashTool/` -- Largest tool decomposition (19 files)
- `src/memdir/memdir.ts` -- Bounded memory with truncation
- `src/context.ts` -- System/user context construction
- `src/coordinator/coordinatorMode.ts` -- Coordinator-worker architecture

### Aurora Files to Refactor
- `lib/clinical-agent-router.ts` (3,248 lines) -- PRIMARY target
- `lib/hopeai-system.ts` (1,980 lines) -- SECONDARY target
- `lib/intelligent-intent-router.ts` (1,786 lines) -- SECONDARY target
- `lib/dynamic-orchestrator.ts` (1,091 lines) -- TERTIARY target
- `lib/context-window-manager.ts` (619 lines) -- Enhance with bounding patterns
- `lib/tool-registry.ts` (534 lines) -- Add concurrency-safety metadata
