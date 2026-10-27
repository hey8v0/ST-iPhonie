// What the player carries and makes: stacks, the inventory (36 slots, the first 9 the hotbar), crafting (2×2 in the
// inventory, 3×3 at a crafting table; shaped recipes may be mirrored), the furnace (smelting and fuel) and chests.
// Recipes are the game's.
import {itemInfo, BLOCKS, ITEMS} from './blocks.js';

export const stackMax = id => itemInfo(id)?.stack || 64;
export const same = (a, b) => a && b && a.id === b.id && !a.dmg && !b.dmg;
export const copy = s => s ? {...s} : null;

export class Inventory {
  constructor(size = 36) { this.slots = new Array(size).fill(null); }
  /** Puts a stack in (hotbar first, joining stacks of the same); returns what did not fit (or null). */
  add(stack) {
    if (!stack) return null;
    let left = stack.n;
    const max = stackMax(stack.id);
    for (let i = 0; i < this.slots.length && left; i++) { const s = this.slots[i]; if (same(s, stack) && s.n < max) { const k = Math.min(max - s.n, left); s.n += k; left -= k; } }
    for (let i = 0; i < this.slots.length && left; i++) if (!this.slots[i]) { const k = Math.min(max, left); this.slots[i] = {...stack, n: k}; left -= k; }
    return left ? {...stack, n: left} : null;
  }
  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0); }
  take(i, n = 1) { const s = this.slots[i]; if (!s) return null; const k = Math.min(n, s.n); s.n -= k; if (!s.n) this.slots[i] = null; return {...s, n: k}; }
  toJSON() { return this.slots; }
  static from(list, size = 36) { const inv = new Inventory(size); (list || []).slice(0, size).forEach((s, i) => { if (s && itemInfo(s.id)) inv.slots[i] = {id: s.id, n: Math.max(1, s.n | 0), ...(s.dmg ? {dmg: s.dmg} : {})}; }); return inv; }
}

// ---------- crafting ----------
const TAGS = {
  planks: BLOCKS.filter(b => b.name.endsWith('_planks')).map(b => b.name),
  logs: BLOCKS.filter(b => b.name.endsWith('_log')).map(b => b.name),
  stone_tool: ['cobblestone', 'cobbled_deepslate'],
  coals: ['coal', 'charcoal'],
};
const matches = (key, id) => key.startsWith('#') ? TAGS[key.slice(1)]?.includes(id) : key === id;
const R = [];
/** A shaped recipe: rows of letters, a key letter → id or #tag, and what it makes. */
const shaped = (rows, keys, id, n = 1) => R.push({rows, keys, out: {id, n}});
const shapeless = (ins, id, n = 1) => R.push({ins, out: {id, n}});
for (const w of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) shapeless([`${w}_log`], `${w}_planks`, 4);
shaped(['#', '#'], {'#': '#planks'}, 'stick', 4);
shaped(['##', '##'], {'#': '#planks'}, 'crafting_table');
shaped(['###', '# #', '###'], {'#': '#stone_tool'}, 'furnace');
shaped(['###', '# #', '###'], {'#': '#planks'}, 'chest');
shaped(['c', 's'], {c: '#coals', s: 'stick'}, 'torch', 4);
for (const [mat, key] of [['wooden', '#planks'], ['stone', '#stone_tool'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]) {
  shaped(['XXX', ' S ', ' S '], {X: key, S: 'stick'}, `${mat}_pickaxe`);
  shaped(['XX', 'XS', ' S'], {X: key, S: 'stick'}, `${mat}_axe`);
  shaped(['X', 'S', 'S'], {X: key, S: 'stick'}, `${mat}_shovel`);
  shaped(['X', 'X', 'S'], {X: key, S: 'stick'}, `${mat}_sword`);
  shaped(['XX', ' S', ' S'], {X: key, S: 'stick'}, `${mat}_hoe`);
}
shaped(['# #', ' # '], {'#': 'iron_ingot'}, 'bucket');
for (const [m, ingot] of [['iron', 'iron_ingot'], ['gold', 'gold_ingot'], ['diamond', 'diamond'], ['emerald', 'emerald'], ['coal', 'coal'], ['lapis', 'lapis_lazuli'], ['redstone', 'redstone'], ['copper', 'copper_ingot']]) {
  shaped(['###', '###', '###'], {'#': ingot}, `${m}_block`);
  shapeless([`${m}_block`], ingot, 9);
}
shaped(['##', '##'], {'#': 'brick'}, 'bricks');
shaped(['##', '##'], {'#': 'stone'}, 'stone_bricks', 4);
shaped(['##', '##'], {'#': 'sand'}, 'sandstone');
shaped(['##', '##'], {'#': 'red_sand'}, 'red_sandstone');
shaped(['##', '##'], {'#': 'snowball'}, 'snow_block');
shaped(['##', '##'], {'#': 'clay_ball'}, 'clay');
shaped(['##', '##'], {'#': 'glowstone_dust'}, 'glowstone');
shaped(['###'], {'#': 'snow_block'}, 'snow', 6);
shaped(['###', 'BBB', '###'], {'#': '#planks', B: 'book'}, 'bookshelf');
shaped(['S S', 'SSS', 'S S'], {S: 'stick'}, 'ladder', 3);
shaped(['###'], {'#': 'oak_planks'}, 'oak_slab', 6);
shaped(['###'], {'#': 'cobblestone'}, 'cobblestone_slab', 6);
shaped(['###'], {'#': 'smooth_stone'}, 'stone_slab', 6);
shaped(['###'], {'#': 'wheat'}, 'bread');
shaped(['# #', ' # '], {'#': '#planks'}, 'bowl', 4);
shaped(['###', '###', '###'], {'#': 'melon_slice'}, 'melon');
shaped(['###', '###', '###'], {'#': 'ice'}, 'packed_ice');
shaped(['###', '###', '###'], {'#': 'packed_ice'}, 'blue_ice');
shaped(['#D', 'D#'], {'#': 'dirt', D: 'gravel'}, 'coarse_dirt', 4);
shapeless(['cobblestone', 'moss_block'], 'mossy_cobblestone');
export const RECIPES = R;

/** What a crafting grid (w × h stacks, row by row) makes: {out, recipe} or null. */
export function craft(grid, w) {
  const h = grid.length / w;
  const ids = grid.map(s => s?.id || null);
  // the filled part of the grid
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  ids.forEach((id, i) => { if (id) { const x = i % w, y = Math.floor(i / w); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
  if (x1 < 0) return null;
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1, at = (x, y) => ids[(y0 + y) * w + x0 + x];
  const filled = ids.filter(Boolean);
  for (const r of R) {
    if (r.ins) {
      if (r.ins.length !== filled.length) continue;
      const left = [...filled];
      if (r.ins.every(k => { const i = left.findIndex(id => matches(k, id)); if (i < 0) return false; left.splice(i, 1); return true; })) return {out: {...r.out}, recipe: r};
      continue;
    }
    const rh = r.rows.length, rw = Math.max(...r.rows.map(s => s.length));
    if (rw !== pw || rh !== ph) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < rh && ok; y++) for (let x = 0; x < rw && ok; x++) {
        const ch = r.rows[y][mirror ? rw - 1 - x : x] || ' ', id = at(x, y);
        if (ch === ' ') ok = !id; else ok = !!id && matches(r.keys[ch], id);
      }
      if (ok) return {out: {...r.out}, recipe: r};
    }
  }
  return null;
}
/** Takes one of each ingredient from the grid after crafting (buckets would give back the bucket — none use them yet). */
export function useGrid(grid) { for (let i = 0; i < grid.length; i++) if (grid[i]) { grid[i].n--; if (!grid[i].n) grid[i] = null; } }

// ---------- furnace ----------
const SMELT = {
  sand: 'glass', red_sand: 'glass', cobblestone: 'stone', stone: 'smooth_stone', cobbled_deepslate: 'deepslate', clay_ball: 'brick', clay: 'terracotta',
  raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_copper: 'copper_ingot', iron_ore: 'iron_ingot', gold_ore: 'gold_ingot', copper_ore: 'copper_ingot',
  deepslate_iron_ore: 'iron_ingot', deepslate_gold_ore: 'gold_ingot', deepslate_copper_ore: 'copper_ingot', coal_ore: 'coal', deepslate_coal_ore: 'coal',
  diamond_ore: 'diamond', deepslate_diamond_ore: 'diamond', emerald_ore: 'emerald', deepslate_emerald_ore: 'emerald', lapis_ore: 'lapis_lazuli', deepslate_lapis_ore: 'lapis_lazuli',
  redstone_ore: 'redstone', deepslate_redstone_ore: 'redstone', wet_sponge: 'sponge',
};
for (const l of TAGS.logs) SMELT[l] = 'charcoal';
export const smeltOf = id => SMELT[id] || null;
/** Seconds of burning a fuel gives. */
export const fuelOf = id => { const i = itemInfo(id); return i?.fuel || 0; };
/** A furnace's state: {input, fuel, output, burn (ticks left), burnMax, cook (ticks done)}. One tick; returns lit. */
export function furnaceTick(f) {
  const result = f.input ? smeltOf(f.input.id) : null;
  const canOut = result && (!f.output || (f.output.id === result && f.output.n < stackMax(result)));
  if (f.burn > 0) f.burn--;
  if (!f.burn && canOut && f.fuel && fuelOf(f.fuel.id)) {
    f.burnMax = f.burn = Math.round(fuelOf(f.fuel.id) * 20);
    const wasBucket = f.fuel.id === 'lava_bucket';
    f.fuel.n--; if (!f.fuel.n) f.fuel = wasBucket ? {id: 'bucket', n: 1} : null;
  }
  if (f.burn > 0 && canOut) {
    f.cook = (f.cook || 0) + 1;
    if (f.cook >= 200) {
      f.cook = 0;
      f.input.n--; if (!f.input.n) f.input = null;
      if (f.output) f.output.n++; else f.output = {id: result, n: 1};
    }
  } else if (f.cook) f.cook = Math.max(0, f.cook - 2);
  return f.burn > 0;
}
export {ITEMS};
