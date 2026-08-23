# `@commerce-sdk/identity`

Transport-independent magic-link authentication for commerce agents. This package owns challenge and session state, cryptographic token generation and hashing, expiry, revocation, repository contracts, and access-token verification. It imports neither MCP nor HTTP code.

The prototype repositories are in memory: all state disappears on restart and cannot be shared across server instances. Production deployments need persistent PostgreSQL or Redis implementations and a transactional challenge-exchange operation. Replace `DevelopmentMagicLinkSender` with a real delivery provider outside development.

Defaults are a 10-minute challenge and a 10-hour session; both are configurable through `IdentityService`.
