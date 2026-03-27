import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/security/admin-auth';
import { getConfigSummary, isSecureMode } from '@/lib/env-validator';
import { getPrewarmStatus } from '@/lib/server-prewarm';

/**
 * 🔒 HEALTH CHECK API - Endpoint de health check con autenticación
 *
 * - GET /api/health → Health check básico (público)
 * - GET /api/health?detailed=true → Health check detallado (requiere auth)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';

    // Si se solicita información detallada, requiere autenticación
    if (detailed) {
      const auth = verifyAdminRequest(request);
      if (!auth.authenticated) {
        return NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Detailed health check requires authentication',
            hint: 'Use: Authorization: Bearer YOUR_TOKEN',
            timestamp: new Date().toISOString()
          },
          { status: 401 }
        );
      }
    }

    // Obtener estado de pre-warming
    const prewarmStatus = getPrewarmStatus()

    // Health check básico (público)
    const basicHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      prewarm: {
        ready: prewarmStatus.isPrewarmed,
        duration: prewarmStatus.duration
      }
    };

    // Si no se solicita detalle, devolver solo básico
    if (!detailed) {
      return NextResponse.json(basicHealth, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    // Health check detallado (requiere auth)
    const configSummary = getConfigSummary();
    const secureMode = isSecureMode();

    const detailedHealth = {
      ...basicHealth,
      version: process.env.npm_package_version || '1.0.0',
      config: configSummary,
      security: {
        secureMode,
        logsBlocked: !configSummary.logsEnabled,
        authEnabled: configSummary.authEnabled,
        sentryEnabled: configSummary.sentryEnabled
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        unit: 'MB'
      },
      services: {
        sentry: {
          configured: !!process.env.SENTRY_DSN,
          environment: process.env.SENTRY_ENVIRONMENT || 'development'
        },
        metrics: {
          enabled: true,
          tracker: 'sentry-metrics-tracker'
        },
        hopeai: {
          prewarmed: prewarmStatus.isPrewarmed,
          prewarming: prewarmStatus.isPrewarming,
          prewarmDuration: prewarmStatus.duration,
          prewarmError: prewarmStatus.error
        }
      }
    };

    return NextResponse.json(detailedHealth, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}

/**
 * Endpoint HEAD para verificaciones rápidas de disponibilidad
 */
export async function HEAD(request: NextRequest) {
  try {
    return new NextResponse(null, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}