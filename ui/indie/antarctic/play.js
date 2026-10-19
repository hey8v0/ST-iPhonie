// 南极结界 · 鲸湾郊外: the first playable farm, and the house on it (the ground floor and the attic, home.js). Each scene
// is prepared once and lit for the hour a little at a time as the clock runs; the farm (soil, water on it, what grows)
// and the people are drawn over it every frame with the same light. The menu has the bag, the world map, settings.
// Keyboard (arrows / WASD, Space or E to use, 1–7 or Q / wheel for tools, Esc / I for the menu), touch (drag to walk, the
// round button to use, tap a tool), gamepad (stick, A to use, LB / RB for tools, Start for the menu) — whichever was used last.
import {finish, person, W as FARM_W, H as FARM_H, T, setFrame} from './farm.js';
import {room, lightRoom} from './home.js';
import * as MAP from './worldmap.js';
import {shade, shadowStep, markSprite} from './light.js';
import {cropStage, object, cylinder, C} from './assets.js';
import {personFrom, sprite as personSprite, LOOKS, HAIR_NAMES, DEFAULT_LOOK} from './slim.js';
import {PETS, petSprite} from './pet.js';
import * as G from './game.js';
import {iconCanvas, itemIcon, seasonIcon, iconPixels} from './icons.js';
import {thingArt, pathAlbedo} from './things.js';
import {SHORE} from './shore.js';
import {LORE, LORE_IDS, KINDS as LORE_KINDS, CRITTERS} from './lore.js';

const VW = 320, VH = 180, SPEED = 66;
// the size of the scene one is in (the farm, or a room)
let W = FARM_W, H = FARM_H;
const FIELD = {x0: 19, y0: 15, x1: 34, y1: 23};
const canvas = document.querySelector('#view'), ctx = canvas.getContext('2d');
canvas.width = VW; canvas.height = VH;
const image = ctx.createImageData(VW, VH), screen = new Uint32Array(image.data.buffer);
const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
const pack = (r, g, b) => (255 << 24 | Math.max(0, Math.min(255, b)) << 16 | Math.max(0, Math.min(255, g)) << 8 | Math.max(0, Math.min(255, r))) >>> 0;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const $ = q => document.querySelector(q);

// ── the world and the game ──────────────────────────────────────────────────────────────────────────────────────────
const q = new URLSearchParams(location.search);
let started = false, S = null, farm = null, shore = null, game = null, lightVersion = 0, relighting = null, litSeason = -1, scene = 'farm';
const rooms = {}, ROOMS = ['house', 'attic'], OUTDOOR = ['farm', 'shore'];
const me = {x: 0, y: 0, dir: 'down', t: 0, moving: false, busy: 0};
// the farm is prepared and lit in the background (world.worker.js); here we only ask and swap in what comes back
const worker = new Worker(new URL('./world.worker.js', import.meta.url), {type: 'module'});
const waiting = new Map(); let asked = 0;
worker.onmessage = e => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.error) { console.error(e.data.error); w?.reject(Error(e.data.error)); } else w?.resolve(e.data); };
const ask = (type, data = {}) => new Promise((resolve, reject) => { const id = ++asked; waiting.set(id, {resolve, reject}); worker.postMessage({id, type, ...data}); });
async function prepareSeason(season) {
  const got = await ask('prepare', {season});
  farm = {...got, sun: farm?.sun, lamps: farm?.lamps, px: farm?.px, light: farm?.light, shadow: farm?.shadow, hour: -99, open: null};
  litSeason = season; for (const k of ROOMS) delete rooms[k]; // the rooms show the season too (windows, flowers)
  shore = null; if (scene === 'shore') await prepareShore();
  enter(scene);
}
async function prepareShore() {
  const got = await ask('prepare', {map: 'shore', season: litSeason});
  shore = {...got, hour: -99, open: null, season: litSeason, entry: SHORE.entry};
  shoreSpots();
}
// Light the scene one is in for the hour: the farm in the worker; a room here, a few rows each frame (all at once the
// first time, behind the fade).
let roomSteps = null;
function relight(hour) {
  const target = S;
  const done = () => { if (S === target) { lightVersion++; afterLight(); } };
  if (target === farm || target === shore) return ask('light', {map: target.map, hour, extra: target === farm ? campfireLamps() : []}).then(got => { Object.assign(target, {px: got.px, light: got.light, shadow: got.shadow, sun: got.sun, lamps: got.lamps, hour}); done(); });
  if (!target.px) { for (const _ of lightRoom(target, hour, litSeason)) { /* at once */ } done(); return Promise.resolve(); }
  return new Promise(resolve => { roomSteps = {it: lightRoom(target, hour, litSeason), done: () => { done(); resolve(); }}; });
}
function stepRoomLight() {
  if (!roomSteps) return;
  const t0 = performance.now();
  while (performance.now() - t0 < 5) if (roomSteps.it.next().done) { const r = roomSteps; roomSteps = null; r.done(); return; }
}
function afterLight() {
  // open water (water all round, 3 px each way) is where glints and the aurora show
  if ((S === farm || S === shore) && !S.open) { const m = S.mat, water = i => m[i] === 4 || m[i] === 6; S.open = new Uint8Array(W * H); for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = y * W + x; S.open[i] = water(i) && water(i - 3) && water(i + 3) && water(i - 3 * W) && water(i + 3 * W) && S.owner[i] < 0 ? 1 : 0; } }
  cache.clear();
}
/** Be in a scene at once: the farm, or a room (built for the season the first time). */
function enter(name) {
  scene = ROOMS.includes(name) || OUTDOOR.includes(name) ? name : 'farm';
  if (scene === 'shore' && !shore) scene = 'farm';
  if (scene === 'farm') { S = farm; W = FARM_W; H = FARM_H; }
  else if (scene === 'shore') { S = shore; W = S.W; H = S.H; }
  else { rooms[scene] ??= room(scene, litSeason); S = rooms[scene]; W = S.W; H = S.H; }
  setFrame(W, H); cache.clear();
}
const fadeTo = target => new Promise(resolve => {
  const step = () => { fade.k += Math.sign(target - fade.k) * .07; if (Math.abs(fade.k - target) < .07) fade.k = target; $('#fade').style.opacity = fade.k; if (fade.k === target) resolve(); else requestAnimationFrame(step); };
  step();
});
// where one comes in: the farm's door, or a room's named entry
const entryOf = (name, key) => name === 'farm' ? (key === 'east' ? [FARM_W - 14, 24 * T + 10, 'left'] : [farm.door[0], farm.door[1] + 8, 'down']) : S.entry[key];
/** Walk through to another scene: fade out, go, light it if the hour has moved, fade in. */
async function go(name, key) {
  if (fade.on) return;
  fade.on = true; await fadeTo(1);
  if (name === 'shore' && (!shore || shore.season !== litSeason)) await prepareShore();
  enter(name); [me.x, me.y, me.dir] = entryOf(name, key); me.t = 0; petPlace(me.x + (me.dir === 'left' ? 12 : -12), me.y + 6);
  if (!S.px || Math.abs(G.hourOf(game) - (S.hour ?? -99)) >= .25) await relight(G.hourOf(game));
  store(); await fadeTo(0); fade.on = false;
  if (OUTDOOR.includes(name)) discover('place:' + name);
}
/** Saving also keeps where one is. */
function store() { if (!game) return; game.at = {scene, x: Math.round(me.x), y: Math.round(me.y), dir: me.dir}; G.save(game); }
async function boot() {
  game = q.has('new') ? G.newGame(FIELD) : G.load(FIELD);
  if (q.get('h')) game.minutes = Number(q.get('h')) * 60;
  if (q.get('d')) game.day = Number(q.get('d'));
  const ready = prepareSeason(G.seasonOf(game));
  // until the game runs, panels (the creator) still hear the pad
  const poll = () => { if (started) return; pad(); requestAnimationFrame(poll); }; requestAnimationFrame(poll);
  if (!game.look || !game.pet || q.has('creator')) { $('#loading').style.display = 'none'; await openCreator(false); $('#loading').style.display = ''; }
  await ready;
  if (!game.things) { G.populate(game, farmSpots()); G.save(game); }
  // what was gathered before the 见闻录 existed counts as seen
  game.lore ??= {}; for (const it of game.inv) if (it && LORE[it.id] && !game.lore[it.id]) game.lore[it.id] = game.day;
  rebuildDyn();
  // where one was; a new game starts in bed in the attic; ?x=&y= starts on the farm at that tile
  const at = q.get('x') ? {scene: 'farm', x: Number(q.get('x')) * T, y: Number(q.get('y')) * T} : game.at || {scene: q.get('in') || 'attic'};
  if (at.scene === 'shore') await prepareShore();
  enter(at.scene);
  if (at.x == null) [me.x, me.y, me.dir] = scene === 'farm' ? entryOf('farm') : S.entry.bed || Object.values(S.entry)[0];
  else { me.x = at.x; me.y = at.y; me.dir = at.dir || 'down'; }
  if (OUTDOOR.includes(scene)) setTimeout(() => discover('place:' + scene), 1500);
  if (!free(me.x, me.y)) for (let r = 1; r < 400; r++) { const a = r * 2.4, x = me.x + Math.cos(a) * r * .6, y = me.y + Math.sin(a) * r * .6; if (free(x, y)) { me.x = x; me.y = y; break; } }
  petPlace(me.x + 12, me.y + 4);
  await relight(G.hourOf(game));
  $('#loading').remove();
  started = true; hud(); requestAnimationFrame(loop);
}

// ── tiles ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const tileKind = (tx, ty) => { const m = S.mat[(ty * T + 8) * W + tx * T + 8]; return m === 1 ? 'grass' : m === 3 ? 'field' : m === 4 || m === 6 ? 'water' : m === 5 ? 'sand' : 'other'; };
// Where weeds, stones, pines and forage may turn up: free grass and sand, away from the door, the bin, the mailbox and the bowl.
let spotsCache = null;
function farmSpots() {
  if (spotsCache) return spotsCache;
  const keep = [farm.door, farm.bin, farm.mailbox, BOWL].filter(Boolean), grass = [], sand = [];
  for (let ty = 1; ty < FARM_H / T - 1; ty++) for (let tx = 1; tx < FARM_W / T - 1; tx++) {
    const i = (ty * T + 8) * FARM_W + tx * T + 8, m = farm.mat[i];
    if (m !== 1 && m !== 5) continue;
    if (keep.some(([x, y]) => Math.abs(x - (tx * T + 8)) < 40 && Math.abs(y - (ty * T + 8)) < 36)) continue;
    let ok = true; for (let y = ty * T; y < ty * T + T && ok; y += 3) for (let x = tx * T; x < tx * T + T; x += 3) if (farm.solid[y * FARM_W + x] || farm.mat[y * FARM_W + x] === 2 || farm.owner[y * FARM_W + x] >= 0) { ok = false; break; }
    if (ok) (m === 1 ? grass : sand).push(tx + ',' + ty);
  }
  return spotsCache = {grass, sand};
}
// what lies on the farm and stands in the way (weeds, stones, trees, chests…): a mask the walking checks
let dyn = null;
function rebuildDyn() {
  dyn = new Uint8Array(FARM_W * FARM_H);
  for (const [key, th] of Object.entries(game.things || {})) {
    if (!G.blocks(th)) continue;
    const [tx, ty] = key.split(',').map(Number), narrow = th.id === 'tree' || th.id === 'fence' ? 5 : 3;
    for (let y = ty * T + 9; y < ty * T + 16; y++) for (let x = tx * T + narrow; x < tx * T + T - narrow; x++) dyn[y * FARM_W + x] = 1;
  }
}
const blocked = i => (S === farm && dyn?.[i]) || (S.tideE && S.tideE[i] <= 1 && S.tideE[i] < tideNow - .012);
function campfireLamps() { return Object.entries(game?.things || {}).filter(([, th]) => th.id === 'campfire').map(([key]) => { const [tx, ty] = key.split(',').map(Number); return {x: tx * T + 8, y: ty * T + 13, z: 12, r: 110, c: [1, .62, .3], k: 1.9}; }); }
const tileFree = (tx, ty) => { for (let y = ty * T; y < ty * T + T; y += 3) for (let x = tx * T; x < tx * T + T; x += 3) if (S.solid[y * W + x] || S.mat[y * W + x] === 2) return false; return true; };
const mouse = {x: 0, y: 0, active: false};
function facing() {
  // like Stardew: with a mouse, the tile under it if it is next to you; otherwise the tile in front of you
  if (using === 'mouse' && mouse.active) {
    const mx = Math.floor(mouse.x / T), my = Math.floor(mouse.y / T), px = Math.floor(me.x / T), py = Math.floor((me.y - 4) / T);
    if (Math.abs(mx - px) <= 1 && Math.abs(my - py) <= 1) return [mx, my];
  }
  const fx = me.x + (me.dir === 'left' ? -12 : me.dir === 'right' ? 12 : 0), fy = me.y - 4 + (me.dir === 'up' ? -12 : me.dir === 'down' ? 12 : 0);
  return [Math.floor(fx / T), Math.floor(fy / T)];
}
const cursor = {k: 0, still: 0};

// ── input: keyboard, touch, gamepad ────────────────────────────────────────────────────────────────────────────────
const keys = new Set(), stick = {x: 0, y: 0, id: null, ox: 0, oy: 0};
let using = 'keyboard';
const select = i => { game.selected = ((i % G.HAND) + G.HAND) % G.HAND; hud(); };
addEventListener('keydown', e => {
  if (!game) return;
  const k = e.key.toLowerCase();
  if (e.target.tagName === 'INPUT') { if (k === 'enter' || k === 'escape' || k === 'tab') { e.target.blur(); e.preventDefault(); } return; }
  if (using !== 'mouse' || e.key.length > 1 || 'wasd'.includes(k)) using = 'keyboard';
  const panel = activePanel();
  if (panel) {
    const dir = {arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right'}[k];
    if (panel === 'menu' && paneNow() === 'map' && dir) { mapNudge(dir); e.preventDefault(); return; }
    if (dir) { navMove(dir); e.preventDefault(); return; }
    if (k === ' ' || k === 'enter' || k === 'e') { if (panel === 'menu' && paneNow() === 'map') mapPickCentre(); else navActivate(); e.preventDefault(); return; }
    if (k === 'escape' || k === 'backspace') { panelBack(); e.preventDefault(); return; }
    if (panel === 'menu') {
      if (k === 'q' || k === 'tab') { menuTab(e.shiftKey ? -1 : 1); e.preventDefault(); }
      else if (k === 'i' || (k === 'm' && paneNow() === 'map')) closeMenu();
      else if (k === 'm') showPane('map');
      else if (k === '+' || k === '=' || k === '-') mapZoom(k === '-' ? 1 / 1.5 : 1.5);
    }
    if (panel === 'creator' && k === 'r') creatorRandom();
    return;
  }
  if (k === 'm') { openMenu('map'); return; }
  if (k === 'escape' || k === 'i') { openMenu(); return; }
  if (k === ' ' || k === 'e' || k === 'j' || k === 'enter') { use(); e.preventDefault(); return; }
  if (k >= '0' && k <= '9' && k.length === 1) { select(k === '0' ? 9 : Number(k) - 1); return; }
  if (k === 'q' || k === 'tab') { select(game.selected + (e.shiftKey ? -1 : 1)); e.preventDefault(); return; }
  if (k === 'n') { game.minutes += 60; return; }
  keys.add(k); if (e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('wheel', e => { if (game && !activePanel()) select(game.selected + Math.sign(e.deltaY)); }, {passive: true});
const knob = $('#stick');
const toWorld = e => { const r = canvas.getBoundingClientRect(), [cx, cy] = camera(); return [cx + (e.clientX - r.left) / r.width * VW, cy + (e.clientY - r.top) / r.height * VH]; };
canvas.addEventListener('mousemove', e => { if (!S) return; [mouse.x, mouse.y] = toWorld(e); mouse.active = true; using = 'mouse'; });
canvas.addEventListener('mouseleave', () => { mouse.active = false; });
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { [mouse.x, mouse.y] = toWorld(e); mouse.active = true; using = 'mouse'; use(); return; }
  stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; using = 'touch';
  knob.style.display = 'block'; knob.style.left = e.clientX + 'px'; knob.style.top = e.clientY + 'px'; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, len = Math.hypot(dx, dy), max = 40;
  stick.x = len > 6 ? dx / Math.max(len, max) : 0; stick.y = len > 6 ? dy / Math.max(len, max) : 0;
  knob.firstElementChild.style.transform = `translate(${stick.x * max}px, ${stick.y * max}px)`;
});
const release = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.display = 'none'; };
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
$('#use').addEventListener('pointerdown', e => { e.preventDefault(); use(); });
const prev = {};
function pad() {
  for (const g of navigator.getGamepads?.() || []) {
    if (!g) continue;
    const press = b => { const now = !!g.buttons[b]?.pressed, was = prev[b]; prev[b] = now; return now && !was; };
    if (activePanel()) { padPanel(g, press); continue; }
    if (!started) continue;
    if (press(9)) { using = 'gamepad'; openMenu(); continue; }
    if (press(0)) { using = 'gamepad'; use(); }
    if (press(4)) select(game.selected - 1); if (press(5)) select(game.selected + 1);
    if (press(3)) game.minutes += 60;
    let x = Math.abs(g.axes[0]) > .25 ? g.axes[0] : 0, y = Math.abs(g.axes[1]) > .25 ? g.axes[1] : 0;
    if (g.buttons[14]?.pressed) x = -1; if (g.buttons[15]?.pressed) x = 1; if (g.buttons[12]?.pressed) y = -1; if (g.buttons[13]?.pressed) y = 1;
    if (x || y) { using = 'gamepad'; return {x, y}; }
  }
  return null;
}
// ── panels with keys and pads: a focus that moves between the controls (or, on the map, the map itself) ─────────
const activePanel = () => creator.open ? 'creator' : dialog.open ? 'dialog' : shop.open ? 'shop' : chestUi.open ? 'chest' : menu.open ? 'menu' : null;
const panelEl = name => ({creator: $('#creator'), dialog: $('#ask'), shop: $('#shop'), chest: $('#chestui'), menu: $('#menu')})[name];
const paneNow = () => $('#menu .tabs .on')?.dataset.pane;
const nav = {el: null, dir: null, next: 0};
function navItems() {
  const panel = panelEl(activePanel()); if (!panel) return [];
  return [...panel.querySelectorAll('button, input, .opt')].filter(el => el.offsetParent !== null && !el.disabled && !(el.parentElement.closest('.opt') && !el.matches('.opt')));
}
function navFocus(el) {
  nav.el?.classList.remove('nav-on'); nav.el = el; if (!el) return;
  el.classList.add('nav-on'); el.scrollIntoView?.({block: 'nearest'});
  if (el.closest('#invgrid') && el.dataset.i !== 'trash') $('#iteminfo').textContent = bag.picked >= 0 ? '拿起了：' + itemInfo(game.inv[bag.picked]) : itemInfo(game.inv[Number(el.dataset.i)]);
  if (el.closest('#chestgrid')) $('#chestinfo').textContent = itemInfo(game.things[chestUi.key]?.items?.[Number(el.dataset.i)]);
  if (el.closest('#chestbag')) $('#chestinfo').textContent = itemInfo(game.inv[Number(el.dataset.i)]);
  const row = el.closest('#shop .item'); if (row) { shop.at = [...row.parentElement.children].indexOf(row); shopPaint(); }
}
function navMove(dir) {
  const items = navItems(); if (!items.length) return;
  if (!nav.el || !items.includes(nav.el)) { navFocus(items.find(el => el.classList.contains('on')) || items[0]); return; }
  if ((dir === 'left' || dir === 'right') && nav.el.matches('.opt')) { nav.el.querySelector(dir === 'left' ? '.prev' : '.next')?.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, cancelable: true})); return; }
  const r0 = nav.el.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
  // things in the same row (or column) come first; failing that, the nearest that way
  let best = null, score = Infinity;
  const vertical = dir === 'up' || dir === 'down';
  for (const el of items) {
    if (el === nav.el) continue;
    const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx, across = vertical ? Math.abs(dx) : Math.abs(dy);
    if (along < 4) continue;
    const overlap = vertical ? r.left < r0.right && r.right > r0.left : r.top < r0.bottom && r.bottom > r0.top;
    const sc = (overlap ? 0 : 100000) + along + across * 2.2; if (sc < score) { score = sc; best = el; }
  }
  if (best) navFocus(best);
}
function navActivate() {
  const el = nav.el; if (!el || !navItems().includes(el)) { navMove('down'); return; }
  if (el.tagName === 'INPUT') { el.focus(); return; }
  if (el.matches('.opt')) { const input = el.querySelector('input'); if (input) input.focus(); else el.querySelector('.next')?.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, cancelable: true})); return; }
  if (el.onclick) el.click(); else el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, cancelable: true}));
}
function panelBack() {
  const panel = activePanel();
  if (panel === 'dialog') dialog.done(false); else if (panel === 'shop') closeShop(); else if (panel === 'chest') closeChest(); else if (panel === 'menu') closeMenu(); else if (panel === 'creator' && creator.editing) closeCreator(false);
}
function padPanel(g, press) {
  using = 'gamepad';
  const a = press(0), b = press(1), start = press(9), lb = press(4), rb = press(5), x = press(2);
  let ax = Math.abs(g.axes[0]) > .35 ? g.axes[0] : 0, ay = Math.abs(g.axes[1]) > .35 ? g.axes[1] : 0;
  if (g.buttons[14]?.pressed) ax = -1; if (g.buttons[15]?.pressed) ax = 1; if (g.buttons[12]?.pressed) ay = -1; if (g.buttons[13]?.pressed) ay = 1;
  const panel = activePanel(), onMap = panel === 'menu' && paneNow() === 'map';
  if (onMap) {
    if (ax || ay) mapPanBy(ax * 3, ay * 3);
    const zin = g.buttons[7]?.value || 0, zout = g.buttons[6]?.value || 0; if (zin > .2 || zout > .2) mapZoom(1 + (zin - zout) * .05);
    if (a) mapPickCentre();
  } else {
    const dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : ax > 0 ? 'right' : null) : (ay < 0 ? 'up' : ay > 0 ? 'down' : null), now = performance.now();
    if (!dir) nav.dir = null;
    else if (dir !== nav.dir) { nav.dir = dir; nav.next = now + 320; navMove(dir); }
    else if (now >= nav.next) { nav.next = now + 120; navMove(dir); }
    if (a) navActivate();
  }
  if (b) panelBack();
  if (start && panel === 'menu') closeMenu();
  if (panel === 'menu') { if (lb) menuTab(-1); if (rb) menuTab(1); }
  if (panel === 'creator' && x) creatorRandom();
}

function wanted() {
  const p = pad(); if (p) return p;
  if (using === 'touch') return {x: stick.x, y: stick.y};
  if (using === 'mouse') { const k = n => keys.has(n); return {x: (k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0), y: (k('arrowdown') || k('s') ? 1 : 0) - (k('arrowup') || k('w') ? 1 : 0)}; }
  const k = n => keys.has(n);
  return {x: (k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0), y: (k('arrowdown') || k('s') ? 1 : 0) - (k('arrowup') || k('w') ? 1 : 0)};
}

// ── doing things ────────────────────────────────────────────────────────────────────────────────────────────────────
const effects = [];
/** A message at the lower left, with a little picture; the same words again only refresh the one already there. */
function say(text, icon = null, crop = null) {
  if (!text) return;
  const box = $('#toasts'), same = [...box.children].find(t => t.dataset.text === text && !t.classList.contains('out'));
  if (same) { clearTimeout(same.timer); same.timer = setTimeout(() => leave(same), 2600); return; }
  const t = document.createElement('div'); t.className = 'toast frame'; t.dataset.text = text;
  if (icon) t.append(iconCanvas(icon, {crop}));
  t.append(document.createTextNode(text)); box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  t.timer = setTimeout(() => leave(t), 2600);
}
const leave = t => { t.classList.add('out'); setTimeout(() => t.remove(), 420); };
// the point just in front of you, and whether a thing stands there
const front = () => [me.x + (me.dir === 'left' ? -12 : me.dir === 'right' ? 12 : 0), me.y - 4 + (me.dir === 'up' ? -12 : me.dir === 'down' ? 12 : 0)];
const near = (p, r = 17) => { if (!p) return false; const [fx, fy] = front(); return Math.hypot(fx - p[0], (fy - (p[1] - 5)) * 1.4) < r; };
function use() {
  if (!game || me.busy > 0 || fade.on || menu.open || dialog.open) return;
  if (shop.open) return;
  if (game.pet && near([pet.x, pet.y + 4], 18)) { petIt(); return; }
  if (scene === 'shore' && observe()) return;
  if (scene === 'shore' && near(SHORE.cave, 22)) { caveVisit(); return; }
  if (scene !== 'farm') { const p = S.spots.find(p => near([p.x, p.y], p.kind === 'lore' ? 34 : 21)); if (p) useSpot(p); return; }
  if (observeFarm()) return;
  if (near(S.bin)) { const r = G.ship(game); say(r.say, r.done ? 'coin' : null); if (r.done) { burst('harvest', S.bin[0], S.bin[1] - 14); store(); hud(); } return; }
  if (near(S.mailbox)) { openShop(); return; }
  if (game.pet && near(BOWL, 15)) { if (G.held(game)?.id === 'can') { const r = G.fillBowl(game); say(r.say, r.done ? 'can' : null); if (r.done) { burst('water', BOWL[0], BOWL[1] - 4); store(); hud(); cache.delete('bowl'); } } else say(game.pet.bowl ? '水碗里有水。' : '水碗空了，用水壶倒点水吧。'); return; }
  // at the door, facing it: go in
  if (Math.hypot(me.x - S.door[0], me.y - S.door[1]) < 18 && me.dir === 'up') { go('house', 'door'); return; }
  const [tx, ty] = facing(), key = tx + ',' + ty, th = game.things?.[key], tool = G.held(game)?.id;
  // a chest opens (unless one means to pick it up with the pick or the axe)
  if (th?.id === 'chest' && tool !== 'pick' && tool !== 'axe') { openChest(key); return; }
  const r = G.act(game, tx, ty, {tile: tileKind, free: tileFree});
  say(r.say, r.item || (r.effect === 'fill' ? 'can' : null));
  for (const d of r.drops || []) for (let k = 0; k < d.n; k++) spawnDrop(d.id, tx * T + 8, ty * T + (r.fell ? 6 : 11));
  if (r.got) { flyToHand(r.got, tx * T + 8, ty * T + 8); gotItem(r.got, 1); if (LORE[r.got]) discover(r.got); }
  if (r.done) {
    me.busy = r.effect === 'chop' || r.effect === 'mine' ? .3 : .22; burst(r.effect, tx * T + 8, ty * T + (r.fell ? 2 : 10)); if (r.fell) burst('leaf', tx * T + 8, ty * T - 14);
    if (r.hitOnly) shakes.set(key, performance.now());
    if (r.changed) { rebuildDyn(); if (th?.id === 'campfire' || r.placed === 'campfire') farm.hour = -99; } // its light is part of the night's
    store(); hud(); cache.delete(key); thingCache.delete(key);
  }
}
function useSpot(p) {
  if (p.kind === 'up') go('attic', 'hatch');
  else if (p.kind === 'down') go('house', 'ladder');
  else if (p.kind === 'bed') confirm(G.hourOf(game) < 18 ? '现在就睡觉吗？今天会直接结束。' : '要睡觉吗？', '睡觉', '再等等').then(yes => { if (yes) goToBed('晚安。'); });
  else if (p.kind === 'lore') { const known = game.lore?.[p.id]; discover(p.id); if (known) say(LORE[p.id].text); }
  else if (p.kind === 'scope') say(G.hourOf(game) >= 20 || G.hourOf(game) < 5 ? '从望远镜里看，极光正在天边慢慢流动……' : '白天什么也看不到，晚上再来吧。');
  else say(p.say);
}
// a question with two answers, in a small frame (keys: Space / Enter yes, Esc no; pad A / B)
const dialog = {open: false, done: () => {}};
function confirm(text, yes, no) {
  return new Promise(resolve => {
    dialog.open = true;
    dialog.done = v => { dialog.open = false; $('#ask').classList.remove('on'); resolve(v); };
    $('#ask p').textContent = text; $('#ask .yes').textContent = yes; $('#ask .no').textContent = no; $('#ask').classList.add('on'); navFocus($('#ask .yes'));
  });
}
$('#ask .yes').addEventListener('pointerdown', e => { e.preventDefault(); dialog.done(true); });
$('#ask .no').addEventListener('pointerdown', e => { e.preventDefault(); dialog.done(false); });
function petIt() {
  const r = G.petPet(game); say(r.say);
  pet.hop = .35; pet.mode = 'idle'; pet.pose = 'sit'; pet.timer = 2.5; pet.dir = me.x < pet.x ? 'left' : me.x > pet.x + 6 ? 'right' : 'down';
  if (r.done) { for (let k = 0; k < 4; k++) effects.push({x: pet.x + (Math.random() - .5) * 10, y: pet.y - 14, vx: (Math.random() - .5) * 10, vy: -16 - Math.random() * 12, life: 1 + k * .15, heart: true, col: [255, 120, 150]}); store(); }
}
function burst(kind, x, y) {
  const col = {dig: [120, 84, 52], water: [150, 220, 255], fill: [150, 220, 255], sow: [90, 60, 40], harvest: [255, 236, 150], chop: [170, 118, 70], mine: [176, 176, 190], place: [210, 196, 160], leaf: [70, 130, 70]}[kind] || [255, 255, 255];
  for (let k = 0; k < 14; k++) effects.push({x, y, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 40, life: .5 + Math.random() * .3, col});
}
const fade = {on: false, k: 0};
/** A night's sleep (in bed, or passing out at 2:00): the day turns, and one wakes up in bed in the attic. */
async function goToBed(text) {
  if (fade.on) return;
  fade.on = true; say(text); await fadeTo(1);
  const before = G.seasonOf(game);
  G.sleep(game, farmSpots()); rebuildDyn(); thingCache.clear();
  if (G.seasonOf(game) !== before) await prepareSeason(G.seasonOf(game));
  enter('attic'); [me.x, me.y, me.dir] = S.entry.bed; petPlace(me.x + 14, me.y + 8);
  if (roomSteps) roomSteps = null;
  S.px = null; await relight(G.hourOf(game));
  store(); hud();
  await new Promise(r => setTimeout(r, 250)); await fadeTo(0); fade.on = false;
  say(G.dateText(game) + '，早上好。', seasonIcon(G.seasonOf(game)));
  if (game.income) say('昨天出货收入 ' + game.income + ' 代币', 'coin');
  if (game.withered) say('换季了，' + game.withered + ' 株不合季的作物枯掉了', 'wither');
}

// ── 中央市集 by post: the mailbox opens an order form for seeds ──────────────────────────────────────────────────
const shop = {open: false, at: 0, kinds: []};
const price = n => { const el = document.createElement('span'); el.className = 'price'; el.append(iconCanvas('coin'), n); return el; };
function openShop() {
  shop.open = true; shop.at = 0;
  const season = G.seasonOf(game); shop.kinds = Object.keys(G.CROPS).filter(k => G.inSeason(k, season));
  $('#shop .sub').textContent = `现在是${G.SEASONS[season]}天，订单写好塞进信箱，当季的种子马上送到。`;
  const list = $('#shop .items'); list.innerHTML = '';
  shop.kinds.forEach((k, i) => {
    const c = G.CROPS[k], row = document.createElement('div'); row.className = 'item well';
    const text = document.createElement('div'); text.innerHTML = `<b>${c.seed}</b><small>${c.days.reduce((a, b) => a + b, 0)} 天成熟 · ${c.seasons.map(n => G.SEASONS[n]).join('')} · 出货 ${c.price}</small>`;
    const b1 = document.createElement('button'), b5 = document.createElement('button');
    b1.className = b5.className = 'wood'; b1.textContent = '买 1'; b5.textContent = '买 5';
    row.append(iconCanvas('packet', {crop: k}), text, price(c.cost), b1, b5);
    for (const [b, n] of [[b1, 1], [b5, 5]]) b.addEventListener('pointerdown', e => { e.preventDefault(); shop.at = i; shopBuy(n); });
    row.addEventListener('pointerenter', () => { shop.at = i; shopPaint(); });
    list.append(row);
  });
  $('#shop').classList.add('on'); shopPaint(); navFocus($('#shop .items button'));
}
function closeShop() { shop.open = false; $('#shop').classList.remove('on'); }
function shopMove(d) { shop.at = (shop.at + d + shop.kinds.length) % shop.kinds.length; shopPaint(); }
function purse() { for (const el of document.querySelectorAll('.purse')) el.replaceChildren(iconCanvas('coin'), game.money + ' 代币'); }
function shopPaint() { [...$('#shop .items').children].forEach((r, i) => r.classList.toggle('on', i === shop.at)); purse(); }
function shopBuy(n = 1) { const k = shop.kinds[shop.at]; if (!k) return; const r = G.buy(game, k, n); say(r.say, r.done ? 'packet' : null, k); if (r.done) { store(); hud(); } shopPaint(); }
$('#shop .close').addEventListener('pointerdown', e => { e.preventDefault(); closeShop(); });

// ── 捏人: who you are, and who comes along. Each row steps through its choices (◀ ▶, left / right on keys and pads);
// the preview turns and walks. Opened at the start of a new life, and again from 设置 to change clothes. ─────────
const NAMES = ['小满', '阿澄', '雪见', '小柚', '南风', '星野', '林汐', '乔乔', '阿岚', '小鹿', '若雪', '青禾'];
const PET_NAMES = ['团子', '豆豆', '雪球', '奶糖', '年糕', '布丁', '汤圆', '可乐', '芝麻', '饭团', '栗子', '麻薯'];
const PET_KINDS = Object.keys(PETS);
const swatchOf = list => i => list[i][1];
const OPTS = [
  {key: 'name', label: '名字', text: NAMES},
  {key: 'hair', label: '发型', names: () => LOOKS.hair.map(k => HAIR_NAMES[k])},
  {key: 'hairColor', label: '发色', names: () => LOOKS.hairColor.map(c => c[0]), swatch: swatchOf(LOOKS.hairColor)},
  {key: 'skin', label: '肤色', names: () => LOOKS.skin.map(c => c[0]), swatch: swatchOf(LOOKS.skin)},
  {key: 'eyes', label: '瞳色', names: () => LOOKS.eyes.map(c => c[0]), swatch: swatchOf(LOOKS.eyes)},
  {key: 'race', label: '种族', names: () => LOOKS.race.map(c => c[1])},
  {key: 'top', label: '上衣', names: () => LOOKS.top.map(c => c[1])},
  {key: 'topColor', label: '上衣颜色', names: () => LOOKS.topColor.map(c => c[0]), swatch: swatchOf(LOOKS.topColor)},
  {key: 'bottom', label: '下装', names: () => LOOKS.bottom.map(c => c[1]), off: l => LOOKS.top[l.top][0] === 'dress'},
  {key: 'bottomColor', label: '下装颜色', names: () => LOOKS.bottomColor.map(c => c[0]), swatch: swatchOf(LOOKS.bottomColor), off: l => LOOKS.top[l.top][0] === 'dress'},
  {key: 'legwear', label: '袜子', names: () => LOOKS.legwear.map(c => c[1]), off: l => LOOKS.bottom[l.bottom][0] === 'pants' && LOOKS.top[l.top][0] !== 'dress'},
  {key: 'shoes', label: '鞋子', names: () => LOOKS.shoes.map(c => c[0]), swatch: swatchOf(LOOKS.shoes)},
  {key: 'acc', label: '饰品', names: () => LOOKS.acc.map(c => c[1])},
  {key: 'accColor', label: '饰品颜色', names: () => LOOKS.accColor.map(c => c[0]), swatch: swatchOf(LOOKS.accColor), off: l => LOOKS.acc[l.acc][0] === 'none' || LOOKS.acc[l.acc][0] === 'glasses'},
  {key: 'petKind', label: '宠物', names: () => PET_KINDS.map(k => PETS[k].name), pet: true},
  {key: 'petCoat', label: '花色', names: () => PETS[PET_KINDS[creator.pet.petKind]].coats.map(c => c.name), pet: true},
  {key: 'petName', label: '宠物名字', text: PET_NAMES, pet: true},
];
const creator = {open: false, editing: false, look: null, pet: null, view: 0, t: 0, done: null, raf: 0};
// a look kept by names (as saved) to the creator's numbers, and back
function toIndices(look) {
  const out = {name: look.name || NAMES[0]};
  for (const key of ['hair', 'hairColor', 'skin', 'eyes', 'race', 'top', 'topColor', 'bottom', 'bottomColor', 'legwear', 'shoes', 'acc', 'accColor']) {
    const list = LOOKS[key], v = look[key] ?? DEFAULT_LOOK[key];
    out[key] = typeof v === 'number' ? v : Math.max(0, list.findIndex(e => (Array.isArray(e) ? e[0] : e) === v));
  }
  return out;
}
function openCreator(editing) {
  creator.open = true; creator.editing = editing; creator.view = 0;
  creator.look = toIndices(game.look || DEFAULT_LOOK);
  const p = game.pet; creator.pet = {petKind: Math.max(0, PET_KINDS.indexOf(p?.kind || 'cat')), petCoat: p?.coat || 0, petName: p?.name || PET_NAMES[0]};
  $('#creator .banner').textContent = editing ? '换个样子' : '新的居民';
  $('#cdone').textContent = editing ? '就这样' : '就这样，出发！';
  creatorBuild(); $('#creator').classList.add('on'); navFocus($('#creator .opt'));
  const tick = now => { if (!creator.open) return; creator.t = now / 1000; creatorPreview(); creator.raf = requestAnimationFrame(tick); };
  creator.raf = requestAnimationFrame(tick);
  return new Promise(resolve => { creator.done = resolve; });
}
function closeCreator(apply) {
  if (apply) {
    const l = creator.look, p = creator.pet, kind = PET_KINDS[p.petKind];
    game.look = {...l, name: (l.name || '').trim() || NAMES[0]};
    const old = game.pet;
    game.pet = {kind, coat: p.petCoat, name: (p.petName || '').trim() || PET_NAMES[0], love: old && old.kind === kind ? old.love : 0, bowl: old?.bowl || false, petted: old?.petted || false};
    hero = null; frames.clear(); petFrames.clear(); if (creator.editing) store(); else G.save(game);
  }
  creator.open = false; cancelAnimationFrame(creator.raf); $('#creator').classList.remove('on'); navFocus(null);
  creator.done?.(apply); creator.done = null;
}
const optValue = o => o.pet ? creator.pet[o.key] : creator.look[o.key];
function optSet(o, v) { if (o.pet) creator.pet[o.key] = v; else creator.look[o.key] = v; }
function creatorStep(o, d) {
  if (o.text) { const now = optValue(o), i = o.text.indexOf(now); optSet(o, o.text[((i < 0 ? -1 : i) + d + o.text.length) % o.text.length]); }
  else { const n = o.names().length; optSet(o, ((optValue(o) || 0) + d + n) % n); if (o.key === 'petKind') { creator.pet.petCoat = 0; } }
  creatorPaint();
}
function creatorRandom() {
  const r = n => Math.floor(Math.random() * n);
  for (const o of OPTS) { if (o.text) optSet(o, o.text[r(o.text.length)]); else if (o.key !== 'petCoat') optSet(o, r(o.names().length)); }
  creator.pet.petCoat = r(PETS[PET_KINDS[creator.pet.petKind]].coats.length);
  creatorPaint();
}
function creatorBuild() {
  const box = $('#creator .copts'); box.innerHTML = '';
  for (const o of OPTS) {
    const row = document.createElement('div'); row.className = 'opt well' + (o.pet ? ' pet' : ''); row.dataset.key = o.key;
    const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = o.label;
    const prevB = document.createElement('button'), nextB = document.createElement('button'), val = document.createElement('span');
    prevB.className = 'wood prev'; nextB.className = 'wood next'; prevB.textContent = '◀'; nextB.textContent = '▶'; val.className = 'val';
    if (o.text) { const input = document.createElement('input'); input.maxLength = 8; input.addEventListener('input', () => optSet(o, input.value)); val.append(input); }
    prevB.addEventListener('pointerdown', e => { e.preventDefault(); creatorStep(o, -1); });
    nextB.addEventListener('pointerdown', e => { e.preventDefault(); creatorStep(o, 1); });
    row.addEventListener('pointerdown', () => navFocus(row));
    row.append(lab, prevB, val, nextB); box.append(row);
  }
  creatorPaint();
}
function creatorPaint() {
  for (const row of document.querySelectorAll('#creator .opt')) {
    const o = OPTS.find(o => o.key === row.dataset.key), val = row.querySelector('.val'), v = optValue(o);
    row.classList.toggle('off', !!o.off?.(creator.look));
    if (o.text) { const input = val.querySelector('input'); if (document.activeElement !== input) input.value = v; continue; }
    val.replaceChildren();
    if (o.swatch) { const sw = document.createElement('i'); sw.className = 'swatch'; sw.style.background = o.swatch(v); val.append(sw); }
    val.append(o.names()[v] ?? '');
  }
}
const PREVIEW_VIEWS = [['front', 'down'], ['side', 'left'], ['back', 'up'], ['side', 'right']];
function creatorPreview() {
  const cv = $('#cview'), c = cv.getContext('2d'), W2 = cv.width, H2 = cv.height, img = c.createImageData(W2, H2), out = new Uint32Array(img.data.buffer);
  // a sky and a strip of meadow, as on the cards
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) out[y * W2 + x] = y > 34 ? (y === 35 ? 0xff6ab88a : (x * 7 + y * 3) % 11 ? 0xff4f9a6a : 0xff5aa877) : (y < 14 ? 0xfff0d8a8 : 0xfff6e6c4);
  const [view, dir] = PREVIEW_VIEWS[creator.view], step = [0, 1, 0, 3][Math.floor(creator.t * 6) % 4];
  const blit = (sp, ox, oy) => { for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) { const v = sp.px[j * sp.w + i]; if (!v) continue; const X = ox + i, Y = oy + j; if (X >= 0 && Y >= 0 && X < W2 && Y < H2) out[Y * W2 + X] = v; } };
  const me2 = personSprite(personFrom(creator.look), {view, step, flip: dir === 'right'});
  blit(me2, 12, 38 - me2.foot);
  const kind = PET_KINDS[creator.pet.petKind], ps = petSprite(kind, creator.pet.petCoat, {dir, step: Math.floor(creator.t * 8) % 4, pose: 'walk'});
  blit(ps, 40 - Math.round(ps.fx) + 6, 38 - Math.round(ps.fy));
  c.putImageData(img, 0, 0);
}
for (const b of document.querySelectorAll('#creator [data-turn]')) b.addEventListener('pointerdown', e => { e.preventDefault(); creator.view = (creator.view + Number(b.dataset.turn) + 4) % 4; });
$('#crandom').addEventListener('pointerdown', e => { e.preventDefault(); creatorRandom(); });
$('#cdone').addEventListener('pointerdown', e => { e.preventDefault(); closeCreator(true); });

// ── the menu: the bag, settings, how to play ───────────────────────────────────────────────────────────────────────
const menu = {open: false};
const PANES = ['bag', 'lore', 'craft', 'map', 'settings', 'help'];
function openMenu(pane) {
  if (activePanel() || fade.on) return;
  menu.open = true; bag.picked = -1; bagPaint(); craftPaint(); purse(); $('#menu').classList.add('on');
  if (pane) showPane(pane); else if (paneNow() === 'map') requestAnimationFrame(mapPaint);
  navFocus($('#menu .tabs .on'));
}
function closeMenu() { menu.open = false; $('#menu').classList.remove('on'); }
function showPane(name) {
  for (const el of document.querySelectorAll('#menu [data-pane]')) el.classList.toggle('on', el.dataset.pane === name);
  if (name === 'map') requestAnimationFrame(mapPaint);
  if (name === 'lore') lorePaint();
  if (nav.el?.closest('#menu .tabs')) navFocus($('#menu .tabs .on')); // the ring follows the tab
}
function menuTab(d) { const now = PANES.indexOf($('#menu .tabs .on').dataset.pane); showPane(PANES[(now + d + PANES.length) % PANES.length]); }
for (const b of document.querySelectorAll('#menu .tabs button')) b.addEventListener('pointerdown', e => { e.preventDefault(); showPane(b.dataset.pane); });
// the bag: click (or A) a slot to pick it up, another to put it there (swapping, or onto the same thing); the bin
// at the end throws away what is picked up. The top row is what is in hand.
const bag = {picked: -1};
const slotButton = (it, i, extra = '') => {
  const b = document.createElement('button'); b.className = 'slot' + extra; b.dataset.i = i;
  if (it) { b.append(itemIcon(it.id)); const n = document.createElement('span'); n.className = 'count'; n.textContent = it.n > 1 ? it.n : ''; b.append(n); b.title = G.ITEMS[it.id]?.name || ''; }
  return b;
};
function itemInfo(it) {
  if (!it) return '';
  const d = G.ITEMS[it.id] || {}, price = d.price && d.type !== 'tool' ? ` · 出货 ${d.price}` : '';
  return `${d.name}${it.n > 1 ? ' ×' + it.n : ''}${price}${d.note ? ' — ' + d.note : ''}`;
}
function bagPaint() {
  const p = game.pet, hearts = G.hearts(p);
  $('#petline').innerHTML = p ? `<b>${p.name}</b>（${PETS[p.kind].coats[p.coat % PETS[p.kind].coats.length].name}）<span class="hearts">${[0, 1, 2, 3, 4].map(k => hearts >= k + 1 ? '♥' : hearts >= k + .5 ? '<i>♥</i>' : '<s>♥</s>').join('')}</span>${p.petted ? '' : ' · 今天还没摸摸它'}${p.bowl ? '' : ' · 水碗空着'}` : '';
  const grid = $('#invgrid'), focused = nav.el?.closest('#invgrid') ? Number(nav.el.dataset.i) : null; grid.innerHTML = '';
  game.inv.forEach((it, i) => {
    const b = slotButton(it, i, (i < G.HAND ? ' hand' : '') + (i === bag.picked ? ' picked' : ''));
    b.addEventListener('pointerdown', e => { e.preventDefault(); bagClick(i); });
    b.addEventListener('pointerenter', () => { $('#iteminfo').textContent = itemInfo(game.inv[i]); });
    grid.append(b);
  });
  const trash = document.createElement('button'); trash.className = 'slot trash'; trash.dataset.i = 'trash'; trash.title = '丢掉'; trash.append(iconCanvas('trash'));
  trash.addEventListener('pointerdown', e => { e.preventDefault(); bagTrash(); }); grid.append(trash);
  $('#iteminfo').textContent = bag.picked >= 0 ? '拿起了：' + itemInfo(game.inv[bag.picked]) + '　（再点一格放下，点垃圾桶丢掉）' : '点一格拿起，再点另一格放下；第一排是手上的十格。';
  if (focused !== null) navFocus(grid.children[focused] || null);
}
function bagClick(i) {
  if (bag.picked < 0) { if (game.inv[i]) bag.picked = i; }
  else { if (i !== bag.picked) G.moveSlot(game.inv, bag.picked, game.inv, i); bag.picked = -1; store(); hud(); }
  bagPaint();
}
function bagTrash() {
  const it = game.inv[bag.picked]; if (!it) { say('先拿起要丢的东西'); return; }
  if (G.ITEMS[it.id]?.type === 'tool') { say('工具不能丢'); return; }
  game.inv[bag.picked] = null; bag.picked = -1; say('丢掉了 ' + G.ITEMS[it.id].name + (it.n > 1 ? ' ×' + it.n : ''), 'trash'); store(); hud(); bagPaint();
}
// making things: what each needs, from what is in the bag
function craftPaint() {
  const box = $('#recipes'); box.innerHTML = '';
  for (const id of G.RECIPES) {
    const d = G.ITEMS[id], row = document.createElement('div'); row.className = 'item well recipe';
    const text = document.createElement('div'); text.innerHTML = `<b>${d.name}</b><small>${d.note || ''}</small>`;
    const need = document.createElement('div'); need.className = 'need';
    let ok = true;
    for (const [k, n] of Object.entries(d.recipe)) { const have = G.count(game, k), chip = document.createElement('span'); chip.className = 'chip' + (have < n ? ' short' : ''); chip.append(itemIcon(k), `${have}/${n}`); need.append(chip); if (have < n) ok = false; }
    const b = document.createElement('button'); b.className = 'wood'; b.textContent = '制作'; if (!ok) b.classList.add('dim');
    b.addEventListener('pointerdown', e => { e.preventDefault(); const r = G.craft(game, id); say(r.say, r.done ? id : null); if (r.done) { store(); hud(); } craftPaint(); bagPaint(); });
    row.append(itemIcon(id), text, need, b); box.append(row);
  }
}
// a chest: its slots above, the bag below; a click sends the whole stack across
const chestUi = {open: false, key: null};
function openChest(key) {
  if (activePanel()) return;
  chestUi.open = true; chestUi.key = key; chestPaint(); $('#chestui').classList.add('on'); navFocus($('#chestgrid .slot'));
}
function closeChest() { chestUi.open = false; $('#chestui').classList.remove('on'); store(); hud(); }
function chestPaint() {
  const th = game.things[chestUi.key]; if (!th) { closeChest(); return; }
  th.items ??= Array(G.CHEST).fill(null);
  const focused = nav.el && $('#chestui').contains(nav.el) ? [nav.el.parentElement.id, Number(nav.el.dataset.i)] : null;
  for (const [id, list, other] of [['chestgrid', th.items, game.inv], ['chestbag', game.inv, th.items]]) {
    const grid = $('#' + id); grid.innerHTML = '';
    list.forEach((it, i) => { const b = slotButton(it, i, id === 'chestbag' && i < G.HAND ? ' hand' : ''); b.addEventListener('pointerdown', e => { e.preventDefault(); if (G.sendStack(list, i, other)) chestPaint(); else if (it) say('放不下了'); }); b.addEventListener('pointerenter', () => { $('#chestinfo').textContent = itemInfo(list[i]); }); grid.append(b); });
  }
  if (focused) navFocus($('#' + focused[0]).children[focused[1]] || null);
}
$('#chestui .close').addEventListener('pointerdown', e => { e.preventDefault(); closeChest(); });
$('#relook').onclick = () => { closeMenu(); openCreator(true); };
$('#menuBtn').addEventListener('pointerdown', e => { e.preventDefault(); menu.open ? closeMenu() : openMenu(); });
$('#menu .close').addEventListener('pointerdown', e => { e.preventDefault(); closeMenu(); });

// ── moving ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const free = (x, y) => { for (let j = -3; j < 0; j++) for (let i = -4; i < 4; i++) { const X = Math.round(x + i), Y = Math.round(y + j); if (X < 0 || Y < 0 || X >= W || Y >= H || S.solid[Y * W + X] || blocked(Y * W + X)) return false; } return true; };
let lastSaved = 0;
function update(dt) {
  if (farm && farm.hour === -99 && S === farm && !relighting) relighting = relight(G.hourOf(game)).finally(() => { relighting = null; });
  if (!fade.on && !activePanel()) {
    game.minutes += dt * G.MINUTES_PER_SECOND;
    if (game.minutes >= G.DAY_END) { goToBed('太晚了……撑不住了。'); return; }
    if (Math.floor(game.minutes / 10) !== Math.floor(lastSaved / 10)) { lastSaved = game.minutes; hud(); if (Math.floor(game.minutes) % 60 < 2) store(); }
    if (!relighting && Math.abs(G.hourOf(game) - (S.hour ?? -99)) >= .25) relighting = relight(G.hourOf(game)).finally(() => { relighting = null; });
  }
  me.busy = Math.max(0, me.busy - dt);
  let {x, y} = wanted(); const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  me.moving = len > .1 && me.busy <= 0 && !fade.on && !activePanel();
  if (me.moving) {
    me.dir = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
    const nx = me.x + x * SPEED * dt, ny = me.y + y * SPEED * dt;
    if (free(nx, me.y)) me.x = nx;
    if (free(me.x, ny)) me.y = ny;
    me.t += dt;
    // walking into the house's door goes in; walking out of the doorway goes out
    if (scene === 'farm' && me.dir === 'up' && Math.hypot(me.x - S.door[0], me.y - S.door[1]) < 9) go('house', 'door');
    else if (scene === 'house' && me.y > S.exitY) go('farm');
    else if (scene === 'farm' && me.dir === 'right' && me.x > FARM_W - 9) go('shore', 'west');
    else if (scene === 'shore' && me.dir === 'left' && me.x < 9) go('farm', 'east');
  } else me.t = 0;
  const heldType = G.ITEMS[G.held(game)?.id]?.type, groundTool = scene === 'farm' && ['tool', 'seed', 'place'].includes(heldType);
  cursor.still = me.moving ? 0 : cursor.still + dt;
  const wantCursor = scene === 'farm' && ((using === 'mouse' && mouse.active) || (groundTool && cursor.still > .35));
  cursor.k = Math.max(0, Math.min(1, cursor.k + (wantCursor ? dt * 4 : -dt * 8)));
  for (const p of effects) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.heart ? 0 : 120) * dt; p.life -= dt; }
  petUpdate(dt);
  dropsUpdate(dt);
  if (scene === 'shore') { tideUpdate(dt); crittersUpdate(dt); }
  else if (scene === 'farm') farmCrittersWatch();
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}

// ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const frames = new Map(), cropArt = new Map(), cache = new Map();
let hero = null;
function frame(dir, step) { hero ??= personFrom(game.look || DEFAULT_LOOK); const key = dir + step; if (!frames.has(key)) frames.set(key, person(hero, {view: dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side', step, flip: dir === 'right'})); return frames.get(key); }
// a crop's picture by stage (-1: withered)
function art(kind, stage) { const key = kind + stage; if (!cropArt.has(key)) cropArt.set(key, cropStage(G.CROPS[kind].art, stage)); return cropArt.get(key); }
// the light that reaches a ground pixel, times an albedo, finished like the world
const litGround = (alb, x, y) => { const i = y * W + x; return finish(alb[0] * S.light[i * 3], alb[1] * S.light[i * 3 + 1], alb[2] * S.light[i * 3 + 2], x, y, S.sun); };
const SOIL = ['#3a2416', '#4e3120', '#64412a', '#7b5134', '#91623e'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
/** A farm tile's ground, lit: dug soil (on grass), darker when watered, seeds showing when just sown. Cached per light. */
function groundOf(tx, ty, t) {
  const key = tx + ',' + ty, sig = lightVersion + '|' + (t.tilled ? 1 : 0) + (t.wet ? 1 : 0) + (t.crop ? (t.crop.dead ? 'x' : t.crop.stage) : '-');
  const snowy = false, seeded = t.crop && t.crop.stage === 0 && !t.crop.dead; // (the field is no longer under snow in winter)
  const hit = cache.get(key); if (hit?.sig === sig) return hit.ground;
  const px = new Uint32Array(T * T);
  for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) {
    const x = tx * T + lx, y = ty * T + ly, i = y * W + x;
    if (S.owner[i] >= 0) continue;
    let alb;
    // the field keeps its own soil, drawn baked; under snow, a tile shows soil once something grows or it is watered
    if (t.field && !(snowy && (t.crop || t.wet))) { if (!t.wet && !seeded) continue; alb = unpack(S.F[i]); }
    else { const ridge = ly % 8, edge = lx === 0 || lx === T - 1 || ly === 0; alb = SOIL[edge ? 0 : ridge < 1 ? 4 : ridge < 3 ? 3 : ridge < 5 ? 2 : ridge < 7 ? 1 : 0]; if (hash(x, y, 13) > .93) alb = SOIL[0]; }
    if (t.wet) alb = [alb[0] * .58, alb[1] * .56, alb[2] * .62 + 6];
    if (seeded && hash(x, y, 71) > .9 && ly > 3 && ly < 13) alb = hash(x, y, 72) > .5 ? [216, 200, 160] : [70, 48, 30];
    px[ly * T + lx] = litGround(alb, x, y);
  }
  cache.set(key, {sig, ground: px, plant: null}); return px;
}
/** A plant, lit by the same sun and lamps, with the shadow it casts. Cached per light. */
function plantOf(tx, ty, t) {
  const entry = cache.get(tx + ',' + ty); if (entry.plant) return entry.plant;
  const a = art(t.crop.kind, t.crop.dead ? -1 : t.crop.stage), foot = ty * T + 14, ox = tx * T + 8 - Math.round(a.fx), oy = foot - Math.round(a.fy);
  const lit = new Uint32Array(a.w * a.h), n = [0, 0, 0];
  for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) {
    const c = a.px[j * a.w + i]; if (!c) continue;
    n[0] = a.nrm[(j * a.w + i) * 3]; n[1] = a.nrm[(j * a.w + i) * 3 + 1]; n[2] = a.nrm[(j * a.w + i) * 3 + 2];
    const wx = ox + i, wy = oy + j, z = Math.max(0, foot - wy), vis = 1 - (S.shadow[Math.min(H - 1, foot) * W + wx] || 0) * .92;
    const [r, g, b] = shade(unpack(c), n, wx, foot, z, vis, S.sun, S.lamps);
    lit[j * a.w + i] = finish(r, g, b, wx, wy, S.sun);
  }
  const shadowPx = [], step = shadowStep(S.sun);
  if (step) { const set = new Set(); markSprite((x, y) => set.add(Math.round(y) * W + Math.round(x)), {...a, x: ox, y: oy, foot}, step[0], step[1]); shadowPx.push(...set); }
  entry.plant = {a, ox, oy, foot, lit, shadowPx};
  return entry.plant;
}
// the things on the farm, lit like the plants and cached per light (and per look: stage, season, the fence's joins)
const thingCache = new Map(), shakes = new Map();
function thingOf(tx, ty, th) {
  const key = tx + ',' + ty, joins = th.id === 'fence' ? ['1,0', '-1,0', '0,-1', '0,1'].reduce((m, d, k) => { const [dx, dy] = d.split(',').map(Number); return m | (game.things[(tx + dx) + ',' + (ty + dy)]?.id === 'fence' ? 1 << k : 0); }, 0) : 0;
  const sig = [th.id, th.stage, litSeason, joins, lightVersion].join(), hit = thingCache.get(key); if (hit?.sig === sig) return hit.plant;
  const a = thingArt(th, litSeason, Math.floor(hash(tx, ty, 5) * 97) + 1, joins), foot = ty * T + 14, ox = tx * T + 8 - Math.round(a.fx), oy = foot - Math.round(a.fy);
  const lit = new Uint32Array(a.w * a.h), n = [0, 0, 0];
  for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) {
    const c = a.px[j * a.w + i]; if (!c) continue;
    n[0] = a.nrm[(j * a.w + i) * 3]; n[1] = a.nrm[(j * a.w + i) * 3 + 1]; n[2] = a.nrm[(j * a.w + i) * 3 + 2];
    const wx = ox + i, wy = oy + j, z = Math.max(0, foot - wy), vis = 1 - (S.shadow[Math.min(H - 1, foot) * W + Math.max(0, Math.min(W - 1, wx))] || 0) * .92;
    const [r, g, b] = shade(unpack(c), n, wx, foot, z, vis, S.sun, S.lamps);
    lit[j * a.w + i] = finish(r, g, b, wx, wy, S.sun);
  }
  const shadowPx = [], step = shadowStep(S.sun);
  if (step) { const set = new Set(); markSprite((x, y) => set.add(Math.round(y) * W + Math.round(x)), {...a, x: ox, y: oy, foot}, step[0], step[1]); shadowPx.push(...set); }
  const plant = {a, ox, oy, foot, lit, shadowPx};
  thingCache.set(key, {sig, plant}); return plant;
}
function pathOf(tx, ty) {
  const key = 'path' + tx + ',' + ty, hit = cache.get(key); if (hit?.v === lightVersion) return hit.ground;
  const px = new Uint32Array(T * T);
  for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) { const x = tx * T + lx, y = ty * T + ly; if (S.owner[y * W + x] >= 0) continue; px[ly * T + lx] = litGround(pathAlbedo(lx, ly, tx, ty), x, y); }
  cache.set(key, {v: lightVersion, ground: px}); return px;
}
// a campfire after dusk: flames over the logs and sparks going up (its light on the ground comes with the night's light)
function campfireFlames(x, y, cx, cy, t) {
  const night = S.sun.night ? 1 : Math.max(0, Math.min(1, (S.sun.hour - 18.4) / 1.4)); if (!night) return;
  for (let k = -4; k <= 4; k++) {
    const h = (3 + 6 * (1 - Math.abs(k) / 5)) * (.6 + .4 * noise1(k * .6 + t * 5, 9) + .12 * Math.sin(t * 11 + k)) * night;
    for (let j = 0; j < h; j++) { const f = j / h; blendAt(x + k, y - j, cx, cy, ...(f < .3 ? [255, 240, 170] : f < .65 ? [255, 166, 64] : [214, 72, 32]), f > .85 ? .45 : .95); }
  }
  for (let k = 0; k < 4; k++) { const age = (t * .8 + k / 4) % 1; addAt(x + Math.sin(k * 5 + t * 1.6) * 4, y - 6 - age * 22, cx, cy, 255, 170, 70, (1 - age) * night); }
}
// ── things on the ground: what breaks out of trees and stones falls, bounces, then drifts to you when you come near ──
// (kept with the game, so what is left lying stays there; a full bag leaves it lying). Picking up shows one note per
// kind of thing that counts up while more comes in.
const flyers = [];
function spawnDrop(id, x, y) {
  game.drops ??= [];
  // first where it will land: somewhere close that one can walk to (never up on a cliff or inside a thing)
  const walk = (X, Y) => { X = Math.round(X); Y = Math.round(Y); if (X < 2 || Y < 2 || X >= W - 2 || Y >= H - 2) return false; for (const [dx, dy] of [[0, 0], [-2, 0], [2, 0], [0, -2]]) { const i = (Y + dy) * W + X + dx; if (S.solid[i] || blocked(i)) return false; } return true; };
  let to = null;
  for (let k = 0; k < 24 && !to; k++) { const a = Math.random() * Math.PI * 2, r = 7 + Math.random() * 12 + k * .6, X = x + Math.cos(a) * r, Y = y + 4 + Math.sin(a) * r * .7; if (walk(X, Y)) to = [X, Y]; }
  to ??= [me.x + (Math.random() - .5) * 10, me.y + 2];
  game.drops.push({id, x, y, x0: x, y0: y, x1: to[0], y1: to[1], z: 6, air: .42 + Math.random() * .12, h: 10 + Math.random() * 8, age: 0});
}
function flyToHand(id, x, y) { flyers.push({id, x, y, z: 6, age: 0, fly: true, x0: x, y0: y}); }
function dropsUpdate(dt) {
  for (const f of flyers) f.age += dt;
  for (let i = flyers.length - 1; i >= 0; i--) { const f = flyers[i], k = Math.min(1, f.age / .35); f.x = f.x0 + (me.x - f.x0) * k; f.y = f.y0 + (me.y - 6 - f.y0) * k; f.z = 6 + Math.sin(k * Math.PI) * 14 + k * 16; if (f.age > .4) flyers.splice(i, 1); }
  if (!game.drops?.length || scene !== 'farm' || fade.on) return;
  let got = false;
  for (let i = game.drops.length - 1; i >= 0; i--) {
    const d = game.drops[i]; d.age += dt;
    if (d.air && d.age < d.air + .18) { // in the air: an arc to where it lands, then a little bounce
      const k = Math.min(1, d.age / d.air), b = Math.max(0, d.age - d.air) / .18;
      d.x = d.x0 + (d.x1 - d.x0) * k; d.y = d.y0 + (d.y1 - d.y0) * k;
      d.z = k < 1 ? 6 * (1 - k) + 4 * d.h * k * (1 - k) : Math.sin(b * Math.PI) * 3;
      continue;
    }
    d.z = 0;
    const dx = me.x - d.x, dy = me.y - 4 - d.y, dist = Math.hypot(dx, dy);
    if (d.age < .45 || dist > 34) continue;
    if (dist < 5) { if (G.add(game, d.id, 1)) { d.full = true; continue; } game.drops.splice(i, 1); gotItem(d.id, 1); got = true; continue; }
    if (d.full && !game.inv.some(x => !x || (x.id === d.id && x.n < G.STACK))) continue; // still no room
    const v = 70 + (34 - dist) * 6; d.x += dx / dist * v * dt; d.y += dy / dist * v * dt;
  }
  if (got) { hud(); store(); }
}
// a note for what came into the bag: one per kind of thing, counting up as more comes
function gotItem(id, n) {
  const box = $('#toasts'), name = G.ITEMS[id]?.name || id;
  let t = [...box.children].find(t => t.dataset.item === id && !t.classList.contains('out'));
  if (!t) { t = document.createElement('div'); t.className = 'toast frame'; t.dataset.item = id; t.dataset.n = 0; t.append(itemIcon(id), document.createTextNode('')); box.append(t); while (box.children.length > 4) box.firstElementChild.remove(); }
  t.dataset.n = Number(t.dataset.n) + n; t.lastChild.textContent = name + '  +' + t.dataset.n;
  t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
  clearTimeout(t.timer); t.timer = setTimeout(() => leave(t), 2200);
}
const dropPixels = new Map();
function drawDrop(d, cx, cy) {
  if (!dropPixels.has(d.id)) dropPixels.set(d.id, iconPixels(d.id.startsWith('seed:') ? 'packet' : d.id, {crop: d.id.startsWith('seed:') ? d.id.slice(5) : null}).map(([x, y, c]) => [x, y, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]));
  const bob = d.fly ? 0 : d.z > 0 ? 0 : Math.sin(performance.now() / 260 + d.x) * 1, scale = d.fly ? 1 - Math.min(.5, d.age) : .75;
  const gx = Math.round(d.x), gy = Math.round(d.y), i0 = Math.max(0, Math.min(H - 1, gy)) * W + Math.max(0, Math.min(W - 1, gx));
  const L = S.light ? [S.light[i0 * 3], S.light[i0 * 3 + 1], S.light[i0 * 3 + 2]] : [1, 1, 1];
  if (!d.fly) for (let x = -3; x <= 3; x++) { const sx = gx + x - cx, sy = gy + 1 - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) { const [r, g, b] = unpack(screen[sy * VW + sx]); screen[sy * VW + sx] = pack(r * .7 | 0, g * .7 | 0, b * .72 | 0); } }
  const top = gy - Math.round(d.z) - Math.round(14 * scale) + Math.round(bob);
  for (const [x, y, r, g, b] of dropPixels.get(d.id)) {
    const sx = gx - Math.round(8 * scale) + Math.round(x * scale) - cx, sy = top + Math.round(y * scale) - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
    screen[sy * VW + sx] = finish(r * L[0], g * L[1], b * L[2], gx, gy, S.sun);
  }
}
const HEART = [[-2, -1], [-1, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];

// ── the pet: wanders near, follows when you go far, naps now and then, sleeps indoors at night ───────────────────
const pet = {x: 0, y: 0, dir: 'down', t: 0, moving: false, pose: 'sit', mode: 'idle', timer: 1, tx: 0, ty: 0, stuck: 0, hop: 0};
const PET_BEDS = {house: [124, 100], attic: [104, 126]};
const BOWL = [106, 262];
const petFree = (x, y) => { for (let j = -2; j < 0; j++) for (let i = -3; i < 3; i++) { const X = Math.round(x + i), Y = Math.round(y + j); if (X < 0 || Y < 0 || X >= W || Y >= H || S.solid[Y * W + X] || blocked(Y * W + X)) return false; } return true; };
function petPlace(x, y) {
  pet.x = x; pet.y = y;
  if (!petFree(x, y)) for (let r = 1; r < 240; r++) { const a = r * 2.4, X = x + Math.cos(a) * r * .5, Y = y + Math.sin(a) * r * .5; if (petFree(X, Y)) { pet.x = X; pet.y = Y; break; } }
  pet.mode = 'idle'; pet.timer = 1 + Math.random() * 2; pet.pose = 'sit'; pet.stuck = 0;
}
function petUpdate(dt) {
  if (!game.pet || fade.on) return;
  const h = G.hourOf(game), night = h >= 21 || h < 6, d = Math.hypot(me.x - pet.x, me.y - pet.y);
  pet.hop = Math.max(0, pet.hop - dt); pet.timer -= dt;
  let speed = 0;
  if (night && PET_BEDS[scene]) { // bedtime: to its spot, and curl up
    const [bx, by] = PET_BEDS[scene];
    if (Math.hypot(bx - pet.x, by - pet.y) > 3) { pet.tx = bx; pet.ty = by; speed = 40; pet.mode = 'bed'; } else { pet.mode = 'sleep'; pet.pose = 'sleep'; }
  } else if (d > 84 || (pet.mode === 'follow' && d > 26)) { pet.mode = 'follow'; pet.tx = me.x + (me.dir === 'left' ? 14 : -14); pet.ty = me.y + 4; speed = d > 140 ? 92 : 66; }
  else if (pet.mode === 'follow' || pet.mode === 'bed' || pet.mode === 'sleep') { pet.mode = 'idle'; pet.timer = 1 + Math.random() * 2; pet.pose = 'sit'; }
  else if (pet.mode === 'wander') { speed = 32; if (Math.hypot(pet.tx - pet.x, pet.ty - pet.y) < 2) { pet.mode = 'idle'; pet.timer = 2 + Math.random() * 4; pet.pose = Math.random() < .6 ? 'sit' : 'walk'; } }
  else if (pet.timer <= 0) {
    if (pet.mode === 'nap' || Math.random() < .8) { const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 40; pet.tx = pet.x + Math.cos(a) * r; pet.ty = pet.y + Math.sin(a) * r * .7; pet.mode = 'wander'; }
    else { pet.mode = 'nap'; pet.pose = 'sleep'; pet.timer = 6 + Math.random() * 8; }
  }
  pet.moving = false;
  if (speed) {
    const dx = pet.tx - pet.x, dy = pet.ty - pet.y, len = Math.hypot(dx, dy);
    if (len > 1.5) {
      const mx = dx / len * speed * dt, my = dy / len * speed * dt; let moved = false;
      if (petFree(pet.x + mx, pet.y)) { pet.x += mx; moved = true; }
      if (petFree(pet.x, pet.y + my)) { pet.y += my; moved = true; }
      pet.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      pet.pose = 'walk'; pet.moving = moved; pet.t += dt; pet.stuck = moved ? 0 : pet.stuck + dt;
      if (pet.stuck > .7) { if (pet.mode === 'follow' && d > 70) petPlace(me.x, me.y + 10); else { pet.mode = 'idle'; pet.timer = 1; pet.pose = 'sit'; } pet.stuck = 0; }
    }
  }
}
const petFrames = new Map();
function petFrame() {
  const p = game.pet, step = pet.moving ? Math.floor(pet.t * 9) % 4 : 0, pose = pet.moving ? 'walk' : pet.pose === 'sleep' ? 'sleep' : pet.pose === 'sit' ? 'sit' : 'walk';
  const dir = pose === 'sit' && (pet.dir === 'up') ? 'down' : pet.dir, key = [p.kind, p.coat, dir, step, pose].join();
  if (!petFrames.has(key)) petFrames.set(key, petSprite(p.kind, p.coat, {dir, step, pose}));
  return petFrames.get(key);
}
// the water bowl by the house: a round blue bowl, water in it once filled for the day
function bowlArt(full) {
  return object(14, 9, set => cylinder(set, 7, 3, 6, 5.6, 2.2, (u, v, part) => part === 'top' ? (v > .62 ? C('#9cc4e4') : full ? (v < .2 && u < 0 ? C('#e8f8ff') : C('#6ab8e0')) : C('#2a3a4a')) : u < -.3 ? C('#7aa8d8') : u < .4 ? C('#4f7fb5') : C('#36608e'), {width: v => 1 - v * .2}), {round: 2, fx: 7, fy: 7, shapes: []});
}
function bowlOf() {
  const full = !!game.pet.bowl, key = 'bowl', hit = cache.get(key);
  if (hit?.full === full && hit.v === lightVersion) return hit.plant;
  const a = bowlArt(full), foot = BOWL[1], ox = BOWL[0] - a.fx, oy = foot - a.fy, lit = new Uint32Array(a.w * a.h), n = [0, 0, 0];
  for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) {
    const c = a.px[j * a.w + i]; if (!c) continue;
    n[0] = a.nrm[(j * a.w + i) * 3]; n[1] = a.nrm[(j * a.w + i) * 3 + 1]; n[2] = a.nrm[(j * a.w + i) * 3 + 2];
    const wx = ox + i, wy = oy + j, vis = 1 - (S.shadow[foot * W + wx] || 0) * .92, [r, g, b] = shade(unpack(c), n, wx, foot, Math.max(0, foot - wy), vis, S.sun, S.lamps);
    lit[j * a.w + i] = finish(r, g, b, wx, wy, S.sun);
  }
  const plant = {a, ox, oy, foot, lit, shadowPx: []};
  cache.set(key, {full, v: lightVersion, plant}); return plant;
}

function drawSprite(lit, w, h, ox, oy, foot, cx, cy) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = lit[j * w + i]; if (!c) continue;
    const wx = ox + i, wy = oy + j, sx = wx - cx, sy = wy - cy;
    if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || wy < 0 || wy >= H || wx < 0 || wx >= W || S.owner[wy * W + wx] > foot) continue;
    screen[sy * VW + sx] = c;
  }
}
function darkenGround(list, cx, cy, k) {
  for (const i of list) { if (i < 0 || i >= W * H) continue; const x = i % W, y = i / W | 0, sx = x - cx, sy = y - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || S.owner[i] >= 0) continue; const s = sy * VW + sx, [r, g, b] = unpack(screen[s]); screen[s] = pack(r * k[0] | 0, g * k[1] | 0, b * k[2] | 0); }
}
/** The view's top left in the scene: following you, kept inside the scene; a room smaller than the view sits centred. */
function camera() {
  const cx = W > VW ? Math.round(Math.max(0, Math.min(W - VW, me.x - VW / 2))) : -Math.floor((VW - W) / 2);
  const cy = H > VH ? Math.round(Math.max(0, Math.min(H - VH, me.y - 16 - VH / 2))) : -Math.floor((VH - H) / 2);
  return [cx, cy];
}
const DARK = pack(12, 11, 18);
function draw(t) {
  if (!S?.px) return;
  const [cx, cy] = camera(), x0 = Math.max(0, -cx), x1 = Math.min(VW, W - cx);
  for (let y = 0; y < VH; y++) {
    const wy = cy + y; if (wy < 0 || wy >= H) { screen.fill(DARK, y * VW, y * VW + VW); continue; }
    if (x0 > 0) screen.fill(DARK, y * VW, y * VW + x0); if (x1 < VW) screen.fill(DARK, y * VW + x1, y * VW + VW);
    screen.set(S.px.subarray(wy * W + cx + x0, wy * W + cx + x1), y * VW + x0);
  }
  if (OUTDOOR.includes(scene)) liveLayers(cx, cy, t); else roomLayers(cx, cy, t);
  const sun = S.sun, lift = (sun.L[2] + .5) / 1.5, shadowK = [0, 1, 2].map(c => (sun.sky[c] + sun.sun[c] * lift * .08) / (sun.sky[c] + sun.sun[c] * lift));
  // the farm: ground first, then plants and people sorted by their feet
  const sprites = [];
  const tx0 = Math.floor(cx / T) - 1, tx1 = Math.ceil((cx + VW) / T) + 1, ty0 = Math.floor(cy / T) - 1, ty1 = Math.ceil((cy + VH) / T) + 2;
  if (scene === 'farm') for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const tile = game.tiles[tx + ',' + ty]; if (!tile) continue;
    const g = groundOf(tx, ty, tile);
    for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) { const c = g[ly * T + lx]; if (!c) continue; const sx = tx * T + lx - cx, sy = ty * T + ly - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) screen[sy * VW + sx] = c; }
    if (tile.crop && (tile.crop.stage > 0 || tile.crop.dead)) sprites.push({foot: ty * T + 14, plant: plantOf(tx, ty, tile)});
  }
  if (scene === 'farm' && game.things) for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const key = tx + ',' + ty, th = game.things[key]; if (!th) continue;
    if (th.id === 'path') { const g = pathOf(tx, ty); for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) { const c = g[ly * T + lx]; if (!c) continue; const sx = tx * T + lx - cx, sy = ty * T + ly - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) screen[sy * VW + sx] = c; } continue; }
    sprites.push({foot: ty * T + 14, plant: thingOf(tx, ty, th), key, fire: th.id === 'campfire'});
  }
  if (!sun.night) for (const s of sprites) darkenGround(s.plant.shadowPx, cx, cy, shadowK);
  sprites.push({foot: Math.round(me.y), me: true});
  if (scene === 'farm') for (const d of game.drops || []) sprites.push({foot: Math.round(d.y), drop: d});
  for (const f of flyers) sprites.push({foot: 1e6, drop: f});
  if (game.pet) sprites.push({foot: Math.round(pet.y), pet: true});
  if (game.pet && scene === 'farm') { const b = bowlOf(); sprites.push({foot: BOWL[1], plant: b}); }
  sprites.sort((a, b) => a.foot - b.foot);
  for (const s of sprites) {
    if (s.plant) {
      const p = s.plant, since = s.key ? performance.now() - (shakes.get(s.key) || -1e4) : 1e4, wob = since < 260 ? Math.round(Math.sin(since / 26) * 1.5) : 0;
      drawSprite(p.lit, p.a.w, p.a.h, p.ox + wob, p.oy, p.foot, cx, cy);
      if (s.fire) campfireFlames(p.ox + p.a.fx, p.foot - 4, cx, cy, t);
    }
    else if (s.drop) drawDrop(s.drop, cx, cy);
    else if (s.pet) drawActor(petFrame(), pet.x, pet.y, pet.hop > 0 ? Math.round(Math.sin(pet.hop / .35 * Math.PI) * 3) : 0, cx, cy, shadowK);
    else drawMe(cx, cy, shadowK);
  }
  // where the tool will land: four soft corners, shown only when you stop with a tool for the ground (or point with the mouse)
  if (!fade.on && cursor.k > .02) {
    const [tx, ty] = facing(), a = .45 * cursor.k;
    for (const [x0, y0, dx, dy] of [[0, 0, 1, 1], [T - 1, 0, -1, 1], [0, T - 1, 1, -1], [T - 1, T - 1, -1, -1]]) for (let k = 0; k < 4; k++) for (const [x, y] of [[tx * T + x0 + dx * k, ty * T + y0], [tx * T + x0, ty * T + y0 + dy * k]]) { const sx = x - cx, sy = y - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue; const i = sy * VW + sx, [r, g, b] = unpack(screen[i]); screen[i] = pack(r + (255 - r) * a | 0, g + (255 - g) * a | 0, b + (240 - b) * a | 0); }
  }
  for (const p of effects) {
    if (p.heart) { for (const [dx, dy] of HEART) blendAt(p.x + dx, p.y + dy, cx, cy, ...(dy === -1 && dx === -1 ? [255, 220, 230] : p.col), Math.min(1, p.life * 1.5)); continue; }
    const sx = Math.round(p.x) - cx, sy = Math.round(p.y) - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) screen[sy * VW + sx] = pack(...p.col);
  }
  ctx.putImageData(image, 0, 0);
}
function drawMe(cx, cy, shadowK) {
  const step = me.moving ? [0, 1, 0, 3][Math.floor(me.t * 8) % 4] : 0;
  drawActor(frame(me.dir, step), me.x, me.y, me.busy > .1 ? 1 : 0, cx, cy, shadowK);
}
/** Someone standing in the world (you, the pet): lit by the sun and the lamps there, casting shadows from both. */
function drawActor(s, x, y, up, cx, cy, shadowK) {
  const ox = Math.round(x - s.fx), oy = Math.round(y - s.fy) - up, foot = Math.round(y), px = Math.round(x);
  const sun = S.sun, lamps = S.lamps, marks = new Set();
  if (!sun.night) { const st = shadowStep(sun); if (st) { markSprite((x, y) => marks.add(Math.round(y) * W + Math.round(x)), {...s, x: ox, y: oy, foot}, st[0], st[1]); darkenGround(marks, cx, cy, shadowK); } }
  for (const l of lamps) {
    const d = Math.hypot(l.x - px, l.y - foot); if (d > l.r * .9) continue;
    marks.clear(); markSprite((x, y) => marks.add(Math.round(y) * W + Math.round(x)), {...s, x: ox, y: oy, foot}, 0, 0, {x: l.x, y: l.y, z: Math.max(l.z, 48)}); // a light lower than one's head would throw the shadow away for ever
    const k = 1 - .65 * (1 - d / l.r) ** 1.5 * Math.min(1, l.k); darkenGround(marks, cx, cy, [k, k * 1.02, k * 1.08]);
  }
  const shadowHere = S.shadow[Math.min(H - 1, foot) * W + px] || 0, n = [0, 0, 0];
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const c = s.px[j * s.w + i]; if (!c) continue;
    const wx = ox + i, wy = oy + j, sx = wx - cx, sy = wy - cy;
    if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || wy < 0 || wy >= H || S.owner[wy * W + wx] > foot) continue;
    const z = Math.max(0, foot - wy);
    n[0] = s.nrm[(j * s.w + i) * 3]; n[1] = s.nrm[(j * s.w + i) * 3 + 1]; n[2] = s.nrm[(j * s.w + i) * 3 + 2];
    const [r, g, b] = shade(unpack(c), n, wx, foot, z, 1 - shadowHere * .92 * Math.max(0, 1 - z / 30), sun, lamps);
    screen[sy * VW + sx] = finish(r, g, b, wx, wy, sun);
  }
}

// ── what moves: water, the waterfall, the aurora, fireflies, chimney smoke, motes and butterflies ───────────────────
function addAt(x, y, cx, cy, r, g, b, k = 1) {
  const sx = Math.round(x) - cx, sy = Math.round(y) - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) return;
  const i = sy * VW + sx, [R, G2, B] = unpack(screen[i]); screen[i] = pack(R + r * k | 0, G2 + g * k | 0, B + b * k | 0);
}
function blendAt(x, y, cx, cy, r, g, b, a) {
  const sx = Math.round(x) - cx, sy = Math.round(y) - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) return;
  const i = sy * VW + sx, [R, G2, B] = unpack(screen[i]); screen[i] = pack(R + (r - R) * a | 0, G2 + (g - G2) * a | 0, B + (b - B) * a | 0);
}
function liveLayers(cx, cy, t) {
  const sun = S.sun, night = sun.night;
  for (let sy = 0; sy < VH; sy++) for (let sx = 0; sx < VW; sx++) {
    const x = cx + sx, y = cy + sy, i = y * W + x, m = S.mat[i]; if ((m !== 4 && m !== 6) || S.owner[i] >= 0) continue;
    const d = S.wd[i];
    if (S.river && y < S.river) { // the river above the falls runs toward the edge: streaks moving down
      if (hash(x, 0, 7) > .5 && ((y - t * 34 + hash(x, 1) * 80) % 17 + 17) % 17 < 3) addAt(x, y, cx, cy, 150, 190, 185, night ? .15 : .45);
      continue;
    }
    if (S.open[i]) {
      if (!night) {
        const phase = x + Math.floor(y / 2) * 11 - t * 9, lit = ((phase % 31) + 31) % 31 < 3 && hash(Math.floor((x - t * 9) / 31), y >> 1, 4) > .55;
        if (lit) addAt(x, y, cx, cy, 70, 80, 75, .35 + sun.up * .5);
        if (hash(x, y, 33) > .994 && Math.sin(t * 4 + hash(x, y, 34) * 20) > .7) addAt(x, y, cx, cy, 180, 180, 170, sun.up);
      } else {
        const band = Math.sin(x / 52 + Math.sin(y / 31 + t * .3) * 1.6 + y / 90 + t * .18), band2 = Math.sin(x / 33 - y / 64 + 2 - t * .12);
        if (band > .45) addAt(x, y, cx, cy, 16, 90, 64, (band - .45) * 1.2);
        if (band2 > .62) addAt(x, y, cx, cy, 56, 32, 92, (band2 - .62) * 1.6);
        if (hash(x, y, 81) > .996) addAt(x, y, cx, cy, 170, 190, 220, .5 + .5 * Math.sin(t * 3 + hash(x, y, 82) * 30));
      }
    }
    if (!night && d >= 2 && d < 9) {
      const c = Math.sin(x * .35 + t * 1.3 + Math.sin(y * .21 + t * .7) * 2) + Math.sin(y * .4 - t * 1.1 + Math.sin(x * .27 - t * .5) * 2);
      if (c > 1.5) addAt(x, y, cx, cy, 120, 200, 190, (c - 1.5) * 1.6 * (1 - d / 10) * sun.up);
    }
    if (m === 6 && d < 9 && !S.tideE) {
      const p = 1.2 + 3.2 * (.5 + .5 * Math.sin(t * .55 + x / 45 + Math.sin(x / 17) * .6)), rel = d - p;
      if (rel > -.6 && rel < 2.2) { let k = 1 - (rel + .6) / 2.8; if (noise1(x / 7 + t * .25, Math.floor(rel * 2)) < .32) k *= .25; addAt(x, y, cx, cy, 210, 235, 228, k * (night ? .3 : .75)); }
      else if (rel <= -.6) addAt(x, y, cx, cy, 30, 40, 36, night ? .1 : .35);
    }
  }
  if (S.fall) waterfall(cx, cy, t);
  if (S.tideE) { tideLayer(cx, cy, t); crittersDraw(cx, cy, t); }
  if (S.chimney) for (let p = 0; p < 9; p++) {
    const age = ((t * .5 + p / 9) % 1), [x0, y0] = S.chimney, r = 2 + age * 6;
    const x = x0 + Math.sin(age * 4 + p) * 3 + age * 16, y = y0 - age * 46, a = (1 - age) * (night ? .25 : .45), v = night ? 90 : 225;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) blendAt(x + dx, y + dy, cx, cy, v, v, v + 8, a * (1 - Math.hypot(dx, dy) / (r + 1)));
  }
  seasonFall(cx, cy, t, night);
  if (night && litSeason !== 3 && S === farm) {
    for (let k = 0; k < (litSeason === 1 ? 90 : litSeason === 2 ? 30 : 60); k++) {
      const bx = hash(k, 1, 91) * W, by = 7 * T + hash(k, 2, 91) * (H - 14 * T), x = bx + Math.sin(t * .7 + k) * 18 + Math.sin(t * 1.9 + k * 3) * 5, y = by + Math.cos(t * .5 + k * 2) * 12;
      const blink = Math.max(0, Math.sin(t * (1.5 + hash(k, 3) * 2) + k * 7)); if (blink < .1) continue;
      addAt(x, y, cx, cy, 210, 255, 130, blink);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addAt(x + dx, y + dy, cx, cy, 120, 180, 60, blink * .45);
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) addAt(x + dx, y + dy, cx, cy, 70, 110, 40, blink * .2);
    }
  } else if (!night) {
    for (let k = 0; k < 90; k++) {
      const x = (hash(k, 4, 92) * W + t * (4 + hash(k, 5) * 6)) % W, y = (hash(k, 6, 92) * H + Math.sin(t * .6 + k) * 10 + t * 2) % H, i = Math.round(y) * W + Math.round(x);
      if (S.shadow[i] > .4) continue;
      addAt(x, y, cx, cy, 255, 240, 190, .35 * (.5 + .5 * Math.sin(t * 2 + k)));
    }
    for (let k = 0; k < (litSeason === 3 || S !== farm ? 0 : litSeason === 2 ? 2 : 6); k++) {
      const x = hash(k, 7, 93) * W + Math.sin(t * .4 + k) * 40 + Math.sin(t * 1.7 + k) * 6, y = 10 * T + hash(k, 8, 93) * 16 * T + Math.cos(t * .5 + k * 2) * 24, open = Math.sin(t * 14 + k) > 0;
      const col = [[255, 250, 240], [255, 214, 92], [190, 160, 255]][k % 3], wing = open ? [[-2, -1], [-1, -1], [1, -1], [2, -1], [-2, 0], [2, 0]] : [[-1, -1], [1, -1], [-1, 0], [1, 0]];
      for (const [dx, dy] of wing) blendAt(x + dx, y + dy, cx, cy, ...col, .95);
      blendAt(x, y, cx, cy, 60, 40, 40, .9); blendAt(x, y - 1, cx, cy, 60, 40, 40, .9);
    }
  }
}

const snowDay = () => litSeason === 3 && hash(game.day, 3, 17) < .3;
// What drifts down with the season, over everything in view: petals in spring, leaves turning over in autumn, snow in
// winter (flakes near and far: the near ones bigger, faster and swaying more). Placed by time, so nothing is kept.
function seasonFall(cx, cy, t, night) {
  const season = litSeason; if (season === 1) return;
  if (season === 3 && !snowDay()) return; // most winter days are dry and frosty; now and then a light snow
  const count = season === 3 ? 80 : season === 2 ? 46 : 34;
  for (let k = 0; k < count; k++) {
    const near = hash(k, 1, 61), fall = season === 3 ? 9 + near * 16 : season === 2 ? 14 + near * 10 : 7 + near * 6, drift = season === 3 ? 3 : 11;
    const sx = ((hash(k, 2, 61) * (VW + 40) + t * drift + Math.sin(t * (.6 + near) + k) * (4 + near * 8)) % (VW + 40) + VW + 40) % (VW + 40) - 20;
    const sy = ((hash(k, 3, 61) * (VH + 40) + t * fall) % (VH + 40)) - 20;
    const x = cx + sx, y = cy + sy;
    if (season === 3) {
      const v = night ? 150 : 250, a = (night ? .4 : .7) * (.4 + near * .5);
      blendAt(x, y, cx, cy, v, v, v + 5, a);
      if (near > .7) { blendAt(x + 1, y, cx, cy, v, v, v + 5, a * .6); blendAt(x, y + 1, cx, cy, v, v, v + 5, a * .6); }
      continue;
    }
    const turn = Math.sin(t * (2 + near * 3) + k * 1.7), col = season === 2 ? [[214, 92, 40], [236, 156, 52], [196, 64, 40], [242, 200, 90]][k % 4] : [[255, 196, 214], [255, 228, 236], [246, 170, 200]][k % 3];
    const dim = night ? .45 : 1, c = col.map(v => v * dim);
    blendAt(x, y, cx, cy, ...c, .95);
    if (Math.abs(turn) > .35) blendAt(x + Math.sign(turn), y, cx, cy, ...c.map(v => v * .8), .9); // seen flat it is two pixels, edge-on one
    if (season === 2 && turn > .6) blendAt(x, y + 1, cx, cy, ...c.map(v => v * .7), .8);
  }
}

function roomLayers(cx, cy, t) {
  const R = S, night = R.dusk || 0, season = litSeason;
  if (R.fire) {
    const {x: fx, y: fy, w} = R.fire;
    // tongues of flame over the embers, each column its own height and speed
    for (let x = Math.round(fx - w / 2); x < fx + w / 2; x++) {
      const e = 1 - Math.abs(x + .5 - fx) / (w / 2), h = (3 + 11 * e) * (.55 + .45 * noise1(x * .5 + t * 4.4, 3) + .15 * Math.sin(t * 9 + x * 1.3));
      for (let k = 0; k < h; k++) { const f = k / h, c = f < .3 ? [255, 240, 170] : f < .65 ? [255, 166, 64] : [214, 72, 32]; blendAt(x, fy - k, cx, cy, ...c, f > .85 ? .45 : .95); }
    }
    for (let k = 0; k < 7; k++) { const age = (t * .7 + k / 7) % 1, x = fx + Math.sin(k * 7 + t * 1.3) * 6 + (hash(k, 1) - .5) * 12, y = fy - 6 - age * 34; addAt(x, y, cx, cy, 255, 170, 70, (1 - age) * .9); }
    // its light breathing on the floor and the hearth
    const flick = .06 * (Math.sin(t * 11) * .5 + Math.sin(t * 17.3) * .3 + Math.sin(t * 5.1) * .2) + .02;
    for (let y = fy - 6; y < fy + 56; y++) for (let x = fx - 84; x < fx + 84; x++) { const d = Math.hypot(x - fx, (y - fy) * 1.5) / 90; if (d < 1) addAt(x, y, cx, cy, 255, 150, 60, flick * (1 - d) * (1 - d)); }
  }
  // candle flames after dusk
  if (night > .05) for (const [x, y] of R.candles) {
    const f = Math.sin(t * 13 + x) * .5 + .5;
    blendAt(x, y - 1, cx, cy, 255, 236, 170, night * (.5 + f * .5)); addAt(x, y - 2, cx, cy, 255, 200, 120, night * f * .5);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -3]]) addAt(x + dx, y + dy, cx, cy, 255, 170, 80, night * .25);
  }
  if (night > .05) for (const [x, y] of R.twinkles) addAt(x, y, cx, cy, 255, 230, 160, night * .35 * (.5 + .5 * Math.sin(t * 2.6 + x * .7)));
  // through the windows: snow, petals or leaves going by (only where the glass is)
  if (season !== 1 && (season !== 3 || snowDay())) for (const w of R.windows) for (let k = 0; k < (season === 3 ? 8 : 3); k++) {
    const ww = w.x1 - w.x0, hh = w.y1 - w.y0, x = Math.round(w.x0 + ((hash(k, 1, 7) * ww + t * (season === 3 ? 3 : 9) + Math.sin(t + k) * 2) % ww)), y = Math.round(w.y0 + ((hash(k, 2, 7) * hh + t * (season === 3 ? 8 : 6)) % hh));
    if (R.glow[y * W + x] !== 1) continue;
    const c = season === 3 ? [255, 255, 255] : season === 2 ? [230, 120, 40] : [255, 190, 210];
    blendAt(x, y, cx, cy, ...c, night ? .5 : .9);
  }
  // dust turning in the daylight
  if ((R.day || 0) > .3) for (const w of R.windows) for (let k = 0; k < 10; k++) {
    const x = w.x0 + hash(k, 3, 9) * (w.x1 - w.x0) + Math.sin(t * .4 + k) * 6, y = R.wall + 6 + ((hash(k, 4, 9) * 46 + t * 2 + Math.sin(t * .7 + k * 2) * 3) % 46);
    addAt(x, y, cx, cy, 255, 240, 200, R.day * .22 * (.5 + .5 * Math.sin(t * 2 + k)));
  }
}

// ── the tide on the shore: twice a day the sea runs in over the flat and out again; each pixel of the flat knows how
// high it lies (tideE), so the water stands where it lies lower than the tide. The hours of it shift a little each day.
let tideNow = 0, tideWarned = 0;
const TIDE_PERIOD = 12.42;
const tidePhase = day => 2.5 + (day * .84) % TIDE_PERIOD;
function tideAt(day, hour) { return .5 + .46 * Math.cos(2 * Math.PI * (hour - tidePhase(day)) / TIDE_PERIOD); }
/** The next low and high water after now, as clock text, and whether it is going out. */
function tideNext() {
  const h = G.hourOf(game), ph = tidePhase(game.day), k = (h - ph) / TIDE_PERIOD, frac = k - Math.floor(k);
  const toHigh = (1 - frac) * TIDE_PERIOD, toLow = ((1.5 - frac) % 1) * TIDE_PERIOD, clock = t => { const m = Math.round(((h + t) % 24) * 60); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60 / 10) * 10).padStart(2, '0'); };
  return {falling: frac < .5, low: clock(toLow), high: clock(toHigh)};
}
function tideUpdate(dt) {
  tideNow = tideAt(game.day, G.hourOf(game));
  // caught by the water: it carries you up toward the beach
  const i = Math.round(me.y - 2) * W + Math.round(me.x), e = S.tideE[i];
  if (e <= 1 && e < tideNow - .005) {
    const up = (x, y) => S.tideE[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
    const gx = Math.min(1.2, up(me.x + 8, me.y) ) - Math.min(1.2, up(me.x - 8, me.y)), gy = Math.min(1.2, up(me.x, me.y + 8)) - Math.min(1.2, up(me.x, me.y - 8)), l = Math.hypot(gx, gy) || 1;
    me.x += gx / l * 34 * dt; me.y += (gy ? gy / l : -1) * 34 * dt;
    if (performance.now() - tideWarned > 6000) { tideWarned = performance.now(); say('潮水涨上来了！往岸上走。', 'shell'); }
  }
}
// the water over the flat, lit by the hour: clear and pale at its edge, deeper blue-green further in, foam at the line
const TIDE_COL = [[150, 226, 214], [96, 204, 200], [52, 168, 186], [32, 136, 170]];
function tideLayer(cx, cy, t) {
  const E = S.tideE, L = tideNow, night = S.sun.night;
  for (let sy = 0; sy < VH; sy++) for (let sx = 0; sx < VW; sx++) {
    const x = cx + sx, y = cy + sy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x, e = E[i]; if (e > 1 || e < 0 || S.owner[i] >= 0) continue;
    const d = L - e; if (d < -.004) continue;
    const swash = Math.sin(x * .09 + t * 1.4 + Math.sin(y * .05 + t * .6) * 2) * .004;
    if (d < .01 + swash) { if (d > -.004) blendAt(x, y, cx, cy, 236, 255, 248, night ? .35 : .8); continue; } // the foam at the water's edge
    const c = TIDE_COL[Math.min(3, Math.floor(d * 14))], a = Math.min(.92, .5 + d * 3), li = i * 3;
    const v = finish(c[0] * S.light[li], c[1] * S.light[li + 1], c[2] * S.light[li + 2], x, y, S.sun), [r, g, b] = unpack(v);
    blendAt(x, y, cx, cy, r, g, b, a);
    if (!night && d > .03 && ((x + Math.floor(y / 2) * 11 - t * 9) % 31 + 31) % 31 < 2 && hash(Math.floor((x - t * 9) / 31), y >> 1, 4) > .6) addAt(x, y, cx, cy, 60, 70, 66, .4);
  }
}
function tideHud() {
  const box = $('#tide'); if (!box) return;
  box.hidden = scene !== 'shore'; if (box.hidden) return;
  const n = tideNext();
  $('#tidetext').textContent = (n.falling ? '退潮中 · 低潮 ' + n.low : '涨潮中 · 高潮 ' + n.high);
}

// ── creatures on the shore (and the farm's butterflies and fireflies): watch them, and they go in the 见闻录 ─────────
const shoreLife = {gulls: [], crabs: [], pools: [], ready: false};
function shoreSpots() {
  // crabs live where reef meets the flat a little way out; jellies in pools; gulls stand on the dry beach
  const E = shore.tideE, Wd = shore.W, cand = [], pools = [];
  for (let y = 18 * T; y < 30 * T; y += 6) for (let x = 8; x < Wd - 8; x += 6) {
    const i = y * Wd + x, m = shore.mat[i];
    if (m === 11 && E[i] > .25 && E[i] < .7 && (shore.mat[i + 6] === 12 || shore.mat[i - 6] === 12)) cand.push([x, y]);
    if (m === 13 && shore.mat[i + 2] === 13 && shore.mat[i - 2] === 13) pools.push([x, y]);
  }
  shoreLife.crabs = Array.from({length: 6}, (_, k) => { const [x, y] = cand[Math.floor(hash(k, 3, 77) * cand.length)] || [30 * T, 22 * T]; return {hx: x, hy: y, x, y, t: hash(k, 4) * 5, flee: 0, gone: 0}; });
  shoreLife.pools = Array.from({length: 5}, (_, k) => pools[Math.floor(hash(k, 5, 78) * pools.length)]).filter(Boolean);
  shoreLife.gulls = [[9.5, 17.4], [27.8, 16.2], [44.6, 17.6]].map(([tx, ty]) => ({x: tx * T, y: ty * T, away: 0}));
  shoreLife.ready = true;
}
const seal = () => { const h = G.hourOf(game); return h >= 10 && h < 15.5 ? {x: 52.3 * T, y: 32.4 * T} : null; };
function crittersUpdate(dt) {
  if (!shoreLife.ready) return;
  for (const c of shoreLife.crabs) {
    const out = tideNow < shore.tideE[Math.round(c.hy) * W + Math.round(c.hx)] - .04; // only where the water has gone
    c.gone = Math.max(0, c.gone - dt);
    if (!out) { c.flee = 0; continue; }
    const d = Math.hypot(me.x - c.x, me.y - c.y);
    if (d < 22 && !c.gone) { c.flee = .8; c.dir = Math.sign(c.x - me.x) || 1; }
    if (c.flee > 0) { c.flee -= dt; c.x += c.dir * 70 * dt; if (c.flee <= 0) { c.gone = 8; c.x = c.hx; c.y = c.hy; } }
    else { c.t += dt; c.x = c.hx + Math.sin(c.t * .9) * 10; }
  }
  for (const g of shoreLife.gulls) {
    if (g.away > 0) { g.away -= dt; continue; }
    if (Math.hypot(me.x - g.x, me.y - g.y) < 26) { g.away = 25; g.fly = 0; }
  }
}
function crittersDraw(cx, cy, t) {
  if (!shoreLife.ready) return;
  const h = G.hourOf(game), day = h >= 6 && h < 19.5, night = S.sun.night, put = (sp, x, y, a = 1, flip = false) => {
    const ox = Math.round(x - sp.w / 2), oy = Math.round(y - sp.h);
    for (let j = 0; j < sp.h; j++) for (let k = 0; k < sp.w; k++) { const v = sp.px[j * sp.w + (flip ? sp.w - 1 - k : k)]; if (!v) continue; const X = ox + k, Y = oy + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const li = (Y * W + X) * 3, L = S.light; blendAt(X, Y, cx, cy, (v & 255) * L[li] * .95, (v >>> 8 & 255) * L[li + 1] * .95, (v >>> 16 & 255) * L[li + 2], a); }
  };
  if (day) {
    for (const g of shoreLife.gulls) if (g.away <= 0) put(CRITTERS.gullStand, g.x, g.y, 1, hash(Math.floor(t / 3), g.x) > .5);
    for (let k = 0; k < 4; k++) { // gulls riding the wind, their shadows on the sand far below
      const x = ((hash(k, 1, 88) * (W + 200) + t * (18 + k * 4)) % (W + 200)) - 100, y = 3 * T + hash(k, 2, 88) * 9 * T + Math.sin(t * .5 + k) * 12, sp = Math.sin(t * 6 + k * 2) > 0 ? CRITTERS.gullUp : CRITTERS.gullDown;
      for (let j = -3; j <= 3; j++) addAt(x + j, y + 70, cx, cy, -40, -40, -30, .5);
      put(sp, x, y, 1);
    }
  }
  for (const c of shoreLife.crabs) if (tideNow < shore.tideE[Math.round(c.hy) * W + Math.round(c.hx)] - .04 && !c.gone) put(Math.floor(t * (c.flee > 0 ? 14 : 4)) % 2 ? CRITTERS.crabA : CRITTERS.crabB, c.x, c.y, 1);
  const sl = seal(); if (sl) put(CRITTERS.seal, sl.x, sl.y + Math.round(Math.sin(t * .8)), 1);
  if (night) for (const [x, y] of shoreLife.pools) { // jellies glowing in the pools the tide has left
    if (tideNow > shore.tideE[y * W + x] - .02) continue;
    const pulse = .5 + .5 * Math.sin(t * 1.6 + x);
    for (let j = -4; j <= 4; j++) for (let k = -4; k <= 4; k++) { const d = Math.hypot(j, k); if (d < 4.5) addAt(x + k, y + j, cx, cy, 40, 200, 190, (1 - d / 4.5) * .5 * pulse); }
    put(CRITTERS.jelly, x, y + 3, .6 + pulse * .4);
  }
}
/** Watching: face a creature close by and use — it goes in the book. */
function observe() {
  const h = G.hourOf(game), seen = id => { const known = game.lore?.[id]; say(known ? LORE[id].text : '你静静地看了一会儿……'); discover(id); return true; };
  if (h >= 6 && h < 19.5) for (const g of shoreLife.gulls) if (g.away <= 0 && near([g.x, g.y + 2], 30)) { g.away = 25; return seen('gull'); }
  for (const c of shoreLife.crabs) if (!c.gone && tideNow < shore.tideE[Math.round(c.hy) * W + Math.round(c.hx)] - .04 && near([c.x, c.y + 2], 32)) return seen('crab');
  const sl = seal(); if (sl && near([sl.x, sl.y + 2], 44)) return seen('seal');
  if (S.sun.night) for (const [x, y] of shoreLife.pools) if (tideNow < shore.tideE[y * W + x] - .02 && near([x, y + 4], 30)) return seen('jelly');
  return false;
}
function caveVisit() {
  const e = shore.tideE[(SHORE.cave[1] + 4) * W + SHORE.cave[0]];
  if (e <= 1 && tideNow > e - .01) { say('洞口泡在海水里，等退潮吧。'); return; }
  discover('cave'); if (game.lore?.cave && game.lore.cave < game.day) say(LORE.cave.text); else say('洞里黑漆漆的，深处好像有蓝色的光一闪。得带上灯再来。');
}
// the farm's butterflies (day, spring to autumn) and fireflies (warm nights), where liveLayers draws them
function farmCritterNear() {
  const t = performance.now() / 1000, h = G.hourOf(game), [fx, fy] = front();
  if (!S.sun.night) for (let k = 0; k < (litSeason === 3 ? 0 : litSeason === 2 ? 2 : 6); k++) {
    const x = hash(k, 7, 93) * W + Math.sin(t * .4 + k) * 40 + Math.sin(t * 1.7 + k) * 6, y = 10 * T + hash(k, 8, 93) * 16 * T + Math.cos(t * .5 + k * 2) * 24;
    if (Math.hypot(fx - x, fy - y) < 26) return 'butterfly';
  }
  if (S.sun.night && litSeason !== 3) for (let k = 0; k < (litSeason === 1 ? 90 : litSeason === 2 ? 30 : 60); k++) {
    const bx = hash(k, 1, 91) * W, by = 7 * T + hash(k, 2, 91) * (H - 14 * T), x = bx + Math.sin(t * .7 + k) * 18 + Math.sin(t * 1.9 + k * 3) * 5, y = by + Math.cos(t * .5 + k * 2) * 12;
    if (Math.hypot(fx - x, fy - y) < 24) return 'firefly';
  }
  return null;
}
function observeFarm() { const id = farmCritterNear(); if (!id) return false; const known = game.lore?.[id]; say(known ? LORE[id].text : '你静静地看了一会儿……'); discover(id); return true; }
let farmWatchT = 0;
function farmCrittersWatch() { /* butterflies and fireflies are watched on purpose (use), nothing to do each frame */ farmWatchT++; }

// ── the 见闻录: a page for each thing first seen or found ──────────────────────────────────────────────────────────────
function discover(id) {
  if (!LORE[id]) return;
  game.lore ??= {};
  if (game.lore[id]) return;
  game.lore[id] = game.day; store();
  const box = $('#toasts'), t = document.createElement('div'); t.className = 'toast frame lore';
  t.append(iconCanvas('book'), document.createTextNode('见闻录 · 新的一页：' + LORE[id].name)); box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  t.timer = setTimeout(() => leave(t), 3600);
  for (let k = 0; k < 10; k++) effects.push({x: me.x + (Math.random() - .5) * 14, y: me.y - 26, vx: (Math.random() - .5) * 30, vy: -10 - Math.random() * 20, life: .7 + Math.random() * .4, col: [255, 236, 150]});
}
const loreView = {kind: '全部', picked: null};
function lorePaint() {
  const known = game.lore || {}, ids = LORE_IDS.filter(id => loreView.kind === '全部' || LORE[id].kind === loreView.kind);
  $('#lorecount').textContent = `已记下 ${Object.keys(known).filter(id => LORE[id]).length} / ${LORE_IDS.length}`;
  const cats = $('#lorecats'); cats.innerHTML = '';
  for (const k of ['全部', ...LORE_KINDS]) { const b = document.createElement('button'); b.className = 'wood' + (k === loreView.kind ? ' on' : ''); b.textContent = k; b.addEventListener('pointerdown', e => { e.preventDefault(); loreView.kind = k; lorePaint(); }); cats.append(b); }
  const grid = $('#loregrid'); grid.innerHTML = '';
  for (const id of ids) {
    const L = LORE[id], has = !!known[id], b = document.createElement('button'); b.className = 'card well' + (has ? '' : ' unknown') + (loreView.picked === id ? ' on' : '');
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 36; drawLoreArt(cv, L.art(), has);
    const name = document.createElement('span'); name.textContent = has ? L.name : '？？？';
    b.append(cv, name);
    b.addEventListener('pointerdown', e => { e.preventDefault(); loreView.picked = id; loreShow(id); for (const c of grid.children) c.classList.toggle('on', c === b); });
    b.dataset.id = id; grid.append(b);
  }
  loreShow(loreView.picked);
}
function loreShow(id) {
  const info = $('#loreinfo'), L = LORE[id];
  if (!L) { info.textContent = '走走看看，靠近按使用来观察。这些见闻以后可以交给知识库。'; return; }
  info.textContent = game.lore?.[id] ? `【${L.kind}】${L.name}：${L.text}` : `【${L.kind}】还没发现。线索：${L.hint}`;
}
// a picture in a card: the art scaled down to fit (pixels kept), a dark shape while it is still unknown
function drawLoreArt(cv, a, has) {
  const c = cv.getContext('2d'), img = c.createImageData(cv.width, cv.height), out = new Uint32Array(img.data.buffer);
  const k = Math.min(1, (cv.width - 4) / a.w, (cv.height - 4) / a.h), s = Math.max(1, Math.floor(Math.min((cv.width - 4) / a.w, (cv.height - 4) / a.h))), scale = k < 1 ? k : s;
  const w = Math.round(a.w * scale), h = Math.round(a.h * scale), ox = (cv.width - w) >> 1, oy = (cv.height - h) >> 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = a.px[Math.floor(y / scale) * a.w + Math.floor(x / scale)]; if (!v) continue; out[(oy + y) * cv.width + ox + x] = has ? v : 0xff3a2e28; }
  c.putImageData(img, 0, 0);
}
for (const b of document.querySelectorAll('#menu .tabs button')) if (b.dataset.pane === 'lore') b.addEventListener('pointerdown', () => lorePaint());

// ── the waterfall: a sheet curving over the edge, widening as it falls, each strand at its own speed; foam churning at
// its foot and spray thrown up. Lit by the light map like everything else, and a little by itself.
const noise1 = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, s, 41) * (1 - u) + hash(i + 1, s, 41) * u; };
const FALL = ['#2aa6b4', '#3fbfc0', '#7fdfda', '#b8f2ee', '#f4fffd'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const spray = [];
let sprayTime = 0;
function waterfall(cx, cy, t) {
  const mid = 45.5 * T, top = 4 * T - 3, base = 7 * T + 2, sun = S.sun, self = sun.night ? .2 : .42;
  const put = (x, y, c, a = 1) => {
    const sx = x - cx, sy = y - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) return;
    const i = y * W + x, L = S.light, k = [L[i * 3] + self, L[i * 3 + 1] + self, L[i * 3 + 2] + self], v = finish(c[0] * k[0], c[1] * k[1], c[2] * k[2], x, y, sun);
    if (a >= 1) { screen[sy * VW + sx] = v; return; }
    const [r, g, b] = unpack(screen[sy * VW + sx]), [R, G2, B] = unpack(v); screen[sy * VW + sx] = pack(r + (R - r) * a | 0, g + (G2 - g) * a | 0, b + (B - b) * a | 0);
  };
  for (let y = top; y < base + 4; y++) {
    // narrower where it leaves the edge, spreading as it falls; each side ragged on its own
    const f = (y - top) / (base - top), spread = 12 + Math.pow(f, .7) * 13;
    const hl = spread + (noise1(y * .18 + t * 1.6, 7) - .5) * 4, hr = spread + (noise1(y * .18 - t * 1.4, 8) - .5) * 4;
    for (let x = Math.floor(mid - hl - 2); x <= mid + hr + 2; x++) {
      const hw = x < mid ? hl : hr, dx = (x - mid) / hw, edge = Math.abs(dx);
      if (edge > 1.06) continue;
      // the lip: water curving over the edge toward us, brightest there
      const lip = top + 5 - (1 - dx * dx) * 5;
      if (y < lip) continue;
      const speed = 62 + hash(x, 0, 51) * 46, v = ((y - t * speed + hash(x, 1, 51) * 300) % 19 + 19) % 19, dark = hash(x >> 1, 2, 51) < .16;
      let c = v < 3 ? FALL[4] : v < 8 ? FALL[3] : dark ? FALL[0] : FALL[2];
      if (edge > .82) c = v < 3 ? FALL[3] : FALL[1];
      if (y < lip + 2) c = FALL[4];
      put(x, y, c, edge > 1 ? .5 : edge > .92 ? .8 : 1);
    }
  }
  // foam churning at the foot
  for (let y = base - 2; y < base + 14; y++) for (let x = Math.floor(mid - 34); x <= mid + 34; x++) {
    const d = Math.hypot((x - mid) / 1.5, y - base - 3) / 22; if (d > 1) continue;
    const n = noise1(x * .35 + Math.sin(t * 2 + y) * .8, y + Math.floor(t * 6)), k = (1 - d) * 1.3;
    if (n * k > .48) put(x, y, n * k > .7 ? FALL[4] : FALL[3], Math.min(1, n * k));
  }
  // spray thrown up from the foot
  sprayTime += 1 / 60;
  while (sprayTime > .006) { sprayTime -= .006; if (spray.length < 280) spray.push({x: mid + (Math.random() - .5) * 52, y: base + Math.random() * 5, vx: (Math.random() - .5) * 70, vy: -40 - Math.random() * 80, life: .4 + Math.random() * .5, big: Math.random() > .7}); }
  for (const p of spray) {
    p.x += p.vx / 60; p.y += p.vy / 60; p.vy += 190 / 60; p.life -= 1 / 60; if (p.life <= 0) continue;
    const c = p.life > .35 ? FALL[4] : FALL[3], a = Math.min(1, p.life * 2.5), x = Math.round(p.x), y = Math.round(p.y);
    put(x, y, c, a); if (p.big) { put(x + 1, y, c, a * .7); put(x, y + 1, c, a * .5); }
  }
  for (let i = spray.length - 1; i >= 0; i--) if (spray[i].life <= 0) spray.splice(i, 1);
}

// ── the world map: the land inside the barrier, its regions, towns and ways; you are at 鲸湾's edge ────────────────
const mapImg = new Image(); mapImg.src = new URL('./worldmap.png', import.meta.url).href; mapImg.onload = () => { if (menu.open) mapPaint(); };
const KINDS = {
  city: {label: '城市', size: 5, fill: '#ffd45c', show: 0}, port: {label: '港口', size: 4, fill: '#8fd4f0', show: 0}, town: {label: '城镇', size: 3, fill: '#fff3d6', show: 2.4},
  landmark: {label: '地标', size: 3, fill: '#d2b0ff', shape: 'diamond', show: 3.2}, peak: {label: '山峰', size: 4, fill: '#f2ece0', shape: 'tri', show: 2},
  pass: {label: '山口', size: 3, fill: '#e0c89a', shape: 'diamond', show: 3.2}, pass2: {label: '山口', size: 3, fill: '#e0c89a', shape: 'diamond', show: 3.2},
  grey: {label: '灰区', size: 4, fill: '#a4a4b0', ring: true, show: 1.6}, black: {label: '黑区', size: 4, fill: '#6a2a3e', ring: true, show: 2.4},
  sacred: {label: '圣地', size: 3, fill: '#9ae6aa', show: 2.4}, forbidden: {label: '禁区', size: 4, fill: '#e05a50', shape: 'x', show: 2.4},
  lake: {label: '湖泊', text: '#c8eeff', show: 1.8}, range: {label: '山脉', text: '#f2e6d0', show: 1}, sea: {label: '海域', text: '#bfe2f2', big: true, show: 0}, fogbelt: {label: '迷雾带', text: '#d8dde8', big: true, show: 0},
};
const LANE = {sea: '#bfe6f2', ferry: '#bfe6f2', river: '#8fd0f0', road: '#f2dca0', rail: '#e0e0e8', ride: '#e8cc90', walk: '#d8c8a8', air: '#ffffff'};
const home = MAP.PLACES.find(p => p.id === 'whalebay'), HOME = home ? [home.at[0] + 5, home.at[1] + 2] : [MAP.SIZE / 2, MAP.SIZE / 2];
const mapView = {z: 2.2, x: HOME[0], y: HOME[1], pick: null};
function mapPaint() {
  const cv = $('#worldmap'), box = cv.getBoundingClientRect(); if (!box.width) return;
  const dpr = devicePixelRatio || 1, w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const c = cv.getContext('2d'), k = mapView.z * Math.min(w, h) / MAP.SIZE, ox = w / 2 - mapView.x * k, oy = h / 2 - mapView.y * k, at = (x, y) => [ox + x * k, oy + y * k];
  c.imageSmoothingEnabled = false; c.fillStyle = '#16384e'; c.fillRect(0, 0, w, h);
  if (mapImg.complete) c.drawImage(mapImg, ox, oy, MAP.SIZE * k, MAP.SIZE * k);
  c.lineWidth = Math.max(1, dpr * Math.min(1.6, mapView.z * .45)); c.globalAlpha = .7;
  for (const l of MAP.LANES) {
    c.strokeStyle = LANE[l.mode] || '#ffffff'; c.setLineDash(l.mode === 'sea' || l.mode === 'ferry' || l.mode === 'air' ? [3 * dpr, 3 * dpr] : []);
    c.beginPath(); for (let i = 0; i < l.pts.length; i += 2) { const [x, y] = at(l.pts[i] + .5, l.pts[i + 1] + .5); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  }
  c.setLineDash([]); c.globalAlpha = 1; c.textAlign = 'center'; c.lineJoin = 'round';
  const font = (px, bold = true) => `${bold ? 'bold ' : ''}${Math.round(px * dpr)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const label = (text, x, y, size, fill, stroke = 'rgba(40,24,14,.85)') => { c.font = font(size); c.lineWidth = 3 * dpr; c.strokeStyle = stroke; c.strokeText(text, x, y); c.fillStyle = fill; c.fillText(text, x, y); };
  if (mapView.z < 3) for (const r of MAP.REGIONS) { const [x, y] = at(r.x, r.y); c.globalAlpha = Math.min(1, (3 - mapView.z) * 1.2) * .8; label(r.name, x, y, 15, '#fff6e0'); c.globalAlpha = 1; }
  for (const p of MAP.PLACES) {
    const K = KINDS[p.kind]; if (!K || mapView.z < K.show) continue;
    const [x, y] = at(p.at[0] + .5, p.at[1] + .5);
    if (K.text) { c.font = font(K.big ? 13 : 11, !K.big); c.globalAlpha = K.big ? .75 : .95; label(p.name, x, y, K.big ? 14 : 11, K.text, 'rgba(20,40,60,.6)'); c.globalAlpha = 1; continue; }
    const s = K.size * dpr * (mapView.z > 4 ? 1.3 : 1), picked = mapView.pick === p;
    c.fillStyle = '#2a1a12'; c.strokeStyle = '#2a1a12';
    if (K.shape === 'diamond' || K.shape === 'tri' || K.shape === 'x') {
      c.beginPath();
      if (K.shape === 'diamond') { c.moveTo(x, y - s - 1); c.lineTo(x + s + 1, y); c.lineTo(x, y + s + 1); c.lineTo(x - s - 1, y); }
      else if (K.shape === 'tri') { c.moveTo(x, y - s - 2); c.lineTo(x + s + 2, y + s + 1); c.lineTo(x - s - 2, y + s + 1); }
      else { c.lineWidth = 2.6 * dpr; c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.moveTo(x + s, y - s); c.lineTo(x - s, y + s); c.stroke(); c.lineWidth = 1.4 * dpr; c.strokeStyle = K.fill; c.stroke(); }
      if (K.shape !== 'x') { c.closePath(); c.fill(); c.fillStyle = K.fill; c.beginPath(); const t = s - dpr; if (K.shape === 'diamond') { c.moveTo(x, y - t - 1); c.lineTo(x + t + 1, y); c.lineTo(x, y + t + 1); c.lineTo(x - t - 1, y); } else { c.moveTo(x, y - t - 1); c.lineTo(x + t + 1, y + t); c.lineTo(x - t - 1, y + t); } c.closePath(); c.fill(); }
    } else { c.fillRect(x - s - dpr, y - s - dpr, (s + dpr) * 2, (s + dpr) * 2); c.fillStyle = K.fill; c.fillRect(x - s, y - s, s * 2, s * 2); if (K.ring) { c.fillStyle = '#2a1a12'; c.fillRect(x - dpr, y - dpr, dpr * 2, dpr * 2); } }
    if (picked) { c.strokeStyle = '#d8343f'; c.lineWidth = 2 * dpr; c.strokeRect(x - s - 4 * dpr, y - s - 4 * dpr, (s + 4 * dpr) * 2, (s + 4 * dpr) * 2); }
    if (picked || p.kind === 'city' || mapView.z >= K.show + .8) label(p.name, x, y - s - 5 * dpr, p.kind === 'city' ? 13 : 11, p.kind === 'city' ? '#fff0b0' : '#fff8ea');
  }
  if (using === 'gamepad' || using === 'keyboard') { c.fillStyle = 'rgba(255,248,230,.85)'; c.fillRect(w / 2 - 6 * dpr, h / 2 - dpr / 2, 12 * dpr, dpr); c.fillRect(w / 2 - dpr / 2, h / 2 - 6 * dpr, dpr, 12 * dpr); }
  // you are here: a red pin at the edge of 鲸湾
  const [hx, hy] = at(HOME[0] + .5, HOME[1] + .5), b = Math.sin(performance.now() / 300) * dpr;
  c.fillStyle = '#2a1a12'; c.beginPath(); c.arc(hx, hy - 9 * dpr + b, 5.5 * dpr, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(hx - 4 * dpr, hy - 7 * dpr + b); c.lineTo(hx, hy + b); c.lineTo(hx + 4 * dpr, hy - 7 * dpr + b); c.fill();
  c.fillStyle = '#e2404f'; c.beginPath(); c.arc(hx, hy - 9 * dpr + b, 4 * dpr, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd2d6'; c.fillRect(hx - 2 * dpr, hy - 11 * dpr + b, 1.5 * dpr, 1.5 * dpr);
  const p = mapView.pick;
  $('#mapinfo').textContent = p ? `${p.name} · ${KINDS[p.kind]?.label || ''}${MAP.REGION_NAMES[p.region] ? ' · ' + MAP.REGION_NAMES[p.region] : ''}` : '你在这里：鲸湾郊外的农场（沿海环带 · 鲸湾城外）';
}
const mapScale = () => { const r = $('#worldmap').getBoundingClientRect(); return mapView.z * Math.min(r.width, r.height) / MAP.SIZE; };
const clampView = () => { mapView.x = Math.max(0, Math.min(MAP.SIZE, mapView.x)); mapView.y = Math.max(0, Math.min(MAP.SIZE, mapView.y)); };
/** Keys and pads on the map: move it (screen pixels), zoom round the centre, pick the place nearest the centre. */
function mapPanBy(dx, dy) { const k = mapScale() || 1; mapView.x += dx / k; mapView.y += dy / k; clampView(); mapPaint(); }
const mapNudge = dir => mapPanBy(dir === 'left' ? -24 : dir === 'right' ? 24 : 0, dir === 'up' ? -24 : dir === 'down' ? 24 : 0);
function mapZoom(f) { mapView.z = Math.max(1, Math.min(9, mapView.z * f)); mapPaint(); }
function mapPickCentre() {
  const k = mapScale() || 1; let best = null, bd = 16 / k;
  for (const p of MAP.PLACES) { const K = KINDS[p.kind]; if (!K || mapView.z < K.show) continue; const d = Math.hypot(p.at[0] + .5 - mapView.x, p.at[1] + .5 - mapView.y); if (d < bd) { bd = d; best = p; } }
  mapView.pick = best; mapPaint();
}
{
  const cv = $('#worldmap'), drag = {id: null, x: 0, y: 0, moved: 0}, scale = mapScale;
  const zoom = (f, px, py) => { const r = cv.getBoundingClientRect(), k0 = scale(), z = Math.max(1, Math.min(9, mapView.z * f)); const mx = mapView.x + (px - r.width / 2) / k0, my = mapView.y + (py - r.height / 2) / k0; mapView.z = z; const k1 = scale(); mapView.x = mx - (px - r.width / 2) / k1; mapView.y = my - (py - r.height / 2) / k1; clampView(); mapPaint(); };
  cv.addEventListener('pointerdown', e => { drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (e.pointerId !== drag.id) return; const k = scale(); mapView.x -= (e.clientX - drag.x) / k; mapView.y -= (e.clientY - drag.y) / k; drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; clampView(); mapPaint(); });
  cv.addEventListener('pointerup', e => {
    if (e.pointerId !== drag.id) return; drag.id = null; if (drag.moved > 6) return;
    const r = cv.getBoundingClientRect(), k = scale(), mx = mapView.x + (e.clientX - r.left - r.width / 2) / k, my = mapView.y + (e.clientY - r.top - r.height / 2) / k;
    let best = null, bd = 14 / k; for (const p of MAP.PLACES) { const K = KINDS[p.kind]; if (!K || mapView.z < K.show) continue; const d = Math.hypot(p.at[0] + .5 - mx, p.at[1] + .5 - my); if (d < bd) { bd = d; best = p; } }
    mapView.pick = best; mapPaint();
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); const r = cv.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.25 : .8, e.clientX - r.left, e.clientY - r.top); }, {passive: false});
  for (const b of document.querySelectorAll('#menu .zoom button')) b.addEventListener('pointerdown', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); if (b.dataset.z === 'home') { mapView.x = HOME[0]; mapView.y = HOME[1]; mapView.z = 3; mapView.pick = null; mapPaint(); } else zoom(b.dataset.z === '1' ? 1.5 : 1 / 1.5, r.width / 2, r.height / 2); });
  addEventListener('resize', () => { if (menu.open) mapPaint(); });
}

// ── the screen's words and tools ────────────────────────────────────────────────────────────────────────────────────
// The dial: the sky of the hour in a half disc, the sun (or the moon) travelling its arc from 6:00 to 2:00.
const dial = $('#dial').getContext('2d');
function drawDial() {
  const h = G.hourOf(game), f = Math.max(0, Math.min(1, (h - 6) / 20)), Wd = 40, Hd = 22;
  const sky = h < 7 ? ['#f2a86a', '#7a7ac0'] : h < 17 ? ['#8fd0f4', '#4f9bd6'] : h < 19.5 ? ['#f6a27a', '#8a6ab8'] : ['#2a2f6a', '#141634'];
  const g = dial.createLinearGradient(0, 0, 0, Hd); g.addColorStop(0, sky[1]); g.addColorStop(1, sky[0]);
  dial.fillStyle = g; dial.fillRect(0, 0, Wd, Hd);
  const night = h >= 19.5 || h < 6.5;
  if (night) { dial.fillStyle = '#e8ecff'; for (const [x, y] of [[6, 6], [13, 3], [24, 5], [33, 8], [18, 9], [29, 2]]) dial.fillRect(x, y, 1, 1); }
  // the arc and the body on it
  const a = Math.PI * (1 - f), x = Math.round(20 + Math.cos(a) * 15), y = Math.round(19 - Math.sin(a) * 15);
  dial.fillStyle = 'rgba(255,255,255,.28)'; for (let k = 0; k <= 30; k++) { const b = Math.PI * k / 30; dial.fillRect(Math.round(20 + Math.cos(b) * 15), Math.round(19 - Math.sin(b) * 15), 1, 1); }
  dial.fillStyle = night ? '#f4f1d8' : '#ffd45c';
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) dial.fillRect(x + dx, y + dy, 1, 1);
  if (night) { dial.fillStyle = sky[1]; dial.fillRect(x + 1, y - 2, 2, 3); }
  else { dial.fillStyle = '#fff6c0'; dial.fillRect(x - 1, y - 1, 1, 1); }
  // the ground: grass, or snow in winter
  dial.fillStyle = ['#5fae4c', '#4f9a3c', '#c98a3a', '#8a9878'][G.seasonOf(game)]; dial.fillRect(0, Hd - 3, Wd, 3);
  dial.fillStyle = 'rgba(0,0,0,.25)'; dial.fillRect(0, Hd - 3, Wd, 1);
}
let toolTimer = 0;
function showTool() { const el = $('#tool'), it = G.held(game); el.textContent = it ? G.ITEMS[it.id].name + (it.n > 1 ? ' ×' + it.n : '') : '空手'; el.classList.add('on'); clearTimeout(toolTimer); toolTimer = setTimeout(() => el.classList.remove('on'), 1200); }
let shownSeason = -1, shownSelected = -1;
function hud() {
  if (!game) return;
  $('#date').textContent = G.dateText(game); $('#clock').textContent = G.clockText(game); $('#money').textContent = game.money.toLocaleString('en-US');
  if (!$('#coin').firstChild) $('#coin').append(iconCanvas('coin'));
  const season = G.seasonOf(game);
  if (season !== shownSeason) { shownSeason = season; $('#season').replaceChildren(iconCanvas(seasonIcon(season))); }
  drawDial(); tideHud();
  const bar = $('#bar');
  if (!bar.children.length) for (let i = 0; i < G.HAND; i++) {
    const b = document.createElement('button'); b.className = 'slot';
    const key = document.createElement('span'); key.className = 'key'; key.textContent = (i + 1) % 10;
    const n = document.createElement('span'); n.className = 'count';
    const pic = document.createElement('span'); pic.className = 'pic';
    const m = document.createElement('span'); m.className = 'meter'; m.append(document.createElement('i'));
    b.append(pic, key, n, m);
    b.addEventListener('pointerdown', e => { e.preventDefault(); select(i); }); bar.append(b);
  }
  [...bar.children].forEach((b, i) => {
    const it = game.inv[i], d = it ? G.ITEMS[it.id] : null;
    b.classList.toggle('on', i === game.selected);
    b.classList.toggle('off', !!d?.crop && !G.inSeason(d.crop, season));
    if (b.dataset.id !== (it?.id || '')) { b.dataset.id = it?.id || ''; b.querySelector('.pic').replaceChildren(...(it ? [itemIcon(it.id)] : [])); b.title = d?.name || ''; }
    b.querySelector('.count').textContent = it && it.n > 1 ? it.n : '';
    b.querySelector('.meter').style.display = it?.id === 'can' ? '' : 'none';
    if (it?.id === 'can') b.querySelector('.meter i').style.width = game.water / G.canSize * 100 + '%';
  });
  const heldKey = game.selected + '|' + (G.held(game)?.id || '');
  if (heldKey !== shownSelected) { if (shownSelected !== -1) showTool(); shownSelected = heldKey; }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  stepRoomLight();
  update(dt); draw(now / 1000); requestAnimationFrame(loop);
}
function fit() {
  const box = $('#stage'), w = box.clientWidth, h = box.clientHeight;
  let k = Math.min(w / VW, h / VH); if (k >= 1) k = Math.max(1, Math.floor(k * 4) / 4);
  canvas.style.width = VW * k + 'px'; canvas.style.height = VH * k + 'px';
}
addEventListener('resize', fit); fit();
$('#full').onclick = () => { const el = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); };
$('#reset').onclick = () => { if (confirm('重新开始一局吗？现在的进度会清掉。')) { localStorage.removeItem('antarctic-farm-v1'); location.search = ''; } };
// inside the tavern (ST-iPhonie's 大游戏): a way back, saving first
if (parent !== window) { $('#leaveRow').hidden = false; $('#leave').onclick = () => { if (game) store(); parent.postMessage({type: 'st-iphonie-game:close'}, location.origin); }; }
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
setTimeout(() => boot().catch(e => { $('#loading').textContent = '准备失败：' + e.message; }), 30);
