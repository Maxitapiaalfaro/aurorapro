# Guía de Métricas de Desarrollo Aurora

## Resumen

El sistema de métricas de desarrollo permite visualizar en tiempo real los costos, tiempos de respuesta y tokens consumidos en cada interacción con los agentes de Aurora. **Solo visible en modo desarrollo** (`NODE_ENV === 'development'`).

## Componentes

### 1. DevMetricsIndicator
**Ubicación**: `components/dev-metrics-indicator.tsx`

Indicador flotante en la esquina inferior derecha que muestra métricas agregadas de la sesión actual.

**Características**:
- Métricas por sesión: Total de interacciones, costo acumulado, tiempo promedio
- Vista compacta y expandida
- Tokens consumidos y throughput
- Uso de agentes
- Colapsable/expandible
- Se puede ocultar

**Uso**:
```tsx
<DevMetricsIndicator sessionId={currentSession.sessionId} />
```

### 2. DevMessageMetrics
**Ubicación**: `components/dev-message-metrics.tsx`

Indicador por mensaje que muestra métricas específicas de cada respuesta del modelo.

**Características**:
- Costo del mensaje individual
- Tiempo de respuesta
- Tokens de entrada/salida/contexto
- Comparación de costos entre modelos (Pro vs Flash vs Flash-Lite)
- Porcentaje de diferencia de costo
- Popup detallado con métricas completas

**Uso**:
```tsx
<DevMessageMetrics 
  sessionId={currentSession.sessionId} 
  messageIndex={index} 
/>
```

## Sistema de Tracking

### SessionMetricsComprehensiveTracker
**Ubicación**: `lib/session-metrics-comprehensive-tracker.ts`

Tracker centralizado que captura métricas completas de cada interacción.

**Métricas capturadas**:
- **Tokens**: Input, output, context, total
- **Costos**: Calculados según modelo usado (Pro/Flash/Flash-Lite)
- **Timing**: Orchestration, model response, total response time
- **Contexto computacional**: Agente usado, herramientas, modelo, tamaño de contexto
- **Comportamiento**: Largo de mensaje, cambios de agente, posición en sesión
- **Performance**: Tokens/segundo, cost efficiency

**Pricing actualizado**:
```typescript
'gemini-2.5-pro': {
  inputCostPer1KTokens: 0.00030,  // $0.30 per 1M tokens
  outputCostPer1KTokens: 0.00250, // $2.50 per 1M tokens
}
'gemini-2.5-flash': {
  inputCostPer1KTokens: 0.00030,
  outputCostPer1KTokens: 0.00250,
}
'gemini-2.5-flash-lite': {
  inputCostPer1KTokens: 0.00010,  // $0.10 per 1M tokens
  outputCostPer1KTokens: 0.00040, // $0.40 per 1M tokens
}
```

## Integración en Clinical Agent Router

**Archivo**: `lib/clinical-agent-router.ts`

El router registra automáticamente el modelo usado por cada agente:

```typescript
// Línea ~1000
const agentConfig = this.agents.get(agent);
const modelUsed = agentConfig?.config?.model || 'gemini-2.5-flash';
sessionMetricsTracker.recordModelCallStart(interactionId, modelUsed, contextTokens);
```

Cada agente tiene configurado su modelo:
- **Socrático**: `gemini-2.5-pro`
- **Clínico**: `gemini-2.5-pro`
- **Académico**: `gemini-2.5-pro`

## Configuración de Modelos

### Archivo de configuración base
**Ubicación**: `lib/google-genai-config.ts`

```typescript
export const clinicalModelConfig = {
  model: "gemini-2.5-flash", // Default (overridden per agent)
  temperature: 0.3,
  topK: 40,
  topP: 0.95,
  thinkingConfig: { thinkingBudget: -1 },
  maxOutputTokens: 7000,
  safetySettings: clinicalSafetySettings,
}
```

### Configuración por agente
En `clinical-agent-router.ts`, cada agente override el modelo:

```typescript
this.agents.set("socratico", {
  // ...
  config: {
    ...clinicalModelConfig,
    model: "gemini-2.5-pro", // Override
    temperature: 0.4,
  },
})
```

## Uso en Desarrollo

1. **Iniciar en modo desarrollo**:
   ```bash
   npm run dev
   ```

2. **Interactuar con Aurora**: Las métricas aparecerán automáticamente:
   - Indicador flotante en esquina inferior derecha
   - Badge de métricas en cada mensaje del modelo (clic para detalles)

3. **Ver comparaciones**: Clic en el badge de métricas de cualquier mensaje para ver:
   - Costo real del mensaje con modelo usado
   - Comparación de costos con otros modelos
   - Diferencia porcentual

4. **Expandir/colapsar**: Clic en el indicador flotante para ver métricas detalladas

## Casos de Uso

### Comparación de modelos
- Ver impacto de cambiar de `flash-lite` a `pro` en costos reales
- Evaluar tradeoff costo/calidad por tipo de consulta
- Identificar oportunidades de optimización

### Optimización de costos
- Detectar consultas costosas (muchos tokens de entrada/salida)
- Evaluar si caching ayudaría en sesiones largas
- Monitorear throughput y eficiencia

### Debugging
- Ver tiempos de respuesta por agente
- Identificar cuellos de botella en orchestration
- Verificar que el modelo correcto se está usando

## Análisis Financiero

Con las métricas actuales, puedes:

1. **Calcular costo por usuario/mes** según uso real
2. **Proyectar gastos** en diferentes escenarios (Starter/Pro/Enterprise)
3. **Comparar modelos** y tomar decisiones data-driven
4. **Validar precios** de planes contra costos operativos

Ver análisis completo en: `ALPHA_TESTER_NDA.md`

## Desactivación

En producción (`NODE_ENV === 'production'`), todos los componentes de métricas dev se ocultan automáticamente. No hay código de métricas ejecutándose en prod.

## Notas Técnicas

- **Singleton pattern**: SessionMetricsComprehensiveTracker es singleton
- **Memory management**: Solo mantiene métricas en memoria, no persiste en DB
- **Performance**: Polling cada 1 segundo para actualizar indicadores
- **Type-safe**: Todas las interfaces están tipadas en TypeScript

## Futuras Mejoras

- [ ] Exportar métricas a CSV/JSON
- [ ] Gráficos de tendencias de costo/tiempo
- [ ] Alertas de umbral (ej: "Este mensaje costó >$0.01")
- [ ] Comparación histórica sesión a sesión
- [ ] Breakdown por herramientas usadas (búsquedas académicas)
