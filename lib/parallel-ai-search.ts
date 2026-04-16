/**
 * Parallel AI Search Integration
 *
 * Motor A del sistema de búsqueda concurrente de evidencia científica.
 * Utiliza Parallel AI para investigación académica con excerpts optimizados para LLMs.
 *
 * Ventajas:
 * - Excerpts optimizados para consumo de LLMs
 * - Búsqueda semántica con objective + search_queries
 * - Control granular de dominios (source_policy.include_domains, max 10)
 * - Rate limits generosos (600 req/min)
 *
 * Dominios: Top 10 globales seleccionados por factor de impacto y rigurosidad (2026).
 * Last modified: 2026-04-15 — Phase 2 concurrent engine refactor
 */

import Parallel from 'parallel-web'
import type { ValidatedAcademicSource } from './academic-source-validator'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

// ============================================================================
// INTERFACES
// ============================================================================

export interface ParallelSearchParams {
  objective: string
  searchQueries?: string[]
  maxResults?: number
  /** Max characters per individual result excerpt. */
  maxCharsPerResult?: number
  /** Budget cap: max characters across all excerpts combined. */
  maxCharsTotal?: number
  sourceDomains?: {
    include?: string[]
    exclude?: string[]
  }
  /** RFC 3339 date string (YYYY-MM-DD). Only return results published on or after this date. */
  afterDate?: string
  /** Fetch policy: controls cache and timeout behavior. */
  fetchPolicy?: {
    timeoutSeconds?: number
    maxAgeSeconds?: number
  }
}

export interface ParallelSearchResult {
  url: string
  title: string
  excerpts: string[]
}

// ============================================================================
// DOMINIOS ACADÉMICOS CONFIABLES (TIER SCORING FALLBACK)
// ============================================================================

const TRUSTED_ACADEMIC_DOMAINS = {
  tier1: [
    'pubmed.ncbi.nlm.nih.gov',
    'apa.org',
    'psycnet.apa.org',
    'cochranelibrary.com',
    'nature.com',
    'science.org',
    'thelancet.com',
    'bmj.com',
    'jamanetwork.com'
  ],
  tier2: [
    'sciencedirect.com',
    'springer.com',
    'wiley.com',
    'tandfonline.com',
    'sagepub.com',
    'frontiersin.org',
    'plos.org',
    'mdpi.com',
    'cambridge.org',
    'academic.oup.com'
  ],
  tier3: [
    'researchgate.net',
    'academia.edu',
    'scholar.google.com',
    'semanticscholar.org',
    'arxiv.org',
    'biorxiv.org',
    'psyarxiv.com'
  ]
}

// ============================================================================
// 🎯 TOP 10 DOMINIOS CLÍNICOS GLOBALES
// ============================================================================
// Selección autónoma basada en factor de impacto JCR 2025, cobertura Scopus/WoS,
// acceso programático y relevancia para psicología clínica y psiquiatría.
// ⚠️ LÍMITE DE API: Parallel AI permite máximo 10 dominios en include_domains

export const TOP_10_GLOBAL_CLINICAL_DOMAINS = [
  'pubmed.ncbi.nlm.nih.gov', // #1  — PubMed/MEDLINE: >35M records, gold standard biomédico
  'cochranelibrary.com',      // #2  — Cochrane: revisiones sistemáticas, máxima rigurosidad GRADE
  'jamanetwork.com',          // #3  — JAMA Psychiatry (IF ~17.1), JAMA Network Open
  'nature.com',               // #4  — Molecular Psychiatry (IF ~11.0), Nature Mental Health
  'thelancet.com',            // #5  — The Lancet Psychiatry (IF ~24.8), ensayos multicéntricos
  'psycnet.apa.org',          // #6  — APA: Annual Review of Clin. Psych. (IF ~18.98), PsycINFO
  'sciencedirect.com',        // #7  — Elsevier: Biological Psychiatry (IF ~9.0), RCTs
  'frontiersin.org',          // #8  — Frontiers in Psychiatry/Psychology, open-access, IF creciente
  'bmj.com',                  // #9  — Evidence-Based Mental Health (IF ~11.4), BMJ Open
  'springer.com',             // #10 — World Psychiatry (IF ~65.8), Psychotherapy & Psychosomatics
]

// Dominios a excluir por defecto
const EXCLUDED_DOMAINS = [
  'reddit.com',
  'quora.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'pinterest.com'
]

// ============================================================================
// CLASE PRINCIPAL: ParallelAISearch
// ============================================================================

export class ParallelAISearch {
  private client: Parallel | null = null
  private searchCache: Map<string, ParallelSearchResult[]> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas

  constructor(apiKey?: string) {
    // Solo inicializar si hay API key
    if (apiKey && apiKey.length > 0) {
      try {
        this.client = new Parallel({ apiKey })
        logger.info('[ParallelAI] Cliente inicializado correctamente')
      } catch (error) {
        logger.error('[ParallelAI] Error al inicializar cliente:', error)
        this.client = null
      }
    } else {
      logger.warn('[ParallelAI] No se proporcionó API key. Búsqueda deshabilitada.')
    }
  }

  /**
   * Verifica si el cliente está disponible
   */
  isAvailable(): boolean {
    return this.client !== null
  }

  /**
   * Búsqueda académica usando Parallel AI (Motor A)
   */
  async searchAcademic(params: ParallelSearchParams): Promise<ValidatedAcademicSource[]> {
    if (!this.client) {
      logger.warn('[ParallelAI] Cliente no disponible. Retornando array vacío.')
      return []
    }

    const {
      objective,
      searchQueries = [],
      maxResults = 10,
      maxCharsPerResult = 15000,
      maxCharsTotal = 50000,
      sourceDomains,
      afterDate,
      fetchPolicy,
    } = params

    // Verificar caché
    const cacheKey = JSON.stringify(params)
    const cached = this.searchCache.get(cacheKey)
    if (cached) {
      logger.info('[ParallelAI] Retornando desde caché')
      return this.transformToAcademicSources(cached)
    }

    try {
      logger.info('🔍 [ParallelAI] === MOTOR A: INICIANDO BÚSQUEDA ACADÉMICA ===')
      logger.info(`  📝 Objective: ${objective.substring(0, 100)}...`)
      logger.info(`  🔎 Queries: ${searchQueries.join(', ')}`)
      logger.info(`  📚 Dominios: Top 10 clínicos globales`)

      const search = await this.client.beta.search({
        objective,
        search_queries: searchQueries.length > 0 ? searchQueries : undefined,
        max_results: maxResults,
        excerpts: {
          max_chars_per_result: maxCharsPerResult,
          max_chars_total: maxCharsTotal,
        },
        source_policy: {
          include_domains: sourceDomains?.include ?? TOP_10_GLOBAL_CLINICAL_DOMAINS,
          ...(afterDate ? { after_date: afterDate } : {}),
        },
        ...(fetchPolicy ? {
          fetch_policy: {
            timeout_seconds: fetchPolicy.timeoutSeconds,
            max_age_seconds: fetchPolicy.maxAgeSeconds,
          },
        } : {}),
      })

      logger.info(`[ParallelAI] Encontrados ${search.results?.length || 0} resultados`)

      // Guardar en caché
      if (search.results && search.results.length > 0) {
        this.searchCache.set(cacheKey, search.results)
        
        // Limpiar caché antiguo
        setTimeout(() => {
          this.searchCache.delete(cacheKey)
        }, this.cacheTTL)
      }

      // Transformar a formato ValidatedAcademicSource
      return this.transformToAcademicSources(search.results || [])

    } catch (error) {
      logger.error('[ParallelAI] Error en búsqueda:', error)
      if (error instanceof Error) {
        logger.error('[ParallelAI] Error message:', error.message)
        logger.error('[ParallelAI] Error stack:', error.stack)
      }
      // Log del objeto completo para debugging
      logger.error('[ParallelAI] Error object:', JSON.stringify(error, null, 2))
      return []
    }
  }

  /**
   * Transforma resultados de Parallel AI al formato ValidatedAcademicSource
   */
  private transformToAcademicSources(results: any[]): ValidatedAcademicSource[] {
    return results.map(result => {
      const excerpts = Array.isArray(result.excerpts) ? result.excerpts : []
      const fullText = excerpts.join(' ')
      
      return {
        url: result.url || '',
        title: result.title || 'Sin título',
        doi: this.extractDOI(fullText),
        authors: this.extractAuthors(fullText),
        year: this.extractYear(fullText),
        journal: this.extractJournal(result.title, fullText),
        abstract: excerpts.length > 0 ? excerpts[0] : '',
        sourceType: 'parallel_ai' as const,
        trustScore: this.calculateTrustScore(result),
        isAccessible: true,
        validatedAt: new Date(), // Debe ser Date, no string
        excerpts // Mantener excerpts originales de Parallel AI
      }
    })
  }

  /**
   * Extrae DOI de texto usando regex con validación robusta
   */
  private extractDOI(text: string): string | undefined {
    // Patrones académicos específicos para DOI
    const doiPatterns = [
      /(?:DOI|doi)\s*:?\s*(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i,
      /https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i,
      /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]{6,})/  // DOI standalone con longitud mínima
    ]

    for (const pattern of doiPatterns) {
      const match = text.match(pattern)
      if (match) {
        let doi = match[1] || match[0]
        // Limpiar prefijos
        doi = doi.replace(/^(?:DOI|doi)\s*:?\s*/i, '')
        doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        // Limpiar sufijos comunes
        doi = doi.replace(/[.,;)\]>]+$/, '')
        
        // Validar formato básico: debe tener 10.xxxx/yyyy
        if (/^10\.\d{4,9}\/[-._;()/:A-Z0-9]{6,}$/i.test(doi)) {
          return doi
        }
      }
    }

    return undefined
  }

  /**
   * Extrae autores de texto buscando patrones académicos específicos
   */
  private extractAuthors(text: string): string[] {
    // Palabras comunes a filtrar (no son nombres de autores)
    const commonWords = new Set([
      'Last', 'First', 'Next', 'Previous', 'Abstract', 'Introduction', 
      'Methods', 'Results', 'Discussion', 'Conclusion', 'References',
      'Published', 'Received', 'Accepted', 'Available', 'Copyright',
      'License', 'Open', 'Access', 'Article', 'Journal', 'Volume',
      'Issue', 'Page', 'Pages', 'Figure', 'Table', 'Supplementary',
      'Materials', 'Data', 'Code', 'Availability', 'Funding', 'Conflict',
      'Interest', 'Acknowledgments', 'Ethics', 'Statement'
    ])

    const authors: string[] = []

    // Patrón 1: "Authors: Apellido A, Apellido B, et al."
    const authorsLinePattern = /(?:Authors?|By)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?)*(?:,?\s+(?:and|&)\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?)?(?:,?\s+et\s+al\.?)?)/i
    const authorsLineMatch = text.match(authorsLinePattern)
    if (authorsLineMatch) {
      const authorsText = authorsLineMatch[1]
      const authorsList = authorsText.split(/,\s*(?:and|&)?\s*|\s+and\s+|\s+&\s+/)
        .map(a => a.trim())
        .filter(a => a.length > 2 && !a.match(/^et\s+al/i))
        .slice(0, 3)
      return authorsList.filter(a => !commonWords.has(a))
    }

    // Patrón 2: "Apellido, N., Apellido, M., & Apellido, P. (año)"
    const citationPattern = /([A-Z][a-z]+,\s+[A-Z]\.(?:,\s+[A-Z][a-z]+,\s+[A-Z]\.)*(?:,?\s+&\s+[A-Z][a-z]+,\s+[A-Z]\.)?)\s+\(\d{4}\)/
    const citationMatch = text.match(citationPattern)
    if (citationMatch) {
      const authorsText = citationMatch[1]
      const authorsList = authorsText.split(/,\s*&\s*|,\s+(?=[A-Z][a-z]+,)/)
        .map(a => a.trim().replace(/,\s+[A-Z]\.$/, ''))  // Remover inicial
        .filter(a => a.length > 2)
        .slice(0, 3)
      return authorsList.filter(a => !commonWords.has(a))
    }

    return []
  }

  /**
   * Extrae año de publicación buscando contexto académico
   */
  private extractYear(text: string): number | undefined {
    // Patrón 1: "Published: 2023" o "(2023)"
    const publishedPattern = /(?:Published|Publication|Copyright|©)\s*:?\s*(\d{4})|\((\d{4})\)/i
    const publishedMatch = text.match(publishedPattern)
    if (publishedMatch) {
      const year = parseInt(publishedMatch[1] || publishedMatch[2])
      if (year >= 1900 && year <= 2026) {
        return year
      }
    }

    // Patrón 2: "Apellido et al. (2023)"
    const citationYearPattern = /[A-Z][a-z]+(?:\s+et\s+al\.?)?\s*\((\d{4})\)/
    const citationMatch = text.match(citationYearPattern)
    if (citationMatch) {
      const year = parseInt(citationMatch[1])
      if (year >= 1900 && year <= 2026) {
        return year
      }
    }

    // Patrón 3: Buscar año más reciente en el texto (menos confiable)
    const yearPattern = /\b(20[0-2][0-9]|19[89][0-9])\b/g
    const matches = text.match(yearPattern)
    if (matches && matches.length > 0) {
      const years = matches.map(y => parseInt(y)).filter(y => y >= 1990 && y <= 2026)
      if (years.length > 0) {
        return Math.max(...years)
      }
    }

    return undefined
  }

  /**
   * Extrae nombre de journal buscando patrones académicos específicos
   */
  private extractJournal(title: string, text: string): string | undefined {
    // Patrón 1: "Published in Journal Name" o "Journal: Journal Name"
    const publishedInPattern = /(?:Published in|Journal|Source)\s*:?\s+([A-Z][A-Za-z\s&-]+(?:Journal|Review|Medicine|Psychology|Psychiatry|Science|Research|Proceedings|Letters|Reports))/i
    const publishedMatch = text.match(publishedInPattern)
    if (publishedMatch) {
      const journal = publishedMatch[1].trim()
      if (journal.length > 5 && journal.length < 100) {
        return journal
      }
    }

    // Patrón 2: Buscar nombre de journal en el título (ej: "Article Title - Journal Name")
    const titleJournalPattern = /[-–—]\s*([A-Z][A-Za-z\s&-]+(?:Journal|Review|Medicine|Psychology|Psychiatry|Science|Research))\s*$/
    const titleMatch = title.match(titleJournalPattern)
    if (titleMatch) {
      const journal = titleMatch[1].trim()
      if (journal.length > 5 && journal.length < 100) {
        return journal
      }
    }

    // Patrón 3: "Journal of [Topic]" standalone
    const journalOfPattern = /\b((?:Journal|International Journal|European Journal|American Journal|British Journal) of [A-Za-z\s&-]+)/i
    const journalOfMatch = text.match(journalOfPattern)
    if (journalOfMatch) {
      const journal = journalOfMatch[1].trim()
      // Validar que no sea demasiado largo (probablemente capturó demasiado contexto)
      if (journal.length > 10 && journal.length < 80) {
        return journal
      }
    }

    return undefined
  }

  /**
   * Calcula trust score basado en dominio y presencia de DOI
   */
  private calculateTrustScore(result: any): number {
    let score = 50 // Base score

    try {
      const hostname = new URL(result.url).hostname.toLowerCase()

      /**
       * Checks if hostname matches a domain (exact or subdomain).
       * E.g. matchesDomain("www.thelancet.com", "thelancet.com") → true
       *      matchesDomain("notthelancet.com", "thelancet.com") → false
       */
      const matchesDomain = (host: string, domain: string): boolean =>
        host === domain || host.endsWith(`.${domain}`)
      
      // Factor 1: Dominios clínicos globales de alto impacto (PRIORIDAD MÁXIMA)
      const isTopGlobalDomain = TOP_10_GLOBAL_CLINICAL_DOMAINS.some(domain => 
        matchesDomain(hostname, domain.toLowerCase())
      )
      
      if (isTopGlobalDomain) {
        score += 35
        // Bonus adicional para fuentes de máximo factor de impacto
        if (matchesDomain(hostname, 'cochranelibrary.com') || matchesDomain(hostname, 'thelancet.com')) {
          score += 5 // Total: +40
        }
      } else {
        // Fallback a sistema de tiers (para resultados fuera de los 10 dominios)
        if (TRUSTED_ACADEMIC_DOMAINS.tier1.some(domain => matchesDomain(hostname, domain))) {
          score += 30
        } else if (TRUSTED_ACADEMIC_DOMAINS.tier2.some(domain => matchesDomain(hostname, domain))) {
          score += 20
        } else if (TRUSTED_ACADEMIC_DOMAINS.tier3.some(domain => matchesDomain(hostname, domain))) {
          score += 10
        }
      }

      // Factor 2: Presencia de DOI en excerpts
      const fullText = Array.isArray(result.excerpts) ? result.excerpts.join(' ') : ''
      if (this.extractDOI(fullText)) {
        score += 15
      }

      // Factor 3: Longitud de excerpts (más contenido = más confiable)
      if (fullText.length > 1000) {
        score += 5
      }

    } catch (error) {
      // URL inválida
      score -= 20
    }

    return Math.min(100, Math.max(0, score))
  }
}

// ============================================================================
// INSTANCIA SINGLETON (SOLO SERVIDOR)
// ============================================================================

// Solo inicializar en el servidor para evitar problemas de CORS
const isServer = typeof window === 'undefined'

export const parallelAISearch = isServer
  ? new ParallelAISearch(process.env.PARALLEL_API_KEY) // Variable de servidor (sin NEXT_PUBLIC_)
  : new ParallelAISearch() // Cliente sin API key (deshabilitado)

