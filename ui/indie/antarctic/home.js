// 南极结界 · 小屋里: the house inside, in the same 3/4 view as the farm. The ground floor is a log room (kitchen
// counter, stone fireplace, bookshelf, table, armchair, the ladder up); the attic is under the roof (the round window
// seen from outside, the bed, a desk, a telescope for the aurora, string lights, the hatch down). Each room is built
// once per season like the farm (albedo, normals, who stands where, what is solid) and lit for the hour here on the
// main thread — rooms are small: daylight from the windows, the fire always, lamps and candles after dusk.
import {object, disc, norm, cylinder, C, hash, noise, pack, unpack, barrel} from './assets.js';
import {shade, sunAt} from './light.js';
import {finish} from './farm.js';

const T = 16, UP = [0, 0, 1], FRONT = [0, 1, 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cs = list => list.map(C);
const WOOD = cs(['#2e1c12', '#4a2e1c', '#66402a', '#84573a', '#a06e48', '#bb8a5c']);
const LOGS = cs(['#3a2617', '#5a3b25', '#744d31', '#8a5d3c', '#a07048']);
const PLANK = cs(['#7c5434', '#8a5e3c', '#966844', '#a3744c']);
const STONE = cs(['#4e4846', '#68625f', '#827b77', '#9c9590', '#b5ada6']);
const SEASON_GROUND = cs(['#7cc35a', '#5aa648', '#d08a3a', '#9aa88a']);
const FLOWERS = [cs(['#ff8fb1', '#ffd2e0', '#fff1b8']), cs(['#ffd45c', '#ffffff', '#ff9a4a']), cs(['#d9572e', '#e8a33a', '#9a3a6a']), cs(['#2f6b3a', '#c8343c', '#f4f6fa'])];

// ── the rooms ────────────────────────────────────────────────────────────────────────────────────────────────────
// w, h in tiles; wall: how tall the back wall shows, in pixels
const ROOMS = {
  house: {w: 18, h: 12, wall: 60, build: buildHouse},
  attic: {w: 14, h: 9, wall: 52, build: buildAttic},
};
export function room(name, season = 0) {
  const def = ROOMS[name], W = def.w * T, H = def.h * T;
  const R = {name, W, H, wall: def.wall, season, F: new Uint32Array(W * H), N: new Float32Array(W * H * 3), Gy: new Float32Array(W * H), Z: new Float32Array(W * H),
    owner: new Int16Array(W * H).fill(-1), glow: new Uint8Array(W * H), solid: new Uint8Array(W * H), spots: [], lights: [], windows: [], candles: [], twinkles: [], things: [], fire: null, entry: {}};
  def.build(R, season);
  return R;
}

// a wall or floor pixel: where it stands (walls rise from the foot of the back wall)
function paint(R, x, y, c, n = UP, glow = 0) {
  x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= R.W || y >= R.H || !c) return;
  const i = y * R.W + x; R.F[i] = c; R.N.set(n, i * 3); R.glow[i] = glow;
  if (y < R.wall) { R.Gy[i] = R.wall; R.Z[i] = R.wall - y; } else { R.Gy[i] = y; R.Z[i] = 0; }
}
// a thing standing on the floor, its foot at (x, foot); block: the part one cannot walk through
function put(R, o, x, foot, {block = null} = {}) {
  const ox = Math.round(x - o.fx), oy = Math.round(foot - o.fy);
  for (let j = 0; j < o.h; j++) for (let k = 0; k < o.w; k++) {
    const c = o.px[j * o.w + k]; if (!c) continue;
    const X = ox + k, Y = oy + j; if (X < 0 || Y < 0 || X >= R.W || Y >= R.H) continue;
    const i = Y * R.W + X; R.F[i] = c; R.N.set(o.nrm.subarray((j * o.w + k) * 3, (j * o.w + k) * 3 + 3), i * 3);
    R.owner[i] = foot; R.Gy[i] = foot; R.Z[i] = Math.max(0, foot - Y); R.glow[i] = o.emit[j * o.w + k] === 1 ? 3 : o.emit[j * o.w + k];
  }
  if (block) { const [bw, bh] = block; for (let y = foot - bh; y < foot; y++) for (let X = Math.round(x - bw / 2); X < x + bw / 2; X++) if (X >= 0 && y >= 0 && X < R.W && y < R.H) R.solid[y * R.W + X] = 1; R.things.push({x, foot, w: bw}); }
  return {x: ox, y: oy};
}
const spot = (R, x, y, kind, say = '') => R.spots.push({x, y, kind, say});

// floor boards running across, a row every 7 pixels, the joints staggered; each board its own tone, fine grain
function floor(R, y0, tones = PLANK) {
  for (let y = y0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
    const row = Math.floor((y - y0) / 7), ly = (y - y0) % 7, seam = (x + row * 37) % 52 === 0;
    const board = Math.floor((x + row * 37) / 52), base = tones[Math.floor(hash(board, row, 3) * tones.length)];
    let c = base;
    if (ly === 0 || seam) c = C('#4a2f1c');
    else if (ly === 1) c = pack(unpack(base).map(v => v * 1.08));
    else if (hash(x >> 2, y, 5) > .86) c = pack(unpack(base).map(v => v * .9));
    if (!seam && ly === 3 && hash(board, row, 7) > .7 && x % 52 === 26) c = C('#5a3a24'); // a nail
    paint(R, x, y, c, UP);
  }
}
// round logs lying along the back wall, light chinking between them, log ends at the corners
function logWall(R, top, bottom) {
  const L = 9;
  for (let y = top; y < bottom; y++) for (let x = 0; x < R.W; x++) {
    const ly = (y - top) % L, v = (ly - (L - 1) / 2) / ((L - 1) / 2), a = Math.asin(clamp(v, -1, 1));
    const n = norm(0, Math.cos(a), -Math.sin(a) * .9);
    let c = ly === 0 ? C('#b9a585') : LOGS[clamp(Math.round(3.2 - v * 1.6 - (v > .6 ? 1 : 0)), 0, 4)];
    if (ly !== 0 && hash(x >> 1, Math.floor((y - top) / L), 9) > .93) c = LOGS[1]; // knots and checks
    if (ly !== 0 && (x * 7 + y * 3) % 23 === 0) c = LOGS[2];
    paint(R, x, y, c, ly === 0 ? FRONT : n);
  }
}
// a window in the wall: a wooden frame and sill, four panes showing the sky and the season outside (lit by day),
// curtains drawn back
function wallWindow(R, x0, y0, w, h, season, curtain = '#b7564a') {
  R.windows.push({x0, x1: x0 + w, y0, y1: y0 + h});
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const fx = x - x0, fy = y - y0, edge = fx < 3 || fx >= w - 3 || fy < 3 || fy >= h - 3, mull = Math.abs(fx - w / 2) < 1 || Math.abs(fy - h / 2) < 1;
    if (edge || mull) { paint(R, x, y, fx < 2 || fy < 2 ? WOOD[4] : WOOD[2], FRONT); continue; }
    const t = (fy - 3) / (h - 6), ground = fy > h - 7;
    const sky = pack([150 + t * 40, 205 + t * 20, 236 - t * 6]);
    paint(R, x, y, ground ? SEASON_GROUND[season] : sky, FRONT, 1);
  }
  for (let x = x0 - 2; x < x0 + w + 2; x++) { paint(R, x, y0 + h, WOOD[5], UP); paint(R, x, y0 + h + 1, WOOD[3], FRONT); paint(R, x, y0 + h + 2, WOOD[1], FRONT); }
  const cur = C(curtain), dark = pack(unpack(cur).map(v => v * .7));
  for (const side of [-1, 1]) for (let y = y0 - 3; y < y0 + h + 6; y++) for (let k = 0; k < 6; k++) {
    const x = side < 0 ? x0 - 3 + k : x0 + w - 3 + k; if (y > y0 + h - 2 && (side < 0 ? k > 3 : k < 2)) continue;
    paint(R, x, y, (k + (y >> 2)) % 3 === 0 ? dark : cur, norm(side * (k < 3 ? -.4 : .4), 1, 0));
  }
  for (let x = x0 - 5; x < x0 + w + 5; x++) paint(R, x, y0 - 4, C('#2a2a32'), FRONT); // the rod
}

// ── things in the rooms ───────────────────────────────────────────────────────────────────────────────────────────
function counter() {
  return object(62, 40, set => {
    // a kettle on the stove, bread on a board
    disc(set, 44, 6, 4.2, C('#a85a2c')); disc(set, 43, 5, 2.6, C('#d07a42')); set(42, 4, C('#f2b27a')); for (let k = 0; k < 4; k++) set(49 + k, 5 - k * .5, C('#8a4822'));
    set(44, 1, C('#5a3a24')); set(43, 1, C('#5a3a24'));
    for (let y = 8; y < 18; y++) for (let x = 1; x < 61; x++) set(x, y, y === 8 ? WOOD[5] : hash(x >> 2, y, 11) > .85 ? WOOD[3] : WOOD[4], UP);
    for (let y = 9; y < 16; y++) for (let x = 36; x < 58; x++) set(x, y, C('#3a3a44'), UP);
    for (const [cx, cy] of [[41, 12], [52, 13]]) disc(set, cx, cy, 2.6, C('#1e1e26'), .7, UP);
    for (let y = 10; y < 15; y++) for (let x = 5; x < 20; x++) set(x, y, C('#c9a06a'), UP);
    disc(set, 11, 11, 3.4, C('#d89a4a'), .6, UP); disc(set, 10, 10, 1.6, C('#f0c27a'), .6, UP);
    // the front: cupboard doors in frames, brass knobs, a dark kick at the floor
    for (let y = 18; y < 40; y++) for (let x = 1; x < 61; x++) {
      const door = Math.floor((x - 1) / 20), lx = (x - 1) % 20, frame = lx < 2 || lx > 17 || y < 21 || y > 35;
      set(x, y, y > 36 ? WOOD[0] : y === 18 ? WOOD[1] : frame ? WOOD[3] : lx < 4 || y < 23 ? WOOD[2] : (door % 2 ? WOOD[3] : WOOD[2]), FRONT);
    }
    for (const x of [16, 23, 44]) { set(x, 27, C('#e8c25a'), FRONT); set(x, 28, C('#9a7a2a'), FRONT); }
  }, {round: 2, fx: 31, fy: 39, shapes: []});
}
function fireplace() {
  return object(62, 72, set => {
    const stone = (x0, y0, x1, y1, seed) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const row = Math.floor((y - y0) / 7), off = row % 2 ? 5 : 0, col = Math.floor((x - x0 + off) / 10), ly = (y - y0) % 7, lx = (x - x0 + off) % 10;
        if (ly === 0 || lx === 0) { set(x, y, C('#3a3432'), FRONT); continue; }
        const tone = STONE[1 + Math.floor(hash(col, row, seed) * 3)], n = norm(lx === 1 ? -.35 : lx === 9 ? .35 : 0, 1, ly === 1 ? .45 : ly === 6 ? -.4 : 0);
        set(x, y, ly === 1 ? pack(unpack(tone).map(v => v * 1.12)) : ly === 6 ? pack(unpack(tone).map(v => v * .82)) : tone, n);
      }
    };
    stone(9, 0, 53, 36, 1); // the chimney breast up to the ceiling
    for (let y = 34; y < 41; y++) for (let x = 2; x < 60; x++) set(x, y, y < 36 ? WOOD[5] : y > 39 ? WOOD[1] : WOOD[3], y < 36 ? UP : FRONT); // the mantel
    // candles on the mantel (lit after dusk) and a jar
    for (const cx of [9, 52]) { for (let y = 27; y < 34; y++) { set(cx, y, C('#f2e8cf'), FRONT); set(cx + 1, y, C('#d9cbb0'), FRONT); } set(cx, 25, C('#ffd27a'), FRONT, true); set(cx, 26, C('#ff9a3a'), FRONT, true); }
    for (let y = 26; y < 34; y++) for (let x = 27; x < 35; x++) set(x, y, y < 28 ? C('#7a4a2a') : (x === 28 ? C('#a8d8d0') : C('#5f9e98')), FRONT);
    stone(4, 41, 58, 66, 2);
    // the firebox: an arched opening, soot, two logs, embers that always glow (the flames are drawn live)
    for (let y = 46; y < 66; y++) for (let x = 15; x < 47; x++) {
      const arch = y < 52 && Math.hypot((x - 31) / 16, (y - 52) / 6) > 1; if (arch) continue;
      set(x, y, y > 61 ? C('#2a1a12') : C('#140e0c'), FRONT);
    }
    for (const [x0, x1, y] of [[18, 44, 62], [21, 41, 60]]) for (let x = x0; x < x1; x++) { set(x, y, C('#4a2e1c'), UP); set(x, y + 1, C('#2e1c12'), FRONT); }
    for (let k = 0; k < 26; k++) { const x = 18 + Math.floor(hash(k, 1, 61) * 26), y = 59 + Math.floor(hash(k, 2, 61) * 5); set(x, y, hash(k, 3, 61) > .5 ? C('#ff7a2a') : C('#ffb24a'), UP, 2); }
    for (let y = 66; y < 72; y++) for (let x = 0; x < 62; x++) set(x, y, y === 66 ? STONE[4] : y < 69 ? STONE[3] : STONE[1], y < 69 ? UP : FRONT); // the hearth
  }, {outline: false, fx: 31, fy: 71, shapes: []});
}
function bookshelf(seed = 1) {
  const books = cs(['#8a2f35', '#2f5a7a', '#3f7a46', '#c9a04a', '#6a3f7a', '#b8643a', '#e6dccb', '#3a3a4a']);
  return object(32, 58, set => {
    for (let y = 2; y < 58; y++) for (let x = 0; x < 32; x++) {
      const side = x < 2 || x > 29;
      set(x, y, side ? (x === 0 || x === 31 ? WOOD[1] : WOOD[3]) : y < 6 ? (y < 4 ? WOOD[5] : WOOD[3]) : WOOD[0], y < 4 && !side ? UP : FRONT);
    }
    for (const sy of [19, 33, 47]) for (let x = 2; x < 30; x++) { set(x, sy, WOOD[4], UP); set(x, sy + 1, WOOD[2], FRONT); }
    for (const [base, top] of [[18, 7], [32, 21], [46, 35]]) {
      let x = 2, k = 0;
      while (x < 29) {
        const w = 2 + Math.floor(hash(k, base, seed) * 2), h = Math.min(base - top, 7 + Math.floor(hash(k, base + 1, seed) * 5)), c = books[Math.floor(hash(k, base + 2, seed) * books.length)];
        if (hash(k, base + 3, seed) > .88) { x += 3; k++; continue; } // a gap
        for (let y = base - h + 1; y <= base; y++) for (let i = 0; i < w && x + i < 30; i++) set(x + i, y, i === 0 ? pack(unpack(c).map(v => v * 1.15)) : y === base - h + 3 ? C('#e8d8a8') : c, FRONT);
        x += w; k++;
      }
    }
    // a small plant on top
    for (let y = 0; y < 3; y++) for (let x = 22; x < 28; x++) set(x, y + 0, C('#b8643a'), FRONT);
    disc(set, 25, 1, 2.4, C('#4f9a48'));
  }, {round: 2, fx: 16, fy: 57, shapes: []});
}
function ladder(h = 70) {
  return object(18, h, set => {
    for (let y = 0; y < h; y++) for (const x0 of [1, 13]) { set(x0, y, WOOD[2], FRONT); set(x0 + 1, y, WOOD[4], FRONT); set(x0 + 2, y, WOOD[3], FRONT); set(x0 + 3, y, WOOD[1], FRONT); }
    for (let y = 6; y < h - 2; y += 8) for (let x = 5; x < 13; x++) { set(x, y, WOOD[5], UP); set(x, y + 1, WOOD[2], FRONT); }
  }, {outline: false, fx: 9, fy: h - 1, shapes: []});
}
function table(season) {
  return object(46, 40, set => {
    // a vase of what the season has (pine and berries in winter) and a candle
    cylinder(set, 20, 4, 11, 2.8, 1.1, (u, v, part) => part === 'top' ? C('#2a3a4a') : u < -.3 ? C('#9cc4e4') : u < .4 ? C('#5a8ec2') : C('#3f6a9a'), {width: v => 1 + Math.sin(v * Math.PI) * .25});
    const fl = FLOWERS[season];
    for (let k = 0; k < 12; k++) { const a = hash(k, 1, 71) * Math.PI * 2, r = 1 + hash(k, 2, 71) * 4; set(20 + Math.cos(a) * r * 1.3, 0 + Math.sin(a) * r * .7, fl[k % fl.length]); }
    for (let y = 4; y < 10; y++) { set(32, y, C('#f2e8cf'), FRONT); set(33, y, C('#d9cbb0'), FRONT); } set(32, 2, C('#ffd27a'), FRONT, true); set(32, 3, C('#ff9a3a'), FRONT, true);
    for (let y = 8; y < 29; y++) for (let x = 1; x < 45; x++) {
      const d = Math.hypot((x - 23) / 21.5, (y - 18) / 10);
      if (d <= 1) set(x, y, d > .93 ? WOOD[2] : Math.floor(d * 7 + hash(x >> 3, y, 3) * .6) % 2 ? WOOD[4] : WOOD[5], UP);
    }
    for (let y = 18; y < 31; y++) for (let x = 1; x < 45; x++) { const top = 18 + 10 * Math.sqrt(Math.max(0, 1 - ((x - 23) / 21.5) ** 2)); if (y > top && y <= top + 3) set(x, y, y > top + 2 ? WOOD[1] : WOOD[3], FRONT); }
    cylinder(set, 23, 35.5, 37.5, 8.5, 2.4, (u, v, part) => part === 'top' ? WOOD[3] : WOOD[1]); // the round foot
    cylinder(set, 23, 28, 35, 3, 1, (u) => u < -.3 ? WOOD[3] : u < .4 ? WOOD[2] : WOOD[1], {lid: false}); // the pedestal
  }, {round: 2, fx: 23, fy: 39, shapes: []});
}
function stool() {
  return object(14, 18, set => {
    for (let y = 8; y < 18; y++) for (const [x, lean] of [[3, -1], [11, 1], [7, 0]]) set(x + (y > 12 ? lean : 0), y + (x === 7 ? 1 : 0), x === 7 ? WOOD[1] : WOOD[2], FRONT);
    cylinder(set, 7, 4, 6.5, 6.2, 2.8, (u, v, part) => part === 'top' ? (v < .35 ? WOOD[5] : WOOD[4]) : u < -.3 ? WOOD[3] : WOOD[2]); // the seat, its edge bending round
  }, {round: 2, fx: 7, fy: 17, shapes: []});
}
function armchair() {
  const f = cs(['#5e2a2e', '#7e3a3c', '#9e4c4a', '#b8605a']);
  return object(32, 32, set => {
    for (let y = 4; y < 26; y++) for (let x = 4; x < 28; x++) { const r = Math.hypot((x - 16) / 12, (y - 10) / 9); if (y < 10 && r > 1) continue; set(x, y, (x + y * 3) % 11 === 0 ? f[0] : f[2]); }
    for (const [x0, x1] of [[0, 6], [26, 32]]) for (let y = 12; y < 30; y++) for (let x = x0; x < x1; x++) set(x, y, y < 14 ? f[3] : f[1]);
    for (let y = 26; y < 31; y++) for (let x = 2; x < 30; x++) set(x, y, f[0]);
    // a striped throw over the back
    for (let y = 3; y < 11; y++) for (let x = 6; x < 26; x++) { if (y > 8 && (x * 7) % 5 === 0) continue; set(x, y, Math.floor(x / 3) % 2 ? C('#efe2c8') : C('#c9a04a')); }
  }, {round: 5, fx: 16, fy: 30, shapes: []});
}
function floorLamp() {
  return object(16, 48, set => {
    cylinder(set, 8, 44, 46, 5, 1.8, (u, v, part) => part === 'top' ? C('#4a4452') : C('#2a2632'));
    for (let y = 13; y < 45; y++) { set(7, y, C('#5a5462'), FRONT); set(8, y, C('#2e2a34'), FRONT); }
    // the shade: a cone, wider below, its hem bending round the front; it glows when lit
    for (let y = 1; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = (y - 2) / 11, hw = 3 + v * 4.2, u = (x + .5 - 8) / hw; if (Math.abs(u) > 1) continue;
      const arc = 1.6 * Math.sqrt(1 - u * u); if (y < 2 + arc * .4 || y > 13 + arc) continue;
      set(x, y, y > 12 + arc ? C('#c9a46a') : u < -.2 ? C('#f6e2b4') : C('#e8cc94'), norm(u, .8, .2), true);
    }
  }, {round: 2, fx: 8, fy: 46, shapes: []});
}
function plant(seed = 1) {
  const leaf = cs(['#24552a', '#2f6b34', '#3f8a40', '#5aa850', '#7cc35a']);
  return object(20, 30, set => {
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (hash(k, seed, 1) - .5) * 2.4, len = 7 + hash(k, seed, 2) * 6; for (let r = 0; r < len; r++) set(10 + Math.cos(a) * r, 19 + Math.sin(a) * r, leaf[1]); disc(set, 10 + Math.cos(a) * len, 19 + Math.sin(a) * len, 2.6, leaf[2 + (k % 3)]); }
    cylinder(set, 10, 20, 27, 6, 2.2, (u, v, part) => part === 'top' ? (v > .6 ? C('#d07a4a') : C('#3a2618')) : v < .15 ? C('#d8865a') : u < -.4 ? C('#c0643a') : u < .4 ? C('#a8542e') : C('#8a4426'), {width: v => 1 - v * .22});
  }, {round: 3, fx: 10, fy: 29, shapes: []});
}
function chest(strap = '#6a6a7a') {
  return object(30, 24, set => {
    for (let y = 1; y < 10; y++) for (let x = 1; x < 29; x++) set(x, y, y < 3 ? WOOD[5] : (x * 5) % 9 === 0 ? WOOD[2] : WOOD[4], norm(0, .5, .8));
    for (let y = 10; y < 24; y++) for (let x = 1; x < 29; x++) set(x, y, y === 10 ? WOOD[1] : y > 21 ? WOOD[1] : (x * 5) % 9 === 0 ? WOOD[2] : WOOD[3], FRONT);
    for (const x0 of [5, 22]) for (let y = 1; y < 24; y++) for (let x = x0; x < x0 + 3; x++) set(x, y, x === x0 ? C('#9a9aaa') : C(strap), y < 10 ? norm(0, .5, .8) : FRONT);
    for (let y = 9; y < 14; y++) for (let x = 13; x < 17; x++) set(x, y, y === 11 && x === 14 ? C('#5a4210') : C('#e0b84a'), FRONT);
  }, {round: 2, fx: 15, fy: 23, shapes: []});
}
function bed() {
  const quilt = cs(['#c25a4e', '#e8b04a', '#5a8ec2', '#7cae5a', '#e6dccb', '#9a6ab8']);
  return object(46, 66, set => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 46; x++) { const post = x < 4 || x > 41; if (!post && y < 4 + Math.abs(x - 23) * .1) continue; set(x, y, post ? (x === 0 || x === 45 ? WOOD[1] : WOOD[3]) : y < 6 ? WOOD[5] : (x % 6 === 0 ? WOOD[2] : WOOD[4]), y < 6 && !post ? UP : FRONT); }
    for (let y = 14; y < 26; y++) for (let x = 6; x < 40; x++) { const r = Math.hypot((x - 23) / 17, (y - 20) / 6); if (r <= 1) set(x, y, r > .8 ? C('#d9d2c2') : C('#f4f0e6')); }
    for (let y = 24; y < 56; y++) for (let x = 2; x < 44; x++) {
      const fold = y < 28, sq = quilt[(Math.floor((x - 2) / 7) + Math.floor((y - 28) / 7) * 2) % quilt.length], seam = !fold && ((x - 2) % 7 === 0 || (y - 28) % 7 === 0);
      set(x, y, fold ? (y === 24 ? C('#ffffff') : C('#efe8d8')) : seam ? pack(unpack(sq).map(v => v * .78)) : sq, x < 4 || x > 41 ? norm(x < 4 ? -.7 : .7, .2, .7) : UP);
    }
    for (let y = 55; y < 66; y++) for (let x = 0; x < 46; x++) set(x, y, y === 55 ? WOOD[5] : x < 4 || x > 41 ? WOOD[3] : y > 63 ? WOOD[1] : WOOD[2], y === 55 ? UP : FRONT);
  }, {outline: true, round: 2, fx: 23, fy: 65, shapes: []});
}
function nightstand() {
  return object(18, 24, set => {
    for (let y = 0; y < 6; y++) { set(9, y + 1, C('#f2e8cf'), FRONT); set(10, y + 1, C('#d9cbb0'), FRONT); }
    set(9, -1 + 1, C('#ffd27a'), FRONT, true);
    for (let y = 7; y < 11; y++) for (let x = 1; x < 17; x++) set(x, y, y < 8 ? WOOD[5] : WOOD[4], UP);
    for (let y = 11; y < 24; y++) for (let x = 1; x < 17; x++) set(x, y, y === 11 || y > 21 ? WOOD[1] : y === 16 ? WOOD[1] : WOOD[3], FRONT);
    set(8, 13, C('#e0b84a'), FRONT); set(8, 19, C('#e0b84a'), FRONT);
  }, {round: 2, fx: 9, fy: 23, shapes: []});
}
function desk() {
  return object(44, 34, set => {
    for (let y = 4; y < 12; y++) { set(36, y, C('#f2e8cf'), FRONT); set(37, y, C('#d9cbb0'), FRONT); } set(36, 3, C('#ffd27a'), FRONT, true); set(36, 2, C('#fff1b8'), FRONT, true);
    for (let y = 10; y < 18; y++) for (let x = 2; x < 42; x++) set(x, y, y === 10 ? WOOD[5] : WOOD[4], UP);
    for (let y = 11; y < 16; y++) for (let x = 8; x < 26; x++) set(x, y, x === 17 ? C('#c9b48a') : x < 17 ? C('#f4ecd8') : C('#e8dcc0'), UP); // an open notebook
    for (let k = 0; k < 4; k++) set(10 + k * 1.6, 12 + (k % 2), C('#6a5a4a'), UP);
    disc(set, 30, 13, 1.6, C('#2a2a3a'), .8, UP); set(31, 10, C('#e8e0d0')); set(32, 9, C('#e8e0d0'));
    for (let y = 18; y < 34; y++) for (let x = 2; x < 42; x++) { const leg = x < 6 || x > 37; if (!leg && y > 24) continue; set(x, y, y === 18 ? WOOD[1] : leg ? WOOD[2] : WOOD[3], FRONT); }
    set(21, 21, C('#e0b84a'), FRONT);
  }, {round: 2, fx: 22, fy: 33, shapes: []});
}
function telescope() {
  return object(26, 38, set => {
    for (const [x1, y1] of [[4, 37], [22, 37], [13, 36]]) for (let k = 0; k <= 16; k++) set(13 + (x1 - 13) * k / 16, 21 + (y1 - 21) * k / 16, WOOD[3]);
    for (let k = 0; k < 20; k++) { const x = 5 + k * .8, y = 20 - k * .9; for (let t = -2; t <= 2; t++) set(x + t * .7, y + t * .6, k % 7 === 0 ? C('#6a4a1a') : t < 0 ? C('#e8c26a') : C('#b8902a'), norm(.3, .6, .7)); }
    disc(set, 21, 2, 2.6, C('#2a3a4a'));
    for (let t = -1; t <= 1; t++) set(4 + t, 22 + t, C('#3a3a44'));
  }, {round: 2, fx: 13, fy: 37, shapes: []});
}

// ── the ground floor ─────────────────────────────────────────────────────────────────────────────────────────────
function buildHouse(R, season) {
  const {W, H, wall} = R;
  floor(R, wall);
  logWall(R, 6, wall);
  for (let y = 0; y < 6; y++) for (let x = 0; x < W; x++) paint(R, x, y, y < 4 ? WOOD[1] : WOOD[0], FRONT); // the ceiling beam
  // a braided round rug before the fire
  for (let y = wall; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - 144) / 56, (y - 124) / 26); if (d > 1) continue;
    const ring = Math.floor(d * 9), c = d > .94 ? '#5a2424' : ['#c9a04a', '#7e2f2f', '#a8443f', '#2f5a7a', '#a8443f', '#7e2f2f', '#d9b44a', '#a8443f', '#5a2424'][ring];
    paint(R, x, y, (x + y) % 4 === 0 ? pack(unpack(C(c)).map(v => v * .86)) : C(c), UP);
  }
  // the mat inside the door
  for (let y = H - 18; y < H - 4; y++) for (let x = W / 2 - 15; x < W / 2 + 15; x++) paint(R, x, y, (x + y) % 3 ? C('#8a7a52') : C('#6e5e3a'), UP);
  // on the walls: a window over the counter, a shelf of jars, herbs drying, the clock, a second window
  wallWindow(R, 20, 14, 32, 26, season);
  for (let x = 58; x < 84; x++) { paint(R, x, 26, WOOD[5], UP); paint(R, x, 27, WOOD[2], FRONT); }
  for (const [x, c] of [[61, '#c46b3a'], [68, '#5f9e98'], [75, '#d9b44a']]) for (let y = 18; y < 26; y++) for (let k = 0; k < 5; k++) paint(R, x + k, y, y < 20 ? C('#7a4a2a') : k === 1 ? C('#f4f0e6') : C(c), FRONT);
  for (const [x, c] of [[62, '#5aa850'], [70, '#9a7de8'], [78, '#7cae5a']]) for (let k = 0; k < 9; k++) { paint(R, x + (k % 3) - 1, 31 + k, C(c), FRONT); if (k < 3) paint(R, x, 29 + k, C('#a07a4a'), FRONT); }
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = Math.hypot(x, y); if (d > 7.5) continue; paint(R, 100 + x, 24 + y, d > 6.2 ? WOOD[2] : C('#f4ecd8'), FRONT); }
  for (let k = 0; k < 5; k++) { paint(R, 100, 24 - k, C('#2a2020'), FRONT); if (k < 4) paint(R, 100 + k, 24, C('#2a2020'), FRONT); }
  for (let y = 32; y < 46; y++) paint(R, 100, y, C('#c9a04a'), FRONT); for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1]]) paint(R, 100 + dx, 47 + dy, C('#e0b84a'), FRONT);
  wallWindow(R, 180, 14, 30, 26, season, '#3f6a8a');
  // the ceiling hatch the ladder goes up through
  for (let y = 0; y < 6; y++) for (let x = 257; x < 277; x++) paint(R, x, y, C('#140c08'), FRONT);
  // side walls (thick trims) and the front wall's top, with the doorway in it
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const side = x < 8 || x >= W - 8, front = y >= H - 6 && Math.abs(x - W / 2) > 16;
    if (!side && !front) continue;
    paint(R, x, y, (side ? x === 7 || x === W - 8 : y === H - 6) ? WOOD[3] : WOOD[1], UP);
  }
  // things
  put(R, counter(), 46, 76, {block: [60, 12]});
  put(R, barrel(), 90, 74, {block: [16, 8]});
  const fp = put(R, fireplace(), 144, 75, {block: [60, 12]});
  R.fire = {x: 144, y: fp.y + 60, w: 26};
  R.candles.push([fp.x + 9, fp.y + 25], [fp.x + 52, fp.y + 25]);
  put(R, bookshelf(3), 230, 72, {block: [32, 10]});
  put(R, ladder(70), 267, 70, {block: [18, 8]});
  const tb = put(R, table(season), 70, 132, {block: [40, 10]});
  put(R, stool(), 44, 136, {block: [12, 5]});
  put(R, stool(), 96, 136, {block: [12, 5]});
  R.candles.push([tb.x + 32, tb.y + 2]);
  put(R, armchair(), 176, 112, {block: [30, 10]});
  put(R, floorLamp(), 202, 106, {block: [10, 5]});
  put(R, plant(2), 20, 100, {block: [14, 6]});
  put(R, plant(5), 266, 160, {block: [14, 6]});
  put(R, chest(), 30, 176, {block: [28, 8]});
  // walls and edges are solid; the doorway is open
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y < wall + 5 || x < 9 || x >= W - 9 || (y >= H - 6 && Math.abs(x - W / 2) > 15)) R.solid[i] = 1;
  }
  R.lights.push({x: 144, y: 70, z: 10, r: 170, c: [1, .62, .3], k: 1.35, fire: true}, {x: 202, y: 104, z: 40, r: 120, c: [1, .78, .5], k: 1.3, night: true},
    {x: 72, y: 128, z: 18, r: 80, c: [1, .7, .4], k: .8, night: true}, {x: 144, y: 72, z: 40, r: 90, c: [1, .72, .44], k: .5, night: true});
  spot(R, 267, 72, 'up');
  spot(R, 144, 78, 'say', '炉火噼啪作响，屋里暖暖的。');
  spot(R, 46, 78, 'say', '灶台上的水壶还是温的。');
  spot(R, 90, 76, 'say', '木桶里是腌好的结界萝卜。');
  spot(R, 230, 74, 'say', '书架上是农事手册、航海图，还有几本翻旧了的故事书。');
  spot(R, 30, 178, 'say', '储物箱，现在还空着。');
  spot(R, 70, 134, 'say', '餐桌上插着' + ['春天的花', '夏天的花', '秋天的红叶', '一枝挂着红果的松枝'][season] + '。');
  spot(R, 176, 114, 'say', '在扶手椅上坐了一会儿，听着炉火。');
  R.entry = {door: [W / 2, H - 14, 'up'], ladder: [252, 84, 'down']};
  R.exitY = H - 7;
}

// ── the attic ───────────────────────────────────────────────────────────────────────────────────────────────────
function buildAttic(R, season) {
  const {W, H, wall} = R, cx = W / 2, slope = .44;
  floor(R, wall, cs(['#8a6444', '#94704c', '#9e7a52', '#856040']));
  // the gable wall in boards, the round window in it; the roof's underside slanting down on both sides
  for (let y = 0; y < wall; y++) for (let x = 0; x < W; x++) {
    const ridge = 4 + Math.abs(x - cx) * slope;
    if (y >= ridge) { const lx = x % 9; paint(R, x, y, lx === 0 ? WOOD[1] : lx === 1 ? WOOD[5] : (hash(x >> 3, y >> 2, 21) > .8 ? WOOD[3] : WOOD[4]), FRONT); continue; }
    const t = y + Math.abs(x - cx) * slope, side = x < cx ? -1 : 1, seam = Math.floor(t) % 7 === 0;
    paint(R, x, y, seam ? WOOD[0] : WOOD[2], norm(-side * .45, .5, -.7));
  }
  for (const bx of [40, W - 40]) for (let y = 0; y < wall; y++) for (let k = 0; k < 5; k++) if (y >= 4 + Math.abs(bx - cx) * slope - 1) paint(R, bx + k - 2, y, k === 0 ? WOOD[4] : WOOD[2], FRONT); // posts
  // the round window
  R.windows.push({x0: cx - 12, x1: cx + 12, y0: 12, y1: 36, round: true});
  for (let y = 10; y < 38; y++) for (let x = cx - 14; x < cx + 14; x++) {
    const d = Math.hypot(x + .5 - cx, y + .5 - 24); if (d > 13.5) continue;
    if (d > 10.5) { paint(R, x, y, d > 12.5 ? WOOD[1] : WOOD[4], FRONT); continue; }
    if (Math.abs(x + .5 - cx) < 1 || Math.abs(y + .5 - 24) < 1) { paint(R, x, y, WOOD[2], FRONT); continue; }
    paint(R, x, y, y > 30 ? SEASON_GROUND[season] : pack([150 + (y - 13) * 2, 205, 236]), FRONT, 1);
  }
  for (let x = cx - 9; x < cx + 9; x++) { paint(R, x, 38, WOOD[5], UP); paint(R, x, 39, WOOD[2], FRONT); }
  // string lights along under the roof
  for (let x = 30; x <= W - 30; x++) {
    const y = 34 + Math.sin((x - 30) / (W - 60) * Math.PI) * 8; paint(R, x, y, C('#2a2a2a'), FRONT);
    if ((x - 30) % 11 === 5) { const c = [C('#ffd27a'), C('#ffb0c8'), C('#b8f0ff'), C('#fff1b8')][((x - 30) / 11 | 0) % 4]; for (const [dx, dy] of [[0, 1], [0, 2], [1, 1], [1, 2]]) paint(R, x + dx, y + dy, c, FRONT, 3); R.twinkles.push([x, y + 1]); }
  }
  // a rag rug, the hatch down (an opening with the ladder's top in it)
  for (let y = wall; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - 108) / 34, dy = Math.abs(y - 100) / 15; if (dx > 1 || dy > 1) continue;
    const ring = Math.min(4, Math.floor(Math.max(dx, dy) * 5)); paint(R, x, y, C(['#5a8ec2', '#e6dccb', '#c25a4e', '#e6dccb', '#3f6a8a'][ring]), UP);
  }
  const hx = 182, hy = 116;
  for (let y = hy - 9; y < hy + 9; y++) for (let x = hx - 13; x < hx + 13; x++) {
    const edge = Math.abs(x - hx) > 11 || Math.abs(y - hy) > 7;
    paint(R, x, y, edge ? (y < hy - 7 ? WOOD[1] : WOOD[3]) : C('#120c08'), edge && y >= hy + 7 ? FRONT : UP);
  }
  for (let y = hy - 7; y < hy + 8; y++) for (const x of [hx - 7, hx + 6]) { paint(R, x, y, WOOD[3], FRONT); paint(R, x + 1, y, WOOD[2], FRONT); }
  for (let y = hy - 5; y < hy + 7; y += 5) for (let x = hx - 6; x < hx + 6; x++) paint(R, x, y, WOOD[4], UP);
  // low knee walls under the slopes, the floor's edge at the front
  for (let y = wall; y < H; y++) for (let x = 0; x < W; x++) {
    const side = x < 14 || x >= W - 14, front = y >= H - 6;
    if (!side && !front) continue;
    const t = side ? (x < 14 ? x : W - 1 - x) : 0;
    paint(R, x, y, front ? (y === H - 6 ? WOOD[3] : WOOD[1]) : t === 13 ? WOOD[4] : (y % 7 === 0 ? WOOD[0] : WOOD[2]), side ? norm(x < 14 ? .5 : -.5, .4, .75) : UP);
  }
  // things
  put(R, bed(), 64, 112, {block: [44, 56]});
  const ns = put(R, nightstand(), 28, 74, {block: [16, 8]});
  R.candles.push([ns.x + 9, ns.y]);
  put(R, telescope(), 146, 68, {block: [16, 6]});
  const dk = put(R, desk(), 176, 76, {block: [42, 10]});
  put(R, stool(), 176, 90, {block: [10, 4]});
  R.candles.push([dk.x + 36, dk.y + 2]);
  put(R, chest('#8a5a3a'), 36, 132, {block: [28, 8]});
  put(R, plant(7), 112, 62, {block: [12, 5]});
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < wall + 5 || x < 15 || x >= W - 15 || y >= H - 6 || (Math.abs(x - hx) < 14 && Math.abs(y - hy) < 9)) R.solid[y * W + x] = 1;
  R.lights.push({x: 28, y: 72, z: 30, r: 90, c: [1, .7, .4], k: 1.0, night: true}, {x: 190, y: 72, z: 30, r: 100, c: [1, .72, .44], k: 1.0, night: true},
    {x: cx, y: 64, z: 46, r: 170, c: [1, .78, .62], k: .8, night: true});
  spot(R, 64, 116, 'bed');
  spot(R, hx, hy - 2, 'down');
  spot(R, 146, 72, 'scope');
  spot(R, 176, 80, 'say', '摊开的笔记本上写着：明天要浇水，还要去信箱看看。');
  spot(R, 36, 134, 'say', '旧行李箱，贴满了各个港口的邮票。');
  spot(R, cx, 58, 'say', ['窗外的田野开满了小花。', '窗外的树叶绿得发亮。', '窗外的树叶都红了。', '窗外的草地上结了一层薄霜。'][season]);
  R.entry = {hatch: [hx - 22, hy + 4, 'right'], bed: [92, 104, 'down']};
}

// ── light ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Light a room for an hour (a generator, like the farm's). Afterwards R has px, light, shadow (none inside), sun, lamps. */
export function* lightRoom(R, hour, season = R.season) {
  const {W, H, F, N, Gy, Z, glow, owner, wall} = R, s = sunAt(hour, season);
  const dusk = s.night ? 1 : clamp((s.hour - 17.4) / 1.6, 0, 1), dawn = clamp((s.hour - 6) / 1.2, 0, 1);
  const day = clamp((s.sky[0] + s.sky[1] + s.sky[2]) / 1.4, 0, 1) * (1 - dusk * .7);
  // inside, the "sun" is the window light: soft, from the back wall and above; no cast shadows (night: true)
  const sun = {hour: s.hour, L: norm(.15, -.55, .82), sun: s.sun.map((v, k) => v * .22 + s.sky[k] * .35), sky: s.sky.map((v, k) => v * .5 + [.12, .1, .09][k]), up: 0, night: true, golden: 0, inside: true};
  const lamps = R.lights.map(l => ({...l, k: l.k * (l.night ? Math.max(dusk, 1 - dawn) : 1) * (l.fire ? 1 + dusk * .3 : 1)})).filter(l => l.k > .02);
  // shade at the walls' feet and under things
  const ao = new Float32Array(W * H).fill(1);
  for (let y = wall; y < Math.min(H, wall + 14); y++) for (let x = 0; x < W; x++) ao[y * W + x] *= .62 + .38 * (y - wall) / 14;
  for (const t of R.things) for (let y = t.foot - 6; y < t.foot + 7; y++) for (let x = Math.round(t.x - t.w / 2 - 5); x < t.x + t.w / 2 + 5; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = Math.hypot((x - t.x) / (t.w / 2 + 5), (y - t.foot) / 6); if (d < 1) ao[y * W + x] *= .55 + .45 * d;
  }
  yield;
  // daylight falls in a slanting patch below each window, moving with the hour
  const pool = new Float32Array(W * H), skew = Math.cos(clamp((s.hour - 6) / 13.5, 0, 1) * Math.PI) * -.5;
  for (const w of R.windows) for (let y = wall; y < Math.min(H, wall + 64); y++) {
    const d = y - wall, fall = (1 - d / 64) ** 1.4, x0 = w.x0 + d * skew - d * .15, x1 = w.x1 + d * skew + d * .15;
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x1); x++) { const e = Math.min(1, (x - x0) / 4, (x1 - x) / 4); pool[y * W + x] = Math.max(pool[y * W + x], fall * e); }
  }
  const out = new Float32Array(W * H * 3), light = new Float32Array(W * H * 3), n = [0, 0, 0], ONE = [1, 1, 1], emitted = new Float32Array(W * H);
  const winC = s.sun.map((v, k) => v * .5 + s.sky[k] * .8);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, a = unpack(F[i]); if (!F[i]) continue;
      n[0] = N[i * 3]; n[1] = N[i * 3 + 1]; n[2] = N[i * 3 + 2];
      const [lr, lg, lb] = shade(ONE, n, x, Gy[i], Z[i], 1, sun, lamps), k = owner[i] < 0 ? ao[i] : 1, p = owner[i] < 0 ? pool[i] * day * 1.4 : 0;
      light[i * 3] = lr * k + winC[0] * p; light[i * 3 + 1] = lg * k + winC[1] * p; light[i * 3 + 2] = lb * k + winC[2] * p;
      let r = a[0] * light[i * 3], g = a[1] * light[i * 3 + 1], b = a[2] * light[i * 3 + 2];
      const gl = glow[i];
      if (gl === 1) { // a window: the outside, bright by day, deep blue at night with a green breath of aurora
        const nightC = [18 + 20 * Math.max(0, Math.sin(x / 9 + y / 5)), 40 + 50 * Math.max(0, Math.sin(x / 7)), 70];
        const k2 = .45 + day * 1.25; r = lerp(a[0] * k2, nightC[0], dusk); g = lerp(a[1] * k2, nightC[1], dusk); b = lerp(a[2] * k2, nightC[2], dusk); emitted[i] = day * .5;
      } else if (gl === 2) { r = a[0] * 1.5; g = a[1] * 1.3; b = a[2]; emitted[i] = 1; }
      else if (gl === 3) { const k2 = Math.max(dusk, 1 - dawn); if (k2 > 0) { const lum = .8 + (a[0] + a[1] + a[2]) / 765 * .4; r = lerp(r, 330 * lum, k2); g = lerp(g, 260 * lum, k2); b = lerp(b, 150 * lum, k2); emitted[i] = k2; } }
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
    }
    if (y % 8 === 7) yield;
  }
  // a soft glow round what shines, worked out at half size
  const W2 = W >> 1, H2 = H >> 1, bright = new Float32Array(W2 * H2 * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, e = emitted[i]; if (!e) continue; const j = ((y >> 1) * W2 + (x >> 1)) * 3; bright[j] += out[i * 3] * .3 * e; bright[j + 1] += out[i * 3 + 1] * .25 * e; bright[j + 2] += out[i * 3 + 2] * .18 * e; }
  blur(bright, W2, H2, 3); blur(bright, W2, H2, 3); blur(bright, W2, H2, 2);
  yield;
  const px = new Uint32Array(W * H), BG = pack([12, 11, 18]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 && y % 16 === 15) yield;
    const i = y * W + x; if (!F[i]) { px[i] = BG; continue; }
    const j = ((y >> 1) * W2 + (x >> 1)) * 3; px[i] = finish(out[i * 3] + bright[j] * 1.6, out[i * 3 + 1] + bright[j + 1] * 1.6, out[i * 3 + 2] + bright[j + 2] * 1.6, x, y, sun);
  }
  Object.assign(R, {px, light, shadow: new Float32Array(W * H), sun, lamps, hour, day, dusk});
}
const lerp = (a, b, t) => a + (b - a) * t;
function blur(A, W, H, R) {
  const B = new Float32Array(A.length), n = R * 2 + 1;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < H; y++) { let run = 0; for (let x = -R; x < W + R; x++) { const a = x + R, b = x - R - 1; if (a < W) run += A[(y * W + a) * 3 + c]; if (b >= 0) run -= A[(y * W + b) * 3 + c]; if (x >= 0 && x < W) B[(y * W + x) * 3 + c] = run / n; } }
    for (let x = 0; x < W; x++) { let run = 0; for (let y = -R; y < H + R; y++) { const a = y + R, b = y - R - 1; if (a < H) run += B[(a * W + x) * 3 + c]; if (b >= 0) run -= B[(b * W + x) * 3 + c]; if (y >= 0 && y < H) A[(y * W + x) * 3 + c] = run / n; } }
  }
}
void noise;
