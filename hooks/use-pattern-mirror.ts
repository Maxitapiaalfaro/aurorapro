/**
 * Pattern Mirror Hook
 * 
 * React hook for accessing Pattern Mirror insights and managing
 * pattern analysis lifecycle.
 */

import { useState, useEffect, useCallback } from 'react';
import { getPatternAnalysisStorage, type PatternAnalysisState } from '@/lib/pattern-analysis-storage';
import type { PatternAnalysis } from '@/lib/clinical-pattern-analyzer';
import type { ChatMessage } from '@/types/clinical-types';

export interface UsePatternMirrorReturn {
  // Analysis state
  latestAnalysis: PatternAnalysisState | null;
  allAnalyses: PatternAnalysisState[];
  isLoading: boolean;
  error: string | null;
  
  // Analysis actions
  generateAnalysis: (
    patientId: string,
    patientName: string,
    sessionHistory: ChatMessage[],
    culturalContext?: 'spain' | 'latinamerica' | 'general'
  ) => Promise<string>; // Returns analysisId
  
  loadLatestAnalysis: (patientId: string) => Promise<void>;
  loadAllAnalyses: (patientId: string) => Promise<void>;
  
  // Engagement actions
  markAsViewed: (analysisId: string) => Promise<void>;
  markAsDismissed: (analysisId: string) => Promise<void>;
  submitFeedback: (analysisId: string, helpful: boolean, comment?: string) => Promise<void>;
  
  // Polling for completion
  startPolling: (analysisId: string) => void;
  stopPolling: () => void;
  
  // Pending review count
  pendingCount: number;
  refreshPendingCount: () => Promise<void>;
}

/**
 * Hook for Pattern Mirror functionality
 */
export function usePatternMirror(): UsePatternMirrorReturn {
  const [latestAnalysis, setLatestAnalysis] = useState<PatternAnalysisState | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<PatternAnalysisState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Polling state
  const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);

  /**
   * Generate new pattern analysis
   */
  const generateAnalysis = useCallback(async (
    patientId: string,
    patientName: string,
    sessionHistory: ChatMessage[],
    culturalContext: 'spain' | 'latinamerica' | 'general' = 'general'
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log(`🔍 [Pattern Mirror Hook] Generating analysis for ${patientName}`);

      const response = await fetch(`/api/patients/${encodeURIComponent(patientId)}/pattern-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionHistory,
          patientName,
          triggerReason: 'manual_request',
          culturalContext
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate analysis');
      }

      const data = await response.json();
      const analysisId = data.analysisId;

      console.log(`✅ [Pattern Mirror Hook] Analysis started: ${analysisId}`);

      // Start polling for completion
      startPolling(analysisId);

      return analysisId;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ [Pattern Mirror Hook] Error generating analysis:`, err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load latest completed analysis for a patient
   */
  const loadLatestAnalysis = useCallback(async (patientId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();

      const latest = await storage.getLatestAnalysis(patientId);
      setLatestAnalysis(latest);

      console.log(`📊 [Pattern Mirror Hook] Loaded latest analysis for patient ${patientId}:`, latest?.analysisId || 'none');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ [Pattern Mirror Hook] Error loading latest analysis:`, err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load all analyses for a patient
   */
  const loadAllAnalyses = useCallback(async (patientId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();

      const analyses = await storage.getPatientAnalyses(patientId);
      setAllAnalyses(analyses);

      console.log(`📊 [Pattern Mirror Hook] Loaded ${analyses.length} analyses for patient ${patientId}`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ [Pattern Mirror Hook] Error loading analyses:`, err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Mark analysis as viewed
   */
  const markAsViewed = useCallback(async (analysisId: string): Promise<void> => {
    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      await storage.markAsViewed(analysisId);

      // Update local state
      if (latestAnalysis?.analysisId === analysisId) {
        setLatestAnalysis({
          ...latestAnalysis,
          viewedAt: new Date(),
          viewCount: latestAnalysis.viewCount + 1
        });
      }

      console.log(`👁️ [Pattern Mirror Hook] Marked as viewed: ${analysisId}`);

    } catch (err) {
      console.error(`❌ [Pattern Mirror Hook] Error marking as viewed:`, err);
    }
  }, [latestAnalysis]);

  /**
   * Mark analysis as dismissed
   */
  const markAsDismissed = useCallback(async (analysisId: string): Promise<void> => {
    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      await storage.markAsDismissed(analysisId);

      // Update local state
      if (latestAnalysis?.analysisId === analysisId) {
        setLatestAnalysis({
          ...latestAnalysis,
          dismissedAt: new Date()
        });
      }

      console.log(`🚫 [Pattern Mirror Hook] Marked as dismissed: ${analysisId}`);

    } catch (err) {
      console.error(`❌ [Pattern Mirror Hook] Error marking as dismissed:`, err);
    }
  }, [latestAnalysis]);

  /**
   * Submit feedback on analysis
   */
  const submitFeedback = useCallback(async (
    analysisId: string,
    helpful: boolean,
    comment?: string
  ): Promise<void> => {
    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      await storage.submitFeedback(analysisId, helpful, comment);

      // Update local state
      if (latestAnalysis?.analysisId === analysisId) {
        setLatestAnalysis({
          ...latestAnalysis,
          feedback: {
            helpful,
            comment,
            submittedAt: new Date()
          }
        });
      }

      console.log(`💬 [Pattern Mirror Hook] Feedback submitted: ${analysisId}`, { helpful, comment });

    } catch (err) {
      console.error(`❌ [Pattern Mirror Hook] Error submitting feedback:`, err);
    }
  }, [latestAnalysis]);

  /**
   * Start polling for analysis completion
   */
  const startPolling = useCallback((analysisId: string): void => {
    // Stop any existing polling
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }

    console.log(`🔄 [Pattern Mirror Hook] Starting polling for ${analysisId}`);

    const intervalId = setInterval(async () => {
      try {
        const storage = getPatternAnalysisStorage();
        await storage.initialize();
        
        const analysis = await storage.loadAnalysis(analysisId);

        if (!analysis) return;

        if (analysis.status === 'completed' || analysis.status === 'error') {
          // Analysis finished, stop polling
          console.log(`✅ [Pattern Mirror Hook] Polling complete. Status: ${analysis.status}`);
          setLatestAnalysis(analysis);
          clearInterval(intervalId);
          setPollingIntervalId(null);
        }

      } catch (err) {
        console.error(`❌ [Pattern Mirror Hook] Polling error:`, err);
      }
    }, 3000); // Poll every 3 seconds

    setPollingIntervalId(intervalId);
  }, [pollingIntervalId]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback((): void => {
    if (pollingIntervalId) {
      console.log(`⏹️ [Pattern Mirror Hook] Stopping polling`);
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
  }, [pollingIntervalId]);

  /**
   * Refresh pending review count
   */
  const refreshPendingCount = useCallback(async (): Promise<void> => {
    try {
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      const count = await storage.getPendingReviewCount();
      setPendingCount(count);
    } catch (err) {
      console.error(`❌ [Pattern Mirror Hook] Error refreshing pending count:`, err);
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  // Load pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return {
    latestAnalysis,
    allAnalyses,
    isLoading,
    error,
    generateAnalysis,
    loadLatestAnalysis,
    loadAllAnalyses,
    markAsViewed,
    markAsDismissed,
    submitFeedback,
    startPolling,
    stopPolling,
    pendingCount,
    refreshPendingCount
  };
}

