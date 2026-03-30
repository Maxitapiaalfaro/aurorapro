/**
 * Orquestador Dinámico de HopeAI
 * 
 * Sistema central que coordina la selección inteligente de agentes y herramientas
 * basado en el contexto de la conversación y las necesidades del psicólogo.
 * 
 * Arquitectura:
 * - Análisis contextual de la consulta
 * - Selección dinámica de herramientas especializadas
 * - Enrutamiento inteligente a agentes especializados
 * - Gestión de contexto entre transiciones
 * 
 * @author HopeAI Development Team
 * @version 2.0.0
 */
 
import { GoogleGenAI, FunctionDeclaration } from '@google/genai';
import { IntelligentIntentRouter, OrchestrationResult } from './intelligent-intent-router';
import { ClinicalAgentRouter } from './clinical-agent-router';
import { ToolRegistry, ClinicalTool } from './tool-registry';
import { EntityExtractionEngine, ExtractedEntity } from './entity-extraction-engine';
import { SentryMetricsTracker } from './sentry-metrics-tracker';
import { UserPreferencesManager } from './user-preferences-manager';
import { ai } from './google-genai-config';
import type { ClinicalFile, ReasoningBullet, BulletGenerationContext } from '@/types/clinical-types';

/**
 * Tipo para el contenido de conversación
 */
interface Content {
  role: string;
  parts: Array<{ text: string }>;
}

/**
 * Contexto de sesión para el orquestador
 */
interface SessionContext {
  sessionId: string;
  userId: string;
  conversationHistory: Content[];
  currentAgent?: string;
  activeTools: FunctionDeclaration[];
  sessionMetadata: {
    startTime: Date;
    totalInteractions: number;
    dominantTopics: string[];
    clinicalFocus?: string;
  };
}

/**
 * Resultado de la orquestación dinámica
 */
interface DynamicOrchestrationResult {
  success: boolean;
  selectedAgent: string;
  contextualTools: FunctionDeclaration[];
  toolMetadata: ClinicalTool[];
  sessionContext: SessionContext;
  confidence: number;
  reasoning: string;
  recommendations?: {
    suggestedFollowUp?: string;
    alternativeApproaches?: string[];
    clinicalConsiderations?: string[];
  };
}

/**
 * Configuración del orquestador dinámico
 */
interface DynamicOrchestratorConfig {
  enableAdaptiveLearning: boolean;
  maxToolsPerSession: number;
  confidenceThreshold: number;
  sessionTimeoutMinutes: number;
  enableRecommendations: boolean;
  asyncRecommendations?: boolean;          // ⭐ Performance optimization
  toolContinuityThreshold?: number;        // ⭐ Smart tool persistence
  dominantTopicsUpdateInterval?: number;   // ⭐ Reduce update frequency
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Orquestador Dinámico Principal
 * 
 * Coordina la selección inteligente de agentes y herramientas basada en:
 * - Análisis semántico de la consulta
 * - Contexto histórico de la sesión
 * - Patrones de uso del psicólogo
 * - Especialización clínica requerida
 */
export class DynamicOrchestrator {
  private ai: GoogleGenAI;
  private intentRouter: IntelligentIntentRouter;
  private agentRouter: ClinicalAgentRouter;
  private toolRegistry: ToolRegistry;
  private entityExtractor: EntityExtractionEngine;
  private metricsTracker: SentryMetricsTracker;
  private userPreferencesManager: UserPreferencesManager;
  private activeSessions: Map<string, SessionContext> = new Map();
  private recommendationsCache: Map<string, DynamicOrchestrationResult['recommendations']> = new Map();
  private config: DynamicOrchestratorConfig;

  constructor(
    agentRouter: ClinicalAgentRouter,
    config?: Partial<DynamicOrchestratorConfig>
  ) {
    this.ai = ai;
    this.agentRouter = agentRouter;
    this.intentRouter = new IntelligentIntentRouter(agentRouter);
    this.toolRegistry = ToolRegistry.getInstance();
    this.entityExtractor = new EntityExtractionEngine();
    this.metricsTracker = SentryMetricsTracker.getInstance();
    this.userPreferencesManager = UserPreferencesManager.getInstance();
    this.activeSessions = new Map();
    
    this.config = {
      enableAdaptiveLearning: false,
      maxToolsPerSession: 8,
      confidenceThreshold: 0.75,
      sessionTimeoutMinutes: 60,
      enableRecommendations: false,          // DESACTIVADO: Código inútil que añadía 500-1000ms sin valor
      asyncRecommendations: false,           // Default to sync for backward compatibility
      toolContinuityThreshold: 3,           // ⭐ Smart tool persistence
      dominantTopicsUpdateInterval: 5,      // Update every 5 interactions
      logLevel: 'info',
      ...config
    };
  }

  /**
   * Método principal de orquestación dinámica
   * 
   * Analiza la consulta del usuario y orquesta la respuesta óptima
   * seleccionando el agente y herramientas más apropiados.
   */
  async orchestrate(
    userInput: string,
    sessionId: string,
    userId: string,
    sessionFiles?: ClinicalFile[],
    onBulletUpdate?: (bullet: ReasoningBullet) => void,
    externalConversationHistory?: Content[],
    patientId?: string,
    patientSummary?: string,
    sessionType?: string
  ): Promise<DynamicOrchestrationResult> {
    const startTime = Date.now();
    
    try {
      this.log('info', `Iniciando orquestación para sesión ${sessionId}`);
      
      // El tracking de mensajes se maneja en el API layer para evitar duplicados
      // Solo registramos la actividad del orquestador internamente
      
      // 1. Obtener o crear contexto de sesión
      const sessionContext = await this.getOrCreateSession(sessionId, userId);
      
      // 2. Actualizar historial de conversación con archivos adjuntos (usuario)
      this.updateConversationHistory(sessionContext, userInput, sessionFiles);
      
      // 3. Realizar orquestación inteligente PRIMERO para obtener el agente correcto
      const orchestrationResult = await this.intentRouter.orchestrateWithTools(
        userInput,
        sessionContext.conversationHistory,
        sessionContext.currentAgent
      );
      
      // ✅ REACTIVACIÓN DE BULLETS: Ejecutar generación en paralelo para no bloquear el streaming
      // Se lanza un generador asíncrono "fire-and-forget" que emite eventos SSE mediante onBulletUpdate.
      if (onBulletUpdate) {
        try {
          const bulletContext: BulletGenerationContext = {
            userInput,
            // Usamos el historial de conversación ya gestionado por el orquestador
            sessionContext: externalConversationHistory && externalConversationHistory.length > 0
              ? externalConversationHistory
              : sessionContext.conversationHistory,
            selectedAgent: orchestrationResult.selectedAgent,
            // Para evitar latencia extra, no ejecutamos extracción adicional aquí
            extractedEntities: [],
            clinicalContext: {
              patientId,
              patientSummary,
              sessionType: sessionType || 'general'
            },
            orchestrationReasoning: orchestrationResult.reasoning,
            agentConfidence: orchestrationResult.confidence,
            contextualTools: orchestrationResult.contextualTools as any[]
          };

          // Lanzar en paralelo con pequeño stagger para evitar 429 por llamadas concurrentes a Vertex AI
          (async () => {
            try {
              // ⏳ Stagger: esperar a que el intent router libere su cuota antes de lanzar bullets
              await new Promise(resolve => setTimeout(resolve, 150));
              for await (const _ of this.generateReasoningBullets(bulletContext, onBulletUpdate)) {
                // La emisión ya ocurre dentro del generador; aquí no hacemos nada adicional
              }
            } catch (bulletErr) {
              this.log('warn', `Generación de bullets falló: ${bulletErr}`);
            }
          })();

          this.log('info', `🧷 Generación de bullets lanzada en paralelo (no bloquea streaming)`);
        } catch (bulletSetupErr) {
          this.log('warn', `No se pudieron preparar bullets: ${bulletSetupErr}`);
        }
      }
      
      // 4. Optimizar selección de herramientas
      const optimizedTools = await this.optimizeToolSelection(
        orchestrationResult.contextualTools,
        sessionContext
      );
      
      // 5. Actualizar contexto de sesión
      await this.updateSessionContext(
        sessionContext,
        orchestrationResult.selectedAgent,
        optimizedTools
      );
      
      // 6. Generar recomendaciones (optimizado para performance)
      let recommendations: DynamicOrchestrationResult['recommendations'] = undefined;
      
      if (this.config.enableRecommendations) {
        if (this.config.asyncRecommendations) {
          // 🚀 OPTIMIZACIÓN: Recomendaciones asíncronas (no bloquean respuesta)
          this.generateRecommendations(orchestrationResult, sessionContext)
            .then(rec => {
              if (rec) {
                this.cacheRecommendations(sessionId, rec);
                this.log('info', `📊 Async recommendations generated for session ${sessionId}`);
              }
            })
            .catch(error => this.log('warn', `Error generating async recommendations: ${error}`));
          
          // Usar recomendaciones cacheadas si existen
          recommendations = this.getCachedRecommendations(sessionId);
        } else {
          // Modo síncrono tradicional
          recommendations = await this.generateRecommendations(orchestrationResult, sessionContext);
        }
      }
      
      // Registrar cambio de agente si es diferente al anterior
      if (sessionContext.currentAgent && sessionContext.currentAgent !== orchestrationResult.selectedAgent) {
        this.metricsTracker.trackAgentSwitch({
          userId,
          sessionId,
          fromAgent: sessionContext.currentAgent as any,
          toAgent: orchestrationResult.selectedAgent as any,
          switchType: 'automatic',
          confidence: orchestrationResult.confidence
        });
      }
      
      // El tiempo de respuesta del orquestador se registra en el API layer
      // para mantener consistencia en las métricas
      
      const result: DynamicOrchestrationResult = {
        success: true,
        selectedAgent: orchestrationResult.selectedAgent,
        contextualTools: optimizedTools,
        toolMetadata: orchestrationResult.toolMetadata,
        sessionContext,
        confidence: orchestrationResult.confidence,
        reasoning: orchestrationResult.reasoning,
        recommendations
      };
      
      this.log('info', `Orquestación completada: ${orchestrationResult.selectedAgent} con ${optimizedTools.length} herramientas`);
      
      return result;
      
    } catch (error) {
      this.log('error', `Error en orquestación: ${error}`);
      return this.createErrorResult(sessionId, userId, error as Error);
    }
  }

  /**
   * Genera bullets progresivos de razonamiento en tiempo real
   */
  async *generateReasoningBullets(
    context: BulletGenerationContext,
    onBulletUpdate?: (bullet: ReasoningBullet) => void
  ): AsyncGenerator<ReasoningBullet, void, unknown> {
    const startTime = Date.now();
    let bulletCounter = 0;
    
    try {
      this.log('info', `Generando bullets progresivos para sesión ${context.sessionContext.length > 0 ? 'con contexto' : 'nueva'}`);
      
      // Construir prompt contextual para generar bullets progresivos
      const instructionHeader = `Eres el sistema de razonamiento progresivo de HopeAI, especializado en generar bullets que reflejen AUTÉNTICAMENTE el proceso de pensamiento del agente seleccionado.

Tu tarea es crear bullets que muestren cómo el agente específico está procesando la consulta según su metodología particular.

⚠️ ROLES CRÍTICOS - NO CONFUNDIR:
- El USUARIO es el PSICÓLOGO/PROFESIONAL CLÍNICO que usa HopeAI
- El PACIENTE es la persona sobre la cual el psicólogo está consultando
- Los bullets reflejan cómo el agente ayuda al PSICÓLOGO a pensar sobre su PACIENTE
- NUNCA asumas que el usuario ES el paciente

PRINCIPIOS CRÍTICOS:
1) Usa el razonamiento de selección proporcionado como base fundamental
2) Refleja la metodología específica del agente seleccionado
3) Incorpora las herramientas contextuales disponibles
4) Muestra progresión lógica hacia la respuesta del agente
5) Sé específico al caso, nunca genérico
6) Ancla CADA bullet explícitamente al contexto reciente provisto (usuario y modelo); si falta base, omite ese bullet
7) **CRÍTICO**: Si se proporciona información del paciente (ficha clínica, historial), intégrala como contexto del CASO que el psicólogo está consultando, no como información del usuario.

ESTILO (MODO PENSAMIENTO):
- Tono exploratorio y tentativo: usa expresiones como "me pregunto si", "podría", "parece que", "quizás".
- Evita lenguaje de acción/decisión o compromisos: no uses "voy a", "haré", "debemos", "mi objetivo es", "te recomiendo".
- No des órdenes ni recomendaciones; no hables directamente al usuario.
- Prefiere observaciones e hipótesis sobre planes: prioriza "observando", "notando", "considerando", "hipotetizando".
- Frases breves y completas (idealmente 8–18 palabras), sin cortar al final.
- **CONTEXTO DEL PACIENTE**: Cuando hay ficha clínica, refiérete al paciente en tercera persona (ej: "considerando el historial de ansiedad del paciente", "notando que el paciente presenta...").

FORMATO: Genera exactamente 4-6 bullets, uno por línea, comenzando con "• ".
`;
      const bulletPrompt = instructionHeader + this.buildBulletGenerationPrompt(context);
      
      // Crear chat para generar bullets progresivos coherentes con el agente (usar prompt contextual, no sólo systemInstruction)
      const bulletChat = ai.chats.create({
        model: 'gemini-3.1-flash-lite-preview',
        config: {
          temperature: 0.6,
          maxOutputTokens: 600,
          topP: 0.8
        }
      });
      
      // Generar bullets usando streaming
      const bulletStream = await bulletChat.sendMessageStream({ message: bulletPrompt });

      // Parser robusto basado en marcadores: detecta encabezados '## ' y bullets '• '
      let buffer = '';
      let currentStart = -1; // índice del inicio del bullet actual en buffer
      const emittedHeadings = new Set<string>();

      for await (const chunk of bulletStream) {
        if (!chunk.text) continue;
        buffer += chunk.text;

        // Emitir encabezados '## Título' que aparezcan completos en el buffer
        while (true) {
          const hIdx = buffer.indexOf('\n## ');
          if (hIdx === -1) break;
          const after = buffer.indexOf('\n', hIdx + 1);
          if (after === -1) break; // esperar a tener la línea completa
          const line = buffer.slice(hIdx + 1, after).trim(); // '## Título'
          const heading = line.replace(/^##\s+/, '').trim();
          if (heading && !emittedHeadings.has(heading)) {
            emittedHeadings.add(heading);
            const sep: ReasoningBullet = {
              id: `sep_${Date.now()}_${emittedHeadings.size}`,
              content: heading,
              status: 'completed',
              timestamp: new Date(),
              order: emittedHeadings.size,
              type: 'separator'
            } as any;
            if (onBulletUpdate) onBulletUpdate(sep);
            yield sep;
          }
          // Recortar buffer antes del heading procesado para evitar reprocesarlo
          buffer = buffer.slice(after);
        }

        // Procesar todos los marcadores de bullets presentes en el buffer
        let idx = 0;
        while (true) {
          const markerIndex = buffer.indexOf('• ', idx);
          if (markerIndex === -1) break;

          if (currentStart === -1) {
            // Comienza un nuevo bullet
            currentStart = markerIndex;
            idx = markerIndex + 2;
          } else {
            // Tenemos inicio anterior y aparece uno nuevo: emitir el bullet previo
            const rawBullet = buffer.slice(currentStart, markerIndex);
            {
              const cleaned = rawBullet.replace(/^•\s?/, '').replace(/\s+/g, ' ').trim();
              if (cleaned.length > 0) {
                bulletCounter++;
                const bullet: ReasoningBullet = {
                  id: `bullet_${Date.now()}_${bulletCounter}`,
                  content: cleaned,
                  status: 'completed',
                  timestamp: new Date(),
                  order: bulletCounter
                };
                if (onBulletUpdate) onBulletUpdate(bullet);
                yield bullet;
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
            currentStart = markerIndex;
            idx = markerIndex + 2;
          }
        }

        // Para evitar que el buffer crezca indefinidamente, recortar la parte procesada
        // Si tenemos un inicio actual, mantener desde currentStart; si no, mantener últimos 1000 chars
        if (currentStart > 0) {
          buffer = buffer.slice(currentStart);
          currentStart = 0; // ajustado al nuevo buffer
        } else if (currentStart === -1 && buffer.length > 2000) {
          buffer = buffer.slice(-1000);
        }
      }

      // Emitir el último bullet si quedó abierto al finalizar el stream
      if (currentStart !== -1) {
        const rawBullet = buffer.slice(currentStart);
        const cleaned = rawBullet.replace(/^•\s?/, '').replace(/\s+/g, ' ').trim();
        if (cleaned.length > 0) {
          bulletCounter++;
          const bullet: ReasoningBullet = {
            id: `bullet_${Date.now()}_${bulletCounter}`,
            content: cleaned,
            status: 'completed',
            timestamp: new Date(),
            order: bulletCounter
          };
          if (onBulletUpdate) onBulletUpdate(bullet);
          yield bullet;
        }
      }
      
      const processingTime = Date.now() - startTime;
      this.log('info', `Bullets progresivos generados: ${bulletCounter} bullets en ${processingTime}ms`);
      
    } catch (error) {
      this.log('error', `Error generando bullets progresivos: ${error}`);
      
      // Generar bullet de error
      const errorBullet: ReasoningBullet = {
        id: `bullet_error_${Date.now()}`,
        content: 'Procesando consulta...',
        status: 'error',
        timestamp: new Date(),
        order: 1
      };
      
      if (onBulletUpdate) {
        onBulletUpdate(errorBullet);
      }
      
      yield errorBullet;
    }
  }
  
  /**
   * Construye el prompt para generar bullets contextuales
   */
  private buildBulletGenerationPrompt(context: BulletGenerationContext): string {
    const { 
      userInput, 
      sessionContext, 
      selectedAgent, 
      extractedEntities, 
      clinicalContext,
      orchestrationReasoning,
      agentConfidence,
      contextualTools
    } = context;
    
    let prompt = `Consulta del usuario: "${userInput}"\n\n`;
    
    // Añadir contexto de sesión si existe
    if (sessionContext && sessionContext.length > 0) {
      const recentMessages = sessionContext.slice(-6);
      prompt += `Contexto de conversación reciente:\n`;
      recentMessages.forEach((msg: any, index) => {
        prompt += `${index + 1}. ${msg.role}: ${msg.parts?.[0]?.text || msg.content || 'Sin contenido'}\n`;
      });
      prompt += `\n`;
    }
    
    // MEJORA CRÍTICA: Incluir el razonamiento real del orquestador
    prompt += `Agente especializado seleccionado: ${selectedAgent}\n`;
    if (orchestrationReasoning) {
      prompt += `Razonamiento de selección: ${orchestrationReasoning}\n`;
    }
    if (agentConfidence) {
      prompt += `Confianza en la selección: ${(agentConfidence * 100).toFixed(1)}%\n`;
    }
    prompt += `\n`;
    
    // Añadir herramientas contextuales si existen
    if (contextualTools && contextualTools.length > 0) {
      prompt += `Herramientas clínicas disponibles: ${contextualTools.map((tool: any) => tool.name).join(', ')}\n\n`;
    }
    
    // Añadir entidades extraídas si existen
    if (extractedEntities && extractedEntities.length > 0) {
      prompt += `Entidades clínicas detectadas: ${extractedEntities.map((e: any) => e.text || e.name).join(', ')}\n\n`;
    }
    
    // CRÍTICO: Añadir contexto clínico del paciente de forma PROMINENTE
    if (clinicalContext && (clinicalContext.patientId || clinicalContext.patientSummary)) {
      prompt += `\n═══════════════════════════════════════════════════════════════\n`;
      prompt += `🏥 FICHA CLÍNICA DEL PACIENTE (CASO BAJO SUPERVISIÓN)\n`;
      prompt += `═══════════════════════════════════════════════════════════════\n\n`;
      prompt += `⚠️ IMPORTANTE: Esta es información del PACIENTE del psicólogo, NO del psicólogo mismo.\n`;
      prompt += `El psicólogo está consultando sobre este caso clínico.\n\n`;
      
      if (clinicalContext.patientId) {
        prompt += `ID del Paciente: ${clinicalContext.patientId}\n\n`;
      }
      
      if (clinicalContext.patientSummary) {
        // Incluir más del resumen del paciente (1500 caracteres en lugar de 800)
        prompt += `Información Clínica del Paciente:\n${clinicalContext.patientSummary.substring(0, 1500)}${clinicalContext.patientSummary.length > 1500 ? '...' : ''}\n\n`;
      }
      
      if (clinicalContext.sessionType) {
        prompt += `Tipo de sesión: ${clinicalContext.sessionType}\n\n`;
      }
      
      prompt += `INSTRUCCIÓN EXPLÍCITA: Los bullets DEBEN reflejar cómo el agente ayuda al PSICÓLOGO a pensar sobre este CASO.\n`;
      prompt += `- Usa tercera persona para el paciente: "considerando que el paciente presenta...", "notando que el paciente tiene historial de..."\n`;
      prompt += `- Los bullets son el proceso de pensamiento del agente AL SERVICIO del psicólogo\n`;
      prompt += `- Integra la ficha clínica como contexto del caso bajo análisis\n`;
      prompt += `═══════════════════════════════════════════════════════════════\n\n`;
    }
    
    // MEJORA CRÍTICA: Prompts específicos por agente que reflejen su metodología
    prompt += this.getAgentSpecificBulletInstructions(selectedAgent);
    
    // Aclaración de rol: Los bullets son "pensamientos internos" del agente seleccionado
    prompt += `\nNOTA DE ROL: Los bullets representan el pensamiento interno del agente (${selectedAgent}). No deben confundirse con la respuesta al usuario. Deben ser breves, concretos y siempre anclados a los mensajes recientes.`;
    
    return prompt;
  }
  
  /**
   * Genera instrucciones específicas para bullets según el agente seleccionado
   */
  private getAgentSpecificBulletInstructions(selectedAgent: string): string {
    const agentInstructions = {
      'socratico': `Como Supervisor Clínico de HopeAI, genera bullets que reflejen tu proceso de razonamiento socrático AL SERVICIO del psicólogo:
• Muestra cómo identificas patrones en la consulta del psicólogo
• Refleja tu proceso de formulación de preguntas reflexivas que ayuden al psicólogo
• Indica cómo evalúas la profundidad del análisis clínico requerido
• Demuestra tu análisis del caso que el psicólogo presenta
• Muestra cómo preparas insights que ayuden al psicólogo en su práctica
• **Si hay ficha del paciente**: Integra características del CASO (tercera persona) en tu razonamiento para ayudar al psicólogo

Ejemplo de bullets socráticos (SIN contexto de paciente):
• Identificando patrones en cómo el psicólogo describe su consulta
• Evaluando qué preguntas reflexivas podrían profundizar el análisis
• Formulando hipótesis sobre la dirección de la exploración clínica

Ejemplo de bullets socráticos (CON ficha de paciente):
• Considerando cómo el historial de ansiedad del paciente informa este caso
• Notando que los síntomas descritos resuenan con el perfil clínico del paciente
• Evaluando qué aspectos de la ficha son más relevantes para esta consulta`,
      
      'clinico': `Como Especialista en Documentación de HopeAI, genera bullets que reflejen tu proceso de síntesis documental AL SERVICIO del psicólogo:
• Muestra cómo analizas la información que el psicólogo proporciona
• Refleja tu proceso de identificación de elementos clínicamente relevantes del caso
• Indica cómo organizas la información según estándares profesionales
• Demuestra tu evaluación de completitud y coherencia documental del caso
• Muestra cómo preparas la síntesis para el expediente clínico
• **Si hay ficha del paciente**: Relaciona la nueva información con el historial existente del CASO y evalúa cómo actualizar la ficha

Ejemplo de bullets clínicos (SIN contexto de paciente):
• Analizando elementos clave para documentación estructurada
• Identificando información clínicamente relevante para el expediente
• Organizando datos según formato SOAP/PIRP apropiado

Ejemplo de bullets clínicos (CON ficha de paciente):
• Evaluando cómo esta nueva información complementa el expediente del paciente
• Considerando qué secciones de la ficha clínica requieren actualización
• Identificando patrones evolutivos en el caso al comparar con registros previos`,
      
      'academico': `Como Investigador Académico de HopeAI, genera bullets que reflejen tu proceso de validación científica AL SERVICIO del psicólogo:
• Muestra cómo identificas conceptos en la consulta que requieren validación empírica
• Refleja tu proceso de formulación de consultas de búsqueda específicas
• Indica cómo evalúas qué evidencia científica sería más útil para el psicólogo
• Demuestra tu análisis de la calidad metodológica de la evidencia
• Muestra cómo preparas la síntesis de evidencia para el caso clínico
• **Si hay ficha del paciente**: Considera características del CASO (edad, diagnóstico, tratamiento) al buscar evidencia aplicable

Ejemplo de bullets académicos (SIN contexto de paciente):
• Identificando conceptos clave que requieren validación científica
• Formulando estrategias de búsqueda en bases de datos especializadas
• Evaluando relevancia de estudios para la consulta del psicólogo

Ejemplo de bullets académicos (CON ficha de paciente):
• Considerando que el paciente es adulto joven con TAG al buscar evidencia
• Buscando estudios sobre intervenciones efectivas para el perfil del paciente
• Evaluando si la evidencia disponible se ajusta a las características del caso`,
      
      'orquestador': `Como Orquestador Dinámico de HopeAI, genera bullets que reflejen tu proceso de coordinación inteligente:
• Muestra cómo analizas la consulta para determinar el especialista óptimo
• Refleja tu evaluación de la complejidad y naturaleza de la solicitud
• Indica cómo consideras el contexto de sesión para la selección
• Demuestra tu proceso de optimización de herramientas contextuales
• Muestra cómo preparas la transición fluida al especialista seleccionado

Ejemplo de bullets de orquestación:
• Analizando naturaleza de la consulta para selección óptima de especialista
• Evaluando contexto de sesión y historial para continuidad terapéutica
• Optimizando herramientas clínicas según dominio detectado
• Preparando transición fluida al especialista más apropiado`
    };
    
    return agentInstructions[selectedAgent as keyof typeof agentInstructions] || agentInstructions['socratico'];
  }
  
  /**
   * Obtiene o crea una nueva sesión
   */
  private async getOrCreateSession(sessionId: string, userId: string): Promise<SessionContext> {
    let session = this.activeSessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId,
        conversationHistory: [],
        activeTools: [],
        sessionMetadata: {
          startTime: new Date(),
          totalInteractions: 0,
          dominantTopics: []
        }
      };
      
      this.activeSessions.set(sessionId, session);
      this.log('debug', `Nueva sesión creada: ${sessionId}`);
    }
    
    return session;
  }

  /**
   * Actualiza el historial de conversación
   */
  private updateConversationHistory(session: SessionContext, userInput: string, sessionFiles?: ClinicalFile[]): void {
    // ARCHITECTURAL FIX: Enrich user input with file attachment context for orchestration
    let enrichedUserInput = userInput;
    
    if (sessionFiles && sessionFiles.length > 0) {
      const fileNames = sessionFiles.map(f => f.name).join(', ');
      enrichedUserInput = `${userInput}

**CONTEXTO PARA ORQUESTACIÓN:** El usuario ha adjuntado ${sessionFiles.length} archivo(s): ${fileNames}. Esta información debe considerarse al seleccionar el agente y herramientas apropiados.`;
      
      console.log(`[DynamicOrchestrator] Context enriched with ${sessionFiles.length} files:`, fileNames);
    }
    
    session.conversationHistory.push({
      role: 'user',
      parts: [{ text: enrichedUserInput }]
    });
    
    session.sessionMetadata.totalInteractions++;
    
    // Mantener solo los últimos 20 intercambios para eficiencia
    if (session.conversationHistory.length > 40) {
      session.conversationHistory = session.conversationHistory.slice(-40);
    }
  }

  /**
   * Optimiza la selección de herramientas basada en el contexto de sesión
   */
  private async optimizeToolSelection(
    tools: FunctionDeclaration[],
    session: SessionContext
  ): Promise<FunctionDeclaration[]> {
    // Limitar número de herramientas según configuración
    let optimizedTools = tools.slice(0, this.config.maxToolsPerSession);
    
    // Si hay herramientas activas, priorizar continuidad
    if (session.activeTools.length > 0) {
      const continuityTools = session.activeTools.filter(activeTool =>
        tools.some(newTool => newTool.name === activeTool.name)
      );
      
      // Combinar herramientas de continuidad con nuevas
      const newTools = tools.filter(tool =>
        !session.activeTools.some(activeTool => activeTool.name === tool.name)
      );
      
      optimizedTools = [...continuityTools, ...newTools].slice(0, this.config.maxToolsPerSession);
    }
    
    return optimizedTools;
  }

  /**
   * Actualiza el contexto de sesión después de la orquestación
   */
  private async updateSessionContext(
    session: SessionContext,
    selectedAgent: string,
    tools: FunctionDeclaration[]
  ): Promise<void> {
    session.currentAgent = selectedAgent;
    session.activeTools = tools;
    
    // Actualizar tópicos dominantes
    await this.updateDominantTopics(session);
  }

  /**
   * Actualiza los tópicos dominantes de la sesión (con optimización de frecuencia)
   */
  private async updateDominantTopics(session: SessionContext): Promise<void> {
    if (session.conversationHistory.length < 2) return;
    
    // 🚀 OPTIMIZACIÓN: Solo actualizar cada N interacciones
    const shouldUpdate = session.sessionMetadata.totalInteractions % (this.config.dominantTopicsUpdateInterval || 5) === 0;
    if (!shouldUpdate) {
      this.log('debug', `Skipping dominant topics update (interval: ${this.config.dominantTopicsUpdateInterval})`);
      return;
    }
    
    try {
      const recentMessages = session.conversationHistory.slice(-6);
      const conversationText = recentMessages
        .map(msg => msg.parts?.map(part => 'text' in part ? part.text : '').join(' '))
        .join(' ');
      
      // Extraer entidades para identificar tópicos
      const entityResult = await this.entityExtractor.extractEntities(conversationText);
      
      const topics = entityResult.entities
        .filter(entity => entity.confidence > 0.7)
        .map(entity => entity.value)
        .slice(0, 5);
      
      session.sessionMetadata.dominantTopics = Array.from(new Set([
        ...topics,
        ...session.sessionMetadata.dominantTopics
      ])).slice(0, 10);
      
      this.log('debug', `Updated dominant topics: ${topics.length} new topics identified`);
      
    } catch (error) {
      this.log('warn', `Error actualizando tópicos dominantes: ${error}`);
    }
  }

  /**
   * Cachea recomendaciones para uso futuro
   */
  private cacheRecommendations(sessionId: string, recommendations: DynamicOrchestrationResult['recommendations']): void {
    this.recommendationsCache.set(sessionId, recommendations);
    
         // Limpiar cache antiguo (máximo 50 sesiones)
     if (this.recommendationsCache.size > 50) {
       const oldestKey = this.recommendationsCache.keys().next().value;
       if (oldestKey) {
         this.recommendationsCache.delete(oldestKey);
       }
     }
  }

  /**
   * Obtiene recomendaciones cacheadas
   */
  private getCachedRecommendations(sessionId: string): DynamicOrchestrationResult['recommendations'] {
    return this.recommendationsCache.get(sessionId);
  }

  /**
   * Genera recomendaciones basadas en el contexto y preferencias del usuario
   */
  private async generateRecommendations(
    orchestrationResult: OrchestrationResult,
    session: SessionContext
  ): Promise<DynamicOrchestrationResult['recommendations']> {
    try {
      // 🧠 Obtener recomendaciones personalizadas basadas en historial del usuario
      const personalizedRecs = await this.userPreferencesManager.getPersonalizedRecommendations(
        session.userId,
        {
          currentAgent: orchestrationResult.selectedAgent,
          recentTopics: session.sessionMetadata.dominantTopics,
          sessionLength: session.sessionMetadata.totalInteractions
        }
      );
      
      // Combinar recomendaciones personalizadas con análisis contextual de AI
      const contextPrompt = this.buildRecommendationPrompt(orchestrationResult, session, personalizedRecs);
      
      const result = await this.ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: contextPrompt
      });
      
      const aiRecommendations = this.parseRecommendations(result.text || '');
      
      // Fusionar recomendaciones personalizadas con las de AI
      const enhancedRecommendations = {
        suggestedFollowUp: aiRecommendations?.suggestedFollowUp || personalizedRecs.rationale,
        alternativeApproaches: [
          ...(aiRecommendations?.alternativeApproaches || []),
          ...personalizedRecs.suggestedTools.map((tool: string) => `Use ${tool} based on your successful past usage`)
        ].slice(0, 3),
                 clinicalConsiderations: [
           ...(aiRecommendations?.clinicalConsiderations || []),
           ...(personalizedRecs.suggestedAgent ? [`Consider switching to ${personalizedRecs.suggestedAgent} agent based on your preferences`] : [])
         ]
      };
      
      // 📊 Aprender de la interacción actual
      await this.learnFromInteraction(session, orchestrationResult, personalizedRecs);
      
      return enhancedRecommendations;
      
    } catch (error) {
      this.log('warn', `Error generando recomendaciones: ${error}`);
      return undefined;
    }
  }

  /**
   * Construye prompt para generar recomendaciones con contexto personalizado
   */
  private buildRecommendationPrompt(
    orchestrationResult: OrchestrationResult,
    session: SessionContext,
    personalizedRecs?: any
  ): string {
    const personalizationContext = personalizedRecs ? `
    
CONTEXTO PERSONALIZADO DEL USUARIO:
- Agente preferido: ${personalizedRecs.suggestedAgent || 'Ninguna preferencia específica'}
- Herramientas exitosas: ${personalizedRecs.suggestedTools.join(', ')}
- Contexto de preferencias: ${personalizedRecs.rationale}
- Confianza en personalización: ${(personalizedRecs.confidence * 100).toFixed(1)}%` : '';

    return `Como asistente especializado en psicología clínica, analiza el siguiente contexto y genera recomendaciones personalizadas:

CONTEXTO ACTUAL:
Agente seleccionado: ${orchestrationResult.selectedAgent}
Herramientas disponibles: ${orchestrationResult.contextualTools.map(t => t.name).join(', ')}
Tópicos dominantes: ${session.sessionMetadata.dominantTopics.join(', ')}
Interacciones en sesión: ${session.sessionMetadata.totalInteractions}${personalizationContext}

Genera recomendaciones personalizadas en el siguiente formato JSON:
{
  "suggestedFollowUp": "Pregunta o acción sugerida basada en el historial y contexto actual",
  "alternativeApproaches": ["Enfoque alternativo 1", "Enfoque alternativo 2"],
  "clinicalConsiderations": ["Consideración clínica personalizada 1", "Consideración clínica personalizada 2"]
}`;
  }

  /**
   * Aprende de la interacción actual para mejorar futuras recomendaciones
   */
  private async learnFromInteraction(
    session: SessionContext,
    orchestrationResult: OrchestrationResult,
    personalizedRecs: any
  ): Promise<void> {
    try {
      // Registrar el uso de herramientas y agente como comportamiento positivo
      await this.userPreferencesManager.learnFromBehavior(
        session.userId,
        {
          action: `agent_selection_${orchestrationResult.selectedAgent}`,
          context: session.sessionMetadata.dominantTopics,
          outcome: 'positive', // Asumir positivo por ahora, en producción esto vendría del feedback del usuario
          agent: orchestrationResult.selectedAgent,
          tools: orchestrationResult.contextualTools.map(tool => tool.name || 'unknown_tool')
        }
      );
      
      // Incrementar métricas de sesión
      const userPrefs = await this.userPreferencesManager.getUserPreferences(session.userId);
      await this.userPreferencesManager.updatePreferences(session.userId, {
        sessionMetrics: {
          ...userPrefs.sessionMetrics,
          totalSessions: userPrefs.sessionMetrics.totalSessions + 1,
          averageSessionLength: Math.round(
            (userPrefs.sessionMetrics.averageSessionLength * userPrefs.sessionMetrics.totalSessions + 
             session.sessionMetadata.totalInteractions) / 
            (userPrefs.sessionMetrics.totalSessions + 1)
          )
        }
      });
      
      this.log('info', `🎯 [DynamicOrchestrator] Cross-session learning completed for user: ${session.userId}`);
      
    } catch (error) {
      this.log('warn', `Error learning from interaction: ${error}`);
    }
  }

  /**
   * Parsea las recomendaciones del modelo
   */
  private parseRecommendations(text: string): DynamicOrchestrationResult['recommendations'] {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.log('warn', `Error parseando recomendaciones: ${error}`);
    }
    
    return {
      suggestedFollowUp: "Continúa explorando el tema actual",
      alternativeApproaches: ["Considera un enfoque diferente"],
      clinicalConsiderations: ["Mantén el foco terapéutico"]
    };
  }

  /**
   * Crea resultado de error
   */
  private createErrorResult(
    sessionId: string,
    userId: string,
    error: Error
  ): DynamicOrchestrationResult {
    const fallbackSession: SessionContext = {
      sessionId,
      userId,
      conversationHistory: [],
      activeTools: [],
      sessionMetadata: {
        startTime: new Date(),
        totalInteractions: 0,
        dominantTopics: []
      }
    };
    
    const basicTools = this.toolRegistry.getBasicTools();
    
    return {
      success: false,
      selectedAgent: 'socratico',
      contextualTools: basicTools.map(tool => tool.declaration),
      toolMetadata: basicTools,
      sessionContext: fallbackSession,
      confidence: 0.3,
      reasoning: `Error en orquestación: ${error.message}`,
      recommendations: {
        suggestedFollowUp: "Intenta reformular tu consulta",
        alternativeApproaches: ["Usa términos más específicos"],
        clinicalConsiderations: ["Verifica la conectividad del sistema"]
      }
    };
  }

  /**
   * Limpia sesiones expiradas
   */
  public cleanupExpiredSessions(): void {
    const now = new Date();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;
    
    for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
      const sessionAge = now.getTime() - session.sessionMetadata.startTime.getTime();
      
      if (sessionAge > timeoutMs) {
        this.activeSessions.delete(sessionId);
        this.log('debug', `Sesión expirada eliminada: ${sessionId}`);
      }
    }
  }

  /**
   * Obtiene estadísticas del orquestador
   */
  public getStats(): {
    activeSessions: number;
    totalTools: number;
    averageSessionLength: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const averageSessionLength = sessions.length > 0
      ? sessions.reduce((sum, session) => sum + session.sessionMetadata.totalInteractions, 0) / sessions.length
      : 0;
    
    return {
      activeSessions: this.activeSessions.size,
      totalTools: this.toolRegistry.getRegistryStats().totalTools,
      averageSessionLength
    };
  }

  /**
   * Actualiza la configuración del orquestador
   */
  public updateConfig(newConfig: Partial<DynamicOrchestratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.log('info', 'Configuración del orquestador actualizada');
  }

  /**
   * Get comprehensive user analytics and insights
   */
  public async getUserAnalytics(userId: string): Promise<{
    totalSessions: number;
    favoriteAgent: string;
    topTools: string[];
    learningTrends: string[];
    efficiency: number;
    sessionInsights: {
      averageLength: number;
      dominantTopics: string[];
      toolEffectiveness: { [key: string]: number };
    };
  }> {
    try {
      const userAnalytics = await this.userPreferencesManager.getUserAnalytics(userId);
      
      // Get additional insights from active session if exists
      const userSessions = Array.from(this.activeSessions.values())
        .filter(session => session.userId === userId);
      
      const currentSessionInsights = userSessions.length > 0 ? {
        currentTopics: userSessions[0].sessionMetadata.dominantTopics,
        currentAgent: userSessions[0].currentAgent,
        currentInteractions: userSessions[0].sessionMetadata.totalInteractions
      } : null;
      
      return {
        ...userAnalytics,
        sessionInsights: {
          averageLength: userAnalytics.totalSessions > 0 ? 
            userSessions.reduce((sum, s) => sum + s.sessionMetadata.totalInteractions, 0) / userSessions.length : 0,
          dominantTopics: userAnalytics.learningTrends,
          toolEffectiveness: userAnalytics.topTools.reduce((acc, tool, index) => {
            acc[tool] = Math.max(0.9 - (index * 0.1), 0.5); // Simulate effectiveness based on ranking
            return acc;
          }, {} as { [key: string]: number })
        }
      };
      
    } catch (error) {
      this.log('error', `Error getting user analytics for ${userId}: ${error}`);
      return {
        totalSessions: 0,
        favoriteAgent: 'socratico',
        topTools: [],
        learningTrends: [],
        efficiency: 0,
        sessionInsights: {
          averageLength: 0,
          dominantTopics: [],
          toolEffectiveness: {}
        }
      };
    }
  }

  /**
   * Logging interno
   */
  private log(level: DynamicOrchestratorConfig['logLevel'], message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logLevel];
    const messageLevel = levels[level];
    
    if (messageLevel >= configLevel) {
      console.log(`[DynamicOrchestrator:${level.toUpperCase()}] ${message}`);
    }
  }
}

/**
 * Factory function para crear el orquestador dinámico
 */
export function createDynamicOrchestrator(
  agentRouter: ClinicalAgentRouter,
  config?: Partial<DynamicOrchestratorConfig>
): DynamicOrchestrator {
  return new DynamicOrchestrator(agentRouter, config);
}

/**
 * Tipos exportados
 */
export type {
  SessionContext,
  DynamicOrchestrationResult,
  DynamicOrchestratorConfig
};