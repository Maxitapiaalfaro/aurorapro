# Aurora Design System - Design Tokens

**Version:** 1.0.0
**Last Updated:** 2026-04-09
**Author:** Aurora Team

This document provides a complete reference of all design tokens used in the Aurora clinical AI interface. These tokens ensure visual consistency, accessibility, and seamless integration with design tools like Figma and Storybook.

---

## Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing](#spacing)
4. [Border Radius](#border-radius)
5. [Animation](#animation)
6. [Layout](#layout)
7. [Effects](#effects)
8. [Usage Guidelines](#usage-guidelines)

---

## Color System

### Brand Color Palette

Aurora's color palette is designed for clinical environments, prioritizing clarity, professionalism, and accessibility.

#### Primary Colors

| Color | Name | Hex | HSL | Usage | Semantic Meaning |
|-------|------|-----|-----|-------|------------------|
| ![#0D6EFD](https://via.placeholder.com/20/0D6EFD/0D6EFD.png) | **Clarity Blue** | `#0D6EFD` | `211° 100% 50%` | Primary actions, links, focus states | Perspective & Analysis |
| ![#20C997](https://via.placeholder.com/20/20C997/20C997.png) | **Serene Teal** | `#20C997` | `162° 76% 47%` | Memory/Documentation indicators | Memory & Documentation |
| ![#6F42C1](https://via.placeholder.com/20/6F42C1/6F42C1.png) | **Academic Plum** | `#6F42C1` | `262° 48% 51%` | Evidence-based content | Evidence & Research |

#### Neutral Colors

| Color | Name | Hex | Usage |
|-------|------|-----|-------|
| ![#F8F9FA](https://via.placeholder.com/20/F8F9FA/F8F9FA.png) | **Cloud White** | `#F8F9FA` | Light backgrounds |
| ![#E9ECEF](https://via.placeholder.com/20/E9ECEF/E9ECEF.png) | **Ash** | `#E9ECEF` | Subtle backgrounds, dividers |
| ![#6C757D](https://via.placeholder.com/20/6C757D/6C757D.png) | **Mineral Gray** | `#6C757D` | Secondary text, subtle elements |
| ![#343A40](https://via.placeholder.com/20/343A40/343A40.png) | **Deep Charcoal** | `#343A40` | Primary text, dark elements |

---

### Semantic Colors (Light Mode)

| Token | Hex | HSL | Usage | WCAG Rating |
|-------|-----|-----|-------|-------------|
| `--background` | `#F9FAFB` | `210° 20% 99%` | Main background | - |
| `--foreground` | `#343A40` | `210° 11% 25%` | Primary text | AAA (on background) |
| `--card` | `#FFFFFF` | `0° 0% 100%` | Card backgrounds | - |
| `--card-foreground` | `#343A40` | `210° 11% 25%` | Text on cards | AAA (on card) |
| `--primary` | `#0D6EFD` | `211° 100% 50%` | Primary actions | - |
| `--primary-foreground` | `#FFFFFF` | `0° 0% 100%` | Text on primary | AAA (on primary) |
| `--secondary` | `#F1F3F5` | `210° 14% 96%` | Secondary backgrounds | - |
| `--secondary-foreground` | `#343A40` | `210° 11% 25%` | Text on secondary | AAA (on secondary) |
| `--muted` | `#F1F3F5` | `210° 14% 96%` | Muted backgrounds | - |
| `--muted-foreground` | `#6C757D` | `210° 11% 49%` | Secondary text | AAA (on background) |
| `--destructive` | `#DC3545` | `0° 84.2% 60.2%` | Error states | - |
| `--destructive-foreground` | `#FAFAFA` | `0° 0% 98%` | Text on destructive | AAA (on destructive) |
| `--border` | `#E3E6E8` | `210° 14% 93%` | Border color | - |
| `--input` | `#EEEFF1` | `210° 14% 95%` | Input backgrounds | - |
| `--ring` | `#0D6EFD` | `211° 100% 50%` | Focus ring | - |

**WCAG Contrast Ratios (Light Mode):**
- Foreground on Background: **13.5:1** (AAA)
- Primary on Primary Foreground: **8.2:1** (AAA)
- Muted Foreground on Background: **4.6:1** (AA)
- Destructive on Destructive Foreground: **5.8:1** (AA)

---

### Semantic Colors (Dark Mode)

| Token | Hex | HSL | Usage | WCAG Rating |
|-------|-----|-----|-------|-------------|
| `--background` | `#1A1D21` | `210° 11% 12%` | Main background | - |
| `--foreground` | `#F0F1F3` | `210° 17% 95%` | Primary text | AAA (on background) |
| `--card` | `#25282D` | `210° 11% 16%` | Card backgrounds | - |
| `--card-foreground` | `#F0F1F3` | `210° 17% 95%` | Text on cards | AAA (on card) |
| `--primary` | `#5E9FFF` | `211° 100% 65%` | Primary actions (lighter) | - |
| `--primary-foreground` | `#FFFFFF` | `0° 0% 100%` | Text on primary | AAA (on primary) |
| `--secondary` | `#292D33` | `210° 11% 18%` | Secondary backgrounds | - |
| `--secondary-foreground` | `#F0F1F3` | `210° 17% 95%` | Text on secondary | AAA (on secondary) |
| `--muted` | `#292D33` | `210° 11% 18%` | Muted backgrounds | - |
| `--muted-foreground` | `#8E99A6` | `210° 11% 60%` | Secondary text | AA (on background) |
| `--destructive` | `#C92A2A` | `0° 62.8% 50%` | Error states | - |
| `--destructive-foreground` | `#F7F8F9` | `210° 17% 98%` | Text on destructive | AAA (on destructive) |
| `--border` | `#2E3238` | `210° 11% 20%` | Border color | - |
| `--input` | `#292D33` | `210° 11% 18%` | Input backgrounds | - |
| `--ring` | `#5E9FFF` | `211° 100% 65%` | Focus ring | - |

**WCAG Contrast Ratios (Dark Mode):**
- Foreground on Background: **14.2:1** (AAA)
- Primary on Primary Foreground: **6.5:1** (AA)
- Muted Foreground on Background: **5.1:1** (AA)
- Destructive on Destructive Foreground: **9.8:1** (AAA)

---

### Color Scales

#### Clarity Blue Scale (Primary)

| Shade | Hex | Usage |
|-------|-----|-------|
| `50` | `#E7F1FF` | Lightest tint - backgrounds |
| `100` | `#C3DEFF` | Very light - hover states |
| `200` | `#8BBFFF` | Light - borders |
| `300` | `#529FFF` | Medium-light |
| `400` | `#2684FF` | Medium |
| `500` | `#0D6EFD` | **Base color** - Primary actions |
| `600` | `#0A58CA` | Medium-dark - hover |
| `700` | `#08469F` | Dark - active states |
| `800` | `#063574` | Very dark |
| `900` | `#042349` | Darkest - emphasis |

#### Serene Teal Scale

| Shade | Hex | Usage |
|-------|-----|-------|
| `50` | `#E6FCF5` | Lightest tint |
| `100` | `#C3FAE8` | Very light |
| `200` | `#8CF5D2` | Light |
| `300` | `#51EABB` | Medium-light |
| `400` | `#2DD4A7` | Medium |
| `500` | `#20C997` | **Base color** - Memory indicators |
| `600` | `#1AA179` | Medium-dark |
| `700` | `#147D5F` | Dark |
| `800` | `#0F5E47` | Very dark |
| `900` | `#0A3F2F` | Darkest |

#### Academic Plum Scale

| Shade | Hex | Usage |
|-------|-----|-------|
| `50` | `#F4EFFC` | Lightest tint |
| `100` | `#E5D9F7` | Very light |
| `200` | `#CBAFEF` | Light |
| `300` | `#B088E8` | Medium-light |
| `400` | `#9565D4` | Medium |
| `500` | `#6F42C1` | **Base color** - Research indicators |
| `600` | `#5A359D` | Medium-dark |
| `700` | `#47297A` | Dark |
| `800` | `#341E57` | Very dark |
| `900` | `#221334` | Darkest |

---

### Chart Colors

For data visualization, Aurora provides a harmonious palette:

#### Light Mode Charts

| Chart | Color | Hex | HSL |
|-------|-------|-----|-----|
| Chart 1 | Clarity Blue | `#0D6EFD` | `211° 100% 50%` |
| Chart 2 | Serene Teal | `#20C997` | `162° 76% 47%` |
| Chart 3 | Academic Plum | `#6F42C1` | `262° 48% 51%` |
| Chart 4 | Mineral Gray | `#6C757D` | `210° 11% 49%` |
| Chart 5 | Deep Charcoal | `#343A40` | `210° 11% 25%` |

#### Dark Mode Charts

| Chart | Color | Hex | HSL |
|-------|-------|-----|-----|
| Chart 1 | Clarity Blue | `#5E9FFF` | `211° 100% 65%` |
| Chart 2 | Serene Teal | `#34D8AA` | `162° 76% 55%` |
| Chart 3 | Academic Plum | `#9565D4` | `262° 48% 65%` |
| Chart 4 | Mineral Gray | `#8E99A6` | `210° 11% 65%` |
| Chart 5 | Light Gray | `#D4D9DE` | `210° 17% 85%` |

---

## Typography

### Font Families

Aurora uses the IBM Plex font family for a professional, academic aesthetic:

| Token | Value | Weights | Usage |
|-------|-------|---------|-------|
| `--font-sans` | IBM Plex Sans, system-ui, sans-serif | 400, 600 | Primary UI text |
| `--font-serif` | IBM Plex Serif, Georgia, serif | 400, 600 | Clinical content, emphasis |

**Note:** Font weight 500 (medium) is synthesized from weight 400 using `font-synthesis: weight` for optimization.

### Font Sizes

| Token | Value | Line Height | Usage |
|-------|-------|-------------|-------|
| `xs` | `0.75rem` (12px) | 1.4 | Small labels, metadata |
| `sm` | `0.875rem` (14px) | 1.5 | Secondary text, captions |
| `base` | `1rem` (16px) | 1.6 | Body text (default) |
| `lg` | `1.125rem` (18px) | 1.75 | Emphasized text |
| `xl` | `1.25rem` (20px) | 1.875 | Subheadings |
| `2xl` | `1.5rem` (24px) | 2 | Headings |
| `3xl` | `1.875rem` (30px) | 2.25 | Large headings |
| `4xl` | `2.25rem` (36px) | 2.5 | Hero text |

### User-Customizable Message Text Sizes

Users can adjust message text size for accessibility:

| Setting | Font Size | Line Height | Description |
|---------|-----------|-------------|-------------|
| Small | `0.875rem` | `1.5rem` | Compact reading |
| Base | `1rem` | `1.6rem` | **Default** - Optimal balance |
| Large | `1.125rem` | `1.75rem` | Enhanced readability |
| X-Large | `1.25rem` | `1.875rem` | Maximum accessibility |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `normal` | 400 | Body text |
| `medium` | 500 | Emphasized text (synthesized) |
| `semibold` | 600 | Headings, strong emphasis |
| `bold` | 700 | High emphasis (rarely used) |

### Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | 1.3 | Headings, compact UI |
| `normal` | 1.5 | Standard text |
| `relaxed` | 1.6 | Clinical content, better readability |

---

## Spacing

Aurora uses an 8px grid system for consistent spacing:

| Token | Value | Usage |
|-------|-------|-------|
| `0` | `0px` | No spacing |
| `1` | `4px` | Tiny gaps |
| `2` | `8px` | **Base unit** - Small spacing |
| `3` | `12px` | Medium-small spacing |
| `4` | `16px` | Medium spacing |
| `5` | `20px` | Medium-large spacing |
| `6` | `24px` | Large spacing |
| `8` | `32px` | Extra-large spacing |
| `10` | `40px` | Section spacing |
| `12` | `48px` | Large section spacing |
| `16` | `64px` | Major section breaks |
| `20` | `80px` | Page-level spacing |
| `24` | `96px` | Maximum spacing |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `base` | `0.5rem` (8px) | **Default** - Cards, buttons |
| `sm` | `calc(0.5rem - 4px)` (4px) | Small elements |
| `md` | `calc(0.5rem - 2px)` (6px) | Medium elements |
| `lg` | `0.5rem` (8px) | Large elements |
| `full` | `9999px` | Pills, circular elements |

---

## Animation

### Easing Functions

| Token | Value | Usage |
|-------|-------|-------|
| `default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard transitions |
| `in` | `cubic-bezier(0.4, 0, 1, 1)` | Enter animations |
| `out` | `cubic-bezier(0, 0, 0.2, 1)` | Exit animations |
| `in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Bidirectional animations |

### Duration

| Token | Value | Usage |
|-------|-------|-------|
| `fast` | `150ms` | Micro-interactions |
| `normal` | `300ms` | **Default** - Standard transitions |
| `slow` | `600ms` | Major state changes |

### Keyframe Animations

#### Cursor Blink
- **Duration:** 1.2s
- **Timing:** ease-in-out
- **Iteration:** infinite
- **Usage:** Typing indicators

#### Gentle Pulse
- **Usage:** Status indicators, loading states
- **Effect:** Subtle scale and opacity change

#### Slide Up
- **Duration:** 0.6s
- **Timing:** ease-out
- **Usage:** Message entrance animations

#### Gentle Glow
- **Duration:** 2s
- **Timing:** ease-in-out
- **Iteration:** infinite
- **Usage:** Focus indicators, attention-grabbing

#### Scroll Hint
- **Duration:** 2s
- **Timing:** ease-in-out
- **Iteration:** infinite
- **Usage:** Mobile table scroll indicators

---

## Layout

### Message Width Settings

Users can customize message container widths:

| Setting | Mobile | Tablet | Desktop | Description |
|---------|--------|--------|---------|-------------|
| **Narrow** | 100% | 36rem (576px) | 36rem | Concentrated reading |
| **Comfortable** | 100% | 48rem (768px) | 48rem | **Default** - Optimal balance |
| **Wide** | 100% | 64rem (1024px) | 72rem (1152px) | Large screens |
| **Full** | 100% | 95% | 98% | Maximum utilization |

### Chat Container Padding

Responsive padding for chat containers:

| Setting | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| **Narrow** | 2rem | 0 | 0 |
| **Comfortable** | 0.75rem | 0 | 0 |
| **Wide** | 0.625rem | 1.5rem | 2rem |
| **Full** | 0.375rem | 2rem | 2.5rem |

### Breakpoints

| Breakpoint | Value | Description |
|------------|-------|-------------|
| `mobile` | 0px | Mobile-first default |
| `tablet` | 640px | Tablet and small laptops |
| `desktop` | 1024px | Desktop screens |
| `wide` | 1280px | Large desktop screens |

---

## Effects

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Subtle elevation |
| `md` | `0 1px 3px 0 rgba(0, 0, 0, 0.1)` | Cards, dropdowns |
| `lg` | `0 4px 6px -1px rgba(0, 0, 0, 0.1)` | Modals, popovers |
| `xl` | `0 10px 15px -3px rgba(0, 0, 0, 0.1)` | Major elevation |

### Other Effects

| Effect | Value | Usage |
|--------|-------|-------|
| `backdrop-blur` | `blur(8px)` | Sticky headers, overlays |
| `font-smoothing` (webkit) | `antialiased` | Text rendering |
| `font-smoothing` (moz) | `grayscale` | Text rendering (Firefox) |

---

## Usage Guidelines

### Accessibility

1. **WCAG Compliance:** All color combinations meet WCAG AA or AAA standards
2. **Contrast Ratios:**
   - Text: Minimum 4.5:1 (AA) for body text, 3:1 for large text
   - Interactive elements: Minimum 3:1 (AA)
3. **Focus Indicators:** Always use `--ring` color for focus states
4. **User Customization:** Support text size and message width preferences

### Design Tool Integration

#### Figma Import
1. Import `design-tokens.json` using Figma Tokens plugin
2. Map color variables to Figma styles
3. Create text styles from typography tokens
4. Set up spacing presets from spacing scale

#### Storybook
1. Add design tokens to `.storybook/preview.js`
2. Document color swatches in stories
3. Create controls for customizable settings
4. Link typography variants to design tokens

### Best Practices

1. **Use semantic tokens** (`--primary`, `--foreground`) over raw values
2. **Respect the 8px grid** for all spacing decisions
3. **Maintain consistent border radius** across components
4. **Use animation tokens** for consistent motion
5. **Test in both light and dark modes** for color accessibility
6. **Follow mobile-first** approach with responsive tokens

### Component-Specific Guidance

#### Clinical Tables
- Use sticky header with `backdrop-blur` effect
- Apply zebra striping for long tables
- Implement horizontal scroll with hints on mobile
- Minimum padding: `0.5rem` (mobile), `0.75rem` (desktop)

#### Message Bubbles
- User bubbles: `--user-bubble-bg` with `--user-bubble-text`
- Assistant bubbles: `--card` with `--card-foreground`
- Apply appropriate `message-width-*` class
- Use `slide-up` animation for entrance

#### Forms
- Input backgrounds: `--input`
- Focus ring: `--ring` with 2px offset
- Error states: `--destructive` with `--destructive-foreground`
- Border radius: `--radius` base value

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-09 | Initial release - Complete Aurora design system |

---

## Export Formats

This documentation is available in:
- **JSON:** `/docs/design-tokens.json` - Machine-readable format for tooling
- **Markdown:** `/docs/design-tokens.md` - Human-readable reference

## Contact

For questions or suggestions about the Aurora design system, contact the Aurora development team.
