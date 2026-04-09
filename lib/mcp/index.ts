/**
 * MCP Module — Aurora/HopeAI
 *
 * Barrel export for the Model Context Protocol integration layer.
 *
 * Architecture: MCP provides external tool discovery and execution.
 * Internal agent communication uses direct in-process calls (never MCP).
 * See: docs/architecture/agent-tree-mcp-relationship-analysis.md
 *
 * @module lib/mcp
 */

// Types
export type {
  MCPTransportType,
  MCPServerConfig,
  MCPTransportConfig,
  MCPToolDefinition,
  MCPRegisteredTool,
  MCPToolCallResult,
  MCPContent,
  MCPServerConnection,
  IMCPRegistry,
} from './types';

// Registry
export { MCPRegistry } from './mcp-registry';

// Tool Wrapper
export {
  mcpToolName,
  parseMCPToolName,
  createMCPToolHandler,
  registerMCPToolHandlers,
} from './mcp-tool-wrapper';

// Initialization
export { initializeMCP } from './mcp-init';
