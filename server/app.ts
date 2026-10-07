import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { CreateTestRequest } from '../shared/types';
import { capabilities } from './config';
import { BusyError, type JobManager } from './jobs';
import { LOCATIONS, REGIONS } from './locations';
import type { RateLimiter } from './security/rateLimit';
import { TargetError } from './security/targetGuard';

export interface AppOptions {
  /** Built front end to serve (production). */
  staticDir?: string;
  /** Limits how many tests each client can start. */
  rateLimiter?: RateLimiter;
  /** Share the list of recent reports with every visitor. */
  publicHistory?: boolean;
  /** Express "trust proxy" setting, so client IPs are right behind a reverse proxy. */
  trustProxy?: boolean | number | string;
}

const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();

/** CSP hashes for the inline <script> blocks in the built index.html (the theme bootstrap). */
function inlineScriptHashes(staticDir: string | undefined): string[] {
  const file = staticDir ? path.join(staticDir, 'index.html') : null;
  if (!file || !existsSync(file)) return [];
  const html = readFileSync(file, 'utf8');
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`,
  );
}

// The UI only talks to its own origin; screenshots arrive as data: URIs.
function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src ${["'self'", ...scriptHashes].join(' ')}`,
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(csp: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set({
      'content-security-policy': csp,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'cross-origin-opener-policy': 'same-origin',
    });
    next();
  };
}

export function createApp(manager: JobManager, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? 'loopback');
  app.use(securityHeaders(contentSecurityPolicy(inlineScriptHashes(options.staticDir))));
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.set('cache-control', 'no-store').json({ ok: true, version: VERSION });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      locations: LOCATIONS,
      regions: REGIONS,
      capabilities: { ...capabilities(), publicHistory: Boolean(options.publicHistory) },
    });
  });

  if (options.publicHistory) {
    app.get('/api/tests', (_req, res) => {
      res.set('cache-control', 'no-store').json(manager.list());
    });
  }

  app.post('/api/tests', async (req: Request, res: Response, next: NextFunction) => {
    const client = req.ip ?? 'unknown';
    const limit = options.rateLimiter?.take(client);
    if (limit && !limit.allowed) {
      const minutes = Math.ceil(limit.retryAfterSeconds / 60);
      res
        .status(429)
        .set('retry-after', String(limit.retryAfterSeconds))
        .json({ error: `Hourly test limit reached. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` });
      return;
    }
    try {
      const body = (req.body ?? {}) as Partial<CreateTestRequest>;
      const report = await manager.start(
        {
          url: String(body.url ?? ''),
          locations: Array.isArray(body.locations) ? body.locations.slice(0, 100).map(String) : undefined,
          lighthouse: body.lighthouse !== false,
        },
        client,
      );
      res.status(202).json({ id: report.id });
    } catch (error) {
      // Rejected requests (bad URL, server busy) don't use up the client's allowance.
      options.rateLimiter?.refund(client);
      next(error);
    }
  });

  app.get('/api/tests/:id', (req, res) => {
    const report = manager.get(req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    res.set('cache-control', report.status === 'running' ? 'no-store' : 'private, max-age=60').json(report);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    const staticDir = options.staticDir;
    // Hashed build assets never change; everything else must revalidate.
    app.use('/assets', express.static(path.join(staticDir, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => {
      res.set('cache-control', 'no-cache').sendFile(path.resolve(staticDir, 'index.html'));
    });
  }

  app.use((error: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof TargetError || error instanceof BusyError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }
    if (error.status === 404) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
