# Transcripción de Voz con Gemini API

## Descripción

Sistema de transcripción de voz a texto integrado en Aurora que utiliza el SDK de Gemini GenAI para convertir audio grabado en texto formateado, optimizado para uso clínico en psicología.

## Arquitectura

### Componentes

1. **Hook: `use-gemini-voice-transcription.ts`**
   - Maneja la grabación de audio usando MediaRecorder API
   - Gestiona estados de grabación y transcripción
   - Envía audio al endpoint API para procesamiento

2. **Componente: `gemini-voice-button.tsx`**
   - Botón de interfaz con estados visuales claros
   - Indicador de duración de grabación
   - Feedback visual durante transcripción
   - Manejo de errores con toasts

3. **Endpoint API: `/api/transcribe-audio`**
   - Recibe archivo de audio del cliente
   - Sube a Gemini Files API
   - Procesa transcripción con modelo Gemini 2.0 Flash
   - Retorna texto transcrito y formateado

### Flujo de Datos

```
Usuario presiona botón
    ↓
MediaRecorder captura audio
    ↓
Audio se envía a /api/transcribe-audio
    ↓
API sube archivo a Gemini Files API
    ↓
Gemini procesa y transcribe
    ↓
Texto se inserta en input del chat
```

## Características

### Grabación de Audio
- **Formato**: WebM con codec Opus (fallback a formatos soportados)
- **Calidad**: Mono, 16kHz, optimizado para voz
- **Mejoras**: Echo cancellation, noise suppression, auto gain control
- **Límite de tamaño**: 20MB máximo

### Transcripción
- **Modelo**: Gemini 2.0 Flash Exp
- **Idioma**: Español (optimizado para contexto clínico)
- **Temperatura**: 0.1 (precisión máxima)
- **Características**:
  - Puntuación automática
  - Reconocimiento de términos clínicos
  - Indicación de partes inaudibles
  - Formateo para legibilidad

### Formatos de Audio Soportados
- WAV (audio/wav)
- MP3 (audio/mp3, audio/mpeg)
- WEBM (audio/webm)
- OGG (audio/ogg)
- FLAC (audio/flac)

## Uso

### En el Chat Interface

El botón de grabación aparece en el input del chat, junto al botón de envío:

```tsx
<GeminiVoiceButton
  onTranscriptReady={(transcript) => {
    // Insertar transcripción en el input
    setInputValue(prev => prev.trim() ? `${prev} ${transcript}` : transcript)
  }}
  disabled={isProcessing || isStreaming}
/>
```

### Estados Visuales

1. **Idle**: Icono de micrófono normal
2. **Grabando**: Icono rojo pulsante + contador de tiempo
3. **Transcribiendo**: Spinner animado + texto "Transcribiendo..."
4. **Completado**: Toast de confirmación + texto insertado

## Configuración

### Variables de Entorno

```env
NEXT_PUBLIC_GOOGLE_AI_API_KEY=tu_api_key_aqui
```

### Permisos del Navegador

El usuario debe otorgar permisos de micrófono al navegador. El sistema maneja automáticamente:
- Solicitud de permisos
- Errores de permisos denegados
- Errores de micrófono no disponible
- Errores de micrófono en uso

## Manejo de Errores

### Errores Comunes

1. **Permisos denegados**
   - Mensaje: "Permisos de micrófono denegados. Por favor, permite el acceso al micrófono."
   - Solución: Usuario debe permitir acceso en configuración del navegador

2. **Micrófono no encontrado**
   - Mensaje: "No se encontró ningún micrófono. Verifica que tu dispositivo tenga un micrófono conectado."
   - Solución: Conectar micrófono o usar dispositivo con micrófono integrado

3. **Micrófono en uso**
   - Mensaje: "El micrófono está siendo usado por otra aplicación."
   - Solución: Cerrar otras aplicaciones que usen el micrófono

4. **Error de transcripción**
   - Mensaje: Error específico del servidor
   - Solución: Reintentar o verificar conectividad

## Optimizaciones

### Cliente
- Compresión de audio con codec Opus
- Configuración mono para reducir tamaño
- Sample rate optimizado (16kHz)
- Mejoras de audio (cancelación de eco, supresión de ruido)

### Servidor
- Validación de formato y tamaño
- Timeout de procesamiento (30 segundos)
- Limpieza automática de archivos temporales
- Tracking con Sentry para monitoreo

## Seguridad

- Archivos temporales se eliminan después de transcripción
- Validación de tipos MIME
- Límite de tamaño de archivo
- API key nunca expuesta al cliente
- Procesamiento server-side

## Métricas y Monitoreo

El sistema registra con Sentry:
- Transcripciones exitosas
- Tipo de audio
- Tamaño de archivo
- Duración del procesamiento
- Errores y excepciones

## Limitaciones

- Máximo 20MB por archivo de audio
- Timeout de 30 segundos para procesamiento
- Requiere conexión a internet estable
- Solo funciona en navegadores con soporte de MediaRecorder

## Mejoras Futuras

- [ ] Soporte para grabación continua en streaming
- [ ] Transcripción en tiempo real
- [ ] Soporte para múltiples idiomas
- [ ] Detección automática de idioma
- [ ] Compresión adicional de audio
- [ ] Cache de transcripciones frecuentes
- [ ] Análisis de sentimiento del audio
- [ ] Identificación de hablantes múltiples

## Referencias

- [Gemini Audio Understanding](https://ai.google.dev/gemini-api/docs/audio)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [@google/genai SDK](https://www.npmjs.com/package/@google/genai)
