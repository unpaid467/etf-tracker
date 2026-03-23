/**
 * Yahoo Finance HTTP client using Node 18+ native fetch.
 * No extra dependencies required — works entirely server-side so there
 * are no CORS restrictions.
 */

const BASE = 'https://query1.finance.yahoo.com';

/** Realistic browser headers to avoid being rate-limited. */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://finance.yahoo.com/',
  Origin: 'https://finance.yahoo.com',
};

async function _get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Yahoo Finance returned HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

/**
 * Fetch current quote metadata for a symbol.
 * @param {string} symbol
 * @returns {Promise<object>}
 */
export async function getQuote(symbol) {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = await _get(url);

  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No quote data returned for ${symbol}`);

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

/**
 * Fetch daily adjusted-close prices for a date range.
 * @param {string} symbol
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<Array<{date: string, close: number}>>}
 */
export async function getHistory(symbol, startDate, endDate) {
  const period1 = Math.floor(new Date(startDate).getTime() / 1000);
  const period2 = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);

  const url =
    `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;

  const json   = await _get(url);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No historical data returned for ${symbol}`);

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

/**
 * Full-text search for stocks and ETFs.
 * @param {string} query
 * @returns {Promise<Array<{symbol, name, type, exchange}>>}
 */
export async function search(query) {
  const url =
    `${BASE}/v1/finance/search` +
    `?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;

  const json = await _get(url);

  return (json.quotes || []).map((q) => ({
    symbol:   q.symbol,
    name:     q.shortname || q.longname || q.symbol,
    type:     q.quoteType,
    exchange: q.exchDisp  || q.exchange,
  }));
}
