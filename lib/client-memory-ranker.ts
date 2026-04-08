/**
 * Client-side memory ranking — ported from lib/clinical-memory-system.ts
 *
 * Trivial bag-of-words scoring. Runs client-side to avoid a Firestore
 * round-trip on every chat message (local-first principle).
 */
import type { ClinicalMemory } from '@/types/memory-types'

const STOP_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'por', 'para', 'sin',
  'que', 'es', 'se', 'su', 'sus', 'como', 'pero', 'mas',
  'ya', 'no', 'si', 'ha', 'han', 'fue', 'ser', 'muy',
  'y', 'o', 'a', 'e', 'u', 'lo', 'le', 'les', 'me', 'te',
  'nos', 'esto', 'esta', 'ese', 'esa', 'esos', 'esas',
  'este', 'estos', 'estas', 'aquel', 'aquella',
  'tiene', 'puede', 'hace', 'sobre', 'entre', 'desde',
  'hasta', 'cada', 'todo', 'toda', 'todos', 'todas',
  'otro', 'otra', 'otros', 'otras', 'mismo', 'misma',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
}

/**
 * Rank memories by keyword relevance to the given message.
 * Returns the top `limit` memories as `{ category, content }` pairs
 * ready to be sent as part of ClientContext.
 */
export function rankMemories(
  memories: ClinicalMemory[],
  message: string,
  limit: number = 5,
): Array<{ category: ClinicalMemory['category']; content: string }> {
  if (memories.length === 0) return []

  const contextTokens = tokenize(message)

  if (contextTokens.length === 0) {
    return memories
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit)
      .map((m) => ({ category: m.category, content: m.content }))
  }

  const scored = memories.map((memory) => {
    const memoryTokens = tokenize(`${memory.content} ${memory.tags.join(' ')}`)
    const matchCount = contextTokens.filter((t) => memoryTokens.includes(t)).length
    const keywordScore = matchCount / contextTokens.length
    const combinedScore = keywordScore * 0.6 + memory.relevanceScore * 0.2 + memory.confidence * 0.2
    return { memory, score: combinedScore }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ category: s.memory.category, content: s.memory.content }))
}
