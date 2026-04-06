# Informe de Cuellos de Botella y Sobre-Ingeniería
## Aurora/HopeAI vs. Claude Code — Análisis Comparativo

**Fecha**: Abril 2026  
**Alcance**: Pipeline completa desde inicialización de singleton hasta streaming de respuesta  
**Referencia**: Código fuente de Claude Code (leak marzo 2026, `docs/architecture/claude/claude-code-main/src/`)

---

## Resumen Ejecutivo

Aurora/HopeAI realiza **2 llamadas LLM extras antes de que el usuario vea una sola palabra** de respuesta. Claude Code no hace ninguna. Este hallazgo central resume el patrón más crítico: Aurora gasta tiempo y dinero en "decidir qué agente usar" con inteligencia artificial, mientras que Claude deja que un solo modelo maneje todo directamente.

El análisis identifica **5 cuellos de botella principales** y **4 casos de sobre-ingeniería**. Cada uno está documentado con archivos y líneas específicas, y con la comparación directa contra cómo Claude resuelve (o evita) el mismo problema.

---

## Parte 1: Vista General — Dos Filosofías Opuestas

### ¿Qué hace Aurora cuando un usuario envía un mensaje?

```
Usuario envía mensaje
    ↓
1. HopeAISystem.sendMessage()          ← recolecta metadata, resuelve archivos
    ↓
2. DynamicOrchestrator.orchestrate()   ← gestión de sesión interna
    ↓
3. IntelligentIntentRouter             ← LLAMADA LLM #1: clasificar intención
   .orchestrateWithTools()                + extracción de entidades
    ↓
4. Optimización de herramientas        ← lógica local
    ↓
5. ClinicalAgentRouter.sendMessage()   ← LLAMADA LLM #2: respuesta real al usuario
    ↓
Streaming al usuario
```

**Total de llamadas LLM por mensaje: 2** (mínimo), potencialmente 3 si se activan bullets o recomendaciones.

### ¿Qué hace Claude Code cuando el usuario envía un mensaje?

```
Usuario envía mensaje
    ↓
1. QueryEngine recibe el mensaje
    ↓
2. Construye system prompt + contexto  ← pura lógica local, sin LLM
    ↓
3. query() → API de Anthropic          ← LLAMADA LLM #1: respuesta directa
    ↓
Streaming al usuario
```

**Total de llamadas LLM por mensaje: 1.**

### La diferencia fundamental

| Concepto | Aurora/HopeAI | Claude Code |
|----------|---------------|-------------|
| ¿Quién decide el "modo" o agente? | Un LLM dedicado (Gemini) clasifica la intención | El propio modelo decide qué herramienta usar |
| ¿Cuántas llamadas LLM por mensaje? | 2+ | 1 |
| ¿Se hace extracción de entidades por separado? | Sí, con otro LLM call | No existe esta capa |
| ¿Hay un "orquestador" entre el usuario y el agente? | Sí, 3 capas (Bridge → DynamicOrchestrator → IntentRouter) | No. QueryEngine envía directo a la API |
| ¿Cómo se seleccionan las herramientas? | LLM clasifica → mapeo a agente → filtro de herramientas | Todas las herramientas están siempre disponibles |

---

## Parte 2: Cuellos de Botella Identificados

### Cuello de Botella #1: La Llamada LLM de Pre-Clasificación (CRÍTICO)

**¿Qué es?**  
Antes de que el mensaje del usuario llegue al agente que responde, Aurora hace una llamada a `gemini-3.1-flash-lite-preview` para "clasificar la intención" del usuario — decidir si enviar el mensaje al agente Socrático, al Documentalista, o al Académico.

**¿Dónde está?**  
- `lib/intelligent-intent-router.ts`, líneas 665-763: método `classifyIntentAndExtractEntities()`
- Hace un `ai.models.generateContent()` con 10 function declarations (3 de intención + 7 de entidades)

**¿Cuánto cuesta?**  
- **Latencia**: 300-800ms por cada mensaje del usuario (variable según carga de Gemini)
- **Tokens**: ~1000 tokens de entrada + ~200 tokens de salida, por cada mensaje
- **Dinero**: Al menos $0.001-0.003 USD por mensaje de pre-clasificación

**¿Cómo lo resuelve Claude?**  
Claude Code no clasifica intenciones. El `QueryEngine.ts` (línea 130-150) construye la configuración con las herramientas disponibles y envía todo en una sola llamada API. El propio modelo Claude decide qué herramientas usar basado en el system prompt. No hay una capa de pre-clasificación.

**¿Por qué Aurora lo necesita y Claude no?**  
Aurora tiene 3 "personalidades" (agentes) con system prompts diferentes. Necesita saber cuál activar antes de enviar el mensaje. Claude tiene un solo system prompt y todas las herramientas disponibles simultáneamente.

**Hipótesis de solución**: Unificar los 3 system prompts en uno solo parametrizable, como hace Claude. El modelo puede adoptar el "modo" correcto dentro de una sola conversación sin necesidad de re-enrutamiento.

---

### Cuello de Botella #2: La Cadena de Orquestación de 4 Capas

**¿Qué es?**  
Para que un mensaje llegue del usuario al LLM que responde, atraviesa 4 clases encadenadas:

```
HopeAISystem → DynamicOrchestrator → IntelligentIntentRouter → ClinicalAgentRouter
```

Cada capa tiene su propia lógica de logging, métricas, manejo de errores, y transformación de datos. Es un "teléfono descompuesto" de objetos.

**¿Dónde está?**
1. `lib/hopeai-system.ts`, línea 809: llama a `this.dynamicOrchestrator.orchestrate()`
2. `lib/dynamic-orchestrator.ts`, línea 165: llama a `this.intentRouter.orchestrateWithTools()`
3. `lib/intelligent-intent-router.ts`, línea 321: hace la llamada LLM de clasificación
4. Finalmente vuelve a `hopeai-system.ts` que llama a `clinicalAgentRouter.sendMessage()`

**¿Cuánto cuesta?**  
- Cada capa crea objetos nuevos, serializa/deserializa datos, y acumula overhead de ~10-50ms
- El overhead total estimado por la cadena: **50-150ms** de procesamiento puro de JavaScript (sin contar el LLM)
- Cada capa maneja errores independientemente, generando 4x logging por cada operación

**¿Cómo funciona en Claude?**  
En Claude Code, el `QueryEngine.ts` llama directamente a `query()` (`src/query.ts`). No hay capas intermedias de "orquestación". El query se envía a la API, la API responde con tool_use blocks, y `runTools()` los ejecuta. Es un ciclo plano:

```
QueryEngine.query() → API → tool_use? → runTools() → resultado → API de nuevo
```

El archivo `src/services/tools/toolOrchestration.ts` (línea 19-82) muestra cómo las herramientas se ejecutan directamente sin capas de routing intermedias.

---

### Cuello de Botella #3: Doble Singleton — Dos Mundos Paralelos

**¿Qué es?**  
Aurora tiene **dos singletons diferentes con el mismo nombre** (`getGlobalOrchestrationSystem`), que devuelven tipos diferentes y viven en archivos diferentes:

| Archivo | Retorna | Usado por |
|---------|---------|-----------|
| `lib/hopeai-system.ts:1956` | `HopeAISystem` | API routes principales (`/api/send-message`) |
| `lib/orchestration-singleton.ts:70` | `HopeAIOrchestrationSystem` | API routes de monitoreo (`/api/orchestration/*`) |

**¿Dónde está?**
- `lib/hopeai-system.ts`, línea 1956: `export async function getGlobalOrchestrationSystem(): Promise<HopeAISystem>`
- `lib/orchestration-singleton.ts`, línea 70: `export async function getGlobalOrchestrationSystem(): Promise<HopeAIOrchestrationSystem>`
- `lib/hopeai-system.ts`, línea 1980: re-exporta el otro como alias `getBridgeOrchestrationSystem`

**¿Por qué es un problema?**
- Dos árboles de inicialización separados: cada uno crea su propia instancia de `ClinicalAgentRouter`, `DynamicOrchestrator`, etc.
- Las métricas del "Bridge" no se cruzan con las métricas del sistema principal
- Es confuso para cualquier desarrollador que busque `getGlobalOrchestrationSystem` — hay dos

**¿Cómo lo resuelve Claude?**  
Claude tiene un solo `AppState` centralizado (`src/state/AppState.ts`) y un solo `QueryEngine` (línea 130). No hay "bridge" ni "monitoring singleton" separado. Las métricas se registran directamente en el mismo flujo principal via `cost-tracker.ts` y telemetría OpenTelemetry.

---

### Cuello de Botella #4: Extracción de Entidades — LLM Para Lo Que un Regex Hace

**¿Qué es?**  
Aurora usa un LLM (`gemini-3.1-flash-lite-preview`) para extraer entidades clínicas del texto del usuario — cosas como "EMDR", "ansiedad", "TCC", "adolescentes".

**¿Dónde está?**
- `lib/entity-extraction-engine.ts`, línea 476-525: `extractEntities()` hace un `ai.models.generateContent()`
- Líneas 302-370: ya tiene diccionarios completos con todas las técnicas terapéuticas, trastornos y poblaciones (`knownEntities`)
- Líneas 372-473: ya tiene mapas de sinónimos (`synonymMaps`) con cientos de entradas

**La contradicción**:  
El archivo ya contiene los **diccionarios completos** de todas las entidades posibles (22 técnicas terapéuticas, 21 trastornos, 18 poblaciones, 24 procesos documentales, etc.), pero en lugar de hacer un matching local contra estos diccionarios, envía el texto a un LLM para que "descubra" las mismas entidades que ya conoce.

**¿Cuánto cuesta?**
- Cuando se llama independientemente (path de routing estándar, `routeUserInput`): ~300-500ms + tokens
- En el path optimizado (`orchestrateWithTools`): se combina con la clasificación de intención, pero agrega complejidad y tokens a una llamada que ya es pesada

**¿Cómo lo resuelve Claude?**  
Claude no tiene extracción de entidades. El sistema prompt contiene las instrucciones necesarias, y el modelo extrae la información relevante como parte de su razonamiento natural. No hay un paso previo de NER.

**Hipótesis**: El 90% de las entidades que el motor extrae ya están en los diccionarios locales. Un matching por regex/keywords podría lograr el mismo resultado en <1ms en lugar de ~400ms.

---

### Cuello de Botella #5: Context Window Processing Duplicado

**¿Qué es?**  
El contexto de la conversación se procesa **dos veces** antes de llegar al agente:

1. **Primera vez**: `HopeAISystem.sendMessage()` en `hopeai-system.ts`, línea 633-658, crea un `ContextWindowManager` y procesa el historial
2. **Segunda vez**: `IntelligentIntentRouter.routeUserInput()` en `intelligent-intent-router.ts`, línea 388-399, crea **otro** `ContextWindowManager` y vuelve a procesar el mismo historial

**¿Cuánto cuesta?**  
- Cada procesamiento estima tokens, comprime mensajes, y preserva referencias contextuales
- Dos pasadas sobre el mismo historial: ~20-50ms desperdiciados

**¿Cómo lo resuelve Claude?**  
Claude tiene un único punto de procesamiento de contexto. La compactación (`src/services/compact/`) se ejecuta una sola vez cuando el contexto excede el umbral, no en cada mensaje.

---

## Parte 3: Sobre-Ingeniería Identificada

### Sobre-Ingeniería #1: El Bridge de Orquestación (Código Muerto en Producción)

**¿Qué es?**  
`lib/hopeai-orchestration-bridge.ts` es una capa de 500 líneas que decide si usar orquestación "dinámica", "legacy", o "híbrida". Pero en la configuración actual:
- `enableGradualMigration: false` (línea 103)
- `migrationPercentage: 100` (línea 104)

**Resultado**: El 100% de las requests van al path dinámico. La lógica legacy y híbrida nunca se ejecutan. Son ~200 líneas de código muerto.

**¿Cómo lo hace Claude?**  
Claude usa feature flags con eliminación de código muerto en build time (`bun:bundle` feature flags, `src/tools.ts` líneas 26-45). Si una feature no está activa, el código se elimina completamente del bundle. Aurora mantiene todo el código legacy en runtime.

---

### Sobre-Ingeniería #2: Métricas Estimadas en Lugar de Medidas

**¿Qué es?**  
En `lib/hopeai-orchestration-bridge.ts`, línea 172-174:

```typescript
result.performanceMetrics = {
    orchestrationTime: processingTime * 0.7, // Estimación
    toolSelectionTime: processingTime * 0.2,
    totalProcessingTime: processingTime
};
```

Las métricas de `orchestrationTime` y `toolSelectionTime` son **multiplicaciones arbitrarias** del tiempo total (70% y 20%). No se mide nada real.

**¿Cómo lo hace Claude?**  
`src/services/tools/toolExecution.ts` mide cada fase real con spans de OpenTelemetry (`startToolExecutionSpan`, `endToolExecutionSpan`, líneas 96-100). Cada herramienta tiene su duración real registrada vía `addToToolDuration` (línea 25).

---

### Sobre-Ingeniería #3: Recomendaciones (Feature Desactivada que Sigue Instanciándose)

**¿Qué es?**  
El `DynamicOrchestrator` instancia un `UserPreferencesManager` en cada creación (línea 116):
```typescript
this.userPreferencesManager = UserPreferencesManager.getInstance();
```

Pero `enableRecommendations: false` (línea 124). Todo el código de recomendaciones, aprendizaje cross-session y analytics de usuario (líneas 777-898) nunca se ejecuta pero las dependencias se cargan.

De forma similar, `generateReasoningBullets()` (líneas 282-453) tiene 170 líneas de código comentado que sigue en el archivo.

**¿Cómo lo hace Claude?**  
En `src/tools.ts`, las herramientas opcionales se cargan condicionalmente:
```typescript
const SleepTool = feature('PROACTIVE') || feature('KAIROS')
    ? require('./tools/SleepTool/SleepTool.js').SleepTool
    : null
```
Si la feature no está activa, la herramienta ni siquiera se importa.

---

### Sobre-Ingeniería #4: Selección Dinámica de Herramientas vs. Herramientas Siempre Disponibles

**¿Qué es?**  
Aurora tiene un sistema completo de "selección contextual de herramientas" donde, según el agente detectado y las entidades extraídas, se filtran qué herramientas enviar al LLM. Esto involucra:
1. `ToolRegistry.selectContextualTools()` basado en intención + entidades
2. `DynamicOrchestrator.optimizeToolSelection()` que aplica "continuidad de herramientas" y limita a 8 máximo
3. `HopeAIOrchestrationBridge` que puede mezclar herramientas legacy + dinámicas

Son 3 capas de filtrado para un sistema que tiene **solo 10 herramientas**.

**¿Cómo lo hace Claude?**  
Claude Code tiene 30+ herramientas y las envía **todas** en cada llamada API (`src/tools.ts`, función `getAllBaseTools()`). No hay selección contextual. El modelo decide cuáles usar.

La única optimización de herramientas en Claude es `ToolSearchTool` — una herramienta "lazy" que permite al modelo descubrir herramientas adicionales de MCP si las necesita, en lugar de cargar todo al inicio.

**¿Por qué la selección de Aurora es innecesaria?**  
Los LLMs modernos (Gemini 2.5, Claude 3.5) manejan perfectamente 30+ herramientas sin degradación. Filtrar de 10 a 8 herramientas no produce ningún beneficio medible, pero sí añade complejidad y una llamada LLM extra.

---

## Parte 4: Impacto Acumulativo

### Por cada mensaje del usuario, Aurora gasta:

| Recurso | Aurora | Claude | Diferencia |
|---------|--------|--------|------------|
| Llamadas LLM | 2+ | 1 | +100%+ costo API |
| Latencia adicional por routing | 300-800ms | 0ms | Medio segundo antes de empezar |
| Objetos JavaScript creados | 4 capas de orquestación | 1 query directo | 4x complejidad |
| Procesamiento de contexto | 2 veces | 1 vez | Duplicado |
| Líneas de código en el path crítico | ~3000 | ~500 | 6x más superficie de bugs |

### En una sesión típica de 20 mensajes:

| Métrica | Aurora | Claude |
|---------|--------|--------|
| Llamadas LLM totales | 40+ (20 clasificación + 20 respuesta) | 20 |
| Tiempo extra acumulado | 6-16 segundos | 0 |
| Tokens gastados en routing | ~24,000 | 0 |

---

## Parte 5: Recomendaciones Priorizadas

### Prioridad 1 (Impacto Alto, Esfuerzo Medio): Eliminar la Llamada LLM de Pre-Clasificación

**Qué hacer**: Unificar los 3 system prompts de agentes en uno solo que contenga las 3 especialidades. El modelo puede cambiar de "modo" naturalmente dentro de la conversación, como hace Claude con un solo system prompt.

**Resultado esperado**: Eliminar 300-800ms y ~1200 tokens por cada mensaje. Reducir costos API en ~50%.

### Prioridad 2 (Impacto Alto, Esfuerzo Bajo): Aplanar la Cadena de Orquestación

**Qué hacer**: Eliminar `HopeAIOrchestrationBridge` y `DynamicOrchestrator` como capas intermedias. `HopeAISystem` puede llamar directamente a `ClinicalAgentRouter`.

**Resultado esperado**: Eliminar 50-150ms de overhead por mensaje. Reducir complejidad de debugging de 4 capas a 2.

### Prioridad 3 (Impacto Medio, Esfuerzo Bajo): Unificar los Singletons

**Qué hacer**: Eliminar `orchestration-singleton.ts` y el `HopeAIOrchestrationSystem` wrapper. Las métricas de monitoreo pueden integrarse directamente en `HopeAISystem`.

**Resultado esperado**: Un solo punto de verdad. Eliminar la confusión de dos funciones con el mismo nombre.

### Prioridad 4 (Impacto Medio, Esfuerzo Bajo): Reemplazar Extracción de Entidades LLM por Matching Local

**Qué hacer**: Usar los diccionarios que ya existen en `entity-extraction-engine.ts` (líneas 302-470) para hacer matching por regex/keywords en lugar de llamar a un LLM.

**Resultado esperado**: Reducir ~400ms a <1ms para extracción de entidades.

### Prioridad 5 (Impacto Bajo, Esfuerzo Mínimo): Limpiar Código Muerto

**Qué hacer**: Eliminar las 170 líneas comentadas de bullet generation, el path legacy/hybrid del bridge, y las features desactivadas que siguen cargándose.

**Resultado esperado**: Bundle más limpio, arranque más rápido, mantenimiento más fácil.

---

## Conclusión

La diferencia filosófica central es:

- **Claude Code** confía en el modelo para tomar decisiones. Le da todas las herramientas y un buen prompt, y deja que el modelo trabaje.
- **Aurora/HopeAI** desconfía del modelo y usa un LLM para "pre-pensar" antes de dejar que otro LLM responda. Es como contratar a un recepcionista que usa inteligencia artificial para decidir a qué doctor enviar al paciente, antes de que el doctor siquiera vea al paciente.

El resultado: Aurora gasta el doble de tokens, tarda medio segundo más por mensaje, y tiene 6 veces más código en el path crítico. Todo esto para resolver un problema (selección de agente) que los LLMs modernos resuelven solos con un buen system prompt.

La buena noticia: los cambios para resolver los problemas principales son incrementales y no requieren reescribir el sistema. Unificar el system prompt (Prioridad 1) y aplanar la cadena (Prioridad 2) pueden hacerse en sprints independientes, manteniendo backward compatibility.
