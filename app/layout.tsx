// 🔒 SEGURIDAD: Importar console blocker PRIMERO (antes que cualquier otro código)
import '@/lib/security/console-blocker'
// 🔒 SEGURIDAD: Importar logger para bloqueo global de console
import '@/lib/logger'

import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { DisplayPreferencesProvider } from '@/providers/display-preferences-provider'
import { IBM_Plex_Serif, IBM_Plex_Sans } from 'next/font/google'

// Fuentes académicas profesionales para contexto clínico
const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
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
      <body className={`${ibmPlexSans.variable} ${ibmPlexSans.variable}`}>
        <DisplayPreferencesProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </DisplayPreferencesProvider>
      </body>
    </html>
  )
}
