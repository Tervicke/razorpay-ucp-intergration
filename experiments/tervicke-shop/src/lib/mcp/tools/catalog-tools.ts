import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProduct } from "./get-product";
import { lookupCatalog } from "./lookup-catalog";
import { searchCatalog } from "./search-catalog";

const meta = z.record(z.unknown()).optional();
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> });
export function registerCatalogTools(server: McpServer): void {
  server.registerTool("search_catalog", { title: "Search catalog", description: "Search Tervicke Shop products using UCP Catalog Search semantics.", inputSchema: { meta, catalog: z.object({ query: z.string().optional(), context: z.object({ address_country: z.string().optional(), intent: z.string().optional() }).optional(), filters: z.object({ category: z.string().optional(), price: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional() }).optional(), pagination: z.object({ limit: z.number().int().min(1).max(50).optional(), cursor: z.string().optional() }).optional() }) } }, async input => result(searchCatalog(input)));
  server.registerTool("lookup_catalog", { title: "Lookup catalog", description: "Retrieve products and variants by product ID, variant ID, handle, or SKU.", inputSchema: { meta, catalog: z.object({ ids: z.array(z.string()).min(1).max(50) }) } }, async input => result(lookupCatalog(input)));
  server.registerTool("get_product", { title: "Get product", description: "Retrieve one complete product, optionally prioritizing selected options.", inputSchema: { meta, catalog: z.object({ id: z.string(), selected: z.array(z.object({ name: z.string(), value: z.string() })).optional() }) } }, async input => result(getProduct(input)));
}
