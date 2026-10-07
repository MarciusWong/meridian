// Optional: real-browser page loads from WebPageTest test locations.
// Enabled only when WPT_API_KEY is set. Each selected city is matched to the
// WPT location whose label mentions that city; unmatched cities are skipped.

import type { TestLocation, WptLocationRun } from '../../shared/types';

const API = 'https://www.webpagetest.org';
const MAX_WPT_LOCATIONS = 6;

interface WptLocationInfo {
  Label?: string;
  labelShort?: string;
  location?: string;
  Browsers?: string;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Picks a WPT location id for each catalogue city that WPT has a location in. */
export function matchWptLocations(
  locations: TestLocation[],
  available: Record<string, WptLocationInfo>,
): Array<{ location: TestLocation; wptId: string }> {
  const entries = Object.entries(available);
  return locations
    .map((location) => {
      const hit = entries.find(([, info]) => fold(`${info.Label ?? ''} ${info.labelShort ?? ''}`).includes(fold(location.city)));
      return hit ? { location, wptId: hit[0] } : null;
    })
    .filter((m): m is { location: TestLocation; wptId: string } => m !== null)
    .slice(0, MAX_WPT_LOCATIONS);
}

async function getJson<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, { headers: { 'X-WPT-API-KEY': apiKey }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`WebPageTest HTTP ${res.status}`);
  return (await res.json()) as T;
}

type FirstView = Record<string, number | undefined>;

async function runOne(url: string, wptId: string, apiKey: string): Promise<{ view: FirstView; testUrl: string }> {
  const params = new URLSearchParams({ url, f: 'json', location: `${wptId}:Chrome.Cable`, runs: '1', fvonly: '1', k: apiKey });
  const started = await getJson<{ statusCode: number; statusText?: string; data?: { testId: string; userUrl: string } }>(
    `${API}/runtest.php?${params}`,
    apiKey,
  );
  if (started.statusCode !== 200 || !started.data) throw new Error(started.statusText ?? 'WebPageTest refused the test');
  const { testId, userUrl } = started.data;

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await getJson<{ statusCode: number }>(`${API}/testStatus.php?test=${testId}&f=json`, apiKey);
    if (status.statusCode >= 400) throw new Error('WebPageTest test failed');
    if (status.statusCode === 200) {
      const result = await getJson<{ data?: { median?: { firstView?: FirstView } } }>(
        `${API}/jsonResult.php?test=${testId}`,
        apiKey,
      );
      const view = result.data?.median?.firstView;
      if (!view) throw new Error('WebPageTest returned no first-view result');
      return { view, testUrl: userUrl };
    }
  }
  throw new Error('WebPageTest timed out');
}

export async function runWebPageTest(
  url: string,
  locations: TestLocation[],
  apiKey: string,
  onDetail: (d: string) => void,
): Promise<WptLocationRun[]> {
  const available = await getJson<{ data?: Record<string, WptLocationInfo> }>(`${API}/getLocations.php?f=json`, apiKey);
  const matched = matchWptLocations(locations, available.data ?? {});
  if (matched.length === 0) return [];
  onDetail(`Real-browser loads in ${matched.map((m) => m.location.city).join(', ')}`);

  return Promise.all(
    matched.map(async ({ location, wptId }): Promise<WptLocationRun> => {
      try {
        const { view, testUrl } = await runOne(url, wptId, apiKey);
        const n = (key: string) => (typeof view[key] === 'number' ? (view[key] as number) : null);
        return {
          locationId: location.id,
          wptLocation: wptId,
          ttfb: n('TTFB'),
          fcp: n('firstContentfulPaint'),
          lcp: n('chromeUserTiming.LargestContentfulPaint'),
          speedIndex: n('SpeedIndex'),
          fullyLoaded: n('fullyLoaded'),
          bytesIn: n('bytesIn'),
          testUrl,
          error: null,
        };
      } catch (error) {
        return {
          locationId: location.id,
          wptLocation: wptId,
          ttfb: null,
          fcp: null,
          lcp: null,
          speedIndex: null,
          fullyLoaded: null,
          bytesIn: null,
          testUrl: null,
          error: (error as Error).message,
        };
      }
    }),
  );
}
