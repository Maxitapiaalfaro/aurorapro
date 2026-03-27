# Análisis financiero del modelo de negocios de Aurora

Fecha: Octubre 2025

## Resumen ejecutivo

- **Modelo de costos**: El costo variable dominante proviene de llamadas a la API de Gemini (texto/multimodal y audio). El resto del OPEX (hosting, monitoreo, almacenamiento) es bajo y predecible.
- **Uso actual (código real)**:
  - Enrutamiento/entidades con `gemini-2.5-flash-lite` en [lib/intelligent-intent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:0:0-0:0).
  - Respuesta del agente (chat) con `ai.chats` en [lib/clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0) (config base usa `gemini-2.5-flash`, aunque los trackers asumen `flash-lite`).
  - Transcripción de voz con `gemini-2.5-flash-lite` en [app/api/transcribe-audio/route.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/app/api/transcribe-audio/route.ts:0:0-0:0).
  - Ficha clínica on-demand con `gemini-2.5-flash-lite` en [lib/clinical-task-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-task-orchestrator.ts:0:0-0:0).
  - Bullets (razonamiento progresivo, opcional) con `gemini-2.5-flash-lite` en [lib/dynamic-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:0:0-0:0).
- **Costos por turno (estimados)** con `flash-lite`:
  - Enrutamiento/entidades: muy bajo (entrada ~800 tokens, salida ~100).
  - Respuesta del agente: entrada típica 1.5–3k tokens, salida 600–1k tokens.
  - Costo total por turno: ~$0.0006–$0.0011 (sin adjuntos). Adjuntos grandes pueden elevar entrada.
  - Transcripción (10 min): salida ~2–4k tokens (~$0.0008–$0.0016); costo audio de entrada depende de tokens de audio (ver “Transcripción”).
- **Context caching**: útil solo si prompts grandes se repiten muchas veces por sesión. A volúmenes actuales, ahorro marginal; evaluar con métricas reales antes de activarlo de forma masiva.
- **Pricing propuesto** (derivado de unit economics y valor percibido): Starter $19, Pro $49, Enterprise $149+/usuario/mes. Márgenes brutos >95% incluso en escenarios de uso intensivo.

---

## Flujo técnico y llamadas a Gemini (basado en el repositorio)

- **Enrutamiento inteligente + extracción de entidades**:
  - Archivo: [lib/intelligent-intent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:0:0-0:0)
  - Llamada: `ai.models.generateContent({ model: 'gemini-2.5-flash-lite', ... })`
  - Comentario: 1 llamada por turno del usuario.
- **Chat de agente (Socrático/Clínico/Académico)**:
  - Archivo: [lib/clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0)
  - Llamada: `chat.sendMessageStream(...)` o [chat.sendMessage(...)](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:187:2-724:3)
  - Adjunta archivos con `createPartFromUri(...)` (clínicos/voz/pdf) si existen.
  - Comentario: 1 llamada por turno. El config base usa `gemini-2.5-flash` (`clinicalModelConfig`), pero el tracker de métricas asume `flash-lite`. Recomiendo estandarizar a `flash-lite` por defecto y promover a `flash` solo cuando la complejidad lo requiera (p. ej., análisis longitudinal).
- **Transcripción de audio**:
  - Archivo: [app/api/transcribe-audio/route.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/app/api/transcribe-audio/route.ts:0:0-0:0)
  - Flujo: `ai.files.upload(...)` → polling `ai.files.get(...)` → `ai.models.generateContent({ model: 'gemini-2.5-flash-lite', parts: [fileData] })` → `ai.files.delete(...)`.
  - Comentario: 1 llamada por transcripción, tras preparar el archivo.
- **Ficha clínica (on‑demand)**:
  - Archivo: [lib/clinical-task-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-task-orchestrator.ts:0:0-0:0)
  - Llamada: `ai.models.generateContent({ model: 'gemini-2.5-flash-lite', ... })`
  - Comentario: 1 llamada por generación/actualización.
- **Bullets progresivos (opcional)**:
  - Archivo: [lib/dynamic-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:0:0-0:0)
  - Llamada: `ai.chats.create(... 'gemini-2.5-flash-lite').sendMessageStream(...)`
  - Comentario: +1 llamada por turno si la funcionalidad está activa.
- **Análisis longitudinal (opcional/asíncrono)**:
  - Archivo: [lib/clinical-pattern-analyzer.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-pattern-analyzer.ts:0:0-0:0)
  - Llamada: `ai.models.generateContent({ model: 'gemini-2.5-flash', ... })`
  - Comentario: costo ocasional tras N sesiones del mismo paciente.

---

## Precios oficiales de Gemini (fuente: Google AI Developers)

Referencia: “Gemini Developer API Pricing”

- **Gemini 2.5 Flash (Standard)**:
  - Input (texto/imagen/video): $0.30 / 1M tokens
  - Input (audio): $1.00 / 1M tokens
  - Output (incl. thinking tokens): $2.50 / 1M tokens
  - Context caching: $0.03 / 1M tokens (texto/imagen/video), $0.10 (audio) + $1.00 / 1M tokens por hora (storage)
  - Live API: Input (texto) $0.50 / 1M, (audio/imagen/video) $3.00 / 1M; Output (texto) $2.00 / 1M, (audio) $12.00 / 1M
- **Gemini 2.5 Flash-Lite (Standard)**:
  - Input (texto/imagen/video): $0.10 / 1M tokens
  - Input (audio): $0.30 / 1M tokens
  - Output (incl. thinking tokens): $0.40 / 1M tokens
  - Context caching: $0.025 / 1M tokens (texto/imagen/video), $0.125 (audio) + $1.00 / 1M tokens por hora (storage)

Notas:

- Aurora usa mayoritariamente `gemini-2.5-flash-lite` en enrutamiento, transcripción y features auxiliares. El chat principal de agente puede configurarse a `flash-lite` para eficiencia y escalar a `flash` en tareas críticas (p. ej., análisis longitudinal).
- El “Grounding con Google Search/Maps” no se utiliza hoy en el código, por lo que su costo es $0.

---

## Costo unitario por interacción (fórmulas y ejemplos)

### Supuestos de tokens típicos por turno (texto)

- Enrutamiento + entidades (`flash-lite`):
  - Input ~800 tokens; Output ~100 tokens.
- Respuesta del agente (`flash-lite`):
  - Input ~1,500–3,000 tokens (system + contexto + mensaje); Output ~600–1,000 tokens.
- Bullets (opcional, `flash-lite`):
  - Input ~700; Output ~200.

### Fórmulas

- Costo input = (tokens_input / 1,000,000) × precio_input_modelo.
- Costo output = (tokens_output / 1,000,000) × precio_output_modelo.
- Costo por turno (sin bullets) ≈ costo_enrutamiento + costo_chat.
- Con bullets: sumar costo_bullets.

### Ejemplos (flash-lite)

- Enrutamiento (≈900 tokens totales):
  - Input (800): 800/1e6 × $0.10 ≈ $0.00008
  - Output (100): 100/1e6 × $0.40 ≈ $0.00004
  - Total ≈ $0.00012
- Chat del agente (≈2,500 in + 800 out):
  - Input: 2,500/1e6 × $0.10 ≈ $0.00025
  - Output: 800/1e6 × $0.40 ≈ $0.00032
  - Total ≈ $0.00057
- Bullets (opcional, ≈900 tokens):
  - Input 700: $0.00007; Output 200: $0.00008; Total ≈ $0.00015

→ **Costo por turno**:

- Sin bullets: ~$0.00012 + ~$0.00057 = **~$0.00069**
- Con bullets: sumar ~$0.00015 → **~$0.00084**

### Adjuntos (PDF/imagen)

- Se tokenizan como texto/imagen/video (tarifa input de `flash-lite`: $0.10 / 1M).
- Un PDF de 10 páginas con ~5,000 tokens adicionales aportaría ~$0.0005 por turno al input.

### Transcripción de voz (10 minutos)

- Código: [app/api/transcribe-audio/route.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/app/api/transcribe-audio/route.ts:0:0-0:0) usa `gemini-2.5-flash-lite`.
- Salida (texto) ~2,000–4,000 tokens → $0.0008–$0.0016.
- Entrada (audio): depende de cómo Gemini contabilice tokens de audio. Fórmula: (tokens_audio/1e6) × $0.30. Recomendación: instrumentar `usageMetadata` para capturar tokens reales y calibrar $/minuto (ver “Recomendaciones”).

---

## Context caching: impacto y sensibilidad

- Uso hoy: no hay explicit caching implementado; sí compresión de contexto (`context-window-manager`), lo que ya reduce tokens.
- **Ahorro teórico** (flash-lite):
  - Repetir 2,000 tokens de prompt por 20 turnos: Normal input $0.004; Caching input $0.001 + storage (2k tokens × 1h) ≈ $0.002 → Total $0.003 → ahorro ~$0.001 por sesión.
- **Conclusión**: Con prompts de tamaño moderado y sesiones cortas, el ahorro es pequeño. **No activar globalmente** hasta medir: usar caching explícito solo para prompts grandes y reutilizados (p. ej., systemInstruction largo de agente y resúmenes de paciente) con retention ≤1h.

---

## OPEX (sin personal/devs)

- **Hosting/Despliegue** (Next.js):
  - Vercel Pro (~$20–$40/mes por proyecto) + sobrecostos por funciones/edge si hay SSR intensivo. Alternativas: Render/Fly.io (rangos similares).
- **Monitoreo/alertas**:
  - Sentry (ya integrado: [instrumentation.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/instrumentation.ts:0:0-0:0), [sentry.server.config.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/sentry.server.config.ts:0:0-0:0), [sentry.edge.config.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/sentry.edge.config.ts:0:0-0:0)). Plan Free/Team ($0–$30+/mes según cuotas de eventos).
- **Almacenamiento de archivos clínicos**:
  - Hoy: servidor “in‑memory” ([lib/server-storage-adapter.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/server-storage-adapter.ts:0:0-0:0)) y cliente IndexedDB; adjuntos se suben a Gemini Files para inferencia. En producción, usar:
    - S3 ($0.023/GB/mes) o Supabase Storage ($5–$25/mes según cuota) como “source of truth”.
    - Tráfico CDN (incluido en Vercel/similar) bajo para PDFs/imagenes clínicas.
- **Dominios/SSL/CDN**: ~$1/mes (dominio anual $12) + incluido en plataforma.
- **Email (si se usa `resend`)**: $0–$20/mes dependiendo de volumen (no crítico en el flujo actual).
- **Backups y logging**: incluido en Sentry + snapshots del proveedor (bajo costo).

---

## Escenarios de uso y planes de precios (derivados de unit economics)

Supuestos base:

- `flash-lite` por defecto para enrutamiento+chat.
- 1 turno = 1 input usuario + 1 respuesta agente.
- Adjuntos: PDFs ocasionales.
- Bullets desactivado por defecto (activable en Pro/Enterprise).
- Transcripción: costo bajo por sesión; presento rango conservador.

### 1) Starter – Terapeuta independiente

- **Volumen**:
  - 150 turnos/mes.
  - 5 transcripciones de 10 min/mes.
  - 10 adjuntos (PDF/imagen) mensuales (chicos).
- **Costos variables**:
  - Turnos: 150 × $0.00069 ≈ **$0.10**
  - Adjuntos: +$0.005 por turno con adjunto (10 turnos) ≈ **$0.05**
  - Voz: 5 × ($0.003–$0.05) ≈ **$0.015–$0.25** (rango; ver nota transcripción)
  - Total variable ≈ **$0.17–$0.40/mes**
- **OPEX prorrateado**: <$1/usuario/mes a escala.
- **Precio recomendado**: **$19/mes**.
- **Margen bruto estimado**: >95%.

### 2) Pro – Terapeuta con cartera activa

- **Volumen**:
  - 600 turnos/mes.
  - 20 transcripciones/mes.
  - 40 adjuntos/mes.
  - Bullets activados.
- **Costos variables**:
  - Turnos: 600 × ($0.00069 + $0.00015 bullets) ≈ **$0.50**
  - Adjuntos: 40 × $0.0005 ≈ **$0.02**
  - Voz: 20 × ($0.003–$0.05) ≈ **$0.06–$1.00**
  - Total variable ≈ **$0.58–$1.52/mes**
- **OPEX prorrateado**: ~$1/usuario/mes.
- **Precio recomendado**: **$49/mes**.
- **Margen bruto estimado**: >96%.

### 3) Enterprise – Clínica/Equipo (por usuario)

- **Volumen**:
  - 2,500 turnos/mes/terapeuta.
  - 40 transcripciones/mes/terapeuta.
  - 100 adjuntos/mes/terapeuta.
  - Bullets activados. Ocasional análisis longitudinal (`flash`), p. ej. 4 al mes.
- **Costos variables** (por terapeuta):
  - Turnos: 2,500 × ($0.00069 + $0.00015) ≈ **$2.10**
  - Adjuntos: 100 × $0.0005 ≈ **$0.05**
  - Longitudinal (flash): 4 × (input 6k + output 2k → ~$0.0028 c/u) ≈ **$0.011**
  - Voz: 40 × ($0.003–$0.05) ≈ **$0.12–$2.00**
  - Total variable ≈ **$2.28–$4.16/mes**
- **OPEX prorrateado**: ~$1–$2/usuario/mes a escala (incluye soporte/monitoreo).
- **Precio recomendado**: **$149/mes/terapeuta** (con descuentos por volumen).
- **Margen bruto estimado**: >95%.

Notas importantes:

- Los costos variables por tokens son muy bajos con `flash-lite`. El precio final se fundamenta en valor clínico (tiempo ahorrado, calidad documental, supervisión reflexiva) y no en pass‑through de tokens.
- Si ciertos equipos requieren `flash` para más calidad/razonamiento, recomendar “Smart Escalation”: subir a `flash` solo en tareas donde aporte ROI clínico claro (p. ej., análisis longitudinal).

---

## Infraestructura y despliegue (estado y recomendación)

- **Estado actual**:
  - Almacenamiento servidor simulado (in‑memory), persistencia cliente (`IndexedDB`).
  - Uso intensivo de Gemini Files para adjuntos en contexto.
  - Monitoreo con Sentry configurado y bloqueo de logs en prod ([instrumentation.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/instrumentation.ts:0:0-0:0), [next.config.mjs](cci:7://file:///c:/Users/david/hopeai-copilot-v0/next.config.mjs:0:0-0:0)).
- **Recomendación**:
  - Hosting en Vercel Pro, escalando a Enterprise si hace falta compliance/SLAs.
  - Almacenamiento de documentos clínicos en S3 o Supabase Storage; retención clara y borrado seguro.
  - Mantener `ai.files.delete(...)` post‑transcripción (ya implementado). Extender a documentos: borrar en Gemini Files cuando no se requiera para contexto.
  - Centralizar modelo por agente en [lib/clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0) para alinear realidad con métricas (hoy [recordModelCallStart](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/session-metrics-comprehensive-tracker.ts:187:2-212:3) asume `flash-lite`).

---

## Riesgos, compliance y mitigaciones

- **PHI/PII y retención**:
  - [lib/clinical-file-manager.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-file-manager.ts:0:0-0:0) sube archivos a Gemini Files y espera estado ACTIVE; no siempre borra. Proponer política de retención (p. ej., borrar en T+24h o al cerrar caso) y guardar “source of truth” en almacenamiento propio cifrado.
- **Medición de costos reales**:
  - Instrumentar `usageMetadata` en todas las rutas (incluida transcripción) para conocer tokens reales por minuto/audio y por adjunto, cerrando la brecha de estimación.
- **Caching**:
  - Activarlo de forma selectiva tras pilotar y medir (ahorro marginal con prompts medianos; puede no justificar el $/hora de storage).
- **LatAm cumplimiento**:
  - Alinear con normativa local (consentimiento informado, retención mínima, acceso y portabilidad).

---

## Roadmap y recomendaciones

- **Estandarizar modelo base**:
  - Usar `gemini-2.5-flash-lite` por defecto en agentes y enrutamiento. Promover a `gemini-2.5-flash` solo donde el valor clínico (p. ej., análisis longitudinal) lo justifique.
- **Instrumentación de costos**:
  - Extender `sessionMetricsComprehensiveTracker` a transcripción y a adjuntos (tokens) para tener $ reales por turno y por usuario.
- **Caching explícito (piloto)**:
  - Cachear systemInstructions por sesión (≤1h), y resúmenes de paciente estables (con invalidación al actualizar), midiendo ahorro vs storage.
- **Almacenamiento**:
  - Mover documentos clínicos a S3/Supabase como repositorio seguro. Usar Gemini Files solo como “copia de trabajo” efímera para inferencia.
- **Planes y empaquetado**:
  - Mantener Starter/Pro/Enterprise basados en valor, no en tokens. Incluir features por plan: bullets, longitud de historial, análisis longitudinal, soporte prioritario, auditorías, etc.

---

## Anexo: referencias al código

- Enrutamiento y extracción: [lib/intelligent-intent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/intelligent-intent-router.ts:0:0-0:0) (modelos `gemini-2.5-flash-lite`).
- Chat de agentes: [lib/clinical-agent-router.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-agent-router.ts:0:0-0:0) → [sendMessage()](cci:1://file:///c:/Users/david/hopeai-copilot-v0/lib/hopeai-system.ts:187:2-724:3) y `chat.sendMessageStream(...)` (adjunta `createPartFromUri`).
- Transcripción: [app/api/transcribe-audio/route.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/app/api/transcribe-audio/route.ts:0:0-0:0) (Files API + `models.generateContent` con audio).
- Ficha clínica: [lib/clinical-task-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/clinical-task-orchestrator.ts:0:0-0:0) (flash‑lite).
- Bullets progresivos: [lib/dynamic-orchestrator.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/dynamic-orchestrator.ts:0:0-0:0) (flash‑lite).
- Métricas: [lib/session-metrics-comprehensive-tracker.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/session-metrics-comprehensive-tracker.ts:0:0-0:0).
- Storage actual: [lib/server-storage-adapter.ts](cci:7://file:///c:/Users/david/hopeai-copilot-v0/lib/server-storage-adapter.ts:0:0-0:0) (in‑memory) y cliente IndexedDB.

---

# Estado de la tarea

- **Análisis de llamadas a Gemini** completado con referencias a `*.ts`.
- **Precios oficiales** incorporados (flash y flash‑lite, caching, audio).
- **Escenarios y planes de precios** propuestos con unit economics y sensibilidad.
- **OPEX e infraestructura** mapeados y recomendaciones dadas.
- **Siguientes pasos**: instrumentar tokens en transcripción/adjuntos y pilotear caching explícito para validar ahorros.
