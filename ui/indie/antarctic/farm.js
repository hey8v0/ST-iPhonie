// 南极结界 · 鲸湾郊外的农场: the first map. Terrain is painted per pixel from a tile map (16 px); things are objects of
// their own (assets.js) with normals and 3D shapes; light.js lights it all for the hour: sun from the camera's side
// (north, over the sea), shadows of the shapes falling away, lamps that light what faces them, bloom, reflections.
import {sprite} from './slim.js';
import {pillow, insideDistance, sunAt, shadowSteps, shade} from './light.js';
import {oak, pine, bush, rock, stump, fencePost, fenceRail, lamp, mailbox, barrel, crate, crop, flowerbed, house, beam, pile, lowPost, lowRail, woodpile, shippingBin, setSeason} from './assets.js';
import {SHORE} from './shore.js';

export const T = 16, TW = 60, TH = 36, W = TW * T, H = TH * T;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pack = ([r, g, b]) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
const C = h => pack(hex(h));
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, size, s = 0) {
  const gx = Math.floor(x / size), gy = Math.floor(y / size), fx = smooth(x / size - gx), fy = smooth(y / size - gy);
  const a = hash(gx, gy, s), b = hash(gx + 1, gy, s), c = hash(gx, gy + 1, s), d = hash(gx + 1, gy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const dim = (c, k) => { const [r, g, b] = unpack(c); return pack([r * k, g * k, b * k]); };
const lerp = (a, b, t) => a + (b - a) * t;

// ── the map ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// # forest above the cliff, C cliff face, F waterfall, g grass, p path, f field, w water, b boards (bridge, dock),
// s sand, S sea
const MAP = [
  '############################################www#############',
  '############################################www#############',
  '############################################www#############',
  '############################################www#############',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCFFFCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCFFFCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCFFFCCCCCCCCCCCCC',
  'gggggggggggggggggggggggggggggggggggggggwwwwwwwwwwwwgggggggg',
  'gggggggggggggggggggggggggggggggggggggwwwwwwwwwwwwwwwwgggggg',
  'ggggggggggggggggggggggggggggggggggggwwwwwwwwwwwwwwwwwwggggg',
  'gggggggggggggggggggggggggggggggggggggwwwwwwwwwwwwwwwwwggggg',
  'ggggggggggggggggggggggggggggggggggggggwwwwwwwwwwwwwwwgggggg',
  'gggggggggggggggggggggggggggggggggggggggggwwwwwwwwwwgggggggg',
  'gggggggggggggggggggggggggggggggggggggggggggwwwwwgggggggggg',
  'gggggggggggggggggggggggggggggggggggggggggggggwwwggggggggggg',
  'gggggggggggpppgggggfffffffffffffffggggggggggggwwwgggggggggg',
  'gggggggggggpppgggggfffffffffffffffgggggggggggwwwggggggggggg',
  'gggggggggggpppgggggfffffffffffffffggggggggggwwwgggggggggggg',
  'gggggggggggpppgggggfffffffffffffffggggggggggwwwgggggggggggg',
  'gggggggggggpppgggggfffffffffffffffgggggggggggwwwggggggggggg',
  'gggggggggggpppgggggfffffffffffffffggggggggggggwwwgggggggggg',
  'gggggggggggpppgggggfffffffffffffffggggggggggggwwwgggggggggg',
  'gggggggggggpppgggggfffffffffffffffgggggggggggwwwggggggggggg',
  'gggggggggggpppggggggggggggggggggggggggggggggwwwgggggggggggg',
  'gggggggggggpppppppppppppppppppppppppppppppppbbbbbpppppppppppp',
  'gggggggggggggggggggggggpppgggggggggggggggggggwwwggggggggggg',
  'ggggggggggggggggggggggggpppgggggggggggggggggggwwwgggggggggg',
  'gggggggggggggggggggggggggpppgggggggggggggggggggwwwggggggggg',
  'ssssssssssssssssssssssssssppsssssssssssssssssssswwwsssssssss',
  'sssssssssssssssssssssssbbbbbssssssssssssssssssssssssssssssss',
  'SSSSSSSSSSSSSSSSSSSSSSSbbbbbSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSbbbbbSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
].map(r => r.padEnd(TW, r.at(-1)).slice(0, TW));
const tileAt = (tx, ty) => MAP[Math.max(0, Math.min(TH - 1, ty))][Math.max(0, Math.min(TW - 1, tx))];
const HARD = new Set(['f', 'C', '#', 'F', 'b']);
// Soft materials (path, water, sand, sea) get wobbly edges: a pixel looks up the map a few pixels away along noise.
function material(x, y) {
  const t = tileAt(x / T | 0, y / T | 0);
  if (HARD.has(t)) return t;
  const dx = (noise(x, y, 11, 1) - .5) * 11, dy = (noise(x, y, 11, 2) - .5) * 11;
  const u = tileAt((x + dx) / T | 0, (y + dy) / T | 0);
  return HARD.has(u) ? t : u;
}

const PAL = {
  g0: '#203f1c', g1: '#2e5824', g2: '#3f722c', g3: '#548c35', g4: '#73a843', g5: '#9bc957', g6: '#c2e070',
  d0: '#5e3a22', d1: '#7c4f2e', d2: '#9a6639', d3: '#b98048', d4: '#d39d60', peb: '#e2c492',
  t0: '#33200f', t1: '#472c19', t2: '#5d3b23', t3: '#744c2e', t4: '#8c5e3a',
  w0: '#0b4d63', w1: '#106b80', w2: '#178c9c', w3: '#2fb0b2', w4: '#6bd6cc', w5: '#b4f2e6', foam: '#ecfffb',
  s0: '#b8955a', s1: '#d0b071', s2: '#ddc286', s3: '#e8d29e', S0: '#0a4462', S1: '#0f5d7c', S2: '#177c96', S3: '#2c9cac',
  r0: '#33200f', r1: '#4f3220', r2: '#6d4529', r3: '#8c5a35', r4: '#aa7244', r5: '#c48f5c',
  p0: '#0c2219', p1: '#133325', p2: '#1b4630', p3: '#265c3c', p4: '#367548', p5: '#4f9156', p6: '#74ad62',
  o0: '#173619', o1: '#224d21', o2: '#30652a', o3: '#447f33', o4: '#609c3f', o5: '#86bb4e', o6: '#b0d864',
  tr0: '#2c1a10', tr1: '#43291a', tr2: '#5c3a25', tr3: '#7a5034', tr4: '#966a47',
  st0: '#3b3c48', st1: '#565867', st2: '#757887', st3: '#9699a6', st4: '#b9bcc6',
  pl0: '#5b3a24', pl1: '#7a5034', pl2: '#966746', pl3: '#b3825a', pl4: '#cc9d71',
  rf0: '#14232f', rf1: '#1e3646', rf2: '#2a4b60', rf3: '#386379', rf4: '#4c7f95', rf5: '#6fa3b5',
  sh0: '#203f5a', sh1: '#2f5a7c', sh2: '#4378a0', gl0: '#5b8fae', gl1: '#8cc0d8', gl2: '#cfeaf3',
};
const P = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, C(v)]));
// grass by season (spring as above); winter's is a dull, frost-bitten green
const GRASS = [null, ['#1f4a1a', '#2c6422', '#3a7c2a', '#4f9632', '#6cb43e', '#93d050', '#bde46a'], ['#3f3a18', '#5a5422', '#76702e', '#928a3c', '#ae9f4a', '#c9b45e', '#e0cc78'], ['#2e3e2a', '#3c4e36', '#4c5e44', '#5e6e52', '#728262', '#8a9878', '#a6b294']];
let SEASON = 0;
function seasonPalette(season) {
  SEASON = season | 0;
  const g = GRASS[SEASON] || GRASS[0] || null, base = ['#203f1c', '#2e5824', '#3f722c', '#548c35', '#73a843', '#9bc957', '#c2e070'];
  (g || base).forEach((h, k) => { P['g' + k] = C(h); });
}

// ── terrain ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const M = {g: 1, p: 2, f: 3, w: 4, s: 5, S: 6, C: 7, '#': 8, F: 9, b: 10};
function terrain() {
  const B = new Uint32Array(W * H), mat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mat[y * W + x] = M[material(x, y)];
  const at = (x, y) => mat[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const water = m => m === 4 || m === 6 || m === 9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = mat[y * W + x], n = noise(x, y, 24) * .55 + noise(x, y, 7, 3) * .45, r = hash(x, y, 7);
    let c = 0;
    if (m === 1) { c = n < .28 ? P.g2 : n < .6 ? P.g3 : n < .82 ? P.g4 : P.g5; if (r > .99) c = P.g1; }
    else if (m === 2) { c = n < .3 ? P.d1 : n < .62 ? P.d2 : n < .85 ? P.d3 : P.d4; if (r > .975) c = P.peb; else if (r > .955) c = P.d0; }
    else if (m === 5) { c = n < .35 ? P.s1 : n < .75 ? P.s2 : P.s3; if (r > .99) c = C('#fff8ea'); else if (r > .98) c = P.s0; }
    else if (m === 8) { c = n < .5 ? P.p0 : P.p1; }
    B[y * W + x] = c;
  }
  // where grass meets path or sand: a dark rim on the grass and blades leaning over the edge
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (at(x, y) !== 1) continue;
    const near = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
    if (near.some(v => v === 2 || v === 5)) B[y * W + x] = hash(x, y, 11) > .5 ? P.g2 : P.g1;
    if (at(x, y + 2) === 2 && hash(x, y, 12) > .7) B[(y + 1) * W + x] = P.g3;
  }
  // tilled field: furrows across each tile, a little wetter dark in the hollows
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== 3) continue;
    const ly = y % T, lx = x % T, ridge = ly % 8;
    let c = ridge < 1 ? P.t4 : ridge < 3 ? P.t3 : ridge < 5 ? P.t2 : ridge < 7 ? P.t1 : P.t0;
    if (lx === 0) c = dim(c, .82);
    if (hash(x, y, 13) > .94) c = P.t0; else if (hash(x, y, 14) > .96 && ridge < 3) c = P.t4;
    B[y * W + x] = c;
  }
  // water: clear, the bottom showing where it is shallow (sand, pebbles, weed), deepening to blue-green; WD keeps how
  // far each water pixel is from the shore, for the banks, the foam and the moving light later
  const WD = new Uint8Array(W * H);
  const pond = ['#86e3cf', '#62d4c6', '#3fbfc0', '#27a6b4', '#1a8ea8', '#14789a'].map(C), sea = ['#79dccb', '#4ec4c2', '#2aa6b8', '#1c8aa8', '#156f94', '#0f5a82'].map(C);
  const WDF = insideDistance(i => water(mat[i]) || mat[i] === 10, W, H, 14);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = at(x, y); if (!water(m)) continue;
    const d = Math.max(1, Math.round(WDF[y * W + x]));
    WD[y * W + x] = d;
    const ramp = m === 6 ? sea : pond, dd = d + (noise(x, y, 6, 19) - .5) * 3 + (m === 6 ? Math.max(0, y - 31 * T) / 10 : 0);
    let c = ramp[Math.min(5, Math.max(0, Math.floor(dd / 2.4)))];
    if (y < 4 * T) { c = [C('#1d6f7c'), C('#18606e'), C('#14525f')][Math.floor(hash(x, y >> 2, 23) * 3)]; B[y * W + x] = c; WD[y * W + x] = 5; continue; } // the river under the forest, in its shade
    if (dd < 5) { const n = noise(x, y, 4, 20); if (n > .64) c = C(m === 6 ? '#a8e6cf' : '#a6e8d0'); else if (n < .2) c = ramp[1]; if (hash(x, y, 21) > .985) c = C('#d8f2e0'); } // the bottom: sand, pebbles
    if (d === 1 && hash(x, y, 16) > .25) c = C('#effffb'); else if (d === 2 && hash(x, y, 17) > .6) c = C('#c9f6ea');
    B[y * W + x] = c;
  }
  // water weed swaying on the bottom where it is not too deep
  for (let k = 0; k < 420; k++) {
    const x = hash(k, 1, 24) * W | 0, y = hash(k, 2, 24) * H | 0, d = WD[y * W + x];
    if (at(x, y) !== 4 || d < 3 || d > 9) continue;
    const len = 4 + hash(k, 3, 24) * 6;
    for (let j = 0; j < len; j++) { const X = Math.round(x + Math.sin(j * .7 + k) * 1.2), Y = y - j; if (at(X, Y) === 4 && WD[Y * W + X] > 2) B[Y * W + X] = j > len - 2 ? C('#3aa88a') : C('#1f7c6c'); }
  }
  // the cliff: a grass lip folding over the top with hanging grass and vines; the face a wall of rounded stones, each
  // bulging toward us (its own normals, so the sun lights its upper side), dark crevices between, moss on the tops
  const CN = new Float32Array(W * H * 3), cliffTop = new Int16Array(W), cliffFoot = new Int16Array(W);
  const stones = (x, y) => {
    const cw = 15, ch = 10, row = Math.floor(y / ch), off = (row % 2) * cw / 2, gx = Math.floor((x + off) / cw);
    let d1 = 1e9, d2 = 1e9, best = null;
    for (let r = row - 1; r <= row + 1; r++) for (let c = gx - 1; c <= gx + 1; c++) {
      const o = (r % 2) * cw / 2, px = c * cw - o + cw * (.1 + hash(c, r, 61) * .8), py = r * ch + ch * (.1 + hash(c, r, 62) * .8);
      const big = .75 + hash(c, r, 67) * .6, d = Math.hypot((x - px) / 1.15, y - py) / big;
      if (d < d1) { d2 = d1; d1 = d; best = [px, py, c, r]; } else if (d < d2) d2 = d;
    }
    return {edge: d2 - d1, dx: (x - best[0]) / 7, dy: (y - best[1]) / 5, id: hash(best[2], best[3], 63)};
  };
  for (let x = 0; x < W; x++) {
    const top = 4 * T + Math.round((noise(x, 0, 9, 5) - .5) * 6), foot = 7 * T + Math.round((noise(x, 1, 11, 6) - .5) * 4);
    cliffTop[x] = top; cliffFoot[x] = foot;
    const lip = 3 + Math.round(noise(x, 2, 5, 9) * 3), vine = hash(x >> 1, 7, 3) > .86 ? 6 + hash(x, 8) * 14 : 0;
    for (let y = top - 3; y < foot; y++) {
      const i3 = (y * W + x) * 3;
      let c;
      if (y < top) { c = y < top - 1 ? P.g4 : P.g3; CN[i3 + 2] = 1; }
      else if (y < top + lip) { c = y === top + lip - 1 ? P.g1 : y === top ? P.g4 : P.g3; CN[i3 + 1] = .7; CN[i3 + 2] = .7; }
      else if (vine && y < top + lip + vine && (x & 1) === 0) { c = (y + x) % 5 === 0 ? P.g4 : P.g2; CN[i3 + 1] = 1; }
      else {
        const st = stones(x, y), k = (y - top) / (foot - top);
        const base = st.id < .3 ? P.r3 : st.id < .65 ? P.r4 : st.id < .9 ? P.r5 : P.r2;
        if (st.edge < 1.3) { c = st.edge < .6 ? P.r0 : P.r1; CN[i3 + 1] = .86; CN[i3 + 2] = .5; }
        else {
          c = st.dy < -.55 ? dim(base, 1.08) : st.dy > .6 ? dim(base, .86) : base;
          if (st.dy < -.4 && noise(x, y, 6, 64) > .62 && k < .7) c = noise(x, y, 3, 65) > .5 ? P.g2 : P.g1; // moss
          if (hash(x, y, 66) > .97) c = dim(c, .85);
          const nx = Math.max(-1, Math.min(1, st.dx)) * .7, ny = .86 + Math.max(-1, Math.min(1, st.dy)) * .25, nz = .5 - Math.max(-1, Math.min(1, st.dy)) * .55;
          const l = Math.hypot(nx, ny, nz); CN[i3] = nx / l; CN[i3 + 1] = ny / l; CN[i3 + 2] = nz / l;
        }
        if (k > .92) c = dim(c, .7);
      }
      B[y * W + x] = c;
    }
  }
  // banks: where land meets water below it, the earth drops into the water as a little face toward us, foam at its foot
  for (let x = 0; x < W; x++) for (let y = 1; y < H - 4; y++) {
    const above = at(x, y - 1), here = at(x, y);
    if (!water(here) || water(above) || above === 10 || above === 7 || above === 9 || above === 8) continue;
    const deep = 3 + (hash(x >> 2, y, 25) > .6 ? 1 : 0);
    for (let k = 0; k < deep; k++) {
      const i = (y + k) * W + x; if (!water(at(x, y + k))) break;
      B[i] = k === 0 ? (above === 5 ? C('#c9a868') : C('#7a5a34')) : k === deep - 1 ? C('#3a2717') : (hash(x, y + k, 26) > .7 ? C('#6b4a2c') : C('#56391f'));
      CN[i * 3] = 0; CN[i * 3 + 1] = .96; CN[i * 3 + 2] = .28;
    }
    for (let k = deep; k < deep + 2; k++) if (water(at(x, y + k)) && hash(x, y + k, 27) > .2) B[(y + k) * W + x] = k === deep ? C('#effffb') : C('#c9f6ea');
  }
  // the sides of the water: a thin earth rim where grass meets it left or right
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const here = at(x, y); if (!water(here) || CN[(y * W + x) * 3 + 1]) continue;
    const l = at(x - 1, y), r = at(x + 1, y), side = (v => v === 1 || v === 2) ;
    if (side(l) || side(r)) B[y * W + x] = hash(x, y, 28) > .5 ? C('#56391f') : C('#6b4a2c');
  }
  // behind the falls: the same rock, dark and wet (the falling water is drawn live by the game)
  for (let y = 4 * T - 4; y < 7 * T + 6; y++) for (let x = 44 * T; x < 47 * T; x++) if (at(x, y) === 9) { const [r, g, b] = unpack(B[y * W + x]); B[y * W + x] = pack([r * .42, g * .5, b * .62 + 10]); }
  for (let k = 0; k < 360; k++) { const a = hash(k, 1, 22) * Math.PI, r = hash(k, 2, 22) * 30, x = 45.5 * T + Math.cos(a) * r * 1.3, y = 7 * T + 4 + Math.sin(a) * r * .5; if (water(at(x | 0, y | 0))) B[(y | 0) * W + (x | 0)] = hash(k, 3, 22) > .4 ? C('#f4fffd') : C('#c9f6ea'); }
  // boards: the bridge across the stream and the dock into the sea
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y) !== 10) continue;
    const across = y < 26 * T, lx = across ? x : y, ly = across ? y % T : x % T;
    let c = lx % 7 === 6 ? P.r1 : (lx % 7 < 2 ? P.r5 : lx % 7 < 4 ? P.r4 : P.r3);
    if (ly === 0 || ly === T - 1) c = P.r2;
    if (hash(x, y, 23) > .94) c = P.r2;
    B[y * W + x] = c;
  }
  // grass detail: tufts of long grass, clover, little flowers
  for (let i = 0; i < 5200; i++) {
    const x = 3 + hash(i, 1, 31) * (W - 6) | 0, y = 3 + hash(i, 2, 31) * (H - 6) | 0;
    if (at(x, y) !== 1 || at(x, y + 3) !== 1 || at(x + 3, y) !== 1 || at(x - 3, y) !== 1 || at(x, y - 3) !== 1) continue;
    const kind = hash(i, 3, 31);
    if (kind < .7) { // a tuft: three blades, lit on the left
      for (const [dx, h, c] of [[-1, 3, P.g5], [0, 4, P.g6], [1, 3, P.g4]]) for (let k = 0; k < h; k++) B[(y - k) * W + x + dx + (k > 2 ? dx : 0)] = k === h - 1 ? c : P.g3;
      B[(y + 1) * W + x] = P.g1; B[(y + 1) * W + x + 1] = P.g1;
    } else if (kind < .85) { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) B[(y + dy) * W + x + dx] = (dx + dy) % 2 ? P.g4 : P.g5; }
    else if (SEASON === 2) { const c = [C('#c8482a'), C('#e08a2e'), C('#f2c24a'), C('#8a3a1e')][i % 4]; B[y * W + x] = c; B[y * W + x + 1] = dim(c, .8); B[(y + 1) * W + x] = dim(c, .7); }
    else if (SEASON < 3) { const c = (SEASON ? [C('#ffd45c'), C('#ffffff'), C('#ff9a4a'), C('#fff1b8'), C('#ffd27a')] : [C('#ffc7d6'), C('#fff1b8'), C('#c9b6ff'), C('#ffffff'), C('#ffd27a')])[i % 5]; B[y * W + x] = c; B[(y - 1) * W + x] = c; B[y * W + x - 1] = c; B[y * W + x + 1] = c; B[(y + 1) * W + x] = dim(c, .75); B[y * W + x] = C('#ffe08a'); B[(y + 2) * W + x] = P.g2; }
  }
  return {B, mat, CN, cliffTop, cliffFoot, WD};
}

// ── the scene ───────────────────────────────────────────────────────────────────────────────────────────────────────
// A person as a world object: the sprite, normals from its outline, a cylinder for its shadow.
export function person(key, pose = {}) {
  const s = sprite(key, pose);
  return {w: s.w, h: s.h, px: s.px, nrm: pillow(s.px, s.w, s.h, 4), emit: new Uint8Array(s.w * s.h), fx: s.w / 2, fy: s.foot - 1, shapes: [{t: 'cyl', x: 0, y: -1, r: 4, h: 28}]};
}
function placeObjects(without = []) {
  const list = [], put = (o, x, footY, extra = {}) => { if (without.includes(extra.person)) return; list.push({...o, x: Math.round(x - o.fx), y: Math.round(footY - o.fy), foot: Math.round(footY), fxw: Math.round(x), ...extra}); };
  for (let row = 0; row < 4; row++) for (let i = 0; i < 34; i++) {
    const x = i * 30 + (row % 2) * 15 + hash(i, row, 41) * 10 - 6;
    if (x > 43 * T && x < 48 * T) continue;
    put(pine(i * 5 + row), x, 22 + row * 14 + hash(i, row, 42) * 6, {block: [10, 6]});
  }
  put(house(), 11.5 * T, 15.6 * T, {house: true, boxy: true, block: [130, 70]});
  put(flowerbed(28), 3.4 * T, 15.4 * T, {block: [28, 6]});
  put(woodpile(), 4.4 * T, 13.4 * T, {block: [30, 6]});
  put(flowerbed(28), 19.6 * T, 15.4 * T, {block: [28, 6]});
  const trees = [[1.6, 11.4, 0], [3.4, 20.6, 1], [1.4, 27.2, 0], [19.4, 11.2, 1], [37.4, 15.2, 1], [55.6, 15.2, 0], [57.4, 21.8, 1], [53.2, 9.6, 0], [36.6, 21.4, 0], [56.2, 27.4, 1], [8.6, 26.8, 1], [41.6, 27.2, 0]];
  for (const [tx, ty, kind] of trees) put(kind ? oak(Math.round(tx * 10), tx > 30 && tx < 40) : pine(Math.round(tx * 7)), tx * T, ty * T, {block: [12, 6]});
  for (const [tx, ty, s, b] of [[6.4, 18.4, 1, '#e2404f'], [16.8, 21.8, 2, ''], [33.6, 11.8, 3, '#7a5ae0'], [51.6, 13.4, 4, ''], [5.2, 23.6, 5, '#ffffff'], [38.6, 25.4, 6, '#e2404f'], [49.4, 21.6, 7, '']]) put(bush(s, b), tx * T, ty * T, {block: [24, 7]});
  for (const [tx, ty, s, big] of [[36.4, 9.4, 1, 1], [54.6, 12.2, 2, 0], [13.8, 27.6, 3, 0], [44.2, 30.6, 4, 1], [3.2, 30.4, 5, 0]]) put(rock(s, big), tx * T, ty * T, {block: big ? [24, 8] : [14, 6]});
  put(stump(), 36.2 * T, 18.6 * T, {block: [18, 7]});
  put(barrel(), 17.8 * T, 16.6 * T, {block: [14, 6]});
  put(shippingBin(), 16.4 * T, 17.2 * T, {bin: true, block: [26, 8]});
  put(crate(), 4.6 * T, 16.9 * T, {block: [16, 6]});
  put(mailbox(), 14.4 * T, 17.2 * T, {mailbox: true, block: [6, 4]});
  for (const [tx, ty] of [[8.4, 17.4], [30.4, 24.4], [49.6, 23.7]]) put(lamp(), tx * T, ty * T, {block: [6, 4], lamp: true});
  // the bridge over the stream: a beam along its front edge, posts and a rail on both sides
  const bx0 = 44 * T, bx1 = 49 * T, by0 = 24 * T, by1 = 25 * T;
  put(beam(bx1 - bx0 + 2), (bx0 + bx1) / 2, by1, {flat: true});
  const bpost = lowPost(), brail = lowRail(20);
  for (let x = bx0 + 2; x <= bx1 - 2; x += 20) { put(bpost, x, by0 + 1, {block: [7, 3]}); put(bpost, x, by1 + 1, {block: [7, 3]}); }
  for (let x = bx0 + 2; x < bx1 - 10; x += 20) { put(brail, x + 10, by0 - 4, {flat: true, block: [20, 3]}); put(brail, x + 10, by1 - 4, {flat: true, block: [20, 2]}); }
  // the dock into the sea: piles at its corners, a beam at its end
  const dx0 = 23 * T, dx1 = 28 * T, dy1 = 32 * T;
  put(beam(dx1 - dx0), (dx0 + dx1) / 2, dy1, {flat: true});
  for (const [x, y] of [[dx0 + 3, 30 * T + 4], [dx1 - 3, 30 * T + 4], [dx0 + 3, dy1 + 14], [dx1 - 3, dy1 + 14]]) put(pile(22), x, y);
  const fx0 = 19 * T - 4, fx1 = 34 * T + 4, fy0 = 15 * T - 2, fy1 = 23 * T + 2, gate = 26.5 * T;
  const post = fencePost(), rail = fenceRail(16);
  for (let x = fx0; x <= fx1; x += 16) { put(post, x, fy0 + 1, {block: [8, 4]}); if (Math.abs(x - gate) > 14) put(post, x, fy1 + 1, {block: [8, 4]}); }
  for (let y = fy0 + 16; y < fy1; y += 16) { put(post, fx0, y + 1, {block: [8, 16]}); put(post, fx1, y + 1, {block: [8, 16]}); }
  for (let x = fx0; x < fx1; x += 16) { put(rail, x + 8, fy0 - 1, {flat: true, block: [16, 4]}); if (Math.abs(x + 8 - gate) > 16) put(rail, x + 8, fy1 - 1, {flat: true, block: [16, 4]}); }
  put(person('hero'), 25.4 * T, 19.8 * T, {person: 'hero', block: [8, 4]});
  put(person('fox'), 20.4 * T, 24.9 * T, {person: 'fox', block: [8, 4]});
  put(person('frost', {view: 'side'}), 46.4 * T, 24.9 * T, {person: 'frost', block: [8, 4]});
  put(person('water'), 52.8 * T, 14.4 * T, {person: 'water', block: [8, 4]});
  return list.sort((a, b) => a.foot - b.foot);
}
// Lamps of the night: the lamp posts, the lantern by the door, light from the windows and the attic.
function lampsOf(objects, sun) {
  const dusk = sun.night ? 1 : Math.max(0, Math.min(1, (sun.hour - 18.4) / 1.4));
  if (!dusk) return [];
  const out = [], warm = [1.0, .66, .36];
  for (const o of objects) {
    if (o.lamp) out.push({x: o.fxw, y: o.foot + 2, z: 44, r: 120, c: warm, k: 1.9 * dusk});
    if (o.house) {
      const hx = o.fxw;
      out.push({x: hx + 22, y: o.foot - 16, z: 62, r: 96, c: warm, k: 1.4 * dusk});
      for (const dx of [-53, 53]) out.push({x: hx + dx, y: o.foot - 16, z: 58, r: 70, c: [1, .72, .44], k: 1.0 * dusk});
      out.push({x: hx, y: o.foot - 16, z: 108, r: 46, c: [1, .72, .44], k: .7 * dusk});
    }
  }
  return out;
}

// Winter by the coast is mild (heavy snow belongs to the mountains): a thin frost on what faces the sky — rimed patches
// in the grass, frost on the top edges of things and on the cliff's ledges, a skin of ice at the very edge of still
// water. Soil, sand and paths only catch a speck here and there.
function winter(F, N, mat, WD, owner, bare, W, H) {
  const FROST = ['#c8d6e0', '#dce6ee', '#eef4f8'].map(C);
  const mix = (c, d, k) => { const [r, g, b] = unpack(c), [R, G, B] = unpack(d); return pack([r + (R - r) * k, g + (G - g) * k, b + (B - b) * k]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i], up = N[i * 3 + 2], ny = N[i * 3 + 1], o = owner[i];
    if (bare[i]) continue; // people do not frost over
    if (m === 4 || m === 6) { if (m === 4 && WD[i] <= 1 && o < 0 && hash(x, y, 91) > .3) F[i] = mix(F[i], FROST[2], .55); continue; }
    if (o >= 0) { // things: rime along their top edges
      const top = y > 1 && owner[i - W] !== o;
      if (!top || hash(x, y, 96) < .35) continue;
      F[i] = mix(F[i], FROST[hash(x, y, 97) > .6 ? 2 : 1], .6); continue;
    }
    if (m === 9 || up < .6) continue;
    if (m === 7) { if (ny < .5 && hash(x, y, 98) > .82) F[i] = mix(F[i], FROST[1], .5); continue; }
    const n = noise(x, y, 6, 92), r = hash(x, y, 94);
    if (m === 1 || m === 16) { if ((n > .64 && r > .5) || r > .965) F[i] = mix(F[i], FROST[r > .985 ? 2 : 1], .32 + (n - .5) * .4); continue; }
    if (r > .94) F[i] = mix(F[i], FROST[1], .5);
  }
}

// What does not change with the hour, made once: terrain, things, per-pixel albedo, normals, where each pixel stands
// and how high, who drew it, reflections, what one can walk on.
// The outdoor maps: each paints its terrain and places its things; the rest (normals, light, snow, reflections, what
// is solid) is the same for all. cliff: the row where the farm's cliff stands (its shadow); fall: the waterfall's box.
export const MAPS = {
  farm: {W, H, terrain: () => terrain(), objects: without => placeObjects(without), fall: [44 * T + 2, 4 * T - 4, 47 * T - 2, 7 * T + 6], river: 4 * T},
  shore: SHORE,
};
export function prepare({map = 'farm', without = [], season = 0} = {}) {
  setSeason(season); seasonPalette(season);
  const def = MAPS[map], W = def.W, H = def.H;
  const {B, mat, CN, cliffFoot, WD, tideE = null} = def.terrain(season);
  const objects = def.objects(without);
  for (const o of objects) o.world = o.shapes.map(s => ({...s, x: (s.x ?? 0) + o.fxw, y: (s.y ?? 0) + o.foot, ...(s.x0 !== undefined ? {x0: s.x0 + o.fxw, x1: s.x1 + o.fxw, y0: s.y0 + o.foot, y1: s.y1 + o.foot} : {})}));
  const bare = new Uint8Array(W * H), F = B.slice(), N = new Float32Array(W * H * 3), Gy = new Float32Array(W * H), Z = new Float32Array(W * H), owner = new Int16Array(W * H).fill(-1), glow = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i]; Gy[i] = y;
    if ((m === 4 || m === 6) && CN[i * 3 + 1]) { N[i * 3 + 1] = CN[i * 3 + 1]; N[i * 3 + 2] = CN[i * 3 + 2]; Z[i] = 2; }
    else if (m === 7) { N[i * 3] = CN[i * 3]; N[i * 3 + 1] = CN[i * 3 + 1]; N[i * 3 + 2] = CN[i * 3 + 2]; if (!N[i * 3 + 1] && !N[i * 3 + 2]) N[i * 3 + 2] = 1; Z[i] = Math.max(0, cliffFoot[x] - y); Gy[i] = cliffFoot[x]; }
    else if (m === 9) { N[i * 3 + 1] = 1; Z[i] = Math.max(0, 7 * T - y); Gy[i] = 7 * T; }
    else N[i * 3 + 2] = 1;
  }
  for (const o of objects) for (let j = 0; j < o.h; j++) for (let k = 0; k < o.w; k++) {
    const c = o.px[j * o.w + k]; if (!c) continue;
    const X = o.x + k, Y = o.y + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const i = Y * W + X;
    F[i] = c; owner[i] = o.foot; glow[i] = o.emit[j * o.w + k]; bare[i] = o.person ? 1 : 0;
    N.set(o.nrm.subarray((j * o.w + k) * 3, (j * o.w + k) * 3 + 3), i * 3);
    Gy[i] = o.foot; Z[i] = Math.max(0, o.foot - Y);
  }
  if (SEASON === 3) winter(F, N, mat, WD, owner, bare, W, H);
  for (const o of objects) {
    if (o.flat) continue;
    for (let j = 0; j < o.h; j++) for (let k = 0; k < o.w; k++) {
      const c = o.px[j * o.w + k]; if (!c) continue;
      const X = o.x + k, Y = 2 * o.foot - (o.y + j); if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const m = mat[Y * W + X]; if ((m !== 4 && m !== 6) || owner[Y * W + X] >= 0) continue;
      if ((Y + (X >> 3)) % 4 === 0) continue;
      const [r, g, b] = unpack(c), [wr, wg, wb] = unpack(F[Y * W + X]);
      F[Y * W + X] = pack([wr * .58 + r * .3, wg * .58 + g * .32, wb * .62 + b * .3]);
    }
  }
  const solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) solid[i] = [4, 6, 7, 8, 9, 13].includes(mat[i]) ? 1 : 0;
  for (const o of objects) if (o.block) { const [bw, bh] = o.block; for (let y = o.foot - bh; y < o.foot; y++) for (let x = Math.round(o.fxw - bw / 2); x < o.fxw + bw / 2; x++) if (x >= 0 && y >= 0 && x < W && y < H) solid[y * W + x] = 1; }
  const h = objects.find(o => o.house);
  const at = key => { const o = objects.find(o => o[key]); return o ? [o.fxw, o.foot] : null; };
  const spots = objects.filter(o => o.spot).map(o => ({x: o.fxw, y: o.foot, ...o.spot}));
  return {map, W, H, F, N, Gy, Z, owner, glow, mat, wd: WD, solid, objects, cliffFoot, tideE, spots, door: h ? [h.fxw, h.foot + 2] : null, bin: at('bin'), mailbox: at('mailbox'),
    chimney: h ? [h.x + 132, h.y + 16] : null, fall: def.fall || null, river: def.river || 0};
}

/**
 * Light the prepared scene for an hour, a few rows at a time (a generator: the game runs it across frames so time can
 * pass without a stall). When it is done the scene has px (the picture), shadow, light (what light reaches each pixel,
 * for things drawn later), sun and lamps.
 */
export function* lightSteps(S, hour, {live = false, rows = 20, extra = []} = {}) {
  const {F, N, Gy, Z, owner, glow, mat, objects, W, H} = S;
  setFrame(W, H); // the vignette over this map
  const sun = sunAt(hour === 'day' ? 15 : hour === 'night' ? 22 : hour, SEASON);
  const got = {}; yield* shadowSteps(W, H, objects, sun, got); const shadow = got.shadow;
  yield;
  // at the foot of a cliff, its shade
  for (let x = 0; x < W; x++) { const f = S.cliffFoot?.[x]; if (!f) continue; for (let y = f - 2; y < Math.min(H, f + 10); y++) shadow[y * W + x] = Math.max(shadow[y * W + x], (1 - (y - f + 2) / 12) * .55); }
  const cloud = new Float32Array(W * H);
  if (!sun.night) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = noise(x + y * .5, y, 160, 77); cloud[y * W + x] = Math.max(0, Math.min(.35, (c - .64) * 2.2)); }
  // the scene's own lamps, and what the player has set down (campfires: lit after dusk like the rest)
  const dusk = sun.night ? 1 : Math.max(0, Math.min(1, (sun.hour - 18.4) / 1.4));
  const lamps = lampsOf(objects, sun).concat(dusk ? extra.map(l => ({...l, k: l.k * dusk})) : []);
  yield;
  const out = new Float32Array(W * H * 3), light = new Float32Array(W * H * 3), n = [0, 0, 0], emitted = new Float32Array(W * H), ONE = [1, 1, 1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, a = unpack(F[i]), m = mat[i];
      n[0] = N[i * 3]; n[1] = N[i * 3 + 1]; n[2] = N[i * 3 + 2];
      const s = owner[i] >= 0 ? shadow[Math.min(H - 1, Gy[i]) * W + x] * Math.max(0, 1 - Z[i] / 18) : shadow[i];
      const vis = Math.max(0, 1 - s * .92) * (1 - cloud[i]);
      const [lr, lg, lb] = shade(ONE, n, x, Gy[i], Z[i], vis, sun, lamps);
      light[i * 3] = lr; light[i * 3 + 1] = lg; light[i * 3 + 2] = lb;
      let r = a[0] * lr, g = a[1] * lg, b = a[2] * lb;
      if (glow[i] && (sun.night || lamps.length)) { const k = sun.night ? 1 : Math.min(1, (sun.hour - 18.4) / 1.4), lum = .75 + (a[0] + a[1] + a[2]) / 765 * .45; r = lerp(r, 360 * lum, k); g = lerp(g, 280 * lum, k); b = lerp(b, 150 * lum, k); emitted[i] = k; }
      out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
    }
    if (y % rows === rows - 1) yield;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 && y % (rows * 3) === 0) yield;
    const i = y * W + x, m = mat[i]; if ((m !== 4 && m !== 6) || owner[i] >= 0 || live) continue;
    if (!sun.night && (x + Math.floor(y / 2) * 11) % 31 < 3 && hash(Math.floor(x / 31), y >> 1, 4) > .55) { const k = 30 + 40 * sun.up; out[i * 3] += k; out[i * 3 + 1] += k * 1.1; out[i * 3 + 2] += k; }
    if (!sun.night && hash(x, y, 33) > .992 && noise(x, y, 20, 34) > .55) { const k = 110 * sun.up + 60; out[i * 3] += k; out[i * 3 + 1] += k; out[i * 3 + 2] += k * .9; }
    if (sun.night) {
      const band = Math.sin(x / 52 + Math.sin(y / 31) * 1.6 + y / 90), band2 = Math.sin(x / 33 - y / 64 + 2);
      if (band > .45) { const k = (band - .45) * 1.2; out[i * 3] += 16 * k; out[i * 3 + 1] += 90 * k; out[i * 3 + 2] += 64 * k; }
      if (band2 > .62) { const k = (band2 - .62) * 1.6; out[i * 3] += 56 * k; out[i * 3 + 1] += 32 * k; out[i * 3 + 2] += 92 * k; }
      if (hash(x, y, 81) > .996) { out[i * 3] += 160; out[i * 3 + 1] += 180; out[i * 3 + 2] += 210; }
    }
  }
  if (sun.night && !live) for (let k = 0; k < 150; k++) { const x = hash(k, 1, 91) * W | 0, y = 7 * T + hash(k, 2, 91) * (H - 14 * T) | 0, i = y * W + x; out[i * 3] += 200; out[i * 3 + 1] += 250; out[i * 3 + 2] += 120; for (const d of [1, -1, W, -W]) { out[(i + d) * 3] += 60; out[(i + d) * 3 + 1] += 90; out[(i + d) * 3 + 2] += 30; } }
  yield;
  // sun shafts along the light, soft (kept in the light map too, so things drawn later share them)
  if (!sun.night && sun.up < .9) {
    const [Lx, Ly] = sun.L, strength = (.5 + sun.golden) * .35;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x * Ly - y * Lx, beam = Math.max(0, Math.sin(u / 38 + noise(u, 0, 80, 71) * 4) * .5 + noise(x, y, 90, 72) - .62) * strength;
        if (beam > 0) { const i = y * W + x; out[i * 3] += 120 * beam * sun.sun[0]; out[i * 3 + 1] += 100 * beam * sun.sun[1]; out[i * 3 + 2] += 60 * beam * sun.sun[2]; light[i * 3] += .45 * beam * sun.sun[0]; light[i * 3 + 1] += .38 * beam * sun.sun[1]; light[i * 3 + 2] += .22 * beam * sun.sun[2]; }
      }
      if (y % (rows * 2) === rows * 2 - 1) yield;
    }
  }
  // glow: lit glass and lamp heads spill a warm haze; very bright things bloom a little by day; mist at the waterfall
  // (worked out at half size: once blurred, nobody can tell)
  const W2 = W >> 1, H2 = H >> 1, bright = new Float32Array(W2 * H2 * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 && y % (rows * 4) === 0) yield;
    const i = y * W + x, j = ((y >> 1) * W2 + (x >> 1)) * 3;
    if (emitted[i]) { bright[j] += 75 * emitted[i]; bright[j + 1] += 50 * emitted[i]; bright[j + 2] += 22 * emitted[i]; continue; }
    const l = (out[i * 3] + out[i * 3 + 1] + out[i * 3 + 2]) / 3; if (l > 250) { const k = (l - 250) / 80 * .125; bright[j] += out[i * 3] * k; bright[j + 1] += out[i * 3 + 1] * k; bright[j + 2] += out[i * 3 + 2] * k; }
  }
  yield;
  blur3(bright, W2, H2, 4); yield; blur3(bright, W2, H2, 4); yield; blur3(bright, W2, H2, 3); yield;
  for (let i = 0; i < W2 * H2 * 3; i++) bright[i] *= 2.2;
  if (S.fall) for (let y = 6 * T; y < 9 * T; y += 2) for (let x = 43 * T; x < 48 * T; x += 2) { const d = Math.hypot((x - 45.5 * T) / 1.4, y - 7 * T - 6) / 34; if (d < 1) { const k = (1 - d) ** 2 * (sun.night ? 28 : 60), j = ((y >> 1) * W2 + (x >> 1)) * 3; bright[j] += k; bright[j + 1] += k * 1.05; bright[j + 2] += k * 1.05; } }
  const px = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) { const i = y * W + x, j = ((y >> 1) * W2 + (x >> 1)) * 3; px[i] = finish(out[i * 3] + bright[j] * .55, out[i * 3 + 1] + bright[j + 1] * .55, out[i * 3 + 2] + bright[j + 2] * .55, x, y, sun); }
    if (y % (rows * 2) === rows * 2 - 1) yield;
  }
  Object.assign(S, {px, shadow, light, sun, lamps});
}
/** The last touch every pixel gets, the world's and things drawn over it alike: a little more colour, a soft vignette,
 *  a shoulder for the brightest. */
// the size the vignette is worked out over: the farm, or the room one is in
let FW = W, FH = H;
export function setFrame(w, h) { FW = w; FH = h; }
export function finish(r, g, b, x, y, sun) {
  const l = (r + g + b) / 3; r = l + (r - l) * 1.12; g = l + (g - l) * 1.1; b = l + (b - l) * 1.05;
  const vx = x / FW - .5, vy = y / FH - .5, v = 1 - (vx * vx + vy * vy) * (sun.night ? .7 : .3);
  return pack([tone(r * v), tone(g * v), tone(b * v)]);
}
/** All at once (for pictures and tests): the scene lit for an hour. */
export function render(hour = 15, {map = 'farm', without = [], layers = false, live = false, season = 0} = {}) {
  const S = prepare({map, without, season});
  for (const _ of lightSteps(S, hour, {live})) { /* run to the end */ }
  return layers ? S : S.px;
}
// a soft shoulder: values above 190 are eased in, so very bright things keep their colour instead of burning white
const tone = v => v <= 190 ? v : 190 + (v - 190) / (1 + (v - 190) / 140);
function blur3(A, W, H, R) {
  const T2 = new Float32Array(A.length), n = R * 2 + 1;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < H; y++) { let run = 0; for (let x = -R; x < W + R; x++) { const a = x + R, b = x - R - 1; if (a < W) run += A[(y * W + a) * 3 + c]; if (b >= 0) run -= A[(y * W + b) * 3 + c]; if (x >= 0 && x < W) T2[(y * W + x) * 3 + c] = run / n; } }
    for (let x = 0; x < W; x++) { let run = 0; for (let y = -R; y < H + R; y++) { const a = y + R, b = y - R - 1; if (a < H) run += T2[(a * W + x) * 3 + c]; if (b >= 0) run -= T2[(b * W + x) * 3 + c]; if (y >= 0 && y < H) A[(y * W + x) * 3 + c] = run / n; } }
  }
}
