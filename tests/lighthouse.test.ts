import { describe, expect, it } from 'vitest';
import lhrFixture from './fixtures/lhr-github-mobile.json';
import { normaliseFieldData, normaliseLighthouse, type RawLhr } from '../server/analysis/lighthouse';

const lhr = lhrFixture as unknown as RawLhr;

describe('normaliseLighthouse', () => {
  const summary = normaliseLighthouse(lhr, 'Lighthouse');

  it('reads metadata and category scores as 0-100', () => {
    expect(summary.formFactor).toBe('mobile');
    expect(summary.lighthouseVersion).toBe('13.5.0');
    expect(summary.finalUrl).toBe('https://github.com/');
    expect(summary.scores).toEqual({ performance: 44, accessibility: 100, bestPractices: 96, seo: 100 });
  });

  it('extracts the lab metrics', () => {
    const ids = summary.metrics.map((m) => m.id);
    expect(ids).toEqual(['fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb']);
    const lcp = summary.metrics.find((m) => m.id === 'lcp');
    expect(lcp?.value).toBeGreaterThan(13000);
    expect(lcp?.displayValue).toBe('13.5 s');
  });

  it('keeps only failing performance audits, excluding metrics', () => {
    const ids = summary.audits.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(['render-blocking-insight', 'unused-javascript', 'unused-css-rules', 'bootup-time']),
    );
    expect(ids).not.toContain('largest-contentful-paint');
    expect(ids).not.toContain('modern-http-insight');
    for (const audit of summary.audits) expect(audit.score === null || audit.score < 0.9).toBe(true);
  });

  it('captures savings and example items', () => {
    const unusedJs = summary.audits.find((a) => a.id === 'unused-javascript');
    expect(unusedJs?.savingsMs).toBe(4370);
    expect(unusedJs?.savingsBytes).toBe(916815);
    expect(unusedJs?.metricSavings).toMatchObject({ LCP: 4350 });
    expect(unusedJs?.items[0]).toContain('https://github.githubassets.com/');
    const renderBlocking = summary.audits.find((a) => a.id === 'render-blocking-insight');
    expect(renderBlocking?.savingsMs).toBe(950);
  });

  it('summarises resources and keeps the screenshot', () => {
    expect(summary.resourceSummary.find((r) => r.type === 'total')?.requestCount).toBe(160);
    expect(summary.screenshot).toMatch(/^data:image\/jpeg/);
  });

  it('strips markdown from audit titles', () => {
    const withCode = structuredClone(lhr);
    Object.assign(withCode.audits['unsized-images'], {
      score: 0,
      title: 'Image elements do not have explicit `width` and `height`',
    });
    const audit = normaliseLighthouse(withCode, 'Lighthouse').audits.find((a) => a.id === 'unsized-images');
    expect(audit?.title).toBe('Image elements do not have explicit width and height');
  });

  it('strips markdown links from descriptions', () => {
    for (const audit of summary.audits) expect(audit.description).not.toMatch(/\]\(http/);
  });
});

describe('normaliseFieldData', () => {
  const experience = {
    id: 'https://example.com/',
    overall_category: 'AVERAGE',
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2900, category: 'AVERAGE' },
      INTERACTION_TO_NEXT_PAINT: { percentile: 150, category: 'FAST' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: 'AVERAGE' },
      FIRST_CONTENTFUL_PAINT_MS: { percentile: 1500, category: 'FAST' },
      EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 2000, category: 'SLOW' },
    },
  };

  it('maps CrUX percentiles and categories', () => {
    const field = normaliseFieldData(experience, undefined);
    expect(field?.scope).toBe('url');
    expect(field?.overall).toBe('needs-improvement');
    expect(field?.metrics.find((m) => m.id === 'cls')?.p75).toBe(0.12);
    expect(field?.metrics.find((m) => m.id === 'ttfb')?.status).toBe('poor');
    expect(field?.metrics.map((m) => m.id)).toEqual(['lcp', 'inp', 'cls', 'fcp', 'ttfb']);
  });

  it('falls back to origin data, then null', () => {
    expect(normaliseFieldData({ metrics: {} }, experience)?.scope).toBe('origin');
    expect(normaliseFieldData(undefined, undefined)).toBeNull();
  });
});
