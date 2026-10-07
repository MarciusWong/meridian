import type { LocationResult, MetricStatus } from './types';

/** Core Web Vitals style thresholds: [good upper bound, needs-improvement upper bound]. */
export const THRESHOLDS: Record<string, [number, number]> = {
  lcp: [2500, 4000],
  fcp: [1800, 3000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
  tbt: [200, 600],
  si: [3400, 5800],
  tti: [3800, 7300],
};

export function metricStatus(id: string, value: number): MetricStatus {
  const [good, ni] = THRESHOLDS[id] ?? [Infinity, Infinity];
  if (value <= good) return 'good';
  if (value <= ni) return 'needs-improvement';
  return 'poor';
}

/**
 * The time-to-first-byte that represents a location: the warm (second) run
 * reflects steady state with CDN and DNS caches populated; the cold run is
 * used when the warm one is missing.
 */
export function locationTtfb(result: LocationResult): number | null {
  if (result.status === 'failed' || result.status === 'no-probe') return null;
  return result.warm?.ttfb ?? result.cold?.ttfb ?? null;
}
