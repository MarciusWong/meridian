// Runs every rule, merges duplicate findings and ranks them by criticality.

import type { Recommendation, Severity } from '../../shared/types';
import { fieldRule } from './rules/field';
import { lighthouseRule } from './rules/lighthouse';
import { networkRules } from './rules/network';
import { pageRules } from './rules/page';
import type { AnalysisInput, Finding, Rule } from './rules/types';

export type { AnalysisInput } from './rules/types';

const RULES: Rule[] = [...networkRules, ...pageRules, fieldRule, lighthouseRule];

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const GENERIC_FIX = 'Follow the guidance in the Lighthouse documentation for this audit.';

function isLighthouseOnly(f: Finding): boolean {
  return f.sources.every((s) => s === 'Lighthouse' || s === 'PageSpeed Insights');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function maxDefined(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((v): v is number => typeof v === 'number');
  return defined.length ? Math.max(...defined) : undefined;
}

/** Combines findings about the same problem. Hand-written rules win over Lighthouse text for wording and fixes. */
function merge(group: Finding[]): Finding {
  const primary = group.find((f) => !isLighthouseOnly(f)) ?? group[0];
  const withFixes = [primary, ...group].find((f) => f.fixes.length > 0 && f.fixes[0] !== GENERIC_FIX) ?? primary;
  const severity = group.reduce<Severity>((best, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[best] ? f.severity : best), 'low');
  const locations = unique(group.flatMap((f) => f.locations ?? []));
  return {
    ...primary,
    severity,
    evidence: unique(group.flatMap((f) => f.evidence)),
    fixes: withFixes.fixes,
    impactMs: maxDefined(group.map((f) => f.impactMs)),
    impactBytes: maxDefined(group.map((f) => f.impactBytes)),
    locations: locations.length ? locations : undefined,
    sources: unique(group.flatMap((f) => f.sources)),
    learnMoreUrl: group.find((f) => f.learnMoreUrl)?.learnMoreUrl,
  };
}

/**
 * Ranking within a severity tier: estimated time saved dominates, then bytes
 * saved, then how many locations are affected. Capped so tiers never overlap.
 */
function priorityOf(f: Finding): number {
  const within = (f.impactMs ?? 0) / 10 + (f.impactBytes ?? 0) / 20_000 + (f.locations?.length ?? 0) * 15;
  return SEVERITY_RANK[f.severity] * 1000 + Math.min(999, Math.round(within));
}

export function buildRecommendations(input: AnalysisInput): Recommendation[] {
  const groups = new Map<string, Finding[]>();
  for (const rule of RULES) {
    for (const finding of rule(input)) {
      groups.set(finding.id, [...(groups.get(finding.id) ?? []), finding]);
    }
  }
  return [...groups.values()]
    .map(merge)
    .map((f) => ({ ...f, priority: priorityOf(f) }))
    .sort((a, b) => b.priority - a.priority);
}
