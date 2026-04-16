/**
 * Sub-Agent: generate_clinical_document
 *
 * Generates structured clinical documents (SOAP, DAP, BIRP, treatment plans,
 * case summaries) via a **streaming** Gemini call with a documentation-specialized prompt.
 *
 * Enhanced for real-time preview: emits `document_preview` events section-by-section
 * as Gemini streams content, and a `document_ready` event when the full document is complete.
 * Falls back gracefully to one-shot generation when the streaming callbacks are unavailable.
 */

import { ai } from '../../google-genai-config';
import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';
import type { DocumentSection, DocumentSectionId } from '@/types/clinical-types';
import { SUBAGENT_MODEL } from './types';

const logger = createLogger('subagent');

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

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
- Cada sección DEBE empezar con un heading markdown nivel 2 (## Nombre de Sección)

Idioma: español clínico profesional apropiado para expedientes psicológicos.`;

// ---------------------------------------------------------------------------
// Section Detection Helpers
// ---------------------------------------------------------------------------

/** Expected section headings per document type */
const SECTION_MAP: Record<string, Array<{ id: DocumentSectionId; title: string }>> = {
  SOAP: [
    { id: 'subjetivo', title: 'Subjetivo' },
    { id: 'objetivo', title: 'Objetivo' },
    { id: 'analisis', title: 'Análisis' },
    { id: 'plan', title: 'Plan' },
  ],
  DAP: [
    { id: 'datos', title: 'Datos' },
    { id: 'analisis', title: 'Análisis' },
    { id: 'plan', title: 'Plan' },
  ],
  BIRP: [
    { id: 'comportamiento', title: 'Comportamiento' },
    { id: 'intervencion', title: 'Intervención' },
    { id: 'respuesta', title: 'Respuesta' },
    { id: 'plan', title: 'Plan' },
  ],
  plan_tratamiento: [
    { id: 'objetivos', title: 'Objetivos Terapéuticos' },
    { id: 'intervenciones', title: 'Intervenciones' },
    { id: 'timeline', title: 'Timeline' },
    { id: 'indicadores', title: 'Indicadores de Progreso' },
  ],
  resumen_caso: [
    { id: 'resumen', title: 'Resumen del Caso' },
    { id: 'evolucion', title: 'Evolución' },
    { id: 'conclusiones', title: 'Conclusiones' },
  ],
};

/** Regex that matches markdown H2 headings (## Title) */
const H2_REGEX = /^##\s+(.+)$/m;

/**
 * Detects which section a new heading belongs to based on the document type map.
 * Fuzzy-matches by checking if the heading text includes the expected title keyword.
 */
function detectSection(
  headingText: string,
  documentType: string,
): { id: DocumentSectionId; title: string } | null {
  const sections = SECTION_MAP[documentType];
  if (!sections) return null;
  const lower = headingText.toLowerCase();
  return sections.find(s => lower.includes(s.title.toLowerCase())) ?? null;
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

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

    // --- Optional patient context enrichment ---
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

    ctx.onProgress?.(`Generando documento ${documentType} con Gemini Flash…`);

    // Stable documentId for the entire generation lifecycle
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ---- Streaming generation with real-time section preview ----
    const streamResult = await ai.models.generateContentStream({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 1.0,
        maxOutputTokens: 8192,
      },
    });

    // Defensive: handle both direct async-iterable and object with .stream property
    // (matches pattern used in streaming-handler.ts for chat.sendMessageStream)
    const stream = ('stream' in streamResult && streamResult.stream
      ? streamResult.stream
      : streamResult) as AsyncIterable<any>;

    // Accumulate full document + detect sections in real-time
    let accumulatedMarkdown = '';
    let currentSectionId: DocumentSectionId = 'header';
    let currentSectionTitle = 'Encabezado';
    let currentSectionContent = '';
    const expectedSections = SECTION_MAP[documentType] ?? [];
    const totalSections = expectedSections.length || 1;
    let completedSections = 0;

    for await (const chunk of stream) {
      const text = chunk.text ?? '';
      if (!text) continue;

      accumulatedMarkdown += text;
      currentSectionContent += text;

      // Check if we just received a new section heading
      // We scan the current section buffer for H2 headings
      const lines = currentSectionContent.split('\n');
      let newSectionDetected = false;

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(H2_REGEX);
        if (match) {
          // When i > 0, there's previous content before this heading — emit it
          if (i > 0) {
            const prevContent = lines.slice(0, i).join('\n').trim();
            if (prevContent) {
              completedSections++;
              emitSectionPreview(ctx, documentId, {
                id: currentSectionId,
                title: currentSectionTitle,
                content: prevContent,
                progress: 1,
              }, completedSections / totalSections, documentType, accumulatedMarkdown);
            }
          }

          // Start a new section (handles both first heading and subsequent headings)
          const detected = detectSection(match[1], documentType);
          currentSectionId = detected?.id ?? match[1].toLowerCase().replace(/\s+/g, '_');
          currentSectionTitle = detected?.title ?? match[1];
          currentSectionContent = lines.slice(i).join('\n');
          newSectionDetected = true;

          ctx.onProgress?.(`Generando sección: ${currentSectionTitle}…`);
          break; // Process one heading transition per chunk
        }
      }

      // If no new section heading, emit partial progress for current section
      if (!newSectionDetected && currentSectionContent.length > 0) {
        // Heuristic: ~800 chars is the average clinical section length.
        // Cap at 0.95 so progress never hits 1.0 until the section is truly complete.
        const sectionProgress = Math.min(currentSectionContent.length / 800, 0.95);
        emitSectionPreview(ctx, documentId, {
          id: currentSectionId,
          title: currentSectionTitle,
          content: currentSectionContent.trim(),
          progress: sectionProgress,
        }, (completedSections + sectionProgress) / totalSections, documentType, accumulatedMarkdown);
      }
    }

    // Emit the last section as complete
    if (currentSectionContent.trim()) {
      completedSections++;
      emitSectionPreview(ctx, documentId, {
        id: currentSectionId,
        title: currentSectionTitle,
        content: currentSectionContent.trim(),
        progress: 1,
      }, 1, documentType, accumulatedMarkdown);
    }

    const document = accumulatedMarkdown || 'No se pudo generar el documento';
    const durationMs = Date.now() - start;

    // 💾 Server-side persistence via firebase-admin (primary write — client also saves as backup)
    if (ctx.psychologistId && ctx.sessionId) {
      try {
        const { getAdminApp } = await import('../../firebase-admin-config');
        const { getFirestore: getAdminFirestore, Timestamp: AdminTimestamp } = await import('firebase-admin/firestore');
        const adminDb = getAdminFirestore(getAdminApp());
        const patientId = ctx.patientId || 'default_patient';
        const docPath = `psychologists/${ctx.psychologistId}/patients/${patientId}/sessions/${ctx.sessionId}/documents/${documentId}`;
        const now = AdminTimestamp.now();

        await adminDb.doc(docPath).set({
          id: documentId,
          sessionId: ctx.sessionId,
          patientId: patientId,
          documentType,
          markdown: document,
          version: 1,
          createdBy: 'ai',
          createdAt: now,
          updatedAt: now,
          generationDurationMs: durationMs,
        });
        logger.info(`[subagent:generate_clinical_document] 💾 Persisted to Firestore: ${docPath}`);
      } catch (persistErr) {
        // Non-fatal — client-side will also attempt to save
        logger.error('[subagent:generate_clinical_document] ⚠️ Server-side persist failed (client will retry):', persistErr);
      }
    }

    // Emit document_ready event
    ctx.onDocumentReady?.({
      documentId,
      markdown: document,
      documentType,
      availableFormats: ['markdown', 'pdf', 'docx'],
      durationMs,
    });

    ctx.onProgress?.(`Documento ${documentType} completado (${(durationMs / 1000).toFixed(1)}s)`);
    logger.info(`[subagent:generate_clinical_document] completed in ${durationMs}ms, ${completedSections} sections`);

    return {
      name: 'generate_clinical_document',
      response: { document, documentType, durationMs, documentId, sectionsGenerated: completedSections },
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error('[subagent:generate_clinical_document] Error:', error);

    // Emit document_ready even on error so the panel opens and shows the error state
    // This prevents the "tool executed but nothing happened" scenario
    const errorDocumentId = `doc_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const errorMarkdown = `## Error al Generar Documento\n\nNo se pudo generar el documento clínico tipo **${documentType}**.\n\n**Detalle:** ${String(error)}\n\nPor favor intenta nuevamente o proporciona más contexto de sesión.`;
    ctx.onDocumentReady?.({
      documentId: errorDocumentId,
      markdown: errorMarkdown,
      documentType: documentType || 'unknown',
      availableFormats: ['markdown'],
      durationMs,
    });

    return {
      name: 'generate_clinical_document',
      response: { error: 'Error al generar documento clínico', details: String(error) },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Emits a document_preview event through the tool execution context */
function emitSectionPreview(
  ctx: ToolExecutionContext,
  documentId: string,
  section: DocumentSection,
  overallProgress: number,
  documentType: string,
  accumulatedMarkdown: string,
): void {
  ctx.onDocumentPreview?.({
    documentId,
    section,
    overallProgress: Math.min(overallProgress, 1),
    documentType,
    accumulatedMarkdown,
  });
}
