// Generates src/data/world-dots.json: a dot-matrix world map in the
// Natural Earth projection. Run with `npm run build:dots` (output is committed).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoContains, geoNaturalEarth1 } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const land = feature(topology, topology.objects.land);

const WIDTH = 1000;
const STEP = 7; // px between dots
const MIN_LAT = -56; // skip Antarctica

const projection = geoNaturalEarth1().fitWidth(WIDTH, { type: 'Sphere' });
const dots = [];
const height = Math.ceil(projection([0, -90])[1]);

for (let y = STEP / 2; y < height; y += STEP) {
  for (let x = STEP / 2; x < WIDTH; x += STEP) {
    const coords = projection.invert([x, y]);
    if (!coords || coords[1] < MIN_LAT) continue;
    if (geoContains(land, coords)) dots.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
}

const maxY = Math.max(...dots.map((d) => d[1])) + STEP;
const out = {
  projection: 'naturalEarth1',
  width: WIDTH,
  height: Math.ceil(maxY),
  scale: projection.scale(),
  translate: projection.translate(),
  step: STEP,
  dots,
};
writeFileSync(new URL('../src/data/world-dots.json', import.meta.url), JSON.stringify(out));
console.log(`${dots.length} dots, viewBox 0 0 ${WIDTH} ${out.height}`);
