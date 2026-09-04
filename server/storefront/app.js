const productGrid = document.querySelector("#product-grid");
const catalogState = document.querySelector("#catalog-state");
const resultSummary = document.querySelector("#result-summary");
const searchForm = document.querySelector("#catalog-search");
const searchInput = document.querySelector("#search-query");
const orderForm = document.querySelector("#order-form");
const orderResult = document.querySelector("#order-result");

const money = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(amount || 0) / 100,
  );

const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );

const requestId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function loadCatalog(query = "") {
  productGrid.innerHTML = "";
  catalogState.classList.remove("hidden");
  catalogState.textContent = "Gathering fresh flowers…";
  const params = new URLSearchParams({ q: query, limit: "50" });

  try {
    const response = await fetch(`/products/search?${params}`);
    if (!response.ok) throw new Error("The catalog could not be loaded.");
    const data = await response.json();
    catalogState.classList.add("hidden");
    resultSummary.textContent = query
      ? `${data.count} result${data.count === 1 ? "" : "s"} for “${query}”`
      : `${data.count} fresh selections`;

    if (!data.products.length) {
      catalogState.textContent = "No flowers matched that search. Try an occasion or flower name.";
      catalogState.classList.remove("hidden");
      return;
    }

    productGrid.innerHTML = data.products
      .map(
        (product, index) => `
          <article class="product-card">
            <div class="product-image-wrap">
              <span class="product-number">${String(index + 1).padStart(2, "0")}</span>
              <img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}" loading="lazy" referrerpolicy="no-referrer" />
            </div>
            <div class="product-copy">
              <div class="product-title-row">
                <h3 class="product-title">${escapeHtml(product.title)}</h3>
                <span class="product-price">${money(product.price, product.currency)}</span>
              </div>
              <p class="product-description">${escapeHtml(product.description)}</p>
              <span class="product-id">Product ID · ${escapeHtml(product.id)}</span>
            </div>
          </article>`,
      )
      .join("");
  } catch (error) {
    catalogState.textContent = error.message;
    resultSummary.textContent = "";
  }
}

function latestOrderStatus(order) {
  if (order.status) return String(order.status).replaceAll("_", " ");
  const events = order.fulfillment?.events || [];
  return events.at(-1)?.type?.replaceAll("_", " ") || "Order received";
}

function orderTotal(order) {
  const totals = order.totals || [];
  return totals.find((total) => total.type === "total") || totals.at(-1) || { amount: 0 };
}

function renderOrder(order) {
  const items = order.line_items || [];
  const total = orderTotal(order);
  orderResult.innerHTML = `
    <div class="order-topline">
      <div><p class="eyebrow">Order details</p><h3>${escapeHtml(order.label || "Gulbahar order")}</h3>
      <span class="order-reference">${escapeHtml(order.id)}</span></div>
      <span class="status-pill">${escapeHtml(latestOrderStatus(order))}</span>
    </div>
    <div class="order-items">
      ${items
        .map((line) => {
          const item = line.item || {};
          const lineTotal = (line.totals || []).find((value) => value.type === "total");
          return `<div class="order-item"><div><strong>${escapeHtml(item.title || item.id || "Flower item")}</strong>
            <small>Quantity ${escapeHtml(line.quantity || 1)}</small></div>
            <span>${money(lineTotal?.amount ?? item.price * (line.quantity || 1), order.currency)}</span></div>`;
        })
        .join("")}
    </div>
    <div class="order-total"><span>Total</span><span>${money(total.amount, order.currency)}</span></div>`;
  orderResult.classList.remove("hidden");
}

async function findOrder(orderId) {
  orderResult.classList.remove("hidden");
  orderResult.innerHTML = "Looking up your order…";
  try {
    const response = await fetch(`/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        "UCP-Agent": 'profile="https://gulbahar.example/customer";version="2026-04-08"',
        "Request-Id": requestId(),
      },
    });
    if (response.status === 404) throw new Error("We could not find that order ID. Check it and try again.");
    if (!response.ok) throw new Error("The order service is unavailable right now.");
    renderOrder(await response.json());
  } catch (error) {
    orderResult.innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadCatalog(searchInput.value.trim());
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  findOrder(document.querySelector("#order-id").value.trim());
});

loadCatalog();
