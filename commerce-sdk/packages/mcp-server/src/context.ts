import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
const header = (extra: Extra, name: string): string | undefined => {
  const value =
    extra.requestInfo?.headers[name] ??
    extra.requestInfo?.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

export interface IdentityRequestContext {
  clientId: string;
  agentId: string;
  clientVerifier?: string;
}

export function identityRequestContext(extra: Extra): IdentityRequestContext {
  const clientId = header(extra, "x-client-id")?.trim() || extra.sessionId;
  const agentId = header(extra, "x-agent-id")?.trim() || clientId;
  if (!clientId || !agentId)
    throw new Error("A stable x-client-id header is required");
  const verifier = header(extra, "x-client-verifier")?.trim();
  return {
    clientId,
    agentId,
    ...(verifier ? { clientVerifier: verifier } : {}),
  };
}

export function bearerTokenFromContext(extra: Extra): string {
  const authorization = header(extra, "authorization")?.trim();
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization ?? "");
  if (!match?.[1]) throw new Error("A valid bearer token is required");
  return match[1];
}
