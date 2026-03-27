/**
 * Chilean Spanish Clinical Term Corrections
 * 
 * Post-processing correction pipeline for common misrecognitions
 * in Chilean Spanish clinical speech-to-text.
 * 
 * @author HopeAI Clinical Team
 * @version 1.0.0
 * @language es-CL (Chilean Spanish)
 */

/**
 * Common Misrecognition Patterns
 * Maps frequently misrecognized terms to their correct clinical equivalents
 */
export const CLINICAL_CORRECTIONS_CL: Record<string, string> = {
  // DSM-5 and Diagnostic Terms
  'ansiedad general Isadora': 'ansiedad generalizada',
  'ansiedad generalizada': 'ansiedad generalizada', // Ensure correct
  'ansiedad general lisada': 'ansiedad generalizada',
  'trastorno de presivo': 'trastorno depresivo',
  'trastorno depresivo': 'trastorno depresivo', // Ensure correct
  'trastorno de presivo mayor': 'trastorno depresivo mayor',
  'trastorno obsesivo con pulsivo': 'trastorno obsesivo compulsivo',
  'trastorno obsesivo compulsivo': 'trastorno obsesivo compulsivo', // Ensure correct
  'TOC': 'TOC',
  'toc': 'TOC',
  'trastorno de estrés post traumático': 'trastorno de estrés postraumático',
  'trastorno de estrés postraumático': 'trastorno de estrés postraumático', // Ensure correct
  'TEPT': 'TEPT',
  'tept': 'TEPT',
  'trastorno bipolar tipo 1': 'trastorno bipolar tipo uno',
  'trastorno bipolar tipo 2': 'trastorno bipolar tipo dos',
  'trastorno límite': 'trastorno límite de la personalidad',
  'trastorno border line': 'trastorno límite de la personalidad',
  'trastorno borderline': 'trastorno límite de la personalidad',
  'esquizofrenia': 'esquizofrenia', // Ensure correct
  'esquizo frenia': 'esquizofrenia',
  'trastorno del espectro autista': 'trastorno del espectro autista', // Ensure correct
  'TEA': 'TEA',
  'tea': 'TEA',
  'TDAH': 'TDAH',
  'tdah': 'TDAH',
  'déficit atencional': 'trastorno por déficit de atención e hiperactividad',
  'déficit de atención': 'trastorno por déficit de atención e hiperactividad',
  
  // Therapeutic Modalities
  'terapia cognitiva con ductual': 'terapia cognitivo conductual',
  'terapia cognitivo conductual': 'terapia cognitivo conductual', // Ensure correct
  'terapia cognitiva conductual': 'terapia cognitivo conductual',
  'terapia cognitivo con ductual': 'terapia cognitivo conductual',
  'TCC': 'TCC',
  'tcc': 'TCC',
  'terapia dialéctico con ductual': 'terapia dialéctico conductual',
  'terapia dialéctico conductual': 'terapia dialéctico conductual', // Ensure correct
  'DBT': 'DBT',
  'dbt': 'DBT',
  'terapia de aceptación y compromiso': 'terapia de aceptación y compromiso', // Ensure correct
  'ACT': 'ACT',
  'act': 'ACT',
  'EMDR': 'EMDR',
  'emdr': 'EMDR',
  'mind fullness': 'mindfulness',
  'mainfulness': 'mindfulness',
  'mindfulness': 'mindfulness', // Ensure correct
  'atención plena': 'atención plena', // Ensure correct
  'reestructuración cognitiva': 'reestructuración cognitiva', // Ensure correct
  're estructuración cognitiva': 'reestructuración cognitiva',
  'exposición gradual': 'exposición gradual', // Ensure correct
  'desensibilización sistemática': 'desensibilización sistemática', // Ensure correct
  'de sensibilización sistemática': 'desensibilización sistemática',
  
  // DSM References
  'DSM cinco': 'DSM-5',
  'DSM 5': 'DSM-5',
  'DSM5': 'DSM-5',
  'DSM-5': 'DSM-5', // Ensure correct
  'DSM V': 'DSM-5',
  'DSM-V': 'DSM-5',
  'de ese eme cinco': 'DSM-5',
  
  // Common Clinical Terms
  'psicoeducación': 'psicoeducación', // Ensure correct
  'psico educación': 'psicoeducación',
  'regulación emocional': 'regulación emocional', // Ensure correct
  'ideación suicida': 'ideación suicida', // Ensure correct
  'idea ción suicida': 'ideación suicida',
  'crisis de pánico': 'crisis de pánico', // Ensure correct
  'ataque de pánico': 'ataque de pánico', // Ensure correct
  'autoestima': 'autoestima', // Ensure correct
  'auto estima': 'autoestima',
  'autolesiones': 'autolesiones', // Ensure correct
  'auto lesiones': 'autolesiones',
  'comorbilidad': 'comorbilidad', // Ensure correct
  'co morbilidad': 'comorbilidad',
  
  // Assessment Terms
  'inventario de depresión de Beck': 'inventario de depresión de Beck', // Ensure correct
  'BDI': 'BDI',
  'bdi': 'BDI',
  'inventario de ansiedad de Beck': 'inventario de ansiedad de Beck', // Ensure correct
  'BAI': 'BAI',
  'bai': 'BAI',
  'escala de Hamilton': 'escala de Hamilton', // Ensure correct
  'MMPI': 'MMPI',
  'mmpi': 'MMPI',
  'WAIS': 'WAIS',
  'wais': 'WAIS',
  
  // Chilean-Specific Expressions
  'estar mal': 'estar mal', // Ensure correct
  'sentirse mal': 'sentirse mal', // Ensure correct
  'estar pasándolo mal': 'estar pasándolo mal', // Ensure correct
  'estar complicado': 'estar complicado', // Ensure correct
  'estar angustiado': 'estar angustiado', // Ensure correct
  'estar estresado': 'estar estresado', // Ensure correct
  'estar colapsado': 'estar colapsado', // Ensure correct
  'estar con pena': 'estar con pena', // Ensure correct
  'estar bajoneado': 'estar bajoneado', // Ensure correct
  'estar decaído': 'estar decaído' // Ensure correct
}

/**
 * Pattern-Based Corrections
 * Regex patterns for more complex corrections
 */
export const PATTERN_CORRECTIONS_CL: Array<{
  pattern: RegExp
  replacement: string | ((match: string) => string)
  description: string
}> = [
  {
    pattern: /trastorno\s+de\s+presivo/gi,
    replacement: 'trastorno depresivo',
    description: 'Correct "de presivo" to "depresivo"'
  },
  {
    pattern: /ansiedad\s+general\s+\w+/gi,
    replacement: 'ansiedad generalizada',
    description: 'Correct variations of "ansiedad generalizada"'
  },
  {
    pattern: /trastorno\s+obsesivo\s+con\s*pulsivo/gi,
    replacement: 'trastorno obsesivo compulsivo',
    description: 'Correct "con pulsivo" to "compulsivo"'
  },
  {
    pattern: /terapia\s+cognitiv[ao]\s+con\s*ductual/gi,
    replacement: 'terapia cognitivo conductual',
    description: 'Correct "con ductual" to "conductual"'
  },
  {
    pattern: /mind\s*full?\s*ness/gi,
    replacement: 'mindfulness',
    description: 'Correct mindfulness variations'
  },
  {
    pattern: /DSM\s*[-\s]?\s*[5V]/gi,
    replacement: 'DSM-5',
    description: 'Normalize DSM-5 references'
  },
  {
    pattern: /\b(toc|tept|tea|tdah|tcc|dbt|act|emdr|bdi|bai|mmpi|wais)\b/gi,
    replacement: (match) => match.toUpperCase(),
    description: 'Capitalize common acronyms'
  },
  {
    pattern: /auto\s+estima/gi,
    replacement: 'autoestima',
    description: 'Join "auto estima"'
  },
  {
    pattern: /auto\s+lesiones/gi,
    replacement: 'autolesiones',
    description: 'Join "auto lesiones"'
  },
  {
    pattern: /psico\s+educación/gi,
    replacement: 'psicoeducación',
    description: 'Join "psico educación"'
  }
]

/**
 * Context-Aware Corrections
 * Corrections that depend on surrounding context
 */
export const CONTEXT_AWARE_CORRECTIONS_CL: Array<{
  trigger: string
  context: string[]
  correction: string
}> = [
  {
    trigger: 'trastorno',
    context: ['ansiedad', 'pánico', 'fobia'],
    correction: 'trastorno de ansiedad'
  },
  {
    trigger: 'terapia',
    context: ['cognitiva', 'conductual', 'cognitivo'],
    correction: 'terapia cognitivo conductual'
  },
  {
    trigger: 'crisis',
    context: ['pánico', 'ansiedad', 'angustia'],
    correction: 'crisis de pánico'
  }
]

/**
 * Chilean Pronunciation Corrections
 * Handle common Chilean pronunciation patterns
 */
export const CHILEAN_PRONUNCIATION_CORRECTIONS: Record<string, string> = {
  // Aspiración de 's' final
  'ehtré': 'estrés',
  'estré': 'estrés',
  'crihi': 'crisis',
  'crisi': 'crisis',
  
  // Elisión de 'd' intervocálica
  'cansao': 'cansado',
  'deprimío': 'deprimido',
  'angustiao': 'angustiado',
  'estresao': 'estresado',
  'preocupao': 'preocupado',
  
  // Chilenismos que pueden aparecer en contexto clínico
  'cachai': 'entiendes',
  'al tiro': 'inmediatamente',
  'altiro': 'inmediatamente',
  'altoke': 'inmediatamente'
}

/**
 * Apply all corrections to a transcript
 */
export function applyChileanClinicalCorrections(transcript: string): {
  corrected: string
  corrections: Array<{ original: string; corrected: string; position: number }>
} {
  let corrected = transcript
  const corrections: Array<{ original: string; corrected: string; position: number }> = []
  
  // Step 1: Apply direct word/phrase corrections
  Object.entries(CLINICAL_CORRECTIONS_CL).forEach(([wrong, right]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi')
    const matches = [...corrected.matchAll(regex)]
    
    matches.forEach(match => {
      if (match.index !== undefined && wrong.toLowerCase() !== right.toLowerCase()) {
        corrections.push({
          original: wrong,
          corrected: right,
          position: match.index
        })
      }
    })
    
    corrected = corrected.replace(regex, right)
  })
  
  // Step 2: Apply pattern-based corrections
  PATTERN_CORRECTIONS_CL.forEach(({ pattern, replacement }) => {
    corrected = corrected.replace(pattern, replacement as string)
  })
  
  // Step 3: Apply Chilean pronunciation corrections
  Object.entries(CHILEAN_PRONUNCIATION_CORRECTIONS).forEach(([wrong, right]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi')
    corrected = corrected.replace(regex, right)
  })
  
  return { corrected, corrections }
}

/**
 * Get correction statistics
 */
export function getCorrectionStats() {
  return {
    directCorrections: Object.keys(CLINICAL_CORRECTIONS_CL).length,
    patternCorrections: PATTERN_CORRECTIONS_CL.length,
    pronunciationCorrections: Object.keys(CHILEAN_PRONUNCIATION_CORRECTIONS).length,
    contextAwareRules: CONTEXT_AWARE_CORRECTIONS_CL.length,
    total: Object.keys(CLINICAL_CORRECTIONS_CL).length + 
           PATTERN_CORRECTIONS_CL.length + 
           Object.keys(CHILEAN_PRONUNCIATION_CORRECTIONS).length
  }
}

