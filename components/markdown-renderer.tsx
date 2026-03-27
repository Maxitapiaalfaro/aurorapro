"use client"

import React, { useMemo, memo, useEffect, useRef, useState } from 'react'
import {
  parseMarkdownSync,
  parseMarkdownStreamingSync,
  sanitizeMarkdownContent
} from '@/lib/markdown-parser-streamdown'
import { useIncrementalMarkdown } from '@/hooks/use-incremental-markdown'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  className?: string
  /**
   * Si es true, el contenido se considera seguro y se renderiza como HTML
   * Si es false, se escapa el HTML por seguridad
   */
  trusted?: boolean
}

/**
 * Componente para renderizar contenido Markdown de forma segura y elegante
 * Optimizado para mensajes clínicos con soporte para streaming
 */
const MarkdownRendererComponent = ({
  content,
  isStreaming = false,
  className = '',
  trusted = true
}: MarkdownRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null)

  const renderedContent = useMemo(() => {
    if (!content) return ''

    // Sanitizar el contenido primero
    const sanitizedContent = sanitizeMarkdownContent(content)

    if (!sanitizedContent) return ''

    // Usar el parser apropiado según si es streaming o no
    // Usamos versiones síncronas para compatibilidad con useMemo
    if (isStreaming) {
      return parseMarkdownStreamingSync(sanitizedContent)
    } else {
      return parseMarkdownSync(sanitizedContent)
    }
  }, [content, isStreaming])

  // 🔥 OPTIMIZACIÓN: Detectar scroll en tablas para ocultar indicador
  useEffect(() => {
    if (!containerRef.current) return

    const tableWrappers = containerRef.current.querySelectorAll('.clinical-table-wrapper')

    const handleScroll = (wrapper: Element) => {
      const scrollLeft = wrapper.scrollLeft
      if (scrollLeft > 10) {
        wrapper.classList.add('scrolled')
      } else {
        wrapper.classList.remove('scrolled')
      }
    }

    const listeners: Array<{ element: Element; handler: () => void }> = []

    tableWrappers.forEach(wrapper => {
      const handler = () => handleScroll(wrapper)
      wrapper.addEventListener('scroll', handler, { passive: true })
      listeners.push({ element: wrapper, handler })
    })

    return () => {
      listeners.forEach(({ element, handler }) => {
        element.removeEventListener('scroll', handler)
      })
    }
  }, [renderedContent])

  // Si no hay contenido, no renderizar nada
  if (!renderedContent) {
    return null
  }
  
  // Si no es contenido confiable, mostrar como texto plano
  if (!trusted) {
    return (
      <div className={cn('font-sans text-base leading-relaxed whitespace-pre-wrap', className)}>
        {content}
      </div>
    )
  }
  
  return (
    <div
      ref={containerRef}
      className={cn(
        'markdown-content text-base leading-relaxed font-sans',
        // Estilos base optimizados
        'prose prose-sans max-w-none paper-noise',
        // 🔥 CRÍTICO: Evitar que tablas expandan el contenedor
        'min-w-0 w-full overflow-hidden',
        // Personalización de colores para el tema clínico
        'dark:prose-invert',
        'prose-headings:text-foreground prose-p:text-foreground/90',
        'prose-strong:text-foreground prose-em:text-muted-foreground',
        'prose-code:text-foreground prose-code:bg-muted',
        'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
        'prose-blockquote:border-blue-200 dark:prose-blockquote:border-blue-900/40 prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-950/30',
        'prose-a:text-primary hover:prose-a:underline',
        // Prevent cutting/overflow on mobile (long links, words)
        'break-words prose-a:break-words prose-li:break-words prose-code:break-words',
        'overflow-wrap-anywhere hyphens-auto',
        // Espaciado optimizado
        'prose-p:mb-3 prose-headings:mb-2 prose-headings:mt-3',
        'prose-ul:my-2 prose-ol:my-2 prose-li:my-1',
        className
      )}
      style={{
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        hyphens: 'auto'
      }}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  )
}

// Memoizar el componente para evitar re-renders innecesarios
export const MarkdownRenderer = memo(MarkdownRendererComponent)

/**
 * Hook para usar el renderizador de markdown con estado
 */
export function useMarkdownRenderer(content: string, isStreaming = false) {
  const renderedContent = useMemo(() => {
    if (!content) return ''

    const sanitizedContent = sanitizeMarkdownContent(content)
    if (!sanitizedContent) return ''

    return isStreaming
      ? parseMarkdownStreamingSync(sanitizedContent)
      : parseMarkdownSync(sanitizedContent)
  }, [content, isStreaming])

  return renderedContent
}

/**
 * Componente especializado para mensajes de streaming
 * Incluye indicador de escritura y manejo optimizado de contenido parcial
 *
 * 🚀 OPTIMIZACIÓN: Usa parsing incremental para evitar re-parsear todo el contenido
 */
interface StreamingMarkdownRendererProps {
  content: string
  className?: string
  showTypingIndicator?: boolean
  enableIncrementalParsing?: boolean  // Flag para habilitar/deshabilitar optimización
}

const StreamingMarkdownRendererComponent = ({
  content,
  className = '',
  showTypingIndicator = true,
  enableIncrementalParsing = true  // Habilitado por defecto
}: StreamingMarkdownRendererProps) => {
  // 🚀 OPTIMIZACIÓN: Usar parsing incremental si está habilitado
  const { html: incrementalHtml } = useIncrementalMarkdown(
    content,
    true,  // isStreaming = true
    {
      enabled: enableIncrementalParsing,
      config: {
        baseThrottle: 100,        // 100ms para contenido normal
        tableThrottle: 200,       // 200ms para tablas pequeñas
        largeTableThrottle: 500,  // 500ms para tablas grandes (>10 filas)
        largeTableThreshold: 10,
        minDeltaSize: 10,
      },
    }
  )

  // Fallback al método anterior si incremental está deshabilitado
  const fallbackHtml = useMarkdownRenderer(content, true)

  const renderedContent = enableIncrementalParsing ? incrementalHtml : fallbackHtml

  if (!content && !showTypingIndicator) {
    return null
  }
  
  return (
    <div className={cn('relative', className)}>
      {renderedContent ? (
        <div
          className={cn(
            'markdown-content text-base leading-relaxed font-sans prose prose-sans max-w-none dark:prose-invert',
            // 🔥 CRÍTICO: Evitar que tablas expandan el contenedor
            'min-w-0 w-full overflow-hidden',
            // Estilos optimizados para streaming
            'prose-headings:text-foreground prose-p:text-foreground/90',
            'prose-strong:text-foreground prose-em:text-muted-foreground',
            'prose-code:text-foreground prose-code:bg-muted',
            'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
            'prose-blockquote:border-blue-200 dark:prose-blockquote:border-blue-900/40 prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-950/30',
            'prose-a:text-primary hover:prose-a:underline',
            // Prevent cutting/overflow on mobile (long links, words)
            'break-words prose-a:break-words prose-li:break-words prose-code:break-words',
            'overflow-wrap-anywhere hyphens-auto',
            'prose-p:mb-3 prose-headings:mb-2 prose-headings:mt-3',
            'prose-ul:my-2 prose-ol:my-2 prose-li:my-1'
          )}
          style={{
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            hyphens: 'auto'
          }}
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />
      ) : (
        <div className="font-sans text-base text-gray-500 italic">
          Escribiendo...
        </div>
      )}
      
      {showTypingIndicator && content && (
        <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-text-bottom" />
      )}
    </div>
  )
}

export const StreamingMarkdownRenderer = memo(StreamingMarkdownRendererComponent)

export default MarkdownRenderer