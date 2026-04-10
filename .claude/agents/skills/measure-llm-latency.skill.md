# Skill: Measure LLM Latency

## Purpose

Profile and measure latency of LLM API calls (Gemini, OpenAI, Claude) throughout the Aurora Pro codebase to identify performance bottlenecks and optimize token usage. This skill provides before/after metrics for LLM optimization efforts.

## Assigned Agent

**Performance Agent** - Primary user for LLM performance optimization.

**AI Expert Agent** - Secondary user when optimizing prompts or model selection.

## When to Use

- Before optimizing LLM calls (establish baseline)
- After prompt refactoring (measure improvement)
- User reports slow AI responses
- During performance audit
- When comparing different models (Flash vs Pro, streaming vs non-streaming)
- Verifying token optimization strategies

## When NOT to Use

- Non-LLM performance issues (use general profiling)
- One-time manual testing (just call the API once)
- Production monitoring (use observability tools instead)

## Inputs

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `scope` | enum | Yes | Measurement scope: `all`, `function`, `route`, `flow` | `flow` |
| `target` | string | No | Specific function/route/flow to measure | `chat-message-flow` |
| `iterations` | number | No | Number of test runs for averaging (default: 3) | `5` |
| `model` | string | No | Specific model to test (default: all used models) | `gemini-2.0-flash` |
| `recordMetrics` | boolean | No | Save results to metrics file (default: true) | `true` |

## Steps

### 1. Identify LLM Call Sites

**Find all LLM API calls in codebase:**

```bash
# Gemini calls
grep -r "generateContent\|streamGenerateContent" lib/ app/ --include="*.ts" --include="*.tsx" -B 3 -A 10

# OpenAI calls (if any)
grep -r "openai.chat.completions.create" lib/ app/ --include="*.ts" -B 3 -A 10

# Anthropic Claude calls (if any)
grep -r "anthropic.messages.create" lib/ app/ --include="*.ts" -B 3 -A 10
```

**Expected patterns:**
```typescript
// Gemini non-streaming
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }]
})

// Gemini streaming
const result = await model.streamGenerateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }]
})
```

### 2. Extract Call Context

**For each LLM call, capture:**
```typescript
interface LLMCallContext {
  file: string
  line: number
  function: string
  model: string // 'gemini-2.0-flash', 'gemini-2.0-pro', etc.
  streaming: boolean
  promptSource: string // Where prompt is built
  tokenEstimate: number // Rough estimate from prompt length
  purpose: string // 'chat-response', 'memory-extraction', 'summary', etc.
}
```

**Parse model configuration:**
```typescript
// From code like:
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

// Extract:
{
  model: 'gemini-2.0-flash-exp',
  vendor: 'google',
  modelFamily: 'gemini-2.0',
  variant: 'flash'
}
```

### 3. Instrument LLM Calls

**Wrap LLM calls with timing:**

```typescript
async function measureLLMCall<T>(
  callName: string,
  model: string,
  fn: () => Promise<T>
): Promise<{ result: T; metrics: LLMMetrics }> {
  const startTime = performance.now()
  const startMemory = process.memoryUsage().heapUsed

  let firstTokenTime: number | null = null
  let tokenCount = 0

  try {
    const result = await fn()

    const endTime = performance.now()
    const endMemory = process.memoryUsage().heapUsed

    // Extract token counts from result
    if ('usageMetadata' in result) {
      tokenCount = result.usageMetadata.totalTokenCount || 0
    }

    return {
      result,
      metrics: {
        callName,
        model,
        totalLatency: endTime - startTime,
        firstTokenLatency: firstTokenTime ? firstTokenTime - startTime : null,
        tokenCount,
        memoryDelta: endMemory - startMemory,
        timestamp: new Date().toISOString()
      }
    }
  } catch (error) {
    throw error
  }
}
```

**Usage:**
```typescript
// BEFORE
const result = await model.generateContent({ contents })

// AFTER (instrumented)
const { result, metrics } = await measureLLMCall(
  'chat-response',
  'gemini-2.0-flash',
  () => model.generateContent({ contents })
)

console.log(`LLM call: ${metrics.totalLatency}ms, ${metrics.tokenCount} tokens`)
```

### 4. Run Performance Tests

**For each identified LLM call:**

```typescript
interface LLMBenchmark {
  callName: string
  model: string
  iterations: number
  runs: Array<{
    iteration: number
    totalLatency: number
    firstTokenLatency: number | null
    tokenCount: number
    memoryDelta: number
  }>
  summary: {
    avgTotalLatency: number
    minTotalLatency: number
    maxTotalLatency: number
    p50Latency: number
    p95Latency: number
    p99Latency: number
    avgTokenCount: number
    avgTokensPerSecond: number
  }
}
```

**Execute benchmark:**
```typescript
async function benchmarkLLMCall(
  context: LLMCallContext,
  iterations: number
): Promise<LLMBenchmark> {
  const runs = []

  for (let i = 0; i < iterations; i++) {
    const { metrics } = await measureLLMCall(
      context.function,
      context.model,
      () => executeLLMCall(context)
    )

    runs.push({
      iteration: i + 1,
      totalLatency: metrics.totalLatency,
      firstTokenLatency: metrics.firstTokenLatency,
      tokenCount: metrics.tokenCount,
      memoryDelta: metrics.memoryDelta
    })

    // Wait 1s between iterations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // Calculate percentiles
  const latencies = runs.map(r => r.totalLatency).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)]
  const p95 = latencies[Math.floor(latencies.length * 0.95)]
  const p99 = latencies[Math.floor(latencies.length * 0.99)]

  return {
    callName: context.function,
    model: context.model,
    iterations,
    runs,
    summary: {
      avgTotalLatency: average(runs.map(r => r.totalLatency)),
      minTotalLatency: Math.min(...runs.map(r => r.totalLatency)),
      maxTotalLatency: Math.max(...runs.map(r => r.totalLatency)),
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      avgTokenCount: average(runs.map(r => r.tokenCount)),
      avgTokensPerSecond: average(
        runs.map(r => (r.tokenCount / r.totalLatency) * 1000)
      )
    }
  }
}
```

### 5. Measure Critical User Flows

**End-to-end flow measurement:**

```typescript
// Example: Chat message flow
async function measureChatMessageFlow(
  userId: string,
  patientId: string,
  sessionId: string,
  userMessage: string
): Promise<FlowMetrics> {
  const flowStart = performance.now()

  // Step 1: Load context (Firestore reads)
  const t1 = performance.now()
  const context = await loadSessionContext(userId, patientId, sessionId)
  const contextLoadTime = performance.now() - t1

  // Step 2: Build prompt
  const t2 = performance.now()
  const prompt = await buildChatPrompt(context, userMessage)
  const promptBuildTime = performance.now() - t2

  // Step 3: LLM call
  const t3 = performance.now()
  const { result, metrics: llmMetrics } = await measureLLMCall(
    'chat-response',
    'gemini-2.0-flash',
    () => model.generateContent({ contents: prompt })
  )
  const llmCallTime = performance.now() - t3

  // Step 4: Save response (Firestore write)
  const t4 = performance.now()
  await saveMessage(sessionId, result)
  const saveTime = performance.now() - t4

  const totalTime = performance.now() - flowStart

  return {
    totalTime,
    steps: {
      contextLoad: contextLoadTime,
      promptBuild: promptBuildTime,
      llmCall: llmCallTime,
      save: saveTime
    },
    llmMetrics,
    breakdown: {
      contextLoadPercent: (contextLoadTime / totalTime) * 100,
      promptBuildPercent: (promptBuildTime / totalTime) * 100,
      llmCallPercent: (llmCallTime / totalTime) * 100,
      savePercent: (saveTime / totalTime) * 100
    }
  }
}
```

### 6. Generate Performance Report

**Report structure:**

```markdown
### LLM Latency Measurement Report

**Scope**: {scope}
**Target**: {target}
**Iterations**: {iterations}
**Timestamp**: {timestamp}

---

#### Summary

| Metric | Value |
|--------|-------|
| Total LLM Calls Measured | {totalCalls} |
| Average Latency (All) | {avgLatency}ms |
| Total Tokens Used | {totalTokens} |
| Average Tokens/Second | {tokensPerSecond} |
| Slowest Call | {slowestCall} ({slowestLatency}ms) |
| Fastest Call | {fastestCall} ({fastestLatency}ms) |

---

#### Per-Call Breakdown

**1. chat-response (gemini-2.0-flash)**
- Iterations: 5
- Avg Latency: 1,234ms (p50: 1,200ms, p95: 1,450ms, p99: 1,500ms)
- Avg Tokens: 450 (300 input, 150 output)
- Tokens/Second: 364
- First Token Latency: 150ms (avg)
- File: `lib/ai/chat-handler.ts:42`

**2. extract-clinical-memories (gemini-2.0-flash)**
- Iterations: 5
- Avg Latency: 2,100ms (p50: 2,050ms, p95: 2,300ms, p99: 2,400ms)
- Avg Tokens: 1,200 (1,000 input, 200 output)
- Tokens/Second: 571
- First Token Latency: 200ms (avg)
- File: `lib/ai/memory-extraction.ts:28`

---

#### Flow Analysis: Chat Message

**Total Flow Time**: 1,450ms

| Step | Time | % of Total |
|------|------|------------|
| 1. Load Context (Firestore) | 80ms | 5.5% |
| 2. Build Prompt | 20ms | 1.4% |
| 3. LLM Call | 1,234ms | 85.1% |
| 4. Save Response (Firestore) | 116ms | 8.0% |

**Bottleneck**: LLM call dominates flow time (85%).

---

#### Model Comparison

| Model | Avg Latency | Avg Tokens | Tokens/Sec | Use Case |
|-------|-------------|------------|------------|----------|
| gemini-2.0-flash | 1,234ms | 450 | 364 | Chat responses |
| gemini-2.0-pro | 3,200ms | 500 | 156 | Complex reasoning |
| gemini-2.0-flash-lite | 800ms | 400 | 500 | Simple queries |

**Recommendation**: Use Flash-Lite for simple chat responses to reduce latency by 35%.

---

#### Optimization Opportunities

1. **Reduce Prompt Size**: Chat prompt averages 300 input tokens. Consider semantic memory selection instead of full history.
   - Potential savings: 40% token reduction = ~500ms faster

2. **Parallel LLM Calls**: Memory extraction runs sequentially after chat response. Could run in parallel.
   - Potential savings: ~2,100ms (memory extraction time)

3. **Streaming**: Enable streaming for chat responses to improve perceived latency.
   - First token in 150ms vs 1,234ms total time

4. **Model Downgrade**: Use Flash-Lite for non-clinical queries (70% of traffic).
   - Potential savings: 434ms per message × 70% = ~300ms avg
```

### 7. Save Metrics (if enabled)

**Append to metrics file:**
```json
// tasks/performance-metrics.json
{
  "llm-benchmarks": [
    {
      "timestamp": "2025-04-10T14:30:00Z",
      "scope": "flow",
      "target": "chat-message-flow",
      "iterations": 5,
      "results": {
        "totalTime": 1450,
        "llmCallTime": 1234,
        "llmTokens": 450,
        "llmModel": "gemini-2.0-flash"
      }
    }
  ]
}
```

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `totalCalls` | number | LLM calls measured |
| `benchmarks` | array | Per-call benchmark results |
| `flowMetrics` | object | End-to-end flow breakdown (if scope=flow) |
| `summary` | string | Human-readable report |
| `recommendations` | array | Optimization opportunities |
| `metricsFile` | string | Path to saved metrics JSON |

## Acceptance Criteria

- [ ] All LLM calls in specified scope measured
- [ ] Minimum 3 iterations per call for statistical validity
- [ ] Reports total latency, first token latency, and token count
- [ ] Calculates p50, p95, p99 percentiles
- [ ] Identifies bottleneck in multi-step flows
- [ ] Compares different models if multiple used
- [ ] Provides actionable optimization recommendations
- [ ] Metrics saved to JSON for before/after comparison

## Health-Tech Specific Rules

- **Therapist Wait Time**: Chat responses should be <2s total (85th percentile)
- **Clinical Accuracy vs Speed**: Never sacrifice accuracy for speed on clinical tasks (use Pro for complex reasoning)
- **Offline Fallback**: Measure degradation when using cached responses vs fresh LLM calls
- **Token Costs**: Track token usage for subscription tier limits (Pro users get 10x tokens)

## Aurora Performance Baselines

**From DECISIONS.md:**
- **Before optimization**: 2 LLM calls per message (~3-4s total)
- **After optimization**: 1 LLM call per message (~1.2s total)
- **Target**: <2s p85 for chat responses

**Current Models:**
- `gemini-2.0-flash-exp` - Main chat model (1,234ms avg)
- `gemini-flash-1.5-8b` - Sub-agent model (800ms avg)
- `gemini-2.0-pro-exp` - Complex reasoning (3,200ms avg)

## Example Invocation

**Measure all LLM calls:**
```typescript
measureLLMLatency({
  scope: 'all',
  iterations: 5,
  recordMetrics: true
})
```

**Measure specific flow:**
```typescript
measureLLMLatency({
  scope: 'flow',
  target: 'chat-message-flow',
  iterations: 3,
  recordMetrics: true
})
```

**Compare models:**
```typescript
measureLLMLatency({
  scope: 'function',
  target: 'generateChatResponse',
  model: 'gemini-2.0-flash', // Run once with Flash
  iterations: 5
})

measureLLMLatency({
  scope: 'function',
  target: 'generateChatResponse',
  model: 'gemini-2.0-flash-lite', // Run again with Flash-Lite
  iterations: 5
})

// Compare results
```

## Integration with Performance Agent Workflow

1. **Establish Baseline**: Run `measureLLMLatency` before optimization
2. **Implement Changes**: Reduce prompt size, enable streaming, change model
3. **Measure Improvement**: Run `measureLLMLatency` again
4. **Compare Metrics**: Load before/after from `tasks/performance-metrics.json`
5. **Report**: "Reduced chat latency from 1,234ms to 800ms (35% improvement)"
