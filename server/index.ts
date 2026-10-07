import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { config } from './config';
import { JobManager, type Providers } from './jobs';
import { GlobalpingClient, measureGlobally } from './providers/globalping';
import { runLighthouse } from './providers/lighthouseRunner';
import { inspectPage } from './providers/pageInspector';
import { runWebPageTest } from './providers/webpagetest';
import { RateLimiter } from './security/rateLimit';
import { assertPublicTarget } from './security/targetGuard';
import { ReportStore } from './storage';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = config.allowPrivateTargets ? async () => {} : (url: string) => assertPublicTarget(url);
const globalping = new GlobalpingClient({ token: config.globalpingToken });

const providers: Providers = {
  guard,
  inspect: (url) => inspectPage(url, { guard }),
  network: (url, locations, onDetail) => measureGlobally(globalping, url, locations, onDetail),
  lighthouse: (url, formFactor, onDetail) => runLighthouse(url, formFactor, onDetail),
  webpagetest: config.wptApiKey
    ? (url, locations, onDetail) => runWebPageTest(url, locations, config.wptApiKey as string, onDetail)
    : undefined,
};

if (config.lighthouseMode === 'off') {
  providers.lighthouse = async () => {
    throw new Error('Lighthouse is disabled (LIGHTHOUSE_MODE=off).');
  };
}

const store = new ReportStore(path.resolve(root, config.dataDir));
const prune = () => {
  const removed = store.prune(config.reportRetentionDays);
  if (removed) console.log(`Removed ${removed} report(s) older than ${config.reportRetentionDays} days.`);
};
prune();
setInterval(prune, 6 * 60 * 60 * 1000).unref();

const manager = new JobManager(providers, store, { maxConcurrentJobs: config.maxConcurrentJobs });

const app = createApp(manager, {
  staticDir: process.env.NODE_ENV === 'production' ? path.join(root, 'dist') : undefined,
  rateLimiter: new RateLimiter({ limit: config.rateLimitPerHour, windowMs: 60 * 60 * 1000 }),
  publicHistory: config.publicHistory,
  trustProxy: config.trustProxy,
});

const server = app.listen(config.port, config.host, () => {
  const lighthouse =
    config.lighthouseMode === 'off'
      ? 'off'
      : `${config.lighthouseMode}${config.psiApiKey ? ', PageSpeed Insights key set' : ''}${config.chromePath ? `, local Chrome at ${config.chromePath}` : ', no local Chrome found'}`;
  console.log(`Meridian listening on http://localhost:${config.port}`);
  console.log(`  Lighthouse: ${lighthouse}`);
  console.log(
    `  Globalping: ${config.globalpingToken ? 'token set' : 'anonymous (250 measurements/hour)'}${config.wptApiKey ? ' · WebPageTest enabled' : ''}`,
  );
  console.log(
    `  Limits: ${config.rateLimitPerHour || 'unlimited'} tests/hour per client, ${config.maxConcurrentJobs} concurrent`,
  );
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => process.exit(0));
  // Running tests can take a minute; don't hang deploys forever.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
