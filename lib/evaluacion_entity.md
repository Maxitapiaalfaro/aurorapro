# Evaluación Integral del Motor de Extracción de Entidades y su Rol en el Enrutamiento de HopeAI

## 1. Objetivo y Alcance

- **Propósito**: Entender cómo [EntityExtractionEngine](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:282:0-826:1) soporta la detección de intención y el enrutamiento entre agentes, alineado con la visión de HopeAI: ser el copiloto clínico indispensable, invisible y proactivo para psicólogos hispanohablantes.
- **Fuentes analizadas**:
  - [lib/entity-extraction-engine.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:0:0-0:0)
  - [lib/intelligent-intent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:0:0-0:0)
  - [lib/dynamic-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:0:0-0:0)
  - [lib/hopeai-system.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:0:0-0:0)
  - [lib/clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0)
  - [hooks/use-hopeai-system.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/hooks/use-hopeai-system.ts:0:0-0:0)
- **Resultado esperado**: Diagnóstico experto del flujo completo (detección → enrutamiento → respuesta) y propuesta de optimizaciones que aceleren y robustezcan el sistema sin comprometerlo.

## 2. Flujo Actual: Extracción e Intención

### 2.1 Motor de Entidades ([entity-extraction-engine.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:0:0-0:0))

- **Función central**: [EntityExtractionEngine.extractEntities()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:475:2-524:3) construye un prompt contextual, llama a Gemini 2.5 Flash Lite con `entityExtractionFunctions` y procesa `functionCalls`.
- **Esquema soporte**: `entityExtractionFunctions` (7 funciones) cubren dominios clínicos críticos (técnicas, diagnósticos, validación académica, exploración socrática, etc.).
- **Post-procesamiento**:
  - [processFunctionCalls()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:561:2-668:3) traduce resultados en [ExtractedEntity](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:16:0-22:1) con `synonymMaps`.
  - [classifyEntitiesByImportance()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:685:2-702:3) y [calculateOverallConfidence()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:704:2-709:3) asignan jerarquía y confianza.
  - [validateEntities()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:711:2-745:3) confronta con `knownEntities` y ampliaciones vía [addKnownEntity()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:769:2-778:3).
- **Limitaciones**:
  - Esquema fijo; extender dominios requiere modificar `entityExtractionFunctions`.
  - No cubre intenciones meta (saludos, onboarding); se enfocan en señal clínica.

### 2.2 Detección de Intención ([intelligent-intent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:0:0-0:0))

- **Desempeño clave**: [IntelligentIntentRouter.routeUserInput()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:300:2-510:3) ejecuta pipeline:
  1. Procesamiento de historial (`ContextWindowManager`).
  2. Detección de solicitudes explícitas de agente.
  3. Clasificación de intención ([classifyIntent()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:633:2-704:3); `intentFunctions`).
  4. Extracción semántica ([EntityExtractionEngine.extractEntities()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:475:2-524:3)).
  5. Cálculo de confianza combinada y routing con `clinicalAgentRouter`.
- **Optimización notable**: [orchestrateWithTools()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:247:2-298:3) usa [classifyIntentAndExtractEntities()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:528:4-631:5) para realizar intención+entidades en una única llamada (ahorro ~500 ms).
- **Uso de entidades**:
  - Señales complementarias: enriquecen [EnrichedContext](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:46:0-67:1) con [EntityExtractionResult](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:35:0-41:1).
  - Influencia en decisiones: suman confianza, habilitan tool selection y razonamiento explicado al psicólogo.
- **Umbrales y fallback**:
  - `confidenceThreshold` base 0.65 ajustado vía configuración ([HopeAISystem.initialize()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:53:2-95:3) lo eleva a 0.8 para producción).
  - Manejo gracioso de baja confianza: fallback a agente socrático con logging para revisión futura.

### 2.3 Orquestación avanzada ([dynamic-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:0:0-0:0))

- **Rol**: [DynamicOrchestrator.orchestrate()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:132:2-286:3) se sitúa antes de [HopeAISystem.sendMessage()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:187:2-723:3), re-utiliza [IntelligentIntentRouter](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:94:0-1416:1) para asegurar agente correcto y selecciona herramientas.
- **Uso de entidades**:
  - Re-aprovecha resultados del router en [optimizeToolSelection()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:680:2-705:3).
  - Alimenta [generateReasoningBullets()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:288:2-463:3) (bullets progresivos coherentes con agente elegido y contexto clínico).
- **Estrategia**:
  - [EntityExtractionEngine](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:282:0-826:1) invocado tanto desde router directo como orquestador, asegurando consistencia semántica.
  - Ajustes de performance: cache de recomendaciones, `toolContinuityThreshold`, etc.

### 2.4 Ejecución del enrutamiento ([hopeai-system.ts]

(cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:0:0-0:0) & [clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0))

- **Gateway** ([HopeAISystem.sendMessage()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:187:2-723:3)):
  - Gestiona sesiones, archivos, contexto paciente (`patient_summary`).
  - Invoca orquestación avanzada o routing estándar según configuración.
  - Actualiza `ChatState` persistente y dispara `trackAgentSwitch`.
- **Agentes** ([ClinicalAgentRouter](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:92:0-1393:1)):
  - Tres lentes integrados (Supervisor Clínico, Documentación, Académico) compartiendo `GLOBAL_BASE_INSTRUCTION`.
  - Respuestas estructuradas, anti-sesgo, continuidad narrativa; reforzadas con entidades detectadas.
- **Hook UI** ([use-hopeai-system.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/hooks/use-hopeai-system.ts:0:0-0:0)):
  - Interfaz con [HopeAISystemSingleton](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:1188:0-1312:1), maneja bullets, streaming y restauración de sesiones.

## 3. Evaluación crítica

### 3.1 Fortalezas

- **Coherencia clínica**: Entidades alineadas a la taxonomía DSM-5 y procesos terapéuticos reales; `synonymMaps` minimiza falsos negativos.
- **Latencia controlada**: Uso de llamada combinada en router y re-utilización de resultados evita repetición de inferencias.
- **Transparencia**: [EnrichedContext](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:46:0-67:1) y reasoning bullets exponen razonamiento al terapeuta, reforzando confianza en el copiloto.
- **Adaptabilidad**: [addKnownEntity()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:769:2-778:3) y configuración parcial via constructor permiten ajustes sin alterar lógica central.

### 3.2 Riesgos actuales

- **Rigidez de esquema**: Nuevos dominios (p. ej., onboarding, soporte operativo) requieren tocar `entityExtractionFunctions`; sin interfaz extensible se dificulta iterar.
- **Duplicidad potencial**: Orquestador y router instancian su propio [EntityExtractionEngine](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:282:0-826:1); riesgo de drift si configuraciones divergen.
- **Confianza combinada**: Boost contextual (hasta +0.15) podría sobredimensionar decisiones ante datos escasos si no se monitorea.
- **Cobertura meta-intenciones**: saludos, dudas sobre funcionamiento no pasan por entidades; depender exclusivamente de `intentFunctions` podría retrasar respuesta empática inicial.

## 4. Oportunidades de optimización (sin comprometer estabilidad)

- **Extensibilidad controlada**:
  - Diseñar un “registry” externo que permita inyectar `FunctionDeclaration` adicionales sin modificar [entity-extraction-engine.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:0:0-0:0).
  - Mantener distinción entre dominios clínicos y meta-intenciones para preservar foco terapéutico.

- **Unificación de extractores**:
  - Compartir instancia única configurable via DI para [IntelligentIntentRouter](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:94:0-1416:1) y [DynamicOrchestrator](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:93:0-1082:1), evitando divergencias (por ejemplo, en `confidenceThreshold` o vocabularios).

- **Monitoreo y afinado de confianza**:
  - Registrar métricas de `combinedConfidence` vs. outcome (aceptación del agente por el psicólogo). Permite calibrar boosts contextuales y detectar sobreajustes.

- **Cobertura meta-contextual**:
  - Evaluar creación de un módulo ligero (posiblemente en capa de intención) que detecte saludos/onboarding sin cargar el motor de entidades, manteniendo latencia baja y experiencia cálida.

- **Optimización de tool selection**:
  - Aprovechar `EntityExtractionResult.primaryEntities` para priorizar herramientas sin re-evaluar cada turno, reduciendo overhead en sesiones largas.

## 5. Propuesta Estratégica

1. **Diseñar Extensión Modular de Entidades**
   - Crear interfaz `EntityExtractionPlugin` (sin implementar aún) que permita registrar funciones adicionales.
   - Mantener núcleo clínico estático para seguridad; plugins podrían manejar meta-interacciones o especialidades futuras.

2. **Consolidar Configuración Centralizada**
   - Exponer factory [createEntityExtractionEngine(config)](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:828:0-831:1) ya existente, asegurando que router y orquestador reciban misma instancia (evitar instanciación interna directa).
   - Documentar parámetros críticos (umbral confianza, maxEntities) para ajustes coordinados.

3. **Fortalecer Observabilidad**
   - Instrumentar logs o métricas en [HopeAISystem](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:13:0-1178:1) y [IntelligentIntentRouter](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:94:0-1416:1) sobre:
     - Tiempo por pipeline (context window, intención, entidades, routing).
     - Distribución de entidades detectadas vs. agentes seleccionados.
   - Facilitar tuning iterativo sin tocar código central.

4. **Introducir Manejo Ligero de Meta-Intenciones**
   - Evaluar añadir `detectMetaInteraction()` previo a router que capture saludos, dudas operativas, integrándose con la visión de “copiloto silencioso”.
   - Mantener estas detecciones separadas del motor clínico para evitar ruido en `entityExtractionFunctions`.

5. **Plan de Validación Continua**
   - Establecer ciclos de revisión junto a psicólogos: auditar sesiones para confirmar que entidades respaldan la intención correcta y que la experiencia sigue siendo “indispensable y silenciosa”.
   - Ajustar listas de `knownEntities` y `synonymMaps` basadas en feedback real.

## 6. Conclusión

El flujo actual logra un balance sólido entre precisión clínica y velocidad, usando [EntityExtractionEngine](cci:2://file:///c:/Users/david/hopeai-copilot-v0/lib/entity-extraction-engine.ts:282:0-826:1) como columna vertebral del contexto semántico. Optimizar requiere preservar esa columna, ampliando capacidad de extensión, observabilidad y sensibilidad a meta-interacciones sin degradar latencia ni confiabilidad. La estrategia propuesta refuerza la visión de HopeAI como copiloto invisible y esencial para psicólogos, asegurando que cada decisión de enrutamiento se base en señales clínicas robustas y continúe minimizando la carga cognitiva del profesional
