import type { Money } from "./types";

/**
 * Minor-unit helpers. Currencies differ: MAD/EUR use 2 decimals, but the Libyan
 * dinar (LYD) is divided into 1,000 dirhams, so it uses 3. The exponent comes from
 * ISO 4217 via Intl, so amounts are never hard-coded as "× 100".
 */
const exponents = new Map<string, number>();

export function currencyExponent(currency: string): number {
  let exp = exponents.get(currency);
  if (exp === undefined) {
    exp = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    exponents.set(currency, exp);
  }
  return exp;
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyExponent(currency));
}

export function toMajor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** currencyExponent(currency);
}

export function money(major: number, currency: string): Money {
  return { amountMinor: toMinor(major, currency), currency };
}
