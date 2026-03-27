"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Mic, Settings, Volume2, AlertCircle, CheckCircle } from 'lucide-react'
import { useSpeechToText } from '@/hooks/use-speech-to-text'

/**
 * Componente de Configuración de Voz para HopeAI
 * 
 * Permite a los usuarios configurar:
 * - Idioma de reconocimiento
 * - Umbral de confianza
 * - Modo continuo vs manual
 * - Prueba de micrófono
 * 
 * @author Arquitecto Principal de Sistemas de IA (A-PSI)
 * @version 1.0.0
 */

interface VoiceSettingsProps {
  onSettingsChange?: (settings: VoiceSettingsConfig) => void
  className?: string
}

interface VoiceSettingsConfig {
  language: string
  confidenceThreshold: number
  continuousMode: boolean
  interimResults: boolean
}

const SUPPORTED_LANGUAGES = [
  { code: 'es-CL', name: 'Español (Chile)', flag: '🇨🇱' },
  { code: 'es-ES', name: 'Español (España)', flag: '🇪🇸' },
  { code: 'es-MX', name: 'Español (México)', flag: '🇲🇽' },
  { code: 'es-AR', name: 'Español (Argentina)', flag: '🇦🇷' },
  { code: 'es-CO', name: 'Español (Colombia)', flag: '🇨🇴' },
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
  { code: 'it-IT', name: 'Italiano', flag: '🇮🇹' },
  { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' }
]

export function VoiceSettings({ onSettingsChange, className }: VoiceSettingsProps) {
  const [settings, setSettings] = useState<VoiceSettingsConfig>({
    language: 'es-CL',
    confidenceThreshold: 0.7,
    continuousMode: true,
    interimResults: true
  })

  const [isTestingMic, setIsTestingMic] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  // Hook para prueba de micrófono
  const {
    isListening,
    isSupported,
    isMicrophoneAvailable,
    transcript,
    confidence,
    error,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechToText({
    language: settings.language,
    confidenceThreshold: settings.confidenceThreshold,
    continuous: settings.continuousMode,
    interimResults: settings.interimResults
  })

  const handleSettingChange = <K extends keyof VoiceSettingsConfig>(
    key: K,
    value: VoiceSettingsConfig[K]
  ) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    onSettingsChange?.(newSettings)
  }

  const handleMicTest = async () => {
    if (isListening) {
      stopListening()
      setIsTestingMic(false)
      return
    }

    setIsTestingMic(true)
    setTestResult(null)
    resetTranscript()
    
    try {
      startListening()
      
      // Auto-stop después de 5 segundos
      setTimeout(() => {
        if (isListening) {
          stopListening()
          setIsTestingMic(false)
          setTestResult(transcript ? 'success' : 'error')
        }
      }, 5000)
    } catch (err) {
      setTestResult('error')
      setIsTestingMic(false)
    }
  }

  const getStatusBadge = () => {
    if (!isSupported) {
      return <Badge variant="destructive">No Soportado</Badge>
    }
    if (!isMicrophoneAvailable) {
      return <Badge variant="destructive">Sin Micrófono</Badge>
    }
    if (error) {
      return <Badge variant="destructive">Error</Badge>
    }
    if (isListening) {
      return <Badge variant="default" className="bg-red-500">Grabando</Badge>
    }
    return <Badge variant="secondary">Listo</Badge>
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configuración de Voz
        </CardTitle>
        <CardDescription>
          Configura el reconocimiento de voz para una experiencia óptima
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Estado del Sistema */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            <span className="text-sm font-medium">Estado del Sistema</span>
          </div>
          {getStatusBadge()}
        </div>

        {/* Selección de Idioma */}
        <div className="space-y-2">
          <Label htmlFor="language">Idioma de Reconocimiento</Label>
          <Select
            value={settings.language}
            onValueChange={(value) => handleSettingChange('language', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un idioma" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <div className="flex items-center gap-2">
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Umbral de Confianza */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="confidence">Umbral de Confianza</Label>
            <span className="text-sm text-gray-600">
              {Math.round(settings.confidenceThreshold * 100)}%
            </span>
          </div>
          <Slider
            value={[settings.confidenceThreshold]}
            onValueChange={([value]) => handleSettingChange('confidenceThreshold', value)}
            min={0.3}
            max={1.0}
            step={0.1}
            className="w-full"
          />
          <p className="text-xs text-gray-500">
            Ajusta qué tan seguro debe estar el sistema antes de aceptar el texto transcrito
          </p>
        </div>

        {/* Opciones de Modo */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="continuous">Modo Continuo</Label>
              <p className="text-xs text-gray-500">
                Mantiene la grabación activa hasta que la detengas manualmente
              </p>
            </div>
            <Switch
              id="continuous"
              checked={settings.continuousMode}
              onCheckedChange={(checked) => handleSettingChange('continuousMode', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="interim">Resultados Intermedios</Label>
              <p className="text-xs text-gray-500">
                Muestra la transcripción mientras hablas (más responsivo)
              </p>
            </div>
            <Switch
              id="interim"
              checked={settings.interimResults}
              onCheckedChange={(checked) => handleSettingChange('interimResults', checked)}
            />
          </div>
        </div>

        {/* Prueba de Micrófono */}
        <div className="space-y-3">
          <Label>Prueba de Micrófono</Label>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handleMicTest}
              disabled={!isSupported || !isMicrophoneAvailable}
              variant={isListening ? "destructive" : "outline"}
              size="sm"
            >
              {isListening ? (
                <>
                  <Volume2 className="h-4 w-4 mr-2" />
                  Detener Prueba
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Probar Micrófono
                </>
              )}
            </Button>
            
            {testResult === 'success' && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Funcionando correctamente</span>
              </div>
            )}
            
            {testResult === 'error' && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Error en la prueba</span>
              </div>
            )}
          </div>

          {/* Transcripción de Prueba */}
          {(isListening || transcript) && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  {isListening ? 'Escuchando...' : 'Última transcripción:'}
                </span>
                {confidence > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(confidence * 100)}% confianza
                  </Badge>
                )}
              </div>
              
              {transcript && (
                <p className="text-sm text-blue-700 italic">
                  "{transcript}"
                </p>
              )}
              
              {isListening && !transcript && (
                <p className="text-sm text-blue-600">
                  Habla ahora para probar el micrófono...
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">Error:</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}
        </div>

        {/* Información Adicional */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Consejos para mejor reconocimiento:</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Habla claramente y a velocidad normal</li>
                <li>Mantén el micrófono cerca (15-30 cm)</li>
                <li>Evita ruidos de fondo</li>
                <li>Usa auriculares si hay eco</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export type { VoiceSettingsConfig }