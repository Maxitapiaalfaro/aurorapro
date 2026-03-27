"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff } from "lucide-react"
import { OptimizationFeatures } from "@/config/optimization-config"

interface DebugToggleProps {
  showDebugElements: boolean
  onToggle: (show: boolean) => void
}

export function DebugToggle({ showDebugElements, onToggle }: DebugToggleProps) {
  // Solo mostrar en desarrollo
  if (process.env.NODE_ENV !== 'development') return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onToggle(!showDebugElements)}
        className="bg-white/90 backdrop-blur-sm border-gray-300 hover:bg-gray-50 text-gray-700 shadow-lg"
        title={showDebugElements ? "Ocultar elementos de debug" : "Mostrar elementos de debug"}
      >
        {showDebugElements ? (
          <>
            <EyeOff className="h-4 w-4 mr-2" />
            Ocultar Debug
          </>
        ) : (
          <>
            <Eye className="h-4 w-4 mr-2" />
            Mostrar Debug
          </>
        )}
      </Button>
    </div>
  )
}

// Hook para manejar el estado de debug desde cualquier componente
export function useDebugToggle() {
  const [showDebugElements, setShowDebugElements] = useState(
    OptimizationFeatures.shouldShowDebugElements()
  )

  // Restaurar preferencia desde localStorage en desarrollo
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const saved = localStorage.getItem('hopeai_show_debug')
      if (saved !== null) {
        setShowDebugElements(saved === 'true')
      }
    }
  }, [])

  const toggleDebugElements = (show: boolean) => {
    setShowDebugElements(show)
    
    // Guardar preferencia en localStorage para desarrollo
    if (process.env.NODE_ENV === 'development') {
      localStorage.setItem('hopeai_show_debug', show.toString())
    }
  }

  return {
    showDebugElements,
    toggleDebugElements
  }
}