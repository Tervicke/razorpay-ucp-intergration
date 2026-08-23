import { describe, expect, it } from "vitest";
import { CatalogError, InMemoryCatalogProvider, InvalidProductError, type Product } from "../src/index.js";

const products: Product[] = [
  { id: "shirt", name: "Black Shirt", description: "Soft cotton tee", price: { amount: 49900, currency: "INR" }, available: true },
  { id: "coffee", name: "Arabica Coffee", price: { amount: 79900, currency: "INR" }, available: true },
];

describe("InMemoryCatalogProvider", () => {
  it("finds products by name or description", async () => {
    const provider = new InMemoryCatalogProvider(products);
    expect((await provider.search({ text: "COTTON" })).products[0]?.id).toBe("shirt");
    expect((await provider.search({ text: "coffee" })).products[0]?.id).toBe("coffee");
  });

  it("paginates in insertion order", async () => {
    const provider = new InMemoryCatalogProvider(products, { defaultLimit: 1 });
    const first = await provider.search({});
    const second = await provider.search({ cursor: first.nextCursor });
    expect(first.products.map(({ id }) => id)).toEqual(["shirt"]);
    expect(second.products.map(({ id }) => id)).toEqual(["coffee"]);
    expect(second.nextCursor).toBeUndefined();
  });

  it("returns null when an id is absent", async () => {
    expect(await new InMemoryCatalogProvider(products).getProduct("missing")).toBeNull();
  });

  it("rejects invalid products and queries", async () => {
    expect(() => new InMemoryCatalogProvider([{ ...products[0], price: { amount: 4.99, currency: "INR" } }])).toThrow(InvalidProductError);
    await expect(new InMemoryCatalogProvider(products).search({ limit: 0 })).rejects.toBeInstanceOf(CatalogError);
  });
});
