/**
 * A monetary value in the currency's smallest unit.
 *
 * Integers avoid floating-point rounding errors: INR 499.00 is represented as
 * `{ amount: 49900, currency: "INR" }`.
 */
export interface Money {
  amount: number;
  currency: string;
}
