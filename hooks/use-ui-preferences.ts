import { useState, useEffect } from "react"
import { uiPreferencesStorage, type UIPreferences } from "@/lib/ui-preferences-storage"


import { createLogger } from '@/lib/logger'
const logger = createLogger('system')

const DEFAULT_USER_ID = "default_user"

/**
 * Hook to manage UI preferences with IndexedDB persistence
 */
export function useUIPreferences(userId: string = DEFAULT_USER_ID) {
  const [preferences, setPreferences] = useState<UIPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await uiPreferencesStorage.getPreferences(userId)
        setPreferences(prefs)
      } catch (error) {
        logger.error("Error loading UI preferences:", error)
        // Set default preferences on error
        setPreferences({
          userId,
          showDynamicSuggestions: true,
          lastUpdated: new Date().toISOString(),
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadPreferences()
  }, [userId])

  /**
   * Update a specific preference
   */
  const updatePreference = async (
    key: keyof Omit<UIPreferences, "userId" | "lastUpdated">,
    value: boolean
  ) => {
    if (!preferences) return

    try {
      await uiPreferencesStorage.updatePreference(key, value, userId)
      
      // Update local state
      setPreferences({
        ...preferences,
        [key]: value,
        lastUpdated: new Date().toISOString(),
      })
    } catch (error) {
      logger.error("Error updating UI preference:", error)
    }
  }

  /**
   * Hide dynamic suggestions permanently
   */
  const hideDynamicSuggestions = async () => {
    await updatePreference("showDynamicSuggestions", false)
  }

  /**
   * Show dynamic suggestions again
   */
  const showDynamicSuggestions = async () => {
    await updatePreference("showDynamicSuggestions", true)
  }

  return {
    preferences,
    isLoading,
    updatePreference,
    hideDynamicSuggestions,
    showDynamicSuggestions,
    shouldShowDynamicSuggestions: preferences?.showDynamicSuggestions ?? true,
  }
}

