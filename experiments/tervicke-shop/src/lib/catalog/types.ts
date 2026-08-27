export type Money = { amount: number; currency: "INR" };
export type ProductVariant = { id: string; sku: string; price: number; availableQuantity: number; options: Record<string,string> };
export type Product = { id:string; handle:string; title:string; description:string; category:string; currency:"INR"; imageUrl:string; color:string; tags:string[]; variants:ProductVariant[] };
export type SearchInput = { query?:string; category?:string; priceMin?:number; priceMax?:number; limit?:number; cursor?:string };
