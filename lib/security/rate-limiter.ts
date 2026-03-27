/**
 * 🔒 RATE LIMITER - Protección contra abuse y ataques
 * 
 * Sistema de rate limiting basado en memoria para proteger APIs
 * sin necesidad de Redis en la versión inicial.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

interface RateLimitConfig {
  windowMs: number;      // Ventana de tiempo en ms
  maxRequests: number;   // Máximo de requests en la ventana
  blockDurationMs: number; // Duración del bloqueo si se excede
}

// Configuraciones por tipo de endpoint
export const RATE_LIMIT_CONFIGS = {
  // APIs públicas (más restrictivo)
  public: {
    windowMs: 60 * 1000,        // 1 minuto
    maxRequests: 20,             // 20 requests por minuto
    blockDurationMs: 5 * 60 * 1000 // Bloquear 5 minutos
  },
  
  // APIs de mensajes (moderado)
  messaging: {
    windowMs: 60 * 1000,        // 1 minuto
    maxRequests: 10,             // 10 mensajes por minuto
    blockDurationMs: 2 * 60 * 1000 // Bloquear 2 minutos
  },
  
  // APIs de archivos (restrictivo)
  upload: {
    windowMs: 60 * 1000,        // 1 minuto
    maxRequests: 5,              // 5 uploads por minuto
    blockDurationMs: 10 * 60 * 1000 // Bloquear 10 minutos
  },
  
  // APIs administrativas (muy restrictivo)
  admin: {
    windowMs: 60 * 1000,        // 1 minuto
    maxRequests: 5,              // 5 requests por minuto
    blockDurationMs: 30 * 60 * 1000 // Bloquear 30 minutos
  },
  
  // Health checks (permisivo)
  health: {
    windowMs: 10 * 1000,        // 10 segundos
    maxRequests: 10,             // 10 requests por 10 segundos
    blockDurationMs: 60 * 1000   // Bloquear 1 minuto
  }
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Limpiar entradas expiradas cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Verificar si un request está permitido
   */
  check(
    identifier: string,
    config: RateLimitConfig
  ): { allowed: boolean; remaining: number; resetTime: number; blocked?: boolean } {
    const now = Date.now();
    const key = identifier;
    
    let entry = this.store.get(key);

    // Si está bloqueado, verificar si ya pasó el tiempo de bloqueo
    if (entry?.blocked && entry.blockUntil) {
      if (now < entry.blockUntil) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.blockUntil,
          blocked: true
        };
      } else {
        // Desbloquear
        entry.blocked = false;
        entry.blockUntil = undefined;
        entry.count = 0;
        entry.resetTime = now + config.windowMs;
      }
    }

    // Si no existe o expiró la ventana, crear nueva entrada
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + config.windowMs,
        blocked: false
      };
      this.store.set(key, entry);
      
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: entry.resetTime
      };
    }

    // Incrementar contador
    entry.count++;

    // Si excede el límite, bloquear
    if (entry.count > config.maxRequests) {
      entry.blocked = true;
      entry.blockUntil = now + config.blockDurationMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.blockUntil,
        blocked: true
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }

  /**
   * Limpiar entradas expiradas
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.store.forEach((entry, key) => {
      // Eliminar si la ventana expiró y no está bloqueado
      if (now >= entry.resetTime && !entry.blocked) {
        keysToDelete.push(key);
      }
      // Eliminar si el bloqueo expiró
      if (entry.blocked && entry.blockUntil && now >= entry.blockUntil) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.store.delete(key));
  }

  /**
   * Obtener estadísticas
   */
  getStats(): { totalEntries: number; blockedEntries: number } {
    let blockedCount = 0;
    this.store.forEach(entry => {
      if (entry.blocked) blockedCount++;
    });

    return {
      totalEntries: this.store.size,
      blockedEntries: blockedCount
    };
  }

  /**
   * Limpiar todo (para testing)
   */
  reset(): void {
    this.store.clear();
  }

  /**
   * Destruir el rate limiter
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton global
let globalRateLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Helper para verificar rate limit
 */
export function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'public'
): { allowed: boolean; remaining: number; resetTime: number; blocked?: boolean } {
  const limiter = getRateLimiter();
  const config = RATE_LIMIT_CONFIGS[type];
  return limiter.check(identifier, config);
}

/**
 * Extraer identificador de request (IP o user ID)
 */
export function getRequestIdentifier(request: Request): string {
  // Intentar obtener IP real
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';
  
  // En producción, usar IP
  // En desarrollo, usar IP + user agent para mejor testing
  if (process.env.NODE_ENV === 'development') {
    const userAgent = request.headers.get('user-agent') || 'unknown';
    return `${ip}-${userAgent.substring(0, 20)}`;
  }
  
  return ip;
}

export default RateLimiter;

