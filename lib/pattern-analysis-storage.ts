/**
 * Pattern Analysis Storage
 * 
 * Persistent storage for Pattern Mirror analyses using IndexedDB.
 * Stores longitudinal insights about therapeutic patterns.
 * 
 * @module pattern-analysis-storage
 */

import type { PatternAnalysis } from './clinical-pattern-analyzer';

/**
 * Storage state for pattern analysis
 */
export interface PatternAnalysisState {
  analysisId: string;
  patientId: string;
  status: 'generating' | 'completed' | 'error';
  analysis: PatternAnalysis | null;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  
  // Engagement tracking
  viewedAt?: Date;
  viewCount: number;
  dismissedAt?: Date;
  feedback?: {
    helpful: boolean;
    comment?: string;
    submittedAt: Date;
  };
  
  // Phase 2A: Domain validations (Active Transparency)
  domainValidations?: Record<string, {
    agreed: boolean;
    timestamp: Date;
  }>;
}

/**
 * Pattern Analysis Storage Manager
 * 
 * Manages IndexedDB storage for Pattern Mirror system
 */
export class PatternAnalysisStorage {
  private static instance: PatternAnalysisStorage | null = null;
  private db: IDBDatabase | null = null;
  private readonly dbName = 'hopeai_clinical_db'; // Shared with ClinicalContextStorage
  private readonly dbVersion = 5; // Must match ClinicalContextStorage version
  private readonly storeName = 'pattern_analyses';
  private readonly patientIndexName = 'patientId'; // Match index name in schema

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): PatternAnalysisStorage {
    if (!PatternAnalysisStorage.instance) {
      PatternAnalysisStorage.instance = new PatternAnalysisStorage();
    }
    return PatternAnalysisStorage.instance;
  }

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.db) return; // Already initialized

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('❌ [Pattern Storage] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ [Pattern Storage] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for pattern analyses (shared schema with ClinicalContextStorage)
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'analysisId' });
          
          // Index by patient ID for efficient lookup
          store.createIndex('patientId', 'patientId', { unique: false });
          
          // Index by status for filtering
          store.createIndex('status', 'status', { unique: false });
          
          // Index by creation date for sorting
          store.createIndex('createdAt', 'createdAt', { unique: false });
          
          // Index by viewed date for pending review queries
          store.createIndex('viewedAt', 'viewedAt', { unique: false });

          console.log('🔧 [Pattern Storage] Created pattern_analyses object store');
        }
      };
    });
  }

  /**
   * Save pattern analysis state
   */
  async saveAnalysisState(state: PatternAnalysisState): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      // Serialize dates
      const serialized = {
        ...state,
        createdAt: state.createdAt.toISOString(),
        completedAt: state.completedAt?.toISOString(),
        viewedAt: state.viewedAt?.toISOString(),
        dismissedAt: state.dismissedAt?.toISOString(),
        feedback: state.feedback ? {
          ...state.feedback,
          submittedAt: state.feedback.submittedAt.toISOString()
        } : undefined
      };

      const request = store.put(serialized);

      request.onsuccess = () => {
        console.log(`💾 [Pattern Storage] Saved analysis state: ${state.analysisId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to save analysis state:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Load pattern analysis by ID
   */
  async loadAnalysis(analysisId: string): Promise<PatternAnalysisState | null> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(analysisId);

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }

        // Deserialize dates
        const data = request.result;
        const deserialized: PatternAnalysisState = {
          ...data,
          createdAt: new Date(data.createdAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          viewedAt: data.viewedAt ? new Date(data.viewedAt) : undefined,
          dismissedAt: data.dismissedAt ? new Date(data.dismissedAt) : undefined,
          feedback: data.feedback ? {
            ...data.feedback,
            submittedAt: new Date(data.feedback.submittedAt)
          } : undefined
        };

        resolve(deserialized);
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to load analysis:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all analyses for a patient (sorted by date, newest first)
   */
  async getPatientAnalyses(patientId: string): Promise<PatternAnalysisState[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index(this.patientIndexName);
      const request = index.getAll(patientId);

      request.onsuccess = () => {
        const results = (request.result || []).map((data: any) => ({
          ...data,
          createdAt: new Date(data.createdAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          viewedAt: data.viewedAt ? new Date(data.viewedAt) : undefined,
          dismissedAt: data.dismissedAt ? new Date(data.dismissedAt) : undefined,
          feedback: data.feedback ? {
            ...data.feedback,
            submittedAt: new Date(data.feedback.submittedAt)
          } : undefined
        }));

        // Sort by creation date, newest first
        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        resolve(results);
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to get patient analyses:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get most recent completed analysis for a patient
   */
  async getLatestAnalysis(patientId: string): Promise<PatternAnalysisState | null> {
    const analyses = await this.getPatientAnalyses(patientId);
    const completed = analyses.filter(a => a.status === 'completed');
    return completed.length > 0 ? completed[0] : null;
  }

  /**
   * Mark analysis as viewed
   */
  async markAsViewed(analysisId: string): Promise<void> {
    const analysis = await this.loadAnalysis(analysisId);
    if (!analysis) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }

    const updated: PatternAnalysisState = {
      ...analysis,
      viewedAt: new Date(),
      viewCount: analysis.viewCount + 1
    };

    await this.saveAnalysisState(updated);
  }

  /**
   * Mark analysis as dismissed
   */
  async markAsDismissed(analysisId: string): Promise<void> {
    const analysis = await this.loadAnalysis(analysisId);
    if (!analysis) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }

    const updated: PatternAnalysisState = {
      ...analysis,
      dismissedAt: new Date()
    };

    await this.saveAnalysisState(updated);
  }

  /**
   * Submit feedback on analysis
   */
  async submitFeedback(
    analysisId: string,
    helpful: boolean,
    comment?: string
  ): Promise<void> {
    const analysis = await this.loadAnalysis(analysisId);
    if (!analysis) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }

    const updated: PatternAnalysisState = {
      ...analysis,
      feedback: {
        helpful,
        comment,
        submittedAt: new Date()
      }
    };

    await this.saveAnalysisState(updated);
  }

  /**
   * Delete analysis
   */
  async deleteAnalysis(analysisId: string): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(analysisId);

      request.onsuccess = () => {
        console.log(`🗑️ [Pattern Storage] Deleted analysis: ${analysisId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to delete analysis:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get analyses pending review (completed but not viewed)
   */
  async getPendingReviewAnalyses(): Promise<PatternAnalysisState[]> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = (request.result || []).map((data: any) => ({
          ...data,
          createdAt: new Date(data.createdAt),
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
          viewedAt: data.viewedAt ? new Date(data.viewedAt) : undefined,
          dismissedAt: data.dismissedAt ? new Date(data.dismissedAt) : undefined
        }));

        const pending = all.filter(
          a => a.status === 'completed' && !a.viewedAt && !a.dismissedAt
        );

        pending.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        resolve(pending);
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to get pending analyses:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get count of pending review analyses
   */
  async getPendingReviewCount(): Promise<number> {
    const pending = await this.getPendingReviewAnalyses();
    return pending.length;
  }

  /**
   * Clear all data (for testing/debugging)
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('🧹 [Pattern Storage] Cleared all pattern analyses');
        resolve();
      };

      request.onerror = () => {
        console.error(`❌ [Pattern Storage] Failed to clear data:`, request.error);
        reject(request.error);
      };
    });
  }
}

/**
 * Get singleton instance
 */
export function getPatternAnalysisStorage(): PatternAnalysisStorage {
  return PatternAnalysisStorage.getInstance();
}

