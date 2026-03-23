/**
 * Number & currency formatting helpers.
 */

const USD_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as currency.
 * Falls back to USD when currency is unavailable.
 * @param {number} value
 * @param {string} [currency='USD']
 */
export function formatCurrency(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return USD_FMT.format(value);
  }
}

/**
 * Format a percentage with sign.
 * @param {number} value
 * @param {number} [decimals=2]
 */
export function formatPercent(value, decimals = 2) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Return Tailwind-style class for a positive/negative/neutral value.
 * @param {number} value
 * @returns {'positive'|'negative'|'neutral'}
 */
export function changeClass(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}
