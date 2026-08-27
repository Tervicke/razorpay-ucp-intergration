import type { IdentityService } from "@commerce-sdk/identity";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { bearerToken, clientContext } from "../context";

const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> });
const failure = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

export function registerIdentityTools(server: McpServer, identity: IdentityService): void {
  server.registerTool("start_authentication", {
    title: "Start authentication",
    description: "Send the user a magic-link authorization email. The MCP host privately injects x-client-id, x-agent-id, and x-client-verifier headers.",
    inputSchema: { email: z.string().email().max(254) },
  }, async ({ email }, extra) => {
    try {
      const context = clientContext(extra);
      if (!context.clientVerifier) return failure("The MCP host must provide a private client verifier.");
      const started = await identity.startAuthentication({ email, ...context, clientVerifier: context.clientVerifier });
      return result({ ...started.challenge, message: "An authorization link has been sent to the email address." });
    } catch { return failure("Authentication could not be started."); }
  });
  server.registerTool("get_authentication_status", {
    title: "Get authentication status",
    description: "Check a challenge owned by the current MCP client.",
    inputSchema: { challengeId: z.string().min(1).max(100) },
  }, async ({ challengeId }, extra) => {
    try { return result(await identity.getAuthenticationStatus(challengeId, clientContext(extra).clientId)); }
    catch { return failure("Authentication request was not found."); }
  });
  server.registerTool("ping", {
    title: "Authenticated ping",
    description: "Verify the host's bearer token and return pong.",
    inputSchema: {},
  }, async (_input, extra) => {
    try {
      const authenticated = await identity.verifyAccessToken(bearerToken(extra));
      return result({ message: "pong", authenticated: true, sessionId: authenticated.sessionId, userId: authenticated.userId, agentId: authenticated.agentId, expiresAt: authenticated.expiresAt.toISOString() });
    } catch { return failure("Authentication is required."); }
  });
}
