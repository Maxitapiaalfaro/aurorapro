/**
 * 🔒 SECURITY MIDDLEWARE - Protección de toda la aplicación
 * 
 * Este middleware se ejecuta en TODAS las requests y proporciona:
 * - Rate limiting por IP
 * - Autenticación para endpoints administrativos
 * - Headers de seguridad
 * - Logging de accesos sospechosos
 * - Protección contra ataques comunes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Importar helpers de seguridad
import { 
  checkRateLimit, 
  getRequestIdentifier,
  type RateLimitType 
} from '@/lib/security/rate-limiter';

import {
  verifyAdminRequest,
  isProtectedEndpoint,
  getRateLimitType
} from '@/lib/security/admin-auth';

import { auditLog } from '@/lib/security/audit-logger';

/**
 * Configuración del middleware
 */
const SECURITY_CONFIG = {
  enableRateLimiting: process.env.NODE_ENV === 'production',
  enableAdminAuth: process.env.NODE_ENV === 'production',
  enableSecurityHeaders: true,
  logSuspiciousActivity: process.env.NODE_ENV === 'production'
};

/**
 * Rutas que deben ser excluidas del middleware
 */
const EXCLUDED_PATHS = [
  '/_next',
  '/static',
  '/favicon.ico',
  '/monitoring', // Sentry tunnel
];

/**
 * Verificar si la ruta debe ser procesada por el middleware
 */
function shouldProcessPath(pathname: string): boolean {
  return !EXCLUDED_PATHS.some(excluded => pathname.startsWith(excluded));
}

/**
 * Aplicar headers de seguridad
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  if (!SECURITY_CONFIG.enableSecurityHeaders) return response;

  const headers = response.headers;

  // Prevenir clickjacking
  headers.set('X-Frame-Options', 'DENY');
  
  // Prevenir MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection (legacy pero útil)
  headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (permitir micrófono y cámara, limitar otras features)
  headers.set('Permissions-Policy', 
    'camera=*, microphone=*, geolocation=(), interest-cohort=()'
  );

  // Content Security Policy (CSP)
  if (process.env.NODE_ENV === 'production') {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.sentry.io https://*.google.com https://*.googleapis.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
    
    headers.set('Content-Security-Policy', csp);
  }

  // HSTS (HTTP Strict Transport Security) - solo en producción
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

/**
 * Verificar rate limiting
 */
function checkRequestRateLimit(
  request: NextRequest,
  rateLimitType: RateLimitType
): { allowed: boolean; response?: NextResponse } {
  if (!SECURITY_CONFIG.enableRateLimiting) {
    return { allowed: true };
  }

  const identifier = getRequestIdentifier(request);
  const result = checkRateLimit(identifier, rateLimitType);

  if (!result.allowed) {
    const response = NextResponse.json(
      {
        error: 'Too Many Requests',
        message: result.blocked 
          ? 'You have been temporarily blocked due to excessive requests'
          : 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        timestamp: new Date().toISOString()
      },
      { status: 429 }
    );

    // Headers de rate limiting
    response.headers.set('X-RateLimit-Limit', '20');
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.resetTime.toString());
    response.headers.set('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());

    return { allowed: false, response };
  }

  return { allowed: true };
}

/**
 * Verificar autenticación para endpoints protegidos
 */
function checkAuthentication(request: NextRequest): { allowed: boolean; response?: NextResponse } {
  const pathname = request.nextUrl.pathname;

  // Si no es un endpoint protegido, permitir
  if (!isProtectedEndpoint(pathname)) {
    return { allowed: true };
  }

  // En desarrollo, permitir sin autenticación
  if (!SECURITY_CONFIG.enableAdminAuth) {
    return { allowed: true };
  }

  // Verificar autenticación
  const auth = verifyAdminRequest(request);

  if (!auth.authenticated) {
    const response = NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'This endpoint requires authentication',
        hint: 'Include a valid admin token in the Authorization header',
        timestamp: new Date().toISOString()
      },
      { 
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer realm="Admin API"'
        }
      }
    );

    return { allowed: false, response };
  }

  return { allowed: true };
}

/**
 * Detectar actividad sospechosa
 */
function detectSuspiciousActivity(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname;
  const userAgent = request.headers.get('user-agent') || '';

  // Patrones sospechosos
  const suspiciousPatterns = [
    /\.\./,           // Path traversal
    /\bselect\b/i,    // SQL injection
    /\bunion\b/i,     // SQL injection
    /<script/i,       // XSS
    /javascript:/i,   // XSS
    /\beval\(/i,      // Code injection
  ];

  // Verificar pathname
  if (suspiciousPatterns.some(pattern => pattern.test(pathname))) {
    return true;
  }

  // User agents sospechosos (bots maliciosos)
  const suspiciousUserAgents = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /masscan/i,
    /metasploit/i,
  ];

  if (suspiciousUserAgents.some(pattern => pattern.test(userAgent))) {
    return true;
  }

  return false;
}

/**
 * Middleware principal
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Excluir rutas que no necesitan procesamiento
  if (!shouldProcessPath(pathname)) {
    return NextResponse.next();
  }

  // 🔒 1. Detectar actividad sospechosa
  if (detectSuspiciousActivity(request)) {
    const ip = getRequestIdentifier(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (SECURITY_CONFIG.logSuspiciousActivity) {
      auditLog.suspiciousActivity(
        ip,
        userAgent,
        pathname,
        'Suspicious pattern detected in request'
      );
    }

    return NextResponse.json(
      { error: 'Forbidden', message: 'Suspicious activity detected' },
      { status: 403 }
    );
  }

  // 🔒 2. Verificar autenticación para endpoints protegidos
  const authCheck = checkAuthentication(request);
  if (!authCheck.allowed && authCheck.response) {
    // Log intento de acceso no autorizado
    const ip = getRequestIdentifier(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    auditLog.unauthorizedAccess(ip, userAgent, pathname);

    return applySecurityHeaders(authCheck.response);
  }

  // 🔒 3. Aplicar rate limiting
  const rateLimitType = getRateLimitType(pathname);
  const rateLimitCheck = checkRequestRateLimit(request, rateLimitType);
  if (!rateLimitCheck.allowed && rateLimitCheck.response) {
    // Log rate limit excedido
    const ip = getRequestIdentifier(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    auditLog.rateLimitExceeded(ip, userAgent, pathname);

    return applySecurityHeaders(rateLimitCheck.response);
  }

  // 🔒 4. Continuar con la request y aplicar headers de seguridad
  const response = NextResponse.next();
  return applySecurityHeaders(response);
}

/**
 * Configuración del matcher
 * Define qué rutas deben pasar por el middleware
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

