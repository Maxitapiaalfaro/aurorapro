/**
 * React Hook para Parsing Incremental de Markdown
 * 
 * Optimiza el rendering de markdown durante streaming al parsear
 * solo el contenido nuevo en lugar de re-parsear todo.
 * 
 * Características:
 * - Parsing incremental automático
 * - Throttling adaptativo basado en contenido
 * - Detección de tablas para ajustar performance
 * - Cleanup automático al desmontar
 * 
 * @author Aurora Development Team
 * @version 1.0.0
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { IncrementalMarkdownParser } from '@/lib/incremental-markdown-parser'
import type { IncrementalParserConfig } from '@/lib/incremental-markdown-parser'

/**
 * Opciones del hook
 */
interface UseIncrementalMarkdownOptions {
  enabled?: boolean                              // Si el parsing incremental está habilitado
  config?: Partial<IncrementalParserConfig>     // Configuración del parser
  onParseComplete?: (stats: any) => void        // Callback cuando termina el parsing
}

/**
 * Hook para parsing incremental de markdown durante streaming
 * 
 * @param content - Contenido markdown a parsear
 * @param isStreaming - Si el contenido está en streaming
 * @param options - Opciones del hook
 * @returns HTML parseado
 * 
 * @example
 * ```tsx
 * const { html, stats } = useIncrementalMarkdown(
 *   partialContent,
 *   isStreaming,
 *   {
 *     config: {
 *       baseThrottle: 100,
 *       tableThrottle: 200,
 *     }
 *   }
 * )
 * ```
 */
export function useIncrementalMarkdown(
  content: string,
  isStreaming: boolean,
  options: UseIncrementalMarkdownOptions = {}
) {
  const { enabled = true, config, onParseComplete } = options

  // Estado del HTML parseado
  const [html, setHtml] = useState<string>('')
  
  // Referencia al parser (persiste entre renders)
  const parserRef = useRef<IncrementalMarkdownParser | null>(null)
  
  // Referencia al último contenido procesado
  const lastContentRef = useRef<string>('')

  // Inicializar parser
  useEffect(() => {
    if (enabled && !parserRef.current) {
      parserRef.current = new IncrementalMarkdownParser(config)
    }
  }, [enabled, config])

  // Callback para actualizar HTML
  const handleParsed = useCallback((parsedHtml: string) => {
    setHtml(parsedHtml)
    
    if (onParseComplete && parserRef.current) {
      const stats = parserRef.current.getStats()
      onParseComplete(stats)
    }
  }, [onParseComplete])

  // Efecto principal: parsear contenido cuando cambia
  useEffect(() => {
    if (!enabled || !parserRef.current) {
      // Si está deshabilitado, usar fallback simple
      setHtml(content.replace(/\n/g, '<br>'))
      return
    }

    // Si el contenido no cambió, no hacer nada
    if (content === lastContentRef.current) {
      return
    }

    lastContentRef.current = content

    if (isStreaming) {
      // Durante streaming: usar parsing incremental con throttling
      parserRef.current.parse(content, handleParsed)
    } else {
      // Cuando termina el streaming: flush inmediato
      parserRef.current.flush(handleParsed)
    }
  }, [content, isStreaming, enabled, handleParsed])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (parserRef.current) {
        parserRef.current.reset()
      }
    }
  }, [])

  // Obtener estadísticas del parser
  const getStats = useCallback(() => {
    return parserRef.current?.getStats() || null
  }, [])

  return {
    html,
    stats: getStats(),
    parser: parserRef.current,
  }
}

/**
 * Hook simplificado para casos de uso básicos
 * 
 * @example
 * ```tsx
 * const html = useStreamingMarkdown(partialContent, isStreaming)
 * ```
 */
export function useStreamingMarkdown(content: string, isStreaming: boolean): string {
  const { html } = useIncrementalMarkdown(content, isStreaming)
  return html
}

