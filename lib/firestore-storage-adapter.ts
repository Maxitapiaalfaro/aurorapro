import 'server-only'

/**
 * Firestore Storage Adapter — Phase 2: Server-side Persistent Storage
 *
 * Replaces MemoryServerStorage with Firestore (firebase-admin) for durable,
 * cloud-persistent session storage. Implements the same interface so it can
 * be used as a drop-in replacement in ServerStorageAdapter.
 *
 * Multi-tenant Firestore hierarchy:
 *   psychologists/{psychologistId}/patients/{patientId}/sessions/{sessionId}
 *   psychologists/{psychologistId}/clinical_files/{fileId}
 *   psychologists/{psychologistId}/patients/{patientId}/fichas/{fichaId}
 *
 * When no patient selector exists yet, uses DEFAULT_PATIENT_ID = 'default_patient'.
 *
 * @module lib/firestore-storage-adapter
 * @version 1.0.0 — Phase 2: Firestore Migration
 */

import type {
  ChatState,
  ClinicalFile,
  FichaClinicaState,
  PaginationOptions,
  PaginatedResponse,
} from '@/types/clinical-types'
import { getAdminApp } from './firebase-admin-config'
import { getFirestore, type Firestore, type DocumentData, type Query } from 'firebase-admin/firestore'

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_PATIENT_ID = 'default_patient'

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
      console.log('✅ [Firestore] Initialized — Admin SDK persistent cloud storage active (credentials verified)')
    } catch (probeError: any) {
      const code = probeError?.code ?? probeError?.details ?? ''
      const msg = probeError?.message ?? ''
      if (code === 7 || msg.includes('PERMISSION_DENIED') || msg.includes('Missing or insufficient permissions')) {
        console.error(
          '🚨 [Firestore] PERMISSION_DENIED during connectivity probe!\n' +
          '   This means the Admin SDK credentials do not have Firestore access.\n' +
          '   ➤ Ensure the service account has the "Cloud Datastore User" IAM role.\n' +
          '   ➤ Verify FIREBASE_PROJECT_ID matches the Firestore project.\n' +
          '   ➤ Verify FIREBASE_CLIENT_EMAIL belongs to the correct project.\n' +
          '   ➤ Check that firebase-admin is in serverExternalPackages (next.config.mjs).\n' +
          '   Error:', msg
        )
      } else {
        // Non-permission errors (network, etc.) — log but don't block init
        console.warn('⚠️ [Firestore] Connectivity probe failed (non-critical):', msg)
      }
    }
  }

  async shutdown(): Promise<void> {
    // firebase-admin manages its own connection pool; nothing to close.
    this.initialized = false
    console.log('🧹 [Firestore] Shutdown (connection pool managed by firebase-admin)')
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

  async saveChatSession(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const userId = chatState.userId || 'anonymous'
    const patientId = this.resolvePatientId(chatState)
    const ref = this.sessionDocRef(userId, patientId, chatState.sessionId)

    // Ensure Date objects are plain Dates (not strings)
    chatState.metadata.createdAt = new Date(chatState.metadata.createdAt)
    chatState.metadata.lastUpdated = new Date(chatState.metadata.lastUpdated)

    // Store a flat _userId and _patientId at the doc root for index queries
    const docData: DocumentData = {
      ...chatState,
      _userId: userId,
      _patientId: patientId,
    }

    await ref.set(docData, { merge: true })
    console.log(`💾 [Firestore] Saved session: ${chatState.sessionId} (user: ${userId}, patient: ${patientId})`)
  }

  async loadChatSession(sessionId: string): Promise<ChatState | null> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    // We use a collectionGroup query because the caller might not know userId/patientId
    const snapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get()

    if (snapshot.empty) return null

    const data = snapshot.docs[0]!.data()
    return reviveDates(data) as ChatState
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

  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.initialized) throw new Error('[Firestore] Storage not initialized')

    const snapshot = await this.getDb()
      .collectionGroup('sessions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get()

    if (!snapshot.empty) {
      await snapshot.docs[0]!.ref.delete()
      console.log(`🗑️ [Firestore] Deleted session: ${sessionId}`)
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
    console.log(`💾 [Firestore] Saved clinical file: ${file.id} (owner: ${userId})`)
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
      console.log(`🗑️ [Firestore] Deleted clinical file: ${fileId}`)
    }
  }

  // ─── Fichas Clínicas ────────────────────────────────────────────────────

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
    console.log(`💾 [Firestore] Saved ficha clínica: ${ficha.fichaId} (patient: ${ficha.pacienteId})`)
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
    console.warn('⚠️ [Firestore] clearAllData() called — no-op in Firestore adapter for safety')
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
