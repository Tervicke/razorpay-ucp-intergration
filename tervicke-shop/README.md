# Tervicke Shop

The standalone Tervicke Shop storefront and agent-commerce demo.

This project contains the Next.js clothing shop, SQLite catalog, `/agents.md`, UCP discovery, one composable MCP endpoint, magic-link agent authentication, an external shopping-agent CLI, scripts, and tests.

## Agent interfaces

- Agent instructions: `http://localhost:3000/agents.md`
- UCP discovery: `http://localhost:3000/.well-known/ucp`
- MCP endpoint: `http://localhost:3000/api/ucp/mcp`
- Human approval: `http://localhost:3000/auth/approve?token=...`

The MCP endpoint exposes catalog discovery plus `start_authentication`, `get_authentication_status`, and authenticated `ping`. It is the single server where later cart, checkout, and payment tools will be registered.

## Run

```bash
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

In another terminal:

```bash
npm run discover -- http://localhost:3000
npm run test:mcp -- http://localhost:3000
```

## Development authentication

For a host-only manual start, send `POST /auth/start` with `x-client-id` and JSON `{ "email": "user@example.com", "agentId": "demo-agent" }`. Save the returned `challengeId` and `clientVerifier`. The development server logs the magic link; open it and click **Authorize agent**. Then send both saved values to `POST /auth/token` with the same `x-client-id` header.

The raw bearer token is returned once. A real MCP host stores it outside the model transcript and adds `Authorization: Bearer <token>` to `ping` and future authenticated tool calls. The model must never receive magic-link tokens, client verifiers, bearer tokens, or hashes.

Authentication uses in-memory storage for this demo, so challenges and sessions disappear whenever the Next.js process restarts and are not safe across multiple instances. Production also requires a real email sender and a configured `IDENTITY_APPROVAL_SECRET`.

The reusable identity and catalog domain packages live separately in `../commerce-sdk`.
