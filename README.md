# Gulbahar UCP

An India-first agentic commerce demo integrating the Universal Commerce
Protocol (UCP) with Razorpay, REST, MCP, intelligent catalog search, and a
customer storefront.

Gulbahar is a fictional flower merchant used to demonstrate the complete
journey from product discovery to an INR Razorpay payment and order lookup.

## Demo

[Watch the Gulbahar UCP demo on YouTube](https://youtu.be/2TPOPG9u8OQ).

## What it demonstrates

- A Python/FastAPI UCP merchant server
- REST and MCP interfaces backed by the same business services
- Ten MCP tools for catalog search, carts, and checkout sessions
- Natural-language and typo-tolerant product search
- Razorpay Payment Links with asynchronous payment confirmation
- An INR catalog with prices stored in paise
- Persistent SQLite catalog, inventory, checkout, payment, and order data
- A responsive product storefront with order tracking
- RFC 9421 request signatures and signed order webhooks

## Architecture

```text
Agent or client
   ├── MCP /mcp
   └── UCP REST API
           │
           ▼
   Shared business services
   ├── Catalog and fuzzy search
   ├── Cart and checkout
   ├── Fulfillment and inventory
   └── Razorpay payments
           │
           ▼
   products.db + transactions.db

Customer browser ──► Storefront ──► Catalog and order REST endpoints
```

REST and MCP are thin transport layers. Both call the same service classes, so
validation, pricing, inventory, idempotency, and payment behavior stay
consistent.

## Quick start

### Requirements

- Python 3.12+
- [`uv`](https://docs.astral.sh/uv/)
- Razorpay test credentials for the payment flow

Clone and configure the server:

```bash
git clone https://github.com/Tervicke/razorpay-ucp-intergration.git
cd razorpay-ucp-intergration/server

cp .env.example .env
# Add your Razorpay test credentials to .env.

uv sync
uv run server.py
```

The existing SQLite files are used directly. Normal startup does not recreate
the catalog or transaction history.

Once the server is running:

- Storefront: <http://localhost:8182/storefront/>
- OpenAPI documentation: <http://localhost:8182/docs>
- UCP discovery profile: <http://localhost:8182/.well-known/ucp>
- MCP endpoint: `http://localhost:8182/mcp`
- Catalog search: <http://localhost:8182/products/search>

## Connect the MCP server

Point an MCP-compatible host at:

```text
http://localhost:8182/mcp
```

For Codex, add this to your MCP configuration and restart or refresh MCP
connections:

```toml
[mcp_servers.gulbahar]
url = "http://localhost:8182/mcp"
```

The server exposes:

- `search_catalog`
- `create_checkout`, `get_checkout`, `update_checkout`, `complete_checkout`,
  and `cancel_checkout`
- `create_cart`, `get_cart`, `update_cart`, and `cancel_cart`

A typical agent flow is:

```text
search_catalog → create_cart → create_checkout → complete_checkout
       → open Razorpay payment link → payment confirmed → retrieve order
```

## REST examples

Search by product, description, occasion, or approximate spelling:

```bash
curl --get http://localhost:8182/products/search \
  --data-urlencode "q=flowers for puja" \
  --data-urlencode "limit=5"
```

Browse the complete catalog:

```bash
curl http://localhost:8182/products/search
```

## Client scripts

The repository includes the original UCP client and a Razorpay-enabled client:

```bash
cd ../client_scripts
uv sync

uv run simple_happy_path_client.py \
  --server_url=http://localhost:8182

uv run simple_happy_path_razorpay_client.py \
  --server_url=http://localhost:8182
```

See [`client_scripts/README.md`](client_scripts/README.md) for client options
and sample output.

## Repository structure

```text
.
├── server/            Final FastAPI merchant, business logic, data, and UI
├── client_scripts/    REST and Razorpay demonstration clients
├── docs/              Architecture notes and development journey
└── experiments/       Earlier approaches retained for hackathon review
```

The active submission is `server/` plus `client_scripts/`. Earlier prototypes
are preserved under `experiments/` to document the paths explored during the
hackathon.

## Documentation

- [`server/README.md`](server/README.md) — server behavior and protocol details
- [`server/docs/razorpay-payment-link-handler.md`](server/docs/razorpay-payment-link-handler.md)
  — Razorpay handler specification
- [`docs/development-journey.md`](docs/development-journey.md) — design journey
  and explored approaches
- [`experiments/README.md`](experiments/README.md) — archived prototypes

## Demo notice

This project uses a fictional merchant and Razorpay test mode. Never commit a
real `.env` file or production credentials. Review stored demonstration data
before deploying or making the repository public.
