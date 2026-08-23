export type AuthenticationStatus =
  | "PENDING"
  | "APPROVED"
  | "EXPIRED"
  | "CONSUMED";

export interface AuthenticationChallenge {
  id: string;
  email: string;
  agentId: string;
  clientId: string;
  status: AuthenticationStatus;
  createdAt: Date;
  expiresAt: Date;
  approvedAt?: Date;
  consumedAt?: Date;
}

export interface StoredAuthenticationChallenge extends AuthenticationChallenge {
  clientVerifierHash: string;
  approvalTokenHash: string;
}

export interface AgentSession {
  id: string;
  userId: string;
  email: string;
  agentId: string;
  clientId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface AuthenticatedIdentity {
  sessionId: string;
  userId: string;
  email: string;
  agentId: string;
  clientId: string;
  expiresAt: Date;
}

export interface ModelSafeChallenge {
  challengeId: string;
  status: AuthenticationStatus;
  expiresAt: string;
}
