# Aurora — UX Local-First Audit (Abril 2026)

> **Modelo:** claude-opus-4-6 | **Esfuerzo:** max  
> **Rama:** `claude/ux-local-first-refactor`  
> **Fecha:** 2026-04-11  
> **Auditor:** Claude Agent (GitHub)

---

## 1. Resumen Ejecutivo

Aurora es una plataforma clínica local-first que gestiona datos PHI (Información Personal de Salud) para psicólogos. Este documento audita y mejora la experiencia de usuario bajo los estándares 2026 de aplicaciones Mobile Local-First con sincronización Firebase.

### Hallazgos Clave

| Patrón UX | Estado | Prioridad |
|-----------|--------|-----------|
| Optimistic Updates (mensajes) | ✅ Fuerte | — |
| Fire-and-forget persistence | ✅ Fuerte | — |
| Firestore offline persistence | ✅ Fuerte | — |
| Real-time subscriptions | ✅ Presente | — |
| Retry logic (SSE) | ✅ Fuerte | — |
| **Indicador de estado de sync** | ❌ Ausente → ✅ Implementado | P0 |
| **Controles de datos locales** | ❌ Ausente → ✅ Implementado | P0 |
| Resolución de conflictos UI | ⚠️ Implícita (merge:true) | P2 |
| Bloqueo biométrico/PIN | ❌ No implementado | P1 |

---

## 2. Arquitectura Local-First Existente

### 2.1 Configuración Firestore (✅ Excelente)

**Archivo:** `lib/firebase-config.ts`

```
persistentLocalCache + persistentMultipleTabManager + CACHE_SIZE_UNLIMITED
```

- IndexedDB como almacenamiento offline automático
- Coordinación multi-pestaña sin conflictos
- Sin límite de caché (apropiado para datos clínicos PHI)
- Funcionalidad offline completa con sync al reconectar

### 2.2 Optimistic Updates (✅ Fuerte)

**Archivos:** `hooks/use-hopeai-system.ts`, `lib/firestore-client-storage.ts`

- **Mensajes del usuario** (líneas 456-469): Se muestran inmediatamente antes de cualquier trabajo async
- **Respuestas IA** (líneas 1209-1216): Se renderizan en UI antes de persistir en Firestore
- **Sesiones** (líneas 554-585): Fire-and-forget con `set({merge:true})`
- **Documentos** (líneas 1277-1300): `setActiveDocument` local antes de persist
- Todas las escrituras usan `{ merge: true }` para idempotencia

### 2.3 SSE Retry Logic (✅ Fuerte)

**Archivo:** `lib/sse-client.ts`

- 3 reintentos con backoff exponencial (1s, 2s, 4s)
- Timeout de inactividad de 90 segundos
- Errores mostrados como banners retryable, no modales bloqueantes

---

## 3. Anti-Patrones Identificados

### 3.1 ❌ Ausencia de Indicador de Sincronización

**Problema:** El usuario no tiene retroalimentación visual sobre si sus datos se están sincronizando, están offline, o están completamente sincronizados.

**Solución implementada:** `components/sync-status-indicator.tsx` + `hooks/use-sync-status.ts`

- **Dot indicator** no intrusivo en el header
- 3 estados: Offline (gris) → Sincronizando (ámbar pulsante) → Sincronizado (verde, se desvanece)
- Tooltip con información detallada incluyendo hora de última sync
- `aria-live="polite"` para accesibilidad
- Auto-fade después de 4 segundos en estado "synced" para mínima distracción

### 3.2 ❌ Ausencia de Controles de Datos Locales (PHI)

**Problema:** Aurora almacena PHI en IndexedDB del dispositivo pero no ofrecía controles para que el psicólogo gestione estos datos locales.

**Solución implementada:** `components/local-data-controls.tsx` + `hooks/use-local-data-controls.ts`

- Estimación de tamaño de caché vía Storage Manager API
- Botón de limpieza con confirmación de dos pasos
- Explicación clara de qué significa "datos locales" vs "datos en la nube"
- Integrado en panel de Ajustes de Visualización

### 3.3 ⚠️ Resolución de Conflictos Implícita

**Estado:** Firestore usa estrategia last-write-wins con `merge:true`. No hay UI de resolución de conflictos para ediciones concurrentes.

**Mitigación actual:**
- `persistentMultipleTabManager` coordina entre pestañas
- `merge:true` previene sobrescrituras destructivas
- `onSnapshot` con `includeMetadataChanges: true` detecta cambios remotos

**Recomendación futura (P2):**
- Implementar UI de diff visual para conflictos de notas clínicas
- Priorizar el input más reciente con opción de "ver versión anterior"

### 3.4 ⚠️ Input Bloqueado Durante Procesamiento

**Archivos:** `components/chat-interface.tsx` (líneas 1620, 1639, 1728)

```
disabled={isProcessing || isStreaming || isUploading || isTranscribing}
```

**Evaluación:** Este es un patrón ACEPTABLE para un chat clínico. A diferencia de aplicaciones de mensajería genéricas, en el contexto terapéutico:
- El psicólogo necesita leer la respuesta del agente antes de enviar otro mensaje
- Los agentes clínicos procesan contexto extenso y no soportan interrupciones mid-stream
- El bloqueo previene mensajes duplicados accidentales

**No se modifica** — es apropiado para el dominio clínico.

---

## 4. Componentes Implementados

### 4.1 `hooks/use-sync-status.ts`

Hook reactivo que monitorea el estado de sincronización Firestore:

- `navigator.onLine` + eventos `online`/`offline` para detección de red
- `onSnapshotsInSync` de Firestore para tracking de escrituras pendientes
- `waitForPendingWrites` con race timeout para detección precisa
- Debounce de 800ms para evitar flicker entre syncing → synced

### 4.2 `components/sync-status-indicator.tsx`

Indicador visual no intrusivo:

- **Synced:** Dot verde que se desvanece a los 4 segundos
- **Syncing:** Dot ámbar con pulso suave (animación CSS)
- **Offline:** Dot gris con label visible
- Tooltip con icono Phosphor y texto descriptivo
- Integrado en `header.tsx` junto a controles existentes

### 4.3 `hooks/use-local-data-controls.ts`

Controles de gestión de caché local:

- `estimateCacheSize()` vía Storage Manager API
- `clearLocalCache()` con `terminate()` + `clearIndexedDbPersistence()`
- Manejo de errores robusto con logging

### 4.4 `components/local-data-controls.tsx`

Panel de privacidad de datos:

- Información sobre almacenamiento local-first
- Indicador de tamaño de caché
- Botón de limpieza con confirmación de 2 pasos
- Mensaje claro: "datos en la nube no se ven afectados"
- Integrado en `display-settings-popover.tsx`

### 4.5 `app/globals.css` — Animación `sync-pulse`

```css
@keyframes sync-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
```

---

## 5. Verificación de Principios Local-First (2026)

| Principio | Implementación | Verificación |
|-----------|---------------|-------------|
| **Zero-Latency UI** | Optimistic updates en mensajes, sesiones, documentos | ✅ UI no espera respuestas del servidor |
| **Transparencia de Sync** | SyncStatusIndicator en header con 3 estados | ✅ Dot + tooltip no intrusivo |
| **Graceful Conflicts** | merge:true + multi-tab manager | ⚠️ Implícito, sin UI de diff (P2) |
| **Optimistic Updates** | Animaciones inmediatas tras escritura local | ✅ Fire-and-forget persistence |
| **Data Privacy UI** | LocalDataControls con clear cache | ✅ Controles claros para PHI local |
| **Offline Completo** | persistentLocalCache + CACHE_SIZE_UNLIMITED | ✅ Funcional sin red |

---

## 6. Decisiones de Diseño

### ¿Por qué un dot y no un badge completo?

El indicador de sync usa un dot de 1.5x1.5 (6px) porque:
1. **Aurora es una herramienta clínica** — el psicólogo no debe distraerse del paciente
2. **El estado "synced" se desvanece** — el mejor sync UX es invisible
3. **El tooltip contiene la info completa** — disponible on-demand sin ruido visual
4. **Consistencia** con el design system existente (dots de 2x2 para agentes, 3.5h para indicators)

### ¿Por qué no implementamos bloqueo biométrico?

1. **Fuera de alcance** — requiere capacidades nativas (WebAuthn API, CredentialManagement)
2. **No es un cambio de estado UI** — es una feature de seguridad completa
3. **Se documenta como P1** para implementación futura

### ¿Por qué no modificamos el input blocking del chat?

En contexto clínico, el bloqueo durante procesamiento es **intencional**:
- Previene envío accidental de mensajes duplicados
- Asegura que el psicólogo lea la respuesta del agente
- Los agentes clínicos no soportan interrupción mid-stream

---

## 7. Archivos Modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `hooks/use-sync-status.ts` | **Nuevo** | Hook reactivo de estado de sincronización |
| `components/sync-status-indicator.tsx` | **Nuevo** | Indicador visual de sync |
| `hooks/use-local-data-controls.ts` | **Nuevo** | Hook de gestión de caché local |
| `components/local-data-controls.tsx` | **Nuevo** | Panel de privacidad de datos locales |
| `components/header.tsx` | Modificado | Integración de SyncStatusIndicator |
| `components/display-settings-popover.tsx` | Modificado | Integración de LocalDataControls |
| `app/globals.css` | Modificado | Animación `sync-pulse` |
| `UX_LOCAL_FIRST_AUDIT.md` | **Nuevo** | Este documento de auditoría |

---

## 8. Recomendaciones Futuras

### P1 — Bloqueo de Aplicación (Biométrico/PIN)
- Implementar WebAuthn API para biometría del dispositivo
- PIN de 4 dígitos como fallback
- Timeout configurable de inactividad

### P2 — UI de Resolución de Conflictos
- Diff visual para notas clínicas editadas concurrentemente
- Auto-resolución con prioridad al input más reciente
- Opción de "ver versión anterior"

### P3 — Cola de Mensajes Offline
- Permitir enviar mensajes mientras se procesa la respuesta anterior
- Cola local que se resuelve secuencialmente
- Indicador visual de cola pendiente
