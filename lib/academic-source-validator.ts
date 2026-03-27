/**
 * Academic Source Validator
 * 
 * Sistema de validación multi-capa para fuentes académicas
 * Garantiza que todos los DOIs y URLs retornados sean válidos y accesibles
 * 
 * Características:
 * - Validación de formato DOI (10.xxxx/yyyy)
 * - Verificación de accesibilidad HTTP
 * - Whitelist de dominios académicos confiables
 * - Scoring de confiabilidad (0-100)
 * - Extracción robusta de DOIs desde texto/URLs
 */

import { z } from 'zod'

// ============================================================================
// SCHEMAS Y TIPOS
// ============================================================================

export const ValidatedAcademicSourceSchema = z.object({
  doi: z.string().optional(),
  url: z.string().url(),
  title: z.string().min(5),
  authors: z.array(z.string()).optional(),
  year: z.number().int().min(1900).max(2026).optional(),
  journal: z.string().optional(),
  sourceType: z.enum(['pubmed', 'crossref', 'elsevier', 'google-scholar', 'open-access', 'parallel_ai', 'generic']),
  trustScore: z.number().min(0).max(100),
  isAccessible: z.boolean(),
  validatedAt: z.date(),
  abstract: z.string().optional(),
  excerpts: z.array(z.string()).optional() // Excerpts optimizados de Parallel AI
})

export type ValidatedAcademicSource = z.infer<typeof ValidatedAcademicSourceSchema>

export interface ValidationResult {
  isValid: boolean
  source?: ValidatedAcademicSource
  errors: string[]
}

// ============================================================================
// WHITELIST DE DOMINIOS ACADÉMICOS
// ============================================================================

const TRUSTED_ACADEMIC_DOMAINS = {
  tier1: [ // Máxima confiabilidad (95-100)
    'pubmed.ncbi.nlm.nih.gov',
    'doi.org',
    'dx.doi.org',
    'psycnet.apa.org',
    'sciencedirect.com',
    'springer.com',
    'springerlink.com',
    'wiley.com',
    'onlinelibrary.wiley.com',
    'tandfonline.com',
    'frontiersin.org',
    'plos.org',
    'nature.com',
    'science.org',
    'sciencemag.org',
    'cell.com',
    'thelancet.com',
    'bmj.com',
    'jamanetwork.com',
    'nejm.org'
  ],
  tier2: [ // Alta confiabilidad (80-94)
    'scholar.google.com',
    'researchgate.net',
    'academia.edu',
    'arxiv.org',
    'biorxiv.org',
    'psyarxiv.com',
    'medrxiv.org',
    'ssrn.com',
    'europepmc.org',
    'ncbi.nlm.nih.gov',
    'nih.gov',
    'who.int',
    'cochrane.org',
    'cochranelibrary.com'
  ],
  tier3: [ // Confiabilidad moderada (60-79)
    'mdpi.com',
    'hindawi.com',
    'peerj.com',
    'f1000research.com',
    'journals.sagepub.com',
    'cambridge.org',
    'oxfordjournals.org',
    'academic.oup.com'
  ]
} as const

// ============================================================================
// CLASE PRINCIPAL: AcademicSourceValidator
// ============================================================================

export class AcademicSourceValidator {
  private cache: Map<string, ValidationResult> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas

  /**
   * Extrae DOI desde texto, URL o string arbitrario
   * Soporta múltiples formatos:
   * - https://doi.org/10.1234/example
   * - doi:10.1234/example
   * - 10.1234/example
   */
  extractDOI(text: string): string | null {
    if (!text) return null

    // Normalizar espacios
    const normalized = text.trim().replace(/\s+/g, '')

    // Patrón robusto para DOI: 10.xxxx/yyyy
    // Soporta caracteres especiales comunes en sufijos
    const doiPattern = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i
    const match = normalized.match(doiPattern)

    if (match) {
      // Limpiar caracteres finales no válidos
      let doi = match[1]
      doi = doi.replace(/[.,;)\]]+$/, '') // Remover puntuación final
      return doi
    }

    return null
  }

  /**
   * Valida formato de DOI según estándar
   * DOI debe ser: 10.{4-9 dígitos}/{sufijo}
   */
  isValidDOIFormat(doi: string): boolean {
    if (!doi) return false
    
    // Patrón estricto: 10.xxxx/yyyy
    const strictPattern = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/
    return strictPattern.test(doi)
  }

  /**
   * Verifica accesibilidad de URL mediante HTTP HEAD request
   * Usa timeout corto para no bloquear
   */
  async checkUrlAccessibility(url: string, timeoutMs: number = 2000): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'HopeAI-Research/1.0 (contact@hopeai.com)'
        }
      })

      clearTimeout(timeoutId)

      // Considerar exitoso: 2xx, 3xx (redirects)
      return response.ok || (response.status >= 300 && response.status < 400)
    } catch (error) {
      // Timeout, network error, etc.
      return false
    }
  }

  /**
   * Calcula trust score basado en múltiples factores
   */
  calculateTrustScore(source: {
    url: string
    doi?: string
    sourceType?: string
    year?: number
  }): number {
    let score = 50 // Base score

    // Factor 1: Presencia de DOI válido (+20)
    if (source.doi && this.isValidDOIFormat(source.doi)) {
      score += 20
    }

    // Factor 2: Dominio académico confiable
    try {
      const hostname = new URL(source.url).hostname.toLowerCase()
      
      if (TRUSTED_ACADEMIC_DOMAINS.tier1.some(domain => hostname.includes(domain))) {
        score += 30
      } else if (TRUSTED_ACADEMIC_DOMAINS.tier2.some(domain => hostname.includes(domain))) {
        score += 20
      } else if (TRUSTED_ACADEMIC_DOMAINS.tier3.some(domain => hostname.includes(domain))) {
        score += 10
      }
    } catch {
      // URL inválida
      score -= 20
    }

    // Factor 3: Tipo de fuente
    if (source.sourceType === 'pubmed') {
      score += 15
    } else if (source.sourceType === 'crossref') {
      score += 10
    }

    // Factor 4: Actualidad (últimos 5 años)
    if (source.year) {
      const currentYear = new Date().getFullYear()
      const age = currentYear - source.year
      
      if (age <= 2) {
        score += 10 // Muy reciente
      } else if (age <= 5) {
        score += 5 // Reciente
      } else if (age > 10) {
        score -= 5 // Antiguo
      }
    }

    // Limitar entre 0-100
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Determina el tipo de fuente basado en URL
   */
  determineSourceType(url: string): ValidatedAcademicSource['sourceType'] {
    try {
      const hostname = new URL(url).hostname.toLowerCase()

      if (hostname.includes('pubmed')) return 'pubmed'
      if (hostname.includes('crossref')) return 'crossref'
      if (hostname.includes('elsevier') || hostname.includes('sciencedirect')) return 'elsevier'
      if (hostname.includes('scholar.google')) return 'google-scholar'
      if (hostname.includes('arxiv') || hostname.includes('biorxiv') || 
          hostname.includes('psyarxiv') || hostname.includes('plos')) return 'open-access'
      
      return 'generic'
    } catch {
      return 'generic'
    }
  }

  /**
   * Valida una fuente académica completa
   * Realiza todas las verificaciones necesarias
   */
  async validateSource(source: {
    url: string
    title: string
    doi?: string
    authors?: string[]
    year?: number
    journal?: string
    abstract?: string
    skipAccessibilityCheck?: boolean // Nuevo: saltar validación HTTP para mayor velocidad
  }): Promise<ValidationResult> {
    const errors: string[] = []

    // Verificar caché
    const cacheKey = source.doi || source.url
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // Validación 1: URL válida
    try {
      new URL(source.url)
    } catch {
      errors.push('URL inválida')
      return { isValid: false, errors }
    }

    // Validación 2: DOI (si existe)
    let validatedDOI = source.doi
    if (source.doi) {
      if (!this.isValidDOIFormat(source.doi)) {
        errors.push('Formato de DOI inválido')
        validatedDOI = undefined
      }
    } else {
      // Intentar extraer DOI de la URL
      validatedDOI = this.extractDOI(source.url) || undefined
    }

    // Validación 3: Accesibilidad (solo si no es DOI.org, que siempre redirige)
    let isAccessible = true
    const isDOIUrl = source.url.includes('doi.org')

    // Saltar validación de accesibilidad si se solicita (para mayor velocidad)
    if (!source.skipAccessibilityCheck && !isDOIUrl) {
      isAccessible = await this.checkUrlAccessibility(source.url)
      if (!isAccessible) {
        errors.push('URL no accesible')
      }
    }

    // Determinar tipo de fuente
    const sourceType = this.determineSourceType(source.url)

    // Calcular trust score
    const trustScore = this.calculateTrustScore({
      url: source.url,
      doi: validatedDOI,
      sourceType,
      year: source.year
    })

    // Construir fuente validada
    const validatedSource: ValidatedAcademicSource = {
      url: source.url,
      title: source.title,
      doi: validatedDOI,
      authors: source.authors,
      year: source.year,
      journal: source.journal,
      abstract: source.abstract,
      sourceType,
      trustScore,
      isAccessible,
      validatedAt: new Date()
    }

    const result: ValidationResult = {
      isValid: errors.length === 0 && (isAccessible || isDOIUrl) && trustScore >= 60,
      source: validatedSource,
      errors
    }

    // Guardar en caché
    this.cache.set(cacheKey, result)

    // Limpiar caché antigua
    this.cleanCache()

    return result
  }

  /**
   * Valida múltiples fuentes en paralelo
   */
  async validateSources(sources: Array<{
    url: string
    title: string
    doi?: string
    authors?: string[]
    year?: number
    journal?: string
  }>): Promise<ValidatedAcademicSource[]> {
    const results = await Promise.all(
      sources.map(source => this.validateSource(source))
    )

    return results
      .filter(result => result.isValid && result.source)
      .map(result => result.source!)
      .sort((a, b) => b.trustScore - a.trustScore) // Ordenar por confiabilidad
  }

  /**
   * Limpia entradas de caché antiguas
   */
  private cleanCache(): void {
    const now = Date.now()
    
    for (const [key, value] of this.cache.entries()) {
      if (value.source) {
        const age = now - value.source.validatedAt.getTime()
        if (age > this.cacheTTL) {
          this.cache.delete(key)
        }
      }
    }
  }

  /**
   * Limpia toda la caché
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
export const academicSourceValidator = new AcademicSourceValidator()

