import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { trackConversion } from '@/lib/enhanced-sentry-metrics-tracker'
import { getGlobalOrchestrationSystem } from '@/lib/orchestration-singleton'
import type { AgentType } from '@/types/clinical-types'

/**
 * Endpoint especializado para Pioneer Circle
 * Captura emails y métricas de usuarios interesados en el programa
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let requestBody: any

  try {
    requestBody = await request.json()
    const { email, userMetrics, currentAgent, sessionId, userId } = requestBody

    console.log('🌟 Pioneer Circle: Nueva solicitud recibida', {
      email: email.substring(0, 3) + '***', // Privacy protection
      userMetrics,
      currentAgent,
      sessionId,
      userId
    })

    // Validar datos requeridos
    if (!email || !userMetrics || !sessionId || !userId) {
      return NextResponse.json(
        { error: 'email, userMetrics, sessionId, y userId son requeridos' },
        { status: 400 }
      )
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      )
    }

    // 1. Capturar en Sentry como evento personalizado
    Sentry.addBreadcrumb({
      message: 'Pioneer Circle Registration',
      category: 'conversion',
      level: 'info',
      data: {
        email: email,
        messageCount: userMetrics.messageCount,
        sessionDuration: userMetrics.sessionDuration,
        currentAgent: currentAgent,
        sessionId: sessionId
      }
    })

    // 2. Usar el Enhanced Metrics Tracker para conversión
    try {
      trackConversion({
        userId: userId,
        sessionId: sessionId,
        eventType: 'pioneer_circle_registration',
        eventValue: 1,
        metadata: {
          email: email,
          agent_context: currentAgent,
          engagement_score: userMetrics.messageCount,
          session_length: userMetrics.sessionDuration,
          engagement_level: userMetrics.messageCount > 10 ? 'high' : 'medium',
          session_quality: userMetrics.sessionDuration > 300 ? 'quality' : 'standard'
        },
        timestamp: new Date()
      })
    } catch (metricsError) {
      console.warn('⚠️ Error en tracking de métricas:', metricsError)
    }

    // 3. Capturar como Sentry Event para dashboard
    Sentry.captureMessage('Pioneer Circle Registration Completed', {
      level: 'info',
      tags: {
        feature: 'pioneer_circle',
        conversion_type: 'email_capture',
        agent: currentAgent
      },
      extra: {
        user_email: email,
        user_metrics: userMetrics,
        session_context: {
          sessionId,
          userId,
          agent: currentAgent
        },
        registration_timestamp: new Date().toISOString()
      }
    })

    // 4. Log estructurado para análisis posterior
    console.log('✅ Pioneer Circle: Registro completado exitosamente', {
      userId,
      sessionId,
      agent: currentAgent,
      responseTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Registro en Pioneer Circle completado',
      data: {
        sessionId,
        timestamp: new Date().toISOString(),
        nextSteps: 'Te contactaremos muy pronto'
      }
    })

  } catch (error) {
    console.error('❌ Pioneer Circle Error:', error)
    
    // Capturar error en Sentry
    Sentry.captureException(error, {
      tags: {
        feature: 'pioneer_circle',
        operation: 'registration'
      },
      extra: {
        requestBody,
        responseTime: Date.now() - startTime
      }
    })

    return NextResponse.json(
      { 
        error: 'Error al procesar registro de Pioneer Circle',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
} 