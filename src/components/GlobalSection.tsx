import { useMemo, useState } from 'react';
import type { Report } from '../../shared/types';
import type { AppConfig } from '../lib/api';
import { formatMs } from '../lib/format';
import { locationRows, type LocationRow } from '../lib/report';
import { StatusBadge } from './Badges';
import { Icon } from './Icon';
import { WorldMap, type MapMarker } from './WorldMap';

function MarkerTooltip({ row }: { row: LocationRow }) {
  const r = row.result;
  return (
    <>
      <div className="tooltip-title">
        {row.location.city} <span className="tooltip-sub">· {row.location.covers}</span>
      </div>
      <div className="tooltip-row">
        Status
        {row.state === 'good' || row.state === 'needs-improvement' || row.state === 'poor' || row.state === 'failed' ? (
          <StatusBadge status={row.state} label={row.statusLabel} />
        ) : (
          <strong>{row.statusLabel}</strong>
        )}
      </div>
      {row.ttfb !== null && (
        <>
          <div className="tooltip-row">First byte (warm) <strong>{formatMs(row.ttfb)}</strong></div>
          <div className="tooltip-row">First byte (cold) <strong>{formatMs(r?.cold?.ttfb)}</strong></div>
          <div className="tooltip-row">Round trip <strong>{formatMs(r?.rttMs)}</strong></div>
          {row.run?.cacheStatus && <div className="tooltip-row">CDN cache <strong>{row.run.cacheStatus}</strong></div>}
        </>
      )}
      {r?.error && <div className="tooltip-row tooltip-error">{r.error}</div>}
      {r?.probe && <div className="tooltip-row tooltip-sub">{r.probe.network}</div>}
    </>
  );
}

export function GlobalSection({ report, config }: { report: Report; config: AppConfig }) {
  const [view, setView] = useState<'map' | 'table'>('map');
  const rows = useMemo(() => locationRows(report), [report]);
  const stats = report.stats;
  const labelled = new Set([stats?.fastest?.locationId, stats?.slowest?.locationId].filter(Boolean));

  const markers: MapMarker[] = rows.map((row) => ({
    location: row.location,
    state: row.state,
    label: labelled.has(row.location.id) && row.ttfb !== null ? formatMs(row.ttfb) : undefined,
    ariaLabel: `${row.location.city}: ${row.ttfb !== null ? `${formatMs(row.ttfb)} to first byte, ` : ''}${row.statusLabel}`,
    tooltip: <MarkerTooltip row={row} />,
  }));

  const maxRegion = Math.max(1, ...(stats?.regions.map((r) => r.medianTtfb ?? 0) ?? [1]));
  const regionLabel = (id: string) => config.regions.find((r) => r.id === id)?.label ?? id;

  return (
    <section className="section" id="global" aria-labelledby="global-title">
      <div className="section-head">
        <div>
          <div className="eyebrow">Around the world</div>
          <h2 id="global-title">Time to first byte by location</h2>
          <p>
            How long visitors in each city wait before the first byte of the page arrives — measured by Globalping probes on real
            networks. Fastest and slowest are labelled; hover any city for detail.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
            Map
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Table
          </button>
        </div>
      </div>

      <div className="global-grid">
        <div className="card card-pad global-map">
          {view === 'map' ? (
            <>
              <WorldMap markers={markers} caption="Time to first byte from each test location" />
              <ul className="map-legend" aria-label="Legend">
                <li><span className="legend-dot" style={{ background: 'var(--good)' }} /><Icon name="good" /> Good · ≤ 800 ms</li>
                <li><span className="legend-dot" style={{ background: 'var(--warning)' }} /><Icon name="medium" /> Needs work · ≤ 1.8 s</li>
                <li><span className="legend-dot" style={{ background: 'var(--critical)' }} /><Icon name="critical" /> Poor · &gt; 1.8 s</li>
                <li>
                  <svg className="legend-failed" viewBox="-6 -6 12 12" aria-hidden="true">
                    <circle r="5.5" fill="var(--critical)" />
                    <path d="M-2.2 -2.2L2.2 2.2M2.2 -2.2L-2.2 2.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <Icon name="fail" /> Failed
                </li>
                <li><span className="legend-dot legend-dot-hollow" /> No probe</li>
              </ul>
            </>
          ) : (
            <LocationTable rows={rows} regionLabel={regionLabel} />
          )}
        </div>

        <div className="card card-pad regions">
          <div className="eyebrow">Median by region</div>
          <ul className="region-list">
            {(stats?.regions ?? [])
              .slice()
              .sort((a, b) => (a.medianTtfb ?? Infinity) - (b.medianTtfb ?? Infinity))
              .map((r) => (
                <li key={r.region}>
                  <div className="region-row">
                    <span className="region-name">{regionLabel(r.region)}</span>
                    <span className="region-value tabular">{formatMs(r.medianTtfb)}</span>
                  </div>
                  <div className="region-bar" aria-hidden="true">
                    <span style={{ width: `${((r.medianTtfb ?? 0) / maxRegion) * 100}%` }} />
                  </div>
                  <div className="region-status">
                    {r.status ? <StatusBadge status={r.status} /> : <StatusBadge status="failed" label="No data" />}
                    <span className="region-cities">
                      {rows.filter((row) => row.location.region === r.region).map((row) => row.location.city).join(', ')}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function LocationTable({ rows, regionLabel }: { rows: LocationRow[]; regionLabel: (id: string) => string }) {
  const sorted = [...rows].sort((a, b) => (a.ttfb ?? Infinity) - (b.ttfb ?? Infinity));
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>City</th>
            <th>Region</th>
            <th className="num">First byte</th>
            <th className="num">Cold</th>
            <th className="num">RTT</th>
            <th className="num">DNS</th>
            <th className="num">TLS</th>
            <th>Cache</th>
            <th>Status</th>
            <th>Network</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.location.id}>
              <td>{row.location.city}</td>
              <td>{regionLabel(row.location.region)}</td>
              <td className="num">{formatMs(row.ttfb)}</td>
              <td className="num">{formatMs(row.result?.cold?.ttfb)}</td>
              <td className="num">{formatMs(row.result?.rttMs)}</td>
              <td className="num">{formatMs(row.result?.cold?.timings.dns)}</td>
              <td className="num">{formatMs(row.result?.cold?.timings.tls)}</td>
              <td>{row.run?.cacheStatus ?? '—'}</td>
              <td>{row.statusLabel}</td>
              <td>{row.result?.probe?.network ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
