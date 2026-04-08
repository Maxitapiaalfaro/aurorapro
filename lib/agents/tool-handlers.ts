/**
 * Tool Handler Registry — Registry-based dispatch for Gemini function calls
 *
 * Replaces the hardcoded if/else chain in streaming-handler.ts with an
 * extensible Map<toolName, handler>. Each handler connects a Gemini
 * function call to an existing backend service.
 *
 * To add a new tool:
 * 1. Add FunctionDeclaration in unified-tool-declarations.ts
 * 2. Register handler here with registerToolHandler()
 * 3. Add Zod schema in tool-input-schemas.ts
 * 4. Register in tool-registry.ts with security category
 * 5. Add to KNOWN_DYNAMIC_TOOLS in streaming-handler.ts
 */

import { createLogger } from '../logger';
import type { DocumentPreviewEvent, DocumentReadyEvent } from '@/types/clinical-types';

const logger = createLogger('agent');

// ─── Types ────────────────────────────────────────────────────────────────

export interface ToolCallResult {
  name: string;
  response: unknown;
}

export interface ToolExecutionContext {
  psychologistId: string;
  sessionId: string;
  patientId?: string;
  /** Mutable reference populated by academic search — existing pattern from streaming-handler */
  academicReferences: Array<{
    title: string;
    url: string;
    doi?: string;
    authors?: string;
    year?: number;
    journal?: string;
  }>;
  /** Callback for sub-agents to report internal progress steps in real-time */
  onProgress?: (message: string) => void;
  /** Callback for document generation sub-agent to emit live preview sections */
  onDocumentPreview?: (preview: DocumentPreviewEvent) => void;
  /** Callback for document generation sub-agent to signal document completion */
  onDocumentReady?: (document: DocumentReadyEvent) => void;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => Promise<ToolCallResult>;

// ─── Registry ─────────────────────────────────────────────────────────────

const handlers = new Map<string, ToolHandler>();

export function registerToolHandler(name: string, handler: ToolHandler): void {
  handlers.set(name, handler);
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return handlers.get(name);
}

export function getRegisteredToolNames(): string[] {
  return Array.from(handlers.keys());
}

// ─── Built-in Handlers ───────────────────────────────────────────────────

// 1. Academic Literature Search (consolidates 3 former tools into 1)
registerToolHandler('search_academic_literature', async (args, ctx) => {
  try {
    const { academicMultiSourceSearch } = await import(
      '../academic-multi-source-search'
    );

    const query = args.query as string;
    const maxResults = Math.min((args.max_results as number) || 8, 20);

    logger.info(`[tool:search_academic_literature] query="${query}" max=${maxResults}`);

    const results = await academicMultiSourceSearch.search({
      query,
      maxResults,
      language: 'both',
      minTrustScore: 60,
    });

    // Populate shared academic references for grounding metadata
    if (results?.results) {
      for (const r of results.results) {
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

    return {
      name: 'search_academic_literature',
      response: results || { results: [], message: 'No results found' },
    };
  } catch (error) {
    logger.error('[tool:search_academic_literature] Error:', error);
    return {
      name: 'search_academic_literature',
      response: { error: 'Error en búsqueda académica', details: String(error) },
    };
  }
});

// 2. Get Patient Memories (reads from clinical-memory-system.ts)
registerToolHandler('get_patient_memories', async (args, ctx) => {
  try {
    const { getPatientMemories } = await import('../clinical-memory-system');

    const patientId = ctx.patientId || args.patientId as string;
    const category = args.category as string | undefined;
    const limit = (args.limit as number) || 10;

    logger.info(
      `[tool:get_patient_memories] patient=${patientId} category=${category || 'all'} limit=${limit}`,
    );

    const memories = await getPatientMemories(ctx.psychologistId, patientId, {
      category: category as 'observation' | 'pattern' | 'therapeutic-preference' | undefined,
      isActive: true,
      limit,
    });

    return {
      name: 'get_patient_memories',
      response: {
        memories: memories.map((m) => ({
          memoryId: m.memoryId,
          category: m.category,
          content: m.content,
          confidence: m.confidence,
          tags: m.tags,
          updatedAt: m.updatedAt,
        })),
        count: memories.length,
        patientId,
      },
    };
  } catch (error) {
    logger.error('[tool:get_patient_memories] Error:', error);
    return {
      name: 'get_patient_memories',
      response: { error: 'Error al recuperar memorias clínicas', details: String(error) },
    };
  }
});

// 3. Get Patient Record (reads from Firestore via hopeai-system helper)
registerToolHandler('get_patient_record', async (args, ctx) => {
  try {
    // Dynamic import to avoid circular dependency — loadPatientFromFirestore
    // is a module-level function in hopeai-system.ts
    const { loadPatientFromFirestore } = await import('../hopeai-system');

    const patientId = ctx.patientId || args.patientId as string;

    logger.info(`[tool:get_patient_record] patient=${patientId}`);

    const record = await loadPatientFromFirestore(ctx.psychologistId, patientId);

    if (!record) {
      return {
        name: 'get_patient_record',
        response: { error: 'Paciente no encontrado', patientId },
      };
    }

    return {
      name: 'get_patient_record',
      response: {
        id: record.id,
        displayName: record.displayName,
        demographics: record.demographics || null,
        tags: record.tags || [],
        notes: record.notes || '',
        summaryCache: record.summaryCache
          ? { text: record.summaryCache.text, updatedAt: record.summaryCache.updatedAt }
          : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    };
  } catch (error) {
    logger.error('[tool:get_patient_record] Error:', error);
    return {
      name: 'get_patient_record',
      response: { error: 'Error al cargar registro del paciente', details: String(error) },
    };
  }
});

// 4. Save Clinical Memory (writes to clinical-memory-system.ts)
registerToolHandler('save_clinical_memory', async (args, ctx) => {
  try {
    const { saveMemory } = await import('../clinical-memory-system');

    const patientId = ctx.patientId || args.patientId as string;
    const category = args.category as 'observation' | 'pattern' | 'therapeutic-preference';
    const content = args.content as string;
    const confidence = args.confidence as number;
    const tags = (args.tags as string[]) || [];

    logger.info(
      `[tool:save_clinical_memory] patient=${patientId} category=${category} confidence=${confidence}`,
    );

    const memoryId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    await saveMemory({
      memoryId,
      patientId,
      psychologistId: ctx.psychologistId,
      category,
      content,
      confidence: Math.max(0, Math.min(1, confidence)),
      sourceSessionIds: [ctx.sessionId],
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      tags,
      relevanceScore: 0,
    });

    return {
      name: 'save_clinical_memory',
      response: { saved: true, memoryId, category, patientId },
    };
  } catch (error) {
    logger.error('[tool:save_clinical_memory] Error:', error);
    return {
      name: 'save_clinical_memory',
      response: { error: 'Error al guardar memoria clínica', details: String(error) },
    };
  }
});

// 5. Create Patient (writes to Firestore via hopeai-system helpers)
registerToolHandler('create_patient', async (args, ctx) => {
  try {
    const { savePatientToFirestore, generatePatientId } = await import('../hopeai-system');

    const displayName = args.displayName as string;
    const demographics = args.demographics as { ageRange?: string; gender?: string; occupation?: string; location?: string } | undefined;
    const tags = (args.tags as string[]) || [];
    const notes = args.notes as string | undefined;

    const patientId = generatePatientId();
    const now = new Date();

    logger.info(`[tool:create_patient] displayName="${displayName}" psychologist=${ctx.psychologistId}`);

    await savePatientToFirestore(ctx.psychologistId, {
      id: patientId,
      displayName,
      demographics,
      tags,
      notes: notes || '',
      confidentiality: { pii: true, accessLevel: 'medium' },
      createdAt: now,
      updatedAt: now,
    });

    return {
      name: 'create_patient',
      response: { created: true, patientId, displayName, tags },
    };
  } catch (error) {
    logger.error('[tool:create_patient] Error:', error);
    return {
      name: 'create_patient',
      response: { error: 'Error al crear paciente', details: String(error) },
    };
  }
});

// 6. List Patients (reads from Firestore via hopeai-system helpers)
registerToolHandler('list_patients', async (args, ctx) => {
  try {
    const { listPatientsFromFirestore } = await import('../hopeai-system');

    const searchQuery = args.search_query as string | undefined;
    const limit = Math.min((args.limit as number) || 20, 50);

    logger.info(`[tool:list_patients] search="${searchQuery || ''}" limit=${limit} psychologist=${ctx.psychologistId}`);

    const patients = await listPatientsFromFirestore(ctx.psychologistId, { searchTerm: searchQuery, limit });

    return {
      name: 'list_patients',
      response: {
        patients: patients.map(p => ({
          id: p.id,
          displayName: p.displayName,
          tags: p.tags || [],
          demographics: p.demographics || null,
          updatedAt: p.updatedAt,
        })),
        count: patients.length,
        searchQuery: searchQuery || null,
      },
    };
  } catch (error) {
    logger.error('[tool:list_patients] Error:', error);
    return {
      name: 'list_patients',
      response: { error: 'Error al listar pacientes', details: String(error) },
    };
  }
});

// 7. Google Search (Gemini native grounding — stub acknowledgement)
registerToolHandler('google_search', async () => {
  return {
    name: 'google_search',
    response: 'Search completed with automatic processing',
  };
});

// ─── SUB-AGENT HANDLERS ────────────────────────────────────────────────────
// Registered from subagents/index.ts to keep this file focused on direct tools
import { registerSubAgentHandlers } from './subagents/index';
registerSubAgentHandlers();
