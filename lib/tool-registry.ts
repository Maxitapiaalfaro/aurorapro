/**
 * Tool Registry - Registro Central de Herramientas Clínicas
 * 
 * Este módulo implementa el catálogo maestro de primitivas conductuales
 * que pueden ser utilizadas dinámicamente por el Orquestador Inteligente.
 * 
 * Arquitectura:
 * - Cada herramienta es una FunctionDeclaration compatible con Google GenAI SDK
 * - Metadatos contextuales para selección inteligente
 * - Sistema de categorización y priorización
 * - Versionado y evolución de herramientas
 */

import { FunctionDeclaration, Type } from '@google/genai';

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================

export interface ToolMetadata {
  id: string;
  category: ToolCategory;
  priority: number; // 1-10, donde 10 es máxima prioridad
  contextKeywords: string[]; // Palabras clave que activan esta herramienta
  clinicalDomain: ClinicalDomain[];
  requiredEntities?: string[]; // Entidades que deben estar presentes
  conflictsWith?: string[]; // IDs de herramientas incompatibles
  version: string;
  lastUpdated: Date;
}

export interface ClinicalTool {
  metadata: ToolMetadata;
  declaration: FunctionDeclaration;
}

export enum ToolCategory {
  EMOTIONAL_EXPLORATION = 'emotional_exploration',
  COGNITIVE_ANALYSIS = 'cognitive_analysis',
  BEHAVIORAL_INTERVENTION = 'behavioral_intervention',
  RESEARCH_ACADEMIC = 'research_academic',
  VALIDATION_SUPPORT = 'validation_support',
  PATTERN_DETECTION = 'pattern_detection'
}

export enum ClinicalDomain {
  ANXIETY = 'anxiety',
  DEPRESSION = 'depression',
  TRAUMA = 'trauma',
  RELATIONSHIPS = 'relationships',
  ADDICTION = 'addiction',
  PERSONALITY = 'personality',
  GENERAL = 'general'
}

// ============================================================================
// PRIMITIVAS CONDUCTUALES - EXPLORACIÓN EMOCIONAL
// ============================================================================

const formulateClarifyingQuestion: ClinicalTool = {
  metadata: {
    id: 'formulate_clarifying_question',
    category: ToolCategory.EMOTIONAL_EXPLORATION,
    priority: 9,
    contextKeywords: ['confuso', 'no entiendo', 'unclear', 'ambiguo', 'explicar'],
    clinicalDomain: [ClinicalDomain.GENERAL],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'formulate_clarifying_question',
    description: 'Genera una pregunta clarificadora específica y empática para profundizar en la comprensión de la experiencia del cliente, evitando preguntas genéricas o superficiales.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientStatement: {
          type: Type.STRING,
          description: 'La declaración o comentario del cliente que requiere clarificación'
        },
        emotionalContext: {
          type: Type.STRING,
          description: 'El contexto emocional detectado en la conversación'
        },
        focusArea: {
          type: Type.STRING,
          enum: ['emotions', 'thoughts', 'behaviors', 'relationships', 'triggers'],
          description: 'El área específica en la que enfocar la clarificación'
        }
      },
      required: ['clientStatement', 'emotionalContext', 'focusArea']
    }
  }
};

const identifyCoreEmotion: ClinicalTool = {
  metadata: {
    id: 'identify_core_emotion',
    category: ToolCategory.EMOTIONAL_EXPLORATION,
    priority: 8,
    contextKeywords: ['siento', 'emoción', 'feeling', 'emotional', 'mood'],
    clinicalDomain: [ClinicalDomain.GENERAL, ClinicalDomain.ANXIETY, ClinicalDomain.DEPRESSION],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'identify_core_emotion',
    description: 'Identifica y nombra la emoción central subyacente en la experiencia del cliente, distinguiendo entre emociones primarias y secundarias.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientNarrative: {
          type: Type.STRING,
          description: 'La narrativa o descripción del cliente sobre su experiencia'
        },
        behavioralIndicators: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Indicadores conductuales observados o reportados'
        },
        contextualFactors: {
          type: Type.STRING,
          description: 'Factores contextuales relevantes (situación, relaciones, eventos)'
        }
      },
      required: ['clientNarrative']
    }
  }
};

const generateValidatingStatement: ClinicalTool = {
  metadata: {
    id: 'generate_validating_statement',
    category: ToolCategory.VALIDATION_SUPPORT,
    priority: 7,
    contextKeywords: ['dolor', 'difícil', 'struggle', 'hard', 'overwhelming'],
    clinicalDomain: [ClinicalDomain.GENERAL, ClinicalDomain.TRAUMA],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'generate_validating_statement',
    description: 'Crea una declaración de validación empática y específica que reconozca la experiencia del cliente sin minimizar o sobreactuar.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientExperience: {
          type: Type.STRING,
          description: 'La experiencia específica que el cliente ha compartido'
        },
        emotionalIntensity: {
          type: Type.STRING,
          enum: ['low', 'moderate', 'high', 'severe'],
          description: 'La intensidad emocional percibida en la experiencia'
        },
        validationType: {
          type: Type.STRING,
          enum: ['emotional', 'experiential', 'perspective', 'effort'],
          description: 'El tipo de validación más apropiado para la situación'
        }
      },
      required: ['clientExperience', 'emotionalIntensity', 'validationType']
    }
  }
};

// ============================================================================
// PRIMITIVAS CONDUCTUALES - ANÁLISIS COGNITIVO
// ============================================================================

const detectPattern: ClinicalTool = {
  metadata: {
    id: 'detect_pattern',
    category: ToolCategory.PATTERN_DETECTION,
    priority: 8,
    contextKeywords: ['siempre', 'nunca', 'always', 'never', 'pattern', 'repetir'],
    clinicalDomain: [ClinicalDomain.GENERAL, ClinicalDomain.ANXIETY, ClinicalDomain.DEPRESSION],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'detect_pattern',
    description: 'Identifica patrones recurrentes en pensamientos, emociones o comportamientos del cliente, destacando conexiones significativas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        conversationHistory: {
          type: Type.STRING,
          description: 'Historial relevante de la conversación para análisis de patrones'
        },
        patternType: {
          type: Type.STRING,
          enum: ['cognitive', 'emotional', 'behavioral', 'relational', 'situational'],
          description: 'El tipo de patrón a detectar'
        },
        timeframe: {
          type: Type.STRING,
          description: 'Marco temporal en el que se observa el patrón'
        }
      },
      required: ['conversationHistory', 'patternType']
    }
  }
};

const reframePerspective: ClinicalTool = {
  metadata: {
    id: 'reframe_perspective',
    category: ToolCategory.COGNITIVE_ANALYSIS,
    priority: 7,
    contextKeywords: ['terrible', 'awful', 'disaster', 'catastrophe', 'hopeless'],
    clinicalDomain: [ClinicalDomain.ANXIETY, ClinicalDomain.DEPRESSION],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'reframe_perspective',
    description: 'Ofrece una perspectiva alternativa equilibrada y realista sobre la situación del cliente, sin invalidar su experiencia.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        originalPerspective: {
          type: Type.STRING,
          description: 'La perspectiva original o pensamiento del cliente'
        },
        situationalContext: {
          type: Type.STRING,
          description: 'El contexto situacional completo'
        },
        reframeType: {
          type: Type.STRING,
          enum: ['balanced', 'strength_based', 'growth_oriented', 'evidence_based'],
          description: 'El tipo de reencuadre más apropiado'
        }
      },
      required: ['originalPerspective', 'situationalContext', 'reframeType']
    }
  }
};

// ============================================================================
// PRIMITIVAS CONDUCTUALES - INTERVENCIÓN CONDUCTUAL
// ============================================================================

const proposeBehavioralExperiment: ClinicalTool = {
  metadata: {
    id: 'propose_behavioral_experiment',
    category: ToolCategory.BEHAVIORAL_INTERVENTION,
    priority: 6,
    contextKeywords: ['try', 'experiment', 'practice', 'action', 'behavior'],
    clinicalDomain: [ClinicalDomain.ANXIETY, ClinicalDomain.DEPRESSION],
    version: '1.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'propose_behavioral_experiment',
    description: 'Diseña un experimento conductual específico, medible y apropiado para probar creencias o desarrollar nuevas habilidades.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetBelief: {
          type: Type.STRING,
          description: 'La creencia o patrón específico que se quiere examinar'
        },
        clientCapabilities: {
          type: Type.STRING,
          description: 'Las capacidades y limitaciones actuales del cliente'
        },
        experimentType: {
          type: Type.STRING,
          enum: ['exposure', 'behavioral_activation', 'skill_practice', 'reality_testing'],
          description: 'El tipo de experimento conductual'
        },
        timeframe: {
          type: Type.STRING,
          description: 'Marco temporal propuesto para el experimento'
        }
      },
      required: ['targetBelief', 'clientCapabilities', 'experimentType']
    }
  }
};

// ============================================================================
// HERRAMIENTA ESPECIALIZADA - INVESTIGACIÓN ACADÉMICA
// ============================================================================

const searchAcademicWeb: ClinicalTool = {
  metadata: {
    id: 'search_academic_web',
    category: ToolCategory.RESEARCH_ACADEMIC,
    priority: 5,
    contextKeywords: ['research', 'study', 'evidence', 'investigación', 'estudios'],
    clinicalDomain: [ClinicalDomain.GENERAL],
    version: '2.0.0',
    lastUpdated: new Date('2024-01-15')
  },
  declaration: {
    name: 'google_search',
    description: 'Busca literatura académica relevante en la web para proporcionar evidencia científica sobre técnicas o condiciones clínicas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Términos de búsqueda académicos específicos'
        },
        clinicalCondition: {
          type: Type.STRING,
          description: 'Condición clínica específica de interés'
        },
        interventionType: {
          type: Type.STRING,
          description: 'Tipo de intervención o técnica terapéutica'
        }
      },
      required: ['query']
    }
  }
};

// ============================================================================
// REGISTRO CENTRAL DE HERRAMIENTAS
// ============================================================================

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, ClinicalTool> = new Map();

  private constructor() {
    this.initializeTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private initializeTools(): void {
    const coreTools = [
      formulateClarifyingQuestion,
      identifyCoreEmotion,
      generateValidatingStatement,
      detectPattern,
      reframePerspective,
      proposeBehavioralExperiment,
      searchAcademicWeb
    ];

    coreTools.forEach(tool => {
      this.tools.set(tool.metadata.id, tool);
    });
  }

  /**
   * Obtiene todas las herramientas disponibles
   */
  public getAllTools(): ClinicalTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Obtiene herramientas por categoría
   */
  public getToolsByCategory(category: ToolCategory): ClinicalTool[] {
    return this.getAllTools().filter(tool => tool.metadata.category === category);
  }

  /**
   * Obtiene herramientas por dominio clínico
   */
  public getToolsByDomain(domain: ClinicalDomain): ClinicalTool[] {
    return this.getAllTools().filter(tool => 
      tool.metadata.clinicalDomain.includes(domain)
    );
  }

  /**
   * Busca herramientas por palabras clave contextuales
   */
  public searchToolsByKeywords(keywords: string[]): ClinicalTool[] {
    const normalizedKeywords = keywords.map(k => k.toLowerCase());
    
    return this.getAllTools().filter(tool => {
      return tool.metadata.contextKeywords.some(keyword => 
        normalizedKeywords.some(nk => keyword.toLowerCase().includes(nk))
      );
    }).sort((a, b) => b.metadata.priority - a.metadata.priority);
  }

  /**
   * Obtiene herramientas compatibles (sin conflictos)
   */
  public getCompatibleTools(selectedToolIds: string[]): ClinicalTool[] {
    const selectedTools = selectedToolIds.map(id => this.tools.get(id)).filter(Boolean) as ClinicalTool[];
    const conflictingIds = new Set(
      selectedTools.flatMap(tool => tool.metadata.conflictsWith || [])
    );

    return this.getAllTools().filter(tool => 
      !conflictingIds.has(tool.metadata.id) && !selectedToolIds.includes(tool.metadata.id)
    );
  }

  /**
   * Obtiene solo las FunctionDeclarations para el SDK de GenAI
   */
  public getFunctionDeclarations(toolIds: string[]): FunctionDeclaration[] {
    return toolIds
      .map(id => this.tools.get(id))
      .filter(Boolean)
      .map(tool => tool!.declaration);
  }

  /**
   * Registra una nueva herramienta
   */
  public registerTool(tool: ClinicalTool): void {
    this.tools.set(tool.metadata.id, tool);
  }

  /**
   * Obtiene herramientas para un contexto específico
   */
  public getToolsForContext(context: {
    domains?: ClinicalDomain[];
    entityTypes?: string[];
    sessionLength?: number;
    previousAgent?: string;
  }): ClinicalTool[] {
    const tools = Array.from(this.tools.values());
    
    return tools.filter(tool => {
      // Filtrar por dominios si se especifican
      if (context.domains && context.domains.length > 0) {
        const hasMatchingDomain = tool.metadata.clinicalDomain.some(domain => 
          context.domains!.includes(domain)
        );
        if (!hasMatchingDomain) return false;
      }
      
      // Filtrar por tipos de entidad si se especifican
      if (context.entityTypes && context.entityTypes.length > 0) {
        const hasMatchingKeyword = tool.metadata.contextKeywords.some(keyword =>
          context.entityTypes!.some(entityType => 
            entityType.toLowerCase().includes(keyword.toLowerCase()) ||
            keyword.toLowerCase().includes(entityType.toLowerCase())
          )
        );
        if (!hasMatchingKeyword) return false;
      }
      
      return true;
    }).slice(0, 5); // Limitar a 5 herramientas más relevantes
  }

  /**
   * Obtiene herramientas básicas para fallback
   */
  public getBasicTools(): ClinicalTool[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.metadata.category === ToolCategory.EMOTIONAL_EXPLORATION)
      .slice(0, 3);
  }

  /**
   * Obtiene estadísticas del registro
   */
  public getRegistryStats(): {
    totalTools: number;
    toolsByCategory: Record<string, number>;
    averagePriority: number;
  } {
    const tools = this.getAllTools();
    const toolsByCategory: Record<string, number> = {};
    
    tools.forEach(tool => {
      const category = tool.metadata.category;
      toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
    });

    const averagePriority = tools.reduce((sum, tool) => sum + tool.metadata.priority, 0) / tools.length;

    return {
      totalTools: tools.length,
      toolsByCategory,
      averagePriority: Math.round(averagePriority * 100) / 100
    };
  }
}

// ============================================================================
// EXPORTACIONES
// ============================================================================

export const toolRegistry = ToolRegistry.getInstance();

export {
  formulateClarifyingQuestion,
  identifyCoreEmotion,
  generateValidatingStatement,
  detectPattern,
  reframePerspective,
  proposeBehavioralExperiment,
  searchAcademicWeb
};