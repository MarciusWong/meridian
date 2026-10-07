import { describe, expect, it } from 'vitest';
import {
  computeGlobalStats,
  computeScores,
  globalDeliveryScore,
  gradeFor,
  logNormalScore,
  median,
  metricStatus,
  percentile,
} from '../server/analysis/scoring';
import type { LocationResult, TestLocation } from '../shared/types';

describe('logNormalScore', () => {
  it('scores 0.9 at p10 and 0.5 at the median', () => {
    expect(logNormalScore(200, 200, 600)).toBeCloseTo(0.9, 2);
    expect(logNormalScore(600, 200, 600)).toBeCloseTo(0.5, 2);
  });
  it('is monotonically decreasing', () => {
    const values = [50, 100, 300, 600, 1000, 3000].map((v) => logNormalScore(v, 200, 600));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });
  it('returns 1 for zero or negative values', () => {
    expect(logNormalScore(0, 200, 600)).toBe(1);
  });
});

describe('metricStatus', () => {
  it('uses Core Web Vitals thresholds', () => {
    expect(metricStatus('lcp', 2400)).toBe('good');
    expect(metricStatus('lcp', 2600)).toBe('needs-improvement');
    expect(metricStatus('lcp', 4100)).toBe('poor');
    expect(metricStatus('cls', 0.05)).toBe('good');
    expect(metricStatus('cls', 0.3)).toBe('poor');
    expect(metricStatus('ttfb', 800)).toBe('good');
    expect(metricStatus('ttfb', 1900)).toBe('poor');
    expect(metricStatus('inp', 250)).toBe('needs-improvement');
  });
});

describe('median / percentile', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('computes nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBe(90);
    expect(percentile([], 90)).toBeNull();
  });
});

describe('gradeFor', () => {
  it('maps scores to letter grades', () => {
    expect(gradeFor(95)).toBe('A');
    expect(gradeFor(85)).toBe('B');
    expect(gradeFor(72)).toBe('C');
    expect(gradeFor(61)).toBe('D');
    expect(gradeFor(55)).toBe('E');
    expect(gradeFor(10)).toBe('F');
  });
});

function loc(id: string, region: TestLocation['region']): TestLocation {
  return { id, city: id, country: 'GB', region, covers: '', lat: 0, lon: 0, defaultSelected: true };
}

function result(locationId: string, ttfb: number | null, status: LocationResult['status'] = 'ok'): LocationResult {
  const run = ttfb === null ? null : {
    statusCode: 200,
    timings: { total: ttfb + 10, dns: 5, tcp: 5, tls: 10, firstByte: ttfb - 20, download: 10 },
    ttfb,
    cacheStatus: null,
    resolvedAddress: '1.1.1.1',
    error: null,
  };
  return { locationId, probe: null, cold: run, warm: run, rttMs: 10, packetLoss: 0, tls: null, headers: {}, status, error: null };
}

describe('globalDeliveryScore', () => {
  it('is high when every location is fast', () => {
    expect(globalDeliveryScore([result('a', 80), result('b', 120)])).toBeGreaterThanOrEqual(90);
  });
  it('counts failed locations as zero', () => {
    const fast = globalDeliveryScore([result('a', 80), result('b', 80)]);
    const withFailure = globalDeliveryScore([result('a', 80), result('b', null, 'failed')]);
    expect(withFailure).toBeLessThan((fast ?? 0) / 2 + 5);
  });
  it('ignores locations without a probe', () => {
    expect(globalDeliveryScore([result('a', 80), result('b', null, 'no-probe')])).toBe(globalDeliveryScore([result('a', 80)]));
  });
  it('returns null when nothing was measured', () => {
    expect(globalDeliveryScore([])).toBeNull();
  });
});

describe('computeGlobalStats', () => {
  const locations = [loc('london', 'europe'), loc('frankfurt', 'europe'), loc('sydney', 'oceania'), loc('lagos', 'africa')];
  const results = [result('london', 100), result('frankfurt', 140), result('sydney', 900), result('lagos', null, 'failed')];

  it('finds fastest and slowest locations', () => {
    const stats = computeGlobalStats(locations, results);
    expect(stats.fastest).toEqual({ locationId: 'london', ttfb: 100 });
    expect(stats.slowest).toEqual({ locationId: 'sydney', ttfb: 900 });
    expect(stats.locationsTested).toBe(4);
    expect(stats.locationsFailed).toBe(1);
    expect(stats.medianTtfb).toBe(140);
  });
  it('summarises regions', () => {
    const stats = computeGlobalStats(locations, results);
    expect(stats.regions.find((r) => r.region === 'europe')).toEqual({ region: 'europe', medianTtfb: 120, status: 'good' });
    expect(stats.regions.find((r) => r.region === 'oceania')?.status).toBe('needs-improvement');
    expect(stats.regions.find((r) => r.region === 'africa')).toEqual({ region: 'africa', medianTtfb: null, status: null });
  });
});

describe('computeScores', () => {
  it('blends lab and delivery scores', () => {
    const scores = computeScores({ performanceMobile: 80, performanceDesktop: 100, globalDelivery: 60 });
    expect(scores.overall).toBe(Math.round(0.45 * 80 + 0.2 * 100 + 0.35 * 60));
    expect(scores.grade).toBe('C');
  });
  it('re-weights when parts are missing', () => {
    expect(computeScores({ performanceMobile: null, performanceDesktop: null, globalDelivery: 90 }).overall).toBe(90);
    expect(computeScores({ performanceMobile: 70, performanceDesktop: null, globalDelivery: null }).overall).toBe(70);
  });
  it('is zero with no data', () => {
    expect(computeScores({ performanceMobile: null, performanceDesktop: null, globalDelivery: null }).overall).toBe(0);
  });
});
