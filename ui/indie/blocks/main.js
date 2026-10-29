// 方块世界: a block world in the spirit of the game, made from scratch. This page runs the game: the menus, the player,
// breaking and placing, survival (health, hunger, air), the day, what is held, the HUD; the world itself is made and
// kept by the worker (world.worker.js) and drawn by render.js.
import {BLOCKS, ID, MINY, HEIGHT, itemInfo, zhOf, breakTime, harvests, dropsOf, withMeta, damageOf, ARMOR, throughArmor, addXp, FACES, OPPOSITE, BOAT_WOODS, WATERLOGGED, SIGN_WOODS} from './blocks.js';
import {Mobs, MOBS} from './mobs.js';
import {MODELS, OWN_SKINS, ARMOR_PARTS, ownArmor, buildModel, animate, ownVillager, VILLAGER_SKINS, ownBoat, handFrame, FISH_SKINS, ownFishSkin, CONDUIT_SKINS, ownConduitSkin, ownWind, ownSign, ownHangingSign} from './models.js';
import {Renderer, Verts, mat} from './render.js';
import {buildLayers, makeIcons, LAYER, ownSun, ownMoon, ownClouds, dials} from './atlas.js';
import {readPack, savePack, removePack, loadPackRecord, decodePack} from './pack.js';
import {listWorlds, saveWorld, deleteWorld} from './db.js';
import {Mirror} from './mirror.js';
import {Body, raycast, W as PLAYER_W, isWater} from './player.js';
import {Inventory, furnaceTick, stackMax, ARMOR_AT, takeSmeltXp} from './inventory.js';
import {enchOf, shelvesAround, fishLoot, protectionFactor, wears, seeded} from './enchant.js';
import {InventoryUI, stackHtml} from './invui.js';
import {Entities, itemLook, setPacked, setAtlas, thickItem} from './entities.js';
import {smeltsIn, smeltOf} from './inventory.js';
import {Input} from './input.js';
import {Screens} from './screens.js';
import {collisionBoxes, DIR, ATTACHED} from './shapes.js';
import {fillLevel, insertOne, moveOne, pickSlot, plateLevel} from './machines.js';
import {placeRail, isRail} from './rails.js';
import {Carts, CARTS} from './carts.js';
import {Boats, BOAT_W, BOAT_H, waterTop} from './boats.js';
import {unlockSound, play, setVolume, setRain, note as noteSound} from './sound.js';
import {seedOf} from './noise.js';
import {monumentsNear, monumentNear} from './monument.js';
import {runCommand, DIFFICULTIES, defaultRules} from './commands.js';
import {spawnPoint, BIOMES} from './gen.js';
import {findFrame, portalFill, across, nearestPortal, SEARCH} from './portal.js';
import {applyPotion, addEffect, effectsTick, speedFactor, hitBonus, EFFECTS, levelName, brewTick, swirlColor, potionColor} from './brew.js';
import {lootChest, STEWS} from './loot.js';
import {treasureNear, conduitFrame, wreckNear} from './ocean.js';
import {Maps} from './maps.js';

const $ = s => document.querySelector(s);
const app = $('#app'), canvas = $('#view'), hud = $('#hud'), invRoot = $('#inv');
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const inTavern = parent !== window;
const SET_KEY = 'st-iphonie-blocks-settings';
const DEFAULTS = {dist: isTouch ? 5 : 8, fov: 70, sens: 1, gamma: 0.5, volume: 0.7, scale: isTouch ? 0.7 : 1, wave: true, clouds: true, bob: true, autoJump: true,
  // 光影 and the distant view: phones start with the light ones, computers in the middle (high is for a real graphics card)
  shaders: isTouch ? 'low' : 'mid', lod: isTouch ? 48 : 96};
let settings = {...DEFAULTS};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch {} };

// ---------- layout: the whole window, turned on its side on an upright phone ----------
let rotated = false, renderer = null;
// with 光影 on, how much of 画面清晰度 is used (lowered while frames are slow, raised again when there is room)
let dynScale = 1, perf = {t: 0, n: 0};
function layout() {
  rotated = isTouch && innerHeight > innerWidth;
  document.documentElement.classList.toggle('rot', rotated);
  const w = rotated ? innerHeight : innerWidth, h = rotated ? innerWidth : innerHeight;
  // the window's own size (100vh / dvh do not always match it, and the turned box needs it exactly)
  app.style.width = `${w}px`; app.style.height = `${h}px`;
  const dpr = Math.min(devicePixelRatio || 1, 2) * settings.scale * dynScale;
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
let built = null, icons = {}, packLabel = '', dirtUrl = '', packStale = false, staleTold = false;
async function loadTextures() {
  const rec = await loadPackRecord();
  const {textures, sky, skins, stale} = await decodePack(rec);
  packStale = stale;
  built = buildLayers(textures); setAtlas(built);
  renderer.setTextures(built.size, built.layers);
  icons = makeIcons(built);
  // (held things are drawn from the pictures' clear pixels)
  heldVerts.clear();
  renderer.setImage('sun', sky.sun || ownSun(), {linear: false});
  renderer.setImage('moon', sky.moon || ownMoon());
  renderer.setImage('clouds', sky.clouds || ownClouds(), {repeat: true});
  // mob skins: the pack's (in the same layout) or ours; their sizes, since a pack's may be bigger
  skinSizes = {};
  for (const k of Object.keys(MODELS)) { const img = skins?.[k] || OWN_SKINS[k](); renderer.setImage(`mob:${k}`, img); skinSizes[k] = [img.width, img.height]; skinPics[k] = img; }
  // signs' wood
  for (const w of SIGN_WOODS) for (const [k, own] of [[`sign_${w}`, ownSign], [`hanging_${w}`, ownHangingSign]]) { const img = skins?.[k] || own(w); renderer.setImage(`mob:${k}`, img); skinSizes[k] = [img.width, img.height]; }
  // villagers by trade: the pack's villager with its plains clothes and the trade's over them, or ours
  for (const prof of VILLAGER_SKINS) {
    let img = ownVillager(prof);
    if (skins?.villager) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = skins.villager.width; c.height = skins.villager.height;
      for (const layer of [skins.villager, skins.villager_type, skins[`villager_prof_${prof}`]]) if (layer) g.drawImage(layer, 0, 0, c.width, c.height);
      img = c;
    }
    renderer.setImage(`mob:villager_${prof}`, img); skinSizes[`villager_${prof}`] = [img.width, img.height];
  }
  // the conduit's: its shell, cage and eyes; the water whirling round it, in frames (a pack's strip cut up)
  for (const k of CONDUIT_SKINS) { const img = skins?.[k] || ownConduitSkin(k); renderer.setImage(`mob:${k}`, img); skinSizes[k] = [img.width, img.height]; }
  windFrames = {h: [], v: []};
  for (const [dir, key] of [['h', 'conduit_wind'], ['v', 'conduit_wind_vertical']]) {
    const strip = skins?.[key], list = strip ? cutFrames(strip) : ownWind(dir === 'v');
    list.forEach((img, i) => { const name = `conduit_wind_${dir}${i}`; renderer.setImage(`mob:${name}`, img); skinSizes[name] = [img.width, img.height]; windFrames[dir].push(name); });
  }
  // tropical fish: the large body and the patterns, the pack's or ours
  for (const k of FISH_SKINS) { const img = skins?.[k] || ownFishSkin(k); renderer.setImage(`mob:${k}`, img); skinSizes[k] = [img.width, img.height]; }
  // worn armour: the pack's pictures (leather there is grey, dyed its usual brown) or ours
  for (const m of Object.keys(ARMOR)) for (const [key, layer] of [[`armor_${m}`, 1], [`armor_${m}_legs`, 2]]) {
    const img = skins?.[key] || ownArmor(m, layer); renderer.setImage(`mob:${key}`, img); skinSizes[key] = [img.width, img.height]; greyArmor[key] = !!skins?.[key] && m === 'leather';
  }
  // the turtle shell worn
  { const img = skins?.armor_turtle || ownArmor('turtle', 1); renderer.setImage('mob:armor_turtle', img); skinSizes.armor_turtle = [img.width, img.height]; }
  // boats: each wood's, with a chest and without (the pack's or ours)
  for (const w of BOAT_WOODS) for (const chest of [false, true]) {
    const key = `${chest ? 'chest_boat' : 'boat'}_${w}`, img = skins?.[key] || ownBoat(w, chest);
    renderer.setImage(`mob:${key}`, img); skinSizes[key] = [img.width, img.height];
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
let animFrames = [], skinSizes = {}, greyArmor = {}, skinPics = {};

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
  absorbFull: sprite9(HEART, {o: '#1f1503', R: '#e6b422', W: '#fff3a0'}), absorbHalf: sprite9(half(HEART, true), {o: '#1f1503', R: '#e6b422', W: '#fff3a0', E: '#3a2a08'}),
};
const picUrl = c => c.toDataURL();
const HUD_URL = Object.fromEntries(Object.entries(HUD_PICS).map(([k, c]) => [k, picUrl(c)]));

// ---------- the game ----------
let pregenListener = null;
let G = null, paused = true, screens = null, input = null, invUI = null, lastFrame = 0, acc = 0, debugOn = false, hudHidden = false;
const TICK = 50;

function api() {
  return {
    sound: n => play(n), inTavern: () => inTavern, packLabel: () => packLabel, packStale: () => packStale, padMode: () => input?.mode === 'pad',
    listWorlds, deleteWorld: id => deleteWorld(id), play: w => startWorld(w), createWorld,
    settings: () => settings, setSetting: (k, v) => { settings[k] = v; saveSettings(); applySetting(k); },
    importPack: async (file, onProgress) => { const p = await readPack(file, onProgress); await savePack(p); await reloadTextures(); return `${p.label}（${p.count} 张贴图）`; },
    removePack: async () => { await removePack(); await reloadTextures(); },
    leave: () => leaveGame(), resume: () => resume(), quit: () => quitToTitle(), respawn: () => respawn(),
    fullscreen: () => toggleFullscreen(), isFull: () => !!document.fullscreenElement, canFull: () => !!document.documentElement.requestFullscreen,
    // making the land ahead of time (like Chunky): within a radius of columns round the player
    pregen: radius => { if (G) G.worker.postMessage({type: 'pregen', radius}); }, pregenStop: () => { if (G) G.worker.postMessage({type: 'pregenStop'}); },
    onPregen: fn => { pregenListener = fn; }, savedColumns: () => G?.savedColumns || 0,
    difficulty: () => difficulty(), cycleDifficulty: () => { if (!G) return; const k = Object.keys(DIFFICULTIES); setDifficulty(k[(k.indexOf(difficulty()) + 1) % k.length]); toast(`难度：${DIFFICULTIES[difficulty()]}`); },
    mode: () => G?.mode, toggleMode: () => { if (!G) return; G.mode = G.mode === 'creative' ? 'survival' : 'creative'; if (G.mode === 'survival') G.body.flying = false; drawHud(true); toast(G.mode === 'creative' ? '换成了创造模式' : '换成了生存模式'); },
  };
}
function applySetting(k) {
  if (k === 'volume') setVolume(settings.volume);
  if (k === 'scale') layout();
  if (k === 'dist' && G) G.worker.postMessage({type: 'center', cx: G.cx, cz: G.cz, radius: settings.dist});
  if (k === 'wave' && G) G.worker.postMessage({type: 'remesh', wave: settings.wave});
  if (k === 'shaders') { renderer?.setQuality(settings.shaders); dynScale = 1; layout(); }
  if (k === 'lod') { if (!settings.lod) renderer?.clearLod(); if (G) G.worker.postMessage({type: 'lod', radius: settings.lod}); }
}
async function reloadTextures() {
  await loadTextures();
  if (G) { G.worker.postMessage({type: 'remesh', wave: settings.wave}); drawHud(true); }
}

async function createWorld({name, seed, mode, difficulty = 'normal'}) {
  const s = seed ? seedOf(seed) : Math.floor(Math.random() * 2 ** 31) - 2 ** 30;
  const w = {id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name, seed: s, seedText: seed || String(s), mode, difficulty, created: Date.now(), played: Date.now(), time: 0, version: 1};
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
    needGround: !meta.player, ready: false, campfires: new Map(), signs: new Map(), tripwires: new Map(), tripAt: new Map(), tripTold: new Map(), meshes: 0, cx: Math.floor(start.x / 16), cz: Math.floor(start.z / 16),
    breaking: null, breakWait: 0, useWait: 0, swing: 0, eating: 0, hurtT: 0, regen: 0, starve: 0, lastHit: 0, walked: 0, stepAt: 0, dead: false, saveAt: performance.now(), hand: new Verts(64), outline: null, target: null,
  };
  ents.load(meta.items);
  ents.onPickup = () => play('pop');
  ents.onBurn = it => soundAt('fizz', it.x, it.y, it.z);
  G.herds = new Set(meta.herds || []);
  // the conduits, drawn by the page
  G.conduitList = Object.entries(G.tiles).filter(([, t]) => t.kind === 'conduit').map(([k, t]) => [...k.split(',').map(Number), t]);
  // large chests: their two halves share their 54 slots again (a save keeps them twice)
  for (const [k, t] of Object.entries(G.tiles)) if (t.half === 'right' && G.tiles[t.pair]?.pair === k && G.tiles[t.pair].slots?.length === 54) t.slots = G.tiles[t.pair].slots;
  // chests the land was made with, not opened yet: their loot tables; the world's maps
  G.loot = meta.loot || {};
  G.maps = new Maps(meta.maps, blockColor);
  G.bedPos = meta.bed || null; G.sleeping = 0;
  G.draw = 0; G.attackWait = 0; G.targetMob = null;
  G.xp = {level: start.xpLevel || 0, prog: start.xpProg || 0, total: start.xpTotal || 0};
  G.weather = {raining: false, thundering: false, rainT: 12000 + Math.floor(Math.random() * 168000), thunderT: 12000 + Math.floor(Math.random() * 168000), rain: 0, thunder: 0, ...meta.weather};
  G.view = 0; G.bodyYaw = body.yaw; G.flash = 0; G.bolts = []; G.tops = new Map();
  // the enchanting table's offers stay the same till something is enchanted (the game's enchanting seed)
  G.enchSeed = start.enchSeed ?? Math.floor(Math.random() * 2 ** 31); G.bobber = null;
  // which world this is (the overworld or the Nether), the potion effects on the player, potions in flight, and the
  // portal: how long they have stood in one (not again till they step out after coming through)
  G.dim = meta.dim === 'nether' ? 'nether' : 'overworld'; G.effects = start.effects || {}; G.absorb = start.absorb || 0; G.thrown = [];
  // pressure plates pressed now, and how full each container was last told to the world
  G.plates = new Map(); G.fills = new Map();
  G.inPortal = 0; G.portalBlocked = meta.arrive ? 'wait' : false; G.portalWaitT = 0; G.arriving = false; G.leaving = false;
  ents.loadOrbs(meta.orbs);
  G.mobs = new Mobs({
    world: mirror, player: body, mode: () => G.mode, daylight: () => environment(G.time).daylight, held: () => held(),
    dark: (x, y, z, spawn) => isDark(x, y, z, spawn), loaded: (x, z) => mirror.has(Math.floor(x), Math.floor(z)),
    hurtPlayer: (n, why, from, kind) => hurt(n, why, from, kind), explode: (x, y, z, power, src, fire) => explode(x, y, z, power, src, null, fire),
    sound: (name, x, y, z) => soundAt(name, x, y, z), drop: (s, x, y, z, o) => G.ents.drop(s, x, y, z, o), give: s => !G.inv.add(s),
    burst: (x, y, z, kind) => G.ents.puff(x, y, z, kind), setBlock: (x, y, z, v) => setBlock(x, y, z, v), effect: (id, amp, ticks) => giveEffect(id, amp, ticks),
    xp: (n, x, y, z) => G.ents.xp(n, x, y, z), raining: (x, z) => fallsAt(Math.floor(x), Math.floor(z)) === 'rain', staring: m => staring(m), looting: () => enchOf(held(), 'looting'),
    nether: () => G.dim === 'nether', seed: meta.seed, invisible: () => !!G.effects.invisibility,
    difficulty: () => meta.difficulty || 'normal', spawning: () => (meta.rules || defaultRules()).doMobSpawning,
    monuments: (x, z) => G.dim === 'nether' ? [] : monumentsNear(meta.seed, Math.floor(x), Math.floor(z), 16), effectOf: id => G.effects[id] || null, curse: () => curse(),
    strike: (x, y, z) => strike(x, y, z), thundering: () => G.weather.thundering && G.weather.thunder > 0.5, wreck: (x, z) => G.dim === 'nether' ? null : wreckNear(meta.seed, x, z),
    swimming: () => G.body.inWater && !G.riding && Math.hypot(G.body.x - G.body.prev.x, G.body.z - G.body.prev.z) > 0.02, fire: (x, y, z) => setFire(x, y, z),
    // the boat the player is paddling (going along), and the things lying about (dolphins play with them)
    boat: () => { const b = G.riding?.isBoat ? G.riding.body : null; return b && Math.hypot(b.vx, b.vz) > 0.02 ? {x: b.x, y: b.y, z: b.z, vx: b.vx, vz: b.vz} : null; }, items: () => G.ents.items,
  });
  G.mobs.load(meta.mobs);
  // minecarts (kept in the save like the animals)
  G.carts = new Carts({world: mirror, sound: (n, x, y, z) => soundAt(n, x, y, z), drop: (s, x, y, z) => G.ents.drop(s, x, y, z), light: (x, y, z, f) => G.mobs.light(x, y, z, f),
    tiles: () => G.tiles, items: () => G.ents.items, ticks: () => G.ticks || 0, smoke: (x, y, z) => G.ents.puff(x, y, z, 'smoke')});
  G.carts.load(meta.carts); G.riding = null;
  // boats (kept the same way); they are solid to the player, the mobs and each other
  G.boats = new Boats({world: mirror, sound: (n, x, y, z) => soundAt(n, x, y, z), drop: (s, x, y, z) => G.ents.drop(s, x, y, z), fall: d => { if (d > 3) hurt(Math.ceil(d - 3), '摔得太重了', null, 'fall'); }});
  G.boats.load(meta.boats);
  mirror.solids = (body, x0, y0, z0, x1, y1, z1) => G.boats.solids(body, x0, y0, z0, x1, y1, z1);
  worker.onmessage = e => onWorker(e.data);
  worker.onerror = e => showError(`世界线程出错：${e.message || e}`);
  worker.postMessage({type: 'init', seed: meta.seed, layers: LAYER, radius: settings.dist, worldId: meta.id, center: [G.cx, G.cz], wave: settings.wave, dim: G.dim, lod: settings.lod});
  drawHud(true);
}
function onWorker(m) {
  if (!G) return;
  if (m.type === 'column') { G.mirror.column(m); campfiresIn(m); signsIn(m); tripwiresIn(m); }
  else if (m.type === 'mesh') { renderer.setSection(m.cx, m.sy, m.cz, m.solid, m.trans, m.vis, m.sun, m.faces); G.meshes++; }
  else if (m.type === 'drop') { G.mirror.drop(m.cx, m.cz); renderer.dropColumn(m.cx, m.cz); G.campfires.delete(`${m.cx},${m.cz}`); G.signs.delete(`${m.cx},${m.cz}`); G.tripwires.delete(`${m.cx},${m.cz}`); }
  else if (m.type === 'drops') for (const [id, n] of m.items) G.ents.drop({id, n}, m.x, m.y, m.z);
  else if (m.type === 'sound') soundAt(m.iron && m.name.startsWith('door') ? 'iron_door' : m.name, m.x, m.y, m.z);
  else if (m.type === 'prime') G.mobs.light(m.x, m.y, m.z);
  else if (m.type === 'note') noteAt(m.x, m.y, m.z);
  else if (m.type === 'dispense') dispense(m);
  else if (m.type === 'pushed') pushed(m.cells, m.dir);
  else if (m.type === 'hatch') { for (let k = 0; k < m.n; k++) G.mobs.add('turtle', m.x + (Math.random() - 0.5) * 0.4, m.y, m.z + (Math.random() - 0.5) * 0.4, {baby: true, beach: [Math.floor(m.x), m.y, Math.floor(m.z)]}); soundAt('pop', m.x, m.y, m.z); }
  else if (m.type === 'herd') {
    // each place has its animals once (a column made again after it went out of range keeps none)
    const k = `${m.cx},${m.cz}`;
    if (G.herds.has(k)) return;
    G.herds.add(k);
    if (G.mobs.count(x => x.def.passive) < 160) for (const [kind, x, y, z, extra] of m.list) if (!(MOBS[kind]?.hostile && difficulty() === 'peaceful')) G.mobs.add(kind, x, y, z, extra);
  } else if (m.type === 'loot') {
    // chests of shipwrecks, ruins and buried treasure: their loot tables until first opened (one already opened keeps
    // what it has)
    for (const [x, y, z, table] of m.list) { const k = `${x},${y},${z}`; if (!G.tiles[k]) G.loot[k] = table; }
  } else if (m.type === 'exploded') {
    for (const [id, n, x, y, z] of m.drops) G.ents.drop({id, n}, x, y, z);
    for (const [x, y, z] of m.tnt) G.mobs.light(x, y, z, 10 + Math.floor(Math.random() * 20));
  } else if (m.type === 'portal') arrived(m);
  // the distant view's tiles; how far making the land ahead has got
  else if (m.type === 'lod') renderer.setLod(m.tx, m.tz, m.data, m.quads, m.size);
  else if (m.type === 'lodDrop') renderer.dropLod(m.tx, m.tz, m.size);
  else if (m.type === 'pregen') { if (m.saved != null) G.savedColumns = m.saved; pregenListener?.(m); }
  else if (m.type === 'flushed') { G.waits?.get(m.id)?.(); G.waits?.delete(m.id); }
  else if (m.type === 'error') console.warn('world:', m.message);
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
function explode(x, y, z, power, src, why = null, fire = false) {
  G.worker.postMessage({type: 'explode', x, y, z, power, fire});
  G.mobs.blast(x, y, z, power);
  const b = G.body, dx = b.x - x, dy = b.y + 0.9 - y, dz = b.z - z, d = Math.hypot(dx, dy, dz), r = power * 2;
  if (d < r) {
    const k = 1 - d / r;
    b.vx += dx / (d || 1) * k * 1.2; b.vy += k * 0.6 + 0.1; b.vz += dz / (d || 1) * k * 1.2;
    hurt(Math.floor((k * k + k) / 2 * 7 * r + 1), why || (src ? `被${src.def.zh}炸死了` : '被炸死了'), null, 'explosion');
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
  // a pack taken by an older version kept only the pictures used then: say how to have the rest (once a visit)
  if (packStale && !staleTold) { staleTold = true; setTimeout(() => toast('材质是以前的版本导入的，后来加的方块和物品还是自带的画法：在「材质」里重新选一次 jar 就都换上了'), 2500); }
  if (G.meta.arrive) arrive();
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
  Object.assign(m, {played: Date.now(), time: G.time, mode: G.mode, dim: G.dim, inv: G.inv.slots, tiles: G.tiles, items: G.ents.toJSON(), orbs: G.ents.orbsJSON(), spawn: G.spawn, mobs: G.mobs.toJSON(), herds: [...G.herds], loot: G.loot, maps: G.maps.toJSON(), carts: G.carts.toJSON(), boats: G.boats.toJSON(), bed: G.bedPos, weather: G.weather,
    player: {x: b.x, y: G.riding?.isBoat ? G.riding.body.y + BOAT_H : b.y, z: b.z, yaw: b.yaw, pitch: b.pitch, flying: b.flying, health: G.health, food: G.food, sat: G.sat, hot: G.hot, xpLevel: G.xp.level, xpProg: G.xp.prog, xpTotal: G.xp.total, enchSeed: G.enchSeed, effects: G.effects, absorb: G.absorb || 0}});
  try { await saveWorld(m); } catch (e) { toast(`存档没存上：${e.message || e}`); }
  // the worker writes the changed columns; this waits till it has (or three seconds)
  const g = G;
  await new Promise(done => { const id = Date.now() + Math.random(); (g.waits ||= new Map()).set(id, done); g.worker.postMessage({type: 'flush', id}); setTimeout(done, 3000); });
}
async function quitToTitle() {
  if (G) { await saveGame(); await new Promise(r => setTimeout(r, 300)); G.worker.terminate(); renderer.clearAll(); renderer.clearLod(); }
  G = null; paused = true; input.enabled = false; input.unlock(); hud.hidden = true; invUI.hide();
  screens.title();
}
async function leaveGame() {
  if (G) await quitToTitle();
  parent.postMessage({type: 'st-iphonie-game:close'}, location.origin);
}
function respawn() {
  const b = G.body;
  // at the bed slept in last, while it is there (far away, or from the Nether, it is not known yet: trust it)
  let p = G.spawn;
  if (G.bedPos) {
    const {x, y, z} = G.bedPos;
    if (!G.mirror.has(x, z) || G.dim === 'nether' || BLOCKS[G.mirror.get(x, y, z) & 0xFFF]?.shape === 'bed') p = {x: x + 0.5, y: y + 0.6, z: z + 0.5};
    else { G.bedPos = null; toast('你的床不见了，回到了世界出生点'); }
  }
  Object.assign(G, {health: 20, food: 20, sat: 5, exh: 0, air: 300, dead: false, effects: {}, absorb: 0});
  b.dead = false;
  if (G.dim === 'nether') { G.meta.arrive = null; switchWorld('overworld', p); return; }
  Object.assign(b, {x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, fall: 0});
  b.prev = {x: b.x, y: b.y, z: b.z};
  drawHud(true); resume();
}

// ---------- the Nether ----------
const samePortal = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
function addPortal(dim, p) { const list = (G.meta.portals ||= {})[dim] ||= []; if (!list.some(q => samePortal(q, p))) list.push(p); }
function forgetPortal(dim, p) { if (G.meta.portals?.[dim]) G.meta.portals[dim] = G.meta.portals[dim].filter(q => !samePortal(q, p)); }
/** Flint and steel on the inside of an obsidian frame lights it. */
function lightPortal(t) {
  const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
  const f = findFrame((x, y, z) => G.mirror.get(x, y, z), t.x + nx, t.y + ny, t.z + nz);
  if (!f) return false;
  for (const [x, y, z, v] of portalFill(f)) setBlock(x, y, z, v);
  addPortal(G.dim, [f.x, f.y, f.z, f.axis]);
  play('portal');
  return true;
}
/**
 * Through a portal: to the other world at the matching place (an eighth of the way in the Nether, eight times back), by
 * an old portal there when one is near enough (the game's 128 blocks in the overworld, 16 in the Nether).
 */
async function travel() {
  const to = G.dim === 'nether' ? 'overworld' : 'nether', b = G.body, m = G.meta, [x, z] = across(b.x, b.z, to === 'nether');
  const old = nearestPortal(m.portals?.[to], x, z, SEARCH[to]);
  m.arrive = old ? {known: true, at: old, x: old[0] + (old[3] ? 0.5 : 1), y: old[1], z: old[2] + (old[3] ? 1 : 0.5)} : {known: false, x, y: to === 'nether' ? Math.max(32, Math.min(118, b.y)) : b.y, z};
  await switchWorld(to, m.arrive);
}
/** Leaves this world for the other (what lies about here is kept for coming back), standing at pos. */
async function switchWorld(to, pos) {
  if (!G || G.leaving) return;
  G.leaving = true; invUI.hide();
  const m = G.meta;
  await saveGame();
  const here = {tiles: m.tiles, loot: m.loot, items: m.items, orbs: m.orbs, mobs: m.mobs, herds: m.herds, carts: m.carts, boats: m.boats}, there = m.away || {};
  Object.assign(m, {away: here, dim: to, tiles: there.tiles || {}, loot: there.loot || {}, items: there.items || [], orbs: there.orbs || [], mobs: there.mobs || [], herds: there.herds || [], carts: there.carts || [], boats: there.boats || []});
  m.player = {...m.player, x: pos.x, y: pos.y, z: pos.z, flying: false, health: G.health, food: G.food, sat: G.sat, effects: G.effects, absorb: G.absorb || 0};
  try { await saveWorld(m); } catch (e) { toast(`存档没存上：${e.message || e}`); }
  G.worker.terminate(); renderer.clearAll(); renderer.clearLod();
  play('travel');
  startWorld(m);
}
/** Just through: an old portal where they stand, else the worker finds a place and builds one (they wait for it). */
function arrive() {
  const a = G.meta.arrive, v = a.known ? G.mirror.get(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)) : 0;
  if ((v & 0xFFF) === ID.nether_portal) { G.meta.arrive = null; return; }
  if (a.known) forgetPortal(G.dim, a.at);
  G.arriving = true;
  G.worker.postMessage({type: 'portal', x: a.x, y: a.y, z: a.z, id: 1});
}
function arrived(m) {
  const b = G.body;
  Object.assign(b, {x: m.x + (m.axis ? 0.5 : 1), y: m.y, z: m.z + (m.axis ? 1 : 0.5), vx: 0, vy: 0, vz: 0, fall: 0});
  b.prev = {x: b.x, y: b.y, z: b.z};
  addPortal(G.dim, [m.x, m.y, m.z, m.axis]);
  G.meta.arrive = null; G.arriving = false; G.portalBlocked = 'wait'; G.portalWaitT = 0;
}
/** Standing in a portal: four seconds (at once in creative), the screen swirling purple, and through. */
function portalTick() {
  const b = G.body, at = y => (G.mirror.get(Math.floor(b.x), Math.floor(y), Math.floor(b.z)) & 0xFFF) === ID.nether_portal;
  // just come through: the portal's blocks may reach this copy of the world a moment after the player does, so it
  // counts as stepping out only once they have been seen standing in it (or after five seconds)
  if (!at(b.y + 0.2) && !at(b.y + 1.2)) {
    if (G.portalBlocked === 'wait' && ++G.portalWaitT < 100) return false;
    G.portalBlocked = false; G.inPortal = Math.max(0, G.inPortal - 4); return false;
  }
  if (G.portalBlocked === 'wait') G.portalBlocked = true;
  if (G.portalBlocked) return false;
  if (G.inPortal === 0) play('portal');
  if (G.ticks % 4 === 0) G.ents.puff(b.x, b.y + 1, b.z, 'portal');
  if (++G.inPortal < (G.mode === 'creative' ? 1 : 80)) return false;
  G.inPortal = 0; G.portalBlocked = true;
  travel();
  return true;
}

// ---------- potions ----------
/** A potion drunk: what it does, the bottle left. Water does nothing. */
function drink(s) {
  applyPotion(G.effects, s.pot, {heal: n => { G.health = Math.min(20, G.health + n); }, harm: n => hurt(n, '被魔法杀死了', null, 'magic')});
  // the empty bottle stays in the hand
  if (G.mode !== 'creative') { useUp(); handBack({id: 'glass_bottle', n: 1}); }
  play('burp'); drawHud(true); drawEffects();
}
/** What is left of a thing used up (a bottle, a bowl, a bucket): in the hand if that is empty now, else in the bag (or it falls). */
function handBack(stack) {
  const left = G.inv.slots[G.hot] ? G.inv.add(stack) : (G.inv.slots[G.hot] = stack, null);
  if (left) G.ents.drop(left, G.body.x, G.body.y + 1, G.body.z);
}
/** Milk: every effect gone (the golden hearts too); the empty bucket stays in the hand. */
function drinkMilk() {
  for (const k of Object.keys(G.effects)) delete G.effects[k];
  G.absorb = 0;
  if (G.mode !== 'creative') { useUp(); handBack({id: 'bucket', n: 1}); }
  play('burp'); drawHud(true); drawEffects();
}
/** An effect from food (a golden apple's); 伤害吸收 gives its golden hearts at once (two a level). */
// ---------- large chests ----------
/** Chests of one kind: a chest joins a chest, a trapped chest a trapped chest (in water or not). */
const sameChest = (n, b) => BLOCKS[n & 0xFFF].use === 'chest' && (BLOCKS[n & 0xFFF].rs || '') === (b.rs || '');
/** Which half of a large chest a chest (b) put at (x, y, z) facing f makes (1 the left, 2 the right, as seen from in
 *  front) with a single chest of its kind and facing beside it; 0 when there is none. */
function chestHalf(x, y, z, f, b) {
  const [fx, fz] = DIR[f], lx = -fz, lz = fx;
  for (const [dx, dz, half] of [[lx, lz, 2], [-lx, -lz, 1]]) {
    const n = G.mirror.get(x + dx, y, z + dz);
    if (sameChest(n, b) && (n >>> 12 & 3) === f && !(n >>> 14 & 3)) return half;
  }
  return 0;
}
/** A chest put down as a large chest's half: the other half becomes the other side, and the two share 54 slots (the
 *  left half's 27 first). */
function pairChest(x, y, z) {
  const v = G.mirror.get(x, y, z), meta = v >>> 12, half = meta >> 2 & 3;
  if (half !== 1 && half !== 2) return;
  const [fx, fz] = DIR[meta & 3], [sx, sz] = half === 1 ? [fz, -fx] : [-fz, fx], px = x + sx, pz = z + sz, pv = G.mirror.get(px, y, pz);
  if (!sameChest(pv, BLOCKS[v & 0xFFF])) { setBlock(x, y, z, withMeta(v & 0xFFF, meta & 3)); return; }
  setBlock(px, y, pz, withMeta(pv & 0xFFF, (pv >>> 12 & 3) | (3 - half) << 2));
  const k = `${x},${y},${z}`, pk = `${px},${y},${pz}`, mine = G.tiles[k], other = G.tiles[pk] ||= {kind: 'chest', slots: lootOf(pk, px, y, pz) || new Array(27).fill(null)};
  const [left, right] = half === 1 ? [mine, other] : [other, mine], slots = [...left.slots.slice(0, 27), ...right.slots.slice(0, 27)];
  Object.assign(left, {slots, half: 'left', pair: half === 1 ? pk : k});
  Object.assign(right, {slots, half: 'right', pair: half === 1 ? k : pk});
}
/** A large chest's half on its own again: its own 27 slots kept (the other half's to it, the other half a chest of its
 *  own with its 27). */
function unpairChest(k, tile) {
  const other = G.tiles[tile.pair], own = tile.half === 'left' ? tile.slots.slice(0, 27) : tile.slots.slice(27, 54);
  if (other?.pair === k) {
    other.slots = other.half === 'left' ? tile.slots.slice(0, 27) : tile.slots.slice(27, 54);
    const [ox, oy, oz] = tile.pair.split(',').map(Number), ov = G.mirror.get(ox, oy, oz);
    if (BLOCKS[ov & 0xFFF].use === 'chest') setBlock(ox, oy, oz, withMeta(ov & 0xFFF, ov >>> 12 & 3));
    delete other.pair; delete other.half;
  }
  tile.slots = own.length === 27 ? own : new Array(27).fill(null); delete tile.pair; delete tile.half;
}
/** What a chest opens: its own 27, or a large chest's 54 (its two halves'); a half whose other half is gone is a
 *  chest of its own again. */
function chestView(k, tile, t) {
  if (!tile.pair) return tile;
  if (G.tiles[tile.pair]?.pair === k && G.tiles[tile.pair].slots === tile.slots && (t.v >>> 14 & 3)) return {kind: 'chest', slots: tile.slots, title: '大型箱子'};
  unpairChest(k, tile);
  setBlock(t.x, t.y, t.z, withMeta(t.v & 0xFFF, t.v >>> 12 & 3));
  return tile;
}
/** A chest the land was made with, opened (or broken) for the first time: its things from its loot table (null when it
 *  is not one). A treasure map in it leads to the buried treasure nearest the chest. */
function lootOf(k, x, y, z) {
  const table = G.loot[k];
  if (!table) return null;
  delete G.loot[k];
  const seed = G.meta.seed;
  return lootChest(table, seed, x, y, z, {map: () => { const t = treasureNear(seed, x, z); return t ? G.maps.treasure(seed, t) : null; }});
}
/** A block's colour for maps: its top picture's average (tinted as it is drawn). */
function blockColor(id) {
  const b = BLOCKS[id], name = b.tex?.top || b.tex?.all || b.tex?.side, d = built?.layers[LAYER[name]];
  if (!d) return null;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
  if (!n) return null;
  const tint = b.tint === 'grass' ? 0x91bd59 : b.tint === 'foliage' ? 0x77ab2f : b.tint?.startsWith?.('#') ? parseInt(b.tint.slice(1), 16) : 0xFFFFFF;
  return [r / n * (tint >> 16 & 255) / 255, g / n * (tint >> 8 & 255) / 255, bl / n * (tint & 255) / 255];
}
/** The sea's things each tick: the compass and the clock turning, a map in hand drawn in and shown, conduits, the
 *  effects that change the body (jumping). */
function seaTick() {
  const b = G.body;
  // the compass points to the world's spawn, the clock shows the time (the game's frames: the needle up when facing it,
  // the dial at noon at 0); in the Nether both spin
  if (G.dim === 'nether') { dials.compass = (dials.compass + 1 + (Math.random() < 0.4 ? 1 : 0)) % 32; dials.clock = (dials.clock + 3) % 64; }
  else {
    const dx = G.spawn.x - b.x, dz = G.spawn.z - b.z, fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
    dials.compass = ((Math.round(16 + rel / (Math.PI * 2) * 32) % 32) + 32) % 32;
    dials.clock = Math.floor((((G.time - 6000) % 24000 + 24000) % 24000) / 24000 * 64) % 64;
  }
  b.jumpBoost = G.effects.jump_boost ? G.effects.jump_boost.amp + 1 : 0;
  // a map in hand: drawn in round its holder, and shown
  const s = held(), m = s?.id === 'filled_map' ? G.maps.get(s.map) : null;
  if (m && m.dim === G.dim && G.ticks % 2 === 0) G.maps.explore(m, b.x, b.z, (x, y, z) => G.mirror.get(x, y, z), (x, z) => G.mirror.top(x, z));
  showMap(m);
  if (G.ticks % 40 === 0) conduitsTick();
}
/**
 * 冰霜行者 (the game's): walking on the ground, the still water just under the feet within 2 + the level (at most 16)
 * with air over it freezes into frosted ice, which melts again by itself (the world does that).
 */
function frostWalk() {
  const b = G.body, lv = enchOf(G.inv.worn(3), 'frost_walker');
  if (!lv || !b.onGround || G.riding || G.dead) return;
  const r = Math.min(16, 2 + lv), y = Math.floor(b.y + 0.01) - 1, bx = Math.floor(b.x), bz = Math.floor(b.z);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = bx + dx, z = bz + dz;
    if (Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y, z + 0.5 - b.z) > r) continue;
    const v = G.mirror.get(x, y, z);
    if ((v & 0xFFF) === ID.water && !(v >>> 12) && !G.mirror.get(x, y + 1, z)) setBlock(x, y, z, ID.frosted_ice);
  }
}
/** Burning: the fire's own picture (as it flickers) over the bottom of the view, at both sides (the game's). */
let fireShown = false, fireAt = -1;
function fireView(on) {
  const el = $('.fireview');
  if (on !== fireShown) { el.style.display = on ? 'block' : 'none'; fireShown = on; fireAt = -1; }
  const an = on && animFrames.find(a => a.layer === LAYER.fire_1);
  if (!an || an.at < 0 || an.at === fireAt) return;
  fireAt = an.at;
  const n = built.size, img = new ImageData(new Uint8ClampedArray(an.frames[an.at]), n, n);
  for (const c of el.querySelectorAll('canvas')) { if (c.width !== n) { c.width = n; c.height = n; } c.getContext('2d').putImageData(img, 0, 0); }
}
let mapShown = null, mapPaintAt = 0;
// ---------- the conduit, drawn ----------
// its cage turns round this slanted line (the game's), here as the part's x, y, z turns
const CAGE_AXIS = [0.5, 1, 0.5].map(v => v / Math.hypot(0.5, 1, 0.5));
function axisTurns([ux, uy, uz], a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  const r00 = t * ux * ux + c, r10 = t * ux * uy + s * uz, r20 = t * ux * uz - s * uy, r21 = t * uy * uz + s * ux, r22 = t * uz * uz + c;
  return [Math.atan2(r21, r22), -Math.asin(Math.max(-1, Math.min(1, r20))), Math.atan2(r10, r00)];
}
let windFrames = {h: [], v: []};
/** A strip of frames (a pack's whirling water: each frame half as high as it is wide) cut into pictures. */
function cutFrames(strip) {
  const w = strip.width, fh = Math.max(1, w / 2), n = Math.max(1, Math.floor(strip.height / fh));
  return Array.from({length: n}, (_, i) => { const c = document.createElement('canvas'); c.width = w; c.height = fh; c.getContext('2d').drawImage(strip, 0, i * fh, w, fh, 0, 0, w, fh); return c; });
}
/**
 * The conduits near, as the game draws them: asleep, its shell, still; awake, a cage turning round a slanted line and
 * bobbing, an eye in it turned to the camera (open while it hunts a monster), and the water whirling round it in two
 * boxes (turned another way every 66 ticks, its picture going on every 3).
 */
function conduitModels(view, a, light) {
  const out = [], t = (G.ticks || 0) + a;
  for (const [x, y, z, tile] of G.conduitList || []) {
    const id = G.mirror.get(x, y, z) & 0xFFF;
    if ((id !== ID.conduit && id !== ID.waterlogged_conduit) || Math.abs(x + 0.5 - view.x) > 96 || Math.abs(z + 0.5 - view.z) > 96) continue;
    const L = [light(x, y, z)[0], 15], at = {x: x + 0.5 - view.x, y: y - view.y, z: z + 0.5 - view.z, yaw: 0};
    const push = (model, skin, rot, pose = {}) => { if (skinSizes[skin]) out.push({skin, verts: new Float32Array(buildModel(model, rot, {...at, ...pose}, [], skinSizes[skin])), light: L, tint: [1, 1, 1], hurt: 0, white: 0}); };
    const spin = (tile.rot || 0) + (tile.active && tile.awakeAt != null ? (t - tile.awakeAt) * -0.0375 : 0);
    if (!tile.active) { push('conduit_shell', 'conduit_shell', {shell: [0, spin, 0]}); continue; }
    const f = Math.sin(t * 0.1) / 2 + 0.5, lift = (f * f + f) * 0.2 - 0.2;
    push('conduit_cage', 'conduit_cage', {cage: axisTurns(CAGE_AXIS, spin)}, {y: at.y + lift});
    const phase = Math.floor((G.ticks || 0) / 66) % 3, frames = phase === 1 ? windFrames.v : windFrames.h, w = frames[Math.floor(t / 3) % Math.max(1, frames.length)];
    if (w) {
      push('conduit_wind', w, {wind: phase === 1 ? [Math.PI / 2, 0, 0] : phase === 2 ? [0, 0, Math.PI / 2] : [0, 0, 0]});
      push('conduit_wind', w, {wind: [Math.PI, 0, Math.PI]}, {s: 0.875, y: at.y + 0.0625});
    }
    const ex = x + 0.5, ey = y + 0.5 + lift, ez = z + 0.5, dx = view.x - ex, dy = view.y - ey, dz = view.z - ez, l = Math.hypot(dx, dy, dz) || 1, s = 2 / 3;
    push('conduit_eye', tile.hunting ? 'conduit_eye_open' : 'conduit_eye_closed', {eye: [Math.asin(-dy / l), 0, 0]}, {y: at.y + lift + 0.5 - s / 2, yaw: Math.atan2(-dx, -dz), s});
  }
  return out;
}
function showMap(m) {
  const el = $('.mapview');
  if (!m || paused || invUI.open || G.dead) { if (mapShown) { el.style.display = 'none'; mapShown = null; } return; }
  if (mapShown !== m) { el.style.display = 'block'; mapShown = m; mapPaintAt = 0; }
  if (performance.now() - mapPaintAt < 150) return;
  mapPaintAt = performance.now();
  const b = G.body;
  G.maps.paint(el.querySelector('canvas').getContext('2d'), m, {x: b.x, z: b.z, yaw: b.yaw, dim: G.dim});
}
// ---------- conduits ----------
/**
 * The game's conduits, every two seconds: one standing in water with water all round it and at least 16 blocks of
 * its frame works — 潮涌能量 for 13 seconds to the player within 16 blocks for every 7 of the frame, in the water or
 * the rain; with the whole frame (42) it also hurts the nearest monster in the water within 8 blocks.
 */
function conduitsTick() {
  const b = G.body, get = (x, y, z) => G.mirror.get(x, y, z), sky = (x, y, z) => G.mirror.light(Math.floor(x), Math.floor(y), Math.floor(z))[0] >= 15;
  G.conduitList = [];
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.kind !== 'conduit') continue;
    const [x, y, z] = k.split(',').map(Number);
    G.conduitList.push([x, y, z, tile]);
    if (!G.mirror.has(x, z) || Math.abs(x - b.x) > 128 || Math.abs(z - b.z) > 128) continue;
    const id = G.mirror.get(x, y, z) & 0xFFF;
    if (id !== ID.conduit && id !== ID.waterlogged_conduit) { delete G.tiles[k]; continue; }
    const frame = conduitFrame(get, x, y, z), was = tile.active;
    tile.active = frame >= 16;
    if (tile.active && !was) play('bell');
    // (its turning: kept where it stopped while it sleeps; whether it is after a monster: its eye open)
    if (tile.active && (tile.awakeAt == null || tile.awakeAt > G.ticks)) tile.awakeAt = G.ticks;
    if (!tile.active && was && tile.awakeAt != null) { tile.rot = (tile.rot || 0) + (G.ticks - tile.awakeAt) * -0.0375; delete tile.awakeAt; }
    tile.hunting = false;
    if (!tile.active) continue;
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    if (Math.hypot(b.x - cx, b.y + 0.9 - cy, b.z - cz) <= Math.floor(frame / 7) * 16 && (b.inWater || (fallsAt(Math.floor(b.x), Math.floor(b.z)) === 'rain' && sky(b.x, b.y + 1.6, b.z)))) giveEffect('conduit_power', 0, 260);
    if (frame >= 42) {
      let best = null, bd = 8;
      for (const mob of G.mobs.list) { if (!mob.def.hostile || mob.dead || !mob.body?.inWater) continue; const d = Math.hypot(mob.x - cx, mob.y - cy, mob.z - cz); if (d < bd) { bd = d; best = mob; } }
      if (best) { tile.hunting = true; G.mobs.hurt(best, 4, null, 'magic'); for (let t = 0; t <= 1; t += 0.2) G.ents.puff(cx + (best.x - cx) * t, cy + (best.y + 0.5 - cy) * t, cz + (best.z - cz) * t, 'swirl', 0x1DC2D1); }
    }
    // the sea's bits drift into it
    for (let n = 0; n < 4; n++) { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2; G.ents.puff(cx + Math.cos(a) * r, cy + (Math.random() - 0.5) * 2, cz + Math.sin(a) * r, 'swirl', 0x8fd8ff); }
  }
}
function giveEffect(id, amp, ticks) {
  addEffect(G.effects, id, amp, ticks);
  if (id === 'absorption') G.absorb = Math.max(G.absorb || 0, 4 * (amp + 1));
  drawEffects();
}
// how fast each thrown thing leaves the hand, how much it rises over the aim, and how fast it falls (the game's, a tick)
const THROWN = {splash_potion: [0.5, 0.1, 0.05], experience_bottle: [0.7, 0.2, 0.07], snowball: [1.5, 0, 0.03], egg: [1.5, 0, 0.03], ender_pearl: [1.5, 0, 0.03]};
/** Something thrown the way the player looks: a splash potion, a bottle o' enchanting, a snowball, an egg. */
function throwItem(s) {
  const d = G.body.look(), eye = eyePos();
  launch(s, eye[0] + d[0] * 0.3, eye[1] - 0.1, eye[2] + d[2] * 0.3, d);
  Object.assign(G.thrown.at(-1), {owner: 'player', dim: G.dim});
  G.swing = 6; play('throw');
}
/** One of a stack sent flying from a place along d (by the player, or a dispenser). */
function launch(s, x, y, z, d) {
  const [speed, up, g] = THROWN[s.id] || THROWN.snowball;
  G.thrown.push({x, y, z, vx: d[0] * speed, vy: d[1] * speed + up, vz: d[2] * speed, g, s: {...s, n: 1}, age: 0});
}
/** Thrown things fly (falling a little), and land on a block or a mob. */
function thrownTick() {
  for (let i = G.thrown.length - 1; i >= 0; i--) {
    const p = G.thrown[i];
    p.vy -= p.g ?? 0.05; p.vx *= 0.99; p.vy *= 0.99; p.vz *= 0.99;
    const len = Math.hypot(p.vx, p.vy, p.vz) || 1, hit = raycast(G.mirror, p.x, p.y, p.z, p.vx / len, p.vy / len, p.vz / len, len, false, true);
    const mob = G.mobs.raycast(p.x, p.y, p.z, p.vx / len, p.vy / len, p.vz / len, len);
    if (hit || mob || ++p.age > 200) {
      const onMob = mob && (!hit || mob.t < hit.t), t = onMob ? mob.t : hit ? hit.t : len;
      landed(p, p.x + p.vx / len * t, p.y + p.vy / len * t, p.z + p.vz / len * t, onMob ? mob.mob : null);
      G.thrown.splice(i, 1); continue;
    }
    p.x += p.vx; p.y += p.vy; p.z += p.vz;
  }
}
/**
 * Where a thrown thing comes down: a splash potion breaks over everyone within four blocks; a bottle o' enchanting
 * leaves 3–11 experience; a snowball or an egg breaks into bits, knocking a mob it hit back unhurt (a snowball hurts a
 * blaze); an egg hatches a chick one time in eight (four chicks one time in 32 of those).
 */
function landed(p, x, y, z, mob) {
  const id = p.s.id;
  // an ender pearl takes its thrower there (just short of what it hit), with five points of a fall's harm
  if (id === 'ender_pearl') {
    G.ents.puff(x, y, z, 'portal'); soundAt('enderman_teleport', x, y, z);
    if (p.owner !== 'player' || G.dead || p.dim !== G.dim) return;
    const b = G.body, l = Math.hypot(p.vx, p.vz) || 1, at = {x: x - p.vx / l * 0.31, y: p.vy > 0 && !mob ? y - 1.81 : y, z: z - p.vz / l * 0.31};
    Object.assign(b, at, {vx: 0, vy: 0, vz: 0, fall: 0}); Object.assign(b.prev, at);
    hurt(5, '摔得太重了', null, 'fall');
    return;
  }
  if (id === 'splash_potion') { splash(x, y, z, p.s.pot); return; }
  if (id === 'experience_bottle') { G.ents.puff(x, y, z, 'shatter', 0x5a8cff); soundAt('glass', x, y, z); G.ents.xp(3 + Math.floor(Math.random() * 5) + Math.floor(Math.random() * 5), x, y + 0.2, z); return; }
  G.ents.crumbs(x, y, z, id);
  if (mob) G.mobs.hurt(mob, id === 'snowball' && mob.kind === 'blaze' ? 3 : 0, {x: x - p.vx, z: z - p.vz, player: true}, 'thrown');
  if (id === 'egg' && Math.random() < 1 / 8) for (let k = Math.random() < 1 / 32 ? 4 : 1; k > 0; k--) G.mobs.add('chicken', x, y, z, {baby: true});
}
function splash(x, y, z, pot) {
  G.ents.puff(x, y, z, 'shatter', potionColor(pot)); soundAt('glass', x, y, z);
  const b = G.body, d = Math.hypot(b.x - x, b.y + 0.9 - y, b.z - z);
  if (d < 4) applyPotion(G.effects, pot, {share: 1 - d / 4, heal: n => { G.health = Math.min(20, G.health + n); drawHud(true); }, harm: n => hurt(n, '被魔法杀死了', null, 'magic')});
  // mobs: the instant ones (undead the other way round)
  for (const m of G.mobs.list) {
    const dm = Math.hypot(m.x - x, m.y + m.body.height / 2 - y, m.z - z);
    if (m.dead || dm >= 4) continue;
    applyPotion({}, pot, {share: 1 - dm / 4, heal: n => { if (m.def.undead) G.mobs.hurt(m, n, null, 'magic'); else m.health = Math.min(m.def.health, m.health + n); },
      harm: n => { if (m.def.undead) m.health = Math.min(m.def.health, m.health + n); else G.mobs.hurt(m, n, null, 'magic'); }});
  }
  drawEffects();
}
let fxKey = '';
/** The effects on the player, top right: a dot of its colour, its name and level, the time left. */
function drawEffects() {
  if (!G) return;
  const list = Object.entries(G.effects), key = list.map(([id, e]) => `${id}${e.amp}${Math.ceil(e.t / 20)}`).join();
  if (key === fxKey) return;
  fxKey = key;
  $('.effects').innerHTML = list.map(([id, e]) => { const c = EFFECTS[id], secs = Math.ceil(e.t / 20); return `<div class="fx${c.good ? '' : ' bad'}"><i style="background:#${c.color.toString(16).padStart(6, '0')}"></i>${c.zh}${levelName(e.amp)}<b>${c.instant ? '' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</b></div>`; }).join('');
}


// ---------- difficulty, game rules, commands ----------
const difficulty = () => G?.meta.difficulty || 'normal';
const rules = () => (G.meta.rules ||= defaultRules());
function setDifficulty(d) {
  G.meta.difficulty = d;
  // peaceful: the monsters there are gone
  if (d === 'peaceful') G.mobs.list = G.mobs.list.filter(m => !m.def.hostile);
  drawHud(true);
}
function setMode(m) { G.mode = m; if (m === 'survival') G.body.flying = false; drawHud(true); }
/** What a command (commands.js) can do to the game. */
const commandCtx = () => ({
  get time() { return G.time; }, setTime: t => { G.time = t; },
  weather: k => { const w = G.weather; Object.assign(w, {raining: k !== 'clear', thundering: k === 'thunder', rain: k === 'clear' ? 0 : 1, thunder: k === 'thunder' ? 1 : 0, rainT: 6000 + Math.floor(Math.random() * 12000), thunderT: 6000 + Math.floor(Math.random() * 12000)}); },
  get mode() { return G.mode; }, setMode,
  get difficulty() { return difficulty(); }, setDifficulty,
  give: (id, n) => { while (n > 0) { const k = Math.min(n, stackMax(id)); n -= k; const left = G.inv.add({id, n: k}); if (left) { const b = G.body; G.ents.drop(left, b.x, b.y + 1, b.z); } } drawHud(true); },
  pos: () => [G.body.x, G.body.y, G.body.z],
  teleport: (x, y, z) => { const b = G.body; Object.assign(b, {x, y, z, vx: 0, vy: 0, vz: 0, fall: 0}); b.prev = {x, y, z}; },
  kill: () => { const m = G.mode; G.mode = 'survival'; G.invuln = 0; hurt(1000, '自杀了', null, 'void'); if (!G.dead) G.mode = m; },
  summon: (kind, x, y, z) => { G.mobs.add(kind, x, y, z); },
  effect: (id, secs, amp) => { G.effects[id] = {amp, t: Math.round(secs * 20)}; if (id === 'absorption') G.absorb = Math.max(G.absorb || 0, 4 * (amp + 1)); drawEffects(); drawHud(true); },
  clearEffects: () => { G.effects = {}; G.absorb = 0; drawEffects(); drawHud(true); },
  clear: () => { let n = 0; for (let i = 0; i < G.inv.slots.length; i++) if (G.inv.slots[i]) { n += G.inv.slots[i].n; G.inv.slots[i] = null; } drawHud(true); return n; },
  addXp: (n, levels) => { if (levels) G.xp.level = Math.max(0, G.xp.level + n); else gainXp(n); drawHud(true); },
  setSpawn: () => { const b = G.body; G.spawn = {x: b.x, y: b.y, z: b.z}; },
  get seed() { return G.meta.seedText ?? G.meta.seed; },
  get rules() { return rules(); }, setRule: (k, on) => { rules()[k] = on; },
  // /setblock and /fill: only in land that is loaded, inside the world's height; what a block kept goes with it
  setBlocks: (list, keep) => {
    if (list.some(([x, y, z]) => y < MINY || y >= MINY + HEIGHT)) return '那里出了世界的高度';
    if (list.some(([x, y, z]) => !G.mirror.has(x, z))) return '那里还没加载';
    let n = 0;
    for (const [x, y, z, name] of list) {
      const was = G.mirror.get(x, y, z), v = ID[name] || 0;
      if ((keep && was) || was === v) continue;
      delete G.tiles[`${x},${y},${z}`];
      setBlock(x, y, z, v); makeTile(x, y, z, BLOCKS[v]); n++;
      // a door comes with its upper half (where there is room)
      if (BLOCKS[v].shape === 'door' && y + 1 < MINY + HEIGHT && !G.mirror.get(x, y + 1, z)) setBlock(x, y + 1, z, withMeta(v, 8));
    }
    return n;
  },
});
/** The chat bar (T, or / to start a command): what is typed is run as a command; the answers show over the game. */
let chatEl = null;
function chatLog(text, ok = true) {
  const log = $('.chatlog');
  for (const line of String(text).split('\n')) {
    if (!line) continue;
    const d = document.createElement('div');
    d.className = ok ? '' : 'bad'; d.textContent = line;
    log.append(d);
    setTimeout(() => d.classList.add('old'), 8000);
  }
  while (log.children.length > 12) log.firstElementChild.remove();
}
function openChat(start = '') {
  if (!G || G.dead || paused || invUI.open || chatEl) return;
  input.enabled = false; input.unlock();
  const bar = chatEl = document.createElement('div');
  bar.className = 'chatbar';
  bar.innerHTML = '<input type="text" maxlength="256" autocomplete="off" spellcheck="false" placeholder="输入指令，比如 /time set day（/help 看全部）">';
  $('.chatlog').after(bar);
  const box = bar.firstElementChild;
  box.value = start;
  $('.chatlog').classList.add('open');
  setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }, 0);
  const close = () => { if (chatEl !== bar) return; bar.remove(); chatEl = null; $('.chatlog').classList.remove('open'); if (G && !paused && !G.dead) { input.enabled = true; if (input.mode !== 'touch') input.lock(); } };
  box.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = box.value.trim();
      if (line) {
        chatLog(line, true);
        // (what does not start with / is said, as in the game; only commands do anything here)
        if (line.startsWith('/')) { const r = runCommand(line, commandCtx()); if (r.text) chatLog(r.text, r.ok); }
      }
      close();
    }
  });
  box.addEventListener('blur', () => setTimeout(close, 200));
}

// ---------- the day ----------
/** Light and colours at a time (ticks, 24000 a day; 0 is sunrise). Rain and thunder darken the sky and the light. */
function environment(time) {
  // the Nether: no sky, no sun; dark red fog, and a little light everywhere (the game's ambient tenth)
  if (G?.dim === 'nether') {
    const fog = [0.2, 0.03, 0.03];
    return {daylight: 0, skyTop: fog, horizon: fog, fog, glow: [1, 0.48, 0.18], glowAmt: 0, sunAngle: 0, sunDir: [0, -1, 0], stars: 0, skyLight: [1, 1, 1], cloudColor: fog, moonPhase: 0, cloudShift: 0, sunMoon: 0,
      gamma: settings.gamma, wave: settings.wave, clouds: false, time: performance.now() / 1000, flicker: 0.92 + Math.sin(performance.now() / 90) * 0.03 + Math.sin(performance.now() / 37) * 0.02, nether: true, bright: 0.14};
  }
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
  // 光影: some mornings (about half, each world its own) a mist lies in the low places, from before sunrise until the
  // sun is well up, thinner or thicker
  const tod = ((time % 24000) + 24000) % 24000, morning = Math.floor((time + 1500) / 24000);
  let roll = Math.imul(morning ^ (G?.meta?.seed || 0), 0x2c1b3c6d) ^ 0x297a2d39; roll = (Math.imul(roll ^ (roll >>> 15), 0x85ebca6b) >>> 0) / 4294967296;
  const lies = tod >= 22500 ? Math.min(1, (tod - 22500) / 1000) : tod < 3500 ? Math.min(1, (3500 - tod) / 2500) : 0;
  const mist = roll < 0.5 ? (0.45 + roll * 1.1) * lies * (1 - rain) : 0;
  // a rainbow for two minutes after a real rain has stopped (coming in over ten seconds, going over the last forty),
  // while the sun is up; where it shows is the sky's affair (round the point opposite the sun, so not at noon)
  const bowAge = G?.bowAt != null ? time - G.bowAt : 1e9, ease = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rainbow = bowAge >= 0 && bowAge < 2400 ? ease(bowAge, 0, 200) * (1 - ease(bowAge, 1600, 2400)) * Math.max(0, Math.min(1, el * 5)) * (1 - rain) : 0;
  return {
    daylight: dayLit, skyTop: top, horizon, fog: horizon, glow: [1, 0.48, 0.18], glowAmt, sunAngle: a, sunDir: [Math.cos(a), el, 0], stars: Math.max(0, 1 - day * 1.6) * (1 - rain),
    skyLight: lerp([0.62, 0.68, 0.95], [1, 1, 1], dayLit).map((v, i) => v * (1 - glowAmt * 0.15 * (i === 2 ? 1 : 0))),
    cloudColor: lerp([0.08, 0.09, 0.13], [1, 1, 1], day).map(v => v * (1 - rain * 0.45)), moonPhase: Math.floor(time / 24000) % 8, cloudShift: time * 0.03, sunMoon: 1 - rain,
    gamma: settings.gamma, wave: settings.wave, clouds: settings.clouds, time: performance.now() / 1000, flicker: 0.92 + Math.sin(performance.now() / 90) * 0.03 + Math.sin(performance.now() / 37) * 0.02,
    // for 光影: the storm, a lightning flash, and a snowy place (the aurora at night)
    thunder, flash: !!flash, cold: !!b?.cold, mist, wet: G?.wet || 0, rainbow,
  };
}

// ---------- weather ----------
/** What falls on a column now: 'rain', 'snow' (cold places) or null (dry places, or no rain). */
function fallsAt(x, z) {
  if (!G || G.dim === 'nether' || G.weather.rain < 0.2) return null;
  const b = BIOMES[G.mirror.biome(x, z)];
  return b?.dry ? null : b?.cold ? 'snow' : 'rain';
}
/** The highest block that stops rain on a column (cached for a second), +1. */
function topAt(x, z) {
  const k = `${x},${z}`, c = G.tops.get(k);
  if (c && G.ticks - c[1] < 20) return c[0];
  let y = Math.min(MINY + HEIGHT - 1, Math.floor(G.body.y) + 40);
  while (y > MINY && !G.mirror.get(x, y, z)) y--;
  G.tops.set(k, [y + 1, G.ticks]);
  return y + 1;
}
/** The game's cycle: clear for half a day to a week, rain for half a day to a day; thunder on its own clock, only while it rains. */
function weatherTick() {
  // no weather in the Nether
  if (G.dim === 'nether') { setRain(0); if (G.flash > 0) G.flash--; return; }
  const w = G.weather, rnd = n => Math.floor(Math.random() * n);
  if (rules().doWeatherCycle) {
    if (--w.thunderT <= 0) { w.thundering = !w.thundering; w.thunderT = w.thundering ? 3600 + rnd(12000) : 12000 + rnd(168000); }
    if (--w.rainT <= 0) { w.raining = !w.raining; w.rainT = w.raining ? 12000 + rnd(12000) : 12000 + rnd(168000); }
  }
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
  // how wet the ground is (光影: the puddles): wetting over half a minute of rain, drying over two minutes after it;
  // not where it snows or never rains
  const here = BIOMES[G.mirror.biome(Math.floor(b.x), Math.floor(b.z))], wetTo = here?.dry || here?.cold ? 0 : w.rain, wet = G.wet || 0;
  G.wet = wetTo > wet ? Math.min(wetTo, wet + 1 / 600) : Math.max(wetTo, wet - 1 / 2400);
  // a rainbow when a real rain has stopped
  if (w.rain >= 0.5 && fallsAt(Math.floor(b.x), Math.floor(b.z)) === 'rain') G.rained = true;
  if (G.rained && w.rain < 0.15) { G.rained = false; G.bowAt = G.time; }
  if (w.rain > 0.2) raindrops(Math.round(w.rain * (6 + w.thunder * 3)));
}
/**
 * Raindrops landing round the player (the game's rain splashes): n places within ten blocks where rain reaches the
 * ground, a few drops jumping off the top of what is there (off water a lighter splash; plants let it through).
 */
function raindrops(n) {
  const bx = Math.floor(G.body.x), bz = Math.floor(G.body.z);
  for (let tries = n * 3; n > 0 && tries > 0; tries--) {
    const x = bx + Math.floor((Math.random() * 2 - 1) * 10), z = bz + Math.floor((Math.random() * 2 - 1) * 10);
    if (!G.mirror.has(x, z) || fallsAt(x, z) !== 'rain') continue;
    let y = topAt(x, z) - 1;
    if (Math.abs(y - G.body.y) > 20) continue;
    for (let k = 0; k < 4 && y > MINY; k++, y--) {
      const v = G.mirror.get(x, y, z), id = v & 0xFFF;
      if (!v) continue;
      if (id === ID.water) { G.ents.drip(x + Math.random(), y + 0.88, z + Math.random(), true); break; }
      const boxes = collisionBoxes(v);
      if (!boxes?.length) continue;
      const fx = Math.random(), fz = Math.random(), top = Math.max(...boxes.map(q => q[4]));
      G.ents.drip(x + fx, y + Math.min(1, top), z + fz, false);
      break;
    }
    n--;
  }
}
/** A lightning strike: a bolt, a flash, thunder; what is within three blocks is hit. */
function strike(x, y, z) {
  G.bolts.push({x, y, z, life: 8, seed: 1 + Math.floor(Math.random() * 1e6)});
  G.flash = 3;
  const b = G.body, d = Math.hypot(b.x - x, b.z - z);
  play('thunder', 0, Math.max(0.35, 1 - d / 96));
  if (d < 3 && Math.abs(b.y - y) < 4) hurt(5, '被闪电击中了', null, 'lightning');
  // fire where it strikes, and on normal and hard a few round it (the game's)
  if (rules().doFireTick !== false) {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), more = difficulty() === 'normal' || difficulty() === 'hard';
    setFire(fx, fy, fz);
    if (more) for (let k = 0; k < 4; k++) setFire(fx + Math.floor(Math.random() * 3) - 1, fy + Math.floor(Math.random() * 3) - 1, fz + Math.floor(Math.random() * 3) - 1);
  }
  for (const m of [...G.mobs.list]) {
    if (m.dead || Math.hypot(m.x - x, m.z - z) >= 3 || Math.abs(m.y - y) >= 4) continue;
    // a pig struck becomes a zombified piglin (the game's)
    if (m.kind === 'pig') { G.mobs.list.splice(G.mobs.list.indexOf(m), 1); G.mobs.add('zombified_piglin', m.x, m.y, m.z, {yaw: m.yaw}); continue; }
    G.mobs.hurt(m, 5, null, 'lightning'); m.fire = 160;
  }
}

/** Fire put at (x, y, z) where it can be (the game's: only into air, over something solid or by something that
 *  burns); over soul sand it is soul fire. True if it was put. */
function setFire(x, y, z) {
  if (!G.mirror.has(x, z) || G.mirror.get(x, y, z)) return false;
  const below = G.mirror.get(x, y - 1, z) & 0xFFF, soul = below === ID.soul_sand || below === ID.soul_soil;
  const burns = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => BLOCKS[G.mirror.get(x + dx, y + dy, z + dz) & 0xFFF]?.burn);
  if (!soul && !BLOCKS[below]?.solid && !burns) return false;
  setBlock(x, y, z, soul ? ID.soul_fire : ID.fire);
  return true;
}
/** The fire burning on the face of a block aimed at (the game's: hitting the block puts it out): [x, y, z] or null. */
function fireOn(t) {
  const [dx, dy, dz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face] || [0, 1, 0], v = G.mirror.get(t.x + dx, t.y + dy, t.z + dz) & 0xFFF;
  return v === ID.fire || v === ID.soul_fire ? [t.x + dx, t.y + dy, t.z + dz] : null;
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
function setBlock(x, y, z, v) {
  G.worker.postMessage(G.mirror.set(x, y, z, v));
  // (a campfire, a sign or a string put down is known at once)
  for (const [is, known] of [[CAMP, G.campfires], [SIGN, G.signs], [TRIP, G.tripwires]]) if (is[v & 0xFFF]) { const k = `${x >> 4},${z >> 4}`, list = known.get(k) || []; if (!list.some(p => p[0] === x && p[1] === y && p[2] === z)) known.set(k, [...list, [x, y, z]]); }
}

// ---------- campfires ----------
// (lit: state bit 4 clear, not standing in water)
const CAMP = new Uint8Array(4096);
for (const id of [ID.campfire, ID.soul_campfire, WATERLOGGED[ID.campfire], WATERLOGGED[ID.soul_campfire]]) CAMP[id] = 1;
const campLit = v => CAMP[v & 0xFFF] && !(v >>> 12 & 4) && !BLOCKS[v & 0xFFF].water;
const soulCamp = v => BLOCKS[v & 0xFFF].name.includes('soul_campfire');
// ---------- signs ----------
// each kind: its model, its wood's picture, its size, the board's face in model space [x0, y0, x1, y1], the picture of
// its words [w, h], the font's size, the lines' spacing, how long a line may be (the game's: 90 text units, hanging 60)
const SIGN_KIND = {
  sign: {skin: 'sign', s: 2 / 3, board: [-12, -14, 12, -2], pic: [192, 96], font: 16, gap: 20, limit: 180},
  wall_sign: {skin: 'sign', s: 2 / 3, board: [-12, -14, 12, -2], pic: [192, 96], font: 16, gap: 20, limit: 180},
  hanging_sign: {skin: 'hanging', s: 1, board: [-7, 0, 7, 10], pic: [140, 100], font: 15, gap: 20, limit: 126},
  wall_hanging_sign: {skin: 'hanging', s: 1, board: [-7, 0, 7, 10], pic: [140, 100], font: 15, gap: 20, limit: 126},
};
const signFont = px => `bold ${px}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
const SIGN = new Uint8Array(4096);
for (const b of BLOCKS) if (SIGN_KIND[b.shape]) SIGN[b.id] = 1;
/** The signs in a column the worker sent (as the campfires are kept). */
function signsIn(m) {
  const found = [];
  m.sections.forEach((s, si) => { if (s) for (let i = 0; i < 4096; i++) if (SIGN[s[i] & 0xFFF]) found.push([m.cx * 16 + (i & 15), MINY + si * 16 + (i >> 8), m.cz * 16 + (i >> 4 & 15)]); });
  const k = `${m.cx},${m.cz}`;
  if (found.length) G.signs.set(k, found); else G.signs.delete(k);
}
/**
 * How a sign stands: the way its front faces ([dx, dz]), its middle as the board is drawn from, and whether it is on
 * a wall (the game's: standing, sixteen ways, the board over a post; on a wall, the board against it, lower down).
 */
function signPose(x, y, z, v) {
  const m = v >>> 12, shape = BLOCKS[v & 0xFFF].shape;
  if (shape === 'sign') { const a = m * Math.PI / 8; return {model: 'sign', d: [-Math.sin(a), Math.cos(a)], at: [x + 0.5, y - 0.5, z + 0.5]}; }
  if (shape === 'wall_sign') { const [sx, sz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][m & 3]; return {model: 'wall_sign', d: [-sx, -sz], at: [x + 0.5 + sx * 0.4375, y - 0.8125, z + 0.5 + sz * 0.4375]}; }
  // hanging: its top at the block's top; under less than a full block its chains meet in a V
  if (shape === 'hanging_sign') {
    const a = m * Math.PI / 8, above = G.mirror.get(x, y + 1, z), full = !!above && (collisionBoxes(above) || []).some(q => q[0] === 0 && q[2] === 0 && q[3] === 1 && q[5] === 1 && q[1] === 0);
    return {model: full ? 'hanging_sign' : 'hanging_sign_v', d: [-Math.sin(a), Math.cos(a)], at: [x + 0.5, y - 0.875, z + 0.5]};
  }
  return {model: 'wall_hanging_sign', d: [[1, 0], [-1, 0], [0, 1], [0, -1]][m & 3], at: [x + 0.5, y - 0.875, z + 0.5]};
}
// the text's colours (a dye's), written plain they are darker (four tenths, the game's); glowing, with a dark outline
const SIGN_INK = {white: 0xffffff, orange: 0xff681f, magenta: 0xff00ff, light_blue: 0x9ac0cd, yellow: 0xffff00, lime: 0xbfff00, pink: 0xff69b4, gray: 0x808080,
  light_gray: 0xd3d3d3, cyan: 0x00ffff, purple: 0xa020f0, blue: 0x0000ff, brown: 0xa52a2d, green: 0x00ff00, red: 0xff0000, black: 0x000000};
const rgb = n => `rgb(${n >> 16 & 255},${n >> 8 & 255},${n & 255})`, darker = n => (Math.floor((n >> 16 & 255) * 0.4) << 16) | (Math.floor((n >> 8 & 255) * 0.4) << 8) | Math.floor((n & 255) * 0.4);
/** A side's words drawn for the board (192×96: two pixels to the game's text unit; four lines ten units apart). */
const signPics = new Map();
function signPicture(k, side, text, kind) {
  const state = JSON.stringify(text) + kind.font, had = signPics.get(`${k}|${side}`);
  if (had?.state === state) return had.name;
  const c = had?.canvas || document.createElement('canvas'), g = c.getContext('2d'), [W, H] = kind.pic;
  c.width = W; c.height = H; g.clearRect(0, 0, W, H);
  g.font = signFont(kind.font); g.textAlign = 'center'; g.textBaseline = 'middle';
  const ink = SIGN_INK[text.color] ?? 0, fill = text.glow ? (text.color === 'black' ? 0xf0ebcc : ink) : darker(ink);
  text.lines.forEach((line, i) => {
    if (!line) return;
    const y = H / 2 + (i - 1.5) * kind.gap;
    if (text.glow) { g.lineWidth = 4; g.strokeStyle = rgb(text.color === 'black' ? 0 : darker(ink)); g.strokeText(line, W / 2, y); }
    g.fillStyle = rgb(fill); g.fillText(line, W / 2, y);
  });
  const name = `signtext:${k}:${side}`;
  renderer.setImage(`mob:${name}`, c);
  signPics.set(`${k}|${side}`, {state, canvas: c, name});
  return name;
}
/** The signs near: the board (and post) in its wood, and the words on either side over it. */
function signModels(view, light) {
  const out = [];
  for (const list of G.signs.values()) for (const [x, y, z] of list) {
    const v = G.mirror.get(x, y, z), b = BLOCKS[v & 0xFFF];
    if (!SIGN[v & 0xFFF] || Math.hypot(x + 0.5 - G.body.x, z + 0.5 - G.body.z) > 64) continue;
    const kind = SIGN_KIND[b.shape], s = kind.s, k16 = s / 16, {model, d, at} = signPose(x, y, z, v), yaw = Math.atan2(-d[0], -d[1]), cy = Math.cos(yaw), sy = Math.sin(yaw), [sky, blk] = light(x, y, z);
    const ox = at[0] - view.x, oy = at[1] - view.y, oz = at[2] - view.z, skin = `${kind.skin}_${b.signWood}`;
    out.push({skin, verts: new Float32Array(buildModel(model, {}, {x: ox, y: oy, z: oz, yaw, s}, [], skinSizes[skin])), light: [sky, blk], tint: [1, 1, 1], hurt: 0, white: 0});
    // the words: a sheet over each face of the board (the game's model space, as buildModel places it)
    const tile = G.tiles[`${x},${y},${z}`];
    if (tile?.kind !== 'sign') continue;
    for (const [side, mz] of [['front', -1.12], ['back', 1.12]]) {
      const text = tile[side];
      if (!text?.lines.some(Boolean)) continue;
      const name = signPicture(`${x},${y},${z}`, side, text, kind), place = (mx, my) => { const lx = -mx * k16, ly = (24 - my) * k16, lz = mz * k16; return [ox + lx * cy + lz * sy, oy + ly, oz - lx * sy + lz * cy]; };
      // (read from in front of that side: the back's turned the other way)
      const [bx0, by0, bx1, by1] = kind.board, L = side === 'front' ? bx0 : bx1, R = side === 'front' ? bx1 : bx0, corners = [[L, by0, 0, 0], [R, by0, 1, 0], [R, by1, 1, 1], [L, by1, 0, 1]], vs = [];
      for (const order of [[0, 1, 2, 3], [3, 2, 1, 0]]) for (const i of order) { const [mx, my, u, w] = corners[i]; vs.push(...place(mx, my), u, w, 1); }
      out.push({skin: name, verts: new Float32Array(vs), light: text.glow ? [15, 15] : [sky, blk], tint: [1, 1, 1], hurt: 0, white: 0, noShadow: true});
    }
  }
  return out;
}
/** Which side of a sign the player is on: its front or its back. */
function signSide(x, y, z, v) { const {d} = signPose(x, y, z, v); return (G.body.x - (x + 0.5)) * d[0] + (G.body.z - (z + 0.5)) * d[1] >= 0 ? 'front' : 'back'; }
const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
/** Using a sign: a dye colours the words on the side the player is at, a glow ink sac makes them glow (an ink sac
 *  puts that out) — only where something is written; anything else opens that side to write on (the game's). */
function signUse(t, s) {
  const k = `${t.x},${t.y},${t.z}`, side = signSide(t.x, t.y, t.z, t.v), tile = G.tiles[k], text = tile?.[side];
  const dye = s && DYES.find(c => s.id === `${c}_dye`);
  if (text?.lines.some(Boolean) && (dye || s?.id === 'glow_ink_sac' || s?.id === 'ink_sac')) {
    if (dye && text.color !== dye) text.color = dye;
    else if (s.id === 'glow_ink_sac' && !text.glow) text.glow = true;
    else if (s.id === 'ink_sac' && text.glow) text.glow = false;
    else return;
    useUp(); play(s.id === 'ink_sac' ? 'splash' : 'pop');
    return;
  }
  editSign(k, side);
}
let signEl = null;
/** Writing on a sign: its side's four lines over a picture of it (each only as long as fits; the sign shows them as
 *  they are typed). Enter goes to the next line, on the last one (or 完成) it is done; Esc is done too. */
function editSign(k, side) {
  if (!G || G.dead || paused || invUI.open || chatEl || signEl) return;
  const [x, y, z] = k.split(',').map(Number), b = BLOCKS[G.mirror.get(x, y, z) & 0xFFF];
  if (!SIGN[b.id]) return;
  const tile = G.tiles[k] ||= {kind: 'sign'}, text = tile[side] ||= {lines: ['', '', '', ''], color: 'black', glow: false};
  input.enabled = false; input.unlock();
  const kind = SIGN_KIND[b.shape], hanging = kind.skin === 'hanging', el = signEl = document.createElement('div');
  const wood = (hanging ? {oak: '#b49156', spruce: '#7c5c37', birch: '#c8b67e', jungle: '#b18559', acacia: '#ae5c3b', dark_oak: '#6f5232', mangrove: '#783a35', cherry: '#d79b9b', bamboo: '#d7c35c'}
    : {oak: '#b8945f', spruce: '#82603a', birch: '#d7c185', jungle: '#b88764', acacia: '#ba6337', dark_oak: '#6a4628', mangrove: '#8a4440', cherry: '#e2b2a8', bamboo: '#d6c25a'})[b.signWood];
  el.className = 'signedit';
  el.innerHTML = `<div class="board" style="--wood:${wood}">${text.lines.map((l, i) => `<input type="text" autocomplete="off" spellcheck="false" data-i="${i}" aria-label="第 ${i + 1} 行">`).join('')}</div><button type="button">完成</button>`;
  $('.chatlog').after(el);
  const boxes = [...el.querySelectorAll('input')], g = document.createElement('canvas').getContext('2d');
  g.font = signFont(kind.font);
  const close = () => {
    if (signEl !== el) return;
    el.remove(); signEl = null;
    if (!tile.front?.lines.some(Boolean) && !tile.back?.lines.some(Boolean)) delete G.tiles[k];
    if (G && !paused && !G.dead) { input.enabled = true; if (input.mode !== 'touch') input.lock(); }
  };
  boxes.forEach((box, i) => {
    box.value = text.lines[i];
    box.addEventListener('input', () => { while (box.value && g.measureText(box.value).width > kind.limit) box.value = box.value.slice(0, -1); text.lines[i] = box.value; });
    box.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && i === 3)) { e.preventDefault(); close(); }
      else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); boxes[(i + 1) % 4].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); boxes[(i + 3) % 4].focus(); }
    });
  });
  el.querySelector('button').addEventListener('click', close);
  setTimeout(() => boxes[0].focus(), 0);
}
/**
 * A sign put down: standing on the top of a block (turned to face the player, sixteen ways) or on the side of one
 * (against it); not under a ceiling, and only on something solid. Then it is written on. True if it was put.
 */
function placeSign(t, b) {
  if (b.shape === 'hanging_sign') return placeHangingSign(t, b);
  if (t.face === 3) return false;
  const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face], tb = BLOCKS[t.v & 0xFFF];
  const into = tb.replace, x = into ? t.x : t.x + nx, y = into ? t.y : t.y + ny, z = into ? t.z : t.z + nz, here = G.mirror.get(x, y, z);
  if (here && !BLOCKS[here & 0xFFF].replace) return false;
  let v;
  if (t.face === 2 || into) {
    const under = G.mirror.get(x, y - 1, z);
    if (!under || !BLOCKS[under & 0xFFF].solid) return false;
    const deg = ((G.body.yaw * 180 / Math.PI) % 360 + 360) % 360;
    v = withMeta(b.id, Math.floor(16 - deg / 22.5 + 0.5) & 15);
  } else {
    if (!tb.solid) return false;
    v = withMeta(ID[b.wallSign], [3, 1, 0, 0, 0, 2][t.face]);
  }
  setBlock(x, y, z, v);
  delete G.tiles[`${x},${y},${z}`];
  setTimeout(() => editSign(`${x},${y},${z}`, 'front'), 0);
  return true;
}
/**
 * A hanging sign put up: under a block (or a fence, a wall, a chain …) hanging on its chains — under a full block
 * turned the four ways nearest to facing the player, under anything else sixteen ways; on the side of a block, on a bar
 * out of it, its face across the way to the player. Not on a floor. Then it is written on.
 */
function placeHangingSign(t, b) {
  if (t.face === 2) return false;
  const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face], tb = BLOCKS[t.v & 0xFFF];
  const x = t.x + nx, y = t.y + ny, z = t.z + nz, here = G.mirror.get(x, y, z), holds = tb.solid || ['fence', 'stonewall', 'chain', 'pane', 'gate'].includes(tb.shape);
  if ((here && !BLOCKS[here & 0xFFF].replace) || !holds) return false;
  let v;
  if (t.face === 3) {
    const full = (collisionBoxes(t.v) || []).some(q => q[0] === 0 && q[2] === 0 && q[3] === 1 && q[5] === 1 && q[1] === 0), deg = ((G.body.yaw * 180 / Math.PI) % 360 + 360) % 360;
    let r = Math.floor(16 - deg / 22.5 + 0.5) & 15;
    if (full && !G.body.sneaking) r = (Math.round(r / 4) * 4) & 15;
    v = withMeta(b.id, r);
  } else {
    // its face looks across the bar, toward the player's side
    const across = [[nz, -nx], [-nz, nx]], toPlayer = [G.body.x - (x + 0.5), G.body.z - (z + 0.5)], d = across[0][0] * toPlayer[0] + across[0][1] * toPlayer[1] >= 0 ? across[0] : across[1];
    v = withMeta(ID[b.wallSign], [[1, 0], [-1, 0], [0, 1], [0, -1]].findIndex(([a, c]) => a === d[0] && c === d[1]));
  }
  setBlock(x, y, z, v);
  delete G.tiles[`${x},${y},${z}`];
  setTimeout(() => editSign(`${x},${y},${z}`, 'front'), 0);
  return true;
}
/** The campfires in a column the worker sent (kept a column at a time; checked again as they are used). */
function campfiresIn(m) {
  const found = [];
  m.sections.forEach((s, si) => { if (s) for (let i = 0; i < 4096; i++) if (CAMP[s[i] & 0xFFF]) found.push([m.cx * 16 + (i & 15), MINY + si * 16 + (i >> 8), m.cz * 16 + (i >> 4 & 15)]); });
  const k = `${m.cx},${m.cz}`;
  if (found.length) G.campfires.set(k, found); else G.campfires.delete(k);
}
/**
 * Each tick, the campfires near: a lit one sends up smoke (2–3 puffs in ticks one in nine; much higher over a hay
 * bale), crackles now and then and spits a spark; what is on one cooks while it burns (thirty seconds, then it pops
 * off cooked) and cools back while it is out (the game's).
 */
function campfiresTick() {
  const b = G.body;
  for (const list of G.campfires.values()) for (const [x, y, z] of list) {
    const v = G.mirror.get(x, y, z);
    if (!CAMP[v & 0xFFF]) continue;
    const lit = campLit(v), d = Math.hypot(x + 0.5 - b.x, y + 0.5 - b.y, z + 0.5 - b.z);
    if (lit && d < 64) {
      if (Math.random() < 0.11) { const signal = (G.mirror.get(x, y - 1, z) & 0xFFF) === ID.hay_block; for (let k = 2 + (Math.random() < 0.5 ? 1 : 0); k > 0; k--) G.ents.campfireSmoke(x + 0.5, y + 0.45, z + 0.5, signal); }
      if (d < 16 && Math.random() < 0.1) soundAt('campfire', x + 0.5, y + 0.5, z + 0.5);
      if (Math.random() < 0.04) G.ents.puff(x + 0.5, y + 0.5, z + 0.5, 'flame');
    }
    const tile = G.tiles[`${x},${y},${z}`];
    if (tile?.kind !== 'campfire') continue;
    for (let i = 0; i < 4; i++) {
      const s = tile.food[i];
      if (!s) continue;
      if (!lit) { tile.cook[i] = Math.max(0, tile.cook[i] - 2); continue; }
      if (++tile.cook[i] >= 600) { tile.food[i] = null; tile.cook[i] = 0; G.ents.drop({id: smeltOf(s.id) || s.id, n: 1}, x + 0.5, y + 0.6, z + 0.5); }
    }
    if (!tile.food.some(Boolean)) delete G.tiles[`${x},${y},${z}`];
  }
}
/**
 * Using a campfire: food that cooks goes on it (in the first of its four places free; full, nothing happens); a
 * shovel puts a lit one out; a lighter or a fire charge lights one that is out (not one in water). True if done.
 */
function campfireUse(t, s, info) {
  const v = t.v, id = v & 0xFFF, meta = v >>> 12, k = `${t.x},${t.y},${t.z}`, at = [t.x + 0.5, t.y + 0.5, t.z + 0.5];
  if (s && smeltsIn('food', s.id)) {
    const tile = G.tiles[k] ||= {kind: 'campfire', food: [null, null, null, null], cook: [0, 0, 0, 0]}, i = tile.food.indexOf(null);
    if (i >= 0) { tile.food[i] = {id: s.id, n: 1}; tile.cook[i] = 0; useUp(); play('place', ID.oak_log); }
    return true;
  }
  if (campLit(v) && heldTool()?.kind === 'shovel') { setBlock(t.x, t.y, t.z, withMeta(id, meta | 4)); soundAt('fizz', ...at); G.ents.puff(...at, 'smoke'); wearTool(); return true; }
  if (!campLit(v) && !BLOCKS[id].water && (info?.tool?.kind === 'fire' || s?.id === 'fire_charge')) {
    setBlock(t.x, t.y, t.z, withMeta(id, meta & 3));
    if (s.id === 'fire_charge') { useUp(); play('blaze_shoot'); } else { play('ignite'); wearTool(); }
    return true;
  }
  return false;
}
/**
 * Whether the player looks an enderman in the eye (the game's: their aim inside a cone round its eyes that narrows
 * with distance, nothing in between, 64 blocks at most).
 */
function staring(m) {
  if (G.dead || G.mode === 'creative' || G.mode === 'spectator') return false;
  const e = eyePos(), d = G.body.look(), dx = m.x - e[0], dy = m.y + m.body.height * 0.88 - e[1], dz = m.z - e[2], l = Math.hypot(dx, dy, dz);
  if (l > 64 || l < 0.5 || (dx * d[0] + dy * d[1] + dz * d[2]) / l <= 1 - 0.025 / l) return false;
  return !raycast(G.mirror, e[0], e[1], e[2], dx / l, dy / l, dz / l, l, false, true);
}
/** The blocks endermen hold, in front of them between their hands. */
const heldBlockVerts = new Map();
let heldBlockAtlas = null;
function endermanThings(light) {
  if (heldBlockAtlas !== built) { heldBlockVerts.clear(); heldBlockAtlas = built; }
  const out = [];
  for (const m of G.mobs.list) {
    if (m.kind !== 'enderman' || !m.carried || m.dead) continue;
    const name = BLOCKS[m.carried]?.name, look = name && itemLook(name);
    if (!look) continue;
    const [sky, blk] = light(Math.floor(m.x), Math.floor(m.y + 1.5), Math.floor(m.z)), key = `${name}|${sky}|${blk}`;
    let v = heldBlockVerts.get(key);
    if (!v) { v = new Verts(look.cube ? 48 : 512); if (look.cube) v.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints); else thickItem(v, look.flat, look.tint, sky * 17, blk * 17); heldBlockVerts.set(key, v); }
    const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw);
    out.push({verts: v, x: m.x + fx * 0.5, y: m.y + 1.55, z: m.z + fz * 0.5, model: mat.model(0.5, m.yaw + Math.PI / 4, 0.35)});
  }
  return out;
}
/** What cooks on the campfires near, lying on them in their four places (the game's places and size). */
const foodVerts = new Map();
let foodAtlas = null;
function campfireThings(light) {
  if (foodAtlas !== built) { foodVerts.clear(); foodAtlas = built; }
  const out = [];
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.kind !== 'campfire') continue;
    const [x, y, z] = k.split(',').map(Number), v = G.mirror.get(x, y, z), facing = v >>> 12 & 3;
    if (!CAMP[v & 0xFFF] || Math.hypot(x - G.body.x, z - G.body.z) > 48) continue;
    const [sky, blk] = light(x, y + 1, z);
    tile.food.forEach((s, i) => {
      if (!s) return;
      const look = itemLook(s.id), key = `${s.id}|${sky}|${blk}`;
      let vv = foodVerts.get(key);
      if (!vv) { vv = new Verts(512); if (look.cube) vv.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints); else thickItem(vv, look.flat, look.tint, sky * 17, blk * 17); foodVerts.set(key, vv); }
      const a = ((i + facing) % 4) * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
      out.push({verts: vv, x: x + 0.5 - 0.3125 * (c + sn), y: y + 0.449, z: z + 0.5 + 0.3125 * (sn - c), model: mat.model(0.375, a, -Math.PI / 2)});
    });
  }
  return out;
}
function breakBlock(t) {
  const {x, y, z, v} = t, b = BLOCKS[v & 0xFFF], survival = G.mode !== 'creative';
  // string cut with shears gives its hooks no pulse (the game's: it is disarmed first)
  if (b.name === 'tripwire' && heldTool()?.kind === 'shears') setBlock(x, y, z, withMeta(b.id, v >>> 12 | 4));
  // ice over something becomes water when broken (unless creative)
  const below = G.mirror.get(x, y - 1, z);
  setBlock(x, y, z, b.water || (survival && b.name === 'ice' && below && collisionBoxes(below)) ? ID.water : 0);
  // shears take leaves, grass, ferns, dead bushes and vines whole
  if (survival && heldTool()?.kind === 'shears' && (b.name.endsWith('_leaves') || SHEARED.has(b.name) || b.shears)) G.ents.drop({id: b.shears || b.name, n: 1}, x + 0.5, y + 0.4, z + 0.5);
  else if (survival && harvests(b, heldTool())) {
    // 精准采集 takes the block itself (and no experience); 时运 gives ores more (the game's: ×1 up to ×level+1, redstone +0–level)
    const tool = held(), silk = enchOf(tool, 'silk_touch') && b.item, fortune = enchOf(tool, 'fortune');
    const drops = silk ? [[b.name, 1]] : dropsOf(b, v >>> 12).map(([id, n]) => !fortune || !b.name.endsWith('_ore') || id === b.name ? [id, n]
      : [id, /redstone/.test(b.name) ? n + Math.floor(Math.random() * (fortune + 1)) : n * (Math.max(0, Math.floor(Math.random() * (fortune + 2)) - 1) + 1)]);
    for (const [id, n] of drops) G.ents.drop({id, n}, x + 0.5, y + 0.4, z + 0.5);  // a door or a bed goes whole
    if (b.xp && !silk) G.ents.xp(b.xp[0] + Math.floor(Math.random() * (b.xp[1] - b.xp[0] + 1)), x + 0.5, y + 0.5, z + 0.5);
  }
  if (b.shape === 'door' || b.shape === 'bed' || b.shape === 'tall') { const [ox, oy, oz] = partnerOf(x, y, z, v); if ((G.mirror.get(ox, oy, oz) & 0xFFF) === b.id) setBlock(ox, oy, oz, 0); }
  // what was inside goes out (a chest the land was made with, never opened, its loot)
  const k = `${x},${y},${z}`;
  if (G.loot[k]) G.tiles[k] = {kind: 'chest', slots: lootOf(k, x, y, z)};
  const tile = G.tiles[k];
  // a large chest's half: its own 27 go out, and the other half is a chest of its own again
  if (tile?.pair) unpairChest(k, tile);
  if (tile) { for (const s of tile.slots || tile.food || [tile.input, tile.fuel, tile.output]) if (s) G.ents.drop(s, x + 0.5, y + 0.5, z + 0.5); delete G.tiles[k]; if (G.fills.has(k)) { G.fills.delete(k); G.worker.postMessage({type: 'fill', x, y, z, level: null}); } }
  G.ents.burst(x, y, z, v, 28);
  play('break', v);
  if (survival) { if (b.hard > 0) wearTool(); G.exh += 0.005; }
}
const SHEARED = new Set(['short_grass', 'fern', 'dead_bush', 'vine', 'tall_grass', 'large_fern']);
/** Which way the player faces (0 south, 1 west, 2 north, 3 east) — a block placed faces back at them. */
function facingBack() { const y = ((G.body.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); const q = Math.round(y / (Math.PI / 2)) % 4; return [0, 3, 2, 1][q]; }
function placeFrom(t, stack) {
  const info = itemInfo(stack.id), b = info?.block || (info?.place ? BLOCKS[ID[info.place]] : null);
  if (b?.shape === 'sign' || b?.shape === 'hanging_sign') return placeSign(t, b);
  const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
  const tb = BLOCKS[t.v & 0xFFF];
  // slabs join into a double one, snow layers stack up
  if (b?.shape === 'slab' && (t.v & 0xFFF) === b.id && t.v >>> 12 !== 2 && ((t.face === 2 && t.v >>> 12 === 0) || (t.face === 3 && t.v >>> 12 === 1))) { setBlock(t.x, t.y, t.z, withMeta(b.id, 2)); return true; }
  if (b?.name === 'snow' && (t.v & 0xFFF) === b.id && (t.v >>> 12) < 7) { setBlock(t.x, t.y, t.z, withMeta(b.id, (t.v >>> 12) + 1)); return true; }
  if (b?.name === 'pink_petals' && (t.v & 0xFFF) === b.id && (t.v >>> 12 & 3) < 3) { setBlock(t.x, t.y, t.z, t.v + (1 << 12)); play('place', ID.short_grass); return true; }
  if ((b?.name === 'sea_pickle' || b?.name === 'turtle_egg') && (t.v & 0xFFF) === b.id && (t.v >>> 12 & 3) < 3) { setBlock(t.x, t.y, t.z, t.v + (1 << 12)); play('place', b.id); return true; }
  // a vine goes on the side of a block that was aimed at (a full one or leaves), clinging to it; on a vine already
  // there it gets that side too
  if (b?.shape === 'vine') {
    if (t.face === 2 || t.face === 3 || !(tb.opaque || tb.name.endsWith('_leaves'))) return false;
    const vx = t.x + nx, vz = t.z + nz, here = G.mirror.get(vx, t.y, vz), bit = 1 << {0: 1, 1: 3, 4: 2, 5: 0}[t.face];
    if (here && (here & 0xFFF) !== ID.vine && !BLOCKS[here & 0xFFF].replace) return false;
    const faces = (here & 0xFFF) === ID.vine ? here >>> 12 : 0;
    if (faces & bit) return false;
    setBlock(vx, t.y, vz, withMeta(ID.vine, faces | bit)); play('place', ID.vine);
    return true;
  }
  let x = t.x, y = t.y, z = t.z;
  if (!tb.replace || (tb.id === (b?.id ?? -1))) { x += nx; y += ny; z += nz; }
  if (y < MINY || y >= MINY + HEIGHT) return false;
  const here = G.mirror.get(x, y, z);
  if (here && !BLOCKS[here & 0xFFF].replace) return false;
  let v;
  const pf = (facingBack() + 2) % 4; // the way the player looks
  // a plant two blocks tall: on its ground, with room above
  if (b?.shape === 'tall') {
    const above = G.mirror.get(x, y + 1, z), ub = BLOCKS[G.mirror.get(x, y - 1, z) & 0xFFF];
    if (above && !BLOCKS[above & 0xFFF].replace) return false;
    if (!['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'farmland', 'moss_block', 'mud'].includes(ub.name)) return false;
    setBlock(x, y, z, b.id); setBlock(x, y + 1, z, withMeta(b.id, 8)); play('place', ID.short_grass);
    return true;
  }
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
    if (b.shape === 'torch' || b.shape === 'fan') { if (t.face === 3) return false; meta = t.face === 2 ? 0 : [2, 1, 0, 0, 4, 3][t.face]; }
    if (b.shape === 'wall') { if (t.face >= 2 && t.face <= 3) return false; meta = [3, 1, 0, 0, 0, 2][t.face]; }
    if (b.shape === 'slab') meta = t.face === 3 || (t.face !== 2 && t.hit[1] - Math.floor(t.hit[1]) > 0.5) ? 1 : 0;
    if (b.name.endsWith('_leaves')) meta = 1;
    // redstone: levers and buttons hang on the face they were put against (on a floor or ceiling lying the way the player
    // looks); repeaters and comparators send their signal the way the player looks; pistons, dispensers and droppers face
    // the player (up or down too), an observer looks away from them; a hopper's spout goes into what it was put against
    if (b.shape === 'lever' || b.shape === 'button') meta = t.face === 2 ? pf % 2 : t.face === 3 ? 2 + pf % 2 : {4: 4, 1: 5, 5: 6, 0: 7}[t.face];
    // a tripwire hook goes on the side of a full block, pointing away from it
    if (b.shape === 'hook') { if (t.face === 2 || t.face === 3) return false; meta = {4: 0, 1: 1, 5: 2, 0: 3}[t.face]; }
    if (b.shape === 'repeater' || b.shape === 'comparator') meta = pf;
    if (b.facing6) meta = b.rs === 'observer' ? look6() : OPPOSITE[look6()];
    if (b.shape === 'hopper') meta = t.face === 2 || t.face === 3 ? 3 : OPPOSITE[t.face];
    // plants need their ground
    const under = G.mirror.get(x, y - 1, z) & 0xFFF, ub = BLOCKS[under];
    if (b.shape === 'cross' && !b.water && !/coral$/.test(b.name) && !['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'farmland', 'moss_block', 'mud', 'muddy_mangrove_roots', 'sand', 'red_sand', ...(b.name === 'mangrove_propagule' ? ['clay'] : [])].includes(ub.name) && !(b.name === 'sugar_cane' && under === ID.sugar_cane) && !(b.name.endsWith('mushroom') && ub.opaque)) return false;
    if (b.shape === 'petals') { if (!['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots'].includes(ub.name)) return false; meta = facingBack() << 2; }
    // a plant of the sea only into still water (on the ground, or kelp on kelp — the old top a stem then)
    if (b.water) {
      if ((here & 0xFFF) !== ID.water || here >>> 12) return false;
      if (b.name === 'kelp' && (under === ID.kelp || under === ID.kelp_plant)) { if (under === ID.kelp) setBlock(x, y - 1, z, ID.kelp_plant); }
      else if (b.shape === 'fan' && meta) { const [dx, dz] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]][meta]; if (!BLOCKS[G.mirror.get(x + dx, y, z + dz) & 0xFFF].opaque) return false; }
      else if (!ub.opaque) return false;
    }
    // bamboo: on bamboo it goes on up (as thick as the one under it), on its ground it is a shoot
    if (b.name === 'bamboo') {
      if (under === ID.bamboo || under === ID.bamboo_sapling) meta = under === ID.bamboo ? G.mirror.get(x, y - 1, z) >>> 12 & 4 : 0;
      else if (['grass_block', 'dirt', 'podzol', 'coarse_dirt', 'moss_block', 'mud', 'muddy_mangrove_roots', 'sand', 'red_sand', 'gravel'].includes(ub.name)) { v = ID.bamboo_sapling; }
      else return false;
    }
    if (b.name === 'cactus' && !['sand', 'red_sand', 'cactus'].includes(ub.name)) return false;
    // dust, plates, repeaters, comparators and rails lie on a full block (or a slab's top half, a hopper); levers and
    // buttons hang on a full block
    if (['wire', 'plate', 'repeater', 'comparator', 'rail'].includes(b.shape) && !(ub.opaque || (ub.shape === 'slab' && G.mirror.get(x, y - 1, z) >>> 12 >= 1) || ub.name === 'hopper')) return false;
    if (b.shape === 'lever' || b.shape === 'button') { const [ax, ay, az] = FACES[ATTACHED[meta & 7]]; if (!BLOCKS[G.mirror.get(x + ax, y + ay, z + az) & 0xFFF].opaque) return false; }
    if ((b.shape === 'torch' && meta === 0) && !ub.opaque && ub.shape !== 'slab') return false;
    if (b.shape === 'hook') { const [dx, dz] = DIR[meta]; if (!BLOCKS[G.mirror.get(x - dx, y, z - dz) & 0xFFF].opaque) return false; }
    // (string not into water or lava)
    if (b.shape === 'tripwire' && BLOCKS[G.mirror.get(x, y, z) & 0xFFF].shape === 'liquid') return false;
    // a chest beside a single chest of its kind and facing (not sneaking) makes a large chest with it
    if (b.use === 'chest' && !G.body.sneaking) { const half = chestHalf(x, y, z, meta & 3, b); if (half) meta = (meta & 3) | half << 2; }
    // put into still water, what can stand in water does (a fence, a slab, a chest, the conduit …)
    const wl = WATERLOGGED[b.id], wv = G.mirror.get(x, y, z);
    if (wl && (wv & 0xFFF) === ID.water && !(wv >>> 12)) v = withMeta(wl, meta);
    v ??= withMeta(b.id, meta);
    // not inside the player
    const boxes = collisionBoxes(v), [x0, y0, z0, x1, y1, z1] = G.body.aabb();
    if (boxes && boxes.some(q => x + q[0] < x1 && x + q[3] > x0 && y + q[1] < y1 && y + q[4] > y0 && z + q[2] < z1 && z + q[5] > z0)) return false;
  }
  // a rail takes its shape from the rails round it, and they turn to meet it
  if (b?.shape === 'rail') { placeRail((a, c, d) => G.mirror.get(a, c, d), setBlock, x, y, z, v); play('place', v); return true; }
  setBlock(x, y, z, v);
  makeTile(x, y, z, b);
  play('place', v);
  return true;
}
/** The nearest of the six ways the player looks (FACES). */
function look6() {
  const [dx, dy, dz] = G.body.look(), ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  return ay >= ax && ay >= az ? (dy > 0 ? 2 : 3) : ax >= az ? (dx > 0 ? 0 : 1) : (dz > 0 ? 4 : 5);
}
/** What a block keeps of its own (a furnace's fire, a chest's things), made when it is put down. */
function makeTile(x, y, z, b) {
  delete G.loot[`${x},${y},${z}`];
  if (b?.shape === 'conduit') { G.tiles[`${x},${y},${z}`] = {kind: 'conduit'}; (G.conduitList ||= []).push([x, y, z, G.tiles[`${x},${y},${z}`]]); }
  if (b?.use === 'furnace') G.tiles[`${x},${y},${z}`] = {kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0};
  if (b?.use === 'chest') { G.tiles[`${x},${y},${z}`] = {kind: 'chest', slots: new Array(27).fill(null)}; pairChest(x, y, z); }
  if (b?.use === 'enchant') G.tiles[`${x},${y},${z}`] = {kind: 'enchant'};
  if (b?.use === 'dispenser') G.tiles[`${x},${y},${z}`] = {kind: 'dispenser', slots: new Array(9).fill(null), title: b.zh, cols: 3};
  if (b?.use === 'hopper') G.tiles[`${x},${y},${z}`] = {kind: 'hopper', slots: new Array(5).fill(null), title: '漏斗', cols: 5};
  if (b?.use === 'note') G.tiles[`${x},${y},${z}`] = {kind: 'note', note: 0};
}
// ---------- redstone on the page ----------
// what the block under a note block makes it sound like (the game's instruments)
const INSTRUMENTS = [[/^glowstone$/, 'pling'], [/_planks$|_log$|_wood$|bookshelf|chest|crafting|note_block|_fence|_door$|_trapdoor$|barrel|composter|lectern/, 'bass'], [/sand$|gravel|concrete_powder/, 'snare'],
  [/glass/, 'hat'], [/^gold_block$/, 'bell'], [/^clay$/, 'flute'], [/^packed_ice$/, 'chime'], [/_wool$/, 'guitar'], [/^iron_block$/, 'iron_xylophone'], [/^soul_sand$/, 'cow_bell'],
  [/pumpkin/, 'didgeridoo'], [/^emerald_block$/, 'bit'], [/^hay_block$/, 'banjo'], [/stone|ore$|brick|obsidian|netherrack|deepslate|quartz|tuff|calcite|terracotta|granite|diorite|andesite/, 'basedrum']];
/** A note block plays its note (if nothing is on top of it), with a note flying up in its colour. */
function noteAt(x, y, z) {
  if (G.mirror.get(x, y + 1, z)) return;
  const n = G.tiles[`${x},${y},${z}`]?.note || 0, under = BLOCKS[G.mirror.get(x, y - 1, z) & 0xFFF].name, inst = INSTRUMENTS.find(([re]) => re.test(under))?.[1] || 'harp';
  const d = Math.hypot(x + 0.5 - G.body.x, y + 0.5 - G.body.y, z + 0.5 - G.body.z);
  if (d < 48) noteSound(inst, n, Math.max(0.15, 1 - d / 48));
  const h = n / 24 * 6, c = k => Math.round(255 * Math.max(0, Math.min(1, Math.abs((h + k) % 6 - 3) - 1)));
  G.ents.puff(x + 0.5, y + 1.2, z + 0.5, 'note', c(0) << 16 | c(4) << 8 | c(2));
}
/**
 * A dispenser or dropper fires (the world says when): one thing from a slot picked at random. A dropper puts it into a
 * container in front or drops it; a dispenser shoots arrows, throws what can be thrown, pours and fills buckets, uses bone
 * meal, lights TNT, hatches spawn eggs, shears sheep, fills bottles — else drops it too. Empty: a click.
 */
function dispense({x, y, z, face, drop}) {
  const tile = G.tiles[`${x},${y},${z}`];
  if (!tile?.slots) return;
  const pick = pickSlot(tile), [dx, dy, dz] = FACES[face], fx = x + dx, fy = y + dy, fz = z + dz;
  if (!pick) { soundAt('empty', x + 0.5, y + 0.5, z + 0.5); return; }
  const [i, s] = pick, info = itemInfo(s.id), front = G.mirror.get(fx, fy, fz), ox = x + 0.5 + dx * 0.7, oy = y + 0.5 + dy * 0.7 - (dy ? 0 : 0.15), oz = z + 0.5 + dz * 0.7;
  const used = () => { s.n--; if (!s.n) tile.slots[i] = null; };
  const swap = to => { if (s.n === 1) tile.slots[i] = to; else { used(); if (!insertOne(tile, to, false)) G.ents.drop(to, ox, oy, oz); } };
  const spill = () => { G.ents.drop({...s, n: 1}, ox, oy, oz, {dir: [dx + (Math.random() - 0.5) * 0.2, dy + 0.1, dz + (Math.random() - 0.5) * 0.2]}); used(); soundAt('click', ox, oy, oz); G.ents.puff(ox, oy, oz, 'smoke'); };
  if (drop) {
    const into = G.tiles[`${fx},${fy},${fz}`];
    if (into && insertOne(into, s, face === 3)) { used(); return; }
    spill(); return;
  }
  const empty = !front || BLOCKS[front & 0xFFF].replace;
  if (s.id === 'arrow') { G.mobs.arrows.push({x: ox, y: oy, z: oz, vx: dx * 1.1 + (Math.random() - 0.5) * 0.05, vy: dy * 1.1 + 0.1, vz: dz * 1.1 + (Math.random() - 0.5) * 0.05, from: 'dispenser', life: 0, stuck: false, dmg: 2, pickup: true}); used(); soundAt('bow', ox, oy, oz); return; }
  if (info?.thrown && s.id !== 'ender_pearl') { launch(s, ox, oy, oz, [dx, dy + 0.1, dz]); used(); soundAt('throw', ox, oy, oz); return; }
  // flint and steel lights the TNT in front, or sets fire there; a fire charge flies off as a small fireball (the game's)
  if (info?.tool?.kind === 'fire') {
    if ((front & 0xFFF) === ID.tnt) { setBlock(fx, fy, fz, 0); G.mobs.light(fx, fy, fz); } else if (!setFire(fx, fy, fz)) { soundAt('empty', x + 0.5, y + 0.5, z + 0.5); return; }
    s.dmg = (s.dmg || 0) + 1; if (s.dmg >= info.tool.uses) tile.slots[i] = null; soundAt('ignite', ox, oy, oz); return;
  }
  if (s.id === 'fire_charge') {
    const j = () => (Math.random() - Math.random()) * 0.115;
    G.mobs.balls.push({x: ox, y: oy, z: oz, vx: 0, vy: 0, vz: 0, ax: (dx + j()) * 0.05, ay: (dy + j()) * 0.05, az: (dz + j()) * 0.05, big: false, from: 'dispenser', life: 0});
    used(); soundAt('blaze_shoot', ox, oy, oz); return;
  }
  // (a fish bucket lets its fish go into the water it pours, as the game's does)
  if (info?.pour && empty) { setBlock(fx, fy, fz, ID[info.pour]); if (info.fish && G.dim !== 'nether') G.mobs.add(info.fish, fx + 0.5, fy + 0.2, fz + 0.5, {persist: true, variant: s.variant}); swap({id: 'bucket', n: 1}); soundAt('splash', ox, oy, oz); return; }
  if (s.id === 'bucket' && [ID.water, ID.lava].includes(front & 0xFFF) && !(front >>> 12)) { setBlock(fx, fy, fz, 0); swap({id: (front & 0xFFF) === ID.water ? 'water_bucket' : 'lava_bucket', n: 1}); soundAt('splash', ox, oy, oz); return; }
  if (s.id === 'glass_bottle' && (front & 0xFFF) === ID.water) { swap({id: 'potion', n: 1, pot: 'water'}); soundAt('splash', ox, oy, oz); return; }
  if (info?.meal) { G.worker.postMessage({type: 'meal', x: fx, y: fy, z: fz}); used(); G.ents.puff(fx + 0.5, fy + 0.5, fz + 0.5, 'meal'); return; }
  if (s.id === 'tnt' && empty) { G.mobs.light(fx, fy, fz); used(); return; }
  if (info?.spawn && empty) { G.mobs.add(info.spawn, fx + 0.5, fy, fz + 0.5); used(); return; }
  if (info?.cart && isRail(front)) { G.carts.add(info.cart, fx + 0.5, fy + 0.0625, fz + 0.5); used(); return; }
  if (info?.tool?.kind === 'shears') {
    const sheep = G.mobs.list.find(m => m.kind === 'sheep' && !m.sheared && !m.baby && !m.dead && Math.floor(m.x) === fx && Math.floor(m.z) === fz && Math.abs(m.y - fy) < 1.5);
    if (sheep) { sheep.sheared = true; G.ents.drop({id: `${sheep.color || 'white'}_wool`, n: 1 + Math.floor(Math.random() * 3)}, sheep.x, sheep.y + 1, sheep.z); s.dmg = (s.dmg || 0) + 1; if (s.dmg >= (info.tool.uses || 238)) tile.slots[i] = null; soundAt('shear', ox, oy, oz); return; }
  }
  spill();
}
/** Blocks a piston moved carry what stands in them along (the player, mobs, items). */
function pushed(cells, dir) {
  const [dx, dy, dz] = FACES[dir], inside = (x0, y0, z0, x1, y1, z1) => cells.some(([cx, cy, cz]) => x1 > cx && x0 < cx + 1 && y1 > cy && y0 < cy + 1 && z1 > cz && z0 < cz + 1);
  const shove = b => { b.x += dx; b.y += dy; b.z += dz; b.prev = {x: b.prev.x + dx, y: b.prev.y + dy, z: b.prev.z + dz}; if (dy > 0) b.vy = Math.max(b.vy, 0); };
  if (inside(...G.body.aabb())) shove(G.body);
  for (const m of G.mobs.list) if (!m.dead && inside(...m.body.aabb())) shove(m.body);
  for (const it of G.ents.items) if (inside(it.x - 0.125, it.y, it.z - 0.125, it.x + 0.125, it.y + 0.25, it.z + 0.125)) { it.x += dx; it.y += dy; it.z += dz; }
}
/**
 * Pressure plates weigh what stands on them every tick (stone: players and mobs; wood: anything; gold one a thing,
 * iron one each ten); a plate lets go a second after the last thing left it (a weighted one half a second).
 */
function platesTick() {
  const on = new Map();
  const add = (x, y, z, kind) => {
    const bx = Math.floor(x), by = Math.floor(y + 0.01), bz = Math.floor(z), v = G.mirror.get(bx, by, bz);
    const pb = BLOCKS[v & 0xFFF];
    if (pb.shape !== 'plate' && !(kind === 'cart' && pb.rail === 'detector')) return;
    const k = `${bx},${by},${bz}`;
    if (!on.has(k)) on.set(k, {x: bx, y: by, z: bz, list: []});
    on.get(k).list.push({kind});
  };
  if (!G.dead && !G.body.flying) add(G.body.x, G.body.y, G.body.z, 'player');
  for (const m of G.mobs.list) if (!m.dead) add(m.x, m.y, m.z, 'mob');
  for (const it of G.ents.items) add(it.x, it.y, it.z, 'item');
  for (const c of G.carts.list) add(c.body.x, c.body.y, c.body.z, 'cart');
  for (const [k, p] of on) { const b = BLOCKS[G.mirror.get(p.x, p.y, p.z) & 0xFFF], level = plateLevel(b, p.list); if (level) G.plates.set(k, {...p, level, at: G.ticks}); }
  for (const [k, p] of G.plates) {
    const v = G.mirror.get(p.x, p.y, p.z), b = BLOCKS[v & 0xFFF];
    if (b.shape !== 'plate' && b.rail !== 'detector') { G.plates.delete(k); continue; }
    const level = G.ticks - p.at < (b.weight ? 10 : 20) ? (on.has(k) ? plateLevel(b, on.get(k).list) || p.level : p.level) : 0;
    if (!level) G.plates.delete(k);
    const want = b.rail ? (v >>> 12 & 7) | (level ? 8 : 0) : level;
    if ((v >>> 12) !== want) { setBlock(p.x, p.y, p.z, withMeta(b.id, want)); if (!b.rail) soundAt('click', p.x + 0.5, p.y, p.z + 0.5); }
  }
}
// ---------- tripwire ----------
// (the world works out the hooks; the page sees what is on each string)
const TRIP = new Uint8Array(4096);
TRIP[ID.tripwire] = 1;
/** The strings in a column the worker sent (as the campfires are kept). */
function tripwiresIn(m) {
  const found = [];
  m.sections.forEach((s, si) => { if (s) for (let i = 0; i < 4096; i++) if (TRIP[s[i] & 0xFFF]) found.push([m.cx * 16 + (i & 15), MINY + si * 16 + (i >> 8), m.cz * 16 + (i >> 4 & 15)]); });
  const k = `${m.cx},${m.cz}`;
  if (found.length) G.tripwires.set(k, found); else G.tripwires.delete(k);
}
/**
 * Every other tick, what is on each string: anything at all (the player, mobs, things lying there, arrows, carts and
 * boats) in its box — over the ground, lower once strung — presses it, and it lets go half a second after the last thing
 * left it (the game's). The world is told when that changes; it turns the hooks on or off.
 */
function tripwiresTick() {
  if (G.ticks % 2 || !G.tripwires.size) return;
  const boxes = [];
  if (!G.dead && G.mode !== 'spectator') boxes.push(G.body.aabb());
  for (const m of G.mobs.list) if (!m.dead) boxes.push(m.body.aabb());
  for (const it of G.ents.items) boxes.push([it.x - 0.125, it.y, it.z - 0.125, it.x + 0.125, it.y + 0.25, it.z + 0.125]);
  for (const a of G.mobs.arrows) boxes.push([a.x - 0.1, a.y - 0.1, a.z - 0.1, a.x + 0.1, a.y + 0.1, a.z + 0.1]);
  for (const c of [...G.carts.list, ...G.boats.list]) boxes.push(c.body.aabb());
  for (const list of G.tripwires.values()) for (const [x, y, z] of list) {
    const v = G.mirror.get(x, y, z), k = `${x},${y},${z}`;
    if (!TRIP[v & 0xFFF]) { G.tripAt.delete(k); continue; }
    const y0 = y + (v >>> 12 & 1 ? 1 / 16 : 0), y1 = y + (v >>> 12 & 1 ? 2.5 / 16 : 0.5);
    if (boxes.some(q => q[0] < x + 1 && q[3] > x && q[1] < y1 && q[4] > y0 && q[2] < z + 1 && q[5] > z)) G.tripAt.set(k, G.ticks);
    const on = G.ticks - (G.tripAt.get(k) ?? -99) < 10, told = G.tripTold.get(k);
    if (!on) G.tripAt.delete(k);
    if (!!(v >>> 12 & 2) === on) { G.tripTold.delete(k); continue; }
    if (told?.on === on && G.ticks - told.at < 20) continue;
    G.tripTold.set(k, {on, at: G.ticks});
    G.worker.postMessage({type: 'trip', x, y, z, on});
  }
}
/**
 * Hoppers, every eight ticks unless power locks them: one item into what the spout points at, and one out of the
 * container above (from a furnace what is done) — or items lying in their bowl taken in.
 */
function hoppersTick() {
  for (const [k, tile] of Object.entries(G.tiles)) {
    if (tile.kind !== 'hopper') continue;
    if (tile.cool > 0) { tile.cool--; continue; }
    const [x, y, z] = k.split(',').map(Number);
    if (!G.mirror.has(x, z)) continue;
    const v = G.mirror.get(x, y, z);
    if ((v & 0xFFF) !== ID.hopper || v >>> 12 & 8) continue;
    const cartAt = (cx, cy, cz) => G.carts.list.find(c => c.inv && Math.floor(c.body.x) === cx && Math.floor(c.body.y + 0.01) === cy && Math.floor(c.body.z) === cz)?.inv;
    const F = v >>> 12 & 7, [dx, dy, dz] = FACES[F], target = G.tiles[`${x + dx},${y + dy},${z + dz}`] || cartAt(x + dx, y + dy, z + dz), above = G.tiles[`${x},${y + 1},${z}`] || cartAt(x, y + 1, z);
    let did = !!target && moveOne(tile, target, F === 3);
    if (above) did = moveOne(above, tile, true) || did;
    else for (const it of G.ents.items) {
      if (Math.floor(it.x) !== x || Math.floor(it.z) !== z || it.y < y + 0.6 || it.y > y + 1.6) continue;
      while (it.stack.n > 0 && insertOne(tile, it.stack, true)) { it.stack.n--; did = true; }
      if (!it.stack.n) G.ents.items.splice(G.ents.items.indexOf(it), 1);
      break;
    }
    if (did) tile.cool = 8;
  }
}
/** How full each container is, told to the world when it changes (comparators read it there). */
function fillsTick() {
  for (const [k, tile] of Object.entries(G.tiles)) {
    const level = fillLevel(tile);
    if (level == null || G.fills.get(k) === level) continue;
    G.fills.set(k, level);
    const [x, y, z] = k.split(',').map(Number);
    G.worker.postMessage({type: 'fill', x, y, z, level});
  }
}
/** Using a minecart: get in (an empty one); open its chest or hopper; a coal for a furnace one (it sets off the way the player looks). */
function cartUse(c, s) {
  G.swing = 6;
  if (c.kind === 'minecart') { if (!G.body.sneaking) { G.riding = c; G.body.flying = false; } return; }
  if (c.inv) { input.enabled = false; input.unlock(); invUI.show('chest', c.inv); return; }
  if (c.kind === 'furnace_minecart' && (s?.id === 'coal' || s?.id === 'charcoal')) { useUp(); c.fuel += 3600; const [lx, , lz] = G.body.look(); c.push = [lx, lz]; }
}
/** Using a boat: getting in (sneaking at a chest boat opens its chest). */
function boatUse(c) {
  G.swing = 6;
  if (c.inv && G.body.sneaking) { input.enabled = false; input.unlock(); invUI.show('chest', c.inv); return; }
  if (!G.body.sneaking) { G.riding = c; Object.assign(G.body, {flying: false, sprinting: false}); }
}
/**
 * Out of the minecart: standing on top of where it is. Out of a boat (the game's): onto the land ahead of where the
 * player looks, if there is some there and room; else standing on the boat.
 */
function getOff() {
  const c = G.riding, b = G.body;
  G.riding = null;
  if (!c) return;
  if (c.isBoat) {
    const bb = c.body, f = -Math.sin(b.yaw), g = -Math.cos(b.yaw), m = Math.max(Math.abs(f), Math.abs(g)), d = (BOAT_W * Math.SQRT2 + PLAYER_W) / 2 + 1e-5;
    const x = bb.x + f * d / m, z = bb.z + g * d / m, top = Math.floor(bb.y + BOAT_H), fx = Math.floor(x), fz = Math.floor(z);
    const fits = y => { Object.assign(b, {x, y, z}); const q = b.aabb(); return !b.boxesIn(...q).some(o => o[0] < q[3] - 1e-6 && o[3] > q[0] + 1e-6 && o[1] < q[4] - 1e-6 && o[4] > q[1] + 1e-6 && o[2] < q[5] - 1e-6 && o[5] > q[2] + 1e-6); };
    let at = null;
    if (waterTop(G.mirror, fx, top - 1, fz) === null) for (const yy of [top, top - 1]) {
      const boxes = collisionBoxes(G.mirror.get(fx, yy, fz));
      if (!boxes) continue;
      const fy = yy + Math.max(...boxes.map(o => o[4]));
      if (fy - yy <= 1 && fits(fy)) { at = fy; break; }
    }
    if (at === null) { b.x = bb.x; b.y = bb.y + BOAT_H; b.z = bb.z; } else b.y = at;
    b.prev = {x: b.x, y: b.y, z: b.z}; b.vx = b.vy = b.vz = 0;
    return;
  }
  b.x = c.body.x; b.y = c.body.y + 0.75; b.z = c.body.z; b.prev = {x: b.x, y: b.y, z: b.z}; b.vy = 0;
}
/** The use action (right click / tap / LT) on what is aimed at: a mob (feed, shear; a tap on a phone hits), or a block. */
function use(t, mob = null) {
  const s = held(), info = s ? itemInfo(s.id) : null, b = t ? BLOCKS[t.v & 0xFFF] : null;
  if (info?.tool?.kind === 'bow' || info?.tool?.kind === 'trident') return;
  G.swing = 6;
  if (mob?.isCart) { cartUse(mob, s); return; }
  if (mob?.isBoat) { boatUse(mob); return; }
  if (mob) {
    // a fish for a dolphin: it shows the way to a wreck
    if ((s?.id === 'cod' || s?.id === 'salmon') && mob.kind === 'dolphin' && !mob.dead) { G.mobs.feedDolphin(mob); useUp(); return; }
    // flint and steel on a creeper: it is lit (the game's)
    if (info?.tool?.kind === 'fire' && mob.kind === 'creeper' && !mob.dead && !mob.lit) { mob.lit = true; play('ignite'); soundAt('fuse', mob.x, mob.y, mob.z); wearTool(); return; }
    if (s && mob.def.breed?.includes(s.id) && !mob.baby && !mob.love && !mob.loveWait) { mob.love = 600; useUp(); G.ents.puff(mob.x, mob.y + 1, mob.z, 'heart'); return; }
    if (s && mob.def.breed?.includes(s.id) && mob.baby) { mob.grow += 2400; useUp(); G.ents.puff(mob.x, mob.y + 0.6, mob.z, 'meal'); return; }
    if (info?.tool?.kind === 'shears' && mob.kind === 'sheep' && !mob.sheared && !mob.baby) {
      mob.sheared = true; const n = 1 + Math.floor(Math.random() * 3);
      G.ents.drop({id: `${mob.color || 'white'}_wool`, n}, mob.x, mob.y + 1, mob.z); wearTool(); play('shear'); return;
    }
    // a spawn egg on a mob of its kind: a young one
    if (info?.spawn) { if (info.spawn === mob.kind && MOBS[mob.kind].passive) { G.mobs.add(mob.kind, mob.x, mob.y, mob.z, {baby: true}); useUp(); } return; }
    // a water bucket on a fish: the fish in the bucket
    if (s?.id === 'water_bucket' && mob.def.bucket && !mob.dead) {
      G.mobs.list.splice(G.mobs.list.indexOf(mob), 1);
      if (G.mode !== 'creative') useUp();
      handBack({id: mob.def.bucket, n: 1, ...(mob.variant != null ? {variant: mob.variant} : {})}); play('splash'); drawHud(true); return;
    }
    // a bucket on a cow: milk (in creative the empty bucket stays, and the milk comes as well)
    if (s?.id === 'bucket' && mob.kind === 'cow' && !mob.baby) {
      if (G.mode !== 'creative') { useUp(); handBack({id: 'milk_bucket', n: 1}); } else if (!G.inv.slots.some(x => x?.id === 'milk_bucket')) G.inv.add({id: 'milk_bucket', n: 1});
      play('splash'); drawHud(true); return;
    }
    // a villager with work trades (one without, or a child, shakes its head)
    if (mob.kind === 'villager' && !info?.drink && !info?.thrown) {
      if (mob.baby || !mob.offers.length) { mob.shake = 40; play('villager_no'); return; }
      mob.trading = true; input.enabled = false; input.unlock(); play('villager');
      invUI.show('trade', {v: mob});
      return;
    }
    // a potion is drunk or thrown whatever is in front; otherwise a tap on a phone hits
    if (!info?.drink && !info?.thrown) { if (input.mode === 'touch' && mob.kind !== 'villager' && mob.kind !== 'iron_golem') attackMob(mob); return; }
  }
  if (t && CAMP[t.v & 0xFFF] && !G.body.sneaking && campfireUse(t, s, info)) return;
  if (t && SIGN[t.v & 0xFFF] && !G.body.sneaking) { signUse(t, s); return; }
  if (t && b.use === 'toggle' && !G.body.sneaking) { toggle(t); return; }
  if (t && b.use === 'bed' && !G.body.sneaking) { sleepIn(t); return; }
  if (t && b.use && !G.body.sneaking) { openBlock(b.use, t); return; }
  // armour in the hand is put on
  if (info?.armor) { wearHeld(); return; }
  // a fishing rod casts, or reels in what is on the line
  if (info?.tool?.kind === 'rod') { if (G.bobber) reel(); else cast(); return; }
  // seeds, carrots, potatoes on farmland are planted (before being eaten)
  if (t && info?.plant && (t.v & 0xFFF) === ID.farmland && t.face === 2) { if (placeFrom(t, s)) useUp(); return; }
  // cocoa beans on the side of a jungle log: a pod there, facing the log
  if (t && s?.id === 'cocoa_beans') {
    const n = [[1, 0, 0], [-1, 0, 0], null, null, [0, 0, 1], [0, 0, -1]][t.face];
    if (!n || (t.v & 0xFFF) !== ID.jungle_log || G.mirror.get(t.x + n[0], t.y, t.z + n[2])) return;
    setBlock(t.x + n[0], t.y, t.z + n[2], withMeta(ID.cocoa, {0: 1, 1: 3, 4: 2, 5: 0}[t.face])); useUp(); play('place', ID.cocoa);
    return;
  }
  // bone meal, a lighter on TNT
  if (t && info?.meal) {
    const id = t.v & 0xFFF, grows = (['wheat', 'carrots', 'potatoes', 'beetroots'].includes(b.name) && (t.v >>> 12) < 7) || (b.sapling && !(t.v >>> 12 & 8)) || (id === ID.grass_block && !G.mirror.get(t.x, t.y + 1, t.z))
      || ['bamboo', 'bamboo_sapling', 'pink_petals', 'seagrass', 'sea_pickle'].includes(b.name) || (['sand', 'gravel', 'dirt', 'clay'].includes(b.name) && isWater(G.mirror.get(t.x, t.y + 1, t.z)))
      || (id === ID.cocoa && (t.v >>> 12) >> 2 < 2) || ((id === ID.short_grass || id === ID.fern) && !G.mirror.get(t.x, t.y + 1, t.z)) || ['sunflower', 'lilac', 'rose_bush', 'peony'].includes(b.name);
    if (grows) { G.worker.postMessage({type: 'meal', x: t.x, y: t.y, z: t.z}); useUp(); G.ents.puff(t.x + 0.5, t.y + 1, t.z + 0.5, 'meal'); play('meal'); }
    return;
  }
  // flint and steel (or a fire charge, used up) on a block: TNT lit, a portal's frame lit, else fire set on that face
  if (t && (info?.tool?.kind === 'fire' || s?.id === 'fire_charge')) {
    const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
    if (b.name === 'tnt') { setBlock(t.x, t.y, t.z, 0); G.mobs.light(t.x, t.y, t.z); }
    else if (!lightPortal(t) && !setFire(t.x + nx, t.y + ny, t.z + nz)) return;
    if (s.id === 'fire_charge') { useUp(); play('blaze_shoot'); } else { play('ignite'); wearTool(); }
    return;
  }
  // food when hungry (a golden apple any time, in creative too)
  if (info?.food && ((G.mode !== 'creative' && G.food < 20) || info.always)) { G.eating = info.fast ? 16 : 32; return; }
  // a potion is drunk (as long as eating takes), a splash potion thrown
  if (info?.drink) { G.eating = 32; return; }
  // (an ender pearl a second apart)
  if (info?.thrown) { if (s.id === 'ender_pearl') { if (G.pearlWait > 0) return; G.pearlWait = 20; } throwItem(s); useUp(); return; }
  // a glass bottle fills at water
  if (s?.id === 'glass_bottle') {
    const eye = eyePos(), dir = aimDir(), lt = raycast(G.mirror, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach(), true);
    if (lt && (lt.v & 0xFFF) === ID.water) { useUp(); const left = G.inv.add({id: 'potion', n: 1, pot: 'water'}); if (left) G.ents.drop(left, G.body.x, G.body.y + 1, G.body.z); play('splash'); drawHud(true); }
    return;
  }
  if (s && (s.id === 'bucket' || info?.pour)) {
    const eye = eyePos(), dir = aimDir(), lt = raycast(G.mirror, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach(), true);
    if (s.id === 'bucket' && lt && [ID.water, ID.lava].includes(lt.v & 0xFFF) && !(lt.v >>> 12)) {
      setBlock(lt.x, lt.y, lt.z, 0);
      const full = {id: (lt.v & 0xFFF) === ID.water ? 'water_bucket' : 'lava_bucket', n: 1};
      if (G.mode !== 'creative') { useUp(); const left = G.inv.add(full); if (left) G.ents.drop(left, G.body.x, G.body.y + 1, G.body.z); }
      play('splash'); drawHud(true); return;
    }
    // the water of a block standing in water taken out (the game's)
    const tb = t && BLOCKS[t.v & 0xFFF];
    if (s.id === 'bucket' && tb?.water && tb.dry) {
      setBlock(t.x, t.y, t.z, withMeta(ID[tb.dry], t.v >>> 12));
      if (G.mode !== 'creative') { useUp(); const left = G.inv.add({id: 'water_bucket', n: 1}); if (left) G.ents.drop(left, G.body.x, G.body.y + 1, G.body.z); }
      play('splash'); drawHud(true); return;
    }
    // water poured into a block that can stand in it: it does (a lit campfire goes out)
    if (info?.pour === 'water' && t && WATERLOGGED[t.v & 0xFFF] && G.dim !== 'nether' && !info.fish) {
      const id = t.v & 0xFFF, lit = campLit(t.v);
      setBlock(t.x, t.y, t.z, withMeta(WATERLOGGED[id], CAMP[id] ? t.v >>> 12 | 4 : t.v >>> 12));
      if (lit) { soundAt('fizz', t.x + 0.5, t.y + 0.5, t.z + 0.5); G.ents.puff(t.x + 0.5, t.y + 0.5, t.z + 0.5, 'smoke'); }
      if (G.mode !== 'creative') { G.inv.slots[G.hot] = {id: 'bucket', n: 1}; drawHud(true); }
      play('splash'); return;
    }
    // a fish bucket emptied into the water aimed at (no block in reach): the fish goes into it
    if (info?.fish && lt && isWater(lt.v) && (!t || lt.t < t.t)) {
      G.mobs.add(info.fish, lt.x + 0.5, lt.y + 0.3, lt.z + 0.5, {persist: true, variant: s.variant});
      if (G.mode !== 'creative') { G.inv.slots[G.hot] = {id: 'bucket', n: 1}; drawHud(true); }
      play('splash'); return;
    }
    if (info?.pour && t) {
      const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face];
      const x = b.replace ? t.x : t.x + nx, y = b.replace ? t.y : t.y + ny, z = b.replace ? t.z : t.z + nz, here = G.mirror.get(x, y, z);
      if (here && !BLOCKS[here & 0xFFF].replace) return;
      // water poured in the Nether boils away
      if (info.pour === 'water' && G.dim === 'nether') { G.ents.puff(x + 0.5, y + 0.5, z + 0.5, 'smoke'); play('fizz'); }
      else setBlock(x, y, z, ID[info.pour]);
      if (info.fish && G.dim !== 'nether') G.mobs.add(info.fish, x + 0.5, y + 0.2, z + 0.5, {persist: true, variant: s.variant});
      if (G.mode !== 'creative') { G.inv.slots[G.hot] = {id: 'bucket', n: 1}; drawHud(true); }
      play('splash'); return;
    }
  }
  // an empty map becomes the map of where it is used
  if (s?.id === 'map') { const filled = G.maps.make(Math.floor(G.body.x), Math.floor(G.body.z), G.dim); useUp(); handBack(filled); drawHud(true); return; }
  if (info?.boat) {
    const eye = eyePos(), dir = aimDir(), lt = raycast(G.mirror, eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], reach(), true);
    if (!lt) return;
    const water = (lt.v & 0xFFF) === ID.water, [x, hy, z] = lt.hit, y = water ? waterTop(G.mirror, lt.x, lt.y, lt.z) : hy;
    const probe = new Body(G.mirror, [BOAT_W, BOAT_H]);
    Object.assign(probe, {x, y, z});
    const q = probe.aabb();
    if (probe.boxesIn(...q).some(o => o[0] < q[3] - 1e-6 && o[3] > q[0] + 1e-6 && o[1] < q[4] - 1e-6 && o[4] > q[1] + 1e-6 && o[2] < q[5] - 1e-6 && o[5] > q[2] + 1e-6)) return;
    G.boats.add(s.id, x, y, z, {yaw: G.body.yaw}); useUp(); play('place', ID.oak_planks);
    return;
  }
  if (!t) return;
  // a minecart goes on the rail aimed at
  if (info?.cart) { if (isRail(t.v)) { G.carts.add(info.cart, t.x + 0.5, t.y + 0.0625, t.z + 0.5, {yaw: G.body.yaw}); useUp(); play('place', t.v); } return; }
  // a spawn egg: its mob on the block aimed at (no monsters on peaceful)
  if (info?.spawn) {
    if (MOBS[info.spawn].hostile && difficulty() === 'peaceful') return;
    const [nx, ny, nz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][t.face], on = b.replace;
    G.mobs.add(info.spawn, (on ? t.x : t.x + nx) + 0.5, on ? t.y : t.y + ny, (on ? t.z : t.z + nz) + 0.5, MOBS[info.spawn].water ? {persist: true} : undefined); useUp();
    return;
  }
  // an axe takes the bark off a log or wood (it keeps lying the same way)
  if (info?.tool?.kind === 'axe' && /_(log|wood)$|^bamboo_block$/.test(b.name) && !b.name.startsWith('stripped_') && ID[`stripped_${b.name}`] !== undefined) {
    setBlock(t.x, t.y, t.z, withMeta(ID[`stripped_${b.name}`], t.v >>> 12)); wearTool(); play('place', t.v); return;
  }
  // a hoe makes farmland
  if (info?.tool?.kind === 'hoe' && t.face === 2 && ['grass_block', 'dirt'].includes(b.name) && !G.mirror.get(t.x, t.y + 1, t.z)) { setBlock(t.x, t.y, t.z, ID.farmland); wearTool(); play('place', ID.dirt); return; }
  // a shovel makes a path
  if (info?.tool?.kind === 'shovel' && t.face !== 3 && ['grass_block', 'dirt', 'podzol', 'coarse_dirt'].includes(b.name) && !G.mirror.get(t.x, t.y + 1, t.z)) { setBlock(t.x, t.y, t.z, ID.dirt_path); wearTool(); play('place', ID.grass_block); return; }
  if (s && (info.block?.item || info.plant || info.place)) { if (placeFrom(t, s)) useUp(); }
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
/** The other half of a door or a tall plant (above / below) or a bed (head / foot). */
function partnerOf(x, y, z, v) {
  const m = v >>> 12;
  if (BLOCKS[v & 0xFFF].shape === 'door' || BLOCKS[v & 0xFFF].shape === 'tall') return [x, m & 8 ? y - 1 : y + 1, z];
  const [dx, dz] = DIR[m & 3], s = m & 4 ? -1 : 1;
  return [x + dx * s, y, z + dz * s];
}
/** A bed: the place to wake up from now on; at night (and no monster near) sleep till morning. */
function sleepIn(t) {
  // a bed in the Nether blows up (the game's 「刻意的游戏设计」)
  if (G.dim === 'nether') { const [ox, oy, oz] = partnerOf(t.x, t.y, t.z, t.v); setBlock(t.x, t.y, t.z, 0); setBlock(ox, oy, oz, 0); explode(t.x + 0.5, t.y + 0.5, t.z + 0.5, 5, null, '被[刻意的游戏设计]杀死了', true); return; }
  const day = ((G.time % 24000) + 24000) % 24000, night = (day >= 12542 && day <= 23459) || G.weather.thunder > 0.9;
  if (!G.bedPos || G.bedPos.x !== t.x || G.bedPos.y !== t.y || G.bedPos.z !== t.z) { G.bedPos = {x: t.x, y: t.y, z: t.z}; toast('已设置重生点'); }
  if (!night) { toast('你只能在夜里或雷雨天睡觉'); return; }
  if (G.mobs.list.some(m => m.def.hostile && !m.dead && Math.hypot(m.x - t.x - 0.5, m.y - t.y, m.z - t.z - 0.5) < 8)) { toast('现在不能休息，周围有怪物在游荡'); return; }
  const b = G.body;
  Object.assign(b, {x: t.x + 0.5, y: t.y + 0.5625, z: t.z + 0.5, vx: 0, vy: 0, vz: 0});
  b.prev = {x: b.x, y: b.y, z: b.z};
  G.sleeping = 1;
}
// what the composter takes and how likely each one fills it a level (the game's chances)
const COMPOST = {wheat_seeds: 0.3, short_grass: 0.3, sugar_cane: 0.5, cactus: 0.5, melon_slice: 0.5, wheat: 0.65, carrot: 0.65, potato: 0.65, apple: 0.65, pumpkin: 0.65, melon: 0.65, fern: 0.65,
  nether_wart: 0.65, red_mushroom: 0.65, brown_mushroom: 0.65, bread: 0.85, baked_potato: 0.85, hay_block: 0.85,
  vine: 0.5, tall_grass: 0.5, large_fern: 0.65, cocoa_beans: 0.65, sunflower: 0.65, lilac: 0.65, rose_bush: 0.65, peony: 0.65, cookie: 0.85,
  beetroot_seeds: 0.3, beetroot: 0.65, pumpkin_pie: 1};
const compostable = id => COMPOST[id] ?? (/_leaves$|_sapling$|_propagule$|^pink_petals$|^mangrove_roots$|^kelp$|^seagrass$|^dried_kelp$/.test(id) ? 0.3 : id === 'sea_pickle' ? 0.65 : id === 'dried_kelp_block' ? 0.5 : /^(dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|(red|orange|white|pink)_tulip)$/.test(id) ? 0.65 : 0);
/** The composter: what is held goes in (a chance of a level); full, it gives bone meal. */
function compost(t) {
  const level = t.v >>> 12, s = held();
  if (level >= 8) { setBlock(t.x, t.y, t.z, ID.composter); G.ents.drop({id: 'bone_meal', n: 1}, t.x + 0.5, t.y + 1.1, t.z + 0.5); play('pop'); return; }
  const chance = s ? compostable(s.id) : 0;
  if (!chance) return;
  useUp();
  if (Math.random() < chance) { setBlock(t.x, t.y, t.z, withMeta(ID.composter, level + 1 >= 7 ? 8 : level + 1)); G.ents.puff(t.x + 0.5, t.y + 1, t.z + 0.5, 'meal'); }
  play('place', ID.dirt); drawHud(true);
}
function openBlock(kind, t) {
  const k = `${t.x},${t.y},${t.z}`;
  if (kind === 'compost') { compost(t); return; }
  if (kind === 'bell') { play('bell'); G.swing = 6; return; }
  // a lever flips; a button is pressed (the world lets it go); a repeater's delay goes round 1–4; a comparator turns
  // subtracting or back; a note block goes a note up (and plays it); a daylight detector turns inverted or back
  const m = t.v >>> 12, id = t.v & 0xFFF;
  if (kind === 'lever') { setBlock(t.x, t.y, t.z, withMeta(id, m ^ 8)); play('click'); G.swing = 6; return; }
  if (kind === 'button') { if (!(m & 8)) { setBlock(t.x, t.y, t.z, withMeta(id, m | 8)); play('click'); } G.swing = 6; return; }
  if (kind === 'repeater') { setBlock(t.x, t.y, t.z, withMeta(id, (m & 3) | ((m >> 2) + 1 & 3) << 2)); play('click'); G.swing = 6; return; }
  if (kind === 'comparator') { setBlock(t.x, t.y, t.z, withMeta(id, m ^ 4)); play('click'); G.swing = 6; return; }
  if (kind === 'note') { const tile = G.tiles[k] ||= {kind: 'note', note: 0}; tile.note = (tile.note + 1) % 25; noteAt(t.x, t.y, t.z); G.swing = 6; return; }
  if (kind === 'invert') { setBlock(t.x, t.y, t.z, withMeta(id === ID.daylight_detector ? ID.daylight_detector_inverted : ID.daylight_detector, m)); play('click'); G.swing = 6; return; }
  input.enabled = false; input.unlock();
  if (kind === 'crafting') invUI.show('crafting');
  // a smoker or a blast furnace is a furnace of its own kind
  const type = BLOCKS[t.v & 0xFFF].cook;
  if (kind === 'furnace') invUI.show('furnace', G.tiles[k] ||= {kind: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0, ...(type ? {type} : {})});
  if (kind === 'chest') invUI.show('chest', chestView(k, G.tiles[k] ||= {kind: 'chest', slots: lootOf(k, t.x, t.y, t.z) || new Array(27).fill(null)}, t));
  if (kind === 'chest' && BLOCKS[id].rs === 'trapped') trapOpen(k);
  if (kind === 'barrel') invUI.show('chest', G.tiles[k] ||= {kind: 'chest', slots: new Array(27).fill(null), title: '木桶'});
  if (kind === 'enchant') { G.tiles[k] ||= {kind: 'enchant'}; invUI.show('enchant', {pos: {x: t.x, y: t.y, z: t.z}, shelves: shelvesAround((x, y, z) => G.mirror.get(x, y, z), t.x, t.y, t.z, ID.bookshelf)}); }
  if (kind === 'anvil') invUI.show('anvil', {pos: {x: t.x, y: t.y, z: t.z}});
  if (kind === 'cartography') invUI.show('cartography', {pos: {x: t.x, y: t.y, z: t.z}});
  if (kind === 'dispenser') invUI.show('chest', G.tiles[k] ||= {kind: 'dispenser', slots: new Array(9).fill(null), title: BLOCKS[t.v & 0xFFF].zh, cols: 3});
  if (kind === 'hopper') invUI.show('chest', G.tiles[k] ||= {kind: 'hopper', slots: new Array(5).fill(null), title: '漏斗', cols: 5});
  if (kind === 'brew') invUI.show('brew', G.tiles[k] ||= {kind: 'brew', slots: [null, null, null, null, null], fuel: 0, time: 0});
}
/** A trapped chest opened: the world gives power by it (both halves of a large one) till it is shut. */
function trapOpen(k) {
  const tile = G.tiles[k], list = [k];
  if (tile?.pair && G.tiles[tile.pair]?.pair === k) list.push(tile.pair);
  G.trapped = list.map(p => p.split(',').map(Number));
  for (const [x, y, z] of G.trapped) G.worker.postMessage({type: 'trapped', x, y, z, n: 1});
}
function trapShut() {
  if (!G?.trapped) return;
  for (const [x, y, z] of G.trapped) G.worker.postMessage({type: 'trapped', x, y, z, n: 0});
  G.trapped = null;
}
// ---------- the cartography table ----------
/**
 * What a map and what is put with it make at the cartography table (the game's): with an empty map, two of the map;
 * with paper, the map of four times the land round the same place (a step out, to 1:16 at most; blank till it is walked
 * again); with a glass pane, a copy locked as it is (never drawn in again). {out, how} — or {why} when it can't; make:
 * really make the new map (else only what would come out).
 */
function cartography(a, b, make = false) {
  const m = a?.id === 'filled_map' ? G.maps.get(a.map) : null;
  if (!m || !b) return null;
  if (b.id === 'map') return {out: {...a, n: 2}, how: 'copy'};
  if (b.id === 'paper') {
    if (m.locked) return {why: '锁定的地图不能再缩小'};
    if (m.kind !== 'map') return {why: '这种地图不能缩小'};
    if (m.scale >= 4) return {why: '已经缩到最小的比例了（1:16）'};
    if (!make) return {out: {id: 'filled_map', n: 1, label: '地图'}, how: 'zoom', scale: m.scale + 1};
    const z = G.maps.add(m.x, m.z, m.dim, m.scale + 1);
    return {out: {id: 'filled_map', n: 1, map: z.id, label: `地图 #${z.id}`}, how: 'zoom'};
  }
  if (b.id === 'glass_pane') {
    if (m.locked) return {why: '这张地图已经锁定了'};
    if (!make) return {out: {...a, n: 1}, how: 'lock'};
    const c = G.maps.copy(m.id, {locked: true});
    return {out: {...a, n: 1, map: c.id, label: `${m.kind === 'map' ? `地图 #${c.id}` : a.label || '地图'}（已锁定）`}, how: 'lock'};
  }
  return null;
}
/** A map's picture (the cartography table shows it). */
function mapPicture(s) {
  const m = G.maps.get(s?.map), c = document.createElement('canvas');
  if (!m) return '';
  c.width = c.height = 128;
  G.maps.paint(c.getContext('2d'), m, null);
  return c.toDataURL();
}
/**
 * A cartographer's explorer map, made as it is bought: the coast round the ocean monument nearest the villager, the
 * monument marked (an empty map when there is none for thousands of blocks).
 */
function explorerMap(s, v) {
  const t = monumentNear(G.meta.seed, v.x, v.z);
  return t ? G.maps.treasure(G.meta.seed, t, {scale: 2, mark: 'monument', label: s.label}) : {id: 'map', n: 1};
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
const PIERCE = new Set(['fall', 'drown', 'starve', 'void', 'magic']);
function hurt(n, why, from = null, kind = 'hit') {
  if (G.mode === 'creative' || G.dead || n <= 0) return;
  // the difficulty scales what mobs do (the game's: easy half and one more, at most the same; hard half again)
  if (from) { const d = difficulty(); if (d === 'peaceful') return; if (d === 'easy') n = Math.min(n, n / 2 + 1); if (d === 'hard') n *= 1.5; }
  // 抗火: no harm from fire, lava or magma
  if (G.effects.fire_resistance && (kind === 'lava' || kind === 'fire')) return;
  // (a fireball sets them alight)
  if (kind === 'fire' && from) G.fireT = Math.max(G.fireT || 0, 100);
  // a moment after a hit nothing hurts again (a stronger hit only adds what it has more)
  if (G.invuln > 0) { if (n <= G.lastDmg) return; const extra = n - G.lastDmg; G.lastDmg = n; n = extra; }
  else { G.invuln = 10; G.lastDmg = n; }
  const worn = [0, 1, 2, 3].map(i => G.inv.worn(i));
  if (!PIERCE.has(kind)) {
    const {points, tough} = G.inv.armor();
    if (points) { wearArmor(n); n = throughArmor(n, points, tough); }
  }
  // 抗性提升: a fifth less a level (not falling out of the world, nor hunger)
  if (G.effects.resistance && kind !== 'void' && kind !== 'starve') n *= Math.max(0, 1 - 0.2 * (G.effects.resistance.amp + 1));
  n *= protectionFactor(worn, kind);
  // 伤害吸收: the golden hearts go first
  if (G.absorb > 0) { const soak = Math.min(G.absorb, n); G.absorb -= soak; n -= soak; }
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
  if (m.isCart || m.isBoat) { if (!G.attackWait) { (m.isCart ? G.carts : G.boats).hit(m, damageOf(held()?.id), G.mode === 'creative'); G.attackWait = 8; G.swing = 6; } return; }
  if (G.attackWait > 0 || m.dead) return;
  const b = G.body, s = held(), crit = !b.onGround && b.vy < 0 && !b.inWater && !b.climbing;
  let dmg = damageOf(s?.id) * (crit ? 1.5 : 1);
  if (G.mode === 'creative' && !s) dmg = Math.max(dmg, 1);
  // 锋利 half a point a level and a half more; 亡灵杀手 and 节肢杀手 2.5 a level on their own kind
  // (穿刺 2.5 a level on the sea's creatures)
  const sharp = enchOf(s, 'sharpness'), smite = m.def.undead ? enchOf(s, 'smite') : 0, bane = m.kind === 'spider' ? enchOf(s, 'bane_of_arthropods') : 0, impale = m.def.water || m.kind === 'turtle' ? enchOf(s, 'impaling') : 0;
  dmg = Math.max(0, dmg + (sharp ? sharp * 0.5 + 0.5 : 0) + smite * 2.5 + bane * 2.5 + impale * 2.5 + hitBonus(G.effects));
  const hit = G.mobs.hurt(m, dmg, {x: b.x, z: b.z, player: true, knock: (b.sprinting ? 0.9 : 0.4) + enchOf(s, 'knockback') * 0.5});
  G.attackWait = 8; G.swing = 6; G.exh += 0.1;
  if (hit) {
    play('attack', 0, 1);
    if (crit) G.ents.puff(m.x, m.y + m.body.height * 0.7, m.z, 'crit');
    if (sharp || smite || bane || impale) G.ents.puff(m.x, m.y + m.body.height * 0.7, m.z, 'magic');
    const fire = enchOf(s, 'fire_aspect');
    if (fire) m.fire = Math.max(m.fire, 80 * fire);
    const kind = itemInfo(s?.id)?.tool?.kind;
    if (kind) wearTool(kind === 'sword' || kind === 'trident' ? 1 : 2);
  }
  if (b.sprinting) b.sprinting = false;
}
function die(why) {
  G.dead = true; G.body.dead = true; paused = true; input.enabled = false; input.unlock(); invUI.hide();
  const b = G.body;
  // (the game rule 死亡不掉落 keeps everything, experience too)
  if (!rules().keepInventory) {
    for (let i = 0; i < G.inv.slots.length; i++) if (G.inv.slots[i]) { G.ents.drop(G.inv.slots[i], b.x, b.y + 1, b.z); G.inv.slots[i] = null; }
    // experience: seven points a level fall out (at most a hundred), the rest is lost
    G.ents.xp(Math.min(100, G.xp.level * 7), b.x, b.y + 1, b.z);
    G.xp = {level: 0, prog: 0, total: 0};
  }
  drawHud(true);
  screens.dead(why);
}
function survivalTick(r) {
  const b = G.body;
  if (G.mode === 'creative') { G.health = 20; G.food = 20; G.air = 300; G.fireT = 0; return; }
  // on fire: in fire (soul fire hurts more) or lava, and for a while after (the game's eight and fifteen seconds), a
  // point a second; water or the rain puts it out; 抗火 keeps the harm off
  {
    const fx = Math.floor(b.x), fz = Math.floor(b.z), hw = b.w / 2 - 0.001;
    // (any the body touches, as the game's: the corners of its box at its feet, middle and head; soul fire first)
    let flame = 0;
    for (const dy of [0.05, b.hgt / 2, b.hgt - 0.05]) for (const dx of [-hw, hw]) for (const dz of [-hw, hw]) {
      const id = G.mirror.get(Math.floor(b.x + dx), Math.floor(b.y + dy), Math.floor(b.z + dz)) & 0xFFF;
      if (id === ID.soul_fire || (id === ID.fire && !flame)) flame = id;
    }
    if (flame) { G.fireT = Math.max(G.fireT || 0, 160); if (G.ticks % 10 === 0) hurt(flame === ID.soul_fire ? 2 : 1, '被烧死了', null, 'fire'); }
    if (b.inLava) G.fireT = Math.max(G.fireT || 0, 300);
    // a lit campfire stood in hurts, not with 冰霜行者 on (the game's); it sets nothing alight
    const camp = G.mirror.get(fx, Math.floor(b.y + 0.01), fz);
    if (campLit(camp) && !enchOf(G.inv.worn(3), 'frost_walker') && G.ticks % 10 === 0) hurt(soulCamp(camp) ? 2 : 1, '被烧死了', null, 'fire');
    if (G.fireT > 0) {
      if (b.inWater || (fallsAt(fx, fz) === 'rain' && topAt(fx, fz) <= Math.floor(b.y + 1.8))) G.fireT = 0;
      else if (--G.fireT % 20 === 0) hurt(1, '被烧死了', null, 'fire');
    }
  }
  // peaceful: never hungry, the hearts come back by themselves (one each second)
  if (difficulty() === 'peaceful') { if (G.food < 20 || G.sat < 5) { G.food = 20; G.sat = Math.max(G.sat, 5); drawHud(true); } if (G.health < 20 && G.ticks % 20 === 0) { G.health = Math.min(20, G.health + 1); drawHud(true); } }
  // a turtle shell worn: water breathing kept at ten seconds while the head is out of the water
  if (G.inv.worn(0)?.id === 'turtle_helmet' && !b.headInWater && G.ticks % 20 === 0) giveEffect('water_breathing', 0, 200);
  // a hay bale takes four fifths of a fall
  const onHay = (G.mirror.get(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z)) & 0xFFF) === ID.hay_block;
  if (r.landed > 3 && !b.inWater) hurt(Math.ceil((r.landed - 3) * (onHay ? 0.2 : 1)), '摔得太重了', null, 'fall');
  if (r.landed > 2) play('fall', 0, Math.min(1, r.landed / 8));
  // air
  if (b.headInWater && !G.effects.water_breathing && !G.effects.conduit_power) { if (Math.random() < 1 / (enchOf(G.inv.worn(0), 'respiration') + 1)) G.air--; if (G.air <= -20) { G.air = 0; hurt(2, '淹死了', null, 'drown'); } } else G.air = Math.min(300, G.air + 4);
  if ((b.inLava) && G.ticks % 10 === 0) hurt(4, '掉进了岩浆', null, 'lava');
  if (b.touchCactus && G.ticks % 10 === 0) hurt(1, '被仙人掌扎死了', null, 'cactus');
  // magma burns feet, unless sneaking
  // (not with 冰霜行者 on)
  if (b.onGround && !b.sneaking && G.ticks % 10 === 0 && !enchOf(G.inv.worn(3), 'frost_walker') && (G.mirror.get(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z)) & 0xFFF) === ID.magma_block) hurt(1, '发现了地板是熔岩做的', null, 'fire');
  if (b.y < MINY - 64 && G.ticks % 10 === 0) hurt(4, '掉出了世界', null, 'void');
  // hunger
  if (b.sprinting) G.exh += 0.1 * Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
  if (r.jumped) G.exh += b.sprinting ? 0.2 : 0.05;
  if (G.exh >= 4) { G.exh -= 4; if (G.sat > 0) G.sat = Math.max(0, G.sat - 1); else { G.food = Math.max(0, G.food - 1); drawHud(true); } }
  if (G.food >= 18 && G.health < 20) { if (++G.regen >= (G.food >= 20 && G.sat > 0 ? 10 : 80)) { G.regen = 0; G.health = Math.min(20, G.health + 1); G.exh += 6; drawHud(true); } } else G.regen = 0;
  // starving: down to half the hearts on easy, to half a heart on normal, to death on hard
  if (G.food <= 0) { if (++G.starve >= 80) { G.starve = 0; if (G.health > {peaceful: 20, easy: 10, normal: 1, hard: 0}[difficulty()]) hurt(1, '饿死了', null, 'starve'); } } else G.starve = 0;
  if (G.food <= 6) b.sprinting = false;
}
function eatTick() {
  if (!G.eating) return;
  const s = held(), info = s && itemInfo(s.id);
  if (!info?.food && !info?.drink) { G.eating = 0; return; }
  if (G.eating % 4 === 0) play(info.drink ? 'drink' : 'eat');
  if (--G.eating > 0) return;
  if (s.id === 'milk_bucket') { drinkMilk(); return; }
  if (info.drink) { drink(s); return; }
  G.food = Math.min(20, G.food + info.food); G.sat = Math.min(G.food, G.sat + (info.sat || info.food * 0.6));
  for (const [id, amp, secs, chance = 1] of info.effects || []) if (Math.random() < chance) giveEffect(id, amp, secs * 20);
  if (s.stew && STEWS[s.stew]) { const [id, amp, secs] = STEWS[s.stew]; giveEffect(id, amp, Math.max(1, Math.round(secs * 20))); }
  useUp();
  // a stew or a soup leaves its bowl
  if (info.bowl && G.mode !== 'creative') handBack({id: 'bowl', n: 1});
  play('burp'); drawHud(true);
}

/**
 * Bubble columns: one over soul sand lifts what is in it (and throws it up where it meets the air), one over a magma
 * block pulls it down (the game's numbers); bubbles rise or swirl down in the columns round the player.
 */
let columns = [];
/** Something in a bubble column (its velocity in vy): lifted, and thrown up where the column meets the air, or pulled down. */
function bubbleOn(o, x, y, z) {
  const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), v = G.mirror.get(bx, by, bz);
  if ((v & 0xFFF) !== ID.bubble_column) return;
  const top = !G.mirror.get(bx, by + 1, bz);
  o.vy = v >>> 12 & 1 ? Math.max(top ? -0.9 : -0.3, o.vy - 0.03) : Math.min(top ? 1.8 : 0.7, o.vy + (top ? 0.1 : 0.06));
}
function bubbleTick() {
  const b = G.body, bx = Math.floor(b.x), bz = Math.floor(b.z);
  if (!G.riding && !b.flying) for (const y of new Set([Math.floor(b.y + 0.1), Math.floor(b.y + 1)])) {
    const v = G.mirror.get(bx, y, bz);
    if ((v & 0xFFF) !== ID.bubble_column) continue;
    const top = !G.mirror.get(bx, y + 1, bz);
    b.vy = v >>> 12 & 1 ? Math.max(top ? -0.9 : -0.3, b.vy - 0.03) : Math.min(top ? 1.8 : 0.7, b.vy + (top ? 0.1 : 0.06));
    break;
  }
  // dropped things and mobs in a column go the same way (boats: boats.js)
  for (const it of G.ents.items) bubbleOn(it, it.x, it.y + 0.1, it.z);
  for (const m of G.mobs.list) if (!m.dead) bubbleOn(m.body, m.x, m.y + 0.1, m.z);
  // the columns near: looked for twice a second, bubbles from a few of them every tick
  if (G.ticks % 10 === 0) {
    columns = [];
    for (let y = Math.floor(b.y) - 8; y <= Math.floor(b.y) + 8; y++) for (let z = bz - 10; z <= bz + 10; z++) for (let x = bx - 10; x <= bx + 10; x++) {
      const v = G.mirror.get(x, y, z);
      if ((v & 0xFFF) === ID.bubble_column && columns.length < 400) columns.push([x, y, z, v >>> 12 & 1]);
    }
  }
  for (let k = 0; k < Math.min(columns.length, 6); k++) { const [x, y, z, down] = columns[Math.floor(Math.random() * columns.length)]; G.ents.puff(x + 0.3 + Math.random() * 0.4, y + Math.random(), z + 0.3 + Math.random() * 0.4, down ? 'bubble_down' : 'bubble_up'); }
}
/** The elder guardian's curse: its face looms up over the screen and fades, with its moan (the game's). */
function curse() {
  play('curse');
  const img = skinPics.elder_guardian, c = $('.curse');
  if (!img || !c) return;
  const k = img.width / 64, g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, 12, 12);
  g.drawImage(img, 16 * k, 16 * k, 12 * k, 12 * k, 0, 0, 12, 12);
  g.drawImage(img, 9 * k, 1 * k, 2 * k, 2 * k, 5, 5, 2, 2);
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}
/** Guardians' beams: from the eye to the middle of the player, purple going to yellow as it charges (the game's). */
let beamV = null;
function beamThings(view) {
  const list = G.mobs.list.filter(m => m.beamT > 0 && !m.dead);
  if (!list.length || G.dead) return [];
  const v = (beamV ||= new Verts(512)).reset(), layer = LAYER.guardian_beam ?? 0, pb = G.body;
  for (const m of list) {
    const f = (m.beamT / m.def.beam) ** 2, tint = (64 + Math.floor(f * 191)) << 16 | (32 + Math.floor(f * 191)) << 8 | (128 - Math.floor(f * 64));
    const a = [m.x - view.x, m.y + m.body.height / 2 - view.y, m.z - view.z], e = [pb.x - view.x, pb.y + 0.9 - view.y, pb.z - view.z];
    const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]], len = Math.hypot(...d);
    if (len < 0.5) continue;
    const u = d.map(c => c / len), side = Math.hypot(u[0], u[2]) > 0.01 ? [u[2], 0, -u[0]] : [1, 0, 0], sl = Math.hypot(...side), s1 = side.map(c => c / sl * 0.09);
    const s2 = [u[1] * s1[2] - u[2] * s1[1], u[2] * s1[0] - u[0] * s1[2], u[0] * s1[1] - u[1] * s1[0]];
    for (let t = 0; t < len; t += 1) {
      const t1 = Math.min(len, t + 1), p0 = a.map((c, i) => c + u[i] * t), p1 = a.map((c, i) => c + u[i] * t1), vv = Math.round((t1 - t) * 16);
      for (const w of [s1, s2]) { const c = [[p0, -1, 0, 0], [p0, 1, 16, 0], [p1, 1, 16, vv], [p1, -1, 0, vv]]; for (const [p, q, uu, vt] of [...c, ...c.reverse()]) v.v(p[0] + w[0] * q, p[1] + w[1] * q, p[2] + w[2] * q, 256, 128, layer, uu, vt, 255, 255, 2 << 2, tint); }
    }
  }
  return v.n ? [{verts: v, x: view.x, y: view.y, z: view.z, model: mat.identity(), center: 128, bright: 1}] : [];
}
// ---------- one tick (20 a second) ----------
let ctl = {fwd: 0, side: 0, jump: false, sneak: false, sprint: false, attack: false, use: false, aim: null};
function tick() {
  const b = G.body;
  // nothing moves while going through a portal, or while the one on the other side is made
  if (G.arriving || G.leaving) return;
  // ticks played (the world's clock may stand still)
  G.ticks = (G.ticks || 0) + 1;
  if (rules().doDaylightCycle) G.time++;
  // asleep: the screen goes dark; after five seconds it is morning
  if (G.sleeping && ++G.sleeping >= 100) {
    G.time = Math.ceil(G.time / 24000) * 24000; G.sleeping = 0; toast('天亮了');
    // waking up, the rain has stopped
    const w = G.weather;
    if (w.raining || w.thundering) Object.assign(w, {raining: false, thundering: false, rain: 0, thunder: 0, rainT: 12000 + Math.floor(Math.random() * 168000), thunderT: 12000 + Math.floor(Math.random() * 168000)});
  }
  const r = G.riding ? {landed: 0, stepped: 0} : b.tick(G.sleeping ? {} : {...ctl, autoJump: ctl.autoJump && settings.autoJump, flyStay: false, speed: 0.1 * speedFactor(G.effects), grace: !!G.effects.dolphins_grace, strider: enchOf(G.inv.worn(3), 'depth_strider')});
  bubbleTick();
  if (portalTick()) return;
  if (G.mode !== 'creative' && b.flying) b.flying = false;
  input.setFlying(b.flying);
  // steps
  const moved = Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
  if (b.onGround && !b.sneaking && !G.riding) { G.walked += moved; if (G.walked - G.stepAt > 1.6) { G.stepAt = G.walked; play('step', G.mirror.get(Math.floor(b.x), Math.floor(b.y - 0.2), Math.floor(b.z))); } }
  if (b.inWater && !G.riding && moved > 0.05 && G.ticks % 12 === 0) play('swim');
  survivalTick(r);
  eatTick();
  // potion effects wear off; regeneration heals, poison hurts (never to death); swirls round the player
  if (Object.keys(G.effects).length) {
    const gone = effectsTick(G.effects, {heal: n => { if (G.health < 20 && !G.dead) { G.health = Math.min(20, G.health + n); drawHud(true); } }, harm: (n, kind) => hurt(n, kind === 'wither' ? '凋零了' : '中毒了', null, 'magic'),
      feed: n => { G.food = Math.min(20, G.food + n); G.sat = Math.min(G.food, G.sat + n * 2); drawHud(true); }, health: () => G.health});
    if (gone.includes('absorption') && G.absorb) { G.absorb = 0; drawHud(true); }
    const c = swirlColor(G.effects);
    if (c != null && G.view && G.ticks % 3 === 0 && !G.effects.invisibility) G.ents.puff(b.x + (Math.random() - 0.5) * 0.6, b.y + Math.random() * 1.8, b.z + (Math.random() - 0.5) * 0.6, 'swirl', c);
    if (G.ticks % 10 === 0) drawEffects();
  } else if (fxKey) drawEffects();
  thrownTick();
  seaTick();
  frostWalk();
  if (G.attackWait > 0) G.attackWait--;
  if (G.invuln > 0) G.invuln--;
  // a bow: held use draws it (on a phone: holding the screen), letting go shoots; a trident the same (on a phone held
  // anywhere but on a mob, which it stabs), let go after half a second
  const handKind = itemInfo(held()?.id)?.tool?.kind, bow = handKind === 'bow', trident = handKind === 'trident';
  const drawing = !G.dead && (ctl.use || (input.mode === 'touch' && ctl.attack && (bow || !G.targetMob)));
  if (bow && drawing) { if (G.mode === 'creative' || G.inv.count('arrow') > 0) G.draw++; }
  else if (trident && drawing) { if (canThrow(held())) G.draw++; else G.draw = 0; }
  else if (G.draw > 0) {
    const f = Math.min(1, G.draw / 20), power = Math.min(1, (f * f + f * 2) / 3);
    if (trident) { if (G.draw >= 10) letGo(held()); }
    else if (bow && power >= 0.1) {
      // 无限: the arrow is not used up (and cannot be picked up)
      const bowItem = held(), infinite = G.mode === 'creative' || enchOf(bowItem, 'infinity') > 0;
      G.mobs.shootFromPlayer(b, b.look(), power, !infinite, {strength: enchOf(bowItem, 'power'), punch: enchOf(bowItem, 'punch'), flame: enchOf(bowItem, 'flame')});
      if (!infinite) { const i = G.inv.slots.findIndex(s => s?.id === 'arrow'); if (i >= 0) G.inv.take(i, 1); }
      wearTool(); play('bow');
    }
    G.draw = 0;
  }
  if (G.riptide > 0) spinTick();
  // a fireball in front is hit back
  if (ctl.attack && !G.attackWait && !G.dead && G.mobs.deflect(eyePos(), aimDir())) { G.attackWait = 8; G.swing = 6; }
  // hitting a mob, else breaking
  const t = G.target;
  if (G.breakWait > 0) G.breakWait--;
  if (G.pearlWait > 0) G.pearlWait--;
  const aiming = bow || (trident && G.draw > 0);
  if (ctl.attack && G.targetMob && !G.dead && !aiming) { attackMob(G.targetMob); G.breaking = null; }
  // fire on the face of the block hit goes out (the game's)
  else if (ctl.attack && t && !G.dead && !aiming && fireOn(t)) { if (!G.breakWait) { const [x, y, z] = fireOn(t); setBlock(x, y, z, 0); soundAt('fizz', x + 0.5, y + 0.5, z + 0.5); G.breakWait = 6; G.swing = 6; } G.breaking = null; }
  else if (ctl.attack && t && !G.dead && !aiming) {
    // digging swings the arm over and over: a new swing once the last is half way (as the game does)
    if (G.swing <= 3) G.swing = 7;
    if (G.mode === 'creative') { if (!G.breakWait) { breakBlock(t); G.breakWait = 6; } G.breaking = null; }
    else {
      const bk = G.breaking, same = bk && bk.x === t.x && bk.y === t.y && bk.z === t.z && bk.v === t.v;
      if (!same) G.breaking = {x: t.x, y: t.y, z: t.z, v: t.v, p: 0};
      // under water (without 水下速掘) and off the ground the game digs five times slower each
      const mult = (b.headInWater && !enchOf(G.inv.worn(0), 'aqua_affinity') ? 0.2 : 1) * (!b.onGround && !b.flying ? 0.2 : 1)
        * (G.effects.mining_fatigue ? [0.3, 0.09, 0.0027, 0.00081][Math.min(3, G.effects.mining_fatigue.amp)] : 1) * (G.effects.conduit_power ? 1.2 : 1);
      const secs = breakTime(BLOCKS[t.v & 0xFFF], heldTool(), {efficiency: enchOf(held(), 'efficiency'), mult});
      if (secs === 0) { if (!G.breakWait) { breakBlock(t); G.breaking = null; G.breakWait = 5; } }
      else if (secs < Infinity && !G.breakWait) {
        G.breaking.p += 1 / (secs * 20);
        if (G.ticks % 4 === 0) { play('hit', t.v); G.ents.burst(t.x, t.y, t.z, t.v, 2); }
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
  // minecarts roll and boats float; the player sitting in one goes with it, sitting (shift gets out; a powered activator
  // rail throws them out of a cart, three seconds under water out of a boat)
  const inCart = G.riding?.isCart && G.carts.list.includes(G.riding) ? {cart: G.riding, fwd: ctl.fwd, look: b.look()} : null;
  const inBoat = G.riding?.isBoat && G.boats.list.includes(G.riding) ? {boat: G.riding, fwd: ctl.fwd, side: ctl.side} : null;
  if (!inCart && !inBoat) G.riding = null;
  G.carts.tick(inCart);
  G.boats.tick(inBoat);
  const ride = inCart || inBoat;
  if (ride && (ctl.sneak || ride.eject || !(inCart ? G.carts.list.includes(inCart.cart) : G.boats.list.includes(inBoat.boat)))) getOff();
  else if (inCart) { const c = inCart.cart.body; b.x = c.x; b.y = c.y - 0.35; b.z = c.z; b.prev = {x: c.prev.x, y: c.prev.y - 0.35, z: c.prev.z}; b.vx = b.vy = b.vz = 0; b.fall = 0; b.onGround = true; }
  else if (inBoat) {
    // in a boat: on its seat, the view turning with it (and kept within 105° of the way it points)
    const c = inBoat.boat, [px, py, pz] = G.boats.seat(c, true), [sx, sy, sz] = G.boats.seat(c);
    b.prev = {x: px, y: py, z: pz}; b.x = sx; b.y = sy; b.z = sz; b.vx = b.vy = b.vz = 0; b.fall = 0; b.onGround = true;
    b.yaw += c.yaw - c.prevYaw;
    const rel = ((b.yaw - c.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(rel) > 1.8326) b.yaw = c.yaw + Math.sign(rel) * 1.8326;
    b.feel();
  } else {
    if (G.carts.list.length) G.carts.shove(b.x, b.z, b.x - b.prev.x, b.z - b.prev.z);
    if (G.boats.list.length) { const [px, pz] = G.boats.shove(b.x, b.y, b.z, PLAYER_W, b.height); b.vx += px; b.vz += pz; }
  }
  G.ents.tick(b, stack => { if (G.dead) return stack; const left = G.inv.add(stack); drawHud(true); return left; });
  G.ents.orbTick(b, v => gainXp(v));
  weatherTick();
  bobberTick();
  // the body turns after the head when it has turned far, or when walking
  const turnBy = ((b.yaw - G.bodyYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (moved > 0.01) G.bodyYaw += turnBy * 0.5; else if (Math.abs(turnBy) > 0.85) G.bodyYaw += turnBy - Math.sign(turnBy) * 0.85;
  if (G.riding?.isBoat) G.bodyYaw = G.riding.yaw;
  G.limbAmt = (G.limbAmt || 0) + (Math.min(1, moved * 4) - (G.limbAmt || 0)) * 0.4;
  for (const [k, tile] of Object.entries(G.tiles)) if (tile.kind === 'brew') {
    // brewing stands brew whether their window is open or not
    brewTick(tile);
    if (tile.done) { tile.done = false; const [x, y, z] = k.split(',').map(Number); soundAt('brew', x + 0.5, y + 0.5, z + 0.5); }
  } else if (tile.kind === 'furnace') {
    const was = tile.burn > 0, lit = furnaceTick(tile);
    if (was !== lit) { const [x, y, z] = k.split(',').map(Number), v = G.mirror.get(x, y, z); if (BLOCKS[v & 0xFFF]?.use === 'furnace') setBlock(x, y, z, withMeta(v & 0xFFF, (v >>> 12 & 3) | (lit ? 4 : 0))); }
  }
  platesTick();
  tripwiresTick();
  hoppersTick();
  campfiresTick();
  if (G.ticks % 10 === 0) fillsTick();
  if (invUI.open && (invUI.kind === 'furnace' || invUI.kind === 'brew' || (invUI.kind === 'chest' && invUI.data?.kind === 'hopper')) && G.ticks % 4 === 0) invUI.refresh();
  // the worker: where we are, how dark the sky is
  const cx = Math.floor(b.x / 16), cz = Math.floor(b.z / 16);
  if (cx !== G.cx || cz !== G.cz) { G.cx = cx; G.cz = cz; G.worker.postMessage({type: 'center', cx, cz}); }
  // (every second of play, not of the world's clock: it may stand still, or be set by a command)
  if (G.ticks % 20 === 0) { const daylight = environment(G.time).daylight; G.worker.postMessage({type: 'day', dark: Math.round((1 - daylight) * 11), snow: G.weather.rain > 0.5, daylight, fire: rules().doFireTick !== false}); }
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
    else if (e === 'debug') { debugOn = !debugOn; $('.debug').hidden = !debugOn; renderer.profile = debugOn; }
    else if (e === 'chat' || e === 'command') openChat(e === 'command' ? '/' : '');
    else if (e === 'hud') { hudHidden = !hudHidden; hud.style.opacity = hudHidden ? 0 : 1; }
    else if (e === 'view') { G.view = (G.view + 1) % 3; toast(['第一人称', '第三人称（背后）', '第三人称（正面）'][G.view]); }
    else if (e === 'use') { const t = targetAt(), m = mobAt(); if (m && (!t || m.t < t.t)) use(null, m.mob); else use(t); G.useWait = 5; }
    else if (e === 'pick' && G.target) {
      // (a block standing in water picks the block itself)
      const tb = BLOCKS[G.target.v & 0xFFF], id = tb.dry || tb.name, name = BLOCKS[ID[id]]?.item ? id : null;
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
  const r = G.mode === 'creative' ? 5 : 3;
  let best = G.mobs.raycast(o[0], o[1], o[2], d[0], d[1], d[2], r);
  for (const c of [G.carts.raycast(o[0], o[1], o[2], d[0], d[1], d[2], r), G.boats.raycast(o[0], o[1], o[2], d[0], d[1], d[2], r)]) if (c && c.mob !== G.riding && (!best || c.t < best.t)) best = c;
  return best;
}

// ---------- the HUD ----------
let hudKey = '';
function drawHud(force = false) {
  if (!G) return;
  const armor = G.inv.armor().points;
  const turning = G.inv.slots.slice(0, 9).some(s => s && itemInfo(s.id)?.dial) ? [dials.compass, dials.clock] : 0;
  const key = JSON.stringify([turning, G.inv.slots.slice(0, 9), G.hot, Math.ceil(G.health), Math.ceil(G.absorb || 0), G.food, Math.ceil(G.air / 30), G.mode, input?.mode, armor, G.xp.level, Math.round(G.xp.prog * 182)]);
  if (!force && key === hudKey) return;
  hudKey = key;
  const hb = $('.hotbar');
  hb.innerHTML = G.inv.slots.slice(0, 9).map((s, i) => `<div class="s${i === G.hot ? ' on' : ''}" data-i="${i}">${stackHtml(s, icons)}</div>`).join('') + (input?.mode === 'touch' ? '<div class="more" data-inv>⋯</div>' : '');
  const survival = G.mode !== 'creative';
  const row = (n, full, halfK, empty, count = 10) => Array.from({length: count}, (_, i) => `<img class="px" style="width:calc(9*var(--u));height:calc(9*var(--u))" src="${HUD_URL[n >= (i + 1) * 2 ? full : n >= i * 2 + 1 ? halfK : empty]}">`).join('');
  $('.hearts').innerHTML = survival ? row(Math.ceil(G.health), 'heartFull', 'heartHalf', 'heartEmpty') : '';
  $('.food').innerHTML = survival ? row(G.food, 'foodFull', 'foodHalf', 'foodEmpty') : '';
  // armour over the hearts (only when some is worn), the experience bar and level over the hotbar
  // golden hearts (伤害吸收) in a row over the red ones, the armour then over those
  const gold = survival ? Math.ceil(G.absorb || 0) : 0;
  $('.bars .absorb').innerHTML = gold ? row(gold, 'absorbFull', 'absorbHalf', 'absorbHalf', Math.min(10, Math.ceil(gold / 2))) : '';
  $('.bars .armor').innerHTML = survival && armor ? row(armor, 'armorFull', 'armorHalf', 'armorEmpty') : '';
  $('.bars .armor').style.bottom = gold ? 'calc(20*var(--u))' : '';
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
  const look = G.bobber && s.id === 'fishing_rod' ? {flat: LAYER.fishing_rod_cast, tint: 0xFFFFFF} : itemLook(s.id, s);
  if (look.cube) {
    v.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints);
    return {verts: v, model: mat.model(0.38, Math.PI / 4 + sw * 0.6, -0.05 - sw * 0.5, 0, 0.58 + sideBob - sw * 0.2, -0.5 + bob + eat + sw * 0.1, -0.78 - sw * 0.2)};
  }
  // (a sixteenth thick, as the game draws what is in the hand; a potion's bottle stays a picture)
  if (look.over != null) v.flatLook(0.5, look, sky * 17, blk * 17, 256, 32); else thickItem(v, look.flat, look.tint, sky * 17, blk * 17);
  const tool = !!itemInfo(s.id)?.tool;
  // a trident drawn back to throw: raised over the shoulder, its prongs ahead, pulled back as it charges (shaking a
  // little once it is ready)
  if (G.draw > 0 && itemInfo(s.id)?.tool?.kind === 'trident') {
    const f = Math.min(1, G.draw / 10), shake = f >= 1 ? Math.sin(G.time * 1.3) * 0.004 : 0;
    return {verts: v, model: mat.model(1, Math.PI / 2 + 0.15, 1.2, -0.61, 0.47 + sideBob, -0.1 + bob + shake, -1.05 + f * 0.2)};
  }
  return {verts: v, model: mat.model(0.62, -Math.PI / 2 + 0.25, tool ? 0.1 - sw * 1.2 : -sw * 0.6, tool ? 0.55 : 0.2, 0.62 + sideBob - sw * 0.15, -0.45 + bob + eat + sw * 0.08, -0.8 - sw * 0.15)};
}

// ---------- the trident ----------
/** Riptide works in water, or out in the rain under the open sky. */
function riptideWet() {
  const b = G.body;
  return b.inWater || (fallsAt(Math.floor(b.x), Math.floor(b.z)) === 'rain' && G.mirror.light(Math.floor(b.x), Math.floor(b.y + 1.6), Math.floor(b.z))[0] >= 15);
}
/** Whether a trident can be drawn back: not one about to break, nor one with 激流 out of the water and the rain. */
const canThrow = s => !!s && (s.dmg || 0) < itemInfo(s.id).tool.uses - 1 && (!enchOf(s, 'riptide') || riptideWet());
/**
 * A trident let go: thrown the way they look (in survival it leaves the hand) — or, with 激流, its holder launched
 * (the game's: 3 × (1 + level) / 4 the way they look, lifted off the ground first) to spin through what they meet for
 * a second. Either wears it by one.
 */
function letGo(s) {
  const b = G.body, rip = enchOf(s, 'riptide');
  if (!canThrow(s)) return;
  wearTool();
  if (rip) {
    const d = b.look(), f = 3 * (1 + rip) / 4;
    if (b.onGround) b.move(0, 1.2, 0);
    b.vx += d[0] * f; b.vy += d[1] * f; b.vz += d[2] * f;
    G.riptide = 20; play('riptide');
    return;
  }
  const left = G.inv.slots[G.hot];
  if (!left) return;
  G.mobs.throwTrident(b, b.look(), left, G.mode === 'creative');
  if (G.mode !== 'creative') G.inv.slots[G.hot] = null;
  play('trident_throw'); drawHud(true);
}
/** Spinning from 激流: the first mob met is hit (8; 穿刺 on the sea's creatures) and the player bounces back off it; a
 *  wall stops the spin (the game's). */
function spinTick() {
  G.riptide--;
  const b = G.body, s = held(), [x0, y0, z0, x1, y1, z1] = b.aabb();
  for (const m of G.mobs.list) {
    if (m.dead) continue;
    const [a0, b0, c0, a1, b1, c1] = m.body.aabb();
    if (a0 > x1 + 0.3 || a1 < x0 - 0.3 || b0 > y1 + 0.3 || b1 < y0 - 0.3 || c0 > z1 + 0.3 || c1 < z0 - 0.3) continue;
    G.mobs.hurt(m, 8 + (m.def.water || m.kind === 'turtle' ? enchOf(s, 'impaling') * 2.5 : 0), {x: b.x, z: b.z, player: true});
    play('attack'); b.vx *= -0.2; b.vy *= -0.2; b.vz *= -0.2; G.riptide = 0;
    return;
  }
  if (b.collidedX) G.riptide = 0;
}
/** Arrows in flight or stuck, and lit TNT (flashing white), as things to draw. */
let arrowVerts = null, tntVerts = null;
function shotThings(light) {
  const out = [];
  for (const ar of G.mobs.arrows) {
    const [sky, blk] = light(Math.floor(ar.x), Math.floor(ar.y), Math.floor(ar.z));
    // (a trident: its own picture, bigger, its prongs where it hit; flying back to its thrower it comes foot first)
    const layer = ar.trident ? LAYER.trident : LAYER.arrow, v = (arrowVerts ||= {}), key = `${layer}|${sky * 16 + blk}`;
    const verts = v[key] ||= (() => { const q = new Verts(16); q.arrow(0.5, layer, sky * 17, blk * 17, 256, 32); return q; })();
    if (!ar.stuck) ar.dir = ar.back ? [-ar.vx, -ar.vy, -ar.vz] : [ar.vx, ar.vy, ar.vz];
    const [dx, dy, dz] = ar.dir || [0, -1, 0], l = Math.hypot(dx, dy, dz) || 1, back = ar.trident ? 0.55 : 0;
    out.push({verts, x: ar.x - dx / l * back, y: ar.y - dy / l * back, z: ar.z - dz / l * back, model: mat.model(ar.trident ? 1.1 : 0.5, Math.atan2(dx, dz), Math.acos(Math.max(-1, Math.min(1, dy / l))), 0)});
  }
  for (const t of G.mobs.tnt) {
    if (!tntVerts) { tntVerts = new Verts(32); tntVerts.cube(0.5, [LAYER.tnt_side, LAYER.tnt_side, LAYER.tnt_top, LAYER.tnt_bottom, LAYER.tnt_side, LAYER.tnt_side], 255, 255, 256, 32); }
    const grow = t.fuse < 10 ? 1 + (10 - t.fuse) * 0.02 : 1;
    out.push({verts: tntVerts, x: t.x, y: t.y + 0.5, z: t.z, model: mat.model(grow), bright: Math.floor(t.fuse / 5) % 2 ? 0.5 : 0});
  }
  return out;
}
/** Fireballs in flight: a burning ball turned to the camera, lit by itself. */
let fireVerts = null;
function fireThings(view) {
  if (!G.mobs.balls.length) return [];
  if (!fireVerts) { fireVerts = new Verts(16); fireVerts.flat(0.5, LAYER.fire_charge, 255, 255, 256, 32); }
  return G.mobs.balls.map(f => ({verts: fireVerts, x: f.x, y: f.y, z: f.z, model: mat.model(f.big ? 1 : 0.32, view.yaw), bright: 1}));
}
/** A box (in the thing's own units) into verts, a picture per face (east, west, up, down, south, north), each one whole. */
function boxVerts(v, x0, y0, z0, x1, y1, z1, layers, sky, blk, tints = null) {
  const F = [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]];
  const UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
  for (let f = 0; f < 6; f++) for (let c = 0; c < 4; c++) v.v(F[f][c][0], F[f][c][1], F[f][c][2], 256, 32, layers[f], UV[c][0], UV[c][1], sky, blk, f << 2, tints ? tints[f] : 0xFFFFFF);
}
/** Minecarts: an iron box, long the way it faces, with what it carries inside; tipped on a slope; shaking a little when hit. */
function cartThings(a, light) {
  return G.carts.list.map(c => {
    const b = c.body, x = b.prev.x + (b.x - b.prev.x) * a, y = b.prev.y + (b.y - b.prev.y) * a, z = b.prev.z + (b.z - b.prev.z) * a;
    const [sky, blk] = light(Math.floor(x), Math.floor(y + 0.4), Math.floor(z)), S = sky * 17, K = blk * 17, v = new Verts(256);
    const side = LAYER.minecart_side ?? 0, inner = LAYER.minecart_inside ?? 0, box = (q, top) => boxVerts(v, ...q, [side, side, top, side, side, side], S, K);
    box([-0.44, 0.06, -0.62, 0.44, 0.19, 0.62], inner);
    for (const q of [[-0.44, 0.19, -0.62, -0.31, 0.69, 0.62], [0.31, 0.19, -0.62, 0.44, 0.69, 0.62], [-0.31, 0.19, -0.62, 0.31, 0.69, -0.49], [-0.31, 0.19, 0.49, 0.31, 0.69, 0.62]]) box(q, side);
    // (a hopper's item is a flat picture: its cube from the hopper's own faces)
    const load = CARTS[c.kind], hop = LAYER.hopper_outside ?? 0, look = load === 'hopper' ? {cube: [hop, hop, LAYER.hopper_top ?? 0, hop, hop, hop]} : load && itemLook(load);
    if (look?.cube) boxVerts(v, -0.3, 0.19, -0.3, 0.3, 0.79, 0.3, look.cube, S, K, look.tints);
    const shake = c.hurt ? Math.sin(c.hurt * 1.3) * c.hurt / 50 : 0;
    return {verts: v, x, y, z, model: mat.model(1, c.yaw, c.pitch, shake)};
  });
}
/** Boats: the game's model in each wood's skin, its paddles rowing round, rocking a little when hit. */
function boatModels(view, a, light) {
  return G.boats.list.map(c => {
    const b = c.body, x = b.prev.x + (b.x - b.prev.x) * a, y = b.prev.y + (b.y - b.prev.y) * a, z = b.prev.z + (b.z - b.prev.z) * a, yaw = c.prevYaw + (c.yaw - c.prevYaw) * a;
    const kind = c.raft ? (c.chest ? 'chest_raft' : 'raft') : c.chest ? 'chest_boat' : 'boat', skin = `${c.chest ? 'chest_boat' : 'boat'}_${c.wood}`;
    const rot = animate(kind, {}, {paddles: c.paddles.map((p, i) => p + (c.rowing[i] ? Math.PI / 8 * a : 0))}), f = c.hurt - a;
    const roll = f > 0 ? Math.sin(f) * f * Math.max(0, c.damage - a) / 10 * c.hurtDir * Math.PI / 180 : 0;
    const [sky, blk] = light(Math.floor(x), Math.floor(y + 0.4), Math.floor(z));
    return {skin, verts: new Float32Array(buildModel(kind, rot, {x: x - view.x, y: y + 0.375 - 1.5 - view.y, z: z - view.z, yaw, roll}, [], skinSizes[skin])), light: [sky, blk], tint: [1, 1, 1], hurt: 0, white: 0};
  });
}
/** Things thrown, in flight (potions, bottles, snowballs, eggs): turning over as they go. */
function potionThings(light) {
  return G.thrown.map(p => {
    const [sky, blk] = light(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), v = new Verts(32);
    v.flatLook(0.5, itemLook(p.s.id, p.s), sky * 17, blk * 17, 256, 32);
    return {verts: v, x: p.x, y: p.y, z: p.z, model: mat.model(0.35, p.age * 0.4)};
  });
}
/** The player as others would see them (third person): the body, and what armour is worn over it. */
function playerModel(view, a, light) {
  const b = G.body, x = b.prev.x + (b.x - b.prev.x) * a - view.x, y = b.prev.y + (b.y - b.prev.y) * a - view.y, z = b.prev.z + (b.z - b.prev.z) * a - view.z;
  const turn = ((b.yaw - G.bodyYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const s = held(), sk = itemInfo(s?.id)?.tool?.kind;
  const rot = animate('player', {}, {limb: G.walked * 4, amount: G.riding ? 0 : G.limbAmt || 0, headYaw: -turn, headPitch: -b.pitch, age: G.time, attack: G.swing > 0 ? 1 - G.swing / 6 : 0, riding: !!G.riding,
    bow: sk === 'bow' && G.draw > 0, spear: sk === 'trident' && G.draw > 0});
  const pose = {x, y, z, yaw: G.bodyYaw, s: 0.9375}, [sky, blk] = light(Math.floor(b.x), Math.floor(b.y + 1), Math.floor(b.z)), hurtFlash = G.hurtT > 0 ? 1 : 0;
  const out = [{skin: 'player', verts: new Float32Array(buildModel('player', rot, pose, [], skinSizes.player)), light: [sky, blk], tint: [1, 1, 1], hurt: hurtFlash, white: 0}];
  for (let i = 0; i < 4; i++) {
    const am = itemInfo(G.inv.worn(i)?.id)?.armor;
    if (!am) continue;
    const [model, parts] = ARMOR_PARTS[i], skin = `armor_${am.mat}${model === 'armor_inner' ? '_legs' : ''}`;
    out.push({skin, verts: new Float32Array(buildModel(model, rot, pose, [], skinSizes[skin], parts)), light: [sky, blk], tint: greyArmor[skin] ? [0.63, 0.4, 0.25] : [1, 1, 1], hurt: hurtFlash, white: 0});
  }
  G.selfHeld = s ? heldThing(view, 'player', rot, pose, 'arm0', s, sky, blk, sk === 'trident' && G.draw > 0) : null;
  return out;
}
// ---------- what is held, seen from outside ----------
// how a thing sits in a hand (the game's held models): its picture's axes in the arm's own (x across, y down the arm, z
// back) — a tool or a trident lengthways across the fist, its head ahead (a trident is held nearer its foot, and turned
// round when it is raised to throw, its prongs ahead again), a bow upright — how far along its length the fist holds
// it, its size
const GRIPS = {tool: [[0, 1, 0], [0, 0, -1], [-1, 0, 0], 0.35, 0.85], trident: [[0, 1, 0], [0, 0, -1], [-1, 0, 0], -0.15, 1.1], spear: [[0, 1, 0], [0, 0, 1], [1, 0, 0], -0.15, 1.1],
  bow: [[0, -1, 0], [0, 0, -1], [1, 0, 0], 0, 0.9], item: [[0, 1, 0], [0, 0, -1], [-1, 0, 0], 0.05, 0.5],
  // (in a dolphin's mouth: upright, along its beak, not turned)
  mouth: [[0, 0, -1], [0, -1, 0], [-1, 0, 0], 0, 0.5]};
const STRAIGHT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// (the picture turned an eighth round: its corner-to-corner line along its length)
const TURN45 = [[Math.SQRT1_2, Math.SQRT1_2, 0], [-Math.SQRT1_2, Math.SQRT1_2, 0], [0, 0, 1]];
const mulV = (C, v) => [0, 1, 2].map(r => C[0][r] * v[0] + C[1][r] * v[1] + C[2][r] * v[2]), mulC = (A, B) => B.map(c => mulV(A, c));
const heldVerts = new Map();
/** A thing in a model's hand (a mob's, the player's), to draw: the model as posed (rot, pose), its arm, the stack;
 *  spear: a trident raised to throw. */
function heldThing(view, kind, rot, pose, arm, stack, sky, blk, spear = false) {
  const f = handFrame(kind, rot, pose, arm, arm === 'nose' ? [0, 3, -7.5] : null), info = itemInfo(stack.id);
  if (!f || !info) return null;
  const look = itemLook(stack.id, stack), tk = info.tool?.kind, [gx, gy, gz, off, size] = GRIPS[arm === 'nose' ? 'mouth' : look.cube ? 'item' : tk === 'bow' ? 'bow' : tk === 'trident' ? (spear ? 'spear' : 'trident') : info.tool ? 'tool' : 'item'];
  const key = `${stack.id}|${sky}|${blk}`;
  let v = heldVerts.get(key);
  if (!v) {
    if (heldVerts.size > 200) heldVerts.clear();
    v = new Verts(512);
    if (look.cube) v.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints); else if (look.over != null) v.flatLook(0.5, look, sky * 17, blk * 17, 256, 32); else thickItem(v, look.flat, look.tint, sky * 17, blk * 17);
    heldVerts.set(key, v);
  }
  const k = 16 * (look.cube ? 0.4 : size), A = mulC(f.ax, [gx, gy, gz]), M = mulC(A, arm === 'nose' ? STRAIGHT : TURN45).map(c => c.map(q => q * k)), T = f.at.map((q, i) => q + A[1][i] * off * k);
  return {verts: v, x: view.x + T[0], y: view.y + T[1], z: view.z + T[2], model: new Float32Array([...M[0], 0, ...M[1], 0, ...M[2], 0, 0, 0, 0, 1])};
}
/** What the mobs near hold (a skeleton's bow, a drowned's trident …), as things to draw. */
function mobHeld(view) {
  const out = [];
  for (const h of G.mobs.held || []) {
    if (h.hold) out.push(heldThing(view, h.kind, h.rot, h.pose, h.part || 'arm0', h.hold, ...h.light, h.spear));
    if (h.off) out.push(heldThing(view, h.kind, h.rot, h.pose, 'arm1', h.off, ...h.light));
  }
  return out.filter(Boolean);
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
/**
 * The round shadows under things (the game's 实体阴影): under each mob, dropped item, experience orb and the player
 * seen from outside, a soft dark disc laid on the tops of the blocks below (two blocks down at most) — fainter the
 * higher it is over them and the farther from the camera. With 光影 mid / high in the sun the mobs cast their own
 * shadows (render.js), so theirs is only a light touch under the feet then.
 */
let blobV = null;
function blobVerts(view, a) {
  const L = LAYER.entity_shadow;
  if (L === undefined) return null;
  const v = (blobV ||= new Verts(1024)).reset(), sun = renderer.entLive ? 0.35 : 1, casters = [];
  for (const m of G.mobs.list) {
    if (m.dead > 6) continue;
    const b = m.body, x = b.prev.x + (b.x - b.prev.x) * a, y = b.prev.y + (b.y - b.prev.y) * a, z = b.prev.z + (b.z - b.prev.z) * a;
    casters.push([x, y, z, Math.max(0.25, Math.min(1.3, b.w * 0.75 + 0.05)), sun]);
  }
  for (const it of G.ents.items) casters.push([it.x, it.y, it.z, 0.15, 0.75]);
  for (const o of G.ents.orbs) casters.push([o.x, o.y, o.z, 0.12, 0.6]);
  if (G.view && !G.dead) { const b = G.body; casters.push([b.prev.x + (b.x - b.prev.x) * a, b.prev.y + (b.y - b.prev.y) * a, b.prev.z + (b.z - b.prev.z) * a, 0.5, sun]); }
  const quad = (x0, z0, x1, z1, y, u0, w0, u1, w1, alpha) => {
    const k = Math.round(Math.max(0, Math.min(1, alpha)) * 255), tint = k << 16 | k << 8 | k, ox = -view.x, oy = y - view.y, oz = -view.z;
    v.v(x0 + ox, oy, z1 + oz, 256, 128, L, u0, w1, 0, 0, 2 << 2, tint); v.v(x1 + ox, oy, z1 + oz, 256, 128, L, u1, w1, 0, 0, 2 << 2, tint);
    v.v(x1 + ox, oy, z0 + oz, 256, 128, L, u1, w0, 0, 0, 2 << 2, tint); v.v(x0 + ox, oy, z0 + oz, 256, 128, L, u0, w0, 0, 0, 2 << 2, tint);
  };
  for (const [x, y, z, r, strength] of casters) {
    const d2 = (x - view.x) ** 2 + (y - view.y) ** 2 + (z - view.z) ** 2;
    if (d2 > 24 * 24) continue;
    const fade = strength * (1 - d2 / 576), feet = Math.floor(y + 0.001), tops = [];
    // the ground under each column the disc covers: the first top at or below the feet
    for (let bx = Math.floor(x - r); bx <= Math.floor(x + r); bx++) for (let bz = Math.floor(z - r); bz <= Math.floor(z + r); bz++) {
      for (let by = feet; by >= feet - 2; by--) {
        const bv = G.mirror.get(bx, by, bz);
        if (!bv) continue;
        const boxes = collisionBoxes(bv);
        if (!boxes?.length) continue;
        const ty = by + Math.min(1, Math.max(...boxes.map(q => q[4])));
        if (ty <= y + 0.01) tops.push([bx, bz, ty]);
        break;
      }
    }
    if (!tops.length) continue;
    // on even ground one disc; on a step or an edge a piece on each block (its picture cut to fit)
    const even = tops.length === (Math.floor(x + r) - Math.floor(x - r) + 1) * (Math.floor(z + r) - Math.floor(z - r) + 1) && tops.every(t => Math.abs(t[2] - tops[0][2]) < 0.01);
    if (even) { const ty = tops[0][2], al = (1 - (y - ty) / 2) * 0.6 * fade; if (al > 0.01) quad(x - r, z - r, x + r, z + r, ty + 0.002, 0, 0, 16, 16, al); continue; }
    for (const [bx, bz, ty] of tops) {
      const al = (1 - (y - ty) / 2) * 0.6 * fade;
      if (al <= 0.01) continue;
      const x0 = Math.max(bx, x - r), x1 = Math.min(bx + 1, x + r), z0 = Math.max(bz, z - r), z1 = Math.min(bz + 1, z + r), uv = q => Math.round(q * 16);
      quad(x0, z0, x1, z1, ty + 0.002, uv((x0 - x + r) / (2 * r)), uv((z0 - z + r) / (2 * r)), uv((x1 - x + r) / (2 * r)), uv((z1 - z + r) / (2 * r)), al);
    }
  }
  return v.n ? v : null;
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
  // 光影 on: the picture's resolution follows the frame time (down to half while it runs under ~38 a second)
  if (renderer.level !== 'off' && G?.ready && !paused && dt > 0) {
    perf.t += dt; perf.n++;
    if (perf.t > 2) {
      const avg = perf.t / perf.n; perf.t = perf.n = 0;
      const next = avg > 1 / 38 ? Math.max(0.5, dynScale - 0.1) : avg < 1 / 56 ? Math.min(1, dynScale + 0.05) : dynScale;
      if (next !== dynScale) { dynScale = next; layout(); }
    }
  }
  const c = input.read(dt);
  handleEvents(c.events);
  if (invUI.open && input.mode === 'pad') padInventory();
  if (screens.open && input.mode === 'pad' && (!G || paused || G.dead)) padMenu();
  if (!G) return;
  if (!G.ready) { checkReady(); return; }
  const b = G.body;
  // the world goes on while a window (the inventory, a furnace, a brewing stand) is open, as in the game; only the
  // player stands still
  if (!paused) {
    if (!invUI.open) { b.yaw += c.look[0]; b.pitch = Math.max(-1.5705, Math.min(1.5705, b.pitch + c.look[1])); ctl = c; }
    else ctl = {...ctl, attack: false, use: false, fwd: 0, side: 0, jump: false, sprint: false};
    acc += dt * 1000;
    let n = 0;
    while (acc >= TICK && n++ < 5) { tick(); acc -= TICK; }
    if (acc > TICK * 5) acc = 0;
  } else ctl = {...ctl, attack: false, use: false, fwd: 0, side: 0, jump: false};
  // the camera between the last two ticks
  const a = paused ? 1 : acc / TICK, x = b.prev.x + (b.x - b.prev.x) * a, y = b.prev.y + (b.y - b.prev.y) * a, z = b.prev.z + (b.z - b.prev.z) * a;
  const bobT = G.walked * 2.2, bobbing = settings.bob && b.onGround && !b.flying && !G.view ? 1 : 0;
  // shaking after an explosion; a drawn bow zooms in
  const shake = G.shake > 0 ? (G.shake -= dt * 20, G.shake * 0.004) : 0, zoom = 1 - (itemInfo(held()?.id)?.tool?.kind === 'bow' ? Math.min(1, G.draw / 20) * 0.15 : 0);
  const view = {x, y: y + b.eye + Math.abs(Math.sin(bobT)) * 0.04 * bobbing, z, yaw: b.yaw + (Math.random() - 0.5) * shake, pitch: b.pitch + Math.abs(Math.cos(bobT)) * 0.006 * bobbing + (Math.random() - 0.5) * shake,
    fov: (settings.fov + (b.sprinting ? 8 : 0) + (b.flying && b.sprinting ? 4 : 0)) * zoom * Math.PI / 180, far: settings.dist * 16, alpha: a,
    // the distant view: out to its reach, drawn only past the columns the worker keeps
    lodFar: settings.lod && G.dim !== 'nether' ? Math.max(settings.lod, settings.dist + 2) * 16 : 0, lodInner: Math.max(0, settings.dist - 1) * 16};
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
  env.underwater = isWater(eyeV);
  if (env.underwater) {
    env.fog = [0.05, 0.12, 0.35].map(q => q * (0.3 + env.daylight * 0.7));
    // 光影: where the surface is above the eye (the shafts and the light on the bottom come down from it)
    const ex = Math.floor(view.x), ez = Math.floor(view.z);
    let y = Math.floor(view.y);
    while (y < view.y + 48 && isWater(G.mirror.get(ex, y + 1, ez))) y++;
    env.waterY = y + 0.9;
  }
  if ((eyeV & 0xFFF) === ID.lava) { env.underwater = true; env.lava = true; env.fog = [0.6, 0.15, 0.02]; }
  // for 光影: how far the sky reaches the eye (eased: walking into a cave the air darkens over a second or two), and
  // the light of what is in the hand (a torch lights round the player)
  const eyeSky = G.mirror.light(Math.floor(view.x), Math.floor(view.y), Math.floor(view.z))[0] / 15;
  G.eyeSky = (G.eyeSky ?? eyeSky) + (eyeSky - (G.eyeSky ?? eyeSky)) * Math.min(1, dt * 1.5);
  env.eyeSky = G.eyeSky;
  env.held = (itemInfo(G.inv.slots[G.hot]?.id)?.block?.light || 0) / 15;
  // the aurora: snowy places by night, coming and going over a few seconds; where the player stands (grass leans away)
  G.aurora = (G.aurora || 0) + ((env.cold ? env.stars : 0) - (G.aurora || 0)) * Math.min(1, dt * 0.4);
  env.aurora = G.aurora; env.player = [G.body.x, G.body.y, G.body.z];
  // (with 光影 the water's own murk stands in for the blue sheet over the picture)
  $('.water').style.display = env.underwater && (renderer.level === 'off' || env.lava) ? 'block' : 'none';
  $('.hurt').style.opacity = G.hurtT ? 0.9 : 0;
  $('.sleep').style.opacity = G.sleeping ? Math.min(1, G.sleeping / 60) : 0;
  $('.portalfx').style.opacity = G.inPortal ? Math.min(0.8, G.inPortal / 80) : 0;
  fireView(G.fireT > 0 && !G.view && !G.dead && !hudHidden);
  // 夜视: everything seen as if lit
  if (G.effects.night_vision) env.bright = Math.max(env.bright || 0, 0.7);
  // 潮涌能量: under water as if lit; 失明: almost nothing seen
  if (G.effects.conduit_power && env.underwater) env.bright = Math.max(env.bright || 0, 0.7);
  $('.blind').style.opacity = G.effects.blindness ? 1 : 0;
  // animated textures
  const tick20 = Math.floor(G.time);
  for (const an of animFrames) { const f = Math.floor(tick20 / an.time) % an.frames.length; if (f !== an.at) { an.at = f; renderer.updateLayer(an.layer, an.frames[f]); } }
  const lightAt = (bx, by, bz) => G.mirror.light(bx, by, bz);
  const extras = {things: [...G.ents.drawList(view, env.time, lightAt), ...shotThings(lightAt), ...potionThings(lightAt), ...fireThings(view), ...campfireThings(lightAt), ...endermanThings(lightAt), ...cartThings(a, lightAt)], mobs: G.mobs.drawList(view, lightAt, skinSizes)};
  if (G.view && !G.dead) { extras.mobs.push(...playerModel(view, a, lightAt)); if (G.selfHeld) extras.things.push(G.selfHeld); }
  extras.things.push(...mobHeld(view));
  extras.mobs.push(...boatModels(view, a, lightAt), ...conduitModels(view, a, lightAt), ...signModels(view, lightAt));
  extras.weather = weatherVerts(view);
  extras.blobs = blobVerts(view, a);
  const bolt = boltVerts(view);
  if (bolt?.n) extras.things.push({verts: bolt, x: view.x, y: view.y, z: view.z, model: mat.identity(), center: 128, bright: 1});
  extras.things.push(...beamThings(view));
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
    $('.debug').textContent = `方块世界  ${Math.round(1 / Math.max(dt, 0.001))} fps\nXYZ: ${b.x.toFixed(2)} / ${b.y.toFixed(2)} / ${b.z.toFixed(2)}\n方块: ${bx} ${by} ${bz}  区块: ${G.cx} ${G.cz}\n朝向: ${dir}  (${(b.yaw * 180 / Math.PI % 360).toFixed(1)} / ${(b.pitch * 180 / Math.PI).toFixed(1)})\n生物群系: ${BIOMES[G.mirror.biome(bx, bz)]?.zh}\n光照: 天空 ${sk}  方块 ${bl}\n第 ${day} 天 ${hour}:00\n区段: ${renderer.stats.drawn}/${renderer.stats.sections}  三角形: ${renderer.stats.tris}  难度: ${DIFFICULTIES[difficulty()]}\n${renderer.stats.gpu ? `显卡（毫秒）: ${Object.entries(renderer.stats.gpu).map(([k, v]) => `${{shadow: '影子', land: '地形', far: '远景', mobs: '生物', sky: '天空', water: '水', post: '后期'}[k] || k} ${v}`).join('  ')}\n` : ''}生物: ${G.mobs.count(m => m.def.passive)} 动物 / ${G.mobs.count(m => m.def.hostile)} 怪物\n天气: ${G.weather.thunder > 0.5 ? '雷雨' : G.weather.rain > 0.5 ? (fallsAt(bx, bz) === 'snow' ? '下雪' : '下雨') : '晴'}（${Math.round(G.weather.rain * 100)}%，${Math.round(G.weather.rainT / 20)} 秒后${G.weather.raining ? '停' : '下'}）  护甲: ${G.inv.armor().points}  等级: ${G.xp.level}\n种子: ${G.meta.seedText || G.meta.seed}${G.targetMob ? `\n看着: ${G.targetMob.def ? `${G.targetMob.def.zh}（${Math.ceil(G.targetMob.health)}/${G.targetMob.def.health}）` : zhOf(G.targetMob.kind)}` : ''}${G.target ? `\n看着: ${BLOCKS[G.target.v & 0xFFF].zh} (${G.target.x}, ${G.target.y}, ${G.target.z})` : ''}`;
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
  renderer.setQuality(settings.shaders);
  layout();
  input = new Input(app, canvas, {rotated: () => rotated, sensitivity: () => settings.sens, onMode: m => { document.body.classList.toggle('touchmode', m === 'touch'); drawHud(true); screens?.markFocus(); }});
  if (isTouch) document.body.classList.add('touchmode'), input.mode = 'touch';
  screens = new Screens($('#screens'), api());
  invUI = new InventoryUI(invRoot, {get inv() { return G.inv; }, get icons() { return icons; }, drop: s => { const b = G.body; G.ents.drop(s, b.x, b.y + 1.2, b.z, {dir: b.look(), delay: 40}); }, sound: n => play(n), closed: (kind, data) => { if (kind === 'trade') data.v.trading = false; trapShut(); closedInventory(); }, toApp: (x, y) => input.toApp(x, y), rotated: () => rotated, crafted: () => play('place', ID.crafting_table),
    // what was smelted gives its experience when taken out
    took: f => { const n = takeSmeltXp(f); if (n) { const b = G.body; G.ents.xp(n, b.x, b.y + 1, b.z); } }, worn: () => play('equip'),
    // the enchanting table and the anvil: the player's levels, creative, paying, the enchanting seed
    xp: () => G.xp, creative: () => G.mode === 'creative', spend: n => { G.xp.level = Math.max(0, G.xp.level - n); drawHud(true); },
    seed: () => G.enchSeed, reseed: () => { G.enchSeed = Math.floor(Math.random() * 2 ** 31); }, anvilUsed: () => anvilUsed(),
    // a trade with a villager: its 「嗯」, a few points of experience for the player (the game's 3–6)
    traded: v => { play('villager_yes'); const b = G.body; G.ents.xp(3 + Math.floor(Math.random() * 4), v.x, v.y + 1, v.z); },
    // a cartographer's explorer map, made as it is bought; the cartography table: what comes out (made as it is taken),
    // the map put in and its picture
    explorerMap: (s, v) => explorerMap(s, v), carto: (a, b) => cartography(a, b), cartoMake: (a, b) => cartography(a, b, true)?.out || null,
    mapOf: s => G.maps.get(s.map), mapPic: s => mapPicture(s)});
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
  try { await loadTextures(); } catch (e) { showError(`材质没读成：${e.message || e}`); built = buildLayers(null); setAtlas(built); renderer.setTextures(built.size, built.layers); icons = makeIcons(built); }
  screens.title();
  requestAnimationFrame(frame);
}
boot();
// for looking into a running game from the console
globalThis.__blocks = {get game() { return G; }, get renderer() { return renderer; }, get input() { return input; }, settings, toast, importPack: (f, p) => api().importPack(f, p), removePack: () => api().removePack()};
