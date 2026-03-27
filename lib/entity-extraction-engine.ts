/**
 * Entity Extraction Engine - Fase 2B
 * 
 * Motor avanzado de extracción de entidades semánticas para HopeAI
 * Implementa extracción automática de:
 * - Técnicas terapéuticas
 * - Poblaciones objetivo
 * - Trastornos y condiciones
 * - Validación semántica
 */

import { ai } from "./google-genai-config"
import { FunctionCallingConfigMode, Type } from '@google/genai'
import type { FunctionDeclaration } from '@google/genai'

// Tipos para entidades extraídas
export interface ExtractedEntity {
  type: EntityType
  value: string
  confidence: number
  context?: string
  synonyms?: string[]
}

export type EntityType = 
  | 'therapeutic_technique'
  | 'target_population'
  | 'disorder_condition'
  | 'clinical_concept'
  | 'intervention_method'
  | 'assessment_tool'
  | 'documentation_process'
  | 'academic_validation'
  | 'socratic_exploration'

export interface EntityExtractionResult {
  entities: ExtractedEntity[]
  primaryEntities: ExtractedEntity[]
  secondaryEntities: ExtractedEntity[]
  confidence: number
  processingTime: number
}

export interface EntityValidationResult {
  isValid: boolean
  validatedEntities: ExtractedEntity[]
  invalidEntities: ExtractedEntity[]
  suggestions: string[]
}

// Configuración del motor de extracción
export interface EntityExtractionConfig {
  enableValidation: boolean
  confidenceThreshold: number
  maxEntitiesPerType: number
  enableSynonymExpansion: boolean
  enableContextualAnalysis: boolean
}

// Function Declarations para extracción de entidades
const entityExtractionFunctions: FunctionDeclaration[] = [
  {
    name: 'extract_therapeutic_techniques',
    description: 'Extraer técnicas terapéuticas mencionadas en el texto',
    parameters: {
      type: Type.OBJECT,
      properties: {
        techniques: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nombre de la técnica terapéutica' },
              category: { 
                type: Type.STRING, 
                enum: ['cognitivo-conductual', 'psicodinámico', 'humanístico', 'sistémico', 'integrativo'],
                description: 'Categoría de la técnica'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' },
              context: { type: Type.STRING, description: 'Contexto en el que se menciona' }
            },
            required: ['name', 'category', 'confidence']
          }
        }
      },
      required: ['techniques']
    }
  },
  {
    name: 'extract_target_populations',
    description: 'Extraer poblaciones objetivo mencionadas en el texto',
    parameters: {
      type: Type.OBJECT,
      properties: {
        populations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              group: { type: Type.STRING, description: 'Grupo poblacional' },
              age_range: { type: Type.STRING, description: 'Rango de edad si aplica' },
              characteristics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Características específicas'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['group', 'confidence']
          }
        }
      },
      required: ['populations']
    }
  },
  {
    name: 'extract_disorders_conditions',
    description: 'Extraer trastornos y condiciones clínicas mencionadas',
    parameters: {
      type: Type.OBJECT,
      properties: {
        conditions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Nombre del trastorno o condición' },
              category: {
                type: Type.STRING,
                enum: ['ansiedad', 'depresión', 'trauma', 'personalidad', 'neurocognitivo', 'otro'],
                description: 'Categoría diagnóstica'
              },
              severity: {
                type: Type.STRING,
                enum: ['leve', 'moderado', 'severo', 'no_especificado'],
                description: 'Nivel de severidad si se menciona'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['name', 'category', 'confidence']
          }
        }
      },
      required: ['conditions']
    }
  },
  {
    name: 'extract_documentation_processes',
    description: 'Extraer procesos, formatos y tipos de documentación clínica mencionados',
    parameters: {
      type: Type.OBJECT,
      properties: {
        processes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              process: { type: Type.STRING, description: 'Proceso de documentación (ej: redacción de notas, estructuración SOAP)' },
              format_type: {
                type: Type.STRING,
                enum: ['SOAP', 'narrativo', 'estructurado', 'evaluacion', 'plan_tratamiento', 'progreso', 'otro'],
                description: 'Tipo de formato de documentación'
              },
              learning_context: {
                type: Type.STRING,
                enum: ['ejemplos', 'formatos', 'redaccion', 'estructuracion', 'aprendizaje', 'consulta'],
                description: 'Contexto de aprendizaje o consulta'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['process', 'format_type', 'confidence']
          }
        }
      },
      required: ['processes']
    }
  },
  {
    name: 'extract_academic_validation',
    description: 'Extraer consultas sobre validación académica, evidencia científica, estudios que avalan, investigación que respalda',
    parameters: {
      type: Type.OBJECT,
      properties: {
        validations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              query_type: {
                type: Type.STRING,
                enum: ['estudios_avalan', 'evidencia_respalda', 'investigacion_valida', 'respaldo_cientifico', 'validacion_empirica', 'metaanalisis', 'ensayos_clinicos'],
                description: 'Tipo de consulta de validación académica'
              },
              subject_matter: { type: Type.STRING, description: 'Tema o afirmación que requiere validación (ej: técnica terapéutica, intervención)' },
              evidence_level: {
                type: Type.STRING,
                enum: ['alta', 'media', 'baja', 'cualquier'],
                description: 'Nivel de evidencia requerido'
              },
              research_context: {
                type: Type.STRING,
                enum: ['busqueda_estudios', 'validacion_afirmacion', 'respaldo_practica', 'revision_literatura'],
                description: 'Contexto de la consulta de investigación'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['query_type', 'subject_matter', 'confidence']
          }
        }
      },
      required: ['validations']
    }
  },
  {
    name: 'extract_socratic_exploration',
    description: 'Extraer consultas sobre exploración reflexiva, cuestionamiento socrático, desarrollo de insight, análisis introspectivo',
    parameters: {
      type: Type.OBJECT,
      properties: {
        explorations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              exploration_type: {
                type: Type.STRING,
                enum: ['reflexion_profunda', 'cuestionamiento_socratico', 'desarrollo_insight', 'analisis_introspectivo', 'exploracion_creencias', 'autoconocimiento', 'facilitacion_awareness'],
                description: 'Tipo de exploración socrática solicitada'
              },
              subject_matter: { type: Type.STRING, description: 'Tema o situación que requiere exploración reflexiva (ej: caso clínico, enfoque terapéutico)' },
              depth_level: {
                type: Type.STRING,
                enum: ['superficial', 'moderado', 'profundo'],
                description: 'Nivel de profundidad requerido para la exploración'
              },
              exploration_context: {
                type: Type.STRING,
                enum: ['caso_clinico', 'enfoque_terapeutico', 'desarrollo_profesional', 'analisis_personal', 'facilitacion_paciente'],
                description: 'Contexto de la exploración reflexiva'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['exploration_type', 'subject_matter', 'confidence']
          }
        }
      },
      required: ['explorations']
    }
  },
  {
    name: 'extract_clinical_concepts',
    description: 'Extraer conceptos clínicos generales y herramientas de evaluación',
    parameters: {
      type: Type.OBJECT,
      properties: {
        concepts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              concept: { type: Type.STRING, description: 'Concepto clínico' },
              type: {
                type: Type.STRING,
                enum: ['assessment_tool', 'intervention', 'theoretical_framework', 'clinical_process'],
                description: 'Tipo de concepto'
              },
              relevance: {
                type: Type.STRING,
                enum: ['alta', 'media', 'baja'],
                description: 'Relevancia para el contexto'
              },
              confidence: { type: Type.NUMBER, description: 'Nivel de confianza (0-1)' }
            },
            required: ['concept', 'type', 'confidence']
          }
        }
      },
      required: ['concepts']
    }
  }
]

export class EntityExtractionEngine {
  private config: EntityExtractionConfig
  private knownEntities: Map<EntityType, Set<string>> = new Map()
  private synonymMaps: Map<string, string[]> = new Map()

  constructor(config: Partial<EntityExtractionConfig> = {}) {
    this.config = {
      enableValidation: true,
      confidenceThreshold: 0.7,
      maxEntitiesPerType: 10,
      enableSynonymExpansion: true,
      enableContextualAnalysis: true,
      ...config
    }
    
    this.initializeKnownEntities()
    this.initializeSynonymMaps()
  }

  private initializeKnownEntities() {
    // Técnicas terapéuticas conocidas - Alineadas con Supervisor Clínico
    this.knownEntities.set('therapeutic_technique', new Set([
      'EMDR', 'TCC', 'Terapia Cognitivo-Conductual', 'DBT', 'ACT',
      'Mindfulness', 'Exposición', 'Reestructuración Cognitiva',
      'Terapia Gestalt', 'Psicoanálisis', 'Terapia Sistémica',
      'Terapia Narrativa', 'Hipnoterapia', 'Biofeedback',
      'Terapia de Esquemas', 'TFCB', 'Terapia Interpersonal',
      'Terapia Familiar', 'Terapia de Pareja', 'Arteterapia',
      'Musicoterapia', 'Terapia Ocupacional', 'Psicoterapia Integrativa'
    ]))

    // Poblaciones objetivo conocidas - Expandidas para mayor precisión
    this.knownEntities.set('target_population', new Set([
      'veteranos', 'adolescentes', 'niños', 'adultos mayores',
      'mujeres víctimas de violencia', 'personas con discapacidad',
      'refugiados', 'personal de salud', 'estudiantes universitarios',
      'sobrevivientes de trauma', 'cuidadores', 'familias disfuncionales',
      'pacientes oncológicos', 'personas con dolor crónico', 'migrantes',
      'víctimas de abuso', 'personas LGBTI+', 'trabajadores esenciales'
    ]))

    // Trastornos y condiciones conocidas - Ampliadas según DSM-5
    this.knownEntities.set('disorder_condition', new Set([
      'TEPT', 'Depresión Mayor', 'Trastorno de Ansiedad Generalizada',
      'Trastorno Bipolar', 'Esquizofrenia', 'Trastorno Límite de Personalidad',
      'Trastorno Obsesivo-Compulsivo', 'Fobia Social', 'Agorafobia',
      'Trastorno de Pánico', 'Trastorno de Estrés Agudo', 'Distimia',
      'Trastorno Narcisista', 'Trastorno Antisocial', 'Trastorno Histriónico',
      'Trastorno de la Alimentación', 'Anorexia', 'Bulimia', 'Trastorno por Atracón',
      'Trastorno del Espectro Autista', 'TDAH', 'Trastorno de Conducta'
    ]))

    // Procesos de documentación conocidos - Alineados con Especialista en Documentación
    this.knownEntities.set('documentation_process', new Set([
      'redacción de notas', 'notas clínicas', 'documentación SOAP',
      'resúmenes de sesión', 'planes de tratamiento', 'evaluación de progreso',
      'notas de progreso', 'documentación clínica', 'formatos de documentación',
      'estructuración de información', 'ejemplos clínicos', 'redacción profesional',
      'síntesis documental', 'archivado clínico', 'nota de evolución',
      'documentación de crisis', 'registro de intervenciones', 'historial clínico',
      'formato narrativo', 'estructura PIRP', 'documentación DAP',
      'expediente clínico', 'registro terapéutico', 'bitácora de sesión'
    ]))

    // Consultas de validación académica conocidas - Alineadas con HopeAI Académico
    this.knownEntities.set('academic_validation', new Set([
      'estudios avalan', 'qué estudios', 'investigación respalda', 'evidencia científica',
      'respaldo empírico', 'validación científica', 'metaanálisis', 'ensayos clínicos',
      'revisión sistemática', 'literatura científica', 'papers académicos', 'investigación valida',
      'evidencia empírica', 'estudios que respaldan', 'investigaciones que avalan', 'base científica',
      'validación empírica', 'respaldo científico', 'fundamento empírico', 'soporte académico',
      'investigación actual', 'estudios recientes', 'literatura actualizada', 'evidencia robusta',
      'consenso científico', 'práctica basada en evidencia', 'guidelines clínicas', 'protocolos validados'
    ]))

    // Consultas de exploración socrática conocidas - Alineadas con Supervisor Clínico
    this.knownEntities.set('socratic_exploration', new Set([
      'reflexionar', 'explorar', 'analizar', 'cuestionar', 'insight', 'autoconocimiento',
      'desarrollo de conciencia', 'exploración profunda', 'cuestionamiento socrático', 'facilitación de insight',
      'análisis introspectivo', 'exploración de creencias', 'reflexión crítica', 'desarrollo de awareness',
      'facilitación de autodescubrimiento', 'exploración existencial', 'análisis fenomenológico',
      'ayúdame a reflexionar', 'necesito explorar', 'quiero analizar', 'desarrollar insight',
      'explorar más profundo', 'reflexionar sobre', 'cuestionar esto', 'desarrollar conciencia',
      'pensamiento crítico', 'autorreflexión', 'introspección guiada', 'diálogo socrático',
      'facilitación reflexiva', 'exploración cognitiva', 'análisis de supuestos', 'deconstrucción de creencias',
      'desarrollo de perspectiva', 'ampliación de conciencia', 'exploración de significado', 'búsqueda de comprensión'
    ]))
  }

  private initializeSynonymMaps() {
    // Técnicas terapéuticas - Optimizadas para detección semántica
    this.synonymMaps.set('EMDR', ['Desensibilización y Reprocesamiento por Movimientos Oculares', 'movimientos oculares', 'desensibilización', 'reprocesamiento'])
    this.synonymMaps.set('TCC', ['Terapia Cognitivo-Conductual', 'CBT', 'terapia cognitiva', 'terapia conductual', 'cognitivo conductual', 'cognitiva conductual'])
    this.synonymMaps.set('DBT', ['Terapia Dialéctica Conductual', 'dialectica', 'dialéctica conductual'])
    this.synonymMaps.set('ACT', ['Terapia de Aceptación y Compromiso', 'aceptación y compromiso', 'terapia de aceptación'])
    this.synonymMaps.set('Mindfulness', ['atención plena', 'mindful', 'conciencia plena', 'meditación consciente'])
    this.synonymMaps.set('Terapia Gestalt', ['gestalt', 'terapia gestáltica'])
    this.synonymMaps.set('Psicoanálisis', ['psicoanalítica', 'psicodinámico', 'analítico'])
    this.synonymMaps.set('Terapia Sistémica', ['sistémica', 'familiar sistémica', 'enfoque sistémico'])
    this.synonymMaps.set('Terapia Narrativa', ['narrativa', 'enfoque narrativo'])
    this.synonymMaps.set('Hipnoterapia', ['hipnosis', 'hipnótica', 'trance'])
    this.synonymMaps.set('Terapia de Esquemas', ['esquemas', 'terapia esquemática'])
    this.synonymMaps.set('Terapia Interpersonal', ['interpersonal', 'relacional'])
    this.synonymMaps.set('Arteterapia', ['arte terapia', 'terapia artística'])
    this.synonymMaps.set('Musicoterapia', ['música terapia', 'terapia musical'])
    
    // Trastornos y condiciones - Alineados con terminología DSM-5
    this.synonymMaps.set('TEPT', ['Trastorno de Estrés Postraumático', 'PTSD', 'estrés postraumático', 'trauma', 'estrés post traumático'])
    this.synonymMaps.set('Depresión Mayor', ['depresión', 'episodio depresivo', 'trastorno depresivo mayor'])
    this.synonymMaps.set('Trastorno de Ansiedad Generalizada', ['ansiedad', 'TAG', 'ansiedad generalizada'])
    this.synonymMaps.set('Trastorno Bipolar', ['trastorno afectivo bipolar', 'bipolaridad', 'maníaco depresivo'])
    this.synonymMaps.set('Trastorno Obsesivo-Compulsivo', ['TOC', 'obsesivo compulsivo', 'obsesiones', 'compulsiones'])
    this.synonymMaps.set('Trastorno de Pánico', ['pánico', 'ataques de pánico', 'crisis de pánico'])
    this.synonymMaps.set('Fobia Social', ['fobia social', 'ansiedad social'])
    this.synonymMaps.set('Trastorno Límite de Personalidad', ['borderline', 'TLP', 'límite de personalidad'])
    this.synonymMaps.set('Esquizofrenia', ['psicosis', 'trastorno psicótico'])
    this.synonymMaps.set('Trastorno del Espectro Autista', ['autismo', 'TEA', 'asperger'])
    this.synonymMaps.set('TDAH', ['hiperactividad', 'déficit atencional', 'déficit de atención'])
    this.synonymMaps.set('Anorexia', ['anorexia nerviosa'])
    this.synonymMaps.set('Bulimia', ['bulimia nerviosa'])
    this.synonymMaps.set('Trastorno por Atracón', ['atracones', 'trastorno alimentario por atracón'])
    
    // Poblaciones objetivo - Expandidas para mayor cobertura
    this.synonymMaps.set('veteranos', ['ex combatientes', 'militares', 'soldados', 'fuerzas armadas'])
    this.synonymMaps.set('adolescentes', ['jóvenes', 'teens', 'juventud'])
    this.synonymMaps.set('niños', ['menores', 'infantes', 'pediátricos', 'infantil'])
    this.synonymMaps.set('adultos mayores', ['tercera edad', 'ancianos', 'geriátricos', 'senescentes'])
    this.synonymMaps.set('mujeres víctimas de violencia', ['violencia doméstica', 'violencia de género', 'maltrato de género'])
    this.synonymMaps.set('víctimas de abuso', ['maltrato', 'abuso sexual', 'abuso físico'])
    this.synonymMaps.set('sobrevivientes de trauma', ['supervivientes', 'víctimas de trauma'])
    this.synonymMaps.set('pacientes oncológicos', ['cáncer', 'oncología', 'pacientes con cáncer'])
    this.synonymMaps.set('personas con dolor crónico', ['dolor persistente', 'fibromialgia', 'dolor neuropático'])
    this.synonymMaps.set('personas LGBTI+', ['LGBTI', 'diversidad sexual', 'comunidad LGBT'])
    this.synonymMaps.set('migrantes', ['inmigrantes', 'emigrantes'])
    this.synonymMaps.set('refugiados', ['desplazados', 'solicitantes de asilo'])
    
    // Documentación clínica - Alineados con Especialista en Documentación
    this.synonymMaps.set('notas clínicas', ['notas', 'documentar', 'redactar', 'anotar'])
    this.synonymMaps.set('documentación SOAP', ['soap', 'formato SOAP', 'estructura SOAP', 'nota SOAP'])
    this.synonymMaps.set('resúmenes de sesión', ['resumen', 'resúmenes', 'síntesis de sesión', 'síntesis'])
    this.synonymMaps.set('planes de tratamiento', ['plan', 'planificación', 'plan terapéutico', 'planificar'])
    this.synonymMaps.set('notas de progreso', ['progreso', 'evolución', 'seguimiento', 'avance'])
    this.synonymMaps.set('formatos de documentación', ['formato', 'formatos', 'plantillas', 'estructura'])
    this.synonymMaps.set('estructuración de información', ['estructurar', 'organizar', 'sistematizar'])
    this.synonymMaps.set('ejemplos clínicos', ['ejemplos', 'casos', 'modelos', 'muestras'])
    this.synonymMaps.set('redacción profesional', ['redacción', 'escritura', 'comunicación escrita'])
    this.synonymMaps.set('expediente clínico', ['expediente', 'historial', 'archivo clínico'])
    this.synonymMaps.set('bitácora de sesión', ['bitácora', 'registro de sesión'])
    this.synonymMaps.set('estructura PIRP', ['PIRP', 'formato PIRP'])
    this.synonymMaps.set('documentación DAP', ['DAP', 'formato DAP'])
    this.synonymMaps.set('nota de evolución', ['evolución', 'nota evolutiva'])
    this.synonymMaps.set('documentación de crisis', ['crisis', 'emergencia', 'situación crítica'])
    
    // Validación académica - Alineados con HopeAI Académico
    this.synonymMaps.set('estudios avalan', ['avalan', 'respaldan', 'validan', 'confirman', 'hay estudios', 'estudios que avalan'])
    this.synonymMaps.set('evidencia científica', ['evidencia', 'pruebas', 'datos científicos', 'respaldo científico'])
    this.synonymMaps.set('investigación respalda', ['investigación', 'estudios', 'research', 'investigaciones', 'existe investigación'])
    this.synonymMaps.set('metaanálisis', ['meta-análisis', 'revisión cuantitativa', 'análisis conjunto', 'metanálisis', 'meta análisis'])
    this.synonymMaps.set('ensayos clínicos', ['ensayos', 'trials', 'estudios controlados', 'RCT'])
    this.synonymMaps.set('revisión sistemática', ['revisión', 'systematic review', 'literatura', 'revisión de literatura'])
    this.synonymMaps.set('validación científica', ['validación', 'verificación', 'confirmación científica'])
    this.synonymMaps.set('práctica basada en evidencia', ['práctica basada evidencia', 'EBP', 'evidencia basada'])
    this.synonymMaps.set('guidelines clínicas', ['guidelines', 'guías clínicas', 'guías de práctica'])
    this.synonymMaps.set('protocolos validados', ['protocolos', 'procedimientos validados'])
    this.synonymMaps.set('consenso científico', ['consenso', 'acuerdo científico'])
    this.synonymMaps.set('literatura científica', ['papers', 'artículos', 'publicaciones', 'papers académicos'])
    this.synonymMaps.set('evidencia empírica', ['empírico', 'datos empíricos', 'respaldo empírico'])
    this.synonymMaps.set('fundamento empírico', ['fundamento', 'base empírica'])
    
    // Exploración socrática - Alineados con Supervisor Clínico
    this.synonymMaps.set('reflexionar', ['reflexión', 'pensar', 'meditar', 'contemplar'])
    this.synonymMaps.set('explorar', ['exploración', 'investigar', 'indagar', 'examinar'])
    this.synonymMaps.set('analizar', ['análisis', 'examinar', 'estudiar', 'evaluar', 'revisar'])
    this.synonymMaps.set('cuestionar', ['cuestionamiento', 'preguntar', 'interrogar', 'dudar'])
    this.synonymMaps.set('insight', ['comprensión', 'entendimiento', 'revelación', 'darse cuenta'])
    this.synonymMaps.set('autoconocimiento', ['conocimiento personal', 'autoconciencia', 'introspección', 'conocerse'])
    this.synonymMaps.set('desarrollo de conciencia', ['awareness', 'consciencia', 'darse cuenta', 'percatarse', 'conciencia'])
    this.synonymMaps.set('exploración profunda', ['profundizar', 'ahondar', 'ir más allá', 'explorar a fondo'])
    this.synonymMaps.set('cuestionamiento socrático', ['preguntas socráticas', 'método socrático', 'diálogo socrático', 'mayéutica'])
    this.synonymMaps.set('facilitación de insight', ['facilitar comprensión', 'generar insight', 'promover entendimiento', 'facilitación'])
    this.synonymMaps.set('análisis introspectivo', ['introspección', 'autoexamen', 'autoanálisis', 'reflexión interna'])
    this.synonymMaps.set('exploración de creencias', ['examinar creencias', 'cuestionar creencias', 'revisar supuestos', 'creencias'])
    this.synonymMaps.set('reflexión crítica', ['pensamiento crítico', 'análisis crítico', 'evaluación crítica'])
    this.synonymMaps.set('autorreflexión', ['auto reflexión', 'reflexión personal'])
    this.synonymMaps.set('facilitación reflexiva', ['facilitación', 'guía reflexiva'])
    this.synonymMaps.set('exploración cognitiva', ['cognición', 'procesos cognitivos'])
    this.synonymMaps.set('análisis de supuestos', ['supuestos', 'creencias subyacentes'])
    this.synonymMaps.set('deconstrucción de creencias', ['deconstruir', 'desmontar creencias'])
    this.synonymMaps.set('desarrollo de perspectiva', ['perspectiva', 'nueva perspectiva'])
    this.synonymMaps.set('exploración de significado', ['significado', 'sentido', 'propósito'])
    this.synonymMaps.set('búsqueda de comprensión', ['comprensión profunda', 'entendimiento', 'búsqueda de sentido'])
  }

  async extractEntities(text: string, sessionContext?: any): Promise<EntityExtractionResult> {
    const startTime = Date.now()
    
    try {
      // Construir prompt contextual
      const contextualPrompt = this.buildContextualPrompt(text, sessionContext)
      
      // Ejecutar extracción usando Google GenAI
      const extractionResult = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: contextualPrompt,
        config: {
          tools: [{ functionDeclarations: entityExtractionFunctions }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO
            }
          }
        }
      })

      // Procesar resultados de function calls
      const entities = await this.processFunctionCalls(extractionResult.functionCalls || [])
      
      // Clasificar entidades por importancia
      const { primaryEntities, secondaryEntities } = this.classifyEntitiesByImportance(entities)
      
      // Calcular confianza general
      const overallConfidence = this.calculateOverallConfidence(entities)
      
      const processingTime = Date.now() - startTime
      
      return {
        entities,
        primaryEntities,
        secondaryEntities,
        confidence: overallConfidence,
        processingTime
      }
    } catch (error) {
      console.error('[EntityExtractionEngine] Error extracting entities:', error)
      return {
        entities: [],
        primaryEntities: [],
        secondaryEntities: [],
        confidence: 0,
        processingTime: Date.now() - startTime
      }
    }
  }

  private buildContextualPrompt(text: string, sessionContext?: any): string {
    let prompt = `Analiza el siguiente texto y extrae todas las entidades clínicas relevantes:\n\n"${text}"\n\n`
    
    if (sessionContext && this.config.enableContextualAnalysis) {
      prompt += `Contexto de la sesión:\n`
      if (sessionContext.currentAgent) {
        prompt += `- Agente actual: ${sessionContext.currentAgent}\n`
      }
      if (sessionContext.previousEntities) {
        prompt += `- Entidades previas: ${sessionContext.previousEntities.join(', ')}\n`
      }
      // Patient context biasing for enhanced extraction
      if (sessionContext.patient_reference) {
        prompt += `- Paciente de referencia: ${sessionContext.patient_reference}\n`
        prompt += `- IMPORTANTE: Prioriza entidades relacionadas con el contexto específico de este paciente\n`
      }
      if (sessionContext.clinicalMode) {
        prompt += `- Modo clínico: ${sessionContext.clinicalMode}\n`
      }
      if (sessionContext.activeAgent) {
        prompt += `- Especialista activo: ${sessionContext.activeAgent}\n`
      }
      prompt += `\n`
    }
    
    prompt += `Extrae y clasifica todas las entidades relevantes con alta precisión. Prioriza entidades específicas y técnicas sobre conceptos generales.`
    
    // Enhanced instruction for patient-scoped conversations
    if (sessionContext?.patient_reference) {
      prompt += ` Cuando hay un paciente de referencia, enfócate especialmente en entidades que puedan ser relevantes para el contexto clínico específico de ese paciente.`
    }
    
    return prompt
  }

  private async processFunctionCalls(functionCalls: any[]): Promise<ExtractedEntity[]> {
    const allEntities: ExtractedEntity[] = []
    
    for (const call of functionCalls) {
      switch (call.name) {
        case 'extract_therapeutic_techniques':
          const techniques = call.args.techniques || []
          for (const tech of techniques) {
            if (tech.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'therapeutic_technique',
                value: tech.name,
                confidence: tech.confidence,
                context: tech.context,
                synonyms: this.synonymMaps.get(tech.name)
              })
            }
          }
          break
          
        case 'extract_target_populations':
          const populations = call.args.populations || []
          for (const pop of populations) {
            if (pop.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'target_population',
                value: pop.group,
                confidence: pop.confidence,
                context: pop.age_range || pop.characteristics?.join(', ')
              })
            }
          }
          break
          
        case 'extract_disorders_conditions':
          const conditions = call.args.conditions || []
          for (const condition of conditions) {
            if (condition.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'disorder_condition',
                value: condition.name,
                confidence: condition.confidence,
                context: `${condition.category} - ${condition.severity}`
              })
            }
          }
          break
          
        case 'extract_documentation_processes':
          const processes = call.args.processes || []
          for (const process of processes) {
            if (process.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'documentation_process',
                value: process.process,
                confidence: process.confidence,
                context: `${process.format_type} - ${process.learning_context || 'general'}`
              })
            }
          }
          break
          
        case 'extract_academic_validation':
          const validations = call.args.validations || []
          for (const validation of validations) {
            if (validation.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'academic_validation',
                value: validation.subject_matter,
                confidence: validation.confidence,
                context: `${validation.query_type} - ${validation.research_context || 'general'} - ${validation.evidence_level || 'cualquier'}`
              })
            }
          }
          break
          
        case 'extract_socratic_exploration':
          const explorations = call.args.explorations || []
          for (const exploration of explorations) {
            if (exploration.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'socratic_exploration',
                value: exploration.subject_matter,
                confidence: exploration.confidence,
                context: `${exploration.exploration_type} - ${exploration.exploration_context || 'general'} - ${exploration.depth_level || 'moderado'}`
              })
            }
          }
          break
          
        case 'extract_clinical_concepts':
          const concepts = call.args.concepts || []
          for (const concept of concepts) {
            if (concept.confidence >= this.config.confidenceThreshold) {
              allEntities.push({
                type: 'clinical_concept',
                value: concept.concept,
                confidence: concept.confidence,
                context: `${concept.type} - ${concept.relevance}`
              })
            }
          }
          break
      }
    }
    
    return this.deduplicateEntities(allEntities)
  }

  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>()
    const deduplicated: ExtractedEntity[] = []
    
    for (const entity of entities) {
      const key = `${entity.type}:${entity.value.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(entity)
      }
    }
    
    return deduplicated
  }

  private classifyEntitiesByImportance(entities: ExtractedEntity[]): {
    primaryEntities: ExtractedEntity[]
    secondaryEntities: ExtractedEntity[]
  } {
    const primaryThreshold = 0.8
    
    const primaryEntities = entities.filter(entity => 
      entity.confidence >= primaryThreshold ||
      entity.type === 'therapeutic_technique' ||
      entity.type === 'disorder_condition'
    )
    
    const secondaryEntities = entities.filter(entity => 
      !primaryEntities.includes(entity)
    )
    
    return { primaryEntities, secondaryEntities }
  }

  private calculateOverallConfidence(entities: ExtractedEntity[]): number {
    if (entities.length === 0) return 0
    
    const totalConfidence = entities.reduce((sum, entity) => sum + entity.confidence, 0)
    return totalConfidence / entities.length
  }

  async validateEntities(entities: ExtractedEntity[]): Promise<EntityValidationResult> {
    if (!this.config.enableValidation) {
      return {
        isValid: true,
        validatedEntities: entities,
        invalidEntities: [],
        suggestions: []
      }
    }
    
    const validatedEntities: ExtractedEntity[] = []
    const invalidEntities: ExtractedEntity[] = []
    const suggestions: string[] = []
    
    for (const entity of entities) {
      const knownSet = this.knownEntities.get(entity.type)
      
      if (knownSet && this.isEntityKnown(entity.value, knownSet)) {
        validatedEntities.push(entity)
      } else if (entity.confidence >= 0.9) {
        // Alta confianza, probablemente válida aunque no esté en la base conocida
        validatedEntities.push(entity)
      } else {
        invalidEntities.push(entity)
        suggestions.push(`Verificar: ${entity.value} (${entity.type})`)
      }
    }
    
    return {
      isValid: invalidEntities.length === 0,
      validatedEntities,
      invalidEntities,
      suggestions
    }
  }

  private isEntityKnown(value: string, knownSet: Set<string>): boolean {
    // Búsqueda exacta
    if (knownSet.has(value)) return true
    
    // Búsqueda case-insensitive
    const lowerValue = value.toLowerCase()
    for (const known of Array.from(knownSet)) {
      if (known.toLowerCase() === lowerValue) return true
    }
    
    // Búsqueda por sinónimos
    if (this.config.enableSynonymExpansion) {
      for (const [key, synonyms] of Array.from(this.synonymMaps)) {
        if (synonyms.some(syn => syn.toLowerCase() === lowerValue)) {
          return true
        }
      }
    }
    
    return false
  }

  // Método para actualizar la base de entidades conocidas
  addKnownEntity(type: EntityType, value: string, synonyms?: string[]) {
    const knownSet = this.knownEntities.get(type) || new Set()
    knownSet.add(value)
    this.knownEntities.set(type, knownSet)
    
    if (synonyms) {
      this.synonymMaps.set(value, synonyms)
    }
  }

  // Método para obtener estadísticas del motor
  getEngineStats() {
    const stats = {
      totalKnownEntities: 0,
      entitiesByType: {} as Record<EntityType, number>,
      totalSynonyms: this.synonymMaps.size,
      config: this.config
    }
    for (const [type, entities] of Array.from(this.knownEntities)) {
      stats.entitiesByType[type] = entities.size
      stats.totalKnownEntities += entities.size
    }
    
    return stats
  }

  /**
   * 🚀 OPTIMIZACIÓN: Exponer function declarations para llamada combinada
   * Permite al IntelligentIntentRouter combinar intención + entidades en una sola llamada LLM
   */
  public getEntityExtractionFunctions(): FunctionDeclaration[] {
    return entityExtractionFunctions;
  }

  /**
   * 🚀 OPTIMIZACIÓN: Procesar function calls de forma pública (para llamada combinada)
   * Usado cuando el IntelligentIntentRouter hace una llamada combinada de intención + entidades
   */
  public async processFunctionCallsPublic(
    functionCalls: any[], 
    startTime?: number
  ): Promise<EntityExtractionResult> {
    const processingStartTime = startTime || Date.now();
    
    const entities = await this.processFunctionCalls(functionCalls);
    const { primaryEntities, secondaryEntities } = this.classifyEntitiesByImportance(entities);
    const overallConfidence = this.calculateOverallConfidence(entities);
    
    return {
      entities,
      primaryEntities,
      secondaryEntities,
      confidence: overallConfidence,
      processingTime: Date.now() - processingStartTime
    };
  }
}

// Factory function
export function createEntityExtractionEngine(config?: Partial<EntityExtractionConfig>): EntityExtractionEngine {
  return new EntityExtractionEngine(config)
}

// Instancia por defecto
export const defaultEntityExtractor = createEntityExtractionEngine()