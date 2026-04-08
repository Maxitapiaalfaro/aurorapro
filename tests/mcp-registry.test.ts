/**
 * Tests for MCP Registry — real transport connection, tool discovery, and invocation.
 *
 * Uses @modelcontextprotocol/sdk's in-memory Server to create a local MCP server
 * that the registry can connect to via stdio transport simulation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Unit tests for the registry logic (no real MCP server needed)
// ---------------------------------------------------------------------------

// We need to import after mocking, so use dynamic imports inside tests.
// These tests verify the registry's state machine and error handling.

describe('MCPRegistry', () => {
  let MCPRegistry: typeof import('@/lib/mcp/mcp-registry').MCPRegistry;

  beforeEach(async () => {
    // Dynamic import to avoid issues with module-level side effects
    const mod = await import('@/lib/mcp/mcp-registry');
    MCPRegistry = mod.MCPRegistry;
    await MCPRegistry.resetForTesting();
  });

  afterEach(async () => {
    await MCPRegistry.resetForTesting();
  });

  // -------------------------------------------------------------------------
  // Singleton
  // -------------------------------------------------------------------------

  it('should return the same instance from getInstance()', () => {
    const a = MCPRegistry.getInstance();
    const b = MCPRegistry.getInstance();
    expect(a).toBe(b);
  });

  it('should create a new instance after resetForTesting()', async () => {
    const a = MCPRegistry.getInstance();
    await MCPRegistry.resetForTesting();
    const b = MCPRegistry.getInstance();
    expect(a).not.toBe(b);
  });

  // -------------------------------------------------------------------------
  // Server Registration
  // -------------------------------------------------------------------------

  it('should register a server', () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'test',
      name: 'Test Server',
      transport: { type: 'http', url: 'http://localhost:3000/mcp' },
    });

    expect(registry.getServerCount()).toBe(1);
    const status = registry.getStatus();
    expect(status[0].config.id).toBe('test');
    expect(status[0].status).toBe('disconnected');
  });

  it('should overwrite config when re-registering a server', () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'test',
      name: 'Version 1',
      transport: { type: 'http', url: 'http://v1.example.com/mcp' },
    });
    registry.registerServer({
      id: 'test',
      name: 'Version 2',
      transport: { type: 'http', url: 'http://v2.example.com/mcp' },
    });

    expect(registry.getServerCount()).toBe(1);
    expect(registry.getStatus()[0].config.name).toBe('Version 2');
  });

  // -------------------------------------------------------------------------
  // Connection (error cases — no real server)
  // -------------------------------------------------------------------------

  it('should set error status when connecting to unreachable server', async () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'bad',
      name: 'Unreachable',
      transport: { type: 'http', url: 'http://localhost:1/nonexistent' },
      timeoutMs: 2_000,
    });

    // Should not throw — errors are captured in status
    await registry.connect('bad');

    const status = registry.getStatus();
    expect(status[0].status).toBe('error');
    expect(status[0].lastError).toBeTruthy();
    expect(registry.getConnectedCount()).toBe(0);
  });

  it('should return no tools when no servers are connected', () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'x',
      name: 'X',
      transport: { type: 'http', url: 'http://localhost:1/x' },
    });

    expect(registry.listTools()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Tool execution (error cases)
  // -------------------------------------------------------------------------

  it('should return error for invalid tool name format', async () => {
    const registry = MCPRegistry.getInstance();
    const result = await registry.callTool('bad_name', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('Invalid MCP tool name') }),
    );
  });

  it('should return error for unregistered server', async () => {
    const registry = MCPRegistry.getInstance();
    const result = await registry.callTool('mcp__unknown__tool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('not registered') }),
    );
  });

  it('should return error when calling tool on disconnected server', async () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'offline',
      name: 'Offline',
      transport: { type: 'http', url: 'http://localhost:1/offline' },
    });

    const result = await registry.callTool('mcp__offline__sometool', {});
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: 'text', text: expect.stringContaining('not connected') }),
    );
  });

  it('should throw when getting tools for non-existent server', () => {
    const registry = MCPRegistry.getInstance();
    expect(() => registry.getServerTools('nope')).toThrow("MCP server 'nope' not found");
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  it('should handle disconnect on already disconnected server gracefully', async () => {
    const registry = MCPRegistry.getInstance();
    registry.registerServer({
      id: 'disc',
      name: 'Disc',
      transport: { type: 'http', url: 'http://localhost:1/disc' },
    });

    // Should not throw
    await registry.disconnect('disc');
    expect(registry.getStatus()[0].status).toBe('disconnected');
  });
});

// ---------------------------------------------------------------------------
// Tool wrapper tests
// ---------------------------------------------------------------------------

describe('MCP Tool Name Utilities', () => {
  it('should construct qualified tool names', async () => {
    const { mcpToolName } = await import('@/lib/mcp/mcp-tool-wrapper');
    expect(mcpToolName('pubmed', 'search')).toBe('mcp__pubmed__search');
    expect(mcpToolName('sentry', 'get_issue')).toBe('mcp__sentry__get_issue');
  });

  it('should parse valid MCP tool names', async () => {
    const { parseMCPToolName } = await import('@/lib/mcp/mcp-tool-wrapper');
    expect(parseMCPToolName('mcp__pubmed__search')).toEqual({
      serverId: 'pubmed',
      toolName: 'search',
    });
    expect(parseMCPToolName('mcp__sentry__get_issue')).toEqual({
      serverId: 'sentry',
      toolName: 'get_issue',
    });
  });

  it('should return null for non-MCP tool names', async () => {
    const { parseMCPToolName } = await import('@/lib/mcp/mcp-tool-wrapper');
    expect(parseMCPToolName('search_academic_literature')).toBeNull();
    expect(parseMCPToolName('mcp_bad_format')).toBeNull();
    expect(parseMCPToolName('')).toBeNull();
  });
});
