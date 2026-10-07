// Runs Lighthouse locally in headless Chromium. Used when PageSpeed Insights is
// unavailable (no key / rate-limited) or when LIGHTHOUSE_MODE=local.

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import type { FormFactor } from '../../shared/types';
import type { RawLhr } from '../analysis/lighthouse';

// Lighthouse drives a whole browser; running two at once skews both results.
let queue: Promise<unknown> = Promise.resolve();

function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function runLocalLighthouse(
  url: string,
  formFactor: FormFactor,
  chromePath: string,
  onStart: () => void = () => {},
): Promise<RawLhr> {
  return serialised(async () => {
    onStart();
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
        },
        formFactor === 'desktop' ? desktopConfig : undefined,
      );
      if (!result?.lhr) throw new Error('Lighthouse returned no result.');
      if (result.lhr.runtimeError) throw new Error(`Lighthouse: ${result.lhr.runtimeError.message}`);
      return result.lhr as unknown as RawLhr;
    } finally {
      await chrome.kill();
    }
  });
}
