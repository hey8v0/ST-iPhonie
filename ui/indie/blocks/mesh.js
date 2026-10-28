// A 16×16×16 section of the world made into triangles for the GPU. Only faces that can be seen are made (a face next
// to an opaque block is left out); cubes get smooth light and corner shade (ambient occlusion) the way the game does;
// grass sides get their tinted overlay; plants, torches, slabs, snow layers, cactus, crops, ladders, lanterns and liquids
// have their own shapes. Input is the section with a one-block border from its neighbours (18×18×18 blocks and light).
//
// A vertex is 16 bytes: x, y, z (uint16, 1/16 block, from one block before the section's corner), texture layer (uint16), u, v (uint8, 0–16),
// sky light, block light (uint8, level × 17), shade (uint8: bits 0–1 corner shade, 2–4 face, 5–7 wave kind), tint r, g, b.
import {BLOCKS, ID, idOf, metaOf} from './blocks.js';
import {pieces, wireLinks, WIRE_SIDES, LEVER_BASE, railSlope, plantOffset} from './shapes.js';

// shapes drawn from their pieces (shapes.js)
const PIECED = new Set(['stairs', 'fence', 'gate', 'pane', 'door', 'trapdoor', 'bed', 'chest', 'enchanting', 'anvil', 'brewing', 'portal', 'composter', 'lectern', 'bell', 'stonewall', 'carpet', 'button', 'plate', 'detector', 'hopper']);
// redstone dust's colour at each power (the game's: dark red at nothing, bright red at full)
const DUST = Array.from({length: 16}, (_, p) => { const f = p / 15, c = v => Math.round(Math.max(0, Math.min(1, v)) * 255); return c(f * 0.6 + (f > 0 ? 0.4 : 0.3)) << 16 | c(f * f * 0.7 - 0.5) << 8 | c(f * f * 0.6 - 0.7); });
const OPP = [1, 0, 3, 2, 5, 4], AXIS = [0, 0, 1, 1, 2, 2];

export const STRIDE = 16;
const P = 18, P2 = P * P;
const at = (x, y, z) => (y + 1) * P2 + (z + 1) * P + (x + 1);

// per block id: flags for speed
const N = BLOCKS.length;
const OPAQUE = new Uint8Array(N), SHAPE = new Array(N), PASS = new Array(N), TINT = new Array(N), TINT_FIXED = new Int32Array(N).fill(-1);
for (const b of BLOCKS) {
  OPAQUE[b.id] = b.opaque ? 1 : 0; SHAPE[b.id] = b.shape; PASS[b.id] = b.pass;
  if (b.tint?.startsWith('#')) TINT_FIXED[b.id] = parseInt(b.tint.slice(1), 16); else TINT[b.id] = b.tint;
}
const WATER = ID.water, LAVA = ID.lava, LEAVES = new Uint8Array(N);
for (const b of BLOCKS) if (b.name.endsWith('_leaves')) LEAVES[b.id] = 1;
// ores: flag 5, for the shaded look to let their coloured bits glow
const ORE = new Uint8Array(N);
for (const b of BLOCKS) if (b.name.endsWith('_ore')) ORE[b.id] = 1;
const isOpaque = v => OPAQUE[v & 0xFFF] === 1 || (SHAPE[v & 0xFFF] === 'slab' && (v >>> 12) === 2);

/**
 * Which sides of a section see each other through it (for the renderer's cave culling, as the game does it): the
 * open cells (not opaque) are filled outward from each, and every side one such space touches is joined to the
 * others it touches. sec: its 16³ blocks (y << 8 | z << 4 | x), or null (all air). Six rows, one per side (−x, +x,
 * −y, +y, −z, +z), each a mask of the sides it reaches.
 */
export const ALL_OPEN = [63, 63, 63, 63, 63, 63];
export function sectionVis(sec) {
  if (!sec) return ALL_OPEN;
  const rows = [0, 0, 0, 0, 0, 0], seen = new Uint8Array(4096), stack = new Int32Array(4096);
  for (let start = 0; start < 4096; start++) {
    if (seen[start] || isOpaque(sec[start])) continue;
    let top = 0, sides = 0;
    stack[top++] = start; seen[start] = 1;
    while (top) {
      const i = stack[--top], x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      if (x === 0) sides |= 1; if (x === 15) sides |= 2; if (y === 0) sides |= 4; if (y === 15) sides |= 8; if (z === 0) sides |= 16; if (z === 15) sides |= 32;
      const go = j => { if (!seen[j] && !isOpaque(sec[j])) { seen[j] = 1; stack[top++] = j; } };
      if (x > 0) go(i - 1); if (x < 15) go(i + 1); if (y > 0) go(i - 256); if (y < 15) go(i + 256); if (z > 0) go(i - 16); if (z < 15) go(i + 16);
    }
    for (let a = 0; a < 6; a++) if (sides & 1 << a) rows[a] |= sides;
    if (rows.every(r => r === 63)) break;
  }
  return rows;
}

// faces: normal, u, v, base corner (p0); p1 = p0 + u, p2 = p0 + u + v, p3 = p0 + v
const FACE = [
  {n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1]},
  {n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0]},
  {n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1]},
  {n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0]},
  {n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1]},
  {n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0]},
];
const CORNER_UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
// the game's texture coordinates for a face of a box, from a point on it (1/16 units)
const AUTO_UV = [p => [16 - p[2], 16 - p[1]], p => [p[2], 16 - p[1]], p => [p[0], p[2]], p => [p[0], 16 - p[2]], p => [p[0], 16 - p[1]], p => [16 - p[0], 16 - p[1]]];
const CORNER_SIGN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const rotTo = (f, d) => { const n = FACE[d].n, F = FACE[f], dot = a => a[0] * n[0] + a[1] * n[1] + a[2] * n[2]; return dot(F.v) > 0 ? 0 : dot(F.u) > 0 ? 1 : dot(F.v) < 0 ? 2 : dot(F.u) < 0 ? 3 : 0; };

/** A growable byte buffer of vertices. */
class Out {
  constructor(size = 1 << 16) { this.buf = new ArrayBuffer(size); this.u8 = new Uint8Array(this.buf); this.u16 = new Uint16Array(this.buf); this.n = 0; }
  grow() { const b = new ArrayBuffer(this.buf.byteLength * 2); new Uint8Array(b).set(this.u8); this.buf = b; this.u8 = new Uint8Array(b); this.u16 = new Uint16Array(b); }
  vert(x, y, z, layer, u, v, sky, blk, shade, tint) {
    if ((this.n + 1) * STRIDE > this.buf.byteLength) this.grow();
    const o = this.n * STRIDE, h = o >> 1;
    // one block of margin: plants and torches may reach a little outside the section
    this.u16[h] = Math.round((x + 1) * 16); this.u16[h + 1] = Math.round((y + 1) * 16); this.u16[h + 2] = Math.round((z + 1) * 16); this.u16[h + 3] = layer;
    const b = this.u8;
    b[o + 8] = u; b[o + 9] = v; b[o + 10] = sky; b[o + 11] = blk; b[o + 12] = shade; b[o + 13] = tint >> 16 & 255; b[o + 14] = tint >> 8 & 255; b[o + 15] = tint & 255;
    this.n++;
  }
  take() { return this.u8.slice(0, this.n * STRIDE); }
}

/**
 * pad: Uint16Array(18³) blocks, light: Uint8Array(18³) (sky << 4 | block), tint: {grass, foliage, water} each
 * Int32Array(18 × 18) of 0xRRGGBB for (x, z) with the border, tex(name) → layer. Returns {solid, trans} byte arrays.
 */
const SOLID = new Out(1 << 18), TRANS = new Out(1 << 16);
export function meshSection(pad, light, tint, tex, {ox = 0, oz = 0, wave = true} = {}) {
  const solid = SOLID, trans = TRANS;
  solid.n = trans.n = 0; solid.flip = trans.flip = null;
  const L = i => light[i];
  const WHITE = 0xFFFFFF;
  const tintOf = (id, x, z) => {
    if (TINT_FIXED[id] >= 0) return TINT_FIXED[id];
    const k = TINT[id];
    return k === 'grass' ? tint.grass[(z + 1) * P + x + 1] : k === 'foliage' ? tint.foliage[(z + 1) * P + x + 1] : k === 'water' ? tint.water[(z + 1) * P + x + 1] : WHITE;
  };

  /** A full face of a cube with smooth light and corner shade. */
  function cubeFace(out, x, y, z, f, layer, tintC, rot = 0, flags = 0) {
    const F = FACE[f], [nx, ny, nz] = F.n, bx = x + nx, by = y + ny, bz = z + nz;
    const lf = L(at(bx, by, bz));
    const shades = [0, 0, 0, 0], skies = [0, 0, 0, 0], blks = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const [su, sv] = CORNER_SIGN[c];
      const ax = bx + F.u[0] * su, ay = by + F.u[1] * su, az = bz + F.u[2] * su;
      const cx = bx + F.v[0] * sv, cy = by + F.v[1] * sv, cz = bz + F.v[2] * sv;
      const dx = ax + F.v[0] * sv, dy = ay + F.v[1] * sv, dz = az + F.v[2] * sv;
      const ia = at(ax, ay, az), ic = at(cx, cy, cz), id = at(dx, dy, dz);
      const oa = isOpaque(pad[ia]), oc = isOpaque(pad[ic]), od = (oa && oc) || isOpaque(pad[id]);
      shades[c] = oa && oc ? 3 : (oa ? 1 : 0) + (oc ? 1 : 0) + (od ? 1 : 0);
      let s = lf >> 4, b = lf & 15, n = 1;
      if (!oa) { s += L(ia) >> 4; b += L(ia) & 15; n++; }
      if (!oc) { s += L(ic) >> 4; b += L(ic) & 15; n++; }
      if (!od) { s += L(id) >> 4; b += L(id) & 15; n++; }
      skies[c] = Math.round(s / n * 17); blks[c] = Math.round(b / n * 17);
    }
    const base = out.n;
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? 1 : 0, cv = c >= 2 ? 1 : 0;
      const px = x + F.o[0] + F.u[0] * cu + F.v[0] * cv, py = y + F.o[1] + F.u[1] * cu + F.v[1] * cv, pz = z + F.o[2] + F.u[2] * cu + F.v[2] * cv;
      const [u, v] = CORNER_UV[(c + rot) & 3];
      out.vert(px, py, pz, layer, u, v, skies[c], blks[c], shades[c] | f << 2 | flags << 5, tintC);
    }
    // flip the diagonal when the other one gives smoother shade
    if (shades[0] + shades[2] > shades[1] + shades[3]) out.flip = (out.flip || []), out.flip.push(base);
  }
  /** A box (in 1/16 units) with its faces; light from the block or the neighbour it faces. */
  function box(out, x, y, z, x0, y0, z0, x1, y1, z1, texOf, tintC, {faces = 63, uvs = null, flags = 0, cull = null} = {}) {
    const own = L(at(x, y, z));
    for (let f = 0; f < 6; f++) {
      if (!(faces & 1 << f)) continue;
      const F = FACE[f];
      if (cull && cull[f] && isOpaque(pad[at(x + F.n[0], y + F.n[1], z + F.n[2])])) continue;
      const layer = texOf(f);
      if (layer < 0) continue;
      const nb = L(at(x + F.n[0], y + F.n[1], z + F.n[2])), lt = Math.max(own >> 4, nb >> 4), lb = Math.max(own & 15, nb & 15);
      const lo = [x0, y0, z0], hi = [x1, y1, z1];
      // corners of this face in 1/16 units
      const corners = [];
      for (let c = 0; c < 4; c++) {
        const cu = c === 1 || c === 2 ? 1 : 0, cv = c >= 2 ? 1 : 0, p = [0, 0, 0];
        for (let a = 0; a < 3; a++) {
          if (F.n[a] !== 0) p[a] = F.n[a] > 0 ? hi[a] : lo[a];
          else if (F.u[a] !== 0) p[a] = (F.u[a] > 0) === (cu === 1) ? hi[a] : lo[a];
          else p[a] = (F.v[a] > 0) === (cv === 1) ? hi[a] : lo[a];
        }
        corners.push(p);
      }
      // texture coordinates: given ([u0, v0, u1, v1], top left first, as seen from outside), or the game's own rule
      let uv;
      if (uvs && uvs[f]) { const [u0, v0, u1, v1] = uvs[f]; uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]; }
      else uv = corners.map(p => AUTO_UV[f](p));
      for (let c = 0; c < 4; c++) out.vert(x + corners[c][0] / 16, y + corners[c][1] / 16, z + corners[c][2] / 16, layer, uv[c][0], uv[c][1], lt * 17, lb * 17, f << 2 | flags << 5, tintC);
    }
  }
  /** A flat quad through four points (in blocks), both sides. */
  function quad(out, pts, layer, uv, lt, lb, tintC, flags = 0, f = 2, both = true) {
    for (let c = 0; c < 4; c++) out.vert(pts[c][0], pts[c][1], pts[c][2], layer, uv[c][0], uv[c][1], lt * 17, lb * 17, f << 2 | flags << 5, tintC);
    if (both) for (let c = 3; c >= 0; c--) out.vert(pts[c][0], pts[c][1], pts[c][2], layer, uv[c][0], uv[c][1], lt * 17, lb * 17, f << 2 | flags << 5, tintC);
  }
  const UVQ = [[0, 16], [16, 16], [16, 0], [0, 0]];
  // a block facing one of six ways (FACES in state & 7; 8 on): its front, its back, and the sides — an observer's top
  // (the arrow to its face) on the two sides across its line of sight, a dispenser's or dropper's furnace stone
  const faceTex6 = (b, f, meta) => {
    const F = meta & 7, on = meta & 8, t = b.tex, vert = F === 2 || F === 3;
    if (f === F) return [tex(vert && t.frontV ? t.frontV : t.front), 0];
    if (f === OPP[F]) return [tex(t.back ? (on && t.backOn ? t.backOn : t.back) : vert ? t.top : t.side), 0];
    if (t.back) return [tex((vert ? f === 4 || f === 5 : f === 2 || f === 3) ? t.top : t.side), rotTo(f, F)];
    return [tex(vert || f === 2 || f === 3 ? t.top : t.side), 0];
  };
  const faceTex = (b, f, meta) => {
    const t = b.tex;
    if (!t) return -1;
    if (t.all) return tex(t.all);
    if (b.axis) {
      const axis = meta & 3; // 0 y, 1 x, 2 z
      const end = axis === 0 ? f === 2 || f === 3 : axis === 1 ? f === 0 || f === 1 : f === 4 || f === 5;
      return tex(end ? t.top : t.side);
    }
    if (f === 2) return tex(t.top);
    if (f === 3) return tex(t.bottom);
    if (b.facing && t.front && f === FRONT[meta & 3]) return tex(t.frontOn && meta & 4 ? t.frontOn : t.front);
    return tex(t.side);
  };

  /** A rectangle lying flat at height h (blocks) over the cell, [x0, z0]–[x1, z1] in blocks, its picture where it lies. */
  function flatRect(out, x, h, z, x0, z0, x1, z1, layer, lt, lb, tintC, rot = 0) {
    const pts = [[x + x0, h, z + z1], [x + x1, h, z + z1], [x + x1, h, z + z0], [x + x0, h, z + z0]];
    const uv = [[x0 * 16, z1 * 16], [x1 * 16, z1 * 16], [x1 * 16, z0 * 16], [x0 * 16, z0 * 16]];
    for (let c = 0; c < 4; c++) { const [u, w] = rot ? CORNER_UV[(c + rot) & 3] : uv[c]; out.vert(pts[c][0], pts[c][1], pts[c][2], layer, u, w, lt * 17, lb * 17, 2 << 2, tintC); }
  }
  /** A whole square on face f of the cell, moved off blocks out along its normal (negative: inward), its picture turned rot. */
  function square(out, f, x, y, z, off, layer, rot, lt, lb, tintC) {
    const F = FACE[f];
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? 1 : 0, cv = c >= 2 ? 1 : 0, [u, w] = CORNER_UV[(c + rot) & 3];
      out.vert(x + F.o[0] + F.u[0] * cu + F.v[0] * cv + F.n[0] * off, y + F.o[1] + F.u[1] * cu + F.v[1] * cv + F.n[1] * off, z + F.o[2] + F.u[2] * cu + F.v[2] * cv + F.n[2] * off,
        layer, u, w, lt * 17, lb * 17, f << 2, tintC);
    }
  }
  /**
   * A box (1/16) of a block that points one way (a piston, its head): the faces across that way keep the game's picture,
   * the others show it standing up the way the block points (its top toward the front), from the back of the block.
   */
  function axisBox(out, x, y, z, lo, hi, F, texOf, {cull = null, arm = false} = {}) {
    const own = L(at(x, y, z)), a = AXIS[F], pos = F % 2 === 0;
    for (let f = 0; f < 6; f++) {
      const Fc = FACE[f];
      if (cull && cull[f] && isOpaque(pad[at(x + Fc.n[0], y + Fc.n[1], z + Fc.n[2])])) continue;
      const layer = texOf(f);
      if (layer < 0) continue;
      const nb = L(at(x + Fc.n[0], y + Fc.n[1], z + Fc.n[2])), lt = Math.max(own >> 4, nb >> 4), lb = Math.max(own & 15, nb & 15);
      const b2 = 3 - a - AXIS[f];
      for (let c = 0; c < 4; c++) {
        const cu = c === 1 || c === 2 ? 1 : 0, cv = c >= 2 ? 1 : 0, p = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          if (Fc.n[k] !== 0) p[k] = Fc.n[k] > 0 ? hi[k] : lo[k];
          else if (Fc.u[k] !== 0) p[k] = (Fc.u[k] > 0) === (cu === 1) ? hi[k] : lo[k];
          else p[k] = (Fc.v[k] > 0) === (cv === 1) ? hi[k] : lo[k];
        }
        let u, w;
        if (AXIS[f] === a) [u, w] = AUTO_UV[f](p);
        else { const h = pos ? p[a] : 16 - p[a]; u = p[b2]; w = arm ? 4 + (h + 4) * 0.75 : 16 - h; }
        out.vert(x + p[0] / 16, y + p[1] / 16, z + p[2] / 16, layer, u, w, lt * 17, lb * 17, f << 2, WHITE);
      }
    }
  }
  /** Moves the vertices made since s (1/16 units within the cell) through fn([x, y, z]) → [x, y, z]. */
  function bend(out, s, x, y, z, fn) {
    const u16 = out.u16;
    for (let k = s; k < out.n; k++) {
      const h = k * STRIDE >> 1, q = fn([u16[h] - (x + 1) * 16, u16[h + 1] - (y + 1) * 16, u16[h + 2] - (z + 1) * 16]);
      u16[h] = Math.round(q[0] + (x + 1) * 16); u16[h + 1] = Math.round(q[1] + (y + 1) * 16); u16[h + 2] = Math.round(q[2] + (z + 1) * 16);
    }
  }
  const TORCH_UV = [[7, 6, 9, 11], [7, 6, 9, 11], [7, 6, 9, 8], [7, 13, 9, 15], [7, 6, 9, 11], [7, 6, 9, 11]];
  const HANDLE_UV = [[7, 6, 9, 16], [7, 6, 9, 16], [7, 6, 9, 8], [7, 13, 9, 15], [7, 6, 9, 16], [7, 6, 9, 16]];
  // a lever's handle: out of the base along the face it hangs on, leaning 45° one way (off) or the other (on)
  const LEVER_FRAME = [[[0, 1, 0], [0, 0, 1], [8, 1, 8]], [[0, 1, 0], [1, 0, 0], [8, 1, 8]], [[0, -1, 0], [0, 0, 1], [8, 15, 8]], [[0, -1, 0], [1, 0, 0], [8, 15, 8]],
    [[0, 0, 1], [0, 1, 0], [8, 8, 1]], [[-1, 0, 0], [0, 1, 0], [15, 8, 8]], [[0, 0, -1], [0, 1, 0], [8, 8, 15]], [[1, 0, 0], [0, 1, 0], [1, 8, 8]]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // a repeater's or comparator's parts, laid out for one facing north (the signal going to −z), turned to its facing
  const turnXZ = (fc, [x0, y0, z0, x1, y1, z1]) => {
    const t = ([px, pz]) => fc === 3 ? [16 - pz, px] : fc === 0 ? [16 - px, 16 - pz] : fc === 1 ? [pz, 16 - px] : [px, pz];
    const [ax, az] = t([x0, z0]), [bx, bz] = t([x1, z1]);
    return [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
  };

  for (let y = 0; y < 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = at(x, y, z), v = pad[i];
    if (!v) continue;
    const id = v & 0xFFF, meta = v >>> 12, b = BLOCKS[id], shape = SHAPE[id];
    if (!b) continue;
    const out = PASS[id] === 'translucent' ? trans : solid;
    const tintC = tintOf(id, x, z);
    if (shape === 'cube' || (shape === 'slab' && meta === 2)) {
      const leaf = LEAVES[id];
      for (let f = 0; f < 6; f++) {
        const F = FACE[f], nv = pad[at(x + F.n[0], y + F.n[1], z + F.n[2])], nid = nv & 0xFFF;
        if (isOpaque(nv)) continue;
        if (!OPAQUE[id] && nid === id && !leaf) continue;     // glass next to glass, ice next to ice
        let layer = faceTex(b, f, meta), t = tintC;
        if (id === ID.grass_block && f !== 2) t = WHITE;
        if (id === ID.grass_block && meta === 1 && f !== 2 && f !== 3) layer = tex('grass_block_snow');
        let rot = 0;
        if (b.axis && (meta & 3) === 1 && f !== 0 && f !== 1) rot = 1;
        if (b.axis && (meta & 3) === 2 && (f === 0 || f === 1)) rot = 1;
        if (b.facing6) [layer, rot] = faceTex6(b, f, meta);
        cubeFace(out, x, y, z, f, layer, t, rot, ORE[id] ? 5 : leaf && wave ? 1 : 0);
        if (id === ID.grass_block && meta !== 1 && f !== 2 && f !== 3) cubeFace(out, x, y, z, f, tex('grass_block_side_overlay'), tintC);
      }
    } else if (shape === 'wire') {
      // dust: the blob in the middle and a line out to each side it runs to (up the side of a block where it climbs),
      // coloured by its power
      const near = (dx, dy, dz) => pad[at(x + dx, y + dy, z + dz)], links = wireLinks(near), L0 = L(i), lt = L0 >> 4, lb = L0 & 15, c = DUST[meta & 15], h = y + 1 / 16;
      flatRect(out, x, h, z, 0, 0, 1, 1, tex(b.tex.all), lt, lb, c);
      WIRE_SIDES.forEach(([f, dx, dz], k) => {
        if (!links[k]) return;
        const [x0, z0, x1, z1] = dx > 0 ? [0.5, 0, 1, 1] : dx < 0 ? [0, 0, 0.5, 1] : dz > 0 ? [0, 0.5, 1, 1] : [0, 0, 1, 0.5];
        flatRect(out, x, h, z, x0, z0, x1, z1, tex(dx ? b.tex.line1 : b.tex.line0), lt, lb, c);
        if (links[k] === 2) square(out, OPP[f], x + dx, y, z + dz, 1 / 16, tex(b.tex.line0), 0, lt, lb, c);
      });
    } else if (shape === 'repeater' || shape === 'comparator') {
      // a stone slab with the wire's picture on top, turned the way the signal goes, and its little torches: a repeater's
      // at the front and one set back by its delay; a comparator's two at the back (lit when it gives power) and one at
      // the front (lit when it subtracts)
      const fc = meta & 3, L0 = L(i), lt = L0 >> 4, lb = L0 & 15, sideL = tex(b.tex.side);
      box(out, x, y, z, 0, 0, 0, 16, 2, 16, f => f === 2 ? -1 : sideL, WHITE, {cull: [0, 0, 0, 1, 0, 0]});
      flatRect(out, x, y + 2 / 16, z, 0, 0, 1, 1, tex(b.tex.top), lt, lb, WHITE, [2, 3, 0, 1][fc]);
      const on = tex(b.tex.torch), off = tex('redstone_torch_off'), lit = tex('redstone_torch');
      const torches = shape === 'repeater' ? [[7, 2, on], [7, 6 + 2 * ((meta >> 2) & 3), on]] : [[7, 2, meta & 4 ? lit : off], [3, 11, on], [11, 11, on]];
      for (const [tx, tz, layer] of torches) { const q = turnXZ(fc, [tx, 2, tz, tx + 2, 7, tz + 2]); box(out, x, y, z, q[0], q[1], q[2], q[3], q[4], q[5], () => layer, WHITE, {uvs: TORCH_UV}); }
    } else if (shape === 'lever') {
      // the cobblestone base on the face it hangs on, and the handle leaning out of it
      const a = meta & 7, [bx0, by0, bz0, bx1, by1, bz1] = LEVER_BASE[a];
      box(out, x, y, z, bx0, by0, bz0, bx1, by1, bz1, () => tex(b.tex.all), WHITE);
      const s = out.n, [N, T, P] = LEVER_FRAME[a], B = cross(T, N), lean = (meta & 8 ? 1 : -1) * (a >= 4 ? -1 : 1) * Math.PI / 4, cs = Math.cos(lean), sn = Math.sin(lean);
      box(out, x, y, z, 7, 0, 7, 9, 10, 9, () => tex(b.tex.handle), WHITE, {uvs: HANDLE_UV});
      bend(out, s, x, y, z, ([px, py, pz]) => {
        const qx = px - 8, qy = py * cs - (pz - 8) * sn, qz = py * sn + (pz - 8) * cs;
        return [P[0] + B[0] * qx + N[0] * qy + T[0] * qz, P[1] + B[1] * qx + N[1] * qy + T[1] * qz, P[2] + B[2] * qx + N[2] * qy + T[2] * qz];
      });
    } else if (shape === 'piston' || shape === 'piston_head') {
      // the head's face (wood; slime on a sticky one) the way it points, the back, the sides standing toward the front;
      // pushed out, the base's front shows the inside and the head is a plate on an arm
      const F = meta & 7, ext = shape === 'piston' && meta & 8;
      for (const {box: bx, role} of pieces(v)) {
        const texOf = f => role === 'arm' ? tex(b.tex.side) : shape === 'piston_head' ? (f === F || f === OPP[F] ? tex(meta & 8 ? b.tex.sticky : b.tex.top) : tex(b.tex.side))
          : f === F ? tex(ext ? b.tex.inner : b.tex.top) : f === OPP[F] ? tex(b.tex.bottom) : tex(b.tex.side);
        axisBox(out, x, y, z, bx.slice(0, 3), bx.slice(3), F, texOf, {cull: role === 'arm' ? null : ext ? [1, 1, 1, 1, 1, 1].map((c, f) => f === F ? 0 : 1) : [1, 1, 1, 1, 1, 1], arm: role === 'arm'});
      }
    } else if (shape === 'rail') {
      // a rail on the ground (its picture turned along its way; a bend from the corner picture), or up a slope
      const kind = b.rail, m = kind === 'rail' ? meta : meta & 7, L0 = L(i), lt = L0 >> 4, lb = L0 & 15, h = 1 / 16;
      const layer = tex(m >= 6 ? b.tex.corner : kind !== 'rail' && meta & 8 ? b.tex.on : b.tex.all);
      if (!railSlope(m)) flatRect(out, x, y + h, z, 0, 0, 1, 1, layer, lt, lb, WHITE, m >= 6 ? m - 6 : m === 1 ? 1 : 0);
      else {
        // 2 up to the east, 3 west, 4 north, 5 south: the low edge on the ground, the high one a block up
        const up = [[1, 0], [-1, 0], [0, -1], [0, 1]][m - 2], hy = (px, pz) => y + h + ((up[0] ? (up[0] > 0 ? px : 1 - px) : (up[1] > 0 ? pz : 1 - pz)));
        const pts = [[0, 1], [1, 1], [1, 0], [0, 0]].map(([px, pz]) => [x + px, hy(px, pz), z + pz]), rot = up[0] ? 1 : 0;
        quad(out, pts, layer, [0, 1, 2, 3].map(c => CORNER_UV[(c + rot) & 3]), lt, lb, WHITE, 0, 2, true);
      }
    } else if (PIECED.has(shape)) {
      const near = (dx, dy, dz) => pad[at(x + dx, y + dy, z + dz)];
      for (const {box: [x0, y0, z0, x1, y1, z1], role} of pieces(v, near)) {
        const texFor = f => role === 'main' ? (shape === 'pane' && (f === 2 || f === 3) ? tex(b.tex.edge || b.tex.all) : faceTex(b, f, meta))
          : role === 'door_top' ? tex(b.tex.top) : role === 'door_bottom' ? tex(b.tex.bottom) : role === 'wood' ? tex('oak_planks') : role === 'latch' ? tex('iron_block') : role === 'base' ? tex(b.tex.base) : role === 'post' ? tex(b.tex.post)
          : role === 'compost' ? tex('composter_compost') : role === 'ready' ? tex('composter_ready') : role === 'inside' ? tex(b.tex.inside) : tex('white_wool');
        const t = role === 'wool' ? parseInt(b.color.slice(1), 16) : role === 'main' ? tintC : WHITE;
        // a portal's sheet shows no edge where it meets more of itself
        const faces = shape === 'portal' ? FACE.reduce((m, F, f) => (pad[at(x + F.n[0], y + F.n[1], z + F.n[2])] & 0xFFF) === id ? m & ~(1 << f) : m, 63) : 63;
        box(out, x, y, z, x0, y0, z0, x1, y1, z1, texFor, t, {faces, cull: [x1 === 16, x0 === 0, y1 === 16, y0 === 0, z1 === 16, z0 === 0]});
      }
    } else if (shape === 'cross') {
      // (a mangrove propagule hanging under the leaves has its own picture)
      const L0 = L(i), lt = L0 >> 4, lb = L0 & 15, layer = tex(meta & 8 && b.tex.hanging ? b.tex.hanging : b.tex.all);
      const h = hash2(ox + x, oz + z), jx = (id === ID.sugar_cane ? 0 : (h & 15) / 15 - 0.5) * 0.4, jz = (id === ID.sugar_cane ? 0 : (h >> 4 & 15) / 15 - 0.5) * 0.4;
      // 2: a plant that waves, 3: one that stands still (the shaded look finds plants by these)
      const cx = x + 0.5 + jx, cz = z + 0.5 + jz, r = 0.45, flags = wave && id !== ID.sugar_cane ? 2 : 3;
      quad(out, [[cx - r, y, cz - r], [cx + r, y, cz + r], [cx + r, y + 1, cz + r], [cx - r, y + 1, cz - r]], layer, UVQ, lt, lb, tintC, flags);
      quad(out, [[cx - r, y, cz + r], [cx + r, y, cz - r], [cx + r, y + 1, cz - r], [cx - r, y + 1, cz + r]], layer, UVQ, lt, lb, tintC, flags);
    } else if (shape === 'bamboo') {
      // a stalk, thin or thick, moved off the middle the same all the way up its column (the game's), and its leaves:
      // two sheets crossed through it
      const L0 = L(i), lt = L0 >> 4, lb = L0 & 15, [dx, dz] = plantOffset(ox + x, oz + z), layer = tex(b.tex.all), thick = meta & 4;
      const a0 = thick ? 6.5 : 7, a1 = thick ? 9.5 : 9, side = thick ? [3, 0, 6, 16] : [0, 0, 2, 16], end = thick ? [13, 0, 16, 3] : [13, 0, 15, 2];
      box(out, x, y, z, a0 + dx, 0, a0 + dz, a1 + dx, 16, a1 + dz, () => layer, WHITE, {uvs: [side, side, end, end, side, side]});
      if (meta & 3) {
        const lay = tex((meta & 3) === 2 ? b.tex.large : b.tex.small), cx = x + 0.5 + dx / 16, cz = z + 0.5 + dz / 16;
        quad(out, [[cx - 0.5, y, cz], [cx + 0.5, y, cz], [cx + 0.5, y + 1, cz], [cx - 0.5, y + 1, cz]], lay, UVQ, lt, lb, WHITE, 3);
        quad(out, [[cx, y, cz + 0.5], [cx, y, cz - 0.5], [cx, y + 1, cz - 0.5], [cx, y + 1, cz + 0.5]], lay, UVQ, lt, lb, WHITE, 3);
      }
    } else if (shape === 'petals') {
      // pink petals: a quarter of the picture for each flower, lying just over the ground, filled round the way they
      // were put down
      const L0 = L(i), lt = L0 >> 4, lb = L0 & 15, layer = tex(b.tex.all), n = (meta & 3) + 1, turn = meta >> 2 & 3;
      for (let q = 0; q < n; q++) { const [qx, qz] = [[0, 0], [0, 0.5], [0.5, 0.5], [0.5, 0]][(q + turn) & 3]; flatRect(out, x, y + 3 / 16, z, qx, qz, qx + 0.5, qz + 0.5, layer, lt, lb, WHITE); }
    } else if (shape === 'crop') {
      const L0 = L(i), lt = L0 >> 4, lb = L0 & 15, layer = tex(b.stages ? b.stages[Math.min(7, meta)] : `wheat_stage${Math.min(7, meta)}`), top = y + 1 - 1 / 16;
      for (const k of [4 / 16, 12 / 16]) {
        quad(out, [[x, y - 1 / 16, z + k], [x + 1, y - 1 / 16, z + k], [x + 1, top, z + k], [x, top, z + k]], layer, UVQ, lt, lb, WHITE, 2);
        quad(out, [[x + k, y - 1 / 16, z + 1], [x + k, y - 1 / 16, z], [x + k, top, z], [x + k, top, z + 1]], layer, UVQ, lt, lb, WHITE, 2);
      }
    } else if (shape === 'liquid') {
      liquid(out, x, y, z, id, meta, tintC);
    } else if (shape === 'torch') {
      const layer = tex(b.tex.all), uvs = [[7, 6, 9, 16], [7, 6, 9, 16], [7, 6, 9, 8], [7, 13, 9, 15], [7, 6, 9, 16], [7, 6, 9, 16]];
      if (!meta) box(out, x, y, z, 7, 0, 7, 9, 10, 9, () => layer, WHITE, {uvs});
      else {
        // on a wall: leaning out from it (meta 1–4: the wall is east, west, south, north of it)
        const [dx, dz] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]][meta];
        const s = out.n;
        box(out, x, y, z, 7, 0, 7, 9, 10, 9, () => layer, WHITE, {uvs});
        leanTorch(out, s, x, y, z, dx, dz);
      }
    } else if (shape === 'lantern') {
      const layer = tex(b.tex.all);
      box(out, x, y, z, 5, 0, 5, 11, 7, 11, () => layer, WHITE, {uvs: [[0, 2, 6, 9], [0, 2, 6, 9], [0, 9, 6, 15], [0, 9, 6, 15], [0, 2, 6, 9], [0, 2, 6, 9]]});
      box(out, x, y, z, 6, 7, 6, 10, 9, 10, () => layer, WHITE, {uvs: [[1, 0, 5, 2], [1, 0, 5, 2], [1, 10, 5, 14], [1, 10, 5, 14], [1, 0, 5, 2], [1, 0, 5, 2]]});
    } else if (shape === 'layer') {
      const h = Math.min(16, (meta + 1) * 2), layer = tex(b.tex.all);
      box(out, x, y, z, 0, 0, 0, 16, h, 16, () => layer, WHITE, {cull: [1, 1, h === 16, 1, 1, 1]});
    } else if (shape === 'slab') {
      const [lo, hi] = meta === 1 ? [8, 16] : [0, 8];
      box(out, x, y, z, 0, lo, 0, 16, hi, 16, f => faceTex(b, f, 0), WHITE, {cull: [1, 1, hi === 16, lo === 0, 1, 1]});
    } else if (shape === 'cactus') {
      box(out, x, y, z, 1, 0, 1, 15, 16, 15, f => f === 2 || f === 3 ? -1 : faceTex(b, f, 0), WHITE, {faces: 0b110011});
      box(out, x, y, z, 0, 0, 0, 16, 16, 16, f => faceTex(b, f, 0), WHITE, {faces: 0b001100, cull: [0, 0, 1, 1, 0, 0]});
    } else if (shape === 'farmland') {
      box(out, x, y, z, 0, 0, 0, 16, 15, 16, f => faceTex(b, f, 0), WHITE, {cull: [1, 1, 0, 1, 1, 1]});
    } else if (shape === 'wall') {
      // ladder: a flat face just off the wall it hangs on (meta: the side it faces, like FRONT)
      const layer = tex(b.tex.all), L0 = L(i), lt = L0 >> 4, lb = L0 & 15, k = 1 / 16;
      const pts = [
        [[x + 1, y, z + k], [x, y, z + k], [x, y + 1, z + k], [x + 1, y + 1, z + k]],             // faces south: on the north wall
        [[x + 1 - k, y, z + 1], [x + 1 - k, y, z], [x + 1 - k, y + 1, z], [x + 1 - k, y + 1, z + 1]], // faces west: on the east wall
        [[x, y, z + 1 - k], [x + 1, y, z + 1 - k], [x + 1, y + 1, z + 1 - k], [x, y + 1, z + 1 - k]], // faces north: on the south wall
        [[x + k, y, z], [x + k, y, z + 1], [x + k, y + 1, z + 1], [x + k, y + 1, z]],             // faces east: on the west wall
      ][meta & 3];
      quad(out, pts, layer, UVQ, lt, lb, WHITE, 0, 4);
    } else if (shape === 'vine') {
      // a sheet just off each side it clings to (bit d: the side towards DIR d), facing away from it
      const layer = tex(b.tex.all), L0 = L(i), lt = L0 >> 4, lb = L0 & 15, k = 1 / 16;
      const sheets = [
        [[x, y, z + 1 - k], [x + 1, y, z + 1 - k], [x + 1, y + 1, z + 1 - k], [x, y + 1, z + 1 - k]],
        [[x + k, y, z], [x + k, y, z + 1], [x + k, y + 1, z + 1], [x + k, y + 1, z]],
        [[x + 1, y, z + k], [x, y, z + k], [x, y + 1, z + k], [x + 1, y + 1, z + k]],
        [[x + 1 - k, y, z + 1], [x + 1 - k, y, z], [x + 1 - k, y + 1, z], [x + 1 - k, y + 1, z + 1]],
      ];
      for (let d = 0; d < 4; d++) if (meta & 1 << d) quad(out, sheets[d], layer, UVQ, lt, lb, tintC, 0, [5, 0, 4, 1][d]);
    } else if (shape === 'tall') {
      // a plant two blocks tall: crossed like the others, each half its own picture, both halves at the same spot
      const L0 = L(i), lt = L0 >> 4, lb = L0 & 15, top = meta & 8, layer = tex(top ? b.tex.top : b.tex.bottom);
      const h = hash2(ox + x, oz + z), jx = ((h & 15) / 15 - 0.5) * 0.3, jz = ((h >> 4 & 15) / 15 - 0.5) * 0.3;
      const cx = x + 0.5 + jx, cz = z + 0.5 + jz, r = 0.45, flags = wave ? 2 : 3;
      quad(out, [[cx - r, y, cz - r], [cx + r, y, cz + r], [cx + r, y + 1, cz + r], [cx - r, y + 1, cz - r]], layer, UVQ, lt, lb, tintC, flags);
      quad(out, [[cx - r, y, cz + r], [cx + r, y, cz - r], [cx + r, y + 1, cz - r], [cx - r, y + 1, cz + r]], layer, UVQ, lt, lb, tintC, flags);
      if (top && b.tex.front) {
        // the sunflower's head, turned to the east and tipped up a little: its face that way, its back the other
        const xb = cx + 0.17, xt = cx - 0.08, y0 = y - 1 / 16, y1 = y + 15 / 16, z0 = cz - 0.44, z1 = cz + 0.44;
        quad(out, [[xb, y0, z1], [xb, y0, z0], [xt, y1, z0], [xt, y1, z1]], tex(b.tex.front), UVQ, lt, lb, WHITE, 3, 0, false);
        quad(out, [[xb - 0.01, y0, z0], [xb - 0.01, y0, z1], [xt - 0.01, y1, z1], [xt - 0.01, y1, z0]], tex(b.tex.back), UVQ, lt, lb, WHITE, 3, 1, false);
      }
    } else if (shape === 'cocoa') {
      // the pod (its picture laid out as the game's: sides from (15 − w, 4), top and bottom from the corner)
      const age = Math.min(2, meta >> 2), layer = tex(b.stages[age]), w = [4, 6, 8][age], hh = [5, 7, 9][age], t = [4, 6, 7][age];
      const side = [15 - w, 4, 15, 4 + hh], cap = [0, 0, t, t];
      const [{box: [x0, y0, z0, x1, y1, z1]}] = pieces(v);
      box(out, x, y, z, x0, y0, z0, x1, y1, z1, () => layer, WHITE, {uvs: [side, side, cap, cap, side, side]});
    }
  }

  function liquid(out, x, y, z, id, meta, tintC) {
    const above = pad[at(x, y + 1, z)] & 0xFFF, same = n => (n & 0xFFF) === id;
    const level = meta & 7, falling = meta >= 8;
    const height = (xx, zz) => {
      const n = pad[at(xx, y, zz)];
      if (!same(n)) return -1;
      if (same(pad[at(xx, y + 1, zz)])) return 16;
      const lv = (n >>> 12) >= 8 ? 0 : (n >>> 12) & 7;
      return 14.2 - lv * 1.75;
    };
    // corner heights: average of the liquid blocks around each corner (sloping water)
    const corner = (cx, cz) => {
      let sum = 0, cnt = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const h = height(x + cx + dx, z + cz + dz);
        if (h === 16) return 16;
        if (h >= 0) { sum += h; cnt++; }
      }
      return cnt ? sum / cnt : 0;
    };
    const top = same(above) ? null : [corner(0, 1), corner(1, 1), corner(1, 0), corner(0, 0)];
    const still = tex(id === WATER ? 'water_still' : 'lava_still'), flow = tex(id === WATER ? 'water_flow' : 'lava_flow');
    const own = L(at(x, y, z)), flags = 4;
    if (top) {
      const lu = L(at(x, y + 1, z)), lt = Math.max(own >> 4, lu >> 4), lb = Math.max(own & 15, lu & 15);
      const pts = [[x, y + top[0] / 16, z + 1], [x + 1, y + top[1] / 16, z + 1], [x + 1, y + top[2] / 16, z], [x, y + top[3] / 16, z]];
      quad(out, pts, level || falling ? flow : still, UVQ, lt, lb, tintC, flags, 2, id === WATER);
    }
    for (let f = 0; f < 6; f++) {
      if (f === 2) continue;
      const F = FACE[f], nv = pad[at(x + F.n[0], y + F.n[1], z + F.n[2])];
      if (same(nv) || isOpaque(nv)) continue;
      if (f === 3) { const nb = L(at(x, y - 1, z)); quad(out, [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], still, UVQ, Math.max(own >> 4, nb >> 4), Math.max(own & 15, nb & 15), tintC, flags, 3, false); continue; }
      const nb = L(at(x + F.n[0], y + F.n[1], z + F.n[2])), lt = Math.max(own >> 4, nb >> 4), lb = Math.max(own & 15, nb & 15);
      const hs = top || [16, 16, 16, 16];
      // the two top corners of this side: which of the corner heights they are
      const sideTop = {0: [hs[1], hs[2]], 1: [hs[3], hs[0]], 4: [hs[0], hs[1]], 5: [hs[2], hs[3]]}[f];
      const p0 = [x + F.o[0], y, z + F.o[2]], p1 = [p0[0] + F.u[0], y, p0[2] + F.u[2]];
      quad(out, [p0, p1, [p1[0], y + sideTop[1] / 16, p1[2]], [p0[0], y + sideTop[0] / 16, p0[2]]], flow, [[0, 16], [16, 16], [16, 16 - sideTop[1]], [0, 16 - sideTop[0]]], lt, lb, tintC, flags, f, id === WATER);
    }
  }
  /** Turns the box just made (vertices from s on) into a torch leaning off a wall. */
  function leanTorch(out, s, x, y, z, dx, dz) {
    const u16 = out.u16, a = 0.3927; // 22.5°
    for (let k = s; k < out.n; k++) {
      const h = k * STRIDE >> 1;
      let px = u16[h] / 16 - 1 - x - 0.5, py = u16[h + 1] / 16 - 1 - y, pz = u16[h + 2] / 16 - 1 - z - 0.5;
      // lean away from the wall: rotate about the horizontal axis along the wall
      const lean = py * Math.sin(a);
      px += -dx * lean; pz += -dz * lean; py = py * Math.cos(a);
      px += dx * 0.31; pz += dz * 0.31; py += 3.5 / 16;
      u16[h] = Math.round((px + x + 1.5) * 16); u16[h + 1] = Math.round((py + y + 1) * 16); u16[h + 2] = Math.round((pz + z + 1.5) * 16);
    }
  }
  const sorted = byFacing(finish(solid));
  return {solid: sorted.data, faces: sorted.faces, trans: finish(trans)};
}
// facing: 0 south, 1 west, 2 north, 3 east → the face it shows its front on
export const FRONT = [4, 1, 5, 0];
function finish(out) {
  // flipped quads: rotate their vertices so the other diagonal is used
  if (out.flip) for (const base of out.flip) {
    const a = out.u8.slice(base * STRIDE, (base + 4) * STRIDE);
    out.u8.set(a.subarray(STRIDE), base * STRIDE); out.u8.set(a.subarray(0, STRIDE), (base + 3) * STRIDE);
  }
  return out.take();
}
/**
 * The quads put in seven groups by which way they face (+x, −x, +y, −y, +z, −z, then any other way: plants, slopes),
 * from each quad's own corners (a two-sided one is two quads, one each way). The renderer leaves out a group that
 * faces away from the camera without the GPU working through its corners. faces: where each group starts (in quads),
 * and the end.
 */
export function byFacing(data) {
  const quads = data.length / STRIDE / 4, u16 = new Uint16Array(data.buffer, data.byteOffset, data.length >> 1), group = new Uint8Array(quads), n = new Int32Array(7);
  for (let q = 0; q < quads; q++) {
    const h = q * 2 * STRIDE, a = h, b = h + STRIDE / 2, d = h + 3 * STRIDE / 2;
    const ux = u16[b] - u16[a], uy = u16[b + 1] - u16[a + 1], uz = u16[b + 2] - u16[a + 2], vx = u16[d] - u16[a], vy = u16[d + 1] - u16[a + 1], vz = u16[d + 2] - u16[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const g = !ny && !nz && nx ? (nx > 0 ? 0 : 1) : !nx && !nz && ny ? (ny > 0 ? 2 : 3) : !nx && !ny && nz ? (nz > 0 ? 4 : 5) : 6;
    group[q] = g; n[g]++;
  }
  const faces = new Int32Array(8);
  for (let g = 0; g < 7; g++) faces[g + 1] = faces[g] + n[g];
  const out = new Uint8Array(data.length), at = faces.slice(0, 7), size = 4 * STRIDE;
  for (let q = 0; q < quads; q++) out.set(data.subarray(q * size, q * size + size), at[group[q]]++ * size);
  return {data: out, faces};
}
function hash2(x, z) { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return (h ^ h >>> 16) >>> 0; }
