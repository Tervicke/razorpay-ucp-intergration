import { describe, expect, it } from "vitest";
import { GET as agents } from "../src/app/agents.md/route";
import { GET as discovery } from "../src/app/.well-known/ucp/route";
import { createMcpServer } from "../src/lib/mcp/server";

describe("discovery", () => {
  it("serves complete agent-facing MCP instructions", async () => {
    const response = await agents();
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const markdown = await response.text();
    expect(markdown).toContain("/api/ucp/mcp");
    expect(markdown).toContain("start_authentication");
    expect(markdown).toContain("Authorization: Bearer <token>");
    expect(markdown).toContain("Never ask the user to paste");
  });
  it("serves a UCP profile", async () => {
    const response = await discovery();
    const profile = await response.json();
    expect(profile.ucp.services["dev.ucp.shopping"][0].transport).toBe("mcp");
    expect(profile.ucp.capabilities).toHaveProperty("dev.ucp.shopping.catalog.search");
  });
  it("composes catalog and identity MCP tools on one server", () => {
    const server = createMcpServer() as unknown as { _registeredTools: Record<string, unknown> };
    expect(Object.keys(server._registeredTools)).toEqual(expect.arrayContaining([
      "search_catalog", "lookup_catalog", "get_product",
      "start_authentication", "get_authentication_status", "ping",
    ]));
  });
});
