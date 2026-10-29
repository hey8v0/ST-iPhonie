// The world from its seed, one 16×16 column at a time: land and sea from a few large noises (continents, erosion,
// peaks), rivers, biomes from temperature and rain, mountains with overhangs, two kinds of caves, ores by depth (the
// game's own heights), deepslate below 0, then surface blocks, water, trees, flowers and the rest. A column comes out
// the same every time for the same seed, so only the ones the player changed need saving. Trees reaching over a
// column's edge are grown from every column they touch, so the halves meet.
import {fractal, simplex, hash, rng} from './noise.js';
import {ID, MINY, HEIGHT, SECTIONS, SEA, withMeta} from './blocks.js';
import {drawVillages} from './village.js';
import {drawMonuments} from './monument.js';
import {drawDesert} from './desert.js';
import {drawOcean} from './ocean.js';
import {growTree, BIG_TREES} from './trees.js';
export {growTree};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// grass, foliage, water colours as the game has them
export const BIOMES = [
  {name: 'ocean', zh: '海洋', grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4'},
  {name: 'cold_ocean', zh: '冷水海洋', grass: '#8eb971', foliage: '#71a74d', water: '#3d57d6'},
  {name: 'frozen_ocean', zh: '冻洋', grass: '#80b497', foliage: '#60a17b', water: '#3938c9', cold: true},
  {name: 'warm_ocean', zh: '暖水海洋', grass: '#8eb971', foliage: '#71a74d', water: '#43d5ee'},
  {name: 'river', zh: '河流', grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4'},
  {name: 'frozen_river', zh: '冻河', grass: '#80b497', foliage: '#60a17b', water: '#3938c9', cold: true},
  {name: 'beach', zh: '沙滩', grass: '#91bd59', foliage: '#77ab2f', water: '#157cab'},
  {name: 'snowy_beach', zh: '积雪沙滩', grass: '#83b593', foliage: '#64a278', water: '#3d57d6', cold: true},
  {name: 'plains', zh: '平原', grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4'},
  {name: 'forest', zh: '森林', grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4'},
  {name: 'birch_forest', zh: '桦木森林', grass: '#88bb67', foliage: '#6ba941', water: '#3f76e4'},
  {name: 'dark_forest', zh: '黑森林', grass: '#507a32', foliage: '#59ae30', water: '#3f76e4'},
  {name: 'swamp', zh: '沼泽', grass: '#6a7039', foliage: '#6a7039', water: '#617b64'},
  {name: 'taiga', zh: '针叶林', grass: '#86b783', foliage: '#68a464', water: '#287082'},
  {name: 'snowy_plains', zh: '雪原', grass: '#80b497', foliage: '#60a17b', water: '#3938c9', cold: true},
  {name: 'snowy_taiga', zh: '积雪针叶林', grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', cold: true},
  {name: 'desert', zh: '沙漠', grass: '#bfb755', foliage: '#aea42a', water: '#32a598', dry: true},
  {name: 'savanna', zh: '热带草原', grass: '#bfb755', foliage: '#aea42a', water: '#2c8b9c', dry: true},
  {name: 'jungle', zh: '丛林', grass: '#59c93c', foliage: '#30bb0b', water: '#14a2c5'},
  {name: 'meadow', zh: '草甸', grass: '#83bb6d', foliage: '#63a948', water: '#0e4ecf'},
  {name: 'stony_peaks', zh: '裸岩山峰', grass: '#9abe4b', foliage: '#82ac1e', water: '#3f76e4'},
  {name: 'snowy_slopes', zh: '积雪山坡', grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', cold: true},
  {name: 'nether_wastes', zh: '下界荒地', grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4', dry: true, nether: true},
  // variants where the weirdness noise is far from the middle: the old growth forests, flower forest, sunflower plains
  {name: 'old_growth_pine_taiga', zh: '原始松木针叶林', grass: '#86b87f', foliage: '#68a55f', water: '#3f76e4'},
  {name: 'old_growth_spruce_taiga', zh: '原始云杉针叶林', grass: '#86b87f', foliage: '#68a55f', water: '#3f76e4'},
  {name: 'old_growth_birch_forest', zh: '原始桦木森林', grass: '#88bb67', foliage: '#6ba941', water: '#3f76e4'},
  {name: 'flower_forest', zh: '繁花森林', grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4'},
  {name: 'sunflower_plains', zh: '向日葵平原', grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4'},
  // the cherry grove (on high meadows), the mangrove swamp (hot, wet and low; mud under shallow water), the bamboo jungle
  {name: 'cherry_grove', zh: '樱花树林', grass: '#b6db61', foliage: '#b6db61', water: '#5db7ef'},
  {name: 'mangrove_swamp', zh: '红树林沼泽', grass: '#6a7039', foliage: '#8db127', water: '#3a7a6a'},
  {name: 'bamboo_jungle', zh: '竹林', grass: '#59c93c', foliage: '#30bb0b', water: '#14a2c5'},
];
export const BIOME = Object.fromEntries(BIOMES.map((b, i) => [b.name, i]));

const worlds = new Map();
/** The noises of a seed (made once). */
export function worldOf(seed) {
  if (worlds.has(seed)) return worlds.get(seed);
  const w = {
    seed,
    cont: fractal(seed + 1, {scale: 1100, octaves: 5}), ero: fractal(seed + 2, {scale: 700, octaves: 4}), peaks: fractal(seed + 3, {scale: 320, octaves: 5}),
    temp: fractal(seed + 4, {scale: 1300, octaves: 3}), hum: fractal(seed + 5, {scale: 1000, octaves: 3}), river: fractal(seed + 6, {scale: 850, octaves: 4}),
    hills: fractal(seed + 7, {scale: 140, octaves: 4}), detail: fractal(seed + 8, {scale: 32, octaves: 2}), warp: fractal(seed + 9, {scale: 90, octaves: 2}),
    over: simplex(seed + 10), cheese: fractal(seed + 11, {scale: 70, octaves: 2}), spagA: simplex(seed + 12), spagB: simplex(seed + 13), noodle: simplex(seed + 14),
    open: fractal(seed + 15, {scale: 60, octaves: 2}), weird: fractal(seed + 16, {scale: 480, octaves: 2}), land: new Map(),
  };
  worlds.set(seed, w);
  return w;
}

const PTS = [[-1, 28], [-0.55, 34], [-0.35, 46], [-0.18, 56], [-0.06, 62], [0.02, 65], [0.18, 70], [0.4, 78], [0.7, 92], [1, 104]];
/** The large-scale land at a grid point (every 4 blocks): height before detail, mountain share, climate, river. */
function rawLand(w, x, z) {
  const wx = x + w.warp.n2(x, z) * 18, wz = z + w.warp.n2(z + 500, x - 500) * 18;
  const c = clamp(w.cont.n2(wx, wz) * 1.9 + 0.12, -1, 1), e = w.ero.n2(wx, wz) * 1.6, t = w.temp.n2(x, z) * 1.7, hu = w.hum.n2(x, z) * 1.7, wd = w.weird.n2(x, z) * 1.6;
  // land height over continentalness
  let base = PTS[0][1];
  for (let i = 1; i < PTS.length; i++) if (c <= PTS[i][0]) { const [c0, h0] = PTS[i - 1], [c1, h1] = PTS[i]; base = lerp(h0, h1, (c - c0) / (c1 - c0)); break; } else base = PTS[i][1];
  const mountain = smooth(0.12, 0.55, c) * (1 - smooth(-0.45, 0.25, e));
  const ridge = 1 - Math.abs(w.peaks.n2(wx, wz)) * 1.5, peak = Math.max(0, ridge) ** 2.2;
  const hills = w.hills.n2(x, z) * (6 + 10 * smooth(-0.2, 0.6, -e)) * smooth(-0.1, 0.1, c);
  let h = base + hills * (1 - mountain) + mountain * (20 + peak * 150);
  // rivers: a thin band where the river noise crosses zero, cut down to just under the sea
  const rv = Math.abs(w.river.n2(x, z)), width = 0.035 + 0.02 * smooth(0, 0.6, hu);
  let river = 0;
  if (c > -0.2 && rv < width * 2.2) {
    const k = smooth(width * 0.55, width * 2.2, rv);
    const bed = SEA - 3 - (1 - k) * 2;
    if (h > bed) { h = lerp(bed, h, k * k * (1 - mountain * 0.5) + mountain * 0.5 * k); river = rv < width ? 1 - rv / width : 0; }
  }
  return {h, mountain, c, e, t, hu, river, wd};
}
function gridLand(w, gx, gz) {
  const key = gx * 131072 + gz;
  let l = w.land.get(key);
  if (!l) { if (w.land.size > 60000) w.land.clear(); l = rawLand(w, gx * 4, gz * 4); w.land.set(key, l); }
  return l;
}
/** What the land is like at a spot: height (top of the ground, before caves), mountain share, biome and the rest. The
 * large shapes come from a grid every 4 blocks (smooth in between), the small bumps from a fine noise. */
export function landAt(w, x, z) {
  const gx = Math.floor(x / 4), gz = Math.floor(z / 4), fx = (x - gx * 4) / 4, fz = (z - gz * 4) / 4;
  const a = gridLand(w, gx, gz), b2 = gridLand(w, gx + 1, gz), c2 = gridLand(w, gx, gz + 1), d = gridLand(w, gx + 1, gz + 1);
  const mixed = k => lerp(lerp(a[k], b2[k], fx), lerp(c2[k], d[k], fx), fz);
  const mountain = mixed('mountain'), c = mixed('c'), e = mixed('e'), t = mixed('t'), hu = mixed('hu'), river = mixed('river'), wd = mixed('wd');
  const h = Math.round(clamp(mixed('h') + w.detail.n2(x, z) * 1.5, MINY + 8, MINY + HEIGHT - 20));
  return {h, mountain, c, e, t, hu, river, biome: biomeOf(h, mountain, c, t, hu, river, wd)};
}
/**
 * The land seen from far off (the distant view): the large-scale grid point nearest (x, z) only — no blending, no
 * small bumps — so a sample costs one grid point instead of four and the fine noise. {h, mountain, biome}.
 */
export function coarseLand(w, x, z) {
  const l = gridLand(w, Math.round(x / 4), Math.round(z / 4)), h = Math.round(clamp(l.h, MINY + 8, MINY + HEIGHT - 20));
  return {h, mountain: l.mountain, biome: biomeOf(h, l.mountain, l.c, l.t, l.hu, l.river, l.wd)};
}
function biomeOf(h, mountain, c, t, hu, river, wd = 0) {
  let b;
  const coast = c > -0.24 && c < 0.06;
  if (h < SEA - 4 && !river) b = t < -0.5 ? 'frozen_ocean' : t < -0.15 ? 'cold_ocean' : t > 0.5 ? 'warm_ocean' : 'ocean';
  else if (river > 0 && h < SEA) b = t < -0.5 ? 'frozen_river' : 'river';
  else if (mountain > 0.35 && h > 120) b = h > 165 || t < -0.25 ? 'snowy_slopes' : 'stony_peaks';
  else if (coast && h <= SEA + 2 && mountain < 0.2) b = t >= 0.4 && hu > 0.45 ? 'mangrove_swamp' : t < -0.5 ? 'snowy_beach' : 'beach';
  else if (mountain > 0.25 && h > 95 && hu > -0.2) b = 'meadow';
  else if (t < -0.5) b = hu < 0 ? 'snowy_plains' : 'snowy_taiga';
  else if (t < -0.15) b = hu < -0.3 ? 'plains' : 'taiga';
  else if (t < 0.4) b = hu < -0.35 ? 'plains' : hu < 0.05 ? 'forest' : hu < 0.3 ? 'birch_forest' : hu > 0.55 && h < SEA + 5 ? 'swamp' : 'dark_forest';
  else b = hu < -0.2 ? 'desert' : hu < 0.15 ? 'savanna' : hu > 0.45 && h < SEA + 4 ? 'mangrove_swamp' : 'jungle';
  // the variants, where the weirdness is high or low
  if (b === 'taiga' && wd > 0.4) b = hu > 0.35 ? 'old_growth_spruce_taiga' : 'old_growth_pine_taiga';
  else if (b === 'birch_forest' && wd > 0.4) b = 'old_growth_birch_forest';
  else if (b === 'forest' && wd < -0.45) b = 'flower_forest';
  else if (b === 'plains' && wd > 0.5) b = 'sunflower_plains';
  else if (b === 'meadow' && wd > 0 && t > -0.35 && t < 0.4) b = 'cherry_grove';
  else if (b === 'jungle' && wd > 0.4) b = 'bamboo_jungle';
  return BIOME[b];
}

/** A column's own random numbers. */
const colRng = (seed, cx, cz, salt) => rng(Math.floor(hash(seed + salt, cx, cz) * 2147483647));

// ores: [block, deepslate block, veins per column, size, lowest y, highest y, shape: 'tri' peaks in the middle | 'flat']
const ORES = [
  ['coal_ore', 'deepslate_coal_ore', 18, 13, 0, 192, 'tri'], ['coal_ore', 'deepslate_coal_ore', 6, 9, 136, 320, 'flat'],
  ['iron_ore', 'deepslate_iron_ore', 9, 9, -24, 56, 'tri'], ['iron_ore', 'deepslate_iron_ore', 8, 9, 80, 384, 'tri'], ['iron_ore', 'deepslate_iron_ore', 3, 4, -64, 72, 'flat'],
  ['copper_ore', 'deepslate_copper_ore', 14, 10, -16, 112, 'tri'], ['gold_ore', 'deepslate_gold_ore', 4, 9, -64, 32, 'tri'],
  ['redstone_ore', 'deepslate_redstone_ore', 4, 8, -64, 15, 'flat'], ['redstone_ore', 'deepslate_redstone_ore', 6, 8, -96, -32, 'tri'],
  ['lapis_ore', 'deepslate_lapis_ore', 2, 7, -32, 32, 'tri'], ['lapis_ore', 'deepslate_lapis_ore', 3, 7, -64, 64, 'flat'],
  ['diamond_ore', 'deepslate_diamond_ore', 7, 4, -144, 16, 'tri'], ['emerald_ore', 'deepslate_emerald_ore', 3, 3, -16, 320, 'tri'],
  ['dirt', 'dirt', 7, 30, 0, 160, 'flat'], ['gravel', 'gravel', 6, 30, -64, 320, 'flat'],
  ['granite', 'granite', 2, 60, 0, 60, 'flat'], ['diorite', 'diorite', 2, 60, 0, 60, 'flat'], ['andesite', 'andesite', 2, 60, 0, 60, 'flat'], ['tuff', 'tuff', 2, 60, -64, 0, 'flat'],
];

/** A new column: {cx, cz, sections: [Uint16Array(4096) | null] × 24, height: Int16Array(256), biome: Uint8Array(256)}. */
export function newColumn(cx, cz) { return {cx, cz, sections: new Array(SECTIONS).fill(null), height: new Int16Array(256), biome: new Uint8Array(256)}; }
export function getBlock(col, x, y, z) { const s = col.sections[(y - MINY) >> 4]; return s ? s[((y - MINY) & 15) << 8 | z << 4 | x] : 0; }
export function setBlock(col, x, y, z, v) {
  if (y < MINY || y >= MINY + HEIGHT) return;
  const si = (y - MINY) >> 4;
  let s = col.sections[si];
  if (!s) { if (!v) return; s = col.sections[si] = new Uint16Array(4096); }
  s[((y - MINY) & 15) << 8 | z << 4 | x] = v;
}

export function generateColumn(seed, cx, cz) {
  const w = worldOf(seed), col = newColumn(cx, cz), x0 = cx * 16, z0 = cz * 16;
  const land = new Array(18 * 18);
  for (let dz = -1; dz < 17; dz++) for (let dx = -1; dx < 17; dx++) land[(dz + 1) * 18 + dx + 1] = landAt(w, x0 + dx, z0 + dz);
  const L = (dx, dz) => land[(dz + 1) * 18 + dx + 1];
  const {stone, deepslate, bedrock, water, lava, ice} = ID;
  // 1. the ground: stone up to the height (deepslate under 0), overhangs where it is mountainous (their noise on a
  // grid every 4 blocks, in between linear)
  let top = MINY, maxMountain = 0, lowH = Infinity, highH = -Infinity;
  for (const l of land) { if (l.mountain > maxMountain) maxMountain = l.mountain; if (l.h < lowH) lowH = l.h; if (l.h > highH) highH = l.h; }
  const GX = 5, GY = HEIGHT / 4 + 1;
  let overGrid = null;
  if (maxMountain > 0.15) {
    overGrid = new Float32Array(GX * GX * GY);
    for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) {
      const y = MINY + gy * 4;
      if (y < lowH - 34 || y > highH + 30) continue;
      overGrid[(gz * GX + gx) * GY + gy] = w.over.n3((x0 + gx * 4) / 28, y / 20, (z0 + gz * 4) / 28);
    }
  }
  const vertical = new Float32Array(GY);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const l = L(x, z), wx = x0 + x, wz = z0 + z, h = l.h;
    const over = overGrid && l.mountain > 0.15 ? l.mountain : 0;
    if (over) {
      const gx = x >> 2, gz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
      for (let gy = 0; gy < GY; gy++) {
        const a = overGrid[(gz * GX + gx) * GY + gy], b = overGrid[(gz * GX + gx + 1) * GY + gy], c = overGrid[((gz + 1) * GX + gx) * GY + gy], d = overGrid[((gz + 1) * GX + gx + 1) * GY + gy];
        vertical[gy] = lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
      }
    }
    const yTop = h + (over ? 24 : 0);
    for (let y = MINY; y <= yTop; y++) {
      if (y > h - 30 && over) {
        const g = (y - MINY) >> 2, n = vertical[g] + (vertical[g + 1] - vertical[g]) * (((y - MINY) & 3) / 4);
        if ((h - y) / (6 + over * 14) + n * over * 1.1 <= 0) continue;
      }
      let v = y < 0 || (y < 8 && hash(seed, wx, y, wz) < (8 - y) / 8) ? deepslate : stone;
      if (y <= MINY + 4 && (y === MINY || hash(seed + 1, wx, y, wz) < (MINY + 5 - y) / 5)) v = bedrock;
      const si = (y - MINY) >> 4;
      (col.sections[si] ??= new Uint16Array(4096))[((y - MINY) & 15) << 8 | z << 4 | x] = v;
      if (y > top) top = y;
    }
  }
  // 2. stone kinds, dirt and gravel pockets, ores (emeralds only in the mountains)
  const r = colRng(seed, cx, cz, 77);
  for (const [name, deepName, count, size, lo, hi, shape] of ORES) {
    if (name === 'emerald_ore' && maxMountain < 0.3) continue;
    const n = Math.floor(count * (0.6 + r() * 0.8));
    for (let k = 0; k < n; k++) {
      const y = Math.round(shape === 'tri' ? lo + (hi - lo) * (r() + r()) / 2 : lo + (hi - lo) * r());
      if (y < MINY + 1 || y > top) continue;
      vein(col, r, 2 + Math.floor(r() * 12), y, 2 + Math.floor(r() * 12), size, ID[name], ID[deepName], seed);
    }
  }
  // 3. caves: cheese (big rooms), spaghetti (long tunnels), noodles (thin); lava sits at the bottom
  carve(w, col, x0, z0, L, top);
  // 4. surface, water, ice
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const l = L(x, z), b = l.biome, wx = x0 + x, wz = z0 + z;
    col.biome[z * 16 + x] = b;
    // the top solid block (overhangs included); a mangrove swamp low by the sea is cut down to the water (mud at its
    // level, or a block under it)
    let y = top;
    while (y > MINY && !isSolidGround(getBlock(col, x, y, z))) y--;
    if (BIOMES[b].name === 'mangrove_swamp') for (const t = mangroveTop(w, wx, wz, l.h); y > t; y--) setBlock(col, x, y, z, 0);
    const slope = Math.max(Math.abs(L(x + 1, z).h - L(x - 1, z).h), Math.abs(L(x, z + 1).h - L(x, z - 1).h));
    let depth = 0;
    for (let yy = y; yy > y - 6 && yy > MINY; yy--) {
      const v = getBlock(col, x, yy, z);
      if (!isSolidGround(v)) { depth = 0; continue; }
      if (v !== stone && v !== deepslate) break;
      setBlock(col, x, yy, z, surfaceBlock(b, depth, yy, slope, l, hash(seed + 5, wx, yy, wz), w.open.n2(wx * 2.3 + 900, wz * 2.3)));
      depth++;
    }
    // water over low ground; ice on cold water
    for (let yy = SEA; yy > y; yy--) if (!getBlock(col, x, yy, z)) setBlock(col, x, yy, z, yy === SEA && BIOMES[b].cold ? ice : water);
  }
  // lava lakes in deep caves
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = MINY + 1; y <= -55; y++) if (!getBlock(col, x, y, z)) setBlock(col, x, y, z, lava);
  // 5. trees and plants (also the trees of the neighbours that reach in)
  decorate(w, col, x0, z0, L, Math.max(top, SEA));
  // ocean monuments, over the sea floor and what grew on it; then ruins, shipwrecks and buried treasure
  drawMonuments(col, seed);
  drawOcean(col, seed);
  // desert pyramids and wells
  drawDesert(col, seed);
  // heightmap: the top block
  const high = Math.min(MINY + HEIGHT - 1, Math.max(top, SEA) + 40);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { let y = high; while (y > MINY && !getBlock(col, x, y, z)) y--; col.height[z * 16 + x] = y; }
  // 6. villages
  drawVillages(col, seed);
  return col;
}
const isSolidGround = v => v && v !== ID.water && v !== ID.lava;
function surfaceBlock(b, depth, y, slope, l, rnd, patch) {
  const name = BIOMES[b].name, under = y < SEA - 1;
  if (name.endsWith('ocean')) return depth < 3 ? (l.h < SEA - 18 ? ID.gravel : rnd < 0.15 && name !== 'frozen_ocean' ? ID.clay : ID.sand) : ID.stone;
  if (name.endsWith('river')) return depth < 2 ? (rnd < 0.2 ? ID.clay : rnd < 0.45 ? ID.gravel : ID.sand) : ID.stone;
  if (name === 'beach' || name === 'snowy_beach' || name === 'desert') return depth < 4 ? ID.sand : depth < 6 ? ID.sandstone : ID.stone;
  if (name === 'stony_peaks') return slope > 3 || rnd < 0.3 ? ID.stone : depth === 0 ? ID.grass_block : ID.dirt;
  if (name === 'mangrove_swamp') return depth < 3 ? ID.mud : depth < 5 ? ID.dirt : ID.stone;
  if (name === 'snowy_slopes') return slope > 4 ? ID.stone : depth === 0 ? ID.snow_block : depth < 2 ? ID.dirt : ID.stone;
  if (slope > 5 && l.mountain > 0.2) return ID.stone;
  if (under) return depth < 3 ? (rnd < 0.3 ? ID.gravel : ID.dirt) : ID.stone;
  // the old growth taigas: patches of coarse dirt and podzol among the grass
  if (depth === 0 && name.startsWith('old_growth') && name.endsWith('taiga')) return patch > 0.22 ? ID.coarse_dirt : patch < -0.08 || rnd < 0.25 ? ID.podzol : ID.grass_block;
  // the bamboo jungle: patches of podzol
  if (depth === 0 && name === 'bamboo_jungle') return patch > 0.1 ? ID.podzol : ID.grass_block;
  if (depth === 0) return name === 'taiga' && rnd < 0.3 || name === 'snowy_taiga' && rnd < 0.15 ? ID.podzol : name === 'savanna' && rnd < 0.08 ? ID.coarse_dirt : ID.grass_block;
  return depth < 4 ? ID.dirt : ID.stone;
}
function vein(col, r, cx, cy, cz, size, block, deep, seed) {
  // a blob grown from the centre: size blocks, staying off the column's edge
  let x = cx, y = cy, z = cz;
  for (let i = 0; i < size; i++) {
    if (x >= 0 && x < 16 && z >= 0 && z < 16) {
      const v = getBlock(col, x, y, z);
      if (v === ID.stone || v === ID.deepslate) setBlock(col, x, y, z, v === ID.deepslate ? deep : block);
    }
    const d = Math.floor(r() * 6);
    if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
    if (x < 0 || x > 15) x = cx; if (z < 0 || z > 15) z = cz;
  }
}
function carve(w, col, x0, z0, L, top) {
  // noise on a coarse grid (every 4 blocks across, 4 up); each block column takes its share across, then up linearly
  const GX = 5, GY = Math.min(HEIGHT / 4, ((top - MINY) >> 2) + 2) + 1, cheese = new Float32Array(GX * GX * GY), tube = new Float32Array(GX * GX * GY);
  for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) {
    const x = x0 + gx * 4, z = z0 + gz * 4, y = MINY + gy * 4, i = (gz * GX + gx) * GY + gy;
    cheese[i] = w.cheese.n3(x, y * 1.6, z) + (y < 0 ? 0.08 : 0) - (y > 40 ? (y - 40) * 0.006 : 0); // big rooms where > 0.42
    const a = w.spagA.n3(x / 70, y / 45, z / 70), b = w.spagB.n3(x / 70, y / 45, z / 70);
    tube[i] = Math.min((a * a + b * b) * 30, Math.abs(w.noodle.n3(x / 35, y / 30, z / 35)) * 9 + (y > 30 ? 0.5 : 0)); // tunnels where < 0.12
  }
  const c = new Float32Array(GY), t = new Float32Array(GY), bedrock = ID.bedrock;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const l = L(x, z), open = w.open.n2(x0 + x, z0 + z) > 0.35 && l.h > SEA + 2 && l.mountain < 0.15;
    const roof = Math.min(l.h < SEA + 1 ? l.h - 9 : open ? l.h + 30 : l.h - 5, top + 1, MINY + (GY - 1) * 4);
    const gx = x >> 2, gz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
    const i00 = (gz * GX + gx) * GY, i10 = (gz * GX + gx + 1) * GY, i01 = ((gz + 1) * GX + gx) * GY, i11 = ((gz + 1) * GX + gx + 1) * GY;
    for (let g = 0; g < GY; g++) {
      c[g] = lerp(lerp(cheese[i00 + g], cheese[i10 + g], fx), lerp(cheese[i01 + g], cheese[i11 + g], fx), fz);
      t[g] = lerp(lerp(tube[i00 + g], tube[i10 + g], fx), lerp(tube[i01 + g], tube[i11 + g], fx), fz);
    }
    const idx = z << 4 | x;
    for (let y = MINY + 5; y < roof; y++) {
      const s = col.sections[(y - MINY) >> 4];
      if (!s) { y |= 15; continue; }
      const k = ((y - MINY) & 15) << 8 | idx, v = s[k];
      if (!v || v === bedrock) continue;
      const g = (y - MINY) >> 2, f = ((y - MINY) & 3) / 4;
      if (c[g] + (c[g + 1] - c[g]) * f > 0.42 || t[g] + (t[g + 1] - t[g]) * f < 0.12) s[k] = 0;
    }
  }
}

// ---------- trees and plants ----------
/** A mangrove swamp's ground by the sea: down to the sea's level, or one under it (shallow water), in patches. */
export const mangroveTop = (w, x, z, h) => h > SEA + 2 ? h : Math.min(h, w.open.n2(x * 1.9 + 7000, z * 1.9) > 0.05 ? SEA : SEA - 1);
/**
 * The top of the ground where mountains hang over (the same noise the column's overhangs come from, so a tree on a
 * high meadow or in a cherry grove stands on it), else the land's height.
 */
function groundAt(w, x, z, l) {
  if (!(l.mountain > 0.15)) return l.h;
  const over = l.mountain, gx = Math.floor(x / 4) * 4, gz = Math.floor(z / 4) * 4, fx = (x - gx) / 4, fz = (z - gz) / 4, levels = new Map();
  const at = g => {
    if (!levels.has(g)) { const yy = MINY + g * 4, n = (px, pz) => w.over.n3(px / 28, yy / 20, pz / 28); levels.set(g, lerp(lerp(n(gx, gz), n(gx + 4, gz), fx), lerp(n(gx, gz + 4), n(gx + 4, gz + 4), fx), fz)); }
    return levels.get(g);
  };
  for (let y = l.h + 24; y > l.h - 30; y--) {
    const g = (y - MINY) >> 2, n = at(g) + (at(g + 1) - at(g)) * (((y - MINY) & 3) / 4);
    if ((l.h - y) / (6 + over * 14) + n * over * 1.1 > 0) return y;
  }
  return l.h - 30;
}
/** Where mangrove roots can grow, from the land (open over the ground, mud in its top three in a mangrove swamp). */
function soilOf(w) {
  const tops = new Map();
  return (x, y, z) => {
    const k = x * 65536 + z;
    if (!tops.has(k)) { const l = landAt(w, x, z), swamp = BIOMES[l.biome].name === 'mangrove_swamp'; tops.set(k, [swamp ? mangroveTop(w, x, z, l.h) : l.h, swamp]); }
    const [top, swamp] = tops.get(k);
    return y > top ? 0 : swamp && y > top - 3 ? 1 : 2;
  };
}
const TREE_GRID = 5;
/** The trees whose cells are near a column: [{x, z, y (ground), kind, r}], the same whichever column asks (a big one
 * reaches up to 10 blocks from its trunk). */
function treesNear(w, cx, cz) {
  const out = [], seed = w.seed;
  const gx0 = Math.floor((cx * 16 - 10) / TREE_GRID), gx1 = Math.floor((cx * 16 + 25) / TREE_GRID);
  const gz0 = Math.floor((cz * 16 - 10) / TREE_GRID), gz1 = Math.floor((cz * 16 + 25) / TREE_GRID);
  for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
    const x = gx * TREE_GRID + Math.floor(hash(seed + 21, gx, gz) * TREE_GRID), z = gz * TREE_GRID + Math.floor(hash(seed + 22, gx, gz) * TREE_GRID);
    const l = landAt(w, x, z), b = BIOMES[l.biome].name;
    const density = TREE_DENSITY[b] || 0;
    if (!density || hash(seed + 23, gx, gz) > density) continue;
    // (mangroves grow in shallow water; cherry trees and the meadow's on the mountains' high ground)
    const swamp = b === 'mangrove_swamp', high = b === 'meadow' || b === 'cherry_grove';
    if ((swamp ? l.h < SEA - 2 : l.h <= SEA) || (l.mountain > 0.15 && !high) || l.river > 0) continue;
    // only the trees that reach into this column
    const kind = treeKind(b, hash(seed + 24, gx, gz));
    const reach = REACH[kind] ?? 10, dx = Math.max(cx * 16 - x, 0, x - (cx * 16 + 15)), dz = Math.max(cz * 16 - z, 0, z - (cz * 16 + 15));
    if (dx > reach || dz > reach) continue;
    if (w.open.n2(x, z) > 0.35) continue;
    // not on slopes (on the mountains' high ground, where each tree finds the ground's own top, steeper ones too)
    const slope = Math.max(Math.abs(landAt(w, x + 1, z).h - landAt(w, x - 1, z).h), Math.abs(landAt(w, x, z + 1).h - landAt(w, x, z - 1).h));
    if (slope > (high ? 4 : 2)) continue;
    if (kind) out.push({x, z, y: swamp ? mangroveTop(w, x, z, l.h) : high ? groundAt(w, x, z, l) : l.h, kind, r: rng(Math.floor(hash(seed + 25, x, z) * 2147483647)), ...(swamp ? {soil: soilOf(w)} : {})});
  }
  return out;
}
export const TREE_DENSITY = {plains: 0.03, sunflower_plains: 0.02, forest: 0.75, flower_forest: 0.35, birch_forest: 0.7, old_growth_birch_forest: 0.7, dark_forest: 0.9, swamp: 0.25, taiga: 0.6, snowy_taiga: 0.45,
  old_growth_pine_taiga: 0.7, old_growth_spruce_taiga: 0.7, snowy_plains: 0.02, savanna: 0.08, jungle: 0.95, meadow: 0.02, beach: 0, cherry_grove: 0.55, mangrove_swamp: 0.35, bamboo_jungle: 0.4};
// how far a tree reaches out from its trunk (leaves, vines, the podzol round a giant spruce), on the + side of a 2×2 one
const REACH = {oak: 3, birch: 3, tall_birch: 3, jungle: 4, jungle_bush: 3, spruce: 4, pine: 4, swamp_oak: 5, acacia: 7, dark_oak: 7, fancy_oak: 9, mega_spruce: 7, mega_pine: 7, mega_jungle: 10, cherry: 8, mangrove: 10, tall_mangrove: 10};
/** Which tree, by the game's shares in each biome (its list is tried in turn, each with its own chance). */
function treeKind(b, p) {
  switch (b) {
    case 'plains': case 'sunflower_plains': return p < 1 / 3 ? 'fancy_oak' : 'oak';
    case 'forest': case 'flower_forest': return p < 0.2 ? 'birch' : p < 0.28 ? 'fancy_oak' : 'oak';
    case 'birch_forest': return 'birch';
    case 'old_growth_birch_forest': return p < 0.5 ? 'tall_birch' : 'birch';
    case 'dark_forest': return p < 2 / 3 ? 'dark_oak' : p < 0.733 ? 'birch' : p < 0.76 ? 'fancy_oak' : 'oak';
    case 'taiga': case 'snowy_taiga': return p < 1 / 3 ? 'pine' : 'spruce';
    case 'old_growth_pine_taiga': return p < 0.0256 ? 'mega_spruce' : p < 0.3254 ? 'mega_pine' : p < 0.5503 ? 'pine' : 'spruce';
    case 'old_growth_spruce_taiga': return p < 1 / 3 ? 'mega_spruce' : p < 0.5556 ? 'pine' : 'spruce';
    case 'snowy_plains': return 'spruce';
    case 'savanna': return p < 0.8 ? 'acacia' : 'oak';
    case 'jungle': return p < 0.1 ? 'fancy_oak' : p < 0.55 ? 'jungle_bush' : p < 0.7 ? 'mega_jungle' : 'jungle';
    case 'swamp': return 'swamp_oak';
    case 'meadow': return p < 0.5 ? 'tall_birch' : 'fancy_oak';
    case 'cherry_grove': return 'cherry';
    case 'mangrove_swamp': return p < 0.85 ? 'tall_mangrove' : 'mangrove';
    case 'bamboo_jungle': return p < 0.05 ? 'fancy_oak' : p < 0.2 ? 'jungle_bush' : p < 0.9 ? 'mega_jungle' : 'jungle';
    default: return 'oak';
  }
}
/** Mossy boulders of the old growth taigas: [{x, y (the first block over the ground), z, r}] near a column. */
const ROCK_GRID = 8;
function rocksNear(w, cx, cz) {
  const out = [], seed = w.seed;
  for (let gz = Math.floor((cz * 16 - 4) / ROCK_GRID); gz <= Math.floor((cz * 16 + 19) / ROCK_GRID); gz++) for (let gx = Math.floor((cx * 16 - 4) / ROCK_GRID); gx <= Math.floor((cx * 16 + 19) / ROCK_GRID); gx++) {
    if (hash(seed + 41, gx, gz) > 0.5) continue;
    const x = gx * ROCK_GRID + Math.floor(hash(seed + 42, gx, gz) * ROCK_GRID), z = gz * ROCK_GRID + Math.floor(hash(seed + 43, gx, gz) * ROCK_GRID);
    const l = landAt(w, x, z), b = BIOMES[l.biome].name;
    if (!(b.startsWith('old_growth') && b.endsWith('taiga')) || l.h <= SEA || l.river > 0) continue;
    out.push({x, y: l.h + 1, z, r: rng(Math.floor(hash(seed + 44, x, z) * 2147483647))});
  }
  return out;
}
/** The game's forest rock: three small balls of mossy cobblestone, each a step down and aside from the last. */
function growRock({x, y, z, r}, put) {
  for (let i = 0; i < 3; i++) {
    const j = Math.floor(r() * 2), k = Math.floor(r() * 2), l = Math.floor(r() * 2), f = (j + k + l) * 0.333 + 0.5;
    for (let dx = -j; dx <= j; dx++) for (let dy = -k; dy <= k; dy++) for (let dz = -l; dz <= l; dz++) if (dx * dx + dy * dy + dz * dz <= f * f) put(x + dx, y + dy, z + dz, ID.mossy_cobblestone, true);
    x += Math.floor(r() * 2) - 1; y -= Math.floor(r() * 2); z += Math.floor(r() * 2) - 1;
  }
}
function decorate(w, col, x0, z0, L, top) {
  const inside = (wx, wz) => wx >= x0 && wx < x0 + 16 && wz >= z0 && wz < z0 + 16;
  // force (a trunk, the dirt under it, a boulder) goes over plants, leaves, logs, grass and dirt — not stone
  const put = (wx, y, wz, v, force = false) => {
    if (!inside(wx, wz)) return;
    const x = wx - x0, z = wz - z0, old = getBlock(col, x, y, z);
    if (old && !(force ? TRUNK_OVER : REPLACEABLE).has(old & 0xFFF)) return;
    // half of a tall plant grown over: the other half goes too
    if (old && TALL_PLANTS.has(old & 0xFFF)) { const oy = old >>> 12 & 8 ? y - 1 : y + 1; if ((getBlock(col, x, oy, z) & 0xFFF) === (old & 0xFFF)) setBlock(col, x, oy, z, 0); }
    setBlock(col, x, y, z, v);
  };
  const get = (wx, y, wz) => inside(wx, wz) ? getBlock(col, wx - x0, y, wz - z0) : -1;
  const seed = w.seed;
  // the old growth taigas' mossy boulders, then plants on the ground (trees grow over them), snow last
  for (const rock of rocksNear(w, col.cx, col.cz)) growRock(rock, put);
  // the trees here (grown after the plants), and where their trunks stand (no bamboo there)
  const trees = treesNear(w, col.cx, col.cz), trunks = new Set();
  for (const t of trees) for (const [dx, dz] of BIG_TREES.has(t.kind) ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) trunks.add((t.x + dx) * 65536 + t.z + dz);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = x0 + x, wz = z0 + z, b = BIOMES[col.biome[z * 16 + x]].name;
    let y = top + 1;
    while (y > MINY && !getBlock(col, x, y, z)) y--;
    const g = getBlock(col, x, y, z), above = y + 1, rnd = hash(seed + 31, wx, wz), rnd2 = hash(seed + 32, wx, wz), rnd3 = hash(seed + 33, wx, wz);
    if (getBlock(col, x, above, z)) continue;
    // a plant two blocks tall: both halves (where there is room)
    const tall = id => { if (getBlock(col, x, above + 1, z)) return false; put(wx, above, wz, id); put(wx, above + 1, wz, withMeta(id, 8)); return true; };
    if (g === ID.grass_block || g === ID.podzol) {
      // pink petals over the cherry grove's ground; bamboo in the bamboo jungle (a little in the jungle), thick stalks
      // five to sixteen high, leaves on their top three
      if (b === 'cherry_grove' && rnd > 0.7) { put(wx, above, wz, withMeta(ID.pink_petals, Math.floor(rnd2 * 4) | Math.floor(rnd3 * 4) << 2)); continue; }
      if ((b === 'bamboo_jungle' ? rnd > 0.72 : b === 'jungle' && rnd > 0.996) && !trunks.has(wx * 65536 + wz)) {
        const n = 5 + Math.floor(rnd2 * 12);
        let k = 0;
        while (k < n && !getBlock(col, x, above + k, z)) setBlock(col, x, above + k++, z, withMeta(ID.bamboo, 4));
        if (k >= 3) { setBlock(col, x, above + k - 1, z, withMeta(ID.bamboo, 2 | 4 | 8)); setBlock(col, x, above + k - 2, z, withMeta(ID.bamboo, 2 | 4)); setBlock(col, x, above + k - 3, z, withMeta(ID.bamboo, 1 | 4)); }
        continue;
      }
      const f = FLOWERS[b] || FLOWERS.plains, grass = GRASS[b] ?? 0.2, big = BIG_FLOWERS[b];
      if (rnd < grass) {
        const fern = b.includes('taiga') && rnd2 < (b.startsWith('old_growth') ? 0.6 : 0.45) || (b === 'jungle' || b === 'bamboo_jungle') && rnd2 < 0.3;
        if (!(rnd3 < (TALL[b] || 0) && tall(fern ? ID.large_fern : ID.tall_grass))) put(wx, above, wz, fern ? ID.fern : ID.short_grass);
      }
      else if (rnd < grass + f.rate) put(wx, above, wz, ID[f.kinds[Math.floor(rnd2 * f.kinds.length)]]);
      else if (big && rnd < grass + f.rate + big.rate) tall(ID[big.kinds[Math.floor(rnd2 * big.kinds.length)]]);
      else if ((b === 'dark_forest' || b === 'swamp' || b.startsWith('old_growth') && b.endsWith('taiga')) && rnd > 0.985) put(wx, above, wz, rnd2 < 0.5 ? ID.red_mushroom : ID.brown_mushroom);
      else if ((b === 'plains' || b === 'taiga') && rnd > 0.9994) put(wx, above, wz, ID.pumpkin);
      else if ((b === 'jungle' || b === 'bamboo_jungle') && rnd > 0.997) put(wx, above, wz, ID.melon);
    }
    if ((g === ID.sand || g === ID.grass_block || g === ID.dirt) && y === SEA && rnd > 0.9 && nearWater(col, x, y, z)) {
      const hgt = 1 + Math.floor(rnd2 * 3);
      for (let k = 1; k <= hgt; k++) put(wx, y + k, wz, ID.sugar_cane);
    }
    if (g === ID.sand && b === 'desert') {
      if (rnd > 0.994 && !getBlock(col, x + 1 & 15, above, z) ) { const hgt = 1 + Math.floor(rnd2 * 3); for (let k = 1; k <= hgt; k++) put(wx, y + k, wz, ID.cactus); }
      else if (rnd > 0.985) put(wx, above, wz, ID.dead_bush);
    }
  }
  for (const t of trees) growTree(t, put, get);
  seaLife(w, col, x0, z0, top);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const b = BIOMES[col.biome[z * 16 + x]].name;
    if (BIOMES[col.biome[z * 16 + x]].cold && b !== 'frozen_ocean' && b !== 'frozen_river') {
      let yy = Math.min(MINY + HEIGHT - 2, top + 40);
      while (yy > MINY && !getBlock(col, x, yy, z)) yy--;
      const t = getBlock(col, x, yy, z) & 0xFFF;
      if (t && t !== ID.water && t !== ID.ice && t !== ID.lava && !CROSS.has(t) && t !== ID.snow) setBlock(col, x, yy + 1, z, ID.snow);
      if (t === ID.grass_block) setBlock(col, x, yy, z, withMeta(ID.grass_block, 1));
    }
  }
}
// what a tree's leaves may grow into (the game's: air, small plants, leaves), and what its trunk may also go over
const WOOD_KINDS = ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove'];
const TALL_PLANTS = new Set([ID.tall_grass, ID.large_fern, ID.sunflower, ID.lilac, ID.rose_bush, ID.peony]);
const REPLACEABLE = new Set([0, ID.short_grass, ID.fern, ID.snow, ID.dead_bush, ID.vine, ID.tall_grass, ID.large_fern, ID.sunflower, ID.lilac, ID.rose_bush, ID.peony, ID.pink_petals, ID.mangrove_propagule,
  ...['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'red_mushroom', 'brown_mushroom'].map(n => ID[n]), ...WOOD_KINDS.map(n => ID[`${n}_leaves`])]);
const TRUNK_OVER = new Set([...REPLACEABLE, ID.grass_block, ID.dirt, ID.podzol, ID.coarse_dirt, ID.cocoa, ...WOOD_KINDS.map(n => ID[`${n}_log`]),
  ID.water, ID.mud, ID.mangrove_roots, ID.muddy_mangrove_roots, ID.bamboo]);
const CROSS = new Set(['short_grass', 'fern', 'dandelion', 'poppy', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'dead_bush', 'sugar_cane', 'red_mushroom', 'brown_mushroom', 'tall_grass', 'large_fern', 'sunflower', 'lilac', 'rose_bush', 'peony', 'vine', 'cocoa'].map(n => ID[n]));
const GRASS = {plains: 0.35, sunflower_plains: 0.35, meadow: 0.6, forest: 0.18, flower_forest: 0.15, birch_forest: 0.2, old_growth_birch_forest: 0.2, dark_forest: 0.12, swamp: 0.25, taiga: 0.22, snowy_taiga: 0.1,
  old_growth_pine_taiga: 0.3, old_growth_spruce_taiga: 0.3, snowy_plains: 0.04, savanna: 0.5, jungle: 0.35, stony_peaks: 0.05, desert: 0, cherry_grove: 0.25, mangrove_swamp: 0.08, bamboo_jungle: 0.3};
// how much of the grass grows two blocks tall (tall grass, or the large fern where ferns grow)
const TALL = {plains: 0.08, sunflower_plains: 0.08, savanna: 0.15, meadow: 0.06, jungle: 0.12, forest: 0.03, flower_forest: 0.03, birch_forest: 0.03, old_growth_birch_forest: 0.03, dark_forest: 0.04,
  taiga: 0.15, snowy_taiga: 0.08, old_growth_pine_taiga: 0.3, old_growth_spruce_taiga: 0.3, cherry_grove: 0.04, bamboo_jungle: 0.12};
// the tall flowers: lilac, rose bush and peony in forests (many in the flower forest), sunflowers on their plains
const FOREST_FLOWERS = ['lilac', 'rose_bush', 'peony'];
const BIG_FLOWERS = {forest: {rate: 0.004, kinds: FOREST_FLOWERS}, flower_forest: {rate: 0.05, kinds: FOREST_FLOWERS}, birch_forest: {rate: 0.002, kinds: FOREST_FLOWERS},
  old_growth_birch_forest: {rate: 0.003, kinds: FOREST_FLOWERS}, sunflower_plains: {rate: 0.06, kinds: ['sunflower', 'red_tulip', 'orange_tulip', 'red_tulip', 'orange_tulip']}};
const FLOWERS = {
  plains: {rate: 0.025, kinds: ['dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower']}, meadow: {rate: 0.08, kinds: ['dandelion', 'poppy', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip']},
  forest: {rate: 0.02, kinds: ['dandelion', 'poppy', 'lily_of_the_valley']}, birch_forest: {rate: 0.02, kinds: ['dandelion', 'poppy', 'lily_of_the_valley']},
  flower_forest: {rate: 0.12, kinds: ['dandelion', 'poppy', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip']}, old_growth_birch_forest: {rate: 0.02, kinds: ['dandelion', 'poppy', 'lily_of_the_valley']},
  old_growth_pine_taiga: {rate: 0.004, kinds: ['dandelion', 'poppy']}, old_growth_spruce_taiga: {rate: 0.004, kinds: ['dandelion', 'poppy']}, sunflower_plains: {rate: 0.025, kinds: ['dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower']},
  dark_forest: {rate: 0.006, kinds: ['poppy', 'dandelion']}, swamp: {rate: 0.02, kinds: ['blue_orchid']}, taiga: {rate: 0.004, kinds: ['dandelion', 'poppy']},
  snowy_taiga: {rate: 0, kinds: ['poppy']}, snowy_plains: {rate: 0, kinds: ['poppy']}, savanna: {rate: 0.006, kinds: ['dandelion', 'poppy']}, jungle: {rate: 0.006, kinds: ['dandelion', 'poppy']},
  cherry_grove: {rate: 0, kinds: ['poppy']}, mangrove_swamp: {rate: 0, kinds: ['poppy']}, bamboo_jungle: {rate: 0.006, kinds: ['dandelion', 'poppy']},
};
/**
 * What grows on the floor of the sea and the rivers (the game's, roughly): seagrass (taller where the water is deep
 * enough), kelp in tall stems in the cold and temperate seas (in patches, up to near the top), and in the warm sea coral
 * reefs — mounds of coral blocks with corals, fans and sea pickles on them; sea pickles here and there.
 */
const CORAL_KINDS = ['tube', 'brain', 'bubble', 'fire', 'horn'];
function seaLife(w, col, x0, z0, top) {
  const seed = w.seed, {water} = ID;
  const still = (x, y, z) => getBlock(col, x, y, z) === water;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const name = BIOMES[col.biome[z * 16 + x]].name, sea = name.endsWith('ocean'), river = name.endsWith('river');
    if ((!sea && !river) || name.startsWith('frozen')) continue;
    let y = Math.min(top, SEA);
    while (y > MINY && getBlock(col, x, y, z) === water) y--;
    const g = getBlock(col, x, y, z) & 0xFFF, depth = SEA - y;
    if (depth < 2 || !still(x, y + 1, z) || ![ID.sand, ID.gravel, ID.dirt, ID.clay, ID.stone].includes(g)) continue;
    const wx = x0 + x, wz = z0 + z, rnd = hash(seed + 51, wx, wz), rnd2 = hash(seed + 52, wx, wz), patch = w.open.n2(wx * 1.3 + 2000, wz * 1.3);
    // the warm sea's reefs: in patches, a pillar of one coral's blocks one to four high, a coral or a fan on top
    if (name === 'warm_ocean' && patch > -0.05 && depth > 3) {
      const c = CORAL_KINDS[Math.floor(hash(seed + 53, wx >> 2, wz >> 2) * 5)], hgt = 1 + Math.floor(((patch + 0.05) * 3.2 + rnd2) * 1.5);
      let k = 0;
      for (; k < Math.min(hgt, depth - 2); k++) setBlock(col, x, y + 1 + k, z, ID[`${c}_coral_block`]);
      // fans on the pillar's sides, in the water by it
      for (let kk = 0; kk < k; kk++) for (const [dx, dz, meta] of [[1, 0, 2], [-1, 0, 1], [0, 1, 4], [0, -1, 3]]) {
        const fx = x + dx, fz = z + dz, fy = y + 1 + kk;
        if (fx < 0 || fz < 0 || fx > 15 || fz > 15 || !still(fx, fy, fz) || hash(seed + 54, wx * 4 + dx, fy, wz * 4 + dz) > 0.12) continue;
        setBlock(col, fx, fy, fz, withMeta(ID[`${CORAL_KINDS[Math.floor(hash(seed + 55, wx, fy, wz + dz) * 5)]}_coral_fan`], meta));
      }
      const on = y + 1 + k;
      if (still(x, on, z) && still(x, on + 1, z)) {
        if (rnd < 0.3) setBlock(col, x, on, z, ID[`${CORAL_KINDS[Math.floor(rnd2 * 5)]}_coral`]);
        else if (rnd < 0.55) setBlock(col, x, on, z, ID[`${CORAL_KINDS[Math.floor(rnd2 * 5)]}_coral_fan`]);
        else if (rnd < 0.6) setBlock(col, x, on, z, withMeta(ID.sea_pickle, Math.floor(rnd2 * 4)));
      }
      continue;
    }
    // now and then on the deep sea floor a magma block, bubbles pulling down over it to the top
    if (sea && depth > 12 && rnd > 0.9993) {
      setBlock(col, x, y, z, ID.magma_block);
      for (let k = y + 1; k <= SEA && still(x, k, z); k++) setBlock(col, x, k, z, withMeta(ID.bubble_column, 1));
      continue;
    }
    // kelp: stems one to ten high (the game's) in patches in the temperate and cold seas (not the warm one), never
    // reaching the top
    if (sea && name !== 'warm_ocean' && patch > 0.1 && rnd < 0.32 && depth > 3) {
      const hgt = Math.min(depth - 1, 1 + Math.floor(rnd2 * 10));
      for (let k = 1; k < hgt; k++) setBlock(col, x, y + k, z, ID.kelp_plant);
      setBlock(col, x, y + hgt, z, withMeta(ID.kelp, Math.floor(rnd2 * 16) + 8));
      continue;
    }
    // sea pickles now and then in the warm sea; seagrass everywhere else, tall where it is deep enough
    if (name === 'warm_ocean' && rnd > 0.985) { setBlock(col, x, y + 1, z, withMeta(ID.sea_pickle, Math.floor(rnd2 * 4))); continue; }
    if (rnd < (river ? 0.25 : name === 'warm_ocean' ? 0.35 : 0.3)) {
      if (hash(seed ^ 0x5f3759df, wz, wx) < 0.3 && depth > 2 && still(x, y + 2, z)) { setBlock(col, x, y + 1, z, ID.tall_seagrass); setBlock(col, x, y + 2, z, withMeta(ID.tall_seagrass, 8)); }
      else setBlock(col, x, y + 1, z, ID.seagrass);
    }
  }
}
function nearWater(col, x, y, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx > 15 || zz > 15) continue; if (getBlock(col, xx, y, zz) === ID.water) return true; }
  return false;
}
/** A place to start: dry land near the middle of the world. */
export function spawnPoint(seed) {
  const w = worldOf(seed);
  for (let r = 0; r < 4000; r += 16) for (let a = 0; a < Math.max(1, r / 8); a++) {
    const x = Math.round(Math.cos(a / Math.max(1, r / 8) * Math.PI * 2) * r), z = Math.round(Math.sin(a / Math.max(1, r / 8) * Math.PI * 2) * r);
    const l = landAt(w, x, z), b = BIOMES[l.biome].name;
    if (l.h > SEA + 1 && l.mountain < 0.1 && !b.includes('ocean') && !b.includes('river') && b !== 'beach') return {x: x + 0.5, y: l.h + 1, z: z + 0.5};
  }
  return {x: 0.5, y: 100, z: 0.5};
}
