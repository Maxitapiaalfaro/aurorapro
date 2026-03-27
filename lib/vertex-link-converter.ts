/**
 * Vertex Link Converter
 * 
 * Convierte vertex links (URLs internas de Google) a URLs públicas user-friendly
 * 
 * Problema: Google Gemini con grounding retorna vertex links como:
 * - vertex://search/12345
 * - https://www.google.com/search?q=...&gs_lcrp=...
 * - URLs con parámetros internos de Google
 * 
 * Solución: Extraer información real y convertir a:
 * - DOIs cuando sea posible (https://doi.org/10.xxxx/yyyy)
 * - URLs públicas directas
 * - Referencias formateadas en Markdown
 */

import { academicSourceValidator } from './academic-source-validator'
import { crossrefDOIResolver } from './crossref-doi-resolver'

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface ConvertedReference {
  originalText: string
  convertedText: string
  url: string
  doi?: string
  title?: string
  isConverted: boolean
}

export interface ConversionResult {
  originalResponse: string
  convertedResponse: string
  references: ConvertedReference[]
  conversionCount: number
}

// ============================================================================
// PATRONES DE DETECCIÓN
// ============================================================================

// Patrones de vertex links y URLs internas de Google
const VERTEX_LINK_PATTERNS = [
  /vertex:\/\/[^\s\)]+/gi,
  /https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s\)]+/gi,
  /https?:\/\/www\.google\.com\/search\?[^\s\)]+/gi,
  /https?:\/\/[^\s]*gs_lcrp=[^\s\)]+/gi,
  /https?:\/\/[^\s]*&ved=[^\s\)]+/gi,
  /https?:\/\/scholar\.google\.com\/scholar\?[^\s\)]+/gi
]

// Patrón para detectar referencias en formato [número]
const REFERENCE_NUMBER_PATTERN = /\[(\d+)\]/g

// ============================================================================
// CLASE PRINCIPAL: VertexLinkConverter
// ============================================================================

export class VertexLinkConverter {
  // Cache para redirects resueltos (evitar resolver el mismo link múltiples veces)
  private redirectCache: Map<string, string | null> = new Map()
  private readonly cacheTTL = 60 * 60 * 1000 // 1 hora
  private cacheTimestamps: Map<string, number> = new Map()

  // Rate limiting para peticiones HTTP
  private activeRequests = 0
  private readonly maxConcurrentRequests = 5 // Máximo 5 peticiones simultáneas
  private requestQueue: Array<() => void> = []

  /**
   * Limpia entradas de caché expiradas
   */
  private cleanCache(): void {
    const now = Date.now()
    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.cacheTTL) {
        this.redirectCache.delete(key)
        this.cacheTimestamps.delete(key)
      }
    }
  }

  /**
   * Espera hasta que haya espacio para hacer una petición HTTP
   */
  private async waitForRequestSlot(): Promise<void> {
    if (this.activeRequests < this.maxConcurrentRequests) {
      this.activeRequests++
      return
    }

    // Esperar en cola
    return new Promise((resolve) => {
      this.requestQueue.push(() => {
        this.activeRequests++
        resolve()
      })
    })
  }

  /**
   * Libera un slot de petición y procesa la cola
   */
  private releaseRequestSlot(): void {
    this.activeRequests--

    // Procesar siguiente en cola
    const next = this.requestQueue.shift()
    if (next) {
      next()
    }
  }

  /**
   * Detecta si un texto contiene vertex links o URLs internas de Google
   */
  hasVertexLinks(text: string): boolean {
    return VERTEX_LINK_PATTERNS.some(pattern => pattern.test(text))
  }

  /**
   * Extrae todos los vertex links de un texto
   */
  extractVertexLinks(text: string): string[] {
    const links: string[] = []
    
    VERTEX_LINK_PATTERNS.forEach(pattern => {
      const matches = text.match(pattern)
      if (matches) {
        links.push(...matches)
      }
    })

    return [...new Set(links)] // Eliminar duplicados
  }

  /**
   * Resuelve un vertex redirect siguiendo el HTTP redirect
   * ROBUSTO: Hace petición HTTP real para obtener la URL final + caché + rate limiting
   */
  private async resolveVertexRedirect(vertexLink: string): Promise<string | null> {
    // Verificar caché primero
    if (this.redirectCache.has(vertexLink)) {
      const cached = this.redirectCache.get(vertexLink)
      console.log('[VertexConverter] Using cached redirect for:', vertexLink.substring(0, 100))
      return cached || null
    }

    // Esperar por un slot disponible (rate limiting)
    await this.waitForRequestSlot()

    try {
      console.log('[VertexConverter] Resolving vertex redirect:', vertexLink.substring(0, 100) + '...')

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

      const response = await fetch(vertexLink, {
        method: 'HEAD', // Solo headers, no body
        redirect: 'follow', // Seguir redirects automáticamente
        signal: controller.signal,
        headers: {
          'User-Agent': 'HopeAI-Research/1.0 (Clinical Psychology Platform)'
        }
      })

      clearTimeout(timeoutId)

      // La URL final después de todos los redirects
      const finalUrl = response.url

      // Guardar en caché
      this.redirectCache.set(vertexLink, finalUrl)
      this.cacheTimestamps.set(vertexLink, Date.now())
      this.cleanCache()

      console.log('[VertexConverter] Resolved to:', finalUrl)
      return finalUrl

    } catch (error) {
      // Guardar null en caché para evitar reintentos inmediatos
      this.redirectCache.set(vertexLink, null)
      this.cacheTimestamps.set(vertexLink, Date.now())

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn('[VertexConverter] Timeout resolving redirect:', vertexLink.substring(0, 100))
        } else {
          console.warn('[VertexConverter] Error resolving redirect:', error.message)
        }
      }
      return null
    } finally {
      // Siempre liberar el slot
      this.releaseRequestSlot()
    }
  }

  /**
   * Convierte un vertex link a URL pública
   * MEJORADO: Resuelve redirects con HTTP requests reales
   */
  async convertVertexLink(vertexLink: string): Promise<string | null> {
    try {
      // Si es un vertex redirect de Vertex AI Search, resolverlo con HTTP
      if (vertexLink.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
        const resolvedUrl = await this.resolveVertexRedirect(vertexLink)
        if (resolvedUrl && resolvedUrl !== vertexLink) {
          // Limpiar parámetros de tracking si los tiene
          return this.cleanGoogleTrackingParams(resolvedUrl)
        }
        return null
      }

      // Si es un vertex:// link, no podemos hacer mucho
      if (vertexLink.startsWith('vertex://')) {
        console.warn('[VertexConverter] Cannot convert vertex:// protocol link:', vertexLink)
        return null
      }

      // Si es un link de Google Search, intentar extraer el URL real
      if (vertexLink.includes('google.com/search') || vertexLink.includes('scholar.google.com')) {
        // Intentar extraer el parámetro 'url' o 'q'
        const url = new URL(vertexLink)
        const targetUrl = url.searchParams.get('url') || url.searchParams.get('q')

        if (targetUrl) {
          // Verificar si es una URL válida
          try {
            new URL(targetUrl)
            return targetUrl
          } catch {
            // No es una URL válida, buscar DOI en el query
            const doi = academicSourceValidator.extractDOI(targetUrl)
            if (doi) {
              return `https://doi.org/${doi}`
            }
          }
        }
      }

      // Si contiene parámetros de tracking de Google, limpiarlos
      if (vertexLink.includes('&ved=') || vertexLink.includes('gs_lcrp=')) {
        return this.cleanGoogleTrackingParams(vertexLink)
      }

      return vertexLink
    } catch (error) {
      console.error('[VertexConverter] Error converting vertex link:', error)
      return null
    }
  }

  /**
   * Convierte respuesta completa reemplazando vertex links con URLs públicas
   * ESTRATEGIA ROBUSTA: Resolver redirects con HTTP y reemplazar inline + sección de referencias
   */
  async convertResponse(
    responseText: string,
    groundingMetadata?: any
  ): Promise<ConversionResult> {
    const references: ConvertedReference[] = []
    let convertedResponse = responseText
    let conversionCount = 0

    // Paso 1: Extraer vertex links del texto
    const vertexLinks = this.extractVertexLinks(responseText)

    // Paso 2: Resolver todos los vertex links en paralelo (más eficiente)
    console.log(`[VertexConverter] Processing ${vertexLinks.length} vertex links...`)

    const conversionPromises = vertexLinks.map(async (vertexLink) => {
      const convertedUrl = await this.convertVertexLink(vertexLink)
      return { original: vertexLink, converted: convertedUrl }
    })

    const conversions = await Promise.all(conversionPromises)

    // Paso 3: Aplicar conversiones al texto
    for (const { original, converted } of conversions) {
      if (converted && converted !== original) {
        // Reemplazar en el texto
        convertedResponse = convertedResponse.replace(
          new RegExp(this.escapeRegex(original), 'g'),
          converted
        )

        references.push({
          originalText: original,
          convertedText: converted,
          url: converted,
          isConverted: true
        })

        conversionCount++
      } else {
        // Si no se pudo convertir, eliminar del texto
        convertedResponse = convertedResponse.replace(
          new RegExp(`\\s*${this.escapeRegex(original)}`, 'g'),
          ''
        )

        console.warn('[VertexConverter] Could not resolve redirect, removed from text:', original.substring(0, 100))
      }
    }

    console.log(`[VertexConverter] Successfully converted ${conversionCount}/${vertexLinks.length} links`)

    // Paso 4: Si hay grounding metadata, extraer URLs validadas y reemplazar sección de Referencias
    if (groundingMetadata?.groundingChunks) {
      const validatedUrls = await this.extractValidatedUrlsFromGrounding(groundingMetadata)

      if (validatedUrls.length > 0) {
        const referencesSection = this.formatReferencesSection(validatedUrls)

        // Buscar y reemplazar la sección de Referencias existente
        const referencesRegex = /##\s*Referencias\s*\n\n[\s\S]*/i
        if (referencesRegex.test(convertedResponse)) {
          // Reemplazar sección existente
          convertedResponse = convertedResponse.replace(referencesRegex, referencesSection)
        } else {
          // Agregar nueva sección al final
          convertedResponse += '\n\n' + referencesSection
        }
      }
    }

    return {
      originalResponse: responseText,
      convertedResponse,
      references,
      conversionCount
    }
  }

  /**
   * Extrae URLs validadas desde grounding metadata
   * ROBUSTO: Resuelve vertex redirects con HTTP para obtener URLs reales
   */
  private async extractValidatedUrlsFromGrounding(groundingMetadata: any): Promise<Array<{
    title: string
    url: string
    doi?: string
    isVertexRedirect?: boolean
  }>> {
    const urls: Array<{ title: string; url: string; doi?: string; isVertexRedirect?: boolean }> = []
    const seenTitles = new Set<string>()

    try {
      if (groundingMetadata.groundingChunks && Array.isArray(groundingMetadata.groundingChunks)) {
        // Recolectar todos los chunks primero
        const chunks: Array<{ uri: string; title: string }> = []

        for (const chunk of groundingMetadata.groundingChunks) {
          let uri: string | null = null
          let title: string | null = null

          if (chunk.web?.uri) {
            uri = chunk.web.uri
            title = chunk.web.title
          } else if (chunk.retrievedContext?.uri) {
            uri = chunk.retrievedContext.uri
            title = chunk.retrievedContext.title
          }

          if (uri && title && !seenTitles.has(title)) {
            seenTitles.add(title)
            chunks.push({ uri, title })
          }
        }

        // Resolver todos los URIs en paralelo (más eficiente)
        console.log(`[VertexConverter] Resolving ${chunks.length} URLs from grounding metadata...`)

        const resolutionPromises = chunks.map(async ({ uri, title }) => {
          // Intentar convertir/resolver el URI
          const convertedUri = await this.convertVertexLink(uri)
          const finalUri = convertedUri || uri

          // Extraer DOI si existe
          const doi = academicSourceValidator.extractDOI(finalUri)

          // Validar que sea una URL válida y no un link de Google
          const isValidUrl = finalUri &&
                            !finalUri.includes('google.com/search') &&
                            !finalUri.startsWith('vertex://') &&
                            finalUri.trim() !== ''

          if (isValidUrl) {
            return {
              title,
              url: finalUri,
              doi: doi || undefined,
              isVertexRedirect: uri.includes('vertexaisearch.cloud.google.com')
            }
          } else if (doi) {
            // Si no hay URL válida pero hay DOI, usar DOI
            return {
              title,
              url: `https://doi.org/${doi}`,
              doi,
              isVertexRedirect: false
            }
          } else {
            // Si no se pudo resolver, devolver solo con título
            return {
              title,
              url: '',
              isVertexRedirect: true
            }
          }
        })

        const resolvedUrls = await Promise.all(resolutionPromises)
        urls.push(...resolvedUrls)

        console.log(`[VertexConverter] Successfully resolved ${urls.filter(u => u.url).length}/${chunks.length} URLs`)
      }
    } catch (error) {
      console.error('[VertexConverter] Error extracting URLs from grounding:', error)
    }

    return urls
  }

  /**
   * Formatea sección de referencias en Markdown
   * MEJORADO: Maneja referencias sin URL (solo título)
   */
  private formatReferencesSection(urls: Array<{
    title: string;
    url: string;
    doi?: string;
    isVertexRedirect?: boolean
  }>): string {
    if (urls.length === 0) return ''

    const references = urls.map((ref, index) => {
      // Si tiene DOI, usar DOI link
      if (ref.doi) {
        return `${index + 1}. [${ref.title}](https://doi.org/${ref.doi})`
      }

      // Si tiene URL válida (no vacía), usar URL
      if (ref.url && ref.url.trim() !== '') {
        return `${index + 1}. [${ref.title}](${ref.url})`
      }

      // Si no tiene URL (vertex redirect sin DOI), mostrar solo título
      return `${index + 1}. ${ref.title}`
    })

    let referencesText = `## Referencias\n\n${references.join('\n')}`

    // Agregar nota si hay referencias sin link
    const hasReferencesWithoutLink = urls.some(ref => !ref.url && !ref.doi)
    if (hasReferencesWithoutLink) {
      referencesText += '\n\n*Nota: Algunas referencias provienen de búsquedas académicas y pueden no tener enlaces directos disponibles. Puedes buscar estos títulos en [PubMed](https://pubmed.ncbi.nlm.nih.gov/), [Google Scholar](https://scholar.google.com/) o bases de datos académicas.*'
    }

    return referencesText
  }

  /**
   * Reemplaza referencias numeradas [1], [2] con links clickables
   */
  replaceNumberedReferences(
    text: string,
    references: Array<{ title: string; url: string }>
  ): string {
    let result = text

    references.forEach((ref, index) => {
      const refNumber = index + 1
      const pattern = new RegExp(`\\[${refNumber}\\]`, 'g')
      const replacement = `[[${refNumber}]](${ref.url} "${ref.title}")`
      result = result.replace(pattern, replacement)
    })

    return result
  }

  /**
   * Limpia URLs de parámetros de tracking de Google
   */
  cleanGoogleTrackingParams(url: string): string {
    try {
      const urlObj = new URL(url)
      
      // Lista de parámetros de tracking a remover
      const trackingParams = [
        'ved', 'gs_lcrp', 'ei', 'usg', 'sa', 'source',
        'cd', 'cad', 'uact', 'sqi', 'ved', 'url'
      ]

      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param)
      })

      return urlObj.toString()
    } catch {
      return url
    }
  }

  /**
   * Escapa caracteres especiales para regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Convierte respuesta con referencias inline a formato con sección de referencias
   */
  async convertInlineReferencesToSection(
    text: string,
    groundingMetadata?: any
  ): Promise<string> {
    // Extraer URLs del grounding metadata
    const urls = groundingMetadata 
      ? await this.extractValidatedUrlsFromGrounding(groundingMetadata)
      : []

    if (urls.length === 0) return text

    // Reemplazar referencias numeradas con superíndices
    let result = text
    urls.forEach((ref, index) => {
      const refNumber = index + 1
      // Buscar patrones como [1] o (1) y reemplazar con superíndice
      result = result.replace(
        new RegExp(`\\[${refNumber}\\]|\\(${refNumber}\\)`, 'g'),
        `<sup>[${refNumber}]</sup>`
      )
    })

    // Agregar sección de referencias al final
    const referencesSection = this.formatReferencesSection(urls)
    result += '\n\n' + referencesSection

    return result
  }
}

// Singleton instance
export const vertexLinkConverter = new VertexLinkConverter()

