/**
 * Demostración Práctica del Sistema de Métricas de Validación de Mercado
 * 
 * Este componente muestra cómo integrar el sistema de métricas mejorado
 * en una aplicación React real para validación de mercado.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMarketValidationMetrics } from '@/hooks/use-market-validation-metrics';
import {
  UserType,
  AgentType,
  EVENT_TYPES
} from '@/lib/enhanced-metrics-types';
import {
  TrendingUp,
  Users,
  Target,
  Heart,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  FileText,
  Zap
} from 'lucide-react';

interface MarketValidationDemoProps {
  userId?: string;
  userType?: UserType;
  currentAgent?: AgentType;
}

export function MarketValidationDemo({
  userId = 'demo-user-123',
  userType = 'new',
  currentAgent = 'socratico'
}: MarketValidationDemoProps) {
  
  // ==========================================
  // HOOK DE MÉTRICAS
  // ==========================================
  
  const {
    userIdentity,
    identifyCurrentUser,
    activationMetrics,
    trackUserActivation,
    isUserActivated,
    engagementMetrics,
    trackUserEngagement,
    updateEngagementActivity,
    valueMetrics,
    trackUserValue,
    retentionMetrics,
    analyzeUserRetention,
    trackConversionEvent,
    userAnalysis,
    refreshAnalysis,
    getMarketValidationData,
    isHighValueUser,
    userSegment
  } = useMarketValidationMetrics({
    userId,
    userType,
    currentAgent,
    enableAutoTracking: true,
    isActive: true
  });
  
  // ==========================================
  // ESTADO LOCAL
  // ==========================================
  
  const [messageCount, setMessageCount] = useState(0);
  const [documentsUploaded, setDocumentsUploaded] = useState(0);
  const [problemsSolved, setProblemsSolved] = useState(0);
  const [sessionStartTime] = useState(new Date());
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  // ==========================================
  // EFECTOS
  // ==========================================
  
  useEffect(() => {
    // Identificar usuario al cargar
    if (!userIdentity) {
      identifyCurrentUser({
        userId,
        userType,
        source: 'direct'
      });
    }
  }, [userIdentity, identifyCurrentUser, userId, userType]);
  
  useEffect(() => {
    // Actualizar análisis cada 30 segundos
    const interval = setInterval(() => {
      refreshAnalysis();
      analyzeUserRetention();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [refreshAnalysis, analyzeUserRetention]);
  
  // ==========================================
  // SIMULADORES DE ACCIONES
  // ==========================================
  
  const simulateSendMessage = () => {
    const newCount = messageCount + 1;
    setMessageCount(newCount);
    
    // Trackear primer mensaje
    if (newCount === 1) {
      const timeToFirst = (Date.now() - sessionStartTime.getTime()) / 1000;
      trackUserActivation({
        firstMessageSent: true,
        timeToFirstMessage: timeToFirst
      });
      
      trackConversionEvent({
        eventType: EVENT_TYPES.CONVERSION.FIRST_MESSAGE,
        eventValue: 1,
        metadata: { timeToFirst }
      });
    }
    
    // Actualizar engagement
    const sessionDuration = (Date.now() - sessionStartTime.getTime()) / 1000;
    trackUserEngagement({
      messagesPerSession: newCount,
      averageSessionDuration: sessionDuration,
      conversationDepth: newCount,
      preferredAgent: currentAgent
    });
    
    updateEngagementActivity();
  };
  
  const simulateUploadDocument = () => {
    const newCount = documentsUploaded + 1;
    setDocumentsUploaded(newCount);
    
    trackUserActivation({
      completedOnboarding: true
    });
    
    trackConversionEvent({
        eventType: EVENT_TYPES.CONVERSION.ACTIVATION,
        eventValue: 1,
        metadata: { documentCount: newCount }
      });
  };
  
  const simulateSolveProblem = () => {
    const newCount = problemsSolved + 1;
    setProblemsSolved(newCount);
    
    trackUserValue({
      longConversations: newCount,
      repeatUsage: newCount,
      sessionCompletionRate: 0.9,
      averageResponseSatisfaction: 4.5
    });
    
    trackConversionEvent({
        eventType: EVENT_TYPES.CONVERSION.ENGAGEMENT,
        eventValue: 1,
        metadata: { totalSolved: newCount }
      });
  };
  
  const simulateAgentSwitch = () => {
    const newAgent = currentAgent === 'socratico' ? 'clinico' : 'socratico';
    
    trackUserActivation({
      firstAgentSwitch: true
    });
    
    trackConversionEvent({
        eventType: EVENT_TYPES.AGENT.SWITCHED,
        eventValue: 1,
        metadata: { from: currentAgent, to: newAgent }
      });
  };
  
  // ==========================================
  // DATOS CALCULADOS
  // ==========================================
  
  const marketData = getMarketValidationData();
  const sessionDuration = Math.round((Date.now() - sessionStartTime.getTime()) / 1000 / 60); // minutos
  
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  const getScoreVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };
  
  // ==========================================
  // RENDER
  // ==========================================
  
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">🧪 Demo: Sistema de Métricas de Validación de Mercado</h1>
        <p className="text-muted-foreground">
          Demostración interactiva del sistema de métricas mejorado para HopeAI
        </p>
      </div>
      
      {/* Estado del Usuario */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Estado del Usuario
          </CardTitle>
          <CardDescription>
            Información básica y segmentación del usuario actual
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Usuario ID</p>
              <p className="font-mono text-sm">{userIdentity?.userId || 'No identificado'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Tipo</p>
              <Badge variant="outline">{userIdentity?.userType || 'unknown'}</Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Segmento</p>
              <Badge variant={isHighValueUser ? 'default' : 'secondary'}>
                {userSegment}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Sesión</p>
              <p className="text-sm">{sessionDuration} min</p>
            </div>
          </div>
          
          {isUserActivated && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                ¡Usuario activado! Ha completado las acciones clave para el onboarding.
              </AlertDescription>
            </Alert>
          )}
          
          {isHighValueUser && (
            <Alert className="mt-4">
              <Heart className="h-4 w-4" />
              <AlertDescription>
                Usuario de alto valor detectado. Engagement y valor excepcionales.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {/* Simuladores de Acciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Simuladores de Acciones
          </CardTitle>
          <CardDescription>
            Simula acciones del usuario para ver cómo se actualizan las métricas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={simulateSendMessage} className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Enviar Mensaje ({messageCount})
            </Button>
            <Button onClick={simulateUploadDocument} variant="outline" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Subir Documento ({documentsUploaded})
            </Button>
            <Button onClick={simulateSolveProblem} variant="outline" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Resolver Problema ({problemsSolved})
            </Button>
            <Button onClick={simulateAgentSwitch} variant="outline" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Cambiar Agente
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Métricas Principales */}
      <Tabs defaultValue="scores" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="activation">Activación</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="value">Valor</TabsTrigger>
        </TabsList>
        
        {/* Tab: Scores Generales */}
        <TabsContent value="scores" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Activación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${getScoreColor(marketData.activationScore)}`}>
                      {marketData.activationScore}%
                    </span>
                    <Badge variant={getScoreVariant(marketData.activationScore)}>
                      {marketData.activationScore >= 70 ? 'Activado' : 'Pendiente'}
                    </Badge>
                  </div>
                  <Progress value={marketData.activationScore} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${getScoreColor(marketData.engagementScore)}`}>
                      {marketData.engagementScore}%
                    </span>
                    <Badge variant={getScoreVariant(marketData.engagementScore)}>
                      {marketData.engagementScore >= 80 ? 'Alto' : marketData.engagementScore >= 50 ? 'Medio' : 'Bajo'}
                    </Badge>
                  </div>
                  <Progress value={marketData.engagementScore} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Valor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${getScoreColor(marketData.valueScore)}`}>
                      {marketData.valueScore}%
                    </span>
                    <Badge variant={getScoreVariant(marketData.valueScore)}>
                      {marketData.valueScore >= 70 ? 'Alto' : marketData.valueScore >= 50 ? 'Medio' : 'Bajo'}
                    </Badge>
                  </div>
                  <Progress value={marketData.valueScore} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Retención</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {marketData.retentionStatus === 'active' ? '✅' : 
                       marketData.retentionStatus === 'at_risk' ? '⚠️' : '❌'}
                    </span>
                    <Badge variant={
                      marketData.retentionStatus === 'active' ? 'default' :
                      marketData.retentionStatus === 'at_risk' ? 'secondary' : 'destructive'
                    }>
                      {marketData.retentionStatus === 'active' ? 'Activo' :
                       marketData.retentionStatus === 'at_risk' ? 'En Riesgo' : 'Churned'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {retentionMetrics?.daysSinceLastActivity || 0} días desde última actividad
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Tab: Activación */}
        <TabsContent value="activation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métricas de Activación</CardTitle>
              <CardDescription>
                Progreso del usuario en el proceso de onboarding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Primer mensaje</p>
                    <Badge variant={activationMetrics?.firstMessageSent ? 'default' : 'outline'}>
                      {activationMetrics?.firstMessageSent ? 'Completado' : 'Pendiente'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Tiempo hasta primer mensaje</p>
                    <p className="text-sm font-medium">
                      {activationMetrics?.timeToFirstMessage ? 
                        `${Math.round(activationMetrics.timeToFirstMessage)}s` : 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Mensajes en primera sesión</p>
                    <p className="text-sm font-medium">
                      {activationMetrics?.messagesInFirstSession || 0}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Agente cambiado</p>
                    <Badge variant={activationMetrics?.firstAgentSwitch ? 'default' : 'outline'}>
                      {activationMetrics?.firstAgentSwitch ? 'Sí' : 'No'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Score de activación</p>
                    <p className={`text-lg font-bold ${getScoreColor(activationMetrics?.activationScore || 0)}`}>
                      {activationMetrics?.activationScore || 0}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Engagement */}
        <TabsContent value="engagement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métricas de Engagement</CardTitle>
              <CardDescription>
                Nivel de interacción y compromiso del usuario
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Mensajes por sesión</p>
                  <p className="text-lg font-medium">{engagementMetrics?.messagesPerSession || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Duración promedio</p>
                  <p className="text-lg font-medium">
                    {engagementMetrics?.averageSessionDuration ? 
                      `${Math.round(engagementMetrics.averageSessionDuration / 60)}m` : '0m'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Profundidad conversación</p>
                  <p className="text-lg font-medium">{engagementMetrics?.conversationDepth || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Agente preferido</p>
                  <Badge variant="outline">{engagementMetrics?.preferredAgent || 'N/A'}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Cambios de agente</p>
                  <p className="text-lg font-medium">{engagementMetrics?.agentDiversity || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Score de engagement</p>
                  <p className={`text-lg font-bold ${getScoreColor(engagementMetrics?.engagementScore || 0)}`}>
                    {engagementMetrics?.engagementScore || 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Valor */}
        <TabsContent value="value" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métricas de Valor</CardTitle>
              <CardDescription>
                Valor percibido y generado por el usuario
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Problemas resueltos</p>
                  <p className="text-lg font-medium">{valueMetrics?.longConversations || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Documentos analizados</p>
                  <p className="text-lg font-medium">{valueMetrics?.repeatUsage || 0}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Tiempo ahorrado</p>
                  <p className="text-lg font-medium">
                    {valueMetrics?.sessionCompletionRate ?
                      `${Math.round(valueMetrics.sessionCompletionRate)}%` : '0%'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Satisfacción</p>
                  <p className="text-lg font-medium">
                    {valueMetrics?.averageResponseSatisfaction ?
                      `${valueMetrics.averageResponseSatisfaction.toFixed(1)}/5` : 'N/A'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">NPS</p>
                  <p className="text-lg font-medium">
                    {valueMetrics?.valueScore ?
                      `${Math.round(valueMetrics.valueScore)}/100` : 'N/A'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Score de valor</p>
                  <p className={`text-lg font-bold ${getScoreColor(valueMetrics?.valueScore || 0)}`}>
                    {valueMetrics?.valueScore || 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Recomendaciones */}
      {marketData.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recomendaciones de Mejora
            </CardTitle>
            <CardDescription>
              Sugerencias basadas en las métricas actuales del usuario
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {marketData.recommendations.map((recommendation, index) => (
                <Alert key={index}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{recommendation}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Datos Raw (para debugging) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Datos de Validación de Mercado (Debug)
          </CardTitle>
          <CardDescription>
            Vista técnica de todos los datos recopilados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setShowRecommendations(!showRecommendations)}
            variant="outline"
            size="sm"
          >
            {showRecommendations ? 'Ocultar' : 'Mostrar'} Datos Raw
          </Button>
          
          {showRecommendations && (
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="font-medium mb-2">Identidad del Usuario:</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(userIdentity, null, 2)}
                </pre>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Datos de Validación de Mercado:</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(marketData, null, 2)}
                </pre>
              </div>
              
              {userAnalysis && (
                <div>
                  <h4 className="font-medium mb-2">Análisis Completo:</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify(userAnalysis, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MarketValidationDemo;