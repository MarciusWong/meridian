// Runs Lighthouse locally in headless Chromium. Used when PageSpeed Insights is
// unavailable (no key / rate-limited) or when LIGHTHOUSE_MODE=local.

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import type { FormFactor } from '../../shared/types';
import type { RawLhr } from '../analysis/lighthouse';
import { config } from '../config';
import { PRIVATE_URL_PATTERNS } from '../security/targetGuard';

// Lighthouse drives a whole browser; running two at once skews both results.
let queue: Promise<unknown> = Promise.resolve();

function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// Errors that describe the page itself; retrying won't help.
const PAGE_ERRORS = new Set([
  'FAILED_DOCUMENT_REQUEST',
  'ERRORED_DOCUMENT_REQUEST',
  'DNS_FAILURE',
  'NOT_HTML',
  'INSECURE_DOCUMENT_REQUEST',
  'CHROME_INTERSTITIAL_ERROR',
  'PAGE_HUNG',
]);

async function auditOnce(url: string, formFactor: FormFactor, chromePath: string): Promise<RawLhr> {
  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const result = await lighthouse(
      url,
      {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        maxWaitForLoad: 45_000,
        blockedUrlPatterns: config.allowPrivateTargets ? [] : PRIVATE_URL_PATTERNS,
      },
      formFactor === 'desktop' ? desktopConfig : undefined,
    );
    if (!result?.lhr) throw new Error('Lighthouse returned no result.');
    const runtimeError = result.lhr.runtimeError;
    if (runtimeError) throw Object.assign(new Error(`Lighthouse: ${runtimeError.message}`), { code: runtimeError.code });
    return result.lhr as unknown as RawLhr;
  } finally {
    await chrome.kill();
  }
}

export function runLocalLighthouse(
  url: string,
  formFactor: FormFactor,
  chromePath: string,
  onStart: () => void = () => {},
): Promise<RawLhr> {
  return serialised(async () => {
    onStart();
    try {
      return await auditOnce(url, formFactor, chromePath);
    } catch (error) {
      // Trace and protocol hiccups (e.g. NO_NAVSTART) are usually one-offs: retry once.
      if (PAGE_ERRORS.has((error as { code?: string }).code ?? '')) throw error;
      return auditOnce(url, formFactor, chromePath);
    }
  });
}
