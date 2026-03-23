import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import marketRoutes from './routes/market.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

app.use('/api/market', marketRoutes);

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Export for Vercel serverless; only bind a port when running locally.
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Market Monitor running at http://localhost:${PORT}`);
  });
}

export default app;
