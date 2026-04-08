/**
 * Sub-Agent: analyze_longitudinal_patterns
 *
 * Wraps the existing ClinicalPatternAnalyzer to expose longitudinal
 * pattern analysis as a tool the main agent can delegate to.
 */

import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';

const logger = createLogger('subagent');

/**
 * Converts the tool's session_history argument into ChatMessage[] format
 * expected by ClinicalPatternAnalyzer.
 */
function convertToChatMessages(
  sessionHistory: Array<{ role: string; content: string; timestamp?: string }>,
): Array<{ id: string; content: string; role: 'user' | 'model'; timestamp: Date; }> {
  return sessionHistory.map((entry, index) => ({
    id: `msg_${index}_${Date.now()}`,
    content: entry.content,
    role: entry.role as 'user' | 'model',
    timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
  }));
}

/**
 * Formats a PatternAnalysis result into a human-readable structured response.
 */
function formatPatternAnalysis(analysis: any): string {
  const sections: string[] = [];

  sections.push(`# Análisis Longitudinal — ${analysis.patientName || 'Paciente'}`);
  sections.push(`Sesiones analizadas: ${analysis.sessionCount}`);
  if (analysis.dateRange) {
    sections.push(`Período: ${new Date(analysis.dateRange.firstSession).toLocaleDateString('es-CL')} — ${new Date(analysis.dateRange.lastSession).toLocaleDateString('es-CL')}`);
  }

  // Explored domains
  if (analysis.exploredDomains?.length) {
    sections.push(`\n## Dominios Explorados`);
    for (const d of analysis.exploredDomains) {
      sections.push(`- **${d.domain}** (frecuencia: ${d.frequency}, ${d.sessionCount} sesiones)`);
      if (d.techniques?.length) sections.push(`  Técnicas: ${d.techniques.join(', ')}`);
    }
  }

  // Unexplored domains
  if (analysis.unexploredDomains?.length) {
    sections.push(`\n## Dominios No Explorados`);
    for (const d of analysis.unexploredDomains) {
      sections.push(`- **${d.domain}** (relevancia: ${(d.relevanceScore * 100).toFixed(0)}%)`);
      if (d.supervisoryRationale) sections.push(`  Razón: ${d.supervisoryRationale}`);
    }
  }

  // Reflective questions
  if (analysis.reflectiveQuestions?.length) {
    sections.push(`\n## Preguntas Reflexivas`);
    for (const q of analysis.reflectiveQuestions) {
      sections.push(`- [${q.priority}] ${q.question}`);
      if (q.rationale) sections.push(`  Fundamento: ${q.rationale}`);
    }
  }

  // Therapeutic alliance
  if (analysis.therapeuticAlliance) {
    const ta = analysis.therapeuticAlliance;
    sections.push(`\n## Alianza Terapéutica`);
    if (ta.collaborationIndicators?.length) {
      sections.push(`- Indicadores de colaboración: ${ta.collaborationIndicators.join('; ')}`);
    }
    if (ta.ruptureIndicators?.length) {
      sections.push(`- Indicadores de ruptura: ${ta.ruptureIndicators.join('; ')}`);
    }
    if (ta.developmentSuggestions?.length) {
      sections.push(`- Sugerencias: ${ta.developmentSuggestions.join('; ')}`);
    }
  }

  // Meta insights
  if (analysis.meta) {
    sections.push(`\n## Meta-Perspectiva`);
    if (analysis.meta.dominantApproach) sections.push(`- Enfoque dominante: ${analysis.meta.dominantApproach}`);
    if (analysis.meta.therapeuticStyle) sections.push(`- Estilo terapéutico: ${analysis.meta.therapeuticStyle}`);
    if (analysis.meta.growthOpportunities?.length) {
      sections.push(`- Oportunidades de crecimiento: ${analysis.meta.growthOpportunities.join('; ')}`);
    }
  }

  return sections.join('\n');
}

export async function executeAnalyzeLongitudinalPatterns(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  const patientId = args.patient_id as string;
  const sessionHistory = args.session_history as Array<{ role: string; content: string; timestamp?: string }>;

  try {
    logger.info(`[subagent:analyze_longitudinal_patterns] patient=${patientId} sessions=${sessionHistory.length}`);

    ctx.onProgress?.(`Procesando ${sessionHistory.length} mensajes de sesión`);

    // Run independent operations in parallel:
    // - Fetch patient name from Firestore (I/O bound)
    // - Import pattern analyzer module (lazy load)
    // - Convert session history (CPU bound, synchronous but interleaved)
    ctx.onProgress?.('Cargando datos y preparando análisis en paralelo…');

    const chatMessages = convertToChatMessages(sessionHistory);

    const [patientName, { createClinicalPatternAnalyzer }] = await Promise.all([
      // 1. Fetch patient display name (non-blocking — fallback to 'Paciente')
      (async () => {
        try {
          const { loadPatientFromFirestore } = await import('../../hopeai-system');
          const record = await loadPatientFromFirestore(ctx.psychologistId, patientId);
          return record?.displayName || 'Paciente';
        } catch {
          logger.warn('[subagent:analyze_longitudinal_patterns] Could not fetch patient name');
          return 'Paciente';
        }
      })(),
      // 2. Import analyzer module
      import('../../clinical-pattern-analyzer'),
    ]);

    ctx.onProgress?.(`Paciente: ${patientName} | ${chatMessages.length} mensajes preparados`);

    const analyzer = createClinicalPatternAnalyzer();

    ctx.onProgress?.(`Analizando patrones de ${patientName} con Gemini…`);
    const analysis = await analyzer.analyzePatientPatterns(
      patientId,
      patientName,
      chatMessages as any, // ChatMessage[] shape — id, content, role, timestamp are present
      'manual_request',
    );

    ctx.onProgress?.('Formateando resultados del análisis…');
    const formattedAnalysis = formatPatternAnalysis(analysis);
    const durationMs = Date.now() - start;

    const exploredCount = analysis.exploredDomains?.length || 0;
    const unexploredCount = analysis.unexploredDomains?.length || 0;
    ctx.onProgress?.(`Análisis completado: ${exploredCount} dominios explorados, ${unexploredCount} no explorados (${(durationMs / 1000).toFixed(1)}s)`);
    logger.info(`[subagent:analyze_longitudinal_patterns] completed in ${durationMs}ms`);

    return {
      name: 'analyze_longitudinal_patterns',
      response: {
        analysis: formattedAnalysis,
        domains: {
          explored: analysis.exploredDomains?.map((d: any) => d.domain) || [],
          unexplored: analysis.unexploredDomains?.map((d: any) => d.domain) || [],
        },
        sessionCount: analysis.sessionCount,
        durationMs,
      },
    };
  } catch (error) {
    logger.error('[subagent:analyze_longitudinal_patterns] Error:', error);
    return {
      name: 'analyze_longitudinal_patterns',
      response: { error: 'Error en análisis longitudinal', details: String(error) },
    };
  }
}
