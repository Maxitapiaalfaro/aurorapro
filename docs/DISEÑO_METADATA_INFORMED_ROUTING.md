# Diseño Técnico: Metadata-Informed Routing
## Arquitectura donde el Router Decide CON Metadata, No Solo la Pasa

**Fecha:** 2025-10-24  
**Autor:** David Tapia  
**Estado:** Propuesta de Diseño

---

## 🎯 Principio Fundamental

> **La metadata no es un delivery pasivo. Es el contexto operativo que INFORMA las decisiones del router, y luego se pasa a los agentes como justificación de la decisión tomada.**

---

## 1. Arquitectura Actual vs. Propuesta

### ❌ **Arquitectura Actual (Incorrecta)**
```
User Input → Router (clasifica intención) → Agente
                ↓
         (metadata ignorada)
```

### ✅ **Arquitectura Propuesta (Correcta)**
```
User Input + Metadata → Router (decide CON metadata) → 
  → Decisión enriquecida + Metadata relevante + Justificación → Agente
```

---

## 2. Metadata Operativa que Debe Informar Decisiones

### **A. Metadata de Riesgo Clínico**

```typescript
interface RiskMetadata {
  risk_flags_active: string[];           // ['suicidal_ideation', 'self_harm']
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  last_risk_assessment: Date;
  requires_immediate_attention: boolean;
}
```

**Cómo informa decisiones del router:**

1. **Priorización de agente (ACTUALIZADO):**
   - Si `risk_level === 'critical'` → Forzar **Especialista en Documentación (clínico)**
   - Razón: Es el agente más robusto, restrictivo, y mejor manejo de casos límite
   - Si `risk_flags_active.includes('suicidal_ideation')` → NUNCA enrutar a Académico
   - Socraático NO es apropiado para riesgo crítico (condescendiente, sesgado)

2. **Modificación de confianza:**
   - Si hay risk flags activos → Aumentar umbral de confianza de 0.7 a 0.85
   - Evitar transiciones de agente en casos de riesgo
   - Bloquear cambios a socratico en casos de riesgo alto/crítico

3. **Contexto de seguridad:**
   - Inyectar advertencia de seguridad en el prompt del router
   - Sesgar clasificación hacia documentación estructurada (clínico) vs. exploración reflexiva (socratico)
   - El agente clínico puede redirigir explícitamente si detecta necesidad de otro agente

**Ejemplo de decisión informada (CORREGIDO):**
```typescript
// En routeUserInput()
if (riskMetadata.risk_level === 'critical') {
  console.log('⚠️ CRITICAL RISK: Forcing Especialista en Documentación (most robust agent)');
  return {
    targetAgent: 'clinico', // CAMBIO: Clínico, no socratico
    enrichedContext: {
      ...baseContext,
      routing_reason: 'CRITICAL_RISK_OVERRIDE_ROBUST_AGENT',
      risk_context: riskMetadata,
      agent_selection_rationale: 'Clínico seleccionado por ser el agente más robusto y restrictivo para casos límite'
    },
    confidence: 1.0 // Confianza máxima en override de seguridad
  };
}

// Prevenir socratico en casos de riesgo
if (riskMetadata.risk_level === 'high' || riskMetadata.risk_level === 'critical') {
  if (classificationResult.agent === 'socratico') {
    console.log('⚠️ HIGH RISK: Overriding socratico → clinico (more robust)');
    classificationResult.agent = 'clinico';
    classificationResult.reason = 'RISK_OVERRIDE_ROBUST_AGENT';
  }
}
```

---

### **B. Metadata Temporal y Regional**

```typescript
interface TemporalMetadata {
  timestamp_utc: string;
  timezone: string;
  local_time: string;
  region: 'LATAM' | 'EU' | 'US' | 'ASIA';
  session_duration_minutes: number;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
}
```

**Cómo informa decisiones del router:**

1. **Sesgo regional:**
   - Si `region === 'LATAM'` → Priorizar terminología latinoamericana en clasificación
   - Ajustar ejemplos de few-shot según región

2. **Contexto de urgencia:**
   - Si `time_of_day === 'night'` + `session_duration_minutes > 60` → Sesgar hacia Clínico (documentar y cerrar)
   - Si `session_duration_minutes < 5` → Aumentar umbral de confianza (evitar cambios prematuros)

3. **Información temporal para el modelo:**
   - El router puede decidir si una consulta como "¿qué hora es?" debe responderse directamente
   - Contexto temporal ayuda a interpretar referencias como "esta mañana", "ayer"

**Ejemplo de decisión informada:**
```typescript
// En buildContextualPrompt()
const temporalContext = `
**CONTEXTO TEMPORAL:**
Hora local: ${temporalMetadata.local_time} (${temporalMetadata.timezone})
Región: ${temporalMetadata.region}
Duración de sesión: ${temporalMetadata.session_duration_minutes} minutos

${temporalMetadata.session_duration_minutes > 90 ? 
  '⚠️ SESIÓN EXTENDIDA: Considera si el usuario necesita cerrar/documentar.' : ''}
`;
```

---

### **C. Metadata de Historial de Agentes**

```typescript
interface AgentHistoryMetadata {
  agent_transitions: Array<{
    from: AgentType;
    to: AgentType;
    timestamp: Date;
    reason: string;
  }>;
  agent_turn_counts: Record<AgentType, number>;
  last_agent_switch: Date | null;
  consecutive_switches: number;
}
```

**Cómo informa decisiones del router:**

1. **Prevención de ping-pong:**
   - Si `consecutive_switches > 2` en últimos 5 minutos → Aumentar umbral de confianza a 0.9
   - Si último switch fue hace <2 minutos → Penalizar cambio de agente

2. **Balance de especialización:**
   - Si `agent_turn_counts.socratico > 10` y `agent_turn_counts.clinico === 0` → Sugerir documentación
   - Detectar patrones de uso y adaptar clasificación

3. **Continuidad terapéutica:**
   - Si agente actual es socratico y está en medio de exploración → Sesgar hacia mantener agente

**Ejemplo de decisión informada:**
```typescript
// En calculateCombinedConfidence()
if (agentHistory.consecutive_switches > 2) {
  const switchPenalty = 0.15;
  combinedConfidence -= switchPenalty;
  console.log(`⚠️ Penalización por switches frecuentes: -${switchPenalty}`);
}

if (agentHistory.last_agent_switch && 
    (Date.now() - agentHistory.last_agent_switch.getTime()) < 120000) {
  const recencyPenalty = 0.1;
  combinedConfidence -= recencyPenalty;
  console.log(`⚠️ Switch reciente detectado: -${recencyPenalty}`);
}
```

---

### **D. Metadata de Contexto de Paciente**

```typescript
interface PatientContextMetadata {
  patient_id: string | null;
  patient_summary_available: boolean;
  therapeutic_phase: 'assessment' | 'intervention' | 'maintenance' | 'closure';
  session_count: number;
  last_session_date: Date | null;
  treatment_modality: string | null; // 'CBT', 'Psychodynamic', etc.
}
```

**Cómo informa decisiones del router:**

1. **Fase terapéutica:**
   - Si `therapeutic_phase === 'assessment'` → Sesgar hacia Supervisor Clínico
   - Si `therapeutic_phase === 'closure'` → Sesgar hacia Especialista en Documentación

2. **Continuidad de caso:**
   - Si `session_count > 10` → El router sabe que hay historial rico
   - Si `last_session_date` fue hace >30 días → Priorizar revisión de contexto

3. **Modalidad de tratamiento:**
   - Si `treatment_modality === 'CBT'` → Sesgar hacia evidencia académica cuando se mencionen técnicas
   - Si `treatment_modality === 'Psychodynamic'` → Sesgar hacia exploración reflexiva

**Ejemplo de decisión informada:**
```typescript
// En buildContextualPrompt() - METADATA NEUTRAL, NO SESGADA
if (patientContext.therapeutic_phase === 'assessment') {
  prompt += `
⚠️ CONTEXTO: El TERAPEUTA está en fase de evaluación inicial con su paciente (Sesión #${patientContext.session_count}).

IMPLICACIONES PARA ROUTING:
- Si consulta sobre reflexión/hipótesis → Sesgar hacia Supervisor Clínico
- Si consulta sobre estructura/instrumentos → Sesgar hacia Especialista en Documentación
- Si consulta sobre evidencia de evaluación → Sesgar hacia Investigador Académico

NO asumas automáticamente que necesita exploración reflexiva. Clasifica según la consulta específica.
`;
}

if (patientContext.session_count > 15 && patientContext.therapeutic_phase === 'closure') {
  prompt += `
⚠️ CONTEXTO: El TERAPEUTA está en fase de cierre terapéutico (Sesión #${patientContext.session_count}).

IMPLICACIONES PARA ROUTING:
- Si consulta sobre documentar proceso completo → Sesgar hacia Especialista en Documentación
- Si consulta sobre reflexión de cierre → Sesgar hacia Supervisor Clínico
- Si consulta sobre evidencia de seguimiento → Sesgar hacia Investigador Académico

NO asumas automáticamente que necesita documentación. Clasifica según la consulta específica.
`;
}
```

---

## 3. Detección Inteligente de Casos Límite + Fallback a Socratico

### **Principio Fundamental: El Router Debe Ser Inteligente**

**Roles correctos:**
- ✅ **Clínico:** Agente robusto para CASOS LÍMITE (riesgo, crisis, estrés)
- ✅ **Socratico:** Agente por DEFECTO para consultas generales/ambiguas
- 🔬 **Académico:** Agente especializado para evidencia científica

**Responsabilidad del Router:**
> El router debe ser lo suficientemente inteligente para DETECTAR casos límite y enrutar al clínico.
> Si no detecta caso límite → Fallback a socratico (agente general).

### **Estrategia de Routing Inteligente**

```typescript
// En routeUserInput()
function selectAgentWithIntelligentRouting(
  classificationResult: ClassificationResult,
  operationalMetadata: OperationalMetadata,
  userInput: string
): AgentType {

  // 1. DETECCIÓN: Caso límite por riesgo crítico → Clínico
  if (isEdgeCaseRisk(operationalMetadata)) {
    console.log('🚨 EDGE CASE DETECTED: Risk critical → Routing to clinico');
    return 'clinico';
  }

  // 2. DETECCIÓN: Caso límite por escenario de estrés → Clínico
  if (isEdgeCaseStress(operationalMetadata)) {
    console.log('⚠️ EDGE CASE DETECTED: Stress scenario → Routing to clinico');
    return 'clinico';
  }

  // 3. DETECCIÓN: Caso límite por contenido sensible → Clínico
  if (isEdgeCaseSensitiveContent(userInput, operationalMetadata)) {
    console.log('⚠️ EDGE CASE DETECTED: Sensitive content → Routing to clinico');
    return 'clinico';
  }

  // 4. CLASIFICACIÓN NORMAL: Alta confianza → Usar clasificación
  if (classificationResult.confidence >= 0.75) {
    return classificationResult.agent;
  }

  // 5. FALLBACK: Baja confianza o ambigüedad → Socratico (agente general)
  if (classificationResult.confidence < 0.75 || classificationResult.requiresClarification) {
    console.log(`ℹ️ FALLBACK: Low confidence (${classificationResult.confidence}) → Defaulting to socratico`);
    return 'socratico';
  }

  // 6. DEFAULT: Socratico
  return 'socratico';
}

// Detección de casos límite por RIESGO
function isEdgeCaseRisk(metadata: OperationalMetadata): boolean {
  return (
    metadata.risk_level === 'critical' ||
    metadata.risk_level === 'high' ||
    metadata.risk_flags_active.length > 0 ||
    metadata.requires_immediate_attention
  );
}

// Detección de casos límite por ESTRÉS del sistema
function isEdgeCaseStress(metadata: OperationalMetadata): boolean {
  return (
    metadata.consecutive_switches > 4 ||  // Ping-pong extremo
    metadata.session_duration_minutes > 150 ||  // Sesión muy extendida
    (metadata.time_of_day === 'night' && metadata.session_duration_minutes > 90)  // Sesión nocturna larga
  );
}

// Detección de casos límite por CONTENIDO SENSIBLE
function isEdgeCaseSensitiveContent(
  userInput: string,
  metadata: OperationalMetadata
): boolean {
  const sensitiveKeywords = [
    'suicidio', 'suicida', 'matarme', 'acabar con mi vida',
    'autolesión', 'cortarme', 'hacerme daño',
    'abuso', 'violencia', 'maltrato',
    'crisis', 'emergencia', 'urgente'
  ];

  const inputLower = userInput.toLowerCase();
  const hasSensitiveKeyword = sensitiveKeywords.some(keyword => inputLower.includes(keyword));

  // Si hay keyword sensible Y hay contexto de riesgo → Caso límite
  return hasSensitiveKeyword && (
    metadata.risk_flags_active.length > 0 ||
    metadata.risk_level === 'high' ||
    metadata.risk_level === 'critical'
  );
}
```

### **Beneficios de Esta Estrategia**

1. ✅ **Inteligencia del Router:** Detecta activamente casos límite, no solo pasa metadata
2. ✅ **Clínico para Casos Críticos:** Usa el agente más robusto cuando realmente se necesita
3. ✅ **Socratico como Default:** Agente general para consultas normales/ambiguas
4. ✅ **Prevención Proactiva:** Detecta riesgo antes de que el agente equivocado responda
5. ✅ **Escalamiento Inteligente:** El router escala a clínico solo cuando detecta caso límite

---

## 4. Implementación: Router que Decide CON Metadata

### **Paso 1: Recolectar Metadata Operativa**

```typescript
// En hopeai-system.ts, antes de llamar al router
async function collectOperationalMetadata(
  sessionId: string,
  userId: string,
  patientId: string | null
): Promise<OperationalMetadata> {
  
  const sessionState = await storage.loadChatSession(sessionId);
  const patientContext = patientId ? await getPatientContext(patientId) : null;
  
  return {
    // Temporal
    timestamp_utc: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    local_time: new Date().toLocaleString('es-ES', { 
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone 
    }),
    region: detectRegionFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    session_duration_minutes: calculateSessionDuration(sessionState),
    time_of_day: getTimeOfDay(),
    
    // Riesgo
    risk_flags_active: patientContext?.riskFlags || [],
    risk_level: patientContext?.riskLevel || 'low',
    requires_immediate_attention: patientContext?.requiresImmediateAttention || false,
    
    // Historial de agentes
    agent_transitions: sessionState.agentTransitions || [],
    agent_turn_counts: calculateAgentTurnCounts(sessionState),
    last_agent_switch: getLastAgentSwitch(sessionState),
    consecutive_switches: countConsecutiveSwitches(sessionState),
    
    // Contexto de paciente
    patient_id: patientId,
    patient_summary_available: !!patientContext?.summary,
    therapeutic_phase: patientContext?.therapeuticPhase || 'intervention',
    session_count: patientContext?.sessionCount || 0,
    treatment_modality: patientContext?.treatmentModality || null
  };
}
```

---

### **Paso 2: Router Usa Metadata para Decidir**

```typescript
// En intelligent-intent-router.ts
async routeUserInput(
  userInput: string,
  sessionContext: Content[],
  currentAgent?: string,
  enrichedSessionContext?: any,
  operationalMetadata?: OperationalMetadata // NUEVO
): Promise<RoutingDecision> {
  
  // 🔥 DECISIÓN 1: Override por riesgo crítico
  if (operationalMetadata?.risk_level === 'critical') {
    return this.createRiskOverrideDecision(operationalMetadata);
  }
  
  // 🔥 DECISIÓN 2: Ajustar umbral de confianza según contexto
  const confidenceThreshold = this.calculateDynamicThreshold(operationalMetadata);
  
  // 🔥 DECISIÓN 3: Construir prompt enriquecido con metadata
  const metadataEnrichedPrompt = this.buildMetadataInformedPrompt(
    userInput,
    sessionContext,
    enrichedSessionContext,
    operationalMetadata
  );
  
  // Clasificación con contexto enriquecido
  const classificationResult = await this.classifyIntent(
    userInput,
    optimizedContext,
    metadataEnrichedPrompt
  );
  
  // 🔥 DECISIÓN 4: Validar decisión contra metadata
  const validatedDecision = this.validateDecisionAgainstMetadata(
    classificationResult,
    operationalMetadata
  );
  
  // 🔥 DECISIÓN 5: Crear contexto enriquecido con justificación
  return {
    targetAgent: validatedDecision.agent,
    enrichedContext: {
      ...baseContext,
      operationalMetadata,
      routing_decision: {
        agent: validatedDecision.agent,
        confidence: validatedDecision.confidence,
        reason: validatedDecision.reason,
        metadata_factors: validatedDecision.metadataFactors
      }
    },
    confidence: validatedDecision.confidence
  };
}
```

---

### **Paso 3: Agente Recibe Decisión + Metadata (SIN AMBIGÜEDAD)**

```typescript
// En clinical-agent-router.ts, buildEnhancedMessage()
private buildEnhancedMessage(
  userMessage: string,
  enrichedContext: EnrichedContext
): string {

  const sections = [];

  // SECCIÓN 1: Identidad del Usuario (CRÍTICO - Sin ambigüedad)
  sections.push(this.buildUserIdentitySection());

  // SECCIÓN 2: Metadata Operativa
  sections.push(this.buildOperationalMetadataSection(enrichedContext.operationalMetadata));

  // SECCIÓN 3: Decisión de Routing (Transparencia)
  sections.push(this.buildRoutingDecisionSection(enrichedContext.routing_decision));

  // SECCIÓN 4: Contexto del Caso Clínico (si aplica)
  if (enrichedContext.patient_reference) {
    sections.push(this.buildClinicalCaseContextSection(enrichedContext));
  }

  // SECCIÓN 5: Mensaje del Terapeuta
  sections.push(`[CONSULTA DEL TERAPEUTA]\n${userMessage}\n---`);

  return sections.join('\n\n');
}

private buildUserIdentitySection(): string {
  return `
[IDENTIDAD DEL USUARIO]
Usuario: TERAPEUTA/PSICÓLOGO profesional
Contexto: El terapeuta está consultando sobre su práctica clínica
Tu rol: Asistir al TERAPEUTA en su proceso profesional

⚠️ IMPORTANTE: NO estás interactuando con un paciente directamente.
Todas las referencias a "paciente" son sobre el caso clínico que el terapeuta está manejando.
---
`;
}

private buildOperationalMetadataSection(metadata: OperationalMetadata): string {
  const riskSection = metadata.risk_flags_active.length > 0 ? `
⚠️ BANDERAS DE RIESGO ACTIVAS EN EL CASO:
${metadata.risk_flags_active.map(flag => `- ${flag}`).join('\n')}
Nivel de riesgo: ${metadata.risk_level.toUpperCase()}
${metadata.requires_immediate_attention ? '🚨 REQUIERE ATENCIÓN INMEDIATA' : ''}
` : '';

  return `
[METADATA OPERATIVA]
Timestamp: ${metadata.timestamp_utc}
Zona horaria del terapeuta: ${metadata.timezone}
Hora local: ${metadata.local_time}
Región: ${metadata.region}
Duración de esta sesión de consulta: ${metadata.session_duration_minutes} minutos
${riskSection}
Historial de agentes en esta sesión:
${Object.entries(metadata.agent_turn_counts).map(([agent, count]) => `- ${agent}: ${count} turnos`).join('\n')}
---
`;
}

private buildRoutingDecisionSection(decision: RoutingDecision): string {
  return `
[DECISIÓN DE ROUTING]
Agente seleccionado: ${decision.agent}
Confianza de la clasificación: ${(decision.confidence * 100).toFixed(1)}%
Razón de la selección: ${decision.reason}
Factores de metadata considerados: ${decision.metadata_factors.join(', ')}

Por qué fuiste seleccionado: ${this.getSelectionJustification(decision)}
---
`;
}

private buildClinicalCaseContextSection(enrichedContext: EnrichedContext): string {
  const patient = enrichedContext.patient_summary;
  const phase = enrichedContext.operationalMetadata?.therapeutic_phase || 'intervention';
  const sessionCount = enrichedContext.operationalMetadata?.session_count || 0;

  return `
[CONTEXTO DEL CASO CLÍNICO]
El TERAPEUTA está trabajando con un paciente específico.
Fase terapéutica actual: ${phase}
Número de sesión con este paciente: ${sessionCount}
Modalidad de tratamiento: ${enrichedContext.operationalMetadata?.treatment_modality || 'No especificada'}

Resumen del caso (para tu contexto):
${patient || 'No disponible'}

⚠️ RECORDATORIO: Estás asistiendo al TERAPEUTA, no al paciente.
---
`;
}

private getSelectionJustification(decision: RoutingDecision): string {
  const justifications: Record<string, string> = {
    'CRITICAL_RISK_OVERRIDE': 'Existe riesgo crítico en el caso. Tu especialización en exploración reflexiva es necesaria para ayudar al terapeuta a manejar esta situación.',
    'CLOSURE_PHASE_DOCUMENTATION_SUGGESTED': 'El caso está en fase de cierre. Tu especialización en documentación puede ayudar al terapeuta a estructurar el cierre terapéutico.',
    'STABILITY_OVERRIDE_FREQUENT_SWITCHES': 'Se detectaron cambios frecuentes de agente. Mantienes continuidad para evitar fragmentación en la asistencia.',
    'NORMAL_CLASSIFICATION': 'La consulta del terapeuta fue clasificada como relacionada con tu especialización específica.'
  };

  return justifications[decision.reason] || 'Tu especialización es la más apropiada para esta consulta específica.';
}
```

---

## 4. Ejemplos Concretos de Decisiones Informadas

### **Ejemplo 1: Riesgo Crítico Override → Clínico (NO Socratico)**

**Input:**

- Terapeuta: "Mi paciente dijo 'no sé si puedo seguir así' y estoy preocupado"
- Metadata: `risk_level: 'critical'`, `risk_flags_active: ['suicidal_ideation']`

**Decisión del Router:**

```typescript
{
  targetAgent: 'clinico', // CAMBIO: Clínico es más robusto para casos límite
  confidence: 1.0,
  reason: 'CRITICAL_RISK_OVERRIDE_ROBUST_AGENT',
  metadata_factors: ['risk_level_critical', 'suicidal_ideation_flag', 'requires_robust_handling']
}
```

**Contexto enviado al agente:**

```
[IDENTIDAD DEL USUARIO]
Usuario: TERAPEUTA/PSICÓLOGO profesional
Contexto: El terapeuta está consultando sobre su práctica clínica
Tu rol: Asistir al TERAPEUTA en su proceso profesional

⚠️ IMPORTANTE: NO estás interactuando con un paciente directamente.
Todas las referencias a "paciente" son sobre el caso clínico que el terapeuta está manejando.
---

[METADATA OPERATIVA]
Timestamp: 2025-10-24T18:30:00Z
Zona horaria del terapeuta: America/Santiago
Hora local: 24/10/2025 15:30:00
Región: LATAM

⚠️ BANDERAS DE RIESGO ACTIVAS EN EL CASO:
- suicidal_ideation
Nivel de riesgo: CRITICAL
🚨 REQUIERE ATENCIÓN INMEDIATA
---

[DECISIÓN DE ROUTING]
Agente seleccionado: Especialista en Documentación
Confianza de la clasificación: 100%
Razón de la selección: CRITICAL_RISK_OVERRIDE_ROBUST_AGENT
Factores de metadata considerados: risk_level_critical, suicidal_ideation_flag, requires_robust_handling

Por qué fuiste seleccionado: Existe riesgo crítico en el caso. Tu especialización en manejo
restrictivo y estructurado es necesaria para ayudar al terapeuta a manejar esta situación
de forma segura y profesional. Eres el agente más robusto para casos límite.
---

[CONTEXTO DEL CASO CLÍNICO]
El TERAPEUTA está trabajando con un paciente en situación de riesgo.
Fase terapéutica actual: intervention
Número de sesión con este paciente: 8

⚠️ RECORDATORIO: Estás asistiendo al TERAPEUTA, no al paciente.
---

[CONSULTA DEL TERAPEUTA]
Mi paciente dijo 'no sé si puedo seguir así' y estoy preocupado
---
```

---

### **Ejemplo 2: Sesión Extendida + Fase de Cierre**

**Input:**
- Usuario: "Creo que hemos avanzado mucho"
- Metadata: `session_duration: 95 min`, `therapeutic_phase: 'closure'`, `session_count: 18`

**Decisión del Router:**
```typescript
{
  targetAgent: 'clinico',
  confidence: 0.82,
  reason: 'CLOSURE_PHASE_DOCUMENTATION_SUGGESTED',
  metadata_factors: ['extended_session', 'closure_phase', 'high_session_count']
}
```

---

### **Ejemplo 3: Detección de Caso Límite por Estrés → Clínico**

**Input:**

- Terapeuta: "Mmm, no estoy seguro"
- Metadata: `consecutive_switches: 5`, `session_duration: 155 min`, `last_switch: 90 seconds ago`

**Decisión del Router:**

```typescript
{
  targetAgent: 'clinico', // EDGE CASE: Estrés del sistema
  confidence: 1.0,
  reason: 'EDGE_CASE_STRESS_DETECTED',
  metadata_factors: ['consecutive_switches_extreme', 'session_very_extended', 'system_stress']
}
```

**Justificación:**
El router detectó un caso límite de estrés del sistema:
- 5 cambios consecutivos de agente (ping-pong extremo)
- Sesión de 155 minutos (muy extendida)
- Usuario confundido/inseguro

→ Enruta a clínico (agente más robusto) para estabilizar la sesión.

---

### **Ejemplo 4: Fallback por Baja Confianza → Socratico**

**Input:**

- Terapeuta: "Hmm, interesante"
- Metadata: Sin risk flags, sesión normal

**Decisión del Router:**

```typescript
{
  targetAgent: 'socratico', // FALLBACK: Baja confianza
  confidence: 0.45,
  reason: 'FALLBACK_LOW_CONFIDENCE',
  metadata_factors: ['ambiguous_query', 'no_edge_case_detected']
}
```

**Justificación:**
- No se detectó caso límite (sin riesgo, sin estrés)
- Confianza baja (0.45 < 0.75)
- Consulta ambigua

→ Fallback a socratico (agente general por defecto).

---

### **Ejemplo 5: Detección de Contenido Sensible → Clínico**

**Input:**

- Terapeuta: "Mi paciente mencionó pensamientos de autolesión"
- Metadata: `risk_flags_active: ['self_harm']`, `risk_level: 'high'`

**Decisión del Router:**

```typescript
{
  targetAgent: 'clinico', // EDGE CASE: Contenido sensible + riesgo
  confidence: 1.0,
  reason: 'EDGE_CASE_SENSITIVE_CONTENT_DETECTED',
  metadata_factors: ['sensitive_keyword_detected', 'risk_flags_active', 'risk_level_high']
}
```

**Justificación:**
El router detectó:
- Keyword sensible: "autolesión"
- Risk flags activos: self_harm
- Risk level: high

→ Caso límite confirmado → Enruta a clínico (agente más robusto y restrictivo).

---

## 5. Beneficios de Esta Arquitectura

### ✅ **Inteligencia del Router**

- El router DETECTA activamente casos límite, no solo clasifica intenciones
- Usa metadata para tomar decisiones informadas sobre cuándo escalar a clínico
- Previene errores de routing en casos críticos mediante detección proactiva

### ✅ **Uso Correcto de Agentes**

- **Clínico:** Reservado para casos límite (riesgo, estrés, contenido sensible)
- **Socratico:** Default para consultas generales/ambiguas
- **Académico:** Especializado para evidencia científica
- El router escala inteligentemente según necesidad real

### ✅ **Transparencia**

- El agente sabe POR QUÉ fue seleccionado
- Puede adaptar su respuesta según la justificación
- Metadata incluye razón de la decisión y factores considerados

### ✅ **Seguridad Clínica**

- Detección de risk flags garantiza routing a clínico en casos críticos
- Detección de keywords sensibles + contexto de riesgo → Escalamiento automático
- Previene que socratico (condescendiente) maneje casos de riesgo

### ✅ **Continuidad y Estabilidad**

- Detección de ping-pong extremo → Escalamiento a clínico para estabilizar
- Previene fragmentación en sesiones de estrés
- Mantiene coherencia en la experiencia del terapeuta

### ✅ **Adaptación Regional y Temporal**

- Terminología y ejemplos adaptados a LATAM
- Contexto temporal relevante para el terapeuta
- Detección de sesiones nocturnas extendidas → Escalamiento a clínico

---

## 6. Próximos Pasos de Implementación

### **Fase 1: Metadata Operativa (Prioridad Alta)**

1. ✅ Crear `OperationalMetadata` interface con todos los campos necesarios
2. ✅ Implementar `collectOperationalMetadata()` en hopeai-system
3. ✅ Implementar detección de timezone y región (LATAM)
4. ✅ Implementar tracking de agent transitions y turn counts

### **Fase 2: Detección Inteligente de Casos Límite (Prioridad Crítica)**

5. ✅ Implementar `isEdgeCaseRisk()` - Detección de riesgo crítico
6. ✅ Implementar `isEdgeCaseStress()` - Detección de estrés del sistema
7. ✅ Implementar `isEdgeCaseSensitiveContent()` - Detección de keywords sensibles
8. ✅ Modificar `routeUserInput()` para usar detección de casos límite

### **Fase 3: Routing Inteligente (Prioridad Alta)**

9. ✅ Implementar `selectAgentWithIntelligentRouting()` con lógica de escalamiento
10. ✅ Configurar fallback a socratico (no clínico)
11. ✅ Implementar override a clínico solo en casos límite detectados
12. ✅ Testing exhaustivo de detección de casos límite

### **Fase 4: Metadata Sin Ambigüedad (Prioridad Alta)**

13. ✅ Implementar `buildUserIdentitySection()` - Clarificar que usuario es TERAPEUTA
14. ✅ Implementar `buildOperationalMetadataSection()` - Metadata estructurada
15. ✅ Implementar `buildRoutingDecisionSection()` - Transparencia de decisión
16. ✅ Implementar `buildClinicalCaseContextSection()` - Contexto del caso (no del paciente directo)
17. ✅ Separar claramente `[CONSULTA DEL TERAPEUTA]` de metadata

### **Fase 5: Eliminación de Global Instruction (Prioridad Media)**

18. ✅ Extraer principios de seguridad de global instruction → metadata de contexto
19. ✅ Mover identidad de Aurora a system instruction individual por agente
20. ✅ Testing A/B para verificar especialización pura sin fuga de rol

### **Fase 6: Optimización de Inyección de Rol (Prioridad Baja)**

21. ✅ Eliminar inyección de rol en turnos normales
22. ✅ Implementar inyección condicional solo en casos específicos
23. ✅ Monitorear métricas de deriva de rol

---

## 7. Conclusión

**Principios Fundamentales:**

1. 🎯 **Metadata informa decisiones del router**, no es un delivery pasivo
2. 🧠 **Router debe ser inteligente**: Detecta casos límite y escala a clínico
3. 🔄 **Fallback correcto**: Socratico es el agente general por defecto
4. 🛡️ **Clínico para casos límite**: Riesgo, estrés, contenido sensible
5. 📝 **Metadata sin ambigüedad**: Usuario es TERAPEUTA, no paciente
6. 🎭 **Especialización pura**: Eliminar global instruction para evitar fuga de rol

**Resultado Esperado:**

- ✅ Router inteligente que detecta y maneja casos límite proactivamente
- ✅ Uso correcto de agentes según su fortaleza (clínico = robusto, socratico = general)
- ✅ Metadata clara que no confunde al modelo sobre quién es el usuario
- ✅ Seguridad clínica garantizada mediante detección de riesgo
- ✅ Arquitectura mantenible y escalable

