import { timingSafeEqual } from "node:crypto";
import type { ChallengeRepository, SessionRepository } from "./repositories.js";
import type { AgentSession, StoredAuthenticationChallenge } from "./types.js";

const equalHash = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export class InMemorySessionRepository implements SessionRepository {
  readonly sessions = new Map<string, AgentSession>();

  async create(session: AgentSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
  async findByTokenHash(hash: string): Promise<AgentSession | null> {
    return (
      [...this.sessions.values()].find((session) =>
        equalHash(session.tokenHash, hash)
      ) ?? null
    );
  }
  async revoke(id: string, now: Date): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt) return false;
    session.revokedAt = now;
    return true;
  }
}

export class InMemoryChallengeRepository implements ChallengeRepository {
  readonly challenges = new Map<string, StoredAuthenticationChallenge>();

  constructor(private readonly sessions: SessionRepository) {}
  async create(challenge: StoredAuthenticationChallenge): Promise<void> {
    this.challenges.set(challenge.id, challenge);
  }
  async findById(id: string): Promise<StoredAuthenticationChallenge | null> {
    return this.challenges.get(id) ?? null;
  }
  async findByApprovalTokenHash(
    hash: string
  ): Promise<StoredAuthenticationChallenge | null> {
    return (
      [...this.challenges.values()].find((challenge) =>
        equalHash(challenge.approvalTokenHash, hash)
      ) ?? null
    );
  }
  async approve(
    id: string,
    tokenHash: string,
    now: Date
  ): Promise<StoredAuthenticationChallenge | null> {
    const challenge = this.challenges.get(id);
    if (
      !challenge ||
      challenge.status !== "PENDING" ||
      challenge.expiresAt <= now ||
      !equalHash(challenge.approvalTokenHash, tokenHash)
    )
      return null;
    challenge.status = "APPROVED";
    challenge.approvedAt = now;
    challenge.approvalTokenHash = "";
    return challenge;
  }
  async consumeApproved(
    id: string,
    clientId: string,
    verifierHash: string,
    session: AgentSession,
    now: Date
  ): Promise<StoredAuthenticationChallenge | null> {
    const challenge = this.challenges.get(id);
    if (
      !challenge ||
      challenge.status !== "APPROVED" ||
      challenge.expiresAt <= now ||
      challenge.clientId !== clientId ||
      !equalHash(challenge.clientVerifierHash, verifierHash)
    )
      return null;
    challenge.status = "CONSUMED";
    challenge.consumedAt = now;
    challenge.clientVerifierHash = "";
    await this.sessions.create(session);
    return challenge;
  }
  async countRecentByEmailOrClient(
    email: string,
    clientId: string,
    since: Date
  ): Promise<number> {
    return [...this.challenges.values()].filter(
      (challenge) =>
        challenge.createdAt >= since &&
        (challenge.email === email || challenge.clientId === clientId)
    ).length;
  }
}
