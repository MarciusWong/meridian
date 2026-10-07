import { describe, expect, it } from 'vitest';
import { assertPublicTarget, isPrivateAddress, normaliseUrl, TargetError } from '../server/security/targetGuard';

describe('normaliseUrl', () => {
  it('adds https:// when no scheme is given', () => {
    expect(normaliseUrl('example.com')).toBe('https://example.com/');
  });
  it('keeps http and path/query but drops the fragment', () => {
    expect(normaliseUrl('http://example.com/a?b=1#c')).toBe('http://example.com/a?b=1');
  });
  it('trims whitespace', () => {
    expect(normaliseUrl('  https://example.com  ')).toBe('https://example.com/');
  });
  it.each(['ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd', '', 'https://', 'not a url'])(
    'rejects %s',
    (input) => {
      expect(() => normaliseUrl(input)).toThrow(TargetError);
    },
  );
  it('rejects URLs with credentials', () => {
    expect(() => normaliseUrl('https://user:pass@example.com')).toThrow(TargetError);
  });
  it('rejects bare hostnames without a dot', () => {
    expect(() => normaliseUrl('https://intranet/')).toThrow(TargetError);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::',
  ])('flags %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '104.20.23.154', '172.32.0.1', '2606:4700::6810:84e5'])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('assertPublicTarget', () => {
  it('passes when every resolved address is public', async () => {
    await expect(assertPublicTarget('https://example.com/', async () => ['93.184.216.34'])).resolves.toBeUndefined();
  });
  it('fails when any resolved address is private', async () => {
    await expect(assertPublicTarget('https://example.com/', async () => ['93.184.216.34', '10.0.0.1'])).rejects.toThrow(
      /private/i,
    );
  });
  it('fails for IP literals in private ranges without resolving', async () => {
    await expect(assertPublicTarget('http://127.0.0.1/', async () => [])).rejects.toThrow(TargetError);
  });
  it('fails when the host does not resolve', async () => {
    await expect(assertPublicTarget('https://nope.invalid/', async () => [])).rejects.toThrow(/resolve/i);
  });
});
