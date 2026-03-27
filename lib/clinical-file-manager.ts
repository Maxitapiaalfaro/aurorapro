import { aiFiles } from "./google-genai-config"
import { getStorageAdapter } from "./server-storage-adapter"
import type { ClinicalFile } from "@/types/clinical-types"

export class ClinicalFileManager {
  async uploadFile(file: File, sessionId: string, userId: string): Promise<ClinicalFile> {
    const storage = await getStorageAdapter()
    const clinicalFile: ClinicalFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date(),
      status: "uploading",
    }

    // Save initial file record
    await storage.saveClinicalFile({
      ...clinicalFile,
      sessionId,
    })

    try {
      // Update status to processing
      clinicalFile.status = "processing"
      await storage.saveClinicalFile({
        ...clinicalFile,
        sessionId,
      })

      // Upload to Google AI Files API (Google AI Studio client)
      const uploadResult = await aiFiles.files.upload({
        file: file,
        config: {
          mimeType: file.type,
          displayName: `clinical_${clinicalFile.id}`,
        }
      })

      // Validar que el resultado de upload contiene un nombre válido
      if (!uploadResult.name) {
        throw new Error('Upload result does not contain a valid file name')
      }

       // Update with Gemini file ID and URI for createPartFromUri
      // El SDK @google/genai devuelve un objeto File con name y uri
      // Para createPartFromUri necesitamos usar la propiedad uri, no name
      clinicalFile.geminiFileId = uploadResult.name  // Mantener para compatibilidad
      clinicalFile.geminiFileUri = uploadResult.uri   // URI real para createPartFromUri
      clinicalFile.status = "processing"

      await storage.saveClinicalFile({
        ...clinicalFile,
        sessionId,
      })

      // Esperar a que el archivo esté listo para usar
      try {
        await this.waitForFileToBeActive(uploadResult.name, 60000) // 60 segundos máximo
        clinicalFile.status = "processed"
        console.log(`[ClinicalFileManager] File processing completed: ${uploadResult.name}`)
      } catch (waitError) {
        console.error(`[ClinicalFileManager] File processing timeout or failed: ${uploadResult.name}`, waitError)
        clinicalFile.status = "error"
      }

      await storage.saveClinicalFile({
        ...clinicalFile,
        sessionId,
      })

      return clinicalFile
    } catch (error) {
      console.error("Error uploading file:", error)

      // Update status to error
      const storage = await getStorageAdapter()
      clinicalFile.status = "error"
      await storage.saveClinicalFile({
        ...clinicalFile,
        sessionId,
      })

      // Normalize common errors
      if (error instanceof Error) {
        const msg = error.message || ''
        if (/Vertex AI does not support uploading files/i.test(msg)) {
          throw new Error('Upload failed: Files API is not supported on Vertex. Using API-key client is required and has been configured. Please verify GOOGLE_AI_API_KEY permissions.')
        }
        if (/permission/i.test(msg) || /403/.test(msg)) {
          const e = new Error('Permission denied while uploading file')
          ;(e as any).code = 'PERMISSION_DENIED'
          throw e
        }
        if (/size/i.test(msg)) {
          const e = new Error('File size exceeds the allowed limit (10MB)')
          ;(e as any).code = 'FILE_TOO_LARGE'
          throw e
        }
      }

      throw error
    }
  }

  /**
   * Construye un índice ligero (resumen/outline/keywords) para uso de contexto
   * sin tener que adjuntar el archivo completo en cada turno.
   */
  async buildLightweightIndex(file: ClinicalFile): Promise<ClinicalFile> {
    try {
      // Para un MVP: crear un índice mínimo a partir del nombre/tipo
      // En producción: extraer primeras páginas o usar OCR/parseador
      const summary = `Documento: ${file.name} (${file.type || 'desconocido'})`
      const outline = `Resumen automático no intrusivo para ${file.name}`
      const keywords = [
        file.type?.split('/')?.[0] || 'documento',
        (file.name || '').split('.')?.slice(0, -1).join('.')
      ].filter(Boolean) as string[]

      const storage = await getStorageAdapter()
      const updated: ClinicalFile = { ...file, summary, outline, keywords }
      await storage.saveClinicalFile(updated)
      return updated
    } catch {
      return file
    }
  }

  async getFileInfo(geminiFileId: string): Promise<any> {
    try {
      return await aiFiles.files.get({ name: geminiFileId })
    } catch (error) {
      console.error("Error getting file info:", error)
      throw error
    }
  }

  async waitForFileToBeActive(geminiFileId: string, maxWaitTimeMs: number = 30000): Promise<any> {
    const startTime = Date.now()
    const pollInterval = 2000 // 2 segundos
    
    while (Date.now() - startTime < maxWaitTimeMs) {
      try {
        const fileInfo = await this.getFileInfo(geminiFileId)
        
        if (fileInfo.state === 'ACTIVE') {
          console.log(`[ClinicalFileManager] File is now ACTIVE: ${geminiFileId}`)
          return fileInfo
        }
        
        if (fileInfo.state === 'FAILED') {
          throw new Error(`File processing failed: ${geminiFileId}`)
        }
        
        console.log(`[ClinicalFileManager] File still processing: ${geminiFileId}, state: ${fileInfo.state}`)
        
        // Esperar antes del siguiente intento
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error) {
        console.error(`[ClinicalFileManager] Error checking file status: ${geminiFileId}`, error)
        throw error
      }
    }
    
    throw new Error(`File did not become ACTIVE within ${maxWaitTimeMs}ms: ${geminiFileId}`)
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const storage = await getStorageAdapter()
      const files = await storage.getClinicalFiles()
      const file = files.find((f: ClinicalFile) => f.id === fileId)

      if (file?.geminiFileId) {
        await aiFiles.files.delete({ name: file.geminiFileId })
      }

      // Remove from IndexedDB (implement delete method)
      // await clinicalStorage.deleteClinicalFile(fileId);
    } catch (error) {
      console.error("Error deleting file:", error)
      throw error
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  isValidClinicalFile(file: File): boolean {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/rtf",
      "text/plain",
      "text/markdown",
      "image/jpeg",
      "image/png",
      "image/gif",
    ]

    const maxSize = 10 * 1024 * 1024 // 10MB

    return allowedTypes.includes(file.type) && file.size <= maxSize
  }
}

/**
 * Crea un objeto `Part` para adjuntar a un prompt de `GenerativeModel`
 * a partir de una URI de archivo de Gemini.
 *
 * @param uri - La URI del archivo (p. ej., `files/nombre-del-archivo`).
 * @param mimeType - El tipo MIME del archivo.
 * @returns Un objeto `Part` compatible con la API.
 */
export function createPartFromUri(uri: string, mimeType: string) {
  return {
    fileData: {
      mimeType,
      fileUri: uri,
    },
  }
}

// Singleton instance
export const clinicalFileManager = new ClinicalFileManager()
