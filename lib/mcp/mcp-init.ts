/**
 * MCP Initialization — Aurora/HopeAI
 *
 * Handles MCP server registration and startup during system initialization.
 * Reads server configurations and connects to all auto-connect servers.
 *
 * Called from hopeai-system.ts during HopeAISystem.initialize().
 *
 * @module lib/mcp/mcp-init
 */

import { createLogger } from '@/lib/logger';
import { MCPRegistry } from './mcp-registry';
import { registerMCPToolHandlers } from './mcp-tool-wrapper';
import type { MCPServerConfig } from './types';

const logger = createLogger('system');

/**
 * MCP server configurations.
 *
 * In production, these would come from environment variables or a config service.
 * For now, they are defined statically. Servers with `autoConnect: true` will be
 * connected during initialization.
 *
 * To add a new MCP server:
 * 1. Add its config to getConfiguredServers()
 * 2. Set autoConnect: true if it should connect on startup
 * 3. The server's tools will be automatically discovered and registered
 */
function getConfiguredServers(): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  // -----------------------------------------------------------------------
  // Add MCP servers here. Environment variables control which are active.
  // -----------------------------------------------------------------------

  // Example: Sentry MCP server (SSE transport)
  if (process.env.MCP_SENTRY_URL) {
    servers.push({
      id: 'sentry',
      name: 'Sentry',
      transport: { type: 'sse', url: process.env.MCP_SENTRY_URL },
      autoConnect: true,
      timeoutMs: 15_000,
    });
  }

  // Example: PubMed MCP server (HTTP Streamable transport)
  if (process.env.MCP_PUBMED_URL) {
    servers.push({
      id: 'pubmed',
      name: 'PubMed Academic Search',
      transport: { type: 'http', url: process.env.MCP_PUBMED_URL },
      autoConnect: true,
      timeoutMs: 20_000,
    });
  }

  // Example: Local stdio MCP server for development
  if (process.env.MCP_LOCAL_COMMAND) {
    const args = process.env.MCP_LOCAL_ARGS?.split(' ') ?? [];
    servers.push({
      id: 'local',
      name: 'Local MCP Server',
      transport: { type: 'stdio', command: process.env.MCP_LOCAL_COMMAND, args },
      autoConnect: true,
      timeoutMs: 10_000,
    });
  }

  return servers;
}

/**
 * Initialize the MCP subsystem:
 * 1. Register all configured MCP servers
 * 2. Connect to servers with autoConnect: true
 * 3. Register discovered tools into the Aurora ToolHandler pipeline
 *
 * This function is safe to call multiple times — it will skip
 * servers that are already registered/connected.
 *
 * Connection failures are logged but do not throw — the system
 * starts without MCP tools rather than failing entirely.
 *
 * @returns Summary of initialization results
 */
export async function initializeMCP(): Promise<{
  serversRegistered: number;
  serversConnected: number;
  toolsDiscovered: number;
}> {
  const registry = MCPRegistry.getInstance();
  const configs = getConfiguredServers();

  if (configs.length === 0) {
    logger.info('[mcp-init] No MCP servers configured (set MCP_*_URL env vars to enable)');
    return { serversRegistered: 0, serversConnected: 0, toolsDiscovered: 0 };
  }

  // 1. Register all configured servers
  for (const config of configs) {
    registry.registerServer(config);
  }
  logger.info(`[mcp-init] Registered ${configs.length} MCP server(s)`);

  // 2. Connect to auto-connect servers
  const autoConnectIds = configs
    .filter((c) => c.autoConnect)
    .map((c) => c.id);

  for (const id of autoConnectIds) {
    try {
      await registry.connect(id);
    } catch (err) {
      // connect() already handles errors internally,
      // but guard against unexpected throws
      logger.error(
        `[mcp-init] Unexpected error connecting to ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // 3. Register discovered tools into the ToolHandler pipeline
  const tools = registry.listTools();
  const toolCount = registerMCPToolHandlers(tools, registry);

  const connectedCount = registry.getConnectedCount();
  logger.info(
    `[mcp-init] MCP initialization complete: ${configs.length} registered, ${connectedCount} connected, ${toolCount} tools`,
  );

  return {
    serversRegistered: configs.length,
    serversConnected: connectedCount,
    toolsDiscovered: toolCount,
  };
}
