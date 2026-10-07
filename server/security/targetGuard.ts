import { lookup } from 'node:dns/promises';
import net from 'node:net';

/** A user-facing problem with the URL to test. */
export class TargetError extends Error {
  readonly status = 400;
}

/** Validates user input and returns a canonical absolute http(s) URL without a fragment. */
export function normaliseUrl(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) throw new TargetError('Enter a URL to test.');

  // "example.com:8443" looks like a scheme to the URL parser; only treat input as
  // having a scheme when it has "//" or is a known non-network scheme.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(javascript|data|mailto|file|about|blob|vbscript):/i.test(raw);
  const withScheme = hasScheme ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new TargetError(`"${raw}" is not a valid URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetError('Only http:// and https:// URLs can be tested.');
  }
  if (url.username || url.password) {
    throw new TargetError('URLs with embedded credentials are not supported.');
  }
  const host = hostWithoutBrackets(url.hostname);
  if (!host || (!host.includes('.') && net.isIP(host) === 0)) {
    throw new TargetError('Enter a full public domain name, such as example.com.');
  }

  url.hash = '';
  return url.toString();
}

function hostWithoutBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return PRIVATE_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind !== 6) return true;

  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  const firstHextet = parseInt(lower.split(':')[0] || '0', 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((firstHextet & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true });
  return records.map((r) => r.address);
};

/** Throws a TargetError unless the URL's host resolves only to public addresses. */
export async function assertPublicTarget(url: string, resolve: Resolver = systemResolver): Promise<void> {
  const host = hostWithoutBrackets(new URL(url).hostname);

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new TargetError('Private and local network addresses cannot be tested.');
    return;
  }

  let addresses: string[] = [];
  try {
    addresses = await resolve(host);
  } catch {
    addresses = [];
  }
  if (addresses.length === 0) throw new TargetError(`Could not resolve ${host}. Check the domain name.`);
  if (addresses.some(isPrivateAddress)) {
    throw new TargetError(`${host} points to a private network address and cannot be tested.`);
  }
}

/**
 * URL patterns for private and local addresses, for browsers we drive
 * (Lighthouse's blockedUrlPatterns), so a tested page cannot make the server's
 * browser request internal services. Hostnames that resolve privately are
 * not covered; the page URL itself is checked with assertPublicTarget.
 */
export const PRIVATE_URL_PATTERNS: string[] = [
  '*://localhost*',
  '*://127.*',
  '*://10.*',
  '*://192.168.*',
  '*://169.254.*',
  '*://0.*',
  ...Array.from({ length: 16 }, (_, i) => `*://172.${16 + i}.*`),
  '*://[::1]*',
  '*://[fc*',
  '*://[fd*',
  '*://[fe80:*',
  '*://*.internal/*',
  '*://*.local/*',
];
