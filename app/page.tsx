"use client"

import { useAuth } from "@/providers/auth-provider"
import { AuthGate } from "@/components/auth-gate"
import { MainInterfaceOptimized } from "@/components/main-interface-optimized"

export default function HopeAIPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center animate-in fade-in duration-500">
          <div className="w-6 h-6 border-2 border-border border-t-foreground/30 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xs text-muted-foreground/50">Cargando</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthGate />
  }

  return (
    <div className="min-h-screen">
      <MainInterfaceOptimized />
    </div>
  )
}
