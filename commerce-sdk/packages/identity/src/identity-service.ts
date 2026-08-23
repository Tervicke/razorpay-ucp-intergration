import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { ChallengeRepository, SessionRepository } from "./repositories.js";
import type { MagicLinkSender } from "./sender.js";
import type {
  AgentSession,
  AuthenticatedIdentity,
  ModelSafeChallenge,
  StoredAuthenticationChallenge,
} from "./types.js";

export class IdentityError extends Error {}
export class InvalidAuthenticationRequestError extends IdentityError {}
export class AuthenticationThrottledError extends IdentityError {}
export class AuthenticationRejectedError extends IdentityError {}

export interface IdentityServiceOptions {
  challenges: ChallengeRepository;
  sessions: SessionRepository;
  sender: MagicLinkSender;
  approvalSecret: string;
  publicBaseUrl: string;
  challengeTtlMs?: number;
  sessionTtlMs?: number;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  now?: () => Date;
}

export interface StartAuthenticationInput {
  email: string;
  agentId: string;
  clientId: string;
  clientVerifier?: string;
}
export interface StartAuthenticationResult {
  challenge: ModelSafeChallenge;
  clientVerifier?: string;
}

const hash = (value: string): string =>
  createHash("sha256").update(value).digest("base64url");
const secret = (): string => randomBytes(32).toString("base64url");
const safe = (
  challenge: StoredAuthenticationChallenge
): ModelSafeChallenge => ({
  challengeId: challenge.id,
  status: challenge.status,
  expiresAt: challenge.expiresAt.toISOString(),
});

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new InvalidAuthenticationRequestError("Invalid email address");
  return normalized;
}

export class IdentityService {
  private readonly challengeTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly rateLimitWindowMs: number;
  private readonly rateLimitMax: number;
  private readonly now: () => Date;
  constructor(private readonly options: IdentityServiceOptions) {
    if (options.approvalSecret.length < 32)
      throw new Error("approvalSecret must be at least 32 characters");
    this.challengeTtlMs = options.challengeTtlMs ?? 10 * 60_000;
    this.sessionTtlMs = options.sessionTtlMs ?? 10 * 60 * 60_000;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 10 * 60_000;
    this.rateLimitMax = options.rateLimitMax ?? 5;
    this.now = options.now ?? (() => new Date());
  }

  async startAuthentication(
    input: StartAuthenticationInput
  ): Promise<StartAuthenticationResult> {
    const email = normalizeEmail(input.email);
    if (!input.agentId.trim() || !input.clientId.trim())
      throw new InvalidAuthenticationRequestError("Invalid client identity");
    const now = this.now();
    const count = await this.options.challenges.countRecentByEmailOrClient(
      email,
      input.clientId,
      new Date(now.getTime() - this.rateLimitWindowMs)
    );
    if (count >= this.rateLimitMax)
      throw new AuthenticationThrottledError(
        "Too many authentication attempts"
      );
    const clientVerifier = input.clientVerifier ?? secret();
    if (clientVerifier.length < 32)
      throw new InvalidAuthenticationRequestError("Invalid client verifier");
    const id = `auth_${randomUUID()}`;
    const expiresAt = new Date(now.getTime() + this.challengeTtlMs);
    const nonce = secret();
    const payload = Buffer.from(
      JSON.stringify({ id, nonce, exp: expiresAt.getTime() })
    ).toString("base64url");
    const signature = createHmac("sha256", this.options.approvalSecret)
      .update(payload)
      .digest("base64url");
    const approvalToken = `${payload}.${signature}`;
    const challenge: StoredAuthenticationChallenge = {
      id,
      email,
      agentId: input.agentId,
      clientId: input.clientId,
      status: "PENDING",
      createdAt: now,
      expiresAt,
      clientVerifierHash: hash(clientVerifier),
      approvalTokenHash: hash(approvalToken),
    };
    await this.options.challenges.create(challenge);
    await this.options.sender.send({
      email,
      agentId: input.agentId,
      expiresAt,
      approvalUrl: `${
        this.options.publicBaseUrl
      }/auth/approve?token=${encodeURIComponent(approvalToken)}`,
    });
    return {
      challenge: safe(challenge),
      ...(input.clientVerifier ? {} : { clientVerifier }),
    };
  }

  async inspectApprovalToken(
    token: string
  ): Promise<StoredAuthenticationChallenge | null> {
    if (!this.validSignedToken(token)) return null;
    const challenge = await this.options.challenges.findByApprovalTokenHash(
      hash(token)
    );
    if (
      !challenge ||
      challenge.status !== "PENDING" ||
      challenge.expiresAt <= this.now()
    )
      return null;
    return challenge;
  }
  async approve(token: string): Promise<ModelSafeChallenge> {
    const challenge = await this.inspectApprovalToken(token);
    if (!challenge)
      throw new AuthenticationRejectedError(
        "Authentication request is invalid or expired"
      );
    const approved = await this.options.challenges.approve(
      challenge.id,
      hash(token),
      this.now()
    );
    if (!approved)
      throw new AuthenticationRejectedError(
        "Authentication request is invalid or expired"
      );
    return safe(approved);
  }
  async getAuthenticationStatus(
    challengeId: string,
    clientId: string
  ): Promise<ModelSafeChallenge> {
    const challenge = await this.options.challenges.findById(challengeId);
    if (!challenge || challenge.clientId !== clientId)
      throw new AuthenticationRejectedError(
        "Authentication request was not found"
      );
    if (challenge.status === "PENDING" && challenge.expiresAt <= this.now())
      challenge.status = "EXPIRED";
    return safe(challenge);
  }
  async exchange(
    challengeId: string,
    clientVerifier: string,
    clientId: string
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const challenge = await this.options.challenges.findById(challengeId);
    if (!challenge || challenge.clientId !== clientId)
      throw new AuthenticationRejectedError("Authentication exchange failed");
    const accessToken = secret();
    const now = this.now();
    const session: AgentSession = {
      id: `session_${randomUUID()}`,
      userId: `user_${hash(challenge.email).slice(0, 24)}`,
      email: challenge.email,
      agentId: challenge.agentId,
      clientId,
      tokenHash: hash(accessToken),
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.sessionTtlMs),
    };
    const consumed = await this.options.challenges.consumeApproved(
      challengeId,
      clientId,
      hash(clientVerifier),
      session,
      now
    );
    if (!consumed)
      throw new AuthenticationRejectedError("Authentication exchange failed");
    return { accessToken, expiresAt: session.expiresAt.toISOString() };
  }
  async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    const session = await this.options.sessions.findByTokenHash(hash(token));
    if (!session || session.revokedAt || session.expiresAt <= this.now())
      throw new AuthenticationRejectedError("Invalid access token");
    return {
      sessionId: session.id,
      userId: session.userId,
      email: session.email,
      agentId: session.agentId,
      clientId: session.clientId,
      expiresAt: session.expiresAt,
    };
  }
  async revokeSession(sessionId: string): Promise<boolean> {
    return this.options.sessions.revoke(sessionId, this.now());
  }
  private validSignedToken(token: string): boolean {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    const expected = createHmac("sha256", this.options.approvalSecret)
      .update(payload)
      .digest();
    let supplied: Buffer;
    try {
      supplied = Buffer.from(signature, "base64url");
    } catch {
      return false;
    }
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return false;
    try {
      const parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString()
      ) as { exp?: number };
      return (
        typeof parsed.exp === "number" && parsed.exp > this.now().getTime()
      );
    } catch {
      return false;
    }
  }
}
