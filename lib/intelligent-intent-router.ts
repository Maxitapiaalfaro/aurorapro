/**
 * Intelligent Intent Router — Thin facade
 * 
 * Coordinates intent classification, entity extraction, and agent routing.
 * Core logic extracted to lib/routing/ during P4 decomposition:
 *   - routing-types.ts: shared type definitions
 *   - intent-declarations.ts: Gemini function-calling schemas
 *   - intent-classifier.ts: LLM classification, confidence scoring, prompt building
 * 
 * @version 3.0.0 (P4 decomposition)
 */

import { ClinicalAgentRouter } from './clinical-agent-router';
import { EntityExtractionEngine } from './entity-extraction-engine';
import { ToolRegistry, ClinicalTool, ClinicalDomain } from './tool-registry';
import { ContextWindowManager, type ContextWindowConfig } from './context-window-manager';
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
  ToolSelectionContext,
  OrchestrationResult,
  RouterConfig,
} from './routing/routing-types';

import {
  classifyIntentAndExtractEntities,
  calculateCombinedConfidence,
  detectExplicitAgentRequest,
  mapFunctionToAgent,
  generateOrchestrationReasoning,
  extractRecentTopics,
} from './routing/intent-classifier';

/**
 * Orquestador de Intenciones Inteligente
 * 
 * Thin facade that delegates to extracted routing modules.
 * Preserves the original class API for backward compatibility.
 */
export class IntelligentIntentRouter {
  private agentRouter: ClinicalAgentRouter;
  private entityExtractor: EntityExtractionEngine;
  private toolRegistry: ToolRegistry;
  private contextWindowManager: ContextWindowManager;
  private config: RouterConfig;

  constructor(
    agentRouter: ClinicalAgentRouter,
    config: Partial<RouterConfig> = {}
  ) {
    this.agentRouter = agentRouter;
    this.entityExtractor = new EntityExtractionEngine();
    this.toolRegistry = ToolRegistry.getInstance();
    
    const contextConfig: Partial<ContextWindowConfig> = {
      maxExchanges: 10,
      triggerTokens: 25000,
      targetTokens: 10000,
      enableLogging: config.enableLogging || true
    };
    this.contextWindowManager = new ContextWindowManager(contextConfig);
    
    this.config = {
      confidenceThreshold: 0.65,
      fallbackAgent: 'socratico',
      enableLogging: true,
      maxRetries: 2,
      ...config
    };
  }

  /**
   * Main orchestration method with dynamic tool selection.
   * Delegates to classifyIntentAndExtractEntities for single-LLM-call optimization.
   */
  async orchestrateWithTools(
    userInput: string,
    sessionContext: Content[] = [],
    previousAgent?: string
  ): Promise<OrchestrationResult> {
    try {
      // Fast path: detect explicit agent switch requests (regex only, no LLM)
      const explicitRequest = detectExplicitAgentRequest(userInput);
      if (explicitRequest.isExplicit) {
        const basicTools = this.toolRegistry.getBasicTools();
        logger.info(`[IntentRouter] Explicit agent request detected: ${explicitRequest.requestType}`);
        return {
          selectedAgent: explicitRequest.requestType,
          contextualTools: basicTools.map(tool => tool.declaration),
          toolMetadata: basicTools,
          confidence: 1.0,
          reasoning: `Solicitud explícita de cambio a modo ${explicitRequest.requestType}`
        };
      }

      const combinedResult = await classifyIntentAndExtractEntities(
        userInput, sessionContext, this.entityExtractor, this.contextWindowManager, this.config
      );
      
      if (!combinedResult.intentResult) {
        return this.createFallbackOrchestration(userInput, sessionContext, 'Intent classification failed');
      }
    
      const toolSelectionContext: ToolSelectionContext = {
        conversationHistory: sessionContext,
        currentIntent: combinedResult.intentResult.functionName,
        extractedEntities: combinedResult.entityResult.entities,
        sessionMetadata: {
          previousAgent,
          sessionLength: sessionContext.length,
          recentTopics: extractRecentTopics(sessionContext)
        }
      };
    
      const selectedTools = await this.selectContextualTools(toolSelectionContext);
      const selectedAgent = mapFunctionToAgent(combinedResult.intentResult.functionName);
    
      return {
        selectedAgent,
        contextualTools: selectedTools.map(tool => tool.declaration),
        toolMetadata: selectedTools,
        confidence: calculateCombinedConfidence(
          combinedResult.intentResult.confidence, 
          combinedResult.entityResult.confidence, 
          combinedResult.intentResult.functionName
        ),
        reasoning: generateOrchestrationReasoning(
          combinedResult.intentResult, 
          combinedResult.entityResult, 
          selectedTools
        )
      };

    } catch (error) {
      logger.error('[IntelligentIntentRouter] Error en orquestación:', { error });
      return this.createFallbackOrchestration(userInput, sessionContext, `Orchestration error: ${error}`);
    }
  }

  /**
   * Selects contextual tools based on intent and entities.
   */
  private async selectContextualTools(context: ToolSelectionContext): Promise<ClinicalTool[]> {
    const relevantDomains = this.mapIntentToDomains(context.currentIntent);
    const entityTypes = context.extractedEntities.map(e => e.type);
    
    return this.toolRegistry.getToolsForContext({
      domains: relevantDomains,
      entityTypes,
      sessionLength: context.sessionMetadata.sessionLength,
      previousAgent: context.sessionMetadata.previousAgent
    });
  }

  /**
   * Maps intents to clinical domains.
   */
  private mapIntentToDomains(intent: string): ClinicalDomain[] {
    const mapping: Record<string, ClinicalDomain[]> = {
      'activar_modo_socratico': [ClinicalDomain.GENERAL, ClinicalDomain.ANXIETY],
      'activar_modo_clinico': [ClinicalDomain.GENERAL, ClinicalDomain.DEPRESSION],
      'activar_modo_academico': [ClinicalDomain.GENERAL, ClinicalDomain.TRAUMA]
    };
    
    return mapping[intent] || [ClinicalDomain.GENERAL];
  }

  /**
   * Creates fallback orchestration result.
   */
  private createFallbackOrchestration(
    userInput: string,
    sessionContext: Content[],
    reason: string
  ): OrchestrationResult {
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
