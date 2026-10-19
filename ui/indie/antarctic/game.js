// 南极结界 · 农场的规则: the clock and calendar, the farm's tiles (tilled, watered, what grows on them), the bag, and
// what each tool does. No drawing here; play.js shows it. Saved in the browser as it changes.
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
export const TOOLS = [
  {id: 'hoe', name: '锄头'}, {id: 'can', name: '水壶'},
  {id: 'seed', crop: 'turnip', name: CROPS.turnip.seed}, {id: 'seed', crop: 'berry', name: CROPS.berry.seed}, {id: 'seed', crop: 'herb', name: CROPS.herb.seed}, {id: 'seed', crop: 'cabbage', name: CROPS.cabbage.seed},
  {id: 'hand', name: '手'},
];
const KEY = 'antarctic-farm-v1', CAN = 24;

export function newGame(field) {
  const tiles = {};
  for (let ty = field.y0; ty < field.y1; ty++) for (let tx = field.x0; tx < field.x1; tx++) tiles[tx + ',' + ty] = {tilled: true, wet: false, field: true};
  // a start: a few rows already sown the day before
  for (let tx = field.x0; tx < field.x0 + 6; tx++) for (const [ty, kind] of [[field.y0, 'turnip'], [field.y0 + 1, 'berry']]) if (tiles[tx + ',' + ty]) tiles[tx + ',' + ty].crop = {kind, stage: 1, grow: 0};
  return {day: 1, minutes: DAY_START, money: 200, shipped: {}, income: 0, tiles, seeds: {turnip: 12, berry: 6, herb: 8, cabbage: 0}, bag: {turnip: 0, berry: 0, herb: 0, cabbage: 0}, water: CAN, selected: 0, version: 1};
}
export function load(field) {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.version === 1) return s; } catch { /* a fresh game */ }
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

/** A night's sleep: what was watered grows a day, the soil dries, the clock goes back to morning. */
export function sleep(s) {
  for (const t of Object.values(s.tiles)) {
    if (t.crop && !t.crop.dead && t.wet && t.crop.stage < 3) {
      t.crop.grow++;
      if (t.crop.grow >= CROPS[t.crop.kind].days[t.crop.stage]) { t.crop.stage++; t.crop.grow = 0; }
    }
    t.wet = false;
  }
  // what was put in the bin is sold overnight
  s.income = Object.entries(s.shipped || {}).reduce((sum, [k, n]) => sum + CROPS[k].price * n, 0);
  s.money += s.income; s.shipped = {};
  const before = seasonOf(s);
  s.day++; s.minutes = DAY_START;
  // a new season: what does not grow in it withers (cleared by hand, like a weed)
  s.withered = 0;
  if (seasonOf(s) !== before) for (const t of Object.values(s.tiles)) if (t.crop && !t.crop.dead && !inSeason(t.crop.kind, seasonOf(s))) { t.crop.dead = true; s.withered++; }
}
/** Everything in the bag goes into the shipping bin. */
export function ship(s) {
  s.shipped ??= {};
  const put = Object.entries(s.bag).filter(([, n]) => n);
  if (!put.length) return {say: '包里没有可以出货的东西'};
  for (const [k, n] of put) { s.shipped[k] = (s.shipped[k] || 0) + n; s.bag[k] = 0; }
  const worth = put.reduce((sum, [k, n]) => sum + CROPS[k].price * n, 0);
  return {done: true, effect: 'harvest', say: '放进出货箱：' + put.map(([k, n]) => CROPS[k].name + ' ×' + n).join('、') + '（明早结算 ' + worth + ' 代币）'};
}
/** Buying seeds by post from 中央市集. */
export function buy(s, kind, n = 1) {
  const cost = CROPS[kind].cost * n;
  if (s.money < cost) return {say: '代币不够'};
  s.money -= cost; s.seeds[kind] = (s.seeds[kind] || 0) + n;
  return {done: true, say: '买了 ' + CROPS[kind].seed + ' ×' + n};
}

/**
 * Using the selected tool on a tile. ctx: {tile(tx, ty) → 'grass' | 'field' | 'water' | other, free(tx, ty)}.
 * Returns {done, say, effect} — effect is what play.js shows: 'dig', 'water', 'sow', 'harvest', 'fill'.
 */
export function act(s, tx, ty, ctx) {
  const tool = TOOLS[s.selected], key = tx + ',' + ty, t = s.tiles[key], ground = ctx.tile(tx, ty);
  if (tool.id === 'hoe') {
    if (t?.tilled) return {say: t.crop ? '这里种着东西' : '已经翻过了'};
    if (ground !== 'grass' || !ctx.free(tx, ty)) return {say: '这里翻不了'};
    s.tiles[key] = {tilled: true, wet: false}; return {done: true, effect: 'dig'};
  }
  if (tool.id === 'can') {
    if (ground === 'water') { s.water = CAN; return {done: true, effect: 'fill', say: '水壶装满了'}; }
    if (s.water <= 0) return {say: '水壶空了，去水边打水'};
    if (!t?.tilled) return {say: '浇在翻过的土上'};
    s.water--; t.wet = true; return {done: true, effect: 'water'};
  }
  if (tool.id === 'seed') {
    if (!t?.tilled) return {say: '先用锄头翻土'};
    if (t.crop) return {say: '这里已经种了'};
    if (!s.seeds[tool.crop]) return {say: '没有' + tool.name + '了'};
    if (!inSeason(tool.crop, seasonOf(s))) return {say: CROPS[tool.crop].name + '只在' + CROPS[tool.crop].seasons.map(k => SEASONS[k]).join('、') + '天长'};
    s.seeds[tool.crop]--; t.crop = {kind: tool.crop, stage: 0, grow: 0}; return {done: true, effect: 'sow'};
  }
  if (tool.id === 'hand') {
    if (t?.crop?.dead) { t.crop = null; return {done: true, effect: 'dig', say: '清掉了枯掉的作物'}; }
    if (t?.crop?.stage === 3) { const kind = t.crop.kind; s.bag[kind] = (s.bag[kind] || 0) + 1; t.crop = null; return {done: true, effect: 'harvest', say: '收获了 ' + CROPS[kind].name}; }
    if (t?.crop) return {say: CROPS[t.crop.kind].name + (t.wet ? '，今天浇过水了' : '，还没浇水')};
    return {say: ''};
  }
  return {say: ''};
}
export const canSize = CAN;
