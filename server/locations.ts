import type { RegionId, TestLocation } from '../shared/types';

export const REGIONS: Array<{ id: RegionId; label: string }> = [
  { id: 'north-america', label: 'North America' },
  { id: 'south-america', label: 'South America' },
  { id: 'europe', label: 'Europe' },
  { id: 'middle-east', label: 'Middle East' },
  { id: 'africa', label: 'Africa' },
  { id: 'asia', label: 'Asia' },
  { id: 'oceania', label: 'Oceania' },
];

type Row = [id: string, city: string, country: string, region: RegionId, covers: string, lat: number, lon: number, def: boolean];

// City names must match the spelling Globalping uses for its probes.
const ROWS: Row[] = [
  // North America
  ['new-york', 'New York', 'US', 'north-america', 'US East', 40.71, -74.01, true],
  ['ashburn', 'Ashburn', 'US', 'north-america', 'US East (cloud hub)', 39.04, -77.49, true],
  ['chicago', 'Chicago', 'US', 'north-america', 'US Central', 41.88, -87.63, true],
  ['dallas', 'Dallas', 'US', 'north-america', 'US South', 32.78, -96.8, false],
  ['los-angeles', 'Los Angeles', 'US', 'north-america', 'US West', 34.05, -118.24, true],
  ['seattle', 'Seattle', 'US', 'north-america', 'US Northwest', 47.61, -122.33, false],
  ['miami', 'Miami', 'US', 'north-america', 'US Southeast & Caribbean', 25.76, -80.19, false],
  ['toronto', 'Toronto', 'CA', 'north-america', 'Canada', 43.65, -79.38, true],
  ['mexico-city', 'Mexico City', 'MX', 'north-america', 'Mexico & Central America', 19.43, -99.13, false],
  // South America
  ['sao-paulo', 'Sao Paulo', 'BR', 'south-america', 'Brazil', -23.55, -46.63, true],
  ['santiago', 'Santiago', 'CL', 'south-america', 'Andean region', -33.45, -70.67, true],
  ['buenos-aires', 'Buenos Aires', 'AR', 'south-america', 'Argentina', -34.6, -58.38, false],
  ['lima', 'Lima', 'PE', 'south-america', 'Peru', -12.05, -77.04, false],
  // Europe
  ['london', 'London', 'GB', 'europe', 'UK & Ireland', 51.51, -0.13, true],
  ['frankfurt', 'Frankfurt', 'DE', 'europe', 'Central Europe', 50.11, 8.68, true],
  ['paris', 'Paris', 'FR', 'europe', 'Western Europe', 48.86, 2.35, true],
  ['amsterdam', 'Amsterdam', 'NL', 'europe', 'Benelux', 52.37, 4.9, false],
  ['stockholm', 'Stockholm', 'SE', 'europe', 'Nordics', 59.33, 18.07, true],
  ['madrid', 'Madrid', 'ES', 'europe', 'Iberia', 40.42, -3.7, true],
  ['warsaw', 'Warsaw', 'PL', 'europe', 'Eastern Europe', 52.23, 21.01, true],
  ['istanbul', 'Istanbul', 'TR', 'europe', 'Turkey & Balkans', 41.01, 28.98, false],
  // Middle East
  ['dubai', 'Dubai', 'AE', 'middle-east', 'Gulf states', 25.2, 55.27, true],
  ['tel-aviv', 'Tel Aviv', 'IL', 'middle-east', 'Levant', 32.09, 34.78, false],
  // Africa
  ['johannesburg', 'Johannesburg', 'ZA', 'africa', 'Southern Africa', -26.2, 28.05, true],
  ['lagos', 'Lagos', 'NG', 'africa', 'West Africa', 6.52, 3.38, true],
  ['nairobi', 'Nairobi', 'KE', 'africa', 'East Africa', -1.29, 36.82, false],
  ['cairo', 'Cairo', 'EG', 'africa', 'North Africa', 30.04, 31.24, false],
  // Asia
  ['mumbai', 'Mumbai', 'IN', 'asia', 'India', 19.08, 72.88, true],
  ['singapore', 'Singapore', 'SG', 'asia', 'Southeast Asia', 1.35, 103.82, true],
  ['tokyo', 'Tokyo', 'JP', 'asia', 'Japan', 35.68, 139.69, true],
  ['hong-kong', 'Hong Kong', 'HK', 'asia', 'Greater China', 22.32, 114.17, false],
  ['seoul', 'Seoul', 'KR', 'asia', 'Korea', 37.57, 126.98, false],
  ['jakarta', 'Jakarta', 'ID', 'asia', 'Indonesia', -6.21, 106.85, false],
  ['taipei', 'Taipei', 'TW', 'asia', 'Taiwan', 25.03, 121.57, false],
  ['bangkok', 'Bangkok', 'TH', 'asia', 'Mainland Southeast Asia', 13.76, 100.5, false],
  // Oceania
  ['sydney', 'Sydney', 'AU', 'oceania', 'Australia', -33.87, 151.21, true],
  ['melbourne', 'Melbourne', 'AU', 'oceania', 'Southern Australia', -37.81, 144.96, false],
  ['auckland', 'Auckland', 'NZ', 'oceania', 'New Zealand', -36.85, 174.76, false],
];

export const LOCATIONS: TestLocation[] = ROWS.map(([id, city, country, region, covers, lat, lon, defaultSelected]) => ({
  id,
  city,
  country,
  region,
  covers,
  lat,
  lon,
  defaultSelected,
}));

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

export const MAX_LOCATIONS = 30;

export function defaultLocationIds(): string[] {
  return LOCATIONS.filter((l) => l.defaultSelected).map((l) => l.id);
}

export function getLocation(id: string): TestLocation | undefined {
  return BY_ID.get(id);
}

/** Maps requested ids to catalogue entries, dropping unknown ids. Empty input means the default set. */
export function resolveLocations(ids: string[] | undefined, max = MAX_LOCATIONS): TestLocation[] {
  const known = (ids ?? []).map((id) => BY_ID.get(id)).filter((l): l is TestLocation => Boolean(l));
  const unique = [...new Map(known.map((l) => [l.id, l])).values()];
  const chosen = unique.length > 0 ? unique : LOCATIONS.filter((l) => l.defaultSelected);
  return chosen.slice(0, max);
}
