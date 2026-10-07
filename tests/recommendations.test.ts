import { describe, expect, it } from 'vitest';
import lhrFixture from './fixtures/lhr-github-mobile.json';
import { buildRecommendations, type AnalysisInput } from '../server/analysis/recommendations';
import { normaliseLighthouse, type RawLhr } from '../server/analysis/lighthouse';
import { getLocation } from '../server/locations';
import type { HtmlInsights, LocationResult, PageInspection, TestLocation } from '../shared/types';

const ids = ['london', 'frankfurt', 'new-york', 'sydney', 'singapore'];
const locations = ids.map((id) => getLocation(id) as TestLocation);

function net(
  locationId: string,
  ttfb: number,
  opts: Partial<{ dns: number; tls: number; rtt: number; cache: string | null; status: LocationResult['status']; error: string; tlsProtocol: string; expiresAt: string }> = {},
): LocationResult {
  const dns = opts.dns ?? 10;
  const tls = opts.tls ?? 20;
  const run = {
    statusCode: opts.status === 'http-error' ? 503 : 200,
    timings: { total: ttfb + 20, dns, tcp: 10, tls, firstByte: ttfb - dns - 10 - tls, download: 20 },
    ttfb,
    cacheStatus: opts.cache ?? null,
    resolvedAddress: '203.0.113.1',
    error: null,
  };
  const failed = opts.status === 'failed';
  return {
    locationId,
    probe: { city: locationId, country: 'GB', continent: 'EU', network: 'Test', asn: 1, lat: 0, lon: 0 },
    cold: failed ? { ...run, ttfb: null, error: opts.error ?? 'timeout' } : run,
    warm: failed ? null : run,
    rttMs: opts.rtt ?? 20,
    packetLoss: 0,
    tls: { protocol: opts.tlsProtocol ?? 'TLSv1.3', cipher: null, issuer: null, authorized: true, expiresAt: opts.expiresAt ?? '2099-01-01T00:00:00Z' },
    headers: {},
    status: opts.status ?? 'ok',
    error: failed ? opts.error ?? 'timeout' : null,
  };
}

const goodHtml: HtmlInsights = {
  bytes: 30_000, title: 'x', hasViewport: true, renderBlockingScripts: [], stylesheets: 1, scripts: 2, inlineScriptBytes: 0,
  inlineStyleBytes: 0, images: 2, imagesWithoutDimensions: 0, imagesWithoutLazy: 0, legacyImageFormats: 0,
  thirdPartyOrigins: [], preconnectOrigins: [], preloads: 1, fontDisplaySwap: true, usesGoogleFonts: false,
};

function inspection(overrides: Partial<PageInspection> = {}, html: Partial<HtmlInsights> = {}): PageInspection {
  return {
    requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 200, redirects: [], ttfbMs: 100, totalMs: 120,
    headers: {}, compression: 'br', supportsBrotli: true, httpVersion: 'h2', supportsHttp3: true, cdn: 'Cloudflare',
    server: 'cloudflare', cacheControl: 'public, max-age=60', hsts: true, html: { ...goodHtml, ...html }, ...overrides,
  };
}

function input(overrides: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    locations,
    network: ids.map((id) => net(id, 120, { cache: 'HIT' })),
    inspection: inspection(),
    mobile: null,
    desktop: null,
    field: null,
    now: new Date('2026-10-07T00:00:00Z'),
    ...overrides,
  };
}

const find = (recs: ReturnType<typeof buildRecommendations>, id: string) => recs.find((r) => r.id === id);

describe('buildRecommendations', () => {
  it('returns nothing for a fast, well-configured site', () => {
    expect(buildRecommendations(input())).toEqual([]);
  });

  it('flags unreachable locations as critical and ranks them first', () => {
    const network = ids.map((id) => net(id, 120, { cache: 'HIT' }));
    network[3] = net('sydney', 0, { status: 'failed', error: 'connect ETIMEDOUT' });
    const recs = buildRecommendations(input({ network, inspection: inspection({}, { bytes: 600_000 }) }));
    expect(recs[0].id).toBe('location-failures');
    expect(recs[0].severity).toBe('critical');
    expect(recs[0].locations).toEqual(['sydney']);
    expect(recs[0].evidence.join(' ')).toMatch(/Sydney.*ETIMEDOUT/);
  });

  it('flags very slow regions as critical and slow ones as high', () => {
    const network = [net('london', 150), net('frankfurt', 160), net('new-york', 900), net('sydney', 2100), net('singapore', 1900)];
    const recs = buildRecommendations(input({ network, inspection: inspection({ cdn: null }) }));
    const slow = find(recs, 'slow-ttfb');
    expect(slow?.severity).toBe('critical');
    expect(slow?.locations).toEqual(['sydney', 'singapore', 'new-york']);
  });

  it('recommends a CDN when there is none and far regions are much slower', () => {
    const network = [net('london', 90), net('frankfurt', 110), net('new-york', 450), net('sydney', 1100), net('singapore', 950)];
    const recs = buildRecommendations(input({ network, inspection: inspection({ cdn: null }) }));
    const cdn = find(recs, 'use-cdn');
    expect(cdn?.severity).toBe('high');
    expect(cdn?.category).toBe('Global delivery');
    expect(find(recs, 'edge-cache-html')).toBeUndefined();
  });

  it('does not recommend a CDN when probes see a caching layer the inspector could not name', () => {
    const network = [net('london', 90, { cache: 'HIT' }), net('frankfurt', 110, { cache: 'HIT' }), net('new-york', 450, { cache: 'MISS' }), net('sydney', 1100, { cache: 'MISS' }), net('singapore', 950, { cache: 'MISS' })];
    const recs = buildRecommendations(input({ network, inspection: inspection({ cdn: null }) }));
    expect(find(recs, 'use-cdn')).toBeUndefined();
    expect(find(recs, 'edge-cache-html')?.title).toMatch(/CDN edge/);
  });

  it('names the CDN from probe response headers when the inspector could not', () => {
    const network = ids.map((id) => ({ ...net(id, 400, { cache: 'DYNAMIC' }), headers: { 'cf-ray': 'abc-LHR' } }));
    const recs = buildRecommendations(input({ network, inspection: inspection({ cdn: null }) }));
    expect(find(recs, 'edge-cache-html')?.title).toContain('Cloudflare');
  });

  it('recommends edge caching when a CDN is present but HTML misses the cache', () => {
    const network = ids.map((id, i) => net(id, 300 + i * 150, { cache: 'DYNAMIC' }));
    const recs = buildRecommendations(input({ network }));
    expect(find(recs, 'edge-cache-html')).toBeDefined();
    expect(find(recs, 'use-cdn')).toBeUndefined();
  });

  it('flags slow DNS, slow TLS and old TLS versions', () => {
    const network = ids.map((id) => net(id, 400, { dns: 180, tls: 220, tlsProtocol: 'TLSv1.2', cache: 'HIT' }));
    const recs = buildRecommendations(input({ network }));
    expect(find(recs, 'slow-dns')?.severity).toBe('medium');
    expect(find(recs, 'slow-tls')).toBeDefined();
    expect(find(recs, 'old-tls')).toBeDefined();
  });

  it('flags certificates that expire soon', () => {
    const expiring = (date: string) => ids.map((id) => net(id, 120, { cache: 'HIT', expiresAt: date }));
    expect(find(buildRecommendations(input({ network: expiring('2026-10-12T00:00:00Z') })), 'certificate-expiry')?.severity).toBe('critical');
    expect(find(buildRecommendations(input({ network: expiring('2026-10-19T00:00:00Z') })), 'certificate-expiry')?.severity).toBe('high');
  });

  it('does not flag short-lived, auto-renewed certificates with weeks left', () => {
    const network = ids.map((id) => net(id, 120, { cache: 'HIT', expiresAt: '2026-11-02T00:00:00Z' }));
    expect(find(buildRecommendations(input({ network })), 'certificate-expiry')).toBeUndefined();
  });

  it('only reports meaningful packet loss', () => {
    const lossy = (loss: number) => ids.map((id, i) => ({ ...net(id, 120, { cache: 'HIT' }), packetLoss: i === 0 ? loss : 0 }));
    expect(find(buildRecommendations(input({ network: lossy(10) })), 'packet-loss')).toBeUndefined();
    expect(find(buildRecommendations(input({ network: lossy(30) })), 'packet-loss')?.locations).toEqual(['london']);
  });

  it('flags slow back-end processing even close to the server', () => {
    const network = ids.map((id) => net(id, 900, { rtt: 15, cache: 'MISS' }));
    expect(find(buildRecommendations(input({ network })), 'slow-backend')?.severity).toBe('high');
  });

  it('flags page-level transport problems', () => {
    const recs = buildRecommendations(
      input({
        inspection: inspection({
          compression: null, supportsBrotli: false, httpVersion: 'http/1.1', supportsHttp3: false, hsts: false,
          redirects: [{ url: 'http://example.com/', status: 301, timeMs: 80 }, { url: 'https://example.com/', status: 301, timeMs: 90 }],
        }),
      }),
    );
    expect(find(recs, 'compression')?.severity).toBe('high');
    expect(find(recs, 'http2')?.severity).toBe('high');
    expect(find(recs, 'http3')?.severity).toBe('low');
    expect(find(recs, 'redirects')?.severity).toBe('high');
    expect(find(recs, 'hsts')).toBeDefined();
    expect(find(recs, 'brotli')).toBeUndefined(); // no compression at all is reported instead
  });

  it('flags HTML problems', () => {
    const recs = buildRecommendations(
      input({
        inspection: inspection({}, {
          hasViewport: false, imagesWithoutDimensions: 4, legacyImageFormats: 5, fontDisplaySwap: false, bytes: 400_000,
          renderBlockingScripts: ['https://example.com/a.js', 'https://example.com/b.js'],
          thirdPartyOrigins: Array.from({ length: 12 }, (_, i) => `https://t${i}.com`),
        }),
      }),
    );
    expect(find(recs, 'viewport')?.severity).toBe('high');
    expect(find(recs, 'unsized-images')).toBeDefined();
    expect(find(recs, 'modern-images')).toBeDefined();
    expect(find(recs, 'font-display')).toBeDefined();
    expect(find(recs, 'large-html')?.severity).toBe('medium');
    expect(find(recs, 'render-blocking')?.evidence.join(' ')).toContain('a.js');
    expect(find(recs, 'third-parties')).toBeDefined();
  });

  describe('with Lighthouse audits', () => {
    const mobile = normaliseLighthouse(lhrFixture as unknown as RawLhr, 'Lighthouse');
    const recs = buildRecommendations(
      input({ mobile, inspection: inspection({}, { renderBlockingScripts: ['https://example.com/a.js'] }) }),
    );

    it('turns failing audits into ranked recommendations', () => {
      const unusedJs = find(recs, 'unused-javascript');
      expect(unusedJs?.severity).toBe('critical');
      expect(unusedJs?.category).toBe('JavaScript');
      expect(unusedJs?.impactMs).toBe(4370);
      expect(unusedJs?.fixes.length).toBeGreaterThan(1);
    });

    it('merges the same problem found by different tools', () => {
      const renderBlocking = recs.filter((r) => r.id === 'render-blocking');
      expect(renderBlocking).toHaveLength(1);
      expect(renderBlocking[0].sources.sort()).toEqual(['Lighthouse', 'Page inspector']);
      expect(renderBlocking[0].impactMs).toBe(950);
    });

    it('orders by severity, then by priority', () => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < recs.length; i++) {
        const a = recs[i - 1];
        const b = recs[i];
        expect(order[a.severity] < order[b.severity] || (a.severity === b.severity && a.priority >= b.priority)).toBe(true);
      }
    });
  });

  it('raises real-user (CrUX) problems', () => {
    const recs = buildRecommendations(
      input({
        field: {
          scope: 'origin', overall: 'poor',
          metrics: [
            { id: 'lcp', label: 'Largest Contentful Paint', p75: 4600, unit: 'ms', status: 'poor' },
            { id: 'cls', label: 'Cumulative Layout Shift', p75: 0.05, unit: 'unitless', status: 'good' },
          ],
        },
      }),
    );
    const lcp = find(recs, 'field-lcp');
    expect(lcp?.severity).toBe('critical');
    expect(find(recs, 'field-cls')).toBeUndefined();
  });
});
