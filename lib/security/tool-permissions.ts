/**
 * Tool Permissions Engine — Aurora Security Layer (P0.1)
 *
 * Motor de decisión pre-ejecución para herramientas clínicas.
 * Valida que cada tool call del LLM sea autorizada ANTES de ejecutarse,
 * cumpliendo con requisitos HIPAA de control de acceso.
 *
 * Categorías de seguridad:
 * - read-only:  Aprobación automática. Herramientas que solo analizan datos
 *               locales sin efectos secundarios (ej. identificar emociones).
 * - write:      Requiere psychologistId válido. Herramientas que persisten
 *               datos clínicos (ej. guardar diagnóstico, notas).
 * - external:   Requiere validación de payload. Herramientas que envían datos
 *               fuera del sistema (ej. búsqueda académica web). Se verifica
 *               que no se filtre PII/PHI del paciente.
 *
 * Inspirado en: docs/architecture/claude/claude-code-main/src/utils/permissions/
 *
 * @module lib/security/tool-permissions
 */

import type { SecurityCategory } from '@/lib/tool-registry';

// ============================================================================
// TIPOS
// ============================================================================

export type PermissionDecision = 'allow' | 'deny';

export interface PermissionResult {
  /** Decisión final: permitir o denegar la ejecución */
  decision: PermissionDecision;
  /** Razón legible de la decisión (para logs de auditoría) */
  reason: string;
  /** Categoría de seguridad evaluada */
  securityCategory: SecurityCategory;
  /** Nombre de la herramienta evaluada */
  toolName: string;
  /** Timestamp de la evaluación */
  evaluatedAt: Date;
  /** Datos sensibles detectados (solo para 'deny' en categoría external) */
  sensitiveDataDetected?: string[];
}

/** Contexto requerido para la evaluación de permisos */
export interface PermissionContext {
  /** UID de Firebase del psicólogo autenticado */
  psychologistId: string | null;
  /** ID de la sesión clínica activa */
  sessionId?: string;
}

// ============================================================================
// DETECCIÓN DE PII/PHI — HIPAA §164.514
// ============================================================================

/**
 * Patrones regex para detectar Información de Salud Protegida (PHI)
 * e Información Personal Identificable (PII) en payloads que se envían
 * a servicios externos.
 *
 * Basado en los 18 identificadores HIPAA Safe Harbor (§164.514(b)(2)).
 * Esta es una validación heurística de primera capa. En Fase 2+ se puede
 * integrar un modelo NER o un servicio de DLP dedicado.
 */
const PHI_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // RUT chileno (formato: 12.345.678-9 o 12345678-9)
  { name: 'RUT chileno', pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/i },
  // SSN estadounidense
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  // Email
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  // Teléfono (formatos internacionales comunes)
  { name: 'teléfono', pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/ },
  // Fecha de nacimiento explícita (formatos comunes)
  { name: 'fecha de nacimiento', pattern: /\b(?:nacido|born|DOB|fecha de nacimiento|f\.?\s?nac)[:\s]+\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/i },
  // Dirección postal (calle + número)
  { name: 'dirección', pattern: /\b(?:calle|av\.|avenida|pasaje|street|avenue)\s+[A-Za-záéíóú\s]+\s+\d+/i },
  // Nombre completo con formato "Nombre Apellido" en contexto clínico
  // (solo se activa si aparece precedido de "paciente", "cliente", "patient")
  { name: 'nombre de paciente', pattern: /\b(?:paciente|cliente|patient)[:\s]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/ },
];

/**
 * Umbral de longitud para payloads en herramientas externas.
 * Payloads excesivamente largos en búsquedas externas podrían contener
 * transcripciones clínicas completas filtradas inadvertidamente.
 */
const EXTERNAL_PAYLOAD_MAX_LENGTH = 500;

// ============================================================================
// MOTOR DE DECISIÓN
// ============================================================================

/**
 * Valida si una herramienta tiene permiso de ejecución.
 *
 * Flujo de decisión:
 * 1. read-only  → ALLOW automático (sin efectos secundarios)
 * 2. write      → ALLOW solo si psychologistId es válido (no null/anonymous)
 * 3. external   → ALLOW solo si el payload no contiene PII/PHI detectada
 *
 * @param toolName - Nombre de la herramienta (call.name del SDK)
 * @param securityCategory - Categoría de seguridad de la herramienta
 * @param payload - Argumentos que el LLM pasó a la herramienta (call.args)
 * @param context - Contexto de autenticación y sesión
 * @returns PermissionResult con la decisión y metadatos de auditoría
 */
export function checkToolPermission(
  toolName: string,
  securityCategory: SecurityCategory,
  payload: Record<string, unknown>,
  context: PermissionContext
): PermissionResult {
  const base: Omit<PermissionResult, 'decision' | 'reason'> = {
    securityCategory,
    toolName,
    evaluatedAt: new Date(),
  };

  // ── 1. read-only: aprobación inmediata ──────────────────────────────
  if (securityCategory === 'read-only') {
    return {
      ...base,
      decision: 'allow',
      reason: 'Read-only tools are auto-approved (no side effects)',
    };
  }

  // ── 2. write: requiere identidad válida ─────────────────────────────
  if (securityCategory === 'write') {
    if (!context.psychologistId || context.psychologistId === 'anonymous') {
      return {
        ...base,
        decision: 'deny',
        reason: 'Write operations require an authenticated psychologist (psychologistId is missing or anonymous)',
      };
    }
    return {
      ...base,
      decision: 'allow',
      reason: `Write authorized for psychologist ${context.psychologistId}`,
    };
  }

  // ── 3. external: validación de PII/PHI en payload ───────────────────
  if (securityCategory === 'external') {
    const sensitiveFindings = scanPayloadForPHI(payload);

    if (sensitiveFindings.length > 0) {
      return {
        ...base,
        decision: 'deny',
        reason: `External tool payload contains potential PHI/PII: ${sensitiveFindings.join(', ')}. ` +
                `Sending protected health information to external services violates HIPAA §164.502.`,
        sensitiveDataDetected: sensitiveFindings,
      };
    }

    return {
      ...base,
      decision: 'allow',
      reason: 'External tool payload passed PHI/PII scan',
    };
  }

  // ── Categoría desconocida: denegar por defecto (fail-closed) ────────
  return {
    ...base,
    decision: 'deny',
    reason: `Unknown security category "${securityCategory}". Denied by default (fail-closed).`,
  };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Escanea todos los valores string de un payload buscando patrones PHI/PII.
 * Retorna una lista de tipos de datos sensibles encontrados.
 */
function scanPayloadForPHI(payload: Record<string, unknown>): string[] {
  const findings: string[] = [];
  const textValues = extractStringValues(payload);
  const fullText = textValues.join(' ');

  // Verificar longitud total (payloads gigantes son sospechosos)
  if (fullText.length > EXTERNAL_PAYLOAD_MAX_LENGTH) {
    findings.push(
      `payload excede ${EXTERNAL_PAYLOAD_MAX_LENGTH} caracteres (${fullText.length} chars) — posible fuga de transcripción clínica`
    );
  }

  // Verificar cada patrón PHI contra el texto concatenado
  for (const { name, pattern } of PHI_PATTERNS) {
    if (pattern.test(fullText)) {
      findings.push(name);
    }
  }

  return findings;
}

/**
 * Extrae recursivamente todos los valores string de un objeto,
 * incluyendo valores anidados en arrays y sub-objetos.
 */
function extractStringValues(obj: unknown): string[] {
  if (typeof obj === 'string') return [obj];
  if (Array.isArray(obj)) return obj.flatMap(extractStringValues);
  if (obj && typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(extractStringValues);
  }
  return [];
}
