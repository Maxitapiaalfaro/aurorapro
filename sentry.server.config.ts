// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// 🔒 SEGURIDAD: Detectar entorno de producción
const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_FORCE_PRODUCTION_MODE === 'true';

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

  // 🔒 SEGURIDAD: Filtrar eventos antes de enviarlos a Sentry
  beforeSend(event, hint) {
    // En producción, filtrar logs de consola que no sean errores críticos
    if (isProduction && event.level === 'log') {
      return null; // No enviar logs normales en producción
    }

    // Sanitizar información sensible en mensajes
    if (event.message) {
      // Remover rutas de archivos
      event.message = event.message.replace(/[a-zA-Z]:\\[^\s]+/g, '[PATH]');
      event.message = event.message.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx)/g, '[FILE]');

      // Remover nombres de clases propietarias
      const proprietaryKeywords = [
        'DynamicOrchestrator',
        'IntelligentIntentRouter',
        'ClinicalAgentRouter',
        'HopeAISystem',
      ];
      proprietaryKeywords.forEach(keyword => {
        event.message = event.message?.replace(new RegExp(keyword, 'gi'), '[SYSTEM]');
      });
    }

    return event;
  },
});
