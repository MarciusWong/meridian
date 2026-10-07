import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../server/security/rateLimit';

describe('RateLimiter', () => {
  it('allows up to the limit within the window, then refuses with a retry time', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    expect(limiter.take('a').allowed).toBe(true);
    now = 10_000;
    expect(limiter.take('a').allowed).toBe(true);
    now = 20_000;
    const refused = limiter.take('a');
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(40); // first hit expires at 60s
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('frees capacity as old hits leave the window (sliding)', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    limiter.take('a');
    now = 1001;
    expect(limiter.take('a').allowed).toBe(true);
  });

  it('can refund a hit, e.g. when the request turns out invalid', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.take('a');
    limiter.refund('a');
    expect(limiter.take('a').allowed).toBe(true);
  });

  it('is disabled with a limit of 0', () => {
    const limiter = new RateLimiter({ limit: 0, windowMs: 1000 });
    for (let i = 0; i < 100; i++) expect(limiter.take('a').allowed).toBe(true);
  });
});
