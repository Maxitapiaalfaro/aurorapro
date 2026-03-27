/**
 * UI Preferences Storage
 * Manages user interface preferences using IndexedDB
 * Follows the pattern established in clinical-context-storage.ts
 */

export interface UIPreferences {
  userId: string
  showDynamicSuggestions: boolean
  lastUpdated: string
}

const DB_NAME = "hopeai_ui_preferences"
const DB_VERSION = 1
const STORE_NAME = "ui_preferences"
const DEFAULT_USER_ID = "default_user" // Para usuarios sin autenticación

export class UIPreferencesStorage {
  private static instance: UIPreferencesStorage | null = null
  private db: IDBDatabase | null = null

  private constructor() {}

  /**
   * Singleton pattern for consistent database access
   */
  static getInstance(): UIPreferencesStorage {
    if (!UIPreferencesStorage.instance) {
      UIPreferencesStorage.instance = new UIPreferencesStorage()
    }
    return UIPreferencesStorage.instance
  }

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error("Error opening UI preferences database:", request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log("✅ UI Preferences database initialized")
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store for UI preferences
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "userId",
          })
          console.log("✅ UI Preferences object store created")
        }
      }
    })
  }

  /**
   * Get UI preferences for a user
   */
  async getPreferences(userId: string = DEFAULT_USER_ID): Promise<UIPreferences> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(userId)

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result as UIPreferences)
        } else {
          // Return default preferences if none exist
          resolve({
            userId,
            showDynamicSuggestions: true,
            lastUpdated: new Date().toISOString(),
          })
        }
      }

      request.onerror = () => {
        console.error("Error getting UI preferences:", request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Save UI preferences for a user
   */
  async savePreferences(preferences: UIPreferences): Promise<void> {
    if (!this.db) {
      await this.initialize()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      
      const preferencesToSave = {
        ...preferences,
        lastUpdated: new Date().toISOString(),
      }
      
      const request = store.put(preferencesToSave)

      request.onsuccess = () => {
        console.log("✅ UI preferences saved:", preferencesToSave)
        resolve()
      }

      request.onerror = () => {
        console.error("Error saving UI preferences:", request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Update specific preference
   */
  async updatePreference(
    key: keyof Omit<UIPreferences, "userId" | "lastUpdated">,
    value: boolean,
    userId: string = DEFAULT_USER_ID
  ): Promise<void> {
    const preferences = await this.getPreferences(userId)
    preferences[key] = value
    await this.savePreferences(preferences)
  }

  /**
   * Check if dynamic suggestions should be shown
   */
  async shouldShowDynamicSuggestions(userId: string = DEFAULT_USER_ID): Promise<boolean> {
    const preferences = await this.getPreferences(userId)
    return preferences.showDynamicSuggestions
  }

  /**
   * Hide dynamic suggestions permanently
   */
  async hideDynamicSuggestions(userId: string = DEFAULT_USER_ID): Promise<void> {
    await this.updatePreference("showDynamicSuggestions", false, userId)
  }
}

// Export singleton instance
export const uiPreferencesStorage = UIPreferencesStorage.getInstance()

