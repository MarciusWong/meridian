import { existsSync } from 'node:fs';
import { getChromePath } from 'chrome-launcher';
import type { ServerCapabilities } from '../shared/types';

// Load .env when present so `npm start` works without extra flags.
// Variables already set in the environment win.
if (existsSync('.env')) process.loadEnvFile('.env');

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Express "trust proxy" setting: true/false, a hop count, or a list of addresses/CIDRs. */
function trustProxy(value: string | undefined): boolean | number | string {
  if (!value) return 'loopback';
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

const CHROME_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome(): string | null {
  if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const known = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (known) return known;
  try {
    return getChromePath();
  } catch {
    return null;
  }
}

const mode = (process.env.LIGHTHOUSE_MODE ?? 'auto').toLowerCase();

export const config = {
  port: int(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',
  psiApiKey: process.env.PSI_API_KEY || undefined,
  globalpingToken: process.env.GLOBALPING_TOKEN || undefined,
  wptApiKey: process.env.WPT_API_KEY || undefined,
  chromePath: findChrome(),
  lighthouseMode: (['auto', 'psi', 'local', 'off'].includes(mode) ? mode : 'auto') as ServerCapabilities['lighthouseMode'],
  allowPrivateTargets: bool(process.env.ALLOW_PRIVATE_TARGETS),
  dataDir: process.env.DATA_DIR || 'data/reports',
  /** Maximum tests running at once across all clients. */
  maxConcurrentJobs: Math.max(1, int(process.env.MAX_CONCURRENT_JOBS, 3)),
  /** Tests each client may start per hour (0 = unlimited). */
  rateLimitPerHour: int(process.env.RATE_LIMIT_PER_HOUR, 10),
  /** Delete stored reports after this many days (0 = keep forever). */
  reportRetentionDays: int(process.env.REPORT_RETENTION_DAYS, 30),
  /** Share a list of recent reports with every visitor (off by default for privacy). */
  publicHistory: bool(process.env.PUBLIC_HISTORY),
  trustProxy: trustProxy(process.env.TRUST_PROXY),
};

export function capabilities(): ServerCapabilities {
  return {
    lighthouseMode: config.lighthouseMode,
    psiKey: Boolean(config.psiApiKey),
    globalpingToken: Boolean(config.globalpingToken),
    webpagetest: Boolean(config.wptApiKey),
    localChrome: Boolean(config.chromePath),
    publicHistory: config.publicHistory,
  };
}
