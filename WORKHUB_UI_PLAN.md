# Plan de Implementación: Jerarquía de Información Clínica en Workhub

## Contexto del Problema

Actualmente, el Workhub presenta toda la información del paciente con igual peso visual, causando **fatiga cognitiva** para el clínico. Los agentes reciben contexto de forma plana y desestructurada, reduciendo su capacidad predictiva. La información correcta está en la DB, pero **compite por atención** en lugar de estar jerarquizada según relevancia clínica.

## Objetivo

Implementar una **jerarquía clínica estricta** en dos capas:
1. **UI (Workhub)**: Destacar visualmente las prioridades 1 y 2
2. **Contexto del Agente**: Colocar al inicio del prompt las entidades más críticas

## Jerarquía Clínica Requerida

### Prioridad 1 (Destacado Principal): Memoria Más Reciente
- **Qué**: La última `ClinicalMemory` del paciente (ordenada por `updatedAt` descendente)
- **Dónde se obtiene**: Ya cargada en `case-detail-panel.tsx:212` via `getActivePatientMemories`
- **Por qué es crítica**: Representa el estado mental/emocional más actual del paciente

### Prioridad 2 (Destacado Secundario): Documento Más Reciente de Gemini
- **Qué**: El último `ClinicalDocument` generado por un subagente (no documentos manuales)
- **Dónde se obtiene**: Ya cargada en `case-detail-panel.tsx:226` via `loadPatientDocumentsAcrossSessions`
- **Filtro**: `document.source === 'ai_generated'` o similar (documentos generados por `generate_clinical_document`)
- **Por qué es crítica**: Contiene la síntesis clínica más reciente del agente

### Prioridad 3 (Colapsado/Secundario): Resto del Historial
- Sesiones anteriores
- Notas clínicas manuales
- Patrones longitudinales
- Todo lo demás debe ser accesible pero sin competir visualmente

---

## Archivos a Modificar

### 1. UI - Workhub (2 archivos)

#### **`components/clinical-cases/case-detail-panel.tsx`**

**Líneas afectadas**: 352-472 (TabsContent "resumen")

**Cambios necesarios**:

1. **Extraer memoria más reciente** (línea ~213):
```typescript
const latestMemory = memories[0] // Ya está ordenado por updatedAt desc
```

2. **Extraer documento más reciente de Gemini** (después de línea 227):
```typescript
const latestGeminiDoc = documents
  .filter(d => d.source === 'ai_generated' || d.generatedBy === 'gemini')
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
```

3. **Nuevo layout en Resumen tab** (reemplazar líneas 353-472):
```jsx
<TabsContent value="resumen" className="overflow-y-auto min-h-0 mt-0 px-6 py-5">
  {/* PRIORIDAD 1: Memoria Más Reciente - Destacado Principal */}
  {latestMemory && (
    <div className="rounded-xl border-2 border-clarity-blue-500/40 bg-gradient-to-br from-clarity-blue-50 via-white to-clarity-blue-50/50 dark:from-clarity-blue-900/20 dark:via-background dark:to-clarity-blue-900/10 p-5 mb-4 shadow-warm">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-10 w-10 rounded-full bg-clarity-blue-500/20 dark:bg-clarity-blue-500/30 flex items-center justify-center">
          <Brain className="h-5 w-5 text-clarity-blue-600 dark:text-clarity-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground font-sans">Estado Mental Actual</h3>
          <p className="text-xs text-muted-foreground font-sans">
            Última observación · {formatDistanceToNow(new Date(latestMemory.updatedAt), { addSuffix: true, locale: es })}
          </p>
        </div>
        <Badge className={cn(MEMORY_CATEGORY_CONFIG[latestMemory.category].bgLight, MEMORY_CATEGORY_CONFIG[latestMemory.category].color)}>
          {MEMORY_CATEGORY_CONFIG[latestMemory.category].label}
        </Badge>
      </div>
      <p className="text-sm text-foreground font-sans leading-relaxed">
        {latestMemory.content}
      </p>
    </div>
  )}

  {/* PRIORIDAD 2: Documento Más Reciente de Gemini - Destacado Secundario */}
  {latestGeminiDoc && (
    <div className="rounded-xl border-2 border-academic-plum-500/40 bg-gradient-to-br from-academic-plum-50 via-white to-academic-plum-50/50 dark:from-academic-plum-900/20 dark:via-background dark:to-academic-plum-900/10 p-5 mb-4 shadow-warm">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-10 w-10 rounded-full bg-academic-plum-500/20 dark:bg-academic-plum-500/30 flex items-center justify-center">
          <FileText className="h-5 w-5 text-academic-plum-600 dark:text-academic-plum-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground font-sans">Síntesis Clínica Reciente</h3>
          <p className="text-xs text-muted-foreground font-sans">
            {DOCUMENT_TYPE_LABELS[latestGeminiDoc.documentType] || latestGeminiDoc.documentType} · {formatDistanceToNow(new Date(latestGeminiDoc.createdAt), { addSuffix: true, locale: es })}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground font-sans line-clamp-4">
        {latestGeminiDoc.markdown.slice(0, 300)}...
      </p>
      <Button variant="ghost" size="sm" className="mt-3 h-8 text-xs font-sans" onClick={() => setActiveTab('memorias')}>
        Ver documento completo <ExternalLink className="h-3 w-3 ml-1" />
      </Button>
    </div>
  )}

  {/* PRIORIDAD 3: Resto de información - Grid colapsable */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* Stats cards (sesiones, documentos, insights) */}
    {/* Demographics card */}
    {/* Notes preview */}
    {/* Latest memories preview (sin la primera - ya mostrada arriba) */}
  </div>
</TabsContent>
```

**Justificación del diseño**:
- **Bordes de color**: Claridad visual inmediata (azul=memoria, morado=documento)
- **Gradientes sutiles**: Profundidad sin saturación (principios de cognitive calm)
- **Iconos circulares grandes**: Escaneabilidad rápida
- **Shadow-warm**: Token existente de Aurora para sombras cálidas
- **line-clamp-4**: Previene overflow sin JS, scroll nativo del navegador

---

### 2. Contexto del Agente (2 archivos)

#### **`lib/agents/message-context-builder.ts`**

**Líneas afectadas**: 54-59 (función `buildClinicalMemoriesSection`)

**Cambio 1: Etiquetar memoria más reciente**

Reemplazar líneas 54-59:
```typescript
export function buildClinicalMemoriesSection(memories: any[]): string {
  if (!memories || memories.length === 0) return '';

  // Separar la más reciente del resto
  const [latest, ...older] = memories;

  let section = '🔴 MEMORIA MÁS RECIENTE (Estado mental actual del paciente):\n';
  section += `- [${latest.category}] ${latest.content} (actualizada: ${latest.updatedAt})\n`;

  if (older.length > 0) {
    section += '\nMemorias clínicas previas:\n';
    section += older.map(m => `- [${m.category}] ${m.content}`).join('\n');
  }

  return section;
}
```

**Cambio 2: Nueva sección para documentos Gemini**

Agregar después de línea 59:
```typescript
/**
 * METADATA SECTION: Latest Gemini-generated document (clinical synthesis)
 */
export function buildLatestGeminiDocumentSection(documents: any[]): string {
  if (!documents || documents.length === 0) return '';

  // Filtrar solo documentos generados por Gemini (AI-generated)
  const geminiDocs = documents
    .filter(d => d.source === 'ai_generated' || d.generatedBy === 'gemini')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (geminiDocs.length === 0) return '';

  const latest = geminiDocs[0];
  const preview = latest.markdown.slice(0, 500); // Primeros 500 chars

  return `🔴 DOCUMENTO CLÍNICO MÁS RECIENTE (Síntesis generada por IA):\n` +
         `Tipo: ${latest.documentType}\n` +
         `Creado: ${latest.createdAt}\n` +
         `Contenido:\n${preview}...\n`;
}
```

**Cambio 3: Integrar en buildEnhancedMessage**

Modificar función `buildEnhancedMessage` (línea 80-132):
```typescript
export function buildEnhancedMessage(
  originalMessage: string,
  enrichedContext: any,
  _agent: AgentType,
  latestDocuments?: any[] // NUEVO parámetro opcional
): string {
  if (enrichedContext.isConfirmationRequest) {
    return originalMessage;
  }

  const contextSections: string[] = [];

  // 1. USER IDENTITY (always present)
  contextSections.push(buildUserIdentitySection());

  // 2. OPERATIONAL METADATA
  if (enrichedContext.operationalMetadata) {
    contextSections.push(buildOperationalMetadataSection(enrichedContext.operationalMetadata));
  }

  // 3. CLINICAL CASE CONTEXT
  if (enrichedContext.patient_reference) {
    contextSections.push(buildClinicalCaseContextSection(enrichedContext));
  }

  // 🔴 4. PRIORIDAD 1: MEMORIA MÁS RECIENTE (al inicio del contexto clínico)
  if (enrichedContext.clinicalMemories?.length > 0) {
    contextSections.push(buildClinicalMemoriesSection(enrichedContext.clinicalMemories));
    logger.info(`Clinical memories included: ${enrichedContext.clinicalMemories.length} (latest highlighted)`);
  }

  // 🔴 5. PRIORIDAD 2: DOCUMENTO GEMINI MÁS RECIENTE
  if (latestDocuments?.length > 0) {
    contextSections.push(buildLatestGeminiDocumentSection(latestDocuments));
    logger.info(`Latest Gemini document included in context`);
  }

  // 6. PRIOR SESSION SUMMARIES (progressive context loading)
  if (enrichedContext.priorSessionSummaries?.length > 0) {
    contextSections.push(buildPriorSessionSummariesSection(enrichedContext.priorSessionSummaries));
  }

  // ... resto de secciones (entidades, session info, etc.)

  const systemContext = contextSections.join('\n');
  return `<contexto_sistema>\n${systemContext}\n</contexto_sistema>\n\n<consulta_terapeuta>\n${originalMessage}\n</consulta_terapeuta>`;
}
```

**Justificación**:
- **Emoji 🔴**: Llamado de atención visual para el modelo (Gemini responde bien a estos indicadores)
- **Orden estricto**: Las dos prioridades van al inicio del `<contexto_sistema>`
- **Etiquetado explícito**: "Estado mental actual" y "Síntesis generada por IA" dejan claro el peso informacional
- **Preview de 500 chars**: Balance entre contexto rico y no saturar el prompt

#### **`lib/agents/subagents/explore-patient-context.ts`**

**Líneas afectadas**: 95-107 (construcción del prompt de síntesis)

**Cambio: Priorizar memoria y documento recientes en el prompt del subagente**

Reemplazar líneas 95-107:
```typescript
if (memories.length > 0) {
  // Destacar la memoria más reciente
  const [latest, ...older] = memories;

  sections.push(`\n## 🔴 MEMORIA MÁS RECIENTE (Estado Mental Actual)`);
  sections.push(`- [${latest.category}] ${latest.content} (confianza: ${latest.confidence})`);

  if (older.length > 0) {
    sections.push(`\n## Memorias Clínicas Previas (${older.length})`);
    for (const m of older) {
      sections.push(`- [${m.category}] ${m.content} (confianza: ${m.confidence})`);
    }
  }
}
```

**Opcional**: Si queremos también priorizar el último documento Gemini en este subagente, agregar:
```typescript
// Cargar último documento Gemini en paralelo
const { loadPatientDocumentsAcrossSessions } = await import('../../firestore-client-storage');
const documents = await loadPatientDocumentsAcrossSessions(ctx.psychologistId, patientId);
const latestGeminiDoc = documents
  .filter(d => d.source === 'ai_generated')
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

if (latestGeminiDoc) {
  sections.push(`\n## 🔴 DOCUMENTO CLÍNICO MÁS RECIENTE`);
  sections.push(`Tipo: ${latestGeminiDoc.documentType}`);
  sections.push(`Contenido: ${latestGeminiDoc.markdown.slice(0, 500)}...`);
}
```

---

## Restricciones Respetadas

✅ **NO modificamos esquema de DB**: Solo cambiamos filtrado, ordenamiento y renderizado
✅ **NO agregamos campos nuevos**: Usamos `source`, `generatedBy`, `createdAt`, `updatedAt` existentes
✅ **NO cambiamos lógica de persistencia**: Solo cambiamos presentación
✅ **Cambio mínimo viable**: 2 archivos de UI + 2 de contexto de agente

---

## Plan de Implementación

### Fase 1: UI (Workhub) - 45 minutos
1. Modificar `case-detail-panel.tsx`:
   - Extraer `latestMemory` y `latestGeminiDoc` (5 min)
   - Reemplazar layout del tab "resumen" con nuevo diseño jerarquizado (30 min)
   - Ajustar grid de stats para Prioridad 3 (10 min)

### Fase 2: Contexto del Agente - 30 minutos
1. Modificar `message-context-builder.ts`:
   - Actualizar `buildClinicalMemoriesSection` con destacado (10 min)
   - Crear `buildLatestGeminiDocumentSection` (10 min)
   - Integrar en `buildEnhancedMessage` (10 min)

2. Modificar `explore-patient-context.ts`:
   - Priorizar memoria reciente en prompt de síntesis (10 min)

### Fase 3: Testing - 15 minutos
1. Verificar renderizado en Workhub (Desktop + Mobile)
2. Verificar que agentes reciben contexto priorizado en logs
3. Confirmar que no hay regresiones en otras tabs

**Tiempo total estimado**: 90 minutos

---

## Métricas de Éxito

### UI (Workhub)
- [ ] La memoria más reciente se muestra en un card destacado con borde azul
- [ ] El documento más reciente de Gemini se muestra en un card destacado con borde morado
- [ ] El resto de información está en un grid de menor jerarquía visual
- [ ] El diseño es responsive (mobile + desktop)
- [ ] No hay regresión en otras tabs (Sesiones, Memorias, Notas)

### Contexto del Agente
- [ ] Los logs muestran "latest highlighted" cuando se incluye memoria reciente
- [ ] Los logs muestran "Latest Gemini document included" cuando hay documento
- [ ] El prompt generado tiene las prioridades 1 y 2 al inicio del `<contexto_sistema>`
- [ ] El subagente `explore_patient_context` prioriza la memoria reciente en su síntesis

---

## Riesgos Identificados

1. **Compatibilidad con documentos legacy**:
   - Solución: Usar `d.source === 'ai_generated' || d.generatedBy === 'gemini'` como filtro permisivo

2. **Casos edge (paciente sin memorias o documentos)**:
   - Solución: Condicionales `{latestMemory && ...}` y `{latestGeminiDoc && ...}` ya implementados

3. **Mobile viewport overflow**:
   - Solución: Usar `line-clamp-4` y `overflow-hidden` en cards destacados

4. **Prompt demasiado largo**:
   - Solución: Limitar preview de documento a 500 chars (ya planificado)

---

## Archivos a Modificar (Resumen)

```
components/clinical-cases/case-detail-panel.tsx   (UI - Tab Resumen)
lib/agents/message-context-builder.ts             (Contexto Agente - Priorización)
lib/agents/subagents/explore-patient-context.ts   (Subagente - Síntesis)
```

**Total**: 3 archivos modificados
**Líneas estimadas**: ~150 líneas agregadas, ~50 reemplazadas
**Sin cambios en DB**: ✅ Solo presentación y contexto

---

## Notas de Implementación

- **Tailwind tokens existentes**: Usar `shadow-warm`, `glass-card`, paletas de agentes (`clarity-blue`, `academic-plum`)
- **Iconos**: `Brain` (memoria), `FileText` (documento), `ExternalLink` (botón ver más)
- **Animaciones**: NO agregar animaciones (principio de cognitive calm)
- **Accesibilidad**: Mantener semántica HTML (`<h3>`, `<p>`, roles ARIA si necesario)
- **Idioma**: Todo en español clínico profesional

---

**Autor**: Claude Sonnet 4.5
**Fecha**: 2026-04-14
**Esfuerzo estimado**: High (90 minutos)
**Blocker para beta**: ✅ Crítico para lanzamiento
