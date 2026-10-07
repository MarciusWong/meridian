// Findings from the Globalping measurements: how the site performs from each city.

import type { HttpProbeRun, LocationResult } from '../../../shared/types';
import { locationTtfb, median } from '../scoring';
import { formatMs, type AnalysisInput, type Finding, type Rule } from './types';

const SLOW_TTFB = 800;
const VERY_SLOW_TTFB = 1800;

function cityOf(input: AnalysisInput, id: string): string {
  return input.locations.find((l) => l.id === id)?.city ?? id;
}

function okResults(input: AnalysisInput): LocationResult[] {
  return (input.network ?? []).filter((r) => r.status === 'ok' || r.status === 'http-error');
}

function representativeRun(r: LocationResult): HttpProbeRun | null {
  return r.warm && !r.warm.error ? r.warm : r.cold;
}

const locationFailures: Rule = (input) => {
  const failed = (input.network ?? []).filter((r) => r.status === 'failed' || r.status === 'http-error');
  if (failed.length === 0) return [];
  return [{
    id: 'location-failures',
    title: `Site failed to load from ${failed.length} location${failed.length > 1 ? 's' : ''}`,
    severity: 'critical',
    category: 'Global delivery',
    summary: 'Visitors in these places may not be able to reach the page at all. This usually points to geo-blocking, firewall or bot-protection rules, a DNS problem, or an origin that is down for some routes.',
    evidence: failed.map((r) => `${cityOf(input, r.locationId)}: ${r.error ?? 'request failed'}`),
    fixes: [
      'Open the URL through a VPN or proxy in the affected countries to confirm the failure.',
      'Review WAF, firewall, rate-limiting and bot-protection rules for country or ASN blocks that catch real visitors.',
      'Check DNS for the domain from those regions (e.g. with a Globalping DNS test) and confirm every record points to a healthy server.',
      'If a CDN is in use, check its origin health checks and regional PoP status.',
    ],
    locations: failed.map((r) => r.locationId),
    sources: ['Globalping'],
  }];
};

const slowTtfb: Rule = (input) => {
  const slow = okResults(input)
    .map((r) => ({ id: r.locationId, ttfb: locationTtfb(r) }))
    .filter((m): m is { id: string; ttfb: number } => m.ttfb !== null && m.ttfb > SLOW_TTFB)
    .sort((a, b) => b.ttfb - a.ttfb);
  if (slow.length === 0) return [];
  const verySlow = slow.filter((s) => s.ttfb > VERY_SLOW_TTFB);
  const cdn = input.inspection?.cdn;
  return [{
    id: 'slow-ttfb',
    title: `Slow first byte in ${slow.length} location${slow.length > 1 ? 's' : ''}`,
    severity: verySlow.length > 0 ? 'critical' : 'high',
    category: 'Global delivery',
    summary: `Time to first byte is above ${SLOW_TTFB} ms here, so nothing can start rendering until it arrives. Every other metric (FCP, LCP) is delayed by at least this much.`,
    evidence: slow.map((s) => `${cityOf(input, s.id)}: ${formatMs(s.ttfb)} to first byte`),
    fixes: [
      cdn
        ? `Make sure ${cdn} caches the HTML itself, not only static assets, so these regions are answered from a nearby edge.`
        : 'Put the site behind a CDN with points of presence near these regions.',
      'Cache rendered pages (full-page cache) so the origin does not rebuild the HTML for each request.',
      'If the content must be dynamic, consider running the app or a read replica in an additional region close to these users.',
      'Use stale-while-revalidate so visitors get a cached copy while the page refreshes in the background.',
    ],
    impactMs: Math.round(slow[0].ttfb - SLOW_TTFB),
    locations: slow.map((s) => s.id),
    sources: ['Globalping'],
  }];
};

function spread(input: AnalysisInput): { fastest: number; slowest: number; slowIds: string[] } | null {
  const ttfbs = okResults(input)
    .map((r) => ({ id: r.locationId, ttfb: locationTtfb(r) }))
    .filter((m): m is { id: string; ttfb: number } => m.ttfb !== null);
  if (ttfbs.length < 3) return null;
  const values = ttfbs.map((m) => m.ttfb);
  const fastest = Math.min(...values);
  const slowest = Math.max(...values);
  const slowIds = ttfbs.filter((m) => m.ttfb > Math.max(fastest * 2.5, 400)).sort((a, b) => b.ttfb - a.ttfb).map((m) => m.id);
  return { fastest, slowest, slowIds };
}

const useCdn: Rule = (input) => {
  if (!input.inspection || input.inspection.cdn) return [];
  const s = spread(input);
  if (!s || s.slowest < 600 || s.slowest / s.fastest < 3) return [];
  return [{
    id: 'use-cdn',
    title: 'Serve the site from a CDN',
    severity: 'high',
    category: 'Global delivery',
    summary: `No CDN was detected and visitors far from the origin wait much longer: the slowest location took ${formatMs(s.slowest)} to first byte versus ${formatMs(s.fastest)} at the fastest. A CDN answers from an edge server near each visitor.`,
    evidence: [
      `Fastest first byte: ${formatMs(s.fastest)}; slowest: ${formatMs(s.slowest)} (${(s.slowest / s.fastest).toFixed(1)}× slower)`,
      `Slow locations: ${s.slowIds.map((id) => cityOf(input, id)).join(', ')}`,
      'No CDN response headers (cf-ray, x-amz-cf-id, x-served-by, x-vercel-id …) were found.',
    ],
    fixes: [
      'Put the site behind a CDN — Cloudflare, Fastly, Amazon CloudFront, Bunny CDN and others have free or low-cost tiers.',
      'Cache static assets at the edge with long Cache-Control lifetimes and fingerprinted file names.',
      'Then cache the HTML at the edge too (s-maxage plus stale-while-revalidate), purging on deploy or content change.',
      'Enable HTTP/3 and TLS 1.3 at the CDN to cut connection set-up time on long-distance links.',
    ],
    impactMs: Math.round(s.slowest - s.fastest),
    locations: s.slowIds,
    sources: ['Globalping', 'Page inspector'],
    learnMoreUrl: 'https://web.dev/articles/content-delivery-networks',
  }];
};

const UNCACHED = new Set(['MISS', 'DYNAMIC', 'BYPASS', 'EXPIRED', 'PASS']);

const edgeCacheHtml: Rule = (input) => {
  const cdn = input.inspection?.cdn;
  if (!cdn) return [];
  const results = okResults(input);
  const statuses = results.map((r) => ({ id: r.locationId, status: representativeRun(r)?.cacheStatus ?? null, ttfb: locationTtfb(r) }));
  const known = statuses.filter((s) => s.status !== null);
  const misses = known.filter((s) => UNCACHED.has(s.status as string));
  if (known.length === 0 || misses.length / known.length < 0.5) return [];
  const slowest = Math.max(...misses.map((m) => m.ttfb ?? 0));
  return [{
    id: 'edge-cache-html',
    title: `Cache the HTML at the ${cdn} edge`,
    severity: slowest > SLOW_TTFB ? 'high' : 'medium',
    category: 'Caching',
    summary: `${cdn} is in front of the site, but the page itself was not served from its cache in ${misses.length} of ${known.length} locations, even on a repeat request. Each of those requests travelled to the origin.`,
    evidence: misses.map((m) => `${cityOf(input, m.id)}: cache ${m.status}${m.ttfb !== null ? `, ${formatMs(m.ttfb)} to first byte` : ''}`),
    fixes: [
      'Send a shared-cache lifetime for HTML, e.g. Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400.',
      cdn === 'Cloudflare'
        ? 'In Cloudflare, add a Cache Rule that marks HTML as eligible for cache (HTML is "DYNAMIC" by default), bypassing it only for logged-in sessions.'
        : `Add a ${cdn} cache rule that caches HTML responses, bypassing only for logged-in or personalised sessions.`,
      'Avoid Set-Cookie and Vary: Cookie on anonymous page views — both usually prevent edge caching.',
      'Purge the cache on deploy or content change instead of keeping lifetimes short.',
    ],
    impactMs: Math.max(0, Math.round(slowest - 100)),
    locations: misses.map((m) => m.id),
    sources: ['Globalping'],
  }];
};

const slowDns: Rule = (input) => {
  const results = okResults(input).filter((r) => r.cold?.timings.dns !== null && r.cold?.timings.dns !== undefined);
  const dns = results.map((r) => r.cold?.timings.dns as number);
  const med = median(dns);
  if (med === null || med <= 100) return [];
  const worst = [...results].sort((a, b) => (b.cold?.timings.dns ?? 0) - (a.cold?.timings.dns ?? 0)).slice(0, 5);
  return [{
    id: 'slow-dns',
    title: 'Speed up DNS resolution',
    severity: med > 250 ? 'high' : 'medium',
    category: 'Global delivery',
    summary: `Looking up the domain took ${formatMs(med)} at the median on a first visit. DNS has to finish before the connection can even start.`,
    evidence: worst.map((r) => `${cityOf(input, r.locationId)}: ${formatMs(r.cold?.timings.dns ?? 0)} DNS lookup`),
    fixes: [
      'Host DNS with a fast anycast provider (Cloudflare DNS, Amazon Route 53, NS1, Google Cloud DNS).',
      'Raise record TTLs (e.g. 1 hour or more) so resolvers can answer from cache.',
      'Remove CNAME chains — point the record straight at the final target or use CNAME flattening / ALIAS records.',
    ],
    impactMs: Math.round(med - 50),
    locations: worst.map((r) => r.locationId),
    sources: ['Globalping'],
  }];
};

const slowTls: Rule = (input) => {
  const results = okResults(input).filter((r) => r.cold?.timings.tls != null && r.rttMs != null);
  const excess = results.map((r) => (r.cold?.timings.tls as number) - (r.rttMs as number));
  const med = median(excess);
  if (med === null || med <= 120) return [];
  return [{
    id: 'slow-tls',
    title: 'Shorten the TLS handshake',
    severity: med > 300 ? 'high' : 'medium',
    category: 'Protocol & security',
    summary: `The TLS handshake took ${formatMs(med)} longer than the network round trip at the median. A tuned TLS 1.3 handshake costs roughly one round trip.`,
    evidence: results.slice(0, 5).map((r) => `${cityOf(input, r.locationId)}: TLS ${formatMs(r.cold?.timings.tls ?? 0)} vs ${formatMs(r.rttMs ?? 0)} round trip`),
    fixes: [
      'Enable TLS 1.3 and session resumption on the server or CDN.',
      'Enable OCSP stapling so browsers do not have to contact the certificate authority.',
      'Use an ECDSA certificate (smaller and faster than RSA) and serve the full, minimal certificate chain.',
      'Terminate TLS at a CDN edge close to the visitor.',
    ],
    impactMs: Math.round(med - 60),
    sources: ['Globalping'],
  }];
};

const oldTls: Rule = (input) => {
  const protocols = new Set(okResults(input).map((r) => r.tls?.protocol).filter((p): p is string => Boolean(p)));
  const old = [...protocols].filter((p) => p !== 'TLSv1.3');
  if (old.length === 0) return [];
  return [{
    id: 'old-tls',
    title: 'Enable TLS 1.3',
    severity: old.some((p) => /TLSv1(\.[01])?$/.test(p)) ? 'high' : 'low',
    category: 'Protocol & security',
    summary: 'TLS 1.3 needs one fewer network round trip than TLS 1.2 to set up a connection, and supports 0-RTT resumption.',
    evidence: [`Negotiated: ${old.join(', ')}`],
    fixes: ['Enable TLS 1.3 in the web server, load balancer or CDN settings.', 'Disable TLS 1.0 and 1.1 entirely.'],
    sources: ['Globalping'],
  }];
};

const certificate: Rule = (input) => {
  const now = (input.now ?? new Date()).getTime();
  const tls = okResults(input).map((r) => r.tls).find((t) => t?.expiresAt);
  if (!tls?.expiresAt) return [];
  const days = Math.floor((new Date(tls.expiresAt).getTime() - now) / 86_400_000);
  const findings: Finding[] = [];
  if (tls.authorized === false) {
    findings.push({
      id: 'certificate-invalid',
      title: 'TLS certificate is not trusted',
      severity: 'critical',
      category: 'Protocol & security',
      summary: 'Browsers will show a security warning instead of the page.',
      evidence: [`Issuer: ${tls.issuer ?? 'unknown'}`],
      fixes: ['Install a certificate from a trusted CA (e.g. Let’s Encrypt) including the full intermediate chain.'],
      sources: ['Globalping'],
    });
  }
  if (days <= 30) {
    findings.push({
      id: 'certificate-expiry',
      title: days < 0 ? 'TLS certificate has expired' : `TLS certificate expires in ${days} day${days === 1 ? '' : 's'}`,
      severity: days <= 14 ? 'critical' : 'high',
      category: 'Protocol & security',
      summary: 'When the certificate expires every visitor gets a full-page security error.',
      evidence: [`Expires: ${tls.expiresAt}`, `Issuer: ${tls.issuer ?? 'unknown'}`],
      fixes: ['Renew the certificate now.', 'Automate renewal (ACME / certbot, or your CDN’s managed certificates) and monitor expiry.'],
      sources: ['Globalping'],
    });
  }
  return findings;
};

const slowBackend: Rule = (input) => {
  const waits = okResults(input)
    .map((r) => {
      const run = representativeRun(r);
      const firstByte = run?.timings.firstByte;
      return firstByte == null ? null : { id: r.locationId, wait: Math.max(0, firstByte - (r.rttMs ?? 0)) };
    })
    .filter((w): w is { id: string; wait: number } => w !== null);
  if (waits.length === 0) return [];
  const best = Math.min(...waits.map((w) => w.wait));
  if (best <= 300) return [];
  return [{
    id: 'slow-backend',
    title: 'Reduce server processing time',
    severity: best > 1000 ? 'critical' : 'high',
    category: 'Server',
    summary: `Even from the best-placed location the server spent about ${formatMs(best)} preparing the page after receiving the request (time to first byte minus network round trip). That delay is paid by every visitor everywhere.`,
    evidence: [...waits].sort((a, b) => a.wait - b.wait).slice(0, 3).map((w) => `${cityOf(input, w.id)}: ~${formatMs(w.wait)} server wait`),
    fixes: [
      'Add a full-page or fragment cache (Varnish, Redis, framework page cache, or CDN edge cache).',
      'Profile the request with an APM tool and fix slow database queries (add indexes, remove N+1 queries).',
      'Move slow work (emails, third-party API calls) out of the request path into background jobs.',
      'Check server resources: CPU throttling, PHP/Node worker limits and cold starts on serverless platforms.',
    ],
    impactMs: Math.round(best - 200),
    sources: ['Globalping'],
  }];
};

const packetLoss: Rule = (input) => {
  const lossy = (input.network ?? []).filter((r) => (r.packetLoss ?? 0) > 2);
  if (lossy.length === 0) return [];
  return [{
    id: 'packet-loss',
    title: 'Packet loss on the route to some locations',
    severity: 'low',
    category: 'Global delivery',
    summary: 'Lost packets cause retransmissions, which slow down every request on that route.',
    evidence: lossy.map((r) => `${cityOf(input, r.locationId)}: ${r.packetLoss}% packet loss`),
    fixes: ['If this persists, ask your host or CDN about routing to these regions, or add a CDN PoP closer to them.'],
    locations: lossy.map((r) => r.locationId),
    sources: ['Globalping'],
  }];
};

export const networkRules: Rule[] = [
  locationFailures, slowTtfb, useCdn, edgeCacheHtml, slowDns, slowTls, oldTls, certificate, slowBackend, packetLoss,
];
