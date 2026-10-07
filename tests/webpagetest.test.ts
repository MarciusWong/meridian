import { describe, expect, it } from 'vitest';
import { matchWptLocations } from '../server/providers/webpagetest';
import { getLocation } from '../server/locations';
import type { TestLocation } from '../shared/types';

describe('matchWptLocations', () => {
  it('matches catalogue cities to WPT location labels, ignoring accents', () => {
    const locs = ['london', 'sao-paulo', 'lagos'].map((id) => getLocation(id) as TestLocation);
    const matched = matchWptLocations(locs, {
      London_EC2: { Label: 'London, UK - EC2' },
      ec2_sa_east_1: { Label: 'São Paulo, Brazil - EC2' },
      Dulles: { Label: 'Dulles, VA' },
    });
    expect(matched.map((m) => [m.location.id, m.wptId])).toEqual([
      ['london', 'London_EC2'],
      ['sao-paulo', 'ec2_sa_east_1'],
    ]);
  });
});
