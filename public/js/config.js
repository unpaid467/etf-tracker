/** Central configuration. Change values here to affect the whole app. */
export const CONFIG = Object.freeze({
  /** Base URL for all backend API calls */
  API_BASE: '/api/market',

  /** How often (ms) to auto-refresh watchlist prices (1 hour) */
  REFRESH_INTERVAL_MS: 60 * 60 * 1000,

  /** Tickers pre-loaded in a fresh watchlist */
  DEFAULT_TICKERS: ['VWCE.DE', 'BETASPTH.WA', 'BETANASH.WA'],

  /** Ordered palette for chart datasets */
  CHART_COLORS: [
    '#4f8ef7', // blue
    '#22c55e', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
  ],

  /** Colour used for the "Cash (no growth)" reference line */
  CASH_LINE_COLOR: '#484f58',
});
