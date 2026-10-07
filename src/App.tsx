import { lazy, Suspense, useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteFooter } from './components/SiteFooter';
import { TopBar } from './components/TopBar';
import { api, type AppConfig } from './lib/api';
import { useRoute } from './lib/router';

// Each page loads only the code it needs.
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));

export function App() {
  const [route, navigate] = useRoute();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <>
      <TopBar navigate={navigate} />
      <div className="app-body">
        <ErrorBoundary key={route.name === 'report' ? route.id : route.name}>
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
            {error && (
              <main className="container page-message">
                <h1>Can’t reach the server</h1>
                <p>{error}</p>
              </main>
            )}
            {!error && !config && <div className="page-loading" aria-busy="true" />}
            {config && route.name === 'home' && <HomePage config={config} navigate={navigate} />}
            {config && route.name === 'report' && <ReportPage key={route.id} id={route.id} config={config} navigate={navigate} />}
            {config && route.name === 'not-found' && (
              <main className="container page-message">
                <h1>Page not found</h1>
                <p>
                  <a
                    href="/"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/');
                    }}
                  >
                    Run a new test
                  </a>
                </p>
              </main>
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
      <SiteFooter />
    </>
  );
}
