/**
 * Crossref DOI Resolver
 * 
 * Integración con Crossref REST API para:
 * - Validación de DOIs
 * - Resolución de metadatos (autores, título, journal, año)
 * - Búsqueda de artículos académicos
 * 
 * API Documentation: https://api.crossref.org/swagger-ui/index.html
 * Rate Limit: 50 req/s (polite pool con User-Agent identificable)
 */

import { academicSourceValidator } from './academic-source-validator'
import type { ValidatedAcademicSource } from './academic-source-validator'

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface CrossrefMetadata {
  doi: string
  title: string
  authors: string[]
  journal?: string
  year?: number
  volume?: string
  issue?: string
  pages?: string
  publisher?: string
  type: string // journal-article, book-chapter, etc.
  url: string
  abstract?: string
  citationCount?: number
  isReferencedByCount?: number
}

export interface CrossrefSearchParams {
  query: string
  rows?: number // Número de resultados (default: 10, max: 1000)
  filter?: {
    type?: 'journal-article' | 'book-chapter' | 'proceedings-article'
    fromPubDate?: string // YYYY-MM-DD
    untilPubDate?: string // YYYY-MM-DD
    hasAbstract?: boolean
    hasFullText?: boolean
  }
  sort?: 'relevance' | 'published' | 'is-referenced-by-count'
}

interface CrossrefAPIResponse {
  status: string
  'message-type': string
  'message-version': string
  message: {
    items?: any[]
    'total-results'?: number
    DOI?: string
    title?: string[]
    author?: Array<{
      given?: string
      family?: string
      name?: string
    }>
    'container-title'?: string[]
    published?: {
      'date-parts'?: number[][]
    }
    volume?: string
    issue?: string
    page?: string
    publisher?: string
    type?: string
    URL?: string
    abstract?: string
    'is-referenced-by-count'?: number
  }
}

// ============================================================================
// CLASE PRINCIPAL: CrossrefDOIResolver
// ============================================================================

export class CrossrefDOIResolver {
  private readonly baseUrl = 'https://api.crossref.org'
  private readonly userAgent = 'HopeAI-Research/1.0 (mailto:contact@hopeai.com)'
  private cache: Map<string, CrossrefMetadata> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas
  private requestCount = 0
  private lastRequestTime = 0
  private readonly maxRequestsPerSecond = 45 // Conservador (límite es 50)

  /**
   * Rate limiting: asegura no exceder límite de Crossref
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    // Resetear contador cada segundo
    if (timeSinceLastRequest > 1000) {
      this.requestCount = 0
      this.lastRequestTime = now
    }

    // Si excedemos límite, esperar
    if (this.requestCount >= this.maxRequestsPerSecond) {
      const waitTime = 1000 - timeSinceLastRequest
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
      this.requestCount = 0
      this.lastRequestTime = Date.now()
    }

    this.requestCount++
  }

  /**
   * Realiza request a Crossref API con retry logic
   */
  private async fetchCrossref(
    endpoint: string,
    maxRetries: number = 3
  ): Promise<CrossrefAPIResponse> {
    await this.rateLimit()

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('DOI not found')
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data: CrossrefAPIResponse = await response.json()
        return data
      } catch (error) {
        if (attempt === maxRetries) {
          throw error
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }

    throw new Error('Max retries exceeded')
  }

  /**
   * Valida si un DOI existe en Crossref
   */
  async validateDOI(doi: string): Promise<boolean> {
    if (!doi) return false

    // Validar formato primero
    if (!academicSourceValidator.isValidDOIFormat(doi)) {
      return false
    }

    try {
      await this.resolveDOI(doi)
      return true
    } catch {
      return false
    }
  }

  /**
   * Resuelve un DOI a sus metadatos completos
   */
  async resolveDOI(doi: string): Promise<CrossrefMetadata> {
    if (!doi) {
      throw new Error('DOI is required')
    }

    // Verificar caché
    const cached = this.cache.get(doi)
    if (cached) {
      return cached
    }

    try {
      const data = await this.fetchCrossref(`/works/${encodeURIComponent(doi)}`)
      const item = data.message

      if (!item) {
        throw new Error('No metadata found')
      }

      // Extraer autores
      const authors: string[] = []
      if (item.author && Array.isArray(item.author)) {
        item.author.forEach(author => {
          if (author.family) {
            const name = author.given 
              ? `${author.family}, ${author.given}`
              : author.family
            authors.push(name)
          } else if (author.name) {
            authors.push(author.name)
          }
        })
      }

      // Extraer año de publicación
      let year: number | undefined
      if (item.published?.['date-parts']?.[0]?.[0]) {
        year = item.published['date-parts'][0][0]
      }

      // Extraer título
      const title = item.title?.[0] || 'Sin título'

      // Extraer journal
      const journal = item['container-title']?.[0]

      const metadata: CrossrefMetadata = {
        doi,
        title,
        authors,
        journal,
        year,
        volume: item.volume,
        issue: item.issue,
        pages: item.page,
        publisher: item.publisher,
        type: item.type || 'unknown',
        url: item.URL || `https://doi.org/${doi}`,
        abstract: item.abstract,
        citationCount: item['is-referenced-by-count']
      }

      // Guardar en caché
      this.cache.set(doi, metadata)
      this.cleanCache()

      return metadata
    } catch (error) {
      console.error(`[CrossrefResolver] Error resolving DOI ${doi}:`, error)
      throw error
    }
  }

  /**
   * Busca artículos en Crossref por query
   */
  async searchByQuery(params: CrossrefSearchParams): Promise<CrossrefMetadata[]> {
    const { query, rows = 10, filter, sort = 'relevance' } = params

    if (!query) {
      throw new Error('Query is required')
    }

    // Construir query string
    const queryParams = new URLSearchParams({
      query: query,
      rows: rows.toString(),
      sort: sort
    })

    // Agregar filtros
    if (filter) {
      const filters: string[] = []
      
      if (filter.type) {
        filters.push(`type:${filter.type}`)
      }
      
      if (filter.fromPubDate) {
        filters.push(`from-pub-date:${filter.fromPubDate}`)
      }
      
      if (filter.untilPubDate) {
        filters.push(`until-pub-date:${filter.untilPubDate}`)
      }
      
      if (filter.hasAbstract) {
        filters.push('has-abstract:true')
      }
      
      if (filter.hasFullText) {
        filters.push('has-full-text:true')
      }

      if (filters.length > 0) {
        queryParams.append('filter', filters.join(','))
      }
    }

    try {
      const data = await this.fetchCrossref(`/works?${queryParams.toString()}`)
      const items = data.message.items || []

      const results: CrossrefMetadata[] = []

      for (const item of items) {
        try {
          // Extraer autores
          const authors: string[] = []
          if (item.author && Array.isArray(item.author)) {
            item.author.forEach((author: any) => {
              if (author.family) {
                const name = author.given 
                  ? `${author.family}, ${author.given}`
                  : author.family
                authors.push(name)
              }
            })
          }

          // Extraer año
          let year: number | undefined
          if (item.published?.['date-parts']?.[0]?.[0]) {
            year = item.published['date-parts'][0][0]
          }

          const metadata: CrossrefMetadata = {
            doi: item.DOI,
            title: item.title?.[0] || 'Sin título',
            authors,
            journal: item['container-title']?.[0],
            year,
            volume: item.volume,
            issue: item.issue,
            pages: item.page,
            publisher: item.publisher,
            type: item.type || 'unknown',
            url: item.URL || `https://doi.org/${item.DOI}`,
            abstract: item.abstract,
            citationCount: item['is-referenced-by-count']
          }

          results.push(metadata)
        } catch (error) {
          console.warn('[CrossrefResolver] Error parsing item:', error)
        }
      }

      return results
    } catch (error) {
      console.error('[CrossrefResolver] Error searching:', error)
      throw error
    }
  }

  /**
   * Limpia entradas de caché antiguas
   */
  private cleanCache(): void {
    // Implementación simple: si caché > 1000 entradas, limpiar todo
    if (this.cache.size > 1000) {
      this.cache.clear()
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
export const crossrefDOIResolver = new CrossrefDOIResolver()

