import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 🔒 SEGURIDAD: Este endpoint solo está disponible en desarrollo
 * En producción, está deshabilitado para evitar contaminar logs de Sentry
 */
export function GET() {
  // 🔒 Bloquear en producción
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        error: 'Not Found',
        message: 'This endpoint is only available in development'
      },
      { status: 404 }
    );
  }

  // Solo en desarrollo: lanzar error de prueba
  class SentryExampleAPIError extends Error {
    constructor(message: string | undefined) {
      super(message);
      this.name = "SentryExampleAPIError";
    }
  }

  throw new SentryExampleAPIError("This error is raised on the backend called by the example page.");
}
