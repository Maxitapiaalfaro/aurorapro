import MarkdownIt from 'markdown-it'
import { getAgentVisualConfig } from '@/config/agent-visual-config'
import type { AgentType } from '@/types/clinical-types'

// Instancia singleton optimizada de markdown-it para mensajes clínicos
let mdInstance: MarkdownIt | null = null

// Función para obtener la instancia configurada (lazy loading)
function getMarkdownInstance(): MarkdownIt {
  if (!mdInstance) {
    mdInstance = new MarkdownIt({
      html: true, // Permitir HTML para resaltado de menciones de agentes
      xhtmlOut: false,
      breaks: true, // Convertir saltos de línea en <br>
      linkify: true, // Autodetectar enlaces
      typographer: true, // Habilitar tipografía inteligente
    })
    
    // Configurar reglas de renderizado personalizadas
    configureCustomRules(mdInstance)
  }
  return mdInstance
}

// Configuración de reglas personalizadas separada para mejor mantenimiento
function configureCustomRules(md: MarkdownIt) {

  // Configurar reglas de renderizado personalizadas para el contexto clínico
  md.renderer.rules.heading_open = (tokens, idx) => {
    const token = tokens[idx]
    const level = token.tag.slice(1) // h1 -> 1, h2 -> 2, etc.
    const classes = {
      '1': 'text-xl font-sans font-semibold text-foreground mt-6 mb-3 border-b border-border pb-2 first:mt-0',
      '2': 'text-lg font-sans font-semibold text-foreground mt-5 mb-2 first:mt-0',
      '3': 'text-base font-sans font-semibold text-foreground mt-4 mb-1 first:mt-0',
      '4': 'font-semibold text-foreground mt-3 mb-1 first:mt-0',
      '5': 'font-medium text-muted-foreground mt-2 mb-1 first:mt-0',
      '6': 'font-normal text-muted-foreground mt-1 mb-1 first:mt-0'
    }
    return `<${token.tag} class="${classes[level as keyof typeof classes] || classes['3']}">`
  }

  // Personalizar listas para mejor legibilidad clínica
  md.renderer.rules.bullet_list_open = () => {
    return '<ul class="list-disc list-outside space-y-2 my-4 ml-6 pl-2">'
  }

  md.renderer.rules.ordered_list_open = () => {
    return '<ol class="list-decimal list-outside space-y-2 my-4 ml-6 pl-2">'
  }

  md.renderer.rules.list_item_open = () => {
    return '<li class="leading-relaxed pl-1">'
  }

  // Personalizar párrafos
  md.renderer.rules.paragraph_open = () => {
    return '<p class="leading-relaxed mb-4 last:mb-0">'
  }

  // Personalizar código inline y bloques
  md.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx]
    return `<code class="bg-secondary text-foreground/80 px-1 py-0.5 rounded font-mono text-[0.9em]">${md.utils.escapeHtml(token.content)}</code>`
  }

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const langClass = token.info ? ` language-${md.utils.escapeHtml(token.info)}` : ''
    return `<pre class="bg-secondary/50 border border-border/80 rounded-lg p-4 my-4 overflow-x-auto"><code class="font-mono text-[0.9em]${langClass}">${md.utils.escapeHtml(token.content)}</code></pre>`
  }

  // Personalizar blockquotes para citas clínicas
  md.renderer.rules.blockquote_open = () => {
    return '<blockquote class="border-l-4 border-primary/50 bg-secondary/80 pl-4 py-2 my-4 italic">'
  }

  // Personalizar enlaces
  md.renderer.rules.link_open = (tokens, idx) => {
    const token = tokens[idx]
    const href = token.attrGet('href') || '#'
    return `<a href="${href}" class="text-primary hover:underline" target="_blank" rel="noopener noreferrer">`
  }

  // 🔥 OPTIMIZACIÓN: Tablas clínicas profesionales con diseño mobile-first
  md.renderer.rules.table_open = () => {
    return '<div class="clinical-table-wrapper"><table class="clinical-table">'
  }

  md.renderer.rules.table_close = () => {
    return '</table></div>'
  }

  md.renderer.rules.thead_open = () => {
    return '<thead class="clinical-table-header">'
  }

  md.renderer.rules.th_open = () => {
    return '<th class="clinical-table-th">'
  }

  md.renderer.rules.td_open = () => {
    return '<td class="clinical-table-td">'
  }

  md.renderer.rules.tr_open = () => {
    return '<tr class="clinical-table-row">'
  }
}

// Cache para resultados de parsing (mejora rendimiento en re-renders)
const parseCache = new Map<string, string>()
const MAX_CACHE_SIZE = 100

/**
 * Parsea texto markdown a HTML con estilos optimizados para contenido clínico
 * @param content - Contenido markdown a parsear
 * @returns HTML parseado y estilizado
 */
export function parseMarkdown(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }
  
  // Verificar cache primero
  const cacheKey = `static:${content}`
  if (parseCache.has(cacheKey)) {
    return parseCache.get(cacheKey)!
  }
  
  try {
    // Aplicar resaltado de menciones de agentes antes del parsing
    const contentWithHighlights = highlightAgentMentions(content)
    
    const md = getMarkdownInstance()
    const result = md.render(contentWithHighlights)
    
    // Agregar al cache (con límite de tamaño)
    if (parseCache.size >= MAX_CACHE_SIZE) {
      const firstKey = parseCache.keys().next().value
      if (firstKey) {
        parseCache.delete(firstKey)
      }
    }
    parseCache.set(cacheKey, result)
    
    return result
  } catch (error) {
    console.error('Error parsing markdown:', error)
    // Fallback: retornar el contenido original con saltos de línea convertidos
    return content.replace(/\n/g, '<br>')
  }
}

/**
 * Detecta si hay una tabla markdown incompleta en el contenido
 * @param content - Contenido a analizar
 * @returns true si hay una tabla incompleta
 */
function hasIncompleteTable(content: string): boolean {
  // Buscar el inicio de una tabla (línea que empieza con |)
  const lines = content.split('\n')

  // Buscar la última tabla en el contenido
  let lastTableStart = -1
  let lastTableEnd = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('|') && line.endsWith('|')) {
      // Si no estamos en una tabla, este es el inicio
      if (lastTableStart === -1 || i > lastTableEnd) {
        lastTableStart = i
        lastTableEnd = i
      } else {
        // Extender la tabla actual
        lastTableEnd = i
      }
    } else if (lastTableStart !== -1 && line.length > 0 && !line.startsWith('|')) {
      // Fin de tabla (línea no vacía que no es parte de la tabla)
      // No hacer nada, la tabla ya terminó
    }
  }

  // Si no hay tabla, no está incompleta
  if (lastTableStart === -1) {
    return false
  }

  // Si la última línea del contenido es parte de una tabla, verificar si está completa
  const lastLine = lines[lines.length - 1].trim()
  if (!lastLine.startsWith('|') || !lastLine.endsWith('|')) {
    // La última línea no es parte de una tabla, así que la tabla está completa
    return false
  }

  // Contar líneas de la última tabla
  const tableLines = lines.slice(lastTableStart).filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'))

  // Una tabla completa necesita al menos:
  // 1. Header (| Col1 | Col2 |)
  // 2. Separator (|---|---|)
  // 3. Al menos 1 fila de datos
  if (tableLines.length < 3) {
    return true // Incompleta
  }

  // Verificar que tenga separator (segunda línea debe tener solo |, -, y espacios)
  if (tableLines.length >= 2) {
    const secondLine = tableLines[1].trim()
    const isSeparator = /^\|[\s\-|]+\|$/.test(secondLine)
    if (!isSeparator) {
      return true // No tiene separator válido, está incompleta
    }
  }

  return false // Tabla completa
}

/**
 * Extrae el contenido antes de una tabla incompleta
 * @param content - Contenido completo
 * @returns Contenido sin la tabla incompleta
 */
function extractContentBeforeIncompleteTable(content: string): string {
  const lines = content.split('\n')
  let lastCompleteIndex = lines.length - 1

  // Buscar hacia atrás desde el final hasta encontrar el inicio de la tabla incompleta
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('|') && line.endsWith('|')) {
      // Encontramos una línea de tabla, seguir buscando el inicio
      lastCompleteIndex = i - 1
    } else if (lastCompleteIndex < lines.length - 1) {
      // Ya pasamos la tabla incompleta
      break
    }
  }

  return lines.slice(0, lastCompleteIndex + 1).join('\n')
}

/**
 * Parsea texto markdown de forma incremental para streaming
 * Útil para mostrar contenido mientras se está recibiendo
 * @param content - Contenido markdown parcial
 * @returns HTML parseado que maneja contenido incompleto
 */
export function parseMarkdownStreaming(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  try {
    const md = getMarkdownInstance()

    // Para streaming, manejamos contenido incompleto de forma más inteligente
    let safeContent = content
    let pendingTableIndicator = ''

    // 🔥 OPTIMIZACIÓN CRÍTICA: Detectar tablas incompletas y NO parsearlas
    // Esto evita re-parsear tablas grandes en cada chunk
    const hasIncomplete = hasIncompleteTable(content)
    if (hasIncomplete) {
      const contentBeforeTable = extractContentBeforeIncompleteTable(content)
      safeContent = contentBeforeTable
      pendingTableIndicator = '\n\n*[Generando tabla...]*'
    }

    // Si termina con markdown incompleto, agregamos espacio para parsing seguro
    if (safeContent.endsWith('*') || safeContent.endsWith('_') || safeContent.endsWith('`') ||
        safeContent.endsWith('#') || safeContent.endsWith('-') || safeContent.endsWith('>')) {
      safeContent = safeContent + ' '
    }

    // Aplicar resaltado de menciones de agentes antes del parsing
    const contentWithHighlights = highlightAgentMentions(safeContent)

    const rendered = md.render(contentWithHighlights)

    // Agregar indicador de tabla pendiente si es necesario
    if (pendingTableIndicator) {
      return rendered + md.render(pendingTableIndicator)
    }

    return rendered
  } catch (error) {
    console.error('Error parsing streaming markdown:', error)
    // Fallback más robusto para streaming
    return content.replace(/\n/g, '<br>')
  }
}

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

// Exportar la instancia para casos especiales si es necesario
export { getMarkdownInstance }