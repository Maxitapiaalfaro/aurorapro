/**
 * MCP Tool Wrapper — Bridges MCP tools into Aurora's ToolHandler interface
 *
 * Makes MCP tools indistinguishable from native tools at the agent level.
 * Each MCP tool is wrapped into a standard `ToolHandler` that:
 * 1. Passes through the same permission system (tool-permissions.ts)
 * 2. Goes through the same orchestrator (tool-orchestrator.ts)
 * 3. Returns the same ToolCallResult format
 *
 * Naming convention: mcp__<serverId>__<toolName>
 *
 * @module lib/mcp/mcp-tool-wrapper
 */

import { createLogger } from '@/lib/logger';
import { registerToolHandler } from '@/lib/agents/tool-handlers';
import type { ToolCallResult, ToolHandler } from '@/lib/agents/tool-handlers';
import type { MCPRegisteredTool, MCPToolCallResult, IMCPRegistry } from './types';

const logger = createLogger('agent');

/**
 * Constructs the fully-qualified MCP tool name.
 * Format: mcp__<serverId>__<toolName>
 *
 * Examples:
 * - mcp__pubmed__search
 * - mcp__gmail__send_email
 * - mcp__sentry__get_issue
 */
export function mcpToolName(serverId: string, toolName: string): string {
  return `mcp__${serverId}__${toolName}`;
}

/**
 * Parses an MCP qualified tool name into its components.
 * Returns null if the name doesn't match the MCP naming convention.
 */
export function parseMCPToolName(qualifiedName: string): { serverId: string; toolName: string } | null {
  const match = qualifiedName.match(/^mcp__([^_]+)__(.+)$/);
  if (!match) return null;
  return { serverId: match[1], toolName: match[2] };
}

/**
 * Creates a ToolHandler that delegates to the MCP registry for execution.
 * The returned handler has the same interface as any native tool handler.
 *
 * @param tool - The registered MCP tool to wrap
 * @param registry - The MCP registry that manages the connection
 */
export function createMCPToolHandler(
  tool: MCPRegisteredTool,
  registry: IMCPRegistry,
): ToolHandler {
  return async (args, _ctx): Promise<ToolCallResult> => {
    const start = Date.now();
    logger.info(`[mcp:${tool.qualifiedName}] Executing with args:`, Object.keys(args));

    try {
      const mcpResult: MCPToolCallResult = await registry.callTool(tool.qualifiedName, args);
      const durationMs = Date.now() - start;

      if (mcpResult.isError) {
        logger.warn(`[mcp:${tool.qualifiedName}] Error response in ${durationMs}ms`);
        const errorText = mcpResult.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n');

        return {
          name: tool.qualifiedName,
          response: { error: errorText || 'MCP tool returned an error', durationMs },
        };
      }

      // Extract text content from the MCP response
      const textContent = mcpResult.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('\n');

      // Try to parse as JSON for structured responses
      let response: unknown;
      try {
        response = JSON.parse(textContent);
      } catch {
        response = textContent;
      }

      logger.info(`[mcp:${tool.qualifiedName}] Success in ${durationMs}ms`);
      return { name: tool.qualifiedName, response };
    } catch (error) {
      const durationMs = Date.now() - start;
      logger.error(`[mcp:${tool.qualifiedName}] Exception in ${durationMs}ms:`, error);
      return {
        name: tool.qualifiedName,
        response: {
          error: `MCP tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  };
}

/**
 * Registers all tools from an MCP server into Aurora's ToolHandler registry.
 * After this call, the tools are available to Gemini just like native tools.
 *
 * @param tools - Array of MCP registered tools to wire up
 * @param registry - The MCP registry for delegation
 * @returns Number of tools registered
 */
export function registerMCPToolHandlers(
  tools: MCPRegisteredTool[],
  registry: IMCPRegistry,
): number {
  let count = 0;
  for (const tool of tools) {
    const handler = createMCPToolHandler(tool, registry);
    registerToolHandler(tool.qualifiedName, handler);
    count++;
    logger.info(`[mcp] Registered handler for ${tool.qualifiedName} (${tool.securityCategory})`);
  }
  return count;
}
