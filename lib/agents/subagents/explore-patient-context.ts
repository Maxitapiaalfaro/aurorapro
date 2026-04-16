/**
 * Sub-Agent: explore_patient_context
 *
 * Aggregates patient record + memories + relevant memories into a
 * synthesized clinical summary via a one-shot Gemini call.
 */

import { ai } from '../../google-genai-config';
import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';
import { SUBAGENT_MODEL } from './types';

const logger = createLogger('subagent');

const SYSTEM_PROMPT = `Eres un asistente de síntesis clínica. Recibes datos crudos de un paciente (registro, memorias inter-sesión, datos demográficos) y produces un resumen clínico integrado.

FORMATO DE SALIDA:
1. **Datos Demográficos**: Edad, género, información relevante
2. **Motivo de Consulta / Foco Terapéutico**: Tags y notas del caso
3. **Temas Activos**: Patrones y observaciones recurrentes de memorias inter-sesión
4. **Preferencias Terapéuticas**: Estrategias que funcionan con este paciente
5. **Señales de Atención**: Riesgos, rupturas, o patrones preocupantes

Sé conciso (máximo 500 palabras). No inventes información. Si un dato no está disponible, omítelo.
Idioma: español clínico profesional.`;

export async function executeExplorePatientContext(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  const patientId = args.patientId as string;
  const contextHint = args.context_hint as string | undefined;

  try {
    logger.info(`[subagent:explore_patient_context] patient=${patientId}`);

    ctx.onProgress?.('Conectando con Firestore…');

    // Dynamic imports to avoid circular dependencies
    const [{ loadPatientFromFirestore }, { getPatientMemories, getRelevantMemoriesSemantic }] =
      await Promise.all([
        import('../../hopeai-system'),
        import('../../clinical-memory-system'),
      ]);

    // Run all independent Firestore reads in parallel:
    // - Patient record and memories are independent reads on the same patient
    // - Semantic memory search (if contextHint) is also independent
    ctx.onProgress?.('Cargando registro, memorias y contexto en paralelo…');

    const parallelFetches: [
      Promise<any>,                    // patient record
      Promise<any[]>,                  // all active memories
      Promise<any[]>,                  // semantic memories (or empty)
    ] = [
      loadPatientFromFirestore(ctx.psychologistId, patientId),
      getPatientMemories(ctx.psychologistId, patientId, { isActive: true, limit: 20 }),
      contextHint
        ? getRelevantMemoriesSemantic(ctx.psychologistId, patientId, contextHint, 5)
        : Promise.resolve([]),
    ];

    const [record, memories, relevantMemories] = await Promise.all(parallelFetches);

    if (!record) {
      return {
        name: 'explore_patient_context',
        response: { error: 'Paciente no encontrado', patientId },
      };
    }

    ctx.onProgress?.(`Registro: ${record.displayName || patientId} | ${memories.length} memorias | ${relevantMemories.length} contextuales`);

    ctx.onProgress?.('Construyendo prompt de síntesis…');

    // Compose synthesis prompt with raw data
    const sections: string[] = [];

    sections.push(`## Registro del Paciente`);
    sections.push(`- Nombre: ${record.displayName || 'No especificado'}`);
    if (record.demographics) {
      sections.push(`- Demográficos: ${JSON.stringify(record.demographics)}`);
    }
    if (record.tags?.length) {
      sections.push(`- Tags: ${record.tags.join(', ')}`);
    }
    if (record.notes) {
      sections.push(`- Notas: ${record.notes}`);
    }
    if (record.summaryCache?.text) {
      sections.push(`- Resumen existente: ${record.summaryCache.text}`);
    }

    if (memories.length > 0) {
      sections.push(`\n## Memorias Clínicas Inter-Sesión (${memories.length})`);
      for (const m of memories) {
        sections.push(`- [${m.category}] ${m.content} (confianza: ${m.confidence})`);
      }
    }

    if (relevantMemories.length > 0) {
      sections.push(`\n## Memorias Relevantes al Contexto Actual`);
      for (const m of relevantMemories) {
        sections.push(`- [${m.category}] ${m.content}`);
      }
    }

    if (contextHint) {
      sections.push(`\n## Contexto de la Consulta Actual\n${contextHint}`);
    }

    const synthesisPrompt = `Sintetiza la siguiente información clínica del paciente en un resumen integrado:\n\n${sections.join('\n')}`;

    ctx.onProgress?.('Generando síntesis clínica con Gemini Flash…');

    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 1.0,
        maxOutputTokens: 4096,
      },
    });

    const summary = result.text || 'No se pudo generar síntesis';
    const durationMs = Date.now() - start;

    ctx.onProgress?.(`Síntesis completada (${(durationMs / 1000).toFixed(1)}s)`);
    logger.info(`[subagent:explore_patient_context] completed in ${durationMs}ms`);

    return {
      name: 'explore_patient_context',
      response: { summary, patientId, memoriesCount: memories.length, durationMs },
    };
  } catch (error) {
    logger.error('[subagent:explore_patient_context] Error:', error);
    return {
      name: 'explore_patient_context',
      response: { error: 'Error al sintetizar contexto del paciente', details: String(error) },
    };
  }
}
