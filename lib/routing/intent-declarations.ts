/**
 * Intent Function Declarations — Gemini function-calling schemas for intent classification
 * 
 * Extracted from intelligent-intent-router.ts during P4 decomposition.
 * These declarations define the 3 agent activation functions used by the LLM
 * to classify user intent via structured function calling.
 */

import type { FunctionDeclaration } from '@google/genai';

/**
 * Function declarations for the 3 clinical agent modes.
 * Used by Gemini's function-calling to classify user intent.
 */
export const INTENT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'activar_modo_socratico',
    description: `Activa Supervisor Clínico para diálogo terapéutico profundo, exploración reflexiva y facilitación de insights. 
    
    ACTIVAR CUANDO:
    - Usuario busca reflexión, autoconocimiento o exploración de pensamientos/emociones
    - Solicita diálogo terapéutico, cuestionamiento socrático o facilitación de insights
    - Necesita explorar creencias, desarrollar perspectiva o análisis introspectivo
    - Busca comprensión profunda, desarrollo de conciencia o autorreflexión
    - Presenta un CASO CLÍNICO para supervisión o análisis de paciente
    - Pregunta sobre abordaje terapéutico en contexto de caso específico
    - Menciona términos como: reflexionar, explorar, analizar, cuestionar, insight, autoconocimiento, caso, paciente
    
    NOTA IMPORTANTE: El Supervisor puede buscar evidencia científica COMO COMPLEMENTO a la exploración reflexiva cuando sea relevante para el caso, pero la intención principal debe ser exploración/supervisión clínica.
    
    ENTIDADES CLAVE: exploración socrática, desarrollo personal, insight terapéutico, supervisión de casos`,
    parametersJsonSchema: {
      type: 'object' as const,
      properties: {
        razon_activacion: {
          type: 'string' as const,
          description: 'Razón específica para activar Supervisor Clínico basada en la intención detectada'
        },
        entidades_socraticas: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Entidades de exploración socrática detectadas (reflexión, insight, autoconocimiento, etc.)'
        },
        contexto_exploracion: {
          type: 'string' as const,
          description: 'Contexto específico de la exploración requerida'
        },
        nivel_confianza: {
          type: 'number' as const,
          description: 'Nivel de confianza en la clasificación socrática (0-1)'
        },
        justificacion_clinica: {
          type: 'string' as const,
          description: 'Breve justificación clínica en lenguaje natural (1-2 oraciones) explicando POR QUÉ se selecciona este especialista para la consulta del usuario. Ejemplo: "La consulta busca explorar patrones de pensamiento del paciente, lo cual requiere facilitación socrática reflexiva."'
        }
      },
      required: ['razon_activacion', 'nivel_confianza', 'justificacion_clinica']
    }
  },
  {
    name: 'activar_modo_clinico',
    description: `Activa Especialista en Documentación para documentación profesional, síntesis clínica y estructuración de información terapéutica.
    
    ACTIVAR CUANDO:
    - Usuario necesita documentación clínica, notas de sesión o resúmenes profesionales
    - Solicita estructuración de información, formatos específicos (SOAP, PIRP, DAP, BIRP)
    - Requiere síntesis documental, archivado clínico o registro de intervenciones
    - Busca ejemplos de redacción profesional o plantillas de documentación
    - Pide organizar, estructurar o sintetizar información de sesiones/casos
    - Menciona términos como: documentar, notas, resumen, SOAP, expediente, bitácora, registrar
    
    NOTA IMPORTANTE: El Documentalista puede buscar evidencia científica COMO COMPLEMENTO para fundamentar diagnósticos o intervenciones en la documentación, pero la intención principal debe ser crear/estructurar documentación clínica.
    
    ENTIDADES CLAVE: documentación clínica, formatos profesionales, síntesis terapéutica, registros estructurados`,
    parametersJsonSchema: {
      type: 'object' as const,
      properties: {
        tipo_documentacion: {
          type: 'string' as const,
          description: 'Tipo específico de documentación clínica requerida (SOAP, resumen, nota de evolución, etc.)'
        },
        entidades_clinicas: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Entidades de documentación detectadas (notas clínicas, formatos, síntesis, etc.)'
        },
        formato_requerido: {
          type: 'string' as const,
          description: 'Formato específico de documentación solicitado'
        },
        nivel_confianza: {
          type: 'number' as const,
          description: 'Nivel de confianza en la clasificación clínica (0-1)'
        },
        justificacion_clinica: {
          type: 'string' as const,
          description: 'Breve justificación clínica en lenguaje natural (1-2 oraciones) explicando POR QUÉ se selecciona este especialista para la consulta del usuario. Ejemplo: "El usuario necesita estructurar notas de sesión en formato profesional, lo cual es tarea del Documentalista Clínico."'
        }
      },
      required: ['tipo_documentacion', 'nivel_confianza', 'justificacion_clinica']
    }
  },
  {
    name: 'activar_modo_academico',
    description: `Activa Investigador Académico para búsqueda EXHAUSTIVA de evidencia científica, validación empírica y consulta PROFUNDA de literatura especializada como OBJETIVO PRINCIPAL.
    
    ACTIVAR CUANDO LA PREGUNTA PRINCIPAL ES SOBRE EVIDENCIA:
    - Usuario pregunta "¿Qué dice la evidencia/investigación sobre [tema]?" como consulta CENTRAL
    - Solicita EXPLÍCITAMENTE investigación, metaanálisis, ensayos clínicos o revisiones sistemáticas
    - Requiere respaldo empírico, guidelines clínicas o protocolos validados SIN contexto de caso específico
    - Busca literatura actualizada, consenso científico o práctica basada en evidencia de forma GENERAL
    - Pide comparación de eficacia entre múltiples intervenciones basada en estudios
    - Menciona EXPLÍCITAMENTE términos como: estudios, papers, metaanálisis, RCT, evidencia, investigación, publicaciones
    
    NO ACTIVAR CUANDO:
    - La búsqueda de evidencia es COMPLEMENTARIA a exploración de un caso clínico (usar Supervisor)
    - La evidencia es para FUNDAMENTAR documentación (usar Documentalista)
    - La pregunta principal es sobre un caso/paciente específico y la evidencia es secundaria
    
    NOTA CRÍTICA: El Académico hace búsqueda EXHAUSTIVA (10+ fuentes). Los otros agentes hacen búsqueda COMPLEMENTARIA (3-5 fuentes) cuando es relevante.
    
    ENTIDADES CLAVE: validación académica exhaustiva, evidencia empírica primaria, investigación científica profunda, literatura especializada`,
    parametersJsonSchema: {
      type: 'object' as const,
      properties: {
        tipo_busqueda: {
          type: 'string' as const,
          description: 'Tipo específico de búsqueda académica (estudios, metaanálisis, guidelines, etc.)'
        },
        entidades_academicas: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Entidades de validación académica detectadas (estudios, evidencia, investigación, etc.)'
        },
        tecnicas_objetivo: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Técnicas terapéuticas específicas para validar'
        },
        poblacion_objetivo: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Poblaciones específicas de interés para la búsqueda'
        },
        nivel_confianza: {
          type: 'number' as const,
          description: 'Nivel de confianza en la clasificación académica (0-1)'
        },
        justificacion_clinica: {
          type: 'string' as const,
          description: 'Breve justificación clínica en lenguaje natural (1-2 oraciones) explicando POR QUÉ se selecciona este especialista para la consulta del usuario. Ejemplo: "La consulta requiere una revisión exhaustiva de la literatura científica sobre eficacia terapéutica, lo cual es competencia del Investigador Académico."'
        }
      },
      required: ['tipo_busqueda', 'nivel_confianza', 'justificacion_clinica']
    }
  }
];

/**
 * Valid intent function names for validation
 */
export const VALID_INTENT_FUNCTIONS = [
  'activar_modo_socratico',
  'activar_modo_clinico',
  'activar_modo_academico'
] as const;

/**
 * Display names for agents (used in reasoning and logging)
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  'activar_modo_socratico': 'Supervisor Clínico',
  'activar_modo_clinico': 'Especialista en Documentación',
  'activar_modo_academico': 'Investigador Académico'
};
