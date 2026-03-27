import type { ChatMessage } from "@/types/clinical-types"

interface OptimizationStrategy {
  name: string
  description: string
  execute: (history: ChatMessage[], currentQuery: string) => Promise<ChatMessage[]>
}

export class ContextOptimizationManager {
  private readonly MAX_CONTEXT_TOKENS = 900000 // 90% of 1M token limit
  private readonly SLIDING_WINDOW_SIZE = 50 // Number of recent messages to preserve
  private readonly CRITICAL_MESSAGE_COUNT = 10 // Number of critical messages to preserve

  private strategies: Map<string, OptimizationStrategy> = new Map()

  constructor() {
    this.initializeStrategies()
  }

  private initializeStrategies() {
    // Sliding window with critical message preservation
    this.strategies.set("sliding_window_with_preservation", {
      name: "Sliding Window with Preservation",
      description: "Preserves recent messages and critical context",
      execute: this.applySlidingWindowWithPreservation.bind(this),
    })

    // Semantic compression
    this.strategies.set("semantic_compression", {
      name: "Semantic Compression",
      description: "Compresses similar messages while preserving meaning",
      execute: this.applySemanticCompression.bind(this),
    })

    // Clinical context preservation
    this.strategies.set("clinical_context_preservation", {
      name: "Clinical Context Preservation",
      description: "Preserves clinically relevant information",
      execute: this.applyClinicalContextPreservation.bind(this),
    })
  }

  async optimizeContextForLongConversation(
    chatHistory: ChatMessage[],
    currentQuery: string,
    strategy = "sliding_window_with_preservation",
  ): Promise<ChatMessage[]> {
    // Calculate current token count
    const totalTokens = await this.calculateTokens(chatHistory)

    if (totalTokens <= this.MAX_CONTEXT_TOKENS) {
      return chatHistory // No optimization needed
    }

    const optimizationStrategy = this.strategies.get(strategy)
    if (!optimizationStrategy) {
      throw new Error(`Unknown optimization strategy: ${strategy}`)
    }

    return await optimizationStrategy.execute(chatHistory, currentQuery)
  }

  private async applySlidingWindowWithPreservation(
    history: ChatMessage[],
    currentQuery: string,
  ): Promise<ChatMessage[]> {
    if (history.length <= this.SLIDING_WINDOW_SIZE) {
      return history
    }

    // 1. Preserve initial context (first few messages)
    const initialContext = history.slice(0, 4)

    // 2. Preserve recent context
    const recentContext = history.slice(-this.SLIDING_WINDOW_SIZE)

    // 3. Identify critical messages in the middle
    const middleHistory = history.slice(4, -this.SLIDING_WINDOW_SIZE)
    const criticalMessages = await this.identifyCriticalMessages(middleHistory, currentQuery)

    // 4. Combine contexts
    const optimizedHistory = [...initialContext, ...criticalMessages, ...recentContext]

    // Remove duplicates while preserving order
    const seen = new Set<string>()
    return optimizedHistory.filter((msg) => {
      if (seen.has(msg.id)) {
        return false
      }
      seen.add(msg.id)
      return true
    })
  }

  private async applySemanticCompression(history: ChatMessage[], currentQuery: string): Promise<ChatMessage[]> {
    // Group similar messages and create summaries
    const compressed: ChatMessage[] = []
    const groups = await this.groupSimilarMessages(history)

    for (const group of groups) {
      if (group.length === 1) {
        compressed.push(group[0])
      } else {
        // Create a summary message for the group
        const summary = await this.createMessageSummary(group)
        compressed.push(summary)
      }
    }

    return compressed
  }

  private async applyClinicalContextPreservation(history: ChatMessage[], currentQuery: string): Promise<ChatMessage[]> {
    // Identify and preserve clinically relevant messages
    const clinicalKeywords = [
      "diagnóstico",
      "síntomas",
      "tratamiento",
      "terapia",
      "paciente",
      "sesión",
      "intervención",
      "evaluación",
      "plan",
      "objetivo",
    ]

    const clinicalMessages = history.filter((msg) =>
      clinicalKeywords.some((keyword) => msg.content.toLowerCase().includes(keyword)),
    )

    const recentMessages = history.slice(-20) // Last 20 messages

    // Combine and deduplicate
    const preserved = [...clinicalMessages, ...recentMessages]
    const seen = new Set<string>()
    return preserved.filter((msg) => {
      if (seen.has(msg.id)) {
        return false
      }
      seen.add(msg.id)
      return true
    })
  }

  private async calculateTokens(history: ChatMessage[]): Promise<number> {
    // Rough estimation: ~4 characters per token for Spanish text
    const totalChars = history.reduce((sum, msg) => sum + msg.content.length, 0)
    return Math.ceil(totalChars / 4)
  }

  private async identifyCriticalMessages(middleHistory: ChatMessage[], currentQuery: string): Promise<ChatMessage[]> {
    // Simple relevance scoring based on keyword matching
    const queryWords = currentQuery.toLowerCase().split(/\s+/)

    const scoredMessages = middleHistory.map((msg) => {
      const content = msg.content.toLowerCase()
      const score = queryWords.reduce((sum, word) => {
        return sum + (content.includes(word) ? 1 : 0)
      }, 0)

      return { message: msg, score }
    })

    // Return top N most relevant messages
    return scoredMessages
      .sort((a, b) => b.score - a.score)
      .slice(0, this.CRITICAL_MESSAGE_COUNT)
      .map((item) => item.message)
  }

  private async groupSimilarMessages(history: ChatMessage[]): Promise<ChatMessage[][]> {
    // Simple grouping based on message similarity
    // In a real implementation, you might use embeddings for better similarity detection
    const groups: ChatMessage[][] = []
    const processed = new Set<string>()

    for (const message of history) {
      if (processed.has(message.id)) continue

      const group = [message]
      processed.add(message.id)

      // Find similar messages
      for (const otherMessage of history) {
        if (processed.has(otherMessage.id)) continue

        if (this.calculateSimilarity(message.content, otherMessage.content) > 0.7) {
          group.push(otherMessage)
          processed.add(otherMessage.id)
        }
      }

      groups.push(group)
    }

    return groups
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))

    const intersection = new Set([...words1].filter((word) => words2.has(word)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }

  private async createMessageSummary(messages: ChatMessage[]): Promise<ChatMessage> {
    // Create a summary message from a group of similar messages
    const combinedContent = messages.map((msg) => msg.content).join(" ")
    const summary =
      combinedContent.length > 200 ? combinedContent.substring(0, 200) + "... [resumido]" : combinedContent

    return {
      id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: `[Resumen de ${messages.length} mensajes]: ${summary}`,
      role: messages[0].role,
      agent: messages[0].agent,
      timestamp: messages[messages.length - 1].timestamp,
    }
  }

  getAvailableStrategies(): Array<{ name: string; description: string }> {
    return Array.from(this.strategies.values()).map((strategy) => ({
      name: strategy.name,
      description: strategy.description,
    }))
  }
}

// Singleton instance
export const contextOptimizer = new ContextOptimizationManager()
