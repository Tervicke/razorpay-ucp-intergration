# Commerce SDK

A TypeScript workspace for transport-independent commerce domains and one composable MCP server.

## Architecture

- `@commerce-sdk/catalog` remains a separate, unchanged domain package and is not exposed through MCP yet.
- `@commerce-sdk/identity` owns authentication logic without depending on MCP, HTTP, catalog, or a database.
- `@commerce-sdk/mcp-server` is the single commerce MCP endpoint. Identity is the first registered tool module; later domains can register on this same server.

The LLM selects tools and supplies business arguments. The MCP host—not the LLM—owns authentication secrets, stores the bearer token, and attaches `Authorization: Bearer ...` to later calls. The identity service exposes `verifyAccessToken()` for future authenticated tool context.

## Authentication flow

1. A capable MCP host generates a high-entropy verifier and calls `start_authentication`, injecting stable `x-client-id`, `x-agent-id`, and private `x-client-verifier` HTTP headers. Tool output contains only challenge ID, status, expiry, and a safe message.
2. The service stores only the verifier hash and sends a signed, expiring magic link.
3. `GET /auth/approve?token=...` renders an escaped confirmation page and never approves. The human submits **Authorize agent** to `POST /auth/approve`; the signed, single-use approval token also acts as the form's CSRF capability.
4. The host calls `POST /auth/token` with its client ID, challenge ID, and verifier. A successful atomic in-memory exchange consumes the challenge, stores only a bearer-token hash, and returns the raw bearer token exactly once.
5. The host stores that token securely. Future domain tools will pass it to `verifyAccessToken()` through request context.

MCP tool results are normally model-visible. SDK 1.30.0 supplies request headers to the server but has no generic hidden tool-result channel. Hosts unable to inject a private verifier can call host-only `POST /auth/start`; its verifier response must be intercepted and stored outside the model transcript.

## Run and test

```bash
cp .env.example .env
npm install
NODE_ENV=development npm run dev
npm test
npm run typecheck
npm run build
```

In development, the sender logs the magic link. Never use it in production.

Manual host fallback:

```bash
curl -X POST http://localhost:3000/auth/start \
  -H 'content-type: application/json' -H 'x-client-id: local-host' \
  -d '{"email":"user@example.com","agentId":"my-agent"}'
```

Open the logged link, click **Authorize agent**, and exchange the returned `challengeId` plus host-held `clientVerifier`:

```bash
curl -X POST http://localhost:3000/auth/token \
  -H 'content-type: application/json' -H 'x-client-id: local-host' \
  -d '{"challengeId":"auth_...","clientVerifier":"..."}'
```

For MCP, connect a Streamable HTTP client to `http://localhost:3000/mcp`, inject the three host-controlled headers above, and call `start_authentication` or `get_authentication_status`. After token exchange, set `Authorization: Bearer <access-token>` and call `ping`; a valid session returns `pong` with safe session identifiers. Missing, invalid, expired, and revoked tokens are rejected.

With the server still running, test an exchanged token using the included MCP client:

```bash
ACCESS_TOKEN='paste-token-here' npm run test:ping --workspace=@commerce-sdk/mcp-server
```

## Prototype limitations

State disappears on restart and is not shared across processes. Multiple server instances are unsafe, and the prototype wires one stateful MCP client session to each running server process. Production requires per-session MCP transport management, persistent repositories, a database transaction for challenge consumption and session creation, a production sender, HTTPS, managed secrets, and infrastructure-level rate limiting. No production secret is hard-coded.
