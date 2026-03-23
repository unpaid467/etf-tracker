import { state } from './state.js';
import { CONFIG } from './config.js';
import { api } from './services/api.js';
import { renderWatchlist, refreshAll, _syncSimulatorTickers } from './components/watchlist.js';
import { initSimulator } from './components/simulator.js';
import { showToast } from './utils/toast.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initSimulator();
  renderWatchlist();
  _setupSearch();
  _setupRefreshButton();
  _startAutoRefresh();
  _updateLastUpdatedLabel();
  _setupQuickAdd();
});

// ── Search ────────────────────────────────────────────────────────────────────

function _setupSearch() {
  const input    = document.getElementById('ticker-search');
  const dropdown = document.getElementById('search-results');
  let debounce   = null;

  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    debounce = setTimeout(() => _performSearch(q, dropdown), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dropdown.classList.add('hidden'); input.value = ''; }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

async function _performSearch(query, dropdown) {
  dropdown.classList.remove('hidden');
dropdown.innerHTML = '<div class="search-result-item"><span class="sr-name">Szukam…</span></div>';

  try {
    const { results } = await api.search(query);

    if (!results.length) {
      dropdown.innerHTML = '<div class="search-result-item"><span class="sr-name">Brak wyników.</span></div>';
      return;
    }

    dropdown.innerHTML = results
      .map(
        (r) => `
          <div class="search-result-item" data-symbol="${_esc(r.symbol)}">
            <span class="sr-symbol">${_esc(r.symbol)}</span>
            <span class="sr-name">${_esc(r.name)}</span>
            <span class="sr-type">${_esc(r.type ?? '')}</span>
          </div>`
      )
      .join('');

    dropdown.querySelectorAll('.search-result-item[data-symbol]').forEach((item) => {
      item.addEventListener('click', () => _addTicker(item.dataset.symbol, dropdown));
    });
  } catch (err) {
    dropdown.innerHTML = `<div class="search-result-item"><span class="sr-name negative">Error: ${_esc(err.message)}</span></div>`;
  }
}

function _addTicker(symbol, dropdown) {
  const input = document.getElementById('ticker-search');
  dropdown.classList.add('hidden');
  input.value = '';

  const added = state.addTicker(symbol);
  if (added) {
    renderWatchlist();
    showToast(`Dodano ${symbol} do listy obserwowanych`, 'success');
  } else {
    showToast(`${symbol} jest już na liście obserwowanych`, 'info');
  }
}

// ── Quick-add chips ───────────────────────────────────────────────────────────

function _setupQuickAdd() {
  document.querySelectorAll('.chip[data-symbol]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const sym = chip.dataset.symbol;
      const added = state.addTicker(sym);
      if (added) {
        renderWatchlist();
        showToast(`Dodano ${sym}`, 'success');
      } else {
        showToast(`${sym} już na liście obserwowanych`, 'info');
      }
    });
  });
}

// ── Manual refresh button ─────────────────────────────────────────────────────

function _setupRefreshButton() {
  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Odświeżam…';
    await refreshAll();
    _updateLastUpdatedLabel();
    btn.disabled = false;
    btn.textContent = 'Odśwież';
    showToast('Ceny zaktualizowane', 'success');
  });
}

// ── Auto-refresh every hour ───────────────────────────────────────────────────

function _startAutoRefresh() {
  setInterval(async () => {
    await refreshAll();
    _updateLastUpdatedLabel();
  }, CONFIG.REFRESH_INTERVAL_MS);
}

function _updateLastUpdatedLabel() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = `Zaktualizowano: ${new Date().toLocaleTimeString()}`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Safe HTML escaping to prevent XSS from API data */
function _esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str ?? '')));
  return d.innerHTML;
}
