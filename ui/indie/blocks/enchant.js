// Enchanting, the anvil and what fishing brings up, by the game's rules (Java edition): the enchantments with their
// weights, the cost ranges each level fits in, which items take them, which exclude each other; the enchanting
// table's three offers (from the bookshelves round it and the player's enchanting seed); the anvil joining, repairing
// and its prior-work penalty; the fishing loot table. Stacks carry their enchantments as ench: {name: level}.
import {itemInfo} from './blocks.js';

const kind = info => info?.tool?.kind;
const DIG = new Set(['pickaxe', 'axe', 'shovel', 'hoe']);
const armor = slot => info => !!info?.armor && (slot == null || info.armor.slot === slot);
const sword = info => kind(info) === 'sword', dig = info => DIG.has(kind(info)), bow = info => kind(info) === 'bow', rod = info => kind(info) === 'rod';
const lasting = info => !!(info?.tool?.uses || info?.armor);
/**
 * name: {zh, max, w (weight), on (the table offers it on), anvil (it can be put on with the anvil; default: on),
 * cost: [base, per level, range] (level l fits base + per·(l−1) … that + range), group (one of a group only),
 * mult: [item, book] (the anvil's cost per level), treasure (never from the table)}.
 */
export const ENCHANTS = {
  protection: {zh: '保护', max: 4, w: 10, on: armor(), cost: [1, 11, 11], group: 'protect', mult: [1, 1]},
  fire_protection: {zh: '火焰保护', max: 4, w: 5, on: armor(), cost: [10, 8, 8], group: 'protect', mult: [2, 1]},
  feather_falling: {zh: '摔落保护', max: 4, w: 5, on: armor(3), cost: [5, 6, 6], mult: [2, 1]},
  blast_protection: {zh: '爆炸保护', max: 4, w: 2, on: armor(), cost: [5, 8, 8], group: 'protect', mult: [4, 2]},
  projectile_protection: {zh: '弹射物保护', max: 4, w: 5, on: armor(), cost: [3, 6, 6], group: 'protect', mult: [2, 1]},
  respiration: {zh: '水下呼吸', max: 3, w: 2, on: armor(0), cost: [10, 10, 30], mult: [4, 2]},
  aqua_affinity: {zh: '水下速掘', max: 1, w: 2, on: armor(0), cost: [1, 0, 40], mult: [4, 2]},
  thorns: {zh: '荆棘', max: 3, w: 1, on: armor(1), anvil: armor(), cost: [10, 20, 50], mult: [8, 4]},
  sharpness: {zh: '锋利', max: 5, w: 10, on: sword, anvil: i => sword(i) || kind(i) === 'axe', cost: [1, 11, 20], group: 'damage', mult: [1, 1]},
  smite: {zh: '亡灵杀手', max: 5, w: 5, on: sword, anvil: i => sword(i) || kind(i) === 'axe', cost: [5, 8, 20], group: 'damage', mult: [2, 1]},
  bane_of_arthropods: {zh: '节肢杀手', max: 5, w: 5, on: sword, anvil: i => sword(i) || kind(i) === 'axe', cost: [5, 8, 20], group: 'damage', mult: [2, 1]},
  knockback: {zh: '击退', max: 2, w: 5, on: sword, cost: [5, 20, 50], mult: [2, 1]},
  fire_aspect: {zh: '火焰附加', max: 2, w: 2, on: sword, cost: [10, 20, 50], mult: [4, 2]},
  looting: {zh: '抢夺', max: 3, w: 2, on: sword, cost: [15, 9, 50], mult: [4, 2]},
  efficiency: {zh: '效率', max: 5, w: 10, on: dig, anvil: i => dig(i) || kind(i) === 'shears', cost: [1, 10, 50], mult: [1, 1]},
  silk_touch: {zh: '精准采集', max: 1, w: 1, on: dig, cost: [15, 0, 50], group: 'drops', mult: [8, 4]},
  fortune: {zh: '时运', max: 3, w: 2, on: dig, cost: [15, 9, 50], group: 'drops', mult: [4, 2]},
  unbreaking: {zh: '耐久', max: 3, w: 5, on: lasting, cost: [5, 8, 50], mult: [2, 1]},
  power: {zh: '力量', max: 5, w: 10, on: bow, cost: [1, 10, 15], mult: [1, 1]},
  punch: {zh: '冲击', max: 2, w: 2, on: bow, cost: [12, 20, 25], mult: [4, 2]},
  flame: {zh: '火矢', max: 1, w: 2, on: bow, cost: [20, 0, 30], mult: [4, 2]},
  infinity: {zh: '无限', max: 1, w: 1, on: bow, cost: [20, 0, 30], group: 'mend', mult: [8, 4]},
  luck_of_the_sea: {zh: '海之眷顾', max: 3, w: 2, on: rod, cost: [15, 9, 50], mult: [4, 2]},
  lure: {zh: '饵钓', max: 3, w: 2, on: rod, cost: [15, 9, 50], mult: [4, 2]},
  mending: {zh: '经验修补', max: 1, w: 2, on: lasting, cost: [25, 25, 50], group: 'mend', mult: [4, 2], treasure: true},
};
const minCost = (e, l) => e.cost[0] + e.cost[1] * (l - 1), maxCost = (e, l) => minCost(e, l) + e.cost[2];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** 锋利 III. */
export const enchName = (name, level) => `${ENCHANTS[name]?.zh || name}${ENCHANTS[name]?.max === 1 ? '' : ' ' + (ROMAN[level] || level)}`;
/** A stack's level of an enchantment (0 without). */
export const enchOf = (stack, name) => stack?.ench?.[name] || 0;
/** Two enchantments that cannot be on one item (protections, the damage ones, silk touch with fortune, infinity with mending). */
export const clash = (a, b) => a !== b && !!ENCHANTS[a]?.group && ENCHANTS[a].group === ENCHANTS[b]?.group;
const isBook = id => id === 'book' || id === 'enchanted_book';
/** Whether an enchantment can be on an item (the anvil's rule; a book takes any). */
export function canHave(id, name) {
  if (isBook(id)) return true;
  const e = ENCHANTS[name], info = itemInfo(id);
  return !!e && !!info && (e.anvil || e.on)(info);
}

/** The game's random numbers are not needed exactly; a seeded one keeps the table's offers fixed until used. */
export function seeded(seed) {
  let a = seed | 0;
  const next = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return {float: next, int: n => Math.floor(next() * n)};
}

/** The bookshelves that power a table at (x, y, z): two blocks out, on its level or one up, with air between. */
export function shelvesAround(get, x, y, z, bookshelf) {
  let n = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
    for (let dy = 0; dy <= 1; dy++) {
      const between = get(x + Math.trunc(dx / 2), y + dy, z + Math.trunc(dz / 2));
      if (!between && (get(x + dx, y + dy, z + dz) & 0xFFF) === bookshelf) n++;
    }
  }
  return Math.min(15, n);
}

/** The enchantments a stack could get at a (modified) level: for each, the highest level whose range holds it. */
function available(id, level, treasure) {
  const info = itemInfo(id), out = [];
  for (const [name, e] of Object.entries(ENCHANTS)) {
    if (e.treasure && !treasure) continue;
    if (!isBook(id) && !e.on(info)) continue;
    for (let l = e.max; l >= 1; l--) if (level >= minCost(e, l) && level <= maxCost(e, l)) { out.push([name, l]); break; }
  }
  return out;
}
const pickWeighted = (list, r) => {
  const total = list.reduce((s, [n]) => s + ENCHANTS[n].w, 0);
  let k = r.int(total);
  for (const it of list) { k -= ENCHANTS[it[0]].w; if (k < 0) return it; }
  return list.at(-1);
};
/** The enchantments an item gets for `level` (the game's selection): [[name, level], …]. */
export function chooseEnchants(id, level, r, treasure = false) {
  const info = itemInfo(id), e = info?.enchantability || 0;
  if (!e) return [];
  level += 1 + r.int(Math.floor(e / 4) + 1) + r.int(Math.floor(e / 4) + 1);
  level = Math.max(1, Math.round(level + level * (r.float() + r.float() - 1) * 0.15));
  let list = available(id, level, treasure);
  const out = [];
  if (!list.length) return out;
  out.push(pickWeighted(list, r));
  while (r.int(50) <= level) {
    const last = out.at(-1)[0];
    list = list.filter(([n]) => n !== last && !clash(n, last));
    if (!list.length) break;
    out.push(pickWeighted(list, r));
    level = Math.floor(level / 2);
  }
  // a book keeps all but one of several
  if (isBook(id) && out.length > 1) out.splice(r.int(out.length), 1);
  return out;
}
/**
 * The table's three offers for a stack: [{level, list}] (level 0: none). The levels come from the bookshelves and
 * the seed (the game's: a base of 1–8 plus half the shelves plus 0–shelves; then a third, two thirds plus one, and at
 * least twice the shelves); each offer's enchantments from the seed and its place.
 */
export function tableOffers(id, shelves, seed) {
  const info = itemInfo(id);
  if (!info?.enchantability || itemInfo(id)?.name === 'enchanted_book') return [0, 1, 2].map(() => ({level: 0, list: []}));
  const r = seeded(seed), b = Math.min(15, shelves);
  return [0, 1, 2].map(slot => {
    const base = r.int(8) + 1 + (b >> 1) + r.int(b + 1);
    let level = slot === 0 ? Math.max(Math.floor(base / 3), 1) : slot === 1 ? Math.floor(base * 2 / 3) + 1 : Math.max(base, b * 2);
    if (level < slot + 1) level = 0;
    return {level, list: level ? chooseEnchants(id, level, seeded(seed + slot)) : []};
  });
}
/** The stack enchanted (a book becomes an enchanted book). */
export function enchanted(stack, list) {
  const ench = {...(stack.ench || {})};
  for (const [n, l] of list) ench[n] = Math.max(ench[n] || 0, l);
  return {...stack, n: 1, id: stack.id === 'book' ? 'enchanted_book' : stack.id, ench};
}

// ---------- the anvil ----------
const usesOf = info => info?.tool?.uses || info?.armor?.uses || 0;
const repairs = (info, id) => info?.repair && (info.repair === id || (info.repair === '#planks' && /_planks$/.test(id)) || (info.repair === '#stone_tool' && ['cobblestone', 'cobbled_deepslate'].includes(id)));
/**
 * What the anvil makes of left and right: {out, cost (levels), use (how many of right it takes), tooMuch} or null.
 * Repairing with the material: each one mends a quarter, a level each. Two of the same: their uses added (and 12%
 * more), their enchantments joined (equal levels go one up; one that clashes costs a level and is left out). A book
 * adds its enchantments. The prior work of both is added to the cost, and doubles (plus one) on the result.
 */
export function anvilResult(left, right) {
  if (!left || !right || left.id === 'book') return null;
  const info = itemInfo(left.id), uses = usesOf(info), rinfo = itemInfo(right.id);
  let cost = 0, use = 1;
  const out = {...left, n: 1, ench: {...(left.ench || {})}};
  if (uses && repairs(info, right.id)) {
    if (!left.dmg) return null;
    let dmg = left.dmg, k = 0;
    while (dmg > 0 && k < right.n) { dmg = Math.max(0, dmg - Math.floor(uses / 4)); k++; }
    out.dmg = dmg; cost += k; use = k;
  } else {
    const book = right.id === 'enchanted_book';
    if (!book && right.id !== left.id) return null;
    if (!book && uses && (left.dmg || right.dmg)) {
      const kept = (uses - (left.dmg || 0)) + (uses - (right.dmg || 0)) + Math.floor(uses * 12 / 100);
      out.dmg = Math.max(0, uses - kept); cost += 2;
    }
    let took = false;
    for (const [name, lr] of Object.entries(right.ench || {})) {
      const e = ENCHANTS[name];
      if (!e) continue;
      const ll = out.ench[name] || 0;
      if (!canHave(left.id, name) || Object.keys(out.ench).some(n => clash(n, name))) { cost += 1; continue; }
      const level = Math.min(e.max, ll === lr ? lr + 1 : Math.max(ll, lr));
      out.ench[name] = level; took = true;
      cost += e.mult[book ? 1 : 0] * level;
    }
    if (!took && !(out.dmg < (left.dmg || 0))) return null;
  }
  if (!Object.keys(out.ench).length) delete out.ench;
  if (!out.dmg) delete out.dmg;
  if (cost <= 0) return null;
  const prior = (left.rep || 0) + (right.rep || 0);
  out.rep = Math.max(left.rep || 0, right.rep || 0) * 2 + 1;
  const total = cost + prior;
  return {out, cost: total, use, tooMuch: total >= 40};
}

// ---------- fishing ----------
const FISH = [['cod', 60], ['salmon', 25], ['tropical_fish', 2], ['pufferfish', 13]];
const JUNK = [['leather_boots', 10], ['leather', 10], ['bone', 10], ['string', 5], ['fishing_rod', 2], ['bowl', 10], ['stick', 5], ['rotten_flesh', 10], ['ink_sac', 1]];
const TREASURE = [['bow', 1], ['fishing_rod', 1], ['enchanted_book', 1], ['nautilus_shell', 1]];
const weighted = (list, r) => { const total = list.reduce((s, x) => s + x[1], 0); let k = r.float() * total; for (const x of list) { k -= x[1]; if (k < 0) return x[0]; } return list.at(-1)[0]; };
/** One catch: {stack, xp}. luck: 海之眷顾's level (fish 85 − luck, junk 10 − 2·luck, treasure 5 + 2·luck). */
export function fishLoot(luck = 0, r = seeded(Math.floor(Math.random() * 2 ** 31))) {
  const what = weighted([['fish', 85 - luck], ['junk', Math.max(0, 10 - luck * 2)], ['treasure', 5 + luck * 2]], r), xp = 1 + r.int(6);
  if (what === 'fish') return {stack: {id: weighted(FISH, r), n: 1}, xp};
  if (what === 'junk') {
    const id = weighted(JUNK, r), info = itemInfo(id), uses = usesOf(info);
    return {stack: {id, n: id === 'ink_sac' ? 10 : 1, ...(uses ? {dmg: Math.floor(uses * r.float() * 0.9)} : {})}, xp};
  }
  // treasure: enchanted as at a table of level 30 (a book may get the treasure ones, like 经验修补)
  const id = weighted(TREASURE, r), base = id === 'enchanted_book' ? 'book' : id, uses = usesOf(itemInfo(id));
  if (id === 'nautilus_shell') return {stack: {id, n: 1}, xp};
  const stack = enchanted({id: base, n: 1, ...(uses ? {dmg: Math.floor(uses * r.float() * 0.25)} : {})}, chooseEnchants(base, 30, r, true));
  if (!stack.dmg) delete stack.dmg;
  return {stack, xp};
}

// ---------- protection ----------
/**
 * How much the worn enchantments take off a hit of a kind ('fall', 'fire', 'lava', 'explosion', 'arrow', …): the
 * game's protection points (protection 1 a level, the special ones 2, feather falling 3), at most 20, each 4%.
 */
export function protectionFactor(worn, kind) {
  if (kind === 'void' || kind === 'starve') return 1;
  let epf = 0;
  for (const s of worn) {
    if (!s?.ench) continue;
    epf += enchOf(s, 'protection');
    if (kind === 'fire' || kind === 'lava') epf += 2 * enchOf(s, 'fire_protection');
    if (kind === 'explosion') epf += 2 * enchOf(s, 'blast_protection');
    if (kind === 'arrow') epf += 2 * enchOf(s, 'projectile_protection');
    if (kind === 'fall') epf += 3 * enchOf(s, 'feather_falling');
  }
  return 1 - Math.min(20, epf) / 25;
}
/** Unbreaking: whether this use wears the item (tools: 1 in level+1; armour: 60% always, and 40% of that). */
export function wears(stack, r = Math.random, armorPiece = false) {
  const l = enchOf(stack, 'unbreaking');
  if (!l) return true;
  return armorPiece ? r() < 0.6 + 0.4 / (l + 1) : r() < 1 / (l + 1);
}
