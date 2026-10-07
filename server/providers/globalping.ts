// Globalping (https://globalping.io) — free, open-source network of probes.
// We run three measurements per test, all from the same set of probes:
//   1. HTTP GET (cold)  2. HTTP GET again (warm)  3. ping (network RTT)

import type { HttpProbeRun, LocationResult, ProbeInfo, TestLocation, TlsInfo } from '../../shared/types';

const API = 'https://api.globalping.io/v1';

// ------------------------------------------------------------------ API shapes

export interface GpProbe {
  continent: string;
  country: string;
  city: string;
  asn?: number;
  network?: string;
  latitude: number;
  longitude: number;
}

/** The subset of a Globalping result object that we read. */
export interface GpRawResult {
  status: string;
  rawOutput?: string | null;
  statusCode?: number;
  resolvedAddress?: string | null;
  headers?: Record<string, string | string[]>;
  timings?: Record<string, number | null> | Array<{ rtt: number }>;
  tls?: {
    protocol?: string;
    cipherName?: string;
    authorized?: boolean;
    expiresAt?: string;
    issuer?: Record<string, string>;
  } | null;
  stats?: { avg?: number | null; loss?: number | null };
}

export interface GpMeasurement {
  id: string;
  type: string;
  status: string;
  results: Array<{ probe: GpProbe; result: GpRawResult }>;
}

export interface GpHttpRequest {
  type: 'http';
  target: string;
  locations: Array<{ city: string; country: string; limit: number }> | string;
  measurementOptions: {
    protocol: 'HTTP' | 'HTTPS';
    port?: number;
    request: { method: 'GET'; path: string; query?: string };
  };
}

// ------------------------------------------------------------------ pure helpers

export function buildHttpRequest(url: string, locations: TestLocation[], reuseMeasurementId?: string): GpHttpRequest {
  const parsed = new URL(url);
  const query = parsed.search.replace(/^\?/, '');
  return {
    type: 'http',
    target: parsed.hostname,
    locations: reuseMeasurementId ?? locations.map((l) => ({ city: l.city, country: l.country, limit: 1 })),
    measurementOptions: {
      protocol: parsed.protocol === 'http:' ? 'HTTP' : 'HTTPS',
      ...(parsed.port ? { port: Number(parsed.port) } : {}),
      request: { method: 'GET', path: parsed.pathname || '/', ...(query ? { query } : {}) },
    },
  };
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function flattenHeaders(headers: GpRawResult['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

const CACHE_HEADERS = ['cf-cache-status', 'x-cache', 'x-vercel-cache', 'x-nf-cache-status', 'cdn-cache', 'x-cache-status', 'x-proxy-cache'];

export function cacheStatusFrom(headers: Record<string, string>): string | null {
  for (const name of CACHE_HEADERS) {
    const value = headers[name];
    if (value) {
      const match = value.toUpperCase().match(/\b(HIT|MISS|EXPIRED|STALE|BYPASS|DYNAMIC|REVALIDATED|UPDATING|PASS)\b/);
      return match ? match[1] : value.toUpperCase();
    }
  }
  return null;
}

export function parseHttpResult(raw: GpRawResult): { run: HttpProbeRun; tls: TlsInfo | null; headers: Record<string, string> } {
  const headers = flattenHeaders(raw.headers);
  const t = (raw.timings && !Array.isArray(raw.timings) ? raw.timings : {}) as Record<string, number | null>;
  const timings = {
    total: num(t.total),
    dns: num(t.dns),
    tcp: num(t.tcp),
    tls: num(t.tls),
    firstByte: num(t.firstByte),
    download: num(t.download),
  };
  const ttfb = timings.firstByte === null ? null : (timings.dns ?? 0) + (timings.tcp ?? 0) + (timings.tls ?? 0) + timings.firstByte;
  const failed = raw.status !== 'finished';

  const run: HttpProbeRun = {
    statusCode: num(raw.statusCode),
    timings,
    ttfb: failed ? null : ttfb,
    cacheStatus: cacheStatusFrom(headers),
    resolvedAddress: raw.resolvedAddress ?? null,
    error: failed ? (raw.rawOutput?.trim() || `Probe reported "${raw.status}"`).slice(0, 300) : null,
  };

  const tls: TlsInfo | null = raw.tls
    ? {
        protocol: raw.tls.protocol ?? null,
        cipher: raw.tls.cipherName ?? null,
        authorized: raw.tls.authorized ?? null,
        expiresAt: raw.tls.expiresAt ?? null,
        issuer: raw.tls.issuer ? [raw.tls.issuer.O, raw.tls.issuer.CN].filter(Boolean).join(' — ') || null : null,
      }
    : null;

  return { run, tls, headers };
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function probeKey(p: GpProbe): string {
  return [p.country, p.city, p.asn, p.latitude, p.longitude].join('|');
}

function toProbeInfo(p: GpProbe): ProbeInfo {
  return {
    city: p.city,
    country: p.country,
    continent: p.continent,
    network: p.network ?? 'Unknown network',
    asn: p.asn ?? null,
    lat: p.latitude,
    lon: p.longitude,
  };
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Assigns each requested location the result whose probe is in that city (or nearest within 150 km). */
function matchLocations(locations: TestLocation[], results: GpMeasurement['results']): Map<string, number> {
  const used = new Set<number>();
  const matches = new Map<string, number>();
  const passes: Array<(loc: TestLocation, probe: GpProbe) => boolean> = [
    (loc, p) => p.country === loc.country && fold(p.city) === fold(loc.city),
    (loc, p) => distanceKm(loc.lat, loc.lon, p.latitude, p.longitude) < 150,
  ];
  for (const test of passes) {
    for (const loc of locations) {
      if (matches.has(loc.id)) continue;
      const index = results.findIndex((r, i) => !used.has(i) && test(loc, r.probe));
      if (index >= 0) {
        matches.set(loc.id, index);
        used.add(index);
      }
    }
  }
  return matches;
}

function isHttpOk(code: number | null): boolean {
  return code !== null && code >= 200 && code < 400;
}

/** Combines the cold, warm and ping measurements into one result per requested location. */
export function assembleLocationResults(
  locations: TestLocation[],
  cold: GpMeasurement,
  warm: GpMeasurement | null,
  ping: GpMeasurement | null,
): LocationResult[] {
  const matches = matchLocations(locations, cold.results);
  const byProbe = (m: GpMeasurement | null) => new Map((m?.results ?? []).map((r) => [probeKey(r.probe), r.result]));
  const warmByProbe = byProbe(warm);
  const pingByProbe = byProbe(ping);

  return locations.map((loc): LocationResult => {
    const index = matches.get(loc.id);
    if (index === undefined) {
      return {
        locationId: loc.id, probe: null, cold: null, warm: null, rttMs: null, packetLoss: null, tls: null, headers: {},
        status: 'no-probe', error: `No Globalping probe was available in ${loc.city}.`,
      };
    }
    const { probe, result } = cold.results[index];
    const key = probeKey(probe);
    const coldParsed = parseHttpResult(result);
    const warmRaw = warmByProbe.get(key);
    const warmParsed = warmRaw ? parseHttpResult(warmRaw) : null;
    const pingRaw = pingByProbe.get(key);
    const pingOk = pingRaw?.status === 'finished';

    const best = warmParsed && !warmParsed.run.error ? warmParsed : coldParsed;
    let status: LocationResult['status'] = 'ok';
    if (coldParsed.run.error && (!warmParsed || warmParsed.run.error)) status = 'failed';
    else if (!isHttpOk(best.run.statusCode)) status = 'http-error';

    return {
      locationId: loc.id,
      probe: toProbeInfo(probe),
      cold: coldParsed.run,
      warm: warmParsed?.run ?? null,
      rttMs: pingOk ? num(pingRaw?.stats?.avg) : null,
      packetLoss: pingOk ? num(pingRaw?.stats?.loss) : null,
      tls: best.tls ?? coldParsed.tls,
      headers: Object.keys(best.headers).length ? best.headers : coldParsed.headers,
      status,
      error: status === 'failed' ? coldParsed.run.error : status === 'http-error' ? `HTTP ${best.run.statusCode}` : null,
    };
  });
}

// ------------------------------------------------------------------ API client

export class GlobalpingError extends Error {}

export interface GlobalpingClientOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export class GlobalpingClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: GlobalpingClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 800;
    this.timeoutMs = options.timeoutMs ?? 90_000;
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'accept-encoding': 'gzip',
      ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
    };
  }

  async create(body: object): Promise<string> {
    const res = await this.fetchImpl(`${API}/measurements`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; type?: string } };
    if (res.status === 429) {
      throw new GlobalpingError(
        'Globalping rate limit reached for this hour. Add a free GLOBALPING_TOKEN to raise the limit, or try again later.',
      );
    }
    if (!res.ok || !payload.id) {
      throw new GlobalpingError(`Globalping rejected the measurement: ${payload.error?.message ?? `HTTP ${res.status}`}`);
    }
    return payload.id;
  }

  async wait(id: string): Promise<GpMeasurement> {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const res = await this.fetchImpl(`${API}/measurements/${id}`, { headers: this.headers() });
      if (!res.ok) throw new GlobalpingError(`Could not read Globalping measurement ${id}: HTTP ${res.status}`);
      const measurement = (await res.json()) as GpMeasurement;
      if (measurement.status !== 'in-progress') return measurement;
      if (Date.now() > deadline) return measurement; // use whatever finished
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  async run(body: object): Promise<GpMeasurement> {
    return this.wait(await this.create(body));
  }
}

export interface NetworkRunProgress {
  (detail: string): void;
}

/** Runs cold + warm HTTP and ping measurements and assembles per-location results. */
export async function measureGlobally(
  client: GlobalpingClient,
  url: string,
  locations: TestLocation[],
  progress: NetworkRunProgress = () => {},
): Promise<{ locations: LocationResult[]; measurementIds: string[] }> {
  progress(`Requesting probes in ${locations.length} cities`);
  const cold = await client.run(buildHttpRequest(url, locations));
  if (cold.results.length === 0) throw new GlobalpingError('Globalping found no probes for the selected locations.');

  progress('Repeating requests with warm caches and measuring round-trip time');
  const hostname = new URL(url).hostname;
  const [warm, ping] = await Promise.all([
    client.run(buildHttpRequest(url, locations, cold.id)).catch(() => null),
    client
      .run({ type: 'ping', target: hostname, locations: cold.id, measurementOptions: { packets: 3 } })
      .catch(() => null),
  ]);

  return {
    locations: assembleLocationResults(locations, cold, warm, ping),
    measurementIds: [cold.id, warm?.id, ping?.id].filter((id): id is string => Boolean(id)),
  };
}
