// Mobs and other moving things: animals (pigs, cows, sheep, chickens) that wander, flee when hit, follow the food they
// like and have young; monsters (zombies, skeletons, creepers, spiders) that come out in the dark, hunt the player and
// burn in the sun; the Nether's (zombified piglins that only fight back, ghasts and blazes shooting fireballs, magma
// cubes that split); arrows, fireballs; lit TNT. Their bodies move with the player's physics (player.js); what they look like is in
// models.js. Numbers (health, speed, damage, drops) are the game's.
import {Body, isWater} from './player.js';
import {buildModel, animate, MODELS} from './models.js';
import {BLOCKS, ID, MINY, COLORS, SEA, withMeta} from './blocks.js';
import {collisionBoxes} from './shapes.js';
import {fortressAt, spawnersNear} from './nether.js';
import {newWork, PROFESSIONS, restock} from './trades.js';
import {BIOMES} from './gen.js';

// the swamps' biome numbers (the mangrove swamp too), and the columns of land where slimes come up deep down (one in ten, by the world's seed)
const SWAMPS = new Set(BIOMES.map((b, i) => b.name === 'swamp' || b.name === 'mangrove_swamp' ? i : -1).filter(i => i >= 0));
const slimePlace = (seed, cx, cz) => { let h = (Number(seed) || 0) ^ Math.imul(cx, 0x5bd1e995) ^ Math.imul(cz, 0x27d4eb2d) ^ 0x3c6ef372; h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); h = Math.imul(h ^ h >>> 12, 0x297a2d39); return ((h ^ h >>> 15) >>> 0) % 10 === 0; };
export const MOBS = {
  pig: {zh: '猪', health: 10, speed: 0.25, passive: true, breed: ['carrot', 'potato', 'beetroot'], drops: [['porkchop', 1, 3, 'cooked_porkchop']]},
  cow: {zh: '牛', health: 10, speed: 0.2, passive: true, breed: ['wheat'], drops: [['beef', 1, 3, 'cooked_beef'], ['leather', 0, 2]]},
  sheep: {zh: '羊', health: 8, speed: 0.23, passive: true, breed: ['wheat'], drops: [['mutton', 1, 2, 'cooked_mutton']]},
  chicken: {zh: '鸡', health: 4, speed: 0.25, passive: true, breed: ['wheat_seeds', 'beetroot_seeds'], drops: [['chicken', 1, 1, 'cooked_chicken'], ['feather', 0, 2]]},
  zombie: {zh: '僵尸', health: 20, speed: 0.23, hostile: true, undead: true, damage: 3, range: 35, drops: [['rotten_flesh', 0, 2]], rare: ['carrot', 'potato', 'iron_ingot']},
  skeleton: {zh: '骷髅', health: 20, speed: 0.25, hostile: true, undead: true, range: 16, drops: [['bone', 0, 2], ['arrow', 0, 2]]},
  creeper: {zh: '苦力怕', health: 20, speed: 0.25, hostile: true, range: 16, drops: [['gunpowder', 0, 2]]},
  spider: {zh: '蜘蛛', health: 16, speed: 0.3, hostile: true, damage: 2, range: 16, drops: [['string', 0, 2], ['spider_eye', 0, 1]]},
  // the Nether (neutral: only angry when one of them is hit; fireproof: fire and lava do nothing)
  zombified_piglin: {zh: '僵尸猪灵', health: 20, speed: 0.23, hostile: true, neutral: true, undead: true, fireproof: true, damage: 8, range: 35, xp: 5, drops: [['rotten_flesh', 0, 1], ['gold_nugget', 0, 1]], rare: ['gold_ingot']},
  ghast: {zh: '恶魂', health: 10, speed: 0.1, hostile: true, fireproof: true, flies: 'ghast', range: 64, xp: 5, drops: [['ghast_tear', 0, 1], ['gunpowder', 0, 2]]},
  blaze: {zh: '烈焰人', health: 20, speed: 0.23, hostile: true, fireproof: true, flies: 'blaze', glow: true, range: 48, xp: 10, drops: [['blaze_rod', 0, 1]]},
  // villages (kept in the save like animals): villagers trade and run from zombies; the iron golem guards them
  villager: {zh: '村民', health: 20, speed: 0.25, passive: true, keep: true, breed: [], drops: []},
  iron_golem: {zh: '铁傀儡', health: 100, speed: 0.25, keep: true, golem: true, range: 16, xp: 0, drops: [['iron_ingot', 3, 5], ['poppy', 0, 2]]},
  magma_cube: {zh: '岩浆怪', health: 16, speed: 0.2, hostile: true, fireproof: true, range: 16, cube: true, drops: [['magma_cream', 0, 1]]},
  // slimes: hopping cubes like the magma cube, in swamps at night and deep under ground in one place in ten; the small ones drop slime balls
  slime: {zh: '史莱姆', health: 16, speed: 0.2, hostile: true, range: 16, cube: true, drops: [['slime_ball', 0, 2]]},
  // the sea (water: they live in it — out of it a fish flops and runs out of air; they come and go round the player, and
  // stay only out of a bucket): squids (ink when hit) and the glowing ones deep down; cod, salmon, tropical fish (each
  // its colour), the pufferfish (swelling when someone is near, stinging with poison); turtles on the beaches and in the
  // sea — bred with seagrass, a mother lays her eggs on the sand; a young one grown up leaves a scute
  squid: {zh: '鱿鱼', health: 10, speed: 0.12, passive: true, water: 'squid', breed: [], drops: [['ink_sac', 1, 3]]},
  glow_squid: {zh: '发光鱿鱼', health: 10, speed: 0.12, passive: true, water: 'squid', glow: true, breed: [], drops: [['glow_ink_sac', 1, 3]]},
  cod: {zh: '鳕鱼', health: 3, speed: 0.1, passive: true, water: 'fish', breed: [], drops: [['cod', 1, 1, 'cooked_cod']], rare: ['bone_meal'], bucket: 'cod_bucket'},
  salmon: {zh: '鲑鱼', health: 3, speed: 0.1, passive: true, water: 'fish', breed: [], drops: [['salmon', 1, 1, 'cooked_salmon']], rare: ['bone_meal'], bucket: 'salmon_bucket'},
  tropical_fish: {zh: '热带鱼', health: 3, speed: 0.1, passive: true, water: 'fish', breed: [], drops: [['tropical_fish', 1, 1]], rare: ['bone_meal'], bucket: 'tropical_fish_bucket'},
  pufferfish: {zh: '河豚', health: 3, speed: 0.08, passive: true, water: 'fish', breed: [], drops: [['pufferfish', 1, 1]], rare: ['bone_meal'], bucket: 'pufferfish_bucket'},
  turtle: {zh: '海龟', health: 30, speed: 0.12, passive: true, amphibious: true, breed: ['seagrass'], drops: [['seagrass', 0, 2]]},
};
// a tropical fish's colours (tinting its white picture): the game's sixteen dye colours
const FISH_COLORS = COLORS.map(([, , h]) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]);
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
    // a hen lays an egg every five to ten minutes (the game's 6000–12000 ticks)
    if (kind === 'chicken') this.egg = extra.egg || 6000 + Math.floor(Math.random() * 6000);
    this.panic = 0; this.love = 0; this.loveWait = 0; this.cool = 0; this.fuse = 0; this.aim = 0; this.graze = 0; this.attackT = 0; this.angry = 0; this.burnT = 0;
    if (this.baby) { this.body.w *= 0.5; this.body.hgt *= 0.5; }
    // a magma cube is big (4), middling (2) or small (1): its size × the box, size² health
    this.home = extra.home || null;
    // a villager's trade: its work (offers, experience) and the work block it has taken
    if (kind === 'villager') {
      const prof = extra.prof || 'none', seed = extra.seed ?? Math.floor(Math.random() * 2 ** 30);
      Object.assign(this, extra.offers ? {prof, xp: extra.xp || 0, seed, offers: extra.offers} : PROFESSIONS[prof] ? newWork(prof, seed) : {prof, xp: 0, seed, offers: []});
      this.job = extra.job || null; this.shake = 0; this.trading = false;
    }
    if (d.cube) { this.mag = extra.mag || [1, 2, 4][Math.floor(Math.random() * 3)]; this.body.w *= this.mag; this.body.hgt *= this.mag; if (extra.health == null) this.health = this.mag * this.mag; this.hop = 10; this.squish = 0; }
    // the sea's: air to hold out of the water, kept when let out of a bucket; a tropical fish's colour; a pufferfish's
    // swelling; a turtle's beach
    if (d.water) { this.air = 300; this.persist = !!extra.persist; this.tm = 0; this.tSpeed = 0.15; this.tentacles = 0; this.puff = 0; }
    if (kind === 'tropical_fish') this.color = extra.color ?? Math.floor(Math.random() * 16);
    if (kind === 'turtle') { this.beach = extra.beach || [Math.floor(x), Math.floor(y), Math.floor(z)]; this.egg = !!extra.egg; }
  }
  get x() { return this.body.x; } get y() { return this.body.y; } get z() { return this.body.z; }
  toJSON() {
    const b = this.body;
    return {kind: this.kind, x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), yaw: +this.yaw.toFixed(2), health: this.health, baby: this.baby || undefined, grow: this.grow || undefined, color: this.color || undefined, sheared: this.sheared || undefined,
      home: this.home || undefined, ...(this.kind === 'villager' ? {prof: this.prof, xp: this.xp, seed: this.seed, offers: this.offers, job: this.job || undefined} : {}),
      ...(this.persist ? {persist: true} : {}), ...(this.kind === 'turtle' ? {beach: this.beach, egg: this.egg || undefined} : {})};
  }
}

const angleTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const turn = (a, b, max) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (d > max) d = max; if (d < -max) d = -max; return a + d; };

/**
 * All mobs near the player. ctx (from the page): {world (get/has/light), player (Body), mode(), daylight(), dark(),
 * hurtPlayer(n, why, from), explode(x, y, z, power, source), sound(name, x, y, z), drop(stack, x, y, z), burst(x, y, z, kind),
 * held(), loaded(x, z)}.
 */
export class Mobs {
  constructor(ctx) { this.ctx = ctx; this.list = []; this.arrows = []; this.balls = []; this.tnt = []; this.r = Math.random; this.spawnerT = new Map(); }
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
      if (m.def.water && !m.persist && !m.dead) {
        const d = Math.hypot(m.x - player.x, m.z - player.z);
        if (d > 128 || (d > 40 && Math.random() < 1 / 600)) { this.list.splice(i, 1); continue; }
      }
      if (m.dead) { if (++m.dead > 20) { this.die(m); this.list.splice(i, 1); } continue; }
      this.think(m);
      this.move(m);
      if (m.kind === 'chicken' && !m.baby && --m.egg <= 0) { m.egg = 6000 + Math.floor(this.r() * 6000); this.ctx.drop({id: 'egg', n: 1}, m.x, m.y + 0.3, m.z); this.ctx.sound('pop', m.x, m.y, m.z); }
    }
    this.spawnTick();
    this.seaSpawnTick();
    this.spawnerTick();
    this.arrowTick();
    this.ballTick();
    this.tntTick();
  }
  /** Where a mob wants to go and what it does. */
  think(m) {
    const {player} = this.ctx, d = m.def, b = m.body;
    m.age++; if (m.hurtT > 0) m.hurtT--; if (m.inv > 0) m.inv--; if (m.cool > 0) m.cool--; if (m.panic > 0) m.panic--; if (m.attackT > 0) m.attackT--;
    if (m.loveWait > 0) m.loveWait--; if (m.love > 0) m.love--; if (m.angry > 0) m.angry--;
    if (m.baby && ++m.grow >= 24000) { m.baby = false; m.body.w = d.size[0]; m.body.hgt = d.size[1]; if (m.kind === 'turtle') this.ctx.drop({id: 'turtle_scute', n: 1}, m.x, m.y + 0.3, m.z); }
    if (d.water) { this.swim(m); return; }
    if (m.kind === 'turtle' && this.turtle(m)) return;
    // fire: the sun on the undead, lava
    const sky = this.ctx.world.light(Math.floor(m.x), Math.floor(m.y + b.height * 0.8), Math.floor(m.z))[0];
    const wet = b.inWater || (sky >= 15 && !!this.ctx.raining?.(m.x, m.z));
    if (d.undead && this.ctx.daylight() > 0.6 && sky >= 15 && !wet) m.fire = Math.max(m.fire, 160);
    if (b.inLava && !d.fireproof) m.fire = 300;
    if (d.fireproof) m.fire = 0;
    if (wet && !b.inLava) m.fire = 0;
    // burning hurts once a second (counted on its own: the sun keeps setting the fire's time back, so its time never
    // reached a whole second and the undead never burned)
    if (m.fire > 0) { m.fire--; if (++m.burnT % 20 === 0) this.hurt(m, b.inLava ? 4 : 1, null, 'fire'); if (m.age % 4 === 0) this.ctx.burst(m.x, m.y + b.height * 0.6, m.z, 'smoke'); }
    if (b.inLava && !d.fireproof && m.age % 10 === 0) this.hurt(m, 4, null, 'lava');
    const pd = Math.hypot(player.x - m.x, player.z - m.z), py = player.y - m.y, alive = !player.dead && this.ctx.mode() !== 'creative';
    m.input = {fwd: 0, jump: false, mod: 1};
    m.lookAt = null;
    // an invisible player is noticed only from close by
    const range = d.range * (this.ctx.invisible?.() ? 0.1 : 1);
    if (m.kind === 'villager') { if (this.villager(m, pd)) return; }
    if (m.kind === 'iron_golem' && this.golem(m, pd)) return;
    if (m.kind === 'ghast') { this.ghast(m, pd, alive && pd < range); return; }
    if (m.kind === 'blaze') { this.blaze(m, pd, py, alive && pd < range); return; }
    if (m.def.cube) { this.cube(m, pd, py, alive && pd < range && Math.abs(py) < 16); return; }
    // monsters
    if (d.hostile) {
      const dark = this.ctx.dark(m.x, m.y + 1, m.z);
      const hunts = alive && pd < range && Math.abs(py) < 24 && (m.kind !== 'spider' || dark || m.angry) && (!d.neutral || m.angry > 0);
      if (hunts) {
        m.lookAt = [player.x, player.y + player.eye, player.z];
        if (m.kind === 'zombie' || m.kind === 'spider' || m.kind === 'zombified_piglin') {
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
      // a zombie with no player to chase goes for a villager
      if (m.kind === 'zombie') {
        if (m.age % 10 === 0) m.prey = this.nearest(m, o => o.kind === 'villager', 24);
        const v = m.prey;
        if (v && !v.dead) {
          m.goal = [v.x, v.z]; m.input.fwd = 1; m.lookAt = [v.x, v.y + 1.5, v.z];
          if (Math.hypot(v.x - m.x, v.z - m.z) < 1.5 && Math.abs(v.y - m.y) < 2 && m.attackT === 0) { m.attackT = 20; this.hurt(v, 3, {x: m.x, z: m.z}); }
          return;
        }
      }
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
            // turtles: no young here — the mother carries eggs to lay on her beach
            if (m.kind === 'turtle') m.egg = true;
            else this.add(m.kind, (m.x + mate.x) / 2, m.y, (m.z + mate.z) / 2, {baby: true, color: m.kind === 'sheep' ? (Math.random() < 0.5 ? m.color : mate.color) : null});
            this.ctx.burst(m.x, m.y + 1, m.z, 'heart'); this.ctx.xp?.(1 + Math.floor(Math.random() * 7), m.x, m.y + 0.5, m.z);
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
  /** The nearest other mob within reach that fn accepts, or null. */
  nearest(m, fn, reach) {
    let best = null, bd = reach;
    for (const o of this.list) { if (o === m || o.dead || !fn(o)) continue; const d = Math.hypot(o.x - m.x, o.y - m.y, o.z - m.z); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  /**
   * A villager: still while it trades (or shakes its head); runs from zombies; one without work takes a free work block
   * near it (and loses it again if the block goes before it has traded); back in stock twice a day; it keeps near its
   * village. Returns true when it has done its thinking.
   */
  villager(m, pd) {
    const {player} = this.ctx;
    if (m.shake > 0) m.shake--;
    if (m.trading || m.shake > 0) { m.lookAt = [player.x, player.y + player.eye, player.z]; m.goal = null; return true; }
    if (m.age % 10 === 0) { const z = this.nearest(m, o => o.kind === 'zombie', 8); if (z) { m.panic = 60; const a = Math.atan2(m.x - z.x, m.z - z.z); m.goal = [m.x + Math.sin(a) * 10, m.z + Math.cos(a) * 10]; m.wait = 30; } }
    if (m.age % 100 === m.id % 100 && !m.baby) this.findWork(m);
    if (m.offers.length && m.age % 12000 === 6000) restock(m);
    if (m.age % 160 === m.id % 160 && Math.random() < 0.4) this.ctx.sound('villager', m.x, m.y, m.z);
    // too far from its village: back toward it
    if (m.home && !m.panic && Math.hypot(m.home[0] - m.x, m.home[2] - m.z) > 28 && (!m.goal || m.wait < 0)) { m.goal = [m.home[0] + (Math.random() - 0.5) * 10, m.home[2] + (Math.random() - 0.5) * 10]; m.wait = 200; }
    return false;
  }
  /** Taking a work block (one no other villager has, within eight blocks), or losing it. */
  findWork(m) {
    const w = this.world;
    if (m.job) {
      const [x, y, z] = m.job;
      if (!this.ctx.loaded(x, z) || BLOCKS[w.get(x, y, z) & 0xFFF]?.name === PROFESSIONS[m.prof]?.block) return;
      m.job = null;
      if (m.xp === 0) { m.prof = 'none'; m.offers = []; this.ctx.burst(m.x, m.y + 2, m.z, 'smoke'); }
      return;
    }
    if (m.prof === 'nitwit' || (m.prof !== 'none' && m.xp > 0)) return;
    const taken = new Set(this.list.filter(o => o.kind === 'villager' && o.job).map(o => o.job.join()));
    const fx = Math.floor(m.x), fy = Math.floor(m.y), fz = Math.floor(m.z);
    for (let dy = -2; dy <= 2; dy++) for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const name = BLOCKS[w.get(fx + dx, fy + dy, fz + dz) & 0xFFF]?.name, prof = Object.keys(PROFESSIONS).find(k => PROFESSIONS[k].block === name);
      if (!prof || taken.has([fx + dx, fy + dy, fz + dz].join()) || (m.prof !== 'none' && prof !== m.prof)) continue;
      m.job = [fx + dx, fy + dy, fz + dz];
      if (m.prof !== prof) { Object.assign(m, newWork(prof, m.seed)); this.ctx.burst(m.x, m.y + 2, m.z, 'meal'); }
      return;
    }
  }
  /** The iron golem: walks its village slowly, goes for monsters near it (and a player who hurt a villager), throws them up. True while it fights. */
  golem(m, pd) {
    const {player} = this.ctx;
    if (m.age % 10 === 0) m.prey = m.angry > 0 && !player.dead && pd < 24 ? 'player' : this.nearest(m, o => o.def.hostile && o.kind !== 'creeper', 16);
    const t = m.prey === 'player' ? player : m.prey;
    if (t && !t.dead) {
      m.goal = [t.x, t.z]; m.input.fwd = 1; m.lookAt = [t.x, t.y + 1.5, t.z];
      if (Math.hypot(t.x - m.x, t.z - m.z) < 2.4 && Math.abs(t.y - m.y) < 2.5 && m.attackT === 0) {
        m.attackT = 10; const dmg = 7 + Math.floor(Math.random() * 15);
        if (t === player) { this.ctx.hurtPlayer(dmg, `被${m.def.zh}杀死了`, m); player.vy = 0.4; }
        else { this.hurt(t, dmg, {x: m.x, z: m.z, knock: 0.2}); t.body.vy += 0.4; }
        this.ctx.sound('iron_golem_attack', m.x, m.y, m.z);
      }
      return true;
    }
    m.input.mod = 0.6;
    if (m.home && Math.hypot(m.home[0] - m.x, m.home[2] - m.z) > 20 && (!m.goal || m.wait < 0)) { m.goal = [m.home[0], m.home[2]]; m.wait = 200; }
    return false;
  }
  /** Walks toward the goal: turning, jumping over steps, not off cliffs or into lava. */
  move(m) {
    const b = m.body, d = m.def, inp = m.input || {fwd: 0, mod: 1};
    if (d.flies === 'ghast') { this.fly(m); return; }
    if (d.water || (m.kind === 'turtle' && m.swimming)) { this.swimMove(m); return; }
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
    // a blaze rises to the player's height and sinks slowly; a magma cube's slices squash when it lands
    if (d.flies === 'blaze') { if (m.rise) b.vy += (0.3 - b.vy) * 0.3; else if (!b.onGround && b.vy < 0) b.vy *= 0.6; }
    if (m.def.cube) { if (r.landed) m.squish = -0.5; m.squish *= 0.6; }
    if (r.landed > 3 && !d.flies && !d.cube && !d.golem) this.hurt(m, Math.ceil(r.landed - 3), null, 'fall');
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
  // ---------- the sea ----------
  /**
   * A squid or a fish: in the water it goes for a place in the water near it (a new one now and then; from a hurt, away
   * and quick); a squid in strokes, its tentacles opening and closing. Out of the water it flops about and runs out of
   * air (fifteen seconds, then it drowns). A pufferfish swells when someone is near and stings who touches it.
   */
  swim(m) {
    const b = m.body, d = m.def, {player} = this.ctx;
    b.feel();
    if (!b.inWater) { m.goal3 = null; if (--m.air <= -20) { m.air = 0; this.hurt(m, 2, null, 'drown'); } return; }
    m.air = 300;
    const far = !m.goal3 || Math.hypot(m.goal3[0] - m.x, m.goal3[1] - m.y, m.goal3[2] - m.z) < 1;
    if (far || m.wait-- <= 0 || (m.panic > 0 && m.age % 20 === 0)) {
      m.wait = 60 + Math.floor(Math.random() * 100);
      for (let k = 0; k < 8; k++) {
        const r = m.panic > 0 ? 10 : 6, gx = m.x + (Math.random() - 0.5) * r * 2, gy = m.y + (Math.random() - 0.5) * 6, gz = m.z + (Math.random() - 0.5) * r * 2;
        if (this.ctx.loaded(gx, gz) && isWater(this.world.get(Math.floor(gx), Math.floor(gy), Math.floor(gz))) && isWater(this.world.get(Math.floor(gx), Math.floor(gy + 0.5), Math.floor(gz)))) { m.goal3 = [gx, gy, gz]; break; }
      }
    }
    if (m.kind === 'pufferfish') {
      const near = !player.dead && this.ctx.mode() !== 'creative' && Math.hypot(player.x - m.x, player.y + 0.9 - m.y, player.z - m.z) < 2.5;
      if (near && m.puff < 2 && m.age % 10 === 0) { m.puff++; this.ctx.sound('pop', m.x, m.y, m.z); }
      else if (!near && m.puff > 0 && m.age % 60 === 0) m.puff--;
      if (m.puff > 0 && near && Math.hypot(player.x - m.x, player.y + 0.5 - m.y, player.z - m.z) < 1 + m.puff * 0.25 && m.attackT === 0) {
        m.attackT = 20; this.ctx.hurtPlayer(1 + m.puff, '被河豚扎死了', m); this.ctx.effect?.('poison', 0, 60 * m.puff);
      }
    }
  }
  swimMove(m) {
    const b = m.body, d = m.def;
    b.prev = {x: b.x, y: b.y, z: b.z};
    if (m.kind === 'turtle') b.feel();
    if (b.inWater) {
      // a squid's stroke (the game's tentacle movement); a fish swims on
      let push = d.speed * 0.1 * (m.panic > 0 ? 2.5 : 1);
      if (d.water === 'squid') {
        m.tm += m.tSpeed;
        if (m.tm > Math.PI * 2) { m.tm -= Math.PI * 2; m.tSpeed = 1 / (Math.random() + 1) * 0.2; }
        const f = m.tm / Math.PI;
        m.tentacles = f < 1 ? Math.sin(f * f * Math.PI) * Math.PI * 0.25 : 0;
        push = f < 1 ? d.speed * 0.45 * (1 - f * f) * (m.panic > 0 ? 2 : 1) : 0;
      }
      if (m.kind === 'turtle') push = d.speed * 0.3;
      // a pufferfish swollen up hardly moves
      if (m.puff) push *= 0.15;
      if (m.goal3) {
        const dx = m.goal3[0] - m.x, dy = m.goal3[1] - m.y, dz = m.goal3[2] - m.z, len = Math.hypot(dx, dy, dz) || 1;
        b.vx += dx / len * push; b.vy += dy / len * push; b.vz += dz / len * push;
        m.yaw = turn(m.yaw, angleTo(m.x, m.z, m.goal3[0], m.goal3[2]), 0.25);
      }
      b.vx *= 0.9; b.vy *= 0.9; b.vz *= 0.9;
    } else {
      // out of the water: down it comes; on the ground a fish flops
      b.vy -= 0.08; b.vx *= 0.9; b.vz *= 0.9;
      if (b.onGround && d.water && Math.random() < 0.1) { b.vy = 0.36; b.vx += (Math.random() - 0.5) * 0.2; b.vz += (Math.random() - 0.5) * 0.2; m.yaw += (Math.random() - 0.5) * 2; this.ctx.sound('splash', m.x, m.y, m.z); }
      m.tentacles = 0;
    }
    const r = b.move(b.vx, b.vy, b.vz);
    if (r.hitX) b.vx = 0;
    if (r.hitZ) b.vz = 0;
    if (r.hitY) b.vy = 0;
    b.onGround = r.down;
    b.feel();
    const moved = Math.hypot(b.x - b.prev.x, b.z - b.prev.z);
    m.limb += moved * 4; m.amount += (Math.min(1, moved * 4) - m.amount) * 0.4;
    if (b.y < MINY - 64) { m.health = 0; m.dead = 20; }
  }
  /**
   * A turtle: in the water it swims (it can hold its breath), on land it walks like any animal; one with eggs goes to
   * sand near its beach and lays one to four there. True when it has done its thinking.
   */
  turtle(m) {
    const b = m.body;
    m.input = {fwd: 0, jump: false, mod: 1};
    m.swimming = b.inWater && !b.onGround;
    if (m.egg) {
      const [hx, hy, hz] = m.beach;
      if (Math.hypot(hx - m.x, hz - m.z) > 4) { m.goal = [hx + 0.5, hz + 0.5]; m.goal3 = [hx + 0.5, hy, hz + 0.5]; m.input.fwd = 1; return true; }
      // on the sand by its beach: the eggs
      const x = Math.floor(m.x), z = Math.floor(m.z);
      for (let y = Math.floor(m.y) + 1; y >= Math.floor(m.y) - 2; y--) {
        if ((this.world.get(x, y - 1, z) & 0xFFF) === ID.sand && !this.world.get(x, y, z)) { this.ctx.setBlock(x, y, z, withMeta(ID.turtle_egg, Math.floor(Math.random() * 4))); m.egg = false; this.ctx.sound('place', m.x, m.y, m.z); break; }
      }
      if (m.egg && m.age % 200 === 0) m.beach = [x + Math.floor((Math.random() - 0.5) * 6), Math.floor(m.y), z + Math.floor((Math.random() - 0.5) * 6)];
      return true;
    }
    if (m.swimming) {
      if (!m.goal3 || m.wait-- <= 0) {
        m.wait = 80 + Math.floor(Math.random() * 120);
        const [hx, hy, hz] = m.beach, home = Math.hypot(hx - m.x, hz - m.z) > 24;
        m.goal3 = home ? [hx + 0.5, hy, hz + 0.5] : [m.x + (Math.random() - 0.5) * 16, m.y + (Math.random() - 0.5) * 4, m.z + (Math.random() - 0.5) * 16];
      }
      return true;
    }
    return false;
  }
  /** Squids and fish come into the water round the player (a few at a time, some kinds by the sea's warmth). */
  seaSpawnTick() {
    if (this.ctx.nether?.() || Math.random() > 0.05) return;
    const {player} = this.ctx, squids = this.count(m => m.def.water === 'squid'), fish = this.count(m => m.def.water === 'fish' && !m.persist);
    if (squids >= 5 && fish >= 14) return;
    const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 36, x = Math.floor(player.x + Math.cos(a) * r), z = Math.floor(player.z + Math.sin(a) * r);
    if (!this.ctx.loaded(x, z)) return;
    let depth = 0;
    while (depth < 40 && isWater(this.world.get(x, SEA - depth, z))) depth++;
    if (depth < 3) return;
    const biome = BIOMES[this.world.biome?.(x, z)]?.name || '', y = SEA - 1 - Math.floor(Math.random() * (depth - 2));
    if (!biome.endsWith('ocean') && !biome.endsWith('river')) return;
    let kind, n = 1;
    if (squids < 5 && Math.random() < 0.25) kind = 'squid';
    else if (fish < 14) {
      const q = Math.random();
      kind = biome === 'warm_ocean' ? (q < 0.1 ? 'pufferfish' : 'tropical_fish') : biome.endsWith('river') || biome.includes('cold') || biome.includes('frozen') ? 'salmon' : q < 0.15 ? 'pufferfish' : 'cod';
      n = kind === 'pufferfish' ? 1 : 2 + Math.floor(Math.random() * 3);
    }
    if (!kind) return;
    const color = Math.floor(Math.random() * 16);
    for (let k = 0; k < n; k++) this.add(kind, x + 0.5 + (Math.random() - 0.5), y + 0.2, z + 0.5 + (Math.random() - 0.5), {color});
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
    if (m.def.fireproof && (why === 'fire' || why === 'lava')) return false;
    m.health -= n; m.hurtT = 10; if (why === 'hit' || why === 'arrow') m.inv = 10;
    if (from && !m.def.golem) {
      const a = Math.atan2(m.x - from.x, m.z - from.z), k = from.knock ?? 0.4;
      m.body.vx += Math.sin(a) * k; m.body.vz += Math.cos(a) * k; if (m.body.onGround) m.body.vy = 0.36;
    }
    if (m.def.passive) m.panic = 100;
    if (m.def.water === 'squid') this.ctx.burst(m.x, m.y + 0.4, m.z, m.def.glow ? 'glow_ink' : 'ink');
    if (m.kind === 'spider' || (m.def.hostile && from?.player)) m.angry = 600;
    if (m.kind === 'villager' && from?.player) for (const o of this.list) if (o.kind === 'iron_golem' && Math.hypot(o.x - m.x, o.z - m.z) < 24) o.angry = 1200;
    if (m.def.golem && from?.player) m.angry = 1200;
    // hit one zombified piglin and those around it come for you too
    if (m.def.neutral && from?.player) for (const o of this.list) if (o.kind === m.kind && Math.hypot(o.x - m.x, o.z - m.z) < 20) o.angry = 600 + Math.floor(Math.random() * 400);
    this.ctx.sound(m.health <= 0 ? `${m.kind}_death` : `${m.kind}_hurt`, m.x, m.y, m.z);
    if (m.health <= 0) { m.dead = 1; m.killedByPlayer = !!from?.player; }
    return true;
  }
  die(m) {
    this.ctx.burst(m.x, m.y + m.body.height / 2, m.z, 'poof');
    if (m.baby) return;
    // a magma cube breaks into two to four of half its size; only the bigger ones drop magma cream
    if (m.def.cube && m.mag > 1) for (let k = 2 + Math.floor(Math.random() * 3); k > 0; k--) this.add(m.kind, m.x + (Math.random() - 0.5) * m.mag * 0.5, m.y + 0.5, m.z + (Math.random() - 0.5) * m.mag * 0.5, {mag: m.mag / 2});
    // (only the bigger magma cubes drop magma cream, only the smallest slimes slime balls)
    const drops = (m.kind === 'magma_cube' && m.mag === 1) || (m.kind === 'slime' && m.mag > 1) ? [] : m.kind === 'blaze' && !m.killedByPlayer ? [] : m.def.drops;
    for (const [id, lo, hi, cooked] of drops) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1 + (m.killedByPlayer ? this.ctx.looting?.() || 0 : 0)));
      if (n > 0) this.ctx.drop({id: m.fire > 0 && cooked ? cooked : id, n}, m.x, m.y + 0.5, m.z);
    }
    if (m.kind === 'sheep' && !m.sheared) this.ctx.drop({id: `${m.color || 'white'}_wool`, n: 1}, m.x, m.y + 0.5, m.z);
    if (m.def.rare && m.killedByPlayer && Math.random() < 0.025) this.ctx.drop({id: m.def.rare[Math.floor(Math.random() * m.def.rare.length)], n: 1}, m.x, m.y + 0.5, m.z);
    if (m.killedByPlayer) this.ctx.xp?.(m.def.cube ? m.mag : m.def.xp || (m.def.hostile ? 5 : 1 + Math.floor(Math.random() * 3)), m.x, m.y + 0.5, m.z);
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
    // none on peaceful, nor with the game rule 生成怪物 off
    if (this.ctx.difficulty?.() === 'peaceful' || this.ctx.spawning?.() === false) return;
    if (this.ctx.nether?.()) { this.netherSpawn(); return; }
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
    const kinds = ['zombie', 'zombie', 'skeleton', 'skeleton', 'creeper', 'spider'];
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    if ((y < 40 && slimePlace(this.ctx.seed, x >> 4, z >> 4)) || (y > 50 && y < 70 && SWAMPS.has(this.world.biome?.(x, z)))) { if (Math.random() < 0.5) kind = 'slime'; }
    if (kind === 'spider' && (collisionBoxes(this.world.get(x + 1, y, z)) || collisionBoxes(this.world.get(x - 1, y, z)))) return;
    this.add(kind, x + 0.5, y, z + 0.5);
  }
  /**
   * The Nether's: on a floor somewhere around (16–56 blocks off): in a fortress mostly blazes, else zombified piglins
   * in groups, ghasts where there is room to float, now and then a magma cube.
   */
  netherSpawn() {
    const {player} = this.ctx, get = (x, y, z) => this.world.get(x, y, z);
    if (this.count(m => m.def.hostile) >= 14 || Math.random() > 0.2) return;
    const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 40, x = Math.floor(player.x + Math.cos(a) * r), z = Math.floor(player.z + Math.sin(a) * r);
    if (!this.ctx.loaded(x, z)) return;
    let y = 33 + Math.floor(Math.random() * 88);
    while (y > 32 && !(collisionBoxes(get(x, y - 1, z)) && !get(x, y, z) && !get(x, y + 1, z))) y--;
    const below = get(x, y - 1, z) & 0xFFF;
    if (y <= 32 || below === ID.bedrock || below === ID.lava || BLOCKS[below].shape === 'slab') return;
    const fort = fortressAt(this.ctx.seed, x + 0.5, y, z + 0.5), q = Math.random();
    const kind = fort ? (q < 0.6 ? 'blaze' : q < 0.8 ? 'zombified_piglin' : 'magma_cube') : q < 0.62 ? 'zombified_piglin' : q < 0.95 ? 'ghast' : 'magma_cube';
    if (kind === 'ghast') {
      if (this.count(m => m.kind === 'ghast') >= 3) return;
      for (let dy = 0; dy < 5; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (get(x + dx, y + dy, z + dz)) return;
    }
    const n = kind === 'zombified_piglin' ? 1 + Math.floor(Math.random() * 3) : 1;
    for (let k = 0; k < n; k++) this.add(kind, x + 0.5 + (k ? (Math.random() - 0.5) * 0.6 : 0), y, z + 0.5 + (k ? (Math.random() - 0.5) * 0.6 : 0));
  }
  /** A fortress's blaze spawner near the player (16 blocks): every 10–40 seconds up to four blazes round it, while fewer than six are near. */
  spawnerTick() {
    if (!this.ctx.nether?.() || this.ctx.mode() === 'creative' || Math.random() > 0.05) return;
    const {player} = this.ctx;
    for (const [x, y, z] of spawnersNear(this.ctx.seed, player.x, player.z)) {
      if (Math.hypot(x + 0.5 - player.x, y - player.y, z + 0.5 - player.z) > 16 || (this.world.get(x, y, z) & 0xFFF) !== ID.spawner) continue;
      const k = `${x},${y},${z}`, t = this.spawnerT.get(k) ?? 20;
      if (t > 0) { this.spawnerT.set(k, t - 20); continue; }
      this.spawnerT.set(k, 200 + Math.floor(Math.random() * 600));
      if (this.count(m => m.kind === 'blaze' && Math.hypot(m.x - x, m.y - y, m.z - z) < 9) >= 6) continue;
      for (let n = 0; n < 4; n++) {
        const bx = x + Math.floor((Math.random() - 0.5) * 8), by = y + Math.floor(Math.random() * 3) - 1, bz = z + Math.floor((Math.random() - 0.5) * 8);
        if (!this.world.get(bx, by, bz) && !this.world.get(bx, by + 1, bz)) { this.add('blaze', bx + 0.5, by, bz + 0.5); this.ctx.burst(bx + 0.5, by + 1, bz + 0.5, 'flame'); }
      }
    }
  }
  // ---------- the Nether's monsters ----------
  /** A ghast drifts about; seeing the player, it cries out, then spits a fireball (one every three seconds). */
  ghast(m, pd, hunting) {
    const p = this.ctx.player;
    if (!m.fly || m.wait-- <= 0 || Math.hypot(m.fly[0] - m.x, m.fly[1] - m.y, m.fly[2] - m.z) < 1) { m.fly = [m.x + (Math.random() * 2 - 1) * 16, m.y + (Math.random() * 2 - 1) * 16, m.z + (Math.random() * 2 - 1) * 16]; m.wait = 40 + Math.floor(Math.random() * 80); }
    if (hunting && this.sees(m, p)) {
      m.lookAt = [p.x, p.y + p.eye, p.z];
      if (++m.aim === 10) this.ctx.sound('ghast_warn', m.x, m.y, m.z);
      if (m.aim >= 20) { m.aim = -40; this.fireball(m, p, 'large'); }
    } else m.aim = m.aim > 0 ? m.aim - 1 : Math.min(0, m.aim + 1);
    if (m.age % 200 === m.id % 200 && Math.random() < 0.4) this.ctx.sound('ghast', m.x, m.y, m.z);
  }
  /** Flying (a ghast): drawn toward where it wants to be, slowed by the air; something in the way, it picks a new place. */
  fly(m) {
    const b = m.body, [tx, ty, tz] = m.fly || [m.x, m.y, m.z], dx = tx - m.x, dy = ty - m.y, dz = tz - m.z, l = Math.hypot(dx, dy, dz) || 1;
    b.prev = {x: b.x, y: b.y, z: b.z};
    if (l > 1) { b.vx += dx / l * 0.1 * 0.1; b.vy += dy / l * 0.1 * 0.1; b.vz += dz / l * 0.1 * 0.1; }
    const r = b.move(b.vx, b.vy, b.vz);
    if (r.hitX || r.hitY || r.hitZ) { m.fly = null; if (r.hitX) b.vx = 0; if (r.hitY) b.vy = 0; if (r.hitZ) b.vz = 0; }
    b.vx *= 0.91; b.vy *= 0.91; b.vz *= 0.91;
    m.yaw = m.lookAt ? angleTo(m.x, m.z, m.lookAt[0], m.lookAt[2]) : Math.hypot(b.vx, b.vz) > 0.002 ? Math.atan2(-b.vx, -b.vz) : m.yaw;
    b.yaw = m.yaw; m.headYaw = 0; m.headPitch = 0;
    if (b.y < 0) { m.health = 0; m.dead = 20; }
  }
  /** A blaze hovers to the player's height; it burns for three seconds, then throws three small fireballs; close by it hits. */
  blaze(m, pd, py, hunting) {
    const p = this.ctx.player, d = m.def, b = m.body;
    if (m.age % 5 === 0) this.ctx.burst(m.x, m.y + 0.4 + Math.random() * 1.2, m.z, m.aim > 0 && m.aim < 80 ? 'flame' : 'smoke');
    m.rise = false;
    if (!hunting || !this.sees(m, p)) { m.aim = Math.min(0, m.aim + 1); if (--m.wait <= 0) { m.wait = 60 + Math.floor(Math.random() * 120); const a = Math.random() * Math.PI * 2; m.goal = [m.x + Math.cos(a) * 5, m.z + Math.sin(a) * 5]; } m.input.fwd = m.goal ? 1 : 0; return; }
    m.lookAt = [p.x, p.y + p.eye, p.z]; m.goal = [p.x, p.z]; m.input.fwd = pd > 6 ? 1 : 0;
    m.rise = p.y + p.eye > m.y + b.eye + 0.8;
    if (pd < 2 && Math.abs(py) < 2 && m.attackT === 0) { m.attackT = 20; this.ctx.hurtPlayer(6, `被${d.zh}杀死了`, m); }
    if (++m.aim === 60) this.ctx.sound('blaze_shoot', m.x, m.y, m.z);
    if (m.aim > 60 && (m.aim - 60) % 6 === 0) this.fireball(m, p, 'small');
    if (m.aim >= 78) m.aim = -100;
    if (m.age % 160 === m.id % 160 && Math.random() < 0.5) this.ctx.sound('blaze', m.x, m.y, m.z);
  }
  /** A magma cube or a slime hops (only moving in the air), more often when after the player; touching the player hurts them (not a small slime). */
  cube(m, pd, py, hunting) {
    const p = this.ctx.player, b = m.body;
    if (hunting) { m.yaw = turn(m.yaw, angleTo(m.x, m.z, p.x, p.z), 0.6); m.lookAt = [p.x, p.y + p.eye, p.z]; }
    else if (m.age % 60 === 0) m.yaw += (Math.random() - 0.5) * 2;
    m.goal = null; m.input.fwd = b.onGround ? 0 : 1; m.input.mod = 1 + m.mag * 0.4;
    if (b.onGround && --m.hop <= 0) {
      b.vy = 0.42 + m.mag * 0.1; m.squish = 1;
      m.hop = Math.floor((10 + Math.random() * 20) / (hunting ? 3 : 1));
      this.ctx.sound(m.kind, m.x, m.y, m.z);
    }
    const dmg = (m.kind === 'slime' ? {1: 0, 2: 2, 4: 4} : {1: 3, 2: 4, 4: 6})[m.mag] ?? 3;
    if (dmg && hunting && pd < b.w / 2 + 0.6 && py > -b.hgt && py < 1.5 && m.attackT === 0) { m.attackT = 20; this.ctx.hurtPlayer(dmg, `被${m.def.zh}杀死了`, m); }
  }
  // ---------- fireballs ----------
  /** A ghast's big fireball (it explodes) or a blaze's small one (it burns), flying at the player. */
  fireball(m, p, kind) {
    const big = kind === 'large', ax = m.x, ay = m.y + m.body.height * (big ? 0.5 : 0.75), az = m.z;
    let dx = p.x - ax, dy = p.y + p.height / 2 - ay, dz = p.z - az;
    if (!big) { const spread = Math.sqrt(Math.hypot(dx, dz)) * 0.5; dx += (Math.random() - 0.5) * spread; dz += (Math.random() - 0.5) * spread; }
    const l = Math.hypot(dx, dy, dz) || 1, ux = dx / l, uy = dy / l, uz = dz / l, start = big ? 2.5 : 0.6;
    this.balls.push({x: ax + ux * start, y: ay + uy * start, z: az + uz * start, vx: 0, vy: 0, vz: 0, ax: ux * 0.05, ay: uy * 0.05, az: uz * 0.05, big, from: m, life: 0});
    this.ctx.sound(big ? 'ghast_shoot' : 'blaze_shoot', ax, ay, az);
  }
  /** The player hits a fireball in front of them: it flies off the way they look (back at the ghast, with luck). */
  deflect(eye, dir) {
    for (const f of this.balls) {
      const dx = f.x - eye[0], dy = f.y - eye[1], dz = f.z - eye[2], t = dx * dir[0] + dy * dir[1] + dz * dir[2];
      if (t < 0 || t > 4 || Math.hypot(dx - dir[0] * t, dy - dir[1] * t, dz - dir[2] * t) > (f.big ? 1 : 0.5)) continue;
      Object.assign(f, {vx: dir[0] * 0.8, vy: dir[1] * 0.8, vz: dir[2] * 0.8, ax: dir[0] * 0.05, ay: dir[1] * 0.05, az: dir[2] * 0.05, from: 'player'});
      this.ctx.sound('attack', f.x, f.y, f.z);
      return true;
    }
    return false;
  }
  ballTick() {
    const {player} = this.ctx;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const f = this.balls[i];
      // they speed up as they go (and the air slows them): the game's fireballs
      f.vx = (f.vx + f.ax) * 0.95; f.vy = (f.vy + f.ay) * 0.95; f.vz = (f.vz + f.az) * 0.95;
      if (++f.life > 200) { this.balls.splice(i, 1); continue; }
      if (f.life % 2 === 0) this.ctx.burst(f.x, f.y, f.z, f.big ? 'smoke' : 'flame');
      const steps = Math.max(1, Math.ceil(Math.hypot(f.vx, f.vy, f.vz) / 0.25)), r = f.big ? 0.5 : 0.16;
      let hit = null;
      for (let k = 0; k < steps && !hit; k++) {
        const nx = f.x + f.vx / steps, ny = f.y + f.vy / steps, nz = f.z + f.vz / steps;
        if (f.from !== 'player' || f.life > 5) {
          const [x0, y0, z0, x1, y1, z1] = player.aabb();
          if (!player.dead && nx > x0 - r && nx < x1 + r && ny > y0 - r && ny < y1 + r && nz > z0 - r && nz < z1 + r) hit = {player: true};
        }
        for (const m of this.list) {
          if (hit || m === f.from || m.dead) continue;
          const [x0, y0, z0, x1, y1, z1] = m.body.aabb();
          if (nx > x0 - r && nx < x1 + r && ny > y0 - r && ny < y1 + r && nz > z0 - r && nz < z1 + r) hit = {mob: m};
        }
        if (!hit && collisionBoxes(this.world.get(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) hit = {block: true};
        f.x = nx; f.y = ny; f.z = nz;
      }
      if (!hit) continue;
      this.balls.splice(i, 1);
      const by = f.from === 'player' ? {player: true, x: f.x, z: f.z} : null;
      if (f.big) {
        if (hit.mob) this.hurt(hit.mob, 6, by || {x: f.x, z: f.z}, 'hit');
        this.ctx.explode(f.x, f.y, f.z, 1, f.from === 'player' ? null : f.from);
      } else if (hit.player) this.ctx.hurtPlayer(5, `被${f.from?.def?.zh || ''}的火球烧死了`, {x: f.x, z: f.z}, 'fire');
      else if (hit.mob) { this.hurt(hit.mob, 5, by, 'fire'); if (!hit.mob.def.fireproof) hit.mob.fire = Math.max(hit.mob.fire, 100); }
    }
  }
  // ---------- arrows ----------
  shoot(m, p) {
    const ax = m.x, ay = m.y + m.body.eye - 0.1, az = m.z, dx = p.x - ax, dz = p.z - az, h = Math.hypot(dx, dz), dy = p.y + p.height / 3 - ay + h * 0.2;
    const len = Math.hypot(dx, dy, dz), v = 1.6, spread = 0.0075 * 6;
    const dir = [dx / len + (Math.random() - 0.5) * spread, dy / len + (Math.random() - 0.5) * spread, dz / len + (Math.random() - 0.5) * spread];
    this.arrows.push({x: ax, y: ay, z: az, vx: dir[0] * v, vy: dir[1] * v, vz: dir[2] * v, from: m, life: 0, stuck: false, dmg: 2});
    this.ctx.sound('bow', ax, ay, az);
  }
  /** The player's arrow: power 0–1; the bow's 力量 (more damage: half a point a level and a half more), 冲击 (knocks further), 火矢 (sets alight). */
  shootFromPlayer(p, look, power, pickup, {strength = 0, punch = 0, flame = 0} = {}) {
    const v = power * 3, eye = p.y + p.eye;
    this.arrows.push({x: p.x + look[0] * 0.3, y: eye - 0.1, z: p.z + look[2] * 0.3, vx: look[0] * v, vy: look[1] * v, vz: look[2] * v, from: 'player', life: 0, stuck: false, dmg: 2 + (strength ? strength * 0.5 + 0.5 : 0), crit: power >= 1, pickup, punch, flame});
  }
  arrowTick() {
    const {player} = this.ctx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life++;
      if (a.stuck) {
        if (a.life > 1200) { this.arrows.splice(i, 1); continue; }
        if ((a.from === 'player' || a.from === 'dispenser') && a.pickup && Math.hypot(player.x - a.x, player.y + 1 - a.y, player.z - a.z) < 1.5 && this.ctx.give({id: 'arrow', n: 1})) { this.arrows.splice(i, 1); this.ctx.sound('pop'); }
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
          if (nx > x0 - 0.1 && nx < x1 + 0.1 && ny > y0 && ny < y1 && nz > z0 - 0.1 && nz < z1 + 0.1) { this.ctx.hurtPlayer(dmg, `被${a.from?.def?.zh || ''}射杀了`, {x: a.x, z: a.z}, 'arrow'); this.arrows.splice(i, 1); hit = true; break; }
        }
        for (const m of this.list) {
          if (m === a.from || m.dead || (a.life < 2 && a.from !== 'player')) continue;
          const [x0, y0, z0, x1, y1, z1] = m.body.aabb();
          if (nx > x0 && nx < x1 && ny > y0 && ny < y1 && nz > z0 && nz < z1) { this.hurt(m, dmg, {x: a.x, z: a.z, player: a.from === 'player', knock: 0.3 + (a.punch || 0) * 0.6}, 'arrow'); if (a.flame) m.fire = Math.max(m.fire, 100); this.arrows.splice(i, 1); hit = true; this.ctx.sound('arrow_hit', a.x, a.y, a.z); break; }
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
      const rot = animate(m.kind, {}, {limb: m.limb, amount: m.amount, headYaw: -m.headYaw, headPitch: m.headPitch, age: m.age, attack: m.def.golem ? m.attackT / 10 : m.attackT > 10 ? 1 : 0, shake: m.shake > 0, aim: m.aim > 0 || (m.def.neutral && m.angry > 0), fall: !b.onGround, graze: m.graze > 0, squish: m.squish || 0,
        tentacles: m.tentacles || 0, flop: m.def.water && !b.inWater, swim: m.swimming});
      const s = (m.baby ? (m.kind === 'turtle' ? 0.3 : 0.5) : 1) * (MODELS[m.kind].scale || 1) * (m.mag || 1) * (m.kind === 'pufferfish' ? [1, 1.6, 2.2][m.puff || 0] : 1), roll = m.dead ? Math.min(1, m.dead / 10) * Math.PI / 2 : 0, swell = m.fuse ? Math.min(1, m.fuse / 30) * 0.3 * (1 + Math.sin(m.fuse * 0.9) * 0.15) : 0;
      const [sky, blk] = light(Math.floor(m.x), Math.floor(m.y + b.height / 2), Math.floor(m.z));
      // (the game draws a squid lower: its tentacles hang under its box)
      const pose = {x, y: y - (m.def.water === 'squid' ? 0.7 : 0), z, yaw: m.yaw, s, roll, swell}, hurt = m.hurtT > 0 || m.dead ? 1 : 0, white = m.fuse && Math.floor(m.fuse / 5) % 2 ? 0.6 : 0;
      const fire = m.fire > 0 || m.def.glow ? 1 : 0;
      const skin = m.kind === 'villager' ? `villager_${m.prof || 'none'}` : m.kind;
      out.push({skin, verts: new Float32Array(buildModel(m.kind, rot, pose, [], sizes[skin])), light: [sky, Math.max(blk, fire ? 14 : 0)], tint: m.kind === 'tropical_fish' ? FISH_COLORS[m.color] || [1, 1, 1] : [1, 1, 1], hurt, white});
      if (m.kind === 'sheep' && !m.sheared) out.push({skin: 'sheep_wool', verts: new Float32Array(buildModel('sheep_wool', rot, pose, [], sizes.sheep_wool)), light: [sky, blk], tint: WOOL_TINT[m.color] || [1, 1, 1], hurt, white: 0});
    }
    return out;
  }
  toJSON() { return this.list.filter(m => (m.def.passive || m.def.keep) && !m.dead && (!m.def.water || m.persist)).map(m => m.toJSON()); }
  load(list) { for (const s of list || []) if (MOBS[s.kind]?.passive || MOBS[s.kind]?.keep) this.add(s.kind, s.x, s.y, s.z, s); }
}
export {WOOL};
