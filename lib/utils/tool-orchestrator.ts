/**
 * Tool Orchestrator — P1.2: Concurrency Limits for Function Calls
 *
 * Replaces raw Promise.all() execution with intelligent partitioning based on
 * the SecurityCategory system introduced in P0.1.
 *
 * Strategy (inspired by Claude Code's toolOrchestration.ts):
 * 1. Partition tool calls by security category
 * 2. read-only + external → parallel with concurrency limit (default 3)
 * 3. write → sequential (prevents Firestore race conditions)
 * 4. Per-tool error isolation: one failure doesn't crash the batch
 *
 * @version 1.0.0 — P1.2
 */

import type { SecurityCategory } from '../tool-registry';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A prepared tool call with its security metadata already resolved.
 * The caller (clinical-agent-router) resolves security category and permission
 * checks BEFORE passing calls to the orchestrator.
 */
export interface PreparedToolCall {
  /** Original function call from the LLM */
  call: { name: string; args?: Record<string, unknown> };
  /** Resolved security category (from ToolRegistry or default) */
  securityCategory: SecurityCategory;
  /** The async execution function — returns the tool response */
  execute: () => Promise<ToolCallResult>;
}

export interface ToolCallResult {
  name: string;
  response: unknown;
}

export interface OrchestratorOptions {
  /** Maximum number of parallel tool executions for read-only/external tools (default: 3) */
  maxConcurrent?: number;
}

// ============================================================================
// PARTITIONING
// ============================================================================

interface Batch {
  isParallel: boolean;
  calls: PreparedToolCall[];
}

/**
 * Partition tool calls into ordered batches:
 * - Consecutive read-only/external calls → single parallel batch
 * - Each write call → individual sequential batch
 *
 * Preserves the original ordering so that the LLM sees results in the same
 * sequence it requested them.
 */
function partitionToolCalls(calls: PreparedToolCall[]): Batch[] {
  return calls.reduce<Batch[]>((batches, call) => {
    const isParallel = call.securityCategory !== 'write';

    if (isParallel && batches.length > 0 && batches[batches.length - 1]!.isParallel) {
      // Merge into existing parallel batch
      batches[batches.length - 1]!.calls.push(call);
    } else {
      batches.push({ isParallel, calls: [call] });
    }

    return batches;
  }, []);
}

// ============================================================================
// EXECUTION STRATEGIES
// ============================================================================

/**
 * Execute calls in parallel with a concurrency limit.
 * Uses a semaphore pattern to cap active promises.
 */
async function executeParallel(
  calls: PreparedToolCall[],
  maxConcurrent: number
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = new Array(calls.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < calls.length) {
      const idx = nextIndex++;
      const call = calls[idx]!;
      results[idx] = await executeSafely(call);
    }
  }

  // Spawn workers up to the concurrency limit
  const workerCount = Math.min(maxConcurrent, calls.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

/**
 * Execute calls strictly one after another (for write operations).
 */
async function executeSequential(
  calls: PreparedToolCall[]
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  for (const call of calls) {
    results.push(await executeSafely(call));
  }
  return results;
}

/**
 * Execute a single tool call with error isolation.
 * If the tool throws, return a structured error response instead of
 * propagating the exception — so other tools in the batch can continue.
 */
async function executeSafely(call: PreparedToolCall): Promise<ToolCallResult> {
  try {
    return await call.execute();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ [ToolOrchestrator] Tool "${call.call.name}" failed: ${message}`);

    return {
      name: call.call.name,
      response: {
        error: `Tool execution failed: ${message}`,
        tool_name: call.call.name,
        security_category: call.securityCategory,
      },
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Execute a batch of tool calls safely with:
 * - Intelligent partitioning by security category
 * - Concurrency limits for parallel-safe tools
 * - Sequential execution for write tools
 * - Per-tool error isolation
 *
 * @example
 * ```ts
 * const results = await executeToolsSafely([
 *   { call: { name: 'google_search', args: {...} }, securityCategory: 'external', execute: async () => ({...}) },
 *   { call: { name: 'save_note', args: {...} }, securityCategory: 'write', execute: async () => ({...}) },
 *   { call: { name: 'search_evidence', args: {...} }, securityCategory: 'external', execute: async () => ({...}) },
 * ], { maxConcurrent: 3 });
 * // Batch 1 (parallel, limit 3): google_search
 * // Batch 2 (sequential): save_note
 * // Batch 3 (parallel, limit 3): search_evidence
 * ```
 */
export async function executeToolsSafely(
  preparedCalls: PreparedToolCall[],
  options: OrchestratorOptions = {}
): Promise<ToolCallResult[]> {
  const { maxConcurrent = 3 } = options;

  if (preparedCalls.length === 0) return [];

  const batches = partitionToolCalls(preparedCalls);

  // Log partition plan
  const plan = batches.map(b =>
    `${b.isParallel ? '⚡ parallel' : '🔒 sequential'}(${b.calls.map(c => c.call.name).join(', ')})`
  ).join(' → ');
  console.log(`🎯 [ToolOrchestrator] Execution plan: ${plan}`);

  // Execute batches in order, collecting all results
  const allResults: ToolCallResult[] = [];

  for (const batch of batches) {
    if (batch.isParallel) {
      const batchResults = await executeParallel(batch.calls, maxConcurrent);
      allResults.push(...batchResults);
    } else {
      const batchResults = await executeSequential(batch.calls);
      allResults.push(...batchResults);
    }
  }

  return allResults;
}
