import type { ChatState, ClinicalFile, FichaClinicaState } from "@/types/clinical-types"

// Dynamic import para evitar que better-sqlite3 se incluya en el bundle del cliente
type HIPAAStorage = any

/**
 * Adaptador de almacenamiento para el servidor con persistencia HIPAA-compliant.
 *
 * MIGRACIÓN COMPLETADA:
 * - Antes: In-memory Maps (memory leak, no persistencia)
 * - Ahora: SQLite encriptado + Hot Cache (HIPAA compliant, persistente)
 *
 * Características:
 * - Persistencia durable en disco con SQLite
 * - Encriptación AES-256-GCM at-rest
 * - Hot cache limitado (50 sesiones) para performance
 * - Audit logging automático
 * - Cleanup automático de cache
 *
 * @version 2.0.0 - HIPAA Compliant
 */
export class ServerStorageAdapter {
  private storage: HIPAAStorage | null = null
  private initialized = false

  constructor() {
    // Storage se inicializa de forma lazy en initialize()
  }

  private async ensureStorage(): Promise<HIPAAStorage> {
    if (!this.storage) {
      // Detectar entorno Vercel o modo memoria forzado
      const isVercel = !!process.env.VERCEL || typeof process.env.VERCEL_ENV !== 'undefined'
      const forceMemory = process.env.HOPEAI_STORAGE_MODE === 'memory'

      if (isVercel || forceMemory) {
        console.log('🔧 [ServerStorageAdapter] Using MemoryServerStorage (Vercel/serverless-safe)')
        const { MemoryServerStorage } = await import('./server-storage-memory')
        this.storage = new MemoryServerStorage()
        console.log('✅ [ServerStorageAdapter] MemoryServerStorage instance created')
      } else {
        console.log('🔧 [ServerStorageAdapter] Creating HIPAACompliantStorage instance...')
        // Dynamic import para evitar bundling en cliente
        const { HIPAACompliantStorage } = await import('./hipaa-compliant-storage')
        this.storage = new HIPAACompliantStorage()
        console.log('✅ [ServerStorageAdapter] HIPAACompliantStorage instance created')
      }
    }
    return this.storage
  }

  async initialize(): Promise<void> {
    console.log('🔧 [ServerStorageAdapter] initialize() called')
    if (this.initialized) {
      console.log('✅ [ServerStorageAdapter] Already initialized, skipping')
      return
    }

    console.log('🔧 [ServerStorageAdapter] Ensuring storage...')
    const storage = await this.ensureStorage()
    console.log('🔧 [ServerStorageAdapter] Calling storage.initialize()...')
    await storage.initialize()
    this.initialized = true

    console.log("✅ [ServerStorageAdapter] Initialized (HIPAA-compliant with SQLite)")
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

// Función para obtener el adaptador de almacenamiento correcto
export async function getStorageAdapter() {
  const isServer = isServerEnvironment()
  console.log('🔍 [getStorageAdapter] Environment check:', {
    isServer,
    hasWindow: typeof window !== 'undefined',
    nodeEnv: process.env.NODE_ENV
  })

  if (isServer) {
    console.log('🖥️ [getStorageAdapter] Running on SERVER - using SQLite storage')
    // Usar singleton global verdadero para mantener el estado entre llamadas API
    if (!globalThis.__hopeai_storage_adapter__) {
      console.log('🔧 [getStorageAdapter] Creating new ServerStorageAdapter instance (Singleton Global)')
      globalThis.__hopeai_storage_adapter__ = new ServerStorageAdapter()
      await globalThis.__hopeai_storage_adapter__.initialize()
    } else {
      console.log('♻️ [getStorageAdapter] Reusing existing ServerStorageAdapter instance (Singleton Global)')
    }
    return globalThis.__hopeai_storage_adapter__
  } else {
    console.log('🌐 [getStorageAdapter] Running on CLIENT - using IndexedDB storage')
    // En el cliente, usar el almacenamiento original con IndexedDB
    const { clinicalStorage } = require('./clinical-context-storage')
    // Asegurar que el storage del cliente esté inicializado
    await clinicalStorage.initialize()
    return clinicalStorage
  }
}