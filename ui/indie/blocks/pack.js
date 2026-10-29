// Textures from the player's own game: the client .jar of a Minecraft version they own (versions/<v>/<v>.jar) or a
// resource pack .zip. Only the zip's directory and its pictures are read (the jar is ~40 MB; nothing else of it is
// opened), and what is taken stays in this browser on this device — it is never uploaded or shared. All the pictures
// of blocks, items, entities and the sky are kept (about 1 MB from a jar), so what the game draws later finds its
// picture without the file being chosen again; the ones in use are picked by name when the game starts. A chest, a
// minecart, the bell, the enchanting table's book, the experience orb and the arm in the hand are cut from the
// game's model pictures (laid out as its models are).
import {TEXTURE_NAMES} from './atlas.js';
import {getOne, putOne, delOne} from './db.js';

const u16 = (b, at) => b[at] | b[at + 1] << 8;
const u32 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** The entries of a zip File, read from its end: Map(path → {method, size, local}). */
async function zipIndex(file) {
  const tailStart = Math.max(0, file.size - 65557), tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('这不是 jar 或 zip 文件');
  const count = u16(tail, end + 10), size = u32(tail, end + 12), offset = u32(tail, end + 16);
  if (offset === 0xffffffff) throw Error('这个压缩包太大（zip64），读不了');
  const dir = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()), dec = new TextDecoder(), out = new Map();
  let at = 0;
  for (let n = 0; n < count && at < dir.length; n++) {
    if (u32(dir, at) !== 0x02014b50) break;
    const method = u16(dir, at + 10), packed = u32(dir, at + 20), nameLen = u16(dir, at + 28), extraLen = u16(dir, at + 30), noteLen = u16(dir, at + 32), local = u32(dir, at + 42);
    out.set(dec.decode(dir.subarray(at + 46, at + 46 + nameLen)), {method, packed, local});
    at += 46 + nameLen + extraLen + noteLen;
  }
  return out;
}
async function zipRead(file, e) {
  const head = new Uint8Array(await file.slice(e.local, e.local + 30).arrayBuffer());
  const start = e.local + 30 + u16(head, 26) + u16(head, 28), data = new Uint8Array(await file.slice(start, start + e.packed).arrayBuffer());
  if (e.method === 0) return data;
  if (e.method === 8) return inflate(data);
  throw Error('压缩包里有读不了的压缩方式');
}

// the sky: older versions keep the moon's eight phases in one 4 × 2 picture, newer ones (26.x) one picture each
const SKY = {sun: ['environment/celestial/sun.png', 'environment/sun.png'], moon: ['environment/moon_phases.png'], clouds: ['environment/clouds.png']};
// mob skins (the game's layouts; newer versions have several looks per animal — the temperate one is the usual)
export const SKINS = {
  pig: ['entity/pig/pig_temperate.png', 'entity/pig/pig.png', 'entity/pig.png'], cow: ['entity/cow/cow_temperate.png', 'entity/cow/cow.png', 'entity/cow.png'],
  sheep: ['entity/sheep/sheep.png'], sheep_wool: ['entity/sheep/sheep_wool.png', 'entity/sheep/sheep_fur.png'], chicken: ['entity/chicken/chicken_temperate.png', 'entity/chicken.png'],
  zombie: ['entity/zombie/zombie.png'], skeleton: ['entity/skeleton/skeleton.png'], creeper: ['entity/creeper/creeper.png'], spider: ['entity/spider/spider.png'],
  player: ['entity/player/wide/steve.png', 'entity/steve.png'],
  villager: ['entity/villager/villager.png'], villager_type: ['entity/villager/type/plains.png'], iron_golem: ['entity/iron_golem/iron_golem.png'],
  ...Object.fromEntries(['farmer', 'fisherman', 'shepherd', 'fletcher', 'librarian', 'cleric', 'armorer', 'toolsmith', 'butcher', 'nitwit'].map(p => [`villager_prof_${p}`, [`entity/villager/profession/${p}.png`]])),
  zombified_piglin: ['entity/piglin/zombified_piglin.png'], ghast: ['entity/ghast/ghast.png'], blaze: ['entity/blaze/blaze.png', 'entity/blaze.png'], magma_cube: ['entity/slime/magmacube.png'],
};
// worn armour: newer versions keep it under equipment/, older ones as <material>_layer_1 / _2 (gold is "gold" there)
for (const [mat, tex] of [['leather', 'leather'], ['chainmail', 'chainmail'], ['iron', 'iron'], ['golden', 'gold'], ['diamond', 'diamond']]) {
  SKINS[`armor_${mat}`] = [`entity/equipment/humanoid/${tex}.png`, `models/armor/${tex}_layer_1.png`];
  SKINS[`armor_${mat}_legs`] = [`entity/equipment/humanoid_leggings/${tex}.png`, `models/armor/${tex}_layer_2.png`];
}
// the sea's: squids, the fish (the tropical one's white picture, tinted), the turtle; the turtle shell worn
Object.assign(SKINS, {squid: ['entity/squid/squid.png'], glow_squid: ['entity/squid/glow_squid.png'], cod: ['entity/fish/cod.png'], salmon: ['entity/fish/salmon.png'], tropical_fish: ['entity/fish/tropical_a.png'],
  pufferfish: ['entity/fish/pufferfish.png'], turtle: ['entity/turtle/turtle.png', 'entity/turtle/big_sea_turtle.png'], armor_turtle: ['entity/equipment/humanoid/turtle_scute.png', 'models/armor/turtle_layer_1.png']});
// the deep sea's guardians
Object.assign(SKINS, {guardian: ['entity/guardian/guardian.png', 'entity/guardian.png'], elder_guardian: ['entity/guardian/guardian_elder.png', 'entity/guardian_elder.png']});
// the drowned (its body, and the rags and weed over it) and the dolphin
Object.assign(SKINS, {drowned: ['entity/zombie/drowned.png'], drowned_outer: ['entity/zombie/drowned_outer_layer.png'], dolphin: ['entity/dolphin/dolphin.png', 'entity/dolphin.png']});
// boats: each wood's (the bamboo raft is bamboo's), with a chest in the bigger picture
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo']) { SKINS[`boat_${w}`] = [`entity/boat/${w}.png`]; SKINS[`chest_boat_${w}`] = [`entity/chest_boat/${w}.png`]; }
const MOON_PHASES = ['full_moon', 'waning_gibbous', 'third_quarter', 'waning_crescent', 'new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous'];
// item pictures whose name the game also gives a block picture (ours are named apart)
const ITEM_FILE = {repeater_item: 'repeater', comparator_item: 'comparator', mangrove_propagule_item: 'mangrove_propagule', pink_petals_item: 'pink_petals', kelp_item: 'kelp', seagrass_item: 'seagrass', sea_pickle_item: 'sea_pickle', turtle_egg_item: 'turtle_egg'};
// pictures kept elsewhere than under their own name (newer versions first; paths under textures/, without .png)
const ALSO = {quartz_pillar: ['block/quartz_pillar_side'], enchanted_golden_apple: ['item/enchanted_golden_apple', 'item/golden_apple'],
  fishing_hook: ['entity/fishing/fishing_hook', 'entity/fishing_hook'], guardian_beam: ['entity/guardian/guardian_beam', 'entity/guardian_beam'],
  weather_rain: ['environment/rain'], weather_snow: ['environment/snow'], entity_shadow: ['misc/shadow']};
// strips that are not animations: only their top square is taken
const STILL = new Set(['weather_rain', 'weather_snow']);
/** Where one of our pictures is in the game's (a path under textures/ without .png), or null. has(path): is it there. */
export function texturePath(name, has) {
  const list = ITEM_FILE[name] ? [`item/${ITEM_FILE[name]}`] : ALSO[name] || [`block/${name}`, `item/${name}`];
  return list.find(has) || null;
}
// what is kept from a jar or pack (under textures/)
const KEEP = /^(block|item|entity|environment|misc)\//;
/**
 * Reads the pictures of a jar or resource pack: {v: 2, label, tex: {path: {png: Blob, meta}}, count (how many of the
 * pictures we use it has), at}. onProgress(done, total).
 */
export async function readPack(file, onProgress = () => {}) {
  const index = await zipIndex(file);
  // a resource pack may sit in a folder inside the zip
  let root = '';
  if (!index.has('assets/minecraft/textures/block/stone.png')) {
    const k = [...index.keys()].find(p => p.endsWith('assets/minecraft/textures/block/stone.png'));
    if (k) root = k.slice(0, k.length - 'assets/minecraft/textures/block/stone.png'.length);
  }
  const base = root + 'assets/minecraft/textures/';
  const entries = [...index.keys()].filter(p => p.startsWith(base) && p.endsWith('.png') && KEEP.test(p.slice(base.length)));
  const count = TEXTURE_NAMES.filter(n => texturePath(n, q => index.has(`${base}${q}.png`))).length;
  if (!count) throw Error('这个文件里没有方块贴图。选游戏版本文件夹里的 .jar，或者资源包 .zip');
  const tex = {};
  let done = 0;
  // a few at a time (each is read and unpacked on its own)
  for (let i = 0; i < entries.length; i += 24) {
    await Promise.all(entries.slice(i, i + 24).map(async path => {
      const png = new Blob([await zipRead(file, index.get(path))], {type: 'image/png'}), metaEntry = index.get(path + '.mcmeta');
      tex[path.slice(base.length, -4)] = {png, meta: metaEntry ? new TextDecoder().decode(await zipRead(file, metaEntry)) : null};
      onProgress(++done, entries.length);
    }));
  }
  let label = file.name.replace(/\.(jar|zip)$/i, '');
  const ver = index.get(root + 'version.json');
  if (ver) { try { label = `Minecraft ${JSON.parse(new TextDecoder().decode(await zipRead(file, ver))).name}`; } catch {} }
  return {v: 2, label, tex, count, at: Date.now()};
}
/** Whether a kept pack was taken by an older version (only the pictures used then: what came after is ours). */
export const staleTaken = rec => !!rec && rec.v !== 2;
/** Kept in this browser. */
export const savePack = p => putOne('pack', p, 'current');
export const removePack = () => delOne('pack', 'current');
export const loadPackRecord = () => getOne('pack', 'current').catch(() => null);

/** A picture's frames as the atlas takes them: {w, h, frames: [Uint8Array], time}; still: only its top square. */
async function frames(g, png, meta, still = false) {
  const canvas = g.canvas, bmp = await createImageBitmap(png), w = bmp.width, h = bmp.height;
  canvas.width = w; canvas.height = h;
  g.clearRect(0, 0, w, h); g.drawImage(bmp, 0, 0);
  const all = g.getImageData(0, 0, w, h).data;
  bmp.close?.();
  // an animation is a strip of square frames, top to bottom
  const count = !still && h > w && h % w === 0 ? h / w : 1, fh = count > 1 ? w : h;
  let list = Array.from({length: count}, (_, f) => new Uint8Array(all.buffer.slice(f * w * fh * 4, (f + 1) * w * fh * 4)));
  let time = 0;
  if (meta && !still) {
    try {
      const a = JSON.parse(meta).animation || {};
      time = a.frametime || 1;
      if (Array.isArray(a.frames)) list = a.frames.map(f => list[typeof f === 'number' ? f : f.index] || list[0]);
    } catch {}
  }
  if (count > 1 && !time) time = 1;
  // non-square still pictures are made square from their top part
  return {w, h: Math.min(fh, w), frames: list.map(f => fh > w ? f.slice(0, w * w * 4) : f), time: list.length > 1 ? time : 0};
}
/**
 * Pictures cut from the game's model pictures, laid out as its models are (in the picture's own pixels at its base size;
 * a bigger pack's are scaled): [from (the model picture's base width), steps: [sx, sy, sw, sh, dx, dy, dw, dh, flip]].
 * A chest's sides are upside down in its picture (its model is drawn the right way up); the first step of each fills
 * the square, so no edge is left empty.
 */
const CUTS = {
  chest_top: [['entity/chest/normal'], 64, [[28, 0, 14, 14, 0, 0, 16, 16], [28, 0, 14, 14, 1, 1, 14, 14]]],
  chest_side: [['entity/chest/normal'], 64, [[0, 33, 14, 10, 0, 0, 16, 16, true], [0, 14, 14, 5, 1, 2, 14, 5, true], [0, 33, 14, 9, 1, 7, 14, 9, true]]],
  chest_front: [['entity/chest/normal'], 64, [[42, 33, 14, 10, 0, 0, 16, 16, true], [42, 14, 14, 5, 1, 2, 14, 5, true], [42, 33, 14, 9, 1, 7, 14, 9, true]]],
  chest_latch: [['entity/chest/normal'], 64, [[4, 1, 2, 4, 0, 0, 16, 16, true]]],
  minecart_side: [['entity/minecart/minecart', 'entity/minecart'], 64, [[2, 2, 16, 8, 0, 0, 16, 16]]],
  minecart_inside: [['entity/minecart/minecart', 'entity/minecart'], 64, [[24, 12, 20, 16, 0, 0, 16, 16]]],
  bell_body: [['entity/bell/bell_body'], 32, [[0, 6, 24, 7, 0, 0, 16, 16, true]]],
  enchanting_book_pages: [['entity/enchantment/enchanting_table_book', 'entity/enchanting_table_book'], 64,
    [[0, 0, 6, 10, 0, 0, 8, 16], [16, 0, 6, 10, 8, 0, 8, 16], [1, 11, 5, 8, 1, 2, 6, 12], [13, 11, 5, 8, 9, 2, 6, 12]]],
  xp_orb: [['entity/experience/experience_orb', 'entity/experience_orb'], 64, [[16, 16, 16, 16, 0, 0, 16, 16]]],
  // the arm in the hand: the player's right arm, its front down the middle of the picture
  player_arm: [['entity/player/wide/steve', 'entity/steve'], 64, [[44, 20, 4, 12, 4, 0, 4, 16]]],
};
async function cut(g, img, base, steps) {
  const k = img.width / base, size = 16 * Math.max(1, Math.round(k)), s = size / 16, canvas = g.canvas;
  canvas.width = canvas.height = size;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, size, size);
  for (const [sx, sy, sw, sh, dx, dy, dw, dh, flip] of steps) {
    g.save();
    if (flip) { g.translate(0, (dy + dh) * s); g.scale(1, -1); g.drawImage(img, sx * k, sy * k, sw * k, sh * k, dx * s, 0, dw * s, dh * s); }
    else g.drawImage(img, sx * k, sy * k, sw * k, sh * k, dx * s, dy * s, dw * s, dh * s);
    g.restore();
  }
  return {w: size, h: size, frames: [new Uint8Array(g.getImageData(0, 0, size, size).data.buffer)], time: 0};
}

/**
 * The pictures decoded: Map(name → {w, h, frames: [Uint8Array], time}), sky images and mob skins (ImageBitmaps), and
 * whether the pack was taken by an older version.
 */
export async function decodePack(rec) {
  const out = new Map(), sky = {}, skins = {};
  if (!rec) return {textures: null, sky, skins, stale: false};
  const canvas = document.createElement('canvas'), g = canvas.getContext('2d', {willReadFrequently: true});
  if (rec.v === 2) {
    const has = p => !!rec.tex[p], bitmap = async p => { try { return await createImageBitmap(rec.tex[p].png); } catch { return null; } };
    for (const name of TEXTURE_NAMES) {
      const path = texturePath(name, has);
      if (!path) continue;
      try { out.set(name, await frames(g, rec.tex[path].png, rec.tex[path].meta, STILL.has(name))); } catch {}
    }
    for (const [name, [from, base, steps]] of Object.entries(CUTS)) {
      const p = from.find(has), img = p && await bitmap(p);
      if (!img) continue;
      try { out.set(name, await cut(g, img, base, steps)); } catch {}
      img.close?.();
    }
    for (const [k, paths] of Object.entries(SKINS)) { const p = paths.map(x => x.slice(0, -4)).find(has); if (p) { const b = await bitmap(p); if (b) skins[k] = b; } }
    for (const [k, paths] of Object.entries(SKY)) { const p = paths.map(x => x.slice(0, -4)).find(has); if (p) { const b = await bitmap(p); if (b) sky[k] = b; } }
    if (!sky.moon) {
      const phases = MOON_PHASES.map(n => `environment/celestial/moon/${n}`);
      if (phases.every(has)) sky.moonPhases = await Promise.all(phases.map(bitmap));
    }
  } else {
    // taken by an older version: the pictures it kept, each under our name
    for (const [k, blob] of Object.entries(rec.skins || {})) { try { skins[k] = await createImageBitmap(blob); } catch {} }
    for (const [name, {png, meta}] of Object.entries(rec.files || {})) { try { out.set(name, await frames(g, png, meta, STILL.has(name))); } catch {} }
    for (const [k, blob] of Object.entries(rec.sky || {})) { if (k === 'moonPhases') continue; try { sky[k] = await createImageBitmap(blob); } catch {} }
    if (rec.sky?.moonPhases?.length === 8) { try { sky.moonPhases = await Promise.all(rec.sky.moonPhases.map(b => createImageBitmap(b))); } catch {} }
  }
  // eight separate moons put back into the 4 × 2 picture the sky draws from
  if (!sky.moon && sky.moonPhases?.length === 8) {
    try {
      const bmps = sky.moonPhases, s = bmps[0].width, c = document.createElement('canvas');
      c.width = s * 4; c.height = s * 2;
      const g2 = c.getContext('2d');
      bmps.forEach((b, i) => g2.drawImage(b, (i % 4) * s, Math.floor(i / 4) * s));
      sky.moon = c;
    } catch {}
  }
  delete sky.moonPhases;
  return {textures: out, sky, skins, stale: staleTaken(rec)};
}
