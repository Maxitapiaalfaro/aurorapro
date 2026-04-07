/**
 * Shared types for sub-agent implementations.
 *
 * Each sub-agent spawns a secondary Gemini call (gemini-2.5-flash)
 * to perform a specialized task and returns the result to the main agent.
 */

export interface SubAgentResult {
  success: boolean;
  data: unknown;
  model: string;
  durationMs: number;
}

export interface SubAgentContext {
  psychologistId: string;
  sessionId: string;
  patientId?: string;
}

/** Model used by all sub-agents — fast and cheap for delegated tasks. */
export const SUBAGENT_MODEL = 'gemini-2.5-flash';
