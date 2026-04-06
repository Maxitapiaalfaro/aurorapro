// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// 🔒 SEGURIDAD: Detectar entorno de producción
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true';

// 🔒 HIPAA §164.514: PHI/PII patterns to redact from ALL Sentry data
const PHI_PATTERNS = [
  { pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/gi, replacement: '[RUT-REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN-REDACTED]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
  { pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, replacement: '[PHONE-REDACTED]' },
  { pattern: /\b(?:nacido|born|DOB|fecha de nacimiento|f\.?\s?nac)[:\s]+\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi, replacement: '[DOB-REDACTED]' },
  { pattern: /\b(?:calle|av\.|avenida|pasaje|street|avenue)\s+[A-Za-záéíóú\s]+\s+\d+/gi, replacement: '[ADDRESS-REDACTED]' },
  { pattern: /\b(?:paciente|cliente|patient)[:\s]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, replacement: '[PATIENT-NAME-REDACTED]' },
];

const PROPRIETARY_KEYWORDS = [
  'DynamicOrchestrator', 'IntelligentIntentRouter', 'ClinicalAgentRouter', 'HopeAISystem',
];

function redactPHI(str: string): string {
  let s = str;
  for (const { pattern, replacement } of PHI_PATTERNS) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

function sanitizeMessage(msg: string): string {
  let s = redactPHI(msg);
  s = s.replace(/[a-zA-Z]:\\[^\s]+/g, '[PATH]');
  s = s.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx)/g, '[FILE]');
  PROPRIETARY_KEYWORDS.forEach(kw => {
    s = s.replace(new RegExp(kw, 'gi'), '[SYSTEM]');
  });
  return s;
}

Sentry.init({
  dsn: "https://da82e6d85538fbb3f2f5337705c12919@o4509744324673536.ingest.us.sentry.io/4509744325853184",

  // 🔒 SEGURIDAD: Reducir sampling en producción
  tracesSampleRate: isProduction ? 0.1 : 1,

  // 🔒 SEGURIDAD: Deshabilitar logs automáticos en producción
  _experiments: {
    enableLogs: !isProduction, // Solo en desarrollo
    metricsAggregator: true,
  },

  // 🔒 SEGURIDAD: NO enviar console.log a Sentry en producción
  integrations: [
    ...(isProduction
      ? [] // En producción: NO capturar console.log
      : [Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] })]
    ),
  ],

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // 🔒 HIPAA: Filtrar breadcrumbs que contengan datos clínicos
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizeMessage(breadcrumb.message);
    }
    // Drop breadcrumbs from console that may contain clinical content
    if (breadcrumb.category === 'console' && breadcrumb.data?.arguments) {
      breadcrumb.data.arguments = breadcrumb.data.arguments.map(
        (arg: unknown) => typeof arg === 'string' ? sanitizeMessage(arg) : '[DATA]'
      );
    }
    return breadcrumb;
  },

  // 🔒 SEGURIDAD: Filtrar eventos antes de enviarlos a Sentry
  beforeSend(event) {
    // En producción, filtrar logs de consola que no sean errores críticos
    if (isProduction && event.level === 'log') {
      return null; // No enviar logs normales en producción
    }

    // Sanitizar información sensible en mensajes
    if (event.message) {
      event.message = sanitizeMessage(event.message);
    }

    // Sanitizar PHI en exception values
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) ex.value = redactPHI(ex.value);
      }
    }

    return event;
  },
});
