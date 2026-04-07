/**
 * Unified Tool Declarations — Gemini FunctionDeclaration format
 *
 * All tools visible to the unified Aurora agent. Tool descriptions
 * follow Claude Code's pattern: what it does, when to use, when NOT to use.
 * This is the routing mechanism — the model decides which tools to invoke
 * based on these descriptions.
 *
 * Format: parametersJsonSchema (plain JSON Schema), not Type.OBJECT enums.
 */

export const UNIFIED_TOOL_DECLARATIONS = [
  {
    functionDeclarations: [
      // ─── SEARCH TOOLS ─────────────────────────────────────────────
      {
        name: 'search_academic_literature',
        description: [
          'Busca literatura científica peer-reviewed en bases de datos académicas (PubMed, journals de psicología) usando Parallel AI.',
          'Retorna artículos con excerpts relevantes, DOIs, autores y metadata.',
          '',
          'USA CUANDO:',
          '- El terapeuta solicita evidencia empírica explícitamente',
          '- Necesitas validar una hipótesis clínica con datos',
          '- Comparas intervenciones terapéuticas y necesitas resultados cuantitativos',
          '- Documentas una formulación que requiere respaldo científico',
          '- Hay una afirmación empírica cuestionable que requiere verificación',
          '',
          'NO USES CUANDO:',
          '- La consulta es puramente reflexiva y no necesita datos',
          '- Ya buscaste sobre el mismo tema en esta conversación — reutiliza esa evidencia',
          '- El terapeuta pide un juicio clínico, no datos',
          '- Es un concepto clínico establecido que no requiere búsqueda',
          '- Es follow-up conversacional sobre evidencia ya presentada',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Pregunta de investigación específica en nomenclatura clínica. Incluye intervención, población y tipo de evidencia cuando sea posible. Ejemplo: "eficacia TCC depresión mayor adultos meta-análisis revisión sistemática"',
            },
            max_results: {
              type: 'number',
              description:
                'Número máximo de artículos a retornar (1-20). Default: 8.',
            },
          },
          required: ['query'],
        },
      },

      // ─── READ TOOLS ───────────────────────────────────────────────
      {
        name: 'get_patient_memories',
        description: [
          'Recupera memorias clínicas inter-sesión de un paciente: observaciones significativas, patrones recurrentes detectados, y preferencias terapéuticas registradas en sesiones previas.',
          '',
          'USA CUANDO:',
          '- El terapeuta menciona un paciente activo y necesitas contexto histórico',
          '- Una nueva consulta podría conectarse con patrones previos del paciente',
          '- El terapeuta pregunta explícitamente por historial o patrones observados',
          '- Vas a formular o refinar una hipótesis y necesitas datos longitudinales',
          '',
          'NO USES CUANDO:',
          '- No hay paciente activo en la sesión',
          '- La consulta es teórica sin caso específico',
          '- Ya recuperaste memorias de este paciente en este turno',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            patientId: {
              type: 'string',
              description: 'ID del paciente en Firestore',
            },
            category: {
              type: 'string',
              description:
                'Filtrar por categoría: "observation" (observaciones clínicas), "pattern" (patrones recurrentes), "therapeutic-preference" (preferencias de intervención). Omitir para obtener todas.',
              enum: ['observation', 'pattern', 'therapeutic-preference'],
            },
            limit: {
              type: 'number',
              description:
                'Número máximo de memorias a retornar. Default: 10.',
            },
          },
          required: ['patientId'],
        },
      },
      {
        name: 'get_patient_record',
        description: [
          'Carga el registro clínico completo de un paciente desde Firestore: datos demográficos, diagnósticos activos, notas del caso, historial y resumen clínico.',
          '',
          'USA CUANDO:',
          '- El terapeuta selecciona un paciente o lo menciona por primera vez en la sesión',
          '- Necesitas información de base para una formulación de caso',
          '- Necesitas contexto demográfico o diagnóstico para contextualizar una búsqueda académica',
          '',
          'NO USES CUANDO:',
          '- Ya cargaste el registro de este paciente en este turno',
          '- La consulta no se refiere a un paciente concreto',
          '- Solo necesitas memorias inter-sesión — usa get_patient_memories en su lugar',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            patientId: {
              type: 'string',
              description: 'ID del paciente en Firestore',
            },
          },
          required: ['patientId'],
        },
      },

      // ─── WRITE TOOLS ──────────────────────────────────────────────
      {
        name: 'save_clinical_memory',
        description: [
          'Persiste una memoria clínica derivada de la sesión actual: una observación significativa, un patrón recurrente identificado, o una preferencia terapéutica del paciente. La memoria se almacena en Firestore y estará disponible en sesiones futuras via get_patient_memories.',
          '',
          'USA CUANDO:',
          '- Identificas un patrón clínico que el terapeuta debería recordar entre sesiones',
          '- El terapeuta explicita una preferencia de intervención o enfoque terapéutico',
          '- Se detecta una observación importante sobre el progreso o retroceso del paciente',
          '- El terapeuta pide explícitamente que recuerdes algo para la próxima sesión',
          '',
          'NO USES CUANDO:',
          '- La información es trivial o efímera',
          '- La observación ya está registrada como memoria activa',
          '- No hay paciente activo en la sesión',
          '- El contenido es una hipótesis preliminar sin suficiente soporte — espera confirmación',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            patientId: {
              type: 'string',
              description: 'ID del paciente en Firestore',
            },
            category: {
              type: 'string',
              description:
                'Tipo de memoria: "observation" para observaciones clínicas puntuales, "pattern" para patrones recurrentes detectados, "therapeutic-preference" para preferencias de intervención del paciente o terapeuta.',
              enum: ['observation', 'pattern', 'therapeutic-preference'],
            },
            content: {
              type: 'string',
              description:
                'Contenido de la memoria en lenguaje clínico conciso. Incluye contexto suficiente para ser útil fuera de esta sesión. Ejemplo: "Paciente muestra patrón de minimización de logros terapéuticos — tercera sesión consecutiva donde resta importancia a avances conductuales observables."',
            },
            confidence: {
              type: 'number',
              description:
                'Nivel de confianza en la observación (0.0 a 1.0). 0.9+ para patrones confirmados por múltiples fuentes; 0.5-0.8 para observaciones preliminares; <0.5 para hipótesis iniciales.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Etiquetas clínicas para facilitar recuperación futura. Ejemplo: ["minimización", "progreso", "autoeficacia"]',
            },
          },
          required: ['patientId', 'category', 'content', 'confidence'],
        },
      },
    ],
  },
];
