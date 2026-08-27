import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) throw new Error("Set ACCESS_TOKEN to the bearer token returned by /auth/token");

const endpoint = process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp";
const client = new Client({ name: "commerce-sdk-ping-client", version: "0.1.0" });

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
  }));
  const result = await client.callTool({ name: "ping", arguments: {} });
  console.log(JSON.stringify(result.structuredContent ?? result.content, null, 2));
} finally {
  await client.close();
}
