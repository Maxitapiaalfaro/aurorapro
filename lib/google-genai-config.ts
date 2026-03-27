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
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_GOOGLE_AI_API_KEY no está configurada en el entorno del navegador');
    }
    // Browser must use Gemini API via apiKey
    return new GoogleGenAI({ apiKey });
  } else {
    // Server environment - use Vertex AI with Google Cloud credentials
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const rawLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION; // fallback if provided

    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT no está configurada para Vertex AI en entorno de servidor');
    }
    if (!rawLocation) {
      throw new Error('GOOGLE_CLOUD_LOCATION no está configurada para Vertex AI en entorno de servidor');
    }

    // Fallback seguro: normalizar la ubicación para evitar valores inválidos
    const normalizeVertexLocation = (loc: string): string => {
      const trimmed = (loc || '').trim().toLowerCase();
      // Aceptar 'global' o patrones tipo 'us-central1', 'europe-west1', etc.
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
    if (!hasExplicitCreds) {
      throw new Error(
        'Credenciales de Google Cloud no configuradas para Vertex AI. ' +
        'Configure una de las siguientes opciones en Vercel: ' +
        '1) GOOGLE_APPLICATION_CREDENTIALS_JSON (contenido JSON del service account), ' +
        '2) GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, ' +
        '3) GOOGLE_APPLICATION_CREDENTIALS con una ruta válida en el runtime.'
      )
    }

    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      // Usar credenciales explícitas (JSON/env) o keyFilename sólo si existe
      googleAuthOptions,
      apiVersion: process.env.GENAI_API_VERSION || 'v1'
    });
  }
}

export const genAI = createGenAIClient()

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

export const aiFiles = createFilesClient()

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
