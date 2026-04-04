/**
 * Tool Input Schemas — P1.3: Formal Input Validation with Zod
 *
 * Defines strict Zod schemas for every tool registered in the ToolRegistry.
 * These schemas validate LLM-generated payloads BEFORE execution, catching
 * hallucinated formats early and enabling self-healing via structured errors.
 *
 * Pattern inspired by Claude Code's Tool.inputSchema (docs/architecture/claude).
 *
 * @version 1.0.0 — P1.3
 */

import { z } from 'zod';

// ============================================================================
// REGISTERED TOOL SCHEMAS (match tool-registry.ts declarations)
// ============================================================================

/** formulate_clarifying_question — Emotional Exploration (read-only) */
export const formulateClarifyingQuestionSchema = z.object({
  clientStatement: z.string().describe('La declaración o comentario del cliente que requiere clarificación'),
  emotionalContext: z.string().describe('El contexto emocional detectado en la conversación'),
  focusArea: z.enum(['emotions', 'thoughts', 'behaviors', 'relationships', 'triggers'])
    .describe('El área específica en la que enfocar la clarificación'),
});

/** identify_core_emotion — Emotional Exploration (read-only) */
export const identifyCoreEmotionSchema = z.object({
  clientNarrative: z.string().describe('La narrativa o descripción del cliente sobre su experiencia'),
  behavioralIndicators: z.array(z.string())
    .optional()
    .describe('Indicadores conductuales observados o reportados'),
  contextualFactors: z.string()
    .optional()
    .describe('Factores contextuales relevantes (situación, relaciones, eventos)'),
});

/** generate_validating_statement — Validation Support (read-only) */
export const generateValidatingStatementSchema = z.object({
  clientExperience: z.string().describe('La experiencia específica que el cliente ha compartido'),
  emotionalIntensity: z.enum(['low', 'moderate', 'high', 'severe'])
    .describe('La intensidad emocional percibida en la experiencia'),
  validationType: z.enum(['emotional', 'experiential', 'perspective', 'effort'])
    .describe('El tipo de validación más apropiado para la situación'),
});

/** detect_pattern — Pattern Detection (read-only) */
export const detectPatternSchema = z.object({
  conversationHistory: z.string().describe('Historial relevante de la conversación para análisis de patrones'),
  patternType: z.enum(['cognitive', 'emotional', 'behavioral', 'relational', 'situational'])
    .describe('El tipo de patrón a detectar'),
  timeframe: z.string()
    .optional()
    .describe('Marco temporal en el que se observa el patrón'),
});

/** reframe_perspective — Cognitive Analysis (read-only) */
export const reframePerspectiveSchema = z.object({
  originalPerspective: z.string().describe('La perspectiva original o pensamiento del cliente'),
  situationalContext: z.string().describe('El contexto situacional completo'),
  reframeType: z.enum(['balanced', 'strength_based', 'growth_oriented', 'evidence_based'])
    .describe('El tipo de reencuadre más apropiado'),
});

/** propose_behavioral_experiment — Behavioral Intervention (read-only) */
export const proposeBehavioralExperimentSchema = z.object({
  targetBelief: z.string().describe('La creencia o patrón específico que se quiere examinar'),
  clientCapabilities: z.string().describe('Las capacidades y limitaciones actuales del cliente'),
  experimentType: z.enum(['exposure', 'behavioral_activation', 'skill_practice', 'reality_testing'])
    .describe('El tipo de experimento conductual'),
  timeframe: z.string()
    .optional()
    .describe('Marco temporal propuesto para el experimento'),
});

/** google_search — Academic Web Search (external) */
export const googleSearchSchema = z.object({
  query: z.string().describe('Términos de búsqueda académicos específicos'),
  clinicalCondition: z.string()
    .optional()
    .describe('Condición clínica específica de interés'),
  interventionType: z.string()
    .optional()
    .describe('Tipo de intervención o técnica terapéutica'),
});

// ============================================================================
// DYNAMIC TOOL SCHEMAS (known SDK-managed tools)
// ============================================================================

/** search_academic_literature — ParallelAI Academic Search (external) */
export const searchAcademicLiteratureSchema = z.object({
  query: z.string().describe('Términos de búsqueda académica'),
  max_results: z.number().int().positive()
    .optional()
    .describe('Número máximo de resultados'),
});

/** search_evidence_for_reflection — Supervisor Evidence Search (external) */
export const searchEvidenceForReflectionSchema = z.object({
  query: z.string().describe('Consulta de evidencia para reflexión clínica'),
  max_results: z.number().int().positive()
    .optional()
    .describe('Número máximo de resultados'),
});

/** search_evidence_for_documentation — Documentation Evidence Search (external) */
export const searchEvidenceForDocumentationSchema = z.object({
  query: z.string().describe('Consulta de evidencia para documentación clínica'),
  max_results: z.number().int().positive()
    .optional()
    .describe('Número máximo de resultados'),
});

// ============================================================================
// SCHEMA REGISTRY — Maps declaration name → Zod schema
// ============================================================================

/**
 * Central lookup for tool input schemas by declaration name.
 * Used by the orchestrator to validate LLM payloads before execution.
 */
export const toolInputSchemas: Record<string, z.ZodType> = {
  // Registered tools (tool-registry.ts)
  'formulate_clarifying_question': formulateClarifyingQuestionSchema,
  'identify_core_emotion': identifyCoreEmotionSchema,
  'generate_validating_statement': generateValidatingStatementSchema,
  'detect_pattern': detectPatternSchema,
  'reframe_perspective': reframePerspectiveSchema,
  'propose_behavioral_experiment': proposeBehavioralExperimentSchema,
  'google_search': googleSearchSchema,

  // Dynamic tools (known SDK-managed, not in ToolRegistry)
  'search_academic_literature': searchAcademicLiteratureSchema,
  'search_evidence_for_reflection': searchEvidenceForReflectionSchema,
  'search_evidence_for_documentation': searchEvidenceForDocumentationSchema,
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
