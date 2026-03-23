import { api } from '../services/api.js';
import { CONFIG } from '../config.js';
import { formatCurrency, formatPercent, changeClass } from '../utils/format.js';
import { todayISO, yearsAgoISO } from '../utils/date.js';
import { showToast } from '../utils/toast.js';
import { renderSimulationChart } from './chart.js';

// ── Init ─────────────────────────────────────────────────────────────────────

export function initSimulator() {
  const startInput = document.getElementById('sim-start');
  startInput.value = yearsAgoISO(1);
  startInput.max = todayISO();

  document.getElementById('run-simulation-btn')
    .addEventListener('click', _runSimulation);
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function _runSimulation() {
  const amount    = parseFloat(document.getElementById('sim-amount').value);
  const startDate = document.getElementById('sim-start').value;
  const tickers   = _getSelectedTickers();

  if (!amount || amount <= 0) {
    showToast('Wprowadź prawidłową kwotę inwestycji początkowej.', 'error');
    return;
  }
  if (!startDate) {
    showToast('Wybierz datę początkową.', 'error');
    return;
  }
  if (tickers.length === 0) {
    showToast('Wybierz co najmniej jeden instrument.', 'error');
    return;
  }

  const btn = document.getElementById('run-simulation-btn');
  btn.disabled = true;
  btn.textContent = 'Ładuję…';

  try {
    const endDate = todayISO();
    const results = await Promise.all(
      tickers.map((sym) => _buildSimResult(sym, startDate, endDate, amount))
    );

    const valid = results.filter(Boolean);
    if (valid.length === 0) {
      showToast('Nie znaleziono danych dla wybranych instrumentów i zakresu dat.', 'error');
      return;
    }

    _displayResults(valid, amount, startDate);
  } catch (err) {
    showToast(`Błąd symulacji: ${err.message}`, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Uruchom Symulację';
  }
}

/**
 * Fetch history and compute portfolio value series for one ticker.
 * Returns null when data is insufficient.
 *
 * @param {string} symbol
 * @param {string} startDate
 * @param {string} endDate
 * @param {number} initialAmount
 * @returns {Promise<SimResult|null>}
 */
async function _buildSimResult(symbol, startDate, endDate, initialAmount) {
  try {
    const { data } = await api.getHistory(symbol, startDate, endDate);
    if (!data || data.length < 2) return null;

    const startPrice = data[0].close;
    const points = data.map((d) => ({
      date:  d.date,
      value: initialAmount * (d.close / startPrice),
    }));
    const finalValue = points.at(-1).value;

    return {
      symbol,
      points,
      startDate:   data[0].date,
      endDate:     data.at(-1).date,
      startPrice,
      endPrice:    data.at(-1).close,
      initialAmount,
      finalValue,
      gain:        finalValue - initialAmount,
      gainPercent: ((finalValue - initialAmount) / initialAmount) * 100,
    };
  } catch (err) {
    console.warn(`[Simulator] ${symbol}:`, err.message);
    return null;
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function _displayResults(results, initialAmount, startDate) {
  const resultsEl = document.getElementById('simulator-results');
  resultsEl.classList.remove('hidden');

  // Build chart datasets — tickers + a flat "Cash" reference line
  const cashPoints = _buildCashPoints(results, initialAmount);
  const datasets = [
    ...results.map((r, i) => ({
      label:  r.symbol,
      points: r.points,
      colorOverride: CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length],
    })),
    {
      label:        'Gotówka (bez wzrostu)',
      points:       cashPoints,
      dashed:       true,
      colorOverride: CONFIG.CASH_LINE_COLOR,
    },
  ];

  renderSimulationChart('sim-chart', datasets);
  _renderSummaryCards(results, initialAmount);
}

function _renderSummaryCards(results, initialAmount) {
  const container = document.getElementById('sim-summary');
  container.innerHTML = results
    .map((r, i) => {
      const color = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
      const cls   = changeClass(r.gain);
      const arrow = r.gain >= 0 ? '▲' : '▼';
      return `
        <div class="summary-card">
          <div class="sc-label">Startowa: ${formatCurrency(initialAmount)}</div>
          <div class="sc-symbol" style="color:${color}">${r.symbol}</div>
          <div class="sc-value">${formatCurrency(r.finalValue)}</div>
          <div class="sc-gain ${cls}">
            ${arrow} ${formatCurrency(Math.abs(r.gain))} &nbsp;(${formatPercent(r.gainPercent)})
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Build a flat line dataset for the "Cash" reference.
 * Uses the date range common across all result sets.
 */
function _buildCashPoints(results, amount) {
  // Use the dates from the first result as anchor
  const base = results[0]?.points ?? [];
  return base.map((p) => ({ date: p.date, value: amount }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getSelectedTickers() {
  return [...document.querySelectorAll('#sim-tickers input[type="checkbox"]:checked')]
    .map((el) => el.value);
}

/**
 * @typedef {{
 *   symbol: string,
 *   points: Array<{date:string, value:number}>,
 *   startDate: string,
 *   endDate: string,
 *   startPrice: number,
 *   endPrice: number,
 *   initialAmount: number,
 *   finalValue: number,
 *   gain: number,
 *   gainPercent: number,
 * }} SimResult
 */
