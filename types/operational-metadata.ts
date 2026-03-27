/**
 * Operational Metadata Types
 * 
 * Metadata operativa que informa las decisiones del router inteligente.
 * Esta metadata NO es un delivery pasivo - el router la usa activamente
 * para detectar casos límite y tomar decisiones de routing informadas.
 * 
 * @author David Tapia
 * @version 1.0.0
 */

import { AgentType } from './clinical-types';

/**
 * Metadata de Riesgo Clínico
 * Informa decisiones de routing para casos de riesgo
 */
export interface RiskMetadata {
  risk_flags_active: string[];           // ['suicidal_ideation', 'self_harm', 'violence', etc.]
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  last_risk_assessment: Date | null;
  requires_immediate_attention: boolean;
}

/**
 * Metadata Temporal y Regional
 * Informa decisiones basadas en contexto temporal y geográfico
 */
export interface TemporalMetadata {
  timestamp_utc: string;                 // ISO 8601 format
  timezone: string;                      // IANA timezone (e.g., 'America/Santiago')
  local_time: string;                    // Formatted local time
  region: 'LATAM' | 'EU' | 'US' | 'ASIA' | 'OTHER';
  session_duration_minutes: number;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
}

/**
 * Metadata de Historial de Agentes
 * Informa decisiones para prevenir ping-pong y mantener continuidad
 */
export interface AgentHistoryMetadata {
  agent_transitions: Array<{
    from: AgentType;
    to: AgentType;
    timestamp: Date;
    reason: string;
  }>;
  agent_turn_counts: Record<AgentType, number>;
  last_agent_switch: Date | null;
  consecutive_switches: number;          // Switches en últimos 5 minutos
}

/**
 * Metadata de Contexto de Paciente
 * Informa decisiones basadas en fase terapéutica y modalidad
 */
export interface PatientContextMetadata {
  patient_id: string | null;
  patient_summary_available: boolean;
  therapeutic_phase: 'assessment' | 'intervention' | 'maintenance' | 'closure' | null;
  session_count: number;
  last_session_date: Date | null;
  treatment_modality: string | null;     // 'CBT', 'Psychodynamic', 'Humanistic', etc.
}

/**
 * Estado de Riesgo de la Sesión
 * Mantiene el contexto de riesgo a través de múltiples turnos
 */
export interface SessionRiskState {
  isRiskSession: boolean;           // Si la sesión tiene contenido de riesgo
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;                 // Cuándo se detectó el riesgo
  riskType?: 'risk' | 'stress' | 'sensitive_content';
  lastRiskCheck: Date;              // Última vez que se verificó el riesgo
  consecutiveSafeTurns: number;     // Turnos consecutivos sin contenido de riesgo
}

/**
 * Metadata Operativa Completa
 * Combina todas las categorías de metadata para decisiones de routing
 */
export interface OperationalMetadata extends
  RiskMetadata,
  TemporalMetadata,
  AgentHistoryMetadata,
  PatientContextMetadata {
  // 🚨 RISK STATE: Estado de riesgo persistente de la sesión
  session_risk_state?: SessionRiskState;
}

/**
 * Decisión de Routing con Justificación
 * Resultado de routing que incluye metadata y razón de la decisión
 */
export interface RoutingDecision {
  agent: AgentType;
  confidence: number;
  reason: string;
  metadata_factors: string[];            // Factores de metadata que influyeron en la decisión
  is_edge_case: boolean;                 // Si fue detectado como caso límite
  edge_case_type?: 'risk' | 'stress' | 'sensitive_content';
}

/**
 * Razones de Routing (para tracking y transparencia)
 */
export enum RoutingReason {
  // Overrides por casos límite
  CRITICAL_RISK_OVERRIDE = 'CRITICAL_RISK_OVERRIDE_ROBUST_AGENT',
  HIGH_RISK_OVERRIDE = 'HIGH_RISK_OVERRIDE_ROBUST_AGENT',
  STRESS_OVERRIDE = 'EDGE_CASE_STRESS_DETECTED',
  SENSITIVE_CONTENT_OVERRIDE = 'EDGE_CASE_SENSITIVE_CONTENT_DETECTED',
  
  // Clasificación normal
  NORMAL_CLASSIFICATION = 'NORMAL_CLASSIFICATION',
  HIGH_CONFIDENCE_CLASSIFICATION = 'HIGH_CONFIDENCE_CLASSIFICATION',
  
  // Fallbacks
  FALLBACK_LOW_CONFIDENCE = 'FALLBACK_LOW_CONFIDENCE',
  FALLBACK_AMBIGUOUS_QUERY = 'FALLBACK_AMBIGUOUS_QUERY',
  FALLBACK_ERROR = 'FALLBACK_ERROR',
  
  // Continuidad
  STABILITY_OVERRIDE = 'STABILITY_OVERRIDE_FREQUENT_SWITCHES',
  CONTINUITY_MAINTAINED = 'CONTINUITY_MAINTAINED',
  
  // Fase terapéutica
  CLOSURE_PHASE_SUGGESTED = 'CLOSURE_PHASE_DOCUMENTATION_SUGGESTED',
  ASSESSMENT_PHASE_SUGGESTED = 'ASSESSMENT_PHASE_EXPLORATION_SUGGESTED',
  
  // Explícito
  EXPLICIT_USER_REQUEST = 'EXPLICIT_USER_REQUEST'
}

/**
 * Configuración de Detección de Casos Límite
 */
export interface EdgeCaseDetectionConfig {
  // Umbrales de riesgo
  risk: {
    critical_keywords: string[];
    high_risk_keywords: string[];
    require_context_for_detection: boolean;  // Si requiere risk_flags además de keywords
  };
  
  // Umbrales de estrés
  stress: {
    max_consecutive_switches: number;        // Default: 4
    max_session_duration_minutes: number;    // Default: 150
    night_session_threshold_minutes: number; // Default: 90
  };
  
  // Umbrales de confianza
  confidence: {
    high_confidence_threshold: number;       // Default: 0.75
    low_confidence_threshold: number;        // Default: 0.50
    ambiguous_threshold: number;             // Default: 0.60
  };
}

/**
 * Configuración por defecto para detección de casos límite
 */
export const DEFAULT_EDGE_CASE_CONFIG: EdgeCaseDetectionConfig = {
  risk: {
    critical_keywords: [
      // Riesgo suicida
      'suicidio', 'suicida', 'matarme', 'acabar con mi vida', 'quitarme la vida',
      // Autolesiones
      'autolesión', 'autolesiones', 'cortarme', 'hacerme daño', 'lastimarme',
      // Violencia y maltrato
      'abuso', 'violencia', 'maltrato', 'agresión', 'golpe', 'golpear', 'pegar', 'pegó',
      'maltrato infantil', 'abuso infantil', 'violencia doméstica', 'violencia intrafamiliar',
      'golpear a un niño', 'golpear a su hijo', 'pegar a un niño', 'pegar a su hijo',
      'le pegó a su hijo', 'le pego a su hijo', 'se le pegó', 'se le pego',
      // Crisis
      'crisis', 'emergencia', 'urgente', 'inmediato',
      // Obligación de informar
      'no quiero informar', 'no informar', 'ocultar', 'no reportar'
    ],
    high_risk_keywords: [
      'depresión severa', 'ansiedad extrema', 'pánico', 'trauma',
      'adicción', 'consumo', 'sustancias', 'alcohol',
      'trastorno alimentario', 'anorexia', 'bulimia'
    ],
    require_context_for_detection: false  // CAMBIO CRÍTICO: No requiere contexto de paciente
  },
  stress: {
    max_consecutive_switches: 4,
    max_session_duration_minutes: 150,
    night_session_threshold_minutes: 90
  },
  confidence: {
    high_confidence_threshold: 0.75,
    low_confidence_threshold: 0.50,
    ambiguous_threshold: 0.60
  }
};

/**
 * Helper type para tracking de transiciones de agente
 */
export interface AgentTransition {
  from: AgentType;
  to: AgentType;
  timestamp: Date;
  reason: string;
  user_input?: string;
  confidence?: number;
}

/**
 * Contexto enriquecido con metadata operativa
 * Extiende EnrichedContext con metadata operativa y decisión de routing
 */
export interface EnrichedContextWithMetadata {
  // Campos originales de EnrichedContext
  originalQuery: string;
  detectedIntent: string;
  extractedEntities: any[];
  entityExtractionResult: any;
  sessionHistory: any[];
  previousAgent?: string;
  transitionReason: string;
  confidence: number;
  
  // Patient context
  patient_reference?: string;
  patient_summary?: string;
  sessionFiles?: any[];
  currentMessage?: string;
  conversationHistory?: any[];
  activeAgent?: string;
  clinicalMode?: string;
  sessionMetadata?: any;
  
  // NUEVO: Metadata operativa
  operationalMetadata: OperationalMetadata;
  
  // NUEVO: Decisión de routing con justificación
  routing_decision: RoutingDecision;
}

/**
 * Resultado de detección de caso límite
 */
export interface EdgeCaseDetectionResult {
  is_edge_case: boolean;
  edge_case_type?: 'risk' | 'stress' | 'sensitive_content';
  detected_factors: string[];
  recommended_agent: AgentType;
  confidence: number;
  reasoning: string;
}

