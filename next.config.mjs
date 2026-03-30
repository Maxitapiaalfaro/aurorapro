import {withSentryConfig} from '@sentry/nextjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose NEXT_PUBLIC env vars at build time for the client bundle
  env: {
    NEXT_PUBLIC_GOOGLE_AI_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      '',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  // 🔒 SEGURIDAD: Habilitar instrumentation hook
  experimental: {
    instrumentationHook: true,
  },

  // 🔒 SEGURIDAD: Configuración de producción
  productionBrowserSourceMaps: false, // No exponer source maps en producción

  // 🔒 SEGURIDAD: Webpack configuration para eliminar logs en producción
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      // Exclude Node.js modules from the client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        'better-sqlite3': false,
      };
      config.externals = config.externals || [];
      config.externals.push('better-sqlite3');

      // Strip console.log from the client (browser) bundle only.
      // Server-side API routes intentionally keep their logs so errors
      // appear in Vercel function logs for debugging.
      if (!dev) {
        const TerserPlugin = require('terser-webpack-plugin')

        config.optimization.minimizer = [
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true,
                pure_funcs: [
                  'console.log',
                  'console.info',
                  'console.debug',
                  'console.warn',
                  'console.trace',
                  'console.table',
                  'console.dir',
                  'console.dirxml',
                  'console.group',
                  'console.groupCollapsed',
                  'console.groupEnd',
                  'console.time',
                  'console.timeEnd',
                  'console.timeLog',
                  'console.count',
                  'console.countReset',
                  'console.assert',
                  'console.clear'
                ],
                dead_code: true,
                unused: true,
              },
              mangle: {
                safari10: true,
              },
              format: {
                comments: false,
              },
            },
            extractComments: false,
          })
        ];
      }
    }

    return config
  },

  // 🔒 Headers de seguridad
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'microphone=*, camera=*',
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "hopeai-rh",
  project: "sentry-indigo-umbrella",

  // 🔒 SEGURIDAD: Solo mostrar logs en CI, silenciar en producción
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // 🔒 SEGURIDAD: NO subir source maps en producción (proteger código)
  widenClientFileUpload: false,

  // 🔒 SEGURIDAD: Ocultar source maps del cliente
  hideSourceMaps: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  tunnelRoute: "/monitoring",

  // 🔒 SEGURIDAD: Eliminar statements de logger de Sentry para reducir bundle
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors.
  automaticVercelMonitors: true,

  // 🔒 SEGURIDAD: Deshabilitar telemetría de Sentry
  telemetry: false,
});