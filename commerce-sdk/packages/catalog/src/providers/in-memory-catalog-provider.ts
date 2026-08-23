import { CatalogError, InvalidProductError } from "../errors/catalog-errors.js";
import type { ProductSearchQuery, ProductSearchResult } from "../types/catalog.js";
import type { Money } from "../types/money.js";
import type { Product } from "../types/product.js";
import type { CatalogProvider } from "./catalog-provider.js";

export interface InMemoryCatalogProviderOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

/** A small provider useful for examples, tests, and local prototypes. */
export class InMemoryCatalogProvider implements CatalogProvider {
  private readonly products: readonly Product[];
  private readonly productsById: ReadonlyMap<string, Product>;
  private readonly defaultLimit: number;
  private readonly maxLimit: number;

  constructor(products: readonly Product[], options: InMemoryCatalogProviderOptions = {}) {
    this.defaultLimit = options.defaultLimit ?? 20;
    this.maxLimit = options.maxLimit ?? 100;

    if (!Number.isInteger(this.defaultLimit) || this.defaultLimit < 1) {
      throw new CatalogError("defaultLimit must be a positive integer");
    }
    if (!Number.isInteger(this.maxLimit) || this.maxLimit < 1) {
      throw new CatalogError("maxLimit must be a positive integer");
    }
    if (this.defaultLimit > this.maxLimit) {
      throw new CatalogError("defaultLimit cannot exceed maxLimit");
    }

    const byId = new Map<string, Product>();
    for (const product of products) {
      validateProduct(product);
      if (byId.has(product.id)) {
        throw new InvalidProductError(`Duplicate product id: ${product.id}`, product.id);
      }
      byId.set(product.id, product);
    }

    this.products = [...products];
    this.productsById = byId;
  }

  async search(query: ProductSearchQuery = {}): Promise<ProductSearchResult> {
    const limit = query.limit ?? this.defaultLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > this.maxLimit) {
      throw new CatalogError(`limit must be an integer between 1 and ${this.maxLimit}`);
    }

    const offset = parseCursor(query.cursor);
    const searchText = query.text?.trim().toLocaleLowerCase();
    const matches = searchText
      ? this.products.filter((product) =>
          `${product.name} ${product.description ?? ""}`.toLocaleLowerCase().includes(searchText),
        )
      : this.products;

    if (offset > matches.length) {
      throw new CatalogError("cursor is outside the result set");
    }

    const products = matches.slice(offset, offset + limit);
    const nextOffset = offset + products.length;

    return {
      products,
      ...(nextOffset < matches.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async getProduct(id: string): Promise<Product | null> {
    return this.productsById.get(id) ?? null;
  }
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^\d+$/.test(cursor)) throw new CatalogError("Invalid cursor");

  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset)) throw new CatalogError("Invalid cursor");
  return offset;
}

function validateMoney(money: Money, productId: string): void {
  if (!Number.isSafeInteger(money.amount) || money.amount < 0) {
    throw new InvalidProductError("price.amount must be a non-negative safe integer", productId);
  }
  if (money.currency.trim().length === 0) {
    throw new InvalidProductError("price.currency must not be empty", productId);
  }
}

function validateProduct(product: Product): void {
  if (product.id.trim().length === 0) throw new InvalidProductError("Product id must not be empty");
  if (product.name.trim().length === 0) {
    throw new InvalidProductError("Product name must not be empty", product.id);
  }
  validateMoney(product.price, product.id);

  const variantIds = new Set<string>();
  for (const variant of product.variants ?? []) {
    if (variant.id.trim().length === 0 || variantIds.has(variant.id)) {
      throw new InvalidProductError("Variant ids must be non-empty and unique", product.id);
    }
    variantIds.add(variant.id);
    if (variant.price) validateMoney(variant.price, product.id);
  }
}
