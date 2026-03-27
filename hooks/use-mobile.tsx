import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

/**
 * Detecta el tipo de dispositivo y características específicas para optimización móvil
 */
interface MobileDetection {
  isMobile: boolean
  isTablet: boolean
  isTouch: boolean
  isSafari: boolean
  isIOS: boolean
  isAndroid: boolean
  hasVoiceSupport: boolean
  screenSize: 'mobile' | 'tablet' | 'desktop'
}

/**
 * Hook mejorado para detección móvil optimizada para speech-to-text
 * 
 * Proporciona detección granular de dispositivos y capacidades específicas
 * para optimizar la experiencia de entrada de voz en diferentes plataformas.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * Hook avanzado para detección completa de dispositivos móviles
 * Optimizado específicamente para funcionalidades de speech-to-text
 */
export function useMobileDetection(): MobileDetection {
  const [detection, setDetection] = React.useState<MobileDetection>({
    isMobile: false,
    isTablet: false,
    isTouch: false,
    isSafari: false,
    isIOS: false,
    isAndroid: false,
    hasVoiceSupport: false,
    screenSize: 'desktop'
  })

  React.useEffect(() => {
    const detectDevice = () => {
      const width = window.innerWidth
      const userAgent = navigator.userAgent.toLowerCase()
      
      // Detección de tamaño de pantalla
      const isMobile = width < MOBILE_BREAKPOINT
      const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT
      const screenSize: 'mobile' | 'tablet' | 'desktop' = 
        isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
      
      // Detección de capacidades táctiles
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      
      // Detección de plataformas específicas
      const isIOS = /ipad|iphone|ipod/.test(userAgent)
      const isAndroid = /android/.test(userAgent)
      const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent)
      
      // Detección de soporte de voz (crítico para speech-to-text)
      const hasVoiceSupport = 
        'webkitSpeechRecognition' in window || 
        'SpeechRecognition' in window ||
        !!(window as any).webkitSpeechRecognition
      
      setDetection({
        isMobile,
        isTablet,
        isTouch,
        isSafari,
        isIOS,
        isAndroid,
        hasVoiceSupport,
        screenSize
      })
    }

    // Detección inicial
    detectDevice()

    // Listener para cambios de orientación/tamaño
    const mediaQuery = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`)
    const orientationQuery = window.matchMedia('(orientation: portrait)')
    
    const handleChange = () => detectDevice()
    
    mediaQuery.addEventListener('change', handleChange)
    orientationQuery.addEventListener('change', handleChange)
    window.addEventListener('resize', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
      orientationQuery.removeEventListener('change', handleChange)
      window.removeEventListener('resize', handleChange)
    }
  }, [])

  return detection
}

/**
 * Hook específico para configuraciones optimizadas de speech-to-text en móviles
 */
export function useMobileSpeechConfig() {
  const detection = useMobileDetection()
  
  return React.useMemo(() => {
    // Configuraciones específicas por plataforma para mejorar el speech-to-text
    const config = {
      // Configuración de timeouts: sin timeouts automáticos en móvil para permitir grabación continua
      silenceTimeout: detection.isMobile ? null : 3000, // Sin timeout en móvil
      maxRecordingTime: detection.isMobile ? null : 60000, // Sin límite automático en móvil
      
      // Configuración de sensibilidad - habilitar modo continuo en móvil para toggle functionality
      interimResults: true,
      continuous: true, // Habilitar modo continuo en todos los dispositivos para toggle functionality
      
      // Configuraciones específicas por plataforma
      language: 'es-CL', // Chilean Spanish
      grammars: detection.isMobile ? [] : undefined, // Sin gramáticas complejas en móvil
      
      // Configuraciones de UI optimizadas
      buttonSize: detection.isMobile ? 'lg' : 'md',
      showConfidence: !detection.isMobile, // Ocultar confianza en móvil para UI más limpia
      hapticFeedback: detection.isTouch, // Feedback háptico solo en dispositivos táctiles
      
      // Configuraciones de rendimiento
      debounceMs: detection.isMobile ? 300 : 150, // Mayor debounce en móvil
      
      // Alertas específicas por plataforma (solo informativas, no bloquean funcionalidad)
      showPlatformWarnings: {
        safari: detection.isSafari && !detection.hasVoiceSupport,
        ios: detection.isIOS && !detection.hasVoiceSupport,
        noSupport: false // Permitir intentar incluso si la detección inicial falla
      }
    }
    
    return config
  }, [detection])
}
