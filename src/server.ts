import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSessionPair, type SessionStore } from "./mcp/server.js";
import { getLogger } from "./lib/logger.js";

// ── Constants ────────────────────────────────────────────────────────

const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;             // 30 minutes

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the MCP session ID from the request headers.
 * Returns `undefined` when the client does not send one (new session).
 */
function getSessionId(req: IncomingMessage): string | undefined {
  const raw = req.headers["mcp-session-id"];
  if (!raw) return undefined;
  // Header may be string | string[]
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Sends a JSON error response through the raw Node.js ServerResponse.
 */
function sendJsonError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

// ── Session cleanup ──────────────────────────────────────────────────

function startSessionCleanup(sessions: SessionStore): NodeJS.Timeout {
  const logger = getLogger();
  return setInterval(() => {
    const now = Date.now();
    const expired: string[] = [];
    for (const [id, pair] of sessions) {
      if (now - pair.createdAt > SESSION_TTL_MS) {
        expired.push(id);
      }
    }
    for (const id of expired) {
      const pair = sessions.get(id);
      if (pair) {
        logger.info({ sessionId: id, age: Math.round((now - pair.createdAt) / 1000) }, "Expiring MCP session");
        pair.transport.close().catch(() => {});
        sessions.delete(id);
      }
    }
    if (expired.length > 0) {
      logger.info({ count: expired.length }, "Cleaned up expired MCP sessions");
    }
  }, SESSION_CLEANUP_INTERVAL_MS);
}

// ── HTTP Server ──────────────────────────────────────────────────────

/**
 * Start the HTTP server with MCP Streamable HTTP transport on the given port.
 *
 * Architecture:
 *   Per the MCP SDK constraint (1 Protocol = 1 Transport = 1 Session),
 *   each new client session gets its own McpServer + Transport pair.
 *   A session store maps `Mcp-Session-Id` → pair so follow-up requests
 *   are routed to the correct transport.
 *
 * Endpoints:
 *   POST /mcp   — JSON-RPC (initialize → new session; otherwise → existing)
 *   GET  /mcp   — SSE stream (existing session only)
 *   DELETE /mcp — Terminate session
 *   GET  /health — Health check
 */
export async function startHttpServer(port: number): Promise<void> {
  const logger = getLogger();
  const sessions: SessionStore = new Map();

  // Periodic cleanup of idle sessions
  const cleanupTimer = startSessionCleanup(sessions);

  const server = createServer(async (req, res) => {
    // ── Health check ───────────────────────────────────────────
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "dingtalk-data-gateway" }));
      return;
    }

    // ── Session routing ────────────────────────────────────────
    const sessionId = getSessionId(req);

    if (sessionId) {
      // Existing session — route to its transport
      const pair = sessions.get(sessionId);
      if (!pair) {
        logger.warn({ sessionId }, "Unknown MCP session ID");
        sendJsonError(res, 404, "Session not found");
        return;
      }
      // Touch the session timestamp to keep it alive
      pair.createdAt = Date.now();
      pair.transport.handleRequest(req, res).catch((err) => {
        logger.error({ err, sessionId }, "MCP request handler error");
        if (!res.headersSent) {
          sendJsonError(res, 500, "Internal server error");
        }
      });
    } else {
      // New session — create a fresh McpServer + Transport pair.
      // The SDK will generate a sessionId during initialize, fire
      // onsessioninitialized (which adds the pair to sessions),
      // and include Mcp-Session-Id in the response headers.
      try {
        const pair = await createSessionPair(sessions);
        pair.transport.handleRequest(req, res).catch((err) => {
          logger.error({ err }, "MCP request handler error (new session)");
          if (!res.headersSent) {
            sendJsonError(res, 500, "Internal server error");
          }
        });
      } catch (err) {
        logger.error({ err }, "Failed to create MCP session");
        sendJsonError(res, 500, "Internal server error");
      }
    }
  });

  // Clean up timer on server close
  server.on("close", () => {
    clearInterval(cleanupTimer);
    // Close all remaining sessions
    for (const [id, pair] of sessions) {
      pair.transport.close().catch(() => {});
      sessions.delete(id);
    }
    logger.info("MCP HTTP server shut down, all sessions closed");
  });

  logger.info({ port, endpoint: `http://localhost:${port}/mcp` }, "Starting MCP HTTP server...");

  server.listen(port, () => {
    logger.info({ port }, "MCP HTTP server is ready");
  });
}