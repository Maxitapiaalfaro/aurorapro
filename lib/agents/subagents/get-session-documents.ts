/**
 * Tool Handler: get_session_documents
 *
 * Retrieves clinical documents previously generated and persisted for the current session.
 * This allows the AI to:
 * 1. List what documents exist (so it can reference them by ID)
 * 2. Read the full markdown of any document (so it can propose modifications)
 *
 * Uses firebase-admin (server-side) to read from Firestore.
 */

import { createLogger } from '../../logger';
import type { ToolCallResult, ToolExecutionContext } from '../tool-handlers';

const logger = createLogger('agent');

export async function executeGetSessionDocuments(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCallResult> {
  const documentId = args.document_id as string | undefined;
  const includeContent = args.include_content !== false; // default true

  if (!ctx.psychologistId || !ctx.sessionId) {
    return {
      name: 'get_session_documents',
      response: { error: 'No hay sesión activa para buscar documentos', documents: [] },
    };
  }

  try {
    ctx.onProgress?.('Buscando documentos de la sesión…');

    const { getAdminApp } = await import('../../firebase-admin-config');
    const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');
    const adminDb = getAdminFirestore(getAdminApp());

    const patientId = ctx.patientId || 'default_patient';
    const docsColPath = `psychologists/${ctx.psychologistId}/patients/${patientId}/sessions/${ctx.sessionId}/documents`;

    if (documentId) {
      // Fetch a single document by ID
      const snap = await adminDb.doc(`${docsColPath}/${documentId}`).get();
      if (!snap.exists) {
        return {
          name: 'get_session_documents',
          response: { error: `Documento no encontrado: ${documentId}`, documents: [] },
        };
      }
      const data = snap.data()!;
      const doc = {
        id: data.id || snap.id,
        documentType: data.documentType,
        version: data.version || 1,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
        createdBy: data.createdBy || 'ai',
        characterCount: data.markdown?.length || 0,
        verificationStatus: data.verificationMetadata?.verificationStatus ?? 'pending_review',
        contentFlags: data.verificationMetadata?.contentFlags ?? [],
        verifiedBy: data.verificationMetadata?.verifiedBy,
        ...(includeContent ? { markdown: data.markdown } : {}),
      };

      logger.info(`[get_session_documents] Retrieved document: ${documentId}`);
      return {
        name: 'get_session_documents',
        response: { documents: [doc], count: 1 },
      };
    }

    // List all documents for the session
    const snapshot = await adminDb.collection(docsColPath)
      .orderBy('createdAt', 'desc')
      .get();

    const documents = snapshot.docs.map(snap => {
      const data = snap.data();
      return {
        id: data.id || snap.id,
        documentType: data.documentType,
        version: data.version || 1,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
        createdBy: data.createdBy || 'ai',
        characterCount: data.markdown?.length || 0,
        verificationStatus: data.verificationMetadata?.verificationStatus ?? 'pending_review',
        contentFlags: data.verificationMetadata?.contentFlags ?? [],
        verifiedBy: data.verificationMetadata?.verifiedBy,
        ...(includeContent ? { markdown: data.markdown } : {}),
      };
    });

    logger.info(`[get_session_documents] Found ${documents.length} document(s) for session ${ctx.sessionId}`);

    return {
      name: 'get_session_documents',
      response: { documents, count: documents.length },
    };
  } catch (error) {
    logger.error('[get_session_documents] Error:', error);
    return {
      name: 'get_session_documents',
      response: { error: 'Error al buscar documentos de la sesión', details: String(error), documents: [] },
    };
  }
}
