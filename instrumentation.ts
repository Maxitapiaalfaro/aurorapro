/**
 * 🔒 INSTRUMENTATION - Next.js Instrumentation Hook
 *
 * Este archivo se ejecuta ANTES que cualquier otro código en el servidor.
 * CRÍTICO: Bloquear console.log ANTES de importar Sentry o cualquier otro módulo.
 */

// 🔒 PASO 1: BLOQUEAR CONSOLE INMEDIATAMENTE (antes de cualquier import)
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true';

const FORCE_ENABLE_LOGS = process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true';

if (isProduction && !FORCE_ENABLE_LOGS) {
  // Guardar referencias originales
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalError = console.error;
  const noop = () => {};

  // Lista de palabras clave propietarias
  const PROPRIETARY_KEYWORDS = [
    'DynamicOrchestrator',
    'IntelligentIntentRouter',
    'ClinicalAgentRouter',
    'HopeAISystem',
    'PatientSummaryBuilder',
    'SessionMetricsTracker',
    'clinicalFileManager',
    'PatientPersistence',
    'ContextWindowManager',
    'ToolRegistry',
    'HopeAI Socrático',
    'HopeAI Clínico',
    'HopeAI Académico',
    'Pioneer Circle',
    'Respuesta de streaming',
    'Historial actualizado',
    'Frontend:',
    'Evaluación de elegibilidad'
  ];

  // Sanitizar mensajes
  const sanitize = (arg: any): any => {
    if (typeof arg === 'string') {
      let s = arg;
      PROPRIETARY_KEYWORDS.forEach(keyword => {
        s = s.replace(new RegExp(keyword, 'gi'), '[SYSTEM]');
      });
      s = s.replace(/[a-f0-9]{32,}/gi, '[ID]');
      s = s.replace(/session_[a-zA-Z0-9]+/gi, '[SESSION]');
      return s;
    }
    if (typeof arg === 'object' && arg !== null) {
      return '[OBJECT]';
    }
    return arg;
  };

  // Determinar si un log debe permitirse
  const shouldAllowLog = (args: any[]): boolean => {
    const message = args.map(arg =>
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ');

    // Permitir logs del sistema Next.js
    if (message.includes('▲ Next.js') ||
        message.includes('Compiled') ||
        message.includes('Ready in') ||
        message.includes('✓') ||
        message.includes('○') ||
        message.includes('ƒ') ||
        message.includes('Route (') ||
        message.includes('Middleware')) {
      return true;
    }

    // Permitir logs de seguridad
    if (message.includes('🔒 SECURITY') ||
        message.includes('Sentry')) {
      return true;
    }

    // Permitir logs de pre-warming e instrumentación
    if (message.includes('[Prewarm]') ||
        message.includes('[Instrumentation]')) {
      return true;
    }

    return false;
  };

  // Reemplazar console.log
  console.log = (...args: any[]) => {
    if (shouldAllowLog(args)) {
      originalLog(...args);
    }
  };

  console.info = (...args: any[]) => {
    if (shouldAllowLog(args)) {
      originalInfo(...args);
    }
  };

  console.debug = noop;
  console.warn = noop;

  // Sanitizar console.error
  console.error = (...args: any[]) => {
    const sanitized = args.map(sanitize);
    originalError(...sanitized);
  };

  // Log de confirmación
  originalLog('🔒 SECURITY: Server-side console logging blocked in production');
}

// 🔒 PASO 2: AHORA importar Sentry (después de bloquear console)
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // 🔥 PREWARM: Inicializar HopeAI system antes del primer request
    console.log('🚀 [Instrumentation] Starting HopeAI pre-warming...')
    await import('./lib/server-prewarm');
    console.log('✅ [Instrumentation] HopeAI pre-warming triggered')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
