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
import type { AgentType } from '@/types/clinical-types';
import {
  OperationalMetadata,
  RoutingDecision,
  RoutingReason,
} from '@/types/operational-metadata';

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
  EnrichedContext,
  IntentClassificationResult,
  RouterConfig,
} from './routing/routing-types';

import {
  classifyIntentAndExtractEntities,
  classifyIntent,
  calculateCombinedConfidence,
  calculateOptimizedThreshold,
  detectExplicitAgentRequest,
  mapFunctionToAgent,
  categorizeConfidence,
  createEnrichedContext,
  generateOrchestrationReasoning,
  extractRecentTopics,
  buildContextualPrompt,
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
      console.error('[IntelligentIntentRouter] Error en orquestación:', error);
      return this.createFallbackOrchestration(userInput, sessionContext, `Orchestration error: ${error}`);
    }
  }

  /**
   * Classifies user intent and routes to the appropriate agent.
   * Used by hopeai-system.ts fallback path.
   */
  async routeUserInput(
    userInput: string,
    sessionContext: Content[],
    currentAgent?: string,
    enrichedSessionContext?: any,
    operationalMetadata?: OperationalMetadata
  ): Promise<{
    success: boolean;
    targetAgent: string;
    enrichedContext: EnrichedContext;
    requiresUserClarification: boolean;
    errorMessage?: string;
    routingDecision?: RoutingDecision;
  }> {
    try {
      // Process context with Context Window Manager
      const contextResult = this.contextWindowManager.processContext(sessionContext, userInput);
      const optimizedContext = this.convertToLocalContentType(contextResult.processedContext);

      if (this.config.enableLogging) {
        console.log('🔄 Context Window Processing:', {
          originalMessages: sessionContext.length,
          processedMessages: optimizedContext.length,
          tokensEstimated: contextResult.metrics.tokensEstimated,
          contextualReferences: contextResult.metrics.contextualReferencesPreserved,
          compressionApplied: contextResult.metrics.compressionApplied
        });
      }

      // Step 1: Detect explicit agent switch requests
      const explicitRequest = detectExplicitAgentRequest(userInput);

      if (explicitRequest.isExplicit) {
        const entityExtractionResult = await this.entityExtractor.extractEntities(
          userInput,
          enrichedSessionContext
        );

        const enrichedContext = createEnrichedContext(
          userInput,
          `activar_modo_${explicitRequest.requestType}`,
          entityExtractionResult.entities,
          entityExtractionResult,
          optimizedContext,
          currentAgent,
          `Solicitud explícita de cambio a modo ${explicitRequest.requestType}`,
          1.0,
          true
        );

        if (this.config.enableLogging) {
          console.log(`[IntentRouter] Solicitud explícita detectada: ${explicitRequest.requestType}`);
        }

        const routingDecision: RoutingDecision = {
          agent: explicitRequest.requestType as AgentType,
          confidence: 1.0,
          reason: RoutingReason.EXPLICIT_USER_REQUEST,
          metadata_factors: ['explicit_request'],
          is_edge_case: false
        };

        return {
          success: true,
          targetAgent: explicitRequest.requestType,
          enrichedContext,
          requiresUserClarification: false,
          routingDecision
        };
      }
      
      // Step 2: Classify intent via LLM
      const classificationResult = await classifyIntent(
        userInput, optimizedContext, enrichedSessionContext, this.contextWindowManager, this.config
      );
      
      if (!classificationResult) {
        return this.handleFallback(userInput, optimizedContext, 'No se pudo clasificar la intención');
      }

      // Step 3: Extract entities
      const entityExtractionResult = await this.entityExtractor.extractEntities(
        userInput,
        enrichedSessionContext
      );

      if (this.config.enableLogging) {
        console.log(`[IntentRouter] Entidades extraídas: ${entityExtractionResult.entities.length}`);
      }

      // Step 4: Calculate combined confidence with dynamic threshold
      let combinedConfidence = calculateCombinedConfidence(
        classificationResult.confidence,
        entityExtractionResult.confidence,
        classificationResult.functionName
      );
      
      // Contextual reference boost
      const contextualRefs = this.contextWindowManager.getContextualReferences();
      const relevantRefs = contextualRefs.filter(ref => ref.relevance > 0.7);
      if (relevantRefs.length > 0) {
        const contextualBoost = Math.min(0.15, relevantRefs.length * 0.05);
        combinedConfidence = Math.min(1.0, combinedConfidence + contextualBoost);
        
        if (this.config.enableLogging) {
          console.log(`🎯 Contextual boost applied: +${(contextualBoost * 100).toFixed(1)}%`);
        }
      }

      const dynamicThreshold = calculateOptimizedThreshold(
        classificationResult.functionName, 
        entityExtractionResult.entities,
        this.config.confidenceThreshold,
        classificationResult
      );
      
      // Confidence analysis logging
      if (this.config.enableLogging) {
        let intentWeight = 0.7, entityWeight = 0.3;
        if (classificationResult.functionName === 'activar_modo_academico') {
          intentWeight = 0.8; entityWeight = 0.2;
        } else if (classificationResult.functionName === 'activar_modo_clinico') {
          intentWeight = 0.65; entityWeight = 0.35;
        } else if (classificationResult.functionName === 'activar_modo_socratico') {
          intentWeight = 0.75; entityWeight = 0.25;
        }
        
        console.log(`🎯 Análisis de Confianza Optimizado:`);
        console.log(`   - Intención: ${classificationResult.confidence.toFixed(3)} (${classificationResult.functionName})`);
        console.log(`   - Entidades: ${entityExtractionResult.confidence.toFixed(3)} (${entityExtractionResult.entities.length} detectadas)`);
        console.log(`   - Combinada: ${combinedConfidence.toFixed(3)} (${(intentWeight*100)}% intención + ${(entityWeight*100)}% entidades)`);
        console.log(`   - Umbral Dinámico: ${dynamicThreshold.toFixed(3)}`);
      }
      
      // File-aware override for borderline confidence
      const filesPresent = Array.isArray(enrichedSessionContext?.sessionFiles) && enrichedSessionContext.sessionFiles.length > 0;
      const borderline = combinedConfidence >= (dynamicThreshold - 0.1) && combinedConfidence < dynamicThreshold;
      if (filesPresent && borderline) {
        const enrichedContext = createEnrichedContext(
          userInput,
          'activar_modo_clinico',
          entityExtractionResult.entities,
          entityExtractionResult,
          optimizedContext,
          currentAgent,
          'Archivos presentes en sesión y confianza limítrofe: priorizar procesamiento clínico del material',
          Math.max(combinedConfidence, dynamicThreshold)
        );
        if (this.config.enableLogging) {
          console.log('📎 [IntentRouter] File-aware override → clinico');
        }
        return {
          success: true,
          targetAgent: 'clinico',
          enrichedContext,
          requiresUserClarification: false
        };
      }

      if (combinedConfidence < dynamicThreshold) {
        console.warn(`⚠️ Confianza insuficiente para enrutamiento automático: ${combinedConfidence.toFixed(3)} < ${dynamicThreshold.toFixed(3)}`);

        const routingDecision: RoutingDecision = {
          agent: this.config.fallbackAgent as AgentType,
          confidence: combinedConfidence,
          reason: RoutingReason.FALLBACK_LOW_CONFIDENCE,
          metadata_factors: [
            `low_confidence_${(combinedConfidence * 100).toFixed(0)}pct`,
            `threshold_${(dynamicThreshold * 100).toFixed(0)}pct`
          ],
          is_edge_case: false
        };

        return {
          success: false,
          targetAgent: this.config.fallbackAgent,
          enrichedContext: createEnrichedContext(
            userInput,
            'clarification_needed',
            [],
            entityExtractionResult,
            optimizedContext,
            currentAgent,
            `Confianza insuficiente: se procederá con análisis general por el Supervisor Clínico`,
            combinedConfidence,
            false
          ),
          requiresUserClarification: true,
          routingDecision
        };
      }

      // Step 5: Map function to agent
      const targetAgent = mapFunctionToAgent(classificationResult.functionName);

      // Step 6: Create enriched context
      const justificacion = classificationResult.parameters?.justificacion_clinica as string | undefined;
      const { AGENT_DISPLAY_NAMES } = await import('./routing/intent-declarations');
      const agentName = AGENT_DISPLAY_NAMES[classificationResult.functionName] || 'especialista';
      const trimmedJustificacion = justificacion?.trim() || '';
      const transitionReason = trimmedJustificacion
        || `${agentName} seleccionado para procesar esta consulta`;

      const enrichedContext = createEnrichedContext(
        userInput,
        classificationResult.functionName,
        entityExtractionResult.entities,
        entityExtractionResult,
        optimizedContext,
        currentAgent,
        transitionReason,
        combinedConfidence,
        false
      );

      // Step 7: Log routing decision
      if (this.config.enableLogging) {
        this.logRoutingDecision(enrichedContext);
      }

      const routingDecision: RoutingDecision = {
        agent: targetAgent,
        confidence: combinedConfidence,
        reason: combinedConfidence >= 0.75
          ? RoutingReason.HIGH_CONFIDENCE_CLASSIFICATION
          : RoutingReason.NORMAL_CLASSIFICATION,
        metadata_factors: [
          `confidence_${(combinedConfidence * 100).toFixed(0)}pct`,
          `intent_${classificationResult.functionName}`,
          `entities_${entityExtractionResult.entities.length}`
        ],
        is_edge_case: false
      };

      return {
        success: true,
        targetAgent,
        enrichedContext,
        requiresUserClarification: false,
        routingDecision
      };

    } catch (error) {
      console.error('[IntentRouter] Error en enrutamiento:', error);
      return this.handleFallback(userInput, sessionContext, `Error: ${error}`);
    }
  }

  /**
   * Converts SDK Content[] to local Content[] type.
   */
  private convertToLocalContentType(sdkContent: import('@google/genai').Content[]): Content[] {
    return sdkContent.map(content => ({
      role: content.role || 'user',
      parts: (content.parts || []).map(part => ({
        text: part.text || ''
      }))
    }));
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
   * Handles fallback when classification fails.
   */
  private handleFallback(
    userInput: string,
    sessionContext: Content[],
    reason: string
  ) {
    if (this.config.enableLogging) {
      console.log(`[IntentRouter] Fallback activado: ${reason}`);
    }

    const fallbackResult = {
      entityExtractionResult: { entities: [], primaryEntities: [], secondaryEntities: [], confidence: 0, processingTime: 0 }
    };
    const entityExtractionResult = fallbackResult.entityExtractionResult;

    return {
      success: true,
      targetAgent: this.config.fallbackAgent,
      enrichedContext: createEnrichedContext(
        userInput,
        'fallback',
        [],
        entityExtractionResult,
        sessionContext,
        undefined,
        reason,
        0.5
      ),
      requiresUserClarification: false
    };
  }

  /**
   * Logs routing decisions for analysis.
   */
  private logRoutingDecision(context: EnrichedContext): void {
    if (!this.config.enableLogging) return;

    const entitySummary = {
      total: context.extractedEntities.length,
      primary: context.entityExtractionResult.primaryEntities.length,
      secondary: context.entityExtractionResult.secondaryEntities.length,
      averageConfidence: context.entityExtractionResult.confidence
    };

    const qualityMetrics = {
      confidenceLevel: categorizeConfidence(context.confidence),
      isHighPrecision: context.confidence >= 0.9,
      requiresMonitoring: context.confidence < 0.8,
      optimizationApplied: true
    };

    console.log('[IntentRouter] Decisión de enrutamiento optimizada:', {
      intent: context.detectedIntent,
      confidence: context.confidence,
      qualityMetrics,
      entitySummary,
      extractedEntities: context.extractedEntities.map(e => ({
        value: e.value,
        type: e.type,
        confidence: e.confidence
      })),
      transition: context.transitionReason,
      processingTime: context.entityExtractionResult.processingTime,
      timestamp: new Date().toISOString()
    });
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
