// Decorative companions: old care fields are deliberately ignored when loading a save.
export const PET_KINDS = Object.freeze({
  cat: Object.freeze({name: '小猫'}),
  chick: Object.freeze({name: '小鸡'}),
  slime: Object.freeze({name: '史莱姆'}),
  crab: Object.freeze({name: '小螃蟹'}),
});
export const PET_LIMITS = Object.freeze({pets: 3, name: 8});
const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function cleanPet(p, now = Date.now()) {
  if (!p || typeof p !== 'object' || !Object.hasOwn(PET_KINDS, p.kind)) return null;
  return {id: /^[\w-]{4,64}$/.test(String(p.id || '')) ? String(p.id) : 'pet-' + Math.random().toString(36).slice(2, 10), kind: p.kind,
    name: text(p.name, PET_LIMITS.name) || PET_KINDS[p.kind].name, born: Number.isFinite(Number(p.born)) && Number(p.born) > 0 ? Number(p.born) : now};
}
export function normalizePets(value, now = Date.now()) {
  const v = value && typeof value === 'object' ? value : {};
  return {list: (Array.isArray(v.list) ? v.list : []).map(p => cleanPet(p, now)).filter(Boolean).slice(0, PET_LIMITS.pets), show: v.show !== false};
}
export function adoptPet(kind, name, now = Date.now()) {
  if (!Object.hasOwn(PET_KINDS, kind)) throw Error('没有这种宠物');
  return cleanPet({kind, name, born: now}, now);
}
