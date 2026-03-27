/**
 * Chilean Spanish Clinical Vocabulary for Speech Recognition
 * 
 * Comprehensive dictionary of clinical psychology terms used in Chilean practice,
 * optimized for Web Speech API grammar hints and post-processing corrections.
 * 
 * @author HopeAI Clinical Team
 * @version 1.0.0
 * @language es-CL (Chilean Spanish)
 */

/**
 * DSM-5 Diagnostic Terms (Chilean Spanish)
 * Terms commonly used in Chilean clinical practice
 */
export const DSM5_TERMS_CL = [
  // Trastornos de Ansiedad
  'trastorno de ansiedad generalizada',
  'trastorno de pánico',
  'agorafobia',
  'fobia social',
  'fobia específica',
  'trastorno de ansiedad por separación',
  'mutismo selectivo',
  'trastorno de ansiedad inducido por sustancias',
  
  // Trastornos Depresivos
  'trastorno depresivo mayor',
  'trastorno depresivo persistente',
  'distimia',
  'trastorno disfórico premenstrual',
  'trastorno depresivo inducido por sustancias',
  'episodio depresivo',
  'depresión mayor',
  'depresión reactiva',
  
  // Trastornos Bipolares
  'trastorno bipolar tipo uno',
  'trastorno bipolar tipo dos',
  'trastorno ciclotímico',
  'episodio maníaco',
  'episodio hipomaníaco',
  'episodio mixto',
  
  // Trastornos Relacionados con Trauma
  'trastorno de estrés postraumático',
  'TEPT',
  'trastorno de estrés agudo',
  'trastorno de adaptación',
  'trastorno reactivo de la vinculación',
  
  // Trastornos Obsesivo-Compulsivos
  'trastorno obsesivo compulsivo',
  'TOC',
  'trastorno dismórfico corporal',
  'trastorno de acumulación',
  'tricotilomanía',
  'trastorno de excoriación',
  
  // Trastornos de la Conducta Alimentaria
  'anorexia nerviosa',
  'bulimia nerviosa',
  'trastorno por atracón',
  'trastorno de evitación restrictiva de la ingesta de alimentos',
  'pica',
  'trastorno de rumiación',
  
  // Trastornos del Sueño
  'insomnio',
  'hipersomnia',
  'narcolepsia',
  'apnea del sueño',
  'trastorno del ritmo circadiano',
  'parasomnia',
  'terrores nocturnos',
  'sonambulismo',
  
  // Trastornos de Personalidad
  'trastorno límite de la personalidad',
  'trastorno narcisista de la personalidad',
  'trastorno antisocial de la personalidad',
  'trastorno evitativo de la personalidad',
  'trastorno dependiente de la personalidad',
  'trastorno obsesivo compulsivo de la personalidad',
  'trastorno paranoide de la personalidad',
  'trastorno esquizoide de la personalidad',
  'trastorno esquizotípico de la personalidad',
  
  // Trastornos Psicóticos
  'esquizofrenia',
  'trastorno esquizoafectivo',
  'trastorno delirante',
  'trastorno psicótico breve',
  'trastorno esquizofreniforme',
  
  // Trastornos por Uso de Sustancias
  'trastorno por consumo de alcohol',
  'trastorno por consumo de cannabis',
  'trastorno por consumo de cocaína',
  'trastorno por consumo de opioides',
  'síndrome de abstinencia',
  'intoxicación',
  
  // Trastornos del Neurodesarrollo
  'trastorno del espectro autista',
  'TEA',
  'trastorno por déficit de atención e hiperactividad',
  'TDAH',
  'trastorno específico del aprendizaje',
  'dislexia',
  'discalculia',
  'trastorno del desarrollo de la coordinación',
  
  // Otros Trastornos Comunes
  'trastorno de síntomas somáticos',
  'trastorno de ansiedad por enfermedad',
  'trastorno de conversión',
  'trastorno facticio',
  'trastorno disociativo de identidad',
  'amnesia disociativa',
  'despersonalización',
  'desrealización'
]

/**
 * Therapeutic Modalities and Techniques (Chilean Spanish)
 */
export const THERAPEUTIC_MODALITIES_CL = [
  // Enfoques Terapéuticos
  'terapia cognitivo conductual',
  'TCC',
  'terapia cognitiva',
  'terapia conductual',
  'terapia psicodinámica',
  'psicoanálisis',
  'terapia humanista',
  'terapia gestalt',
  'terapia sistémica',
  'terapia familiar',
  'terapia de pareja',
  'terapia grupal',
  'terapia individual',
  
  // Terapias de Tercera Generación
  'terapia de aceptación y compromiso',
  'ACT',
  'terapia dialéctico conductual',
  'DBT',
  'terapia basada en mindfulness',
  'terapia de esquemas',
  'terapia centrada en la compasión',
  'terapia metacognitiva',
  
  // Técnicas Específicas
  'reestructuración cognitiva',
  'exposición gradual',
  'desensibilización sistemática',
  'prevención de respuesta',
  'activación conductual',
  'resolución de problemas',
  'entrenamiento en habilidades sociales',
  'relajación muscular progresiva',
  'respiración diafragmática',
  'técnicas de grounding',
  'técnicas de anclaje',
  'visualización guiada',
  'registro de pensamientos',
  'experimentos conductuales',
  'role playing',
  'psicoeducación',
  
  // EMDR y Trauma
  'EMDR',
  'desensibilización y reprocesamiento por movimientos oculares',
  'procesamiento de trauma',
  'narrativa traumática',
  
  // Mindfulness y Meditación
  'mindfulness',
  'atención plena',
  'meditación',
  'escaneo corporal',
  'observación de pensamientos',
  'aceptación radical',
  
  // Intervenciones Específicas
  'intervención en crisis',
  'contención emocional',
  'validación emocional',
  'regulación emocional',
  'tolerancia al malestar',
  'efectividad interpersonal'
]

/**
 * Clinical Assessment Terms (Chilean Spanish)
 */
export const CLINICAL_ASSESSMENT_CL = [
  // Evaluación y Diagnóstico
  'evaluación clínica',
  'entrevista clínica',
  'anamnesis',
  'historia clínica',
  'evaluación psicológica',
  'psicodiagnóstico',
  'diagnóstico diferencial',
  'comorbilidad',
  
  // Instrumentos de Evaluación
  'test psicológico',
  'inventario de depresión de Beck',
  'BDI',
  'inventario de ansiedad de Beck',
  'BAI',
  'escala de Hamilton',
  'test de Rorschach',
  'test de apercepción temática',
  'TAT',
  'WAIS',
  'escala de inteligencia de Wechsler',
  'MMPI',
  'inventario multifásico de personalidad de Minnesota',
  
  // Conceptos de Evaluación
  'criterios diagnósticos',
  'síntomas',
  'signos clínicos',
  'curso del trastorno',
  'pronóstico',
  'factores de riesgo',
  'factores protectores',
  'funcionamiento global',
  'nivel de funcionamiento',
  'deterioro funcional'
]

/**
 * Common Clinical Terms (Chilean Spanish)
 */
export const COMMON_CLINICAL_TERMS_CL = [
  // Síntomas y Manifestaciones
  'ansiedad',
  'depresión',
  'angustia',
  'tristeza',
  'irritabilidad',
  'insomnio',
  'fatiga',
  'apatía',
  'anhedonia',
  'rumiación',
  'preocupación excesiva',
  'pensamientos intrusivos',
  'flashbacks',
  'pesadillas',
  'evitación',
  'hipervigilancia',
  'despersonalización',
  'desrealización',
  'disociación',
  'ideación suicida',
  'autolesiones',
  'conductas autolesivas',
  
  // Procesos Terapéuticos
  'alianza terapéutica',
  'vínculo terapéutico',
  'rapport',
  'encuadre terapéutico',
  'setting terapéutico',
  'sesión terapéutica',
  'plan de tratamiento',
  'objetivos terapéuticos',
  'metas terapéuticas',
  'adherencia al tratamiento',
  'resistencia',
  'transferencia',
  'contratransferencia',
  'insight',
  'conciencia de enfermedad',
  'motivación al cambio',
  
  // Conceptos Psicológicos
  'autoestima',
  'autoconcepto',
  'autoimagen',
  'identidad',
  'resiliencia',
  'afrontamiento',
  'estrategias de afrontamiento',
  'mecanismos de defensa',
  'negación',
  'proyección',
  'racionalización',
  'sublimación',
  'represión',

  // Chilean-Specific Clinical Expressions
  'estar mal',
  'sentirse mal',
  'estar pasándolo mal',
  'estar complicado',
  'estar angustiado',
  'estar estresado',
  'estar colapsado',
  'crisis de pánico',
  'ataque de pánico',
  'crisis de angustia',
  'pena',
  'estar con pena',
  'estar bajoneado',
  'estar decaído'
]

/**
 * Chilean Spanish Pronunciation Patterns
 * Common variations in Chilean speech that may affect recognition
 */
export const CHILEAN_PRONUNCIATION_VARIANTS = {
  // Aspiración de 's' final
  'estrés': ['ehtré', 'estré'],
  'crisis': ['crihi', 'crisi'],

  // Elisión de 'd' intervocálica
  'cansado': ['cansao'],
  'deprimido': ['deprimío'],
  'angustiado': ['angustiao'],

  // Chilenismos en contexto clínico
  'cachai': 'entiendes',
  'al tiro': 'inmediatamente',
  'altiro': 'inmediatamente',
  'po': 'pues',
  'altoke': 'inmediatamente'
}

/**
 * Complete Clinical Vocabulary Array
 * Combines all term categories for grammar hints
 */
export const COMPLETE_CLINICAL_VOCABULARY_CL = [
  ...DSM5_TERMS_CL,
  ...THERAPEUTIC_MODALITIES_CL,
  ...CLINICAL_ASSESSMENT_CL,
  ...COMMON_CLINICAL_TERMS_CL
]

/**
 * High-Priority Clinical Terms
 * Most frequently used terms in Chilean clinical practice
 */
export const HIGH_PRIORITY_TERMS_CL = [
  'ansiedad',
  'depresión',
  'trastorno de ansiedad generalizada',
  'trastorno depresivo mayor',
  'terapia cognitivo conductual',
  'TCC',
  'trastorno de pánico',
  'TEPT',
  'trastorno obsesivo compulsivo',
  'TOC',
  'trastorno bipolar',
  'esquizofrenia',
  'TDAH',
  'trastorno del espectro autista',
  'TEA',
  'trastorno límite de la personalidad',
  'mindfulness',
  'atención plena',
  'terapia dialéctico conductual',
  'DBT',
  'terapia de aceptación y compromiso',
  'ACT',
  'EMDR',
  'psicoeducación',
  'reestructuración cognitiva',
  'exposición gradual',
  'regulación emocional',
  'ideación suicida',
  'crisis de pánico',
  'ataque de pánico',
  'DSM cinco',
  'DSM 5'
]

/**
 * Get vocabulary count for validation
 */
export const getVocabularyStats = () => {
  return {
    dsm5Terms: DSM5_TERMS_CL.length,
    therapeuticModalities: THERAPEUTIC_MODALITIES_CL.length,
    assessmentTerms: CLINICAL_ASSESSMENT_CL.length,
    commonTerms: COMMON_CLINICAL_TERMS_CL.length,
    total: COMPLETE_CLINICAL_VOCABULARY_CL.length,
    highPriority: HIGH_PRIORITY_TERMS_CL.length
  }
}


