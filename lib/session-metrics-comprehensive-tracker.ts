/**
 * Comprehensive Session Metrics Tracker
 * 
 * Captures complete metrics for behavioral analysis:
 * - Complete token consumption (input + output + context)
 * - End-to-end timing (total response time)
 * - Computational cost analysis
 * - User behavior patterns
 * 
 * CRITICAL: These metrics enable proper cross-session learning
 * and performance optimization based on real usage patterns.
 */

export interface ComprehensiveSessionMetrics {
  sessionId: string;
  userId: string;
  interactionId: string;
  timestamp: Date;
  
  // COMPLETE TOKEN METRICS
  tokens: {
    inputTokens: number;           // User input tokens
    outputTokens: number;          // Model response tokens  
    contextTokens: number;         // Historical context tokens
    totalTokens: number;           // Sum of all tokens
    estimatedCost: number;         // Cost in USD based on model pricing
  };
  
  // END-TO-END TIMING METRICS  
  timing: {
    requestStartTime: number;      // When request initiated
    orchestrationStartTime: number; // When orchestration began
    modelCallStartTime: number;    // When model call started
    modelCallEndTime: number;      // When model response complete
    responseEndTime: number;       // When full response sent
    
    // Calculated durations
    orchestrationTime: number;     // Time to select agent & tools
    modelResponseTime: number;     // Time for model to respond
    totalResponseTime: number;     // End-to-end response time
  };
  
  // COMPUTATIONAL CONTEXT
  computational: {
    agentUsed: string;
    toolsUsed: string[];
    modelUsed: string;             // e.g., "gemini-2.5-flash-lite"
    contextWindowSize: number;     // Actual context window used
    streamingChunks?: number;      // If streaming response
  };
  
  // USER BEHAVIOR CONTEXT
  behavioral: {
    messageLength: number;         // Length of user input
    responseLength: number;        // Length of model response
    agentSwitched: boolean;        // Did agent change this turn?
    previousAgent?: string;        // Previous agent if switched
    sessionPosition: number;       // Message number in session
    timeSinceLastMessage?: number; // Time since previous message
  };
  
  // PERFORMANCE INDICATORS
  performance: {
    tokensPerSecond: number;       // Throughput metric
    costEfficiency: number;        // Value/cost ratio
    userSatisfactionPredicted?: number; // ML prediction based on patterns
  };
}

export interface SessionMetricsSnapshot {
  sessionId: string;
  userId: string;
  totalInteractions: number;
  
  // AGGREGATE METRICS
  totals: {
    tokensConsumed: number;
    totalCost: number;
    totalTime: number;
    averageResponseTime: number;
  };
  
  // EFFICIENCY METRICS
  efficiency: {
    tokensPerInteraction: number;
    costPerInteraction: number;
    averageTokensPerSecond: number;
  };
  
  // BEHAVIORAL PATTERNS
  patterns: {
    preferredAgent: string;
    mostUsedTools: string[];
    averageMessageLength: number;
    agentSwitchFrequency: number;
  };
}

export class SessionMetricsComprehensiveTracker {
  private static instance: SessionMetricsComprehensiveTracker | null = null;
  private activeInteractions: Map<string, Partial<ComprehensiveSessionMetrics>> = new Map();
  private sessionSnapshots: Map<string, SessionMetricsSnapshot> = new Map();
  private interactions: Map<string, ComprehensiveSessionMetrics[]> = new Map();
  
  // Model pricing (per 1K tokens in USD) - Based on official Google AI pricing
  // Reference: https://ai.google.dev/gemini-api/docs/pricing
  private readonly MODEL_PRICING: Record<string, { 
    inputCostPer1KTokens: number; 
    outputCostPer1KTokens: number;
    displayName: string;
  }> = {
    'gemini-2.5-pro': {
      inputCostPer1KTokens: 0.00030,      // $0.30 per 1M tokens = $0.0003 per 1K
      outputCostPer1KTokens: 0.00250,     // $2.50 per 1M tokens = $0.0025 per 1K
      displayName: 'Gemini 2.5 Pro'
    },
    'gemini-2.5-flash': {
      inputCostPer1KTokens: 0.00030,      // $0.30 per 1M tokens = $0.0003 per 1K
      outputCostPer1KTokens: 0.00250,     // $2.50 per 1M tokens = $0.0025 per 1K
      displayName: 'Gemini 2.5 Flash'
    },
    'gemini-2.5-flash-lite': {
      inputCostPer1KTokens: 0.00010,      // $0.10 per 1M tokens = $0.0001 per 1K
      outputCostPer1KTokens: 0.00040,     // $0.40 per 1M tokens = $0.0004 per 1K
      displayName: 'Gemini 2.5 Flash-Lite'
    }
  };

  public static getInstance(): SessionMetricsComprehensiveTracker {
    if (!SessionMetricsComprehensiveTracker.instance) {
      SessionMetricsComprehensiveTracker.instance = new SessionMetricsComprehensiveTracker();
    }
    return SessionMetricsComprehensiveTracker.instance;
  }

  private constructor() {
    // 🔒 SECURITY: Console logging disabled in production
  }

  /**
   * Start tracking a new interaction
   */
  startInteraction(sessionId: string, userId: string, userInput: string): string {
    const interactionId = `${sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const interaction: Partial<ComprehensiveSessionMetrics> = {
      sessionId,
      userId,
      interactionId,
      timestamp: new Date(),
      timing: {
        requestStartTime: now,
        orchestrationStartTime: 0,
        modelCallStartTime: 0,
        modelCallEndTime: 0,
        responseEndTime: 0,
        orchestrationTime: 0,
        modelResponseTime: 0,
        totalResponseTime: 0
      },
      behavioral: {
        messageLength: userInput.length,
        responseLength: 0,
        agentSwitched: false,
        sessionPosition: this.getSessionPosition(sessionId),
        timeSinceLastMessage: this.getTimeSinceLastMessage(sessionId)
      }
    };
    
    this.activeInteractions.set(interactionId, interaction);

    // 🔒 SECURITY: Console logging disabled in production
    return interactionId;
  }

  /**
   * Record orchestration completion
   */
  recordOrchestrationComplete(
    interactionId: string, 
    agent: string, 
    tools: string[], 
    previousAgent?: string
  ): void {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction || !interaction.timing) return;

    const now = Date.now();
    interaction.timing.orchestrationStartTime = interaction.timing.requestStartTime;
    interaction.timing.orchestrationTime = now - interaction.timing.requestStartTime;
    
    if (!interaction.computational) interaction.computational = {} as any;
    interaction.computational!.agentUsed = agent;
    interaction.computational!.toolsUsed = tools;
    
    if (!interaction.behavioral) interaction.behavioral = {} as any;
    interaction.behavioral!.agentSwitched = previousAgent ? previousAgent !== agent : false;
    interaction.behavioral!.previousAgent = previousAgent;

    // 🔒 SECURITY: Console logging disabled in production
  }

  /**
   * Record model call start
   */
  recordModelCallStart(interactionId: string, model: string, contextTokens: number): void {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction || !interaction.timing) return;

    interaction.timing.modelCallStartTime = Date.now();
    
    if (!interaction.computational) interaction.computational = {} as any;
    interaction.computational!.modelUsed = model;
    interaction.computational!.contextWindowSize = contextTokens;
    
    if (!interaction.tokens) {
      interaction.tokens = {
        contextTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0
      } as any;
    }
    interaction.tokens!.contextTokens = contextTokens;

    // 🔒 SECURITY: Console logging disabled in production
  }

  /**
   * Record model call completion with token counts
   */
  recordModelCallComplete(
    interactionId: string, 
    inputTokens: number, 
    outputTokens: number,
    responseText: string
  ): void {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction || !interaction.timing || !interaction.tokens) return;

    const now = Date.now();
    interaction.timing.modelCallEndTime = now;
    interaction.timing.modelResponseTime = now - interaction.timing.modelCallStartTime;
    
    // Complete token metrics
    interaction.tokens.inputTokens = inputTokens;
    interaction.tokens.outputTokens = outputTokens;
    interaction.tokens.totalTokens = inputTokens + outputTokens + (interaction.tokens.contextTokens || 0);
    
    // Calculate estimated cost with defensive checks
    const model = interaction.computational?.modelUsed || 'gemini-2.5-flash-lite';
    const pricing = this.MODEL_PRICING[model] || this.MODEL_PRICING['gemini-2.5-flash-lite'];
    
    // Ensure pricing exists and has required properties
    if (pricing && pricing.inputCostPer1KTokens !== undefined && pricing.outputCostPer1KTokens !== undefined) {
      interaction.tokens.estimatedCost = 
        (inputTokens / 1000) * pricing.inputCostPer1KTokens + 
        (outputTokens / 1000) * pricing.outputCostPer1KTokens;
    } else {
      // Default to 0 if pricing is not available
      interaction.tokens.estimatedCost = 0;
      console.warn(`⚠️ [SessionMetrics] Pricing not available for model ${model}, defaulting to $0.00`);
    }
    
    // Behavioral metrics
    if (interaction.behavioral) {
      interaction.behavioral.responseLength = responseText.length;
    }

    // 🔍 DEBUG: Log what was recorded
    console.log(`📊 [SessionMetrics] recordModelCallComplete - ID: ${interactionId}`);
    console.log(`📊 [SessionMetrics] Input: ${inputTokens}, Output: ${outputTokens}, Total: ${interaction.tokens.totalTokens}`);
    console.log(`📊 [SessionMetrics] Model: ${model}, Cost: $${interaction.tokens.estimatedCost.toFixed(6)}`);
  }

  /**
   * Complete interaction tracking
   */
  completeInteraction(interactionId: string): ComprehensiveSessionMetrics | null {
    const interaction = this.activeInteractions.get(interactionId);
    if (!interaction || !interaction.timing || !interaction.tokens) return null;

    const now = Date.now();
    interaction.timing.responseEndTime = now;
    interaction.timing.totalResponseTime = now - interaction.timing.requestStartTime;
    
    // Calculate performance metrics
    if (!interaction.performance) interaction.performance = {} as any;
    interaction.performance!.tokensPerSecond = 
      interaction.tokens.totalTokens / (interaction.timing.totalResponseTime / 1000);
    interaction.performance!.costEfficiency = 
      interaction.tokens.totalTokens / Math.max(interaction.tokens.estimatedCost, 0.000001);
    
    const completedInteraction = interaction as ComprehensiveSessionMetrics;
    
    // 🔍 DEBUG: Log what we're saving
    console.log(`📊 [SessionMetrics] completeInteraction - ID: ${interactionId}, Session: ${completedInteraction.sessionId}`);
    console.log(`📊 [SessionMetrics] Tokens: ${completedInteraction.tokens.totalTokens}, Cost: $${completedInteraction.tokens.estimatedCost.toFixed(6)}`);
    console.log(`📊 [SessionMetrics] Time: ${completedInteraction.timing.totalResponseTime}ms, Agent: ${completedInteraction.computational?.agentUsed}`);
    
    // Store in session history
    if (!this.interactions.has(completedInteraction.sessionId)) {
      this.interactions.set(completedInteraction.sessionId, []);
      console.log(`📊 [SessionMetrics] Created new interaction array for session ${completedInteraction.sessionId}`);
    }
    this.interactions.get(completedInteraction.sessionId)!.push(completedInteraction);
    console.log(`📊 [SessionMetrics] Added interaction to session. Total interactions now: ${this.interactions.get(completedInteraction.sessionId)!.length}`);
    
    // Update session snapshot
    this.updateSessionSnapshot(completedInteraction);
    
    // Clean up active tracking
    this.activeInteractions.delete(interactionId);

    return completedInteraction;
  }

  /**
   * Get session metrics for analysis
   */
  getSessionMetrics(sessionId: string): {
    snapshot: SessionMetricsSnapshot | null;
    interactions: ComprehensiveSessionMetrics[];
  } {
    return {
      snapshot: this.sessionSnapshots.get(sessionId) || null,
      interactions: this.interactions.get(sessionId) || []
    };
  }

  /**
   * Get model pricing information
   */
  getModelPricing(model?: string) {
    if (model && this.MODEL_PRICING[model]) {
      return this.MODEL_PRICING[model];
    }
    return this.MODEL_PRICING; // Return all pricing
  }

  /**
   * Get user behavioral patterns across sessions
   */
  getUserBehavioralPatterns(userId: string): {
    totalInteractions: number;
    averageTokensPerInteraction: number;
    averageCostPerInteraction: number;
    averageResponseTime: number;
    preferredAgents: { [agent: string]: number };
    mostUsedTools: { [tool: string]: number };
    efficiencyTrend: number; // Improving = positive, declining = negative
  } {
    const userInteractions: ComprehensiveSessionMetrics[] = [];
    
    // Collect all interactions for this user
    for (const sessionInteractions of this.interactions.values()) {
      userInteractions.push(...sessionInteractions.filter(i => i.userId === userId));
    }
    
    if (userInteractions.length === 0) {
      return {
        totalInteractions: 0,
        averageTokensPerInteraction: 0,
        averageCostPerInteraction: 0,
        averageResponseTime: 0,
        preferredAgents: {},
        mostUsedTools: {},
        efficiencyTrend: 0
      };
    }
    
    // Calculate aggregates
    const totalTokens = userInteractions.reduce((sum, i) => sum + i.tokens.totalTokens, 0);
    const totalCost = userInteractions.reduce((sum, i) => sum + (i.tokens.estimatedCost || 0), 0);
    const totalTime = userInteractions.reduce((sum, i) => sum + i.timing.totalResponseTime, 0);
    
    // Calculate preferences
    const agentCounts: { [agent: string]: number } = {};
    const toolCounts: { [tool: string]: number } = {};
    
    userInteractions.forEach(interaction => {
      agentCounts[interaction.computational.agentUsed] = 
        (agentCounts[interaction.computational.agentUsed] || 0) + 1;
      
      interaction.computational.toolsUsed.forEach(tool => {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      });
    });
    
    // Calculate efficiency trend (simple linear regression on tokens per second)
    const efficiencyTrend = this.calculateEfficiencyTrend(userInteractions);
    
    return {
      totalInteractions: userInteractions.length,
      averageTokensPerInteraction: totalTokens / userInteractions.length,
      averageCostPerInteraction: totalCost / userInteractions.length,
      averageResponseTime: totalTime / userInteractions.length,
      preferredAgents: agentCounts,
      mostUsedTools: toolCounts,
      efficiencyTrend
    };
  }

  // PRIVATE HELPER METHODS

  private getSessionPosition(sessionId: string): number {
    const sessionInteractions = this.interactions.get(sessionId) || [];
    return sessionInteractions.length + 1;
  }

  private getTimeSinceLastMessage(sessionId: string): number | undefined {
    const sessionInteractions = this.interactions.get(sessionId) || [];
    if (sessionInteractions.length === 0) return undefined;
    
    const lastInteraction = sessionInteractions[sessionInteractions.length - 1];
    return Date.now() - lastInteraction.timestamp.getTime();
  }

  private updateSessionSnapshot(interaction: ComprehensiveSessionMetrics): void {
    const sessionId = interaction.sessionId;
    const sessionInteractions = this.interactions.get(sessionId) || [];
    
    // 🔍 DEBUG: Log what we're working with
    console.log(`📊 [SessionMetrics] Updating snapshot for session ${sessionId}`);
    console.log(`📊 [SessionMetrics] Total interactions in session: ${sessionInteractions.length}`);
    if (sessionInteractions.length > 0) {
      const lastInteraction = sessionInteractions[sessionInteractions.length - 1];
      console.log(`📊 [SessionMetrics] Last interaction tokens: ${lastInteraction.tokens.totalTokens}, cost: $${lastInteraction.tokens.estimatedCost}`);
    }
    
    const totalTokens = sessionInteractions.reduce((sum, i) => sum + i.tokens.totalTokens, 0);
    const totalCost = sessionInteractions.reduce((sum, i) => sum + (i.tokens.estimatedCost || 0), 0);
    const totalTime = sessionInteractions.reduce((sum, i) => sum + i.timing.totalResponseTime, 0);
    
    console.log(`📊 [SessionMetrics] Calculated totals - Tokens: ${totalTokens}, Cost: $${totalCost}, Time: ${totalTime}ms`);
    
    // Agent preferences
    const agentCounts: { [agent: string]: number } = {};
    sessionInteractions.forEach(i => {
      agentCounts[i.computational.agentUsed] = (agentCounts[i.computational.agentUsed] || 0) + 1;
    });
    const preferredAgent = Object.keys(agentCounts).reduce((a, b) => 
      agentCounts[a] > agentCounts[b] ? a : b);
    
    // Tool usage
    const toolCounts: { [tool: string]: number } = {};
    sessionInteractions.forEach(i => {
      i.computational.toolsUsed.forEach(tool => {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      });
    });
    const mostUsedTools = Object.keys(toolCounts)
      .sort((a, b) => toolCounts[b] - toolCounts[a])
      .slice(0, 5);
    
    const snapshot: SessionMetricsSnapshot = {
      sessionId,
      userId: interaction.userId,
      totalInteractions: sessionInteractions.length,
      totals: {
        tokensConsumed: totalTokens,
        totalCost,
        totalTime,
        averageResponseTime: totalTime / sessionInteractions.length
      },
      efficiency: {
        tokensPerInteraction: totalTokens / sessionInteractions.length,
        costPerInteraction: totalCost / sessionInteractions.length,
        averageTokensPerSecond: totalTokens / (totalTime / 1000)
      },
      patterns: {
        preferredAgent,
        mostUsedTools,
        averageMessageLength: sessionInteractions.reduce((sum, i) => sum + i.behavioral.messageLength, 0) / sessionInteractions.length,
        agentSwitchFrequency: sessionInteractions.filter(i => i.behavioral.agentSwitched).length / sessionInteractions.length
      }
    };
    
    this.sessionSnapshots.set(sessionId, snapshot);
  }

  private calculateEfficiencyTrend(interactions: ComprehensiveSessionMetrics[]): number {
    if (interactions.length < 2) return 0;
    
    // Simple linear regression on tokens per second over time
    const points = interactions.map((interaction, index) => ({
      x: index,
      y: interaction.performance.tokensPerSecond
    }));
    
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope; // Positive = improving efficiency, negative = declining
  }
}

// Export singleton instance for global use
export const sessionMetricsTracker = SessionMetricsComprehensiveTracker.getInstance(); 