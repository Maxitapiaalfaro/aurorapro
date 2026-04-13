/**
 * Firestore Client Storage — Aurora
 *
 * Client-side Firestore operations using the Firebase JS SDK.
 * Replaces IndexedDB-based clinical-context-storage.ts and patient-persistence.ts
 * with Firestore's native offline persistence (already configured in firebase-config.ts).
 *
 * Design:
 * - Pure exported async functions (no class, no singleton, no adapter pattern)
 * - Every function takes `psychologistId` as its first parameter
 * - Messages stored as individual documents in a subcollection (O(1) writes)
 * - `onSnapshot` subscriptions for real-time data
 *
 * Firestore path hierarchy:
 *   psychologists/{psychologistId}/patients/{patientId}/sessions/{sessionId}
 *   psychologists/{psychologistId}/patients/{patientId}/sessions/{sessionId}/messages/{messageId}
 *   psychologists/{psychologistId}/patients/{patientId}/fichas/{fichaId}
 *   psychologists/{psychologistId}/clinical_files/{fileId}
 *   psychologists/{psychologistId}/patients/{patientId}  (patient doc)
 *
 * @module lib/firestore-client-storage
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  collectionGroup,
  writeBatch,
  onSnapshot,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase-config'
import type {
  ChatState,
  ChatMessage,
  ClinicalFile,
  ClinicalDocument,
  FichaClinicaState,
  PatientRecord,
  PaginationOptions,
  PaginatedResponse,
} from '@/types/clinical-types'
import { safeValidateSessionForFirestore } from '@/lib/session-schema'

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_PATIENT_ID = 'default_patient'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Resolve patientId from a ChatState (or partial). */
export function resolvePatientId(state: Partial<ChatState>): string {
  return (
    state.clinicalContext?.patientId ||
    state.sessionMeta?.patient?.reference ||
    DEFAULT_PATIENT_ID
  )
}

/** Convert Firestore Timestamps to JS Dates recursively. */
function reviveDates(obj: any): any {
  if (obj == null) return obj
  if (obj instanceof Timestamp) return obj.toDate()
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

/** Serialize Dates to Firestore Timestamps for storage. */
function serializeDates(obj: any): any {
  if (obj == null) return obj
  if (obj instanceof Date) return Timestamp.fromDate(obj)
  if (obj instanceof Timestamp) return obj
  if (Array.isArray(obj)) return obj.map(serializeDates)
  if (typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeDates(value)
    }
    return result
  }
  return obj
}

// ────────────────────────────────────────────────────────────────────────────
// Path references
// ────────────────────────────────────────────────────────────────────────────

function sessionRef(psychologistId: string, patientId: string, sessionId: string) {
  return doc(db, 'psychologists', psychologistId, 'patients', patientId, 'sessions', sessionId)
}

function messagesCol(psychologistId: string, patientId: string, sessionId: string) {
  return collection(db, 'psychologists', psychologistId, 'patients', patientId, 'sessions', sessionId, 'messages')
}

function patientRef(psychologistId: string, patientId: string) {
  return doc(db, 'psychologists', psychologistId, 'patients', patientId)
}

function patientsCol(psychologistId: string) {
  return collection(db, 'psychologists', psychologistId, 'patients')
}

function fichaRef(psychologistId: string, patientId: string, fichaId: string) {
  return doc(db, 'psychologists', psychologistId, 'patients', patientId, 'fichas', fichaId)
}

function fichasCol(psychologistId: string, patientId: string) {
  return collection(db, 'psychologists', psychologistId, 'patients', patientId, 'fichas')
}

function clinicalFileRef(psychologistId: string, fileId: string) {
  return doc(db, 'psychologists', psychologistId, 'clinical_files', fileId)
}

function clinicalFilesCol(psychologistId: string) {
  return collection(db, 'psychologists', psychologistId, 'clinical_files')
}

function documentsCol(psychologistId: string, patientId: string, sessionId: string) {
  return collection(db, 'psychologists', psychologistId, 'patients', patientId, 'sessions', sessionId, 'documents')
}

function documentRef(psychologistId: string, patientId: string, sessionId: string, documentId: string) {
  return doc(db, 'psychologists', psychologistId, 'patients', patientId, 'sessions', sessionId, 'documents', documentId)
}

// ────────────────────────────────────────────────────────────────────────────
// Sessions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Save session metadata (without history). Use `addMessage` for individual messages.
 */
export async function saveSessionMetadata(
  psychologistId: string,
  patientId: string,
  session: ChatState
): Promise<void> {
  const ref = sessionRef(psychologistId, patientId, session.sessionId)
  // Strip history — messages go in subcollection
  const { history, ...sessionWithoutHistory } = session

  // Zod gatekeeper: validate & sanitize (converts undefined → null for Firestore)
  const rawDoc = {
    ...sessionWithoutHistory,
    _userId: psychologistId,
    _patientId: patientId,
    metadata: {
      ...session.metadata,
      lastUpdated: new Date(),
    },
  }
  const result = safeValidateSessionForFirestore(rawDoc)
  if (!result.success) {
    console.error('[Firestore] Session payload failed Zod validation — aborting write', {
      sessionId: session.sessionId,
      zodErrors: result.error.flatten(),
    })
    throw new Error(`[Firestore] Session validation failed: ${result.error.message}`)
  }

  const data = serializeDates(result.data)
  await setDoc(ref, data, { merge: true })
}

/**
 * Add a single message to the messages subcollection.
 * O(1) per message instead of rewriting the entire session.
 */
export async function addMessage(
  psychologistId: string,
  patientId: string,
  sessionId: string,
  message: ChatMessage
): Promise<void> {
  const msgRef = doc(messagesCol(psychologistId, patientId, sessionId), message.id)
  const sessRef = sessionRef(psychologistId, patientId, sessionId)
  await Promise.all([
    setDoc(msgRef, serializeDates(message)),
    setDoc(sessRef, { metadata: { lastUpdated: Timestamp.now() } }, { merge: true })
  ])
}

/**
 * Load a session with all its messages, combining them into a ChatState.
 * Falls back to inline `history[]` for legacy sessions that haven't been migrated.
 */
export async function loadSessionWithMessages(
  psychologistId: string,
  patientId: string,
  sessionId: string
): Promise<ChatState | null> {
  const sessDoc = await getDoc(sessionRef(psychologistId, patientId, sessionId))
  if (!sessDoc.exists()) return null

  const data = reviveDates(sessDoc.data()) as ChatState & { _userId?: string; _patientId?: string }

  // Try subcollection messages first
  const msgsSnapshot = await getDocs(
    query(messagesCol(psychologistId, patientId, sessionId), orderBy('timestamp', 'asc'))
  )

  if (!msgsSnapshot.empty) {
    data.history = msgsSnapshot.docs.map(d => reviveDates(d.data()) as ChatMessage)
  } else if (!data.history || data.history.length === 0) {
    // No subcollection messages and no inline history
    data.history = []
  }
  // else: keep the inline history from the doc (legacy fallback)

  return data
}

/**
 * Find a session by ID when patientId is unknown.
 * Uses collectionGroup query on 'sessions'.
 */
export async function findSessionById(
  psychologistId: string,
  sessionId: string
): Promise<{ session: ChatState; patientId: string } | null> {
  const q = query(
    collectionGroup(db, 'sessions'),
    where('_userId', '==', psychologistId),
    where('sessionId', '==', sessionId),
    limit(1)
  )
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null

  const docData = snapshot.docs[0]!
  const data = reviveDates(docData.data()) as ChatState & { _patientId?: string }
  const patientId = data._patientId || DEFAULT_PATIENT_ID

  // Load messages from subcollection
  const msgsRef = collection(docData.ref, 'messages')
  const msgsSnapshot = await getDocs(query(msgsRef, orderBy('timestamp', 'asc')))
  if (!msgsSnapshot.empty) {
    data.history = msgsSnapshot.docs.map(d => reviveDates(d.data()) as ChatMessage)
  } else if (!data.history) {
    data.history = []
  }

  return { session: data, patientId }
}

/** Session summary for list views (no messages loaded). */
export interface SessionSummary {
  sessionId: string
  userId: string
  patientId: string
  title?: string
  mode: string
  activeAgent: string
  lastUpdated: Date
  createdAt: Date
  messageCount?: number
  sessionMeta?: ChatState['sessionMeta']
}

/**
 * List sessions for a psychologist with pagination.
 * Returns metadata only (no messages).
 */
export async function listUserSessions(
  psychologistId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<SessionSummary>> {
  const { pageSize = 50, sortBy = 'lastUpdated', sortOrder = 'desc' } = options

  const orderField = sortBy === 'lastUpdated' ? 'metadata.lastUpdated' : 'metadata.createdAt'

  let q = query(
    collectionGroup(db, 'sessions'),
    where('_userId', '==', psychologistId),
    orderBy(orderField, sortOrder),
    limit(pageSize + 1)
  )

  if (options.pageToken) {
    try {
      const decoded = JSON.parse(atob(options.pageToken))
      if (decoded.lastValue) {
        q = query(
          collectionGroup(db, 'sessions'),
          where('_userId', '==', psychologistId),
          orderBy(orderField, sortOrder),
          startAfter(Timestamp.fromDate(new Date(decoded.lastValue))),
          limit(pageSize + 1)
        )
      }
    } catch {
      // Invalid token — start from beginning
    }
  }

  const snapshot = await getDocs(q)
  const allDocs = snapshot.docs.map(d => {
    const raw = reviveDates(d.data()) as ChatState & { _patientId?: string }
    return {
      sessionId: raw.sessionId,
      userId: raw.userId,
      patientId: raw._patientId || raw.clinicalContext?.patientId || DEFAULT_PATIENT_ID,
      title: raw.title,
      mode: raw.mode,
      activeAgent: raw.activeAgent,
      lastUpdated: raw.metadata?.lastUpdated ?? new Date(),
      createdAt: raw.metadata?.createdAt ?? new Date(),
      messageCount: raw.history?.length,
      sessionMeta: raw.sessionMeta,
    } satisfies SessionSummary
  })

  // Deduplicate by sessionId — collectionGroup may return the same session
  // from multiple paths (e.g., client wrote to patients/{pid}/sessions/{sid}
  // and server wrote to patients/default_patient/sessions/{sid}).
  // Keep the entry with the most recent lastUpdated.
  const seen = new Map<string, SessionSummary>()
  for (const doc of allDocs) {
    const existing = seen.get(doc.sessionId)
    if (!existing || doc.lastUpdated > existing.lastUpdated) {
      seen.set(doc.sessionId, doc)
    }
  }
  const docs = Array.from(seen.values())

  const hasNextPage = docs.length > pageSize
  const items = hasNextPage ? docs.slice(0, pageSize) : docs

  let nextPageToken: string | undefined
  if (hasNextPage && items.length > 0) {
    const lastItem = items[items.length - 1]!
    const lastValue = sortBy === 'lastUpdated'
      ? lastItem.lastUpdated.toISOString()
      : lastItem.createdAt.toISOString()
    nextPageToken = btoa(JSON.stringify({ lastValue }))
  }

  return {
    items,
    nextPageToken,
    totalCount: items.length, // Exact count requires separate query; approximation is fine for client
    hasNextPage,
  }
}

/**
 * Delete a session and all its messages.
 */
export async function deleteSession(
  psychologistId: string,
  patientId: string,
  sessionId: string
): Promise<void> {
  // Delete all messages in subcollection first
  const msgsSnapshot = await getDocs(messagesCol(psychologistId, patientId, sessionId))
  if (!msgsSnapshot.empty) {
    const batch = writeBatch(db)
    msgsSnapshot.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  // Delete session doc
  await deleteDoc(sessionRef(psychologistId, patientId, sessionId))
}

/**
 * Subscribe to messages in real-time via onSnapshot.
 * Callback receives the full ordered message array on every change.
 */
export function subscribeToMessages(
  psychologistId: string,
  patientId: string,
  sessionId: string,
  callback: (messages: ChatMessage[], hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(
    messagesCol(psychologistId, patientId, sessionId),
    orderBy('timestamp', 'asc')
  )
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const messages = snapshot.docs.map(d => reviveDates(d.data()) as ChatMessage)
    const hasPendingWrites = snapshot.docs.some(d => d.metadata.hasPendingWrites)
    callback(messages, hasPendingWrites)
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Patients
// ────────────────────────────────────────────────────────────────────────────

export async function savePatient(
  psychologistId: string,
  patient: PatientRecord
): Promise<void> {
  const ref = patientRef(psychologistId, patient.id)
  const data = serializeDates({
    ...patient,
    updatedAt: new Date(),
    // Ensure new patients are not marked as deleted
    isDeleted: patient.isDeleted ?? false,
  })
  await setDoc(ref, data, { merge: true })
}

export async function loadPatient(
  psychologistId: string,
  patientId: string
): Promise<PatientRecord | null> {
  const snap = await getDoc(patientRef(psychologistId, patientId))
  if (!snap.exists()) return null
  return reviveDates(snap.data()) as PatientRecord
}

export async function getAllPatients(
  psychologistId: string
): Promise<PatientRecord[]> {
  // Fetch all patients and filter client-side: Firestore where('isDeleted','==',false)
  // excludes documents where the field doesn't exist (all historical patients).
  const q = query(
    patientsCol(psychologistId),
    orderBy('updatedAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map(d => reviveDates(d.data()) as PatientRecord)
    .filter(p => p.isDeleted !== true)
}

export async function deletePatient(
  psychologistId: string,
  patientId: string
): Promise<void> {
  // Soft delete: Mark patient as deleted instead of removing document
  // This prevents cascade deletion of conversations which are subcollections
  const ref = patientRef(psychologistId, patientId)
  await setDoc(ref, {
    isDeleted: true,
    deletedAt: Timestamp.fromDate(new Date())
  }, { merge: true })
}

/**
 * Client-side search (data set is small per psychologist).
 */
export async function searchPatients(
  psychologistId: string,
  searchQuery: string
): Promise<PatientRecord[]> {
  const all = await getAllPatients(psychologistId)
  const term = searchQuery.toLowerCase().trim()
  if (!term) return all

  return all.filter(p =>
    p.displayName.toLowerCase().includes(term) ||
    p.tags?.some(t => t.toLowerCase().includes(term)) ||
    p.notes?.toLowerCase().includes(term)
  )
}

export function subscribeToPatients(
  psychologistId: string,
  callback: (patients: PatientRecord[], hasPendingWrites: boolean) => void
): Unsubscribe {
  // No Firestore-level isDeleted filter: documents without the field (historical
  // patients) would be excluded. Filter client-side instead.
  const q = query(
    patientsCol(psychologistId),
    orderBy('updatedAt', 'desc')
  )
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const patients = snapshot.docs
      .map(d => reviveDates(d.data()) as PatientRecord)
      .filter(p => p.isDeleted !== true)
    const hasPendingWrites = snapshot.docs.some(d => d.metadata.hasPendingWrites)
    callback(patients, hasPendingWrites)
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Fichas Clínicas
// ────────────────────────────────────────────────────────────────────────────

export async function saveFicha(
  psychologistId: string,
  patientId: string,
  ficha: FichaClinicaState
): Promise<void> {
  const ref = fichaRef(psychologistId, patientId, ficha.fichaId)
  const data = serializeDates({
    ...ficha,
    _ownerId: psychologistId,
    ultimaActualizacion: new Date(),
  })
  await setDoc(ref, data, { merge: true })
}

export async function loadFicha(
  psychologistId: string,
  patientId: string,
  fichaId: string
): Promise<FichaClinicaState | null> {
  const snap = await getDoc(fichaRef(psychologistId, patientId, fichaId))
  if (!snap.exists()) return null
  return reviveDates(snap.data()) as FichaClinicaState
}

export async function getFichasByPatient(
  psychologistId: string,
  patientId: string
): Promise<FichaClinicaState[]> {
  const q = query(fichasCol(psychologistId, patientId), orderBy('ultimaActualizacion', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => reviveDates(d.data()) as FichaClinicaState)
}

export async function deleteFicha(
  psychologistId: string,
  patientId: string,
  fichaId: string
): Promise<void> {
  await deleteDoc(fichaRef(psychologistId, patientId, fichaId))
}

export function subscribeToFichas(
  psychologistId: string,
  patientId: string,
  callback: (fichas: FichaClinicaState[], hasPendingWrites: boolean) => void
): Unsubscribe {
  const q = query(fichasCol(psychologistId, patientId), orderBy('ultimaActualizacion', 'desc'))
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const fichas = snapshot.docs.map(d => reviveDates(d.data()) as FichaClinicaState)
    const hasPendingWrites = snapshot.docs.some(d => d.metadata.hasPendingWrites)
    callback(fichas, hasPendingWrites)
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Clinical Files
// ────────────────────────────────────────────────────────────────────────────

export async function saveClinicalFile(
  psychologistId: string,
  file: ClinicalFile
): Promise<void> {
  const ref = clinicalFileRef(psychologistId, file.id)
  const data = serializeDates({
    ...file,
    _ownerId: psychologistId,
    uploadDate: new Date(file.uploadDate),
  })
  await setDoc(ref, data, { merge: true })
}

export async function getClinicalFile(
  psychologistId: string,
  fileId: string
): Promise<ClinicalFile | null> {
  const snap = await getDoc(clinicalFileRef(psychologistId, fileId))
  if (!snap.exists()) return null
  return reviveDates(snap.data()) as ClinicalFile
}

export async function getClinicalFilesBySession(
  psychologistId: string,
  sessionId: string
): Promise<ClinicalFile[]> {
  const q = query(clinicalFilesCol(psychologistId), where('sessionId', '==', sessionId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => reviveDates(d.data()) as ClinicalFile)
}

export async function deleteClinicalFile(
  psychologistId: string,
  fileId: string
): Promise<void> {
  await deleteDoc(clinicalFileRef(psychologistId, fileId))
}

// ────────────────────────────────────────────────────────────────────────────
// Clinical Documents (per-session subcollection)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Save (create or overwrite) a clinical document to the session's documents subcollection.
 */
export async function saveClinicalDocument(
  psychologistId: string,
  patientId: string,
  sessionId: string,
  document: ClinicalDocument
): Promise<void> {
  const ref = documentRef(psychologistId, patientId, sessionId, document.id)
  await setDoc(ref, serializeDates(document), { merge: true })
}

/**
 * Update the markdown content of an existing document (bumps version + updatedAt).
 */
export async function updateClinicalDocumentContent(
  psychologistId: string,
  patientId: string,
  sessionId: string,
  documentId: string,
  markdown: string,
  version: number
): Promise<void> {
  const ref = documentRef(psychologistId, patientId, sessionId, documentId)
  await setDoc(ref, {
    markdown,
    version,
    updatedAt: Timestamp.now(),
  }, { merge: true })
}

/**
 * Load all clinical documents for a session, ordered by creation date.
 */
export async function loadSessionDocuments(
  psychologistId: string,
  patientId: string,
  sessionId: string
): Promise<ClinicalDocument[]> {
  const q = query(
    documentsCol(psychologistId, patientId, sessionId),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => reviveDates(d.data()) as ClinicalDocument)
}

/**
 * Load a single clinical document by ID.
 */
export async function loadClinicalDocument(
  psychologistId: string,
  patientId: string,
  sessionId: string,
  documentId: string
): Promise<ClinicalDocument | null> {
  const snap = await getDoc(documentRef(psychologistId, patientId, sessionId, documentId))
  if (!snap.exists()) return null
  return reviveDates(snap.data()) as ClinicalDocument
}

// ────────────────────────────────────────────────────────────────────────────
// Clinical Memories (client-side read for local-first ranking)
// ────────────────────────────────────────────────────────────────────────────

import type { ClinicalMemory } from '@/types/memory-types'

/**
 * Read all active clinical memories for a patient.
 * Used client-side for local-first memory ranking before sending messages.
 * Path: psychologists/{uid}/patients/{pid}/memories
 */
export async function getActivePatientMemories(
  psychologistId: string,
  patientId: string,
): Promise<ClinicalMemory[]> {
  const memoriesCol = collection(db, 'psychologists', psychologistId, 'patients', patientId, 'memories')
  const q = query(memoriesCol, where('isActive', '==', true))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => {
    const data = d.data()
    return {
      ...data,
      memoryId: data.memoryId || d.id,
      createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(data.updatedAt),
    } as ClinicalMemory
  })
}
