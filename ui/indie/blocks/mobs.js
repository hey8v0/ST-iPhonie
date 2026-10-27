// Mobs and other moving things: animals (pigs, cows, sheep, chickens) that wander, flee when hit, follow the food they
// like and have young; monsters (zombies, skeletons, creepers, spiders) that come out in the dark, hunt the player and
// burn in the sun; arrows; lit TNT. Their bodies move with the player's physics (player.js); what they look like is in
// models.js. Numbers (health, speed, damage, drops) are the game's.
import {Body} from './player.js';
import {buildModel, animate, MODELS} from './models.js';
import {BLOCKS, ID, MINY, COLORS} from './blocks.js';
import {collisionBoxes} from './shapes.js';

export const MOBS = {
  pig: {zh: '猪', health: 10, speed: 0.25, passive: true, breed: ['carrot', 'potato'], drops: [['porkchop', 1, 3, 'cooked_porkchop']]},
  cow: {zh: '牛', health: 10, speed: 0.2, passive: true, breed: ['wheat'], drops: [['beef', 1, 3, 'cooked_beef'], ['leather', 0, 2]]},
  sheep: {zh: '羊', health: 8, speed: 0.23, passive: true, breed: ['wheat'], drops: [['mutton', 1, 2, 'cooked_mutton']]},
  chicken: {zh: '鸡', health: 4, speed: 0.25, passive: true, breed: ['wheat_seeds'], drops: [['chicken', 1, 1, 'cooked_chicken'], ['feather', 0, 2]]},
  zombie: {zh: '僵尸', health: 20, speed: 0.23, hostile: true, undead: true, damage: 3, range: 35, drops: [['rotten_flesh', 0, 2]], rare: ['carrot', 'potato', 'iron_ingot']},
  skeleton: {zh: '骷髅', health: 20, speed: 0.25, hostile: true, undead: true, range: 16, drops: [['bone', 0, 2], ['arrow', 0, 2]]},
  creeper: {zh: '苦力怕', health: 20, speed: 0.25, hostile: true, range: 16, drops: [['gunpowder', 0, 2]]},
  spider: {zh: '蜘蛛', health: 16, speed: 0.3, hostile: true, damage: 2, range: 16, drops: [['string', 0, 2], ['spider_eye', 0, 1]]},
};
for (const [k, m] of Object.entries(MOBS)) { m.kind = k; m.size = MODELS[k].size; }
const WOOL = COLORS.map(c => c[0]);
// a sheep's natural colour: mostly white, a few greys and blacks, now and then brown or pink
const sheepColor = r => { const x = r * 100; return x < 81.8 ? 'white' : x < 86.8 ? 'black' : x < 91.8 ? 'gray' : x < 96.8 ? 'light_gray' : x < 99.8 ? 'brown' : 'pink'; };
const WOOL_TINT = Object.fromEntries(COLORS.map(([c, , h]) => [c, [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255].map(v => Math.min(1, v * 1.15 + 0.05))]));
WOOL_TINT.white = [1, 1, 1];

let nextId = 1;
export class Mob {
  constructor(kind, x, y, z, world, extra = {}) {
    const d = MOBS[kind];
    this.id = nextId++; this.kind = kind; this.def = d;
    this.body = new Body(world, d.size);
    Object.assign(this.body, {x, y, z, prev: {x, y, z}});
    this.yaw = extra.yaw ?? Math.random() * Math.PI * 2; this.body.yaw = this.yaw;
    this.health = extra.health ?? d.health; this.baby = !!extra.baby; this.grow = extra.grow || 0;
    this.color = extra.color || (kind === 'sheep' ? sheepColor(Math.random()) : null); this.sheared = !!extra.sheared;
    this.headYaw = 0; this.headPitch = 0; this.limb = 0; this.amount = 0; this.age = 0;
    this.hurtT = 0; this.inv = 0; this.dead = 0; this.fire = 0; this.goal = null; this.wait = 20 + Math.floor(Math.random() * 100);
    this.panic = 0; this.love = 0; this.loveWait = 0; this.cool = 0; this.fuse = 0; this.aim = 0; this.graze = 0; this.attackT = 0; this.angry = 0;
    if (this.baby) { this.body.w *= 0.5; this.body.hgt *= 0.5; }
  }
  get x() { return this.body.x; } get y() { return this.body.y; } get z() { return this.body.z; }
  toJSON() { const b = this.body; return {kind: this.kind, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +this.yaw.toFixed(2), health: this.health, baby: this.baby || undefined, grow: this.grow || undefined, color: this.color || undefined, sheared: this.sheared || undefined}; }
}

const angleTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const turn = (a, b, max) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (d > max) d = max; if (d < -max) d = -max; return a + d; };

/**
 * All mobs near the player. ctx (from the page): {world (get/has/light), player (Body), mode(), daylight(), dark(),
 * hurtPlayer(n, why, from), explode(x, y, z, power, source), sound(name, x, y, z), drop(stack, x, y, z), burst(x, y, z, kind),
 * held(), loaded(x, z)}.
 */
export class Mobs {
  constructor(ctx) { this.ctx = ctx; this.list = []; this.arrows = []; this.tnt = []; this.r = Math.random; }
  get world() { return this.ctx.world; }
  add(kind, x, y, z, extra) { const m = new Mob(kind, x, y, z, this.world, extra); this.list.push(m); return m; }
  count(fn) { let n = 0; for (const m of this.list) if (fn(m)) n++; return n; }
  // ---------- each tick ----------
  tick() {
    const {player} = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (!this.ctx.loaded(m.x, m.z)) continue;
      // monsters far away go
      if (m.def.hostile) {
        const d = Math.hypot(m.x - player.x, m.z - player.z);
        if (d > 128 || (d > 40 && Math.random() < 1 / 800) || (this.ctx.daylight() > 0.8 && !m.def.undead && m.kind !== 'spider' && d > 24 && Math.random() < 1 / 400)) { this.list.splice(i, 1); continue; }
      }
      if (m.dead) { if (++m.dead > 20) { this.die(m); this.list.splice(i, 1); } continue; }
      this.think(m);
      this.move(m);
    }
    this.spawnTick();
    this.arrowTick();
    this.tntTick();
  }
  /** Where a mob wants to go and what it does. */
  think(m) {
    const {player} = this.ctx, d = m.def, b = m.body;
    m.age++; if (m.hurtT > 0) m.hurtT--; if (m.inv > 0) m.inv--; if (m.cool > 0) m.cool--; if (m.panic > 0) m.panic--; if (m.attackT > 0) m.attackT--;
    if (m.loveWait > 0) m.loveWait--; if (m.love > 0) m.love--; if (m.angry > 0) m.angry--;
    if (m.baby && ++m.grow >= 24000) { m.baby = false; m.body.w = d.size[0]; m.body.hgt = d.size[1]; }
    // fire: the sun on the undead, lava
    const sky = this.ctx.world.light(Math.floor(m.x), Math.floor(m.y + b.height * 0.8), Math.floor(m.z))[0];
    if (d.undead && this.ctx.daylight() > 0.6 && sky >= 15 && !b.inWater) m.fire = Math.max(m.fire, 160);
    if (b.inLava) m.fire = 300;
    if (b.inWater) m.fire = 0;
    if (m.fire > 0) { m.fire--; if (m.fire % 20 === 0) this.hurt(m, b.inLava ? 4 : 1, null, 'fire'); if (m.age % 4 === 0) this.ctx.burst(m.x, m.y + b.height * 0.6, m.z, 'smoke'); }
    if (b.inLava && m.age % 10 === 0) this.hurt(m, 4, null, 'lava');
    const pd = Math.hypot(player.x - m.x, player.z - m.z), py = player.y - m.y, alive = !player.dead && this.ctx.mode() !== 'creative';
    m.input = {fwd: 0, jump: false, mod: 1};
    m.lookAt = null;
    // monsters
    if (d.hostile) {
      const dark = this.ctx.dark(m.x, m.y + 1, m.z);
      const hunts = alive && pd < d.range && Math.abs(py) < 24 && (m.kind !== 'spider' || dark || m.angry);
      if (hunts) {
        m.lookAt = [player.x, player.y + player.eye, player.z];
        if (m.kind === 'zombie' || m.kind === 'spider') {
          m.goal = [player.x, player.z]; m.input.fwd = 1;
          if (m.kind === 'spider' && b.onGround && pd < 5 && pd > 2 && m.cool === 0 && Math.random() < 0.15) { const a = angleTo(m.x, m.z, player.x, player.z); b.vx += -Math.sin(a) * 0.5; b.vz += -Math.cos(a) * 0.5; b.vy = 0.4; m.cool = 20; }
          if (pd < (m.kind === 'spider' ? 1.6 : 1.4) + d.size[0] / 2 && py > -1.5 && py < 2 && m.attackT === 0) {
            m.attackT = 20; this.ctx.hurtPlayer(d.damage, `被${d.zh}杀死了`, m);
            if (m.kind === 'zombie') this.ctx.sound('zombie', m.x, m.y, m.z);
          }
        } else if (m.kind === 'skeleton') {
          const see = this.sees(m, player);
          m.goal = [player.x, player.z];
          m.input.fwd = pd > 12 || !see ? 1 : pd < 6 ? -0.7 : 0;
          if (pd > 4 && pd < 12) m.strafe = Math.sin(m.age / 30) > 0 ? 0.5 : -0.5; else m.strafe = 0;
          m.aim = see && pd < 15 ? m.aim + 1 : 0;
          if (m.aim >= 30 + (m.id % 20)) { m.aim = 0; this.shoot(m, player); }
        } else if (m.kind === 'creeper') {
          m.goal = [player.x, player.z];
          if (pd < 3 && Math.abs(py) < 3) { m.input.fwd = 0; if (m.fuse === 0) this.ctx.sound('fuse', m.x, m.y, m.z); m.fuse++; }
          else { m.input.fwd = 1; if (pd > 7) m.fuse = Math.max(0, m.fuse - 1); else if (m.fuse) m.fuse++; }
          if (m.fuse >= 30) { this.list.splice(this.list.indexOf(m), 1); this.ctx.explode(m.x, m.y + 0.8, m.z, 3, m); return; }
        }
        return;
      }
      m.fuse = Math.max(0, m.fuse - 1); m.aim = 0;
    }
    // animals: run when hurt, come to their food, find a mate
    if (d.passive) {
      if (m.panic > 0) { if (!m.goal || m.wait-- <= 0) { m.goal = [m.x + (Math.random() - 0.5) * 16, m.z + (Math.random() - 0.5) * 16]; m.wait = 30; } m.input.fwd = 1; m.input.mod = 1.25; return; }
      const held = this.ctx.held();
      if (m.love > 0) {
        const mate = this.list.find(o => o !== m && o.kind === m.kind && o.love > 0 && !o.dead && Math.hypot(o.x - m.x, o.z - m.z) < 8);
        if (mate) {
          m.goal = [mate.x, mate.z]; m.input.fwd = Math.hypot(mate.x - m.x, mate.z - m.z) > 1.5 ? 1 : 0; m.lookAt = [mate.x, mate.y + 0.5, mate.z];
          if (Math.hypot(mate.x - m.x, mate.z - m.z) < 2 && m.id < mate.id) {
            m.love = mate.love = 0; m.loveWait = mate.loveWait = 6000;
            this.add(m.kind, (m.x + mate.x) / 2, m.y, (m.z + mate.z) / 2, {baby: true, color: m.kind === 'sheep' ? (Math.random() < 0.5 ? m.color : mate.color) : null});
            this.ctx.burst(m.x, m.y + 1, m.z, 'heart'); this.ctx.xp?.(1 + Math.floor(Math.random() * 7));
          }
          return;
        }
      }
      if (held && d.breed.includes(held.id) && pd < 10 && !player.dead) {
        m.lookAt = [player.x, player.y + player.eye, player.z];
        if (pd > 2.5) { m.goal = [player.x, player.z]; m.input.fwd = 1; m.input.mod = 1.1; }
        return;
      }
      // sheep eat grass (and their wool grows back)
      if (m.kind === 'sheep' && m.graze > 0) { if (--m.graze === 4) { const gx = Math.floor(m.x), gy = Math.floor(m.y - 0.5), gz = Math.floor(m.z); if ((this.world.get(gx, gy, gz) & 0xFFF) === ID.grass_block) { this.ctx.setBlock(gx, gy, gz, ID.dirt); m.sheared = false; if (m.baby) m.grow += 1200; } } return; }
      if (m.kind === 'sheep' && b.onGround && Math.random() < (m.baby ? 1 / 50 : 1 / 1000) && (this.world.get(Math.floor(m.x), Math.floor(m.y - 0.5), Math.floor(m.z)) & 0xFFF) === ID.grass_block) { m.graze = 40; return; }
      if (m.kind === 'chicken' && !b.onGround && b.vy < 0) b.vy *= 0.6;
    }
    // wander
    if (m.goal && Math.hypot(m.goal[0] - m.x, m.goal[1] - m.z) > 1 && m.wait > -200) { m.input.fwd = 1; m.wait--; return; }
    m.goal = null;
    if (--m.wait <= 0) {
      m.wait = 60 + Math.floor(Math.random() * 120);
      if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7, gx = m.x + Math.cos(a) * r, gz = m.z + Math.sin(a) * r; if (this.ctx.loaded(gx, gz)) m.goal = [gx, gz]; }
    }
    if (!m.lookAt && pd < 8 && Math.random() < 0.02) m.lookUntil = m.age + 40;
    if (m.lookUntil > m.age) m.lookAt = [player.x, player.y + player.eye, player.z];
  }
  /** Walks toward the goal: turning, jumping over steps, not off cliffs or into lava. */
  move(m) {
    const b = m.body, d = m.def, inp = m.input || {fwd: 0, mod: 1};
    let fwd = inp.fwd;
    if (m.goal) {
      const want = angleTo(m.x, m.z, m.goal[0], m.goal[1]);
      m.yaw = turn(m.yaw, inp.fwd < 0 ? want : want, 0.35);
    }
    if (fwd) {
      // a drop or lava ahead: stop (monsters chasing take drops up to three blocks)
      const ax = Math.floor(m.x - Math.sin(m.yaw) * (b.w / 2 + 0.6)), az = Math.floor(m.z - Math.cos(m.yaw) * (b.w / 2 + 0.6));
      let drop = 0;
      for (let y = Math.floor(m.y) - 1; y > Math.floor(m.y) - 5 && !collisionBoxes(this.world.get(ax, y, az)); y--) { drop++; if ((this.world.get(ax, y, az) & 0xFFF) === ID.lava) { drop = 9; break; } }
      if (drop >= (d.hostile ? 4 : 2) || (this.world.get(ax, Math.floor(m.y), az) & 0xFFF) === ID.lava) { fwd = 0; m.goal = null; }
    }
    b.yaw = m.yaw;
    const speed = d.speed * (inp.mod || 1) * (m.baby ? 1.2 : 1);
    const jump = b.inWater || b.inLava || (b.collidedX && fwd !== 0) || inp.jump;
    const r = b.tick({fwd: fwd * speed / 0.98, side: (m.strafe || 0) * speed / 0.98, speed, jump, autoJump: false});
    // spiders climb walls
    if (m.kind === 'spider' && b.collidedX && fwd) b.vy = 0.2;
    if (r.landed > 3) this.hurt(m, Math.ceil(r.landed - 3), null, 'fall');
    // the head follows what it looks at
    if (m.lookAt) {
      const dx = m.lookAt[0] - m.x, dy = m.lookAt[1] - (m.y + b.eye), dz = m.lookAt[2] - m.z, h = Math.hypot(dx, dz);
      const want = angleTo(0, 0, dx, dz);
      m.headYaw = Math.max(-1.2, Math.min(1.2, ((want - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      m.headPitch = Math.max(-0.8, Math.min(0.8, -Math.atan2(dy, h)));
      if (!m.goal && Math.abs(m.headYaw) > 0.9) m.yaw = turn(m.yaw, want, 0.1);
    } else { m.headYaw *= 0.9; m.headPitch *= 0.9; }
    const moved = Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
    m.limb += moved * 4; m.amount += (Math.min(1, moved * 4) - m.amount) * 0.4;
    if (m.age % 160 === m.id % 160 && Math.random() < 0.5) this.ctx.sound(m.kind, m.x, m.y, m.z);
    if (b.y < MINY - 64) { m.health = 0; m.dead = 20; }
  }
  /** Can a mob see the player (nothing solid between their eyes)? */
  sees(m, p) {
    const ax = m.x, ay = m.y + m.body.eye, az = m.z, bx = p.x, by = p.y + p.eye, bz = p.z, n = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) * 2);
    for (let i = 1; i < n; i++) { const t = i / n, v = this.world.get(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), Math.floor(az + (bz - az) * t)); if (v && BLOCKS[v & 0xFFF].opaque) return false; }
    return true;
  }
  // ---------- hurting ----------
  /** A hit: damage, a knock away from the source, the red flash; dead at no health. */
  hurt(m, n, from = null, why = 'hit') {
    if (m.dead || (m.inv > 0 && why === 'hit')) return false;
    m.health -= n; m.hurtT = 10; if (why === 'hit' || why === 'arrow') m.inv = 10;
    if (from) {
      const a = Math.atan2(m.x - from.x, m.z - from.z), k = from.knock ?? 0.4;
      m.body.vx += Math.sin(a) * k; m.body.vz += Math.cos(a) * k; if (m.body.onGround) m.body.vy = 0.36;
    }
    if (m.def.passive) m.panic = 100;
    if (m.kind === 'spider' || (m.def.hostile && from?.player)) m.angry = 600;
    this.ctx.sound(m.health <= 0 ? `${m.kind}_death` : `${m.kind}_hurt`, m.x, m.y, m.z);
    if (m.health <= 0) { m.dead = 1; m.killedByPlayer = !!from?.player; }
    return true;
  }
  die(m) {
    this.ctx.burst(m.x, m.y + m.body.height / 2, m.z, 'poof');
    if (m.baby) return;
    for (const [id, lo, hi, cooked] of m.def.drops) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1 + (m.killedByPlayer ? this.ctx.looting?.() || 0 : 0)));
      if (n > 0) this.ctx.drop({id: m.fire > 0 && cooked ? cooked : id, n}, m.x, m.y + 0.5, m.z);
    }
    if (m.kind === 'sheep' && !m.sheared) this.ctx.drop({id: `${m.color || 'white'}_wool`, n: 1}, m.x, m.y + 0.5, m.z);
    if (m.def.rare && m.killedByPlayer && Math.random() < 0.025) this.ctx.drop({id: m.def.rare[Math.floor(Math.random() * m.def.rare.length)], n: 1}, m.x, m.y + 0.5, m.z);
    if (m.killedByPlayer) this.ctx.xp?.(m.def.hostile ? 5 : 1 + Math.floor(Math.random() * 3));
  }
  /** The mob a ray from the eye hits first within reach: {mob, t} or null. */
  raycast(ox, oy, oz, dx, dy, dz, reach) {
    let best = null;
    for (const m of this.list) {
      if (m.dead) continue;
      const [x0, y0, z0, x1, y1, z1] = m.body.aabb();
      let tmin = 0, tmax = reach, ok = true;
      for (const [o, d, lo, hi] of [[ox, dx, x0 - 0.1, x1 + 0.1], [oy, dy, y0, y1 + 0.1], [oz, dz, z0 - 0.1, z1 + 0.1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
        let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) { ok = false; break; }
      }
      if (ok && (!best || tmin < best.t)) best = {mob: m, t: tmin};
    }
    return best;
  }
  // ---------- spawning ----------
  /** Monsters in the dark around the player (one try a tick), up to a limit. */
  spawnTick() {
    const {player} = this.ctx;
    if (this.ctx.mode() === 'creative' && this.ctx.peaceful?.()) return;
    if (this.count(m => m.def.hostile) >= 18 || Math.random() > 0.25) return;
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 40, x = Math.floor(player.x + Math.cos(a) * r), z = Math.floor(player.z + Math.sin(a) * r);
    if (!this.ctx.loaded(x, z)) return;
    // the surface, or a cave below it
    let top = 320; while (top > MINY && !collisionBoxes(this.world.get(x, top, z))) top--;
    let y = top + 1;
    if (Math.random() < 0.6) { y = MINY + 2 + Math.floor(Math.random() * (top - MINY - 2)); while (y < top && !(collisionBoxes(this.world.get(x, y - 1, z)) && !this.world.get(x, y, z))) y++; }
    const below = this.world.get(x, y - 1, z), here = this.world.get(x, y, z), above = this.world.get(x, y + 1, z);
    if (!collisionBoxes(below) || BLOCKS[below & 0xFFF].shape === 'slab' || (below & 0xFFF) === ID.bedrock || here || above) return;
    if (!this.ctx.dark(x + 0.5, y, z + 0.5, true)) return;
    if (Math.hypot(x - player.x, z - player.z) < 24) return;
    const kinds = ['zombie', 'zombie', 'skeleton', 'skeleton', 'creeper', 'spider'], kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === 'spider' && (collisionBoxes(this.world.get(x + 1, y, z)) || collisionBoxes(this.world.get(x - 1, y, z)))) return;
    this.add(kind, x + 0.5, y, z + 0.5);
  }
  // ---------- arrows ----------
  shoot(m, p) {
    const ax = m.x, ay = m.y + m.body.eye - 0.1, az = m.z, dx = p.x - ax, dz = p.z - az, h = Math.hypot(dx, dz), dy = p.y + p.height / 3 - ay + h * 0.2;
    const len = Math.hypot(dx, dy, dz), v = 1.6, spread = 0.0075 * 6;
    const dir = [dx / len + (Math.random() - 0.5) * spread, dy / len + (Math.random() - 0.5) * spread, dz / len + (Math.random() - 0.5) * spread];
    this.arrows.push({x: ax, y: ay, z: az, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v, from: m, life: 0, stuck: false, dmg: 2});
    this.ctx.sound('bow', ax, ay, az);
  }
  /** The player's arrow: power 0–1. */
  shootFromPlayer(p, look, power, pickup) {
    const v = power * 3, eye = p.y + p.eye;
    this.arrows.push({x: p.x + look[0] * 0.3, y: eye - 0.1, z: p.z + look[2] * 0.3, vx: look[0] * v, vy: look[1] * v, vz: look[2] * v, from: 'player', life: 0, stuck: false, dmg: 2, crit: power >= 1, pickup});
  }
  arrowTick() {
    const {player} = this.ctx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life++;
      if (a.stuck) {
        if (a.life > 1200) { this.arrows.splice(i, 1); continue; }
        if (a.from === 'player' && a.pickup && Math.hypot(player.x - a.x, player.y + 1 - a.y, player.z - a.z) < 1.5 && this.ctx.give({id: 'arrow', n: 1})) { this.arrows.splice(i, 1); this.ctx.sound('pop'); }
        // the block it is in went away: fall
        if (!collisionBoxes(this.world.get(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))) a.stuck = false;
        continue;
      }
      const steps = Math.ceil(Math.hypot(a.vx, a.vy, a.vz) / 0.25);
      let hit = false;
      for (let s = 0; s < steps && !hit; s++) {
        const nx = a.x + a.vx / steps, ny = a.y + a.vy / steps, nz = a.z + a.vz / steps;
        // mobs and the player
        const speed = Math.hypot(a.vx, a.vy, a.vz), dmg = Math.ceil(speed * a.dmg + (a.crit ? Math.random() * speed * a.dmg / 2 : 0));
        if (a.from !== 'player' && a.life > 1) {
          const [x0, y0, z0, x1, y1, z1] = player.aabb();
          if (nx > x0 - 0.1 && nx < x1 + 0.1 && ny > y0 && ny < y1 && nz > z0 - 0.1 && nz < z1 + 0.1) { this.ctx.hurtPlayer(dmg, `被${a.from?.def?.zh || ''}射杀了`, {x: a.x, z: a.z}); this.arrows.splice(i, 1); hit = true; break; }
        }
        for (const m of this.list) {
          if (m === a.from || m.dead || (a.life < 2 && a.from !== 'player')) continue;
          const [x0, y0, z0, x1, y1, z1] = m.body.aabb();
          if (nx > x0 && nx < x1 && ny > y0 && ny < y1 && nz > z0 && nz < z1) { this.hurt(m, dmg, {x: a.x, z: a.z, player: a.from === 'player', knock: 0.3}, 'arrow'); this.arrows.splice(i, 1); hit = true; this.ctx.sound('arrow_hit', a.x, a.y, a.z); break; }
        }
        if (hit) break;
        const bs = collisionBoxes(this.world.get(Math.floor(nx), Math.floor(ny), Math.floor(nz)));
        if (bs && bs.some(q => nx - Math.floor(nx) >= q[0] && nx - Math.floor(nx) <= q[3] && ny - Math.floor(ny) >= q[1] && ny - Math.floor(ny) <= q[4] && nz - Math.floor(nz) >= q[2] && nz - Math.floor(nz) <= q[5])) {
          a.stuck = true; a.life = 0; this.ctx.sound('arrow_hit', nx, ny, nz); hit = true; break;
        }
        a.x = nx; a.y = ny; a.z = nz;
      }
      if (!hit) { a.vx *= 0.99; a.vy = a.vy * 0.99 - 0.05; a.vz *= 0.99; if (this.world.get(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)) === ID.water) { a.vx *= 0.6; a.vy *= 0.6; a.vz *= 0.6; } }
      if (a.life > 600 && !a.stuck) this.arrows.splice(i, 1);
    }
  }
  // ---------- lit TNT ----------
  light(x, y, z, fuse = 80) { this.tnt.push({x: x + 0.5, y, z: z + 0.5, vx: (Math.random() - 0.5) * 0.04, vy: 0.2, vz: (Math.random() - 0.5) * 0.04, fuse}); this.ctx.sound('fuse', x, y, z); }
  tntTick() {
    for (let i = this.tnt.length - 1; i >= 0; i--) {
      const t = this.tnt[i];
      t.vy -= 0.04;
      const ny = t.y + t.vy;
      if (collisionBoxes(this.world.get(Math.floor(t.x), Math.floor(ny), Math.floor(t.z)))) { t.vy = 0; t.y = Math.floor(ny) + 1; } else t.y = ny;
      t.x += t.vx; t.z += t.vz; t.vx *= 0.98; t.vz *= 0.98;
      if (--t.fuse <= 0) { this.tnt.splice(i, 1); this.ctx.explode(t.x, t.y + 0.5, t.z, 4, null); }
      else if (t.fuse % 10 === 0) this.ctx.burst(t.x, t.y + 1, t.z, 'smoke');
    }
  }
  // ---------- explosions near things ----------
  /** Hurts and pushes what is near an explosion (the player is done by the page). */
  blast(x, y, z, power) {
    const r = power * 2;
    for (const m of this.list) {
      const d = Math.hypot(m.x - x, m.y + m.body.height / 2 - y, m.z - z);
      if (d >= r) continue;
      const k = 1 - d / r, dmg = Math.floor((k * k + k) / 2 * 7 * r + 1);
      this.hurt(m, dmg, {x, z, knock: k * 1.2}, 'blast');
      m.body.vy += k * 0.5;
    }
    for (const t of this.tnt) if (Math.hypot(t.x - x, t.y - y, t.z - z) < r) { t.vx += (t.x - x) * 0.1; t.vy += 0.2; t.vz += (t.z - z) * 0.1; }
  }
  // ---------- drawing ----------
  /** [{skin, verts: Float32Array, light: [sky, blk], tint, hurt, white}] relative to the camera. */
  drawList(view, light, sizes = {}) {
    const out = [];
    for (const m of this.list) {
      const dx = m.x - view.x, dz = m.z - view.z;
      if (dx * dx + dz * dz > view.far * view.far) continue;
      const b = m.body, a = view.alpha ?? 1, x = b.prev.x + (b.x - b.prev.x) * a - view.x, y = b.prev.y + (b.y - b.prev.y) * a - view.y, z = b.prev.z + (b.z - b.prev.z) * a - view.z;
      const rot = animate(m.kind, {}, {limb: m.limb, amount: m.amount, headYaw: -m.headYaw, headPitch: m.headPitch, age: m.age, attack: m.attackT > 10 ? 1 : 0, aim: m.aim > 0, fall: !b.onGround, graze: m.graze > 0});
      const s = m.baby ? 0.5 : 1, roll = m.dead ? Math.min(1, m.dead / 10) * Math.PI / 2 : 0, swell = m.fuse ? Math.min(1, m.fuse / 30) * 0.3 * (1 + Math.sin(m.fuse * 0.9) * 0.15) : 0;
      const [sky, blk] = light(Math.floor(m.x), Math.floor(m.y + b.height / 2), Math.floor(m.z));
      const pose = {x, y, z, yaw: m.yaw, s, roll, swell}, hurt = m.hurtT > 0 || m.dead ? 1 : 0, white = m.fuse && Math.floor(m.fuse / 5) % 2 ? 0.6 : 0;
      const fire = m.fire > 0 ? 1 : 0;
      out.push({skin: m.kind, verts: new Float32Array(buildModel(m.kind, rot, pose, [], sizes[m.kind])), light: [sky, Math.max(blk, fire ? 14 : 0)], tint: [1, 1, 1], hurt, white});
      if (m.kind === 'sheep' && !m.sheared) out.push({skin: 'sheep_wool', verts: new Float32Array(buildModel('sheep_wool', rot, pose, [], sizes.sheep_wool)), light: [sky, blk], tint: WOOL_TINT[m.color] || [1, 1, 1], hurt, white: 0});
    }
    return out;
  }
  toJSON() { return this.list.filter(m => m.def.passive && !m.dead).map(m => m.toJSON()); }
  load(list) { for (const s of list || []) if (MOBS[s.kind]?.passive) this.add(s.kind, s.x, s.y, s.z, s); }
}
export {WOOL};
