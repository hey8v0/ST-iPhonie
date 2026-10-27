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
const paneJoins = n => { const s = shapeOf(n); return s === 'pane' || opaque(n) || (BLOCKS[n & 0xFFF]?.name === 'glass'); };

/**
 * The pieces a shaped block is drawn from: [{box: [x0, y0, z0, x1, y1, z1] (1/16), role}] — role picks the picture:
 * main (the block's own faces), wool (a bed's colour), pillow, wood, latch. null for blocks that are not drawn this way.
 */
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
    case 'door': return [{box: panel(meta & 4 ? (f + 1) % 4 : f), role: meta & 8 ? 'door_top' : 'door_bottom'}];
    case 'trapdoor': return [{box: meta & 4 ? panel(f) : meta & 8 ? [0, 13, 0, 16, 16, 16] : [0, 0, 0, 16, 3, 16], role: 'main'}];
    case 'bed': {
      const head = meta & 4, legs = [[0, 0, 0, 3, 3, 3], [13, 0, 0, 16, 3, 3], [0, 0, 13, 3, 3, 16], [13, 0, 13, 16, 3, 16]];
      const out = [{box: [0, 3, 0, 16, 9, 16], role: 'wool'}, ...legs.map(box => ({box, role: 'wood'}))];
      if (head) {
        // the pillow lies at the end the bed's head points to
        const p = [[2, 9, 6, 14, 10, 14], [2, 9, 2, 10, 10, 14], [2, 9, 2, 14, 10, 10], [6, 9, 2, 14, 10, 14]][f];
        out.push({box: p, role: 'pillow'});
      }
      return out;
    }
    case 'chest': {
      const latch = [[7, 7, 15, 9, 11, 16], [0, 7, 7, 1, 11, 9], [7, 7, 0, 9, 11, 1], [15, 7, 7, 16, 11, 9]][f];
      return [{box: [1, 0, 1, 15, 14, 15], role: 'main'}, {box: latch, role: 'latch'}];
    }
    case 'enchanting': return [{box: [0, 0, 0, 16, 12, 16], role: 'main'}];
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
    case 'anvil': {
      // the game's: a wide foot, a narrow waist, the long top lying along the way it faces
      const parts = [[2, 0, 2, 14, 4, 14], [4, 4, 3, 12, 5, 13], [6, 5, 4, 10, 10, 12], [3, 10, 0, 13, 16, 16]];
      return parts.map(([x0, y0, z0, x1, y1, z1]) => ({box: f % 2 === 0 ? [x0, y0, z0, x1, y1, z1] : [z0, y0, x0, z1, y1, x1], role: 'main'}));
    }
  }
  return null;
}
const toBlock = list => list.map(({box}) => box.map(px));

/** Boxes that stop the player. near: the blocks around (for fences, panes). */
export function collisionBoxes(v, near = () => 0) {
  if (!v) return null;
  const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id];
  switch (b.shape) {
    case 'fence': return toBlock(pieces(v, near).filter((p, i) => i === 0 || p.box[1] === 12)).map(q => [q[0], 0, q[2], q[3], 1.5, q[5]]);
    case 'gate': return meta & 4 ? null : (meta & 3) % 2 === 0 ? [[0, 0, px(6), 1, 1.5, px(10)]] : [[px(6), 0, 0, px(10), 1.5, 1]];
    case 'pane': case 'stairs': case 'door': case 'trapdoor': case 'chest': case 'anvil': return toBlock(pieces(v, near));
    case 'bed': return [[0, 0, 0, 1, px(9), 1]];
    case 'enchanting': return [[0, 0, 0, 1, px(12), 1]];
    case 'brewing': return [[px(7), 0, px(7), px(9), px(14), px(9)], [px(2), 0, px(1), px(15), px(2), px(15)]];
    case 'lectern': case 'bell': case 'cocoa': return toBlock(pieces(v, near));
  }
  if (!b.solid) {
    if (b.shape === 'layer' && meta > 0) return [[0, 0, 0, 1, px(meta * 2), 1]];
    return null;
  }
  switch (b.shape) {
    case 'slab': return meta === 2 ? FULL : meta === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case 'cactus': return [[px(1), 0, px(1), px(15), px(15), px(15)]];
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
    case 'none': return null;
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
    case 'brewing': return [[px(2), 0, px(1), px(15), px(14), px(15)]];
    case 'portal': return null;
    // a vine: a thin sheet on each side it clings to
    case 'vine': { const out = VINE.filter((q, d) => meta & 1 << d); return out.length ? out : [VINE[0]]; }
    case 'tall': return [[px(2), 0, px(2), px(14), 1, px(14)]];
    case 'lectern': case 'bell': case 'cocoa': return toBlock(pieces(v, near));
    case 'stairs': case 'fence': case 'gate': case 'pane': case 'door': case 'trapdoor': case 'chest': case 'anvil': return toBlock(pieces(v, near));
    default: return FULL;
  }
}
/** The blocks around a place in a world (get(x, y, z)), for joining shapes. */
export const nearIn = (world, x, y, z) => (dx, dy, dz) => world.get(x + dx, y + dy, z + dz);
export const isClimbable = v => !!BLOCKS[v & 0xFFF]?.climb;
export const slipperiness = v => BLOCKS[v & 0xFFF]?.slip || 0.6;
export {ID};
