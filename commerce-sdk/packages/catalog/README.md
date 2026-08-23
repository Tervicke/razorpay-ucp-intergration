# @commerce-sdk/catalog

Standalone product models and a catalog-provider contract for merchant commerce systems. The package has no runtime dependencies and no knowledge of MCP, HTTP frameworks, databases, payment providers, or other commerce modules.

```ts
import type {
  CatalogProvider,
  Product,
  ProductSearchQuery,
  ProductSearchResult,
} from "@commerce-sdk/catalog";

class MerchantCatalog implements CatalogProvider {
  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    // Query the merchant's database or API and map results to Product.
    return { products: [] };
  }

  async getProduct(id: string): Promise<Product | null> {
    // Fetch and map a merchant product.
    return null;
  }
}
```

For prototypes and tests, `InMemoryCatalogProvider` provides case-insensitive name/description search and cursor pagination.

## Commands

```bash
npm run build
npm test
```

During early development, `build` performs a strict typecheck without emitting a
`dist` directory. Compiled distribution files can be enabled when the package is
prepared for publication.
