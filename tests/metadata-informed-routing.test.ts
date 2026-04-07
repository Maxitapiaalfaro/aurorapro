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
