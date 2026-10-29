// What the player carries and makes: stacks, the inventory (36 slots, the first 9 the hotbar), crafting (2×2 in the
// inventory, 3×3 at a crafting table; shaped recipes may be mirrored), the furnace (smelting and fuel) and chests.
// Recipes are the game's.
import {STEWS} from './loot.js';
import {itemInfo, BLOCKS, ITEMS, COLORS, ID, BOAT_WOODS, boatItem} from './blocks.js';

export const stackMax = id => itemInfo(id)?.stack || 64;
export const same = (a, b) => a && b && a.id === b.id && !a.dmg && !b.dmg && !a.ench && !b.ench && a.pot === b.pot && a.stew === b.stew && a.map === b.map;
export const copy = s => s ? {...s} : null;

/** The carried slots (the first 9 the hotbar); after them the four worn ones, head to feet. */
export const MAIN = 36, ARMOR_AT = 36;
export class Inventory {
  constructor(size = MAIN + 4) { this.slots = new Array(size).fill(null); }
  /** Puts a stack in (hotbar first, joining stacks of the same; never into the worn slots); returns what did not fit. */
  add(stack) {
    if (!stack) return null;
    let left = stack.n;
    const max = stackMax(stack.id), n = Math.min(MAIN, this.slots.length);
    for (let i = 0; i < n && left; i++) { const s = this.slots[i]; if (same(s, stack) && s.n < max) { const k = Math.min(max - s.n, left); s.n += k; left -= k; } }
    for (let i = 0; i < n && left; i++) if (!this.slots[i]) { const k = Math.min(max, left); this.slots[i] = {...stack, n: k}; left -= k; }
    return left ? {...stack, n: left} : null;
  }
  count(id) { return this.slots.slice(0, MAIN).reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0); }
  take(i, n = 1) { const s = this.slots[i]; if (!s) return null; const k = Math.min(n, s.n); s.n -= k; if (!s.n) this.slots[i] = null; return {...s, n: k}; }
  /** The worn piece in a slot (0 head … 3 feet). */
  worn(slot) { return this.slots[ARMOR_AT + slot] || null; }
  /** Armour points and toughness of what is worn. */
  armor() {
    let points = 0, tough = 0;
    for (let i = 0; i < 4; i++) { const a = itemInfo(this.worn(i)?.id)?.armor; if (a) { points += a.points; tough += a.tough; } }
    return {points, tough};
  }
  /** Puts on a piece from slot i (taking the place of what was worn there, which goes back to slot i). */
  wear(i) {
    const s = this.slots[i], a = s && itemInfo(s.id)?.armor;
    if (!a) return false;
    this.slots[i] = this.slots[ARMOR_AT + a.slot]; this.slots[ARMOR_AT + a.slot] = s;
    return true;
  }
  toJSON() { return this.slots; }
  static from(list, size = MAIN + 4) { const inv = new Inventory(size); (list || []).slice(0, size).forEach((s, i) => { if (s && itemInfo(s.id)) inv.slots[i] = clean(s); }); return inv; }
}
/** A saved stack, kept to what a stack has: id, count, wear, enchantments, the anvil's prior work, a potion's kind. */
export function clean(s) {
  return {id: s.id, n: Math.max(1, s.n | 0), ...(s.dmg ? {dmg: s.dmg} : {}), ...(s.ench && typeof s.ench === 'object' && Object.keys(s.ench).length ? {ench: {...s.ench}} : {}), ...(s.rep ? {rep: s.rep} : {}), ...(typeof s.pot === 'string' ? {pot: s.pot} : {})};
}

// ---------- crafting ----------
const TAGS = {
  planks: BLOCKS.filter(b => b.name.endsWith('_planks')).map(b => b.name),
  logs: BLOCKS.filter(b => /_(log|wood)$/.test(b.name)).map(b => b.name),
  wooden_slabs: ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'cherry', 'mangrove', 'bamboo', 'bamboo_mosaic'].map(w => `${w}_slab`),
  stone_tool: ['cobblestone', 'cobbled_deepslate'],
  coals: ['coal', 'charcoal'],
  stew_flowers: Object.keys(STEWS),
  wool: COLORS.map(c => `${c[0]}_wool`),
};
const matches = (key, id) => key.startsWith('#') ? TAGS[key.slice(1)]?.includes(id) : key === id;
const R = [];
/** A shaped recipe: rows of letters, a key letter → id or #tag, and what it makes. */
const shaped = (rows, keys, id, n = 1) => R.push({rows, keys, out: {id, n}});
// then(out, ids): what the result carries from what went in (a stew's flower)
const shapeless = (ins, id, n = 1, then = null) => R.push({ins, out: {id, n}, then});
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
shaped(['###'], {'#': 'stone'}, 'stone_slab', 6);
shaped(['###'], {'#': 'smooth_stone'}, 'smooth_stone_slab', 6);
shaped(['###'], {'#': 'wheat'}, 'bread');
shaped(['#c#'], {'#': 'wheat', c: 'cocoa_beans'}, 'cookie', 8);
shaped(['# #', ' # '], {'#': '#planks'}, 'bowl', 4);
shaped(['###', '###', '###'], {'#': 'melon_slice'}, 'melon');
shaped(['###', '###', '###'], {'#': 'ice'}, 'packed_ice');
shaped(['###', '###', '###'], {'#': 'packed_ice'}, 'blue_ice');
shaped(['#D', 'D#'], {'#': 'dirt', D: 'gravel'}, 'coarse_dirt', 4);
shapeless(['cobblestone', 'moss_block'], 'mossy_cobblestone');
shapeless(['bone'], 'bone_meal', 3);
shaped([' #X', '# X', ' #X'], {'#': 'stick', X: 'string'}, 'bow');
shaped(['F', 'S', 'E'], {F: 'flint', S: 'stick', E: 'feather'}, 'arrow', 4);
shapeless(['iron_ingot', 'flint'], 'flint_and_steel');
shaped([' #', '# '], {'#': 'iron_ingot'}, 'shears');
shaped(['G#G', '#G#', 'G#G'], {G: 'gunpowder', '#': 'sand'}, 'tnt');
shaped(['##', '##'], {'#': 'string'}, 'white_wool');
shaped(['###'], {'#': 'sugar_cane'}, 'paper', 3);
shapeless(['paper', 'paper', 'paper', 'leather'], 'book');
for (const [n, mat] of [['oak', 'oak_planks'], ['spruce', 'spruce_planks'], ['birch', 'birch_planks'], ['cobblestone', 'cobblestone'], ['stone_brick', 'stone_bricks'], ['brick', 'bricks'], ['sandstone', 'sandstone']])
  shaped(['#  ', '## ', '###'], {'#': mat}, `${n}_stairs`, 4);
for (const w of ['oak', 'spruce', 'birch']) {
  const p = `${w}_planks`;
  shaped(['#S#', '#S#'], {'#': p, S: 'stick'}, `${w}_fence`, 3);
  shaped(['S#S', 'S#S'], {'#': p, S: 'stick'}, `${w}_fence_gate`);
  shaped(['##', '##', '##'], {'#': p}, `${w}_door`, 3);
  shaped(['###', '###'], {'#': p}, `${w}_trapdoor`, 2);
}
shaped(['###', '###'], {'#': 'glass'}, 'glass_pane', 16);
shaped(['###', '###'], {'#': 'iron_ingot'}, 'iron_bars', 16);
for (const [c] of COLORS) shaped(['WWW', '###'], {W: `${c}_wool`, '#': '#planks'}, `${c}_bed`);
shaped([' B ', 'D#D', '###'], {B: 'book', D: 'diamond', '#': 'obsidian'}, 'enchanting_table');
shaped(['III', ' i ', 'iii'], {I: 'iron_block', i: 'iron_ingot'}, 'anvil');
shaped(['  S', ' SX', 'S X'], {S: 'stick', X: 'string'}, 'fishing_rod');
for (const [mat, x] of [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond']]) {
  shaped(['XXX', 'X X'], {X: x}, `${mat}_helmet`);
  shaped(['X X', 'XXX', 'XXX'], {X: x}, `${mat}_chestplate`);
  shaped(['XXX', 'X X', 'X X'], {X: x}, `${mat}_leggings`);
  shaped(['X X', 'X X'], {X: x}, `${mat}_boots`);
}
// villages: hay, the work blocks
shaped(['###', '###', '###'], {'#': 'wheat'}, 'hay_block');
shapeless(['hay_block'], 'wheat', 9);
shaped(['# #', '# #', '###'], {'#': 'oak_slab'}, 'composter');
shaped(['PSP', 'P P', 'PSP'], {P: '#planks', S: '#wooden_slabs'}, 'barrel');
shaped(['SS', 'PP'], {S: 'string', P: '#planks'}, 'loom');
shaped(['FF', 'PP', 'PP'], {F: 'flint', P: '#planks'}, 'fletching_table');
shaped(['II', 'PP', 'PP'], {I: 'iron_ingot', P: '#planks'}, 'smithing_table');
shaped([' L ', 'LFL', ' L '], {L: '#logs', F: 'furnace'}, 'smoker');
shaped(['III', 'IFI', 'SSS'], {I: 'iron_ingot', F: 'furnace', S: 'smooth_stone'}, 'blast_furnace');
shaped(['SSS', ' B ', ' S '], {S: 'oak_slab', B: 'bookshelf'}, 'lectern');
// the Nether and brewing
shaped(['# #', ' # '], {'#': 'glass'}, 'glass_bottle', 3);
shaped([' B ', '###'], {B: 'blaze_rod', '#': '#stone_tool'}, 'brewing_stand');
shapeless(['blaze_rod'], 'blaze_powder', 2);
shapeless(['spider_eye', 'brown_mushroom', 'sugar'], 'fermented_spider_eye');
shapeless(['sugar_cane'], 'sugar');
shaped(['###', '#C#', '###'], {'#': 'gold_nugget', C: 'carrot'}, 'golden_carrot');
shaped(['###', '#M#', '###'], {'#': 'gold_nugget', M: 'melon_slice'}, 'glistering_melon_slice');
shaped(['###', '###', '###'], {'#': 'gold_nugget'}, 'gold_ingot');
shapeless(['gold_ingot'], 'gold_nugget', 9);
shaped(['##', '##'], {'#': 'quartz'}, 'quartz_block');
shaped(['##', '##'], {'#': 'magma_cream'}, 'magma_block');
shaped(['##', '##'], {'#': 'nether_brick'}, 'nether_bricks');
shaped(['#B#', '#B#'], {'#': 'nether_bricks', B: 'nether_brick'}, 'nether_brick_fence', 6);
shaped(['#  ', '## ', '###'], {'#': 'nether_bricks'}, 'nether_brick_stairs', 4);
shapeless(['blaze_powder', '#coals', 'gunpowder'], 'fire_charge', 3);
// ---------- dyes and colours ----------
// dyes from flowers (two from a tall one), bone meal, cocoa, lapis, beetroot, ink; and mixed
const DYE_FROM = {white: ['bone_meal', 'lily_of_the_valley'], orange: ['orange_tulip'], magenta: ['allium', ['lilac', 2]], light_blue: ['blue_orchid'], yellow: ['dandelion', ['sunflower', 2]],
  pink: ['pink_tulip', ['peony', 2]], light_gray: ['azure_bluet', 'oxeye_daisy', 'white_tulip'], blue: ['lapis_lazuli', 'cornflower'], brown: ['cocoa_beans'],
  red: ['poppy', 'red_tulip', 'beetroot', ['rose_bush', 2]], black: ['ink_sac']};
for (const [c, list] of Object.entries(DYE_FROM)) for (const x of list) { const [id, n] = Array.isArray(x) ? x : [x, 1]; shapeless([id], `${c}_dye`, n); }
for (const [a, b, out, n] of [['red', 'yellow', 'orange', 2], ['purple', 'pink', 'magenta', 2], ['blue', 'white', 'light_blue', 2], ['green', 'white', 'lime', 2], ['red', 'white', 'pink', 2],
  ['black', 'white', 'gray', 2], ['gray', 'white', 'light_gray', 2], ['blue', 'green', 'cyan', 2], ['red', 'blue', 'purple', 2]]) shapeless([`${a}_dye`, `${b}_dye`], `${out}_dye`, n);
shapeless(['black_dye', 'white_dye', 'white_dye'], 'light_gray_dye', 3);
shapeless(['blue_dye', 'red_dye', 'pink_dye'], 'magenta_dye', 3);
// any wool and a dye; eight of terracotta, glass or panes round a dye; concrete powder; carpets; panes of stained glass
for (const [c] of COLORS) {
  const dye = `${c}_dye`;
  shapeless([dye, '#wool'], `${c}_wool`);
  shaped(['###', '#D#', '###'], {'#': 'terracotta', D: dye}, `${c}_terracotta`, 8);
  shaped(['###', '#D#', '###'], {'#': 'glass', D: dye}, `${c}_stained_glass`, 8);
  shaped(['###', '###'], {'#': `${c}_stained_glass`}, `${c}_stained_glass_pane`, 16);
  shaped(['###', '#D#', '###'], {'#': 'glass_pane', D: dye}, `${c}_stained_glass_pane`, 8);
  shapeless([dye, 'sand', 'sand', 'sand', 'sand', 'gravel', 'gravel', 'gravel', 'gravel'], `${c}_concrete_powder`, 8);
  shaped(['##'], {'#': `${c}_wool`}, `${c}_carpet`, 3);
}
// ---------- wood ----------
for (const w of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) {
  shaped(['##', '##'], {'#': `${w}_log`}, `${w}_wood`, 3);
  shaped(['##', '##'], {'#': `stripped_${w}_log`}, `stripped_${w}_wood`, 3);
  for (const from of [`${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`]) shapeless([from], `${w}_planks`, 4);
  if (w !== 'oak') shaped(['###'], {'#': `${w}_planks`}, `${w}_slab`, 6);
}
for (const w of ['jungle', 'acacia', 'dark_oak']) {
  const p = `${w}_planks`;
  shaped(['#  ', '## ', '###'], {'#': p}, `${w}_stairs`, 4);
  shaped(['#S#', '#S#'], {'#': p, S: 'stick'}, `${w}_fence`, 3);
  shaped(['S#S', 'S#S'], {'#': p, S: 'stick'}, `${w}_fence_gate`);
  shaped(['##', '##', '##'], {'#': p}, `${w}_door`, 3);
  shaped(['###', '###'], {'#': p}, `${w}_trapdoor`, 2);
}
// ---------- stone: stairs, slabs and walls of each family; polished, bricks, tiles, chiseled kinds ----------
for (const [mat, base] of [['stone', 'stone'], ['cobblestone', 'cobblestone'], ['mossy_cobblestone', 'mossy_cobblestone'], ['stone_bricks', 'stone_brick'], ['mossy_stone_bricks', 'mossy_stone_brick'],
  ['granite', 'granite'], ['diorite', 'diorite'], ['andesite', 'andesite'], ['polished_granite', 'polished_granite'], ['polished_diorite', 'polished_diorite'], ['polished_andesite', 'polished_andesite'],
  ['cobbled_deepslate', 'cobbled_deepslate'], ['polished_deepslate', 'polished_deepslate'], ['deepslate_bricks', 'deepslate_brick'], ['deepslate_tiles', 'deepslate_tile'],
  ['tuff', 'tuff'], ['polished_tuff', 'polished_tuff'], ['tuff_bricks', 'tuff_brick'], ['sandstone', 'sandstone'], ['red_sandstone', 'red_sandstone'], ['cut_sandstone', 'cut_sandstone'],
  ['cut_red_sandstone', 'cut_red_sandstone'], ['smooth_sandstone', 'smooth_sandstone'], ['smooth_red_sandstone', 'smooth_red_sandstone'], ['bricks', 'brick'], ['quartz_block', 'quartz'],
  ['smooth_quartz', 'smooth_quartz'], ['mud_bricks', 'mud_brick'], ['nether_bricks', 'nether_brick'], ['red_nether_bricks', 'red_nether_brick']]) {
  const made = id => ID[id] !== undefined && !R.some(r => r.out.id === id);
  if (made(`${base}_stairs`)) shaped(['#  ', '## ', '###'], {'#': mat}, `${base}_stairs`, 4);
  if (made(`${base}_slab`)) shaped(['###'], {'#': mat}, `${base}_slab`, 6);
  if (made(`${base}_wall`)) shaped(['###', '###'], {'#': mat}, `${base}_wall`, 6);
}
const square = (from, out, n = 4) => shaped(['##', '##'], {'#': from}, out, n);
const pillar = (from, out, n = 1) => shaped(['#', '#'], {'#': from}, out, n);
shapeless(['stone_bricks', 'moss_block'], 'mossy_stone_bricks'); shapeless(['stone_bricks', 'vine'], 'mossy_stone_bricks'); shapeless(['cobblestone', 'vine'], 'mossy_cobblestone');
pillar('stone_brick_slab', 'chiseled_stone_bricks');
for (const n of ['granite', 'diorite', 'andesite']) square(n, `polished_${n}`);
shapeless(['diorite', 'quartz'], 'granite'); shaped(['CQ', 'QC'], {C: 'cobblestone', Q: 'quartz'}, 'diorite', 2); shapeless(['diorite', 'cobblestone'], 'andesite', 2);
square('cobbled_deepslate', 'polished_deepslate'); square('polished_deepslate', 'deepslate_bricks'); square('deepslate_bricks', 'deepslate_tiles'); pillar('cobbled_deepslate_slab', 'chiseled_deepslate');
square('tuff', 'polished_tuff'); square('polished_tuff', 'tuff_bricks'); pillar('tuff_slab', 'chiseled_tuff'); pillar('tuff_brick_slab', 'chiseled_tuff_bricks');
for (const n of ['sandstone', 'red_sandstone']) { square(n, `cut_${n}`); pillar(`${n}_slab`, `chiseled_${n}`); }
pillar('quartz_slab', 'chiseled_quartz_block'); pillar('quartz_block', 'quartz_pillar', 2); square('quartz_block', 'quartz_bricks');
shapeless(['mud', 'wheat'], 'packed_mud'); square('packed_mud', 'mud_bricks');
shaped(['WB', 'BW'], {W: 'nether_wart', B: 'nether_brick'}, 'red_nether_bricks'); pillar('nether_brick_slab', 'chiseled_nether_bricks');
for (const m of ['iron', 'copper', 'gold']) { shaped(['###', '###', '###'], {'#': `raw_${m}`}, `raw_${m}_block`); shapeless([`raw_${m}_block`], `raw_${m}`, 9); }
// ---------- food ----------
shaped(['###', '#A#', '###'], {'#': 'gold_ingot', A: 'apple'}, 'golden_apple');
shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie');
shapeless(['red_mushroom', 'brown_mushroom', 'bowl'], 'mushroom_stew');
shapeless(['beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'bowl'], 'beetroot_soup');
// ---------- redstone ----------
shaped(['R', 'S'], {R: 'redstone', S: 'stick'}, 'redstone_torch');
shaped(['S', 'C'], {S: 'stick', C: 'cobblestone'}, 'lever');
shapeless(['stone'], 'stone_button');
shaped(['##'], {'#': 'stone'}, 'stone_pressure_plate');
for (const w of ['oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak']) { shapeless([`${w}_planks`], `${w}_button`); shaped(['##'], {'#': `${w}_planks`}, `${w}_pressure_plate`); }
shaped(['##'], {'#': 'gold_ingot'}, 'light_weighted_pressure_plate');
shaped(['##'], {'#': 'iron_ingot'}, 'heavy_weighted_pressure_plate');
shaped(['TRT', 'SSS'], {T: 'redstone_torch', R: 'redstone', S: 'stone'}, 'repeater');
shaped([' T ', 'TQT', 'SSS'], {T: 'redstone_torch', Q: 'quartz', S: 'stone'}, 'comparator');
shaped([' R ', 'RGR', ' R '], {R: 'redstone', G: 'glowstone'}, 'redstone_lamp');
shaped(['PPP', 'CIC', 'CRC'], {P: '#planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone'}, 'piston');
shaped(['S', 'P'], {S: 'slime_ball', P: 'piston'}, 'sticky_piston');
shaped(['CCC', 'RRQ', 'CCC'], {C: 'cobblestone', R: 'redstone', Q: 'quartz'}, 'observer');
shaped(['CCC', 'CBC', 'CRC'], {C: 'cobblestone', B: 'bow', R: 'redstone'}, 'dispenser');
shaped(['CCC', 'C C', 'CRC'], {C: 'cobblestone', R: 'redstone'}, 'dropper');
shaped(['I I', 'ICI', ' I '], {I: 'iron_ingot', C: 'chest'}, 'hopper');
shaped(['PPP', 'PRP', 'PPP'], {P: '#planks', R: 'redstone'}, 'note_block');
shaped(['GGG', 'QQQ', 'SSS'], {G: 'glass', Q: 'quartz', S: '#wooden_slabs'}, 'daylight_detector');
shaped(['II', 'II', 'II'], {I: 'iron_ingot'}, 'iron_door', 3);
shaped(['II', 'II'], {I: 'iron_ingot'}, 'iron_trapdoor');
shaped([' R ', 'RHR', ' R '], {R: 'redstone', H: 'hay_block'}, 'target');
shaped(['###', '###', '###'], {'#': 'slime_ball'}, 'slime_block'); shapeless(['slime_block'], 'slime_ball', 9);
shaped(['I I', 'ISI', 'I I'], {I: 'iron_ingot', S: 'stick'}, 'rail', 16);
shaped(['G G', 'GSG', 'GRG'], {G: 'gold_ingot', S: 'stick', R: 'redstone'}, 'powered_rail', 6);
shaped(['I I', 'IPI', 'IRI'], {I: 'iron_ingot', P: 'stone_pressure_plate', R: 'redstone'}, 'detector_rail', 6);
shaped(['ISI', 'ITI', 'ISI'], {I: 'iron_ingot', S: 'stick', T: 'redstone_torch'}, 'activator_rail', 6);
shaped(['I I', 'III'], {I: 'iron_ingot'}, 'minecart');
for (const [load, cart] of [['chest', 'chest_minecart'], ['furnace', 'furnace_minecart'], ['tnt', 'tnt_minecart'], ['hopper', 'hopper_minecart']]) shapeless([load, 'minecart'], cart);
// ---------- cherry, mangrove, bamboo; boats ----------
for (const w of ['cherry', 'mangrove']) {
  shapeless([`${w}_log`], `${w}_planks`, 4);
  shaped(['##', '##'], {'#': `${w}_log`}, `${w}_wood`, 3);
  shaped(['##', '##'], {'#': `stripped_${w}_log`}, `stripped_${w}_wood`, 3);
  for (const from of [`${w}_wood`, `stripped_${w}_log`, `stripped_${w}_wood`]) shapeless([from], `${w}_planks`, 4);
}
shaped(['###', '###', '###'], {'#': 'bamboo'}, 'bamboo_block');
for (const from of ['bamboo_block', 'stripped_bamboo_block']) shapeless([from], 'bamboo_planks', 2);
shaped(['#', '#'], {'#': 'bamboo'}, 'stick');
shaped(['#', '#'], {'#': 'bamboo_slab'}, 'bamboo_mosaic');
for (const [w, p] of [['cherry', 'cherry_planks'], ['mangrove', 'mangrove_planks'], ['bamboo', 'bamboo_planks'], ['bamboo_mosaic', 'bamboo_mosaic']]) {
  shaped(['###'], {'#': p}, `${w}_slab`, 6);
  shaped(['#  ', '## ', '###'], {'#': p}, `${w}_stairs`, 4);
  if (w === 'bamboo_mosaic') continue;
  shaped(['#S#', '#S#'], {'#': p, S: 'stick'}, `${w}_fence`, 3);
  shaped(['S#S', 'S#S'], {'#': p, S: 'stick'}, `${w}_fence_gate`);
  shaped(['##', '##', '##'], {'#': p}, `${w}_door`, 3);
  shaped(['###', '###'], {'#': p}, `${w}_trapdoor`, 2);
  shapeless([p], `${w}_button`);
  shaped(['##'], {'#': p}, `${w}_pressure_plate`);
}
shapeless(['mud', 'mangrove_roots'], 'muddy_mangrove_roots');
shapeless(['pink_petals'], 'pink_dye');
for (const w of BOAT_WOODS) { shaped(['# #', '###'], {'#': `${w}_planks`}, boatItem(w, false)); shapeless([boatItem(w, false), 'chest'], boatItem(w, true)); }
// ---------- the sea ----------
shaped(['##', '##'], {'#': 'prismarine_shard'}, 'prismarine');
shaped(['###', '###', '###'], {'#': 'prismarine_shard'}, 'prismarine_bricks');
shaped(['###', '#D#', '###'], {'#': 'prismarine_shard', D: 'black_dye'}, 'dark_prismarine');
shaped(['SCS', 'CCC', 'SCS'], {S: 'prismarine_shard', C: 'prismarine_crystals'}, 'sea_lantern');
for (const [mat, base] of [['prismarine', 'prismarine'], ['prismarine_bricks', 'prismarine_brick'], ['dark_prismarine', 'dark_prismarine']]) { shaped(['#  ', '## ', '###'], {'#': mat}, `${base}_stairs`, 4); shaped(['###'], {'#': mat}, `${base}_slab`, 6); }
shaped(['###', '###'], {'#': 'prismarine'}, 'prismarine_wall', 6);
shaped(['###', '###', '###'], {'#': 'dried_kelp'}, 'dried_kelp_block'); shapeless(['dried_kelp_block'], 'dried_kelp', 9);
shaped(['###', '# #'], {'#': 'turtle_scute'}, 'turtle_helmet');
// the sea's treasure and the finders
shaped(['###', '#H#', '###'], {'#': 'nautilus_shell', H: 'heart_of_the_sea'}, 'conduit');
shaped(['###', '###', '###'], {'#': 'iron_nugget'}, 'iron_ingot'); shapeless(['iron_ingot'], 'iron_nugget', 9);
shaped([' # ', '#R#', ' # '], {'#': 'iron_ingot', R: 'redstone'}, 'compass');
shaped([' # ', '#R#', ' # '], {'#': 'gold_ingot', R: 'redstone'}, 'clock');
shaped(['###', '#C#', '###'], {'#': 'paper', C: 'compass'}, 'map');
shapeless(['red_mushroom', 'brown_mushroom', 'bowl', '#stew_flowers'], 'suspicious_stew', 1, (out, ids) => ({...out, stew: ids.find(id => STEWS[id])}));
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
      if (r.ins.every(k => { const i = left.findIndex(id => matches(k, id)); if (i < 0) return false; left.splice(i, 1); return true; })) return {out: r.then ? r.then({...r.out}, filled) : {...r.out}, recipe: r};
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
  porkchop: 'cooked_porkchop', beef: 'cooked_beef', mutton: 'cooked_mutton', chicken: 'cooked_chicken', potato: 'baked_potato', cod: 'cooked_cod', salmon: 'cooked_salmon',
  netherrack: 'nether_brick', nether_quartz_ore: 'quartz', nether_gold_ore: 'gold_ingot', kelp: 'dried_kelp',
  stone_bricks: 'cracked_stone_bricks', deepslate_bricks: 'cracked_deepslate_bricks', deepslate_tiles: 'cracked_deepslate_tiles', nether_bricks: 'cracked_nether_bricks',
  sandstone: 'smooth_sandstone', red_sandstone: 'smooth_red_sandstone', quartz_block: 'smooth_quartz', cactus: 'green_dye',
  ...Object.fromEntries(COLORS.map(([c]) => [`${c}_terracotta`, `${c}_glazed_terracotta`])),
};
for (const l of TAGS.logs) SMELT[l] = 'charcoal';
// iron and gold tools, weapons and armour melt down to a nugget
for (const [mat, nugget] of [['iron', 'iron_nugget'], ['golden', 'gold_nugget']]) for (const k of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword', 'helmet', 'chestplate', 'leggings', 'boots']) SMELT[`${mat}_${k}`] = nugget;
for (const k of ['helmet', 'chestplate', 'leggings', 'boots']) SMELT[`chainmail_${k}`] = 'iron_nugget';
export const smeltOf = id => SMELT[id] || null;
// experience for each thing smelted, given when the result is taken out (the game's numbers)
const SMELT_XP = {iron_ingot: 0.7, copper_ingot: 0.7, gold_ingot: 1, diamond: 1, emerald: 1, lapis_lazuli: 0.2, redstone: 0.3, coal: 0.1, charcoal: 0.15,
  glass: 0.1, stone: 0.1, smooth_stone: 0.1, deepslate: 0.1, brick: 0.3, terracotta: 0.35, sponge: 0.15, nether_brick: 0.1, quartz: 0.2, green_dye: 1,
  cracked_stone_bricks: 0.1, cracked_deepslate_bricks: 0.1, cracked_deepslate_tiles: 0.1, cracked_nether_bricks: 0.1, smooth_sandstone: 0.1, smooth_red_sandstone: 0.1, smooth_quartz: 0.1,
  ...Object.fromEntries(COLORS.map(([c]) => [`${c}_glazed_terracotta`, 0.1])),
  cooked_porkchop: 0.35, cooked_beef: 0.35, cooked_mutton: 0.35, cooked_chicken: 0.35, baked_potato: 0.35, cooked_cod: 0.35, cooked_salmon: 0.35, dried_kelp: 0.1};
/** Whole experience points for what was smelted (the fraction left is a chance of one more). */
export function takeSmeltXp(f, r = Math.random) { const x = f.xp || 0; f.xp = 0; return Math.floor(x) + (r() < x - Math.floor(x) ? 1 : 0); }
/** Seconds of burning a fuel gives. */
export const fuelOf = id => { const i = itemInfo(id); return i?.fuel || 0; };
// the smoker cooks only food and the blast furnace only ore and raw metal, each twice as fast (burning fuel twice as fast)
const FOODS = new Set(['porkchop', 'beef', 'mutton', 'chicken', 'potato', 'cod', 'salmon', 'kelp']);
export const smeltsIn = (type, id) => !!smeltOf(id) && (!type || (type === 'food' ? FOODS.has(id) : /_ore$|^raw_/.test(id)));
/**
 * A furnace's state: {input, fuel, output, burn (ticks left), burnMax, cook (ticks done), type ('food' | 'ore' for the
 * smoker and blast furnace)}. One tick; returns lit.
 */
export function furnaceTick(f) {
  const result = f.input && smeltsIn(f.type, f.input.id) ? smeltOf(f.input.id) : null, fast = f.type ? 2 : 1;
  const canOut = result && (!f.output || (f.output.id === result && f.output.n < stackMax(result)));
  if (f.burn > 0) f.burn--;
  if (!f.burn && canOut && f.fuel && fuelOf(f.fuel.id)) {
    f.burnMax = f.burn = Math.round(fuelOf(f.fuel.id) * 20 / fast);
    const wasBucket = f.fuel.id === 'lava_bucket';
    f.fuel.n--; if (!f.fuel.n) f.fuel = wasBucket ? {id: 'bucket', n: 1} : null;
  }
  if (f.burn > 0 && canOut) {
    f.cook = (f.cook || 0) + 1;
    if (f.cook >= 200 / fast) {
      f.cook = 0;
      f.input.n--; if (!f.input.n) f.input = null;
      if (f.output) f.output.n++; else f.output = {id: result, n: 1};
      f.xp = (f.xp || 0) + (SMELT_XP[result] || 0);
    }
  } else if (f.cook) f.cook = Math.max(0, f.cook - 2);
  return f.burn > 0;
}
export {ITEMS};
