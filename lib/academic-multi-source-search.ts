/**
 * Academic Multi-Source Search Engine
 *
 * Sistema de búsqueda priorizada que integra múltiples fuentes académicas:
 * 🧪 MODO ACTUAL: Parallel AI como prioridad 1 (testing)
 * 1. Parallel AI (búsqueda web avanzada con excerpts optimizados para LLMs)
 *    - Validación integrada (sin filtrado adicional para maximizar resultados)
 *    - Dominios académicos en español configurados (SciELO, Redalyc, etc.)
 * 2. PubMed (deshabilitado temporalmente)
 * 3. Crossref (deshabilitado temporalmente)
 *
 * OPTIMIZACIÓN: ParallelAI ya valida fuentes, no se aplica filtrado adicional
 */

import { pubmedTool } from './pubmed-research-tool'
import { crossrefDOIResolver } from './crossref-doi-resolver'
import { academicSourceValidator } from './academic-source-validator'
import { parallelAISearch } from './parallel-ai-search'
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
    fromGoogleSearch: number // Deprecated: mantenido por compatibilidad
    averageTrustScore: number
    searchTime: number
  }
}

// ============================================================================
// CLASE PRINCIPAL: AcademicMultiSourceSearch
// ============================================================================

export class AcademicMultiSourceSearch {
  private searchCache: Map<string, AcademicSearchResult> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas

  /**
   * Búsqueda académica multi-fuente con priorización inteligente
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

    const allSources: ValidatedAcademicSource[] = []
    let pubmedCount = 0
    let crossrefCount = 0
    let parallelAICount = 0
    let googleSearchCount = 0 // Deprecated: mantenido por compatibilidad

    // ========================================================================
    // 🧪 MODO PRUEBA: PRIORIDAD 1 - Parallel AI (FORZADO PARA TESTING)
    // ========================================================================
    // TODO: Revertir a prioridad 3 después de pruebas
    if (parallelAISearch.isAvailable()) {
      logger.info('🧪 [AcademicSearch] MODO PRUEBA: Usando Parallel AI como prioridad 1...')
      try {
        const academicQueries = this.generateAcademicQueries(query)

        // 📝 Objective expandido con instrucciones detalladas en español
        const objective = `
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
- Priorizar fuentes en español de Latinoamérica y España

REQUISITOS DE CONTENIDO:
- Incluir DOI cuando esté disponible
- Extraer nombres de autores, año de publicación e información de la revista
- Priorizar resúmenes (abstracts) y hallazgos clave
- Enfocarse en aplicaciones clínicas prácticas

IDIOMA: Priorizar fuentes en español, pero incluir fuentes en inglés de alta calidad si son relevantes.

CONTEXTO CLÍNICO: Esta búsqueda es para psicólogos clínicos en Latinoamérica que necesitan evidencia científica actualizada para su práctica profesional.
`.trim()

        const parallelResults = await parallelAISearch.searchAcademic({
          objective,
          searchQueries: academicQueries,
          maxResults: maxResults,
          maxCharsPerResult: 15000, // Aumentado de 6000 a 15000 para mayor contexto académico
          processor: 'base' // Mantener 'base' por ahora para velocidad
        })

        // ✅ OPTIMIZACIÓN: Confiar 100% en ParallelAI
        // ParallelAI ya validó las fuentes, extrajo metadata y calculó trustScore
        // No necesitamos re-validar con academicSourceValidator (elimina redundancia)

        // Agregar resultados directamente
        allSources.push(...parallelResults)
        parallelAICount = parallelResults.length

        logger.info(`🧪 [AcademicSearch] Parallel AI: ${parallelAICount} resultados válidos (sin filtrado adicional)`)
        logger.info(`🧪 [AcademicSearch] SALTANDO PubMed y Crossref (modo prueba)`)
      } catch (error) {
        logger.error('🧪 [AcademicSearch] Error en Parallel AI:', error)
      }
    } else {
      logger.warn('🧪 [AcademicSearch] Parallel AI no disponible - cayendo a flujo normal')
    }

    // ========================================================================
    // PRIORIDAD 2: PubMed (DESHABILITADO EN MODO PRUEBA)
    // ========================================================================
    // Descomentar para volver a flujo normal
    /*
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

      logger.info(`[AcademicSearch] PubMed: ${pubmedCount} resultados válidos`)
    } catch (error) {
      logger.warn('[AcademicSearch] Error en PubMed:', error)
    }
    */

    // ========================================================================
    // PRIORIDAD 3: Crossref (DESHABILITADO EN MODO PRUEBA)
    // ========================================================================
    /*
    if (allSources.length < maxResults) {
      logger.info('[AcademicSearch] Complementando con Crossref...')
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

        // Convertir a ValidatedAcademicSource
        for (const metadata of crossrefResults) {
          // Evitar duplicados (mismo DOI que PubMed)
          const isDuplicate = allSources.some(s => s.doi === metadata.doi)
          if (isDuplicate) continue

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
            // Forzar sourceType a crossref
            validationResult.source.sourceType = 'crossref'
            allSources.push(validationResult.source)
            crossrefCount++
          }
        }

        logger.info(`[AcademicSearch] Crossref: ${crossrefCount} resultados válidos`)
      } catch (error) {
        logger.warn('[AcademicSearch] Error en Crossref:', error)
      }
    }

    // ========================================================================
    // PRIORIDAD 4: Parallel AI (DESHABILITADO - ya se ejecutó en prioridad 1)
    // ========================================================================
    // Esta sección está comentada porque Parallel AI ya se ejecutó arriba en modo prueba
    /*
    if (allSources.length < maxResults && parallelAISearch.isAvailable()) {
      logger.info('[AcademicSearch] Complementando con Parallel AI...')
      ...código comentado...
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
        fromGoogleSearch: googleSearchCount,
        averageTrustScore: Math.round(averageTrustScore),
        searchTime: Date.now() - startTime
      }
    }

    // Guardar en caché
    this.searchCache.set(cacheKey, result)
    this.cleanCache()

    logger.info(`[AcademicSearch] Búsqueda completada: ${filteredSources.length} resultados en ${result.metadata.searchTime}ms`)

    return result
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
    // Agregar términos de psicología si no están presentes
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
    const MAX_QUERY_LENGTH = 200 // Límite de Parallel AI por query individual
    const queries: string[] = []

    // Helper para truncar queries que excedan el límite
    const truncateQuery = (q: string): string => {
      if (q.length <= MAX_QUERY_LENGTH) return q
      // Truncar en el último espacio antes del límite para no cortar palabras
      const truncated = q.substring(0, MAX_QUERY_LENGTH)
      const lastSpace = truncated.lastIndexOf(' ')
      return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated
    }

    // Query principal (truncado si es necesario)
    queries.push(truncateQuery(query))

    // Query con términos académicos
    const academicQuery = `${query} investigación revisada por pares`
    queries.push(truncateQuery(academicQuery))

    // Query con enfoque en psicología clínica
    if (!query.toLowerCase().includes('psicología') && !query.toLowerCase().includes('psychology')) {
      const psychologyQuery = `${query} psicología clínica`
      queries.push(truncateQuery(psychologyQuery))
    }

    // Query con enfoque en evidencia
    const evidenceQuery = `${query} tratamiento basado en evidencia`
    queries.push(truncateQuery(evidenceQuery))

    // Query con enfoque en meta-análisis
    const metaAnalysisQuery = `${query} meta-análisis revisión sistemática`
    queries.push(truncateQuery(metaAnalysisQuery))

    // Limitar a 5 queries máximo (límite de Parallel AI)
    const finalQueries = queries.slice(0, 5)

    // Log de validación
    finalQueries.forEach((q, index) => {
      if (q.length > MAX_QUERY_LENGTH) {
        logger.warn(`[AcademicSearch] Query ${index + 1} excede ${MAX_QUERY_LENGTH} caracteres: ${q.length}`)
      }
    })

    return finalQueries
  }

  /**
   * Limpia entradas de caché antiguas
   */
  private cleanCache(): void {
    if (this.searchCache.size > 100) {
      // Mantener solo las últimas 50 búsquedas
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

