/**
 * Firebase Client SDK Configuration — Aurora
 *
 * Inicializa Firebase App, Auth y Firestore con persistencia offline nativa.
 *
 * Firestore utiliza `persistentLocalCache` + `persistentMultipleTabManager` para:
 * - Almacenar documentos en IndexedDB automáticamente (offline-first).
 * - Permitir que múltiples pestañas compartan el mismo cache sin conflictos.
 * - Funcionar completamente offline y sincronizar al recuperar conexión.
 *
 * Esto reemplaza la gestión manual de IndexedDB en `clinical-context-storage.ts`
 * y `patient-persistence.ts` (ver docs/architecture/data-layer-architecture-firestore.md §3.1).
 *
 * @module lib/firebase-config
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  type Firestore,
} from 'firebase/firestore'
import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

// ────────────────────────────────────────────────────────────────────────────
// Firebase Configuration
// Todas las claves son NEXT_PUBLIC_ porque el SDK de Firebase requiere
// configuración en el cliente. Estas claves son seguras de exponer:
// el acceso a datos se controla vía Firebase Auth + Security Rules (§2.5).
// ────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// ────────────────────────────────────────────────────────────────────────────
// Singleton Initialization
// `getApps().length` evita múltiples inicializaciones en hot-reload de Next.js.
// ────────────────────────────────────────────────────────────────────────────

let app: FirebaseApp
let auth: Auth
let db: Firestore

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp()
  }
  return initializeApp(firebaseConfig)
}

function initializeServices() {
  if (typeof window === 'undefined') {
    // Server-side: solo inicializamos la app (Firestore con persistencia
    // offline requiere el browser). El servidor usa firebase-admin en su lugar.
    app = getFirebaseApp()
    auth = getAuth(app)
    // Firestore sin persistencia offline para SSR/server contexts.
    // Se importa getFirestore dinámicamente para evitar que la persistencia
    // se active en server-side rendering.
    const { getFirestore } = require('firebase/firestore') as typeof import('firebase/firestore')
    db = getFirestore(app)
    return
  }

  app = getFirebaseApp()
  auth = getAuth(app)

  // ──────────────────────────────────────────────────────────────────────
  // Firestore con persistencia offline nativa (solo en el browser)
  //
  // `persistentLocalCache`:
  //   Almacena documentos en IndexedDB para acceso offline completo.
  //   Los queries y onSnapshot funcionan contra el cache local cuando
  //   no hay conexión, y sincronizan automáticamente al reconectar.
  //
  // `persistentMultipleTabManager`:
  //   Coordina el cache entre múltiples pestañas del mismo origen.
  //   Solo una pestaña mantiene la conexión WebSocket activa con Firestore,
  //   mientras las demás leen/escriben del cache compartido en IndexedDB.
  //
  // `CACHE_SIZE_UNLIMITED`:
  //   Desactiva la limpieza automática del cache. Para datos clínicos,
  //   preferimos no perder documentos cacheados por límites de espacio.
  // ──────────────────────────────────────────────────────────────────────
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    })
  } catch (error: unknown) {
    // Si Firestore ya fue inicializado (hot-reload), recuperar la instancia existente.
    // initializeFirestore lanza si se llama dos veces con la misma app.
    if (error instanceof Error && error.message.includes('already been called')) {
      const { getFirestore } = require('firebase/firestore') as typeof import('firebase/firestore')
      db = getFirestore(app)
    } else {
      logger.error('❌ [Firebase] Error inicializando Firestore:', error)
      throw error
    }
  }
}

initializeServices()

export { app, auth, db }
