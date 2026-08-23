import type { IdentityService } from "@commerce-sdk/identity";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  bearerTokenFromContext,
  identityRequestContext,
} from "../context.js";

export interface IdentityToolDependencies {
  identity: IdentityService;
}
const toolResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value as Record<string, unknown>,
});
const errorResult = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

export function registerIdentityTools(
  server: McpServer,
  dependencies: IdentityToolDependencies
): void {
  server.registerTool(
    "start_authentication",
    {
      description:
        "Start email authorization for the current MCP client. The host must supply stable x-client-id and secret x-client-verifier headers.",
      inputSchema: { email: z.string().email().max(254) },
    },
    async ({ email }, extra) => {
      try {
        const context = identityRequestContext(extra);
        if (!context.clientVerifier)
          return errorResult(
            "The MCP host must provide a private client verifier."
          );
        const result = await dependencies.identity.startAuthentication({
          email,
          ...context,
          clientVerifier: context.clientVerifier,
        });
        return toolResult({
          ...result.challenge,
          message: "An authorization link has been sent to the email address.",
        });
      } catch {
        return errorResult("Authentication could not be started.");
      }
    }
  );

  server.registerTool(
    "get_authentication_status",
    {
      description:
        "Get the model-safe status of an authentication challenge owned by this MCP client.",
      inputSchema: { challengeId: z.string().min(1).max(100) },
    },
    async ({ challengeId }, extra) => {
      try {
        const { clientId } = identityRequestContext(extra);
        return toolResult(
          await dependencies.identity.getAuthenticationStatus(
            challengeId,
            clientId
          )
        );
      } catch {
        return errorResult("Authentication request was not found.");
      }
    }
  );

  server.registerTool(
    "ping",
    {
      description:
        "Verify the host-provided bearer token and return pong for the authenticated session.",
      inputSchema: {},
    },
    async (_input, extra) => {
      try {
        const identity = await dependencies.identity.verifyAccessToken(
          bearerTokenFromContext(extra)
        );
        return toolResult({
          message: "pong",
          authenticated: true,
          sessionId: identity.sessionId,
          userId: identity.userId,
          agentId: identity.agentId,
          expiresAt: identity.expiresAt.toISOString(),
        });
      } catch {
        return errorResult("Authentication is required.");
      }
    }
  );
}
