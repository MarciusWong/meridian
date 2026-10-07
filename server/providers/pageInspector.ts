// Fetches the page directly from this server to inspect redirects, headers,
// compression, protocol support and the HTML itself.

import tls from 'node:tls';
import type { PageInspection, RedirectHop } from '../../shared/types';
import { detectCdn, inspectHtml } from '../analysis/pageAnalysis';
import { assertPublicTarget } from '../security/targetGuard';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 GlobalPageSpeed/1.0';
const MAX_REDIRECTS = 10;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

export interface InspectOptions {
  /** Re-validate every redirect target against private address ranges. */
  guard?: (url: string) => Promise<void>;
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size >= limit) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Negotiates ALPN with the host to see whether it speaks HTTP/2. */
export function probeHttpVersion(url: string): Promise<PageInspection['httpVersion']> {
  const { hostname, port, protocol } = new URL(url);
  if (protocol !== 'https:') return Promise.resolve('http/1.1');
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, servername: hostname, port: Number(port || 443), ALPNProtocols: ['h2', 'http/1.1'] });
    const finish = (value: PageInspection['httpVersion']) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(8000, () => finish('unknown'));
    socket.once('secureConnect', () => finish(socket.alpnProtocol === 'h2' ? 'h2' : 'http/1.1'));
    socket.once('error', () => finish('unknown'));
  });
}

async function supportsBrotli(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': USER_AGENT, 'accept-encoding': 'br' },
      signal: AbortSignal.timeout(10_000),
    });
    return (res.headers.get('content-encoding') ?? '').includes('br');
  } catch {
    return null;
  }
}

export async function inspectPage(startUrl: string, options: InspectOptions = {}): Promise<PageInspection> {
  const guard = options.guard ?? ((u: string) => assertPublicTarget(u));
  const redirects: RedirectHop[] = [];
  const started = performance.now();
  let url = startUrl;
  let res: Response;

  for (let hop = 0; ; hop++) {
    await guard(url);
    const hopStart = performance.now();
    res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'accept-encoding': 'br, gzip, deflate',
        'accept-language': 'en',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      redirects.push({ url, status: res.status, timeMs: Math.round(performance.now() - hopStart) });
      await res.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new Error(`Too many redirects (more than ${MAX_REDIRECTS}).`);
      url = new URL(location, url).toString();
      continue;
    }
    break;
  }

  const ttfbMs = Math.round(performance.now() - started);
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const contentType = headers['content-type'] ?? '';
  const body = await readLimited(res, MAX_HTML_BYTES);
  const totalMs = Math.round(performance.now() - started);

  const [httpVersion, brotli] = await Promise.all([
    probeHttpVersion(url),
    headers['content-encoding']?.includes('br') ? Promise.resolve(true) : supportsBrotli(url),
  ]);

  return {
    requestedUrl: startUrl,
    finalUrl: url,
    status: res.status,
    redirects,
    ttfbMs,
    totalMs,
    headers,
    compression: headers['content-encoding'] ?? null,
    supportsBrotli: brotli,
    httpVersion,
    supportsHttp3: /\bh3\b/.test(headers['alt-svc'] ?? ''),
    cdn: detectCdn(headers),
    server: headers['server'] ?? null,
    cacheControl: headers['cache-control'] ?? null,
    hsts: Boolean(headers['strict-transport-security']),
    html: /html/i.test(contentType) || body.trimStart().startsWith('<') ? inspectHtml(body, url) : null,
  };
}
