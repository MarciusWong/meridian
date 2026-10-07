export const REPO_URL = 'https://github.com/MarciusWong/meridian';

export function SiteFooter() {
  return (
    <footer className="site-footer no-print">
      <div className="container site-footer-inner">
        <span>
          Meridian is free and open source. Measurements by{' '}
          <a href="https://globalping.io" target="_blank" rel="noreferrer">
            Globalping
          </a>
          ,{' '}
          <a href="https://github.com/GoogleChrome/lighthouse" target="_blank" rel="noreferrer">
            Lighthouse
          </a>{' '}
          and{' '}
          <a href="https://developers.google.com/speed/docs/insights/v5/about" target="_blank" rel="noreferrer">
            PageSpeed Insights
          </a>
          .
        </span>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="site-footer-repo">
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}
