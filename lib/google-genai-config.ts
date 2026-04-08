
import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

import { GoogleGenAI } from "@google/genai"

// Load environment variables only on server side
if (typeof window === 'undefined') {
  require('dotenv').config()
}

// ---------------------------------------------------------------------------
// IMPORTANT: Use bracket notation (process.env['VAR']) instead of dot notation
// (process.env.VAR) for server-side env var access. Next.js webpack DefinePlugin
// replaces dot-notation process.env.NEXT_PUBLIC_* references with their BUILD-TIME
// values. If a var was added to Vercel AFTER the build, dot notation returns the
// stale (empty) build-time value. Bracket notation bypasses inlining and reads the
// real runtime value from the OS environment.
// ---------------------------------------------------------------------------

/**
 * Read an environment variable at RUNTIME, bypassing Next.js webpack inlining.
 * Falls back to dot-notation for NEXT_PUBLIC_ vars in the browser (where
 * inlining is the only way to access them).
 */
function env(name: string): string | undefined {
  // In the browser, process.env is not real — we must rely on webpack inlining
  // which only works for NEXT_PUBLIC_ vars via dot notation. But bracket access
  // on the build-time-replaced object still works for NEXT_PUBLIC_ vars.
  // On the server, bracket access reads the real runtime environment.
  return process.env[name] || undefined
}

// Resolve Google Auth options in server environments without relying on local file paths
function resolveGoogleAuthOptions(): Record<string, any> {
  // Prefer explicit JSON in env to avoid filesystem dependencies on Vercel
  const jsonEnv = env('GOOGLE_APPLICATION_CREDENTIALS_JSON') || env('GENAI_SERVICE_ACCOUNT_JSON')
  if (jsonEnv) {
    try {
      const creds = JSON.parse(jsonEnv)
      if (creds && typeof creds === 'object') {
        if (typeof creds.private_key === 'string') {
          creds.private_key = creds.private_key.replace(/\\n/g, '\n')
        }
        logger.error('[GenAI Config] Using credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON')
        return { credentials: creds }
      }
    } catch (e) {
      logger.error('[GenAI Config] Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON')
    }
  }

  // Support split env vars: email + private key
  const svcEmail = env('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const svcKey = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  if (svcEmail && svcKey) {
    logger.error('[GenAI Config] Using credentials from GOOGLE_SERVICE_ACCOUNT_*')
    return {
      credentials: {
        client_email: svcEmail,
        private_key: svcKey.replace(/\\n/g, '\n'),
      }
    }
  }

  // As a last resort, use keyFilename only if the file exists at runtime
  const keyFilename = env('GOOGLE_APPLICATION_CREDENTIALS')
  if (keyFilename) {
    try {
      const fs = require('fs') as typeof import('fs')
      if (fs.existsSync(keyFilename)) {
        logger.error('[GenAI Config] Using service account key file')
        return { keyFilename }
      }
    } catch {
      // ignore filesystem errors
    }
  }

  // No explicit credentials found
  return {}
}

// All env var names we check for a Gemini API key, in priority order
const API_KEY_VAR_NAMES = [
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GENAI_API_KEY',
  'GOOGLE_API_KEY',
  'NEXT_PUBLIC_GOOGLE_AI_API_KEY',
] as const

// Initialize Google Gen AI client with proper environment handling
function createGenAIClient(): GoogleGenAI {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Browser environment - use NEXT_PUBLIC_GOOGLE_AI_API_KEY (inlined at build time)
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY ||
      ((window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_GOOGLE_AI_API_KEY || '');

    if (!apiKey) {
      throw new Error(
        'NEXT_PUBLIC_GOOGLE_AI_API_KEY no está configurada en el entorno del navegador. ' +
        'Asegúrate de definirla como variable de entorno pública en Vercel y de que esté disponible durante el build.'
      );
    }
    return new GoogleGenAI({ apiKey });
  } else {
    // Server environment: prefer Vertex AI when fully configured, otherwise fall back to API key.
    // Use env() helper for ALL lookups to bypass webpack build-time inlining.

    const project = env('GOOGLE_CLOUD_PROJECT')
    const rawLocation = env('GOOGLE_CLOUD_LOCATION') || env('VERTEX_LOCATION')

    if (project && rawLocation) {
      // Vertex AI path — only entered when both project and location are set.
      const normalizeVertexLocation = (loc: string): string => {
        const trimmed = (loc || '').trim().toLowerCase();
        const validPattern = /^(global|[a-z]+-[a-z]+[0-9])$/;
        if (!validPattern.test(trimmed)) {
          logger.error(`[GenAI] Invalid GOOGLE_CLOUD_LOCATION: '${loc}'. Using 'global'.`);
          return 'global';
        }
        return trimmed;
      }

      const location = normalizeVertexLocation(rawLocation);
      const googleAuthOptions = resolveGoogleAuthOptions()
      const hasExplicitCreds = !!(googleAuthOptions.credentials || googleAuthOptions.keyFilename)

      if (hasExplicitCreds) {
        logger.error('[GenAI Config] Using Vertex AI (server) with explicit credentials')
        return new GoogleGenAI({
          vertexai: true,
          project,
          location,
          googleAuthOptions,
          apiVersion: env('GENAI_API_VERSION') || 'v1'
        });
      }
      logger.error('[GenAI Config] GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION set but no service account credentials found. Falling back to API key.')
    }

    // API key fallback for server (e.g. Vercel without Vertex AI credentials).
    // Check all common env var names via runtime bracket access.
    for (const varName of API_KEY_VAR_NAMES) {
      const key = env(varName)
      if (key) {
        logger.error(`[GenAI Config] Using Gemini API key from ${varName}`)
        return new GoogleGenAI({ apiKey: key });
      }
    }

    // Build-time fallback: In Vercel serverless functions the runtime process.env
    // may not contain user-defined env vars. However, next.config.mjs `env` block
    // resolves NEXT_PUBLIC_GOOGLE_AI_API_KEY at BUILD time from multiple var names
    // (GEMINI_API_KEY, GOOGLE_AI_API_KEY, etc.) and webpack inlines the value into
    // dot-notation references. Use dot notation here so webpack can replace it.
    // eslint-disable-next-line dot-notation
    const buildTimeKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY
    if (buildTimeKey) {
      logger.error('[GenAI Config] Using build-time inlined NEXT_PUBLIC_GOOGLE_AI_API_KEY (runtime env vars not available)')
      return new GoogleGenAI({ apiKey: buildTimeKey });
    }

    // Diagnostic: list which vars we checked
    const checked = API_KEY_VAR_NAMES.map(n => `${n}=${env(n) ? 'SET' : 'MISSING'}`).join(', ')
    logger.error(`[GenAI Config] DIAGNOSTIC — env vars checked: ${checked}`)

    // Extended diagnostics to help identify configuration issues
    const envKeys = Object.keys(process.env)
    logger.error(`[GenAI Config] DIAGNOSTIC — total env vars available: ${envKeys.length}`)
    logger.error(`[GenAI Config] DIAGNOSTIC — NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}, VERCEL_ENV=${process.env.VERCEL_ENV ?? 'undefined'}, NEXT_RUNTIME=${process.env.NEXT_RUNTIME ?? 'undefined'}`)
    const relatedVars = envKeys
      .filter(k => /GOOGLE|GEMINI|GENAI|API_KEY/i.test(k))
      .join(', ')
    logger.error(`[GenAI Config] DIAGNOSTIC — env vars matching GOOGLE/GEMINI/GENAI/API_KEY: ${relatedVars || 'NONE'}`)

    // Broader search: any env var that looks like it could be an API credential
    const credentialVars = envKeys
      .filter(k => /KEY|API|TOKEN|SECRET|CREDENTIAL|AUTH|AI|GCP|CLOUD/i.test(k))
      .join(', ')
    logger.error(`[GenAI Config] DIAGNOSTIC — env vars matching KEY/API/TOKEN/SECRET/AI/GCP/CLOUD: ${credentialVars || 'NONE'}`)

    // List all non-system env var names (names only, not values) for debugging.
    // Heuristic filter — may not catch all system vars in every environment.
    const systemPrefixes = ['npm_', 'NODE_', 'NVM_', 'HOSTNAME', 'HOME', 'USER', 'PATH', 'LANG', 'TERM', 'SHELL', 'SHLVL', 'PWD', 'OLDPWD', '_']
    const customVars = envKeys
      .filter(k => !systemPrefixes.some(prefix => k.startsWith(prefix)) && k === k.toUpperCase())
      .join(', ')
    logger.error(`[GenAI Config] DIAGNOSTIC — custom env var names: ${customVars || 'NONE'}`)

    throw new Error(
      'No se encontraron credenciales de Google AI en el servidor. ' +
      'Configure una de las siguientes variables en Vercel (Settings → Environment Variables → Production): ' +
      API_KEY_VAR_NAMES.join(', ') + '. ' +
      'IMPORTANTE: Después de agregar la variable, haga un nuevo deploy para que tome efecto.'
    );
  }
}

function createLazyClient<T extends object>(factory: () => T): T {
  let instance: T | null = null

  const instantiate = (): T => {
    if (instance === null) {
      instance = factory()
    }
    return instance
  }

  const handler: ProxyHandler<object> = {
    get(_target, prop, receiver) {
      const realInstance = instantiate()
      const value = Reflect.get(realInstance, prop, receiver)
      return typeof value === 'function' ? value.bind(realInstance) : value
    },
    set(_target, prop, value) {
      const realInstance = instantiate()
      return Reflect.set(realInstance, prop, value)
    },
    has(_target, prop) {
      const realInstance = instantiate()
      return Reflect.has(realInstance, prop)
    },
    ownKeys(_target) {
      const realInstance = instantiate()
      return Reflect.ownKeys(realInstance)
    },
    getOwnPropertyDescriptor(_target, prop) {
      const realInstance = instantiate()
      return Reflect.getOwnPropertyDescriptor(realInstance, prop)
    },
    apply(_target, thisArg, args) {
      const realInstance = instantiate()
      return Reflect.apply(realInstance as any, thisArg, args)
    },
    construct(_target, args, newTarget) {
      const realInstance = instantiate()
      return Reflect.construct(realInstance as any, args, newTarget)
    }
  }

  return new Proxy({}, handler) as T
}

export const genAI = createLazyClient(createGenAIClient)

// Export the ai instance for the new SDK API
export const ai = genAI

// ---------------------------------------------------------------------------
// Files API client (Google AI Studio) - used for local file uploads
// Vertex does not support files.upload; we use an API-key client for files
// ---------------------------------------------------------------------------

function createFilesClient(): GoogleGenAI {
  // Always use API key-based client for Files API (both browser and server)
  // Use runtime env() helper on server to bypass webpack inlining
  if (typeof window === 'undefined') {
    // Server: try all common API key var names at runtime
    for (const varName of API_KEY_VAR_NAMES) {
      const key = env(varName)
      if (key) {
        return new GoogleGenAI({ apiKey: key });
      }
    }
    // Build-time fallback (see createGenAIClient for explanation)
    // eslint-disable-next-line dot-notation
    const buildTimeKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY
    if (buildTimeKey) {
      return new GoogleGenAI({ apiKey: buildTimeKey });
    }
    throw new Error('GOOGLE_AI_API_KEY (or GEMINI_API_KEY / NEXT_PUBLIC_GOOGLE_AI_API_KEY) is required for Files API operations');
  } else {
    // Browser: use build-time inlined NEXT_PUBLIC var
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_GOOGLE_AI_API_KEY is required for Files API operations in the browser');
    }
    return new GoogleGenAI({ apiKey });
  }
}

export const aiFiles = createLazyClient(createFilesClient)

// Clinical safety settings for healthcare applications
export const clinicalSafetySettings = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
]

// Model configuration for clinical use (base config - model set individually per agent)
export const clinicalModelConfig = {
  model: "gemini-3.1-flash-lite-preview", // Default model (overridden per agent)
  temperature: 1.0, // Updated for new model
  topK: 40,
  topP: 0.95,
  thinkingConfig: {
    thinkingLevel: 'low'
  },
  maxOutputTokens: 35000,
  safetySettings: clinicalSafetySettings,
}
