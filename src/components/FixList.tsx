import { useMemo, useState } from 'react';
import type { Recommendation, Report, Severity } from '../../shared/types';
import { formatBytes, formatMs, SEVERITY_LABEL, SEVERITY_ORDER } from '../lib/format';
import { recommendationsMarkdown } from '../lib/report';
import { SeverityBadge } from './Badges';
import { Icon } from './Icon';
import './FixList.css';

function FixCard({
  rec,
  rank,
  open,
  onToggle,
  cityOf,
}: {
  rec: Recommendation;
  rank: number;
  open: boolean;
  onToggle: () => void;
  cityOf: (id: string) => string;
}) {
  const bodyId = `fix-${rec.id}`;
  return (
    <li className={`fix fix-${rec.severity}${open ? ' fix-open' : ''}`}>
      <button type="button" className="fix-head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="fix-rank tabular">{String(rank).padStart(2, '0')}</span>
        <span className="fix-main">
          <span className="fix-title">{rec.title}</span>
          <span className="fix-meta">
            <SeverityBadge severity={rec.severity} />
            <span className="fix-category">{rec.category}</span>
            {rec.impactMs ? (
              <span className="pill">
                <Icon name="clock" /> ~{formatMs(rec.impactMs)}
              </span>
            ) : null}
            {rec.impactBytes ? (
              <span className="pill">
                <Icon name="layers" /> {formatBytes(rec.impactBytes)}
              </span>
            ) : null}
            {rec.locations?.length ? (
              <span className="pill">
                <Icon name="globe" /> {rec.locations.length} location{rec.locations.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </span>
        </span>
        <Icon name="chevronDown" className="fix-chevron" />
      </button>
      <div className="fix-body" id={bodyId} hidden={!open}>
        <p className="fix-summary">{rec.summary}</p>
        <div className="fix-columns">
          <div>
            <h3 className="eyebrow">How to fix</h3>
            <ol className="fix-steps">
              {rec.fixes.map((f) => (
                <li key={f}>{renderInlineCode(f)}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="eyebrow">Evidence</h3>
            <ul className="fix-evidence">
              {rec.evidence.slice(0, 8).map((e) => (
                <li key={e} className="mono">
                  {e}
                </li>
              ))}
              {rec.evidence.length > 8 && <li className="fix-more">+ {rec.evidence.length - 8} more</li>}
            </ul>
            {rec.locations?.length ? <p className="fix-locations">Affects: {rec.locations.map(cityOf).join(', ')}</p> : null}
          </div>
        </div>
        <div className="fix-foot">
          <span>Found by {rec.sources.join(' + ')}</span>
          {rec.learnMoreUrl && (
            <a href={rec.learnMoreUrl} target="_blank" rel="noreferrer">
              Learn more<span className="sr-only"> about {rec.title.toLowerCase()}</span> <Icon name="external" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

/** Renders `code` spans from the curated fix text. */
function renderInlineCode(text: string) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
    );
}

export function FixList({ report }: { report: Report }) {
  const recs = report.recommendations;
  const [severities, setSeverities] = useState<Set<Severity>>(new Set(SEVERITY_ORDER));
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set(recs.slice(0, 1).map((r) => r.id)));
  const [copied, setCopied] = useState(false);

  const categories = useMemo(() => [...new Set(recs.map((r) => r.category))].sort(), [recs]);
  const visible = recs.filter((r) => severities.has(r.severity) && (category === 'all' || r.category === category));
  const counts = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, recs.filter((r) => r.severity === s).length])) as Record<
    Severity,
    number
  >;
  const cityOf = (id: string) => report.locations.find((l) => l.id === id)?.city ?? id;

  const toggleSeverity = (s: Severity) => {
    const next = new Set(severities);
    if (next.has(s) && next.size > 1) next.delete(s);
    else next.add(s);
    setSeverities(next);
  };
  const toggleOpen = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const allOpen = visible.length > 0 && visible.every((r) => open.has(r.id));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recommendationsMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="section" id="fixes" aria-labelledby="fixes-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">What to fix</div>
          <h2 id="fixes-title">Prioritised fixes</h2>
          <p>Ordered by criticality, then by estimated time saved and the number of locations affected. Start at the top.</p>
        </div>
        <div className="fix-actions no-print">
          <button type="button" className="btn btn-sm" onClick={copy} disabled={recs.length === 0}>
            {copied ? 'Copied' : 'Copy as checklist'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map((r) => r.id)))}
            disabled={visible.length === 0}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      {recs.length === 0 ? (
        <div className="card card-pad fix-empty">
          <Icon name="good" />
          <div>
            <strong>No problems found.</strong> Every check we ran passed — nice work.
          </div>
        </div>
      ) : (
        <>
          <div className="fix-filters no-print" role="group" aria-label="Filter fixes">
            {SEVERITY_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className="filter-chip"
                aria-pressed={severities.has(s)}
                onClick={() => toggleSeverity(s)}
                disabled={!counts[s]}
              >
                <Icon name={s} className={`filter-icon-${s}`} />
                {SEVERITY_LABEL[s]}
                <span className="tabular filter-count">{counts[s]}</span>
              </button>
            ))}
            <label className="sr-only" htmlFor="fix-category">
              Category
            </label>
            <select id="fix-category" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <ol className="fix-list">
            {visible.map((rec) => (
              <FixCard
                key={rec.id}
                rec={rec}
                rank={recs.indexOf(rec) + 1}
                open={open.has(rec.id)}
                onToggle={() => toggleOpen(rec.id)}
                cityOf={cityOf}
              />
            ))}
          </ol>
          {visible.length === 0 && <p className="fix-none">No fixes match these filters.</p>}
        </>
      )}
    </section>
  );
}
