import { CONFIG } from '../config.js';

// ── Environment detection ─────────────────────────────────────────────────────

/** True when running locally with the Express backend available. */
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);

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

