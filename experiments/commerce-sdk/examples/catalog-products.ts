import type { Product } from "@commerce-sdk/catalog";

export const exampleProducts: Product[] = [
  {
    id: "shirt_001",
    name: "Classic Cotton Shirt",
    description: "A soft everyday cotton shirt.",
    price: { amount: 149900, currency: "INR" },
    available: true,
    images: ["https://example.com/images/cotton-shirt.jpg"],
    attributes: { material: "cotton", category: "clothing" },
    variants: [
      { id: "shirt_001_black_m", sku: "SHIRT-BLK-M", options: { color: "black", size: "M" } },
      {
        id: "shirt_001_blue_l",
        sku: "SHIRT-BLU-L",
        options: { color: "blue", size: "L" },
        price: { amount: 159900, currency: "INR" },
        available: false,
      },
    ],
  },
  {
    id: "coffee_500g",
    name: "Arabica Coffee",
    description: "Medium-roast whole coffee beans.",
    price: { amount: 49900, currency: "INR" },
    available: true,
    attributes: { category: "FMCG", weight: "500g" },
  },
  {
    id: "charger_20w",
    name: "20W USB-C Charger",
    price: { amount: 129900, currency: "INR" },
    available: true,
    attributes: { category: "electronics", power: "20W" },
  },
];
