// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// 🔒 HIPAA §164.514: PHI/PII patterns to redact from ALL Sentry data
const PHI_PATTERNS = [
  { pattern: /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/gi, replacement: '[RUT-REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN-REDACTED]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },
  { pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g, replacement: '[PHONE-REDACTED]' },
  { pattern: /\b(?:paciente|cliente|patient)[:\s]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, replacement: '[PATIENT-NAME-REDACTED]' },
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
  return s;
}

Sentry.init({
  dsn: "https://da82e6d85538fbb3f2f5337705c12919@o4509744324673536.ingest.us.sentry.io/4509744325853184",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Session replay sample rates (moved to top-level as of SDK v7.24.0+)
  replaysSessionSampleRate: 0.1, // captures 10% of all sessions
  replaysOnErrorSampleRate: 1.0,  // captures 100% of sessions with errors

  // Enable experimental features
  _experiments: {
    enableLogs: true,
  },

  // Integrations for enhanced functionality
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["error"] }), // Solo errores
    Sentry.replayIntegration({}),
  ],

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // 🔒 HIPAA: Filtrar breadcrumbs que contengan datos clínicos
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.message) {
      breadcrumb.message = sanitizeMessage(breadcrumb.message);
    }
    if (breadcrumb.category === 'console' && breadcrumb.data?.arguments) {
      breadcrumb.data.arguments = breadcrumb.data.arguments.map(
        (arg: unknown) => typeof arg === 'string' ? sanitizeMessage(arg) : '[DATA]'
      );
    }
    return breadcrumb;
  },

  // 🔒 HIPAA: Redactar PHI de eventos antes de enviarlos
  beforeSend(event) {
    if (event.message) {
      event.message = sanitizeMessage(event.message);
    }
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value) ex.value = redactPHI(ex.value);
      }
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;