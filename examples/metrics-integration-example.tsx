/**
 * Ejemplo de Integración del Sistema de Métricas
 * 
 * Demuestra cómo integrar el sistema de métricas de Sentry
 * en componentes de React para tracking automático.
 */

import React, { useState, useEffect } from 'react';
import { useSessionMetrics } from '@/hooks/use-session-metrics';
import type { AgentType } from '@/types/clinical-types';

// Ejemplo 1: Integración básica en interfaz de chat
interface ChatInterfaceWithMetricsProps {
  userId: string;
  initialAgent?: AgentType;
}

export function ChatInterfaceWithMetrics({ 
  userId, 
  initialAgent = 'socratico' 
}: ChatInterfaceWithMetricsProps) {
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [currentAgent, setCurrentAgent] = useState<AgentType>(initialAgent);
  const [messages, setMessages] = useState<Array<{ text: string; timestamp: Date }>>([]);
  const [isActive, setIsActive] = useState(true);

  // Integración del sistema de métricas
  const {
    startSession,
    endSession,
    updateActivity,
    trackAgentChange,
    getSessionStats
  } = useSessionMetrics({
    userId,
    sessionId,
    currentAgent,
    isActive
  });

  // Manejar envío de mensajes
  const handleSendMessage = async (messageText: string) => {
    try {
      // Actualizar actividad antes de enviar
      updateActivity();
      
      // Agregar mensaje a la lista local
      const newMessage = {
        text: messageText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
      
      // Enviar mensaje al API (que ya tiene métricas integradas)
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageText,
          sessionId
        })
      });
      
      if (!response.ok) {
        throw new Error('Error al enviar mensaje');
      }
      
      const data = await response.json();
      
      // Agregar respuesta del sistema
      setMessages(prev => [...prev, {
        text: data.response,
        timestamp: new Date()
      }]);
      
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    }
  };

  // Manejar cambio de agente
  const handleAgentChange = (newAgent: AgentType) => {
    const previousAgent = currentAgent;
    setCurrentAgent(newAgent);
    
    // El hook detectará automáticamente el cambio y registrará la métrica
    // Pero también podemos hacerlo manualmente si necesitamos más control
    trackAgentChange(previousAgent, newAgent);
  };

  // Obtener estadísticas de la sesión
  const [sessionStats, setSessionStats] = useState<{
    duration: number;
    messageCount: number;
    agentSwitches: number;
  } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const stats = getSessionStats();
      setSessionStats(stats);
    }, 10000); // Actualizar cada 10 segundos

    return () => clearInterval(interval);
  }, [getSessionStats]);

  // Manejar cierre de sesión
  const handleEndSession = () => {
    setIsActive(false);
    endSession();
  };

  return (
    <div className="chat-interface-with-metrics">
      {/* Header con información de sesión */}
      <div className="session-header">
        <h2>Chat con Métricas Integradas</h2>
        <div className="session-info">
          <span>Usuario: {userId}</span>
          <span>Sesión: {sessionId}</span>
          <span>Agente Activo: {currentAgent}</span>
          {sessionStats && (
            <span>
              Duración: {Math.floor(sessionStats.duration / 60)}m {sessionStats.duration % 60}s
            </span>
          )}
        </div>
      </div>

      {/* Selector de agente */}
      <div className="agent-selector">
        <label>Cambiar Agente:</label>
        <select 
          value={currentAgent} 
          onChange={(e) => handleAgentChange(e.target.value as AgentType)}
        >
          <option value="socratico">Supervisor Clínico</option>
                <option value="clinico">Especialista en Documentación</option>
          <option value="academico">Investigador Académico</option>
        </select>
      </div>

      {/* Área de mensajes */}
      <div className="messages-area">
        {messages.map((message, index) => (
          <div key={index} className="message">
            <span className="timestamp">
              {message.timestamp.toLocaleTimeString()}
            </span>
            <span className="text">{message.text}</span>
          </div>
        ))}
      </div>

      {/* Input de mensaje */}
      <MessageInput onSendMessage={handleSendMessage} />

      {/* Estadísticas de sesión */}
      {sessionStats && (
        <div className="session-stats">
          <h3>Estadísticas de Sesión</h3>
          <div>Mensajes enviados: {sessionStats.messageCount}</div>
          <div>Cambios de agente: {sessionStats.agentSwitches}</div>
          <div>Tiempo activo: {Math.floor(sessionStats.duration / 60)} minutos</div>
        </div>
      )}

      {/* Botón para finalizar sesión */}
      <button onClick={handleEndSession} className="end-session-btn">
        Finalizar Sesión
      </button>
    </div>
  );
}

// Componente auxiliar para input de mensajes
interface MessageInputProps {
  onSendMessage: (message: string) => void;
}

function MessageInput({ onSendMessage }: MessageInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="message-input">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escribe tu mensaje..."
        className="message-field"
      />
      <button type="submit" className="send-btn">
        Enviar
      </button>
    </form>
  );
}

// Ejemplo 2: Hook simplificado para casos básicos
export function SimpleChatComponent({ userId }: { userId: string }) {
  const sessionId = `simple-${Date.now()}`;
  
  // Uso simplificado del hook
  const { updateActivity } = useSessionMetrics({
    userId,
    sessionId,
    currentAgent: 'socratico',
    isActive: true
  });

  const handleUserInteraction = () => {
    // Actualizar actividad en cualquier interacción del usuario
    updateActivity();
  };

  return (
    <div onClick={handleUserInteraction}>
      {/* Componente simple que solo necesita tracking básico */}
      <p>Chat simple con métricas automáticas</p>
    </div>
  );
}

// Ejemplo 3: Integración con contexto de aplicación
import { createContext, useContext } from 'react';

interface MetricsContextType {
  userId: string;
  sessionId: string;
  currentAgent: AgentType;
  updateActivity: () => void;
  trackAgentChange: (from: AgentType, to: AgentType) => void;
}

const MetricsContext = createContext<MetricsContextType | null>(null);

export function MetricsProvider({ 
  children, 
  userId, 
  sessionId 
}: { 
  children: React.ReactNode;
  userId: string;
  sessionId: string;
}) {
  const [currentAgent, setCurrentAgent] = useState<AgentType>('socratico');
  
  const {
    updateActivity,
    trackAgentChange
  } = useSessionMetrics({
    userId,
    sessionId,
    currentAgent,
    isActive: true
  });

  const contextValue: MetricsContextType = {
    userId,
    sessionId,
    currentAgent,
    updateActivity,
    trackAgentChange
  };

  return (
    <MetricsContext.Provider value={contextValue}>
      {children}
    </MetricsContext.Provider>
  );
}

// Hook para usar el contexto de métricas
export function useMetricsContext() {
  const context = useContext(MetricsContext);
  if (!context) {
    throw new Error('useMetricsContext debe usarse dentro de MetricsProvider');
  }
  return context;
}

// Ejemplo de uso del contexto
export function ComponentWithMetricsContext() {
  const { updateActivity, currentAgent } = useMetricsContext();

  const handleClick = () => {
    updateActivity();
    // Lógica del componente...
  };

  return (
    <button onClick={handleClick}>
      Interactuar con {currentAgent}
    </button>
  );
}

// Estilos CSS básicos (opcional)
const styles = `
.chat-interface-with-metrics {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.session-header {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.session-info {
  display: flex;
  gap: 15px;
  margin-top: 10px;
  font-size: 0.9em;
  color: #666;
}

.agent-selector {
  margin-bottom: 20px;
}

.agent-selector select {
  margin-left: 10px;
  padding: 5px;
}

.messages-area {
  height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  padding: 15px;
  margin-bottom: 20px;
}

.message {
  margin-bottom: 10px;
  padding: 8px;
  background: #f9f9f9;
  border-radius: 4px;
}

.timestamp {
  font-size: 0.8em;
  color: #888;
  margin-right: 10px;
}

.message-input {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.message-field {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.send-btn {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.session-stats {
  background: #e9f7ef;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.end-session-btn {
  background: #dc3545;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
`;

// Exportar estilos para uso opcional
export { styles as metricsExampleStyles };