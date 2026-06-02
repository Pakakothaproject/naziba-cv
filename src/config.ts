import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv(): void {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterBase: 'https://openrouter.ai/api/v1',
  cacheTtlMs: 5 * 60 * 1000,
  maxTokens: 8192,
  temperature: 0.7,
  isDev: process.env.NODE_ENV !== 'production',
} as const;

if (!config.apiKey) {
  console.warn('⚠  OPENROUTER_API_KEY not set. Set it in .env or environment variables.');
}
