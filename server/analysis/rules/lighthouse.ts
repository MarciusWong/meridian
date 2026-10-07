// Findings from Lighthouse lab audits (mobile first, desktop as supporting evidence).

import type { LighthouseAudit, LighthouseSummary, Severity } from '../../../shared/types';
import { AUDIT_GUIDE } from '../auditGuide';
import { formatBytes, formatMs, type Finding, type Rule } from './types';

/** Severity from the audit's estimated savings. */
export function auditSeverity(audit: LighthouseAudit): Severity {
  const paint = audit.savingsMs ?? 0;
  const tbt = audit.metricSavings?.TBT ?? 0;
  const cls = audit.metricSavings?.CLS ?? 0;
  const bytes = audit.savingsBytes ?? 0;
  if (paint >= 2000 || tbt >= 600 || cls >= 0.25) return 'critical';
  if (paint >= 800 || tbt >= 250 || cls >= 0.1 || bytes >= 1_000_000) return 'high';
  if (paint >= 200 || tbt >= 50 || cls >= 0.05 || bytes >= 100_000 || (audit.score ?? 1) < 0.5) return 'medium';
  return 'low';
}

function evidenceFor(audit: LighthouseAudit, formFactor: LighthouseSummary['formFactor']): string[] {
  const parts: string[] = [];
  const savings = [
    audit.savingsMs ? `~${formatMs(audit.savingsMs)} faster paint` : null,
    audit.metricSavings?.TBT ? `~${formatMs(audit.metricSavings.TBT)} less blocking time` : null,
    audit.metricSavings?.CLS ? `${audit.metricSavings.CLS.toFixed(2)} less layout shift` : null,
    audit.savingsBytes ? `${formatBytes(audit.savingsBytes)} smaller` : null,
  ].filter(Boolean);
  const label = formFactor === 'mobile' ? 'Mobile' : 'Desktop';
  parts.push(
    `${label} Lighthouse: ${audit.displayValue ?? audit.title}${savings.length ? ` — potential ${savings.join(', ')}` : ''}`,
  );
  return [...parts, ...audit.items];
}

function toFinding(audit: LighthouseAudit, summary: LighthouseSummary): Finding {
  const guide = AUDIT_GUIDE[audit.id];
  const tbt = audit.metricSavings?.TBT;
  const impactMs = Math.max(audit.savingsMs ?? 0, tbt ?? 0) || undefined;
  return {
    id: guide?.key ?? audit.id,
    title: guide?.title ?? audit.title,
    severity: auditSeverity(audit),
    category: guide?.category ?? 'Rendering',
    summary: audit.description.replace(/\s*Learn (more|how).*$/i, '').trim(),
    evidence: evidenceFor(audit, summary.formFactor),
    fixes: guide?.fixes.length ? guide.fixes : ['Follow the guidance in the Lighthouse documentation for this audit.'],
    impactMs,
    impactBytes: audit.savingsBytes,
    sources: [summary.source === 'PageSpeed Insights' ? 'PageSpeed Insights' : 'Lighthouse'],
    learnMoreUrl: audit.learnMoreUrl,
  };
}

export const lighthouseRule: Rule = ({ mobile, desktop }) => {
  const findings: Finding[] = [];
  for (const summary of [mobile, desktop]) {
    if (!summary) continue;
    for (const audit of summary.audits) findings.push(toFinding(audit, summary));
  }
  return findings;
};
