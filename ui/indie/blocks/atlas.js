// The textures as the game uses them: one list of names (every block face and item we have a drawing of), each a
// layer of one texture array, from the player's imported pack when it has that name, else our own drawing. Also the
// little pictures for the inventory: blocks as small 3D cubes, items flat. And the sky things (sun, moon, clouds).
import {ownTexture, OWN_BLOCK_TEXTURES, OWN_ITEM_TEXTURES, ANIMATED} from './textures.js';
import {BLOCKS, BY_NAME, itemInfo, ALL_ITEMS} from './blocks.js';
import {rng} from './noise.js';

export const TEXTURE_NAMES = [...OWN_BLOCK_TEXTURES, ...OWN_ITEM_TEXTURES];
export const LAYER = Object.fromEntries(TEXTURE_NAMES.map((n, i) => [n, i]));

const scaleTo = (d, w, h, size) => {
  if (w === size && h === size) return d;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = (Math.floor(y * h / size) * w + Math.floor(x * w / size)) * 4, o = (y * size + x) * 4;
    out[o] = d[s]; out[o + 1] = d[s + 1]; out[o + 2] = d[s + 2]; out[o + 3] = d[s + 3];
  }
  return out;
};
/**
 * The layers: {size, layers: [Uint8Array], animated: [{layer, frames, time}], from: {name: 'pack' | 'own'}}.
 * pack: Map(name → {w, h, frames: [Uint8Array], time}) or null.
 */
export function buildLayers(pack) {
  const pick = name => (pack && pack.get(name)) || ownTexture(name);
  const all = TEXTURE_NAMES.map(pick);
  // one size for all: the largest square frame there is (16 for the game's own, more for HD packs), at most 64
  const size = Math.min(64, Math.max(16, ...all.map(t => t.w)));
  const layers = [], animated = [], from = {};
  all.forEach((t, i) => {
    const frames = t.frames.map(f => scaleTo(f, t.w, t.h, size));
    layers.push(frames[0]);
    from[TEXTURE_NAMES[i]] = pack?.has(TEXTURE_NAMES[i]) ? 'pack' : 'own';
    if (frames.length > 1) animated.push({layer: i, frames, time: t.time || ANIMATED[TEXTURE_NAMES[i]]?.time || 2});
  });
  return {size, layers, animated, from};
}

// ---------- inventory pictures ----------
const rgba = (d, size) => { const c = new OffscreenCanvasLike(size, size); c.put(d); return c.el; };
class OffscreenCanvasLike {
  constructor(w, h) { this.el = document.createElement('canvas'); this.el.width = w; this.el.height = h; this.g = this.el.getContext('2d'); }
  put(d) { const img = this.g.createImageData(this.el.width, this.el.height); img.data.set(d); this.g.putImageData(img, 0, 0); }
}
const tinted = (d, color) => {
  if (color == null) return d;
  const out = new Uint8Array(d), r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
  for (let i = 0; i < out.length; i += 4) { out[i] *= r; out[i + 1] *= g; out[i + 2] *= b; }
  return out;
};
const DEFAULT_TINT = {grass: 0x91bd59, foliage: 0x77ab2f, water: 0x3f76e4};
const tintColor = t => t == null ? null : t.startsWith('#') ? parseInt(t.slice(1), 16) : DEFAULT_TINT[t];
/** Item pictures: {name: dataURL}, drawn at 32 px. */
export function makeIcons(built) {
  const {size, layers} = built, out = {}, N = 32;
  const face = (name, tint) => rgba(tinted(layers[LAYER[name]] || layers[0], tint), size);
  for (const name of ALL_ITEMS) {
    const info = itemInfo(name), c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const b = info.block;
    if (b && ['cube', 'slab', 'cactus', 'farmland', 'layer'].includes(b.shape) && b.tex) {
      const t = b.tex, tint = tintColor(b.tint);
      const top = face(t.all || t.top, tint), side = face(t.all || (b.facing && t.front) || t.side, b.name === 'grass_block' ? null : tint);
      const side2 = face(t.all || t.side, b.name === 'grass_block' ? null : tint);
      const h = b.shape === 'slab' ? 0.5 : b.shape === 'layer' ? 0.125 : 1;
      // an isometric cube: the top a diamond from (16, 0), the front face on the left, the side on the right; a slab
      // or a snow layer is the lower part of it
      const s = N / 2, k = s / 2, drop = (1 - h) * s, u = s / size, w = k / size;
      g.save(); g.setTransform(u, w, -u, w, s, drop); g.drawImage(top, 0, 0); g.restore();
      const drawSide = (img, left, shade, overlay) => {
        g.save();
        if (left) g.setTransform(u, w, 0, u, 0, k); else g.setTransform(u, -w, 0, u, s, 2 * k);
        g.beginPath(); g.rect(0, (1 - h) * size, size, size * h); g.clip();
        g.drawImage(img, 0, 0);
        if (overlay) g.drawImage(overlay, 0, 0);
        g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, (1 - h) * size, size, size * h);
        g.restore();
      };
      const ov = b.name === 'grass_block' ? face('grass_block_side_overlay', DEFAULT_TINT.grass) : null;
      drawSide(side, true, 0.2, ov); drawSide(side2, false, 0.4, ov);
    } else {
      const tex = b ? (b.name === 'wheat' ? 'wheat_stage7' : b.tex?.all || b.tex?.side) : info.icon;
      const img = face(tex, b ? tintColor(b.tint) : null);
      g.drawImage(img, 0, 0, N, N);
    }
    out[name] = c.toDataURL();
  }
  return out;
}

// ---------- sky pictures (ours; the pack's when imported) ----------
export function ownSun() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,240,170,0.25)'; g.fillRect(2, 2, 28, 28);
  g.fillStyle = 'rgba(255,248,200,0.6)'; g.fillRect(6, 6, 20, 20);
  g.fillStyle = '#fffbe0'; g.fillRect(9, 9, 14, 14);
  return c;
}
export function ownMoon() {
  // eight phases in a 4 × 2 grid, like the game's picture
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let p = 0; p < 8; p++) {
    const ox = (p % 4) * 32, oy = Math.floor(p / 4) * 32;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      if (dx * dx + dy * dy > 49) continue;
      // the lit part: full at 0, new at 4
      const k = p <= 4 ? 1 - p / 4 : (p - 4) / 4, edge = (p <= 4 ? -1 : 1) * (1 - 2 * k) * Math.sqrt(Math.max(0, 49 - dy * dy));
      const lit = p === 0 || (p <= 4 ? dx > edge : dx < -edge);
      if (!lit && p !== 0) continue;
      const crater = (x === 5 && y === 6) || (x === 9 && y === 9) || (x === 10 && y === 5);
      g.fillStyle = crater ? '#b8bcc8' : '#e8ecf4';
      g.fillRect(ox + 8 + x, oy + 8 + y, 1, 1);
    }
  }
  return c;
}
export function ownClouds(seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(seed), img = g.createImageData(256, 256);
  const cells = 16, grid = Array.from({length: cells * cells}, r);
  const at = (i, j) => grid[((j + cells) % cells) * cells + ((i + cells) % cells)];
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const fx = x / 16, fy = y / 16, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const v = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
    const o = (y * 256 + x) * 4, on = v + (r() - 0.5) * 0.08 > 0.62;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = on ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  return c;
}
export {BY_NAME, BLOCKS};
