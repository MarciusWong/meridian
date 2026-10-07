import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { CreateTestRequest } from '../shared/types';
import { capabilities } from './config';
import { BusyError, type JobManager } from './jobs';
import { LOCATIONS, REGIONS } from './locations';
import { TargetError } from './security/targetGuard';

export function createApp(manager: JobManager, staticDir?: string) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/config', (_req, res) => {
    res.json({ locations: LOCATIONS, regions: REGIONS, capabilities: capabilities() });
  });

  app.get('/api/tests', (_req, res) => {
    res.json(manager.list());
  });

  app.post('/api/tests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (req.body ?? {}) as Partial<CreateTestRequest>;
      const report = await manager.start(
        {
          url: String(body.url ?? ''),
          locations: Array.isArray(body.locations) ? body.locations.map(String) : undefined,
          lighthouse: body.lighthouse !== false,
        },
        req.ip ?? 'unknown',
      );
      res.status(202).json({ id: report.id });
    } catch (error) {
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

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1y', immutable: true }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('cache-control', 'no-cache').sendFile(path.resolve(staticDir, 'index.html'));
    });
  }

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof TargetError || error instanceof BusyError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
