# Aurora UI/UX Audit & Reengineering Plan (2026)

**Fecha:** 2026-04-09
**Agente:** Orquestador de Arquitectura UI/UX
**Motor Cognitivo:** Claude 4.5 Sonnet (Opus no disponible en este entorno)

---

## 1. Análisis del Estado del Arte (2026)

### Tendencias Identificadas en Interfaces IA

**Transparencia Algorítmica Progresiva:**
- Disclosure progresivo de procesos IA con timelines ejecutivos
- Visualización en tiempo real de tool execution y grounding
- Humanización de labels técnicos (WCAG, vector search → "Buscando evidencia")

**Sistemas de Color Semánticos:**
- Paletas HSL con mapeo agente-función (ej. azul → análisis, verde → documentación)
- Contraste WCAG AA+ mínimo para interfaces profesionales
- Dark mode con ajustes de luminosidad (no inversión simple)

**Animaciones con Propósito:**
- GPU-accelerated (transform/opacity) a 60fps
- Spring physics para interacciones naturales (framer-motion)
- Respeto a `prefers-reduced-motion` con fallback inmediato

**Micro-interacciones Clínicas:**
- Focus states con ring + offset (2px ring, 2px offset)
- Hover con cambio de opacity/background (0.15s ease-in-out)
- Loading states con skeleton screens + gentle pulse

---

## 2. Auditoría Aurora - Fortalezas

### Sistema de Color Robusto

**Paleta Aurora (app/globals.css):**
- **Clarity Blue** `#0D6EFD` → Agente Perspectiva (análisis psicoterapéutico)
- **Serene Teal** `#20C997` → Agente Memoria (documentación clínica)
- **Academic Plum** `#6F42C1` → Agente Evidencia (investigación científica)
- **Neutrales:** Cloud White, Deep Charcoal, Mineral Gray, Ash

**Ventajas:**
- Mapeo semántico agente-color consistente
- Degradados 50-900 completos para cada color
- Variables CSS con soporte dark mode

### Arquitectura Mobile-First

**Container Queries:**
- Tablas clínicas con scroll horizontal en mobile
- Breakpoint principal: 640px (sm)
- Padding dinámico según ancho de mensaje preferido

**Responsive Patterns:**
- Message width: 36rem/48rem/64rem/full con transición suave
- Chat container: padding adaptativo (2rem narrow → 0.375rem full)

### Componentes de Transparencia IA

**AgenticTransparencyFlow:**
- Timeline ejecutivo con humanización de pasos
- Progress bar agent-colored con spring animation
- Mini stepper dots para vista colapsada histórica
- Elapsed timer para performance visibility

**CognitiveTransparencyPanel:**
- Fases: analyzing_intent → routing_agent → executing_tools → synthesizing
- Iconos por fase (Phosphor Icons)
- Progressive disclosure con AnimatePresence

---

## 3. Brechas Críticas Detectadas

### 🔴 Alta Prioridad

#### 1. Duplicación de Sistemas de Color
**Problema:**
- `/app/globals.css` (852 líneas) → Paleta Aurora activa
- `/styles/globals.css` (178 líneas) → Paleta Expressionist legacy

**Impacto:**
- Confusión para nuevos contributors
- Riesgo de aplicar estilos incorrectos
- Bundle size innecesario

**Solución:**
- Eliminar `/styles/globals.css` si está inactivo
- Consolidar en un solo archivo con documentación clara

#### 2. Implementación ARIA Incompleta
**Problema:**
- ~80% de 86 componentes carecen de atributos ARIA
- Sin `aria-label` en botones iconográficos
- Sin `aria-expanded` en elementos colapsables
- Sin `aria-live="polite"` en estados de procesamiento IA

**Impacto:**
- Inaccesible para lectores de pantalla
- No cumple WCAG 2.1 Level AA
- Usuarios con discapacidad visual excluidos

**Solución:**
- Implementar ARIA completo en 10 componentes críticos primero
- Crear checklist de estado para 76 componentes restantes

#### 3. Contraste WCAG Sin Verificar
**Problema:**
- Colores clínicos nunca testeados con herramientas WCAG
- Academic Plum `#6F42C1` sobre blanco: ratio estimado ~4.8:1 (límite AA)
- User bubble en dark mode sin ajuste de contraste

**Impacto:**
- Potencial fallo de certificación WCAG AA
- Usuarios con baja visión no pueden leer texto

**Solución:**
- Calcular ratios para todas las combinaciones color-fondo
- Ajustar lightness si < 4.5:1 (AA) o < 7:1 (AAA deseado)

### 🟡 Media Prioridad

#### 4. Sistema de Fuentes No Optimizado
**Problema:**
- IBM Plex Serif + Sans con pesos 400/500/600 separados
- Sin variable fonts
- Sin preload estratégico en `<head>`

**Impacto:**
- Font loading time: ~200-400ms extra en 3G
- FOUT (Flash of Unstyled Text) en primera carga

**Solución:**
- Evaluar variable fonts para IBM Plex
- Implementar `<link rel="preload" as="font">`

#### 5. Animaciones Sin Estrategia Unificada
**Problema:**
- Mezcla de `ease-in-out`, `ease-out`, `cubic-bezier(0.4, 0, 0.2, 1)`
- Sin documentación de cuándo usar cada easing
- 7 keyframes custom sin naming convention clara

**Impacto:**
- Motion language inconsistente
- Mantenimiento difícil al agregar nuevas animaciones

**Solución:**
- Crear `/lib/animation-tokens.ts` con constantes
- Documentar: fast (0.15s) / default (0.3s) / slow (0.6s)

### 🟢 Baja Prioridad

#### 6. Metadatos Genéricos
**Problema:**
- `title: 'v0 App'`
- `description: 'Created with v0'`
- No refleja identidad clínica de Aurora

**Impacto:**
- SEO pobre
- Branding inconsistente en tabs/bookmarks

**Solución:**
- Actualizar a "Aurora | Plataforma Clínica con IA"

---

## 4. Plan de Ejecución (5 Sub-agentes Paralelos)

### Sub-agente 1: Consolidación de Color + Verificación WCAG
**Responsabilidad:**
- Eliminar duplicación CSS
- Calcular ratios de contraste WCAG
- Ajustar lightness si necesario

**Archivos afectados:**
- `/app/globals.css`
- `/styles/globals.css` (eliminación)

**Entregable:**
- Sistema de color único verificado WCAG AA

---

### Sub-agente 2: Implementación ARIA Completa
**Responsabilidad:**
- Agregar ARIA en 10 componentes críticos
- Crear checklist de estado para 76 restantes

**Componentes prioritarios:**
1. `AgenticTransparencyFlow.tsx`
2. `ChatInterface.tsx`
3. `MessageBubble.tsx`
4. `DisplaySettingsPopover.tsx`
5. `Sidebar.tsx`
6. `MobileNav.tsx`
7. `Header.tsx`
8. `DocumentPreviewPanel.tsx`
9. `VoiceInputButton.tsx`
10. `CognitiveTransparencyPanel.tsx`

**Entregable:**
- 10 componentes con ARIA completo
- Markdown checklist de estado

---

### Sub-agente 3: Optimización de Fuentes
**Responsabilidad:**
- Evaluar variable fonts para IBM Plex
- Implementar preload estratégico
- Medir impacto en bundle size

**Archivos afectados:**
- `/app/layout.tsx`

**Entregable:**
- Fuentes optimizadas con documentación de mejora

---

### Sub-agente 4: Documentación Design Tokens
**Responsabilidad:**
- Extraer tokens CSS a JSON
- Crear tabla visual en Markdown
- Incluir ratios WCAG

**Archivos creados:**
- `/docs/design-tokens.json`
- `/docs/design-tokens.md`

**Entregable:**
- Design system exportable a Figma/Storybook

---

### Sub-agente 5: Refactorización Sistema de Animaciones
**Responsabilidad:**
- Unificar easings con estrategia documentada
- Crear `/lib/animation-tokens.ts`
- Documentar cuándo usar cada tipo

**Entregable:**
- Sistema de animaciones consistente con tokens

---

## 5. Design Tokens Deducidos (Provisional)

### Paleta Primaria
```json
{
  "clarity-blue": "#0D6EFD",
  "serene-teal": "#20C997",
  "academic-plum": "#6F42C1",
  "deep-charcoal": "#343A40",
  "cloud-white": "#F8F9FA"
}
```

### Geometría y Espaciado
**Sistema base-8:**
- Radio base: `0.5rem` (8px)
- Espaciado vertical: `0.75rem` → `2rem` progresivo
- Contenedores responsive: 36rem/48rem/64rem/full
- Breakpoint: 640px (sm)

### Reglas de Transición
**Duración:**
- Fast: `0.15s` (hover/focus)
- Default: `0.3s` (layout/font-size)
- Slow: `0.6s` (complex animations)

**Easing:**
- Default: `cubic-bezier(0.4, 0, 0.2, 1)`
- Smooth: `ease-in-out`

**Preferencia:**
- `transform`/`opacity` (GPU-accelerated) > `width`/`height`

---

## 6. Métricas de Éxito

**Pre-Reingeniería:**
- ❌ WCAG AA: No verificado
- ❌ ARIA Coverage: ~20%
- ❌ Font Load Time: 200-400ms (3G)
- ❌ CSS Duplicación: 2 archivos (1,030 líneas)

**Post-Reingeniería (Meta):**
- ✅ WCAG AA: 100% de combinaciones color-fondo
- ✅ ARIA Coverage: 100% componentes críticos (10), 50%+ total (86)
- ✅ Font Load Time: <150ms (variable fonts + preload)
- ✅ CSS Consolidación: 1 archivo único

---

## 7. Notas de Implementación

**Tecnologías Existentes:**
- Next.js 15.5.14
- React 19
- framer-motion 12.23.12
- Tailwind CSS 3.4.17
- Radix UI (40+ primitives)

**Compatibilidad:**
- Todos los cambios deben preservar funcionalidad existente
- Sin breaking changes en APIs de componentes
- Testing manual en Chrome/Safari/Firefox
- Verificar que `prefers-reduced-motion` sigue funcionando

---

## Apéndice: Filosofías Arquitectónicas Aplicadas

1. **Transparencia Cognitiva Progresiva**
   - Progressive Disclosure + Explainable AI
   - Timeline ejecutivo humanizado
   - Estados intermedios visibles

2. **Diseño Clínico Sistemático**
   - Medical UI patterns (tablas profesionales, tipografía legible)
   - Academic Publishing (serif para contenido largo)
   - Paleta con credibilidad científica

3. **Minimalismo Funcional con Texturas Sutiles**
   - Paper texture en light mode
   - Borders con opacity reducida (/40-/60)
   - Cards con translucency (/80-/95)

4. **Arquitectura Basada en Tokens CSS**
   - Design System First
   - Variables CSS sobre hardcoded values
   - Exportable a otras plataformas (Figma/Storybook)

---

**Fin de Documento**
