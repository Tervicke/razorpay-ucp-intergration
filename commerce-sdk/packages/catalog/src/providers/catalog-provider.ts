import type { ProductSearchQuery, ProductSearchResult } from "../types/catalog.js";
import type { Product } from "../types/product.js";

/**
 * Merchant storage and APIs remain behind this boundary. Transport packages
 * such as MCP or REST can depend on this contract without entering the domain.
 */
export interface CatalogProvider {
  search(query: ProductSearchQuery): Promise<ProductSearchResult>;
  getProduct(id: string): Promise<Product | null>;
}
