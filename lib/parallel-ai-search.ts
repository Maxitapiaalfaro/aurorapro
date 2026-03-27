/**
 * Parallel AI Search Integration
 *
 * Sistema de búsqueda web avanzada usando Parallel AI para investigación académica.
 * Optimizado para retornar excerpts comprimidos y rankeados específicamente para LLMs.
 *
 * Ventajas sobre Google Search:
 * - Excerpts optimizados para consumo de LLMs
 * - Búsqueda semántica con objective + search_queries
 * - Control granular de dominios (include/exclude)
 * - Procesadores especializados (base/pro)
 * - Rate limits generosos (600 req/min)
 *
 * 🧪 MODO PRUEBA: Sin restricción de dominios (source_policy deshabilitado)
 * Last modified: 2025-01-18 - Removed domain restrictions
 */

import Parallel from 'parallel-web'
import type { ValidatedAcademicSource } from './academic-source-validator'

// ============================================================================
// INTERFACES
// ============================================================================

export interface ParallelSearchParams {
  objective: string
  searchQueries?: string[]
  maxResults?: number
  maxCharsPerResult?: number
  processor?: 'base' | 'pro'
  sourceDomains?: {
    include?: string[]
    exclude?: string[]
  }
}

export interface ParallelSearchResult {
  url: string
  title: string
  excerpts: string[]
}

// ============================================================================
// DOMINIOS ACADÉMICOS CONFIABLES
// ============================================================================

const TRUSTED_ACADEMIC_DOMAINS = {
  tier1: [
    'pubmed.ncbi.nlm.nih.gov',
    'apa.org',
    'psycnet.apa.org',
    'cochrane.org',
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
    'oxford.org'
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
// 🎯 TOP 10 DOMINIOS PARA PSICOLOGÍA CLÍNICA EN ESPAÑOL
// ============================================================================
// ⚠️ LÍMITE DE API: Parallel AI permite máximo 10 dominios en include_domains
// Estrategia: Priorizar fuentes académicas en español y latinoamericanas
// Documentación: https://docs.parallel.ai/resources/search-api#request-fields

const CLINICAL_PSYCHOLOGY_SPANISH_DOMAINS = [
  // 🇪🇸 Fuentes españolas de máxima calidad
  'scielo.org',              // #1 - Red Iberoamericana de revistas científicas (España + Latinoamérica)
  'redalyc.org',             // #2 - Red de Revistas Científicas de América Latina y el Caribe
  
  // 🌎 Bases de datos internacionales con contenido en español
  'pmc.ncbi.nlm.nih.gov', // #3 - PubMed (incluye journals latinoamericanos)
  'crossref.org',       // #4 - Elsevier (journals en español)
  
  // 🧠 Psicología específica - fuentes profesionales
  'psycnet.apa.org',         // #5 - American Psychological Association (contenido bilingüe)
  'semanticscholar.org',              // #6 - Consejo General de la Psicología de España
  
  // 📚 Repositorios académicos iberoamericanos
  'doaj.org',     // #7 - Portal bibliográfico hispano (España)
  'revistasaludpublica.uchile.cl',      // #8 - Periódicos Electrónicos en Psicología (Brasil + Latinoamérica)
  
  // 🏛️ Instituciones académicas de referencia
  'revista.ispch.gob.cl',            // #9 - Cochrane Library (revisiones sistemáticas, contenido en español)
  'minsal.cl'              // #10 - Biblioteca Virtual en Salud (OPS/OMS - multilingüe con español)
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
        console.log('[ParallelAI] Cliente inicializado correctamente')
      } catch (error) {
        console.error('[ParallelAI] Error al inicializar cliente:', error)
        this.client = null
      }
    } else {
      console.warn('[ParallelAI] No se proporcionó API key. Búsqueda deshabilitada.')
    }
  }

  /**
   * Verifica si el cliente está disponible
   */
  isAvailable(): boolean {
    return this.client !== null
  }

  /**
   * Búsqueda académica usando Parallel AI
   */
  async searchAcademic(params: ParallelSearchParams): Promise<ValidatedAcademicSource[]> {
    if (!this.client) {
      console.warn('[ParallelAI] Cliente no disponible. Retornando array vacío.')
      return []
    }

    const {
      objective,
      searchQueries = [],
      maxResults = 10,
      maxCharsPerResult = 15000, // Aumentado de 6000 a 15000 para mayor contexto académico
      processor = 'base', // Usar 'base' por defecto para velocidad (cambiar a 'pro' cuando esté disponible)
      sourceDomains
    } = params

    // Verificar caché
    const cacheKey = JSON.stringify(params)
    const cached = this.searchCache.get(cacheKey)
    if (cached) {
      console.log('[ParallelAI] Retornando desde caché')
      return this.transformToAcademicSources(cached)
    }

    try {
      console.log('🔍 [ParallelAI] === INICIANDO BÚSQUEDA ACADÉMICA ===')
      console.log(`  📝 Objective: ${objective.substring(0, 100)}...`)
      console.log(`  🔎 Queries: ${searchQueries.join(', ')}`)
      console.log(`  ⚙️  Processor: ${processor}`)

      // 🎯 CONFIGURACIÓN DE DOMINIOS: Top 10 fuentes académicas en español
      console.log('🎯 [ParallelAI] Usando dominios académicos en español (Top 10)')
      console.log(`  📚 Dominios incluidos: ${CLINICAL_PSYCHOLOGY_SPANISH_DOMAINS.join(', ')}`)

      // Ejecutar búsqueda con Parallel AI CON source_policy optimizado
      const search = await this.client.beta.search({
        objective,
        search_queries: searchQueries.length > 0 ? searchQueries : undefined,
        processor,
        max_results: maxResults,
        max_chars_per_result: maxCharsPerResult,
        // 🎯 RESTRICCIÓN: Solo los 10 dominios académicos más relevantes para psicología clínica en español
        source_policy: {
          include_domains: CLINICAL_PSYCHOLOGY_SPANISH_DOMAINS
          // No usamos exclude_domains para maximizar el uso de los 10 slots disponibles
        }
      })

      console.log(`[ParallelAI] Encontrados ${search.results?.length || 0} resultados`)

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
      console.error('[ParallelAI] Error en búsqueda:', error)
      if (error instanceof Error) {
        console.error('[ParallelAI] Error message:', error.message)
        console.error('[ParallelAI] Error stack:', error.stack)
      }
      // Log del objeto completo para debugging
      console.error('[ParallelAI] Error object:', JSON.stringify(error, null, 2))
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
      
      // 🎯 Factor 1: Dominios académicos en español (PRIORIDAD MÁXIMA)
      const isSpanishAcademicDomain = CLINICAL_PSYCHOLOGY_SPANISH_DOMAINS.some(domain => 
        hostname.includes(domain.toLowerCase())
      )
      
      if (isSpanishAcademicDomain) {
        // Bonus especial para dominios configurados
        score += 35
        
        // Bonus adicional para fuentes iberoamericanas de élite
        if (hostname.includes('scielo.org') || hostname.includes('redalyc.org')) {
          score += 5 // Total: +40 para SciELO y Redalyc
        }
      } else {
        // Fallback a sistema de tiers original (para resultados fuera de los 10 dominios)
        if (TRUSTED_ACADEMIC_DOMAINS.tier1.some(domain => hostname.includes(domain))) {
          score += 30
        } else if (TRUSTED_ACADEMIC_DOMAINS.tier2.some(domain => hostname.includes(domain))) {
          score += 20
        } else if (TRUSTED_ACADEMIC_DOMAINS.tier3.some(domain => hostname.includes(domain))) {
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

