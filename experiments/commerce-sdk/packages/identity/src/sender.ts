export interface MagicLinkMessage {
  email: string;
  approvalUrl: string;
  expiresAt: Date;
  agentId: string;
}
export interface MagicLinkSender {
  send(message: MagicLinkMessage): Promise<void>;
}

export class DevelopmentMagicLinkSender implements MagicLinkSender {
  constructor(private readonly environment = process.env.NODE_ENV) {}
  async send(message: MagicLinkMessage): Promise<void> {
    if (this.environment !== "development")
      throw new Error("A production magic-link sender is not configured");
    console.info(
      `[identity] Development magic link for ${message.email}: ${message.approvalUrl}`
    );
  }
}
