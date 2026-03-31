/**
 * INSTRUMENTATION - Next.js Instrumentation Hook
 *
 * This file runs BEFORE any other server code.
 */

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
