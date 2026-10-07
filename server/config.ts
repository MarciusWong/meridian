import { existsSync } from 'node:fs';
import type { ServerCapabilities } from '../shared/types';

function bool(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value ?? '');
}

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const mode = (process.env.LIGHTHOUSE_MODE ?? 'auto').toLowerCase();

export const config = {
  port: Number(process.env.PORT ?? 8787),
  psiApiKey: process.env.PSI_API_KEY || undefined,
  globalpingToken: process.env.GLOBALPING_TOKEN || undefined,
  wptApiKey: process.env.WPT_API_KEY || undefined,
  chromePath: findChrome(),
  lighthouseMode: (['auto', 'psi', 'local', 'off'].includes(mode) ? mode : 'auto') as ServerCapabilities['lighthouseMode'],
  allowPrivateTargets: bool(process.env.ALLOW_PRIVATE_TARGETS),
  dataDir: process.env.DATA_DIR ?? 'data/reports',
  /** Maximum tests running at once across all clients. */
  maxConcurrentJobs: Number(process.env.MAX_CONCURRENT_JOBS ?? 3),
};

export function capabilities(): ServerCapabilities {
  return {
    lighthouseMode: config.lighthouseMode,
    psiKey: Boolean(config.psiApiKey),
    globalpingToken: Boolean(config.globalpingToken),
    webpagetest: Boolean(config.wptApiKey),
    localChrome: Boolean(config.chromePath),
  };
}
