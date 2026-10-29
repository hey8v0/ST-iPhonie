// Our own textures, drawn here pixel by pixel (16×16, RGBA): every block face and item the game uses, under the names
// the game's resource packs use, so a pack the player imports simply takes their place name by name. Grass, leaves and
// water are drawn in grey and tinted by the biome when the world is drawn, like the game does. Animated ones (water,
// lava) have several frames.
import {rng, hash} from './noise.js';
import {COLORS} from './blocks.js';

const S = 16;
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const nameSeed = name => { let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return h | 0; };

/** A 16×16 picture to draw on. */
function pic(w = S, h = S) {
  const d = new Uint8ClampedArray(w * h * 4);
  const p = {w, h, d,
    set(x, y, c, a = 255) { x = (x % w + w) % w; y = (y % h + h) % h; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; },
    get(x, y) { x = (x % w + w) % w; y = (y % h + h) % h; const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; },
    alpha(x, y) { return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]; },
    fill(c, a = 255) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, c, a); return p; },
    rect(x0, y0, x1, y1, c, a = 255) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, c, a); return p; },
    copy() { const q = pic(w, h); q.d.set(d); return q; },
  };
  return p;
}
/** Tileable smooth noise in [0, 1] over a 16×16 picture: `cells` across, bilinear with smoothstep. */
function tileNoise(seed, cells = 4) {
  const r = rng(seed), g = Array.from({length: cells * cells}, r), at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
  return (x, y) => {
    const fx = x / S * cells, fy = y / S * cells, i = Math.floor(fx), j = Math.floor(fy);
    let tx = fx - i, ty = fy - j; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * ty;
  };
}
const pick = (pal, v) => hex(pal[clamp(Math.floor(v * pal.length), 0, pal.length - 1)]);
/** A mottled surface: a palette chosen by a mix of smooth noise and per-pixel grain. */
function mottled(seed, pal, {cells = 4, grain = 0.35, smooth = 0.65, fine = 8} = {}) {
  const p = pic(), a = tileNoise(seed, cells), b = tileNoise(seed + 7, fine), r = rng(seed + 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, pick(pal, clamp(a(x, y) * smooth + b(x, y) * (1 - smooth) * 0.6 + (r() - 0.5) * grain + (1 - smooth) * 0.2, 0, 0.999)));
  return p;
}
/** Specks: n little clusters of a colour (ores, pebbles). */
function specks(p, seed, n, colors, {size = 2, avoid = null} = {}) {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const cx = Math.floor(r() * S), cy = Math.floor(r() * S);
    const cells = size <= 1 ? [[0, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 2 + Math.floor(r() * (size + 2)));
    cells.forEach(([dx, dy], i) => { if (!avoid || !avoid(cx + dx, cy + dy)) p.set(cx + dx, cy + dy, hex(colors[Math.min(colors.length - 1, i === 0 ? 0 : 1 + Math.floor(r() * (colors.length - 1)))])); });
  }
  return p;
}
/**
 * Voronoi stones (cobblestone, gravel, cobbled deepslate, glowstone): each stone its own shade, a one-pixel seam along
 * its right and bottom edges, lit from the top left (a light rim) and darker towards the bottom right.
 */
function stones(seed, pal, {count = 9, seam = '#3a3a3a', jitter = 0.5, edge = 0.18} = {}) {
  const r = rng(seed), pts = Array.from({length: count}, () => [r() * S, r() * S, r()]);
  const p = pic(), owner = new Int32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let best = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dx = x + 0.5 - pts[i][0] - ox, dy = y + 0.5 - pts[i][1] - oy, d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    owner[y * S + x] = bi;
  }
  const own = (x, y) => owner[((y + S) % S) * S + (x + S) % S], seamAt = (x, y) => own(x + 1, y) !== own(x, y) || own(x, y + 1) !== own(x, y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = own(x, y);
    if (seamAt(x, y)) { p.set(x, y, hex(seam)); continue; }
    let v = pts[i][2] * 0.55 + 0.225 + (r() - 0.5) * jitter * 0.3;
    if (seamAt(x - 1, y) || seamAt(x, y - 1) || own(x - 1, y) !== i || own(x, y - 1) !== i) v += edge;
    if (seamAt(x + 1, y) || seamAt(x, y + 1)) v -= edge;
    p.set(x, y, pick(pal, clamp(v, 0, 0.999)));
  }
  return p;
}
/** Rounded lumps with wide dark gaps between them (glowstone, the raw metal blocks): each its own shade, lit from the top left. */
function lumps(seed, pal, {count = 9, seam = '#3a3a3a', jitter = 0.5, edge = 0.18} = {}) {
  const r = rng(seed), pts = Array.from({length: count}, () => [r() * S, r() * S, r()]);
  const p = pic(), near = (x, y) => {
    let best = 1e9, second = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
      const dx = x + 0.5 - pts[i][0] - ox, dy = y + 0.5 - pts[i][1] - oy, d = dx * dx + dy * dy;
      if (d < best) { second = best; best = d; bi = i; } else if (d < second) second = d;
    }
    return [bi, Math.sqrt(second) - Math.sqrt(best)];
  };
  const owner = [], gap = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const [i, g] = near(x, y); owner.push(i); gap.push(g); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = owner[y * S + x], g = gap[y * S + x];
    if (g < 1.05) { p.set(x, y, hex(seam)); continue; }
    const up = owner[((y + S - 1) % S) * S + x] !== i || gap[((y + S - 1) % S) * S + x] < 1.05, left = owner[y * S + (x + S - 1) % S] !== i || gap[y * S + (x + S - 1) % S] < 1.05;
    const down = owner[((y + 1) % S) * S + x] !== i || gap[((y + 1) % S) * S + x] < 1.05, right = owner[y * S + (x + 1) % S] !== i || gap[y * S + (x + 1) % S] < 1.05;
    let v = pts[i][2] * 0.7 + 0.15 + (r() - 0.5) * jitter * 0.3;
    if (up || left) v += edge; if (down || right) v -= edge;
    p.set(x, y, pick(pal, clamp(v, 0, 0.999)));
  }
  return p;
}
/** Grey version of a picture (for tinted textures), keeping its alpha. */
function grey(p, lo = 0, k = 1) {
  for (let i = 0; i < p.d.length; i += 4) { const v = clamp((p.d[i] * 0.3 + p.d[i + 1] * 0.55 + p.d[i + 2] * 0.15) * k + lo, 0, 255); p.d[i] = p.d[i + 1] = p.d[i + 2] = v; }
  return p;
}

// ---------- the drawings ----------
// cobblestone's stones, from their shaded edges to their lit ones
const COBBLE = ['#5c5c5c', '#686868', '#757575', '#828282', '#8f8f8f', '#9c9c9c', '#aaaaaa', '#b7b7b7'];
const STONE = ['#5e5e5e', '#6b6b6b', '#767676', '#7f7f7f', '#888888', '#929292', '#9c9c9c'];
const DIRT = ['#593d27', '#664630', '#734f36', '#7e5a3e', '#8a6446', '#966f4e'];
const DEEP = ['#2e2e36', '#383840', '#41414a', '#4a4a53', '#54545d', '#5e5e67'];
const stone = s => { const p = mottled(s, STONE, {cells: 4, grain: 0.45, smooth: 0.55}); const r = rng(s + 9); for (let k = 0; k < 5; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S), l = 2 + Math.floor(r() * 3); for (let i = 0; i < l; i++) p.set(x + i, y + (r() < 0.3 ? 1 : 0), hex('#626262')); } return p; };
const dirt = s => specks(mottled(s, DIRT, {cells: 4, grain: 0.5, smooth: 0.45}), s + 1, 7, ['#4c3220', '#5a3c26'], {size: 1});
const deepslate = s => {
  const p = mottled(s, DEEP, {cells: 2, grain: 0.35, smooth: 0.5}), r = rng(s + 2);
  for (let y = 0; y < S; y += 2 + Math.floor(r() * 2)) for (let x = 0; x < S; x++) if (r() < 0.55) p.set(x, y, mul(p.get(x, y), 0.82));
  return p;
};
function grassTop(s) { return mottled(s, ['#6e6e6e', '#7a7a7a', '#868686', '#929292', '#9e9e9e', '#aaaaaa'], {cells: 8, grain: 0.7, smooth: 0.35}); }
const GRASS_DEFAULT = hex('#8eb971');
/** The fringe of grass hanging over a dirt side: which pixels of a column are grass. */
function fringe(s) { const r = rng(s), depth = []; for (let x = 0; x < S; x++) depth.push(3 + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0) + (r() < 0.12 ? 2 : 0)); return depth; }
function grassSide(s, overlay) {
  const p = overlay ? pic() : dirt(nameSeed('dirt')), g = grassTop(s + 5), depth = fringe(s);
  for (let x = 0; x < S; x++) for (let y = 0; y < depth[x]; y++) {
    const c = g.get(x, y);
    if (overlay) p.set(x, y, c); else p.set(x, y, mul(GRASS_DEFAULT, c[0] / 255 * 1.05));
  }
  return p;
}
function sideWith(base, top, s, deep = 0) { const p = base.copy(), depth = fringe(s); for (let x = 0; x < S; x++) for (let y = 0; y < depth[x] + deep; y++) p.set(x, y, top.get(x, y)); return p; }
function ore(s, base, colors, n = 5) {
  const p = base, r = rng(s);
  for (let k = 0; k < n; k++) {
    const cx = 1 + Math.floor(r() * 13), cy = 1 + Math.floor(r() * 13);
    const shape = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [-1, 1]].slice(0, 3 + Math.floor(r() * 4));
    for (const [dx, dy] of shape) {
      const x = cx + dx, y = cy + dy, light = dy <= 0 || dx < 0;
      p.set(x, y, hex(colors[light ? 0 : r() < 0.5 ? 1 : 2]));
      if (p.alpha(x + 1, y + 1)) { const c = p.get(x + 1, y + 1); if (!shape.some(([a, b]) => cx + a === x + 1 && cy + b === y + 1)) p.set(x + 1, y + 1, mul(c, 0.78)); }
    }
  }
  return p;
}
const ORE_COLORS = {coal: ['#4a4a4a', '#2b2b2b', '#1c1c1c'], iron: ['#e8c5a8', '#d1a07d', '#ad7b58'], copper: ['#e7915f', '#c56d43', '#4f9f7f'],
  gold: ['#fff07a', '#f2cf3a', '#c48f19'], redstone: ['#ff3b3b', '#d00f0f', '#7c0606'], lapis: ['#4e7cf0', '#1d48c8', '#102d84'],
  diamond: ['#cffffa', '#5ee3dc', '#239f99'], emerald: ['#7bfc95', '#17d14a', '#0b7f2b']};
function log(s, bark, dark, line) {
  const p = pic(), r = rng(s), n = tileNoise(s, 4);
  for (let x = 0; x < S; x++) {
    const col = r();
    for (let y = 0; y < S; y++) {
      let c = mix(hex(bark), hex(dark), clamp(col * 0.6 + n(x, y) * 0.5 - 0.15, 0, 1));
      if (col > 0.78 || (x % 4 === (s & 3) && r() < 0.6)) c = hex(dark);
      if (line && r() < 0.04) c = hex(line);
      p.set(x, y, c);
    }
  }
  return p;
}
function logTop(s, bark, rings) {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5), d = Math.max(dx, dy) * 0.6 + Math.hypot(dx, dy) * 0.4;
    if (d > 7) { p.set(x, y, hex(bark)); continue; }
    const ring = Math.floor(d * 0.9 + hash(s, x, y) * 0.5);
    p.set(x, y, hex(rings[ring % 2 ? 1 : 0]));
    if (ring === 0 && d < 1.3) p.set(x, y, hex(rings[2]));
  }
  return p;
}
function planks(s, base) {
  const c = hex(base), p = pic(), r = rng(s);
  for (let b = 0; b < 4; b++) {
    const seam = Math.floor(r() * 12) + 2, shade = 0.94 + r() * 0.12;
    for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < S; x++) {
      let k = shade * (0.94 + hash(s, x >> 1, y) * 0.1);
      if (y === b * 4 + 3) k *= 0.72;
      else if (y === b * 4) k *= 1.06;
      if (x === seam && y !== b * 4 + 3) k *= 0.72;
      if (hash(s + 1, x, y) < 0.06) k *= 0.86;
      p.set(x, y, mul(c, k));
    }
  }
  return p;
}
function leaves(s, {holes = 0.16, lo = 70, hi = 190, cells = 8} = {}) {
  const p = pic(), n = tileNoise(s, cells), r = rng(s + 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n(x, y), h = r();
    if (h < holes && v < 0.55) continue;
    const g = lo + (hi - lo) * clamp(v * 0.75 + r() * 0.35, 0, 1);
    p.set(x, y, [g, g, g]);
  }
  for (let k = 0; k < 10; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); if (p.alpha(x, y)) { p.set(x, y, [hi + 30, hi + 30, hi + 30]); if (p.alpha(x + 1, y + 1)) p.set(x + 1, y + 1, [lo - 10, lo - 10, lo - 10]); } }
  return p;
}
/** A sprite from rows of letters and a palette ('.' is clear). */
function sprite(rows, pal) {
  const p = pic();
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && pal[ch]) p.set(x, y, hex(pal[ch])); }));
  return p;
}
function flower(head, stem = '#4c8a2a', leaf = '#5fa437', {centre = null, tall = 6, wide = 1} = {}) {
  const p = pic(), r = rng(nameSeed(head + stem));
  for (let y = 7; y < 16; y++) p.set(7 + (y > 12 ? 1 : 0), y, y % 3 ? hex(stem) : mul(hex(stem), 0.8));
  p.set(6, 12, hex(leaf)); p.set(5, 11, hex(leaf)); p.set(9, 13, hex(leaf)); p.set(10, 12, hex(leaf));
  const cy = 16 - tall - 3, petals = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const shades = [hex(head), mul(hex(head), 0.82), mix(hex(head), [255, 255, 255], 0.35)];
  for (const [dx, dy] of petals.slice(0, wide > 1 ? 8 : 4)) p.set(7 + dx, cy + dy, shades[dy < 0 || dx < 0 ? 2 : r() < 0.5 ? 0 : 1]);
  if (wide > 1) for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2]]) p.set(7 + dx, cy + dy, shades[1]);
  p.set(7, cy, centre ? hex(centre) : shades[0]);
  return p;
}
function crossGrass(s, {fern = false} = {}) {
  const p = pic(), r = rng(s);
  const blades = fern ? 5 : 9;
  for (let b = 0; b < blades; b++) {
    const x0 = 1 + Math.floor(r() * 14), h = (fern ? 8 : 6) + Math.floor(r() * (fern ? 6 : 9)), lean = (r() - 0.5) * (fern ? 1.4 : 0.8);
    for (let i = 0; i < h; i++) {
      const x = Math.round(x0 + lean * i * 0.5), y = 15 - i, g = 110 + i * 8 + r() * 20;
      if (x >= 0 && x < S) p.set(x, y, [g, g, g]);
      if (fern && i > 1 && i % 2 === 0) { for (const side of [-1, 1]) { const xx = x + side, gg = g - 15; if (xx >= 0 && xx < S) p.set(xx, y + 1, [gg, gg, gg]); } }
    }
  }
  return p;
}
function wool(s, base) {
  const c = hex(base), p = pic(), n = tileNoise(s, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wave = Math.sin((x + y * 0.5) * 1.6 + n(x, y) * 3) * 0.5 + 0.5, k = 0.88 + wave * 0.14 + (hash(s, x, y) - 0.5) * 0.06;
    p.set(x, y, mul(c, k));
  }
  return p;
}
function metal(base, light, dark, {inner = true, gem = false} = {}) {
  const p = pic().fill(hex(base));
  for (let i = 0; i < S; i++) { p.set(i, 0, hex(light)); p.set(0, i, hex(light)); p.set(i, 15, hex(dark)); p.set(15, i, hex(dark)); }
  if (inner) for (let i = 2; i < 14; i++) { p.set(i, 2, hex(dark)); p.set(2, i, hex(dark)); p.set(i, 13, hex(light)); p.set(13, i, hex(light)); }
  if (gem) for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if ((x + y) % 5 === 0) p.set(x, y, hex(light));
  for (let k = 0; k < 6; k++) p.set(3 + (k * 5) % 10, 4 + (k * 3) % 8, mix(hex(base), hex(light), 0.5));
  return p;
}
function bricks(s) {
  const p = pic().fill(hex('#9a9087')), r = rng(s);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let b = -1; b < 2; b++) {
      const x0 = off + b * 8, base = mix(hex('#8e4a3a'), hex('#a65a46'), r());
      for (let y = row * 4; y < row * 4 + 3; y++) for (let x = x0; x < x0 + 7; x++) {
        if (x < 0 || x >= S) continue;
        let k = 0.92 + hash(s, x, y) * 0.16; if (y === row * 4) k *= 1.08; if (y === row * 4 + 2) k *= 0.85;
        p.set(x, y, mul(base, k));
      }
    }
  }
  return p;
}
function stoneBricks(s) {
  const p = mottled(s, ['#6d6d6d', '#767676', '#7e7e7e', '#868686', '#8e8e8e'], {cells: 4, grain: 0.4});
  const line = hex('#4a4a4a'), lite = hex('#a0a0a0');
  for (let x = 0; x < S; x++) { p.set(x, 7, line); p.set(x, 15, line); p.set(x, 0, mix(p.get(x, 0), lite, 0.4)); p.set(x, 8, mix(p.get(x, 8), lite, 0.4)); }
  for (let y = 0; y < 8; y++) { p.set(15, y, line); p.set(0, y, mix(p.get(0, y), lite, 0.3)); }
  for (let y = 8; y < 16; y++) { p.set(7, y, line); p.set(8, y, mix(p.get(8, y), lite, 0.3)); }
  return p;
}
function sandstoneSide(s, pal) {
  const p = mottled(s, pal, {cells: 8, grain: 0.3});
  for (let x = 0; x < S; x++) {
    for (const y of [0, 1, 2]) p.set(x, y, mix(hex(pal[pal.length - 1]), hex(pal[pal.length - 2]), y / 3));
    p.set(x, 3, hex(pal[0]));
    if ((x + (s & 3)) % 7 === 0) p.set(x, 8, hex(pal[1]));
    p.set(x, 11, mix(hex(pal[1]), hex(pal[2]), 0.5));
    for (const y of [13, 14, 15]) p.set(x, y, mul(hex(pal[1]), 0.95 + hash(s, x, y) * 0.08));
    p.set(x, 12, hex(pal[0]));
  }
  return p;
}
function waterFrame(f, n, flow) {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = f / n * Math.PI * 2;
    const yy = flow ? y + f / n * S : y;
    const v = Math.sin((x * 0.8 + yy * 0.45) + t) * 0.5 + Math.sin((x * 0.3 - yy * 0.9) * 1.3 - t * 2) * 0.35 + Math.sin((x + yy) * 0.39 + t) * 0.25;
    const g = 165 + v * 28 + hash(7, x, Math.floor(yy) & 15) * 10;
    p.set(x, y, [g, g, g], 175);
  }
  return p;
}
function lavaFrame(f, n, flow) {
  const p = pic(), pal = ['#9c2304', '#c6400b', '#e05b10', '#f2791a', '#fb9e2c', '#ffc951'];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = f / n * Math.PI * 2, yy = flow ? y + f / n * S : y;
    const v = Math.sin(x * 0.7 + Math.sin(yy * 0.5 + t) * 1.5) * 0.3 + Math.sin(yy * 0.6 - t + Math.cos(x * 0.4) * 2) * 0.3 + 0.5 + Math.sin((x - yy) * 0.45 + t) * 0.2;
    p.set(x, y, pick(pal, clamp(v * 0.9 + hash(5, x, Math.floor(yy) & 15) * 0.15, 0, 0.999)));
  }
  return p;
}
function crack(stage) {
  const p = pic(), r = rng(991);
  const lines = [];
  for (let k = 0; k < 14; k++) { const x = r() * S, y = r() * S, a = r() * Math.PI * 2, l = 2 + r() * 5; lines.push([x, y, a, l]); }
  const count = Math.round((stage + 1) / 10 * lines.length);
  for (const [x, y, a, l] of lines.slice(0, count)) for (let i = 0; i < l * (0.6 + stage * 0.06); i += 0.5) {
    const xx = Math.round(x + Math.cos(a + i * 0.3) * i), yy = Math.round(y + Math.sin(a + i * 0.3) * i);
    if (xx >= 0 && yy >= 0 && xx < S && yy < S) p.set(xx, yy, [40, 40, 40], 200);
  }
  return p;
}
function wheat(stage) {
  const p = pic(), r = rng(31 + stage), h = 2 + Math.round(stage * 1.7), ripe = stage / 7;
  for (const x0 of [2, 5, 9, 12]) {
    const hh = h - Math.floor(r() * 2);
    for (let i = 0; i < hh; i++) {
      const y = 15 - i, c = mix(hex('#58a62a'), hex('#c7a34a'), ripe * (0.4 + i / hh * 0.6));
      p.set(x0 + (i > hh / 2 && x0 < 8 ? 1 : 0), y, c);
      if (stage >= 5 && i >= hh - 4) p.set(x0 + 1, y, mix(hex('#d8b75b'), hex('#a37f31'), (i % 2) * 0.6));
    }
  }
  return p;
}
function crafting(face) {
  const p = planks(nameSeed('oak_planks'), '#b8945f');
  const dark = hex('#5e3f22'), metalC = hex('#9a9a9a'), metalD = hex('#5c5c5c');
  if (face === 'top') {
    for (let i = 0; i < S; i++) { p.set(i, 0, dark); p.set(i, 15, dark); p.set(0, i, dark); p.set(15, i, dark); }
    for (let i = 1; i < 15; i++) { p.set(i, 5, mul(p.get(i, 5), 0.7)); p.set(i, 10, mul(p.get(i, 10), 0.7)); p.set(5, i, mul(p.get(5, i), 0.7)); p.set(10, i, mul(p.get(10, i), 0.7)); }
    return p;
  }
  for (let x = 0; x < S; x++) { p.set(x, 0, dark); p.set(x, 1, mul(hex('#b8945f'), 0.8)); p.set(x, 2, dark); }
  if (face === 'front') { // a saw and a hammer hanging
    for (let x = 2; x < 8; x++) { p.set(x, 6, metalC); p.set(x, 7, x % 2 ? metalD : metalC); }
    p.set(1, 6, dark); p.set(1, 7, dark); p.set(0, 6, dark);
    for (let y = 5; y < 13; y++) p.set(11, y, dark);
    p.rect(9, 5, 13, 6, metalD); p.rect(9, 5, 13, 5, metalC);
  } else { // tools on the wall
    for (let y = 5; y < 13; y++) { p.set(4, y, dark); p.set(11, y, dark); }
    p.rect(3, 4, 5, 5, metalC); p.rect(10, 4, 12, 5, metalD); p.set(10, 4, metalC);
  }
  return p;
}
function furnace(face, on) {
  const base = mottled(nameSeed('furnace'), ['#5f5f5f', '#6c6c6c', '#787878', '#828282', '#8c8c8c'], {cells: 4, grain: 0.35});
  const p = base, dark = hex('#3c3c3c'), lite = hex('#a6a6a6');
  for (let i = 0; i < S; i++) { p.set(i, 0, lite); p.set(0, i, lite); p.set(i, 15, dark); p.set(15, i, dark); }
  if (face === 'top') { for (let i = 2; i < 14; i++) { p.set(i, 2, dark); p.set(2, i, dark); p.set(i, 13, lite); p.set(13, i, lite); } return p; }
  if (face === 'front') {
    p.rect(3, 3, 12, 6, hex('#4e4e4e')); for (let x = 3; x <= 12; x++) p.set(x, 3, dark);
    p.rect(4, 9, 11, 13, hex('#1b1b1b'));
    for (let x = 4; x <= 11; x++) p.set(x, 9, dark);
    if (on) for (let x = 4; x <= 11; x++) for (let y = 11; y <= 13; y++) p.set(x, y, hex(['#ffd25a', '#ff9a1f', '#e05a0a'][(x + y * 2) % 3]));
    for (let y = 9; y <= 13; y += 2) { p.set(3, y, lite); p.set(12, y, dark); }
  } else {
    for (let x = 1; x < 15; x++) p.set(x, 5, mul(p.get(x, 5), 0.75));
  }
  return p;
}
// a chest's face; seam: the side (l, r, t, b) where a large chest's other half meets it — no border there, the band
// running on, and no latch on the front (a large chest's is in the middle, where the halves meet)
function chest(face, seam = '') {
  const p = planks(nameSeed('chest'), '#a2733d'), dark = hex('#3f2a14'), band = hex('#6b4a25');
  for (let i = 0; i < S; i++) {
    if (seam !== 't') p.set(i, 0, dark);
    if (seam !== 'b') p.set(i, 15, dark);
    if (seam !== 'l') p.set(0, i, dark);
    if (seam !== 'r') p.set(15, i, dark);
  }
  if (face !== 'top') { for (let x = seam === 'l' ? 0 : 1; x < (seam === 'r' ? 16 : 15); x++) { p.set(x, 5, dark); p.set(x, 6, band); } }
  if (face === 'front' && !seam) { p.rect(7, 4, 8, 8, hex('#c9c9c9')); p.set(7, 8, hex('#777777')); p.set(8, 8, hex('#777777')); }
  return p;
}
function tnt(face) {
  if (face === 'side') {
    const p = pic(), red = hex('#c43a24'), dred = hex('#8e2516');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, (x % 4 === 3) ? dred : red);
    p.rect(0, 5, 15, 10, hex('#e8e4dc'));
    const T = ['###', '.#.', '.#.', '.#.'], N = ['#..#', '##.#', '#.##', '#..#'];
    const put = (glyph, x0) => glyph.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') p.set(x0 + x, 6 + y, hex('#1d1d1d')); }));
    put(T, 2); put(N, 6); put(T, 11);
    return p;
  }
  const p = pic().fill(hex(face === 'top' ? '#b23a24' : '#9a321f'));
  for (let i = 0; i < S; i++) { p.set(i, 0, hex('#6e2214')); p.set(0, i, hex('#6e2214')); }
  if (face === 'top') { p.rect(6, 6, 9, 9, hex('#d8d2c6')); p.rect(7, 7, 8, 8, hex('#3a3a3a')); }
  return p;
}
function torch() {
  const p = pic();
  for (let y = 8; y < 16; y++) { p.set(7, y, hex('#7b5a32')); p.set(8, y, hex('#5c4122')); }
  p.set(7, 6, hex('#fff6a1')); p.set(8, 6, hex('#ffd34a')); p.set(7, 7, hex('#ffb12c')); p.set(8, 7, hex('#ff8a1c'));
  return p;
}
function lantern() {
  const p = pic(), iron = hex('#3b3e45'), ironL = hex('#5a5e68'), glow = hex('#ffd36b'), glowD = hex('#f29a2e');
  // body sides (0,2)–(6,9), top/bottom (0,9)–(6,15), cap sides (1,0)–(5,2), chain (11,1)–(14,…)
  for (let y = 2; y < 9; y++) for (let x = 0; x < 6; x++) p.set(x, y, y === 2 || y === 8 || x === 0 || x === 5 ? (y === 2 ? ironL : iron) : (y < 5 ? glow : glowD));
  for (let y = 9; y < 15; y++) for (let x = 0; x < 6; x++) p.set(x, y, x === 0 || x === 5 || y === 9 || y === 14 ? iron : ironL);
  for (let y = 0; y < 2; y++) for (let x = 1; x < 5; x++) p.set(x, y, y ? iron : ironL);
  for (let y = 1; y < 10; y++) { p.set(11, y, iron); p.set(12, y, y % 2 ? ironL : iron); }
  return p;
}
function ladder() {
  const p = pic(), wood = hex('#8a6a3c'), dark = hex('#5c4424');
  for (let y = 0; y < S; y++) { p.set(1, y, wood); p.set(2, y, dark); p.set(13, y, wood); p.set(14, y, dark); }
  for (const y of [1, 5, 9, 13]) for (let x = 3; x < 13; x++) { p.set(x, y, wood); p.set(x, y + 1, dark); }
  return p;
}
function glass() {
  const p = pic(), edge = hex('#dbeef3'), dim = hex('#a9c6cf');
  for (let i = 0; i < S; i++) { p.set(i, 0, edge); p.set(0, i, edge); p.set(i, 15, dim); p.set(15, i, dim); }
  for (const [x, y] of [[3, 4], [4, 3], [5, 2], [10, 11], [11, 10], [12, 9]]) p.set(x, y, [255, 255, 255], 200);
  return p;
}
function bookshelf() {
  const p = planks(nameSeed('oak_planks'), '#b8945f'), r = rng(77);
  const books = ['#7a2b20', '#2f4f8a', '#3d6b2c', '#8a6a24', '#5a2d6b', '#2b6b6b', '#9a3c2a', '#4a4a4a'];
  for (const y0 of [1, 9]) {
    for (let x = 1; x < 15;) {
      const w = 1 + Math.floor(r() * 2), h = 4 + Math.floor(r() * 3), c = hex(books[Math.floor(r() * books.length)]);
      for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = y0 + 6 - h; y < y0 + 6; y++) p.set(xx, y, y === y0 + 6 - h ? mul(c, 1.25) : xx === x ? c : mul(c, 0.8));
      x += w + (r() < 0.2 ? 1 : 0);
    }
    for (let x = 0; x < S; x++) p.set(x, y0 + 6, hex('#5e3f22'));
  }
  return p;
}
function cactus(face) {
  const p = pic(), g = hex('#5f9a2c'), dg = hex('#3f6f1c'), lg = hex('#86c24a');
  if (face === 'bottom') return mottled(5, ['#b8b276', '#c4be82', '#d0ca8e'], {cells: 4});
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (face === 'side' && (x === 0 || x === 15)) continue;
    let c = (x % 4 === 1) ? dg : g;
    if (face === 'top') c = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6 ? dg : (x + y) % 4 === 0 ? lg : g;
    p.set(x, y, c);
  }
  if (face === 'side') for (let y = 2; y < S; y += 4) for (const x of [3, 7, 11]) p.set(x, y + (x === 7 ? 2 : 0), hex('#e9e2b0'));
  return p;
}
function pumpkin(face) {
  if (face === 'top') { const p = mottled(8, ['#c47312', '#d4821a', '#e39226'], {cells: 4}); p.rect(6, 6, 9, 9, hex('#6b5a1e')); p.rect(7, 7, 8, 8, hex('#8a7a2a')); return p; }
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex('#e28e1c'), (x % 4 === 0 ? 0.78 : x % 4 === 2 ? 1.08 : 0.95) * (0.95 + hash(4, x, y) * 0.08)));
  return p;
}
function melon(face) {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const stripe = face === 'top' ? (Math.floor(Math.hypot(x - 7.5, y - 7.5)) % 3 === 0) : (x % 5 < 2);
    p.set(x, y, mul(hex(stripe ? '#a4bf2a' : '#6f9a1c'), 0.92 + hash(2, x, y) * 0.12));
  }
  return p;
}
/** Tilled soil: furrows four pixels apart (a dark groove that wanders a pixel here and there, clods in it), shaded below, the ridge lit. */
function farmland() {
  const p = mottled(13, ['#56391f', '#614026', '#6c482b', '#775030', '#835a37'], {cells: 4, grain: 0.45}), r = rng(14);
  for (const g of [3, 7, 11, 15]) for (let x = 0; x < S; x++) {
    const y = g - (hash(5, x >> 2, g) > 0.7 ? 1 : 0);
    if (r() > 0.12) p.set(x, y, hex('#3a2615'));
    p.set(x, y + 1, mul(p.get(x, y + 1), 0.8));
    p.set(x, y - 2, mul(p.get(x, y - 2), 1.12));
  }
  return p;
}

const BLOCK_ART = {
  stone: () => stone(11), dirt: () => dirt(nameSeed('dirt')), grass_block_top: () => grassTop(21), grass_block_side: () => grassSide(23, false),
  grass_block_side_overlay: () => grassSide(23, true),
  grass_block_snow: () => sideWith(dirt(nameSeed('dirt')), mottled(41, ['#dfe9ef', '#eef5f8', '#ffffff'], {cells: 8}), 41, 1),
  cobblestone: () => stones(12, COBBLE, {count: 10, seam: '#4a4a4a', edge: 0.25}),
  mossy_cobblestone: () => { const p = stones(12, COBBLE, {count: 10, seam: '#4a4a4a', edge: 0.25}), n = tileNoise(32, 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (n(x, y) > 0.55) p.set(x, y, mix(hex('#4f7a2e'), hex('#6d9a3c'), hash(3, x, y))); return p; },
  bedrock: () => mottled(5, ['#1f1f1f', '#3a3a3a', '#575757', '#767676', '#8f8f8f'], {cells: 8, grain: 0.9, smooth: 0.3}),
  sand: () => specks(mottled(51, ['#d4c592', '#dccf9d', '#e3d6a6', '#e9dead'], {cells: 8, grain: 0.5, smooth: 0.4}), 52, 6, ['#c2b07a'], {size: 1}),
  red_sand: () => specks(mottled(53, ['#a9541c', '#b75e22', '#c26728', '#cc7130'], {cells: 8, grain: 0.5, smooth: 0.4}), 54, 6, ['#8f4415'], {size: 1}),
  gravel: () => stones(61, ['#5e5a58', '#716b68', '#837d79', '#948e8a', '#a8a29e'], {count: 18, seam: '#4b4745', edge: 0.12}),
  water_still: f => waterFrame(f, 16, false), water_flow: f => waterFrame(f, 16, true),
  lava_still: f => lavaFrame(f, 16, false), lava_flow: f => lavaFrame(f, 16, true),
  deepslate: () => deepslate(71), deepslate_top: () => stones(72, DEEP, {count: 7, seam: '#25252b', edge: 0.1}),
  cobbled_deepslate: () => stones(73, ['#2c2c33', '#36363d', '#404047', '#4a4a52', '#55555d'], {count: 12, seam: '#1d1d22'}),
  granite: () => specks(mottled(81, ['#8a5a49', '#956352', '#9f6b59', '#a87461', '#b07d6a'], {cells: 8, grain: 0.6, smooth: 0.4}), 82, 9, ['#6f4537', '#c49283'], {size: 1}),
  diorite: () => specks(mottled(83, ['#b4b4b4', '#bebebe', '#c8c8c8', '#d2d2d2'], {cells: 8, grain: 0.5, smooth: 0.4}), 84, 12, ['#7e7e7e', '#5f5f5f'], {size: 2}),
  andesite: () => specks(mottled(85, ['#7a7a7a', '#838383', '#8b8b8b', '#939393'], {cells: 8, grain: 0.6, smooth: 0.4}), 86, 10, ['#6a6a6a', '#a3a3a3'], {size: 2}),
  tuff: () => specks(mottled(87, ['#595a53', '#63645c', '#6c6e65', '#76786e'], {cells: 4, grain: 0.5}), 88, 8, ['#8a8a7e', '#4b4c46'], {size: 2}),
  calcite: () => mottled(89, ['#d4d4cf', '#dcdcd7', '#e3e3de', '#ebebe7'], {cells: 4, grain: 0.3}),
  sandstone: () => sandstoneSide(91, ['#c9b77c', '#d4c389', '#dccd95', '#e3d6a1']), sandstone_top: () => mottled(92, ['#d6c68c', '#dccd95', '#e2d49e'], {cells: 4, grain: 0.25}),
  sandstone_bottom: () => specks(mottled(93, ['#c9b77c', '#d4c389', '#dccd95'], {cells: 8, grain: 0.5}), 94, 5, ['#b9a66b'], {size: 1}),
  red_sandstone: () => sandstoneSide(95, ['#9e4d18', '#ad571d', '#b96124', '#c46b2b']), red_sandstone_top: () => mottled(96, ['#b25b20', '#bc6427', '#c56d2e'], {cells: 4, grain: 0.25}),
  red_sandstone_bottom: () => mottled(97, ['#a5521a', '#b05b20', '#ba6427'], {cells: 8, grain: 0.5}),
  clay: () => mottled(101, ['#9097a7', '#989fae', '#a0a7b6', '#a8afbd'], {cells: 4, grain: 0.35}),
  coarse_dirt: () => specks(dirt(103), 104, 12, ['#7d7065', '#5f544b'], {size: 2}),
  podzol_top: () => specks(mottled(105, ['#5b3c1c', '#6a4520', '#7a5026', '#8a5c2d'], {cells: 8, grain: 0.6, smooth: 0.4}), 106, 6, ['#9a6a2f'], {size: 1}),
  podzol_side: () => sideWith(dirt(nameSeed('dirt')), mottled(105, ['#5b3c1c', '#6a4520', '#7a5026', '#8a5c2d'], {cells: 8, grain: 0.6, smooth: 0.4}), 107),
  obsidian: () => specks(mottled(111, ['#0f0b19', '#150f22', '#1b142b', '#22193a'], {cells: 4, grain: 0.4}), 112, 7, ['#3b2b5c', '#2a1f44'], {size: 2}),
  snow: () => mottled(121, ['#dde8ee', '#e8f0f4', '#f1f6f9', '#fbfdfe'], {cells: 8, grain: 0.35, smooth: 0.4}),
  ice: () => { const p = mottled(131, ['#8eb4f2', '#9cc0f5', '#aacaf7'], {cells: 4, grain: 0.2}); for (let i = 0; i < p.d.length; i += 4) p.d[i + 3] = 165; for (let k = 0; k < 12; k++) p.set(3 + k, 12 - k, [220, 236, 255], 200); for (let k = 0; k < 5; k++) p.set(9 + k, 4 - Math.min(k, 3), [220, 236, 255], 200); return p; },
  packed_ice: () => { const p = mottled(133, ['#7ea6e8', '#8bb0ec', '#98baf0', '#a5c4f3'], {cells: 4, grain: 0.3}); for (let k = 0; k < 10; k++) p.set(k + 2, 10 - (k >> 1), hex('#c5dbfb')); return p; },
  blue_ice: () => { const p = mottled(135, ['#5d8fe0', '#6a99e5', '#77a3ea', '#84adee'], {cells: 4, grain: 0.3}); for (let k = 0; k < 10; k++) p.set(k + 3, 12 - k, hex('#a9c8f6')); return p; },
  short_grass: () => crossGrass(141), fern: () => crossGrass(143, {fern: true}),
  dandelion: () => flower('#f5d634', '#4c8a2a', '#5fa437', {centre: '#e0a51c'}), poppy: () => flower('#d4251c', '#4c8a2a', '#5fa437', {centre: '#2b2b2b', wide: 2}),
  blue_orchid: () => flower('#2fa8e0', '#3f7f2a', '#4e9a3a', {wide: 2, centre: '#a6e6ff'}), allium: () => flower('#b46fd9', '#5a8a3a', '#6aa04a', {wide: 2, centre: '#e0b4f2'}),
  azure_bluet: () => flower('#e8eef2', '#4c8a2a', '#5fa437', {centre: '#f2d43a'}), oxeye_daisy: () => flower('#f0f0ea', '#4c8a2a', '#5fa437', {wide: 2, centre: '#f2c42a'}),
  cornflower: () => flower('#4a6ee0', '#4c8a2a', '#5fa437', {wide: 2, centre: '#2d48a8'}), lily_of_the_valley: () => flower('#f4f4f0', '#3f8a2a', '#55a63a', {centre: '#d8e8c8'}),
  dead_bush: () => { const p = pic(), c = hex('#7a5a2e'), d = hex('#5e4422'); for (const [x0, a] of [[7, -0.6], [8, 0.5], [7, 0.1], [8, -0.2]]) for (let i = 0; i < 9; i++) { const x = Math.round(x0 + a * i), y = 15 - i; p.set(x, y, i % 3 ? c : d); } return p; },
  sugar_cane: () => { const p = pic(); for (const x0 of [3, 7, 11]) for (let y = 0; y < S; y++) { const g = (y % 5 === 0) ? 120 : 175 + (x0 % 2) * 15; p.set(x0, y, [g, g, g]); p.set(x0 + 1, y, [g - 30, g - 30, g - 30]); if (y % 5 === 2 && x0 !== 7) p.set(x0 + 2, y, [150, 150, 150]); } return p; },
  cactus_side: () => cactus('side'), cactus_top: () => cactus('top'), cactus_bottom: () => cactus('bottom'),
  red_mushroom: () => sprite(['................', '................', '................', '................', '................', '.....rrrrrr.....', '....rrwrrrwr....', '...rrrrrrwrrr...', '...rwrrrrrrrr...', '...ddddddddd....', '......ss........', '......ss........', '......ss........', '.....sSss.......', '................', '................'], {r: '#d42a1f', w: '#f2f2f2', d: '#8e1c14', s: '#e8dcc6', S: '#c4b49a'}),
  brown_mushroom: () => sprite(['................', '................', '................', '................', '................', '................', '.....bbbbbb.....', '....bBBbbbbb....', '...bbbbbbbbbb...', '...dddddddddd...', '......ss........', '......ss........', '......ss........', '.....sSss.......', '................', '................'], {b: '#9a6b4a', B: '#b9876a', d: '#6e4a32', s: '#e8dcc6', S: '#c4b49a'}),
  crafting_table_top: () => crafting('top'), crafting_table_side: () => crafting('side'), crafting_table_front: () => crafting('front'),
  furnace_top: () => furnace('top'), furnace_side: () => furnace('side'), furnace_front: () => furnace('front', false), furnace_front_on: () => furnace('front', true),
  chest_top: () => chest('top'), chest_side: () => chest('side'), chest_front: () => chest('front'),
  ...Object.fromEntries(['top', 'side', 'front'].flatMap(face => ['l', 'r', 't', 'b'].map(s => [`chest_${face}_${s}`, () => chest(face, s)]))),
  torch: () => torch(), lantern: () => lantern(), ladder: () => ladder(), glass: () => glass(), bricks: () => bricks(151), stone_bricks: () => stoneBricks(153), bookshelf: () => bookshelf(),
  glowstone: () => lumps(161, ['#8a6a2c', '#b98f3f', '#d9b25a', '#f2d27a', '#ffe7a6'], {count: 11, seam: '#6b4f22', edge: 0.2}),
  smooth_stone: () => { const p = mottled(171, ['#9a9a9a', '#a1a1a1', '#a8a8a8'], {cells: 4, grain: 0.2}); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#c2c2c2')); p.set(0, i, hex('#c2c2c2')); p.set(i, 15, hex('#6f6f6f')); p.set(15, i, hex('#6f6f6f')); } return p; },
  smooth_stone_slab_side: () => { const p = mottled(173, ['#9a9a9a', '#a1a1a1', '#a8a8a8'], {cells: 4, grain: 0.2}); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#c2c2c2')); p.set(i, 7, hex('#6f6f6f')); p.set(i, 8, hex('#c2c2c2')); p.set(i, 15, hex('#6f6f6f')); } return p; },
  iron_block: () => metal('#d8d8d8', '#f4f4f4', '#9c9c9c'), gold_block: () => metal('#f5cd36', '#fff1a0', '#c48f19'), diamond_block: () => metal('#5fd9d1', '#b9fffa', '#2a9b94', {gem: true}),
  emerald_block: () => metal('#2ccf59', '#9bf7b2', '#16893a', {gem: true}), coal_block: () => metal('#1c1c1c', '#3a3a3a', '#0c0c0c', {inner: false}),
  lapis_block: () => specks(metal('#2350b8', '#5b85e6', '#163a8a', {inner: false}), 181, 10, ['#6f97f0'], {size: 1}), redstone_block: () => metal('#b3150f', '#ef4b3c', '#6e0a06', {gem: true}),
  copper_block: () => metal('#c06a46', '#e8946b', '#8a4a2e'),
  tnt_side: () => tnt('side'), tnt_top: () => tnt('top'), tnt_bottom: () => tnt('bottom'),
  terracotta: () => mottled(191, ['#8e5440', '#985a44', '#a26149', '#ab684f'], {cells: 4, grain: 0.3}),
  farmland: () => farmland(), pumpkin_side: () => pumpkin('side'), pumpkin_top: () => pumpkin('top'), melon_side: () => melon('side'), melon_top: () => melon('top'),
  moss_block: () => mottled(201, ['#4a6b22', '#557a28', '#61872e', '#6d9434', '#79a03a'], {cells: 8, grain: 0.6, smooth: 0.4}),
  mud: () => mottled(203, ['#3a3439', '#423b40', '#4a4348', '#524a50'], {cells: 4, grain: 0.4}),
};
const WOOD_ART = {oak: ['#6b5130', '#4f3b22', '#b8945f', ['#b28d57', '#9c7848', '#7a5c34']], birch: ['#d8d7d2', '#e8e7e2', '#c5b77b', ['#d1c38a', '#b9ab70', '#a0925a']],
  spruce: ['#3f2c19', '#2c1f11', '#7a5a34', ['#7d5b35', '#694b2a', '#523a20']], jungle: ['#56451b', '#3f3212', '#a07351', ['#a87a52', '#8f6644', '#6f4f33']],
  acacia: ['#6a645c', '#55504a', '#a95a31', ['#b2643a', '#9a542f', '#7c4325']], dark_oak: ['#3e2c17', '#2a1d0e', '#4c3220', ['#5a3c23', '#4a311c', '#382513']]};
let wi = 0;
for (const [w, [bark, dark, plank, rings]] of Object.entries(WOOD_ART)) {
  const s = 300 + wi++ * 10;
  BLOCK_ART[`${w}_log`] = () => {
    const p = log(s, bark, dark, w === 'birch' ? '#2b2b2b' : null);
    if (w === 'birch') { const r = rng(s); for (let k = 0; k < 9; k++) { const x = Math.floor(r() * 14), y = Math.floor(r() * S), l = 1 + Math.floor(r() * 3); for (let i = 0; i < l; i++) p.set(x + i, y, hex('#2e2e2e')); } }
    return p;
  };
  BLOCK_ART[`${w}_log_top`] = () => logTop(s, bark, rings);
  BLOCK_ART[`${w}_planks`] = () => planks(s + 1, plank);
  BLOCK_ART[`${w}_leaves`] = () => leaves(s + 2, w === 'spruce' ? {holes: 0.1, lo: 55, hi: 160, cells: 16} : w === 'birch' ? {holes: 0.14, lo: 80, hi: 195} : w === 'jungle' ? {holes: 0.08, lo: 60, hi: 175, cells: 4} : {});
  BLOCK_ART[`${w}_sapling`] = () => {
    const p = pic(), r = rng(s + 3), leaf = {oak: '#4d8a2a', birch: '#7aa04a', spruce: '#3f6a3a', jungle: '#3f8a1f', acacia: '#7c8f2a', dark_oak: '#2f5f1c'}[w];
    for (let y = 9; y < 16; y++) p.set(7 + (y > 12 ? 0 : 1) - (y > 14 ? 1 : 0), y, hex(bark === '#d8d7d2' ? '#c9c4b8' : bark));
    for (let k = 0; k < 34; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 4.6, x = Math.round(7.5 + Math.cos(a) * d), y = Math.round(6 + Math.sin(a) * d * 0.9); p.set(x, y, mul(hex(leaf), 0.75 + r() * 0.5)); }
    return p;
  };
}
for (const [c, , base] of COLORS) BLOCK_ART[`${c}_wool`] = () => wool(nameSeed(c), base);
for (const [o, cols] of Object.entries(ORE_COLORS)) {
  BLOCK_ART[`${o}_ore`] = () => ore(nameSeed(o), stone(11), cols, o === 'coal' ? 6 : o === 'diamond' ? 4 : 5);
  BLOCK_ART[`deepslate_${o}_ore`] = () => ore(nameSeed(o) + 1, deepslate(71), cols, o === 'coal' ? 6 : 4);
}
for (let i = 0; i < 8; i++) BLOCK_ART[`wheat_stage${i}`] = () => wheat(i);
/** Carrots and potatoes in the ground: leafy tops growing, the crop showing when ripe. */
function rootCrop(stage, leaf, crop, seed) {
  const p = pic(), r = rng(seed + stage), h = 3 + stage * 2;
  for (const x0 of [2, 6, 10, 13]) {
    const hh = h - Math.floor(r() * 2);
    for (let i = 0; i < hh; i++) {
      const y = 15 - i, c = mul(hex(leaf), 0.8 + (i / hh) * 0.35);
      p.set(x0, y, c);
      if (i > 1 && i % 2 === 0) { p.set(x0 - 1, y - 1, mul(c, 0.9)); p.set(x0 + 1, y - 1, mul(c, 1.05)); }
    }
    if (stage === 3) { p.set(x0, 15, hex(crop)); p.set(x0 + 1, 15, mul(hex(crop), 0.8)); p.set(x0, 14, mul(hex(crop), 1.1)); }
  }
  return p;
}
/** A door half: a frame of boards; the top half has a window (clear) with a cross, or small holes (birch). */
function door(base, top, windows) {
  const c = hex(base), p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const frame = x < 2 || x > 13 || (top ? y < 2 : y > 13) || y === 7 || y === 8;
    let k = (x % 4 === 3 ? 0.8 : 1) * (0.94 + hash(nameSeed(base), x, y) * 0.1);
    if (frame) k *= 0.82;
    p.set(x, y, mul(c, k));
  }
  if (top && windows === 'glass') for (let y = 3; y < 7; y++) for (const x0 of [3, 9]) for (let x = x0; x < x0 + 4; x++) p.set(x, y, [0, 0, 0], 0);
  if (top && windows === 'holes') for (const [x, y] of [[4, 4], [5, 4], [10, 4], [11, 4], [4, 10], [5, 10], [10, 10], [11, 10]]) p.set(x, y, [0, 0, 0], 0);
  if (!top) { p.set(12, 2, hex('#3a3a3a')); p.set(12, 3, hex('#5a5a5a')); }
  return p;
}
function trapdoor(base, holes) {
  const c = hex(base), p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(c, (x < 1 || x > 14 || y < 1 || y > 14 ? 0.75 : x % 5 === 0 ? 0.85 : 1) * (0.94 + hash(nameSeed(base) + 1, x, y) * 0.1)));
  if (holes) for (const [x0, y0] of [[3, 3], [9, 3], [3, 9], [9, 9]]) for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) p.set(x, y, [0, 0, 0], 0);
  return p;
}
const WOOD_DOORS = {oak: ['#b8945f', 'glass'], spruce: ['#6e5130', 'none'], birch: ['#d4c78e', 'holes']};
for (const [w, [c, win]] of Object.entries(WOOD_DOORS)) {
  BLOCK_ART[`${w}_door_top`] = () => door(c, true, win); BLOCK_ART[`${w}_door_bottom`] = () => door(c, false, win);
  BLOCK_ART[`${w}_trapdoor`] = () => trapdoor(c, w !== 'spruce');
}
BLOCK_ART.iron_bars = () => { const p = pic(); for (let y = 0; y < S; y++) for (const x of [1, 5, 9, 13]) { p.set(x, y, hex('#6e6e6e')); p.set(x + 1, y, hex('#4a4a4a')); } for (let x = 0; x < S; x++) for (const y of [0, 15]) p.set(x, y, hex('#5c5c5c')); return p; };
BLOCK_ART.glass_pane_top = () => { const p = pic(); for (let y = 0; y < S; y++) { p.set(7, y, hex('#dbeef3')); p.set(8, y, hex('#a9c6cf')); } return p; };
for (let i = 0; i < 4; i++) { BLOCK_ART[`carrots_stage${i}`] = () => rootCrop(i, '#4f9a2a', '#f08a1c', 51); BLOCK_ART[`potatoes_stage${i}`] = () => rootCrop(i, '#3f8a2c', '#c9a55a', 61); }
for (let i = 0; i < 10; i++) BLOCK_ART[`destroy_stage_${i}`] = () => crack(i);

// ---------- items: shapes rasterised, then outlined and shaded ----------
/** A mask from shapes: lines (with width), discs, polygons. */
function mask() {
  const m = new Uint8Array(S * S);
  const api = {
    m,
    line(x0, y0, x1, y1, w = 1.6) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const px = x + 0.5, py = y + 0.5, dx = x1 - x0, dy = y1 - y0, t = clamp(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1); if (Math.hypot(px - x0 - dx * t, py - y0 - dy * t) <= w / 2) m[y * S + x] = 1; } return api; },
    curve(pts, w = 2) { for (let i = 0; i < 20; i++) { const t0 = i / 20, t1 = (i + 1) / 20, at = t => { const [a, b, c] = pts; const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; }; const [x0, y0] = at(t0), [x1, y1] = at(t1); api.line(x0, y0, x1, y1, w * (1 - Math.abs(t0 - 0.5) * 0.5)); } return api; },
    disc(cx, cy, r, ry = r) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m[y * S + x] = 1; return api; },
    poly(pts) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let inside = false; const px = x + 0.5, py = y + 0.5; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside; } if (inside) m[y * S + x] = 1; } return api; },
    cut(other) { for (let i = 0; i < m.length; i++) if (other.m[i]) m[i] = 0; return api; },
  };
  return api;
}
/** Layers [{mask, color, light?, dark?}] painted in order, shaded (light top-left, dark bottom-right) and outlined. */
function icon(layers, {outline = true, sparkle = null} = {}) {
  const p = pic(), owner = new Int8Array(S * S).fill(-1);
  layers.forEach((l, li) => { for (let i = 0; i < S * S; i++) if (l.mask.m[i]) owner[i] = li; });
  const inMask = (x, y, li) => x >= 0 && y >= 0 && x < S && y < S && owner[y * S + x] === li;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const li = owner[y * S + x]; if (li < 0) continue;
    const l = layers[li], base = hex(l.color);
    let c = base;
    if (!inMask(x - 1, y, li) || !inMask(x, y - 1, li)) c = l.light ? hex(l.light) : mix(base, [255, 255, 255], 0.3);
    if (!inMask(x + 1, y, li) || !inMask(x, y + 1, li)) c = l.dark ? hex(l.dark) : mul(base, 0.68);
    if (l.grain) c = mul(c, 0.92 + hash(li + 3, x, y) * 0.14);
    p.set(x, y, c);
  }
  if (outline) {
    const out = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (owner[y * S + x] >= 0) continue;
      let li = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < S && yy < S && owner[yy * S + xx] >= 0) { li = owner[yy * S + xx]; break; } }
      if (li >= 0) out.push([x, y, li]);
    }
    for (const [x, y, li] of out) p.set(x, y, mul(hex(layers[li].outline || layers[li].dark || layers[li].color), layers[li].outline ? 1 : 0.42));
  }
  if (sparkle) for (const [x, y] of sparkle) p.set(x, y, [255, 255, 255]);
  return p;
}
const HANDLE = {color: '#8a6438', light: '#a87d48', dark: '#5c4021', outline: '#2e2010'};
const MAT = {wooden: ['#a8834f', '#c49c62', '#6f5430', '#3a2a14'], stone: ['#8a8a8a', '#a8a8a8', '#5e5e5e', '#2e2e2e'], iron: ['#d8d8d8', '#ffffff', '#a0a0a0', '#3c3c3c'],
  golden: ['#f2d23a', '#fff7a8', '#c99a1a', '#5a3f08'], diamond: ['#5ee3dc', '#c8fffb', '#2aa59e', '#0e3f3c']};
function tool(kind, mat) {
  const [color, light, dark, outline] = MAT[mat], head = {color, light, dark, outline};
  const handle = mask();
  const h = mask();
  if (kind === 'pickaxe') { handle.line(2.5, 13.5, 10, 6, 1.6); h.curve([[5, 1.5], [12, 4], [14.5, 11]], 2.2); }
  if (kind === 'axe') { handle.line(2.5, 13.5, 11, 5, 1.6); h.poly([[7.5, 2.5], [11, 1.5], [14, 5], [12.5, 8.5], [10, 6.5], [9.5, 4.5]]); }
  if (kind === 'shovel') { handle.line(2.5, 13.5, 10, 6, 1.6); h.poly([[8.5, 5.5], [11.5, 2.5], [14, 2], [13.5, 4.5], [10.5, 7.5]]).line(9, 7, 11.5, 4.5, 2.2); }
  if (kind === 'hoe') { handle.line(2.5, 13.5, 11, 5, 1.6); h.line(10.5, 5.5, 6.5, 1.5, 2).line(10, 5, 12.5, 2.5, 1.8); }
  if (kind === 'sword') { handle.line(1.5, 14.5, 4.5, 11.5, 1.8); h.line(5.5, 10.5, 14, 2, 2.4).poly([[12.5, 2], [14.5, 1.5], [14, 3.5]]); const guard = mask().line(3, 9, 7, 13, 1.8); return icon([{mask: handle, ...HANDLE}, {mask: guard, color: '#5c4021', light: '#7a5a32', dark: '#3a2814', outline: '#1e140a'}, {mask: h, ...head}]); }
  return icon([{mask: handle, ...HANDLE}, {mask: h, ...head}]);
}
const blob = (cx, cy, r, seed) => { const m = mask(), rr = rng(seed); m.disc(cx, cy, r, r * 0.9); for (let k = 0; k < 4; k++) m.disc(cx + (rr() - 0.5) * r * 1.2, cy + (rr() - 0.5) * r * 1.2, r * (0.45 + rr() * 0.3)); return m; };
/** A piece of meat: the meat, its fat rim, a darker side; a bone sticking out when bone. */
const meat = (color, fat, dark, bone) => {
  const layers = [{mask: mask().disc(8, 8.5, 5.4, 4.4), color: fat, light: '#ffffff', dark, outline: '#3a1a10'}, {mask: mask().disc(7.5, 8, 4.2, 3.4), color, dark, light: fat, grain: true}];
  if (bone) layers.unshift({mask: mask().line(11, 6, 14, 3, 1.6), color: '#efe9dc', light: '#ffffff', dark: '#b8b0a0', outline: '#4a4438'});
  return icon(layers);
};
const drumstick = (color, dark) => icon([{mask: mask().line(10, 6, 13.5, 2.5, 1.4).disc(13.5, 2.5, 1.2), color: '#efe9dc', light: '#ffffff', dark: '#b8b0a0', outline: '#4a4438'}, {mask: mask().disc(7, 9.5, 4.6, 4).disc(9.5, 7, 2.5), color, dark, outline: '#3a200c', grain: true}]);
const doorIcon = (c, window) => { const layers = [{mask: mask().poly([[4, 1], [12, 1], [12, 15], [4, 15]]), color: c, outline: '#2e2010', grain: true}]; if (window) layers.push({mask: mask().poly([[5.5, 2.5], [10.5, 2.5], [10.5, 6.5], [5.5, 6.5]]), color: '#bfe3ee', dark: '#8ab4c4'}); return icon(layers); };
const ingot = c => icon([{mask: mask().poly([[2, 10], [9, 5.5], [14, 7.5], [7, 12.5]]), color: c[0], light: c[1], dark: c[2], outline: c[3]}]);
const raw = (c, seed) => { const p = icon([{mask: blob(8, 8.5, 4.6, seed), color: c[0], light: c[1], dark: c[2], outline: c[3], grain: true}]); const r = rng(seed + 1); for (let k = 0; k < 5; k++) { const x = 5 + Math.floor(r() * 6), y = 5 + Math.floor(r() * 6); if (p.alpha(x, y)) p.set(x, y, hex(c[1])); } return p; };
const ITEM_ART = {
  stick: () => icon([{mask: mask().line(3.5, 12.5, 12, 4, 1.7), ...HANDLE}]),
  coal: () => icon([{mask: blob(8, 8.5, 4.8, 5), color: '#2b2b2b', light: '#4a4a4a', dark: '#141414', outline: '#050505', grain: true}], {sparkle: [[6, 6]]}),
  charcoal: () => icon([{mask: blob(8, 8.5, 4.8, 6), color: '#3a2c22', light: '#5a4636', dark: '#1e1610', outline: '#0a0705', grain: true}]),
  raw_iron: () => raw(['#c99c7a', '#e8c5a8', '#8f6a4f', '#3a2a1e'], 11), raw_copper: () => raw(['#c56d43', '#e7915f', '#8a4a2e', '#3a1e10'], 12), raw_gold: () => raw(['#e8be2c', '#fff07a', '#b48a14', '#4a3606'], 13),
  iron_ingot: () => ingot(['#d8d8d8', '#ffffff', '#9a9a9a', '#3a3a3a']), copper_ingot: () => ingot(['#d07a4e', '#f2a079', '#924e30', '#3a1e10']), gold_ingot: () => ingot(['#f2d23a', '#fff7a8', '#c99a1a', '#5a3f08']),
  diamond: () => icon([{mask: mask().poly([[3, 6], [6, 3], [10, 3], [13, 6], [8, 13.5]]), color: '#5ee3dc', light: '#d8fffc', dark: '#239f99', outline: '#0e3f3c'}], {sparkle: [[6, 5], [7, 4]]}),
  emerald: () => icon([{mask: mask().poly([[8, 1.5], [12, 5], [12, 11], [8, 14.5], [4, 11], [4, 5]]), color: '#17d14a', light: '#9bf7b2', dark: '#0b7f2b', outline: '#043a12'}], {sparkle: [[6, 5]]}),
  lapis_lazuli: () => icon([{mask: blob(8, 8, 4.4, 21), color: '#2350b8', light: '#5b85e6', dark: '#163a8a', outline: '#08183a', grain: true}]),
  redstone: () => { const m = mask(); const r = rng(22); for (let k = 0; k < 9; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1.2 + r() * 1.2); return icon([{mask: m, color: '#d00f0f', light: '#ff4b4b', dark: '#7c0606', outline: '#3a0202'}]); },
  glowstone_dust: () => { const m = mask(); const r = rng(23); for (let k = 0; k < 9; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1.2 + r() * 1.2); return icon([{mask: m, color: '#e8c25a', light: '#fff0a6', dark: '#a87d2a', outline: '#4a3610'}]); },
  flint: () => icon([{mask: mask().poly([[5, 3], [11, 4], [13, 10], [8, 14], [3, 9]]), color: '#3a3a3a', light: '#6a6a6a', dark: '#1e1e1e', outline: '#080808', grain: true}]),
  book: () => icon([{mask: mask().poly([[3, 4], [11, 2], [13, 11], [5, 13.5]]), color: '#7a3a1e', light: '#a4562e', dark: '#4e2210', outline: '#200c04'}, {mask: mask().line(5.5, 13, 13, 11, 1.2), color: '#f0ead8', light: '#ffffff', dark: '#c8bfa4'}]),
  snowball: () => icon([{mask: mask().disc(8, 8.5, 4.5), color: '#eef6fa', light: '#ffffff', dark: '#b8ccd8', outline: '#5a7080'}]),
  clay_ball: () => icon([{mask: mask().disc(8, 8.5, 4.3, 3.8), color: '#a0a7b6', light: '#c4cad6', dark: '#6e7484', outline: '#30343c'}]),
  brick: () => icon([{mask: mask().poly([[2, 10], [9, 5.5], [14, 7.5], [7, 12.5]]), color: '#a65a46', light: '#c97a62', dark: '#6e3426', outline: '#2e140c'}]),
  apple: () => icon([{mask: mask().disc(7, 9.5, 4.6, 4.3).disc(10, 9.5, 4, 4), color: '#d42a1f', light: '#ff6a52', dark: '#8a140c', outline: '#3a0604'}, {mask: mask().line(8.5, 5.5, 9.5, 2.5, 1.2), ...HANDLE}, {mask: mask().disc(11.5, 3.5, 1.8, 1.1), color: '#4c9a2a', light: '#7cc44a', dark: '#2e6a16', outline: '#103008'}]),
  wheat_seeds: () => { const p = pic(); for (const [x, y, c] of [[4, 9, '#5fa437'], [7, 6, '#4c8a2a'], [10, 10, '#5fa437'], [6, 12, '#8a9a3a'], [11, 6, '#4c8a2a'], [8, 9, '#6aa83a']]) { p.set(x, y, hex(c)); p.set(x + 1, y, mul(hex(c), 0.7)); p.set(x, y + 1, mul(hex(c), 0.6)); } return p; },
  wheat: () => { const m = mask(); for (const [x, a] of [[6, -0.25], [8, 0], [10, 0.25]]) m.line(x - 2 * a * 6, 14, x + a * 6, 2, 1.3); return icon([{mask: m, color: '#d1ad52', light: '#efd27a', dark: '#9a7a2e', outline: '#3e2e0e'}]); },
  bread: () => icon([{mask: mask().disc(8, 9, 6.2, 3.6), color: '#b7782f', light: '#dca052', dark: '#7a4a1a', outline: '#2e1806'}], {sparkle: [[5, 7], [8, 6], [11, 7]]}),
  melon_slice: () => icon([{mask: mask().poly([[2, 4], [14, 4], [8, 14]]), color: '#e23b3b', light: '#ff7a6a', dark: '#a41f1f', outline: '#4a0a0a'}, {mask: mask().line(2.5, 4, 13.5, 4, 1.4), color: '#6f9a1c', light: '#a4bf2a', dark: '#3f5a10'}]),
  bucket: () => icon([{mask: mask().poly([[3, 5], [13, 5], [11.5, 14], [4.5, 14]]).cut(mask().poly([[5, 5], [11, 5], [10, 7], [6, 7]])), color: '#bdbdbd', light: '#e8e8e8', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().curve([[3, 5], [8, -2], [13, 5]], 1), color: '#8a8a8a', dark: '#4a4a4a'}]),
  water_bucket: () => icon([{mask: mask().poly([[3, 5], [13, 5], [11.5, 14], [4.5, 14]]), color: '#bdbdbd', light: '#e8e8e8', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().poly([[4.5, 5], [11.5, 5], [11, 7], [5, 7]]), color: '#3f76e4', light: '#7aa6ff', dark: '#2a4fa8'}, {mask: mask().curve([[3, 5], [8, -2], [13, 5]], 1), color: '#8a8a8a', dark: '#4a4a4a'}]),
  lava_bucket: () => icon([{mask: mask().poly([[3, 5], [13, 5], [11.5, 14], [4.5, 14]]), color: '#bdbdbd', light: '#e8e8e8', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().poly([[4.5, 5], [11.5, 5], [11, 7], [5, 7]]), color: '#f2791a', light: '#ffc951', dark: '#c6400b'}, {mask: mask().curve([[3, 5], [8, -2], [13, 5]], 1), color: '#8a8a8a', dark: '#4a4a4a'}]),
  bowl: () => icon([{mask: mask().disc(8, 8, 6, 5).cut(mask().disc(8, 5.5, 6.5, 3.5)), ...HANDLE}]),
  // meat, raw and cooked
  porkchop: () => meat('#e98f8f', '#f7d8cf', '#b8605f', true), cooked_porkchop: () => meat('#b4683c', '#e9b37c', '#7c3f1e', true),
  beef: () => meat('#c7362f', '#e7837a', '#8a1d18', false), cooked_beef: () => meat('#7c4426', '#a8653a', '#4e2614', false),
  mutton: () => meat('#d9604f', '#f0b0a0', '#963b2e', true), cooked_mutton: () => meat('#9c5832', '#c98a52', '#5e3018', true),
  chicken: () => drumstick('#f2cdb4', '#d9a78c'), cooked_chicken: () => drumstick('#cc8c40', '#9a5e22'),
  carrot: () => icon([{mask: mask().line(4, 12, 11, 5, 3).line(3.5, 12.5, 6, 10, 2), color: '#f08a1c', light: '#ffb45a', dark: '#b05a0c', outline: '#4a2204'}, {mask: mask().line(11, 5, 13.5, 2, 1.4).line(11, 5, 14, 5, 1.2), color: '#4f9a2a', light: '#7cc44a', dark: '#2e6216', outline: '#103008'}]),
  potato: () => icon([{mask: mask().disc(8, 8.5, 5, 4), color: '#c9a55a', light: '#e6c47c', dark: '#8a6a30', outline: '#3a2a0e', grain: true}], {sparkle: [[6, 7]]}),
  baked_potato: () => icon([{mask: mask().disc(8, 8.5, 5, 4), color: '#c98a3a', light: '#f0c070', dark: '#7a4a18', outline: '#2e1a06', grain: true}, {mask: mask().line(6, 8, 10, 8, 1.2), color: '#f6e6a0', dark: '#e0c060'}]),
  rotten_flesh: () => { const p = icon([{mask: blob(8, 8.5, 5, 41), color: '#7a6b3a', light: '#9a8a52', dark: '#4e4220', outline: '#2a220e', grain: true}]); for (const [x, y] of [[6, 7], [9, 10], [10, 6], [5, 10]]) if (p.alpha(x, y)) p.set(x, y, hex('#3c4a1c')); return p; },
  spider_eye: () => icon([{mask: mask().disc(8, 8, 4.6), color: '#a3201c', light: '#d84a3c', dark: '#5e0e0c', outline: '#2a0606'}], {sparkle: [[6, 6]]}),
  leather: () => icon([{mask: mask().poly([[3, 4], [7, 3], [9, 4], [13, 3], [12, 8], [13, 13], [8, 12], [3, 13], [4, 8]]), color: '#9a5a2e', light: '#bd7a46', dark: '#64361a', outline: '#2e1808', grain: true}]),
  feather: () => icon([{mask: mask().curve([[4, 13], [7, 6], [13, 2]], 3), color: '#f2f2ee', light: '#ffffff', dark: '#bdbdb6', outline: '#5a5a54'}, {mask: mask().line(3, 14, 9, 7, 1), color: '#cfcfc8', dark: '#8a8a84'}]),
  bone: () => icon([{mask: mask().line(4.5, 11.5, 11.5, 4.5, 2).disc(4, 12, 1.7).disc(5, 13, 1.5).disc(12, 4, 1.7).disc(11, 3, 1.5), color: '#ece8dc', light: '#ffffff', dark: '#b8b2a2', outline: '#5c584c'}]),
  bone_meal: () => { const m = mask(), r = rng(43); for (let k = 0; k < 9; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1.2 + r() * 1.3); return icon([{mask: m, color: '#f0eee6', light: '#ffffff', dark: '#c4c0b2', outline: '#6a665a'}]); },
  string: () => icon([{mask: mask().curve([[3, 12], [6, 2], [8, 8]], 1.2).curve([[8, 8], [10, 14], [13, 4]], 1.2), color: '#f4f4f4', light: '#ffffff', dark: '#c8c8c8', outline: '#4a4a4a'}]),
  gunpowder: () => { const m = mask(), r = rng(44); for (let k = 0; k < 10; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1.2 + r() * 1.3); return icon([{mask: m, color: '#5a5a5a', light: '#7c7c7c', dark: '#383838', outline: '#141414'}]); },
  paper: () => icon([{mask: mask().poly([[3, 3], [12, 2], [13, 13], [4, 14]]), color: '#f2f0e6', light: '#ffffff', dark: '#cfcbbb', outline: '#6a665a'}]),
  arrow: () => icon([{mask: mask().line(3.5, 12.5, 11.5, 4.5, 1.3), ...HANDLE}, {mask: mask().poly([[10, 3], [13.5, 2.5], [13, 6]]), color: '#9a9a9a', light: '#cfcfcf', dark: '#5a5a5a', outline: '#202020'}, {mask: mask().poly([[2, 11], [5, 11], [5, 14], [2, 14]]), color: '#eeeeea', dark: '#b4b4ae', outline: '#4a4a44'}]),
  bow: () => icon([{mask: mask().curve([[3, 13], [3, 3], [13, 3]], 2), ...HANDLE}, {mask: mask().line(4, 12, 12, 4, 0.9), color: '#e6e6e6', dark: '#9a9a9a'}]),
  shears: () => icon([{mask: mask().line(4, 12, 12, 4, 2).line(4, 4, 8, 8, 2), color: '#c8c8c8', light: '#f0f0f0', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().disc(4.5, 4.5, 1.6).disc(3.5, 12, 1.6), color: '#6b4a2a', dark: '#3e2814', outline: '#1e1206'}]),
  flint_and_steel: () => icon([{mask: mask().curve([[4, 12], [3, 4], [10, 4]], 2).cut(mask().disc(6, 8, 1.5)), color: '#a8a8a8', light: '#dcdcdc', dark: '#6a6a6a', outline: '#262626'}, {mask: mask().poly([[9, 8], [13, 9], [12, 13], [8, 12]]), color: '#3a3a3a', light: '#6a6a6a', dark: '#1e1e1e', outline: '#080808'}]),
  oak_door: () => doorIcon('#b8945f', true), spruce_door: () => doorIcon('#6e5130', false), birch_door: () => doorIcon('#d4c78e', true),
  // the arm shown when the hand is empty: a sleeve over skin (our own colours)
  player_arm: () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sleeve = y < 6, c = sleeve ? hex(y === 5 ? '#9e3646' : '#c84a5a') : hex('#f2c9a9'); p.set(x, y, mul(c, 0.92 + hash(9, x, y) * 0.1 - (x % 4 === 3 ? 0.06 : 0))); } return p; },
};
for (const mat of Object.keys(MAT)) for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) ITEM_ART[`${mat}_${kind}`] = () => tool(kind, mat);
// armour: a cap, a vest, trousers, a pair of boots, in the material's colours
const ARMOR_COLORS = {leather: ['#a0623a', '#c28452', '#6e3f1f', '#2e1808'], chainmail: ['#8c8c8c', '#c4c4c4', '#5c5c5c', '#262626'], iron: MAT.iron, golden: MAT.golden, diamond: MAT.diamond};
const ARMOR_SHAPES = {
  helmet: () => mask().poly([[2.5, 11], [2.5, 6.5], [4.5, 3], [11.5, 3], [13.5, 6.5], [13.5, 11], [11, 11], [11, 8], [5, 8], [5, 11]]),
  chestplate: () => mask().poly([[1.5, 3], [6, 3], [8, 5], [10, 3], [14.5, 3], [13.5, 8.5], [12, 8.5], [12, 14], [4, 14], [4, 8.5], [2.5, 8.5]]),
  leggings: () => mask().poly([[3, 2], [13, 2], [13, 14], [9.5, 14], [8.5, 6.5], [7.5, 6.5], [6.5, 14], [3, 14]]),
  boots: () => mask().poly([[1.5, 6], [6, 6], [6, 10], [7, 11], [7, 13.5], [1.5, 13.5]]).poly([[10, 6], [14.5, 6], [14.5, 13.5], [9, 13.5], [9, 11], [10, 10]]),
};
for (const [mat, [color, light, dark, outline]] of Object.entries(ARMOR_COLORS)) for (const [piece, shape] of Object.entries(ARMOR_SHAPES))
  ITEM_ART[`${mat}_${piece}`] = () => {
    const p = icon([{mask: shape(), color, light, dark, outline, grain: mat === 'leather'}], {sparkle: mat === 'diamond' || mat === 'golden' ? [[5, 5]] : null});
    // chainmail: little rings, a dark dot in each
    if (mat === 'chainmail') for (let y = 4; y < 14; y += 2) for (let x = 3 + (y >> 1) % 2; x < 14; x += 2) if (p.alpha(x, y) && p.alpha(x + 1, y) && p.alpha(x, y + 1)) p.set(x, y, hex('#3c3c3c'));
    return p;
  };
// the enchanting table: obsidian, a red cloth over its top edge with a gold border, a gold diamond on the cloth on top
const obsidianPic = seed => specks(mottled(seed, ['#0f0b19', '#150f22', '#1b142b', '#22193a'], {cells: 4, grain: 0.4}), seed + 1, 7, ['#3b2b5c', '#2a1f44'], {size: 2});
const CLOTH = ['#8e1f24', '#a2272c', '#b52f34'];
BLOCK_ART.enchanting_table_side = () => {
  const p = obsidianPic(121), r = rng(122);
  for (let y = 0; y < 4; y++) for (let x = 0; x < S; x++) p.set(x, y, [0, 0, 0], 0);
  for (let y = 4; y < 8; y++) for (let x = 0; x < S; x++) p.set(x, y, hex(CLOTH[Math.floor(r() * 3)]));
  for (let x = 0; x < S; x++) p.set(x, 8, hex(x % 3 ? '#d8a830' : '#f6d860'));
  for (const x of [3, 8, 12]) { p.set(x, 9, hex('#b52f34')); p.set(x, 10, hex('#8e1f24')); }
  return p;
};
BLOCK_ART.enchanting_table_top = () => {
  const p = obsidianPic(123), r = rng(124);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) p.set(x, y, hex(CLOTH[Math.floor(r() * 3)]));
  for (let i = 2; i < 14; i++) { p.set(i, 2, hex('#d8a830')); p.set(i, 13, hex('#d8a830')); p.set(2, i, hex('#d8a830')); p.set(13, i, hex('#d8a830')); }
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) if (Math.abs(x - 7.5) + Math.abs(y - 7.5) < 3.6) p.set(x, y, hex(Math.abs(x - 7.5) + Math.abs(y - 7.5) < 2 ? '#fff0a0' : '#e8c048'));
  return p;
};
BLOCK_ART.enchanting_table_bottom = () => obsidianPic(125);
// the anvil: dark iron, worn smooth on top; chipped and damaged ones cracked
BLOCK_ART.anvil = () => { const p = mottled(131, ['#3c3c3c', '#444444', '#4c4c4c', '#363636'], {cells: 4, grain: 0.3}); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#5a5a5a')); p.set(i, 15, hex('#2a2a2a')); } return p; };
const anvilTop = cracks => () => {
  const p = mottled(132, ['#5c5c5c', '#646464', '#6c6c6c', '#565656'], {cells: 4, grain: 0.25});
  for (let i = 0; i < S; i++) { p.set(i, 0, hex('#7a7a7a')); p.set(0, i, hex('#7a7a7a')); p.set(i, 15, hex('#3a3a3a')); p.set(15, i, hex('#3a3a3a')); }
  const r = rng(133);
  for (let k = 0; k < cracks; k++) { let x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12); for (let s = 0; s < 5; s++) { p.set(x, y, hex('#2a2a2a')); x += Math.floor(r() * 3) - 1; y += 1; } }
  return p;
};
BLOCK_ART.anvil_top = anvilTop(0); BLOCK_ART.chipped_anvil_top = anvilTop(2); BLOCK_ART.damaged_anvil_top = anvilTop(5);
// the open book floating over the table: cream pages with lines of writing
BLOCK_ART.enchanting_book_pages = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, hex(x === 0 || x === 15 || y === 0 || y === 15 ? '#6e3a1e' : '#efe4c4')); for (let y = 3; y < 13; y += 2) for (let x = 3; x < 13; x++) if (hash(201, x, y) > 0.35) p.set(x, y, hex('#7a6a8a')); return p; };
// the bobber: red over white
BLOCK_ART.fishing_hook = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x - 7.5, y - 8.5); if (d < 4.6) p.set(x, y, hex(y < 8 ? '#d42a2a' : '#f2f2f2')); } p.set(7, 2, hex('#2a2a2a')); p.set(7, 3, hex('#2a2a2a')); return p; };
ITEM_ART.enchanted_book = () => icon([{mask: mask().poly([[3, 4], [11, 2], [13, 11], [5, 13.5]]), color: '#7a2a8a', light: '#a85ab8', dark: '#4e165a', outline: '#200628'}, {mask: mask().line(5.5, 13, 13, 11, 1.2), color: '#f0ead8', light: '#ffffff', dark: '#c8bfa4'}, {mask: mask().poly([[7, 6], [9, 5.5], [10, 8], [8, 8.5]]), color: '#f6d860', dark: '#c8a030'}]);
const rodIcon = cast => icon([{mask: mask().line(2.5, 13.5, 12, 3, 1.5), ...HANDLE}, ...(cast ? [] : [{mask: mask().line(12.5, 3, 13, 11, 0.8).disc(13, 11.5, 0.9), color: '#e6e6e6', dark: '#9a9a9a'}])]);
ITEM_ART.fishing_rod = () => rodIcon(false); ITEM_ART.fishing_rod_cast = () => rodIcon(true);
const fish = (body, belly, fin, eye = '#141414') => { const p = icon([{mask: mask().disc(7, 8.5, 5, 3).poly([[11, 8.5], [14.5, 5.5], [14.5, 11.5]]), color: body, dark: fin, outline: '#1e1e1e'}, {mask: mask().disc(7, 10, 4, 1.4), color: belly, dark: body}]); p.set(4, 7, hex(eye)); return p; };
ITEM_ART.cod = () => fish('#b9a27c', '#e2d6bc', '#7c6a4c'); ITEM_ART.cooked_cod = () => fish('#c98a4a', '#e8b878', '#7a4a1e', '#5a3010');
ITEM_ART.salmon = () => fish('#b64a3a', '#e8a088', '#6e2a20'); ITEM_ART.cooked_salmon = () => fish('#b8683a', '#e6a070', '#6e3a18', '#5a3010');
ITEM_ART.tropical_fish = () => { const p = fish('#f08a2a', '#ffffff', '#b85a10'); for (const x of [6, 9]) for (let y = 6; y < 12; y++) if (p.alpha(x, y)) p.set(x, y, hex('#ffffff')); return p; };
ITEM_ART.pufferfish = () => { const p = icon([{mask: mask().disc(8, 8.5, 5, 4.6), color: '#e8c838', light: '#fff07a', dark: '#a88a18', outline: '#3a2e08'}]); for (const [x, y] of [[3, 5], [12, 5], [3, 12], [12, 12], [8, 3], [8, 14]]) p.set(x, y, hex('#f0f0e0')); p.set(5, 7, hex('#141414')); return p; };
// an experience orb: a round glow, yellow-green, brighter inside
BLOCK_ART.xp_orb = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6.5) p.set(x, y, d < 2.5 ? [250, 255, 190] : d < 4.5 ? [190, 240, 60] : [110, 170, 20]); } return p; };
// rain: a few thin streaks, see-through; snow: flakes here and there
BLOCK_ART.weather_rain = () => { const p = pic(), r = rng(71); for (let k = 0; k < 3; k++) { const x = 2 + k * 5 + Math.floor(r() * 3), y0 = Math.floor(r() * 16), len = 3 + Math.floor(r() * 4); for (let i = 0; i < len; i++) p.set(x, (y0 + i) % S, [175, 195, 220], 105 + i * 8); } return p; };
BLOCK_ART.weather_snow = () => { const p = pic(), r = rng(72); for (let k = 0; k < 7; k++) { const x = Math.floor(r() * 15), y = Math.floor(r() * 15); p.set(x, y, [255, 255, 255], 230); if (r() < 0.5) p.set(x + 1, y, [235, 240, 250], 200); } return p; };
BLOCK_ART.lightning_bolt = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, [235, 240, 255]); return p; };

// ---------- the Nether ----------
const NETHERRACK = ['#4f1d1d', '#5e2222', '#6b2828', '#782d2d', '#843333', '#6f1f1f'];
BLOCK_ART.netherrack = () => { const p = mottled(301, NETHERRACK, {cells: 8, grain: 0.7, smooth: 0.3}); const r = rng(302); for (let k = 0; k < 10; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); p.set(x, y, hex('#3b1212')); p.set(x + 1, y, hex('#9a4a4a')); } return p; };
BLOCK_ART.soul_sand = () => {
  const p = mottled(311, ['#3e2d22', '#4a372a', '#554032', '#5f493a'], {cells: 8, grain: 0.5, smooth: 0.4});
  // faces of the souls pressed into it
  for (const [fx, fy] of [[2, 3], [9, 2], [4, 10], [11, 9]]) { for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [1, 2], [2, 2]]) p.set(fx + dx, fy + dy, hex('#2a1d15')); p.set(fx + 1, fy + 3, hex('#2a1d15')); }
  return p;
};
BLOCK_ART.nether_quartz_ore = () => specks(BLOCK_ART.netherrack(), 321, 7, ['#f0ebe2', '#d6cfc0', '#ffffff'], {size: 2});
BLOCK_ART.nether_gold_ore = () => specks(BLOCK_ART.netherrack(), 322, 8, ['#f6d050', '#c8961c', '#fff08a'], {size: 1});
// magma: dark crust with glowing cracks that throb (three frames)
const magma = f => { const p = mottled(331, ['#5a2410', '#6a2c12', '#4a1c0c'], {cells: 4, grain: 0.4}), n = tileNoise(332, 4), glow = [0.12, 0.17, 0.14][f]; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = Math.abs(n(x, y) - 0.5); if (v < glow) p.set(x, y, v < glow * 0.45 ? hex('#ffd24a') : hex('#e8701a')); } return p; };
BLOCK_ART.magma = magma;
BLOCK_ART.nether_bricks = () => {
  const p = pic().fill(hex('#2c1418')), r = rng(341);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = y >> 2, off = row % 2 ? 4 : 0, inBrick = (y & 3) !== 3 && ((x + off) & 7) !== 7;
    if (inBrick) p.set(x, y, mul(hex(['#46222a', '#4e262e', '#552a33'][Math.floor(r() * 3)]), (y & 3) === 0 ? 1.15 : 1));
  }
  return p;
};
// nether wart: little red knobs on stalks, bigger as it grows
const wart = stage => { const p = pic(), r = rng(351 + stage); const n = [4, 6, 9][stage]; for (let k = 0; k < n; k++) { const x = 2 + Math.floor(r() * 12), top = 15 - (stage + 1) * 3 - Math.floor(r() * 3); for (let y = top + 1; y < 16; y++) p.set(x, y, hex('#6a1a1a')); p.set(x, top, hex('#c0302a')); if (stage) { p.set(x - 1, top, hex('#a02420')); p.set(x + 1, top + 1, hex('#8a1e1a')); } if (stage === 2) p.set(x, top - 1, hex('#e04a3a')); } return p; };
for (let i = 0; i < 3; i++) BLOCK_ART[`nether_wart_stage${i}`] = () => wart(i);
BLOCK_ART.spawner = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const bar = x % 5 === 0 || y % 5 === 0 || x === 15 || y === 15; if (bar) p.set(x, y, mul(hex('#2c3a46'), 0.8 + hash(361, x, y) * 0.4)); } return p; };
// the portal: purple swirls that turn (sixteen frames)
const portal = f => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5), v = Math.sin(a * 2 + d * 0.9 - f * Math.PI / 8) * 0.5 + 0.5 + (hash(371, x, y) - 0.5) * 0.3; p.set(x, y, mix(hex('#3a0a7a'), hex('#b45cff'), clamp(v, 0, 1)), 190); } return p; };
BLOCK_ART.nether_portal = portal;
BLOCK_ART.quartz_block_side = () => mottled(381, ['#e8e2d6', '#ece6db', '#f0ebe1', '#e4ddd0'], {cells: 4, grain: 0.15, smooth: 0.8});
BLOCK_ART.quartz_block_top = BLOCK_ART.quartz_block_bottom = () => { const p = BLOCK_ART.quartz_block_side(); for (let i = 0; i < S; i++) { p.set(i, 0, hex('#d4ccbd')); p.set(0, i, hex('#d4ccbd')); } return p; };
// the brewing stand: a dark rod and arms; the base grey stone
BLOCK_ART.brewing_stand = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex('#5a4a3a'), 0.85 + hash(391, x, y) * 0.3)); for (let y = 0; y < 3; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex('#d8c050')); return p; };
BLOCK_ART.brewing_stand_base = () => mottled(392, ['#6a6a6a', '#7a7a7a', '#5e5e5e'], {cells: 4, grain: 0.3});
// items
const bottle = () => mask().disc(8, 10.5, 4.6, 4.2).poly([[6.5, 2.5], [9.5, 2.5], [9.5, 7], [6.5, 7]]);
const splashBottle = () => mask().disc(8, 10, 5, 4.6).poly([[6.5, 2], [9.5, 2], [9.5, 6], [6.5, 6]]);
const liquid = shape => mask().disc(8, 10.8, 3.4, 3).cut(mask().poly([[0, 0], [16, 0], [16, shape === 'splash' ? 8.5 : 9], [0, shape === 'splash' ? 8.5 : 9]]));
const glassOf = (m, cutLiquid, cork) => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (!m.m[y * S + x] || cutLiquid?.m[y * S + x]) continue; const edge = !m.m[y * S + x - 1] || !m.m[y * S + x + 1] || !m.m[(y - 1) * S + x] || !m.m[(y + 1) * S + x]; if (edge) p.set(x, y, hex('#5a6a7a')); else if (cutLiquid) p.set(x, y, hex('#dfeef8'), 110); else p.set(x, y, hex('#c8dcea'), 150); } for (let x = 7; x < 9; x++) { p.set(x, 1, hex(cork)); p.set(x, 2, hex(cork)); } return p; };
ITEM_ART.glass_bottle = () => glassOf(bottle(), null, '#a87850');
ITEM_ART.potion = () => glassOf(bottle(), liquid('drink'), '#a87850');
ITEM_ART.splash_potion = () => glassOf(splashBottle(), liquid('splash'), '#8a8a8a');
ITEM_ART.potion_overlay = () => { const p = pic(), m = liquid('drink'); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.m[y * S + x]) p.set(x, y, mul([255, 255, 255], 0.75 + (x < 7 && y < 11 ? 0.25 : 0) - (y > 12 ? 0.15 : 0))); return p; };
ITEM_ART.quartz = () => icon([{mask: mask().poly([[3, 9], [7, 3], [10, 5], [13, 4], [12, 11], [7, 13]]), color: '#e8e2d6', light: '#ffffff', dark: '#b8ae9c', outline: '#4a443a'}]);
ITEM_ART.gold_nugget = () => icon([{mask: mask().disc(7, 9, 3.2, 2.6).disc(10, 7.5, 2.4), color: '#f2d23a', light: '#fff7a8', dark: '#c99a1a', outline: '#5a3f08'}], {sparkle: [[6, 8]]});
ITEM_ART.nether_brick = () => icon([{mask: mask().poly([[2, 10], [9, 5.5], [14, 7.5], [7, 12.5]]), color: '#4e262e', light: '#6e3a44', dark: '#2c1418', outline: '#140808'}]);
ITEM_ART.nether_wart = () => icon([{mask: blob(8, 8.5, 4.4, 401), color: '#a02420', light: '#d84a3a', dark: '#5e1010', outline: '#2a0606', grain: true}]);
ITEM_ART.blaze_rod = () => icon([{mask: mask().line(3.5, 12.5, 12.5, 3.5, 2.2), color: '#f0b020', light: '#fff07a', dark: '#b06a08', outline: '#4a2a04'}]);
ITEM_ART.blaze_powder = () => { const m = mask(), r = rng(402); for (let k = 0; k < 9; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1.2 + r() * 1.2); return icon([{mask: m, color: '#f09a1a', light: '#ffe060', dark: '#b05a08', outline: '#4a2204'}]); };
ITEM_ART.ghast_tear = () => icon([{mask: mask().disc(8, 10, 3.6).poly([[8, 2.5], [11, 8.5], [5, 8.5]]), color: '#e6f4f4', light: '#ffffff', dark: '#a8c4c8', outline: '#4a5a5e'}], {sparkle: [[7, 9]]});
ITEM_ART.magma_cream = () => icon([{mask: mask().disc(8, 8.5, 4.8, 4.2), color: '#6a2c12', light: '#9a4a1e', dark: '#3a1608', outline: '#1a0804', grain: true}, {mask: mask().disc(8, 8.5, 2.2, 1.8), color: '#f0a020', light: '#ffe060', dark: '#c06a10'}]);
ITEM_ART.fermented_spider_eye = () => icon([{mask: mask().disc(8, 9, 4.6), color: '#a3201c', light: '#d84a3c', dark: '#5e0e0c', outline: '#2a0606'}, {mask: mask().disc(9, 7, 2.2).disc(6, 11, 1.6), color: '#c8b8a8', light: '#f0e6da', dark: '#8a7a6a'}]);
ITEM_ART.sugar = () => { const m = mask(), r = rng(403); for (let k = 0; k < 10; k++) m.disc(4 + r() * 8, 6 + r() * 7, 1 + r() * 1.3); return icon([{mask: m, color: '#f4f4f4', light: '#ffffff', dark: '#c8c8d0', outline: '#6a6a72'}]); };
ITEM_ART.golden_carrot = () => icon([{mask: mask().line(4, 12, 11, 5, 3).line(3.5, 12.5, 6, 10, 2), color: '#f2d23a', light: '#fff7a8', dark: '#c99a1a', outline: '#5a3f08'}, {mask: mask().line(11, 5, 13.5, 2, 1.4).line(11, 5, 14, 5, 1.2), color: '#e8c838', light: '#fff07a', dark: '#a88a18', outline: '#3a2e08'}], {sparkle: [[7, 8]]});
ITEM_ART.glistering_melon_slice = () => icon([{mask: mask().poly([[2, 4], [14, 4], [8, 14]]), color: '#e23b3b', light: '#ff7a6a', dark: '#a41f1f', outline: '#4a0a0a'}, {mask: mask().line(2.5, 4, 13.5, 4, 1.4), color: '#f2d23a', light: '#fff7a8', dark: '#c99a1a'}], {sparkle: [[6, 7], [9, 9], [8, 6]]});
ITEM_ART.fire_charge = () => { const p = icon([{mask: mask().disc(8, 8.5, 5), color: '#3a2a20', light: '#5a4030', dark: '#1a1008', outline: '#0a0604', grain: true}]); for (const [x, y] of [[6, 6], [9, 7], [7, 10], [10, 10], [5, 9]]) p.set(x, y, hex(hash(404, x, y) > 0.5 ? '#f0a020' : '#ff5a10')); return p; };

// ---------- villages ----------
const OAK = '#b8945f', SPRUCE = '#6e5130', BIRCH = '#d4c78e', DARKW = '#5e3f22';
const framed = (p, c) => { for (let i = 0; i < S; i++) { p.set(i, 0, hex(c)); p.set(i, 15, hex(c)); p.set(0, i, hex(c)); p.set(15, i, hex(c)); } return p; };
BLOCK_ART.dirt_path_top = () => specks(mottled(411, ['#8c6a3c', '#94723f', '#9c7a46', '#856438'], {cells: 8, grain: 0.5, smooth: 0.4}), 412, 8, ['#6f5230', '#a6844f'], {size: 1});
BLOCK_ART.dirt_path_side = () => { const p = dirt(nameSeed('dirt')); const t = BLOCK_ART.dirt_path_top(); for (let y = 1; y < 4; y++) for (let x = 0; x < S; x++) p.set(x, y, t.get(x, y)); for (let x = 0; x < S; x++) p.set(x, 0, [0, 0, 0], 0); return p; };
BLOCK_ART.hay_block_side = () => { const p = mottled(421, ['#b8962a', '#c4a232', '#d0ae3a', '#a8861e'], {cells: 4, grain: 0.5, smooth: 0.3}); for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) if ((x + Math.floor(hash(422, x, 0) * 3)) % 3 === 0) p.set(x, y, mul(p.get(x, y), 0.85)); for (const y of [3, 12]) for (let x = 0; x < S; x++) { p.set(x, y, hex('#7a5a1a')); p.set(x, y + 1, hex('#9a1e1e')); } return p; };
BLOCK_ART.hay_block_top = () => { const p = mottled(423, ['#b8962a', '#c4a232', '#d0ae3a', '#a8861e'], {cells: 8, grain: 0.7, smooth: 0.2}); for (const c of [3, 12]) for (let i = 0; i < S; i++) { p.set(c, i, hex('#9a1e1e')); p.set(i, c, hex('#9a1e1e')); } return p; };
BLOCK_ART.bell_body = () => { const p = mottled(431, ['#d8a828', '#e8b830', '#f0c840', '#c89820'], {cells: 4, grain: 0.25, smooth: 0.7}); for (let x = 0; x < S; x++) { p.set(x, 0, hex('#fff0a0')); p.set(x, 15, hex('#a07010')); } return p; };
BLOCK_ART.composter_side = () => { const p = planks(441, OAK); for (const x of [0, 15]) for (let y = 0; y < S; y++) p.set(x, y, hex(DARKW)); for (let x = 0; x < S; x++) p.set(x, 15, hex(DARKW)); return p; };
BLOCK_ART.composter_top = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (x < 2 || x > 13 || y < 2 || y > 13) p.set(x, y, mul(hex(OAK), 0.9 + hash(442, x, y) * 0.2)); return p; };
BLOCK_ART.composter_bottom = () => planks(443, OAK);
BLOCK_ART.composter_compost = () => specks(mottled(444, ['#3a2a16', '#4a3620', '#5a4228', '#2e2010'], {cells: 8, grain: 0.7, smooth: 0.3}), 445, 10, ['#5a7a2a', '#7a9a3a'], {size: 1});
BLOCK_ART.composter_ready = () => specks(BLOCK_ART.composter_compost(), 446, 18, ['#f0eee6', '#ffffff'], {size: 1});
BLOCK_ART.lectern_base = () => framed(planks(451, OAK), DARKW);
BLOCK_ART.lectern_top = () => { const p = planks(452, OAK); framed(p, DARKW); for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (x !== 8) p.set(x, y, hex(x % 2 ? '#efe4c4' : '#e4d8b4')); return p; };
BLOCK_ART.lectern_sides = () => { const p = planks(453, OAK); for (let x = 0; x < S; x++) { p.set(x, 0, hex(DARKW)); p.set(x, 15, hex(DARKW)); } return p; };
BLOCK_ART.lectern_front = () => { const p = BLOCK_ART.lectern_sides(); for (let y = 2; y < 14; y++) { p.set(7, y, hex(DARKW)); p.set(8, y, hex(DARKW)); } return p; };
BLOCK_ART.barrel_side = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex(SPRUCE), (x % 4 === 3 ? 0.75 : 1) * (0.92 + hash(461, x, y >> 2) * 0.12))); for (const y of [2, 13]) for (let x = 0; x < S; x++) p.set(x, y, hex('#5a5a5a')); return p; };
BLOCK_ART.barrel_top = () => { const p = framed(planks(462, SPRUCE), '#4a3620'); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex(Math.abs(x - 7.5) + Math.abs(y - 7.5) < 2 ? '#3a2a18' : '#5a4228')); return p; };
BLOCK_ART.barrel_bottom = () => framed(planks(463, SPRUCE), '#4a3620');
BLOCK_ART.loom_top = () => { const p = framed(planks(471, BIRCH), '#8a7a50'); for (let x = 2; x < 14; x++) for (const y of [5, 6, 9, 10]) p.set(x, y, hex(['#c84a3a', '#3a6ac8', '#e8c84a', '#4ab85a'][(x + y) % 4])); return p; };
BLOCK_ART.loom_side = () => { const p = framed(planks(472, OAK), DARKW); for (let y = 3; y < 13; y++) for (const x of [4, 8, 12]) p.set(x, y, hex('#f0f0f0')); return p; };
BLOCK_ART.loom_front = () => { const p = framed(planks(473, OAK), DARKW); for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) p.set(x, y, hex((x + y) % 2 ? '#e8e8e8' : '#d0d0d0')); p.rect(6, 6, 9, 9, hex('#c84a3a')); return p; };
BLOCK_ART.loom_bottom = () => planks(474, OAK);
BLOCK_ART.fletching_table_top = () => { const p = framed(planks(481, BIRCH), '#8a7a50'); for (let i = 3; i < 13; i++) p.set(i, i, hex('#6a4a2a')); p.set(12, 12, hex('#9a9a9a')); p.set(3, 3, hex('#f0f0f0')); p.set(4, 3, hex('#f0f0f0')); return p; };
BLOCK_ART.fletching_table_side = () => { const p = planks(482, BIRCH); for (let x = 0; x < S; x++) { p.set(x, 0, hex('#8a7a50')); p.set(x, 1, hex('#6a5a3a')); } return p; };
BLOCK_ART.fletching_table_front = () => { const p = BLOCK_ART.fletching_table_side(); for (let y = 4; y < 13; y++) { p.set(5, y, hex('#f4f4f4')); p.set(10, y, hex('#6a4a2a')); } p.set(10, 3, hex('#9a9a9a')); return p; };
BLOCK_ART.smithing_table_top = () => { const p = framed(mottled(491, ['#3a3a42', '#42424a', '#4a4a52'], {cells: 4, grain: 0.3}), '#26262c'); for (let x = 3; x < 13; x++) { p.set(x, 7, hex('#6a6a72')); p.set(x, 8, hex('#2a2a30')); } return p; };
BLOCK_ART.smithing_table_bottom = () => planks(492, SPRUCE);
BLOCK_ART.smithing_table_side = () => { const p = planks(493, SPRUCE); for (let y = 0; y < 3; y++) for (let x = 0; x < S; x++) p.set(x, y, hex(y === 1 ? '#42424a' : '#26262c')); return p; };
BLOCK_ART.smithing_table_front = () => { const p = BLOCK_ART.smithing_table_side(); p.rect(4, 6, 11, 7, hex('#8a8a92')); p.rect(7, 8, 8, 13, hex('#6a4a2a')); return p; };
// the smoker (dark wood bands round a stone body) and the blast furnace (iron over smooth stone)
const smoker = (face, on) => { const p = furnace(face, on); if (face === 'top') return framed(planks(501, '#4a3a2a'), '#2a1e14'); for (const y of [0, 1, 14, 15]) for (let x = 0; x < S; x++) p.set(x, y, hex(y % 2 ? '#3a2a1a' : '#5a4430')); return p; };
const blast = (face, on) => { const p = furnace(face, on); for (let i = 0; i < S; i++) for (const j of [0, 15]) { p.set(i, j, hex('#9a9aa2')); p.set(j, i, hex('#9a9aa2')); } if (face !== 'top') for (let x = 1; x < 15; x++) p.set(x, 7, hex('#5a5a62')); return p; };
BLOCK_ART.smoker_top = () => smoker('top'); BLOCK_ART.smoker_bottom = () => smoker('top'); BLOCK_ART.smoker_side = () => smoker('side'); BLOCK_ART.smoker_front = () => smoker('front', false); BLOCK_ART.smoker_front_on = () => smoker('front', true);
BLOCK_ART.blast_furnace_top = () => blast('top'); BLOCK_ART.blast_furnace_side = () => blast('side'); BLOCK_ART.blast_furnace_front = () => blast('front', false); BLOCK_ART.blast_furnace_front_on = () => blast('front', true);

// ---------- forests: vines, cocoa, the plants two blocks tall ----------
/** Vines: stems wandering down with leaves along them (grey: the foliage colour is put on). */
function vine() {
  const p = pic(), r = rng(nameSeed('vine'));
  for (const x0 of [2, 6, 10, 13]) {
    let x = x0;
    for (let y = 0; y < S; y++) {
      if (r() < 0.25) x = clamp(x + (r() < 0.5 ? -1 : 1), 0, 15);
      const g = 95 + r() * 30; p.set(x, y, [g, g, g]);
      if (r() < 0.45) { const lx = x + (r() < 0.5 ? -1 : 1), g2 = 130 + r() * 60; p.set(lx, y, [g2, g2, g2]); if (r() < 0.5) p.set(lx, y + 1, [g2 - 20, g2 - 20, g2 - 20]); }
    }
  }
  return p;
}
/**
 * A cocoa pod at its age (0 green and small, 1 yellow, 2 ripe brown), laid out as the game's pictures are: the top
 * in the corner (0, 0)–(t, t), the sides (15 − w, 4)–(15, 4 + h) with ridges down them, the stem at (12, 0)–(16, 4).
 */
function cocoaPod(age) {
  const p = pic(), w = [4, 6, 8][age], h = [5, 7, 9][age], t = [4, 6, 7][age];
  const base = hex(['#7f9c3c', '#c49a3c', '#a65a2a'][age]), dark = mul(base, 0.72), light = mix(base, [255, 255, 255], 0.25);
  for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) p.set(x, y, (x + y) % 3 ? base : light);
  for (let y = 4; y < 4 + h; y++) for (let x = 15 - w; x < 15; x++) {
    const k = x - (15 - w);
    p.set(x, y, y === 4 ? light : y === 3 + h ? dark : k % 3 === 0 ? dark : k % 3 === 1 ? base : mix(base, light, 0.5));
  }
  for (let x = 12; x < 16; x++) { p.set(x, 1, hex('#6a4a22')); if (x > 13) p.set(x, 2, hex('#5a7a2a')); }
  return p;
}
/** Tall grass and the large fern, half by half: the blades go on from the bottom picture into the top one. */
function tallGrass(seed, top, fern) {
  const p = pic(), r = rng(seed), shade = rng(seed + (top ? 7 : 3));
  for (let b = 0; b < (fern ? 6 : 11); b++) {
    const x0 = 1 + Math.floor(r() * 14), lean = (r() - 0.5) * (fern ? 1.2 : 0.6), end = 5 + Math.floor(r() * 10);
    const n = top ? end : S;
    for (let i = 0; i < n; i++) {
      const k = top ? i + 16 : i, y = 15 - i, x = Math.round(x0 + lean * k * 0.25), g = 100 + Math.min(k, 26) * 4 + shade() * 18;
      if (x >= 0 && x < S) p.set(x, y, [g, g, g]);
      if (fern && i % 2 === 0 && i > 0) for (const s of [-1, 1]) { const xx = x + s; if (xx >= 0 && xx < S) p.set(xx, y + 1, [g - 20, g - 20, g - 20]); }
    }
  }
  return p;
}
/** The tall flowers: stems and leaves, with clusters of flowers (more on the top half); a stem only for the sunflower. */
function tallFlower(seed, top, flower, {leaf = '#3f7f2a', stem = false} = {}) {
  const p = pic(), r = rng(seed + (top ? 1 : 0)), L = hex(leaf);
  for (const x0 of stem ? [7] : [5, 8, 11]) for (let y = top ? 6 : 0; y < S; y++) p.set(x0 + (y % 5 === 0 ? 1 : 0), y, mul(L, 0.75));
  const leaves = !stem ? (top ? 14 : 30) : top ? 0 : 8;
  for (let k = 0; k < leaves; k++) {
    const x = !stem ? 2 + Math.floor(r() * 12) : 5 + Math.floor(r() * 6), y = (top ? 6 : 0) + Math.floor(r() * (top ? 10 : 16));
    p.set(x, y, mul(L, 0.85 + r() * 0.35));
  }
  if (flower) {
    const F = hex(flower);
    for (let k = 0; k < (top ? 9 : 3); k++) {
      const cx = 3 + Math.floor(r() * 10), cy = (top ? 1 : 2) + Math.floor(r() * (top ? 9 : 10));
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) if (r() < 0.85) p.set(cx + dx, cy + dy, mul(F, 0.8 + r() * 0.35));
    }
  }
  return p;
}
/** The sunflower's head: petals round a brown middle (front), or its green back with the petals' tips. */
function sunflowerHead(front) {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy), petal = 6 + Math.cos(Math.atan2(dy, dx) * 10) * 1.3;
    if (d > petal + 0.5) continue;
    if (front) p.set(x, y, d < 3.6 ? mul(hex('#5a3a1a'), 0.8 + hash(41, x, y) * 0.4) : mul(hex('#f2c21a'), 0.85 + d / 40));
    else p.set(x, y, d < 4.5 ? mul(hex('#5e8a2a'), 0.85 + hash(42, x, y) * 0.3) : hex('#e0b21a'));
  }
  return p;
}
BLOCK_ART.vine = () => vine();
for (let a = 0; a < 3; a++) BLOCK_ART[`cocoa_stage${a}`] = () => cocoaPod(a);
BLOCK_ART.tall_grass_bottom = () => tallGrass(151, false, false); BLOCK_ART.tall_grass_top = () => tallGrass(151, true, false);
BLOCK_ART.large_fern_bottom = () => tallGrass(153, false, true); BLOCK_ART.large_fern_top = () => tallGrass(153, true, true);
BLOCK_ART.sunflower_bottom = () => tallFlower(155, false, null, {leaf: '#4f8a2a', stem: true}); BLOCK_ART.sunflower_top = () => tallFlower(155, true, null, {leaf: '#4f8a2a', stem: true});
BLOCK_ART.sunflower_front = () => sunflowerHead(true); BLOCK_ART.sunflower_back = () => sunflowerHead(false);
BLOCK_ART.lilac_bottom = () => tallFlower(157, false, null); BLOCK_ART.lilac_top = () => tallFlower(157, true, '#b98bd0');
BLOCK_ART.rose_bush_bottom = () => tallFlower(159, false, '#c8202a'); BLOCK_ART.rose_bush_top = () => tallFlower(159, true, '#c8202a');
BLOCK_ART.peony_bottom = () => tallFlower(161, false, null); BLOCK_ART.peony_top = () => tallFlower(161, true, '#e8a6d8');
ITEM_ART.cocoa_beans = () => icon([{mask: mask().disc(6, 8, 3, 2.2).disc(10, 10.5, 3, 2.2), color: '#7a4a24', light: '#a86a3a', dark: '#4a2a12', outline: '#1e1006'}]);
ITEM_ART.cookie = () => { const p = icon([{mask: mask().disc(8, 8.5, 5.5, 5), color: '#d18a3a', light: '#f0b060', dark: '#94581e', outline: '#3a1e06', grain: true}]); for (const [x, y] of [[6, 6], [10, 7], [7, 10], [10, 11], [5, 9]]) p.set(x, y, hex('#4a2a12')); return p; };

// ---------- 0.8.71: the colours, the stone and wood families, more food and things ----------
const CONCRETE = {white: '#cfd5d6', orange: '#e06101', magenta: '#a9309f', light_blue: '#2489c7', yellow: '#f1af15', lime: '#5ea918', pink: '#d5658f', gray: '#36393d',
  light_gray: '#7d7d73', cyan: '#157788', purple: '#64209c', blue: '#2d2f8f', brown: '#603c20', green: '#495b24', red: '#8e2121', black: '#080a0f'};
const POWDER = {white: '#e2e4e4', orange: '#e3843a', magenta: '#c053b9', light_blue: '#4ab4d6', yellow: '#e9c637', lime: '#7dbd2a', pink: '#e59ab6', gray: '#4d5155',
  light_gray: '#9b9b94', cyan: '#25949d', purple: '#8438b2', blue: '#4649a6', brown: '#7e5536', green: '#61773c', red: '#a83633', black: '#191a1f'};
const TERRACOTTA = {white: '#d1b2a1', orange: '#a15325', magenta: '#95576c', light_blue: '#706c8a', yellow: '#ba8523', lime: '#677535', pink: '#a14e4e', gray: '#392a23',
  light_gray: '#876b62', cyan: '#575b5b', purple: '#764656', blue: '#4a3b5b', brown: '#4d3323', green: '#4c532a', red: '#8f3d2e', black: '#251610'};
const toHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const shadesOf = (h, n = 4, spread = 0.18) => Array.from({length: n}, (_, i) => { const c = mul(hex(h), 1 - spread + (2 * spread) * i / (n - 1)); return '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); });
/** A smooth face with a frame: lit on the top and left edges, shaded on the bottom and right (polished stone). */
function bordered(p, k = 0.18) {
  for (let i = 0; i < S; i++) { p.set(i, 0, mul(p.get(i, 0), 1 + k)); p.set(0, i, mul(p.get(0, i), 1 + k)); p.set(i, 15, mul(p.get(i, 15), 1 - k * 1.4)); p.set(15, i, mul(p.get(15, i), 1 - k * 1.4)); }
  return p;
}
/** Thin dark cracks running across a face. */
function cracked(p, seed, n = 3) {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    let x = Math.floor(r() * S), y = Math.floor(r() * S);
    for (let i = 0; i < 6 + Math.floor(r() * 6); i++) { p.set(x, y, mul(p.get(x, y), 0.45)); x += r() < 0.5 ? 1 : 0; y += r() < 0.6 ? 1 : -1; }
  }
  return p;
}
/** Bricks of a palette: rows of h, bricks of w (every other row shifted half a brick), mortar between. */
function brickWall(seed, pal, mortar, {w = 8, h = 4} = {}) {
  const p = mottled(seed, pal, {cells: 4, grain: 0.4}), m = hex(mortar);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / h), off = row % 2 ? w / 2 : 0;
    if (y % h === h - 1 || (x + off) % w === w - 1) p.set(x, y, m);
    else if (y % h === 0) p.set(x, y, mul(p.get(x, y), 1.1));
  }
  return p;
}
/** Square tiles of n pixels, each its own shade, with dark seams. */
function tiles(seed, pal, seam, n = 4) {
  const p = pic(), r = rng(seed), shade = {};
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = `${Math.floor(x / n)},${Math.floor(y / n)}`;
    shade[k] ??= hex(pal[Math.floor(r() * pal.length)]);
    p.set(x, y, x % n === n - 1 || y % n === n - 1 ? hex(seam) : mul(shade[k], (x % n === 0 || y % n === 0 ? 1.08 : 1) * (0.95 + hash(seed, x, y) * 0.08)));
  }
  return p;
}
/** Carved: a smooth face, a raised border and an inner ring (the chiseled kinds). */
function chiseled(seed, pal, {ring = true, cross = false} = {}) {
  const p = bordered(mottled(seed, pal, {cells: 4, grain: 0.25, smooth: 0.7}), 0.2), dark = mul(hex(pal[0]), 0.7), light = mul(hex(pal[pal.length - 1]), 1.12);
  for (let i = 2; i < 14; i++) { p.set(i, 2, dark); p.set(2, i, dark); p.set(i, 13, light); p.set(13, i, light); }
  if (ring) for (let i = 5; i < 11; i++) { p.set(i, 5, light); p.set(5, i, light); p.set(i, 10, dark); p.set(10, i, dark); }
  if (cross) for (let i = 3; i < 13; i++) { p.set(i, i, dark); p.set(15 - i, i, dark); }
  return p;
}
for (const [c] of COLORS) {
  const seed = nameSeed(c);
  BLOCK_ART[`${c}_concrete`] = () => mottled(seed + 1, shadesOf(CONCRETE[c], 4, 0.035), {cells: 4, grain: 0.15, smooth: 0.7});
  BLOCK_ART[`${c}_concrete_powder`] = () => specks(mottled(seed + 2, shadesOf(POWDER[c], 5, 0.09), {cells: 8, grain: 0.75, smooth: 0.3}), seed + 3, 10, shadesOf(POWDER[c], 2, 0.2), {size: 1});
  BLOCK_ART[`${c}_terracotta`] = () => mottled(seed + 4, shadesOf(TERRACOTTA[c], 4, 0.07), {cells: 4, grain: 0.3});
  // glazed: a pattern of its own, a quarter turned four times round the middle
  BLOCK_ART[`${c}_glazed_terracotta`] = () => {
    const r = rng(seed + 5), base = hex(CONCRETE[c]), pal = [base, mul(base, 0.7), mix(base, [255, 255, 255], 0.55), mix(hex(TERRACOTTA[c]), [255, 255, 255], 0.15)];
    const a = 1 + r() * 2, b = 1 + r() * 2, ph = r() * 6, kind = Math.floor(r() * 3), q = [];
    for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
      const d = Math.max(u, v), w = kind === 0 ? Math.sin(u * a + ph) + Math.cos(v * b) : kind === 1 ? Math.sin((u + v) * a * 0.6 + ph) * Math.cos((u - v) * b * 0.5) * 2 : Math.sin(Math.hypot(u - 7.5, v - 7.5) * a + ph) + (u === v ? 1 : 0);
      q[v * 8 + u] = d === 7 ? 1 : w > 1 ? 2 : w > 0.1 ? 0 : w > -0.8 ? 3 : 1;
    }
    const p = pic();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      // which quarter, and its own corner turned to the middle
      let u = x, v = y;
      if (x >= 8 && y < 8) [u, v] = [y, 15 - x]; else if (x >= 8 && y >= 8) [u, v] = [15 - x, 15 - y]; else if (x < 8 && y >= 8) [u, v] = [15 - y, x];
      p.set(x, y, mul(pal[q[v * 8 + u]], 0.95 + hash(seed, x, y) * 0.08));
    }
    return p;
  };
  // stained glass: the frame and a few glints almost solid, the pane between see-through, all in the colour
  const g = COLORS.find(x => x[0] === c)[2];
  BLOCK_ART[`${c}_stained_glass`] = () => {
    const p = pic(), col = hex(g), edge = mix(col, [255, 255, 255], 0.25), dim = mul(col, 0.75);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(col, 0.95 + hash(seed + 6, x, y) * 0.08), 110);
    for (let i = 0; i < S; i++) { p.set(i, 0, edge, 230); p.set(0, i, edge, 230); p.set(i, 15, dim, 230); p.set(15, i, dim, 230); }
    for (const [x, y] of [[3, 4], [4, 3], [5, 2], [10, 11], [11, 10], [12, 9]]) p.set(x, y, mix(col, [255, 255, 255], 0.6), 200);
    return p;
  };
  BLOCK_ART[`${c}_stained_glass_pane_top`] = () => { const p = pic(), col = hex(g); for (let y = 0; y < S; y++) { p.set(7, y, mix(col, [255, 255, 255], 0.25), 230); p.set(8, y, mul(col, 0.75), 230); } return p; };
  // dyes: a little heap of the colour
  ITEM_ART[`${c}_dye`] = () => { const col = hex(g), h = x => '#' + x.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); return icon([{mask: blob(8, 9, 4.4, seed + 7), color: g, light: h(mix(col, [255, 255, 255], 0.35)), dark: h(mul(col, 0.65)), outline: h(mul(col, 0.3)), grain: true}]); };
}
ITEM_ART.ink_sac = () => icon([{mask: blob(8, 9, 4.6, 3301), color: '#24222e', light: '#4a4658', dark: '#121118', outline: '#050508', grain: true}], {sparkle: [[6, 7]]});
// stripped wood: the planks' colour with the grain running along, the end with its rings to the edge
for (const [w, [, , plank, rings]] of Object.entries(WOOD_ART)) {
  const seed = nameSeed('stripped_' + w);
  BLOCK_ART[`stripped_${w}_log`] = () => { const p = pic(), n = tileNoise(seed, 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex(plank), (x % 3 === 0 ? 0.88 : 1) * (0.9 + n(x, y) * 0.14) * (0.96 + hash(seed, x, y >> 2) * 0.06))); return p; };
  BLOCK_ART[`stripped_${w}_log_top`] = () => logTop(seed + 1, rings[0], rings);
}
// the doors and trapdoors of jungle, acacia and dark oak
for (const [w, [c, win]] of Object.entries({jungle: ['#a07351', 'holes'], acacia: ['#b2643a', 'glass'], dark_oak: ['#4c3220', 'glass']})) {
  BLOCK_ART[`${w}_door_top`] = () => door(c, true, win); BLOCK_ART[`${w}_door_bottom`] = () => door(c, false, win);
  BLOCK_ART[`${w}_trapdoor`] = () => trapdoor(c, w !== 'dark_oak');
  ITEM_ART[`${w}_door`] = () => doorIcon(c, win === 'glass');
}
// stone
const SB = ['#6d6d6d', '#767676', '#7e7e7e', '#868686', '#8e8e8e'];
BLOCK_ART.mossy_stone_bricks = () => { const p = stoneBricks(153), n = tileNoise(154, 4), r = rng(155); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (n(x, y) > 0.58 || (n(x, y) > 0.45 && r() < 0.3)) p.set(x, y, mix(hex('#4f7a2e'), hex('#6a943a'), r())); return p; };
BLOCK_ART.cracked_stone_bricks = () => cracked(stoneBricks(153), 156, 4);
BLOCK_ART.chiseled_stone_bricks = () => chiseled(157, SB);
const polished = (seed, pal) => bordered(mottled(seed, pal, {cells: 4, grain: 0.18, smooth: 0.8}));
BLOCK_ART.polished_granite = () => polished(3101, ['#9a6552', '#a26b58', '#a8715e', '#ae7764']);
BLOCK_ART.polished_diorite = () => polished(3102, ['#c0c0c2', '#c8c8ca', '#d0d0d2', '#d8d8da']);
BLOCK_ART.polished_andesite = () => polished(3103, ['#7f8382', '#878b8a', '#8f9392', '#979b9a']);
const DS = ['#36363e', '#3e3e46', '#46464e', '#4e4e56'];
BLOCK_ART.polished_deepslate = () => polished(3111, DS);
BLOCK_ART.deepslate_bricks = () => brickWall(3112, DS, '#1e1e24');
BLOCK_ART.cracked_deepslate_bricks = () => cracked(brickWall(3112, DS, '#1e1e24'), 3113, 4);
BLOCK_ART.deepslate_tiles = () => tiles(3114, DS, '#1c1c22');
BLOCK_ART.cracked_deepslate_tiles = () => cracked(tiles(3114, DS, '#1c1c22'), 3115, 4);
BLOCK_ART.chiseled_deepslate = () => chiseled(3116, DS, {cross: true});
const TF = ['#5f6158', '#686a61', '#71736a', '#7a7c73'];
BLOCK_ART.polished_tuff = () => polished(3121, TF);
BLOCK_ART.tuff_bricks = () => brickWall(3122, TF, '#45473f', {w: 8, h: 8});
BLOCK_ART.chiseled_tuff = () => chiseled(3123, TF, {ring: false, cross: true});
BLOCK_ART.chiseled_tuff_top = () => polished(3124, TF);
BLOCK_ART.chiseled_tuff_bricks = () => { const p = brickWall(3125, TF, '#45473f', {w: 8, h: 8}); for (let i = 4; i < 12; i++) { p.set(i, 4, hex('#8a8c82')); p.set(i, 11, hex('#4a4c44')); } return p; };
BLOCK_ART.chiseled_tuff_bricks_top = () => chiseled(3126, TF);
const SAND = {sandstone: ['#cfbd84', '#d6c58c', '#dccd95', '#e3d6a1'], red_sandstone: ['#a8541c', '#b25b20', '#bc6427', '#c56d2e']};
for (const [n, pal] of Object.entries(SAND)) {
  BLOCK_ART[`cut_${n}`] = () => { const p = mottled(nameSeed('cut_' + n), pal, {cells: 4, grain: 0.25}); for (let x = 0; x < S; x++) { for (const y of [0, 8]) p.set(x, y, mul(hex(pal[3]), 1.05)); for (const y of [7, 15]) p.set(x, y, mul(hex(pal[0]), 0.85)); } return p; };
  BLOCK_ART[`chiseled_${n}`] = () => { const p = chiseled(nameSeed('chiseled_' + n), pal, {ring: true}); for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) p.set(x, y, mul(hex(pal[0]), 0.7)); return p; };
}
const QZ = ['#e4ded2', '#e8e2d6', '#ece6db', '#f0ebe1'];
BLOCK_ART.chiseled_quartz_block = () => { const p = bordered(mottled(3131, QZ, {cells: 4, grain: 0.1, smooth: 0.85}), 0.08); for (let y = 0; y < S; y++) for (const x of [3, 4, 11, 12]) p.set(x, y, mul(p.get(x, y), x === 3 || x === 11 ? 0.88 : 1.04)); return p; };
BLOCK_ART.chiseled_quartz_block_top = () => chiseled(3132, QZ);
BLOCK_ART.quartz_pillar = () => { const p = mottled(3133, QZ, {cells: 4, grain: 0.1, smooth: 0.85}); for (let y = 0; y < S; y++) for (const x of [0, 5, 10, 15]) p.set(x, y, mul(p.get(x, y), 0.9)); return p; };
BLOCK_ART.quartz_pillar_top = () => { const p = bordered(mottled(3134, QZ, {cells: 4, grain: 0.1}), 0.08); for (let i = 3; i < 13; i++) { p.set(i, 3, hex('#d4ccbd')); p.set(3, i, hex('#d4ccbd')); p.set(i, 12, hex('#d4ccbd')); p.set(12, i, hex('#d4ccbd')); } return p; };
BLOCK_ART.quartz_bricks = () => brickWall(3135, QZ, '#cfc6b6', {w: 8, h: 8});
const MUD = ['#8a6a4e', '#937255', '#9b7a5c', '#a38263'];
BLOCK_ART.packed_mud = () => specks(mottled(3141, MUD, {cells: 4, grain: 0.45}), 3142, 8, ['#7a5c42', '#b08e6c'], {size: 1});
BLOCK_ART.mud_bricks = () => brickWall(3143, ['#8d6d50', '#967557', '#9e7d5e'], '#6e5440', {w: 8, h: 4});
const NB = ['#3a1c22', '#421f26', '#4a232b', '#522730'], RNB = ['#4a0a0d', '#560c10', '#620e13', '#6e1016'];
BLOCK_ART.red_nether_bricks = () => brickWall(3151, RNB, '#2a0406', {w: 8, h: 4});
BLOCK_ART.cracked_nether_bricks = () => cracked(BLOCK_ART.nether_bricks(), 3152, 5);
BLOCK_ART.chiseled_nether_bricks = () => chiseled(3153, NB);
// the raw metals' blocks: heaped lumps of the raw metal
for (const [m, pal] of Object.entries({iron: ['#8e6f57', '#a6866b', '#bd9a7e', '#d8af93'], copper: ['#8a4f33', '#9a5a3b', '#b06a47', '#c27a54'], gold: ['#b88220', '#d19a26', '#dda62d', '#f0c140']}))
  BLOCK_ART[`raw_${m}_block`] = () => lumps(nameSeed('raw_' + m), pal, {count: 11, seam: toHex(mul(hex(pal[0]), 0.7)), edge: 0.22});
// the tulips: a cup of petals on a stem
for (const [t, head] of Object.entries({red: '#d8301e', orange: '#ec7a1a', white: '#eeeee6', pink: '#eea6c6'})) BLOCK_ART[`${t}_tulip`] = () => {
  const p = flower(head, '#4c8a2a', '#5fa437', {tall: 7}), col = hex(head);
  for (const [x, y] of [[6, 4], [8, 4], [6, 5], [7, 5], [8, 5], [7, 6]]) p.set(x, y, y === 4 ? mix(col, [255, 255, 255], 0.3) : mul(col, y === 6 ? 0.8 : 1));
  return p;
};
for (let i = 0; i < 4; i++) BLOCK_ART[`beetroots_stage${i}`] = () => rootCrop(i, '#5a8a2a', '#a8262c', 71);
// food and the rest
const bowlOf = soup => icon([{mask: mask().disc(8, 8.5, 6, 5).cut(mask().disc(8, 6, 6.5, 3.6)), ...HANDLE}, {mask: mask().disc(8, 7.2, 5.2, 1.7), color: soup, light: '#ffffff', dark: '#3a2010'}]);
ITEM_ART.mushroom_stew = () => bowlOf('#b5734a');
ITEM_ART.beetroot_soup = () => bowlOf('#a3222e');
ITEM_ART.golden_apple = () => icon([{mask: mask().disc(7, 9.5, 4.6, 4.3).disc(10, 9.5, 4, 4), color: '#f2c53a', light: '#fff2a0', dark: '#b5850f', outline: '#4a3404'}, {mask: mask().line(8.5, 5.5, 9.5, 2.5, 1.2), ...HANDLE}, {mask: mask().disc(11.5, 3.5, 1.8, 1.1), color: '#4c9a2a', light: '#7cc44a', dark: '#2e6a16'}], {sparkle: [[6, 7]]});
ITEM_ART.enchanted_golden_apple = ITEM_ART.golden_apple;
ITEM_ART.pumpkin_pie = () => icon([{mask: mask().disc(8, 9, 6.2, 4.2), color: '#c97f2a', light: '#e8a952', dark: '#8a5214', outline: '#3a2006'}, {mask: mask().disc(8, 8.4, 4.4, 2.6), color: '#e48a2a', light: '#f6b45a', dark: '#b05f12'}]);
ITEM_ART.beetroot = () => icon([{mask: mask().disc(8, 10, 4.2, 4.4).poly([[6, 12], [10, 12], [8, 15.5]]), color: '#a8262c', light: '#d84a52', dark: '#6a1218', outline: '#2e0608'}, {mask: mask().line(8, 6, 6, 1.5, 1.4).line(8, 6, 10.5, 2, 1.4), color: '#5a8a2a', light: '#86b84a', dark: '#355a16'}]);
ITEM_ART.beetroot_seeds = () => { const p = pic(); for (const [x, y] of [[4, 9], [7, 6], [10, 10], [6, 12], [11, 6], [8, 9]]) { p.set(x, y, hex('#8a5a3a')); p.set(x + 1, y, hex('#6a4026')); p.set(x, y + 1, hex('#5a3420')); } return p; };
ITEM_ART.egg = () => icon([{mask: mask().disc(8, 9, 4.2, 5.4), color: '#e8d6b4', light: '#fff6e2', dark: '#b8a07a', outline: '#4a3a20'}], {sparkle: [[6, 6]]});
ITEM_ART.milk_bucket = () => icon([{mask: mask().poly([[3, 5], [13, 5], [11.5, 14], [4.5, 14]]), color: '#bdbdbd', light: '#e8e8e8', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().poly([[4.5, 5], [11.5, 5], [11, 7], [5, 7]]), color: '#f6f6f2', light: '#ffffff', dark: '#d6d6d0'}, {mask: mask().curve([[3, 5], [8, -2], [13, 5]], 1), color: '#8a8a8a', dark: '#4a4a4a'}]);
ITEM_ART.experience_bottle = () => icon([{mask: mask().disc(8, 10.5, 4.2, 3.8).poly([[6.5, 3], [9.5, 3], [9.5, 7], [6.5, 7]]), color: '#9be35a', light: '#d8ff9e', dark: '#4f9a24', outline: '#1e3a0a'}, {mask: mask().poly([[6.5, 1.5], [9.5, 1.5], [9.5, 3], [6.5, 3]]), color: '#8a6438', dark: '#5c4021'}], {sparkle: [[6, 9], [9, 11]]});
// spawn eggs: the egg in a colour of the creature, speckled with its second colour
for (const [k, [a, b]] of Object.entries({pig: ['#f0a5a2', '#db635f'], cow: ['#443626', '#a1a1a1'], sheep: ['#e7e7e7', '#ffb5b5'], chicken: ['#a1a1a1', '#ff0000'], zombie: ['#00afaf', '#799c65'],
  skeleton: ['#c1c1c1', '#494949'], creeper: ['#0da70b', '#000000'], spider: ['#342d27', '#a80e0e'], zombified_piglin: ['#ea9393', '#4c7129'], ghast: ['#f9f9f9', '#bcbcbc'], blaze: ['#f6b201', '#fff87e'],
  villager: ['#563c33', '#bd8b72'], iron_golem: ['#dbcdc1', '#74a332'], magma_cube: ['#340000', '#fcfc00'], slime: ['#51a03e', '#7ebf6e']})) ITEM_ART[`${k}_spawn_egg`] = () => {
  const p = icon([{mask: mask().disc(8, 9, 4.6, 5.8), color: a, light: '#' + mix(hex(a), [255, 255, 255], 0.35).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), dark: '#' + mul(hex(a), 0.62).map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), outline: '#1a1a1a'}]), r = rng(nameSeed(k));
  for (let n = 0; n < 9; n++) { const x = 5 + Math.floor(r() * 7), y = 5 + Math.floor(r() * 8); if (p.alpha(x, y) && p.alpha(x + 1, y)) { p.set(x, y, hex(b)); if (r() < 0.6) p.set(x + 1, y, mul(hex(b), 0.85)); } }
  return p;
};
// the round shadow laid under mobs and things (render.js drawBlobs): black, thinning out to the edge
BLOCK_ART.entity_shadow = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8; if (d < 1) p.set(x, y, [0, 0, 0], Math.round(255 * (1 - d * d) ** 1.4)); } return p; };

// ---------- redstone ----------
// dust: drawn white (the world tints it by its power): a speckled blob in the middle, and lines out of it — line0 runs up
// and down the picture, line1 across it
const dust = (p, x, y, r) => p.set(x, y, mul([255, 255, 255], 0.74 + r() * 0.26));
BLOCK_ART.redstone_dust_dot = () => { const p = pic(), r = rng(7101); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 3.1 || (d < 4.5 && r() < 0.45)) dust(p, x, y, r); } return p; };
for (const [n, across] of [['redstone_dust_line0', false], ['redstone_dust_line1', true]]) BLOCK_ART[n] = () => {
  const p = pic(), r = rng(nameSeed(n));
  for (let a = 0; a < S; a++) for (let b = 5; b <= 10; b++) { if ((b === 5 || b === 10) && r() < 0.6) continue; const [x, y] = across ? [a, b] : [b, a]; dust(p, x, y, r); }
  return p;
};
// the torches: a stick with a red head (lit: bright, with a glow round it; off: dark)
const redTorch = lit => {
  const p = pic();
  for (let y = 8; y < 16; y++) { p.set(7, y, hex('#7b5a32')); p.set(8, y, hex('#5c4122')); }
  const [a, b, c, d] = lit ? ['#ffb3a3', '#ff5038', '#e8261a', '#b0130c'] : ['#8a3a30', '#6a261e', '#4e1812', '#3a100c'];
  p.set(7, 6, hex(a)); p.set(8, 6, hex(b)); p.set(7, 7, hex(c)); p.set(8, 7, hex(d));
  if (lit) for (const [x, y] of [[6, 6], [9, 6], [7, 5], [8, 5], [6, 7], [9, 7]]) p.set(x, y, hex('#ff4a2a'), 120);
  return p;
};
BLOCK_ART.redstone_torch = () => redTorch(true);
BLOCK_ART.redstone_torch_off = () => redTorch(false);
// the lever's handle (its base is cobblestone)
BLOCK_ART.lever = () => { const p = pic(); for (let y = 6; y < 16; y++) { p.set(7, y, hex(y < 8 ? '#5a4a3a' : '#8a6a44')); p.set(8, y, hex(y < 8 ? '#3e3226' : '#644a2c')); } return p; };
// repeaters and comparators: the stone slab's top with the wire along it (from the back, at the bottom of the picture,
// to the front at the top); the comparator's two back torches feed into it
const slabTop = seed => bordered(mottled(seed, ['#9a9a9a', '#a3a3a3', '#acacac', '#b5b5b5'], {cells: 4, grain: 0.15, smooth: 0.8}), 0.14);
function diodeTop(on, comparator) {
  const p = slabTop(comparator ? 7121 : 7111), [w0, w1] = on ? ['#ff4426', '#c8180a'] : ['#7a2216', '#561008'];
  const wire = (x, y) => { p.set(x, y, hex(w0)); p.set(x + 1, y, hex(w1)); };
  if (!comparator) for (let y = 2; y < 15; y++) wire(7, y);
  else {
    for (let y = 2; y < 9; y++) wire(7, y);
    for (let k = 0; k <= 4; k++) { wire(3 + k, 13 - k); wire(11 - k, 13 - k); }
  }
  // the sockets the torches stand in
  for (const [x, y] of comparator ? [[7, 3], [3, 12], [11, 12]] : [[7, 3], [7, 9]]) { p.set(x, y, hex('#5a5a5a')); p.set(x + 1, y, hex('#4a4a4a')); p.set(x, y + 1, hex('#4a4a4a')); p.set(x + 1, y + 1, hex('#3a3a3a')); }
  return p;
}
BLOCK_ART.repeater = () => diodeTop(false, false); BLOCK_ART.repeater_on = () => diodeTop(true, false);
BLOCK_ART.comparator = () => diodeTop(false, true); BLOCK_ART.comparator_on = () => diodeTop(true, true);
// lamps: amber glass in a dark frame, glowing when lit
const lamp = on => {
  const p = mottled(on ? 7131 : 7132, on ? ['#d8862c', '#eaa440', '#f6c45a', '#ffe08c'] : ['#5c3518', '#6a3e1d', '#784722', '#865227'], {cells: 4, grain: 0.3}), line = hex(on ? '#9a5414' : '#2e1a0a');
  for (let i = 0; i < S; i++) for (const j of [0, 5, 10, 15]) { p.set(i, j, line); p.set(j, i, line); }
  for (const x0 of [1, 6, 11]) for (const y0 of [1, 6, 11]) p.set(x0 + 1, y0 + 1, hex(on ? '#fff4c8' : '#9a6a3a'));
  return p;
};
BLOCK_ART.redstone_lamp = () => lamp(false); BLOCK_ART.redstone_lamp_on = () => lamp(true);
// pistons: the wooden face of the head (sticky: slime on it), the stone body with the head's wood along its top, the back,
// and the inside face shown when the head is out
const PISTON_WOOD = '#b8945f', PISTON_STONE = ['#626262', '#6c6c6c', '#767676', '#808080', '#8a8a8a'];
const pistonFace = sticky => {
  const p = framed(planks(7141, PISTON_WOOD), '#6e5432');
  if (sticky) for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) { const edge = x === 3 || y === 3 || x === 12 || y === 12; if (edge && (x === y || x + y === 15)) continue; p.set(x, y, hex(edge ? '#4f9a3a' : (x + y) % 5 === 0 ? '#9ae07e' : '#78c45c')); }
  return p;
};
BLOCK_ART.piston_top = () => pistonFace(false); BLOCK_ART.piston_top_sticky = () => pistonFace(true);
BLOCK_ART.piston_side = () => {
  const p = stones(7142, PISTON_STONE, {count: 9, seam: '#4a4a4a', edge: 0.2}), wood = planks(7143, PISTON_WOOD);
  for (let y = 0; y < 4; y++) for (let x = 0; x < S; x++) p.set(x, y, y === 3 ? mul(hex(PISTON_WOOD), 0.6) : wood.get(x, y));
  for (let y = 4; y < S; y++) { p.set(0, y, hex('#4a4a4a')); p.set(15, y, hex('#4a4a4a')); }
  for (let x = 0; x < S; x++) p.set(x, 15, hex('#4a4a4a'));
  return p;
};
BLOCK_ART.piston_bottom = () => { const p = framed(stones(7144, PISTON_STONE, {count: 9, seam: '#4a4a4a', edge: 0.2}), '#4a4a4a'); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex(x === 5 || y === 5 ? '#4e4e4e' : '#5c5c5c')); return p; };
BLOCK_ART.piston_inner = () => { const p = framed(mottled(7145, ['#4e4e4e', '#565656', '#5e5e5e'], {cells: 4, grain: 0.3}), '#3a3a3a'); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(x === 6 || y === 6 ? '#e2e2e2' : '#b4b4b4')); return p; };
// observers: a face that watches (two eyes and a mouth), the back with the dot it gives power from (red when on), the
// sides with a groove, the top with an arrow to the face
const OBS = ['#5a5a5a', '#636363', '#6c6c6c', '#757575'];
const obsBase = seed => bordered(mottled(seed, OBS, {cells: 4, grain: 0.22}), 0.2);
BLOCK_ART.observer_front = () => { const p = obsBase(7151); for (const [x0, y0, x1, y1] of [[3, 4, 6, 7], [9, 4, 12, 7], [4, 10, 11, 11]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, hex(y === y0 ? '#262626' : '#1a1a1a')); return p; };
for (const [n, on] of [['observer_back', false], ['observer_back_on', true]]) BLOCK_ART[n] = () => { const p = obsBase(7152); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, hex(on ? (x === 6 || y === 6 ? '#ff7a5a' : '#ff2a14') : (x === 6 || y === 6 ? '#3a1a16' : '#2a0e0a'))); return p; };
BLOCK_ART.observer_side = () => { const p = obsBase(7153); for (let x = 2; x < 14; x++) for (const y of [5, 10]) { p.set(x, y, hex('#3e3e3e')); p.set(x, y + 1, hex('#848484')); } return p; };
BLOCK_ART.observer_top = () => { const p = obsBase(7154); for (let y = 3; y < 13; y++) { p.set(7, y, hex('#2e2e2e')); p.set(8, y, hex('#3a3a3a')); } for (let k = 1; k <= 3; k++) { p.set(7 - k, 3 + k, hex('#2e2e2e')); p.set(8 + k, 3 + k, hex('#3a3a3a')); } return p; };
// dispensers and droppers: the furnace's stone with a mouth (a dispenser's round and wide, a dropper's a small square)
const mouth = (base, round, wide) => {
  const p = base;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 8, inside = round ? Math.hypot(dx, dy) < (wide ? 4.2 : 3.2) : Math.max(Math.abs(dx), Math.abs(dy)) < (wide ? 3.6 : 2.6);
    const rim = round ? Math.hypot(dx, dy) < (wide ? 5.2 : 4.2) : Math.max(Math.abs(dx), Math.abs(dy)) < (wide ? 4.6 : 3.6);
    if (inside) p.set(x, y, hex(dy < 0 ? '#141414' : '#242424')); else if (rim) p.set(x, y, mul(p.get(x, y), dy < 0 ? 0.72 : 1.18));
  }
  return p;
};
BLOCK_ART.dispenser_front = () => mouth(furnace('side'), true, false); BLOCK_ART.dispenser_front_vertical = () => mouth(furnace('top'), true, true);
BLOCK_ART.dropper_front = () => mouth(furnace('side'), false, false); BLOCK_ART.dropper_front_vertical = () => mouth(furnace('top'), false, true);
// the hopper: dark iron outside, darker inside, and its top: the rim round a grate
const HOP = ['#3c3c3c', '#444444', '#4c4c4c', '#545454'];
BLOCK_ART.hopper_outside = () => bordered(mottled(7161, HOP, {cells: 4, grain: 0.3}), 0.22);
BLOCK_ART.hopper_inside = () => mottled(7162, ['#222222', '#282828', '#2e2e2e'], {cells: 4, grain: 0.3});
BLOCK_ART.hopper_top = () => { const p = BLOCK_ART.hopper_outside(); for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) p.set(x, y, hex((x - 2) % 4 === 3 || (y - 2) % 4 === 3 ? '#5a5a5a' : '#1e1e1e')); return p; };
// the note block: dark wood in a frame; the daylight detector: glass cells in a wooden frame (the inverted one's darker,
// like the night), its sides a wooden slab's
BLOCK_ART.note_block = () => { const p = framed(planks(7171, '#6b4128'), '#3e2414'); for (let y = 2; y < 14; y++) for (const x of [2, 13]) p.set(x, y, hex('#4e2e1a')); return p; };
for (const [n, cells] of [['daylight_detector_top', ['#c9e2ee', '#a6c8da', '#7fa3b8']], ['daylight_detector_inverted_top', ['#5a6ea6', '#45568a', '#33416e']]]) BLOCK_ART[n] = () => {
  const p = framed(planks(7181, PISTON_WOOD), '#6e5432');
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) { const gx = (x - 1) % 5, gy = (y - 1) % 5; p.set(x, y, hex(gx === 4 || gy === 4 ? '#6e5432' : gx === 0 || gy === 0 ? cells[0] : (gx + gy) % 3 === 0 ? cells[1] : cells[2])); }
  return p;
};
BLOCK_ART.daylight_detector_side = () => { const p = planks(7182, PISTON_WOOD); for (let x = 0; x < S; x++) { p.set(x, 10, mul(hex(PISTON_WOOD), 1.12)); p.set(x, 15, mul(hex(PISTON_WOOD), 0.62)); } return p; };
// iron doors and trapdoors: plain iron, a frame, rivets, two windows in the door's upper half
function ironDoor(top) {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const frame = x < 2 || x > 13 || (top ? y < 2 : y > 13) || (!top && (y === 8 || y === 9));
    p.set(x, y, mul(hex('#cfcfcf'), (frame ? 0.82 : 1) * (0.95 + hash(7191, x, y) * 0.08)));
  }
  for (let y = 0; y < S; y++) { p.set(0, y, hex('#7a7a7a')); p.set(15, y, hex('#8a8a8a')); }
  if (top) for (const x0 of [3, 9]) for (let y = 3; y < 7; y++) for (let x = x0; x < x0 + 4; x++) p.set(x, y, [0, 0, 0], 0);
  for (const [x, y] of top ? [[2, 9], [13, 9], [2, 13], [13, 13]] : [[2, 2], [13, 2], [2, 12], [13, 12]]) p.set(x, y, hex('#f2f2f2'));
  if (!top) { p.set(12, 4, hex('#4a4a4a')); p.set(12, 5, hex('#6a6a6a')); }
  return p;
}
BLOCK_ART.iron_door_top = () => ironDoor(true); BLOCK_ART.iron_door_bottom = () => ironDoor(false);
BLOCK_ART.iron_trapdoor = () => trapdoor('#c8c8c8', true);
// the target: a bale of hay with red and white rings
const target = seed => { const p = mottled(seed, ['#d6cc9a', '#ded5a4', '#e6deae', '#eee7b9'], {cells: 4, grain: 0.3}); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d < 1.8 || (d >= 3.2 && d < 4.6) || (d >= 6 && d < 7.3)) p.set(x, y, mul(hex('#cc3428'), 0.92 + hash(seed, x, y) * 0.12)); } return p; };
BLOCK_ART.target_side = () => target(7201); BLOCK_ART.target_top = () => target(7202);
// the slime block: clear green, a cube inside it
BLOCK_ART.slime_block = () => {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = x === 0 || y === 0 || x === 15 || y === 15, inner = x >= 3 && x <= 12 && y >= 3 && y <= 12, innerEdge = inner && (x === 3 || y === 3 || x === 12 || y === 12);
    p.set(x, y, mul(hex(edge ? '#4f9a3a' : innerEdge ? '#62b44a' : inner ? '#86d66a' : '#7ccd60'), 0.94 + hash(7211, x, y) * 0.1), edge ? 235 : innerEdge ? 220 : inner ? 200 : 160);
  }
  return p;
};
// rails: sleepers across, two rails along (gold on powered rails; a red strip between the rails of the powered and the
// activator rail, a plate on the detector rail — bright when on); the corner piece bends from the bottom edge to the right
function rail(kind, on) {
  const p = pic(), sleeper = kind === 'activator' ? '#6a5446' : '#6e5232', rl = kind === 'powered' ? ['#f0d050', '#a8861a'] : ['#c4c4c4', '#6e6e6e'];
  for (const y0 of [1, 5, 9, 13]) for (let y = y0; y < y0 + 2; y++) for (let x = 1; x < 15; x++) p.set(x, y, mul(hex(sleeper), y === y0 ? 1.06 : 0.84));
  for (let y = 0; y < S; y++) for (const [x, c] of [[2, 0], [3, 1], [12, 0], [13, 1]]) p.set(x, y, hex(rl[c]));
  const red = on ? ['#ff4426', '#c8180a'] : ['#6a1a12', '#4a0e08'];
  if (kind === 'powered' || kind === 'activator') for (let y = 0; y < S; y++) { p.set(7, y, hex(red[0])); p.set(8, y, hex(red[1])); }
  if (kind === 'detector') { for (let y = 6; y < 10; y++) for (let x = 5; x < 11; x++) p.set(x, y, hex(y === 6 ? '#9a9a9a' : '#7e7e7e')); for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) p.set(x, y, hex(red[(x + y) % 2])); }
  return p;
}
BLOCK_ART.rail = () => rail('rail', false);
for (const k of ['powered', 'detector', 'activator']) { BLOCK_ART[`${k}_rail`] = () => rail(k, false); BLOCK_ART[`${k}_rail_on`] = () => rail(k, true); }
BLOCK_ART.rail_corner = () => {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = 16 - (x + 0.5), dy = 16 - (y + 0.5), d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    // sleepers: short bars along the radius, a quarter turn split in four
    if (d > 1.6 && d < 15.2 && [0.2, 0.59, 0.98, 1.37].some(k => Math.abs(a - k) * d < 1.05)) p.set(x, y, mul(hex('#6e5232'), d % 4 < 2 ? 1.04 : 0.88));
    // the two rails: arcs round the corner
    for (const r0 of [2.8, 12.8]) { if (d >= r0 && d < r0 + 1) p.set(x, y, hex('#c4c4c4')); else if (d >= r0 + 1 && d < r0 + 1.9) p.set(x, y, hex('#6e6e6e')); }
  }
  return p;
};

// a minecart's iron: plates with a lighter rim and rivets outside, darker inside
BLOCK_ART.minecart_side = () => { const p = bordered(mottled(7221, ['#5a5e62', '#63676b', '#6c7074', '#757a7e'], {cells: 4, grain: 0.25}), 0.25); for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [7, 2], [8, 13]]) p.set(x, y, hex('#a8acb0')); for (let x = 1; x < 15; x++) p.set(x, 8, hex('#4a4e52')); return p; };
BLOCK_ART.minecart_inside = () => mottled(7222, ['#3a3d40', '#414447', '#484b4e'], {cells: 4, grain: 0.3});
// redstone things in the hand: the slab with its torches, the hopper's funnel, the iron door, slime balls, minecarts
// (and what each carries)
const slabIcon = () => mask().poly([[1, 9.5], [8.5, 5.5], [15, 8.5], [7.5, 12.8]]);
const diodeIcon = torches => { const p = icon([{mask: slabIcon(), color: '#a8a8a8', light: '#d0d0d0', dark: '#6e6e6e', outline: '#2e2e2e'}]); for (const [x, y] of torches) { for (let k = 0; k < 3; k++) p.set(x, y + k, hex(k ? '#7b5a32' : '#ff3a1e')); p.set(x, y - 1, hex('#ffb3a3')); } return p; };
ITEM_ART.repeater_item = () => diodeIcon([[5, 6], [10, 4]]);
ITEM_ART.comparator_item = () => diodeIcon([[4, 6], [8, 3], [11, 6]]);
ITEM_ART.hopper = () => icon([{mask: mask().poly([[1.5, 2], [14.5, 2], [14.5, 7], [10.5, 10.5], [10.5, 14.5], [5.5, 14.5], [5.5, 10.5], [1.5, 7]]), color: '#4c4c4c', light: '#6e6e6e', dark: '#2e2e2e', outline: '#141414'},
  {mask: mask().poly([[3.5, 3], [12.5, 3], [12.5, 5], [3.5, 5]]), color: '#1e1e1e', outline: '#141414'}]);
ITEM_ART.iron_door = () => icon([{mask: mask().poly([[4, 1], [12, 1], [12, 15], [4, 15]]), color: '#cfcfcf', light: '#f0f0f0', dark: '#8a8a8a', outline: '#3a3a3a', grain: true},
  {mask: mask().poly([[5.5, 2.5], [7.5, 2.5], [7.5, 6], [5.5, 6]]).poly([[8.5, 2.5], [10.5, 2.5], [10.5, 6], [8.5, 6]]), color: '#bfe3ee', dark: '#8ab4c4'}]);
ITEM_ART.slime_ball = () => icon([{mask: mask().disc(8, 8.5, 4.8, 4.4), color: '#7ccd60', light: '#b4f09a', dark: '#4f9a3a', outline: '#24461a'}], {sparkle: [[6, 6]]});
const cartIcon = load => {
  const layers = [];
  if (load) layers.push(load);
  layers.push({mask: mask().poly([[1.5, 6.5], [14.5, 6.5], [13, 12], [3, 12]]), color: '#8c8c8c', light: '#b8b8b8', dark: '#585858', outline: '#262626'});
  layers.push({mask: mask().disc(5, 12.6, 1.7).disc(11, 12.6, 1.7), color: '#3a3a3a', light: '#5a5a5a', outline: '#141414'});
  return icon(layers);
};
const cartLoad = (color, light, dark, outline = '#1e1e1e') => ({mask: mask().poly([[3.5, 1.5], [12.5, 1.5], [12.5, 7], [3.5, 7]]), color, light, dark, outline});
ITEM_ART.minecart = () => cartIcon(null);
ITEM_ART.chest_minecart = () => cartIcon(cartLoad('#a87a3a', '#c89a52', '#6e4a1e', '#2e2010'));
ITEM_ART.furnace_minecart = () => cartIcon(cartLoad('#7a7a7a', '#9a9a9a', '#4a4a4a'));
ITEM_ART.tnt_minecart = () => cartIcon(cartLoad('#d8301e', '#ff6a4a', '#8a1a10', '#3a0a06'));
ITEM_ART.hopper_minecart = () => cartIcon({mask: mask().poly([[3, 1.5], [13, 1.5], [11, 7], [5, 7]]), color: '#4c4c4c', light: '#6e6e6e', dark: '#2e2e2e', outline: '#141414'});

// ---------- cherry, mangrove, bamboo ----------
const shadeOf = (h, k) => toHex(mul(hex(h), k));
/** A grey picture's light and dark turned into a colour's (leaves that are not tinted: the cherry's pink). */
const colorize = (p, dark, light) => { const a = hex(dark), b = hex(light); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const [g, , , al] = p.get(x, y); if (al) p.set(x, y, mix(a, b, clamp((g - 50) / 170, 0, 1)), al); } return p; };
// bark, its dark streaks, planks, the rings of the cut end, stripped wood
const MORE_WOOD = {cherry: ['#3e2830', '#2a1a22', '#e2b2aa', ['#e0a7a0', '#cb918b', '#ad7671'], '#d29891'], mangrove: ['#5a4632', '#3d3022', '#773634', ['#7d3b36', '#69302c', '#532420'], '#7a3832']};
for (const [w, [bark, dark, plank, rings, stripped]] of Object.entries(MORE_WOOD)) {
  const s = nameSeed(w);
  BLOCK_ART[`${w}_log`] = () => {
    const p = log(s, bark, dark, null);
    // the cherry's bark has light rings across it
    if (w === 'cherry') { const r = rng(s + 9); for (let k = 0; k < 7; k++) { const x = Math.floor(r() * 13), y = Math.floor(r() * S), l = 2 + Math.floor(r() * 3); for (let i = 0; i < l; i++) p.set(x + i, y, hex('#6a4652')); } }
    return p;
  };
  BLOCK_ART[`${w}_log_top`] = () => logTop(s, bark, rings);
  BLOCK_ART[`${w}_planks`] = () => planks(s + 1, plank);
  BLOCK_ART[`stripped_${w}_log`] = () => { const p = pic(), n = tileNoise(s + 2, 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex(stripped), (x % 3 === 0 ? 0.88 : 1) * (0.9 + n(x, y) * 0.14) * (0.96 + hash(s + 2, x, y >> 2) * 0.06))); return p; };
  BLOCK_ART[`stripped_${w}_log_top`] = () => logTop(s + 3, stripped, rings);
  BLOCK_ART[`${w}_door_top`] = () => door(plank, true, w === 'cherry' ? 'glass' : 'holes'); BLOCK_ART[`${w}_door_bottom`] = () => door(plank, false, w === 'cherry' ? 'glass' : 'holes');
  BLOCK_ART[`${w}_trapdoor`] = () => trapdoor(plank, true);
  ITEM_ART[`${w}_door`] = () => doorIcon(plank, w === 'cherry');
}
// cherry leaves: pink, a few white blossoms; mangrove leaves grey (tinted green), thick
BLOCK_ART.cherry_leaves = () => { const p = colorize(leaves(nameSeed('cherry') + 4, {holes: 0.12, lo: 70, hi: 205}), '#c96f98', '#fcd6e8'), r = rng(901); for (let k = 0; k < 12; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); if (p.alpha(x, y)) p.set(x, y, hex('#fff2f8')); } return p; };
BLOCK_ART.mangrove_leaves = () => leaves(nameSeed('mangrove') + 4, {holes: 0.07, lo: 60, hi: 180, cells: 8});
BLOCK_ART.cherry_sapling = () => {
  const p = pic(), r = rng(902);
  for (let y = 8; y < 16; y++) p.set(7 + (y > 12 ? 0 : 1), y, hex('#4a2e36'));
  for (let k = 0; k < 30; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 4.4, x = Math.round(7.5 + Math.cos(a) * d), y = Math.round(5.5 + Math.sin(a) * d * 0.85); p.set(x, y, hex(r() < 0.25 ? '#fff0f6' : r() < 0.5 ? '#f3a6c8' : '#e486b0')); }
  return p;
};
// the propagule: planted, a long seedling with two leaves on top; hanging under the leaves, the pod on its stalk
BLOCK_ART.mangrove_propagule = () => {
  const p = pic();
  for (let y = 5; y < 16; y++) p.set(8, y, hex(y > 12 ? '#6a5a2a' : y > 9 ? '#7a8a2e' : '#8aa83a'));
  for (const [x0, dir] of [[7, -1], [9, 1]]) for (let i = 0; i < 4; i++) { p.set(x0 + dir * i, 4 - (i > 1 ? 1 : 0), hex(i === 3 ? '#4f8a22' : '#6aa82e')); p.set(x0 + dir * i, 5 - (i > 2 ? 1 : 0), hex('#3f7a1a')); }
  return p;
};
BLOCK_ART.mangrove_propagule_hanging = () => {
  const p = pic();
  for (let y = 0; y < 4; y++) p.set(8, y, hex('#5a7a2a'));
  for (const [x, y] of [[6, 1], [7, 2], [9, 2], [10, 1]]) p.set(x, y, hex('#5f9a2a'));
  for (let y = 4; y < 14; y++) { const w = y < 6 ? 1 : y < 11 ? 2 : 1; for (let x = 8 - (w - 1); x <= 8 + (w > 1 ? 1 : 0); x++) p.set(x, y, hex(y > 11 ? '#7a6a2a' : x === 8 ? '#9ab84a' : '#7a9a32')); }
  p.set(8, 14, hex('#5a4a1e'));
  return p;
};
ITEM_ART.mangrove_propagule_item = () => icon([{mask: mask().line(4, 13, 11, 4, 2.2), color: '#8aa83a', light: '#b4cf5a', dark: '#5a7a22', outline: '#24340c'},
  {mask: mask().line(11, 4, 13.5, 1.5, 1.2).line(11, 4, 14, 4.5, 1.2), color: '#4f9a2a', light: '#7cc44a', dark: '#2e6216', outline: '#103008'}, {mask: mask().disc(4, 13, 1.3), color: '#6a5a2a', dark: '#3a2e12', outline: '#1e1808'}]);
// mangrove roots: brown strands crossing, open between; in mud the gaps are mud
const rootStrands = (p, seed, cols) => {
  const r = rng(seed), m = mask();
  for (let k = 0; k < 6; k++) { const x0 = r() * 16, x1 = x0 + (r() - 0.5) * 14; m.curve([[x0, -1], [(x0 + x1) / 2 + (r() - 0.5) * 6, 8], [x1, 17]], 1.6 + r() * 0.8); }
  for (let k = 0; k < 3; k++) { const y0 = r() * 16; m.line(-1, y0, 17, y0 + (r() - 0.5) * 10, 1.3); }
  const n = tileNoise(seed + 1, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.m[y * S + x]) p.set(x, y, hex(cols[clamp(Math.floor(n(x, y) * cols.length + (hash(seed, x, y) - 0.5) * 1.2), 0, cols.length - 1)]));
  return p;
};
const ROOT = ['#3e3024', '#4c3b2b', '#5a4734', '#69553e'], WET_MUD = ['#36302f', '#3d3635', '#453d3b'];
BLOCK_ART.mangrove_roots_side = () => rootStrands(pic(), 911, ROOT);
BLOCK_ART.mangrove_roots_top = () => rootStrands(pic(), 912, ROOT);
BLOCK_ART.muddy_mangrove_roots_side = () => rootStrands(mottled(913, WET_MUD, {cells: 4, grain: 0.4}), 914, ROOT);
BLOCK_ART.muddy_mangrove_roots_top = () => rootStrands(mottled(915, WET_MUD, {cells: 4, grain: 0.4}), 916, ROOT);
// bamboo: the stalk's picture laid out as the game's (the thin stalk's sides in columns 0–1, the thick one's in 3–5, the
// cut end at 13–15 at the top, the bottom end below it), its leaves (small, large: crossed through the stalk), the shoot
const BAMBOO = ['#86b23e', '#6c9a2c', '#557f20'];
BLOCK_ART.bamboo_stalk = () => {
  const p = pic();
  for (let y = 0; y < S; y++) {
    const node = y === 5 || y === 13, ring = y === 4 || y === 12;
    for (const [x, k] of [[0, 0], [1, 2], [3, 0], [4, 1], [5, 2]]) p.set(x, y, node ? hex('#3f6416') : ring ? mix(hex(BAMBOO[k]), [230, 240, 180], 0.35) : hex(BAMBOO[k]));
  }
  for (const y0 of [0, 4]) for (let y = y0; y < y0 + 3; y++) for (let x = 13; x < 16; x++) p.set(x, y, x === 14 && y === y0 + 1 ? hex('#c8d890') : hex(BAMBOO[1]));
  return p;
};
const bambooLeaves = (list, seed) => {
  const m = mask();
  for (const [x0, y0, x1, y1, w] of list) m.line(x0, y0, x1, y1, w);
  const p = pic(), n = tileNoise(seed, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.m[y * S + x]) p.set(x, y, mul(hex('#5e9c2a'), 0.78 + n(x, y) * 0.4));
  return p;
};
BLOCK_ART.bamboo_small_leaves = () => bambooLeaves([[8, 4, 13, 7, 1.6], [8, 6, 3, 9, 1.6], [8, 2, 11, 1, 1.3]], 921);
BLOCK_ART.bamboo_large_leaves = () => bambooLeaves([[8, 2, 15, 6, 2], [8, 4, 1, 8, 2], [8, 7, 14.5, 12, 2], [8, 9, 2, 14, 2], [8, 1, 3, 0.5, 1.5], [8, 5, 12, 2, 1.5]], 922);
BLOCK_ART.bamboo_stage0 = () => { const p = pic(); for (let y = 10; y < 16; y++) for (let x = 7; x < 9; x++) p.set(x, y, hex(x === 7 ? BAMBOO[0] : BAMBOO[2])); for (const [x, y] of [[6, 10], [5, 9], [9, 11], [10, 10], [11, 9], [8, 9], [8, 8]]) p.set(x, y, hex('#5e9c2a')); return p; };
ITEM_ART.bamboo = () => icon([{mask: mask().line(3.5, 13.5, 11.5, 2.5, 2.4), color: '#6c9a2c', light: '#9ccc4c', dark: '#3f6416', outline: '#1e300a'}, {mask: mask().line(9.5, 5, 13.5, 6.5, 1.3).line(6.5, 9.5, 3, 9, 1.3), color: '#5e9c2a', dark: '#2e6216', outline: '#103008'}]);
// the bamboo blocks: stalks bound side by side (green; stripped yellow), their cut ends on top; planks of split bamboo,
// and the mosaic of short pieces this way and that
const stalks = (cols, seed) => { const p = pic(), r = rng(seed); for (let x0 = 0; x0 < S; x0 += 4) { const node = Math.floor(r() * 16); for (let y = 0; y < S; y++) for (let k = 0; k < 4; k++) p.set(x0 + k, y, (y === node || y === (node + 8) % 16) && k > 0 ? mul(hex(cols[1]), 0.72) : hex(cols[k === 0 ? 2 : k === 1 ? 0 : 1])); } return p; };
const stalkEnds = (cols, inner) => { const p = pic().fill(hex(cols[2])); for (const [cx, cy] of [[4, 4], [12, 4], [4, 12], [12, 12]]) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d < 3.6) p.set(x, y, hex(d < 2 ? inner : cols[d < 2.9 ? 0 : 1])); } return p; };
const BAMBOO_GREEN = ['#7fa83a', '#6a922c', '#4f7420'], BAMBOO_YELLOW = ['#d8c262', '#c4ad4c', '#a08a36'];
BLOCK_ART.bamboo_block = () => stalks(BAMBOO_GREEN, 931);
BLOCK_ART.bamboo_block_top = () => stalkEnds(BAMBOO_GREEN, '#c8b874');
BLOCK_ART.stripped_bamboo_block = () => stalks(BAMBOO_YELLOW, 932);
BLOCK_ART.stripped_bamboo_block_top = () => stalkEnds(BAMBOO_YELLOW, '#e8dca0');
const BAMBOO_PLANK = '#c8ae4e';
BLOCK_ART.bamboo_planks = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, mul(hex(BAMBOO_PLANK), (x % 4 === 3 ? 0.74 : x % 4 === 0 ? 1.08 : 1) * (0.95 + hash(941, x, y >> 1) * 0.08) * ((y + (x >> 2) * 5) % 8 === 0 ? 0.86 : 1))); return p; };
BLOCK_ART.bamboo_mosaic = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const flat = ((x >> 3) + (y >> 3)) % 2 === 0, a = flat ? y % 4 : x % 4; p.set(x, y, mul(hex(BAMBOO_PLANK), (a === 3 ? 0.72 : a === 0 ? 1.1 : 1) * (0.95 + hash(942, x >> 1, y >> 1) * 0.08) * ((flat ? x : y) % 8 === 0 ? 0.8 : 1))); } return p; };
BLOCK_ART.bamboo_door_top = () => door(BAMBOO_PLANK, true, 'holes'); BLOCK_ART.bamboo_door_bottom = () => door(BAMBOO_PLANK, false, 'holes');
BLOCK_ART.bamboo_trapdoor = () => trapdoor(BAMBOO_PLANK, true);
ITEM_ART.bamboo_door = () => doorIcon(BAMBOO_PLANK, false);
// pink petals: little four-petalled flowers in each quarter (a quarter is drawn for each flower put down)
BLOCK_ART.pink_petals = () => {
  // two flowers a quarter, five petals round a pale middle (each kept inside its quarter), a green leaf or two between
  const p = pic(), r = rng(951), PINK = ['#f8bad5', '#f09cc2', '#df82ae'];
  const flower = (cx, cy, turn) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 2.3 || (Math.abs(dx) === 2 && Math.abs(dy) === 2)) continue;
      const petal = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 5 + turn) % 5);
      p.set(cx + dx, cy + dy, hex(d < 0.6 ? '#f7e3a0' : d > 1.9 ? PINK[2] : PINK[petal % 2]));
    }
  };
  for (const [qx, qy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
    flower(qx + 2 + Math.floor(r() * 2), qy + 2 + Math.floor(r() * 2), r() * 5);
    flower(qx + 5, qy + 5, r() * 5);
    for (let k = 0; k < 2; k++) { const x = qx + 1 + Math.floor(r() * 6), y = qy + 1 + Math.floor(r() * 6); if (!p.alpha(x, y)) { p.set(x, y, hex('#5f9a35')); if (!p.alpha(x + 1, y)) p.set(x + 1, y, hex('#4a7f28')); } }
  }
  return p;
};
ITEM_ART.pink_petals_item = () => {
  const p = icon([{mask: mask().line(8, 15, 8, 8, 1.1).line(8, 11, 4.5, 8, 1).line(8, 10, 11.5, 7, 1), color: '#5a8a2a', dark: '#2e5216', outline: '#102008'}]);
  for (const [cx, cy] of [[8, 6], [4, 6], [12, 5]]) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(cx + dx, cy + dy, hex('#f09ac0')); p.set(cx, cy, hex('#f2d27a')); }
  return p;
};
// boats: the hull from the side in its wood, the inside darker, an oar behind it (a chest in a chest boat); the raft flat
const BOAT_PLANK = {oak: '#b8945f', spruce: '#7a5a34', birch: '#c5b77b', jungle: '#a07351', acacia: '#a95a31', dark_oak: '#4c3220', mangrove: '#773634', cherry: '#e2b2aa', bamboo: BAMBOO_PLANK};
const boatIcon = (w, chest) => {
  const c = BOAT_PLANK[w], wood = {color: c, light: shadeOf(c, 1.22), dark: shadeOf(c, 0.66), outline: shadeOf(c, 0.3), grain: true}, layers = [];
  layers.push({mask: mask().line(2.5, 2.5, 13, 12.5, 1.3).disc(12.6, 12.2, 1.4), ...HANDLE});
  if (w === 'bamboo') layers.push({mask: mask().poly([[1, 9.5], [15, 9.5], [14.5, 12.5], [1.5, 12.5]]), ...wood});
  else {
    layers.push({mask: mask().poly([[1, 7.5], [15, 7.5], [12.5, 12.5], [3.5, 12.5]]), ...wood});
    layers.push({mask: mask().poly([[2.5, 8], [13.5, 8], [13, 9.5], [3, 9.5]]), color: shadeOf(c, 0.55), dark: shadeOf(c, 0.45), light: shadeOf(c, 0.6)});
  }
  if (chest) layers.push({mask: mask().poly([[8.5, w === 'bamboo' ? 5 : 3.5], [13.5, w === 'bamboo' ? 5 : 3.5], [13.5, w === 'bamboo' ? 9.5 : 8], [8.5, w === 'bamboo' ? 9.5 : 8]]), color: '#a87a3a', light: '#c89a52', dark: '#6e4a1e', outline: '#2e2010'});
  return icon(layers);
};
for (const w of Object.keys(BOAT_PLANK)) for (const chest of [false, true]) ITEM_ART[w === 'bamboo' ? (chest ? 'bamboo_chest_raft' : 'bamboo_raft') : `${w}_${chest ? 'chest_boat' : 'boat'}`] = () => boatIcon(w, chest);

// ---------- the sea ----------
// kelp: the top a crown of leaves, the stem a green-brown stalk with a leaf to each side; seagrass thin blades
const KELP = ['#5a8a24', '#6a9a2c', '#7aaa36', '#4a7420'];
const strands = (list, cols, seed) => {
  const m = mask(); for (const [pts, w] of list) m.curve(pts, w);
  const p = pic(), n = tileNoise(seed, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.m[y * S + x]) p.set(x, y, hex(cols[clamp(Math.floor(n(x, y) * cols.length + (hash(seed, x, y) - 0.5)), 0, cols.length - 1)]));
  return p;
};
BLOCK_ART.kelp = () => strands([[[[8, 16], [7, 9], [9, 2]], 2.2], [[[8, 12], [4, 9], [2, 4]], 1.6], [[[8, 11], [12, 8], [13, 3]], 1.6], [[[8, 7], [6, 4], [6, 0]], 1.3]], KELP, 1001);
BLOCK_ART.kelp_plant = () => strands([[[[8, 16], [6, 8], [8, 0]], 2.4], [[[7, 12], [3, 10], [1, 6]], 1.5], [[[7, 5], [12, 3], [14, 0]], 1.5]], KELP, 1002);
ITEM_ART.kelp_item = () => icon([{mask: mask().curve([[4, 14], [5, 7], [10, 2]], 2).curve([[5, 9], [9, 9], [12, 6]], 1.4), color: '#5d8a26', light: '#86b444', dark: '#3f6418', outline: '#1a2a08'}]);
ITEM_ART.dried_kelp = () => icon([{mask: mask().curve([[3, 13], [6, 6], [12, 3]], 2.4).curve([[6, 10], [10, 10], [13, 7]], 1.6), color: '#3a4a26', light: '#56683a', dark: '#222c16', outline: '#0e1408'}]);
BLOCK_ART.dried_kelp_side = () => { const p = mottled(1003, ['#2c3a1c', '#334322', '#3a4a26'], {cells: 4, grain: 0.3}); for (const y of [3, 12]) for (let x = 0; x < S; x++) p.set(x, y, hex('#5a5a3a')); return p; };
BLOCK_ART.dried_kelp_top = () => { const p = mottled(1004, ['#2c3a1c', '#334322', '#3a4a26'], {cells: 4, grain: 0.3}); for (let i = 0; i < S; i++) for (const k of [3, 12]) { p.set(k, i, hex('#5a5a3a')); p.set(i, k, hex('#5a5a3a')); } return p; };
BLOCK_ART.dried_kelp_bottom = () => mottled(1005, ['#2c3a1c', '#334322', '#3a4a26'], {cells: 4, grain: 0.3});
const SEAGRASS = ['#3f8a2a', '#4c9a32', '#5aa83a', '#2f6a1e'];
BLOCK_ART.seagrass = () => strands([[[[3, 16], [2, 10], [4, 3]], 1.3], [[[7, 16], [8, 8], [6, 0]], 1.4], [[[11, 16], [10, 9], [13, 4]], 1.3], [[[14, 16], [15, 12], [13, 8]], 1.1]], SEAGRASS, 1011);
BLOCK_ART.tall_seagrass_bottom = () => strands([[[[3, 16], [3, 8], [2, 0]], 1.3], [[[8, 16], [7, 8], [8, 0]], 1.5], [[[12, 16], [12, 8], [13, 0]], 1.3]], SEAGRASS, 1012);
BLOCK_ART.tall_seagrass_top = () => strands([[[[2, 16], [3, 8], [5, 2]], 1.3], [[[8, 16], [9, 7], [7, 0]], 1.4], [[[13, 16], [12, 9], [10, 4]], 1.2]], SEAGRASS, 1013);
ITEM_ART.seagrass_item = () => icon([{mask: mask().curve([[5, 15], [4, 8], [6, 2]], 1.3).curve([[8, 15], [9, 7], [8, 1]], 1.4).curve([[11, 15], [11, 9], [13, 4]], 1.3), color: '#4c9a32', light: '#7cc44a', dark: '#2f6a1e', outline: '#103008'}]);
// a sea pickle: its side (a green pickle, darker spots) at the left, its top and its tuft at the right (the boxes take
// their faces from here)
BLOCK_ART.sea_pickle = () => {
  const p = pic();
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) p.set(x, y + 4, hex(x === 0 ? '#86a83a' : x === 3 ? '#4a6a1e' : '#6a8a2c'));
  for (const [x, y] of [[1, 5], [2, 8], [1, 9]]) p.set(x, y, hex('#3e5a18'));
  for (let y = 0; y < 4; y++) for (let x = 4; x < 8; x++) p.set(x, y, hex(x === 4 || y === 0 ? '#9ab84a' : '#7a9a32'));
  for (const [x, y] of [[9, 0], [10, 1], [11, 0], [10, 2]]) p.set(x, y, hex('#b4e05a'));
  return p;
};
ITEM_ART.sea_pickle_item = () => icon([{mask: mask().disc(6, 10, 2.4, 3.6).disc(10.5, 9, 2.2, 3.2), color: '#6a8a2c', light: '#9ab84a', dark: '#3e5a18', outline: '#18240a'}], {sparkle: [[6, 6], [10, 5]]});
// corals: the living colours, the dead grey; the block porous, the coral branching up, the fan spread out flat
const CORAL = {tube: ['#2f4dbd', '#3e62d8', '#5a7ef0'], brain: ['#c44f8a', '#d8649e', '#ec84b8'], bubble: ['#8f1a99', '#a92bb0', '#c44ac8'], fire: ['#a81f2c', '#c42a35', '#dc4a4f'], horn: ['#c4a92e', '#d8c03c', '#ead45a']};
const DEAD = ['#7a7570', '#8a8580', '#9a958e'];
const coralBlock = (cols, seed) => { const p = mottled(seed, cols, {cells: 8, grain: 0.5, smooth: 0.4}), r = rng(seed + 1); for (let k = 0; k < 22; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); p.set(x, y, mul(hex(cols[0]), 0.62)); } return p; };
const coralPlant = (cols, seed) => {
  const m = mask(), r = rng(seed);
  m.line(8, 16, 8, 9, 2);
  for (const [x0, y0, x1, y1] of [[8, 11, 4, 5], [8, 10, 12, 4], [8, 9, 8, 2], [5, 7, 2, 3], [11, 7, 14, 2]]) m.line(x0, y0, x1 + (r() - 0.5) * 2, y1, 1.6);
  for (const [x, y] of [[4, 4], [12, 3], [8, 1], [2, 2], [14, 1]]) m.disc(x, y, 1.4);
  const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (m.m[y * S + x]) p.set(x, y, hex(cols[clamp(Math.floor((1 - y / S) * 2.2 + hash(seed, x, y) * 0.9), 0, 2)]));
  return p;
};
const coralFan = (cols, seed) => {
  const p = pic(), r = rng(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 8, dy = 16 - (y + 0.5), a = Math.atan2(dx, dy), d = Math.hypot(dx, dy);
    if (d > 7.5 + Math.sin(a * 6) * 0.8 || Math.abs(a) > 1.25) continue;
    const rib = Math.abs(((a + 1.25) / 2.5 * 7) % 1 - 0.5) < 0.16;
    if (!rib && hash(seed, x, y) < 0.22) continue;
    p.set(x, y, hex(cols[rib ? 0 : d > 5 ? 2 : 1]));
  }
  return p;
};
for (const [c, cols] of Object.entries(CORAL)) {
  const s0 = nameSeed(c + '_coral');
  BLOCK_ART[`${c}_coral_block`] = () => coralBlock(cols, s0); BLOCK_ART[`dead_${c}_coral_block`] = () => coralBlock(DEAD, s0);
  BLOCK_ART[`${c}_coral`] = () => coralPlant(cols, s0 + 1); BLOCK_ART[`dead_${c}_coral`] = () => coralPlant(DEAD, s0 + 1);
  BLOCK_ART[`${c}_coral_fan`] = () => coralFan(cols, s0 + 2); BLOCK_ART[`dead_${c}_coral_fan`] = () => coralFan(DEAD, s0 + 2);
}
// prismarine: blue-green stone, mottled; its bricks; the dark one with dark seams; the sea lantern's glowing panes
BLOCK_ART.prismarine = () => mottled(1021, ['#5a9c8c', '#63a596', '#6eb0a0', '#7fbfae', '#548f86'], {cells: 4, grain: 0.35, smooth: 0.55});
BLOCK_ART.prismarine_bricks = () => { const p = mottled(1022, ['#63a99a', '#6cb2a2', '#76baaa'], {cells: 8, grain: 0.3}); for (let x = 0; x < S; x++) for (const y of [0, 7, 8, 15]) p.set(x, y, hex(y % 8 === 0 ? '#9ad4c4' : '#3e7a6c')); for (let y = 0; y < S; y++) for (const x of y < 8 ? [0, 8] : [4, 12]) p.set(x, y, hex('#3e7a6c')); return p; };
BLOCK_ART.dark_prismarine = () => { const p = mottled(1023, ['#2e4a3e', '#345446', '#3a5c4e'], {cells: 4, grain: 0.3}); for (let i = 0; i < S; i++) for (const k of [0, 15]) { p.set(i, k, hex('#1c3028')); p.set(k, i, hex('#1c3028')); } for (let i = 4; i < 12; i++) { p.set(i, 4, hex('#22382e')); p.set(i, 11, hex('#22382e')); p.set(4, i, hex('#22382e')); p.set(11, i, hex('#22382e')); } return p; };
// sponges: yellow, full of holes (darker round their rims); the wet one browner and darker, its holes holding water
const sponge = (seed, pal, hole, rim) => {
  const p = mottled(seed, pal, {cells: 4, grain: 0.3}), r = rng(seed + 1);
  for (let k = 0; k < 13; k++) {
    const x = Math.floor(r() * S), y = Math.floor(r() * S), big = r() < 0.4;
    p.set(x, y, hex(hole)); if (big) { p.set(x + 1, y, hex(hole)); p.set(x, y + 1, hex(rim)); p.set(x + 1, y + 1, hex(rim)); } else p.set(x, y + 1, hex(rim));
  }
  return p;
};
BLOCK_ART.sponge = () => sponge(1041, ['#c3b44a', '#cfc052', '#dacb5c', '#e4d76a'], '#7d7020', '#a8992e');
BLOCK_ART.wet_sponge = () => sponge(1042, ['#9a9030', '#a69c36', '#b1a73e', '#8c8228'], '#3e4a28', '#6e6a22');
// a guardian's beam (tinted as it charges): bright down its middle, bands along it
BLOCK_ART.guardian_beam = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = 1 - Math.abs(x - 7.5) / 8, band = (y % 4 < 2 ? 1 : 0.8); const v = Math.round(255 * Math.min(1, (0.45 + c * 0.6) * band)); p.set(x, y, [v, v, v]); } return p; };
// a chest's latch (our own: iron; with the game's pictures, cut from its chest)
BLOCK_ART.chest_latch = () => metal('#d8d8d8', '#f4f4f4', '#9c9c9c');
// beds, laid out as the game's bed model (26.x): the mattress's band is rows 7–12 of a side, the legs rows 13–15;
// the head's top has the pillow at its north edge (the top of the picture), the blanket coming up to it; a side's
// head end is towards the north (on the east side the right, on the west the left)
const BED_WOOD = ['#8a6034', '#9a6c3c', '#7a5229', '#a87844'];
function bedPic(base, kind) {
  const p = pic(), b = hex(base), shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k)))), white = [236, 236, 230], sheet = [218, 218, 212];
  const blanket = (x, y) => shade(b, 0.92 + ((x * 7 + y * 13) % 5) * 0.03 - (y % 4 === 0 ? 0.06 : 0)), wood = (x, y) => hex(BED_WOOD[(x * 3 + y * 5) % 4]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c;
    if (kind === 'down') c = wood(x, y);
    else if (kind === 'head_up') c = y < 9 ? (x >= 2 && x <= 13 && y >= 2 && y <= 6 ? (x === 2 || x === 13 || y === 2 || y === 6 ? [200, 200, 196] : white) : sheet) : y < 11 ? shade(white, 0.97) : blanket(x, y);
    else if (kind === 'foot_up') c = y === 15 ? shade(b, 0.75) : blanket(x, y);
    else if (y >= 13) c = wood(x, y);
    else if (y < 7) c = [0, 0, 0];
    // a side's band: the blanket over the white mattress (at the head, the sheet by the pillow)
    else {
      const byPillow = (kind === 'head_east' && x >= 10) || (kind === 'head_west' && x <= 5) || kind === 'head_north';
      c = y <= 9 ? (byPillow ? sheet : blanket(x, y)) : y === 12 ? [180, 180, 174] : white;
    }
    p.set(x, y, c, y < 7 && !/up|down/.test(kind) ? 0 : 255);
  }
  return p;
}
for (const [c, , base] of COLORS) for (const kind of ['head_up', 'head_east', 'head_west', 'foot_up', 'foot_east', 'foot_west', 'foot_south']) BLOCK_ART[`${c}_bed_${kind}`] = () => bedPic(base, kind);
BLOCK_ART.bed_down = () => bedPic('#ffffff', 'down'); BLOCK_ART.bed_head_north = () => bedPic('#e9ecec', 'head_north');
BLOCK_ART.sea_lantern = () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const edge = x === 0 || y === 0 || x === 15 || y === 15, cross = x === 7 || x === 8 || y === 7 || y === 8; p.set(x, y, hex(edge ? '#8ab4a8' : cross ? '#c8e8e0' : (x + y) % 5 === 0 ? '#f4fffc' : '#dff4ee')); } return p; };
ITEM_ART.prismarine_shard = () => icon([{mask: mask().poly([[4, 13], [6, 3], [12, 6], [10, 13]]), color: '#63a596', light: '#a6dccd', dark: '#3e7a6c', outline: '#14302a'}]);
ITEM_ART.prismarine_crystals = () => { const p = icon([{mask: mask().disc(6, 10, 2.6).disc(10.5, 7, 2.4).disc(9, 12, 1.8), color: '#c8ecdf', light: '#ffffff', dark: '#86b4a6', outline: '#2c4a42'}]); for (const [x, y] of [[6, 9], [10, 6]]) p.set(x, y, hex('#ffffff')); return p; };
// the trident: a long shaft corner to corner, wrapped near its foot, a crossbar and three prongs at its head (ours:
// sea-green, the head pale)
// fire: flames licking up from the bottom — yellow at their roots, orange, red at the tips — flickering upward (sixteen
// frames); soul fire the same in white and blues
const flames = (f, seed, pal) => {
  const p = pic(), n = tileNoise(seed, 4), m = tileNoise(seed + 1, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const up = (S - 1 - y) / (S - 1), v = n(x, (y + f) & 15) * 0.65 + m(x, (y + f * 2) & 15) * 0.35, edge = 1 - Math.abs(x - 7.5) / 8;
    const heat = v * (0.6 + edge * 0.4) + 0.5 - up * 0.78;
    if (heat > 0.3) p.set(x, y, hex(heat > 0.75 ? pal[0] : heat > 0.58 ? pal[1] : heat > 0.43 ? pal[2] : pal[3]));
  }
  return p;
};
BLOCK_ART.fire_0 = f => flames(f, 411, ['#fff6b0', '#ffc531', '#f07a14', '#c43c0c']);
BLOCK_ART.fire_1 = f => flames(f, 417, ['#fff6b0', '#ffb820', '#ec6a10', '#b8320a']);
BLOCK_ART.soul_fire_0 = f => flames(f, 423, ['#f0ffff', '#8af2ff', '#36bcd8', '#1a6a8a']);
BLOCK_ART.soul_fire_1 = f => flames(f, 429, ['#f0ffff', '#7ae8ff', '#2eaed0', '#185e7e']);
// frosted ice: ice with white cracks, more of them at each age as it melts
for (let a = 0; a < 4; a++) BLOCK_ART[`frosted_ice_${a}`] = () => {
  const p = mottled(131, ['#8eb4f2', '#9cc0f5', '#aacaf7'], {cells: 4, grain: 0.2}), r = rng(907 + a * 13);
  for (let i = 0; i < p.d.length; i += 4) p.d[i + 3] = 165;
  for (let k = 0; k < 3 + a * 4; k++) { let x = Math.floor(r() * S), y = Math.floor(r() * S); for (let s = 0; s < 3 + a; s++) { p.set(x, y, [232, 242, 255], 220); x = (x + (r() < 0.5 ? 1 : S - 1)) % S; y = (y + 1) % S; } }
  return p;
};
ITEM_ART.trident = () => icon([
  {mask: mask().line(1.5, 14.5, 10.2, 5.8, 1.5), color: '#3f8f86', light: '#74c8bc', dark: '#245a52', outline: '#0e2a26'},
  {mask: mask().line(2.2, 13.8, 4.6, 11.4, 1.9), color: '#5a4630', light: '#7a6244', dark: '#3a2c1c', outline: '#1a140c'},
  {mask: mask().line(8.4, 3.6, 12.4, 7.6, 1.5).line(10.4, 5.6, 14.6, 1.4, 1.3).line(8.6, 3.8, 11.6, 0.8, 1.2).line(12.2, 7.4, 15.2, 4.4, 1.2), color: '#a8e4da', light: '#e4fff8', dark: '#5c9c90', outline: '#163a34'},
]);
ITEM_ART.nautilus_shell = () => icon([{mask: mask().disc(8, 9, 5.4, 5).cut(mask().disc(6.5, 8, 1.6)), color: '#e8d8c4', light: '#fff4e8', dark: '#b89a7a', outline: '#4a3a2a', grain: true}, {mask: mask().curve([[9, 4.5], [12.5, 8], [9, 13]], 1.2), color: '#c8784a', dark: '#8a4a2a'}]);
ITEM_ART.glow_ink_sac = () => icon([{mask: blob(8, 9, 4.6, 3302), color: '#2f8a8a', light: '#7af0d8', dark: '#1a4a4a', outline: '#062020', grain: true}], {sparkle: [[6, 7], [9, 10]]});
// buckets with a fish in them: the water bucket, the fish over its water
const fishBucket = (body, fin) => icon([{mask: mask().poly([[3, 5], [13, 5], [11.5, 14], [4.5, 14]]), color: '#bdbdbd', light: '#e8e8e8', dark: '#7a7a7a', outline: '#2a2a2a'}, {mask: mask().poly([[4.5, 5], [11.5, 5], [11, 7], [5, 7]]), color: '#3f76e4', light: '#7aa6ff', dark: '#2a4fa8'},
  {mask: mask().disc(8, 9.5, 2.6, 1.6).poly([[10, 9.5], [12, 8], [12, 11]]), color: body, dark: fin, outline: '#1e1e1e'}, {mask: mask().curve([[3, 5], [8, -2], [13, 5]], 1), color: '#8a8a8a', dark: '#4a4a4a'}]);
ITEM_ART.cod_bucket = () => fishBucket('#b9a27c', '#7c6a4c'); ITEM_ART.salmon_bucket = () => fishBucket('#b64a3a', '#6e2a20');
ITEM_ART.tropical_fish_bucket = () => fishBucket('#f08a2a', '#b85a10'); ITEM_ART.pufferfish_bucket = () => fishBucket('#e8c838', '#a88a18');
// the turtle's: a scute (a green shell plate), its shell to wear, its eggs (pale, speckled; cracking as they near hatching)
ITEM_ART.turtle_scute = () => icon([{mask: mask().poly([[4, 4], [12, 4], [14, 9], [8, 14], [2, 9]]), color: '#4a9a3a', light: '#7cc45a', dark: '#2e6a22', outline: '#102a0c'}]);
ITEM_ART.turtle_helmet = () => icon([{mask: mask().poly([[2, 10], [3, 5], [8, 2.5], [13, 5], [14, 10], [12, 11], [12, 8], [4, 8], [4, 11]]), color: '#4a9a3a', light: '#7cc45a', dark: '#2e6a22', outline: '#102a0c'}], {sparkle: [[6, 4]]});
const eggs = (crack, seed) => {
  const p = pic(), r = rng(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) p.set(x, y, hex(hash(seed, x, y) < 0.18 ? '#c8c08a' : '#eee8cc'));
  for (let k = 0; k < 10; k++) p.set(Math.floor(r() * S), Math.floor(r() * S), hex('#7a9a6a'));
  for (let k = 0; k < crack * 6; k++) { const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12); p.set(x, y, hex('#6a6450')); p.set(x + 1, y + 1, hex('#6a6450')); }
  return p;
};
BLOCK_ART.turtle_egg = () => eggs(0, 1031); BLOCK_ART.turtle_egg_slightly_cracked = () => eggs(1, 1031); BLOCK_ART.turtle_egg_very_cracked = () => eggs(2, 1031);
ITEM_ART.turtle_egg_item = () => icon([{mask: mask().disc(8, 9, 4, 5), color: '#eee8cc', light: '#ffffff', dark: '#b8b08a', outline: '#4a4630'}], {sparkle: [[6, 7]]});
for (const [k, [a, b]] of Object.entries({squid: ['#223b4d', '#708899'], glow_squid: ['#095656', '#85f1bc'], cod: ['#c1a76a', '#e5c48b'], salmon: ['#a00f10', '#0e8474'], tropical_fish: ['#ef6915', '#fff9ef'],
  pufferfish: ['#f6b201', '#37c3f2'], turtle: ['#e7e7e7', '#00afaf'], guardian: ['#5a8272', '#f17d30'], elder_guardian: ['#ceccba', '#747693'], drowned: ['#8ff1d7', '#799c65'], dolphin: ['#223b4d', '#f9f9f9'], polar_bear: ['#eeeede', '#d5d6cd']})) ITEM_ART[`${k}_spawn_egg`] = () => {
  const p = icon([{mask: mask().disc(8, 9, 4.6, 5.8), color: a, light: toHex(mix(hex(a), [255, 255, 255], 0.35)), dark: toHex(mul(hex(a), 0.62)), outline: '#1a1a1a'}]), r = rng(nameSeed(k));
  for (let n = 0; n < 9; n++) { const x = 5 + Math.floor(r() * 7), y = 5 + Math.floor(r() * 8); if (p.alpha(x, y) && p.alpha(x + 1, y)) { p.set(x, y, hex(b)); if (r() < 0.6) p.set(x + 1, y, mul(hex(b), 0.85)); } }
  return p;
};

// the sea's treasure: the heart of the sea (a blue orb in a pale shell), iron nuggets, the poisonous potato (green and
// spotted), suspicious stew (the stew darker), the conduit (a shell cage round a blue eye)
ITEM_ART.heart_of_the_sea = () => icon([{mask: mask().disc(8, 8.5, 5.8, 5.4), color: '#d8c8a4', light: '#f4ead2', dark: '#9a8a66', outline: '#3a3020'}, {mask: mask().disc(8, 8.5, 4.2, 3.9), color: '#2f6fbe', light: '#8fd8ff', dark: '#173f80', outline: '#0b1c3c'},
  {mask: mask().disc(7, 7.5, 1.6), color: '#c8f4ff', light: '#ffffff', dark: '#7ac8ee'}], {sparkle: [[6, 6]]});
ITEM_ART.iron_nugget = () => icon([{mask: mask().disc(7, 9, 3.2, 2.6).disc(10, 7.5, 2.4), color: '#d8d8d8', light: '#ffffff', dark: '#9a9a9a', outline: '#3c3c3c'}], {sparkle: [[6, 8]]});
ITEM_ART.poisonous_potato = () => { const p = icon([{mask: mask().disc(8, 8.5, 5, 4), color: '#b4b45a', light: '#d6d684', dark: '#74742e', outline: '#2a2a0e', grain: true}]); for (const [x, y] of [[6, 7], [9, 10], [11, 7], [7, 11]]) p.set(x, y, hex('#5e8a2a')); return p; };
ITEM_ART.suspicious_stew = () => bowlOf('#8a5a34');
BLOCK_ART.conduit = () => {
  const p = pic();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), plate = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
    p.set(x, y, d < 3 ? (d < 1.6 ? hex('#cdf6ff') : hex('#3a8fd0')) : d < 4 ? hex('#1e3f5a') : x % 4 === 0 || y % 4 === 0 ? hex('#5a4f3e') : plate ? hex('#a99a80') : hex('#8f8168'));
  }
  return p;
};
// the compass: a dark case, a pale face, the needle (its red end) pointing (f − 16) / 32 of a turn clockwise from up —
// the game's frames, 16 straight up and 0 down
const compassPic = f => {
  const p = icon([{mask: mask().disc(8, 8, 6.4), color: '#6c6c6c', light: '#9c9c9c', dark: '#3c3c3c', outline: '#1e1e1e'}, {mask: mask().disc(8, 8, 4.6), color: '#c9c3b6', light: '#e8e2d4', dark: '#9a9486'}]);
  const a = (f - 16) / 32 * Math.PI * 2, dx = Math.sin(a), dy = -Math.cos(a);
  for (let t = 3.6; t >= -2.6; t -= 0.4) p.set(Math.floor(8 + dx * t), Math.floor(8 + dy * t), hex(t > 0.4 ? '#d8261e' : '#505050'));
  p.set(7, 7, hex('#2a2a2a'));
  return p;
};
for (let f = 0; f < 32; f++) ITEM_ART[`compass_${String(f).padStart(2, '0')}`] = () => compassPic(f);
// the clock: a gold rim; in the top half the sky's dial turning (day with the sun, night with the moon), the ground
// below — frame f / 64 of a day from noon (the game's frames, 0 at noon)
const clockPic = f => {
  const p = icon([{mask: mask().disc(8, 8, 6.4), color: '#e8c33a', light: '#fff1a0', dark: '#a8801a', outline: '#4a3608'}]), a = f / 64 * Math.PI * 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const vx = x + 0.5 - 8, vy = y + 0.5 - 8;
    if (vx * vx + vy * vy > 4.7 * 4.7) continue;
    if (vy > 0.5) { p.set(x, y, hex(vy > 3 ? '#4a3018' : '#6a4a26')); continue; }
    // the dial turned back by the time: its upper half is day, the lower night
    const u = vx * Math.cos(a) + vy * Math.sin(a), w = -vx * Math.sin(a) + vy * Math.cos(a);
    const sun = Math.hypot(u, w + 3) < 1.5, moon = Math.hypot(u, w - 3) < 1.3;
    p.set(x, y, hex(sun ? '#ffe14a' : moon ? '#e8e8f0' : w < 0 ? '#5aa8ff' : '#18205a'));
  }
  return p;
};
for (let f = 0; f < 64; f++) ITEM_ART[`clock_${String(f).padStart(2, '0')}`] = () => clockPic(f);
// maps: the paper (empty), and drawn on (land and water)
const PAPER = {color: '#e6d6a8', light: '#f6ecd0', dark: '#bca878', outline: '#5a4426', grain: true};
ITEM_ART.map = () => icon([{mask: mask().poly([[2, 2.5], [14, 2], [14, 14], [2, 13.5]]), ...PAPER}]);
ITEM_ART.filled_map = () => {
  const p = icon([{mask: mask().poly([[2, 2.5], [14, 2], [14, 14], [2, 13.5]]), ...PAPER}]);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) { const n = hash(77, x >> 1, y >> 1); p.set(x, y, hex(n < 0.35 ? '#6f8fc8' : n < 0.75 ? '#7aa04e' : '#a8884e')); }
  return p;
};

/** Frames per animated texture and ticks per frame. */
export const ANIMATED = {fire_0: {frames: 16, time: 1}, fire_1: {frames: 16, time: 1}, soul_fire_0: {frames: 16, time: 1}, soul_fire_1: {frames: 16, time: 1}, water_still: {frames: 16, time: 2}, water_flow: {frames: 16, time: 1}, lava_still: {frames: 16, time: 4}, lava_flow: {frames: 16, time: 2}, magma: {frames: 3, time: 8}, nether_portal: {frames: 16, time: 1}};
/** Our drawing of a texture by name: {w, h, frames: [Uint8ClampedArray], time} or null when we have none. */
export function ownTexture(name) {
  const art = BLOCK_ART[name] || ITEM_ART[name];
  if (!art) return null;
  const a = ANIMATED[name];
  const frames = a ? Array.from({length: a.frames}, (_, f) => art(f).d) : [art(0).d];
  return {w: S, h: S, frames, time: a?.time || 0};
}
export const OWN_BLOCK_TEXTURES = Object.keys(BLOCK_ART), OWN_ITEM_TEXTURES = Object.keys(ITEM_ART);
