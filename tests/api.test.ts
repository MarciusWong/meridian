import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { JobManager, type Providers } from '../server/jobs';
import { ReportStore } from '../server/storage';
import type { LighthouseSummary, LocationResult, PageInspection, Report } from '../shared/types';

const inspection: PageInspection = {
  requestedUrl: 'https://example.com/', finalUrl: 'https://example.com/', status: 200, redirects: [], ttfbMs: 50, totalMs: 60,
  headers: {}, compression: null, supportsBrotli: false, httpVersion: 'h2', supportsHttp3: true, cdn: null, server: 'nginx',
  cacheControl: null, hsts: true,
  html: {
    bytes: 20_000, title: 'Example', hasViewport: true, renderBlockingScripts: [], stylesheets: 1, scripts: 1, inlineScriptBytes: 0,
    inlineStyleBytes: 0, images: 0, imagesWithoutDimensions: 0, imagesWithoutLazy: 0, legacyImageFormats: 0, thirdPartyOrigins: [],
    preconnectOrigins: [], preloads: 0, fontDisplaySwap: null, usesGoogleFonts: false,
  },
};

function lighthouse(formFactor: 'mobile' | 'desktop'): LighthouseSummary {
  return {
    formFactor, source: 'Lighthouse', lighthouseVersion: '13', fetchTime: '', finalUrl: 'https://example.com/',
    scores: { performance: formFactor === 'mobile' ? 70 : 95, accessibility: 90, bestPractices: 90, seo: 90 },
    metrics: [], audits: [], resourceSummary: [],
  };
}

function networkResult(id: string, ttfb: number): LocationResult {
  const run = { statusCode: 200, timings: { total: ttfb, dns: 5, tcp: 5, tls: 5, firstByte: ttfb - 15, download: 1 }, ttfb, cacheStatus: null, resolvedAddress: null, error: null };
  return { locationId: id, probe: null, cold: run, warm: run, rttMs: 5, packetLoss: 0, tls: null, headers: {}, status: 'ok', error: null };
}

const providers: Providers = {
  guard: async () => {},
  inspect: async () => inspection,
  network: async (_url, locations) => ({ locations: locations.map((l, i) => networkResult(l.id, 100 + i * 400)), measurementIds: ['m1'] }),
  lighthouse: async (_url, formFactor) => ({ summary: lighthouse(formFactor), field: null, notes: [] }),
};

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'reports-'));
  const manager = new JobManager(providers, new ReportStore(dir), { maxConcurrentJobs: 2 });
  server = createApp(manager).listen(0);
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
    const res = await fetch(`${base}/api/tests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'ftp://x.com' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/http/);
  });

  it('runs a test end to end and stores the report', async () => {
    const res = await fetch(`${base}/api/tests`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
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
    const failing = new JobManager({ ...providers, network: async () => { throw new Error('probe network down'); } }, new ReportStore(dir), { maxConcurrentJobs: 2 });
    const report = await failing.run(failing.create({ url: 'https://example.com' }, 'test').id);
    expect(report.status).toBe('complete');
    expect(report.steps.find((s) => s.id === 'network')?.status).toBe('failed');
    expect(report.errors.join(' ')).toMatch(/probe network down/);
    expect(report.scores?.globalDelivery).toBeNull();
  });

  it('returns 404 for unknown reports', async () => {
    expect((await fetch(`${base}/api/tests/does-not-exist`)).status).toBe(404);
  });
});
