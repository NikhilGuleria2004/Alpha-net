/**
 * EMS currency helpers (EMSFrontend.md §4.5 — "Consistent currency formatting").
 *
 * Money in the EMS is always 2 decimals in a given context and never mixes 0-
 * and 2-decimal forms. The timesheet platform's `format.ts#formatCurrency`
 * hard-codes USD; the EMS deals with multi-currency client/pay rates, so this
 * module owns the currency-aware path and `format.ts` stays untouched.
 */

export type SupportedCurrency = 'USD' | 'INR' | 'EUR' | 'GBP'

/** Alias of {@link SupportedCurrency} for the `types/*` domain models. */
export type SupportedCurrencyCode = SupportedCurrency

export const CURRENCIES: { value: SupportedCurrency; label: string }[] = [
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'INR', label: 'Indian Rupee (INR)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
]

/** `$1,250.00` — always 2 decimals, locale-pinned to en-US (see date.ts D-5). */
export function formatMoney(amount: number, currency: SupportedCurrency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** `$85.00/h` — the rate form used by pay/bill rate cells and inputs. */
export function formatRate(amount: number, currency: SupportedCurrency = 'USD'): string {
  return `${formatMoney(amount, currency)}\u00a0/\u00a0h`
}

/** Thousands-separated integer/decimal, for counts that are not money. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** Percent with a fixed number of decimals, e.g. `41%` or `40.9%`. */
export function formatPercent(value: number, fractionDigits = 0): string {
  return `${formatNumber(value, fractionDigits)}%`
}

/**
 * Parse a user-typed money string (`"1,250.50"`, `"$85"`, `" 40 `) into a
 * number, or `null` when it is not a valid non-negative amount. Used by the
 * currency-aware `MoneyInput`/`RateInput`.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const value = Number(cleaned)
  if (Number.isNaN(value) || value < 0) return null
  return value
}
