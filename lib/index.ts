/**
 * Punto de Entrada Principal del Orquestador Dinámico de HopeAI
 * 
 * Este archivo actúa como el punto de integración central para todos los
 * componentes del sistema de orquestación dinámica, proporcionando una
 * interfaz unificada y simplificada para el uso del sistema.
 * 
 * Arquitectura Integrada:
 * - Tool Registry: Gestión centralizada de herramientas clínicas
 * - Intelligent Intent Router: Enrutamiento semántico avanzado
 * - Dynamic Orchestrator: Orquestación inteligente de agentes y herramientas
 * - Orchestration Bridge: Integración con sistema legacy
 * - Monitoring System: Métricas y análisis en tiempo real
 * 
 * @author HopeAI Development Team
 * @version 2.0.0
 */

// Exportaciones principales del sistema
export { ToolRegistry, type ClinicalTool, type ToolCategory, type ClinicalDomain } from './tool-registry';
export { 
  IntelligentIntentRouter, 
  type EnrichedContext, 
  type IntentClassificationResult, 
  type RouterConfig,
  type OrchestrationResult
} from './intelligent-intent-router';
export { 
  DynamicOrchestrator, 
  type SessionContext, 
  type DynamicOrchestrationResult, 
  type DynamicOrchestratorConfig 
} from './dynamic-orchestrator';
export { 
  HopeAIOrchestrationBridge, 
  type OrchestrationBridgeConfig, 
  type IntegratedOrchestrationResult, 
  type BridgePerformanceMetrics 
} from './hopeai-orchestration-bridge';
export { 
  OrchestratorMonitoring, 
  type OrchestratorMetrics, 
  type OrchestrationEvent, 
  type SystemAlert, 
  type MonitoringConfig, 
  type ClinicalAnalysisReport 
} from './orchestrator-monitoring';

// Importaciones para la clase principal
import { HopeAISystem } from './hopeai-system';
import { ClinicalAgentRouter } from './clinical-agent-router';
import { HopeAIOrchestrationBridge, OrchestrationBridgeConfig } from './hopeai-orchestration-bridge';
import { OrchestratorMonitoring, MonitoringConfig, OrchestratorMetrics } from './orchestrator-monitoring';
import { ToolRegistry } from './tool-registry';
import { Content } from '@google/genai';

/**
 * Configuración completa del sistema de orquestación
 */
export interface HopeAIOrchestrationSystemConfig {
  // Configuración del puente de orquestación
  bridge?: Partial<OrchestrationBridgeConfig>;
  
  // Configuración del sistema de monitoreo
  monitoring?: Partial<MonitoringConfig>;
  
  // Configuración general del sistema
  system?: {
    enableAutoCleanup?: boolean;
    cleanupIntervalMinutes?: number;
    enableHealthChecks?: boolean;
    healthCheckIntervalMinutes?: number;
  };
}

/**
 * Estado de salud del sistema
 */
export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    toolRegistry: 'healthy' | 'degraded' | 'unhealthy';
    orchestrationBridge: 'healthy' | 'degraded' | 'unhealthy';
    monitoring: 'healthy' | 'degraded' | 'unhealthy';
  };
  metrics: {
    uptime: number;
    totalOrchestrations: number;
    currentSessions: number;
    averageResponseTime: number;
    errorRate: number;
  };
  alerts: {
    critical: number;
    warnings: number;
  };
  lastHealthCheck: Date;
}

/**
 * Sistema Principal de Orquestación de HopeAI
 * 
 * Clase principal que integra todos los componentes del sistema de
 * orquestación dinámica, proporcionando una interfaz unificada y
 * gestión centralizada de recursos.
 */
export class HopeAIOrchestrationSystem {
  private hopeAISystem: HopeAISystem;
  private agentRouter: ClinicalAgentRouter;
  private orchestrationBridge!: HopeAIOrchestrationBridge;
  private monitoring!: OrchestratorMonitoring;
  private toolRegistry!: ToolRegistry;
  private config: HopeAIOrchestrationSystemConfig;
  private startTime: Date;
  private cleanupInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isInitialized: boolean;

  constructor(
    hopeAISystem: HopeAISystem,
    agentRouter: ClinicalAgentRouter,
    config?: HopeAIOrchestrationSystemConfig
  ) {
    this.hopeAISystem = hopeAISystem;
    this.agentRouter = agentRouter;
    this.startTime = new Date();
    this.isInitialized = false;
    
    this.config = {
      bridge: {
        enableDynamicOrchestration: true,
        fallbackToLegacy: true,
        enablePerformanceMonitoring: true,
        migrationPercentage: 80,
        logLevel: 'info'
      },
      monitoring: {
        enableRealTimeMetrics: true,
        enableEventLogging: true,
        enableAnomalyDetection: true,
        enablePerformanceAlerts: true,
        logLevel: 'info'
      },
      system: {
        enableAutoCleanup: true,
        cleanupIntervalMinutes: 60,
        enableHealthChecks: true,
        healthCheckIntervalMinutes: 15
      },
      ...config
    };
    
    this.initializeComponents();
  }

  /**
   * Inicializa el sistema de orquestación
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Inicializar el sistema HopeAI subyacente
      await this.hopeAISystem.initialize();
      
      // Inicializar componentes del orquestador
      this.initializeComponents();
      
      this.log('info', 'Sistema de orquestación HopeAI inicializado correctamente');
    } catch (error) {
      this.log('error', `Error inicializando sistema: ${error}`);
      throw error;
    }
  }

  /**
   * Inicializa todos los componentes del sistema
   */
  private initializeComponents(): void {
    try {
      // Inicializar Tool Registry
      this.toolRegistry = ToolRegistry.getInstance();
      
      // Inicializar sistema de monitoreo
      this.monitoring = new OrchestratorMonitoring(this.config.monitoring);
      
      // Inicializar puente de orquestación
      this.orchestrationBridge = new HopeAIOrchestrationBridge(
        this.hopeAISystem,
        this.agentRouter,
        this.config.bridge
      );
      
      // Configurar intervalos de mantenimiento
      this.setupMaintenanceIntervals();
      
      this.isInitialized = true;
      this.log('info', 'Sistema de orquestación HopeAI inicializado correctamente');
      
    } catch (error) {
      this.log('error', `Error inicializando sistema: ${error}`);
      throw error;
    }
  }

  /**
   * Configura intervalos de mantenimiento automático
   */
  private setupMaintenanceIntervals(): void {
    if (this.config.system?.enableAutoCleanup) {
      const cleanupInterval = (this.config.system.cleanupIntervalMinutes || 60) * 60 * 1000;
      this.cleanupInterval = setInterval(() => {
        this.performCleanup();
      }, cleanupInterval);
    }
    
    if (this.config.system?.enableHealthChecks) {
      const healthCheckInterval = (this.config.system.healthCheckIntervalMinutes || 15) * 60 * 1000;
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, healthCheckInterval);
    }
  }

  /**
   * Método principal de orquestación
   * 
   * Punto de entrada unificado para todas las solicitudes de orquestación.
   */
  async orchestrate(
    userInput: string,
    sessionId: string,
    userId: string,
    options?: {
      forceMode?: 'dynamic' | 'legacy';
      sessionHistory?: Content[];
      previousAgent?: string;
      enableMonitoring?: boolean;
    }
  ) {
    if (!this.isInitialized) {
      throw new Error('Sistema no inicializado. Llama a initialize() primero.');
    }
    
    const startTime = Date.now();
    
    try {
      this.log('debug', `Procesando orquestación para sesión ${sessionId}`);
      
      // Realizar orquestación a través del puente
      const result = await this.orchestrationBridge.orchestrate(
        userInput,
        sessionId,
        userId,
        {
          forceMode: options?.forceMode,
          sessionHistory: options?.sessionHistory,
          previousAgent: options?.previousAgent
        }
      );
      
      // Registrar evento en el sistema de monitoreo
      if (options?.enableMonitoring !== false) {
        const responseTime = Date.now() - startTime;
        this.monitoring.recordOrchestrationEvent(
          result,
          userInput,
          sessionId,
          userId,
          responseTime
        );
      }
      
      this.log('info', `Orquestación completada: ${result.selectedAgent} (${result.orchestrationType})`);
      
      return result;
      
    } catch (error) {
      this.log('error', `Error en orquestación: ${error}`);
      throw error;
    }
  }

  /**
   * Obtiene el estado de salud del sistema
   */
  public getHealthStatus(): SystemHealthStatus {
    const metrics = this.monitoring.getMetrics();
    const bridgeMetrics = this.orchestrationBridge.getPerformanceMetrics();
    const activeAlerts = this.monitoring.getActiveAlerts();
    
    // Evaluar salud de componentes
    const toolRegistryHealth = this.evaluateToolRegistryHealth();
    const bridgeHealth = this.evaluateBridgeHealth(bridgeMetrics);
    const monitoringHealth = this.evaluateMonitoringHealth(metrics);
    
    // Determinar salud general
    const componentHealths = [toolRegistryHealth, bridgeHealth, monitoringHealth];
    const overall = componentHealths.includes('unhealthy') ? 'unhealthy' :
                    componentHealths.includes('degraded') ? 'degraded' : 'healthy';
    
    return {
      overall,
      components: {
        toolRegistry: toolRegistryHealth,
        orchestrationBridge: bridgeHealth,
        monitoring: monitoringHealth
      },
      metrics: {
        uptime: Date.now() - this.startTime.getTime(),
        totalOrchestrations: metrics.totalOrchestrations,
        currentSessions: bridgeMetrics.totalRequests, // Aproximación
        averageResponseTime: metrics.averageResponseTime,
        errorRate: metrics.failedOrchestrations / Math.max(metrics.totalOrchestrations, 1)
      },
      alerts: {
        critical: activeAlerts.filter(a => a.level === 'critical').length,
        warnings: activeAlerts.filter(a => a.level === 'warning').length
      },
      lastHealthCheck: new Date()
    };
  }

  /**
   * Evalúa la salud del Tool Registry
   */
  private evaluateToolRegistryHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    try {
      const stats = this.toolRegistry.getRegistryStats();
      
      if (stats.totalTools === 0) {
        return 'unhealthy';
      }
      
      if (stats.totalTools < 5) {
        return 'degraded';
      }
      
      return 'healthy';
      
    } catch (error) {
      return 'unhealthy';
    }
  }

  /**
   * Evalúa la salud del puente de orquestación
   */
  private evaluateBridgeHealth(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
    if (metrics.errorRate > 0.2) {
      return 'unhealthy';
    }
    
    if (metrics.errorRate > 0.1 || metrics.averageResponseTime > 5000) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Evalúa la salud del sistema de monitoreo
   */
  private evaluateMonitoringHealth(metrics: OrchestratorMetrics): 'healthy' | 'degraded' | 'unhealthy' {
    const activeAlerts = this.monitoring.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.level === 'critical').length;
    
    if (criticalAlerts > 0) {
      return 'unhealthy';
    }
    
    if (activeAlerts.length > 10) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Genera reporte de análisis clínico
   */
  public generateClinicalReport(
    startDate?: Date,
    endDate?: Date
  ) {
    return this.monitoring.generateClinicalAnalysisReport(startDate, endDate);
  }

  /**
   * Obtiene métricas completas del sistema
   */
  public getSystemMetrics() {
    return {
      orchestrator: this.monitoring.getMetrics(),
      bridge: this.orchestrationBridge.getPerformanceMetrics(),
      toolRegistry: this.toolRegistry.getRegistryStats(),
      system: {
        uptime: Date.now() - this.startTime.getTime(),
        initialized: this.isInitialized,
        startTime: this.startTime
      }
    };
  }

  /**
   * Obtiene alertas activas
   */
  public getActiveAlerts() {
    return this.monitoring.getActiveAlerts();
  }

  /**
   * Resuelve una alerta específica
   */
  public resolveAlert(alertId: string): boolean {
    return this.monitoring.resolveAlert(alertId);
  }

  /**
   * Actualiza configuración del sistema
   */
  public updateConfig(newConfig: Partial<HopeAIOrchestrationSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Actualizar configuraciones de componentes
    if (newConfig.bridge) {
      this.orchestrationBridge.updateConfig(newConfig.bridge);
    }
    
    this.log('info', 'Configuración del sistema actualizada');
  }

  /**
   * Realiza limpieza automática del sistema
   */
  private performCleanup(): void {
    try {
      this.monitoring.cleanup();
      this.orchestrationBridge.cleanup();
      this.log('debug', 'Limpieza automática completada');
    } catch (error) {
      this.log('error', `Error en limpieza automática: ${error}`);
    }
  }

  /**
   * Realiza verificación de salud automática
   */
  private performHealthCheck(): void {
    try {
      const health = this.getHealthStatus();
      
      if (health.overall === 'unhealthy') {
        this.log('error', 'Sistema en estado no saludable');
      } else if (health.overall === 'degraded') {
        this.log('warn', 'Sistema en estado degradado');
      }
      
      this.log('debug', `Verificación de salud: ${health.overall}`);
    } catch (error) {
      this.log('error', `Error en verificación de salud: ${error}`);
    }
  }

  /**
   * Reinicia métricas del sistema
   */
  public resetMetrics(): void {
    this.monitoring.resetMetrics();
    this.orchestrationBridge.resetMetrics();
    this.log('info', 'Métricas del sistema reiniciadas');
  }

  /**
   * Cierra el sistema y libera recursos
   */
  public shutdown(): void {
    try {
      // Limpiar intervalos
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      
      // Realizar limpieza final
      this.performCleanup();
      
      this.isInitialized = false;
      this.log('info', 'Sistema de orquestación cerrado correctamente');
      
    } catch (error) {
      this.log('error', `Error cerrando sistema: ${error}`);
    }
  }

  /**
   * Logging interno
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const logLevel = this.config.bridge?.logLevel || 'info';
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    
    if (levels[level] >= levels[logLevel]) {
      console.log(`[HopeAIOrchestrationSystem:${level.toUpperCase()}] ${message}`);
    }
  }
}

/**
 * Factory function para crear el sistema completo de orquestación
 */
export function createHopeAIOrchestrationSystem(
  hopeAISystem: HopeAISystem,
  agentRouter: ClinicalAgentRouter,
  config?: HopeAIOrchestrationSystemConfig
): HopeAIOrchestrationSystem {
  return new HopeAIOrchestrationSystem(hopeAISystem, agentRouter, config);
}

/**
 * Función de utilidad para inicialización rápida con configuración por defecto
 */
export function createDefaultOrchestrationSystem(
  hopeAISystem: HopeAISystem,
  agentRouter: ClinicalAgentRouter
): HopeAIOrchestrationSystem {
  return new HopeAIOrchestrationSystem(hopeAISystem, agentRouter, {
    bridge: {
      enableDynamicOrchestration: true,
      migrationPercentage: 100, // 100% orquestación dinámica
      enablePerformanceMonitoring: true
    },
    monitoring: {
      enableRealTimeMetrics: true,
      enableAnomalyDetection: true,
      enablePerformanceAlerts: true
    },
    system: {
      enableAutoCleanup: true,
      enableHealthChecks: true
    }
  });
}

// Los tipos ya están exportados arriba en las interfaces