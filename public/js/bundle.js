(() => {
  // public/js/config.js
  var CONFIG = Object.freeze({
    /** Base URL for all backend API calls */
    API_BASE: "/api/market",
    /** How often (ms) to auto-refresh watchlist prices (1 hour) */
    REFRESH_INTERVAL_MS: 60 * 60 * 1e3,
    /** Tickers pre-loaded in a fresh watchlist */
    // VWCE.DE = Vanguard FTSE All-World (XETRA), CSPX.L = S&P 500 (London), EQQQ.L = NASDAQ-100 (London)
    DEFAULT_TICKERS: ["VWCE.DE", "CSPX.L", "EQQQ.L"],
    /** Ordered palette for chart datasets */
    CHART_COLORS: [
      "#4f8ef7",
      // blue
      "#22c55e",
      // green
      "#f59e0b",
      // amber
      "#ef4444",
      // red
      "#8b5cf6",
      // violet
      "#06b6d4",
      // cyan
      "#ec4899",
      // pink
      "#84cc16"
      // lime
    ],
    /** Colour used for the "Cash (no growth)" reference line */
    CASH_LINE_COLOR: "#484f58"
  });

  // public/js/state.js
  var STORAGE_KEY = "market_monitor_watchlist";
  var state = {
    /** @type {string[]} */
    watchlist: _load(),
    /**
     * Add a ticker symbol. Returns true if it was newly added.
     * @param {string} symbol
     * @returns {boolean}
     */
    addTicker(symbol) {
      const sym = symbol.toUpperCase().trim();
      if (this.watchlist.includes(sym))
        return false;
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
    }
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

  // public/js/services/api.js
  var IS_LOCAL = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  var _proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  var _cache = /* @__PURE__ */ new Map();
  function _cacheGet(key) {
    const e = _cache.get(key);
    if (!e || Date.now() > e.exp) {
      _cache.delete(key);
      return null;
    }
    return e.v;
  }
  function _cacheSet(key, value, ms) {
    _cache.set(key, { v: value, exp: Date.now() + ms });
  }
  var TTL = { QUOTE: 36e5, HISTORY: 36e5, SEARCH: 3e5 };
  var STOOQ = "https://stooq.com";
  function _toStooq(symbol) {
    return (symbol.includes(".") ? symbol : symbol + ".US").toLowerCase();
  }
  function _stooqDate(iso) {
    return iso.replace(/-/g, "");
  }
  function _today() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function _daysAgo(n) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function _parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2)
      return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((l) => {
      const vals = l.split(",");
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? ""]));
    }).filter((r) => r.Date && r.Close && !isNaN(parseFloat(r.Close)));
  }
  function _currency(stooqSym) {
    const ext = stooqSym.split(".").pop();
    return { us: "USD", de: "EUR", l: "USD", wa: "PLN" }[ext] ?? "USD";
  }
  function _exchange(stooqSym) {
    const ext = stooqSym.split(".").pop();
    return { us: "NASDAQ/NYSE", de: "XETRA", l: "LSE", wa: "GPW" }[ext] ?? ext.toUpperCase();
  }
  async function _stooqCSV(stooqSym, d1iso, d2iso) {
    const url = `${STOOQ}/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${_stooqDate(d1iso)}&d2=${_stooqDate(d2iso)}&i=d`;
    const res = await fetch(_proxy(url));
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    return _parseCSV(await res.text());
  }
  var KNOWN = [
    { symbol: "VWCE.DE", name: "Vanguard FTSE All-World UCITS ETF", type: "ETF", exchange: "XETRA" },
    { symbol: "BETASPTH.WA", name: "Beta ETF S&P 500 PLN-Hedged", type: "ETF", exchange: "GPW" },
    { symbol: "BETANASH.WA", name: "Beta ETF NASDAQ-100 PLN-Hedged", type: "ETF", exchange: "GPW" },
    { symbol: "CSPX.L", name: "iShares Core S&P 500 UCITS ETF (USD)", type: "ETF", exchange: "LSE" },
    { symbol: "EQQQ.L", name: "Invesco EQQQ NASDAQ-100 UCITS ETF", type: "ETF", exchange: "LSE" },
    { symbol: "VUSA.L", name: "Vanguard S&P 500 UCITS ETF", type: "ETF", exchange: "LSE" },
    { symbol: "IWDA.L", name: "iShares Core MSCI World UCITS ETF", type: "ETF", exchange: "LSE" },
    { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "ETF", exchange: "NYSE" },
    { symbol: "QQQ", name: "Invesco QQQ Trust (NASDAQ-100)", type: "ETF", exchange: "NASDAQ" },
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "ETF", exchange: "NYSE" },
    { symbol: "GLD", name: "SPDR Gold Shares", type: "ETF", exchange: "NYSE" },
    { symbol: "AAPL", name: "Apple Inc.", type: "Equity", exchange: "NASDAQ" },
    { symbol: "MSFT", name: "Microsoft Corporation", type: "Equity", exchange: "NASDAQ" },
    { symbol: "NVDA", name: "NVIDIA Corporation", type: "Equity", exchange: "NASDAQ" },
    { symbol: "TSLA", name: "Tesla Inc.", type: "Equity", exchange: "NASDAQ" }
  ];
  var api = {
    getQuote(symbol) {
      if (IS_LOCAL)
        return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
      return _stooqQuote(symbol);
    },
    getHistory(symbol, start, end) {
      if (IS_LOCAL)
        return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
      return _stooqHistory(symbol, start, end);
    },
    search(q) {
      if (IS_LOCAL)
        return _backendGet("/search", { q });
      return _localSearch(q);
    }
  };
  async function _backendGet(path, params = {}) {
    const url = new URL(CONFIG.API_BASE + path, window.location.origin);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }
  async function _stooqQuote(symbol) {
    const ck = `quote:${symbol}`;
    const cached = _cacheGet(ck);
    if (cached)
      return cached;
    const stooqSym = _toStooq(symbol);
    const rows = await _stooqCSV(stooqSym, _daysAgo(14), _today());
    if (rows.length === 0)
      throw new Error(`Brak danych dla ${symbol}`);
    const last = rows[rows.length - 1];
    const prev = rows.length >= 2 ? rows[rows.length - 2] : last;
    const price = parseFloat(last.Close);
    const prevCl = parseFloat(prev.Close);
    const change = price - prevCl;
    const data = {
      symbol,
      shortName: symbol,
      currency: _currency(stooqSym),
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: prevCl ? change / prevCl * 100 : 0,
      regularMarketPreviousClose: prevCl,
      quoteType: "ETF",
      exchangeName: _exchange(stooqSym),
      marketState: "REGULAR"
    };
    _cacheSet(ck, data, TTL.QUOTE);
    return data;
  }
  async function _stooqHistory(symbol, start, end) {
    const ck = `history:${symbol}:${start}:${end}`;
    const cached = _cacheGet(ck);
    if (cached)
      return cached;
    const rows = await _stooqCSV(_toStooq(symbol), start, end);
    if (rows.length < 2)
      throw new Error(`Brak danych historycznych dla ${symbol}`);
    const data = { data: rows.map((r) => ({ date: r.Date, close: parseFloat(r.Close) })) };
    _cacheSet(ck, data, TTL.HISTORY);
    return data;
  }
  function _localSearch(q) {
    const lq = q.toLowerCase().trim();
    let results = KNOWN.filter(
      (e) => e.symbol.toLowerCase().includes(lq) || e.name.toLowerCase().includes(lq)
    );
    if (results.length === 0) {
      results = [{ symbol: q.toUpperCase(), name: q.toUpperCase(), type: "Equity", exchange: "?" }];
    }
    return Promise.resolve({ results });
  }

  // public/js/utils/format.js
  var USD_FMT = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  function formatCurrency(value, currency = "USD") {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      return USD_FMT.format(value);
    }
  }
  function formatPercent(value, decimals = 2) {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
  }
  function changeClass(value) {
    if (value > 0)
      return "positive";
    if (value < 0)
      return "negative";
    return "neutral";
  }

  // public/js/utils/toast.js
  var _timeout = null;
  var DURATION_MS = 3500;
  function showToast(message, type = "info") {
    const el = document.getElementById("toast");
    if (!el)
      return;
    clearTimeout(_timeout);
    el.textContent = message;
    el.className = `toast ${type}`;
    _timeout = setTimeout(() => {
      el.classList.add("hidden");
    }, DURATION_MS);
  }

  // public/js/components/watchlist.js
  var _quoteCache = /* @__PURE__ */ new Map();
  function renderWatchlist() {
    _renderGrid();
    _syncSimulatorTickers();
  }
  async function refreshCard(symbol) {
    const card = document.querySelector(`.watchlist-card[data-symbol="${symbol}"]`);
    if (!card)
      return;
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
  async function refreshAll() {
    await Promise.allSettled(state.watchlist.map((sym) => refreshCard(sym)));
  }
  function _renderGrid() {
    const grid = document.getElementById("watchlist-grid");
    if (state.watchlist.length === 0) {
      grid.innerHTML = '<div class="empty-state">Twoja lista obserwowanych jest pusta. U\u017Cyj wyszukiwarki lub przycisk\xF3w szybkiego dodawania powy\u017Cej.</div>';
      return;
    }
    grid.innerHTML = state.watchlist.map(_buildCardHTML).join("");
    grid.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sym = btn.dataset.symbol;
        state.removeTicker(sym);
        renderWatchlist();
        showToast(`Usuni\u0119to ${sym} z listy obserwowanych`, "info");
      });
    });
    state.watchlist.forEach((sym) => refreshCard(sym));
  }
  function _buildCardHTML(symbol) {
    return `
    <div class="watchlist-card" data-symbol="${symbol}">
      <div class="card-header">
        <span class="card-symbol">${symbol}</span>
        <button class="remove-btn" data-symbol="${symbol}" title="Usu\u0144 ${symbol}" aria-label="Usu\u0144 ${symbol}">\xD7</button>
      </div>
      <div class="card-name">\u2014</div>
      <div class="card-price">\u2014</div>
      <div class="card-change neutral">\u2014</div>
      <div class="card-exchange"></div>
      <div class="card-loading hidden"><div class="spinner"></div></div>
    </div>
  `;
  }
  function _populateCard(card, data) {
    const cls = changeClass(data.regularMarketChange);
    card.querySelector(".card-name").textContent = data.shortName || data.symbol;
    card.querySelector(".card-price").textContent = formatCurrency(data.regularMarketPrice, data.currency);
    const changeEl = card.querySelector(".card-change");
    changeEl.className = `card-change ${cls}`;
    changeEl.textContent = `${formatCurrency(data.regularMarketChange, data.currency)}  (${formatPercent(data.regularMarketChangePercent)})`;
    const exchangeEl = card.querySelector(".card-exchange");
    const parts = [data.quoteType, data.exchangeName].filter(Boolean);
    exchangeEl.textContent = parts.join(" \xB7 ");
  }
  function _setCardLoading(card, loading) {
    card.querySelector(".card-loading").classList.toggle("hidden", !loading);
  }
  function _setCardError(card, message) {
    card.querySelector(".card-name").textContent = "B\u0142\u0105d \u0142adowania";
    card.querySelector(".card-price").textContent = "\u2014";
    const el = card.querySelector(".card-change");
    el.className = "card-change negative";
    el.textContent = message;
  }
  function _syncSimulatorTickers() {
    const container = document.getElementById("sim-tickers");
    if (!container)
      return;
    if (state.watchlist.length === 0) {
      container.innerHTML = '<span class="muted-hint">Najpierw dodaj instrumenty do listy obserwowanych.</span>';
      return;
    }
    const checked = new Set(
      [...container.querySelectorAll("input:checked")].map((i) => i.value)
    );
    container.innerHTML = state.watchlist.map((sym) => {
      const isChecked = checked.size === 0 ? true : checked.has(sym);
      return `
        <label class="ticker-cb-item">
          <input type="checkbox" value="${sym}" ${isChecked ? "checked" : ""} />
          ${sym}
        </label>
      `;
    }).join("");
  }

  // public/js/utils/date.js
  function todayISO() {
    const d = /* @__PURE__ */ new Date();
    return _toISO(d);
  }
  function yearsAgoISO(years) {
    const d = /* @__PURE__ */ new Date();
    d.setFullYear(d.getFullYear() - years);
    return _toISO(d);
  }
  function _toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // public/js/components/chart.js
  var _chart = null;
  function renderSimulationChart(canvasId, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas)
      return;
    if (_chart) {
      _chart.destroy();
      _chart = null;
    }
    const ctx = canvas.getContext("2d");
    _chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: datasets.map((ds, i) => {
          const color = ds.colorOverride ?? CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
          return {
            label: ds.label,
            data: ds.points.map((p) => ({ x: p.date, y: +p.value.toFixed(2) })),
            borderColor: color,
            backgroundColor: color + "18",
            borderWidth: ds.dashed ? 1.5 : 2,
            borderDash: ds.dashed ? [6, 4] : [],
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.1
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        animation: { duration: 400 },
        plugins: {
          legend: {
            labels: {
              color: "#8b949e",
              font: { size: 12 },
              boxWidth: 14
            }
          },
          tooltip: {
            backgroundColor: "#1c2128",
            borderColor: "#30363d",
            borderWidth: 1,
            titleColor: "#e6edf3",
            bodyColor: "#8b949e",
            callbacks: {
              label: (ctx2) => `  ${ctx2.dataset.label}: $${ctx2.parsed.y.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: {
            type: "time",
            time: { unit: "month", tooltipFormat: "MMM d, yyyy" },
            grid: { color: "#21262d" },
            ticks: { color: "#8b949e", maxTicksLimit: 10 }
          },
          y: {
            grid: { color: "#21262d" },
            ticks: {
              color: "#8b949e",
              callback: (val) => `$${Number(val).toLocaleString()}`
            }
          }
        }
      }
    });
  }

  // public/js/components/simulator.js
  function initSimulator() {
    const startInput = document.getElementById("sim-start");
    startInput.value = yearsAgoISO(1);
    startInput.max = todayISO();
    document.getElementById("run-simulation-btn").addEventListener("click", _runSimulation);
  }
  async function _runSimulation() {
    const amount = parseFloat(document.getElementById("sim-amount").value);
    const startDate = document.getElementById("sim-start").value;
    const tickers = _getSelectedTickers();
    if (!amount || amount <= 0) {
      showToast("Wprowad\u017A prawid\u0142ow\u0105 kwot\u0119 inwestycji pocz\u0105tkowej.", "error");
      return;
    }
    if (!startDate) {
      showToast("Wybierz dat\u0119 pocz\u0105tkow\u0105.", "error");
      return;
    }
    if (tickers.length === 0) {
      showToast("Wybierz co najmniej jeden instrument.", "error");
      return;
    }
    const btn = document.getElementById("run-simulation-btn");
    btn.disabled = true;
    btn.textContent = "\u0141aduj\u0119\u2026";
    try {
      const endDate = todayISO();
      const results = await Promise.all(
        tickers.map((sym) => _buildSimResult(sym, startDate, endDate, amount))
      );
      const valid = results.filter(Boolean);
      if (valid.length === 0) {
        showToast("Nie znaleziono danych dla wybranych instrument\xF3w i zakresu dat.", "error");
        return;
      }
      _displayResults(valid, amount, startDate);
    } catch (err) {
      showToast(`B\u0142\u0105d symulacji: ${err.message}`, "error");
      console.error(err);
    } finally {
      btn.disabled = false;
      btn.textContent = "Uruchom Symulacj\u0119";
    }
  }
  async function _buildSimResult(symbol, startDate, endDate, initialAmount) {
    try {
      const { data } = await api.getHistory(symbol, startDate, endDate);
      if (!data || data.length < 2)
        return null;
      const startPrice = data[0].close;
      const points = data.map((d) => ({
        date: d.date,
        value: initialAmount * (d.close / startPrice)
      }));
      const finalValue = points.at(-1).value;
      return {
        symbol,
        points,
        startDate: data[0].date,
        endDate: data.at(-1).date,
        startPrice,
        endPrice: data.at(-1).close,
        initialAmount,
        finalValue,
        gain: finalValue - initialAmount,
        gainPercent: (finalValue - initialAmount) / initialAmount * 100
      };
    } catch (err) {
      console.warn(`[Simulator] ${symbol}:`, err.message);
      return null;
    }
  }
  function _displayResults(results, initialAmount, startDate) {
    const resultsEl = document.getElementById("simulator-results");
    resultsEl.classList.remove("hidden");
    const cashPoints = _buildCashPoints(results, initialAmount);
    const datasets = [
      ...results.map((r, i) => ({
        label: r.symbol,
        points: r.points,
        colorOverride: CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length]
      })),
      {
        label: "Got\xF3wka (bez wzrostu)",
        points: cashPoints,
        dashed: true,
        colorOverride: CONFIG.CASH_LINE_COLOR
      }
    ];
    renderSimulationChart("sim-chart", datasets);
    _renderSummaryCards(results, initialAmount);
  }
  function _renderSummaryCards(results, initialAmount) {
    const container = document.getElementById("sim-summary");
    container.innerHTML = results.map((r, i) => {
      const color = CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
      const cls = changeClass(r.gain);
      const arrow = r.gain >= 0 ? "\u25B2" : "\u25BC";
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
    }).join("");
  }
  function _buildCashPoints(results, amount) {
    const base = results[0]?.points ?? [];
    return base.map((p) => ({ date: p.date, value: amount }));
  }
  function _getSelectedTickers() {
    return [...document.querySelectorAll('#sim-tickers input[type="checkbox"]:checked')].map((el) => el.value);
  }

  // public/js/app.js
  document.addEventListener("DOMContentLoaded", () => {
    initSimulator();
    renderWatchlist();
    _setupSearch();
    _setupRefreshButton();
    _startAutoRefresh();
    _updateLastUpdatedLabel();
    _setupQuickAdd();
  });
  function _setupSearch() {
    const input = document.getElementById("ticker-search");
    const dropdown = document.getElementById("search-results");
    let debounce = null;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      if (q.length < 1) {
        dropdown.classList.add("hidden");
        return;
      }
      debounce = setTimeout(() => _performSearch(q, dropdown), 300);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dropdown.classList.add("hidden");
        input.value = "";
      }
    });
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add("hidden");
      }
    });
  }
  async function _performSearch(query, dropdown) {
    dropdown.classList.remove("hidden");
    dropdown.innerHTML = '<div class="search-result-item"><span class="sr-name">Szukam\u2026</span></div>';
    try {
      const { results } = await api.search(query);
      if (!results.length) {
        dropdown.innerHTML = '<div class="search-result-item"><span class="sr-name">Brak wynik\xF3w.</span></div>';
        return;
      }
      dropdown.innerHTML = results.map(
        (r) => `
          <div class="search-result-item" data-symbol="${_esc(r.symbol)}">
            <span class="sr-symbol">${_esc(r.symbol)}</span>
            <span class="sr-name">${_esc(r.name)}</span>
            <span class="sr-type">${_esc(r.type ?? "")}</span>
          </div>`
      ).join("");
      dropdown.querySelectorAll(".search-result-item[data-symbol]").forEach((item) => {
        item.addEventListener("click", () => _addTicker(item.dataset.symbol, dropdown));
      });
    } catch (err) {
      dropdown.innerHTML = `<div class="search-result-item"><span class="sr-name negative">Error: ${_esc(err.message)}</span></div>`;
    }
  }
  function _addTicker(symbol, dropdown) {
    const input = document.getElementById("ticker-search");
    dropdown.classList.add("hidden");
    input.value = "";
    const added = state.addTicker(symbol);
    if (added) {
      renderWatchlist();
      showToast(`Dodano ${symbol} do listy obserwowanych`, "success");
    } else {
      showToast(`${symbol} jest ju\u017C na li\u015Bcie obserwowanych`, "info");
    }
  }
  function _setupQuickAdd() {
    document.querySelectorAll(".chip[data-symbol]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const sym = chip.dataset.symbol;
        const added = state.addTicker(sym);
        if (added) {
          renderWatchlist();
          showToast(`Dodano ${sym}`, "success");
        } else {
          showToast(`${sym} ju\u017C na li\u015Bcie obserwowanych`, "info");
        }
      });
    });
  }
  function _setupRefreshButton() {
    const btn = document.getElementById("refresh-btn");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Od\u015Bwie\u017Cam\u2026";
      await refreshAll();
      _updateLastUpdatedLabel();
      btn.disabled = false;
      btn.textContent = "Od\u015Bwie\u017C";
      showToast("Ceny zaktualizowane", "success");
    });
  }
  function _startAutoRefresh() {
    setInterval(async () => {
      await refreshAll();
      _updateLastUpdatedLabel();
    }, CONFIG.REFRESH_INTERVAL_MS);
  }
  function _updateLastUpdatedLabel() {
    const el = document.getElementById("last-updated");
    if (el)
      el.textContent = `Zaktualizowano: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`;
  }
  function _esc(str) {
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str ?? "")));
    return d.innerHTML;
  }
})();
