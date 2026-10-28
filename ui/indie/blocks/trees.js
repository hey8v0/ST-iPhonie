// Trees the way the game grows them: a trunk (straight, forking acacia, the giant 2×2, the mega jungle's with its
// branches, dark oak's with the logs hanging round its top, fancy oak's with limbs), the leaves round each place the
// trunk leaves for them (blob, spruce, pine, mega pine, acacia, dark oak, fancy, mega jungle, bush), then what grows
// on a finished tree (vines on the trunk and hanging from the leaves, cocoa, podzol round a mega spruce, a mangrove's
// hanging propagules). The numbers are the game's own (trunk heights, radii, chances). put(x, y, z, block, force)
// writes one block: leaves only into air, plants and leaves; force (logs, the dirt under the trunk) also over grass
// and dirt. get(x, y, z) reads what is there (−1: not known, outside the column being made) — the decorations look
// where they may go. A mangrove's roots ask soil(x, y, z): 0 open (air, water, a plant), 1 mud (they grow in, muddy),
// 2 ground they stop at — known everywhere, so a tree comes out the same from every column it reaches into.
import {ID, withMeta} from './blocks.js';

// directions as in shapes.js: 0 south (+z), 1 west (−x), 2 north (−z), 3 east (+x)
const DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/**
 * The trees, by kind: wood, trunk, leaves, decorations. kind is one of oak, fancy_oak, birch, tall_birch, swamp_oak,
 * spruce, pine, mega_spruce, mega_pine, jungle, jungle_plain (from a sapling: no vines), mega_jungle, jungle_bush,
 * acacia, dark_oak.
 */
export const TREE_KINDS = ['oak', 'fancy_oak', 'birch', 'tall_birch', 'swamp_oak', 'spruce', 'pine', 'mega_spruce', 'mega_pine', 'jungle', 'jungle_plain', 'mega_jungle', 'jungle_bush', 'acacia', 'dark_oak',
  'cherry', 'mangrove', 'tall_mangrove'];
/** Kinds standing on four blocks (x..x+1, z..z+1). */
export const BIG_TREES = new Set(['mega_spruce', 'mega_pine', 'mega_jungle', 'dark_oak']);

/**
 * Grows a tree whose trunk starts on the ground block at (x, y, z) (the trunk's first log is y + 1). r(): 0–1.
 * Returns whether it grew (a mangrove does not where its roots find no ground).
 */
export function growTree({x, y, z, kind, r, soil = null}, put, get = () => -1) {
  const int = n => Math.floor(r() * n), uniform = (a, b) => a + int(b - a + 1);
  const wood = {fancy_oak: 'oak', swamp_oak: 'oak', tall_birch: 'birch', pine: 'spruce', mega_spruce: 'spruce', mega_pine: 'spruce', jungle_plain: 'jungle', mega_jungle: 'jungle', jungle_bush: 'jungle', tall_mangrove: 'mangrove'}[kind] || kind;
  const log = ID[`${wood}_log`], leaf = ID[`${kind === 'jungle_bush' ? 'oak' : wood}_leaves`];
  const own = new Map(), logs = [], leaves = [];
  const key = (a, b, c) => `${a},${b},${c}`;
  const placeLog = (a, b, c, axis = 0) => { put(a, b, c, withMeta(log, axis), true); own.set(key(a, b, c), 1); logs.push([a, b, c]); };
  const placeLeaf = (a, b, c) => { const k = key(a, b, c); if (own.has(k)) return; put(a, b, c, leaf); own.set(k, 2); leaves.push([a, b, c]); };
  const dirt = (a, b, c) => put(a, b, c, ID.dirt, true);
  // air for the decorations: not part of this tree, and nothing there that we know of
  const isAir = (a, b, c) => !own.has(key(a, b, c)) && get(a, b, c) <= 0;
  /** A square of leaves round (cx, cy + dy, cz); large: round a 2×2 trunk (one wider on the + sides). */
  const row = (cx, cy, cz, range, dy, large, skip) => {
    const e = large ? 1 : 0;
    for (let dx = -range; dx <= range + e; dx++) for (let dz = -range; dz <= range + e; dz++) {
      const ax = large ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx), az = large ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
      if (!skip(ax, dy, az, range, large, dx, dz)) placeLeaf(cx + dx, cy + dy, cz + dz);
    }
  };

  // ---------- trunks: each gives the places for leaves [{x, y, z, ro (radius offset), large}] ----------
  const straight = (base, a, b) => {
    const h = base + int(a + 1) + int(b + 1);
    dirt(x, y, z);
    for (let i = 1; i <= h; i++) placeLog(x, y + i, z);
    return {h, att: [{x, y: y + h + 1, z, ro: 0, large: false}]};
  };
  const giant = (base, a, b) => {
    const h = base + int(a + 1) + int(b + 1);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dirt(x + dx, y, z + dz);
    for (let i = 1; i <= h; i++) {
      placeLog(x, y + i, z);
      if (i < h) { placeLog(x + 1, y + i, z); placeLog(x + 1, y + i, z + 1); placeLog(x, y + i, z + 1); }
    }
    return {h, att: [{x, y: y + h + 1, z, ro: 0, large: true}]};
  };

  // ---------- leaves ----------
  /** Oak, birch, jungle, swamp: 4 rows, R−1 at the top two (the top's corners always cut), R below. */
  const blob = (a, R, height = 3, offset = 0) => {
    for (let dy = offset; dy >= offset - height; dy--) {
      const rad = Math.max(R + a.ro - 1 - Math.trunc(dy / 2), 0);
      row(a.x, a.y, a.z, rad, dy, a.large, (ax, yy, az, range) => ax === range && az === range && (int(2) === 0 || yy === 0));
    }
  };
  const corner = (ax, yy, az, range) => ax === range && az === range && range > 0;
  /** Spruce: rows widening 0, 1, (2, 3) and back to 1, down the foliage. */
  const spruce = (a, fh, R, offset) => {
    let i = int(2), j = 1, k = 0;
    for (let dy = offset; dy >= -fh; dy--) {
      row(a.x, a.y, a.z, i, dy, a.large, corner);
      if (i >= j) { i = k; k = 1; j = Math.min(j + 1, R + a.ro); } else i++;
    }
  };
  /** Pine: a small cone at the top of a long bare trunk. */
  const pine = (a, fh, R, offset) => {
    let i = 0;
    for (let dy = offset; dy >= offset - fh; dy--) {
      row(a.x, a.y, a.z, i, dy, a.large, corner);
      if (i >= 1 && dy === offset - fh + 1) i--; else if (i < R + a.ro) i++;
    }
  };
  /** Mega spruce and mega pine: rows from the bottom of the crown up, round, ruffled every other row. */
  const megaPine = (a, fh, offset = 0) => {
    let prev = 0;
    for (let yy = a.y - fh + offset; yy <= a.y + offset; yy++) {
      const k = a.y - yy, l = a.ro + Math.floor(k / fh * 3.5), rad = k > 0 && l === prev && (yy & 1) === 0 ? l + 1 : l;
      row(a.x, yy, a.z, rad, 0, a.large, (ax, d, az, range) => ax + az >= 7 || ax * ax + az * az > range * range);
      prev = l;
    }
  };
  const megaJungle = (a, R = 2) => {
    const n = a.large ? 2 : 1 + int(2);
    for (let dy = 0; dy >= -n; dy--) row(a.x, a.y, a.z, R + a.ro + 1 - dy, dy, a.large, (ax, d, az, range) => ax + az >= 7 || ax * ax + az * az > range * range);
  };
  const bush = (a, R = 2, offset = 1, height = 2) => {
    for (let dy = offset; dy >= offset - height; dy--) row(a.x, a.y, a.z, R + a.ro - 1 - dy, dy, a.large, (ax, d, az, range) => ax === range && az === range && int(2) === 0);
  };
  const acaciaLeaves = (a, R = 2) => {
    const skip = (ax, dy, az, range) => dy === 0 ? (ax > 1 || az > 1) && ax !== 0 && az !== 0 : ax === range && az === range && range > 0;
    row(a.x, a.y, a.z, R + a.ro, -1, a.large, skip);
    row(a.x, a.y, a.z, R - 1, 0, a.large, skip);
    row(a.x, a.y, a.z, R + a.ro - 1, 0, a.large, skip);
  };
  const darkOakLeaves = a => {
    const skip = (ax, dy, az, range, large, dx, dz) => {
      if (dy === 0 && large && (dx === -range || dx >= range) && (dz === -range || dz >= range)) return true;
      if (dy === -1 && !large) return ax === range && az === range;
      if (dy === 1) return ax + az > range * 2 - 2;
      return false;
    };
    if (a.large) {
      row(a.x, a.y, a.z, 2, -1, true, skip); row(a.x, a.y, a.z, 3, 0, true, skip); row(a.x, a.y, a.z, 2, 1, true, skip);
      if (int(2)) row(a.x, a.y, a.z, 0, 2, true, skip);
    } else { row(a.x, a.y, a.z, 2, -1, false, skip); row(a.x, a.y, a.z, 1, 0, false, skip); }
  };
  /** Fancy oak's balls of leaves: five rows, 2 3 3 3 2 across, round. */
  const fancyLeaves = a => {
    for (let dy = 4; dy >= 0; dy--) {
      const rad = 2 + (dy !== 4 && dy !== 0 ? 1 : 0);
      row(a.x, a.y, a.z, rad, dy, false, (ax, d, az, range) => (ax + 0.5) ** 2 + (az + 0.5) ** 2 > range * range);
    }
  };

  // ---------- the special trunks ----------
  /** Acacia: up, then leaning out one way for the last few logs; sometimes a second, shorter branch the other way. */
  const forking = () => {
    const h = 5 + int(3) + int(3), att = [];
    dirt(x, y, z);
    const d = int(4), bend = h - int(4) - 1;
    let steps = 3 - int(3), cx = x, cz = z, top = 0;
    for (let i = 0; i < h; i++) {
      if (i >= bend && steps > 0) { cx += DIR[d][0]; cz += DIR[d][1]; steps--; }
      placeLog(cx, y + 1 + i, cz); top = y + 2 + i;
    }
    att.push({x: cx, y: top, z: cz, ro: 1, large: false});
    const d2 = int(4);
    if (d2 !== d) {
      let from = bend - int(2) - 1, n = 1 + int(3), bx = x, bz = z, end = null;
      for (let i = from; i < h && n > 0; n--, i++) {
        if (i < 1) continue;
        bx += DIR[d2][0]; bz += DIR[d2][1];
        placeLog(bx, y + 1 + i, bz); end = y + 2 + i;
      }
      if (end !== null) att.push({x: bx, y: end, z: bz, ro: 0, large: false});
    }
    return att;
  };
  /** Dark oak: a 2×2 trunk that may lean near its top, logs hanging round the top with their own leaves. */
  const darkOakTrunk = () => {
    const h = 6 + int(3) + int(2), att = [];
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dirt(x + dx, y, z + dz);
    const d = int(4), bend = h - int(4);
    let steps = 2 - int(3), cx = x, cz = z;
    const top = y + h;
    for (let i = 0; i < h; i++) {
      if (i >= bend && steps > 0) { cx += DIR[d][0]; cz += DIR[d][1]; steps--; }
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) placeLog(cx + dx, y + 1 + i, cz + dz);
    }
    att.push({x: cx, y: top, z: cz, ro: 0, large: true});
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) {
      if (dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1 || int(3) > 0) continue;
      const n = int(3) + 2;
      for (let k = 0; k < n; k++) placeLog(x + dx, top - k - 1, z + dz);
      att.push({x: cx + dx, y: top, z: cz + dz, ro: 0, large: false});
    }
    return att;
  };
  /** Mega jungle: the giant trunk, and branches going out and a little up, each with a small crown. */
  const megaJungleTrunk = () => {
    const {h, att} = giant(10, 2, 19);
    for (let i = h - 2 - int(4); i > Math.floor(h / 2); i -= 2 + int(4)) {
      const f = r() * Math.PI * 2;
      let bx = 0, bz = 0;
      for (let l = 0; l < 5; l++) {
        bx = Math.trunc(1.5 + Math.cos(f) * l); bz = Math.trunc(1.5 + Math.sin(f) * l);
        placeLog(x + bx, y + 1 + i - 3 + Math.floor(l / 2), z + bz);
      }
      att.push({x: x + bx, y: y + 1 + i, z: z + bz, ro: -2, large: false});
    }
    return att;
  };
  /** Fancy oak: a trunk to 0.618 of the height, limbs out to balls of leaves (the game's own shape). */
  const fancyTrunk = () => {
    const h = 3 + int(12), j = h + 2, k = Math.floor(j * 0.618), o = [x, y + 1, z];
    dirt(x, y, z);
    const limb = (s, e) => {
      const d = [e[0] - s[0], e[1] - s[1], e[2] - s[2]], n = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
      if (!n) { placeLog(s[0], s[1], s[2], 0); return; }
      for (let t = 0; t <= n; t++) {
        const p = [s[0] + Math.floor(0.5 + t * d[0] / n), s[1] + Math.floor(0.5 + t * d[1] / n), s[2] + Math.floor(0.5 + t * d[2] / n)];
        // a limb's logs lie the way it goes (from its start to this log)
        const ax = Math.abs(p[0] - s[0]), az = Math.abs(p[2] - s[2]), mm = Math.max(ax, az);
        placeLog(p[0], p[1], p[2], mm > 0 ? (ax === mm ? 1 : 2) : 0);
      }
    };
    const shape = yy => {
      if (yy < j * 0.3) return -1;
      const f = j / 2, f1 = f - yy;
      let f2 = Math.sqrt(f * f - f1 * f1);
      if (f1 === 0) f2 = f; else if (Math.abs(f1) >= f) return 0;
      return f2 * 0.5;
    };
    const capY = o[1] + k, coords = [{at: [x, o[1] + j - 5, z], base: capY}];
    for (let yy = j - 5; yy >= 0; yy--) {
      const f = shape(yy);
      if (f < 0) continue;
      const d2 = f * (r() + 0.328), d3 = r() * 2 * Math.PI;
      const bp = [x + Math.floor(d2 * Math.sin(d3) + 0.5), o[1] + yy - 1, z + Math.floor(d2 * Math.cos(d3) + 0.5)];
      const dx = x - bp[0], dz = z - bp[2], d6 = bp[1] - Math.sqrt(dx * dx + dz * dz) * 0.381;
      coords.push({at: bp, base: d6 > capY ? capY : Math.trunc(d6)});
    }
    limb(o, [x, o[1] + k, z]);
    const keep = base => base - o[1] >= j * 0.2;
    for (const c of coords) if ((c.base !== c.at[1] || c.at[0] !== x || c.at[2] !== z) && keep(c.base)) limb([x, c.base, z], c.at);
    return coords.filter(c => keep(c.base)).map(c => ({x: c.at[0], y: c.at[1], z: c.at[2], ro: 0, large: false}));
  };

  /**
   * Cherry: a trunk of 7–8 and one to three branches (with three the trunk goes on to a crown of its own); a branch goes
   * out one or two logs lying its way, then on out and up to its end, a step at a time, where its crown sits.
   */
  const cherryTrunk = () => {
    const h = 7 + int(2), att = [];
    dirt(x, y, z);
    const start = Math.max(0, h - 1 + uniform(-4, -3));
    let start2 = Math.max(0, h - 1 + uniform(-4, -3) - 1);
    if (start2 >= start) start2++;
    const n = 1 + int(3), top = n === 3 ? h : n === 2 ? Math.max(start, start2) + 1 : start + 1;
    for (let i = 0; i < top; i++) placeLog(x, y + 1 + i, z);
    if (n === 3) att.push({x, y: y + 1 + top, z, ro: 0, large: false});
    const d = int(4);
    att.push(cherryBranch(h, d, start, start < top - 1));
    if (n >= 2) att.push(cherryBranch(h, (d + 2) % 4, start2, start2 < top - 1));
    return att;
  };
  const cherryBranch = (h, d, from, beside) => {
    let cx = x, cy = y + 1 + from, cz = z;
    const endY = y + h + uniform(-1, 0), long = beside || endY - (y + 1) < from, len = uniform(2, 4) + (long ? 1 : 0);
    const ex = x + DIR[d][0] * len, ez = z + DIR[d][1] * len, axis = d % 2 === 0 ? 2 : 1;
    for (let k = 0; k < (long ? 2 : 1); k++) { cx += DIR[d][0]; cz += DIR[d][1]; placeLog(cx, cy, cz, axis); }
    const up = endY > cy ? 1 : -1;
    for (let guard = 0; guard < 32; guard++) {
      const dist = Math.abs(ex - cx) + Math.abs(endY - cy) + Math.abs(ez - cz);
      if (!dist) break;
      const vert = r() < Math.abs(endY - cy) / dist;
      if (vert) cy += up; else { cx += DIR[d][0]; cz += DIR[d][1]; }
      placeLog(cx, cy, cz, vert ? 0 : axis);
    }
    return {x: ex, y: endY + 1, z: ez, ro: 0, large: false};
  };
  /** The cherry's crown: five rows (1, 2, 3, 3, 2 out), holes at the rim, leaves hanging one or two under the low rows. */
  const cherryLeaves = a => {
    const skip = (ax, dy, az, range) => {
      if (dy === -1 && (ax === range || az === range) && r() < 0.25) return true;
      const corner = ax === range && az === range;
      return range > 2 ? corner || (ax + az > range * 2 - 2 && r() < 0.25) : corner && r() < 0.25;
    };
    const hang = (range, dy) => {
      for (let dx = -range; dx <= range; dx++) for (let dz = -range; dz <= range; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== range || own.get(key(a.x + dx, a.y + dy, a.z + dz)) !== 2) continue;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) >= 7 || r() >= 1 / 6) continue;
        placeLeaf(a.x + dx, a.y + dy - 1, a.z + dz);
        if (Math.abs(dx) + Math.abs(dy - 1) + Math.abs(dz) < 7 && r() < 1 / 3) placeLeaf(a.x + dx, a.y + dy - 2, a.z + dz);
      }
    };
    row(a.x, a.y, a.z, 1, 2, false, skip); row(a.x, a.y, a.z, 2, 1, false, skip); row(a.x, a.y, a.z, 3, 0, false, skip);
    row(a.x, a.y, a.z, 3, -1, false, skip); hang(3, -1);
    row(a.x, a.y, a.z, 2, -2, false, skip); hang(2, -2);
  };
  /**
   * Mangrove: the trunk stands one to three over the ground on its roots — one right under it, and from each side one
   * going out and down till it meets the ground (into mud it grows on, muddy) —; it grows 2–7 (the tall kind 4–14),
   * now and then a branch stepping out and up from it, and the leaves come in clumps round its top and the branches.
   */
  const soilAt = soil || ((a, b, c) => get(a, b, c) <= 0 ? 0 : 2);
  const rootSteps = (px, py, pz, d, base) => {
    const down = [px, py - 1, pz], ox = px + DIR[d][0], oz = pz + DIR[d][1], dist = Math.abs(px - x) + Math.abs(py - base) + Math.abs(pz - z);
    if (dist > 5 && dist <= 8) return r() < 0.2 ? [down, [ox, py - 1, oz]] : [down];
    if (dist > 8) return [down];
    if (r() < 0.2) return [down];
    return r() < 0.5 ? [[ox, py, oz]] : [down];
  };
  const rootsFrom = (px, py, pz, d, base, roots, len) => {
    if (len === 15 || roots.length > 15) return false;
    for (const [qx, qy, qz] of rootSteps(px, py, pz, d, base)) {
      if (soilAt(qx, qy, qz) === 2) continue;
      roots.push([qx, qy, qz]);
      if (!rootsFrom(qx, qy, qz, d, base, roots, len + 1)) return false;
    }
    return true;
  };
  const mangroveRoots = base => {
    for (let yy = y + 1; yy < base; yy++) if (soilAt(x, yy, z) === 2) return false;
    const list = [[x, base - 1, z]];
    for (let d = 0; d < 4; d++) {
      const sx = x + DIR[d][0], sz = z + DIR[d][1], roots = [];
      if (!rootsFrom(sx, base, sz, d, base, roots, 0)) return false;
      list.push(...roots, [sx, base, sz]);
    }
    for (const [a, b, c] of list) { const s = soilAt(a, b, c); if (s !== 2) put(a, b, c, s === 1 ? ID.muddy_mangrove_roots : ID.mangrove_roots, true); }
    return true;
  };
  const mangroveTrunk = tall => {
    const base = y + 1 + uniform(1, 3);
    if (!mangroveRoots(base)) return null;
    const h = tall ? 4 + int(2) + int(10) : 2 + int(2) + int(5), att = [];
    for (let i = 0; i < h; i++) {
      const yy = base + i;
      placeLog(x, yy, z);
      if (i < h - 1 && r() < 0.5) {
        const d = int(4), off = Math.max(0, int(2) - int(2) - 1);
        let bx = x, bz = z, top = yy + off;
        for (let l = off, steps = uniform(1, 4); l < h && steps > 0; l++, steps--) {
          if (l < 1) continue;
          bx += DIR[d][0]; bz += DIR[d][1]; top = yy + l + 1;
          placeLog(bx, yy + l, bz); att.push({x: bx, y: yy + l, z: bz});
        }
        if (top - yy > 1) att.push({x: bx, y: top, z: bz}, {x: bx, y: top - 2, z: bz});
      }
      if (i === h - 1) att.push({x, y: yy + 1, z});
    }
    return att;
  };
  /** Leaves strewn round a place: 70 tries within two across and one up or down (the mangrove's). */
  const spread = a => { for (let k = 0; k < 70; k++) placeLeaf(a.x + int(3) - int(3), a.y + int(2) - int(2), a.z + int(3) - int(3)); };

  // ---------- the kinds ----------
  let att;
  switch (kind) {
    case 'oak': att = straight(4, 2, 0).att; att.forEach(a => blob(a, 2)); break;
    case 'birch': att = straight(5, 2, 0).att; att.forEach(a => blob(a, 2)); break;
    case 'tall_birch': att = straight(5, 2, 6).att; att.forEach(a => blob(a, 2)); break;
    case 'swamp_oak': att = straight(5, 3, 0).att; att.forEach(a => blob(a, 3)); break;
    case 'jungle': case 'jungle_plain': att = straight(4, 8, 0).att; att.forEach(a => blob(a, 2)); break;
    case 'jungle_bush': att = straight(1, 0, 0).att; att.forEach(a => bush(a)); break;
    case 'spruce': {
      const t = straight(5, 2, 1), fh = Math.max(4, t.h - uniform(1, 2)), R = uniform(2, 3), off = uniform(0, 2);
      t.att.forEach(a => spruce(a, fh, R, off)); att = t.att; break;
    }
    case 'pine': {
      const t = straight(6, 4, 0), fh = uniform(3, 4), R = 1 + int(Math.max(t.h - fh + 1, 1));
      t.att.forEach(a => pine(a, fh, R, 1)); att = t.att; break;
    }
    case 'mega_spruce': case 'mega_pine': {
      const t = giant(13, 2, 14), fh = kind === 'mega_spruce' ? uniform(13, 17) : uniform(3, 7);
      t.att.forEach(a => megaPine(a, fh)); att = t.att; break;
    }
    case 'mega_jungle': att = megaJungleTrunk(); att.forEach(a => megaJungle(a)); break;
    case 'acacia': att = forking(); att.forEach(a => acaciaLeaves(a)); break;
    case 'dark_oak': att = darkOakTrunk(); att.forEach(a => darkOakLeaves(a)); break;
    case 'fancy_oak': att = fancyTrunk(); att.forEach(a => fancyLeaves(a)); break;
    case 'cherry': att = cherryTrunk(); att.forEach(a => cherryLeaves(a)); break;
    case 'mangrove': case 'tall_mangrove': att = mangroveTrunk(kind === 'tall_mangrove'); if (!att) return false; att.forEach(a => spread(a)); break;
    default: return false;
  }

  // ---------- what grows on it ----------
  const byY = list => list.slice().sort((a, b) => a[1] - b[1]);
  const vine = (a, b, c, face) => {
    const old = get(a, b, c), cur = old > 0 && (old & 0xFFF) === ID.vine ? old >>> 12 : 0;
    put(a, b, c, withMeta(ID.vine, cur | 1 << face));
  };
  // a vine on the side facing the leaf or log at (a, b, c) + DIR[d]: d is the side of the vine's block it clings to
  const hanging = (a, b, c, d) => {
    vine(a, b, c, d);
    for (let n = 4, yy = b - 1; n > 0 && isAir(a, yy, c); n--, yy--) vine(a, yy, c, d);
  };
  const leaveVines = p => {
    for (const [a, b, c] of byY(leaves)) for (let d = 0; d < 4; d++) {
      // the vine goes beside the leaf, clinging to it
      if (r() < p) { const vx = a - DIR[d][0], vz = c - DIR[d][1]; if (isAir(vx, b, vz)) hanging(vx, b, vz, d); }
    }
  };
  const trunkVines = () => {
    for (const [a, b, c] of byY(logs)) for (let d = 0; d < 4; d++) {
      if (int(3) > 0) { const vx = a - DIR[d][0], vz = c - DIR[d][1]; if (isAir(vx, b, vz)) vine(vx, b, vz, d); }
    }
  };
  const cocoa = p => {
    if (r() >= p || !logs.length) return;
    const sorted = byY(logs), low = sorted[0][1];
    for (const [a, b, c] of sorted) {
      if (b - low > 2) continue;
      for (let d = 0; d < 4; d++) {
        if (r() > 0.25) continue;
        const cx = a - DIR[d][0], cz = c - DIR[d][1];
        const age = int(3);
        if (isAir(cx, b, cz)) put(cx, b, cz, withMeta(ID.cocoa, d | age << 2));
      }
    }
  };
  const podzol = () => {
    const lowY = Math.min(...logs.map(p => p[1]));
    const circle = (cx, cz) => {
      for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) {
        if (Math.abs(i) === 2 && Math.abs(k) === 2) continue;
        for (let dy = 2; dy >= -3; dy--) {
          const yy = lowY + dy, v = get(cx + i, yy, cz + k);
          if (v === ID.grass_block || v === ID.dirt || v === ID.podzol || v === ID.coarse_dirt) { put(cx + i, yy, cz + k, ID.podzol, true); break; }
          if (v !== 0 && dy < 0) break;
        }
      }
    };
    for (const [a, , c] of logs.filter(p => p[1] === lowY)) {
      circle(a - 1, c - 1); circle(a + 2, c - 1); circle(a - 1, c + 2); circle(a + 2, c + 2);
      for (let n = 0; n < 5; n++) { const q = int(64), l = q % 8, m = q >> 3; if (l === 0 || l === 7 || m === 0 || m === 7) circle(a - 3 + l, c - 3 + m); }
    }
  };
  if (kind === 'swamp_oak') leaveVines(0.25);
  if (kind === 'jungle') { cocoa(0.2); trunkVines(); leaveVines(0.25); }
  if (kind === 'mega_jungle') { trunkVines(); leaveVines(0.25); }
  // a mangrove's propagules: under one leaf in seven with two free below, not right beside another (the game's)
  const propagules = () => {
    const list = leaves.slice(), taken = new Set();
    for (let i = list.length - 1; i > 0; i--) { const j = int(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
    for (const [a, b, c] of list) {
      if (r() >= 0.14 || taken.has(key(a, b - 1, c)) || !isAir(a, b - 1, c) || !isAir(a, b - 2, c)) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) taken.add(key(a + dx, b - 1, c + dz));
      put(a, b - 1, c, withMeta(ID.mangrove_propagule, 8));
    }
  };
  if (kind === 'mega_spruce' || kind === 'mega_pine') podzol();
  if (kind === 'mangrove' || kind === 'tall_mangrove') { leaveVines(0.125); propagules(); }
  return true;
}
