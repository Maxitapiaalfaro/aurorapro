/**
 * User Preferences Manager - Cross-Session Learning System
 * 
 * Manages user preferences, learning patterns, and behavioral adaptation
 * across multiple sessions for personalized HopeAI experience.
 * 
 * @author HopeAI Development Team
 * @version 1.0.0
 */

export interface UserPreferences {
  userId: string;
  preferredAgent: 'socratico' | 'clinico' | 'academico';
  agentSwitchPatterns: {
    from: string;
    to: string;
    frequency: number;
    successRate: number;
    lastUsed: Date;
  }[];
  communicationStyle: 'formal' | 'casual' | 'technical';
  clinicalFocus: string[];  // ["ansiedad", "CBT", "adolescentes"]
  toolUsagePatterns: {
    toolName: string;
    frequency: number;
    effectiveness: number;
    lastUsed: Date;
  }[];
  sessionMetrics: {
    totalSessions: number;
    averageSessionLength: number;
    mostActiveTimeOfDay: string;
    preferredSessionDuration: number;
  };
  learningProfile: {
    adaptationRate: number;    // How quickly user adapts to suggestions
    explorationVsTrust: number; // Balance between trying new vs familiar
    feedbackResponsiveness: number;
  };
  lastUpdated: Date;
  createdAt: Date;
}

export interface UserBehaviorPattern {
  pattern: string;
  frequency: number;
  confidence: number;
  context: string[];
  outcome: 'positive' | 'negative' | 'neutral';
}

export class UserPreferencesManager {
  private static instance: UserPreferencesManager | null = null;
  private userPreferences: Map<string, UserPreferences> = new Map();
  private behaviorPatterns: Map<string, UserBehaviorPattern[]> = new Map();

  public static getInstance(): UserPreferencesManager {
    if (!UserPreferencesManager.instance) {
      UserPreferencesManager.instance = new UserPreferencesManager();
    }
    return UserPreferencesManager.instance;
  }

  private constructor() {
    // Load existing preferences from storage on initialization
    this.loadPreferencesFromStorage();
  }

  /**
   * Get or create user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    let preferences = this.userPreferences.get(userId);
    
    if (!preferences) {
      preferences = this.createDefaultPreferences(userId);
      this.userPreferences.set(userId, preferences);
      await this.savePreferencesToStorage(userId, preferences);
    }
    
    return preferences;
  }

  /**
   * Update user preferences based on interaction
   */
  async updatePreferences(
    userId: string, 
    update: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    const preferences = await this.getUserPreferences(userId);
    
    const updatedPreferences: UserPreferences = {
      ...preferences,
      ...update,
      lastUpdated: new Date()
    };
    
    this.userPreferences.set(userId, updatedPreferences);
    await this.savePreferencesToStorage(userId, updatedPreferences);
    
    return updatedPreferences;
  }

  /**
   * Learn from user behavior patterns
   */
  async learnFromBehavior(
    userId: string,
    behavior: {
      action: string;
      context: string[];
      outcome: 'positive' | 'negative' | 'neutral';
      agent?: string;
      tools?: string[];
    }
  ): Promise<void> {
    console.log(`🧠 [UserPreferences] Learning from behavior for user: ${userId}`, {
      action: behavior.action,
      agent: behavior.agent,
      tools: behavior.tools,
      outcome: behavior.outcome
    });

    const preferences = await this.getUserPreferences(userId);
    
    // Update agent preferences
    if (behavior.agent && behavior.outcome === 'positive') {
      if (behavior.agent !== preferences.preferredAgent) {
        // Gradual adaptation towards successful agents
        preferences.learningProfile.adaptationRate += 0.1;
      }
    }
    
    // Update tool usage patterns
    if (behavior.tools) {
      behavior.tools.forEach(toolName => {
        const existingPattern = preferences.toolUsagePatterns.find(p => p.toolName === toolName);
        
        if (existingPattern) {
          existingPattern.frequency += 1;
          existingPattern.lastUsed = new Date();
          if (behavior.outcome === 'positive') {
            existingPattern.effectiveness = Math.min(existingPattern.effectiveness + 0.1, 1.0);
          }
        } else {
          preferences.toolUsagePatterns.push({
            toolName,
            frequency: 1,
            effectiveness: behavior.outcome === 'positive' ? 0.7 : 0.5,
            lastUsed: new Date()
          });
        }
      });
    }
    
    // Store behavior pattern
    const userPatterns = this.behaviorPatterns.get(userId) || [];
    userPatterns.push({
      pattern: behavior.action,
      frequency: 1,
      confidence: 0.7,
      context: behavior.context,
      outcome: behavior.outcome
    });
    
    this.behaviorPatterns.set(userId, userPatterns.slice(-50)); // Keep last 50 patterns
    
    await this.updatePreferences(userId, preferences);
    
    console.log(`📊 [UserPreferences] Learning completed for user: ${userId}`, {
      totalToolPatterns: preferences.toolUsagePatterns.length,
      adaptationRate: preferences.learningProfile.adaptationRate,
      totalSessions: preferences.sessionMetrics.totalSessions
    });
  }

  /**
   * Get intelligent recommendations based on user history
   */
  async getPersonalizedRecommendations(
    userId: string,
    currentContext: {
      currentAgent: string;
      recentTopics: string[];
      sessionLength: number;
    }
  ): Promise<{
    suggestedAgent?: string;
    suggestedTools: string[];
    rationale: string;
    confidence: number;
  }> {
    const preferences = await this.getUserPreferences(userId);
    const patterns = this.behaviorPatterns.get(userId) || [];
    
    // Analyze patterns for current context
    const relevantPatterns = patterns.filter(pattern =>
      pattern.context.some(ctx => currentContext.recentTopics.includes(ctx))
    );
    
    const successfulTools = preferences.toolUsagePatterns
      .filter(tool => tool.effectiveness > 0.6)
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 3)
      .map(tool => tool.toolName);
    
    let suggestedAgent = preferences.preferredAgent;
    let confidence = 0.7;
    let rationale = `Based on your preference for ${preferences.preferredAgent} agent`;
    
    // Context-based agent suggestion
    if (currentContext.recentTopics.some(topic => preferences.clinicalFocus.includes(topic))) {
      confidence += 0.2;
      rationale += ` and focus on ${preferences.clinicalFocus.join(', ')}`;
    }
    
    return {
      suggestedAgent: suggestedAgent !== currentContext.currentAgent ? suggestedAgent : undefined,
      suggestedTools: successfulTools,
      rationale,
      confidence: Math.min(confidence, 1.0)
    };
  }

  /**
   * Create default preferences for new user
   */
  private createDefaultPreferences(userId: string): UserPreferences {
    return {
      userId,
      preferredAgent: 'socratico',
      agentSwitchPatterns: [],
      communicationStyle: 'casual',
      clinicalFocus: [],
      toolUsagePatterns: [],
      sessionMetrics: {
        totalSessions: 0,
        averageSessionLength: 0,
        mostActiveTimeOfDay: 'morning',
        preferredSessionDuration: 30
      },
      learningProfile: {
        adaptationRate: 0.5,
        explorationVsTrust: 0.6,
        feedbackResponsiveness: 0.7
      },
      lastUpdated: new Date(),
      createdAt: new Date()
    };
  }

  /**
   * Load preferences from persistent storage
   */
  private async loadPreferencesFromStorage(): Promise<void> {
    // In a real implementation, this would load from IndexedDB or server
    // For now, using localStorage as fallback
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('hopeai_user_preferences');
        if (stored) {
          const preferences = JSON.parse(stored);
          Object.entries(preferences).forEach(([userId, prefs]) => {
            this.userPreferences.set(userId, prefs as UserPreferences);
          });
        }
      } catch (error) {
        console.warn('Failed to load user preferences from storage:', error);
      }
    }
  }

  /**
   * Save preferences to persistent storage
   */
  private async savePreferencesToStorage(userId: string, preferences: UserPreferences): Promise<void> {
    // Save to localStorage as fallback (in production, would use IndexedDB)
    if (typeof window !== 'undefined') {
      try {
        const allPreferences = Object.fromEntries(this.userPreferences.entries());
        localStorage.setItem('hopeai_user_preferences', JSON.stringify(allPreferences));
      } catch (error) {
        console.warn('Failed to save user preferences to storage:', error);
      }
    }
  }

  /**
   * Get user analytics and insights
   */
  async getUserAnalytics(userId: string): Promise<{
    totalSessions: number;
    favoriteAgent: string;
    topTools: string[];
    learningTrends: string[];
    efficiency: number;
  }> {
    const preferences = await this.getUserPreferences(userId);
    const patterns = this.behaviorPatterns.get(userId) || [];
    
    const positivePatterns = patterns.filter(p => p.outcome === 'positive');
    const efficiency = positivePatterns.length / Math.max(patterns.length, 1);
    
    return {
      totalSessions: preferences.sessionMetrics.totalSessions,
      favoriteAgent: preferences.preferredAgent,
      topTools: preferences.toolUsagePatterns
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 3)
        .map(t => t.toolName),
      learningTrends: preferences.clinicalFocus,
      efficiency
    };
  }
} 