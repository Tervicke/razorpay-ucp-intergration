import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IdentityService } from "@commerce-sdk/identity";
import { registerIdentityTools } from "./tools/identity-tools.js";

export function createMcpServer(identity: IdentityService): McpServer {
  const server = new McpServer({ name: "commerce-sdk", version: "0.1.0" });
  registerIdentityTools(server, { identity });
  // Future domain tool modules register on this same server.
  return server;
}
