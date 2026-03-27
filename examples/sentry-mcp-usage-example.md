# 🔧 Ejemplos Prácticos de Sentry MCP

Este archivo contiene ejemplos específicos de cómo usar Sentry MCP con tu proyecto HopeAI Copilot.

## 📋 Información del Proyecto

**DSN del Proyecto:**
```
https://da82e6d85538fbb3f2f5337705c12919@o4509744324673536.ingest.us.sentry.io/4509744325853184
```

**Componentes Principales a Monitorear:**
- `components/chat-interface.tsx`
- `components/main-interface-optimized.tsx`
- `hooks/use-hopeai-system.ts`
- `lib/hopeai-system.ts`
- `lib/sentry-metrics-tracker.ts`

## 🎯 Prompts Específicos para tu Proyecto

### 1. Análisis General del Proyecto
```
"Analiza todos los issues de Sentry en mi proyecto hopeai-copilot y dame un resumen de los problemas más críticos"
```

### 2. Errores en Componentes de Chat
```
"Busca errores en Sentry relacionados con components/chat-interface.tsx y components/main-interface-optimized.tsx. ¿Hay patrones comunes?"
```

### 3. Problemas en el Sistema HopeAI
```
"Revisa Sentry por errores en hooks/use-hopeai-system.ts y lib/hopeai-system.ts. Propón soluciones para los issues más frecuentes"
```

### 4. Análisis de Métricas
```
"Examina los errores relacionados con lib/sentry-metrics-tracker.ts. ¿Hay problemas con el tracking de métricas?"
```

### 5. Errores de Orquestación
```
"Busca issues relacionados con 'orchestration' o 'dynamic-orchestrator' en Sentry. ¿Qué problemas hay con el sistema de orquestación?"
```

### 6. Problemas de Rendimiento
```
"Muéstrame las transacciones más lentas en mi aplicación Next.js y identifica cuellos de botella"
```

### 7. Errores de Cliente vs Servidor
```
"Compara los errores del lado del cliente vs servidor. ¿Dónde están ocurriendo más problemas?"
```

### 8. Análisis con Seer AI
```
"Usa Seer de Sentry para analizar el issue más reciente en mi proyecto y propón una solución automática"
```

## 🔍 Búsquedas Específicas por Archivo

### Chat Interface
```
"Revisa Sentry por errores específicamente en:
- components/chat-interface.tsx líneas 70-90 (envío de mensajes)
- components/chat-interface.tsx líneas 120-140 (procesamiento de respuestas)"
```

### Sistema de Hooks
```
"Busca errores en:
- hooks/use-hopeai-system.ts relacionados con inicialización
- hooks/use-hopeai-optimized.ts problemas de optimización
- hooks/use-conversation-history.ts issues de persistencia"
```

### Persistencia de Contexto
```
"Analiza errores en lib/client-context-persistence.ts relacionados con:
- Almacenamiento local
- Compresión de contexto
- Recuperación de sesiones"
```

## 📊 Monitoreo de Métricas Personalizadas

### Métricas de Mensajes
```
"Revisa las métricas personalizadas de Sentry para:
- messages.sent.socratico
- messages.sent.academico
- messages.sent.clinico
¿Hay anomalías en el volumen de mensajes?"
```

### Métricas de Rendimiento
```
"Analiza las métricas de rendimiento para:
- Tiempo de respuesta del sistema HopeAI
- Latencia de orquestación
- Eficiencia de compresión de contexto"
```

## 🚨 Alertas y Monitoreo

### Configurar Alertas
```
"Ayúdame a configurar alertas en Sentry para:
1. Errores críticos en el sistema de chat
2. Fallos en la orquestación de agentes
3. Problemas de rendimiento en la API
4. Errores de autenticación o sesión"
```

### Releases y Despliegues
```
"Compara los errores antes y después del último release. ¿Introdujimos nuevos bugs?"
```

## 🔧 Debugging Específico

### Error de Streaming
```
"Busca errores relacionados con 'streaming', 'AsyncGenerator' o 'response processing' en el chat interface"
```

### Problemas de Contexto
```
"Analiza errores relacionados con 'context window', 'token count' o 'compression' en el sistema de persistencia"
```

### Errores de Enrutamiento
```
"Revisa issues con 'intelligent-intent-router', 'agent routing' o 'target agent' en el sistema de orquestación"
```

## 📈 Análisis de Tendencias

### Tendencias Semanales
```
"Muéstrame las tendencias de errores de las últimas 4 semanas. ¿Hay patrones por día de la semana o hora?"
```

### Análisis de Usuarios
```
"Analiza los errores por usuario. ¿Hay usuarios específicos que experimentan más problemas?"
```

### Comparación de Agentes
```
"Compara la tasa de errores entre los diferentes agentes (socratico, academico, clinico). ¿Cuál es más estable?"
```

## 🛠️ Soluciones Automáticas

### Fix con Seer
```
"Usa Seer para generar un fix automático para el error más frecuente en components/chat-interface.tsx"
```

### Optimizaciones Sugeridas
```
"Basándote en los datos de Sentry, ¿qué optimizaciones recomiendas para mejorar la estabilidad del sistema?"
```

## 📝 Reportes Personalizados

### Reporte Semanal
```
"Genera un reporte semanal de la salud del sistema incluyendo:
- Top 5 errores más frecuentes
- Métricas de rendimiento
- Comparación con la semana anterior
- Recomendaciones de mejora"
```

### Reporte de Release
```
"Crea un reporte del impacto del último release en la estabilidad del sistema"
```

---

## 💡 Tips para Usar Sentry MCP Efectivamente

1. **Sé específico**: Menciona archivos, líneas de código, o funciones específicas
2. **Usa contexto**: Relaciona errores con features o flujos de usuario
3. **Pide análisis**: No solo listes errores, pide insights y patrones
4. **Solicita soluciones**: Usa Seer para obtener fixes automáticos
5. **Monitorea tendencias**: Pregunta por cambios en el tiempo
6. **Compara períodos**: Analiza antes/después de releases o cambios

¡Estos ejemplos te ayudarán a aprovechar al máximo la integración de Sentry MCP con tu proyecto! 🚀