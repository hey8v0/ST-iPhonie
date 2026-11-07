// 南极结界 · 鲸湾城: the port city west of the farm, where the road from the farm ends. A half-moon bay at the bottom of
// the map (the city faces the sea), the forested slope above; a round stone plaza in the middle with a fountain, the
// market stall, benches and the bulletin board; streets to the east (the farm), west (houses, the 见闻收购行), north
// (the 知识库总馆 on its rise) and south (the quay, the pier, the icebreaker moored beside it). Wood and stone
// buildings with attics, as 鲸湾 builds. Drawn like the farm and the shore: terrain pixel by pixel, things as objects
// with normals and shapes for their shadows, lamps and windows that light up at dusk. The residents (people.js) stand
// at the named places here.
import {insideDistance} from './light.js';
import {object, cylinder, poly, norm, C, hash, noise, pine, oak, bush, rock, lamp, barrel, crate, flowerbed, fencePost, fenceRail, beam, pile} from './assets.js';

const T = 16, TW = 68, TH = 42, W = TW * T, H = TH * T;
const pack = ([r, g, b]) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
const dim = (c, k) => { const [r, g, b] = unpack(c); return pack([r * k, g * k, b * k]); };
const cs = list => list.map(C);
const FRONT = [0, 1, 0], UP = [0, 0, 1];

// materials: 1 grass, 2 path, 5 sand, 6 sea, 8 forest, 10 boards, 17 stone pavement (the plaza, the quay, the steps)
const GRASS = [cs(['#2e5824', '#3f722c', '#548c35', '#73a843', '#9bc957']), cs(['#2c6422', '#3a7c2a', '#4f9632', '#6cb43e', '#93d050']), cs(['#5a5422', '#76702e', '#928a3c', '#ae9f4a', '#c9b45e']), cs(['#4a5a3e', '#5c7048', '#6e8656', '#869c68', '#a0b47e'])];
const SAND = cs(['#b8955a', '#d0b071', '#ddc286', '#e8d29e']), SEA = cs(['#79dccb', '#4ec4c2', '#2aa6b8', '#1c8aa8', '#156f94', '#0f5a82']);
const PAVE = cs(['#6a6a72', '#8a8a92', '#9c9ca4', '#aeaeb6', '#c0c0c6']), JOINT = C('#4e4e56');

// ── the lie of the land ─────────────────────────────────────────────────────────────────────────────────────────────
/** The shore of the bay: lowest (furthest up the screen) in the middle, a half moon. */
const shoreY = tx => 34.5 - 4.2 * Math.sin(Math.max(0, Math.min(1, (tx - 4) / 60)) * Math.PI);
const plazaR = 7.2, PLAZA = [34, 20];
function tileAt(tx, ty) {
  const n = noise(tx * 16, ty * 16, 90, 3);
  if (ty < 3 + Math.round(n * 1.6)) return '#';
  const sy = shoreY(tx);
  if (ty >= sy) return (tx >= 33 && tx <= 35 && ty < 39) ? 'b' : 'S';           // the sea, the pier out into it
  if (ty >= sy - 3) return tx >= 5 && tx <= 62 ? 'q' : 's';                          // the quay along the water
  if (Math.hypot((tx - PLAZA[0]) / 1.05, ty - PLAZA[1]) < plazaR) return 'q';        // the plaza
  const street = (ty === 20 || ty === 21) || ((tx === 33 || tx === 34) && ((ty >= 9 && ty < 14) || (ty >= 26 && ty < sy - 3)))
    || ((tx === 17 || tx === 18) && ty >= 22 && ty < 27) || ((tx === 49 || tx === 50) && ty >= 22 && ty < 27) || ((tx === 10 || tx === 11) && ty >= 12 && ty < 20) || ((tx === 56 || tx === 57) && ty >= 12 && ty < 20);
  if (street) return 'p';
  if (ty < 5 + Math.round(n * 2)) return '#';
  return 'g';
}
const MAT = {g: 1, p: 2, s: 5, S: 6, '#': 8, b: 10, q: 17};
const HARD = new Set(['#', 'b', 'q']);
function material(x, y) {
  const t = tileAt(x / T | 0, y / T | 0);
  if (HARD.has(t)) return t;
  const dx = (noise(x, y, 11, 1) - .5) * 10, dy = (noise(x, y, 11, 2) - .5) * 10, u = tileAt((x + dx) / T | 0, (y + dy) / T | 0);
  return HARD.has(u) ? t : u;
}
/** Stone flags: big irregular slabs with dark joints, each its own tone; worn lighter in the middle of the plaza. */
function flag(x, y, seed) {
  const cw = 13, ch = 9, row = Math.floor(y / ch), off = (row % 2) * 6, col = Math.floor((x + off) / cw), lx = (x + off) % cw, ly = y % ch;
  const joint = lx === 0 || ly === 0 || (lx === cw - 1 && hash(col, row, seed) > .7);
  const id = hash(col, row, seed + 1), base = PAVE[1 + Math.floor(id * 3)];
  return {joint, c: joint ? JOINT : (lx === 1 || ly === 1) ? dim(base, 1.08) : base, id};
}

function terrain(season) {
  const B = new Uint32Array(W * H), mat = new Uint8Array(W * H), CN = new Float32Array(W * H * 3), cliffFoot = new Int16Array(W), WD = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mat[y * W + x] = MAT[material(x, y)];
  const at = (x, y) => mat[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const g = GRASS[season];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i], n = noise(x, y, 24) * .55 + noise(x, y, 7, 3) * .45, r = hash(x, y, 7);
    let c = 0;
    CN[i * 3 + 2] = 1;
    if (m === 1) { c = n < .28 ? g[1] : n < .6 ? g[2] : n < .82 ? g[3] : g[4]; if (r > .99) c = g[0]; }
    else if (m === 2) { c = n < .3 ? C('#7c4f2e') : n < .62 ? C('#9a6639') : n < .85 ? C('#b98048') : C('#d39d60'); if (r > .975) c = C('#e2c492'); }
    else if (m === 5) { c = n < .35 ? SAND[1] : n < .75 ? SAND[2] : SAND[3]; if (r > .99) c = C('#fff8ea'); }
    else if (m === 8) { c = n < .5 ? C('#0c2219') : C('#133325'); }
    else if (m === 17) {
      const f = flag(x, y, 5); c = f.c;
      if (!f.joint) { const worn = Math.hypot((x - PLAZA[0] * T) / 1.05, y - PLAZA[1] * T) / (plazaR * T); if (worn < 1) c = dim(c, 1 + (1 - worn) * .08); if (hash(x, y, 9) > .985) c = PAVE[4]; if (noise(x, y, 5, 12) > .76 && f.id > .5) c = dim(c, .9); }
      if (at(x, y + 1) === 6 || at(x, y + 2) === 6) { c = y + 1 < H && at(x, y + 1) === 6 ? C('#3a3a42') : C('#52525a'); CN[i * 3 + 1] = .8; CN[i * 3 + 2] = .6; } // the quay's edge into the water
    }
    else if (m === 10) { const plank = Math.floor(x / 5), wood = cs(['#5e4630', '#7a5c3c', '#8e6c48', '#a07c54']); c = x % 5 === 0 ? wood[0] : y % 24 === 0 ? wood[1] : wood[2 + (plank + (y >> 4)) % 2]; if (hash(x, y, 8) > .97) c = wood[3]; }
    B[i] = c;
  }
  // the sea: deepening away from the quay and the sand; the pier's piles cast dark into it
  const WDF = insideDistance(i => mat[i] === 6, W, H, 14);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (mat[i] !== 6) continue;
    const d = Math.max(1, Math.round(WDF[i])); WD[i] = d;
    const dd = d + (noise(x, y, 6, 19) - .5) * 3 + Math.max(0, y - 34 * T) / 16;
    let c = SEA[Math.min(5, Math.max(0, Math.floor(dd / 2.4)))];
    if (dd < 4 && noise(x, y, 4, 20) > .64) c = C('#a8e6cf');
    if ((at(x, y - 1) === 17 || at(x, y - 1) === 5 || at(x, y - 1) === 10) && hash(x, y, 19) > .25) c = C('#e8fff8'); // foam at the wall and the sand
    B[i] = c;
  }
  // grass detail
  for (let i = 0; i < 1400; i++) {
    const x = 3 + hash(i, 1, 31) * (W - 6) | 0, y = 3 + hash(i, 2, 31) * (H - 6) | 0;
    if (at(x, y) !== 1 || at(x, y + 3) !== 1 || at(x + 3, y) !== 1 || at(x - 3, y) !== 1) continue;
    for (const [dx, h, c] of [[-1, 3, g[3]], [0, 4, g[4]], [1, 3, g[2]]]) for (let k = 0; k < h; k++) B[(y - k) * W + x + dx] = k === h - 1 ? c : g[1];
  }
  // flowers in the grass of the plaza's surroundings (not in winter)
  if (season < 3) for (let i = 0; i < 160; i++) {
    const x = hash(i, 5, 35) * W | 0, y = 6 * T + hash(i, 6, 35) * 24 * T | 0; if (at(x, y) !== 1 || at(x, y - 1) !== 1) continue;
    const c = [C('#ff8fb1'), C('#ffd45c'), C('#ffffff'), C('#b79cff')][i % 4]; B[y * W + x] = c; B[(y - 1) * W + x] = C('#3f8a3c');
  }
  return {B, mat, CN, cliffFoot, WD, tideE: null};
}

// ── buildings ────────────────────────────────────────────────────────────────────────────────────────────────────────
const WOOD = cs(['#3f2a1c', '#5a3d29', '#715036', '#8a6443', '#a17a54', '#b99168']);
const STONE = cs(['#3e3a3c', '#5a5658', '#76726f', '#8e8a84', '#a8a49c', '#c0bcb4']);
const ROOFS = {red: cs(['#4a1e1c', '#6e2c26', '#8e3c32', '#a84c3c', '#c66450', '#dc7a60']), slate: cs(['#1e2430', '#2c3444', '#3c4658', '#4c586c', '#5e6a7e', '#74809a']),
  green: cs(['#1c3424', '#264632', '#325a40', '#3e6e4c', '#4e845c', '#64986e']), tan: cs(['#4a3820', '#66502c', '#826838', '#9c8046', '#b49856', '#c8ac6a'])};
const GLASS = cs(['#5f8fa8', '#8fc4d8', '#d8f4ff']), IRON = C('#2e2a33'), LANT = C('#ffd57a');
/**
 * A building seen from its front, in 3/4: a wall of boards or stone, a roof of two slopes with the ridge away from
 * us, eaves, windows (glass lit at dusk), a door with a step, a lantern, a sign with a picture over the door, a
 * dormer with a round window when it has an attic (as 鲸湾's houses do), a chimney. w: its width; wall: 'wood' or
 * 'stone'; roof: a ROOFS name; sign: 'book' | 'coin' | 'compass' | 'bell' | 'cross' | 'anchor' | 'cup' | '' .
 */
export function building({w = 120, wallH = 52, roofH = 40, wall = 'wood', roof = 'red', sign = '', attic = true, windows = 2, lantern = true, chimney = true, arch = false, flag = false, bell = false} = {}) {
  const h = wallH + roofH + 36, cx = w / 2, eaveY = roofH + 10, apex = 8, back = Math.round(roofH * .55), eaveL = 6, eaveR = w - 6;
  const wallTop = eaveY - 2, wallBot = wallTop + wallH, R = ROOFS[roof] || ROOFS.red;
  const rake = x => apex + Math.abs(x - cx) * (eaveY - apex) / (cx - eaveL);
  const WEST = norm(-.72, .1, .68), EAST = norm(.72, .1, .68), RAKE = norm(0, .75, .66);
  const boards = (x, y, x0, top, bottom) => {
    const width = 7, id = Math.floor((x - x0) / width), lx = (x - x0) % width, tone = .86 + hash(id, 0, 7) * .26;
    let k = lx === 0 ? 0 : lx === 1 ? 4 : lx < 4 ? 3 : 2;
    if (lx > 1 && noise(x * 4, y / 5, 3, id) > .72) k = Math.max(1, k - 1);
    let c = dim(WOOD[k], tone);
    const low = (y - top) / Math.max(1, bottom - top); if (low > .85) c = dim(c, .82); if (low > .92 && noise(x, y, 4, 9) > .55) c = C('#4f6338');
    return c;
  };
  const stones = (x, y, top) => {
    const course = Math.floor((y - top) / 6), bw = 10 + Math.floor(hash(course, x >> 4, 11) * 6), bx = (x + course * 7) % bw, ly = (y - top) % 6;
    if (ly === 5 || bx === 0) return noise(x, y, 3, 12) > .74 ? C('#4f6338') : STONE[0];
    const id = hash(Math.floor((x + course * 7) / bw), course, 13); let c = id < .3 ? STONE[2] : id < .7 ? STONE[3] : STONE[4];
    if (ly === 0) c = dim(c, 1.1); if (ly === 4) c = dim(c, .9); if (hash(x, y, 14) > .985) c = STONE[5];
    return c;
  };
  return object(w, h, set => {
    // the wall, darker under the eaves, a stone footing
    for (let y = wallTop; y < wallBot; y++) for (let x = 6; x < w - 6; x++) {
      let c = wall === 'stone' ? stones(x, y, wallTop) : boards(x, y, 6, wallTop, wallBot - 8);
      if (wall !== 'stone' && y >= wallBot - 8) c = stones(x, y, wallBot - 8);
      if (x === 6 || x === w - 7) c = dim(c, .6); else if (x < 8 || x >= w - 8) c = dim(c, .85);
      if (y < wallTop + 6) c = dim(c, .6 + (y - wallTop) * .06);
      set(x, y, c, FRONT);
    }
    // the gable above the wall, between the slopes (boards across)
    for (let y = apex; y < wallTop; y++) for (let x = 6; x < w - 6; x++) {
      if (y < rake(x) + 3) continue;
      const ly = (y - apex) % 5, row = Math.floor((y - apex) / 5), tone = .86 + hash(row, x >> 4, 14) * .24;
      let c = wall === 'stone' ? stones(x, y, apex) : dim(ly === 0 ? WOOD[1] : ly === 1 ? WOOD[5] : WOOD[4], tone);
      if (y < rake(x) + 7) c = dim(c, .7);
      set(x, y, c, FRONT);
    }
    // the roof: two slopes, tiles in courses, moss; the ridge; the eave boards
    const tiles = (x, y, side) => {
      const u = side < 0 ? x - eaveL : eaveR - x, v = y - rake(x) + back, course = Math.floor(u / 7), lu = u % 7;
      const row = Math.floor((v + (course % 2) * 4) / 8), lv = (v + (course % 2) * 4) % 8, edge = lv === 7, top = lv === 0;
      let c = lu === 0 ? R[1] : edge ? R[0] : top ? R[5] : lu < 3 ? R[4] : lu < 5 ? R[3] : R[2];
      if (!edge && lu) c = dim(c, .84 + hash(course, row, 5) * .3);
      if (!edge && noise(x, y, 10, 15) > .7 && hash(course, row, 16) > .4) c = dim(C('#56703e'), .8 + (lu < 3 ? .3 : 0));
      return c;
    };
    poly(set, [[cx, apex - back], [cx, apex], [eaveL, eaveY], [eaveL, eaveY - back]], (x, y) => tiles(x, y, -1), WEST);
    poly(set, [[cx, apex - back], [cx, apex], [eaveR, eaveY], [eaveR, eaveY - back]], (x, y) => tiles(x, y, 1), EAST);
    for (let y = apex - back - 2; y < apex + 1; y++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, Math.abs(x - cx) === 3 ? R[0] : (y % 6 === 0) ? R[1] : x < cx ? R[5] : R[3], UP);
    for (let x = eaveL; x <= eaveR; x++) { const y0 = Math.round(rake(x)); for (let k = 0; k < 4; k++) set(x, y0 + k, k === 0 ? R[5] : k < 2 ? WOOD[4] : k === 2 ? WOOD[2] : WOOD[0], RAKE); }
    // the dormer: a little roof of its own on the near slope, a round window in it
    if (attic) {
      const dx = cx - 1 - Math.round(w * .22), dy = Math.round(rake(dx) - back * .3), dw = 22, dh = 18;
      for (let y = dy; y < dy + dh; y++) for (let x = dx - dw / 2; x < dx + dw / 2; x++) { const edge = Math.abs(x - dx) > dw / 2 - 2; set(x, y, edge ? WOOD[1] : wall === 'stone' ? stones(x, y, dy) : boards(x, y, dx - dw / 2, dy, dy + dh), FRONT); }
      for (let x = dx - dw / 2 - 3; x <= dx + dw / 2 + 3; x++) { const y0 = dy - 4 + Math.abs(x - dx) * .35; for (let k = 0; k < 4; k++) set(x, y0 + k, k < 2 ? R[4] : k === 2 ? R[2] : WOOD[0], RAKE); }
      for (let y = dy + 3; y < dy + 15; y++) for (let x = dx - 6; x <= dx + 6; x++) { const d = Math.hypot(x - dx, y - dy - 9); if (d > 5.6) continue; const frame = d > 4.4 || Math.abs(x - dx) < .6; set(x, y, frame ? WOOD[1] : (x - dx) + (y - dy - 9) < -2 ? GLASS[1] : GLASS[0], FRONT, !frame); }
    }
    // the chimney: stone, soot on top
    if (chimney) for (let y = apex + 4; y < apex + 30; y++) for (let x = w - 34; x < w - 22; x++) { if (y > rake(x) + 8) continue; set(x, y, y < apex + 7 ? (y === apex + 4 ? STONE[4] : C('#1d1a20')) : stones(x, y, apex), y < apex + 7 ? UP : FRONT); }
    // windows along the wall: frames, glass (lit at dusk), a sill with flowers; arched in stone, shuttered in wood
    const wn = Math.max(1, windows), gap = (w - 12) / (wn + 1);
    for (let k = 1; k <= wn; k++) {
      const wx = Math.round(6 + gap * k), ww = arch ? 14 : 18, wh = arch ? 24 : 20, y0 = wallTop + 10;
      for (let y = y0; y < y0 + wh; y++) for (let x = wx - ww / 2; x < wx + ww / 2; x++) {
        if (arch && y < y0 + ww / 2 && (x - wx) ** 2 + (y - y0 - ww / 2) ** 2 > (ww / 2) ** 2) continue;
        const frame = Math.abs(x - wx) >= ww / 2 - 1.5 || y === y0 || y >= y0 + wh - 2 || (!arch && (Math.abs(x - wx) < 1 || y === y0 + wh / 2)) || (arch && y < y0 + ww / 2 && (x - wx) ** 2 + (y - y0 - ww / 2) ** 2 > (ww / 2 - 1.5) ** 2);
        let c = frame ? (wall === 'stone' ? STONE[1] : WOOD[1]) : (x - wx) + (y - y0) < 4 ? GLASS[2] : (x - wx - (y - y0)) % 8 === 0 ? GLASS[1] : GLASS[0];
        set(x, y, c, FRONT, !frame);
      }
      if (!arch) for (const sx of [wx - ww / 2 - 6, wx + ww / 2 + 1]) for (let y = y0 - 1; y < y0 + wh + 1; y++) for (let x = sx; x < sx + 5; x++) set(x, y, x === sx ? WOOD[0] : (y - y0) % 4 === 0 ? WOOD[1] : WOOD[3], FRONT);
      for (let x = wx - ww / 2 - 2; x <= wx + ww / 2 + 1; x++) { set(x, y0 + wh, WOOD[5], UP); set(x, y0 + wh + 1, WOOD[2], FRONT); }
      for (let j = 0; j < Math.floor(ww / 3); j++) { const x = wx - ww / 2 + 1 + j * 3, c = [C('#ff8fb1'), C('#ffd45c'), C('#ffffff')][j % 3]; set(x, y0 + wh - 1, c); set(x + 1, y0 + wh, C('#3f8a3c')); }
    }
    // the door, a step before it, a lantern beside it, the sign above
    const dw = 20, d0 = wallBot - 30;
    for (let y = d0; y < wallBot; y++) for (let x = cx - dw / 2; x <= cx + dw / 2; x++) {
      const top = y < d0 + 8 && (x - cx) ** 2 / (dw / 2) ** 2 + (y - d0 - 8) ** 2 / 64 > 1; if (top) continue;
      const frame = Math.abs(x - cx) > dw / 2 - 2 || (y < d0 + 8 && (x - cx) ** 2 / (dw / 2 - 2) ** 2 + (y - d0 - 8) ** 2 / 36 > 1);
      let c = frame ? WOOD[0] : boards(x, y, cx - dw / 2, d0, wallBot), glow = false;
      if (!frame && (y === d0 + 16 || y === d0 + 24)) c = IRON;
      if (!frame && y > d0 + 6 && y < d0 + 13 && Math.abs(x - cx) < 4) { c = GLASS[1]; glow = true; }
      set(x, y, c, FRONT, glow);
    }
    set(cx + 5, d0 + 20, LANT, FRONT); set(cx + 5, d0 + 21, C('#b88a2a'), FRONT);
    for (let x = cx - dw / 2 - 4; x <= cx + dw / 2 + 4; x++) { set(x, wallBot, STONE[4], UP); set(x, wallBot + 1, STONE[4], UP); set(x, wallBot + 2, STONE[2], FRONT); set(x, wallBot + 3, STONE[1], FRONT); }
    if (lantern) {
      const lx = cx + dw / 2 + 10;
      for (let y = d0 - 2; y < d0 + 4; y++) set(lx, y, IRON, FRONT);
      for (let y = d0 + 4; y < d0 + 13; y++) for (let x = lx - 3; x <= lx + 3; x++) { const frame = Math.abs(x - lx) === 3 || y === d0 + 4 || y === d0 + 12; set(x, y, frame ? IRON : LANT, FRONT, !frame); }
    }
    if (sign) {
      const sx = cx - dw / 2 - 20, sy = d0 - 2, sw = 22, sh = 18;
      for (let y = sy; y < sy + 3; y++) set(sx + sw / 2, y - 3, IRON, FRONT);
      for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) { const edge = x === sx || x === sx + sw - 1 || y === sy || y === sy + sh - 1; set(x, y, edge ? WOOD[0] : (y + x) % 5 ? WOOD[4] : WOOD[3], FRONT); }
      drawSign(sign, set, sx + sw / 2, sy + sh / 2);
    }
    if (flag) { const fx = w - 16; for (let y = apex - 24; y < apex + 2; y++) set(fx, y, IRON, FRONT); for (let y = apex - 23; y < apex - 11; y++) for (let x = fx + 1; x < fx + 14 - (y - apex + 23) / 3; x++) set(x, y, (y - apex + 23) < 2 || x === fx + 1 ? C('#8a6ab8') : C('#b79cff'), FRONT); }
    if (bell) { const bx = cx, by = apex - 14; for (let y = by - 8; y < by + 12; y++) for (let x = bx - 7; x <= bx + 7; x++) { if (y < by && Math.abs(x - bx) > 1) continue; if (y >= by + 8) { if (Math.abs(x - bx) > 6) continue; set(x, y, STONE[1], FRONT); continue; } if (y >= by && Math.abs(x - bx) <= 5) set(x, y, y === by + 7 ? C('#8a6a1a') : C('#d8b040'), FRONT); else if (y < by) set(x, y, STONE[2], FRONT); } }
  }, {fy: wallH + roofH + 10, round: 3, shapes: [{t: 'box', x0: -w / 2 + 6, x1: w / 2 - 6, y0: -wallH * .8, y1: 0, h: wallH}, {t: 'roof', x0: -w / 2, x1: w / 2, y0: -wallH * .8 - back, y1: 0, h0: wallH, h1: wallH + roofH}]});
}
/** The picture on a sign: a few pixels in dark ink on the board. */
function drawSign(kind, set, cx, cy) {
  const ink = C('#2a1a10'), gold = C('#ffd45c');
  const dots = {
    book: [[-5, -4, 1], [-5, -3, 1], [-5, -2, 1], [-5, -1, 1], [-5, 0, 1], [-5, 1, 1], [-5, 2, 1], [-5, 3, 1], [-4, -5, 1], [-3, -5, 1], [-2, -5, 1], [-1, -5, 1], [1, -5, 1], [2, -5, 1], [3, -5, 1], [4, -5, 1], [5, -4, 1], [5, -3, 1], [5, -2, 1], [5, -1, 1], [5, 0, 1], [5, 1, 1], [5, 2, 1], [5, 3, 1], [0, -4, 1], [0, -3, 1], [0, -2, 1], [0, -1, 1], [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [-4, 4, 1], [-3, 4, 1], [-2, 4, 1], [-1, 4, 1], [1, 4, 1], [2, 4, 1], [3, 4, 1], [4, 4, 1], [-3, -2, 1], [-2, -1, 1], [2, -2, 1], [3, -1, 1]],
    coin: [[-2, -4, 2], [-1, -4, 2], [0, -4, 2], [1, -4, 2], [2, -4, 2], [-3, -3, 2], [3, -3, 2], [-4, -2, 2], [4, -2, 2], [-4, -1, 2], [4, -1, 2], [-4, 0, 2], [4, 0, 2], [-4, 1, 2], [4, 1, 2], [-3, 2, 2], [3, 2, 2], [-2, 3, 2], [-1, 3, 2], [0, 3, 2], [1, 3, 2], [2, 3, 2], [-1, -1, 1], [0, -1, 1], [1, -1, 1], [0, 0, 1], [0, 1, 1], [-1, 1, 1], [1, 1, 1]],
    compass: [[0, -6, 1], [0, -5, 1], [-1, -4, 1], [0, -4, 1], [1, -4, 1], [-2, -3, 1], [2, -3, 1], [-3, -2, 1], [3, -2, 1], [-4, -1, 1], [4, -1, 1], [-5, 0, 1], [-4, 0, 1], [4, 0, 1], [5, 0, 1], [-4, 1, 1], [4, 1, 1], [-3, 2, 1], [3, 2, 1], [-2, 3, 1], [2, 3, 1], [-1, 4, 1], [0, 4, 1], [1, 4, 1], [0, 5, 1], [0, -2, 2], [0, -1, 2], [0, 0, 2], [0, 1, 2], [-1, 0, 2], [1, 0, 2]],
    bell: [[0, -5, 1], [-1, -4, 1], [0, -4, 1], [1, -4, 1], [-2, -3, 1], [2, -3, 1], [-2, -2, 1], [2, -2, 1], [-3, -1, 1], [3, -1, 1], [-3, 0, 1], [3, 0, 1], [-3, 1, 1], [3, 1, 1], [-4, 2, 1], [-3, 2, 1], [-2, 2, 1], [-1, 2, 1], [0, 2, 1], [1, 2, 1], [2, 2, 1], [3, 2, 1], [4, 2, 1], [0, 4, 2], [-1, 3, 2], [1, 3, 2]],
    cross: [[0, -5, 1], [0, -4, 1], [0, -3, 1], [0, -2, 1], [-1, -1, 1], [0, -1, 1], [1, -1, 1], [-5, 0, 1], [-4, 0, 1], [-3, 0, 1], [-2, 0, 1], [-1, 0, 1], [0, 0, 1], [1, 0, 1], [2, 0, 1], [3, 0, 1], [4, 0, 1], [5, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1]],
    anchor: [[0, -6, 2], [-1, -5, 2], [1, -5, 2], [0, -4, 1], [0, -3, 1], [-3, -2, 1], [-2, -2, 1], [-1, -2, 1], [0, -2, 1], [1, -2, 1], [2, -2, 1], [3, -2, 1], [0, -1, 1], [0, 0, 1], [0, 1, 1], [0, 2, 1], [0, 3, 1], [-5, 0, 1], [-5, 1, 1], [-4, 2, 1], [-4, 3, 1], [-3, 4, 1], [-2, 4, 1], [-1, 5, 1], [1, 5, 1], [2, 4, 1], [3, 4, 1], [4, 3, 1], [4, 2, 1], [5, 1, 1], [5, 0, 1]],
    cup: [[-4, -4, 1], [-3, -4, 1], [-2, -4, 1], [-1, -4, 1], [0, -4, 1], [1, -4, 1], [2, -4, 1], [3, -4, 1], [4, -4, 1], [-4, -3, 1], [4, -3, 1], [-4, -2, 1], [4, -2, 1], [5, -2, 1], [6, -1, 1], [-4, -1, 1], [4, -1, 1], [6, 0, 1], [-4, 0, 1], [4, 0, 1], [5, 1, 1], [-3, 1, 1], [3, 1, 1], [-2, 2, 1], [-1, 2, 1], [0, 2, 1], [1, 2, 1], [2, 2, 1], [-2, 4, 1], [-1, 4, 1], [0, 4, 1], [1, 4, 1], [2, 4, 1], [0, 3, 1]],
  };
  for (const [dx, dy, k] of dots[kind] || []) set(cx + dx, cy + dy, k === 2 ? gold : ink, FRONT);
}

// ── the rest of what stands in the city ─────────────────────────────────────────────────────────────────────────────
function fountain() { // a round stone basin on a step, water in it, a short column with a spout in the middle
  return object(64, 50, set => {
    cylinder(set, 32, 20, 36, 30, 10, (u, v, part) => part === 'top' ? (v > .9 ? STONE[4] : v > .82 ? STONE[2] : (Math.abs(u) < .08 && v < .5 ? C('#e8f8ff') : hash(u * 60 | 0, v * 60 | 0, 3) > .9 ? C('#a8e6cf') : C('#6ab8e0'))) : v < .15 ? STONE[4] : u < -.4 ? STONE[3] : u < .4 ? STONE[2] : STONE[1], {width: () => 1});
    cylinder(set, 32, 6, 20, 4, 1.6, (u, v, part) => part === 'top' ? STONE[4] : u < 0 ? STONE[3] : STONE[1]);
    for (let y = 2; y < 8; y++) set(32, y, C('#e8f8ff'), UP); set(31, 4, C('#a8e6cf')); set(33, 5, C('#a8e6cf'));
    for (let x = 8; x < 56; x++) { set(x, 39, STONE[3], UP); set(x, 40, STONE[1], FRONT); }
  }, {fx: 32, fy: 40, round: 3, shapes: [{t: 'cyl', x: 0, y: -2, r: 28, h: 16}]});
}
function stall() { // 霜's stall: a counter of boards, a striped awning on two poles, goods on the counter, a lantern
  const cold = cs(['#4a6a9a', '#dfe8f4']);
  return object(68, 62, set => {
    for (let y = 2; y < 16; y++) for (let x = 4; x < 64; x++) { const stripe = Math.floor((x + y * .3) / 7) % 2, edge = y > 13 && (x % 7 === 6 || x % 7 === 0); set(x, y, edge ? dim(cold[stripe], .7) : y < 4 ? dim(cold[stripe], 1.1) : cold[stripe], norm(0, .5, .85)); }
    for (const px of [6, 61]) for (let y = 16; y < 50; y++) { set(px, y, WOOD[3], FRONT); set(px + 1, y, WOOD[1], FRONT); }
    for (let y = 34; y < 52; y++) for (let x = 10; x < 58; x++) { const plank = Math.floor((y - 34) / 5); set(x, y, y === 34 ? WOOD[5] : (y - 34) % 5 === 4 ? WOOD[0] : x % 9 === 0 ? WOOD[1] : dim(WOOD[3], .9 + hash(plank, x >> 3, 2) * .2), y === 34 ? UP : FRONT); }
    for (let x = 8; x < 60; x++) { set(x, 32, WOOD[5], UP); set(x, 33, WOOD[4], UP); }
    // what is for sale: seed packets, a basket, bottles, a folded cloth
    for (let k = 0; k < 4; k++) { const x = 13 + k * 7; for (let y = 25; y < 32; y++) for (let xx = x; xx < x + 5; xx++) set(xx, y, y === 25 ? C('#f4efe8') : [C('#e2404f'), C('#4a9e96'), C('#ffd45c'), C('#7a5ae0')][k], FRONT); }
    cylinder(set, 48, 24, 32, 6, 2.4, (u, v, part) => part === 'top' ? (v > .6 ? C('#b08050') : C('#e8c080')) : u < 0 ? C('#c09060') : C('#8a6040'));
    for (const [x, c] of [[40, C('#3aa8a0')], [43, C('#b79cff')]]) { for (let y = 24; y < 32; y++) set(x, y, c, FRONT); set(x, 23, IRON, FRONT); }
    for (let y = 16; y < 24; y++) for (let x = 56; x <= 60; x++) { const frame = x === 56 || x === 60 || y === 16 || y === 23; set(x, y, frame ? IRON : LANT, FRONT, !frame); }
  }, {fx: 34, fy: 52, round: 3, shapes: [{t: 'box', x0: -26, x1: 26, y0: -8, y1: 0, h: 18}]});
}
function board() { // the bulletin board: a wide wooden board on two posts under a little roof, papers pinned to it
  return object(56, 50, set => {
    for (let x = 2; x < 54; x++) { const y0 = 4 + Math.abs(x - 28) * .18; set(x, y0, ROOFS.slate[4], RAKE); set(x, y0 + 1, ROOFS.slate[2], RAKE); set(x, y0 + 2, WOOD[0], FRONT); }
    for (let y = 12; y < 38; y++) for (let x = 6; x < 50; x++) set(x, y, x === 6 || x === 49 || y === 12 || y === 37 ? WOOD[0] : (y - 12) % 6 === 5 ? WOOD[1] : WOOD[3], FRONT);
    for (const [px, py, pw, ph, c] of [[9, 15, 12, 10, '#f4efe8'], [23, 14, 10, 13, '#fff6c8'], [36, 16, 11, 9, '#f4efe8'], [12, 27, 9, 8, '#e8f0ff'], [26, 29, 13, 7, '#f4efe8'], [41, 27, 7, 9, '#ffe0e0']])
      for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) set(x, y, y === py ? IRON : (y - py) % 3 === 2 && x > px + 1 && x < px + pw - 2 ? C('#8a8070') : C(c), FRONT);
    for (const px of [10, 45]) for (let y = 38; y < 48; y++) { set(px, y, WOOD[4], FRONT); set(px + 1, y, WOOD[1], FRONT); }
  }, {fx: 28, fy: 47, round: 2, shapes: [{t: 'box', x0: -22, x1: 22, y0: -2, y1: 0, h: 40}]});
}
const RAKE = norm(0, .75, .66);
function bench() {
  return object(30, 14, set => {
    for (let x = 2; x < 28; x++) { set(x, 4, WOOD[5], UP); set(x, 5, WOOD[3], FRONT); set(x, 6, WOOD[2], FRONT); if (x > 3 && x < 26) { set(x, 1, WOOD[4], UP); set(x, 2, WOOD[2], FRONT); } }
    for (const px of [4, 24]) for (let y = 7; y < 12; y++) { set(px, y, IRON, FRONT); set(px + 1, y, IRON, FRONT); }
  }, {fx: 15, fy: 11, round: 2, shapes: [{t: 'box', x0: -13, x1: 13, y0: -3, y1: 0, h: 6}]});
}
function bollard() { return object(10, 14, set => cylinder(set, 5, 2, 11, 3.6, 1.4, (u, v, part) => part === 'top' ? STONE[4] : u < -.3 ? STONE[3] : u < .4 ? STONE[2] : STONE[0]), {fx: 5, fy: 12, round: 2, shapes: [{t: 'cyl', x: 0, y: -1, r: 3, h: 10}]}); }
function hut() { // the harbour office: a small stone hut with a tin roof and a lamp, nets hung on its wall
  return building({w: 70, wallH: 34, roofH: 22, wall: 'stone', roof: 'slate', sign: 'anchor', attic: false, windows: 1, chimney: true});
}
function ship() { // the icebreaker at the pier, seen from its port side at a slant: a dark hull with a red waterline
  // and runes along it, a white deckhouse with lit windows, a funnel, a mast with a light, the bow pushed up and forward
  const hull = cs(['#1c1e26', '#2a2e3a', '#3a404e', '#4c5464']), red = cs(['#7a2a24', '#a83a30']), white = cs(['#b8bcc4', '#dcdfe4', '#f4f6f8']);
  return object(176, 72, set => {
    const top = x => 34 - Math.max(0, (x - 150)) * .5 - (x < 20 ? (20 - x) * .35 : 0), bottom = x => 60 - Math.abs(x - 88) ** 2 / 600;
    for (let x = 6; x < 170; x++) for (let y = Math.round(top(x)); y < bottom(x); y++) {
      const v = (y - top(x)) / (bottom(x) - top(x)); let c = v < .08 ? hull[3] : v < .55 ? hull[2] : v < .7 ? red[1] : v < .78 ? red[0] : hull[1];
      if (y % 7 === 3 && v < .55) c = hull[1];
      const rune = v > .2 && v < .48 && (x % 23 === 5 || x % 23 === 11) && hash(x, 0, 9) > .35 && x > 16 && x < 160;
      set(x, y, rune ? C('#5ab4c8') : c, norm(0, .9, .35), rune);
    }
    for (let x = 6; x < 170; x++) { const y = Math.round(top(x)); set(x, y - 1, white[0], UP); set(x, y - 2, white[1], UP); } // the deck's rail
    for (let y = 8; y < 32; y++) for (let x = 60; x < 128; x++) { const edge = x === 60 || x === 127; set(x, y, edge ? white[0] : y === 8 ? white[2] : white[1], FRONT); }
    for (let k = 0; k < 6; k++) for (let y = 14; y < 22; y++) for (let x = 66 + k * 10; x < 72 + k * 10; x++) { const frame = y === 14 || y === 21 || x === 66 + k * 10 || x === 71 + k * 10; set(x, y, frame ? hull[1] : GLASS[1], FRONT, !frame); }
    for (let y = 2; y < 12; y++) for (let x = 104; x < 116; x++) set(x, y, y < 4 ? hull[0] : x === 104 ? hull[1] : red[1], FRONT);
    for (let y = -10; y < 10; y++) set(80, y + 10, hull[1], FRONT); set(80, 0, C('#ffd57a'), FRONT, true); set(79, 1, C('#ffd57a'), FRONT, true);
    for (let x = 130; x < 150; x++) set(x, 36 - (x - 130) * .3, hull[0], UP); // the mooring line's bitt
    for (let x = 150; x < 176; x++) { const y = 42 + (x - 150) * .6; set(x, y, C('#c8b890'), UP); } // a line to the pier
  }, {fx: 88, fy: 66, round: 3, outline: true, shapes: [{t: 'box', x0: -80, x1: 80, y0: -26, y1: 0, h: 30}]});
}
function signpost() {
  return object(22, 30, set => {
    for (let y = 8; y < 29; y++) { set(10, y, C('#8a5a35'), [0, 1, 0]); set(11, y, C('#6d4529'), [0, 1, 0]); }
    for (let y = 4; y < 12; y++) for (let x = 2; x < 21; x++) { const tip = x > 17 && Math.abs(y - 8) > 21 - x; if (tip) continue; set(x, y, y === 4 ? C('#d8b080') : (x + y) % 7 ? C('#b08050') : C('#9a6a40'), [0, 1, 0]); }
    for (const x of [5, 7, 10, 12, 14]) set(x, 8, C('#4a2e1c'), [0, 1, 0]);
  }, {round: 2, fx: 11, fy: 28, shapes: [{t: 'cyl', x: 0, y: -1, r: 1.5, h: 26}]});
}

/** The named places of the city (pixels), where the residents stand and where things are found. */
export const PLACES = {
  guild: [50 * T, 17 * T + 16, 'down'], pierEnd: [34 * T + 6, 38 * T + 6, 'down'], plazaBench: [31 * T + 8, 17 * T - 2, 'down'], board: [41 * T + 24, 18 * T + 10, 'left'],
  stall: [28 * T, 22 * T - 2, 'down'], quaySun: [24 * T, 30 * T + 6, 'down'], pier: [34 * T + 6, 36 * T, 'down'],
  buyer: [18 * T + 6, 17 * T + 16, 'down'], plaza: [36 * T + 4, 23 * T + 4, 'up'], library: [34 * T + 8, 10 * T + 16, 'down'],
  hall: [16 * T, 27 * T + 16, 'down'], harbor: [44 * T + 6, 30 * T + 12, 'down'], school: [10 * T + 6, 9 * T + 16, 'down'], fountain: [34 * T + 30, 21 * T + 10, 'left'],
};

function objects() {
  const list = [], put = (o, x, footY, extra = {}) => list.push({...o, x: Math.round(x - o.fx), y: Math.round(footY - o.fy), foot: Math.round(footY), fxw: Math.round(x), ...extra});
  // the forest along the top
  for (let row = 0; row < 3; row++) for (let i = 0; i < 38; i++) { const x = i * 30 + (row % 2) * 15 + hash(i, row, 41) * 10 - 6; put(pine(i * 7 + row), x, 20 + row * 14 + hash(i, row, 42) * 6, {block: [10, 6]}); }
  // the buildings: their doors are where things happen (spots), and each is a page of the 见闻录 the first time
  put(building({w: 208, wallH: 60, roofH: 44, wall: 'stone', roof: 'slate', sign: 'book', attic: true, windows: 4, arch: true, flag: true}), 34 * T + 8, 10 * T, {block: [196, 18], spot: {kind: 'library', lore: 'library'}});
  put(building({w: 132, wallH: 50, roofH: 38, wall: 'wood', roof: 'green', sign: 'compass', windows: 2, flag: true}), 50 * T, 17 * T, {block: [120, 16], spot: {kind: 'guild', lore: 'guild'}});
  put(building({w: 124, wallH: 48, roofH: 36, wall: 'wood', roof: 'tan', sign: 'coin', windows: 2}), 18 * T + 6, 17 * T, {block: [112, 16], spot: {kind: 'buyer', lore: 'buyer'}});
  put(building({w: 150, wallH: 50, roofH: 40, wall: 'wood', roof: 'red', sign: 'cup', windows: 3, chimney: true}), 16 * T, 27 * T, {block: [138, 16], spot: {kind: 'hall', lore: 'hall'}});
  put(building({w: 118, wallH: 48, roofH: 36, wall: 'stone', roof: 'slate', sign: 'cross', windows: 2, arch: true, attic: false}), 56 * T, 26 * T, {block: [106, 16], spot: {kind: 'say', say: '医疗中心。门上写着：急症请直接推门，别敲。'}});
  put(building({w: 110, wallH: 46, roofH: 34, wall: 'wood', roof: 'green', sign: 'bell', windows: 2, bell: true, chimney: false}), 10 * T + 6, 9 * T, {block: [98, 16], spot: {kind: 'say', say: '基础学堂。里面传来念书的声音，混着不同种族的口音。'}});
  for (const [tx, ty, o] of [[26.5, 28, {w: 96, wallH: 44, roofH: 32, roof: 'red'}], [45, 28, {w: 96, wallH: 44, roofH: 32, roof: 'tan', wall: 'stone', arch: true}], [60, 9, {w: 100, wallH: 44, roofH: 34, roof: 'slate'}], [63, 17, {w: 92, wallH: 42, roofH: 30, roof: 'green', wall: 'stone'}]])
    put(building({windows: 2, lantern: false, ...o}), tx * T, ty * T, {block: [o.w - 12, 16], spot: {kind: 'say', say: '一户人家。阁楼的窗户里有灯光。'}});
  put(hut(), 44 * T + 6, 30 * T, {block: [58, 14], spot: {kind: 'say', say: '港务室。墙上钉着一张潮汐表和一张船期表。'}});
  // the plaza: the fountain in the middle, the stall, benches, the board, lamps and oaks around it
  put(fountain(), 34 * T + 8, 20 * T + 10, {block: [58, 14], spot: {kind: 'lore', id: 'plaza'}});
  put(stall(), 28 * T, 22 * T + 2, {block: [52, 14], spot: {kind: 'stall'}});
  put(board(), 41 * T + 4, 18 * T + 6, {block: [44, 6], spot: {kind: 'board', lore: 'board'}});
  for (const [tx, ty] of [[30.5, 16.6], [38, 24.2], [23.6, 30.2]]) put(bench(), tx * T, ty * T, {block: [26, 5]});
  for (const [tx, ty] of [[27.6, 15.4], [41.2, 15.4], [27.6, 25.2], [41.6, 25.4], [12.4, 21.6], [56.4, 21.6], [34.6, 14.2], [34.6, 27.6]]) put(lamp(), tx * T, ty * T, {block: [6, 4], lamp: true});
  for (const tx of [9, 20.4, 48, 59]) put(lamp(), tx * T, (shoreY(tx) - 1.6) * T, {block: [6, 4], lamp: true});
  for (const [tx, ty, s] of [[24.4, 13.8, 11], [45.2, 13.4, 12], [24.2, 27.2, 13], [46, 24.6, 14], [6.4, 23.6, 15], [62, 23.2, 16], [4.2, 13.6, 17], [52, 7.2, 18]]) put(oak(s, false), tx * T, ty * T, {block: [12, 6]});
  for (const [tx, ty, s, b] of [[22.4, 19.2, 1, '#e2404f'], [46.2, 19.4, 2, ''], [8.4, 26.6, 3, '#7a5ae0'], [61.6, 29.2, 4, ''], [29, 12.2, 5, '#ffffff'], [40.2, 12.4, 6, '#e2404f']]) put(bush(s, b), tx * T, ty * T, {block: [24, 7]});
  for (const [tx, ty] of [[28, 11.4], [40.6, 11.4], [12, 11.6], [57, 11.6]]) put(flowerbed(28), tx * T, ty * T, {block: [28, 6]});
  for (const [tx, ty, s, big] of [[3.6, 10.2, 1, 1], [65, 7.4, 2, 0], [2.8, 29.4, 3, 0]]) put(rock(s, big), tx * T, ty * T, {block: big ? [24, 8] : [14, 6]});
  // the quay: bollards, crates and barrels, the pier's piles and its end beam, the ship beside it
  for (const tx of [10, 18, 26, 42, 50, 58]) put(bollard(), tx * T + 8, (shoreY(tx) - 1) * T + 4, {block: [8, 4]});
  put(crate(), 40 * T + 4, 29.7 * T, {block: [16, 6]}); put(crate(), 41 * T + 2, 30.4 * T, {block: [16, 6]}); put(barrel(), 38.6 * T, 30.1 * T, {block: [14, 6]}); put(barrel(), 47.2 * T, 30.5 * T, {block: [14, 6]});
  put(beam(3 * T + 2), 34.5 * T, 39 * T, {flat: true, spot: {kind: 'lore', id: 'pier'}});
  for (const [x, y] of [[33 * T + 3, 33 * T], [36 * T - 3, 33 * T], [33 * T + 3, 39 * T + 12], [36 * T - 3, 39 * T + 12]]) put(pile(22), x, y);
  put(ship(), 42.5 * T, 38.4 * T, {block: [0, 0], spot: {kind: 'lore', id: 'ship'}});
  // the road in from the farm, with its signpost
  put(signpost(), 64.6 * T, 19.2 * T, {block: [6, 3], spot: {kind: 'say', say: '路牌：鲸湾城 · 中央广场 ← · → 鲸湾郊外'}});
  const post = fencePost(), rail = fenceRail(16);
  for (let x = 44 * T; x < 48 * T; x += 16) { put(post, x, 22.6 * T, {block: [8, 4]}); put(rail, x + 8, 22.6 * T - 2, {flat: true, block: [16, 4]}); }
  return list.sort((a, b) => a.foot - b.foot);
}

/** The city for farm.js's list of maps; entries: where one comes in (from the farm, on the road at the east edge). */
export const TOWN = {W, H, terrain, objects, entry: {east: [W - 14, 20 * T + 10, 'left']}, places: PLACES, shoreY};
/** The landmarks' pictures, for the 见闻录. */
export const LORE_ART = {
  library: () => building({w: 208, wallH: 60, roofH: 44, wall: 'stone', roof: 'slate', sign: 'book', windows: 4, arch: true, flag: true}),
  guild: () => building({w: 132, wallH: 50, roofH: 38, roof: 'green', sign: 'compass', flag: true}),
  buyer: () => building({w: 124, wallH: 48, roofH: 36, roof: 'tan', sign: 'coin'}),
  hall: () => building({w: 150, wallH: 50, roofH: 40, roof: 'red', sign: 'cup', windows: 3}),
  plaza: fountain, board, pier: () => bollard(), ship,
};
