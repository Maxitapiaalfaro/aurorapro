import 'server-only'

/**
 * Entity Extractor — Clinical Ontology Extraction (Pipeline Step 1)
 *
 * Uses a Gemini model with structured JSON output to extract clinical
 * entities from therapist/patient messages and classify them into the
 * ClinicalOntologyMetadata schema.
 *
 * Guarantees:
 * - AbortController timeout: 3 000 ms max per LLM call.
 * - Confidence gate: entities with confidence < 0.5 are silently discarded.
 * - Graceful fallback: returns empty array on any error (never blocks persistence).
 *
 * @module lib/services/entity-extractor
 */

import { ai } from '@/lib/google-genai-config'
import { Type } from '@google/genai'
import { createLogger } from '@/lib/logger'
import type {
  ClinicalOntologyMetadata,
  ClinicalDomain,
  ClinicalValence,
  Chronicity,
} from '@/types/clinical-schema'

const logger = createLogger('agent')

/** Maximum time (ms) allowed for the LLM extraction call. */
const EXTRACTION_TIMEOUT_MS = 3_000

/** Minimum confidence for SNOMED-CT code assignment (higher bar than general entities). */
const SNOMED_CONFIDENCE = 0.7

/** Minimum confidence threshold — entities below this are silently dropped. */
const MIN_CONFIDENCE = 0.5

/** Model used for structured extraction — fast and cheap. */
const EXTRACTION_MODEL = 'gemini-2.5-flash'

// ---------------------------------------------------------------------------
// Structured output schema for the LLM (Gemini JSON mode)
// ---------------------------------------------------------------------------

/**
 * JSON Schema passed to Gemini's `responseSchema` to enforce typed output.
 * Maps 1:1 to the ClinicalOntologyMetadata interface + a confidence field.
 */
const ENTITY_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
      description: 'Array of extracted clinical entities with ontology metadata.',
      items: {
        type: Type.OBJECT,
        properties: {
          domain: {
            type: Type.STRING,
            enum: ['cognitive', 'somatic', 'interpersonal', 'functional'],
            description: 'Primary biopsychosocial domain.',
          },
          valence: {
            type: Type.STRING,
            enum: ['strength', 'risk_factor'],
            description: 'Whether this is a protective resource or risk factor.',
          },
          chronicity: {
            type: Type.STRING,
            enum: ['trait', 'state'],
            description: 'Stable trait vs. transient state.',
          },
          snomedCode: {
            type: Type.STRING,
            description: 'SNOMED-CT concept ID (6-18 digits). Empty string if unknown.',
            nullable: true,
          },
          dsm5Code: {
            type: Type.STRING,
            description: 'DSM-5 code (e.g. "F32.1"). Empty string if not applicable.',
            nullable: true,
          },
          semanticTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Hierarchical tags: "domain.subdomain.concept". Max 5.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence score 0.0–1.0 for this entity extraction.',
          },
        },
        required: ['domain', 'valence', 'chronicity', 'semanticTags', 'confidence'],
      },
    },
  },
  required: ['entities'],
} as const

// ---------------------------------------------------------------------------
// System prompt for entity extraction
// ---------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `Eres un motor de extracción de entidades clínicas para un sistema de inteligencia terapéutica.
Tu tarea: analizar el mensaje del terapeuta/paciente y extraer TODAS las entidades clínicas relevantes.

REGLAS:
1. Clasifica cada entidad en exactamente UN dominio biopsicosocial: cognitive, somatic, interpersonal, functional.
2. Determina la valencia: "strength" (factor protector) o "risk_factor" (factor de riesgo).
3. Determina la cronicidad: "trait" (rasgo estable) o "state" (estado transitorio).
4. Si identificas un código SNOMED-CT con alta confianza (>0.7), inclúyelo. Si no, devuelve null.
5. Si identificas un código DSM-5 relevante, inclúyelo. Si no, devuelve null.
6. Genera 1-5 tags semánticos jerárquicos en formato "dominio.subdominio.concepto".
7. Asigna un puntaje de confianza (0.0-1.0) para cada entidad.
8. NO inventes entidades que no estén respaldadas por el texto.
9. Prioriza precisión sobre exhaustividad.`

// ---------------------------------------------------------------------------
// Raw entity shape from LLM response
// ---------------------------------------------------------------------------

/** Shape returned by the LLM before validation/filtering. */
interface RawExtractedEntity {
  domain: string
  valence: string
  chronicity: string
  snomedCode?: string | null
  dsm5Code?: string | null
  semanticTags: string[]
  confidence: number
}

// ---------------------------------------------------------------------------
// Domain validation helpers
// ---------------------------------------------------------------------------

const VALID_DOMAINS = new Set<string>(['cognitive', 'somatic', 'interpersonal', 'functional'])
const VALID_VALENCES = new Set<string>(['strength', 'risk_factor'])
const VALID_CHRONICITIES = new Set<string>(['trait', 'state'])

function isValidDomain(v: string): v is ClinicalDomain {
  return VALID_DOMAINS.has(v)
}
function isValidValence(v: string): v is ClinicalValence {
  return VALID_VALENCES.has(v)
}
function isValidChronicity(v: string): v is Chronicity {
  return VALID_CHRONICITIES.has(v)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts structured clinical ontology entities from a user message.
 *
 * Implements Pipeline Step 1 (Ontological Extraction):
 * 1. Sends the message + optional conversation context to Gemini with a
 *    JSON schema enforcing ClinicalOntologyMetadata output.
 * 2. Parses the structured response.
 * 3. Filters out any entity with confidence < 0.5.
 * 4. Validates domain/valence/chronicity enums.
 *
 * On any error (timeout, parse failure, API error) returns an empty array
 * so the memory can still be persisted without ontology enrichment.
 *
 * @param userMessage - The raw message text to analyze.
 * @param context     - Recent conversation turns for disambiguation.
 * @returns Validated and filtered ontology metadata entries.
 */
export async function extractClinicalEntities(
  userMessage: string,
  context: string[] = [],
): Promise<ClinicalOntologyMetadata[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

  try {
    const contextBlock = context.length > 0
      ? `\n\nContexto conversacional reciente:\n${context.slice(-5).join('\n')}`
      : ''

    const result = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: `${userMessage}${contextBlock}`,
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: ENTITY_EXTRACTION_SCHEMA,
        temperature: 1.0, // Normalized to 1.0 per Google Gen AI SDK best practices for Gemini 3.X
        maxOutputTokens: 2048,
        abortSignal: controller.signal,
      },
    })

    clearTimeout(timeoutId)

    // Parse the structured JSON response
    const rawText = result.text ?? ''
    if (!rawText.trim()) {
      logger.warn('Entity extraction returned empty response')
      return []
    }

    const parsed: { entities: RawExtractedEntity[] } = JSON.parse(rawText)

    if (!Array.isArray(parsed.entities)) {
      logger.warn('Entity extraction: "entities" field is not an array')
      return []
    }

    // Filter + validate
    const validated: ClinicalOntologyMetadata[] = []
    for (const raw of parsed.entities) {
      // Confidence gate
      if (typeof raw.confidence !== 'number' || raw.confidence < MIN_CONFIDENCE) {
        continue
      }

      // Enum validation
      if (!isValidDomain(raw.domain)) continue
      if (!isValidValence(raw.valence)) continue
      if (!isValidChronicity(raw.chronicity)) continue

      // Sanitize semantic tags (max 5, non-empty strings)
      const tags = Array.isArray(raw.semanticTags)
        ? raw.semanticTags.filter((t): t is string => typeof t === 'string' && t.length > 0).slice(0, 5)
        : []

      // SNOMED code: only retain when confidence exceeds SNOMED_CONFIDENCE threshold (0.7)
      const snomedCode = typeof raw.snomedCode === 'string' && raw.snomedCode.length > 0 && raw.confidence > SNOMED_CONFIDENCE
        ? raw.snomedCode
        : null

      validated.push({
        domain: raw.domain,
        valence: raw.valence,
        chronicity: raw.chronicity,
        snomedCode,
        dsm5Code: typeof raw.dsm5Code === 'string' && raw.dsm5Code.length > 0 ? raw.dsm5Code : null,
        semanticTags: tags,
      })
    }

    logger.debug('Clinical entities extracted', {
      rawCount: parsed.entities.length,
      validatedCount: validated.length,
    })

    return validated
  } catch (err) {
    clearTimeout(timeoutId)

    const errorMessage = err instanceof Error ? err.message : String(err)
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('AbortError')

    logger.warn('Entity extraction failed — returning empty fallback', {
      reason: isTimeout ? 'timeout' : 'api_error',
      error: errorMessage,
    })

    return []
  }
}
