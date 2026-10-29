// The sea's ruins and treasure, made with the land one column at a time (like monuments): shipwrecks, ocean ruins and
// buried treasure, placed as the game places them, with chests whose loot tables the world tells the page about.
//
// A shipwreck (one try in each 24 × 24 chunks, in the sea or on a beach): a wooden ship of one wood — a hull widening
// from the keel to the deck with a pointed bow, a railing round the deck, a bowsprit, a mast with its yard (or its
// broken stump), a cabin at the stern — whole, or only its front or back half, upright, on its side or upside down,
// and broken by the years under water. Three chests: the stores in the bow, the treasure under the cabin, the map in
// the cabin. Ocean ruins (one try in each 20 × 20 chunks of sea): stone bricks in cold seas, sandstone in warm ones;
// small broken rooms, or a big walled one of four rooms with others round it. Buried treasure: on beaches, a chest
// under the sand in one chunk in a hundred (always at the chunk's 9, 9).
import {hash, rng} from './noise.js';
import {ID, BLOCKS, SEA, MINY, HEIGHT, withMeta, WATERLOGGED} from './blocks.js';
import {landAt, worldOf, getBlock, setBlock, BIOMES} from './gen.js';

// a cell the structure keeps clear: sea under the sea's top, air above it
const INSIDE = 0xFFFF;
const FACE_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const SHIP_REGION = 24 * 16, RUIN_REGION = 20 * 16;
const at = (s, x, y, z) => (y * s.FL + z) * s.FW + x;

// a place in a structure's own frame (x 0 … FW − 1, z 0 … FL − 1) in the world and back, turned one of four ways
export function toWorld(s, x, z) {
  switch (s.turn) {
    case 1: return [s.x0 + s.FL - 1 - z, s.z0 + x];
    case 2: return [s.x0 + s.FW - 1 - x, s.z0 + s.FL - 1 - z];
    case 3: return [s.x0 + z, s.z0 + s.FW - 1 - x];
    default: return [s.x0 + x, s.z0 + z];
  }
}
function toLocal(s, wx, wz) {
  const a = wx - s.x0, b = wz - s.z0;
  switch (s.turn) {
    case 1: return [b, s.FL - 1 - a];
    case 2: return [s.FW - 1 - a, s.FL - 1 - b];
    case 3: return [s.FW - 1 - b, a];
    default: return [a, b];
  }
}
// a facing turned with the frame; a log lying along x lies along z once turned a quarter
const turnFacing = (f, turn) => { let [dx, dz] = FACE_DIR[f]; for (let k = 0; k < turn; k++) [dx, dz] = [-dz, dx]; return FACE_DIR.findIndex(([a, b]) => a === dx && b === dz); };
function turned(v, turn) {
  if (!turn) return v;
  const id = v & 0xFFF, b = BLOCKS[id];
  let meta = v >>> 12;
  if (b.axis && turn % 2 && (meta & 3)) meta = (meta & ~3) | (3 - (meta & 3));
  if (b.facing) meta = (meta & ~3) | turnFacing(meta & 3, turn);
  return withMeta(id, meta);
}
/** The structures of the regions round a column (one call each; null ones left out). */
function near(fn, region, seed, x0, z0, margin) {
  const out = [];
  for (let rz = Math.floor((z0 - margin) / region); rz <= Math.floor((z0 + 16 + margin) / region); rz++)
    for (let rx = Math.floor((x0 - margin) / region); rx <= Math.floor((x0 + 16 + margin) / region); rx++) { const g = fn(seed, rx, rz); if (g) out.push(g); }
  return out;
}
const cached = (map, key, make) => { if (map.has(key)) return map.get(key); if (map.size > 2000) map.clear(); const v = make(); map.set(key, v); return v; };
const isOcean = name => name.endsWith('ocean');

// ---------- shipwrecks ----------
const SHIP_WOODS = ['oak', 'spruce', 'dark_oak', 'jungle', 'birch'];
// the frame: upright 9 wide, 17 high (with the mast), 29 long (the bowsprit at z 0, the stern at 28); on its side the
// width and height swap; upside down the mast is gone. A front half is z 0–14, a back half 13–28.
const shipDims = (roll, part) => {
  const L = part === 'front' ? 15 : part === 'back' ? 16 : 29;
  return roll === 1 ? [17, 9, L] : roll === 2 ? [9, 9, L] : [9, 17, L];
};
const ships = new Map();
/** The shipwreck of a region (cached), or null: {x0, z0, FW, FL, H, turn, roll, part, mast, wood, beached, y, seed}. */
export function shipwreckIn(seed, rx, rz) {
  return cached(ships, `${seed}|${rx}|${rz}`, () => {
    const r = rng(Math.floor(hash(seed + 9113, rx, 0, rz) * 2147483647)), w = worldOf(seed);
    // the game's spacing 24, separation 4: a chunk in the first 20 of each way
    const cx = rx * SHIP_REGION + 16 * Math.floor(r() * 20) + 8, cz = rz * SHIP_REGION + 16 * Math.floor(r() * 20) + 8;
    const l = landAt(w, cx, cz), biome = BIOMES[l.biome].name, beached = biome === 'beach' || biome === 'snowy_beach';
    if (!beached && !(isOcean(biome) && l.h <= SEA - 4)) return null;
    const roll = beached ? 0 : [0, 0, 1, 2][Math.floor(r() * 4)], part = beached ? 'full' : ['full', 'full', 'front', 'back'][Math.floor(r() * 4)];
    const mast = roll !== 2 && r() < 0.65, wood = SHIP_WOODS[Math.floor(r() * SHIP_WOODS.length)], turn = Math.floor(r() * 4), sseed = Math.floor(r() * 2147483647);
    const [FW, H, FL] = shipDims(roll, part), WX = turn % 2 ? FL : FW, WZ = turn % 2 ? FW : FL;
    // the keel a block under the lowest ground along the ship
    const along = turn % 2 ? [1, 0] : [0, 1], low = Math.min(...[-10, 0, 10].map(d => landAt(w, cx + along[0] * d, cz + along[1] * d).h));
    return {x0: cx - (WX >> 1), z0: cz - (WZ >> 1), FW, FL, H, turn, roll, part, mast, wood, beached, y: low - 1, seed: sseed};
  });
}
/** The shipwrecks whose frame reaches near a spot (within reach). */
export function shipwrecksNear(seed, x, z, reach = 0) {
  return near(shipwreckIn, SHIP_REGION, seed, x - 8, z - 8, reach + 30).filter(s => {
    const WX = s.turn % 2 ? s.FL : s.FW, WZ = s.turn % 2 ? s.FW : s.FL;
    return x >= s.x0 - reach && x < s.x0 + WX + reach && z >= s.z0 - reach && z < s.z0 + WZ + reach;
  });
}

const shipPlans = new Map();
/** A shipwreck's blocks in its frame (0: left as it is, INSIDE: cleared) and its chests [[x, y, z, table, facing]]. */
export function shipPlan(s) {
  return cached(shipPlans, `${s.seed}|${s.roll}|${s.part}|${s.mast}|${s.wood}|${s.beached}`, () => {
    // built upright and whole in a frame of its own first
    const U = {FW: 9, FL: 29}, H = 17, P0 = new Uint16Array(9 * H * 29), chests = [];
    const planks = ID[`${s.wood}_planks`], log = ID[`${s.wood}_log`], fence = ID[`${s.wood}_fence`], slab = ID[`${s.wood}_slab`];
    const put = (x, y, z, v) => { if (x >= 0 && x < 9 && y >= 0 && y < H && z >= 0 && z < 29) P0[at(U, x, y, z)] = v; };
    // half the hull's width along it at the deck (the bow's point at z 3), narrowing down to the keel
    const HALF = z => z < 3 ? -1 : z === 3 ? 0 : z === 4 ? 1 : z <= 6 ? 2 : z <= 8 ? 3 : 4;
    const half = (z, y) => HALF(z) < 0 ? -1 : Math.min(HALF(z), [0, 2, 3, 4, 4][y]);
    for (let z = 3; z < 29; z++) for (let y = 0; y <= 4; y++) {
      const h = half(z, y), front = z > 3 ? half(z - 1, y) : -1;
      for (let dx = -h; dx <= h; dx++) {
        const wall = Math.abs(dx) === h || Math.abs(dx) > front || z === 28;
        // the keel a log along the ship, the hold's floor and the deck planks, the hold between them open
        put(4 + dx, y, z, y === 0 ? (z >= 5 && z <= 26 ? withMeta(log, 2) : planks) : y === 1 || y === 4 || wall ? planks : INSIDE);
      }
      // the railing round the deck
      if (y === 4) for (let dx = -h; dx <= h; dx++) if (Math.abs(dx) === h || Math.abs(dx) > front || z === 28) put(4 + dx, 5, z, fence);
    }
    // the hatch down into the hold, the bowsprit
    put(4, 4, 9, INSIDE); put(4, 4, 10, INSIDE);
    put(4, 4, 2, withMeta(log, 2)); put(4, 5, 1, withMeta(log, 2)); put(4, 5, 0, fence);
    // the mast through the deck with its yard (or what is left of it)
    for (let y = 2; y <= (s.mast ? 16 : 7); y++) put(4, y, 12, withMeta(log, 0));
    if (s.mast) { for (let x = 1; x <= 7; x++) if (x !== 4) put(x, 13, 12, withMeta(log, 1)); put(4, 16, 12, fence); }
    // the cabin at the stern: plank walls, a doorway towards the bow, windows, a roof of slabs
    for (let z = 21; z <= 27; z++) for (let dx = -3; dx <= 3; dx++) {
      const edge = Math.abs(dx) === 3 || z === 21 || z === 27;
      for (let y = 5; y <= 7; y++) put(4 + dx, y, z, edge ? planks : INSIDE);
      put(4 + dx, 8, z, slab);
    }
    put(4, 5, 21, INSIDE); put(4, 6, 21, INSIDE);
    for (const z of [23, 25]) { put(1, 6, z, ID.glass_pane); put(7, 6, z, ID.glass_pane); }
    put(4, 6, 27, ID.glass_pane);
    // the chests: the stores in the bow's hold, the treasure in the stern's, the map in the cabin
    for (const [x, y, z, table, f] of [[4, 2, 6, 'shipwreck_supply', 0], [4, 2, 26, 'shipwreck_treasure', 2], [5, 5, 26, 'shipwreck_map', 2]]) { put(x, y, z, withMeta(ID.chest, f)); chests.push([x, y, z, table, f]); }

    // then turned over (on its side: the keel to one side, the mast lying along the ground) and cut in half
    const [FW, FH, FL] = shipDims(s.roll, s.part), zs = s.part === 'back' ? 13 : 0, F = {FW, FL};
    const P = new Uint16Array(FW * FH * FL);
    const move = (x, y) => s.roll === 1 ? [y, 8 - x] : s.roll === 2 ? (y > 8 ? null : [8 - x, 8 - y]) : [x, y];
    const fix = v => {
      if (v === INSIDE || !s.roll) return v;
      const id = v & 0xFFF, b = BLOCKS[id], meta = v >>> 12;
      if (s.roll === 1 && b.axis) return withMeta(id, (meta & 3) === 0 ? 1 : (meta & 3) === 1 ? 0 : meta);
      if (b.shape === 'slab') return s.roll === 1 ? planks : withMeta(id, meta === 0 ? 1 : meta === 1 ? 0 : meta);
      return v;
    };
    for (let y = 0; y < H; y++) for (let z = zs; z < zs + FL; z++) for (let x = 0; x < 9; x++) {
      const v = P0[at(U, x, y, z)], m = v && move(x, y);
      if (m) P[at(F, m[0], m[1], z - zs)] = fix(v);
    }
    // the years under water: some blocks gone (never the chests)
    const decay = s.beached ? 0.08 : 0.25;
    for (let y = 0; y < FH; y++) for (let z = 0; z < FL; z++) for (let x = 0; x < FW; x++) {
      const i = at(F, x, y, z), v = P[i];
      if (v && v !== INSIDE && (v & 0xFFF) !== ID.chest && hash(s.seed, x, y, z) < decay) P[i] = INSIDE;
    }
    const kept = chests.filter(([, , z]) => z >= zs && z < zs + FL).map(([x, y, z, table, f]) => { const [nx, ny] = move(x, y); return [nx, ny, z - zs, table, f]; });
    return {P, H: FH, chests: kept};
  });
}

// ---------- ocean ruins ----------
const ruins = new Map();
/** The ruins of a region (cached), or null: {warm, pieces: [{x0, z0, FW, FL, big, turn, y, seed, chest}]}. */
export function ruinsIn(seed, rx, rz) {
  return cached(ruins, `${seed}|${rx}|${rz}`, () => {
    const r = rng(Math.floor(hash(seed + 4111, rx, 0, rz) * 2147483647)), w = worldOf(seed);
    // the game's spacing 20, separation 8: a chunk in the first 12 of each way
    const cx = rx * RUIN_REGION + 16 * Math.floor(r() * 12) + 8, cz = rz * RUIN_REGION + 16 * Math.floor(r() * 12) + 8;
    const l = landAt(w, cx, cz), biome = BIOMES[l.biome].name;
    if (!isOcean(biome) || l.h > SEA - 4) return null;
    const warm = biome === 'warm_ocean', big = r() < 0.3, pieces = [];
    const piece = (x, z, big) => {
      const N = big ? 15 : 5 + 2 * Math.floor(r() * 2), turn = Math.floor(r() * 4), pseed = Math.floor(r() * 2147483647), chest = big || r() < 0.45, pl = landAt(w, x, z);
      if (isOcean(BIOMES[pl.biome].name) && pl.h <= SEA - 3) pieces.push({x0: x - (N >> 1), z0: z - (N >> 1), FW: N, FL: N, big, turn, y: pl.h, seed: pseed, chest});
    };
    piece(cx, cz, big);
    // a big one has small ones round it (nine times in ten)
    if (big && r() < 0.9) for (let k = 4 + Math.floor(r() * 5); k > 0; k--) { const a = r() * Math.PI * 2, d = 14 + r() * 12; piece(Math.round(cx + Math.cos(a) * d), Math.round(cz + Math.sin(a) * d), false); }
    return pieces.length ? {warm, pieces} : null;
  });
}
const ruinPlans = new Map();
/** A ruin's blocks in its frame (N × 6 × N) and its chests. */
export function ruinPlan(p, warm) {
  return cached(ruinPlans, `${p.seed}|${p.FW}|${p.big}|${warm}|${p.chest}`, () => {
    const N = p.FW, H = 6, P = new Uint16Array(N * H * N), F = {FW: N, FL: N}, r = rng(p.seed), chests = [];
    const put = (x, y, z, v) => { if (x >= 0 && x < N && y >= 0 && y < H && z >= 0 && z < N) P[at(F, x, y, z)] = v; };
    const wallBlock = () => { const k = r(); return warm ? (k < 0.5 ? ID.sandstone : k < 0.8 ? ID.cut_sandstone : ID.smooth_sandstone) : (k < 0.55 ? ID.stone_bricks : k < 0.8 ? ID.mossy_stone_bricks : ID.cracked_stone_bricks); };
    const floorBlock = () => { const k = r(); return warm ? (k < 0.7 ? ID.sandstone : ID.sand) : (k < 0.6 ? ID.stone_bricks : k < 0.8 ? ID.mossy_stone_bricks : ID.gravel); };
    const pillar = warm ? ID.chiseled_sandstone : ID.chiseled_stone_bricks, slab = warm ? ID.sandstone_slab : ID.stone_brick_slab;
    // what the sea has taken: more the higher up
    const gone = (y, base) => r() < base + 0.12 * (y - 1);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) put(x, 0, z, floorBlock());
    const m = N >> 1;
    if (!p.big) {
      const top = 2 + Math.floor(r() * 2);
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const edge = x === 0 || z === 0 || x === N - 1 || z === N - 1, door = z === 0 && x === m;
        for (let y = 1; y <= top; y++) put(x, y, z, edge && !door && !gone(y, 0.12) ? wallBlock() : INSIDE);
        if (edge && !door && r() < 0.3) put(x, top + 1, z, slab);
      }
      if (p.chest) chests.push([1 + Math.floor(r() * (N - 2)), 1, 1 + Math.floor(r() * (N - 2)), 'underwater_ruin_small', Math.floor(r() * 4)]);
    } else {
      // four rooms behind an outer wall, doorways between them and out on each side, pillars at the corners and in
      // the middle, a roof left over some
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const outer = x === 0 || z === 0 || x === N - 1 || z === N - 1, inner = x === m || z === m;
        const door = (outer && (x === m || z === m)) || (inner && !outer && (Math.abs(x - m) === 4 || Math.abs(z - m) === 4) && x !== z);
        const corner = (x === 0 || x === N - 1) && (z === 0 || z === N - 1), middle = x === m && z === m;
        const top = corner ? 5 : outer ? 4 : 3;
        for (let y = 1; y <= 5; y++) {
          if (corner || middle) { put(x, y, z, y <= top && !gone(y, 0.04) ? pillar : INSIDE); continue; }
          put(x, y, z, (outer || inner) && !(door && y <= 2) && y <= top && !gone(y, 0.08) ? wallBlock() : INSIDE);
        }
      }
      const roofed = [Math.floor(r() * 4), Math.floor(r() * 4)];
      for (const q of roofed) { const qx = q & 1, qz = q >> 1; for (let z = 1; z < m; z++) for (let x = 1; x < m; x++) if (r() > 0.25) put(qx * m + x, 4, qz * m + z, slab); }
      for (let k = 1 + Math.floor(r() * 2); k > 0; k--) { const q = Math.floor(r() * 4), qx = q & 1, qz = q >> 1; chests.push([qx * m + 2 + Math.floor(r() * (m - 3)), 1, qz * m + 2 + Math.floor(r() * (m - 3)), 'underwater_ruin_big', Math.floor(r() * 4)]); }
    }
    for (const [x, y, z, , f] of chests) put(x, y, z, withMeta(ID.chest, f));
    // up to five of its floor's sand (warm) or gravel (cold) blocks hide a thing (the game's 1.20)
    const sus = [], rs = rng(p.seed ^ 0x51a7), from = warm ? ID.sand : ID.gravel, spots = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (P[at(F, x, 0, z)] === from) spots.push([x, z]);
    for (let k = 0; k < 5 && spots.length; k++) {
      const [x, z] = spots.splice(Math.floor(rs() * spots.length), 1)[0];
      P[at(F, x, 0, z)] = warm ? ID.suspicious_sand : ID.suspicious_gravel;
      sus.push([x, 0, z, warm ? 'ocean_ruin_warm_archaeology' : 'ocean_ruin_cold_archaeology']);
    }
    return {P, H, chests, sus};
  });
}

// ---------- buried treasure ----------
/** The buried treasure of a chunk, or null: {x, z} (a beach chunk, one in a hundred). */
export function treasureIn(seed, cx, cz) {
  if (hash(seed + 6161, cx, 0, cz) >= 0.01) return null;
  const x = cx * 16 + 9, z = cz * 16 + 9, b = BIOMES[landAt(worldOf(seed), x, z).biome].name;
  return b === 'beach' || b === 'snowy_beach' ? {x, z} : null;
}
/** The nearest buried treasure (searched in rings of chunks out to radius), or null. */
export function treasureNear(seed, x, z, radius = 50) {
  const cx0 = Math.floor(x / 16), cz0 = Math.floor(z / 16);
  let best = null, bestD = Infinity;
  for (let r = 0; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const t = treasureIn(seed, cx0 + dx, cz0 + dz);
      if (t) { const d = Math.hypot(t.x - x, t.z - z); if (d < bestD) { bestD = d; best = t; } }
    }
    // nothing further out can be nearer
    if (best && bestD < (r - 1) * 16) return best;
  }
  return best;
}
/** The drowned an ocean ruin starts with (the game's: they stand in it from when it is made, and stay): one or two in a
 *  big piece, now and then one in a small one — those whose piece has its middle in this column: [[x, y, z]]. */
export function drownedIn(seed, cx, cz) {
  const x0 = cx * 16, z0 = cz * 16, out = [];
  for (const g of near(ruinsIn, RUIN_REGION, seed, x0, z0, 40)) for (const p of g.pieces) {
    const mx = p.x0 + (p.FW >> 1), mz = p.z0 + (p.FL >> 1);
    if (mx < x0 || mx >= x0 + 16 || mz < z0 || mz >= z0 + 16) continue;
    const r = rng(p.seed + 77), n = p.big ? 1 + Math.floor(r() * 2) : r() < 0.25 ? 1 : 0;
    for (let k = 0; k < n; k++) out.push([mx + 0.5 + k, p.y + 1, mz + 0.5]);
  }
  return out;
}
/** The nearest shipwreck or ocean ruin within radius (where a dolphin given a fish leads: the game looks 50 chunks
 *  round), or null: {x, y, z} (its middle). */
export function wreckNear(seed, x, z, radius = 800) {
  let best = null, bestD = Infinity;
  const look = (fn, region, mids) => {
    for (let rz = Math.floor((z - radius) / region); rz <= Math.floor((z + radius) / region); rz++) for (let rx = Math.floor((x - radius) / region); rx <= Math.floor((x + radius) / region); rx++) {
      const s = fn(seed, rx, rz);
      if (s) for (const p of mids(s)) { const d = Math.hypot(p.x - x, p.z - z); if (d <= radius && d < bestD) { bestD = d; best = p; } }
    }
  };
  look(shipwreckIn, SHIP_REGION, s => [{x: s.x0 + (s.turn % 2 ? s.FL : s.FW) / 2, y: s.y + 2, z: s.z0 + (s.turn % 2 ? s.FW : s.FL) / 2}]);
  look(ruinsIn, RUIN_REGION, r => r.pieces.slice(0, 1).map(p => ({x: p.x0 + p.FW / 2, y: p.y + 1, z: p.z0 + p.FL / 2})));
  return best;
}

// ---------- conduits ----------
const FRAME = new Set(['prismarine', 'prismarine_bricks', 'dark_prismarine', 'sea_lantern'].map(n => ID[n]));
// the frame's places round a conduit: the three 5 × 5 rings through it, one in each plane (the game's 42)
const FRAME_AT = [];
for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
  const a = Math.abs(i), b = Math.abs(j), c = Math.abs(k);
  if ((a > 1 || b > 1 || c > 1) && ((i === 0 && (b === 2 || c === 2)) || (j === 0 && (a === 2 || c === 2)) || (k === 0 && (a === 2 || b === 2)))) FRAME_AT.push([i, j, k]);
}
/**
 * How much of its frame a conduit at (x, y, z) has (get(x, y, z): the world's blocks): the prismarine, prismarine
 * bricks, dark prismarine and sea lanterns in its rings — 0 unless it stands in water with water all round it (the
 * game's rule). 16 or more and it works, 42 is the whole frame.
 */
export function conduitFrame(get, x, y, z) {
  if ((get(x, y, z) & 0xFFF) !== ID.waterlogged_conduit) return 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) {
    const v = get(x + i, y + j, z + l) & 0xFFF;
    if ((i || j || l) && v !== ID.water && !BLOCKS[v].water) return 0;
  }
  return FRAME_AT.filter(([i, j, l]) => FRAME.has(get(x + i, y + j, z + l) & 0xFFF)).length;
}

// ---------- drawing ----------
/** Draws a structure's part in a column: its frame's blocks at their places (y: the frame's bottom); fill: a block the
 *  sea under its floor is filled with down to the ground (three blocks at most). */
function drawFrame(col, s, plan, fill = 0) {
  const x0 = col.cx * 16, z0 = col.cz * 16, WX = s.turn % 2 ? s.FL : s.FW, WZ = s.turn % 2 ? s.FW : s.FL;
  if (s.x0 >= x0 + 16 || s.x0 + WX <= x0 || s.z0 >= z0 + 16 || s.z0 + WZ <= z0) return;
  for (let z = Math.max(0, s.z0 - z0); z < Math.min(16, s.z0 + WZ - z0); z++) for (let x = Math.max(0, s.x0 - x0); x < Math.min(16, s.x0 + WX - x0); x++) {
    const [lx, lz] = toLocal(s, x0 + x, z0 + z);
    for (let ly = 0; ly < plan.H; ly++) {
      const v = plan.P[at(s, lx, ly, lz)], y = s.y + ly;
      if (!v || y <= MINY || y >= MINY + HEIGHT) continue;
      if (v === INSIDE) {
        // the bottom of a wreck keeps the sea floor that has drifted in
        const here = getBlock(col, x, y, z), hb = BLOCKS[here & 0xFFF];
        if (ly <= 1 && here && hb.solid && !hb.water && (here & 0xFFF) !== ID.water) continue;
        setBlock(col, x, y, z, y <= SEA ? ID.water : 0);
      } else {
        // under the sea's top what can stand in water does
        const w = turned(v, s.turn), wl = y <= SEA && WATERLOGGED[w & 0xFFF];
        setBlock(col, x, y, z, wl ? withMeta(wl, w >>> 12) : w);
      }
    }
    if (fill && plan.P[at(s, lx, 0, lz)]) for (let y = s.y - 1, k = 0; k < 3 && y > MINY; y--, k++) {
      const here = getBlock(col, x, y, z), hb = BLOCKS[here & 0xFFF];
      if (here && hb.solid && !hb.water) break;
      setBlock(col, x, y, z, fill);
    }
  }
}
/** Draws the sea's ruins, shipwrecks and buried treasure in a column (after the land and the sea's plants). */
export function drawOcean(col, seed) {
  const x0 = col.cx * 16, z0 = col.cz * 16;
  drawBergs(col, seed);
  for (const g of near(ruinsIn, RUIN_REGION, seed, x0, z0, 40)) for (const p of g.pieces) drawFrame(col, p, ruinPlan(p, g.warm), g.warm ? ID.sand : ID.gravel);
  for (const s of near(shipwreckIn, SHIP_REGION, seed, x0, z0, 32)) drawFrame(col, s, shipPlan(s));
  if (treasureIn(seed, col.cx, col.cz)) {
    // under the top block of the beach, solid all round
    let y = SEA + 20;
    for (; y > SEA - 24; y--) { const v = getBlock(col, 9, y, 9), b = BLOCKS[v & 0xFFF]; if (v && b.solid && !b.water && (v & 0xFFF) !== ID.water) break; }
    y--;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      const v = getBlock(col, 9 + dx, y + dy, 9 + dz), b = BLOCKS[v & 0xFFF];
      if (!v || !b.solid || b.water || (v & 0xFFF) === ID.water) setBlock(col, 9 + dx, y + dy, 9 + dz, ID.sandstone);
    }
    setBlock(col, 9, y, 9, ID.chest);
  }
}
// ---------- icebergs ----------
// one try in each 4 × 4 chunks of frozen ocean (about one in three is there): packed ice standing up out of the water
// (4 to 18 blocks) and further down under it, an ellipse turned any way; blue ice in veins in it under the water,
// snow blocks over the top of most, and now and then a small one all of blue ice (the game's icebergs)
const BERG_REGION = 4 * 16;
const bergs = new Map();
/** The iceberg of a region (cached), or null: {x, z, h (over the water), rad, ax (its ellipse), turn, blue, snow, seed}. */
export function icebergIn(seed, rx, rz) {
  return cached(bergs, `${seed}|${rx}|${rz}`, () => {
    const r = rng(Math.floor(hash(seed + 5511, rx, 0, rz) * 2147483647));
    if (r() > 0.8) return null;
    const x = rx * BERG_REGION + 8 + Math.floor(r() * 48), z = rz * BERG_REGION + 8 + Math.floor(r() * 48), l = landAt(worldOf(seed), x, z);
    if (BIOMES[l.biome].name !== 'frozen_ocean' || l.h > SEA - 6) return null;
    const blue = r() < 0.08, h = blue ? 3 + Math.floor(r() * 4) : 4 + Math.floor(r() * 15);
    const g = {x, z, h, rad: 3 + Math.floor(h * 0.45 + r() * 3), ax: 0.7 + r() * 0.6, turn: r() * Math.PI, blue, snow: !blue && r() < 0.6, seed: Math.floor(r() * 2147483647)};
    // (its look: lobes round its edge, a rounder or a sharper top, and now and then leaning over to one side)
    const lean = r() < 0.4 ? 1 + r() * h * 0.25 : 0, la = r() * Math.PI * 2;
    return {...g, p1: r() * Math.PI * 2, p2: r() * Math.PI * 2, pow: 0.6 + r() * 0.7, lean: [Math.cos(la) * lean, Math.sin(la) * lean]};
  });
}
function drawBergs(col, seed) {
  const x0 = col.cx * 16, z0 = col.cz * 16;
  for (const g of near(icebergIn, BERG_REGION, seed, x0, z0, 28)) {
    const c = Math.cos(g.turn), s = Math.sin(g.turn), depth = Math.round(g.h * 1.5), ice = g.blue ? ID.blue_ice : ID.packed_ice;
    const reach = g.rad * 1.3 / Math.min(1, g.ax) + Math.hypot(...g.lean) + 1;
    for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      const wx = x0 + lx, wz = z0 + lz, n = (hash(g.seed, wx, 0, wz) - 0.5) * 0.14;
      if (Math.hypot(wx - g.x, wz - g.z) > reach) continue;
      for (let y = SEA + g.h + 1; y >= SEA - depth; y--) {
        // how wide it is at this height (its widest at the water; under it narrowing down, above it up to its top),
        // round its middle there (which leans over as it goes up), its edge in lobes
        const k = Math.max(0, (y - SEA) / g.h), dx = wx - g.x - g.lean[0] * k, dz = wz - g.z - g.lean[1] * k, a = Math.atan2(dz, dx);
        const rough = 1 + 0.16 * Math.sin(3 * a + g.p1) + 0.08 * Math.sin(5 * a + g.p2);
        const d = Math.hypot((dx * c + dz * s) / g.ax, -dx * s + dz * c) / (g.rad * rough) + n;
        if (d >= (y > SEA ? Math.max(0, 1 - k) ** g.pow : Math.max(0, 1 - (SEA - y) / depth) ** 0.83)) continue;
        // (only through water, the sea's ice and air: the sea's bottom stays)
        const v = getBlock(col, lx, y, lz) & 0xFFF;
        if (v && v !== ID.water && v !== ID.ice) { if (y < SEA) break; continue; }
        let b = ice;
        if (g.snow && y > SEA && y - SEA >= g.h * 0.6 && hash(g.seed + 7, x0 + lx, y, z0 + lz) < 0.85) b = ID.snow_block;
        else if (!g.blue && y <= SEA && hash(g.seed + 3, x0 + lx, y, z0 + lz) < 0.05) b = ID.blue_ice;
        setBlock(col, lx, y, lz, b);
      }
    }
  }
}
/** The chests (and suspicious sand and gravel) of the sea's structures in a column, with their loot tables: [[x, y, z,
 *  table]] (only where one is). */
export function lootIn(seed, col) {
  const out = [], x0 = col.cx * 16, z0 = col.cz * 16;
  const keep = (x, y, z, table) => {
    if (x < x0 || x >= x0 + 16 || z < z0 || z >= z0 + 16) return;
    const b = BLOCKS[getBlock(col, x - x0, y, z - z0) & 0xFFF];
    if (b.use === 'chest' || b.brushable) out.push([x, y, z, table]);
  };
  for (const g of near(ruinsIn, RUIN_REGION, seed, x0, z0, 40)) for (const p of g.pieces) { const plan = ruinPlan(p, g.warm); for (const [lx, ly, lz, table] of [...plan.chests, ...plan.sus]) { const [wx, wz] = toWorld(p, lx, lz); keep(wx, p.y + ly, wz, table); } }
  for (const s of near(shipwreckIn, SHIP_REGION, seed, x0, z0, 32)) for (const [lx, ly, lz, table] of shipPlan(s).chests) { const [wx, wz] = toWorld(s, lx, lz); keep(wx, s.y + ly, wz, table); }
  if (treasureIn(seed, col.cx, col.cz)) for (let y = SEA + 20; y > SEA - 26; y--) if ((getBlock(col, 9, y, 9) & 0xFFF) === ID.chest) { keep(x0 + 9, y, z0 + 9, 'buried_treasure'); break; }
  return out;
}
