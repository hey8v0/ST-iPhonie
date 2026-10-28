// Rails: the shape a rail takes from the rails round it, as the game does it — straight on to one beside it, a bend
// between two that meet at a corner (plain rails only), a slope up to one a block higher — and the rails it joins turning
// to meet it. The shapes (a rail's state; a powered, detector or activator rail's state & 7, then 8 when on) are the
// game's: 0 north–south, 1 east–west, 2–5 sloping up to the east, west, north, south, 6–9 bends south–east, south–west,
// north–west, north–east.
import {BLOCKS} from './blocks.js';

/** For each shape, the two sides it runs to as [dx, dz]; a slope rises toward the first. */
export const RAIL_ENDS = [[[0, -1], [0, 1]], [[1, 0], [-1, 0]], [[1, 0], [-1, 0]], [[-1, 0], [1, 0]], [[0, -1], [0, 1]], [[0, 1], [0, -1]],
  [[0, 1], [1, 0]], [[0, 1], [-1, 0]], [[0, -1], [-1, 0]], [[0, -1], [1, 0]]];
export const isRail = v => BLOCKS[v & 0xFFF]?.shape === 'rail';
export const railShape = v => BLOCKS[v & 0xFFF].rail === 'rail' ? v >>> 12 : v >>> 12 & 7;
const withShape = (v, s) => (v & 0xFFF) | (BLOCKS[v & 0xFFF].rail === 'rail' ? s : (v >>> 12 & 8) | s) << 12;
const ends = v => RAIL_ENDS[railShape(v)] || RAIL_ENDS[0];
const SIDES = [[0, -1], [0, 1], [1, 0], [-1, 0]];

/** The rail beside x, y, z that way: at the same height, a block up or a block down; [x, y, z, v] or null. */
export function railBeside(get, x, y, z, dx, dz) {
  for (const dy of [0, 1, -1]) { const v = get(x + dx, y + dy, z + dz); if (isRail(v)) return [x + dx, y + dy, z + dz, v]; }
  return null;
}
const pointsAt = ([rx, , rz, rv], x, z) => ends(rv).some(([dx, dz]) => rx + dx === x && rz + dz === z);
/** The rails a rail is joined to now: its ends that meet a rail pointing back at it. */
function joined(get, x, y, z, v) {
  return ends(v).map(([dx, dz]) => railBeside(get, x, y, z, dx, dz)).filter(r => r && pointsAt(r, x, z));
}
/** The shape running to side a and on to side b (or straight through when b is none), up to a side whose rail is higher. */
function shapeFor(a, b, upA, upB, plain) {
  if (!b || (!plain && (a[0] !== -b[0] || a[1] !== -b[1]))) { b = [-a[0], -a[1]]; upB = false; }
  if (a[0] === -b[0] && a[1] === -b[1]) {
    const [hi, lo] = upA ? [a, b] : upB ? [b, a] : [null, null];
    if (a[0]) return hi ? (hi[0] > 0 ? 2 : 3) : 1;
    return hi ? (hi[1] < 0 ? 4 : 5) : 0;
  }
  const s = new Set([a, b].map(([dx, dz]) => dz > 0 ? 'S' : dz < 0 ? 'N' : dx > 0 ? 'E' : 'W'));
  return s.has('S') ? (s.has('E') ? 6 : 7) : s.has('W') ? 8 : 9;
}
/** Can the rail r take a join from x, z (one already pointing there; else one free end — a straight-only rail only across from the one it has)? */
function canTake(get, r, x, z) {
  const [rx, ry, rz, rv] = r, others = joined(get, rx, ry, rz, rv).filter(o => o[0] !== x || o[2] !== z);
  if (others.length >= 2) return false;
  if (others.length && BLOCKS[rv & 0xFFF].rail !== 'rail') { const o = others[0]; return o[0] - rx === rx - x && o[2] - rz === rz - z; }
  return true;
}
/**
 * A rail put down at x, y, z (v: the block, any state): its shape from the rails beside it that can still take a join,
 * set; those rails then turn to meet it. get(x, y, z), set(x, y, z, v). Returns the shape.
 */
export function placeRail(get, set, x, y, z, v) {
  const plain = BLOCKS[v & 0xFFF].rail === 'rail';
  const cand = SIDES.map(side => { const r = railBeside(get, x, y, z, ...side); return r && canTake(get, r, x, z) ? {side, r} : null; }).filter(Boolean);
  const at = (dx, dz) => cand.find(c => c.side[0] === dx && c.side[1] === dz);
  let a = null, b = null;
  if (at(0, -1) && at(0, 1)) [a, b] = [at(0, -1), at(0, 1)];
  else if (at(1, 0) && at(-1, 0)) [a, b] = [at(1, 0), at(-1, 0)];
  else if (cand.length >= 2 && plain) [a, b] = [cand.find(c => !c.side[0]), cand.find(c => !c.side[1])];
  else a = cand[0] || null;
  const s = a ? shapeFor(a.side, b?.side || null, a.r[1] > y, !!b && b.r[1] > y, plain) : 0;
  set(x, y, z, withShape(v, s));
  for (const c of [a, b]) if (c) turnToward(get, set, c.r, x, y, z);
  return s;
}
/** A rail beside a new one turns to meet it: on from what else it is joined to, sloping up to it when it is higher. */
function turnToward(get, set, r, x, y, z) {
  const [rx, ry, rz, rv] = r, other = joined(get, rx, ry, rz, rv).find(o => o[0] !== x || o[2] !== z);
  const s = shapeFor([x - rx, z - rz], other ? [other[0] - rx, other[2] - rz] : null, y > ry, !!other && other[1] > ry, BLOCKS[rv & 0xFFF].rail === 'rail');
  if (s !== railShape(rv)) set(rx, ry, rz, withShape(rv, s));
}
