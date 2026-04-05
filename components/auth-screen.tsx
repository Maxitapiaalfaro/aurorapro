"use client"

/**
 * AuthScreen — Pantalla de Autenticación Clínica
 *
 * Pantalla de login/registro profesional para psicólogos clínicos.
 * Bloquea el acceso al sistema Aurora hasta que el profesional inicie sesión.
 *
 * Métodos de autenticación soportados:
 * - Email + Contraseña (login y registro)
 * - Google Sign-In (OAuth popup)
 *
 * Integrado con Firebase Auth vía lib/firebase-config.ts.
 * El UID autenticado se propaga como psychologistId a todo el sistema
 * a través de providers/auth-provider.tsx → useAuth().
 *
 * @module components/auth-screen
 */

import React, { useState, useCallback } from "react"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  type AuthError,
} from "firebase/auth"
import { auth } from "@/lib/firebase-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type AuthMode = "login" | "register"

interface AuthScreenProps {
  /** Called after successful authentication (optional, auth state propagates via AuthProvider) */
  onAuthenticated?: () => void
}

// ────────────────────────────────────────────────────────────────────────────
// Firebase Error Mapping (user-friendly messages in Spanish)
// ────────────────────────────────────────────────────────────────────────────

function getAuthErrorMessage(error: AuthError): string {
  switch (error.code) {
    case "auth/invalid-email":
      return "El correo electrónico no es válido."
    case "auth/user-disabled":
      return "Esta cuenta ha sido deshabilitada. Contacte soporte."
    case "auth/user-not-found":
      return "No existe una cuenta con este correo electrónico."
    case "auth/wrong-password":
      return "La contraseña es incorrecta."
    case "auth/invalid-credential":
      return "Las credenciales proporcionadas no son válidas. Verifique su correo y contraseña."
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con este correo electrónico."
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres."
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Intente de nuevo más tarde."
    case "auth/network-request-failed":
      return "Error de conexión. Verifique su acceso a internet."
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de inicio de sesión."
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana emergente. Permita las ventanas emergentes para este sitio."
    case "auth/cancelled-popup-request":
      return "" // Silent — user cancelled, no message needed
    default:
      return `Error de autenticación: ${error.message}`
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Google Auth Provider (singleton)
// ────────────────────────────────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider()

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Email/Password Auth ──────────────────────────────────────────────

  const handleEmailAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        await createUserWithEmailAndPassword(auth, email, password)
      }
      // Auth state change propagates through AuthProvider's onAuthStateChanged
      onAuthenticated?.()
    } catch (err) {
      const message = getAuthErrorMessage(err as AuthError)
      if (message) setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [mode, email, password, onAuthenticated])

  // ── Google Sign-In ───────────────────────────────────────────────────

  const handleGoogleSignIn = useCallback(async () => {
    setError(null)
    setIsGoogleLoading(true)

    try {
      await signInWithPopup(auth, googleProvider)
      onAuthenticated?.()
    } catch (err) {
      const message = getAuthErrorMessage(err as AuthError)
      if (message) setError(message)
    } finally {
      setIsGoogleLoading(false)
    }
  }, [onAuthenticated])

  // ── Mode Toggle ──────────────────────────────────────────────────────

  const toggleMode = useCallback(() => {
    setMode(prev => prev === "login" ? "register" : "login")
    setError(null)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────

  const isSubmitting = isLoading || isGoogleLoading

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Background texture layer */}
      <div className="fixed inset-0 paper-noise color-fragment pointer-events-none" />

      <div className="relative w-full max-w-md space-y-8">
        {/* ── Header / Branding ───────────────────────────────────── */}
        <div className="text-center space-y-3">
          {/* Aurora Logo/Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl font-serif font-semibold tracking-tight text-foreground">
              Aurora
            </h1>
            <p className="text-sm text-muted-foreground font-sans">
              Asistente Clínico con Inteligencia Artificial
            </p>
          </div>
        </div>

        {/* ── Auth Card ───────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-card shadow-sm paper-noise p-8 space-y-6">
          {/* Card Header */}
          <div className="text-center space-y-1">
            <h2 className="text-xl font-serif font-semibold text-foreground">
              {mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            </h2>
            <p className="text-sm text-muted-foreground font-sans">
              {mode === "login"
                ? "Acceda a su espacio clínico seguro"
                : "Registre su cuenta profesional"
              }
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive font-sans">{error}</p>
            </div>
          )}

          {/* Email/Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="font-sans text-sm font-medium">
                Correo electrónico
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nombre@consultorio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 font-sans"
                  required
                  disabled={isSubmitting}
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="font-sans text-sm font-medium">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 font-sans"
                  required
                  minLength={6}
                  disabled={isSubmitting}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full font-sans"
              disabled={isSubmitting}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "Iniciando sesión..." : "Creando cuenta..."}
                </>
              ) : (
                mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"
              )}
            </Button>
          </form>

          {/* ── Divider ─────────────────────────────────────────── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-sans">
                o continúe con
              </span>
            </div>
          </div>

          {/* ── Google Sign-In ──────────────────────────────────── */}
          <Button
            type="button"
            variant="outline"
            className="w-full font-sans"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            {isGoogleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Continuar con Google
          </Button>

          {/* ── Toggle Login/Register ────────────────────────────── */}
          <div className="text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-muted-foreground hover:text-foreground font-sans transition-colors"
              disabled={isSubmitting}
            >
              {mode === "login" ? (
                <>¿No tiene cuenta? <span className="font-medium text-primary">Registrarse</span></>
              ) : (
                <>¿Ya tiene cuenta? <span className="font-medium text-primary">Iniciar Sesión</span></>
              )}
            </button>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-sans">
            <ShieldCheck className="h-3 w-3" />
            <span>Conexión segura · Datos cifrados en reposo</span>
          </div>
          <p className="text-xs text-muted-foreground/60 font-sans">
            Aurora © {new Date().getFullYear()} · Herramienta de apoyo clínico con IA
          </p>
        </div>
      </div>
    </div>
  )
}
