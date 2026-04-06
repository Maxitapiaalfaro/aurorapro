/**
 * Sistema de Métricas Personalizadas para Sentry
 * 
 * Implementa las métricas clave para el análisis de uso de la plataforma:
 * 1. Cantidad de Mensajes Enviados (por usuario, por semana, por agente)
 * 2. Tiempo de Actividad (por sesión, por semana)
 */

import * as Sentry from '@sentry/nextjs';
import type { AgentType } from '@/types/clinical-types';

// Interfaces para las métricas
interface MessageMetrics {
  userId?: string;
  sessionId?: string;
  agentType: AgentType;
  timestamp?: Date;
  messageLength: number;
  responseTime?: number;
  // Nuevas propiedades para Fase 1 - métricas avanzadas
  isStreaming?: boolean;
  chunkCount?: number;
  groundingUrlsCount?: number;
  functionCallsCount?: number;
}

interface AgentSwitchMetrics {
  userId: string;
  sessionId: string;
  fromAgent: AgentType;
  toAgent: AgentType;
  switchType: 'explicit' | 'automatic' | 'manual';
  confidence: number;
}

interface SessionActivityMetrics {
  userId: string;
  sessionId: string;
  startTime: Date;
  lastActivityTime: Date;
  totalDuration: number; // en segundos
  messageCount: number;
  agentSwitches: number;
  activeAgent: AgentType;
}

// Clase principal para el tracking de métricas
export class SentryMetricsTracker {
  private static instance: SentryMetricsTracker;
  private sessionStartTimes: Map<string, Date> = new Map();
  private sessionLastActivity: Map<string, Date> = new Map();
  private sessionMessageCounts: Map<string, number> = new Map();
  private sessionAgentSwitches: Map<string, number> = new Map();
  private weeklyMessageCounts: Map<string, number> = new Map();
  
  private constructor() {
    // Inicializar el tracking de métricas
    this.initializeMetricsTracking();
  }

  public static getInstance(): SentryMetricsTracker {
    if (!SentryMetricsTracker.instance) {
      SentryMetricsTracker.instance = new SentryMetricsTracker();
    }
    return SentryMetricsTracker.instance;
  }

  /**
   * Inicializa el sistema de métricas habilitando el agregador de métricas
   */
  private initializeMetricsTracking(): void {
    // Las métricas ya están habilitadas en la configuración de Sentry
    // Solo necesitamos asegurar que el sistema esté listo
    // 🔒 SECURITY: Console logging disabled in production
  }

  /**
   * MÉTRICA 1: Registra un mensaje enviado
   * Incrementa contadores por usuario, agente y período semanal
   */
  public trackMessageSent(metrics: MessageMetrics): void {
    const { 
      userId = '',
      sessionId = 'default_session', 
      agentType, 
      timestamp = new Date(), 
      messageLength, 
      responseTime,
      isStreaming = false,
      chunkCount = 0,
      groundingUrlsCount = 0,
      functionCallsCount = 0
    } = metrics;
    
    try {
      // Incrementar contador general de mensajes
      Sentry.addBreadcrumb({
        message: 'Message sent',
        category: 'metrics',
        data: {
          user_id: userId,
          agent_type: agentType,
          session_id: sessionId,
          metric: 'messages.sent',
          value: 1
        }
      });

      // Métricas por agente específico
      Sentry.addBreadcrumb({
        message: `Message sent to ${agentType}`,
        category: 'metrics',
        data: {
          user_id: userId,
          session_id: sessionId,
          metric: `messages.sent.${agentType}`,
          value: 1
        }
      });

      // Métricas semanales (usando la semana del año)
      const weekKey = this.getWeekKey(timestamp);
      Sentry.addBreadcrumb({
        message: 'Weekly message count',
        category: 'metrics',
        data: {
          user_id: userId,
          agent_type: agentType,
          week: weekKey,
          metric: 'messages.sent.weekly',
          value: 1
        }
      });

      // Métricas de longitud de mensaje
      Sentry.addBreadcrumb({
        message: 'Message length recorded',
        category: 'metrics',
        data: {
          user_id: userId,
          agent_type: agentType,
          metric: 'message.length',
          value: messageLength,
          unit: 'characters'
        }
      });

      // Tiempo de respuesta si está disponible
      if (responseTime) {
        Sentry.addBreadcrumb({
          message: 'Message response time recorded',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            streaming: isStreaming.toString(),
            metric: 'message.response_time',
            value: responseTime,
            unit: 'milliseconds'
          }
        });
      }

      // Métricas de streaming si aplica
      if (isStreaming) {
        Sentry.addBreadcrumb({
          message: 'Streaming message recorded',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            metric: 'messages.streaming',
            value: 1
          }
        });

        if (chunkCount > 0) {
          Sentry.addBreadcrumb({
            message: 'Streaming chunk count recorded',
            category: 'metrics',
            data: {
              user_id: userId,
              agent_type: agentType,
              metric: 'streaming.chunk_count',
              value: chunkCount,
              unit: 'chunks'
            }
          });
        }
      }

      // Métricas de RAG (grounding)
      if (groundingUrlsCount > 0) {
        Sentry.addBreadcrumb({
          message: 'RAG grounding URLs recorded',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            metric: 'rag.grounding_urls',
            value: groundingUrlsCount,
            unit: 'urls'
          }
        });
      }

      // Métricas de function calls
      if (functionCallsCount > 0) {
        Sentry.addBreadcrumb({
          message: 'Function calls recorded',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            metric: 'function_calls.count',
            value: functionCallsCount,
            unit: 'calls'
          }
        });
      }

      // Actualizar contadores de sesión
      const currentCount = this.sessionMessageCounts.get(sessionId) || 0;
      this.sessionMessageCounts.set(sessionId, currentCount + 1);
      this.sessionLastActivity.set(sessionId, timestamp);

      // 🔒 SECURITY: Console logging disabled in production

    } catch (error) {
      console.error('❌ Error al registrar métrica de mensaje:', error);
      // Capturar el error en Sentry pero no interrumpir el flujo
      Sentry.captureException(error, {
        tags: {
          metric_type: 'message_sent',
          user_id: userId,
          agent_type: agentType
        }
      });
    }
  }

  /**
   * MÉTRICA 2: Inicia el tracking de una sesión
   */
  public startSessionTracking(userId: string, sessionId: string, agentType: AgentType): void {
    const startTime = new Date();
    
    try {
      this.sessionStartTimes.set(sessionId, startTime);
      this.sessionLastActivity.set(sessionId, startTime);
      this.sessionMessageCounts.set(sessionId, 0);
      this.sessionAgentSwitches.set(sessionId, 0);

      // Registrar inicio de sesión
      Sentry.addBreadcrumb({
        message: 'Session started',
        category: 'metrics',
        data: {
          user_id: userId,
          agent_type: agentType,
          session_id: sessionId,
          metric: 'sessions.started',
          value: 1
        }
      });

      // 🔒 SECURITY: Console logging disabled in production

    } catch (error) {
      console.error('❌ Error al iniciar tracking de sesión:', error);
      Sentry.captureException(error, {
        tags: {
          metric_type: 'session_start',
          user_id: userId,
          session_id: sessionId
        }
      });
    }
  }

  /**
   * MÉTRICA 2: Actualiza la actividad de la sesión
   */
  public updateSessionActivity(userId: string, sessionId: string, agentType: AgentType): void {
    const currentTime = new Date();
    
    try {
      this.sessionLastActivity.set(sessionId, currentTime);
      
      // Calcular duración actual de la sesión
      const startTime = this.sessionStartTimes.get(sessionId);
      if (startTime) {
        const durationSeconds = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);
        
        // Registrar duración actual como gauge
        Sentry.addBreadcrumb({
          message: 'Session duration updated',
          category: 'metrics',
          data: {
            user_id: userId,
            session_id: sessionId,
            agent_type: agentType,
            metric: 'session.duration.current',
            value: durationSeconds,
            unit: 'seconds'
          }
        });
      }

    } catch (error) {
      console.error('❌ Error al actualizar actividad de sesión:', error);
      Sentry.captureException(error, {
        tags: {
          metric_type: 'session_activity',
          user_id: userId,
          session_id: sessionId
        }
      });
    }
  }

  /**
   * MÉTRICA 2: Finaliza el tracking de una sesión
   */
  public endSessionTracking(userId: string, sessionId: string, agentType: AgentType): void {
    const endTime = new Date();
    
    try {
      const startTime = this.sessionStartTimes.get(sessionId);
      const messageCount = this.sessionMessageCounts.get(sessionId) || 0;
      const agentSwitches = this.sessionAgentSwitches.get(sessionId) || 0;
      
      if (startTime) {
        const totalDurationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        const weekKey = this.getWeekKey(endTime);
        
        // Registrar duración total de la sesión
        Sentry.addBreadcrumb({
          message: 'Session ended - total duration',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            session_id: sessionId,
            metric: 'session.duration.total',
            value: totalDurationSeconds,
            unit: 'seconds'
          }
        });

        // Métricas semanales de tiempo de actividad
        Sentry.addBreadcrumb({
          message: 'Weekly session duration',
          category: 'metrics',
          data: {
            user_id: userId,
            week: weekKey,
            metric: 'session.duration.weekly',
            value: totalDurationSeconds,
            unit: 'seconds'
          }
        });

        // Métricas de engagement (mensajes por sesión)
        Sentry.addBreadcrumb({
          message: 'Session message count',
          category: 'metrics',
          data: {
            user_id: userId,
            agent_type: agentType,
            metric: 'session.messages.count',
            value: messageCount,
            unit: 'messages'
          }
        });

        // Métricas de cambios de agente
        Sentry.addBreadcrumb({
          message: 'Session agent switches',
          category: 'metrics',
          data: {
            user_id: userId,
            session_id: sessionId,
            metric: 'session.agent_switches',
            value: agentSwitches,
            unit: 'switches'
          }
        });

        // 🔒 SECURITY: Console logging disabled in production
      }

      // Limpiar datos de la sesión
      this.sessionStartTimes.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);
      this.sessionMessageCounts.delete(sessionId);
      this.sessionAgentSwitches.delete(sessionId);

    } catch (error) {
      console.error('❌ Error al finalizar tracking de sesión:', error);
      Sentry.captureException(error, {
        tags: {
          metric_type: 'session_end',
          user_id: userId,
          session_id: sessionId
        }
      });
    }
  }

  /**
   * Registra un cambio de agente en la sesión
   */
  public trackAgentSwitch(metrics: AgentSwitchMetrics): void {
    const { userId, sessionId, fromAgent, toAgent, switchType, confidence } = metrics;
    
    try {
      // Incrementar contador de cambios de agente
      const currentSwitches = this.sessionAgentSwitches.get(sessionId) || 0;
      this.sessionAgentSwitches.set(sessionId, currentSwitches + 1);

      // Registrar el cambio específico
      Sentry.addBreadcrumb({
        message: 'Agent switch recorded',
        category: 'metrics',
        data: {
          user_id: userId,
          session_id: sessionId,
          from_agent: fromAgent,
          to_agent: toAgent,
          switch_type: switchType,
          metric: 'agent.switches',
          value: 1
        }
      });

      // Registrar métricas de confianza del routing
      Sentry.addBreadcrumb({
        message: 'Agent switch confidence recorded',
        category: 'metrics',
        data: {
          user_id: userId,
          switch_type: switchType,
          from_agent: fromAgent,
          to_agent: toAgent,
          metric: 'agent.switch.confidence',
          value: confidence,
          unit: 'confidence_score'
        }
      });

      // Métricas específicas por tipo de cambio
      Sentry.addBreadcrumb({
        message: `Agent switch type: ${switchType}`,
        category: 'metrics',
        data: {
          user_id: userId,
          from_agent: fromAgent,
          to_agent: toAgent,
          metric: `agent.switches.${switchType}`,
          value: 1
        }
      });

      // 🔒 SECURITY: Console logging disabled in production

    } catch (error) {
      console.error('❌ Error al registrar cambio de agente:', error);
      Sentry.captureException(error, {
        tags: {
          metric_type: 'agent_switch',
          user_id: userId,
          session_id: sessionId
        }
      });
    }
  }

  /**
   * Genera una clave única para la semana (formato: YYYY-WW)
   */
  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
    return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  }

  /**
   * Obtiene estadísticas actuales de la sesión
   */
  public getSessionStats(sessionId: string): {
    duration: number;
    messageCount: number;
    agentSwitches: number;
  } | null {
    const startTime = this.sessionStartTimes.get(sessionId);
    if (!startTime) return null;

    const currentTime = new Date();
    const duration = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);
    const messageCount = this.sessionMessageCounts.get(sessionId) || 0;
    const agentSwitches = this.sessionAgentSwitches.get(sessionId) || 0;

    return {
      duration,
      messageCount,
      agentSwitches
    };
  }
}

// Instancia singleton para uso global
export const sentryMetricsTracker = SentryMetricsTracker.getInstance();

// Funciones de conveniencia para uso directo
export const trackMessage = (metrics: MessageMetrics) => {
  sentryMetricsTracker.trackMessageSent(metrics);
};

export const startSession = (userId: string, sessionId: string, agentType: AgentType) => {
  sentryMetricsTracker.startSessionTracking(userId, sessionId, agentType);
};

export const updateSession = (userId: string, sessionId: string, agentType: AgentType) => {
  sentryMetricsTracker.updateSessionActivity(userId, sessionId, agentType);
};

export const endSession = (userId: string, sessionId: string, agentType: AgentType) => {
  sentryMetricsTracker.endSessionTracking(userId, sessionId, agentType);
};

export const trackAgentSwitch = (metrics: AgentSwitchMetrics) => {
  sentryMetricsTracker.trackAgentSwitch(metrics);
};

// Función de compatibilidad hacia atrás
export const trackAgentSwitchLegacy = (userId: string, sessionId: string, fromAgent: AgentType, toAgent: AgentType) => {
  sentryMetricsTracker.trackAgentSwitch({
    userId,
    sessionId,
    fromAgent,
    toAgent,
    switchType: 'manual',
    confidence: 1.0
  });
};