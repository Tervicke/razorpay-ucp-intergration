import {baseUrl} from "@/lib/config";
export const UCP_VERSION="2026-04-08";
export function ucpProfile(){const base=baseUrl();return {ucp:{version:UCP_VERSION,
  // A service names the protocol family. Transport says clients invoke it with MCP; endpoint is its network address.
  services:{"dev.ucp.shopping":[{version:UCP_VERSION,spec:`https://ucp.dev/${UCP_VERSION}/specification/overview`,transport:"mcp",schema:`https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`,endpoint:`${base}/api/ucp/mcp`}]},
  // Capabilities are independently supported commerce behaviors. spec is human-readable; schema is machine-validation guidance.
  capabilities:{"dev.ucp.shopping.catalog.search":[{version:UCP_VERSION,spec:`https://ucp.dev/${UCP_VERSION}/specification/catalog/search`,schema:`https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_search.json`}],"dev.ucp.shopping.catalog.lookup":[{version:UCP_VERSION,spec:`https://ucp.dev/${UCP_VERSION}/specification/catalog/lookup`,schema:`https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_lookup.json`}]}}};}
export function agentsMarkdown(){const base=baseUrl();return `# Agent Instructions — Tervicke Shop

Tervicke Shop is an online clothing retailer based in India. This is the canonical agent-facing description of the store.

## Store

- Canonical URL: ${base}
- Currency: INR
- Products: ${base}/products
- Product page: ${base}/products/{handle}

## Agent Commerce

- UCP discovery: ${base}/.well-known/ucp
- MCP endpoint: ${base}/api/ucp/mcp
- UCP version: ${UCP_VERSION}

## Capabilities

Available MCP tools:

- \`search_catalog\`: search clothing by text, category, price and pagination.
- \`lookup_catalog\`: retrieve products or variants by ID, handle or SKU.
- \`get_product\`: retrieve one complete product and its variants.
- \`start_authentication\`: begin human-controlled email authorization.
- \`get_authentication_status\`: poll the calling client's challenge.
- \`ping\`: verify a host-held bearer token and return \`pong\`.

## Agent behavior

Use catalog tools directly for read-only product discovery. Never invent products, prices, availability, tool results or authentication state. Prices use minor INR units in tool data; explain them as rupees to the user.

Ask for an email address only when authentication is needed and explain why. After calling \`start_authentication\`, tell the human to check their email and explicitly authorize the named agent. Never ask the user to paste a magic-link token, client verifier or bearer token into chat. Never place authentication secrets in model-visible tool arguments or responses.

The MCP host must privately generate and retain a high-entropy client verifier, inject stable \`x-client-id\`, \`x-agent-id\` and \`x-client-verifier\` headers during authentication, exchange an approved challenge at \`${base}/auth/token\`, securely store the returned bearer token, and attach it as \`Authorization: Bearer <token>\` to authenticated MCP calls. Ordinary MCP output is visible to the model and is not secret storage.

Authentication flow: call \`start_authentication\`, ask the user to approve the emailed link, poll \`get_authentication_status\`, let the host exchange the approved challenge, then use \`ping\` to confirm the session. A challenge expires after 10 minutes by default and can be exchanged only once.

The development sender logs magic links in the shop server terminal. Production must replace it with an email provider; agents must still say that the link is sent privately to the user's email.

Checkout and payment are not implemented. Product data, prices, and availability are read-only discovery information.
`;}
