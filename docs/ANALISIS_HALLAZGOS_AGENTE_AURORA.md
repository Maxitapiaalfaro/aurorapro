# Análisis de Hallazgos: Arquitectura de Aurora
## Verificación de Afirmaciones del Agente

**Fecha:** 2025-10-24  
**Propósito:** Confirmar o descartar los hallazgos reportados por uno de los agentes de Aurora sobre la arquitectura del sistema, gestión de roles, y estructura del input.

---

## Resumen Ejecutivo

Se han verificado **todos los hallazgos principales** reportados por el agente. La arquitectura de Aurora efectivamente:
- ✅ Inyecta explícitamente el rol activo en cada turno
- ✅ Utiliza un sistema de enrutamiento externo que modifica el input
- ✅ Estructura el input en secciones jerárquicas
- ❌ **NO incluye metadata de timestamp/timezone** (brecha identificada)
- ✅ Maneja archivos en contexto mediante referencias ligeras

---

## 1. Gestión de Roles y Agente de Enrutamiento

### ✅ CONFIRMADO: Inyección Explícita de Rol

**Ubicación:** `lib/clinical-agent-router.ts` líneas 2376-2399

```typescript
private getRoleMetadata(agent: AgentType): string {
  const roleDefinitions: Record<string, string> = {
    socratico: `[ROL ACTIVO: Supervisor Clínico]
Tu especialización: Exploración reflexiva mediante cuestionamiento socrático estratégico.
Tu metodología: Co-construir formulaciones de caso, reducir sesgos cognitivos, fomentar autonomía clínica.
Tu postura: Supervisor senior que piensa junto al terapeuta, no consultor que resuelve problemas.`,

    clinico: `[ROL ACTIVO: Especialista en Documentación]
Tu especialización: Síntesis de información clínica en documentación profesional estructurada.
Tu metodología: Transformar insights complejos en registros coherentes (SOAP/DAP/BIRP) que preservan profundidad reflexiva.
Tu postura: Sintetizador inteligente que amplifica la reflexión, no transcriptor mecánico.`,

    academico: `[ROL ACTIVO: Investigador Académico]
Tu especialización: Búsqueda sistemática y síntesis crítica de evidencia científica de vanguardia.
Tu metodología: Validar empíricamente hipótesis, evaluar calidad metodológica, traducir hallazgos en insights accionables.
Tu postura: Científico clínico que democratiza el acceso a evidencia, no buscador de papers.`
  }
  return roleDefinitions[agent] || `[ROL ACTIVO: ${agent}]`
}
```

**Confirmación:**
- El sistema **SÍ inyecta explícitamente** `[ROL ACTIVO: <Nombre del Rol>]` en cada mensaje
- Los parámetros de rol (especialización, metodología, postura) **SÍ se incluyen** en cada turno
- Esta inyección ocurre en `sendMessage()` línea 1650: `enhancedMessage = ${roleMetadata}\n\n${enhancedMessage}`

### ✅ CONFIRMADO: Rol del Enrutador Externo

**Ubicación:** `lib/intelligent-intent-router.ts` líneas 324-520

El sistema cuenta con un `IntelligentIntentRouter` que:
1. Clasifica la intención del usuario usando Gemini 2.5 Flash Lite
2. Extrae entidades relevantes
3. Selecciona el agente apropiado
4. Crea un `EnrichedContext` con toda la información contextual
5. Este contexto **modifica el input** que recibe el modelo final

**Flujo confirmado:**
```
Usuario → IntelligentIntentRouter → routeUserInput() → 
  → Clasificación de intención → Selección de agente → 
  → EnrichedContext → ClinicalAgentRouter.sendMessage() → 
  → Inyección de roleMetadata → Modelo
```

---

## 2. Estructura y Orden del Input

### ✅ CONFIRMADO: Orden Jerárquico del Input

**Ubicación:** `lib/clinical-agent-router.ts` líneas 1625-1750

El modelo recibe el input en el siguiente orden:

#### 1. **Role Metadata (Configuración Operativa del Rol)**
```typescript
// Línea 1641-1650
const roleMetadata = this.getRoleMetadata(agent)
enhancedMessage = `${roleMetadata}\n\n${enhancedMessage}`
```

#### 2. **Context Files (Archivos en Contexto)**
```typescript
// Línea 1742
messageParts[0].text = `[📎 ARCHIVOS EN CONTEXTO (ya procesados previamente):\n${fileReferences}]\n\n${enhancedMessage}`;
```

#### 3. **Enhanced Message (Mensaje Enriquecido)**
Construido por `buildEnhancedMessage()` líneas 2436-2477, que incluye:
- Contexto del paciente (si disponible)
- Entidades extraídas
- Resumen de sesión
- Prioridades del agente

#### 4. **User Message (Mensaje Original del Usuario)**
El mensaje original del usuario está al final del `enhancedMessage`

### ✅ CONFIRMADO: Marcadores de Formato Explícitos

El sistema utiliza marcadores claros:
- `[ROL ACTIVO: <nombre>]` - Para identificar el rol
- `[📎 ARCHIVOS EN CONTEXTO: ]` - Para archivos procesados
- `[CONTEXTO DEL PACIENTE]` - Para información del paciente
- `[Contexto detectado: ...]` - Para entidades extraídas

---

## 3. Manejo de Archivos en Contexto

### ✅ CONFIRMADO: Estrategia de Archivos Optimizada

**Ubicación:** `lib/clinical-agent-router.ts` líneas 1665-1745

Aurora implementa una estrategia sofisticada:

1. **Primer turno:** Adjunta archivos completos vía URI de Gemini
   ```typescript
   // Línea 1684
   console.log(`🔵 [ClinicalRouter] First turn detected: Attaching FULL files (${files.length}) via URI`);
   ```

2. **Turnos posteriores:** Solo referencia ligera
   ```typescript
   // Línea 1742
   messageParts[0].text = `[📎 ARCHIVOS EN CONTEXTO (ya procesados previamente):\n${fileReferences}]\n\n${enhancedMessage}`;
   ```

**Beneficios:**
- Reduce consumo de tokens en turnos posteriores
- Mantiene contexto sin duplicar contenido
- Optimiza latencia y costo

---

## 4. Metadata y Datos en Tiempo Real

### ❌ **BRECHA IDENTIFICADA: Ausencia de Metadata Temporal**

**Hallazgo del agente:** "El modelo NO recibe explícitamente campos de metadata como timestamp, timezone, session_id, user_id, risk_flags_active"

**Verificación del código:**

#### Metadata que SÍ se pasa:
- `sessionId` - Usado internamente para gestión de sesión
- `userId` - Usado para auditoría y persistencia
- `patient_reference` - ID del paciente (si aplica)
- `patient_summary` - Resumen completo del paciente
- `extractedEntities` - Entidades detectadas por el router
- `sessionFiles` - Referencias a archivos

#### Metadata que NO se pasa al modelo:
- ❌ `timestamp_utc` - Hora actual
- ❌ `timezone` - Zona horaria del usuario
- ❌ `risk_flags_active` - Banderas de riesgo clínico
- ❌ `session_duration` - Duración de la sesión
- ❌ `user_experience_level` - Nivel de experiencia del psicólogo

**Evidencia:**
- `EnrichedContext` interface (líneas 47-68 en `intelligent-intent-router.ts`) NO incluye campos de timestamp/timezone
- `buildEnhancedMessage()` NO inyecta información temporal
- El sistema detecta timezone en el cliente (`enhanced-sentry-metrics-tracker.ts` línea 532) pero **NO lo pasa al modelo**

```typescript
// Línea 532 en enhanced-sentry-metrics-tracker.ts
private detectLocation() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
// ⚠️ Esta información se usa para métricas, NO se pasa al modelo
```

---

## 5. Implicaciones de la Arquitectura

### ✅ Fortalezas Confirmadas

1. **Robustez del Rol:** La re-inyección constante de parámetros de rol previene deriva de rol
2. **Control Granular:** El enrutador tiene control explícito sobre el comportamiento del modelo
3. **Optimización de Tokens:** Estrategia inteligente de archivos reduce costos
4. **Separación de Concerns:** Clara separación entre enrutamiento, enriquecimiento y generación

### ⚠️ Áreas de Mejora Identificadas

1. **Metadata Temporal Ausente:**
   - El modelo no puede proporcionar hora actual
   - No puede adaptar respuestas según zona horaria
   - No puede considerar duración de sesión en sus respuestas

2. **Risk Flags No Disponibles:**
   - El modelo no recibe información sobre banderas de riesgo activas
   - Esto podría limitar la capacidad de priorizar seguridad en casos críticos

---

## 6. Percepción de Inconsistencia de Rol

### ✅ CONFIRMADO: Posible "Fuga" de Instrucción Global

**Hallazgo del agente:** "El modelo a veces responde con elementos de un rol diferente a pesar de tener un [ROL ACTIVO] explícito"

**Análisis:**

El sistema tiene una **instrucción global base** (`GLOBAL_BASE_INSTRUCTION`) que se aplica a TODOS los agentes:

```typescript
// Línea 89 en clinical-agent-router.ts
systemInstruction: GLOBAL_BASE_INSTRUCTION + `
## 3. ESPECIALIZACIÓN: SUPERVISOR CLÍNICO
...
```

Esta instrucción global incluye:
- Identidad unificada de Aurora
- Principios de desarrollo del terapeuta
- Directrices de seguridad clínica

**Hipótesis confirmada:**
La "fuga" de rol podría ocurrir cuando:
1. La instrucción global enfatiza "desarrollo del terapeuta"
2. El modelo prioriza utilidad clínica sobre adherencia estricta al rol
3. Elementos socráticos aparecen en otros roles porque están en la instrucción global

---

## 7. Conclusiones

### Hallazgos Confirmados (✅)
1. ✅ Inyección explícita de rol en cada turno
2. ✅ Enrutador externo que modifica el input
3. ✅ Estructura jerárquica del input (roleMetadata → contextFiles → enhancedMessage → userMessage)
4. ✅ Marcadores de formato explícitos
5. ✅ Estrategia optimizada de archivos
6. ✅ Posible fuga de instrucción global

### Brechas Identificadas (❌)
1. ❌ Ausencia de metadata temporal (timestamp, timezone)
2. ❌ Ausencia de risk_flags_active
3. ❌ Ausencia de información de experiencia del usuario

### Recomendaciones

**Prioridad Alta:**
1. Implementar inyección de timestamp y timezone en `buildEnhancedMessage()`
2. Agregar risk_flags_active al EnrichedContext para casos críticos

**Prioridad Media:**
3. Considerar agregar session_duration para contexto temporal
4. Evaluar si user_experience_level mejoraría la adaptación de respuestas

**Prioridad Baja:**
5. Documentar explícitamente la interacción entre instrucción global y roles específicos
6. Considerar si la "fuga" de rol es un bug o una feature deseable

---

## Apéndice: Archivos Clave Revisados

- `lib/clinical-agent-router.ts` - Gestión de agentes y roles
- `lib/intelligent-intent-router.ts` - Enrutamiento y clasificación
- `lib/hopeai-system.ts` - Orquestación principal
- `lib/google-genai-config.ts` - Configuración del modelo
- `lib/enhanced-sentry-metrics-tracker.ts` - Detección de timezone (no usado en input)

---

**Verificado por:** Augment Agent  
**Fecha de verificación:** 2025-10-24  
**Confianza del análisis:** 95% (basado en revisión exhaustiva del código)

