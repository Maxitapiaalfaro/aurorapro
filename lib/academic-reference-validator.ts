/**
 * Schema de validación y formateo automático para referencias académicas
 * Garantiza que todas las referencias del agente académico sean clickables
 */

import { z } from 'zod'

// Schema para una referencia académica individual
export const AcademicReferenceSchema = z.object({
  title: z.string()
    .min(5, "El título debe tener al menos 5 caracteres")
    .max(100, "El título no debe exceder 100 caracteres")
    .describe("Título descriptivo del estudio o artículo"),
  
  url: z.string()
    .url("Debe ser una URL válida")
    .describe("URL completa y verificable de la fuente"),
  
  authors: z.string().optional()
    .describe("Autores del estudio (opcional)"),
    
  year: z.number().int().min(1900).max(2025).optional()
    .describe("Año de publicación (opcional)"),
    
  journal: z.string().optional()
    .describe("Revista o fuente de publicación (opcional)")
})

// Schema para la respuesta completa del agente académico
export const AcademicResponseSchema = z.object({
  content: z.string()
    .min(50, "La respuesta debe ser sustantiva")
    .describe("Contenido principal de la respuesta académica"),
  
  references: z.array(AcademicReferenceSchema)
    .min(1, "Debe incluir al menos una referencia")
    .max(10, "Máximo 10 referencias por respuesta")
    .describe("Lista de referencias académicas verificables"),
    
  evidenceLevel: z.enum(['meta-analysis', 'rct', 'cohort', 'case-study', 'review'])
    .optional()
    .describe("Nivel de evidencia del estudio principal citado"),
    
  limitations: z.string().optional()
    .describe("Limitaciones metodológicas identificadas")
})

export type AcademicReference = z.infer<typeof AcademicReferenceSchema>
export type AcademicResponse = z.infer<typeof AcademicResponseSchema>

/**
 * Formatea automáticamente las referencias a sintaxis Markdown clickable
 * @param references Array de referencias validadas
 * @returns String en formato Markdown con referencias clickables
 */
export function formatReferencesToMarkdown(references: AcademicReference[]): string {
  if (!references || references.length === 0) {
    return ""
  }
  
  const markdownReferences = references.map(ref => {
    // Formato básico: - [Título](URL)
    let markdownLine = `- [${ref.title}](${ref.url})`
    
    // Agregar metadatos adicionales si están disponibles
    const metadata: string[] = []
    if (ref.authors) metadata.push(ref.authors)
    if (ref.year) metadata.push(ref.year.toString())
    if (ref.journal) metadata.push(ref.journal)
    
    if (metadata.length > 0) {
      markdownLine += ` *(${metadata.join(', ')})*`
    }
    
    return markdownLine
  })
  
  return `## Referencias\n\n${markdownReferences.join('\n')}`
}

/**
 * Valida y auto-formatea una respuesta académica completa
 * @param rawResponse Respuesta sin procesar del LLM
 * @returns Respuesta validada con referencias en formato clickable
 */
export function validateAndFormatAcademicResponse(rawResponse: any): {
  isValid: boolean
  formattedResponse?: string
  errors?: string[]
  references?: AcademicReference[]
} {
  try {
    // Intentar parsear la respuesta estructurada
    const validatedResponse = AcademicResponseSchema.parse(rawResponse)
    
    // Formatear las referencias a Markdown
    const referencesMarkdown = formatReferencesToMarkdown(validatedResponse.references)
    
    // Combinar contenido principal con referencias formateadas
    const formattedResponse = `${validatedResponse.content}\n\n${referencesMarkdown}`
    
    return {
      isValid: true,
      formattedResponse,
      references: validatedResponse.references
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      )
      
      return {
        isValid: false,
        errors
      }
    }
    
    return {
      isValid: false,
      errors: [`Error de validación: ${error}`]
    }
  }
}

/**
 * Extrae metadatos de citación del SDK GenAI y los convierte al formato esperado
 * @param citationMetadata Metadatos de citación del SDK
 * @returns Array de referencias en formato estándar
 */
export function extractReferencesFromCitationMetadata(citationMetadata: any[]): AcademicReference[] {
  if (!citationMetadata || !Array.isArray(citationMetadata)) {
    return []
  }
  
  return citationMetadata
    .filter(citation => citation.uri && citation.title)
    .map(citation => ({
      title: citation.title.substring(0, 100), // Truncar si es muy largo
      url: citation.uri,
      authors: citation.authors?.join(', '),
      // Intentar extraer año de la fecha si está disponible
      year: citation.publicationDate ? 
        new Date(citation.publicationDate).getFullYear() : undefined
    }))
    .filter(ref => {
      // Validar que cada referencia cumpla el schema básico
      try {
        AcademicReferenceSchema.parse(ref)
        return true
      } catch {
        return false
      }
    })
}
