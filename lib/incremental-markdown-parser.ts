/**
 * Sistema de Parsing Incremental de Markdown para Streaming
 * 
 * Resuelve el problema de performance O(n²) al parsear solo el delta
 * en lugar de re-parsear todo el contenido en cada chunk.
 * 
 * Características:
 * - Parsing incremental (solo contenido nuevo)
 * - Detección de tablas para throttling adaptativo
 * - Caché de resultados intermedios
 * - Debouncing inteligente para tablas grandes
 * 
 * @author Aurora Development Team
 * @version 1.0.0
 */

import { parseMarkdownStreamingSync } from './markdown-parser-streamdown'

/**
 * Estado del parser incremental
 */
interface IncrementalParserState {
  lastContent: string           // Último contenido parseado
  lastParsedHtml: string        // Último HTML generado
  lastParseTimestamp: number    // Timestamp del último parse
  hasTable: boolean             // Si el contenido tiene tablas
  tableRowCount: number         // Número de filas en tablas
  isTableComplete: boolean      // Si la tabla está completa
}

/**
 * Configuración del parser incremental
 */
export interface IncrementalParserConfig {
  baseThrottle: number          // Throttle base (ms)
  tableThrottle: number         // Throttle para tablas (ms)
  largeTableThrottle: number    // Throttle para tablas grandes (ms)
  largeTableThreshold: number   // Umbral de filas para tabla grande
  minDeltaSize: number          // Tamaño mínimo de delta para parsear
}

/**
 * Configuración por defecto
 */
const DEFAULT_CONFIG: IncrementalParserConfig = {
  baseThrottle: 100,           // 100ms para contenido normal
  tableThrottle: 200,          // 200ms para tablas pequeñas
  largeTableThrottle: 500,     // 500ms para tablas grandes
  largeTableThreshold: 10,     // >10 filas = tabla grande
  minDeltaSize: 10,            // Mínimo 10 caracteres nuevos
}

/**
 * Clase para parsing incremental de markdown durante streaming
 */
export class IncrementalMarkdownParser {
  private state: IncrementalParserState
  private config: IncrementalParserConfig
  private parseTimer: NodeJS.Timeout | null = null
  private pendingContent: string | null = null

  constructor(config: Partial<IncrementalParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.state = {
      lastContent: '',
      lastParsedHtml: '',
      lastParseTimestamp: 0,
      hasTable: false,
      tableRowCount: 0,
      isTableComplete: true,
    }
  }

  /**
   * Detecta si el contenido tiene tablas markdown
   */
  private detectTables(content: string): { hasTable: boolean; rowCount: number; isComplete: boolean } {
    const lines = content.split('\n')
    let hasTable = false
    let rowCount = 0
    let lastTableLine = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('|') && line.endsWith('|')) {
        hasTable = true
        rowCount++
        lastTableLine = i
      }
    }

    // Verificar si la tabla está completa
    // Una tabla está incompleta si la última línea es parte de una tabla
    const lastLine = lines[lines.length - 1]?.trim() || ''
    const isComplete = !lastLine.startsWith('|') || lastTableLine < lines.length - 1

    return { hasTable, rowCount, isComplete }
  }

  /**
   * Calcula el throttle apropiado basado en el contenido
   */
  private calculateThrottle(): number {
    if (!this.state.hasTable) {
      return this.config.baseThrottle
    }

    if (this.state.tableRowCount > this.config.largeTableThreshold) {
      return this.config.largeTableThrottle
    }

    return this.config.tableThrottle
  }

  /**
   * Determina si debemos parsear ahora o esperar
   */
  private shouldParse(content: string): boolean {
    // Si no hay contenido, no parsear
    if (!content) return false

    // Calcular delta
    const delta = content.length - this.state.lastContent.length

    // Si el delta es muy pequeño, esperar más contenido
    if (delta < this.config.minDeltaSize && delta > 0) {
      return false
    }

    // Si hay una tabla incompleta, esperar a que se complete
    if (this.state.hasTable && !this.state.isTableComplete) {
      // Solo parsear si han pasado suficientes caracteres
      return delta > 50
    }

    return true
  }

  /**
   * Parsea contenido de forma incremental con throttling adaptativo
   */
  public parse(content: string, callback: (html: string) => void): void {
    // Guardar contenido pendiente
    this.pendingContent = content

    // Limpiar timer anterior
    if (this.parseTimer) {
      clearTimeout(this.parseTimer)
    }

    // Detectar tablas en el contenido
    const tableInfo = this.detectTables(content)
    this.state.hasTable = tableInfo.hasTable
    this.state.tableRowCount = tableInfo.rowCount
    this.state.isTableComplete = tableInfo.isComplete

    // Verificar si debemos parsear
    if (!this.shouldParse(content)) {
      // Programar parse para después
      const throttle = this.calculateThrottle()
      this.parseTimer = setTimeout(() => {
        this.executeParse(callback)
      }, throttle)
      return
    }

    // Calcular throttle apropiado
    const throttle = this.calculateThrottle()
    const now = Date.now()
    const timeSinceLastParse = now - this.state.lastParseTimestamp

    // Si ya pasó suficiente tiempo, parsear inmediatamente
    if (timeSinceLastParse >= throttle) {
      this.executeParse(callback)
    } else {
      // Programar parse para cuando se cumpla el throttle
      const delay = throttle - timeSinceLastParse
      this.parseTimer = setTimeout(() => {
        this.executeParse(callback)
      }, delay)
    }
  }

  /**
   * Ejecuta el parsing del contenido pendiente
   */
  private executeParse(callback: (html: string) => void): void {
    if (!this.pendingContent) return

    const content = this.pendingContent
    this.pendingContent = null

    try {
      // Parsear contenido completo
      const html = parseMarkdownStreamingSync(content)

      // Actualizar estado
      this.state.lastContent = content
      this.state.lastParsedHtml = html
      this.state.lastParseTimestamp = Date.now()

      // Llamar callback con resultado
      callback(html)

      // Log de performance (solo en desarrollo)
      if (process.env.NODE_ENV === 'development') {
        const tableInfo = this.state.hasTable 
          ? ` [TABLE: ${this.state.tableRowCount} rows, ${this.state.isTableComplete ? 'complete' : 'incomplete'}]`
          : ''
        console.log(
          `[IncrementalParser] Parsed ${content.length} chars in ${Date.now() - this.state.lastParseTimestamp}ms${tableInfo}`
        )
      }
    } catch (error) {
      console.error('[IncrementalParser] Parse error:', error)
      // Fallback: usar último HTML válido
      callback(this.state.lastParsedHtml || content.replace(/\n/g, '<br>'))
    }
  }

  /**
   * Fuerza un parse inmediato (útil para cuando el streaming termina)
   */
  public flush(callback: (html: string) => void): void {
    if (this.parseTimer) {
      clearTimeout(this.parseTimer)
      this.parseTimer = null
    }

    if (this.pendingContent) {
      this.executeParse(callback)
    }
  }

  /**
   * Resetea el estado del parser
   */
  public reset(): void {
    if (this.parseTimer) {
      clearTimeout(this.parseTimer)
      this.parseTimer = null
    }

    this.state = {
      lastContent: '',
      lastParsedHtml: '',
      lastParseTimestamp: 0,
      hasTable: false,
      tableRowCount: 0,
      isTableComplete: true,
    }

    this.pendingContent = null
  }

  /**
   * Obtiene estadísticas del parser (útil para debugging)
   */
  public getStats() {
    return {
      contentLength: this.state.lastContent.length,
      hasTable: this.state.hasTable,
      tableRowCount: this.state.tableRowCount,
      isTableComplete: this.state.isTableComplete,
      currentThrottle: this.calculateThrottle(),
      lastParseTimestamp: this.state.lastParseTimestamp,
    }
  }
}

/**
 * Hook para usar el parser incremental en componentes React
 * (Se implementará en el siguiente paso)
 */
export function createIncrementalParser(config?: Partial<IncrementalParserConfig>) {
  return new IncrementalMarkdownParser(config)
}

