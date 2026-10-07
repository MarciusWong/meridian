// Sliding-window rate limiter keyed by client. In-memory: fine for a single
// instance; put a shared limiter in front if you run several replicas.

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(private readonly options: { limit: number; windowMs: number; now?: () => number }) {
    this.now = options.now ?? Date.now;
  }

  take(key: string): RateLimitResult {
    if (this.options.limit <= 0) return { allowed: true, retryAfterSeconds: 0 };
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.options.windowMs);
    if (recent.length >= this.options.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + this.options.windowMs - now) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.sweep(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Gives back the most recent hit, e.g. when the request was rejected as invalid. */
  refund(key: string): void {
    this.hits.get(key)?.pop();
  }

  /** Drops idle keys so memory does not grow with every visitor ever seen. */
  private sweep(now: number): void {
    if (this.hits.size < 1000) return;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.options.windowMs)) this.hits.delete(key);
    }
  }
}
