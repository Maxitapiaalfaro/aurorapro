/**
 * Academic Multi-Source Search Engine
 *
 * Sistema de búsqueda concurrente que integra dos motores de evidencia científica:
 *
 *   Motor A — Parallel AI (parallel-web SDK)
 *     Búsqueda web controlada con dominios explícitos, excerpts LLM-optimizados.
 *
 *   Motor B — Gemini Google Search Grounding (@google/genai SDK)
 *     Llamada dedicada a generateContent con tools: [{ googleSearch: {} }].
 *     Parsea groundingMetadata.groundingChunks para obtener URLs y títulos.
 *
 * Orquestación: Promise.allSettled garantiza ejecución simétrica — si un motor
 * falla, el otro sigue proveyendo resultados.
 *
 * Fusión: Deduplicación por URL hostname + similitud de título (Jaccard ≥ 0.8).
 * Fuentes que aparecen en AMBOS motores reciben +15 trustScore (concordancia).
 *
 * Prioridad Terciaria (Fallback): PubMed y Crossref se mantienen como código
 * comentado para re-activación futura si ambos motores primarios fallan.
 */

import { pubmedTool } from './pubmed-research-tool'
import { crossrefDOIResolver } from './crossref-doi-resolver'
import { academicSourceValidator } from './academic-source-validator'
import { parallelAISearch } from './parallel-ai-search'
import { ai } from '@/lib/google-genai-config'
import type { ValidatedAcademicSource } from './academic-source-validator'
import type { CrossrefMetadata } from './crossref-doi-resolver'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface AcademicSearchParams {
  query: string
  maxResults?: number
  language?: 'es' | 'en' | 'both'
  dateRange?: {
    from?: string // YYYY-MM-DD
    to?: string   // YYYY-MM-DD
  }
  minTrustScore?: number // 0-100, default: 60
  requireDOI?: boolean // Si true, solo retorna resultados con DOI válido
}

export interface AcademicSearchResult {
  sources: ValidatedAcademicSource[]
  metadata: {
    totalFound: number
    fromPubMed: number
    fromCrossref: number
    fromParallelAI: number
    fromGeminiGrounding: number
    fromGoogleSearch: number // Deprecated: mantenido por compatibilidad
    averageTrustScore: number
    searchTime: number
  }
}

// ============================================================================
// GEMINI GROUNDING MODEL (Motor B)
// ============================================================================

const GEMINI_GROUNDING_MODEL = 'gemini-3.1-flash-lite-preview'

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Normaliza un hostname extrayendo el dominio de segundo nivel.
 * Ejemplo: "www.nature.com" → "nature.com", "pmc.ncbi.nlm.nih.gov" → "ncbi.nlm.nih.gov"
 */
function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url.toLowerCase()
  }
}

/**
 * Calcula similitud Jaccard entre dos títulos (tokenizados por palabra).
 * Retorna 0.0 – 1.0 donde 1.0 = idénticos.
 */
function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/gi, '').split(/\s+/).filter(Boolean))
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }
  return intersection / (setA.size + setB.size - intersection)
}

/**
 * Determina si dos fuentes son duplicadas (misma URL o título muy similar).
 */
function isDuplicate(a: ValidatedAcademicSource, b: ValidatedAcademicSource): boolean {
  // Dedup por URL exacta
  if (a.url === b.url) return true
  // Dedup por título similar (Jaccard ≥ 0.8)
  if (a.title && b.title && titleSimilarity(a.title, b.title) >= 0.8) return true
  return false
}

// ============================================================================
// GEMINI GROUNDING MAPPER
// ============================================================================

/**
 * Adapta groundingMetadata.groundingChunks al formato ValidatedAcademicSource[].
 * Función adaptadora local conforme al Mecanismo de Recuperación (§3).
 */
function mapGroundingChunksToSources(
  groundingChunks: Array<{
    web?: { uri?: string; title?: string; domain?: string }
  }>,
  responseText: string,
  webSearchQueries?: string[]
): ValidatedAcademicSource[] {
  const sources: ValidatedAcademicSource[] = []
  const seenUrls = new Set<string>()

  for (const chunk of groundingChunks) {
    const web = chunk.web
    if (!web?.uri) continue

    // Dedup dentro del propio Motor B
    const normalizedUrl = normalizeHostname(web.uri)
    if (seenUrls.has(web.uri)) continue
    seenUrls.add(web.uri)

    // Calcular trust score base para resultados de Gemini Grounding
    let trustScore = 55 // Base ligeramente superior (Google pre-filtra)
    try {
      const hostname = new URL(web.uri).hostname.toLowerCase()
      // Bonus por dominio académico conocido — proper suffix matching
      const academicDomains = [
        'pubmed.ncbi.nlm.nih.gov', 'cochranelibrary.com', 'jamanetwork.com',
        'nature.com', 'thelancet.com', 'psycnet.apa.org', 'sciencedirect.com',
        'frontiersin.org', 'bmj.com', 'springer.com', 'wiley.com',
        'tandfonline.com', 'plos.org', 'academic.oup.com', 'sagepub.com'
      ]
      const matchesDomain = (host: string, domain: string): boolean =>
        host === domain || host.endsWith(`.${domain}`)
      if (academicDomains.some(d => matchesDomain(hostname, d))) {
        trustScore += 25
      }
    } catch { /* URL inválida — keep base score */ }

    // Extraer DOI si existe en la URL
    const doiMatch = web.uri.match(/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)
    const doi = doiMatch ? doiMatch[1].replace(/[.,;)\]>]+$/, '') : undefined

    if (doi) trustScore += 10

    sources.push({
      url: web.uri,
      title: web.title || 'Sin título',
      doi,
      authors: [],
      year: undefined,
      journal: undefined,
      abstract: responseText.substring(0, 500),
      sourceType: 'generic' as const, // Gemini grounding no es un sourceType declarado
      trustScore: Math.min(100, Math.max(0, trustScore)),
      isAccessible: true,
      validatedAt: new Date(),
      excerpts: webSearchQueries ?? [],
    })
  }

  return sources
}

// ============================================================================
// MOTOR B: Gemini Google Search Grounding
// ============================================================================

/**
 * Ejecuta una búsqueda de evidencia académica usando Gemini con Google Search Grounding.
 * Llamada dedicada a generateContent con tools: [{ googleSearch: {} }] como única herramienta.
 */
async function executeGeminiGroundingSearch(query: string): Promise<ValidatedAcademicSource[]> {
  try {
    const prompt = `Busca evidencia científica reciente y revisada por pares sobre el siguiente tema clínico. Proporciona URLs, títulos, autores y hallazgos clave de las fuentes más relevantes. Prioriza meta-análisis, revisiones sistemáticas y ensayos controlados aleatorizados de los últimos 5 años.

Tema: ${query}

Responde con un resumen estructurado de las fuentes encontradas, incluyendo DOI cuando esté disponible.`

    const response = await ai.models.generateContent({
      model: GEMINI_GROUNDING_MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8000,
        temperature: 0.1,
      },
    })

    // Extraer groundingMetadata del primer candidato
    const candidate = response.candidates?.[0]
    const groundingMetadata = candidate?.groundingMetadata
    const groundingChunks = groundingMetadata?.groundingChunks

    if (!groundingChunks || groundingChunks.length === 0) {
      logger.info('[GeminiGrounding] No se encontraron groundingChunks en la respuesta')
      return []
    }

    logger.info(`[GeminiGrounding] Encontrados ${groundingChunks.length} groundingChunks`)

    return mapGroundingChunksToSources(
      groundingChunks,
      response.text ?? '',
      groundingMetadata?.webSearchQueries
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`[GeminiGrounding] Error en búsqueda: ${message}`)
    return []
  }
}

// ============================================================================
// CLASE PRINCIPAL: AcademicMultiSourceSearch
// ============================================================================

export class AcademicMultiSourceSearch {
  private searchCache: Map<string, AcademicSearchResult> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas

  /**
   * Búsqueda académica concurrente — Motor A (Parallel AI) + Motor B (Gemini Grounding)
   */
  async search(params: AcademicSearchParams): Promise<AcademicSearchResult> {
    const startTime = Date.now()
    const {
      query,
      maxResults = 10,
      language = 'both',
      dateRange,
      minTrustScore = 60,
      requireDOI = false
    } = params

    // Verificar caché
    const cacheKey = JSON.stringify(params)
    const cached = this.searchCache.get(cacheKey)
    if (cached) {
      logger.info('[AcademicSearch] Retornando desde caché')
      return cached
    }

    let parallelAICount = 0
    let geminiGroundingCount = 0
    let pubmedCount = 0
    let crossrefCount = 0

    // ========================================================================
    // EJECUCIÓN CONCURRENTE: Motor A + Motor B via Promise.allSettled
    // ========================================================================

    logger.info('[AcademicSearch] Iniciando ejecución concurrente — Motor A (Parallel AI) + Motor B (Gemini Grounding)')

    // --- Motor A: Parallel AI ---
    const motorAPromise = (async (): Promise<ValidatedAcademicSource[]> => {
      if (!parallelAISearch.isAvailable()) {
        logger.warn('[AcademicSearch] Motor A: Parallel AI no disponible')
        return []
      }
      try {
        const academicQueries = this.generateAcademicQueries(query)
        const objective = this.buildSearchObjective(query)

        const results = await parallelAISearch.searchAcademic({
          objective,
          searchQueries: academicQueries,
          maxResults,
          maxCharsPerResult: 15000,
        })
        logger.info(`[AcademicSearch] Motor A completado: ${results.length} resultados`)
        return results
      } catch (error) {
        logger.error('[AcademicSearch] Motor A falló:', error)
        return []
      }
    })()

    // --- Motor B: Gemini Google Search Grounding ---
    const motorBPromise = (async (): Promise<ValidatedAcademicSource[]> => {
      try {
        const results = await executeGeminiGroundingSearch(
          this.enhanceQueryForPsychology(query)
        )
        logger.info(`[AcademicSearch] Motor B completado: ${results.length} resultados`)
        return results
      } catch (error) {
        logger.error('[AcademicSearch] Motor B falló:', error)
        return []
      }
    })()

    // Ejecución simétrica — ningún motor bloquea al otro
    const [motorAResult, motorBResult] = await Promise.allSettled([motorAPromise, motorBPromise])

    const parallelAISources = motorAResult.status === 'fulfilled' ? motorAResult.value : []
    const geminiSources = motorBResult.status === 'fulfilled' ? motorBResult.value : []

    parallelAICount = parallelAISources.length
    geminiGroundingCount = geminiSources.length

    logger.info(`[AcademicSearch] Motor A: ${parallelAICount} | Motor B: ${geminiGroundingCount}`)

    // ========================================================================
    // FUSIÓN Y DEDUPLICACIÓN CON INTER-ENGINE BOOST
    // ========================================================================

    const allSources: ValidatedAcademicSource[] = []

    // 1. Agregar todas las fuentes del Motor A
    allSources.push(...parallelAISources)

    // 2. Fusionar Motor B con deduplicación + concordancia boost
    for (const geminiSource of geminiSources) {
      const existingMatch = allSources.find(existing => isDuplicate(existing, geminiSource))

      if (existingMatch) {
        // Concordancia inter-motor: +15 trustScore al existente
        existingMatch.trustScore = Math.min(100, existingMatch.trustScore + 15)
        logger.info(`[AcademicSearch] Concordancia inter-motor: +15 trustScore → "${existingMatch.title?.substring(0, 50)}..."`)
      } else {
        // Fuente nueva — agregar
        allSources.push(geminiSource)
      }
    }

    // ========================================================================
    // PRIORIDAD TERCIARIA (FALLBACK): PubMed + Crossref
    // ========================================================================
    // Código heredado mantenido como fallback. Des-comentar si ambos motores
    // primarios están degradados o si se necesita complementar con fuentes
    // adicionales para alcanzar maxResults.
    /*
    // --- PubMed Fallback ---
    try {
      const pubmedResults = await pubmedTool.searchPubMed({
        query,
        maxResults: Math.min(maxResults, 20),
        dateRange: this.convertDateRangeToPubMed(dateRange),
        sortBy: 'relevance',
        language,
        validateDOIs: true
      })

      for (const article of pubmedResults) {
        const validationResult = await academicSourceValidator.validateSource({
          url: article.url,
          title: article.title,
          doi: article.doi,
          authors: article.authors,
          year: article.year,
          journal: article.journal,
          abstract: article.abstract
        })

        if (validationResult.isValid && validationResult.source) {
          validationResult.source.sourceType = 'pubmed'
          allSources.push(validationResult.source)
          pubmedCount++
        }
      }

      logger.info(`[AcademicSearch] PubMed fallback: ${pubmedCount} resultados válidos`)
    } catch (error) {
      logger.warn('[AcademicSearch] Error en PubMed fallback:', error)
    }

    // --- Crossref Fallback ---
    if (allSources.length < maxResults) {
      logger.info('[AcademicSearch] Complementando con Crossref fallback...')
      try {
        const crossrefResults = await crossrefDOIResolver.searchByQuery({
          query: this.enhanceQueryForPsychology(query),
          rows: maxResults,
          filter: {
            type: 'journal-article',
            fromPubDate: dateRange?.from || '2020-01-01',
            untilPubDate: dateRange?.to,
            hasAbstract: true
          },
          sort: 'relevance'
        })

        for (const metadata of crossrefResults) {
          const isDup = allSources.some(s => s.doi === metadata.doi)
          if (isDup) continue

          const validationResult = await academicSourceValidator.validateSource({
            url: metadata.url,
            title: metadata.title,
            doi: metadata.doi,
            authors: metadata.authors,
            year: metadata.year,
            journal: metadata.journal,
            abstract: metadata.abstract
          })

          if (validationResult.isValid && validationResult.source) {
            validationResult.source.sourceType = 'crossref'
            allSources.push(validationResult.source)
            crossrefCount++
          }
        }

        logger.info(`[AcademicSearch] Crossref fallback: ${crossrefCount} resultados válidos`)
      } catch (error) {
        logger.warn('[AcademicSearch] Error en Crossref fallback:', error)
      }
    }
    */

    // ========================================================================
    // FILTRADO Y ORDENAMIENTO FINAL
    // ========================================================================

    // Filtrar por trust score mínimo
    let filteredSources = allSources.filter(s => s.trustScore >= minTrustScore)

    // Filtrar por DOI si es requerido
    if (requireDOI) {
      filteredSources = filteredSources.filter(s => s.doi && s.doi.length > 0)
    }

    // Ordenar por trust score descendente
    filteredSources.sort((a, b) => b.trustScore - a.trustScore)

    // Limitar a maxResults
    filteredSources = filteredSources.slice(0, maxResults)

    // Calcular métricas
    const averageTrustScore = filteredSources.length > 0
      ? filteredSources.reduce((sum, s) => sum + s.trustScore, 0) / filteredSources.length
      : 0

    const result: AcademicSearchResult = {
      sources: filteredSources,
      metadata: {
        totalFound: allSources.length,
        fromPubMed: pubmedCount,
        fromCrossref: crossrefCount,
        fromParallelAI: parallelAICount,
        fromGeminiGrounding: geminiGroundingCount,
        fromGoogleSearch: 0, // Deprecated: mantenido por compatibilidad
        averageTrustScore: Math.round(averageTrustScore),
        searchTime: Date.now() - startTime
      }
    }

    // Guardar en caché
    this.searchCache.set(cacheKey, result)
    this.cleanCache()

    logger.info(`[AcademicSearch] Búsqueda completada: ${filteredSources.length} resultados en ${result.metadata.searchTime}ms (A:${parallelAICount} B:${geminiGroundingCount})`)

    return result
  }

  // ==========================================================================
  // HELPERS PRIVADOS
  // ==========================================================================

  /**
   * Construye el objective para Parallel AI con instrucciones detalladas.
   */
  private buildSearchObjective(query: string): string {
    return `
OBJETIVO DE INVESTIGACIÓN:
Buscar investigación académica revisada por pares sobre: ${this.enhanceQueryForPsychology(query)}

ÁREAS DE ENFOQUE:
- Psicología clínica y psicoterapia
- Intervenciones y tratamientos basados en evidencia
- Estudios recientes de fuentes académicas confiables (preferiblemente últimos 5 años)
- Meta-análisis, revisiones sistemáticas y ensayos controlados aleatorizados (RCTs)

CRITERIOS DE CALIDAD:
- Revistas revisadas por pares con alto factor de impacto
- Estudios con metodología robusta y muestras grandes
- Investigación de instituciones y autores reconocidos

REQUISITOS DE CONTENIDO:
- Incluir DOI cuando esté disponible
- Extraer nombres de autores, año de publicación e información de la revista
- Priorizar resúmenes (abstracts) y hallazgos clave
- Enfocarse en aplicaciones clínicas prácticas

CONTEXTO CLÍNICO: Esta búsqueda es para profesionales de salud mental que necesitan evidencia científica actualizada para su práctica profesional.
`.trim()
  }

  /**
   * Convierte dateRange al formato de PubMed (días relativos)
   */
  private convertDateRangeToPubMed(dateRange?: { from?: string; to?: string }): string | undefined {
    if (!dateRange?.from) return 'last_5_years'

    const fromDate = new Date(dateRange.from)
    const now = new Date()
    const daysDiff = Math.floor((now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysDiff <= 365) return 'last_year'
    if (daysDiff <= 1825) return 'last_5_years'
    if (daysDiff <= 3650) return 'last_10_years'

    return undefined // Sin filtro de fecha
  }

  /**
   * Mejora query para búsqueda en psicología
   */
  private enhanceQueryForPsychology(query: string): string {
    const psychologyTerms = [
      'psychology',
      'psychotherapy',
      'mental health',
      'clinical',
      'cognitive behavioral',
      'therapy'
    ]

    const lowerQuery = query.toLowerCase()
    const hasPsychologyTerm = psychologyTerms.some(term => lowerQuery.includes(term))

    if (!hasPsychologyTerm) {
      return `${query} psychology OR psychotherapy OR mental health`
    }

    return query
  }

  /**
   * Genera queries académicos específicos para Parallel AI
   * IMPORTANTE: Cada query debe tener máximo 200 caracteres (límite de API)
   */
  private generateAcademicQueries(query: string): string[] {
    const MAX_QUERY_LENGTH = 200
    const queries: string[] = []

    const truncateQuery = (q: string): string => {
      if (q.length <= MAX_QUERY_LENGTH) return q
      const truncated = q.substring(0, MAX_QUERY_LENGTH)
      const lastSpace = truncated.lastIndexOf(' ')
      return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated
    }

    queries.push(truncateQuery(query))

    const academicQuery = `${query} investigación revisada por pares`
    queries.push(truncateQuery(academicQuery))

    if (!query.toLowerCase().includes('psicología') && !query.toLowerCase().includes('psychology')) {
      const psychologyQuery = `${query} psicología clínica`
      queries.push(truncateQuery(psychologyQuery))
    }

    const evidenceQuery = `${query} tratamiento basado en evidencia`
    queries.push(truncateQuery(evidenceQuery))

    const metaAnalysisQuery = `${query} meta-análisis revisión sistemática`
    queries.push(truncateQuery(metaAnalysisQuery))

    // Limitar a 5 queries máximo (límite de Parallel AI)
    return queries.slice(0, 5)
  }

  /**
   * Limpia entradas de caché antiguas
   */
  private cleanCache(): void {
    if (this.searchCache.size > 100) {
      const entries = Array.from(this.searchCache.entries())
      entries.slice(0, entries.length - 50).forEach(([key]) => {
        this.searchCache.delete(key)
      })
    }
  }

  /**
   * Limpia toda la caché
   */
  clearCache(): void {
    this.searchCache.clear()
  }

  /**
   * Búsqueda rápida solo en PubMed (para casos donde se necesita velocidad)
   */
  async searchPubMedOnly(params: Omit<AcademicSearchParams, 'requireDOI'>): Promise<ValidatedAcademicSource[]> {
    const { query, maxResults = 10, language = 'both', dateRange } = params

    try {
      const pubmedResults = await pubmedTool.searchPubMed({
        query,
        maxResults,
        dateRange: this.convertDateRangeToPubMed(dateRange),
        sortBy: 'relevance',
        language,
        validateDOIs: true
      })

      const validatedSources: ValidatedAcademicSource[] = []

      for (const article of pubmedResults) {
        const validationResult = await academicSourceValidator.validateSource({
          url: article.url,
          title: article.title,
          doi: article.doi,
          authors: article.authors,
          year: article.year,
          journal: article.journal,
          abstract: article.abstract
        })

        if (validationResult.isValid && validationResult.source) {
          validationResult.source.sourceType = 'pubmed'
          validatedSources.push(validationResult.source)
        }
      }

      return validatedSources
    } catch (error) {
      logger.error('[AcademicSearch] Error en searchPubMedOnly:', error)
      return []
    }
  }
}

// Singleton instance
export const academicMultiSourceSearch = new AcademicMultiSourceSearch()
