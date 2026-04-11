"use client"

import { useState, useEffect, useCallback } from "react"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type ConfirmationResult,
} from "firebase/auth"
import { auth } from "@/lib/firebase-config"
import {
  signInWithGoogle,
  initRecaptcha,
  sendPhoneVerificationCode,
  verifyPhoneCode,
  cleanupRecaptcha,
} from "@/lib/auth-providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Phone, ArrowLeft } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────
// Error mapping
// ────────────────────────────────────────────────────────────────────────────

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  // Email/password
  "auth/invalid-email": "El correo electrónico no es válido.",
  "auth/user-disabled": "Esta cuenta ha sido deshabilitada.",
  "auth/user-not-found": "No existe una cuenta con este correo.",
  "auth/wrong-password": "La contraseña es incorrecta.",
  "auth/email-already-in-use": "Ya existe una cuenta con este correo.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Intenta de nuevo más tarde.",
  "auth/invalid-credential": "Credenciales inválidas. Verifica tu correo y contraseña.",
  // Social / OAuth
  "auth/popup-closed-by-user": "Se cerró la ventana de inicio de sesión.",
  "auth/popup-blocked": "El navegador bloqueó la ventana emergente. Permite ventanas emergentes e intenta de nuevo.",
  "auth/cancelled-popup-request": "Se canceló la solicitud de inicio de sesión.",
  "auth/account-exists-with-different-credential": "Ya existe una cuenta con este correo usando otro método de inicio de sesión.",
  "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase. Agrega el dominio en Firebase Console → Authentication → Settings → Authorized domains.",
  // Phone
  "auth/invalid-phone-number": "El número de teléfono no es válido. Usa formato internacional (ej: +56 9 1234 5678).",
  "auth/missing-phone-number": "Ingresa un número de teléfono.",
  "auth/quota-exceeded": "Se excedió el límite de SMS. Intenta más tarde.",
  "auth/invalid-verification-code": "El código de verificación es incorrecto.",
  "auth/code-expired": "El código de verificación ha expirado. Solicita uno nuevo.",
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code
    return FIREBASE_ERROR_MESSAGES[code] || `Error de autenticación (${code})`
  }
  return "Ocurrió un error inesperado. Intenta de nuevo."
}

// ────────────────────────────────────────────────────────────────────────────
// SVG Icons for brand buttons (inline to avoid extra dependencies)
// ────────────────────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Phone Auth Sub-Component
// ────────────────────────────────────────────────────────────────────────────

type PhoneStep = "input" | "verify"

function PhoneAuthFlow({
  onBack,
  onError,
}: {
  onBack: () => void
  onError: (msg: string) => void
}) {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [step, setStep] = useState<PhoneStep>("input")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)

  useEffect(() => {
    return () => {
      cleanupRecaptcha()
    }
  }, [])

  const handleSendCode = useCallback(async () => {
    if (!phoneNumber.trim()) {
      onError("Ingresa un número de teléfono.")
      return
    }

    setLoading(true)
    onError("")

    try {
      const verifier = initRecaptcha("recaptcha-container")
      const result = await sendPhoneVerificationCode(phoneNumber, verifier)
      setConfirmationResult(result)
      setStep("verify")
    } catch (err) {
      onError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [phoneNumber, onError])

  const handleVerifyCode = useCallback(async () => {
    if (!confirmationResult || otp.length !== 6) return

    setLoading(true)
    onError("")

    try {
      await verifyPhoneCode(confirmationResult, otp)
      // AuthProvider detects the state change via onAuthStateChanged
    } catch (err) {
      onError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [confirmationResult, otp, onError])

  if (step === "verify") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { setStep("input"); setOtp(""); setConfirmationResult(null); onError("") }}
        >
          <ArrowLeft className="h-4 w-4" />
          Cambiar número
        </button>

        <p className="text-sm text-muted-foreground">
          Ingresa el código de 6 dígitos enviado a <strong>{phoneNumber}</strong>
        </p>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otp}
            onChange={(value) => setOtp(value)}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          className="w-full"
          onClick={handleVerifyCode}
          disabled={loading || otp.length !== 6}
        >
          {loading ? "Verificando..." : "Verificar código"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      <div className="space-y-2">
        <Label htmlFor="phone">Número de teléfono</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+56 9 1234 5678"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          autoComplete="tel"
        />
        <p className="text-xs text-muted-foreground">
          Incluye el código de país (ej: +56 para Chile)
        </p>
      </div>

      <Button
        className="w-full"
        onClick={handleSendCode}
        disabled={loading || !phoneNumber.trim()}
      >
        {loading ? "Enviando código..." : "Enviar código SMS"}
      </Button>

      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main AuthGate Component
// ────────────────────────────────────────────────────────────────────────────

type AuthView = "login" | "register" | "phone"

export function AuthGate() {
  const [view, setView] = useState<AuthView>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // ── Email/Password Submit ─────────────────────────────────────────────

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (view === "register" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      return
    }

    setLoading(true)
    try {
      if (view === "login") {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        await createUserWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Social Sign-In Handlers ───────────────────────────────────────────

  async function handleGoogleSignIn() {
    setError("")
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Phone Auth View ───────────────────────────────────────────────────

  if (view === "phone") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm mx-auto">
          {/* Branding */}
          <div className="text-center mb-10">
            <h1 className="font-serif text-3xl tracking-tight text-foreground/90">Aurora</h1>
            <p className="mt-2 text-sm text-muted-foreground font-sans">Plataforma clínica con IA</p>
          </div>

          <Card className="border-border/40 shadow-sm bg-card/95 backdrop-blur-sm">
            <CardHeader className="text-center pb-2 pt-6">
              <CardDescription>Inicia sesión con tu número de teléfono</CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              {error && (
                <p className="text-sm text-destructive mb-4">{error}</p>
              )}
              <PhoneAuthFlow
                onBack={() => { setView("login"); setError("") }}
                onError={setError}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ── Email/Password + Social View ──────────────────────────────────────

  const isLogin = view === "login"

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Branding — separated from card for elegance */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-3xl tracking-tight text-foreground/90">Aurora</h1>
          <p className="mt-2 text-sm text-muted-foreground font-sans">Plataforma clínica con IA</p>
        </div>

        <Card className="border-border/40 shadow-sm bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2 pt-6">
            <CardDescription className="text-muted-foreground">
              {isLogin
                ? "Inicia sesión para continuar"
                : "Crea tu cuenta profesional"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pb-6">
            {/* ── Social Login Buttons ──────────────────────────────── */}
            <div className="grid gap-2.5">
              <Button
                variant="outline"
                className="w-full h-11 rounded-lg border-border/50 hover:bg-secondary/80 transition-colors"
                onClick={handleGoogleSignIn}
                disabled={loading}
                type="button"
              >
                <GoogleIcon className="mr-2.5" />
                <span className="text-sm">Continuar con Google</span>
              </Button>

              <Button
                variant="outline"
                className="w-full h-11 rounded-lg border-border/50 hover:bg-secondary/80 transition-colors"
                onClick={() => { setView("phone"); setError("") }}
                disabled={loading}
                type="button"
              >
                <Phone className="mr-2.5 h-4 w-4" />
                <span className="text-sm">Continuar con teléfono</span>
              </Button>
            </div>

            {/* ── Divider ──────────────────────────────────────────── */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground/70 uppercase tracking-wider">
                  o con correo
                </span>
              </div>
            </div>

            {/* ── Email/Password Form ──────────────────────────────── */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="profesional@ejemplo.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-10 rounded-lg border-border/50 focus:border-primary/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="h-10 rounded-lg border-border/50 focus:border-primary/50"
                />
              </div>

              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">Confirmar contraseña</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="h-10 rounded-lg border-border/50 focus:border-primary/50"
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full h-10 rounded-lg font-medium" disabled={loading}>
                {loading
                  ? "Procesando..."
                  : isLogin
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
              </Button>
            </form>

            {/* ── Toggle Login/Register ────────────────────────────── */}
            <div className="text-center text-sm text-muted-foreground pt-1">
              {isLogin ? (
                <>
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    className="text-foreground/80 hover:text-foreground underline underline-offset-2 decoration-border transition-colors"
                    onClick={() => { setView("register"); setError("") }}
                  >
                    Regístrate
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tienes cuenta?{" "}
                  <button
                    type="button"
                    className="text-foreground/80 hover:text-foreground underline underline-offset-2 decoration-border transition-colors"
                    onClick={() => { setView("login"); setError("") }}
                  >
                    Inicia sesión
                  </button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Subtle footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          Plataforma HIPAA-compliant para profesionales de salud mental
        </p>
      </div>
    </div>
  )
}
