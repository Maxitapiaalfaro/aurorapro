/**
 * Intent Classifier — LLM-based intent classification and confidence scoring
 * 
 * Extracted from intelligent-intent-router.ts during P4 decomposition.
 * Contains:
 * - Combined intent + entity classification (single LLM call optimization)
 * - Standalone intent classification (fallback path)
 * - Confidence calculation (combined, enhanced, threshold)
 * - Input clarity assessment
 * - Explicit agent request detection
 */

import { FunctionCallingConfigMode } from '@google/genai';
import { ai } from '../google-genai-config';
import { EntityExtractionEngine, type ExtractedEntity, type EntityExtractionResult } from '../entity-extraction-engine';
import { ContextWindowManager, type ContextWindowConfig, type ContextProcessingResult } from '../context-window-manager';
import { INTENT_FUNCTION_DECLARATIONS, VALID_INTENT_FUNCTIONS, AGENT_DISPLAY_NAMES } from './intent-declarations';
import type { Content, IntentClassificationResult, RouterConfig, EnrichedContext, ToolSelectionContext } from './routing-types';
import type { OperationalMetadata, RoutingDecision, EdgeCaseDetectionResult } from '@/types/operational-metadata';
import { DEFAULT_EDGE_CASE_CONFIG, RoutingReason } from '@/types/operational-metadata';
import { createLogger } from '@/lib/logger';

const logger = createLogger('orchestration');

/**
 * Retries an async operation with exponential backoff on 429 (RESOURCE_EXHAUSTED) errors.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  maxRetries: number
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED');

      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      logger.warn(`429 rate limit hit, retrying in ${delayMs}ms`, { label, attempt: attempt + 1, maxRetries, delayMs });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Combined intent + entity classification in a single LLM call.
 * Eliminates a roundtrip LLM call (~300-700ms saved).
 */
export async function classifyIntentAndExtractEntities(
  userInput: string,
  sessionContext: Content[],
  entityExtractor: EntityExtractionEngine,
  contextWindowManager: ContextWindowManager,
  config: RouterConfig
): Promise<{
  intentResult: IntentClassificationResult | null;
  entityResult: EntityExtractionResult;
}> {
  const startTime = Date.now();

  try {
    const contextPrompt = buildContextualPrompt(userInput, sessionContext, undefined, contextWindowManager);

    const entityFunctions = entityExtractor.getEntityExtractionFunctions();
    const combinedFunctions = [...INTENT_FUNCTION_DECLARATIONS, ...entityFunctions];

    const result = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
      config: {
        tools: [{
          functionDeclarations: combinedFunctions
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY
          }
        },
        temperature: 1.0,
        topP: 0.1,
        topK: 1,
        seed: 42,
        maxOutputTokens: 1000
      }
    }), 'classifyIntentAndExtractEntities', config.maxRetries);

    if (!result.candidates || result.candidates.length === 0 || !result.functionCalls || result.functionCalls.length === 0) {
      logger.warn('No function calls received in combined response');
      return {
        intentResult: null,
        entityResult: {
          entities: [],
          primaryEntities: [],
          secondaryEntities: [],
          confidence: 0,
          processingTime: Date.now() - startTime
        }
      };
    }

    const functionCalls = result.functionCalls;

    const intentCalls = functionCalls.filter(fc =>
      VALID_INTENT_FUNCTIONS.includes(fc.name as any)
    );
    const entityCalls = functionCalls.filter(fc =>
      !VALID_INTENT_FUNCTIONS.includes(fc.name as any)
    );

    let intentResult: IntentClassificationResult | null = null;
    if (intentCalls.length > 0) {
      const intentCall = intentCalls[0];
      if (validateFunctionCall(intentCall)) {
        const confidence = calculateEnhancedConfidence(intentCall, userInput, result.usageMetadata);
        intentResult = {
          functionName: intentCall.name!,
          parameters: intentCall.args || {},
          confidence,
          requiresClarification: confidence < 0.7
        };
      }
    }

    const entityResult = await entityExtractor.processFunctionCallsPublic(entityCalls, startTime);

    if (config.enableLogging) {
      logger.debug('Combined orchestration completed', { intent: intentResult?.functionName || 'none', confidence: (intentResult?.confidence || 0).toFixed(2), entityCount: entityResult.entities.length, durationMs: Date.now() - startTime });
    }

    return { intentResult, entityResult };

  } catch (error) {
    logger.error('Error in combined classification', { error: error instanceof Error ? error.message : String(error) });
    return {
      intentResult: null,
      entityResult: {
        entities: [],
        primaryEntities: [],
        secondaryEntities: [],
        confidence: 0,
        processingTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Validates that a function call has the expected structure.
 */
export function validateFunctionCall(functionCall: any): boolean {
  return functionCall?.name &&
    VALID_INTENT_FUNCTIONS.includes(functionCall.name) &&
    functionCall.args &&
    typeof functionCall.args === 'object';
}

/**
 * Calculates enhanced confidence using native SDK metrics and heuristics.
 */
export function calculateEnhancedConfidence(
  functionCall: any,
  userInput: string,
  usageMetadata?: any
): number {
  let confidence = 0.85;

  // Factor 1: Required parameter completeness
  if (functionCall.args && Object.keys(functionCall.args).length > 0) {
    const requiredParams = getRequiredParamsForFunction(functionCall.name);
    const providedParams = Object.keys(functionCall.args);
    const completeness = providedParams.filter(p => requiredParams.includes(p)).length / requiredParams.length;
    confidence += completeness * 0.1;
  }

  // Factor 2: Input clarity
  const inputClarity = assessInputClarity(userInput, functionCall.name);
  confidence += inputClarity * 0.05;

  // Factor 3: Token efficiency
  if (usageMetadata?.totalTokenCount) {
    const efficiency = Math.min(1.0, 200 / usageMetadata.totalTokenCount);
    confidence += efficiency * 0.02;
  }

  return Math.min(1.0, Math.max(0.1, confidence));
}

/**
 * Calculates combined confidence from intent + entity scores with agent-specific weights.
 */
export function calculateCombinedConfidence(
  intentConfidence: number,
  entityConfidence: number,
  functionName?: string
): number {
  let intentWeight = 0.7;
  let entityWeight = 0.3;

  if (functionName === 'activar_modo_academico') {
    intentWeight = 0.8;
    entityWeight = 0.2;
  } else if (functionName === 'activar_modo_clinico') {
    intentWeight = 0.65;
    entityWeight = 0.35;
  } else if (functionName === 'activar_modo_socratico') {
    intentWeight = 0.75;
    entityWeight = 0.25;
  }

  return (intentConfidence * intentWeight) + (entityConfidence * entityWeight);
}

/**
 * Calculates dynamic confidence threshold based on context and entities.
 */
export function calculateOptimizedThreshold(
  intent: string,
  entities: ExtractedEntity[],
  baseThreshold: number,
  intentResult?: IntentClassificationResult
): number {
  const hasAcademicValidationEntities = entities.some(e => e.type === 'academic_validation');
  const hasSocraticExplorationEntities = entities.some(e => e.type === 'socratic_exploration');
  const hasClinicalDocumentationEntities = entities.some(e => e.type === 'documentation_process');

  let intentQualityFactor = 0;
  if (intentResult) {
    if (intentResult.confidence >= 0.9) {
      intentQualityFactor = -0.1;
    } else if (intentResult.confidence <= 0.7) {
      intentQualityFactor = 0.05;
    }
  }

  if (intent === 'activar_modo_clinico') {
    const clinicalBonus = hasClinicalDocumentationEntities ? -0.1 : 0;
    return Math.max(0.55, baseThreshold - 0.25 + intentQualityFactor + clinicalBonus);
  }

  if (intent === 'activar_modo_socratico') {
    const socraticBonus = hasSocraticExplorationEntities ? -0.12 : 0;
    return Math.max(0.6, baseThreshold - 0.2 + intentQualityFactor + socraticBonus);
  }

  if (intent === 'activar_modo_academico') {
    const academicBonus = hasAcademicValidationEntities ? -0.12 : 0;
    return Math.max(0.6, Math.min(0.85, baseThreshold - 0.05 + intentQualityFactor + academicBonus));
  }

  const entityDensityFactor = Math.min(0.15, entities.length * 0.025);
  const specializedEntityBonus = (
    (hasAcademicValidationEntities ? 0.08 : 0) +
    (hasSocraticExplorationEntities ? 0.08 : 0) +
    (hasClinicalDocumentationEntities ? 0.08 : 0)
  );

  return Math.max(0.5, baseThreshold - entityDensityFactor - specializedEntityBonus + intentQualityFactor);
}

/**
 * Detects explicit agent switch requests from user input.
 */
export function detectExplicitAgentRequest(userInput: string): {
  isExplicit: boolean;
  requestType: string;
} {
  const input = userInput.toLowerCase();

  const socraticPatterns = [
    /activ[ar]* (el )?modo socr[áa]tico/,
    /cambiar? al? (agente )?socr[áa]tico/,
    /usar (el )?modo socr[áa]tico/,
    /quiero (el )?modo socr[áa]tico/,
    /necesito (el )?modo socr[áa]tico/,
    /switch to socratic/,
    /activate socratic/
  ];

  const clinicalPatterns = [
    /activ[ar]* (el )?modo cl[íi]nico/,
    /cambiar? al? (agente )?cl[íi]nico/,
    /usar (el )?modo cl[íi]nico/,
    /quiero (el )?modo cl[íi]nico/,
    /necesito (el )?modo cl[íi]nico/,
    /switch to clinical/,
    /activate clinical/
  ];

  const academicPatterns = [
    /activ[ar]* (el )?modo acad[ée]mico/,
    /cambiar? al? (agente )?acad[ée]mico/,
    /usar (el )?modo acad[ée]mico/,
    /quiero (el )?modo acad[ée]mico/,
    /necesito (el )?modo acad[ée]mico/,
    /switch to academic/,
    /activate academic/
  ];

  if (socraticPatterns.some(pattern => pattern.test(input))) {
    return { isExplicit: true, requestType: 'socratico' };
  }

  if (clinicalPatterns.some(pattern => pattern.test(input))) {
    return { isExplicit: true, requestType: 'clinico' };
  }

  if (academicPatterns.some(pattern => pattern.test(input))) {
    return { isExplicit: true, requestType: 'academico' };
  }

  return { isExplicit: false, requestType: '' };
}

// ─── Keyword sets shared across heuristic and context analysis ───────────────

/** Number of recent messages to analyze for conversation context (3 user turns ≈ current flow direction) */
const CONVERSATION_CONTEXT_WINDOW = 6;

/** Normalization factor for per-message context scoring (lower = more sensitive to few matches) */
const CONTEXT_SCORE_NORMALIZATION_FACTOR = 0.3;

/** Minimum score for an agent to be considered dominant in conversation context */
const MIN_DOMINANT_SCORE = 0.05;

/** Minimum score margin between top and second agent to declare dominance */
const MIN_SCORE_MARGIN = 0.02;

/** Weight of current message keywords in combined scoring (vs conversation context) */
const MESSAGE_WEIGHT = 0.7;

/** Weight of conversation context momentum in combined scoring (vs current message) */
const CONTEXT_WEIGHT = 0.3;

const KEYWORD_SETS: Record<string, string[]> = {
  socratico: [
    'reflexionar', 'explorar', 'pensar', 'analizar', 'insight',
    'cuestionamiento', 'profundo', 'socrático', 'socratico',
    'caso', 'paciente', 'supervisar', 'hipótesis', 'hipotesis',
    'formulación', 'formulacion', 'creencias', 'autoconocimiento',
    'introspección', 'perspectiva', 'bloqueado', 'resistencia',
    'transferencia', 'contratransferencia', 'vínculo', 'alianza'
  ],
  clinico: [
    'documentar', 'notas', 'resumen', 'soap', 'expediente',
    'bitácora', 'bitacora', 'redactar', 'estructurar', 'formato',
    'plan de tratamiento', 'progreso', 'nota de evolución', 'evolución',
    'pirp', 'dap', 'birp', 'registro', 'historial', 'síntesis',
    'sintesis', 'ficha', 'informe', 'reporte', 'archivo'
  ],
  academico: [
    'investigación', 'investigacion', 'estudio', 'estudios',
    'evidencia', 'research', 'paper', 'papers', 'científico',
    'cientifico', 'avala', 'metaanálisis', 'metaanalisis',
    'ensayos', 'rct', 'revisión sistemática', 'revision sistematica',
    'guidelines', 'protocolos', 'empírico', 'empirico',
    'literatura', 'validación', 'validacion', 'publicaciones'
  ]
};

/**
 * Analyzes recent conversation history to extract a contextual signal
 * for each agent. Returns per-agent scores (0–1) representing how much
 * the recent conversation has been about that agent's domain.
 *
 * This is the key improvement over pure keyword matching on the current
 * message: it considers the *flow* of the conversation, not just the
 * latest isolated message. A user who has been exploring a case reflexively
 * for 5 turns shouldn't be routed away just because one message lacks
 * reflexive keywords.
 */
export function analyzeConversationContext(
  sessionContext: Content[]
): { scores: Record<string, number>; dominantAgent: string | null; turnCount: number } {
  // Take the recent messages (≈3 user turns for current flow direction)
  const recent = sessionContext.slice(-CONVERSATION_CONTEXT_WINDOW);
  if (recent.length === 0) {
    return { scores: { socratico: 0, clinico: 0, academico: 0 }, dominantAgent: null, turnCount: 0 };
  }

  const scores: Record<string, number> = { socratico: 0, clinico: 0, academico: 0 };

  for (const content of recent) {
    const text = (content.parts || [])
      .map(p => ('text' in p && p.text) ? p.text : '')
      .join(' ')
      .toLowerCase();

    if (!text) continue;

    for (const [agent, keywords] of Object.entries(KEYWORD_SETS)) {
      let matches = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) matches++;
      }
      // Normalize per-message score
      scores[agent] += matches / (keywords.length * CONTEXT_SCORE_NORMALIZATION_FACTOR);
    }
  }

  // Normalize by number of messages to get average signal per message
  const messageCount = recent.length;
  for (const agent of Object.keys(scores)) {
    scores[agent] = scores[agent] / messageCount;
  }

  // Determine dominant agent from context (must have meaningful signal)
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topAgent, topScore] = sorted[0];
  const [, secondScore] = sorted[1];
  const dominantAgent = (topScore > MIN_DOMINANT_SCORE && topScore - secondScore > MIN_SCORE_MARGIN) ? topAgent : null;

  return { scores, dominantAgent, turnCount: messageCount };
}

/**
 * Context-aware intent classification via keyword heuristics + conversation flow.
 *
 * Combines two signals:
 *   1. Current message keywords (immediate intent)
 *   2. Recent conversation context (conversational flow / momentum)
 *
 * The conversation context acts as a "momentum" signal — if the user
 * has been consistently exploring a topic in one agent's domain, that
 * momentum biases the decision even when the current message is ambiguous.
 *
 * Tier 2 (keyword + context scoring): scores user input against enriched
 * keyword sets per agent, boosted by conversation context momentum.
 * If one agent scores substantially above the rest AND differs from
 * the current agent, recommend a switch.
 *
 * Tier 3 (context-informed sticky): if no strong signal from current
 * message, use conversation context to decide whether to stay or switch.
 */
export function classifyIntentByHeuristic(
  userInput: string,
  previousAgent?: string,
  sessionContext?: Content[]
): { selectedAgent: string; confidence: number; reasoning: string } {
  const input = userInput.toLowerCase();

  // ── Score current message ──────────────────────────────────────────────────
  const messageScores: Record<string, number> = { socratico: 0, clinico: 0, academico: 0 };

  for (const [agent, keywords] of Object.entries(KEYWORD_SETS)) {
    let matches = 0;
    for (const kw of keywords) {
      if (input.includes(kw)) matches++;
    }
    messageScores[agent] = matches / (keywords.length * 0.15);
  }

  // File-attachment heuristic: bias toward clinico
  if (input.includes('contexto para orquestación') || input.includes('adjuntó') || input.includes('adjunto')) {
    messageScores.clinico += 0.2;
  }

  // ── Analyze conversation context (if available) ────────────────────────────
  const contextAnalysis = sessionContext && sessionContext.length > 0
    ? analyzeConversationContext(sessionContext)
    : null;

  // ── Combine signals: message keywords + context momentum ────────────────────
  const combinedScores: Record<string, number> = { socratico: 0, clinico: 0, academico: 0 };

  for (const agent of Object.keys(combinedScores)) {
    const msgScore = messageScores[agent];
    const ctxScore = contextAnalysis ? contextAnalysis.scores[agent] : 0;
    combinedScores[agent] = (msgScore * MESSAGE_WEIGHT) + (ctxScore * CONTEXT_WEIGHT);
  }

  // Find best and second-best from combined scores
  const sorted = Object.entries(combinedScores).sort((a, b) => b[1] - a[1]);
  const [bestAgent, bestScore] = sorted[0];
  const [, secondScore] = sorted[1];
  const margin = bestScore - secondScore;

  const defaultAgent = previousAgent || 'socratico';

  // Tier 2: Strong combined signal → switch
  if (bestScore > 0.3 && margin > 0.15 && bestAgent !== defaultAgent) {
    const confidence = Math.min(0.9, 0.7 + bestScore * 0.2);
    const displayName = AGENT_DISPLAY_NAMES[`activar_modo_${bestAgent}`] || bestAgent;
    const contextNote = contextAnalysis?.dominantAgent === bestAgent
      ? ' (reforzado por contexto conversacional)'
      : '';
    return {
      selectedAgent: bestAgent,
      confidence,
      reasoning: `${displayName} seleccionado por señal combinada (score: ${bestScore.toFixed(2)}, margen: ${margin.toFixed(2)})${contextNote}`
    };
  }

  // Tier 2b: Current message is ambiguous but conversation context has clear direction
  // AND the context-dominant agent differs from the current agent
  if (contextAnalysis?.dominantAgent &&
      contextAnalysis.dominantAgent !== defaultAgent &&
      contextAnalysis.scores[contextAnalysis.dominantAgent] > 0.1 &&
      bestScore < 0.2) {
    const ctxAgent = contextAnalysis.dominantAgent;
    const ctxScore = contextAnalysis.scores[ctxAgent];
    const displayName = AGENT_DISPLAY_NAMES[`activar_modo_${ctxAgent}`] || ctxAgent;
    return {
      selectedAgent: ctxAgent,
      confidence: Math.min(0.85, 0.65 + ctxScore * 0.2),
      reasoning: `${displayName} seleccionado por contexto conversacional (score contexto: ${ctxScore.toFixed(2)}, mensaje ambiguo)`
    };
  }

  // Tier 3: No strong signal → sticky routing
  const displayName = AGENT_DISPLAY_NAMES[`activar_modo_${defaultAgent}`] || defaultAgent;
  return {
    selectedAgent: defaultAgent,
    confidence: 0.85,
    reasoning: `${displayName} mantenido por continuidad de sesión`
  };
}

// ─── Metadata-Informed Routing ────────────────────────────────────────────────

/**
 * Detects edge cases based on clinical risk metadata.
 * Routes to 'clinico' (most robust agent) when risk is detected.
 */
export function isEdgeCaseRisk(metadata: OperationalMetadata): EdgeCaseDetectionResult {
  const factors: string[] = [];
  const config = DEFAULT_EDGE_CASE_CONFIG;

  if (metadata.risk_level === 'critical') {
    factors.push('risk_level_critical');
  }
  if (metadata.risk_level === 'high') {
    factors.push('risk_level_high');
  }
  if (metadata.requires_immediate_attention) {
    factors.push('requires_immediate_attention');
  }
  if (metadata.risk_flags_active.length > 0) {
    factors.push(...metadata.risk_flags_active.map(f => `risk_flag_${f}`));
  }

  const isEdgeCase = factors.length > 0;

  return {
    is_edge_case: isEdgeCase,
    edge_case_type: isEdgeCase ? 'risk' : undefined,
    detected_factors: factors,
    recommended_agent: 'clinico',
    confidence: isEdgeCase ? 1.0 : 0,
    reasoning: isEdgeCase
      ? `Riesgo clínico detectado: ${factors.join(', ')}. Enrutando a Especialista en Documentación (agente más robusto).`
      : ''
  };
}

/**
 * Detects edge cases based on system stress indicators.
 * Ping-pong switching, extended sessions, or late-night long sessions.
 */
export function isEdgeCaseStress(metadata: OperationalMetadata): EdgeCaseDetectionResult {
  const factors: string[] = [];
  const config = DEFAULT_EDGE_CASE_CONFIG;

  if (metadata.consecutive_switches > config.stress.max_consecutive_switches) {
    factors.push('consecutive_switches_extreme');
  }
  if (metadata.session_duration_minutes > config.stress.max_session_duration_minutes) {
    factors.push('session_very_extended');
  }
  if (
    metadata.time_of_day === 'night' &&
    metadata.session_duration_minutes > config.stress.night_session_threshold_minutes
  ) {
    factors.push('night_session_extended');
  }

  const isEdgeCase = factors.length > 0;

  return {
    is_edge_case: isEdgeCase,
    edge_case_type: isEdgeCase ? 'stress' : undefined,
    detected_factors: factors,
    recommended_agent: 'clinico',
    confidence: isEdgeCase ? 1.0 : 0,
    reasoning: isEdgeCase
      ? `Estrés del sistema detectado: ${factors.join(', ')}. Enrutando a Especialista en Documentación para estabilizar.`
      : ''
  };
}

/**
 * Detects sensitive content in user input combined with risk context.
 * Checks for critical keywords and high-risk keywords.
 */
export function isEdgeCaseSensitiveContent(
  userInput: string,
  metadata: OperationalMetadata
): EdgeCaseDetectionResult {
  const config = DEFAULT_EDGE_CASE_CONFIG;
  const inputLower = userInput.toLowerCase();
  const factors: string[] = [];

  const hasCriticalKeyword = config.risk.critical_keywords.some(kw => inputLower.includes(kw));
  const hasHighRiskKeyword = config.risk.high_risk_keywords.some(kw => inputLower.includes(kw));

  if (hasCriticalKeyword) {
    factors.push('critical_keyword_detected');
  }
  if (hasHighRiskKeyword) {
    factors.push('high_risk_keyword_detected');
  }

  // If require_context_for_detection is false, keywords alone trigger the edge case.
  // If true, we also need risk flags or elevated risk level.
  const hasRiskContext =
    !config.risk.require_context_for_detection ||
    metadata.risk_flags_active.length > 0 ||
    metadata.risk_level === 'high' ||
    metadata.risk_level === 'critical';

  const isEdgeCase = factors.length > 0 && hasRiskContext;

  if (isEdgeCase && metadata.risk_flags_active.length > 0) {
    factors.push(...metadata.risk_flags_active.map(f => `risk_flag_${f}`));
  }

  return {
    is_edge_case: isEdgeCase,
    edge_case_type: isEdgeCase ? 'sensitive_content' : undefined,
    detected_factors: factors,
    recommended_agent: 'clinico',
    confidence: isEdgeCase ? 1.0 : 0,
    reasoning: isEdgeCase
      ? `Contenido sensible detectado: ${factors.join(', ')}. Enrutando a Especialista en Documentación (agente más robusto y restrictivo).`
      : ''
  };
}

/**
 * Metadata-informed intent classification with conversation context awareness.
 *
 * Replaces pure keyword-based routing with a layered decision strategy:
 *   1. Edge case detection (risk, stress, sensitive content) → clinico override
 *   2. Explicit agent request detection (regex) → direct routing
 *   3. Context-aware keyword heuristic scoring (Tier 2) → switch if strong signal
 *   4. Therapeutic phase influence
 *   5. Sticky routing (Tier 3) → stay with current agent
 *   6. Fallback → socratico
 *
 * The metadata + conversation context are used to:
 * - Override routing in critical situations (risk, stress)
 * - Adjust confidence thresholds dynamically
 * - Prevent socratico from handling high-risk cases
 * - Provide enriched decision context with justification
 * - Use conversation momentum to disambiguate intent
 */
export function classifyIntentWithMetadata(
  userInput: string,
  previousAgent?: string,
  metadata?: OperationalMetadata,
  sessionContext?: Content[]
): RoutingDecision {
  // If no metadata is provided, fall back to heuristic-only routing (backward compat)
  if (!metadata) {
    const heuristic = classifyIntentByHeuristic(userInput, previousAgent, sessionContext);
    return {
      agent: heuristic.selectedAgent as 'socratico' | 'clinico' | 'academico',
      confidence: heuristic.confidence,
      reason: RoutingReason.NORMAL_CLASSIFICATION,
      metadata_factors: ['no_metadata_available'],
      is_edge_case: false
    };
  }

  // ── Step 1: Edge case detection ────────────────────────────────────────────

  // 1a. Critical/high risk override → clinico
  const riskResult = isEdgeCaseRisk(metadata);
  if (riskResult.is_edge_case) {
    logger.warn('🚨 EDGE CASE: Risk detected, routing to clinico', {
      factors: riskResult.detected_factors,
      riskLevel: metadata.risk_level
    });
    return {
      agent: 'clinico',
      confidence: 1.0,
      reason: metadata.risk_level === 'critical'
        ? RoutingReason.CRITICAL_RISK_OVERRIDE
        : RoutingReason.HIGH_RISK_OVERRIDE,
      metadata_factors: riskResult.detected_factors,
      is_edge_case: true,
      edge_case_type: 'risk'
    };
  }

  // 1b. System stress override → clinico
  const stressResult = isEdgeCaseStress(metadata);
  if (stressResult.is_edge_case) {
    logger.warn('⚠️ EDGE CASE: Stress detected, routing to clinico', {
      factors: stressResult.detected_factors
    });
    return {
      agent: 'clinico',
      confidence: 1.0,
      reason: RoutingReason.STRESS_OVERRIDE,
      metadata_factors: stressResult.detected_factors,
      is_edge_case: true,
      edge_case_type: 'stress'
    };
  }

  // 1c. Sensitive content + risk context → clinico
  const sensitiveResult = isEdgeCaseSensitiveContent(userInput, metadata);
  if (sensitiveResult.is_edge_case) {
    logger.warn('⚠️ EDGE CASE: Sensitive content detected, routing to clinico', {
      factors: sensitiveResult.detected_factors
    });
    return {
      agent: 'clinico',
      confidence: 1.0,
      reason: RoutingReason.SENSITIVE_CONTENT_OVERRIDE,
      metadata_factors: sensitiveResult.detected_factors,
      is_edge_case: true,
      edge_case_type: 'sensitive_content'
    };
  }

  // ── Step 2: Explicit agent request (regex) ─────────────────────────────────
  const explicitRequest = detectExplicitAgentRequest(userInput);
  if (explicitRequest.isExplicit) {
    const agent = explicitRequest.requestType as 'socratico' | 'clinico' | 'academico';
    // Prevent socratico in elevated risk sessions (even with explicit request)
    if (agent === 'socratico' && (metadata.risk_level === 'high' || metadata.risk_level === 'critical')) {
      logger.warn('⚠️ Explicit socratico request blocked due to elevated risk, routing to clinico');
      return {
        agent: 'clinico',
        confidence: 0.95,
        reason: RoutingReason.HIGH_RISK_OVERRIDE,
        metadata_factors: ['explicit_request_blocked_by_risk', `risk_level_${metadata.risk_level}`],
        is_edge_case: true,
        edge_case_type: 'risk'
      };
    }
    return {
      agent,
      confidence: 1.0,
      reason: RoutingReason.EXPLICIT_USER_REQUEST,
      metadata_factors: ['explicit_agent_request'],
      is_edge_case: false
    };
  }

  // ── Step 3: Context-aware keyword heuristic scoring ─────────────────────────
  const heuristic = classifyIntentByHeuristic(userInput, previousAgent, sessionContext);

  // Adjust confidence threshold based on metadata
  const dynamicThreshold = calculateDynamicConfidenceThreshold(metadata);

  // If heuristic gave a strong signal (switched agent) and confidence is above dynamic threshold
  if (heuristic.selectedAgent !== (previousAgent || 'socratico') && heuristic.confidence >= dynamicThreshold) {
    const selectedAgent = heuristic.selectedAgent as 'socratico' | 'clinico' | 'academico';
    // Prevent routing to socratico if risk is elevated
    if (selectedAgent === 'socratico' && (metadata.risk_level === 'high' || metadata.risk_level === 'critical')) {
      return {
        agent: previousAgent as 'socratico' | 'clinico' | 'academico' || 'clinico',
        confidence: 0.85,
        reason: RoutingReason.HIGH_RISK_OVERRIDE,
        metadata_factors: ['heuristic_socratico_blocked_by_risk', `risk_level_${metadata.risk_level}`],
        is_edge_case: true,
        edge_case_type: 'risk'
      };
    }
    return {
      agent: selectedAgent,
      confidence: heuristic.confidence,
      reason: RoutingReason.HIGH_CONFIDENCE_CLASSIFICATION,
      metadata_factors: ['keyword_heuristic_match'],
      is_edge_case: false
    };
  }

  // ── Step 4: Therapeutic phase influence ────────────────────────────────────
  // Therapeutic phase influence applies when heuristic didn't find a strong
  // keyword signal (i.e., stayed with current agent via sticky routing).
  const heuristicStayed = heuristic.selectedAgent === (previousAgent || 'socratico');

  if (metadata.therapeutic_phase === 'closure' && metadata.session_count > 10) {
    // In closure phase with many sessions, bias toward documentation
    if (heuristicStayed && heuristic.selectedAgent !== 'clinico') {
      return {
        agent: 'clinico',
        confidence: 0.82,
        reason: RoutingReason.CLOSURE_PHASE_SUGGESTED,
        metadata_factors: ['closure_phase', `session_count_${metadata.session_count}`],
        is_edge_case: false
      };
    }
  }

  if (metadata.therapeutic_phase === 'assessment') {
    // In assessment phase, bias toward socratico for exploration
    if (heuristicStayed && heuristic.selectedAgent !== 'socratico' && heuristic.selectedAgent !== 'academico') {
      return {
        agent: 'socratico',
        confidence: 0.80,
        reason: RoutingReason.ASSESSMENT_PHASE_SUGGESTED,
        metadata_factors: ['assessment_phase'],
        is_edge_case: false
      };
    }
  }

  // ── Step 5: Sticky routing with stability ──────────────────────────────────
  const defaultAgent = (previousAgent || 'socratico') as 'socratico' | 'clinico' | 'academico';

  // If there have been frequent recent switches, penalize further switching
  if (metadata.consecutive_switches > 2) {
    return {
      agent: defaultAgent,
      confidence: 0.85,
      reason: RoutingReason.STABILITY_OVERRIDE,
      metadata_factors: [`consecutive_switches_${metadata.consecutive_switches}`],
      is_edge_case: false
    };
  }

  // ── Step 6: Default — maintain current agent or fallback to socratico ──────
  return {
    agent: defaultAgent,
    confidence: 0.85,
    reason: RoutingReason.CONTINUITY_MAINTAINED,
    metadata_factors: ['no_strong_signal'],
    is_edge_case: false
  };
}

/**
 * Calculates a dynamic confidence threshold based on operational metadata.
 * Higher thresholds = more reluctant to switch agents.
 */
function calculateDynamicConfidenceThreshold(metadata: OperationalMetadata): number {
  const config = DEFAULT_EDGE_CASE_CONFIG;
  let threshold = config.confidence.high_confidence_threshold; // 0.75 default

  // Increase threshold if risk flags are active (be more cautious about switching)
  if (metadata.risk_flags_active.length > 0) {
    threshold = Math.max(threshold, 0.85);
  }

  // Increase threshold if there have been frequent switches (prevent ping-pong)
  if (metadata.consecutive_switches > 2) {
    threshold += 0.10;
  }

  // Increase threshold for very short sessions (avoid premature switches before enough context)
  if (metadata.session_duration_minutes < 5) {
    threshold += 0.05;
  }

  return Math.min(0.95, threshold);
}

/**
 * Maps function name to agent type.
 */
export function mapFunctionToAgent(functionName: string): 'socratico' | 'clinico' | 'academico' {
  if (functionName.includes('socratico')) return 'socratico';
  if (functionName.includes('clinico')) return 'clinico';
  if (functionName.includes('academico')) return 'academico';
  return 'socratico';
}

/**
 * Categorizes confidence level for analysis.
 */
export function categorizeConfidence(confidence: number): string {
  if (confidence >= 0.95) return 'EXCELENTE';
  if (confidence >= 0.85) return 'ALTA';
  if (confidence >= 0.7) return 'MEDIA';
  if (confidence >= 0.5) return 'BAJA';
  return 'CRÍTICA';
}

/**
 * Creates enriched context for agent transitions.
 */
export function createEnrichedContext(
  originalQuery: string,
  detectedIntent: string,
  extractedEntities: ExtractedEntity[],
  entityExtractionResult: EntityExtractionResult,
  sessionHistory: Content[],
  previousAgent: string | undefined,
  transitionReason: string,
  confidence: number,
  isExplicitRequest: boolean = false
): EnrichedContext {
  return {
    originalQuery,
    detectedIntent,
    extractedEntities,
    entityExtractionResult,
    sessionHistory,
    previousAgent,
    transitionReason,
    confidence,
    isExplicitRequest
  };
}

/**
 * Generates human-readable orchestration reasoning.
 */
export function generateOrchestrationReasoning(
  intentResult: IntentClassificationResult,
  entityResult: EntityExtractionResult,
  selectedTools: any[]
): string {
  const justificacion = intentResult.parameters?.justificacion_clinica as string | undefined;
  const trimmed = justificacion?.trim();
  if (trimmed) {
    return trimmed;
  }

  const agentName = AGENT_DISPLAY_NAMES[intentResult.functionName] || 'especialista';
  const razon = (intentResult.parameters?.razon_activacion as string)
    || (intentResult.parameters?.tipo_documentacion as string)
    || (intentResult.parameters?.tipo_busqueda as string)
    || '';

  if (razon) {
    return `${agentName} seleccionado: ${razon}`;
  }

  return `${agentName} seleccionado para procesar esta consulta`;
}

/**
 * Extracts recent topics from conversation history.
 */
export function extractRecentTopics(sessionContext: Content[]): string[] {
  const recentMessages = sessionContext.slice(-5);
  const topics: string[] = [];

  recentMessages.forEach(content => {
    content.parts?.forEach(part => {
      if ('text' in part && part.text) {
        const keywords = part.text.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 4)
          .slice(0, 3);
        topics.push(...keywords);
      }
    });
  });

  return Array.from(new Set(topics)).slice(0, 10);
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function getRequiredParamsForFunction(functionName: string): string[] {
  const paramMapping: Record<string, string[]> = {
    'activar_modo_socratico': ['tema_exploracion', 'nivel_profundidad'],
    'activar_modo_clinico': ['tipo_resumen'],
    'activar_modo_academico': ['terminos_busqueda']
  };
  return paramMapping[functionName] || [];
}

function assessInputClarity(userInput: string, functionName: string): number {
  const input = userInput.toLowerCase();

  const keywordSets: Record<string, string[]> = {
    'activar_modo_socratico': ['reflexionar', 'explorar', 'pensar', 'analizar', 'insight', 'cuestionamiento', 'profundo', 'filósofo', 'socrático'],
    'activar_modo_clinico': ['resumen', 'documentar', 'nota', 'sesión', 'progreso', 'plan', 'soap', 'archivista', 'clínico'],
    'activar_modo_academico': ['investigación', 'estudio', 'evidencia', 'research', 'paper', 'científico', 'avala', 'investigador', 'académico']
  };

  const relevantKeywords = keywordSets[functionName] || [];
  const matchCount = relevantKeywords.filter(keyword => input.includes(keyword)).length;

  return Math.min(1.0, matchCount / Math.max(1, relevantKeywords.length * 0.3));
}

/**
 * Builds the contextual prompt for intent classification.
 */
export function buildContextualPrompt(
  userInput: string,
  sessionContext: Content[],
  enrichedSessionContext: any,
  contextWindowManager: ContextWindowManager
): string {
  const contextResult = contextWindowManager.processContext(sessionContext, userInput);
  const optimizedContext = formatContextForPrompt(contextResult, contextWindowManager);

  let patientContextSection = '';
  if (enrichedSessionContext?.patient_reference) {
    patientContextSection = `
**CONTEXTO DE PACIENTE ACTIVO:**
Paciente ID: ${enrichedSessionContext.patient_reference}
Modo Clínico: ${enrichedSessionContext.clinicalMode || 'Estándar'}
Agente Activo: ${enrichedSessionContext.activeAgent || 'No especificado'}

⚠️ PRIORIDAD: Considera el contexto del paciente específico al clasificar intenciones. Las consultas relacionadas con este paciente deben priorizarse según su historial y necesidades terapéuticas.
`;
  }

  return `Eres el Orquestador Inteligente de HopeAI, especializado en clasificación semántica de intenciones para profesionales de psicología.

**SISTEMA DE ESPECIALISTAS DISPONIBLES:**

🧠 **Supervisor Clínico** - El Filósofo Terapéutico
• ACTIVAR para: Exploración reflexiva, cuestionamiento socrático, facilitación de insights
• PALABRAS CLAVE: reflexionar, explorar, analizar, cuestionar, insight, autoconocimiento, pensar, meditar, examinar, introspección
• EJEMPLOS: "¿Cómo reflexionar sobre esto?", "Necesito explorar más profundo", "Ayúdame a analizar", "Quiero desarrollar insight"

📋 **Especialista en Documentación** - El Archivista Profesional  
• ACTIVAR para: Documentación clínica, síntesis profesional, estructuración de información
• PALABRAS CLAVE: documentar, notas, resumen, SOAP, expediente, bitácora, redactar, estructurar, formato
• EJEMPLOS: "Necesito documentar esta sesión", "Ayúdame con notas SOAP", "Estructura esta información", "Redacta un resumen"

🔬 **HopeAI Académico** - El Investigador Científico
• ACTIVAR para: Evidencia científica, validación empírica, literatura especializada, referencias directas al investigador
• PALABRAS CLAVE: estudios, evidencia, investigación, papers, validación, científica, metaanálisis, ensayos, investigador académico, investigador
• EJEMPLOS: "¿Qué estudios avalan EMDR?", "Busca evidencia sobre TCC", "Necesito investigación sobre trauma", "el investigador académico?", "investigador?"

**CONTEXTO CONVERSACIONAL OPTIMIZADO:**
${optimizedContext}${patientContextSection}

${(() => {
  const files = enrichedSessionContext?.sessionFiles || [];
  if (Array.isArray(files) && files.length > 0) {
    const names = files.map((f: any) => f.name).join(', ');
    const types = files.map((f: any) => f.type || 'unknown').join(', ');
    return `\n**CONTEXTO DE ARCHIVOS EN SESIÓN (CRÍTICO):**\n` +
           `Archivos presentes: ${files.length} → ${names}\n` +
           `Tipos: ${types}\n` +
           `\nREGLA: Si existen archivos en la sesión, prioriza el enrutamiento a Especialista en Documentación para procesar/sintetizar el material, salvo que el usuario pida explícitamente investigación académica.\n` +
           `Incluso con entradas vagas o indirectas, asume que el usuario espera que trabajemos con el/los archivo(s).`;
  }
  return '';
})()}

**MENSAJE A CLASIFICAR:**
"${userInput}"

**PROTOCOLO DE CLASIFICACIÓN:**

1. **ANÁLISIS SEMÁNTICO**: Identifica palabras clave, intención subyacente y contexto emocional
2. **MAPEO DE ENTIDADES**: Detecta técnicas terapéuticas, poblaciones, trastornos, procesos
3. **CLASIFICACIÓN CONFIABLE**: 
   - Alta confianza (0.85-1.0): Intención clara y unívoca
   - Confianza moderada (0.7-0.84): Intención probable con contexto de apoyo
   - Baja confianza (0.5-0.69): Intención ambigua, requiere clarificación
4. **LLAMADAS A FUNCIONES**: Ejecuta EXACTAMENTE UNA función de intención ('activar_modo_socratico', 'activar_modo_clinico' o 'activar_modo_academico') y, DESPUÉS de esa llamada, invoca TODAS las funciones de extracción de entidades que sean relevantes (pueden ser varias). Nunca omitas la llamada de intención.

**EJEMPLOS DE CLASIFICACIÓN OPTIMIZADA:**

*Socrático (0.92):* "¿Cómo puedo ayudar a mi paciente a reflexionar sobre su resistencia al cambio?"
*Clínico (0.88):* "Necesito estructurar las notas de esta sesión en formato SOAP para el expediente"
*Académico (0.95):* "¿Qué evidencia científica respalda el uso de EMDR en veteranos con TEPT?"
*Socrático (0.78):* "Mi paciente parece bloqueado, ¿cómo explorar esto más profundamente?"
*Clínico (0.85):* "Ayúdame a redactar un resumen profesional de los últimos tres meses de terapia"
*Académico (0.91):* "Busca metaanálisis sobre la efectividad de TCC en adolescentes con depresión"

**EJECUTA LA CLASIFICACIÓN AHORA:**`;
}

/**
 * Formats context processed by Context Window Manager for the prompt.
 */
function formatContextForPrompt(contextResult: ContextProcessingResult, contextWindowManager: ContextWindowManager): string {
  if (contextResult.processedContext.length === 0) {
    return 'Inicio de conversación';
  }

  const totalMessages = contextResult.processedContext.length;
  const tokenEstimate = contextResult.metrics.tokensEstimated;
  const preserveExchanges = tokenEstimate > 6000 ? 2 : 4;
  const preserveCount = Math.min(preserveExchanges * 2, totalMessages);
  const fullStartIndex = Math.max(totalMessages - preserveCount, 0);

  const formattedMessages = contextResult.processedContext.map((content, index) => {
    const role = content.role || 'unknown';
    const roleLabel = role === 'user' ? 'Usuario' : role === 'model' ? 'Asistente' : 'Sistema';
    const textParts = (content.parts || [])
      .map(part => ('text' in part && part.text) ? part.text : '')
      .filter(partText => partText && partText.length > 0);
    const combinedText = textParts.join('\n');
    const hasContent = combinedText.length > 0;
    const displayFull = index >= fullStartIndex || index === 0;

    if (!hasContent) {
      return `[${index + 1}] ${roleLabel}: [sin contenido]`;
    }

    if (displayFull) {
      return `[${index + 1}] ${roleLabel}:\n${combinedText}`;
    }

    const truncated = combinedText.length > 200 ? combinedText.substring(0, 200) + '…' : combinedText;
    return `[${index + 1}] ${roleLabel}: ${truncated}`;
  }).join('\n\n');

  const contextualRefs = contextWindowManager.getContextualReferences();
  const referencesInfo = contextualRefs.length > 0
    ? `\n\n**Referencias Contextuales Detectadas:**\n${contextualRefs.map(ref =>
        `- ${ref.type}: "${ref.content}" (relevancia: ${(ref.relevance * 100).toFixed(0)}%)`
      ).join('\n')}`
    : '';

  const contextMetrics = [
    `Mensajes: ${contextResult.processedContext.length}`,
    `Tokens estimados: ${contextResult.metrics.tokensEstimated}`,
    `Referencias preservadas: ${contextResult.metrics.contextualReferencesPreserved}`,
    contextResult.metrics.compressionApplied ? 'Compresión aplicada' : 'Sin compresión'
  ].join(' | ');

  return `${formattedMessages}${referencesInfo}\n\n[Métricas: ${contextMetrics}]`;
}
