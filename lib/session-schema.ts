/**
 * Session Schema — Zod Validation for Firestore Persistence
 *
 * Single source of truth for session data sanitization before writing to Firestore.
 * Ensures no `undefined` values reach Firestore (which rejects them) by transforming
 * optional fields to `null` via Zod transforms.
 *
 * @module lib/session-schema
 */

import { z } from 'zod'

// ────────────────────────────────────────────────────────────────────────────
// clinicalContext schema — the root cause of the `undefined` bug
// ────────────────────────────────────────────────────────────────────────────

export const ClinicalContextSchema = z.object({
  patientId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  supervisorId: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  sessionType: z.string(),
  confidentialityLevel: z.enum(['high', 'medium', 'low']),
})

// ────────────────────────────────────────────────────────────────────────────
// Date coercion helper — handles JS Dates, ISO strings, and Firestore Timestamps
// ────────────────────────────────────────────────────────────────────────────

/** Type guard for Firestore Timestamp objects (both firebase-admin and JS SDK). */
function isFirestoreTimestamp(val: unknown): val is { toDate(): Date } {
  return val != null && typeof val === 'object' && 'toDate' in val && typeof (val as any).toDate === 'function'
}

const firestoreDateSchema = z.preprocess((val) => {
  if (val instanceof Date) return val
  if (isFirestoreTimestamp(val)) return val.toDate()
  if (typeof val === 'string' || typeof val === 'number') return new Date(val)
  return val
}, z.date())

// ────────────────────────────────────────────────────────────────────────────
// Nested metadata schema
// ────────────────────────────────────────────────────────────────────────────

const MetadataSchema = z.object({
  createdAt: firestoreDateSchema,
  lastUpdated: firestoreDateSchema,
  totalTokens: z.number(),
  fileReferences: z.array(z.string()),
})

// ────────────────────────────────────────────────────────────────────────────
// Risk state (optional)
// ────────────────────────────────────────────────────────────────────────────

const RiskStateSchema = z
  .object({
    isRiskSession: z.boolean(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    detectedAt: firestoreDateSchema,
    riskType: z
      .enum(['risk', 'stress', 'sensitive_content'])
      .nullish()
      .transform((v) => v ?? null),
    lastRiskCheck: firestoreDateSchema,
    consecutiveSafeTurns: z.number(),
  })
  .nullish()
  .transform((v) => v ?? null)

// ────────────────────────────────────────────────────────────────────────────
// Session summary (optional)
// ────────────────────────────────────────────────────────────────────────────

const SessionSummarySchema = z
  .object({
    mainTopics: z.array(z.string()),
    therapeuticProgress: z.string(),
    riskFlags: z.array(z.string()),
    nextSteps: z.array(z.string()),
    keyInsights: z.array(z.string()),
    generatedAt: firestoreDateSchema,
    tokenCount: z.number(),
  })
  .nullish()
  .transform((v) => v ?? null)

// ────────────────────────────────────────────────────────────────────────────
// Operational hints (optional, nested in sessionMeta)
// ────────────────────────────────────────────────────────────────────────────

const OperationalHintsSchema = z
  .object({
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    requiresImmediateAttention: z.boolean(),
    sessionCount: z.number(),
    therapeuticPhase: z.enum(['assessment', 'intervention', 'maintenance', 'closure']),
    treatmentModality: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .nullish()
  .transform((v) => v ?? null)

// ────────────────────────────────────────────────────────────────────────────
// PatientSessionMeta (optional on ChatState)
// ────────────────────────────────────────────────────────────────────────────

const PatientSessionMetaSchema = z
  .object({
    sessionId: z.string(),
    userId: z.string(),
    patient: z.object({
      reference: z.string(),
      summaryHash: z.string(),
      version: z.number(),
      confidentialityLevel: z.enum(['high', 'medium', 'low']),
      summaryText: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
    }),
    clinicalMode: z.string(),
    activeAgent: z.string(),
    createdAt: z.string(),
    operationalHints: OperationalHintsSchema,
  })
  .nullish()
  .transform((v) => v ?? null)

// ────────────────────────────────────────────────────────────────────────────
// Full session document schema (without history — messages live in subcollection)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Schema for the session document payload that is written to Firestore.
 * History/messages are excluded because they live in a subcollection.
 *
 * All optional string fields use `.nullish().transform(v => v ?? null)` to
 * guarantee Firestore never receives `undefined`.
 *
 * Uses `.passthrough()` so denormalized fields (_userId, _patientId) and
 * any future additions are preserved through validation.
 */
export const SessionDocSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  mode: z.string(),
  activeAgent: z.string(),
  title: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  metadata: MetadataSchema,
  clinicalContext: ClinicalContextSchema,
  riskState: RiskStateSchema,
  sessionMeta: PatientSessionMetaSchema,
  sessionSummary: SessionSummarySchema,
  // Denormalized fields — always set by the storage layer before write
  _userId: z.string().optional(),
  _patientId: z.string().optional(),
}).passthrough()

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────────────────

export type SessionDocPayload = z.infer<typeof SessionDocSchema>

/**
 * Validate and sanitize a session document payload before writing to Firestore.
 * Returns the cleaned payload or throws a structured ZodError.
 */
export function validateSessionForFirestore(data: unknown): SessionDocPayload {
  return SessionDocSchema.parse(data)
}

/**
 * Safe version: validate and sanitize a session document payload.
 * Returns `{ success, data, error }` instead of throwing.
 */
export function safeValidateSessionForFirestore(data: unknown) {
  return SessionDocSchema.safeParse(data)
}
