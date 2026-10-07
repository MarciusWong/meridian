import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { config } from './config';
import { JobManager, type Providers } from './jobs';
import { GlobalpingClient, measureGlobally } from './providers/globalping';
import { runLighthouse } from './providers/lighthouseRunner';
import { inspectPage } from './providers/pageInspector';
import { runWebPageTest } from './providers/webpagetest';
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

const manager = new JobManager(providers, new ReportStore(path.resolve(root, config.dataDir)), {
  maxConcurrentJobs: config.maxConcurrentJobs,
});

const staticDir = process.env.NODE_ENV === 'production' ? path.join(root, 'dist') : undefined;

createApp(manager, staticDir).listen(config.port, () => {
  console.log(`Global PageSpeed API listening on http://localhost:${config.port}`);
  console.log(
    `  Lighthouse: ${config.lighthouseMode}${config.psiApiKey ? ' (PSI key set)' : ''}` +
      `${config.chromePath ? ` · local Chrome: ${config.chromePath}` : ' · no local Chrome found'}` +
      `${config.wptApiKey ? ' · WebPageTest enabled' : ''}`,
  );
});
