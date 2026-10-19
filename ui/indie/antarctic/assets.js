// 南极结界 · 物件: things in the world, each drawn as pixels (its albedo, unlit), with which way each pixel faces (a
// normal; rounded things get theirs from their outline, built things face by face), what glows at night, and a rough
// 3D shape for its shadow. Coordinates of shapes are from the foot point: x east, y toward the camera, z up.
import {pillow} from './light.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const pack = ([r, g, b]) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
export const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
export const C = h => pack(hex(h));
export const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
export function noise(x, y, size, s = 0) {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = smooth(x / size - gx), fy = smooth(y / size - gy);
  const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export const shadeC = (c, k) => { const [r, g, b] = unpack(c); return pack([r * k, g * k, b * k]); };

const PAL = {
  r0: '#33200f', r1: '#4f3220', r2: '#6d4529', r3: '#8c5a35', r4: '#aa7244', r5: '#c48f5c',
  p0: '#0c2219', p1: '#133325', p2: '#1b4630', p3: '#265c3c', p4: '#367548', p5: '#4f9156', p6: '#74ad62',
  o0: '#1a3a1b', o1: '#255223', o2: '#336b2c', o3: '#478536', o4: '#64a142', o5: '#8bbf51',
  tr0: '#2c1a10', tr1: '#43291a', tr2: '#5c3a25', tr3: '#7a5034', tr4: '#966a47',
  st0: '#3b3c48', st1: '#565867', st2: '#757887', st3: '#9699a6', st4: '#b9bcc6',
  pl0: '#5b3a24', pl1: '#7a5034', pl2: '#966746', pl3: '#b3825a', pl4: '#cc9d71', pl5: '#e0b98c',
  rf0: '#18283a', rf1: '#22394f', rf2: '#2e4c66', rf3: '#3c617e', rf4: '#517b96', rf5: '#73a0b6',
  sh0: '#24466a', sh1: '#335f8a', sh2: '#4a7cab', gl0: '#3d6a88', gl1: '#6fa3c4', gl2: '#cfeaf3',
};
const P = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, C(v)]));
// The season things are drawn in (0 spring, 1 summer, 2 autumn, 3 winter); leaves change colour with it.
export let SEASON = 0;
export function setSeason(season) { SEASON = season | 0; }
const LEAVES = [
  ['#1a3a1b', '#255223', '#336b2c', '#478536', '#64a142', '#8bbf51'],
  ['#163a1a', '#1f5622', '#2b722c', '#3d8e34', '#58ab3f', '#80c94e'],
  ['#5a2414', '#86361a', '#b04e22', '#d0702a', '#e8983a', '#f5c45a'],
  ['#1a3a1b', '#255223', '#336b2c', '#478536', '#64a142', '#8bbf51'],
].map(row => row.map(C));

// An object: its pixels, an outline in the darker shade of what it edges, normals (from the outline unless drawn),
// what glows at night, the foot point inside it, and its shapes.
export function object(w, h, draw, {outline = true, fx = w / 2, fy = h - 2, shapes = [], round = 6} = {}) {
  const px = new Uint32Array(w * h), nrm = new Float32Array(w * h * 3), given = new Uint8Array(w * h), emit = new Uint8Array(w * h);
  const set = (x, y, c, n, glow) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h || !c) return; const i = y * w + x; px[i] = c; if (n) { nrm.set(n, i * 3); given[i] = 1; } else given[i] = 0; emit[i] = glow ? (glow === true ? 1 : glow) : 0; };
  draw(set);
  let out = px;
  if (outline) {
    out = px.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (px[i]) continue;
      const sides = [[y < h - 1 && px[i + w], .5, i + w], [x < w - 1 && px[i + 1], .44, i + 1], [x > 0 && px[i - 1], .34, i - 1], [y > 0 && px[i - w], .3, i - w]].filter(([c]) => c);
      if (sides.length) { const k = sides.reduce((a, [, f]) => a + f, 0) / sides.length, [r, g, b] = unpack(sides[0][0]); out[i] = pack([r * k * .9, g * k * .85, b * k]); if (given[sides[0][2]]) { nrm.set(nrm.subarray(sides[0][2] * 3, sides[0][2] * 3 + 3), i * 3); given[i] = 1; } }
    }
  }
  const auto = pillow(out, w, h, round);
  for (let i = 0; i < w * h; i++) if (out[i] && !given[i]) nrm.set(auto.subarray(i * 3, i * 3 + 3), i * 3);
  return {w, h, px: out, nrm, emit, fx, fy, shapes};
}
export const disc = (set, cx, cy, r, c, sy = 1, n) => { for (let y = Math.floor(cy - r * sy); y <= cy + r * sy; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + ((y - cy) / sy) ** 2 <= r * r) set(x, y, c, n); };
const inPoly = (x, y, pts) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
export const poly = (set, pts, paint, n) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) if (inPoly(x + .5, y + .5, pts)) set(x, y, paint(x, y), n); };
export const norm = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
/**
 * A standing round thing (barrel, pot, post, pedestal) seen from above at the game's slant: its top is an ellipse
 * (rx by ry), so its sides end below in the same curve — the foot, hoops and rims bend round the front, never straight.
 * paint(u, v, part): u across (-1 left … 1 right), v down the side (0 top rim … 1 foot), part 'side' | 'top'.
 * width(v) scales rx down the side (a bulge, a taper). top: draw the top face (false for something open or hidden).
 */
export function cylinder(set, cx, top, bottom, rx, ry, paint, {width = () => 1, lid = true} = {}) {
  const H = Math.max(1, bottom - top);
  for (let y = Math.floor(top - ry); y <= Math.ceil(bottom + ry); y++) for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
    // which height on the side this pixel is: solve y = top + v·H + ry·√(1−u²) with u from the width there
    let v = (y - top) / H, u = 0, ok = false;
    for (let k = 0; k < 3; k++) { const R = rx * width(Math.max(0, Math.min(1, v))); u = (x + .5 - cx) / R; if (Math.abs(u) > 1) break; v = (y + .5 - top - ry * Math.sqrt(1 - u * u)) / H; ok = true; }
    if (ok && Math.abs(u) <= 1 && v >= 0 && v <= 1) { set(x, y, paint(u, v, 'side'), norm(u, Math.sqrt(Math.max(0, 1 - u * u)) * .9, .1)); continue; }
    if (lid) { const R0 = rx * width(0), d = ((x + .5 - cx) / R0) ** 2 + ((y + .5 - top) / ry) ** 2; if (d <= 1) set(x, y, paint((x + .5 - cx) / R0, d, 'top'), [0, 0, 1]); }
  }
}

// A clump of leaves: painted lighter towards the upper left; the light itself comes from the normals.
function clump(set, cx, cy, r, t, seed) {
  disc(set, cx + .6, cy + .8, r, t[0]);
  disc(set, cx, cy, r * .94, t[1]);
  disc(set, cx - r * .12, cy - r * .16, r * .78, t[2]);
  disc(set, cx - r * .3, cy - r * .36, r * .5, t[3]);
  disc(set, cx - r * .42, cy - r * .5, r * .22, t[4]);
  for (let k = 0; k < r * 2.4; k++) { const a = hash(k, seed) * Math.PI * 2, x = cx + Math.cos(a) * (r + .6), y = cy + Math.sin(a) * (r + .6), lit = Math.cos(a) * -.6 + Math.sin(a) * -.8; set(x, y, lit > .3 ? t[3] : lit > -.3 ? t[1] : t[0]); }
  for (let k = 0; k < r; k++) { const a = hash(k, seed, 2) * Math.PI * 2, rr = hash(k, seed, 3) * r * .6; set(cx - r * .3 + Math.cos(a) * rr, cy - r * .35 + Math.sin(a) * rr, hash(k, seed, 4) > .5 ? t[5] : t[4]); }
  for (let k = 0; k < r * .8; k++) { const a = hash(k, seed, 5) * Math.PI * 2, rr = r * (.4 + hash(k, seed, 6) * .5); set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, t[0]); }
}

export function oak(seed, blossom) {
  const leaves = LEAVES[SEASON], bare = SEASON === 3;
  blossom = blossom && SEASON === 0;
  return object(70, 96, set => {
    for (let y = 54; y < 96; y++) {
      const flare = y > 86 ? Math.min(8, y - 86) * 1.2 : 0, l = 30 - flare, r = 40 + flare;
      for (let x = Math.round(l); x < r; x++) { const u = (x - l) / (r - l); if (y > 92 + 2.6 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))) continue; let c = u < .2 ? P.tr4 : u < .45 ? P.tr3 : u < .75 ? P.tr2 : P.tr1; if (hash(x, y >> 2, seed) > .82) c = P.tr1; if ((x + (y >> 3)) % 5 === 0 && u > .2) c = shadeC(c, .82); set(x, y, c); }
    }
    for (const [x0, y0, dx] of [[32, 62, -1], [38, 60, 1]]) for (let k = 0; k < 10; k++) { set(x0 + dx * k, y0 - k * .9, P.tr2); set(x0 + dx * k, y0 - k * .9 + 1, P.tr1); }
    if (bare) { // winter: branches forking up and out, twigs at their ends
      const branch = (x, y, a, len, w, depth) => {
        for (let k = 0; k < len; k++) { const X = x + Math.cos(a) * k, Y = y + Math.sin(a) * k; for (let t = 0; t < w; t++) set(X + t, Y, t === 0 ? P.tr3 : P.tr1); }
        if (depth > 0) { const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; branch(ex, ey, a - .45 - hash(depth, seed) * .3, len * .7, Math.max(1, w - 1), depth - 1); branch(ex, ey, a + .4 + hash(depth, seed, 1) * .3, len * .66, Math.max(1, w - 1), depth - 1); }
      };
      branch(34, 56, -Math.PI / 2 - .35, 16, 3, 3); branch(36, 56, -Math.PI / 2 + .3, 15, 3, 3); branch(35, 58, -Math.PI / 2, 12, 2, 2);
      return;
    }
    const clumps = [];
    for (let k = 0; k < 9; k++) { const a = Math.PI + k / 8 * Math.PI; clumps.push([35 + Math.cos(a) * 21, 36 + Math.sin(a) * 15, 10.5]); }
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + .4; clumps.push([35 + Math.cos(a) * 12, 34 + Math.sin(a) * 10, 10]); }
    clumps.push([35, 32, 11]);
    for (let k = 0; k < 5; k++) clumps.push([17 + k * 9 + hash(k, seed) * 3, 52 + hash(k, seed, 1) * 3, 9]);
    clumps.sort((a, b) => a[1] - b[1]).forEach(([x, y, r], i) => clump(set, x, y, r, leaves, seed * 31 + i));
    if (blossom) for (let k = 0; k < 40; k++) { const x = 13 + hash(k, seed, 7) * 44, y = 20 + hash(k, seed, 8) * 36; set(x, y, C('#ffb3c8')); set(x + 1, y, C('#ffe2ea')); set(x, y + 1, C('#e88aa6')); }
  }, {round: 14, shapes: [{t: 'cyl', x: 0, y: 0, r: 5, h: 40}, {t: 'sphere', x: 0, y: -4, z: 58, r: 28}]});
}
export function pine(seed) {
  const tones = [P.p0, P.p1, P.p2, P.p3, P.p4, P.p5, P.p6];
  return object(48, 100, set => {
    for (let y = 84; y < 100; y++) for (let x = 20; x < 29; x++) { const flare = y > 94 ? 1 : 0, u = (x + .5 - 24.5) / (3.5 + flare); if (Math.abs(u) > 1 || y > 97 + 1.6 * Math.sqrt(1 - u * u)) continue; set(x, y, u < -.35 ? P.tr3 : u > .45 ? P.tr1 : P.tr2); }
    for (let t = 0; t < 7; t++) {
      const top = 2 + t * 10.5, bottom = top + 22 + t * .8, half = 5 + t * 2.75;
      for (let y = Math.floor(top); y < bottom; y++) {
        const k = (y - top) / (bottom - top), wdt = half * Math.pow(k, .8) + 1;
        for (let x = Math.round(24 - wdt); x <= 24 + wdt; x++) {
          const side = (x - 24) / (wdt + .01), tip = bottom - 3 + ((x + t) % 4 < 2 ? 2 : 0) + Math.abs(side) * -3;
          if (y > tip) continue;
          let c = side < -.55 ? tones[5] : side < -.15 ? tones[4] : side < .3 ? tones[3] : side < .7 ? tones[2] : tones[1];
          if (y > tip - 2) c = tones[1];
          if ((x * 3 + y * 2 + t) % 7 === 0 && side < .4) c = side < -.3 ? tones[6] : tones[4];
          if (hash(x, y, seed) > .9) c = tones[Math.max(0, tones.indexOf(c) - 1)];
          set(x, y, c);
        }
      }
    }
  }, {round: 9, shapes: [{t: 'cyl', x: 0, y: 0, r: 3, h: 14}, {t: 'sphere', x: 0, y: -2, z: 24, r: 20}, {t: 'sphere', x: 0, y: -2, z: 50, r: 14}, {t: 'sphere', x: 0, y: -2, z: 74, r: 8}]});
}
export function bush(seed, berries) {
  return object(32, 24, set => {
    if (SEASON === 3) { // winter: a mound of bare twigs (the snow comes later, on everything that faces up)
      for (let k = 0; k < 22; k++) { const a = Math.PI + hash(k, seed) * Math.PI, len = 5 + hash(k, seed, 1) * 8; for (let r = 0; r < len; r++) set(16 + Math.cos(a) * r * 1.2, 21 + Math.sin(a) * r, r < 3 ? P.tr2 : P.tr3); }
      return;
    }
    for (const [x, y, r] of [[9, 14, 7], [23, 14, 7], [16, 10, 8], [16, 16, 7]].sort((a, b) => a[1] - b[1])) clump(set, x, y, r, LEAVES[SEASON], seed + x);
    if (berries && SEASON < 2) for (let k = 0; k < 9; k++) { const x = 6 + hash(k, seed) * 20, y = 7 + hash(k, seed, 1) * 12; set(x, y, C(berries)); set(x + 1, y, shadeC(C(berries), .7)); set(x, y - 1, C('#ffffff')); }
  }, {round: 7, shapes: [{t: 'sphere', x: 0, y: -2, z: 8, r: 11}]});
}
export function rock(seed, big) {
  const w = big ? 30 : 18, h = big ? 22 : 14;
  return object(w, h, set => {
    const cx = w / 2, cy = h * .58, rx = w * .44, ry = h * .4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy + (noise(x, y, 4, seed) - .5) * .4;
      if (d > 1) continue;
      const facet = Math.floor(noise(x, y, 6, seed + 1) * 3), lit = -dx * .5 - dy * .9 + facet * .15;
      set(x, y, lit > .7 ? P.st4 : lit > .25 ? P.st3 : lit > -.2 ? P.st2 : lit > -.6 ? P.st1 : P.st0);
    }
    for (let k = 0; k < 4; k++) set(cx - rx * .4 + hash(k, seed) * rx, cy - ry * .3 + hash(k, seed, 1) * ry * .8, C('#6e8a4a'));
  }, {round: big ? 7 : 5, shapes: [{t: 'sphere', x: 0, y: -2, z: big ? 4 : 2, r: big ? 12 : 7}]});
}
export function stump() {
  return object(24, 18, set => {
    cylinder(set, 12, 6, 13.5, 8, 4, (u, v) => u < -.5 ? P.tr4 : u < .2 ? P.tr3 : u < .7 ? P.tr2 : P.tr1, {width: v => 1 + Math.max(0, v - .6) * .5, lid: false});
    const up = [0, 0, 1];
    disc(set, 12, 6, 8, P.pl3, .5, up); disc(set, 12, 6, 6, P.pl4, .5, up); disc(set, 12, 6, 4, P.pl3, .5, up); disc(set, 12, 6, 2, P.pl4, .5, up);
  }, {round: 5, shapes: [{t: 'cyl', x: 0, y: -4, r: 8, h: 10}]});
}
export function fencePost() {
  return object(8, 24, set => {
    for (let y = 3; y < 23; y++) for (let x = 1; x < 7; x++) set(x, y, x === 1 ? P.r5 : x === 2 ? P.r4 : x === 6 ? P.r1 : (y + x) % 7 === 0 ? P.r2 : P.r3);
    for (let x = 0; x < 8; x++) { set(x, 2, P.r5, [0, 0, 1]); set(x, 3, P.r2); } for (let x = 2; x < 6; x++) set(x, 1, P.r4, [0, 0, 1]);
  }, {round: 3, shapes: [{t: 'cyl', x: 0, y: -1, r: 3, h: 20}]});
}
export function fenceRail(len) {
  return object(len, 12, set => { for (let x = 0; x < len; x++) for (const y of [3, 8]) { set(x, y, P.r5, [0, .3, .95]); set(x, y + 1, (x % 9 === 0) ? P.r2 : P.r3, [0, 1, 0]); set(x, y + 2, P.r1, [0, 1, 0]); } }, {outline: false, fx: len / 2, fy: 11, shapes: [{t: 'box', x0: -len / 2, x1: len / 2, y0: -1, y1: 0, h: 14}]});
}
export function lamp() {
  return object(14, 50, set => {
    for (let y = 14; y < 47; y++) { set(6, y, C('#5a5468')); set(7, y, C('#3a3546')); }
    cylinder(set, 7, 45, 47.5, 4.2, 1.6, (u, v, part) => part === 'top' ? C('#5a5468') : u < -.3 ? C('#4a4458') : C('#2e2a3a'));
    for (let y = 3; y < 13; y++) for (let x = 2; x < 12; x++) { const frame = x === 2 || x === 11 || y === 3 || y === 12 || x === 6 || x === 7; set(x, y, frame ? C('#3a3546') : C('#f6e2a4'), frame ? null : [0, 1, 0], !frame); }
    for (let x = 1; x < 13; x++) set(x, 2, C('#2e2a3a')); for (let x = 3; x < 11; x++) set(x, 1, C('#4a4458')); set(6, 0, C('#2e2a3a')); set(7, 0, C('#2e2a3a'));
    for (let x = 4; x < 10; x++) set(x, 13, C('#4a4458'));
  }, {round: 3, shapes: [{t: 'cyl', x: 0, y: -1, r: 1.5, h: 36}, {t: 'box', x0: -5, x1: 5, y0: -5, y1: 0, h: 47}]});
}
export function mailbox() {
  return object(18, 28, set => {
    for (let y = 12; y < 27; y++) { set(8, y, P.r4); set(9, y, P.r2); }
    for (let y = 2; y < 13; y++) for (let x = 2; x < 16; x++) { if (y < 5 && (x === 2 || x === 15)) continue; set(x, y, y < 4 ? C('#ec8a72') : y > 10 ? C('#8f3a2f') : x < 5 ? C('#d9644f') : C('#c7513f')); }
    for (let y = 0; y < 7; y++) set(16, y, C('#ffd45c')); set(15, 0, C('#ffd45c')); set(14, 0, C('#ffd45c')); set(14, 1, C('#f0b83a'));
  }, {round: 4, shapes: [{t: 'cyl', x: 0, y: -1, r: 1, h: 14}, {t: 'box', x0: -7, x1: 7, y0: -6, y1: 0, h: 26}]});
}
export function barrel() {
  return object(20, 26, set => {
    cylinder(set, 10, 4, 21, 7, 2.6, (u, v, part) => {
      if (part === 'top') return v > .72 ? P.r1 : Math.floor((u + 1) * 3.5) % 2 ? P.pl3 : P.pl4;
      if ((v > .12 && v < .2) || (v > .8 && v < .88)) return v % .5 < .17 ? C('#7a7a8a') : C('#4a4a58');
      return Math.abs(Math.sin((u + 1) * 7)) < .18 ? P.r2 : u < -.45 ? P.r5 : u < .2 ? P.r4 : u < .65 ? P.r3 : P.r2;
    }, {width: v => .86 + .14 * Math.sin(Math.PI * v)});
  }, {round: 3, fy: 24, shapes: [{t: 'cyl', x: 0, y: -5, r: 7, h: 20}]});
}
export function crate() {
  return object(20, 24, set => {
    for (let y = 1; y < 6; y++) for (let x = 2; x < 19; x++) set(x, y, (x % 5 === 0) ? P.r3 : P.r5, [0, 0, 1]);
    for (let y = 6; y < 23; y++) for (let x = 1; x < 19; x++) { const edge = x < 3 || x > 16 || y < 8 || y > 20; set(x, y, edge ? P.r2 : (y % 5 === 0 ? P.r2 : x < 8 ? P.r5 : P.r4), [0, 1, 0]); }
    for (let k = 3; k < 17; k++) { set(k, k + 4, P.r2, [0, 1, 0]); set(k + 1, k + 4, P.r1, [0, 1, 0]); }
  }, {round: 3, shapes: [{t: 'box', x0: -9, x1: 9, y0: -5, y1: 0, h: 18}]});
}
export function crop(kind) {
  return object(18, 26, set => {
    if (kind === 0) {
      disc(set, 9, 19, 4.2, C('#f3e9f4')); disc(set, 8, 18, 2.6, C('#ffffff')); for (const [x, y] of [[7, 16], [8, 15], [9, 15], [10, 15], [11, 16], [12, 17]]) set(x, y, C('#b85fa5'));
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * .45; for (let r = 2; r < 11; r++) set(9 + Math.cos(a) * r, 15 + Math.sin(a) * r, r > 7 ? C('#9ad466') : r > 4 ? C('#5fae4c') : C('#3f8a3c')); }
    } else if (kind === 1) {
      for (let k = 0; k < 7; k++) { const a = -Math.PI + k / 6 * Math.PI; for (let r = 1; r < 7; r++) set(9 + Math.cos(a) * r, 13 + Math.sin(a) * r * .8, r > 4 ? C('#9ad466') : C('#4f9b45')); }
      for (const [x, y] of [[5, 16], [12, 15], [9, 19]]) { disc(set, x, y, 2, C('#e2404f')); set(x - 1, y - 1, C('#ff9aa6')); set(x, y - 2, C('#5fae4c')); set(x + 1, y + 1, C('#a62636')); }
    } else if (kind === 3) { // 冬白菜
      disc(set, 9, 18, 6, C('#5e9a52')); disc(set, 9, 17, 4.6, C('#a7d48a')); disc(set, 8, 16, 3, C('#d6edc0')); disc(set, 8, 15, 1.4, C('#f2fae6'));
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1 + k / 8); set(9 + Math.cos(a) * 7, 19 + Math.sin(a) * 3.4, C('#3f7a3c')); }
    } else {
      for (const dx of [-3, 0, 3]) { for (let k = 0; k < 16; k++) set(9 + dx + (k > 10 ? Math.sign(dx) : 0), 23 - k, k < 4 ? C('#3f8a3c') : C('#5fae4c')); set(9 + dx - 1, 14, C('#9ad466')); set(9 + dx + 1, 12, C('#9ad466')); }
      for (const dx of [-3, 0, 3]) { const x = 9 + dx + Math.sign(dx), y = 6; set(x, y, C('#b79cff')); set(x + 1, y, C('#e8deff')); set(x, y - 1, C('#9a7de8')); set(x - 1, y, C('#9a7de8')); }
    }
  }, {round: 4, shapes: [{t: 'cyl', x: 0, y: -2, r: 4, h: kind === 2 ? 16 : 9}]});
}
export function flowerbed(len) {
  return object(len, 14, set => {
    for (let x = 0; x < len; x++) { for (let y = 5; y < 9; y++) set(x, y, C('#4a2f1e'), [0, 0, 1]); set(x, 9, P.r4, [0, .3, .95]); set(x, 10, P.r3, [0, 1, 0]); set(x, 11, P.r3, [0, 1, 0]); set(x, 12, P.r1, [0, 1, 0]); }
    if (SEASON === 3) return;
    const colours = [[C('#ff8fb1'), C('#ffd45c'), C('#ffffff'), C('#b79cff')], [C('#ffd45c'), C('#ff7a4a'), C('#ffffff'), C('#ffb347')], [C('#d9572e'), C('#e8a33a'), C('#9a3a6a'), C('#f2d07a')]][SEASON];
    for (let k = 0; k < len / 3; k++) { const x = 1 + k * 3, c = colours[k % 4]; set(x, 2, c); set(x - 1, 3, c); set(x + 1, 3, c); set(x, 3, C('#ffe08a')); set(x, 4, C('#3f8a3c')); set(x, 5, C('#3f8a3c')); set(x + 1, 5, C('#5fae4c')); }
  }, {fy: 13, shapes: [{t: 'box', x0: -len / 2, x1: len / 2, y0: -8, y1: 0, h: 5}]});
}

// The house, built in 3/4: a gable roof whose ridge runs away from us — the left slope faces west, the right slope east,
// both up; at the front a gable wall with a round attic window (阁楼), the eaves' thickness along the rakes, a plank
// front with shuttered windows and a lantern by the door, a porch with steps, a stone chimney on the east slope.
export function house() {
  const w = 184, h = 182, cx = 92, apex = 44, back = 30;
  const FRONT = [0, 1, 0], UP = [0, 0, 1], WEST = norm(-.72, .1, .68), EAST = norm(.72, .1, .68), RAKE = norm(0, .75, .66);
  const eaveY = 108, eaveL = 12, eaveR = w - 12, rake = x => apex + Math.abs(x - cx) * (eaveY - apex) / (cx - eaveL);
  // weathered wood: each board its own tone, grain running down it, knots, darker and mossy low down, darker under the eaves
  const WOOD = ['#3f2a1c', '#5a3d29', '#715036', '#8a6443', '#a17a54', '#b99168'].map(C);
  const board = (x, y, x0, top, bottom, width = 7) => {
    const id = Math.floor((x - x0) / width), lx = (x - x0) % width, tone = .86 + hash(id, 0, 7) * .26;
    let k = lx === 0 ? 0 : lx === 1 ? 4 : lx < 4 ? 3 : 2;
    if (lx > 1 && noise(x * 4, y / 5, 3, id) > .72) k = Math.max(1, k - 1); // grain
    let c = shadeC(WOOD[k], tone);
    const kx = x0 + id * width + width / 2, ky = top + (Math.floor(hash(id, 1, 8) * 6) * 9 + 6) % Math.max(10, bottom - top);
    if (hash(id, 2, 8) > .55 && (x - kx) ** 2 / 2.2 + (y - ky) ** 2 / 4 < 2.2) c = WOOD[0]; // a knot
    const low = (y - top) / Math.max(1, bottom - top);
    if (low > .82) c = shadeC(c, .82);
    if (low > .9 && noise(x, y, 4, 9) > .55) c = C('#4f6338'); // moss creeping up from the ground
    return c;
  };
  return object(w, h, set => {
    const wall0 = 28, wall1 = w - 28, wallTop = 96, wallBot = 154;
    for (let y = wallTop; y < wallBot; y++) for (let x = wall0; x < wall1; x++) {
      let c = board(x, y, wall0, wallTop, wallBot - 10);
      if (x < wall0 + 5 || x >= wall1 - 5) c = x === wall0 || x === wall1 - 1 ? WOOD[0] : x < wall0 + 2 || x >= wall1 - 2 ? WOOD[1] : WOOD[3];
      if (y >= wallBot - 10) { // footing of field stones, uneven, with moss in the joints
        const course = Math.floor((y - wallBot + 10) / 5), bw = 8 + Math.floor(hash(course, x >> 3, 11) * 6), bx = (x + course * 5) % bw, ly = (y - wallBot + 10) % 5;
        c = ly === 4 || bx === 0 ? (noise(x, y, 3, 12) > .7 ? C('#4f6338') : P.st0) : ly === 0 ? P.st4 : ly < 3 ? P.st3 : P.st2;
        if (c === P.st3 && hash(Math.floor((x + course * 5) / bw), course, 13) > .6) c = P.st2;
      }
      if (y < wallTop + 7) c = shadeC(c, .62 + (y - wallTop) * .05); // the eaves' shadow
      set(x, y, c, FRONT);
    }
    // gable: horizontal boards under the rakes, the round attic window with a sill
    for (let y = apex; y < wallTop; y++) for (let x = wall0; x < wall1; x++) {
      if (y < rake(x) + 3) continue;
      const ly = (y - apex) % 5, row = Math.floor((y - apex) / 5), tone = .86 + hash(row, x >> 4, 14) * .24;
      let c = shadeC(ly === 0 ? WOOD[1] : ly === 1 ? WOOD[5] : WOOD[4], tone);
      if (ly > 1 && noise(x / 4, y * 2, 3, row) > .78) c = WOOD[3];
      if (y < rake(x) + 7) c = shadeC(c, .7);
      set(x, y, c, FRONT);
    }
    for (let y = 60; y < 86; y++) for (let x = cx - 13; x <= cx + 13; x++) {
      const d = Math.hypot(x - cx, y - 73); if (d > 11) continue;
      const frame = d > 9 || Math.abs(x - cx) < 1 || Math.abs(y - 73) < 1;
      set(x, y, frame ? WOOD[1] : (x - cx) + (y - 73) < -4 ? P.gl1 : P.gl0, FRONT, !frame);
    }
    for (let x = cx - 10; x <= cx + 10; x++) { set(x, 85, WOOD[5], UP); set(x, 86, WOOD[2], FRONT); }
    // windows: frames, curtains tied back, glass, shutters with peeling paint, boxes of flowers
    for (const wx of [42, w - 42 - 26]) {
      for (let y = 106; y < 132; y++) for (let x = wx; x < wx + 26; x++) {
        const frame = x < wx + 2 || x >= wx + 24 || y < 108 || y >= 130 || x === wx + 12 || x === wx + 13 || y === 118 || y === 119;
        let c = frame ? (x === wx || y === 106 ? WOOD[5] : WOOD[1]) : P.gl0, glow = !frame;
        if (!frame && (x - wx) + (y - 108) < 8) c = P.gl1;
        if (!frame && (x - wx - (y - 108)) % 9 === 0 && y < 117) c = P.gl2;
        // curtains: cream cloth at the sides, gathered at the tie
        const cl = x - wx - 2, cr = wx + 23 - x, curtain = y < 128 && (cl < 4 - Math.max(0, (y - 116) / 3) || cr < 4 - Math.max(0, (y - 116) / 3));
        if (!frame && curtain) { c = (x + y) % 3 === 0 ? C('#d9b9a0') : C('#f0dcc4'); glow = false; }
        set(x, y, c, FRONT, glow);
      }
      for (const sx of [wx - 9, wx + 27]) for (let y = 105; y < 133; y++) for (let x = sx; x < sx + 8; x++) {
        let c = x === sx ? P.sh2 : (y - 105) % 5 === 0 ? P.sh0 : x === sx + 7 ? P.sh0 : P.sh1;
        if (noise(x, y, 3, sx) > .75) c = WOOD[2]; // paint worn to the wood
        set(x, y, c, FRONT);
      }
      for (let x = wx - 3; x < wx + 29; x++) { set(x, 132, WOOD[5], UP); set(x, 133, WOOD[3], FRONT); set(x, 134, WOOD[2], FRONT); set(x, 135, WOOD[2], FRONT); set(x, 136, WOOD[0], FRONT); }
      for (let k = 0; k < 11; k++) { const x = wx - 1 + k * 3, c = [C('#ff8fb1'), C('#ffd45c'), C('#ffffff'), C('#b79cff')][k % 4]; set(x, 129, c); set(x + 1, 130, shadeC(c, .8)); set(x, 131, C('#3f8a3c')); set(x + 1, 131, C('#5fae4c')); set(x - 1, 130, C('#5fae4c')); set(x + 1, 128, C('#5fae4c')); }
    }
    // door: worn boards, iron straps, a small window, the lantern
    for (let y = 104; y < 154; y++) for (let x = cx - 13; x <= cx + 13; x++) {
      if (y < 112 && ((x - cx) ** 2 / 169 + (y - 112) ** 2 / 64 > 1)) continue;
      const frame = Math.abs(x - cx) > 11 || (y < 112 && (x - cx) ** 2 / 121 + (y - 112) ** 2 / 36 > 1);
      let c = frame ? WOOD[0] : board(x, y, cx - 11, 104, 154, 5), glow = false;
      if (!frame && (y === 128 || y === 129 || y === 144 || y === 145)) c = y % 2 ? C('#2e2a33') : C('#4a4654');
      if (!frame && y > 114 && y < 124 && Math.abs(x - cx) < 6) { c = x === cx ? WOOD[1] : P.gl1; glow = x !== cx; }
      set(x, y, c, FRONT, glow);
    }
    set(cx + 7, 136, C('#ffd57a'), FRONT); set(cx + 7, 137, C('#b88a2a'), FRONT);
    for (let y = 106; y < 112; y++) set(cx + 22, y, C('#3a3546'), FRONT);
    for (let y = 112; y < 121; y++) for (let x = cx + 19; x < cx + 26; x++) { const frame = x === cx + 19 || x === cx + 25 || y === 112 || y === 120; set(x, y, frame ? C('#3a3546') : C('#ffd57a'), FRONT, !frame); }
    // ivy up the east corner
    for (let k = 0; k < 4; k++) { let x = wall1 - 3 - k * 2, y = wallBot - 2; for (let j = 0; j < 40 + k * 6; j++) { x += Math.round(Math.sin(j * .4 + k) * .6); y--; set(x, y, C('#2f5a28'), FRONT); if (j % 3 === 0) { set(x - 1, y, C('#4f8a3a'), FRONT); set(x + 1, y - 1, C('#6aa84a'), FRONT); } } }
    // roof: tiles in courses along the eaves, each tile its own shade, some green with moss; ridge cap down the middle
    const tiles = (x, y, side) => {
      const u = side < 0 ? x - eaveL : eaveR - x, v = y - rake(x) + back, course = Math.floor(u / 7), lu = u % 7;
      const row = Math.floor((v + (course % 2) * 4) / 8), lv = (v + (course % 2) * 4) % 8, edge = lv === 7, top = lv === 0;
      let c = lu === 0 ? P.rf1 : edge ? P.rf0 : top ? P.rf5 : lu < 3 ? P.rf4 : lu < 5 ? P.rf3 : P.rf2;
      if (!edge && lu) c = shadeC(c, .84 + hash(course, row, 5) * .3);
      if (!edge && noise(x, y, 10, 15) > .68 && hash(course, row, 16) > .3) c = shadeC(C('#56703e'), .8 + (lu < 3 ? .3 : 0)); // moss
      return c;
    };
    poly(set, [[cx, apex - back], [cx, apex], [eaveL, eaveY], [eaveL, eaveY - back]], (x, y) => tiles(x, y, -1), WEST);
    poly(set, [[cx, apex - back], [cx, apex], [eaveR, eaveY], [eaveR, eaveY - back]], (x, y) => tiles(x, y, 1), EAST);
    for (let y = apex - back - 2; y < apex + 1; y++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, Math.abs(x - cx) === 3 ? P.rf0 : (y % 6 === 0) ? P.rf1 : x < cx ? P.rf5 : P.rf3, UP);
    for (let x = eaveL; x <= eaveR; x++) { const y0 = Math.round(rake(x)); for (let k = 0; k < 5; k++) set(x, y0 + k, k === 0 ? P.rf5 : k < 3 ? WOOD[4] : k === 3 ? WOOD[2] : WOOD[0], RAKE); }
    for (const s of [-1, 1]) { const x0 = s < 0 ? eaveL : eaveR; for (let k = 0; k < 7; k++) { const x = x0 + s * k, y = eaveY - Math.floor(k * k / 5); set(x, y, P.rf3, RAKE); set(x, y + 1, WOOD[4], RAKE); set(x, y + 2, WOOD[1], RAKE); } }
    // chimney: rough stones, soot at the top
    for (let y = 22; y < 66; y++) for (let x = 124; x < 140; x++) {
      if (y > 66 - (x - 124) * .2) continue;
      const row = Math.floor((y - 22) / 5), ly = (y - 22) % 5, bw = 6 + Math.floor(hash(row, 0, 17) * 4), bx = (x + row * 3) % bw;
      let c = ly === 4 || bx === 0 ? P.st0 : x < 127 ? P.st4 : x > 136 ? P.st1 : P.st2;
      if (c !== P.st0 && hash(Math.floor((x + row * 3) / bw), row, 18) > .6) c = P.st3;
      if (y < 30) c = shadeC(c, .55 + (y - 22) * .05);
      set(x, y, c, FRONT);
    }
    for (let y = 16; y < 22; y++) for (let x = 123; x < 141; x++) set(x, y, y === 16 || x === 123 || x === 140 ? P.st1 : y > 19 ? P.st2 : C('#1d1a20'), UP);
    // porch: boards with gaps and wear, a front edge, steps, two posts, two pots of flowers
    for (let y = 154; y < 164; y++) for (let x = 38; x < w - 38; x++) { const id = Math.floor(x / 9); let c = x % 9 === 0 ? WOOD[0] : shadeC(y === 154 ? WOOD[2] : WOOD[4], .88 + hash(id, 3, 19) * .22); if (y < 157) c = shadeC(c, .78); set(x, y, c, UP); }
    for (let y = 164; y < 170; y++) for (let x = 38; x < w - 38; x++) set(x, y, y === 164 ? WOOD[5] : y > 168 ? WOOD[0] : WOOD[2], FRONT);
    for (let y = 170; y < 180; y++) for (let x = cx - 16; x <= cx + 16; x++) { const step = y < 174 ? 0 : 1, top = step === 0 ? y < 172 : y < 177; set(x, y, top ? WOOD[4] : (y === 173 || y === 179) ? WOOD[0] : WOOD[2], top ? UP : FRONT); }
    for (const px of [40, w - 42]) for (let y = 120; y < 164; y++) { set(px, y, WOOD[4], FRONT); set(px + 1, y, WOOD[1], FRONT); }
    for (const [px, fc] of [[54, '#ff8fb1'], [w - 58, '#ffd45c']]) {
      cylinder(set, px, 152, 159, 4.4, 1.6, (u, v, part) => part === 'top' ? (v > .55 ? C('#c9744a') : C('#3a2618')) : v < .12 ? C('#d08050') : u < -.4 ? C('#b8683e') : u < .45 ? C('#a85a36') : C('#7a3f24'), {width: v => 1 - v * .25});
      for (let k = 0; k < 14; k++) { const a = -Math.PI * (k / 13), r = 3 + (k % 3); set(px + Math.cos(a) * r, 151 + Math.sin(a) * r * .8, k % 4 === 0 ? C(fc) : k % 2 ? C('#4f9b45') : C('#3f8a3c')); }
    }
  }, {fy: 179, round: 3, shapes: [{t: 'box', x0: -64, x1: 64, y0: -84, y1: -25, h: 58}, {t: 'roof', x0: -80, x1: 80, y0: -90, y1: -22, h0: 58, h1: 112}, {t: 'box', x0: -54, x1: 54, y0: -25, y1: -10, h: 4}]});
}
/** A stack of firewood: round log ends with rings, piled in rows. */
// Split logs stacked 4-3-2, their cut ends toward us. Each log is a cylinder lying north-south: above its end the bark
// runs back (up the screen) with curved normals, so the top of the pile catches the sun and holds snow; the ends show
// pale wood with growth rings, a dark bark ring and the odd crack.
export function woodpile() {
  const D = 9, logs = [];
  for (const [row, n] of [[0, 4], [1, 3], [2, 2]]) for (let k = 0; k < n; k++) logs.push({cx: 6 + k * 8 + row * 4, cy: 31 - row * 6.5, s: k * 7 + row * 13 + 1});
  return object(42, 36, set => {
    // bark tops, lower rows first (the ones above lie over them)
    for (const L of logs) for (let y = Math.round(L.cy - D); y <= Math.round(L.cy); y++) for (let dx = -4; dx <= 4; dx++) {
      const t = Math.max(-1, Math.min(1, dx / 4)), a = Math.asin(t), back = y < L.cy - D + 1;
      const groove = hash(L.cx + dx, L.s, 5) > .62 && (y * 3 + L.s + dx) % 5 !== 0;
      const c = Math.abs(dx) === 4 ? '#3a2416' : back ? '#4a2f1e' : groove ? '#5e3d24' : dx < -1 ? '#9a6a40' : dx < 2 ? '#86593a' : '#6e4a2e';
      set(L.cx + dx, y, C(c), norm(Math.sin(a) * .9, .18, Math.cos(a) + .1));
    }
    // the cut ends, facing us
    for (const L of logs) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x / 1.08, y); if (d > 3.95) continue;
      const ring = Math.floor(d * 1.25 + hash(L.s, 1) * .9) % 2, crack = x === 0 && y > 0 && hash(L.s, 2) > .5;
      const c = d > 3.15 ? (y < -1 ? '#6a4428' : '#3e2718') : crack ? '#8a5f38' : d < .8 ? '#a8784a' : ring ? '#d9ae74' : '#c49660';
      set(L.cx + x, L.cy + y, C(c), norm(x * .05, 1, -y * .05));
    }
  }, {round: 2, shapes: [{t: 'box', x0: -20, x1: 20, y0: -D - 2, y1: 0, h: 18}]});
}
/** The side of a bridge or dock where its boards end: a beam facing us, plank ends above it. */
export function beam(len, deep = 6) {
  return object(len, deep, set => { for (let x = 0; x < len; x++) for (let y = 0; y < deep; y++) set(x, y, y === 0 ? P.r5 : y === deep - 1 ? P.r0 : (x % 7 === 0 && y < 3) ? P.r1 : y < 3 ? P.r3 : P.r2, [0, 1, 0]); }, {outline: false, fx: len / 2, fy: 0, shapes: []});
}
/** A pile standing in the water under a dock: a dark wet foot, wood above, a little cap. */
export function pile(h = 20) {
  return object(10, h + 2, set => cylinder(set, 5, 2, h - 1, 3.4, 1.4, (u, v, part) => part === 'top' ? (v > .6 ? P.r3 : P.r5) : v > 1 - 5 / h ? (u < 0 ? C('#2e4a4a') : C('#1f3434')) : u < -.5 ? P.r5 : u < .1 ? P.r4 : u < .6 ? P.r3 : P.r2), {outline: false, round: 3, fy: h, shapes: [{t: 'cyl', x: 0, y: -1, r: 3, h: h - 2}]});
}

/** A low rail for a bridge: short posts and one bar, so people on it stay in sight. */
export function lowPost() {
  return object(7, 14, set => { for (let y = 2; y < 13; y++) for (let x = 1; x < 6; x++) set(x, y, x === 1 ? P.r5 : x === 5 ? P.r1 : P.r3); for (let x = 0; x < 7; x++) set(x, 1, P.r5, [0, 0, 1]); }, {round: 3, shapes: [{t: 'cyl', x: 0, y: -1, r: 2.5, h: 11}]});
}
export function lowRail(len) {
  return object(len, 6, set => { for (let x = 0; x < len; x++) { set(x, 1, P.r5, [0, .3, .95]); set(x, 2, P.r3, [0, 1, 0]); set(x, 3, P.r1, [0, 1, 0]); } }, {outline: false, fx: len / 2, fy: 5, shapes: [{t: 'box', x0: -len / 2, x1: len / 2, y0: -1, y1: 0, h: 9}]});
}

/** A crop as it grows: 1 a sprout, 2 a young plant, 3 ripe (crop()). Stage 0 is seed in the soil, drawn with the soil. */
export function cropStage(kind, stage) {
  if (stage >= 3) return crop(kind);
  if (stage < 0) return object(18, 26, set => { // withered: grey-brown stalks bent over
    const a = C('#7a6046'), b = C('#a08566'), c = C('#5a4636');
    for (let k = 0; k < 7; k++) set(9, 23 - k, k < 3 ? c : a);
    for (const [dx, dy] of [[-1, -6], [-2, -5], [-3, -4], [-4, -3], [1, -7], [2, -6], [3, -6], [4, -5], [1, -3], [2, -2]]) set(9 + dx, 23 + dy, dy < -5 ? b : a);
  }, {round: 3, shapes: []});
  const leaf = C('#5fae4c'), light = C('#9ad466'), dark = C('#3f8a3c');
  return object(18, 26, set => {
    if (stage === 1) { for (let k = 0; k < 4; k++) set(9, 23 - k, dark); set(8, 20, leaf); set(7, 19, light); set(10, 20, leaf); set(11, 19, light); set(9, 19, light); }
    else {
      const h = kind === 2 ? 10 : 7;
      for (let k = 0; k < h; k++) set(9, 23 - k, k < 2 ? dark : leaf);
      for (const [dx, dy] of [[-1, -3], [-2, -4], [-3, -4], [1, -4], [2, -5], [3, -5], [-1, -6], [-2, -7], [1, -7], [2, -8]]) set(9 + dx, 23 + dy, dy < -5 ? light : leaf);
      if (kind === 0) { set(8, 23, C('#e8d8ea')); set(9, 23, C('#f3e9f4')); set(10, 23, C('#c46bb0')); }
      if (kind === 1) set(11, 18, C('#f6f2e8'));
    }
  }, {round: 3, shapes: []});
}

/** The shipping bin: a wooden chest with a slanted lid and iron bands; what goes in is sold overnight. */
export function shippingBin() {
  return object(30, 26, set => {
    const UP = [0, 0, 1], FRONT = [0, 1, 0], LID = [0, .5, .86];
    for (let y = 2; y < 9; y++) for (let x = 1; x < 29; x++) set(x, y, y === 2 ? P.r5 : x % 7 === 0 ? P.r2 : y < 5 ? P.r5 : P.r4, LID);
    for (let x = 1; x < 29; x++) { set(x, 9, P.r1, FRONT); set(x, 10, C('#4a4654'), FRONT); }
    for (let y = 11; y < 25; y++) for (let x = 2; x < 28; x++) { let c = x % 6 === 0 ? P.r2 : (x % 6 === 1 ? P.r5 : P.r4); if (y === 17 || y === 18) c = y === 17 ? C('#6a6a7a') : C('#4a4a58'); if (y > 22) c = P.r2; set(x, y, c, FRONT); }
    for (let y = 12; y < 16; y++) for (let x = 13; x < 17; x++) set(x, y, C('#d9b44a'), FRONT);
    set(14, 13, C('#7a5a20'), FRONT); set(15, 14, C('#7a5a20'), FRONT);
    void UP;
  }, {round: 3, shapes: [{t: 'box', x0: -14, x1: 14, y0: -8, y1: 0, h: 22}]});
}
