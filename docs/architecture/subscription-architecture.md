# Aurora Subscription Architecture — Diseño Completo

> Arquitectura de suscripciones, permisos (RBAC) y medición de tokens para Aurora.
> Basado en ingeniería inversa del flujo de membresías de Claude Code.

---

## 1. Resumen Ejecutivo

Aurora implementa un modelo SaaS de 3 tiers con control de acceso a agentes (RBAC) y medición estricta de tokens (Token Metering):

| Tier | Precio | Tokens/mes | Agentes | Herramientas | Features experimentales |
|------|--------|------------|---------|--------------|------------------------|
| **Freemium** | $0 (7 días) | 500K | Solo Socrático | Solo lectura | ❌ |
| **Pro** | $20.000 CLP/mes | 3.000.000 | Todos | Todos | ❌ |
| **Max** | $50.000 CLP/mes | 8.000.000 | Todos | Todos + beta | ✅ Feature Flags |

---

## 2. Esquema de Base de Datos (Firestore)

### 2.1 Estructura de Documentos

```
psychologists/{uid}/
  ├── ... (datos existentes: patients, sessions, memories)
  └── subscription/
      └── current    ← Documento único de suscripción
```

### 2.2 Documento `subscription/current`

```typescript
interface UserSubscription {
  // === Estado del Tier ===
  tier: 'freemium' | 'pro' | 'max'
  status: 'active' | 'trialing' | 'trial_expired' | 'past_due' | 'canceled' | 'expired'

  // === Fechas de Control ===
  registeredAt: Timestamp          // Fecha de registro original
  trialExpiresAt: Timestamp        // registeredAt + 7 días
  currentPeriodStart: Timestamp    // Inicio del período de facturación actual
  currentPeriodEnd: Timestamp      // Fin del período de facturación actual

  // === Stripe (null para freemium) ===
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  lastPaymentAt: Timestamp | null

  // === Medición de Tokens (CRÍTICO) ===
  tokenUsage: {
    totalTokens: number            // Consumo acumulado del período
    tokenLimit: number             // Límite del tier (500K / 3M / 8M)
    inputTokens: number            // Tokens de entrada (usuario + contexto)
    outputTokens: number           // Tokens de salida (respuestas del modelo)
    cacheReadTokens: number        // Tokens de caché (más baratos)
    periodResetAt: Timestamp       // Cuándo se reseteó el contador
    lastInteractionTokens?: number // Tokens de la última interacción
  }

  // === Feature Flags (solo Max) ===
  featureFlags: string[]           // ['experimental_features', 'priority_access']

  // === Metadata ===
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### 2.3 Decisiones de Diseño

| Decisión | Justificación |
|----------|--------------|
| **Documento único** (`subscription/current`) | Una sola lectura para obtener tier + tokens (evita N+1) |
| **tokenUsage embebido** | Lectura atómica de tier + consumo en un solo read |
| **FieldValue.increment()** | Actualizaciones atómicas del contador sin read-then-write |
| **Server-only writes** | Firestore rules bloquean escritura del cliente; solo admin SDK |
| **Bajo el path del psicólogo** | Consistente con el modelo existente (`psychologists/{uid}/...`) |

### 2.4 Firestore Security Rules

```
match /psychologists/{psychologistId}/subscription/{docId} {
  allow read: if request.auth != null && request.auth.uid == psychologistId;
  allow write: if false; // Solo escritura server-side via admin SDK
}
```

---

## 3. Lógica de Bloqueo (Guards/Middleware)

### 3.1 Flujo de Evaluación

```
┌─────────────────────────────────────────────────────┐
│                  API Request                         │
│              POST /api/send-message                  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Firebase Auth Check   │ ← verifyFirebaseAuth()
        │   (existente)           │
        └────────────┬───────────┘
                     │ uid verificado
                     ▼
        ┌────────────────────────┐
        │   evaluateAccess()      │ ← NUEVO: Subscription Guard
        │   - Load subscription   │
        │   - Check status        │
        │   - Check trial expiry  │
        │   - Check token quota   │
        └────────────┬───────────┘
                     │
              ┌──────┴──────┐
              │             │
         ✅ allowed    ❌ blocked
              │             │
              ▼             ▼
        ┌───────────┐ ┌──────────────┐
        │ Continue   │ │ Return 403   │
        │ to Agent   │ │ + PaywallTrigger │
        │ Router     │ │ para el cliente  │
        └────┬──────┘ └──────────────┘
             │
             ▼
   ┌──────────────────────┐
   │ evaluateAgentAccess() │ ← Valida agente vs tier
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ Agent Execution       │
   │ + Tool Calls          │
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ evaluateToolAccess()  │ ← Valida cada tool vs tier
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ recordTokenConsumption│ ← Actualiza contadores atómicamente
   │ (post-response)       │
   └──────────────────────┘
```

### 3.2 Puntos de Integración

| Archivo | Integración | Guard |
|---------|------------|-------|
| `app/api/send-message/route.ts` | Antes de `orchestrationSystem.sendMessage()` | `evaluateAccess()` |
| `lib/hopeai-system.ts` | En `sendMessage()` antes de llamar al modelo | `evaluateAgentAccess()` |
| `lib/agents/streaming-handler.ts` | Antes de ejecutar cada tool call | `evaluateToolAccess()` |
| `lib/hopeai-system.ts` | Después de recibir respuesta del modelo | `recordTokenConsumption()` |

### 3.3 RBAC — Control de Acceso por Tier

#### Acceso a Agentes

| Agente | Freemium | Pro | Max |
|--------|----------|-----|-----|
| `socratico` | ✅ | ✅ | ✅ |
| `clinico` | ❌ | ✅ | ✅ |
| `academico` | ❌ | ✅ | ✅ |
| `orquestador` | ❌ | ✅ | ✅ |

#### Acceso a Herramientas

| Herramienta | Freemium | Pro | Max |
|-------------|----------|-----|-----|
| `get_patient_memories` | ✅ | ✅ | ✅ |
| `get_patient_record` | ✅ | ✅ | ✅ |
| `list_patients` | ✅ | ✅ | ✅ |
| `save_clinical_memory` | ❌ | ✅ | ✅ |
| `create_patient` | ❌ | ✅ | ✅ |
| `search_academic_literature` | ❌ | ✅ | ✅ |
| `generate_clinical_document` | ❌ | ✅ | ✅ |
| `update_clinical_document` | ❌ | ✅ | ✅ |
| `analyze_longitudinal_patterns` | ❌ | ✅ | ✅ |

### 3.4 Estrategia de Fail-Open

Si hay un error de Firestore al evaluar la suscripción:
- **Se permite el acceso temporalmente** (fail-open)
- Se loguea el error para investigación
- Se agrega un warning al response

Justificación: Es preferible un falso positivo temporal que bloquear un usuario pagador por un error de infraestructura.

---

## 4. Arquitectura del Flujo de Pago

### 4.1 Stack de Pagos

| Componente | Tecnología | Justificación |
|-----------|------------|--------------|
| **Pasarela** | Stripe | Soporta CLP, webhooks confiables, SDK robusto |
| **Checkout** | Stripe Checkout (hosted) | PCI-compliant sin manejar tarjetas |
| **Suscripciones** | Stripe Billing | Manejo automático de renovaciones |
| **Webhooks** | POST /api/webhooks/stripe | Actualización de estado en Firestore |

### 4.2 Flujo de Checkout

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Aurora UI     │     │   Aurora API      │     │     Stripe      │
│  (Paywall)      │     │                   │     │                 │
└───────┬────────┘     └────────┬──────────┘     └────────┬────────┘
        │                       │                          │
        │  1. Click "Upgrade"   │                          │
        ├──────────────────────►│                          │
        │                       │  2. POST /api/checkout   │
        │                       │     {tier, userId}       │
        │                       ├─────────────────────────►│
        │                       │                          │
        │                       │  3. Checkout Session URL  │
        │                       │◄─────────────────────────┤
        │  4. Redirect to       │                          │
        │     Stripe Checkout   │                          │
        │◄──────────────────────┤                          │
        │                       │                          │
        │  5. User completes    │                          │
        │     payment on Stripe │                          │
        ├─────────────────────────────────────────────────►│
        │                       │                          │
        │                       │  6. Webhook:             │
        │                       │  checkout.session.completed
        │                       │◄─────────────────────────┤
        │                       │                          │
        │                       │  7. upgradeSubscription() │
        │                       │  (Firestore update)       │
        │                       │                          │
        │  8. Redirect to       │                          │
        │     Aurora /dashboard │                          │
        │◄─────────────────────────────────────────────────┤
        │                       │                          │
        │  9. Client reads      │                          │
        │     updated tier      │                          │
        ├──────────────────────►│                          │
```

### 4.3 Cuándo Mostrar los Paywalls

Los paywalls se activan en estos momentos:

| Trigger | Condición | Paywall |
|---------|-----------|---------|
| **Trial expiry** | `status === 'trial_expired'` | Modal bloqueante: "Tu prueba de 7 días terminó" |
| **Token limit** | `tokenUsage.totalTokens >= tokenLimit` | Modal: "Has alcanzado tu límite de tokens" |
| **Agent blocked** | Freemium intenta usar agente clínico | Inline: "Este agente requiere plan Pro" |
| **Tool blocked** | Freemium intenta usar herramienta avanzada | Inline: "Esta herramienta requiere plan Pro" |
| **Approaching limit** | `utilization >= 85%` | Banner warning: "Te queda poco consumo" |
| **Payment failed** | `status === 'past_due'` | Modal: "Actualiza tu método de pago" |

### 4.4 Webhook Events Procesados

| Evento Stripe | Acción en Aurora |
|---------------|-----------------|
| `checkout.session.completed` | `upgradeSubscription()` — Activa tier Pro/Max |
| `invoice.payment_succeeded` | `renewSubscription()` — Reset contadores, nuevo período |
| `invoice.payment_failed` | `markPaymentFailed()` — Status → past_due |
| `customer.subscription.deleted` | `cancelSubscription()` — Status → canceled |
| `customer.subscription.updated` | Detectar cambios de tier |

---

## 5. Medición de Tokens (Token Metering)

### 5.1 Flujo de Conteo

```
1. Pre-check:  evaluateAccess(userId, estimatedTokens)
                ↓
2. Ejecución:  Modelo Gemini genera respuesta
                ↓
3. Respuesta:  Gemini retorna usage.inputTokens, usage.outputTokens
                ↓
4. Registro:   recordTokenConsumption(userId, input, output, cacheRead)
                ↓
5. Firestore:  FieldValue.increment() actualiza contadores atómicamente
```

### 5.2 Umbrales de Advertencia

Adaptado del sistema graduado de Claude Code (`rateLimitMessages.ts`):

| Utilización | Severidad | Mensaje |
|-------------|-----------|---------|
| 70% | `info` | "Has utilizado el 70% de tus tokens mensuales" |
| 85% | `warning` | "Te queda poco consumo disponible" |
| 95% | `warning` | "⚠️ Estás por alcanzar el límite" |
| 100% | `error` | "🚫 Límite alcanzado. Actualiza tu plan." |

### 5.3 Reset del Contador

- **Freemium**: No se resetea (período fijo de 7 días)
- **Pro/Max**: Se resetea automáticamente en `invoice.payment_succeeded` (nuevo período de facturación)

---

## 6. Patrones de Claude Code Adoptados

| Patrón Claude Code | Adaptación Aurora | Archivo |
|---------------------|------------------|---------|
| **Backend owns truth** | Subscription state solo escrita por admin SDK | `subscription-service.ts` |
| **Cost tracker per model** | Token tracking por tipo (input/output/cache) | `subscription-service.ts` |
| **Rate limit messages** | Umbrales graduados de advertencia | `tier-config.ts` |
| **Billing access control** | RBAC por tier para agentes y herramientas | `subscription-guard.ts` |
| **Feature flags (GrowthBook)** | Feature flags en UserSubscription para Max | `subscription-guard.ts` |
| **Overage handling** | Hard stop + paywall (sin overage en v1) | `subscription-guard.ts` |
| **Fail-open on error** | Acceso temporal si Firestore falla | `subscription-guard.ts` |

---

## 7. Archivos Implementados

```
types/
  subscription-types.ts          ← Tipos completos del sistema de suscripciones

lib/subscriptions/
  index.ts                       ← Re-exports públicos
  tier-config.ts                 ← Configuración estática de tiers + RBAC
  subscription-service.ts        ← CRUD de Firestore + token metering
  subscription-guard.ts          ← Guards de acceso (evaluateAccess, evaluateAgent, evaluateTool)
  stripe-webhook-handler.ts      ← Procesamiento de webhooks de Stripe

firestore.rules                  ← Reglas actualizadas con protección de subscription
```

---

## 8. Próximos Pasos de Implementación

1. **Integrar guard en send-message**: Agregar `evaluateAccess()` en `app/api/send-message/route.ts`
2. **Integrar token recording**: Agregar `recordTokenConsumption()` post-response en `hopeai-system.ts`
3. **Crear API route de checkout**: `POST /api/checkout` → Stripe Checkout Session
4. **Crear webhook route**: `POST /api/webhooks/stripe` → `handleStripeWebhook()`
5. **UI de paywall**: Componente React para mostrar paywalls según `PaywallTrigger`
6. **UI de billing**: Página `/settings/billing` con estado de suscripción y consumo
7. **Instalar Stripe SDK**: `npm install stripe` para verificación de webhooks
8. **Configurar variables de entorno**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MAX`
