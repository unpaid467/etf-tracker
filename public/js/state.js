import { CONFIG } from './config.js';

const STORAGE_KEY = 'market_monitor_watchlist';

/**
 * Reactive app state backed by localStorage.
 * Consumers should call state methods and re-render; no framework needed.
 */
export const state = {
  /** @type {string[]} */
  watchlist: _load(),

  /**
   * Add a ticker symbol. Returns true if it was newly added.
   * @param {string} symbol
   * @returns {boolean}
   */
  addTicker(symbol) {
    const sym = symbol.toUpperCase().trim();
    if (this.watchlist.includes(sym)) return false;
    this.watchlist = [...this.watchlist, sym];
    _save(this.watchlist);
    return true;
  },

  /**
   * Remove a ticker symbol.
   * @param {string} symbol
   */
  removeTicker(symbol) {
    this.watchlist = this.watchlist.filter((s) => s !== symbol);
    _save(this.watchlist);
  },
};

function _load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(stored) && stored.length > 0 ? stored : [...CONFIG.DEFAULT_TICKERS];
  } catch {
    return [...CONFIG.DEFAULT_TICKERS];
  }
}

function _save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
