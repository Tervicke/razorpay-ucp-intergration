import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { IdentityService, InMemoryChallengeRepository, InMemorySessionRepository, type MagicLinkMessage, type MagicLinkSender } from "@commerce-sdk/identity";
import { createCommerceHttpServer } from "../src/http.js";
import { createMcpServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

class CaptureSender implements MagicLinkSender { message?: MagicLinkMessage; async send(message: MagicLinkMessage) { this.message = message; } }
const servers: Server[] = []; afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

async function fixture() {
  const sessions = new InMemorySessionRepository(); const challenges = new InMemoryChallengeRepository(sessions); const sender = new CaptureSender();
  const identity = new IdentityService({ sessions, challenges, sender, approvalSecret: "a-secure-test-secret-that-is-long-enough", publicBaseUrl: "http://localhost" });
  const server = createCommerceHttpServer(createMcpServer(identity), identity); servers.push(server); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port; return { identity, sender, base: `http://127.0.0.1:${port}` };
}

describe("approval HTTP flow", () => {
  it("GET displays confirmation but never approves the challenge", async () => {
    const f = await fixture(); const started = await f.identity.startAuthentication({ email: "user@example.com", agentId: "<agent>", clientId: "client" }); const url = new URL(f.sender.message!.approvalUrl); const response = await fetch(`${f.base}/auth/approve?${url.searchParams}`); const html = await response.text();
    expect(response.status).toBe(200); expect(html).toContain("Authorize agent"); expect(html).toContain("&lt;agent&gt;"); expect((await f.identity.getAuthenticationStatus(started.challenge.challengeId, "client")).status).toBe("PENDING");
  });
  it("POST approval authorizes and host token exchange succeeds once", async () => {
    const f = await fixture(); const start = await fetch(`${f.base}/auth/start`, { method: "POST", headers: { "content-type": "application/json", "x-client-id": "client" }, body: JSON.stringify({ email: "user@example.com", agentId: "agent" }) }); const started = await start.json() as { challengeId: string; clientVerifier: string }; const token = new URL(f.sender.message!.approvalUrl).searchParams.get("token")!;
    const approved = await fetch(`${f.base}/auth/approve`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) }); expect(approved.status).toBe(200);
    const exchange = () => fetch(`${f.base}/auth/token`, { method: "POST", headers: { "content-type": "application/json", "x-client-id": "client" }, body: JSON.stringify(started) });
    const first = await exchange(); expect(first.status).toBe(200); expect((await first.json() as { accessToken: string }).accessToken).toBeTruthy(); expect((await exchange()).status).toBe(400);
  });

  it("ping accepts a valid bearer token and rejects a missing token", async () => {
    const f = await fixture();
    const started = await f.identity.startAuthentication({ email: "user@example.com", agentId: "agent", clientId: "client" });
    await f.identity.approve(new URL(f.sender.message!.approvalUrl).searchParams.get("token")!);
    const exchanged = await f.identity.exchange(started.challenge.challengeId, started.clientVerifier!, "client");

    const validClient = new Client({ name: "authenticated-test", version: "1.0.0" });
    await validClient.connect(new StreamableHTTPClientTransport(new URL(`${f.base}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${exchanged.accessToken}` } },
    }));
    const valid = await validClient.callTool({ name: "ping", arguments: {} });
    expect(valid.isError).not.toBe(true);
    expect(valid.structuredContent).toMatchObject({ message: "pong", authenticated: true, agentId: "agent" });
    await validClient.close();

    const anonymousFixture = await fixture();
    const anonymousClient = new Client({ name: "anonymous-test", version: "1.0.0" });
    await anonymousClient.connect(new StreamableHTTPClientTransport(new URL(`${anonymousFixture.base}/mcp`)));
    const rejected = await anonymousClient.callTool({ name: "ping", arguments: {} });
    expect(rejected.isError).toBe(true);
    await anonymousClient.close();
  });
});
