// Turns a raw Lighthouse result (from PageSpeed Insights or a local run) into
// the compact LighthouseSummary the rest of the app uses.

import type { FieldData, FieldMetric, LabMetric, LighthouseAudit, LighthouseSummary, MetricStatus } from '../../shared/types';

export interface RawAudit {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  numericValue?: number;
  metricSavings?: Record<string, number>;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: unknown;
    data?: string;
  };
}

export interface RawLhr {
  lighthouseVersion: string;
  fetchTime: string;
  requestedUrl?: string;
  finalDisplayedUrl?: string;
  finalUrl?: string;
  configSettings: { formFactor: 'mobile' | 'desktop' };
  categories: Record<string, { score: number | null; auditRefs: Array<{ id: string; weight: number; group?: string }> }>;
  audits: Record<string, RawAudit>;
}

const METRICS: Array<{ id: LabMetric['id']; audit: string; label: string; unit: LabMetric['unit'] }> = [
  { id: 'fcp', audit: 'first-contentful-paint', label: 'First Contentful Paint', unit: 'ms' },
  { id: 'lcp', audit: 'largest-contentful-paint', label: 'Largest Contentful Paint', unit: 'ms' },
  { id: 'tbt', audit: 'total-blocking-time', label: 'Total Blocking Time', unit: 'ms' },
  { id: 'cls', audit: 'cumulative-layout-shift', label: 'Cumulative Layout Shift', unit: 'unitless' },
  { id: 'si', audit: 'speed-index', label: 'Speed Index', unit: 'ms' },
  { id: 'ttfb', audit: 'server-response-time', label: 'Server response time', unit: 'ms' },
];

const SCORED_MODES = new Set(['numeric', 'binary', 'metricSavings']);
const MAX_ITEMS = 5;

function toPercent(score: number | null | undefined): number | null {
  return typeof score === 'number' ? Math.round(score * 100) : null;
}

/** Lighthouse descriptions are markdown; keep the text of links and drop the URLs. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function plainSpaces(text: string | undefined): string | undefined {
  return text?.replace(/\u00a0/g, ' ');
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function describeItem(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const valueText = (v: unknown): string | null => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string') return o.url;
      if (typeof o.text === 'string') return o.text;
      if (typeof o.snippet === 'string') return o.snippet;
      if (typeof o.nodeLabel === 'string') return o.nodeLabel;
    }
    return null;
  };
  const label =
    valueText(row.url) ??
    valueText(row.source) ??
    valueText(row.entity) ??
    valueText(row.node) ??
    valueText(row.label) ??
    valueText(row.groupLabel);
  if (!label) return null;
  const extras: string[] = [];
  if (typeof row.wastedBytes === 'number' && row.wastedBytes > 0) extras.push(`${formatBytes(row.wastedBytes)} wasted`);
  else if (typeof row.totalBytes === 'number' && row.totalBytes > 0) extras.push(formatBytes(row.totalBytes));
  if (typeof row.wastedMs === 'number' && row.wastedMs > 0) extras.push(`${Math.round(row.wastedMs)} ms`);
  else if (typeof row.total === 'number' && row.total > 0) extras.push(`${Math.round(row.total)} ms`);
  return extras.length ? `${label} (${extras.join(', ')})` : label;
}

function normaliseAudit(audit: RawAudit): LighthouseAudit {
  const details = audit.details ?? {};
  const items = Array.isArray(details.items) ? details.items : [];
  const metricSavings = Object.fromEntries(
    Object.entries(audit.metricSavings ?? {}).filter(([, v]) => typeof v === 'number' && v > 0),
  ) as LighthouseAudit['metricSavings'];
  const paintSavings = Math.max(0, metricSavings?.LCP ?? 0, metricSavings?.FCP ?? 0);
  const savingsMs =
    details.overallSavingsMs && details.overallSavingsMs > 0 ? details.overallSavingsMs : paintSavings || undefined;
  const wasted = items.reduce(
    (sum: number, it) =>
      sum +
      (typeof (it as { wastedBytes?: unknown })?.wastedBytes === 'number' ? (it as { wastedBytes: number }).wastedBytes : 0),
    0,
  );
  const savingsBytes =
    details.overallSavingsBytes && details.overallSavingsBytes > 0 ? details.overallSavingsBytes : wasted || undefined;

  return {
    id: audit.id,
    title: audit.title,
    description: stripMarkdown(audit.description ?? ''),
    score: audit.score,
    scoreDisplayMode: audit.scoreDisplayMode,
    displayValue: plainSpaces(audit.displayValue) || undefined,
    savingsMs: savingsMs ? Math.round(savingsMs) : undefined,
    savingsBytes: savingsBytes ? Math.round(savingsBytes) : undefined,
    metricSavings: metricSavings && Object.keys(metricSavings).length ? metricSavings : undefined,
    learnMoreUrl: audit.description?.match(/\]\((https?:\/\/[^)]+)\)/)?.[1],
    items: items
      .map(describeItem)
      .filter((s): s is string => Boolean(s))
      .slice(0, MAX_ITEMS),
  };
}

export function normaliseLighthouse(lhr: RawLhr, source: LighthouseSummary['source']): LighthouseSummary {
  const perf = lhr.categories.performance;
  const audits = (perf?.auditRefs ?? [])
    .filter((ref) => ref.group !== 'metrics' && ref.group !== 'hidden')
    .map((ref) => lhr.audits[ref.id])
    .filter((a): a is RawAudit => Boolean(a) && SCORED_MODES.has(a.scoreDisplayMode) && a.score !== null && a.score < 0.9)
    .map(normaliseAudit);

  const metrics: LabMetric[] = METRICS.flatMap(({ id, audit, label, unit }) => {
    const raw = lhr.audits[audit];
    if (!raw || typeof raw.numericValue !== 'number') return [];
    return [
      {
        id,
        label,
        unit,
        value: raw.numericValue,
        displayValue: plainSpaces(raw.displayValue) ?? String(raw.numericValue),
        score: raw.score,
      },
    ];
  });

  const resourceRows = lhr.audits['resource-summary']?.details?.items;
  const resourceSummary = Array.isArray(resourceRows)
    ? resourceRows.map((r) => {
        const row = r as { resourceType: string; label: string; requestCount: number; transferSize: number };
        return { type: row.resourceType, label: row.label, requestCount: row.requestCount, transferSize: row.transferSize };
      })
    : [];

  const screenshot = lhr.audits['final-screenshot']?.details?.data;

  return {
    formFactor: lhr.configSettings.formFactor,
    source,
    lighthouseVersion: lhr.lighthouseVersion,
    fetchTime: lhr.fetchTime,
    finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? '',
    scores: {
      performance: toPercent(lhr.categories.performance?.score),
      accessibility: toPercent(lhr.categories.accessibility?.score),
      bestPractices: toPercent(lhr.categories['best-practices']?.score),
      seo: toPercent(lhr.categories.seo?.score),
    },
    metrics,
    audits,
    resourceSummary,
    screenshot: typeof screenshot === 'string' ? screenshot : undefined,
  };
}

// ------------------------------------------------------------------ CrUX field data (from PSI)

export interface RawLoadingExperience {
  id?: string;
  overall_category?: string;
  metrics?: Record<string, { percentile: number; category: string }>;
}

const FIELD_METRICS: Array<{ id: FieldMetric['id']; key: string; label: string; unit: FieldMetric['unit']; scale?: number }> = [
  { id: 'lcp', key: 'LARGEST_CONTENTFUL_PAINT_MS', label: 'Largest Contentful Paint', unit: 'ms' },
  { id: 'inp', key: 'INTERACTION_TO_NEXT_PAINT', label: 'Interaction to Next Paint', unit: 'ms' },
  { id: 'cls', key: 'CUMULATIVE_LAYOUT_SHIFT_SCORE', label: 'Cumulative Layout Shift', unit: 'unitless', scale: 100 },
  { id: 'fcp', key: 'FIRST_CONTENTFUL_PAINT_MS', label: 'First Contentful Paint', unit: 'ms' },
  { id: 'ttfb', key: 'EXPERIMENTAL_TIME_TO_FIRST_BYTE', label: 'Time to First Byte', unit: 'ms' },
];

function cruxStatus(category: string | undefined): MetricStatus | null {
  if (category === 'FAST') return 'good';
  if (category === 'AVERAGE') return 'needs-improvement';
  if (category === 'SLOW') return 'poor';
  return null;
}

/** Prefers page-level CrUX data and falls back to origin-level data. */
export function normaliseFieldData(
  page: RawLoadingExperience | undefined,
  origin: RawLoadingExperience | undefined,
): FieldData | null {
  const pick = (exp: RawLoadingExperience | undefined, scope: FieldData['scope']): FieldData | null => {
    const metrics = FIELD_METRICS.flatMap(({ id, key, label, unit, scale }) => {
      const m = exp?.metrics?.[key];
      const status = cruxStatus(m?.category);
      if (!m || status === null) return [];
      return [{ id, label, unit, p75: scale ? m.percentile / scale : m.percentile, status }];
    });
    return metrics.length ? { scope, overall: cruxStatus(exp?.overall_category), metrics } : null;
  };
  return pick(page, 'url') ?? pick(origin, 'origin');
}
