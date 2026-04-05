"use client"

import { MainInterfaceOptimized } from "@/components/main-interface-optimized"
import { AuthScreen } from "@/components/auth-screen"
import { useAuth } from "@/providers/auth-provider"
import { Loader2 } from "lucide-react"

export default function HopeAIPage() {
  const { psychologistId, isLoading } = useAuth()

  // Resolver estado de autenticación antes de renderizar
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground font-sans">Verificando sesión...</p>
        </div>
      </div>
    )
  }

  // Sin autenticación → mostrar pantalla de login
  if (!psychologistId) {
    return <AuthScreen />
  }

  // Autenticado → mostrar interfaz principal de Aurora
  return (
    <div className="min-h-screen">
      <MainInterfaceOptimized />
    </div>
  )
}
