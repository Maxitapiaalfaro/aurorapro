# Skill: Scaffold UI Component

## Purpose

Generate a complete React component following Aurora Pro's design system, accessibility standards, and health-tech UI patterns. This skill automates the creation of shadcn/ui-based components with proper TypeScript types, Tailwind styling, and framer-motion animations.

## Assigned Agent

**UI Agent** - Primary user of this skill for rapidly scaffolding new components.

## When to Use

- Creating a new UI component from scratch
- User requests "create a component for..."
- Need to scaffold a form, card, modal, or custom UI element
- Want to ensure design system consistency across new components

## When NOT to Use

- Modifying existing components (use Edit tool directly)
- Creating variants of existing components (compose or extend existing)
- shadcn/ui primitive already exists (just import it)

## Inputs

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `componentName` | string | Yes | PascalCase name for the component | `PatientContextCard` |
| `componentType` | enum | Yes | Type of component: `card`, `form`, `modal`, `list`, `custom` | `card` |
| `props` | array | Yes | List of props with name, type, description | `[{name: 'patient', type: 'PatientRecord', required: true}]` |
| `features` | array | No | Optional features: `animation`, `loading`, `error`, `keyboard-nav`, `responsive` | `['animation', 'loading', 'responsive']` |
| `accessibility` | object | No | ARIA requirements: labels, roles, keyboard shortcuts | `{role: 'region', ariaLabel: 'Patient context'}` |

## Steps

### 1. Validate Component Name and Type

**Checks:**
- Component name is PascalCase
- Component type is one of: `card`, `form`, `modal`, `list`, `custom`
- No existing component with same name (check `components/` directory)

**Commands:**
```bash
# Check for existing component
glob pattern="components/**/${componentName}.tsx"
```

### 2. Generate Component Template

**Based on componentType, select template:**

**Card Template:**
```tsx
'use client'

import { motion } from 'framer-motion'
import type { ComponentProps } from 'react'

interface ${componentName}Props {
  /** ${prop.description} */
  ${prop.name}${prop.required ? '' : '?'}: ${prop.type}
}

export function ${componentName}({ ${propsDestructure} }: ${componentName}Props) {
  return (
    <motion.div
      className="rounded-lg border border-border/50 bg-card/90 backdrop-blur-sm p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Component content */}
    </motion.div>
  )
}
```

**Form Template:**
```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const formSchema = z.object({
  // Define schema fields
})

type FormValues = z.infer<typeof formSchema>

interface ${componentName}Props {
  onSubmit: (data: FormValues) => void | Promise<void>
}

export function ${componentName}({ onSubmit }: ${componentName}Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Form fields */}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Submit
        </Button>
      </form>
    </Form>
  )
}
```

**Modal Template:**
```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ${componentName}Props {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
}

export function ${componentName}({
  isOpen,
  onClose,
  title,
  description,
  children,
}: ${componentName}Props) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
```

### 3. Add Optional Features

**If `animation` in features:**
```tsx
import { motion, AnimatePresence } from 'framer-motion'

// Wrap with motion.div with spring animation
```

**If `loading` in features:**
```tsx
import { Loader2 } from 'lucide-react'

interface ${componentName}Props {
  // ... existing props
  isLoading?: boolean
}

// In component:
{isLoading ? (
  <div className="flex items-center justify-center gap-2">
    <Loader2 className="h-4 w-4 animate-spin" />
    <span className="text-sm text-muted-foreground">Cargando...</span>
  </div>
) : (
  // actual content
)}
```

**If `error` in features:**
```tsx
import { AlertCircle } from 'lucide-react'

interface ${componentName}Props {
  // ... existing props
  error?: string
  onRetry?: () => void
}

// In component:
{error && (
  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
    <div className="flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-destructive" />
      <div className="flex-1">
        <p className="text-sm text-destructive">{error}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  </div>
)}
```

**If `keyboard-nav` in features:**
```tsx
// Add keyboard event handlers
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    // trigger action
  }
  if (e.key === 'Escape') {
    // close/cancel
  }
}

// Add to element:
<div
  role="button"
  tabIndex={0}
  onKeyDown={handleKeyDown}
  onClick={handleClick}
>
```

**If `responsive` in features:**
```tsx
// Add responsive Tailwind classes
className="
  flex flex-col gap-2          /* Mobile: stack */
  md:flex-row md:gap-4         /* Tablet: horizontal */
  lg:gap-6                     /* Desktop: more spacing */
"
```

### 4. Add Accessibility Attributes

**From accessibility input:**
```tsx
<div
  role={accessibility.role || 'region'}
  aria-label={accessibility.ariaLabel}
  aria-describedby={accessibility.ariaDescribedBy}
  aria-live={accessibility.live || 'polite'}
  tabIndex={0}
>
```

**Always include:**
- Focus indicators: `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`
- Screen reader labels for icons: `<span className="sr-only">Descriptive text</span>`

### 5. Generate Usage Example

**Create usage comment block:**
```tsx
/**
 * Usage:
 *
 * import { ${componentName} } from '@/components/${kebabCase(componentName)}'
 *
 * <${componentName}
 *   ${props.map(p => `${p.name}={${p.example || `your${p.type}`}}`).join('\n *   ')}
 * />
 */
```

### 6. Write Component File

**File location pattern:**
- Custom components: `components/${kebabCase(componentName)}.tsx`
- UI primitives: `components/ui/${kebabCase(componentName)}.tsx`

**Full file structure:**
```tsx
'use client' // if needs client-side interactivity

import { /* dependencies */ } from '...'

/**
 * ${componentName} - ${brief description}
 *
 * @example
 * <${componentName} ... />
 */
interface ${componentName}Props {
  /** JSDoc for each prop */
}

export function ${componentName}(props: ${componentName}Props) {
  // Implementation
}
```

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `filePath` | string | Full path to created component file |
| `componentCode` | string | Complete component implementation |
| `imports` | array | List of dependencies to install (if any) |
| `usageExample` | string | How to import and use the component |

## Acceptance Criteria

Before marking skill complete, verify:
- [ ] Component name is PascalCase and unique
- [ ] Uses Aurora design system (CSS variables, Tailwind classes)
- [ ] All props have JSDoc comments
- [ ] TypeScript types are complete and accurate
- [ ] Accessibility attributes present (role, aria-label, keyboard nav)
- [ ] Responsive design implemented (if requested)
- [ ] Animations respect `prefers-reduced-motion` (framer-motion handles this)
- [ ] Loading/error states implemented (if requested)
- [ ] Touch targets ≥44×44px for interactive elements
- [ ] No PHI in component code (use generic placeholders)
- [ ] Usage example is clear and accurate

## Health-Tech Specific Rules

- **No PHI in Loading States**: Use generic text like "Cargando..." not "Cargando María..."
- **Consent Patterns**: For PHI access, include confirmation step
- **Offline Indicators**: Show sync status for data-dependent components
- **Clinical Context**: Components affecting clinical workflow must have clear error recovery

## Example Invocation

```typescript
// UI Agent invokes this skill:
scaffoldUIComponent({
  componentName: 'PatientContextCard',
  componentType: 'card',
  props: [
    { name: 'patient', type: 'PatientRecord', required: true, description: 'Patient record to display' },
    { name: 'onSessionStart', type: '(patientId: string) => void', required: false, description: 'Callback when session starts' }
  ],
  features: ['animation', 'loading', 'responsive'],
  accessibility: {
    role: 'article',
    ariaLabel: 'Patient context information'
  }
})
```

**Expected output:**
- Creates `components/patient-context-card.tsx`
- Includes framer-motion animation
- Implements loading state
- Mobile-first responsive layout
- Proper ARIA attributes
- Usage example in JSDoc
