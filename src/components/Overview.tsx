import type { Report } from '../../shared/types';
import type { AppConfig } from '../lib/api';
import { formatMs, scoreStatus, STATUS_LABEL } from '../lib/format';
import { deliveryVerdict, severityCounts } from '../lib/report';
import { SeverityBadge, StatusBadge } from './Badges';
import { ScoreRing } from './ScoreRing';

const GRADE_TEXT: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Fair',
  D: 'Needs work',
  E: 'Poor',
  F: 'Failing',
};

export function Overview({ report, config }: { report: Report; config: AppConfig }) {
  const scores = report.scores;
  const stats = report.stats;
  const counts = severityCounts(report);
  const regionLabels = Object.fromEntries(config.regions.map((r) => [r.id, r.label])) as Record<string, string>;
  const verdict = deliveryVerdict(report, regionLabels);
  const cityOf = (id: string) => report.locations.find((l) => l.id === id)?.city ?? id;

  return (
    <section className="overview" aria-label="Summary">
      <div className={`grade-card card grade-${scores?.grade ?? 'none'}`}>
        <div className="eyebrow">Overall grade</div>
        <div className="grade-row">
          <span className="grade-letter">{scores?.grade ?? '–'}</span>
          <div>
            <div className="grade-text">{scores ? GRADE_TEXT[scores.grade] : 'No score'}</div>
            <div className="grade-score tabular">{scores?.overall ?? '–'} / 100</div>
          </div>
        </div>
        {verdict && <p className="grade-verdict">{verdict}</p>}
        <p className="grade-note">
          Blend of mobile (45%) and desktop (20%) Lighthouse performance and global first-byte delivery (35%).
        </p>
      </div>

      <div className="overview-tiles">
        <div className="tile card">
          <div className="eyebrow">Scores</div>
          <div className="tile-rings">
            <ScoreRing score={scores?.globalDelivery ?? null} label="Global delivery" />
            <ScoreRing score={scores?.performanceMobile ?? null} label="Mobile" />
            <ScoreRing score={scores?.performanceDesktop ?? null} label="Desktop" />
          </div>
        </div>

        <div className="tile card">
          <div className="eyebrow">Median time to first byte</div>
          <div className="tile-value">{formatMs(stats?.medianTtfb)}</div>
          <dl className="tile-facts">
            <div>
              <dt>Fastest</dt>
              <dd>{stats?.fastest ? `${cityOf(stats.fastest.locationId)} · ${formatMs(stats.fastest.ttfb)}` : '—'}</dd>
            </div>
            <div>
              <dt>Slowest</dt>
              <dd>{stats?.slowest ? `${cityOf(stats.slowest.locationId)} · ${formatMs(stats.slowest.ttfb)}` : '—'}</dd>
            </div>
            <div>
              <dt>90th percentile</dt>
              <dd>{formatMs(stats?.p90Ttfb)}</dd>
            </div>
          </dl>
        </div>

        <div className="tile card">
          <div className="eyebrow">Fixes found</div>
          <div className="tile-value">{report.recommendations.length}</div>
          <div className="tile-badges">
            {(['critical', 'high', 'medium', 'low'] as const).map((s) =>
              counts[s] ? (
                <a key={s} href="#fixes" className="tile-badge-link">
                  <SeverityBadge severity={s} />
                  <span className="tabular">{counts[s]}</span>
                </a>
              ) : null,
            )}
          </div>
          {stats && (
            <div className="tile-foot">
              <StatusBadge
                status={stats.locationsFailed ? 'failed' : 'good'}
                label={
                  stats.locationsFailed
                    ? `${stats.locationsFailed} of ${stats.locationsTested} locations failed`
                    : `All ${stats.locationsTested} locations reachable`
                }
              />
            </div>
          )}
          {!stats && scores?.performanceMobile != null && (
            <div className="tile-foot">
              <StatusBadge
                status={scoreStatus(scores.performanceMobile)}
                label={`Mobile: ${STATUS_LABEL[scoreStatus(scores.performanceMobile)]}`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
