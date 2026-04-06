import 'server-only'

import { getAdminAuthInstance } from '@/lib/firebase-admin-config'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

/**
 * Verifica un Firebase ID token extraído del header Authorization.
 *
 * Uso en API routes:
 * ```ts
 * const auth = await verifyFirebaseAuth(request)
 * if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: 401 })
 * const psychologistId = auth.uid
 * ```
 */

type AuthSuccess = { authenticated: true; uid: string }
type AuthFailure = { authenticated: false; error: string }
export type AuthResult = AuthSuccess | AuthFailure

export async function verifyFirebaseAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing or malformed Authorization header' }
  }

  const idToken = authHeader.slice(7) // Remove 'Bearer '

  try {
    const adminAuth = getAdminAuthInstance()
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    return { authenticated: true, uid: decodedToken.uid }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'
    logger.error('[Auth] Token verification failed:', message)
    return { authenticated: false, error: message }
  }
}
