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
 * Transport support:
 * - SSE (deprecated but widely deployed) — SSEClientTransport
 * - HTTP (Streamable HTTP, recommended) — StreamableHTTPClientTransport
 * - stdio (local dev/testing) — StdioClientTransport
 *
 * @module lib/mcp/mcp-registry
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@/lib/logger';
import { mcpToolName } from './mcp-tool-wrapper';
import type {
  MCPServerConfig,
  MCPServerConnection,
  MCPRegisteredTool,
  MCPToolCallResult,
  MCPContent,
  IMCPRegistry,
} from './types';
import type { SecurityCategory } from '@/lib/tool-registry';

const logger = createLogger('system');

/** Default connection timeout in ms */
const DEFAULT_TIMEOUT_MS = 15_000;

/** Aurora MCP client info sent during MCP handshake */
const AURORA_CLIENT_INFO = {
  name: 'aurora-pro',
  version: '1.0.0',
} as const;

// ---------------------------------------------------------------------------
// Transport Factory
// ---------------------------------------------------------------------------

/**
 * Creates the appropriate MCP transport based on the server's transport config.
 * Lazy-imports transport classes to avoid bundling unused transports.
 */
async function createTransport(config: MCPServerConfig): Promise<Transport> {
  const { transport } = config;

  switch (transport.type) {
    case 'stdio': {
      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );
      return new StdioClientTransport({
        command: transport.command,
        args: transport.args,
        env: transport.env,
      });
    }

    case 'sse': {
      const { SSEClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/sse.js'
      );
      const opts = transport.headers
        ? { requestInit: { headers: transport.headers } }
        : undefined;
      return new SSEClientTransport(new URL(transport.url), opts);
    }

    case 'http': {
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );
      const opts = transport.headers
        ? { requestInit: { headers: transport.headers } }
        : undefined;
      return new StreamableHTTPClientTransport(new URL(transport.url), opts);
    }

    default: {
      const _exhaustive: never = transport;
      throw new Error(`Unsupported MCP transport type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Security Category Inference
// ---------------------------------------------------------------------------

/**
 * Infer Aurora's SecurityCategory from MCP tool annotations.
 * Uses the hints exposed by MCP SDK ≥1.0:
 *   readOnlyHint  → 'read-only'
 *   destructiveHint → 'write'
 *   openWorldHint → 'external'
 *
 * Falls back to 'external' (most restrictive) when no annotations exist.
 */
function inferSecurityCategory(
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean },
): SecurityCategory {
  if (!annotations) return 'external';
  if (annotations.readOnlyHint) return 'read-only';
  if (annotations.destructiveHint) return 'write';
  if (annotations.openWorldHint) return 'external';
  return 'external';
}

// ---------------------------------------------------------------------------
// Extended connection state (includes SDK Client)
// ---------------------------------------------------------------------------

interface MCPActiveConnection extends MCPServerConnection {
  /** The SDK Client instance for this server (null when disconnected) */
  client: Client | null;
}

// ---------------------------------------------------------------------------
// MCPRegistry
// ---------------------------------------------------------------------------

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
  private servers = new Map<string, MCPActiveConnection>();

  private constructor() {}

  static getInstance(): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry();
    }
    return MCPRegistry.instance;
  }

  /** Reset singleton — disconnects all servers. For testing only. */
  static async resetForTesting(): Promise<void> {
    if (MCPRegistry.instance) {
      await MCPRegistry.instance.disconnect();
    }
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
      client: null,
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
        // 1. Create the SDK transport
        const transport = await createTransport(server.config);

        // 2. Instantiate the MCP Client
        const client = new Client(AURORA_CLIENT_INFO, {
          capabilities: {},
        });

        // 3. Connect with timeout
        const timeoutMs = server.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);

        try {
          await client.connect(transport, { signal: ac.signal });
        } finally {
          clearTimeout(timer);
        }

        // 4. Discover tools
        const { tools: sdkTools } = await client.listTools();

        const discoveredTools: MCPRegisteredTool[] = sdkTools.map((t) => ({
          qualifiedName: mcpToolName(server.config.id, t.name),
          serverId: server.config.id,
          definition: {
            name: t.name,
            description: t.description ?? '',
            inputSchema: t.inputSchema as Record<string, unknown>,
          },
          securityCategory: inferSecurityCategory(t.annotations),
        }));

        // 5. Update connection state
        server.client = client;
        server.status = 'connected';
        server.connectedAt = new Date();
        server.lastError = undefined;
        server.tools = discoveredTools;

        logger.info(
          `[mcp-registry] Connected to ${server.config.id} (${discoveredTools.length} tools discovered)`,
        );
      } catch (err) {
        server.status = 'error';
        server.client = null;
        server.lastError = err instanceof Error ? err.message : String(err);
        logger.error(
          `[mcp-registry] Failed to connect to ${server.config.id}: ${server.lastError}`,
        );
      }
    }
  }

  async disconnect(serverId?: string): Promise<void> {
    const targets = serverId
      ? [this.getServerOrThrow(serverId)]
      : Array.from(this.servers.values());

    for (const server of targets) {
      if (server.status === 'disconnected') continue;

      try {
        if (server.client) {
          await server.client.close();
        }
      } catch (err) {
        logger.warn(
          `[mcp-registry] Error closing client for ${server.config.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      server.client = null;
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
    for (const server of this.servers.values()) {
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

    if (server.status !== 'connected' || !server.client) {
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

    try {
      const result = await server.client.callTool(
        { name: toolName, arguments: args },
        CallToolResultSchema,
      );

      // Map SDK content to Aurora MCPContent.
      // The SDK returns validated content array; we map each element defensively.
      const rawContent = Array.isArray(result.content) ? result.content : [];
      const content: MCPContent[] = rawContent.map(
        (item: { type?: string; text?: string; data?: string; mimeType?: string; resource?: { uri?: string; text?: string; mimeType?: string } }) => {
          if (item.type === 'text') {
            return { type: 'text' as const, text: String(item.text ?? '') };
          }
          if (item.type === 'image') {
            return {
              type: 'image' as const,
              data: String(item.data ?? ''),
              mimeType: String(item.mimeType ?? 'image/png'),
            };
          }
          if (item.type === 'resource') {
            return {
              type: 'resource' as const,
              resource: {
                uri: String(item.resource?.uri ?? ''),
                text: item.resource?.text != null ? String(item.resource.text) : undefined,
                mimeType: item.resource?.mimeType != null ? String(item.resource.mimeType) : undefined,
              },
            };
          }
          // Fallback: treat unknown content as text
          return { type: 'text' as const, text: JSON.stringify(item) };
        },
      );

      return {
        isError: result.isError === true,
        content,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[mcp-registry] callTool ${qualifiedName} failed: ${message}`);
      return {
        isError: true,
        content: [{ type: 'text', text: `MCP tool invocation error: ${message}` }],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  getStatus(): MCPServerConnection[] {
    // Return without the internal `client` field
    return Array.from(this.servers.values()).map(({ client: _c, ...rest }) => rest);
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

  private getServerOrThrow(serverId: string): MCPActiveConnection {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`MCP server '${serverId}' not found in registry`);
    }
    return server;
  }
}
