/**
 * 🔒 ENVIRONMENT VALIDATOR - Validación de variables de entorno
 * 
 * Valida que todas las variables críticas estén configuradas correctamente
 * antes de iniciar la aplicación.
 */

import * as Sentry from '@sentry/nextjs';


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  environment: 'development' | 'production' | 'preview' | 'test';
}

/**
 * Variables requeridas en todos los entornos
 */
const REQUIRED_VARS = [
  'NEXT_PUBLIC_GOOGLE_AI_API_KEY',
];

/**
 * Variables requeridas solo en producción
 */
const PRODUCTION_REQUIRED_VARS = [
  'ADMIN_API_TOKEN',
  'NEXT_PUBLIC_FORCE_PRODUCTION_MODE',
  'NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS',
  'SENTRY_DSN',
];

/**
 * Variables opcionales pero recomendadas
 */
const RECOMMENDED_VARS = [
  'SENTRY_ORG',
  'SENTRY_PROJECT',
];

/**
 * Detectar entorno actual
 */
function detectEnvironment(): 'development' | 'production' | 'preview' | 'test' {
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.VERCEL_ENV === 'production') return 'production';
  if (process.env.VERCEL_ENV === 'preview') return 'preview';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

/**
 * Validar formato de token administrativo
 */
function validateAdminToken(token: string): boolean {
  // Debe ser un string hexadecimal de al menos 32 caracteres
  return /^[a-f0-9]{32,}$/i.test(token);
}

/**
 * Validar formato de API key de Google
 */
function validateGoogleApiKey(key: string): boolean {
  // Google API keys empiezan con AIza
  return key.startsWith('AIza') && key.length > 30;
}

/**
 * Validar formato de Sentry DSN
 */
function validateSentryDSN(dsn: string): boolean {
  // Formato: https://[key]@[org].ingest.sentry.io/[project]
  return /^https:\/\/[a-f0-9]+@[a-z0-9-]+\.ingest\.sentry\.io\/\d+$/.test(dsn);
}

/**
 * Validar variables de entorno
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const environment = detectEnvironment();

  // 1. Validar variables requeridas en todos los entornos
  REQUIRED_VARS.forEach(varName => {
    const value = process.env[varName];
    
    if (!value) {
      errors.push(`Missing required environment variable: ${varName}`);
      return;
    }

    // Validaciones específicas
    if (varName === 'NEXT_PUBLIC_GOOGLE_AI_API_KEY') {
      if (!validateGoogleApiKey(value)) {
        errors.push(`Invalid Google AI API key format: ${varName}`);
      }
    }
  });

  // 2. Validar variables requeridas en producción
  if (environment === 'production') {
    PRODUCTION_REQUIRED_VARS.forEach(varName => {
      const value = process.env[varName];
      
      if (!value) {
        errors.push(`Missing required production variable: ${varName}`);
        return;
      }

      // Validaciones específicas
      if (varName === 'ADMIN_API_TOKEN') {
        if (!validateAdminToken(value)) {
          errors.push(`Invalid admin token format: ${varName} (must be hex string, 32+ chars)`);
        }
      }

      if (varName === 'SENTRY_DSN') {
        if (!validateSentryDSN(value)) {
          warnings.push(`Invalid Sentry DSN format: ${varName}`);
        }
      }

      if (varName === 'NEXT_PUBLIC_FORCE_PRODUCTION_MODE') {
        if (value !== 'true') {
          errors.push(`${varName} must be 'true' in production`);
        }
      }

      if (varName === 'NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS') {
        if (value !== 'false') {
          errors.push(`${varName} must be 'false' in production`);
        }
      }
    });
  }

  // 3. Validar variables recomendadas
  RECOMMENDED_VARS.forEach(varName => {
    const value = process.env[varName];
    
    if (!value) {
      warnings.push(`Recommended variable not set: ${varName}`);
    }
  });

  // 4. Validar configuración de seguridad
  if (environment === 'production') {
    // Verificar que los logs estén deshabilitados
    const logsEnabled = process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true';
    if (logsEnabled) {
      errors.push('Production logs are enabled! This exposes sensitive information.');
    }

    // Verificar que el modo producción esté forzado
    const productionMode = process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true';
    if (!productionMode) {
      errors.push('Production mode is not forced! Console logs may be visible.');
    }
  }

  // 5. Validar que no haya valores de ejemplo/placeholder
  const placeholderPatterns = [
    'your_',
    'tu_',
    'example',
    'test123',
    'placeholder',
    'changeme',
  ];

  Object.entries(process.env).forEach(([key, value]) => {
    if (!value) return;
    
    const lowerValue = value.toLowerCase();
    if (placeholderPatterns.some(pattern => lowerValue.includes(pattern))) {
      warnings.push(`Variable ${key} appears to contain a placeholder value`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    environment
  };
}

/**
 * Validar y reportar errores
 */
export function validateAndReport(): void {
  const result = validateEnvironment();

  // En desarrollo, solo mostrar warnings
  if (result.environment === 'development') {
    if (result.warnings.length > 0) {
      logger.warn('⚠️  Environment warnings:');
      result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
    }
    return;
  }

  // En producción, ser estricto
  if (!result.valid) {
    logger.error('❌ Environment validation failed:');
    result.errors.forEach(error => logger.error(`  - ${error}`));
    
    // Reportar a Sentry
    Sentry.captureMessage('Environment validation failed', {
      level: 'error',
      tags: {
        environment: result.environment,
        validation: 'failed'
      },
      extra: {
        errors: result.errors,
        warnings: result.warnings
      }
    });

    // En producción, fallar el startup
    if (result.environment === 'production') {
      throw new Error('Environment validation failed. Check logs for details.');
    }
  }

  // Mostrar warnings incluso si la validación pasó
  if (result.warnings.length > 0) {
    logger.warn('⚠️  Environment warnings:');
    result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
  }

  // Confirmar validación exitosa
  if (result.valid && result.warnings.length === 0) {
    logger.info(`✅ Environment validation passed (${result.environment})`);
  }
}

/**
 * Obtener resumen de configuración (sin valores sensibles)
 */
export function getConfigSummary(): {
  environment: string;
  securityMode: 'strict' | 'relaxed';
  logsEnabled: boolean;
  authEnabled: boolean;
  sentryEnabled: boolean;
} {
  const environment = detectEnvironment();
  
  return {
    environment,
    securityMode: environment === 'production' ? 'strict' : 'relaxed',
    logsEnabled: process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'true',
    authEnabled: !!process.env.ADMIN_API_TOKEN,
    sentryEnabled: !!process.env.SENTRY_DSN
  };
}

/**
 * Verificar si estamos en modo seguro
 */
export function isSecureMode(): boolean {
  const environment = detectEnvironment();
  
  if (environment !== 'production') {
    return true; // En desarrollo, siempre OK
  }

  // En producción, verificar configuración de seguridad
  return (
    process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true' &&
    process.env.NEXT_PUBLIC_ENABLE_PRODUCTION_LOGS === 'false' &&
    !!process.env.ADMIN_API_TOKEN
  );
}

export default {
  validateEnvironment,
  validateAndReport,
  getConfigSummary,
  isSecureMode,
  detectEnvironment
};

