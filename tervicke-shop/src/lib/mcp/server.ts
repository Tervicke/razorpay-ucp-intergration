import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getIdentityService } from "@/lib/identity/runtime";
import { registerCatalogTools } from "./tools/catalog-tools";
import { registerIdentityTools } from "./tools/identity-tools";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "tervicke-shop", version: "1.1.0" });
  registerIdentityTools(server, getIdentityService());
  registerCatalogTools(server);
  return server;
}
