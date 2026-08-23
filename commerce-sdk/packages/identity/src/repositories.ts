import type { AgentSession, StoredAuthenticationChallenge } from "./types.js";

export interface ChallengeRepository {
  create(challenge: StoredAuthenticationChallenge): Promise<void>;
  findById(id: string): Promise<StoredAuthenticationChallenge | null>;
  findByApprovalTokenHash(
    hash: string
  ): Promise<StoredAuthenticationChallenge | null>;
  approve(
    id: string,
    approvalTokenHash: string,
    now: Date
  ): Promise<StoredAuthenticationChallenge | null>;
  consumeApproved(
    id: string,
    clientId: string,
    verifierHash: string,
    session: AgentSession,
    now: Date
  ): Promise<StoredAuthenticationChallenge | null>;
  countRecentByEmailOrClient(
    email: string,
    clientId: string,
    since: Date
  ): Promise<number>;
}

export interface SessionRepository {
  create(session: AgentSession): Promise<void>;
  findByTokenHash(hash: string): Promise<AgentSession | null>;
  revoke(id: string, now: Date): Promise<boolean>;
}
