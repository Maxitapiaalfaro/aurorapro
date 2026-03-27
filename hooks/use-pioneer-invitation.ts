/**
 * Hook para gestión de invitaciones al Círculo de Pioneros
 * 
 * Detecta usuarios elegibles basado en criterios estratégicos de alto engagement:
 * - Más de 50 mensajes en la conversación actual, O
 * - Más de 20 conversaciones en el historial total del usuario
 * - No han visto la invitación previamente
 */

import { useEffect, useState, useCallback } from 'react';
import { useSessionMetrics } from './use-session-metrics';
import type { AgentType } from '@/types/clinical-types';

interface PioneerInvitationState {
  shown: boolean;
  responded: boolean;
  response: 'interested' | 'not_now' | 'not_interested' | null;
  shownAt?: Date;
  respondedAt?: Date;
}

interface UsePioneerInvitationProps {
  userId: string;
  sessionId: string;
  currentAgent?: AgentType;
  isActive?: boolean;
  currentMessageCount?: number; // Usar el count real de la sesión
  totalConversations?: number; // NUEVO: Inyección directa desde el contexto padre
}

interface PioneerInvitationReturn {
  shouldShowInvitation: boolean;
  invitationState: PioneerInvitationState;
  markAsShown: () => void;
  recordResponse: (response: 'interested' | 'not_now' | 'not_interested') => void;
  isEligible: boolean;
  eligibilityMetrics: {
    messageCount: number;
    sessionDuration: number;
    totalConversations: number;
    qualifiesForInvitation: boolean;
    criteriaMetDetails: {
      meetsMessageThreshold: boolean;
      meetsConversationThreshold: boolean;
    };
  };
}

const STORAGE_KEY_PREFIX = 'hopeai_pioneer_invitation_';
// NUEVOS CRITERIOS ESTRATÉGICOS DE ALTO ENGAGEMENT
const MESSAGES_IN_SESSION_THRESHOLD = 50; // 50 mensajes en conversación actual
const TOTAL_CONVERSATIONS_THRESHOLD = 20; // 20 conversaciones en historial

export function usePioneerInvitation({
  userId,
  sessionId,
  currentAgent = 'socratico',
  isActive = true,
  currentMessageCount = 0,
  totalConversations: injectedTotalConversations = 0 // Inyectar el total de conversaciones
}: UsePioneerInvitationProps): PioneerInvitationReturn {
  

  
  // Usar el hook de métricas existente
  const { getSessionStats } = useSessionMetrics({
    userId,
    sessionId,
    currentAgent,
    isActive
  });

  const [invitationState, setInvitationState] = useState<PioneerInvitationState>({
    shown: false,
    responded: false,
    response: null
  });

  const [eligibilityMetrics, setEligibilityMetrics] = useState({
    messageCount: 0,
    sessionDuration: 0,
    totalConversations: 0,
    qualifiesForInvitation: false,
    criteriaMetDetails: {
      meetsMessageThreshold: false,
      meetsConversationThreshold: false
    }
  });

  // Cargar estado persistido desde localStorage
  const loadInvitationState = useCallback(() => {
    try {
      const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        const parsed = JSON.parse(saved);
        setInvitationState({
          ...parsed,
          shownAt: parsed.shownAt ? new Date(parsed.shownAt) : undefined,
          respondedAt: parsed.respondedAt ? new Date(parsed.respondedAt) : undefined
        });
      }
    } catch (error) {
      console.error('❌ Error cargando estado de invitación:', error);
    }
  }, [userId]);

  // Guardar estado en localStorage
  const saveInvitationState = useCallback((state: PioneerInvitationState) => {
    try {
      const storageKey = `${STORAGE_KEY_PREFIX}${userId}`;
      localStorage.setItem(storageKey, JSON.stringify(state));
      setInvitationState(state);
    } catch (error) {
      console.error('❌ Error guardando estado de invitación:', error);
    }
  }, [userId]);

  // Evaluar elegibilidad basada en métricas de sesión y historial de conversaciones
  const evaluateEligibility = useCallback(() => {
    const stats = getSessionStats();
    
    // Usar el message count real de la sesión en lugar del tracker
    const messageCount = currentMessageCount;
    const sessionDuration = stats ? stats.duration * 1000 : 0; // Convertir de segundos a milisegundos
    const conversationCount = injectedTotalConversations; // Usar el total de conversaciones inyectado
    
    // NUEVOS CRITERIOS ESTRATÉGICOS:
    // 1. Al menos 50 mensajes en conversación actual, O
    // 2. Al menos 20 conversaciones en historial total
    const meetsMessageThreshold = messageCount >= MESSAGES_IN_SESSION_THRESHOLD;
    const meetsConversationThreshold = conversationCount >= TOTAL_CONVERSATIONS_THRESHOLD;
    const qualifiesForInvitation = meetsMessageThreshold || meetsConversationThreshold;

    setEligibilityMetrics({
      messageCount,
      sessionDuration,
      totalConversations: conversationCount,
      qualifiesForInvitation,
      criteriaMetDetails: {
        meetsMessageThreshold,
        meetsConversationThreshold
      }
    });

  }, [getSessionStats, userId, sessionId, currentMessageCount, injectedTotalConversations]);

  // Determinar si mostrar la invitación
  const shouldShowInvitation = 
    eligibilityMetrics.qualifiesForInvitation && 
    !invitationState.shown && 
    !invitationState.responded &&
    isActive;

  // Marcar invitación como mostrada
  const markAsShown = useCallback(() => {
    const newState: PioneerInvitationState = {
      ...invitationState,
      shown: true,
      shownAt: new Date()
    };
    saveInvitationState(newState);
    
    console.log('📋 Invitación Pioneer Circle marcada como mostrada:', {
      userId,
      sessionId,
      shownAt: newState.shownAt
    });
  }, [invitationState, saveInvitationState, userId, sessionId]);

  // Registrar respuesta del usuario
  const recordResponse = useCallback((response: 'interested' | 'not_now' | 'not_interested') => {
    const newState: PioneerInvitationState = {
      ...invitationState,
      responded: true,
      response,
      respondedAt: new Date()
    };
    saveInvitationState(newState);
    
    console.log('📝 Respuesta Pioneer Circle registrada:', {
      userId,
      sessionId,
      response,
      respondedAt: newState.respondedAt
    });
  }, [invitationState, saveInvitationState, userId, sessionId]);

  // Cargar estado al montar
  useEffect(() => {
    loadInvitationState();
  }, [loadInvitationState]);

  // Evaluar elegibilidad periódicamente
  useEffect(() => {
    if (!isActive) return;

    // Evaluación inicial
    evaluateEligibility();

    // Evaluación cada 30 segundos para capturar cambios en tiempo real
    // Especialmente importante para el conteo de mensajes en la sesión actual
    const interval = setInterval(evaluateEligibility, 30000);

    return () => clearInterval(interval);
  }, [isActive, evaluateEligibility]);

  // Efecto adicional para re-evaluar cuando cambie el conteo de conversaciones
  useEffect(() => {
    if (isActive && injectedTotalConversations !== undefined) {
      evaluateEligibility();
    }
  }, [isActive, injectedTotalConversations, evaluateEligibility]);

  return {
    shouldShowInvitation,
    invitationState,
    markAsShown,
    recordResponse,
    isEligible: eligibilityMetrics.qualifiesForInvitation,
    eligibilityMetrics
  };
}

// Hook simplificado para casos básicos
export function useBasicPioneerInvitation(userId: string, sessionId: string) {
  return usePioneerInvitation({
    userId,
    sessionId,
    currentAgent: 'socratico',
    isActive: true
  });
} 