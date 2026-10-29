// The desert's structures, made with the land one column at a time (as the monuments are). Desert pyramids: one try in
// each 32 × 32 chunks of desert, the game's temple of sandstone and terracotta — two towers at the front with the door
// between, the hall with its blue and orange floor, under that the hidden treasure room (four chests, nine TNT under a
// pressure plate) and, since the game's 1.20, a cellar half full of sand with suspicious sand in it. Each is built once
// as an array in its own frame (the door towards −z, as the game's code lays it out) and turned one of four ways; it
// stands on the lowest ground under it, sunk up to two more, with sandstone under it down to the ground. Desert wells:
// one in a thousand chunks of desert, a pool in a sandstone rim under a little roof, suspicious sand under its water.
import {hash, rng} from './noise.js';
import {ID, BLOCKS, MINY, HEIGHT, SEA, withMeta} from './blocks.js';
import {landAt, worldOf, getBlock, setBlock, BIOMES} from './gen.js';

const REGION = 32 * 16, W = 21, Y0 = -14, H = 25;   // a pyramid: 21 × 21, from 14 under its floor to 10 over it
const INSIDE = 0xFFFF;                               // air the building makes (its rooms, the shaft)
const at = (x, y, z) => ((y - Y0) * W + z) * W + x;
const isDesert = l => BIOMES[l.biome].name === 'desert';

// ---------- pyramids ----------
const pyramids = new Map();
/** The pyramid of a region (cached), or null: {x0, z0 (its corner), y (its floor), turn, seed}. */
export function pyramidIn(seed, rx, rz) {
  const key = `${seed}|${rx}|${rz}`;
  if (pyramids.has(key)) return pyramids.get(key);
  if (pyramids.size > 2000) pyramids.clear();
  const r = rng(Math.floor(hash(seed + 14357617, rx, 0, rz) * 2147483647)), w = worldOf(seed);
  // the game's spacing 32, separation 8: a chunk in the first 24 of each way
  const x0 = (rx * 32 + Math.floor(r() * 24)) * 16, z0 = (rz * 32 + Math.floor(r() * 24)) * 16;
  let p = null;
  const ground = [];
  for (let dz = 0; dz < W; dz += 4) for (let dx = 0; dx < W; dx += 4) ground.push(landAt(w, x0 + dx, z0 + dz));
  for (const [dx, dz] of [[20, 0], [0, 20], [20, 20]]) ground.push(landAt(w, x0 + dx, z0 + dz));
  if (ground.every(l => isDesert(l) && l.h > SEA)) {
    // on the lowest ground under it, sunk up to two more (the game's)
    const y = Math.min(...ground.map(l => l.h)) + 1 - Math.floor(r() * 3);
    p = {x0, z0, y, turn: Math.floor(r() * 4), seed: Math.floor(r() * 2147483647)};
  }
  pyramids.set(key, p);
  return p;
}
/** The pyramids whose ground reaches a column (corner x0, z0). */
export function pyramidsNear(seed, x0, z0) {
  const out = [];
  for (let rz = Math.floor((z0 - W) / REGION); rz <= Math.floor((z0 + 16) / REGION); rz++)
    for (let rx = Math.floor((x0 - W) / REGION); rx <= Math.floor((x0 + 16) / REGION); rx++) { const p = pyramidIn(seed, rx, rz); if (p) out.push(p); }
  return out;
}
// a place in the pyramid's own frame in the world, and back
function toWorld(p, x, z) {
  switch (p.turn) {
    case 1: return [p.x0 + W - 1 - z, p.z0 + x];
    case 2: return [p.x0 + W - 1 - x, p.z0 + W - 1 - z];
    case 3: return [p.x0 + z, p.z0 + W - 1 - x];
    default: return [p.x0 + x, p.z0 + z];
  }
}
function toLocal(p, wx, wz) {
  const a = wx - p.x0, b = wz - p.z0;
  switch (p.turn) {
    case 1: return [b, W - 1 - a];
    case 2: return [W - 1 - a, W - 1 - b];
    case 3: return [W - 1 - b, a];
    default: return [a, b];
  }
}
/** A block turned with the pyramid: stairs and chests face round with it (facing 0 south, 1 west, 2 north, 3 east). */
function turned(v, turn) {
  const id = v & 0xFFF, b = BLOCKS[id];
  if (!turn || !(b.shape === 'stairs' || b.facing)) return v;
  const m = v >>> 12;
  return withMeta(id, (m & ~3) | ((m & 3) + turn) & 3);
}

const plans = new Map();
/**
 * The pyramid's blocks (0: left as the land is), its chests and its suspicious sand ([x, y, z, table] in its frame),
 * from the game's code for it (DesertPyramidPiece): generateBox(x0, y0, z0, x1, y1, z1, edge, inside) is box().
 */
function plan(p) {
  if (plans.has(p.seed)) return plans.get(p.seed);
  if (plans.size > 8) plans.clear();
  const P = new Uint16Array(W * H * W), r = rng(p.seed), chests = [], sus = [];
  const put = (x, y, z, v) => { if (x >= 0 && x < W && y >= Y0 && y < Y0 + H && z >= 0 && z < W) P[at(x, y, z)] = v; };
  const box = (x0, y0, z0, x1, y1, z1, edge, inside = edge) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(x, y, z, x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1 ? edge : inside);
  };
  const SS = ID.sandstone, CUT = ID.cut_sandstone, CHIS = ID.chiseled_sandstone, ORANGE = ID.orange_terracotta, AIR = INSIDE, SAND = ID.sand;
  // stairs climbing that way (the game's facing): north, south, east, west
  const [N, S, E, Wst] = [2, 0, 3, 1].map(f => withMeta(ID.sandstone_stairs, f));
  // the base, and the pyramid: a ring a step in and up on each layer, hollow
  box(0, -4, 0, 20, 0, 20, SS);
  for (let i = 1; i <= 9; i++) { box(i, i, i, 20 - i, i, 20 - i, SS); box(i + 1, i, i + 1, 19 - i, i, 19 - i, AIR); }
  // the two towers at the front corners, stairs round their tops
  box(0, 0, 0, 4, 9, 4, SS, AIR); box(1, 10, 1, 3, 10, 3, SS);
  put(2, 10, 0, N); put(2, 10, 4, S); put(0, 10, 2, E); put(4, 10, 2, Wst);
  box(16, 0, 0, 20, 9, 4, SS, AIR); box(17, 10, 1, 19, 10, 3, SS);
  put(18, 10, 0, N); put(18, 10, 4, S); put(16, 10, 2, E); put(20, 10, 2, Wst);
  // the door between them, with a cut sandstone arch inside; passages from it to the towers
  box(8, 0, 0, 12, 4, 4, SS, AIR); box(9, 1, 0, 11, 3, 4, AIR);
  for (const [x, y] of [[9, 1], [9, 2], [9, 3], [10, 3], [11, 3], [11, 2], [11, 1]]) put(x, y, 1, CUT);
  box(4, 1, 1, 8, 3, 3, SS, AIR); box(4, 1, 2, 8, 2, 2, AIR);
  box(12, 1, 1, 16, 3, 3, SS, AIR); box(12, 1, 2, 16, 2, 2, AIR);
  // the hall: its ceiling open in the middle, four pillars, the side walls filled, little windows high on the sides
  box(5, 4, 5, 15, 4, 15, SS); box(9, 4, 9, 11, 4, 11, AIR);
  for (const [x, z] of [[8, 8], [12, 8], [8, 12], [12, 12]]) box(x, 1, z, x, 3, z, CUT);
  box(1, 1, 5, 4, 4, 11, SS); box(16, 1, 5, 19, 4, 11, SS);
  box(6, 7, 9, 6, 7, 11, SS); box(14, 7, 9, 14, 7, 11, SS);
  box(5, 5, 9, 5, 7, 11, CUT); box(15, 5, 9, 15, 7, 11, CUT);
  for (const [x, y] of [[5, 5], [5, 6], [6, 6], [15, 5], [15, 6], [14, 6]]) put(x, y, 10, AIR);
  // stairs up in the towers
  box(2, 4, 4, 2, 6, 4, AIR); box(18, 4, 4, 18, 6, 4, AIR);
  put(2, 4, 5, N); put(2, 3, 4, N); put(18, 4, 5, N); put(18, 3, 4, N);
  box(1, 1, 3, 2, 2, 3, SS); box(18, 1, 3, 19, 2, 3, SS);
  put(1, 1, 2, SS); put(19, 1, 2, SS); put(1, 2, 2, ID.sandstone_slab); put(19, 2, 2, ID.sandstone_slab);
  put(2, 1, 2, Wst); put(18, 1, 2, E);
  // the long rooms down both sides, pillars of cut and chiseled sandstone along them
  box(4, 3, 5, 4, 3, 17, SS); box(16, 3, 5, 16, 3, 17, SS);
  box(3, 1, 5, 4, 2, 16, AIR); box(15, 1, 5, 16, 2, 16, AIR);
  for (let z = 5; z <= 17; z += 2) { put(4, 1, z, CUT); put(4, 2, z, CHIS); put(16, 1, z, CUT); put(16, 2, z, CHIS); }
  // the floor: an orange star round the blue terracotta over the treasure
  for (const [x, z] of [[10, 7], [10, 8], [9, 9], [11, 9], [8, 10], [12, 10], [7, 10], [13, 10], [9, 11], [11, 11], [10, 12], [10, 13]]) put(x, 0, z, ORANGE);
  put(10, 0, 10, ID.blue_terracotta);
  // the towers' faces: bands of terracotta and chiseled sandstone, on their outer sides and their fronts
  const band = [[2, [CUT, ORANGE, CUT]], [3, [CUT, ORANGE, CUT]], [4, [ORANGE, CHIS, ORANGE]], [5, [CUT, ORANGE, CUT]], [6, [ORANGE, CHIS, ORANGE]], [7, [ORANGE, ORANGE, ORANGE]], [8, [CUT, CUT, CUT]]];
  for (const x of [0, 20]) for (const [y, row] of band) row.forEach((v, k) => put(x, y, 1 + k, v));
  for (const x of [2, 18]) for (const [y, row] of band) row.forEach((v, k) => put(x - 1 + k, y, 0, v));
  box(8, 4, 0, 12, 6, 0, CUT); put(8, 6, 0, AIR); put(12, 6, 0, AIR);
  put(9, 5, 0, ORANGE); put(10, 5, 0, CHIS); put(11, 5, 0, ORANGE);
  // the treasure room: a shaft down from under the blue terracotta, a chest in a niche each way, nine TNT under the
  // pressure plate in the middle
  box(8, -14, 8, 12, -11, 12, CUT); box(8, -10, 8, 12, -10, 12, CHIS); box(8, -9, 8, 12, -9, 12, CUT); box(8, -8, 8, 12, -1, 12, SS);
  box(9, -11, 9, 11, -1, 11, AIR);
  put(10, -11, 10, ID.stone_pressure_plate);
  box(9, -13, 9, 11, -13, 11, ID.tnt);
  for (const [dx, dz, f] of [[0, 1, 2], [-1, 0, 3], [0, -1, 0], [1, 0, 1]]) {
    const x = 10 + dx * 2, z = 10 + dz * 2;
    put(x, -11, z, AIR); put(x, -10, z, AIR); put(x + dx, -10, z + dz, CHIS); put(x + dx, -11, z + dz, CUT);
    put(x, -11, z, withMeta(ID.chest, f)); chests.push([x, -11, z, 'desert_pyramid']);
  }
  // the cellar (the game's 1.20): stairs down from under the back of the hall, choked with the sand that has fallen in
  // through the floor, to a room whose floor is heaped with sand; five to seven of its sand blocks, and one where the
  // roof fell, are suspicious
  put(13, -1, 17, Wst); put(14, -2, 17, Wst); put(15, -3, 17, Wst);
  box(16, -4, 13, 18, -2, 17, AIR);
  const heaps = [];
  for (let z = 13; z <= 17; z++) for (let x = 16; x <= 18; x++) { put(x, -4, z, SAND); heaps.push([x, -4, z]); }
  for (const [x, z] of [[18, 13], [17, 13], [18, 14]]) { put(x, -3, z, SAND); heaps.push([x, -3, z]); }
  const flag = r() < 0.5;
  for (let x = 12; x <= 16; x++) put(x, 0, 17, SAND);
  put(14, -1, 17, SAND); put(15, -1, 17, flag ? SAND : SS); put(16, -1, 17, flag ? SS : SAND);
  put(15, -2, 17, SAND); put(16, -2, 17, SS); put(16, -3, 17, SAND);
  for (let i = heaps.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [heaps[i], heaps[j]] = [heaps[j], heaps[i]]; }
  for (const [x, y, z] of [...heaps.slice(0, 5 + Math.floor(r() * 3)), [15, -2, 17]]) { put(x, y, z, ID.suspicious_sand); sus.push([x, y, z, 'desert_pyramid_archaeology']); }
  const out = {P, chests, sus};
  plans.set(p.seed, out);
  return out;
}

// ---------- wells ----------
const wells = new Map();
/** The desert well of a chunk (cached), or null: {x, y (the sand's top), z, seed} — one in a thousand chunks of desert. */
export function wellIn(seed, cx, cz) {
  const key = `${seed}|${cx}|${cz}`;
  if (wells.has(key)) return wells.get(key);
  if (wells.size > 4000) wells.clear();
  let wl = null;
  if (hash(seed + 30011, cx, 0, cz) < 0.001) {
    const r = rng(Math.floor(hash(seed + 30013, cx, 0, cz) * 2147483647)), x = cx * 16 + 2 + Math.floor(r() * 12), z = cz * 16 + 2 + Math.floor(r() * 12), l = landAt(worldOf(seed), x, z);
    if (isDesert(l) && l.h > SEA) wl = {x, y: l.h, z, seed: Math.floor(r() * 2147483647)};
  }
  wells.set(key, wl);
  return wl;
}
/**
 * A well's blocks ([x, y, z, v] in the world; later ones over earlier) and its two suspicious sands, from the game's
 * code for it (DesertWellFeature): its floor and rim of sandstone, water in a cross, a pillar at each inner corner, a
 * roof of slabs round a block of sandstone.
 */
export function wellBlocks(wl) {
  const out = [], {x, y, z} = wl, r = rng(wl.seed), put = (dx, dy, dz, v) => out.push([x + dx, y + dy, z + dz, v]);
  for (let dy = -1; dy <= 0; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) put(dx, dy, dz, ID.sandstone);
  const cross = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const [dx, dz] of cross) { put(dx, 0, dz, ID.water); put(dx, -1, dz, ID.sand); }
  for (let dy = 1; dy <= 3; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(dx, dy, dz, 0);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) put(dx, 1, dz, ID.sandstone);
  for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) put(dx, 1, dz, ID.sandstone_slab);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(dx, 4, dz, dx || dz ? ID.sandstone_slab : ID.sandstone);
  for (let dy = 1; dy <= 3; dy++) for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) put(dx, dy, dz, ID.sandstone);
  // under one of the water's blocks, and again under one of them a block further down
  const sus = [];
  for (const dy of [-1, -2]) { const [dx, dz] = cross[Math.floor(r() * 5)]; put(dx, dy, dz, ID.suspicious_sand); sus.push([x + dx, y + dy, z + dz]); }
  return {blocks: out, sus};
}

// ---------- in a column ----------
/** Draws the parts of pyramids and wells in a column (after the land and its plants). */
export function drawDesert(col, seed) {
  const x0 = col.cx * 16, z0 = col.cz * 16;
  for (const p of pyramidsNear(seed, x0, z0)) {
    if (p.x0 >= x0 + 16 || p.x0 + W <= x0 || p.z0 >= z0 + 16 || p.z0 + W <= z0) continue;
    const {P} = plan(p);
    for (let z = Math.max(0, p.z0 - z0); z < Math.min(16, p.z0 + W - z0); z++) for (let x = Math.max(0, p.x0 - x0); x < Math.min(16, p.x0 + W - x0); x++) {
      const [lx, lz] = toLocal(p, x0 + x, z0 + z);
      let low = -4;
      for (let ly = Y0; ly < Y0 + H; ly++) {
        const v = P[at(lx, ly, lz)], y = p.y + ly;
        if (!v) continue;
        low = Math.min(low, ly);
        if (y > MINY && y < MINY + HEIGHT) setBlock(col, x, y, z, v === INSIDE ? 0 : turned(v, p.turn));
      }
      // under it, sandstone down to the ground (the game's, from five under the floor — done before its rooms below are
      // dug, so never into them)
      for (let y = p.y + low - 1; y > MINY; y--) {
        const v = getBlock(col, x, y, z);
        if (v && (v & 0xFFF) !== ID.water && (v & 0xFFF) !== ID.lava) break;
        setBlock(col, x, y, z, ID.sandstone);
      }
    }
  }
  for (let cz = col.cz - 1; cz <= col.cz + 1; cz++) for (let cx = col.cx - 1; cx <= col.cx + 1; cx++) {
    const wl = wellIn(seed, cx, cz);
    if (!wl) continue;
    for (const [x, y, z, v] of wellBlocks(wl).blocks) if (x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16 && y > MINY && y < MINY + HEIGHT) setBlock(col, x - x0, y, z - z0, v);
  }
}
/** The chests and suspicious sand of the desert's structures in a column, with their loot tables: [[x, y, z, table]]. */
export function desertLootIn(seed, col) {
  const out = [], x0 = col.cx * 16, z0 = col.cz * 16;
  const keep = (x, y, z, table) => {
    if (x < x0 || x >= x0 + 16 || z < z0 || z >= z0 + 16) return;
    const b = BLOCKS[getBlock(col, x - x0, y, z - z0) & 0xFFF];
    if (b.use === 'chest' || b.brushable) out.push([x, y, z, table]);
  };
  for (const p of pyramidsNear(seed, x0, z0)) {
    const {chests, sus} = plan(p);
    for (const [lx, ly, lz, table] of [...chests, ...sus]) { const [wx, wz] = toWorld(p, lx, lz); keep(wx, p.y + ly, wz, table); }
  }
  for (let cz = col.cz - 1; cz <= col.cz + 1; cz++) for (let cx = col.cx - 1; cx <= col.cx + 1; cx++) {
    const wl = wellIn(seed, cx, cz);
    if (wl) for (const [x, y, z] of wellBlocks(wl).sus) keep(x, y, z, 'desert_well_archaeology');
  }
  return out;
}
/** Where a pyramid's parts are in the world (for tests): its blue terracotta, chests, TNT and suspicious sand. */
export function pyramidPlaces(p) {
  const {chests, sus} = plan(p), w = (x, y, z) => { const [wx, wz] = toWorld(p, x, z); return [wx, p.y + y, wz]; };
  return {blue: w(10, 0, 10), plate: w(10, -11, 10), chests: chests.map(([x, y, z]) => w(x, y, z)), sus: sus.map(([x, y, z]) => w(x, y, z)), door: w(10, 1, 0)};
}
