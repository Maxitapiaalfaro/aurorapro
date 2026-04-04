"use client"

/**
 * Firebase Auth Provider — Aurora
 *
 * React Context que escucha `onAuthStateChanged` de Firebase Auth y expone:
 * - `user`: Objeto User de Firebase (o null si no autenticado).
 * - `psychologistId`: El `uid` de Firebase, usado como raíz del path en Firestore
 *   (`psychologists/{psychologistId}/...`). Ver §2.1 del documento de arquitectura.
 * - `isLoading`: true mientras se resuelve el estado inicial de autenticación.
 *
 * Todos los componentes que necesiten identidad del psicólogo deben consumir
 * este provider vía el hook `useAuth()`.
 *
 * @module providers/auth-provider
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from "react"
import { onAuthStateChanged, type User } from "firebase/auth"
import { auth } from "@/lib/firebase-config"

// ────────────────────────────────────────────────────────────────────────────
// Context Type
// ────────────────────────────────────────────────────────────────────────────

interface AuthContextType {
  /** Objeto User de Firebase Auth, null si no autenticado */
  user: User | null
  /**
   * UID de Firebase usado como identificador del psicólogo.
   * Es la clave raíz para aislamiento en Firestore: `psychologists/{psychologistId}/...`
   * Null si no hay usuario autenticado.
   */
  psychologistId: string | null
  /** True durante la resolución inicial del estado de auth (primer onAuthStateChanged) */
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ────────────────────────────────────────────────────────────────────────────
// Provider Component
// ────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // `onAuthStateChanged` emite inmediatamente con el estado actual (cached)
    // y luego cada vez que el usuario inicia o cierra sesión.
    // Retorna una función de cleanup para desuscribirse al desmontar.
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser)
        setIsLoading(false)

        if (firebaseUser) {
          console.log('🔐 [Auth] Usuario autenticado:', firebaseUser.uid)
        } else {
          console.log('🔓 [Auth] Sin usuario autenticado')
        }
      },
      (error) => {
        console.error('❌ [Auth] Error en onAuthStateChanged:', error)
        setUser(null)
        setIsLoading(false)
      }
    )

    return unsubscribe
  }, [])

  // Memoizar el valor del contexto para evitar re-renders innecesarios
  // cuando el componente padre se re-renderiza sin cambios en auth.
  const value = useMemo<AuthContextType>(() => ({
    user,
    psychologistId: user?.uid ?? null,
    isLoading,
  }), [user, isLoading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Consumer Hook
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hook para consumir el estado de autenticación de Firebase.
 *
 * @example
 * ```tsx
 * const { psychologistId, isLoading } = useAuth()
 *
 * if (isLoading) return <Spinner />
 * if (!psychologistId) return <LoginScreen />
 *
 * // El psychologistId está disponible para queries a Firestore
 * ```
 *
 * @throws Error si se usa fuera del `<AuthProvider>`
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an <AuthProvider>. Wrap your app with <AuthProvider> in layout.tsx.')
  }
  return context
}
