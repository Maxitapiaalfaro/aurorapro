/**
 * Sistema Mejorado de Métricas para Validación de Mercado
 * Extiende el SentryMetricsTracker existente con capacidades avanzadas
 */

import * as Sentry from '@sentry/nextjs';
import { sentryMetricsTracker } from './sentry-metrics-tracker';
import {
  UserIdentity,
  ActivationMetrics,
  EngagementMetrics,
  ValueMetrics,
  RetentionMetrics,
  ConversionEvent,
  ConversionMetrics,
  ProductMarketFitMetrics,
  GrowthMetrics,
  UserSegment,
  CohortData,
  BusinessInsight,
  AnalysisResult,
  EnhancedTrackerConfig,
  UserType,
  UserSource,
  DeviceType,
  AgentType,
  EVENT_TYPES,
  DEFAULT_THRESHOLDS
} from './enhanced-metrics-types';

class EnhancedSentryMetricsTracker {
  private config: EnhancedTrackerConfig;
  private userSessions: Map<string, any> = new Map();
  private userMetrics: Map<string, any> = new Map();
  private conversionEvents: ConversionEvent[] = [];

  constructor(config: Partial<EnhancedTrackerConfig> = {}) {
    this.config = {
      enableUserIdentification: true,
      enableEngagementTracking: true,
      enableRetentionAnalysis: true,
      enableConversionTracking: true,
      enableBusinessInsights: true,
      activationThresholds: {
        minMessages: DEFAULT_THRESHOLDS.ACTIVATION.MIN_MESSAGES,
        minSessionDuration: DEFAULT_THRESHOLDS.ACTIVATION.MIN_SESSION_DURATION,
        maxTimeToFirstMessage: DEFAULT_THRESHOLDS.ACTIVATION.MAX_TIME_TO_FIRST_MESSAGE
      },
      engagementThresholds: {
        highEngagement: DEFAULT_THRESHOLDS.ENGAGEMENT.HIGH,
        mediumEngagement: DEFAULT_THRESHOLDS.ENGAGEMENT.MEDIUM,
        lowEngagement: DEFAULT_THRESHOLDS.ENGAGEMENT.LOW
      },
      retentionPeriods: {
        shortTerm: DEFAULT_THRESHOLDS.RETENTION.SHORT_TERM,
        mediumTerm: DEFAULT_THRESHOLDS.RETENTION.MEDIUM_TERM,
        longTerm: DEFAULT_THRESHOLDS.RETENTION.LONG_TERM
      },
      ...config
    };
  }

  // ==========================================
  // IDENTIFICACIÓN DE USUARIOS
  // ==========================================

  /**
   * Identifica y registra un usuario con información detallada
   */
  identifyUser(identity: Partial<UserIdentity>): UserIdentity {
    if (!this.config.enableUserIdentification) {
      return identity as UserIdentity;
    }

    const userId = identity.userId || this.generateUserId();
    const fingerprint = identity.fingerprint || this.generateFingerprint();
    
    const userIdentity: UserIdentity = {
      userId,
      sessionId: identity.sessionId || this.generateSessionId(),
      fingerprint,
      userType: this.determineUserType(userId),
      source: identity.source || this.detectUserSource(),
      deviceType: identity.deviceType || this.detectDeviceType(),
      firstSeen: identity.firstSeen || new Date(),
      lastSeen: new Date(),
      totalSessions: (identity.totalSessions || 0) + 1,
      location: identity.location || this.detectLocation()
    };

    // Registrar en Sentry
    Sentry.setUser({
      id: userId,
      username: `user_${userId}`,
      segment: userIdentity.userType
    });

    // Métricas de identificación
    Sentry.addBreadcrumb({
      message: 'User identified',
      category: 'metrics',
      data: {
        user_type: userIdentity.userType,
        source: userIdentity.source,
        device_type: userIdentity.deviceType,
        is_new_user: userIdentity.userType === 'new' ? 'true' : 'false',
        metric: 'user.identified',
        value: 1
      }
    });

    // Guardar en memoria para análisis
    this.userMetrics.set(userId, {
      ...this.userMetrics.get(userId),
      identity: userIdentity
    });

    console.log('🔍 Usuario identificado:', userIdentity);
    return userIdentity;
  }

  // ==========================================
  // MÉTRICAS DE ACTIVACIÓN
  // ==========================================

  /**
   * Rastrea y calcula métricas de activación de usuario
   */
  trackActivation(metrics: Partial<ActivationMetrics>): ActivationMetrics {
    const userId = metrics.userId!;
    const sessionId = metrics.sessionId!;
    
    const activationMetrics: ActivationMetrics = {
      userId,
      sessionId,
      firstMessageSent: metrics.firstMessageSent || false,
      firstAgentSwitch: metrics.firstAgentSwitch || false,
      sessionDuration: metrics.sessionDuration || 0,
      messagesInFirstSession: metrics.messagesInFirstSession || 0,
      timeToFirstMessage: metrics.timeToFirstMessage || 0,
      completedOnboarding: metrics.completedOnboarding || false,
      activationScore: this.calculateActivationScore(metrics),
      activationTimestamp: metrics.activationTimestamp
    };

    // Determinar si el usuario está activado
    const isActivated = this.isUserActivated(activationMetrics);
    
    if (isActivated && !activationMetrics.activationTimestamp) {
      activationMetrics.activationTimestamp = new Date();
      this.trackConversionEvent({
        userId,
        sessionId,
        eventType: EVENT_TYPES.CONVERSION.ACTIVATION,
        eventValue: activationMetrics.activationScore,
        metadata: { activationMetrics },
        timestamp: new Date()
      });
    }

    // Registrar métricas en Sentry
    Sentry.addBreadcrumb({
      message: 'User activation score recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        session_id: sessionId,
        is_activated: isActivated ? 'true' : 'false',
        metric: 'user.activation.score',
        value: activationMetrics.activationScore
      }
    });

    Sentry.addBreadcrumb({
      message: 'Time to first message recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        metric: 'user.time_to_first_message',
        value: activationMetrics.timeToFirstMessage,
        unit: 'seconds'
      }
    });

    // Actualizar métricas del usuario
    this.updateUserMetrics(userId, { activation: activationMetrics });

    console.log('🚀 Activación rastreada:', { userId, score: activationMetrics.activationScore, isActivated });
    return activationMetrics;
  }

  // ==========================================
  // MÉTRICAS DE ENGAGEMENT
  // ==========================================

  /**
   * Rastrea métricas de engagement profundo
   */
  trackEngagement(metrics: Partial<EngagementMetrics>): EngagementMetrics {
    const userId = metrics.userId!;
    const sessionId = metrics.sessionId!;
    
    const engagementMetrics: EngagementMetrics = {
      userId,
      sessionId,
      messagesPerSession: metrics.messagesPerSession || 0,
      averageSessionDuration: metrics.averageSessionDuration || 0,
      sessionsPerWeek: metrics.sessionsPerWeek || 0,
      averageMessageLength: metrics.averageMessageLength || 0,
      conversationDepth: metrics.conversationDepth || 0,
      agentDiversity: metrics.agentDiversity || 1,
      preferredAgent: metrics.preferredAgent || 'socratico',
      peakUsageHours: metrics.peakUsageHours || [],
      usageFrequency: metrics.usageFrequency || 'sporadic',
      engagementScore: this.calculateEngagementScore(metrics),
      lastEngagementUpdate: new Date()
    };

    // Registrar métricas en Sentry
    Sentry.addBreadcrumb({
      message: 'User engagement score recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        session_id: sessionId,
        preferred_agent: engagementMetrics.preferredAgent,
        usage_frequency: engagementMetrics.usageFrequency,
        metric: 'user.engagement.score',
        value: engagementMetrics.engagementScore
      }
    });

    Sentry.addBreadcrumb({
      message: 'Messages per session recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        metric: 'session.messages_per_session',
        value: engagementMetrics.messagesPerSession
      }
    });

    Sentry.addBreadcrumb({
      message: 'Conversation depth recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        metric: 'session.conversation_depth',
        value: engagementMetrics.conversationDepth
      }
    });

    // Detectar engagement alto
    if (engagementMetrics.engagementScore >= this.config.engagementThresholds.highEngagement) {
      this.trackConversionEvent({
        userId,
        sessionId,
        eventType: EVENT_TYPES.CONVERSION.ENGAGEMENT,
        eventValue: engagementMetrics.engagementScore,
        metadata: { engagementMetrics },
        timestamp: new Date()
      });
    }

    // Actualizar métricas del usuario
    this.updateUserMetrics(userId, { engagement: engagementMetrics });

    console.log('💫 Engagement rastreado:', { userId, score: engagementMetrics.engagementScore });
    return engagementMetrics;
  }

  // ==========================================
  // MÉTRICAS DE VALOR
  // ==========================================

  /**
   * Rastrea métricas de valor percibido
   */
  trackValue(metrics: Partial<ValueMetrics>): ValueMetrics {
    const userId = metrics.userId!;
    
    const valueMetrics: ValueMetrics = {
      userId,
      longConversations: metrics.longConversations || 0,
      repeatUsage: metrics.repeatUsage || 0,
      featureAdoption: {
        agentSwitching: false,
        longFormQuestions: false,
        multipleTopics: false,
        advancedFeatures: false,
        ...metrics.featureAdoption
      },
      sessionCompletionRate: metrics.sessionCompletionRate || 0,
      averageResponseSatisfaction: metrics.averageResponseSatisfaction || 0,
      valueScore: this.calculateValueScore(metrics)
    };

    // Registrar métricas en Sentry
    Sentry.addBreadcrumb({
      message: 'User value score recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        metric: 'user.value.score',
        value: valueMetrics.valueScore
      }
    });

    Sentry.addBreadcrumb({
      message: 'Long conversations recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        metric: 'user.long_conversations',
        value: valueMetrics.longConversations
      }
    });

    // Actualizar métricas del usuario
    this.updateUserMetrics(userId, { value: valueMetrics });

    console.log('💎 Valor rastreado:', { userId, score: valueMetrics.valueScore });
    return valueMetrics;
  }

  // ==========================================
  // MÉTRICAS DE RETENCIÓN
  // ==========================================

  /**
   * Analiza y rastrea métricas de retención
   */
  analyzeRetention(userId: string): RetentionMetrics {
    const userMetrics = this.userMetrics.get(userId);
    if (!userMetrics?.identity) {
      throw new Error(`Usuario ${userId} no encontrado`);
    }

    const identity = userMetrics.identity as UserIdentity;
    const cohortWeek = this.getWeekKey(identity.firstSeen);
    const daysSinceFirst = this.getDaysSince(identity.firstSeen);
    const daysSinceLast = this.getDaysSince(identity.lastSeen);

    const retentionMetrics: RetentionMetrics = {
      userId,
      cohortWeek,
      day1Retention: daysSinceFirst >= 1 && daysSinceLast <= 1,
      day7Retention: daysSinceFirst >= 7 && daysSinceLast <= 7,
      day30Retention: daysSinceFirst >= 30 && daysSinceLast <= 30,
      isWeeklyActive: daysSinceLast <= 7,
      isMonthlyActive: daysSinceLast <= 30,
      isChurned: daysSinceLast > this.config.retentionPeriods.longTerm,
      isReactivated: false, // Se determina en lógica más compleja
      daysSinceLastActivity: daysSinceLast
    };

    // Registrar métricas en Sentry
    Sentry.addBreadcrumb({
      message: 'User retention days since last activity recorded',
      category: 'metrics',
      data: {
        user_id: userId,
        cohort_week: cohortWeek,
        is_churned: retentionMetrics.isChurned ? 'true' : 'false',
        metric: 'user.retention.days_since_last_activity',
        value: retentionMetrics.daysSinceLastActivity,
        unit: 'days'
      }
    });

    // Actualizar métricas del usuario
    this.updateUserMetrics(userId, { retention: retentionMetrics });

    console.log('🔄 Retención analizada:', { userId, daysSinceLast: daysSinceLast, isChurned: retentionMetrics.isChurned });
    return retentionMetrics;
  }

  // ==========================================
  // EVENTOS DE CONVERSIÓN
  // ==========================================

  /**
   * Rastrea eventos de conversión específicos
   */
  trackConversionEvent(event: ConversionEvent): void {
    if (!this.config.enableConversionTracking) return;

    this.conversionEvents.push(event);

    // Registrar en Sentry
    Sentry.addBreadcrumb({
      message: 'Conversion event recorded',
      category: 'metrics',
      data: {
        user_id: event.userId,
        session_id: event.sessionId,
        event_type: event.eventType,
        has_value: event.eventValue ? 'true' : 'false',
        metric: 'conversion.event',
        value: 1
      }
    });

    if (event.eventValue) {
      Sentry.addBreadcrumb({
        message: 'Conversion event value recorded',
        category: 'metrics',
        data: {
          user_id: event.userId,
          event_type: event.eventType,
          metric: 'conversion.event_value',
          value: event.eventValue
        }
      });
    }

    console.log('🎯 Evento de conversión:', event.eventType, { userId: event.userId, value: event.eventValue });
  }

  // ==========================================
  // ANÁLISIS DE PRODUCT-MARKET FIT
  // ==========================================

  /**
   * Calcula métricas de Product-Market Fit
   */
  calculateProductMarketFit(period: string): ProductMarketFitMetrics {
    const users = Array.from(this.userMetrics.values());
    
    // Calcular métricas agregadas
    const organicUsers = users.filter(u => u.identity?.source === 'organic').length;
    const totalUsers = users.length;
    const organicGrowthRate = totalUsers > 0 ? (organicUsers / totalUsers) * 100 : 0;
    
    const avgEngagement = users.reduce((sum, u) => sum + (u.engagement?.engagementScore || 0), 0) / totalUsers;
    const avgRetention = users.filter(u => u.retention?.day7Retention).length / totalUsers * 100;
    
    const pmfScore = this.calculatePMFScore({
      organicGrowthRate,
      avgEngagement,
      avgRetention,
      userCount: totalUsers
    });

    const pmfMetrics: ProductMarketFitMetrics = {
      period,
      organicGrowthRate,
      netPromoterScore: avgEngagement, // Proxy basado en engagement
      productUsageIntensity: avgEngagement,
      retentionStrength: avgRetention,
      featureUsageDistribution: this.calculateFeatureUsage(),
      mostValuedFeatures: this.getMostValuedFeatures(),
      abandonedFeatures: this.getAbandonedFeatures(),
      pmfScore
    };

    // Registrar en Sentry
    Sentry.addBreadcrumb({
      message: 'Product market fit score recorded',
      category: 'metrics',
      data: {
        period: period,
        metric: 'product.market_fit.score',
        value: pmfScore
      }
    });

    console.log('📊 PMF calculado:', { period, score: pmfScore });
    return pmfMetrics;
  }

  // ==========================================
  // MÉTODOS DE UTILIDAD
  // ==========================================

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(): string {
    // Generar huella digital básica del navegador
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('fingerprint', 10, 10);
    const fingerprint = canvas.toDataURL();
    return btoa(fingerprint).substr(0, 16);
  }

  private determineUserType(userId: string): UserType {
    const existingUser = this.userMetrics.get(userId);
    if (existingUser) return 'returning';
    
    // Verificar en localStorage si es posible
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`hopeai_user_${userId}`);
      if (stored) return 'returning';
      localStorage.setItem(`hopeai_user_${userId}`, 'true');
    }
    
    return 'new';
  }

  private detectUserSource(): UserSource {
    if (typeof window === 'undefined') return 'direct';
    
    const referrer = document.referrer;
    if (!referrer) return 'direct';
    
    if (referrer.includes('google.com') || referrer.includes('bing.com')) return 'search';
    if (referrer.includes('facebook.com') || referrer.includes('twitter.com')) return 'social';
    
    return 'referral';
  }

  private detectDeviceType(): DeviceType {
    if (typeof window === 'undefined') return 'desktop';
    
    const userAgent = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) return 'mobile';
    
    return 'desktop';
  }

  private detectLocation() {
    // Implementación básica - en producción usar servicio de geolocalización
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  private calculateActivationScore(metrics: Partial<ActivationMetrics>): number {
    let score = 0;
    
    if (metrics.firstMessageSent) score += 30;
    if (metrics.messagesInFirstSession && metrics.messagesInFirstSession >= 3) score += 25;
    if (metrics.sessionDuration && metrics.sessionDuration >= 120) score += 20;
    if (metrics.timeToFirstMessage && metrics.timeToFirstMessage <= 300) score += 15;
    if (metrics.firstAgentSwitch) score += 10;
    
    return Math.min(score, 100);
  }

  private calculateEngagementScore(metrics: Partial<EngagementMetrics>): number {
    let score = 0;
    
    // Intensidad de mensajes
    if (metrics.messagesPerSession) {
      score += Math.min(metrics.messagesPerSession * 5, 30);
    }
    
    // Duración de sesión
    if (metrics.averageSessionDuration) {
      score += Math.min(metrics.averageSessionDuration / 60, 25); // 1 punto por minuto, max 25
    }
    
    // Frecuencia de uso
    if (metrics.sessionsPerWeek) {
      score += Math.min(metrics.sessionsPerWeek * 10, 30);
    }
    
    // Diversidad de agentes
    if (metrics.agentDiversity && metrics.agentDiversity > 1) {
      score += 15;
    }
    
    return Math.min(score, 100);
  }

  private calculateValueScore(metrics: Partial<ValueMetrics>): number {
    let score = 0;
    
    if (metrics.longConversations) score += Math.min(metrics.longConversations * 10, 30);
    if (metrics.repeatUsage) score += Math.min(metrics.repeatUsage * 5, 25);
    if (metrics.sessionCompletionRate) score += metrics.sessionCompletionRate * 0.3;
    if (metrics.averageResponseSatisfaction) score += metrics.averageResponseSatisfaction * 0.2;
    
    // Adopción de features
    const features = metrics.featureAdoption;
    if (features) {
      const adoptedCount = Object.values(features).filter(Boolean).length;
      score += adoptedCount * 5;
    }
    
    return Math.min(score, 100);
  }

  private calculatePMFScore(data: any): number {
    const { organicGrowthRate, avgEngagement, avgRetention, userCount } = data;
    
    let score = 0;
    score += Math.min(organicGrowthRate, 40); // Max 40 puntos por crecimiento orgánico
    score += Math.min(avgEngagement * 0.3, 30); // Max 30 puntos por engagement
    score += Math.min(avgRetention * 0.3, 30); // Max 30 puntos por retención
    
    return Math.min(score, 100);
  }

  private calculateFeatureUsage(): Record<string, number> {
    // Implementar análisis de uso de features
    return {
      'agent_switching': 75,
      'long_conversations': 60,
      'multiple_sessions': 80
    };
  }

  private getMostValuedFeatures(): string[] {
    return ['agent_switching', 'multiple_sessions', 'long_conversations'];
  }

  private getAbandonedFeatures(): string[] {
    return [];
  }

  private isUserActivated(metrics: ActivationMetrics): boolean {
    return metrics.activationScore >= 70;
  }

  private updateUserMetrics(userId: string, updates: any): void {
    const existing = this.userMetrics.get(userId) || {};
    this.userMetrics.set(userId, { ...existing, ...updates });
  }

  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  private getDaysSince(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // ==========================================
  // API PÚBLICA
  // ==========================================

  /**
   * Obtiene análisis completo de un usuario
   */
  getUserAnalysis(userId: string): AnalysisResult | null {
    const userMetrics = this.userMetrics.get(userId);
    if (!userMetrics) return null;

    return {
      period: this.getWeekKey(new Date()),
      userIdentity: userMetrics.identity,
      activation: userMetrics.activation,
      engagement: userMetrics.engagement,
      value: userMetrics.value,
      retention: userMetrics.retention,
      conversions: this.conversionEvents.filter(e => e.userId === userId),
      segment: this.getUserSegment(userId),
      insights: this.generateInsights(userId),
      recommendations: this.generateRecommendations(userId)
    };
  }

  private getUserSegment(userId: string): UserSegment {
    // Implementación simplificada
    return {
      segmentId: 'default',
      name: 'Usuario General',
      description: 'Segmento por defecto',
      criteria: {},
      userCount: 1,
      averageMetrics: {
        engagementScore: 50,
        retentionRate: 50,
        sessionDuration: 300,
        messagesPerSession: 5
      }
    };
  }

  private generateInsights(userId: string): BusinessInsight[] {
    // Implementación simplificada
    return [];
  }

  private generateRecommendations(userId: string): string[] {
    // Implementación simplificada
    return ['Continuar monitoreando métricas de engagement'];
  }
}

// Instancia singleton
export const enhancedMetricsTracker = new EnhancedSentryMetricsTracker();

// Funciones de conveniencia
export const identifyUser = (identity: Partial<UserIdentity>) => 
  enhancedMetricsTracker.identifyUser(identity);

export const trackActivation = (metrics: Partial<ActivationMetrics>) => 
  enhancedMetricsTracker.trackActivation(metrics);

export const trackEngagement = (metrics: Partial<EngagementMetrics>) => 
  enhancedMetricsTracker.trackEngagement(metrics);

export const trackValue = (metrics: Partial<ValueMetrics>) => 
  enhancedMetricsTracker.trackValue(metrics);

export const analyzeRetention = (userId: string) => 
  enhancedMetricsTracker.analyzeRetention(userId);

export const trackConversion = (event: ConversionEvent) => 
  enhancedMetricsTracker.trackConversionEvent(event);

export const getUserAnalysis = (userId: string) => 
  enhancedMetricsTracker.getUserAnalysis(userId);

export const calculatePMF = (period: string) => 
  enhancedMetricsTracker.calculateProductMarketFit(period);

export default enhancedMetricsTracker;