import { getDatabase } from "./database";
import type { Product, ProductVariant, SearchInput } from "./types";
type Row = {
  id: string;
  handle: string;
  title: string;
  description: string;
  category: string;
  currency: "INR";
  image_url: string;
  color: string;
  tags: string;
};
type VRow = {
  id: string;
  sku: string;
  price: number;
  available_quantity: number;
  options: string;
};
export class CatalogService {
  private hydrate(r: Row): Product {
    const vs = getDatabase()
      .prepare(
        "SELECT id,sku,price,available_quantity,options FROM variants WHERE product_id=? ORDER BY id"
      )
      .all(r.id) as VRow[];
    return {
      id: r.id,
      handle: r.handle,
      title: r.title,
      description: r.description,
      category: r.category,
      currency: r.currency,
      imageUrl: r.image_url,
      color: r.color,
      tags: JSON.parse(r.tags),
      variants: vs.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: v.price,
        availableQuantity: v.available_quantity,
        options: JSON.parse(v.options),
      })),
    };
  }
  all() {
    return (
      getDatabase().prepare("SELECT * FROM products ORDER BY id").all() as Row[]
    ).map((r) => this.hydrate(r));
  }
  search(i: SearchInput = {}) {
    const terms = (i.query || "").toLowerCase().split(/\s+/).filter(Boolean);
    let xs = this.all().filter((p) => {
      const hay = [p.title, p.description, p.category, p.color, ...p.tags]
        .join(" ")
        .toLowerCase();
      const category =
        !i.category || p.category.toLowerCase() === i.category.toLowerCase();
      const min = Math.min(...p.variants.map((v) => v.price));
      return (
        terms.every((t) => hay.includes(t)) &&
        category &&
        (i.priceMin == null || min >= i.priceMin) &&
        (i.priceMax == null || min <= i.priceMax)
      );
    });
    const start = Number(i.cursor || 0);
    const limit = Math.min(i.limit || 10, 50);
    return {
      products: xs.slice(start, start + limit),
      nextCursor: start + limit < xs.length ? String(start + limit) : undefined,
      total: xs.length,
    };
  }
  byHandle(h: string) {
    const r = getDatabase()
      .prepare("SELECT * FROM products WHERE handle=?")
      .get(h) as Row | undefined;
    return r ? this.hydrate(r) : undefined;
  }
  lookup(ids: string[]) {
    const all = this.all();
    return all.filter((p) =>
      ids.some(
        (id) =>
          id === p.id ||
          id === p.handle ||
          p.variants.some((v) => id === v.id || id === v.sku)
      )
    );
  }
  get(id: string, selected?: { name: string; value: string }[]) {
    const p = this.lookup([id])[0];
    if (!p) return;
    if (selected?.length)
      p.variants.sort((a, b) =>
        Number(selected.every((s) => a.options[s.name] === s.value)) >
        Number(selected.every((s) => b.options[s.name] === s.value))
          ? -1
          : 1
      );
    return p;
  }
}
export const catalogService = new CatalogService();
