# Orchestration Performance Instrumentation Guide

**Author:** Main Agent 2 (Performance & Orchestration Lead)
**Date:** 2026-04-10
**Status:** Production Ready
**Phase:** Phase 5 - Production Instrumentation

---

## Overview

This guide documents the production performance instrumentation deployed to verify the sub-5ms routing latency target for Aurora's orchestration pipeline.

## Instrumentation Architecture

### Core Components

**1. PerformanceLogger (`lib/performance-logger.ts`)**
- Singleton utility for aggregating timing measurements
- In-memory storage (max 1,000 entries, FIFO eviction)
- Calculates P50/P95/P99 percentiles
- Automatic reporting every 100 messages
- Zero PHI exposure (only operation names + durations)

**2. Measurement Points**

| Operation | Location | What It Measures | Target |
|-----------|----------|------------------|--------|
| `orchestration-total` | hopeai-system.ts:636-1259 | Full orchestration latency | P95 < 5ms |
| `metadata-collection` | hopeai-system.ts:903-914 | Operational metadata construction | ~0.5ms |
| `context-building` | clinical-agent-router.ts:230-236 | Message + context concatenation | ~0.3ms |
| `routing` | hopeai-system.ts:996-1006 | Full routing path (includes context-building + LLM call setup) | ~1.5ms |

**3. Reporting Mechanism**

```typescript
// Automatic trigger every 100 messages
if (messageCount % 100 === 0) {
  PerformanceLogger.report()
}
```

### Sample Output

```
📊 Orchestration Performance Report
📈 Messages processed: 100
📊 Sample size: 400 measurements

orchestration-total:
  Count: 100
  Avg:   2.65ms
  P50:   2.50ms
  P95:   2.80ms ← Target: <5ms
  P99:   3.10ms
  Range: 2.10ms - 3.50ms

metadata-collection:
  Count: 100
  Avg:   0.48ms
  P50:   0.45ms
  P95:   0.55ms
  P99:   0.62ms
  Range: 0.35ms - 0.70ms

context-building:
  Count: 100
  Avg:   0.32ms
  P50:   0.30ms
  P95:   0.38ms
  P99:   0.45ms
  Range: 0.25ms - 0.52ms
```

---

## Implementation Details

### File: `lib/hopeai-system.ts`

**Import (Line 15):**
```typescript
import { PerformanceLogger } from '@/lib/performance-logger'
```

**Orchestration Start (Line 636):**
```typescript
// 📊 PHASE 5: Start orchestration performance measurement
const orchestrationStart = performance.now()
```

**Metadata Collection Measurement (Lines 903-914):**
```typescript
// 📊 PHASE 5: Measure metadata collection
const metadataStart = performance.now()
const operationalMetadata = this.collectOperationalMetadata(
  sessionId,
  currentState.userId,
  currentState,
  patientReference,
  patientRecord,
  fichas,
  clientContext?.operationalHints
);
const metadataDuration = performance.now() - metadataStart
PerformanceLogger.log('metadata-collection', metadataDuration)
```

**Routing Measurement (Lines 996-1006):**
```typescript
// 📊 PHASE 5: Measure routing latency (happens inside sendMessage)
const routingStart = performance.now()
const response = await clinicalAgentRouter.sendMessage(
  sessionId,
  message,
  useStreaming,
  enrichedAgentContext,
  interactionId,
  currentState.userId
)
const routingDuration = performance.now() - routingStart
PerformanceLogger.log('routing', routingDuration)
```

**Total Orchestration Time (Lines 1184-1186, 1257-1259):**
```typescript
// 📊 PHASE 5: Log total orchestration time and increment message counter
const orchestrationDuration = performance.now() - orchestrationStart
PerformanceLogger.log('orchestration-total', orchestrationDuration)
PerformanceLogger.incrementMessageCount()
```

### File: `lib/clinical-agent-router.ts`

**Import (Line 5):**
```typescript
import { PerformanceLogger } from "./performance-logger"
```

**Context Building Measurement (Lines 230-236):**
```typescript
// 📊 PHASE 5: Measure message context building
const contextBuildStart = performance.now()
let enhancedMessage = message
if (enrichedContext) {
  enhancedMessage = buildEnhancedMessage(message, enrichedContext, 'socratico')
}
const contextBuildDuration = performance.now() - contextBuildStart
PerformanceLogger.log('context-building', contextBuildDuration)
```

---

## Data Collection Plan

### Week 1: Baseline Collection
- **Duration:** 7 days minimum
- **Target:** 1,000+ messages from real therapist usage
- **Method:** Console logs in Vercel production environment
- **Access:** Vercel dashboard → Functions → Logs

### Week 2: Analysis
1. Export logs from Vercel
2. Parse performance reports
3. Calculate aggregate statistics:
   - Overall P50/P95/P99 for `orchestration-total`
   - Breakdown by operation
   - Identify any outliers or unexpected patterns

### Week 3: Action
- **If P95 < 5ms:** ✅ Target met, document success
- **If P95 > 5ms:** Apply Priority 1 optimization (RegEx keyword matching)
- **If P95 > 3ms:** Apply Priority 1 + 2 optimizations

See `tasks/PERFORMANCE_OPTIMIZATION_PLAN.md` for full optimization roadmap.

---

## Verification Checklist

### Pre-Production
- [x] TypeScript compilation passes
- [x] No PHI in logs (verified)
- [x] Zero performance overhead (performance.now() is ~1μs)
- [x] Automatic reporting configured (every 100 messages)
- [x] All measurement points instrumented

### Post-Production
- [ ] First report received (after 100 messages)
- [ ] 1,000+ messages collected
- [ ] P95 latency confirmed < 5ms
- [ ] No production errors from instrumentation
- [ ] Logs accessible in Vercel dashboard

---

## Troubleshooting

### Issue: No reports appearing in logs
**Cause:** Fewer than 100 messages processed
**Solution:** Wait for more user activity or manually trigger `PerformanceLogger.report()`

### Issue: P95 exceeds 5ms
**Cause:** Unexpected bottleneck in production
**Solution:**
1. Check breakdown by operation (metadata, context-building, routing)
2. Identify slowest operation
3. Apply targeted optimization from Phase 3 plan

### Issue: Memory growth
**Cause:** Timing entries accumulating beyond 1,000 limit
**Solution:** Check FIFO eviction logic in `PerformanceLogger.log()`

---

## HIPAA Compliance

**PHI Exposure:** ✅ **NONE**

The instrumentation logs only:
- Operation names (strings like "orchestration-total")
- Duration in milliseconds (numeric values)
- Timestamps (Date.now(), no identifiable context)
- Message count (aggregate, no per-user tracking)

**No patient data, session content, user IDs, or identifiable information is logged.**

---

## Related Documents

- **Performance Optimization Plan:** `tasks/PERFORMANCE_OPTIMIZATION_PLAN.md`
- **Performance Agent Audit:** `docs/performance/orchestration-latency-audit.md`
- **Database Agent Audit:** `tasks/firestore-audit-2026-04-10.md`
- **Lessons Learned:** `tasks/lessons.md`

---

**Last Updated:** 2026-04-10
**Version:** 1.0
**Status:** Production Ready ✅
