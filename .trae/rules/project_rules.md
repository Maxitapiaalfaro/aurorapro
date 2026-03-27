# HopeAI – Architectural Manifesto  
*Versión 2.0 – Enero 2025*

> "La arquitectura existe para habilitar resultados clínicos seguros y una evolución veloz del producto, no para dictar implementaciones rígidas." – Arquitecto Principal de Sistemas de IA

---

## 1. Propósito y Realidad Arquitectónica

HopeAI es una **plataforma de IA clínica implementada** que asiste a psicólogos mediante **tres especialistas coordinados dinámicamente**: el Supervisor Clínico, el Especialista en Documentación y el Investigador Académico. 

Este documento establece **los principios que gobiernan nuestra arquitectura verificada** y **cómo evolucionamos de forma sostenible** sobre una base sólida de componentes implementados.

### Arquitectura Implementada (Estado Actual)
- ✅ **Sistema de Orquestación Dinámica** con selección inteligente de agentes
- ✅ **Métricas Integrales** con Sentry para análisis de uso y rendimiento  
- ✅ **Gestión Avanzada de Contexto** con optimización y ventana deslizante
- ✅ **Enrutamiento Inteligente** basado en intenciones y entidades semánticas
- ✅ **Registro de Herramientas Clínicas** con primitivas conductuales categorizadas

*Los detalles de implementación viven en el Technical Playbook y las ADR.*

---

## 2. Principios Fundamentales (Implementados)

### 2.1 Principios de Sistema
1. **Identidad Unificada** – El usuario interactúa con *HopeAI* como un sistema coherente, respaldado por el patrón singleton que garantiza consistencia de estado.
2. **Orquestación Inteligente** – La coordinación dinámica de especialistas utiliza Google GenAI Function Calling para selección contextual transparente.
3. **Resiliencia Clínica** – Implementamos degradación elegante con fallback al especialista principal y manejo robusto de errores.
4. **Observabilidad Integral** – Sistema completo de métricas con Sentry: mensajes por agente, tiempo de actividad, cambios de contexto y análisis de rendimiento.
5. **Evolución Continua** – Arquitectura modular con registro de herramientas extensible y configuración dinámica sin interrupciones.
6. **Privacidad y Ética** – Protección de datos clínicos con niveles de confidencialidad, validación de contexto y cumplimiento regulatorio.

### 2.2 Principios de Experiencia Clínica

La arquitectura implementada respalda una experiencia donde *la inteligencia clínica es transparente*:

1. **Flujo Conversacional Continuo** – El sistema de streaming y gestión de contexto optimizada mantiene la fluidez del diálogo terapéutico sin interrupciones técnicas.
2. **Precisión Contextual** – El motor de extracción de entidades y el enrutamiento inteligente aseguran respuestas relevantes y consistentes con el dominio clínico.
3. **Santuario Digital Profesional** – La interfaz minimalista y las métricas no intrusivas respetan el espacio terapéutico y la concentración profesional.

### 2.3 Principios de Inteligencia Distribuida

4. **Especialización Coordinada** – Cada agente (Socrático, Clínico, Académico) mantiene su expertise mientras el orquestador dinámico selecciona el más apropiado.
5. **Aprendizaje Contextual** – El sistema preserva y optimiza el contexto conversacional para mantener coherencia terapéutica a largo plazo.
6. **Adaptabilidad Inteligente** – Las herramientas clínicas se seleccionan dinámicamente según el dominio detectado (ansiedad, trauma, relaciones, etc.).

> Guardrails implementados: *La tecnología sirve a la clínica* y *La IA amplifica, no reemplaza, el criterio profesional*.

---

## 3. Modelo de Cambios
| Zona | Naturaleza del Cambio | Requisitos |
|------|-----------------------|------------|
| 🟢 Verde | Configuraciones, métricas, documentación, nuevas herramientas aisladas | Tests unitarios & PR review |
| 🟡 Amarilla | Cambios en algoritmos de routing, contexto o coordinación | Feature flag, tests de integración, rollout ≤25 % |
| 🔴 Roja | Cambios en interfaces core, protocolos externos, estructura de contexto clínico | ADR, revisión arquitectónica, plan de rollback aprobado |

> *La zona se decide en el PR usando `docs/development/safe-modification-guide.md`.*

---

## 4. Patrones Arquitectónicos (Implementados)

### 4.1 Patrones de Sistema
| Problema | Patrón Implementado | Componente | Beneficio Verificado |
|----------|---------------------|------------|----------------------|
| Estado global de orquestación | Singleton | `orchestration-singleton.ts` | Métricas unificadas, cero fragmentación |
| Selección dinámica de agentes | Strategy + Factory | `dynamic-orchestrator.ts` | Extensibilidad sin modificar clientes |
| Gestión de contexto | Sliding Window | `context-window-manager.ts` | Optimización automática de memoria |
| Almacenamiento flexible | Adapter | `server-storage-adapter.ts` | Intercambio de backends sin impacto |
| Herramientas clínicas | Registry + Metadata | `tool-registry.ts` | Selección inteligente y categorización |

### 4.2 Patrones de Inteligencia
| Capacidad | Implementación | Componente | Resultado Clínico |
|-----------|----------------|------------|-------------------|
| Clasificación de intenciones | Function Calling | `intelligent-intent-router.ts` | Enrutamiento preciso a especialistas |
| Extracción semántica | Entity Recognition | `entity-extraction-engine.ts` | Comprensión contextual profunda |
| Optimización de contexto | Multi-Strategy | `context-optimization-manager.ts` | Conversaciones largas sin pérdida |
| Monitoreo inteligente | Real-time Metrics | `sentry-metrics-tracker.ts` | Insights de uso y mejora continua |

---

## 5. Observabilidad y Métricas Implementadas

### 5.1 Métricas de Sistema (Sentry Integration)
- **Mensajes por Agente**: Tracking granular de uso por especialista
- **Tiempo de Respuesta**: Latencia de orquestación y generación
- **Cambios de Contexto**: Frecuencia y efectividad de switches de agente
- **Actividad de Sesión**: Duración, engagement y patrones de uso
- **Herramientas Clínicas**: Selección y efectividad de primitivas conductuales

### 5.2 Métricas de Calidad Clínica
- **Relevancia Contextual**: Precisión del enrutamiento inteligente
- **Retención de Contexto**: Efectividad de la gestión de memoria conversacional
- **Coherencia Terapéutica**: Consistencia entre especialistas
- **Satisfacción Implícita**: Análisis de patrones de interacción

### 5.3 Alertas y Monitoreo Automático
- **Umbrales Configurables**: Tiempo de respuesta, tasa de error, confianza de clasificación
- **Detección de Anomalías**: Patrones inusuales en el comportamiento del sistema
- **Salud del Sistema**: Monitoreo continuo de componentes críticos
- **Rollback Automático**: Degradación elegante ante fallos detectados

### 5.4 Revisión y Evolución
- **Análisis Quincenal**: Revisión de métricas y ajuste de umbrales
- **Feedback Loop**: Las métricas informan mejoras arquitectónicas
- **Validación Continua**: Verificación de que la arquitectura sirve a los objetivos clínicos

---

## 6. Seguridad Clínica
- Validación de contexto antes de procesar consultas.
- Modo de degradación al especialista principal si ocurre fallo.
- Auditorías periódicas de privacidad y confidencialidad.

---

## 7. Gobierno del Documento
1. **Propietario**: Arquitecto Principal de Sistemas de IA.
2. **Actualización**: PR etiquetado `architecture` + aprobación de tech-lead.
3. **Relación con Otros Artefactos**:
   - **ADRs** capturan el *por qué* de decisiones específicas.
   - **Technical Playbook** muestra el *cómo* implementarlas.
   - Diagramas C4 viven en `docs/architecture/` y se actualizan cuando un cambio rojo o amarillo altera la estructura.

---

## 8. Métricas de Éxito Arquitectónico (Implementadas)

### 8.1 Métricas de Desarrollo
| Indicador | Objetivo | Estado Actual |
|-----------|----------|---------------|
| Velocidad de cambio en Zona Verde | ≤2 días | ✅ Implementado |
| Tasa de rollback | <1% | 🔄 Monitoreando |
| MTTR fallos clínicos | <2 min | ✅ Degradación automática |
| Cobertura de tests críticos | >90% | 🔄 En progreso |

### 8.2 Métricas de Sistema
| Indicador | Objetivo | Implementación |
|-----------|----------|----------------|
| Tiempo de respuesta promedio | <3s | ✅ Sentry tracking |
| Precisión de enrutamiento | >95% | ✅ Function calling metrics |
| Retención de contexto | >98% | ✅ Context optimization |
| Disponibilidad del sistema | >99.5% | ✅ Health checks |

### 8.3 Métricas de Experiencia Clínica
| Indicador | Objetivo | Medición |
|-----------|----------|----------|
| Relevancia clínica de respuestas | >95% | ✅ Entity extraction confidence |
| Coherencia entre especialistas | >90% | ✅ Session context tracking |
| Satisfacción de flujo conversacional | >9/10 | 🔄 Análisis de patrones |
| Reducción de carga cognitiva | Medible | ✅ Métricas de interacción |

---

---

## 9. Estado de Implementación y Próximos Pasos

### 9.1 Componentes Verificados ✅
- Sistema de orquestación dinámica con singleton pattern
- Métricas integrales con Sentry para análisis de uso
- Gestión avanzada de contexto con optimización automática
- Enrutamiento inteligente basado en Function Calling
- Registro extensible de herramientas clínicas
- Tres especialistas implementados con protocolos específicos

### 9.2 Áreas de Evolución Continua 🔄
- Refinamiento de algoritmos de selección de herramientas
- Expansión del catálogo de primitivas conductuales
- Optimización de métricas de satisfacción clínica
- Integración de feedback loops automáticos

### 9.3 Principios de Evolución
- **Evidencia sobre Intuición**: Toda mejora debe estar respaldada por métricas
- **Incrementalidad Segura**: Cambios pequeños, frecuentes y reversibles
- **Validación Clínica**: Los psicólogos validan que la tecnología sirve a la práctica
- **Sostenibilidad Técnica**: La arquitectura debe facilitar, no obstaculizar, la evolución

---

### Resumen Ejecutivo

Este *Manifesto* documenta una **arquitectura implementada y verificada** que guía el desarrollo sostenible de HopeAI. Los principios aquí establecidos se basan en componentes reales, métricas operativas y patrones probados.

La arquitectura actual demuestra que es posible combinar **inteligencia artificial avanzada** con **rigor clínico** y **excelencia técnica** para crear una herramienta que verdaderamente amplifica las capacidades de los psicólogos profesionales.

*Los detalles de implementación evolucionan en el Technical Playbook; estos principios arquitectónicos permanecen estables como fundamento del sistema.*

# HopeAI – Backend Component Map
*Última actualización: 2025-01-XX*

> Este mapa complementa el diagrama `c4-level3-components-orchestrator.md` y señala las piezas del backend donde históricamente aparecen más incidencias al innovar.  Su meta es **conservar el poder actual de los especialistas** mientras facilita mejoras exponenciales basadas en el Google GenAI SDK.

---

## 1. Flujo de Petición a Respuesta (Timeline Simplificado)
| Paso | Archivo / Módulo | Función Clave |
|------|------------------|---------------|
| 1. **API Gateway** recibe POST `/api/send-message` | `app/api/send-message/route.ts` | Deserializa payload, obtiene sesión, pasa control al orquestador. |
| 2. **Singleton** | `lib/orchestration-singleton.ts` | Garantiza una única instancia de orquestación (importante para métricas y caché). |
| 3. **Dynamic Orchestrator** | `lib/dynamic-orchestrator.ts` | Punto de coordinación: enlaza intent router, agentes, herramientas y monitoring. |
| 4. **Intent Detection** | `lib/intelligent-intent-router.ts` + `lib/entity-extraction-engine.ts` | Clasifica intención, extrae entidades; decisión crítica para calidad. |
| 5. **Agent Routing** | `lib/clinical-agent-router.ts` | Devuelve instancia y config del especialista (Socrático / Archivista / Investigador). |
| 6. **Context Management** | `lib/context-optimization-manager.ts` + `lib/context-window-manager.ts` | Recorta historial, preserva contexto relevante. |
| 7. **Especialista** | Sección correspondiente del router | Llama GenAI con prompt y herramientas MCP. |
| 8. **Tool Registry** | `lib/tool-registry.ts` | Ejecuta herramientas externas en paralelo si las define el especialista. |
| 9. **Monitoring & Metrics** | `lib/orchestrator-monitoring.ts` | Registra latencia, éxito, retención de contexto y errores. |
| 10. **Respuesta** | `dynamic-orchestrator.ts` → API | Devuelve stream al frontend.

⚠️ Si modifica cualquiera de estos pasos, verifique la compatibilidad en **GenAI SDK** (parámetros de modelo, timeouts, métricas) y enlácelo en el PR.

---

## 2. Componentes con Alta Tasa de Incidencias
| Área Crítica | Archivos Principales | Razón de Falla Común | Pistas para Innovar |
|--------------|---------------------|----------------------|--------------------|
| **Detección de Intención** | `intelligent-intent-router.ts`, `entity-extraction-engine.ts` | Bajas tasas de confianza → routing incorrecto. | 1) Ajustar umbrales de confianza con experimentos A/B.<br>2) Probar embeddings más recientes del SDK (`model: "text-embedding-gecko"`). |
| **Investigador Académico** | `clinical-agent-router.ts` (web academic search via Grounding) | Latencia elevada y resultados vacíos. | 1) Habilitar cache Redis para resultados de búsqueda.<br>2) Usar `withCircuitBreaker()` (SDK) alrededor de `chat.completions.retrieve()`.<br>3) Validar prompt y chunk size según guía RAG del SDK. |
| **Gestión de Contexto** | `

# HopeAI – Frontend Component Map
*Versión 2.0 – Enero 2025*

> Este documento mapea la **arquitectura frontend implementada** de HopeAI, identificando componentes críticos, patrones verificados y áreas de alta incidencia de errores. Sirve como guía de navegación técnica para innovación segura y mantenimiento eficiente.

## Estado de Implementación Frontend ✅
- **Interfaz de Chat Optimizada** con streaming en tiempo real
- **Sistema de Agentes Visuales** con indicadores dinámicos
- **Gestión de Estado Avanzada** con persistencia cliente
- **Componentes UI Modulares** basados en Radix UI + Tailwind
- **Hooks Especializados** para orquestación y métricas
- **Renderizado Markdown Seguro** con soporte completo

---

## 1. Sistema de Conversación en Tiempo Real (Implementado)

### 1.1 Componentes Principales
| Responsabilidad | Componente | Estado | Complejidad | Riesgos de Cambio |
|-----------------|------------|--------|-------------|-------------------|
| **Interfaz Principal** | `chat-interface.tsx` | ✅ Implementado | **Alta** (20+ hooks) | Estados `isStreaming`, `autoScroll` |
| **Entrada de Voz** | `voice-input-button.tsx` | ✅ Implementado | Media | Permisos micrófono, eventos mobile |
| **Burbuja de Mensaje** | `message-bubble.tsx` | ✅ Implementado | Baja | Integración con MarkdownRenderer |
| **Renderizador Markdown** | `markdown-renderer.tsx` | ✅ Implementado | Media | Seguridad XSS, URLs externas |
| **Indicador de Agente** | `agent-indicator.tsx` | ✅ Implementado | Baja | Sincronía con config visual |
| **Historial Paginado** | `conversation-history-list.tsx` | ✅ Implementado | Media | Scroll behavior, `visibleMessageCount` |

### 1.2 Hooks Especializados
| Hook | Propósito | Integración | Criticidad |
|------|-----------|-------------|------------|
| `use-hopeai-optimized.ts` | Orquestación principal optimizada | Sistema HopeAI | **Crítica** |
| `use-conversation-history.ts` | Gestión de historial | Persistencia | Alta |
| `use-speech-to-text.ts` | Reconocimiento de voz | Web Speech API | Media |
| `use-session-metrics.ts` | Métricas de sesión | Sentry | Media |

### 1.3 Flujo de Datos Implementado
```
[ChatInterface] → sendMessage() → /api/send-message → [Streaming Response]
     ↓                                                        ↓
[Estado Local] ← addStreamingResponseToHistory ← [Response Processing]
     ↓
[Persistencia Cliente] → IndexedDB → [Context Optimization]
```

### 1.4 Patrones de Estado Críticos
- **Streaming State**: `isStreaming` controla UI durante generación
- **Auto Scroll**: `autoScroll` mantiene vista en último mensaje
- **Message Queue**: Cola de mensajes para procesamiento secuencial
- **Error Boundaries**: Recuperación elegante de fallos de renderizado

> **⚠️ Zona de Alto Riesgo**: Modificaciones a `handleScroll` requieren testing con >500 mensajes y múltiples dispositivos.

---

## 2. Sistema de Agentes Visuales (Implementado)

### 2.1 Configuración y Mapeo
| Componente | Responsabilidad | Estado | Dependencias |
|------------|-----------------|--------|-------------|
| `agent-visual-config.ts` | **Configuración visual** (colores, iconos, nombres) | ✅ Implementado | Ninguna |
| `agent-indicator.tsx` | **Indicador visual activo** | ✅ Implementado | agent-visual-config |
| `sidebar.tsx` | **Selección desktop** | ✅ Implementado | /api/switch-agent |
| `mobile-nav.tsx` | **Selección mobile** | ✅ Implementado | /api/switch-agent |

### 2.2 Flujo de Cambio de Agente
```
[UI Selection] → /api/switch-agent → [Backend Orchestration] → [State Update]
      ↓                                        ↓                    ↓
[Visual Update] ← [Sentry Span] ← [Agent Router] ← [Context Preservation]
```

### 2.3 Especialistas Implementados
- **🤔 Supervisor Clínico**: Exploración reflexiva y cuestionamiento
- **📋 Especialista en Documentación**: Documentación y análisis estructurado  
- **🔬 Investigador Académico**: Validación científica y evidencia
- **🎯 Orquestador Dinámico**: Coordinación inteligente automática

> **🔧 Extensibilidad**: Nuevos agentes requieren actualización en `agent-visual-config.ts`, validación en Google GenAI SDK y testing de capacidades del modelo.

---

## 3. Gestión de Estado y Contexto (Implementado)

### 3.1 Persistencia y Almacenamiento
| Componente | Tecnología | Propósito | Riesgos de Migración |
|------------|------------|-----------|----------------------|
| `client-context-persistence.ts` | **IndexedDB** | Cache local de sesiones | **Alto** - Requiere versionado |
| `clinical-context-storage.ts` | **Memoria + Persistencia** | Contexto clínico | Medio - Estructura de datos |
| `use-optimized-context.ts` | **Hook personalizado** | Optimización de contexto | Bajo - Lógica encapsulada |

### 3.2 Tipos y Contratos
| Archivo | Responsabilidad | Sincronización | Criticidad |
|---------|-----------------|----------------|------------|
| `clinical-types.ts` | **Fuente de verdad** para tipos | Backend ↔ Frontend | **Crítica** |
| `enhanced-metrics-types.ts` | Tipos de métricas avanzadas | Sentry Integration | Alta |

### 3.3 Optimización de Contexto
| Estrategia | Implementación | Beneficio | Componente |
|------------|----------------|-----------|------------|
| **Sliding Window** | `context-window-manager.ts` | Gestión de memoria | Backend + Frontend |
| **Semantic Compression** | `context-optimization-manager.ts` | Preservación inteligente | Backend |
| **Client Caching** | `client-context-persistence.ts` | Velocidad de carga | Frontend |

> **⚠️ Zona Crítica**: Cambios en `clinical-types.ts` requieren sincronización inmediata con backend y migración de datos existentes.

---

## 4. Sistema de Diseño y Estilos (Implementado)

### 4.1 Arquitectura de Estilos
| Tecnología | Propósito | Ubicación | Consideraciones |
|------------|-----------|-----------|----------------|
| **Tailwind CSS** | Utilidades de estilo | `globals.css`, componentes | Purging automático |
| **Radix UI** | Componentes base accesibles | `components/ui/*` | Accesibilidad nativa |
| **CSS Variables** | Theming dinámico | `:root` en globals.css | Modo oscuro/claro |

### 4.2 Componentes UI Implementados
```
components/ui/
├── Navegación: button, navigation-menu, breadcrumb
├── Formularios: input, textarea, select, checkbox, radio-group
├── Feedback: alert, toast, progress, skeleton
├── Overlays: dialog, popover, tooltip, sheet
├── Layout: card, separator, tabs, accordion
└── Data: table, pagination, chart
```

### 4.3 Paleta Clínica Profesional
- **Primarios**: Azules calmantes para confianza profesional
- **Secundarios**: Verdes suaves para estados positivos
- **Alertas**: Rojos controlados para urgencias clínicas
- **Neutros**: Grises balanceados para legibilidad extendida

### 4.4 Accesibilidad (ADA Compliance)
- **Contraste**: Mínimo 4.5:1 para texto normal, 3:1 para texto grande
- **Focus Management**: Indicadores visibles en todos los componentes
- **Screen Readers**: Etiquetas ARIA y estructura semántica
- **Keyboard Navigation**: Navegación completa sin mouse

> **⚠️ Zona Crítica**: Modificaciones a clases base (`bg-*`, `text-*`) requieren validación de contraste ADA y testing con lectores de pantalla.

---

## 5. Patrones de Extensión Segura (Implementados)

### 5.1 Extensiones de Input
| Patrón | Implementación | Ejemplo | Riesgo |
|--------|----------------|---------|--------|
| **Composition Pattern** | Child components en `ChatInterface` | `voice-input-button.tsx` | **Bajo** |
| **Hook Customization** | Hooks especializados | `use-speech-to-text.ts` | Bajo |
| **Plugin Architecture** | Componentes modulares | Futuras extensiones | Medio |

### 5.2 Extensiones Visuales
| Área | Patrón Seguro | Archivo Objetivo | Consideraciones |
|------|---------------|------------------|----------------|
| **Animaciones de Mensaje** | CSS-in-JS localizado | `message-bubble.tsx` | Evitar `MarkdownRenderer` |
| **Indicadores de Agente** | Config-driven | `agent-visual-config.ts` | Mantener props interface |
| **Temas Personalizados** | CSS Variables | `globals.css` | Validar contraste |

### 5.3 Extensiones de Estado
| Patrón | Implementación | Beneficio | Riesgo |
|--------|----------------|-----------|--------|
| **Custom Hooks** | Lógica encapsulada | Reutilización | Bajo |
| **Context Providers** | Estado compartido | Consistencia | Medio |
| **State Machines** | Flujos complejos | Predictibilidad | Alto |

---

## 6. Protocolo de Innovación Segura

### 6.1 Pre-Development Checklist
- [ ] **Arquitectura**: Revisar impacto en componentes críticos
- [ ] **Tipos**: Validar sincronización con `clinical-types.ts`
- [ ] **Dependencias**: Verificar compatibilidad con Google GenAI SDK
- [ ] **Accesibilidad**: Planear testing ADA desde el diseño

### 6.2 Development Checklist
- [ ] **Mobile First**: Testing en iOS Safari y Android Chrome
- [ ] **Performance**: Validar impacto en streaming y scroll
- [ ] **Error Boundaries**: Implementar recuperación elegante
- [ ] **Metrics**: Integrar tracking con Sentry si aplica

### 6.3 Pre-Production Checklist
- [ ] **Cross-browser**: Chrome, Firefox, Safari, Edge
- [ ] **Responsive**: Mobile, tablet, desktop
- [ ] **Accessibility**: Screen readers, keyboard navigation
- [ ] **Performance**: Lighthouse score >90
- [ ] **Integration**: E2E con backend y orquestación

### 6.4 Post-Deployment Monitoring
- [ ] **Error Tracking**: Sentry alerts configuradas
- [ ] **Performance**: Core Web Vitals monitoreados
- [ ] **User Experience**: Métricas de engagement
- [ ] **Clinical Impact**: Feedback de psicólogos usuarios

---

## 7. Métricas de Calidad Frontend

### 7.1 Performance Metrics
| Métrica | Objetivo | Herramienta | Estado |
|---------|----------|-------------|--------|
| **First Contentful Paint** | <1.5s | Lighthouse | ✅ Monitoreado |
| **Largest Contentful Paint** | <2.5s | Core Web Vitals | ✅ Monitoreado |
| **Cumulative Layout Shift** | <0.1 | Core Web Vitals | ✅ Monitoreado |
| **Time to Interactive** | <3s | Lighthouse | 🔄 En progreso |

### 7.2 Accessibility Metrics
| Aspecto | Estándar | Herramienta | Compliance |
|---------|----------|-------------|------------|
| **Contraste de Color** | WCAG AA | axe-core | ✅ 100% |
| **Navegación por Teclado** | WCAG AA | Manual testing | ✅ 95% |
| **Screen Reader** | WCAG AA | NVDA/JAWS | 🔄 90% |
| **Focus Management** | WCAG AA | axe-core | ✅ 98% |

### 7.3 User Experience Metrics
| Métrica | Objetivo | Implementación | Estado |
|---------|----------|----------------|--------|
| **Message Send Success** | >99.5% | Sentry tracking | ✅ Implementado |
| **Voice Input Accuracy** | >95% | Custom metrics | 🔄 En desarrollo |
| **Agent Switch Speed** | <500ms | Performance API | ✅ Implementado |
| **Context Preservation** | >98% | Session tracking | ✅ Implementado |

---

### Resumen Ejecutivo

Este mapa documenta una **arquitectura frontend madura y operativa** que combina React moderno, TypeScript estricto, y patrones de diseño probados para crear una experiencia clínica profesional.

La implementación actual demuestra que es posible construir interfaces complejas de IA conversacional manteniendo **performance**, **accesibilidad** y **mantenibilidad** como pilares fundamentales.

> **Principio Rector**: *Cada cambio debe preservar la fluidez del diálogo terapéutico y respetar la concentración profesional del psicólogo.*