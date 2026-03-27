/**
 * Hook para Métricas de Validación de Mercado
 * Integra el sistema mejorado de métricas con React
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { enhancedMetricsTracker } from '@/lib/enhanced-sentry-metrics-tracker';
import {
  UserIdentity,
  ActivationMetrics,
  EngagementMetrics,
  ValueMetrics,
  RetentionMetrics,
  ConversionEvent,
  AnalysisResult,
  UserType,
  UserSource,
  AgentType,
  EVENT_TYPES,
  MarketValidationData
} from '@/lib/enhanced-metrics-types';

interface UseMarketValidationMetricsProps {
  userId?: string;
  sessionId?: string;
  userType?: UserType;
  source?: UserSource;
  currentAgent?: AgentType;
  isActive?: boolean;
  enableAutoTracking?: boolean;
}

interface MarketValidationMetricsReturn {
  // Identificación
  userIdentity: UserIdentity | null;
  identifyCurrentUser: (identity: Partial<UserIdentity>) => UserIdentity;
  
  // Activación
  activationMetrics: ActivationMetrics | null;
  trackUserActivation: (metrics: Partial<ActivationMetrics>) => void;
  isUserActivated: boolean;
  
  // Engagement
  engagementMetrics: EngagementMetrics | null;
  trackUserEngagement: (metrics: Partial<EngagementMetrics>) => void;
  updateEngagementActivity: () => void;
  
  // Valor
  valueMetrics: ValueMetrics | null;
  trackUserValue: (metrics: Partial<ValueMetrics>) => void;
  
  // Retención
  retentionMetrics: RetentionMetrics | null;
  analyzeUserRetention: () => void;
  
  // Conversiones
  trackConversionEvent: (event: Partial<ConversionEvent>) => void;
  
  // Análisis
  userAnalysis: AnalysisResult | null;
  refreshAnalysis: () => void;
  
  // Utilidades
  getMarketValidationData: () => MarketValidationData;
  isHighValueUser: boolean;
  userSegment: string;
}



export function useMarketValidationMetrics({
  userId,
  sessionId,
  userType,
  source,
  currentAgent = 'socratico',
  isActive = true,
  enableAutoTracking = true
}: UseMarketValidationMetricsProps = {}): MarketValidationMetricsReturn {
  
  // Estados
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [activationMetrics, setActivationMetrics] = useState<ActivationMetrics | null>(null);
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [valueMetrics, setValueMetrics] = useState<ValueMetrics | null>(null);
  const [retentionMetrics, setRetentionMetrics] = useState<RetentionMetrics | null>(null);
  const [userAnalysis, setUserAnalysis] = useState<AnalysisResult | null>(null);
  
  // Referencias
  const sessionStartRef = useRef<Date | null>(null);
  const messageCountRef = useRef(0);
  const lastActivityRef = useRef<Date>(new Date());
  const engagementTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activationTrackedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  
  // ==========================================
  // IDENTIFICACIÓN DE USUARIO
  // ==========================================
  
  const identifyCurrentUser = useCallback((identity: Partial<UserIdentity>): UserIdentity => {
    const fullIdentity = enhancedMetricsTracker.identifyUser({
      userId: userId || identity.userId,
      sessionId: sessionId || identity.sessionId,
      userType: userType || identity.userType,
      source: source || identity.source,
      ...identity
    });
    
    setUserIdentity(fullIdentity);
    currentUserIdRef.current = fullIdentity.userId;
    
    console.log('🔍 Usuario identificado para validación de mercado:', fullIdentity.userId);
    return fullIdentity;
  }, [userId, sessionId, userType, source]);
  
  // ==========================================
  // MÉTRICAS DE ACTIVACIÓN
  // ==========================================
  
  const trackUserActivation = useCallback((metrics: Partial<ActivationMetrics>) => {
    if (!currentUserIdRef.current) return;
    
    const currentSessionId = sessionId || userIdentity?.sessionId;
    if (!currentSessionId) return;
    
    const activationData = enhancedMetricsTracker.trackActivation({
      userId: currentUserIdRef.current,
      sessionId: currentSessionId,
      ...metrics
    });
    
    setActivationMetrics(activationData);
    
    // Marcar como activado si cumple criterios
    if (activationData.activationScore >= 70 && !activationTrackedRef.current) {
      activationTrackedRef.current = true;
      enhancedMetricsTracker.trackConversionEvent({
        userId: currentUserIdRef.current,
        sessionId: currentSessionId,
        eventType: EVENT_TYPES.CONVERSION.ACTIVATION,
        eventValue: activationData.activationScore,
        metadata: { activationData },
        timestamp: new Date()
      });
    }
    
    console.log('🚀 Activación actualizada:', activationData.activationScore);
  }, [sessionId, userIdentity]);
  
  // ==========================================
  // MÉTRICAS DE ENGAGEMENT
  // ==========================================
  
  const trackUserEngagement = useCallback((metrics: Partial<EngagementMetrics>) => {
    if (!currentUserIdRef.current) return;
    
    const currentSessionId = sessionId || userIdentity?.sessionId;
    if (!currentSessionId) return;
    
    const engagementData = enhancedMetricsTracker.trackEngagement({
      userId: currentUserIdRef.current,
      sessionId: currentSessionId,
      ...metrics
    });
    
    setEngagementMetrics(engagementData);
    console.log('💫 Engagement actualizado:', engagementData.engagementScore);
  }, [sessionId, userIdentity]);
  
  const updateEngagementActivity = useCallback(() => {
    if (!isActive || !currentUserIdRef.current) return;
    
    lastActivityRef.current = new Date();
    
    // Calcular métricas de engagement en tiempo real
    const sessionDuration = sessionStartRef.current 
      ? (Date.now() - sessionStartRef.current.getTime()) / 1000 
      : 0;
    
    trackUserEngagement({
      messagesPerSession: messageCountRef.current,
      averageSessionDuration: sessionDuration,
      conversationDepth: messageCountRef.current,
      preferredAgent: currentAgent
    });
    
    // Resetear timeout de inactividad
    if (engagementTimeoutRef.current) {
      clearTimeout(engagementTimeoutRef.current);
    }
    
    // Configurar nuevo timeout (15 minutos)
    engagementTimeoutRef.current = setTimeout(() => {
      console.log('⏰ Usuario inactivo - analizando retención');
      analyzeUserRetention();
    }, 15 * 60 * 1000);
    
  }, [isActive, currentAgent, trackUserEngagement]);
  
  // ==========================================
  // MÉTRICAS DE VALOR
  // ==========================================
  
  const trackUserValue = useCallback((metrics: Partial<ValueMetrics>) => {
    if (!currentUserIdRef.current) return;
    
    const valueData = enhancedMetricsTracker.trackValue({
      userId: currentUserIdRef.current,
      ...metrics
    });
    
    setValueMetrics(valueData);
    console.log('💎 Valor actualizado:', valueData.valueScore);
  }, []);
  
  // ==========================================
  // MÉTRICAS DE RETENCIÓN
  // ==========================================
  
  const analyzeUserRetention = useCallback(() => {
    if (!currentUserIdRef.current) return;
    
    const retentionData = enhancedMetricsTracker.analyzeRetention(currentUserIdRef.current);
    setRetentionMetrics(retentionData);
    
    // Detectar riesgo de churn
    if (retentionData.daysSinceLastActivity > 7) {
      enhancedMetricsTracker.trackConversionEvent({
        userId: currentUserIdRef.current,
        sessionId: sessionId || userIdentity?.sessionId || '',
        eventType: 'user.at_risk',
        metadata: { retentionData },
        timestamp: new Date()
      });
    }
    
    console.log('🔄 Retención analizada:', {
      daysSinceLast: retentionData.daysSinceLastActivity,
      isChurned: retentionData.isChurned
    });
  }, []);
  
  // ==========================================
  // EVENTOS DE CONVERSIÓN
  // ==========================================
  
  const trackConversionEventWrapper = useCallback((event: Partial<ConversionEvent>) => {
    if (!currentUserIdRef.current) return;
    
    const fullEvent: ConversionEvent = {
      userId: currentUserIdRef.current,
      sessionId: sessionId || userIdentity?.sessionId || '',
      eventType: event.eventType || 'custom',
      eventValue: event.eventValue,
      metadata: event.metadata || {},
      timestamp: new Date()
    };
    
    enhancedMetricsTracker.trackConversionEvent(fullEvent);
    console.log('🎯 Evento de conversión:', fullEvent.eventType);
  }, [sessionId, userIdentity]);
  
  // ==========================================
  // ANÁLISIS COMPLETO
  // ==========================================
  
  const refreshAnalysis = useCallback(() => {
    if (!currentUserIdRef.current) return;
    
    const analysis = enhancedMetricsTracker.getUserAnalysis(currentUserIdRef.current);
    setUserAnalysis(analysis);
    
    console.log('📊 Análisis actualizado para:', currentUserIdRef.current);
  }, []);
  
  // ==========================================
  // UTILIDADES Y CÁLCULOS
  // ==========================================
  
  const getMarketValidationData = useCallback((): MarketValidationData => {
    const activationScore = activationMetrics?.activationScore || 0;
    const engagementScore = engagementMetrics?.engagementScore || 0;
    const valueScore = valueMetrics?.valueScore || 0;
    
    let retentionStatus: 'active' | 'at_risk' | 'churned' = 'active';
    if (retentionMetrics?.isChurned) {
      retentionStatus = 'churned';
    } else if (retentionMetrics?.daysSinceLastActivity && retentionMetrics.daysSinceLastActivity > 7) {
      retentionStatus = 'at_risk';
    }
    
    const recommendations = [];
    if (activationScore < 50) recommendations.push('Mejorar proceso de onboarding');
    if (engagementScore < 40) recommendations.push('Aumentar engagement con contenido personalizado');
    if (valueScore < 30) recommendations.push('Demostrar valor del producto más claramente');
    if (retentionStatus === 'at_risk') recommendations.push('Implementar campaña de reactivación');
    
    return {
      userIdentity,
      activationScore,
      engagementScore,
      valueScore,
      retentionStatus,
      conversionEvents: userAnalysis?.conversions.length || 0,
      recommendations
    };
  }, [userIdentity, activationMetrics, engagementMetrics, valueMetrics, retentionMetrics, userAnalysis]);
  
  // Valores derivados
  const isUserActivated = (activationMetrics?.activationScore || 0) >= 70;
  const isHighValueUser = (engagementMetrics?.engagementScore || 0) >= 80 && (valueMetrics?.valueScore || 0) >= 70;
  const userSegment = isHighValueUser ? 'high_value' : isUserActivated ? 'activated' : 'new';
  
  // ==========================================
  // EFECTOS Y AUTO-TRACKING
  // ==========================================
  
  // Identificación automática al montar
  useEffect(() => {
    if (enableAutoTracking && !userIdentity) {
      identifyCurrentUser({});
    }
  }, [enableAutoTracking, userIdentity, identifyCurrentUser]);
  
  // Iniciar sesión automáticamente
  useEffect(() => {
    if (isActive && userIdentity && !sessionStartRef.current) {
      sessionStartRef.current = new Date();
      
      // Trackear inicio de sesión
      trackConversionEventWrapper({
        eventType: EVENT_TYPES.SESSION.STARTED,
        metadata: { agent: currentAgent }
      });
      
      console.log('🎬 Sesión iniciada para validación de mercado');
    }
  }, [isActive, userIdentity, currentAgent, trackConversionEventWrapper]);
  
  // Auto-tracking de actividad del usuario
  useEffect(() => {
    if (!enableAutoTracking || !isActive || !userIdentity) return;
    
    const handleUserActivity = () => {
      updateEngagementActivity();
    };
    
    // 🔥 OPTIMIZACIÓN: Solo eventos significativos (no scroll/mousemove)
    const events = ['click', 'keydown'];

    // Throttle agresivo para sesiones largas
    let throttleTimeout: NodeJS.Timeout | null = null;
    let lastActivityTime = 0;

    const throttledHandler = () => {
      const now = Date.now();
      // Ignorar eventos si ya hubo actividad en los últimos 10 segundos
      if (now - lastActivityTime < 10000) return;

      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          handleUserActivity();
          lastActivityTime = Date.now();
          throttleTimeout = null;
        }, 10000); // Throttle de 10 segundos
      }
    };

    events.forEach(event => {
      document.addEventListener(event, throttledHandler, { passive: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, throttledHandler);
      });
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [enableAutoTracking, isActive, userIdentity, updateEngagementActivity]);
  
  // Tracking automático de mensajes
  useEffect(() => {
    if (!enableAutoTracking) return;
    
    // Interceptar envío de mensajes (esto se integraría con el sistema de chat)
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // Detectar llamadas a la API de mensajes
      if (args[0]?.toString().includes('/api/send-message')) {
        messageCountRef.current += 1;
        
        // Actualizar métricas de activación
        if (messageCountRef.current === 1) {
          trackUserActivation({
            firstMessageSent: true,
            timeToFirstMessage: sessionStartRef.current 
              ? (Date.now() - sessionStartRef.current.getTime()) / 1000 
              : 0
          });
        }
        
        // Actualizar métricas de engagement
        updateEngagementActivity();
        
        // Trackear conversión de primer mensaje
        if (messageCountRef.current === 1) {
          trackConversionEventWrapper({
            eventType: EVENT_TYPES.CONVERSION.FIRST_MESSAGE,
            eventValue: 1
          });
        }
      }
      
      return response;
    };
    
    return () => {
      window.fetch = originalFetch;
    };
  }, [enableAutoTracking, trackUserActivation, updateEngagementActivity, trackConversionEventWrapper]);
  
  // Análisis periódico
  useEffect(() => {
    if (!enableAutoTracking || !userIdentity) return;
    
    const interval = setInterval(() => {
      refreshAnalysis();
      analyzeUserRetention();
    }, 60000); // Cada minuto
    
    return () => clearInterval(interval);
  }, [enableAutoTracking, userIdentity, refreshAnalysis, analyzeUserRetention]);
  
  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (engagementTimeoutRef.current) {
        clearTimeout(engagementTimeoutRef.current);
      }
      
      // Finalizar sesión
      if (sessionStartRef.current && userIdentity) {
        const sessionDuration = (Date.now() - sessionStartRef.current.getTime()) / 1000;
        
        trackConversionEventWrapper({
          eventType: EVENT_TYPES.SESSION.ENDED,
          eventValue: sessionDuration,
          metadata: {
            messageCount: messageCountRef.current,
            duration: sessionDuration
          }
        });
        
        console.log('🏁 Sesión finalizada:', {
          duration: sessionDuration,
          messages: messageCountRef.current
        });
      }
    };
  }, [userIdentity, trackConversionEventWrapper]);
  
  return {
    // Identificación
    userIdentity,
    identifyCurrentUser,
    
    // Activación
    activationMetrics,
    trackUserActivation,
    isUserActivated,
    
    // Engagement
    engagementMetrics,
    trackUserEngagement,
    updateEngagementActivity,
    
    // Valor
    valueMetrics,
    trackUserValue,
    
    // Retención
    retentionMetrics,
    analyzeUserRetention,
    
    // Conversiones
    trackConversionEvent: trackConversionEventWrapper,
    
    // Análisis
    userAnalysis,
    refreshAnalysis,
    
    // Utilidades
    getMarketValidationData,
    isHighValueUser,
    userSegment
  };
}

// Hook simplificado para casos básicos
export function useBasicMarketValidation(userId?: string) {
  return useMarketValidationMetrics({
    userId,
    enableAutoTracking: true,
    isActive: true
  });
}

// Hook para análisis de cohortes
export function useCohortAnalysis(cohortWeek: string) {
  const [cohortData, setCohortData] = useState(null);
  
  useEffect(() => {
    // Implementar análisis de cohorte
    // Esto se conectaría con el sistema de métricas para obtener datos de cohorte
  }, [cohortWeek]);
  
  return { cohortData };
}

export default useMarketValidationMetrics;