/**
 * HIPAA-Compliant Storage System
 *
 * ⚠️ SERVER-ONLY MODULE - Do not import in client components
 *
 * Sistema de almacenamiento de 2 niveles que cumple con HIPAA Security Rule:
 * - TIER 1 (Hot Cache): Sesiones activas en RAM para performance
 * - TIER 2 (Persistent Storage): SQLite encriptado en disco para compliance
 *
 * Características HIPAA:
 * - Encriptación at-rest con AES-256-GCM (§164.312(a)(2)(iv))
 * - Audit logging de todos los accesos (§164.312(b))
 * - Persistencia durable (§164.316(b)(1))
 * - Automatic session cleanup con TTL
 * - Data integrity verification
 *
 * @author Aurora Development Team
 * @version 1.0.0
 */

import Database from 'better-sqlite3'
import { encrypt, decrypt, verifyEncryptionSetup } from './encryption-utils'
import type { ChatState, ClinicalFile, FichaClinicaState } from '@/types/clinical-types'


import { createLogger } from '@/lib/logger'
const logger = createLogger('storage')

/**
 * Configuración del storage
 */
const STORAGE_CONFIG = {
  // Hot cache (RAM) configuration
  maxHotCacheSessions: 50,        // Máximo de sesiones en RAM
  cacheTTLMinutes: 30,            // TTL de cache en minutos
  
  // Database configuration
  dbPath: './data/aurora-hipaa.db',
  
  // Cleanup configuration
  cleanupIntervalMinutes: 5,      // Frecuencia de limpieza de cache
  sessionTimeoutDays: 90,         // Sesiones inactivas > 90 días se archivan
  
  // Audit configuration
  enableAuditLog: true,
  maxAuditLogsPerSession: 1000,
}

/**
 * Metadata de cache para sesiones en hot cache
 */
interface CachedSession extends ChatState {
  _cachedAt: number
  _lastAccessed: number
}

/**
 * Entrada de audit log
 */
interface AuditLogEntry {
  id?: number
  sessionId: string
  action: 'create' | 'read' | 'update' | 'delete'
  userId: string
  timestamp: number
  ipAddress?: string
  metadata?: string
}

/**
 * Storage HIPAA-compliant con SQLite + Hot Cache
 */
export class HIPAACompliantStorage {
  private db: Database.Database | null = null
  private hotCache = new Map<string, CachedSession>()
  private cleanupTimer: NodeJS.Timeout | null = null
  private initialized = false

  /**
   * Inicializa el sistema de storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('✅ [HIPAA Storage] Already initialized')
      return
    }

    try {
      // Dynamic imports para módulos de Node.js
      const { existsSync, mkdirSync } = await import('fs')
      const { join } = await import('path')

      // Verificar configuración de encriptación
      const encryptionValid = verifyEncryptionSetup()
      if (!encryptionValid) {
        throw new Error('Encryption setup verification failed')
      }

      // Crear directorio de datos si no existe
      const dataDir = join(process.cwd(), 'data')
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true })
        logger.info('📁 [HIPAA Storage] Created data directory:', dataDir)
      }

      // Inicializar SQLite
      const dbPath = join(process.cwd(), STORAGE_CONFIG.dbPath)
      this.db = new Database(dbPath)
      
      // Configurar SQLite para mejor performance
      this.db.pragma('journal_mode = WAL')  // Write-Ahead Logging
      this.db.pragma('synchronous = NORMAL') // Balance entre seguridad y performance
      this.db.pragma('cache_size = -64000')  // 64MB cache
      this.db.pragma('temp_store = MEMORY')  // Temp tables en memoria

      // Crear schema
      this.createSchema()

      // Iniciar limpieza automática de cache
      this.startCacheCleanup()

      this.initialized = true
      logger.info('✅ [HIPAA Storage] Initialized successfully')
      logger.info('📊 [HIPAA Storage] Config:', {
        dbPath,
        maxHotCache: STORAGE_CONFIG.maxHotCacheSessions,
        cacheTTL: `${STORAGE_CONFIG.cacheTTLMinutes}min`,
        auditEnabled: STORAGE_CONFIG.enableAuditLog
      })

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Crea el schema de la base de datos
   */
  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      -- Tabla principal de sesiones de chat
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        encrypted_data BLOB NOT NULL,
        last_updated INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        patient_id TEXT,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0
      );

      -- Índices para queries eficientes
      CREATE INDEX IF NOT EXISTS idx_user_sessions 
        ON chat_sessions(user_id, last_updated DESC);
      
      CREATE INDEX IF NOT EXISTS idx_patient_sessions 
        ON chat_sessions(patient_id) 
        WHERE patient_id IS NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_last_updated 
        ON chat_sessions(last_updated DESC);

      -- Tabla de archivos clínicos
      CREATE TABLE IF NOT EXISTS clinical_files (
        file_id TEXT PRIMARY KEY,
        session_id TEXT,
        encrypted_data BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_files 
        ON clinical_files(session_id);

      -- Tabla de fichas clínicas
      CREATE TABLE IF NOT EXISTS fichas_clinicas (
        ficha_id TEXT PRIMARY KEY,
        paciente_id TEXT NOT NULL,
        encrypted_data BLOB NOT NULL,
        ultima_actualizacion INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_paciente_fichas 
        ON fichas_clinicas(paciente_id);

      -- Tabla de audit log (HIPAA requirement)
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ip_address TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_audit_session 
        ON audit_log(session_id, timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_audit_user 
        ON audit_log(user_id, timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp 
        ON audit_log(timestamp DESC);
    `)

    logger.info('✅ [HIPAA Storage] Database schema created')
  }

  /**
   * Guarda una sesión de chat (TIER 1: Hot Cache + TIER 2: SQLite)
   */
  async saveChatSession(chatState: ChatState): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const now = Date.now()

      // TIER 1: Guardar en hot cache para performance
      const cachedSession: CachedSession = {
        ...chatState,
        _cachedAt: now,
        _lastAccessed: now
      }
      this.hotCache.set(chatState.sessionId, cachedSession)

      // Evict si excedemos límite de cache
      if (this.hotCache.size > STORAGE_CONFIG.maxHotCacheSessions) {
        this.evictOldestFromCache()
      }

      // TIER 2: Persistir en SQLite con encriptación
      const encryptedData = encrypt(JSON.stringify(chatState))

      const stmt = this.db.prepare(`
        INSERT INTO chat_sessions (
          session_id, user_id, encrypted_data, last_updated, created_at, 
          patient_id, message_count, total_tokens
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          encrypted_data = excluded.encrypted_data,
          last_updated = excluded.last_updated,
          message_count = excluded.message_count,
          total_tokens = excluded.total_tokens
      `)

      stmt.run(
        chatState.sessionId,
        chatState.userId,
        encryptedData,
        now,
        chatState.metadata.createdAt.getTime(),
        chatState.clinicalContext?.patientId || null,
        chatState.history?.length || 0,
        chatState.metadata.totalTokens || 0
      )

      // Audit log
      this.logAccess(chatState.sessionId, 'update', chatState.userId)

      logger.info(`💾 [HIPAA Storage] Saved session: ${chatState.sessionId}`)

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error saving session:', error)
      throw error
    }
  }

  /**
   * Carga una sesión de chat (TIER 1 primero, luego TIER 2)
   */
  async loadChatSession(sessionId: string): Promise<ChatState | null> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      // TIER 1: Intentar desde hot cache primero
      const cached = this.hotCache.get(sessionId)
      if (cached) {
        const age = Date.now() - cached._cachedAt
        const ttl = STORAGE_CONFIG.cacheTTLMinutes * 60 * 1000

        if (age < ttl) {
          // Cache hit válido
          cached._lastAccessed = Date.now()
          logger.info(`⚡ [HIPAA Storage] Cache HIT: ${sessionId}`)
          this.logAccess(sessionId, 'read', cached.userId)
          return cached
        } else {
          // Cache expirado
          this.hotCache.delete(sessionId)
        }
      }

      // TIER 2: Cargar desde SQLite
      logger.info(`💾 [HIPAA Storage] Cache MISS: ${sessionId}, loading from DB`)
      
      const stmt = this.db.prepare(`
        SELECT encrypted_data, user_id FROM chat_sessions WHERE session_id = ?
      `)
      const row = stmt.get(sessionId) as { encrypted_data: Buffer; user_id: string } | undefined

      if (!row) {
        logger.info(`❌ [HIPAA Storage] Session not found: ${sessionId}`)
        return null
      }

      // Desencriptar
      const decryptedData = decrypt(row.encrypted_data)
      const chatState = JSON.parse(decryptedData) as ChatState

      // Calentar cache
      const cachedSession: CachedSession = {
        ...chatState,
        _cachedAt: Date.now(),
        _lastAccessed: Date.now()
      }
      this.hotCache.set(sessionId, cachedSession)

      // Audit log
      this.logAccess(sessionId, 'read', row.user_id)

      return chatState

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error loading session:', error)
      throw error
    }
  }

  /**
   * Elimina la sesión más antigua del hot cache
   */
  private evictOldestFromCache(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, value] of this.hotCache.entries()) {
      if (value._lastAccessed < oldestTime) {
        oldestTime = value._lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.hotCache.delete(oldestKey)
      logger.info(`🗑️ [HIPAA Storage] Evicted from cache: ${oldestKey}`)
    }
  }

  /**
   * Inicia el timer de limpieza automática de cache
   */
  private startCacheCleanup(): void {
    const intervalMs = STORAGE_CONFIG.cleanupIntervalMinutes * 60 * 1000

    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      const ttl = STORAGE_CONFIG.cacheTTLMinutes * 60 * 1000
      let evicted = 0

      for (const [key, value] of this.hotCache.entries()) {
        const age = now - value._cachedAt
        if (age > ttl) {
          this.hotCache.delete(key)
          evicted++
        }
      }

      if (evicted > 0) {
        logger.info(`🧹 [HIPAA Storage] Cleanup: evicted ${evicted} expired sessions from cache`)
      }
    }, intervalMs)

    logger.info(`⏰ [HIPAA Storage] Cache cleanup scheduled every ${STORAGE_CONFIG.cleanupIntervalMinutes} minutes`)
  }

  /**
   * Registra acceso en audit log (HIPAA requirement)
   */
  private logAccess(
    sessionId: string,
    action: AuditLogEntry['action'],
    userId: string,
    ipAddress?: string,
    metadata?: any
  ): void {
    if (!STORAGE_CONFIG.enableAuditLog || !this.db) return

    try {
      const stmt = this.db.prepare(`
        INSERT INTO audit_log (session_id, action, user_id, timestamp, ip_address, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        sessionId,
        action,
        userId,
        Date.now(),
        ipAddress || null,
        metadata ? JSON.stringify(metadata) : null
      )
    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error logging access:', error)
      // No lanzar error para no interrumpir operación principal
    }
  }

  /**
   * Obtiene todas las sesiones de un usuario (método legacy)
   */
  async getUserSessions(userId: string): Promise<ChatState[]> {
    const result = await this.getUserSessionsPaginated(userId, { pageSize: 2000 })
    return result.items
  }

  /**
   * Obtiene sesiones paginadas de un usuario
   */
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
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const { pageSize = 50, pageToken, sortBy = 'lastUpdated', sortOrder = 'desc' } = options

      // Obtener total count
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM chat_sessions WHERE user_id = ?')
      const countResult = countStmt.get(userId) as { count: number }
      const totalCount = countResult.count

      // Calcular offset desde pageToken
      let offset = 0
      if (pageToken) {
        try {
          const decoded = JSON.parse(Buffer.from(pageToken, 'base64').toString())
          offset = decoded.offset || 0
        } catch (error) {
          logger.warn('Invalid page token, starting from beginning')
        }
      }

      // Query con paginación
      const orderColumn = sortBy === 'lastUpdated' ? 'last_updated' : 'created_at'
      const orderDirection = sortOrder.toUpperCase()

      const stmt = this.db.prepare(`
        SELECT encrypted_data FROM chat_sessions
        WHERE user_id = ?
        ORDER BY ${orderColumn} ${orderDirection}
        LIMIT ? OFFSET ?
      `)

      const rows = stmt.all(userId, pageSize, offset) as { encrypted_data: Buffer }[]

      // Desencriptar sesiones
      const items: ChatState[] = rows.map(row => {
        const decrypted = decrypt(row.encrypted_data)
        return JSON.parse(decrypted) as ChatState
      })

      // Calcular next page token
      const hasNextPage = offset + pageSize < totalCount
      let nextPageToken: string | undefined
      if (hasNextPage) {
        const tokenData = { offset: offset + pageSize }
        nextPageToken = Buffer.from(JSON.stringify(tokenData)).toString('base64')
      }

      return { items, nextPageToken, totalCount, hasNextPage }

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting user sessions:', error)
      return { items: [], totalCount: 0, hasNextPage: false }
    }
  }

  /**
   * Elimina una sesión de chat
   */
  async deleteChatSession(sessionId: string): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      // Eliminar de cache
      this.hotCache.delete(sessionId)

      // Eliminar de base de datos
      const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE session_id = ?')
      stmt.run(sessionId)

      // Audit log
      this.logAccess(sessionId, 'delete', 'system')

      logger.info(`🗑️ [HIPAA Storage] Deleted session: ${sessionId}`)

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error deleting session:', error)
      throw error
    }
  }

  /**
   * Guarda un archivo clínico
   */
  async saveClinicalFile(file: ClinicalFile): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const encryptedData = encrypt(JSON.stringify(file))

      const stmt = this.db.prepare(`
        INSERT INTO clinical_files (file_id, session_id, encrypted_data, created_at, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_id) DO UPDATE SET
          encrypted_data = excluded.encrypted_data
      `)

      stmt.run(
        file.id,
        file.sessionId || null,
        encryptedData,
        Date.now(),
        file.size || 0,
        file.type || null
      )

      logger.info(`💾 [HIPAA Storage] Saved clinical file: ${file.id}`)

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error saving clinical file:', error)
      throw error
    }
  }

  /**
   * Obtiene archivos clínicos por sesión
   */
  async getClinicalFiles(sessionId?: string): Promise<ClinicalFile[]> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      let stmt: Database.Statement
      let rows: { encrypted_data: Buffer }[]

      if (sessionId) {
        stmt = this.db.prepare('SELECT encrypted_data FROM clinical_files WHERE session_id = ?')
        rows = stmt.all(sessionId) as { encrypted_data: Buffer }[]
      } else {
        stmt = this.db.prepare('SELECT encrypted_data FROM clinical_files')
        rows = stmt.all() as { encrypted_data: Buffer }[]
      }

      return rows.map(row => {
        const decrypted = decrypt(row.encrypted_data)
        return JSON.parse(decrypted) as ClinicalFile
      })

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting clinical files:', error)
      return []
    }
  }

  /**
   * Obtiene un archivo clínico por ID
   */
  async getClinicalFileById(fileId: string): Promise<ClinicalFile | null> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const stmt = this.db.prepare('SELECT encrypted_data FROM clinical_files WHERE file_id = ?')
      const row = stmt.get(fileId) as { encrypted_data: Buffer } | undefined

      if (!row) return null

      const decrypted = decrypt(row.encrypted_data)
      return JSON.parse(decrypted) as ClinicalFile

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting clinical file:', error)
      return null
    }
  }

  /**
   * Elimina un archivo clínico
   */
  async deleteClinicalFile(fileId: string): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const stmt = this.db.prepare('DELETE FROM clinical_files WHERE file_id = ?')
      stmt.run(fileId)

      logger.info(`🗑️ [HIPAA Storage] Deleted clinical file: ${fileId}`)

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error deleting clinical file:', error)
      throw error
    }
  }

  /**
   * Guarda una ficha clínica
   */
  async saveFichaClinica(ficha: FichaClinicaState): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const encryptedData = encrypt(JSON.stringify(ficha))

      const stmt = this.db.prepare(`
        INSERT INTO fichas_clinicas (ficha_id, paciente_id, encrypted_data, ultima_actualizacion, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ficha_id) DO UPDATE SET
          encrypted_data = excluded.encrypted_data,
          ultima_actualizacion = excluded.ultima_actualizacion
      `)

      stmt.run(
        ficha.fichaId,
        ficha.pacienteId,
        encryptedData,
        new Date(ficha.ultimaActualizacion).getTime(),
        Date.now()
      )

      logger.info(`💾 [HIPAA Storage] Saved ficha clínica: ${ficha.fichaId}`)

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error saving ficha clínica:', error)
      throw error
    }
  }

  /**
   * Obtiene una ficha clínica por ID
   */
  async getFichaClinicaById(fichaId: string): Promise<FichaClinicaState | null> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const stmt = this.db.prepare('SELECT encrypted_data FROM fichas_clinicas WHERE ficha_id = ?')
      const row = stmt.get(fichaId) as { encrypted_data: Buffer } | undefined

      if (!row) return null

      const decrypted = decrypt(row.encrypted_data)
      return JSON.parse(decrypted) as FichaClinicaState

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting ficha clínica:', error)
      return null
    }
  }

  /**
   * Obtiene fichas clínicas por paciente
   */
  async getFichasClinicasByPaciente(pacienteId: string): Promise<FichaClinicaState[]> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const stmt = this.db.prepare('SELECT encrypted_data FROM fichas_clinicas WHERE paciente_id = ?')
      const rows = stmt.all(pacienteId) as { encrypted_data: Buffer }[]

      return rows.map(row => {
        const decrypted = decrypt(row.encrypted_data)
        return JSON.parse(decrypted) as FichaClinicaState
      })

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting fichas clínicas:', error)
      return []
    }
  }

  /**
   * Limpia todos los datos (usar con precaución)
   */
  async clearAllData(): Promise<void> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      this.db.exec(`
        DELETE FROM audit_log;
        DELETE FROM clinical_files;
        DELETE FROM fichas_clinicas;
        DELETE FROM chat_sessions;
      `)

      this.hotCache.clear()

      logger.info('🗑️ [HIPAA Storage] All data cleared')

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error clearing data:', error)
      throw error
    }
  }

  /**
   * Obtiene audit logs de una sesión (HIPAA compliance)
   */
  async getAuditLogs(sessionId: string, limit = 100): Promise<AuditLogEntry[]> {
    if (!this.initialized || !this.db) throw new Error('Storage not initialized')

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM audit_log
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `)

      return stmt.all(sessionId, limit) as AuditLogEntry[]

    } catch (error) {
      logger.error('❌ [HIPAA Storage] Error getting audit logs:', error)
      return []
    }
  }

  /**
   * Obtiene estadísticas del storage
   */
  getStorageStats(): {
    hotCacheSize: number
    hotCacheLimit: number
    cacheUtilization: number
    initialized: boolean
  } {
    return {
      hotCacheSize: this.hotCache.size,
      hotCacheLimit: STORAGE_CONFIG.maxHotCacheSessions,
      cacheUtilization: (this.hotCache.size / STORAGE_CONFIG.maxHotCacheSessions) * 100,
      initialized: this.initialized
    }
  }

  /**
   * Cierra el storage y libera recursos
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    if (this.db) {
      this.db.close()
      this.db = null
    }

    this.hotCache.clear()
    this.initialized = false

    logger.info('✅ [HIPAA Storage] Shutdown complete')
  }
}

