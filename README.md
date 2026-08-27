# Razorpay UCP Hackathon Project

This repository documents the complete development journey and contains the
final Razorpay-integrated Universal Commerce Protocol (UCP) implementation.

## Final implementation

- [`server/`](server/README.md) is the final Python/FastAPI merchant server. It
  exposes the UCP REST API, owns the flower-shop catalog and business logic,
  persists catalog and transaction data in SQLite, and integrates Razorpay.
- [`client_scripts/`](client_scripts/README.md) contains the original UCP happy
  path client and the Razorpay-enabled client used to exercise the server.

The active implementation is deliberately small: one standards-compatible
server and two executable clients.

## Development history

Earlier approaches are preserved under [`experiments/`](experiments/README.md).
They are not required to run the final Python implementation, but show the
architecture and integration paths explored during the hackathon.

For a chronological and architectural overview, see
[`docs/development-journey.md`](docs/development-journey.md).

## Quick start

The server owns its configuration in `server/.env`. This file may contain live
Razorpay credentials and is intentionally ignored by Git. A safe template is
available at `server/.env.example`.

```bash
cd server
uv sync
uv run server.py
```

In a second terminal, run either client:

```bash
cd client_scripts
uv sync
uv run simple_happy_path_client.py --server_url=http://localhost:8182
uv run simple_happy_path_razorpay_client.py --server_url=http://localhost:8182
```

The existing `server/products.db` and `server/transactions.db` files are used
directly, so normal startup does not rebuild the databases.
