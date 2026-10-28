// Boats (the game's, Java edition): put on water (or anywhere) they float on the water's top, sunk in a little; the
// player sits in one and paddles — forward pulls it on, back slows it a little, left and right turn it (and the view
// with it); getting out is the sneak key. On water a boat keeps going a long way (a tenth of its speed lost a tick), on
// land it hardly moves, on ice it flies. Water over it lifts it up; under water three seconds and its rider is out.
// A chest boat has a chest and one seat; the bamboo raft sits higher. A few hits break one back into its item (and what
// its chest held); falling more than three blocks onto land breaks it into planks and sticks. Others bump into a boat
// and push it, and can stand on it.
import {BLOCKS, ID, ITEMS, zhOf} from './blocks.js';
import {Body} from './player.js';
import {collisionBoxes, nearIn} from './shapes.js';

export const BOAT_W = 1.375, BOAT_H = 0.5625;
// how deep it floats (its floor stays over the water: the game hides the water inside its boats, we keep it out),
// and the lift that holds it there against its weight
const SINK = 0.14, LIFT = 0.04 * BOAT_H / SINK;
const TURN = Math.PI / 180;
let nextId = 1;
const slotsOf = (list, n) => Array.from({length: n}, (_, i) => list?.[i] || null);
/** The top of the water in a block, as it is drawn (1 under more water; a source 14/16, flowing lower), or null. */
export function waterTop(world, x, y, z) {
  const v = world.get(x, y, z);
  if ((v & 0xFFF) !== ID.water) return null;
  if ((world.get(x, y + 1, z) & 0xFFF) === ID.water) return y + 1;
  const m = v >>> 12;
  return y + Math.round(m >= 8 ? 14.2 : 14.2 - (m & 7) * 1.75) / 16;
}

export class Boats {
  /** ctx: {world (get, has), sound(name, x, y, z), drop(stack, x, y, z), fall(distance) (its rider's fall)}. */
  constructor(ctx) { this.ctx = ctx; this.list = []; }
  /** A boat of an item's kind (oak_boat … bamboo_chest_raft) with its bottom at (x, y, z). */
  add(kind, x, y, z, s = {}) {
    const it = ITEMS[kind];
    if (!it?.boat) return null;
    const c = {id: nextId++, kind, wood: it.boat, chest: !!it.chest, raft: it.boat === 'bamboo', body: new Body(this.ctx.world, [BOAT_W, BOAT_H]), yaw: s.yaw || 0, prevYaw: s.yaw || 0, dYaw: 0,
      hurt: 0, hurtDir: 1, damage: 0, paddles: [0, 0], rowing: [false, false], status: 'air', under: 0, fall: 0, isBoat: true};
    Object.assign(c.body, {x, y, z, prev: {x, y, z}, vx: s.vx || 0, vy: 0, vz: s.vz || 0});
    if (c.chest) c.inv = {kind: 'chest', slots: slotsOf(s.slots, 27), title: zhOf(kind)};
    this.list.push(c);
    return c;
  }
  remove(c) { const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1); }
  toJSON() { return this.list.map(c => ({kind: c.kind, x: +c.body.x.toFixed(3), y: +c.body.y.toFixed(3), z: +c.body.z.toFixed(3), yaw: +c.yaw.toFixed(4), vx: c.body.vx, vz: c.body.vz, ...(c.inv ? {slots: c.inv.slots} : {})})); }
  load(list) { for (const s of list || []) this.add(s.kind, s.x, s.y, s.z, s); }
  /**
   * What a boat is in: under (water over its top: lifted; flowing: it sinks slowly), water (with the level of its top round
   * the boat's bottom), land (with how slippery the ground is, the blocks under it averaged), air.
   */
  status(c) {
    const b = c.body, w = this.ctx.world, h = BOAT_W / 2;
    const x0 = Math.floor(b.x - h), x1 = Math.ceil(b.x + h), z0 = Math.floor(b.z - h), z1 = Math.ceil(b.z + h), top = b.y + BOAT_H;
    let over = null;
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) for (let y = Math.floor(top); y < Math.ceil(top + 0.001); y++) {
      const t = waterTop(w, x, y, z);
      if (t !== null && top + 0.001 < t) over = over === 'flowing' || (w.get(x, y, z) >>> 12) ? 'flowing' : 'under';
    }
    if (over) return {kind: over};
    let level = -Infinity, wet = false;
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) for (let y = Math.floor(b.y); y < Math.ceil(b.y + 0.001); y++) {
      const t = waterTop(w, x, y, z);
      if (t !== null) { level = Math.max(level, t); if (b.y < t) wet = true; }
    }
    if (wet) return {kind: 'water', level};
    let f = 0, n = 0;
    const y = Math.floor(b.y - 0.001);
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
      const v = w.get(x, y, z), boxes = collisionBoxes(v, nearIn(w, x, y, z));
      if (boxes?.some(q => x + q[0] < b.x + h && x + q[3] > b.x - h && z + q[2] < b.z + h && z + q[5] > b.z - h && y + q[4] >= b.y - 0.001 && y + q[1] < b.y)) { f += BLOCKS[v & 0xFFF].slip || 0.6; n++; }
    }
    return n ? {kind: 'land', friction: f / n} : {kind: 'air'};
  }
  /** One tick. rider: {boat, fwd, side} for the boat the player sits in (they set rider.eject when it throws them out). */
  tick(rider = null) {
    for (const c of [...this.list]) {
      const b = c.body, ridden = rider?.boat === c;
      b.prev = {x: b.x, y: b.y, z: b.z}; c.prevYaw = c.yaw;
      if (c.hurt > 0) c.hurt--;
      if (c.damage > 0) c.damage--;
      const was = c.status, st = this.status(c);
      c.status = st.kind;
      c.under = st.kind === 'under' || st.kind === 'flowing' ? c.under + 1 : 0;
      if (ridden && c.under >= 60) rider.eject = true;
      // floating: coming down onto water it settles there at once; in water its top holds it up, under water it rises
      if (was === 'air' && st.kind === 'water') { b.y = st.level - SINK; b.vy = 0; }
      else {
        const fr = st.kind === 'water' || st.kind === 'flowing' || st.kind === 'air' ? 0.9 : st.kind === 'under' ? 0.45 : st.friction;
        b.vx *= fr; b.vz *= fr; c.dYaw *= fr;
        if (st.kind === 'under') b.vy = (b.vy + 0.06) * 0.75;
        else if (st.kind === 'flowing') b.vy -= 7e-4;
        else b.vy -= 0.04;
        if (st.kind === 'water') { const lift = (st.level - b.y) / BOAT_H; if (lift > 0) b.vy = (b.vy + lift * LIFT) * 0.75; }
      }
      // paddling (the game's: a turn of 1° a tick more each tick, forward 0.04, back 0.005; turning alone moves it a little)
      if (ridden) {
        const left = rider.side < -0.3, right = rider.side > 0.3, up = rider.fwd > 0.3, down = rider.fwd < -0.3;
        let f = 0;
        if (left) c.dYaw += TURN;
        if (right) c.dYaw -= TURN;
        if (right !== left && !up && !down) f += 0.005;
        c.yaw += c.dYaw;
        if (up) f += 0.04;
        if (down) f -= 0.005;
        b.vx -= Math.sin(c.yaw) * f; b.vz -= Math.cos(c.yaw) * f;
        c.rowing = [(right && !left) || up, (left && !right) || up];
      } else c.rowing = [false, false];
      for (let i = 0; i < 2; i++) {
        if (!c.rowing[i]) { c.paddles[i] = 0; continue; }
        const p = c.paddles[i] % (Math.PI * 2);
        if (p <= Math.PI / 4 && p + Math.PI / 8 >= Math.PI / 4) this.ctx.sound(st.kind === 'land' ? 'paddle_land' : 'paddle', b.x, b.y, b.z);
        c.paddles[i] += Math.PI / 8;
      }
      const r = b.move(b.vx, b.vy, b.vz);
      if (r.hitX) b.vx = 0;
      if (r.hitZ) b.vz = 0;
      if (r.hitY) b.vy = 0;
      b.onGround = r.down;
      // a fall of more than three onto land breaks it (not into water)
      if (r.down) {
        if (c.fall > 3 && waterTop(this.ctx.world, Math.floor(b.x), Math.floor(b.y - 0.01), Math.floor(b.z)) === null && waterTop(this.ctx.world, Math.floor(b.x), Math.floor(b.y + 0.01), Math.floor(b.z)) === null) {
          if (ridden) { rider.eject = true; this.ctx.fall?.(c.fall); }
          this.remove(c);
          for (let i = 0; i < 3; i++) this.ctx.drop({id: `${c.wood}_planks`, n: 1}, b.x, b.y + 0.3, b.z);
          this.ctx.drop({id: 'stick', n: 2}, b.x, b.y + 0.3, b.z);
          for (const s of c.inv?.slots || []) if (s) this.ctx.drop(s, b.x, b.y + 0.3, b.z);
          continue;
        }
        c.fall = 0;
      } else if (st.kind === 'air' && r.dy < 0) c.fall -= r.dy;
      else if (st.kind !== 'air') c.fall = 0;
    }
    // boats bump one another apart
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i].body, o = this.list[j].body, [dx, dz] = this.nudge(a, o.x, o.z, BOAT_W, o.y, BOAT_H);
      if (dx || dz) { if (rider?.boat !== this.list[i]) { a.vx -= dx; a.vz -= dz; } if (rider?.boat !== this.list[j]) { o.vx += dx; o.vz += dz; } }
    }
  }
  /** The push between a boat and something of width w at (x, y, z) within 0.2 of it (the game's): [dx, dz] towards it. */
  nudge(b, x, z, w, y, hgt) {
    const reach = (BOAT_W + w) / 2 + 0.2;
    if (Math.abs(x - b.x) >= reach || Math.abs(z - b.z) >= reach || y >= b.y + BOAT_H - 0.01 || y + hgt <= b.y + 0.01) return [0, 0];
    let dx = x - b.x, dz = z - b.z, d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d < 0.01) return [0, 0];
    d = Math.sqrt(d); dx /= d; dz /= d;
    const k = Math.min(1, 1 / d) * 0.05;
    return [dx * k, dz * k];
  }
  /** Something of width w and height hgt walking at (x, y, z) pushes the boats it touches and is pushed: its push back. */
  shove(x, y, z, w, hgt, riding = null) {
    let px = 0, pz = 0;
    for (const c of this.list) {
      if (c === riding) continue;
      const [dx, dz] = this.nudge(c.body, x, z, w, y, hgt);
      c.body.vx -= dx; c.body.vz -= dz; px += dx; pz += dz;
    }
    return [px, pz];
  }
  /** The boats' boxes in a space (they are solid: walked into, stood on), but not body's own. */
  solids(body, x0, y0, z0, x1, y1, z1) {
    const out = [], h = BOAT_W / 2;
    for (const c of this.list) {
      const b = c.body;
      if (b === body || b.x + h < x0 || b.x - h > x1 + 1 || b.z + h < z0 || b.z - h > z1 + 1 || b.y > y1 + 1 || b.y + BOAT_H < y0 - 1) continue;
      out.push([b.x - h, b.y, b.z - h, b.x + h, b.y + BOAT_H, b.z + h]);
    }
    return out;
  }
  /** Where its rider sits (feet), now or a tick ago: a chest boat's seat a little forward, the raft's higher. */
  seat(c, before = false) {
    const b = before ? c.body.prev : c.body, yaw = before ? c.prevYaw : c.yaw, f = c.chest ? 0.15 : 0;
    return [b.x - Math.sin(yaw) * f, b.y + (c.raft ? -0.1 : -0.45), b.z - Math.cos(yaw) * f];
  }
  /** Hit: a few hits break it (one in creative): back to its item, with what its chest held. */
  hit(c, dmg, creative = false) {
    c.hurtDir = -c.hurtDir; c.hurt = 10; c.damage += Math.max(1, dmg) * 10;
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
  /** The boat a ray hits first (within reach): {mob: boat, t} or null (as mobs' raycast). */
  raycast(ox, oy, oz, dx, dy, dz, reach) {
    let best = null;
    for (const c of this.list) {
      const b = c.body, h = BOAT_W / 2, lo = [b.x - h, b.y, b.z - h], hi = [b.x + h, b.y + BOAT_H, b.z + h], o = [ox, oy, oz], d = [dx, dy, dz];
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
}
