# Development Journey

## Goal

Build a UCP-compatible merchant REST server whose complete checkout flow can be
driven by a client script and completed using Razorpay.

## Explored approaches

1. **Commerce SDK and identity foundations** — explored reusable TypeScript
   commerce domains, MCP composition, and secure agent authentication.
2. **Tervicke Shop** — applied those ideas in a Next.js storefront with catalog
   discovery, agent-facing instructions, UCP discovery, and MCP endpoints.
3. **Standalone Razorpay Checkout** — isolated the Razorpay payment interaction
   in a small Python/HTML prototype.
4. **Razorpay handler site** — explored a separate hosted handler UI.
5. **Final Python UCP implementation** — consolidated the working path into a
   Python/FastAPI UCP REST server and executable client scripts.

## Final architecture

The final implementation has two active surfaces:

- `server/`: UCP routes, business services, flower-shop data, persistent SQLite
  databases, request/webhook signing, and Razorpay integration.
- `client_scripts/`: the original protocol happy path and the Razorpay-enabled
  happy path.

The experiments remain intact under `experiments/` so reviewers can inspect the
decisions and intermediate implementations without confusing them with the
final runnable path.
