import 'server-only'

import type { ChatState, ChatMessage, ClinicalFile, FichaClinicaState } from "@/types/clinical-types"


import { createLogger } from '@/lib/logger'
const logger = createLogger('storage')

// Dynamic import para evitar que better-sqlite3 se incluya en el bundle del cliente
type HIPAAStorage = any

/**
 * Adaptador de almacenamiento para el servidor con persistencia.
 *
 * Selección de backend:
 * - Firebase credentials available → FirestoreStorageAdapter (consistent with client reads)
 * - No Firebase credentials → HIPAACompliantStorage (SQLite for offline dev)
 * - Fallback if Firestore init fails on Vercel → MemoryServerStorage (ephemeral)
 * - Fallback if Firestore init fails locally → HIPAACompliantStorage (SQLite)
 */
export class ServerStorageAdapter {
  private storage: HIPAAStorage | null = null
  private initialized = false

  constructor() {
    // Storage se inicializa de forma lazy en initialize()
  }

  private async ensureStorage(): Promise<HIPAAStorage> {
    if (!this.storage) {
      // Always prefer Firestore when Firebase admin credentials are available.
      // The client-side reads from Firestore directly, so the server MUST write
      // to the same backend to maintain consistency.
      const hasFirebaseCredentials = !!(
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
      )

      if (hasFirebaseCredentials) {
        try {
          logger.info('🔧 [ServerStorageAdapter] Creating FirestoreStorageAdapter...')
          const { FirestoreStorageAdapter } = await import('./firestore-storage-adapter')
          this.storage = new FirestoreStorageAdapter()
          logger.info('✅ [ServerStorageAdapter] FirestoreStorageAdapter instance created')
        } catch (error) {
          // Graceful fallback: if firebase-admin fails, fall back to SQLite (local dev)
          // or MemoryServerStorage (serverless without disk)
          logger.warn('⚠️ [ServerStorageAdapter] FirestoreStorageAdapter failed, falling back:', error)
          const isVercel = !!process.env.VERCEL || typeof process.env.VERCEL_ENV !== 'undefined'
          if (isVercel) {
            const { MemoryServerStorage } = await import('./server-storage-memory')
            this.storage = new MemoryServerStorage()
            logger.info('✅ [ServerStorageAdapter] MemoryServerStorage fallback instance created')
          } else {
            const { HIPAACompliantStorage } = await import('./hipaa-compliant-storage')
            this.storage = new HIPAACompliantStorage()
            logger.info('✅ [ServerStorageAdapter] HIPAACompliantStorage fallback instance created')
          }
        }
      } else {
        // No Firebase credentials — use local SQLite for development
        logger.info('🔧 [ServerStorageAdapter] No Firebase credentials, using HIPAACompliantStorage (SQLite)...')
        const { HIPAACompliantStorage } = await import('./hipaa-compliant-storage')
        this.storage = new HIPAACompliantStorage()
        logger.info('✅ [ServerStorageAdapter] HIPAACompliantStorage instance created')
      }
    }
    return this.storage
  }

  async initialize(): Promise<void> {
    logger.info('🔧 [ServerStorageAdapter] initialize() called')
    if (this.initialized) {
      logger.info('✅ [ServerStorageAdapter] Already initialized, skipping')
      return
    }

    logger.info('🔧 [ServerStorageAdapter] Ensuring storage...')
    const storage = await this.ensureStorage()
    logger.info('🔧 [ServerStorageAdapter] Calling storage.initialize()...')
    await storage.initialize()
    this.initialized = true

    const backendName = storage.constructor?.name || 'unknown'
    logger.info(`✅ [ServerStorageAdapter] Initialized (backend: ${backendName})`)
  }

  async saveChatSession(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")

    const storage = await this.ensureStorage()
    const updatedState = {
      ...chatState,
      metadata: {
        ...chatState.metadata,
        lastUpdated: new Date(),
      },
    }

    await storage.saveChatSession(updatedState)
  }

  /**
   * PERF: Save only session metadata (no message rewrite).
   * Falls back to saveChatSession for backends that don't support it.
   */
  async saveSessionMetadataOnly(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    if (typeof storage.saveSessionMetadataOnly === 'function') {
      await storage.saveSessionMetadataOnly(chatState)
    } else {
      await storage.saveChatSession(chatState)
    }
  }

  /**
   * Add a single message to the messages subcollection (pass-through).
   * Only supported when the backend is FirestoreStorageAdapter.
   * Other backends silently no-op since they don't have subcollections.
   */
  async addMessage(
    userId: string,
    patientId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    if (typeof storage.addMessage === 'function') {
      await storage.addMessage(userId, patientId, sessionId, message)
    }
  }

  async loadChatSession(sessionId: string): Promise<ChatState | null> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.loadChatSession(sessionId)
  }

  // Obtener todas las sesiones de un usuario (método legacy - mantener compatibilidad)
  async getUserSessions(userId: string): Promise<ChatState[]> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getUserSessions(userId)
  }

  // Obtener sesiones paginadas de un usuario
  async getUserSessionsPaginated(
    userId: string,
    options: {
      pageSize?: number
      pageToken?: string
      sortBy?: 'lastUpdated' | 'created'
      sortOrder?: 'asc' | 'desc'
    } = {}
  ): Promise<{
    items: ChatState[]
    nextPageToken?: string
    totalCount: number
    hasNextPage: boolean
  }> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getUserSessionsPaginated(userId, options)
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    await storage.deleteChatSession(sessionId)
  }

  async saveClinicalFile(file: ClinicalFile): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    await storage.saveClinicalFile(file)
  }

  async getClinicalFiles(sessionId?: string): Promise<ClinicalFile[]> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getClinicalFiles(sessionId)
  }

  async getClinicalFileById(fileId: string): Promise<ClinicalFile | null> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getClinicalFileById(fileId)
  }

  async deleteClinicalFile(fileId: string): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    await storage.deleteClinicalFile(fileId)
  }

  // ---- Fichas Clínicas ----
  async saveFichaClinica(ficha: FichaClinicaState): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    await storage.saveFichaClinica(ficha)
  }

  async getFichaClinicaById(fichaId: string): Promise<FichaClinicaState | null> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getFichaClinicaById(fichaId)
  }

  async getFichasClinicasByPaciente(pacienteId: string): Promise<FichaClinicaState[]> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    return await storage.getFichasClinicasByPaciente(pacienteId)
  }

  async clearAllData(): Promise<void> {
    if (!this.initialized) throw new Error("Storage not initialized")
    const storage = await this.ensureStorage()
    await storage.clearAllData()
  }

  /**
   * Obtiene estadísticas del storage (útil para monitoreo)
   */
  async getStorageStats() {
    const storage = await this.ensureStorage()
    return storage.getStorageStats()
  }

  /**
   * Cierra el storage y libera recursos
   */
  async shutdown(): Promise<void> {
    if (this.storage) {
      await this.storage.shutdown()
    }
    this.initialized = false
  }
}

// Función para detectar si estamos en el servidor o en el cliente
export function isServerEnvironment(): boolean {
  return typeof window === 'undefined'
}

// Declarar el tipo para globalThis
declare global {
  var __hopeai_storage_adapter__: ServerStorageAdapter | undefined
}

// Función para obtener el adaptador de almacenamiento (server-side only)
export async function getStorageAdapter() {
  // This module is server-only. Client-side code uses firestore-client-storage.ts directly.
  logger.info('🖥️ [getStorageAdapter] Running on SERVER')
  // Usar singleton global verdadero para mantener el estado entre llamadas API
  if (!globalThis.__hopeai_storage_adapter__) {
    logger.info('🔧 [getStorageAdapter] Creating new ServerStorageAdapter instance (Singleton Global)')
    globalThis.__hopeai_storage_adapter__ = new ServerStorageAdapter()
    await globalThis.__hopeai_storage_adapter__.initialize()
  } else {
    logger.info('♻️ [getStorageAdapter] Reusing existing ServerStorageAdapter instance (Singleton Global)')
  }
  return globalThis.__hopeai_storage_adapter__
}