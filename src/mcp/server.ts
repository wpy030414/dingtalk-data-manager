import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getLogger } from "../lib/logger.js";
import { registerAllTools } from "./tools/index.js";
import { SERVER_INSTRUCTIONS, GUIDE_MARKDOWN } from "./guide.js";

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

/**
 * Creates and configures the MCP server instance.
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

/**
 * Creates a Streamable HTTP transport for the MCP server.
 * Returns a `handleRequest` function compatible with Node.js http.IncomingMessage / http.ServerResponse.
 * Used by Pi, remote clients, and debugging.
 */
export async function createHttpTransport(): Promise<{
  handleRequest: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
}> {
  const logger = getLogger();
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // use default crypto-based generator
  });

  logger.info("Creating DingTalk MCP server with Streamable HTTP transport...");

  await server.connect(transport);

  logger.info("DingTalk MCP server (HTTP) is ready");

  return {
    handleRequest: (req, res) => transport.handleRequest(req, res),
  };
}