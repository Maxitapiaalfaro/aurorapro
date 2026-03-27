/**
 * 🔒 ADMIN AUTHENTICATION - Protección de endpoints administrativos
 * 
 * Sistema de autenticación simple pero efectivo para proteger
 * endpoints de monitoreo y administración.
 */

import * as Sentry from '@sentry/nextjs';
import { auditLog } from './audit-logger';

/**
 * Generar token de administración seguro
 * Este token debe configurarse en variables de entorno
 */
export function generateAdminToken(): string {
  // En producción, esto debe ser un token fuerte configurado en Vercel
  // Ejemplo: openssl rand -hex 32
  return process.env.ADMIN_API_TOKEN || '';
}

/**
 * Verificar si un token de administración es válido
 */
export function verifyAdminToken(token: string | null): boolean {
  if (!token) return false;
  
  const validToken = generateAdminToken();
  
  // Si no hay token configurado, bloquear acceso en producción
  if (!validToken && process.env.NODE_ENV === 'production') {
    return false;
  }
  
  // En desarrollo sin token configurado, permitir acceso
  if (!validToken && process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // Comparación segura contra timing attacks
  return timingSafeEqual(token, validToken);
}

/**
 * Comparación segura de strings (previene timing attacks)
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Extraer token de autorización del request
 */
export function extractAuthToken(request: Request): string | null {
  // Intentar obtener de header Authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Formato: "Bearer TOKEN"
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
    // Formato directo: "TOKEN"
    return authHeader;
  }
  
  // Intentar obtener de query parameter (menos seguro, solo para testing)
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) return tokenParam;
  
  // Intentar obtener de header personalizado
  const customHeader = request.headers.get('x-admin-token');
  if (customHeader) return customHeader;
  
  return null;
}

/**
 * Verificar autenticación de request administrativo
 */
export function verifyAdminRequest(request: Request): {
  authenticated: boolean;
  reason?: string;
} {
  const token = extractAuthToken(request);
  
  if (!token) {
    return {
      authenticated: false,
      reason: 'No authentication token provided'
    };
  }
  
  const isValid = verifyAdminToken(token);

  if (!isValid) {
    // Log intento de acceso no autorizado
    logUnauthorizedAccess(request);

    return {
      authenticated: false,
      reason: 'Invalid authentication token'
    };
  }

  // Log acceso exitoso
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const url = new URL(request.url);

  auditLog.authenticationSuccess(ip, userAgent, url.pathname);

  return { authenticated: true };
}

/**
 * Registrar intento de acceso no autorizado
 */
function logUnauthorizedAccess(request: Request): void {
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';

  const userAgent = request.headers.get('user-agent') || 'unknown';
  const url = new URL(request.url);

  // Log con audit logger (que también envía a Sentry)
  auditLog.authenticationFailure(ip, userAgent, url.pathname);
}

/**
 * Middleware helper para proteger endpoints
 */
export function requireAdminAuth(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const auth = verifyAdminRequest(request);
    
    if (!auth.authenticated) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: auth.reason || 'Authentication required',
          timestamp: new Date().toISOString()
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="Admin API"'
          }
        }
      );
    }
    
    return handler(request);
  };
}

/**
 * Verificar si el endpoint debe estar protegido
 */
export function isProtectedEndpoint(pathname: string): boolean {
  const protectedPaths = [
    '/api/system-status',
    '/api/orchestration/health',
    '/api/orchestration/metrics',
    '/api/orchestration/reports',
    '/api/orchestration/alerts',
  ];
  
  // Health check básico NO requiere auth (para monitoring externo)
  const publicPaths = [
    '/api/health',
  ];
  
  if (publicPaths.some(path => pathname === path)) {
    return false;
  }
  
  return protectedPaths.some(path => pathname.startsWith(path));
}

/**
 * Verificar si el endpoint debe tener rate limiting estricto
 */
export function requiresStrictRateLimit(pathname: string): boolean {
  const strictPaths = [
    '/api/send-message',
    '/api/upload-document',
    '/api/switch-agent',
  ];
  
  return strictPaths.some(path => pathname.startsWith(path));
}

/**
 * Obtener tipo de rate limit para un endpoint
 */
export function getRateLimitType(pathname: string): 'public' | 'messaging' | 'upload' | 'admin' | 'health' {
  if (pathname.startsWith('/api/send-message')) return 'messaging';
  if (pathname.startsWith('/api/upload-document')) return 'upload';
  if (pathname === '/api/health') return 'health';
  if (isProtectedEndpoint(pathname)) return 'admin';
  return 'public';
}

export default {
  verifyAdminToken,
  verifyAdminRequest,
  requireAdminAuth,
  isProtectedEndpoint,
  requiresStrictRateLimit,
  getRateLimitType
};

