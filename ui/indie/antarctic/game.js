// 南极结界 · 农场的规则: the clock and calendar, the farm's tiles (tilled, watered, what grows on them), the bag (a row
// of slots, the first ten in hand), what lies about the farm (weeds, twigs, stones, stumps, young trees, things to
// forage, things one has made and set down), what each tool does, what can be made. No drawing here; play.js shows it.
// Saved in the browser as it changes.
export const SEASONS = ['春', '夏', '秋', '冬'], WEEK = ['一', '二', '三', '四', '五', '六', '日'], DAYS_PER_SEASON = 28;
export const DAY_START = 6 * 60, DAY_END = 26 * 60; // 6:00 to 2:00 the next morning
export const MINUTES_PER_SECOND = 1.4;

// days: how long each stage lasts (seed → sprout → young → ripe), watered days only
// price: what one brings at the bin; cost: a seed from 中央市集 by post; seasons: when it grows (0 春 … 3 冬) — out of
// season it withers overnight when the season turns
export const CROPS = {
  turnip: {name: '结界萝卜', seed: '结界萝卜种子', days: [1, 1, 2], price: 35, cost: 20, art: 0, seasons: [0, 2], color: '#c46bb0'},
  berry: {name: '草莓', seed: '草莓苗', days: [1, 2, 3], price: 60, cost: 40, art: 1, seasons: [0, 1], color: '#e2404f'},
  herb: {name: '星光香草', seed: '星光香草种子', days: [1, 2, 2], price: 45, cost: 28, art: 2, seasons: [1, 2], color: '#9a7de8'},
  cabbage: {name: '冬白菜', seed: '冬白菜种子', days: [1, 2, 2], price: 50, cost: 30, art: 3, seasons: [3], color: '#b9dc9a'},
};

// ── things one can carry ──
// type: tool | seed | crop | forage | material | place (made, and set down on the farm); price: at the bin (0: not sold)
export const ITEMS = {
  hoe: {name: '锄头', type: 'tool', note: '翻土；点一下翻过的空地会把土填回去'},
  can: {name: '水壶', type: 'tool', note: '浇水；对着水边能装满'},
  axe: {name: '斧头', type: 'tool', note: '砍树枝、树桩和树'},
  pick: {name: '镐', type: 'tool', note: '敲碎石头，捡回摆下的东西'},
  wood: {name: '木头', type: 'material', price: 2},
  stone: {name: '石头', type: 'material', price: 2},
  fiber: {name: '纤维', type: 'material', price: 1},
  cone: {name: '松果', type: 'seed', price: 5, note: '种在草地上，几天后长成小松树'},
  leek: {name: '野葱', type: 'forage', price: 40, seasons: [0]},
  dandelion: {name: '蒲公英', type: 'forage', price: 25, seasons: [0]},
  raspberry: {name: '树莓', type: 'forage', price: 30, seasons: [1]},
  bellflower: {name: '风铃草', type: 'forage', price: 35, seasons: [1]},
  mushroom: {name: '雪松菇', type: 'forage', price: 45, seasons: [2]},
  hazelnut: {name: '榛子', type: 'forage', price: 35, seasons: [2]},
  iceroot: {name: '冰根', type: 'forage', price: 50, seasons: [3]},
  frostfruit: {name: '霜晶果', type: 'forage', price: 60, seasons: [3]},
  shell: {name: '贝壳', type: 'forage', price: 20, beach: true},
  seaglass: {name: '海玻璃', type: 'forage', price: 35, beach: true},
  chest: {name: '木箱', type: 'place', recipe: {wood: 30}, note: '能放 24 格东西'},
  sprinkler: {name: '洒水器', type: 'place', recipe: {stone: 20, wood: 10}, note: '每天早上给上下左右四格浇水'},
  path: {name: '石板路', type: 'place', recipe: {stone: 1}, note: '铺在地上，好看'},
  fence: {name: '木栅栏', type: 'place', recipe: {wood: 2}, note: '会和旁边的栅栏连起来'},
  campfire: {name: '篝火', type: 'place', recipe: {stone: 10, wood: 10, fiber: 10}, note: '入夜后点亮，照亮周围'},
};
for (const [k, c] of Object.entries(CROPS)) { ITEMS['seed:' + k] = {name: c.seed, type: 'seed', crop: k, price: Math.round(c.cost / 2)}; ITEMS[k] = {name: c.name, type: 'crop', price: c.price}; }
export const RECIPES = ['chest', 'sprinkler', 'path', 'fence', 'campfire'];
export const BAG = 30, HAND = 10, STACK = 999, CHEST = 24;

// ── what lies on the farm: hp (hits it takes), which tool, what it gives; block: one cannot walk through it ──
export const THINGS = {
  weed: {name: '杂草', hp: 1, tool: 'any', drops: [['fiber', 1, 1, .8]], block: true},
  twig: {name: '树枝', hp: 1, tool: 'axe', drops: [['wood', 1, 2]], block: true},
  pebble: {name: '石块', hp: 1, tool: 'pick', drops: [['stone', 1, 2]], block: true},
  rock: {name: '大石头', hp: 3, tool: 'pick', drops: [['stone', 3, 5]], block: true},
  stump: {name: '树桩', hp: 4, tool: 'axe', drops: [['wood', 5, 7]], block: true},
  tree: {name: '松树', hp: 6, tool: 'axe', drops: [['wood', 8, 12], ['cone', 0, 2]], block: true},
  chest: {place: true, block: true}, sprinkler: {place: true, block: true}, fence: {place: true, block: true}, campfire: {place: true, block: true}, path: {place: true},
};
const isForage = id => ITEMS[id]?.type === 'forage';
export const blocks = th => !!THINGS[th.id]?.block && !(th.id === 'tree' && th.stage < 2);

const KEY = 'antarctic-farm-v1', CAN = 24;
const emptyBag = () => Array(BAG).fill(null);
export function newGame(field) {
  const tiles = {};
  for (let ty = field.y0; ty < field.y1; ty++) for (let tx = field.x0; tx < field.x1; tx++) tiles[tx + ',' + ty] = {tilled: true, wet: false, field: true};
  // a start: a few rows already sown the day before
  for (let tx = field.x0; tx < field.x0 + 6; tx++) for (const [ty, kind] of [[field.y0, 'turnip'], [field.y0 + 1, 'berry']]) if (tiles[tx + ',' + ty]) tiles[tx + ',' + ty].crop = {kind, stage: 1, grow: 0};
  const inv = emptyBag();
  [['hoe', 1], ['can', 1], ['axe', 1], ['pick', 1], ['seed:turnip', 12], ['seed:berry', 6]].forEach(([id, n], i) => { inv[i] = {id, n}; });
  return {day: 1, minutes: DAY_START, money: 200, shipped: {}, income: 0, tiles, things: null, inv, water: CAN, selected: 0, version: 2};
}
export function load(field) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.version === 2) return s;
    if (s?.version === 1) { // the old bag (tools in a fixed row, seeds and harvest counted apart) becomes slots
      const inv = emptyBag(), put = [['hoe', 1], ['can', 1], ['axe', 1], ['pick', 1], ...Object.entries(s.seeds || {}).filter(([, n]) => n).map(([k, n]) => ['seed:' + k, n]), ...Object.entries(s.bag || {}).filter(([, n]) => n)];
      put.forEach(([id, n], i) => { if (i < BAG) inv[i] = {id, n}; });
      const shipped = s.shipped || {};
      Object.assign(s, {inv, selected: 0, things: null, shipped, version: 2}); delete s.seeds; delete s.bag;
      return s;
    }
  } catch { /* a fresh game */ }
  return newGame(field);
}
export function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be off */ } }

export const seasonOf = s => Math.floor((s.day - 1) / DAYS_PER_SEASON) % 4;
export const inSeason = (kind, season) => CROPS[kind].seasons.includes(season);
export function dateText(s) {
  const season = SEASONS[Math.floor((s.day - 1) / DAYS_PER_SEASON) % 4], d = (s.day - 1) % DAYS_PER_SEASON + 1, w = WEEK[(s.day - 1) % 7];
  return `${season} · 第${d}天 · 周${w}`;
}
export function clockText(s) { const m = Math.floor(s.minutes) % (24 * 60), h = Math.floor(m / 60), mm = Math.floor(m % 60 / 10) * 10; return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
export const hourOf = s => s.minutes / 60;

// ── the bag ──
export const held = s => s.inv[s.selected] || null;
export const count = (s, id) => s.inv.reduce((n, it) => n + (it?.id === id ? it.n : 0), 0);
const stackable = id => ITEMS[id]?.type !== 'tool';
/** Puts n of an item in the bag (onto its stacks first, then empty slots); returns how many did not fit. */
export function add(s, id, n = 1, slots = s.inv) {
  if (stackable(id)) for (const it of slots) if (it?.id === id && n > 0) { const k = Math.min(n, STACK - it.n); it.n += k; n -= k; }
  for (let i = 0; i < slots.length && n > 0; i++) if (!slots[i]) { const k = stackable(id) ? Math.min(n, STACK) : 1; slots[i] = {id, n: k}; n -= k; }
  return n;
}
/** Takes n of an item from anywhere in the bag; false (and nothing taken) if there are not enough. */
export function take(s, id, n = 1) {
  if (count(s, id) < n) return false;
  for (let i = s.inv.length - 1; i >= 0 && n > 0; i--) { const it = s.inv[i]; if (it?.id !== id) continue; const k = Math.min(n, it.n); it.n -= k; n -= k; if (!it.n) s.inv[i] = null; }
  return true;
}
const useOne = s => { const it = held(s); it.n--; if (!it.n) s.inv[s.selected] = null; };
/** Moving stacks between two slot lists (the bag, a chest): onto the same item, or swapping. */
export function moveSlot(from, i, to, j) {
  const a = from[i], b = to[j]; if (!a) return;
  if (b && b.id === a.id && stackable(a.id)) { const k = Math.min(a.n, STACK - b.n); b.n += k; a.n -= k; if (!a.n) from[i] = null; return; }
  from[i] = b; to[j] = a;
}
/** A whole stack from one list into the other (first onto the same item, then an empty slot). */
export function sendStack(from, i, to) {
  const a = from[i]; if (!a) return false;
  const left = add(null, a.id, a.n, to); if (left === a.n) return false;
  if (left) a.n = left; else from[i] = null; return true;
}

// ── a night's sleep: what was watered grows a day, the soil dries, the farm grows back a little, the clock goes back to morning ──
export function sleep(s, spots = null) {
  // the pet: a full bowl and being petted that day count toward its love; both start over in the morning
  if (s.pet) { if (s.pet.bowl) s.pet.love = Math.min(PET_LOVE_MAX, s.pet.love + 6); s.pet.bowl = false; s.pet.petted = false; }
  for (const t of Object.values(s.tiles)) {
    if (t.crop && !t.crop.dead && t.wet && t.crop.stage < 3) {
      t.crop.grow++;
      if (t.crop.grow >= CROPS[t.crop.kind].days[t.crop.stage]) { t.crop.stage++; t.crop.grow = 0; }
    }
    t.wet = false;
  }
  for (const [key, th] of Object.entries(s.things || {})) {
    if (th.id === 'tree' && th.stage < 3 && ++th.age >= 2) { th.stage++; th.age = 0; } // a pine grows a stage every two days
    if (isForage(th.id) && ++th.age > 3) delete s.things[key];                              // forage left lying goes
  }
  // what was put in the bin is sold overnight
  s.income = Object.entries(s.shipped || {}).reduce((sum, [k, n]) => sum + (ITEMS[k]?.price || 0) * n, 0);
  s.money += s.income; s.shipped = {};
  const before = seasonOf(s);
  s.day++; s.minutes = DAY_START;
  // a new season: what does not grow in it withers (cleared by hand, like a weed)
  s.withered = 0;
  if (seasonOf(s) !== before) for (const t of Object.values(s.tiles)) if (t.crop && !t.crop.dead && !inSeason(t.crop.kind, seasonOf(s))) { t.crop.dead = true; s.withered++; }
  // sprinklers water round them for the new day
  for (const [key, th] of Object.entries(s.things || {})) if (th.id === 'sprinkler') { const [x, y] = key.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = s.tiles[(x + dx) + ',' + (y + dy)]; if (t?.tilled) t.wet = true; } }
  if (spots) grow(s, spots);
}
/**
 * The farm fills in by itself: weeds, twigs and stones on free grass, what the season puts out to forage, shells on the
 * sand. spots: {grass: ['x,y'…], sand: […]} worked out by play.js from the map. First time: a farm left to itself.
 */
export function populate(s, spots) {
  s.things = {};
  for (let k = 0; k < 110; k++) spawnDebris(s, spots);
  for (let k = 0; k < 14; k++) { const key = freeSpot(s, spots.grass); if (key) s.things[key] = {id: 'tree', stage: 3, age: 0, hp: THINGS.tree.hp}; }
  for (let k = 0; k < 4; k++) spawnForage(s, spots);
}
function grow(s, spots) {
  const debris = Object.values(s.things).filter(th => ['weed', 'twig', 'pebble', 'rock', 'stump'].includes(th.id)).length;
  for (let k = 0; k < 6 && debris + k < 150; k++) spawnDebris(s, spots);
  for (let k = 0; k < 3; k++) spawnForage(s, spots);
}
const pickOne = list => list[Math.floor(Math.random() * list.length)];
function freeSpot(s, list) {
  for (let k = 0; k < 20; k++) { const key = pickOne(list); if (key && !s.things[key] && !s.tiles[key]) return key; }
  return null;
}
function spawnDebris(s, spots) {
  const key = freeSpot(s, spots.grass); if (!key) return;
  const r = Math.random(), id = r < .48 ? 'weed' : r < .7 ? 'twig' : r < .9 ? 'pebble' : r < .96 ? 'rock' : 'stump';
  s.things[key] = {id, hp: THINGS[id].hp};
}
function spawnForage(s, spots) {
  const season = seasonOf(s), land = Object.keys(ITEMS).filter(id => isForage(id) && ITEMS[id].seasons?.includes(season)), sea = Object.keys(ITEMS).filter(id => ITEMS[id].beach);
  const key = freeSpot(s, spots.grass); if (key) s.things[key] = {id: pickOne(land), age: 0};
  const shore = freeSpot(s, spots.sand); if (shore && Math.random() < .7) s.things[shore] = {id: pickOne(sea), age: 0};
}

// ── the pet ──
export const PET_LOVE_MAX = 1000;
/** Petting: once a day it counts (and shows); after that it is only glad of it. */
export function petPet(s) {
  const p = s.pet; if (!p) return {say: ''};
  if (p.petted) return {say: p.name + '蹭了蹭你的手。'};
  p.petted = true; p.love = Math.min(PET_LOVE_MAX, p.love + 15);
  return {done: true, effect: 'heart', say: '摸了摸' + p.name + '，它看起来很开心。'};
}
/** The water bowl by the house, filled from the watering can. */
export function fillBowl(s) {
  const p = s.pet; if (!p) return {say: ''};
  if (p.bowl) return {say: '水碗里还有水。'};
  if (s.water <= 0) return {say: '水壶空了，去水边打水'};
  s.water--; p.bowl = true; return {done: true, effect: 'water', say: '给' + p.name + '的水碗倒满了水。'};
}
export const hearts = p => Math.floor((p?.love || 0) / (PET_LOVE_MAX / 5) * 2) / 2; // 0–5 in halves

// ── selling and buying ──
const sellable = id => (ITEMS[id]?.price || 0) > 0 && ITEMS[id].type !== 'tool';
const harvestLike = id => ['crop', 'forage'].includes(ITEMS[id]?.type);
/**
 * The shipping bin: what is in hand goes in; with a tool in hand, everything harvested or foraged in the bag does.
 * Sold overnight.
 */
export function ship(s) {
  s.shipped ??= {};
  const it = held(s), list = it && sellable(it.id) ? [s.selected] : s.inv.map((x, i) => x && harvestLike(x.id) ? i : -1).filter(i => i >= 0);
  if (!list.length) return {say: it ? ITEMS[it.id].name + '不能卖' : '包里没有可以出货的东西'};
  const put = list.map(i => { const x = s.inv[i]; s.shipped[x.id] = (s.shipped[x.id] || 0) + x.n; s.inv[i] = null; return x; });
  const worth = put.reduce((sum, x) => sum + ITEMS[x.id].price * x.n, 0);
  return {done: true, effect: 'harvest', say: '放进出货箱：' + put.map(x => ITEMS[x.id].name + ' ×' + x.n).join('、') + '（明早结算 ' + worth + ' 代币）'};
}
/** Buying seeds by post from 中央市集. */
export function buy(s, kind, n = 1) {
  const cost = CROPS[kind].cost * n;
  if (s.money < cost) return {say: '代币不够'};
  if (add(s, 'seed:' + kind, n) === n) return {say: '背包满了'};
  s.money -= cost;
  return {done: true, say: '买了 ' + CROPS[kind].seed + ' ×' + n};
}
/** Making something from what one carries. */
export function craft(s, id) {
  const r = ITEMS[id]?.recipe; if (!r) return {say: ''};
  const lack = Object.entries(r).filter(([k, n]) => count(s, k) < n);
  if (lack.length) return {say: '还差 ' + lack.map(([k, n]) => ITEMS[k].name + ' ×' + (n - count(s, k))).join('、')};
  for (const [k, n] of Object.entries(r)) take(s, k, n);
  if (add(s, id, 1)) { for (const [k, n] of Object.entries(r)) add(s, k, n); return {say: '背包满了'}; }
  return {done: true, say: '做好了：' + ITEMS[id].name};
}

// ── using what is in hand on a tile ──
const roll = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
/** Gives what a thing drops; returns words for it ('' if nothing). */
/** What a thing gives when it breaks: [{id, n}] — they fall on the ground and are picked up by walking near. */
function drop(list) {
  const out = [];
  for (const [id, a, b, chance = 1] of list) { if (Math.random() > chance) continue; const n = roll(a, b); if (n) out.push({id, n}); }
  return out;
}
/** Hitting a thing on the farm with what is in hand. */
function hit(s, key, th, tool) {
  const def = THINGS[th.id] || {};
  if (isForage(th.id)) { if (add(s, th.id, 1)) return {say: '背包满了'}; delete s.things[key]; return {done: true, effect: 'harvest', say: '', got: th.id}; }
  if (def.place) {
    if (tool !== 'pick' && tool !== 'axe') return {say: ITEMS[th.id].name + '（用镐或斧头收回来）'};
    if (th.id === 'chest' && th.items?.some(Boolean)) return {say: '箱子里还有东西'};
    if (th.id === 'chest') for (const it of th.items || []) if (it) return {say: '箱子里还有东西'};
    delete s.things[key]; return {done: true, effect: 'mine', say: '', drops: [{id: th.id, n: 1}], changed: true};
  }
  if (th.id === 'tree' && th.stage < 3) { delete s.things[key]; return {done: true, effect: 'dig', say: th.stage ? '拔掉了小树苗' : '', changed: true}; }
  if (def.tool !== 'any' && def.tool !== tool) return {say: def.name + '要用' + ITEMS[def.tool].name};
  th.hp = (th.hp ?? def.hp) - 1;
  const effect = tool === 'pick' ? 'mine' : tool === 'axe' ? 'chop' : 'dig';
  if (th.hp > 0) return {done: true, effect, hitOnly: true};
  if (th.id === 'tree') { s.things[key] = {id: 'stump', hp: THINGS.stump.hp}; return {done: true, effect, say: '', drops: drop(def.drops), fell: true, changed: true}; }
  delete s.things[key];
  return {done: true, effect, say: '', drops: drop(def.drops), changed: true};
}
/**
 * Using what is in hand on a tile. ctx: {tile(tx, ty) → 'grass' | 'field' | 'water' | 'sand' | other, free(tx, ty)}.
 * Returns {done, say, effect, changed} — effect is what play.js shows: 'dig', 'water', 'sow', 'harvest', 'fill', 'chop',
 * 'mine', 'place'; changed: something that blocks the way came or went.
 */
export function act(s, tx, ty, ctx) {
  const it = held(s), item = it ? ITEMS[it.id] : null, key = tx + ',' + ty, t = s.tiles[key], th = s.things?.[key], ground = ctx.tile(tx, ty);
  // whatever is in hand: ripe crops are picked, dead ones cleared, forage taken
  if (t?.crop?.dead) { t.crop = null; return {done: true, effect: 'dig', say: '清掉了枯掉的作物'}; }
  if (t?.crop?.stage === 3) { const kind = t.crop.kind; if (add(s, kind, 1)) return {say: '背包满了'}; t.crop = null; return {done: true, effect: 'harvest', say: '', got: kind}; }
  if (th && isForage(th.id)) return hit(s, key, th, null);
  const tool = item?.type === 'tool' ? it.id : null;
  if (th && it?.id !== 'can') return hit(s, key, th, tool);
  if (tool === 'hoe') {
    if (t?.tilled) {
      if (t.crop) return {say: CROPS[t.crop.kind].name + (t.wet ? '，今天浇过水了' : '，还没浇水')};
      if (t.field) return {say: '这是田地，已经翻好了'};
      delete s.tiles[key]; return {done: true, effect: 'dig', say: '把土填回去了'};
    }
    if (ground !== 'grass' || !ctx.free(tx, ty)) return {say: '这里翻不了'};
    s.tiles[key] = {tilled: true, wet: false}; return {done: true, effect: 'dig'};
  }
  if (tool === 'can') {
    if (ground === 'water') { s.water = CAN; return {done: true, effect: 'fill', say: '水壶装满了'}; }
    if (s.water <= 0) return {say: '水壶空了，去水边打水'};
    if (!t?.tilled) return {say: '浇在翻过的土上'};
    s.water--; t.wet = true; return {done: true, effect: 'water'};
  }
  if (tool === 'pick' && t?.tilled && !t.crop && !t.field) { delete s.tiles[key]; return {done: true, effect: 'dig', say: '把土填回去了'}; }
  if (tool) return {say: t?.crop ? CROPS[t.crop.kind].name + (t.wet ? '，今天浇过水了' : '，还没浇水') : ''};
  if (item?.type === 'seed' && item.crop) {
    if (!t?.tilled) return {say: '先用锄头翻土'};
    if (t.crop) return {say: '这里已经种了'};
    if (!inSeason(item.crop, seasonOf(s))) return {say: CROPS[item.crop].name + '只在' + CROPS[item.crop].seasons.map(k => SEASONS[k]).join('、') + '天长'};
    useOne(s); t.crop = {kind: item.crop, stage: 0, grow: 0}; return {done: true, effect: 'sow'};
  }
  if (it?.id === 'cone') {
    if (ground !== 'grass' || t || !ctx.free(tx, ty)) return {say: '松果要种在空草地上'};
    useOne(s); s.things[key] = {id: 'tree', stage: 0, age: 0, hp: THINGS.tree.hp}; return {done: true, effect: 'sow', say: '种下了一颗松果', changed: true};
  }
  if (item?.type === 'place') {
    if (!['grass', 'field', 'sand'].includes(ground) || (t && (t.crop || !t.field)) || !ctx.free(tx, ty)) return {say: '这里放不了'};
    if (it.id !== 'path' && ground === 'field' && t?.crop) return {say: '这里放不了'};
    useOne(s); s.things[key] = {id: it.id, ...(it.id === 'chest' ? {items: Array(CHEST).fill(null)} : {})};
    return {done: true, effect: 'place', say: '', changed: true, placed: it.id};
  }
  if (t?.crop) return {say: CROPS[t.crop.kind].name + (t.wet ? '，今天浇过水了' : '，还没浇水')};
  return {say: ''};
}
export const canSize = CAN;
