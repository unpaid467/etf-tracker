import { CONFIG } from '../config.js';

/**
 * Thin HTTP client for the backend API.
 * All methods throw on non-2xx responses.
 */
export const api = {
  /**
   * Fetch current quote for a symbol.
   * @param {string} symbol
   */
  getQuote(symbol) {
    return _get(`/quote/${encodeURIComponent(symbol)}`);
  },

  /**
   * Fetch daily historical prices.
   * @param {string} symbol
   * @param {string} start  YYYY-MM-DD
   * @param {string} end    YYYY-MM-DD
   * @returns {Promise<{data: Array<{date:string, close:number}>}>}
   */
  getHistory(symbol, start, end) {
    return _get(`/history/${encodeURIComponent(symbol)}`, { start, end });
  },

  /**
   * Search for stocks and ETFs.
   * @param {string} q
   * @returns {Promise<{results: Array}>}
   */
  search(q) {
    return _get('/search', { q });
  },
};

async function _get(path, params = {}) {
  const url = new URL(CONFIG.API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
