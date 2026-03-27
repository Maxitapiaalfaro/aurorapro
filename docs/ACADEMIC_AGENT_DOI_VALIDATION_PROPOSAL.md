# Propuesta: Validación de DOIs y URLs Académicas para Agente Investigador

## 🎯 Problema Identificado

El agente académico de HopeAI está recuperando URLs/DOIs **inválidos o expirados** a través del Google Search tool del SDK GenAI. Esto compromete la credibilidad científica del sistema y frustra a los psicólogos usuarios que necesitan acceso a evidencia verificable.

### Causa Raíz Actual

1. **Dependencia exclusiva en Google Search nativo**: El agente usa `googleSearch` tool del SDK sin validación post-búsqueda
2. **Sin verificación de DOIs**: No hay validación de que los DOIs extraídos sean funcionales
3. **Sanitización básica**: La función `sanitizeAcademicUrl()` solo normaliza formato, no valida accesibilidad
4. **Sin priorización de fuentes académicas**: Google Search genérico puede retornar URLs de blogs, preprints no revisados, o enlaces rotos

**Ubicación del código problemático**:
- `lib/clinical-agent-router.ts` líneas 698-710: Configuración del tool
- `lib/clinical-agent-router.ts` líneas 1360-1422: Extracción y sanitización de URLs
- Sistema instrucción líneas 622-631: Requiere DOIs pero no valida su funcionalidad

---

## 🔬 Análisis Técnico

### Estado Actual de la Arquitectura

```typescript
// clinical-agent-router.ts - Agente Académico
tools: [{
  googleSearch: {
    timeRangeFilter: {
      startTime: "2024-01-01T00:00:00Z",
      endTime: "2025-12-31T23:59:59Z"
    }
  }
}]
```

**Flujo actual**:
1. Usuario pregunta sobre evidencia científica
2. Agente usa Google Search con filtro temporal
3. SDK retorna `groundingMetadata` con URLs
4. `extractUrlsFromGroundingMetadata()` extrae URLs
5. `sanitizeAcademicUrl()` normaliza formato
6. URLs se presentan al usuario **sin validación de accesibilidad**

### Recursos Existentes No Utilizados

El proyecto **ya tiene** `lib/pubmed-research-tool.ts` con:
- Búsqueda directa en PubMed E-utilities API
- Extracción de DOIs desde XML
- Construcción de URLs canónicas (`https://pubmed.ncbi.nlm.nih.gov/{pmid}/`)
- Retry logic y manejo de errores

**Problema**: Este tool está **comentado como "Removed manual PubMed tool"** en línea 5 de `clinical-agent-router.ts` y no se usa activamente.

---

## ✅ Solución Propuesta: Sistema Multi-Capa de Validación

### Arquitectura de 3 Capas

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1: Búsqueda Priorizada en Bases Académicas           │
│  - PubMed (psicología clínica)                              │
│  - Crossref (validación DOI)                                │
│  - Google Scholar (fallback)                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  CAPA 2: Validación de DOIs y URLs                          │
│  - Verificación HTTP HEAD de DOIs                           │
│  - Validación de formato DOI (10.xxxx/yyyy)                 │
│  - Whitelist de dominios académicos confiables              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  CAPA 3: Enriquecimiento de Metadatos                       │
│  - Extracción de año, autores, journal desde APIs           │
│  - Scoring de confiabilidad (peer-reviewed > preprint)      │
│  - Fallback a Google Search solo si capas 1-2 fallan        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Implementación Detallada

### 1. Nuevo Módulo: `lib/academic-source-validator.ts`

**Responsabilidades**:
- Validar DOIs contra Crossref API
- Verificar accesibilidad de URLs académicas
- Priorizar fuentes por confiabilidad
- Enriquecer metadatos desde múltiples APIs

**Funciones clave**:

```typescript
interface ValidatedAcademicSource {
  doi?: string
  url: string
  title: string
  authors?: string[]
  year?: number
  journal?: string
  sourceType: 'pubmed' | 'crossref' | 'elsevier' | 'google-scholar' | 'open-access'
  trustScore: number // 0-100
  isAccessible: boolean
  validatedAt: Date
}

// Validar DOI contra Crossref
async function validateDOI(doi: string): Promise<boolean>

// Verificar accesibilidad de URL
async function checkUrlAccessibility(url: string): Promise<boolean>

// Extraer DOI desde URL o texto
function extractDOI(text: string): string | null

// Scoring de confiabilidad
function calculateTrustScore(source: AcademicSource): number
```

### 2. Integración con PubMed E-utilities

**Reactivar y mejorar** `lib/pubmed-research-tool.ts`:

```typescript
// Mejoras propuestas:
- Agregar filtro por idioma (español + inglés)
- Priorizar journals de psicología clínica
- Extraer DOIs de forma más robusta
- Validar DOIs antes de retornar
```

**Términos MeSH optimizados para psicología clínica en español**:
- `psychology, clinical[MeSH]`
- `psychotherapy[MeSH]`
- `mental disorders[MeSH]`
- `cognitive behavioral therapy[MeSH]`

### 3. Integración con Crossref API

**Nueva clase**: `lib/crossref-doi-resolver.ts`

```typescript
class CrossrefDOIResolver {
  private readonly baseUrl = 'https://api.crossref.org/works/'
  
  async resolveDOI(doi: string): Promise<CrossrefMetadata | null> {
    // GET https://api.crossref.org/works/{doi}
    // Retorna: título, autores, journal, año, tipo de publicación
  }
  
  async searchByQuery(query: string, filters: {
    type?: 'journal-article',
    fromPubDate?: string,
    subject?: 'psychology'
  }): Promise<CrossrefResult[]>
}
```

**Ventajas de Crossref**:
- API pública sin autenticación requerida
- Cobertura de 140M+ DOIs
- Metadatos estructurados y confiables
- Filtros por tipo de publicación y fecha

### 4. Whitelist de Dominios Académicos Confiables

```typescript
const TRUSTED_ACADEMIC_DOMAINS = {
  tier1: [ // Máxima confiabilidad
    'pubmed.ncbi.nlm.nih.gov',
    'doi.org',
    'dx.doi.org',
    'psycnet.apa.org',
    'sciencedirect.com',
    'springer.com',
    'wiley.com',
    'tandfonline.com',
    'frontiersin.org',
    'plos.org',
    'nature.com',
    'science.org'
  ],
  tier2: [ // Alta confiabilidad
    'scholar.google.com',
    'researchgate.net',
    'academia.edu',
    'arxiv.org',
    'biorxiv.org',
    'psyarxiv.com'
  ],
  tier3: [ // Confiabilidad moderada - requiere validación adicional
    'ncbi.nlm.nih.gov',
    'nih.gov',
    'who.int',
    'cochrane.org'
  ]
}
```

### 5. Modificación del Agente Académico

**Cambios en `lib/clinical-agent-router.ts`**:

```typescript
// ANTES: Solo Google Search
tools: [{
  googleSearch: {
    timeRangeFilter: { ... }
  }
}]

// DESPUÉS: Búsqueda híbrida con validación
tools: [{
  // Mantener Google Search como fallback
  googleSearch: {
    timeRangeFilter: { ... }
  }
}],
// + Lógica de validación post-búsqueda
```

**Nuevo flujo en `extractUrlsFromGroundingMetadata()`**:

```typescript
private async extractUrlsFromGroundingMetadata(
  groundingMetadata: any
): Promise<ValidatedAcademicSource[]> {
  const rawUrls = this.extractRawUrls(groundingMetadata)
  
  // PASO 1: Intentar extraer DOIs
  const sources = rawUrls.map(url => ({
    url,
    doi: extractDOI(url.url)
  }))
  
  // PASO 2: Validar DOIs contra Crossref
  const validatedSources = await Promise.all(
    sources.map(async (source) => {
      if (source.doi) {
        const isValid = await validateDOI(source.doi)
        if (isValid) {
          const metadata = await crossrefResolver.resolveDOI(source.doi)
          return { ...source, ...metadata, isAccessible: true }
        }
      }
      
      // PASO 3: Si no hay DOI, verificar accesibilidad de URL
      const isAccessible = await checkUrlAccessibility(source.url)
      return { ...source, isAccessible }
    })
  )
  
  // PASO 4: Filtrar solo fuentes accesibles
  return validatedSources.filter(s => s.isAccessible)
}
```

### 6. Búsqueda Priorizada Multi-Fuente

**Nueva función**: `searchAcademicEvidence(query: string)`

```typescript
async function searchAcademicEvidence(
  query: string,
  options: {
    maxResults?: number
    language?: 'es' | 'en' | 'both'
    dateRange?: { from: string, to: string }
  }
): Promise<ValidatedAcademicSource[]> {
  
  const results: ValidatedAcademicSource[] = []
  
  // PRIORIDAD 1: PubMed (psicología clínica)
  try {
    const pubmedResults = await pubmedTool.searchPubMed({
      query: enhanceQueryForPsychology(query),
      maxResults: options.maxResults || 10,
      dateRange: 'last_5_years'
    })
    
    // Validar DOIs de PubMed
    const validated = await Promise.all(
      pubmedResults.map(async (article) => {
        if (article.doi) {
          const isValid = await validateDOI(article.doi)
          if (isValid) {
            return {
              ...article,
              sourceType: 'pubmed',
              trustScore: 95,
              isAccessible: true
            }
          }
        }
        return null
      })
    )
    
    results.push(...validated.filter(Boolean))
  } catch (error) {
    console.warn('[AcademicSearch] PubMed failed, trying Crossref')
  }
  
  // PRIORIDAD 2: Crossref (si PubMed insuficiente)
  if (results.length < 5) {
    try {
      const crossrefResults = await crossrefResolver.searchByQuery(query, {
        type: 'journal-article',
        fromPubDate: '2020',
        subject: 'psychology'
      })
      
      results.push(...crossrefResults.map(r => ({
        ...r,
        sourceType: 'crossref',
        trustScore: 90,
        isAccessible: true
      })))
    } catch (error) {
      console.warn('[AcademicSearch] Crossref failed')
    }
  }
  
  // PRIORIDAD 3: Google Search (solo si fallan anteriores)
  if (results.length < 3) {
    // Usar Google Search del SDK como último recurso
    // + Validación estricta de URLs retornadas
  }
  
  // Ordenar por trustScore descendente
  return results.sort((a, b) => b.trustScore - a.trustScore)
}
```

---

## 📊 Mejoras en System Instruction del Agente

**Agregar a líneas 622-632**:

```markdown
### 4. REFERENCIAS (OBLIGATORIO)

**TODA respuesta DEBE terminar con referencias VALIDADAS**:

## Referencias

**Formato requerido**:
- Usar SIEMPRE DOIs verificados cuando estén disponibles
- Priorizar fuentes de PubMed, Crossref, y journals peer-reviewed
- Incluir año de publicación (2020-2025 preferentemente)
- Formato APA 7ª edición

**Ejemplo**:
Smith, J., Johnson, A., & Williams, K. (2024). Cognitive behavioral therapy for major depressive disorder: A meta-analysis of randomized controlled trials. *Journal of Clinical Psychology*, *80*(3), 245-267. https://doi.org/10.1002/jclp.23456

**Validación automática**:
- Todos los DOIs son verificados contra Crossref antes de presentarse
- URLs sin DOI son validadas por accesibilidad HTTP
- Fuentes con trustScore < 70 son marcadas como "evidencia preliminar"
```

---

## 🚀 Plan de Implementación

### Fase 1: Validación de DOIs (Semana 1)
- [ ] Crear `lib/academic-source-validator.ts`
- [ ] Implementar `validateDOI()` con Crossref API
- [ ] Implementar `extractDOI()` con regex robusto
- [ ] Agregar tests unitarios

### Fase 2: Integración PubMed (Semana 2)
- [ ] Reactivar `lib/pubmed-research-tool.ts`
- [ ] Agregar validación de DOIs post-búsqueda
- [ ] Optimizar queries para psicología clínica en español
- [ ] Implementar caché de resultados (24h TTL)

### Fase 3: Crossref Integration (Semana 3)
- [ ] Crear `lib/crossref-doi-resolver.ts`
- [ ] Implementar búsqueda por query
- [ ] Implementar resolución de DOI a metadatos
- [ ] Agregar rate limiting (50 req/s límite de Crossref)

### Fase 4: Búsqueda Multi-Fuente (Semana 4)
- [ ] Implementar `searchAcademicEvidence()` con priorización
- [ ] Integrar con agente académico
- [ ] Modificar `extractUrlsFromGroundingMetadata()` con validación
- [ ] Actualizar system instruction

### Fase 5: Testing y Refinamiento (Semana 5)
- [ ] Tests de integración con casos reales
- [ ] Validación con psicólogos usuarios
- [ ] Ajuste de trustScores basado en feedback
- [ ] Documentación de APIs usadas

---

## 📈 Métricas de Éxito

### KPIs Cuantitativos
- **Tasa de DOIs válidos**: > 95% de DOIs retornados deben ser accesibles
- **Cobertura de fuentes académicas**: > 80% de resultados desde PubMed/Crossref
- **Tiempo de respuesta**: < 3s para búsqueda + validación
- **Tasa de error**: < 5% de URLs inaccesibles

### KPIs Cualitativos
- Feedback de psicólogos sobre calidad de referencias
- Reducción de reportes de "enlaces rotos"
- Aumento en confianza percibida del agente académico

---

## 🔒 Consideraciones de Seguridad y Rate Limiting

### APIs Públicas - Límites
- **PubMed E-utilities**: 3 req/s sin API key, 10 req/s con key
- **Crossref**: 50 req/s (polite pool con User-Agent)
- **DOI.org**: Sin límite oficial, usar 10 req/s conservador

### Estrategias de Mitigación
1. **Caché agresivo**: 24h para metadatos de DOI
2. **Batch requests**: Validar múltiples DOIs en paralelo
3. **Fallback graceful**: Si API falla, usar Google Search con advertencia
4. **User-Agent identificable**: `HopeAI-Research/1.0 (contact@hopeai.com)`

---

## 💡 Beneficios Esperados

### Para Psicólogos Usuarios
✅ **Confianza**: Referencias siempre accesibles y verificadas
✅ **Calidad**: Priorización de fuentes peer-reviewed
✅ **Actualidad**: Filtros temporales garantizan evidencia reciente
✅ **Accesibilidad**: DOIs funcionan globalmente, sin geoblocking

### Para el Sistema HopeAI
✅ **Credibilidad científica**: Cumple estándares de medicina basada en evidencia
✅ **Diferenciación**: Supera a ChatGPT/Claude en rigor académico
✅ **Escalabilidad**: Arquitectura modular permite agregar más fuentes
✅ **Observabilidad**: Métricas de calidad de fuentes

---

## 🎓 Referencias Técnicas

- [PubMed E-utilities API](https://www.ncbi.nlm.nih.gov/books/NBK25501/)
- [Crossref REST API](https://api.crossref.org/swagger-ui/index.html)
- [DOI Handbook](https://www.doi.org/the-identifier/resources/handbook)
- [Google Gemini Grounding](https://ai.google.dev/gemini-api/docs/grounding)

