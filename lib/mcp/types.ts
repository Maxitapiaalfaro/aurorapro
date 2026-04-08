/**
 * MCP Foundation Types — Aurora/HopeAI
 *
 * Type definitions for Model Context Protocol integration.
 * Based on the architecture analysis in:
 *   docs/architecture/agent-tree-mcp-relationship-analysis.md
 *
 * Key design principles (derived from Claude Code source analysis):
 * 1. MCP tools are indistinguishable from native tools at the agent level
 * 2. MCP connections are inherited down the agent hierarchy (shared pool)
 * 3. MCP tools go through the same permission system as native tools
 * 4. MCP is for EXTERNAL data access only — never for inter-agent communication
 *
 * @module lib/mcp/types
 */

import type { SecurityCategory } from '@/lib/tool-registry';

// ---------------------------------------------------------------------------
// MCP Transport Configuration
// ---------------------------------------------------------------------------

/**
 * Transport types supported by the MCP protocol.
 * Aurora initially supports HTTP (SSE) for Vercel-compatible serverless deployment.
 * stdio is included for local development/testing with MCP CLI servers.
 */
export type MCPTransportType = 'stdio' | 'sse' | 'http';

/**
 * Configuration for connecting to an external MCP server.
 */
export interface MCPServerConfig {
  /** Unique identifier for this server (e.g., 'pubmed', 'gmail', 'sentry') */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Transport configuration */
  transport: MCPTransportConfig;
  /** Whether to auto-connect on registry initialization */
  autoConnect?: boolean;
  /** Connection timeout in ms (default: 10000) */
  timeoutMs?: number;
}

export type MCPTransportConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> };

// ---------------------------------------------------------------------------
// MCP Tool Definitions
// ---------------------------------------------------------------------------

/**
 * A tool definition as returned by an MCP server's `listTools()`.
 * Follows the MCP specification for tool metadata.
 */
export interface MCPToolDefinition {
  /** Tool name as exposed by the MCP server (e.g., 'search', 'create_issue') */
  name: string;
  /** Description of what the tool does — used by the LLM for routing */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * An MCP tool with its server context and security metadata.
 * This is what gets registered in the Aurora tool pipeline.
 *
 * Naming convention (from Claude Code): mcp__<serverName>__<toolName>
 * Example: mcp__pubmed__search, mcp__gmail__send_email
 */
export interface MCPRegisteredTool {
  /** Fully qualified tool name: mcp__<serverId>__<toolName> */
  qualifiedName: string;
  /** Server that provides this tool */
  serverId: string;
  /** Original tool definition from the MCP server */
  definition: MCPToolDefinition;
  /** Security category for Aurora's permission system */
  securityCategory: SecurityCategory;
}

// ---------------------------------------------------------------------------
// MCP Tool Execution
// ---------------------------------------------------------------------------

/**
 * Result of invoking an MCP tool via the protocol.
 */
export interface MCPToolCallResult {
  /** Whether the tool executed successfully */
  isError: boolean;
  /** The tool's response content (text, JSON, or structured data) */
  content: MCPContent[];
}

/**
 * Content types in MCP tool responses.
 */
export type MCPContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; mimeType?: string } };

// ---------------------------------------------------------------------------
// MCP Server Connection State
// ---------------------------------------------------------------------------

/**
 * Runtime state of a connected MCP server.
 */
export interface MCPServerConnection {
  /** Server configuration */
  config: MCPServerConfig;
  /** Current connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Tools discovered from this server */
  tools: MCPRegisteredTool[];
  /** Last error message, if any */
  lastError?: string;
  /** Timestamp of last successful connection */
  connectedAt?: Date;
}

// ---------------------------------------------------------------------------
// MCP Registry Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the MCP server registry.
 * Manages connections to external MCP servers and exposes their tools
 * through the unified Aurora tool pipeline.
 */
export interface IMCPRegistry {
  /** Register a new MCP server configuration */
  registerServer(config: MCPServerConfig): void;
  /** Connect to all registered servers (or a specific one) */
  connect(serverId?: string): Promise<void>;
  /** Disconnect from all servers (or a specific one) */
  disconnect(serverId?: string): Promise<void>;
  /** Get all registered tools across all connected servers */
  listTools(): MCPRegisteredTool[];
  /** Get tools from a specific server */
  getServerTools(serverId: string): MCPRegisteredTool[];
  /** Execute an MCP tool by its qualified name */
  callTool(qualifiedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
  /** Get connection status for all servers */
  getStatus(): MCPServerConnection[];
}
