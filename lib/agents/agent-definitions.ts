/**
 * Agent Definitions — Aurora Clinical Intelligence System
 *
 * v7.0: Unified Agent Architecture — single agent with all clinical tools.
 * The model routes itself via tool descriptions (Claude Code pattern).
 */
import { clinicalModelConfig } from "../google-genai-config"
import type { AgentType, AgentConfig } from "@/types/clinical-types"
import { getUnifiedSystemPrompt } from "./unified-system-prompt"
import { getUnifiedToolDeclarations } from "./unified-tool-declarations"

/**
 * Creates the unified agent configuration.
 * Single agent with all clinical tools — the model decides what to activate.
 */
export function createUnifiedAgentConfig(): AgentConfig {
  return {
    name: "Aurora",
    description: "Asistente clínico integrado: supervisión, documentación e investigación.",
    color: "blue",
    systemInstruction: getUnifiedSystemPrompt(),
    tools: getUnifiedToolDeclarations(),
    config: {
      ...clinicalModelConfig,
      model: "gemini-3.1-pro-preview",
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      thinkingConfig: {
        thinkingLevel: 'low'
      },
    },
  }
}


