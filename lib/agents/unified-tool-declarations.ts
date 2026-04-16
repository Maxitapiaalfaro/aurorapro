/**
 * Unified Tool Declarations — Gemini FunctionDeclaration format
 *
 * All tools visible to the unified Aurora agent. Tool descriptions
 * follow Claude Code's pattern: what it does, when to use, when NOT to use.
 * This is the routing mechanism — the model decides which tools to invoke
 * based on these descriptions.
 *
 * Performance: Declarations loaded from external .json file at runtime to
 * avoid webpack serializing ~26KB of object constants into its cache, which
 * caused "Serializing big strings" warnings and slow dev server starts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let _cached: any[] | null = null

/**
 * Returns unified tool declarations, lazily loaded from disk.
 * Cached after first read — zero cost on subsequent calls.
 */
export function getUnifiedToolDeclarations(): any[] {
  if (!_cached) {
    _cached = JSON.parse(
      readFileSync(
        join(process.cwd(), 'lib/agents/prompts/unified-tool-declarations.json'),
        'utf-8',
      ),
    )
  }
  return _cached!
}
