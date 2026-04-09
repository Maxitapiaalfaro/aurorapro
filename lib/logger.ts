/**
 * Sistema de logging centralizado para HopeAI
 * 🔒 SEGURIDAD: Previene exposición de arquitectura propietaria en producción
 *
 * CRÍTICO: Este sistema protege la propiedad intelectual de HopeAI
 * - Bloquea completamente logs en producción
 * - Sanitiza información sensible antes de logging
 * - Previene exposición de estructura de archivos, lógica de negocio y diferenciadores
 */

import * as Sentry from '@sentry/nextjs'

// Tipos de log
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCategory =
  | 'system'
  | 'orchestration'
  | 'agent'
  | 'api'
  | 'storage'
  | 'file'
  | 'patient'
  | 'session'
  | 'metrics'
  | 'performance'
  | 'subscription'

// 🔒 SEGURIDAD: Configuración de logging basada en entorno
// Detectar producción de múltiples formas para compatibilidad con Vercel
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
  // Flag explícito para forzar modo producción
  process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true'

const isTest = process.env.NODE_ENV === 'test'

// 🔒 Flag para habilitar logs en producción (solo para debugging crítico)
const FORCE_ENABLE_LOGS = process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true'

// 🔒 EN PRODUCCIÓN: CERO LOGS A CONSOLA (protección de IP)
// En desarrollo: logs completos para debugging
const CONSOLE_LOG_LEVELS: Record<string, LogLevel[]> = {
  production: FORCE_ENABLE_LOGS ? ['error'] : [], // 🔒 BLOQUEADO COMPLETAMENTE EN PRODUCCIÓN
  development: ['debug', 'info', 'warn', 'error'],
  test: ['error']
}

// Console configuration — suppress client-side logs in production
if (isProduction && !FORCE_ENABLE_LOGS && typeof window !== 'undefined') {
  const noop = () => {}
  const originalError = console.error

  // Safely suppress console methods — some runtimes (Vercel) freeze console
  const methods = [
    'log', 'info', 'debug', 'warn', 'trace', 'table', 'dir', 'dirxml',
    'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog',
    'count', 'countReset', 'assert', 'clear'
  ] as const

  for (const method of methods) {
    try { (console as any)[method] = noop } catch { /* frozen — skip */ }
  }

  // Sanitizar console.error
  try {
    console.error = (...args: any[]) => {
      const sanitized = args.map(arg => {
        if (typeof arg === 'string') {
          let s = arg
          PROPRIETARY_KEYWORDS.forEach(keyword => {
            s = s.replace(new RegExp(keyword, 'gi'), '[SYSTEM]')
          })
          return s
        }
        return arg
      })
      originalError('[ERROR]', ...sanitized)
    }
  } catch { /* frozen — skip */ }
}

// 🔒 Lista de patrones sensibles que NUNCA deben loggearse
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /session[_-]?id/i,
  /user[_-]?id/i,
  /patient[_-]?id/i,
  /file[_-]?path/i,
  /directory/i,
  /\.ts$/i,
  /\.tsx$/i,
  /lib\//i,
  /components\//i,
  /orchestrat/i,
  /agent[_-]?router/i,
  /dynamic[_-]?orchestrator/i,
]

// 🔒 HIPAA §164.514: Patrones PHI/PII clínica que deben redactarse SIEMPRE
// (aplican en TODOS los entornos, no solo producción — PII nunca debe estar en logs)
// Fuente: lib/security/tool-permissions.ts PHI_PATTERNS
const PHI_REDACTION_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // RUT chileno (12.345.678-9 o 12345678-9)
  { name: 'RUT', pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/gi, replacement: '[RUT-REDACTED]' },
  // SSN
  { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN-REDACTED]' },
  // Email
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
  // Teléfono (formatos internacionales)
  { name: 'phone', pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, replacement: '[PHONE-REDACTED]' },
  // Fecha de nacimiento explícita
  { name: 'DOB', pattern: /\b(?:nacido|born|DOB|fecha de nacimiento|f\.?\s?nac)[:\s]+\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi, replacement: '[DOB-REDACTED]' },
  // Dirección postal
  { name: 'address', pattern: /\b(?:calle|av\.|avenida|pasaje|street|avenue)\s+[A-Za-záéíóú\s]+\s+\d+/gi, replacement: '[ADDRESS-REDACTED]' },
  // Nombre de paciente en contexto clínico
  { name: 'patient-name', pattern: /\b(?:paciente|cliente|patient)[:\s]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, replacement: '[PATIENT-NAME-REDACTED]' },
]

// 🔒 Palabras clave de arquitectura propietaria que deben sanitizarse
const PROPRIETARY_KEYWORDS = [
  'DynamicOrchestrator',
  'IntelligentIntentRouter',
  'ClinicalAgentRouter',
  'PatientSummaryBuilder',
  'SessionMetricsTracker',
  'HopeAISystem',
  'clinicalFileManager',
  'PatientPersistence',
]

// Prefijos visuales para cada categoría
const CATEGORY_PREFIXES: Record<LogCategory, string> = {
  system: '🔧',
  orchestration: '🧠',
  agent: '🤖',
  api: '🌐',
  storage: '💾',
  file: '📁',
  patient: '🏥',
  session: '💬',
  metrics: '📊',
  performance: '⚡',
  subscription: '💳'
}

// Prefijos para niveles de log
const LEVEL_PREFIXES: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌'
}

/**
 * 🔒 SEGURIDAD: Determina si un log debe mostrarse en consola según el entorno y nivel
 */
function shouldLogToConsole(level: LogLevel): boolean {
  // 🔒 PRODUCCIÓN: BLOQUEADO COMPLETAMENTE
  if (isProduction) {
    return false
  }

  const env = process.env.NODE_ENV || 'development'
  const allowedLevels = CONSOLE_LOG_LEVELS[env] || CONSOLE_LOG_LEVELS.development
  return allowedLevels.includes(level)
}

/**
 * 🔒 HIPAA: Redacta PHI/PII clínica de cualquier string.
 * Aplica en TODOS los entornos — información de pacientes nunca debe estar en logs.
 */
export function redactPHI(str: string): string {
  let redacted = str
  for (const { pattern, replacement } of PHI_REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement)
  }
  return redacted
}

/**
 * 🔒 SEGURIDAD: Sanitiza información sensible de strings.
 * PHI redaction aplica siempre; IP/path redaction solo en producción.
 */
function sanitizeString(str: string): string {
  // PHI se redacta SIEMPRE (HIPAA aplica en todos los entornos)
  let sanitized = redactPHI(str)

  if (!isProduction) {
    return sanitized // En desarrollo, solo redactar PHI
  }

  // Reemplazar patrones sensibles (IP protection — solo producción)
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  })

  // Reemplazar keywords propietarios
  PROPRIETARY_KEYWORDS.forEach(keyword => {
    sanitized = sanitized.replace(new RegExp(keyword, 'gi'), '[SYSTEM]')
  })

  // Remover rutas de archivos
  sanitized = sanitized.replace(/[a-zA-Z]:\\[^\s]+/g, '[PATH]')
  sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx)/g, '[FILE]')

  return sanitized
}

/**
 * 🔒 SEGURIDAD: Sanitiza objetos de contexto.
 * PHI redaction aplica siempre; deep sanitization en producción.
 */
function sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
  if (!context) {
    return context
  }

  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(context)) {
    // En producción: omitir completamente claves sensibles
    if (isProduction && SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    // Sanitizar valores string (PHI siempre, IP solo en producción)
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = isProduction ? '[OBJECT]' : value
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * 🔒 SEGURIDAD: Formatea el mensaje de log con prefijos y contexto sanitizado
 */
function formatLogMessage(
  category: LogCategory,
  level: LogLevel,
  message: string,
  context?: Record<string, any>
): string {
  const categoryPrefix = CATEGORY_PREFIXES[category]
  const levelPrefix = LEVEL_PREFIXES[level]

  // 🔒 Sanitizar mensaje
  const sanitizedMessage = sanitizeString(message)
  const sanitizedContext = sanitizeContext(context)

  let formattedMessage = `${categoryPrefix} ${levelPrefix} [${category.toUpperCase()}] ${sanitizedMessage}`

  if (sanitizedContext && Object.keys(sanitizedContext).length > 0) {
    formattedMessage += ` | Context: ${JSON.stringify(sanitizedContext)}`
  }

  return formattedMessage
}

/**
 * Clase principal de logging
 */
class Logger {
  private category: LogCategory
  
  constructor(category: LogCategory) {
    this.category = category
  }
  
  /**
   * Log de debug - solo en desarrollo
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context)
  }
  
  /**
   * Log informativo - solo en desarrollo
   */
  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context)
  }
  
  /**
   * Log de advertencia - en desarrollo y enviado a Sentry en producción
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context)

    // En producción, enviar warnings a Sentry (con PHI redactada)
    if (isProduction) {
      Sentry.captureMessage(redactPHI(message), {
        level: 'warning',
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: sanitizeContext(context)
      })
    }
  }
  
  /**
   * Log de error - siempre visible y enviado a Sentry
   */
  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    this.log('error', message, context)

    // Siempre enviar errores a Sentry (con PHI redactada)
    if (error instanceof Error) {
      Sentry.captureException(error, {
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: {
          message: redactPHI(message),
          ...sanitizeContext(context)
        }
      })
    } else {
      Sentry.captureMessage(redactPHI(message), {
        level: 'error',
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: {
          error,
          ...sanitizeContext(context)
        }
      })
    }
  }
  
  /**
   * Método interno de logging
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!shouldLogToConsole(level)) {
      return
    }
    
    const formattedMessage = formatLogMessage(this.category, level, message, context)
    
    // Usar el método de consola apropiado
    switch (level) {
      case 'debug':
        console.debug(formattedMessage)
        break
      case 'info':
        console.info(formattedMessage)
        break
      case 'warn':
        console.warn(formattedMessage)
        break
      case 'error':
        console.error(formattedMessage)
        break
    }
  }
  
  /**
   * Crea un logger hijo con contexto adicional
   */
  child(additionalContext: Record<string, any>): ContextualLogger {
    return new ContextualLogger(this.category, additionalContext)
  }
}

/**
 * Logger con contexto adicional persistente
 */
class ContextualLogger extends Logger {
  private context: Record<string, any>
  
  constructor(category: LogCategory, context: Record<string, any>) {
    super(category)
    this.context = context
  }
  
  debug(message: string, additionalContext?: Record<string, any>): void {
    super.debug(message, { ...this.context, ...additionalContext })
  }
  
  info(message: string, additionalContext?: Record<string, any>): void {
    super.info(message, { ...this.context, ...additionalContext })
  }
  
  warn(message: string, additionalContext?: Record<string, any>): void {
    super.warn(message, { ...this.context, ...additionalContext })
  }
  
  error(message: string, error?: Error | unknown, additionalContext?: Record<string, any>): void {
    super.error(message, error, { ...this.context, ...additionalContext })
  }
}

/**
 * Factory function para crear loggers por categoría
 */
export function createLogger(category: LogCategory): Logger {
  return new Logger(category)
}

/**
 * Loggers pre-configurados para uso común
 */
export const loggers = {
  system: createLogger('system'),
  orchestration: createLogger('orchestration'),
  agent: createLogger('agent'),
  api: createLogger('api'),
  storage: createLogger('storage'),
  file: createLogger('file'),
  patient: createLogger('patient'),
  session: createLogger('session'),
  metrics: createLogger('metrics'),
  performance: createLogger('performance')
}

/**
 * Función de utilidad para reemplazar console.log existentes
 * @deprecated Use loggers.* instead
 */
export function legacyLog(message: string, ...args: any[]): void {
  if (!isProduction) {
    console.log(message, ...args)
  }
}

export default Logger

