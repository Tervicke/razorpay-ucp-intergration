import Link from "next/link";
import { catalogService } from "@/lib/catalog/catalog-service";
import { ProductCard } from "@/components/product-card";
export default function Home() {
  const products = catalogService.all().slice(0, 4);
  return (
    <main>
      <section className="hero">
        <div>
          <p className="kicker">New Delhi · Edition 01</p>
          <h1>
            WEAR
            <br />
            YOUR
            <br />
            INTENT.
          </h1>
        </div>
        <div className="hero-copy">
          Independent essentials with generous proportions. Discoverable by
          people, readable by agents.
          <br />
          <Link href="/products">Explore the collection →</Link>
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <div>
            <p className="kicker">Freshly dropped</p>
            <h2>Featured pieces</h2>
          </div>
          <Link href="/products">View all 08 →</Link>
        </div>
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </main>
  );
}
