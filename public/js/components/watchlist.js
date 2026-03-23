import { api } from '../services/api.js';
import { state } from '../state.js';
import { formatCurrency, formatPercent, changeClass } from '../utils/format.js';
import { showToast } from '../utils/toast.js';

/** Cache of latest quote data keyed by symbol */
const _quoteCache = new Map();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Re-render the entire watchlist grid and refresh simulator ticker list.
 */
export function renderWatchlist() {
  _renderGrid();
  _syncSimulatorTickers();
}

/**
 * Fetch a fresh quote for one card and update the DOM.
 * @param {string} symbol
 */
export async function refreshCard(symbol) {
  const card = document.querySelector(`.watchlist-card[data-symbol="${symbol}"]`);
  if (!card) return;

  _setCardLoading(card, true);
  try {
    const data = await api.getQuote(symbol);
    _quoteCache.set(symbol, data);
    _populateCard(card, data);
  } catch (err) {
    _setCardError(card, err.message);
  } finally {
    _setCardLoading(card, false);
  }
}

/**
 * Refresh every card in the watchlist.
 */
export async function refreshAll() {
  await Promise.allSettled(state.watchlist.map((sym) => refreshCard(sym)));
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _renderGrid() {
  const grid = document.getElementById('watchlist-grid');

  if (state.watchlist.length === 0) {
    grid.innerHTML = '<div class="empty-state">Your watchlist is empty. Use the search or quick-add buttons above.</div>';
    return;
  }

  grid.innerHTML = state.watchlist.map(_buildCardHTML).join('');

  // Wire up remove buttons
  grid.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.symbol;
      state.removeTicker(sym);
      renderWatchlist();
      showToast(`Removed ${sym} from watchlist`, 'info');
    });
  });

  // Fetch quotes after rendering skeletons
  state.watchlist.forEach((sym) => refreshCard(sym));
}

function _buildCardHTML(symbol) {
  return `
    <div class="watchlist-card" data-symbol="${symbol}">
      <div class="card-header">
        <span class="card-symbol">${symbol}</span>
        <button class="remove-btn" data-symbol="${symbol}" title="Remove ${symbol}" aria-label="Remove ${symbol}">×</button>
      </div>
      <div class="card-name">—</div>
      <div class="card-price">—</div>
      <div class="card-change neutral">—</div>
      <div class="card-exchange"></div>
      <div class="card-loading hidden"><div class="spinner"></div></div>
    </div>
  `;
}

function _populateCard(card, data) {
  const cls = changeClass(data.regularMarketChange);

  card.querySelector('.card-name').textContent =
    data.shortName || data.symbol;

  card.querySelector('.card-price').textContent =
    formatCurrency(data.regularMarketPrice, data.currency);

  const changeEl = card.querySelector('.card-change');
  changeEl.className = `card-change ${cls}`;
  changeEl.textContent =
    `${formatCurrency(data.regularMarketChange, data.currency)}  (${formatPercent(data.regularMarketChangePercent)})`;

  const exchangeEl = card.querySelector('.card-exchange');
  const parts = [data.quoteType, data.exchangeName].filter(Boolean);
  exchangeEl.textContent = parts.join(' · ');
}

function _setCardLoading(card, loading) {
  card.querySelector('.card-loading').classList.toggle('hidden', !loading);
}

function _setCardError(card, message) {
  card.querySelector('.card-name').textContent = 'Failed to load';
  card.querySelector('.card-price').textContent = '—';
  const el = card.querySelector('.card-change');
  el.className = 'card-change negative';
  el.textContent = message;
}

/**
 * Keep the simulator ticker checkboxes in sync with the watchlist.
 * Preserves checked state of already-checked tickers.
 */
export function _syncSimulatorTickers() {
  const container = document.getElementById('sim-tickers');
  if (!container) return;

  if (state.watchlist.length === 0) {
    container.innerHTML = '<span class="muted-hint">Add tickers to watchlist first.</span>';
    return;
  }

  // Remember currently checked tickers
  const checked = new Set(
    [...container.querySelectorAll('input:checked')].map((i) => i.value)
  );

  container.innerHTML = state.watchlist
    .map((sym) => {
      const isChecked = checked.size === 0 ? true : checked.has(sym); // check all by default
      return `
        <label class="ticker-cb-item">
          <input type="checkbox" value="${sym}" ${isChecked ? 'checked' : ''} />
          ${sym}
        </label>
      `;
    })
    .join('');
}
