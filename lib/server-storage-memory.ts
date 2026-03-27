import type { ChatState, ClinicalFile, FichaClinicaState } from "@/types/clinical-types"

/**
 * MemoryServerStorage
 *
 * Server-side, in-memory storage adapter used for serverless environments (e.g., Vercel)
 * where persistent disk writes are disallowed. This adapter keeps data in RAM only
 * for the lifetime of the server instance and avoids any filesystem operations.
 *
 * NOTE: Persistence should be handled by the client (IndexedDB) in production alpha.
 */
export class MemoryServerStorage {
  private initialized = false

  private chatSessions = new Map<string, ChatState>()
  private userSessions = new Map<string, Set<string>>()

  private clinicalFiles = new Map<string, ClinicalFile>()
  private sessionFiles = new Map<string, Set<string>>()

  private fichas = new Map<string, FichaClinicaState>()
  private fichasByPaciente = new Map<string, Set<string>>()

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    // No-op: purely in-memory
    console.log('✅ [MemoryStorage] Initialized (serverless-safe, no disk writes)')
  }

  async shutdown(): Promise<void> {
    // Clear all maps to release memory
    this.chatSessions.clear()
    this.userSessions.clear()
    this.clinicalFiles.clear()
    this.sessionFiles.clear()
    this.fichas.clear()
    this.fichasByPaciente.clear()
    this.initialized = false
    console.log('🧹 [MemoryStorage] Shutdown and cleared all in-memory data')
  }

  // ---- Chat Sessions ----
  async saveChatSession(chatState: ChatState): Promise<void> {
    if (!this.initialized) throw new Error('Storage not initialized')

    // Ensure Date objects remain Dates
    chatState.metadata.createdAt = new Date(chatState.metadata.createdAt)
    chatState.metadata.lastUpdated = new Date(chatState.metadata.lastUpdated)

    this.chatSessions.set(chatState.sessionId, chatState)

    // Index by user
    if (chatState.userId) {
      let set = this.userSessions.get(chatState.userId)
      if (!set) {
        set = new Set<string>()
        this.userSessions.set(chatState.userId, set)
      }
      set.add(chatState.sessionId)
    }

    console.log(`💾 [MemoryStorage] Saved session: ${chatState.sessionId}`)
  }

  async loadChatSession(sessionId: string): Promise<ChatState | null> {
    if (!this.initialized) throw new Error('Storage not initialized')
    const s = this.chatSessions.get(sessionId)
    if (!s) return null
    return s
  }

  async getUserSessions(userId: string): Promise<ChatState[]> {
    if (!this.initialized) throw new Error('Storage not initialized')
    const ids = this.userSessions.get(userId)
    if (!ids || ids.size === 0) return []
    const items: ChatState[] = []
    for (const id of ids) {
      const s = this.chatSessions.get(id)
      if (s) items.push(s)
    }
    // Sort by lastUpdated desc to mimic SQLite behavior
    items.sort((a, b) => b.metadata.lastUpdated.getTime() - a.metadata.lastUpdated.getTime())
    return items
  }

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
    const all = await this.getUserSessions(userId)
    const totalCount = all.length

    const { pageSize = 50, pageToken, sortBy = 'lastUpdated', sortOrder = 'desc' } = options

    // Sort
    const orderMultiplier = sortOrder === 'asc' ? 1 : -1
    const sortFn = (a: ChatState, b: ChatState) => {
      const aVal = sortBy === 'lastUpdated' ? a.metadata.lastUpdated.getTime() : a.metadata.createdAt.getTime()
      const bVal = sortBy === 'lastUpdated' ? b.metadata.lastUpdated.getTime() : b.metadata.createdAt.getTime()
      return orderMultiplier * (aVal - bVal)
    }
    all.sort(sortFn)

    let offset = 0
    if (pageToken) {
      try {
        const decoded = JSON.parse(Buffer.from(pageToken, 'base64').toString())
        offset = decoded.offset || 0
      } catch {}
    }

    const items = all.slice(offset, offset + pageSize)
    const hasNextPage = offset + pageSize < totalCount
    let nextPageToken: string | undefined
    if (hasNextPage) {
      nextPageToken = Buffer.from(JSON.stringify({ offset: offset + pageSize })).toString('base64')
    }

    return { items, nextPageToken, totalCount, hasNextPage }
  }

  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.initialized) throw new Error('Storage not initialized')
    const s = this.chatSessions.get(sessionId)
    if (!s) return
    this.chatSessions.delete(sessionId)
    if (s.userId) {
      const ids = this.userSessions.get(s.userId)
      if (ids) ids.delete(sessionId)
    }
    console.log(`🗑️ [MemoryStorage] Deleted session: ${sessionId}`)
  }

  // ---- Clinical Files ----
  async saveClinicalFile(file: ClinicalFile): Promise<void> {
    if (!this.initialized) throw new Error('Storage not initialized')
    this.clinicalFiles.set(file.id, file as any)
    if (file.sessionId) {
      let set = this.sessionFiles.get(file.sessionId)
      if (!set) {
        set = new Set<string>()
        this.sessionFiles.set(file.sessionId, set)
      }
      set.add(file.id)
    }
    console.log(`💾 [MemoryStorage] Saved clinical file: ${file.id}`)
  }

  async getClinicalFiles(sessionId?: string): Promise<ClinicalFile[]> {
    if (!this.initialized) throw new Error('Storage not initialized')
    if (!sessionId) return Array.from(this.clinicalFiles.values())
    const ids = this.sessionFiles.get(sessionId)
    if (!ids || ids.size === 0) return []
    const items: ClinicalFile[] = []
    for (const id of ids) {
      const f = this.clinicalFiles.get(id)
      if (f) items.push(f)
    }
    return items
  }

  async getClinicalFileById(fileId: string): Promise<ClinicalFile | null> {
    if (!this.initialized) throw new Error('Storage not initialized')
    return this.clinicalFiles.get(fileId) || null
  }

  async deleteClinicalFile(fileId: string): Promise<void> {
    if (!this.initialized) throw new Error('Storage not initialized')
    const f = this.clinicalFiles.get(fileId)
    if (!f) return
    this.clinicalFiles.delete(fileId)
    if ((f as any).sessionId) {
      const ids = this.sessionFiles.get((f as any).sessionId)
      if (ids) ids.delete(fileId)
    }
    console.log(`🗑️ [MemoryStorage] Deleted clinical file: ${fileId}`)
  }

  // ---- Fichas Clínicas ----
  async saveFichaClinica(ficha: FichaClinicaState): Promise<void> {
    if (!this.initialized) throw new Error('Storage not initialized')
    this.fichas.set(ficha.fichaId, ficha)
    let set = this.fichasByPaciente.get(ficha.pacienteId)
    if (!set) {
      set = new Set<string>()
      this.fichasByPaciente.set(ficha.pacienteId, set)
    }
    set.add(ficha.fichaId)
    console.log(`💾 [MemoryStorage] Saved ficha clínica: ${ficha.fichaId}`)
  }

  async getFichaClinicaById(fichaId: string): Promise<FichaClinicaState | null> {
    if (!this.initialized) throw new Error('Storage not initialized')
    return this.fichas.get(fichaId) || null
  }

  async getFichasClinicasByPaciente(pacienteId: string): Promise<FichaClinicaState[]> {
    if (!this.initialized) throw new Error('Storage not initialized')
    const ids = this.fichasByPaciente.get(pacienteId)
    if (!ids || ids.size === 0) return []
    const items: FichaClinicaState[] = []
    for (const id of ids) {
      const f = this.fichas.get(id)
      if (f) items.push(f)
    }
    // Sort by ultima_actualizacion desc
    items.sort((a, b) => new Date(b.ultimaActualizacion).getTime() - new Date(a.ultimaActualizacion).getTime())
    return items
  }

  async clearAllData(): Promise<void> {
    this.chatSessions.clear()
    this.userSessions.clear()
    this.clinicalFiles.clear()
    this.sessionFiles.clear()
    this.fichas.clear()
    this.fichasByPaciente.clear()
    console.log('🧹 [MemoryStorage] Cleared all data')
  }

  getStorageStats() {
    return {
      hotCacheSize: this.chatSessions.size,
      hotCacheLimit: 0,
      cacheUtilization: 0,
      initialized: this.initialized,
    }
  }
}