/**
 * Routing Module — Intent classification and agent routing
 * 
 * Re-exports all public types and functions from the routing subsystem.
 * Created during P4 decomposition of intelligent-intent-router.ts.
 */

export type {
  Content,
  ToolSelectionContext,
  OrchestrationResult,
  EnrichedContext,
  IntentClassificationResult,
  RouterConfig
} from './routing-types';

export {
  INTENT_FUNCTION_DECLARATIONS,
  VALID_INTENT_FUNCTIONS,
  AGENT_DISPLAY_NAMES
} from './intent-declarations';

export {
  classifyIntentAndExtractEntities,
  classifyIntent,
  validateFunctionCall,
  calculateEnhancedConfidence,
  calculateCombinedConfidence,
  calculateOptimizedThreshold,
  detectExplicitAgentRequest,
  mapFunctionToAgent,
  categorizeConfidence,
  createEnrichedContext,
  generateOrchestrationReasoning,
  extractRecentTopics,
  withRetry,
  buildContextualPrompt
} from './intent-classifier';
