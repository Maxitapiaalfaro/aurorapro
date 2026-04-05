import 'server-only'

/**
 * Firebase Admin SDK — Server-side Singleton
 *
 * Initializes firebase-admin for server-side Firestore access.
 * Used by FirestoreStorageAdapter for persistent session storage.
 *
 * Credential resolution order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS_JSON env var (JSON string — Vercel-safe)
 * 2. Split env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL / FIREBASE_CLIENT_EMAIL
 *    + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / FIREBASE_PRIVATE_KEY
 * 3. Application Default Credentials (ADC) — works on GCP, Cloud Run, etc.
 *
 * @module lib/firebase-admin-config
 * @version 1.1.0 — Fix: support FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL env vars
 */

import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
} from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

// ---------------------------------------------------------------------------
// Use bracket notation for env vars to bypass Next.js webpack inlining.
// See google-genai-config.ts for rationale.
// ---------------------------------------------------------------------------
function env(name: string): string | undefined {
  return process.env[name] || undefined
}

/**
 * Resolve Firebase Admin credentials from environment variables.
 */
function resolveCredential() {
  // 1. Full JSON credentials (preferred for Vercel deployments)
  const jsonEnv =
    env('GOOGLE_APPLICATION_CREDENTIALS_JSON') ||
    env('FIREBASE_SERVICE_ACCOUNT_JSON') ||
    env('GENAI_SERVICE_ACCOUNT_JSON')
  if (jsonEnv) {
    try {
      const creds = JSON.parse(jsonEnv)
      if (creds && typeof creds === 'object' && creds.private_key) {
        creds.private_key = creds.private_key.replace(/\\n/g, '\n')
        console.log('[FirebaseAdmin] Using credentials from JSON env var')
        return cert(creds)
      }
    } catch {
      console.warn('[FirebaseAdmin] Invalid JSON in credentials env var')
    }
  }

  // 2. Split env vars (email + private key) — support both naming conventions
  const svcEmail =
    env('GOOGLE_SERVICE_ACCOUNT_EMAIL') ||
    env('FIREBASE_CLIENT_EMAIL')
  const svcKey =
    env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY') ||
    env('FIREBASE_PRIVATE_KEY')
  if (svcEmail && svcKey) {
    console.log('[FirebaseAdmin] Using credentials from split env vars')
    return cert({
      projectId: env('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || env('FIREBASE_PROJECT_ID') || '',
      clientEmail: svcEmail,
      privateKey: svcKey.replace(/\\n/g, '\n'),
    })
  }

  // 3. Application Default Credentials (GCP/Cloud Run/local gcloud auth)
  const isVercel = !!env('VERCEL') || !!env('VERCEL_ENV')
  if (isVercel) {
    console.warn(
      '[FirebaseAdmin] ⚠️ No explicit credentials found on Vercel! ' +
      'Set GOOGLE_APPLICATION_CREDENTIALS_JSON (full JSON) or ' +
      'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY. ' +
      'Falling back to ADC which will likely fail with PERMISSION_DENIED.'
    )
  }
  console.log('[FirebaseAdmin] Using Application Default Credentials')
  return applicationDefault()
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton — reuse across hot-reloads and API route invocations
// ────────────────────────────────────────────────────────────────────────────

let _app: App
let _db: Firestore

export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!
  }

  const projectId =
    env('NEXT_PUBLIC_FIREBASE_PROJECT_ID') ||
    env('FIREBASE_PROJECT_ID')

  _app = initializeApp({
    credential: resolveCredential(),
    projectId,
  })

  console.log(`✅ [FirebaseAdmin] App initialized (project: ${projectId || 'auto-detected'})`)
  return _app
}

/**
 * Returns the server-side Firestore instance (firebase-admin).
 * Safe to call multiple times — returns the singleton.
 */
export function getAdminFirestore(): Firestore {
  if (_db) return _db

  const app = getAdminApp()
  _db = getFirestore(app)
  return _db
}
