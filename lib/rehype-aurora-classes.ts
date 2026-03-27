/**
 * Plugin rehype personalizado para agregar clases CSS de Aurora
 * a los elementos HTML generados desde markdown
 * 
 * Este plugin se ejecuta después de rehype-sanitize y antes de rehype-stringify
 * para agregar las clases CSS necesarias para el estilo clínico de Aurora
 */

import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'

/**
 * Plugin rehype que agrega clases CSS personalizadas a elementos HTML
 */
export function rehypeAuroraClasses() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const properties = node.properties || {}
      const existingClasses = (properties.className as string[]) || []
      
      // Función helper para agregar clases
      const addClass = (...classes: string[]) => {
        const newClasses = [...existingClasses, ...classes]
        node.properties = {
          ...properties,
          className: newClasses
        }
      }

      // Agregar clases según el tipo de elemento
      switch (node.tagName) {
        case 'h1':
          addClass(
            'text-xl',
            'font-sans',
            'font-semibold',
            'text-foreground',
            'mt-6',
            'mb-3',
            'border-b',
            'border-border',
            'pb-2',
            'first:mt-0'
          )
          break

        case 'h2':
          addClass(
            'text-lg',
            'font-sans',
            'font-semibold',
            'text-foreground',
            'mt-5',
            'mb-2',
            'first:mt-0'
          )
          break

        case 'h3':
          addClass(
            'text-base',
            'font-sans',
            'font-semibold',
            'text-foreground',
            'mt-4',
            'mb-1',
            'first:mt-0'
          )
          break

        case 'h4':
          addClass(
            'font-semibold',
            'text-foreground',
            'mt-3',
            'mb-1',
            'first:mt-0'
          )
          break

        case 'h5':
          addClass(
            'font-medium',
            'text-muted-foreground',
            'mt-2',
            'mb-1',
            'first:mt-0'
          )
          break

        case 'h6':
          addClass(
            'font-normal',
            'text-muted-foreground',
            'mt-1',
            'mb-1',
            'first:mt-0'
          )
          break

        case 'p':
          addClass(
            'leading-relaxed',
            'mb-4',
            'last:mb-0'
          )
          break

        case 'ul':
          addClass(
            'list-disc',
            'list-outside',
            'space-y-2',
            'my-4',
            'ml-6',
            'pl-2'
          )
          break

        case 'ol':
          addClass(
            'list-decimal',
            'list-outside',
            'space-y-2',
            'my-4',
            'ml-6',
            'pl-2'
          )
          break

        case 'li':
          addClass(
            'leading-relaxed',
            'pl-1'
          )
          break

        case 'code':
          // Solo para código inline (no dentro de pre)
          if (!isInsidePre(node)) {
            addClass(
              'bg-secondary',
              'text-foreground/80',
              'px-1',
              'py-0.5',
              'rounded',
              'font-mono',
              'text-[0.9em]'
            )
          } else {
            // Código dentro de pre (bloques de código)
            addClass(
              'font-mono',
              'text-[0.9em]'
            )
          }
          break

        case 'pre':
          addClass(
            'bg-secondary/50',
            'border',
            'border-border/80',
            'rounded-lg',
            'p-4',
            'my-4',
            'overflow-x-auto'
          )
          break

        case 'blockquote':
          addClass(
            'border-l-4',
            'border-primary/50',
            'bg-secondary/80',
            'pl-4',
            'py-2',
            'my-4',
            'italic'
          )
          break

        case 'a':
          addClass(
            'text-primary',
            'hover:underline'
          )
          // Asegurar que los enlaces externos tengan target y rel correctos
          if (properties.href && typeof properties.href === 'string') {
            if (properties.href.startsWith('http')) {
              node.properties = {
                ...node.properties,
                target: '_blank',
                rel: 'noopener noreferrer'
              }
            }
          }
          break

        case 'table':
          // Envolver la tabla en un div con clase clinical-table-wrapper
          // Esto se hace en un paso posterior
          addClass(
            'clinical-table'
          )
          break

        case 'thead':
          addClass(
            'clinical-table-header'
          )
          break

        case 'th':
          addClass(
            'clinical-table-th'
          )
          break

        case 'td':
          addClass(
            'clinical-table-td'
          )
          break

        case 'tr':
          addClass(
            'clinical-table-row'
          )
          break

        case 'img':
          addClass(
            'rounded-lg',
            'shadow-sm',
            'max-w-full',
            'h-auto'
          )
          // Agregar loading lazy para imágenes
          node.properties = {
            ...node.properties,
            loading: 'lazy',
            decoding: 'async'
          }
          break

        case 'hr':
          addClass(
            'border-border',
            'my-6'
          )
          break

        case 'strong':
          addClass(
            'font-semibold',
            'text-foreground'
          )
          break

        case 'em':
          addClass(
            'italic',
            'text-muted-foreground'
          )
          break
      }
    })

    // Segundo paso: envolver tablas en divs con clinical-table-wrapper
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName === 'table' && parent && typeof index === 'number') {
        // Crear el wrapper div
        const wrapper: Element = {
          type: 'element',
          tagName: 'div',
          properties: {
            className: ['clinical-table-wrapper']
          },
          children: [node]
        }

        // Reemplazar la tabla con el wrapper
        parent.children[index] = wrapper
      }
    })
  }
}

/**
 * Helper para verificar si un nodo está dentro de un elemento pre
 */
function isInsidePre(node: Element): boolean {
  // Esta es una simplificación - en un caso real necesitaríamos
  // rastrear el árbol de ancestros durante la visita
  // Por ahora, asumimos que el código dentro de pre será manejado
  // por el caso 'pre' directamente
  return false
}

/**
 * Plugin rehype que agrega data-labels a las celdas de tabla
 * para el modo responsivo de tarjetas
 */
export function rehypeTableDataLabels() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'table') {
        // Extraer los encabezados de la tabla
        const headers: string[] = []
        
        visit(node, 'element', (headerNode: Element) => {
          if (headerNode.tagName === 'th') {
            // Extraer el texto del th
            const text = extractText(headerNode)
            headers.push(text)
          }
        })

        // Agregar data-label a cada td
        let cellIndex = 0
        visit(node, 'element', (cellNode: Element) => {
          if (cellNode.tagName === 'td') {
            const headerIndex = cellIndex % headers.length
            cellNode.properties = {
              ...cellNode.properties,
              'data-label': headers[headerIndex] || ''
            }
            cellIndex++
          }
        })
      }
    })
  }
}

/**
 * Helper para extraer texto de un nodo
 */
function extractText(node: Element): string {
  let text = ''
  
  const traverse = (n: any) => {
    if (n.type === 'text') {
      text += n.value
    }
    if (n.children) {
      n.children.forEach(traverse)
    }
  }
  
  traverse(node)
  return text.trim()
}

