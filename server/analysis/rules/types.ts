import type { FieldData, LighthouseSummary, LocationResult, PageInspection, Recommendation, TestLocation } from '../../../shared/types';

/** A recommendation before ranking. Findings with the same id are merged. */
export type Finding = Omit<Recommendation, 'priority'>;

export interface AnalysisInput {
  locations: TestLocation[];
  network: LocationResult[] | null;
  inspection: PageInspection | null;
  mobile: LighthouseSummary | null;
  desktop: LighthouseSummary | null;
  field: FieldData | null;
  /** Injected for deterministic tests (certificate expiry). */
  now?: Date;
}

export type Rule = (input: AnalysisInput) => Finding[];

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${Math.round(ms)} ms`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
