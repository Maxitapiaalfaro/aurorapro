# Aurora Clinical Intelligence — Monitoring & Observability Runbook

> **Phase 5 — SRE Artifact**
> Last updated: 2026-04-15

---

## 1. Deployment Commands (Targeted, Non-Destructive)

### 1.1 Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

This provisions:
- **3 composite indexes** on `patients` and `memories` collections
- **1 vector index** on `memories.embedding` (768-D, COSINE, pre-filtered by `isActive`)

> ⚠️ The 768-D vector index may take **10–30 minutes** to transition from `CREATING` → `READY`.
> Queries using `findNearest()` will fail with `FAILED_PRECONDITION` until the index is `READY`.

### 1.2 Cloud Functions

```bash
# From the functions/ directory, compile TypeScript first if a build step exists:
cd functions && npm run build 2>/dev/null; cd ..

# Deploy only the trajectory calculator function:
firebase deploy --only functions:calculateTrajectoryDeltas
```

### 1.3 Verify Index Build Status

```bash
# Option A: Firebase CLI (requires firebase-tools >= 13.x)
firebase firestore:indexes --json

# Option B: gcloud CLI (more granular)
gcloud firestore indexes composite list --format="table(name, state, fields)" \
  --project=$(firebase use | tail -1)

# Option C: Check vector index specifically
gcloud firestore indexes composite list --format=json \
  --project=$(firebase use | tail -1) \
  | grep -A5 '"embedding"'
```

**Expected terminal output when READY:**

```
STATE: READY
fields: [isActive ASC, embedding VECTOR(768, COSINE)]
```

If state is `CREATING`, wait and re-check in 5-minute intervals.

---

## 2. Critical SRE Metrics & Alert Thresholds

### Metric 1: `processClinicalMessage` End-to-End Latency

| Parameter         | Value                                          |
|-------------------|------------------------------------------------|
| **Metric name**   | `custom.googleapis.com/aurora/pipeline_latency` (or logged as `pipeline.totalMs` in structured logs) |
| **Source**        | `lib/orchestrator/pipeline.ts` — measures T0+T1+T2 total wall time |
| **p50 target**    | ≤ 800 ms                                      |
| **p95 target**    | ≤ 1 300 ms                                    |
| **p99 alert**     | > 2 000 ms → **WARN**                         |
| **Hard ceiling**  | > 3 000 ms → **CRITICAL** (AbortController fires at 3 s per service) |
| **Log query**     | See Section 3.1 below                         |

### Metric 2: Gemini Embedding API Error Rate

| Parameter         | Value                                          |
|-------------------|------------------------------------------------|
| **Metric name**   | `logging.googleapis.com/user/aurora/embedding_errors` |
| **Source**        | `lib/services/embedding-generator.ts` — `generateMemoryEmbedding()` catch block |
| **Model**         | `gemini-embedding-001` (768-D, task `RETRIEVAL_DOCUMENT`) |
| **Normal rate**   | < 0.5% of requests                            |
| **Alert**         | > 2% error rate over 5-min window → **WARN**  |
| **Critical**      | > 10% error rate over 5-min window → **CRITICAL** (embedding fallback degrades search to keyword-only) |
| **Common errors** | `RESOURCE_EXHAUSTED` (quota), `DEADLINE_EXCEEDED` (3 s timeout), `INVALID_ARGUMENT` (empty content) |

### Metric 3: `calculateTrajectoryDeltas` Cloud Function Health

| Parameter         | Value                                          |
|-------------------|------------------------------------------------|
| **Metric name**   | `cloudfunctions.googleapis.com/function/execution_count` filtered by `function_name=calculateTrajectoryDeltas` |
| **Error metric**  | `cloudfunctions.googleapis.com/function/execution_count` with `status!=ok` |
| **Normal rate**   | Invocations match memory write rate (1:1 trigger) |
| **Alert**         | > 5 consecutive errors → **WARN**             |
| **Critical**      | Function crash-loops (> 20 errors / 10 min) → **CRITICAL** |
| **Idempotency**   | Safe to retry — deduplication via `_trajectory_locks/{eventId}` |
| **Timeout**       | Default Cloud Function timeout (60 s); computation targets < 5 s |

---

## 3. Log Tailing Commands

### 3.1 Pipeline Latency (Application Logs)

```bash
# Tail Next.js server logs for pipeline timing (structured JSON)
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.message=~"pipeline.totalMs"' \
  --project=$(gcloud config get-value project) \
  --limit=20 \
  --format="table(timestamp, jsonPayload.message, jsonPayload.pipeline.totalMs)"
```

### 3.2 Cloud Function Errors

```bash
# Tail trajectory calculator logs in real-time
firebase functions:log --only calculateTrajectoryDeltas --follow

# Or via gcloud for richer filtering:
gcloud logging tail \
  'resource.type="cloud_function" AND resource.labels.function_name="calculateTrajectoryDeltas" AND severity>=ERROR' \
  --project=$(gcloud config get-value project)
```

### 3.3 Embedding API Timeout Monitoring

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND jsonPayload.message=~"embedding" AND severity>=WARNING' \
  --project=$(gcloud config get-value project) \
  --limit=50 \
  --freshness=1h \
  --format="table(timestamp, severity, jsonPayload.message)"
```

---

## 4. GCP Alerting Policy (Recommended)

Create via `gcloud` or the GCP Console → Monitoring → Alerting:

```yaml
# alert-policy-aurora-pipeline.yaml
displayName: "Aurora Pipeline p95 > 1300ms"
conditions:
  - displayName: "Pipeline latency exceeds budget"
    conditionThreshold:
      filter: 'metric.type="logging.googleapis.com/user/aurora/pipeline_latency"'
      aggregations:
        - alignmentPeriod: "300s"
          perSeriesAligner: ALIGN_PERCENTILE_95
      comparison: COMPARISON_GT
      thresholdValue: 1300
      duration: "300s"
notificationChannels:
  - projects/PROJECT_ID/notificationChannels/CHANNEL_ID
```

---

## 5. Firebase Billing Watchdog

| Plan          | Concern                                        |
|---------------|------------------------------------------------|
| **Spark**     | Free tier — Firestore reads capped at 50K/day. Vector search counts as reads. Monitor daily usage in Firebase Console → Usage. |
| **Blaze**     | Pay-as-you-go — Set budget alerts at $5, $25, $100/month in GCP Billing → Budgets & Alerts. |
| **GenAI API** | Gemini embedding calls billed per 1K characters. Set quota caps in GCP Console → APIs → Generative Language API → Quotas. |

---

## 6. Pre-Flight Checklist

- [ ] `firebase deploy --only firestore:indexes` — success
- [ ] Vector index state = `READY` (check via `firebase firestore:indexes`)
- [ ] `firebase deploy --only functions:calculateTrajectoryDeltas` — success
- [ ] Function appears in Firebase Console → Functions
- [ ] Test write to `memories` collection triggers `calculateTrajectoryDeltas`
- [ ] `processClinicalMessage()` returns within 1 300 ms on test message
- [ ] No `FAILED_PRECONDITION` errors in logs (indicates missing index)

---

**[FASE 5 COMPLETADA. INFRAESTRUCTURA APROVISIONADA Y SISTEMA AURORA LISTO PARA TRÁFICO CLÍNICO]**
