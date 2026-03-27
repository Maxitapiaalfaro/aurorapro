# Configuración de credenciales Google Cloud en Vercel (Vertex AI)

Para evitar errores ENOENT por rutas locales (por ejemplo `C:\\Users\\...\\aurora-encryption-key.json`) en el runtime serverless de Vercel, configure las credenciales de Google Cloud mediante variables de entorno, sin depender de archivos.

## Opciones recomendadas

- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (recomendado)
  - Contenido completo del Service Account en formato JSON.
  - Copie el JSON del Service Account y péguelo como valor de esta variable en Vercel.
  - Si el `private_key` contiene `\n`, el sistema lo normaliza automáticamente.

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - Email del Service Account y clave privada.
  - En Vercel, pegue la clave privada y asegúrese de mantener los saltos de línea. Si su copy tiene `\n`, el sistema los convierte en saltos reales.

## Evite rutas de archivo

- No use `GOOGLE_APPLICATION_CREDENTIALS` apuntando a rutas locales del desarrollador (Windows/macOS). En Vercel, esas rutas no existen y causan `ENOENT`.
- La configuración del proyecto ahora prioriza credenciales por JSON/env y sólo usará `keyFilename` si el archivo existe en el runtime.

## Variables requeridas adicionales

- `GOOGLE_CLOUD_PROJECT` — ID del proyecto GCP.
- `GOOGLE_CLOUD_LOCATION` — Región Vertex AI (`us-central1`, `southamerica-west1`, o `global`).

## Verificación

- El módulo `lib/google-genai-config.ts` valida que existan credenciales válidas.
- En caso de falta de credenciales, el error sugerirá configurar una de las opciones anteriores.

## Ejemplo rápido (JSON)

1. En Vercel → Settings → Environment Variables:
   - Add: `GOOGLE_APPLICATION_CREDENTIALS_JSON` → pegue el contenido del JSON del Service Account.
   - Add: `GOOGLE_CLOUD_PROJECT` → `project-xxxxx`
   - Add: `GOOGLE_CLOUD_LOCATION` → `us-central1`
2. Deploy.

## Ejemplo rápido (email/clave)

1. En Vercel → Settings → Environment Variables:
   - Add: `GOOGLE_SERVICE_ACCOUNT_EMAIL` → `service-account@project.iam.gserviceaccount.com`
   - Add: `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` → pegue la clave privada completa.
   - Add: `GOOGLE_CLOUD_PROJECT` → `project-xxxxx`
   - Add: `GOOGLE_CLOUD_LOCATION` → `us-central1`
2. Deploy.