import { describe, expect, it } from "vitest";
import {
  AuthenticationRejectedError,
  AuthenticationThrottledError,
  DevelopmentMagicLinkSender,
  IdentityService,
  InMemoryChallengeRepository,
  InMemorySessionRepository,
  InvalidAuthenticationRequestError,
  type MagicLinkMessage,
  type MagicLinkSender,
} from "../src/index.js";

class CaptureSender implements MagicLinkSender {
  messages: MagicLinkMessage[] = [];
  async send(message: MagicLinkMessage): Promise<void> {
    this.messages.push(message);
  }
  token(): string {
    return new URL(this.messages.at(-1)!.approvalUrl).searchParams.get(
      "token"
    )!;
  }
}

function fixture(
  options: {
    now?: Date;
    challengeTtlMs?: number;
    sessionTtlMs?: number;
    rateLimitMax?: number;
  } = {}
) {
  let current = options.now ?? new Date("2026-08-23T10:00:00Z");
  const sessions = new InMemorySessionRepository();
  const challenges = new InMemoryChallengeRepository(sessions);
  const sender = new CaptureSender();
  const identity = new IdentityService({
    challenges,
    sessions,
    sender,
    approvalSecret: "a-secure-test-secret-that-is-long-enough",
    publicBaseUrl: "https://example.test",
    challengeTtlMs: options.challengeTtlMs,
    sessionTtlMs: options.sessionTtlMs,
    rateLimitMax: options.rateLimitMax,
    now: () => current,
  });
  return {
    identity,
    challenges,
    sessions,
    sender,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

describe("IdentityService", () => {
  it("starts authentication with a normalized valid email and creates a pending challenge", async () => {
    const f = fixture();
    const result = await f.identity.startAuthentication({
      email: " User@Example.COM ",
      agentId: "agent-a",
      clientId: "client-a",
    });
    expect(result.challenge.status).toBe("PENDING");
    expect(result.clientVerifier).toBeTruthy();
    const stored = await f.challenges.findById(result.challenge.challengeId);
    expect(stored?.email).toBe("user@example.com");
    expect(stored?.clientVerifierHash).not.toBe(result.clientVerifier);
  });
  it("rejects invalid email addresses", async () => {
    const f = fixture();
    await expect(
      f.identity.startAuthentication({
        email: "bad",
        agentId: "a",
        clientId: "c",
      })
    ).rejects.toBeInstanceOf(InvalidAuthenticationRequestError);
  });
  it("does not approve an expired challenge", async () => {
    const f = fixture({ challengeTtlMs: 100 });
    await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "c",
    });
    f.advance(101);
    await expect(f.identity.approve(f.sender.token())).rejects.toBeInstanceOf(
      AuthenticationRejectedError
    );
  });
  it("approves a valid challenge", async () => {
    const f = fixture();
    const started = await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "c",
    });
    expect((await f.identity.approve(f.sender.token())).status).toBe(
      "APPROVED"
    );
    expect(
      (
        await f.identity.getAuthenticationStatus(
          started.challenge.challengeId,
          "c"
        )
      ).status
    ).toBe("APPROVED");
  });
  it("rejects an incorrect verifier and exchanges an approved challenge exactly once", async () => {
    const f = fixture();
    const started = await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "c",
    });
    await f.identity.approve(f.sender.token());
    await expect(
      f.identity.exchange(
        started.challenge.challengeId,
        "incorrect-verifier-that-is-long-enough",
        "c"
      )
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    const exchanged = await f.identity.exchange(
      started.challenge.challengeId,
      started.clientVerifier!,
      "c"
    );
    expect(exchanged.accessToken).toBeTruthy();
    await expect(
      f.identity.exchange(
        started.challenge.challengeId,
        started.clientVerifier!,
        "c"
      )
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    const stored = [...f.sessions.sessions.values()][0]!;
    expect(stored.tokenHash).not.toBe(exchanged.accessToken);
    expect(stored.tokenHash.length).toBeGreaterThan(20);
  });
  it("verifies valid bearer tokens and rejects expired and revoked sessions", async () => {
    const f = fixture({ sessionTtlMs: 100 });
    const started = await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "c",
    });
    await f.identity.approve(f.sender.token());
    const { accessToken } = await f.identity.exchange(
      started.challenge.challengeId,
      started.clientVerifier!,
      "c"
    );
    const verified = await f.identity.verifyAccessToken(accessToken);
    expect(verified.email).toBe("a@example.com");
    expect(await f.identity.revokeSession(verified.sessionId)).toBe(true);
    await expect(
      f.identity.verifyAccessToken(accessToken)
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
    const g = fixture({ sessionTtlMs: 100 });
    const other = await g.identity.startAuthentication({
      email: "b@example.com",
      agentId: "b",
      clientId: "d",
    });
    await g.identity.approve(g.sender.token());
    const token = await g.identity.exchange(
      other.challenge.challengeId,
      other.clientVerifier!,
      "d"
    );
    g.advance(101);
    await expect(
      g.identity.verifyAccessToken(token.accessToken)
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });
  it("returns no secrets in status and enforces challenge ownership", async () => {
    const f = fixture();
    const started = await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "owner",
    });
    const status = await f.identity.getAuthenticationStatus(
      started.challenge.challengeId,
      "owner"
    );
    expect(Object.keys(status).sort()).toEqual([
      "challengeId",
      "expiresAt",
      "status",
    ]);
    await expect(
      f.identity.getAuthenticationStatus(started.challenge.challengeId, "other")
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  });
  it("throttles excessive attempts by email or client", async () => {
    const f = fixture({ rateLimitMax: 2 });
    await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "a",
      clientId: "one",
    });
    await f.identity.startAuthentication({
      email: "a@example.com",
      agentId: "b",
      clientId: "two",
    });
    await expect(
      f.identity.startAuthentication({
        email: "a@example.com",
        agentId: "c",
        clientId: "three",
      })
    ).rejects.toBeInstanceOf(AuthenticationThrottledError);
  });
  it("development sender refuses to log outside development", async () => {
    await expect(
      new DevelopmentMagicLinkSender("production").send({
        email: "a@example.com",
        agentId: "a",
        expiresAt: new Date(),
        approvalUrl: "secret",
      })
    ).rejects.toThrow();
  });
});
