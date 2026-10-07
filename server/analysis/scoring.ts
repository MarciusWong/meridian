import { locationTtfb, metricStatus } from '../../shared/metrics';
import type { GlobalStats, LocationResult, RegionId, Scores, TestLocation } from '../../shared/types';

// Abramowitz & Stegun 7.1.26, accurate to ~1e-7 — plenty for scoring.
function erf(x: number): number {
  const sign = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

/**
 * Lighthouse's scoring curve: a complementary log-normal distribution where a
 * value of `p10` scores 0.9 and a value of `medianValue` scores 0.5.
 */
export function logNormalScore(value: number, p10: number, medianValue: number): number {
  if (value <= 0) return 1;
  const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232;
  const xLogRatio = Math.log(value / medianValue);
  const p10LogRatio = -Math.log(p10 / medianValue);
  const standardizedX = (xLogRatio * INVERSE_ERFC_ONE_FIFTH) / p10LogRatio;
  return Math.min(1, Math.max(0, (1 - erf(standardizedX)) / 2));
}

export { locationTtfb, metricStatus, THRESHOLDS } from '../../shared/metrics';

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function gradeFor(score: number): Scores['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  if (score >= 50) return 'E';
  return 'F';
}

// A TTFB of 200 ms scores 0.9, 600 ms scores 0.5 — stricter than the Web Vitals
// "good" bound so differences between regions stay visible.
const TTFB_P10 = 200;
const TTFB_MEDIAN = 600;

/** 0-100. Average per-location TTFB score; locations that failed count as 0. */
export function globalDeliveryScore(results: LocationResult[]): number | null {
  const measured = results.filter((r) => r.status !== 'no-probe');
  if (measured.length === 0) return null;
  const total = measured.reduce((sum, r) => {
    const ttfb = locationTtfb(r);
    return sum + (ttfb === null || r.status === 'http-error' ? 0 : logNormalScore(ttfb, TTFB_P10, TTFB_MEDIAN));
  }, 0);
  return Math.round((total / measured.length) * 100);
}

export function computeGlobalStats(locations: TestLocation[], results: LocationResult[]): GlobalStats {
  const regionOf = new Map(locations.map((l) => [l.id, l.region]));
  const measured = results
    .map((r) => ({ id: r.locationId, ttfb: locationTtfb(r) }))
    .filter((m): m is { id: string; ttfb: number } => m.ttfb !== null);
  const sorted = [...measured].sort((a, b) => a.ttfb - b.ttfb);
  const ttfbs = measured.map((m) => m.ttfb);

  const regionIds = [...new Set(locations.map((l) => l.region))];
  const regions = regionIds.map((region: RegionId) => {
    const values = measured.filter((m) => regionOf.get(m.id) === region).map((m) => m.ttfb);
    const med = median(values);
    return { region, medianTtfb: med, status: med === null ? null : metricStatus('ttfb', med) };
  });

  return {
    medianTtfb: median(ttfbs),
    p90Ttfb: percentile(ttfbs, 90),
    fastest: sorted.length ? { locationId: sorted[0].id, ttfb: sorted[0].ttfb } : null,
    slowest: sorted.length ? { locationId: sorted[sorted.length - 1].id, ttfb: sorted[sorted.length - 1].ttfb } : null,
    locationsTested: results.filter((r) => r.status !== 'no-probe').length,
    locationsFailed: results.filter((r) => r.status === 'failed' || r.status === 'http-error').length,
    regions,
  };
}

const WEIGHTS = { performanceMobile: 0.45, performanceDesktop: 0.2, globalDelivery: 0.35 } as const;

export function computeScores(parts: Pick<Scores, 'performanceMobile' | 'performanceDesktop' | 'globalDelivery'>): Scores {
  let weighted = 0;
  let weightSum = 0;
  for (const key of Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>) {
    const value = parts[key];
    if (value === null) continue;
    weighted += value * WEIGHTS[key];
    weightSum += WEIGHTS[key];
  }
  const overall = weightSum === 0 ? 0 : Math.round(weighted / weightSum);
  return { ...parts, overall, grade: gradeFor(overall) };
}
