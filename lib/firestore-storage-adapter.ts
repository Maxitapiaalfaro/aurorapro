import 'server-only'

/**
 * Firestore Storage Adapter — Phase 2.1: Messages Subcollection
 *
 * Server-side Firestore storage using firebase-admin SDK.
 * Messages are stored in a subcollection matching the client-side pattern
 * in firestore-client-storage.ts for real-time sync compatibility.
 *
 * Multi-tenant Firestore hierarchy:
 *   psychologists/{psychologistId}/patients/{patientId}/sessions/{sessionId}
 *   psychologists/{psychologistId}/patients/{patientId}/sessions/{sessionId}/messages/{messageId}
 *   psychologists/{psychologistId}/clinical_files/{fileId}
 *   psychologists/{psychologistId}/patients/{patientId}/fichas/{fichaId}
 *
 * When no patient selector exists yet, uses DEFAULT_PATIENT_ID = 'default_patient'.
 *
 * @module lib/firestore-storage-adapter
 * @version 2.0.0 — Messages subcollection (matches client-side pattern)
 */

import type {
  ChatState,
  ChatMessage,
  ClinicalFile,
  FichaClinicaState,
  PaginationOptions,
  PaginatedResponse,
} from '@/types/clinical-types'
import { getAdminApp } from './firebase-admin-config'
import { getFirestore, FieldValue, type Firestore, type DocumentData, type Query } from 'firebase-admin/firestore'
import { createLogger } from '@/lib/logger'
import { safeValidateSessionForFirestore } from '@/lib/session-schema'

const logger = createLogger('storage')

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_PATIENT_ID = 'default_patient'

/**
 * Firestore batch writes are limited to 500 operations.
 * We use this to chunk message writes in saveChatSession().
 */
const FIRESTORE_BATCH_LIMIT = 500

// ────────────────────────────────────────────────────────────────────────────
// Helpers: Date serialization
// Firestore stores JS Dates as Timestamps. We need to convert them back.
// ────────────────────────────────────────────────────────────────────────────

/** Convert Firestore Timestamps to JS Dates recursively in a plain object. */
function reviveDates(obj: any): any {
  if (obj == null) return obj
  // Firestore Timestamp has toDate()
  if (typeof obj?.toDate === 'function') return obj.toDate()
  if (obj instanceof Date) return obj
  if (Array.isArray(obj)) return obj.map(reviveDates)
  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = reviveDates(value)
    }
    return result
  }
  return obj
}

// ────────────────────────────────────────────────────────────────────────────
// FirestoreStorageAdapter
// ────────────────────────────────────────────────────────────────────────────

export class FirestoreStorageAdapter {
  private db: Firestore | null = null
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    const adminApp = getAdminApp()
    this.db = getFirestore(adminApp)

    // Force REST transport instead of gRPC.
    // Vercel's serverless proxy corrupts the HTTP/2 frames used by @grpc/grpc-js,
    // causing "9 FAILED_PRECONDITION" with empty details. REST over HTTP/1.1 is
    // fully compatible with Vercel's infrastructure.
    // ignoreUndefinedProperties strips undefined fields from documents before
    // sending them to Firestore, preventing "Cannot use undefined as a Firestore
    // value" errors from nested optional fields like clinicalContext.patientId.
    this.db.settings({ preferRest: true, ignoreUndefinedProperties: true })

    this.initialized = true

    // ── Connectivity probe: verify credentials work before first real write ──
    // This catches PERMISSION_DENIED early with actionable guidance.
    try {
      // A lightweight read of a non-existent document — costs nothing but proves auth works
      await this.db.collection('_health').doc('probe').get()
      logger.info('Initialized — Admin SDK persistent cloud storage active (credentials verified)')
    } catch (probeError: any) {
      const code = probeError?.code ?? probeError?.details ?? ''
      const msg = probeError?.message ?? ''
      if (code === 7 || msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
        logger.error(
          'PERMISSION_DENIED during connectivity probe! ' +
          'Ensure the service account has the "Cloud Datastore User" IAM role. ' +
          'Verify FIREBASE_PROJECT_ID matches the Firestore project. ' +
          'Verify FIREBASE_CLIENT_EMAIL belongs to the correct project. ' +
          'Check that firebase-admin is in serverExternalPackages (next.config.mjs).',
          probeError
        )
      } else {
        // Non-permission errors (network, etc.) — log but don't block init
        logger.warn('Connectivity probe failed (non-critical)', { error: msg })
      }
    }
  }

  async shutdown(): Promise<void> {
    // firebase-admin manages its own connection pool; nothing to close.
    this.initialized = false
    logger.info('Shutdown (connection pool managed by firebase-admin)')
  }

  // ─── Path helpers ────────────────────────────────────────────────────────

  private getDb(): Firestore {
    if (!this.db) throw new Error('[Firestore] Storage not initialized')
    return this.db
  }

  /** Resolve the patientId to use for a given ChatState. */
  private resolvePatientId(state: ChatState): string {
    return state.clinicalContext?.patientId || state.sessionMeta?.patient?.reference || DEFAULT_PATIENT_ID
  }

  /**
   * Sessions path: psychologists/{userId}/patients/{patientId}/sessions/{sessionId}
   */
  private sessionDocRef(userId: string, patientId: string, sessionId: string) {
    return this.getDb()
      .collection('psychologists')
      .doc(userId)
      .collection('patients')
      .doc(patientId)
      .collection('sessions')
      .doc(sessionId)
  }

  /**
   * Messages subcollection: .../sessions/{sessionId}/messages/{messageId}
   * Matches the client-side path in firestore-client-storage.ts.
   */
  private messagesColRef(userId: string, patientId: string, sessionId: string) {
    return this.sessionDocRef(userId, patientId, sessionId).collection('messages')
  }

  /**
   * Clinical files path: psychologists/{userId}/clinical_files/{fileId}
   */
  private clinicalFileDocRef(userId: string, fileId: string) {
    return this.getDb()
      .collection('psychologists')
      .doc(userId)
      .collection('clinical_files')
      .doc(fileId)
  }

  /**
   * Fichas path: psychologists/{userId}/patients/{patientId}/fichas/{fichaId}
   */
  private fichaDocRef(userId: string, patientId: string, fichaId: string) {
    return this.getDb()
      .collection('psychologists')
      .doc(userId)
      .collection('patients')
      .doc(patientId)
      .collection('fichas')
      .doc(fichaId)
  }

  // ─── Chat Sessions ──────────────────────────────────────────────────────

  /**
   * Add a single message to the messages subcollection.
   * O(1) per message — matches the client-side addMessage() pattern.
   *
   * The session doc's metadata.lastUpdated is touched via serverTimestamp()
   * so that real-time listeners and pagination queries reflect the change.
   */
  async addMessage(
    userId: string,
    patientId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const msgRef = this.messagesColRef(userId, patientId, sessionId).doc(message.id)
    await msgRef.set(message)

    // Touch the session's lastUpdated timestamp
    const sessRef = this.sessionDocRef(userId, patientId, sessionId)
    await sessRef.set(
      { metadata: { lastUpdated: FieldValue.serverTimestamp() } },
      { merge: true }
    )

    logger.debug('Added message to subcollection', {
      sessionId,
      messageId: message.id,
      role: message.role,
    })
  }

  /**
   * Save a chat session. Messages are written to the subcollection
   * (matching the client-side pattern) and stripped from the session document.
   */
  async saveChatSession(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const userId = chatState.userId || 'anonymous'
    const patientId = this.resolvePatientId(chatState)
    const ref = this.sessionDocRef(userId, patientId, chatState.sessionId)

    // Extract messages — they go to the subcollection, not inline
    const messages = chatState.history || []
    const { history: _history, ...sessionWithoutHistory } = chatState

    // Zod gatekeeper: validate & sanitize (converts undefined → null for Firestore)
    const rawDoc = { ...sessionWithoutHistory, _userId: userId, _patientId: patientId }
    const result = safeValidateSessionForFirestore(rawDoc)
    if (!result.success) {
      logger.error('Session payload failed Zod validation — aborting Firestore write', {
        sessionId: chatState.sessionId,
        zodErrors: result.error.flatten(),
      })
      throw new Error(`[Firestore] Session validation failed: ${result.error.message}`)
    }
    const docData: DocumentData = result.data

    await ref.set(docData, { merge: true })

    // Write messages to subcollection in batches (max 500 per batch)
    if (messages.length > 0) {
      const db = this.getDb()
      for (let i = 0; i < messages.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunk = messages.slice(i, i + FIRESTORE_BATCH_LIMIT)
        const batch = db.batch()
        for (const msg of chunk) {
          const msgRef = this.messagesColRef(userId, patientId, chatState.sessionId).doc(msg.id)
          batch.set(msgRef, msg)
        }
        await batch.commit()
      }
      logger.debug('Wrote messages to subcollection', {
        sessionId: chatState.sessionId,
        count: messages.length,
      })
    }

    logger.info('Saved session', {
      sessionId: chatState.sessionId,
      userId,
      patientId,
      messageCount: messages.length,
    })
  }

  /**
   * PERF: Save only session metadata (no messages rewrite).
   * Use this for metadata-only updates (sessionMeta, clinicalContext, activeAgent, etc.)
   * instead of saveChatSession which rewrites ALL messages.
   */
  async saveSessionMetadataOnly(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const userId = chatState.userId || 'anonymous'
    const patientId = this.resolvePatientId(chatState)
    const ref = this.sessionDocRef(userId, patientId, chatState.sessionId)

    const { history: _history, ...sessionWithoutHistory } = chatState

    // Zod gatekeeper: validate & sanitize (converts undefined → null for Firestore)
    const rawDoc = { ...sessionWithoutHistory, _userId: userId, _patientId: patientId }
    const result = safeValidateSessionForFirestore(rawDoc)
    if (!result.success) {
      logger.error('Session metadata failed Zod validation — aborting Firestore write', {
        sessionId: chatState.sessionId,
        zodErrors: result.error.flatten(),
      })
      throw new Error(`[Firestore] Session metadata validation failed: ${result.error.message}`)
    }
    const docData: DocumentData = result.data

    await ref.set(docData, { merge: true })

    logger.debug('Saved session metadata (no messages)', {
      sessionId: chatState.sessionId,
      userId,
      patientId,
    })
  }

  /**
   * Load a chat session with messages from the subcollection.
   * Falls back to inline history[] for legacy sessions that haven't been migrated.
   */
  async loadChatSession(sessionId: string): Promise<ChatState | null> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    // We use a collectionGroup query because the caller might not know userId/patientId
    const snapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get()

    if (snapshot.empty) return null

    const sessionDoc = snapshot.docs[0]!
    const data = reviveDates(sessionDoc.data()) as ChatState

    // Try loading messages from subcollection first
    const msgsSnapshot = await sessionDoc.ref
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .get()

    if (!msgsSnapshot.empty) {
      // Subcollection messages found — use them
      data.history = msgsSnapshot.docs.map(d => reviveDates(d.data()) as ChatMessage)
    } else if (!data.history || data.history.length === 0) {
      // No subcollection messages and no inline history
      data.history = []
    }
    // else: keep the inline history from the doc (legacy fallback)

    return data
  }

  async getUserSessions(userId: string): Promise<ChatState[]> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('_userId', '==', userId)
      .orderBy('metadata.lastUpdated', 'desc')
      .get()

    return snapshot.docs.map(doc => reviveDates(doc.data()) as ChatState)
  }

  async getUserSessionsPaginated(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResponse<ChatState>> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const { pageSize = 50, pageToken, sortBy = 'lastUpdated', sortOrder = 'desc' } = options

    const orderField = sortBy === 'lastUpdated' ? 'metadata.lastUpdated' : 'metadata.createdAt'

    let query = this.getDb()
      .collectionGroup('sessions')
      .where('_userId', '==', userId)
      .orderBy(orderField, sortOrder)
      .limit(pageSize + 1) // +1 to detect hasNextPage

    // Cursor-based pagination: use startAfter with the last doc snapshot
    if (pageToken) {
      try {
        const decoded = JSON.parse(Buffer.from(pageToken, 'base64').toString())
        if (decoded.lastValue) {
          query = query.startAfter(new Date(decoded.lastValue))
        }
      } catch {
        // Invalid token — start from beginning
      }
    }

    const snapshot = await query.get()
    const docs = snapshot.docs.map(doc => reviveDates(doc.data()) as ChatState)

    const hasNextPage = docs.length > pageSize
    const items = hasNextPage ? docs.slice(0, pageSize) : docs

    let nextPageToken: string | undefined
    if (hasNextPage && items.length > 0) {
      const lastItem = items[items.length - 1]!
      const lastValue = sortBy === 'lastUpdated'
        ? lastItem.metadata.lastUpdated.toISOString()
        : lastItem.metadata.createdAt.toISOString()
      nextPageToken = Buffer.from(JSON.stringify({ lastValue })).toString('base64')
    }

    // For totalCount we do a separate lightweight count query
    const countSnapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('_userId', '==', userId)
      .count()
      .get()
    const totalCount = countSnapshot.data().count

    return { items, nextPageToken, totalCount, hasNextPage }
  }

  /**
   * Delete a session and all its messages in the subcollection.
   */
  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get()

    if (!snapshot.empty) {
      const sessionRef = snapshot.docs[0]!.ref

      // Delete all messages in the subcollection first
      const msgsSnapshot = await sessionRef.collection('messages').get()
      if (!msgsSnapshot.empty) {
        const db = this.getDb()
        for (let i = 0; i < msgsSnapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
          const chunk = msgsSnapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)
          const batch = db.batch()
          chunk.forEach(d => batch.delete(d.ref))
          await batch.commit()
        }
      }

      // Delete the session document
      await sessionRef.delete()
      logger.info('Deleted session and messages', {
        sessionId,
        messagesDeleted: msgsSnapshot.empty ? 0 : msgsSnapshot.docs.length,
      })
    }
  }

  // ─── Prior Session Summaries (Progressive Context Loading) ──────────────

  /**
   * Load AI-generated summaries from a patient's prior sessions.
   * Returns only the sessionSummary field (not messages) for efficient context loading.
   *
   * Used in the sendMessage pipeline to provide the agent with prior session context
   * without reading all messages — the "progressive summary" pattern from Claude Code.
   *
   * @param userId - Psychologist UID
   * @param patientId - Patient ID
   * @param excludeSessionId - Current session to exclude from results
   * @param maxSessions - Maximum number of prior sessions to load (default: 5)
   */
  async loadPriorSessionSummaries(
    userId: string,
    patientId: string,
    excludeSessionId: string,
    maxSessions: number = 5,
  ): Promise<Array<{ sessionId: string; sessionSummary: any; lastUpdated: Date }>> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    try {
      const sessionsRef = this.getDb()
        .collection('psychologists')
        .doc(userId)
        .collection('patients')
        .doc(patientId)
        .collection('sessions')

      // Fetch recent sessions that have summaries, ordered by most recent first
      const snapshot = await sessionsRef
        .orderBy('metadata.lastUpdated', 'desc')
        .limit(maxSessions + 1) // +1 to account for current session
        .get()

      const results: Array<{ sessionId: string; sessionSummary: any; lastUpdated: Date }> = []

      for (const doc of snapshot.docs) {
        const data = doc.data()
        const sessionId = data.sessionId || doc.id
        if (sessionId === excludeSessionId) continue
        if (!data.sessionSummary) continue

        results.push({
          sessionId,
          sessionSummary: data.sessionSummary,
          lastUpdated: data.metadata?.lastUpdated?.toDate?.() ?? new Date(),
        })

        if (results.length >= maxSessions) break
      }

      logger.debug('Loaded prior session summaries', {
        userId,
        patientId,
        count: results.length,
      })

      return results
    } catch (error) {
      logger.warn('Failed to load prior session summaries', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  // ─── Clinical Files ─────────────────────────────────────────────────────

  async saveClinicalFile(file: ClinicalFile): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    // Resolve the owning userId from the linked session when available.
    // This preserves multi-tenant isolation under the psychologist's subtree.
    let userId = '_unresolved'
    if (file.sessionId) {
      const session = await this.loadChatSession(file.sessionId)
      if (session?.userId) userId = session.userId
    }

    const ref = this.clinicalFileDocRef(userId, file.id)

    const docData: DocumentData = {
      ...file,
      _ownerId: userId,
      uploadDate: new Date(file.uploadDate),
    }

    await ref.set(docData, { merge: true })
    logger.info('Saved clinical file', { fileId: file.id, userId })
  }

  async getClinicalFiles(sessionId?: string): Promise<ClinicalFile[]> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    let query: Query = this.getDb()
      .collectionGroup('clinical_files')

    if (sessionId) {
      query = query.where('sessionId', '==', sessionId)
    }

    const snapshot = await query.get()
    return snapshot.docs.map(doc => reviveDates(doc.data()) as ClinicalFile)
  }

  async getClinicalFileById(fileId: string): Promise<ClinicalFile | null> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('clinical_files')
      .where('id', '==', fileId)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return reviveDates(snapshot.docs[0]!.data()) as ClinicalFile
  }

  async deleteClinicalFile(fileId: string): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('clinical_files')
      .where('id', '==', fileId)
      .limit(1)
      .get()

    if (!snapshot.empty) {
      await snapshot.docs[0]!.ref.delete()
      logger.info('Deleted clinical file', { fileId })
    }
  }

  // ─── Fichas Clinicas ────────────────────────────────────────────────────

  async saveFichaClinica(ficha: FichaClinicaState): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    // Fichas belong to a patient under a psychologist.
    // The StorageAdapter interface doesn't pass userId, so we store with
    // _unresolved until the future patient-selector feature provides
    // psychologistId context. collectionGroup queries work regardless.
    const userId = '_unresolved'
    const ref = this.fichaDocRef(userId, ficha.pacienteId, ficha.fichaId)

    const docData: DocumentData = {
      ...ficha,
      _ownerId: userId,
      ultimaActualizacion: new Date(ficha.ultimaActualizacion),
    }

    await ref.set(docData, { merge: true })
    logger.info('Saved ficha clinica', { fichaId: ficha.fichaId, pacienteId: ficha.pacienteId })
  }

  async getFichaClinicaById(fichaId: string): Promise<FichaClinicaState | null> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('fichas')
      .where('fichaId', '==', fichaId)
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return reviveDates(snapshot.docs[0]!.data()) as FichaClinicaState
  }

  async getFichasClinicasByPaciente(pacienteId: string): Promise<FichaClinicaState[]> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('fichas')
      .where('pacienteId', '==', pacienteId)
      .orderBy('ultimaActualizacion', 'desc')
      .get()

    return snapshot.docs.map(doc => reviveDates(doc.data()) as FichaClinicaState)
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  async clearAllData(): Promise<void> {
    // Safety: in production, this should be restricted.
    // For now, log a warning and no-op.
    logger.warn('clearAllData() called — no-op in Firestore adapter for safety')
  }

  getStorageStats() {
    return {
      hotCacheSize: 0,
      hotCacheLimit: 0,
      cacheUtilization: 0,
      initialized: this.initialized,
      backend: 'firestore',
    }
  }
}
