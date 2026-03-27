import { defaultSchema } from 'rehype-sanitize'

/**
 * Esquema de sanitización personalizado para Aurora
 * Basado en el esquema por defecto pero extendido para soportar:
 * - Syntax highlighting en bloques de código
 * - Clases CSS personalizadas para agentes
 * - Tablas clínicas con clases específicas
 * - Elementos de UI clínicos
 */
export const auroraSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Permitir clases en elementos de código para syntax highlighting
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-/, /^hljs-/]
    ],
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      ['className']
    ],
    // Permitir clases en spans para resaltado de agentes
    span: [
      ...(defaultSchema.attributes?.span || []),
      [
        'className',
        // Clases de agentes (colores de texto)
        /^text-clarity-blue-/,
        /^text-serene-teal-/,
        /^text-warm-amber-/,
        /^text-mineral-gray-/,
        // Clases de utilidad de Tailwind
        /^font-/,
        /^text-/,
        /^bg-/,
        /^border-/,
        /^rounded-/,
        /^p-/,
        /^m-/,
        /^space-/,
        /^leading-/,
        /^tracking-/
      ]
    ],
    // Permitir clases en divs para wrappers de tablas y otros contenedores
    div: [
      ...(defaultSchema.attributes?.div || []),
      [
        'className',
        /^clinical-table-/,
        /^markdown-/,
        /^prose/,
        /^flex/,
        /^grid/,
        /^container/,
        /^overflow-/,
        /^relative/,
        /^absolute/,
        /^border-/,
        /^rounded-/,
        /^shadow-/,
        /^bg-/,
        /^p-/,
        /^m-/,
        /^w-/,
        /^h-/,
        /^max-/,
        /^min-/
      ]
    ],
    // Permitir clases en tablas y elementos relacionados
    table: [
      ...(defaultSchema.attributes?.table || []),
      ['className', /^clinical-table/, /^table-/, /^border-/, /^w-/, /^text-/]
    ],
    thead: [
      ...(defaultSchema.attributes?.thead || []),
      ['className', /^clinical-table-/, /^bg-/, /^border-/, /^text-/]
    ],
    tbody: [
      ...(defaultSchema.attributes?.tbody || []),
      ['className']
    ],
    tr: [
      ...(defaultSchema.attributes?.tr || []),
      ['className', /^clinical-table-/, /^border-/, /^hover:/, /^bg-/]
    ],
    th: [
      ...(defaultSchema.attributes?.th || []),
      ['className', /^clinical-table-/, /^font-/, /^text-/, /^p-/, /^border-/],
      ['scope']
    ],
    td: [
      ...(defaultSchema.attributes?.td || []),
      ['className', /^clinical-table-/, /^text-/, /^p-/, /^border-/],
      ['data-label'] // Para tablas responsivas en modo tarjeta
    ],
    // Permitir clases en headings
    h1: [
      ...(defaultSchema.attributes?.h1 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/, /^border-/, /^pb-/]
    ],
    h2: [
      ...(defaultSchema.attributes?.h2 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/]
    ],
    h3: [
      ...(defaultSchema.attributes?.h3 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/]
    ],
    h4: [
      ...(defaultSchema.attributes?.h4 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/]
    ],
    h5: [
      ...(defaultSchema.attributes?.h5 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/]
    ],
    h6: [
      ...(defaultSchema.attributes?.h6 || []),
      ['className', /^text-/, /^font-/, /^mt-/, /^mb-/]
    ],
    // Permitir clases en párrafos
    p: [
      ...(defaultSchema.attributes?.p || []),
      ['className', /^leading-/, /^mb-/, /^text-/, /^last:/]
    ],
    // Permitir clases en listas
    ul: [
      ...(defaultSchema.attributes?.ul || []),
      ['className', /^list-/, /^space-/, /^my-/, /^ml-/, /^pl-/]
    ],
    ol: [
      ...(defaultSchema.attributes?.ol || []),
      ['className', /^list-/, /^space-/, /^my-/, /^ml-/, /^pl-/]
    ],
    li: [
      ...(defaultSchema.attributes?.li || []),
      ['className', /^leading-/, /^pl-/]
    ],
    // Permitir clases en blockquotes
    blockquote: [
      ...(defaultSchema.attributes?.blockquote || []),
      ['className', /^border-/, /^bg-/, /^pl-/, /^py-/, /^my-/, /^italic/]
    ],
    // Permitir clases en enlaces
    a: [
      ...(defaultSchema.attributes?.a || []),
      ['className', /^text-/, /^hover:/, /^underline/, /^break-/],
      ['href', /^https?:\/\//, /^mailto:/],
      ['target', '_blank'],
      ['rel', 'noopener', 'noreferrer']
    ],
    // Permitir clases en imágenes
    img: [
      ...(defaultSchema.attributes?.img || []),
      ['className', /^rounded-/, /^shadow-/, /^max-/, /^w-/, /^h-/],
      ['alt'],
      ['src', /^https?:\/\//, /^data:image\//],
      ['loading', 'lazy'],
      ['decoding', 'async']
    ]
  },
  // Permitir todos los elementos estándar de markdown más algunos adicionales
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'div', // Para wrappers de tablas y otros contenedores
    'span', // Para resaltado de agentes
    'pre', // Para bloques de código
    'code', // Para código inline y en bloques
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
    'strong',
    'em',
    'del',
    'img',
    'br',
    'hr'
  ]
}

/**
 * Esquema de sanitización estricto para contenido no confiable
 * Usa configuración más restrictiva para prevenir ataques de inyección
 */
export const strictSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Solo permitir clases muy específicas
    span: [['className', /^text-/, /^font-/]],
    a: [
      ['href', /^https?:\/\//],
      ['target', '_blank'],
      ['rel', 'noopener noreferrer']
    ]
  },
  // Lista más restrictiva de elementos permitidos
  tagNames: [
    'p',
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
  ]
}

