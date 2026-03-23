import { CONFIG } from '../config.js';

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

//  Public API — always routes through the backend server 

export const api = {
  getQuote(symbol) {
    return _backendGet(`/quote/${encodeURIComponent(symbol)}`);
  },

  getHistory(symbol, start, end) {
    return _backendGet(`/history/${encodeURIComponent(symbol)}`, { start, end });
  },

  search(q) {
    return _backendSearch(q);
  },
};

//  Backend API calls 

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

//  Search: try backend, fall back to built-in dictionary 

async function _backendSearch(q) {
  try {
    const data = await _backendGet('/search', { q });
    if (data.results && data.results.length > 0) return data;
  } catch {
    // backend search unavailable — fall through to local dictionary
  }
  return _localSearch(q);
}

//  Local search fallback 

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
