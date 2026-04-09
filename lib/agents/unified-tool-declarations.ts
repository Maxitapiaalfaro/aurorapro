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
      {
        name: 'create_patient',
        description: [
          'Crea un nuevo registro de paciente en la base de datos del terapeuta.',
          '',
          'USA CUANDO:',
          '- El terapeuta menciona un paciente nuevo que quiere registrar',
          '- El terapeuta pide explícitamente crear un registro de paciente',
          '- Se inicia un caso nuevo y no existe registro previo',
          '',
          'NO USES CUANDO:',
          '- El paciente ya existe — usa get_patient_record',
          '- El terapeuta solo menciona un nombre casualmente sin pedir registrarlo',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            displayName: {
              type: 'string',
              description: 'Nombre o seudónimo del paciente',
            },
            demographics: {
              type: 'object',
              description: 'Datos demográficos del paciente (todos opcionales)',
              properties: {
                ageRange: { type: 'string', description: 'Rango etario (ej: "25-30")' },
                gender: { type: 'string', description: 'Género' },
                occupation: { type: 'string', description: 'Ocupación' },
                location: { type: 'string', description: 'Ubicación' },
              },
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Etiquetas clínicas: condiciones, áreas de enfoque terapéutico',
            },
            notes: {
              type: 'string',
              description: 'Notas clínicas iniciales del caso',
            },
          },
          required: ['displayName'],
        },
      },
      {
        name: 'list_patients',
        description: [
          'Lista los pacientes registrados del terapeuta, con opción de búsqueda por nombre, etiquetas o notas.',
          '',
          'USA CUANDO:',
          '- El terapeuta pregunta "quiénes son mis pacientes" o "cuántos pacientes tengo"',
          '- Necesitas encontrar un paciente específico para trabajar con él',
          '- El terapeuta quiere seleccionar un paciente de su lista',
          '',
          'NO USES CUANDO:',
          '- El paciente ya está activo en la sesión y lo conoces',
          '- Solo necesitas el registro de un paciente cuyo ID ya tienes — usa get_patient_record',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            search_query: {
              type: 'string',
              description: 'Término de búsqueda para filtrar por nombre, etiquetas o notas',
            },
            limit: {
              type: 'number',
              description: 'Número máximo de pacientes a retornar (1-50). Default: 20.',
            },
          },
        },
      },
      // ─── SUB-AGENT TOOLS ─────────────────────────────────────────
      {
        name: 'explore_patient_context',
        description: [
          'Sub-agente que agrega y sintetiza el contexto clínico completo de un paciente: registro clínico, memorias inter-sesión, patrones relevantes → resumen clínico integrado.',
          'Usa un modelo secundario para producir una síntesis comprensiva.',
          '',
          'USA CUANDO:',
          '- Primera mención de un paciente en la sesión y necesitas contexto completo',
          '- El terapeuta pide "recuérdame este caso" o "qué sabemos de este paciente"',
          '- Vas a iniciar una formulación de caso y necesitas toda la información disponible',
          '- Necesitas más que solo el registro o solo las memorias — necesitas la síntesis integrada',
          '',
          'NO USES CUANDO:',
          '- Solo necesitas un dato específico (usa get_patient_record o get_patient_memories)',
          '- Ya sintetizaste el contexto de este paciente en este turno',
          '- No hay paciente activo en la sesión',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            patientId: {
              type: 'string',
              description: 'ID del paciente en Firestore',
            },
            context_hint: {
              type: 'string',
              description:
                'Contexto de la consulta actual para priorizar memorias relevantes. Ejemplo: "terapeuta pregunta sobre patrones de evitación"',
            },
          },
          required: ['patientId'],
        },
      },
      {
        name: 'generate_clinical_document',
        description: [
          'Sub-agente que genera documentos clínicos estructurados profesionales con preview en tiempo real.',
          'Genera notas SOAP, DAP, BIRP, planes de tratamiento y resúmenes de caso.',
          'El documento se muestra progresivamente en un panel lateral mientras se genera.',
          'Usa un modelo secundario especializado en documentación clínica.',
          '',
          'USA SIEMPRE CUANDO:',
          '- El terapeuta solicita crear, generar, redactar o documentar cualquier nota clínica',
          '- El terapeuta pide notas de sesión, reportes, planes de tratamiento o resúmenes',
          '- Final de sesión y el terapeuta pide resumen estructurado',
          '- Necesitas generar un documento formal con formato clínico específico',
          '- El terapeuta dice "genera", "crea", "documenta", "haz una nota", "escribe un reporte"',
          '',
          'NO USES CUANDO:',
          '- El terapeuta solo hace una pregunta sobre documentación (responde directamente)',
          '- La consulta es conversacional, no requiere documento formal',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            document_type: {
              type: 'string',
              description:
                'Tipo de documento: "SOAP", "DAP", "BIRP", "plan_tratamiento", "resumen_caso"',
              enum: ['SOAP', 'DAP', 'BIRP', 'plan_tratamiento', 'resumen_caso'],
            },
            conversation_context: {
              type: 'string',
              description:
                'Resumen del contenido de la sesión a documentar. Incluye: temas discutidos, intervenciones realizadas, respuestas del paciente, observaciones clínicas.',
            },
            patient_id: {
              type: 'string',
              description:
                'ID del paciente (opcional, para enriquecer con datos del registro)',
            },
            additional_instructions: {
              type: 'string',
              description:
                'Instrucciones específicas del terapeuta para el documento (ej: "enfoca en la alianza terapéutica")',
            },
          },
          required: ['document_type', 'conversation_context'],
        },
      },
      {
        name: 'research_evidence',
        description: [
          'Sub-agente de investigación que realiza búsquedas multi-query y sintetiza evidencia académica de forma comprensiva.',
          'Descompone una pregunta de investigación en 2-3 sub-consultas, busca en paralelo, y produce una revisión de evidencia integrada con niveles de confianza.',
          '',
          'USA CUANDO:',
          '- El terapeuta necesita una revisión comprensiva de evidencia sobre un tema complejo',
          '- Comparación de intervenciones o enfoques terapéuticos con múltiples dimensiones',
          '- La pregunta requiere cruzar evidencia de múltiples búsquedas para una respuesta completa',
          '- Mini-revisión de literatura para informar decisiones clínicas',
          '',
          'NO USES CUANDO:',
          '- Una búsqueda simple basta — usa search_academic_literature directamente',
          '- El terapeuta pide un dato específico, no una revisión',
          '- Ya investigaste este tema en la conversación actual',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            research_question: {
              type: 'string',
              description:
                'Pregunta de investigación clínica completa. Ejemplo: "¿Cuál es la evidencia comparativa entre EMDR y terapia de exposición prolongada para TEPT en adultos?"',
            },
            focus_area: {
              type: 'string',
              description:
                'Área de enfoque opcional para priorizar resultados (ej: "población infantil", "comorbilidad con depresión")',
            },
            max_sources: {
              type: 'number',
              description:
                'Número máximo de fuentes a incluir en la síntesis (default: 12)',
            },
          },
          required: ['research_question'],
        },
      },
      {
        name: 'analyze_longitudinal_patterns',
        description: [
          'Sub-agente que analiza patrones longitudinales en el trabajo terapéutico: dominios clínicos explorados, técnicas utilizadas, áreas no exploradas, y oportunidades de desarrollo profesional.',
          'Requiere historial de múltiples sesiones. Usa análisis asistido por IA con modelo secundario.',
          '',
          'USA CUANDO:',
          '- Después de múltiples sesiones con un paciente (mínimo 3)',
          '- El terapeuta pregunta "¿qué patrones ves?" o "¿qué estoy explorando consistentemente?"',
          '- Revisión de desarrollo profesional o supervisión',
          '- El terapeuta quiere una meta-perspectiva sobre su abordaje clínico',
          '',
          'NO USES CUANDO:',
          '- Solo hay 1-2 sesiones de historial (insuficiente para análisis longitudinal)',
          '- El terapeuta pregunta sobre un caso puntual (usa supervisión directa)',
          '- La consulta no requiere análisis meta-clínico',
        ].join('\n'),
        parametersJsonSchema: {
          type: 'object',
          properties: {
            patient_id: {
              type: 'string',
              description: 'ID del paciente para análisis longitudinal',
            },
            session_history: {
              type: 'array',
              description:
                'Array de resúmenes de sesión o extractos de mensajes para analizar. Mínimo 3 entradas.',
              items: {
                type: 'object',
                properties: {
                  role: {
                    type: 'string',
                    description: '"user" (terapeuta) o "model" (Aurora)',
                    enum: ['user', 'model'],
                  },
                  content: {
                    type: 'string',
                    description: 'Contenido del mensaje o resumen de sesión',
                  },
                  timestamp: {
                    type: 'string',
                    description: 'ISO timestamp (opcional)',
                  },
                },
                required: ['role', 'content'],
              },
            },
          },
          required: ['patient_id', 'session_history'],
        },
      },
    ],
  },
];
