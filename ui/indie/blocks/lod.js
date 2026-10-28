// The distant view (in the spirit of voxy): past the columns the worker keeps, the land is drawn in coarse voxels made
// straight from the generator's large shapes — tiles of 64 × 64 blocks near (256 × 256 past 384 blocks, so seeing a
// few thousand blocks away is a few hundred tiles to draw), in cells of 2 blocks near, then 4, 8, 16, 32 farther out; each cell a column of its surface colour up to the land's height, forests a dark green canopy a few
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
export const lodStep = d => d < 192 ? 2 : d < 384 ? 4 : d < 768 ? 8 : d < 1536 ? 16 : 32;
// the big tiles' size, and from how far they are used
export const LOD_BIG = 256, BIG_FROM = 384;
/** A tile's mesh: {data: ArrayBuffer (LOD_STRIDE a vertex, four a quad), quads}. */
export function lodTile(seed, tx, tz, step, size = LOD_TILE) {
  const w = worldOf(seed), n = size / step, x0 = tx * LOD_TILE, z0 = tz * LOD_TILE, N = n + 2;
  const top = new Int16Array(N * N), col = new Uint8Array(N * N * 3), wet = new Uint8Array(N * N);
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    const x = x0 + i * step + step / 2, z = z0 + j * step + step / 2, l = coarseLand(w, x, z), b = BIOMES[l.biome];
    const [h, c, water] = surface(b.name, b, l.h, l.mountain, x, z, seed), k = (j + 1) * N + i + 1;
    // each cell a little lighter or darker (the blocks' own pictures vary so, seen from afar), water less
    const shade = 1 + (hash(seed + 9, Math.floor(x / step), 0, Math.floor(z / step)) - 0.5) * (water ? 0.04 : 0.12);
    top[k] = h; col.set(dim(c, shade).map(v => Math.min(255, v)), k * 3); wet[k] = water ? 1 : 0;
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
  // the nearest and farthest points of a square (x0, z0, size) from the player
  const span = (x0, z0, s) => [Math.hypot(Math.max(x0, Math.min(px, x0 + s)) - px, Math.max(z0, Math.min(pz, z0 + s)) - pz), Math.hypot(Math.max(Math.abs(x0 - px), Math.abs(x0 + s - px)), Math.max(Math.abs(z0 - pz), Math.abs(z0 + s - pz)))];
  const K = LOD_BIG / LOD_TILE, b0x = Math.floor((px - R) / LOD_BIG), b1x = Math.floor((px + R) / LOD_BIG), b0z = Math.floor((pz - R) / LOD_BIG), b1z = Math.floor((pz + R) / LOD_BIG);
  for (let bz = b0z; bz <= b1z; bz++) for (let bx = b0x; bx <= b1x; bx++) {
    const [n0, f0] = span(bx * LOD_BIG, bz * LOD_BIG, LOD_BIG);
    if (n0 > R || f0 < inner) continue;
    // far off: the whole big square as one tile; near: its sixteen small ones (tx, tz in small tiles either way)
    if (n0 >= BIG_FROM && n0 - inner > LOD_BIG) { out.push({tx: bx * K, tz: bz * K, size: LOD_BIG, step: lodStep(n0), d: n0}); continue; }
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
      const tx = bx * K + i, tz = bz * K + j, [near0, far0] = span(tx * LOD_TILE, tz * LOD_TILE, LOD_TILE);
      if (near0 > R || far0 < inner) continue;
      out.push({tx, tz, size: LOD_TILE, step: lodStep(near0), d: near0});
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
