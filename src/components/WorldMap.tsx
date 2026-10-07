import { geoNaturalEarth1 } from 'd3-geo';
import { useMemo, type KeyboardEvent, type ReactNode } from 'react';
import type { MetricStatus, TestLocation } from '../../shared/types';
import world from '../data/world-dots.json';
import { anchorOf, Tooltip, useTooltip } from './Tooltip';
import './WorldMap.css';

export type MarkerState = MetricStatus | 'failed' | 'pending' | 'selected' | 'unselected';

export interface MapMarker {
  location: TestLocation;
  state: MarkerState;
  /** Short direct label, e.g. "84 ms". Only set for a few markers. */
  label?: string;
  tooltip?: ReactNode;
  ariaLabel: string;
}

const projection = geoNaturalEarth1()
  .scale(world.scale)
  .translate(world.translate as [number, number]);
const DOT_R = 1.7;

// One path for all ~2.5k land dots keeps the DOM small.
const LAND_PATH = world.dots
  .map(([x, y]) => `M${x - DOT_R} ${y}a${DOT_R} ${DOT_R} 0 1 0 ${DOT_R * 2} 0a${DOT_R} ${DOT_R} 0 1 0 ${-DOT_R * 2} 0`)
  .join('');

export function WorldMap({
  markers,
  onToggle,
  caption,
}: {
  markers: MapMarker[];
  onToggle?: (id: string) => void;
  caption?: string;
}) {
  const tooltip = useTooltip();
  const points = useMemo(
    () =>
      markers
        .map((m) => ({ ...m, xy: projection([m.location.lon, m.location.lat]) }))
        .filter((m): m is MapMarker & { xy: [number, number] } => Boolean(m.xy))
        // Draw unselected first so active markers sit on top.
        .sort((a, b) => Number(a.state !== 'unselected') - Number(b.state !== 'unselected')),
    [markers],
  );

  const onKey = (e: KeyboardEvent, id: string) => {
    if (onToggle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onToggle(id);
    }
  };

  return (
    <figure className="world-map">
      <svg viewBox={`0 0 ${world.width} ${world.height}`} role="group" aria-label={caption ?? 'World map of test locations'}>
        <path d={LAND_PATH} className="world-map-land" />
        {points.map((m) => {
          const [x, y] = m.xy;
          const content = m.tooltip;
          return (
            <g
              key={m.location.id}
              className={`marker marker-${m.state}${onToggle ? ' marker-interactive' : ''}`}
              transform={`translate(${x} ${y})`}
              tabIndex={0}
              role={onToggle ? 'button' : 'img'}
              aria-pressed={onToggle ? m.state !== 'unselected' : undefined}
              aria-label={m.ariaLabel}
              onClick={onToggle ? () => onToggle(m.location.id) : undefined}
              onKeyDown={(e) => onKey(e, m.location.id)}
              onPointerMove={content ? (e) => tooltip.show(e.clientX, e.clientY, content) : undefined}
              onPointerLeave={tooltip.hide}
              onFocus={
                content
                  ? (e) => {
                      const a = anchorOf(e.currentTarget);
                      tooltip.show(a.x, a.y, content);
                    }
                  : undefined
              }
              onBlur={tooltip.hide}
            >
              <circle className="marker-hit" r={16} />
              {m.state === 'pending' && <circle className="marker-pulse" r={6} />}
              <circle className="marker-dot" r={m.state === 'unselected' ? 4 : 6} />
              {m.state === 'failed' && <path className="marker-x" d="M-2.5 -2.5L2.5 2.5M2.5 -2.5L-2.5 2.5" />}
              {m.label && (
                <text className="marker-label" x={11} y={4}>
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Tooltip state={tooltip.state} />
    </figure>
  );
}
