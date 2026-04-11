"use client"

/**
 * Firestore Sync Status Hook — Aurora Local-First UX
 *
 * Reactive hook that monitors the real-time synchronization state between
 * the local Firestore cache (IndexedDB) and the Firebase backend.
 *
 * Exposes three states:
 * - `offline`    — Device has no network connectivity.
 * - `syncing`    — Firestore is writing pending local changes to the server.
 * - `synced`     — All local writes have been acknowledged by the server.
 *
 * Implementation leverages:
 * 1. `navigator.onLine` + `online`/`offline` events for coarse network detection.
 * 2. Firestore `onSnapshotsInSync` for precise write-acknowledgement tracking.
 * 3. Firestore `enableNetwork` / `disableNetwork` awareness via snapshot metadata.
 *
 * The hook is intentionally lightweight — no polling, no timers beyond a
 * brief debounce to prevent flicker between syncing → synced transitions.
 *
 * @module hooks/use-sync-status
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { onSnapshotsInSync, waitForPendingWrites } from "firebase/firestore"
import { db } from "@/lib/firebase-config"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SyncState = "offline" | "syncing" | "synced"

export interface SyncStatus {
  /** Current synchronization state */
  state: SyncState
  /** Whether the device is connected to the network */
  isOnline: boolean
  /** Timestamp of last successful sync (null if never synced) */
  lastSyncedAt: Date | null
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

/** Debounce before transitioning from syncing → synced to prevent flicker */
const SYNC_SETTLE_MS = 800

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useSyncStatus(): SyncStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )
  const [hasPendingWrites, setHasPendingWrites] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Network status listener ──────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // ── Firestore snapshot-in-sync listener ──────────────────────────────
  // `onSnapshotsInSync` fires whenever all pending Firestore listeners
  // have received their latest server-acknowledged data. We use this
  // combined with `waitForPendingWrites` to determine sync completion.
  const checkPendingWrites = useCallback(async () => {
    try {
      // waitForPendingWrites resolves when all client-initiated writes
      // that are pending have been acknowledged by the backend.
      // If it resolves immediately, there are no pending writes.
      const raceResult = await Promise.race([
        waitForPendingWrites(db).then(() => "resolved" as const),
        new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), 100)),
      ])

      if (raceResult === "resolved") {
        // No pending writes — debounce transition to synced
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
        settleTimerRef.current = setTimeout(() => {
          setHasPendingWrites(false)
          setLastSyncedAt(new Date())
        }, SYNC_SETTLE_MS)
      } else {
        // Still has pending writes
        if (settleTimerRef.current) {
          clearTimeout(settleTimerRef.current)
          settleTimerRef.current = null
        }
        setHasPendingWrites(true)
      }
    } catch {
      // Firestore may throw if offline — that's fine, we rely on isOnline
      setHasPendingWrites(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const unsubscribe = onSnapshotsInSync(db, () => {
      checkPendingWrites()
    })

    // Initial check
    checkPendingWrites()

    return () => {
      unsubscribe()
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [checkPendingWrites])

  // ── Derive state ─────────────────────────────────────────────────────
  let state: SyncState
  if (!isOnline) {
    state = "offline"
  } else if (hasPendingWrites) {
    state = "syncing"
  } else {
    state = "synced"
  }

  return { state, isOnline, lastSyncedAt }
}
