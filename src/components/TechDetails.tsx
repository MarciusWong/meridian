import type { Report } from '../../shared/types';
import { formatBytes, formatDate, formatMs } from '../lib/format';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tech-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const yesNo = (v: boolean | null | undefined, yes = 'Yes', no = 'No') => (v === null || v === undefined ? '—' : v ? yes : no);

export function TechDetails({ report }: { report: Report }) {
  const i = report.inspection;
  const tls = report.network?.locations.find((l) => l.tls)?.tls ?? null;
  const html = i?.html;
  if (!i && !tls) return null;

  return (
    <section className="section" id="details" aria-labelledby="details-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Under the hood</div>
          <h2 id="details-title">Technical details</h2>
        </div>
      </div>
      <div className="tech-grid">
        {i && (
          <div className="card card-pad">
            <h3 className="tech-title">Delivery</h3>
            <dl className="tech-list">
              <Row label="Final URL">
                <span className="mono">{i.finalUrl}</span>
              </Row>
              <Row label="Status">{i.status}</Row>
              <Row label="Redirects">
                {i.redirects.length === 0 ? 'None' : i.redirects.map((r) => `${r.status} ${r.url}`).join(' → ')}
              </Row>
              <Row label="CDN">{i.cdn ?? 'None detected'}</Row>
              <Row label="Server">{i.server ?? '—'}</Row>
              <Row label="Protocol">
                {i.httpVersion === 'h2' ? 'HTTP/2' : i.httpVersion === 'http/1.1' ? 'HTTP/1.1' : 'Unknown'}
                {i.supportsHttp3 ? ' · HTTP/3 advertised' : ''}
              </Row>
              <Row label="Compression">
                {i.compression ?? 'None'}
                {i.supportsBrotli ? ' · Brotli supported' : ''}
              </Row>
              <Row label="Cache-Control">
                <span className="mono">{i.cacheControl ?? '—'}</span>
              </Row>
              <Row label="HSTS">{yesNo(i.hsts)}</Row>
              <Row label="From test server">
                first byte {formatMs(i.ttfbMs)} · complete {formatMs(i.totalMs)}
              </Row>
            </dl>
          </div>
        )}
        <div className="card card-pad">
          {tls && (
            <>
              <h3 className="tech-title">TLS certificate</h3>
              <dl className="tech-list">
                <Row label="Protocol">{tls.protocol ?? '—'}</Row>
                <Row label="Cipher">
                  <span className="mono">{tls.cipher ?? '—'}</span>
                </Row>
                <Row label="Issuer">{tls.issuer ?? '—'}</Row>
                <Row label="Expires">{tls.expiresAt ? formatDate(tls.expiresAt) : '—'}</Row>
                <Row label="Trusted">{yesNo(tls.authorized)}</Row>
              </dl>
            </>
          )}
          {html && (
            <>
              <h3 className="tech-title tech-title-spaced">HTML document</h3>
              <dl className="tech-list">
                <Row label="Title">{html.title ?? '—'}</Row>
                <Row label="Size (uncompressed)">{formatBytes(html.bytes)}</Row>
                <Row label="Scripts / stylesheets">
                  {html.scripts} / {html.stylesheets}
                </Row>
                <Row label="Render-blocking scripts">{html.renderBlockingScripts.length}</Row>
                <Row label="Images">
                  {html.images} ({html.imagesWithoutDimensions} unsized, {html.legacyImageFormats} legacy format)
                </Row>
                <Row label="Third-party origins">{html.thirdPartyOrigins.length}</Row>
                <Row label="Preconnect / preload">
                  {html.preconnectOrigins.length} / {html.preloads}
                </Row>
              </dl>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function WebPageTestTable({ report }: { report: Report }) {
  const runs = report.webpagetest;
  if (!runs?.length) return null;
  const cityOf = (id: string) => report.locations.find((l) => l.id === id)?.city ?? id;
  return (
    <section className="section" id="webpagetest" aria-labelledby="wpt-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Real browsers</div>
          <h2 id="wpt-title">WebPageTest page loads</h2>
          <p>Full page loads in Chrome from WebPageTest locations near the selected cities.</p>
        </div>
      </div>
      <div className="card card-pad table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>City</th>
              <th className="num">TTFB</th>
              <th className="num">FCP</th>
              <th className="num">LCP</th>
              <th className="num">Speed Index</th>
              <th className="num">Fully loaded</th>
              <th className="num">Bytes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.locationId}>
                <td>{cityOf(r.locationId)}</td>
                {r.error ? (
                  <td colSpan={6}>{r.error}</td>
                ) : (
                  <>
                    <td className="num">{formatMs(r.ttfb)}</td>
                    <td className="num">{formatMs(r.fcp)}</td>
                    <td className="num">{formatMs(r.lcp)}</td>
                    <td className="num">{formatMs(r.speedIndex)}</td>
                    <td className="num">{formatMs(r.fullyLoaded)}</td>
                    <td className="num">{formatBytes(r.bytesIn)}</td>
                  </>
                )}
                <td>
                  {r.testUrl && (
                    <a href={r.testUrl} target="_blank" rel="noreferrer">
                      Details<span className="sr-only"> for {cityOf(r.locationId)}</span>
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
