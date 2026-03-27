/**
 * 🔒 RESPONSE WATERMARKING SYSTEM
 * 
 * Sistema de marcado invisible de respuestas para protección de propiedad intelectual.
 * Inserta metadata invisible que permite rastrear el origen de contenido copiado.
 */

import * as Sentry from '@sentry/nextjs';

export interface WatermarkMetadata {
  sessionId: string;
  userId: string;
  timestamp: string;
  agentType: string;
  responseId: string;
  instanceId: string; // Identificador único de la instancia de HopeAI
}

/**
 * Genera un watermark invisible usando caracteres de ancho cero
 * Estos caracteres son invisibles pero preservados al copiar texto
 */
export function generateInvisibleWatermark(metadata: WatermarkMetadata): string {
  // Caracteres de ancho cero que son invisibles pero copiables
  const ZERO_WIDTH_CHARS = {
    '0': '\u200B', // Zero Width Space
    '1': '\u200C', // Zero Width Non-Joiner
    '2': '\u200D', // Zero Width Joiner
    '3': '\uFEFF', // Zero Width No-Break Space
  };

  // Codificar metadata en formato compacto
  const payload = JSON.stringify({
    s: metadata.sessionId.slice(0, 8), // Primeros 8 chars del sessionId
    u: metadata.userId.slice(0, 8),
    t: Date.now().toString(36), // Timestamp en base36
    a: metadata.agentType[0], // Primera letra del agente
    r: metadata.responseId.slice(0, 6),
    i: metadata.instanceId.slice(0, 6)
  });

  // Convertir a binario y luego a caracteres invisibles
  const binary = payload.split('').map(char => 
    char.charCodeAt(0).toString(2).padStart(8, '0')
  ).join('');

  // Convertir binario a caracteres de ancho cero (usando base 4)
  let watermark = '';
  for (let i = 0; i < binary.length; i += 2) {
    const twoDigits = binary.substr(i, 2);
    const digit = parseInt(twoDigits, 2).toString();
    watermark += ZERO_WIDTH_CHARS[digit as '0' | '1' | '2' | '3'];
  }

  return watermark;
}

/**
 * Inserta watermark invisible al inicio y final del texto
 */
export function watermarkResponse(
  responseText: string,
  metadata: WatermarkMetadata
): string {
  const watermark = generateInvisibleWatermark(metadata);
  
  // Insertar al inicio y final (redundancia)
  return `${watermark}${responseText}${watermark}`;
}

/**
 * Genera un ID único para esta instancia de HopeAI
 * Se genera una vez y se almacena en variable de entorno
 */
export function getInstanceId(): string {
  // En producción, esto debería venir de variable de entorno
  // Para desarrollo, generar uno temporal
  if (typeof window === 'undefined') {
    // Server-side
    return process.env.HOPEAI_INSTANCE_ID || 'dev-instance';
  } else {
    // Client-side - obtener del localStorage
    const stored = localStorage.getItem('hopeai_instance_id');
    if (stored) return stored;
    
    const newId = `client-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('hopeai_instance_id', newId);
    return newId;
  }
}

/**
 * Registra el uso de respuestas watermarked en Sentry
 * Permite rastrear si contenido copiado aparece en otros lugares
 */
export function logWatermarkedResponse(metadata: WatermarkMetadata): void {
  try {
    Sentry.addBreadcrumb({
      category: 'watermark',
      message: 'Response watermarked',
      level: 'info',
      data: {
        sessionId: metadata.sessionId,
        userId: metadata.userId,
        agentType: metadata.agentType,
        responseId: metadata.responseId,
        instanceId: metadata.instanceId,
        timestamp: metadata.timestamp
      }
    });
  } catch (error) {
    // Silently fail - watermarking no debe interrumpir el flujo
    console.warn('Failed to log watermark:', error);
  }
}

/**
 * Genera metadata completa para watermarking
 */
export function createWatermarkMetadata(
  sessionId: string,
  userId: string,
  agentType: string,
  responseId: string
): WatermarkMetadata {
  return {
    sessionId,
    userId,
    timestamp: new Date().toISOString(),
    agentType,
    responseId,
    instanceId: getInstanceId()
  };
}

/**
 * Wrapper principal para watermarking de respuestas
 */
export function protectResponse(
  responseText: string,
  sessionId: string,
  userId: string,
  agentType: string,
  responseId: string
): string {
  // Solo aplicar watermark en producción o si está explícitamente habilitado
  const shouldWatermark = 
    process.env.NODE_ENV === 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_WATERMARKING === 'true';

  if (!shouldWatermark) {
    return responseText;
  }

  const metadata = createWatermarkMetadata(sessionId, userId, agentType, responseId);
  logWatermarkedResponse(metadata);
  
  return watermarkResponse(responseText, metadata);
}

/**
 * Detectar si un texto contiene watermark de HopeAI
 * Útil para verificar si contenido fue copiado de nuestra plataforma
 */
export function detectWatermark(text: string): boolean {
  // Buscar caracteres de ancho cero
  const zeroWidthPattern = /[\u200B\u200C\u200D\uFEFF]/;
  return zeroWidthPattern.test(text);
}

/**
 * Extraer metadata de un watermark (si es posible)
 * Esto es complejo y puede no funcionar si el texto fue modificado
 */
export function extractWatermarkMetadata(text: string): Partial<WatermarkMetadata> | null {
  try {
    // Implementación simplificada - en producción sería más robusta
    const hasWatermark = detectWatermark(text);
    if (!hasWatermark) return null;

    // Por ahora, solo confirmamos que existe
    return {
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return null;
  }
}

export default {
  protectResponse,
  watermarkResponse,
  detectWatermark,
  extractWatermarkMetadata,
  createWatermarkMetadata,
  getInstanceId
};

