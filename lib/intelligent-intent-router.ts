/**
 * Intelligent Intent Router — Thin facade
 *
 * R1: Deterministic routing via keyword heuristics.
 * Eliminates the LLM pre-classification call (~300-700ms saved per message).
 *
 * Routing tiers:
 *   1. Explicit regex detection (unchanged)
 *   2. Keyword heuristic scoring (new — replaces LLM call)
 *   3. Sticky routing to current agent (new default)
 *
 * @version 4.0.0 (R1 single-call architecture)
 */

import { ClinicalAgentRouter } from './clinical-agent-router';
import { ToolRegistry } from './tool-registry';
import { createLogger } from '@/lib/logger';

const logger = createLogger('orchestration');

// Re-export types from routing module for backward compatibility
export type {
  ToolSelectionContext,
  OrchestrationResult,
  EnrichedContext,
  IntentClassificationResult,
  RouterConfig,
} from './routing/routing-types';

import type {
  Content,
  OrchestrationResult,
  RouterConfig,
} from './routing/routing-types';

import {
  detectExplicitAgentRequest,
  classifyIntentByHeuristic,
} from './routing/intent-classifier';

/**
 * Orquestador de Intenciones Inteligente
 *
 * Deterministic router — zero LLM calls.
 * Preserves the original class API for backward compatibility.
 */
export class IntelligentIntentRouter {
  private toolRegistry: ToolRegistry;
  private config: RouterConfig;

  constructor(
    _agentRouter: ClinicalAgentRouter,
    config: Partial<RouterConfig> = {}
  ) {
    this.toolRegistry = ToolRegistry.getInstance();

    this.config = {
      confidenceThreshold: 0.65,
      fallbackAgent: 'socratico',
      enableLogging: true,
      maxRetries: 2,
      ...config
    };
  }

  /**
   * Main orchestration method — deterministic, zero LLM calls.
   *
   * Tier 1: Explicit regex detection (microseconds)
   * Tier 2: Keyword heuristic scoring (<5ms)
   * Tier 3: Sticky routing to current agent (0ms)
   */
  async orchestrateWithTools(
    userInput: string,
    _sessionContext: Content[] = [],
    previousAgent?: string
  ): Promise<OrchestrationResult> {
    try {
      // Tier 1: Explicit regex — catches "activar modo X" commands
      const explicitRequest = detectExplicitAgentRequest(userInput);
      if (explicitRequest.isExplicit) {
        const basicTools = this.toolRegistry.getBasicTools();
        logger.info(`[IntentRouter] Explicit agent request: ${explicitRequest.requestType}`);
        return {
          selectedAgent: explicitRequest.requestType,
          contextualTools: basicTools.map(tool => tool.declaration),
          toolMetadata: basicTools,
          confidence: 1.0,
          reasoning: `Solicitud explícita de cambio a modo ${explicitRequest.requestType}`
        };
      }

      // Tier 2 + 3: Heuristic classification (replaces LLM call)
      const heuristicResult = classifyIntentByHeuristic(userInput, previousAgent);
      const basicTools = this.toolRegistry.getBasicTools();

      if (this.config.enableLogging) {
        logger.debug('[IntentRouter] Heuristic routing', {
          selectedAgent: heuristicResult.selectedAgent,
          confidence: heuristicResult.confidence.toFixed(2),
          previousAgent: previousAgent || 'none'
        });
      }

      return {
        selectedAgent: heuristicResult.selectedAgent,
        contextualTools: basicTools.map(tool => tool.declaration),
        toolMetadata: basicTools,
        confidence: heuristicResult.confidence,
        reasoning: heuristicResult.reasoning
      };

    } catch (error) {
      logger.error('[IntelligentIntentRouter] Error:', { error });
      return this.createFallbackOrchestration();
    }
  }

  /**
   * Creates fallback orchestration result.
   */
  private createFallbackOrchestration(): OrchestrationResult {
    const fallbackTools = this.toolRegistry.getBasicTools();

    return {
      selectedAgent: this.config.fallbackAgent,
      contextualTools: fallbackTools.map(tool => tool.declaration),
      toolMetadata: fallbackTools,
      confidence: 0.5,
      reasoning: `Supervisor Clínico seleccionado como especialista predeterminado para analizar la consulta`
    };
  }

  /**
   * Updates router configuration.
   */
  updateConfig(newConfig: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Factory function to create an intent router instance.
 */
export function createIntelligentIntentRouter(
  agentRouter: ClinicalAgentRouter,
  config?: Partial<RouterConfig>
): IntelligentIntentRouter {
  return new IntelligentIntentRouter(agentRouter, config);
}
