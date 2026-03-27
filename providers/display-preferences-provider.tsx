"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

export interface DisplayPreferences {
  fontSize: 'small' | 'medium' | 'large' | 'x-large'
  messageWidth: 'narrow' | 'comfortable' | 'wide' | 'full'
  messageSpacing: 'compact' | 'normal' | 'relaxed'
}

const DEFAULT_PREFERENCES: DisplayPreferences = {
  fontSize: 'medium',
  messageWidth: 'comfortable',
  messageSpacing: 'normal'
}

const STORAGE_KEY = 'hopeai-display-preferences'

interface DisplayPreferencesContextType {
  preferences: DisplayPreferences
  updatePreference: <K extends keyof DisplayPreferences>(
    key: K,
    value: DisplayPreferences[K]
  ) => void
  resetPreferences: () => void
  isLoaded: boolean
}

const DisplayPreferencesContext = createContext<DisplayPreferencesContextType | undefined>(undefined)

export function DisplayPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<DisplayPreferences>(DEFAULT_PREFERENCES)
  const [isLoaded, setIsLoaded] = useState(false)

  // Cargar preferencias desde localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed })
      }
    } catch (error) {
      console.error('Error loading display preferences:', error)
    } finally {
      setIsLoaded(true)
    }
  }, [])

  // Guardar preferencias en localStorage
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      } catch (error) {
        console.error('Error saving display preferences:', error)
      }
    }
  }, [preferences, isLoaded])

  const updatePreference = <K extends keyof DisplayPreferences>(
    key: K,
    value: DisplayPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
  }

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES)
  }

  return (
    <DisplayPreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        resetPreferences,
        isLoaded
      }}
    >
      {children}
    </DisplayPreferencesContext.Provider>
  )
}

export function useDisplayPreferences() {
  const context = useContext(DisplayPreferencesContext)
  if (context === undefined) {
    throw new Error('useDisplayPreferences must be used within a DisplayPreferencesProvider')
  }
  return context
}

// Utilidades para generar clases CSS
export function getFontSizeClass(size: DisplayPreferences['fontSize']): string {
  switch (size) {
    case 'small':
      return 'message-text-sm'
    case 'medium':
      return 'message-text-base'
    case 'large':
      return 'message-text-lg'
    case 'x-large':
      return 'message-text-xl'
    default:
      return 'message-text-base'
  }
}

export function getMessageWidthClass(width: DisplayPreferences['messageWidth']): string {
  switch (width) {
    case 'narrow':
      return 'message-width-narrow'
    case 'comfortable':
      return 'message-width-comfortable'
    case 'wide':
      return 'message-width-wide'
    case 'full':
      return 'message-width-full'
    default:
      return 'message-width-comfortable'
  }
}

export function getMessageSpacingClass(spacing: DisplayPreferences['messageSpacing']): string {
  switch (spacing) {
    case 'compact':
      return 'py-2'
    case 'normal':
      return 'py-4'
    case 'relaxed':
      return 'py-6'
    default:
      return 'py-4'
  }
}

export function getChatContainerWidthClass(width: DisplayPreferences['messageWidth']): string {
  switch (width) {
    case 'narrow':
      return 'chat-container-narrow'
    case 'comfortable':
      return 'chat-container-comfortable'
    case 'wide':
      return 'chat-container-wide'
    case 'full':
      return 'chat-container-full'
    default:
      return 'chat-container-comfortable'
  }
}
