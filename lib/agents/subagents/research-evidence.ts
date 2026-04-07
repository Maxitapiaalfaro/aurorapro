/**
 * Sub-Agent: research_evidence
 *
 * Decomposes a research question into 2-3 sub-queries, runs parallel
 * academic searches, and synthesizes findings via a one-shot Gemini call.
 */

import { ai } from '../../google-genai-config';
import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';
import { SUBAGENT_MODEL } from './types';

const logger = createLogger('subagent');

const SYNTHESIS_SYSTEM_PROMPT = `Eres un investigador académico especializado en psicología clínica. Recibes resultados de múltiples búsquedas académicas y produces una síntesis de evidencia integrada.

FORMATO DE SALIDA:
1. **Síntesis de Evidencia**: Hallazgos principales convergentes entre fuentes
2. **Nivel de Evidencia**: Para cada hallazgo, indica calidad (meta-análisis > RCT > observacional > caso clínico)
3. **Controversias**: Donde las fuentes divergen o evidencia es contradictoria
4. **Aplicabilidad Clínica**: Cómo traducir los hallazgos a la práctica terapéutica
5. **Limitaciones**: Gaps en la evidencia, poblaciones no representadas, sesgos metodológicos
6. **Referencias**: Lista numerada de fuentes citadas con DOI cuando esté disponible

Sé riguroso. Distingue evidencia robusta de exploratoria. No inventes citas.
Idioma: español académico profesional.`;

/**
 * Decomposes a research question into 2-3 focused sub-queries.
 * Uses deterministic decomposition to avoid an extra LLM call.
 */
function decomposeResearchQuestion(question: string, focusArea?: string): string[] {
  const queries: string[] = [];

  // Primary query: the question as-is
  queries.push(question);

  // Extract key terms for variation queries
  const clinicalTerms = question.match(
    /\b(terapia|tratamiento|intervención|eficacia|efectividad|EMDR|TCC|CBT|DBT|ACT|exposición|mindfulness|psicofarmac|comorbilid|TEPT|PTSD|depresión|ansiedad|trauma|apego|attachment)\b/gi,
  );

  if (clinicalTerms && clinicalTerms.length >= 2) {
    // Create a more specific query combining key terms
    queries.push(`${clinicalTerms[0]} ${clinicalTerms[1]} evidence-based clinical outcomes`);
  }

  // Add focus area as a third query if provided
  if (focusArea) {
    queries.push(`${question} ${focusArea}`);
  } else if (queries.length < 3) {
    // Create a meta-analysis/review focused query
    queries.push(`systematic review meta-analysis ${question}`);
  }

  return queries.slice(0, 3);
}

export async function executeResearchEvidence(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  const researchQuestion = args.research_question as string;
  const focusArea = args.focus_area as string | undefined;
  const maxSources = Math.min((args.max_sources as number) || 12, 20);

  try {
    logger.info(`[subagent:research_evidence] question="${researchQuestion}" focus="${focusArea || 'none'}"`);

    ctx.onProgress?.('Conectando con bases de datos académicas…');
    const { academicMultiSourceSearch } = await import('../../academic-multi-source-search');

    // Step 1: Decompose into sub-queries
    const subQueries = decomposeResearchQuestion(researchQuestion, focusArea);
    const perQueryMax = Math.ceil(maxSources / subQueries.length);

    ctx.onProgress?.(`Pregunta descompuesta en ${subQueries.length} sub-consultas`);
    logger.info(`[subagent:research_evidence] ${subQueries.length} sub-queries, ${perQueryMax} results each`);

    // Step 2: Search SEQUENTIALLY so each search reports in real-time
    const searchResults: any[] = [];
    for (let i = 0; i < subQueries.length; i++) {
      const query = subQueries[i];
      const truncatedQuery = query.length > 50 ? query.substring(0, 50) + '…' : query;
      ctx.onProgress?.(`Búsqueda ${i + 1}/${subQueries.length}: "${truncatedQuery}"`);

      try {
        const result = await academicMultiSourceSearch.search({
          query,
          maxResults: perQueryMax,
          language: 'both' as const,
          minTrustScore: 60,
        });
        searchResults.push(result);
        const found = result?.results?.length ?? 0;
        ctx.onProgress?.(`Búsqueda ${i + 1} completada: ${found} resultados`);
      } catch (err: any) {
        logger.warn(`[subagent:research_evidence] Search failed for query="${query}": ${err.message}`);
        searchResults.push({ results: [] });
        ctx.onProgress?.(`Búsqueda ${i + 1} falló, continuando…`);
      }
    }

    // Step 3: Deduplicate and collect references
    ctx.onProgress?.('Deduplicando resultados…');
    const seenDois = new Set<string>();
    const seenTitles = new Set<string>();
    const allResults: any[] = [];

    for (const result of searchResults) {
      if (!result?.results) continue;
      for (const r of result.results) {
        const dedupeKey = r.doi || r.title?.toLowerCase();
        if (dedupeKey && (seenDois.has(dedupeKey) || seenTitles.has(dedupeKey))) continue;
        if (r.doi) seenDois.add(r.doi);
        if (r.title) seenTitles.add(r.title.toLowerCase());

        allResults.push(r);

        // Populate academicReferences for grounding metadata (same pattern as direct tool)
        ctx.academicReferences.push({
          title: r.title || 'Sin título',
          url: r.url || '',
          doi: r.doi,
          authors: r.authors,
          year: r.year,
          journal: r.journal,
        });
      }
    }

    ctx.onProgress?.(`${allResults.length} fuentes únicas tras deduplicación`);

    if (allResults.length === 0) {
      return {
        name: 'research_evidence',
        response: {
          synthesis: 'No se encontraron resultados académicos para esta pregunta de investigación.',
          sourcesCount: 0,
          durationMs: Date.now() - start,
        },
      };
    }

    // Step 4: Synthesize via Gemini
    ctx.onProgress?.('Preparando datos para síntesis…');
    const sourceSummaries = allResults
      .map((r, i) => {
        const parts = [`[${i + 1}] "${r.title || 'Sin título'}"`];
        if (r.authors) parts.push(`Autores: ${r.authors}`);
        if (r.year) parts.push(`Año: ${r.year}`);
        if (r.journal) parts.push(`Revista: ${r.journal}`);
        if (r.doi) parts.push(`DOI: ${r.doi}`);
        if (r.abstract || r.snippet) parts.push(`Resumen: ${r.abstract || r.snippet}`);
        return parts.join(' | ');
      })
      .join('\n\n');

    const synthesisPrompt = [
      `Pregunta de investigación: ${researchQuestion}`,
      focusArea ? `Área de enfoque: ${focusArea}` : '',
      `\n## Fuentes Encontradas (${allResults.length}):\n\n${sourceSummaries}`,
      `\nSintetiza estos hallazgos en una revisión de evidencia integrada.`,
    ].filter(Boolean).join('\n');

    ctx.onProgress?.(`Sintetizando ${allResults.length} fuentes con Gemini Flash…`);

    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction: SYNTHESIS_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    });

    const synthesis = result.text || 'No se pudo generar síntesis';
    const durationMs = Date.now() - start;

    ctx.onProgress?.(`Síntesis completada (${(durationMs / 1000).toFixed(1)}s)`);
    logger.info(`[subagent:research_evidence] completed in ${durationMs}ms, ${allResults.length} sources`);

    return {
      name: 'research_evidence',
      response: { synthesis, sourcesCount: allResults.length, durationMs },
    };
  } catch (error) {
    logger.error('[subagent:research_evidence] Error:', error);
    return {
      name: 'research_evidence',
      response: { error: 'Error en investigación de evidencia', details: String(error) },
    };
  }
}
