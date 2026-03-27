"use client"

import React, { useState } from 'react'
import { MarkdownRenderer, StreamingMarkdownRenderer } from '@/components/markdown-renderer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Ejemplo de uso del sistema de renderizado de Markdown
 * para mensajes clínicos en streaming
 */
export function MarkdownUsageExample() {
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  
  // Contenido de ejemplo que simula una respuesta clínica
  const exampleContent = `# Evaluación Clínica: Caso de Ansiedad

## Observaciones Principales

El paciente presenta **síntomas consistentes** con un trastorno de ansiedad generalizada:

### Síntomas Reportados
- Preocupación excesiva (>6 meses)
- Dificultad para concentrarse
- Tensión muscular
- Alteraciones del sueño

### Recomendaciones Terapéuticas

1. **Terapia Cognitivo-Conductual (TCC)**
   - Técnicas de reestructuración cognitiva
   - Entrenamiento en relajación
   - Exposición gradual

2. **Intervenciones Complementarias**
   - Mindfulness y meditación
   - Ejercicio regular
   - Higiene del sueño

> **Nota Importante**: Considerar evaluación psiquiátrica para posible tratamiento farmacológico si los síntomas persisten.

### Escalas de Evaluación Sugeridas

| Escala | Propósito | Frecuencia |
|--------|-----------|------------|
| GAD-7 | Ansiedad generalizada | Semanal |
| PHQ-9 | Síntomas depresivos | Quincenal |
| DASS-21 | Estado emocional general | Mensual |

### Código de Ejemplo para Seguimiento

\`\`\`javascript
const seguimiento = {
  fecha: new Date(),
  sintomas: ['ansiedad', 'preocupacion'],
  intensidad: 7,
  estrategias: ['respiracion', 'mindfulness']
}
\`\`\`

**Referencias:**
- [Manual DSM-5](https://example.com/dsm5)
- [Guías de Práctica Clínica](https://example.com/guidelines)

---

*Este es un ejemplo de cómo el sistema renderiza contenido markdown en tiempo real durante el streaming de respuestas de IA.*`

  // Simular streaming de contenido
  const simulateStreaming = async () => {
    setIsStreaming(true)
    setStreamingContent('')
    
    const words = exampleContent.split(' ')
    
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50)) // Simular delay
      setStreamingContent(prev => prev + (i === 0 ? '' : ' ') + words[i])
    }
    
    setIsStreaming(false)
  }
  
  const resetDemo = () => {
    setStreamingContent('')
    setIsStreaming(false)
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sistema de Renderizado Markdown para HopeAI</CardTitle>
          <CardDescription>
            Demostración del renderizado de contenido markdown en tiempo real
            para respuestas clínicas con streaming.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={simulateStreaming} disabled={isStreaming}>
              {isStreaming ? 'Streaming...' : 'Iniciar Demo de Streaming'}
            </Button>
            <Button variant="outline" onClick={resetDemo}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Ejemplo de contenido estático */}
      <Card>
        <CardHeader>
          <CardTitle>Renderizado Estático</CardTitle>
          <CardDescription>
            Ejemplo de contenido markdown completamente renderizado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer 
            content={exampleContent}
            className="border rounded-lg p-4 bg-gray-50"
          />
        </CardContent>
      </Card>
      
      {/* Ejemplo de streaming */}
      {(streamingContent || isStreaming) && (
        <Card>
          <CardHeader>
            <CardTitle>Renderizado en Streaming</CardTitle>
            <CardDescription>
              Contenido que se renderiza en tiempo real mientras se recibe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-white min-h-[200px]">
              <StreamingMarkdownRenderer 
                content={streamingContent}
                showTypingIndicator={isStreaming}
              />
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Información técnica */}
      <Card>
        <CardHeader>
          <CardTitle>Características Técnicas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Funcionalidades Implementadas</h4>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>✅ Renderizado de markdown en tiempo real</li>
                <li>✅ Soporte para streaming de contenido</li>
                <li>✅ Estilos optimizados para contenido clínico</li>
                <li>✅ Sanitización de contenido por seguridad</li>
                <li>✅ Indicadores de escritura en tiempo real</li>
                <li>✅ Soporte para tablas, listas y código</li>
                <li>✅ Enlaces seguros con target="_blank"</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Optimizaciones</h4>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>🚀 Parsing incremental para streaming</li>
                <li>🎨 Estilos CSS específicos para clínica</li>
                <li>🔒 Sanitización automática de contenido</li>
                <li>📱 Diseño responsive</li>
                <li>⚡ Renderizado eficiente con useMemo</li>
                <li>🎯 Tipografía optimizada para legibilidad</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default MarkdownUsageExample