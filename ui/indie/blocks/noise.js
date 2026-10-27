// Seeded noise for the world: a small PRNG, 2D / 3D simplex noise (Stefan Gustavson's), fractal sums of it, and a
// hash for "is there a tree / ore / flower here" questions that must give the same answer every time the same seed asks.

/** A string or number seed made into a 32-bit number. */
export function seedOf(value) {
  const s = String(value ?? '');
  if (/^-?\d+$/.test(s.trim())) return Number(BigInt.asIntN(32, BigInt(s.trim())));
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return h | 0;
}
/** mulberry32: a fast PRNG giving numbers in [0, 1). */
export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/** A hash of a few integers (and the seed) in [0, 1). */
export function hash(seed, x, y = 0, z = 0) {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const G3 = new Int8Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3F = 1 / 6;

/** Simplex noise from a seed: {n2(x, y), n3(x, y, z)}, each in about [-1, 1]. Gradients are looked up already
 * multiplied out per permutation entry (gx, gy, gz), which keeps it fast. */
export function simplex(seed) {
  const r = rng(seed), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Int32Array(512), gx = new Float64Array(512), gy = new Float64Array(512), gz = new Float64Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; const g = (perm[i] % 12) * 3; gx[i] = G3[g]; gy[i] = G3[g + 1]; gz[i] = G3[g + 2]; }
  function n2(xin, yin) {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1 = 0, j1 = 1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = ii + perm[jj]; t0 *= t0; n += t0 * t0 * (gx[g] * x0 + gy[g] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = ii + i1 + perm[jj + j1]; t1 *= t1; n += t1 * t1 * (gx[g] * x1 + gy[g] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = ii + 1 + perm[jj + 1]; t2 *= t2; n += t2 * t2 * (gx[g] * x2 + gy[g] * y2); }
    return 70 * n;
  }
  function n3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3F, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1 = 0, j1 = 0, k1 = 0, i2 = 0, j2 = 0, k2 = 0;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; i2 = 1; j2 = 1; } else if (x0 >= z0) { i1 = 1; i2 = 1; k2 = 1; } else { k1 = 1; i2 = 1; k2 = 1; }
    } else if (y0 < z0) { k1 = 1; j2 = 1; k2 = 1; } else if (x0 < z0) { j1 = 1; j2 = 1; k2 = 1; } else { j1 = 1; i2 = 1; j2 = 1; }
    const x1 = x0 - i1 + G3F, y1 = y0 - j1 + G3F, z1 = z0 - k1 + G3F;
    const x2 = x0 - i2 + 2 * G3F, y2 = y0 - j2 + 2 * G3F, z2 = z0 - k2 + 2 * G3F;
    const x3 = x0 - 1 + 3 * G3F, y3 = y0 - 1 + 3 * G3F, z3 = z0 - 1 + 3 * G3F;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = ii + perm[jj + perm[kk]]; t0 *= t0; n += t0 * t0 * (gx[g] * x0 + gy[g] * y0 + gz[g] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = ii + i1 + perm[jj + j1 + perm[kk + k1]]; t1 *= t1; n += t1 * t1 * (gx[g] * x1 + gy[g] * y1 + gz[g] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = ii + i2 + perm[jj + j2 + perm[kk + k2]]; t2 *= t2; n += t2 * t2 * (gx[g] * x2 + gy[g] * y2 + gz[g] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = ii + 1 + perm[jj + 1 + perm[kk + 1]]; t3 *= t3; n += t3 * t3 * (gx[g] * x3 + gy[g] * y3 + gz[g] * z3); }
    return 32 * n;
  }
  return {n2, n3};
}

/** A fractal sum of `octaves` simplex layers (each twice as fine, half as strong), in about [-1, 1]. */
export function fractal(seed, {scale = 1, octaves = 4, gain = 0.5, lacunarity = 2} = {}) {
  const layers = Array.from({length: octaves}, (_, i) => simplex(seed + i * 1013));
  let norm = 0;
  for (let i = 0, a = 1; i < octaves; i++, a *= gain) norm += a;
  const inv = 1 / norm, f0 = 1 / scale;
  return {
    n2(x, y) { let s = 0, a = 1, f = f0; for (let i = 0; i < layers.length; i++) { s += a * layers[i].n2(x * f, y * f); a *= gain; f *= lacunarity; } return s * inv; },
    n3(x, y, z) { let s = 0, a = 1, f = f0; for (let i = 0; i < layers.length; i++) { s += a * layers[i].n3(x * f, y * f, z * f); a *= gain; f *= lacunarity; } return s * inv; },
  };
}
