// The Nether, one 16×16 column at a time like gen.js: a cave world 128 high between two layers of bedrock —
// netherrack hollowed by 3D noise into great caverns, a lava sea up to 31 with soul sand and gravel on its shores,
// glowstone hanging from the roof, quartz, gold and magma — and the fortresses: nether brick bridges, crossings and
// halls standing on pillars across it, with nether wart gardens and blaze spawners at the ends. The same seed always
// gives the same Nether; a piece reaching over a column's edge is drawn from every column it touches.
import {fractal, hash, rng} from './noise.js';
import {ID, withMeta} from './blocks.js';
import {newColumn, getBlock, setBlock, BIOME} from './gen.js';

export const NETHER_ROOF = 127, LAVA_SEA = 31;
const lerp = (a, b, t) => a + (b - a) * t;
const colRng = (seed, cx, cz, salt) => rng(Math.floor(hash(seed + salt, cx, 0, cz) * 4294967296) | 0);

const nethers = new Map();
function netherOf(seed) {
  let w = nethers.get(seed);
  if (!w) nethers.set(seed, w = {seed, main: fractal(seed + 101, {scale: 72, octaves: 4}), tall: fractal(seed + 102, {scale: 150, octaves: 2}),
    soul: fractal(seed + 103, {scale: 46, octaves: 2}), gravel: fractal(seed + 104, {scale: 38, octaves: 2}), forts: new Map()});
  return w;
}
/** How solid the Nether is at a point (netherrack above 0): solid towards the floor and the roof, caverns between. */
function density(w, x, y, z) {
  let d = w.main.n3(x, y * 1.4, z) + w.tall.n3(x, y * 0.35, z) * 0.35 - 0.06;
  if (y < 24) d += (24 - y) * 0.06;
  if (y > 100) d += (y - 100) * 0.06;
  return d;
}

export function generateNether(seed, cx, cz) {
  const w = netherOf(seed), col = newColumn(cx, cz), x0 = cx * 16, z0 = cz * 16;
  const {bedrock, netherrack, lava} = ID;
  // 1. netherrack where the noise (on a grid every 4 across and 8 up, linear between) is above 0; lava below 32
  const GX = 5, GY = 17, grid = new Float32Array(GX * GX * GY);
  for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) grid[(gz * GX + gx) * GY + gy] = density(w, x0 + gx * 4, gy * 8, z0 + gz * 4);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const gx = x >> 2, gz = z >> 2, fx = (x & 3) / 4, fz = (z & 3) / 4;
    const i00 = (gz * GX + gx) * GY, i10 = (gz * GX + gx + 1) * GY, i01 = ((gz + 1) * GX + gx) * GY, i11 = ((gz + 1) * GX + gx + 1) * GY;
    for (let y = 0; y <= NETHER_ROOF; y++) {
      let v = 0;
      if (y === 0 || y === NETHER_ROOF || (y < 5 && hash(seed + 31, x0 + x, y, z0 + z) < (5 - y) / 5) || (y > 122 && hash(seed + 32, x0 + x, y, z0 + z) < (y - 122) / 5)) v = bedrock;
      else {
        const g = y >> 3, f = (y & 7) / 8;
        const a = lerp(lerp(grid[i00 + g], grid[i10 + g], fx), lerp(grid[i01 + g], grid[i11 + g], fx), fz);
        const b = lerp(lerp(grid[i00 + g + 1], grid[i10 + g + 1], fx), lerp(grid[i01 + g + 1], grid[i11 + g + 1], fx), fz);
        v = lerp(a, b, f) > 0 ? netherrack : y <= LAVA_SEA ? lava : 0;
      }
      if (v) setBlock(col, x, y, z, v);
    }
    col.biome[z * 16 + x] = BIOME.nether_wastes;
    col.height[z * 16 + x] = NETHER_ROOF;
  }
  // 2. soul sand and gravel on the floors near the sea
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = x0 + x, wz = z0 + z, soul = w.soul.n2(wx, wz) > 0.3, gravel = w.gravel.n2(wx, wz) > 0.42;
    if (!soul && !gravel) continue;
    for (let y = 24; y <= 40; y++) {
      if (getBlock(col, x, y, z) !== netherrack || getBlock(col, x, y + 1, z) && getBlock(col, x, y + 1, z) !== lava) continue;
      const kind = gravel && y >= LAVA_SEA - 1 && y <= LAVA_SEA + 3 ? ID.gravel : soul ? ID.soul_sand : 0;
      for (let d = 0; d < 3 && kind; d++) if (getBlock(col, x, y - d, z) === netherrack) setBlock(col, x, y - d, z, kind);
    }
  }
  // 3. ores: quartz and gold all through, magma around the sea
  const r = colRng(seed, cx, cz, 401);
  for (const [block, count, size, lo, hi] of [[ID.nether_quartz_ore, 16, 14, 10, 117], [ID.nether_gold_ore, 10, 10, 10, 117], [ID.magma_block, 4, 24, 26, 36]]) {
    for (let k = 0; k < count; k++) vein(col, r, 2 + Math.floor(r() * 12), lo + Math.floor(r() * (hi - lo)), 2 + Math.floor(r() * 12), size, block);
  }
  // 4. glowstone hanging from the roof of the caverns
  for (let k = 0; k < 2; k++) {
    const gx = 3 + Math.floor(r() * 10), gz = 3 + Math.floor(r() * 10);
    let y = 40 + Math.floor(r() * 80);
    while (y < 122 && !(getBlock(col, gx, y, gz) === 0 && getBlock(col, gx, y + 1, gz) === netherrack)) y++;
    if (y >= 122) continue;
    setBlock(col, gx, y, gz, ID.glowstone);
    for (let i = 0; i < 260; i++) {
      const x = gx + Math.floor(r() * 7) - 3, yy = y - Math.floor(r() * 9), z = gz + Math.floor(r() * 7) - 3;
      if (x < 0 || x > 15 || z < 0 || z > 15 || getBlock(col, x, yy, z)) continue;
      let n = 0;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const xx = x + dx, zz = z + dz;
        if (xx >= 0 && xx < 16 && zz >= 0 && zz < 16 && getBlock(col, xx, yy + dy, zz) === ID.glowstone) n++;
      }
      if (n === 1) setBlock(col, x, yy, z, ID.glowstone);
    }
  }
  // 5. mushrooms in the dark
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(r() * 16), z = Math.floor(r() * 16), kind = r() < 0.5 ? ID.brown_mushroom : ID.red_mushroom;
    for (let y = LAVA_SEA + 1; y < 120; y++) if (getBlock(col, x, y, z) === netherrack && !getBlock(col, x, y + 1, z) && r() < 0.15) { setBlock(col, x, y + 1, z, kind); break; }
  }
  // 6. fortresses
  for (const piece of piecesNear(w, x0, z0)) drawPiece(col, x0, z0, piece, seed);
  return col;
}
function vein(col, r, cx, cy, cz, size, block) {
  let x = cx, y = cy, z = cz;
  for (let i = 0; i < size; i++) {
    if (x >= 0 && x < 16 && z >= 0 && z < 16 && getBlock(col, x, y, z) === ID.netherrack) setBlock(col, x, y, z, block);
    const d = Math.floor(r() * 6);
    if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
    if (x < 0 || x > 15) x = cx; if (z < 0 || z > 15) z = cz;
  }
}

// ---------- fortresses ----------
// One chance in each region of 27 × 27 columns (as the game spaces them). A fortress grows from a crossing: bridges
// and halls run out along the axes, more crossings branch off, and the arms end in a nether wart garden, a blaze
// spawner or nothing. Every piece is a box: {kind, x0, x1, z0, z1, y, axis, open (sides of a crossing), door}.
const REGION = 432, SPAN = 18;
export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function fortressIn(w, rx, rz) {
  const k = `${rx},${rz}`;
  if (w.forts.has(k)) return w.forts.get(k);
  const r = colRng(w.seed, rx, rz, 433);
  let fort = null;
  if (r() < 0.5) {
    const sx = rx * REGION + 16 * Math.floor(r() * 23) + 8, sz = rz * REGION + 16 * Math.floor(r() * 23) + 8, y = 48 + Math.floor(r() * 20);
    const pieces = [];
    const crossing = (x, z, from, depth) => {
      const c = {kind: 'cross', x0: x - 4, x1: x + 4, z0: z - 4, z1: z + 4, y, open: []};
      pieces.push(c);
      if (from >= 0) c.open.push(from);
      for (let d = 0; d < 4; d++) {
        if (d === from || r() > (depth === 0 ? 0.85 : 0.5)) continue;
        const [dx, dz] = DIRS4[d], segs = 1 + Math.floor(r() * 2);
        c.open.push(d);
        let at = 5;
        for (let s = 0; s < segs; s++) {
          const kind = r() < 0.35 ? 'hall' : 'bridge', a = at, b = at + SPAN - 1;
          pieces.push(dx ? {kind, axis: 'x', x0: x + dx * (dx > 0 ? a : b), x1: x + dx * (dx > 0 ? b : a), z0: z - 2, z1: z + 2, y}
            : {kind, axis: 'z', x0: x - 2, x1: x + 2, z0: z + dz * (dz > 0 ? a : b), z1: z + dz * (dz > 0 ? b : a), y});
          at += SPAN;
        }
        const ex = x + dx * (at + 4), ez = z + dz * (at + 4), back = d ^ 1;
        const roll = r();
        if (depth < 2 && roll < 0.4) crossing(ex, ez, back, depth + 1);
        else if (roll < 0.72) pieces.push({kind: 'garden', x0: ex - 5 + dx, x1: ex + 5 + dx, z0: ez - 5 + dz, z1: ez + 5 + dz, y, door: back});
        else pieces.push({kind: 'spawner', x0: ex - 4, x1: ex + 4, z0: ez - 4, z1: ez + 4, y, door: back});
      }
    };
    crossing(sx, sz, -1, 0);
    fort = {x: sx, z: sz, y, pieces};
  }
  w.forts.set(k, fort);
  return fort;
}
/** The fortress pieces that reach into a column (or near it: margin). */
function piecesNear(w, x0, z0, margin = 1) {
  const out = [];
  const rx = Math.floor(x0 / REGION), rz = Math.floor(z0 / REGION);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const f = fortressIn(w, rx + dx, rz + dz);
    if (f) for (const p of f.pieces) if (p.x1 >= x0 - margin && p.x0 <= x0 + 15 + margin && p.z1 >= z0 - margin && p.z0 <= z0 + 15 + margin) out.push(p);
  }
  return out;
}
/** The fortress piece around a point (blazes and wither skeletons spawn in them), or null. */
export function fortressAt(seed, x, y, z) {
  const w = netherOf(seed);
  for (const p of piecesNear(w, Math.floor(x), Math.floor(z), 0)) if (x >= p.x0 && x <= p.x1 + 1 && z >= p.z0 && z <= p.z1 + 1 && y >= p.y - 2 && y <= p.y + 8) return p;
  return null;
}
/** The fortresses' blaze spawners within about 32 blocks of a point: [[x, y, z]]. */
export function spawnersNear(seed, x, z) {
  const out = [];
  for (const p of piecesNear(netherOf(seed), Math.floor(x) - 16, Math.floor(z) - 16, 16)) if (p.kind === 'spawner') out.push([(p.x0 + p.x1) / 2, p.y + 2, (p.z0 + p.z1) / 2]);
  return out;
}
/** Where the fortresses are near a point (for finding one): [{x, y, z}]. */
export function fortressesNear(seed, x, z) {
  const w = netherOf(seed), rx = Math.floor(x / REGION), rz = Math.floor(z / REGION), out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const f = fortressIn(w, rx + dx, rz + dz); if (f) out.push({x: f.x, y: f.y, z: f.z}); }
  return out;
}

function drawPiece(col, x0, z0, p, seed) {
  const {nether_bricks: brick, nether_brick_fence: fence, soul_sand, lava} = ID;
  const inside = (x, z) => x >= x0 && x < x0 + 16 && z >= z0 && z < z0 + 16;
  const put = (x, y, z, v) => { if (inside(x, z)) setBlock(col, x - x0, y, z - z0, v); };
  const get = (x, y, z) => getBlock(col, x - x0, y, z - z0);
  const y = p.y;
  // a pillar of bricks from under the deck down to the ground (through the lava)
  const pillar = (x, z, from) => { if (!inside(x, z)) return; for (let yy = from; yy > 0; yy--) { const v = get(x, yy, z); if (v && v !== lava) break; put(x, yy, z, brick); } };
  const clear = (x, z, top) => { for (let yy = y + 1; yy <= top; yy++) put(x, yy, z, 0); };
  if (p.kind === 'bridge' || p.kind === 'hall') {
    const along = p.axis === 'x', a0 = along ? p.x0 : p.z0, a1 = along ? p.x1 : p.z1, c = along ? p.z0 + 2 : p.x0 + 2;
    for (let t = a0; t <= a1; t++) for (let wv = -2; wv <= 2; wv++) {
      const x = along ? t : c + wv, z = along ? c + wv : t;
      if (!inside(x, z)) continue;
      put(x, y, z, brick); put(x, y - 1, z, brick);
      // arches: a pillar every nine blocks, the deck hanging lower nearer them
      const m = ((t - a0) % 9 + 9) % 9, d = Math.min(Math.abs(m - 4), Math.abs(m - 5));
      if (d === 0) pillar(x, z, y - 2);
      else for (let k = 1; k <= 3 - d; k++) put(x, y - 1 - k, z, brick);
      if (p.kind === 'bridge') { clear(x, z, y + 4); if (Math.abs(wv) === 2) put(x, y + 1, z, fence); }
      else {
        const wall = Math.abs(wv) === 2;
        for (let yy = y + 1; yy <= y + 4; yy++) put(x, yy, z, wall ? (yy === y + 2 || yy === y + 3) && ((t - a0) % 4 === 2) ? fence : brick : 0);
        put(x, y + 5, z, brick);
      }
    }
  } else if (p.kind === 'cross' || p.kind === 'spawner') {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, open = p.kind === 'cross' ? p.open : [p.door];
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) {
      if (!inside(x, z)) continue;
      put(x, y, z, brick); put(x, y - 1, z, brick); clear(x, z, y + 5);
      const dx = x - cx, dz = z - cz;
      if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) pillar(x, z, y - 2);
      else if (Math.max(Math.abs(dx), Math.abs(dz)) <= 3) put(x, y - 2, z, brick);
      // the railing round the edge, open where an arm goes on
      const edge = [dx === 4, dx === -4, dz === 4, dz === -4];
      const gap = d => edge[d] && (d < 2 ? Math.abs(dz) : Math.abs(dx)) <= 2 && open.includes(d);
      if (edge.some(Boolean) && ![0, 1, 2, 3].some(gap)) put(x, y + 1, z, fence);
    }
    // the blaze spawner on a little stand in the middle
    if (p.kind === 'spawner') { put(cx, y + 1, cz, brick); put(cx, y + 2, cz, ID.spawner); }
  } else if (p.kind === 'garden') {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, [ddx, ddz] = DIRS4[p.door];
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) {
      if (!inside(x, z)) continue;
      const dx = x - cx, dz = z - cz, wall = Math.max(Math.abs(dx), Math.abs(dz)) === 5;
      put(x, y, z, brick); put(x, y - 1, z, brick);
      if ((Math.abs(dx) <= 1 && Math.abs(dz) <= 1) || (Math.abs(dx) === 5 && Math.abs(dz) === 5)) pillar(x, z, y - 2);
      // the door: three wide, on the side the arm comes from
      const door = (ddx && dx === ddx * 5 && Math.abs(dz) <= 1) || (ddz && dz === ddz * 5 && Math.abs(dx) <= 1);
      for (let yy = y + 1; yy <= y + 5; yy++) put(x, yy, z, wall && !(door && yy <= y + 3) ? (yy === y + 3 && !door && (Math.abs(dx) + Math.abs(dz)) % 3 === 0 ? fence : brick) : 0);
      put(x, y + 6, z, brick);
      // two beds of soul sand along the walls across from the door, with nether wart growing in them
      const side = ddx ? Math.abs(dz) : Math.abs(dx), along = ddx ? dx : dz;
      if ((side === 3 || side === 4) && Math.abs(along) <= 3) { put(x, y, z, soul_sand); put(x, y + 1, z, withMeta(ID.nether_wart, Math.floor(hash(seed + 9, x, y, z) * 4))); }
    }
  }
}
