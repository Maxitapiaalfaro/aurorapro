/**
 * Tool Handler: update_clinical_document
 *
 * Updates an existing clinical document in the session.
 * Persists the change to Firestore (server-side via firebase-admin) and emits
 * document_ready so the preview panel refreshes in real-time.
 *
 * This is a lightweight handler (no sub-agent LLM call) — the main agent already
 * produced the updated markdown in its `full_updated_markdown` argument.
 */

import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';

const logger = createLogger('agent');

export async function executeUpdateClinicalDocument(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const documentId = args.document_id as string;
  const modificationInstructions = args.modification_instructions as string;
  const fullUpdatedMarkdown = args.full_updated_markdown as string;

  if (!documentId || !fullUpdatedMarkdown) {
    return {
      name: 'update_clinical_document',
      response: { error: 'document_id and full_updated_markdown are required' },
    };
  }

  const start = Date.now();

  try {
    ctx.onProgress?.('Actualizando documento clínico…');

    // Persist to Firestore (server-side via firebase-admin)
    if (ctx.psychologistId && ctx.sessionId) {
      const { getAdminApp } = await import('../../firebase-admin-config');
      const { getFirestore: getAdminFirestore, Timestamp: AdminTimestamp } = await import('firebase-admin/firestore');

      const adminDb = getAdminFirestore(getAdminApp());
      const patientId = ctx.patientId || 'default_patient';
      const docPath = `psychologists/${ctx.psychologistId}/patients/${patientId}/sessions/${ctx.sessionId}/documents/${documentId}`;

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
