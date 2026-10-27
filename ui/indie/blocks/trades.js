// Villagers' work and trades, as the game (Java Edition) has them: each profession has its work block and five levels
// (新手, 学徒, 老手, 专家, 大师); at each level a villager offers two trades picked from that level's list, and trading
// with it earns it experience toward the next. An offer: {buy: stack, buy2?: stack, sell: stack, uses, max, xp}. Trades
// for things this world does not have yet (maps, cookies, banners…) are left out.
import {ENCHANTS, chooseEnchants, enchanted, seeded} from './enchant.js';
import {COLORS} from './blocks.js';

export const LEVELS = ['新手', '学徒', '老手', '专家', '大师'];
// experience to reach each level (the game's: 10, 70, 150, 250)
export const LEVEL_XP = [0, 10, 70, 150, 250];
export const levelOf = xp => LEVEL_XP.filter(n => xp >= n).length - 1;

const E = n => ({id: 'emerald', n});
const S = (id, n = 1) => ({id, n});
// a trade: what the villager takes, what it gives, how often (12, 16 or 3 times before it restocks)
const T = (buy, sell, max = 16, buy2 = null) => ({buy, sell, max, ...(buy2 ? {buy2} : {})});
// a random thing chosen when the offer is made: fn(r) → trade
const pick = (...list) => r => list[r.int(list.length)];
const wool = r => COLORS[r.int(COLORS.length)][0];
/** An enchanted thing for sale: enchanted as at a table of 5–19 levels, its price from that (the game's). */
const enchantedSale = (id, base) => r => { const lv = 5 + r.int(15); return T([E(Math.min(64, base + lv))], enchanted(S(id), chooseEnchants(id, lv, r)), 3); };
/** A librarian's enchanted book: a random enchantment at a random level, 2 + rand(5 + 10·level) + 3·level emeralds (twice for treasure). */
const bookSale = r => {
  const names = Object.keys(ENCHANTS), n = names[r.int(names.length)], e = ENCHANTS[n], lv = 1 + r.int(e.max);
  let price = 2 + r.int(5 + lv * 10) + 3 * lv;
  if (e.treasure) price *= 2;
  return T([E(Math.min(64, price))], {id: 'enchanted_book', n: 1, ench: {[n]: lv}}, 12, S('book'));
};

/** The professions: zh, the work block, and per level the trades it may offer. */
export const PROFESSIONS = {
  farmer: {zh: '农民', block: 'composter', levels: [
    [T([S('wheat', 20)], E(1)), T([S('potato', 26)], E(1)), T([S('carrot', 22)], E(1)), T([E(1)], S('bread', 6))],
    [T([S('pumpkin', 6)], E(1), 12), T([E(1)], S('apple', 4))],
    [T([S('melon', 4)], E(1), 12), T([E(1)], S('baked_potato', 6))],
    [T([E(1)], S('golden_carrot', 1), 12), T([S('melon_slice', 18)], E(1))],
    [T([E(3)], S('golden_carrot', 3), 12), T([E(4)], S('glistering_melon_slice', 3), 12)],
  ]},
  fisherman: {zh: '渔夫', block: 'barrel', levels: [
    [T([S('string', 20)], E(1)), T([S('coal', 10)], E(1)), T([S('cod', 6)], S('cooked_cod', 6), 16, E(1))],
    [T([S('cod', 15)], E(1)), T([S('salmon', 6)], S('cooked_salmon', 6), 16, E(1))],
    [T([S('salmon', 13)], E(1)), enchantedSale('fishing_rod', 3)],
    [T([S('tropical_fish', 6)], E(1), 12), T([S('pufferfish', 4)], E(1), 12)],
    [T([S('pufferfish', 4)], E(1), 12), T([E(1)], S('fishing_rod'), 12)],
  ]},
  shepherd: {zh: '牧羊人', block: 'loom', levels: [
    [T([S('white_wool', 18)], E(1)), T([S('brown_wool', 18)], E(1)), T([S('black_wool', 18)], E(1)), T([S('gray_wool', 18)], E(1)), T([E(2)], S('shears'), 12)],
    [r => T([E(1)], S(`${wool(r)}_wool`, 1)), r => T([E(1)], S(`${wool(r)}_wool`, 1))],
    [r => T([E(3)], S(`${wool(r)}_bed`, 1), 12), r => T([E(3)], S(`${wool(r)}_bed`, 1), 12)],
    [T([S('string', 16)], E(1)), r => T([E(2)], S(`${wool(r)}_wool`, 4))],
    [T([E(2)], S('white_bed', 1), 12), T([E(1)], S('shears'), 12)],
  ]},
  fletcher: {zh: '制箭师', block: 'fletching_table', levels: [
    [T([S('stick', 32)], E(1)), T([E(1)], S('arrow', 16)), T([S('gravel', 10)], S('flint', 10), 12, E(1))],
    [T([S('flint', 26)], E(1), 12), T([E(2)], S('bow'), 12)],
    [T([S('string', 14)], E(1)), T([E(3)], S('arrow', 32), 12)],
    [T([S('feather', 24)], E(1)), enchantedSale('bow', 2)],
    [T([S('feather', 24)], E(1)), enchantedSale('bow', 4)],
  ]},
  librarian: {zh: '图书管理员', block: 'lectern', levels: [
    [T([S('paper', 24)], E(1)), bookSale, T([E(9)], S('bookshelf'), 12)],
    [T([S('book', 4)], E(1), 12), bookSale, T([E(1)], S('lantern', 1))],
    [bookSale, T([E(1)], S('glass', 4))],
    [bookSale, T([S('paper', 24)], E(1))],
    [bookSale, bookSale],
  ]},
  cleric: {zh: '牧师', block: 'brewing_stand', levels: [
    [T([S('rotten_flesh', 32)], E(1)), T([E(1)], S('redstone', 2), 12)],
    [T([S('gold_ingot', 3)], E(1), 12), T([E(1)], S('lapis_lazuli', 1), 12)],
    [T([E(4)], S('glowstone', 1), 12), T([S('spider_eye', 12)], E(1))],
    [T([S('glass_bottle', 9)], E(1), 12), T([S('blaze_powder', 4)], E(1), 12)],
    [T([S('nether_wart', 22)], E(1), 12), T([E(5)], {id: 'potion', n: 1, pot: 'healing'}, 12)],
  ]},
  armorer: {zh: '盔甲匠', block: 'blast_furnace', levels: [
    [T([S('coal', 15)], E(1)), T([E(5)], S('iron_leggings'), 12), T([E(4)], S('iron_boots'), 12), T([E(5)], S('iron_helmet'), 12), T([E(9)], S('iron_chestplate'), 12)],
    [T([S('iron_ingot', 4)], E(1), 12), T([E(36)], S('bell'), 12)],
    [T([S('lava_bucket', 1)], E(1), 12), T([S('diamond', 1)], E(1), 12)],
    [enchantedSale('diamond_leggings', 14), enchantedSale('diamond_boots', 8)],
    [enchantedSale('diamond_helmet', 8), enchantedSale('diamond_chestplate', 16)],
  ]},
  toolsmith: {zh: '工具匠', block: 'smithing_table', levels: [
    [T([S('coal', 15)], E(1)), T([E(1)], S('stone_axe'), 12), T([E(1)], S('stone_shovel'), 12), T([E(1)], S('stone_pickaxe'), 12), T([E(1)], S('stone_hoe'), 12)],
    [T([S('iron_ingot', 4)], E(1), 12), T([E(36)], S('bell'), 12)],
    [T([S('flint', 30)], E(1), 12), enchantedSale('iron_axe', 1), enchantedSale('iron_pickaxe', 2), T([E(4)], S('diamond_hoe'), 3)],
    [T([S('diamond', 1)], E(1), 12), enchantedSale('diamond_axe', 12), enchantedSale('diamond_shovel', 5)],
    [enchantedSale('diamond_pickaxe', 13)],
  ]},
  butcher: {zh: '屠夫', block: 'smoker', levels: [
    [T([S('chicken', 14)], E(1)), T([S('porkchop', 7)], E(1)), T([E(1)], S('cooked_porkchop', 5))],
    [T([S('coal', 15)], E(1)), T([E(1)], S('cooked_chicken', 8))],
    [T([S('mutton', 7)], E(1)), T([S('beef', 10)], E(1))],
    [T([S('beef', 10)], E(1)), T([E(1)], S('cooked_beef', 5))],
    [T([S('mutton', 7)], E(1)), T([E(1)], S('cooked_mutton', 5))],
  ]},
};
// what each level's trades give the villager (the game's: 1–2 at first, up to 30 for a master's)
const TRADE_XP = [2, 10, 20, 30, 30];
/** A villager's two new offers for reaching a level (0–4): picked from that level's list, things chosen now. */
export function offersFor(prof, level, seed) {
  const p = PROFESSIONS[prof], list = p?.levels[level];
  if (!list) return [];
  const r = seeded(seed), pool = [...list], out = [];
  for (let i = 0, n = Math.min(2, pool.length); i < n; i++) {
    const t = pool.splice(r.int(pool.length), 1)[0], o = typeof t === 'function' ? t(r) : t;
    out.push({...o, buy: o.buy.map(s => ({...s})), sell: {...o.sell}, uses: 0, xp: TRADE_XP[level], level});
  }
  return out;
}
/** Does what is in the two payment slots pay for an offer? */
export function pays(offer, a, b) {
  const need = [offer.buy[0], offer.buy2].filter(Boolean), have = [a, b].filter(Boolean);
  return need.every(n => have.some(h => h.id === n.id && h.n >= n.n && !h.ench && h.pot === n.pot));
}
/**
 * A trade done with a villager ({prof, xp, offers, seed}): the payment taken from the slots, the offer used once, the
 * villager's experience up, and its new offers when it reaches a level. Returns the stack bought, or null.
 */
export function trade(v, i, slots) {
  const o = v.offers[i];
  if (!o || o.uses >= o.max || !pays(o, slots[0], slots[1])) return null;
  for (const n of [o.buy[0], o.buy2].filter(Boolean)) {
    const k = slots.findIndex(h => h && h.id === n.id && h.n >= n.n);
    slots[k].n -= n.n; if (!slots[k].n) slots[k] = null;
  }
  o.uses++;
  const before = levelOf(v.xp);
  v.xp += o.xp;
  const after = levelOf(v.xp);
  for (let l = before + 1; l <= after; l++) v.offers.push(...offersFor(v.prof, l, v.seed + l * 7919));
  return {...o.sell, ...(o.sell.ench ? {ench: {...o.sell.ench}} : {})};
}
/** Back in stock: the uses of every offer start again (the game does it at the work block, twice a day). */
export const restock = v => { for (const o of v.offers) o.uses = 0; };
/** A new villager's work: offers for its first level. */
export function newWork(prof, seed) { return {prof, xp: 0, seed, offers: offersFor(prof, 0, seed)}; }
