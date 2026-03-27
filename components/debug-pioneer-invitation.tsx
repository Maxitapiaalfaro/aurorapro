"use client"

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePioneerInvitation } from '@/hooks/use-pioneer-invitation'
import { useSessionMetrics } from '@/hooks/use-session-metrics'
import { Sparkles, Clock, MessageSquare, Target, Bug } from 'lucide-react'

interface DebugPioneerInvitationProps {
  userId: string;
  sessionId: string;
  currentAgent: string;
  currentMessageCount?: number;
}

export function DebugPioneerInvitation({ 
  userId, 
  sessionId, 
  currentAgent,
  currentMessageCount = 0
}: DebugPioneerInvitationProps) {
  const [debugVisible, setDebugVisible] = useState(false);

  // Hook de métricas de sesión para comparación
  const { getSessionStats } = useSessionMetrics({
    userId,
    sessionId,
    currentAgent: currentAgent as any,
    isActive: true
  });

  // Hook de invitación Pioneer
  const {
    shouldShowInvitation,
    invitationState,
    isEligible,
    eligibilityMetrics,
    markAsShown
  } = usePioneerInvitation({
    userId,
    sessionId,
    currentAgent: currentAgent as any,
    isActive: true,
    currentMessageCount
  });

  // Estado para debugging en tiempo real
  const [realTimeStats, setRealTimeStats] = useState<any>(null);

  // Actualizar stats en tiempo real
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = getSessionStats();
      setRealTimeStats(stats);
    }, 1000);

    return () => clearInterval(interval);
  }, [getSessionStats]);

  // Solo mostrar en development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatDurationFromSeconds = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (!debugVisible) {
    return (
      <div className="fixed bottom-4 left-4">
        <Button
          onClick={() => setDebugVisible(true)}
          variant="outline"
          size="sm"
          className="bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100"
        >
          <Bug className="h-4 w-4 mr-2" />
          Debug Pioneer
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <Card className="w-96 shadow-lg border-2 border-yellow-200 bg-yellow-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
              <Bug className="h-4 w-4" />
              Debug: Pioneer Circle Invitation
            </CardTitle>
            <Button
              onClick={() => setDebugVisible(false)}
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-yellow-600 hover:text-yellow-800"
            >
              ×
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4 text-xs">
          {/* Estado de la invitación */}
          <div>
            <div className="font-medium text-gray-800 mb-2">Estado de Invitación</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1">
                <Badge 
                  variant={shouldShowInvitation ? "default" : "secondary"}
                  className="text-xs"
                >
                  {shouldShowInvitation ? "✅ Mostrar" : "❌ No mostrar"}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Badge 
                  variant={isEligible ? "default" : "secondary"}
                  className="text-xs"
                >
                  {isEligible ? "✅ Elegible" : "❌ No elegible"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Métricas de elegibilidad */}
          <div>
            <div className="font-medium text-gray-800 mb-2">Métricas de Elegibilidad</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Mensajes:
                </span>
                <span className={eligibilityMetrics.messageCount > 2 ? "text-green-600 font-medium" : "text-gray-600"}>
                  {eligibilityMetrics.messageCount} &gt; 2
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Duración:
                </span>
                <span className={eligibilityMetrics.sessionDuration > (30 * 60 * 1000) ? "text-green-600 font-medium" : "text-gray-600"}>
                  {formatDuration(eligibilityMetrics.sessionDuration)} &gt; 30m
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Califica:
                </span>
                <span className={eligibilityMetrics.qualifiesForInvitation ? "text-green-600 font-medium" : "text-red-600"}>
                  {eligibilityMetrics.qualifiesForInvitation ? "SÍ" : "NO"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats en tiempo real del tracker */}
          {realTimeStats && (
            <div>
              <div className="font-medium text-gray-800 mb-2">Stats Sentry Tracker (Tiempo Real)</div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>Mensajes:</span>
                  <span className="font-mono">{realTimeStats.messageCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Duración:</span>
                  <span className="font-mono">{formatDurationFromSeconds(realTimeStats.duration)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cambios de agente:</span>
                  <span className="font-mono">{realTimeStats.agentSwitches}</span>
                </div>
              </div>
            </div>
          )}

          {/* Estado de persistencia */}
          <div>
            <div className="font-medium text-gray-800 mb-2">Estado de Persistencia</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span>Ya mostrada:</span>
                <Badge variant={invitationState.shown ? "destructive" : "default"} className="text-xs">
                  {invitationState.shown ? "SÍ" : "NO"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>Ya respondida:</span>
                <Badge variant={invitationState.responded ? "destructive" : "default"} className="text-xs">
                  {invitationState.responded ? "SÍ" : "NO"}
                </Badge>
              </div>
              {invitationState.response && (
                <div className="flex items-center justify-between">
                  <span>Respuesta:</span>
                  <Badge variant="outline" className="text-xs">
                    {invitationState.response}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Información de sesión */}
          <div>
            <div className="font-medium text-gray-800 mb-2">Info de Sesión</div>
            <div className="space-y-1 font-mono text-xs">
              <div>User: {userId}</div>
              <div>Session: {sessionId.substring(0, 12)}...</div>
              <div>Agent: {currentAgent}</div>
            </div>
          </div>

          {/* Botones de test */}
          <div className="pt-2 border-t space-y-2">
            <Button
              onClick={() => {
                // Limpiar localStorage para este usuario
                const storageKey = `hopeai_pioneer_invitation_${userId}`;
                localStorage.removeItem(storageKey);
                console.log('🧹 Estado de invitación reseteado para:', userId);
                window.location.reload(); // Recargar para aplicar cambios
              }}
              size="sm"
              variant="outline"
              className="w-full"
            >
              🧹 Resetear Estado
            </Button>
            
            <Button
              onClick={() => {
                console.log('🧪 Forzando mostrar invitación...');
                markAsShown();
              }}
              size="sm"
              className="w-full"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Forzar Test Invitación
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 