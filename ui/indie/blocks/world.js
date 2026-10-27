// The world as the worker keeps it: columns made (or read back from the save) around the player, their light, their
// meshes, and the world's own life — water and lava flowing, sand falling, crops and saplings growing, grass
// spreading, leaves dropping when their tree is gone. The page keeps a copy of the blocks and light (for walking and
// aiming) that this sends along whenever something changes.
import {generateColumn, newColumn, BIOMES, growTree, worldOf} from './gen.js';
import {generateNether} from './nether.js';
import {portalHolds, portalSpot, buildPortal} from './portal.js';
import {villagersIn} from './village.js';
import {BLOCKS, ID, MINY, HEIGHT, SECTIONS, SEA, withMeta, dropsOf, itemInfo} from './blocks.js';
import {meshSection} from './mesh.js';
import {rng} from './noise.js';

const N = BLOCKS.length;
const FILTER = new Uint8Array(N), EMIT = new Uint8Array(N), OPAQUE = new Uint8Array(N);
for (const b of BLOCKS) { FILTER[b.id] = b.opaque ? 15 : b.filter; EMIT[b.id] = b.light; OPAQUE[b.id] = b.opaque ? 1 : 0; }
// a slab made double hides light like a full block; a burning furnace glows
const filterOf = v => { const id = v & 0xFFF; return (BLOCKS[id].shape === 'slab' && v >>> 12 === 2) ? 15 : FILTER[id]; };
// furnaces (and smokers, blast furnaces) glow while lit (state bit 4)
const FURNACES = new Set(BLOCKS.filter(b => b.use === 'furnace').map(b => b.id));
const emitOf = v => FURNACES.has(v & 0xFFF) ? (v >>> 12 & 4 ? 13 : 0) : EMIT[v & 0xFFF];
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const LIQUID = new Set([ID.water, ID.lava]);
const GRAVITY = new Set(BLOCKS.filter(b => b.gravity).map(b => b.id));
const CROP = new Set([ID.wheat, ID.carrots, ID.potatoes]);
const PAIRED = new Set(BLOCKS.filter(b => b.shape === 'door' || b.shape === 'bed').map(b => b.id));
const FACE_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const PLANT = new Set(BLOCKS.filter(b => ['cross', 'crop', 'torch', 'wall', 'layer', 'lantern'].includes(b.shape)).map(b => b.id));
const hexRGB = h => parseInt(h.slice(1), 16);
const TINTS = BIOMES.map(b => ({grass: hexRGB(b.grass), foliage: hexRGB(b.foliage), water: hexRGB(b.water)}));

export class World {
  /**
   * seed, tex (texture name → layer), post(message, transfer), store (save helper or null), radius (columns), dim
   * ('overworld' | 'nether': the Nether has no sky, so no sky light, and its lava runs fast and far).
   */
  constructor({seed, tex, post, store = null, radius = 6, worldId = '', dim = 'overworld'}) {
    this.seed = seed; this.tex = tex; this.post = post; this.store = store; this.radius = radius; this.worldId = worldId;
    this.dim = dim; this.nether = dim === 'nether'; this.sky = this.nether ? 0 : 0xF0;
    this.cols = new Map(); this.center = [0, 0]; this.dirty = new Set(); this.saved = new Set(); this.loading = new Set();
    this.tick = 0; this.due = new Map(); this.ack = 0; this.wave = true;
    this.r = rng(seed ^ 0x5bd1e995);
    this.decay = new Map();
  }
  col(cx, cz) { return this.cols.get(key(cx, cz)); }
  // ---------- blocks and light ----------
  get(x, y, z) {
    if (y < MINY || y >= MINY + HEIGHT) return 0;
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return 0;
    const s = c.sections[(y - MINY) >> 4];
    return s ? s[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)] : 0;
  }
  light(x, y, z) {
    if (y >= MINY + HEIGHT) return this.sky;
    if (y < MINY) return 0;
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return 0;
    const si = (y - MINY) >> 4, s = c.light[si];
    if (!s) return si > c.topSec ? this.sky : 0;
    return s[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)];
  }
  /** The light section a write goes to (made when missing: above the column's top it starts as open sky). */
  lightSec(c, si) {
    let s = c.light[si];
    if (!s) { s = c.light[si] = new Uint8Array(4096); if (si > c.topSec) s.fill(this.sky); }
    return s;
  }
  setLight(x, y, z, sky, blk) {
    if (y < MINY || y >= MINY + HEIGHT) return;
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return;
    const si = (y - MINY) >> 4;
    this.lightSec(c, si)[((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15)] = sky << 4 | blk;
    this.touch(c, si, x & 15, (y - MINY) & 15, z & 15);
  }
  /** Marks a section (and the ones sharing its border, when the change is on one) to be meshed again. */
  touch(c, si, lx, ly, lz) {
    this.dirty.add(c.k * 32 + si);
    if (lx === 0) this.markSec(c.cx - 1, c.cz, si); else if (lx === 15) this.markSec(c.cx + 1, c.cz, si);
    if (lz === 0) this.markSec(c.cx, c.cz - 1, si); else if (lz === 15) this.markSec(c.cx, c.cz + 1, si);
    if (ly === 0 && si > 0) this.dirty.add(c.k * 32 + si - 1); else if (ly === 15 && si < SECTIONS - 1) this.dirty.add(c.k * 32 + si + 1);
    c.sent = false;
  }
  markSec(cx, cz, si) { const n = this.col(cx, cz); if (n) { this.dirty.add(n.k * 32 + si); n.sent = false; } }

  // ---------- columns ----------
  /** Puts a column in (made or read back), lights it and lets the light run into and out of its neighbours. */
  addColumn(c) {
    c.k = key(c.cx, c.cz); c.light = new Array(SECTIONS).fill(null); c.changed = c.changed || false;
    let top = MINY;
    for (let si = SECTIONS - 1; si >= 0; si--) if (c.sections[si] && c.sections[si].some(v => v)) { top = MINY + si * 16 + 15; break; }
    c.topSec = (top - MINY) >> 4;
    this.cols.set(c.k, c);
    this.lightColumn(c);
    for (let si = 0; si < SECTIONS; si++) if (c.sections[si]) this.dirty.add(c.k * 32 + si);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = this.col(c.cx + dx, c.cz + dz);
      if (n) for (let si = 0; si < SECTIONS; si++) if (n.sections[si]) this.dirty.add(n.k * 32 + si);
    }
    c.sent = false;
  }
  lightColumn(c) {
    const x0 = c.cx * 16, z0 = c.cz * 16;
    for (let si = 0; si <= c.topSec; si++) c.light[si] = new Uint8Array(4096);
    const sky = [], blk = [];
    // straight down from the sky: full light until something takes some of it
    const sunBottom = new Int16Array(256);
    if (this.sky) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let y = MINY + (c.topSec + 1) * 16 - 1;
      for (; y >= MINY; y--) {
        const si = (y - MINY) >> 4, s = c.sections[si], v = s ? s[((y - MINY) & 15) << 8 | z << 4 | x] : 0;
        const f = v ? filterOf(v) : 0;
        if (f) { if (f < 15) c.light[si][((y - MINY) & 15) << 8 | z << 4 | x] = (15 - f) << 4; break; }
        c.light[si][((y - MINY) & 15) << 8 | z << 4 | x] = 0xF0;
      }
      sunBottom[z * 16 + x] = y + 1;
    }
    if (this.sky) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const own = sunBottom[z * 16 + x];
      // the sky light at the edge of the sunlit part spreads sideways into the shade and down under leaves
      let reach = own;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, zz = z + dz;
        if (xx >= 0 && xx < 16 && zz >= 0 && zz < 16) reach = Math.max(reach, sunBottom[zz * 16 + xx]);
        else { const n = this.col(c.cx + (xx < 0 ? -1 : xx > 15 ? 1 : 0), c.cz + (zz < 0 ? -1 : zz > 15 ? 1 : 0)); reach = Math.max(reach, n ? MINY + (n.topSec + 1) * 16 : own); }
      }
      for (let y = own; y <= Math.min(reach, MINY + (c.topSec + 1) * 16 - 1); y++) sky.push(x0 + x, y, z0 + z);
      if (own > MINY) sky.push(x0 + x, own - 1, z0 + z);
    }
    // block light from things that glow
    for (let si = 0; si <= c.topSec; si++) {
      const s = c.sections[si];
      if (!s) continue;
      for (let i = 0; i < 4096; i++) {
        const e = s[i] ? emitOf(s[i]) : 0;
        if (!e) continue;
        const x = i & 15, z = i >> 4 & 15, y = MINY + si * 16 + (i >> 8);
        c.light[si][i] = c.light[si][i] & 0xF0 | e;
        blk.push(x0 + x, y, z0 + z);
      }
    }
    // the neighbours' light at the shared edges comes in
    for (const [dx, dz, ex, ez] of [[1, 0, 0, -1], [-1, 0, 15, -1], [0, 1, -1, 0], [0, -1, -1, 15]]) {
      const n = this.col(c.cx + dx, c.cz + dz);
      if (!n) continue;
      const top = MINY + (Math.max(n.topSec, c.topSec) + 1) * 16;
      for (let y = MINY; y < top; y++) for (let k = 0; k < 16; k++) {
        const wx = n.cx * 16 + (ex < 0 ? k : ex), wz = n.cz * 16 + (ez < 0 ? k : ez), l = this.light(wx, y, wz);
        if (l >> 4 > 1 && l >> 4 < 15) sky.push(wx, y, wz);
        else if (l >> 4 === 15 && y < MINY + (c.topSec + 1) * 16) sky.push(wx, y, wz);
        if ((l & 15) > 1) blk.push(wx, y, wz);
      }
    }
    this.spread(sky, true);
    this.spread(blk, false);
  }
  /** Light running out from the cells in `queue` (x, y, z, …) on one channel. */
  spread(queue, isSky) {
    for (let q = 0; q < queue.length; q += 3) {
      const x = queue[q], y = queue[q + 1], z = queue[q + 2], l = this.light(x, y, z), lv = isSky ? l >> 4 : l & 15;
      if (lv <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d], nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < MINY || ny >= MINY + HEIGHT) continue;
        const c = this.cols.get(key(nx >> 4, nz >> 4));
        if (!c) continue;
        const v = this.get(nx, ny, nz), f = v ? filterOf(v) : 0;
        if (f >= 15) continue;
        const nl = isSky && d === 3 && lv === 15 ? 15 - f : lv - Math.max(1, f);
        const old = this.light(nx, ny, nz), ov = isSky ? old >> 4 : old & 15;
        if (nl > ov) { this.setLight(nx, ny, nz, isSky ? nl : old >> 4, isSky ? old & 15 : nl); queue.push(nx, ny, nz); }
      }
    }
  }
  /** Takes away the light that came from a cell (before refilling from what is left around it). */
  unspread(x, y, z, isSky) {
    const l0 = this.light(x, y, z), lv0 = isSky ? l0 >> 4 : l0 & 15;
    const rem = [x, y, z, lv0], refill = [];
    this.setLight(x, y, z, isSky ? 0 : l0 >> 4, isSky ? l0 & 15 : 0);
    for (let q = 0; q < rem.length; q += 4) {
      const cx = rem[q], cy = rem[q + 1], cz = rem[q + 2], lv = rem[q + 3];
      for (let d = 0; d < 6; d++) {
        const [dx, dy, dz] = DIRS[d], nx = cx + dx, ny = cy + dy, nz = cz + dz;
        if (ny < MINY || ny >= MINY + HEIGHT || !this.cols.has(key(nx >> 4, nz >> 4))) continue;
        const l = this.light(nx, ny, nz), nv = isSky ? l >> 4 : l & 15;
        if (!nv) continue;
        if (nv < lv || (isSky && d === 3 && lv === 15 && nv === 15)) {
          this.setLight(nx, ny, nz, isSky ? 0 : l >> 4, isSky ? l & 15 : 0);
          rem.push(nx, ny, nz, nv);
        } else refill.push(nx, ny, nz);
      }
    }
    return refill;
  }
  // ---------- changing blocks ----------
  /** Sets a block and puts its light right; returns the old value. */
  set(x, y, z, v, {from = 'world'} = {}) {
    if (y < MINY || y >= MINY + HEIGHT) return 0;
    const c = this.cols.get(key(x >> 4, z >> 4));
    if (!c) return 0;
    const si = (y - MINY) >> 4, li = ((y - MINY) & 15) << 8 | (z & 15) << 4 | (x & 15);
    let s = c.sections[si];
    const old = s ? s[li] : 0;
    if (old === v) return old;
    if (!s) s = c.sections[si] = new Uint16Array(4096);
    s[li] = v;
    c.changed = true; this.saved.add(c.k);
    if (si > c.topSec) { for (let k = c.topSec + 1; k <= si; k++) if (!c.light[k]) { c.light[k] = new Uint8Array(4096); c.light[k].fill(this.sky); } c.topSec = si; }
    this.touch(c, si, x & 15, (y - MINY) & 15, z & 15);
    // light: take away what the cell gave, then let it all run in again (with what the new block gives off)
    const oldF = old ? filterOf(old) : 0, newF = v ? filterOf(v) : 0, oldE = emitOf(old), newE = emitOf(v);
    if (oldF !== newF || oldE !== newE) {
      const skyRefill = this.unspread(x, y, z, true), blkRefill = this.unspread(x, y, z, false);
      if (newE) { const l = this.light(x, y, z); this.setLight(x, y, z, l >> 4, newE); blkRefill.push(x, y, z); }
      for (const [dx, dy, dz] of DIRS) { skyRefill.push(x + dx, y + dy, z + dz); blkRefill.push(x + dx, y + dy, z + dz); }
      // open sky right above: the light comes straight down
      if (newF < 15 && this.light(x, y + 1, z) >> 4 === 15) skyRefill.push(x, y + 1, z);
      this.spread(skyRefill, true);
      this.spread(blkRefill, false);
    }
    this.react(x, y, z);
    // a log gone: the leaves around it may have lost their tree
    if (BLOCKS[old & 0xFFF].name.endsWith('_log') && !BLOCKS[v & 0xFFF].name.endsWith('_log')) {
      for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const n = this.get(x + dx, y + dy, z + dz);
        if (BLOCKS[n & 0xFFF].name.endsWith('_leaves') && !(n >>> 12 & 1)) this.decay.set(`${x + dx},${y + dy},${z + dz}`, this.tick + 20 + Math.floor(this.r() * 200));
      }
    }
    return old;
  }
  /** Things near a change that may need to move: liquids, falling blocks, plants losing their ground, leaves. */
  react(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], ...DIRS]) {
      const nx = x + dx, ny = y + dy, nz = z + dz, v = this.get(nx, ny, nz), id = v & 0xFFF;
      if (LIQUID.has(id)) this.schedule(nx, ny, nz, id === ID.water ? 5 : this.nether ? 10 : 30);
      else if (id === ID.nether_portal) this.schedule(nx, ny, nz, 1);
      else if (GRAVITY.has(id)) this.schedule(nx, ny, nz, 2);
      else if (PLANT.has(id) && dy !== -1) this.schedule(nx, ny, nz, 1);
      else if (PAIRED.has(id)) this.schedule(nx, ny, nz, 1);
    }
  }
  schedule(x, y, z, delay) { const k = `${x},${y},${z}`; const t = this.tick + delay; if (!this.due.has(k) || this.due.get(k) > t) this.due.set(k, t); }
  /** Breaks a block the world itself takes away (a plant washed off, leaves): its drops go to the page. */
  breakBlock(x, y, z, drop = true) {
    const v = this.get(x, y, z);
    if (!v) return;
    this.set(x, y, z, 0);
    if (drop) { const items = dropsOf(BLOCKS[v & 0xFFF], v >>> 12, this.r); if (items.length) this.post({type: 'drops', x: x + 0.5, y: y + 0.25, z: z + 0.5, items}); }
  }
  // ---------- the world's ticks (20 a second) ----------
  step() {
    this.tick++;
    // scheduled updates that are due
    if (this.due.size) {
      const now = [];
      for (const [k, t] of this.due) if (t <= this.tick) now.push(k);
      for (const k of now) { this.due.delete(k); const [x, y, z] = k.split(',').map(Number); this.update(x, y, z); }
    }
    // random ticks near the player
    const [px, pz] = this.center;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const c = this.col(px + dx, pz + dz);
      if (!c) continue;
      for (let si = 0; si <= c.topSec; si++) {
        const s = c.sections[si];
        if (!s) continue;
        for (let k = 0; k < 3; k++) {
          const i = Math.floor(this.r() * 4096), v = s[i];
          if (v) this.randomTick(c.cx * 16 + (i & 15), MINY + si * 16 + (i >> 8), c.cz * 16 + (i >> 4 & 15), v);
        }
      }
    }
    // cold places: still water on top freezes, and while it snows a layer of snow settles (the game's 1 in 16 a column)
    if (this.snowing || this.tick % 4 === 0) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (this.r() >= 1 / 16) continue;
      const c = this.col(px + dx, pz + dz);
      if (!c) continue;
      const i = Math.floor(this.r() * 256), x = c.cx * 16 + (i & 15), z = c.cz * 16 + (i >> 4);
      if (!BIOMES[c.biome[i]]?.cold) continue;
      let y = MINY + (c.topSec + 1) * 16 - 1;
      while (y > MINY && !this.get(x, y, z)) y--;
      const top = this.get(x, y, z), id = top & 0xFFF;
      if ((this.light(x, y + 1, z) & 15) >= 10) continue;
      if (id === ID.water && !(top >>> 12)) this.set(x, y, z, ID.ice);
      else if (this.snowing && (OPAQUE[id] || BLOCKS[id].name.endsWith('_leaves')) && id !== ID.ice && id !== ID.packed_ice && id !== ID.blue_ice && y + 1 < MINY + HEIGHT) this.set(x, y + 1, z, ID.snow);
    }
    // leaves whose tree is gone
    if (this.decay.size && this.tick % 4 === 0) {
      let n = 0;
      for (const [k, t] of this.decay) {
        if (t > this.tick) continue;
        this.decay.delete(k);
        const [x, y, z] = k.split(',').map(Number), v = this.get(x, y, z);
        if (BLOCKS[v & 0xFFF].name.endsWith('_leaves') && !(v >>> 12 & 1) && !this.logNear(x, y, z)) this.breakBlock(x, y, z);
        if (++n > 6) break;
      }
    }
  }
  logNear(x, y, z) {
    for (let dy = -4; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
      if (BLOCKS[this.get(x + dx, y + dy, z + dz) & 0xFFF].name.endsWith('_log')) return true;
    }
    return false;
  }
  randomTick(x, y, z, v) {
    const id = v & 0xFFF, b = BLOCKS[id], r = this.r;
    const skyAbove = () => this.light(x, y + 1, z);
    const lit = () => { const l = skyAbove(); return Math.max(l & 15, (l >> 4) - this.darkness) ; };
    if (id === ID.grass_block) {
      const above = this.get(x, y + 1, z);
      if (above && (OPAQUE[above & 0xFFF] || LIQUID.has(above & 0xFFF))) { this.set(x, y, z, ID.dirt); return; }
      if (lit() >= 9) for (let k = 0; k < 4; k++) {
        const nx = x + Math.floor(r() * 3) - 1, ny = y + Math.floor(r() * 5) - 3, nz = z + Math.floor(r() * 3) - 1;
        if (this.get(nx, ny, nz) === ID.dirt) { const a = this.get(nx, ny + 1, nz); if (!a || !OPAQUE[a & 0xFFF] && !LIQUID.has(a & 0xFFF)) { const l = this.light(nx, ny + 1, nz); if (Math.max(l & 15, l >> 4) >= 4) this.set(nx, ny, nz, ID.grass_block); } }
      }
    } else if (b.name.endsWith('_sapling')) {
      if (lit() >= 9 && r() < 1 / 7) this.growSapling(x, y, z, b.name.replace('_sapling', ''));
    } else if (CROP.has(id)) {
      const meta = v >>> 12;
      if (meta < 7 && lit() >= 9 && r() < (this.get(x, y - 1, z) >>> 12 ? 0.33 : 0.16)) this.set(x, y, z, withMeta(id, meta + 1));
    } else if (id === ID.nether_wart) {
      // nether wart grows in the dark too: one chance in ten a random tick
      const meta = v >>> 12;
      if (meta < 3 && r() < 0.1) this.set(x, y, z, withMeta(id, meta + 1));
    } else if (id === ID.sugar_cane || id === ID.cactus) {
      if (this.get(x, y + 1, z)) return;
      let h = 1; while (h < 3 && (this.get(x, y - h, z) & 0xFFF) === id) h++;
      if (h < 3 && r() < 1 / 16) this.set(x, y + 1, z, id);
    } else if (id === ID.farmland) {
      const wet = this.waterNear(x, y, z), meta = v >>> 12;
      if (wet && !meta) this.set(x, y, z, withMeta(ID.farmland, 1));
      else if (!wet && meta) this.set(x, y, z, ID.farmland);
      else if (!wet && !this.get(x, y + 1, z) && r() < 0.2) this.set(x, y, z, ID.dirt);
    }
  }
  get darkness() { return this.dayDark || 0; }
  waterNear(x, y, z) {
    for (let dy = 0; dy <= 1; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if ((this.get(x + dx, y + dy, z + dz) & 0xFFF) === ID.water) return true;
    return false;
  }
  growSapling(x, y, z, kind) {
    const tree = {oak: 'oak', birch: 'birch', spruce: 'spruce', jungle: 'jungle', acacia: 'acacia', dark_oak: 'dark_oak'}[kind];
    if (kind === 'dark_oak') {
      // needs four in a square
      const sap = this.get(x, y, z);
      let base = null;
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => this.get(x + ox + a, y, z + oz + b) === sap)) { base = [x + ox, z + oz]; break; }
      if (!base) return;
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.set(base[0] + a, y, base[1] + b, 0);
      growTree({x: base[0], y: y - 1, z: base[1], kind: tree, r: this.r}, (wx, wy, wz, v, force) => this.treePut(wx, wy, wz, v, force));
      return;
    }
    // room to grow
    for (let k = 1; k < 6; k++) { const a = this.get(x, y + k, z); if (a && !BLOCKS[a & 0xFFF].replace && !BLOCKS[a & 0xFFF].name.endsWith('_leaves')) return; }
    this.set(x, y, z, 0);
    growTree({x, y: y - 1, z, kind: tree, r: this.r}, (wx, wy, wz, v, force) => this.treePut(wx, wy, wz, v, force));
  }
  treePut(x, y, z, v, force) {
    const old = this.get(x, y, z), ob = BLOCKS[old & 0xFFF];
    if (force) { if (ob.name.endsWith('_log') || !old || ob.replace || ob.name.endsWith('_leaves') || ob.name.endsWith('_sapling') || old === ID.grass_block || old === ID.dirt) this.set(x, y, z, v); return; }
    if (!old || ob.replace) this.set(x, y, z, v);
  }
  /** A scheduled update: liquids flow, sand falls, plants with nothing under them break. */
  update(x, y, z) {
    const v = this.get(x, y, z), id = v & 0xFFF;
    if (!v) return;
    if (GRAVITY.has(id)) {
      const below = this.get(x, y - 1, z), bb = BLOCKS[below & 0xFFF];
      if (y > MINY && (!below || LIQUID.has(below & 0xFFF) || bb.replace && !bb.solid)) {
        this.set(x, y, z, 0);
        if (below && !LIQUID.has(below & 0xFFF)) this.breakBlock(x, y - 1, z);
        this.set(x, y - 1, z, v);
        this.schedule(x, y - 1, z, 2);
      }
      return;
    }
    if (PLANT.has(id)) { if (!this.supported(x, y, z, v)) this.breakBlock(x, y, z); return; }
    // a door or a bed whose other half is gone goes too (its item came from the half that went)
    if (PAIRED.has(id)) { const [ox, oy, oz] = this.partner(x, y, z, v); if ((this.get(ox, oy, oz) & 0xFFF) !== id) this.set(x, y, z, 0); return; }
    if (LIQUID.has(id)) this.flow(x, y, z, v);
    // a portal whose frame is broken goes out (and the rest of it after it)
    if (id === ID.nether_portal && !portalHolds((a, b, c) => this.get(a, b, c), x, y, z, v)) this.set(x, y, z, 0);
  }
  /** Where the other half of a door (above or below) or a bed (head or foot) is. */
  partner(x, y, z, v) {
    const m = v >>> 12;
    if (BLOCKS[v & 0xFFF].shape === 'door') return [x, m & 8 ? y - 1 : y + 1, z];
    const [dx, dz] = FACE_DIR[m & 3], s = m & 4 ? -1 : 1;
    return [x + dx * s, y, z + dz * s];
  }
  supported(x, y, z, v) {
    const id = v & 0xFFF, below = this.get(x, y - 1, z), bid = below & 0xFFF, b = BLOCKS[id];
    if (b.shape === 'torch') {
      const m = v >>> 12;
      if (!m) return OPAQUE[bid] === 1 || BLOCKS[bid].shape === 'slab';
      const [dx, dz] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]][m];
      return OPAQUE[this.get(x + dx, y, z + dz) & 0xFFF] === 1;
    }
    if (b.shape === 'wall') { const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][v >>> 12 & 3]; return OPAQUE[this.get(x + dx, y, z + dz) & 0xFFF] === 1; }
    if (b.shape === 'lantern') return !!below && BLOCKS[bid].solid;
    if (CROP.has(id)) return bid === ID.farmland;
    if (id === ID.nether_wart) return bid === ID.soul_sand;
    if (id === ID.sugar_cane) return bid === ID.sugar_cane || ((bid === ID.sand || bid === ID.grass_block || bid === ID.dirt || bid === ID.red_sand) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => (this.get(x + dx, y - 1, z + dz) & 0xFFF) === ID.water));
    if (id === ID.cactus) return bid === ID.cactus || bid === ID.sand || bid === ID.red_sand;
    if (id === ID.dead_bush) return bid === ID.sand || bid === ID.red_sand || bid === ID.dirt || bid === ID.coarse_dirt || bid === ID.terracotta;
    if (b.shape === 'layer') return OPAQUE[bid] === 1 || BLOCKS[bid].name.endsWith('_leaves');
    if (b.shape === 'cross') return bid === ID.grass_block || bid === ID.dirt || bid === ID.podzol || bid === ID.coarse_dirt || bid === ID.farmland || bid === ID.moss_block || bid === ID.mud || (b.name.endsWith('mushroom') && OPAQUE[bid] === 1);
    return true;
  }
  /** Liquid levels in the meta: 0 a source, 1–7 flowing (higher is thinner), 8 falling. */
  flow(x, y, z, v) {
    const id = v & 0xFFF, meta = v >>> 12, water = id === ID.water, step = water || this.nether ? 1 : 2, delay = water ? 5 : this.nether ? 10 : 30;
    const same = n => (n & 0xFFF) === id, lvl = n => (n >>> 12) >= 8 ? 0 : (n >>> 12);
    let level = meta >= 8 ? 0 : meta;
    if (meta !== 0) {
      // a flowing block is fed from above or from a side that is less spread out
      let feed = 99;
      if (same(this.get(x, y + 1, z))) feed = -step;
      let sources = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.get(x + dx, y, z + dz);
        if (same(n)) { feed = Math.min(feed, lvl(n)); if (!(n >>> 12)) sources++; }
      }
      let next;
      if (water && sources >= 2) { const b = this.get(x, y - 1, z); if (OPAQUE[b & 0xFFF] || (same(b) && !(b >>> 12))) next = 0; }
      if (next === undefined) next = feed === -step ? 8 : feed + step;
      if (next > 7 && next !== 8) { this.set(x, y, z, 0); return; }
      if (next !== meta) { this.set(x, y, z, withMeta(id, next)); this.schedule(x, y, z, delay); }
      level = next >= 8 ? 0 : next;
      if (next === 0) level = 0;
    }
    // down first
    const below = this.get(x, y - 1, z);
    if (y > MINY && this.canFlow(below, id)) { this.pour(x, y - 1, z, id, 8, below); if (meta !== 0) return; }
    else if (y > MINY && same(below)) { if (meta !== 0) return; }
    // then out to the sides
    const next = level + step;
    if (next > 7) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, n = this.get(nx, y, nz);
      if (this.canFlow(n, id) || (same(n) && (n >>> 12) !== 0 && (n >>> 12) < 8 && (n >>> 12) > next)) this.pour(nx, y, nz, id, next, n);
    }
  }
  canFlow(n, id) {
    if (!n) return true;
    const nid = n & 0xFFF, b = BLOCKS[nid];
    if (nid === id) return false;
    if (LIQUID.has(nid)) return true;
    return !b.solid && !OPAQUE[nid] && b.shape !== 'liquid' && (b.replace || PLANT.has(nid));
  }
  pour(x, y, z, id, meta, old) {
    const oid = old & 0xFFF;
    if (LIQUID.has(oid) && oid !== id) {
      // water meets lava
      const lavaHere = oid === ID.lava;
      this.set(x, y, z, lavaHere ? (old >>> 12 ? ID.cobblestone : ID.obsidian) : ID.stone);
      this.post({type: 'sound', name: 'fizz', x: x + 0.5, y: y + 0.5, z: z + 0.5});
      return;
    }
    if (old && PLANT.has(oid)) this.breakBlock(x, y, z);
    this.set(x, y, z, withMeta(id, meta));
    this.schedule(x, y, z, id === ID.water ? 5 : 30);
  }

  // ---------- explosions, bone meal, animals ----------
  /**
   * An explosion the game's way: rays from the centre in all directions, each weakened by what it passes through
   * (blast resistance); blocks it gets through break. Drops: each block one time in `power`. TNT in it is lit.
   * Returns {drops: [[name, n, x, y, z]], tnt: [[x, y, z]]}.
   */
  explode(cx, cy, cz, power) {
    const hit = new Set(), r = this.r;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
      if (i && i !== 15 && j && j !== 15 && k && k !== 15) continue;
      let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      let x = cx, y = cy, z = cz, f = power * (0.7 + r() * 0.6);
      while (f > 0) {
        const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z), v = this.get(bx, by, bz);
        if (v) { f -= (BLOCKS[v & 0xFFF].blast + 0.3) * 0.3; if (f > 0) hit.add(`${bx},${by},${bz}`); }
        x += dx * 0.3; y += dy * 0.3; z += dz * 0.3; f -= 0.22500001;
      }
    }
    const drops = [], tnt = [];
    for (const k of hit) {
      const [x, y, z] = k.split(',').map(Number), v = this.get(x, y, z), b = BLOCKS[v & 0xFFF];
      if (!v || b.shape === 'liquid') continue;
      if (v === ID.tnt) { tnt.push([x, y, z]); this.set(x, y, z, 0); continue; }
      if (r() < 1 / power) for (const [name, n] of dropsOf(b, v >>> 12, r)) drops.push([name, n, x + 0.5, y + 0.5, z + 0.5]);
      this.set(x, y, z, 0);
    }
    return {drops, tnt};
  }
  /** Bone meal on a block: crops grow, saplings may become trees, grass sprouts flowers. Returns whether it took. */
  meal(x, y, z) {
    const v = this.get(x, y, z), id = v & 0xFFF, b = BLOCKS[id], r = this.r;
    if (CROP.has(id)) { if ((v >>> 12) >= 7) return false; this.set(x, y, z, withMeta(id, Math.min(7, (v >>> 12) + 2 + Math.floor(r() * 4)))); return true; }
    if (b.name.endsWith('_sapling')) { if (r() < 0.45) this.growSapling(x, y, z, b.name.replace('_sapling', '')); return true; }
    if (id === ID.grass_block && !this.get(x, y + 1, z)) {
      for (let k = 0; k < 48; k++) {
        const gx = x + Math.floor(r() * 7) - 3, gz = z + Math.floor(r() * 7) - 3;
        for (let gy = y + 1; gy >= y - 1; gy--) {
          if (this.get(gx, gy, gz) === ID.grass_block && !this.get(gx, gy + 1, gz)) { this.set(gx, gy + 1, gz, r() < 0.88 ? ID.short_grass : r() < 0.5 ? ID.dandelion : ID.poppy); break; }
        }
      }
      return true;
    }
    return false;
  }
  /** Animals living on a column made for the first time: [[kind, x, y, z, extra]] (the page keeps each place once). */
  herdFor(c) {
    const seed = this.seed, x0 = c.cx * 16, z0 = c.cz * 16;
    // the villagers (and the golem) of a village part here
    const people = villagersIn(seed, c.cx, c.cz);
    if (people.length) return people;
    const h = (salt) => { let n = Math.imul(seed ^ (c.cx * 73856093) ^ (c.cz * 19349663) ^ salt, 2654435761); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
    if (h(1) > 0.12) return [];
    const biome = BIOMES[c.biome[8 * 16 + 8]].name;
    const kinds = {plains: ['pig', 'cow', 'sheep', 'chicken'], meadow: ['sheep', 'cow', 'chicken'], forest: ['pig', 'cow', 'chicken', 'sheep'], birch_forest: ['pig', 'chicken', 'sheep'], dark_forest: ['pig', 'chicken'],
      taiga: ['sheep', 'pig'], snowy_taiga: ['sheep'], snowy_plains: ['sheep'], savanna: ['cow', 'sheep', 'chicken'], jungle: ['chicken', 'pig'], swamp: ['chicken'], beach: []}[biome];
    if (!kinds || !kinds.length) return [];
    const kind = kinds[Math.floor(h(2) * kinds.length)], n = 2 + Math.floor(h(3) * 3), out = [];
    for (let k = 0; k < n * 4 && out.length < n; k++) {
      const lx = Math.floor(h(10 + k) * 16), lz = Math.floor(h(40 + k) * 16), top = c.height[lz * 16 + lx];
      const g = this.get(x0 + lx, top, z0 + lz) & 0xFFF;
      if (g !== ID.grass_block && g !== ID.podzol) continue;
      if (this.get(x0 + lx, top + 1, z0 + lz) && !BLOCKS[this.get(x0 + lx, top + 1, z0 + lz) & 0xFFF].replace) continue;
      out.push([kind, x0 + lx + 0.5, top + 1, z0 + lz + 0.5]);
    }
    return out;
  }

  // ---------- meshing ----------
  /** The colours of grass, leaves and water for a column, mixed over nearby biomes. */
  tintOf(c) {
    // kept until another neighbour arrives
    let near = 0;
    for (const [dx, dz] of NEIGHBOURS) if (this.col(c.cx + dx, c.cz + dz)) near++;
    if (c.tint && c.tintNear === near) return c.tint;
    const grass = new Int32Array(256), foliage = new Int32Array(256), water = new Int32Array(256);
    // biomes over this column and two blocks around it
    const B = new Uint8Array(20 * 20);
    for (let z = -2; z < 18; z++) for (let x = -2; x < 18; x++) {
      const n = x < 0 || x > 15 || z < 0 || z > 15 ? this.col(c.cx + (x < 0 ? -1 : x > 15 ? 1 : 0), c.cz + (z < 0 ? -1 : z > 15 ? 1 : 0)) : c;
      B[(z + 2) * 20 + x + 2] = n ? n.biome[(z & 15) * 16 + (x & 15)] : c.biome[Math.max(0, Math.min(15, z)) * 16 + Math.max(0, Math.min(15, x))];
    }
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0;
      for (let dz = 0; dz < 5; dz++) for (let dx = 0; dx < 5; dx++) {
        const t = TINTS[B[(z + dz) * 20 + x + dx]];
        gr += t.grass >> 16 & 255; gg += t.grass >> 8 & 255; gb += t.grass & 255;
        fr += t.foliage >> 16 & 255; fg += t.foliage >> 8 & 255; fb += t.foliage & 255;
        wr += t.water >> 16 & 255; wg += t.water >> 8 & 255; wb += t.water & 255;
      }
      const i = z * 16 + x;
      grass[i] = Math.round(gr / 25) << 16 | Math.round(gg / 25) << 8 | Math.round(gb / 25);
      foliage[i] = Math.round(fr / 25) << 16 | Math.round(fg / 25) << 8 | Math.round(fb / 25);
      water[i] = Math.round(wr / 25) << 16 | Math.round(wg / 25) << 8 | Math.round(wb / 25);
    }
    c.tint = {grass, foliage, water}; c.tintNear = near;
    return c.tint;
  }
  /** Can this column's sections be meshed (all eight neighbours are here)? */
  ready(c) { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (!this.col(c.cx + dx, c.cz + dz)) return false; return true; }
  meshOne(c, si) {
    if (!c.sections[si] || !c.sections[si].some(v => v)) { this.post({type: 'mesh', cx: c.cx, cz: c.cz, sy: si, solid: null, trans: null}); return; }
    const pad = new Uint16Array(18 * 18 * 18), lit = new Uint8Array(18 * 18 * 18);
    const gx = new Int32Array(18 * 18), fx = new Int32Array(18 * 18), wx = new Int32Array(18 * 18);
    const tints = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.col(c.cx + dx, c.cz + dz);
      if (!n) continue;
      const t = this.tintOf(n);
      const xs = dx < 0 ? [15, 15] : dx > 0 ? [0, 0] : [0, 15], zs = dz < 0 ? [15, 15] : dz > 0 ? [0, 0] : [0, 15];
      for (let z = zs[0]; z <= zs[1]; z++) for (let x = xs[0]; x <= xs[1]; x++) {
        const px = x + dx * 16 + 1, pz = z + dz * 16 + 1, ti = pz * 18 + px;
        gx[ti] = t.grass[z * 16 + x]; fx[ti] = t.foliage[z * 16 + x]; wx[ti] = t.water[z * 16 + x];
        for (let py = 0; py < 18; py++) {
          const wy = MINY + si * 16 + py - 1;
          if (wy < MINY) { pad[py * 324 + pz * 18 + px] = ID.bedrock; continue; }
          if (wy >= MINY + HEIGHT) { lit[py * 324 + pz * 18 + px] = this.sky; continue; }
          const s2 = (wy - MINY) >> 4, sec = n.sections[s2], li = ((wy - MINY) & 15) << 8 | z << 4 | x;
          pad[py * 324 + pz * 18 + px] = sec ? sec[li] : 0;
          const ls = n.light[s2];
          lit[py * 324 + pz * 18 + px] = ls ? ls[li] : s2 > n.topSec ? this.sky : 0;
        }
      }
    }
    const m = meshSection(pad, lit, {grass: gx, foliage: fx, water: wx}, this.tex, {ox: c.cx * 16, oz: c.cz * 16, wave: this.wave});
    this.post({type: 'mesh', cx: c.cx, cz: c.cz, sy: si, solid: m.solid.length ? m.solid : null, trans: m.trans.length ? m.trans : null}, [m.solid.buffer, m.trans.buffer]);
  }
  /** Sends the page its copy of a column's blocks and light. */
  sendColumn(c) {
    const sections = c.sections.map(s => s && s.slice()), light = c.light.map(s => s && s.slice());
    const transfer = [...sections, ...light].filter(Boolean).map(s => s.buffer);
    this.post({type: 'column', cx: c.cx, cz: c.cz, sections, light, topSec: c.topSec, biome: c.biome.slice(), height: c.height.slice(), ack: this.ack}, transfer);
    c.sent = true;
  }

  // ---------- portals ----------
  /** A column made or read back now (not waiting for its turn). */
  async ensure(cx, cz) {
    const k = key(cx, cz);
    if (this.cols.has(k)) return;
    const c = this.store?.has(cx, cz) ? await this.store.load(cx, cz).catch(() => null) : null;
    if (!this.cols.has(k)) this.addColumn(c || (this.nether ? generateNether : generateColumn)(this.seed, cx, cz));
  }
  /**
   * A new portal for someone coming out near (x, y, z): on the ground nearby with room round it (the overworld's
   * surface; in the Nether the cavern floor nearest their height), built of obsidian and lit. Returns {x, y, z, axis}.
   */
  async makePortal({x, y, z}) {
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) await this.ensure(cx + dx, cz + dz);
    const get = (a, b, c) => this.get(a, b, c);
    const at = this.nether ? portalSpot(get, x, z, 32, 118, Math.max(32, Math.min(118, Math.round(y))), false) : portalSpot(get, x, z, SEA - 2, 200, Math.max(SEA + 1, Math.round(y)), true);
    buildPortal((a, b, c, v) => this.set(a, b, c, v), at.x, at.y, at.z, at.axis);
    return at;
  }

  // ---------- around the player ----------
  /** Work for one slice of time: read / make the nearest missing columns, mesh what changed, send copies. */
  async work(budget = 12) {
    const t0 = performance.now(), [px, pz] = this.center, R = this.radius;
    // 1. columns: the nearest missing ones first
    const missing = [];
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const d = dx * dx + dz * dz;
      if (d > (R + 1.5) ** 2) continue;
      const cx = px + dx, cz = pz + dz;
      if (!this.cols.has(key(cx, cz)) && !this.loading.has(key(cx, cz))) missing.push([d, cx, cz]);
    }
    missing.sort((a, b) => a[0] - b[0]);
    let did = 0;
    for (const [, cx, cz] of missing) {
      if (performance.now() - t0 > budget) break;
      did++;
      const k = key(cx, cz);
      this.loading.add(k);
      let c = null;
      if (this.store && this.store.has(cx, cz)) c = await this.store.load(cx, cz).catch(() => null);
      let fresh = false;
      if (!c) { c = (this.nether ? generateNether : generateColumn)(this.seed, cx, cz); fresh = true; }
      this.loading.delete(k);
      if (this.cols.has(k)) continue;
      this.addColumn(c);
      if (fresh && !this.nether) { const herd = this.herdFor(c); if (herd.length) this.post({type: 'herd', cx, cz, list: herd}); }
    }
    // 2. meshes: changed sections of columns whose neighbours are all here, nearest first
    if (this.dirty.size) {
      const list = [];
      for (const ks of this.dirty) {
        const ck = Math.floor(ks / 32), si = ks % 32, c = this.cols.get(ck);
        if (!c) { this.dirty.delete(ks); continue; }
        const dx = c.cx - px, dz = c.cz - pz;
        if (dx * dx + dz * dz > (R + 0.5) ** 2) continue;
        if (!this.ready(c)) continue;
        list.push([dx * dx + dz * dz, ks, c, si]);
      }
      list.sort((a, b) => a[0] - b[0]);
      for (const [, ks, c, si] of list) {
        if (performance.now() - t0 > budget * 1.6) break;
        did++;
        this.dirty.delete(ks);
        if (!c.sent) this.sendColumn(c);
        this.meshOne(c, si);
      }
    }
    // 3. copies of changed columns for the page
    for (const c of this.cols.values()) if (!c.sent) { const dx = c.cx - px, dz = c.cz - pz; if (dx * dx + dz * dz <= (R + 0.5) ** 2 && this.ready(c)) this.sendColumn(c); }
    // 4. columns far away go (saved first when changed)
    for (const [k, c] of this.cols) {
      const dx = c.cx - px, dz = c.cz - pz;
      if (dx * dx + dz * dz > (R + 3) ** 2) {
        if (c.changed && this.store) this.store.save(c);
        this.cols.delete(k);
        this.post({type: 'drop', cx: c.cx, cz: c.cz});
      }
    }
    return did > 0;
  }
  /** Saves every changed column. */
  async flush() {
    if (!this.store) return;
    const list = [...this.cols.values()].filter(c => c.changed);
    for (const c of list) { await this.store.save(c); c.changed = false; }
  }
}
