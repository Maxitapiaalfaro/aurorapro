/**
 * MCP Registry — Singleton registry for MCP server connections
 *
 * Manages the lifecycle of MCP server connections and provides
 * a unified interface for discovering and invoking MCP tools.
 *
 * Architecture (from Claude Code analysis):
 * - One connection per external server, shared across all agents
 * - Workers inherit mcpClients[] from the coordinator (no re-connection)
 * - Tools are registered into the same ToolHandler pipeline as native tools
 *
 * Current implementation: Foundation types + connection state management.
 * Actual transport (stdio, SSE) will be wired when MCP servers are deployed.
 *
 * @module lib/mcp/mcp-registry
 */

import { createLogger } from '@/lib/logger';
import type {
  MCPServerConfig,
  MCPServerConnection,
  MCPRegisteredTool,
  MCPToolCallResult,
  IMCPRegistry,
} from './types';

const logger = createLogger('system');

/**
 * Singleton MCP Registry.
 *
 * Usage:
 * ```ts
 * const registry = MCPRegistry.getInstance();
 * registry.registerServer({ id: 'pubmed', name: 'PubMed', transport: { type: 'sse', url: '...' } });
 * await registry.connect('pubmed');
 * const tools = registry.listTools(); // → MCPRegisteredTool[]
 * ```
 */
export class MCPRegistry implements IMCPRegistry {
  private static instance: MCPRegistry | null = null;
  private servers = new Map<string, MCPServerConnection>();

  private constructor() {}

  static getInstance(): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry();
    }
    return MCPRegistry.instance;
  }

  /** Reset singleton (for testing only) */
  static resetForTesting(): void {
    MCPRegistry.instance = null;
  }

  // ---------------------------------------------------------------------------
  // Server Registration
  // ---------------------------------------------------------------------------

  registerServer(config: MCPServerConfig): void {
    if (this.servers.has(config.id)) {
      logger.warn(`[mcp-registry] Server '${config.id}' already registered, updating config`);
    }

    this.servers.set(config.id, {
      config,
      status: 'disconnected',
      tools: [],
    });

    logger.info(`[mcp-registry] Registered server: ${config.id} (${config.name})`);
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  async connect(serverId?: string): Promise<void> {
    const targets = serverId
      ? [this.getServerOrThrow(serverId)]
      : Array.from(this.servers.values());

    for (const server of targets) {
      if (server.status === 'connected') {
        logger.debug(`[mcp-registry] Server '${server.config.id}' already connected`);
        continue;
      }

      server.status = 'connecting';
      logger.info(`[mcp-registry] Connecting to ${server.config.id}...`);

      try {
        // TODO: Implement actual MCP transport connection
        // This is where @modelcontextprotocol/sdk Client will be instantiated
        // with the appropriate transport (stdio, SSE, HTTP).
        //
        // For now, mark as connected with no tools — the actual implementation
        // will call client.listTools() to discover available tools.

        server.status = 'connected';
        server.connectedAt = new Date();
        server.lastError = undefined;

        logger.info(`[mcp-registry] Connected to ${server.config.id} (${server.tools.length} tools discovered)`);
      } catch (err) {
        server.status = 'error';
        server.lastError = err instanceof Error ? err.message : String(err);
        logger.error(`[mcp-registry] Failed to connect to ${server.config.id}: ${server.lastError}`);
      }
    }
  }

  async disconnect(serverId?: string): Promise<void> {
    const targets = serverId
      ? [this.getServerOrThrow(serverId)]
      : Array.from(this.servers.values());

    for (const server of targets) {
      if (server.status === 'disconnected') continue;

      // TODO: Close actual MCP transport connection
      server.status = 'disconnected';
      server.tools = [];
      logger.info(`[mcp-registry] Disconnected from ${server.config.id}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Tool Discovery
  // ---------------------------------------------------------------------------

  listTools(): MCPRegisteredTool[] {
    const allTools: MCPRegisteredTool[] = [];
    for (const server of Array.from(this.servers.values())) {
      if (server.status === 'connected') {
        allTools.push(...server.tools);
      }
    }
    return allTools;
  }

  getServerTools(serverId: string): MCPRegisteredTool[] {
    const server = this.getServerOrThrow(serverId);
    return server.tools;
  }

  // ---------------------------------------------------------------------------
  // Tool Execution
  // ---------------------------------------------------------------------------

  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    // Parse the qualified name to find the server
    const match = qualifiedName.match(/^mcp__([^_]+)__(.+)$/);
    if (!match) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Invalid MCP tool name: ${qualifiedName}` }],
      };
    }

    const [, serverId, toolName] = match;
    const server = this.servers.get(serverId);

    if (!server) {
      return {
        isError: true,
        content: [{ type: 'text', text: `MCP server '${serverId}' not registered` }],
      };
    }

    if (server.status !== 'connected') {
      return {
        isError: true,
        content: [{ type: 'text', text: `MCP server '${serverId}' is not connected (status: ${server.status})` }],
      };
    }

    const tool = server.tools.find((t) => t.qualifiedName === qualifiedName);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Tool '${toolName}' not found on server '${serverId}'` }],
      };
    }

    // TODO: Implement actual MCP tool invocation via @modelcontextprotocol/sdk
    // client.callTool({ name: toolName, arguments: args })
    logger.info(`[mcp-registry] callTool ${qualifiedName} — MCP transport not yet implemented`);

    return {
      isError: true,
      content: [{ type: 'text', text: 'MCP transport not yet implemented. This is a foundation type.' }],
    };
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): MCPServerConnection[] {
    return Array.from(this.servers.values());
  }

  getServerCount(): number {
    return this.servers.size;
  }

  getConnectedCount(): number {
    return Array.from(this.servers.values()).filter((s) => s.status === 'connected').length;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getServerOrThrow(serverId: string): MCPServerConnection {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP server '${serverId}' not found in registry`);
    }
    return server;
  }
}
