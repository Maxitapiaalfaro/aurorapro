/**
 * 🔒 SECURITY AUDIT API - Endpoint para revisar auditoría de seguridad
 * 
 * Requiere autenticación administrativa
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/security/admin-auth';
import { getAuditLogger } from '@/lib/security/audit-logger';
import { getRateLimiter } from '@/lib/security/rate-limiter';

export async function GET(request: NextRequest) {
  try {
    // 🔒 SEGURIDAD: Verificar autenticación
    const auth = verifyAdminRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'This endpoint requires authentication',
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const limit = parseInt(searchParams.get('limit') || '100');

    const auditLogger = getAuditLogger();

    switch (action) {
      case 'stats':
        // Estadísticas generales
        const stats = auditLogger.getStats();
        const patterns = auditLogger.detectSuspiciousPatterns();
        const rateLimiterStats = getRateLimiter().getStats();

        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          audit: stats,
          suspiciousPatterns: patterns,
          rateLimiter: rateLimiterStats
        });

      case 'recent':
        // Eventos recientes
        const recentEvents = auditLogger.getRecentEvents(limit);
        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          events: recentEvents,
          count: recentEvents.length
        });

      case 'suspicious':
        // Solo patrones sospechosos
        const suspicious = auditLogger.detectSuspiciousPatterns();
        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          patterns: suspicious
        });

      case 'ip':
        // Eventos de una IP específica
        const ip = searchParams.get('ip');
        if (!ip) {
          return NextResponse.json(
            { error: 'IP parameter required' },
            { status: 400 }
          );
        }
        const ipEvents = auditLogger.getEventsByIP(ip);
        return NextResponse.json({
          success: true,
          timestamp: new Date().toISOString(),
          ip,
          events: ipEvents,
          count: ipEvents.length
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in security audit API:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to retrieve audit data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Limpiar eventos antiguos
 */
export async function POST(request: NextRequest) {
  try {
    // 🔒 SEGURIDAD: Verificar autenticación
    const auth = verifyAdminRequest(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'This endpoint requires authentication',
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, olderThanMinutes } = body;

    const auditLogger = getAuditLogger();

    switch (action) {
      case 'cleanup':
        auditLogger.cleanup(olderThanMinutes || 60);
        return NextResponse.json({
          success: true,
          message: `Cleaned up events older than ${olderThanMinutes || 60} minutes`,
          timestamp: new Date().toISOString()
        });

      case 'reset':
        // Solo en desarrollo
        if (process.env.NODE_ENV !== 'development') {
          return NextResponse.json(
            { error: 'Reset only allowed in development' },
            { status: 403 }
          );
        }
        auditLogger.reset();
        return NextResponse.json({
          success: true,
          message: 'Audit log reset',
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in security audit POST:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to process audit action',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

