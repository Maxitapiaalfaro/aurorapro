"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles, Crown, Mail, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAgentVisualConfigSafe } from '@/config/agent-visual-config'
import type { AgentType } from '@/types/clinical-types'

// DialogContent personalizado sin el botón X
const CustomDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border-0 bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {/* Sin el botón X por defecto */}
    </DialogPrimitive.Content>
  </DialogPortal>
))
CustomDialogContent.displayName = DialogPrimitive.Content.displayName

interface PioneerCircleInvitationProps {
  isOpen: boolean;
  onClose: () => void;
  onResponse: (response: 'interested' | 'not_now' | 'not_interested') => void;
  userMetrics: {
    messageCount: number;
    sessionDuration: number;
  };
  currentAgent: string;
}

export function PioneerCircleInvitation({ 
  isOpen, 
  onClose, 
  onResponse, 
  userMetrics,
  currentAgent 
}: PioneerCircleInvitationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [email, setEmail] = useState('');

  // Evitar auto-focus en el modal de confirmación
  useEffect(() => {
    if (showConfirmation) {
      // Quitar focus de cualquier elemento activo
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  }, [showConfirmation]);

  const handleResponse = async (response: 'interested' | 'not_now' | 'not_interested') => {
    if (response === 'interested') {
      setShowContactForm(true);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Simular procesamiento
      await new Promise(resolve => setTimeout(resolve, 300));
      onResponse(response);
      onClose();
    } catch (error) {
      console.error('Error procesando respuesta:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Llamar al endpoint especializado de Pioneer Circle
      const response = await fetch('/api/pioneer-circle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          userMetrics: userMetrics,
          currentAgent: currentAgent,
          sessionId: `session-${Date.now()}`, // Generar sessionId temporal
          userId: `user-${Date.now()}` // Generar userId temporal
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al enviar datos');
      }

      const result = await response.json();
      console.log('✅ Pioneer Circle: Registro exitoso', result);
      
      // Mostrar confirmación
      setShowConfirmation(true);
      
    } catch (error) {
      console.error('❌ Error enviando datos del Pioneer Circle:', error);
      // En caso de error, mostrar confirmación de cualquier manera
      // para no romper la UX del usuario
      setShowConfirmation(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    // Ahora sí notificar al padre y cerrar
    onResponse('interested');
    onClose();
  };

  // Obtener configuración visual del agente
  const agentConfig = getAgentVisualConfigSafe(currentAgent as AgentType);
  const AgentIcon = agentConfig.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <CustomDialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
        {/* Header de la carta - solo mostrar en la pantalla inicial */}
        {!showConfirmation && !showContactForm && (
          <div className="bg-card px-6 py-4 border-b border-border">
            <div className="text-center">
              <DialogTitle className="text-sm font-medium text-gray-800 mb-0.5">
                De parte del Equipo HopeAI
              </DialogTitle>
              <p className="text-xs text-gray-500">
                Con profundo respeto y gratitud
              </p>
            </div>
          </div>
        )}

        {/* Contenido de la carta */}
        <div className="px-6 py-5 bg-white">
          {showConfirmation ? (
            /* Confirmación optimizada */
            <div className="text-center space-y-8" tabIndex={-1}>
              {/* Mensaje principal agrupado */}
              <div className="space-y-4">
                <p className="text-lg font-light text-gray-800">
                  Perfecto
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Nos pondremos en contacto contigo muy pronto
                </p>
              </div>

              {/* Botón de cierre */}
              <div className="text-center">
                <button
                  onClick={handleCloseConfirmation}
                  tabIndex={-1}
                  className="text-gray-700 hover:text-gray-800 font-medium bg-transparent hover:bg-gray-50 px-6 py-2 rounded-sm border-0 cursor-pointer focus:outline-none transition-all duration-200 text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : !showContactForm ? (
            <div>
              <div className="text-left space-y-3">
                <p className="text-gray-700 leading-snug text-sm">
                  Estimado/a colega,
                </p>
                
                <p className="text-gray-700 leading-snug text-sm">
                  <strong>Gracias</strong> por confiar en HopeAI para acompañar tu práctica clínica. 
                  Que dediques tu valioso tiempo a explorar esta herramienta significa todo para nosotros como equipo.
                </p>

                <p className="text-gray-700 leading-snug text-sm">
                  <strong>Nuestro sueño más profundo</strong> es crear algo que comprenda el peso de tus decisiones 
                  y la responsabilidad que sientes hacia cada persona que confía en ti.
                </p>

                <p className="text-gray-700 leading-snug text-sm">
                  Queremos construir contigo una herramienta que no solo responda preguntas, sino que <strong>entienda la profundidad de tu trabajo</strong> y te acompañe con la sabiduría que mereces.
                </p>

                <p className="text-gray-700 leading-snug text-sm">
                  Por ello, te ofrecemos <strong>acceso de por vida a HopeAI</strong>, y te invitamos a que puedas formar parte de este gran proyecto.
                </p>

                <div className="text-gray-700 leading-snug text-sm pt-2">
                  <p className="mb-2">Con gratitud,</p>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">Ps. Maximiliano Tapia</p>
                    <p className="text-xs text-gray-500 mt-0.5">Fundador y Desarrollador</p>
                    <p className="text-xs text-gray-400">HopeAI Team</p>
                  </div>
                </div>
              </div>

              {/* Botones de respuesta */}
              <div className="pt-4 text-center space-y-4">
                <button
                  onClick={() => handleResponse('interested')}
                  disabled={isLoading}
                  className="text-foreground hover:text-foreground font-medium bg-card hover:bg-secondary px-6 py-3 rounded border border-border hover:border-muted-foreground cursor-pointer focus:outline-none transition-all duration-200 shadow-sm text-sm"
                >
                  {isLoading ? 'Conectando...' : 'Quiero ser parte'}
                </button>

                <div className="text-center">
                  <button
                    onClick={() => handleResponse('not_interested')}
                    disabled={isLoading}
                    className="text-xs text-gray-400 hover:text-gray-600 bg-transparent border-0 p-0 cursor-pointer focus:outline-none"
                  >
                    tal vez más adelante
                  </button>
                </div>  
              </div>
            </div>
          ) : (
            /* Formulario ultra-minimalista */
            <div className="text-center">
              <form onSubmit={handleSubmitContact}>
                <div className="flex justify-center">
                  <div className="relative w-full max-w-xs">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu.email@ejemplo.com"
                      className="w-full py-3 pr-16 text-sm text-center border-0 border-b border-gray-300 bg-transparent focus:outline-none focus:border-gray-500 transition-colors placeholder:text-gray-400 placeholder:text-center"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="absolute right-0 bottom-3 text-xs font-medium text-gray-500 hover:text-gray-700 bg-transparent border-0 cursor-pointer focus:outline-none transition-colors disabled:opacity-50"
                    >
                      {isLoading ? '...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </CustomDialogContent>
    </Dialog>
  );
} 