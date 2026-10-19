// 南极结界 · 宠物: the farm's companion — a cat, a dog or a little penguin, each in a few coats. Drawn in code from round
// parts (body, head, ears, legs, tail, flippers) so the light gives them volume like everything else; four ways of
// facing, a walk of four steps, sitting, and sleeping curled up. petSprite() returns an object like the world's things.
import {object, norm, poly, C, hash} from './assets.js';

export const PETS = {
  cat: {name: '猫', coats: [
    {name: '橘猫', main: '#e8913a', shade: '#b8642a', light: '#fbe2c0', mark: '#c06a2a', eye: '#3a5a2a', stripes: true},
    {name: '黑猫', main: '#2e2a33', shade: '#1e1a22', light: '#4a4452', eye: '#e8d04a'},
    {name: '奶牛猫', main: '#2e2a33', shade: '#1e1a22', light: '#f4f0e8', eye: '#4a8a3a', bib: true},
    {name: '灰狸花', main: '#8a8e9a', shade: '#666a76', light: '#d4d6dc', mark: '#5a5e6a', eye: '#4a8a3a', stripes: true},
    {name: '三花', main: '#f4f0e8', shade: '#cfc8bc', light: '#ffffff', mark: '#e8913a', mark2: '#2e2a33', eye: '#3a5a2a', patches: true}]},
  dog: {name: '狗', coats: [
    {name: '柴犬', main: '#d9893a', shade: '#a8622a', light: '#fbecd6', eye: '#2a1f1a', ears: 'up', tail: 'curl'},
    {name: '边牧', main: '#2e2a33', shade: '#1e1a22', light: '#f4f0e8', eye: '#3a2a20', ears: 'flop', tail: 'down', bib: true},
    {name: '金毛', main: '#e8b860', shade: '#b88a3a', light: '#fbe6b8', eye: '#3a2a20', ears: 'flop', tail: 'down'},
    {name: '雪橇犬', main: '#7a8290', shade: '#565c68', light: '#f4f4f6', eye: '#4a90d0', ears: 'up', tail: 'curl', mask: true}]},
  penguin: {name: '小企鹅', coats: [
    {name: '帝企鹅宝宝', main: '#9aa0aa', shade: '#747a86', light: '#f4f4f6', cap: '#2a2a32', eye: '#1a1a20', chick: true},
    {name: '阿德利企鹅', main: '#22252e', shade: '#15171d', light: '#f4f4f6', cap: '#22252e', eye: '#1a1a20', ring: true},
    {name: '小蓝企鹅', main: '#4a6a9a', shade: '#344c72', light: '#eef2f6', cap: '#4a6a9a', eye: '#1a1a20'}]},
};
const PINK = C('#f0a0a8'), NOSE = C('#3a2a2a'), BEAK = C('#f0a03a'), BEAK2 = C('#c8742a');

/** A pet as a thing of the world: kind 'cat' | 'dog' | 'penguin', a coat (index), facing 'down' | 'up' | 'left' |
 *  'right', a step 0–3, pose 'walk' | 'sit' | 'sleep'. */
export function petSprite(kind, coat = 0, {dir = 'down', step = 0, pose = 'walk'} = {}) {
  const species = PETS[kind] || PETS.cat, c = species.coats[coat % species.coats.length];
  const col = {main: C(c.main), shade: C(c.shade), light: C(c.light), mark: C(c.mark || c.shade), mark2: C(c.mark2 || c.shade), eye: C(c.eye), cap: C(c.cap || c.main)};
  const view = dir === 'left' || dir === 'right' ? 'side' : dir === 'up' ? 'back' : 'front';
  const W = 26, H = 24, draw = {cat, dog, penguin}[kind] || cat;
  const o = object(W, H, set => draw(set, c, col, view, step, pose), {round: 4, fx: 13, fy: 21, shapes: [{t: 'cyl', x: 0, y: -1, r: 5, h: 10}]});
  if (dir === 'right') { // the mirror of facing left
    const px = new Uint32Array(W * H), nrm = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = y * W + x, b = y * W + (W - 1 - x); px[b] = o.px[a]; nrm[b * 3] = -o.nrm[a * 3]; nrm[b * 3 + 1] = o.nrm[a * 3 + 1]; nrm[b * 3 + 2] = o.nrm[a * 3 + 2]; }
    return {...o, px, nrm, fx: W - o.fx};
  }
  return o;
}

// an ellipse filled pixel by pixel, the colour chosen per pixel
function ell(set, cx, cy, rx, ry, paint) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x + .5 - cx) / rx, v = (y + .5 - cy) / ry; if (u * u + v * v <= 1) { const c = paint(x, y, u, v); if (c) set(x, y, c); }
  }
}
const tri = (set, a, b, c, paint) => poly(set, [a, b, c], paint);
const legs = (set, list, top, bottom, col, paw) => { for (const [x, y0, near] of list) for (let y = Math.round(y0 ?? top); y <= bottom; y++) { set(x, y, y >= bottom - (paw ? 1 : 0) && paw ? paw : near ? col.main : col.shade); set(x + 1, y, y >= bottom - (paw ? 1 : 0) && paw ? paw : near ? col.shade : col.shade); } };
// walking: each leg's forward offset by the step (pairs opposite)
const stride = step => [0, 1.5, 0, -1.5][step & 3];
const lift = step => [0, 1, 0, 1][step & 3];

// ── the cat ───────────────────────────────────────────────────────────────────────────────────────────────────────
function cat(set, c, col, view, step, pose) {
  const fur = (x, y) => c.patches ? (hash(x >> 1, y >> 1, 3) > .72 ? col.mark : hash(x >> 1, y >> 1, 4) > .82 ? col.mark2 : col.main) : c.stripes && (x + Math.floor(y / 2)) % 4 === 0 ? col.mark : col.main;
  const tail = (pts, w = 1.3) => { for (let k = 0; k < pts.length - 1; k++) for (let t = 0; t <= 1; t += .15) { const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t; ell(set, x, y, w, w, (X, Y) => k === pts.length - 2 && t > .5 && c.stripes ? col.mark : fur(X, Y)); } };
  const ears = (l, r, inner = true) => {
    tri(set, l[0], l[1], l[2], () => col.main); tri(set, r[0], r[1], r[2], () => col.main);
    if (inner) { set(Math.round((l[0][0] + l[1][0] * 2) / 3), Math.round((l[0][1] + l[1][1] * 2) / 3), PINK); set(Math.round((r[0][0] + r[1][0] * 2) / 3), Math.round((r[0][1] + r[1][1] * 2) / 3), PINK); }
  };
  if (pose === 'sleep') { // curled into a loaf, the tail round the front, the head tucked on it
    ell(set, 14, 16.5, 7.5, 4, (x, y, u, v) => v > .55 ? col.shade : fur(x, y));
    tail([[21, 18], [17, 20], [11, 20], [7.5, 19]]);
    ell(set, 8, 15.5, 3.6, 3.1, (x, y) => fur(x, y));
    ears([[5.5, 14], [6, 10.5], [8, 13]], [[8.5, 12.5], [10.4, 10.6], [10.8, 14]], false);
    set(7, 16, col.shade); set(8, 16, col.shade); // a closed eye
    if (c.bib) ell(set, 7.5, 18, 1.8, 1, () => col.light);
    return;
  }
  if (view === 'side') {
    const s = stride(step), sit = pose === 'sit';
    if (sit) {
      tail([[16, 19.5], [20, 19.5], [21.5, 17.5]]);
      ell(set, 14, 15.5, 4.6, 4.8, (x, y, u, v) => u < -.4 && v > -.4 ? col.light : fur(x, y));
      legs(set, [[11, 16, true]], 16, 20, col, c.bib ? col.light : null);
      ell(set, 15.5, 19, 3, 1.4, (x, y) => fur(x, y));
    } else {
      tail([[18.5, 13], [20.5, 10], [21, 6.5], [20, 4.5]]);
      legs(set, [[9 - s, 15, false], [17 + s, 15, false]], 15, 20, col);
      ell(set, 13.5, 13.5, 6.4, 3.4, (x, y, u, v) => v > .5 && c.bib ? col.light : v > .62 ? col.shade : fur(x, y));
      legs(set, [[10 + s, 15, true], [16 - s, 15, true]], 15, 20 - (s ? 0 : 0), col, c.bib ? col.light : null);
    }
    const hy = sit ? 8.5 : 9.5;
    ears([[5.4, hy - 2.6], [5.8, hy - 6.4], [7.8, hy - 2.8]], [[8.4, hy - 3], [9.8, hy - 6.2], [10.6, hy - 2]]);
    ell(set, 8, hy, 3.8, 3.5, (x, y, u, v) => u < -.3 && v > .2 ? col.light : fur(x, y));
    set(5, hy, col.eye); set(5, hy - 1, C('#ffffff')); set(4, hy + 1, PINK);
    return;
  }
  const back = view === 'back', l = lift(step), sit = pose === 'sit';
  // body and legs (the far pair behind), the tail curling up beside
  if (!back) tail([[16.5, 17], [19, 15.5], [19.6, 12.5], [18.6, 10.5]]);
  ell(set, 13, sit ? 16 : 15.5, sit ? 4.8 : back ? 5.2 : 4.6, sit ? 4.4 : 3.8, (x, y, u, v) => !back && u > -.5 && u < .5 && v < .4 && (c.bib || !c.patches) ? (c.bib ? col.light : fur(x, y)) : fur(x, y));
  legs(set, [[10.5, 17, true], [14.5, 17, true]], 17, 20, col, c.bib && !back ? col.light : null);
  if (l && !sit) { set(step === 1 ? 10 : 14, 20, 0); set(step === 1 ? 11 : 15, 20, 0); }
  if (back) tail([[13, 18], [15.5, 17], [18, 14.5], [18.6, 11.5]]);
  if (back) { tri(set, [9, 9.5], [9.4, 4.6], [12, 7.6], () => col.shade); tri(set, [14, 7.6], [16.6, 4.6], [17, 9.5], () => col.shade); }
  else ears([[8.8, 9.5], [9.2, 4.4], [12, 7.8]], [[14, 7.8], [16.8, 4.4], [17.2, 9.5]]);
  ell(set, 13, 10, back ? 4 : 4.3, 3.8, (x, y, u, v) => back ? (v > .72 ? col.shade : fur(x, y)) : v > .25 && Math.abs(u) < .5 ? col.light : fur(x, y));
  if (!back) { for (const x of [11, 15]) { set(x, 10, col.eye); set(x, 9, C('#ffffff')); } set(13, 11, PINK); }
}

// ── the dog ───────────────────────────────────────────────────────────────────────────────────────────────────────
function dog(set, c, col, view, step, pose) {
  const fur = () => col.main, wag = Math.sin(step * Math.PI / 2) * 1.6;
  const curl = (cx, cy) => { ell(set, cx, cy, 2.6, 2.4, (x, y, u, v) => v < -.2 ? col.light : col.main); ell(set, cx + .4, cy + .3, 1.1, 1, () => col.shade); };
  const plume = pts => { for (let k = 0; k < pts.length - 1; k++) for (let t = 0; t <= 1; t += .15) ell(set, pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t, 1.5, 1.5, () => k ? col.light : col.main); };
  if (pose === 'sleep') {
    ell(set, 14, 16.5, 8.4, 4.2, (x, y, u, v) => v > .55 ? col.shade : col.main);
    plume([[22, 17], [19, 20], [14, 20.5]]);
    ell(set, 7.5, 15.5, 3.8, 3.2, () => col.main); ell(set, 4.6, 17, 2.2, 1.5, () => col.light); set(3, 16, NOSE);
    if (c.ears === 'flop') ell(set, 9.5, 15.5, 1.5, 2.6, () => col.shade); else tri(set, [7, 13], [8.4, 10.2], [10, 13], () => col.main);
    set(7, 15, col.shade); set(8, 15, col.shade);
    return;
  }
  if (view === 'side') {
    const s = stride(step), sit = pose === 'sit';
    if (c.tail === 'curl') curl(20.5, 9); else plume([[20.5, 12], [22.5, 14.5 + wag * .4], [23, 17]]);
    if (sit) { ell(set, 14.5, 15.5, 5, 5, (x, y, u, v) => u < -.4 && v > -.5 ? col.light : col.main); legs(set, [[11, 15, true]], 15, 20.5, col); ell(set, 16, 19.5, 3.6, 1.4, () => col.main); }
    else {
      legs(set, [[8.5 - s, 15, false], [18 + s, 15, false]], 15, 20.5, col);
      ell(set, 14, 13.5, 7.4, 3.8, (x, y, u, v) => u < -.5 && v > 0 && c.bib ? col.light : v > .6 ? col.light : col.main);
      legs(set, [[9.5 + s, 15, true], [17 - s, 15, true]], 15, 20.5, col, c.bib ? col.light : null);
    }
    const hy = sit ? 7.5 : 9;
    ell(set, 7.2, hy, 4, 3.7, (x, y, u, v) => c.mask && v > .2 ? col.light : col.main);
    ell(set, 3.6, hy + 1.6, 2.6, 1.7, () => col.light); set(1, hy + 1, NOSE); set(2, hy + 1, NOSE);
    set(5, hy - .5, col.eye); set(5, hy - 1.5, C('#ffffff'));
    if (c.ears === 'flop') ell(set, 9, hy + .8, 1.6, 3, () => col.shade); else tri(set, [6.6, hy - 2.6], [8, hy - 7], [10, hy - 2.2], () => col.main);
    return;
  }
  const back = view === 'back', l = lift(step), sit = pose === 'sit';
  if (!back) { if (c.tail === 'curl') curl(18.5 + wag * .3, 12); else plume([[17.5, 15], [19.6 + wag, 13], [20 + wag, 10.6]]); }
  ell(set, 13, sit ? 15.8 : 15, 5.4, sit ? 4.6 : 3.9, (x, y, u, v) => !back && Math.abs(u) < .45 && v < .5 && (c.bib || c.mask) ? col.light : col.main);
  legs(set, [[10.5, 17, true], [14.5, 17, true]], 17, 20.5, col, c.bib && !back ? col.light : null);
  if (l && !sit) { set(step === 1 ? 10 : 14, 20, 0); set(step === 1 ? 11 : 15, 20, 0); }
  if (back) { if (c.tail === 'curl') curl(14.5, 14.5); else plume([[13, 17], [15 + wag, 15], [16.5 + wag, 12.5]]); }
  if (c.ears === 'flop') { ell(set, 8.8, 10.2, 1.7, 3.1, () => col.shade); ell(set, 17.2, 10.2, 1.7, 3.1, () => col.shade); }
  else { tri(set, [9, 8.5], [9.6, 3.6], [12.2, 7], () => col.main); tri(set, [13.8, 7], [16.4, 3.6], [17, 8.5], () => col.main); }
  ell(set, 13, 9.6, 4.3, 3.9, (x, y, u, v) => back ? (v > .72 ? col.shade : col.main) : (c.mask ? v > -.1 && Math.abs(u) < .75 : v > .2 && Math.abs(u) < .45) ? col.light : col.main);
  if (c.ears === 'flop') { ell(set, 8.8, 10.4, 1.4, 2.7, () => col.shade); ell(set, 17.2, 10.4, 1.4, 2.7, () => col.shade); }
  if (!back) { for (const x of [11, 15]) { set(x, 9, col.eye); set(x, 8, C('#ffffff')); } ell(set, 13, 11.6, 1.8, 1.3, () => col.light); set(12.6, 11, NOSE); set(13.4, 11, NOSE); }
}

// ── the little penguin ──────────────────────────────────────────────────────────────────────────────────────────────
function penguin(set, c, col, view, step, pose) {
  const waddle = [0, -1, 0, 1][step & 3] * (pose === 'walk' ? 1 : 0), x0 = 13 + waddle * .6;
  const fluff = (x, y) => c.chick && hash(x, y, 9) > .82 ? col.shade : col.main;
  const feet = () => { for (const [x, k] of [[x0 - 2.5, 1], [x0 + 1.5, 3]]) { const up = pose === 'walk' && (step & 3) === k ? 1 : 0; for (let i = 0; i < 3; i++) set(x + i, 20 - up, i === 2 ? BEAK2 : BEAK); } };
  if (pose === 'sleep') { // lying down, beak tucked under a flipper
    ell(set, 13, 16.5, 7, 4, (x, y, u, v) => v > .1 && u > -.6 ? col.light : fluff(x, y));
    ell(set, 8, 14, 3.4, 3, (x, y) => c.chick ? col.cap : fluff(x, y));
    ell(set, 14, 14.5, 3.2, 1.6, () => col.shade); set(6, 14, col.shade); set(7, 14, col.shade);
    return;
  }
  if (view === 'side') {
    feet();
    ell(set, x0, 13, 4.4, 6.8, (x, y, u, v) => u < -.15 && v > -.5 ? col.light : fluff(x, y));
    ell(set, x0 + 1.2, 13.5, 1.6, 3.8, () => col.shade); // the flipper
    ell(set, x0 - .5, 6.8, 3.7, 3.4, (x, y, u, v) => c.chick && u < .1 && v > -.5 ? col.light : col.cap);
    if (c.ring) { set(Math.round(x0 - 2), 6, C('#ffffff')); set(Math.round(x0 - 2), 7, C('#ffffff')); }
    set(Math.round(x0 - 2), 6, col.eye);
    for (let i = 0; i < 3; i++) set(Math.round(x0 - 4 - i), 8, i ? BEAK : BEAK2);
    return;
  }
  const back = view === 'back';
  feet();
  for (const s of [-1, 1]) ell(set, x0 + s * 4.6, 13.5 + (pose === 'walk' ? -s * waddle * .5 : 0), 1.4, 3.6, () => col.shade);
  ell(set, x0, 13, 4.6, 6.8, (x, y, u, v) => !back && Math.abs(u) < .72 && v > -.45 ? col.light : fluff(x, y));
  ell(set, x0, 7, 3.9, 3.5, (x, y, u, v) => !back && c.chick && v > -.4 && Math.abs(u) < .8 ? col.light : col.cap);
  if (!back) {
    for (const x of [x0 - 1.6, x0 + 1.6]) { if (c.ring) { set(x, 6, C('#ffffff')); set(x, 8, C('#ffffff')); } set(x, 7, col.eye); }
    set(x0 - .5, 8.5, BEAK); set(x0 + .5, 8.5, BEAK2);
  }
}
void norm;
