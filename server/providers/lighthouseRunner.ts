// Chooses where Lighthouse runs: PageSpeed Insights first (it adds real-user
// field data), then a local headless Chromium run as the fallback.

import type { FieldData, FormFactor, LighthouseSummary } from '../../shared/types';
import { normaliseLighthouse } from '../analysis/lighthouse';
import { config } from '../config';
import { runLocalLighthouse } from './localLighthouse';
import { runPageSpeedInsights } from './pagespeed';

export interface LighthouseOutcome {
  summary: LighthouseSummary;
  field: FieldData | null;
  /** Non-fatal problems worth surfacing (e.g. PSI rate-limited, fell back to local). */
  notes: string[];
}

export async function runLighthouse(url: string, formFactor: FormFactor, onDetail: (d: string) => void): Promise<LighthouseOutcome> {
  const notes: string[] = [];
  const mode = config.lighthouseMode;

  if (mode === 'auto' || mode === 'psi') {
    try {
      onDetail('Running on Google PageSpeed Insights');
      return { ...(await runPageSpeedInsights(url, formFactor, config.psiApiKey)), notes };
    } catch (error) {
      if (mode === 'psi' || !config.chromePath) throw error;
      notes.push(`${(error as Error).message} Used a local Lighthouse run instead (no real-user field data).`);
    }
  }

  if (!config.chromePath) throw new Error('No Chrome/Chromium found for local Lighthouse. Set CHROME_PATH or PSI_API_KEY.');
  onDetail('Queued — local audits run one at a time');
  const lhr = await runLocalLighthouse(url, formFactor, config.chromePath, () =>
    onDetail('Running Lighthouse in local headless Chromium'),
  );
  return { summary: normaliseLighthouse(lhr, 'Lighthouse'), field: null, notes };
}
