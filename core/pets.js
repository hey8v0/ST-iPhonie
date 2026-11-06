// 宠物 (0.9.36): little pixel pets that live in the chat app. They walk about the chats, are fed with food bought with
// 零钱 in the 商城, and are happier for being played with. No DOM or network here: the kinds, the food, and how 饱腹 and
// 心情 fall with the hours (kept as they were at a time, `at`, and worked out from it: nothing ticks while the phone is shut).

export const PET_KINDS = Object.freeze({
  cat: Object.freeze({name: '小猫', likes: 'fish'}),
  chick: Object.freeze({name: '小鸡', likes: 'grain'}),
  slime: Object.freeze({name: '史莱姆', likes: 'jelly'}),
  crab: Object.freeze({name: '小螃蟹', likes: 'seaweed'}),
});
/** The food of the 商城: what it fills (饱腹) and cheers (心情); the kind that likes it best gets more of both. */
export const PET_FOODS = Object.freeze({
  fish: Object.freeze({name: '小鱼干', emoji: '🐟', price: 3, fill: 30, joy: 4}),
  grain: Object.freeze({name: '谷粒', emoji: '🌾', price: 2, fill: 25, joy: 4}),
  jelly: Object.freeze({name: '果冻', emoji: '🍮', price: 4, fill: 30, joy: 4}),
  seaweed: Object.freeze({name: '海苔', emoji: '🌿', price: 3, fill: 30, joy: 4}),
  cake: Object.freeze({name: '小蛋糕', emoji: '🍰', price: 8, fill: 40, joy: 18}),
});
export const PET_LIMITS = Object.freeze({pets: 3, name: 8, food: 99});
/** How much 饱腹 and 心情 fall an hour: from full to empty in about a day; hungry, the mood falls twice as fast. */
export const PET_DECAY = Object.freeze({full: 4, mood: 3});
const HOUR = 3_600_000;
const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) * 10) / 10 || 0));
const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A pet as kept: {id, kind, name, born, full, mood, at}. */
export function cleanPet(p, now = Date.now()) {
  if (!p || typeof p !== 'object' || !Object.hasOwn(PET_KINDS, p.kind)) return null;
  const time = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : now;
  return {id: /^[\w-]{4,64}$/.test(String(p.id || '')) ? String(p.id) : 'pet-' + Math.random().toString(36).slice(2, 10), kind: p.kind,
    name: text(p.name, PET_LIMITS.name) || PET_KINDS[p.kind].name, born: time(p.born), full: clamp(p.full ?? 80), mood: clamp(p.mood ?? 80), at: time(p.at)};
}
/** The pets and their food: {list: [pet], food: {food key: how many}, show: whether they come into the chats}. */
export function normalizePets(value, now = Date.now()) {
  const v = value && typeof value === 'object' ? value : {};
  const list = (Array.isArray(v.list) ? v.list : []).map(p => cleanPet(p, now)).filter(Boolean).slice(0, PET_LIMITS.pets);
  const food = {};
  for (const [key, n] of Object.entries(v.food && typeof v.food === 'object' ? v.food : {})) {
    const count = Math.max(0, Math.min(PET_LIMITS.food, Math.round(Number(n)) || 0));
    if (Object.hasOwn(PET_FOODS, key) && count) food[key] = count;
  }
  return {list, food, show: v.show !== false};
}

/** A pet as it is now: 饱腹 and 心情 after the hours since `at` (hungry, the mood falls faster). */
export function petNow(p, now = Date.now()) {
  const hours = Math.max(0, (now - p.at) / HOUR);
  const full = clamp(p.full - hours * PET_DECAY.full);
  // The hours spent under 30 (hungry) count twice for the mood.
  const fedHours = Math.max(0, Math.min(hours, (p.full - 30) / PET_DECAY.full));
  const mood = clamp(p.mood - fedHours * PET_DECAY.mood - (hours - fedHours) * PET_DECAY.mood * 2);
  return {...p, full, mood, at: Math.max(p.at, now)};
}
/** How a pet is doing, for what it does and says: 'starving' | 'hungry' | 'sulky' | 'happy' | 'fine'. */
export function petMood(p, now = Date.now()) {
  const q = petNow(p, now);
  return q.full < 10 ? 'starving' : q.full < 30 ? 'hungry' : q.mood < 25 ? 'sulky' : q.mood >= 70 ? 'happy' : 'fine';
}
/** Fed: fuller and happier (more for the food it likes). Answers the pet as it is after. */
export function feedPet(p, foodKey, now = Date.now()) {
  const food = PET_FOODS[foodKey];
  if (!food) throw Error('没有这种吃的');
  const q = petNow(p, now), liked = PET_KINDS[p.kind]?.likes === foodKey;
  if (q.full >= 98) throw Error(`${p.name}吃不下了`);
  return {...q, full: clamp(q.full + food.fill + (liked ? 10 : 0)), mood: clamp(q.mood + food.joy + (liked ? 12 : 0)), at: now};
}
/** Played with (a tap, a ride on a bubble …): a little happier; a starving pet is not. */
export function playPet(p, amount, now = Date.now()) {
  const q = petNow(p, now);
  return q.full < 10 ? q : {...q, mood: clamp(q.mood + Math.max(0, Math.min(20, Number(amount) || 0))), at: now};
}
/** A new pet, a little hungry and glad to be home. */
export function adoptPet(kind, name, now = Date.now()) {
  if (!Object.hasOwn(PET_KINDS, kind)) throw Error('没有这种宠物');
  return cleanPet({kind, name: text(name, PET_LIMITS.name) || PET_KINDS[kind].name, born: now, full: 70, mood: 85, at: now}, now);
}
