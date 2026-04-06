import { NextRequest, NextResponse } from 'next/server'
import { academicMultiSourceSearch } from '@/lib/academic-multi-source-search'


import { createLogger } from '@/lib/logger'
const logger = createLogger('api')

/**
 * API Route para búsqueda académica con Parallel AI
 * 
 * Esta ruta se ejecuta SOLO en el servidor, evitando problemas de CORS
 * con la API de Parallel AI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, maxResults = 10, language = 'both', minTrustScore = 60 } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      )
    }

    logger.info('🧪 [API Academic Search] Ejecutando búsqueda con Parallel AI...', {
      query: query.substring(0, 50) + '...',
      maxResults,
      language,
      minTrustScore
    })

    const searchResults = await academicMultiSourceSearch.search({
      query,
      maxResults,
      language,
      minTrustScore
    })

    logger.info('🧪 [API Academic Search] Búsqueda completada:', {
      totalFound: searchResults.metadata.totalFound,
      fromParallelAI: searchResults.metadata.fromParallelAI,
      averageTrustScore: searchResults.metadata.averageTrustScore
    })

    return NextResponse.json({
      success: true,
      results: searchResults
    })

  } catch (error) {
    logger.error('❌ [API Academic Search] Error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to perform academic search',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

