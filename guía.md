# 📘 Guía de Estudio: Arquitectura de Claude Code CLI

> **Propósito**: Esta guía analiza la arquitectura y patrones de diseño del código fuente de Claude Code CLI de Anthropic, como referencia para proyectos de IA multiagente — en particular, para sistemas como **Aurora** (IA multiagente para psicólogos clínicos).

---

## 1. ¿Qué es este proyecto?

**Claude Code** es la herramienta oficial de línea de comandos (CLI) de [Anthropic](https://www.anthropic.com) que permite interactuar con Claude directamente desde la terminal para realizar tareas de ingeniería de software: editar archivos, ejecutar comandos, buscar en repositorios, gestionar flujos de git, y más.

### Datos verificables del repositorio

| Dato | Valor |
|---|---|
| **Lenguaje** | TypeScript (modo estricto) |
| **Runtime** | [Bun](https://bun.sh) |
| **UI Terminal** | [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) |
| **Escala** | ~1,900 archivos, 512,000+ líneas de código |
| **Interfaz de usuario** | CLI interactiva con componentes React renderizados en terminal |
| **Protocolo de extensibilidad** | [Model Context Protocol (MCP)](https://modelcontextprotocol.io) |
| **SDK de IA** | [Anthropic SDK](https://docs.anthropic.com) (@anthropic-ai/sdk) |
| **Validación de esquemas** | [Zod v4](https://zod.dev) |
| **Parsing CLI** | [Commander.js](https://github.com/tj/commander.js) (extra-typings) |
| **Telemetría** | OpenTelemetry + gRPC |
| **Feature Flags** | GrowthBook + `bun:bundle` (eliminación de código muerto en compilación) |
| **Autenticación** | OAuth 2.0, JWT, macOS Keychain |

### ¿Por qué es un buen ejemplo de arquitectura?

1. **Sistema multiagente real en producción**: Implementa agentes que se comunican entre sí, coordinación de tareas paralelas, y orquestación de equipos de agentes.
2. **Sistema de herramientas extensible**: Cada herramienta es un módulo auto-contenido con esquema, permisos y lógica de ejecución.
3. **Separación de responsabilidades**: Capas bien definidas (UI → Estado → Motor de consultas → API → Herramientas).
4. **Patrones de rendimiento**: Precarga paralela, carga perezosa, eliminación de código muerto, memoización.
5. **Sistema de permisos robusto**: Tres niveles de verificación de permisos con persistencia de decisiones.

---

## 2. Estructura del proyecto

```
src/
├── main.tsx                 # Punto de entrada (Commander.js + React/Ink)
├── QueryEngine.ts           # Motor central de interacción con el LLM (~46K líneas)
├── Tool.ts                  # Definiciones de tipos para herramientas (~29K líneas)
├── commands.ts              # Registro de comandos (~25K líneas)
├── tools.ts                 # Registro de herramientas
├── context.ts               # Ensamblaje de contexto sistema/usuario
├── cost-tracker.ts          # Seguimiento de costos por tokens
│
├── commands/                # ~60 implementaciones de comandos slash
├── tools/                   # ~43 implementaciones de herramientas
├── components/              # ~147 componentes UI con Ink (React para CLI)
├── hooks/                   # ~80 hooks personalizados de React
├── services/                # Integraciones con servicios externos
│   ├── api/                 # Cliente API de Anthropic
│   ├── mcp/                 # Model Context Protocol
│   ├── lsp/                 # Language Server Protocol
│   ├── oauth/               # Autenticación OAuth 2.0
│   ├── analytics/           # Feature flags (GrowthBook)
│   ├── compact/             # Compresión de contexto
│   └── extractMemories/     # Extracción automática de memorias
│
├── state/                   # Gestión de estado (React + store externo)
├── bridge/                  # Integración con IDEs (VS Code, JetBrains)
├── coordinator/             # Orquestación multiagente
├── memdir/                  # Sistema de memoria persistente
├── tasks/                   # Gestión de tareas
├── plugins/                 # Sistema de plugins
├── skills/                  # Sistema de habilidades reutilizables
├── types/                   # Definiciones de tipos TypeScript
├── utils/                   # Funciones utilitarias (100+ módulos)
├── voice/                   # Integración de voz
├── vim/                     # Modo Vim
├── remote/                  # Sesiones remotas
├── server/                  # Modo servidor
├── schemas/                 # Esquemas Zod para validación
├── migrations/              # Migraciones de configuración
└── entrypoints/             # Lógica de inicialización
```

---

## 3. Arquitectura central: Flujo de datos

```
Entrada del usuario (CLI)
  │
  ▼
main.tsx ── Commander.js parsea argumentos
  │
  ▼
entrypoints/init.ts ── Inicialización (config, telemetría, API)
  │
  ▼
QueryEngine.ts ── Motor de consultas al LLM
  ├── getSystemContext() → Contexto del sistema (git status, inyecciones)
  ├── getUserContext()   → Contexto del usuario (MEMORY.md, fecha)
  ├── Llamada a API de Anthropic (streaming)
  └── Bucle de uso de herramientas:
       ├─ LLM solicita uso de herramienta
       ├─ Sistema de permisos verifica (canUseTool)
       ├─ Herramienta se ejecuta
       ├─ Resultado se envía al LLM
       └─ Ciclo continúa hasta respuesta final
  │
  ▼
Renderizado (Ink + React) → Salida en terminal
```

### Componentes clave del flujo

1. **QueryEngine** (`src/QueryEngine.ts`): Es el corazón del sistema. Orquesta llamadas al LLM, parsea respuestas streaming, ejecuta herramientas en un bucle, y gestiona reintentos.

2. **Sistema de herramientas** (`src/tools/`): Cada herramienta es un módulo auto-contenido construido con `buildTool()`. Define esquema de entrada (Zod), nivel de permisos, lógica de ejecución, y componentes de renderizado.

3. **Sistema de permisos** (`src/hooks/toolPermission/`): Verifica cada invocación de herramienta. Tres fuentes de decisión: hooks automáticos, clasificador, y confirmación del usuario.

4. **Estado** (`src/state/`): Store inmutable con suscripciones, integrado a React vía `useSyncExternalStore`.

---

## 4. Patrones de diseño clave

### 4.1 Patrón de herramientas auto-contenidas

**Archivos**: `src/Tool.ts`, `src/tools/*/`

Cada herramienta se construye con `buildTool()` y es una composición de:

```
Herramienta = {
  Metadatos:   nombre, descripción, hints de búsqueda
  Esquema:     inputSchema (Zod), outputSchema
  Permisos:    checkPermissions(), nivel de permiso
  Ejecución:   execute() async
  UI:          renderToolUseMessage(), renderToolResultMessage()
  Validación:  validateInput()
}
```

**Ejemplo real** del código (`src/tools/FileEditTool/FileEditTool.ts`):

```typescript
export const FileEditTool = buildTool({
  name: FILE_EDIT_TOOL_NAME,
  searchHint: 'modify file contents in place',
  async description() { return 'A tool for editing files' },
  async prompt() { return getEditToolDescription() },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return outputSchema() },
  async checkPermissions(input, context) { /* ... */ },
  renderToolUseMessage,
  renderToolResultMessage,
})
```

**Valores por defecto** en `buildTool()` (`src/Tool.ts:757-769`):
- `isEnabled`: true
- `isConcurrencySafe`: false (asume que no es seguro para concurrencia)
- `isReadOnly`: false (asume que escribe)
- `isDestructive`: false

> **Lección para Aurora**: Este patrón permite agregar nuevas herramientas clínicas (evaluaciones, formularios, protocolos) sin modificar el motor central. Cada herramienta declara sus propios permisos y esquemas de validación.

---

### 4.2 Motor de consultas como generador asíncrono

**Archivo**: `src/QueryEngine.ts`

El `QueryEngine` usa `AsyncGenerator` para streaming de respuestas:

```typescript
export class QueryEngine {
  constructor(config: QueryEngineConfig) { /* ... */ }
  async *submitMessage(prompt, options?): AsyncGenerator<SDKMessage>
}
```

La configuración del motor (`QueryEngineConfig`) incluye:
- `tools`: Lista de herramientas disponibles
- `commands`: Comandos registrados
- `mcpClients`: Conexiones MCP activas
- `agents`: Definiciones de agentes
- `canUseTool`: Función de verificación de permisos
- `maxTurns`: Límite de ciclos
- `maxBudgetUsd`: Presupuesto máximo en USD
- `thinkingConfig`: Configuración del modo "thinking"
- `abortController`: Para cancelación

> **Lección para Aurora**: El uso de `AsyncGenerator` permite procesar respuestas del LLM en streaming, mostrando progreso al usuario en tiempo real. Esto es crítico para sesiones clínicas donde el psicólogo necesita retroalimentación inmediata.

---

### 4.3 Estado inmutable con suscripciones

**Archivos**: `src/state/store.ts`, `src/state/AppState.tsx`

Store personalizado (sin Redux ni MobX):

```typescript
export function createStore<T>(initialState: T, onChange?): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()
  return {
    getState: () => state,
    setState: (updater) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return  // Evita re-renders innecesarios
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => { /* ... */ },
  }
}
```

El estado es `DeepImmutable<AppState>`, con más de 50 campos que incluyen: configuración, modelo activo, estado de la UI, tareas, herramientas, permisos, y más.

Integración con React:

```typescript
export function useAppState(selector) {
  const store = useAppStore()
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => selector(store.getState())
  )
}
```

> **Lección para Aurora**: Un store personalizado inmutable es más ligero que Redux/MobX y permite selectores que evitan re-renders innecesarios. Para Aurora, esto es útil al manejar estado de múltiples agentes y sesiones clínicas simultáneas.

---

### 4.4 Sistema de permisos multicapa

**Archivos**: `src/hooks/toolPermission/PermissionContext.ts`, `src/types/permissions.ts`

Tres fuentes de decisión de permisos:

```
1. Hook automático    → Reglas predefinidas (allow/deny)
2. Clasificador       → Evaluación automática basada en contexto
3. Confirmación       → El usuario decide manualmente
```

Tipos de decisión:

```typescript
type PermissionApprovalSource =
  | { type: 'hook'; permanent?: boolean }
  | { type: 'user'; permanent: boolean }
  | { type: 'classifier' }

type PermissionRejectionSource =
  | { type: 'hook' }
  | { type: 'user_abort' }
  | { type: 'user_reject'; hasFeedback: boolean }
```

Modos de permiso disponibles:
- `default`: Pregunta al usuario por cada herramienta
- `plan`: Revisa plan antes de ejecución
- `bypassPermissions`: Aprobación automática basada en política
- `auto`: Aprobación inteligente basada en clasificador

> **Lección para Aurora**: En un sistema clínico, los permisos son CRÍTICOS. Aurora necesitaría un sistema similar para controlar qué agentes pueden acceder a datos del paciente, enviar informes, o ejecutar evaluaciones. Diferenciar entre permisos automáticos (hooks), basados en contexto (clasificador), y explícitos del usuario es un patrón muy aplicable.

---

### 4.5 Orquestación multiagente

**Archivo**: `src/coordinator/coordinatorMode.ts`

El sistema de coordinador gestiona agentes trabajadores:

```typescript
export function isCoordinatorMode(): boolean {
  if (feature('COORDINATOR_MODE')) {
    return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
  }
  return false
}
```

Herramientas del ecosistema multiagente:
- **AgentTool** (`src/tools/AgentTool/`): Crea sub-agentes con herramientas específicas
- **TeamCreateTool** / **TeamDeleteTool**: Gestión de equipos de agentes
- **SendMessageTool**: Comunicación inter-agente
- **TaskCreateTool** / **TaskUpdateTool**: Gestión de tareas asignadas a agentes

Los trabajadores reciben un subconjunto controlado de herramientas:

```typescript
const workerTools = isSimpleMode
  ? [BASH_TOOL_NAME, FILE_READ_TOOL_NAME, FILE_EDIT_TOOL_NAME]
  : Array.from(ASYNC_AGENT_ALLOWED_TOOLS)
      .filter(name => !INTERNAL_WORKER_TOOLS.has(name))
```

Herramientas internas (no expuestas a trabajadores):
```typescript
const INTERNAL_WORKER_TOOLS = new Set([
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
])
```

> **Lección para Aurora**: Este patrón de coordinador-trabajadores es directamente aplicable. Aurora podría tener un agente coordinador que asigna tareas a agentes especializados (evaluación, diagnóstico, planificación de tratamiento), cada uno con su propio subconjunto de herramientas clínicas.

---

### 4.6 Contexto ensamblado y memoizado

**Archivo**: `src/context.ts`

El contexto se ensambla en dos partes, ambas memoizadas:

**Contexto del sistema** (`getSystemContext()`):
- Estado de Git (rama actual, commits recientes, estado de archivos)
- Se obtiene ejecutando 5 comandos git en paralelo
- Se trunca a 2,000 caracteres para no saturar el contexto

**Contexto del usuario** (`getUserContext()`):
- Contenido de archivos `MEMORY.md` (memoria persistente del proyecto)
- Fecha actual
- Archivos de memoria inyectados dinámicamente

```typescript
export const getSystemContext = memoize(async () => {
  const gitStatus = await getGitStatus()  // 5 comandos git en paralelo
  return {
    ...(gitStatus && { gitStatus }),
  }
})

export const getUserContext = memoize(async () => {
  const claudeMd = getClaudeMds(filterInjectedMemoryFiles(await getMemoryFiles()))
  return {
    ...(claudeMd && { claudeMd }),
    currentDate: `Today's date is ${getLocalISODate()}.`,
  }
})
```

> **Lección para Aurora**: Para sesiones clínicas, el contexto debería incluir el historial del paciente, evaluaciones previas, y notas del psicólogo — todo memoizado para no recargar en cada interacción. La memoización garantiza que datos costosos de obtener solo se carguen una vez por sesión.

---

### 4.7 Registro dinámico de comandos

**Archivo**: `src/commands.ts`

Los comandos provienen de múltiples fuentes y se descubren dinámicamente:

```
Fuentes de comandos:
1. Built-in     → Importados estáticamente (~60 comandos)
2. Plugins      → Cargados vía getPluginCommands()
3. Skills       → Cargados vía getSkillDirCommands()
4. MCP          → Integrados vía getMcpSkillCommands()
5. Dinámicos    → Descubiertos durante la sesión (getDynamicSkills())
6. Feature-gated → Condicionales vía feature(flag)
```

La lista final se deduplica y ordena:

```typescript
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)
  const dynamicSkills = getDynamicSkills()
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )
  // Insertar skills dinámicos después de plugins, antes de built-ins
  return [...plugins, ...dynamicSkills, ...builtins]
}
```

> **Lección para Aurora**: Los protocolos clínicos, evaluaciones, y herramientas terapéuticas podrían registrarse dinámicamente — permitiendo a cada clínica personalizar su conjunto de herramientas sin modificar el código base.

---

### 4.8 Memoria persistente

**Archivos**: `src/memdir/memdir.ts`, `src/memdir/paths.ts`, `src/memdir/memoryScan.ts`

El sistema usa archivos `MEMORY.md` como memoria persistente entre sesiones:

```typescript
export const ENTRYPOINT_NAME = 'MEMORY.md'
export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000
```

La memoria se trunca de forma inteligente si excede los límites:
1. Primero trunca por número de líneas (200 máx)
2. Luego trunca por bytes (25KB máx)
3. Agrega advertencia de truncamiento al final

Servicios relacionados:
- `services/extractMemories/`: Extrae memorias automáticamente de conversaciones
- `services/teamMemorySync/`: Sincroniza memorias entre agentes de equipo
- `commands/memory/`: Comando `/memory` para gestión manual

> **Lección para Aurora**: La memoria persistente es esencial para un sistema clínico. Aurora debería mantener un "perfil de memoria" por paciente y por terapeuta, con extracción automática de insights de cada sesión y sincronización entre agentes especializados.

---

### 4.9 Optimización de arranque

**Archivo**: `src/main.tsx`

El arranque ejecuta operaciones costosas en paralelo antes de evaluar módulos pesados:

```typescript
// 1. Profiling desde la primera línea
profileCheckpoint('main_tsx_entry')

// 2. Operaciones I/O en paralelo (no bloquean)
startMdmRawRead()        // Lee configuración MDM en background
startKeychainPrefetch()  // Prefetch de credenciales en background

// 3. Importaciones condicionales (eliminación de código muerto)
const coordinatorModule = feature('COORDINATOR_MODE')
  ? require('./coordinator/coordinatorMode.js')
  : null

// 4. Módulos pesados cargados bajo demanda
// OpenTelemetry (~400KB) y gRPC (~700KB) se cargan con import() dinámico
```

> **Lección para Aurora**: Cuando un psicólogo inicia sesión, la carga de datos del paciente, configuración del consultorio, y conexión a servicios externos deben ocurrir en paralelo para minimizar el tiempo de espera.

---

### 4.10 Integración MCP (Model Context Protocol)

**Archivos**: `src/services/mcp/client.ts`, `src/services/mcp/types.ts`

MCP permite conectar servidores externos que exponen herramientas, recursos y prompts:

```typescript
export type MCPServerConnection =
  | ConnectedMCPServer    // Conectado con herramientas/recursos disponibles
  | FailedMCPServer       // Falló la conexión
  | NeedsAuthMCPServer    // Requiere autenticación
  | PendingMCPServer      // Conectando...
  | DisabledMCPServer     // Deshabilitado por configuración
```

Transportes soportados:
- `stdio`: Subproceso local
- `sse`: Server-Sent Events
- `http`: HTTP estándar
- `ws`: WebSocket (con TLS/mTLS)
- `sdk`: SDK directo

Configuración jerárquica por alcance:
```typescript
export type ConfigScope =
  | 'local' | 'user' | 'project' | 'dynamic'
  | 'enterprise' | 'claudeai' | 'managed'
```

> **Lección para Aurora**: MCP permitiría a Aurora conectarse a sistemas de historia clínica electrónica (EHR), bases de datos de evaluaciones psicológicas, o servicios de telemedicina como servidores MCP — cada uno exponiendo herramientas específicas al dominio clínico.

---

## 5. Orden de lectura recomendado

Para comprender el proyecto de forma progresiva, se sugiere leer en este orden:

### Fase 1: Visión general (2-3 horas)

| # | Archivo | Por qué leerlo |
|---|---|---|
| 1 | `README.md` | Visión general del proyecto y estructura |
| 2 | `src/main.tsx` | Punto de entrada — cómo arranca la aplicación |
| 3 | `src/Tool.ts` (primeras ~100 líneas) | Interfaz base de todas las herramientas |
| 4 | `src/tools.ts` | Registro de herramientas disponibles |
| 5 | `src/commands.ts` (primeras ~100 líneas) | Registro y descubrimiento de comandos |

### Fase 2: Motor central (4-6 horas)

| # | Archivo | Por qué leerlo |
|---|---|---|
| 6 | `src/QueryEngine.ts` (primeras ~300 líneas) | El corazón del sistema — cómo se interactúa con el LLM |
| 7 | `src/context.ts` | Cómo se ensambla el contexto para cada consulta |
| 8 | `src/state/store.ts` | Patrón de store inmutable |
| 9 | `src/state/AppState.tsx` | Integración del store con React |
| 10 | `src/state/AppStateStore.ts` (tipo `AppState`) | Estructura completa del estado |

### Fase 3: Sistema de herramientas (4-6 horas)

| # | Archivo | Por qué leerlo |
|---|---|---|
| 11 | `src/tools/FileEditTool/FileEditTool.ts` | Ejemplo completo de una herramienta |
| 12 | `src/tools/BashTool/BashTool.tsx` | Herramienta con permisos complejos |
| 13 | `src/tools/AgentTool/` | Cómo se crean sub-agentes |
| 14 | `src/tools/MCPTool/` | Integración de herramientas externas |
| 15 | `src/hooks/toolPermission/PermissionContext.ts` | Sistema de permisos en detalle |

### Fase 4: Multiagente y extensibilidad (3-4 horas)

| # | Archivo | Por qué leerlo |
|---|---|---|
| 16 | `src/coordinator/coordinatorMode.ts` | Orquestación multiagente |
| 17 | `src/tools/TeamCreateTool/` | Gestión de equipos de agentes |
| 18 | `src/tools/SendMessageTool/` | Comunicación inter-agente |
| 19 | `src/tools/TaskCreateTool/` | Gestión de tareas entre agentes |
| 20 | `src/services/mcp/client.ts` | Protocolo de extensibilidad |

### Fase 5: Memoria y persistencia (2-3 horas)

| # | Archivo | Por qué leerlo |
|---|---|---|
| 21 | `src/memdir/memdir.ts` | Sistema de memoria persistente |
| 22 | `src/memdir/findRelevantMemories.ts` | Búsqueda de memorias relevantes |
| 23 | `src/services/extractMemories/` | Extracción automática de memorias |
| 24 | `src/services/compact/` | Compresión de contexto |
| 25 | `src/history.ts` | Historial de sesiones |

---

## 6. Resumen de patrones aplicables a Aurora

| Patrón de Claude Code | Aplicación en Aurora |
|---|---|
| **Herramientas auto-contenidas** (`buildTool()`) | Evaluaciones psicológicas, protocolos terapéuticos, formularios clínicos como herramientas modulares |
| **Motor de consultas streaming** (`AsyncGenerator`) | Respuestas en tiempo real durante sesiones de supervisión clínica |
| **Permisos multicapa** (hook/clasificador/usuario) | Control de acceso a datos de pacientes, protocolos de confidencialidad |
| **Coordinador-trabajadores** | Agente coordinador que asigna a especialistas (evaluación, diagnóstico, plan de tratamiento) |
| **Memoria persistente** (`MEMORY.md`) | Perfil de paciente, notas de sesión, historial terapéutico |
| **Extracción automática de memorias** | Insights automáticos de cada sesión clínica |
| **Contexto memoizado** | Historial del paciente cargado una sola vez por sesión |
| **Registro dinámico de comandos** | Protocolos clínicos configurables por consultorio/especialidad |
| **MCP (extensibilidad)** | Conexión con sistemas de historia clínica electrónica, bases de evaluaciones |
| **Feature flags** | Funciones experimentales habilitables por clínica/profesional |
| **Store inmutable** | Estado de sesión clínica predecible y trazable |
| **Precarga paralela** | Carga de datos del paciente durante el arranque |

---

## 7. Glosario técnico

| Término | Definición |
|---|---|
| **Tool** | Herramienta ejecutable por el LLM (buscar archivos, editar código, ejecutar comandos) |
| **Command** | Comando slash (`/commit`, `/review`) ejecutado por el usuario |
| **QueryEngine** | Motor que orquesta la interacción con el LLM de Anthropic |
| **MCP** | Model Context Protocol — protocolo abierto para conectar herramientas externas a LLMs |
| **LSP** | Language Server Protocol — protocolo para integración con editores de código |
| **Ink** | Librería que permite usar React para renderizar interfaces en la terminal |
| **Bun** | Runtime moderno de JavaScript/TypeScript, alternativa a Node.js |
| **Zod** | Librería de validación de esquemas para TypeScript |
| **Feature Flag** | Bandera que habilita/deshabilita funciones sin cambiar código |
| **AsyncGenerator** | Función generadora asíncrona que produce valores bajo demanda (streaming) |
| **DeepImmutable** | Tipo que hace todas las propiedades de un objeto de solo lectura recursivamente |
| **Memoize** | Técnica de caché que almacena el resultado de una función para evitar recálculos |
| **Store** | Almacén centralizado de estado con patrón de suscripción |
| **Coordinator** | Agente principal que coordina a trabajadores en modo multiagente |
| **Worker** | Agente trabajador que ejecuta tareas asignadas por el coordinador |

---

## 8. Preguntas frecuentes

### ¿Por dónde empiezo?
Lee `README.md` y luego `src/main.tsx` para entender el punto de entrada. Después sigue el orden de lectura de la Fase 1 (sección 5).

### ¿Cuál es el archivo más importante?
`src/QueryEngine.ts` — es el motor central que conecta la entrada del usuario con el LLM y las herramientas. Todo pasa por aquí.

### ¿Cómo se agregan nuevas herramientas?
Se crea un directorio en `src/tools/NuevoTool/` con un archivo que exporta `buildTool({...})`. La herramienta se registra en `src/tools.ts`.

### ¿Cómo funciona la comunicación entre agentes?
El coordinador (`src/coordinator/`) crea trabajadores via `AgentTool`, les asigna tareas con `TaskCreateTool`, y recibe mensajes con `SendMessageTool`.

### ¿Cómo se manejan los permisos?
Cada invocación de herramienta pasa por `canUseTool()` → hooks de permiso → clasificador → confirmación del usuario. Las decisiones pueden persistirse para futuras invocaciones.

### ¿Este proyecto usa tests?
El código fuente leakeado no incluye infraestructura de tests (no hay archivos de test en `src/`). Sin embargo, la validación de esquemas con Zod y el sistema de permisos proporcionan validación en tiempo de ejecución.

---

> **Nota**: Esta guía se basa en el análisis directo del código fuente. Todos los archivos, patrones, y líneas de código citados son verificables en el directorio `src/` del repositorio.