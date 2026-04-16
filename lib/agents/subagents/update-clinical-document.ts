/**
 * Tool Handler: update_clinical_document
 *
 * Updates an existing clinical document in the session.
 * Persists the change to Firestore (server-side via firebase-admin) and emits
 * document_ready so the preview panel refreshes in real-time.
 *
 * Supports two modes:
 * 1. **Full update** — agent provides full_updated_markdown directly (fast, no LLM call)
 * 2. **Instruction-based** — agent provides only modification_instructions; this handler
 *    auto-fetches the current document from Firestore and uses an LLM to apply the edits
 */

import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';
import { SUBAGENT_MODEL } from './types';

const logger = createLogger('agent');

export async function executeUpdateClinicalDocument(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const documentId = args.document_id as string;
  const modificationInstructions = args.modification_instructions as string;
  let fullUpdatedMarkdown = args.full_updated_markdown as string | undefined;

  if (!documentId || !modificationInstructions) {
    return {
      name: 'update_clinical_document',
      response: { error: 'document_id and modification_instructions are required' },
    };
  }

  const start = Date.now();

  try {
    ctx.onProgress?.('Actualizando documento clínico…');

    const { getAdminApp } = await import('../../firebase-admin-config');
    const { getFirestore: getAdminFirestore, Timestamp: AdminTimestamp } = await import('firebase-admin/firestore');
    const adminDb = getAdminFirestore(getAdminApp());
    const patientId = ctx.patientId || 'default_patient';
    const docPath = `psychologists/${ctx.psychologistId}/patients/${patientId}/sessions/${ctx.sessionId}/documents/${documentId}`;

    // If full_updated_markdown not provided, auto-fetch current doc and apply edits via LLM
    if (!fullUpdatedMarkdown) {
      ctx.onProgress?.('Leyendo documento actual…');
      const snap = await adminDb.doc(docPath).get();
      if (!snap.exists) {
        return {
          name: 'update_clinical_document',
          response: { error: `Documento no encontrado: ${documentId}. Usa get_session_documents para verificar IDs disponibles.` },
        };
      }
      const currentMarkdown = snap.data()?.markdown as string;
      if (!currentMarkdown) {
        return {
          name: 'update_clinical_document',
          response: { error: 'El documento existe pero no tiene contenido Markdown.' },
        };
      }

      // Apply modifications via LLM
      ctx.onProgress?.('Aplicando modificaciones con IA…');
      const { ai } = await import('../../google-genai-config');
      const result = await ai.models.generateContent({
        model: SUBAGENT_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{
              text: `<current_document>
${currentMarkdown}
</current_document>

<modification_instructions>
${modificationInstructions}
</modification_instructions>

<task>
Aplica las modificaciones solicitadas dentro de <modification_instructions> al contenido de <current_document> y devuelve el documento COMPLETO actualizado en formato Markdown.
</task>

<rules>
- Devuelve SOLO el documento Markdown completo actualizado, sin explicaciones ni preámbulos.
- Mantén el formato y estructura del documento original.
- Aplica SOLO las modificaciones solicitadas; no cambies nada más.
- Si la modificación pide agregar contenido, intégralo en la sección apropiada.
- Si la modificación pide eliminar contenido, remuévelo limpiamente.
- Preserva los headings (## Sección) y el formato profesional.
</rules>`
            }],
          },
        ],
        config: {
          systemInstruction: `<role>
Eres un editor de documentos clínicos psicológicos. Aplicas modificaciones puntuales sobre un documento Markdown existente preservando la estructura original.
</role>
<constraints>
- Devuelve SOLO el documento Markdown completo actualizado, sin preámbulos ni explicaciones.
- Aplica SOLO las modificaciones solicitadas.
- Preserva headings, formato profesional y orden de secciones.
</constraints>`,
          // Gemini 3.X best practice: keep temperature at the default 1.0
          // (values <1.0 can cause looping / degraded performance).
          temperature: 1.0,
        },
      });

      const llmResult = result.text?.trim();
      if (!llmResult) {
        logger.warn(`[update_clinical_document] LLM returned empty result for ${documentId}, falling back to original`);
        return {
          name: 'update_clinical_document',
          response: {
            error: 'La IA no pudo aplicar las modificaciones. Intenta con instrucciones más específicas o proporciona el Markdown completo con full_updated_markdown.',
            documentId,
          },
        };
      }
      fullUpdatedMarkdown = llmResult;
      logger.info(`[update_clinical_document] LLM applied modifications to ${documentId}`);
    }

    // Persist to Firestore (server-side via firebase-admin)
    if (ctx.psychologistId && ctx.sessionId) {
      // Read current doc to bump version
      const snap = await adminDb.doc(docPath).get();
      const currentVersion = snap.exists ? (snap.data()?.version ?? 1) : 1;
      const newVersion = currentVersion + 1;

      await adminDb.doc(docPath).set({
        markdown: fullUpdatedMarkdown,
        version: newVersion,
        updatedAt: AdminTimestamp.now(),
      }, { merge: true });

      logger.info(`[update_clinical_document] Persisted v${newVersion} for ${documentId}`);
    }

    const durationMs = Date.now() - start;

    // Emit document_ready so the preview panel updates in real-time
    ctx.onDocumentReady?.({
      documentId,
      markdown: fullUpdatedMarkdown,
      documentType: 'updated',
      availableFormats: ['markdown', 'pdf', 'docx'],
      durationMs,
    });

    ctx.onProgress?.('Documento actualizado correctamente');

    return {
      name: 'update_clinical_document',
      response: {
        success: true,
        documentId,
        modificationApplied: modificationInstructions,
        newLength: fullUpdatedMarkdown.length,
        durationMs,
      },
    };
  } catch (error) {
    logger.error('[update_clinical_document] Error:', error);
    return {
      name: 'update_clinical_document',
      response: { error: 'Error al actualizar documento', details: String(error) },
    };
  }
}
