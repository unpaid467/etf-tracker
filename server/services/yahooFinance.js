/**
 * Market data client: tries Yahoo Finance first, falls back to Stooq.
 * Runs entirely server-side — no CORS restrictions.
 */

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

const YF_BASE = 'https://query1.finance.yahoo.com';

const YF_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com',
};

async function _yfGet(url) {
  const res = await fetch(url, { headers: YF_HEADERS });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
  return res.json();
}

async function _yfQuote(symbol) {
  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = await _yfGet(url);

  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No Yahoo Finance data for ${symbol}`);

  const { meta } = result;
  const price     = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose;
  const change    = price - prevClose;

  return {
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
}

async function _yfHistory(symbol, startDate, endDate) {
  const period1 = Math.floor(new Date(startDate).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);

  const url =
    `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const json   = await _yfGet(url);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No Yahoo Finance history for ${symbol}`);

  const timestamps = result.timestamp || [];
  const adjClose   = result.indicators?.adjclose?.[0]?.adjclose;
  const rawClose   = result.indicators?.quote?.[0]?.close;
  const prices     = adjClose ?? rawClose;

  return timestamps
    .map((ts, i) => ({
      date:  new Date(ts * 1000).toISOString().split('T')[0],
      close: prices?.[i] ?? null,
    }))
    .filter((d) => d.close !== null);
}

// ── Stooq fallback ────────────────────────────────────────────────────────────

const STOOQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function _toStooqSym(symbol) {
  return (symbol.includes('.') ? symbol : symbol + '.us').toLowerCase();
}

function _stooqDateStr(isoDate) {
  return isoDate.replace(/-/g, '');
}

function _isoDateDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function _todayIso() {
  return new Date().toISOString().split('T')[0];
}

function _inferCurrency(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'USD', de: 'EUR', l: 'GBP', wa: 'PLN' }[ext] ?? 'USD';
}

function _inferExchange(stooqSym) {
  const ext = stooqSym.split('.').pop();
  return { us: 'NASDAQ/NYSE', de: 'XETRA', l: 'LSE', wa: 'GPW' }[ext] ?? ext.toUpperCase();
}

function _parseStooqCSV(text) {
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

async function _stooqCSV(stooqSym, d1iso, d2iso) {
  const url =
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}` +
    `&d1=${_stooqDateStr(d1iso)}&d2=${_stooqDateStr(d2iso)}&i=d`;
  const res = await fetch(url, { headers: STOOQ_HEADERS });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);
  const rows = _parseStooqCSV(await res.text());
  if (rows.length === 0) throw new Error(`Stooq has no data for ${stooqSym}`);
  return rows;
}

async function _stooqQuote(symbol) {
  const stooqSym = _toStooqSym(symbol);
  const rows = await _stooqCSV(stooqSym, _isoDateDaysAgo(20), _todayIso());

  const last   = rows[rows.length - 1];
  const prev   = rows.length >= 2 ? rows[rows.length - 2] : last;
  const price  = parseFloat(last.Close);
  const prevCl = parseFloat(prev.Close);
  const change = price - prevCl;

  return {
    symbol,
    shortName:                  symbol,
    currency:                   _inferCurrency(stooqSym),
    regularMarketPrice:         price,
    regularMarketChange:        change,
    regularMarketChangePercent: prevCl ? (change / prevCl) * 100 : 0,
    regularMarketPreviousClose: prevCl,
    quoteType:                  'ETF',
    exchangeName:               _inferExchange(stooqSym),
    marketState:                'REGULAR',
  };
}

async function _stooqHistory(symbol, startDate, endDate) {
  const stooqSym = _toStooqSym(symbol);
  const rows = await _stooqCSV(stooqSym, startDate, endDate);
  return rows.map((r) => ({ date: r.Date, close: parseFloat(r.Close) }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getQuote(symbol) {
  try {
    return await _yfQuote(symbol);
  } catch (yfErr) {
    try {
      return await _stooqQuote(symbol);
    } catch (stooqErr) {
      throw new Error(`No data available for ${symbol} (Yahoo: ${yfErr.message}; Stooq: ${stooqErr.message})`);
    }
  }
}

export async function getHistory(symbol, startDate, endDate) {
  try {
    return await _yfHistory(symbol, startDate, endDate);
  } catch (yfErr) {
    try {
      return await _stooqHistory(symbol, startDate, endDate);
    } catch (stooqErr) {
      throw new Error(`No history for ${symbol} (Yahoo: ${yfErr.message}; Stooq: ${stooqErr.message})`);
    }
  }
}

export async function search(query) {
  const url =
    `${YF_BASE}/v1/finance/search` +
    `?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;

  try {
    const json = await _yfGet(url);
    return (json.quotes || []).map((q) => ({
      symbol:   q.symbol,
      name:     q.shortname || q.longname || q.symbol,
      type:     q.quoteType,
      exchange: q.exchDisp  || q.exchange,
    }));
  } catch {
    return [];
  }
}
