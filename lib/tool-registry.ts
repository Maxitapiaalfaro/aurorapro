/**
 * Tool Registry — Security Category Registry for Unified Agent Tools
 *
 * Maps tool declaration names → security categories for the P0.1
 * permission system in streaming-handler.ts.
 *
 * Simplified from the original 535-line phantom-tool registry to only
 * register tools that actually reach Gemini via unified-tool-declarations.ts.
 *
 * @version 3.0.0 — Unified Agent Architecture
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Security category for pre-execution permission control (P0.1).
 *
 * - read-only: Tools that only read data without side-effects.
 *              Approved automatically.
 * - write: Tools that persist data (clinical memories, notes).
 *          Require psychologistId validation.
 * - external: Tools that send data outside the system (web searches).
 *             Require PII/PHI scanning of the payload.
 */
export type SecurityCategory = 'read-only' | 'write' | 'external';

export interface ToolMetadata {
  id: string;
  securityCategory: SecurityCategory;
}

export interface ClinicalTool {
  metadata: ToolMetadata;
  declaration: { name: string };
}

// ============================================================================
// TOOL DEFINITIONS — Only tools that Gemini can actually invoke
// ============================================================================

const registeredTools: ClinicalTool[] = [
  {
    metadata: { id: 'search_academic_literature', securityCategory: 'external' },
    declaration: { name: 'search_academic_literature' },
  },
  {
    metadata: { id: 'get_patient_memories', securityCategory: 'read-only' },
    declaration: { name: 'get_patient_memories' },
  },
  {
    metadata: { id: 'get_patient_record', securityCategory: 'read-only' },
    declaration: { name: 'get_patient_record' },
  },
  {
    metadata: { id: 'save_clinical_memory', securityCategory: 'write' },
    declaration: { name: 'save_clinical_memory' },
  },
  {
    metadata: { id: 'create_patient', securityCategory: 'write' },
    declaration: { name: 'create_patient' },
  },
  {
    metadata: { id: 'list_patients', securityCategory: 'read-only' },
    declaration: { name: 'list_patients' },
  },
  {
    metadata: { id: 'google_search', securityCategory: 'external' },
    declaration: { name: 'google_search' },
  },
  // Sub-agent tools
  {
    metadata: { id: 'explore_patient_context', securityCategory: 'read-only' },
    declaration: { name: 'explore_patient_context' },
  },
  {
    metadata: { id: 'generate_clinical_document', securityCategory: 'read-only' },
    declaration: { name: 'generate_clinical_document' },
  },
  {
    metadata: { id: 'update_clinical_document', securityCategory: 'write' },
    declaration: { name: 'update_clinical_document' },
  },
  {
    metadata: { id: 'research_evidence', securityCategory: 'external' },
    declaration: { name: 'research_evidence' },
  },
  {
    metadata: { id: 'analyze_longitudinal_patterns', securityCategory: 'read-only' },
    declaration: { name: 'analyze_longitudinal_patterns' },
  },
];

// ============================================================================
// REGISTRY CLASS (Singleton — consumed by streaming-handler.ts)
// ============================================================================

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, ClinicalTool> = new Map();

  private constructor() {
    for (const tool of registeredTools) {
      this.tools.set(tool.metadata.id, tool);
    }
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Lookup a tool by its Gemini function-call name.
   * Used by streaming-handler.ts for P0.1 security category resolution.
   */
  public getToolByDeclarationName(declarationName: string): ClinicalTool | undefined {
    return Array.from(this.tools.values()).find(
      tool => tool.declaration.name === declarationName
    );
  }

  public getAllTools(): ClinicalTool[] {
    return Array.from(this.tools.values());
  }

  public registerTool(tool: ClinicalTool): void {
    this.tools.set(tool.metadata.id, tool);
  }
}

export const toolRegistry = ToolRegistry.getInstance();
