import { describe, expect, it } from 'vitest';
import { LOCATIONS, REGIONS, defaultLocationIds, resolveLocations } from '../server/locations';

describe('location catalogue', () => {
  it('has unique ids', () => {
    const ids = LOCATIONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every region in the default set', () => {
    const defaults = LOCATIONS.filter((l) => l.defaultSelected);
    for (const region of REGIONS) {
      expect(defaults.some((l) => l.region === region.id), region.id).toBe(true);
    }
  });

  it('includes London, Frankfurt and Sydney by default', () => {
    const ids = defaultLocationIds();
    expect(ids).toEqual(expect.arrayContaining(['london', 'frankfurt', 'sydney']));
  });

  it('has sane coordinates', () => {
    for (const l of LOCATIONS) {
      expect(Math.abs(l.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(l.lon)).toBeLessThanOrEqual(180);
      expect(l.country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('resolves requested ids, drops unknown ones and falls back to defaults', () => {
    expect(resolveLocations(['tokyo', 'nowhere']).map((l) => l.id)).toEqual(['tokyo']);
    expect(resolveLocations([]).length).toBe(defaultLocationIds().length);
    expect(resolveLocations(undefined).length).toBe(defaultLocationIds().length);
  });

  it('caps the number of locations', () => {
    const all = LOCATIONS.map((l) => l.id);
    expect(resolveLocations(all, 25).length).toBe(25);
  });
});
