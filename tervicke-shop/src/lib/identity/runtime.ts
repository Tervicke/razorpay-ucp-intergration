import { randomBytes } from "node:crypto";
import { DevelopmentMagicLinkSender, IdentityService, InMemoryChallengeRepository, InMemorySessionRepository } from "@commerce-sdk/identity";
import { baseUrl } from "@/lib/config";

function createIdentityService(): IdentityService {
  const configuredSecret = process.env.IDENTITY_APPROVAL_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) throw new Error("IDENTITY_APPROVAL_SECRET is required in production");
  const sessions = new InMemorySessionRepository();
  const challenges = new InMemoryChallengeRepository(sessions);
  return new IdentityService({
    sessions, challenges, sender: new DevelopmentMagicLinkSender(),
    approvalSecret: configuredSecret ?? randomBytes(32).toString("base64url"),
    publicBaseUrl: baseUrl(),
    challengeTtlMs: Number(process.env.AUTH_CHALLENGE_TTL_MS ?? 600_000),
    sessionTtlMs: Number(process.env.AGENT_SESSION_TTL_MS ?? 36_000_000),
  });
}

const globalIdentity = globalThis as typeof globalThis & { __tervickeIdentity?: IdentityService };
export function getIdentityService(): IdentityService {
  if (!globalIdentity.__tervickeIdentity) globalIdentity.__tervickeIdentity = createIdentityService();
  return globalIdentity.__tervickeIdentity;
}
