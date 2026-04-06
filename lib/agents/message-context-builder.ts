/**
 * Message Context Builder — Extracted from clinical-agent-router.ts (P3 decomposition)
 * 
 * Constructs enriched messages with system context (operational metadata, routing decisions,
 * clinical case context, role metadata, agent transitions) using XML-tag separation.
 */
import type { AgentType } from "@/types/clinical-types"
import type { OperationalMetadata, RoutingDecision } from "@/types/operational-metadata"

/**
 * ARCHITECTURAL FIX: Generate agent-specific context for file attachments
 * Provides flexible, conversation-aware context that maintains flow between agents
 * while enabling specialized responses based on agent expertise.
 *
 * NOTE: This function is currently unused (dead code carried over from the router).
 */
export function buildAgentSpecificFileContext(agentType: AgentType, fileCount: number, fileNames: string): string {
  const baseContext = `**Archivos en contexto:** ${fileNames} (${fileCount} archivo${fileCount > 1 ? 's' : ''}).`;

  switch (agentType) {
    case 'socratico':
      return `${baseContext}

Como especialista en exploración reflexiva, puedes aprovechar este material para enriquecer el diálogo terapéutico. Responde naturalmente integrando tu perspectiva socrática según el flujo de la conversación.`;

    case 'clinico':
      return `${baseContext}

Como especialista en documentación clínica, este material está disponible para síntesis profesional. Integra tu perspectiva organizacional según sea relevante para la conversación en curso.`;

    case 'academico':
      return `${baseContext}

Como especialista en evidencia científica, puedes utilizar este material para informar tu análisis académico. Integra tu perspectiva basada en investigación según el contexto conversacional.`;

    default:
      return `${baseContext} Material disponible para análisis contextual apropiado.`;
  }
}

/**
 * METADATA SECTION: Identidad del usuario (TERAPEUTA)
 * Clarifica sin ambigüedad que el usuario es el terapeuta, no el paciente
 */
export function buildUserIdentitySection(): string {
  return `El usuario de este sistema es un TERAPEUTA/PSICÓLOGO profesional consultando sobre su trabajo clínico. El usuario NO es el paciente.`;
}

/**
 * METADATA SECTION: Metadata operativa del sistema
 * Información temporal, de riesgo, y de contexto de sesión
 */
export function buildOperationalMetadataSection(metadata: OperationalMetadata): string {
  let section = `Tiempo: ${metadata.local_time} (${metadata.timezone}), Región: ${metadata.region}, Duración de sesión: ${metadata.session_duration_minutes} min`;

  // Riesgo (solo si hay flags activos)
  if (metadata.risk_flags_active.length > 0) {
    section += `\n⚠️ BANDERAS DE RIESGO ACTIVAS: ${metadata.risk_flags_active.join(', ')}. Nivel: ${metadata.risk_level.toUpperCase()}`;
    if (metadata.requires_immediate_attention) {
      section += ` 🚨 REQUIERE ATENCIÓN INMEDIATA`;
    }
  }

  // Historial de agentes (solo si hay switches recientes)
  if (metadata.consecutive_switches > 2) {
    section += `\nCambios de agente recientes: ${metadata.consecutive_switches} en últimos 5 min. Mantén coherencia con el contexto previo.`;
  }

  return section;
}

/**
 * METADATA SECTION: Decisión de routing
 * Explica por qué este agente fue seleccionado
 */
export function buildRoutingDecisionSection(decision: RoutingDecision, agent: AgentType): string {
  let section = `Agente seleccionado: ${agent} (confianza: ${(decision.confidence * 100).toFixed(0)}%). Razón: ${decision.reason}`;

  if (decision.is_edge_case) {
    section += `. Caso límite: ${decision.edge_case_type} (${decision.metadata_factors.join(', ')})`;
  }

  return section;
}

/**
 * METADATA SECTION: Contexto del caso clínico
 * Información del paciente si está disponible (sin ambigüedad)
 */
export function buildClinicalCaseContextSection(enrichedContext: any): string {
  if (!enrichedContext.patient_reference) {
    return '';
  }

  let section = `Paciente en consulta: ${enrichedContext.patient_reference}`;

  if (enrichedContext.patient_summary) {
    section += `\nResumen del caso: ${enrichedContext.patient_summary}`;
  }

  return section;
}

/**
 * 🎯 ROLE METADATA: Genera metadata conciso que refuerza el rol del agente en cada mensaje
 * Este metadata acompaña al agente en su recorrido sin depender del system prompt
 */
export function getRoleMetadata(agent: AgentType): string {
  const roleDefinitions: Record<string, string> = {
    socratico: `<rol_activo>Supervisor Clínico — Exploración reflexiva, formulación de caso, discriminación diagnóstica.</rol_activo>`,

    clinico: `<rol_activo>Especialista en Documentación — Síntesis en registros SOAP/DAP/BIRP con profundidad reflexiva.</rol_activo>`,

    academico: `<rol_activo>Investigador Académico — Búsqueda sistemática y síntesis crítica de evidencia científica.</rol_activo>`
  }

  return roleDefinitions[agent] || `<rol_activo>${agent}</rol_activo>`
}

/**
 * Gets human-readable specialty name for agent types
 */
export function getAgentSpecialtyName(agentType: AgentType): string {
  switch (agentType) {
    case 'socratico': return 'exploración reflexiva y cuestionamiento socrático';
    case 'clinico': return 'documentación clínica y síntesis profesional';
    case 'academico': return 'evidencia científica e investigación académica';
    default: return 'análisis especializado';
  }
}

/**
 * Adds subtle transition context when switching agents to maintain conversational flow
 */
export function addAgentTransitionContext(geminiHistory: any[], newAgentType: AgentType): any[] {
  if (geminiHistory.length === 0) return geminiHistory;

  // Internal system note for orchestration-only transition (not user-initiated and not user-facing)
  const transitionMessage = {
    role: 'model' as const,
    parts: [{
      text: `<nota_sistema>Transición interna del orquestador. No fue solicitada por el usuario. No agradezcas ni anuncies el cambio. Continúa la conversación con perspectiva especializada en ${getAgentSpecialtyName(newAgentType)}, manteniendo el flujo y objetivos previos.</nota_sistema>`
    }]
  };

  // Insert the transition context before the last user message to maintain natural flow
  const historyWithTransition = [...geminiHistory];
  if (historyWithTransition.length > 0) {
    historyWithTransition.splice(-1, 0, transitionMessage);
  }

  return historyWithTransition;
}

/**
 * Builds an enhanced message with system context sections and the original user query,
 * separated by XML tags.
 */
export function buildEnhancedMessage(originalMessage: string, enrichedContext: any, agent: AgentType): string {
  // Si es una solicitud de confirmación, devolver el mensaje tal como está
  // (ya viene formateado como prompt de confirmación desde Aurora System)
  if (enrichedContext.isConfirmationRequest) {
    return originalMessage
  }

  // ARQUITECTURA DE CONTEXTO: XML tags claras para separar metadata del sistema
  // de la consulta real del usuario. Esto previene que el modelo confunda
  // instrucciones internas con contenido del usuario.
  const contextSections: string[] = []

  // 1. IDENTIDAD DEL USUARIO (siempre presente)
  contextSections.push(buildUserIdentitySection())

  // 2. METADATA OPERATIVA (si está disponible)
  if (enrichedContext.operationalMetadata) {
    contextSections.push(buildOperationalMetadataSection(enrichedContext.operationalMetadata))
    console.log(`📊 [ClinicalRouter] Operational metadata included in message`)
  }

  // 3. DECISIÓN DE ROUTING (si está disponible)
  if (enrichedContext.routingDecision) {
    contextSections.push(buildRoutingDecisionSection(enrichedContext.routingDecision, agent))
    console.log(`🎯 [ClinicalRouter] Routing decision included: ${enrichedContext.routingDecision.reason}`)
  }

  // 4. CONTEXTO DEL CASO CLÍNICO (si hay paciente)
  if (enrichedContext.patient_reference) {
    contextSections.push(buildClinicalCaseContextSection(enrichedContext))
    console.log(`🏥 [ClinicalRouter] Clinical case context included`)
  }

  // 5. ENTIDADES EXTRAÍDAS (si están disponibles)
  if (enrichedContext.extractedEntities && enrichedContext.extractedEntities.length > 0) {
    contextSections.push(`Entidades detectadas: ${enrichedContext.extractedEntities.join(", ")}`)
  }

  // 6. INFORMACIÓN DE SESIÓN (si está disponible)
  if (enrichedContext.sessionSummary) {
    contextSections.push(`Resumen de sesión: ${enrichedContext.sessionSummary}`)
  }

  // 7. PRIORIDADES DEL AGENTE (si están disponibles)
  if (enrichedContext.agentPriorities && enrichedContext.agentPriorities.length > 0) {
    contextSections.push(`Enfoques prioritarios: ${enrichedContext.agentPriorities.join(", ")}`)
  }

  // Construir mensaje con separación clara entre contexto del sistema y consulta del usuario
  const systemContext = contextSections.join('\n')
  return `<contexto_sistema>\n${systemContext}\n</contexto_sistema>\n\n<consulta_terapeuta>\n${originalMessage}\n</consulta_terapeuta>`
}
