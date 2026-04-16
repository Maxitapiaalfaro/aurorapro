/**
 * Sub-Agent: research_evidence
 *
 * Decomposes a research question into 2-3 sub-queries, runs parallel
 * academic searches, and synthesizes findings via a one-shot Gemini call.
 */

import { ai } from '../../google-genai-config';
import { ThinkingLevel } from '@google/genai';
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
 * Detects polypharmacy queries (multiple drug names)
 */
function detectPolypharmacy(query: string): string[] {
  // Common psychiatric medication patterns
  const drugPatterns = [
    /\b(venlafaxin[ae]?|efexor)\b/gi,
    /\b(lisdexamfetamin[ae]?|vyvanse)\b/gi,
    /\b(mirtazapin[ae]?|remeron)\b/gi,
    /\b(sertralina?|zoloft)\b/gi,
    /\b(fluoxetin[ae]?|prozac)\b/gi,
    /\b(escitalopram|lexapro)\b/gi,
    /\b(quetiapina?|seroquel)\b/gi,
    /\b(aripiprazol|abilify)\b/gi,
    /\b(lamotrigina?|lamictal)\b/gi,
    /\b(bupropion|wellbutrin)\b/gi,
    /\b(clonazepam|klonopin|rivotril)\b/gi,
    /\b(metilfenidat[oa]?|ritalin)\b/gi,
  ];

  const foundDrugs: string[] = [];
  for (const pattern of drugPatterns) {
    const match = query.match(pattern);
    if (match) {
      foundDrugs.push(match[0]);
    }
  }

  return foundDrugs;
}

/**
 * 4-LEVEL FALLBACK STRATEGY for complex polypharmacy queries
 * Level 1: Full query (all drugs + comorbidities)
 * Level 2: Pairwise drug interactions
 * Level 3: Individual drug mechanisms + comorbidity
 * Level 4: Drug classes + general treatment principles
 */
interface FallbackLevel {
  level: number;
  queries: string[];
  description: string;
  minResults: number;
}

function generateFallbackLevels(originalQuery: string, focusArea?: string): FallbackLevel[] {
  const drugs = detectPolypharmacy(originalQuery);
  const levels: FallbackLevel[] = [];

  // LEVEL 1: Full query (exact as-is)
  levels.push({
    level: 1,
    queries: [originalQuery],
    description: 'Búsqueda completa (todos los fármacos y comorbilidades)',
    minResults: 3,
  });

  // LEVEL 2: Pairwise interactions (if 3+ drugs detected)
  if (drugs.length >= 3) {
    const pairwiseQueries: string[] = [];
    for (let i = 0; i < drugs.length - 1; i++) {
      for (let j = i + 1; j < drugs.length; j++) {
        pairwiseQueries.push(`${drugs[i]} ${drugs[j]} drug interaction pharmacodynamics`);
      }
    }
    levels.push({
      level: 2,
      queries: pairwiseQueries.slice(0, 4), // Max 4 pairwise combinations
      description: 'Interacciones farmacológicas por pares',
      minResults: 2,
    });
  }

  // LEVEL 3: Individual mechanisms + comorbidity keywords
  if (drugs.length >= 2) {
    const mechanismQueries = drugs.map((drug) => {
      // Extract comorbidity keywords from original query
      const comorbidities = originalQuery.match(/\b(ASD|TEA|bipolar|TEPT|PTSD|depresión|ansiedad|TDA|TDAH)\b/gi);
      const comorbidity = comorbidities?.[0] || 'psychiatric treatment';
      return `${drug} mechanism of action ${comorbidity}`;
    });
    levels.push({
      level: 3,
      queries: mechanismQueries,
      description: 'Mecanismos de acción individuales + comorbilidad',
      minResults: 1,
    });
  }

  // LEVEL 4: Drug classes + general principles (always available as ultimate fallback)
  const classQuery = drugs.length >= 2
    ? 'polypharmacy psychiatric treatment antidepressant stimulant guidelines'
    : `${originalQuery} treatment guidelines evidence-based`;

  levels.push({
    level: 4,
    queries: [classQuery, 'psychopharmacology combination therapy clinical practice'],
    description: 'Principios generales de tratamiento farmacológico combinado',
    minResults: 1,
  });

  return levels;
}

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

/**
 * Generates pharmacological reasoning when no literature is found
 * Uses Gemini Flash-Lite for low-cost mechanism-based analysis
 */
async function generatePharmacologicalFallback(query: string, drugs: string[]): Promise<string> {
  const logger = createLogger('subagent');
  logger.info(`[subagent:research_evidence] Generating pharmacological fallback for ${drugs.length} drugs`);

  const fallbackPrompt = `
CONTEXTO CLÍNICO:
El clínico preguntó: "${query}"

Fármacos detectados: ${drugs.join(', ')}

NO SE ENCONTRÓ LITERATURA ESPECÍFICA para esta combinación exacta.

TAREA:
Como farmacólogo clínico, proporciona un análisis basado en principios farmacológicos generales:

1. **Mecanismos de Acción**: Para cada fármaco, describe brevemente su mecanismo principal (receptores, neurotransmisores)
2. **Interacciones Teóricas**: Basándote en farmacología, identifica posibles interacciones farmacodinámicas o farmacocinéticas
3. **Consideraciones Clínicas**: Qué monitorear en un paciente con esta combinación
4. **Recomendaciones de Evidencia**: Sugiere búsquedas alternativas (ej: interacciones por pares, estudios de mecanismos individuales)
5. **ADVERTENCIA EXPLÍCITA**: Indica claramente que este análisis es teórico, no basado en estudios específicos de esta combinación

FORMATO: Profesional, estructurado, breve (máx 600 palabras)
IDIOMA: Español académico
TONO: Cauteloso, científicamente riguroso
`.trim();

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
      config: {
        systemInstruction:
          'Eres un farmacólogo clínico especializado en psicofarmacología. Proporcionas análisis basados en principios farmacológicos generales cuando no existe evidencia específica. Eres cauteloso y transparente sobre las limitaciones.',
        temperature: 1.0,
        maxOutputTokens: 2048,
      },
    });

    const fallbackText = result.text || 'No se pudo generar análisis farmacológico.';
    return `## Análisis Farmacológico (Sin Literatura Específica)\n\n${fallbackText}\n\n---\n\n**NOTA IMPORTANTE**: Este análisis se basa en principios farmacológicos generales, no en estudios específicos de esta combinación de fármacos. Se recomienda consultar con un psiquiatra especializado en psicofarmacología compleja y buscar literatura sobre interacciones por pares.`;
  } catch (error) {
    logger.error('[subagent:research_evidence] Fallback generation failed:', error);
    return `## Sin Resultados de Investigación

No se encontró literatura académica específica para la consulta: "${query}"

**Recomendaciones**:
- Buscar estudios sobre interacciones farmacológicas por pares (ej: "${drugs[0]} + ${drugs[1]}")
- Revisar mecanismos de acción individuales de cada fármaco
- Consultar bases de datos de interacciones farmacológicas (ej: Micromedex, Lexicomp)
- Contactar a un psiquiatra especializado en psicofarmacología compleja

**Fármacos identificados**: ${drugs.join(', ')}`;
  }
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

    // Step 1: Detect polypharmacy and generate fallback levels
    const drugs = detectPolypharmacy(researchQuestion);
    const isPolypharmacy = drugs.length >= 2;

    if (isPolypharmacy) {
      logger.info(`[subagent:research_evidence] Polypharmacy detected: ${drugs.join(', ')}`);
      ctx.onProgress?.(`Polifarmacia detectada (${drugs.length} fármacos) — activando estrategia de búsqueda multinivel`);
    }

    const fallbackLevels = isPolypharmacy
      ? generateFallbackLevels(researchQuestion, focusArea)
      : [
          {
            level: 1,
            queries: decomposeResearchQuestion(researchQuestion, focusArea),
            description: 'Búsqueda académica estándar',
            minResults: 1,
          },
        ];

    // Step 2: Execute fallback levels SEQUENTIALLY (early exit on success)
    const seenDois = new Set<string>();
    const seenTitles = new Set<string>();
    const allResults: any[] = [];
    let currentLevel = 1;
    let levelUsed = 1;

    for (const level of fallbackLevels) {
      ctx.onProgress?.(`Nivel ${level.level}: ${level.description}…`);
      logger.info(`[subagent:research_evidence] Trying fallback level ${level.level}: ${level.queries.length} queries`);

      // Run all queries in this level in PARALLEL
      const levelSearchResults = await Promise.all(
        level.queries.map(async (query, i) => {
          const truncatedQuery = query.length > 50 ? query.substring(0, 50) + '…' : query;
          try {
            const result = await academicMultiSourceSearch.search({
              query,
              maxResults: Math.ceil(maxSources / level.queries.length),
              language: 'both' as const,
              minTrustScore: level.level === 1 ? 60 : Math.max(40, 70 - level.level * 10), // Lower threshold for deeper levels
            });
            const found = result?.sources?.length ?? 0;
            ctx.onProgress?.(`  Query ${i + 1}/${level.queries.length}: ${found} resultados — "${truncatedQuery}"`);
            return result;
          } catch (err: any) {
            logger.warn(`[subagent:research_evidence] Level ${level.level} query failed: ${err.message}`);
            ctx.onProgress?.(`  Query ${i + 1}/${level.queries.length} falló: "${truncatedQuery}"`);
            return { sources: [], metadata: { totalFound: 0 } };
          }
        }),
      );

      // Deduplicate and collect from this level
      let levelResultCount = 0;
      for (const result of levelSearchResults) {
        if (!result?.sources) continue;
        for (const r of result.sources) {
          const dedupeKey = r.doi || r.title?.toLowerCase();
          if (dedupeKey && (seenDois.has(dedupeKey) || seenTitles.has(dedupeKey))) continue;
          if (r.doi) seenDois.add(r.doi);
          if (r.title) seenTitles.add(r.title.toLowerCase());

          allResults.push(r);
          levelResultCount++;

          // Populate academicReferences for grounding metadata
          ctx.academicReferences.push({
            title: r.title || 'Sin título',
            url: r.url || '',
            doi: r.doi,
            authors: r.authors?.join(', '),
            year: r.year,
            journal: r.journal,
          });
        }
      }

      ctx.onProgress?.(`  Nivel ${level.level}: ${levelResultCount} nuevos resultados (total acumulado: ${allResults.length})`);

      // Early exit if we have enough results
      if (allResults.length >= level.minResults) {
        levelUsed = level.level;
        logger.info(`[subagent:research_evidence] Early exit at level ${level.level} with ${allResults.length} results`);
        break;
      } else {
        logger.info(`[subagent:research_evidence] Level ${level.level} insufficient (${allResults.length} < ${level.minResults}), continuing…`);
      }
    }

    ctx.onProgress?.(`${allResults.length} fuentes únicas tras deduplicación (estrategia nivel ${levelUsed})`);

    if (allResults.length === 0) {
      // Generate pharmacological reasoning fallback
      ctx.onProgress?.('No se encontraron resultados — generando análisis farmacológico basado en principios…');
      const fallbackSynthesis = await generatePharmacologicalFallback(researchQuestion, drugs);
      return {
        name: 'research_evidence',
        response: {
          synthesis: fallbackSynthesis,
          sourcesCount: 0,
          fallbackUsed: true,
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
        temperature: 1.0,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        },
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
