"use client"

import { useAuth } from "@/providers/auth-provider"
import { AuthGate } from "@/components/auth-gate"
import { MainInterfaceOptimized } from "@/components/main-interface-optimized"
import { AppSkeleton } from "@/components/app-skeleton"

export default function HopeAIPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <AppSkeleton />
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
