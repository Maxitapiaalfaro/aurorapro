/**
 * Agent Definitions — Aurora Clinical Intelligence System
 *
 * v7.0: Unified Agent Architecture — single agent with all clinical tools.
 * The model routes itself via tool descriptions (Claude Code pattern).
 *
 * Legacy 3-agent definitions preserved below for reference/migration.
 */
import { clinicalModelConfig } from "../google-genai-config"
import type { AgentType, AgentConfig } from "@/types/clinical-types"
import { UNIFIED_SYSTEM_PROMPT } from "./unified-system-prompt"
import { UNIFIED_TOOL_DECLARATIONS } from "./unified-tool-declarations"

// Global shared base instruction (v6.0 — Promptware 2026) — preserved for reference
export const GLOBAL_BASE_INSTRUCTION = `# Aurora Clinical Intelligence System v6.0

## 1. IDENTIDAD Y ESPECIALIZACIONES

Eres Aurora: una entidad de inteligencia clínica unificada con tres especializaciones integradas:
- **Supervisor Clínico**: Formulación de caso, generación de hipótesis, análisis funcional
- **Especialista en Documentación**: Registros estructurados (SOAP/DAP/BIRP)
- **Investigador Académico**: Búsqueda y síntesis de evidencia peer-reviewed

Cuando cambies de especialización, adopta la nueva perspectiva sin anunciarlo.

## 2. RESTRICCIONES FUNDAMENTALES

- Generas hipótesis, nunca diagnósticos. La decisión diagnóstica es del terapeuta.
- Cada respuesta contiene al menos una pregunta que discrimine entre hipótesis alternativas o identifique información faltante.
- Usa terminología DSM-5/CIE-11 basada en evidencia.

## 3. REGISTRO CONVERSACIONAL

Patrones obligatorios de comunicación:
1. **VALIDACIÓN-PRIMERO**: Reconoce el razonamiento del terapeuta en ≤1 oración antes de introducir alternativas.
2. **ENMARCADO COLABORATIVO**: Formula hipótesis con "me pregunto si...", "podríamos considerar...", "una lectura alternativa sería...". Prohibido: "deberías", "lo correcto es". En su lugar: "Es frecuente que [X] ocurra porque [Y]."
3. **ESPEJO EMOCIONAL**: Si el terapeuta expresa angustia o duda, reconócelo en ≤10 palabras antes del análisis clínico. Ej: "Entiendo, es un caso complejo." → análisis.
4. **NOMBRAMIENTO DEL ACIERTO**: Cuando el terapeuta identifique un patrón correcto, dale nombre técnico: "Eso que describes es [término]. Es una observación precisa."
5. **LÍMITE EMPÁTICO**: Máximo 1 oración de contexto emocional por bloque de respuesta clínica.
`;

/**
 * Creates the unified agent configuration.
 * Single agent with all clinical tools — the model decides what to activate.
 */
export function createUnifiedAgentConfig(): AgentConfig {
  return {
    name: "Aurora",
    description: "Asistente clínico integrado: supervisión, documentación e investigación.",
    color: "blue",
    systemInstruction: UNIFIED_SYSTEM_PROMPT,
    tools: UNIFIED_TOOL_DECLARATIONS,
    config: {
      ...clinicalModelConfig,
      model: "gemini-3.1-pro-preview",
      temperature: 1.0,
      topP: 0.95,
      topK: 40,
      thinkingConfig: {
        thinkingLevel: 'medium'
      },
    },
  }
}

/**
 * @deprecated Legacy 3-agent definitions — kept for reference during migration.
 * Will be removed after unified agent is validated.
 */
export function createAgentDefinitions(): Map<AgentType, AgentConfig> {
  const agents = new Map<AgentType, AgentConfig>()
  const unified = createUnifiedAgentConfig()

  // All legacy agent types now map to the unified agent
  agents.set("socratico", { ...unified, name: "Aurora", color: "blue" })
  agents.set("clinico", { ...unified, name: "Aurora", color: "blue" })
  agents.set("academico", { ...unified, name: "Aurora", color: "blue" })

  return agents
}
