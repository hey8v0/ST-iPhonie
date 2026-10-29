// Potions as the game (Java Edition) has them: what each brews from, how long it lasts, its colour, and the effects —
// speed, slowness, strength, weakness, regeneration, poison, fire resistance, water breathing, night vision,
// invisibility, instant health and damage. A potion stack is {id: 'potion' | 'splash_potion', pot: 'swiftness' |
// 'long_swiftness' | 'strong_swiftness' | 'water' | 'awkward' …}. No DOM here: the page brews and drinks with it.

// effect id: name, colour, good or bad, and what one level does (main.js reads `speed`, `damage` and the rest)
export const EFFECTS = {
  speed: {zh: '迅捷', color: 0x33EBFF, good: true},
  slowness: {zh: '缓慢', color: 0x8BAFE0, good: false},
  strength: {zh: '力量', color: 0xFFC700, good: true},
  weakness: {zh: '虚弱', color: 0x484D48, good: false},
  regeneration: {zh: '生命恢复', color: 0xCD5CAB, good: true},
  poison: {zh: '中毒', color: 0x87A363, good: false},
  fire_resistance: {zh: '抗火', color: 0xFF9900, good: true},
  water_breathing: {zh: '水下呼吸', color: 0x98DAC0, good: true},
  night_vision: {zh: '夜视', color: 0xC2FF66, good: true},
  invisibility: {zh: '隐身', color: 0xF6F6F6, good: true},
  absorption: {zh: '伤害吸收', color: 0x2552A5, good: true},
  resistance: {zh: '抗性提升', color: 0x99453A, good: true},
  // the elder guardian's curse: digging slower (the game's 0.3, 0.09, 0.0027, 0.00081 a level)
  mining_fatigue: {zh: '挖掘疲劳', color: 0x4A4217, good: false},
  // the conduit's: breathing under water, seeing there as by day, digging a fifth faster (the game's 急迫 I)
  conduit_power: {zh: '潮涌能量', color: 0x1DC2D1, good: true},
  // a suspicious stew's: food at once, jumping higher, seeing almost nothing, withering (it can kill)
  saturation: {zh: '饱和', color: 0xF82423, good: true},
  jump_boost: {zh: '跳跃提升', color: 0xFDFF84, good: true},
  blindness: {zh: '失明', color: 0x1F1F23, good: false},
  wither: {zh: '凋零', color: 0x736156, good: false},
  instant_health: {zh: '瞬间治疗', color: 0xF82423, good: true, instant: true},
  instant_damage: {zh: '瞬间伤害', color: 0xA9656A, good: false, instant: true},
};
// potion: its effect, level (0 = I), seconds; the plain ones have none
const P = (zh, effect, amp, secs) => ({zh, effect, amp, secs});
export const POTIONS = {
  water: {zh: '水瓶'}, mundane: {zh: '平凡的药水'}, thick: {zh: '浓稠的药水'}, awkward: {zh: '粗制的药水'},
  swiftness: P('迅捷药水', 'speed', 0, 180), long_swiftness: P('迅捷药水', 'speed', 0, 480), strong_swiftness: P('迅捷药水', 'speed', 1, 90),
  slowness: P('迟缓药水', 'slowness', 0, 90), long_slowness: P('迟缓药水', 'slowness', 0, 240), strong_slowness: P('迟缓药水', 'slowness', 3, 20),
  strength: P('力量药水', 'strength', 0, 180), long_strength: P('力量药水', 'strength', 0, 480), strong_strength: P('力量药水', 'strength', 1, 90),
  weakness: P('虚弱药水', 'weakness', 0, 90), long_weakness: P('虚弱药水', 'weakness', 0, 240),
  regeneration: P('再生药水', 'regeneration', 0, 45), long_regeneration: P('再生药水', 'regeneration', 0, 90), strong_regeneration: P('再生药水', 'regeneration', 1, 22),
  poison: P('剧毒药水', 'poison', 0, 45), long_poison: P('剧毒药水', 'poison', 0, 90), strong_poison: P('剧毒药水', 'poison', 1, 21),
  fire_resistance: P('抗火药水', 'fire_resistance', 0, 180), long_fire_resistance: P('抗火药水', 'fire_resistance', 0, 480),
  water_breathing: P('水肺药水', 'water_breathing', 0, 180), long_water_breathing: P('水肺药水', 'water_breathing', 0, 480),
  night_vision: P('夜视药水', 'night_vision', 0, 180), long_night_vision: P('夜视药水', 'night_vision', 0, 480),
  invisibility: P('隐身药水', 'invisibility', 0, 180), long_invisibility: P('隐身药水', 'invisibility', 0, 480),
  healing: P('治疗药水', 'instant_health', 0, 0), strong_healing: P('治疗药水', 'instant_health', 1, 0),
  harming: P('伤害药水', 'instant_damage', 0, 0), strong_harming: P('伤害药水', 'instant_damage', 1, 0),
};
// the base the plain potions brew from (ingredient → result), then the effect ones from 粗制的药水
const BASE = {nether_wart: 'awkward', glowstone_dust: 'thick', redstone: 'mundane', sugar: 'mundane', spider_eye: 'mundane', ghast_tear: 'mundane', blaze_powder: 'mundane', magma_cream: 'mundane', glistering_melon_slice: 'mundane', fermented_spider_eye: 'weakness'};
const FROM_AWKWARD = {sugar: 'swiftness', magma_cream: 'fire_resistance', blaze_powder: 'strength', ghast_tear: 'regeneration', spider_eye: 'poison', golden_carrot: 'night_vision', pufferfish: 'water_breathing', glistering_melon_slice: 'healing'};
// 发酵蛛眼 turns a potion to its opposite
const CORRUPT = {swiftness: 'slowness', long_swiftness: 'long_slowness', night_vision: 'invisibility', long_night_vision: 'long_invisibility',
  healing: 'harming', strong_healing: 'strong_harming', poison: 'harming', long_poison: 'harming', strong_poison: 'strong_harming'};
export const INGREDIENTS = new Set([...Object.keys(BASE), ...Object.keys(FROM_AWKWARD), 'redstone', 'glowstone_dust', 'gunpowder', 'fermented_spider_eye']);

/** What brewing `ingredient` into potion `bottle` ({id, pot}) gives: a new potion stack, or null (it does not react). */
export function brewResult(bottle, ingredient) {
  if (!bottle || !['potion', 'splash_potion'].includes(bottle.id)) return null;
  const pot = bottle.pot || 'water';
  if (ingredient === 'gunpowder') return bottle.id === 'potion' ? {...bottle, id: 'splash_potion'} : null;
  let out = null;
  if (pot === 'water') out = BASE[ingredient] || null;
  else if (pot === 'awkward') out = FROM_AWKWARD[ingredient] || null;
  else if (ingredient === 'redstone') out = POTIONS['long_' + pot] && !pot.startsWith('strong_') ? 'long_' + pot : null;
  else if (ingredient === 'glowstone_dust') out = POTIONS['strong_' + pot] && !pot.startsWith('long_') ? 'strong_' + pot : null;
  else if (ingredient === 'fermented_spider_eye') out = CORRUPT[pot] || null;
  return out ? {id: bottle.id, n: 1, pot: out} : null;
}
/** Can this go in the brewing stand's top slot with these bottles (it changes at least one)? */
export const brews = (bottles, ingredient) => bottles.some(b => brewResult(b, ingredient));

export const potionName = s => `${s.id === 'splash_potion' && s.pot !== 'water' ? '喷溅型' : ''}${s.pot === 'water' && s.id === 'splash_potion' ? '喷溅水瓶' : POTIONS[s.pot || 'water']?.zh || '药水'}`;
/** The colour of a potion's liquid: its effect's, water's blue for the plain ones. */
export const potionColor = pot => EFFECTS[POTIONS[pot]?.effect]?.color ?? 0x385DC6;
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
export const levelName = amp => amp ? ' ' + ROMAN[amp] : '';
const clock = secs => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
/** The lines under a potion's name in its tooltip: 「迅捷 (3:00)」 and the like, 「无效果」 for the plain ones. */
export function potionLines(s) {
  const p = POTIONS[s.pot || 'water'];
  if (!p?.effect) return ['无效果'];
  const e = EFFECTS[p.effect];
  return [`${e.zh}${levelName(p.amp)}${e.instant ? '' : ` (${clock(p.secs)})`}`];
}

// ---------- effects on the player (or a mob): {id: {amp, t (ticks left)}} ----------
/** Gives an effect (a stronger one, or the same one for longer, replaces what is there). */
export function addEffect(effects, id, amp, ticks) {
  const now = effects[id];
  if (!now || amp > now.amp || (amp === now.amp && ticks > now.t)) effects[id] = {amp, t: ticks};
}
/**
 * Drinking (or being splashed by, at `share` of full strength 0..1, less further from where it broke) a potion: the
 * instant ones act now through heal(n) / harm(n); the others become effects lasting `share` of their time.
 */
export function applyPotion(effects, pot, {share = 1, heal = () => {}, harm = () => {}} = {}) {
  const p = POTIONS[pot];
  if (!p?.effect || share <= 0) return false;
  if (p.effect === 'instant_health') { heal(Math.floor(share * (4 << p.amp))); return true; }
  if (p.effect === 'instant_damage') { harm(Math.floor(share * (6 << p.amp))); return true; }
  const ticks = Math.floor(p.secs * 20 * share);
  if (ticks >= 20) addEffect(effects, p.effect, p.amp, ticks);
  return true;
}
/**
 * One tick of the effects: counts them down and does what they do over time. heal(n), harm(n, kind) act on the
 * body, feed(n) on its hunger; health() is how much it has (poison never takes the last half heart, wither does).
 * Returns the effects that ran out.
 */
export function effectsTick(effects, {heal = () => {}, harm = () => {}, feed = () => {}, health = () => 20} = {}) {
  const gone = [];
  for (const [id, e] of Object.entries(effects)) {
    // regeneration: half a heart every 50 ticks at I (25 at II…); poison: every 25 (12 at II)
    if (id === 'regeneration') { const every = Math.max(1, 50 >> e.amp); if (e.t % every === 0) heal(1); }
    if (id === 'poison') { const every = Math.max(1, 25 >> e.amp); if (e.t % every === 0 && health() > 1) harm(1, 'poison'); }
    // wither: half a heart every 40 ticks at I (20 at II…); saturation: a point of food (and two of saturation) a tick a level
    if (id === 'wither') { const every = Math.max(1, 40 >> e.amp); if (e.t % every === 0) harm(1, 'wither'); }
    if (id === 'saturation') feed(e.amp + 1);
    if (--e.t <= 0) { delete effects[id]; gone.push(id); }
  }
  return gone;
}
/** How the effects change walking speed (×) and a hit (+ hearts): speed +20 % a level, slowness −15 %, strength +3, weakness −4. */
export function speedFactor(effects) {
  let f = 1;
  if (effects.speed) f *= 1 + 0.2 * (effects.speed.amp + 1);
  if (effects.slowness) f *= Math.max(0, 1 - 0.15 * (effects.slowness.amp + 1));
  return f;
}
export function hitBonus(effects) { return (effects.strength ? 3 * (effects.strength.amp + 1) : 0) - (effects.weakness ? 4 * (effects.weakness.amp + 1) : 0); }
/** The colour of the swirls round someone with effects: the effects' colours mixed. */
export function swirlColor(effects) {
  const ids = Object.keys(effects);
  if (!ids.length) return null;
  let r = 0, g = 0, b = 0;
  for (const id of ids) { const c = EFFECTS[id].color; r += c >> 16 & 255; g += c >> 8 & 255; b += c & 255; }
  return (Math.round(r / ids.length) << 16) | (Math.round(g / ids.length) << 8) | Math.round(b / ids.length);
}

// ---------- the brewing stand ----------
// A tile: {kind: 'brew', slots: [bottle, bottle, bottle, ingredient, fuel], fuel (charges, 20 per blaze powder), time}.
// Brewing takes 20 seconds (400 ticks) and one charge; taking the ingredient away stops it.
export const BREW_TICKS = 400;
export function brewTick(tile) {
  const s = tile.slots, bottles = s.slice(0, 3), ing = s[3]?.id;
  if (!tile.fuel && s[4]?.id === 'blaze_powder' && ing && brews(bottles, ing)) { tile.fuel = 20; s[4] = s[4].n > 1 ? {...s[4], n: s[4].n - 1} : null; }
  const can = ing && tile.fuel > 0 && brews(bottles, ing);
  if (!can) { const was = tile.time > 0; tile.time = 0; return was; }
  if (!tile.time) { tile.time = BREW_TICKS; tile.fuel--; tile.ing = ing; return true; }
  if (tile.ing !== ing) { tile.time = 0; return true; }
  if (--tile.time > 0) return false;
  for (let i = 0; i < 3; i++) { const out = brewResult(s[i], ing); if (out) s[i] = out; }
  s[3] =s[3].n > 1 ? {...s[3], n: s[3].n - 1} : null;
  tile.done = true;
  return true;
}
