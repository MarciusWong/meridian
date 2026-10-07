import type { AppConfig } from '../lib/api';
import { WorldMap, type MapMarker } from './WorldMap';
import './LocationPicker.css';

export function LocationPicker({
  config,
  selected,
  onChange,
  max,
}: {
  config: AppConfig;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  max: number;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < max) next.add(id);
    onChange(next);
  };

  const markers: MapMarker[] = config.locations.map((location) => {
    const on = selected.has(location.id);
    return {
      location,
      state: on ? 'selected' : 'unselected',
      ariaLabel: `${location.city} (${location.covers}) — ${on ? 'selected' : 'not selected'}`,
      tooltip: (
        <>
          <div className="tooltip-title">{location.city}</div>
          <div className="tooltip-row">{location.covers}</div>
          <div className="tooltip-row">{on ? 'Selected — click to remove' : 'Click to add'}</div>
        </>
      ),
    };
  });

  const defaults = new Set(config.locations.filter((l) => l.defaultSelected).map((l) => l.id));
  const all = new Set(config.locations.slice(0, max).map((l) => l.id));

  return (
    <div className="picker">
      <div className="picker-head">
        <div>
          <div className="eyebrow">Test locations</div>
          <h2 className="picker-title">
            <span className="tabular">{selected.size}</span> cities selected
          </h2>
        </div>
        <div className="picker-actions">
          <button type="button" className="btn btn-sm" onClick={() => onChange(defaults)}>
            Recommended
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onChange(all)}>
            All
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(new Set())}>
            Clear
          </button>
        </div>
      </div>

      <WorldMap markers={markers} onToggle={toggle} caption="Choose test locations on the map" />

      <div className="picker-regions">
        {config.regions.map((region) => {
          const cities = config.locations.filter((l) => l.region === region.id);
          return (
            <fieldset key={region.id} className="picker-region">
              <legend className="eyebrow">{region.label}</legend>
              <div className="chips">
                {cities.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="chip"
                    aria-pressed={selected.has(l.id)}
                    title={l.covers}
                    onClick={() => toggle(l.id)}
                  >
                    {l.city}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      {selected.size === 0 && <p className="picker-hint">No cities selected — the recommended set will be used.</p>}
    </div>
  );
}
