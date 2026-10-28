// Textures from the player's own game: the client .jar of a Minecraft version they own (versions/<v>/<v>.jar) or a
// resource pack .zip. Only the zip's directory and the pictures we use are read (the jar is ~40 MB; nothing else of it
// is opened), and what is taken stays in this browser on this device — it is never uploaded or shared.
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
const SKINS = {
  pig: ['entity/pig/pig_temperate.png', 'entity/pig/pig.png', 'entity/pig.png'], cow: ['entity/cow/cow_temperate.png', 'entity/cow/cow.png', 'entity/cow.png'],
  sheep: ['entity/sheep/sheep.png'], sheep_wool: ['entity/sheep/sheep_wool.png', 'entity/sheep/sheep_fur.png'], chicken: ['entity/chicken/chicken_temperate.png', 'entity/chicken.png'],
  zombie: ['entity/zombie/zombie.png'], skeleton: ['entity/skeleton/skeleton.png'], creeper: ['entity/creeper/creeper.png'], spider: ['entity/spider/spider.png'],
  player: ['entity/player/wide/steve.png', 'entity/steve.png'],
  villager: ['entity/villager/villager.png'], villager_type: ['entity/villager/type/plains.png'], iron_golem: ['entity/iron_golem/iron_golem.png'],
  ...Object.fromEntries(['farmer', 'fisherman', 'shepherd', 'fletcher', 'librarian', 'cleric', 'armorer', 'toolsmith', 'butcher', 'nitwit'].map(p => [`villager_prof_${p}`, [`entity/villager/profession/${p}.png`]])),
  zombified_piglin: ['entity/piglin/zombified_piglin.png'], ghast: ['entity/ghast/ghast.png'], blaze: ['entity/blaze.png'], magma_cube: ['entity/slime/magmacube.png'],
};
// worn armour: newer versions keep it under equipment/, older ones as <material>_layer_1 / _2 (gold is "gold" there)
for (const [mat, tex] of [['leather', 'leather'], ['chainmail', 'chainmail'], ['iron', 'iron'], ['golden', 'gold'], ['diamond', 'diamond']]) {
  SKINS[`armor_${mat}`] = [`entity/equipment/humanoid/${tex}.png`, `models/armor/${tex}_layer_1.png`];
  SKINS[`armor_${mat}_legs`] = [`entity/equipment/humanoid_leggings/${tex}.png`, `models/armor/${tex}_layer_2.png`];
}
// the sea's: squids, the fish (the tropical one's white picture, tinted), the turtle; the turtle shell worn
Object.assign(SKINS, {squid: ['entity/squid/squid.png'], glow_squid: ['entity/squid/glow_squid.png'], cod: ['entity/fish/cod.png'], salmon: ['entity/fish/salmon.png'], tropical_fish: ['entity/fish/tropical_a.png'],
  pufferfish: ['entity/fish/pufferfish.png'], turtle: ['entity/turtle/big_sea_turtle.png'], armor_turtle: ['entity/equipment/humanoid/turtle_scute.png', 'models/armor/turtle_layer_1.png']});
// the deep sea's guardians
Object.assign(SKINS, {guardian: ['entity/guardian.png'], elder_guardian: ['entity/guardian_elder.png']});
// boats: each wood's (the bamboo raft is bamboo's), with a chest in the bigger picture
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo']) { SKINS[`boat_${w}`] = [`entity/boat/${w}.png`]; SKINS[`chest_boat_${w}`] = [`entity/chest_boat/${w}.png`]; }
const MOON_PHASES = ['full_moon', 'waning_gibbous', 'third_quarter', 'waning_crescent', 'new_moon', 'waxing_crescent', 'first_quarter', 'waxing_gibbous'];
// item pictures whose name the game also gives a block picture (ours are named apart)
const ITEM_FILE = {repeater_item: 'repeater', comparator_item: 'comparator', mangrove_propagule_item: 'mangrove_propagule', pink_petals_item: 'pink_petals', kelp_item: 'kelp', seagrass_item: 'seagrass', sea_pickle_item: 'sea_pickle', turtle_egg_item: 'turtle_egg'};
/**
 * Reads the pictures we use from a jar or resource pack: {label, files: {name: {png: Blob, meta}}, sky: {sun, moon,
 * clouds: Blob}, count}. onProgress(done, total).
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
  const wanted = [];
  for (const name of TEXTURE_NAMES) {
    const path = (ITEM_FILE[name] ? [`${base}item/${ITEM_FILE[name]}.png`] : [`${base}block/${name}.png`, `${base}item/${name}.png`]).find(p => index.has(p));
    if (path) wanted.push([name, path]);
  }
  if (!wanted.length) throw Error('这个文件里没有方块贴图。选游戏版本文件夹里的 .jar，或者资源包 .zip');
  const files = {}, sky = {};
  let done = 0;
  const total = wanted.length + 3;
  for (const [name, path] of wanted) {
    const png = new Blob([await zipRead(file, index.get(path))], {type: 'image/png'});
    const metaEntry = index.get(path + '.mcmeta');
    files[name] = {png, meta: metaEntry ? new TextDecoder().decode(await zipRead(file, metaEntry)) : null};
    onProgress(++done, total);
  }
  for (const [k, paths] of Object.entries(SKY)) {
    const e = paths.map(p => index.get(base + p)).find(Boolean);
    if (e) sky[k] = new Blob([await zipRead(file, e)], {type: 'image/png'});
    onProgress(++done, total);
  }
  if (!sky.moon) {
    const phases = MOON_PHASES.map(n => index.get(`${base}environment/celestial/moon/${n}.png`));
    if (phases.every(Boolean)) sky.moonPhases = await Promise.all(phases.map(async e => new Blob([await zipRead(file, e)], {type: 'image/png'})));
  }
  const skins = {};
  for (const [k, paths] of Object.entries(SKINS)) { const e = paths.map(p => index.get(base + p)).find(Boolean); if (e) skins[k] = new Blob([await zipRead(file, e)], {type: 'image/png'}); }
  let label = file.name.replace(/\.(jar|zip)$/i, '');
  const ver = index.get(root + 'version.json');
  if (ver) { try { label = `Minecraft ${JSON.parse(new TextDecoder().decode(await zipRead(file, ver))).name}`; } catch {} }
  return {label, files, sky, skins, count: wanted.length, at: Date.now()};
}
/** Kept in this browser. */
export const savePack = p => putOne('pack', p, 'current');
export const removePack = () => delOne('pack', 'current');
export const loadPackRecord = () => getOne('pack', 'current').catch(() => null);

/** The pictures decoded: Map(name → {w, h, frames: [Uint8Array], time}) and sky images (ImageBitmaps). */
export async function decodePack(rec) {
  const out = new Map(), sky = {}, skins = {};
  if (!rec) return {textures: null, sky, skins};
  for (const [k, blob] of Object.entries(rec.skins || {})) { try { skins[k] = await createImageBitmap(blob); } catch {} }
  const canvas = document.createElement('canvas'), g = canvas.getContext('2d', {willReadFrequently: true});
  for (const [name, {png, meta}] of Object.entries(rec.files)) {
    try {
      const bmp = await createImageBitmap(png);
      canvas.width = bmp.width; canvas.height = bmp.height;
      g.clearRect(0, 0, bmp.width, bmp.height); g.drawImage(bmp, 0, 0);
      const all = g.getImageData(0, 0, bmp.width, bmp.height).data, w = bmp.width;
      // an animation is a strip of square frames, top to bottom
      const count = bmp.height > w && bmp.height % w === 0 ? bmp.height / w : 1, fh = count > 1 ? w : bmp.height;
      let frames = Array.from({length: count}, (_, f) => new Uint8Array(all.buffer.slice(f * w * fh * 4, (f + 1) * w * fh * 4)));
      let time = 0;
      if (meta) {
        try {
          const a = JSON.parse(meta).animation || {};
          time = a.frametime || 1;
          if (Array.isArray(a.frames)) frames = a.frames.map(f => frames[typeof f === 'number' ? f : f.index] || frames[0]);
        } catch {}
      }
      if (count > 1 && !time) time = 1;
      // non-square still pictures are made square from their top part
      out.set(name, {w, h: Math.min(fh, w), frames: frames.map(f => fh > w ? f.slice(0, w * w * 4) : f), time: frames.length > 1 ? time : 0});
      bmp.close?.();
    } catch {}
  }
  for (const [k, blob] of Object.entries(rec.sky || {})) { if (k === 'moonPhases') continue; try { sky[k] = await createImageBitmap(blob); } catch {} }
  // eight separate moons put back into the 4 × 2 picture the sky draws from
  if (!sky.moon && rec.sky?.moonPhases?.length === 8) {
    try {
      const bmps = await Promise.all(rec.sky.moonPhases.map(b => createImageBitmap(b))), s = bmps[0].width, c = document.createElement('canvas');
      c.width = s * 4; c.height = s * 2;
      const g = c.getContext('2d');
      bmps.forEach((b, i) => g.drawImage(b, (i % 4) * s, Math.floor(i / 4) * s));
      sky.moon = c;
    } catch {}
  }
  return {textures: out, sky, skins};
}
