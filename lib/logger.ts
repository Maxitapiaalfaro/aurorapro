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

// Console configuration
if (isProduction && !FORCE_ENABLE_LOGS) {
  const noop = () => {};

  // Cliente (navegador) — suppress logs in the browser only
  if (typeof window !== 'undefined') {
    const originalError = console.error;

    // Bloquear todos los métodos
    console.log = noop;
    console.info = noop;
    console.debug = noop;
    console.warn = noop;
    console.trace = noop;
    console.table = noop;
    console.dir = noop;
    console.dirxml = noop;
    console.group = noop;
    console.groupCollapsed = noop;
    console.groupEnd = noop;
    console.time = noop;
    console.timeEnd = noop;
    console.timeLog = noop;
    console.count = noop;
    console.countReset = noop;
    console.assert = noop;
    console.clear = noop;

    // Sanitizar console.error
    console.error = (...args: any[]) => {
      const sanitized = args.map(arg => {
        if (typeof arg === 'string') {
          let s = arg;
          PROPRIETARY_KEYWORDS.forEach(keyword => {
            s = s.replace(new RegExp(keyword, 'gi'), '[SYSTEM]');
          });
          return s;
        }
        return arg;
      });
      originalError('[ERROR]', ...sanitized);
    };

    // Prevenir restauración desde DevTools
    Object.defineProperty(console, 'log', {
      value: noop,
      writable: false,
      configurable: false
    });

    // Mostrar mensaje de seguridad
    originalError('🔒 SECURITY: Console logging disabled in production');
  }
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
  performance: '⚡'
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
 * 🔒 SEGURIDAD: Sanitiza información sensible de strings
 */
function sanitizeString(str: string): string {
  if (!isProduction) {
    return str // En desarrollo, mostrar todo
  }

  let sanitized = str

  // Reemplazar patrones sensibles
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
 * 🔒 SEGURIDAD: Sanitiza objetos de contexto
 */
function sanitizeContext(context?: Record<string, any>): Record<string, any> | undefined {
  if (!context || !isProduction) {
    return context
  }

  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(context)) {
    // Omitir completamente claves sensibles
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    // Sanitizar valores string
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = '[OBJECT]' // No exponer estructura de objetos
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
    
    // En producción, enviar warnings a Sentry
    if (isProduction) {
      Sentry.captureMessage(message, {
        level: 'warning',
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: context
      })
    }
  }
  
  /**
   * Log de error - siempre visible y enviado a Sentry
   */
  error(message: string, error?: Error | unknown, context?: Record<string, any>): void {
    this.log('error', message, context)
    
    // Siempre enviar errores a Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: {
          message,
          ...context
        }
      })
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        tags: {
          category: this.category,
          environment: process.env.NODE_ENV
        },
        extra: {
          error,
          ...context
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

/**
 * Sobrescribir console.* en cliente en producción
 */
if (isProduction && typeof window !== 'undefined') {
  // 🔒 BLOQUEO TOTAL DE LOGS EN CLIENTE EN PRODUCCIÓN

  const noop = () => {}

  // Bloquear todos los métodos de console excepto error
  console.log = noop
  console.info = noop
  console.debug = noop
  console.warn = noop

  // Mantener console.error pero sanitizado
  const originalError = console.error
  console.error = (...args: any[]) => {
    const sanitizedArgs = args.map(arg =>
      typeof arg === 'string' ? sanitizeString(arg) : '[DATA]'
    )
    originalError(...sanitizedArgs)
  }
}

export default Logger

