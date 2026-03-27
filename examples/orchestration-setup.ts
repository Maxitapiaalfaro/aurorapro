/**
 * Ejemplo de Configuración del Sistema de Orquestación Dinámico de HopeAI
 * 
 * Este archivo demuestra cómo configurar e inicializar el sistema completo
 * de orquestación dinámica, incluyendo todos los componentes principales.
 * 
 * @author HopeAI Development Team
 * @version 2.0.0
 */

import { 
  HopeAIOrchestrationSystem,
  createHopeAIOrchestrationSystem,
  createDefaultOrchestrationSystem,
  type HopeAIOrchestrationSystemConfig,
  type SystemHealthStatus
} from '../lib/index';
import { HopeAISystem } from '../lib/hopeai-system';
import { ClinicalAgentRouter } from '../lib/clinical-agent-router';
import { Content } from '@google/genai';

/**
 * Configuración de ejemplo para entorno de desarrollo
 */
const developmentConfig: HopeAIOrchestrationSystemConfig = {
  bridge: {
    enableDynamicOrchestration: true,
    fallbackToLegacy: true,
    enablePerformanceMonitoring: true,
    migrationPercentage: 50, // 50% dinámico, 50% legacy para testing
    logLevel: 'debug'
  },
  monitoring: {
    enableRealTimeMetrics: true,
    enableEventLogging: true,
    enableAnomalyDetection: true,
    enablePerformanceAlerts: true,
    logLevel: 'debug',
    metricsRetentionDays: 7 // Retener datos por 7 días en desarrollo
  },
  system: {
    enableAutoCleanup: true,
    cleanupIntervalMinutes: 30, // Limpieza más frecuente en desarrollo
    enableHealthChecks: true,
    healthCheckIntervalMinutes: 5 // Verificaciones más frecuentes
  }
};

/**
 * Configuración de ejemplo para entorno de producción
 */
const productionConfig: HopeAIOrchestrationSystemConfig = {
  bridge: {
    enableDynamicOrchestration: true,
    fallbackToLegacy: true,
    enablePerformanceMonitoring: true,
    migrationPercentage: 90, // 90% dinámico en producción
    logLevel: 'info'
  },
  monitoring: {
    enableRealTimeMetrics: true,
    enableEventLogging: true,
    enableAnomalyDetection: true,
    enablePerformanceAlerts: true,
    logLevel: 'info',
    metricsRetentionDays: 30 // Retener datos por 30 días en producción
  },
  system: {
    enableAutoCleanup: true,
    cleanupIntervalMinutes: 120, // Limpieza cada 2 horas
    enableHealthChecks: true,
    healthCheckIntervalMinutes: 15
  }
};

/**
 * Clase de ejemplo que demuestra el uso del sistema de orquestación
 */
export class OrchestrationExample {
  private orchestrationSystem: HopeAIOrchestrationSystem;
  private hopeAISystem: HopeAISystem;
  private agentRouter: ClinicalAgentRouter;

  constructor(environment: 'development' | 'production' = 'development') {
    // Inicializar componentes base (estos serían tus implementaciones reales)
    this.hopeAISystem = new HopeAISystem();
    this.agentRouter = new ClinicalAgentRouter();
    
    // Seleccionar configuración según el entorno
    const config = environment === 'production' ? productionConfig : developmentConfig;
    
    // Crear sistema de orquestación
    this.orchestrationSystem = createHopeAIOrchestrationSystem(
      this.hopeAISystem,
      this.agentRouter,
      config
    );
    
    console.log(`Sistema de orquestación inicializado para entorno: ${environment}`);
  }

  /**
   * Ejemplo de uso básico del sistema de orquestación
   */
  async basicOrchestrationExample(): Promise<void> {
    console.log('\n=== Ejemplo de Orquestación Básica ===');
    
    try {
      // Simular una consulta de usuario
      const userInput = "Necesito ayuda con un paciente que presenta síntomas de TEPT después de un accidente automovilístico";
      const sessionId = "session_123";
      const userId = "psychologist_456";
      
      console.log(`Usuario: ${userInput}`);
      
      // Realizar orquestación
      const result = await this.orchestrationSystem.orchestrate(
        userInput,
        sessionId,
        userId,
        {
          enableMonitoring: true
        }
      );
      
      console.log('\nResultado de la orquestación:');
      console.log(`- Agente seleccionado: ${result.selectedAgent}`);
      console.log(`- Tipo de orquestación: ${result.orchestrationType}`);
      console.log(`- Confianza: ${result.confidence}`);
      console.log(`- Herramientas disponibles: ${result.availableTools?.length || 0}`);
      
      if (result.reasoning) {
        console.log(`- Razonamiento: ${result.reasoning}`);
      }
      
    } catch (error) {
      console.error('Error en orquestación básica:', error);
    }
  }

  /**
   * Ejemplo de orquestación con historial de sesión
   */
  async sessionHistoryExample(): Promise<void> {
    console.log('\n=== Ejemplo con Historial de Sesión ===');
    
    try {
      // Simular historial de conversación
      const sessionHistory: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'Hola, soy un psicólogo clínico' }]
        },
        {
          role: 'model',
          parts: [{ text: 'Hola, ¿en qué puedo ayudarte hoy?' }]
        },
        {
          role: 'user',
          parts: [{ text: 'Tengo un paciente con ansiedad severa' }]
        }
      ];
      
      const userInput = "¿Qué técnicas de EMDR serían más efectivas para este caso?";
      const sessionId = "session_789";
      const userId = "psychologist_456";
      
      console.log(`Usuario (con contexto): ${userInput}`);
      
      // Realizar orquestación con historial
      const result = await this.orchestrationSystem.orchestrate(
        userInput,
        sessionId,
        userId,
        {
          sessionHistory,
          enableMonitoring: true
        }
      );
      
      console.log('\nResultado con contexto:');
      console.log(`- Agente seleccionado: ${result.selectedAgent}`);
      console.log(`- Contexto de sesión: ${result.sessionContext ? 'Disponible' : 'No disponible'}`);
      console.log(`- Herramientas contextuales: ${result.availableTools?.length || 0}`);
      
    } catch (error) {
      console.error('Error en orquestación con historial:', error);
    }
  }

  /**
   * Ejemplo de monitoreo del sistema
   */
  async monitoringExample(): Promise<void> {
    console.log('\n=== Ejemplo de Monitoreo del Sistema ===');
    
    try {
      // Obtener estado de salud
      const healthStatus: SystemHealthStatus = this.orchestrationSystem.getHealthStatus();
      
      console.log('Estado de salud del sistema:');
      console.log(`- Estado general: ${healthStatus.overall}`);
      console.log(`- Tool Registry: ${healthStatus.components.toolRegistry}`);
      console.log(`- Puente de Orquestación: ${healthStatus.components.orchestrationBridge}`);
      console.log(`- Sistema de Monitoreo: ${healthStatus.components.monitoring}`);
      
      console.log('\nMétricas del sistema:');
      console.log(`- Tiempo activo: ${Math.round(healthStatus.metrics.uptime / 1000 / 60)} minutos`);
      console.log(`- Total de orquestaciones: ${healthStatus.metrics.totalOrchestrations}`);
      console.log(`- Tiempo promedio de respuesta: ${healthStatus.metrics.averageResponseTime}ms`);
      console.log(`- Tasa de error: ${(healthStatus.metrics.errorRate * 100).toFixed(2)}%`);
      
      console.log('\nAlertas activas:');
      console.log(`- Críticas: ${healthStatus.alerts.critical}`);
      console.log(`- Advertencias: ${healthStatus.alerts.warnings}`);
      
      // Obtener métricas detalladas
      const systemMetrics = this.orchestrationSystem.getSystemMetrics();
      console.log('\nMétricas detalladas disponibles:', Object.keys(systemMetrics));
      
    } catch (error) {
      console.error('Error obteniendo métricas:', error);
    }
  }

  /**
   * Ejemplo de generación de reporte clínico
   */
  async clinicalReportExample(): Promise<void> {
    console.log('\n=== Ejemplo de Reporte Clínico ===');
    
    try {
      // Generar reporte de los últimos 7 días
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const report = this.orchestrationSystem.generateClinicalReport(startDate, endDate);
      
      console.log('Reporte clínico generado:');
      console.log(`- ID del Reporte: ${report.reportId}`);
      console.log(`- Período: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
      console.log(`- Total de sesiones: ${report.summary.totalSessions}`);
      console.log(`- Usuarios únicos: ${report.summary.uniqueUsers}`);
      console.log(`- Agente más usado: ${report.summary.mostUsedAgent}`);
      console.log(`- Herramientas más efectivas: ${report.summary.mostEffectiveTools.join(', ')}`);
      console.log(`- Tasa promedio de éxito: ${(report.summary.averageSessionSuccess * 100).toFixed(1)}%`);
      
      if (report.insights) {
        console.log('\nInsights clínicos:');
        
        if (report.insights.topClinicalTopics.length > 0) {
          console.log('- Tópicos clínicos principales:');
          report.insights.topClinicalTopics.slice(0, 3).forEach((topic, index) => {
            console.log(`  ${index + 1}. ${topic.topic} (${topic.frequency} menciones)`);
          });
        }
        
        if (report.insights.agentEffectiveness.length > 0) {
          console.log('- Efectividad de agentes:');
          report.insights.agentEffectiveness.forEach((agent, index) => {
            console.log(`  ${index + 1}. ${agent.agent}: ${(agent.successRate * 100).toFixed(1)}% éxito, ${agent.avgConfidence.toFixed(2)} confianza promedio`);
          });
        }
        
        if (report.insights.userPatterns.length > 0) {
          console.log('- Patrones de usuario identificados:');
          report.insights.userPatterns.slice(0, 3).forEach((pattern, index) => {
            console.log(`  ${index + 1}. ${pattern.pattern} (${pattern.frequency} ocurrencias)`);
          });
        }
      }
      
      if (report.recommendations.length > 0) {
        console.log('\nRecomendaciones del sistema:');
        report.recommendations.forEach((recommendation, index) => {
          console.log(`${index + 1}. ${recommendation}`);
        });
      }
      
    } catch (error) {
      console.error('Error generando reporte clínico:', error);
    }
  }

  /**
   * Ejemplo de gestión de alertas
   */
  async alertManagementExample(): Promise<void> {
    console.log('\n=== Ejemplo de Gestión de Alertas ===');
    
    try {
      // Obtener alertas activas
      const activeAlerts = this.orchestrationSystem.getActiveAlerts();
      
      console.log(`Alertas activas: ${activeAlerts.length}`);
      
      if (activeAlerts.length > 0) {
        activeAlerts.forEach((alert, index) => {
          console.log(`\nAlerta ${index + 1}:`);
          console.log(`- ID: ${alert.id}`);
          console.log(`- Nivel: ${alert.level}`);
          console.log(`- Mensaje: ${alert.message}`);
          console.log(`- Timestamp: ${alert.timestamp.toLocaleString()}`);
          console.log(`- Resuelto: ${alert.resolved ? 'Sí' : 'No'}`);
          
          // Ejemplo de resolución de alerta (solo para demo)
          if (alert.level === 'warning') {
            const resolved = this.orchestrationSystem.resolveAlert(alert.id);
            console.log(`- Resolución: ${resolved ? 'Exitosa' : 'Fallida'}`);
          }
        });
      } else {
        console.log('No hay alertas activas en el sistema.');
      }
      
    } catch (error) {
      console.error('Error gestionando alertas:', error);
    }
  }

  /**
   * Ejecuta todos los ejemplos en secuencia
   */
  async runAllExamples(): Promise<void> {
    console.log('🚀 Iniciando ejemplos del Sistema de Orquestación HopeAI\n');
    
    await this.basicOrchestrationExample();
    await this.sessionHistoryExample();
    await this.monitoringExample();
    await this.clinicalReportExample();
    await this.alertManagementExample();
    
    console.log('\n✅ Todos los ejemplos completados exitosamente');
  }

  /**
   * Limpia recursos y cierra el sistema
   */
  shutdown(): void {
    console.log('\n🔄 Cerrando sistema de orquestación...');
    this.orchestrationSystem.shutdown();
    console.log('✅ Sistema cerrado correctamente');
  }
}

/**
 * Función principal para ejecutar los ejemplos
 */
export async function runOrchestrationExamples(): Promise<void> {
  const example = new OrchestrationExample('development');
  
  try {
    await example.runAllExamples();
  } catch (error) {
    console.error('Error ejecutando ejemplos:', error);
  } finally {
    example.shutdown();
  }
}

/**
 * Ejemplo de configuración personalizada
 */
export function createCustomOrchestrationSystem(): HopeAIOrchestrationSystem {
  const hopeAISystem = new HopeAISystem();
  const agentRouter = new ClinicalAgentRouter();
  
  const customConfig: HopeAIOrchestrationSystemConfig = {
    bridge: {
      enableDynamicOrchestration: true,
      migrationPercentage: 75,
      enablePerformanceMonitoring: true,
      fallbackToLegacy: false, // Solo orquestación dinámica
      logLevel: 'info'
    },
    monitoring: {
      enableRealTimeMetrics: true,
      enableAnomalyDetection: true,
      enablePerformanceAlerts: true,
      metricsRetentionDays: 14,
      logLevel: 'info'
    },
    system: {
      enableAutoCleanup: true,
      cleanupIntervalMinutes: 60,
      enableHealthChecks: true,
      healthCheckIntervalMinutes: 10
    }
  };
  
  return createHopeAIOrchestrationSystem(hopeAISystem, agentRouter, customConfig);
}

// Ejecutar ejemplos si este archivo se ejecuta directamente
if (require.main === module) {
  runOrchestrationExamples().catch(console.error);
}