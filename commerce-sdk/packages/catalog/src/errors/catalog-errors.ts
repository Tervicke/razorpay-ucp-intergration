export class CatalogError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CatalogError";
  }
}

export class InvalidProductError extends CatalogError {
  readonly productId?: string;

  constructor(message: string, productId?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidProductError";
    this.productId = productId;
  }
}
