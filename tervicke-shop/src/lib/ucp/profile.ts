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

Agents may search the catalog, look up products or variants, and retrieve complete product details.

Checkout and payment are not implemented. Product data, prices, and availability are read-only discovery information.
`;}
