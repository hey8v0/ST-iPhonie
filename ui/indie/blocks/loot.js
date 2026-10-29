// Loot: what the chests the land is made with hold, as the game's loot tables (shipwrecks, ocean ruins, buried
// treasure, desert pyramids), and the thing in each suspicious sand or gravel. Such a chest only carries the name of
// its table until it is first opened (or broken); then it is filled from random numbers of the world's seed and its
// place, so the same chest always holds the same things (and a suspicious block the same thing).
import {itemInfo} from './blocks.js';
import {ENCHANTS, chooseEnchants, enchanted, canHave, seeded} from './enchant.js';

// a table is its pools; a pool rolls (from, to) times among its entries [weight, item, [from, to], what is done to it]:
// 'enchant' one enchantment at random (at any of its levels), 'levels' enchanted as at a table of 5–30 levels (the
// treasure ones too), 'map' a treasure map to the nearest buried treasure, 'stew' a flower's effect, 'water_breathing'
// that potion
export const LOOT = {
  shipwreck_supply: [
    {rolls: [3, 10], entries: [[8, 'paper', [1, 12]], [7, 'potato', [2, 6]], [7, 'moss_block', [1, 4]], [7, 'poisonous_potato', [2, 6]], [7, 'carrot', [4, 8]], [7, 'wheat', [8, 21]],
      [10, 'suspicious_stew', [1, 1], 'stew'], [6, 'coal', [2, 8]], [5, 'rotten_flesh', [5, 24]], [2, 'pumpkin', [1, 3]], [2, 'bamboo', [1, 3]], [3, 'gunpowder', [1, 5]], [1, 'tnt', [1, 2]],
      [3, 'leather_helmet', [1, 1], 'enchant'], [3, 'leather_chestplate', [1, 1], 'enchant'], [3, 'leather_leggings', [1, 1], 'enchant'], [3, 'leather_boots', [1, 1], 'enchant']]},
  ],
  shipwreck_map: [
    {rolls: [1, 1], entries: [[1, 'filled_map', [1, 1], 'map']]},
    {rolls: [3, 3], entries: [[1, 'compass', [1, 1]], [1, 'map', [1, 1]], [1, 'clock', [1, 1]], [20, 'paper', [1, 10]], [10, 'feather', [1, 5]], [5, 'book', [1, 5]]]},
  ],
  shipwreck_treasure: [
    {rolls: [3, 6], entries: [[90, 'iron_ingot', [1, 5]], [10, 'gold_ingot', [1, 5]], [40, 'emerald', [1, 5]], [5, 'diamond', [1, 1]], [5, 'experience_bottle', [1, 1]]]},
    {rolls: [2, 5], entries: [[50, 'iron_nugget', [1, 10]], [10, 'gold_nugget', [1, 10]], [20, 'lapis_lazuli', [1, 10]]]},
  ],
  underwater_ruin_small: [
    {rolls: [2, 8], entries: [[10, 'coal', [1, 4]], [2, 'stone_axe', [1, 1]], [5, 'rotten_flesh', [1, 1]], [1, 'emerald', [1, 1]], [10, 'wheat', [2, 3]]]},
    {rolls: [1, 1], entries: [[1, 'leather_chestplate', [1, 1]], [1, 'golden_helmet', [1, 1]], [5, 'fishing_rod', [1, 1], 'levels'], [5, 'filled_map', [1, 1], 'map']]},
  ],
  underwater_ruin_big: [
    {rolls: [2, 8], entries: [[10, 'coal', [1, 4]], [10, 'gold_nugget', [1, 3]], [1, 'emerald', [1, 1]], [10, 'wheat', [2, 3]]]},
    {rolls: [1, 1], entries: [[1, 'golden_apple', [1, 1]], [5, 'enchanted_book', [1, 1], 'enchant'], [1, 'leather_chestplate', [1, 1]], [1, 'golden_helmet', [1, 1]], [5, 'fishing_rod', [1, 1], 'levels'],
      [10, 'filled_map', [1, 1], 'map']]},
  ],
  buried_treasure: [
    {rolls: [1, 1], entries: [[1, 'heart_of_the_sea', [1, 1]]]},
    {rolls: [5, 8], entries: [[20, 'iron_ingot', [1, 4]], [10, 'gold_ingot', [1, 4]], [5, 'tnt', [1, 2]]]},
    {rolls: [1, 3], entries: [[5, 'emerald', [4, 8]], [5, 'diamond', [1, 2]], [5, 'prismarine_crystals', [1, 5]]]},
    {rolls: [0, 1], entries: [[1, 'leather_chestplate', [1, 1]], [1, 'iron_sword', [1, 1]]]},
    {rolls: [2, 2], entries: [[1, 'cooked_cod', [2, 4]], [1, 'cooked_salmon', [2, 4]]]},
    {rolls: [0, 2], entries: [[1, 'potion', [1, 1], 'water_breathing']]},
  ],
  // the desert pyramid's chests (saddles and horse armour, not in this world yet, come out as nothing — as an empty roll
  // does)
  desert_pyramid: [
    {rolls: [2, 4], entries: [[5, 'diamond', [1, 3]], [15, 'iron_ingot', [1, 5]], [15, 'gold_ingot', [2, 7]], [15, 'emerald', [1, 3]], [25, 'bone', [4, 6]], [25, 'spider_eye', [1, 3]],
      [25, 'rotten_flesh', [3, 7]], [20, 'saddle', [1, 1]], [15, 'iron_horse_armor', [1, 1]], [10, 'golden_horse_armor', [1, 1]], [5, 'diamond_horse_armor', [1, 1]],
      [20, 'enchanted_book', [1, 1], 'enchant'], [20, 'golden_apple', [1, 1]], [2, 'enchanted_golden_apple', [1, 1]], [15, 'empty', [1, 1]]]},
    {rolls: [4, 4], entries: [[10, 'bone', [1, 8]], [10, 'gunpowder', [1, 8]], [10, 'rotten_flesh', [1, 8]], [10, 'string', [1, 8]], [10, 'sand', [1, 8]]]},
  ],
  // what suspicious sand and gravel hold, one thing each (the game's archaeology tables; the warm ruins' sniffer egg is
  // left out till there are sniffers)
  desert_pyramid_archaeology: [{rolls: [1, 1], entries: [[1, 'archer_pottery_sherd', [1, 1]], [1, 'miner_pottery_sherd', [1, 1]], [1, 'prize_pottery_sherd', [1, 1]],
    [1, 'skull_pottery_sherd', [1, 1]], [1, 'diamond', [1, 1]], [1, 'tnt', [1, 1]], [1, 'gunpowder', [1, 1]], [1, 'emerald', [1, 1]]]}],
  desert_well_archaeology: [{rolls: [1, 1], entries: [[2, 'arms_up_pottery_sherd', [1, 1]], [2, 'brewer_pottery_sherd', [1, 1]], [1, 'brick', [1, 1]], [1, 'emerald', [1, 1]], [1, 'stick', [1, 1]],
    [1, 'suspicious_stew', [1, 1], 'stew']]}],
  ocean_ruin_warm_archaeology: [{rolls: [1, 1], entries: [[1, 'angler_pottery_sherd', [1, 1]], [1, 'shelter_pottery_sherd', [1, 1]], [1, 'snort_pottery_sherd', [1, 1]], [1, 'iron_axe', [1, 1]],
    [2, 'emerald', [1, 1]], [2, 'wheat', [1, 1]], [2, 'wooden_hoe', [1, 1]], [2, 'coal', [1, 1]], [2, 'gold_nugget', [1, 1]]]}],
  ocean_ruin_cold_archaeology: [{rolls: [1, 1], entries: [[1, 'blade_pottery_sherd', [1, 1]], [1, 'explorer_pottery_sherd', [1, 1]], [1, 'mourner_pottery_sherd', [1, 1]],
    [1, 'plenty_pottery_sherd', [1, 1]], [1, 'iron_axe', [1, 1]], [2, 'emerald', [1, 1]], [2, 'wheat', [1, 1]], [2, 'wooden_hoe', [1, 1]], [2, 'coal', [1, 1]], [2, 'gold_nugget', [1, 1]]]}],
};
/** What a suspicious stew does, by the flower in it (the game's): [effect, level, seconds]. */
export const STEWS = {
  dandelion: ['saturation', 0, 0.35], blue_orchid: ['saturation', 0, 0.35], poppy: ['night_vision', 0, 5], allium: ['fire_resistance', 0, 4], azure_bluet: ['blindness', 0, 8],
  red_tulip: ['weakness', 0, 9], orange_tulip: ['weakness', 0, 9], white_tulip: ['weakness', 0, 9], pink_tulip: ['weakness', 0, 9], oxeye_daisy: ['regeneration', 0, 8],
  cornflower: ['jump_boost', 0, 6], lily_of_the_valley: ['poison', 0, 12], wither_rose: ['wither', 0, 8],
};

const tableSeed = (seed, x, y, z, table) => {
  let h = Math.imul(seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791), 2654435761);
  for (const c of table) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h ^ h >>> 15) >>> 0;
};
/** One enchantment the item can have, at a level of it at random (a book becomes an enchanted book). */
function enchantRandomly(stack, r) {
  const id = stack.id === 'enchanted_book' ? 'book' : stack.id, list = Object.keys(ENCHANTS).filter(n => canHave(id, n));
  if (!list.length) return stack;
  const name = list[r.int(list.length)];
  return enchanted({...stack, id}, [[name, 1 + r.int(ENCHANTS[name].max)]]);
}
function made(entry, r, ctx) {
  const [, id, [lo, hi], fn] = entry;
  let stack = {id, n: lo + r.int(hi - lo + 1)};
  if (fn === 'enchant') stack = enchantRandomly(stack, r);
  if (fn === 'levels') stack = enchanted(stack, chooseEnchants(id, 5 + r.int(26), r, true));
  if (fn === 'stew') { const kinds = Object.keys(STEWS); stack.stew = kinds[r.int(kinds.length)]; }
  if (fn === 'water_breathing') stack.pot = 'water_breathing';
  // no buried treasure near: a plain empty map
  if (fn === 'map') stack = ctx.map() || {id: 'map', n: 1};
  return stack;
}
/** The stacks a table gives (before they are put in a chest). ctx.map(): a treasure map's stack, or null. */
export function rollLoot(table, r, ctx = {}) {
  const out = [];
  for (const pool of LOOT[table] || []) {
    const [lo, hi] = pool.rolls, total = pool.entries.reduce((s, e) => s + e[0], 0);
    for (let k = lo + r.int(hi - lo + 1); k > 0; k--) {
      let w = r.int(total);
      const entry = pool.entries.find(e => (w -= e[0]) < 0);
      if (entry && itemInfo(entry[1])) out.push(made(entry, r, ctx));
    }
  }
  return out;
}
/**
 * A chest's 27 slots filled from a table as the game fills one: stacks of more than one are split at random while
 * there are empty slots to spare, and all go to places at random. seed: the world's; map(): a treasure map's stack.
 */
export function lootChest(table, seed, x, y, z, ctx = {}) {
  const r = seeded(tableSeed(seed, x, y, z, table)), slots = new Array(27).fill(null);
  const stacks = rollLoot(table, r, ctx), list = stacks.filter(s => s.n <= 1), split = stacks.filter(s => s.n > 1);
  while (27 - list.length - split.length > 0 && split.length) {
    const s = split.splice(r.int(split.length), 1)[0], k = 1 + r.int(Math.max(1, Math.floor(s.n / 2))), part = {...s, n: k};
    s.n -= k;
    if (s.n > 1 && r.int(2)) split.push(s); else list.push(s);
    if (part.n > 1 && r.int(2)) split.push(part); else list.push(part);
  }
  list.push(...split);
  const places = Array.from({length: 27}, (_, i) => i);
  for (let i = places.length - 1; i > 0; i--) { const j = r.int(i + 1); [places[i], places[j]] = [places[j], places[i]]; }
  list.slice(0, 27).forEach((s, i) => { slots[places[i]] = s; });
  return slots;
}
/** The one thing a suspicious block holds, from its table (the same for the same block every time), or null. */
export function lootItem(table, seed, x, y, z) {
  return rollLoot(table, seeded(tableSeed(seed, x, y, z, table)))[0] || null;
}
