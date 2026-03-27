/**
 * PubMed Research Tool - Enhanced v2.0
 *
 * Integración mejorada con PubMed E-utilities API
 * Características nuevas:
 * - Validación de DOIs con Crossref
 * - Optimización para psicología clínica
 * - Filtros de idioma (español + inglés)
 * - Caché de resultados
 */

import { crossrefDOIResolver } from './crossref-doi-resolver'
import { academicSourceValidator } from './academic-source-validator'
import type { ValidatedAcademicSource } from './academic-source-validator'

interface PubMedArticle {
  pmid: string
  title: string
  authors: string[]
  journal: string
  year: number
  abstract: string
  doi?: string
  url: string
  language?: string
}

interface PubMedSearchParams {
  query: string
  maxResults?: number
  dateRange?: string
  sortBy?: "relevance" | "date" | "citations"
  language?: 'es' | 'en' | 'both' // NUEVO: filtro de idioma
  validateDOIs?: boolean // NUEVO: validar DOIs con Crossref
}

export class PubMedResearchTool {
  private readonly baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
  private readonly apiKey?: string
  private cache: Map<string, PubMedArticle[]> = new Map()
  private readonly cacheTTL = 24 * 60 * 60 * 1000 // 24 horas

  constructor(apiKey?: string) {
    this.apiKey = apiKey
  }

  async searchPubMed(params: PubMedSearchParams): Promise<PubMedArticle[]> {
    const {
      query,
      maxResults = 10,
      dateRange,
      sortBy = "relevance",
      language = 'both',
      validateDOIs = true
    } = params

    // Verificar caché
    const cacheKey = `${query}-${maxResults}-${dateRange}-${sortBy}-${language}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      console.log('[PubMedTool] Retornando resultados desde caché')
      return cached
    }

    try {
      // Step 1: Search for PMIDs with retry logic
      const searchUrl = this.buildSearchUrl(query, maxResults, dateRange, sortBy, language)
      const searchResponse = await this.fetchWithRetry(searchUrl, 'búsqueda de PMIDs')
      const searchData = await searchResponse.text()

      const pmids = this.extractPMIDs(searchData)

      if (pmids.length === 0) {
        return []
      }

      // Step 2: Fetch article details with retry logic
      const detailsUrl = this.buildDetailsUrl(pmids)
      const detailsResponse = await this.fetchWithRetry(detailsUrl, 'detalles de artículos')
      const detailsData = await detailsResponse.text()

      let articles = this.parseArticleDetails(detailsData)

      // Step 3: NUEVO - Validar DOIs con Crossref
      if (validateDOIs) {
        articles = await this.validateArticleDOIs(articles)
      }

      // Guardar en caché
      this.cache.set(cacheKey, articles)
      this.cleanCache()

      return articles
    } catch (error) {
      console.error("Error searching PubMed:", error)
      throw new Error("Failed to search PubMed database")
    }
  }

  /**
   * NUEVO: Valida DOIs de artículos con Crossref
   * Filtra artículos con DOIs inválidos
   */
  private async validateArticleDOIs(articles: PubMedArticle[]): Promise<PubMedArticle[]> {
    const validatedArticles: PubMedArticle[] = []

    for (const article of articles) {
      if (article.doi) {
        try {
          const isValid = await crossrefDOIResolver.validateDOI(article.doi)
          if (isValid) {
            validatedArticles.push(article)
          } else {
            console.warn(`[PubMedTool] DOI inválido: ${article.doi}`)
          }
        } catch (error) {
          // Si falla validación, incluir artículo de todas formas
          validatedArticles.push(article)
        }
      } else {
        // Sin DOI, incluir de todas formas (tiene PMID)
        validatedArticles.push(article)
      }
    }

    return validatedArticles
  }

  private async fetchWithRetry(
    url: string, 
    operation: string, 
    maxRetries: number = 3, 
    timeoutMs: number = 10000
  ): Promise<Response> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[PubMedTool] Intento ${attempt}/${maxRetries} para ${operation}`)
        
        // Crear AbortController para timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'HopeAI-Research-Tool/1.0 (contact@hopeai.com)'
          }
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        // Rate limiting: esperar entre requests
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        
        return response
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[PubMedTool] Error en intento ${attempt} para ${operation}:`, lastError.message)
        
        // Si es el último intento, lanzar el error
        if (attempt === maxRetries) {
          break
        }
        
        // Backoff exponencial: esperar más tiempo entre reintentos
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`[PubMedTool] Esperando ${backoffMs}ms antes del siguiente intento...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
    
    throw new Error(`Falló ${operation} después de ${maxRetries} intentos. Último error: ${lastError?.message}`)
  }

  private buildSearchUrl(
    query: string,
    maxResults: number,
    dateRange?: string,
    sortBy?: string,
    language?: 'es' | 'en' | 'both'
  ): string {
    const params = new URLSearchParams({
      db: "pubmed",
      term: this.enhanceQuery(query, language),
      retmax: maxResults.toString(),
      retmode: "xml",
      sort: sortBy === "date" ? "pub_date" : "relevance",
    })

    if (dateRange) {
      params.append("datetype", "pdat")
      params.append("reldate", this.convertDateRange(dateRange))
    }

    if (this.apiKey) {
      params.append("api_key", this.apiKey)
    }

    return `${this.baseUrl}/esearch.fcgi?${params.toString()}`
  }

  private buildDetailsUrl(pmids: string[]): string {
    const params = new URLSearchParams({
      db: "pubmed",
      id: pmids.join(","),
      retmode: "xml",
      rettype: "abstract",
    })

    if (this.apiKey) {
      params.append("api_key", this.apiKey)
    }

    return `${this.baseUrl}/efetch.fcgi?${params.toString()}`
  }

  /**
   * MEJORADO: Optimiza query para psicología clínica con filtros de idioma
   */
  private enhanceQuery(query: string, language?: 'es' | 'en' | 'both'): string {
    // Términos MeSH optimizados para psicología clínica
    const clinicalTerms = [
      "psychology, clinical[MeSH]",
      "psychotherapy[MeSH]",
      "mental disorders[MeSH]",
      "cognitive behavioral therapy[MeSH]",
      "mental health[MeSH]"
    ]

    // Check if query already contains field tags
    if (query.includes("[") && query.includes("]")) {
      // Query ya tiene tags MeSH, solo agregar filtro de idioma
      return this.addLanguageFilter(query, language)
    }

    // Construir query mejorado
    let enhancedQuery = `(${query}) AND (${clinicalTerms.join(" OR ")})`

    // Agregar filtro de idioma
    enhancedQuery = this.addLanguageFilter(enhancedQuery, language)

    return enhancedQuery
  }

  /**
   * NUEVO: Agrega filtro de idioma a la query
   */
  private addLanguageFilter(query: string, language?: 'es' | 'en' | 'both'): string {
    if (!language || language === 'both') {
      // Priorizar español e inglés
      return `${query} AND (spanish[Language] OR english[Language])`
    } else if (language === 'es') {
      return `${query} AND spanish[Language]`
    } else if (language === 'en') {
      return `${query} AND english[Language]`
    }
    return query
  }

  private convertDateRange(dateRange: string): string {
    switch (dateRange) {
      case "last_year":
        return "365"
      case "last_5_years":
        return "1825"
      case "last_10_years":
        return "3650"
      default:
        return "1825" // Default to 5 years
    }
  }

  private extractPMIDs(xmlData: string): string[] {
    const pmids: string[] = []
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlData, "text/xml")

    const idElements = doc.querySelectorAll("Id")
    idElements.forEach((element) => {
      const pmid = element.textContent?.trim()
      if (pmid) {
        pmids.push(pmid)
      }
    })

    return pmids
  }

  private parseArticleDetails(xmlData: string): PubMedArticle[] {
    const articles: PubMedArticle[] = []
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlData, "text/xml")

    const articleElements = doc.querySelectorAll("PubmedArticle")

    articleElements.forEach((articleElement) => {
      try {
        const pmid = articleElement.querySelector("PMID")?.textContent?.trim() || ""
        const title = articleElement.querySelector("ArticleTitle")?.textContent?.trim() || ""

        // Extract authors
        const authorElements = articleElement.querySelectorAll("Author")
        const authors: string[] = []
        authorElements.forEach((authorElement) => {
          const lastName = authorElement.querySelector("LastName")?.textContent?.trim()
          const foreName = authorElement.querySelector("ForeName")?.textContent?.trim()
          if (lastName) {
            authors.push(foreName ? `${lastName}, ${foreName}` : lastName)
          }
        })

        // Extract journal info
        const journal = articleElement.querySelector("Title")?.textContent?.trim() || ""
        const yearElement = articleElement.querySelector("PubDate Year")
        const year = yearElement ? Number.parseInt(yearElement.textContent?.trim() || "0") : 0

        // Extract abstract
        const abstractElements = articleElement.querySelectorAll("AbstractText")
        let abstract = ""
        abstractElements.forEach((element) => {
          const label = element.getAttribute("Label")
          const text = element.textContent?.trim() || ""
          if (label) {
            abstract += `${label}: ${text}\n`
          } else {
            abstract += `${text}\n`
          }
        })

        // Extract DOI
        const doiElement = articleElement.querySelector("ELocationID[EIdType='doi']")
        const doi = doiElement?.textContent?.trim()

        if (pmid && title) {
          articles.push({
            pmid,
            title,
            authors,
            journal,
            year,
            abstract: abstract.trim(),
            doi,
            url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          })
        }
      } catch (error) {
        console.error("Error parsing article:", error)
      }
    })

    return articles
  }

  formatSearchResults(articles: PubMedArticle[]): string {
    if (articles.length === 0) {
      return "No se encontraron artículos relevantes en PubMed."
    }

    return articles
      .map((article, index) => {
        const authorsText =
          article.authors.length > 3 ? `${article.authors.slice(0, 3).join(", ")} et al.` : article.authors.join(", ")

        return `
**${index + 1}. ${article.title}**
*Autores:* ${authorsText}
*Revista:* ${article.journal} (${article.year})
*PMID:* ${article.pmid}
*URL:* ${article.url}

*Resumen:*
${article.abstract.substring(0, 300)}${article.abstract.length > 300 ? "..." : ""}

---`
      })
      .join("\n\n")
  }

  // Function declaration for Google Gen AI SDK
  getToolDeclaration() {
    return {
      name: "searchPubMed",
      description: "Search PubMed database for scientific articles related to psychology and clinical practice",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query using medical/psychological terminology",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 10, max: 20)",
            minimum: 1,
            maximum: 20,
          },
          dateRange: {
            type: "string",
            description: "Date range for articles",
            enum: ["last_year", "last_5_years", "last_10_years"],
          },
          sortBy: {
            type: "string",
            description: "Sort results by relevance or date",
            enum: ["relevance", "date"],
          },
        },
        required: ["query"],
      },
    }
  }

  async executeTool(parameters: any): Promise<{ output?: string; error?: { code: number; message: string; details: string[] } }> {
    try {
      // Validación robusta de parámetros
      if (!parameters || typeof parameters !== 'object') {
        return {
          error: {
            code: 400,
            message: "Parámetros inválidos",
            details: ["Los parámetros deben ser un objeto válido"]
          }
        }
      }

      const { query, maxResults = 10, dateRange, sortBy = "relevance" } = parameters

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          error: {
            code: 400,
            message: "Query de búsqueda requerido",
            details: ["Debe proporcionar un término de búsqueda válido"]
          }
        }
      }

      if (maxResults && (typeof maxResults !== 'number' || maxResults < 1 || maxResults > 20)) {
        return {
          error: {
            code: 400,
            message: "Número de resultados inválido",
            details: ["maxResults debe ser un número entre 1 y 20"]
          }
        }
      }

      const articles = await this.searchPubMed(parameters)
      const formattedResults = this.formatSearchResults(articles)
      
      return {
        output: formattedResults
      }
    } catch (error) {
      console.error('[PubMedTool] Error en executeTool:', error)
      
      // Manejo estructurado de diferentes tipos de errores
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          error: {
            code: 503,
            message: "Error de conectividad con PubMed",
            details: ["No se pudo conectar con la base de datos de PubMed. Verifique su conexión a internet."]
          }
        }
      }
      
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          error: {
            code: 408,
            message: "Timeout en la búsqueda",
            details: ["La búsqueda en PubMed tardó demasiado tiempo. Intente con términos más específicos."]
          }
        }
      }
      
      return {
        error: {
          code: 500,
          message: "Error interno en la búsqueda",
          details: [error instanceof Error ? error.message : "Error desconocido en PubMed"]
        }
      }
    }
  }

  /**
   * NUEVO: Limpia entradas de caché antiguas
   */
  private cleanCache(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    // Implementación simple: si caché > 100 entradas, limpiar las más antiguas
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries())
      // Mantener solo las últimas 50
      entries.slice(0, entries.length - 50).forEach(([key]) => {
        keysToDelete.push(key)
      })
    }

    keysToDelete.forEach(key => this.cache.delete(key))
  }

  /**
   * NUEVO: Limpia toda la caché
   */
  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton instance
export const pubmedTool = new PubMedResearchTool()
