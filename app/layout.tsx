// 🔒 SEGURIDAD: Importar console blocker PRIMERO (antes que cualquier otro código)
import '@/lib/security/console-blocker'
// 🔒 SEGURIDAD: Importar logger para bloqueo global de console
import '@/lib/logger'

import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/providers/auth-provider'
import { MotionProvider } from '@/providers/motion-provider'
import { UpgradeModalProvider } from '@/components/upgrade-modal'
import { IBM_Plex_Serif, IBM_Plex_Sans } from 'next/font/google'

// Fuentes académicas profesionales para contexto clínico
// Optimización: Reducir pesos cargados (400/600), usar CSS para 500
// IBM Plex no tiene variable fonts en Google Fonts, pero next/font optimiza automáticamente
const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-serif',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: true,
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: 'Aurora | Plataforma Clínica con IA para Psicología',
  description: 'Sistema de asistencia clínica con inteligencia artificial para psicólogos. Documentación inteligente, análisis de sesiones y evidencia científica integrada.',
  generator: 'Aurora Clinical AI Platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="/api/send-message" />
      </head>
      <body className={`${ibmPlexSans.variable} ${ibmPlexSerif.variable}`}>
        <AuthProvider>
          <MotionProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <UpgradeModalProvider>
                {children}
              </UpgradeModalProvider>
            </ThemeProvider>
          </MotionProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
