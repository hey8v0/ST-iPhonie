// The boxes of blocks: what you bump into (collision) and what the aiming outline goes round (selection), in block
// units 0–1, as the game has them.
import {BLOCKS, ID} from './blocks.js';

const FULL = [[0, 0, 0, 1, 1, 1]];
const px = v => v / 16;
/** Boxes that stop the player. */
export function collisionBoxes(v) {
  if (!v) return null;
  const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id];
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
const TORCH = [null, [px(11), px(3), px(5.5), 1, px(13), px(10.5)], [0, px(3), px(5.5), px(5), px(13), px(10.5)], [px(5.5), px(3), px(11), px(10.5), px(13), 1], [px(5.5), px(3), 0, px(10.5), px(13), px(5)]];
/** Boxes of the outline when aimed at (null: can't be aimed at). Liquids only when asked for. */
export function selectionBoxes(v, liquids = false) {
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
    default: return FULL;
  }
}
export const isClimbable = v => !!BLOCKS[v & 0xFFF]?.climb;
export const slipperiness = v => BLOCKS[v & 0xFFF]?.slip || 0.6;
export {ID};
