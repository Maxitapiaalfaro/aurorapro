/**
 * Script para inicializar la base de datos SQLite HIPAA-compliant
 *
 * Ejecutar con: npx tsx scripts/init-database.ts
 */

// Cargar variables de entorno desde .env.local
import { config } from 'dotenv'
import { resolve } from 'path'

// Cargar .env.local
config({ path: resolve(process.cwd(), '.env.local') })

async function initializeDatabase() {
  console.log('🚀 Inicializando base de datos SQLite HIPAA-compliant...')
  console.log('🖥️ Entorno:', {
    hasWindow: typeof window !== 'undefined',
    nodeEnv: process.env.NODE_ENV,
    hasEncryptionKey: !!process.env.AURORA_ENCRYPTION_KEY
  })
  
  try {
    // Dynamic import para asegurar que se ejecuta en Node.js
    const { getStorageAdapter } = await import('../lib/server-storage-adapter')
    
    console.log('🔧 Obteniendo storage adapter...')
    const storage = await getStorageAdapter()
    
    console.log('🔧 Inicializando storage...')
    await storage.initialize()
    
    console.log('✅ Base de datos inicializada exitosamente')
    
    // Verificar que se creó el archivo
    const fs = await import('fs')
    const path = await import('path')
    const dbPath = path.join(process.cwd(), 'data', 'aurora-hipaa.db')
    
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath)
      console.log('✅ Archivo de base de datos creado:', dbPath)
      console.log('📊 Tamaño:', stats.size, 'bytes')
    } else {
      console.error('❌ Archivo de base de datos NO se creó')
    }
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error)
    process.exit(1)
  }
}

initializeDatabase()

