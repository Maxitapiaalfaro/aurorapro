/**
 * Intelligent Intent Router — Metadata-informed routing facade
 *
 * Implements the Metadata-Informed Routing architecture:
 *   1. Edge case detection (risk, stress, sensitive content) → clinico override
 *   2. Explicit regex detection (unchanged)
 *   3. Keyword heuristic scoring (Tier 2) → informed by operational metadata
 *   4. Sticky routing to current agent (Tier 3)
 *
 * When operational metadata is provided, the router uses it to detect
 * edge cases and make intelligent routing decisions. When metadata is
 * not available, falls back to deterministic keyword heuristics.
 *
 * @version 5.0.0 (Metadata-informed routing)
 */

import { ClinicalAgentRouter } from './clinical-agent-router';
import { ToolRegistry } from './tool-registry';
import { createLogger } from '@/lib/logger';
import type { OperationalMetadata, RoutingDecision } from '@/types/operational-metadata';

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
  classifyIntentWithMetadata,
} from './routing/intent-classifier';

/**
 * Orquestador de Intenciones Inteligente
 *
 * Metadata-informed router with edge case detection.
 * When OperationalMetadata is provided, uses intelligent routing
 * that considers risk, stress, therapeutic phase, and session context.
 * Falls back to deterministic heuristics when metadata is unavailable.
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
   * Main orchestration method — metadata-informed routing.
   *
   * When operationalMetadata is provided:
   *   Step 1: Edge case detection (risk/stress/sensitive content) → clinico
   *   Step 2: Explicit regex detection → direct routing
   *   Step 3: Keyword heuristic + metadata-informed scoring
   *   Step 4: Therapeutic phase influence
   *   Step 5: Sticky routing with stability
   *   Step 6: Fallback to socratico
   *
   * When operationalMetadata is NOT provided:
   *   Falls back to deterministic keyword heuristics (backward compat)
   */
  async orchestrateWithTools(
    userInput: string,
    _sessionContext: Content[] = [],
    previousAgent?: string,
    operationalMetadata?: OperationalMetadata
  ): Promise<OrchestrationResult & { routingDecision?: RoutingDecision }> {
    try {
      // Use metadata-informed routing when metadata is available
      if (operationalMetadata) {
        const routingDecision = classifyIntentWithMetadata(userInput, previousAgent, operationalMetadata);
        const basicTools = this.toolRegistry.getBasicTools();

        if (this.config.enableLogging) {
          logger.info('[IntentRouter] Metadata-informed routing', {
            selectedAgent: routingDecision.agent,
            confidence: routingDecision.confidence.toFixed(2),
            reason: routingDecision.reason,
            isEdgeCase: routingDecision.is_edge_case,
            edgeCaseType: routingDecision.edge_case_type || 'none',
            previousAgent: previousAgent || 'none'
          });
        }

        return {
          selectedAgent: routingDecision.agent,
          contextualTools: basicTools.map(tool => tool.declaration),
          toolMetadata: basicTools,
          confidence: routingDecision.confidence,
          reasoning: routingDecision.is_edge_case
            ? `⚠️ ${routingDecision.reason}: ${routingDecision.metadata_factors.join(', ')}`
            : `${routingDecision.agent} seleccionado — ${routingDecision.reason}`,
          routingDecision
        };
      }

      // Fallback: deterministic heuristic routing (no metadata)
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
        logger.debug('[IntentRouter] Heuristic routing (no metadata)', {
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
