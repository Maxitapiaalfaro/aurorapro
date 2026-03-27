/**
 * 🔒 AUDIT LOGGER - Sistema de auditoría de seguridad
 * 
 * Registra eventos de seguridad importantes para análisis posterior
 * y detección de patrones de ataque.
 */

import * as Sentry from '@sentry/nextjs';

export type AuditEventType =
  | 'unauthorized_access'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'admin_access'
  | 'security_violation'
  | 'authentication_failure'
  | 'authentication_success';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditEvent {
  type: AuditEventType;
  severity: AuditSeverity;
  message: string;
  ip: string;
  userAgent: string;
  endpoint: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

class AuditLogger {
  private events: AuditEvent[] = [];
  private maxEvents: number = 1000; // Mantener últimos 1000 eventos en memoria

  /**
   * Registrar evento de auditoría
   */
  log(event: Omit<AuditEvent, 'timestamp'>): void {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    // Agregar a memoria (para estadísticas locales)
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift(); // Remover el más antiguo
    }

    // En producción, enviar a Sentry
    if (process.env.NODE_ENV === 'production') {
      this.sendToSentry(fullEvent);
    }

    // En desarrollo, loggear a consola
    if (process.env.NODE_ENV === 'development') {
      console.warn(`🔒 [AUDIT] ${event.type}:`, fullEvent);
    }
  }

  /**
   * Enviar evento a Sentry
   */
  private sendToSentry(event: AuditEvent): void {
    const sentryLevel = this.getSentryLevel(event.severity);

    Sentry.captureMessage(`Security Event: ${event.type}`, {
      level: sentryLevel,
      tags: {
        security: 'audit',
        event_type: event.type,
        severity: event.severity,
        endpoint: event.endpoint
      },
      extra: {
        ip: event.ip,
        userAgent: event.userAgent,
        message: event.message,
        metadata: event.metadata,
        timestamp: event.timestamp
      }
    });
  }

  /**
   * Convertir severidad a nivel de Sentry
   */
  private getSentryLevel(severity: AuditSeverity): 'info' | 'warning' | 'error' | 'fatal' {
    switch (severity) {
      case 'low': return 'info';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'critical': return 'fatal';
    }
  }

  /**
   * Obtener eventos recientes
   */
  getRecentEvents(limit: number = 100): AuditEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Obtener eventos por tipo
   */
  getEventsByType(type: AuditEventType): AuditEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Obtener eventos por IP
   */
  getEventsByIP(ip: string): AuditEvent[] {
    return this.events.filter(e => e.ip === ip);
  }

  /**
   * Obtener estadísticas
   */
  getStats(): {
    total: number;
    byType: Record<AuditEventType, number>;
    bySeverity: Record<AuditSeverity, number>;
    topIPs: Array<{ ip: string; count: number }>;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};

    this.events.forEach(event => {
      // Por tipo
      byType[event.type] = (byType[event.type] || 0) + 1;
      
      // Por severidad
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      
      // Por IP
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    });

    // Top IPs
    const topIPs = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: this.events.length,
      byType: byType as Record<AuditEventType, number>,
      bySeverity: bySeverity as Record<AuditSeverity, number>,
      topIPs
    };
  }

  /**
   * Detectar patrones sospechosos
   */
  detectSuspiciousPatterns(): {
    suspiciousIPs: string[];
    repeatedFailures: Array<{ ip: string; count: number }>;
    rapidRequests: Array<{ ip: string; count: number; timeWindow: string }>;
  } {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // IPs con múltiples fallos de autenticación
    const failuresByIP: Record<string, number> = {};
    this.events
      .filter(e => 
        e.type === 'authentication_failure' || 
        e.type === 'unauthorized_access'
      )
      .forEach(e => {
        failuresByIP[e.ip] = (failuresByIP[e.ip] || 0) + 1;
      });

    const repeatedFailures = Object.entries(failuresByIP)
      .filter(([_, count]) => count >= 5)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count);

    // IPs con muchos requests en poco tiempo
    const recentRequestsByIP: Record<string, number> = {};
    this.events
      .filter(e => new Date(e.timestamp).getTime() > fiveMinutesAgo)
      .forEach(e => {
        recentRequestsByIP[e.ip] = (recentRequestsByIP[e.ip] || 0) + 1;
      });

    const rapidRequests = Object.entries(recentRequestsByIP)
      .filter(([_, count]) => count >= 50)
      .map(([ip, count]) => ({ ip, count, timeWindow: '5 minutes' }))
      .sort((a, b) => b.count - a.count);

    // IPs sospechosas (combinación de factores)
    const suspiciousIPs = [
      ...new Set([
        ...repeatedFailures.map(r => r.ip),
        ...rapidRequests.map(r => r.ip)
      ])
    ];

    return {
      suspiciousIPs,
      repeatedFailures,
      rapidRequests
    };
  }

  /**
   * Limpiar eventos antiguos
   */
  cleanup(olderThanMinutes: number = 60): void {
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    this.events = this.events.filter(e => 
      new Date(e.timestamp).getTime() > cutoff
    );
  }

  /**
   * Resetear (para testing)
   */
  reset(): void {
    this.events = [];
  }
}

// Singleton global
let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
    
    // Cleanup automático cada hora
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        globalAuditLogger?.cleanup(60);
      }, 60 * 60 * 1000);
    }
  }
  return globalAuditLogger;
}

/**
 * Helpers para logging rápido
 */
export const auditLog = {
  unauthorizedAccess: (ip: string, userAgent: string, endpoint: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'unauthorized_access',
      severity: 'high',
      message: `Unauthorized access attempt to ${endpoint}`,
      ip,
      userAgent,
      endpoint,
      metadata
    });
  },

  rateLimitExceeded: (ip: string, userAgent: string, endpoint: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'rate_limit_exceeded',
      severity: 'medium',
      message: `Rate limit exceeded for ${endpoint}`,
      ip,
      userAgent,
      endpoint,
      metadata
    });
  },

  suspiciousActivity: (ip: string, userAgent: string, endpoint: string, reason: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'suspicious_activity',
      severity: 'critical',
      message: `Suspicious activity detected: ${reason}`,
      ip,
      userAgent,
      endpoint,
      metadata: { ...metadata, reason }
    });
  },

  adminAccess: (ip: string, userAgent: string, endpoint: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'admin_access',
      severity: 'low',
      message: `Admin access to ${endpoint}`,
      ip,
      userAgent,
      endpoint,
      metadata
    });
  },

  authenticationFailure: (ip: string, userAgent: string, endpoint: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'authentication_failure',
      severity: 'medium',
      message: `Authentication failure for ${endpoint}`,
      ip,
      userAgent,
      endpoint,
      metadata
    });
  },

  authenticationSuccess: (ip: string, userAgent: string, endpoint: string, metadata?: Record<string, any>) => {
    getAuditLogger().log({
      type: 'authentication_success',
      severity: 'low',
      message: `Successful authentication for ${endpoint}`,
      ip,
      userAgent,
      endpoint,
      metadata
    });
  }
};

export default AuditLogger;

