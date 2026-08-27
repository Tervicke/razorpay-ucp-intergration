export type { Money } from "./types/money.js";
export type { Product, ProductVariant } from "./types/product.js";
export type { ProductSearchQuery, ProductSearchResult } from "./types/catalog.js";
export type { CatalogProvider } from "./providers/catalog-provider.js";
export {
  InMemoryCatalogProvider,
  type InMemoryCatalogProviderOptions,
} from "./providers/in-memory-catalog-provider.js";
export { CatalogError, InvalidProductError } from "./errors/catalog-errors.js";
