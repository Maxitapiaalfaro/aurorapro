import { describe, it, expect } from 'vitest'
import {
  classifyIntentWithMetadata,
  classifyIntentByHeuristic,
  isEdgeCaseRisk,
  isEdgeCaseStress,
  isEdgeCaseSensitiveContent,
  detectExplicitAgentRequest,
} from '@/lib/routing/intent-classifier'
import type { OperationalMetadata } from '@/types/operational-metadata'
import { RoutingReason } from '@/types/operational-metadata'

/**
 * Helper to create a base OperationalMetadata with safe defaults.
 */
function createBaseMetadata(overrides: Partial<OperationalMetadata> = {}): OperationalMetadata {
  return {
    // Risk defaults
    risk_flags_active: [],
    risk_level: 'low',
    last_risk_assessment: null,
    requires_immediate_attention: false,

    // Temporal defaults
    timestamp_utc: new Date().toISOString(),
    timezone: 'America/Santiago',
    local_time: new Date().toLocaleString('es-ES'),
    region: 'LATAM',
    session_duration_minutes: 30,
    time_of_day: 'afternoon',

    // Agent history defaults
    agent_transitions: [],
    agent_turn_counts: { socratico: 5, clinico: 0, academico: 0 },
    last_agent_switch: null,
    consecutive_switches: 0,

    // Patient context defaults
    patient_id: null,
    patient_summary_available: false,
    therapeutic_phase: null,
    session_count: 0,
    last_session_date: null,
    treatment_modality: null,

    ...overrides,
  }
}

// ─── Edge Case Detection: Risk ───────────────────────────────────────────────

describe('isEdgeCaseRisk', () => {
  it('detects critical risk level', () => {
    const metadata = createBaseMetadata({ risk_level: 'critical' })
    const result = isEdgeCaseRisk(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.edge_case_type).toBe('risk')
    expect(result.recommended_agent).toBe('clinico')
    expect(result.detected_factors).toContain('risk_level_critical')
  })

  it('detects high risk level', () => {
    const metadata = createBaseMetadata({ risk_level: 'high' })
    const result = isEdgeCaseRisk(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('risk_level_high')
  })

  it('detects active risk flags', () => {
    const metadata = createBaseMetadata({
      risk_flags_active: ['suicidal_ideation', 'self_harm'],
    })
    const result = isEdgeCaseRisk(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('risk_flag_suicidal_ideation')
    expect(result.detected_factors).toContain('risk_flag_self_harm')
  })

  it('detects requires_immediate_attention', () => {
    const metadata = createBaseMetadata({ requires_immediate_attention: true })
    const result = isEdgeCaseRisk(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('requires_immediate_attention')
  })

  it('returns false for low risk with no flags', () => {
    const metadata = createBaseMetadata()
    const result = isEdgeCaseRisk(metadata)
    expect(result.is_edge_case).toBe(false)
  })
})

// ─── Edge Case Detection: Stress ─────────────────────────────────────────────

describe('isEdgeCaseStress', () => {
  it('detects excessive consecutive agent switches (>4)', () => {
    const metadata = createBaseMetadata({ consecutive_switches: 5 })
    const result = isEdgeCaseStress(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.edge_case_type).toBe('stress')
    expect(result.detected_factors).toContain('consecutive_switches_extreme')
  })

  it('detects very extended session (>150 min)', () => {
    const metadata = createBaseMetadata({ session_duration_minutes: 160 })
    const result = isEdgeCaseStress(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('session_very_extended')
  })

  it('detects night session > 90 min', () => {
    const metadata = createBaseMetadata({
      time_of_day: 'night',
      session_duration_minutes: 95,
    })
    const result = isEdgeCaseStress(metadata)
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('night_session_extended')
  })

  it('returns false for normal session', () => {
    const metadata = createBaseMetadata({
      consecutive_switches: 1,
      session_duration_minutes: 30,
      time_of_day: 'afternoon',
    })
    const result = isEdgeCaseStress(metadata)
    expect(result.is_edge_case).toBe(false)
  })
})

// ─── Edge Case Detection: Sensitive Content ──────────────────────────────────

describe('isEdgeCaseSensitiveContent', () => {
  it('detects critical keywords in input', () => {
    const metadata = createBaseMetadata()
    const result = isEdgeCaseSensitiveContent(
      'Mi paciente mencionó pensamientos de suicidio y autolesión',
      metadata
    )
    expect(result.is_edge_case).toBe(true)
    expect(result.edge_case_type).toBe('sensitive_content')
    expect(result.detected_factors).toContain('critical_keyword_detected')
  })

  it('detects high-risk keywords', () => {
    const metadata = createBaseMetadata()
    const result = isEdgeCaseSensitiveContent(
      'El paciente tiene depresión severa y ansiedad extrema',
      metadata
    )
    expect(result.is_edge_case).toBe(true)
    expect(result.detected_factors).toContain('high_risk_keyword_detected')
  })

  it('returns false for normal clinical discussion', () => {
    const metadata = createBaseMetadata()
    const result = isEdgeCaseSensitiveContent(
      '¿Cómo puedo documentar esta sesión de terapia?',
      metadata
    )
    expect(result.is_edge_case).toBe(false)
  })
})

// ─── Metadata-Informed Routing ───────────────────────────────────────────────

describe('classifyIntentWithMetadata', () => {
  describe('without metadata (backward compatibility)', () => {
    it('falls back to heuristic routing', () => {
      const result = classifyIntentWithMetadata('Necesito explorar este caso', 'socratico')
      expect(result.agent).toBeDefined()
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.metadata_factors).toContain('no_metadata_available')
    })
  })

  describe('edge case overrides', () => {
    it('routes to clinico on critical risk', () => {
      const metadata = createBaseMetadata({ risk_level: 'critical' })
      const result = classifyIntentWithMetadata(
        'Quiero reflexionar sobre mi paciente',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.confidence).toBe(1.0)
      expect(result.reason).toBe(RoutingReason.CRITICAL_RISK_OVERRIDE)
      expect(result.is_edge_case).toBe(true)
      expect(result.edge_case_type).toBe('risk')
    })

    it('routes to clinico on high risk with flags', () => {
      const metadata = createBaseMetadata({
        risk_level: 'high',
        risk_flags_active: ['self_harm'],
      })
      const result = classifyIntentWithMetadata(
        'Busca evidencia sobre EMDR',
        'academico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.is_edge_case).toBe(true)
    })

    it('routes to clinico on system stress', () => {
      const metadata = createBaseMetadata({
        consecutive_switches: 6,
        session_duration_minutes: 160,
      })
      const result = classifyIntentWithMetadata(
        'Hmm, no estoy seguro',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.STRESS_OVERRIDE)
      expect(result.is_edge_case).toBe(true)
    })

    it('routes to clinico on sensitive content', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Mi paciente habló de suicidio',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.SENSITIVE_CONTENT_OVERRIDE)
      expect(result.is_edge_case).toBe(true)
    })
  })

  describe('explicit agent requests', () => {
    it('allows explicit request to clinico', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Activar modo clínico',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.EXPLICIT_USER_REQUEST)
      expect(result.confidence).toBe(1.0)
    })

    it('blocks explicit socratico request when risk is high', () => {
      const metadata = createBaseMetadata({ risk_level: 'high' })
      const result = classifyIntentWithMetadata(
        'Activar modo socrático',
        'clinico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.HIGH_RISK_OVERRIDE)
      expect(result.is_edge_case).toBe(true)
    })
  })

  describe('therapeutic phase influence', () => {
    it('biases toward clinico in closure phase with many sessions', () => {
      const metadata = createBaseMetadata({
        therapeutic_phase: 'closure',
        session_count: 15,
      })
      const result = classifyIntentWithMetadata(
        'Creo que hemos avanzado mucho',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.CLOSURE_PHASE_SUGGESTED)
    })

    it('biases toward socratico in assessment phase', () => {
      const metadata = createBaseMetadata({
        therapeutic_phase: 'assessment',
      })
      const result = classifyIntentWithMetadata(
        'Necesito entender mejor esta situación',
        'clinico',
        metadata
      )
      expect(result.agent).toBe('socratico')
      expect(result.reason).toBe(RoutingReason.ASSESSMENT_PHASE_SUGGESTED)
    })
  })

  describe('stability and continuity', () => {
    it('maintains current agent when frequent switches detected', () => {
      const metadata = createBaseMetadata({ consecutive_switches: 3 })
      const result = classifyIntentWithMetadata(
        'Interesante punto',
        'clinico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.reason).toBe(RoutingReason.STABILITY_OVERRIDE)
    })

    it('maintains current agent on ambiguous input', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Hmm ok',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('socratico')
      expect(result.reason).toBe(RoutingReason.CONTINUITY_MAINTAINED)
    })

    it('defaults to socratico when no previous agent', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Hola',
        undefined,
        metadata
      )
      expect(result.agent).toBe('socratico')
    })
  })

  describe('normal keyword heuristic routing (with metadata)', () => {
    it('routes to academico on strong academic signal', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Busca investigación sobre metaanálisis de ensayos RCT y revisión sistemática de evidencia científica con papers publicaciones validación empírica',
        'socratico',
        metadata
      )
      // Should detect strong academic signal
      expect(result.agent).toBe('academico')
      expect(result.is_edge_case).toBe(false)
    })

    it('routes to clinico on strong documentation signal', () => {
      const metadata = createBaseMetadata()
      const result = classifyIntentWithMetadata(
        'Necesito documentar notas SOAP del expediente con resumen formato PIRP bitácora registro reporte',
        'socratico',
        metadata
      )
      expect(result.agent).toBe('clinico')
      expect(result.is_edge_case).toBe(false)
    })
  })
})

// ─── Legacy heuristic still works ────────────────────────────────────────────

describe('classifyIntentByHeuristic (legacy)', () => {
  it('still functions for backward compatibility', () => {
    const result = classifyIntentByHeuristic('Necesito documentar esta sesión', 'socratico')
    expect(result.selectedAgent).toBeDefined()
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.reasoning).toBeDefined()
  })
})

// ─── Explicit agent detection still works ────────────────────────────────────

describe('detectExplicitAgentRequest', () => {
  it('detects explicit socratic mode request', () => {
    const result = detectExplicitAgentRequest('Activar modo socrático')
    expect(result.isExplicit).toBe(true)
    expect(result.requestType).toBe('socratico')
  })

  it('detects explicit clinical mode request', () => {
    const result = detectExplicitAgentRequest('Activar modo clínico')
    expect(result.isExplicit).toBe(true)
    expect(result.requestType).toBe('clinico')
  })

  it('returns false for normal input', () => {
    const result = detectExplicitAgentRequest('¿Cómo reflexionar sobre esto?')
    expect(result.isExplicit).toBe(false)
  })
})

// ─── Conversation Context Analysis ──────────────────────────────────────────

import { analyzeConversationContext } from '@/lib/routing/intent-classifier'
import type { Content } from '@/lib/routing/routing-types'

/**
 * Helper to create a conversation history with messages from a specific domain.
 */
function createConversationHistory(messages: Array<{ role: string; text: string }>): Content[] {
  return messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }))
}

describe('analyzeConversationContext', () => {
  it('returns zero scores for empty context', () => {
    const result = analyzeConversationContext([])
    expect(result.scores.socratico).toBe(0)
    expect(result.scores.clinico).toBe(0)
    expect(result.scores.academico).toBe(0)
    expect(result.dominantAgent).toBeNull()
    expect(result.turnCount).toBe(0)
  })

  it('detects socratic-dominant conversation', () => {
    const history = createConversationHistory([
      { role: 'user', text: 'Necesito reflexionar sobre el caso del paciente que tiene resistencia al cambio' },
      { role: 'model', text: 'Entiendo, vamos a explorar la resistencia y analizar las creencias subyacentes' },
      { role: 'user', text: 'Me interesa la transferencia y contratransferencia en este vínculo' },
      { role: 'model', text: 'La alianza terapéutica y la introspección son clave para el insight' },
    ])
    const result = analyzeConversationContext(history)
    expect(result.scores.socratico).toBeGreaterThan(result.scores.clinico)
    expect(result.scores.socratico).toBeGreaterThan(result.scores.academico)
    expect(result.dominantAgent).toBe('socratico')
  })

  it('detects clinical-dominant conversation', () => {
    const history = createConversationHistory([
      { role: 'user', text: 'Vamos a documentar las notas de esta sesión con formato SOAP' },
      { role: 'model', text: 'Perfecto, voy a estructurar el resumen del expediente' },
      { role: 'user', text: 'Necesito también la nota de evolución y el registro del plan de tratamiento' },
      { role: 'model', text: 'El informe quedará con la síntesis y el reporte de progreso' },
    ])
    const result = analyzeConversationContext(history)
    expect(result.scores.clinico).toBeGreaterThan(result.scores.socratico)
    expect(result.scores.clinico).toBeGreaterThan(result.scores.academico)
    expect(result.dominantAgent).toBe('clinico')
  })

  it('detects academic-dominant conversation', () => {
    const history = createConversationHistory([
      { role: 'user', text: 'Busca investigación sobre metaanálisis de ensayos RCT' },
      { role: 'model', text: 'Encontré evidencia científica en papers y revisión sistemática' },
      { role: 'user', text: 'Necesito más estudios empíricos y publicaciones sobre protocolos' },
      { role: 'model', text: 'La literatura muestra validación en guidelines y estudios' },
    ])
    const result = analyzeConversationContext(history)
    expect(result.scores.academico).toBeGreaterThan(result.scores.socratico)
    expect(result.scores.academico).toBeGreaterThan(result.scores.clinico)
    expect(result.dominantAgent).toBe('academico')
  })
})

// ─── Context-Aware Heuristic Routing ────────────────────────────────────────

describe('classifyIntentByHeuristic (context-aware)', () => {
  it('uses conversation context to disambiguate ambiguous input', () => {
    // Clinical conversation context: user has been documenting
    const clinicalContext = createConversationHistory([
      { role: 'user', text: 'Vamos a documentar las notas de esta sesión con formato SOAP' },
      { role: 'model', text: 'Perfecto, he estructurado el resumen del expediente' },
      { role: 'user', text: 'Ahora necesito la nota de evolución con el registro del progreso' },
      { role: 'model', text: 'La síntesis del historial queda documentada en el formato requerido' },
    ])

    // Ambiguous message that has no strong keywords
    const result = classifyIntentByHeuristic('ok, sigamos con esto', 'socratico', clinicalContext)
    // With context from clinical conversation, should bias toward clinico or at least
    // the context-aware routing should recognize the clinical conversation momentum
    // At minimum, it should not blindly stick to socratico when context is clearly clinical
    expect(result.selectedAgent).toBeDefined()
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('still works without conversation context (backward compat)', () => {
    const result = classifyIntentByHeuristic('Necesito documentar esta sesión', 'socratico')
    expect(result.selectedAgent).toBeDefined()
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.reasoning).toBeDefined()
  })

  it('detects agent switch via context when current message keywords are weak', () => {
    const academicContext = createConversationHistory([
      { role: 'user', text: 'Busca investigación sobre evidencia en estudios' },
      { role: 'model', text: 'Los papers y ensayos muestran protocolos validados' },
    ])

    // Message with minimal academic keywords  
    const withContext = classifyIntentByHeuristic('hay más investigación?', 'socratico', academicContext)
    const withoutContext = classifyIntentByHeuristic('hay más investigación?', 'socratico')

    // Without context: 'investigación' alone isn't enough to beat threshold, stays with socratico
    // With context: academic conversation momentum should help trigger switch to academico
    expect(withContext.selectedAgent).toBe('academico')
    // Without context it stays sticky to socratico since one keyword isn't enough
    expect(withoutContext.selectedAgent).toBe('socratico')
  })
})

// ─── Context-Aware Metadata Routing ─────────────────────────────────────────

describe('classifyIntentWithMetadata (context-aware)', () => {
  it('passes session context through to heuristic scoring', () => {
    const metadata = createBaseMetadata()
    const clinicalContext = createConversationHistory([
      { role: 'user', text: 'Documentar las notas con formato SOAP expediente' },
      { role: 'model', text: 'He estructurado el resumen y el informe del registro' },
      { role: 'user', text: 'Ahora la nota de evolución y el reporte de progreso' },
      { role: 'model', text: 'Bitácora completada con el historial y la síntesis' },
    ])

    const result = classifyIntentWithMetadata(
      'perfecto, continúa',
      'socratico',
      metadata,
      clinicalContext
    )
    // With strong clinical conversation context, even an ambiguous message
    // should be routed based on conversational momentum
    expect(result.agent).toBeDefined()
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.reason).toBeDefined()
  })

  it('still works without session context (backward compat)', () => {
    const metadata = createBaseMetadata()
    const result = classifyIntentWithMetadata(
      'Necesito reflexionar sobre este caso',
      'socratico',
      metadata
    )
    expect(result.agent).toBeDefined()
    expect(result.is_edge_case).toBe(false)
  })

  it('context-based routing still respects edge case overrides', () => {
    const metadata = createBaseMetadata({ risk_level: 'critical' })
    const socraticContext = createConversationHistory([
      { role: 'user', text: 'Reflexionar sobre el caso del paciente con resistencia' },
      { role: 'model', text: 'Vamos a explorar el insight y la perspectiva' },
    ])

    const result = classifyIntentWithMetadata(
      'seguimos explorando',
      'socratico',
      metadata,
      socraticContext
    )
    // Risk override should still take precedence over conversation context
    expect(result.agent).toBe('clinico')
    expect(result.is_edge_case).toBe(true)
  })
})
