import type { Money } from "./money.js";

/** A purchasable variation of a product. */
export interface ProductVariant {
  id: string;
  name?: string;
  sku?: string;

  /** Merchant-defined dimensions such as color, size, weight, or storage. */
  options: Record<string, string>;

  /** When omitted, the product's base price applies. */
  price?: Money;

  /** When omitted, the product's base availability applies. */
  available?: boolean;

  metadata?: Record<string, unknown>;
}

/** Canonical product data shared by every transport and merchant backend. */
export interface Product {
  id: string;
  name: string;
  description?: string;
  price: Money;
  available: boolean;
  variants?: ProductVariant[];
  images?: string[];

  /**
   * Generic attributes keep the model useful across merchant categories without
   * baking clothing-, grocery-, or electronics-specific fields into the SDK.
   */
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
