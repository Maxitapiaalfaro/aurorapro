/**
 * Tipos y interfaces para el sistema mejorado de métricas
 * Enfocado en validación de mercado y adopción de usuario
 */

export type UserType = 'new' | 'returning' | 'anonymous';
export type UserSource = 'organic' | 'referral' | 'direct' | 'social' | 'search';
export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type UsageFrequency = 'daily' | 'weekly' | 'monthly' | 'sporadic';
export type AgentType = 'socratico' | 'clinico' | 'academico';

// Identidad de usuario mejorada
export interface UserIdentity {
  userId: string;           // ID único persistente
  sessionId: string;        // ID de sesión actual
  fingerprint: string;      // Huella digital del dispositivo
  userType: UserType;
  source: UserSource;
  deviceType: DeviceType;
  firstSeen: Date;
  lastSeen: Date;
  totalSessions: number;
  location?: {
    country?: string;
    region?: string;
    timezone?: string;
  };
}

// Métricas de activación
export interface ActivationMetrics {
  userId: string;
  sessionId: string;
  firstMessageSent: boolean;
  firstAgentSwitch: boolean;
  sessionDuration: number;
  messagesInFirstSession: number;
  timeToFirstMessage: number;     // Tiempo desde llegada hasta primer mensaje
  completedOnboarding: boolean;
  activationScore: number;        // Score compuesto 0-100
  activationTimestamp?: Date;
}

// Métricas de engagement profundo
export interface EngagementMetrics {
  userId: string;
  sessionId: string;
  
  // Intensidad de uso
  messagesPerSession: number;
  averageSessionDuration: number;
  sessionsPerWeek: number;
  
  // Calidad de interacción
  averageMessageLength: number;
  conversationDepth: number;      // Número de intercambios por conversación
  agentDiversity: number;         // Cuántos agentes diferentes usa
  
  // Patrones de uso
  preferredAgent: AgentType;
  peakUsageHours: number[];
  usageFrequency: UsageFrequency;
  
  // Score compuesto
  engagementScore: number;        // 0-100
  lastEngagementUpdate: Date;
}

// Métricas de valor percibido
export interface ValueMetrics {
  userId: string;
  
  // Indicadores de satisfacción
  longConversations: number;      // Conversaciones >10 mensajes
  repeatUsage: number;            // Sesiones en días consecutivos
  featureAdoption: {
    agentSwitching: boolean;
    longFormQuestions: boolean;
    multipleTopics: boolean;
    advancedFeatures: boolean;
  };
  
  // Indicadores de problema resuelto
  sessionCompletionRate: number;  // % sesiones que terminan "naturalmente"
  averageResponseSatisfaction: number; // Basado en comportamiento
  valueScore: number;             // Score compuesto 0-100
}

// Métricas de retención
export interface RetentionMetrics {
  userId: string;
  cohortWeek: string;             // Semana de primer uso (YYYY-WW)
  
  // Retención por período
  day1Retention: boolean;
  day7Retention: boolean;
  day30Retention: boolean;
  
  // Actividad
  isWeeklyActive: boolean;
  isMonthlyActive: boolean;
  
  // Estado
  isChurned: boolean;
  churnDate?: Date;
  isReactivated: boolean;
  reactivationDate?: Date;
  daysSinceLastActivity: number;
}

// Métricas de crecimiento
export interface GrowthMetrics {
  period: string;                 // YYYY-WW
  
  // Crecimiento de base de usuarios
  newUsers: number;
  returningUsers: number;
  totalActiveUsers: number;
  userGrowthRate: number;         // % crecimiento vs período anterior
  
  // Viralidad y referidos
  organicUsers: number;
  referredUsers: number;
  referralRate: number;
  
  // Expansión de uso
  usageExpansion: number;         // Usuarios que aumentan su uso
  featureAdoptionRate: number;
}

// Métricas de Product-Market Fit
export interface ProductMarketFitMetrics {
  period: string;
  
  // Indicadores de PMF
  organicGrowthRate: number;
  netPromoterScore: number;       // Basado en comportamiento
  productUsageIntensity: number;
  retentionStrength: number;
  
  // Validación de features
  featureUsageDistribution: Record<string, number>;
  mostValuedFeatures: string[];
  abandonedFeatures: string[];
  
  // Score compuesto
  pmfScore: number;               // 0-100
}

// Métricas de conversión
export interface ConversionMetrics {
  period: string;
  
  // Funnel de conversión
  visitors: number;
  firstTimeUsers: number;
  activeUsers: number;
  engagedUsers: number;
  
  // Tasas de conversión
  visitorToUser: number;          // % visitantes que envían mensaje
  userToActive: number;           // % usuarios que tienen >1 sesión
  activeToEngaged: number;        // % usuarios activos que se enganchan
  
  // Tiempo hasta conversión
  averageTimeToActivation: number;
  averageTimeToEngagement: number;
}

// Evento de conversión
export interface ConversionEvent {
  userId: string;
  sessionId: string;
  eventType: string;
  eventValue?: number;
  metadata: Record<string, any>;
  timestamp: Date;
}

// Segmento de usuario
export interface UserSegment {
  segmentId: string;
  name: string;
  description: string;
  criteria: {
    userType?: UserType[];
    source?: UserSource[];
    engagementScore?: { min?: number; max?: number };
    retentionDays?: { min?: number; max?: number };
    sessionsCount?: { min?: number; max?: number };
  };
  userCount: number;
  averageMetrics: {
    engagementScore: number;
    retentionRate: number;
    sessionDuration: number;
    messagesPerSession: number;
  };
}

// Datos de cohorte
export interface CohortData {
  cohortWeek: string;
  initialSize: number;
  retentionByWeek: Record<string, number>; // semana -> % retención
  averageEngagement: number;
  averageLifetimeValue: number;
}

// Insight de negocio
export interface BusinessInsight {
  id: string;
  type: 'opportunity' | 'warning' | 'success' | 'info';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  recommendedActions?: string[];
  metrics: Record<string, number>;
  timestamp: Date;
}

// Configuración de alertas
export interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  condition: 'above' | 'below' | 'change';
  threshold: number;
  period: 'hour' | 'day' | 'week';
  enabled: boolean;
  recipients: string[];
}

// Resultado de análisis
export interface AnalysisResult {
  period: string;
  userIdentity: UserIdentity;
  activation: ActivationMetrics;
  engagement: EngagementMetrics;
  value: ValueMetrics;
  retention: RetentionMetrics;
  conversions: ConversionEvent[];
  segment: UserSegment;
  insights: BusinessInsight[];
  recommendations: string[];
}

// Datos de validación de mercado
export interface MarketValidationData {
  userIdentity: UserIdentity | null;
  activationScore: number;
  engagementScore: number;
  valueScore: number;
  retentionStatus: 'active' | 'at_risk' | 'churned';
  conversionEvents: number;
  recommendations: string[];
}

// Configuración del tracker mejorado
export interface EnhancedTrackerConfig {
  enableUserIdentification: boolean;
  enableEngagementTracking: boolean;
  enableRetentionAnalysis: boolean;
  enableConversionTracking: boolean;
  enableBusinessInsights: boolean;
  
  // Configuraciones específicas
  activationThresholds: {
    minMessages: number;
    minSessionDuration: number;
    maxTimeToFirstMessage: number;
  };
  
  engagementThresholds: {
    highEngagement: number;
    mediumEngagement: number;
    lowEngagement: number;
  };
  
  retentionPeriods: {
    shortTerm: number;  // días
    mediumTerm: number; // días
    longTerm: number;   // días
  };
}

// Exportar tipos de utilidad
export type MetricValue = number | string | boolean | Date;
export type MetricTags = Record<string, string>;
export type MetricData = Record<string, MetricValue>;

// Constantes útiles
export const DEFAULT_THRESHOLDS = {
  ACTIVATION: {
    MIN_MESSAGES: 3,
    MIN_SESSION_DURATION: 120, // 2 minutos
    MAX_TIME_TO_FIRST_MESSAGE: 300 // 5 minutos
  },
  ENGAGEMENT: {
    HIGH: 80,
    MEDIUM: 50,
    LOW: 20
  },
  RETENTION: {
    SHORT_TERM: 7,   // 7 días
    MEDIUM_TERM: 30, // 30 días
    LONG_TERM: 90    // 90 días
  },
  PMF: {
    EXCELLENT: 80,
    GOOD: 60,
    NEEDS_IMPROVEMENT: 40
  }
} as const;

// Scores específicos para validación
export const ACTIVATION_SCORE = 70;
export const ENGAGEMENT_SCORE = 60;
export const VALUE_SCORE = 50;
export const RETENTION_DAYS = 30;

// Tipos de eventos para tracking
export const EVENT_TYPES = {
  USER: {
    IDENTIFIED: 'user.identified',
    ACTIVATED: 'user.activated',
    ENGAGED: 'user.engaged',
    CHURNED: 'user.churned',
    REACTIVATED: 'user.reactivated'
  },
  SESSION: {
    STARTED: 'session.started',
    ENDED: 'session.ended',
    EXTENDED: 'session.extended'
  },
  MESSAGE: {
    SENT: 'message.sent',
    RECEIVED: 'message.received',
    LONG_FORM: 'message.long_form'
  },
  AGENT: {
    SWITCHED: 'agent.switched',
    PREFERRED: 'agent.preferred'
  },
  CONVERSION: {
    FIRST_MESSAGE: 'conversion.first_message',
    FIRST_SESSION: 'conversion.first_session',
    ACTIVATION: 'conversion.activation',
    ENGAGEMENT: 'conversion.engagement'
  }
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES][keyof typeof EVENT_TYPES[keyof typeof EVENT_TYPES]];