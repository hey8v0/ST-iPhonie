// 方块世界: a block world in the spirit of the game, made from scratch. This page runs the game: the menus, the player,
// breaking and placing, survival (health, hunger, air), the day, what is held, the HUD; the world itself is made and
// kept by the worker (world.worker.js) and drawn by render.js.
import {BLOCKS, ID, MINY, HEIGHT, itemInfo, zhOf, breakTime, harvests, dropsOf, withMeta, damageOf, ARMOR, throughArmor, addXp} from './blocks.js';
import {Mobs, MOBS} from './mobs.js';
import {MODELS, OWN_SKINS, ARMOR_PARTS, ownArmor, buildModel, animate} from './models.js';
import {Renderer, Verts, mat} from './render.js';
import {buildLayers, makeIcons, LAYER, ownSun, ownMoon, ownClouds} from './atlas.js';
import {readPack, savePack, removePack, loadPackRecord, decodePack} from './pack.js';
import {listWorlds, saveWorld, deleteWorld} from './db.js';
import {Mirror} from './mirror.js';
import {Body, raycast} from './player.js';
import {Inventory, furnaceTick, stackMax, ARMOR_AT, takeSmeltXp} from './inventory.js';
import {enchOf, shelvesAround, fishLoot, protectionFactor, wears, seeded} from './enchant.js';
import {InventoryUI, stackHtml} from './invui.js';
import {Entities, itemLook, setPacked} from './entities.js';
import {Input} from './input.js';
import {Screens} from './screens.js';
import {collisionBoxes, DIR} from './shapes.js';
import {unlockSound, play, setVolume, setRain} from './sound.js';
import {seedOf} from './noise.js';
import {spawnPoint, BIOMES} from './gen.js';

const $ = s => document.querySelector(s);
const app = $('#app'), canvas = $('#view'), hud = $('#hud'), invRoot = $('#inv');
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const inTavern = parent !== window;
const SET_KEY = 'st-iphonie-blocks-settings';
const DEFAULTS = {dist: isTouch ? 5 : 8, fov: 70, sens: 1, gamma: 0.5, volume: 0.7, scale: isTouch ? 0.7 : 1, wave: true, clouds: true, bob: true, autoJump: true};
let settings = {...DEFAULTS};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} };

// ---------- layout: the whole window, turned on its side on an upright phone ----------
let rotated = false, renderer = null;
function layout() {
  rotated = isTouch && innerHeight > innerWidth;
  document.documentElement.classList.toggle('rot', rotated);
  const w = rotated ? innerHeight : innerWidth, h = rotated ? innerWidth : innerHeight;
  // the window's own size (100vh / dvh do not always match it, and the turned box needs it exactly)
  app.style.width = `${w}px`; app.style.height = `${h}px`;
  const dpr = Math.min(devicePixelRatio || 1, 2) * settings.scale;
  renderer?.resize(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr)));
  app.style.setProperty('--u', `${Math.max(1.4, Math.min(4, Math.min(w / 330, h / 225))).toFixed(2)}px`);
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));
const tryLandscape = () => { if (!isTouch) return; try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch {} };
/** Full screen (on Android phones the screen can then really be locked sideways; iPhones can't go full screen). */
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen({navigationUI: 'hide'}); tryLandscape(); }
  } catch { toast('这个浏览器不能全屏'); }
  setTimeout(layout, 200);
}

// ---------- textures ----------
let built = null, icons = {}, packLabel = '', dirtUrl = '';
async function loadTextures() {
  const rec = await loadPackRecord();
  const {textures, sky, skins} = await decodePack(rec);
  built = buildLayers(textures);
  renderer.setTextures(built.size, built.layers);
  icons = makeIcons(built);
  renderer.setImage('sun', sky.sun || ownSun(), {linear: false});
  renderer.setImage('moon', sky.moon || ownMoon());
  renderer.setImage('clouds', sky.clouds || ownClouds(), {repeat: true});
  // mob skins: the pack's (in the same layout) or ours; their sizes, since a pack's may be bigger
  skinSizes = {};
  for (const k of Object.keys(MODELS)) { const img = skins?.[k] || OWN_SKINS[k](); renderer.setImage(`mob:${k}`, img); skinSizes[k] = [img.width, img.height]; }
  // worn armour: the pack's pictures (leather there is grey, dyed its usual brown) or ours
  for (const m of Object.keys(ARMOR)) for (const [key, layer] of [[`armor_${m}`, 1], [`armor_${m}_legs`, 2]]) {
    const img = skins?.[key] || ownArmor(m, layer); renderer.setImage(`mob:${key}`, img); skinSizes[key] = [img.width, img.height]; greyArmor[key] = !!skins?.[key] && m === 'leather';
  }
  setPacked(built.from);
  packLabel = rec?.label || '';
  // the menus' background: the dirt, darkened
  const c = document.createElement('canvas'), d = built.layers[LAYER.dirt], s = built.size;
  c.width = c.height = s;
  const img = c.getContext('2d').createImageData(s, s);
  for (let i = 0; i < d.length; i += 4) { img.data[i] = d[i] * 0.25; img.data[i + 1] = d[i + 1] * 0.25; img.data[i + 2] = d[i + 2] * 0.25; img.data[i + 3] = 255; }
  c.getContext('2d').putImageData(img, 0, 0);
  dirtUrl = c.toDataURL();
  let style = document.getElementById('dirt-style');
  if (!style) { style = document.createElement('style'); style.id = 'dirt-style'; document.head.append(style); }
  style.textContent = `.screen.dirt{background-image:url(${dirtUrl})}`;
  animFrames = built.animated.map(a => ({...a, at: -1}));
}
let animFrames = [], skinSizes = {}, greyArmor = {};

// ---------- HUD pictures (our own) ----------
function sprite9(rows, pal) {
  const c = document.createElement('canvas'); c.width = c.height = 9;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}
const HEART = ['.oo...oo.', 'oRRo.oRRo', 'oRWRoRRRo', 'oRRRRRRRo', 'oRRRRRRRo', '.oRRRRRo.', '..oRRRo..', '...oRo...', '....o....'];
const FOOD = ['....ooo..', '...oMMMo.', '..oMMWMMo', '..oMMMMMo', '..oMMMMo.', '.oBoMMo..', 'oBBo.oo..', 'oBo......', '.o.......'];
const AIR = ['..ooooo..', '.oBBBBBo.', 'oBWWBBBBo', 'oBWBBBBBo', 'oBBBBBBBo', 'oBBBBBBBo', 'oBBBBBBBo', '.oBBBBBo.', '..ooooo..'];
const VEST = ['.oo...oo.', 'oWSo.oSSo', 'oWSSoSSSo', 'oSSSSSSSo', '.oSSSSSo.', '.oSSSSSo.', '.oSSSSSo.', '.oSSSSSo.', '..ooooo..'];
const half = (rows, keepLeft) => rows.map(r => [...r].map((ch, x) => (keepLeft ? x > 4 : x < 4) && ch !== 'o' && ch !== '.' ? 'E' : ch).join(''));
const HUD_PICS = {
  heartFull: sprite9(HEART, {o: '#1b0b0b', R: '#d42a2a', W: '#ff9a9a'}), heartHalf: sprite9(half(HEART, true), {o: '#1b0b0b', R: '#d42a2a', W: '#ff9a9a', E: '#3a1212'}),
  heartEmpty: sprite9(HEART, {o: '#1b0b0b', R: '#3a1212', W: '#3a1212'}),
  foodFull: sprite9(FOOD, {o: '#2a1406', M: '#b5652a', W: '#e8a060', B: '#efe6d2'}), foodHalf: sprite9(half(FOOD, false), {o: '#2a1406', M: '#b5652a', W: '#e8a060', B: '#efe6d2', E: '#3a2410'}),
  foodEmpty: sprite9(FOOD, {o: '#2a1406', M: '#3a2410', W: '#3a2410', B: '#3a2410'}),
  air: sprite9(AIR, {o: '#0a2a5a', B: '#3a8ee8', W: '#cfe8ff'}),
  armorFull: sprite9(VEST, {o: '#141414', S: '#d6d6d6', W: '#ffffff'}), armorHalf: sprite9(half(VEST, true), {o: '#141414', S: '#d6d6d6', W: '#ffffff', E: '#3c3c3c'}),
  armorEmpty: sprite9(VEST, {o: '#141414', S: '#3c3c3c', W: '#3c3c3c'}),
};
const picUrl = c => c.toDataURL();
const HUD_URL = Object.fromEntries(Object.entries(HUD_PICS).map(([k, c]) => [k, picUrl(c)]));

// ---------- the game ----------
let G = null, paused = true, screens = null, input = null, invUI = null, lastFrame = 0, acc = 0, debugOn = false, hudHidden = false;
const TICK = 50;

function api() {
  return {
    sound: n => play(n), inTavern: () => inTavern, packLabel: () => packLabel, padMode: () => input?.mode === 'pad',
    listWorlds, deleteWorld: id => deleteWorld(id), play: w => startWorld(w), createWorld,
    settings: () => settings, setSetting: (k, v) => { settings[k] = v; saveSettings(); applySetting(k); },
    importPack: async (file, onProgress) => { const p = await readPack(file, onProgress); await savePack(p); await reloadTextures(); return `${p.label}（${p.count} 张贴图）`; },
    removePack: async () => { await removePack(); await reloadTextures(); },
    leave: () => leaveGame(), resume: () => resume(), quit: () => quitToTitle(), respawn: () => respawn(),
    fullscreen: () => toggleFullscreen(), isFull: () => !!document.fullscreenElement, canFull: () => !!document.documentElement.requestFullscreen,
    mode: () => G?.mode, toggleMode: () => { if (!G) return; G.mode = G.mode === 'creative' ? 'survival' : 'creative'; if (G.mode === 'survival') G.body.flying = false; drawHud(true); toast(G.mode === 'creative' ? '换成了创造模式' : '换成了生存模式'); },
  };
}
function applySetting(k) {
  if (k === 'volume') setVolume(settings.volume);
  if (k === 'scale') layout();
  if (k === 'dist' && G) G.worker.postMessage({type: 'center', cx: G.cx, cz: G.cz, radius: settings.dist});
  if (k === 'wave' && G) G.worker.postMessage({type: 'remesh', wave: settings.wave});
}
async function reloadTextures() {
  await loadTextures();
  if (G) { G.worker.postMessage({type: 'remesh', wave: settings.wave}); drawHud(true); }
}

async function createWorld({name, seed, mode}) {
  const s = seed ? seedOf(seed) : Math.floor(Math.random() * 2 ** 31) - 2 ** 30;
  const w = {id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name, seed: s, seedText: seed || String(s), mode, created: Date.now(), played: Date.now(), time: 0, version: 1};
  await saveWorld(w);
  startWorld(w);
}

function startWorld(meta) {
  screens.loading('正在生成世界…', 0);
  const worker = new Worker(new URL('./world.worker.js', import.meta.url), {type: 'module'});
  const sp = meta.player ? null : spawnPoint(meta.seed);
  const start = meta.player || {x: sp.x, y: sp.y, z: sp.z, yaw: 0, pitch: 0};
  const mirror = new Mirror(), body = new Body(mirror), ents = new Entities(mirror);
  Object.assign(body, {x: start.x, y: start.y, z: start.z, yaw: start.yaw || 0, pitch: start.pitch || 0, flying: !!start.flying});
  body.prev = {x: body.x, y: body.y, z: body.z};
  G = {
    meta, worker, mirror, body, ents, mode: meta.mode || 'survival', inv: Inventory.from(meta.inv), hot: start.hot || 0, time: meta.time || 0,
    health: start.health ?? 20, food: start.food ?? 20, sat: start.sat ?? 5, exh: 0, air: 300, tiles: meta.tiles || {}, spawn: meta.spawn || (sp ? {x: sp.x, y: sp.y, z: sp.z} : {x: start.x, y: start.y, z: start.z}),
    needGround: !meta.player, ready: false, meshes: 0, cx: Math.floor(start.x / 16), cz: Math.floor(start.z / 16),
    breaking: null, breakWait: 0, useWait: 0, swing: 0, eating: 0, hurtT: 0, regen: 0, starve: 0, lastHit: 0, walked: 0, stepAt: 0, dead: false, saveAt: performance.now(), hand: new Verts(64), outline: null, target: null,
  };
  ents.load(meta.items);
  ents.onPickup = () => play('pop');
  G.herds = new Set(meta.herds || []);
  G.bedPos = meta.bed || null; G.sleeping = 0;
  G.draw = 0; G.attackWait = 0; G.targetMob = null;
  G.xp = {level: start.xpLevel || 0, prog: start.xpProg || 0, total: start.xpTotal || 0};
  G.weather = {raining: false, thundering: false, rainT: 12000 + Math.floor(Math.random() * 168000), thunderT: 12000 + Math.floor(Math.random() * 168000), rain: 0, thunder: 0, ...meta.weather};
  G.view = 0; G.bodyYaw = body.yaw; G.flash = 0; G.bolts = []; G.tops = new Map();
  // the enchanting table's offers stay the same till something is enchanted (the game's enchanting seed)
  G.enchSeed = start.enchSeed ?? Math.floor(Math.random() * 2 ** 31); G.bobber = null;
  ents.loadOrbs(meta.orbs);
  G.mobs = new Mobs({
    world: mirror, player: body, mode: () => G.mode, daylight: () => environment(G.time).daylight, held: () => held(),
    dark: (x, y, z, spawn) => isDark(x, y, z, spawn), loaded: (x, z) => mirror.has(Math.floor(x), Math.floor(z)),
    hurtPlayer: (n, why, from, kind) => hurt(n, why, from, kind), explode: (x, y, z, power, src) => explode(x, y, z, power, src),
    sound: (name, x, y, z) => soundAt(name, x, y, z), drop: (s, x, y, z) => G.ents.drop(s, x, y, z), give: s => !G.inv.add(s),
    burst: (x, y, z, kind) => G.ents.puff(x, y, z, kind), setBlock: (x, y, z, v) => setBlock(x, y, z, v),
    xp: (n, x, y, z) => G.ents.xp(n, x, y, z), raining: (x, z) => fallsAt(Math.floor(x), Math.floor(z)) === 'rain', looting: () => enchOf(held(), 'looting'),
  });
  G.mobs.load(meta.mobs);
  worker.onmessage = e => onWorker(e.data);
  worker.onerror = e => showError(`世界线程出错：${e.message || e}`);
  worker.postMessage({type: 'init', seed: meta.seed, layers: LAYER, radius: settings.dist, worldId: meta.id, center: [G.cx, G.cz], wave: settings.wave});
  drawHud(true);
}
function onWorker(m) {
  if (!G) return;
  if (m.type === 'column') G.mirror.column(m);
  else if (m.type === 'mesh') { renderer.setSection(m.cx, m.sy, m.cz, m.solid, m.trans); G.meshes++; }
  else if (m.type === 'drop') { G.mirror.drop(m.cx, m.cz); renderer.dropColumn(m.cx, m.cz); }
  else if (m.type === 'drops') for (const [id, n] of m.items) G.ents.drop({id, n}, m.x, m.y, m.z);
  else if (m.type === 'sound') soundAt(m.name, m.x, m.y, m.z);
  else if (m.type === 'herd') {
    // each place has its animals once (a column made again after it went out of range keeps none)
    const k = `${m.cx},${m.cz}`;
    if (G.herds.has(k)) return;
    G.herds.add(k);
    if (G.mobs.count(x => x.def.passive) < 160) for (const [kind, x, y, z] of m.list) G.mobs.add(kind, x, y, z);
  } else if (m.type === 'exploded') {
    for (const [id, n, x, y, z] of m.drops) G.ents.drop({id, n}, x, y, z);
    for (const [x, y, z] of m.tnt) G.mobs.light(x, y, z, 10 + Math.floor(Math.random() * 20));
  } else if (m.type === 'error') console.warn('world:', m.message);
}
/** A sound from somewhere in the world: quieter with distance (gone at 16 blocks). */
function soundAt(name, x, y, z) {
  if (x == null || !G) { play(name); return; }
  const d = Math.hypot(x - G.body.x, y - G.body.y, z - G.body.z);
  if (d < 16) play(name, 0, 1 - d / 16);
}
/** Dark enough for monsters: no block light, and the sky's light (after nightfall) low — for spawning, at most a random 0–7. */
function isDark(x, y, z, spawn = false) {
  // in a thunderstorm the game counts the sky ten levels darker: monsters come out by day
  const [sky, blk] = G.mirror.light(Math.floor(x), Math.floor(y), Math.floor(z)), dim = G.weather.thunder > 0.9 ? 10 : Math.round((1 - environment(G.time).daylight) * 11);
  const lit = Math.max(blk, sky - dim);
  return spawn ? blk === 0 && lit <= Math.floor(Math.random() * 8) : lit <= 7;
}
/** An explosion: the worker breaks the blocks; here what is near is hurt and pushed. */
function explode(x, y, z, power, src) {
  G.worker.postMessage({type: 'explode', x, y, z, power});
  G.mobs.blast(x, y, z, power);
  const b = G.body, dx = b.x - x, dy = b.y + 0.9 - y, dz = b.z - z, d = Math.hypot(dx, dy, dz), r = power * 2;
  if (d < r) {
    const k = 1 - d / r;
    b.vx += dx / (d || 1) * k * 1.2; b.vy += k * 0.6 + 0.1; b.vz += dz / (d || 1) * k * 1.2;
    hurt(Math.floor((k * k + k) / 2 * 7 * r + 1), src ? `被${src.def.zh}炸死了` : '被炸死了', null, 'explosion');
  }
  G.ents.puff(x, y, z, 'explosion');
  soundAt('explode', x, y, z);
  if (d < 16) G.shake = 12 * (1 - d / 16);
}
/** Waits for the ground under the player, then lets them play. */
function checkReady() {
  const b = G.body;
  if (!G.mirror.has(Math.floor(b.x), Math.floor(b.z))) { screens.loading('正在生成世界…', Math.min(0.95, G.meshes / ((settings.dist * 2 + 1) ** 2 * 6))); return false; }
  if (G.needGround) {
    let y = MINY + HEIGHT - 2;
    while (y > MINY && !collisionBoxes(G.mirror.get(Math.floor(b.x), y, Math.floor(b.z)))) y--;
    b.y = y + 1; b.prev.y = b.y; G.spawn.y = b.y; G.needGround = false;
  }
  // the ground around the player is drawn: play (the rest comes in while playing)
  const near = [...renderer.sections.values()].filter(s => Math.abs(s.cx - G.cx) <= 1 && Math.abs(s.cz - G.cz) <= 1).length;
  if (near < 9) { screens.loading('正在生成世界…', Math.min(0.95, 0.3 + near / 12)); return false; }
  G.ready = true;
  screens.hide(); hud.hidden = false; drawHud(true);
  if (!G.meta.player) toast(G.mode === 'creative' ? '创造模式：按 E（或物品栏右边的 ⋯）拿方块，双击跳跃飞起来' : '生存模式：先撸一棵树（按住挖），做工作台吧');
  resume();
  return true;
}

// ---------- play / pause ----------
function resume() {
  if (!G) return;
  paused = false; screens.hide(); input.enabled = true;
  if (input.mode !== 'touch') input.lock();
  tryLandscape();
}
function pause() {
  if (!G || paused) return;
  paused = true; input.enabled = false; input.unlock();
  invUI.hide();
  saveGame();
  screens.pause();
}
async function saveGame() {
  if (!G || !G.ready) return;
  const b = G.body, m = G.meta;
  Object.assign(m, {played: Date.now(), time: G.time, mode: G.mode, inv: G.inv.slots, tiles: G.tiles, items: G.ents.toJSON(), orbs: G.ents.orbsJSON(), spawn: G.spawn, mobs: G.mobs.toJSON(), herds: [...G.herds], bed: G.bedPos, weather: G.weather,
    player: {x: b.x, y: b.y, z: b.z, yaw: b.yaw, pitch: b.pitch, flying: b.flying, health: G.health, food: G.food, sat: G.sat, hot: G.hot, xpLevel: G.xp.level, xpProg: G.xp.prog, xpTotal: G.xp.total, enchSeed: G.enchSeed}});
  try { await saveWorld(m); } catch (e) { toast(`存档没存上：${e.message || e}`); }
  G.worker.postMessage({type: 'flush', id: Date.now()});
}
async function quitToTitle() {
  if (G) { await saveGame(); await new Promise(r => setTimeout(r, 300)); G.worker.terminate(); renderer.clearAll(); }
  G = null; paused = true; input.enabled = false; input.unlock(); hud.hidden = true; invUI.hide();
  screens.title();
}
async function leaveGame() {
  if (G) await quitToTitle();
  parent.postMessage({type: 'st-iphonie-game:close'}, location.origin);
}
function respawn() {
  const b = G.body;
  // at the bed slept in last, while it is there (far away it is not known yet: trust it)
  let p = G.spawn;
  if (G.bedPos) {
    const {x, y, z} = G.bedPos;
    if (!G.mirror.has(x, z) || BLOCKS[G.mirror.get(x, y, z) & 0xFFF]?.shape === 'bed') p = {x: x + 0.5, y: y + 0.6, z: z + 0.5};
    else { G.bedPos = null; toast('你的床不见了，回到了世界出生点'); }
  }
  Object.assign(b, {x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, fall: 0});
  b.prev = {x: b.x, y: b.y, z: b.z};
  Object.assign(G, {health: 20, food: 20, sat: 5, exh: 0, air: 300, dead: false});
  b.dead = false;
  drawHud(true); resume();
}

// ---------- the day ----------
/** Light and colours at a time (ticks, 24000 a day; 0 is sunrise). Rain and thunder darken the sky and the light. */
function environment(time) {
  const f = (time % 24000) / 24000, a = f * Math.PI * 2, el = Math.sin(a);
  const w = G?.weather, rain = w?.rain || 0, thunder = w?.thunder || 0, flash = G?.flash > 0 ? 1 : 0;
  // the game's: the light from the sky goes down to 11/16 in rain and again in a thunderstorm
  const day = Math.max(0, Math.min(1, el * 2.2 + 0.45)) * (1 - rain * 5 / 16) * (1 - thunder * 5 / 16);
  const lerp = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
  const grey = (c, k) => { const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.6; return c.map(v => v * (1 - k) + l * k); };
  const glowAmt = Math.max(0, 1 - Math.abs(el) * 3.2) * (Math.cos(a) > 0 ? 0.9 : 1) * (1 - rain);
  let top = lerp([0.01, 0.015, 0.05], [0.47, 0.65, 1.0], day), horizon = lerp([0.03, 0.04, 0.09], [0.73, 0.83, 1.0], day);
  horizon = lerp(horizon, [0.95, 0.55, 0.3], glowAmt * 0.55);
  const b = G ? BIOMES[G.mirror.biome(Math.floor(G.body.x), Math.floor(G.body.z))] : null;
  if (b?.dry) { top = lerp(top, [0.5, 0.68, 0.95], 0.3 * day); }
  if (b?.cold) { top = lerp(top, [0.55, 0.68, 0.92], 0.25 * day); }
  if (rain) { top = grey(top, rain * 0.75); horizon = grey(horizon, rain * 0.75); }
  if (thunder) { top = grey(top, thunder * 0.5).map(v => v * (1 - thunder * 0.3)); horizon = grey(horizon, thunder * 0.5).map(v => v * (1 - thunder * 0.3)); }
  // a lightning flash lights everything for a moment
  if (flash) { top = lerp(top, [0.85, 0.87, 0.95], 0.75); horizon = lerp(horizon, [0.85, 0.87, 0.95], 0.75); }
  const dayLit = flash ? 1 : day;
  return {
    daylight: dayLit, skyTop: top, horizon, fog: horizon, glow: [1, 0.48, 0.18], glowAmt, sunAngle: a, sunDir: [Math.cos(a), el, 0], stars: Math.max(0, 1 - day * 1.6) * (1 - rain),
    skyLight: lerp([0.62, 0.68, 0.95], [1, 1, 1], dayLit).map((v, i) => v * (1 - glowAmt * 0.15 * (i === 2 ? 1 : 0))),
    cloudColor: lerp([0.08, 0.09, 0.13], [1, 1, 1], day).map(v => v * (1 - rain * 0.45)), moonPhase: Math.floor(time / 24000) % 8, cloudShift: time * 0.03, sunMoon: 1 - rain,
    gamma: settings.gamma, wave: settings.wave, clouds: settings.clouds, time: performance.now() / 1000, flicker: 0.92 + Math.sin(performance.now() / 90) * 0.03 + Math.sin(performance.now() / 37) * 0.02,
  };
}

// ---------- weather ----------
/** What falls on a column now: 'rain', 'snow' (cold places) or null (dry places, or no rain). */
function fallsAt(x, z) {
  if (!G || G.weather.rain < 0.2) return null;
  const b = BIOMES[G.mirror.biome(x, z)];
  return b?.dry ? null : b?.cold ? 'snow' : 'rain';
}
/** The highest block that stops rain on a column (cached for a second), +1. */
function topAt(x, z) {
  const k = `${x},${z}`, c = G.tops.get(k);
  if (c && G.time - c[1] < 20) return c[0];
  let y = Math.min(MINY + HEIGHT - 1, Math.floor(G.body.y) + 40);
  while (y > MINY && !G.mirror.get(x, y, z)) y--;
  G.tops.set(k, [y + 1, G.time]);
  return y + 1;
}
/** The game's cycle: clear for half a day to a week, rain for half a day to a day; thunder on its own clock, only while it rains. */
function weatherTick() {
  const w = G.weather, rnd = n => Math.floor(Math.random() * n);
  if (--w.thunderT <= 0) { w.thundering = !w.thundering; w.thunderT = w.thundering ? 3600 + rnd(12000) : 12000 + rnd(168000); }
  if (--w.rainT <= 0) { w.raining = !w.raining; w.rainT = w.raining ? 12000 + rnd(12000) : 12000 + rnd(168000); }
  const toward = (v, t) => v < t ? Math.min(t, v + 0.01) : Math.max(t, v - 0.01);
  w.rain = toward(w.rain, w.raining ? 1 : 0); w.thunder = toward(w.thunder, w.raining && w.thundering ? 1 : 0);
  if (G.tops.size > 4000) G.tops.clear();
  if (G.flash > 0) G.flash--;
  for (let i = G.bolts.length - 1; i >= 0; i--) if (--G.bolts[i].life <= 0) G.bolts.splice(i, 1);
  // lightning now and then in a thunderstorm, somewhere it rains within 48 blocks
  if (w.thunder > 0.9 && Math.random() < 1 / 300) {
    const x = Math.floor(G.body.x + (Math.random() - 0.5) * 96), z = Math.floor(G.body.z + (Math.random() - 0.5) * 96);
    if (G.mirror.has(x, z) && fallsAt(x, z) === 'rain') strike(x + 0.5, topAt(x, z), z + 0.5);
  }
  // the hiss of rain, quieter under a roof
  const b = G.body, open = G.mirror.light(Math.floor(b.x), Math.floor(b.y + b.eye), Math.floor(b.z))[0] >= 14;
  setRain(fallsAt(Math.floor(b.x), Math.floor(b.z)) === 'rain' ? w.rain * (open ? 1 : 0.3) : 0);
}
/** A lightning strike: a bolt, a flash, thunder; what is within three blocks is hit. */
function strike(x, y, z) {
  G.bolts.push({x, y, z, life: 8, seed: 1 + Math.floor(Math.random() * 1e6)});
  G.flash = 3;
  const b = G.body, d = Math.hypot(b.x - x, b.z - z);
  play('thunder', 0, Math.max(0.35, 1 - d / 96));
  if (d < 3 && Math.abs(b.y - y) < 4) hurt(5, '被闪电击中了', null, 'lightning');
  for (const m of G.mobs.list) if (!m.dead && Math.hypot(m.x - x, m.z - z) < 3 && Math.abs(m.y - y) < 4) { G.mobs.hurt(m, 5, null, 'lightning'); m.fire = 160; }
}

// ---------- held item, hotbar ----------
const held = () => G.inv.slots[G.hot];
const heldTool = () => { const s = held(); return s ? itemInfo(s.id)?.tool || null : null; };
function useUp(n = 1) { if (G.mode === 'creative') return; const s = held(); if (!s) return; s.n -= n; if (s.n <= 0) G.inv.slots[G.hot] = null; drawHud(true); }
function wearTool(n = 1) {
  if (G.mode === 'creative') return;
  const s = held(), t = s && itemInfo(s.id)?.tool;
  if (!t) return;
  // 耐久: each point of wear may be saved
  for (let k = n; k > 0; k--) if (!wears(s)) n--;
  if (!n) return;
  s.dmg = (s.dmg || 0) + n;
  if (s.dmg >= t.uses) { G.inv.slots[G.hot] = null; play('break', ID.glass); toast(`${zhOf(s.id)}坏了`); }
  drawHud(true);
}

// ---------- breaking and placing ----------
function setBlock(x, y, z, v) { G.worker.postMessage(G.mirror.set(x, y, z, v)); }
function breakBlock(t) {
  const {x, y, z, v} = t, b = BLOCKS[v & 0xFFF], survival = G.mode !== 'creative';
  // ice over something becomes water when broken (unless creative)
  const below = G.mirror.get(x, y - 1, z);
  setBlock(x, y, z, survival && b.name === 'ice' && below && collisionBoxes(below) ? ID.water : 0);
  // shears take leaves whole
  if (survival && heldTool()?.kind === 'shears' && b.name.endsWith('_leaves')) G.ents.drop({id: b.name, n: 1}, x + 0.5, y + 0.4, z + 0.5);
  else if (survival && harvests(b, heldTool())) {
    // 精准采集 takes the block itself (and no experience); 时运 gives ores more (the game's: ×1 up to ×level+1, redstone +0–level)
    const tool = held(), silk = enchOf(tool, 'silk_touch') && b.item, fortune = enchOf(tool, 'fortune');
    const drops = silk ? [[b.name, 1]] : dropsOf(b, v >>> 12).map(([id, n]) => !fortune || !b.name.endsWith('_ore') || id === b.name ? [id, n]
      : [id, /redstone/.test(b.name) ? n + Math.floor(Math.random() * (fortune + 1)) : n * (Math.max(0, Math.floor(Math.random() * (fortune + 2)) - 1) + 1)]);
    for (const [id, n] of drops) G.ents.drop({id, n}, x + 0.5, y + 0.4, z + 0.5);  // a door or a bed goes whole
    if (b.xp && !silk) G.ents.xp(b.xp[0] + Math.floor(Math.random() * (b.xp[1] - b.xp[0] + 1)), x + 0.5, y + 0.5, z + 0.5);
  }
  if (b.shape === 'door' || b.shape === 'bed') { const [ox, oy, oz] = partnerOf(x, y, z, v); if ((G.mirror.get(ox, oy, oz) & 0xFFF) === b.id) setBlock(ox, oy, oz, 0); }
  // what was inside goes out
  const k = `${x},${y},${z}`, tile = G.tiles[k];
  if (tile) { for (const s of tile.slots || [tile.input, tile.fuel, tile.output]) if (s) G.ents.drop(s, x + 0.5, y + 0.5, z + 0.5); delete G.tiles[k]; }
  G.ents.burst(x, y, z, v, 28);
  play('break', v);
  if (survival) { if (b.hard > 0) wearTool(); G.exh += 0.005; }
}
/** Which way the player faces (0 south, 1 west, 2 north, 3 east) — a block placed faces back at them. */
function facingBack() { const y = ((G.body.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); const q = Math.round(y / (Math.PI / 2)) % 4; return [0, 3, 2, 1][q]; }
function placeFrom(t, stack) {
  const info = itemInfo(stack.id), b = info?.block;
  const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
  const tb = BLOCKS[t.v & 0xFFF];
  // slabs join into a double one, snow layers stack up
  if (b?.shape === 'slab' && (t.v & 0xFFF) === b.id && t.v >>> 12 !== 2 && ((t.face === 2 && t.v >>> 12 === 0) || (t.face === 3 && t.v >>> 12 === 1))) { setBlock(t.x, t.y, t.z, withMeta(b.id, 2)); return true; }
  if (b?.name === 'snow' && (t.v & 0xFFF) === b.id && (t.v >>> 12) < 7) { setBlock(t.x, t.y, t.z, withMeta(b.id, (t.v >>> 12) + 1)); return true; }
  let x = t.x, y = t.y, z = t.z;
  if (!tb.replace || (tb.id === (b?.id ?? -1))) { x += nx; y += ny; z += nz; }
  if (y < MINY || y >= MINY + HEIGHT) return false;
  const here = G.mirror.get(x, y, z);
  if (here && !BLOCKS[here & 0xFFF].replace) return false;
  let v;
  const pf = (facingBack() + 2) % 4; // the way the player looks
  // two blocks: a door (and its upper half), a bed (and its head the way the player looks)
  if (b?.shape === 'door' || b?.shape === 'bed') {
    const [dx, dz] = b.shape === 'bed' ? DIR[pf] : [0, 0], ox = x + dx, oy = b.shape === 'door' ? y + 1 : y, oz = z + dz, other = G.mirror.get(ox, oy, oz);
    if (other && !BLOCKS[other & 0xFFF].replace) return false;
    if (!collisionBoxes(G.mirror.get(x, y - 1, z)) || (b.shape === 'bed' && !collisionBoxes(G.mirror.get(ox, y - 1, oz)))) return false;
    const m = b.shape === 'door' ? facingBack() : pf;
    setBlock(x, y, z, withMeta(b.id, m)); setBlock(ox, oy, oz, withMeta(b.id, m | (b.shape === 'door' ? 8 : 4)));
    play('place', ID.oak_planks);
    return true;
  }
  if (info.plant) { if ((G.mirror.get(x, y - 1, z) & 0xFFF) !== ID.farmland) return false; v = ID[info.plant]; }
  else if (!b) return false;
  else {
    let meta = 0;
    if (b.axis) meta = t.face <= 1 ? 1 : t.face >= 4 ? 2 : 0;
    if (b.facing && b.shape !== 'wall') meta = facingBack();
    const upper = t.face === 3 || (t.face !== 2 && t.hit[1] - Math.floor(t.hit[1]) > 0.5);
    if (b.shape === 'stairs') meta = pf | (upper ? 4 : 0);
    if (b.shape === 'gate') meta = pf;
    // a trapdoor hangs on the side it was put against (on a floor or ceiling: the side towards the player)
    if (b.shape === 'trapdoor') meta = (t.face === 2 || t.face === 3 ? facingBack() : {0: 1, 1: 3, 4: 2, 5: 0}[t.face]) | (upper ? 8 : 0);
    if (b.shape === 'torch') { if (t.face === 3) return false; meta = t.face === 2 ? 0 : [2, 1, 0, 0, 4, 3][t.face]; }
    if (b.shape === 'wall') { if (t.face >= 2 && t.face <= 3) return false; meta = [3, 1, 0, 0, 0, 2][t.face]; }
    if (b.shape === 'slab') meta = t.face === 3 || (t.face !== 2 && t.hit[1] - Math.floor(t.hit[1]) > 0.5) ? 1 : 0;
    if (b.name.endsWith('_leaves')) meta = 1;
    // plants need their ground
    const under = G.mirror.get(x, y - 1, z) & 0xFFF, ub = BLOCKS[under];
    if (b.shape === 'cross' && !['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'farmland', 'moss_block', 'mud', 'sand', 'red_sand'].includes(ub.name) && !(b.name === 'sugar_cane' && under === ID.sugar_cane) && !(b.name.endsWith('mushroom') && ub.opaque)) return false;
    if (b.name === 'cactus' && !['sand', 'red_sand', 'cactus'].includes(ub.name)) return false;
    if ((b.shape === 'torch' && meta === 0) && !ub.opaque && ub.shape !== 'slab') return false;
    v = withMeta(b.id, meta);
    // not inside the player
    const boxes = collisionBoxes(v), [x0, y0, z0, x1, y1, z1] = G.body.aabb();
    if (boxes && boxes.some(q => x + q[0] < x1 && x + q[3] > x0 && y + q[1] < y1 && y + q[4] > y0 && z + q[2] < z1 && z + q[5] > z0)) return false;
  }
  setBlock(x, y, z, v);
  if (b?.use === 'furnace') G.tiles[`${x},${y},${z}`] = {kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0};
  if (b?.use === 'chest') G.tiles[`${x},${y},${z}`] = {kind: 'chest', slots: new Array(27).fill(null)};
  if (b?.use === 'enchant') G.tiles[`${x},${y},${z}`] = {kind: 'enchant'};
  play('place', v);
  return true;
}
/** The use action (right click / tap / LT) on what is aimed at: a mob (feed, shear; a tap on a phone hits), or a block. */
function use(t, mob = null) {
  const s = held(), info = s ? itemInfo(s.id) : null, b = t ? BLOCKS[t.v & 0xFFF] : null;
  if (info?.tool?.kind === 'bow') return;
  G.swing = 6;
  if (mob) {
    if (s && mob.def.breed?.includes(s.id) && !mob.baby && !mob.love && !mob.loveWait) { mob.love = 600; useUp(); G.ents.puff(mob.x, mob.y + 1, mob.z, 'heart'); return; }
    if (s && mob.def.breed?.includes(s.id) && mob.baby) { mob.grow += 2400; useUp(); G.ents.puff(mob.x, mob.y + 0.6, mob.z, 'meal'); return; }
    if (info?.tool?.kind === 'shears' && mob.kind === 'sheep' && !mob.sheared && !mob.baby) {
      mob.sheared = true; const n = 1 + Math.floor(Math.random() * 3);
      G.ents.drop({id: `${mob.color || 'white'}_wool`, n}, mob.x, mob.y + 1, mob.z); wearTool(); play('shear'); return;
    }
    if (input.mode === 'touch') attackMob(mob);
    return;
  }
  if (t && b.use === 'toggle' && !G.body.sneaking) { toggle(t); return; }
  if (t && b.use === 'bed' && !G.body.sneaking) { sleepIn(t); return; }
  if (t && b.use && !G.body.sneaking) { openBlock(b.use, t); return; }
  // armour in the hand is put on
  if (info?.armor) { wearHeld(); return; }
  // a fishing rod casts, or reels in what is on the line
  if (info?.tool?.kind === 'rod') { if (G.bobber) reel(); else cast(); return; }
  // seeds, carrots, potatoes on farmland are planted (before being eaten)
  if (t && info?.plant && (t.v & 0xFFF) === ID.farmland && t.face === 2) { if (placeFrom(t, s)) useUp(); return; }
  // bone meal, a lighter on TNT
  if (t && info?.meal) {
    const id = t.v & 0xFFF, grows = (['wheat', 'carrots', 'potatoes'].includes(b.name) && (t.v >>> 12) < 7) || b.name.endsWith('_sapling') || (id === ID.grass_block && !G.mirror.get(t.x, t.y + 1, t.z));
    if (grows) { G.worker.postMessage({type: 'meal', x: t.x, y: t.y, z: t.z}); useUp(); G.ents.puff(t.x + 0.5, t.y + 1, t.z + 0.5, 'meal'); play('meal'); }
    return;
  }
  if (t && info?.tool?.kind === 'fire') { if (b.name === 'tnt') { setBlock(t.x, t.y, t.z, 0); G.mobs.light(t.x, t.y, t.z); } play('ignite'); wearTool(); return; }
  if (info?.food && G.mode !== 'creative' && G.food < 20) { G.eating = 32; return; }
  if (s && (s.id === 'bucket' || info?.pour)) {
    const eye = eyePos(), dir = aimDir(), lt = raycast(G.mirror, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach(), true);
    if (s.id === 'bucket' && lt && [ID.water, ID.lava].includes(lt.v & 0xFFF) && !(lt.v >>> 12)) {
      setBlock(lt.x, lt.y, lt.z, 0);
      const full = {id: (lt.v & 0xFFF) === ID.water ? 'water_bucket' : 'lava_bucket', n: 1};
      if (G.mode !== 'creative') { useUp(); const left = G.inv.add(full); if (left) G.ents.drop(left, G.body.x, G.body.y + 1, G.body.z); }
      play('splash'); drawHud(true); return;
    }
    if (info?.pour && t) {
      const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
      const x = b.replace ? t.x : t.x + nx, y = b.replace ? t.y : t.y + ny, z = b.replace ? t.z : t.z + nz, here = G.mirror.get(x, y, z);
      if (here && !BLOCKS[here & 0xFFF].replace) return;
      setBlock(x, y, z, ID[info.pour]);
      if (G.mode !== 'creative') { G.inv.slots[G.hot] = {id: 'bucket', n: 1}; drawHud(true); }
      play('splash'); return;
    }
  }
  if (!t) return;
  // a hoe makes farmland
  if (info?.tool?.kind === 'hoe' && t.face === 2 && ['grass_block', 'dirt'].includes(b.name) && !G.mirror.get(t.x, t.y + 1, t.z)) { setBlock(t.x, t.y, t.z, ID.farmland); wearTool(); play('place', ID.dirt); return; }
  if (s && (info.block?.item || info.plant)) { if (placeFrom(t, s)) useUp(); }
}
// ---------- fishing ----------
/** Throws the bobber the way the player looks. */
function cast() {
  const d = G.body.look(), eye = eyePos();
  G.bobber = {x: eye[0] + d[0] * 0.3, y: eye[1] - 0.1, z: eye[2] + d[2] * 0.3, vx: d[0] * 0.9 + (Math.random() - 0.5) * 0.04, vy: d[1] * 0.9 + 0.12, vz: d[2] * 0.9 + (Math.random() - 0.5) * 0.04, state: 'fly', wait: 0, near: 0, bite: 0, age: 0};
  G.swing = 6; play('cast');
}
/** How long till a fish comes (the game's 5–30 seconds, 5 less for each level of 饵钓). */
const fishWait = () => Math.max(20, 100 + Math.floor(Math.random() * 500) - enchOf(held(), 'lure') * 100);
/** Reels in: on a bite, the catch flies to the player (and experience); stuck in the ground it costs two uses. */
function reel() {
  const f = G.bobber, b = G.body;
  G.bobber = null; G.swing = 6; play('reel');
  if (f?.state === 'water' && f.bite > 0) {
    const {stack, xp} = fishLoot(enchOf(held(), 'luck_of_the_sea'), seeded(Math.floor(Math.random() * 2 ** 31)));
    G.ents.drop(stack, f.x, f.y + 0.3, f.z, {delay: 0});
    const it = G.ents.items.at(-1), dx = b.x - f.x, dy = b.y + 1 - f.y, dz = b.z - f.z;
    Object.assign(it, {vx: dx * 0.1, vy: dy * 0.1 + Math.sqrt(Math.hypot(dx, dy, dz)) * 0.08, vz: dz * 0.1});
    G.ents.xp(xp, b.x, b.y + 0.5, b.z);
    wearTool(1);
  } else if (f?.state === 'ground') wearTool(2);
}
/** The bobber flies, floats, waits; a fish comes (bubbles), bites (it dips, a splash) and gets away if not reeled in. */
function bobberTick() {
  const f = G.bobber, b = G.body;
  if (!f) return;
  if (itemInfo(held()?.id)?.tool?.kind !== 'rod' || G.dead || Math.hypot(f.x - b.x, f.y - b.y, f.z - b.z) > 32) { G.bobber = null; return; }
  f.age++;
  const water = (x, y, z) => (G.mirror.get(Math.floor(x), Math.floor(y), Math.floor(z)) & 0xFFF) === ID.water;
  if (f.state === 'fly' || f.state === 'ground') {
    if (f.state === 'ground') { if (collisionBoxes(G.mirror.get(Math.floor(f.x), Math.floor(f.y - 0.05), Math.floor(f.z)))) return; f.state = 'fly'; }
    f.vy -= 0.03;
    const nx = f.x + f.vx, ny = f.y + f.vy, nz = f.z + f.vz;
    if (water(nx, ny, nz)) { Object.assign(f, {x: nx, y: ny, z: nz, state: 'water', wait: fishWait()}); G.ents.puff(nx, ny + 0.3, nz, 'splash'); play('bite', 0, 0.4); return; }
    if (collisionBoxes(G.mirror.get(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) { Object.assign(f, {state: 'ground', vx: 0, vy: 0, vz: 0}); return; }
    Object.assign(f, {x: nx, y: ny, z: nz, vx: f.vx * 0.92, vy: f.vy * 0.92, vz: f.vz * 0.92});
    return;
  }
  // floating: on the surface, a little lower while a fish pulls
  let top = Math.floor(f.y);
  while (water(f.x, top + 1, f.z)) top++;
  if (!water(f.x, top, f.z)) { f.state = 'fly'; return; }
  const want = top + 0.85 - (f.bite > 0 ? 0.25 : 0) + Math.sin(f.age * 0.15) * 0.02;
  f.y += (want - f.y) * 0.3; f.x += f.vx; f.z += f.vz; f.vx *= 0.8; f.vz *= 0.8;
  if (f.bite > 0) { if (--f.bite === 0) f.wait = fishWait(); return; }
  if (f.near > 0) {
    // a fish swimming up: a trail of bubbles coming closer
    const a = f.age * 0.3, r = f.near / 15;
    if (f.age % 2 === 0) G.ents.puff(f.x + Math.cos(a) * r, top + 0.9, f.z + Math.sin(a) * r, 'bubble');
    if (--f.near === 0) { f.bite = 20 + Math.floor(Math.random() * 20); play('bite'); G.ents.puff(f.x, top + 1, f.z, 'splash'); }
    return;
  }
  // rain brings them sooner
  if (fallsAt(Math.floor(f.x), Math.floor(f.z)) === 'rain' && Math.random() < 0.25) f.wait--;
  if (--f.wait <= 0) f.near = 20 + Math.floor(Math.random() * 60);
}
/** Opens or shuts a door (both halves), a gate or a trapdoor. */
function toggle(t) {
  const b = BLOCKS[t.v & 0xFFF], m = t.v >>> 12;
  setBlock(t.x, t.y, t.z, withMeta(b.id, m ^ 4));
  if (b.shape === 'door') { const oy = m & 8 ? t.y - 1 : t.y + 1, o = G.mirror.get(t.x, oy, t.z); if ((o & 0xFFF) === b.id) setBlock(t.x, oy, t.z, withMeta(b.id, (o >>> 12) ^ 4)); }
  play('place', ID.oak_planks);
}
/** The other half of a door (above / below) or a bed (head / foot). */
function partnerOf(x, y, z, v) {
  const m = v >>> 12;
  if (BLOCKS[v & 0xFFF].shape === 'door') return [x, m & 8 ? y - 1 : y + 1, z];
  const [dx, dz] = DIR[m & 3], s = m & 4 ? -1 : 1;
  return [x + dx * s, y, z + dz * s];
}
/** A bed: the place to wake up from now on; at night (and no monster near) sleep till morning. */
function sleepIn(t) {
  const day = ((G.time % 24000) + 24000) % 24000, night = (day >= 12542 && day <= 23459) || G.weather.thunder > 0.9;
  if (!G.bedPos || G.bedPos.x !== t.x || G.bedPos.y !== t.y || G.bedPos.z !== t.z) { G.bedPos = {x: t.x, y: t.y, z: t.z}; toast('已设置重生点'); }
  if (!night) { toast('你只能在夜里或雷雨天睡觉'); return; }
  if (G.mobs.list.some(m => m.def.hostile && !m.dead && Math.hypot(m.x - t.x - 0.5, m.y - t.y, m.z - t.z - 0.5) < 8)) { toast('现在不能休息，周围有怪物在游荡'); return; }
  const b = G.body;
  Object.assign(b, {x: t.x + 0.5, y: t.y + 0.5625, z: t.z + 0.5, vx: 0, vy: 0, vz: 0});
  b.prev = {x: b.x, y: b.y, z: b.z};
  G.sleeping = 1;
}
function openBlock(kind, t) {
  const k = `${t.x},${t.y},${t.z}`;
  input.enabled = false; input.unlock();
  if (kind === 'crafting') invUI.show('crafting');
  if (kind === 'furnace') invUI.show('furnace', G.tiles[k] ||= {kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0});
  if (kind === 'chest') invUI.show('chest', G.tiles[k] ||= {kind: 'chest', slots: new Array(27).fill(null)});
  if (kind === 'enchant') { G.tiles[k] ||= {kind: 'enchant'}; invUI.show('enchant', {pos: {x: t.x, y: t.y, z: t.z}, shelves: shelvesAround((x, y, z) => G.mirror.get(x, y, z), t.x, t.y, t.z, ID.bookshelf)}); }
  if (kind === 'anvil') invUI.show('anvil', {pos: {x: t.x, y: t.y, z: t.z}});
}
/** An anvil used: one time in eight-ish (12%) it wears a step (new → chipped → damaged → gone). */
function anvilUsed() {
  play('anvil');
  const p = invUI.data?.pos;
  if (!p || G.mode === 'creative' || Math.random() >= 0.12) return;
  const v = G.mirror.get(p.x, p.y, p.z), next = {[ID.anvil]: ID.chipped_anvil, [ID.chipped_anvil]: ID.damaged_anvil, [ID.damaged_anvil]: 0}[v & 0xFFF];
  if (next === undefined) return;
  setBlock(p.x, p.y, p.z, next ? withMeta(next, v >>> 12) : 0);
  if (!next) { play('anvil_break'); invUI.hide(); toast('铁砧碎了'); }
}
function openInventory() {
  if (!G || G.dead) return;
  input.enabled = false; input.unlock();
  invUI.show(G.mode === 'creative' ? 'creative' : 'player');
}
function closedInventory() { drawHud(true); if (G && !paused) { input.enabled = true; if (input.mode !== 'touch') input.lock(); } }

// ---------- aiming ----------
const reach = () => G.mode === 'creative' ? 5 : 4.5;
function eyePos() { const b = G.body; return [b.x, b.y + b.eye, b.z]; }
/** The direction aimed: the crosshair, straight ahead from the eye (also on phones and in third person). */
const aimDir = () => G.body.look();

// ---------- survival ----------
/**
 * kind: what hurt ('hit', 'arrow', 'explosion', 'fall', 'lava', 'fire', 'cactus', 'lightning', 'drown', 'starve',
 * 'void'). Armour does not stop falling, drowning, hunger or the void; the protection enchantments then take their
 * share (the special ones only of their kind). A monster's hit may meet thorns.
 */
const PIERCE = new Set(['fall', 'drown', 'starve', 'void']);
function hurt(n, why, from = null, kind = 'hit') {
  if (G.mode === 'creative' || G.dead || n <= 0) return;
  // a moment after a hit nothing hurts again (a stronger hit only adds what it has more)
  if (G.invuln > 0) { if (n <= G.lastDmg) return; const extra = n - G.lastDmg; G.lastDmg = n; n = extra; }
  else { G.invuln = 10; G.lastDmg = n; }
  const worn = [0, 1, 2, 3].map(i => G.inv.worn(i));
  if (!PIERCE.has(kind)) {
    const {points, tough} = G.inv.armor();
    if (points) { wearArmor(n); n = throughArmor(n, points, tough); }
  }
  n *= protectionFactor(worn, kind);
  if (kind === 'hit' && from?.def) for (const s of worn) { const l = enchOf(s, 'thorns'); if (l && Math.random() < 0.15 * l) G.mobs.hurt(from, 1 + Math.floor(Math.random() * 4), {x: G.body.x, z: G.body.z, player: true}); }
  G.health = Math.max(0, G.health - n); G.hurtT = 10; G.exh += 0.1;
  if (from) { const b = G.body, a = Math.atan2(b.x - from.x, b.z - from.z); b.vx += Math.sin(a) * 0.4; b.vz += Math.cos(a) * 0.4; if (b.onGround) b.vy = 0.36; }
  play('hurt'); drawHud(true);
  if (G.health <= 0) die(why);
}
/** Each worn piece takes a quarter of the hit (at least 1) off its uses, and breaks when they run out. */
function wearArmor(dmg) {
  for (let i = 0; i < 4; i++) {
    const s = G.inv.worn(i), a = s && itemInfo(s.id)?.armor;
    if (!a || !wears(s, Math.random, true)) continue;
    s.dmg = (s.dmg || 0) + Math.max(1, Math.floor(dmg / 4));
    if (s.dmg >= a.uses) { G.inv.slots[ARMOR_AT + i] = null; play('break', ID.glass); toast(`${zhOf(s.id)}坏了`); }
  }
}
/** Puts on what is held (in its slot; what was worn there comes into the hand). */
function wearHeld() {
  if (!G.inv.wear(G.hot)) return false;
  play('equip'); drawHud(true);
  return true;
}
/** Experience gained: the bar fills, levels go up (the game's amounts per level), a chime every five levels. */
function gainXp(n) {
  // 经验修补: a worn or held piece with it takes the orb first, two uses mended a point
  const menders = [held(), ...[0, 1, 2, 3].map(i => G.inv.worn(i))].filter(s => s?.dmg > 0 && enchOf(s, 'mending'));
  if (menders.length) {
    const s = menders[Math.floor(Math.random() * menders.length)], fix = Math.min(s.dmg, n * 2);
    s.dmg -= fix; if (!s.dmg) delete s.dmg;
    n -= Math.ceil(fix / 2);
    drawHud(true);
    if (n <= 0) { play('orb'); return; }
  }
  const was = G.xp.level;
  G.xp = addXp(G.xp, n);
  play('orb');
  if (G.xp.level > was && G.xp.level % 5 === 0) play('levelup');
  drawHud(true);
}
/** The player hits a mob: the held thing's damage, more when falling (a critical hit), the knock away. */
function attackMob(m) {
  if (G.attackWait > 0 || m.dead) return;
  const b = G.body, s = held(), crit = !b.onGround && b.vy < 0 && !b.inWater && !b.climbing;
  let dmg = damageOf(s?.id) * (crit ? 1.5 : 1);
  if (G.mode === 'creative' && !s) dmg = Math.max(dmg, 1);
  // 锋利 half a point a level and a half more; 亡灵杀手 and 节肢杀手 2.5 a level on their own kind
  const sharp = enchOf(s, 'sharpness'), smite = m.def.undead ? enchOf(s, 'smite') : 0, bane = m.kind === 'spider' ? enchOf(s, 'bane_of_arthropods') : 0;
  dmg += (sharp ? sharp * 0.5 + 0.5 : 0) + smite * 2.5 + bane * 2.5;
  const hit = G.mobs.hurt(m, dmg, {x: b.x, z: b.z, player: true, knock: (b.sprinting ? 0.9 : 0.4) + enchOf(s, 'knockback') * 0.5});
  G.attackWait = 8; G.swing = 6; G.exh += 0.1;
  if (hit) {
    play('attack', 0, 1);
    if (crit) G.ents.puff(m.x, m.y + m.body.height * 0.7, m.z, 'crit');
    if (sharp || smite || bane) G.ents.puff(m.x, m.y + m.body.height * 0.7, m.z, 'magic');
    const fire = enchOf(s, 'fire_aspect');
    if (fire) m.fire = Math.max(m.fire, 80 * fire);
    const kind = itemInfo(s?.id)?.tool?.kind;
    if (kind) wearTool(kind === 'sword' ? 1 : 2);
  }
  if (b.sprinting) b.sprinting = false;
}
function die(why) {
  G.dead = true; G.body.dead = true; paused = true; input.enabled = false; input.unlock(); invUI.hide();
  const b = G.body;
  for (let i = 0; i < G.inv.slots.length; i++) if (G.inv.slots[i]) { G.ents.drop(G.inv.slots[i], b.x, b.y + 1, b.z); G.inv.slots[i] = null; }
  // experience: seven points a level fall out (at most a hundred), the rest is lost
  G.ents.xp(Math.min(100, G.xp.level * 7), b.x, b.y + 1, b.z);
  G.xp = {level: 0, prog: 0, total: 0};
  drawHud(true);
  screens.dead(why);
}
function survivalTick(r) {
  const b = G.body;
  if (G.mode === 'creative') { G.health = 20; G.food = 20; G.air = 300; return; }
  if (r.landed > 3 && !b.inWater) hurt(Math.ceil(r.landed - 3), '摔得太重了', null, 'fall');
  if (r.landed > 2) play('fall', 0, Math.min(1, r.landed / 8));
  // air
  if (b.headInWater) { if (Math.random() < 1 / (enchOf(G.inv.worn(0), 'respiration') + 1)) G.air--; if (G.air <= -20) { G.air = 0; hurt(2, '淹死了', null, 'drown'); } } else G.air = Math.min(300, G.air + 4);
  if ((b.inLava) && G.time % 10 === 0) hurt(4, '掉进了岩浆', null, 'lava');
  if (b.touchCactus && G.time % 10 === 0) hurt(1, '被仙人掌扎死了', null, 'cactus');
  if (b.y < MINY - 64 && G.time % 10 === 0) hurt(4, '掉出了世界', null, 'void');
  // hunger
  if (b.sprinting) G.exh += 0.1 * Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
  if (r.jumped) G.exh += b.sprinting ? 0.2 : 0.05;
  if (G.exh >= 4) { G.exh -= 4; if (G.sat > 0) G.sat = Math.max(0, G.sat - 1); else { G.food = Math.max(0, G.food - 1); drawHud(true); } }
  if (G.food >= 18 && G.health < 20) { if (++G.regen >= (G.food >= 20 && G.sat > 0 ? 10 : 80)) { G.regen = 0; G.health = Math.min(20, G.health + 1); G.exh += 6; drawHud(true); } } else G.regen = 0;
  if (G.food <= 0) { if (++G.starve >= 80) { G.starve = 0; if (G.health > 1) hurt(1, '饿死了', null, 'starve'); } } else G.starve = 0;
  if (G.food <= 6) b.sprinting = false;
}
function eatTick() {
  if (!G.eating) return;
  const s = held(), info = s && itemInfo(s.id);
  if (!info?.food) { G.eating = 0; return; }
  if (G.eating % 4 === 0) play('eat');
  if (--G.eating === 0) {
    G.food = Math.min(20, G.food + info.food); G.sat = Math.min(G.food, G.sat + (info.sat || info.food * 0.6));
    useUp(); if (s.id === 'mushroom_stew') G.inv.add({id: 'bowl', n: 1});
    play('burp'); drawHud(true);
  }
}

// ---------- one tick (20 a second) ----------
let ctl = {fwd: 0, side: 0, jump: false, sneak: false, sprint: false, attack: false, use: false, aim: null};
function tick() {
  const b = G.body;
  G.time++;
  // asleep: the screen goes dark; after five seconds it is morning
  if (G.sleeping && ++G.sleeping >= 100) {
    G.time = Math.ceil(G.time / 24000) * 24000; G.sleeping = 0; toast('天亮了');
    // waking up, the rain has stopped
    const w = G.weather;
    if (w.raining || w.thundering) Object.assign(w, {raining: false, thundering: false, rain: 0, thunder: 0, rainT: 12000 + Math.floor(Math.random() * 168000), thunderT: 12000 + Math.floor(Math.random() * 168000)});
  }
  const r = b.tick(G.sleeping ? {} : {...ctl, autoJump: ctl.autoJump && settings.autoJump, flyStay: false});
  if (G.mode !== 'creative' && b.flying) b.flying = false;
  input.setFlying(b.flying);
  // steps
  const moved = Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
  if (b.onGround && !b.sneaking) { G.walked += moved; if (G.walked - G.stepAt > 1.6) { G.stepAt = G.walked; play('step', G.mirror.get(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z))); } }
  if (b.inWater && moved > 0.05 && G.time % 12 === 0) play('swim');
  survivalTick(r);
  eatTick();
  if (G.attackWait > 0) G.attackWait--;
  if (G.invuln > 0) G.invuln--;
  // a bow: held use draws it (on a phone: holding the screen), letting go shoots
  const bow = itemInfo(held()?.id)?.tool?.kind === 'bow';
  if (bow && !G.dead && (ctl.use || (input.mode === 'touch' && ctl.attack))) { if (G.mode === 'creative' || G.inv.count('arrow') > 0) G.draw++; }
  else if (G.draw > 0) {
    const f = Math.min(1, G.draw / 20), power = Math.min(1, (f * f + f * 2) / 3);
    if (power >= 0.1) {
      // 无限: the arrow is not used up (and cannot be picked up)
      const bowItem = held(), infinite = G.mode === 'creative' || enchOf(bowItem, 'infinity') > 0;
      G.mobs.shootFromPlayer(b, b.look(), power, !infinite, {strength: enchOf(bowItem, 'power'), punch: enchOf(bowItem, 'punch'), flame: enchOf(bowItem, 'flame')});
      if (!infinite) { const i = G.inv.slots.findIndex(s => s?.id === 'arrow'); if (i >= 0) G.inv.take(i, 1); }
      wearTool(); play('bow');
    }
    G.draw = 0;
  }
  // hitting a mob, else breaking
  const t = G.target;
  if (G.breakWait > 0) G.breakWait--;
  if (ctl.attack && G.targetMob && !G.dead && !bow) { attackMob(G.targetMob); G.breaking = null; }
  else if (ctl.attack && t && !G.dead && !bow) {
    // digging swings the arm over and over: a new swing once the last is half way (as the game does)
    if (G.swing <= 3) G.swing = 7;
    if (G.mode === 'creative') { if (!G.breakWait) { breakBlock(t); G.breakWait = 6; } G.breaking = null; }
    else {
      const bk = G.breaking, same = bk && bk.x === t.x && bk.y === t.y && bk.z === t.z && bk.v === t.v;
      if (!same) G.breaking = {x: t.x, y: t.y, z: t.z, v: t.v, p: 0};
      // under water (without 水下速掘) and off the ground the game digs five times slower each
      const mult = (b.headInWater && !enchOf(G.inv.worn(0), 'aqua_affinity') ? 0.2 : 1) * (!b.onGround && !b.flying ? 0.2 : 1);
      const secs = breakTime(BLOCKS[t.v & 0xFFF], heldTool(), {efficiency: enchOf(held(), 'efficiency'), mult});
      if (secs === 0) { if (!G.breakWait) { breakBlock(t); G.breaking = null; G.breakWait = 5; } }
      else if (secs < Infinity && !G.breakWait) {
        G.breaking.p += 1 / (secs * 20);
        if (G.time % 4 === 0) { play('hit', t.v); G.ents.burst(t.x, t.y, t.z, t.v, 2); }
        if (G.breaking.p >= 1) { breakBlock(t); G.breaking = null; G.breakWait = 5; }
      }
    }
  } else G.breaking = null;
  // holding use places again every 4 ticks
  if (G.useWait > 0) G.useWait--;
  if (ctl.use && !G.useWait && input.mode !== 'touch') { const s = held(); if (s && itemInfo(s.id)?.block?.item && G.target) { use(G.target); G.useWait = 4; } }
  if (G.swing > 0) G.swing--;
  if (G.hurtT > 0) G.hurtT--;
  // mobs, items, experience, furnaces, the weather
  G.mobs.tick();
  G.ents.tick(b, stack => { if (G.dead) return stack; const left = G.inv.add(stack); drawHud(true); return left; });
  G.ents.orbTick(b, v => gainXp(v));
  weatherTick();
  bobberTick();
  // the body turns after the head when it has turned far, or when walking
  const turnBy = ((b.yaw - G.bodyYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (moved > 0.01) G.bodyYaw += turnBy * 0.5; else if (Math.abs(turnBy) > 0.85) G.bodyYaw += turnBy - Math.sign(turnBy) * 0.85;
  G.limbAmt = (G.limbAmt || 0) + (Math.min(1, moved * 4) - (G.limbAmt || 0)) * 0.4;
  for (const [k, tile] of Object.entries(G.tiles)) if (tile.kind === 'furnace') {
    const was = tile.burn > 0, lit = furnaceTick(tile);
    if (was !== lit) { const [x, y, z] = k.split(',').map(Number), v = G.mirror.get(x, y, z); if ((v & 0xFFF) === ID.furnace) setBlock(x, y, z, withMeta(ID.furnace, (v >>> 12 & 3) | (lit ? 4 : 0))); }
  }
  if (invUI.open && invUI.kind === 'furnace' && G.time % 4 === 0) invUI.refresh();
  // the worker: where we are, how dark the sky is
  const cx = Math.floor(b.x / 16), cz = Math.floor(b.z / 16);
  if (cx !== G.cx || cz !== G.cz) { G.cx = cx; G.cz = cz; G.worker.postMessage({type: 'center', cx, cz}); }
  if (G.time % 100 === 0) G.worker.postMessage({type: 'day', dark: Math.round((1 - environment(G.time).daylight) * 11), snow: G.weather.rain > 0.5});
  if (performance.now() - G.saveAt > 30000) { G.saveAt = performance.now(); saveGame(); }
}

// ---------- events from the controls ----------
function handleEvents(events) {
  for (const e of events) {
    if (screens.open && !G?.ready) { if (e === 'pause') screens.nav('back'); continue; }
    if (invUI.open) { if (e === 'inventory' || e === 'pause') { invUI.hide(); } continue; }
    if (screens.open) { if (e === 'pause') screens.nav('back'); continue; }
    if (!G || G.dead) continue;
    if (e === 'pause') { pause(); continue; }
    if (paused) continue;
    if (e === 'inventory') openInventory();
    else if (e.startsWith('slot')) { G.hot = Number(e.slice(4)); drawHud(true); }
    else if (e === 'next') { G.hot = (G.hot + 1) % 9; drawHud(true); }
    else if (e === 'prev') { G.hot = (G.hot + 8) % 9; drawHud(true); }
    else if (e === 'drop') { const s = held(); if (s) { const one = G.inv.take(G.hot, 1); const eye = eyePos(); G.ents.drop(one, eye[0], eye[1] - 0.3, eye[2], {dir: G.body.look(), delay: 40}); drawHud(true); } }
    else if (e === 'fly') { if (G.mode === 'creative') { G.body.flying = !G.body.flying; G.body.vy = 0; } }
    else if (e === 'debug') { debugOn = !debugOn; $('.debug').hidden = !debugOn; }
    else if (e === 'hud') { hudHidden = !hudHidden; hud.style.opacity = hudHidden ? 0 : 1; }
    else if (e === 'view') { G.view = (G.view + 1) % 3; toast(['第一人称', '第三人称（背后）', '第三人称（正面）'][G.view]); }
    else if (e === 'use') { const t = targetAt(), m = mobAt(); if (m && (!t || m.t < t.t)) use(null, m.mob); else use(t); G.useWait = 5; }
    else if (e === 'pick' && G.target) {
      const id = BLOCKS[G.target.v & 0xFFF].name, name = BLOCKS[G.target.v & 0xFFF].item ? id : null;
      if (!name) continue;
      const at = G.inv.slots.findIndex(s => s?.id === name);
      if (at >= 0 && at < 9) G.hot = at;
      else if (at >= 9) { const tmp = G.inv.slots[G.hot]; G.inv.slots[G.hot] = G.inv.slots[at]; G.inv.slots[at] = tmp; }
      else if (G.mode === 'creative') G.inv.slots[G.hot] = {id: name, n: stackMax(name)};
      drawHud(true);
    }
  }
}
function targetAt() {
  const o = eyePos(), d = aimDir();
  return raycast(G.mirror, o[0], o[1], o[2], d[0], d[1], d[2], reach());
}
/** The mob aimed at (within 3 blocks, the game's reach for hitting; 5 in creative): {mob, t} or null. */
function mobAt() {
  const o = eyePos(), d = aimDir();
  return G.mobs.raycast(o[0], o[1], o[2], d[0], d[1], d[2], G.mode === 'creative' ? 5 : 3);
}

// ---------- the HUD ----------
let hudKey = '';
function drawHud(force = false) {
  if (!G) return;
  const armor = G.inv.armor().points;
  const key = JSON.stringify([G.inv.slots.slice(0, 9), G.hot, Math.ceil(G.health), G.food, Math.ceil(G.air / 30), G.mode, input?.mode, armor, G.xp.level, Math.round(G.xp.prog * 182)]);
  if (!force && key === hudKey) return;
  hudKey = key;
  const hb = $('.hotbar');
  hb.innerHTML = G.inv.slots.slice(0, 9).map((s, i) => `<div class="s${i === G.hot ? ' on' : ''}" data-i="${i}">${stackHtml(s, icons)}</div>`).join('') + (input?.mode === 'touch' ? '<div class="more" data-inv>⋯</div>' : '');
  const survival = G.mode !== 'creative';
  const row = (n, full, halfK, empty, count = 10) => Array.from({length: count}, (_, i) => `<img class="px" style="width:calc(9*var(--u));height:calc(9*var(--u))" src="${HUD_URL[n >= (i + 1) * 2 ? full : n >= i * 2 + 1 ? halfK : empty]}">`).join('');
  $('.hearts').innerHTML = survival ? row(Math.ceil(G.health), 'heartFull', 'heartHalf', 'heartEmpty') : '';
  $('.food').innerHTML = survival ? row(G.food, 'foodFull', 'foodHalf', 'foodEmpty') : '';
  // armour over the hearts (only when some is worn), the experience bar and level over the hotbar
  $('.bars .armor').innerHTML = survival && armor ? row(armor, 'armorFull', 'armorHalf', 'armorEmpty') : '';
  $('.xp').hidden = !survival;
  $('.xp i').style.width = `${(G.xp.prog * 100).toFixed(1)}%`;
  $('.xp b').textContent = G.xp.level > 0 ? G.xp.level : '';
  const bubbles = Math.ceil(Math.max(0, G.air) / 30);
  $('.bars .air').innerHTML = survival && G.air < 300 ? Array.from({length: bubbles}, () => `<img class="px" style="width:calc(9*var(--u));height:calc(9*var(--u))" src="${HUD_URL.air}">`).join('') : '';
  const s = held(), name = $('.name');
  if (s && name.dataset.id !== s.id + G.hot) { name.textContent = zhOf(s.id); name.style.opacity = 1; name.dataset.id = s.id + G.hot; clearTimeout(name._t); name._t = setTimeout(() => { name.style.opacity = 0; }, 1800); }
  if (!s) { name.style.opacity = 0; name.dataset.id = ''; }
}
function toast(text) {
  const box = $('.toast'), d = document.createElement('div');
  d.textContent = text; box.append(d);
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 700); }, 4200);
  while (box.children.length > 4) box.firstElementChild.remove();
}
function showError(text) {
  const e = document.createElement('div'); e.className = 'err'; e.textContent = text; app.append(e);
  setTimeout(() => e.remove(), 12000);
}

// ---------- the hand ----------
function handModel(view) {
  const b = G.body, s = held(), v = G.hand.reset(), [sky, blk] = G.mirror.light(Math.floor(b.x), Math.floor(b.y + b.eye), Math.floor(b.z));
  // how far the swing is, between ticks too; it strikes fast and comes back slower (the game's √ curve)
  const p = G.swing > 0 ? Math.min(1, (6 - G.swing + (view.alpha || 0)) / 6) : 0, sw = Math.sin(Math.sqrt(p) * Math.PI), eat = G.eating ? Math.sin(G.eating * 0.9) * 0.03 : 0;
  const bobT = G.walked * 2.2, bob = settings.bob && b.onGround ? Math.abs(Math.sin(bobT)) * 0.035 : 0, sideBob = settings.bob && b.onGround ? Math.sin(bobT) * 0.02 : 0;
  if (!s) {
    v.cube(0.5, Array(6).fill(LAYER.player_arm), sky * 17, blk * 17, 256, 32, null, [4, 0, 8, 16]);
    // a long box: the arm reaching in from the lower right
    const m = mat.mul(mat.model(1, 0.2, -1.1 + sw * 0.8, 0.15, 0.62 + sideBob - sw * 0.15, -0.62 + bob + sw * 0.12, -0.75 - sw * 0.25), new Float32Array([0.22, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0.22, 0, 0, 0, 0, 1]));
    return {verts: v, model: m};
  }
  // a rod whose line is out shows without its line
  const look = G.bobber && s.id === 'fishing_rod' ? {flat: LAYER.fishing_rod_cast, tint: 0xFFFFFF} : itemLook(s.id);
  if (look.cube) {
    v.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints);
    return {verts: v, model: mat.model(0.38, Math.PI / 4 + sw * 0.6, -0.05 - sw * 0.5, 0, 0.58 + sideBob - sw * 0.2, -0.5 + bob + eat + sw * 0.1, -0.78 - sw * 0.2)};
  }
  v.flat(0.5, look.flat, sky * 17, blk * 17, 256, 32, look.tint);
  const tool = !!itemInfo(s.id)?.tool;
  return {verts: v, model: mat.model(0.62, -Math.PI / 2 + 0.25, tool ? 0.1 - sw * 1.2 : -sw * 0.6, tool ? 0.55 : 0.2, 0.62 + sideBob - sw * 0.15, -0.45 + bob + eat + sw * 0.08, -0.8 - sw * 0.15)};
}

/** Arrows in flight or stuck, and lit TNT (flashing white), as things to draw. */
let arrowVerts = null, tntVerts = null;
function shotThings(light) {
  const out = [];
  for (const ar of G.mobs.arrows) {
    const [sky, blk] = light(Math.floor(ar.x), Math.floor(ar.y), Math.floor(ar.z));
    const v = (arrowVerts ||= {}), key = sky * 16 + blk;
    const verts = v[key] ||= (() => { const q = new Verts(16); q.arrow(0.5, LAYER.arrow, sky * 17, blk * 17, 256, 32); return q; })();
    if (!ar.stuck) { ar.dir = [ar.vx, ar.vy, ar.vz]; }
    const [dx, dy, dz] = ar.dir || [0, -1, 0], l = Math.hypot(dx, dy, dz) || 1;
    out.push({verts, x: ar.x, y: ar.y, z: ar.z, model: mat.model(0.5, Math.atan2(dx, dz), Math.acos(Math.max(-1, Math.min(1, dy / l))), 0)});
  }
  for (const t of G.mobs.tnt) {
    if (!tntVerts) { tntVerts = new Verts(32); tntVerts.cube(0.5, [LAYER.tnt_side, LAYER.tnt_side, LAYER.tnt_top, LAYER.tnt_bottom, LAYER.tnt_side, LAYER.tnt_side], 255, 255, 256, 32); }
    const grow = t.fuse < 10 ? 1 + (10 - t.fuse) * 0.02 : 1;
    out.push({verts: tntVerts, x: t.x, y: t.y + 0.5, z: t.z, model: mat.model(grow), bright: Math.floor(t.fuse / 5) % 2 ? 0.5 : 0});
  }
  return out;
}
/** The player as others would see them (third person): the body, and what armour is worn over it. */
function playerModel(view, a, light) {
  const b = G.body, x = b.prev.x + (b.x - b.prev.x) * a - view.x, y = b.prev.y + (b.y - b.prev.y) * a - view.y, z = b.prev.z + (b.z - b.prev.z) * a - view.z;
  const turn = ((b.yaw - G.bodyYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const rot = animate('player', {}, {limb: G.walked * 4, amount: G.limbAmt || 0, headYaw: -turn, headPitch: -b.pitch, age: G.time, attack: G.swing > 0 ? 1 - G.swing / 6 : 0});
  const pose = {x, y, z, yaw: G.bodyYaw, s: 0.9375}, [sky, blk] = light(Math.floor(b.x), Math.floor(b.y + 1), Math.floor(b.z)), hurtFlash = G.hurtT > 0 ? 1 : 0;
  const out = [{skin: 'player', verts: new Float32Array(buildModel('player', rot, pose, [], skinSizes.player)), light: [sky, blk], tint: [1, 1, 1], hurt: hurtFlash, white: 0}];
  for (let i = 0; i < 4; i++) {
    const am = itemInfo(G.inv.worn(i)?.id)?.armor;
    if (!am) continue;
    const [model, parts] = ARMOR_PARTS[i], skin = `armor_${am.mat}${model === 'armor_inner' ? '_legs' : ''}`;
    out.push({skin, verts: new Float32Array(buildModel(model, rot, pose, [], skinSizes[skin], parts)), light: [sky, blk], tint: greyArmor[skin] ? [0.63, 0.4, 0.25] : [1, 1, 1], hurt: hurtFlash, white: 0});
  }
  return out;
}
/** The bobber (a little picture turned to the camera) and the line to the rod's tip, sagging; the tip is at the right
 *  hand: on the screen's right in first person, at the model's hand in third. */
let bobberV = null;
function fishingDraw(view, light) {
  const f = G.bobber, b = G.body;
  if (!f) return null;
  const v = (bobberV ||= new Verts(16)).reset(), [sky, blk] = light(Math.floor(f.x), Math.floor(f.y), Math.floor(f.z)), s = 0.13;
  const yaw = view.yaw, pitch = view.pitch, rx = [Math.cos(yaw), 0, -Math.sin(yaw)], up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
  const ox = f.x - view.x, oy = f.y + 0.1 - view.y, oz = f.z - view.z;
  for (const [a, c, u, w] of [[-1, -1, 0, 16], [1, -1, 16, 16], [1, 1, 16, 0], [-1, 1, 0, 0]]) v.v(ox + (rx[0] * a + up[0] * c) * s, oy + (rx[1] * a + up[1] * c) * s, oz + (rx[2] * a + up[2] * c) * s, 256, 128, LAYER.fishing_hook, u, w, sky * 17, blk * 17, 2 << 2);
  let tip;
  if (!G.view) { const d = b.look(); tip = [d[0] * 0.9 + rx[0] * 0.36 + up[0] * 0.1, d[1] * 0.9 + up[1] * 0.1, d[2] * 0.9 + rx[2] * 0.36 + up[2] * 0.1]; }
  else { const by = G.bodyYaw, r = [Math.cos(by), 0, -Math.sin(by)], fw = [-Math.sin(by), 0, -Math.cos(by)]; tip = [b.x + r[0] * 0.35 + fw[0] * 0.9 - view.x, b.y + 1.9 - view.y, b.z + r[2] * 0.35 + fw[2] * 0.9 - view.z]; }
  const end = [ox, oy + 0.08, oz], dist = Math.hypot(end[0] - tip[0], end[1] - tip[1], end[2] - tip[2]), sag = f.bite > 0 ? 0 : Math.min(0.6, dist * 0.04), pts = [];
  let prev = tip;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, p = [tip[0] + (end[0] - tip[0]) * t, tip[1] + (end[1] - tip[1]) * t - sag * 4 * t * (1 - t), tip[2] + (end[2] - tip[2]) * t];
    pts.push(...prev, ...p); prev = p;
  }
  return {thing: {verts: v, x: view.x, y: view.y, z: view.z, model: mat.identity(), center: 128}, lines: {pts, color: [0.08, 0.08, 0.08, 0.85]}};
}
/** Over each enchanting table near: an open book, bobbing, turning to the player. */
function tableBooks(view, light) {
  const out = [], open = 0.8 + Math.sin(G.time * 0.05) * 0.12, w = 0.2, h = 0.26;
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.kind !== 'enchant') continue;
    const [x, y, z] = k.split(',').map(Number);
    if (Math.abs(x + 0.5 - view.x) > 24 || Math.abs(z + 0.5 - view.z) > 24) continue;
    if ((G.mirror.get(x, y, z) & 0xFFF) !== ID.enchanting_table) { if (G.mirror.has(x, z)) delete G.tiles[k]; continue; }
    const [sky, blk] = light(x, y + 1, z), v = new Verts(32), L = LAYER.enchanting_book_pages;
    const spine = [[0, -h / 2, 0], [0, h / 2, 0]], page = sgn => [Math.sin(open) * w * sgn, 0, Math.cos(open) * w];
    for (const [sgn, u0, u1] of [[-1, 0, 8], [1, 8, 16]]) {
      const p = page(sgn), q = [[...spine[0]], [...spine[1]], [p[0], h / 2, p[2]], [p[0], -h / 2, p[2]]], uv = [[u1, 16], [u1, 0], [u0, 0], [u0, 16]];
      for (const order of [[0, 1, 2, 3], [3, 2, 1, 0]]) for (const i of order) v.v(q[i][0], q[i][1], q[i][2], 256, 32, L, uv[i][0], uv[i][1], sky * 17, Math.max(blk, 7) * 17, 2 << 2);
    }
    const cx = x + 0.5, cz = z + 0.5;
    out.push({verts: v, x: cx, y: y + 1.05 + Math.sin(G.time * 0.08 + x) * 0.05, z: cz, model: mat.model(1, Math.atan2(view.x - cx, view.z - cz))});
  }
  return out;
}
const colHash = (x, z) => (((x * 73856093) ^ (z * 19349663)) >>> 0) % 1000 / 1000;
/** Rain or snow round the camera: a strip on each column where it falls, from the rain-stopping block (or ten below)
 *  to twelve above, turned to the camera, its picture running down (snow slowly, drifting). */
let weatherV = null;
function weatherVerts(view) {
  const w = G.weather;
  if (w.rain < 0.05) return null;
  const v = (weatherV ||= new Verts(4096)).reset(), R = 9, cx = Math.floor(view.x), cy = Math.floor(view.y), cz = Math.floor(view.z), t = performance.now() / 1000;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > R * R || (!dx && !dz)) continue;
    const x = cx + dx, z = cz + dz, kind = fallsAt(x, z);
    if (!kind || colHash(x, z) > w.rain * (kind === 'snow' ? 0.6 : 1)) continue;
    const y0 = Math.max(topAt(x, z), cy - 10), y1 = cy + 12;
    if (y1 <= y0) continue;
    const snow = kind === 'snow', ox = x + 0.5 - view.x, oz = z + 0.5 - view.z, d = Math.hypot(ox, oz) || 1, sx = -oz / d * 0.5, sz = ox / d * 0.5;
    const [sky, blk] = G.mirror.light(x, Math.min(MINY + HEIGHT - 1, Math.max(y0, cy)), z);
    // one picture per two blocks; it moves down as time goes (the texture coordinate at the top falls)
    const fall = (t * (snow ? 0.6 : 7) + colHash(z, x)) % 1, top = Math.round((1 - fall) * 16), bottom = top + (y1 - y0) * 8;
    const drift = snow ? Math.sin(t * 0.7 + x * 0.9 + z * 0.6) * 0.3 : 0, layer = snow ? LAYER.weather_snow : LAYER.weather_rain, oy0 = y0 - view.y, oy1 = y1 - view.y;
    v.v(ox - sx, oy0, oz - sz, 256, 128, layer, 0, bottom, sky * 17, blk * 17, 2 << 2);
    v.v(ox + sx, oy0, oz + sz, 256, 128, layer, 16, bottom, sky * 17, blk * 17, 2 << 2);
    v.v(ox + sx + drift, oy1, oz + sz, 256, 128, layer, 16, top, sky * 17, blk * 17, 2 << 2);
    v.v(ox - sx + drift, oy1, oz - sz, 256, 128, layer, 0, top, sky * 17, blk * 17, 2 << 2);
  }
  return v;
}
/** Lightning: a crooked white line from high up to where it struck, flickering. */
let boltV = null;
function boltVerts(view) {
  if (!G.bolts.length) return null;
  const v = (boltV ||= new Verts(512)).reset();
  for (const bolt of G.bolts) {
    if (bolt.life % 3 === 1) continue;
    let s = bolt.seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let px = bolt.x, py = Math.min(bolt.y + 80, view.y + 110), pz = bolt.z;
    while (py > bolt.y) {
      // crooked, but pulled back over where it strikes
      const ny = Math.max(bolt.y, py - 3 - r() * 5), last = ny <= bolt.y, nx = last ? bolt.x : px + (r() - 0.5) * 2.4 + (bolt.x - px) * 0.35, nz = last ? bolt.z : pz + (r() - 0.5) * 2.4 + (bolt.z - pz) * 0.35;
      // a band along the segment, its width across the view
      const a = [px - view.x, py - view.y, pz - view.z], c = [nx - view.x, ny - view.y, nz - view.z], seg = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
      let side = [seg[1] * mid[2] - seg[2] * mid[1], seg[2] * mid[0] - seg[0] * mid[2], seg[0] * mid[1] - seg[1] * mid[0]];
      const l = Math.hypot(...side) || 1; side = side.map(q => q / l * 0.22);
      // both ways round (faces turned away are not drawn)
      for (const [p, k] of [[a, -1], [a, 1], [c, 1], [c, -1], [c, -1], [c, 1], [a, 1], [a, -1]]) v.v(p[0] + side[0] * k, p[1] + side[1] * k, p[2] + side[2] * k, 256, 128, LAYER.lightning_bolt, 8, 8, 255, 255, 2 << 2);
      px = nx; py = ny; pz = nz;
    }
  }
  return v;
}
// ---------- the frame ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  const c = input.read(dt);
  handleEvents(c.events);
  if (invUI.open && input.mode === 'pad') padInventory();
  if (screens.open && input.mode === 'pad' && (!G || paused || G.dead)) padMenu();
  if (!G) return;
  if (!G.ready) { checkReady(); return; }
  const b = G.body;
  if (!paused && !invUI.open) {
    b.yaw += c.look[0]; b.pitch = Math.max(-1.5705, Math.min(1.5705, b.pitch + c.look[1]));
    ctl = c;
    acc += dt * 1000;
    let n = 0;
    while (acc >= TICK && n++ < 5) { tick(); acc -= TICK; }
    if (acc > TICK * 5) acc = 0;
  } else ctl = {...ctl, attack: false, use: false, fwd: 0, side: 0, jump: false};
  // the camera between the last two ticks
  const a = paused ? 1 : acc / TICK, x = b.prev.x + (b.x - b.prev.x) * a, y = b.prev.y + (b.y - b.prev.y) * a, z = b.prev.z + (b.z - b.prev.z) * a;
  const bobT = G.walked * 2.2, bobbing = settings.bob && b.onGround && !b.flying && !G.view ? 1 : 0;
  // shaking after an explosion; a drawn bow zooms in
  const shake = G.shake > 0 ? (G.shake -= dt * 20, G.shake * 0.004) : 0, zoom = 1 - Math.min(1, G.draw / 20) * 0.15;
  const view = {x, y: y + b.eye + Math.abs(Math.sin(bobT)) * 0.04 * bobbing, z, yaw: b.yaw + (Math.random() - 0.5) * shake, pitch: b.pitch + Math.abs(Math.cos(bobT)) * 0.006 * bobbing + (Math.random() - 0.5) * shake,
    fov: (settings.fov + (b.sprinting ? 8 : 0) + (b.flying && b.sprinting ? 4 : 0)) * zoom * Math.PI / 180, far: settings.dist * 16, alpha: a};
  // third person: the camera four blocks behind (or in front, looking back), nearer where a wall is in the way
  G.camDist = 0;
  if (G.view && !G.dead) {
    // eight rays from round the eye (as the game does), so the camera does not slip into a block past a corner
    const d = b.look().map(q => G.view === 1 ? -q : q);
    let dist = 4;
    for (let k = 0; k < 8; k++) {
      const ox = (k & 1 ? 0.1 : -0.1), oy = (k & 2 ? 0.1 : -0.1), oz = (k & 4 ? 0.1 : -0.1), hit = raycast(G.mirror, view.x + ox, view.y + oy, view.z + oz, d[0], d[1], d[2], 4.3, false, true);
      if (hit) dist = Math.min(dist, hit.t - 0.35);
    }
    G.camDist = Math.max(0.2, dist);
    view.x += d[0] * G.camDist; view.y += d[1] * G.camDist; view.z += d[2] * G.camDist;
    if (G.view === 2) { view.yaw += Math.PI; view.pitch = -view.pitch; }
  }
  G.cam = [view.x, view.y, view.z];
  // the block at the crosshair, or a mob in front of it
  G.target = paused || G.dead ? null : targetAt();
  const mt = paused || G.dead ? null : mobAt();
  G.targetMob = mt && (!G.target || mt.t < G.target.t) ? mt.mob : null;
  if (G.targetMob) G.target = null;
  const env = environment(G.time + a);
  const eyeV = G.mirror.get(Math.floor(view.x), Math.floor(view.y), Math.floor(view.z));
  env.underwater = (eyeV & 0xFFF) === ID.water;
  if (env.underwater) { env.fog = [0.05, 0.12, 0.35].map(q => q * (0.3 + env.daylight * 0.7)); }
  if ((eyeV & 0xFFF) === ID.lava) { env.underwater = true; env.fog = [0.6, 0.15, 0.02]; }
  $('.water').style.display = env.underwater ? 'block' : 'none';
  $('.hurt').style.opacity = G.hurtT ? 0.9 : 0;
  $('.sleep').style.opacity = G.sleeping ? Math.min(1, G.sleeping / 60) : 0;
  // animated textures
  const tick20 = Math.floor(G.time);
  for (const an of animFrames) { const f = Math.floor(tick20 / an.time) % an.frames.length; if (f !== an.at) { an.at = f; renderer.updateLayer(an.layer, an.frames[f]); } }
  const lightAt = (bx, by, bz) => G.mirror.light(bx, by, bz);
  const extras = {things: [...G.ents.drawList(view, env.time, lightAt), ...shotThings(lightAt)], mobs: G.mobs.drawList(view, lightAt, skinSizes)};
  if (G.view && !G.dead) extras.mobs.push(...playerModel(view, a, lightAt));
  extras.weather = weatherVerts(view);
  const bolt = boltVerts(view);
  if (bolt?.n) extras.things.push({verts: bolt, x: view.x, y: view.y, z: view.z, model: mat.identity(), center: 128, bright: 1});
  const fishing = fishingDraw(view, lightAt);
  if (fishing) { extras.things.push(fishing.thing); extras.lines = fishing.lines; }
  extras.things.push(...tableBooks(view, lightAt));
  if (G.target && !hudHidden) extras.outline = {boxes: G.target.boxes};
  if (G.breaking && G.breaking.p > 0) extras.crack = {x: G.breaking.x, y: G.breaking.y, z: G.breaking.z, layer: LAYER[`destroy_stage_${Math.min(9, Math.floor(G.breaking.p * 10))}`]};
  if (!hudHidden && !G.dead && !G.view) extras.hand = handModel(view);
  renderer.draw(view, env, extras);
  drawHud();
  if (debugOn && now - (G.debugAt || 0) > 250) {
    G.debugAt = now;
    // facingBack() is where a placed block's front looks: the player looks the other way
    const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z), [sk, bl] = G.mirror.light(bx, by, bz), dir = ['北', '东', '南', '西'][facingBack()];
    const day = Math.floor(G.time / 24000) + 1, hour = Math.floor(((G.time % 24000) / 1000 + 6) % 24);
    $('.debug').textContent = `方块世界  ${Math.round(1 / Math.max(dt, 0.001))} fps\nXYZ: ${b.x.toFixed(2)} / ${b.y.toFixed(2)} / ${b.z.toFixed(2)}\n方块: ${bx} ${by} ${bz}  区块: ${G.cx} ${G.cz}\n朝向: ${dir}  (${(b.yaw * 180 / Math.PI % 360).toFixed(1)} / ${(b.pitch * 180 / Math.PI).toFixed(1)})\n生物群系: ${BIOMES[G.mirror.biome(bx, bz)]?.zh}\n光照: 天空 ${sk}  方块 ${bl}\n第 ${day} 天 ${hour}:00\n区段: ${renderer.stats.drawn}/${renderer.stats.sections}  三角形: ${renderer.stats.tris}\n生物: ${G.mobs.count(m => m.def.passive)} 动物 / ${G.mobs.count(m => m.def.hostile)} 怪物\n天气: ${G.weather.thunder > 0.5 ? '雷雨' : G.weather.rain > 0.5 ? (fallsAt(bx, bz) === 'snow' ? '下雪' : '下雨') : '晴'}（${Math.round(G.weather.rain * 100)}%，${Math.round(G.weather.rainT / 20)} 秒后${G.weather.raining ? '停' : '下'}）  护甲: ${G.inv.armor().points}  等级: ${G.xp.level}\n种子: ${G.meta.seedText || G.meta.seed}${G.targetMob ? `\n看着: ${G.targetMob.def.zh}（${Math.ceil(G.targetMob.health)}/${G.targetMob.def.health}）` : ''}${G.target ? `\n看着: ${BLOCKS[G.target.v & 0xFFF].zh} (${G.target.x}, ${G.target.y}, ${G.target.z})` : ''}`;
  }
}
// pads in menus and inventories
let padPrev = {};
function padEdges() {
  const p = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected);
  if (!p) return {};
  const now = {up: p.buttons[12]?.pressed || p.axes[1] < -0.6, down: p.buttons[13]?.pressed || p.axes[1] > 0.6, left: p.buttons[14]?.pressed || p.axes[0] < -0.6, right: p.buttons[15]?.pressed || p.axes[0] > 0.6,
    a: p.buttons[0]?.pressed, b: p.buttons[1]?.pressed, x: p.buttons[2]?.pressed, y: p.buttons[3]?.pressed};
  const out = {};
  for (const k in now) { if (now[k] && !padPrev[k]) out[k] = true; }
  // held directions repeat
  for (const k of ['up', 'down', 'left', 'right']) { if (now[k]) { padPrev[`${k}T`] = (padPrev[`${k}T`] || 0) + 1; if (padPrev[`${k}T`] > 18 && padPrev[`${k}T`] % 5 === 0) out[k] = true; } else padPrev[`${k}T`] = 0; }
  Object.assign(padPrev, now);
  return out;
}
function padInventory() { const e = padEdges(); for (const k of ['up', 'down', 'left', 'right', 'a', 'x', 'y']) if (e[k]) invUI.pad(k); if (e.b) invUI.hide(); }
function padMenu() { const e = padEdges(); for (const k of ['up', 'down', 'left', 'right']) if (e[k]) screens.nav(k); if (e.a) screens.nav('ok'); if (e.b) screens.nav('back'); }

// ---------- start ----------
async function boot() {
  try { renderer = new Renderer(canvas); } catch (e) { showError(e.message); return; }
  layout();
  input = new Input(app, canvas, {rotated: () => rotated, sensitivity: () => settings.sens, onMode: m => { document.body.classList.toggle('touchmode', m === 'touch'); drawHud(true); screens?.markFocus(); }});
  if (isTouch) document.body.classList.add('touchmode'), input.mode = 'touch';
  screens = new Screens($('#screens'), api());
  invUI = new InventoryUI(invRoot, {get inv() { return G.inv; }, get icons() { return icons; }, drop: s => { const b = G.body; G.ents.drop(s, b.x, b.y + 1.2, b.z, {dir: b.look(), delay: 40}); }, sound: n => play(n), closed: () => closedInventory(), toApp: (x, y) => input.toApp(x, y), rotated: () => rotated, crafted: () => play('place', ID.crafting_table),
    // what was smelted gives its experience when taken out
    took: f => { const n = takeSmeltXp(f); if (n) { const b = G.body; G.ents.xp(n, b.x, b.y + 1, b.z); } }, worn: () => play('equip'),
    // the enchanting table and the anvil: the player's levels, creative, paying, the enchanting seed
    xp: () => G.xp, creative: () => G.mode === 'creative', spend: n => { G.xp.level = Math.max(0, G.xp.level - n); drawHud(true); },
    seed: () => G.enchSeed, reseed: () => { G.enchSeed = Math.floor(Math.random() * 2 ** 31); }, anvilUsed: () => anvilUsed()});
  // tapping the hotbar picks a slot; ⋯ opens the inventory
  $('.hotbar').addEventListener('pointerdown', e => { if (!G || paused) return; const s = e.target.closest('[data-i]'); if (s) { G.hot = Number(s.dataset.i); drawHud(true); } if (e.target.closest('[data-inv]')) openInventory(); e.stopPropagation(); });
  $('.pausebtn').addEventListener('click', () => pause());
  document.addEventListener('pointerlockchange', () => { if (G && G.ready && !paused && !invUI.open && !input.locked() && input.mode === 'keyboard') pause(); });
  addEventListener('pointerdown', () => unlockSound(), {capture: true});
  addEventListener('keydown', e => { unlockSound(); if (screens.open && (!G || paused || G.dead)) { const map = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok'}; if (map[e.code] && !e.target.closest?.('input[type=text]')) { screens.nav(map[e.code]); e.preventDefault(); } } }, {capture: true});
  addEventListener('visibilitychange', () => { if (document.hidden) { if (G && G.ready && !paused) pause(); else saveGame(); } });
  addEventListener('pagehide', () => saveGame());
  setVolume(settings.volume);
  screens.loading('正在准备材质…', 0.3);
  try { await loadTextures(); } catch (e) { showError(`材质没读成：${e.message || e}`); built = buildLayers(null); renderer.setTextures(built.size, built.layers); icons = makeIcons(built); }
  screens.title();
  requestAnimationFrame(frame);
}
boot();
// for looking into a running game from the console
globalThis.__blocks = {get game() { return G; }, get renderer() { return renderer; }, get input() { return input; }, settings, toast, importPack: (f, p) => api().importPack(f, p), removePack: () => api().removePack()};
