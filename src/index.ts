import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { fetchModels } from './models-cache.js';
import apiRouter from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, 'public');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.isDev ? '*' : false,
}));

app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

app.use('/api', apiRouter);

app.use(express.static(publicDir, {
  maxAge: config.isDev ? 0 : 86400000,
}));

app.get('*', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

async function start() {
  try {
    if (config.apiKey) {
      console.log('🔑 OpenRouter API key configured');
      await fetchModels();
    } else {
      console.warn('⚠  No API key set. Go to https://openrouter.ai/keys to get one.');
    }
  } catch {
    console.warn('⚠  Could not fetch models on startup. Will retry on first request.');
  }

  app.listen(config.port, () => {
    console.log(`\n  ⚡ CareerCraft AI  v2.0`);
    console.log(`  ───────────────────────`);
    console.log(`  🌐  http://localhost:${config.port}`);
    console.log(`  📦  ${config.apiKey ? 'API connected' : 'API key missing'}`);
    console.log();
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
