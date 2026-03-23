import { CONFIG } from '../config.js';

// ── Environment detection ─────────────────────────────────────────────────────

const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// ── CORS proxy (wraps any URL with CORS headers) ──────────────────────────────

const _proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

// ── In-browser cache ──────────────────────────────────────────────────────────

const _cache = new Map();

function _cacheGet(key) {
  const e = _cache.get(key);
  if (!e || Date.now() > e.exp) { _cache.delete(key); return null; }
  return e.v;
}

function _cacheSet(key, value, ms) {
  _cache.set(key, { v: value, exp: Date.now() + ms });
}

const TTL = { QUOTE: 3_600_000, HISTORY: 3_600_000, SEARCH: 300_000 };

// ── Stooq helpers ─────────────────────────────────────────────────────────────

const STOOQ = 'https://stooq.com';

/**
 * Convert app symbol to Stooq format (lowercase, add .us for bare US tickers).
 * VWCE.DE → vwce.de   |   SPY → spy.us   |   BETASPTH.WA → betaspth.wa
 */
function _toStooq(symbol) {
  return (symbol.includes('.') ? symbol : symbol + '.US').toLowerCase();
}

/** YYYY-MM-DD → YYYYMMDD (Stooq date format) */
function _stooqDate(iso) {
  return iso.replace(/-/g, '');
}

/** Today as YYYY-MM-DD (local time) */
function _today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** N days ago as YYYY-MM-DD */
function _daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse Stooq daily CSV into array of {Date, Open, High, Low, Close, Volume}.
 * Returns [] when there is no data (symbol not found, market closed, etc.)
 */
function _parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines
    .slice(1)
    .map((l) => {
      const vals = l.split(',');
      return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']));
    })
    .filter((r) => r.Date && r.Close && !isNaN(parseFloat(r.Close)));
}

/** Guess currency from Stooq symbol suffix */
function _currency(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'USD', de: 'EUR', l: 'USD', wa: 'PLN' }[ext] ?? 'USD';
}

/** Human-readable exchange name from Stooq symbol suffix */
function _exchange(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'NASDAQ/NYSE', de: 'XETRA', l: 'LSE', wa: 'GPW' }[ext] ?? ext.toUpperCase();
}

/** Fetch Stooq daily CSV for a date range, via CORS proxy */
async function _stooqCSV(stooqSym, d1iso, d2iso) {
  const url = `${STOOQ}/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${_stooqDate(d1iso)}&d2=${_stooqDate(d2iso)}&i=d`;
  const res = await fetch(_proxy(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return _parseCSV(await res.text());
}

// ── Built-in ETF/stock search dictionary ─────────────────────────────────────

const KNOWN = [
  { symbol: 'VWCE.DE',     name: 'Vanguard FTSE All-World UCITS ETF',           type: 'ETF',    exchange: 'XETRA'  },
  { symbol: 'BETASPTH.WA', name: 'Beta ETF S&P 500 PLN-Hedged',                 type: 'ETF',    exchange: 'GPW'    },
  { symbol: 'BETANASH.WA', name: 'Beta ETF NASDAQ-100 PLN-Hedged',              type: 'ETF',    exchange: 'GPW'    },
  { symbol: 'CSPX.L',      name: 'iShares Core S&P 500 UCITS ETF (USD)',        type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'EQQQ.L',      name: 'Invesco EQQQ NASDAQ-100 UCITS ETF',           type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'VUSA.L',      name: 'Vanguard S&P 500 UCITS ETF',                  type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'IWDA.L',      name: 'iShares Core MSCI World UCITS ETF',           type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'EMIM.L',      name: 'iShares Core MSCI EM IMI UCITS ETF',          type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'AGGH.L',      name: 'iShares Core Global Aggregate Bond UCITS ETF',type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'SPY',         name: 'SPDR S&P 500 ETF Trust',                      type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'QQQ',         name: 'Invesco QQQ Trust (NASDAQ-100)',               type: 'ETF',    exchange: 'NASDAQ' },
  { symbol: 'VTI',         name: 'Vanguard Total Stock Market ETF',              type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'GLD',         name: 'SPDR Gold Shares',                             type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'BND',         name: 'Vanguard Total Bond Market ETF',               type: 'ETF',    exchange: 'NASDAQ' },
  { symbol: 'AAPL',        name: 'Apple Inc.',                                   type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'MSFT',        name: 'Microsoft Corporation',                        type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'AMZN',        name: 'Amazon.com Inc.',                              type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'GOOGL',       name: 'Alphabet Inc.',                                type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'NVDA',        name: 'NVIDIA Corporation',                           type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'TSLA',        name: 'Tesla Inc.',                                   type: 'Equity', exchange: 'NASDAQ' },
];

// ── Public API ────────────────────────────────────────────────────────────────

export const api = {
  /** Fetch current quote for a symbol. */
  getQuote(symbol) {
    if (IS_LOCAL) return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
    return _stooqQuote(symbol);
  },

  /** Fetch daily historical prices → { data: [{date, close}] } */
  getHistory(symbol, start, end) {
    if (IS_LOCAL) return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
    return _stooqHistory(symbol, start, end);
  },

  /** Search symbols by query → { results: [...] } */
  search(q) {
    if (IS_LOCAL) return _backendGet('/search', { q });
    return _localSearch(q);
  },
};

// ── Backend calls (local dev only) ───────────────────────────────────────────

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

// ── Stooq quote (fetch last 10 days → derive current + prev close) ────────────

async function _stooqQuote(symbol) {
  const ck = `quote:${symbol}`;
  const cached = _cacheGet(ck);
  if (cached) return cached;

  const stooqSym = _toStooq(symbol);
  const rows = await _stooqCSV(stooqSym, _daysAgo(14), _today());

  if (rows.length === 0) throw new Error(`Brak danych dla ${symbol}`);

  const last    = rows[rows.length - 1];
  const prev    = rows.length >= 2 ? rows[rows.length - 2] : last;
  const price   = parseFloat(last.Close);
  const prevCl  = parseFloat(prev.Close);
  const change  = price - prevCl;

  const data = {
    symbol,
    shortName:                  symbol,
    currency:                   _currency(stooqSym),
    regularMarketPrice:         price,
    regularMarketChange:        change,
    regularMarketChangePercent: prevCl ? (change / prevCl) * 100 : 0,
    regularMarketPreviousClose: prevCl,
    quoteType:                  'ETF',
    exchangeName:               _exchange(stooqSym),
    marketState:                'REGULAR',
  };

  _cacheSet(ck, data, TTL.QUOTE);
  return data;
}

// ── Stooq history ─────────────────────────────────────────────────────────────

async function _stooqHistory(symbol, start, end) {
  const ck = `history:${symbol}:${start}:${end}`;
  const cached = _cacheGet(ck);
  if (cached) return cached;

  const rows = await _stooqCSV(_toStooq(symbol), start, end);
  if (rows.length < 2) throw new Error(`Brak danych historycznych dla ${symbol}`);

  const data = { data: rows.map((r) => ({ date: r.Date, close: parseFloat(r.Close) })) };
  _cacheSet(ck, data, TTL.HISTORY);
  return data;
}

// ── Local search against built-in dictionary ──────────────────────────────────

function _localSearch(q) {
  const lq = q.toLowerCase().trim();
  let results = KNOWN.filter(
    (e) => e.symbol.toLowerCase().includes(lq) || e.name.toLowerCase().includes(lq)
  );
  // If no known match, let the user try the raw symbol they typed
  if (results.length === 0) {
    results = [{ symbol: q.toUpperCase(), name: q.toUpperCase(), type: 'Equity', exchange: '?' }];
  }
  return Promise.resolve({ results });
}


// ── Fetch strategy: direct first, then CORS proxies ──────────────────────────
// The v8/finance/chart endpoint sets Access-Control-Allow-Origin: * so a real
// browser fetch (with genuine UA) usually succeeds without a proxy.

const YF_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

const PROXY_WRAP = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
];

// ── Simple in-browser cache (mirrors server-side TTLs) ───────────────────────

const _cache = new Map();

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _cache.delete(key); return null; }
  return entry.value;
}

function _cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
}

const TTL = {
  QUOTE:   60 * 60 * 1000,
  HISTORY: 60 * 60 * 1000,
  SEARCH:   5 * 60 * 1000,
};

// ── Public API ────────────────────────────────────────────────────────────────

export const api = {
  getQuote(symbol) {
    if (IS_LOCAL) return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
    return _yfGetQuote(symbol);
  },

  getHistory(symbol, start, end) {
    if (IS_LOCAL) return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
    return _yfGetHistory(symbol, start, end);
  },

  search(q) {
    if (IS_LOCAL) return _backendGet('/search', { q });
    return _yfSearch(q);
  },
};

// ── Backend calls (local dev only) ───────────────────────────────────────────

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

// ── Yahoo Finance fetcher (tries direct, then proxies) ────────────────────────

async function _yfGet(path) {
  const candidates = [
    ...YF_HOSTS.map((h) => h + path),
    ...YF_HOSTS.flatMap((h) => PROXY_WRAP.map((wrap) => wrap(h + path))),
  ];

  let lastErr;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // Reject Yahoo error responses (e.g. Unauthorized, too many requests)
      if (json?.chart?.error?.code || json?.finance?.error?.code) {
        const code = json?.chart?.error?.code ?? json?.finance?.error?.code;
        throw new Error(code);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Wszystkie źródła danych niedostępne');
}

// ── Quote ─────────────────────────────────────────────────────────────────────

async function _yfGetQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const path   = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json   = await _yfGet(path);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Brak danych dla ${symbol}`);

  const { meta }  = result;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change    = price - prevClose;

  const data = {
    symbol:                     meta.symbol,
    shortName:                  meta.shortName || meta.longName || symbol,
    currency:                   meta.currency  || 'USD',
    regularMarketPrice:         price,
    regularMarketChange:        change,
    regularMarketChangePercent: prevClose ? (change / prevClose) * 100 : 0,
    regularMarketPreviousClose: prevClose,
    quoteType:                  meta.instrumentType,
    exchangeName:               meta.exchangeName,
    marketState:                meta.marketState,
  };

  _cacheSet(cacheKey, data, TTL.QUOTE);
  return data;
}

// ── History ───────────────────────────────────────────────────────────────────

async function _yfGetHistory(symbol, start, end) {
  const cacheKey = `history:${symbol}:${start}:${end}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const period1 = Math.floor(new Date(start).getTime() / 1000);
  const period2 = Math.floor(new Date(`${end}T23:59:59`).getTime() / 1000);
  const path    =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const json   = await _yfGet(path);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Brak danych historycznych dla ${symbol}`);

  const timestamps = result.timestamp || [];
  const adjClose   = result.indicators?.adjclose?.[0]?.adjclose;
  const rawClose   = result.indicators?.quote?.[0]?.close;
  const prices     = adjClose ?? rawClose;

  const data = {
    data: timestamps
      .map((ts, i) => ({
        date:  new Date(ts * 1000).toISOString().split('T')[0],
        close: prices?.[i] ?? null,
      }))
      .filter((d) => d.close !== null),
  };

  _cacheSet(cacheKey, data, TTL.HISTORY);
  return data;
}

// ── Search ────────────────────────────────────────────────────────────────────

async function _yfSearch(q) {
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const path =
    `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;
  const json = await _yfGet(path);

  const data = {
    results: (json.quotes || []).map((r) => ({
      symbol:   r.symbol,
      name:     r.shortname || r.longname || r.symbol,
      type:     r.quoteType,
      exchange: r.exchDisp  || r.exchange,
    })),
  };

  _cacheSet(cacheKey, data, TTL.SEARCH);
  return data;
}


// ── Simple in-browser cache (mirrors server-side TTLs) ───────────────────────

const _cache = new Map();

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _cache.delete(key); return null; }
  return entry.value;
}

function _cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
}

const TTL = {
  QUOTE:   60 * 60 * 1000,  // 1 hour
  HISTORY: 60 * 60 * 1000,  // 1 hour
  SEARCH:   5 * 60 * 1000,  // 5 minutes
};

// ── Public API ────────────────────────────────────────────────────────────────

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
    if (IS_LOCAL) return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
    return _yfGetQuote(symbol);
  },

  /**
   * Fetch daily historical prices.
   * @param {string} symbol
   * @param {string} start  YYYY-MM-DD
   * @param {string} end    YYYY-MM-DD
   * @returns {Promise<{data: Array<{date:string, close:number}>}>}
   */
  getHistory(symbol, start, end) {
    if (IS_LOCAL) return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
    return _yfGetHistory(symbol, start, end);
  },

  /**
   * Search for stocks and ETFs.
   * @param {string} q
   * @returns {Promise<{results: Array}>}
   */
  search(q) {
    if (IS_LOCAL) return _backendGet('/search', { q });
    return _yfSearch(q);
  },
};

// ── Backend calls (local dev only) ───────────────────────────────────────────

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

// ── Direct Yahoo Finance calls (static hosting / GitHub Pages) ───────────────

async function _yfGet(path) {
  const fullUrl = YF_BASE + path;
  let lastErr;
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(fullUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function _yfGetQuote(symbol) {
  const cacheKey = `quote:${symbol}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const path   = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json   = await _yfGet(path);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Brak danych dla ${symbol}`);

  const { meta }  = result;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  const change    = price - prevClose;

  const data = {
    symbol:                     meta.symbol,
    shortName:                  meta.shortName || meta.longName || symbol,
    currency:                   meta.currency  || 'USD',
    regularMarketPrice:         price,
    regularMarketChange:        change,
    regularMarketChangePercent: (change / prevClose) * 100,
    regularMarketPreviousClose: prevClose,
    quoteType:                  meta.instrumentType,
    exchangeName:               meta.exchangeName,
    marketState:                meta.marketState,
  };

  _cacheSet(cacheKey, data, TTL.QUOTE);
  return data;
}

async function _yfGetHistory(symbol, start, end) {
  const cacheKey = `history:${symbol}:${start}:${end}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const period1 = Math.floor(new Date(start).getTime() / 1000);
  const period2 = Math.floor(new Date(`${end}T23:59:59`).getTime() / 1000);
  const path    =
    `/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const json   = await _yfGet(path);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Brak danych historycznych dla ${symbol}`);

  const timestamps = result.timestamp || [];
  const adjClose   = result.indicators?.adjclose?.[0]?.adjclose;
  const rawClose   = result.indicators?.quote?.[0]?.close;
  const prices     = adjClose ?? rawClose;

  const data = {
    data: timestamps
      .map((ts, i) => ({
        date:  new Date(ts * 1000).toISOString().split('T')[0],
        close: prices?.[i] ?? null,
      }))
      .filter((d) => d.close !== null),
  };

  _cacheSet(cacheKey, data, TTL.HISTORY);
  return data;
}

async function _yfSearch(q) {
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached   = _cacheGet(cacheKey);
  if (cached) return cached;

  const path   =
    `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;
  const json   = await _yfGet(path);

  const data = {
    results: (json.quotes || []).map((r) => ({
      symbol:   r.symbol,
      name:     r.shortname || r.longname || r.symbol,
      type:     r.quoteType,
      exchange: r.exchDisp  || r.exchange,
    })),
  };

  _cacheSet(cacheKey, data, TTL.SEARCH);
  return data;
}

