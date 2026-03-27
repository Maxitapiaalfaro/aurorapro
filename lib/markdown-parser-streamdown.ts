/**
 * Sistema de renderizado Markdown optimizado para streaming con Streamdown
 * Reemplaza markdown-it con una solución nativa para streaming de LLM
 * 
 * Características:
 * - Análisis de sintaxis incompleta nativo
 * - Sanitización robusta con rehype-sanitize
 * - Soporte para GFM (GitHub Flavored Markdown)
 * - Componentes personalizados para tablas responsivas
 * - Resaltado de menciones de agentes
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { auroraSanitizeSchema, strictSanitizeSchema } from './markdown-sanitize-schema'
import { rehypeAuroraClasses, rehypeTableDataLabels } from './rehype-aurora-classes'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import type { AgentType } from '@/types/clinical-types'

/**
 * Procesador unificado para markdown estático (contenido completo)
 */
const staticProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, auroraSanitizeSchema as any)
  .use(rehypeAuroraClasses)
  .use(rehypeTableDataLabels)
  .use(rehypeStringify)

/**
 * Procesador unificado para markdown en streaming (contenido parcial)
 * Usa configuración más permisiva para manejar sintaxis incompleta
 */
const streamingProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, auroraSanitizeSchema as any)
  .use(rehypeAuroraClasses)
  .use(rehypeTableDataLabels)
  .use(rehypeStringify)

/**
 * Procesador estricto para contenido no confiable
 */
const strictProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, strictSanitizeSchema as any)
  .use(rehypeAuroraClasses)
  .use(rehypeTableDataLabels)
  .use(rehypeStringify)

// Cache para resultados de parsing (mejora rendimiento en re-renders)
const parseCache = new Map<string, string>()
const MAX_CACHE_SIZE = 100

/**
 * Detecta y resalta menciones de agentes en el contenido
 * @param content - Contenido a procesar
 * @returns Contenido con menciones de agentes resaltadas
 */
export function highlightAgentMentions(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  let processedContent = content

  // Patrones para detectar menciones exactas de agentes
  const agentPatterns = [
    { pattern: /\bSupervisor Clínico\b/g, type: 'socratico' as AgentType },
    { pattern: /\bEspecialista en Documentación\b/g, type: 'clinico' as AgentType },
    { pattern: /\bInvestigador Académico\b/g, type: 'academico' as AgentType }
  ]

  // Procesar cada tipo de agente (solo color de texto, sin fondo destacado)
  agentPatterns.forEach(({ pattern, type }) => {
    const config = getAgentVisualConfig(type)
    if (!config) return

    processedContent = processedContent.replace(pattern, (match) => {
      // Keep agent color and bold; inherit parent font size for consistency
      return `<span class="font-semibold ${config.textColor}">${match}</span>`
    })
  })

  return processedContent
}

/**
 * Limpia y sanitiza el contenido markdown antes del parsing
 * @param content - Contenido a limpiar
 * @returns Contenido limpio y seguro
 */
export function sanitizeMarkdownContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }
  
  // Remover caracteres de control peligrosos pero mantener saltos de línea
  return content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

/**
 * Detecta si hay una tabla markdown incompleta en el contenido
 * @param content - Contenido a analizar
 * @returns true si hay una tabla incompleta
 */
function hasIncompleteTable(content: string): boolean {
  const lines = content.split('\n')
  
  // Buscar la última tabla en el contenido
  let lastTableStart = -1
  let lastTableEnd = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('|') && line.endsWith('|')) {
      if (lastTableStart === -1 || i > lastTableEnd) {
        lastTableStart = i
        lastTableEnd = i
      } else {
        lastTableEnd = i
      }
    } else if (lastTableStart !== -1 && line.length > 0 && !line.startsWith('|')) {
      // Fin de tabla
    }
  }

  // Si no hay tabla, no está incompleta
  if (lastTableStart === -1) {
    return false
  }

  // Si la última línea del contenido es parte de una tabla, verificar si está completa
  const lastLine = lines[lines.length - 1].trim()
  if (!lastLine.startsWith('|') || !lastLine.endsWith('|')) {
    return false
  }

  // Contar líneas de la última tabla
  const tableLines = lines.slice(lastTableStart).filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))

  // Una tabla completa necesita al menos: Header, Separator, 1 fila de datos
  if (tableLines.length < 3) {
    return true
  }

  // Verificar que tenga separator
  if (tableLines.length >= 2) {
    const secondLine = tableLines[1].trim()
    const isSeparator = /^\|[\s\-|]+\|$/.test(secondLine)
    if (!isSeparator) {
      return true
    }
  }

  return false
}

/**
 * Extrae el contenido antes de una tabla incompleta
 * @param content - Contenido completo
 * @returns Contenido sin la tabla incompleta
 */
function extractContentBeforeIncompleteTable(content: string): string {
  const lines = content.split('\n')
  let lastCompleteIndex = lines.length - 1

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      lastCompleteIndex = i - 1
    } else if (lastCompleteIndex < lines.length - 1) {
      break
    }
  }

  return lines.slice(0, lastCompleteIndex + 1).join('\n')
}

/**
 * Parsea texto markdown a HTML con Streamdown
 * Optimizado para contenido completo y estático
 * 
 * @param content - Contenido markdown a parsear
 * @param options - Opciones de parsing
 * @returns HTML parseado y sanitizado
 */
export async function parseMarkdown(
  content: string,
  options: { strict?: boolean } = {}
): Promise<string> {
  if (!content || typeof content !== 'string') {
    return ''
  }
  
  // Verificar cache primero
  const cacheKey = `static:${options.strict ? 'strict:' : ''}${content}`
  if (parseCache.has(cacheKey)) {
    return parseCache.get(cacheKey)!
  }
  
  try {
    // Sanitizar y resaltar menciones de agentes
    const sanitized = sanitizeMarkdownContent(content)
    const withHighlights = highlightAgentMentions(sanitized)
    
    // Seleccionar procesador según opciones
    const processor = options.strict ? strictProcessor : staticProcessor
    
    // Procesar markdown
    const result = await processor.process(withHighlights)
    const html = String(result)
    
    // Agregar al cache (con límite de tamaño)
    if (parseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = parseCache.keys().next().value
      if (firstKey) {
        parseCache.delete(firstKey)
      }
    }
    parseCache.set(cacheKey, html)
    
    return html
  } catch (error) {
    console.error('Error parsing markdown:', error)
    // Fallback: retornar el contenido original con saltos de línea convertidos
    return content.replace(/\n/g, '<br>')
  }
}

/**
 * Parsea texto markdown de forma incremental para streaming
 * Maneja sintaxis incompleta de forma inteligente
 * 
 * @param content - Contenido markdown parcial
 * @returns HTML parseado que maneja contenido incompleto
 */
export async function parseMarkdownStreaming(content: string): Promise<string> {
  if (!content || typeof content !== 'string') {
    return ''
  }

  try {
    let safeContent = content
    let pendingTableIndicator = ''

    // 🔥 OPTIMIZACIÓN CRÍTICA: Detectar tablas incompletas y NO parsearlas
    const hasIncomplete = hasIncompleteTable(content)
    if (hasIncomplete) {
      const contentBeforeTable = extractContentBeforeIncompleteTable(content)
      safeContent = contentBeforeTable
      pendingTableIndicator = '\n\n*[Generando tabla...]*'
    }

    // Si termina con markdown incompleto, agregamos espacio para parsing seguro
    if (
      safeContent.endsWith('*') ||
      safeContent.endsWith('_') ||
      safeContent.endsWith('`') ||
      safeContent.endsWith('#') ||
      safeContent.endsWith('-') ||
      safeContent.endsWith('>')
    ) {
      safeContent = safeContent + ' '
    }

    // Sanitizar y resaltar menciones de agentes
    const sanitized = sanitizeMarkdownContent(safeContent)
    const withHighlights = highlightAgentMentions(sanitized)

    // Procesar markdown con procesador de streaming
    const result = await streamingProcessor.process(withHighlights)
    let html = String(result)

    // Agregar indicador de tabla pendiente si es necesario
    if (pendingTableIndicator) {
      const indicatorResult = await streamingProcessor.process(pendingTableIndicator)
      html += String(indicatorResult)
    }

    return html
  } catch (error) {
    console.error('Error parsing streaming markdown:', error)
    // Fallback más robusto para streaming
    return content.replace(/\n/g, '<br>')
  }
}

/**
 * Versión síncrona de parseMarkdown para compatibilidad con código existente
 * Usa el procesador de forma síncrona (puede ser más lento)
 */
export function parseMarkdownSync(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  try {
    const sanitized = sanitizeMarkdownContent(content)
    const withHighlights = highlightAgentMentions(sanitized)
    
    // Usar processSync para operación síncrona
    const result = staticProcessor.processSync(withHighlights)
    return String(result)
  } catch (error) {
    console.error('Error parsing markdown sync:', error)
    return content.replace(/\n/g, '<br>')
  }
}

/**
 * Versión síncrona de parseMarkdownStreaming
 */
export function parseMarkdownStreamingSync(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  try {
    let safeContent = content
    let pendingTableIndicator = ''

    const hasIncomplete = hasIncompleteTable(content)
    if (hasIncomplete) {
      const contentBeforeTable = extractContentBeforeIncompleteTable(content)
      safeContent = contentBeforeTable
      pendingTableIndicator = '\n\n*[Generando tabla...]*'
    }

    if (
      safeContent.endsWith('*') ||
      safeContent.endsWith('_') ||
      safeContent.endsWith('`') ||
      safeContent.endsWith('#') ||
      safeContent.endsWith('-') ||
      safeContent.endsWith('>')
    ) {
      safeContent = safeContent + ' '
    }

    const sanitized = sanitizeMarkdownContent(safeContent)
    const withHighlights = highlightAgentMentions(sanitized)

    const result = streamingProcessor.processSync(withHighlights)
    let html = String(result)

    if (pendingTableIndicator) {
      const indicatorResult = streamingProcessor.processSync(pendingTableIndicator)
      html += String(indicatorResult)
    }

    return html
  } catch (error) {
    console.error('Error parsing streaming markdown sync:', error)
    return content.replace(/\n/g, '<br>')
  }
}

