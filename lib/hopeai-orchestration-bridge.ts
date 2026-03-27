/**
 * Puente de Integración del Orquestador Dinámico con Aurora
 *
 * Sistema que integra el nuevo Orquestador Dinámico con la arquitectura
 * existente de Aurora, manteniendo compatibilidad hacia atrás mientras
 * introduce las nuevas capacidades de selección dinámica de herramientas.
 *
 * Responsabilidades:
 * - Adaptación de interfaces entre sistemas legacy y nuevos
 * - Gestión de transiciones graduales
 * - Mantenimiento de compatibilidad con agentes existentes
 * - Logging y monitoreo de la integración
 *
 * @author Aurora Development Team
 * @version 2.0.0
 */

import { Content, FunctionDeclaration } from '@google/genai';
import { DynamicOrchestrator, DynamicOrchestrationResult, SessionContext } from './dynamic-orchestrator';
import { HopeAISystem } from './hopeai-system';
import { ClinicalAgentRouter } from './clinical-agent-router';
import { ToolRegistry, ClinicalTool } from './tool-registry';

/**
 * Configuración del puente de integración
 */
interface OrchestrationBridgeConfig {
  enableDynamicOrchestration: boolean;
  fallbackToLegacy: boolean;
  enablePerformanceMonitoring: boolean;
  enableGradualMigration: boolean;
  migrationPercentage: number; // 0-100
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Resultado de la orquestación integrada
 */
interface IntegratedOrchestrationResult {
  success: boolean;
  orchestrationType: 'dynamic' | 'legacy' | 'hybrid';
  selectedAgent: string;
  availableTools: FunctionDeclaration[];
  sessionContext?: SessionContext;
  confidence: number;
  reasoning: string;
  performanceMetrics?: {
    orchestrationTime: number;
    toolSelectionTime: number;
    totalProcessingTime: number;
  };
  recommendations?: {
    suggestedFollowUp?: string;
    alternativeApproaches?: string[];
    clinicalConsiderations?: string[];
  };
}

/**
 * Métricas de rendimiento del puente
 */
interface BridgePerformanceMetrics {
  totalRequests: number;
  dynamicOrchestrationRequests: number;
  legacyRequests: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  toolSelectionAccuracy: number;
}

/**
 * Puente de Integración del Orquestador Dinámico
 *
 * Actúa como capa de abstracción entre el sistema Aurora existente
 * y el nuevo Orquestador Dinámico, permitiendo una migración gradual
 * y manteniendo compatibilidad con componentes legacy.
 */
export class HopeAIOrchestrationBridge {
  private dynamicOrchestrator: DynamicOrchestrator;
  private hopeAISystem: HopeAISystem;
  private agentRouter: ClinicalAgentRouter;
  private toolRegistry: ToolRegistry;
  private config: OrchestrationBridgeConfig;
  private performanceMetrics: BridgePerformanceMetrics;
  private requestCounter: number;

  constructor(
    hopeAISystem: HopeAISystem,
    agentRouter: ClinicalAgentRouter,
    config?: Partial<OrchestrationBridgeConfig>
  ) {
    this.hopeAISystem = hopeAISystem;
    this.agentRouter = agentRouter;
    this.dynamicOrchestrator = new DynamicOrchestrator(agentRouter);
    this.toolRegistry = ToolRegistry.getInstance();
    this.requestCounter = 0;
    
    this.config = {
      enableDynamicOrchestration: true,
      fallbackToLegacy: true,
      enablePerformanceMonitoring: true,
      enableGradualMigration: false, // Desactivar migración gradual
      migrationPercentage: 100, // 100% de requests usan orquestación dinámica
      logLevel: 'info',
      ...config
    };
    
    this.performanceMetrics = {
      totalRequests: 0,
      dynamicOrchestrationRequests: 0,
      legacyRequests: 0,
      averageResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      toolSelectionAccuracy: 0
    };

    this.log('info', 'Aurora Orchestration Bridge inicializado');
  }

  /**
   * Método principal de orquestación integrada
   * 
   * Decide si usar orquestación dinámica o legacy basado en la configuración
   * y el contexto de la solicitud.
   */
  async orchestrate(
    userInput: string,
    sessionId: string,
    userId: string,
    context?: {
      forceMode?: 'dynamic' | 'legacy';
      sessionHistory?: Content[];
      previousAgent?: string;
    }
  ): Promise<IntegratedOrchestrationResult> {
    const startTime = Date.now();
    this.requestCounter++;
    this.performanceMetrics.totalRequests++;
    
    try {
      this.log('debug', `Procesando solicitud ${this.requestCounter} para sesión ${sessionId}`);
      
      // Determinar tipo de orquestación a usar
      const orchestrationType = this.determineOrchestrationType(context?.forceMode);
      
      let result: IntegratedOrchestrationResult;
      
      switch (orchestrationType) {
        case 'dynamic':
          result = await this.handleDynamicOrchestration(userInput, sessionId, userId, context);
          this.performanceMetrics.dynamicOrchestrationRequests++;
          break;
          
        case 'legacy':
          result = await this.handleLegacyOrchestration(userInput, sessionId, userId, context);
          this.performanceMetrics.legacyRequests++;
          break;
          
        case 'hybrid':
          result = await this.handleHybridOrchestration(userInput, sessionId, userId, context);
          break;
          
        default:
          throw new Error(`Tipo de orquestación no soportado: ${orchestrationType}`);
      }
      
      // Calcular métricas de rendimiento
      if (this.config.enablePerformanceMonitoring) {
        const processingTime = Date.now() - startTime;
        result.performanceMetrics = {
          orchestrationTime: processingTime * 0.7, // Estimación
          toolSelectionTime: processingTime * 0.2,
          totalProcessingTime: processingTime
        };
        
        this.updatePerformanceMetrics(result, processingTime);
      }
      
      this.log('info', `Orquestación completada: ${result.orchestrationType} - ${result.selectedAgent}`);
      
      return result;
      
    } catch (error) {
      this.log('error', `Error en orquestación: ${error}`);
      this.performanceMetrics.errorRate++;
      
      return this.createErrorResult(userInput, sessionId, userId, error as Error);
    }
  }

  /**
   * Maneja orquestación dinámica usando el nuevo sistema
   */
  private async handleDynamicOrchestration(
    userInput: string,
    sessionId: string,
    userId: string,
    context?: any
  ): Promise<IntegratedOrchestrationResult> {
    try {
      const dynamicResult = await this.dynamicOrchestrator.orchestrate(
        userInput,
        sessionId,
        userId
      );
      
      return {
        success: dynamicResult.success,
        orchestrationType: 'dynamic',
        selectedAgent: dynamicResult.selectedAgent,
        availableTools: dynamicResult.contextualTools,
        sessionContext: dynamicResult.sessionContext,
        confidence: dynamicResult.confidence,
        reasoning: dynamicResult.reasoning,
        recommendations: dynamicResult.recommendations
      };
      
    } catch (error) {
      this.log('warn', `Error en orquestación dinámica, fallback a legacy: ${error}`);
      
      if (this.config.fallbackToLegacy) {
        return this.handleLegacyOrchestration(userInput, sessionId, userId, context);
      }
      
      throw error;
    }
  }

  /**
   * Maneja orquestación legacy usando el sistema existente
   */
  private async handleLegacyOrchestration(
    userInput: string,
    sessionId: string,
    userId: string,
    context?: any
  ): Promise<IntegratedOrchestrationResult> {
    try {
      // Usar el sistema HopeAI existente
      const sessionHistory = context?.sessionHistory || [];
      const previousAgent = context?.previousAgent;
      
      // Simular el comportamiento legacy con herramientas básicas
      const basicTools = this.toolRegistry.getBasicTools();
      const selectedAgent = this.determineAgentLegacy(userInput);
      
      return {
        success: true,
        orchestrationType: 'legacy',
        selectedAgent,
        availableTools: basicTools.map(tool => tool.declaration),
        confidence: 0.8,
        reasoning: 'Orquestación legacy basada en patrones predefinidos'
      };
      
    } catch (error) {
      this.log('error', `Error en orquestación legacy: ${error}`);
      throw error;
    }
  }

  /**
   * Maneja orquestación híbrida combinando ambos sistemas
   */
  private async handleHybridOrchestration(
    userInput: string,
    sessionId: string,
    userId: string,
    context?: any
  ): Promise<IntegratedOrchestrationResult> {
    try {
      // Intentar orquestación dinámica primero
      const dynamicResult = await this.handleDynamicOrchestration(
        userInput,
        sessionId,
        userId,
        context
      );
      
      // Si la confianza es baja, complementar con legacy
      if (dynamicResult.confidence < 0.7) {
        const legacyResult = await this.handleLegacyOrchestration(
          userInput,
          sessionId,
          userId,
          context
        );
        
        // Combinar resultados
        return {
          ...dynamicResult,
          orchestrationType: 'hybrid',
          availableTools: [
            ...dynamicResult.availableTools,
            ...legacyResult.availableTools.filter(tool => 
              !dynamicResult.availableTools.some(dt => dt.name === tool.name)
            )
          ].slice(0, 8), // Limitar herramientas
          confidence: Math.max(dynamicResult.confidence, legacyResult.confidence),
          reasoning: `Híbrido: ${dynamicResult.reasoning} + Legacy backup`
        };
      }
      
      return {
        ...dynamicResult,
        orchestrationType: 'hybrid'
      };
      
    } catch (error) {
      this.log('error', `Error en orquestación híbrida: ${error}`);
      throw error;
    }
  }

  /**
   * Determina el tipo de orquestación a usar
   */
  private determineOrchestrationType(
    forceMode?: 'dynamic' | 'legacy'
  ): 'dynamic' | 'legacy' | 'hybrid' {
    if (forceMode) {
      return forceMode;
    }
    
    if (!this.config.enableDynamicOrchestration) {
      return 'legacy';
    }
    
    if (this.config.enableGradualMigration) {
      const random = Math.random() * 100;
      if (random < this.config.migrationPercentage) {
        return 'dynamic';
      } else {
        return 'legacy';
      }
    }
    
    return 'dynamic';
  }

  /**
   * Determina agente usando lógica legacy
   */
  private determineAgentLegacy(userInput: string): string {
    const input = userInput.toLowerCase();
    
    if (input.includes('resumen') || input.includes('documentar') || input.includes('nota')) {
      return 'clinico';
    }
    
    if (input.includes('investigar') || input.includes('estudio') || input.includes('evidencia')) {
      return 'academico';
    }
    
    return 'socratico'; // Default
  }

  /**
   * Actualiza métricas de rendimiento
   */
  private updatePerformanceMetrics(
    result: IntegratedOrchestrationResult,
    processingTime: number
  ): void {
    // Actualizar tiempo promedio de respuesta
    this.performanceMetrics.averageResponseTime = 
      (this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1) + processingTime) / 
      this.performanceMetrics.totalRequests;
    
    // Actualizar tasa de éxito
    if (result.success) {
      this.performanceMetrics.successRate = 
        (this.performanceMetrics.successRate * (this.performanceMetrics.totalRequests - 1) + 1) / 
        this.performanceMetrics.totalRequests;
    }
    
    // Actualizar precisión de selección de herramientas (simplificado)
    if (result.confidence > 0.8) {
      this.performanceMetrics.toolSelectionAccuracy = 
        (this.performanceMetrics.toolSelectionAccuracy * (this.performanceMetrics.totalRequests - 1) + 1) / 
        this.performanceMetrics.totalRequests;
    }
  }

  /**
   * Crea resultado de error
   */
  private createErrorResult(
    userInput: string,
    sessionId: string,
    userId: string,
    error: Error
  ): IntegratedOrchestrationResult {
    const basicTools = this.toolRegistry.getBasicTools();
    
    return {
      success: false,
      orchestrationType: 'legacy',
      selectedAgent: 'socratico',
      availableTools: basicTools.map(tool => tool.declaration),
      confidence: 0.3,
      reasoning: `Error en orquestación: ${error.message}`,
      recommendations: {
        suggestedFollowUp: "Intenta reformular tu consulta",
        alternativeApproaches: ["Usa términos más específicos"],
        clinicalConsiderations: ["Verifica la conectividad del sistema"]
      }
    };
  }

  /**
   * Obtiene métricas de rendimiento del puente
   */
  public getPerformanceMetrics(): BridgePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Obtiene estadísticas del sistema
   */
  public getSystemStats(): {
    bridgeMetrics: BridgePerformanceMetrics;
    orchestratorStats: any;
    toolRegistryStats: any;
  } {
    return {
      bridgeMetrics: this.getPerformanceMetrics(),
      orchestratorStats: this.dynamicOrchestrator.getStats(),
        toolRegistryStats: this.toolRegistry.getRegistryStats()
    };
  }

  /**
   * Actualiza configuración del puente
   */
  public updateConfig(newConfig: Partial<OrchestrationBridgeConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.log('info', 'Configuración del puente actualizada');
  }

  /**
   * Limpia recursos y sesiones expiradas
   */
  public cleanup(): void {
    this.dynamicOrchestrator.cleanupExpiredSessions();
    this.log('debug', 'Limpieza de recursos completada');
  }

  /**
   * Reinicia métricas de rendimiento
   */
  public resetMetrics(): void {
    this.performanceMetrics = {
      totalRequests: 0,
      dynamicOrchestrationRequests: 0,
      legacyRequests: 0,
      averageResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      toolSelectionAccuracy: 0
    };
    
    this.requestCounter = 0;
    this.log('info', 'Métricas de rendimiento reiniciadas');
  }

  /**
   * Logging interno
   */
  private log(level: OrchestrationBridgeConfig['logLevel'], message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= configLevel) {
      console.log(`[OrchestrationBridge:${level.toUpperCase()}] ${message}`);
    }
  }
}

/**
 * Factory function para crear el puente de orquestación
 */
export function createOrchestrationBridge(
  hopeAISystem: HopeAISystem,
  agentRouter: ClinicalAgentRouter,
  config?: Partial<OrchestrationBridgeConfig>
): HopeAIOrchestrationBridge {
  return new HopeAIOrchestrationBridge(hopeAISystem, agentRouter, config);
}

/**
 * Tipos exportados
 */
export type {
  OrchestrationBridgeConfig,
  IntegratedOrchestrationResult,
  BridgePerformanceMetrics
};