# ⚠️ Puntos Críticos de Transcripción de Voz - Verificación Completa

## 🎯 Objetivo
**CRÍTICO**: No perder transcripciones de sesiones clínicas. Cada grabación puede representar una sesión completa de terapia.

---

## ✅ Límites Configurados (10 minutos)

### 1. **Timeout de Grabación en Cliente**
📍 `hooks/use-gemini-voice-transcription.ts` línea 130-135

```typescript
const maxRecordingTime = 600000 // 10 minutos = 600,000 ms
recordingTimeoutRef.current = setTimeout(() => {
  console.log('⏰ Límite de 10 minutos alcanzado')
  stopRecording()
}, maxRecordingTime)
```

✅ **Estado**: Configurado a 10 minutos
✅ **Comportamiento**: Detiene automáticamente y transcribe lo grabado
✅ **Limpieza**: Se limpia correctamente en `stopRecording()`

---

### 2. **Límite de Tamaño de Archivo**
📍 `app/api/transcribe-audio/route.ts` línea 58-66

```typescript
const maxSize = 50 * 1024 * 1024 // 50MB
// Estimación: ~5MB por minuto en WebM Opus = 50MB para 10 minutos
```

✅ **Estado**: 50MB (suficiente para 10 minutos)
✅ **Formato**: WebM Opus comprimido (~5MB/min)
✅ **Margen**: Permite hasta ~10 minutos de audio de alta calidad

---

### 3. **Timeout de Procesamiento en Gemini**
📍 `app/api/transcribe-audio/route.ts` línea 83

```typescript
const maxAttempts = 60 // 60 segundos máximo
```

✅ **Estado**: 60 segundos de espera
✅ **Propósito**: Esperar a que Gemini procese archivos grandes
✅ **Crítico**: Suficiente para archivos de 10 minutos

---

## 🔒 Puntos que NO Interrumpen la Grabación

### ✅ 1. **Navegador - Permisos de Micrófono**
- **Configurado**: Headers de Permissions-Policy en `middleware.ts` y `next.config.mjs`
- **Valor**: `microphone=*` (permitido para todos)
- **Verificación**: Usuario solo necesita aceptar permisos una vez

### ✅ 2. **MediaRecorder - Estabilidad**
- **Configuración**: Mono, 16kHz, con mejoras de audio
- **Formato**: WebM Opus (ampliamente soportado)
- **Fallbacks**: Intenta WebM → MP4 → formato por defecto
- **Manejo de errores**: Captura todos los errores del MediaRecorder

### ✅ 3. **Conexión de Red**
- **No afecta grabación**: El audio se graba localmente en el navegador
- **Solo afecta**: La transcripción (después de grabar)
- **Retry**: El usuario puede reintentar la transcripción si falla

### ✅ 4. **Memoria del Navegador**
- **Chunks**: Audio se almacena en chunks pequeños
- **Límite práctico**: 50MB es manejable para navegadores modernos
- **Liberación**: Memoria se libera después de enviar

### ✅ 5. **Cambio de Pestaña/Ventana**
- **MediaRecorder**: Continúa grabando en background
- **Contador**: Continúa actualizándose
- **Estado**: Se mantiene correctamente

### ✅ 6. **Suspensión del Sistema**
- **Laptop cerrada**: Detiene grabación (comportamiento esperado)
- **Pantalla apagada**: Continúa grabando
- **Modo ahorro**: Continúa grabando

---

## ⚠️ Escenarios de Interrupción Controlada

### 1. **Usuario Cierra la Pestaña**
- ❌ **Resultado**: Se pierde la grabación
- 🔧 **Mitigación**: Agregar `beforeunload` warning (próxima mejora)

### 2. **Navegador se Cierra/Crash**
- ❌ **Resultado**: Se pierde la grabación
- 🔧 **Mitigación**: Implementar guardado local periódico (próxima mejora)

### 3. **Pérdida Total de Conexión**
- ✅ **Grabación**: Continúa normalmente
- ⚠️ **Transcripción**: Falla, pero se puede reintentar
- 🔧 **Mitigación**: Guardar audio localmente para retry (próxima mejora)

### 4. **Error en API de Gemini**
- ✅ **Grabación**: Ya completada
- ⚠️ **Transcripción**: Falla con error específico
- 🔧 **Mitigación**: Retry automático (próxima mejora)

---

## 🛡️ Protecciones Implementadas

### 1. **Limpieza de Recursos**
```typescript
// Al detener grabación
stream.getTracks().forEach(track => track.stop())
clearInterval(durationIntervalRef.current)
clearTimeout(recordingTimeoutRef.current)
```

### 2. **Manejo de Errores Completo**
- ✅ Permisos denegados
- ✅ Micrófono no encontrado
- ✅ Micrófono en uso
- ✅ Error de MediaRecorder
- ✅ Error de red en transcripción
- ✅ Error de Gemini API
- ✅ Timeout de procesamiento

### 3. **Feedback Visual Constante**
- ✅ Contador de duración en tiempo real
- ✅ Indicador de grabación (rojo pulsante)
- ✅ Indicador de transcripción (spinner)
- ✅ Toasts de error y éxito

### 4. **Validaciones Múltiples**
- ✅ Soporte del navegador
- ✅ Formato de audio
- ✅ Tamaño de archivo
- ✅ Estado del archivo en Gemini
- ✅ Respuesta de transcripción

---

## 📊 Capacidades Actuales

| Métrica | Valor | Justificación |
|---------|-------|---------------|
| **Tiempo máximo** | 10 minutos | Sesión clínica completa |
| **Tamaño máximo** | 50 MB | ~10 min de WebM Opus |
| **Timeout Gemini** | 60 segundos | Procesamiento de archivos grandes |
| **Formatos** | WebM, MP3, WAV, OGG, FLAC | Máxima compatibilidad |
| **Calidad** | 16kHz Mono | Óptimo para voz |
| **Compresión** | Opus codec | ~5MB/minuto |

---

## 🔮 Mejoras Futuras Recomendadas

### Alta Prioridad
1. **Warning antes de cerrar pestaña** durante grabación
   ```typescript
   window.addEventListener('beforeunload', (e) => {
     if (isRecording) {
       e.preventDefault()
       e.returnValue = '¿Seguro que quieres salir? La grabación se perderá.'
     }
   })
   ```

2. **Guardado local del audio** para retry
   ```typescript
   // Guardar en IndexedDB o localStorage
   const savedAudio = {
     blob: audioBlob,
     timestamp: Date.now(),
     duration: duration
   }
   ```

3. **Retry automático** en caso de error de red
   ```typescript
   const maxRetries = 3
   for (let i = 0; i < maxRetries; i++) {
     try {
       await transcribeAudio(audioBlob)
       break
     } catch (error) {
       if (i === maxRetries - 1) throw error
       await delay(2000 * (i + 1)) // Backoff exponencial
     }
   }
   ```

### Media Prioridad
4. **Indicador de espacio disponible** antes de grabar
5. **Compresión adicional** para archivos muy grandes
6. **Chunks de transcripción** para archivos >5 minutos
7. **Guardado periódico** durante grabación larga

### Baja Prioridad
8. **Transcripción en tiempo real** (streaming)
9. **Múltiples idiomas** automático
10. **Análisis de sentimiento** del audio

---

## ✅ Checklist de Verificación

Antes de cada deploy, verificar:

- [ ] Timeout de grabación: 600000ms (10 min)
- [ ] Límite de tamaño: 50MB
- [ ] Timeout de Gemini: 60 intentos
- [ ] Permissions-Policy: `microphone=*`
- [ ] Limpieza de timeouts en `stopRecording()`
- [ ] Manejo de errores completo
- [ ] Feedback visual funcionando
- [ ] Formato WebM Opus soportado
- [ ] Fallbacks de formato configurados
- [ ] Validaciones de API activas

---

## 🚨 Monitoreo Recomendado

Métricas a trackear en Sentry:
1. Tasa de éxito de transcripciones
2. Duración promedio de grabaciones
3. Tamaño promedio de archivos
4. Errores de timeout
5. Errores de Gemini API
6. Tiempo de procesamiento
7. Tasa de retry

---

## 📞 Contacto en Caso de Problemas

Si un usuario reporta pérdida de transcripción:
1. Verificar logs de Sentry
2. Revisar estado de Gemini API
3. Verificar permisos del navegador
4. Comprobar tamaño del archivo
5. Revisar formato de audio
6. Verificar conectividad de red durante transcripción

---

**Última actualización**: 2025-01-20
**Versión**: 1.0.0
**Estado**: ✅ Producción Ready
