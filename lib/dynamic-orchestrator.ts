/**
 * Orquestador Dinámico de HopeAI
 * 
 * Sistema central que coordina la selección inteligente de agentes y herramientas
 * basado en el contexto de la conversación y las necesidades del psicólogo.
 * 
 * Arquitectura:
 * - Análisis contextual de la consulta
 * - Selección dinámica de herramientas especializadas
 * - Enrutamiento inteligente a agentes especializados
 * - Gestión de contexto entre transiciones
 * 
 * @author HopeAI Development Team
 * @version 2.0.0
 */
 
import { FunctionDeclaration } from '@google/genai';
import { IntelligentIntentRouter, OrchestrationResult } from './intelligent-intent-router';
import { ClinicalAgentRouter } from './clinical-agent-router';
import { ToolRegistry, ClinicalTool } from './tool-registry';
import { createLogger } from '@/lib/logger';
import { SentryMetricsTracker } from './sentry-metrics-tracker';
import type { ClinicalFile } from '@/types/clinical-types';

/**
 * Tipo para el contenido de conversación
 */
interface Content {
  role: string;
  parts: Array<{ text: string }>;
}

/**
 * Contexto de sesión para el orquestador
 */
interface SessionContext {
  sessionId: string;
  userId: string;
  conversationHistory: Content[];
  currentAgent?: string;
  activeTools: FunctionDeclaration[];
  sessionMetadata: {
    startTime: Date;
    totalInteractions: number;
    dominantTopics: string[];
    clinicalFocus?: string;
  };
}

/**
 * Resultado de la orquestación dinámica
 */
interface DynamicOrchestrationResult {
  success: boolean;
  selectedAgent: string;
  contextualTools: FunctionDeclaration[];
  toolMetadata: ClinicalTool[];
  sessionContext: SessionContext;
  confidence: number;
  reasoning: string;
}

/**
 * Configuración del orquestador dinámico
 */
interface DynamicOrchestratorConfig {
  enableAdaptiveLearning: boolean;
  maxToolsPerSession: number;
  confidenceThreshold: number;
  sessionTimeoutMinutes: number;
  toolContinuityThreshold?: number;
  dominantTopicsUpdateInterval?: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Orquestador Dinámico Principal
 * 
 * Coordina la selección inteligente de agentes y herramientas basada en:
 * - Análisis semántico de la consulta
 * - Contexto histórico de la sesión
 * - Patrones de uso del psicólogo
 * - Especialización clínica requerida
 */
const logger = createLogger('orchestration');

export class DynamicOrchestrator {
  private intentRouter: IntelligentIntentRouter;
  private agentRouter: ClinicalAgentRouter;
  private toolRegistry: ToolRegistry;
  private metricsTracker: SentryMetricsTracker;
  private activeSessions: Map<string, SessionContext> = new Map();
  private config: DynamicOrchestratorConfig;

  constructor(
    agentRouter: ClinicalAgentRouter,
    config?: Partial<DynamicOrchestratorConfig>
  ) {
    this.agentRouter = agentRouter;
    this.intentRouter = new IntelligentIntentRouter(agentRouter);
    this.toolRegistry = ToolRegistry.getInstance();
    this.metricsTracker = SentryMetricsTracker.getInstance();
    this.activeSessions = new Map();

    this.config = {
      enableAdaptiveLearning: false,
      maxToolsPerSession: 8,
      confidenceThreshold: 0.75,
      sessionTimeoutMinutes: 60,
      toolContinuityThreshold: 3,
      dominantTopicsUpdateInterval: 5,
      logLevel: 'info',
      ...config
    };
  }

  /**
   * Método principal de orquestación dinámica
   * 
   * Analiza la consulta del usuario y orquesta la respuesta óptima
   * seleccionando el agente y herramientas más apropiados.
   */
  async orchestrate(
    userInput: string,
    sessionId: string,
    userId: string,
    sessionFiles?: ClinicalFile[],
    onBulletUpdate?: (bullet: any) => void,
    externalConversationHistory?: Content[],
    patientId?: string,
    patientSummary?: string,
    sessionType?: string
  ): Promise<DynamicOrchestrationResult> {
    const startTime = Date.now();
    
    try {
      this.log('info', `Iniciando orquestación para sesión ${sessionId}`);
      
      // El tracking de mensajes se maneja en el API layer para evitar duplicados
      // Solo registramos la actividad del orquestador internamente
      
      // 1. Obtener o crear contexto de sesión
      const sessionContext = await this.getOrCreateSession(sessionId, userId);
      
      // 2. Actualizar historial de conversación con archivos adjuntos (usuario)
      this.updateConversationHistory(sessionContext, userInput, sessionFiles);
      
      // 3. Realizar orquestación inteligente PRIMERO para obtener el agente correcto
      const orchestrationResult = await this.intentRouter.orchestrateWithTools(
        userInput,
        sessionContext.conversationHistory,
        sessionContext.currentAgent
      );

      // 4. Optimizar selección de herramientas
      const optimizedTools = await this.optimizeToolSelection(
        orchestrationResult.contextualTools,
        sessionContext
      );
      
      // 5. Actualizar contexto de sesión
      this.updateSessionContext(
        sessionContext,
        orchestrationResult.selectedAgent,
        optimizedTools
      );
      

      // Registrar cambio de agente si es diferente al anterior
      if (sessionContext.currentAgent && sessionContext.currentAgent !== orchestrationResult.selectedAgent) {
        this.metricsTracker.trackAgentSwitch({
          userId,
          sessionId,
          fromAgent: sessionContext.currentAgent as any,
          toAgent: orchestrationResult.selectedAgent as any,
          switchType: 'automatic',
          confidence: orchestrationResult.confidence
        });
      }
      
      // El tiempo de respuesta del orquestador se registra en el API layer
      // para mantener consistencia en las métricas
      
      const result: DynamicOrchestrationResult = {
        success: true,
        selectedAgent: orchestrationResult.selectedAgent,
        contextualTools: optimizedTools,
        toolMetadata: orchestrationResult.toolMetadata,
        sessionContext,
        confidence: orchestrationResult.confidence,
        reasoning: orchestrationResult.reasoning
      };

      this.log('info', `Orquestación completada: ${orchestrationResult.selectedAgent} con ${optimizedTools.length} herramientas`);
      
      return result;
      
    } catch (error) {
      this.log('error', `Error en orquestación: ${error}`);
      return this.createErrorResult(sessionId, userId, error as Error);
    }
  }


  /**
   * Obtiene o crea una nueva sesión
   */
  private async getOrCreateSession(sessionId: string, userId: string): Promise<SessionContext> {
    let session = this.activeSessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId,
        conversationHistory: [],
        activeTools: [],
        sessionMetadata: {
          startTime: new Date(),
          totalInteractions: 0,
          dominantTopics: []
        }
      };
      
      this.activeSessions.set(sessionId, session);
      this.log('debug', `Nueva sesión creada: ${sessionId}`);
    }
    
    return session;
  }

  /**
   * Actualiza el historial de conversación
   */
  private updateConversationHistory(session: SessionContext, userInput: string, sessionFiles?: ClinicalFile[]): void {
    // ARCHITECTURAL FIX: Enrich user input with file attachment context for orchestration
    let enrichedUserInput = userInput;
    
    if (sessionFiles && sessionFiles.length > 0) {
      const fileNames = sessionFiles.map(f => f.name).join(', ');
      enrichedUserInput = `${userInput}

**CONTEXTO PARA ORQUESTACIÓN:** El usuario ha adjuntado ${sessionFiles.length} archivo(s): ${fileNames}. Esta información debe considerarse al seleccionar el agente y herramientas apropiados.`;
      
      logger.info(`Context enriched with ${sessionFiles.length} files: ${fileNames}`);
    }
    
    session.conversationHistory.push({
      role: 'user',
      parts: [{ text: enrichedUserInput }]
    });
    
    session.sessionMetadata.totalInteractions++;
    
    // Mantener solo los últimos 20 intercambios para eficiencia
    if (session.conversationHistory.length > 40) {
      session.conversationHistory = session.conversationHistory.slice(-40);
    }
  }

  /**
   * Optimiza la selección de herramientas basada en el contexto de sesión
   */
  private async optimizeToolSelection(
    tools: FunctionDeclaration[],
    session: SessionContext
  ): Promise<FunctionDeclaration[]> {
    // Limitar número de herramientas según configuración
    let optimizedTools = tools.slice(0, this.config.maxToolsPerSession);
    
    // Si hay herramientas activas, priorizar continuidad
    if (session.activeTools.length > 0) {
      const continuityTools = session.activeTools.filter(activeTool =>
        tools.some(newTool => newTool.name === activeTool.name)
      );
      
      // Combinar herramientas de continuidad con nuevas
      const newTools = tools.filter(tool =>
        !session.activeTools.some(activeTool => activeTool.name === tool.name)
      );
      
      optimizedTools = [...continuityTools, ...newTools].slice(0, this.config.maxToolsPerSession);
    }
    
    return optimizedTools;
  }

  /**
   * Actualiza el contexto de sesión después de la orquestación
   */
  private updateSessionContext(
    session: SessionContext,
    selectedAgent: string,
    tools: FunctionDeclaration[]
  ): void {
    session.currentAgent = selectedAgent;
    session.activeTools = tools;

    // Actualizar tópicos dominantes
    this.updateDominantTopics(session);
  }

  /**
   * R1: Keyword-frequency dominant topics (replaces LLM call).
   * Runs every N interactions, extracts top words from recent messages.
   */
  private updateDominantTopics(session: SessionContext): void {
    if (session.conversationHistory.length < 2) return;

    const shouldUpdate = session.sessionMetadata.totalInteractions % (this.config.dominantTopicsUpdateInterval || 5) === 0;
    if (!shouldUpdate) {
      this.log('debug', `Skipping dominant topics update (interval: ${this.config.dominantTopicsUpdateInterval})`);
      return;
    }

    const STOP_WORDS = new Set([
      'sobre', 'tiene', 'cuando', 'desde', 'entre', 'puede', 'porque',
      'como', 'para', 'donde', 'hasta', 'después', 'también', 'usuario',
      'asistente', 'sistema', 'mensaje', 'contexto', 'quiero', 'necesito',
      'puedes', 'ayuda', 'favor', 'gracias', 'hola', 'bueno', 'manera'
    ]);

    const recentMessages = session.conversationHistory.slice(-6);
    const text = recentMessages
      .map(msg => msg.parts?.map(part => 'text' in part ? part.text : '').join(' '))
      .join(' ')
      .toLowerCase();

    const wordFreq = new Map<string, number>();
    text.split(/\s+/)
      .filter(w => w.length > 5 && !STOP_WORDS.has(w))
      .forEach(w => wordFreq.set(w, (wordFreq.get(w) || 0) + 1));

    const topics = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    session.sessionMetadata.dominantTopics = Array.from(new Set([
      ...topics,
      ...session.sessionMetadata.dominantTopics
    ])).slice(0, 10);

    this.log('debug', `Updated dominant topics: ${topics.length} new topics identified`);
  }

  /**
   * Crea resultado de error
   */
  private createErrorResult(
    sessionId: string,
    userId: string,
    error: Error
  ): DynamicOrchestrationResult {
    const fallbackSession: SessionContext = {
      sessionId,
      userId,
      conversationHistory: [],
      activeTools: [],
      sessionMetadata: {
        startTime: new Date(),
        totalInteractions: 0,
        dominantTopics: []
      }
    };
    
    const basicTools = this.toolRegistry.getBasicTools();
    
    return {
      success: false,
      selectedAgent: 'socratico',
      contextualTools: basicTools.map(tool => tool.declaration),
      toolMetadata: basicTools,
      sessionContext: fallbackSession,
      confidence: 0.3,
      reasoning: `Error en orquestación: ${error.message}`
    };
  }

  /**
   * Logging interno
   */
  private log(level: DynamicOrchestratorConfig['logLevel'], message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= configLevel) {
      logger[level](message);
    }
  }
}

/**
 * Factory function para crear el orquestador dinámico
 */
export function createDynamicOrchestrator(
  agentRouter: ClinicalAgentRouter,
  config?: Partial<DynamicOrchestratorConfig>
): DynamicOrchestrator {
  return new DynamicOrchestrator(agentRouter, config);
}

/**
 * Tipos exportados
 */
export type {
  SessionContext,
  DynamicOrchestrationResult,
  DynamicOrchestratorConfig
};