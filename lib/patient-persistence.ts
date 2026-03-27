"use client"

import type { PatientRecord, PatientStorageAdapter, PatientSummaryCache } from "@/types/clinical-types"

/**
 * IndexedDB-based patient record persistence
 * Follows the pattern established in client-context-persistence.ts
 */
export class PatientPersistence implements PatientStorageAdapter {
  private static instance: PatientPersistence | null = null
  private db: IDBDatabase | null = null
  private readonly dbName = "HopeAI_PatientLibrary"
  private readonly dbVersion = 1
  private readonly storeName = "patients"
  private readonly indexName = "patients_index"

  private constructor() {}

  /**
   * Singleton pattern for consistent database access
   */
  static getInstance(): PatientPersistence {
    if (!PatientPersistence.instance) {
      PatientPersistence.instance = new PatientPersistence()
    }
    return PatientPersistence.instance
  }

  /**
   * Initialize IndexedDB database and object stores
   */
  async initialize(): Promise<void> {
    if (this.db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        console.error("Failed to open patient database:", request.error)
        reject(new Error("Failed to initialize patient database"))
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log("Patient database initialized successfully")
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create patients object store
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" })
          
          // Create indexes for efficient searching
          store.createIndex("displayName", "displayName", { unique: false })
          store.createIndex("tags", "tags", { unique: false, multiEntry: true })
          store.createIndex("createdAt", "createdAt", { unique: false })
          store.createIndex("updatedAt", "updatedAt", { unique: false })
        }

        // Create index store for metadata
        if (!db.objectStoreNames.contains(this.indexName)) {
          db.createObjectStore(this.indexName, { keyPath: "key" })
        }
      }
    })
  }

  /**
   * Save a patient record to IndexedDB
   */
  async savePatientRecord(patient: PatientRecord): Promise<void> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName, this.indexName], "readwrite")
      const store = transaction.objectStore(this.storeName)
      const indexStore = transaction.objectStore(this.indexName)

      // Serialize dates for storage
      const serializedPatient = {
        ...patient,
        createdAt: patient.createdAt.toISOString(),
        updatedAt: patient.updatedAt.toISOString(),
        attachments: patient.attachments?.map(att => ({
          ...att,
          uploadDate: att.uploadDate.toISOString()
        }))
      }

      const request = store.put(serializedPatient)
      
      request.onsuccess = async () => {
        // Update index
        await this.updateIndex()
        console.log(`Patient record saved: ${patient.id}`)
        resolve()
      }

      request.onerror = () => {
        console.error("Failed to save patient record:", request.error)
        reject(new Error(`Failed to save patient record: ${patient.id}`))
      }
    })
  }

  /**
   * Load a patient record by ID
   */
  async loadPatientRecord(patientId: string): Promise<PatientRecord | null> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly")
      const store = transaction.objectStore(this.storeName)
      const request = store.get(patientId)

      request.onsuccess = () => {
        if (request.result) {
          const patient = this.deserializePatient(request.result)
          resolve(patient)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => {
        console.error("Failed to load patient record:", request.error)
        reject(new Error(`Failed to load patient record: ${patientId}`))
      }
    })
  }

  /**
   * Get all patient records
   */
  async getAllPatients(): Promise<PatientRecord[]> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly")
      const store = transaction.objectStore(this.storeName)
      const request = store.getAll()

      request.onsuccess = () => {
        const patients = request.result.map(p => this.deserializePatient(p))
        // Sort by most recently updated
        patients.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        resolve(patients)
      }

      request.onerror = () => {
        console.error("Failed to load all patients:", request.error)
        reject(new Error("Failed to load all patients"))
      }
    })
  }

  /**
   * Search patients by name or tags
   */
  async searchPatients(query: string): Promise<PatientRecord[]> {
    const allPatients = await this.getAllPatients()
    const searchTerm = query.toLowerCase().trim()
    
    if (!searchTerm) return allPatients

    return allPatients.filter(patient => {
      // Search in display name
      if (patient.displayName.toLowerCase().includes(searchTerm)) {
        return true
      }
      
      // Search in tags
      if (patient.tags?.some(tag => tag.toLowerCase().includes(searchTerm))) {
        return true
      }
      
      // Search in notes
      if (patient.notes?.toLowerCase().includes(searchTerm)) {
        return true
      }
      
      return false
    })
  }

  /**
   * Delete a patient record
   */
  async deletePatientRecord(patientId: string): Promise<void> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName, this.indexName], "readwrite")
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(patientId)

      request.onsuccess = async () => {
        await this.updateIndex()
        console.log(`Patient record deleted: ${patientId}`)
        resolve()
      }

      request.onerror = () => {
        console.error("Failed to delete patient record:", request.error)
        reject(new Error(`Failed to delete patient record: ${patientId}`))
      }
    })
  }

  /**
   * Update patient summary cache
   */
  async updatePatientSummaryCache(patientId: string, summary: PatientSummaryCache): Promise<void> {
    const patient = await this.loadPatientRecord(patientId)
    if (!patient) {
      throw new Error(`Patient not found: ${patientId}`)
    }

    patient.summaryCache = summary
    patient.updatedAt = new Date()
    
    await this.savePatientRecord(patient)
  }

  /**
   * Clear all patient records (for testing/reset)
   */
  async clearAllPatients(): Promise<void> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName, this.indexName], "readwrite")
      const store = transaction.objectStore(this.storeName)
      const indexStore = transaction.objectStore(this.indexName)
      
      const clearStore = store.clear()
      const clearIndex = indexStore.clear()

      Promise.all([
        new Promise(res => { clearStore.onsuccess = () => res(undefined) }),
        new Promise(res => { clearIndex.onsuccess = () => res(undefined) })
      ]).then(() => {
        console.log("All patient records cleared")
        resolve()
      }).catch(reject)
    })
  }

  /**
   * Get patient count for UI display
   */
  async getPatientCount(): Promise<number> {
    await this.ensureInitialized()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], "readonly")
      const store = transaction.objectStore(this.storeName)
      const request = store.count()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error("Failed to get patient count"))
    })
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }
  }

  /**
   * Deserialize patient record from IndexedDB
   */
  private deserializePatient(serialized: any): PatientRecord {
    return {
      ...serialized,
      createdAt: new Date(serialized.createdAt),
      updatedAt: new Date(serialized.updatedAt),
      attachments: serialized.attachments?.map((att: any) => ({
        ...att,
        uploadDate: new Date(att.uploadDate)
      }))
    }
  }

  /**
   * Update patient index for efficient queries
   */
  private async updateIndex(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName, this.indexName], "readwrite")
      const store = transaction.objectStore(this.storeName)
      const indexStore = transaction.objectStore(this.indexName)
      
      const countRequest = store.count()
      
      countRequest.onsuccess = () => {
        const indexData = {
          key: "metadata",
          patientCount: countRequest.result,
          lastUpdated: new Date().toISOString()
        }
        
        const updateRequest = indexStore.put(indexData)
        updateRequest.onsuccess = () => resolve()
        updateRequest.onerror = () => reject(new Error("Failed to update index"))
      }
      
      countRequest.onerror = () => reject(new Error("Failed to count patients"))
    })
  }
}

/**
 * Convenience function to get the singleton instance
 */
export const getPatientPersistence = (): PatientPersistence => {
  return PatientPersistence.getInstance()
}