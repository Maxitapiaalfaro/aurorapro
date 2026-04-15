import 'server-only'

/**
 * Sub-Agent: Extract Session Memories
 *
 * LLM-powered extraction of clinically significant memories from a
 * conversation turn. Replaces the naive regex-based extraction with
 * structured Gemini output that uses the full 5-category taxonomy.
 *
 * Inspired by Claude Code's `extractMemories.ts` — runs as a "forked agent"
 * after each model response to persist durable knowledge about the patient.
 *
 * Uses gemini-3.1-flash-lite-preview for speed and cost efficiency.
 *
 * @module lib/agents/subagents/extract-session-memories
 */

import { ai } from '@/lib/google-genai-config'
import { createLogger } from '@/lib/logger'
import { SUBAGENT_MODEL } from './types'
import type { ClinicalMemoryCategory } from '@/types/memory-types'

const logger = createLogger('agent')

const EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de memorias clínicas. Analizas un turno de conversación entre un terapeuta y Aurora (asistente clínico IA) y extraes información que sería valiosa recordar para sesiones futuras.

Categorías de memoria:
- "observation": Observación factual del paciente (reportes, síntomas, eventos de vida)
- "pattern": Patrón conductual/emocional recurrente o significativo
- "therapeutic-preference": Enfoque terapéutico que funciona o no con este paciente
- "feedback": Corrección o confirmación del terapeuta sobre cómo Aurora aborda la sesión
- "reference": Recurso externo mencionado como relevante (escala, protocolo, artículo)

Reglas:
- Extrae SOLO información clínicamente significativa (no trivialidades)
- Máximo 5 memorias por turno (prioriza las que son clínicamente relevantes a la fecha)
- Cada memoria debe ser auto-contenida: útil fuera de esta sesión
- Escribe en español clínico profesional y conciso (máx. 200 chars por memoria)
- Asigna confianza: 0.9+ confirmado, 0.7-0.8 observación clara, 0.5-0.6 preliminar
- Asigna tags relevantes (máx. 3 por memoria)
- Si no hay información clínicamente valiosa, retorna un array vacío
- Presta atención especial a correcciones del terapeuta (categoría "feedback")

Responde SOLO con JSON válido (array), sin bloques de código ni texto adicional.`

const EXTRACTION_USER_TEMPLATE = `Analiza este turno de conversación y extrae memorias clínicas valiosas para sesiones futuras.

<mensaje_terapeuta>
{USER_MESSAGE}
</mensaje_terapeuta>

<respuesta_aurora>
{MODEL_RESPONSE}
</respuesta_aurora>

Responde con un array JSON:
[
  {
    "category": "observation|pattern|therapeutic-preference|feedback|reference",
    "content": "texto conciso de la memoria",
    "confidence": 0.7,
    "tags": ["tag1", "tag2"]
  }
]

Si no hay información valiosa, responde con: []`

/** A single extracted memory before persistence */
export interface ExtractedMemory {
  category: ClinicalMemoryCategory
  content: string
  confidence: number
  tags: string[]
}

const VALID_CATEGORIES: Set<string> = new Set([
  'observation', 'pattern', 'therapeutic-preference', 'feedback', 'reference',
])

/**
 * Extract clinically significant memories from a conversation turn using LLM.
 *
 * @param userMessage - The therapist's message
 * @param modelResponse - Aurora's response
 * @returns Array of extracted memories (0-3 items), or empty array on failure
 */
export async function extractSessionMemories(
  userMessage: string,
  modelResponse: string,
): Promise<ExtractedMemory[]> {
  const startTime = Date.now()

  try {
    // Truncate inputs to keep within token limits
    const maxMsgLen = 2500
    const truncatedUser = userMessage.length > maxMsgLen
      ? userMessage.substring(0, maxMsgLen) + '…'
      : userMessage
    const truncatedModel = modelResponse.length > maxMsgLen
      ? modelResponse.substring(0, maxMsgLen) + '…'
      : modelResponse

    const userPrompt = EXTRACTION_USER_TEMPLATE
      .replace('{USER_MESSAGE}', truncatedUser)
      .replace('{MODEL_RESPONSE}', truncatedModel)

    const result = await ai.models.generateContent({
      model: SUBAGENT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        temperature: 1.0,
        maxOutputTokens: 2048,
      },
    })

    const text = result.text?.trim()
    if (!text) return []

    // Parse JSON — handle potential markdown code blocks
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) return []

    // Validate and sanitize each extracted memory
    const memories: ExtractedMemory[] = []
    for (const item of parsed.slice(0, 3)) {
      if (
        typeof item?.content === 'string' &&
        item.content.length >= 10 &&
        VALID_CATEGORIES.has(item.category)
      ) {
        memories.push({
          category: item.category as ClinicalMemoryCategory,
          content: item.content.substring(0, 500),
          confidence: typeof item.confidence === 'number'
            ? Math.min(1, Math.max(0, item.confidence))
            : 0.7,
          tags: Array.isArray(item.tags)
            ? item.tags.filter((t: unknown) => typeof t === 'string').slice(0, 5)
            : [],
        })
      }
    }

    const durationMs = Date.now() - startTime
    logger.info('LLM memory extraction completed', {
      durationMs,
      memoriesExtracted: memories.length,
      model: SUBAGENT_MODEL,
    })

    return memories
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.warn('LLM memory extraction failed — falling back to empty', {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    return []
  }
}
