import { scoreStatus, STATUS_LABEL } from '../lib/format';

/** Circular meter for a 0-100 score. The fill colour carries the status; the number and label carry it too. */
export function ScoreRing({ score, label, size = 72 }: { score: number | null; label: string; size?: number }) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const status = score === null ? null : scoreStatus(score);
  return (
    <div className="score-ring" style={{ width: size }}>
      <svg
        viewBox="0 0 36 36"
        width={size}
        height={size}
        role="img"
        aria-label={`${label}: ${score ?? 'not available'}${status ? ` (${STATUS_LABEL[status]})` : ''}`}
      >
        <circle cx="18" cy="18" r={r} className="score-ring-track" />
        {score !== null && (
          <circle
            cx="18"
            cy="18"
            r={r}
            className={`score-ring-fill score-${status}`}
            strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
            transform="rotate(-90 18 18)"
          />
        )}
        <text x="18" y="18" className="score-ring-value" dominantBaseline="central" textAnchor="middle">
          {score ?? '–'}
        </text>
      </svg>
      <span className="score-ring-label">{label}</span>
    </div>
  );
}
