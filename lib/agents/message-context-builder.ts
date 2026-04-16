/**
 * Message Context Builder — Enriched message construction for unified Aurora agent
 *
 * Constructs messages with system context (operational metadata, clinical case context,
 * clinical memories) using XML-tag separation.
 *
 * Simplified from the 3-agent version: removed getRoleMetadata, addAgentTransitionContext,
 * buildRoutingDecisionSection, getAgentSpecialtyName (all routing-era).
 */
import type { AgentType } from "@/types/clinical-types"
import type { OperationalMetadata } from "@/types/operational-metadata"
import { createLogger } from "@/lib/logger"

const logger = createLogger('agent')

/**
 * METADATA SECTION: User identity (THERAPIST)
 */
function buildUserIdentitySection(): string {
  return `El usuario de este sistema es un TERAPEUTA/PSICÓLOGO profesional consultando sobre su trabajo clínico. El usuario NO es el paciente.`;
}

/**
 * METADATA SECTION: Operational metadata
 */
function buildOperationalMetadataSection(metadata: OperationalMetadata): string {
  let section = `Tiempo: ${metadata.local_time} (${metadata.timezone}), Región: ${metadata.region}, Duración de sesión: ${metadata.session_duration_minutes} min`;

  if (metadata.risk_flags_active.length > 0) {
    section += `\n⚠️ BANDERAS DE RIESGO ACTIVAS: ${metadata.risk_flags_active.join(', ')}. Nivel: ${metadata.risk_level.toUpperCase()}`;
    if (metadata.requires_immediate_attention) {
      section += ` 🚨 REQUIERE ATENCIÓN INMEDIATA`;
    }
  }

  return section;
}

/**
 * METADATA SECTION: Clinical case context
 */
function buildClinicalCaseContextSection(enrichedContext: any): string {
  if (!enrichedContext.patient_reference) return '';

  let section = `Paciente en consulta: ${enrichedContext.patient_reference}`;
  if (enrichedContext.patient_summary) {
    section += `\nResumen del caso: ${enrichedContext.patient_summary}`;
  }
  return section;
}

/**
 * METADATA SECTION: Inter-session clinical memories
 */
export function buildClinicalMemoriesSection(memories: any[]): string {
  if (!memories || memories.length === 0) return '';
  const formatted = memories.map(m => `- [${m.category}] ${m.content}`).join('\n');
  return `Memorias clínicas inter-sesión del paciente:\n${formatted}`;
}

/**
 * METADATA SECTION: Prior session summaries for progressive context loading.
 * Provides brief summaries of recent sessions without loading all messages.
 */
function buildPriorSessionSummariesSection(summaries: any[]): string {
  if (!summaries || summaries.length === 0) return '';
  const formatted = summaries.map((s, i) => {
    const topics = s.mainTopics?.join(', ') || 'sin temas registrados'
    const progress = s.therapeuticProgress || ''
    const risks = s.riskFlags?.length > 0 ? ` ⚠️ Riesgos: ${s.riskFlags.join(', ')}` : ''
    return `${i + 1}. Temas: ${topics}${progress ? ` | Progreso: ${progress}` : ''}${risks}`
  }).join('\n');
  return `Resúmenes de sesiones previas (más reciente primero):\n${formatted}`;
}

/**
 * Builds an enhanced message with system context sections and the original user query,
 * separated by XML tags.
 */
export function buildEnhancedMessage(originalMessage: string, enrichedContext: any, _agent: AgentType): string {
  // Si es una solicitud de confirmación, devolver el mensaje tal como está
  if (enrichedContext.isConfirmationRequest) {
    return originalMessage
  }

  const contextSections: string[] = []

  // 0. FRESHNESS METADATA (C6 resolution: timestamp + staleness indicator)
  const memoryCount = enrichedContext.clinicalMemories?.length ?? 0
  contextSections.push(`<metadata fetched_at="${new Date().toISOString()}" memory_count="${memoryCount}" staleness_note="Datos pre-cargados al inicio del turno. Si el terapeuta reporta cambios recientes, invoca herramientas para datos actualizados."/>`)

  // 1. USER IDENTITY (always present)
  contextSections.push(buildUserIdentitySection())

  // 2. OPERATIONAL METADATA
  if (enrichedContext.operationalMetadata) {
    contextSections.push(buildOperationalMetadataSection(enrichedContext.operationalMetadata))
    logger.info(`Operational metadata included in message`)
  }

  // 3. CLINICAL CASE CONTEXT (if patient is active)
  if (enrichedContext.patient_reference) {
    contextSections.push(buildClinicalCaseContextSection(enrichedContext))
    logger.info(`Clinical case context included`)
  }

  // 4. CLINICAL MEMORIES (if available)
  if (enrichedContext.clinicalMemories?.length > 0) {
    contextSections.push(buildClinicalMemoriesSection(enrichedContext.clinicalMemories))
    logger.info(`Clinical memories included: ${enrichedContext.clinicalMemories.length}`)
  }

  // 4.5. PRIOR SESSION SUMMARIES (progressive context loading)
  if (enrichedContext.priorSessionSummaries?.length > 0) {
    contextSections.push(buildPriorSessionSummariesSection(enrichedContext.priorSessionSummaries))
    logger.info(`Prior session summaries included: ${enrichedContext.priorSessionSummaries.length}`)
  }

  // 5. EXTRACTED ENTITIES (if available)
  if (enrichedContext.extractedEntities && enrichedContext.extractedEntities.length > 0) {
    contextSections.push(`Entidades detectadas: ${enrichedContext.extractedEntities.join(", ")}`)
  }

  // 6. SESSION INFO (if available)
  if (enrichedContext.sessionSummary) {
    contextSections.push(`Resumen de sesión: ${enrichedContext.sessionSummary}`)
  }

  // 7. AGENT PRIORITIES (if available)
  if (enrichedContext.agentPriorities && enrichedContext.agentPriorities.length > 0) {
    contextSections.push(`Enfoques prioritarios: ${enrichedContext.agentPriorities.join(", ")}`)
  }

  const systemContext = contextSections.join('\n')
  return `<contexto_sistema>\n${systemContext}\n</contexto_sistema>\n\n<consulta_terapeuta>\n${originalMessage}\n</consulta_terapeuta>`
}
