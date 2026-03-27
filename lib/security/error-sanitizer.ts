/**
 * 🔒 ERROR SANITIZER - Sanitización de errores en producción
 * 
 * Previene la exposición de información sensible en mensajes de error
 * mientras mantiene la utilidad para debugging interno.
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Patrones de información sensible que deben ser removidos
 */
const SENSITIVE_PATTERNS = {
  // Rutas de archivos
  filePaths: [
    /[a-zA-Z]:\\[^\s]+/g,                    // Windows paths
    /\/[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx)/g, // Unix paths con extensión
    /at\s+[^\s]+\s+\([^)]+\)/g,              // Stack trace locations
  ],
  
  // Nombres de clases propietarias
  proprietaryClasses: [
    /DynamicOrchestrator/gi,
    /IntelligentIntentRouter/gi,
    /ClinicalAgentRouter/gi,
    /HopeAISystem/gi,
    /PatientSummaryBuilder/gi,
    /SessionMetricsTracker/gi,
    /clinicalFileManager/gi,
    /PatientPersistence/gi,
    /ContextWindowManager/gi,
    /ToolRegistry/gi,
    /OrchestrationBridge/gi,
  ],
  
  // IDs y tokens
  identifiers: [
    /[a-f0-9]{32,}/gi,                       // Hash-like IDs
    /AIza[a-zA-Z0-9_-]{35}/g,                // Google API keys
    /sk_[a-zA-Z0-9]{24,}/g,                  // Stripe secret keys
    /pk_[a-zA-Z0-9]{24,}/g,                  // Stripe public keys
    /Bearer\s+[a-zA-Z0-9_-]+/gi,             // Bearer tokens
  ],
  
  // Información de entorno
  environment: [
    /NODE_ENV=\w+/gi,
    /VERCEL_ENV=\w+/gi,
    /process\.env\.\w+/gi,
  ],
  
  // Información de base de datos
  database: [
    /mongodb:\/\/[^\s]+/gi,
    /postgres:\/\/[^\s]+/gi,
    /mysql:\/\/[^\s]+/gi,
    /redis:\/\/[^\s]+/gi,
  ]
};

/**
 * Reemplazos genéricos para información sensible
 */
const REPLACEMENTS = {
  filePath: '[FILE_PATH]',
  className: '[SYSTEM]',
  id: '[ID]',
  token: '[TOKEN]',
  env: '[ENV]',
  database: '[DATABASE_URL]'
};

/**
 * Sanitizar un string removiendo información sensible
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '[DATA]';
  
  let sanitized = str;
  
  // Remover rutas de archivos
  SENSITIVE_PATTERNS.filePaths.forEach(pattern => {
    sanitized = sanitized.replace(pattern, REPLACEMENTS.filePath);
  });
  
  // Remover nombres de clases propietarias
  SENSITIVE_PATTERNS.proprietaryClasses.forEach(pattern => {
    sanitized = sanitized.replace(pattern, REPLACEMENTS.className);
  });
  
  // Remover IDs y tokens
  SENSITIVE_PATTERNS.identifiers.forEach(pattern => {
    sanitized = sanitized.replace(pattern, REPLACEMENTS.token);
  });
  
  // Remover información de entorno
  SENSITIVE_PATTERNS.environment.forEach(pattern => {
    sanitized = sanitized.replace(pattern, REPLACEMENTS.env);
  });
  
  // Remover URLs de base de datos
  SENSITIVE_PATTERNS.database.forEach(pattern => {
    sanitized = sanitized.replace(pattern, REPLACEMENTS.database);
  });
  
  return sanitized;
}

/**
 * Sanitizar un objeto Error
 */
export function sanitizeError(error: Error): {
  message: string;
  name: string;
  stack?: string;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    message: sanitizeString(error.message),
    name: error.name,
    // En producción, NO incluir stack trace
    stack: isProduction ? undefined : sanitizeString(error.stack || '')
  };
}

/**
 * Crear respuesta de error sanitizada para API
 */
export function createSanitizedErrorResponse(
  error: Error | unknown,
  context?: string
): {
  error: string;
  message: string;
  timestamp: string;
  context?: string;
  details?: any;
} {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Mensaje genérico en producción
  const genericMessage = 'An error occurred while processing your request';
  
  if (error instanceof Error) {
    // Enviar error completo a Sentry (con información no sanitizada)
    Sentry.captureException(error, {
      tags: {
        context: context || 'api_error',
        environment: process.env.NODE_ENV
      }
    });
    
    // En producción, devolver mensaje genérico
    if (isProduction) {
      return {
        error: 'Internal Server Error',
        message: genericMessage,
        timestamp: new Date().toISOString(),
        context
      };
    }
    
    // En desarrollo, devolver error sanitizado pero más detallado
    const sanitized = sanitizeError(error);
    return {
      error: sanitized.name,
      message: sanitized.message,
      timestamp: new Date().toISOString(),
      context,
      details: {
        stack: sanitized.stack
      }
    };
  }
  
  // Error desconocido
  Sentry.captureMessage('Unknown error type', {
    level: 'error',
    tags: {
      context: context || 'api_error'
    },
    extra: {
      error: String(error)
    }
  });
  
  return {
    error: 'Unknown Error',
    message: isProduction ? genericMessage : sanitizeString(String(error)),
    timestamp: new Date().toISOString(),
    context
  };
}

/**
 * Wrapper para handlers de API que sanitiza errores automáticamente
 */
export function withErrorSanitization<T extends any[]>(
  handler: (...args: T) => Promise<Response>,
  context?: string
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      const sanitizedError = createSanitizedErrorResponse(error, context);
      
      return new Response(
        JSON.stringify(sanitizedError),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
  };
}

/**
 * Sanitizar objeto completo (recursivo)
 */
export function sanitizeObject(obj: any, maxDepth: number = 3): any {
  if (maxDepth <= 0) return '[MAX_DEPTH]';
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth - 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Sanitizar la clave también
        const sanitizedKey = sanitizeString(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key], maxDepth - 1);
      }
    }
    return sanitized;
  }
  
  return '[UNKNOWN_TYPE]';
}

/**
 * Verificar si un error debe ser reportado a Sentry
 */
export function shouldReportToSentry(error: Error): boolean {
  // No reportar errores de red comunes
  const ignoredErrors = [
    'NetworkError',
    'AbortError',
    'TimeoutError',
    'Failed to fetch'
  ];
  
  return !ignoredErrors.some(ignored => 
    error.message.includes(ignored) || error.name === ignored
  );
}

export default {
  sanitizeString,
  sanitizeError,
  sanitizeObject,
  createSanitizedErrorResponse,
  withErrorSanitization,
  shouldReportToSentry
};

