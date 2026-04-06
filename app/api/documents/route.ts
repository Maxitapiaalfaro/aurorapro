
import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

import { NextRequest, NextResponse } from 'next/server'

// GET /api/documents - Retrieve documents for a session
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }
    
    logger.info('🔍 API: Retrieving documents for session:', sessionId)
    
    // Lazy import to avoid build-time issues
    const { HopeAISystemSingleton } = await import('@/lib/hopeai-system')
    
    // Get documents from session
    const documents = await HopeAISystemSingleton.getPendingFilesForSession(sessionId)
    
    logger.info('✅ API: Retrieved documents:', documents.length)
    
    return NextResponse.json({
      success: true,
      documents,
      count: documents.length
    })
  } catch (error) {
    logger.error('❌ API Error (Get Documents):', error)
    return NextResponse.json(
      { 
        error: 'Error retrieving documents',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// DELETE /api/documents - Remove a document from session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const fileId = searchParams.get('fileId')
    
    if (!sessionId || !fileId) {
      return NextResponse.json(
        { error: 'sessionId and fileId are required' },
        { status: 400 }
      )
    }
    
    logger.info('🗑️ API: Removing document:', { sessionId, fileId })
    
    // Lazy import to avoid build-time issues
    const { HopeAISystemSingleton } = await import('@/lib/hopeai-system')

    // Remove document from session
    await HopeAISystemSingleton.removeDocumentFromSession(sessionId, fileId)
    
    logger.info('✅ API: Document removed successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Document removed from session'
    })
  } catch (error) {
    logger.error('❌ API Error (Delete Document):', error)
    return NextResponse.json(
      { 
        error: 'Error removing document',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}