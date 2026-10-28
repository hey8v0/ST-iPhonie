// Minecarts (the game's, Java edition): put on a rail, they roll along rails — faster down slopes, pushed on by a powered
// rail and braked by an unpowered one, round bends without losing speed, up and down slopes — and off the end, where a
// cart is a box that falls and slides. The player rides one; others carry a chest, a hopper (taking in what lies round
// it and what a container above holds), a furnace (coal in it pushes it on) or TNT (lit by a powered activator rail).
import {BLOCKS} from './blocks.js';
import {RAIL_ENDS, isRail, railShape} from './rails.js';
import {Body} from './player.js';
import {insertOne, moveOne} from './machines.js';

const MAX = 0.4;          // the most a cart rolls on its own, blocks a tick (8 a second)
const STILL = {fwd: 0, side: 0, jump: false, sneak: false, sprint: false, speed: 0.1};
let nextId = 1;
/** What each kind carries, drawn inside it (null: room for a rider). */
export const CARTS = {minecart: null, chest_minecart: 'chest', furnace_minecart: 'furnace', tnt_minecart: 'tnt', hopper_minecart: 'hopper'};
const slotsOf = (list, n) => Array.from({length: n}, (_, i) => list?.[i] || null);

export class Carts {
  /**
   * ctx: {world (get, has), sound(name, x, y, z), drop(stack, x, y, z), light(x, y, z, fuse) (TNT going off), tiles() (the
   * page's containers by "x,y,z"), items() (things lying on the ground)}.
   */
  constructor(ctx) { this.ctx = ctx; this.list = []; }
  add(kind, x, y, z, s = {}) {
    const c = {id: nextId++, kind, body: new Body(this.ctx.world, [0.98, 0.7]), yaw: s.yaw || 0, pitch: 0, hurt: 0, damage: 0, fuel: s.fuel || 0, push: s.push || [0, 0], fuse: -1, locked: false, isCart: true};
    Object.assign(c.body, {x, y, z, prev: {x, y, z}, vx: s.vx || 0, vz: s.vz || 0});
    if (kind === 'chest_minecart') c.inv = {kind: 'chest', slots: slotsOf(s.slots, 27), title: '运输矿车'};
    if (kind === 'hopper_minecart') c.inv = {kind: 'hopper', slots: slotsOf(s.slots, 5), title: '漏斗矿车', cols: 5};
    this.list.push(c);
    return c;
  }
  remove(c) { const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); }
  toJSON() { return this.list.map(c => ({kind: c.kind, x: +c.body.x.toFixed(3), y: +c.body.y.toFixed(3), z: +c.body.z.toFixed(3), vx: c.body.vx, vz: c.body.vz, yaw: c.yaw, ...(c.inv ? {slots: c.inv.slots} : {}), ...(c.fuel ? {fuel: c.fuel, push: c.push} : {})})); }
  load(list) { for (const s of list || []) if (s.kind in CARTS) this.add(s.kind, s.x, s.y, s.z, s); }
  /** The cart at a place: the rail under it (on it, or one lower), or null. */
  railUnder(c) {
    const b = c.body, get = (x, y, z) => this.ctx.world.get(x, y, z), x = Math.floor(b.x), z = Math.floor(b.z);
    let y = Math.floor(b.y + 0.01), v = get(x, y, z);
    if (!isRail(v)) { y--; v = get(x, y, z); }
    return isRail(v) ? [x, y, z, v] : null;
  }
  /** One tick. rider: {cart, fwd, look} for the cart the player sits in. */
  tick(rider = null) {
    for (const c of [...this.list]) {
      const b = c.body;
      b.prev = {x: b.x, y: b.y, z: b.z};
      if (c.hurt > 0) c.hurt--; else if (c.damage > 0) c.damage = Math.max(0, c.damage - 1);
      if (c.fuse > 0 && --c.fuse === 0) { this.remove(c); this.ctx.light(Math.floor(b.x), b.y, Math.floor(b.z), 1); continue; }
      const r = this.railUnder(c);
      if (r) this.roll(c, ...r, rider?.cart === c ? rider : null);
      else { b.tick(STILL); c.onRail = false; c.pitch *= 0.8; }
      if (c.kind === 'hopper_minecart' && !c.locked && (this.ctx.ticks?.() ?? 0) % 4 === 0) this.gather(c);
      if (c.kind === 'furnace_minecart' && c.fuel > 0 && Math.random() < 0.3) this.ctx.smoke?.(b.x, b.y + 0.9, b.z);
    }
  }
  /** Rolling on a rail: along its line (the middle of one edge to the other), kept on it, at its height (a slope rises to its first end). */
  roll(c, x, y, z, v, rider) {
    const b = c.body, s = railShape(v), kind = BLOCKS[v & 0xFFF].rail, on = !!(v >>> 12 & 8), slope = s >= 2 && s <= 5;
    const [[ax, az], [bx, bz]] = RAIL_ENDS[s] || RAIL_ENDS[0];
    const pax = x + 0.5 + ax / 2, paz = z + 0.5 + az / 2, len = Math.hypot(bx / 2 - ax / 2, bz / 2 - az / 2), ux = (bx - ax) / 2 / len, uz = (bz - az) / 2 / len;
    // the speed kept, the way along the rail nearest the way it was going (round a bend nothing is lost)
    const speed = Math.hypot(b.vx, b.vz), dot = b.vx * ux + b.vz * uz, at = (b.x - pax) * ux + (b.z - paz) * uz;
    let sp = dot ? Math.sign(dot) * speed : at < len / 2 ? speed : -speed;
    if (slope) sp += 0.0078125;                    // down the slope (its second end is the low one)
    if (kind === 'powered') {
      if (!on) sp = Math.abs(sp) < 0.03 ? 0 : sp * 0.5;
      else if (Math.abs(sp) > 0.01) sp += Math.sign(sp) * 0.06;
      else {
        // standing on a powered rail: off it away from a solid block at an end
        const solid = (dx, dz) => !!BLOCKS[this.ctx.world.get(x + dx, y, z + dz) & 0xFFF]?.opaque;
        if (solid(ax, az)) sp = 0.02; else if (solid(bx, bz)) sp = -0.02;
      }
    }
    if (kind === 'activator') this.activate(c, on, rider);
    // the rider pressing forward starts a cart that stands (the game's kick); a furnace pushes its way at 0.2
    if (rider?.fwd > 0 && Math.abs(sp) < 0.01) sp += (rider.look[0] * ux + rider.look[2] * uz) * 0.1;
    if (c.kind === 'furnace_minecart' && c.fuel > 0) {
      c.fuel--;
      const p = c.push[0] * ux + c.push[1] * uz;
      if (Math.abs(p) > 0.01) { sp = Math.sign(p) * Math.max(Math.abs(sp), 0.2); c.push = [ux * Math.sign(sp), uz * Math.sign(sp)]; }
    }
    sp *= c.kind === 'minecart' ? (rider ? 0.997 : 0.96) : 0.98;
    sp = Math.max(-MAX, Math.min(MAX, sp));
    const t = at + sp;
    b.x = pax + ux * t; b.z = paz + uz * t;
    b.y = y + 0.0625 + (slope ? Math.max(0, Math.min(1, 1 - t / len)) : 0);
    b.vx = ux * sp; b.vz = uz * sp; b.vy = 0; b.fall = 0; b.onGround = true;
    if (Math.abs(sp) > 0.002) c.yaw = Math.atan2(-b.vx, -b.vz);
    c.pitch = slope ? (sp >= 0 ? 1 : -1) * Math.PI / 4 : 0;
    c.onRail = true;
  }
  /** An activator rail: powered it lights TNT, throws the rider out, locks a hopper cart; unpowered it unlocks the hopper. */
  activate(c, on, rider) {
    if (c.kind === 'hopper_minecart') c.locked = on;
    if (!on) return;
    if (c.kind === 'tnt_minecart' && c.fuse < 0) { c.fuse = 80; this.ctx.sound('fuse', c.body.x, c.body.y, c.body.z); }
    if (rider) rider.eject = true;
  }
  /** A hopper cart takes one thing a tick from a container above it, and what lies round it. */
  gather(c) {
    const b = c.body, x = Math.floor(b.x), y = Math.floor(b.y + 0.01), z = Math.floor(b.z), above = this.ctx.tiles()[`${x},${y + 1},${z}`];
    if (above) moveOne(above, c.inv, true);
    for (const it of this.ctx.items()) {
      if (Math.abs(it.x - b.x) > 0.8 || Math.abs(it.z - b.z) > 0.8 || it.y < b.y - 0.2 || it.y > b.y + 1.2 || it.delay > 0) continue;
      while (it.stack.n > 0 && insertOne(c.inv, it.stack, true)) it.stack.n--;
    }
  }
  /** Hit: a few hits break it (one in creative): back to its item, with what it carried. */
  hit(c, dmg, creative = false) {
    c.hurt = 10; c.damage += Math.max(1, dmg) * 10;
    this.ctx.sound('hit', c.body.x, c.body.y, c.body.z);
    if (!creative && c.damage <= 40) return false;
    this.remove(c);
    if (!creative) {
      const b = c.body;
      this.ctx.drop({id: c.kind, n: 1}, b.x, b.y + 0.4, b.z);
      for (const s of c.inv?.slots || []) if (s) this.ctx.drop(s, b.x, b.y + 0.4, b.z);
    }
    return true;
  }
  /** The cart a ray hits first (within reach): {mob: cart, t} or null (as mobs' raycast). */
  raycast(ox, oy, oz, dx, dy, dz, reach) {
    let best = null;
    for (const c of this.list) {
      const b = c.body, lo = [b.x - 0.49, b.y, b.z - 0.49], hi = [b.x + 0.49, b.y + 0.7, b.z + 0.49], o = [ox, oy, oz], d = [dx, dy, dz];
      let t0 = 0, t1 = reach, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) ok = false; continue; }
        let a = (lo[k] - o[k]) / d[k], e = (hi[k] - o[k]) / d[k];
        if (a > e) [a, e] = [e, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, e); if (t0 > t1) ok = false;
      }
      if (ok && (!best || t0 < best.t)) best = {mob: c, t: t0};
    }
    return best;
  }
  /** Things walking into a cart push it along (the player, mostly). */
  shove(x, z, vx, vz) {
    for (const c of this.list) {
      const dx = c.body.x - x, dz = c.body.z - z, d = Math.hypot(dx, dz);
      if (d > 0.9 || d < 1e-4) continue;
      const k = (0.9 - d) * 0.08;
      c.body.vx += dx / d * k + vx * 0.2; c.body.vz += dz / d * k + vz * 0.2;
    }
  }
}
