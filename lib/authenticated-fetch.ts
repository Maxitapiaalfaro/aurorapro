/**
 * Authenticated fetch utility for client-side API calls.
 *
 * Wraps the native `fetch` to inject a Firebase Auth `Authorization: Bearer <token>`
 * header on every request to `/api/...` endpoints. This ensures production API routes
 * (which enforce auth via `verifyFirebaseAuth`) receive the token automatically.
 *
 * @module lib/authenticated-fetch
 */

import { auth } from '@/lib/firebase-config'


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

/**
 * Gets a fresh Firebase ID token for the current user.
 * Returns undefined if no user is signed in.
 */
async function getAuthToken(): Promise<string | undefined> {
  try {
    return await auth.currentUser?.getIdToken()
  } catch {
    logger.warn('[AuthFetch] Could not get auth token')
    return undefined
  }
}

/**
 * Fetch wrapper that automatically injects the Firebase Auth token.
 * Drop-in replacement for `fetch()` in client-side code.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const idToken = await getAuthToken()

  const headers = new Headers(init?.headers)

  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`)
  }

  return fetch(input, { ...init, headers })
}
