// The player's body: moving like the game does it, 20 ticks a second (walking, sprinting, sneaking without falling off
// edges, jumping, stepping up slabs, swimming, climbing ladders, flying in creative), bumping into blocks, falling and
// its damage, and the ray that finds the block aimed at.
import {collisionBoxes, selectionBoxes, isClimbable, slipperiness} from './shapes.js';
import {ID, BLOCKS} from './blocks.js';

export const W = 0.6, H = 1.8, SNEAK_H = 1.5, EYE = 1.62, SNEAK_EYE = 1.27;

export class Body {
  constructor(world) {
    this.world = world;
    this.x = 0; this.y = 100; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.flying = false; this.sneaking = false; this.sprinting = false;
    this.inWater = false; this.inLava = false; this.headInWater = false; this.climbing = false;
    this.fall = 0; this.jumpWait = 0; this.collidedX = false;
    this.prev = {x: 0, y: 100, z: 0};
    this.landed = 0; this.stepped = 0;
  }
  get height() { return this.sneaking && !this.flying ? SNEAK_H : H; }
  get eye() { return this.sneaking && !this.flying ? SNEAK_EYE : EYE; }
  /** The boxes of solid blocks touching a box. */
  boxesIn(x0, y0, z0, x1, y1, z1) {
    const out = [];
    for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++) for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      const v = this.world.get(x, y, z);
      // where the world is not here yet, walls stop you
      const bs = this.world.has(x, z) ? collisionBoxes(v) : [[0, 0, 0, 1, 1, 1]];
      if (!bs) continue;
      for (const b of bs) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
    }
    return out;
  }
  aabb(x = this.x, y = this.y, z = this.z) { const h = W / 2; return [x - h, y, z - h, x + h, y + this.height, z + h]; }
  /** Moves by dx, dy, dz, stopped by blocks (up and down first, then across). */
  move(dx, dy, dz) {
    const box = this.aabb(), e = 1e-7;
    const boxes = this.boxesIn(Math.min(box[0], box[0] + dx), Math.min(box[1], box[1] + dy), Math.min(box[2], box[2] + dz), Math.max(box[3], box[3] + dx), Math.max(box[4], box[4] + dy), Math.max(box[5], box[5] + dz));
    const ody = dy, odx = dx, odz = dz;
    for (const b of boxes) if (box[3] > b[0] + e && box[0] < b[3] - e && box[5] > b[2] + e && box[2] < b[5] - e) {
      if (dy > 0 && box[4] <= b[1] + e) dy = Math.min(dy, b[1] - box[4]);
      else if (dy < 0 && box[1] >= b[4] - e) dy = Math.max(dy, b[4] - box[1]);
    }
    box[1] += dy; box[4] += dy;
    for (const b of boxes) if (box[4] > b[1] + e && box[1] < b[4] - e && box[5] > b[2] + e && box[2] < b[5] - e) {
      if (dx > 0 && box[3] <= b[0] + e) dx = Math.min(dx, b[0] - box[3]);
      else if (dx < 0 && box[0] >= b[3] - e) dx = Math.max(dx, b[3] - box[0]);
    }
    box[0] += dx; box[3] += dx;
    for (const b of boxes) if (box[4] > b[1] + e && box[1] < b[4] - e && box[3] > b[0] + e && box[0] < b[3] - e) {
      if (dz > 0 && box[5] <= b[2] + e) dz = Math.min(dz, b[2] - box[5]);
      else if (dz < 0 && box[2] >= b[5] - e) dz = Math.max(dz, b[5] - box[2]);
    }
    this.x += dx; this.y += dy; this.z += dz;
    return {dx, dy, dz, hitX: dx !== odx, hitY: dy !== ody, hitZ: dz !== odz, down: ody < 0 && dy !== ody};
  }
  /** Is there ground under the box if it were here? (sneaking stops at edges) */
  groundUnder(x, z) { const h = W / 2; return this.boxesIn(x - h, this.y - 0.6, z - h, x + h, this.y - 0.01, z + h).some(b => b[4] > this.y - 0.6 && b[3] > x - h && b[0] < x + h && b[5] > z - h && b[2] < z + h); }
  /** What the body is in now (water, lava, a ladder). */
  feel() {
    const [x0, y0, z0, x1, y1, z1] = this.aabb();
    let water = false, lava = false, climb = false, cactus = false;
    for (let y = Math.floor(y0 + 0.01); y <= Math.floor(y1 - 0.01); y++) for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-6); z++) for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-6); x++) {
      const v = this.world.get(x, y, z), id = v & 0xFFF;
      if (id === ID.water && y + 0.9 > y0 + 0.1) water = true;
      if (id === ID.lava) lava = true;
    }
    const fx = Math.floor(this.x), fz = Math.floor(this.z), fy = Math.floor(this.y + 0.01);
    climb = isClimbable(this.world.get(fx, fy, fz)) || isClimbable(this.world.get(fx, fy + 1, fz));
    for (let y = Math.floor(y0 - 0.01); y <= Math.floor(y1); y++) for (let z = Math.floor(z0 - 0.02); z <= Math.floor(z1 + 0.02); z++) for (let x = Math.floor(x0 - 0.02); x <= Math.floor(x1 + 0.02); x++) if ((this.world.get(x, y, z) & 0xFFF) === ID.cactus) cactus = true;
    const ey = this.y + this.eye, ev = this.world.get(Math.floor(this.x), Math.floor(ey), Math.floor(this.z));
    this.headInWater = (ev & 0xFFF) === ID.water && ey < Math.floor(ey) + 0.89;
    this.headInLava = (ev & 0xFFF) === ID.lava;
    this.inWater = water; this.inLava = lava; this.climbing = climb && !this.flying; this.touchCactus = cactus;
  }
  /**
   * One tick. input: {fwd, side (−1..1), jump, sneak, sprint, autoJump}. Returns {landed: fall distance when it
   * lands, stepped} for damage and sounds.
   */
  tick(input) {
    this.prev = {x: this.x, y: this.y, z: this.z};
    this.feel();
    const wantSneak = !!input.sneak && !this.flying;
    if (this.sneaking && !wantSneak) {
      // standing up needs room
      const h = W / 2;
      if (!this.boxesIn(this.x - h, this.y, this.z - h, this.x + h, this.y + H, this.z + h).some(b => b[1] < this.y + H && b[4] > this.y + 0.01)) this.sneaking = false;
    } else this.sneaking = wantSneak;
    let fwd = (input.fwd || 0) * 0.98, side = (input.side || 0) * 0.98;
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    if (this.sneaking) { fwd *= 0.3; side *= 0.3; }
    if (fwd <= 0.5 || this.sneaking || this.collidedX && !this.flying) this.sprinting = false;
    else if (input.sprint && !this.inWater) this.sprinting = true;
    if (this.jumpWait > 0) this.jumpWait--;
    const yaw = this.yaw, sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    // forward is −z at yaw 0
    const accel = a => { this.vx += (-sinY * fwd + cosY * side) * a; this.vz += (-cosY * fwd - sinY * side) * a; };
    let result = {landed: 0, stepped: 0};
    if (this.flying) {
      accel(this.sprinting ? 0.1 : 0.05);
      if (input.jump) this.vy += 0.15; if (input.sneak) this.vy -= 0.15;
      const r = this.move(this.vx, this.vy, this.vz);
      if (r.down) { this.flying = !input.flyStay ? false : this.flying; }
      this.vx *= 0.91; this.vz *= 0.91; this.vy *= 0.6;
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0; if (r.hitY) this.vy = 0;
      this.onGround = r.down; this.fall = 0;
      return result;
    }
    if (this.inWater || this.inLava) {
      accel(0.02);
      if (input.jump) this.vy += 0.04;
      const r = this.move(this.vx, this.vy, this.vz);
      const k = this.inWater ? 0.8 : 0.5;
      this.vx *= k; this.vz *= k; this.vy = this.vy * k - 0.02;
      // climbing out at the edge
      if ((r.hitX || r.hitZ) && input.jump) this.vy = 0.3;
      if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0; if (r.hitY) this.vy = 0;
      this.onGround = r.down; this.fall = 0; this.collidedX = r.hitX || r.hitZ;
      return result;
    }
    const below = this.world.get(Math.floor(this.x), Math.floor(this.y - 0.5), Math.floor(this.z));
    // the game's rule: the push on the ground is speed × 0.216 / friction³, the slowing friction × 0.91
    const friction = slipperiness(below), slip = this.onGround ? friction * 0.91 : 0.91;
    const speed = 0.1 * (this.sprinting ? 1.3 : 1);
    accel(this.onGround ? speed * 0.21600002 / (friction * friction * friction) : this.sprinting ? 0.026 : 0.02);
    if (this.climbing) {
      this.vx = Math.max(-0.15, Math.min(0.15, this.vx)); this.vz = Math.max(-0.15, Math.min(0.15, this.vz));
      this.vy = Math.max(this.vy, this.sneaking ? 0 : -0.15);
      this.fall = 0;
    }
    if (input.jump && this.onGround && !this.jumpWait) {
      this.vy = 0.42; this.jumpWait = 10;
      if (this.sprinting) { this.vx += -sinY * 0.2; this.vz += -cosY * 0.2; }
      result.jumped = true;
    }
    let dx = this.vx, dz = this.vz;
    // sneaking: no stepping off an edge
    if (this.sneaking && this.onGround) {
      while (dx && !this.groundUnder(this.x + dx, this.z)) dx = Math.abs(dx) < 0.05 ? 0 : dx - Math.sign(dx) * 0.05;
      while (dz && !this.groundUnder(this.x, this.z + dz)) dz = Math.abs(dz) < 0.05 ? 0 : dz - Math.sign(dz) * 0.05;
      while (dx && dz && !this.groundUnder(this.x + dx, this.z + dz)) { dx = Math.abs(dx) < 0.05 ? 0 : dx - Math.sign(dx) * 0.05; dz = Math.abs(dz) < 0.05 ? 0 : dz - Math.sign(dz) * 0.05; }
      this.vx = dx; this.vz = dz;
    }
    const sx = this.x, sy = this.y, sz = this.z;
    let r = this.move(dx, this.vy, dz);
    // stepping up something low (a slab, up to 0.6)
    if ((r.hitX || r.hitZ) && (this.onGround || r.down)) {
      const save = {x: this.x, y: this.y, z: this.z};
      this.x = sx; this.y = sy; this.z = sz;
      const up = this.move(0, 0.6, 0), across = this.move(dx, 0, dz), down = this.move(0, -up.dy - 0.01, 0);
      if (Math.hypot(across.dx, across.dz) > Math.hypot(r.dx, r.dz) + 1e-4 && down.down) { r = {...across, hitY: true, down: true, dy: 0}; result.stepped = this.y - sy; }
      else { this.x = save.x; this.y = save.y; this.z = save.z; }
    }
    // auto-jump (touch): a one-block step in the way
    if (input.autoJump && (r.hitX || r.hitZ) && this.onGround && !this.jumpWait && Math.hypot(fwd, side) > 0.1 && !this.climbing) {
      const h = W / 2, ax = this.x + Math.sign(dx) * 0.4, az = this.z + Math.sign(dz) * 0.4;
      const wall = this.boxesIn(ax - h, this.y + 0.01, az - h, ax + h, this.y + 1, az + h).length;
      const room = !this.boxesIn(ax - h, this.y + 1.01, az - h, ax + h, this.y + 1 + this.height, az + h).some(b => b[4] > this.y + 1.01);
      if (wall && room) { this.vy = 0.42; this.jumpWait = 10; result.jumped = true; }
    }
    if (this.climbing && (r.hitX || r.hitZ) && !this.sneaking) this.vy = 0.2;
    this.collidedX = r.hitX || r.hitZ;
    if (r.hitX) this.vx = 0; if (r.hitZ) this.vz = 0;
    const wasGround = this.onGround;
    this.onGround = r.down;
    if (r.hitY) { if (this.vy < 0 && this.fall > 0) { result.landed = this.fall; } this.vy = 0; }
    if (this.onGround) this.fall = 0; else if (this.y < sy) this.fall += sy - this.y;
    if (this.onGround && !wasGround && !result.landed) result.landed = 0.001;
    this.vy = (this.vy - 0.08) * 0.98;
    this.vx *= slip; this.vz *= slip;
    if (Math.abs(this.vx) < 0.003) this.vx = 0; if (Math.abs(this.vz) < 0.003) this.vz = 0;
    return result;
  }
  /** Where the eye looks: a unit vector. */
  look() { const cp = Math.cos(this.pitch); return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp]; }
}

/**
 * The first block along a ray within reach: {x, y, z, face (0 east … 5 north), v, hit: [x, y, z], box} or null.
 * liquids: also stop at liquid sources (for a bucket).
 */
export function raycast(world, ox, oy, oz, dx, dy, dz, reach, liquids = false) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity, tdz = dz ? Math.abs(1 / dz) : Infinity;
  let tx = dx ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity, ty = dy ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity, tz = dz ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
  for (let i = 0; i < 64; i++) {
    const v = world.get(x, y, z), boxes = selectionBoxes(v, liquids);
    if (boxes) {
      let best = null;
      for (const b of boxes) {
        const hit = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        if (hit && hit.t <= reach && (!best || hit.t < best.t)) best = {...hit, box: b};
      }
      if (best) return {x, y, z, v, face: best.face, t: best.t, hit: [ox + dx * best.t, oy + dy * best.t, oz + dz * best.t], boxes: boxes.map(b => [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]])};
    }
    const t = Math.min(tx, ty, tz);
    if (t > reach) return null;
    if (t === tx) { x += sx; tx += tdx; } else if (t === ty) { y += sy; ty += tdy; } else { z += sz; tz += tdz; }
  }
  return null;
}
function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const axes = [[ox, dx, x0, x1, 1, 0], [oy, dy, y0, y1, 3, 2], [oz, dz, z0, z1, 5, 4]];
  for (const [o, d, lo, hi, fLo, fHi] of axes) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, f1 = fLo, f2 = fHi;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [f1, f2] = [f2, f1]; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return {t: Math.max(0, tmin), face};
}
export {BLOCKS};
