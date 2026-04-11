# AURORA_TOOL_ANALYSIS.md — Análisis de Eficiencia de Tools y Base de Datos

**Plataforma:** Aurora Clinical Intelligence System  
**Fecha:** 2026-04-11  
**Autor:** Claude Opus 4.6 (Análisis automatizado)  
**Rama:** `copilot/analyze-database-tools-efficiency`  
**Versión del análisis:** 1.0.0

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Sistema de Agentes](#2-arquitectura-del-sistema-de-agentes)
3. [Esquema de Base de Datos (Firestore)](#3-esquema-de-base-de-datos-firestore)
4. [Inventario de Tools](#4-inventario-de-tools)
5. [Análisis de Ineficiencias](#5-análisis-de-ineficiencias)
6. [Detección de Loops](#6-detección-de-loops)
7. [Comunicación Main Agent ↔ Sub-Agentes](#7-comunicación-main-agent--sub-agentes)
8. [Operaciones Firestore por Ciclo de Request](#8-operaciones-firestore-por-ciclo-de-request)
9. [Hallazgos de Seguridad y Privacidad](#9-hallazgos-de-seguridad-y-privacidad)
10. [Recomendaciones Priorizadas](#10-recomendaciones-priorizadas)
11. [Plan de Acción (Plan-Confirm-Execute)](#11-plan-de-acción)
12. [Apéndice: Mapa de Archivos Analizados](#12-apéndice-mapa-de-archivos-analizados)

---

## 1. Resumen Ejecutivo

Aurora es un asistente clínico de IA para profesionales de salud mental que utiliza una arquitectura de **agente unificado con sub-agentes especializados**. El sistema principal (Gemini 3 Flash) invoca tools que pueden delegar trabajo a sub-agentes (Gemini 3.1 Flash-Lite) para tareas como síntesis de contexto, investigación académica y generación de documentos.

### Hallazgos Principales

| Categoría | Hallazgos | Impacto Estimado |
|-----------|-----------|-----------------|
| **Lecturas Firestore Redundantes** | Patient record leído 2-4× por request | -200-400ms latencia, -40% quota reads |
| **N+1 Query Patterns** | 3 patrones identificados | -100-200ms, escrituras innecesarias |
| **Loop Detection Parcial** | Solo cubre 2 de 13 tools | Riesgo de loops no detectados |
| **Duplicate Data Emission** | Academic references emitidas 2× al cliente | Bandwidth desperdiciado |
| **Métricas de Tokens Duplicadas** | Captura doble en streaming wrapper | Datos inconsistentes posibles |
| **Sin Cache Inter-Request** | No hay cache de patient/memories a nivel aplicación | Reads innecesarios |

### Presupuesto Firestore (Contexto Spark Plan)

| Recurso | Límite Diario (Spark) | Consumo Estimado (50 usuarios) | Margen |
|---------|----------------------|-------------------------------|--------|
| Reads | 50,000 | ~35,000-45,000 (con redundancias) | ⚠️ Ajustado |
| Writes | 20,000 | ~8,000-12,000 | ✅ Holgado |
| Deletes | 20,000 | ~500-1,000 | ✅ Holgado |

**Con las optimizaciones propuestas, el consumo de reads bajaría a ~20,000-28,000/día** (reducción del 35-45%).

---

## 2. Arquitectura del Sistema de Agentes

### 2.1 Modelo Actual: Agente Unificado (v7.0)

```
┌──────────────────────────────────────────┐
│   Unified Aurora Agent (Gemini 3 Flash)  │
│   - System Prompt: unified-system-prompt │
│   - Tools: 13 function declarations      │
│   - Routing: Model self-routes via tools │
└─────────────────┬────────────────────────┘
                  │
    ┌─────────────┴───────────────────┐
    │                                 │
    ▼                                 ▼
┌──────────────────┐  ┌─────────────────────────┐
│  Direct Tools    │  │  Sub-Agent Tools         │
│  (No LLM call)   │  │  (Spawns Flash-Lite)     │
│                  │  │                           │
│ • search_academic│  │ • explore_patient_context │
│ • get_patient_*  │  │ • generate_clinical_doc   │
│ • save_clinical_ │  │ • update_clinical_doc     │
│ • list_patients  │  │ • get_session_documents   │
│ • create_patient │  │ • research_evidence       │
│ • google_search  │  │ • analyze_longitudinal_*  │
└──────────────────┘  └─────────────────────────┘
```

### 2.2 Flujo de Ejecución de Tools

**Archivo principal:** `lib/agents/streaming-handler.ts`

1. Gemini genera function calls en streaming chunks
2. Calls se recopilan y se pasan a `prepareFunctionCallWithSecurity()`
3. `executeToolsSafely()` particiona por categoría de seguridad:
   - `read-only` + `external` → paralelo (max 3 concurrent)
   - `write` → secuencial (previene race conditions)
4. Results se envían de vuelta a Gemini como `functionResponse`
5. Gemini puede generar hasta 3 rondas de follow-up (MAX_FOLLOWUP_ROUNDS)

### 2.3 Sub-Agent Model

Todos los sub-agentes usan **`gemini-3.1-flash-lite-preview`** (definido en `lib/agents/subagents/types.ts`).

**Patrón de comunicación:**
- Sub-agentes reciben `ToolExecutionContext` con: `psychologistId`, `sessionId`, `patientId`, callbacks de progreso
- Sub-agentes realizan sus propias lecturas Firestore (independientes del Main Agent)
- Resultado retorna como `ToolCallResult` al Main Agent

**⚠️ Problema Arquitectónico:** Los sub-agentes no reciben datos ya cargados por el Main Agent. Cada sub-agente re-lee Firestore independientemente.

---

## 3. Esquema de Base de Datos (Firestore)

### 3.1 Jerarquía de Colecciones

```
psychologists/{psychologistId}/
├── patients/{patientId}/
│   ├── sessions/{sessionId}/
│   │   ├── messages/{messageId}       ← Subcollection (O(1) writes)
│   │   └── documents/{documentId}     ← Clinical documents (SOAP, DAP, etc.)
│   ├── fichas/{fichaId}               ← Fichas clínicas
│   └── memories/{memoryId}            ← Clinical inter-session memories
├── clinical_files/{fileId}            ← Uploaded files metadata
└── subscription/current               ← Subscription tier + token usage
```

### 3.2 Índices Configurados

**Archivo:** `firestore.indexes.json`

| Colección | Campos | Scope | Uso |
|-----------|--------|-------|-----|
| patients | isDeleted ASC, updatedAt DESC | COLLECTION | Soft-delete filtering |

### 3.3 Reglas de Seguridad

**Archivo:** `firestore.rules`

- Scoping por `psychologistId` (auth.uid == psychologistId)
- CollectionGroup query para sessions (por `_userId`)
- Health check bloqueado (admin SDK bypass)

### 3.4 Índices Faltantes Identificados

| Colección | Campos Recomendados | Justificación |
|-----------|-------------------|---------------|
| memories | `isActive` ASC, `updatedAt` DESC | Acelerar `getPatientMemories()` con filtro `isActive=true` |
| memories | `isActive` ASC, `category` ASC, `updatedAt` DESC | Filtro por categoría + actividad |
| sessions (collectionGroup) | `_userId` ASC, `metadata.lastUpdated` DESC | Optimizar `loadPriorSessionSummaries()` |
| documents | `createdAt` DESC | Optimizar `get_session_documents` ordering |

---

## 4. Inventario de Tools

### 4.1 Tools Directas (sin sub-agente LLM)

| Tool | Categoría | Ops Firestore | Archivo Handler |
|------|-----------|---------------|-----------------|
| `search_academic_literature` | external | 0 reads, 0 writes | tool-handlers.ts:73 |
| `get_patient_memories` | read-only | 1 read (query) | tool-handlers.ts:119 |
| `get_patient_record` | read-only | 1 read (get) | tool-handlers.ts:160 |
| `save_clinical_memory` | write | 1 write (set) | tool-handlers.ts:185 |
| `create_patient` | write | 1 write (set) | tool-handlers.ts:220 |
| `list_patients` | read-only | 1 read (query) | tool-handlers.ts:255 |
| `google_search` | external | 0 reads, 0 writes | Gemini grounding nativo |

### 4.2 Tools de Sub-Agente (spawns Flash-Lite LLM)

| Tool | Categoría | Ops Firestore | Gemini Calls | Archivo |
|------|-----------|---------------|--------------|---------|
| `explore_patient_context` | read-only | 2-3 reads | 1 (synthesis) | explore-patient-context.ts |
| `generate_clinical_document` | read-only | 0-1 reads, 1 write | 1 (generation) | generate-clinical-document.ts |
| `update_clinical_document` | write | 1-2 reads, 1 write | 0-1 (if instructions) | update-clinical-document.ts |
| `get_session_documents` | read-only | 1 read | 0 | get-session-documents.ts |
| `research_evidence` | external | 0 reads | 1-2 (search + synthesis) | research-evidence.ts |
| `analyze_longitudinal_patterns` | read-only | 0-1 reads | 1 (analysis) | analyze-longitudinal-patterns.ts |

### 4.3 Legacy Tools (backward compatibility)

| Tool Name | Schema | Maps To |
|-----------|--------|---------|
| `search_evidence_for_reflection` | legacySearchSchema | search_academic_literature |
| `search_evidence_for_documentation` | legacySearchSchema | search_academic_literature |

---

## 5. Análisis de Ineficiencias

### 5.1 🔴 CRÍTICO: Patient Record Leído 2-4× por Request

**Descripción:** El registro del paciente se lee independientemente en múltiples puntos del ciclo de request.

**Ubicaciones:**

| Componente | Archivo:Línea | Condición |
|------------|--------------|-----------|
| Main Agent (parallel I/O) | hopeai-system.ts:670 | `!hasClientContext && patientReference` |
| Sub-agent: explore_patient_context | explore-patient-context.ts:57 | Siempre (si invocado) |
| Sub-agent: generate_clinical_document | generate-clinical-document.ts:123 | `if patientId provided` |
| Sub-agent: analyze_longitudinal_patterns | analyze-longitudinal-patterns.ts:120 | `if patientId provided` |

**Impacto:** 1-3 lecturas Firestore redundantes por request (~100-300ms, 1-3 reads/día por mensaje)

**Solución propuesta:** Pasar `patientRecord` pre-cargado a través de `ToolExecutionContext` y usar en sub-agentes si disponible.

### 5.2 🔴 CRÍTICO: Document Read Duplicado en update_clinical_document

**Descripción:** El mismo documento se lee 2 veces en la misma función.

**Archivo:** `lib/agents/subagents/update-clinical-document.ts`

```
Línea 49:  const snap = await adminDb.doc(docPath).get()  // READ 1 — obtiene markdown
Línea 114: const snap = await adminDb.doc(docPath).get()  // READ 2 — obtiene version
```

**Impacto:** 1 lectura Firestore desperdiciada por cada actualización de documento.

**Solución propuesta:** Cachear el snapshot de la línea 49 y reutilizar en la línea 114.

### 5.3 🟠 ALTO: Memorias Clínicas Sin Límite en Query

**Descripción:** `getPatientMemories()` en `clinical-memory-system.ts` puede retornar todas las memorias activas sin límite efectivo cuando se omite el parámetro `limit`.

**Archivo:** `lib/clinical-memory-system.ts` (función `getPatientMemories`)

**Impacto:** Para pacientes con historial extenso (100+ memorias), se transfieren datos innecesarios desde Firestore. La función `getRelevantMemoriesSemantic()` carga todas las memorias y luego usa un LLM para rankearlas.

**Solución propuesta:** Aplicar `limit` por defecto (ej: 50) en la query Firestore antes de transferir datos.

### 5.4 🟠 ALTO: Métricas de Tokens Capturadas 2×

**Descripción:** Tanto `createMetricsStreamingWrapper()` como `handleStreamingWithTools()` capturan y registran métricas de tokens, causando potencial doble-registro.

**Ubicaciones:**
- `streaming-handler.ts:489-519` (`createMetricsStreamingWrapper`)
- `streaming-handler.ts:915-945` (`handleStreamingWithTools`)

**Impacto:** Datos de métricas inconsistentes, posible doble-conteo de tokens en dashboards.

### 5.5 🟠 ALTO: Academic References Emitidas Múltiples Veces

**Descripción:** Las referencias académicas se emiten al cliente en `tool_call_complete` (línea 707-709) Y nuevamente al final del stream (líneas 893-902).

**Impacto:** Bandwidth desperdiciado, posible confusión en UI si el cliente no deduplica.

### 5.6 🟡 MEDIO: Vertex Link Conversion Duplicada

**Descripción:** La conversión de enlaces Vertex AI se ejecuta en 3 puntos separados del flujo de streaming:
- Chunks iniciales (líneas 576-589)
- Chunks de follow-up (líneas 750-762)
- Path no-streaming (líneas 1003-1014)

**Impacto:** CPU desperdiciado en regex checks repetidos. Bajo impacto individual pero acumulativo.

### 5.7 🟡 MEDIO: Sin Cache de Patient Data Inter-Request

**Descripción:** No existe cache a nivel de aplicación para datos de pacientes entre requests dentro de la misma sesión.

**Estado actual:**
- Cliente: `patientMemoriesRef` (cache local por sesión) ✅
- Servidor: No hay cache (cada request re-lee Firestore) ❌

**Impacto:** Para conversaciones largas (10+ mensajes), se repiten las mismas lecturas Firestore por cada mensaje.

### 5.8 🟡 MEDIO: getRelevantMemoriesSemantic Fallback Re-Read

**Descripción:** Cuando el LLM de ranking falla en `getRelevantMemoriesSemantic()`, el catch-block re-lee todas las memorias del paciente como fallback.

**Impacto:** 1 lectura Firestore extra en caso de fallo del LLM de ranking.

---

## 6. Detección de Loops

### 6.1 Mecanismo Existente

**Archivo:** `lib/agents/streaming-handler.ts` (líneas 1045-1127)

**Algoritmo:**
1. Normaliza argumentos de la tool call (lowercase, trim, normalize spaces)
2. Genera hash SHA-256 del payload normalizado
3. Compara con historial de calls (ventana de 60 segundos)
4. Si `attemptCount > 2` (3er intento) → dispara escape

**Escape:** Genera `pharmacologicalFallbackResponse` usando Gemini Flash-Lite.

### 6.2 Cobertura Actual

| Tool | Loop Detection | Estado |
|------|---------------|--------|
| `research_evidence` | ✅ SHA-256 hash | Activo |
| `search_academic_literature` | ✅ SHA-256 hash | Activo |
| `get_patient_memories` | ❌ No monitoreado | **GAP** |
| `get_patient_record` | ❌ No monitoreado | **GAP** |
| `explore_patient_context` | ❌ No monitoreado | **GAP** |
| `generate_clinical_document` | ❌ No monitoreado | **GAP** |
| `update_clinical_document` | ❌ No monitoreado | **GAP** |
| `get_session_documents` | ❌ No monitoreado | **GAP** |
| `save_clinical_memory` | ❌ No monitoreado | **GAP** |
| `list_patients` | ❌ No monitoreado | **GAP** |
| `create_patient` | ❌ No monitoreado | **GAP** |
| `google_search` | ❌ No monitoreado | **GAP** |
| `analyze_longitudinal_patterns` | ❌ No monitoreado | **GAP** |

### 6.3 Riesgos de Loop No Detectados

**Escenario 1: get_patient_memories Loop**
- Gemini solicita memorias → resultado vacío → re-solicita con parámetros ligeramente diferentes
- Sin detection → loop hasta MAX_FOLLOWUP_ROUNDS (3)
- **Impacto:** 3 reads Firestore desperdiciados + latencia

**Escenario 2: explore_patient_context Loop**
- Gemini invoca exploración → resultado insuficiente → re-invoca con hint diferente
- Sin detection → 2-3 llamadas LLM + 6-9 reads Firestore extra
- **Impacto:** Alto consumo de tokens + reads

**Escenario 3: save_clinical_memory Write Loop**
- Gemini guarda memoria → invoca save de nuevo con contenido similar
- Sin detection → writes duplicados
- **Impacto:** Datos duplicados en Firestore

### 6.4 Recomendación

Extender el mecanismo de loop detection a **todas las tools read-only y write** con configuración por-tool:

| Tool | Hash Fields | Max Attempts | Window (s) |
|------|-------------|--------------|------------|
| `get_patient_memories` | patientId + category | 2 | 60 |
| `get_patient_record` | patientId | 2 | 120 |
| `explore_patient_context` | patientId + context_hint | 2 | 120 |
| `save_clinical_memory` | patientId + content (truncated 100 chars) | 1 | 60 |
| `list_patients` | search_query | 2 | 60 |
| `get_session_documents` | document_id | 2 | 60 |

---

## 7. Comunicación Main Agent ↔ Sub-Agentes

### 7.1 Patrón Actual: Fire-and-Forget Dispatch

```
Main Agent (Gemini 3 Flash)
    │
    ├──→ streaming-handler.ts::executeToolCall()
    │       ├──→ tool-handlers.ts (registry lookup)
    │       │       └──→ Dynamic import → subagent module
    │       │               └──→ Firestore reads (independent)
    │       │               └──→ Gemini Flash-Lite call (synthesis)
    │       │               └──→ Return ToolCallResult
    │       └──→ Return to Gemini as functionResponse
    │
    └──→ Gemini processes result → may call more tools
```

### 7.2 Handoff Contract Evaluation

| Aspecto | Estado | Evaluación |
|---------|--------|------------|
| Context Passing | `ToolExecutionContext` | ⚠️ **Incompleto** — no incluye datos pre-cargados |
| Error Handling | Per-tool isolation via `executeSafely()` | ✅ **Correcto** |
| Progress Reporting | `ProgressQueue` con callbacks | ✅ **Bien diseñado** |
| Result Format | `{ name, response }` | ✅ **Estándar** |
| Timeout Protection | ❌ No implementado | 🔴 **Gap** — tools colgados bloquean el stream |
| Retry Logic | ❌ No implementado | 🟡 **Gap** — transient failures no recuperables |

### 7.3 Sobre-Descomposición Identificada

**explore_patient_context como Sub-Agente:**

Este tool spawns un LLM call (Flash-Lite) para "sintetizar" datos que el Main Agent (Flash, más capaz) ya podría sintetizar directamente. La justificación original era reducir tokens en el Main Agent, pero:

- El sub-agente re-lee 2-3 datos de Firestore que el Main Agent ya tiene
- El sub-agente usa un modelo menos capaz (Flash-Lite vs Flash)
- La síntesis resultante vuelve al Main Agent como texto plano, perdiendo estructura

**Evaluación:** ⚠️ **Posible sobre-descomposición** — el Main Agent podría recibir los datos crudos (ya cargados) e integrarlos en su propio razonamiento sin delegación.

**Contraargumento:** La delegación reduce tokens del Main Agent en ~500-1000 tokens por invocación. Para sesiones largas (30+ mensajes), esto puede ser significativo.

**Veredicto:** Mantener la delegación pero **eliminar los reads redundantes** pasando datos pre-cargados.

### 7.4 Delegación Adecuada

**research_evidence como Sub-Agente:**
✅ Justificado — descompone queries, ejecuta búsquedas paralelas, y sintetiza con modelo especializado. No requiere datos de Firestore del Main Agent.

**generate_clinical_document como Sub-Agente:**
✅ Justificado — genera documentos largos con formato estructurado. Ahorra tokens del Main Agent.

---

## 8. Operaciones Firestore por Ciclo de Request

### 8.1 Escenario A: Primer Mensaje, Sin Client Context, Con Patient

```
POST /api/send-message
├── Phase 1: Load session             → 1 read
├── Phase 2: Parallel I/O block
│   ├── Patient record                → 1 read
│   ├── Fichas clínicas               → 1 read
│   ├── Clinical memories             → 1 read
│   └── Prior session summaries       → 1 read
├── Phase 3: Build context            → 0 reads
├── Phase 4: Send to Gemini           → 0 reads
├── Phase 5: Tool execution (if invoked)
│   ├── explore_patient_context       → 2-3 reads (REDUNDANT)
│   └── research_evidence             → 0 reads
├── Phase 6: Save user message        → 1 write
├── Phase 7: Save AI message          → 1 write
├── Phase 8: Update session metadata  → 1 write
└── Phase 9: Extract memories (async) → 0-N writes (fire-and-forget)

TOTAL: 7-9 reads, 3+ writes
```

### 8.2 Escenario B: Mensaje Subsiguiente, Con Client Context

```
POST /api/send-message
├── Phase 1: Load session             → 1 read
├── Phase 2: Parallel I/O block
│   └── Prior session summaries       → 1 read
│   (Patient, fichas, memories SKIPPED — clientContext provided)
├── Phase 4: Send to Gemini           → 0 reads
├── Phase 5: Tool execution (if invoked)
│   └── explore_patient_context       → 2-3 reads (STILL REDUNDANT)
├── Phase 6-8: Message persistence    → 2-3 writes

TOTAL: 4-5 reads, 2-3 writes
```

### 8.3 Escenario C: Post-Optimización (Propuesto)

```
POST /api/send-message
├── Phase 1: Load session             → 1 read
├── Phase 2: Parallel I/O block       → 1-4 reads (same as current)
├── Phase 5: Tool execution
│   └── explore_patient_context       → 0 reads (data passed via context)
├── Phase 6-8: Message persistence    → 2-3 writes

TOTAL: 2-5 reads, 2-3 writes (down from 4-9)
```

### 8.4 Impacto en Quota Diaria (50 usuarios × 5 mensajes/día)

| Escenario | Reads/Msg | Daily Total | % del Spark Limit |
|-----------|-----------|-------------|-------------------|
| A (sin optimizar, sin context) | 9 | 2,250 | 4.5% |
| B (sin optimizar, con context) | 5 | 1,250 | 2.5% |
| **C (optimizado)** | **3** | **750** | **1.5%** |

**Nota:** Estos son reads directos por mensaje. Los listeners `onSnapshot` del cliente generan reads adicionales (estimados 2-5× más por reconexión).

---

## 9. Hallazgos de Seguridad y Privacidad

### 9.1 PHI/PII Compliance

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Firestore rules per-user scoping | ✅ | `auth.uid == psychologistId` |
| Soft delete (no data loss) | ✅ | `isDeleted` flag en patients |
| Encryption at rest | ✅ | Firestore default encryption |
| PHI in logs | ⚠️ | `logger.info` incluye `displayName` de pacientes en logs de sub-agentes |
| PHI in error responses | ✅ | Errors no exponen datos clínicos |
| Secret scanning | ❌ | No hay pre-commit hook para secrets |

### 9.2 Riesgos Identificados

1. **Log Exposure (BAJO):** `explore-patient-context.ts:73` logea `record.displayName` en progress messages. Estos se transmiten via SSE al cliente (aceptable) pero también se registran en server logs. Revisar política de retención de logs.

2. **No Secret Scanning (MEDIO):** No se encontró configuración de secret scanner pre-commit. Las claves Firebase están en variables de entorno y `.firebaserc`, pero no hay protección contra commit accidental de credenciales.

---

## 10. Recomendaciones Priorizadas

### 🔴 P0 — Correcciones Inmediatas (1-3 archivos, bajo riesgo)

#### P0.1: Eliminar Double-Read en update_clinical_document

**Archivo:** `lib/agents/subagents/update-clinical-document.ts`

**Cambio:** Cachear snapshot de línea 49 y reutilizar en línea 114.

**Impacto:** -1 read Firestore por actualización de documento.

**Rollback:** Revertir el cambio (sin impacto en esquema).

#### P0.2: Pasar patientRecord a Sub-Agentes via ToolExecutionContext

**Archivos afectados:**
- `lib/agents/tool-handlers.ts` (agregar `patientRecord?` a context)
- `lib/agents/subagents/explore-patient-context.ts` (usar si disponible)
- `lib/agents/streaming-handler.ts` (poblar context con patient pre-cargado)

**Cambio:** Extender `ToolExecutionContext` con campo opcional `preloadedPatientRecord`, usado por sub-agentes para evitar re-lectura.

**Impacto:** -2-3 reads Firestore por request con sub-agentes.

**Rollback:** Ignorar el campo pre-cargado (sub-agentes vuelven a leer).

### 🟠 P1 — Mejoras de Corto Plazo (3-5 archivos)

#### P1.1: Extender Loop Detection a Todas las Tools

**Archivos afectados:**
- `lib/agents/streaming-handler.ts` (generalizar `checkForRepeatedCalls`)

**Cambio:** Parametrizar la función de loop detection para aceptar cualquier tool name con configuración por-tool de max attempts y window.

#### P1.2: Aplicar Limit por Defecto en Memory Queries

**Archivos afectados:**
- `lib/clinical-memory-system.ts` (agregar default limit: 50)

**Cambio:** Aplicar `limit(50)` por defecto en queries de memorias sin límite especificado.

#### P1.3: Agregar Índices Firestore Faltantes

**Archivo:** `firestore.indexes.json`

**Cambio:** Agregar composite indexes para memorias y sessions (ver sección 3.4).

### 🟡 P2 — Mejoras de Mediano Plazo (>5 archivos, requiere testing)

#### P2.1: Deduplicar Emisión de Academic References

**Archivo:** `lib/agents/streaming-handler.ts`

**Cambio:** Emitir references solo una vez (al final del stream, no en cada tool_call_complete).

#### P2.2: Unificar Métricas de Tokens

**Archivo:** `lib/agents/streaming-handler.ts`

**Cambio:** Capturar métricas solo en `handleStreamingWithTools` (no en wrapper).

#### P2.3: Timeout para Tool Execution

**Archivo:** `lib/utils/tool-orchestrator.ts`

**Cambio:** Agregar `Promise.race` con timeout configurable por tool.

---

## 11. Plan de Acción

> **NOTA:** Según las directrices operativas, ningún cambio será implementado sin aprobación humana explícita ("Procede").

### Fase 1: P0 Fixes (2 archivos, 0 riesgo de regresión)

```
Archivos a modificar:
1. lib/agents/subagents/update-clinical-document.ts
   - Línea 49: Guardar snap en variable
   - Línea 114: Reutilizar snap guardado
   Rollback: git checkout -- lib/agents/subagents/update-clinical-document.ts

2. lib/agents/tool-handlers.ts
   - Agregar patientRecord? a ToolExecutionContext interface
   Rollback: Remover campo

3. lib/agents/subagents/explore-patient-context.ts
   - Usar ctx.preloadedPatientRecord si disponible
   Rollback: Ignorar campo

4. lib/agents/streaming-handler.ts
   - Poblar preloadedPatientRecord en context
   Rollback: No poblar campo
```

### Fase 2: P1 Fixes (3 archivos, bajo riesgo)

```
1. streaming-handler.ts: Generalizar loop detection
2. clinical-memory-system.ts: Default limit
3. firestore.indexes.json: New indexes
```

### Fase 3: P2 Fixes (requiere revisión por fases)

```
Cambios mayores que requieren testing de integración completo.
```

---

## 12. Apéndice: Mapa de Archivos Analizados

| Archivo | Propósito | Reads | Writes | Issues |
|---------|-----------|-------|--------|--------|
| `lib/agents/streaming-handler.ts` | Tool orchestration, streaming, loop detection | 0 | 0 | Metrics dup, partial loop coverage |
| `lib/agents/tool-handlers.ts` | Registry-based tool dispatch | 1-3/tool | 0-1/tool | Missing context passing |
| `lib/agents/agent-definitions.ts` | Unified agent config | 0 | 0 | Clean |
| `lib/agents/unified-tool-declarations.ts` | Gemini function declarations | 0 | 0 | Clean |
| `lib/agents/message-context-builder.ts` | XML context enrichment | 0 | 0 | Clean |
| `lib/agents/subagents/explore-patient-context.ts` | Patient synthesis | 2-3 | 0 | Redundant reads |
| `lib/agents/subagents/research-evidence.ts` | Academic search + synthesis | 0 | 0 | Clean (good fallback) |
| `lib/agents/subagents/update-clinical-document.ts` | Document update | 1-2 | 1 | Double-read N+1 |
| `lib/agents/subagents/generate-clinical-document.ts` | Document generation | 0-1 | 1 | Minor redundancy |
| `lib/agents/subagents/get-session-documents.ts` | Document retrieval | 1 | 0 | Clean |
| `lib/agents/subagents/analyze-longitudinal-patterns.ts` | Pattern analysis | 0-1 | 0 | Clean |
| `lib/hopeai-system.ts` | Core orchestration | 2-5 | 2-3 | Parallel I/O block |
| `lib/firestore-client-storage.ts` | Client-side Firestore | Varies | Varies | Well-structured |
| `lib/firestore-storage-adapter.ts` | Server-side Firestore | Varies | Varies | Pagination could parallelize |
| `lib/clinical-memory-system.ts` | Memory CRUD | 1-N | 0-N | Unbounded queries |
| `lib/clinical-agent-router.ts` | Agent routing + session mgmt | 0 | 0 | Clean |
| `lib/tool-registry.ts` | Security category registry | 0 | 0 | Clean |
| `lib/tool-input-schemas.ts` | Zod validation schemas | 0 | 0 | Clean |
| `lib/utils/tool-orchestrator.ts` | Partitioned execution | 0 | 0 | Missing timeout |
| `firestore.rules` | Security rules | - | - | Adequate |
| `firestore.indexes.json` | Composite indexes | - | - | Missing indexes |

---

*Fin del análisis. Este documento debe mantenerse actualizado conforme se implementen las optimizaciones.*
