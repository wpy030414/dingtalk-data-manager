import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContactsTools } from "./contacts-tools.js";
import { registerAttendanceTools } from "./attendance-tools.js";
import { registerYidaTools } from "./yida-tools.js";

/**
 * Register all MCP tools on the server.
 */
export function registerAllTools(server: McpServer): void {
  registerContactsTools(server);
  registerAttendanceTools(server);
  registerYidaTools(server);
}