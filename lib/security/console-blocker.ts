/**
 * 🔒 CONSOLE BLOCKER - Protección Agresiva de Logs en Producción
 * 
 * Este módulo se ejecuta ANTES que cualquier otro código para bloquear
 * completamente los logs en producción y proteger la arquitectura propietaria.
 * 
 * CRÍTICO: Este es el primer nivel de defensa contra exposición de IP.
 */

// 🔒 Detectar producción de TODAS las formas posibles
const isProduction = 
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true';

// Flag de emergencia para habilitar logs (solo debugging crítico)
const EMERGENCY_LOGS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true';

/**
 * Sanitizar strings para remover información sensible
 */
function sanitize(str: string): string {
  if (typeof str !== 'string') return '[DATA]';
  
  // Remover rutas de archivos
  let sanitized = str.replace(/[a-zA-Z]:\\[^\s]+/g, '[PATH]');
  sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx)/g, '[FILE]');
  
  // Remover nombres de clases propietarias
  const proprietaryKeywords = [
    'DynamicOrchestrator',
    'IntelligentIntentRouter', 
    'ClinicalAgentRouter',
    'HopeAISystem',
    'PatientSummaryBuilder',
    'SessionMetricsTracker',
    'clinicalFileManager',
    'PatientPersistence',
    'ContextWindowManager',
    'ToolRegistry'
  ];
  
  proprietaryKeywords.forEach(keyword => {
    sanitized = sanitized.replace(new RegExp(keyword, 'gi'), '[SYSTEM]');
  });
  
  // Remover IDs y tokens
  sanitized = sanitized.replace(/[a-f0-9]{32,}/gi, '[ID]');
  sanitized = sanitized.replace(/AIza[a-zA-Z0-9_-]{35}/g, '[API_KEY]');
  
  return sanitized;
}

/**
 * 🔒 BLOQUEO AGRESIVO DE CONSOLE EN PRODUCCIÓN
 */
export function blockConsoleInProduction(): void {
  if (!isProduction || EMERGENCY_LOGS_ENABLED) {
    // En desarrollo o con flag de emergencia, no bloquear
    return;
  }

  // Guardar referencias originales
  const originalError = console.error;
  const originalWarn = console.warn;

  // 🔒 BLOQUEAR COMPLETAMENTE
  const noop = () => {};
  
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.trace = noop;
  console.table = noop;
  console.dir = noop;
  console.dirxml = noop;
  console.group = noop;
  console.groupCollapsed = noop;
  console.groupEnd = noop;
  
  // Bloquear console.warn (no mostrar nada)
  console.warn = noop;
  
  // console.error: sanitizar antes de mostrar
  console.error = (...args: any[]) => {
    const sanitizedArgs = args.map(arg => {
      if (typeof arg === 'string') return sanitize(arg);
      if (arg instanceof Error) return `[ERROR: ${sanitize(arg.message)}]`;
      return '[DATA]';
    });
    originalError(...sanitizedArgs);
  };

  // Mensaje único de seguridad
  originalWarn('🔒 SECURITY: Console logging disabled in production');
}

/**
 * 🔒 BLOQUEO PARA CLIENTE (Browser)
 */
export function blockConsoleInBrowser(): void {
  if (typeof window === 'undefined') return; // Solo en cliente
  if (!isProduction || EMERGENCY_LOGS_ENABLED) return;

  // Ejecutar bloqueo
  blockConsoleInProduction();
  
  // Prevenir que alguien restaure console desde devtools
  Object.defineProperty(window, 'console', {
    get: function() {
      return {
        log: () => {},
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: (...args: any[]) => {
          const sanitized = args.map(a => 
            typeof a === 'string' ? sanitize(a) : '[DATA]'
          );
          // Usar console nativo directamente
          (window as any).__originalConsole?.error(...sanitized);
        },
        trace: () => {},
        table: () => {},
        dir: () => {},
        dirxml: () => {},
        group: () => {},
        groupCollapsed: () => {},
        groupEnd: () => {},
        clear: () => {},
        count: () => {},
        countReset: () => {},
        assert: () => {},
        time: () => {},
        timeEnd: () => {},
        timeLog: () => {}
      };
    },
    configurable: false // Prevenir reconfiguración
  });
}

/**
 * 🔒 INICIALIZACIÓN AUTOMÁTICA
 * Este código se ejecuta inmediatamente al importar el módulo
 */
if (isProduction && !EMERGENCY_LOGS_ENABLED) {
  // Servidor
  if (typeof window === 'undefined') {
    blockConsoleInProduction();
  }
  // Cliente
  else {
    // Guardar console original antes de bloquearlo
    (window as any).__originalConsole = { ...console };
    blockConsoleInBrowser();
  }
}

export const securityStatus = {
  isProduction,
  logsBlocked: isProduction && !EMERGENCY_LOGS_ENABLED,
  emergencyMode: EMERGENCY_LOGS_ENABLED
};

