# Análisis Financiero Proyectado - Aurora Clinical Intelligence

## 📊 Datos Base (Conversación sin contexto clínico)
**Fuente**: Interacción real con agente socrático
- **Tokens**: 5,251 tokens/interacción
- **Costo**: $0.002981/interacción
- **Tiempo**: 17.82s/respuesta
- **Throughput**: 295 tokens/sec

---

## 🏥 Escenarios con Contexto Clínico

### Contexto Adicional Estimado por Paciente

| Elemento | Tokens Estimados |
|----------|-----------------|
| Ficha clínica básica (datos demográficos, diagnóstico, tratamiento actual) | 800-1,200 |
| Historial de notas clínicas (últimas 5 sesiones) | 2,500-4,000 |
| Archivos adjuntos (PDFs, transcripciones) | 1,500-3,000 |
| **Total Contexto Base** | **4,800-8,200 tokens** |

### Costo por Tipo de Interacción

Asumiendo contexto promedio de **6,500 tokens** (input) + interacción típica:

#### Escenario 1: Consulta Rápida (sin contexto cargado)
- **Tokens input**: 500
- **Tokens output**: 1,500
- **Total**: 2,000 tokens
- **Costo estimado**: $0.0008
- **Casos de uso**: Pregunta conceptual, búsqueda académica simple

#### Escenario 2: Consulta con Ficha Clínica
- **Tokens input**: 1,200 (ficha) + 800 (pregunta) = 2,000
- **Tokens output**: 2,500
- **Total**: 4,500 tokens
- **Costo estimado**: $0.0018
- **Casos de uso**: Formulación de caso, orientación terapéutica

#### Escenario 3: Conversación Multi-turno con Historial Completo
- **Tokens input**: 6,500 (contexto) + 1,000 (mensaje) = 7,500
- **Tokens output**: 3,500
- **Total**: 11,000 tokens
- **Costo estimado**: $0.0045
- **Casos de uso**: Supervisión clínica profunda, documentación compleja

#### Escenario 4: Análisis Académico con Contexto + Búsqueda ParallelAI
- **Tokens input**: 6,500 (contexto) + 1,500 (pregunta + excerpts) = 8,000
- **Tokens output**: 4,000 (síntesis + análisis crítico)
- **Total**: 12,000 tokens
- **Costo estimado**: $0.005
- **Casos de uso**: Validación empírica de formulación, revisión de literatura

---

## 💰 Proyecciones Mensuales por Perfil de Usuario

### Perfil 1: Psicólogo en Consulta Privada (20 pacientes activos)

**Patrón de uso típico por paciente/mes**:
- 4 sesiones/mes
- 2 conversaciones con Aurora por sesión (promedio)
- Mix: 60% con contexto completo, 40% consultas rápidas

**Cálculo**:
- 20 pacientes × 4 sesiones × 2 conversaciones = 160 interacciones/mes
- Con contexto (96 interacciones): 96 × $0.0045 = $0.432
- Sin contexto (64 interacciones): 64 × $0.0008 = $0.051
- **Total mensual**: **$0.48/mes**

### Perfil 2: Psicólogo Institucional (40 pacientes activos)

**Patrón de uso típico por paciente/mes**:
- 3 sesiones/mes (rotación institucional)
- 1.5 conversaciones con Aurora por sesión
- Mix: 70% con contexto, 30% consultas simples

**Cálculo**:
- 40 pacientes × 3 sesiones × 1.5 conversaciones = 180 interacciones/mes
- Con contexto (126 interacciones): 126 × $0.0045 = $0.567
- Sin contexto (54 interacciones): 54 × $0.0008 = $0.043
- **Total mensual**: **$0.61/mes**

### Perfil 3: Usuario Power (Supervisor Clínico)

**Patrón de uso intensivo**:
- 30 pacientes en supervisión activa
- 3 conversaciones profundas/paciente/mes
- 80% con contexto completo + búsqueda académica
- 20% análisis rápidos

**Cálculo**:
- 30 pacientes × 3 conversaciones = 90 interacciones/mes
- Con contexto académico (72 interacciones): 72 × $0.005 = $0.36
- Sin contexto (18 interacciones): 18 × $0.0008 = $0.014
- **Total mensual**: **$0.37/mes**

---

## 📈 Análisis de Escalabilidad

### Costos por Volumen de Usuarios

| Usuarios | Costo Promedio/Usuario | Costo Total Mensual | Ingresos (@ $15/mes) | Margen Bruto |
|----------|------------------------|---------------------|---------------------|--------------|
| 100 | $0.50 | $50 | $1,500 | **96.7%** |
| 500 | $0.50 | $250 | $7,500 | **96.7%** |
| 1,000 | $0.50 | $500 | $15,000 | **96.7%** |
| 5,000 | $0.50 | $2,500 | $75,000 | **96.7%** |
| 10,000 | $0.50 | $5,000 | $150,000 | **96.7%** |

**Nota**: Asumiendo precio de suscripción de $15 USD/mes

---

## 🚨 Escenarios de Riesgo (Edge Cases)

### Usuario Extremo: Uso Abusivo
**Patrón**:
- 100 conversaciones/día con contexto completo
- 3,000 conversaciones/mes
- Costo: 3,000 × $0.0045 = **$13.50/mes**

**Mitigación**:
- Rate limiting: 50 conversaciones/día
- Costo máximo por usuario: $6.75/mes
- Margen conservador: **55%** (peor caso)

### Usuario Académico Intensivo
**Patrón**:
- 50% de consultas usan búsqueda ParallelAI
- 200 conversaciones/mes
- 100 con búsqueda académica

**Costo**:
- Académico (100): 100 × $0.005 = $0.50
- Estándar (100): 100 × $0.0018 = $0.18
- **Total**: **$0.68/mes**
- Margen: **95.5%**

---

## 🎯 Conclusiones Estratégicas

### 1. **Viabilidad Financiera Excelente**
- Costo operacional de IA: **$0.50/usuario/mes** (promedio)
- Con pricing de $15/mes: **Margen bruto 96.7%**
- Con pricing de $10/mes: **Margen bruto 95%**

### 2. **Contexto Clínico NO es Problema Financiero**
- Incremento de costo vs. sin contexto: **5.6x** ($0.0045 vs $0.0008)
- Pero sigue siendo **extremadamente económico** en términos absolutos
- El valor agregado justifica ampliamente el costo

### 3. **ParallelAI es Sostenible**
- Búsquedas académicas: ~11% más caras que conversaciones estándar
- Costo promedio con búsqueda: **$0.005/interacción**
- Incluso usuarios académicos intensivos < $1/mes

### 4. **Escalabilidad Proyectada**

| Métrica | 1,000 usuarios | 10,000 usuarios | 50,000 usuarios |
|---------|----------------|-----------------|-----------------|
| Costo IA mensual | $500 | $5,000 | $25,000 |
| Ingresos ($15/mes) | $15,000 | $150,000 | $750,000 |
| Margen bruto | 96.7% | 96.7% | 96.7% |

### 5. **Thinking Tokens: Impacto Limitado**
- Con `thinkingBudget: 600`, máximo 600 tokens adicionales de "pensamiento"
- Incremento: ~10-15% en tokens totales
- Costo adicional: ~$0.0005/interacción
- **Trade-off favorable**: calidad de respuesta >> costo marginal

---

## 🔮 Proyección Conservadora a 12 Meses

**Asumiendo**:
- Crecimiento progresivo: 100 → 2,000 usuarios
- Uso promedio: 80 interacciones/mes/usuario
- Precio: $15/mes

| Mes | Usuarios | Costo IA | Ingresos | Margen |
|-----|----------|----------|----------|--------|
| 1 | 100 | $50 | $1,500 | 96.7% |
| 3 | 300 | $150 | $4,500 | 96.7% |
| 6 | 800 | $400 | $12,000 | 96.7% |
| 12 | 2,000 | $1,000 | $30,000 | 96.7% |

**Costo acumulado año 1**: ~$6,000  
**Ingresos acumulados año 1**: ~$180,000  
**Margen bruto promedio**: **96.7%**

---

## ⚠️ Factores No Considerados (a monitorear)

1. **Costos de infraestructura adicionales**:
   - Supabase (storage + database): $25-$100/mes
   - Vercel/deployment: $20-$50/mes
   - Sentry (monitoring): $26/mes
   - **Total infra**: ~$71-$176/mes

2. **Costos de búsqueda académica externa**:
   - Si ParallelAI tiene costos adicionales no documentados
   - Crossref/PubMed API limits

3. **File storage (Gemini Files API)**:
   - Archivos clínicos subidos por usuarios
   - Políticas de retención y eliminación

---

## 💡 Recomendaciones

### Pricing Estratégico
1. **Tier Gratuito**: 20 conversaciones/mes → Costo: $0.09/usuario
2. **Tier Profesional**: $15/mes, 500 conversaciones → ROI: 96%+ 
3. **Tier Institucional**: $50/mes por 5 usuarios → Economía de escala

### Optimizaciones Técnicas
1. **Cache de contexto clínico**: Reutilizar embeddings de fichas
2. **Lazy loading de notas**: Solo cargar últimas 3-5 sesiones
3. **Compresión de contexto**: Resumir notas antiguas

### KPIs Financieros a Trackear
- **Costo promedio/usuario/mes**: Target < $0.75
- **Conversaciones promedio/usuario/mes**: Benchmark ~80-100
- **% usuarios con contexto clínico activo**: Indicador de valor
- **Throughput tokens/sec**: Optimizar latencia sin aumentar costo

---

**Última actualización**: Octubre 2025  
**Basado en**: Gemini 2.5 Pro pricing ($0.00025/1K input, $0.001/1K output)
