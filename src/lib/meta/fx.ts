/**
 * Convert advertising amounts from each ad account's local currency
 * to THB so the dashboard can show a single rolled-up number.
 *
 * Phase 1: fixed rates from env vars (`META_FX_<CCY>_THB`). Update
 * manually once a month. Phase 2 (`add-fx-feed`) will pull from the
 * Bank of Thailand API daily.
 */

const FALLBACK_RATES: Record<string, number> = {
  THB: 1,
  USD: 36.0,
  EUR: 39.0,
  GBP: 46.0,
  JPY: 0.24,
  SGD: 27.0,
  AUD: 23.5,
  CNY: 5.0,
  HKD: 4.6,
  MYR: 7.7,
  IDR: 0.0022,
};

function getRate(currency: string): number {
  const ccy = currency.toUpperCase();
  if (ccy === "THB") return 1;

  const envKey = `META_FX_${ccy}_THB`;
  const envVal = process.env[envKey];
  if (envVal) {
    const n = Number(envVal);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return FALLBACK_RATES[ccy] ?? 1;
}

/** Convert `amount` in `currency` to THB. Returns 0 if amount is non-finite. */
export function convertToThb(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) return 0;
  return amount * getRate(currency);
}
