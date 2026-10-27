// Things that move in the world but are not blocks: dropped items (they fall, bounce, join others of their kind and
// fly to the player when near) and particles (bits of a block flying off when it breaks, splashes).
import {collisionBoxes} from './shapes.js';
import {itemInfo, BLOCKS} from './blocks.js';
import {Verts, mat} from './render.js';
import {LAYER} from './atlas.js';

const DEFAULT_TINT = {grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4};
const tintNum = t => t == null ? 0xFFFFFF : t.startsWith('#') ? parseInt(t.slice(1), 16) : DEFAULT_TINT[t];
/** The faces' texture layers of an item as a little cube (or one flat picture): {cube: [6 layers], tints} | {flat}. */
export function itemLook(id) {
  const info = itemInfo(id);
  const b = info?.block;
  if (b && ['cube', 'slab', 'farmland', 'cactus', 'layer'].includes(b.shape) && b.tex) {
    const t = b.tex, L = n => LAYER[n] ?? 0, tint = tintNum(b.tint);
    if (t.all) return {cube: Array(6).fill(L(t.all)), tints: Array(6).fill(tint), half: b.shape === 'slab' || b.shape === 'layer'};
    const side = L(t.side), front = t.front ? L(t.front) : side;
    const grass = b.name === 'grass_block';
    return {cube: [side, side, L(t.top), L(t.bottom), front, side], tints: [grass ? 0xFFFFFF : tint, grass ? 0xFFFFFF : tint, tint, 0xFFFFFF, grass ? 0xFFFFFF : tint, grass ? 0xFFFFFF : tint], half: b.shape === 'slab'};
  }
  const name = b ? (b.name === 'wheat' ? 'wheat_stage7' : b.tex?.all || b.tex?.side) : info?.icon || id;
  return {flat: LAYER[name] ?? 0, tint: b ? tintNum(b.tint) : 0xFFFFFF};
}

export class Entities {
  constructor(world) { this.world = world; this.items = []; this.particles = []; this.verts = new Verts(256); this.pv = new Verts(2048); }
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
  /** Puffs that are not bits of a block: smoke, poof (a mob gone), heart, crit, explosion, meal (bone meal sparkles). */
  puff(x, y, z, kind) {
    const S = {smoke: [4, 0x4a4a4a, 0.02, 0.1, 30, -0.005], poof: [14, 0xdddddd, 0.08, 0.12, 20, -0.01], heart: [6, 0xff3a5a, 0.02, 0.12, 30, -0.004], crit: [10, 0xfff2b0, 0.15, 0.08, 14, 0.02],
      explosion: [40, 0x8a8a8a, 0.35, 0.35, 30, -0.01], meal: [12, 0x7ce05a, 0.06, 0.07, 20, -0.005]}[kind];
    if (!S) return;
    const [n, tint, spread, size, life, g] = S, layer = LAYER.white_wool ?? 0;
    for (let i = 0; i < n; i++) this.particles.push({x: x + (Math.random() - 0.5) * spread * 4, y: y + (Math.random() - 0.5) * spread * 4, z: z + (Math.random() - 0.5) * spread * 4,
      vx: (Math.random() - 0.5) * spread, vy: Math.random() * spread + 0.02, vz: (Math.random() - 0.5) * spread, g, life: life + Math.floor(Math.random() * 10), layer, uv: [4, 4, 8, 8], size: size * (0.6 + Math.random() * 0.8), tint, air: true});
  }
  splash(x, y, z) {
    for (let i = 0; i < 20; i++) this.particles.push({x: x + (Math.random() - 0.5), y, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 0.1, vy: Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.1, g: 0.04, life: 20, layer: LAYER.water_still, uv: [0, 0, 4, 4], size: 0.06, tint: 0x6a9cff});
  }
  /** Things to draw: [{verts, x, y, z, model}] for the renderer, items and particles lit by the world. */
  drawList(view, time, light) {
    const out = [];
    for (const it of this.items) {
      const look = itemLook(it.stack.id), [sky, blk] = light(Math.floor(it.x), Math.floor(it.y + 0.2), Math.floor(it.z));
      const v = new Verts(48);
      const bob = Math.sin((it.age + time * 20) * 0.1 + it.spin) * 0.06 + 0.1;
      if (look.cube) v.cube(look.half ? 0.5 : 0.5, look.cube, sky * 17, blk * 17, 256, 32, look.tints);
      else v.flat(0.5, look.flat, sky * 17, blk * 17, 256, 32, look.tint);
      const s = look.cube ? 0.25 : 0.4, copies = it.stack.n > 16 ? 3 : it.stack.n > 1 ? 2 : 1;
      for (let c = 0; c < copies; c++) out.push({verts: v, x: it.x + c * 0.06, y: it.y + bob + s / 2 + c * 0.05, z: it.z + c * 0.04, model: mat.model(s, (it.age / 20 + it.spin) % (Math.PI * 2))});
    }
    if (this.particles.length) {
      const v = this.pv.reset(), cx = view.x, cy = view.y, cz = view.z;
      // squares turned to face the camera
      const yaw = view.yaw, pitch = view.pitch, rx = [Math.cos(yaw), 0, -Math.sin(yaw)], up = [Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
      for (const p of this.particles) {
        const [sky, blk] = light(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), s = p.size;
        const ox = p.x - cx, oy = p.y - cy, oz = p.z - cz;
        if (Math.abs(ox) > 100 || Math.abs(oy) > 100 || Math.abs(oz) > 100) continue;
        const [u0, v0, u1, v1] = p.uv, corners = [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, 1, u0, v0]];
        for (const [a, b, u, w] of corners) v.v(ox + (rx[0] * a + up[0] * b) * s, oy + (rx[1] * a + up[1] * b) * s, oz + (rx[2] * a + up[2] * b) * s, 256, 128, p.layer, u, w, sky * 17, blk * 17, 2 << 2, p.tint);
      }
      out.push({verts: v, x: cx, y: cy, z: cz, model: mat.model(1)});
    }
    return out;
  }
  toJSON() { return this.items.map(it => ({stack: it.stack, x: it.x, y: it.y, z: it.z, age: it.age})); }
  load(list) { this.items = (list || []).filter(i => i?.stack && itemInfo(i.stack.id)).map(i => ({...i, vx: 0, vy: 0, vz: 0, delay: 0, spin: Math.random() * 6})); }
}
