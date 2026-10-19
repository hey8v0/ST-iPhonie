// 南极结界 · 光: light for a 3/4 view with volume. Every pixel knows which way it faces (a normal) and how high it is
// above the ground; every object has a rough 3D shape (spheres, cylinders, boxes, a roof) that casts its shadow.
// World axes: x east (screen right), y toward the camera (screen down; here that is north, the sea side of 鲸湾),
// z up. The sun goes from east to west through the north, so it shines from the camera's side: fronts are lit and
// shadows fall away up the screen, long at morning and evening.
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// [hour, sun colour, sky (ambient) colour]
const KEYS = [
  [4.5, [0.0, 0.0, 0.0], [0.131, 0.156, 0.295]],
  [6, [0.561, 0.343, 0.317], [0.295, 0.295, 0.451]],
  [7.5, [0.96, 0.72, 0.56], [0.42, 0.42, 0.55]],
  [10, [0.858, 0.805, 0.713], [0.426, 0.467, 0.558]],
  [13, [0.884, 0.845, 0.766], [0.451, 0.492, 0.574]],
  [16, [0.884, 0.766, 0.607], [0.426, 0.451, 0.541]],
  [17.8, [1.1, 0.7, 0.4], [0.4, 0.36, 0.48]],
  [19, [0.528, 0.277, 0.264], [0.246, 0.23, 0.377]],
  [20, [0.0, 0.0, 0.0], [0.139, 0.164, 0.312]],
  [24, [0.0, 0.0, 0.0], [0.115, 0.139, 0.279]]];
const SEASON_TINT = [[1, 1, 1], [1.04, 1.02, .98], [1.06, .96, .86], [.9, .96, 1.08]];
export function sunAt(hour, season = 0) {
  const h = clamp(hour, 4.5, 24); let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const [h0, s0, a0] = KEYS[i], [h1, s1, a1] = KEYS[i + 1], t = clamp((h - h0) / (h1 - h0), 0, 1);
  const day = clamp((h - 6) / 13.5, 0, 1), east = Math.cos(day * Math.PI), el = (6 + 46 * Math.sin(day * Math.PI)) * Math.PI / 180;
  const hx = east, hy = .62, hl = Math.hypot(hx, hy);
  const L = [hx / hl * Math.cos(el), hy / hl * Math.cos(el), Math.sin(el)];
  const tint = SEASON_TINT[season | 0] || SEASON_TINT[0], sun = s0.map((v, k) => lerp(v, s1[k], t) * tint[k] * (season === 3 ? .88 : 1)), sky = a0.map((v, k) => lerp(v, a1[k], t) * tint[k]);
  return {hour: h, L, sun, sky, up: Math.sin(el), night: sun[0] + sun[1] + sun[2] < .05, golden: clamp(1 - Math.abs(h - 17.8) / 1.6, 0, 1)};
}

/** Normals for a rounded thing from its outline: flat towards the camera in the middle, turning away at the edges. */
/** Distance (in pixels, up to R) from each filled pixel to the nearest empty one or the edge: two chamfer passes. */
export function insideDistance(filled, w, h, R) {
  const D = new Float32Array(w * h), BIG = 1e4;
  for (let i = 0; i < w * h; i++) D[i] = filled(i) ? BIG : 0;
  const at = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
  for (let i = 0; i < w * h; i++) if (D[i] > R) D[i] = R;
  return D;
}

/** Normals for a rounded thing from its outline: flat towards the camera in the middle, turning away at the edges. */
export function pillow(px, w, h, R = 6) {
  const D = insideDistance(i => px[i] !== 0, w, h, R);
  const N = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!px[i]) continue;
    const g = (X, Y) => X < 0 || Y < 0 || X >= w || Y >= h ? 0 : D[Y * w + X];
    let gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1);
    const gl = Math.hypot(gx, gy) || 1, e = 1 - (D[i] - 1) / (R - 1);
    const dx = -gx / gl * e, dy = -gy / gl * e; // outward, in screen terms (dy > 0: the lower edge)
    let nx = dx * .95, ny = .6 * (1 - e) + (dy > 0 ? dy * .95 : dy * .75), nz = .8 * (1 - e) + (dy < 0 ? -dy * .65 : -dy * .25) + e * .25 * (1 - Math.abs(dy));
    const l = Math.hypot(nx, ny, nz) || 1;
    N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
  }
  return N;
}

/** How far a point's shadow moves per pixel of height (dx, dy), kept to a sensible length when the sun is low. */
export function shadowStep(sun, max = 1.45) {
  const [Lx, Ly, Lz] = sun.L; if (Lz <= .02) return null;
  let kx = -Lx / Lz, ky = -Ly / Lz; const k = Math.hypot(kx, ky); if (k > max) { kx *= max / k; ky *= max / k; }
  return [kx, ky];
}
/**
 * Marks the shadow of a sprite on the ground: each pixel stands at its height above the foot and is thrown along
 * (kx, ky) per pixel of height; pixels above each other are joined so a long shadow has no gaps. The shadow keeps the
 * sprite's own outline — a head, a ponytail, the lumps of a canopy. Light from a lamp is handled by the caller giving
 * a point instead (from: {x, y, z}).
 */
export function markSprite(mark, o, kx, ky, from = null) {
  const proj = (x, z) => {
    if (!from) return [x + z * kx, o.foot - 1 + z * ky];
    if (z >= from.z - 1) return null;
    const t = from.z / (from.z - z); return [from.x + (x - from.x) * t, from.y + (o.foot - 1 - from.y) * t];
  };
  const line = (a, b) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])))); for (let k = 0; k <= n; k++) mark(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); };
  // each column joined down its length, and (for a point light, whose rays fan out) to the column before it
  const side = from ? new Array(o.h).fill(null) : null;
  for (let i = 0; i < o.w; i++) {
    let prev = null;
    for (let j = o.h - 1; j >= 0; j--) {
      if (!o.px[j * o.w + i]) { prev = null; if (side) side[j] = null; continue; }
      const z = Math.max(0, o.foot - (o.y + j) - (o.lift || 0)), p = proj(o.x + i, z);
      if (!p) { prev = null; if (side) side[j] = null; continue; }
      if (prev) line(prev, p); else mark(p[0], p[1]);
      if (side) { if (side[j]) line(side[j], p); side[j] = p; }
      prev = p;
    }
  }
}

/** Sun shadows on the ground, soft-edged: 0 lit … 1 shaded. Built things cast their boxes and roofs; everything else its
 *  own outline. (All at once; shadowSteps does the same a little at a time.) */
export function sunShadows(W, H, objects, sun) { const out = {}; for (const _ of shadowSteps(W, H, objects, sun, out)) { /* run */ } return out.shadow; }
export function* shadowSteps(W, H, objects, sun, result, per = 60) {
  const S = new Uint8Array(W * H), step = shadowStep(sun);
  if (!step) { result.shadow = new Float32Array(W * H); return; }
  const [kx, ky] = step, fill = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) S[y * W + x] = 1; };
  const discAt = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) fill(x, y); };
  const rect = (x0, x1, y0, y1, dz) => { for (let y = Math.floor(y0 + dz * ky); y <= y1 + dz * ky; y++) for (let x = Math.floor(x0 + dz * kx); x <= x1 + dz * kx; x++) fill(x, y); };
  const reach = Math.hypot(kx, ky);
  let done = 0;
  for (const o of objects) if (!o.boxy) { markSprite(fill, o, kx, ky); if (++done % per === 0) yield; }
  for (const s of objects.filter(o => o.boxy).flatMap(o => o.world)) {
    if (s.t === 'sphere') { const step = Math.max(1, s.r / 3); for (let z = s.z - s.r * .8; z <= s.z + s.r * .8; z += step) { const rr = Math.sqrt(Math.max(0, s.r * s.r - (z - s.z) ** 2)); discAt(s.x + z * kx, s.y + z * ky, rr); } }
    else if (s.t === 'cyl') for (let z = 0; z <= s.h; z += Math.max(1, 2 / reach)) discAt(s.x + z * kx, s.y + z * ky, s.r);
    else if (s.t === 'box') for (let z = 0; z <= s.h; z += 2) rect(s.x0, s.x1, s.y0, s.y1, z);
    else if (s.t === 'roof') for (let z = s.h0; z <= s.h1; z += 2) { const t = (z - s.h0) / (s.h1 - s.h0), cx = (s.x0 + s.x1) / 2, hw = (s.x1 - s.x0) / 2 * (1 - t); rect(cx - hw, cx + hw, s.y0, s.y1, z); }
  }
  yield;
  // a soft edge: blur a little each way
  const A = new Float32Array(W * H), out = new Float32Array(W * H), R = 1, n = R * 2 + 1;
  for (let y = 0; y < H; y++) { let run = 0; for (let x = -R; x < W + R; x++) { const a = x + R, b = x - R - 1; if (a < W) run += S[y * W + a]; if (b >= 0) run -= S[y * W + b]; if (x >= 0 && x < W) A[y * W + x] = run / n; } }
  for (let x = 0; x < W; x++) { let run = 0; for (let y = -R; y < H + R; y++) { const a = y + R, b = y - R - 1; if (a < H) run += A[a * W + x]; if (b >= 0) run -= A[b * W + x]; if (y >= 0 && y < H) out[y * W + x] = Math.min(1, run / n * 1.5); } }
  result.shadow = out;
}

/**
 * The light on one pixel: albedo [r,g,b] 0–255, normal n, where it is (x, ground y, height z), how much sun reaches
 * it (vis 0–1), and the lamps [{x, y, z, r, c:[r,g,b], k}]. Returns [r,g,b] unclamped.
 */
export function shade(alb, n, x, y, z, vis, sun, lamps) {
  // wrapped light: a grazing sun still lights flat ground well enough that shadows read, as games do
  const [Lx, Ly, Lz] = sun.L, nl = Math.max(0, (n[0] * Lx + n[1] * Ly + n[2] * Lz + .5) / 1.5) * vis;
  const amb = .62 + .38 * n[2];
  let r = sun.sky[0] * amb + sun.sun[0] * nl, g = sun.sky[1] * amb + sun.sun[1] * nl, b = sun.sky[2] * amb + sun.sun[2] * nl;
  for (const l of lamps) {
    const dx = l.x - x, dy = l.y - y, dz = l.z - z, d = Math.hypot(dx, dy * 1.15, dz);
    if (d >= l.r) continue;
    const att = (1 - d / l.r) ** 2, diff = Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / (d || 1));
    const k = att * (.25 + .75 * diff) * l.k;
    r += l.c[0] * k; g += l.c[1] * k; b += l.c[2] * k;
  }
  return [alb[0] * r, alb[1] * g, alb[2] * b];
}
