// Nether portals as the game makes them: a frame of obsidian (inside 2–21 wide and 3–21 high, corners not needed)
// standing along x or z, lit inside with flint and steel; the portal blocks (meta 0 along x, 1 along z) fill it.
// Breaking any of the frame puts the portal out. Travelling: the Nether is an eighth the size, so (x, z) ÷ 8 there
// and × 8 back; an old portal near where you come out is used, else a new one is built (with a floor and room).
import {ID, withMeta} from './blocks.js';

const MAX = 21;
const free = v => v === 0 || (v & 0xFFF) === ID.nether_portal;
/**
 * The inside of a frame that (x, y, z) is in (an empty block just inside the obsidian): {axis 0 = along x | 1 = along
 * z, x, y, z (the low corner of the inside), w, h} or null. get(x, y, z) reads the world.
 */
export function findFrame(get, x, y, z) {
  if (!free(get(x, y, z))) return null;
  for (const axis of [0, 1]) {
    const [dx, dz] = axis ? [0, 1] : [1, 0], at = (i, j) => get(x + dx * i, y + j, z + dz * i);
    // down to the floor, then to the left wall
    let j = 0;
    while (j > -MAX && free(at(0, j - 1))) j--;
    if ((at(0, j - 1) & 0xFFF) !== ID.obsidian) continue;
    let i = 0;
    while (i > -MAX && free(at(i - 1, j))) i--;
    if ((at(i - 1, j) & 0xFFF) !== ID.obsidian) continue;
    // the width along the floor, the height up the left side
    let w = 0;
    while (w <= MAX && free(at(i + w, j)) && (at(i + w, j - 1) & 0xFFF) === ID.obsidian) w++;
    if (w < 2 || w > MAX || (at(i + w, j) & 0xFFF) !== ID.obsidian) continue;
    let h = 0, ok = true;
    for (; h <= MAX; h++) {
      let row = 0;
      for (let k = 0; k < w; k++) if (free(at(i + k, j + h))) row++;
      if (row === 0 && [...Array(w).keys()].every(k => (at(i + k, j + h) & 0xFFF) === ID.obsidian)) break;
      if (row !== w || (at(i - 1, j + h) & 0xFFF) !== ID.obsidian || (at(i + w, j + h) & 0xFFF) !== ID.obsidian) { ok = false; break; }
    }
    if (!ok || h < 3 || h > MAX) continue;
    return {axis, x: x + dx * i, y: y + j, z: z + dz * i, w, h};
  }
  return null;
}
/** The portal blocks filling a frame: [[x, y, z, v]]. */
export function portalFill(f) {
  const out = [], [dx, dz] = f.axis ? [0, 1] : [1, 0];
  for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) out.push([f.x + dx * i, f.y + j, f.z + dz * i, withMeta(ID.nether_portal, f.axis)]);
  return out;
}
/** Does a portal block still have its frame (portal or obsidian on both sides along it, and above and below)? */
export function portalHolds(get, x, y, z, v) {
  const [dx, dz] = (v >>> 12 & 1) ? [0, 1] : [1, 0], ok = w => { const id = w & 0xFFF; return id === ID.nether_portal || id === ID.obsidian; };
  return ok(get(x + dx, y, z + dz)) && ok(get(x - dx, y, z - dz)) && ok(get(x, y + 1, z)) && ok(get(x, y - 1, z));
}
/**
 * A new portal (4 × 5 frame, 2 × 3 inside) with its lower inside corner at (x, y, z): a floor of obsidian on each
 * side when it would stand on nothing, and air cleared in front and behind. put(x, y, z, v).
 */
export function buildPortal(put, x, y, z, axis) {
  const [dx, dz] = axis ? [0, 1] : [1, 0], [px, pz] = axis ? [1, 0] : [0, 1];
  for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) {
    const frame = i === -1 || i === 2 || j === -1 || j === 3;
    put(x + dx * i, y + j, z + dz * i, frame ? ID.obsidian : withMeta(ID.nether_portal, axis));
    // room to step out on both sides, with something to stand on
    if (!frame) for (const s of [-1, 1]) { put(x + dx * i + px * s, y + j, z + dz * i + pz * s, 0); if (j === 0) put(x + dx * i + px * s, y - 1, z + dz * i + pz * s, ID.obsidian); }
  }
}
/** Where a trip comes out: the Nether is an eighth of the size. */
export const across = (x, z, toNether) => toNether ? [x / 8, z / 8] : [x * 8, z * 8];
/** How far round the arrival point an old portal is used (the game: 128 blocks in the overworld, 16 in the Nether). */
export const SEARCH = {overworld: 128, nether: 16};
/** The nearest known portal within reach: portals [[x, y, z]] in the dimension; null when there is none. */
export function nearestPortal(portals, x, z, reach) {
  let best = null, bd = Infinity;
  for (const p of portals || []) { const d = Math.max(Math.abs(p[0] - x), Math.abs(p[2] - z)); if (d <= reach && d < bd) { bd = d; best = p; } }
  return best;
}
/**
 * A place for a new portal near (x, z): ground under it and room 4 wide, 5 high and 3 deep, nearest first; at each
 * spot the highest such place (top: the overworld's surface) or the one nearest y0 (the Nether's caverns). get(x, y,
 * z) reads blocks; lo, hi the heights to look between. Falls back to (x, y0, z), built in the air.
 */
export function portalSpot(get, x, z, lo, hi, y0, top = false) {
  const solid = v => v && (v & 0xFFF) !== ID.lava && (v & 0xFFF) !== ID.water && (v & 0xFFF) !== ID.nether_portal;
  const ys = Array.from({length: hi - lo + 1}, (_, i) => lo + i).sort((a, b) => top ? b - a : Math.abs(a - y0) - Math.abs(b - y0));
  for (let r = 0; r <= 16; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const xx = Math.floor(x) + dx, zz = Math.floor(z) + dz;
    for (const y of ys) {
      if (!solid(get(xx, y - 1, zz)) || !solid(get(xx + 1, y - 1, zz))) continue;
      let room = true;
      for (let i = -1; i <= 2 && room; i++) for (let j = 0; j <= 4 && room; j++) for (const s of [-1, 0, 1]) if (get(xx + i, y + j, zz + s)) { room = false; break; }
      if (room) return {x: xx, y, z: zz, axis: 0};
    }
  }
  return {x: Math.floor(x), y: y0, z: Math.floor(z), axis: 0};
}
