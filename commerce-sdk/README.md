# Commerce SDK

A package-oriented TypeScript foundation for merchant-side AI commerce integrations. Only the standalone catalog domain exists today; future domains can be added as sibling packages without coupling them to transports or merchant infrastructure.

## Catalog package

[`@commerce-sdk/catalog`](./packages/catalog) contains canonical money and product models, catalog search types, the merchant-facing `CatalogProvider`, and an in-memory implementation. It has no runtime dependencies.

Merchant databases, APIs, and platforms integrate by implementing `CatalogProvider`; MCP, REST, and UCP can later live in separate adapter packages.

## Workspace commands

```bash
npm install
npm run build
npm run typecheck
npm test
```

The catalog can also be built independently:

```bash
npm run build --workspace=@commerce-sdk/catalog
npm run test --workspace=@commerce-sdk/catalog
```

Example product data is in `examples/catalog-products.ts`. The Tervicke Shop storefront is a separate sibling project at `../tervicke-shop` and is not a dependency of this SDK.
