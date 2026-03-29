import { GoogleGenAI } from "@google/genai"

// Load environment variables only on server side
if (typeof window === 'undefined') {
  require('dotenv').config()
}

// Resolve Google Auth options in server environments without relying on local file paths
function resolveGoogleAuthOptions(): Record<string, any> {
  // Prefer explicit JSON in env to avoid filesystem dependencies on Vercel
  const jsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GENAI_SERVICE_ACCOUNT_JSON
  if (jsonEnv) {
    try {
      const creds = JSON.parse(jsonEnv)
      if (creds && typeof creds === 'object') {
        if (typeof creds.private_key === 'string') {
          creds.private_key = creds.private_key.replace(/\\n/g, '\n')
        }
        console.log('[GenAI Config] Usando credenciales desde GOOGLE_APPLICATION_CREDENTIALS_JSON')
        return { credentials: creds }
      }
    } catch (e) {
      console.warn('[GenAI Config] JSON de credenciales inválido en env (GOOGLE_APPLICATION_CREDENTIALS_JSON)')
    }
  }

  // Support split env vars: email + private key
  const svcEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const svcKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  if (svcEmail && svcKey) {
    console.log('[GenAI Config] Usando credenciales desde GOOGLE_SERVICE_ACCOUNT_*')
    return {
      credentials: {
        client_email: svcEmail,
        private_key: svcKey.replace(/\\n/g, '\n'),
      }
    }
  }

  // As a last resort, use keyFilename only if the file exists at runtime
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (keyFilename) {
    try {
      const fs = require('fs') as typeof import('fs')
      if (fs.existsSync(keyFilename)) {
        console.log('[GenAI Config] Usando service account key file:', keyFilename)
        return { keyFilename }
      }
      console.warn(`[GenAI Config] Archivo de credenciales no encontrado: ${keyFilename}. Evitando rutas locales en Vercel.`)
    } catch {
      console.warn('[GenAI Config] No se pudo verificar keyFilename; evitando dependencia de filesystem.')
    }
  }

  // No explicit credentials found
  return {}
}

// Initialize Google Gen AI client with proper environment handling
function createGenAIClient(): GoogleGenAI {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // Browser environment - use NEXT_PUBLIC_GOOGLE_AI_API_KEY
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY ||
      ((window as any).__NEXT_DATA__?.env?.NEXT_PUBLIC_GOOGLE_AI_API_KEY || '');

    if (!apiKey) {
      throw new Error(
        'NEXT_PUBLIC_GOOGLE_AI_API_KEY no está configurada en el entorno del navegador. ' +
        'Asegúrate de definirla como variable de entorno pública en Vercel y de que esté disponible durante el build.'
      );
    }
    // Browser must use Gemini API via apiKey
    return new GoogleGenAI({ apiKey });
  } else {
    // Server environment: prefer Vertex AI when fully configured, otherwise fall back to API key.

    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const rawLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION;

    if (project && rawLocation) {
      // Vertex AI path — only entered when both project and location are set.
      const normalizeVertexLocation = (loc: string): string => {
        const trimmed = (loc || '').trim().toLowerCase();
        // Accept 'global' or patterns like 'us-central1', 'europe-west1', etc.
        const validPattern = /^(global|[a-z]+-[a-z]+[0-9])$/;
        if (!validPattern.test(trimmed)) {
          console.warn(`[GenAI] GOOGLE_CLOUD_LOCATION inválida: '${loc}'. Usando 'global' conforme guía Vertex AI.`);
          return 'global';
        }
        return trimmed;
      }

      const location = normalizeVertexLocation(rawLocation);
      const googleAuthOptions = resolveGoogleAuthOptions()
      const hasExplicitCreds = !!(googleAuthOptions.credentials || googleAuthOptions.keyFilename)

      if (hasExplicitCreds) {
        console.log('[GenAI Config] Using Vertex AI (server) with explicit credentials')
        return new GoogleGenAI({
          vertexai: true,
          project,
          location,
          googleAuthOptions,
          apiVersion: process.env.GENAI_API_VERSION || 'v1'
        });
      }
      // Vertex AI env vars are set but no credentials found — fall through to API key.
      console.warn('[GenAI Config] GOOGLE_CLOUD_PROJECT/GOOGLE_CLOUD_LOCATION set but no service account credentials found. Falling back to API key.')
    }

    // API key fallback for server (e.g. Vercel without Vertex AI credentials).
    const serverApiKey = process.env.GOOGLE_AI_API_KEY ||
      process.env.GENAI_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;

    if (serverApiKey) {
      console.log('[GenAI Config] Using Gemini API key (server fallback)')
      return new GoogleGenAI({ apiKey: serverApiKey });
    }

    throw new Error(
      'No se encontraron credenciales de Google AI en el servidor. ' +
      'Configure una de las siguientes variables en Vercel: ' +
      '1) GOOGLE_AI_API_KEY (recomendado para Gemini API), ' +
      '2) GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION + credenciales de service account (para Vertex AI).'
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
  const apiKeyServer = process.env.GOOGLE_AI_API_KEY || process.env.GENAI_API_KEY;
  const apiKeyBrowser = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;

  // Prefer server-side key when available; fall back to NEXT_PUBLIC if set
  const apiKey = typeof window === 'undefined' ? (apiKeyServer || apiKeyBrowser) : apiKeyBrowser;

  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY (or NEXT_PUBLIC_GOOGLE_AI_API_KEY) is required for Files API operations');
  }

  return new GoogleGenAI({ apiKey });
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
  model: "gemini-2.5-flash", // Default model (overridden per agent)
  temperature: 0.3, // Conservative for clinical recommendations
  topK: 40,
  topP: 0.95,
  thinkingConfig: {
    thinkingBudget: 0},
  maxOutputTokens: 35000,
  safetySettings: clinicalSafetySettings,
}
