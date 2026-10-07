// Google PageSpeed Insights API v5: Lighthouse run by Google + Chrome UX Report field data.

import type { FieldData, FormFactor, LighthouseSummary } from '../../shared/types';
import { normaliseFieldData, normaliseLighthouse, type RawLhr, type RawLoadingExperience } from '../analysis/lighthouse';

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export class PsiError extends Error {
  constructor(
    message: string,
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

interface PsiResponse {
  lighthouseResult?: RawLhr;
  loadingExperience?: RawLoadingExperience;
  originLoadingExperience?: RawLoadingExperience;
  error?: { message?: string; code?: number };
}

export async function runPageSpeedInsights(
  url: string,
  formFactor: FormFactor,
  apiKey?: string,
): Promise<{ summary: LighthouseSummary; field: FieldData | null }> {
  const params = new URLSearchParams({ url, strategy: formFactor.toUpperCase() });
  for (const category of ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']) params.append('category', category);
  if (apiKey) params.set('key', apiKey);

  const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(120_000) });
  const body = (await res.json().catch(() => ({}))) as PsiResponse;

  if (res.status === 429) {
    throw new PsiError('PageSpeed Insights quota exceeded. Add a free PSI_API_KEY for reliable access.', true);
  }
  if (!res.ok || !body.lighthouseResult) {
    throw new PsiError(`PageSpeed Insights failed: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }

  return {
    summary: normaliseLighthouse(body.lighthouseResult, 'PageSpeed Insights'),
    field: normaliseFieldData(body.loadingExperience, body.originLoadingExperience),
  };
}
