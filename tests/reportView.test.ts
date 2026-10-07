import { describe, expect, it } from 'vitest';
import { deliveryVerdict, recommendationsMarkdown } from '../src/lib/report';
import type { GlobalStats, RegionId, Report } from '../shared/types';

const labels = {
  'north-america': 'North America',
  'south-america': 'South America',
  europe: 'Europe',
  'middle-east': 'Middle East',
  africa: 'Africa',
  asia: 'Asia',
  oceania: 'Oceania',
} as Record<RegionId, string>;

function reportWith(regions: GlobalStats['regions'], failed = 0): Report {
  return {
    stats: { medianTtfb: 0, p90Ttfb: 0, fastest: null, slowest: null, locationsTested: 5, locationsFailed: failed, regions },
  } as unknown as Report;
}

const region = (r: RegionId, ms: number | null) => ({
  region: r,
  medianTtfb: ms,
  status: ms === null ? null : ms <= 800 ? ('good' as const) : ms <= 1800 ? ('needs-improvement' as const) : ('poor' as const),
});

describe('deliveryVerdict', () => {
  it('says so when every region is fast', () => {
    expect(deliveryVerdict(reportWith([region('europe', 90), region('asia', 120)]), labels)).toBe(
      'Fast first byte everywhere we tested.',
    );
  });
  it('separates fast, moderate and slow regions', () => {
    const verdict = deliveryVerdict(
      reportWith([region('north-america', 120), region('europe', 500), region('asia', 520), region('oceania', 1200)]),
      labels,
    );
    expect(verdict).toBe('Fast in North America; moderate in Europe and Asia; slow in Oceania.');
  });
  it('mentions failed locations', () => {
    expect(deliveryVerdict(reportWith([region('europe', 90)], 2), labels)).toBe(
      'Fast first byte everywhere we tested; 2 locations failed.',
    );
  });
  it('returns null without network data', () => {
    expect(deliveryVerdict({ stats: null } as unknown as Report, labels)).toBeNull();
  });
});

describe('recommendationsMarkdown', () => {
  it('renders a numbered checklist', () => {
    const md = recommendationsMarkdown({
      url: 'https://example.com/',
      createdAt: '2026-10-07T00:00:00Z',
      recommendations: [
        {
          id: 'x',
          title: 'Use a CDN',
          severity: 'high',
          category: 'Global delivery',
          summary: 'Far users are slow.',
          fixes: ['Add a CDN'],
          evidence: [],
          sources: [],
          priority: 1,
        },
      ],
    } as unknown as Report);
    expect(md).toContain('- [ ] **1. [HIGH] Use a CDN** (Global delivery)');
    expect(md).toContain('  - Add a CDN');
  });
});
