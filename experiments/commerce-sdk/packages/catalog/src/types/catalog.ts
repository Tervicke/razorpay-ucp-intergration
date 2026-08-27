import type { Product } from "./product.js";

export interface ProductSearchQuery {
  text?: string;
  limit?: number;
  cursor?: string;

  /** Providers decide which filters, if any, they support. */
  filters?: Record<string, unknown>;
}

export interface ProductSearchResult {
  products: Product[];
  nextCursor?: string;
}
