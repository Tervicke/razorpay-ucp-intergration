import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;
const header = (extra: Extra, name: string): string | undefined => {
  const value = extra.requestInfo?.headers[name];
  return Array.isArray(value) ? value[0] : value;
};
export function clientContext(extra: Extra) {
  const clientId = header(extra, "x-client-id")?.trim() || extra.sessionId;
  const agentId = header(extra, "x-agent-id")?.trim() || clientId;
  if (!clientId || !agentId) throw new Error("Stable client identity required");
  const clientVerifier = header(extra, "x-client-verifier")?.trim();
  return { clientId, agentId, ...(clientVerifier ? { clientVerifier } : {}) };
}
export function bearerToken(extra: Extra): string {
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(header(extra, "authorization")?.trim() ?? "");
  if (!match?.[1]) throw new Error("Bearer token required");
  return match[1];
}
