/**
 * Domain Evidence Dialog
 * 
 * Shows evidence (session quotes) for why a domain was identified
 * Allows therapist to validate or question the analysis
 * 
 * Phase 2A: Transparencia Activa
 */

"use client"

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ThumbsUp, ThumbsDown, MessageSquare, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ExploredDomain } from '@/lib/clinical-pattern-analyzer';

interface DomainEvidenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: ExploredDomain;
  domainLabel: string;
  onValidate: (agreed: boolean, domainType: string) => void;
  validation?: { agreed: boolean; timestamp: Date } | null;
}

export function DomainEvidenceDialog({
  open,
  onOpenChange,
  domain,
  domainLabel,
  onValidate,
  validation
}: DomainEvidenceDialogProps) {
  const [showingValidation, setShowingValidation] = useState(false);

  const handleValidation = (agreed: boolean) => {
    onValidate(agreed, domain.domain);
    setShowingValidation(true);
    
    // Auto-close after showing confirmation
    setTimeout(() => {
      setShowingValidation(false);
      onOpenChange(false);
    }, 1500);
  };

  const getFrequencyColor = (freq: string) => {
    switch (freq) {
      case 'high': return 'bg-serene-teal-100 dark:bg-serene-teal-900/30 text-serene-teal-800 dark:text-serene-teal-200 border-serene-teal-200 dark:border-serene-teal-700';
      case 'medium': return 'bg-clarity-blue-100 dark:bg-clarity-blue-900/30 text-clarity-blue-800 dark:text-clarity-blue-200 border-clarity-blue-200 dark:border-clarity-blue-700';
      case 'low': return 'bg-secondary text-muted-foreground border-border';
      default: return 'bg-secondary text-muted-foreground border-border';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <MessageSquare className="h-5 w-5 text-purple-600" />
            Evidencia: {domainLabel}
          </DialogTitle>
          <DialogDescription>
            Citas de tus sesiones que identificaron esta área terapéutica
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Domain Summary */}
          <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">Frecuencia:</span>
                <Badge variant="outline" className={`text-xs ${getFrequencyColor(domain.frequency)}`}>
                  {domain.frequency === 'high' && 'Alta'}
                  {domain.frequency === 'medium' && 'Media'}
                  {domain.frequency === 'low' && 'Baja'}
                </Badge>
              </div>
              <div className="text-xs text-gray-600">
                {domain.sessionCount} {domain.sessionCount === 1 ? 'sesión' : 'sesiones'} · {' '}
                {domain.techniques.length} {domain.techniques.length === 1 ? 'técnica' : 'técnicas'}
              </div>
            </div>
          </div>

          {/* Techniques Used */}
          {domain.techniques.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Técnicas identificadas:</h4>
              <div className="flex flex-wrap gap-2">
                {domain.techniques.map((tech, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Evidence Quotes */}
          <div>
            <h4 className="text-sm font-medium mb-3">
              Ejemplos de tus intervenciones ({domain.examples.length}):
            </h4>
            
            <ScrollArea className="h-64">
              <div className="space-y-3 pr-4">
                {domain.examples.map((example, idx) => (
                  <div 
                    key={idx}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2"
                  >
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>
                        {formatDistanceToNow(new Date(example.sessionDate), {
                          addSuffix: true,
                          locale: es
                        })}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-700 leading-relaxed italic">
                      "{example.therapistQuestion}"
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          {/* Validation Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              ¿Este análisis refleja tu enfoque terapéutico?
            </h4>

            {showingValidation ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-sm text-green-700 font-medium">
                  ✓ Gracias por tu validación. Esto mejora nuestro análisis.
                </p>
              </div>
            ) : validation ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  {validation.agreed ? '✓ Confirmaste' : '⚠️ Cuestionaste'} este análisis{' '}
                  {formatDistanceToNow(new Date(validation.timestamp), {
                    addSuffix: true,
                    locale: es
                  })}
                </p>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button
                  onClick={() => handleValidation(true)}
                  variant="outline"
                  className="flex-1 border-green-300 hover:bg-green-50 text-green-700"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Sí, de acuerdo
                </Button>
                <Button
                  onClick={() => handleValidation(false)}
                  variant="outline"
                  className="flex-1 border-orange-300 hover:bg-orange-50 text-orange-700"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Cuestiono esto
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

