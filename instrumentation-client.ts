// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

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
    // 🔒 OPTIMIZACIÓN: Solo capturar errores críticos, NO console.log
    // Esto evita que Sentry agregue rutas largas a cada log en desarrollo
    Sentry.consoleLoggingIntegration({ levels: ["error"] }), // Solo errores
    // Enable session replay for debugging
    Sentry.replayIntegration({
      // Additional replay configuration goes here
      // Sample rates are now configured at the top level
    }),
    // Nota: Las métricas personalizadas se manejan principalmente en el servidor
    // El cliente enviará métricas a través de las llamadas API
  ],

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;