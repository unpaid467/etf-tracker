import express from 'express';
import * as yf from '../services/yahooFinance.js';
import cache from '../services/cache.js';

const router = express.Router();

const TTL = {
  QUOTE: 60 * 60 * 1000,    // 1 hour
  HISTORY: 60 * 60 * 1000,  // 1 hour
  SEARCH: 5 * 60 * 1000,    // 5 minutes
};

// ── GET /api/market/quote/:symbol ────────────────────────────────────────────
router.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase().trim();
  const key = `quote:${symbol}`;

  const cached = cache.get(key);
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const data = await yf.getQuote(symbol);
    cache.set(key, data, TTL.QUOTE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `Could not fetch quote for ${symbol}`, details: err.message });
  }
});

// ── GET /api/market/history/:symbol?start=YYYY-MM-DD&end=YYYY-MM-DD ─────────
router.get('/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase().trim();
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'Query params "start" and "end" (YYYY-MM-DD) are required.' });
  }

  const key = `history:${symbol}:${start}:${end}`;
  const cached = cache.get(key);
  if (cached) return res.json({ data: cached, fromCache: true });

  try {
    const data = await yf.getHistory(symbol, start, end);
    cache.set(key, data, TTL.HISTORY);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: `Could not fetch history for ${symbol}`, details: err.message });
  }
});

// ── GET /api/market/search?q=query ──────────────────────────────────────────
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Query param "q" is required.' });

  const key = `search:${q.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return res.json({ results: cached, fromCache: true });

  try {
    const results = await yf.search(q);
    cache.set(key, results, TTL.SEARCH);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed.', details: err.message });
  }
});

export default router;
