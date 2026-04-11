"use client"

/**
 * Local Data Controls Hook — Aurora Local-First UX
 *
 * Provides functions and metadata for managing locally cached clinical data.
 * Since Aurora operates in a local-first model, sensitive PHI resides in
 * the device's IndexedDB via Firestore's persistent cache. This hook
 * exposes controls to:
 *
 * - Estimate local cache size
 * - Clear Firestore IndexedDB cache
 * - Terminate the Firestore connection and re-initialize
 *
 * IMPORTANT: Clearing the local cache does NOT delete data from the server.
 * It only removes the device-local copy, requiring a fresh sync on next load.
 *
 * @module hooks/use-local-data-controls
 */

import { useState, useCallback } from "react"
import { clearIndexedDbPersistence, terminate } from "firebase/firestore"
import { db } from "@/lib/firebase-config"
import { createLogger } from "@/lib/logger"

const logger = createLogger("system")

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface LocalDataControls {
  /** Estimated cache size in bytes (null if unavailable) */
  estimatedCacheSize: number | null
  /** Whether the clear operation is in progress */
  isClearing: boolean
  /** Last error message, if any */
  error: string | null
  /** Clear all locally cached Firestore data. Requires page reload. */
  clearLocalCache: () => Promise<boolean>
  /** Estimate the size of locally cached data */
  estimateCacheSize: () => Promise<void>
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

export function useLocalDataControls(): LocalDataControls {
  const [estimatedCacheSize, setEstimatedCacheSize] = useState<number | null>(null)
  const [isClearing, setIsClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Estimate cache size via Storage Manager API ──────────────────────
  const estimateCacheSize = useCallback(async () => {
    try {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        setEstimatedCacheSize(estimate.usage ?? null)
      } else {
        setEstimatedCacheSize(null)
      }
    } catch {
      logger.warn("⚠️ [LocalData] Could not estimate cache size")
      setEstimatedCacheSize(null)
    }
  }, [])

  // ── Clear Firestore IndexedDB persistence ────────────────────────────
  const clearLocalCache = useCallback(async (): Promise<boolean> => {
    setIsClearing(true)
    setError(null)

    try {
      // Step 1: Terminate the Firestore instance to release IndexedDB locks
      await terminate(db)

      // Step 2: Clear all IndexedDB persistence data
      await clearIndexedDbPersistence(db)

      logger.info("✅ [LocalData] Local cache cleared successfully")

      // Step 3: Force a page reload to re-initialize Firestore
      // This is required because Firestore cannot be re-initialized after terminate
      window.location.reload()

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido al limpiar caché"
      logger.error("❌ [LocalData] Failed to clear cache:", err)
      setError(message)
      setIsClearing(false)
      return false
    }
  }, [])

  return {
    estimatedCacheSize,
    isClearing,
    error,
    clearLocalCache,
    estimateCacheSize,
  }
}
