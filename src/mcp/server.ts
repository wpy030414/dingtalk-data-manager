import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { getLogger } from "../lib/logger.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_INSTRUCTIONS, GUIDE_MARKDOWN } from "./guide.js";

// ── Types ────────────────────────────────────────────────────────────

/** A living MCP session: one transport + one McpServer, bound 1:1. */
export interface SessionPair {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

/** Session store keyed by session ID. */
export type SessionStore = Map<string, SessionPair>;

// ── Resource registration ────────────────────────────────────────────

/**
 * Registers the human/agent-readable API cheat sheet as an MCP Resource.
 * Agents can pull it on demand without paying for it in every context.
 */
function registerGuideResource(server: McpServer): void {
  server.registerResource(
    "guide",
    "dingtalk://guide",
    {
      title: "钉钉数据网关 · 接口速查",
      description: "全部 27 个工具的完整 URL、请求风格、搜索语义说明",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: GUIDE_MARKDOWN }],
    }),
  );
}

// ── McpServer factory ────────────────────────────────────────────────

/**
 * Creates and configures a fresh MCP server instance.
 * Each session gets its own McpServer (SDK requirement: 1 Protocol = 1 Transport).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "dingtalk-data-gateway",
      version: "1.0.0",
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerAllTools(server);
  registerGuideResource(server);

  return server;
}

// ── Session factory ──────────────────────────────────────────────────

/**
 * Creates a new session pair (McpServer + Transport) and wires it into
 * the session store so subsequent requests with the session ID are routed
 * to the same transport.
 *
 * The session is registered in the store inside `onsessioninitialized`
 * (fired by the SDK after `initialize` completes and `sessionId` is set).
 */
export async function createSessionPair(
  sessionStore: SessionStore,
): Promise<SessionPair> {
  const logger = getLogger();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      const pair: SessionPair = { transport, server, createdAt: Date.now() };
      sessionStore.set(sessionId, pair);
      logger.info({ sessionId }, "MCP session initialized");
    },
    onsessionclosed: (sessionId: string) => {
      sessionStore.delete(sessionId);
      logger.info({ sessionId }, "MCP session closed (client DELETE)");
    },
  });

  const server = createMcpServer();

  transport.onclose = () => {
    // Find and remove by transport identity (sessionId may already be gone)
    for (const [id, p] of sessionStore) {
      if (p.transport === transport) {
        sessionStore.delete(id);
        logger.info({ sessionId: id }, "MCP session closed");
        break;
      }
    }
  };

  await server.connect(transport);

  return { transport, server, createdAt: Date.now() };
}

// ── Stdio (single-session) ───────────────────────────────────────────

/**
 * Starts the MCP server with stdio transport.
 * Used by Claude Desktop and other tools that launch the server as a subprocess.
 */
export async function startStdioServer(): Promise<void> {
  const logger = getLogger();
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  logger.info("Starting DingTalk MCP server on stdio transport...");

  await server.connect(transport);

  logger.info("DingTalk MCP server (stdio) is ready");
}