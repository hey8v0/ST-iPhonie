// Things that move in the world but are not blocks: dropped items (they fall, bounce, join others of their kind and
// fly to the player when near) and particles (bits of a block flying off when it breaks, splashes).
import {collisionBoxes} from './shapes.js';
import {itemInfo, BLOCKS, ID} from './blocks.js';
import {Verts, mat} from './render.js';
import {LAYER, dialName} from './atlas.js';
import {potionColor} from './brew.js';

const DEFAULT_TINT = {grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4};
// the pictures as they are now (their clear pixels shape a thing's edges), and the things built from them
let atlas = null;
const itemVerts = new Map();
/** The block and item pictures in use (buildLayers'), for the edges of things drawn thick. */
export function setAtlas(built) { atlas = built; itemVerts.clear(); }
/**
 * An item's picture as the game holds it, a sixteenth of a block thick: the picture on both faces, and a thin side along
 * every pixel edge with a clear pixel (or nothing) beyond it, in that pixel's colour (a flat picture seen edge-on was
 * not there at all: a skeleton's bow from in front).
 */
export function thickItem(v, layer, tint, sky, blk) {
  const t = 1 / 32, d = atlas?.layers[layer], n = atlas?.size || 16;
  for (const z of [t, -t]) v.flat(0.5, layer, sky, blk, 256, 32, tint, z);
  if (!d) return;
  const solid = (i, j) => i >= 0 && j >= 0 && i < 16 && j < 16 && d[(Math.floor((j + 0.5) * n / 16) * n + Math.floor((i + 0.5) * n / 16)) * 4 + 3] > 0;
  const quad = (P, UV, f) => { for (const k of [0, 1, 2, 3, 3, 2, 1, 0]) v.v(P[k][0], P[k][1], P[k][2], 256, 32, layer, UV[k][0], UV[k][1], sky, blk, f << 2, tint); };
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    if (!solid(i, j)) continue;
    const x0 = i / 16 - 0.5, x1 = x0 + 1 / 16, y1 = 0.5 - j / 16, y0 = y1 - 1 / 16, across = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]], along = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    // (the side shows its pixel all over: u and v each run across that one pixel)
    if (!solid(i - 1, j)) quad([[x0, y0, -t], [x0, y0, t], [x0, y1, t], [x0, y1, -t]], across, 1);
    if (!solid(i + 1, j)) quad([[x1, y0, t], [x1, y0, -t], [x1, y1, -t], [x1, y1, t]], across, 0);
    if (!solid(i, j - 1)) quad([[x0, y1, t], [x1, y1, t], [x1, y1, -t], [x0, y1, -t]], along, 2);
    if (!solid(i, j + 1)) quad([[x0, y0, -t], [x1, y0, -t], [x1, y0, t], [x0, y0, t]], along, 3);
  }
}
const tintNum = t => t == null ? 0xFFFFFF : t.startsWith('#') ? parseInt(t.slice(1), 16) : DEFAULT_TINT[t];
/**
 * The faces' texture layers of an item as a little cube (or one flat picture): {cube: [6 layers], tints} | {flat, tint,
 * over}. A potion (stack s) is its liquid in its colour with the bottle over it.
 */
export function itemLook(id, s = null) {
  if (s?.pot) return {flat: LAYER.potion_overlay, tint: potionColor(s.pot), over: LAYER[id]};
  const info = itemInfo(id);
  const b = info?.block;
  // a block whose item has its own picture (repeaters, comparators, the hopper, the iron door, the lever)
  if (b?.itemIcon) return {flat: LAYER[b.itemIcon] ?? 0, tint: 0xFFFFFF};
  // blocks show as a small block of what they are made of (a log too, though its side's picture has its name);
  // doors and the like have a flat picture of their own
  const blocky = b && BLOCKY.has(b.shape) && b.tex;
  if (b && !blocky && LAYER[b.name] !== undefined && !b.tex?.all) return {flat: LAYER[b.name], tint: 0xFFFFFF};
  if (blocky) {
    const t = b.tex, L = n => LAYER[n] ?? 0, tint = b.color ? parseInt(b.color.slice(1), 16) : tintNum(b.tint);
    if (t.all) return {cube: Array(6).fill(L(t.all)), tints: Array(6).fill(tint), half: b.shape === 'slab' || b.shape === 'layer' || b.shape === 'carpet'};
    if (b.facing6) { const s = L(t.side), top = L(t.top); return {cube: [s, s, top, top, L(t.front || t.top), s], tints: Array(6).fill(0xFFFFFF)}; }
    const side = L(t.side), front = t.front ? L(t.front) : t.south ? L(t.south) : side, own = k => t[k] ? L(t[k]) : side;
    const grass = b.name === 'grass_block';
    return {cube: [own('east'), own('west'), L(t.top), L(t.bottom), front, own('north')], tints: [grass ? 0xFFFFFF : tint, grass ? 0xFFFFFF : tint, tint, 0xFFFFFF, grass ? 0xFFFFFF : tint, grass ? 0xFFFFFF : tint], half: b.shape === 'slab' || b.shape === 'detector'};
  }
  const name = b ? (b.name === 'wheat' ? 'wheat_stage7' : b.tex?.all || b.tex?.side) : dialName(id) || info?.icon || id;
  return {flat: LAYER[name] ?? 0, tint: b ? tintNum(b.tint) : packed.has(name) && info?.tint ? tintNum(info.tint) : 0xFFFFFF};
}
// the shapes an item shows as a small block of
const BLOCKY = new Set(['cube', 'slab', 'farmland', 'cactus', 'layer', 'stairs', 'fence', 'gate', 'pane', 'trapdoor', 'bed', 'chest', 'enchanting', 'anvil', 'stonewall', 'carpet', 'piston', 'detector']);
/** The names whose picture came from the player's pack (leather from a pack is grey and gets its colour). */
const packed = new Set();
export function setPacked(from) { packed.clear(); for (const [n, f] of Object.entries(from || {})) if (f === 'pack') packed.add(n); }

// the game's orb sizes: an amount of experience is split into orbs of these values
const ORB_VALUES = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];
export const splitXp = n => { const out = []; while (n > 0) { const v = ORB_VALUES.find(k => k <= n); out.push(v); n -= v; } return out; };

export class Entities {
  constructor(world) { this.world = world; this.items = []; this.particles = []; this.orbs = []; this.orbWait = 0; this.verts = new Verts(256); this.pv = new Verts(2048); }
  /** Experience: the amount split into orbs at a place, flying out a little. */
  xp(n, x, y, z) {
    for (const v of splitXp(Math.max(0, Math.round(n)))) { const a = Math.random() * Math.PI * 2; this.orbs.push({v, x, y, z, vx: Math.cos(a) * 0.1, vy: 0.15 + Math.random() * 0.1, vz: Math.sin(a) * 0.1, age: Math.floor(Math.random() * 40)}); }
  }
  /** Orbs drift to a living player within 8 blocks (faster the nearer) and are taken one every two ticks: gain(value). */
  orbTick(player, gain) {
    if (this.orbWait > 0) this.orbWait--;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (++o.age > 6000) { this.orbs.splice(i, 1); continue; }
      const dx = player.x - o.x, dy = player.y + player.eye / 2 - o.y, dz = player.z - o.z, d = Math.hypot(dx, dy, dz) || 1;
      if (!player.dead && d < 8) { const k = (1 - d / 8) ** 2 * 0.1; o.vx += dx / d * k; o.vy += dy / d * k; o.vz += dz / d * k; }
      if (!player.dead && d < 1.3 && !this.orbWait) { gain(o.v); this.orbWait = 2; this.orbs.splice(i, 1); continue; }
      o.vy -= 0.03;
      for (const [k, dk] of [['x', 'vx'], ['y', 'vy'], ['z', 'vz']]) {
        const n = o[k] + o[dk], at = {x: o.x, y: o.y, z: o.z, [k]: n};
        if (this.solidAt(at.x, at.y, at.z)) { o[dk] *= k === 'y' ? -0.2 : -0.3; if (k === 'y') { o.vx *= 0.6; o.vz *= 0.6; } } else o[k] = n;
      }
      o.vx *= 0.98; o.vy *= 0.98; o.vz *= 0.98;
    }
  }
  solidAt(x, y, z) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), bs = collisionBoxes(this.world.get(bx, by, bz));
    return bs && bs.some(b => x >= bx + b[0] && x <= bx + b[3] && y >= by + b[1] && y <= by + b[4] && z >= bz + b[2] && z <= bz + b[5]);
  }
  /** Drops a stack at a place, flying out a little (or thrown along dir). */
  drop(stack, x, y, z, {dir = null, delay = 10} = {}) {
    if (!stack || !stack.n) return;
    const a = Math.random() * Math.PI * 2;
    const v = dir ? [dir[0] * 0.3, dir[1] * 0.3 + 0.1, dir[2] * 0.3] : [Math.cos(a) * 0.06, 0.2, Math.sin(a) * 0.06];
    this.items.push({stack: {...stack}, x, y, z, vx: v[0], vy: v[1], vz: v[2], age: 0, delay, spin: Math.random() * 6});
  }
  /** One tick: items fall and settle, join, and come to the player (who takes them with take(stack) → left over). */
  tick(player, take) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age++; if (it.delay > 0) it.delay--;
      if (it.age > 6000) { this.items.splice(i, 1); continue; }
      const px = player.x, py = player.y + 0.8, pz = player.z, d = Math.hypot(px - it.x, py - it.y, pz - it.z);
      if (it.delay <= 0 && d < 1.6 && !player.dead) {
        const left = take(it.stack);
        if (!left) { this.items.splice(i, 1); this.onPickup?.(it); continue; }
        it.stack = left;
      }
      // in fire or lava a thing burns away (the game's)
      const under = this.world.get(Math.floor(it.x), Math.floor(it.y + 0.1), Math.floor(it.z)) & 0xFFF;
      if (under === ID.lava || under === ID.fire || under === ID.soul_fire) { this.items.splice(i, 1); this.puff(it.x, it.y + 0.3, it.z, 'smoke'); this.onBurn?.(it); continue; }
      // pulled a little toward the player when close
      const inWater = (this.world.get(Math.floor(it.x), Math.floor(it.y), Math.floor(it.z)) & 0xFFF) === BLOCKS.find(b => b.name === 'water').id;
      it.vy -= inWater ? -0.01 : 0.04;
      for (const [k, dk] of [['x', 'vx'], ['y', 'vy'], ['z', 'vz']]) {
        const n = it[k] + it[dk], test = {x: it.x, y: it.y, z: it.z, [k]: n};
        if (this.solidAt(test.x, test.y + (k === 'y' ? 0 : 0.05), test.z)) {
          if (k === 'y' && it.vy < 0) { it.y = Math.floor(it.y + it.vy) + (collisionBoxes(this.world.get(Math.floor(it.x), Math.floor(it.y + it.vy), Math.floor(it.z)))?.[0]?.[4] ?? 1) + 0.0; it.vy *= -0.3; if (Math.abs(it.vy) < 0.05) it.vy = 0; it.vx *= 0.6; it.vz *= 0.6; }
          else it[dk] *= -0.3;
        } else it[k] = n;
      }
      it.vx *= 0.92; it.vz *= 0.92; it.vy *= 0.98;
      if (inWater) { it.vx *= 0.9; it.vz *= 0.9; it.vy *= 0.9; }
      // join a stack of the same nearby
      if (it.age % 10 === 0) for (const o of this.items) if (o !== it && o.stack.id === it.stack.id && !o.stack.dmg && !it.stack.dmg && Math.abs(o.x - it.x) < 1 && Math.abs(o.y - it.y) < 0.6 && Math.abs(o.z - it.z) < 1 && o.stack.n + it.stack.n <= (itemInfo(it.stack.id)?.stack || 64)) { o.stack.n += it.stack.n; it.stack.n = 0; }
      if (!it.stack.n) this.items.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life--; if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy -= p.g; const nx = p.x + p.vx, ny = p.y + p.vy, nz = p.z + p.vz;
      if (!p.air && this.solidAt(nx, ny, nz)) { p.vx *= 0.3; p.vz *= 0.3; p.vy = 0; } else { p.x = nx; p.y = ny; p.z = nz; }
      p.vx *= 0.96; p.vz *= 0.96; p.vy *= 0.98;
    }
  }
  /** Bits of a block flying off (break), or a few (digging). */
  burst(x, y, z, v, n = 24, tint = 0xFFFFFF) {
    const b = BLOCKS[v & 0xFFF], t = b?.tex;
    if (!t) return;
    const layer = LAYER[t.all || t.side] ?? 0;
    for (let i = 0; i < n; i++) {
      const u = Math.floor(Math.random() * 12), w = Math.floor(Math.random() * 12);
      this.particles.push({x: x + 0.1 + Math.random() * 0.8, y: y + 0.1 + Math.random() * 0.8, z: z + 0.1 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.15 + 0.05, vz: (Math.random() - 0.5) * 0.15, g: 0.04, life: 15 + Math.floor(Math.random() * 20), layer, uv: [u, w, u + 4, w + 4], size: 0.07 + Math.random() * 0.05, tint});
    }
  }
  /**
   * Puffs that are not bits of a block: smoke, poof (a mob gone), heart, crit, explosion, meal (bone meal sparkles),
   * potion swirls and a splash potion breaking (in the potion's colour), the portal's sparks, a blaze's flames.
   */
  puff(x, y, z, kind, color = null) {
    const S = {smoke: [4, 0x4a4a4a, 0.02, 0.1, 30, -0.005], poof: [14, 0xdddddd, 0.08, 0.12, 20, -0.01], heart: [6, 0xff3a5a, 0.02, 0.12, 30, -0.004], crit: [10, 0xfff2b0, 0.15, 0.08, 14, 0.02],
      explosion: [40, 0x8a8a8a, 0.35, 0.35, 30, -0.01], meal: [12, 0x7ce05a, 0.06, 0.07, 20, -0.005], magic: [10, 0x9a6aff, 0.12, 0.07, 16, 0.01],
      bubble: [3, 0xd8ecff, 0.02, 0.05, 12, -0.01], splash: [8, 0x9ac8ff, 0.08, 0.05, 14, 0.03], swirl: [1, 0xffffff, 0.03, 0.07, 18, -0.006], shatter: [40, 0xffffff, 0.18, 0.08, 22, 0.01],
      portal: [2, 0xa04cff, 0.08, 0.06, 26, -0.004], note: [1, 0x40ff40, 0.01, 0.13, 14, -0.008], flame: [2, 0xffa020, 0.03, 0.07, 12, -0.008],
      ink: [30, 0x0c0c14, 0.14, 0.16, 34, 0], glow_ink: [30, 0x3ae0c0, 0.14, 0.16, 34, 0],
      bubble_up: [1, 0xe4f2ff, 0.01, 0.05, 26, -0.01], bubble_down: [1, 0xe4f2ff, 0.01, 0.05, 26, 0.012]}[kind];
    if (!S) return;
    const [n, base, spread, size, life, g] = S, tint = color ?? base, layer = LAYER.white_wool ?? 0;
    for (let i = 0; i < n; i++) this.particles.push({x: x + (Math.random() - 0.5) * spread * 4, y: y + (Math.random() - 0.5) * spread * 4, z: z + (Math.random() - 0.5) * spread * 4,
      vx: (Math.random() - 0.5) * spread, vy: Math.random() * spread + 0.02, vz: (Math.random() - 0.5) * spread, g, life: life + Math.floor(Math.random() * 10), layer, uv: [4, 4, 8, 8], size: size * (0.6 + Math.random() * 0.8), tint, air: true});
  }
  /** Campfire smoke: a big grey puff rising slowly a few blocks, from a signal fire (a hay bale under it) much higher. */
  campfireSmoke(x, y, z, signal) {
    this.particles.push({x: x + (Math.random() - 0.5) * 0.4, y: y + 0.3 + Math.random() * 0.3, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.006, vy: 0.05 + Math.random() * 0.02, vz: (Math.random() - 0.5) * 0.006,
      g: -0.0013, life: (signal ? 260 : 70) + Math.floor(Math.random() * 50), layer: LAYER.campfire_smoke ?? LAYER.white_wool ?? 0, uv: [0, 0, 16, 16], size: 0.32 + Math.random() * 0.22, tint: 0x8e8e8a, air: true});
  }
  /** A raindrop landing: two or three little drops jumping off where it fell (off water, paler and one more). */
  drip(x, y, z, water) {
    for (let i = 0, n = water ? 3 : 2; i < n; i++) this.particles.push({x: x + (Math.random() - 0.5) * 0.12, y: y + 0.03, z: z + (Math.random() - 0.5) * 0.12,
      vx: (Math.random() - 0.5) * 0.05, vy: 0.05 + Math.random() * 0.07, vz: (Math.random() - 0.5) * 0.05, g: 0.03, life: 4 + Math.floor(Math.random() * 4),
      layer: LAYER.white_wool ?? 0, uv: [4, 4, 8, 8], size: 0.032 + Math.random() * 0.024, tint: water ? 0xf0f6ff : 0xe0e8f0, air: true});
  }
  /** Bits of a thing's picture flying off (a snowball or an egg breaking where it hit). */
  crumbs(x, y, z, id, n = 8) {
    const look = itemLook(id), layer = look.flat ?? LAYER.white_wool ?? 0;
    for (let i = 0; i < n; i++) {
      const u = 2 + Math.floor(Math.random() * 10), w = 2 + Math.floor(Math.random() * 10);
      this.particles.push({x, y, z, vx: (Math.random() - 0.5) * 0.15, vy: Math.random() * 0.12 + 0.04, vz: (Math.random() - 0.5) * 0.15, g: 0.04, life: 8 + Math.floor(Math.random() * 10), layer, uv: [u, w, u + 3, w + 3], size: 0.05 + Math.random() * 0.03, tint: look.tint ?? 0xFFFFFF});
    }
  }
  splash(x, y, z) {
    for (let i = 0; i < 20; i++) this.particles.push({x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.1, vy: Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.1, g: 0.04, life: 20, layer: LAYER.water_still, uv: [0, 0, 4, 4], size: 0.06, tint: 0x6a9cff});
  }
  /** Things to draw: [{verts, x, y, z, model}] for the renderer, items and particles lit by the world. */
  drawList(view, time, light) {
    const out = [];
    for (const it of this.items) {
      const look = itemLook(it.stack.id, it.stack), [sky, blk] = light(Math.floor(it.x), Math.floor(it.y + 0.2), Math.floor(it.z));
      // (built once for a look in a light: a block as a little block, a thing a sixteenth thick, as the game's are)
      const key = `${look.cube ? `c${it.stack.id}` : `${look.flat}|${look.tint}|${look.over ?? ''}`}|${sky}|${blk}`;
      let v = itemVerts.get(key);
      if (!v) {
        if (itemVerts.size > 400) itemVerts.clear();
        v = new Verts(look.cube ? 48 : 512);
        if (look.cube) v.cube(0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints);
        else if (look.over != null) v.flatLook(0.5, look, sky * 17, blk * 17, 256, 32);
        else thickItem(v, look.flat, look.tint, sky * 17, blk * 17);
        itemVerts.set(key, v);
      }
      // bobbing a tenth of a block and turning (the game's); a stack shows more of them (up to five): a thing's stacked
      // close behind it, a block's a little apart
      const bob = Math.sin((it.age + time * 20) * 0.1 + it.spin) * 0.1 + 0.1, yaw = (it.age / 20 + it.spin) % (Math.PI * 2);
      const s = look.cube ? 0.25 : 0.5, n = it.stack.n, copies = n > 48 ? 5 : n > 32 ? 4 : n > 16 ? 3 : n > 1 ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        const [ox, oy, oz] = look.cube ? [c * 0.06, c * 0.05, c * 0.04] : [Math.sin(yaw) * c * 0.047, 0, Math.cos(yaw) * c * 0.047];
        out.push({verts: v, x: it.x + ox, y: it.y + bob + s / 2 + oy, z: it.z + oz, model: mat.model(s, yaw)});
      }
    }
    if (this.particles.length || this.orbs.length) {
      const v = this.pv.reset(), cx = view.x, cy = view.y, cz = view.z;
      // squares turned to face the camera
      const yaw = view.yaw, pitch = view.pitch, rx = [Math.cos(yaw), 0, -Math.sin(yaw)], up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
      const square = (x, y, z, s, layer, uv, sky, blk, tint) => {
        const ox = x - cx, oy = y - cy, oz = z - cz;
        if (Math.abs(ox) > 100 || Math.abs(oy) > 100 || Math.abs(oz) > 100) return;
        const [u0, v0, u1, v1] = uv, corners = [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, 1, u0, v0]];
        for (const [a, b, u, w] of corners) v.v(ox + (rx[0] * a + up[0] * b) * s, oy + (rx[1] * a + up[1] * b) * s, oz + (rx[2] * a + up[2] * b) * s, 256, 128, layer, u, w, sky * 17, blk * 17, 2 << 2, tint);
      };
      for (const p of this.particles) { const [sky, blk] = light(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)); square(p.x, p.y, p.z, p.size, p.layer, p.uv, sky, blk, p.tint); }
      // orbs glow (full light), bigger for more, their colour going between yellow and green
      for (const o of this.orbs) {
        const t = o.age + time * 20, r = Math.round((Math.sin(t * 0.25) + 1) * 0.5 * 255), b = Math.round((Math.sin(t * 0.25 + 4.19) + 1) * 0.1 * 255);
        square(o.x, o.y + 0.1, o.z, 0.06 + Math.min(0.1, Math.log2(o.v + 1) * 0.012), LAYER.xp_orb, [0, 0, 16, 16], 15, 15, (Math.max(120, r) << 16) | (255 << 8) | b);
      }
      // built round the camera (±128 blocks), so read back with the same centre
      out.push({verts: v, x: cx, y: cy, z: cz, model: mat.model(1), center: 128});
    }
    return out;
  }
  orbsJSON() { return this.orbs.map(o => ({v: o.v, x: o.x, y: o.y, z: o.z, age: o.age})); }
  loadOrbs(list) { this.orbs = (list || []).filter(o => o?.v > 0).map(o => ({...o, vx: 0, vy: 0, vz: 0})); }
  toJSON() { return this.items.map(it => ({stack: it.stack, x: it.x, y: it.y, z: it.z, age: it.age})); }
  load(list) { this.items = (list || []).filter(i => i?.stack && itemInfo(i.stack.id)).map(i => ({...i, vx: 0, vy: 0, vz: 0, delay: 0, spin: Math.random() * 6})); }
}
