// Redstone's machines on the page, where the containers' things and the items on the ground are (the world worker decides
// when they act, redstone.js): hoppers moving one item at a time, what a dispenser or dropper fires, how full a container
// is (for comparators), pressure plates weighing what stands on them. The game's rules (Java edition).
import {itemInfo} from './blocks.js';
import {stackMax, same} from './inventory.js';

/** The things a container holds, as [where, stack] (a furnace's input, fuel and output; the others' slots). */
const held = tile => tile.kind === 'furnace' ? [['input', tile.input], ['fuel', tile.fuel], ['output', tile.output]] : (tile.slots || []).map((s, i) => [i, s]);
const take = (tile, at) => { const s = tile.kind === 'furnace' ? tile[at] : tile.slots[at]; s.n--; if (!s.n) { if (tile.kind === 'furnace') tile[at] = null; else tile.slots[at] = null; } };

/** How full a container is for a comparator (the game's: 0 empty, else 1 + 14 × how full its slots are on average), or null. */
export function fillLevel(tile) {
  const list = held(tile);
  if (!list.length || !['chest', 'furnace', 'brew', 'dispenser', 'hopper', 'pot'].includes(tile.kind)) return null;
  let f = 0, any = false;
  for (const [, s] of list) if (s) { any = true; f += s.n / stackMax(s.id); }
  return any ? Math.floor(1 + f / list.length * 14) : 0;
}
/**
 * Puts one of a stack into a container, as a hopper does: a furnace takes it to cook from above and as fuel from a side;
 * a brewing stand an ingredient from above, blaze powder or bottles from a side. True when it went in.
 */
export function insertOne(tile, s, fromAbove) {
  const one = {...s, n: 1};
  const into = (get, put) => { const cur = get(); if (!cur) { put(one); return true; } if (same(cur, s) && cur.n < stackMax(cur.id)) { cur.n++; return true; } return false; };
  if (tile.kind === 'furnace') {
    if (!fromAbove && !(itemInfo(s.id)?.fuel > 0)) return false;
    const k = fromAbove ? 'input' : 'fuel';
    return into(() => tile[k], v => { tile[k] = v; });
  }
  if (tile.kind === 'brew') {
    if (fromAbove) return into(() => tile.slots[3], v => { tile.slots[3] = v; });
    if (s.id === 'blaze_powder') return into(() => tile.slots[4], v => { tile.slots[4] = v; });
    if (!['potion', 'splash_potion', 'glass_bottle'].includes(s.id)) return false;
    const i = tile.slots.slice(0, 3).indexOf(null);
    if (i < 0) return false;
    tile.slots[i] = one; return true;
  }
  if (!tile.slots) return false;
  for (const c of tile.slots) if (c && same(c, s) && c.n < stackMax(c.id)) { c.n++; return true; }
  const i = tile.slots.indexOf(null);
  if (i < 0) return false;
  tile.slots[i] = one; return true;
}
/** Moves one item from a container into another (from a furnace only what is done; from a brewing stand nothing). */
export function moveOne(from, to, fromAbove) {
  if (from.kind === 'brew') return false;
  for (const [at, s] of held(from)) {
    if (!s || (from.kind === 'furnace' && at !== 'output')) continue;
    if (insertOne(to, s, fromAbove)) { take(from, at); return true; }
  }
  return false;
}
/** One item taken out of a container for a dispenser or dropper to fire: from a slot picked at random. → [slot, stack] | null */
export function pickSlot(tile, r = Math.random) {
  const full = tile.slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
  if (!full.length) return null;
  const i = full[Math.floor(r() * full.length)];
  return [i, tile.slots[i]];
}
/**
 * What a pressure plate gives for what is on it (list of {kind: 'player' | 'mob' | 'item'}): stone only for players and mobs,
 * wood for anything, gold one a thing (to 15), iron one each ten.
 */
export function plateLevel(b, list) {
  if (b.weight) return Math.min(15, Math.ceil(list.length / b.weight));
  return list.some(e => !b.mobsOnly || e.kind !== 'item') ? 15 : 0;
}
