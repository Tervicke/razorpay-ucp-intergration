import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import type { IdentityService } from "@commerce-sdk/identity";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_BODY = 16_384;
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[
        char
      ]!)
  );
const clientId = (req: IncomingMessage): string | null =>
  Array.isArray(req.headers["x-client-id"])
    ? req.headers["x-client-id"]![0]!
    : req.headers["x-client-id"] ?? null;
const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
};
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > MAX_BODY) throw new Error("Body too large");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createCommerceHttpServer(
  mcp: McpServer,
  identity: IdentityService
) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  void mcp.connect(transport);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/mcp") {
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/auth/start") {
        const owner = clientId(req);
        const parsed = (await body(req)) as {
          email?: unknown;
          agentId?: unknown;
        };
        if (
          !owner ||
          typeof parsed.email !== "string" ||
          typeof parsed.agentId !== "string"
        ) {
          json(res, 400, { error: "Invalid request" });
          return;
        }
        const verifier = randomBytes(32).toString("base64url");
        const started = await identity.startAuthentication({
          email: parsed.email,
          agentId: parsed.agentId,
          clientId: owner,
          clientVerifier: verifier,
        });
        json(res, 201, { ...started.challenge, clientVerifier: verifier });
        return;
      }
      if (req.method === "GET" && url.pathname === "/auth/approve") {
        const token = url.searchParams.get("token") ?? "";
        const challenge = await identity.inspectApprovalToken(token);
        if (!challenge) {
          res.writeHead(400, {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(
            "<!doctype html><h1>Authorization link invalid or expired</h1>"
          );
          return;
        }
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
          "x-frame-options": "DENY",
        });
        res.end(
          `<!doctype html><html><body><main><h1>Authorize agent</h1><p>Agent: ${escapeHtml(
            challenge.agentId
          )}</p><p>Email: ${escapeHtml(
            challenge.email
          )}</p><p>Expires: ${escapeHtml(
            challenge.expiresAt.toISOString()
          )}</p><form method="post" action="/auth/approve"><input type="hidden" name="token" value="${escapeHtml(
            token
          )}"><button type="submit">Authorize agent</button></form></main></body></html>`
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/auth/approve") {
        const raw = Buffer.from(await bodyText(req)).toString();
        const token = new URLSearchParams(raw).get("token") ?? "";
        await identity.approve(token);
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(
          "<!doctype html><h1>Agent authorized</h1><p>You may return to your application.</p>"
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/auth/token") {
        const owner = clientId(req);
        const parsed = (await body(req)) as {
          challengeId?: unknown;
          clientVerifier?: unknown;
        };
        if (
          !owner ||
          typeof parsed.challengeId !== "string" ||
          typeof parsed.clientVerifier !== "string"
        ) {
          json(res, 400, { error: "Invalid request" });
          return;
        }
        json(
          res,
          200,
          await identity.exchange(
            parsed.challengeId,
            parsed.clientVerifier,
            owner
          )
        );
        return;
      }
      json(res, 404, { error: "Not found" });
    } catch {
      json(res, 400, { error: "Request could not be completed" });
    }
  });
}
async function bodyText(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > MAX_BODY) throw new Error("Body too large");
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
