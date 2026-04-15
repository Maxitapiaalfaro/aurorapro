/**
 * Trajectory Calculator — Longitudinal Frequency Delta Analysis (Pillar 3)
 *
 * Firebase Cloud Function (2nd Gen) that listens to memory writes and
 * computes frequency deltas (Δf) for clinical domain tags over rolling
 * 30-day windows. Results are persisted as trajectory snapshots for the
 * patient timeline visualization.
 *
 * Trigger: onDocumentWritten('psychologists/{psyId}/patients/{patId}/memories/{memId}')
 *
 * Idempotency: Uses the Cloud Function eventId to deduplicate executions
 * (at-least-once delivery guarantee). A processed-events lock document
 * is written before computation begins.
 *
 * Algorithm:
 *   1. Read the last 50 memories for the same patient + domain.
 *   2. Partition into two 30-day windows: [T-60, T-30) and [T-30, T-0].
 *   3. For each semantic tag, compute Δf = freq_current - freq_previous.
 *   4. Segment significant deltas by milestone markers.
 *   5. Persist the trajectory snapshot to `trajectory_snapshots/{snapshotId}`.
 *
 * Firestore paths:
 *   psychologists/{psyId}/patients/{patId}/memories/{memId}
 *   psychologists/{psyId}/patients/{patId}/trajectory_snapshots/{snapshotId}
 *   psychologists/{psyId}/patients/{patId}/_trajectory_locks/{eventId}
 *
 * @module functions/trajectory-calculator
 */

import {
  onDocumentWritten,
  type FirestoreEvent,
  type Change,
} from 'firebase-functions/v2/firestore'
import type { DocumentSnapshot } from 'firebase-functions/v2/firestore'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { initializeApp, getApps } from 'firebase-admin/app'

// ---------------------------------------------------------------------------
// Firebase Admin initialization (idempotent)
// ---------------------------------------------------------------------------

if (getApps().length === 0) {
  initializeApp()
}

const db = getFirestore()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of recent memories to analyze per domain. */
const MEMORY_WINDOW_SIZE = 50

/** Rolling window duration in days. */
const WINDOW_DAYS = 30

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1_000

/** Minimum absolute Δf to consider a tag change significant. */
const SIGNIFICANCE_THRESHOLD = 0.1

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A frequency delta for a single semantic tag. */
interface TagDelta {
  tag: string
  domain: string
  frequencyPrevious: number
  frequencyCurrent: number
  delta: number
  /** Whether this delta crosses the significance threshold. */
  significant: boolean
}

/** A milestone marker derived from tag frequency shifts. */
interface TrajectoryMilestone {
  tag: string
  domain: string
  direction: 'increasing' | 'decreasing' | 'stable'
  delta: number
  windowCurrentCount: number
  windowPreviousCount: number
}

/** Shape of the trajectory snapshot persisted to Firestore. */
interface TrajectorySnapshot {
  snapshotId: string
  patientId: string
  psychologistId: string
  triggerMemoryId: string
  triggerDomain: string
  computedAt: FieldValue
  windowCurrentStart: Date
  windowPreviousStart: Date
  windowEnd: Date
  memoriesAnalyzed: number
  tagDeltas: TagDelta[]
  milestones: TrajectoryMilestone[]
}

/** Minimal memory shape read from Firestore for delta computation. */
interface MemorySlice {
  memoryId: string
  domain: string
  semanticTags: string[]
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Idempotency lock
// ---------------------------------------------------------------------------

/**
 * Attempts to acquire an idempotency lock for the given eventId.
 * Returns true if the lock was acquired (first execution),
 * false if a previous execution already processed this event.
 *
 * Uses a Firestore transaction with create() to atomically detect
 * duplicates — create() fails if the document already exists.
 */
async function acquireIdempotencyLock(
  psyId: string,
  patId: string,
  eventId: string,
): Promise<boolean> {
  const lockRef = db.doc(
    `psychologists/${psyId}/patients/${patId}/_trajectory_locks/${eventId}`,
  )

  try {
    await lockRef.create({
      processedAt: FieldValue.serverTimestamp(),
      eventId,
    })
    return true
  } catch {
    // Document already exists — duplicate execution
    return false
  }
}

// ---------------------------------------------------------------------------
// Memory reader
// ---------------------------------------------------------------------------

/**
 * Reads the last `MEMORY_WINDOW_SIZE` memories for the given patient
 * filtered by domain, ordered by createdAt descending.
 */
async function readRecentMemories(
  psyId: string,
  patId: string,
  domain: string,
): Promise<MemorySlice[]> {
  const snapshot = await db
    .collection(`psychologists/${psyId}/patients/${patId}/memories`)
    .where('isActive', '==', true)
    .where('ontology.domain', '==', domain)
    .orderBy('createdAt', 'desc')
    .limit(MEMORY_WINDOW_SIZE)
    .get()

  return snapshot.docs.map((doc) => {
    const data = doc.data()
    const createdAtRaw = data.createdAt
    const createdAt =
      createdAtRaw instanceof Timestamp
        ? createdAtRaw.toDate()
        : createdAtRaw instanceof Date
          ? createdAtRaw
          : new Date(createdAtRaw)

    return {
      memoryId: data.memoryId ?? doc.id,
      domain: data.ontology?.domain ?? domain,
      semanticTags: Array.isArray(data.ontology?.semanticTags)
        ? data.ontology.semanticTags
        : (Array.isArray(data.tags) ? data.tags : []),
      createdAt,
    }
  })
}

// ---------------------------------------------------------------------------
// Delta computation
// ---------------------------------------------------------------------------

/**
 * Partitions memories into two 30-day windows and computes frequency
 * deltas for each semantic tag.
 *
 * Window definitions relative to `now`:
 *   - Current:  [now - 30d, now]
 *   - Previous: [now - 60d, now - 30d)
 *
 * Frequency is normalized: count(tag_in_window) / total_memories_in_window.
 */
function computeTagDeltas(
  memories: MemorySlice[],
  domain: string,
  now: Date,
): { deltas: TagDelta[]; milestones: TrajectoryMilestone[] } {
  const currentCutoff = new Date(now.getTime() - WINDOW_DAYS * MS_PER_DAY)
  const previousCutoff = new Date(now.getTime() - 2 * WINDOW_DAYS * MS_PER_DAY)

  const currentWindow: MemorySlice[] = []
  const previousWindow: MemorySlice[] = []

  for (const mem of memories) {
    const t = mem.createdAt.getTime()
    if (t >= currentCutoff.getTime()) {
      currentWindow.push(mem)
    } else if (t >= previousCutoff.getTime()) {
      previousWindow.push(mem)
    }
  }

  // Count tag frequencies per window
  const currentTagCounts = new Map<string, number>()
  const previousTagCounts = new Map<string, number>()

  for (const mem of currentWindow) {
    for (const tag of mem.semanticTags) {
      currentTagCounts.set(tag, (currentTagCounts.get(tag) ?? 0) + 1)
    }
  }

  for (const mem of previousWindow) {
    for (const tag of mem.semanticTags) {
      previousTagCounts.set(tag, (previousTagCounts.get(tag) ?? 0) + 1)
    }
  }

  // Union of all tags seen in either window
  const allTags = new Set([...currentTagCounts.keys(), ...previousTagCounts.keys()])

  const currentTotal = Math.max(currentWindow.length, 1)
  const previousTotal = Math.max(previousWindow.length, 1)

  const deltas: TagDelta[] = []
  const milestones: TrajectoryMilestone[] = []

  for (const tag of allTags) {
    const currentCount = currentTagCounts.get(tag) ?? 0
    const previousCount = previousTagCounts.get(tag) ?? 0

    const freqCurrent = currentCount / currentTotal
    const freqPrevious = previousCount / previousTotal
    const delta = freqCurrent - freqPrevious
    const significant = Math.abs(delta) >= SIGNIFICANCE_THRESHOLD

    deltas.push({
      tag,
      domain,
      frequencyPrevious: Math.round(freqPrevious * 1000) / 1000,
      frequencyCurrent: Math.round(freqCurrent * 1000) / 1000,
      delta: Math.round(delta * 1000) / 1000,
      significant,
    })

    // Build milestones from significant shifts
    if (significant) {
      milestones.push({
        tag,
        domain,
        direction: delta > 0 ? 'increasing' : delta < 0 ? 'decreasing' : 'stable',
        delta: Math.round(delta * 1000) / 1000,
        windowCurrentCount: currentCount,
        windowPreviousCount: previousCount,
      })
    }
  }

  // Sort deltas by absolute magnitude (most significant first)
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  milestones.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return { deltas, milestones }
}

// ---------------------------------------------------------------------------
// Snapshot ID generator
// ---------------------------------------------------------------------------

function generateSnapshotId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 10)
  return `traj_${ts}_${rand}`
}

// ---------------------------------------------------------------------------
// Cloud Function export
// ---------------------------------------------------------------------------

/**
 * Firebase Cloud Function (2nd Gen) — Trajectory Delta Calculator
 *
 * Triggered on every memory write (create/update/delete).
 * Computes rolling 30-day frequency deltas per domain and persists
 * trajectory snapshots for longitudinal visualization.
 *
 * Idempotent via eventId-based deduplication lock.
 */
export const calculateTrajectoryDeltas = onDocumentWritten(
  {
    document: 'psychologists/{psyId}/patients/{patId}/memories/{memId}',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined, {
      psyId: string
      patId: string
      memId: string
    }>,
  ) => {
    const { psyId, patId, memId } = event.params

    // ------------------------------------------------------------------
    // Guard: skip deletions (no after snapshot)
    // ------------------------------------------------------------------
    const afterData = event.data?.after?.data()
    if (!afterData) {
      console.log(`[trajectory] Skipping deletion event for memory ${memId}`)
      return
    }

    // ------------------------------------------------------------------
    // Idempotency: deduplicate via eventId
    // ------------------------------------------------------------------
    const eventId = event.id
    const lockAcquired = await acquireIdempotencyLock(psyId, patId, eventId)
    if (!lockAcquired) {
      console.log(`[trajectory] Duplicate event ${eventId} — skipping`)
      return
    }

    // ------------------------------------------------------------------
    // Extract domain from the written memory's ontology
    // ------------------------------------------------------------------
    const domain: string = afterData.ontology?.domain
    if (!domain) {
      console.log(`[trajectory] Memory ${memId} has no ontology.domain — skipping`)
      return
    }

    // ------------------------------------------------------------------
    // Read recent memories for the same domain
    // ------------------------------------------------------------------
    const memories = await readRecentMemories(psyId, patId, domain)

    if (memories.length === 0) {
      console.log(`[trajectory] No memories found for domain "${domain}" — skipping`)
      return
    }

    // ------------------------------------------------------------------
    // Compute frequency deltas
    // ------------------------------------------------------------------
    const now = new Date()
    const { deltas, milestones } = computeTagDeltas(memories, domain, now)

    if (deltas.length === 0) {
      console.log(`[trajectory] No tags found in windows — skipping snapshot`)
      return
    }

    // ------------------------------------------------------------------
    // Persist trajectory snapshot
    // ------------------------------------------------------------------
    const snapshotId = generateSnapshotId()
    const currentCutoff = new Date(now.getTime() - WINDOW_DAYS * MS_PER_DAY)
    const previousCutoff = new Date(now.getTime() - 2 * WINDOW_DAYS * MS_PER_DAY)

    const snapshot: TrajectorySnapshot = {
      snapshotId,
      patientId: patId,
      psychologistId: psyId,
      triggerMemoryId: memId,
      triggerDomain: domain,
      computedAt: FieldValue.serverTimestamp(),
      windowCurrentStart: currentCutoff,
      windowPreviousStart: previousCutoff,
      windowEnd: now,
      memoriesAnalyzed: memories.length,
      tagDeltas: deltas,
      milestones,
    }

    await db
      .doc(`psychologists/${psyId}/patients/${patId}/trajectory_snapshots/${snapshotId}`)
      .set(snapshot)

    console.log(
      `[trajectory] Snapshot ${snapshotId} persisted: ${deltas.length} tag deltas, ${milestones.length} milestones`,
    )
  },
)
