import { describe, expect, it } from 'vitest';
import httpFixture from './fixtures/globalping-http.json';
import pingFixture from './fixtures/globalping-ping.json';
import {
  assembleLocationResults,
  buildHttpRequest,
  parseHttpResult,
  type GpMeasurement,
} from '../server/providers/globalping';
import { getLocation } from '../server/locations';
import type { TestLocation } from '../shared/types';

const london = getLocation('london') as TestLocation;
const sydney = getLocation('sydney') as TestLocation;
const tokyo = getLocation('tokyo') as TestLocation;
const http = httpFixture as unknown as GpMeasurement;
// Probe re-use means the ping comes from the same London probe as the HTTP runs.
const ping = structuredClone(pingFixture) as unknown as GpMeasurement;
ping.results[0].probe = structuredClone(http.results[0].probe);

describe('buildHttpRequest', () => {
  it('targets the hostname with path, query and protocol', () => {
    const body = buildHttpRequest('https://shop.example.com/products?id=7', [london, sydney]);
    expect(body).toMatchObject({
      type: 'http',
      target: 'shop.example.com',
      limit: 2,
      measurementOptions: {
        protocol: 'HTTPS',
        request: { method: 'GET', path: '/products', query: 'id=7' },
      },
    });
    expect(body.locations).toEqual([
      { city: 'London', country: 'GB', limit: 1 },
      { city: 'Sydney', country: 'AU', limit: 1 },
    ]);
  });
  it('uses HTTP and an explicit port when given', () => {
    const body = buildHttpRequest('http://example.com:8080/', [london]);
    expect(body.measurementOptions).toMatchObject({ protocol: 'HTTP', port: 8080 });
  });
  it('re-uses probes from a previous measurement', () => {
    expect(buildHttpRequest('https://example.com/', [london], 'abc123').locations).toBe('abc123');
  });
});

describe('parseHttpResult', () => {
  it('normalises timings and computes TTFB from the start of the request', () => {
    const parsed = parseHttpResult(http.results[0].result);
    expect(parsed.run.statusCode).toBe(200);
    expect(parsed.run.timings).toEqual({ total: 513, dns: 491, tcp: 1, tls: 8, firstByte: 12, download: 1 });
    expect(parsed.run.ttfb).toBe(491 + 1 + 8 + 12);
    expect(parsed.run.cacheStatus).toBe('HIT');
    expect(parsed.tls?.protocol).toBe('TLSv1.3');
    expect(parsed.tls?.issuer).toContain('Cloudflare');
    expect(parsed.headers['server']).toBe('cloudflare');
  });
  it('reports failures', () => {
    const parsed = parseHttpResult({ status: 'failed', rawOutput: 'connect ETIMEDOUT' });
    expect(parsed.run.error).toMatch(/ETIMEDOUT/);
    expect(parsed.run.ttfb).toBeNull();
  });
});

describe('assembleLocationResults', () => {
  it('matches results to locations by probe city', () => {
    const results = assembleLocationResults([sydney, london, tokyo], http, http, ping);
    const byId = Object.fromEntries(results.map((r) => [r.locationId, r]));
    expect(byId.london.probe?.city).toBe('London');
    expect(byId.london.status).toBe('ok');
    expect(byId.london.rttMs).toBeCloseTo(1.56);
    expect(byId.sydney.probe?.city).toBe('Sydney');
    expect(byId.sydney.rttMs).toBeNull();
    expect(byId.tokyo.status).toBe('no-probe');
    expect(results.map((r) => r.locationId)).toEqual(['sydney', 'london', 'tokyo']);
  });
  it('marks non-2xx/3xx responses as http errors', () => {
    const broken = structuredClone(http);
    broken.results[0].result.statusCode = 503;
    const results = assembleLocationResults([london], broken, null, null);
    expect(results[0].status).toBe('http-error');
  });
});
