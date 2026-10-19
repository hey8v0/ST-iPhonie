// 南极结界 · 鲸湾郊外: the first playable farm. The scene is prepared once and lit for the hour a little at a time as the
// clock runs; the farm (soil, water on it, what grows) and the people are drawn over it every frame with the same light.
// Keyboard (arrows / WASD, Space or E to use, 1–7 or Q / wheel for tools, Esc / I for the menu), touch (drag to walk, the
// round button to use, tap a tool), gamepad (stick, A to use, LB / RB for tools, Start for the menu) — whichever was used last.
import {finish, person, W, H, T} from './farm.js';
import {shade, shadowStep, markSprite} from './light.js';
import {cropStage} from './assets.js';
import * as G from './game.js';
import {iconCanvas, toolIcon, seasonIcon} from './icons.js';

const VW = 320, VH = 180, SPEED = 66;
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
let S = null, game = null, lightVersion = 0, relighting = null, litHour = 0, litSeason = -1;
const me = {x: 0, y: 0, dir: 'down', t: 0, moving: false, busy: 0};
// the world is prepared and lit in the background (world.worker.js); here we only ask and swap in what comes back
const worker = new Worker(new URL('./world.worker.js', import.meta.url), {type: 'module'});
const waiting = new Map(); let asked = 0;
worker.onmessage = e => { const w = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.error) { console.error(e.data.error); w?.reject(Error(e.data.error)); } else w?.resolve(e.data); };
const ask = (type, data = {}) => new Promise((resolve, reject) => { const id = ++asked; waiting.set(id, {resolve, reject}); worker.postMessage({id, type, ...data}); });
async function prepareSeason(season) { const got = await ask('prepare', {season}); S = {...got, sun: S?.sun, lamps: S?.lamps}; S.open = null; litSeason = season; }
async function relight(hour) {
  const got = await ask('light', {hour});
  Object.assign(S, {px: got.px, light: got.light, shadow: got.shadow, sun: got.sun, lamps: got.lamps});
  litHour = hour; lightVersion++; afterLight();
}
function afterLight() {
  // open water (water all round, 3 px each way) is where glints and the aurora show
  if (!S.open) { const m = S.mat, water = i => m[i] === 4 || m[i] === 6; S.open = new Uint8Array(W * H); for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) { const i = y * W + x; S.open[i] = water(i) && water(i - 3) && water(i + 3) && water(i - 3 * W) && water(i + 3 * W) && S.owner[i] < 0 ? 1 : 0; } }
  cache.clear();
}
async function boot() {
  game = q.has('new') ? G.newGame(FIELD) : G.load(FIELD);
  if (q.get('h')) game.minutes = Number(q.get('h')) * 60;
  if (q.get('d')) game.day = Number(q.get('d'));
  await prepareSeason(G.seasonOf(game));
  me.x = Number(q.get('x') || 0) * T || S.door[0]; me.y = Number(q.get('y') || 0) * T || S.door[1] + 6;
  if (!free(me.x, me.y)) for (let r = 1; r < 400; r++) { const a = r * 2.4, x = me.x + Math.cos(a) * r * .6, y = me.y + Math.sin(a) * r * .6; if (free(x, y)) { me.x = x; me.y = y; break; } }
  await relight(G.hourOf(game));
  $('#loading').remove();
  hud(); requestAnimationFrame(loop);
}

// ── tiles ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const tileKind = (tx, ty) => { const m = S.mat[(ty * T + 8) * W + tx * T + 8]; return m === 1 ? 'grass' : m === 3 ? 'field' : m === 4 || m === 6 ? 'water' : 'other'; };
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
const select = i => { game.selected = (i + G.TOOLS.length) % G.TOOLS.length; hud(); };
addEventListener('keydown', e => {
  if (!game) return;
  const k = e.key.toLowerCase(); if (using !== 'mouse' || e.key.length > 1 || 'wasd'.includes(k)) using = 'keyboard';
  if (shop.open && (k === 'escape' || k === 'backspace')) { closeShop(); return; }
  if (k === 'escape' || k === 'i') { menu.open ? closeMenu() : openMenu(); return; }
  if (menu.open) { if (k === 'q' || k === 'tab') { menuTab(1); e.preventDefault(); } return; }
  if (shop.open && (k === 'arrowup' || k === 'w' || k === 'arrowdown' || k === 's')) { shopMove(k === 'arrowup' || k === 'w' ? -1 : 1); e.preventDefault(); return; }
  if (k === ' ' || k === 'e' || k === 'j' || k === 'enter') { use(); e.preventDefault(); return; }
  if (k >= '1' && k <= String(G.TOOLS.length)) { select(Number(k) - 1); return; }
  if (k === 'q' || k === 'tab') { select(game.selected + (e.shiftKey ? -1 : 1)); e.preventDefault(); return; }
  if (k === 'n') { game.minutes += 60; return; }
  keys.add(k); if (e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('wheel', e => { if (game && !menu.open && !shop.open) select(game.selected + Math.sign(e.deltaY)); }, {passive: true});
const knob = $('#stick');
const toWorld = e => { const r = canvas.getBoundingClientRect(), cx = Math.round(Math.max(0, Math.min(W - VW, me.x - VW / 2))), cy = Math.round(Math.max(0, Math.min(H - VH, me.y - 16 - VH / 2))); return [cx + (e.clientX - r.left) / r.width * VW, cy + (e.clientY - r.top) / r.height * VH]; };
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
    if (press(9)) { menu.open ? closeMenu() : openMenu(); }
    if (press(1)) { if (shop.open) closeShop(); else if (menu.open) closeMenu(); }
    if (menu.open) { if (press(4)) menuTab(-1); if (press(5)) menuTab(1); continue; }
    if (press(0)) { using = 'gamepad'; use(); }
    if (shop.open) { if (press(12)) shopMove(-1); if (press(13)) shopMove(1); }
    if (press(4)) select(game.selected - 1); if (press(5)) select(game.selected + 1);
    if (press(3)) game.minutes += 60;
    let x = Math.abs(g.axes[0]) > .25 ? g.axes[0] : 0, y = Math.abs(g.axes[1]) > .25 ? g.axes[1] : 0;
    if (g.buttons[14]?.pressed) x = -1; if (g.buttons[15]?.pressed) x = 1; if (g.buttons[12]?.pressed) y = -1; if (g.buttons[13]?.pressed) y = 1;
    if (x || y) { using = 'gamepad'; return {x, y}; }
  }
  return null;
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
const near = p => { if (!p) return false; const [fx, fy] = front(); return Math.hypot(fx - p[0], (fy - (p[1] - 5)) * 1.4) < 17; };
function use() {
  if (!game || me.busy > 0 || fade.on || menu.open) return;
  if (shop.open) { shopBuy(); return; }
  if (near(S.bin)) { const r = G.ship(game); say(r.say, r.done ? 'coin' : null); if (r.done) { burst('harvest', S.bin[0], S.bin[1] - 14); G.save(game); hud(); } return; }
  if (near(S.mailbox)) { openShop(); return; }
  // at the door, facing it: go to bed
  if (Math.hypot(me.x - S.door[0], me.y - S.door[1]) < 18 && me.dir === 'up') { goToBed('回家睡觉，明天见。'); return; }
  const [tx, ty] = facing(), before = game.tiles[tx + ',' + ty]?.crop?.kind, r = G.act(game, tx, ty, {tile: tileKind, free: tileFree});
  say(r.say, r.effect === 'harvest' ? before : r.effect === 'fill' ? 'can' : null);
  if (r.done) { me.busy = .22; burst(r.effect, tx * T + 8, ty * T + 10); G.save(game); hud(); cache.delete(tx + ',' + ty); }
}
function burst(kind, x, y) {
  const col = {dig: [120, 84, 52], water: [150, 220, 255], fill: [150, 220, 255], sow: [90, 60, 40], harvest: [255, 236, 150]}[kind] || [255, 255, 255];
  for (let k = 0; k < 14; k++) effects.push({x, y, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 40, life: .5 + Math.random() * .3, col});
}
const fade = {on: false, k: 0};
function goToBed(text) {
  fade.on = true; say(text);
  const step = () => {
    fade.k = Math.min(1, fade.k + .05); $('#fade').style.opacity = fade.k;
    if (fade.k < 1) return requestAnimationFrame(step);
    const before = G.seasonOf(game);
    G.sleep(game); G.save(game); me.x = S.door[0]; me.y = S.door[1] + 6; me.dir = 'down'; hud();
    const ready = (G.seasonOf(game) !== before ? prepareSeason(G.seasonOf(game)) : Promise.resolve()).then(() => relighting || null).then(() => relight(G.hourOf(game)));
    const back = () => { fade.k = Math.max(0, fade.k - .04); $('#fade').style.opacity = fade.k; if (fade.k > 0) requestAnimationFrame(back); else {
      fade.on = false; say(G.dateText(game) + '，早上好。', seasonIcon(G.seasonOf(game)));
      if (game.income) say('昨天出货收入 ' + game.income + ' 代币', 'coin');
      if (game.withered) say('换季了，' + game.withered + ' 株不合季的作物枯掉了', 'wither');
    } };
    ready.then(() => setTimeout(back, 200));
  };
  step();
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
  $('#shop').classList.add('on'); shopPaint();
}
function closeShop() { shop.open = false; $('#shop').classList.remove('on'); }
function shopMove(d) { shop.at = (shop.at + d + shop.kinds.length) % shop.kinds.length; shopPaint(); }
function purse() { for (const el of document.querySelectorAll('.purse')) el.replaceChildren(iconCanvas('coin'), game.money + ' 代币'); }
function shopPaint() { [...$('#shop .items').children].forEach((r, i) => r.classList.toggle('on', i === shop.at)); purse(); }
function shopBuy(n = 1) { const k = shop.kinds[shop.at]; if (!k) return; const r = G.buy(game, k, n); say(r.say, r.done ? 'packet' : null, k); if (r.done) { G.save(game); hud(); } shopPaint(); }
$('#shop .close').addEventListener('pointerdown', e => { e.preventDefault(); closeShop(); });

// ── the menu: the bag, settings, how to play ───────────────────────────────────────────────────────────────────────
const menu = {open: false};
const PANES = ['bag', 'settings', 'help'];
function openMenu() { if (shop.open || fade.on) return; menu.open = true; bagPaint(); purse(); $('#menu').classList.add('on'); }
function closeMenu() { menu.open = false; $('#menu').classList.remove('on'); }
function showPane(name) {
  for (const el of document.querySelectorAll('#menu [data-pane]')) el.classList.toggle('on', el.dataset.pane === name);
}
function menuTab(d) { const now = PANES.indexOf($('#menu .tabs .on').dataset.pane); showPane(PANES[(now + d + PANES.length) % PANES.length]); }
for (const b of document.querySelectorAll('#menu .tabs button')) b.addEventListener('pointerdown', e => { e.preventDefault(); showPane(b.dataset.pane); });
function bagPaint() {
  const grid = $('#menu .grid'); grid.innerHTML = '';
  const things = [...Object.entries(game.bag).filter(([, n]) => n).map(([k, n]) => [k, n, iconCanvas(k), G.CROPS[k].name]),
    ...Object.entries(game.seeds).filter(([, n]) => n).map(([k, n]) => [k, n, iconCanvas('packet', {crop: k}), G.CROPS[k].seed])];
  if (!things.length) { grid.innerHTML = '<div class="empty">包里空空的</div>'; return; }
  for (const [, n, icon, name] of things) { const s = document.createElement('div'); s.className = 'slot'; s.title = name; const c = document.createElement('span'); c.className = 'count'; c.textContent = n; s.append(icon, c); grid.append(s); }
}
$('#menuBtn').addEventListener('pointerdown', e => { e.preventDefault(); menu.open ? closeMenu() : openMenu(); });
$('#menu .close').addEventListener('pointerdown', e => { e.preventDefault(); closeMenu(); });

// ── moving ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const free = (x, y) => { for (let j = -3; j < 0; j++) for (let i = -4; i < 4; i++) { const X = Math.round(x + i), Y = Math.round(y + j); if (X < 0 || Y < 0 || X >= W || Y >= H || S.solid[Y * W + X]) return false; } return true; };
let lastSaved = 0;
function update(dt) {
  if (!fade.on && !menu.open && !shop.open) {
    game.minutes += dt * G.MINUTES_PER_SECOND;
    if (game.minutes >= G.DAY_END) { goToBed('太晚了……累倒在家门口。'); return; }
    if (Math.floor(game.minutes / 10) !== Math.floor(lastSaved / 10)) { lastSaved = game.minutes; hud(); if (Math.floor(game.minutes) % 60 < 2) G.save(game); }
    if (!relighting && Math.abs(G.hourOf(game) - litHour) >= .25) relighting = relight(G.hourOf(game)).finally(() => { relighting = null; });
  }
  me.busy = Math.max(0, me.busy - dt);
  let {x, y} = wanted(); const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  me.moving = len > .1 && me.busy <= 0 && !fade.on && !shop.open && !menu.open;
  if (me.moving) {
    me.dir = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
    const nx = me.x + x * SPEED * dt, ny = me.y + y * SPEED * dt;
    if (free(nx, me.y)) me.x = nx;
    if (free(me.x, ny)) me.y = ny;
    me.t += dt;
  } else me.t = 0;
  const groundTool = ['hoe', 'can', 'seed'].includes(G.TOOLS[game.selected].id);
  cursor.still = me.moving ? 0 : cursor.still + dt;
  const wantCursor = (using === 'mouse' && mouse.active) || (groundTool && cursor.still > .35);
  cursor.k = Math.max(0, Math.min(1, cursor.k + (wantCursor ? dt * 4 : -dt * 8)));
  for (const p of effects) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt; }
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].life <= 0) effects.splice(i, 1);
}

// ── drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const frames = new Map(), cropArt = new Map(), cache = new Map();
function frame(dir, step) { const key = dir + step; if (!frames.has(key)) frames.set(key, person('hero', {view: dir === 'down' ? 'front' : dir === 'up' ? 'back' : 'side', step, flip: dir === 'right'})); return frames.get(key); }
// a crop's picture by stage (-1: withered)
function art(kind, stage) { const key = kind + stage; if (!cropArt.has(key)) cropArt.set(key, cropStage(G.CROPS[kind].art, stage)); return cropArt.get(key); }
// the light that reaches a ground pixel, times an albedo, finished like the world
const litGround = (alb, x, y) => { const i = y * W + x; return finish(alb[0] * S.light[i * 3], alb[1] * S.light[i * 3 + 1], alb[2] * S.light[i * 3 + 2], x, y, S.sun); };
const SOIL = ['#3a2416', '#4e3120', '#64412a', '#7b5134', '#91623e'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
/** A farm tile's ground, lit: dug soil (on grass), darker when watered, seeds showing when just sown. Cached per light. */
function groundOf(tx, ty, t) {
  const key = tx + ',' + ty, sig = lightVersion + '|' + (t.tilled ? 1 : 0) + (t.wet ? 1 : 0) + (t.crop ? (t.crop.dead ? 'x' : t.crop.stage) : '-');
  const snowy = litSeason === 3, seeded = t.crop && t.crop.stage === 0 && !t.crop.dead;
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
function drawSprite(lit, w, h, ox, oy, foot, cx, cy) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = lit[j * w + i]; if (!c) continue;
    const wx = ox + i, wy = oy + j, sx = wx - cx, sy = wy - cy;
    if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || wy < 0 || wy >= H || S.owner[wy * W + wx] > foot) continue;
    screen[sy * VW + sx] = c;
  }
}
function darkenGround(list, cx, cy, k) {
  for (const i of list) { const x = i % W, y = i / W | 0, sx = x - cx, sy = y - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || S.owner[i] >= 0) continue; const s = sy * VW + sx, [r, g, b] = unpack(screen[s]); screen[s] = pack(r * k[0] | 0, g * k[1] | 0, b * k[2] | 0); }
}
function draw(t) {
  const cx = Math.round(Math.max(0, Math.min(W - VW, me.x - VW / 2))), cy = Math.round(Math.max(0, Math.min(H - VH, me.y - 16 - VH / 2)));
  for (let y = 0; y < VH; y++) screen.set(S.px.subarray((cy + y) * W + cx, (cy + y) * W + cx + VW), y * VW);
  liveLayers(cx, cy, t);
  const sun = S.sun, lift = (sun.L[2] + .5) / 1.5, shadowK = [0, 1, 2].map(c => (sun.sky[c] + sun.sun[c] * lift * .08) / (sun.sky[c] + sun.sun[c] * lift));
  // the farm: ground first, then plants and people sorted by their feet
  const sprites = [];
  const tx0 = Math.floor(cx / T) - 1, tx1 = Math.ceil((cx + VW) / T) + 1, ty0 = Math.floor(cy / T) - 1, ty1 = Math.ceil((cy + VH) / T) + 2;
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const tile = game.tiles[tx + ',' + ty]; if (!tile) continue;
    const g = groundOf(tx, ty, tile);
    for (let ly = 0; ly < T; ly++) for (let lx = 0; lx < T; lx++) { const c = g[ly * T + lx]; if (!c) continue; const sx = tx * T + lx - cx, sy = ty * T + ly - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) screen[sy * VW + sx] = c; }
    if (tile.crop && (tile.crop.stage > 0 || tile.crop.dead)) sprites.push({foot: ty * T + 14, plant: plantOf(tx, ty, tile)});
  }
  if (!sun.night) for (const s of sprites) darkenGround(s.plant.shadowPx, cx, cy, shadowK);
  sprites.push({foot: Math.round(me.y), me: true});
  sprites.sort((a, b) => a.foot - b.foot);
  for (const s of sprites) {
    if (s.plant) { const p = s.plant; drawSprite(p.lit, p.a.w, p.a.h, p.ox, p.oy, p.foot, cx, cy); }
    else drawMe(cx, cy, shadowK);
  }
  // where the tool will land: four soft corners, shown only when you stop with a tool for the ground (or point with the mouse)
  if (!fade.on && cursor.k > .02) {
    const [tx, ty] = facing(), a = .45 * cursor.k;
    for (const [x0, y0, dx, dy] of [[0, 0, 1, 1], [T - 1, 0, -1, 1], [0, T - 1, 1, -1], [T - 1, T - 1, -1, -1]]) for (let k = 0; k < 4; k++) for (const [x, y] of [[tx * T + x0 + dx * k, ty * T + y0], [tx * T + x0, ty * T + y0 + dy * k]]) { const sx = x - cx, sy = y - cy; if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue; const i = sy * VW + sx, [r, g, b] = unpack(screen[i]); screen[i] = pack(r + (255 - r) * a | 0, g + (255 - g) * a | 0, b + (240 - b) * a | 0); }
  }
  for (const p of effects) { const sx = Math.round(p.x) - cx, sy = Math.round(p.y) - cy; if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) screen[sy * VW + sx] = pack(...p.col); }
  ctx.putImageData(image, 0, 0);
}
function drawMe(cx, cy, shadowK) {
  const step = me.moving ? [0, 1, 0, 3][Math.floor(me.t * 8) % 4] : 0, s = frame(me.dir, step);
  const ox = Math.round(me.x - s.fx), oy = Math.round(me.y - s.fy) - (me.busy > .1 ? 1 : 0), foot = Math.round(me.y), px = Math.round(me.x);
  const sun = S.sun, lamps = S.lamps, marks = new Set();
  if (!sun.night) { const st = shadowStep(sun); if (st) { markSprite((x, y) => marks.add(Math.round(y) * W + Math.round(x)), {...s, x: ox, y: oy, foot}, st[0], st[1]); darkenGround(marks, cx, cy, shadowK); } }
  for (const l of lamps) {
    const d = Math.hypot(l.x - px, l.y - foot); if (d > l.r * .9) continue;
    marks.clear(); markSprite((x, y) => marks.add(Math.round(y) * W + Math.round(x)), {...s, x: ox, y: oy, foot}, 0, 0, {x: l.x, y: l.y, z: l.z});
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
    if (y < 4 * T) { // the river above the falls runs toward the edge: streaks moving down
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
    if (m === 6 && d < 9) {
      const p = 1.2 + 3.2 * (.5 + .5 * Math.sin(t * .55 + x / 45 + Math.sin(x / 17) * .6)), rel = d - p;
      if (rel > -.6 && rel < 2.2) { let k = 1 - (rel + .6) / 2.8; if (noise1(x / 7 + t * .25, Math.floor(rel * 2)) < .32) k *= .25; addAt(x, y, cx, cy, 210, 235, 228, k * (night ? .3 : .75)); }
      else if (rel <= -.6) addAt(x, y, cx, cy, 30, 40, 36, night ? .1 : .35);
    }
  }
  waterfall(cx, cy, t);
  if (S.chimney) for (let p = 0; p < 9; p++) {
    const age = ((t * .5 + p / 9) % 1), [x0, y0] = S.chimney, r = 2 + age * 6;
    const x = x0 + Math.sin(age * 4 + p) * 3 + age * 16, y = y0 - age * 46, a = (1 - age) * (night ? .25 : .45), v = night ? 90 : 225;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) blendAt(x + dx, y + dy, cx, cy, v, v, v + 8, a * (1 - Math.hypot(dx, dy) / (r + 1)));
  }
  seasonFall(cx, cy, t, night);
  if (night && litSeason !== 3) {
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
    for (let k = 0; k < (litSeason === 3 ? 0 : litSeason === 2 ? 2 : 6); k++) {
      const x = hash(k, 7, 93) * W + Math.sin(t * .4 + k) * 40 + Math.sin(t * 1.7 + k) * 6, y = 10 * T + hash(k, 8, 93) * 16 * T + Math.cos(t * .5 + k * 2) * 24, open = Math.sin(t * 14 + k) > 0;
      const col = [[255, 250, 240], [255, 214, 92], [190, 160, 255]][k % 3], wing = open ? [[-2, -1], [-1, -1], [1, -1], [2, -1], [-2, 0], [2, 0]] : [[-1, -1], [1, -1], [-1, 0], [1, 0]];
      for (const [dx, dy] of wing) blendAt(x + dx, y + dy, cx, cy, ...col, .95);
      blendAt(x, y, cx, cy, 60, 40, 40, .9); blendAt(x, y - 1, cx, cy, 60, 40, 40, .9);
    }
  }
}

// What drifts down with the season, over everything in view: petals in spring, leaves turning over in autumn, snow in
// winter (flakes near and far: the near ones bigger, faster and swaying more). Placed by time, so nothing is kept.
function seasonFall(cx, cy, t, night) {
  const season = litSeason; if (season === 1) return;
  const count = season === 3 ? 220 : season === 2 ? 46 : 34;
  for (let k = 0; k < count; k++) {
    const near = hash(k, 1, 61), fall = season === 3 ? 9 + near * 16 : season === 2 ? 14 + near * 10 : 7 + near * 6, drift = season === 3 ? 3 : 11;
    const sx = ((hash(k, 2, 61) * (VW + 40) + t * drift + Math.sin(t * (.6 + near) + k) * (4 + near * 8)) % (VW + 40) + VW + 40) % (VW + 40) - 20;
    const sy = ((hash(k, 3, 61) * (VH + 40) + t * fall) % (VH + 40)) - 20;
    const x = cx + sx, y = cy + sy;
    if (season === 3) {
      const v = night ? 150 : 250, a = (night ? .5 : .85) * (.5 + near * .5);
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
  dial.fillStyle = ['#5fae4c', '#4f9a3c', '#c98a3a', '#e6eef8'][G.seasonOf(game)]; dial.fillRect(0, Hd - 3, Wd, 3);
  dial.fillStyle = 'rgba(0,0,0,.25)'; dial.fillRect(0, Hd - 3, Wd, 1);
}
let toolTimer = 0;
function showTool() { const el = $('#tool'); el.textContent = G.TOOLS[game.selected].name; el.classList.add('on'); clearTimeout(toolTimer); toolTimer = setTimeout(() => el.classList.remove('on'), 1200); }
let shownSeason = -1, shownSelected = -1;
function hud() {
  if (!game) return;
  $('#date').textContent = G.dateText(game); $('#clock').textContent = G.clockText(game); $('#money').textContent = game.money.toLocaleString('en-US');
  if (!$('#coin').firstChild) $('#coin').append(iconCanvas('coin'));
  const season = G.seasonOf(game);
  if (season !== shownSeason) { shownSeason = season; $('#season').replaceChildren(iconCanvas(seasonIcon(season))); }
  drawDial();
  const bar = $('#bar');
  if (!bar.children.length) G.TOOLS.forEach((tool, i) => {
    const b = document.createElement('button'); b.className = 'slot'; b.title = tool.name;
    const key = document.createElement('span'); key.className = 'key'; key.textContent = i + 1;
    const n = document.createElement('span'); n.className = 'count';
    b.append(toolIcon(tool), key, n);
    if (tool.id === 'can') { const m = document.createElement('span'); m.className = 'meter'; m.append(document.createElement('i')); b.append(m); }
    b.addEventListener('pointerdown', e => { e.preventDefault(); select(i); }); bar.append(b);
  });
  [...bar.children].forEach((b, i) => {
    const tool = G.TOOLS[i]; b.classList.toggle('on', i === game.selected);
    b.classList.toggle('off', tool.id === 'seed' && !G.inSeason(tool.crop, season));
    b.querySelector('.count').textContent = tool.id === 'seed' ? game.seeds[tool.crop] || 0 : '';
    if (tool.id === 'can') b.querySelector('.meter i').style.width = game.water / G.canSize * 100 + '%';
  });
  if (game.selected !== shownSelected) { if (shownSelected >= 0) showTool(); shownSelected = game.selected; }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
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
if (parent !== window) { $('#leaveRow').hidden = false; $('#leave').onclick = () => { if (game) G.save(game); parent.postMessage({type: 'st-iphonie-game:close'}, location.origin); }; }
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
setTimeout(() => boot().catch(e => { $('#loading').textContent = '准备失败：' + e.message; }), 30);
