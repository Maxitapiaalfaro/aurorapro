import { NextRequest, NextResponse } from 'next/server'
import { aiFiles } from '@/lib/google-genai-config'
import * as Sentry from '@sentry/nextjs'

/**
 * API endpoint para transcribir audio usando Gemini API
 * 
 * Recibe un archivo de audio y lo transcribe usando el modelo Gemini
 * con soporte para múltiples formatos de audio.
 * 
 * Formatos soportados:
 * - WAV (audio/wav)
 * - MP3 (audio/mp3)
 * - WEBM (audio/webm)
 * - OGG (audio/ogg)
 * - FLAC (audio/flac)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Obtener el archivo de audio del FormData
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No se proporcionó archivo de audio' },
        { status: 400 }
      )
    }
    
    console.log('🎤 Transcribiendo audio:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
    })
    
    // Validar tipo de archivo (verificar que comience con un tipo válido)
    const validMimeTypes = [
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/webm',
      'audio/ogg',
      'audio/flac',
    ]
    
    const isValidType = validMimeTypes.some(type => audioFile.type.startsWith(type))
    
    if (!isValidType) {
      return NextResponse.json(
        { error: `Formato de audio no soportado: ${audioFile.type}` },
        { status: 400 }
      )
    }
    
    // Validar tamaño (30MB para permitir 10 minutos con compresión optimizada)
    // Estimación: ~2.5MB por minuto en WebM Opus 8kHz Mono = 25MB para 10 minutos
    const maxSize = 30 * 1024 * 1024 // 30MB (margen de seguridad)
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { error: 'El archivo de audio es demasiado grande (máximo 30MB / ~10 minutos)' },
        { status: 400 }
      )
    }
    
    // Subir archivo a Gemini Files API (Google AI Studio)
    const uploadResult = await aiFiles.files.upload({
      file: audioFile,
      config: {
        mimeType: audioFile.type,
        displayName: `voice_transcription_${Date.now()}`,
      }
    })
    
    console.log('✅ Archivo subido a Gemini:', uploadResult.name)
    
    // Esperar a que el archivo esté procesado con polling inteligente
    // Más frecuente al inicio (donde suele estar listo), más espaciado después
    let fileReady = false
    let attempts = 0
    const maxAttempts = 60
    
    while (!fileReady && attempts < maxAttempts) {
      const fileInfo = await aiFiles.files.get({ name: uploadResult.name! })
      
      if (fileInfo.state === 'ACTIVE') {
        fileReady = true
        break
      } else if (fileInfo.state === 'FAILED') {
        throw new Error('El procesamiento del archivo falló en Gemini')
      }
      
      // Polling inteligente: más rápido al inicio (cuando suele estar listo)
      const delay = attempts < 5 ? 200 : (attempts < 15 ? 500 : 1000)
      await new Promise(resolve => setTimeout(resolve, delay))
      attempts++
    }
    
    if (!fileReady) {
      throw new Error('Timeout esperando que el archivo esté listo')
    }
    
    console.log('✅ Archivo listo para transcripción')
    
    // Transcribir el audio usando Gemini (Google AI Studio client)
    const response = await aiFiles.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: uploadResult.mimeType || audioFile.type,
                fileUri: uploadResult.uri || '',
              }
            },
            {
              text: `Transcribe este audio a texto en español. Usa puntuación apropiada. Mantén términos clínicos correctos. Solo transcripción exacta, sin análisis.

Transcripción:`
            }
          ]
        }
      ],
      config: {
        temperature: 0.1, // Temperatura 0 = más rápido y determinístico
        maxOutputTokens: 4000, // Suficiente para 10 min de transcripción
        topP: 0.95,
        topK: 40,
      }
    })
    
    const transcript = response.text?.trim() || ''
    
    if (!transcript) {
      throw new Error('No se pudo obtener transcripción del audio')
    }
    
    console.log('✅ Transcripción completada:', {
      length: transcript.length,
      duration: Date.now() - startTime,
    })
    
    // Limpiar el archivo de Gemini de forma asíncrona (no bloquear respuesta)
    if (uploadResult.name) {
      aiFiles.files.delete({ name: uploadResult.name })
        .then(() => console.log('🗑️ Archivo temporal eliminado'))
        .catch(err => console.warn('No se pudo eliminar archivo temporal:', err))
    }
    
    // Tracking con Sentry
    Sentry.captureMessage('Voice transcription completed', {
      level: 'info',
      tags: {
        audio_type: audioFile.type,
        audio_size: Math.floor(audioFile.size / 1024) + 'kb',
      }
    })
    
    return NextResponse.json({
      success: true,
      transcript,
      metadata: {
        duration: Date.now() - startTime,
        audioSize: audioFile.size,
        audioType: audioFile.type,
      }
    })
    
  } catch (error) {
    console.error('❌ Error al transcribir audio:', error)
    
    Sentry.captureException(error, {
      tags: {
        context: 'transcribe-audio-api',
      }
    })
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido al transcribir'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
