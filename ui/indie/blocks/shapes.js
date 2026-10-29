// The boxes of blocks: what you bump into (collision), what the aiming outline goes round (selection), and the pieces
// a shaped block is drawn from (stairs, fences and gates, panes and bars, doors, trapdoors, beds, chests, cocoa) — one place
// for all three, so what you see is what you hit. Units: block 0–1 for collision and selection, 1/16 for pieces.
// Some shapes join their neighbours (fences, panes): near(dx, dy, dz) gives the block next to it.
import {BLOCKS, ID} from './blocks.js';

const FULL = [[0, 0, 0, 1, 1, 1]];
const px = v => v / 16;
// directions as the facing in a block's state: 0 south (+z), 1 west (−x), 2 north (−z), 3 east (+x)
export const DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** A 3-thick panel standing at one edge (a door, an open trapdoor). */
const panel = (e, t = 3) => [[0, 0, 16 - t, 16, 16, 16], [0, 0, 0, t, 16, 16], [0, 0, 0, 16, 16, t], [16 - t, 0, 0, 16, 16, 16]][e];
const shapeOf = v => BLOCKS[v & 0xFFF]?.shape;
const opaque = v => !!BLOCKS[v & 0xFFF]?.opaque;
/** Does a fence join what is beside it in direction d (a fence, a gate turned across, a full block)? */
function fenceJoins(n, d) {
  const s = shapeOf(n);
  if (s === 'fence') return true;
  if (s === 'gate') { const f = n >>> 12 & 3; return (f % 2) !== (d % 2); }
  return opaque(n);
}
const paneJoins = n => { const s = shapeOf(n); return s === 'pane' || s === 'stonewall' || opaque(n) || /glass$/.test(BLOCKS[n & 0xFFF]?.name || ''); };
/** Does a wall join what is beside it (a wall, a pane or bars, a fence gate, a full block)? */
const wallJoins = n => { const s = shapeOf(n); return s === 'stonewall' || s === 'pane' || s === 'gate' || opaque(n); };

/**
 * The pieces a shaped block is drawn from: [{box: [x0, y0, z0, x1, y1, z1] (1/16), role}] — role picks the picture:
 * main (the block's own faces), wool (a bed's colour), pillow, wood, latch. null for blocks that are not drawn this way.
 */
// ---------- redstone ----------
// levers and buttons hang on a face: state & 7 — 0/1 on a floor (lying along z / x), 2/3 under a ceiling, 4–7 on a wall
// facing south, west, north, east; the block they hang on lies that way (as FACES: 3 down, 2 up, 5 north, 0 east …)
export const ATTACHED = [3, 3, 2, 2, 5, 0, 4, 1];
export const LEVER_BASE = [[5, 0, 4, 11, 3, 12], [4, 0, 5, 12, 3, 11], [5, 13, 4, 11, 16, 12], [4, 13, 5, 12, 16, 11], [5, 4, 0, 11, 12, 3], [13, 4, 5, 16, 12, 11], [5, 4, 13, 11, 12, 16], [0, 4, 5, 3, 12, 11]];
const button = (a, d) => [[6, 0, 5, 10, d, 11], [5, 0, 6, 11, d, 10], [6, 16 - d, 5, 10, 16, 11], [5, 16 - d, 6, 11, 16, 10], [5, 6, 0, 11, 10, d], [16 - d, 6, 5, 16, 10, 11], [5, 6, 16 - d, 11, 10, 16], [0, 6, 5, d, 10, 11]][a];
// a piston pushed out: its base the back 12 of the block; its head a plate at the far side and the arm back into the base
// (state & 7: the way the head points, as FACES)
const PISTON_BASE = [[0, 0, 0, 12, 16, 16], [4, 0, 0, 16, 16, 16], [0, 0, 0, 16, 12, 16], [0, 4, 0, 16, 16, 16], [0, 0, 0, 16, 16, 12], [0, 0, 4, 16, 16, 16]];
const HEAD_PLATE = [[12, 0, 0, 16, 16, 16], [0, 0, 0, 4, 16, 16], [0, 12, 0, 16, 16, 16], [0, 0, 0, 16, 4, 16], [0, 0, 12, 16, 16, 16], [0, 0, 0, 16, 16, 4]];
const HEAD_ARM = [[-4, 6, 6, 12, 10, 10], [4, 6, 6, 20, 10, 10], [6, -4, 6, 10, 12, 10], [6, 4, 6, 10, 20, 10], [6, 6, -4, 10, 10, 12], [6, 6, 4, 10, 10, 20]];
// a hopper: the bowl (four walls round a floor), the middle, and the spout down or to a side (state & 7: FACES 3, 0, 1, 4, 5)
const HOPPER_SPOUT = {3: [6, 0, 6, 10, 4, 10], 0: [12, 4, 6, 16, 8, 10], 1: [0, 4, 6, 4, 8, 10], 4: [6, 4, 12, 10, 8, 16], 5: [6, 4, 0, 10, 8, 4]};
// what dust joins: a block that gives power (or a repeater along its way, an observer with its back to it)
const RS_KIND = BLOCKS.map(b => b.rs || '');
const HSIDES = [[0, 1, 0], [1, -1, 0], [4, 0, 1], [5, 0, -1]];
const OPP6 = [1, 0, 3, 2, 5, 4];
/** Does redstone carry power through this block (a full solid one — not glass, a block of redstone, an observer)? */
export const conducts = v => !!BLOCKS[v & 0xFFF]?.opaque && !['block', 'observer', 'piston'].includes(RS_KIND[v & 0xFFF]);
function dustJoins(n, f) {
  const k = RS_KIND[n & 0xFFF], m = n >>> 12;
  if (!k || k === 'lamp' || k === 'piston' || k === 'head' || k === 'note' || k === 'tnt' || k === 'bell' || k === 'hopper' || k === 'dispenser' || k === 'dropper') return false;
  if (k === 'repeater') return (f === 0 || f === 1) === ((m & 3) % 2 === 1);
  if (k === 'observer') return (m & 7) === f;
  if (k === 'rail') return BLOCKS[n & 0xFFF].rail === 'detector';
  return true;
}
/**
 * Which ways redstone dust runs (the game's): for each side — east, west, south, north (FACES 0, 1, 4, 5) — 0 not, 1
 * along the ground (to dust beside it or a step down, or to what gives or takes power), 2 also up the side of the
 * block there to dust on top of it. Joined nowhere it runs all four ways; joined one way, straight through.
 */
export function wireLinks(near) {
  const out = [0, 0, 0, 0], high = conducts(near(0, 1, 0));
  HSIDES.forEach(([f, dx, dz], i) => {
    const n = near(dx, 0, dz);
    if (RS_KIND[n & 0xFFF] === 'wire' || dustJoins(n, f)) out[i] = 1;
    else if (!high && BLOCKS[n & 0xFFF]?.opaque && RS_KIND[near(dx, 1, dz) & 0xFFF] === 'wire') out[i] = 2;
    else if (!BLOCKS[n & 0xFFF]?.opaque && RS_KIND[near(dx, -1, dz) & 0xFFF] === 'wire') out[i] = 1;
  });
  const n = out.filter(Boolean).length;
  if (!n) return [1, 1, 1, 1];
  if (n === 1) { const i = out.findIndex(Boolean); out[i ^ 1] = out[i ^ 1] || 1; }
  return out;
}
export const WIRE_SIDES = HSIDES;
/** Is a rail's shape (0–9, the game's) a slope? 2–5 go up to the east, west, north, south. */
export const railSlope = m => m >= 2 && m <= 5;
export function pieces(v, near = () => 0) {
  const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id];
  const f = meta & 3;
  switch (b?.shape) {
    case 'stairs': {
      const up = meta & 4, [lo, hi] = up ? [8, 16] : [0, 8], [qlo, qhi] = up ? [0, 8] : [8, 16];
      const q = [[0, qlo, 8, 16, qhi, 16], [0, qlo, 0, 8, qhi, 16], [0, qlo, 0, 16, qhi, 8], [8, qlo, 0, 16, qhi, 16]][f];
      return [{box: [0, lo, 0, 16, hi, 16], role: 'main'}, {box: q, role: 'main'}];
    }
    case 'fence': {
      const out = [{box: [6, 0, 6, 10, 16, 10], role: 'main'}];
      const arms = [[[7, 10], [9, 16], 'z'], [[0, 7], [6, 9], 'x'], [[7, 0], [9, 6], 'z'], [[10, 7], [16, 9], 'x']];
      for (let d = 0; d < 4; d++) {
        if (!fenceJoins(near(DIR[d][0], 0, DIR[d][1]), d)) continue;
        const [[x0, z0], [x1, z1]] = arms[d];
        for (const [y0, y1] of [[6, 9], [12, 15]]) out.push({box: [x0, y0, z0, x1, y1, z1], role: 'main'});
      }
      return out;
    }
    case 'gate': {
      const open = meta & 4, alongX = f % 2 === 0;
      const posts = alongX ? [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9]] : [[7, 5, 0, 9, 16, 2], [7, 5, 14, 9, 16, 16]];
      const out = posts.map(box => ({box, role: 'main'}));
      if (!open) for (const [y0, y1] of [[6, 9], [12, 15]]) out.push({box: alongX ? [2, y0, 7, 14, y1, 9] : [7, y0, 2, 9, y1, 14], role: 'main'});
      else {
        // swung open: the two halves stand out to the front from their posts
        const s = f === 0 || f === 3 ? 1 : -1;
        for (const [y0, y1] of [[6, 9], [12, 15]]) {
          if (alongX) { const [z0, z1] = s > 0 ? [9, 15] : [1, 7]; out.push({box: [0, y0, z0, 2, y1, z1], role: 'main'}, {box: [14, y0, z0, 16, y1, z1], role: 'main'}); }
          else { const [x0, x1] = s > 0 ? [9, 15] : [1, 7]; out.push({box: [x0, y0, 0, x1, y1, 2], role: 'main'}, {box: [x0, y0, 14, x1, y1, 16], role: 'main'}); }
        }
      }
      return out;
    }
    case 'pane': {
      const out = [{box: [7, 0, 7, 9, 16, 9], role: 'main'}];
      const arms = [[7, 0, 9, 9, 16, 16], [0, 0, 7, 7, 16, 9], [7, 0, 0, 9, 16, 7], [9, 0, 7, 16, 16, 9]];
      for (let d = 0; d < 4; d++) if (paneJoins(near(DIR[d][0], 0, DIR[d][1]))) out.push({box: arms[d], role: 'main'});
      return out;
    }
    // a wall: a post (none in the middle of a straight run), and an arm 14 high to each side it joins
    case 'stonewall': {
      const j = [0, 1, 2, 3].map(d => wallJoins(near(DIR[d][0], 0, DIR[d][1]))), straight = (j[0] && j[2] && !j[1] && !j[3]) || (j[1] && j[3] && !j[0] && !j[2]);
      const arms = [[5, 0, 8, 11, 14, 16], [0, 0, 5, 8, 14, 11], [5, 0, 0, 11, 14, 8], [8, 0, 5, 16, 14, 11]];
      const out = j.flatMap((on, d) => on ? [{box: arms[d], role: 'main'}] : []);
      // the post: not in the middle of a straight run, unless a torch stands on it
      if (!straight || shapeOf(near(0, 1, 0)) === 'torch') out.unshift({box: [4, 0, 4, 12, 16, 12], role: 'main'});
      return out;
    }
    case 'carpet': return [{box: [0, 0, 0, 16, 1, 16], role: 'main'}];
    case 'door': return [{box: panel(meta & 4 ? (f + 1) % 4 : f), role: meta & 8 ? 'door_top' : 'door_bottom'}];
    case 'trapdoor': return [{box: meta & 4 ? panel(f) : meta & 8 ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16], role: 'main'}];
    case 'bed': {
      // the game's bed (26.x): a mattress six high on legs three high, two legs at this half's own end (the head's at
      // the end its head points to, the foot's at the far end)
      const [dx, dz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][f], s = meta & 4 ? 1 : -1, ex = dx * s, ez = dz * s;
      const legs = ex ? [[ex > 0 ? 13 : 0, 0, 0], [ex > 0 ? 13 : 0, 0, 13]] : [[0, 0, ez > 0 ? 13 : 0], [13, 0, ez > 0 ? 13 : 0]];
      return [{box: [0, 3, 0, 16, 9, 16], role: 'bed'}, ...legs.map(([x, y, z]) => ({box: [x, y, z, x + 3, y + 3, z + 3], role: 'bed'}))];
    }
    case 'chest': {
      // a large chest's half (state >> 2: 1 the left one, 2 the right one, as seen from in front): its box reaches the
      // other half (seam: that way), the latch is half of the large chest's one in the middle
      const half = meta >> 2 & 3;
      if (half === 1 || half === 2) {
        const [fx, fz] = DIR[f], [sx, sz] = half === 1 ? [fz, 0 - fx] : [0 - fz, fx];
        const at = (d, s) => d ? (d > 0 ? [15, 16] : [0, 1]) : s > 0 ? [15, 16] : [0, 1], [lx0, lx1] = at(fx, sx), [lz0, lz1] = at(fz, sz);
        return [{box: [sx < 0 ? 0 : 1, 0, sz < 0 ? 0 : 1, sx > 0 ? 16 : 15, 14, sz > 0 ? 16 : 15], role: 'half', seam: [sx, sz]}, {box: [lx0, 7, lz0, lx1, 11, lz1], role: 'latch'}];
      }
      const latch = [[7, 7, 15, 9, 11, 16], [0, 7, 7, 1, 11, 9], [7, 7, 0, 9, 11, 1], [15, 7, 7, 16, 11, 9]][f];
      return [{box: [1, 0, 1, 15, 14, 15], role: 'main'}, {box: latch, role: 'latch'}];
    }
    case 'enchanting': return [{box: [0, 0, 0, 16, 12, 16], role: 'main'}];
    // the conduit: six across in the middle of its place
    case 'conduit': return [{box: [5, 5, 5, 11, 11, 11], role: 'main'}];
    // the brewing stand: the rod, three arms holding the bottles' places, and the three-footed stone base
    case 'brewing': return [{box: [7, 0, 7, 9, 14, 9], role: 'main'}, {box: [9, 11, 7.5, 14, 12, 8.5], role: 'main'}, {box: [3, 11, 3, 7, 12, 4], role: 'main'}, {box: [3, 11, 12, 7, 12, 13], role: 'main'},
      {box: [9, 0, 5, 15, 2, 11], role: 'base'}, {box: [2, 0, 1, 8, 2, 7], role: 'base'}, {box: [2, 0, 9, 8, 2, 15], role: 'base'}];
    // the composter: a box of planks open at the top, filled to its level (8: ready, bone meal on top)
    case 'composter': {
      const out = [[0, 0, 0, 16, 2, 16], [0, 2, 0, 2, 16, 16], [14, 2, 0, 16, 16, 16], [2, 2, 0, 14, 16, 2], [2, 2, 14, 14, 16, 16]].map(box => ({box, role: 'main'}));
      if (meta) out.push({box: [2, 2, 2, 14, Math.min(15, 1 + Math.min(meta, 7) * 2), 14], role: meta >= 8 ? 'ready' : 'compost'});
      return out;
    }
    // the lectern: a base, a post, and the sloping top (drawn flat)
    case 'lectern': return [{box: [0, 0, 0, 16, 2, 16], role: 'base'}, {box: [4, 2, 4, 12, 13, 12], role: 'main'}, {box: [0, 13, 0, 16, 15, 16], role: 'main'}];
    // the bell hanging between two stone posts
    case 'bell': return [{box: [0, 0, 6, 2, 16, 10], role: 'post'}, {box: [14, 0, 6, 16, 16, 10], role: 'post'}, {box: [2, 13, 7, 14, 15, 9], role: 'post'},
      {box: [5, 6, 5, 11, 12, 11], role: 'main'}, {box: [4, 4, 4, 12, 6, 12], role: 'main'}, {box: [7, 12, 7, 9, 13, 9], role: 'main'}];
    // a portal: a thin sheet across the middle of the block, standing along x (0) or z (1)
    case 'portal': return [{box: meta & 1 ? [6, 0, 0, 10, 16, 16] : [0, 0, 6, 16, 16, 10], role: 'main'}];
    // a cocoa pod hanging on the side of the log it faces (0 south …), bigger as it ripens (age: meta >> 2)
    case 'cocoa': {
      const age = Math.min(2, meta >> 2), hw = [2, 3, 4][age], h = [5, 7, 9][age], y0 = 12 - h;
      return [{box: [[8 - hw, y0, 15 - 2 * hw, 8 + hw, 12, 15], [1, y0, 8 - hw, 1 + 2 * hw, 12, 8 + hw], [8 - hw, y0, 1, 8 + hw, 12, 1 + 2 * hw], [15 - 2 * hw, y0, 8 - hw, 15, 12, 8 + hw]][f], role: 'main'}];
    }
    case 'button': return [{box: button(meta & 7, meta & 8 ? 1 : 2), role: 'main'}];
    case 'plate': return [{box: [1, 0, 1, 15, 1, 15], role: 'main'}];
    case 'lever': return [{box: LEVER_BASE[meta & 7], role: 'main'}];
    case 'detector': return [{box: [0, 0, 0, 16, 6, 16], role: 'main'}];
    case 'repeater': case 'comparator': return [{box: [0, 0, 0, 16, 2, 16], role: 'main'}];
    case 'piston': return [{box: meta & 8 ? PISTON_BASE[meta & 7] : [0, 0, 0, 16, 16, 16], role: 'main'}];
    case 'piston_head': return [{box: HEAD_PLATE[meta & 7], role: 'main'}, {box: HEAD_ARM[meta & 7], role: 'arm'}];
    case 'hopper': {
      const out = [[0, 10, 0, 16, 16, 2], [0, 10, 14, 16, 16, 16], [0, 10, 2, 2, 16, 14], [14, 10, 2, 16, 16, 14]].map(box => ({box, role: 'main'}));
      out.push({box: [2, 10, 2, 14, 11, 14], role: 'inside'}, {box: [4, 4, 4, 12, 10, 12], role: 'main'}, {box: HOPPER_SPOUT[meta & 7] || HOPPER_SPOUT[3], role: 'main'});
      return out;
    }
    case 'anvil': {
      // the game's: a wide foot, a narrow waist, the long top lying along the way it faces
      const parts = [[2, 0, 2, 14, 4, 14], [4, 4, 3, 12, 5, 13], [6, 5, 4, 10, 10, 12], [3, 10, 0, 13, 16, 16]];
      return parts.map(([x0, y0, z0, x1, y1, z1]) => ({box: f % 2 === 0 ? [x0, y0, z0, x1, y1, z1] : [z0, y0, x0, z1, y1, x1], role: 'main'}));
    }
  }
  return null;
}
const toBlock = list => list.map(({box}) => box.map(px));
/** The same, kept inside the block (a piston head's arm reaches into the base). */
const inBlock = list => list.map(({box}) => box.map(v => px(Math.max(0, Math.min(16, v)))));

// sea pickles (one to four) and turtle eggs (one to four), where each stands in its block (1/16): [x0, z0, size, height]
export const PICKLES = [[[6, 6, 4, 6]], [[3, 3, 4, 6], [9, 9, 4, 4]], [[2, 7, 4, 6], [8, 3, 4, 4], [9, 9, 4, 6]], [[2, 2, 4, 4], [9, 2, 4, 6], [2, 9, 4, 6], [9, 9, 4, 7]]];
export const EGGS = [[[5, 5, 4, 7]], [[2, 3, 4, 7], [9, 8, 3, 5]], [[2, 3, 4, 7], [9, 8, 3, 5], [8, 2, 3, 4]], [[2, 3, 4, 7], [9, 8, 3, 5], [8, 2, 3, 4], [3, 10, 4, 5]]];
/**
 * How far a plant that stands off the middle of its block (bamboo) is moved, in 1/16: [x, z], the same all the way up
 * a column (the game's: up to a quarter of a block each way, from the place).
 */
export function plantOffset(x, z) {
  if (x === undefined) return [0, 0];
  let h = Math.imul(x, 3129871) ^ Math.imul(z, 116129781);
  h = Math.imul(h ^ h >>> 15, 2246822507); h ^= h >>> 13;
  return [Math.round(((h & 15) / 15 - 0.5) * 8), Math.round(((h >>> 8 & 15) / 15 - 0.5) * 8)];
}
/** Boxes that stop the player. near: the blocks around (for fences, panes; near.x, near.z: where it is). */
export function collisionBoxes(v, near = () => 0) {
  if (!v) return null;
  const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id];
  switch (b.shape) {
    case 'bamboo': { const [ox, oz] = plantOffset(near.x, near.z); return [[px(6.5 + ox), 0, px(6.5 + oz), px(9.5 + ox), 1, px(9.5 + oz)]]; }
    case 'petals': case 'pickle': case 'fan': return null;
    case 'eggs': return [[px(1), 0, px(1), px(15), px(7), px(15)]];
    case 'fence': return toBlock(pieces(v, near).filter((p, i) => i === 0 || p.box[1] === 12)).map(q => [q[0], 0, q[2], q[3], 1.5, q[5]]);
    case 'stonewall': return toBlock(pieces(v, near)).map(q => [q[0], 0, q[2], q[3], 1.5, q[5]]);
    case 'carpet': return [[0, 0, 0, 1, px(1), 1]];
    case 'gate': return meta & 4 ? null : (meta & 3) % 2 === 0 ? [[0, 0, px(6), 1, 1.5, px(10)]] : [[px(6), 0, 0, px(10), 1.5, 1]];
    case 'pane': case 'stairs': case 'door': case 'trapdoor': case 'chest': case 'anvil': case 'conduit': return toBlock(pieces(v, near));
    case 'bed': return [[0, 0, 0, 1, px(9), 1]];
    case 'enchanting': return [[0, 0, 0, 1, px(12), 1]];
    case 'brewing': return [[px(7), 0, px(7), px(9), px(14), px(9)], [px(2), 0, px(1), px(15), px(2), px(15)]];
    case 'lectern': case 'bell': case 'cocoa': return toBlock(pieces(v, near));
    case 'repeater': case 'comparator': case 'piston': case 'piston_head': case 'hopper': case 'detector': return inBlock(pieces(v, near));
  }
  if (!b.solid) {
    if (b.shape === 'layer' && meta > 0) return [[0, 0, 0, 1, px(meta * 2), 1]];
    return null;
  }
  switch (b.shape) {
    case 'slab': return meta === 2 ? FULL : meta === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case 'cactus': return [[px(1), 0, px(1), px(15), px(15), px(15)]];
    case 'campfire': return [[0, 0, 0, 1, px(7), 1]];
    case 'farmland': return [[0, 0, 0, 1, px(15), 1]];
    default: return FULL;
  }
}
const VINE = [[0, 0, px(15), 1, 1, 1], [0, 0, 0, px(1), 1, 1], [0, 0, 0, 1, 1, px(1)], [px(15), 0, 0, 1, 1, 1]];
const TORCH = [null, [px(11), px(3), px(5.5), 1, px(13), px(10.5)], [0, px(3), px(5.5), px(5), px(13), px(10.5)], [px(5.5), px(3), px(11), px(10.5), px(13), 1], [px(5.5), px(3), 0, px(10.5), px(13), px(5)]];
/** Boxes of the outline when aimed at (null: can't be aimed at). Liquids only when asked for. */
export function selectionBoxes(v, liquids = false, near = () => 0) {
  if (!v) return null;
  const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id];
  switch (b.shape) {
    case 'none': case 'fire': return null;
    case 'liquid': return liquids && (meta === 0) ? FULL : null;
    case 'cross':
      if (b.name.endsWith('_sapling') || b.name === 'dead_bush' || b.name === 'short_grass' || b.name === 'fern') return [[px(2), 0, px(2), px(14), px(13), px(14)]];
      if (b.name === 'sugar_cane') return [[px(2), 0, px(2), px(14), 1, px(14)]];
      if (b.name.endsWith('mushroom')) return [[px(5), 0, px(5), px(11), px(6), px(11)]];
      return [[px(5), 0, px(5), px(11), px(10), px(11)]];
    case 'crop': return [[0, 0, 0, 1, px(Math.min(16, (meta + 1) * 2)), 1]];
    case 'torch': return meta ? [TORCH[meta]] : [[px(6), 0, px(6), px(10), px(10), px(10)]];
    case 'lantern': return [[px(5), 0, px(5), px(11), px(9), px(11)]];
    case 'layer': return [[0, 0, 0, 1, px(Math.min(16, (meta + 1) * 2)), 1]];
    case 'slab': return meta === 2 ? FULL : meta === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case 'cactus': return [[px(1), 0, px(1), px(15), 1, px(15)]];
    case 'farmland': return [[0, 0, 0, 1, px(15), 1]];
    case 'wall': return [[[0, 0, 0, 1, 1, px(3)], [px(13), 0, 0, 1, 1, 1], [0, 0, px(13), 1, 1, 1], [0, 0, 0, px(3), 1, 1]][meta & 3]];
    case 'bed': return [[0, 0, 0, 1, px(9), 1]];
    case 'enchanting': return [[0, 0, 0, 1, px(12), 1]];
    case 'campfire': return [[0, 0, 0, 1, px(7), 1]];
    // a sign: a post's column standing; on a wall, the board against it (the game's)
    case 'sign': return [[px(4), 0, px(4), px(12), 1, px(12)]];
    case 'wall_sign': return [[[0, px(4.5), 0, 1, px(12.5), px(2)], [px(14), px(4.5), 0, 1, px(12.5), 1], [0, px(4.5), px(14), 1, px(12.5), 1], [0, px(4.5), 0, px(2), px(12.5), 1]][meta & 3]];
    case 'brewing': return [[px(2), 0, px(1), px(15), px(14), px(15)]];
    case 'portal': return null;
    // a vine: a thin sheet on each side it clings to
    case 'vine': { const out = VINE.filter((q, d) => meta & 1 << d); return out.length ? out : [VINE[0]]; }
    case 'tall': return [[px(2), 0, px(2), px(14), 1, px(14)]];
    case 'lectern': case 'bell': case 'cocoa': return toBlock(pieces(v, near));
    case 'wire': return [[0, 0, 0, 1, px(1), 1]];
    case 'bamboo': { const [ox, oz] = plantOffset(near.x, near.z), r = (meta & 3) === 2 ? 5 : 3; return [[px(8 - r + ox), 0, px(8 - r + oz), px(8 + r + ox), 1, px(8 + r + oz)]]; }
    case 'petals': return [[0, 0, 0, 1, px(3), 1]];
    case 'pickle': { const list = PICKLES[meta & 3]; return [[px(Math.min(...list.map(q => q[0]))), 0, px(Math.min(...list.map(q => q[1]))), px(Math.max(...list.map(q => q[0] + q[2]))), px(Math.max(...list.map(q => q[3]))), px(Math.max(...list.map(q => q[1] + q[2])))]]; }
    case 'eggs': return [[px(1), 0, px(1), px(15), px(7), px(15)]];
    // on a wall: eight high round its middle, eleven out from the wall (the game's)
    case 'fan': { const s = meta & 7; return s ? [[s === 1 ? px(5) : 0, px(4), s === 3 ? px(5) : 0, s === 2 ? px(11) : 1, px(12), s === 4 ? px(11) : 1]] : [[px(2), 0, px(2), px(14), px(4), px(14)]]; }
    case 'rail': return [[0, 0, 0, 1, px(railSlope(BLOCKS[id].rail === 'rail' ? meta : meta & 7) ? 8 : 2), 1]];
    case 'lever': { const [x0, y0, z0, x1, y1, z1] = LEVER_BASE[meta & 7], a = meta & 7; return [(a < 2 ? [4, 0, 4, 12, 7, 12] : a < 4 ? [4, 9, 4, 12, 16, 12] : [Math.min(x0, 16 - x1 === 0 ? 10 : x0), 3, Math.min(z0, 16 - z1 === 0 ? 10 : z0), Math.max(x1, x0 === 0 ? 6 : x1), 13, Math.max(z1, z0 === 0 ? 6 : z1)]).map(px)]; }
    case 'button': case 'plate': case 'repeater': case 'comparator': case 'piston': case 'piston_head': case 'hopper': case 'detector': return inBlock(pieces(v, near));
    case 'stairs': case 'fence': case 'gate': case 'pane': case 'door': case 'trapdoor': case 'chest': case 'anvil': case 'stonewall': case 'carpet': case 'conduit': return toBlock(pieces(v, near));
    default: return FULL;
  }
}
/** The blocks around a place in a world (get(x, y, z)), for joining shapes. */
export const nearIn = (world, x, y, z) => Object.assign((dx, dy, dz) => world.get(x + dx, y + dy, z + dz), {x, z});
export const isClimbable = v => !!BLOCKS[v & 0xFFF]?.climb;
export const slipperiness = v => BLOCKS[v & 0xFFF]?.slip || 0.6;
export {ID};
