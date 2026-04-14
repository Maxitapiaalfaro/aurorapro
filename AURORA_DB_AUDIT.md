# AURORA_DB_AUDIT.md

> **Auditoría de Sincronización y Estado (Proyecto Aurora)**
> **Fecha:** 2026-04-14
> **Auditor:** Claude Opus 4.6 (GitHub Agent)
> **Rama:** `claude/audit-data-sync-issues`
> **Esfuerzo:** Maximum (según especificación del prompt)

---

## Resumen Ejecutivo

Aurora es una aplicación clínica que opera con una arquitectura **dual-tier local-first**: IndexedDB (cliente) + Firestore (servidor). Actualmente presenta discrepancias de sincronización entre estas capas que causan:

1. **Pérdida de estado del Canvas al recargar**: Los documentos generados desaparecen tras F5
2. **Contadores de progreso que se resetean a 0**: "Búsqueda completada", "Contexto revisado", "fuentes validadas" muestran 0 en lugar de los valores reales
3. **Recuperación inconsistente por agentes**: Los agentes recuperan datos con <50% de predictibilidad

Este documento diagnostica las causas raíz de estos problemas y propone remediaciones mínimas viables para el lanzamiento beta (7 días).

---

## 1. Arquitectura de Datos Actual

### 1.1 Capa Cliente (IndexedDB)

#### Base de Datos 1: `hopeai_clinical_db` (versión 5)

**Ubicación:** `lib/clinical-context-storage.ts` (355 líneas)

```
hopeai_clinical_db
├── chat_sessions (keyPath: sessionId)
│   ├── Índices: userId, lastUpdated, mode
│   └── Campos: conversationHistory[], metadata, clinicalContext, currentAgent
├── clinical_files (keyPath: id)
│   ├── Índices: sessionId, status
│   └── Campos: fileName, geminiFileUri, uploadedAt, sizeBytes
├── user_preferences (keyPath: userId)
├── fichas_clinicas (keyPath: fichaId)
│   ├── Índices: pacienteId, estado, ultimaActualizacion
│   └── Campos: contenido (markdown), seccionesCompletadas[]
└── pattern_analyses (keyPath: analysisId)
    ├── Índices: patientId, status, createdAt, viewedAt
    └── Campos: patterns[], insights[], recommendations[]
```

#### Base de Datos 2: `HopeAI_PatientLibrary` (versión 1)

**Ubicación:** `lib/patient-persistence.ts` (326 líneas)

```
HopeAI_PatientLibrary
├── patients (keyPath: id)
│   ├── Índices: displayName, tags (multi-entry), createdAt, updatedAt
│   └── Campos: displayName, tags[], lastSessionId, sessionCount
└── patients_index (keyPath: key)
    └── Metadata: totalPatients, lastUpdated
```

### 1.2 Capa Servidor (Firestore)

**Ubicación:** `lib/firestore-client-storage.ts` (618 líneas)

```
firestore/
└── psychologists/{psychologistId}
    ├── patients/{patientId}
    │   ├── sessions/{sessionId}
    │   │   ├── mode, activeAgent, createdAt, lastUpdated
    │   │   ├── metadata: { totalTokens, fileRefs }
    │   │   ├── messages/{messageId}
    │   │   │   ├── content, role, agent, timestamp
    │   │   │   ├── fileReferences: string[]
    │   │   │   ├── groundingUrls: [...]
    │   │   │   └── executionTimeline: { steps: [...] }
    │   │   └── fichaClinica/{fichaId}
    │   └── files/{fileId}
    └── preferences: { theme, language, ... }
```

**Configuración Offline-First:**
- `persistentLocalCache` + `persistentMultipleTabManager`
- `CACHE_SIZE_UNLIMITED` (correcto para datos PHI)
- `merge: true` en todas las escrituras (idempotencia)

---

## 2. Discrepancias Identificadas

### 2.1 PROBLEMA: Canvas Pierde Estado al Recargar

#### Síntomas Observados

1. Usuario genera documento clínico vía agente `clinico`
2. `DocumentPreviewPanel` muestra el documento correctamente
3. Usuario presiona F5 (recarga de página)
4. **Resultado:** Canvas vuelve al estado vacío, documento desaparecido

#### Diagnóstico de Flujo

**Flujo de Generación de Documento (CORRECTO):**

```
1. SSE /api/send-message → DocumentPreviewEvent emitido
   └─ Archivo: hooks/use-hopeai-system.ts:1095-1125
   └─ onDocumentPreview(event) actualiza estado local

2. Estado local actualiza → ClinicalCanvas renderiza DocumentPreviewPanel
   └─ Archivo: components/clinical-canvas.tsx:212-228
   └─ hasDocumentContent = !!(documentPreview || documentReady) && isDocumentPanelOpen

3. Al completar, DocumentReadyEvent emitido
   └─ Archivo: hooks/use-hopeai-system.ts:1127-1153
   └─ onDocumentReady(event) → setActiveDocument(event.document)

4. Documento persiste vía setActiveDocument
   └─ Archivo: hooks/use-hopeai-system.ts:1277-1300
   └─ Firestore write: set(docRef, {...}, { merge: true })
```

**Flujo de Recuperación al Recargar (ROTO):**

```
1. Usuario recarga página → useEffect de inicialización ejecuta
   └─ Archivo: hooks/use-hopeai-system.ts:175-224

2. initialize() NO recupera documentos previos
   └─ Problema: Solo recupera sessionId, userId, patientId del state
   └─ NO llama a loadSessionDocuments() o similar

3. activeDocument queda null → Canvas muestra empty state
   └─ Archivo: components/clinical-canvas.tsx:262
   └─ <CanvasEmptyState activeDocument={activeDocument} onReopen={...} />
```

#### Causa Raíz

**El hook `useHopeAISystem` NO rehidrata `activeDocument` desde Firestore al montar.**

**Evidencia en código:**

```typescript
// lib/firestore-client-storage.ts:354-391
async getActiveDocumentForSession(sessionId: string): Promise<ClinicalDocument | null> {
  // ✅ FUNCIÓN EXISTE pero NO ES LLAMADA en el useEffect de inicialización
  const docs = await getDocs(
    query(collection(db, `${basePath}/documents`), orderBy('timestamp', 'desc'), limit(1))
  );
  if (docs.empty) return null;
  return docs.docs[0].data() as ClinicalDocument;
}
```

```typescript
// hooks/use-hopeai-system.ts:175-224 (useEffect de inicialización)
useEffect(() => {
  const init = async () => {
    // ... recupera sessionId, userId, patientId
    // ❌ FALTA: recuperar activeDocument
    // ❌ FALTA: recuperar documentPreview si estaba en streaming
  }
  init();
}, []);
```

#### Solución Quirúrgica

**Agregar recuperación de documento activo en inicialización:**

```typescript
// En hooks/use-hopeai-system.ts, línea ~210 (dentro del useEffect init)

if (sessionId) {
  // Recuperar documento activo
  const activeDoc = await firestoreStorage.getActiveDocumentForSession(sessionId);
  if (activeDoc) {
    setActiveDocument(activeDoc);
    setIsDocumentPanelOpen(true); // Auto-abrir si existía
  }
}
```

**Archivos a modificar:**
1. `hooks/use-hopeai-system.ts` — agregar llamada a `getActiveDocumentForSession`
2. Ningún otro cambio necesario (función ya existe)

---

### 2.2 PROBLEMA: Contadores de Progreso en 0

#### Síntomas Observados

En los componentes de visualización de progreso:

1. `ExecutionTimeline` muestra "0 validadas" en lugar de "3/5 fuentes validadas"
2. `CognitiveTransparencyPanel` muestra "0 encontradas" en lugar del conteo real
3. `ChatInterface` academic results badge muestra "0 fuentes validadas de 0 encontradas"

#### Diagnóstico de Flujo

**Estructura de ExecutionStep con Resultado:**

```typescript
// types/clinical-types.ts:53-72
export interface ExecutionStep {
  id: string;
  tool: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  timestamp?: number;
  startTime?: number;
  endTime?: number;
  result?: {
    sourcesFound?: number;        // ← Debería ser 5
    sourcesValidated?: number;    // ← Debería ser 3
    summary?: string;
    error?: string;
    output?: unknown;
  };
}
```

**Flujo de Construcción del ExecutionTimeline:**

```
1. Agent ejecuta tool vía streaming-handler.ts
   └─ Archivo: lib/agents/streaming-handler.ts:965-1090
   └─ executeToolCall() → handler returns result object

2. Result object emitido vía SSE
   └─ result = { sourcesFound: 5, sourcesValidated: 3, ... }
   └─ encoder.encode(`data: ${JSON.stringify({ ...result })}\n\n`)

3. Cliente recibe en SSE handler
   └─ Archivo: hooks/use-hopeai-system.ts:870-920
   └─ onToolResult(stepId, result) llamado

4. buildLiveTimeline reconstruye steps
   └─ Archivo: lib/dynamic-status.ts:347-483
   └─ buildLiveTimeline(activeTools, completedTools, stepResults)

5. ❌ AQUÍ ESTÁ EL PROBLEMA: stepResults NO persiste correctamente
```

**Análisis de buildLiveTimeline:**

```typescript
// lib/dynamic-status.ts:380-420
export function buildLiveTimeline(
  activeTools: ToolCall[],
  completedTools: ToolCall[],
  stepResults: Map<string, ToolExecutionResult>  // ← Mapa en memoria
): ExecutionStep[] {
  // ...
  const step: ExecutionStep = {
    id: tool.id,
    tool: tool.name,
    status: 'completed',
    result: stepResults.get(tool.id) || undefined  // ← Busca en mapa
  };
}
```

**Problema:** `stepResults` es un `Map` en memoria en el hook, no persiste en Firestore.

#### Causa Raíz

**Los resultados de tools NO se persisten en Firestore junto con el ExecutionStep.**

**Evidencia:**

```typescript
// hooks/use-hopeai-system.ts:912-918
const onToolResult = useCallback((stepId: string, result: ToolExecutionResult) => {
  setStepResults(prev => {
    const updated = new Map(prev);
    updated.set(stepId, result);  // ✅ Actualiza Map en memoria
    return updated;
  });
  // ❌ FALTA: Persistir result en Firestore
}, []);
```

```typescript
// lib/firestore-client-storage.ts:461-518
async saveExecutionStep(step: ExecutionStep): Promise<void> {
  // ... guarda step en Firestore
  await setDoc(stepRef, stepData, { merge: true });
  // ✅ step.result SE GUARDA si existe en el objeto step
  // ❌ PERO onToolResult NO llama a saveExecutionStep después de actualizar
}
```

#### Solución Quirúrgica

**Opción A: Persistir result inmediatamente al recibirlo (RECOMENDADA)**

```typescript
// En hooks/use-hopeai-system.ts, función onToolResult (~línea 912)

const onToolResult = useCallback((stepId: string, result: ToolExecutionResult) => {
  setStepResults(prev => {
    const updated = new Map(prev);
    updated.set(stepId, result);
    return updated;
  });

  // NUEVO: Persistir result en Firestore
  (async () => {
    if (!currentSessionId) return;
    const storage = await getFirestoreClientStorage();
    // Actualizar el step existente con el result
    await storage.updateExecutionStepResult(currentSessionId, stepId, result);
  })().catch(err => logger.error('Failed to persist tool result:', err));
}, [currentSessionId]);
```

**Nueva función en firestore-client-storage.ts:**

```typescript
async updateExecutionStepResult(
  sessionId: string,
  stepId: string,
  result: ToolExecutionResult
): Promise<void> {
  const stepRef = doc(db, `${this.basePath(sessionId)}/executionSteps/${stepId}`);
  await setDoc(stepRef, { result }, { merge: true });
}
```

**Opción B: Recuperar stepResults de Firestore al recargar**

Agregar en inicialización:

```typescript
const steps = await storage.getExecutionSteps(sessionId);
const resultsMap = new Map(steps.map(s => [s.id, s.result]).filter(([_, r]) => r));
setStepResults(resultsMap);
```

**Recomendación:** Implementar **AMBAS** opciones para garantizar persistencia y recuperación.

**Archivos a modificar:**
1. `hooks/use-hopeai-system.ts` — Agregar persistencia en onToolResult
2. `lib/firestore-client-storage.ts` — Nueva función updateExecutionStepResult
3. `hooks/use-hopeai-system.ts` — Recuperar stepResults en init

---

### 2.3 PROBLEMA: Recuperación Inconsistente por Agentes (<50%)

#### Síntomas Observados

Los agentes (especialmente `explore-patient-context` y `research-evidence`) fallan al recuperar:

1. Historial de sesiones anteriores del paciente
2. Documentos previamente generados
3. Pattern analyses del paciente
4. Contexto de fichaclinica

La predictibilidad es <50%, causando respuestas inconsistentes.

#### Diagnóstico de Flujo

**Flujo de Construcción de Contexto del Paciente:**

```
1. Agent requiere contexto → loadPatientContext llamado
   └─ Archivo: lib/agents/subagents/explore-patient-context.ts:45-80

2. Verifica preloadedPatientRecord en context
   └─ Archivo: lib/agents/subagents/explore-patient-context.ts:48-55
   └─ if (ctx.preloadedPatientRecord?.id === patientId) { usePreloaded = true }

3. Si NO preloaded, carga desde Firestore
   └─ Archivo: lib/agents/subagents/explore-patient-context.ts:57-72
   └─ const patient = await firestoreStorage.getPatient(patientId);

4. ❌ PROBLEMA: preloadedPatientRecord NO siempre se pasa en el contexto
```

**Análisis del Contexto de Ejecución de Tools:**

```typescript
// lib/agents/tool-handlers.ts:38-47
export interface ToolExecutionContext {
  sessionId: string;
  psychologistId: string;
  patientId?: string;
  preloadedPatientRecord?: PatientRecord; // ← OPCIONAL, no siempre presente
  userMessage: string;
  conversationHistory: ChatMessage[];
  currentAgent: AgentType;
  onProgress?: (message: string) => void;
}
```

**Flujo de Creación del Contexto:**

```typescript
// lib/agents/streaming-handler.ts:265-310
const ctx: ToolExecutionContext = {
  sessionId,
  psychologistId,
  patientId: session.patientId,
  preloadedPatientRecord: session.patientId
    ? await firestoreStorage.getPatient(session.patientId)
    : undefined,  // ← Se carga AQUÍ, pero...
  // ...
};
```

**PROBLEMA CRÍTICO:** La precarga depende de `session.patientId` existiendo en el momento de `prepareFunctionCallWithSecurity`.

**Verificación de session.patientId:**

```typescript
// lib/firestore-client-storage.ts:180-242 (loadSession)
async loadSession(sessionId: string): Promise<ChatState | null> {
  const sessionDoc = await getDoc(sessionRef);
  if (!sessionDoc.exists()) return null;

  return {
    sessionId,
    userId: data.psychologistId || data.userId,
    mode: data.mode,
    patientId: data.patientId,  // ← Recuperado de Firestore
    // ...
  };
}
```

**PERO:**

```typescript
// hooks/use-hopeai-system.ts:554-585 (updatePatientContext)
const updatePatientContext = useCallback(async (patient: PatientRecord | null) => {
  // ...
  setCurrentPatient(patient);
  setCurrentPatientId(patient?.id ?? null);

  // ❌ NO actualiza session.patientId inmediatamente en Firestore
  // Solo actualiza estado local
}, []);
```

#### Causa Raíz

**Discrepancia entre estado local y Firestore para `session.patientId`:**

1. Usuario selecciona paciente → `updatePatientContext` actualiza estado local
2. Estado local: `currentPatientId` se establece
3. **Firestore session NO se actualiza inmediatamente**
4. Siguiente turno → `streaming-handler` lee session de Firestore
5. `session.patientId` es `undefined` → `preloadedPatientRecord` no se carga
6. Agent intenta cargar desde Firestore → **race condition o caché vacío**
7. Agent falla o devuelve contexto incompleto

#### Solución Quirúrgica

**Opción 1: Fire-and-forget update de session.patientId (RECOMENDADA)**

```typescript
// En hooks/use-hopeai-system.ts, función updatePatientContext (~línea 560)

const updatePatientContext = useCallback(async (patient: PatientRecord | null) => {
  setCurrentPatient(patient);
  setCurrentPatientId(patient?.id ?? null);

  // NUEVO: Persistir patientId en Firestore inmediatamente
  if (currentSessionId) {
    const storage = await getFirestoreClientStorage();
    await storage.updateSessionPatientId(currentSessionId, patient?.id ?? null);
  }
}, [currentSessionId]);
```

**Nueva función en firestore-client-storage.ts:**

```typescript
async updateSessionPatientId(sessionId: string, patientId: string | null): Promise<void> {
  const sessionRef = doc(db, `${this.basePath(sessionId)}`);
  await setDoc(sessionRef, { patientId }, { merge: true });
}
```

**Opción 2: Forzar recarga de session antes de tool execution**

En `streaming-handler.ts`, antes de crear el contexto:

```typescript
// Recargar session desde Firestore para garantizar patientId actualizado
const freshSession = await firestoreStorage.loadSession(sessionId);
if (!freshSession) throw new Error('Session not found');

const ctx: ToolExecutionContext = {
  // ...
  patientId: freshSession.patientId,
  preloadedPatientRecord: freshSession.patientId
    ? await firestoreStorage.getPatient(freshSession.patientId)
    : undefined,
};
```

**Recomendación:** Implementar **Opción 1** para evitar lecturas adicionales de Firestore.

**Archivos a modificar:**
1. `hooks/use-hopeai-system.ts` — Persistir patientId en updatePatientContext
2. `lib/firestore-client-storage.ts` — Nueva función updateSessionPatientId

---

### 2.4 PROBLEMA SECUNDARIO: Pattern Analyses con ViewedAt null

#### Síntomas Observados

En `clinical-cases-workhub.tsx`, el hook carga análisis pendientes:

```typescript
// Líneas 52-72
const pending = await storage.getPendingReviewAnalyses();
```

El conteo de insights (`patientInsights`) se calcula correctamente y se muestra en `CaseListPanel`, pero:

1. Los análisis con `viewedAt: null` nunca se marcan como vistos
2. El badge de insights permanece indefinidamente
3. No hay lógica de "marcar como visto" al abrir el panel

#### Causa Raíz

**La función `markAnalysisAsViewed` existe pero NO se llama en la UI.**

**Evidencia:**

```typescript
// lib/pattern-analysis-storage.ts:115-125
async markAnalysisAsViewed(analysisId: string): Promise<void> {
  // ✅ FUNCIÓN IMPLEMENTADA
  const db = await this.initDB();
  const tx = db.transaction('pattern_analyses', 'readwrite');
  const store = tx.objectStore('pattern_analyses');
  const analysis = await store.get(analysisId);
  if (analysis) {
    analysis.viewedAt = Date.now();
    await store.put(analysis);
  }
}
```

```typescript
// components/clinical-cases/case-detail-panel.tsx
// ❌ NO llama a markAnalysisAsViewed al abrir tab de insights
```

#### Solución Quirúrgica

**Agregar efecto de "marcar como visto" al montar el tab de insights:**

```typescript
// En case-detail-panel.tsx, al cambiar a tab="insights"

useEffect(() => {
  if (activeTab === 'insights' && hasInsights) {
    // Marcar análisis pendientes como vistos
    (async () => {
      const storage = await getPatternAnalysisStorage();
      const pending = await storage.getPendingReviewAnalyses();
      const forThisPatient = pending.filter(a => a.patientId === patient.id);
      await Promise.all(forThisPatient.map(a => storage.markAnalysisAsViewed(a.analysisId)));
    })();
  }
}, [activeTab, hasInsights, patient.id]);
```

**Archivos a modificar:**
1. `components/clinical-cases/case-detail-panel.tsx` — Agregar useEffect

---

## 3. Resumen de Causas Raíz

| Problema | Causa Raíz | Componente Afectado |
|----------|-----------|---------------------|
| **Canvas pierde estado** | `activeDocument` NO se rehidrata desde Firestore al montar | `hooks/use-hopeai-system.ts` |
| **Contadores en 0** | `stepResults` Map en memoria NO persiste en Firestore | `hooks/use-hopeai-system.ts` + `lib/firestore-client-storage.ts` |
| **Recuperación inconsistente** | `session.patientId` no se actualiza inmediatamente en Firestore | `hooks/use-hopeai-system.ts` |
| **Insights no vistos** | `markAnalysisAsViewed` NO se llama en UI | `components/clinical-cases/case-detail-panel.tsx` |

---

## 4. Plan de Remediación Mínima Viable

### Prioridad P0 (Bloqueadores de Beta)

#### Fix 1: Rehidratar activeDocument al inicializar

**Archivos:**
- `hooks/use-hopeai-system.ts` (línea ~210, dentro del useEffect init)

**Cambios:**
```typescript
if (sessionId) {
  const activeDoc = await firestoreStorage.getActiveDocumentForSession(sessionId);
  if (activeDoc) {
    setActiveDocument(activeDoc);
    setIsDocumentPanelOpen(true);
  }
}
```

**Impacto:** BAJO — función ya existe, solo agregar llamada
**Riesgo:** BAJO — no rompe flujos existentes
**Tiempo estimado:** 15 minutos

---

#### Fix 2A: Persistir stepResults al recibir onToolResult

**Archivos:**
- `hooks/use-hopeai-system.ts` (función onToolResult, línea ~912)
- `lib/firestore-client-storage.ts` (nueva función updateExecutionStepResult)

**Cambios:**
```typescript
// En onToolResult
const onToolResult = useCallback((stepId: string, result: ToolExecutionResult) => {
  setStepResults(prev => {
    const updated = new Map(prev);
    updated.set(stepId, result);
    return updated;
  });

  (async () => {
    if (!currentSessionId) return;
    const storage = await getFirestoreClientStorage();
    await storage.updateExecutionStepResult(currentSessionId, stepId, result);
  })().catch(err => logger.error('Failed to persist tool result:', err));
}, [currentSessionId]);
```

```typescript
// Nueva función en firestore-client-storage.ts
async updateExecutionStepResult(
  sessionId: string,
  stepId: string,
  result: ToolExecutionResult
): Promise<void> {
  const stepRef = doc(db, `${this.basePath(sessionId)}/executionSteps/${stepId}`);
  await setDoc(stepRef, { result }, { merge: true });
}
```

**Impacto:** MEDIO — agrega escritura Firestore por tool result
**Riesgo:** BAJO — merge:true previene sobrescrituras
**Tiempo estimado:** 30 minutos

---

#### Fix 2B: Recuperar stepResults de Firestore al inicializar

**Archivos:**
- `hooks/use-hopeai-system.ts` (useEffect init, línea ~210)

**Cambios:**
```typescript
if (sessionId) {
  const steps = await firestoreStorage.getExecutionSteps(sessionId);
  const resultsMap = new Map(
    steps.map(s => [s.id, s.result]).filter(([_, r]) => r)
  );
  setStepResults(resultsMap);
}
```

**Impacto:** BAJO — lectura única al montar
**Riesgo:** BAJO — no altera flujos activos
**Tiempo estimado:** 10 minutos

---

#### Fix 3: Persistir session.patientId inmediatamente

**Archivos:**
- `hooks/use-hopeai-system.ts` (función updatePatientContext, línea ~560)
- `lib/firestore-client-storage.ts` (nueva función updateSessionPatientId)

**Cambios:**
```typescript
// En updatePatientContext
const updatePatientContext = useCallback(async (patient: PatientRecord | null) => {
  setCurrentPatient(patient);
  setCurrentPatientId(patient?.id ?? null);

  if (currentSessionId) {
    const storage = await getFirestoreClientStorage();
    await storage.updateSessionPatientId(currentSessionId, patient?.id ?? null);
  }
}, [currentSessionId]);
```

```typescript
// Nueva función en firestore-client-storage.ts
async updateSessionPatientId(sessionId: string, patientId: string | null): Promise<void> {
  const sessionRef = doc(db, `${this.basePath(sessionId)}`);
  await setDoc(sessionRef, { patientId }, { merge: true });
}
```

**Impacto:** BAJO — fire-and-forget, no bloquea UI
**Riesgo:** BAJO — merge:true, idempotente
**Tiempo estimado:** 20 minutos

---

### Prioridad P1 (Mejoras de UX)

#### Fix 4: Marcar insights como vistos

**Archivos:**
- `components/clinical-cases/case-detail-panel.tsx`

**Cambios:**
```typescript
useEffect(() => {
  if (activeTab === 'insights' && hasInsights) {
    (async () => {
      const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage');
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      const pending = await storage.getPendingReviewAnalyses();
      const forThisPatient = pending.filter(a => a.patientId === patient.id);
      await Promise.all(forThisPatient.map(a => storage.markAnalysisAsViewed(a.analysisId)));
    })();
  }
}, [activeTab, hasInsights, patient.id]);
```

**Impacto:** BAJO — mejora visual, no crítico
**Riesgo:** NULO — solo actualiza campo viewedAt
**Tiempo estimado:** 15 minutos

---

## 5. Decisiones Arquitectónicas NO Requeridas

### ❌ NO Refactorizar el Sistema de Sincronización

**Justificación:** La arquitectura IndexedDB + Firestore con `persistentLocalCache` es **sólida**. Los problemas son de rehidratación y persistencia parcial, no de diseño fundamental.

### ❌ NO Implementar Resolución de Conflictos UI

**Justificación:** `merge:true` + `persistentMultipleTabManager` ya manejan conflictos básicos. Una UI de diff visual es **P2** (post-beta).

### ❌ NO Cifrar Contenido en Cliente

**Justificación:** Rompe el flujo de construcción de contexto para Gemini (ver §3.4 del documento `data-layer-architecture-firestore.md`). Google-managed encryption es suficiente para beta.

### ❌ NO Agregar Cola de Mensajes Offline

**Justificación:** El bloqueo de input durante procesamiento es **intencional** en contexto clínico (ver `UX_LOCAL_FIRST_AUDIT.md` §3.4).

---

## 6. Testing de las Remediaciones

### Escenario 1: Persistencia de activeDocument

**Pasos:**
1. Iniciar sesión con paciente
2. Generar documento clínico vía agent
3. Verificar que Canvas muestra documento
4. Presionar F5 (recarga completa)
5. **Resultado esperado:** Canvas muestra el mismo documento

**Validación:**
```typescript
// En consola del navegador
const storage = await import('/lib/firestore-client-storage');
const client = await storage.getFirestoreClientStorage();
const doc = await client.getActiveDocumentForSession(sessionId);
console.log('Active document:', doc);
```

---

### Escenario 2: stepResults Persistidos

**Pasos:**
1. Iniciar conversación académica
2. Trigger tool `research_evidence`
3. Verificar que ExecutionTimeline muestra "3/5 fuentes validadas"
4. Presionar F5
5. **Resultado esperado:** Timeline sigue mostrando "3/5 fuentes validadas"

**Validación:**
```typescript
// En consola
const storage = await import('/lib/firestore-client-storage');
const client = await storage.getFirestoreClientStorage();
const steps = await client.getExecutionSteps(sessionId);
console.log('Steps with results:', steps.filter(s => s.result));
```

---

### Escenario 3: session.patientId Inmediato

**Pasos:**
1. Seleccionar paciente desde biblioteca
2. Enviar mensaje al agente
3. Verificar en Firestore Console que `sessions/{sessionId}.patientId` existe
4. Enviar segundo mensaje
5. **Resultado esperado:** Agent recupera contexto del paciente correctamente

**Validación:**
```bash
# Firebase CLI o Firestore Console
firebase firestore:get "psychologists/{uid}/patients/{pid}/sessions/{sid}"
# Verificar campo patientId presente
```

---

## 7. Métricas de Éxito

| Métrica | Baseline Actual | Target Post-Fix |
|---------|-----------------|-----------------|
| Canvas persiste tras recarga | 0% (siempre vacío) | 100% |
| Contadores de progreso correctos | ~0% (siempre 0) | 100% |
| Recuperación de contexto por agents | <50% | >95% |
| Insights marcados como vistos | 0% (badge permanente) | 100% |

---

## 8. Riesgos y Mitigaciones

### Riesgo 1: Fix 2A agrega latencia a tool results

**Probabilidad:** Media
**Impacto:** Bajo (solo afecta visualización)
**Mitigación:** Fire-and-forget con .catch() → no bloquea SSE stream

### Riesgo 2: Race condition entre estado local y Firestore

**Probabilidad:** Baja
**Impacto:** Medio (duplicación de datos)
**Mitigación:** Usar `merge:true` en todas las escrituras (ya implementado)

### Riesgo 3: Exceso de lecturas Firestore en init

**Probabilidad:** Baja
**Impacto:** Medio (costo de operación)
**Mitigación:** Cachear resultados en sessionStorage, cargar solo si es distinto sessionId

---

## 9. Conclusiones

### Hallazgos Clave

1. **La arquitectura de sincronización NO está rota** — es la rehidratación parcial
2. **Las funciones de persistencia YA EXISTEN** — solo falta llamarlas
3. **Los problemas son de LINKAGE, no de diseño** — fixes quirúrgicos aplicables

### Mandato de Mínima Viabilidad

**Total de cambios requeridos:**
- 4 funciones modificadas
- 2 funciones nuevas (10 líneas cada una)
- 1 useEffect agregado
- **Tiempo total estimado: 90 minutos**

**NO se requiere:**
- Refactorizar storage adapters
- Cambiar modelo de datos
- Implementar nuevos mecanismos de sync

### Recomendación Final

**Proceder con los 4 fixes en el orden documentado.** La aplicación está a 90 minutos de resolver los problemas críticos de sincronización sin introducir complejidad arquitectónica.

---

## 10. Apéndice: Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│  USUARIO                                                         │
│  └─ Genera documento → Canvas muestra preview                   │
│     ✓ onDocumentReady → setActiveDocument (estado local)        │
│     ✓ Firestore write (merge:true)                              │
│     ❌ F5 (recarga) → useEffect init NO recupera activeDocument  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  AGENTE                                                          │
│  └─ Tool execution → research_evidence devuelve result           │
│     ✓ onToolResult → setStepResults (Map en memoria)            │
│     ❌ result NO se persiste en Firestore                        │
│     ❌ F5 → stepResults queda vacío → contadores en 0            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXTO PACIENTE                                               │
│  └─ updatePatientContext → setCurrentPatientId (estado local)   │
│     ❌ session.patientId NO se actualiza en Firestore            │
│     └─ Siguiente turno → streaming-handler lee session           │
│        └─ session.patientId undefined → preload falla            │
│           └─ Agent intenta cargar → race condition → <50%       │
└─────────────────────────────────────────────────────────────────┘
```

**FIN DEL AUDIT**

---

**Siguiente paso:** Presentar este documento al equipo para aprobación. Una vez aprobado con la palabra "Proceed", implementar los fixes en el orden documentado.
