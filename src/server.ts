import { createServer } from "node:http";
import { createHttpTransport } from "./mcp/server.js";
import { getLogger } from "./lib/logger.js";

/**
 * Start the HTTP server with MCP Streamable HTTP transport on the given port.
 *
 * The MCP SDK's StreamableHTTPServerTransport works with Node.js native
 * IncomingMessage/ServerResponse, so we use `http.createServer` directly.
 *
 * Endpoints:
 *   GET/POST /mcp   — MCP Streamable HTTP transport
 *   GET /health     — Health check
 */
export async function startHttpServer(port: number): Promise<void> {
  const logger = getLogger();
  const { handleRequest } = await createHttpTransport();

  const server = createServer((req, res) => {
    // Health check
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "dingtalk-data-gateway" }));
      return;
    }

    // MCP Streamable HTTP — handles POST (JSON-RPC) and GET (SSE)
    handleRequest(req, res).catch((err) => {
      logger.error({ err }, "MCP request handler error");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  logger.info({ port, endpoint: `http://localhost:${port}/mcp` }, "Starting MCP HTTP server...");

  server.listen(port, () => {
    logger.info({ port }, "MCP HTTP server is ready");
  });
}