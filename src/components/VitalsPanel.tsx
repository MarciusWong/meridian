import { useState } from 'react';
import { metricStatus, THRESHOLDS } from '../../shared/metrics';
import type { FormFactor, LighthouseSummary, MetricStatus, Report } from '../../shared/types';
import { formatMetric } from '../lib/format';
import { StatusBadge } from './Badges';
import { ScoreRing } from './ScoreRing';

const DESCRIPTIONS: Record<string, string> = {
  fcp: 'First text or image painted',
  lcp: 'Main content visible',
  tbt: 'Main thread blocked by long tasks',
  cls: 'Unexpected layout movement',
  si: 'How quickly content fills the screen',
  ttfb: 'Server response for the document',
  inp: 'Responsiveness to input',
};

/** Where a value sits across the good / needs-work / poor bands. */
function ThresholdTrack({ id, value }: { id: string; value: number }) {
  const [good, ni] = THRESHOLDS[id] ?? [1, 2];
  const max = ni * 1.5;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="threshold" aria-hidden="true">
      <span className="threshold-band threshold-good" style={{ width: pct(good) }} />
      <span className="threshold-band threshold-ni" style={{ width: `calc(${pct(ni)} - ${pct(good)})` }} />
      <span className="threshold-band threshold-poor" />
      <span className="threshold-marker" style={{ left: pct(value) }} />
    </div>
  );
}

function MetricTile({
  id,
  label,
  value,
  unit,
  status,
}: {
  id: string;
  label: string;
  value: number;
  unit: 'ms' | 'unitless';
  status: MetricStatus;
}) {
  return (
    <div className="metric card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{formatMetric(value, unit)}</div>
      <ThresholdTrack id={id} value={value} />
      <div className="metric-foot">
        <StatusBadge status={status} />
        <span className="metric-desc">{DESCRIPTIONS[id]}</span>
      </div>
    </div>
  );
}

export function VitalsPanel({ report }: { report: Report }) {
  const available = (['mobile', 'desktop'] as FormFactor[]).filter((f) => report.lighthouse[f]);
  const [formFactor, setFormFactor] = useState<FormFactor>(available[0] ?? 'mobile');
  const summary: LighthouseSummary | null = report.lighthouse[formFactor];
  if (!summary && !report.field) return null;

  return (
    <section className="section" id="vitals" aria-labelledby="vitals-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Page experience</div>
          <h2 id="vitals-title">Core Web Vitals &amp; Lighthouse</h2>
          <p>
            Lab metrics from a {summary?.source ?? 'Lighthouse'} run with simulated{' '}
            {formFactor === 'mobile' ? 'mid-range phone on a 4G connection' : 'desktop on a fast connection'}.
            {report.field ? ' Real-user data from the Chrome UX Report is shown below.' : ''}
          </p>
        </div>
        {available.length > 1 && (
          <div className="segmented" role="group" aria-label="Device">
            {available.map((f) => (
              <button key={f} type="button" aria-pressed={formFactor === f} onClick={() => setFormFactor(f)}>
                {f === 'mobile' ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>
        )}
      </div>

      {summary && (
        <div className="lighthouse-grid">
          <div className="card card-pad lighthouse-scores">
            <div className="eyebrow">Lighthouse categories</div>
            <div className="lighthouse-rings">
              <ScoreRing score={summary.scores.performance} label="Performance" size={84} />
              <ScoreRing score={summary.scores.accessibility} label="Accessibility" size={84} />
              <ScoreRing score={summary.scores.bestPractices} label="Best practices" size={84} />
              <ScoreRing score={summary.scores.seo} label="SEO" size={84} />
            </div>
            {summary.screenshot && (
              <figure className="lighthouse-shot">
                <img
                  src={summary.screenshot}
                  alt={`Screenshot of the page on ${formFactor}`}
                  width={formFactor === 'mobile' ? 412 : 1350}
                  height={formFactor === 'mobile' ? 823 : 940}
                />
              </figure>
            )}
            <p className="lighthouse-meta">
              {summary.source === 'Lighthouse' ? 'Local headless Chrome' : 'PageSpeed Insights'} · Lighthouse{' '}
              {summary.lighthouseVersion}
            </p>
          </div>
          <div className="metrics-grid">
            {summary.metrics.map((m) => (
              <MetricTile
                key={m.id}
                id={m.id}
                label={m.label}
                value={m.value}
                unit={m.unit}
                status={metricStatus(m.id, m.value)}
              />
            ))}
          </div>
        </div>
      )}

      {report.field && (
        <div className="field">
          <h3 className="field-title">
            Real users{' '}
            <span>
              · Chrome UX Report, 75th percentile, {report.field.scope === 'url' ? 'this page' : 'whole origin'}, last 28 days
            </span>
          </h3>
          <div className="metrics-grid metrics-grid-wide">
            {report.field.metrics.map((m) => (
              <MetricTile key={m.id} id={m.id} label={m.label} value={m.p75} unit={m.unit} status={m.status} />
            ))}
          </div>
        </div>
      )}

      {summary && summary.resourceSummary.length > 0 && <PageWeight summary={summary} />}
    </section>
  );
}

function PageWeight({ summary }: { summary: LighthouseSummary }) {
  const total = summary.resourceSummary.find((r) => r.type === 'total');
  const rows = summary.resourceSummary
    .filter((r) => r.type !== 'total' && r.transferSize > 0)
    .sort((a, b) => b.transferSize - a.transferSize);
  const max = Math.max(1, ...rows.map((r) => r.transferSize));
  const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  return (
    <div className="card card-pad weight">
      <div className="weight-head">
        <div>
          <div className="eyebrow">Page weight by resource type</div>
          {total && (
            <div className="weight-total">
              {kb(total.transferSize)} <span>in {total.requestCount} requests</span>
            </div>
          )}
        </div>
      </div>
      <table className="weight-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.type}>
              <th scope="row">{r.label}</th>
              <td className="weight-bar-cell" aria-hidden="true">
                <span className="weight-bar" style={{ width: `${(r.transferSize / max) * 100}%` }} />
              </td>
              <td className="num">{kb(r.transferSize)}</td>
              <td className="num weight-count">{r.requestCount} req</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
