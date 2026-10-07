import { useEffect, useState, type FormEvent } from 'react';
import type { ReportListItem } from '../../shared/types';
import { Icon, type IconName } from '../components/Icon';
import { LocationPicker } from '../components/LocationPicker';
import { api, type AppConfig } from '../lib/api';
import { clearHistory, readHistory } from '../lib/history';
import { displayUrl, relativeTime } from '../lib/format';
import './HomePage.css';

const MAX_LOCATIONS = 30;

const SOURCES: Array<{ icon: IconName; name: string; what: string }> = [
  {
    icon: 'globe',
    name: 'Globalping',
    what: 'Real HTTP requests from probes in every selected city: DNS, connect, TLS, first byte, CDN cache status and network round-trip time.',
  },
  {
    icon: 'bolt',
    name: 'Lighthouse',
    what: 'A full lab audit in headless Chrome on mobile and desktop: Core Web Vitals, render-blocking resources, JavaScript, images and more.',
  },
  {
    icon: 'chart',
    name: 'PageSpeed Insights + CrUX',
    what: 'With a free Google API key, Lighthouse runs on Google’s infrastructure and adds 28 days of real-user data from Chrome.',
  },
  {
    icon: 'server',
    name: 'Page inspector',
    what: 'Fetches the page directly to check redirects, compression, HTTP/2 and HTTP/3, caching headers, CDN and HTML structure.',
  },
];

export function HomePage({ config, navigate }: { config: AppConfig; navigate: (path: string) => void }) {
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState(() => new Set(config.locations.filter((l) => l.defaultSelected).map((l) => l.id)));
  const [lighthouse, setLighthouse] = useState(config.capabilities.lighthouseMode !== 'off');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<ReportListItem[]>([]);

  const sharedHistory = config.capabilities.publicHistory;
  useEffect(() => {
    if (sharedHistory)
      api
        .reports()
        .then(setRecent)
        .catch(() => setRecent(readHistory()));
    else setRecent(readHistory());
  }, [sharedHistory]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { id } = await api.createTest({ url, locations: [...selected], lighthouse });
      navigate(`/report/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  const lighthouseAvailable = config.capabilities.lighthouseMode !== 'off';

  return (
    <main className="home">
      <section className="hero container">
        <div className="eyebrow hero-eyebrow">
          <span className="hero-live" aria-hidden="true" />
          {config.locations.length} cities · 7 regions · open tools
        </div>
        <h1 className="hero-title">
          How fast is your site, <em>everywhere?</em>
        </h1>
        <p className="hero-lede">
          Load your page from London, Frankfurt, Sydney, São Paulo, Tokyo and more — then get a ranked list of exactly what to
          fix, most critical first.
        </p>

        <form className="url-form" onSubmit={submit} noValidate>
          <label htmlFor="url" className="sr-only">
            Website URL
          </label>
          <Icon name="globe" className="url-form-icon" />
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'url-error' : undefined}
            required
          />
          <button type="submit" className="btn btn-primary url-form-submit" disabled={submitting || !url.trim()}>
            {submitting ? 'Starting…' : 'Run test'}
            <Icon name="arrowRight" />
          </button>
        </form>
        {error && (
          <p id="url-error" className="form-error" role="alert">
            <Icon name="critical" /> {error}
          </p>
        )}

        <div className="hero-options">
          <label className={`toggle ${lighthouseAvailable ? '' : 'toggle-disabled'}`}>
            <input
              type="checkbox"
              checked={lighthouse && lighthouseAvailable}
              disabled={!lighthouseAvailable}
              onChange={(e) => setLighthouse(e.target.checked)}
            />
            <span className="toggle-track" aria-hidden="true" />
            Include Lighthouse audit <span className="hero-option-note">adds ~1 minute</span>
          </label>
          {config.capabilities.psiKey && (
            <span className="hero-option-note">Includes real-user data from the Chrome UX Report</span>
          )}
        </div>
      </section>

      <section className="container home-section">
        <div className="card card-pad">
          <LocationPicker config={config} selected={selected} onChange={setSelected} max={MAX_LOCATIONS} />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="container home-section">
          <div className="section-head">
            <div>
              <div className="eyebrow">History</div>
              <h2>{sharedHistory ? 'Recent reports' : 'Your recent reports'}</h2>
              {!sharedHistory && <p>Stored only in this browser.</p>}
            </div>
            {!sharedHistory && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  clearHistory();
                  setRecent([]);
                }}
              >
                Clear history
              </button>
            )}
          </div>
          <ul className="recent card">
            {recent.slice(0, 8).map((r) => (
              <li key={r.id}>
                <a
                  href={`/report/${r.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/report/${r.id}`);
                  }}
                >
                  <span className={`recent-grade grade-${r.grade ?? 'none'}`}>{r.grade ?? '–'}</span>
                  <span className="recent-url mono">{displayUrl(r.url)}</span>
                  <span className="recent-meta">
                    {r.status === 'failed' ? 'Failed · ' : r.status === 'running' ? 'Running · ' : ''}
                    {relativeTime(r.createdAt)}
                  </span>
                  <Icon name="arrowRight" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container home-section">
        <div className="section-head">
          <div>
            <div className="eyebrow">How it works</div>
            <h2>Four free and open tools, one report</h2>
            <p>
              Each test combines independent measurements, then cross-checks them to rank fixes by how much time they save and how
              many visitors they affect.
            </p>
          </div>
        </div>
        <div className="sources">
          {SOURCES.map((s) => (
            <article key={s.name} className="source card card-pad">
              <Icon name={s.icon} className="source-icon" />
              <h3>{s.name}</h3>
              <p>{s.what}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
