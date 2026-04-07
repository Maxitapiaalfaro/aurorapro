/**
 * Tool Input Schemas — Formal Input Validation with Zod
 *
 * Zod schemas for all tools in the unified Aurora agent.
 * Validates LLM-generated payloads BEFORE execution, catching
 * hallucinated formats early and enabling self-healing via structured errors.
 *
 * Pattern: Claude Code's Tool.inputSchema.
 *
 * @version 2.0.0 — Unified Agent Architecture
 */

import { z } from 'zod';

// ============================================================================
// UNIFIED AGENT TOOL SCHEMAS
// ============================================================================

/** search_academic_literature — Academic Search (external) */
export const searchAcademicLiteratureSchema = z.object({
  query: z.string().min(3).describe('Pregunta de investigación en nomenclatura clínica'),
  max_results: z.number().int().min(1).max(20)
    .optional()
    .describe('Número máximo de artículos (1-20). Default: 8.'),
});

/** get_patient_memories — Clinical Memory Retrieval (read-only) */
export const getPatientMemoriesSchema = z.object({
  patientId: z.string().min(1).describe('ID del paciente en Firestore'),
  category: z.enum(['observation', 'pattern', 'therapeutic-preference'])
    .optional()
    .describe('Filtrar por categoría de memoria'),
  limit: z.number().int().min(1).max(50)
    .optional()
    .describe('Número máximo de memorias. Default: 10.'),
});

/** get_patient_record — Patient Record Retrieval (read-only) */
export const getPatientRecordSchema = z.object({
  patientId: z.string().min(1).describe('ID del paciente en Firestore'),
});

/** save_clinical_memory — Clinical Memory Persistence (write) */
export const saveClinicalMemorySchema = z.object({
  patientId: z.string().min(1).describe('ID del paciente en Firestore'),
  category: z.enum(['observation', 'pattern', 'therapeutic-preference'])
    .describe('Tipo de memoria clínica'),
  content: z.string().min(10).max(2000)
    .describe('Contenido de la memoria en lenguaje clínico conciso'),
  confidence: z.number().min(0).max(1)
    .describe('Nivel de confianza (0.0-1.0)'),
  tags: z.array(z.string()).max(10)
    .optional()
    .describe('Etiquetas clínicas para recuperación futura'),
});

/** google_search — Gemini native grounding (external) */
export const googleSearchSchema = z.object({
  query: z.string().describe('Términos de búsqueda'),
});

// ============================================================================
// LEGACY SCHEMAS (backward compat for sessions with old tool names)
// ============================================================================

const legacySearchSchema = z.object({
  query: z.string().describe('Consulta de evidencia'),
  max_results: z.number().int().positive().optional(),
});

// ============================================================================
// SCHEMA REGISTRY — Maps declaration name → Zod schema
// ============================================================================

/**
 * Central lookup for tool input schemas by declaration name.
 * Used by the tool orchestrator to validate payloads before execution.
 */
export const toolInputSchemas: Record<string, z.ZodType> = {
  // Unified agent tools
  'search_academic_literature': searchAcademicLiteratureSchema,
  'get_patient_memories': getPatientMemoriesSchema,
  'get_patient_record': getPatientRecordSchema,
  'save_clinical_memory': saveClinicalMemorySchema,
  'google_search': googleSearchSchema,

  // Legacy tool names (may appear in existing Gemini chat sessions)
  'search_evidence_for_reflection': legacySearchSchema,
  'search_evidence_for_documentation': legacySearchSchema,
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

export interface ValidationSuccess {
  success: true;
  data: Record<string, unknown>;
}

export interface ValidationFailure {
  success: false;
  toolName: string;
  errorMessage: string;
  fieldErrors: Array<{ path: string; message: string }>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validate a tool's input payload against its Zod schema.
 *
 * @returns Structured result — never throws. On failure, provides a
 *          human-readable error message suitable for the LLM to self-correct.
 *
 * @example
 * ```ts
 * const result = validateToolInput('detect_pattern', { patternType: 123 });
 * // → { success: false, toolName: 'detect_pattern', errorMessage: '...', fieldErrors: [...] }
 * ```
 */
export function validateToolInput(
  toolName: string,
  payload: Record<string, unknown> | undefined
): ValidationResult {
  const schema = toolInputSchemas[toolName];

  // No schema registered → skip validation (pass-through)
  if (!schema) {
    return { success: true, data: payload ?? {} };
  }

  const result = schema.safeParse(payload ?? {});

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }

  // Format Zod errors into structured feedback for the LLM
  const fieldErrors = result.error.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  const errorLines = fieldErrors.map(
    fe => `  - '${fe.path}': ${fe.message}`
  );

  const errorMessage =
    `Validation failed for tool "${toolName}":\n${errorLines.join('\n')}\n` +
    `Please retry with corrected parameters.`;

  return {
    success: false,
    toolName,
    errorMessage,
    fieldErrors,
  };
}
