import { NextRequest, NextResponse } from 'next/server'
import { HopeAISystemSingleton } from '@/lib/hopeai-system'
import { ClinicalFileManager } from '@/lib/clinical-file-manager'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const sessionId = formData.get('sessionId') as string
    const userId = formData.get('userId') as string
    
    if (!file || !sessionId || !userId) {
      return NextResponse.json(
        { error: 'file, sessionId y userId son requeridos' },
        { status: 400 }
      )
    }
    
    console.log('🔄 API: Subiendo documento...', {
      fileName: file.name,
      fileSize: file.size,
      sessionId,
      userId
    })

    // Early validation: type and size
    const fileManager = new ClinicalFileManager()
    if (!fileManager.isValidClinicalFile(file)) {
      const maxSizeMB = 10
      return NextResponse.json(
        {
          error: 'Tipo de archivo o tamaño inválido',
          details: {
            allowedTypes: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/rtf',
              'text/plain',
              'text/markdown',
              'image/jpeg',
              'image/png',
              'image/gif',
            ],
            maxSizeMB,
            received: { mimeType: file.type, sizeBytes: file.size },
          }
        },
        { status: 400 }
      )
    }
    
    // Use direct HopeAI System upload instead of orchestration
    const uploadedFile = await HopeAISystemSingleton.uploadDocument(
      sessionId,
      file,
      userId
    )
    
    console.log('✅ API: Documento subido exitosamente:', uploadedFile.id)
    
    return NextResponse.json({
      success: true,
      uploadedFile,
      message: `Documento "${file.name}" subido exitosamente`
    })
  } catch (error) {
    console.error('❌ API Error (Upload Document):', error)
    // Map common errors for clearer feedback
    const message = error instanceof Error ? error.message : 'Error desconocido'
    const code = (error as any)?.code || ''

    if (code === 'FILE_TOO_LARGE') {
      return NextResponse.json({ error: message }, { status: 413 })
    }
    if (code === 'PERMISSION_DENIED') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (/Vertex AI does not support uploading files/i.test(message)) {
      return NextResponse.json({
        error: 'Vertex no soporta files.upload; se usa cliente con API key para archivos. Verifique GOOGLE_AI_API_KEY.'
      }, { status: 500 })
    }

    return NextResponse.json(
      { 
        error: 'Error al subir documento',
        details: message
      },
      { status: 500 }
    )
  }
}