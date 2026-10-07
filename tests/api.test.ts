import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { RateLimiter } from '../server/security/rateLimit';
import { JobManager, type Providers } from '../server/jobs';
import { ReportStore } from '../server/storage';
import type { LighthouseSummary, LocationResult, PageInspection, Report } from '../shared/types';

const inspection: PageInspection = {
  requestedUrl: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  redirects: [],
  ttfbMs: 50,
  totalMs: 60,
  headers: {},
  compression: null,
  supportsBrotli: false,
  httpVersion: 'h2',
  supportsHttp3: true,
  cdn: null,
  server: 'nginx',
  cacheControl: null,
  hsts: true,
  html: {
    bytes: 20_000,
    title: 'Example',
    hasViewport: true,
    renderBlockingScripts: [],
    stylesheets: 1,
    scripts: 1,
    inlineScriptBytes: 0,
    inlineStyleBytes: 0,
    images: 0,
    imagesWithoutDimensions: 0,
    imagesWithoutLazy: 0,
    legacyImageFormats: 0,
    thirdPartyOrigins: [],
    preconnectOrigins: [],
    preloads: 0,
    fontDisplaySwap: null,
    usesGoogleFonts: false,
  },
};

function lighthouse(formFactor: 'mobile' | 'desktop'): LighthouseSummary {
  return {
    formFactor,
    source: 'Lighthouse',
    lighthouseVersion: '13',
    fetchTime: '',
    finalUrl: 'https://example.com/',
    scores: { performance: formFactor === 'mobile' ? 70 : 95, accessibility: 90, bestPractices: 90, seo: 90 },
    metrics: [],
    audits: [],
    resourceSummary: [],
  };
}

function networkResult(id: string, ttfb: number): LocationResult {
  const run = {
    statusCode: 200,
    timings: { total: ttfb, dns: 5, tcp: 5, tls: 5, firstByte: ttfb - 15, download: 1 },
    ttfb,
    cacheStatus: null,
    resolvedAddress: null,
    error: null,
  };
  return {
    locationId: id,
    probe: null,
    cold: run,
    warm: run,
    rttMs: 5,
    packetLoss: 0,
    tls: null,
    headers: {},
    status: 'ok',
    error: null,
  };
}

const providers: Providers = {
  guard: async () => {},
  inspect: async () => inspection,
  network: async (_url, locations) => ({
    locations: locations.map((l, i) => networkResult(l.id, 100 + i * 400)),
    measurementIds: ['m1'],
  }),
  lighthouse: async (_url, formFactor) => ({ summary: lighthouse(formFactor), field: null, notes: [] }),
};

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'reports-'));
  const manager = new JobManager(providers, new ReportStore(dir), { maxConcurrentJobs: 2 });
  server = createApp(manager, { publicHistory: true, rateLimiter: new RateLimiter({ limit: 3, windowMs: 3_600_000 }) }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function waitForReport(id: string): Promise<Report> {
  for (let i = 0; i < 50; i++) {
    const report = (await (await fetch(`${base}/api/tests/${id}`)).json()) as Report;
    if (report.status !== 'running') return report;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('report did not finish');
}

describe('API', () => {
  it('serves configuration with locations and capabilities', async () => {
    const res = await fetch(`${base}/api/config`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.locations.length).toBeGreaterThan(20);
    expect(body.regions.length).toBe(7);
    expect(body.capabilities).toHaveProperty('lighthouseMode');
  });

  it('rejects invalid URLs with a helpful message', async () => {
    const res = await fetch(`${base}/api/tests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'ftp://x.com' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/http/);
  });

  it('runs a test end to end and stores the report', async () => {
    const res = await fetch(`${base}/api/tests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'example.com', locations: ['london', 'sydney', 'tokyo'] }),
    });
    expect(res.status).toBe(202);
    const { id } = await res.json();
    const report = await waitForReport(id);

    expect(report.status).toBe('complete');
    expect(report.url).toBe('https://example.com/');
    expect(report.locations.map((l) => l.id)).toEqual(['london', 'sydney', 'tokyo']);
    expect(report.steps.every((s) => s.status === 'done' || s.status === 'skipped')).toBe(true);
    expect(report.scores?.performanceMobile).toBe(70);
    expect(report.stats?.fastest?.locationId).toBe('london');
    expect(report.recommendations.some((r) => r.id === 'compression')).toBe(true);

    const list = await (await fetch(`${base}/api/tests`)).json();
    expect(list[0]).toMatchObject({ id, url: 'https://example.com/', status: 'complete' });
  });

  it('keeps going when a provider fails', async () => {
    const failing = new JobManager(
      {
        ...providers,
        network: async () => {
          throw new Error('probe network down');
        },
      },
      new ReportStore(dir),
      { maxConcurrentJobs: 2 },
    );
    const report = await failing.run(failing.create({ url: 'https://example.com' }, 'test').id);
    expect(report.status).toBe('complete');
    expect(report.steps.find((s) => s.id === 'network')?.status).toBe('failed');
    expect(report.errors.join(' ')).toMatch(/probe network down/);
    expect(report.scores?.globalDelivery).toBeNull();
  });

  it('explains when the page blocked the inspector', async () => {
    const blockedManager = new JobManager(
      { ...providers, inspect: async () => ({ ...inspection, status: 403, html: null }) },
      new ReportStore(dir),
      { maxConcurrentJobs: 2 },
    );
    const report = await blockedManager.run(blockedManager.create({ url: 'https://example.com' }, 'blocked').id);
    expect(report.errors.join(' ')).toMatch(/HTTP 403/);
    expect(report.recommendations.some((r) => r.id === 'compression')).toBe(false);
  });

  it('returns 404 for unknown reports', async () => {
    expect((await fetch(`${base}/api/tests/does-not-exist`)).status).toBe(404);
  });

  it('answers unknown API routes with JSON 404', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/json/);
  });

  it('reports health', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('sends security headers', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('rate-limits test creation per client and does not count rejected URLs', async () => {
    const post = (url: string) =>
      fetch(`${base}/api/tests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    // Earlier tests used 1 of the 3 allowed; invalid URLs are refunded.
    expect((await post('ftp://bad')).status).toBe(400);
    for (let i = 0; i < 2; i++) {
      const ok = await post('https://example.com');
      expect(ok.status).toBe(202);
      await waitForReport((await ok.json()).id);
    }
    const limited = await post('https://example.com');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await limited.json()).error).toMatch(/limit/i);
  });
});

describe('API without public history', () => {
  it("does not list other visitors' reports", async () => {
    const manager = new JobManager(providers, new ReportStore(dir), { maxConcurrentJobs: 1 });
    const private_ = createApp(manager, { publicHistory: false }).listen(0);
    await new Promise((r) => private_.once('listening', r));
    const address = private_.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}/api/tests`);
    expect(res.status).toBe(404);
    const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
    expect(config.capabilities.publicHistory).toBe(false);
    private_.close();
  });
});

describe('serving the built UI', () => {
  it('serves index.html for app routes and allows its inline script by hash', async () => {
    const site = mkdtempSync(path.join(tmpdir(), 'site-'));
    mkdirSync(path.join(site, 'assets'));
    const inline = "document.documentElement.dataset.x='1';";
    writeFileSync(
      path.join(site, 'index.html'),
      `<!doctype html><html><head><script>${inline}</script></head><body></body></html>`,
    );
    writeFileSync(path.join(site, 'robots.txt'), 'User-agent: *');
    const manager = new JobManager(providers, new ReportStore(dir), { maxConcurrentJobs: 1 });
    const app = createApp(manager, { staticDir: site }).listen(0);
    await new Promise((r) => app.once('listening', r));
    const address = app.address();
    const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    const page = await fetch(`${origin}/report/abc123`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<!doctype html>');
    const hash = createHash('sha256').update(inline).digest('base64');
    expect(page.headers.get('content-security-policy')).toContain(`script-src 'self' 'sha256-${hash}'`);

    expect(await (await fetch(`${origin}/robots.txt`)).text()).toContain('User-agent');
    expect((await fetch(`${origin}/assets/missing.js`)).status).toBe(404);
    app.close();
    rmSync(site, { recursive: true, force: true });
  });
});
