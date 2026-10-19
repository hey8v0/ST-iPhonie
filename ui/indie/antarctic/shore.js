// 南极结界 · 鲸湾郊外 · 东海岸: the first place to explore, east of the farm. A grassy bluff with dunes falls to a dry
// beach, then a wide tidal flat — wet sand with ripples, reef rocks, tide pools — out to the sea; a sandbar runs to a
// rocky islet with one of the 知识库's old tide markers; in the east a headland ends in a sea cliff with a cave at its
// foot. The flat is drawn as at low tide; the game floods it with the tide as the hours go (tideE: how high each pixel
// of the flat lies, 0 at the low-water line … 1 at the dry beach). Things here: a whale's bones half in the sand, a
// fishing boat run aground, driftwood, a signpost back to the farm.
import {insideDistance} from './light.js';
import {object, cylinder, norm, C, hash, noise, pine, bush, rock} from './assets.js';

const T = 16, TW = 64, TH = 40, W = TW * T, H = TH * T;
const pack = ([r, g, b]) => ((255 << 24) | (Math.max(0, Math.min(255, b | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, r | 0))) >>> 0;
const unpack = c => [c & 255, c >>> 8 & 255, c >>> 16 & 255];
const dim = (c, k) => { const [r, g, b] = unpack(c); return pack([r * k, g * k, b * k]); };
const cs = list => list.map(C);

// materials (shared with the farm where they mean the same): 1 grass, 2 path, 5 dry sand, 6 sea, 7 cliff, 8 forest,
// 11 tidal flat, 12 reef rock, 13 tide pool, 14 islet rock, 15 the cave's mouth
const GRASS = [cs(['#2e5824', '#3f722c', '#548c35', '#73a843', '#9bc957']), cs(['#2c6422', '#3a7c2a', '#4f9632', '#6cb43e', '#93d050']), cs(['#5a5422', '#76702e', '#928a3c', '#ae9f4a', '#c9b45e']), cs(['#3c4e36', '#4c5e44', '#5e6e52', '#728262', '#8a9878'])];
const SAND = cs(['#b8955a', '#d0b071', '#ddc286', '#e8d29e']), WET = cs(['#8e7048', '#a0805a', '#b09068', '#bea078']), REEF = cs(['#3e3a3a', '#55504c', '#6e665e', '#867c70']);
const SEA = cs(['#79dccb', '#4ec4c2', '#2aa6b8', '#1c8aa8', '#156f94', '#0f5a82']), POOL = cs(['#8ae0d0', '#5ccac4', '#36aebc', '#2290aa']);
const STONE = cs(['#4f3220', '#6d4529', '#8c5a35', '#aa7244', '#c48f5c']);

function stones(x, y, cw, ch, seed) {
  const row = Math.floor(y / ch), off = (row % 2) * cw / 2, gx = Math.floor((x + off) / cw);
  let d1 = 1e9, d2 = 1e9, best = null;
  for (let r = row - 1; r <= row + 1; r++) for (let c = gx - 1; c <= gx + 1; c++) {
    const o = (r % 2) * cw / 2, px = c * cw - o + cw * (.1 + hash(c, r, seed) * .8), py = r * ch + ch * (.1 + hash(c, r, seed + 1) * .8);
    const big = .75 + hash(c, r, seed + 4) * .6, d = Math.hypot((x - px) / 1.15, y - py) / big;
    if (d < d1) { d2 = d1; d1 = d; best = [px, py, c, r]; } else if (d < d2) d2 = d;
  }
  return {edge: d2 - d1, dx: (x - best[0]) / (cw * .45), dy: (y - best[1]) / (ch * .5), id: hash(best[2], best[3], seed + 2)};
}

// the lie of the land, tile by tile
function tileAt(tx, ty) {
  const n = noise(tx * 16, ty * 16, 90, 3), m = noise(tx * 16, ty * 16, 40, 4);
  if (tx >= 50) { // the headland: forest on top, a cliff facing us, the cave at its foot, then the flat and the sea
    if (ty < 16) return ty < 3 ? '#' : 'h';
    if (ty < 20) return tx >= 55 && tx <= 56 && ty === 19 ? 'v' : 'C';
  }
  if (ty < 3 + Math.round(n * 1.6)) return '#';
  const path = (ty === 7 || ty === 8) && tx < 19 || (tx === 18 || tx === 19) && ty >= 7 && ty < 15;
  if (path) return 'p';
  if (ty < 10 + Math.round(n * 2)) return 'g';
  if (ty < 14 + Math.round(m * 2)) return 'd';
  if (ty < 19 + Math.round(n * 1.5) && tx < 50) return 's';
  // the islet and the sandbar out to it
  if (Math.hypot((tx - 53) / 3.2, (ty - 32.5) / 2.2) < 1) return 'k';
  if (ty >= 26 && ty <= 32 && Math.abs(tx - (46.5 + (ty - 26) * 1.05)) < 2.3) return 't';
  if (ty < 28 + Math.round(m * 2.5)) {
    const reef = noise(tx * 16, ty * 16, 28, 7);
    if (reef > .64) return noise(tx * 16, ty * 16, 12, 8) > .7 ? 'o' : 'r';
    return 't';
  }
  return 'S';
}
const MAT = {g: 1, p: 2, d: 5, s: 5, S: 6, C: 7, '#': 8, h: 16, t: 11, r: 12, o: 13, k: 14, v: 15};
// soft edges: like the farm, a pixel looks up the map a little way off along noise (but cliffs and the islet stay crisp)
const HARD = new Set(['C', '#', 'v', 'h']);
function material(x, y) {
  const t = tileAt(x / T | 0, y / T | 0);
  if (HARD.has(t)) return t;
  const dx = (noise(x, y, 11, 1) - .5) * 12, dy = (noise(x, y, 11, 2) - .5) * 12, u = tileAt((x + dx) / T | 0, (y + dy) / T | 0);
  return HARD.has(u) ? t : u;
}

function terrain(season) {
  const B = new Uint32Array(W * H), mat = new Uint8Array(W * H), CN = new Float32Array(W * H * 3), cliffFoot = new Int16Array(W), WD = new Uint8Array(W * H);
  const kind = new Uint8Array(W * H); // 1 dune (sand with marram)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = material(x, y); mat[y * W + x] = MAT[t]; if (t === 'd') kind[y * W + x] = 1; }
  const at = (x, y) => mat[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const g = GRASS[season];
  // how high each pixel of the shore lies: from the low-water line (0) up to the dry beach (1)
  const wetOrSea = i => mat[i] === 6 || mat[i] === 11 || mat[i] === 12 || mat[i] === 13;
  const dSea = insideDistance(i => mat[i] !== 6, W, H, 220), dLand = insideDistance(wetOrSea, W, H, 220);
  const tideE = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const m = mat[i]; if (m !== 11 && m !== 12 && m !== 13) { tideE[i] = m === 6 ? -1 : 2; continue; }
    let e = dSea[i] / (dSea[i] + dLand[i] + .01);
    if (m === 12) e += .12; if (m === 13) e -= .08;
    tideE[i] = Math.max(0, Math.min(1, e));
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i], n = noise(x, y, 24) * .55 + noise(x, y, 7, 3) * .45, r = hash(x, y, 7);
    let c = 0;
    CN[i * 3 + 2] = 1;
    if (m === 1 || m === 16) { c = n < .28 ? g[1] : n < .6 ? g[2] : n < .82 ? g[3] : g[4]; if (r > .99) c = g[0]; if (m === 16) c = dim(c, .8); } // 16: up on the headland, out of reach
    else if (m === 2) { c = n < .3 ? C('#7c4f2e') : n < .62 ? C('#9a6639') : n < .85 ? C('#b98048') : C('#d39d60'); if (r > .975) c = C('#e2c492'); }
    else if (m === 5) { c = n < .35 ? SAND[1] : n < .75 ? SAND[2] : SAND[3]; if (r > .99) c = C('#fff8ea'); else if (r > .98) c = SAND[0]; }
    else if (m === 8) { c = n < .5 ? C('#0c2219') : C('#133325'); }
    else if (m === 11) { // wet sand: darker, ripples the water left, a shell here and there, worm casts
      const ripple = ((y + Math.sin(x * .16 + noise(x, y, 30, 5) * 4) * 3) % 6 + 6) % 6;
      c = ripple < 1 ? WET[0] : ripple < 2.5 ? WET[2] : n < .5 ? WET[1] : WET[2];
      if (r > .992) c = C('#f2e6d0'); else if (r > .985) c = C('#6e5434');
    }
    else if (m === 12) { // reef rock: rounded boulders packed together, dark crevices, barnacles on top, weed at the foot
      const st = stones(x, y, 11, 8, 71), dy = Math.max(-1, Math.min(1, st.dy)), dx = Math.max(-1, Math.min(1, st.dx));
      if (st.edge < .9) { c = st.edge < .4 ? C('#1e1c1c') : REEF[0]; CN[i * 3 + 1] = .7; CN[i * 3 + 2] = .7; }
      else {
        const base = REEF[1 + Math.floor(st.id * 3)];
        c = dy < -.5 ? dim(base, 1.15) : dy > .55 ? dim(base, .78) : base;
        if (dy < -.2 && hash(x, y, 12) > .9) c = C('#d8d0c0');
        if (dy > .55 && hash(x, y, 13) > .45) c = hash(x, y, 14) > .5 ? C('#3e5e34') : C('#5e5226');
        const nx = dx * .7, ny = .3 + dy * .5, nz = .8 - dy * .3, l = Math.hypot(nx, ny, nz); CN[i * 3] = nx / l; CN[i * 3 + 1] = ny / l; CN[i * 3 + 2] = nz / l;
      }
      if (at(x, y + 1) !== 12 && at(x, y + 1) !== 13) c = C('#1e1c1c');
    }
    else if (m === 13) c = POOL[0];
    else if (m === 14) {
      const st = stones(x, y, 14, 9, 81); c = st.edge < .7 ? REEF[0] : st.dy < -.4 ? REEF[3] : st.dy > .5 ? REEF[1] : REEF[2];
      if (hash(x, y, 15) > .95) c = C('#ece6dc'); if (st.dy < -.6 && hash(x, y, 16) > .9 && season < 3) c = C('#e88ab0');
      const l = Math.hypot(st.dx * .5, .3 + st.dy * .4, .8); CN[i * 3] = st.dx * .5 / l; CN[i * 3 + 1] = (.3 + st.dy * .4) / l; CN[i * 3 + 2] = .8 / l;
    }
    else if (m === 15) c = C('#0c1416');
    B[i] = c;
  }
  // water: the sea deepening away from the low-water line, tide pools clear to their bottom with anemones
  const WDF = insideDistance(i => mat[i] === 6 || mat[i] === 13, W, H, 14);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, m = mat[i]; if (m !== 6 && m !== 13) continue;
    const d = Math.max(1, Math.round(WDF[i])); WD[i] = d;
    if (m === 13) { let c = POOL[Math.min(3, Math.floor(d / 2))]; if (hash(x, y, 16) > .985) c = hash(x, y, 17) > .5 ? C('#ff8fb1') : C('#7ad0a0'); if (d === 1) c = C('#3a3430'); B[i] = c; continue; }
    const dd = d + (noise(x, y, 6, 19) - .5) * 3 + Math.max(0, y - 30 * T) / 12;
    let c = SEA[Math.min(5, Math.max(0, Math.floor(dd / 2.4)))];
    if (dd < 5 && noise(x, y, 4, 20) > .64) c = C('#a8e6cf');
    B[i] = c;
  }
  // the cliff of the headland: stones bulging toward us (their own normals), a grass lip above, dark at its foot
  for (let x = 50 * T; x < W; x++) {
    const top = 16 * T + Math.round((noise(x, 0, 9, 5) - .5) * 8), foot = 20 * T + Math.round((noise(x, 1, 11, 6) - .5) * 4); cliffFoot[x] = foot;
    for (let y = top - 3; y < foot; y++) {
      const i = y * W + x; if (mat[i] === 15) { CN[i * 3 + 1] = 1; CN[i * 3 + 2] = 0; cliffFoot[x] = foot; continue; }
      mat[i] = y < top ? 8 : 7;
      if (y < top) { B[i] = y < top - 1 ? GRASS[season][3] : GRASS[season][2]; continue; }
      const st = stones(x, y, 15, 10, 61), k = (y - top) / (foot - top), lip = y < top + 3;
      if (lip) { B[i] = y === top + 2 ? GRASS[season][0] : GRASS[season][2]; CN[i * 3 + 1] = .7; CN[i * 3 + 2] = .7; continue; }
      if (hash(x >> 1, 7, 3) > .9 && y < top + 10 && (x & 1) === 0) { B[i] = (y + x) % 5 === 0 ? GRASS[season][3] : GRASS[season][1]; CN[i * 3 + 1] = 1; CN[i * 3 + 2] = 0; continue; } // vines
      const base = st.id < .3 ? STONE[2] : st.id < .65 ? STONE[3] : st.id < .9 ? STONE[4] : STONE[1];
      if (st.edge < 1.3) { B[i] = st.edge < .6 ? STONE[0] : dim(STONE[1], .85); CN[i * 3 + 1] = .86; CN[i * 3 + 2] = .5; }
      else {
        B[i] = st.dy < -.55 ? dim(base, 1.08) : st.dy > .6 ? dim(base, .86) : base;
        const nx = Math.max(-1, Math.min(1, st.dx)) * .7, ny = .86 + Math.max(-1, Math.min(1, st.dy)) * .25, nz = .5 - Math.max(-1, Math.min(1, st.dy)) * .55, l = Math.hypot(nx, ny, nz);
        CN[i * 3] = nx / l; CN[i * 3 + 1] = ny / l; CN[i * 3 + 2] = nz / l;
      }
      if (k > .9) B[i] = dim(B[i], .65);
    }
  }
  // the cave's mouth: an arch of darkness with a faint glow deep inside
  for (let y = 18 * T; y < 20 * T; y++) for (let x = 54 * T + 8; x < 57 * T + 8; x++) {
    const u = (x - 56 * T) / 22, v = (y - 20 * T) / 26; if (u * u + v * v > 1) continue;
    const i = y * W + x; mat[i] = 15; B[i] = u * u + v * v > .8 ? C('#2a2420') : hash(x, y, 18) > .97 ? C('#3aa8a0') : C('#0c1416'); CN[i * 3 + 1] = 1; CN[i * 3 + 2] = 0;
  }
  // where the land meets the sea at its lowest: a band of foam on the sand
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) if (mat[y * W + x] === 6 && (at(x, y - 1) === 11 || at(x, y - 1) === 12) && hash(x, y, 19) > .2) B[y * W + x] = C('#e8fff8');
  // grass detail on the bluff
  for (let i = 0; i < 1600; i++) {
    const x = 3 + hash(i, 1, 31) * (W - 6) | 0, y = 3 + hash(i, 2, 31) * (H - 6) | 0;
    if (at(x, y) !== 1 || at(x, y + 3) !== 1 || at(x + 3, y) !== 1 || at(x - 3, y) !== 1) continue;
    for (const [dx, h, c] of [[-1, 3, g[3]], [0, 4, g[4]], [1, 3, g[2]]]) for (let k = 0; k < h; k++) B[(y - k) * W + x + dx] = k === h - 1 ? c : g[1];
  }
  // marram grass on the dunes: tall pale blades in clumps
  for (let i = 0; i < 900; i++) {
    const x = 4 + hash(i, 3, 32) * (W - 8) | 0, y = 4 + hash(i, 4, 32) * (H - 8) | 0; if (!kind[y * W + x] || season === 3) continue;
    for (let k = 0; k < 5; k++) { const bx = x + k - 2, h = 4 + (k % 2) * 3; for (let j = 0; j < h; j++) B[(y - j) * W + bx + (j > h - 2 ? Math.sign(k - 2) : 0)] = j > h - 3 ? C('#d8d090') : C('#a8a860'); }
  }
  return {B, mat, CN, cliffFoot, WD, tideE};
}

// ── things on the shore ──────────────────────────────────────────────────────────────────────────────────────────
const BONE = cs(['#8a8070', '#b8ae9a', '#d8d0bc', '#efe9da']);
function whalebone() { // ribs rising out of the sand in a row of arches, the long jaw lying beside
  return object(72, 52, set => {
    for (let k = 0; k < 6; k++) {
      const cx = 10 + k * 10, h = 40 - Math.abs(k - 2.5) * 5, w = 9;
      for (let t = 0; t <= 1; t += .02) {
        const a = Math.PI * t, x = cx + Math.cos(a) * w * .5 * (1 + (1 - t) * .1), y = 50 - Math.sin(a) * h;
        for (let s = 0; s < 3; s++) set(x + s * .7 - 1, y, BONE[s === 0 ? 3 : s === 1 ? 2 : 1], norm(Math.cos(a) * .6, .6, Math.sin(a) * .5));
      }
    }
    for (let x = 4; x < 68; x++) { set(x, 50, BONE[1], [0, 0, 1]); set(x, 51, BONE[0], [0, 1, 0]); }
    for (let k = 0; k < 5; k++) set(14 + k * 12, 49, C('#c8b890'));
  }, {round: 2, fx: 36, fy: 51, shapes: [{t: 'box', x0: -32, x1: 32, y0: -2, y1: 0, h: 30}]});
}
function wreck() { // a small fishing boat run aground, seen from above at the slant: a pointed hull, the rim, thwarts
  // across the inside, sand blown into it; the near side shows its planks; a mast broken off short, a lamp with no glass
  const wood = cs(['#3e3834', '#5e5650', '#7e766c', '#a09888', '#c4bcae']);
  return object(80, 46, set => {
    const half = u => 13 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), .55), cy = u => 18 + u * 4; // tilted a little
    for (let x = 4; x < 76; x++) {
      const u = (x - 4) / 72, w = half(u), c0 = cy(u); if (w < 1) continue;
      for (let y = Math.round(c0 - w); y <= c0 + w; y++) { // the inside, from the far rim to the near rim
        const v = (y - (c0 - w)) / (2 * w), rim = y < c0 - w + 2 || y > c0 + w - 2;
        let c = rim ? wood[4] : v < .3 ? wood[0] : (x % 12 < 2 ? wood[3] : v > .7 && hash(x, y, 7) > .4 ? C('#c8b080') : wood[1]);
        set(x, y, c, rim ? norm(0, .2, 1) : norm(0, -.5, .85));
      }
      for (let y = Math.round(c0 + w + 1); y < c0 + w + 9 - Math.abs(u - .5) * 6; y++) { // the near side of the hull
        const plank = Math.floor((y - c0 - w) / 2.6);
        set(x, y, hash(x, y, 9) > .96 ? wood[0] : wood[1 + (plank + (x >> 4)) % 3], norm(0, 1, -.15));
      }
    }
    for (let k = 0; k < 9; k++) { set(30, 20 - k, wood[3]); set(31, 20 - k, wood[1]); } // the mast's stump
    for (let y = 6; y < 11; y++) for (let x = 66; x < 71; x++) set(x, y, y === 6 ? C('#3a3546') : (x + y) % 3 ? C('#4a4458') : C('#9ab8c0')); // the bow lamp
    for (let y = 11; y < 16; y++) set(68, y, C('#3a3546'));
  }, {round: 3, fx: 40, fy: 40, shapes: [{t: 'box', x0: -36, x1: 36, y0: -24, y1: 0, h: 10}]});
}
function marker() { // the 知识库's tide marker: a square stone post, rings of measure cut in it, runes, barnacles low down
  return object(18, 50, set => {
    for (let y = 2; y < 48; y++) for (let x = 3; x < 15; x++) {
      const face = x < 9, lv = y % 6 === 0, rune = (x === 6 || x === 11) && y > 6 && y < 20 && hash(x, y >> 1, 4) > .45;
      let c = face ? (lv ? C('#6a6a76') : C('#9a9aa8')) : (lv ? C('#565662') : C('#7c7c8a'));
      if (rune) c = C('#5ab4c8'); if (y > 36 && hash(x, y, 5) > .55) c = C('#d8d0c0'); if (y > 42) c = hash(x, y, 6) > .5 ? C('#4a6a3a') : C('#3a4a34');
      set(x, y, c, face ? [0, 1, 0] : norm(.7, .7, 0), rune);
    }
    for (let x = 2; x < 16; x++) { set(x, 1, C('#b4b4c0'), [0, 0, 1]); set(x, 2, C('#9a9aa8'), [0, 0, 1]); }
  }, {round: 2, fx: 9, fy: 48, shapes: [{t: 'box', x0: -6, x1: 6, y0: -4, y1: 0, h: 46}]});
}
function driftwood(seed) {
  return object(30, 10, set => {
    const tilt = (hash(seed, 1) - .5) * .3;
    for (let x = 2; x < 28; x++) { const y = 5 + (x - 15) * tilt; set(x, y, C('#c8bca8'), [0, 0, 1]); set(x, y + 1, C('#a8a090'), [0, 1, 0]); set(x, y + 2, C('#7a7064'), [0, 1, 0]); }
    for (const [x, d] of [[8, -1], [20, 1]]) for (let k = 0; k < 4; k++) set(x + k, 4 - k * d * .7 + (x - 15) * tilt, C('#b8ac98'));
  }, {round: 2, fx: 15, fy: 8, shapes: []});
}
function signpost() {
  return object(22, 30, set => {
    for (let y = 8; y < 29; y++) { set(10, y, C('#8a5a35'), [0, 1, 0]); set(11, y, C('#6d4529'), [0, 1, 0]); }
    for (let y = 4; y < 12; y++) for (let x = 1; x < 20; x++) { const tip = x < 4 && Math.abs(y - 8) > x; if (tip) continue; set(x, y, y === 4 ? C('#d8b080') : (x + y) % 7 ? C('#b08050') : C('#9a6a40'), [0, 1, 0]); }
    for (const x of [7, 9, 12, 14, 16]) set(x, 8, C('#4a2e1c'), [0, 1, 0]);
  }, {round: 2, fx: 11, fy: 28, shapes: [{t: 'cyl', x: 0, y: -1, r: 1.5, h: 26}]});
}

function objects() {
  const list = [], put = (o, x, footY, extra = {}) => list.push({...o, x: Math.round(x - o.fx), y: Math.round(footY - o.fy), foot: Math.round(footY), fxw: Math.round(x), ...extra});
  // pines along the top and over the headland
  for (let row = 0; row < 3; row++) for (let i = 0; i < 36; i++) { const x = i * 30 + (row % 2) * 15 + hash(i, row, 41) * 10 - 6; put(pine(i * 7 + row), x, 22 + row * 14 + hash(i, row, 42) * 6, {block: [10, 6]}); }
  for (let row = 0; row < 6; row++) for (let i = 0; i < 6; i++) { if (hash(i, row, 44) > .72) continue; const x = 50.5 * T + i * 30 + (row % 2) * 15 + hash(i, row, 45) * 10, y = 5 * T + row * 26 + hash(i, row, 43) * 10; if (y < 15.4 * T) put(pine(i * 11 + row + 3), x, y, {block: [10, 6]}); }
  for (const [tx, ty, s] of [[8.4, 10.6, 1], [27.2, 9.8, 2], [36.6, 11.2, 3]]) put(bush(s, s === 2 ? '#e2404f' : ''), tx * T, ty * T, {block: [24, 7]});
  for (const [tx, ty, s, big] of [[12.4, 16.2, 1, 0], [33.6, 17.4, 2, 1], [47.2, 16.8, 3, 0]]) put(rock(s, big), tx * T, ty * T, {block: big ? [24, 8] : [14, 6]});
  put(signpost(), 3.4 * T, 9.6 * T, {block: [6, 3], spot: {kind: 'say', say: '路牌：← 鲸湾郊外 · 农场'}});
  put(whalebone(), 24 * T, 17.6 * T, {block: [60, 4], spot: {kind: 'lore', id: 'whalebone'}});
  put(wreck(), 40.5 * T, 18.4 * T, {block: [66, 22], spot: {kind: 'lore', id: 'wreck'}});
  put(marker(), 53 * T, 31.4 * T, {block: [12, 5], spot: {kind: 'lore', id: 'marker'}});
  for (const [tx, ty, s] of [[15.6, 17.8, 1], [31.2, 16.4, 2], [46.4, 18.8, 3]]) put(driftwood(s), tx * T, ty * T, {block: [26, 3]});
  return list.sort((a, b) => a.foot - b.foot);
}

/** The shore for farm.js's list of maps; entries: where one comes in. cave: the mouth in the cliff (for the game). */
export const SHORE = {W, H, terrain, objects, tide: true, entry: {west: [1.2 * T, 8.4 * T, 'right']}, cave: [56 * T, 20 * T + 2]};
/** The landmarks' pictures, for the 见闻录. */
export const LORE_ART = {whalebone, wreck, marker};
void cylinder;
