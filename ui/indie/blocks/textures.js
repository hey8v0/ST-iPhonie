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
/** Voronoi stones (cobblestone, gravel, cobbled deepslate): each stone its own shade, lit from the top left, dark seams. */
function stones(seed, pal, {count = 9, seam = '#3a3a3a', jitter = 0.5, edge = 0.18} = {}) {
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
function chest(face) {
  const p = planks(nameSeed('chest'), '#a2733d'), dark = hex('#3f2a14'), band = hex('#6b4a25');
  for (let i = 0; i < S; i++) { p.set(i, 0, dark); p.set(i, 15, dark); p.set(0, i, dark); p.set(15, i, dark); }
  if (face !== 'top') { for (let x = 1; x < 15; x++) { p.set(x, 5, dark); p.set(x, 6, band); } }
  if (face === 'front') { p.rect(7, 4, 8, 8, hex('#c9c9c9')); p.set(7, 8, hex('#777777')); p.set(8, 8, hex('#777777')); }
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
function farmland() {
  const p = mottled(13, ['#4d321e', '#58391f', '#634226', '#6e4a2b'], {cells: 4, grain: 0.4});
  for (let x = 0; x < S; x++) for (const y of [3, 7, 11, 15]) p.set(x, y, hex('#3b2616'));
  return p;
}

const BLOCK_ART = {
  stone: () => stone(11), dirt: () => dirt(nameSeed('dirt')), grass_block_top: () => grassTop(21), grass_block_side: () => grassSide(23, false),
  grass_block_side_overlay: () => grassSide(23, true),
  grass_block_snow: () => sideWith(dirt(nameSeed('dirt')), mottled(41, ['#dfe9ef', '#eef5f8', '#ffffff'], {cells: 8}), 41, 1),
  cobblestone: () => stones(31, ['#5b5b5b', '#6b6b6b', '#7a7a7a', '#878787', '#959595', '#a3a3a3'], {count: 10, seam: '#3e3e3e'}),
  mossy_cobblestone: () => { const p = stones(31, ['#5b5b5b', '#6b6b6b', '#7a7a7a', '#878787', '#959595'], {count: 10, seam: '#3e3e3e'}), n = tileNoise(32, 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (n(x, y) > 0.55) p.set(x, y, mix(hex('#4f7a2e'), hex('#6d9a3c'), hash(3, x, y))); return p; },
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
  torch: () => torch(), lantern: () => lantern(), ladder: () => ladder(), glass: () => glass(), bricks: () => bricks(151), stone_bricks: () => stoneBricks(153), bookshelf: () => bookshelf(),
  glowstone: () => stones(161, ['#8a6a2c', '#b98f3f', '#d9b25a', '#f2d27a', '#ffe7a6'], {count: 11, seam: '#6b4f22', edge: 0.2}),
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
  // the arm shown when the hand is empty: a sleeve over skin (our own colours)
  player_arm: () => { const p = pic(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sleeve = y < 6, c = sleeve ? hex(y === 5 ? '#9e3646' : '#c84a5a') : hex('#f2c9a9'); p.set(x, y, mul(c, 0.92 + hash(9, x, y) * 0.1 - (x % 4 === 3 ? 0.06 : 0))); } return p; },
};
for (const mat of Object.keys(MAT)) for (const kind of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) ITEM_ART[`${mat}_${kind}`] = () => tool(kind, mat);

/** Frames per animated texture and ticks per frame. */
export const ANIMATED = {water_still: {frames: 16, time: 2}, water_flow: {frames: 16, time: 1}, lava_still: {frames: 16, time: 4}, lava_flow: {frames: 16, time: 2}};
/** Our drawing of a texture by name: {w, h, frames: [Uint8ClampedArray], time} or null when we have none. */
export function ownTexture(name) {
  const art = BLOCK_ART[name] || ITEM_ART[name];
  if (!art) return null;
  const a = ANIMATED[name];
  const frames = a ? Array.from({length: a.frames}, (_, f) => art(f).d) : [art(0).d];
  return {w: S, h: S, frames, time: a?.time || 0};
}
export const OWN_BLOCK_TEXTURES = Object.keys(BLOCK_ART), OWN_ITEM_TEXTURES = Object.keys(ITEM_ART);
