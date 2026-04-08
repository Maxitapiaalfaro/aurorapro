/**
 * Sub-Agent: generate_clinical_document
 *
 * Generates structured clinical documents (SOAP, DAP, BIRP, treatment plans,
 * case summaries) via a one-shot Gemini call with a documentation-specialized prompt.
 */

import { ai } from '../../google-genai-config';
import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';
import { SUBAGENT_MODEL } from './types';

const logger = createLogger('subagent');

const SYSTEM_PROMPT = `Eres un especialista en documentación clínica psicológica. Generas documentos estructurados profesionales.

FORMATOS SOPORTADOS:
- **SOAP**: Subjetivo (reporte del paciente, citas textuales) / Objetivo (observaciones clínicas, conducta no verbal, estado mental) / Análisis (formulación clínica, hipótesis, conexiones con sesiones previas) / Plan (intervenciones propuestas, tareas, próxima sesión)
- **DAP**: Datos (hechos reportados y observados) / Análisis (interpretación clínica) / Plan (siguientes pasos)
- **BIRP**: Comportamiento (conductas observadas) / Intervención (técnicas aplicadas) / Respuesta (reacción del paciente) / Plan (continuidad)
- **plan_tratamiento**: Objetivos terapéuticos, intervenciones, timeline, indicadores de progreso
- **resumen_caso**: Resumen clínico integral del caso con evolución

REGLAS:
- NUNCA inventes información ausente del material fuente
- Marca información faltante como "[Requiere clarificación]"
- Distingue observaciones objetivas de interpretaciones clínicas
- Usa citas textuales del paciente cuando preserven precisión clínica
- Extensión: 200-400 palabras (sesión estándar), 400-800 (sesión compleja o plan de tratamiento)

Idioma: español clínico profesional apropiado para expedientes psicológicos.`;

export async function executeGenerateClinicalDocument(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const start = Date.now();
  const documentType = args.document_type as string;
  const conversationContext = args.conversation_context as string;
  const patientId = args.patient_id as string | undefined;
  const additionalInstructions = args.additional_instructions as string | undefined;

  try {
    logger.info(`[subagent:generate_clinical_document] type=${documentType} patient=${patientId || 'none'}`);

    ctx.onProgress?.(`Iniciando documento tipo ${documentType}`);

    // Optional patient context enrichment
    let patientContext = '';
    if (patientId && ctx.psychologistId) {
      try {
        ctx.onProgress?.('Conectando con Firestore…');
        const { loadPatientFromFirestore } = await import('../../hopeai-system');

        ctx.onProgress?.('Cargando registro del paciente…');
        const record = await loadPatientFromFirestore(ctx.psychologistId, patientId);

        if (record) {
          patientContext = `\n\n## Datos del Paciente\n- Nombre: ${record.displayName || 'No especificado'}`;
          if (record.tags?.length) patientContext += `\n- Tags: ${record.tags.join(', ')}`;
          if (record.notes) patientContext += `\n- Notas: ${record.notes}`;
          ctx.onProgress?.(`Registro cargado: ${record.displayName || patientId}`);
        } else {
          ctx.onProgress?.('Paciente no encontrado, continuando sin contexto');
        }
      } catch {
        logger.warn('[subagent:generate_clinical_document] Could not fetch patient record');
        ctx.onProgress?.('No se pudo cargar registro, continuando…');
      }
    }

    ctx.onProgress?.('Preparando contenido de sesión…');

    const prompt = [
      `Genera un documento clínico tipo **${documentType}** basado en el siguiente contenido de sesión.`,
      `\n## Contenido de la Sesión\n${conversationContext}`,
      patientContext,
      additionalInstructions ? `\n## Instrucciones Adicionales\n${additionalInstructions}` : '',
    ].filter(Boolean).join('\n');

    ctx.onProgress?.('Construyendo prompt de generación…');
    ctx.onProgress?.(`Generando documento ${documentType} con Gemini Flash…`);

    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 1.0,
        thinkingConfig: {
          thinkingLevel: 'low'
        },
        maxOutputTokens: 8192,
      },
    });

    const document = result.text || 'No se pudo generar el documento';
    const durationMs = Date.now() - start;

    ctx.onProgress?.(`Documento ${documentType} completado (${(durationMs / 1000).toFixed(1)}s)`);
    logger.info(`[subagent:generate_clinical_document] completed in ${durationMs}ms`);

    return {
      name: 'generate_clinical_document',
      response: { document, documentType, durationMs },
    };
  } catch (error) {
    logger.error('[subagent:generate_clinical_document] Error:', error);
    return {
      name: 'generate_clinical_document',
      response: { error: 'Error al generar documento clínico', details: String(error) },
    };
  }
}
