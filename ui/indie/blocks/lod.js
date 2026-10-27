// The distant view (in the spirit of voxy): past the columns the worker keeps, the land is drawn in coarse voxels made
// straight from the generator's large shapes — tiles of 64 × 64 blocks, in cells of 4 blocks near, 8 and then 16
// farther out; each cell a column of its surface colour up to the land's height, forests a dark green canopy a few
// blocks over the ground, water flat at sea level. Caves, buildings and what the player changed are not in it: from
// that far they would not show. A vertex is 16 bytes: x, y, z (float, from the tile's corner), r, g, b, face (+8 water).
import {coarseLand, worldOf, BIOMES, TREE_DENSITY} from './gen.js';
import {SEA} from './blocks.js';
import {hash} from './noise.js';

export const LOD_TILE = 64, LOD_STRIDE = 16;
// the faces as mesh.js has them: normal, u, v, the corner they start from (counter-clockwise seen from outside)
const FACE = [
  {u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1]}, {u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0]},
  {u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1]}, {u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0]},
  {u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1]}, {u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0]},
];
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const dim = (c, k) => c.map(v => Math.round(v * k));
const SAND = [219, 205, 158], SNOW = [238, 243, 248], STONE = [122, 122, 124];
/** What the land looks like from far off at a spot: [top height, colour, water]. */
function surface(name, b, h, mountain, x, z, seed) {
  if (h < SEA) return [SEA, dim(rgb(b.water), 0.85), true];
  if (name === 'desert' || name === 'beach' || name === 'snowy_beach') return [h, SAND, false];
  if (name.startsWith('snowy') || name === 'frozen_river' || h > 168) return [h, SNOW, false];
  if (name === 'stony_peaks' || (mountain > 0.45 && h > 112)) return [h, STONE, false];
  // a forest's trees: a canopy a few blocks over the ground, in the leaves' colour
  if (hash(seed + 5, Math.floor(x / 4), 0, Math.floor(z / 4)) < (TREE_DENSITY[name] || 0) * 0.85) return [h + 5, dim(rgb(b.foliage), 0.72), false];
  return [h, dim(rgb(b.grass), 0.92), false];
}
/** The cell size for a tile at a distance (blocks) from the player. */
export const lodStep = d => d < 384 ? 4 : d < 768 ? 8 : 16;
/** A tile's mesh: {data: ArrayBuffer (LOD_STRIDE a vertex, four a quad), quads}. */
export function lodTile(seed, tx, tz, step) {
  const w = worldOf(seed), n = LOD_TILE / step, x0 = tx * LOD_TILE, z0 = tz * LOD_TILE, N = n + 2;
  const top = new Int16Array(N * N), col = new Uint8Array(N * N * 3), wet = new Uint8Array(N * N);
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    const x = x0 + i * step + step / 2, z = z0 + j * step + step / 2, l = coarseLand(w, x, z), b = BIOMES[l.biome];
    const [h, c, water] = surface(b.name, b, l.h, l.mountain, x, z, seed), k = (j + 1) * N + i + 1;
    top[k] = h; col.set(c, k * 3); wet[k] = water ? 1 : 0;
  }
  // a top for every cell; a side wherever the neighbour is lower
  const quads = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j + 1) * N + i + 1, h = top[k] + 1;
    quads.push([i, j, 2, top[k], h, k]);
    for (const [f, di, dj] of [[0, 1, 0], [1, -1, 0], [4, 0, 1], [5, 0, -1]]) {
      const nb = top[(j + 1 + dj) * N + i + 1 + di] + 1;
      if (nb < h) quads.push([i, j, f, nb, h, k]);
    }
  }
  const data = new ArrayBuffer(quads.length * 4 * LOD_STRIDE), F = new Float32Array(data), B = new Uint8Array(data);
  let v = 0;
  for (const [i, j, f, y0, y1, k] of quads) {
    const {u, v: vv, o} = FACE[f], size = [step, y1 - y0, step], base = [i * step, y0, j * step];
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? 1 : 0, cv = c >= 2 ? 1 : 0, at = v * 4;
      for (let a = 0; a < 3; a++) F[at + a] = base[a] + (o[a] + u[a] * cu + vv[a] * cv) * size[a];
      const bo = v * LOD_STRIDE + 12;
      B[bo] = col[k * 3]; B[bo + 1] = col[k * 3 + 1]; B[bo + 2] = col[k * 3 + 2]; B[bo + 3] = f | (wet[k] ? 8 : 0);
      v++;
    }
  }
  return {data, quads: quads.length};
}
/**
 * The tiles to have around a column (cx, cz) for a view of `radius` columns, beyond the `near` ones the worker keeps:
 * [{tx, tz, step, d}] nearest first.
 */
export function lodPlan(cx, cz, radius, near) {
  const px = cx * 16 + 8, pz = cz * 16 + 8, R = radius * 16, inner = Math.max(0, near - 1) * 16, out = [];
  const t0x = Math.floor((px - R) / LOD_TILE), t1x = Math.floor((px + R) / LOD_TILE), t0z = Math.floor((pz - R) / LOD_TILE), t1z = Math.floor((pz + R) / LOD_TILE);
  for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) {
    // the tile's nearest and farthest points from the player
    const nx = Math.max(tx * LOD_TILE, Math.min(px, (tx + 1) * LOD_TILE)), nz = Math.max(tz * LOD_TILE, Math.min(pz, (tz + 1) * LOD_TILE));
    const near0 = Math.hypot(nx - px, nz - pz), far0 = Math.hypot(Math.max(Math.abs(tx * LOD_TILE - px), Math.abs((tx + 1) * LOD_TILE - px)), Math.max(Math.abs(tz * LOD_TILE - pz), Math.abs((tz + 1) * LOD_TILE - pz)));
    if (near0 > R || far0 < inner) continue;
    out.push({tx, tz, step: lodStep(near0), d: near0});
  }
  return out.sort((a, b) => a.d - b.d);
}
