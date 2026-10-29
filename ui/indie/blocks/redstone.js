// Redstone, by the game's rules (Java edition), worked out in the world worker, which every block change passes through:
// what gives power (dust, torches, levers, buttons, pressure plates, the block of redstone, repeaters, comparators,
// observers, daylight detectors, targets, detector rails, tripwire hooks, trapped chests) and what answers it (lamps,
// pistons, doors, trapdoors and gates, TNT, note blocks, bells, dispensers and droppers, hoppers, powered and activator
// rails).
//
// Power: a block gives some to each neighbour, and some push it into a solid block ("strong": a torch into the block above
// it, a lever or button into the block it hangs on, a pressure plate into the block under it, a repeater, comparator or
// observer into the block in front, dust into what it runs to) — a solid block with power pushed into it powers what is
// round it, except that dust takes nothing from a block that only dust powers. Dust is solved a whole joined stretch at a
// time (the game's result, without its storms of updates). Torches, repeaters, comparators, observers and a lamp going
// out answer some ticks late, as in the game; torches flipped eight times in three seconds burn out for a while.
import {BLOCKS, ID, FACES, OPPOSITE, withMeta} from './blocks.js';
import {wireLinks, WIRE_SIDES, ATTACHED, conducts} from './shapes.js';

const KIND = BLOCKS.map(b => b.rs || ''), SHAPE = BLOCKS.map(b => b.shape);
const OPENS = new Set(['door', 'trapdoor', 'gate']);
// what takes part: the redstone kinds, and doors, trapdoors and gates
const PART = BLOCKS.map(b => b.rs || (OPENS.has(b.shape) ? 'opens' : ''));
const key = (x, y, z) => `${x},${y},${z}`;
const F4 = [4, 1, 5, 0];                     // a facing (0 south, 1 west, 2 north, 3 east) as FACES
const SIDE_OF = {0: 0, 1: 1, 4: 2, 5: 3};    // FACES → wireLinks' order
const TORCH_ON = [3, 0, 1, 4, 5];            // a torch's state → the way to the block it stands on or hangs from
// everything within two steps (what a change in power can reach)
const NEAR2 = [];
for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2) NEAR2.push([dx, dy, dz]);
// pushed by a piston: what breaks instead of moving, and what cannot move at all (what keeps things the page holds: chests,
// furnaces …; bedrock, obsidian, a piston's head or a piston pushed out)
const BREAKS = new Set(['cross', 'crop', 'torch', 'wall', 'layer', 'lantern', 'cocoa', 'carpet', 'wire', 'repeater', 'comparator', 'lever', 'button', 'plate', 'door', 'bed', 'tall', 'vine', 'cactus', 'portal', 'hook', 'tripwire']);
const KEEPS = new Set(['furnace', 'chest', 'barrel', 'enchant', 'brew', 'dispenser', 'hopper', 'note']);
const fixed = v => { const b = BLOCKS[v & 0xFFF]; return b.hard < 0 || b.name === 'obsidian' || KIND[b.id] === 'head' || (KIND[b.id] === 'piston' && !!(v >>> 12 & 8)) || KEEPS.has(b.use); };
const LIQUID = new Set([ID.water, ID.lava]);
const empty = v => !v || LIQUID.has(v & 0xFFF) || BLOCKS[v & 0xFFF].replace;

export class Redstone {
  /** world: get(x, y, z), set(x, y, z, v, {quietWire}), breakBlock(x, y, z), post(message), light(x, y, z), has(x, z), tick. */
  constructor(world) {
    this.w = world; this.due = new Map(); this.later = new Map(); this.queue = new Set(); this.busy = false; this.gen = 0; this.solved = new Map();
    this.was = new Map();      // the last power seen by what answers only a change of it (doors, note blocks, bells)
    this.comps = new Map();    // each comparator's output
    this.fills = new Map();    // how full the page says each container is (0–15), for comparators
    this.trapped = new Map();  // how many have each trapped chest open (the page says)
    this.flips = new Map(); this.burnt = new Map();   // torches' recent flips; burnt out till
    this.detectors = new Set(); this.daylight = 1; this.dark = 0;
    this.loose = new Set();    // pressure plates and detector rails read back pressed: let go (the page presses them again if something is there)
  }
  get(x, y, z) { return this.w.get(x, y, z); }

  // ---------- what gives power ----------
  /** The power the block at x, y, z gives its neighbour that way (t: FACES, from it to the neighbour); strong: pushed into it. */
  out(x, y, z, t, strong = false, dust = true) {
    const v = this.get(x, y, z), id = v & 0xFFF, m = v >>> 12;
    switch (KIND[id]) {
      case 'wire':
        if (!dust || !m || t === 2) return 0;
        return t === 3 || wireLinks((dx, dy, dz) => this.get(x + dx, y + dy, z + dz))[SIDE_OF[t]] ? m : 0;
      case 'torch': return id !== ID.redstone_torch ? 0 : strong ? (t === 2 ? 15 : 0) : t === TORCH_ON[m] ? 0 : 15;
      case 'block': return strong ? 0 : 15;
      case 'lever': case 'button': return !(m & 8) ? 0 : !strong || t === ATTACHED[m & 7] ? 15 : 0;
      case 'plate': return !strong || t === 3 ? m : 0;
      // a tripwire hook on: strongly into the block it hangs on (behind it); a trapped chest open: strongly down
      case 'hook': return !(m & 8) ? 0 : !strong || t === OPPOSITE[F4[m & 3]] ? 15 : 0;
      case 'trapped': { const n = Math.min(15, this.trapped.get(key(x, y, z)) || 0); return !strong || t === 3 ? n : 0; }
      case 'repeater': return id === ID.repeater_on && t === F4[m & 3] ? 15 : 0;
      case 'comparator': return t === F4[m & 3] ? this.compOut(x, y, z, v) : 0;
      case 'observer': return m & 8 && t === OPPOSITE[m & 7] ? 15 : 0;
      case 'detector': case 'target': return strong ? 0 : m;
      case 'rail': return BLOCKS[id].rail === 'detector' && m & 8 && (!strong || t === 3) ? 15 : 0;
    }
    return 0;
  }
  /** The power pushed into the block at x, y, z by what is round it. */
  strongIn(x, y, z, dust = true) {
    let best = 0;
    for (let d = 0; d < 6 && best < 15; d++) { const [dx, dy, dz] = FACES[d]; best = Math.max(best, this.out(x + dx, y + dy, z + dz, OPPOSITE[d], true, dust)); }
    return best;
  }
  /** What reaches x, y, z from its neighbour that way (d: FACES): what that one gives, and — a solid block — the power pushed into it. */
  from(x, y, z, d, dust = true) {
    const [dx, dy, dz] = FACES[d], nx = x + dx, ny = y + dy, nz = z + dz, s = this.out(nx, ny, nz, OPPOSITE[d], false, dust);
    return s >= 15 || !conducts(this.get(nx, ny, nz)) ? s : Math.max(s, this.strongIn(nx, ny, nz, dust));
  }
  /** The most power reaching x, y, z from any side (but skip); dust: whether dust counts (not for dust's own power). */
  power(x, y, z, dust = true, skip = -1) { let best = 0; for (let d = 0; d < 6 && best < 15; d++) if (d !== skip) best = Math.max(best, this.from(x, y, z, d, dust)); return best; }
  powered(x, y, z, skip = -1) { return this.power(x, y, z, true, skip) > 0; }

  // ---------- dust ----------
  /** The dust joined to this piece: beside it, a step up (nothing solid over this one) or a step down (nothing solid beside). */
  linked(x, y, z) {
    const out = [], high = BLOCKS[this.get(x, y + 1, z) & 0xFFF].opaque;
    for (const [, dx, dz] of WIRE_SIDES) {
      const side = this.get(x + dx, y, z + dz);
      if (KIND[side & 0xFFF] === 'wire') out.push([x + dx, y, z + dz]);
      if (!high && KIND[this.get(x + dx, y + 1, z + dz) & 0xFFF] === 'wire') out.push([x + dx, y + 1, z + dz]);
      if (!BLOCKS[side & 0xFFF].opaque && KIND[this.get(x + dx, y - 1, z + dz) & 0xFFF] === 'wire') out.push([x + dx, y - 1, z + dz]);
    }
    return out;
  }
  /** A whole stretch of joined dust: each piece's own power from what is round it, then along the dust, one less a step. */
  solveWire(x, y, z) {
    const net = new Map(), stack = [[x, y, z]];
    while (stack.length && net.size < 4096) {
      const p = stack.pop(), k = key(...p);
      if (net.has(k) || KIND[this.get(...p) & 0xFFF] !== 'wire') continue;
      net.set(k, p);
      for (const q of this.linked(...p)) if (!net.has(key(...q))) stack.push(q);
    }
    const level = new Map(), buckets = Array.from({length: 16}, () => []);
    for (const [k, [a, b, c]] of net) { const s = this.power(a, b, c, false); level.set(k, s); if (s > 1) buckets[s].push(k); }
    for (let s = 15; s > 1; s--) for (const k of buckets[s]) {
      if (level.get(k) !== s) continue;
      for (const q of this.linked(...net.get(k))) { const qk = key(...q); if (net.has(qk) && level.get(qk) < s - 1) { level.set(qk, s - 1); buckets[s - 1].push(qk); } }
    }
    for (const [k, [a, b, c]] of net) {
      const v = this.get(a, b, c), s = level.get(k);
      this.solved.set(k, this.gen);
      if ((v >>> 12) !== s) { this.w.set(a, b, c, withMeta(v & 0xFFF, s), {quietWire: true}); this.around(a, b, c, false); }
    }
  }

  // ---------- changes and their answers ----------
  /** Everything within two steps that takes part (wires too, or not) to be looked at again. */
  around(x, y, z, wires = true) {
    for (const [dx, dy, dz] of NEAR2) { const p = PART[this.get(x + dx, y + dy, z + dz) & 0xFFF]; if (p && (wires || p !== 'wire')) this.queue.add(key(x + dx, y + dy, z + dz)); }
  }
  /** A block changed (by the player or the world): observers watching it see it; what is round it may answer. */
  changed(x, y, z, old, v, quietWire = false) {
    for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = FACES[d], o = this.get(x - dx, y - dy, z - dz);
      if (KIND[o & 0xFFF] === 'observer' && (o >>> 12 & 7) === d) this.schedule(x - dx, y - dy, z - dz, 2);
    }
    if (quietWire) return;
    this.gen++;
    // a piston's head broken off takes the piston (it drops); a piston gone, its head goes too (that by its support)
    if (KIND[old & 0xFFF] === 'head' && !v) {
      const F = old >>> 12 & 7, [dx, dy, dz] = FACES[OPPOSITE[F]], base = this.get(x + dx, y + dy, z + dz);
      if (KIND[base & 0xFFF] === 'piston' && (base >>> 12) === (F | 8)) this.w.breakBlock(x + dx, y + dy, z + dz);
    }
    this.around(x, y, z);
    this.flush();
  }
  flush() {
    if (this.busy) return;
    this.busy = true;
    for (let n = 0; this.queue.size && n < 50000; n++) {
      const k = this.queue.values().next().value;
      this.queue.delete(k);
      const [x, y, z] = k.split(',').map(Number), v = this.get(x, y, z), id = v & 0xFFF;
      if (KIND[id] === 'wire') { if (this.solved.get(k) !== this.gen) this.solveWire(x, y, z); }
      else if (PART[id]) this.answer(x, y, z, v);
    }
    this.queue.clear(); this.busy = false;
    if (this.solved.size > 50000) this.solved.clear();
  }
  schedule(x, y, z, delay) { const k = key(x, y, z), at = this.w.tick + delay; if (!this.due.has(k) || this.due.get(k) > at) this.due.set(k, at); }
  /** One world tick: what was due answers; daylight detectors look at the sky every second. */
  step() {
    const t = this.w.tick;
    if (this.due.size) {
      const now = [];
      for (const [k, at] of this.due) if (at <= t) now.push(k);
      for (const k of now) { this.due.delete(k); const [x, y, z] = k.split(',').map(Number); this.tick(x, y, z, this.get(x, y, z)); }
    }
    if (this.later.size && t % 10 === 0) for (const [k, at] of this.later) {
      if (at > t) continue;
      const [x, y, z] = k.split(',').map(Number);
      // (only once the land round it is here: its power may come from next door)
      if (![[16, 0], [-16, 0], [0, 16], [0, -16]].every(([dx, dz]) => this.w.has(x + dx, z + dz))) { this.later.set(k, t + 20); continue; }
      this.later.delete(k); this.queue.add(k);
      if (this.loose.delete(k)) { const v = this.get(x, y, z), b = BLOCKS[v & 0xFFF]; if (KIND[b.id] === 'plate') this.w.set(x, y, z, b.id); else if (b.rail === 'detector') this.w.set(x, y, z, withMeta(b.id, v >>> 12 & 7)); }
    }
    if (t % 20 === 0 && this.detectors.size) this.sun();
    this.flush();
  }
  /** A column read back from the save: its redstone looked at again soon (scheduled ticks are not kept). */
  scan(c) {
    for (let si = 0; si < c.sections.length; si++) {
      const s = c.sections[si];
      if (!s) continue;
      for (let i = 0; i < 4096; i++) {
        const p = PART[s[i] & 0xFFF];
        if (!p || p === 'wire' || p === 'opens' || p === 'rail' && BLOCKS[s[i] & 0xFFF].rail === 'rail') continue;
        const x = c.cx * 16 + (i & 15), y = -64 + si * 16 + (i >> 8), z = c.cz * 16 + (i >> 4 & 15);
        this.later.set(key(x, y, z), this.w.tick + 20);
        if (p === 'detector') this.detectors.add(key(x, y, z));
        if ((p === 'plate' && s[i] >>> 12) || (p === 'rail' && s[i] >>> 12 & 8 && BLOCKS[s[i] & 0xFFF].rail === 'detector')) this.loose.add(key(x, y, z));
        // (a hook read back on looks along its string again soon: what is on the string says, a pulse is over)
        if (p === 'hook' && s[i] >>> 12 & 8) this.w.hookDue?.set(key(x, y, z), this.w.tick + 20);
      }
    }
  }
  /** The page says how full a container is (null: gone); comparators reading it look again. */
  fill(x, y, z, level) {
    const k = key(x, y, z);
    if (level == null) this.fills.delete(k); else this.fills.set(k, level);
    this.gen++; this.around(x, y, z); this.flush();
  }

  /** The page says how many have a trapped chest open (0: shut); what is round it looks again. */
  open(x, y, z, n) {
    const k = key(x, y, z);
    if (n) this.trapped.set(k, n); else this.trapped.delete(k);
    this.gen++; this.around(x, y, z); this.flush();
  }
  /** A part's answer to what changed near it: at once (lamps on, doors, pistons, TNT …) or a few ticks on. */
  answer(x, y, z, v) {
    const id = v & 0xFFF, m = v >>> 12, b = BLOCKS[id], k = key(x, y, z);
    switch (PART[id]) {
      case 'torch': if ((id === ID.redstone_torch) === this.torchIn(x, y, z, m)) this.schedule(x, y, z, 2); return;
      case 'repeater': if (!this.locked(x, y, z, m) && (id === ID.repeater_on) !== this.diodeIn(x, y, z, m) > 0) this.schedule(x, y, z, 2 * ((m >> 2 & 3) + 1)); return;
      case 'comparator': if (this.compIn(x, y, z, m) !== this.compOut(x, y, z, v)) this.schedule(x, y, z, 2); return;
      case 'lamp': { const lit = id === ID.redstone_lamp_on, p = this.powered(x, y, z); if (p && !lit) this.w.set(x, y, z, ID.redstone_lamp_on); else if (!p && lit) this.schedule(x, y, z, 4); return; }
      case 'button': if (m & 8) this.schedule(x, y, z, b.press); return;
      case 'piston': return this.piston(x, y, z, v);
      case 'tnt': if (this.powered(x, y, z)) { this.w.set(x, y, z, 0); this.w.post({type: 'prime', x, y, z}); } return;
      case 'note': case 'bell': {
        const p = this.powered(x, y, z), was = this.was.get(k) || false;
        this.was.set(k, p);
        if (p && !was) this.w.post(PART[id] === 'note' ? {type: 'note', x, y, z} : {type: 'sound', name: 'bell', x, y, z});
        return;
      }
      case 'dispenser': case 'dropper': {
        // (also the game's quirk: power round the block above it counts)
        const p = this.powered(x, y, z) || this.powered(x, y + 1, z, 3);
        if (p && !(m & 8)) { this.w.set(x, y, z, withMeta(id, m | 8)); this.schedule(x, y, z, 4); }
        else if (!p && m & 8) this.w.set(x, y, z, withMeta(id, m & 7));
        return;
      }
      case 'hopper': { const lock = this.powered(x, y, z); if (!!(m & 8) !== lock) this.w.set(x, y, z, withMeta(id, (m & 7) | (lock ? 8 : 0))); return; }
      case 'rail': if (b.rail === 'powered' || b.rail === 'activator') { const p = this.railPowered(x, y, z, v); if (!!(m & 8) !== p) this.w.set(x, y, z, withMeta(id, (m & 7) | (p ? 8 : 0))); } return;
      case 'detector': this.detectors.add(k); return;
      case 'opens': return this.opens(x, y, z, v);
    }
  }
  /** What was due: torches, repeaters, comparators, lamps going out, observers' pulses, buttons let go, dispensers firing. */
  tick(x, y, z, v) {
    const id = v & 0xFFF, m = v >>> 12, k = key(x, y, z);
    switch (KIND[id]) {
      case 'torch': {
        const lit = id === ID.redstone_torch, off = this.torchIn(x, y, z, m);
        if (lit && off) {
          const list = (this.flips.get(k) || []).filter(t => t > this.w.tick - 60);
          list.push(this.w.tick); this.flips.set(k, list);
          this.w.set(x, y, z, withMeta(ID.redstone_torch_off, m));
          if (list.length >= 8) { this.burnt.set(k, this.w.tick + 160); this.w.post({type: 'sound', name: 'fizz', x, y, z}); }
        } else if (!lit && !off) {
          if ((this.burnt.get(k) || 0) > this.w.tick) this.schedule(x, y, z, this.burnt.get(k) - this.w.tick);
          else this.w.set(x, y, z, withMeta(ID.redstone_torch, m));
        }
        return;
      }
      case 'repeater': {
        if (this.locked(x, y, z, m)) return;
        const on = id === ID.repeater_on, input = this.diodeIn(x, y, z, m) > 0;
        if (on && !input) this.w.set(x, y, z, withMeta(ID.repeater, m));
        else if (!on) { this.w.set(x, y, z, withMeta(ID.repeater_on, m)); if (!input) this.schedule(x, y, z, 2 * ((m >> 2 & 3) + 1)); }
        return;
      }
      case 'comparator': {
        const o = this.compIn(x, y, z, m);
        if (o === this.compOut(x, y, z, v)) return;
        this.comps.set(k, o);
        const want = o > 0 ? ID.comparator_on : ID.comparator;
        if (id !== want) this.w.set(x, y, z, withMeta(want, m)); else { this.gen++; this.around(x, y, z); }
        return;
      }
      case 'lamp': if (id === ID.redstone_lamp_on && !this.powered(x, y, z)) this.w.set(x, y, z, ID.redstone_lamp); return;
      case 'observer': if (m & 8) this.w.set(x, y, z, withMeta(id, m & 7)); else { this.w.set(x, y, z, withMeta(id, m | 8)); this.schedule(x, y, z, 2); } return;
      case 'button': if (m & 8) { this.w.set(x, y, z, withMeta(id, m & 7)); this.w.post({type: 'sound', name: 'click', x, y, z}); } return;
      case 'dispenser': case 'dropper': this.w.post({type: 'dispense', x, y, z, face: m & 7, drop: KIND[id] === 'dropper'}); return;
    }
  }

  // ---------- the parts ----------
  /** Is the block a torch stands on (or hangs from) powered? Then the torch goes out. */
  torchIn(x, y, z, m) { return this.from(x, y, z, TORCH_ON[m] ?? 3) > 0; }
  /** A repeater's input: what comes from behind it. */
  diodeIn(x, y, z, m) { return this.from(x, y, z, OPPOSITE[F4[m & 3]]); }
  /** A repeater is locked while a powered repeater or comparator points into its side. */
  locked(x, y, z, m) {
    for (const s of [(m + 1) & 3, (m + 3) & 3]) {
      const d = F4[s], [dx, dy, dz] = FACES[d], n = this.get(x + dx, y + dy, z + dz), nk = KIND[n & 0xFFF];
      if ((nk === 'repeater' || nk === 'comparator') && F4[n >>> 12 & 3] === OPPOSITE[d] && this.out(x + dx, y + dy, z + dz, OPPOSITE[d]) > 0) return true;
    }
    return false;
  }
  /**
   * A comparator: the power behind it (or how full a container there is — even through a solid block), less what comes
   * into its sides (subtracting), or that power only while the sides give no more (comparing).
   */
  compIn(x, y, z, m) {
    const back = OPPOSITE[F4[m & 3]], [dx, dy, dz] = FACES[back], bx = x + dx, by = y + dy, bz = z + dz;
    let a = this.fills.get(key(bx, by, bz)) ?? -1;
    if (a < 0) {
      a = this.from(x, y, z, back);
      if (a < 15 && conducts(this.get(bx, by, bz))) { const f = this.fills.get(key(bx + dx, by + dy, bz + dz)); if (f != null) a = Math.max(a, f); }
    }
    let side = 0;
    for (const s of [(m + 1) & 3, (m + 3) & 3]) {
      const d = F4[s], [sx, sy, sz] = FACES[d], nk = KIND[this.get(x + sx, y + sy, z + sz) & 0xFFF];
      if (nk === 'wire' || nk === 'repeater' || nk === 'comparator' || nk === 'block') side = Math.max(side, this.out(x + sx, y + sy, z + sz, OPPOSITE[d]));
    }
    return m & 4 ? Math.max(0, a - side) : a >= side ? a : 0;
  }
  compOut(x, y, z, v) {
    const k = key(x, y, z);
    if (!this.comps.has(k)) { this.comps.set(k, 0); this.comps.set(k, this.compIn(x, y, z, v >>> 12)); }
    return this.comps.get(k);
  }
  /** Doors, trapdoors and gates open while powered (and shut when it stops) — only when their power changes. */
  opens(x, y, z, v) {
    const id = v & 0xFFF, m = v >>> 12, door = SHAPE[id] === 'door', ly = door && m & 8 ? y - 1 : y, oy = door ? (m & 8 ? y - 1 : y + 1) : y;
    const p = this.powered(x, y, z) || (door && this.powered(x, oy, z)), k = key(x, ly, z);
    if ((this.was.get(k) || false) === p) return;
    this.was.set(k, p);
    if (!!(m & 4) === p) return;
    this.w.set(x, y, z, withMeta(id, m ^ 4));
    if (door) { const o = this.get(x, oy, z); if ((o & 0xFFF) === id) this.w.set(x, oy, z, withMeta(id, (o >>> 12) ^ 4)); }
    this.w.post({type: 'sound', name: p ? 'door_open' : 'door_close', x, y, z, iron: !!BLOCKS[id].iron});
  }
  /** A powered or activator rail: powered itself, or joined in a line (up to eight on) to one of its kind that is. */
  railPowered(x, y, z, v) {
    if (this.powered(x, y, z)) return true;
    const id = v & 0xFFF, m = v >>> 12 & 7, alongX = m === 1 || m === 2 || m === 3;
    for (const s of [1, -1]) {
      let cx = x, cy = y, cz = z, cm = m;
      for (let n = 0; n < 8; n++) {
        const dx = alongX ? s : 0, dz = alongX ? 0 : s, up = (cm === 2 && dx > 0) || (cm === 3 && dx < 0) || (cm === 4 && dz < 0) || (cm === 5 && dz > 0);
        let ny = cy + (up ? 1 : 0), nv = this.get(cx + dx, ny, cz + dz);
        if ((nv & 0xFFF) !== id) { ny--; nv = this.get(cx + dx, ny, cz + dz); if ((nv & 0xFFF) !== id) break; }
        const nm = nv >>> 12 & 7;
        if ((nm === 1 || nm === 2 || nm === 3) !== alongX) break;
        if (this.powered(cx + dx, ny, cz + dz)) return true;
        cx += dx; cy = ny; cz += dz; cm = nm;
      }
    }
    return false;
  }
  /** Daylight detectors: the sky's light on them by day (inverted: the dark's), every second. */
  sun() {
    for (const k of this.detectors) {
      const [x, y, z] = k.split(',').map(Number), v = this.get(x, y, z), b = BLOCKS[v & 0xFFF];
      if (KIND[b.id] !== 'detector') { if (this.w.has(x, z)) this.detectors.delete(k); continue; }
      const lit = Math.max(0, (this.w.light(x, y, z) >> 4) - this.dark);
      const p = Math.max(0, Math.min(15, b.inverted ? 15 - lit : Math.round(lit * Math.max(0, Math.min(1, this.daylight * 1.15)))));
      if ((v >>> 12) !== p) this.w.set(x, y, z, withMeta(b.id, p));
    }
  }

  // ---------- pistons ----------
  /** A piston pushes out while powered from any side but its face (or round the block above it — the game's quirk), and pulls back when not. */
  piston(x, y, z, v) {
    const m = v >>> 12, F = m & 7, out = !!(m & 8);
    let p = false;
    for (let d = 0; d < 6 && !p; d++) if (d !== F && this.from(x, y, z, d) > 0) p = true;
    for (let d = 0; d < 6 && !p; d++) if (d !== 3 && this.from(x, y + 1, z, d) > 0) p = true;
    if (p && !out) this.extend(x, y, z, v);
    else if (!p && out) this.retract(x, y, z, v);
  }
  /**
   * What moves when a piston at px, py, pz moves the block at sx, sy, sz that way (dir): the line of blocks ahead of it
   * (twelve at most), with what slime blocks hold on to; null when something can't move. Things that break go in destroy.
   */
  structure(sx, sy, sz, dir, px, py, pz) {
    const [dx, dy, dz] = FACES[dir], move = new Map(), destroy = new Map();
    const line = (x, y, z) => {
      for (;;) {
        if (x === px && y === py && z === pz) return false;
        const v = this.get(x, y, z), k = key(x, y, z);
        if (empty(v) || move.has(k)) return true;
        if (BREAKS.has(SHAPE[v & 0xFFF])) { destroy.set(k, [x, y, z]); return true; }
        if (fixed(v) || move.size >= 12) return false;
        move.set(k, [x, y, z, v]);
        x += dx; y += dy; z += dz;
      }
    };
    if (!line(sx, sy, sz)) return null;
    for (const [x, y, z, v] of move.values()) {
      if (!BLOCKS[v & 0xFFF].slime) continue;
      for (let d = 0; d < 6; d++) {
        if (d === dir) continue;
        const [ax, ay, az] = FACES[d], nx = x + ax, ny = y + ay, nz = z + az, n = this.get(nx, ny, nz);
        if (empty(n) || fixed(n) || BREAKS.has(SHAPE[n & 0xFFF]) || move.has(key(nx, ny, nz)) || (nx === px && ny === py && nz === pz)) continue;
        if (!line(nx, ny, nz)) return null;
      }
    }
    return {move: [...move.values()], destroy: [...destroy.values()]};
  }
  /** Moves a structure one block that way: what breaks breaks, the places left go empty, the blocks land. */
  shift(s, dir) {
    const [dx, dy, dz] = FACES[dir], land = new Map();
    for (const [x, y, z, v] of s.move) land.set(key(x + dx, y + dy, z + dz), [x + dx, y + dy, z + dz, v]);
    for (const [x, y, z] of s.destroy) this.w.breakBlock(x, y, z);
    for (const [x, y, z] of s.move) if (!land.has(key(x, y, z))) this.w.set(x, y, z, 0);
    for (const [x, y, z, v] of land.values()) this.w.set(x, y, z, v);
  }
  extend(x, y, z, v) {
    const F = v >>> 12 & 7, [dx, dy, dz] = FACES[F], hx = x + dx, hy = y + dy, hz = z + dz;
    const s = this.structure(hx, hy, hz, F, x, y, z);
    if (!s) return;
    this.shift(s, F);
    this.w.set(x, y, z, withMeta(v & 0xFFF, F | 8));
    this.w.set(hx, hy, hz, withMeta(ID.piston_head, F | (BLOCKS[v & 0xFFF].sticky ? 8 : 0)));
    this.w.post({type: 'pushed', cells: [[hx, hy, hz], ...s.move.map(([a, b, c]) => [a + dx, b + dy, c + dz])], dir: F});
    this.w.post({type: 'sound', name: 'piston_out', x, y, z});
  }
  retract(x, y, z, v) {
    const F = v >>> 12 & 7, [dx, dy, dz] = FACES[F], hx = x + dx, hy = y + dy, hz = z + dz;
    this.w.set(x, y, z, withMeta(v & 0xFFF, F));
    if ((this.get(hx, hy, hz) & 0xFFF) === ID.piston_head) this.w.set(hx, hy, hz, 0);
    // a sticky piston pulls back what was in front of its head (with what slime holds on to)
    if (BLOCKS[v & 0xFFF].sticky) {
      const fx = hx + dx, fy = hy + dy, fz = hz + dz, f = this.get(fx, fy, fz);
      if (!empty(f) && !fixed(f) && !BREAKS.has(SHAPE[f & 0xFFF])) {
        const s = this.structure(fx, fy, fz, OPPOSITE[F], x, y, z);
        if (s) { this.shift(s, OPPOSITE[F]); this.w.post({type: 'pushed', cells: s.move.map(([a, b, c]) => [a - dx, b - dy, c - dz]), dir: OPPOSITE[F]}); }
      }
    }
    this.w.post({type: 'sound', name: 'piston_in', x, y, z});
  }
}
