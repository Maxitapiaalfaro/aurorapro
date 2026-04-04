# Arquitectura de Capa de Datos: Migración a Firestore + Firebase Auth

> **Documento de diseño de arquitectura — Data Layer Architecture**
> Fecha: 2026-04-04
> Versión: 1.0
> Basado en: Análisis del código fuente actual de Aurora y patrones de referencia de Claude Code (`docs/architecture/claude/claude-code-main`).

---

## Tabla de Contenidos

1. [Estado Actual de Aurora (Baseline)](#1-estado-actual-de-aurora-baseline)
2. [Modelo de Datos Clínico en Firestore](#2-modelo-de-datos-clínico-en-firestore)
3. [Estrategia Offline-First](#3-estrategia-offline-first)
4. [Traducción del Patrón Claude → Firestore](#4-traducción-del-patrón-claude--firestore)
5. [Autenticación con Firebase Auth](#5-autenticación-con-firebase-auth)
6. [Plan de Migración](#6-plan-de-migración)

---

## 1. Estado Actual de Aurora (Baseline)

### 1.1 Arquitectura de Almacenamiento Actual

Aurora opera con una arquitectura **dual-tier** sin autenticación real:

```
┌─────────────────────────────────────────────────────────┐
│  CLIENTE (Browser)                                      │
│  ┌─────────────────────────────────────────────────┐    │
│  │  IndexedDB: hopeai_clinical_db (v5)             │    │
│  │  ├── chat_sessions    (keyPath: sessionId)      │    │
│  │  ├── clinical_files   (keyPath: id)             │    │
│  │  ├── user_preferences (keyPath: userId)         │    │
│  │  ├── fichas_clinicas  (keyPath: fichaId)        │    │
│  │  └── pattern_analyses (keyPath: analysisId)     │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  IndexedDB: HopeAI_PatientLibrary (v1)          │    │
│  │  ├── patients        (keyPath: id)              │    │
│  │  └── patients_index  (keyPath: key)             │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  localStorage                                    │    │
│  │  └── hopeai_optimized_context_*  (<=5MB/sesión) │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  SERVIDOR (Next.js API Routes)                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Tier 1: RAM Cache (50 sesiones, 30min TTL)     │    │
│  │  Tier 2: SQLite + AES-256-GCM (aurora-hipaa.db) │    │
│  │  └── Tabla: sessions (encrypted_data BLOB)      │    │
│  │  └── Tabla: audit_log (timestamp, user, action) │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Fuente:** `lib/clinical-context-storage.ts` (355 líneas, IndexedDB client), `lib/hipaa-compliant-storage.ts` (SQLite server), `lib/patient-persistence.ts` (326 líneas, IndexedDB patients).

### 1.2 Problemas Identificados

| Problema | Evidencia en Código | Impacto |
|----------|---------------------|---------|
| **Sin autenticación** | `hooks/use-hopeai-system.ts` línea 85: `userId: 'demo_user'` | Cualquier usuario accede a todos los datos |
| **Sin aislamiento multi-tenant** | `lib/hopeai-system.ts` línea 433: userId es un string arbitrario sin validación | Los datos de pacientes no están aislados por psicólogo |
| **IndexedDB manual** | `lib/clinical-context-storage.ts`: gestión manual de IDB con 5 object stores | Sin sincronización offline→cloud, datos atrapados en un navegador |
| **Dos IndexedDBs separadas** | `hopeai_clinical_db` + `HopeAI_PatientLibrary` como DBs independientes | Inconsistencia y complejidad de gestión |
| **SQLite server efímero** | `lib/hipaa-compliant-storage.ts` línea 194: `dbPath: './data/aurora-hipaa.db'` | En Vercel/serverless el filesystem es efímero; los datos se pierden |
| **localStorage para contexto** | `lib/client-context-persistence.ts`: prefijo `hopeai_optimized_context_` | Límite de 5MB, no sincronizable, sin estructura |
| **Supabase instalado pero sin usar** | `package.json` línea 54: `@supabase/supabase-js@^2.76.1` | Dependencia muerta que agrega peso |

---

## 2. Modelo de Datos Clínico en Firestore

### 2.1 Principio de Diseño: Aislamiento Total por Psicólogo

El modelo usa una **jerarquía de colecciones anidadas** con el `psychologistId` (UID de Firebase Auth) como raíz de aislamiento. Esto garantiza multi-tenancy a nivel de estructura, no solo de queries.

```
firestore/
├── psychologists/{psychologistId}                    ← Documento raíz (1 por psicólogo)
│   ├── preferences: { ... }                          ← Config del psicólogo
│   ├── patients/{patientId}                          ← Subcolección de pacientes
│   │   ├── displayName, demographics, tags, notes
│   │   ├── confidentiality: { level, restrictions }
│   │   ├── summaryCache: { content, hash, version }
│   │   ├── sessions/{sessionId}                      ← Subcolección de sesiones
│   │   │   ├── mode, activeAgent, createdAt, lastUpdated
│   │   │   ├── metadata: { totalTokens, fileRefs }
│   │   │   ├── clinicalContext: { sessionType, confidentialityLevel }
│   │   │   ├── riskState: { ... }
│   │   │   ├── messages/{messageId}                  ← Subcolección de mensajes
│   │   │   │   ├── content, role, agent, timestamp
│   │   │   │   ├── fileReferences: string[]
│   │   │   │   ├── groundingUrls: [...]
│   │   │   │   ├── executionTimeline: { ... }
│   │   │   │   └── reasoningBullets: [...]
│   │   │   └── fichaClinica/{fichaId}                ← Subcolección (0-1 por sesión)
│   │   │       ├── content, estado, formato
│   │   │       └── ultimaActualizacion
│   │   └── files/{fileId}                            ← Archivos del paciente
│   │       ├── name, type, size, status
│   │       ├── geminiFileUri, geminiFileId
│   │       └── sessionId (referencia cruzada)
│   ├── agentMemories/{memoryId}                      ← Memoria inter-sesión (futuro)
│   │   ├── type: 'observation' | 'pattern' | 'preference' | 'finding'
│   │   ├── content, patientId?, sessionId?
│   │   ├── createdAt, relevanceScore
│   │   └── tags: string[]
│   └── metrics/{metricId}                            ← Métricas de uso (opcional)
│       ├── sessionId, agentUsed, tokensUsed, cost
│       └── timestamp, responseTime
```

### 2.2 Justificación de la Estructura

**¿Por qué subcolecciones anidadas en lugar de colecciones raíz con campo `psychologistId`?**

1. **Aislamiento estructural:** Las Security Rules de Firestore se aplican por path. Con `psychologists/{uid}/patients/{pid}`, la regla `request.auth.uid == uid` aísla TODOS los datos descendientes. Con colecciones raíz, cada query debe filtrar por `psychologistId`, y un bug en un query expone datos de otros psicólogos.

2. **Lectura eficiente:** Listar pacientes de un psicólogo es `collection('psychologists/{uid}/patients')` sin filtro adicional. Con colección raíz sería `collection('patients').where('psychologistId', '==', uid)`, que requiere un índice y es más lento.

3. **Consistencia con el modelo actual:** Aurora ya organiza los datos por `userId` → sessions → messages. La jerarquía propuesta mapea directamente a esta estructura (ver §2.4).

### 2.3 Documentos vs. Subcolecciones: Mensajes

**Decisión crítica:** Los mensajes se almacenan como **subcolección** (`messages/{messageId}`), no como array dentro del documento de sesión.

**Razón:**
- Un documento Firestore tiene un límite de **1 MiB**. Una sesión terapéutica larga con ejecutionTimeline, groundingUrls y reasoningBullets por mensaje puede superar este límite fácilmente.
- Los mensajes como subcolección permiten **paginación lazy** (`orderBy('timestamp').limit(50)`), esencial para el patrón de eficiencia descrito en §4.
- Las escrituras son atómicas por documento; los mensajes se escriben uno a uno durante el streaming, sin bloquear el documento de sesión.

**Excepción:** `fichaClinica` puede ser un solo documento (no crece indefinidamente) en una subcolección de 0-1 documentos bajo la sesión.

### 2.4 Mapeo Directo: Tipos Actuales → Documentos Firestore

| Tipo Actual (Aurora) | Ubicación Actual | Documento Firestore |
|----------------------|------------------|---------------------|
| `ChatState` | `clinical-context-storage.ts` → `chat_sessions` store | `psychologists/{uid}/patients/{pid}/sessions/{sid}` |
| `ChatMessage` | Dentro de `ChatState.history[]` (array) | `psychologists/{uid}/patients/{pid}/sessions/{sid}/messages/{mid}` |
| `PatientRecord` | `patient-persistence.ts` → `patients` store | `psychologists/{uid}/patients/{pid}` |
| `ClinicalFile` | `clinical-context-storage.ts` → `clinical_files` store | `psychologists/{uid}/patients/{pid}/files/{fid}` |
| `FichaClinica` | `clinical-context-storage.ts` → `fichas_clinicas` store | `psychologists/{uid}/patients/{pid}/sessions/{sid}/fichaClinica/{fichaId}` |
| `PatternAnalysis` | `pattern-analysis-storage.ts` → `pattern_analyses` store | `psychologists/{uid}/patients/{pid}/patternAnalyses/{aid}` |
| `UserPreferences` | `clinical-context-storage.ts` → `user_preferences` store | `psychologists/{uid}` (campo `preferences` en doc raíz) |

### 2.5 Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Regla raíz: Solo el psicólogo dueño accede a sus datos
    match /psychologists/{psychologistId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == psychologistId;
    }

    // Denegar acceso directo a cualquier otra ruta
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**Ventaja de `{document=**}` (wildcard recursivo):** Una sola regla protege psicólogos, pacientes, sesiones, mensajes, archivos y memorias. No es necesario escribir reglas por cada nivel de anidamiento.

---

## 3. Estrategia Offline-First

### 3.1 Configuración del SDK de Firestore

Firestore Web SDK v10+ incluye persistencia offline sobre IndexedDB de forma nativa. Esto **reemplaza** la gestión manual actual de `clinical-context-storage.ts` y `patient-persistence.ts`.

**Inicialización recomendada** (nuevo archivo `lib/firebase-config.ts`):

```typescript
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  enableNetwork,
  disableNetwork,
} from 'firebase/firestore';

const app = initializeApp({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
});

// Firestore con persistencia offline nativa
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
});

export { app, db };
```

**Qué reemplaza:**
- `clinical-context-storage.ts` (IndexedDB manual) → Firestore persiste en IndexedDB automáticamente.
- `patient-persistence.ts` (IndexedDB manual) → Pacientes viven en Firestore subcollection.
- `client-context-persistence.ts` (localStorage) → El SDK de Firestore cachea documentos automáticamente.

**Qué NO reemplaza:**
- `hipaa-compliant-storage.ts` (SQLite server-side) → Se elimina progresivamente. Firestore se convierte en la fuente de verdad.
- `encryption-utils.ts` → Se mantiene para cifrado de campos sensibles antes de escribir a Firestore (ver §3.4).

### 3.2 Escrituras Instantáneas (Optimistic UI)

Firestore con persistencia offline aplica **latency compensation** automáticamente:

```
┌──────────────┐        ┌──────────────┐       ┌──────────────┐
│  UI (React)  │──set──▶│  IndexedDB   │──sync─▶│  Firestore   │
│  Actualiza   │        │  (cache local)│       │  (Cloud)     │
│  inmediato   │        │  Escribe     │       │  Confirma    │
└──────────────┘        │  primero     │       │  después     │
                        └──────────────┘       └──────────────┘
```

**Flujo para el agente enviando un mensaje:**

1. El `ClinicalAgentRouter` genera texto streaming.
2. Al completar, escribe el `ChatMessage` a Firestore:
   ```typescript
   await addDoc(
     collection(db,
       `psychologists/${psychologistId}/patients/${patientId}/sessions/${sessionId}/messages`
     ),
     messageData
   );
   ```
3. Firestore escribe a IndexedDB **inmediatamente** (sin esperar red).
4. El listener `onSnapshot` del componente React recibe el documento **desde el cache local** con `metadata.hasPendingWrites === true`.
5. La UI muestra el mensaje al instante.
6. En segundo plano, Firestore sincroniza con el servidor cuando hay conectividad.

**Integración con el sistema actual:**

El hook `use-hopeai-system.ts` actualmente acumula mensajes en `ChatState.history[]` (arreglo en memoria). Con Firestore:

```typescript
// ANTES (actual): Acumular en memoria + guardar en IndexedDB manual
chatState.history.push(newMessage);
await clinicalStorage.saveChatSession(chatState);

// DESPUÉS (Firestore): Escribir documento individual
await addDoc(messagesRef, newMessage);
// El listener onSnapshot en el componente React recibe el update automáticamente
```

### 3.3 Listeners en Tiempo Real para la UI

En lugar de cargar todo el historial al montar el componente, usar `onSnapshot` con paginación:

```typescript
// En el componente de chat o hook personalizado
useEffect(() => {
  if (!sessionId || !psychologistId || !patientId) return;

  const messagesRef = collection(db,
    `psychologists/${psychologistId}/patients/${patientId}/sessions/${sessionId}/messages`
  );

  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      _pending: doc.metadata.hasPendingWrites, // Para indicador visual
    }));
    setMessages(messages);
  });

  return () => unsubscribe();
}, [sessionId, psychologistId, patientId]);
```

**Comportamiento offline:**
- Si el dispositivo pierde conectividad, las escrituras se encolan automáticamente.
- Al reconectarse, Firestore sincroniza las escrituras pendientes.
- Los listeners `onSnapshot` recibirán actualizaciones tanto del cache local como del servidor.

### 3.4 Cifrado de Campos Sensibles

Firestore cifra datos en tránsito (TLS) y en reposo (Google-managed keys) por defecto. Sin embargo, para cumplimiento HIPAA estricto, se recomienda **cifrar campos clínicos sensibles** antes de escribir:

**Campos a cifrar (client-side, antes de `addDoc`):**
- `ChatMessage.content` (contenido de la conversación terapéutica)
- `PatientRecord.notes` (notas del clínico)
- `FichaClinica.content` (contenido de la ficha clínica)

**Campos que NO se cifran (necesarios para queries):**
- `timestamp`, `sessionId`, `patientId` (índices de consulta)
- `role`, `agent`, `status` (campos de filtrado)
- `metadata` de tokens/costos (no contienen PHI)

**Reutilizar `encryption-utils.ts`** adaptado para el cliente:
```typescript
// Adaptar encrypt/decrypt para funcionar en el browser usando Web Crypto API
// en lugar de Node.js crypto (que usa actualmente)
```

**Nota:** Para un BAA (Business Associate Agreement) con Google Cloud, Firestore soporta HIPAA compliance con la configuración adecuada del proyecto GCP. El cifrado adicional de campos es una capa extra de protección (defense-in-depth).

### 3.5 Multi-Tab Sync

La configuración `persistentMultipleTabManager()` permite que múltiples pestañas del navegador compartan el mismo cache Firestore y reciban actualizaciones en tiempo real:

- Pestaña 1 escribe un mensaje → Pestaña 2 lo recibe vía `onSnapshot` sin latencia de red.
- Solo una pestaña mantiene la conexión WebSocket con Firestore (ahorro de recursos).
- Esto resuelve el problema actual donde cada pestaña tiene su propia instancia de IndexedDB sin sincronización.

---

## 4. Traducción del Patrón Claude → Firestore

### 4.1 Análisis del Patrón de Claude Code

Claude Code usa un sistema de **memoria basada en archivos locales** con la siguiente estructura (evidencia: `src/memdir/memdir.ts`, `src/memdir/memoryTypes.ts`, `src/memdir/paths.ts`):

```
~/.claude/
├── projects/<sanitized-git-root>/
│   ├── memory/
│   │   ├── MEMORY.md          ← Índice (max 200 líneas, 25KB)
│   │   └── *.md               ← Archivos de memoria por tema (max 200 archivos)
│   └── <sessionId>/
│       ├── transcript.jsonl   ← Historial completo (append-only)
│       └── session-memory.md  ← Resumen auto-generado
├── history.jsonl              ← Historial global de prompts (max 100/proyecto)
└── settings.json              ← Configuración del usuario
```

**Características clave:**
1. **Aislamiento por proyecto:** Cada directorio Git tiene su propio espacio de memoria (`src/memdir/paths.ts` líneas 203-235).
2. **Selección semántica:** No carga todas las memorias; usa un modelo LLM para seleccionar las 5 más relevantes (`src/memdir/findRelevantMemories.ts`).
3. **Taxonomía de 4 tipos:** `user`, `feedback`, `project`, `reference` (`src/memdir/memoryTypes.ts` líneas 14-19).
4. **Transcripciones JSONL:** Append-only, nunca se reescriben, soportan reanudación (`src/utils/sessionStorage.ts`).
5. **Resumen automático:** `session-memory.md` se genera periódicamente durante la conversación (`src/services/SessionMemory/sessionMemory.ts`).

### 4.2 Traducción a Firestore: Tabla de Equivalencias

| Patrón Claude | Mecanismo | Equivalente Firestore | Beneficio |
|---------------|-----------|----------------------|-----------|
| `~/.claude/projects/<project>/memory/MEMORY.md` | Archivo índice con links a temas | `psychologists/{uid}/agentMemories` (colección con query `.orderBy('relevanceScore')`) | Sin límite de 200 líneas; queries nativas |
| `~/.claude/projects/<project>/memory/*.md` (archivos de tema) | Archivos Markdown individuales | `psychologists/{uid}/agentMemories/{memoryId}` (un documento por memoria) | Búsqueda por `type`, `tags`, `patientId` |
| `~/.claude/projects/<project>/<sessionId>/transcript.jsonl` | Append-only JSONL | `psychologists/{uid}/patients/{pid}/sessions/{sid}/messages` (subcolección) | Paginación nativa, listeners en tiempo real |
| `~/.claude/projects/<project>/<sessionId>/session-memory.md` | Resumen auto-generado | Campo `summary` en `psychologists/{uid}/patients/{pid}/sessions/{sid}` | Accesible sin descargar mensajes |
| `~/.claude/history.jsonl` | Historial global de prompts | No requerido para Aurora (cada sesión tiene su propia subcolección) | — |
| `~/.claude/settings.json` | Config del usuario | Campo `preferences` en `psychologists/{uid}` | Sync automático entre dispositivos |
| Selección semántica (Sonnet eligiendo 5 memorias) | LLM evalúa relevancia | Query en Firestore + reranking con Gemini (ver §4.3) | Sin descargar toda la base |

### 4.3 Lectura Eficiente de Historial por Agentes

**Problema:** Cuando un agente necesita contexto de sesiones anteriores, no debe descargar TODA la base de datos del paciente.

**Solución — Patrón de "Resumen Progresivo" (inspirado en `session-memory.md` de Claude):**

```
NIVEL 1: Resumen de sesión (campo en documento de sesión)
  ← Generado al finalizar cada sesión
  ← ~500-1000 caracteres
  ← Query: collection('sessions').orderBy('createdAt', 'desc').limit(10)
  ← Resultado: 10 resúmenes = ~10KB (trivial)

NIVEL 2: Mensajes de una sesión específica (subcolección)
  ← Solo cuando el agente necesita detalle
  ← Query: collection('messages').orderBy('timestamp').limit(50)
  ← Paginación cursor-based para sesiones largas

NIVEL 3: Memorias del agente (colección de primer nivel)
  ← Observaciones persistentes inter-sesión
  ← Query: collection('agentMemories')
            .where('patientId', '==', pid)
            .orderBy('relevanceScore', 'desc')
            .limit(5)
  ← Inspirado en findRelevantMemories.ts de Claude
```

**Flujo para el `ClinicalAgentRouter` al iniciar una sesión:**

```typescript
async function loadPatientContext(psychologistId: string, patientId: string): Promise<PatientContext> {
  // 1. Datos del paciente (1 lectura)
  const patientDoc = await getDoc(
    doc(db, `psychologists/${psychologistId}/patients/${patientId}`)
  );

  // 2. Últimas 5 sesiones (resúmenes solamente, NO mensajes)
  const recentSessions = await getDocs(
    query(
      collection(db, `psychologists/${psychologistId}/patients/${patientId}/sessions`),
      orderBy('lastUpdated', 'desc'),
      limit(5)
    )
  );

  // 3. Memorias relevantes del agente (máximo 5)
  const memories = await getDocs(
    query(
      collection(db, `psychologists/${psychologistId}/agentMemories`),
      where('patientId', '==', patientId),
      orderBy('relevanceScore', 'desc'),
      limit(5)
    )
  );

  return {
    patient: patientDoc.data(),
    sessionSummaries: recentSessions.docs.map(d => d.data().summary),
    agentMemories: memories.docs.map(d => d.data()),
  };
  // Total: ~7 lecturas Firestore, ~15-20KB de datos
}
```

**Comparación con el estado actual:**

| Aspecto | Aurora Actual | Con Firestore |
|---------|---------------|---------------|
| Carga inicial de contexto del paciente | Ficha clínica completa en primer turno (~100K+ tokens potencialmente) | Resumen de paciente + 5 resúmenes de sesión + 5 memorias (~15-20KB) |
| Historial de mensajes | `ChatState.history[]` completo en memoria (50 intercambios) | Subcolección con paginación lazy; solo lo necesario |
| Contexto inter-sesión | No existe (se pierde entre sesiones) | `agentMemories` colección con relevancia |
| Costo de lectura | Todo en RAM/IndexedDB (gratis pero limitado a 1 dispositivo) | Lecturas Firestore (~$0.06 por 100K lecturas) |

### 4.4 Generación de Resúmenes de Sesión

Adaptando el patrón de `session-memory.md` de Claude (`src/services/SessionMemory/sessionMemory.ts`), Aurora debe generar resúmenes al cerrar una sesión:

**Trigger:** Cuando el psicólogo cierra la sesión o después de N mensajes (similar a los thresholds de Claude: `minimumMessageTokensToInit: ~10K tokens`).

**Contenido del resumen:**
```typescript
interface SessionSummary {
  mainTopics: string[];          // Temas principales discutidos
  therapeuticProgress: string;   // Evaluación del progreso
  riskFlags: string[];           // Banderas de riesgo identificadas
  nextSteps: string[];           // Pasos sugeridos para siguiente sesión
  keyInsights: string[];         // Observaciones clínicas del agente
  generatedAt: Timestamp;
  tokenCount: number;            // Tokens usados en la generación
}
```

**Almacenamiento:** Como campo `summary` en el documento de sesión (`psychologists/{uid}/patients/{pid}/sessions/{sid}`), accesible sin descargar los mensajes individuales.

---

## 5. Autenticación con Firebase Auth

### 5.1 Estado Actual del Manejo de Identidad

Aurora actualmente no tiene autenticación. La identidad se maneja como un string hardcodeado:

```typescript
// hooks/use-hopeai-system.ts, línea 85
const [systemState, setSystemState] = useState<HopeAISystemState>({
  userId: 'demo_user', // ← SIN AUTENTICACIÓN
  ...
});

// lib/hopeai-system.ts, línea 433
userId: userId || 'demo_user' // ← Fallback a demo
```

El `userId` fluye a través del sistema como un parámetro de string sin validación:
- Se pasa a `createClinicalSession()` (`lib/hopeai-system.ts` línea 140).
- Se almacena en `ChatState.userId`.
- Se usa para queries en IndexedDB (`clinical-context-storage.ts` índice `userId`).
- **Nunca se verifica** contra ningún proveedor de identidad.

### 5.2 Arquitectura Propuesta con Firebase Auth

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER                                                      │
│  ┌────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Firebase   │───▶│  Auth State  │───▶│  Firestore SDK   │  │
│  │  Auth SDK   │    │  Provider    │    │  (queries con    │  │
│  │  (login)    │    │  (React ctx) │    │   auth.uid)      │  │
│  └────────────┘    └──────┬───────┘    └──────────────────┘  │
│                           │                                    │
│                    psychologistId = auth.currentUser.uid       │
│                           │                                    │
│  ┌────────────────────────▼────────────────────────────────┐  │
│  │  useHopeAISystem Hook                                    │  │
│  │  - systemState.userId = auth.uid (NO 'demo_user')       │  │
│  │  - Pasa psychologistId a todas las operaciones          │  │
│  └────────────────────────┬────────────────────────────────┘  │
│                           │                                    │
└───────────────────────────┼────────────────────────────────────┘
                            │ SSE / API Routes
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  SERVIDOR (Next.js API Routes)                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Firebase Admin SDK                                     │   │
│  │  - Verifica ID Token en cada request                   │   │
│  │  - Extrae uid → psychologistId                         │   │
│  │  - Pasa a ClinicalAgentRouter                          │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ClinicalAgentRouter.routeMessage(message, psychologistId)    │
│  DynamicOrchestrator.orchestrate(input, psychologistId)       │
│  HopeAISystem.createSession(psychologistId, ...)              │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Implementación: Client-Side Auth Provider

**Nuevo archivo: `providers/auth-provider.tsx`**

```typescript
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase-config';

interface AuthContextType {
  user: User | null;
  psychologistId: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  psychologistId: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(app);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auth]);

  return (
    <AuthContext.Provider value={{
      user,
      psychologistId: user?.uid ?? null,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### 5.4 Integración con el ClinicalAgentRouter (Server-Side)

**Cambio clave en `app/api/send-message/route.ts`:**

```typescript
import { getAuth } from 'firebase-admin/auth';

export async function POST(request: Request) {
  // 1. Extraer y verificar token
  const authHeader = request.headers.get('Authorization');
  const idToken = authHeader?.replace('Bearer ', '');

  if (!idToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const psychologistId = decodedToken.uid;

    // 2. Pasar psychologistId al sistema
    const system = await getGlobalOrchestrationSystem();
    const response = await system.sendMessage({
      ...body,
      userId: psychologistId, // ← Ahora viene de Firebase Auth, no de 'demo_user'
    });

    // ...
  } catch (error) {
    return new Response('Invalid token', { status: 401 });
  }
}
```

**Impacto en `ClinicalAgentRouter`:**

El `psychologistId` ahora es un UID verificado de Firebase. Cuando el router construye queries a Firestore, usa este UID como raíz del path:

```typescript
// lib/clinical-agent-router.ts
async loadPatientContext(psychologistId: string, patientId: string) {
  // El psychologistId viene verificado del API route
  // Las Security Rules de Firestore validan que auth.uid == psychologistId
  const patientRef = doc(db,
    `psychologists/${psychologistId}/patients/${patientId}`
  );
  // ...
}
```

### 5.5 Métodos de Autenticación Recomendados

Para una aplicación clínica con psicólogos profesionales:

1. **Email/Password** (mínimo viable): Registro con email profesional.
2. **Google Sign-In** (recomendado como segundo factor): Facilita onboarding.
3. **Email link (Magic Link)** (alternativa): Sin password, link de un solo uso enviado por email.

**No recomendados para MVP:**
- Anonymous auth (el punto es eliminar `demo_user`).
- Phone auth (no aporta valor para profesionales).

### 5.6 Referencia: Cómo Claude Code Maneja Identidad

Claude Code usa un sistema de identidad diferente (OAuth con API keys) pero el principio es similar (`src/utils/secureStorage/`, `src/utils/auth.ts`):

- **Device ID:** UUID generado por dispositivo, almacenado en `~/.claude.json` (`src/utils/user.ts`).
- **OAuth Account:** Almacenado en Keychain (macOS) o plaintext (`src/utils/secureStorage/`), con campos `accountUuid`, `emailAddress`, `organizationUuid`.
- **Session ID:** UUID por sesión interactiva, para aislar transcripciones.
- **Aislamiento:** Los datos se aíslan por `project root` (path del directorio Git), no por `userId`.

**Lo que Aurora adapta:** El principio de que la identidad debe ser **verificada externamente** (OAuth/Keychain en Claude → Firebase Auth en Aurora) y que todos los datos deben estar **aislados bajo esa identidad** (project root en Claude → psychologistId en Aurora).

---

## 6. Plan de Migración

### Fase 1: Fundación (Semana 1-2)

| Paso | Acción | Archivos Afectados |
|------|--------|--------------------|
| 1.1 | Instalar `firebase` y `firebase-admin` | `package.json` |
| 1.2 | Eliminar `@supabase/supabase-js` (sin uso) | `package.json` |
| 1.3 | Crear `lib/firebase-config.ts` (client SDK) | Nuevo archivo |
| 1.4 | Crear `lib/firebase-admin-config.ts` (server SDK) | Nuevo archivo |
| 1.5 | Crear `providers/auth-provider.tsx` | Nuevo archivo |
| 1.6 | Implementar login UI básico (email/password) | `components/auth-gate.tsx` (nuevo) |
| 1.7 | Modificar `hooks/use-hopeai-system.ts` para usar `useAuth().psychologistId` en lugar de `'demo_user'` | Modificar existente |
| 1.8 | Agregar verificación de ID token en API routes (`app/api/send-message/route.ts`) | Modificar existente |

### Fase 2: Migración de Datos (Semana 2-3)

| Paso | Acción | Archivos Afectados |
|------|--------|--------------------|
| 2.1 | Crear `lib/firestore-storage-adapter.ts` implementando `StorageAdapter` | Nuevo archivo |
| 2.2 | Reemplazar `clinical-context-storage.ts` (IndexedDB manual) con adapter Firestore | Modificar/reemplazar |
| 2.3 | Migrar `patient-persistence.ts` a subcolección Firestore | Modificar/reemplazar |
| 2.4 | Desplegar Security Rules de Firestore | `firestore.rules` (nuevo) |
| 2.5 | Escribir script de migración `scripts/migrate-indexeddb-to-firestore.ts` para datos existentes del demo_user | Nuevo archivo |

### Fase 3: Optimización Offline-First (Semana 3-4)

| Paso | Acción | Archivos Afectados |
|------|--------|--------------------|
| 3.1 | Agregar `onSnapshot` listeners al hook de chat para actualizaciones en tiempo real | `hooks/use-hopeai-system.ts` |
| 3.2 | Implementar indicadores de `hasPendingWrites` en la UI | `components/main-interface-optimized.tsx` |
| 3.3 | Eliminar `client-context-persistence.ts` (localStorage) | Eliminar archivo |
| 3.4 | Eliminar `hipaa-compliant-storage.ts` (SQLite server) | Eliminar archivo |
| 3.5 | Configurar `persistentMultipleTabManager()` y probar multi-tab | `lib/firebase-config.ts` |

### Fase 4: Memoria de Agentes (Semana 4-5)

| Paso | Acción | Archivos Afectados |
|------|--------|--------------------|
| 4.1 | Crear colección `agentMemories` y tipos TypeScript | `types/memory-types.ts` (nuevo) |
| 4.2 | Implementar generación de resúmenes de sesión al cerrar | `lib/session-summary-generator.ts` (nuevo) |
| 4.3 | Integrar carga de contexto eficiente en `ClinicalAgentRouter` | `lib/clinical-agent-router.ts` |
| 4.4 | Implementar escritura de memorias al final de cada sesión | `lib/agent-memory-writer.ts` (nuevo) |

### Componentes que se Eliminan

| Archivo | Razón |
|---------|-------|
| `lib/clinical-context-storage.ts` | Reemplazado por Firestore persistence nativa |
| `lib/patient-persistence.ts` | Reemplazado por subcolección Firestore |
| `lib/client-context-persistence.ts` | Reemplazado por cache Firestore |
| `lib/hipaa-compliant-storage.ts` | Reemplazado por Firestore + Security Rules + campo encryption |
| `lib/server-storage-adapter.ts` | Reemplazado por `firestore-storage-adapter.ts` |
| `@supabase/supabase-js` | Nunca se integró |

### Componentes que se Mantienen

| Archivo | Razón |
|---------|-------|
| `lib/encryption-utils.ts` | Adaptado para Web Crypto API; cifra campos sensibles antes de Firestore |
| `types/clinical-types.ts` | Los tipos se mantienen, se extienden con campos Firestore |
| `lib/hopeai-system.ts` | Se modifica para usar `psychologistId` verificado en lugar de `userId: 'demo_user'` |
| `lib/clinical-agent-router.ts` | Se modifica para recibir `psychologistId` y construir paths Firestore |

---

## Diagrama Final de Arquitectura Propuesta

```
┌──────────────────────────────────────────────────────────────────┐
│  BROWSER                                                          │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Firebase Auth │  │ Auth Provider│  │ Firestore SDK        │    │
│  │ (login/token) │─▶│ (React ctx)  │─▶│ + Offline Persistence│    │
│  └──────────────┘  └──────────────┘  │ + Multi-Tab Manager  │    │
│                                       └──────────┬───────────┘    │
│                                                   │                │
│  ┌───────────────────────────────────────────────▼──────────────┐ │
│  │  IndexedDB (Gestionado automáticamente por Firestore SDK)    │ │
│  │  ├── __firestore_cache (documentos locales)                  │ │
│  │  ├── __firestore_mutations (escrituras pendientes)           │ │
│  │  └── __firestore_targets (queries activos)                   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  onSnapshot() listeners → React UI (optimistic updates)           │
│                                                                    │
└───────────────────────────────┬────────────────────────────────────┘
                                │ ID Token (Bearer) + SSE
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  SERVIDOR (Next.js API Routes)                                    │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Firebase Admin SDK                                         │   │
│  │  verifyIdToken(token) → { uid: psychologistId }            │   │
│  └────────────────────┬───────────────────────────────────────┘   │
│                       │                                            │
│  ┌────────────────────▼───────────────────────────────────────┐   │
│  │  ClinicalAgentRouter / DynamicOrchestrator                  │   │
│  │  - Recibe psychologistId verificado                        │   │
│  │  - Construye paths Firestore con uid como raíz             │   │
│  │  - Lee contexto eficientemente (resúmenes + memorias)      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  FIRESTORE (Cloud)                                                │
│                                                                    │
│  psychologists/{uid}/                                              │
│  ├── preferences: { theme, language, ... }                        │
│  ├── patients/{patientId}/                                        │
│  │   ├── sessions/{sessionId}/                                    │
│  │   │   ├── summary: { ... }  ← Para carga rápida de contexto  │
│  │   │   └── messages/{messageId}/  ← Subcolección paginable     │
│  │   └── files/{fileId}/                                          │
│  └── agentMemories/{memoryId}/  ← Memoria inter-sesión           │
│                                                                    │
│  Security Rules: request.auth.uid == psychologistId               │
│  → Aislamiento total multi-tenant                                 │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

> **Nota metodológica:** Todas las afirmaciones de este documento están basadas en el análisis directo del código fuente de Aurora (archivos y líneas referenciados) y los patrones de Claude Code en `docs/architecture/claude/claude-code-main/src/`. Las propuestas de Firestore están basadas en la documentación oficial del SDK y las capacidades documentadas de Firebase.
