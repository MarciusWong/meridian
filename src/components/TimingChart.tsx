import { useMemo, useState } from 'react';
import type { HttpTimings, Report } from '../../shared/types';
import { formatMs } from '../lib/format';
import { anchorOf, Tooltip, useTooltip } from './Tooltip';
import './TimingChart.css';

const SEGMENTS: Array<{ key: keyof HttpTimings; label: string; color: string }> = [
  { key: 'dns', label: 'DNS', color: 'var(--s1)' },
  { key: 'tcp', label: 'Connect', color: 'var(--s2)' },
  { key: 'tls', label: 'TLS', color: 'var(--s3)' },
  { key: 'firstByte', label: 'Server wait', color: 'var(--s4)' },
  { key: 'download', label: 'Download', color: 'var(--s5)' },
];

/** A "nice" axis step (1, 2, 2.5 or 5 × 10^n) giving about `target` ticks. */
export function niceStep(max: number, target = 4): number {
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const normalised = raw / magnitude;
  const nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function TimingChart({ report }: { report: Report }) {
  const [run, setRun] = useState<'warm' | 'cold'>('cold');
  const tooltip = useTooltip();

  const rows = useMemo(() => {
    const cityOf = new Map(report.locations.map((l) => [l.id, l]));
    return (report.network?.locations ?? [])
      .map((r) => {
        const probe = run === 'warm' ? r.warm ?? r.cold : r.cold;
        if (!probe || probe.error || r.status === 'no-probe') return null;
        const parts = SEGMENTS.map((s) => ({ ...s, value: Math.max(0, probe.timings[s.key] ?? 0) }));
        const total = parts.reduce((sum, p) => sum + p.value, 0);
        return { id: r.locationId, city: cityOf.get(r.locationId)?.city ?? r.locationId, parts, total, cache: probe.cacheStatus };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.total > 0)
      .sort((a, b) => a.total - b.total);
  }, [report, run]);

  if (rows.length === 0) return null;

  const maxTotal = Math.max(...rows.map((r) => r.total));
  const step = niceStep(maxTotal);
  const axisMax = Math.ceil(maxTotal / step) * step;
  const ticks = Array.from({ length: Math.round(axisMax / step) + 1 }, (_, i) => i * step);

  const tooltipFor = (row: (typeof rows)[number]) => (
    <>
      <div className="tooltip-title">{row.city}</div>
      {row.parts.map((p) => (
        <div className="tooltip-row" key={p.key}>
          <span><span className="key" style={{ background: p.color }} /> {p.label}</span>
          <strong>{formatMs(p.value)}</strong>
        </div>
      ))}
      <div className="tooltip-row tooltip-total">Total <strong>{formatMs(row.total)}</strong></div>
      {row.cache && <div className="tooltip-row">CDN cache <strong>{row.cache}</strong></div>}
    </>
  );

  return (
    <section className="section" id="timing" aria-labelledby="timing-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Where the time goes</div>
          <h2 id="timing-title">Request timing breakdown</h2>
          <p>
            Each bar is one request for the HTML from that city. The cold request is a first visit; the warm one repeats it from the
            same probe, so DNS and CDN caches are populated.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Request">
          <button type="button" aria-pressed={run === 'cold'} onClick={() => setRun('cold')}>
            Cold
          </button>
          <button type="button" aria-pressed={run === 'warm'} onClick={() => setRun('warm')}>
            Warm
          </button>
        </div>
      </div>

      <div className="card card-pad timing">
        <ul className="timing-legend" aria-label="Legend">
          {SEGMENTS.map((s) => (
            <li key={s.key}>
              <span className="key" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>

        <div className="timing-plot">
          <div className="timing-grid" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: `${(t / axisMax) * 100}%` }}>
                <em>{formatMs(t)}</em>
              </span>
            ))}
          </div>
          <ol className="timing-rows">
            {rows.map((row) => (
              <li
                key={row.id}
                className="timing-row"
                tabIndex={0}
                aria-label={`${row.city}: ${row.parts.map((p) => `${p.label} ${formatMs(p.value)}`).join(', ')}; total ${formatMs(row.total)}`}
                onPointerMove={(e) => tooltip.show(e.clientX, e.clientY, tooltipFor(row))}
                onPointerLeave={tooltip.hide}
                onFocus={(e) => { const a = anchorOf(e.currentTarget); tooltip.show(a.x, a.y, tooltipFor(row)); }}
                onBlur={tooltip.hide}
              >
                <span className="timing-city">{row.city}</span>
                <span className="timing-track">
                  <span className="timing-bar" style={{ width: `${(row.total / axisMax) * 100}%` }}>
                    {row.parts
                      .filter((p) => p.value > 0)
                      .map((p) => (
                        <span key={p.key} className="timing-seg" style={{ flexGrow: p.value, background: p.color }} />
                      ))}
                  </span>
                  <span className="timing-total tabular">{formatMs(row.total)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Tooltip state={tooltip.state} />
    </section>
  );
}
