import 'server-only'

/**
 * Sub-Agent: Generate Session Summary
 *
 * Produces a concise AI-generated summary of a clinical session.
 * Called fire-and-forget at session close or after significant exchanges.
 * The summary is persisted as a field on the session document in Firestore,
 * enabling progressive context loading without reading all messages.
 *
 * Inspired by Claude Code's `session-memory.md` auto-generated summaries.
 *
 * @module lib/agents/subagents/generate-session-summary
 */

import { ai } from '@/lib/google-genai-config'
import { createLogger } from '@/lib/logger'
import { SUBAGENT_MODEL } from './types'
import type { SessionSummaryData } from '@/types/clinical-types'

const logger = createLogger('agent')

const SUMMARY_SYSTEM_PROMPT = `Eres un asistente clínico que genera resúmenes concisos de sesiones terapéuticas.

Tu tarea es analizar un fragmento de conversación entre un terapeuta y Aurora (asistente clínico IA) y producir un resumen estructurado en formato JSON.

Reglas:
- Escribe en español clínico profesional
- Sé conciso: cada campo debe ser breve (1-2 oraciones máximo)
- mainTopics: máximo 5 temas principales (strings cortos, no oraciones completas)
- therapeuticProgress: evaluación breve del avance terapéutico observado
- riskFlags: solo si se detectaron banderas de riesgo. Array vacío si no hay riesgo
- nextSteps: máximo 3 sugerencias concretas para la siguiente sesión
- keyInsights: máximo 3 observaciones clínicas clave del agente
- Nunca incluyas datos identificables del paciente (solo patrones y observaciones)
- Si la conversación es breve o no tiene contenido clínico sustantivo, genera un resumen mínimo

Responde SOLO con JSON válido, sin bloques de código ni texto adicional.`

const SUMMARY_USER_TEMPLATE = `Genera un resumen clínico estructurado de la siguiente conversación terapéutica.

<conversacion>
{CONVERSATION}
</conversacion>

Responde con JSON en este formato exacto:
{
  "mainTopics": ["tema1", "tema2"],
  "therapeuticProgress": "breve evaluación del progreso",
  "riskFlags": [],
  "nextSteps": ["paso1", "paso2"],
  "keyInsights": ["insight1", "insight2"]
}`

/**
 * Generate a session summary from conversation history.
 *
 * @param conversationText - Formatted conversation text (user/model turns)
 * @returns SessionSummaryData or null if generation fails
 */
export async function generateSessionSummary(
  conversationText: string,
): Promise<SessionSummaryData | null> {
  const startTime = Date.now()

  try {
    // Truncate conversation to avoid token limits (keep last ~6000 chars)
    const MAX_CHARS = 6000
    const truncated = conversationText.length > MAX_CHARS
      ? '...[conversación truncada]...\n' + conversationText.slice(-MAX_CHARS)
      : conversationText

    const userPrompt = SUMMARY_USER_TEMPLATE.replace('{CONVERSATION}', truncated)

    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: SUMMARY_SYSTEM_PROMPT,
        temperature: 1.0, // Normalized to 1.0 per Google Gen AI SDK best practices for Gemini 3.X
        maxOutputTokens: 1024,
      },
    })

    const text = result.text?.trim()
    if (!text) {
      logger.warn('Session summary generation returned empty text')
      return null
    }

    // Parse JSON — handle potential markdown code blocks
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(jsonStr)

    const summary: SessionSummaryData = {
      mainTopics: Array.isArray(parsed.mainTopics) ? parsed.mainTopics.slice(0, 5) : [],
      therapeuticProgress: typeof parsed.therapeuticProgress === 'string' ? parsed.therapeuticProgress : '',
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 3) : [],
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 3) : [],
      generatedAt: new Date(),
      tokenCount: Math.ceil(text.length / 4),
    }

    const durationMs = Date.now() - startTime
    logger.info('Session summary generated', {
      durationMs,
      topicCount: summary.mainTopics.length,
      model: SUBAGENT_MODEL,
    })

    return summary
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('Session summary generation failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    return null
  }
}
