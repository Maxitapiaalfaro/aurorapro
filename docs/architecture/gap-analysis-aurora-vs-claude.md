# Análisis de Brechas: Aurora vs. Claude Code

> **Documento técnico de comparación arquitectónica**
> Fecha: 2026-04-04
> Versión: 1.0
> Base de análisis: Código fuente de Aurora (repositorio actual) y código fuente de referencia de Claude Code (en `docs/architecture/claude/claude-code-main`).

> **Estado actualizado (2026-04-06):**
> - **5 recomendaciones YA IMPLEMENTADAS** (3 descubiertas en auditoría, 2 completadas hoy):
>   - **P0.1 (Permisos de herramientas):** `lib/security/tool-permissions.ts` + `checkToolPermission()` integrado en `clinical-agent-router.ts`. Herramientas tienen `securityCategory` en metadata.
>   - **P0.2 (PII en logs):** COMPLETADO. `lib/logger.ts` ahora tiene `PHI_REDACTION_PATTERNS` (RUT, SSN, email, teléfono, DOB, dirección, nombres de pacientes). `redactPHI()` aplica en TODOS los entornos. `beforeBreadcrumb` + `beforeSend` con redacción PHI en los 3 configs Sentry (server, edge, client). Console.log de alto riesgo PII corregidos en 6 archivos.
>   - **P1.1 (Compactación reactiva):** `lib/context-window-manager.ts` tiene `compactReactively()` + `isContextExhaustedError()`, integrado en `clinical-agent-router.ts`.
>   - **P1.2 (Límite concurrencia):** `lib/utils/tool-orchestrator.ts` implementa `executeToolsSafely()` con `maxConcurrent: 3`, particionamiento read/write.
>   - **P2.1 (Memoria inter-sesión):** FUNDACIÓN COMPLETADA. `types/memory-types.ts` (tipos) + `lib/clinical-memory-system.ts` (CRUD + búsqueda por relevancia keyword). Firestore path: `psychologists/{uid}/patients/{pid}/memories/{memoryId}`. Pendiente: wiring a `hopeai-system.ts` y extracción automática al final de sesión.
> - **3 recomendaciones pendientes:** P1.3 (Zod schemas — parcialmente implementado en `tool-input-schemas.ts`), P2.2 (delegación paralela), P2.3 (hooks).
> - **Contexto relevante completado:** Firebase Auth (HTTP-level auth en todas las API routes) y Firestore offline-first migration (3 archivos IndexedDB eliminados, reemplazados por `lib/firestore-client-storage.ts`).
> - Firebase Auth mitiga parcialmente P0.1 (autenticación HTTP, no permisos de herramientas a nivel de modelo).
> - Server-side messages subcollection alignment completado: `firestore-storage-adapter.ts` ahora escribe mensajes a subcollection (O(1)), lee con fallback legacy.
> - Archivos eliminados: `clinical-context-storage.ts`, `patient-persistence.ts`, `client-context-persistence.ts`. Las referencias a estos archivos en este documento son históricas.
> - Archivos servidor (`hipaa-compliant-storage.ts`, `server-storage-adapter.ts`, `server-storage-memory.ts`) siguen en uso.
>
> **Estado actualizado (2026-04-08) — ARCH-1 Agent-Tree/MCP improvements:**
> - **P2.2 (Delegación paralela):** COMPLETADO. `lib/agents/subagents/research-evidence.ts` ahora ejecuta búsquedas en paralelo con `Promise.all()` + error isolation por query. Antes: loop secuencial.
> - **P2.1 (Memoria semántica):** MEJORADO. `lib/clinical-memory-system.ts` tiene nueva función `getRelevantMemoriesSemantic()` que usa Gemini Flash para selección semántica de memorias (análogo a Claude Code `findRelevantMemories.ts`). Fallback automático a keywords si LLM falla. Wired a `explore_patient_context` sub-agente.
> - **MCP Foundation:** NUEVO. `lib/mcp/` creado con tipos (`types.ts`), wrapper de herramientas (`mcp-tool-wrapper.ts`) y registry singleton (`mcp-registry.ts`). Las herramientas MCP se integran al mismo pipeline de permisos + orquestación que las nativas. Patrón de naming: `mcp__<serverId>__<toolName>`.
> - Análisis detallado de la relación Agent-Tree ↔ MCP en `docs/architecture/agent-tree-mcp-relationship-analysis.md`.
> - **Recomendaciones pendientes:** P1.3 (Zod schemas completos), P2.3 (hooks pre/post-tool), Aurora como MCP Server.

---

## Tabla de Contenidos

1. [Mapeo de la Arquitectura de Referencia](#1-mapeo-de-la-arquitectura-de-referencia)
2. [Diferencias Fundamentales Clave](#2-diferencias-fundamentales-clave)
3. [Riesgos y Cuellos de Botella](#3-riesgos-y-cuellos-de-botella)
4. [Hoja de Ruta de Prioridades Críticas](#4-hoja-de-ruta-de-prioridades-críticas)

---

## 1. Mapeo de la Arquitectura de Referencia

### 1.1 Orquestación (Swarm / Multi-Agente)

Claude Code implementa un modelo de **Coordinador + Trabajadores** (`src/coordinator/coordinatorMode.ts`). El coordinador es un agente principal que delega tareas a **trabajadores (workers)** que se ejecutan como sub-procesos independientes o forks in-process del `QueryEngine`. La herramienta `AgentTool` permite tres modos de ejecución: `spawn` (fork in-process), `background` (proceso hijo asíncrono) y `resume` (reanudación de sesión previa). Cada trabajador recibe un subconjunto restringido de herramientas (`ASYNC_AGENT_ALLOWED_TOOLS`) y opera de forma autónoma.

La comunicación entre agentes se realiza mediante la herramienta `SendMessageTool`, y los resultados se devuelven al coordinador como mensajes con formato XML (`<task-notification>` con status, summary, result, usage).

**Ejecución concurrente de herramientas:** Claude Code particiona las invocaciones de herramientas en lotes seriales y concurrentes (`src/services/tools/toolOrchestration.ts`). Las herramientas de solo lectura (`isReadOnly`, `isConcurrencySafe`) se ejecutan en paralelo (máximo 10 concurrentes por defecto), mientras que las herramientas de escritura se ejecutan secuencialmente. Este particionamiento se realiza automáticamente mediante `partitionToolCalls()`.

### 1.2 Manejo de Contexto y Memoria

Claude Code separa explícitamente **contexto de sesión** y **memoria persistente**:

- **Contexto de sesión:** El `QueryEngine` mantiene un arreglo mutable de mensajes (`messages: Message[]`) que incluye: `SystemMessage`, `UserMessage`, `AssistantMessage`, `ProgressMessage` y `CompactBoundary`. Los mensajes se persisten a disco como transcripciones (`~/.claude_code/sessions/<id>/`), permitiendo reanudación vía `--resume`.

- **Memoria persistente:** El sistema `memdir/` implementa 4 tipos de memoria (`user`, `feedback`, `project`, `reference`) almacenados como archivos Markdown individuales con frontmatter YAML. La selección de memorias relevantes se realiza mediante un modelo LLM (Sonnet) que elige las 5 más pertinentes por análisis semántico (`findRelevantMemories.ts`), no por coincidencia de palabras clave. El punto de entrada (`MEMORY.md`) tiene límites estrictos: máximo 200 líneas / 25KB.

- **Compactación reactiva:** Ante errores de `prompt-too-long`, Claude Code ejecuta compactación agresiva del historial (`compactHistoryReactively`), eliminando mensajes antiguos por grupos hasta liberar los tokens necesarios. Esto permite recuperarse de errores de contexto sin perder la sesión.

### 1.3 Delegación de Tareas

La delegación en Claude Code opera en tres niveles:

1. **Herramientas (Tools):** ~40 herramientas registradas con esquemas Zod para validación de entrada, marcadores de concurrencia (`isConcurrencySafe`), y descripciones dinámicas según contexto.
2. **Sub-agentes (`AgentTool`):** Forks del `QueryEngine` con contexto restringido, que ejecutan tareas complejas y devuelven resultados al agente principal.
3. **Equipos (`TeamCreateTool`):** Agentes persistentes que pueden recibir mensajes a lo largo de una sesión, con directorio compartido (scratchpad) para archivos temporales.

Cada invocación de herramienta pasa por un sistema de **permisos** (`utils/permissions/permissions.ts`) con 5 modos (`default`, `plan`, `bypassPermissions`, `auto`, `dontAsk`) y reglas configurables por herramienta y patrón. Hooks de pre/post-ejecución (`runPreToolUseHooks`, `runPostToolUseHooks`) permiten lógica personalizada antes y después de cada herramienta.

---

## 2. Diferencias Fundamentales Clave

### 2.1 Modelo de Agentes: Modos vs. Agentes Autónomos

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Patrón** | Coordinador + Trabajadores independientes | Router único con 3 modos de agente |
| **Ejecución** | Sub-procesos / forks in-process | Cambio de `systemInstruction` dentro del mismo `ChatSession` |
| **Aislamiento** | Cada trabajador tiene su propio `QueryEngine` y contexto restringido | Los 3 agentes comparten la misma instancia de `ClinicalAgentRouter` |
| **Comunicación** | `SendMessageTool` con protocolo XML estructurado | Sin comunicación inter-agente; contexto compartido vía `SessionContext` |

**Evidencia en código:**
- Aurora: `lib/clinical-agent-router.ts` define los 3 agentes como configuraciones de `systemInstruction` con distintos `tools[]`, pero todos operan sobre la misma sesión Gemini.
- Claude Code: `src/coordinator/coordinatorMode.ts` líneas 88-200 definen la creación de contextos aislados para trabajadores con herramientas restringidas.

**Implicación:** Aurora no puede ejecutar múltiples agentes en paralelo. Si un paciente necesita simultáneamente documentación clínica y búsqueda de evidencia, debe hacerse secuencialmente.

### 2.2 Sistema de Permisos para Herramientas

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Pre-ejecución** | `CanUseToolFn` evaluada antes de cada herramienta | No existe sistema de permisos pre-ejecución |
| **Modos** | 5 modos configurables + reglas por patrón | Sin concepto de modos de permiso |
| **Clasificador** | ML classifier para aprobación automática | No implementado |
| **Hooks** | Pre/post-ejecución por herramienta | No implementado |
| **Tracking** | Denial tracking con umbrales (3 denegaciones consecutivas → fallback) | No implementado |

**Evidencia en código:**
- Aurora: La búsqueda de "permission", "allow", "deny" en `lib/dynamic-orchestrator.ts` y `lib/clinical-agent-router.ts` no arroja resultados. La capa de seguridad (`lib/security/audit-logger.ts`) registra eventos de acceso no autorizado, pero no previene ejecución.
- Claude Code: `utils/permissions/permissions.ts` implementa el motor de decisión con 9 tipos de `PermissionDecisionReason`.

**Implicación:** En Aurora, cualquier herramienta disponible se ejecuta sin validación de permisos. En un contexto clínico con datos sensibles de pacientes, esto representa un riesgo significativo.

### 2.3 Validación de Entrada de Herramientas

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Esquemas** | Cada herramienta define `inputSchema: z.ZodType` con validación explícita | Sin esquemas de validación formales para herramientas |
| **Validación** | `safeParse()` antes de ejecución; errores formateados para usuario | Validación delegada implícitamente al registry |
| **Resultado** | `ToolResult<T>` tipado con `data`, `newMessages`, `contextModifier` | Respuestas de funciones sin estructura de resultado formal |

**Evidencia en código:**
- Aurora: `lib/tool-registry.ts` registra herramientas, pero no se encontraron llamadas a `validate()`, `schema`, o `safeParse()` en `lib/dynamic-orchestrator.ts`.
- Claude Code: `src/services/tools/toolExecution.ts` ejecuta `tool.inputSchema.safeParse(input)` en cada invocación.

### 2.4 Concurrencia Controlada de Herramientas

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Estrategia** | Particionamiento automático: lectura=paralelo, escritura=serial | `Promise.all()` sin límite ni particionamiento |
| **Límite** | Máximo 10 herramientas concurrentes (configurable) | Sin límite de concurrencia |
| **Clasificación** | `isConcurrencySafe(input)` por herramienta | Sin marcadores de concurrencia |

**Evidencia en código:**
- Aurora: `lib/clinical-agent-router.ts` línea ~2146: `const functionResponses = await Promise.all(functionCalls.map(...))` ejecuta todas las function calls en paralelo sin límite.
- Claude Code: `src/services/tools/toolOrchestration.ts` líneas 8-11 define `getMaxToolUseConcurrency()` con valor por defecto 10.

**Implicación:** Aurora podría lanzar un número arbitrario de llamadas paralelas, arriesgando rate limits de la API de Gemini y condiciones de carrera en operaciones de escritura.

### 2.5 Sistema de Memoria Persistente

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Memoria semántica** | `memdir/` con 4 tipos, selección por LLM, archivos Markdown con YAML frontmatter | No existe sistema de memoria inter-sesión semántico |
| **Compactación** | Reactiva ante `prompt-too-long` + `CompactBoundary` markers | Sliding window con 50 intercambios, compresión basada en tokens (2000→1200) |
| **Reanudación** | `--resume` carga transcripción completa desde disco | Persistencia de sesión en SQLite/Supabase, pero sin reanudación de sesión Gemini (recreación lazy) |

**Evidencia en código:**
- Aurora: `lib/context-window-manager.ts` líneas 70-72 define umbrales de compresión: `maxExchanges: 50`, `triggerTokens: 2000`, `targetTokens: 1200`. No existe directorio `memdir/` ni sistema equivalente.
- Claude Code: `src/memdir/memdir.ts` líneas 34-147 implementa la gestión de memorias con límites de 200 líneas / 25KB.

**Implicación:** Aurora pierde contexto terapéutico entre sesiones distintas. El psicólogo debe re-contextualizar manualmente, lo cual es ineficiente para tratamientos longitudinales.

### 2.6 Manejo de Errores y Recuperación

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Clasificación de errores** | `categorizeRetryableAPIError()` con 3 categorías: `retryable`, `non_retryable`, `rate_limit` | Retry manual para errores 429 (3 intentos, backoff exponencial hasta 8s) |
| **Prompt-too-long** | Compactación reactiva automática + reintento | Sin recuperación automática ante context overflow |
| **Errores de herramientas** | `classifyToolError()` + `TelemetrySafeError` (sin PII en telemetría) | Try-catch con logging de error y continuación |
| **Errores de validación** | `formatZodValidationError()` con campos fallidos | Sin validación formal de entrada |

**Evidencia en código:**
- Aurora: `lib/clinical-agent-router.ts` líneas 1790-1805 implementan retry con backoff exponencial solo para errores 429. No hay compactación reactiva ante `RESOURCE_EXHAUSTED` por contexto.
- Claude Code: `QueryEngine.ts` detecta `isPromptTooLongMessage()`, calcula el gap de tokens, y ejecuta `compactHistoryReactively()` antes de reintentar.

### 2.7 Observabilidad y Telemetría

| Aspecto | Claude Code | Aurora |
|---------|-------------|--------|
| **Tracing** | OpenTelemetry con spans por herramienta (`startToolSpan()`, `startToolExecutionSpan()`) | Sentry con spans manuales + logging con emojis a consola |
| **Costo** | `cost-tracker.ts` con tracking granular por modelo/herramienta | Tracking de tokens y costo por mensaje en `session-metrics-comprehensive-tracker.ts` |
| **PII en logs** | `TelemetrySafeError` elimina paths/código de logs | Sin protección explícita de PII en logs |

**Evidencia en código:**
- Aurora: Logging extensivo con `console.log(`📊 [Component]...`)` y Sentry spans manuales. No se encontró filtrado de PII en logs.
- Claude Code: `src/services/tools/toolExecution.ts` usa `TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` para asegurar que la telemetría no contiene información sensible.

---

## 3. Riesgos y Cuellos de Botella

### 3.1 🔴 Riesgo Crítico: Ausencia de Control de Permisos en Herramientas

**Descripción:** Aurora no implementa un sistema de permisos pre-ejecución para herramientas. Cualquier herramienta registrada puede ser invocada por el modelo sin validación de autorización.

**Contexto clínico:** En un sistema que maneja datos HIPAA/protegidos de pacientes, la ejecución no controlada de herramientas (como búsqueda académica que podría filtrar contexto del paciente, o herramientas futuras de escritura) representa un vector de riesgo para fuga de datos.

**Archivo afectado:** `lib/dynamic-orchestrator.ts` (sin sistema de permisos), `lib/clinical-agent-router.ts` (ejecución directa de function calls).

### 3.2 🔴 Riesgo Crítico: Fuga de Información Sensible en Logs

**Descripción:** Aurora utiliza `console.log` y `console.warn` extensivamente con datos de contexto clínico sin filtrado de PII. Los mensajes incluyen contenido de pacientes, metadata de sesión, y respuestas del modelo.

**Contexto clínico:** En producción, estos logs podrían contener nombres de pacientes, diagnósticos, o contenido de sesiones terapéuticas. Un acceso no autorizado a los logs expondría información protegida.

**Archivos afectados:** Múltiples archivos en `lib/` con patrones como `console.log(\`📊 [Component] Message:\`, { key: value })`.

### 3.3 🟡 Cuello de Botella: Agente Único Secuencial

**Descripción:** Aurora opera con un único agente activo a la vez. El cambio entre los 3 modos (socratico, clinico, academico) cierra la sesión Gemini anterior y crea una nueva. Esto implica:

1. **Latencia de cambio:** Cada cambio de agente requiere recrear `ChatSession` con historial completo.
2. **Sin paralelismo:** No es posible que el agente académico busque evidencia mientras el clínico redacta documentación.
3. **Pérdida de contexto Gemini:** Al cambiar de agente, el modelo pierde el estado interno de la conversación previa (solo se mantiene el historial textual).

**Archivo afectado:** `lib/clinical-agent-router.ts` (gestión de sesiones por agente).

### 3.4 🟡 Cuello de Botella: Concurrencia Ilimitada en Function Calls

**Descripción:** Aurora ejecuta todas las function calls de una respuesta en paralelo con `Promise.all()` sin límite de concurrencia ni particionamiento lectura/escritura.

**Riesgo:** Con sesiones largas donde el modelo podría invocar múltiples herramientas simultáneamente (ej. 5+ búsquedas académicas), se arriesga:
- Rate limits de la API de Gemini/Parallel AI.
- Condiciones de carrera si dos function calls modifican estado compartido.
- Timeouts en cascada si una herramienta falla y el `Promise.all()` rechaza.

**Archivo afectado:** `lib/clinical-agent-router.ts` línea ~2146.

### 3.5 🟡 Cuello de Botella: Compresión de Contexto Insuficiente

**Descripción:** El `context-window-manager.ts` de Aurora implementa una ventana deslizante de 50 intercambios con umbrales de compresión de 2000→1200 tokens. Sin embargo:

1. **Sin compactación reactiva:** No hay mecanismo para recuperarse de errores `RESOURCE_EXHAUSTED` causados por contexto demasiado largo. Si la ventana deslizante no es suficiente, la sesión falla.
2. **Estimación básica de tokens:** Usa 1 token ≈ 4 caracteres (adecuada para español, pero imprecisa para contenido mixto con archivos clínicos).
3. **Sin preservación selectiva:** La ventana deslizante es temporal (últimos N mensajes), sin capacidad de preservar mensajes clínicamente relevantes de turnos anteriores.

**Archivo afectado:** `lib/context-window-manager.ts` líneas 70-72, 256-305.

### 3.6 🟡 Riesgo: Sin Memoria Persistente Inter-Sesión

**Descripción:** Aurora no tiene un sistema de memoria semántica que persista entre sesiones distintas. Cada nueva sesión comienza sin contexto previo más allá de la ficha clínica del paciente.

**Contexto clínico:** Para tratamientos longitudinales (meses/años), el psicólogo pierde:
- Patrones de interacción observados.
- Preferencias terapéuticas acumuladas.
- Hallazgos de investigación relevantes de sesiones anteriores.
- Contexto evolutivo del caso.

**Archivos afectados:** No existe equivalente a `memdir/` de Claude Code.

### 3.7 🟢 Riesgo Menor: Sin Hooks de Pre/Post-Ejecución

**Descripción:** Aurora no implementa un sistema de hooks que permita ejecutar lógica personalizada antes o después de cada herramienta. Esto limita:
- Audit trails granulares por herramienta.
- Validación dinámica de contexto antes de ejecución.
- Limpieza o rollback después de fallos.

**Archivos afectados:** `lib/dynamic-orchestrator.ts`, `lib/tool-registry.ts`.

### 3.8 Fortalezas Actuales de Aurora (No Presentes en Claude Code)

Es importante notar que Aurora implementa patrones robustos que no se evidencian en el código de Claude Code analizado:

| Fortaleza | Evidencia |
|-----------|-----------|
| **Cifrado AES-256-GCM** para datos clínicos | `lib/encryption-utils.ts`, `lib/hipaa-compliant-storage.ts` |
| **Retry con backoff exponencial** para errores 429 | `lib/clinical-agent-router.ts` líneas 1790-1805 (3 reintentos, hasta 8s) |
| **Referencia ligera de archivos** (ahorro de ~60k tokens/turno) | `lib/clinical-agent-router.ts` (envío completo solo en primer turno, referencia textual después) |
| **Optimización de cold-start** con inicialización paralela | `lib/hopeai-system.ts` líneas 69-122 |
| **Contexto clínico diferenciado** (ficha completa → referencia breve) | `lib/hopeai-system.ts` (primer turno vs. turnos subsecuentes) |

---

## 4. Hoja de Ruta de Prioridades Críticas

### P0 — Crítico (Implementar Inmediatamente)

#### P0.1: Sistema de Permisos para Herramientas

**Qué:** Implementar un sistema de permisos pre-ejecución para todas las herramientas registradas en `ToolRegistry`.

**Por qué:** Sin permisos, cualquier herramienta puede ser invocada sin control, lo cual es inaceptable para un sistema que maneja datos clínicos sensibles.

**Cómo:**
1. Definir un `CanUseToolFn` que evalúe cada invocación antes de ejecutar.
2. Crear categorías de herramientas: `read-only`, `write`, `external` (búsquedas que envían datos fuera del sistema).
3. Implementar reglas por defecto: herramientas de lectura → permitir; herramientas externas → validar que no incluyan datos de paciente en la query.

**Archivos a modificar:** `lib/tool-registry.ts`, `lib/clinical-agent-router.ts` (sección de function call execution).

**Referencia:** `docs/architecture/claude/claude-code-main/src/utils/permissions/permissions.ts`.

#### P0.2: Filtrado de PII en Logs y Telemetría

**Qué:** Implementar un sanitizador de logs que elimine información identificable de pacientes antes de escribir a consola o enviar a Sentry.

**Por qué:** Los logs actuales contienen potencialmente nombres, diagnósticos y contenido de sesiones terapéuticas.

**Cómo:**
1. Crear un wrapper de logging (`lib/safe-logger.ts`) que intercepte todos los `console.log/warn/error`.
2. Aplicar redacción de patrones sensibles (nombres propios en contexto clínico, IDs de paciente).
3. Configurar Sentry para excluir breadcrumbs con contenido clínico.

**Referencia:** Patrón `TelemetrySafeError` de Claude Code en `src/services/tools/toolExecution.ts`.

---

### P1 — Alta Prioridad (Próximo Sprint)

#### P1.1: Compactación Reactiva de Contexto

**Qué:** Agregar recuperación automática ante errores de contexto demasiado largo (`RESOURCE_EXHAUSTED`).

**Por qué:** Sesiones terapéuticas largas con archivos adjuntos pueden exceder la ventana de contexto de Gemini. Actualmente, esto causa un error irrecuperable.

**Cómo:**
1. Detectar errores de tipo `prompt-too-long` / `RESOURCE_EXHAUSTED` en el flujo de streaming.
2. Calcular el exceso de tokens y ejecutar compactación agresiva del historial.
3. Reintentar el envío con el historial compactado.

**Archivos a modificar:** `lib/clinical-agent-router.ts` (sección de streaming), `lib/context-window-manager.ts` (nueva función `compactReactively()`).

**Referencia:** Patrón `compactHistoryReactively()` de Claude Code en `QueryEngine.ts`.

#### P1.2: Límite de Concurrencia en Function Calls

**Qué:** Reemplazar el `Promise.all()` sin límite por una ejecución con concurrencia máxima configurable.

**Por qué:** Prevenir rate limits, condiciones de carrera y fallos en cascada.

**Cómo:**
1. Implementar una función `executeWithConcurrencyLimit(tasks, maxConcurrent)` que procese lotes.
2. Valor por defecto: 5 herramientas concurrentes (ajustable por entorno).
3. Separar herramientas de solo lectura de las que modifican estado.

**Archivos a modificar:** `lib/clinical-agent-router.ts` línea ~2146.

**Referencia:** `docs/architecture/claude/claude-code-main/src/services/tools/toolOrchestration.ts` (función `partitionToolCalls()`, `getMaxToolUseConcurrency()`).

#### P1.3: Validación Formal de Entrada de Herramientas

**Qué:** Agregar esquemas de validación (Zod) para cada herramienta registrada y validar las entradas antes de ejecución.

**Por qué:** Entradas malformadas del modelo pueden causar errores silenciosos o comportamientos inesperados en las herramientas.

**Cómo:**
1. Definir `inputSchema: z.ZodType` para cada herramienta en `ToolRegistry`.
2. Ejecutar `safeParse()` antes de cada invocación de function call.
3. Emitir errores formateados al modelo si la validación falla.

**Archivos a modificar:** `lib/tool-registry.ts`, `lib/clinical-agent-router.ts`.

**Referencia:** `docs/architecture/claude/claude-code-main/src/Tool.ts` (definición de `inputSchema`), `src/services/tools/toolExecution.ts` (uso de `safeParse()`).

---

### P2 — Mejora Estratégica (Próximo Quarter)

#### P2.1: Sistema de Memoria Clínica Inter-Sesión

**Qué:** Implementar un sistema de memoria persistente que acumule observaciones clínicas relevantes entre sesiones de un mismo paciente.

**Por qué:** Los tratamientos psicológicos son longitudinales. El sistema debe recordar patrones, hallazgos y evolución sin depender exclusivamente de la ficha clínica manual.

**Cómo:**
1. Crear un directorio de memorias por paciente con categorías: `observaciones`, `patrones`, `hallazgos-investigación`, `preferencias-terapéuticas`.
2. Al finalizar cada sesión, extraer automáticamente memorias relevantes del historial de conversación.
3. Al iniciar una nueva sesión, seleccionar las memorias más pertinentes para inyectar en el contexto (similar a `findRelevantMemories.ts` de Claude Code, pero usando Gemini en lugar de Sonnet).

**Archivos a crear:** `lib/clinical-memory-system.ts`, `types/memory-types.ts`.

**Referencia:** `docs/architecture/claude/claude-code-main/src/memdir/` (sistema completo de memoria).

#### P2.2: Delegación Paralela de Agentes

**Qué:** Permitir que el orquestador invoque múltiples agentes en paralelo para tareas complementarias.

**Por qué:** Casos de uso frecuentes como "documenta esta sesión y busca evidencia para el diagnóstico" requieren actualmente dos turnos secuenciales.

**Cómo:**
1. Crear un `SubAgentRunner` que pueda instanciar sesiones Gemini independientes con systemInstructions distintas.
2. Implementar un protocolo de resultados donde cada sub-agente devuelve su output al orquestador.
3. El orquestador fusiona los resultados y genera una respuesta unificada.

**Archivos a crear:** `lib/sub-agent-runner.ts`.
**Archivos a modificar:** `lib/dynamic-orchestrator.ts`, `lib/clinical-agent-router.ts`.

**Referencia:** `docs/architecture/claude/claude-code-main/src/coordinator/coordinatorMode.ts`, `AgentTool`.

#### P2.3: Hooks de Pre/Post-Ejecución

**Qué:** Implementar un sistema de hooks configurables que se ejecuten antes y después de cada herramienta.

**Por qué:** Permite audit trails granulares, validación dinámica de contexto, métricas por herramienta, y rollback ante fallos.

**Cómo:**
1. Definir interfaces `PreToolHook` y `PostToolHook`.
2. Registrar hooks en el `ToolRegistry` o en configuración.
3. Ejecutar hooks en el flujo de function calls del `ClinicalAgentRouter`.

**Archivos a modificar:** `lib/tool-registry.ts`, `lib/clinical-agent-router.ts`.

**Referencia:** `docs/architecture/claude/claude-code-main/src/services/tools/toolExecution.ts` (funciones `runPreToolUseHooks`, `runPostToolUseHooks`).

---

## Resumen Ejecutivo

| Prioridad | Acción | Riesgo que Mitiga | Esfuerzo Estimado |
|-----------|--------|--------------------|--------------------|
| **P0.1** | Sistema de permisos para herramientas | Ejecución no controlada de herramientas con datos sensibles | 2-3 días |
| **P0.2** | Filtrado de PII en logs | Exposición de datos clínicos en logs/telemetría | 1-2 días |
| **P1.1** | Compactación reactiva de contexto | Sesiones largas fallan irrecuperablemente | 2-3 días |
| **P1.2** | Límite de concurrencia en herramientas | Rate limits y condiciones de carrera | 1 día |
| **P1.3** | Validación de entrada con Zod | Errores silenciosos por entradas malformadas | 2-3 días |
| **P2.1** | Memoria clínica inter-sesión | Pérdida de contexto longitudinal | 1-2 semanas |
| **P2.2** | Delegación paralela de agentes | Latencia por ejecución secuencial | 1-2 semanas |
| **P2.3** | Hooks de pre/post-ejecución | Sin audit trail granular ni rollback | 3-5 días |

> **Nota metodológica:** Todas las afirmaciones de este documento están basadas en el análisis directo del código fuente de ambos proyectos. Los archivos y líneas referenciados son verificables en el repositorio. No se asumen características no presentes en el código.
