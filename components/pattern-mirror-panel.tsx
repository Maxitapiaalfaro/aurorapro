/**
 * Pattern Mirror Panel
 * 
 * Displays longitudinal clinical insights to help psychologists
 * recognize patterns in their therapeutic work.
 * 
 * Design Philosophy: "Silent Algorithm"
 * - Non-intrusive, elegant presentation
 * - Reflection-oriented, not directive
 * - Respects professional autonomy
 */

"use client"

import { useState, useEffect } from 'react';
import { usePatternMirror } from '@/hooks/use-pattern-mirror';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DomainEvidenceDialog } from '@/components/domain-evidence-dialog';
import { 
  Eye, 
  ThumbsUp, 
  ThumbsDown, 
  BarChart3, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageCircle,
  X,
  Search,
  RefreshCw
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ClinicalDomain, type ExploredDomain } from '@/lib/clinical-pattern-analyzer';

interface PatternMirrorPanelProps {
  patientId: string;
  patientName: string;
  onClose?: () => void;
  onGenerate?: () => Promise<void>;
  isGenerating?: boolean;
}

/**
 * Pattern Mirror Panel Component
 */
export function PatternMirrorPanel({ 
  patientId, 
  patientName,
  onClose,
  onGenerate,
  isGenerating = false
}: PatternMirrorPanelProps) {
  const {
    latestAnalysis,
    isLoading,
    error,
    loadLatestAnalysis,
    markAsViewed,
    markAsDismissed,
    submitFeedback
  } = usePatternMirror();

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  // Evidence Dialog state
  const [evidenceDialog, setEvidenceDialog] = useState<{
    open: boolean;
    domain: ExploredDomain | null;
  }>({ open: false, domain: null });
  
  // Domain validations
  const [domainValidations, setDomainValidations] = useState<Map<string, { agreed: boolean; timestamp: Date }>>(new Map());

  // Load analysis on mount
  useEffect(() => {
    loadLatestAnalysis(patientId);
  }, [patientId, loadLatestAnalysis]);

  // Mark as viewed when opened
  useEffect(() => {
    if (latestAnalysis && !latestAnalysis.viewedAt) {
      markAsViewed(latestAnalysis.analysisId);
    }
  }, [latestAnalysis, markAsViewed]);

  /**
   * Handle feedback submission
   */
  const handleFeedbackSubmit = async (helpful: boolean) => {
    if (!latestAnalysis) return;

    await submitFeedback(
      latestAnalysis.analysisId,
      helpful,
      feedbackComment || undefined
    );

    setFeedbackSubmitted(true);
    setTimeout(() => {
      setShowFeedback(false);
      setFeedbackComment('');
      setFeedbackSubmitted(false);
    }, 2000);
  };

  /**
   * Handle dismiss
   */
  const handleDismiss = async () => {
    if (!latestAnalysis) return;
    await markAsDismissed(latestAnalysis.analysisId);
    if (onClose) onClose();
  };

  /**
   * Open evidence dialog for a domain
   */
  const handleShowEvidence = (domain: ExploredDomain) => {
    setEvidenceDialog({ open: true, domain });
  };

  /**
   * Handle domain validation
   */
  const handleDomainValidation = async (agreed: boolean, domainType: string) => {
    const validation = {
      agreed,
      timestamp: new Date()
    };
    
    setDomainValidations(prev => new Map(prev).set(domainType, validation));
    
    // Save validation to storage
    if (latestAnalysis) {
      const { getPatternAnalysisStorage } = await import('@/lib/pattern-analysis-storage');
      const storage = getPatternAnalysisStorage();
      await storage.initialize();
      
      const updatedState = {
        ...latestAnalysis,
        domainValidations: Object.fromEntries(domainValidations.set(domainType, validation))
      };
      
      await storage.saveAnalysisState(updatedState);
    }
    
    console.log(`📊 [Análisis Longitudinal] Domain ${domainType} validated:`, agreed ? 'agreed' : 'questioned');
  };

  /**
   * Render domain label in Spanish
   */
  const getDomainLabel = (domain: ClinicalDomain): string => {
    const labels: Record<ClinicalDomain, string> = {
      [ClinicalDomain.COGNITIVE]: 'Cognitivo',
      [ClinicalDomain.BEHAVIORAL]: 'Conductual',
      [ClinicalDomain.EMOTIONAL]: 'Emocional',
      [ClinicalDomain.RELATIONAL]: 'Relacional',
      [ClinicalDomain.TRAUMA]: 'Trauma',
      [ClinicalDomain.EXISTENTIAL]: 'Existencial',
      [ClinicalDomain.SOMATIC]: 'Somático',
      [ClinicalDomain.SYSTEMIC]: 'Sistémico',
      [ClinicalDomain.DEVELOPMENTAL]: 'Desarrollista',
      [ClinicalDomain.IDENTITY]: 'Identidad'
    };
    return labels[domain] || domain;
  };

  /**
   * Get frequency badge color
   */
  const getFrequencyColor = (frequency: string): string => {
    switch (frequency) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  /**
   * Loading state
   */
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            Análisis Longitudinal
          </CardTitle>
          <CardDescription>
            Análisis del proceso terapéutico con {patientName}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
            <p className="text-sm text-gray-500">Cargando análisis...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  /**
   * Error state
   */
  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  /**
   * No analysis available
   */
  if (!latestAnalysis || !latestAnalysis.analysis) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            Análisis Longitudinal
          </CardTitle>
          <CardDescription>
            Análisis del proceso terapéutico con {patientName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto ring-1 ring-purple-100">
              <BarChart3 className="h-8 w-8 text-purple-600" />
            </div>
            <div className="space-y-2">
              <p className="font-sans text-sm font-medium text-gray-700">
                No hay análisis disponibles para este paciente
              </p>
              <p className="font-sans text-xs text-gray-500 max-w-sm mx-auto">
                Genera un nuevo análisis longitudinal para identificar patrones clínicos en el proceso terapéutico.
              </p>
            </div>
            {onGenerate && (
              <Button 
                onClick={onGenerate}
                disabled={isGenerating}
                className="mt-4 h-9 px-4 rounded-lg bg-gradient-to-r from-purple-600 via-purple-600 to-purple-500 hover:from-purple-700 hover:via-purple-600 hover:to-purple-600 text-white shadow-sm hover:shadow-md transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando análisis...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Generar Análisis
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const analysis = latestAnalysis.analysis;

  return (
    <div className="space-y-8">
      {/* Header - Clean & Professional */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-sans text-slate-800 tracking-tight">
              Análisis Longitudinal
            </h2>
            <p className="text-sm text-slate-600">
              {patientName} · {analysis.sessionCount} sesiones analizadas
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="h-1 w-1 rounded-full bg-slate-300"></div>
          <span>
            Generado el {new Date(analysis.analysisDate).toLocaleDateString('es-ES', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            })}
          </span>
        </div>
        
        {/* Action Button - Update Analysis */}
        {onGenerate && (
          <div className="pt-2">
            <Button 
              size="sm"
              onClick={onGenerate} 
              disabled={isGenerating}
              className="h-9 px-4 rounded-lg bg-gradient-to-r from-purple-600 via-purple-600 to-purple-500 hover:from-purple-700 hover:via-purple-600 hover:to-purple-600 text-white shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
            >
              {/* Subtle shine effect overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin relative z-10" />
                  <span className="font-sans font-medium text-white relative z-10">Generando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 relative z-10" />
                  <span className="font-sans font-medium text-white relative z-10">Actualizar Análisis</span>
                </>
              )}
            </Button>
          </div>
        )}
        
        <div className="h-px bg-gradient-to-r from-slate-200 via-slate-300 to-transparent"></div>
      </div>

      {/* Meta Insights - Contextual Overview First */}
      {analysis.meta && (analysis.meta.dominantApproach || analysis.meta.therapeuticStyle) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-sans text-slate-800">
              Contexto del proceso terapéutico
            </h3>
            <p className="text-xs text-slate-500">
              Observaciones generales sobre el enfoque utilizado
            </p>
          </div>
          
          <div className="grid gap-4">
            {analysis.meta.dominantApproach && (
              <div className="flex gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-medium text-slate-600">Enfoque dominante</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {analysis.meta.dominantApproach}
                  </p>
                </div>
              </div>
            )}
            {analysis.meta.therapeuticStyle && (
              <div className="flex gap-3">
                <div className="mt-0.5 h-6 w-6 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-medium text-slate-600">Estilo terapéutico</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {analysis.meta.therapeuticStyle}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Explored Areas - Clinical Cards */}
      {analysis.exploredDomains.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-sans text-slate-800">
              Áreas terapéuticas trabajadas
            </h3>
            <p className="text-sm text-slate-600">
              {analysis.exploredDomains.length} {analysis.exploredDomains.length === 1 ? 'eje' : 'ejes'} de trabajo identificados en el proceso
            </p>
          </div>

          <div className="grid gap-4">
            {analysis.exploredDomains.map((domain, idx) => (
              <Card key={idx} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="pt-6 space-y-4">
                  {/* Domain Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-base font-medium text-slate-800">
                          {getDomainLabel(domain.domain)}
                        </h4>
                        <Badge 
                          variant="outline" 
                          className={`text-xs font-normal ${getFrequencyColor(domain.frequency)}`}
                        >
                          {domain.frequency === 'high' && 'Frecuente'}
                          {domain.frequency === 'medium' && 'Moderado'}
                          {domain.frequency === 'low' && 'Ocasional'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        Presente en {domain.sessionCount} {domain.sessionCount === 1 ? 'sesión' : 'sesiones'}
                      </p>
                    </div>
                  </div>

                  {/* Techniques */}
                  {domain.techniques.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {domain.techniques.map((technique, techIdx) => (
                        <span 
                          key={techIdx} 
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-md border border-slate-200"
                        >
                          {technique}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Evidence Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleShowEvidence(domain)}
                      className="h-9 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 -ml-2"
                    >
                      <Search className="h-3.5 w-3.5 mr-2" />
                      Ver evidencia en sesiones ({domain.examples.length})
                    </Button>
                    {domainValidations.get(domain.domain) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Validado
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Supervisory Questions - Highlighted Section */}
      {analysis.reflectiveQuestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-lg font-sans text-slate-800">
                Preguntas de supervisión
              </h3>
              <p className="text-sm text-slate-600">
                Para profundizar la reflexión sobre el proceso
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {analysis.reflectiveQuestions.map((question, idx) => (
              <div 
                key={idx} 
                className="group relative bg-card border-2 border-academic-plum-200 dark:border-academic-plum-700 rounded-xl p-5 space-y-3 hover:border-academic-plum-300 dark:hover:border-academic-plum-600 hover:shadow-sm transition-all"
              >
                {/* Question Number Badge */}
                <div className="absolute -top-3 left-5 px-2.5 py-0.5 bg-indigo-600 text-white text-xs font-medium rounded-full">
                  {idx + 1}
                </div>
                
                <p className="text-[15px] text-slate-800 leading-relaxed font-medium pt-2">
                  {question.question}
                </p>
                
                {question.rationale && (
                  <div className="flex gap-2 pt-1">
                    <div className="h-px flex-1 bg-gradient-to-r from-indigo-100 to-transparent my-auto"></div>
                  </div>
                )}
                
                {question.rationale && (
                  <p className="text-xs text-slate-600 leading-relaxed italic">
                    {question.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Feedback Section - Minimal & Professional */}
      {!latestAnalysis.feedback && !feedbackSubmitted && (
        <div className="pt-8 border-t border-slate-200">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ¿Este análisis te resultó útil para tu práctica clínica?
            </p>
            
            {!showFeedback ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFeedback(true)}
                  className="flex-1 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Sí, útil
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFeedback(true)}
                  className="flex-1 border-slate-300 hover:bg-slate-100"
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Podría mejorar
                </Button>
              </div>
            ) : (
              <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Textarea
                  placeholder="Cuéntanos qué podría mejorar (opcional)"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  rows={3}
                  className="text-sm bg-white"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleFeedbackSubmit(true)}
                    className="bg-slate-800 hover:bg-slate-900"
                  >
                    Enviar feedback
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowFeedback(false)}
                    className="text-slate-600"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {feedbackSubmitted && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <p className="text-sm text-emerald-800">
            Gracias por tu retroalimentación. Esto nos ayuda a mejorar continuamente.
          </p>
        </div>
      )}

      {/* Evidence Dialog - Phase 2A: Active Transparency */}
      {evidenceDialog.domain && (
        <DomainEvidenceDialog
          open={evidenceDialog.open}
          onOpenChange={(open) => setEvidenceDialog({ open, domain: null })}
          domain={evidenceDialog.domain}
          domainLabel={getDomainLabel(evidenceDialog.domain.domain)}
          onValidate={handleDomainValidation}
          validation={domainValidations.get(evidenceDialog.domain.domain) || null}
        />
      )}
    </div>
  );
}

