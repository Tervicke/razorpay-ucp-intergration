import { randomBytes } from "node:crypto";
import {
  DevelopmentMagicLinkSender,
  IdentityService,
  InMemoryChallengeRepository,
  InMemorySessionRepository,
} from "@commerce-sdk/identity";
import { createCommerceHttpServer } from "./http.js";
import { createMcpServer } from "./server.js";

export function createApplication() {
  const sessions = new InMemorySessionRepository();
  const challenges = new InMemoryChallengeRepository(sessions);
  const configuredSecret = process.env.IDENTITY_APPROVAL_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret)
    throw new Error("IDENTITY_APPROVAL_SECRET is required in production");
  const identity = new IdentityService({
    sessions,
    challenges,
    sender: new DevelopmentMagicLinkSender(),
    approvalSecret: configuredSecret ?? randomBytes(32).toString("base64url"),
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    challengeTtlMs: Number(process.env.AUTH_CHALLENGE_TTL_MS ?? 600_000),
    sessionTtlMs: Number(process.env.AGENT_SESSION_TTL_MS ?? 36_000_000),
  });
  const mcp = createMcpServer(identity);
  return { identity, mcp, http: createCommerceHttpServer(mcp, identity) };
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  createApplication().http.listen(port, () =>
    console.info(
      `[commerce-sdk] MCP and identity HTTP server listening on ${port}`
    )
  );
}

export { createMcpServer } from "./server.js";
export { createCommerceHttpServer } from "./http.js";
