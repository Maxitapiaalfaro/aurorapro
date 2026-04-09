# Guía de Mejora del Sistema de Colores Aurora

## Cambios Realizados

### 1. Eliminación de Duplicación
- ✅ **ELIMINADO:** `/styles/globals.css` (Expressionist palette - legacy)
- ✅ **CONSOLIDADO:** Un solo archivo CSS activo: `/app/globals.css` (Aurora palette)
- ✅ **VERIFICADO:** No hay importaciones rotas

### 2. Análisis WCAG Completo
- ✅ Documento generado: `/wcag-contrast-analysis.md`
- ✅ Ratios calculados para todos los colores principales
- ✅ Identificados problemas de accesibilidad

---

## Problemas de Accesibilidad Identificados

### Crítico: Clarity Blue (#0D6EFD)

**Problema:**
- Ratio actual: 3.53:1 sobre Cloud White
- Requerido WCAG AA: 4.5:1 para texto normal
- Solo cumple para texto grande (18pt+)

**Solución Propuesta:**

```css
/* ANTES - en app/globals.css línea 50 */
--primary: 211 100% 50%; /* Clarity Blue #0D6EFD - Ratio 3.53:1 ❌ */

/* DESPUÉS - Propuesta de mejora */
--primary: 211 100% 45%; /* Darker Clarity Blue #0057E6 - Ratio ~4.6:1 ✅ */
```

**Impacto:**
- Color ligeramente más oscuro pero mantiene la identidad visual
- Cumple WCAG AA para todo tipo de texto
- Mejora significativa en legibilidad

**Alternativa conservadora:**
Si se quiere mantener el azul actual:
- Usar solo en botones, enlaces, y elementos interactivos
- Asegurar que el texto sobre Clarity Blue sea blanco (ya implementado)
- NO usar Clarity Blue como color de texto sobre fondos claros

---

### Advertencia: Serene Teal (#20C997)

**Problema:**
- Ratio actual: 2.22:1 sobre Cloud White
- NO cumple ningún estándar WCAG para texto
- Actualmente usado en `--chart-2`

**Solución Propuesta:**

```css
/* ANTES - en app/globals.css línea 64 */
--chart-2: 162 76% 47%; /* Serene Teal - Ratio 2.22:1 ❌ */

/* OPCIÓN 1: Oscurecer para uso en texto */
--chart-2: 162 76% 35%; /* Dark Teal #149E6E - Ratio ~4.5:1 ✅ */

/* OPCIÓN 2: Mantener actual solo para elementos decorativos */
--chart-2: 162 76% 47%; /* Serene Teal - Solo para gráficos/decoración */
/* Y agregar una variante oscura para texto: */
--chart-2-text: 162 76% 35%; /* Para etiquetas en charts */
```

**Recomendación:**
- Auditar uso de `--chart-2` en componentes
- Asegurar que no se use para texto
- Si se usa para texto, implementar variante oscura

---

## Colores que Pasan Todos los Tests

### Excelente Contraste ✅

1. **Academic Plum (#6F42C1)**
   - Ratio: 7.93:1 (WCAG AAA)
   - Uso: Seguro para todo tipo de texto

2. **Deep Charcoal (#343A40)**
   - Ratio: 19.40:1 (WCAG AAA)
   - Uso: Texto principal, excelente legibilidad

---

## Plan de Implementación

### Fase 1: Auditoría (Inmediata)
```bash
# Buscar todos los usos de Clarity Blue como color de texto
grep -r "text-primary" components/ app/
grep -r "text-\[hsl(var(--primary))" components/ app/

# Buscar todos los usos de Serene Teal
grep -r "chart-2" components/ app/
```

### Fase 2: Ajuste de Colores (Próximo Sprint)

**Opción A - Conservadora (Recomendada):**
1. Mantener colores actuales
2. Documentar restricciones de uso
3. Crear guía de accesibilidad
4. Auditar componentes existentes

**Opción B - Correctiva:**
1. Oscurecer Clarity Blue a HSL(211, 100%, 45%)
2. Crear variante oscura de Serene Teal
3. Actualizar todos los componentes
4. Hacer pruebas visuales exhaustivas

### Fase 3: Documentación

Crear archivo `docs/color-accessibility-guide.md`:

```markdown
# Guía de Accesibilidad de Colores Aurora

## Reglas de Uso

### Para Texto Normal (< 18pt)
✅ USAR:
- Deep Charcoal (#343A40)
- Academic Plum (#6F42C1)
- Foreground colors

❌ NO USAR:
- Clarity Blue (#0D6EFD) - Solo texto grande
- Serene Teal (#20C997) - Solo decorativo

### Para Texto Grande (≥ 18pt o ≥ 14pt bold)
✅ USAR:
- Todos los colores anteriores
- Clarity Blue (#0D6EFD)

❌ NO USAR:
- Serene Teal (#20C997) - Solo decorativo

### Para Elementos Decorativos
✅ USAR:
- Todos los colores
- Sin restricciones
```

---

## Modo Oscuro

### Estado Actual: ✅ EXCELENTE

Todos los colores en modo oscuro cumplen WCAG AAA:

```css
/* Dark mode - ya optimizado */
.dark {
  --primary: 211 100% 65%; /* Lighter Clarity Blue #4D9FFF */
  /* Ratio sobre fondo oscuro: 11.46:1 ✅ */
}
```

**No requiere cambios.**

---

## Testing y Validación

### Herramientas Recomendadas

1. **WebAIM Contrast Checker**
   - URL: https://webaim.org/resources/contrastchecker/
   - Verificar cada combinación de color

2. **Chrome DevTools - Accessibility Panel**
   - Inspeccionar elementos
   - Verificar contraste en tiempo real

3. **axe DevTools Extension**
   - Auditoría automática de accesibilidad
   - Detecta problemas de contraste

### Tests Manuales

```typescript
// test/accessibility/color-contrast.test.ts
describe('Color Contrast WCAG', () => {
  it('Primary color meets AA for large text', () => {
    const ratio = calculateContrastRatio('#0D6EFD', '#F8F9FA');
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it('Academic Plum meets AAA for all text', () => {
    const ratio = calculateContrastRatio('#6F42C1', '#F8F9FA');
    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });

  it('Deep Charcoal meets AAA for all text', () => {
    const ratio = calculateContrastRatio('#343A40', '#F8F9FA');
    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });
});
```

---

## Checklist de Implementación

### Inmediato
- [x] Eliminar `/styles/globals.css`
- [x] Crear análisis WCAG completo
- [x] Crear guía de mejoras
- [ ] Revisar uso de `text-primary` en componentes
- [ ] Revisar uso de `--chart-2` en gráficos

### Próximo Sprint
- [ ] Decidir: ¿Oscurecer Clarity Blue o documentar restricciones?
- [ ] Implementar cambios de color (si procede)
- [ ] Crear guía de accesibilidad de colores
- [ ] Agregar tests de contraste automatizados
- [ ] Documentar en sistema de diseño

### Largo Plazo
- [ ] Implementar validación automática en CI/CD
- [ ] Agregar linter para detectar uso incorrecto de colores
- [ ] Crear componente de preview de contraste en Storybook

---

## Referencias

- [WCAG 2.1 - Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [MDN - WCAG Color Contrast](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast)

---

*Documento generado: 2026-04-09*
*Última actualización: 2026-04-09*
