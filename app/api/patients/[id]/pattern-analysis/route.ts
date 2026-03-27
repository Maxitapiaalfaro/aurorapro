/**
 * Longitudinal Analysis API Endpoint
 * 
 * Handles generation of Longitudinal Analysis insights for patients.
 * Analysis is returned to client for storage in IndexedDB.
 * 
 * POST   - Generate longitudinal analysis (returns complete analysis)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClinicalPatternAnalyzer } from '@/lib/clinical-pattern-analyzer';
import * as Sentry from '@sentry/nextjs';

/**
 * POST - Generate pattern analysis for a patient
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  
  return await Sentry.startSpan(
    {
      op: 'http.server',
      name: 'POST /api/patients/[id]/pattern-analysis',
    },
    async (span) => {
      try {
        span?.setAttribute('patient.id', patientId);

        const body = await request.json();
        const { 
          sessionHistory, 
          patientName,
          triggerReason = 'manual_request',
          culturalContext = 'general'
        } = body;

        console.log(`🔍 [Análisis Longitudinal API] Starting analysis for patient ${patientId}`);

        // Validate input
        if (!sessionHistory || !Array.isArray(sessionHistory)) {
          return NextResponse.json(
            { error: 'Invalid session history' },
            { status: 400 }
          );
        }

        if (!patientName) {
          return NextResponse.json(
            { error: 'Patient name is required' },
            { status: 400 }
          );
        }

        // Generate analysis ID
        const analysisId = `analysis_${patientId}_${Date.now()}`;

        console.log(`🧠 [Análisis Longitudinal] Generating analysis: ${analysisId}`);

        // Create analyzer with cultural context
        const analyzer = createClinicalPatternAnalyzer({
          culturalContext: culturalContext as any,
          minSessionsForAnalysis: 3,
          includeMetaInsights: true,
          languageStyle: 'conversational'
        });

        // Perform analysis (this may take a minute)
        const analysis = await analyzer.analyzePatientPatterns(
          patientId,
          patientName,
          sessionHistory,
          triggerReason as any
        );

        console.log(`✅ [Análisis Longitudinal API] Analysis completed: ${analysisId}`);

        // Return complete analysis to client
        // Client will save to IndexedDB
        return NextResponse.json({
          success: true,
          analysisId,
          patientId,
          analysis,
          createdAt: new Date().toISOString(),
          message: 'Pattern analysis completed successfully'
        });

      } catch (error) {
        console.error(`❌ [Análisis Longitudinal API] Error:`, error);
        Sentry.captureException(error, {
          tags: {
            component: 'pattern-mirror-api',
            patient_id: patientId
          }
        });

        return NextResponse.json(
          { 
            error: 'Failed to start pattern analysis',
            details: error instanceof Error ? error.message : 'Unknown error'
          },
          { status: 500 }
        );
      }
    }
  );
}


