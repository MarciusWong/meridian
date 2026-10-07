import { useEffect, useState } from 'react';
import type { Report } from '../../shared/types';
import { FixList } from '../components/FixList';
import { GlobalSection } from '../components/GlobalSection';
import { Icon } from '../components/Icon';
import { Overview } from '../components/Overview';
import { TechDetails, WebPageTestTable } from '../components/TechDetails';
import { TimingChart } from '../components/TimingChart';
import { VitalsPanel } from '../components/VitalsPanel';
import { WorldMap, type MapMarker } from '../components/WorldMap';
import { api, ApiError, type AppConfig } from '../lib/api';
import { displayUrl, formatDate } from '../lib/format';

const POLL_MS = 1500;

function useReport(id: string) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await api.report(id);
        if (cancelled) return;
        setReport(next);
        setError(null);
        if (next.status === 'running') timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setError({ message: (err as Error).message, notFound });
        // Keep polling through transient network errors while a test is running.
        if (!notFound) timer = setTimeout(load, POLL_MS * 2);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  return { report, error };
}

function useElapsed(since: string | undefined, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return since ? Math.max(0, Math.round((now - new Date(since).getTime()) / 1000)) : 0;
}

export function ReportPage({ id, config, navigate }: { id: string; config: AppConfig; navigate: (path: string) => void }) {
  const { report, error } = useReport(id);
  const running = report?.status === 'running';
  const elapsed = useElapsed(report?.createdAt, running);

  useEffect(() => {
    if (report) document.title = `${displayUrl(report.url)} — Meridian`;
    return () => {
      document.title = 'Meridian — global page speed';
    };
  }, [report]);

  if (error?.notFound) {
    return (
      <main className="container page-message">
        <h1>Report not found</h1>
        <p>It may have been removed from this server.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Run a new test</button>
      </main>
    );
  }
  if (!report) return <div className="page-loading" aria-busy="true" />;

  const rerun = async () => {
    try {
      const { id: next } = await api.createTest({ url: report.url, locations: report.locations.map((l) => l.id) });
      navigate(`/report/${next}`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-${displayUrl(report.url).replace(/[^a-z0-9]+/gi, '-')}-${report.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="report">
      <header className="report-head container">
        <div className="eyebrow">{running ? 'Testing' : report.status === 'failed' ? 'Test failed' : 'Speed report'}</div>
        <h1 className="report-url">
          <a href={report.url} target="_blank" rel="noreferrer">
            {displayUrl(report.url)}
            <Icon name="external" />
          </a>
        </h1>
        <div className="report-meta">
          <span>{formatDate(report.createdAt)}</span>
          <span>{report.locations.length} locations</span>
          {report.lighthouse.mobile && <span>Lighthouse {report.lighthouse.mobile.lighthouseVersion}</span>}
          {!running && (
            <span className="report-actions no-print">
              <button type="button" className="btn btn-sm" onClick={rerun}>
                <Icon name="refresh" /> Run again
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={exportJson}>
                <Icon name="download" /> JSON
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.print()}>
                <Icon name="printer" /> Print
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="container">
        {error && !error.notFound && <p className="notice notice-warn" role="status">Connection problem: {error.message}. Retrying…</p>}
        {running ? <Progress report={report} elapsed={elapsed} /> : <Results report={report} config={config} />}
      </div>
    </main>
  );
}

function Progress({ report, elapsed }: { report: Report; elapsed: number }) {
  const markers: MapMarker[] = report.locations.map((location) => ({
    location,
    state: 'pending',
    ariaLabel: `${location.city}: waiting for result`,
  }));
  const done = report.steps.filter((s) => s.status === 'done' || s.status === 'skipped' || s.status === 'failed').length;
  return (
    <div className="progress-grid">
      <div className="card card-pad progress-steps" aria-live="polite">
        <div className="progress-head">
          <div className="eyebrow">Running · {elapsed}s</div>
          <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={report.steps.length} aria-valuenow={done}>
            <span style={{ width: `${(done / report.steps.length) * 100}%` }} />
          </div>
        </div>
        <ol>
          {report.steps.map((step) => (
            <li key={step.id} className={`step step-${step.status}`}>
              <span className="step-icon" aria-hidden="true">
                {step.status === 'done' && <Icon name="good" />}
                {step.status === 'failed' && <Icon name="fail" />}
                {step.status === 'running' && <span className="spinner" />}
                {step.status === 'pending' && <span className="step-dot" />}
                {step.status === 'skipped' && <span className="step-dot step-dot-dashed" />}
              </span>
              <span>
                <span className="step-label">{step.label}</span>
                <span className="step-detail">
                  {step.status === 'skipped' ? 'Skipped' : step.detail ?? (step.status === 'pending' ? 'Waiting' : step.status === 'done' ? 'Done' : '')}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="progress-note">A full test usually takes 1–2 minutes. You can leave this page and come back — the report link stays valid.</p>
      </div>
      <div className="card card-pad">
        <WorldMap markers={markers} caption="Locations being tested" />
      </div>
    </div>
  );
}

function Results({ report, config }: { report: Report; config: AppConfig }) {
  return (
    <>
      {report.errors.length > 0 && (
        <details className="notice notice-warn">
          <summary>
            {report.errors.length} note{report.errors.length > 1 ? 's' : ''} about this test — some data may be missing
          </summary>
          <ul>
            {report.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}
      {report.status === 'failed' && !report.scores ? (
        <div className="card card-pad page-message">
          <h2>We couldn’t test this page</h2>
          <p>None of the measurements succeeded. Check that the URL is publicly reachable and try again.</p>
        </div>
      ) : (
        <>
          <Overview report={report} config={config} />
          <nav className="report-nav no-print" aria-label="Report sections">
            {report.network && <a href="#global">Global</a>}
            <a href="#fixes">Fixes</a>
            {report.network && <a href="#timing">Timing</a>}
            {(report.lighthouse.mobile || report.lighthouse.desktop) && <a href="#vitals">Web Vitals</a>}
            {report.webpagetest?.length ? <a href="#webpagetest">WebPageTest</a> : null}
            <a href="#details">Details</a>
          </nav>
          {report.network && <GlobalSection report={report} config={config} />}
          <FixList report={report} />
          {report.network && <TimingChart report={report} />}
          <VitalsPanel report={report} />
          <WebPageTestTable report={report} />
          <TechDetails report={report} />
        </>
      )}
      <footer className="report-foot">
        Measurements by Globalping{report.lighthouse.mobile ? `, ${report.lighthouse.mobile.source}` : ''} and the Meridian page inspector.
      </footer>
    </>
  );
}
