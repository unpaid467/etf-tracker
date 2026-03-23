import { CONFIG } from '../config.js';

//  Environment detection 

const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);

//  CORS proxy 

const _proxy = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

//  In-browser cache 

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

//  Stooq helpers 

const STOOQ = 'https://stooq.com';

function _toStooq(symbol) {
  return (symbol.includes('.') ? symbol : symbol + '.US').toLowerCase();
}

function _stooqDate(iso) {
  return iso.replace(/-/g, '');
}

function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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

function _currency(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'USD', de: 'EUR', l: 'USD', wa: 'PLN' }[ext] ?? 'USD';
}

function _exchange(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'NASDAQ/NYSE', de: 'XETRA', l: 'LSE', wa: 'GPW' }[ext] ?? ext.toUpperCase();
}

async function _stooqCSV(stooqSym, d1iso, d2iso) {
  const url = `${STOOQ}/q/d/l/?s=${encodeURIComponent(stooqSym)}&d1=${_stooqDate(d1iso)}&d2=${_stooqDate(d2iso)}&i=d`;
  const res = await fetch(_proxy(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return _parseCSV(await res.text());
}

//  Built-in search dictionary 

const KNOWN = [
  { symbol: 'VWCE.DE',     name: 'Vanguard FTSE All-World UCITS ETF',            type: 'ETF',    exchange: 'XETRA'  },
  { symbol: 'BETASPTH.WA', name: 'Beta ETF S&P 500 PLN-Hedged',                  type: 'ETF',    exchange: 'GPW'    },
  { symbol: 'BETANASH.WA', name: 'Beta ETF NASDAQ-100 PLN-Hedged',               type: 'ETF',    exchange: 'GPW'    },
  { symbol: 'CSPX.L',      name: 'iShares Core S&P 500 UCITS ETF (USD)',         type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'EQQQ.L',      name: 'Invesco EQQQ NASDAQ-100 UCITS ETF',            type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'VUSA.L',      name: 'Vanguard S&P 500 UCITS ETF',                   type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'IWDA.L',      name: 'iShares Core MSCI World UCITS ETF',            type: 'ETF',    exchange: 'LSE'    },
  { symbol: 'SPY',         name: 'SPDR S&P 500 ETF Trust',                       type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'QQQ',         name: 'Invesco QQQ Trust (NASDAQ-100)',                type: 'ETF',    exchange: 'NASDAQ' },
  { symbol: 'VTI',         name: 'Vanguard Total Stock Market ETF',               type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'GLD',         name: 'SPDR Gold Shares',                              type: 'ETF',    exchange: 'NYSE'   },
  { symbol: 'AAPL',        name: 'Apple Inc.',                                    type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'MSFT',        name: 'Microsoft Corporation',                         type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'NVDA',        name: 'NVIDIA Corporation',                            type: 'Equity', exchange: 'NASDAQ' },
  { symbol: 'TSLA',        name: 'Tesla Inc.',                                    type: 'Equity', exchange: 'NASDAQ' },
];

//  Public API 

export const api = {
  getQuote(symbol) {
    if (IS_LOCAL) return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
    return _stooqQuote(symbol);
  },

  getHistory(symbol, start, end) {
    if (IS_LOCAL) return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
    return _stooqHistory(symbol, start, end);
  },

  search(q) {
    if (IS_LOCAL) return _backendGet('/search', { q });
    return _localSearch(q);
  },
};

//  Backend calls (local dev only) 

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

//  Stooq quote 

async function _stooqQuote(symbol) {
  const ck = `quote:${symbol}`;
  const cached = _cacheGet(ck);
  if (cached) return cached;

  const stooqSym = _toStooq(symbol);
  const rows = await _stooqCSV(stooqSym, _daysAgo(14), _today());
  if (rows.length === 0) throw new Error(`Brak danych dla ${symbol}`);

  const last   = rows[rows.length - 1];
  const prev   = rows.length >= 2 ? rows[rows.length - 2] : last;
  const price  = parseFloat(last.Close);
  const prevCl = parseFloat(prev.Close);
  const change = price - prevCl;

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

//  Stooq history 

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

//  Local search 

function _localSearch(q) {
  const lq = q.toLowerCase().trim();
  let results = KNOWN.filter(
    (e) => e.symbol.toLowerCase().includes(lq) || e.name.toLowerCase().includes(lq)
  );
  if (results.length === 0) {
    results = [{ symbol: q.toUpperCase(), name: q.toUpperCase(), type: 'Equity', exchange: '?' }];
  }
  return Promise.resolve({ results });
}
