// Drawing with WebGL2: the world's sections (solid and cut-out first, near to far; water and ice after, far to near),
// the sky (colour by the hour, sun, moon, stars), clouds, fog, the outline of the block aimed at and its cracks,
// dropped items, particles and what the player holds. Everything is drawn relative to the camera so far-away places
// keep their precision. All meshes share one vertex layout (mesh.js): positions are 16-bit numbers that the shader
// divides by u_unit and moves by u_center, so chunks (1/16 block) and small things (1/256) use the same program.
// With 光影 on (setQuality) the same meshes go through shaders.js: lit in colour, with shadows from a shadow map,
// fog into the sky, water that mirrors, clouds, light shafts; and the distant view's tiles (lod.js) past the columns.
// On mid and high (where the browser can draw into float pictures) the frame goes into an HDR picture first: the land,
// then the sky where nothing is, a copy of that for the water to look into, the water; then the end of the frame
// (bloom, edge shade, shafts, the film, smoothing) onto the screen, and the hand over it.
import {STRIDE} from './mesh.js';
import {chunkShaders, shadowShaders, skyShaders, entityShaders, lodShaders, postShaders, bloomShaders, compositeShaders, edgeShaders} from './shaders.js';
import {LOD_STRIDE, LOD_TILE} from './lod.js';

const VS = `#version 300 es
precision highp float;
layout(location=0) in uvec3 a_pos;
layout(location=1) in uint a_layer;
layout(location=2) in uvec2 a_uv;
layout(location=3) in uvec2 a_light;
layout(location=4) in uint a_shade;
layout(location=5) in vec3 a_tint;
uniform mat4 u_viewProj, u_model;
uniform vec3 u_origin, u_camera;
uniform float u_unit, u_center, u_time, u_wave;
out vec3 v_uvl; out vec2 v_light; out float v_shade; out vec3 v_tint; out float v_dist; out float v_liquid;
const float AO[4] = float[4](1.0, 0.8, 0.65, 0.5);
const float FACE[6] = float[6](0.6, 0.6, 1.0, 0.5, 0.8, 0.8);
void main() {
  vec3 p = vec3(a_pos) / u_unit - u_center;
  vec3 wp = (u_model * vec4(p, 1.0)).xyz + u_origin;
  uint flags = a_shade >> 5u;
  vec3 world = wp + u_camera;
  if (u_wave > 0.0 && flags == 1u) wp.xz += 0.035 * vec2(sin(u_time * 1.7 + world.x * 0.9 + world.y), cos(u_time * 1.3 + world.z * 0.8 + world.y));
  if (u_wave > 0.0 && flags == 2u) wp.xz += (1.0 - float(a_uv.y) / 16.0) * 0.07 * vec2(sin(u_time * 2.1 + world.x * 0.7 + world.z * 0.3), cos(u_time * 1.7 + world.z * 0.6));
  if (flags == 4u) wp.y += sin(u_time * 1.2 + world.x * 0.6 + world.z * 0.8) * 0.012;
  gl_Position = u_viewProj * vec4(wp, 1.0);
  v_uvl = vec3(vec2(a_uv) / 16.0, float(a_layer));
  v_light = vec2(a_light) / 17.0;
  v_shade = AO[a_shade & 3u] * FACE[min((a_shade >> 2u) & 7u, 5u)];
  v_tint = a_tint; v_dist = length(wp); v_liquid = flags == 4u ? 1.0 : 0.0;
}`;
const FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray u_tex;
uniform float u_daylight, u_gamma, u_cut, u_alpha, u_fogNear, u_fogFar, u_flicker, u_overlay, u_bright;
uniform vec3 u_skyLight, u_fog;
in vec3 v_uvl; in vec2 v_light; in float v_shade; in vec3 v_tint; in float v_dist; in float v_liquid;
out vec4 o;
float curve(float l) { float x = clamp(l / 15.0, 0.0, 1.0); float b = x / (4.0 - 3.0 * x); return mix(b, 1.0 - pow(1.0 - b, 4.0), u_gamma); }
void main() {
  vec4 c = texture(u_tex, v_uvl);
  if (c.a < u_cut) discard;
  if (u_overlay > 0.5) { o = vec4(c.rgb, c.a); return; }
  float sky = max(v_light.x - (1.0 - u_daylight) * 11.0, 0.0);
  vec3 light = curve(sky) * u_skyLight + curve(v_light.y) * vec3(1.0, 0.86, 0.68) * u_flicker;
  light = clamp(light + 0.035 + u_bright, 0.0, 1.0);
  vec3 col = c.rgb * v_tint * light * v_shade;
  float fog = smoothstep(u_fogNear, u_fogFar, v_dist);
  o = vec4(mix(col, u_fog, fog), (v_liquid > 0.5 ? max(c.a, 0.72) : c.a) * u_alpha);
}`;
const SKY_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform mat4 u_invViewProj;
out vec3 v_dir;
void main() { vec2 p = P[gl_VertexID]; gl_Position = vec4(p, 0.9999, 1.0); vec4 w = u_invViewProj * vec4(p, 1.0, 1.0); v_dir = w.xyz / w.w; }`;
const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 u_top, u_horizon, u_sunDir, u_glow;
uniform float u_stars, u_glowAmt;
in vec3 v_dir; out vec4 o;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(v_dir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(u_horizon, u_top, smoothstep(-0.05, 0.45, h));
  if (d.y < -0.05) c = mix(c, u_horizon * 0.6, smoothstep(-0.05, -0.3, d.y));
  // sunrise and sunset glow towards the sun
  float g = max(dot(normalize(vec3(d.x, d.y * 2.5, d.z)), normalize(vec3(u_sunDir.x, 0.0, u_sunDir.z))), 0.0);
  c = mix(c, u_glow, pow(g, 6.0) * u_glowAmt * (1.0 - smoothstep(0.0, 0.5, d.y)));
  if (u_stars > 0.0 && d.y > 0.0) { vec3 q = floor(d * 220.0); float s = hash(q); if (s > 0.9965) c += vec3(u_stars * (s - 0.9965) / 0.0035) * smoothstep(0.0, 0.2, d.y); }
  o = vec4(c, 1.0);
}`;
const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_viewProj;
uniform float u_back;
out vec2 v_uv; out float v_dist;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); if (u_back > 0.5) gl_Position.z = gl_Position.w * 0.99995; v_uv = a_uv; v_dist = length(a_pos); }`;
const QUAD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform vec4 u_color; uniform float u_mode, u_fogNear, u_fogFar, u_gain; uniform vec3 u_fog; uniform vec2 u_shift;
in vec2 v_uv; in float v_dist; out vec4 o;
void main() {
  if (u_mode < 0.5) { vec4 t = texture(u_img, v_uv); o = vec4((u_gain > 0.0 ? t.rgb * t.rgb * u_gain : t.rgb) * u_color.rgb, t.a * u_color.a); if (o.a < 0.01) discard; return; }
  // clouds: the map, one texel per 12 blocks
  vec4 t = texture(u_img, v_uv + u_shift);
  if (t.a < 0.5) discard;
  float fog = smoothstep(u_fogNear, u_fogFar, v_dist);
  o = vec4(mix(u_color.rgb, u_fog, fog), u_color.a * (1.0 - fog * fog));
}`;
// mobs: boxes built on the page, already placed relative to the camera, textured from their skin
const ENT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_shade;
uniform mat4 u_viewProj;
out vec2 v_uv; out float v_shade; out float v_dist;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); v_uv = a_uv; v_shade = a_shade; v_dist = length(a_pos); }`;
const ENT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform vec2 u_light;
uniform float u_daylight, u_gamma, u_flicker, u_fogNear, u_fogFar, u_hurt, u_white, u_bright;
uniform vec3 u_skyLight, u_fog, u_tint;
in vec2 v_uv; in float v_shade; in float v_dist; out vec4 o;
float curve(float l) { float x = clamp(l / 15.0, 0.0, 1.0); float b = x / (4.0 - 3.0 * x); return mix(b, 1.0 - pow(1.0 - b, 4.0), u_gamma); }
void main() {
  vec4 c = texture(u_img, v_uv);
  if (c.a < 0.1) discard;
  float sky = max(u_light.x - (1.0 - u_daylight) * 11.0, 0.0);
  vec3 light = clamp(curve(sky) * u_skyLight + curve(u_light.y) * vec3(1.0, 0.86, 0.68) * u_flicker + 0.05 + u_bright, 0.0, 1.0);
  vec3 col = c.rgb * u_tint * light * v_shade;
  col = mix(col, vec3(1.0, 0.12, 0.08) * max(light, vec3(0.3)), u_hurt * 0.45);
  col = mix(col, vec3(1.0), u_white);
  o = vec4(mix(col, u_fog, smoothstep(u_fogNear, u_fogFar, v_dist)), 1.0);
}`;
const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
uniform mat4 u_viewProj;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); }`;
const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color; out vec4 o;
void main() { o = u_color; }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error('着色器编译失败：' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error('着色器链接失败：' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return {p, u};
}

/**
 * A tiling value noise picture (n × n, grey): random values on a cells × cells grid that wraps round, blended smoothly
 * between. The shaded look reads it for the clouds (an octave a lookup) and for puddles and foam.
 */
export function noisePicture(n = 256, cells = 8, seed = 7) {
  const at = (i, j) => {
    let h = Math.imul(((i % cells) + cells) % cells, 374761393) ^ Math.imul(((j % cells) + cells) % cells, 668265263) ^ Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const d = new Uint8Array(n * n * 4), size = n / cells, ease = t => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / size, fy = y / size, i = Math.floor(fx), j = Math.floor(fy), u = ease(fx - i), v = ease(fy - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * u, bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    const o = (y * n + x) * 4;
    d[o] = d[o + 1] = d[o + 2] = Math.round((top + (bottom - top) * v) * 255); d[o + 3] = 255;
  }
  return d;
}

// ---------- small matrix helpers (column-major, like WebGL) ----------
const lin = c => c.map(v => v * v), mixv = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), scale = (a, k) => a.map(v => v * k);
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// the sun's path leans (like the shader packs' sun path rotation) so shadows at noon are not straight down
export const SUN_TILT = 0.42;
/** The light of a frame from the environment: where the sun (or moon) is, its colour, the sky's, the air's. */
export function lighting(env, view) {
  const a = env.sunAngle || 0, el = Math.sin(a), sun = [Math.cos(a), el * Math.cos(SUN_TILT), el * Math.sin(SUN_TILT)];
  const rain = 1 - (env.sunMoon ?? 1), fogFar = env.underwater ? 18 : env.nether ? Math.min(view.far, Math.max(56, Math.min(view.far, 192) * 0.5)) : (view.lodFar || view.far);
  // the eye's reach to the sky (dark air and a brighter exposure in caves), the light held in the hand, the clouds' cover
  const eyeSky = env.eyeSky ?? 1, cave = 1 + (1 - eyeSky) * 0.5;
  // a thunderstorm: darker, the air thicker; a lightning flash lights everything outside for a moment; the aurora on
  // snowy nights
  const thunder = env.thunder || 0;
  const base = {sunTrue: sun, block: [1.0, 0.6, 0.3], fogLin: lin(env.fog), fogFar, fogDensity: 1.75 / fogFar * (1 + rain * 1.4 + thunder * 0.8), underwater: env.underwater ? 1 : 0, flicker: env.flicker ?? 1, bright: env.bright || 0, rain,
    eyeSky, held: env.held || 0, camY: view.y, time: env.time || 0, cover: 0.5 - rain * 0.25 - thunder * 0.1, sunDisc: [0, 0, 0], aurora: env.aurora || 0, flash: env.flash ? 1 : 0};
  if (env.nether) return {...base, lightDir: [0, 1, 0], lightCol: [0, 0, 0], amb: [0.17, 0.07, 0.05], zenith: lin(env.fog), horizon: lin(env.fog), glow: [0, 0, 0], exposure: 1.4, fogDensity: 2.4 / fogFar, eyeSky: 1};
  const day = smooth(-0.04, 0.14, el), night = 1 - smooth(-0.14, 0.02, el), set = Math.max(0, 1 - Math.abs(el) * 3.2);
  const sunCol = scale(mixv([1.0, 0.91, 0.8], [1.0, 0.5, 0.22], set * set), 2.9 * day * (1 - rain * 0.85));
  const moonCol = scale([0.3, 0.38, 0.62], 0.34 * night * (1 - rain * 0.7)), up = el > -0.02;
  let amb = scale(mixv([0.018, 0.024, 0.05], [0.21, 0.28, 0.46], day), (1 - rain * 0.45) * (1 - thunder * 0.35));
  amb = mixv(amb, [0.42, 0.33, 0.32], set * 0.3 * day);
  const glow = mixv(scale(sunCol, 0.22), [1.1, 0.5, 0.2], set * 0.7 * day);
  return {...base, lightDir: up ? sun : scale(sun, -1), lightCol: up ? sunCol : moonCol, amb, zenith: lin(env.skyTop), horizon: lin(env.horizon), glow, exposure: (0.86 + night * 1.0) * cave, day, sunDisc: sunCol};
}
export const mat = {
  perspective(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); },
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  view(yaw, pitch) {
    // looking along -z at yaw 0; yaw turns to the left (counter-clockwise from above), pitch up
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rx = [cy, 0, -sy], fwd = [-sy * cp, sp, -cy * cp], up = [sy * sp, cp, cy * sp];
    return new Float32Array([rx[0], up[0], -fwd[0], 0, rx[1], up[1], -fwd[1], 0, rx[2], up[2], -fwd[2], 0, 0, 0, 0, 1]);
  },
  invert(m) {
    const inv = new Float32Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return inv;
  },
  identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  /** Scale, then turn about y (yaw), x (pitch), z (roll), then move. */
  model(s, yaw = 0, pitch = 0, roll = 0, tx = 0, ty = 0, tz = 0) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
    // R = Ry * Rx * Rz
    const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
    const r10 = cx * sz, r11 = cx * cz, r12 = -sx;
    const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
    return new Float32Array([r00 * s, r10 * s, r20 * s, 0, r01 * s, r11 * s, r21 * s, 0, r02 * s, r12 * s, r22 * s, 0, tx, ty, tz, 1]);
  },
};

/** Builds vertices in the shared layout for small things (cubes, flat items, particles). */
export class Verts {
  constructor(cap = 4096) { this.u8 = new Uint8Array(cap * STRIDE); this.u16 = new Uint16Array(this.u8.buffer); this.n = 0; }
  reset() { this.n = 0; return this; }
  v(x, y, z, unit, center, layer, u, v, sky, blk, shade, tint = 0xFFFFFF) {
    if ((this.n + 1) * STRIDE > this.u8.length) { const b = new Uint8Array(this.u8.length * 2); b.set(this.u8); this.u8 = b; this.u16 = new Uint16Array(b.buffer); }
    const o = this.n * STRIDE, h = o >> 1;
    this.u16[h] = Math.max(0, Math.min(65535, Math.round((x + center) * unit))); this.u16[h + 1] = Math.max(0, Math.min(65535, Math.round((y + center) * unit))); this.u16[h + 2] = Math.max(0, Math.min(65535, Math.round((z + center) * unit)));
    this.u16[h + 3] = layer;
    const b = this.u8; b[o + 8] = u; b[o + 9] = v; b[o + 10] = sky; b[o + 11] = blk; b[o + 12] = shade; b[o + 13] = tint >> 16 & 255; b[o + 14] = tint >> 8 & 255; b[o + 15] = tint & 255;
    this.n++;
  }
  /** A cube from -h..h with a texture layer per face (east, west, up, down, south, north). */
  cube(h, layers, sky, blk, unit, center, tints = null, uv = [0, 0, 16, 16]) {
    const F = [[[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]], [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]], [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]],
      [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]]];
    const [u0, v0, u1, v1] = uv, UV = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    for (let f = 0; f < 6; f++) { if (layers[f] < 0) continue; for (let c = 0; c < 4; c++) this.v(F[f][c][0], F[f][c][1], F[f][c][2], unit, center, layers[f], UV[c][0], UV[c][1], sky, blk, f << 2, tints ? tints[f] : 0xFFFFFF); }
  }
  /** An arrow (or any item picture drawn corner to corner) along +y: two crossed squares turned 45°, both sides. */
  arrow(h, layer, sky, blk, unit, center) {
    const k = h * Math.SQRT2, UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
    for (const plane of [p => [p[0], p[1], 0], p => [0, p[1], p[0]]]) {
      const P = [[0, -k], [k, 0], [0, k], [-k, 0]].map(plane);
      for (let c = 0; c < 4; c++) this.v(P[c][0], P[c][1], P[c][2], unit, center, layer, UV[c][0], UV[c][1], sky, blk, 4 << 2);
      for (let c = 3; c >= 0; c--) this.v(P[c][0], P[c][1], P[c][2], unit, center, layer, UV[c][0], UV[c][1], sky, blk, 5 << 2);
    }
  }
  /** An item's flat picture (itemLook); a potion's bottle a little in front of and behind its liquid. */
  flatLook(h, look, sky, blk, unit, center) {
    this.flat(h, look.flat, sky, blk, unit, center, look.tint);
    if (look.over != null) for (const z of [0.012, -0.012]) this.flat(h, look.over, sky, blk, unit, center, 0xFFFFFF, z);
  }
  /** A flat square in the x–y plane (at z), both sides. */
  flat(h, layer, sky, blk, unit, center, tint = 0xFFFFFF, z = 0) {
    const P = [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z]], UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
    for (let c = 0; c < 4; c++) this.v(P[c][0], P[c][1], P[c][2], unit, center, layer, UV[c][0], UV[c][1], sky, blk, 4 << 2, tint);
    for (let c = 3; c >= 0; c--) this.v(P[c][0], P[c][1], P[c][2], unit, center, layer, UV[c][0], UV[c][1], sky, blk, 5 << 2, tint);
  }
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', {antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false});
    if (!gl) throw Error('这个浏览器不支持 WebGL2，玩不了方块世界');
    this.gl = gl; this.canvas = canvas;
    this.chunk = compile(gl, VS, FS); this.sky = compile(gl, SKY_VS, SKY_FS); this.quad = compile(gl, QUAD_VS, QUAD_FS); this.line = compile(gl, LINE_VS, LINE_FS); this.ent = compile(gl, ENT_VS, ENT_FS);
    this.entBuf = gl.createBuffer(); this.entVao = gl.createVertexArray();
    gl.bindVertexArray(this.entVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
    gl.bindVertexArray(null);
    this.sections = new Map(); this.indexCount = 0; this.index = gl.createBuffer();
    this.ensureIndex(1 << 16);
    this.dyn = this.makeVao(gl.createBuffer());
    this.lineBuf = gl.createBuffer(); this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    this.quadBuf = gl.createBuffer(); this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    this.skyVao = gl.createVertexArray();
    this.images = {};
    this.stats = {sections: 0, drawn: 0, tris: 0};
    // the plain programs; with 光影 the shaded ones take their place for the frame
    this.chunk0 = this.chunk; this.ent0 = this.ent; this.sky0 = this.sky; this.progs = {}; this.level = 'off'; this.lods = new Map(); this.frame = 0;
    this.lodBuf = null; this.targets = {}; this.fx = {};
    // float pictures to draw into (HDR); without them mid and high draw as before
    this.hdrOk = !!gl.getExtension('EXT_color_buffer_float');
    // the noise picture, kept on unit 7 for the shaded programs
    this.noise = gl.createTexture();
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, noisePicture());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
  }
  ensureIndex(quads) {
    if (quads <= this.indexCount) return;
    const gl = this.gl, n = Math.max(quads, this.indexCount * 2), idx = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) { const v = q * 4, i = q * 6; idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.indexCount = n;
    // every VAO keeps its element buffer binding: rebind
    for (const s of this.sections.values()) for (const part of [s.solid, s.trans]) if (part) { gl.bindVertexArray(part.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index); }
    if (this.dyn) { gl.bindVertexArray(this.dyn.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index); }
    if (this.entVao) { gl.bindVertexArray(this.entVao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index); }
    for (const t of this.lods?.values() || []) { gl.bindVertexArray(t.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index); }
    gl.bindVertexArray(null);
  }
  makeVao(buf) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0); gl.vertexAttribIPointer(0, 3, gl.UNSIGNED_SHORT, STRIDE, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_SHORT, STRIDE, 6);
    gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 2, gl.UNSIGNED_BYTE, STRIDE, 8);
    gl.enableVertexAttribArray(3); gl.vertexAttribIPointer(3, 2, gl.UNSIGNED_BYTE, STRIDE, 10);
    gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_BYTE, STRIDE, 12);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 3, gl.UNSIGNED_BYTE, true, STRIDE, 13);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
    gl.bindVertexArray(null);
    return {vao, buf};
  }
  /** The block textures: layers [{w, h, data: Uint8Array RGBA}] all of one size. */
  setTextures(size, layers) {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    const t = this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    const levels = Math.floor(Math.log2(size)) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, size, size, layers.length);
    layers.forEach((d, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, d));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, Math.min(levels - 1, 4));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.texSize = size;
  }
  /** Changes one layer (an animation frame). */
  updateLayer(i, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, this.texSize, this.texSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.mipDirty = true;
  }
  /** A 2D picture for the sky things (sun, moon, clouds). */
  setImage(name, source, {repeat = false, linear = false} = {}) {
    const gl = this.gl, t = this.images[name] || gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    this.images[name] = t;
  }
  /** A section's meshes from the worker (null to clear). */
  setSection(cx, sy, cz, solid, trans) {
    const gl = this.gl, k = `${cx},${sy},${cz}`;
    let s = this.sections.get(k);
    const put = (part, data) => {
      if (!data || !data.length) { if (part) { gl.deleteBuffer(part.buf); gl.deleteVertexArray(part.vao); } return null; }
      if (!part) part = this.makeVao(gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, part.buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      part.count = data.length / STRIDE / 4 * 6;
      this.ensureIndex(data.length / STRIDE / 4);
      return part;
    };
    if (!s) { if (!solid && !trans) return; s = {cx, sy, cz, solid: null, trans: null}; this.sections.set(k, s); }
    s.solid = put(s.solid, solid); s.trans = put(s.trans, trans);
    if (!s.solid && !s.trans) this.sections.delete(k);
  }
  dropColumn(cx, cz) { for (const [k, s] of this.sections) if (s.cx === cx && s.cz === cz) { this.setSection(s.cx, s.sy, s.cz, null, null); this.sections.delete(k); } }
  clearAll() { for (const s of [...this.sections.values()]) this.setSection(s.cx, s.sy, s.cz, null, null); this.sections.clear(); }

  resize(w, h) { this.canvas.width = w; this.canvas.height = h; }
  // ---------- 光影 ----------
  /**
   * 'off' | 'low' (shaded light, water, sky) | 'mid' (+ shadows, clouds, HDR: bloom, the water's mirror and depth,
   * bumps from the pictures, smoothed edges) | 'high' (+ softer shadows, thicker clouds, a longer mirror, edge shade,
   * light shafts).
   */
  setQuality(level) {
    const L = this.level = ['low', 'mid', 'high'].includes(level) ? level : 'off';
    this.shadowQ = {mid: 1, high: 2}[L] || 0;
    this.cloudQ = {mid: 1, high: 2}[L] || 0;
    this.hdr = this.hdrOk && (L === 'mid' || L === 'high');
    this.postOn = L === 'high';
    // edge shade samples (fewer on mid), light shafts from mid up
    this.fx = {gen: L === 'mid' || L === 'high' ? 1 : 0, ssr: L === 'high' ? 24 : 0, ao: {mid: 4, high: 8}[L] || 0, rays: {mid: 18, high: 28}[L] || 0, flare: L === 'mid' || L === 'high', bloom: {mid: 4, high: 5}[L] || 0};
  }
  prog(name, make) { return this.progs[name] ||= compile(this.gl, ...make()); }
  /** The lighting uniforms of a shaded program for this frame. */
  setLit(P, lit, view, {shadow = true} = {}) {
    const gl = this.gl, u = P.u;
    gl.uniform3fv(u.u_lightDir, lit.lightDir); gl.uniform3fv(u.u_lightCol, lit.lightCol); gl.uniform3fv(u.u_ambCol, lit.amb); gl.uniform3fv(u.u_blockCol, lit.block);
    gl.uniform3fv(u.u_sunTrue, lit.sunTrue); gl.uniform3fv(u.u_zenith, lit.zenith); gl.uniform3fv(u.u_horizon, lit.horizon); gl.uniform3fv(u.u_glowCol, lit.glow); gl.uniform3fv(u.u_fogLin, lit.fogLin);
    gl.uniform1f(u.u_exposure, lit.exposure); gl.uniform1f(u.u_fogDensity, lit.fogDensity); gl.uniform1f(u.u_fogFar, lit.fogFar); gl.uniform1f(u.u_underwater, lit.underwater);
    gl.uniform1f(u.u_flicker, lit.flicker); gl.uniform1f(u.u_bright, lit.bright);
    gl.uniform1f(u.u_rain, lit.rain); gl.uniform1f(u.u_eyeSky, lit.eyeSky); gl.uniform1f(u.u_camY, lit.camY); gl.uniform1f(u.u_held, lit.held); gl.uniform1f(u.u_time, lit.time); gl.uniform1f(u.u_cover, lit.cover);
    gl.uniform1f(u.u_aurora, lit.aurora); gl.uniform1f(u.u_flash, lit.flash);
    if (u.u_noise) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(u.u_noise, 7); gl.activeTexture(gl.TEXTURE0); }
    if (u.u_shadow) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shadowMap?.tex || null); gl.uniform1i(u.u_shadow, 2); gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(u.u_shadowOn, shadow && this.shadowLive ? 1 : 0); gl.uniform1f(u.u_texel, this.shadowMap ? 1 / this.shadowMap.size : 0);
      if (this.shadowMat) gl.uniformMatrix4fv(u.u_shadowMat, false, this.shadowMat);
    }
  }
  /**
   * The shadow map: the land near the camera seen from the light (an orthographic box round the camera, its grid held
   * still in the world so shadows do not crawl as one walks). Off when the light is low over the horizon.
   */
  drawShadow(view, lit) {
    const gl = this.gl, q = this.shadowQ, size = q >= 2 ? 2048 : 1024, R = q >= 2 ? 88 : 52, D = R + 96;
    const L = lit.lightDir;
    this.shadowLive = L[1] > 0.07 && (lit.lightCol[0] + lit.lightCol[1] + lit.lightCol[2]) > 0.05 && !lit.underwater;
    if (!this.shadowLive) return;
    if (!this.shadowMap || this.shadowMap.size !== size) {
      if (this.shadowMap) { gl.deleteTexture(this.shadowMap.tex); gl.deleteFramebuffer(this.shadowMap.fbo); }
      const tex = gl.createTexture(), fbo = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shadowMap = {tex, fbo, size};
    }
    // The map is drawn again only every few frames (each frame on high when moving fast): in between the last one is
    // used, looked up through where the camera is now. Drawn again at once when the camera has gone a way or the
    // light has turned.
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cam = [view.x, view.y, view.z], last = this.shadowAt;
    const due = !last || last.size !== size || this.frame - last.frame >= (q >= 2 ? 3 : 4) || Math.hypot(cam[0] - last.cam[0], cam[1] - last.cam[1], cam[2] - last.cam[2]) > 6 || 1 - dot(L, last.L) > 0.0004;
    if (due) {
      // the light's axes: f along the light's rays, r and u across; the grid snapped to whole texels of the world
      const f = [-L[0], -L[1], -L[2]], up = Math.abs(f[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
      const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nz = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
      const r = nz(cr(f, up)), u = cr(r, f), texel = 2 * R / size;
      this.shadowAt = {frame: this.frame, size, cam, L: [...L], r, u, f, R, D, lx: Math.round(dot(cam, r) / texel) * texel, ly: Math.round(dot(cam, u) / texel) * texel, lz: dot(cam, f)};
    }
    // from camera-relative places to the map: the map's world grid, moved by where the camera is now
    const s = this.shadowAt, {r, u, f} = s, fx = dot(cam, r) - s.lx, fy = dot(cam, u) - s.ly, fz = dot(cam, f) - s.lz;
    this.shadowMat = new Float32Array([r[0] / s.R, u[0] / s.R, f[0] / s.D, 0, r[1] / s.R, u[1] / s.R, f[1] / s.D, 0, r[2] / s.R, u[2] / s.R, f[2] / s.D, 0, fx / s.R, fy / s.R, fz / s.D, 1]);
    if (!due) return;
    const M = this.shadowMat, S = this.prog('shadow', shadowShaders);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowMap.fbo); gl.viewport(0, 0, size, size);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
    gl.useProgram(S.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(S.u.u_tex, 0);
    gl.uniformMatrix4fv(S.u.u_lightMat, false, M); gl.uniform3f(S.u.u_camera, view.x, view.y, view.z); gl.uniform1f(S.u.u_time, view.time); gl.uniform1f(S.u.u_wave, view.wave ? 1 : 0);
    for (const s of this.sections.values()) {
      if (!s.solid) continue;
      const ox = s.cx * 16 - view.x, oy = -64 + s.sy * 16 - view.y, oz = s.cz * 16 - view.z;
      if (Math.abs(ox + 8) > R + 24 || Math.abs(oz + 8) > R + 24 || oy > D || oy + 16 < -D) continue;
      gl.uniform3f(S.u.u_origin, ox, oy, oz); gl.bindVertexArray(s.solid.vao); gl.drawElements(gl.TRIANGLES, s.solid.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** A picture to draw into (made again when the size changes): colour of a format, a depth texture if asked. */
  target(name, W, H, {fmt = 'RGBA8', depth = false} = {}) {
    const gl = this.gl, old = this.targets[name];
    if (old && old.w === W && old.h === H) return old;
    if (old) { gl.deleteTexture(old.color); if (old.depth) gl.deleteTexture(old.depth); gl.deleteFramebuffer(old.fbo); }
    const tex = (format, filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, format, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const color = tex(gl[fmt], gl.LINEAR), dt = depth ? tex(gl.DEPTH_COMPONENT24, gl.NEAREST) : null, fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    if (dt) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dt, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { gl.deleteTexture(color); if (dt) gl.deleteTexture(dt); gl.deleteFramebuffer(fbo); delete this.targets[name]; return null; }
    return (this.targets[name] = {fbo, color, depth: dt, w: W, h: H});
  }
  /** Where the sun is on the screen, and how strong its shafts are (none when it is behind, set or hidden by rain). */
  sunShafts(vp, lit) {
    const d = lit.sunTrue, c = [0, 1, 2, 3].map(i => vp[i] * d[0] * 1000 + vp[4 + i] * d[1] * 1000 + vp[8 + i] * d[2] * 1000 + vp[12 + i]);
    if (!(c[3] > 0) || lit.underwater) return {uv: [0.5, 0.5], rays: 0};
    const uv = [c[0] / c[3] * 0.5 + 0.5, c[1] / c[3] * 0.5 + 0.5];
    return {uv, rays: (lit.day || 0) * (1 - lit.rain) * smooth(1.6, 0.6, Math.max(Math.abs(uv[0] - 0.5), Math.abs(uv[1] - 0.5)) * 2)};
  }
  /** Light shafts toward the sun where the sky shows through, and the soft dark edge; onto the canvas. */
  drawPost(vp, lit, W, H) {
    const gl = this.gl, P = this.prog('post', postShaders), fb = this.targets.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, fb.color); gl.uniform1i(P.u.u_color, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, fb.depth); gl.uniform1i(P.u.u_depth, 4);
    const {uv, rays} = this.sunShafts(vp, lit);
    gl.uniform2fv(P.u.u_sunUV, uv); gl.uniform1f(P.u.u_rays, rays * 0.42); gl.uniform3fv(P.u.u_rayCol, [1.0, 0.86, 0.62]);
    gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }
  /**
   * The end of an HDR frame, onto the screen: bloom (down a chain of half-size pictures and back up), then the
   * composite (edge shade, shafts, bloom, the film) into a display picture, then the edge smoothing onto the canvas.
   */
  finish(vp, lit, view, W, H) {
    const gl = this.gl, fx = this.fx, src = this.targets.hdr;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.bindVertexArray(this.skyVao);
    const bind = (unit, tex, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
    const levels = [];
    if (fx.bloom) {
      const D = this.prog('bloomDown', () => bloomShaders(false)), U = this.prog('bloomUp', () => bloomShaders(true));
      gl.useProgram(D.p);
      let w = W, h = H, from = src.color;
      for (let i = 0; i < fx.bloom && w > 8 && h > 8; i++) {
        const pw = w, ph = h; w >>= 1; h >>= 1;
        const t = this.target(`bloom${i}`, w, h, {fmt: 'RGBA16F'});
        if (!t) break;
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, w, h);
        bind(3, from, D.u.u_src); gl.uniform2f(D.u.u_px, 1 / pw, 1 / ph); gl.uniform1f(D.u.u_first, i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        levels.push(t); from = t.color;
      }
      gl.useProgram(U.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels.length - 1; i > 0; i--) {
        const a = levels[i], b = levels[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo); gl.viewport(0, 0, b.w, b.h);
        bind(3, a.color, U.u.u_src); gl.uniform2f(U.u.u_px, 1 / a.w, 1 / a.h); gl.uniform1f(U.u.u_weight, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    const C = this.prog(`composite${fx.ao}:${fx.rays}`, () => compositeShaders({ao: fx.ao, rays: fx.rays})), ldr = this.target('ldr', W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ldr ? ldr.fbo : null); gl.viewport(0, 0, W, H);
    gl.useProgram(C.p);
    bind(3, src.color, C.u.u_color); bind(4, src.depth, C.u.u_depth); bind(5, levels[0]?.color || src.color, C.u.u_bloom);
    const t = Math.tan(view.fov / 2), sun = this.sunShafts(vp, lit), shafts = fx.rays ? sun : {uv: sun.uv, rays: 0};
    gl.uniform2f(C.u.u_px, 1 / W, 1 / H); gl.uniform2f(C.u.u_tanHalf, t * W / H, t);
    gl.uniform1f(C.u.u_near, this.near); gl.uniform1f(C.u.u_far, this.far); gl.uniform1f(C.u.u_exposure, lit.exposure);
    gl.uniform1f(C.u.u_bloomAmt, levels.length ? 0.45 / levels.length : 0); gl.uniform1f(C.u.u_underwater, lit.underwater); gl.uniform1f(C.u.u_time, lit.time);
    gl.uniform2fv(C.u.u_sunUV, shafts.uv); gl.uniform1f(C.u.u_rays, shafts.rays * 0.5); gl.uniform3fv(C.u.u_rayCol, scale(lit.lightCol, 0.35));
    // the lens flare when the sun is in the picture (by day, not in rain; weaker toward the edge, as the shafts)
    gl.uniform1f(C.u.u_flare, fx.flare ? sun.rays : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (ldr) {
      const E = this.prog('edge', edgeShaders);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(E.p); bind(3, ldr.color, E.u.u_img); gl.uniform2f(E.u.u_px, 1 / W, 1 / H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // nothing of this frame's pictures left on a unit: the next frame draws into them (a unit holding one that a
    // program reads would make the draw fail)
    for (const unit of [3, 4, 5]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, null); }
    gl.activeTexture(gl.TEXTURE0);
  }
  // ---------- the distant view ----------
  /** A tile of the distant view from the worker (lod.js). */
  setLod(tx, tz, data, quads) {
    const gl = this.gl, k = `${tx},${tz}`;
    let t = this.lods.get(k);
    if (!t) {
      const buf = gl.createBuffer(), vao = gl.createVertexArray();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, LOD_STRIDE, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_BYTE, LOD_STRIDE, 12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index);
      gl.bindVertexArray(null);
      t = {tx, tz, buf, vao}; this.lods.set(k, t);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, t.buf); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(data), gl.STATIC_DRAW);
    t.count = quads * 6; this.ensureIndex(quads);
  }
  dropLod(tx, tz) { const t = this.lods.get(`${tx},${tz}`); if (t) { this.gl.deleteBuffer(t.buf); this.gl.deleteVertexArray(t.vao); this.lods.delete(`${tx},${tz}`); } }
  clearLod() { for (const t of [...this.lods.values()]) this.dropLod(t.tx, t.tz); }
  drawLod(view, vp, planes, lit) {
    if (!this.lods.size) return 0;
    const gl = this.gl, hdr = this.frameHdr ? 1 : 0, P = this.prog(`lod${hdr}`, () => lodShaders({hdr}));
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_viewProj, false, vp); this.setLit(P, lit, view);
    gl.uniform1f(P.u.u_inner, view.lodInner || 0); gl.uniform1f(P.u.u_plain, 0);
    gl.enable(gl.CULL_FACE);
    let n = 0;
    for (const t of this.lods.values()) {
      const ox = t.tx * LOD_TILE - view.x, oz = t.tz * LOD_TILE - view.z;
      if (!t.count || !boxVisible(planes, ox, -64 - view.y, oz, ox + LOD_TILE, 320 - view.y, oz + LOD_TILE)) continue;
      gl.uniform3f(P.u.u_origin, ox, -view.y, oz); gl.bindVertexArray(t.vao); gl.drawElements(gl.TRIANGLES, t.count, gl.UNSIGNED_INT, 0);
      n += t.count / 3;
    }
    return n;
  }
  /**
   * One frame. view: {x, y, z (eye), yaw, pitch, fov, far}, env: {daylight, skyTop, horizon, fog, sunAngle, stars, glow,
   * glowAmt, skyLight, flicker, gamma, underwater, cloudShift, time, wave}, extras: {outline, crack, items, particles, hand}.
   */
  draw(view, env, extras = {}) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height, shaded = this.level !== 'off';
    this.frame++;
    const lit = this.lit = shaded || this.lods.size ? lighting(env, view) : null;
    // HDR (mid, high): into a float picture, finished at the end; it falls back to the plain way if the picture can't be made
    const target = shaded && this.hdr ? this.target('hdr', W, H, {fmt: 'RGBA16F', depth: true}) : null;
    if (shaded && this.hdr && !target) { this.hdrOk = false; this.setQuality(this.level); }
    const hdr = this.frameHdr = !!target, fx = this.fx;
    // with 光影 the shaded programs stand in for the plain ones (the helpers below use whichever is set)
    const opts = {shadows: this.shadowQ, hdr: hdr ? 1 : 0, gen: fx.gen || 0, ssr: hdr ? fx.ssr : 0, clouds: this.cloudQ}, key = Object.values(opts).join(':');
    this.chunk = shaded ? this.prog(`chunk:${key}`, () => chunkShaders(opts)) : this.chunk0;
    this.ent = shaded ? this.prog(`ent:${opts.shadows}:${opts.hdr}`, () => entityShaders(opts)) : this.ent0;
    this.sky = shaded ? this.prog(`sky:${opts.clouds}:${opts.hdr}`, () => skyShaders(opts)) : this.sky0;
    this.shadowLive = false;
    if (shaded && this.shadowQ && !env.nether) this.drawShadow({...view, time: env.time, wave: env.wave}, lit);
    const post = !hdr && shaded && this.postOn && this.target('post', W, H, {depth: true});
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : post ? post.fbo : null);
    gl.viewport(0, 0, W, H);
    this.near = 0.05; this.far = Math.max(view.far * 1.2 + 64, (view.lodFar || 0) + 64);
    const proj = mat.perspective(view.fov, W / H, this.near, this.far), rot = mat.view(view.yaw, view.pitch), vp = mat.mul(proj, rot);
    this.vp = vp; this.view = view;
    gl.disable(gl.BLEND); gl.depthMask(true);
    const clear = hdr ? lit.fogLin : env.fog;
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // the sky: first in the plain way; with HDR after the land, only where nothing was drawn
    const sky = () => {
      if (env.underwater) return;
      gl.useProgram(this.sky.p);
      gl.uniformMatrix4fv(this.sky.u.u_invViewProj, false, mat.invert(vp));
      gl.uniform3fv(this.sky.u.u_top, env.skyTop); gl.uniform3fv(this.sky.u.u_horizon, env.horizon); gl.uniform3fv(this.sky.u.u_glow, env.glow);
      gl.uniform3fv(this.sky.u.u_sunDir, env.sunDir); gl.uniform1f(this.sky.u.u_stars, env.stars); gl.uniform1f(this.sky.u.u_glowAmt, env.glowAmt);
      if (shaded) { this.setLit(this.sky, lit, view); gl.uniform3f(this.sky.u.u_camPos, view.x, view.y, view.z); gl.uniform3fv(this.sky.u.u_sunDisc, lit.sunDisc); }
      gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.drawSunMoon(vp, env, hdr);
    };
    if (!hdr) { gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); sky(); }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    // world
    const P = this.chunk;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    if (this.mipDirty) { gl.generateMipmap(gl.TEXTURE_2D_ARRAY); this.mipDirty = false; }
    gl.uniform1i(P.u.u_tex, 0);
    // the water's look behind (HDR) on units of their own: left at 0 they would clash with the block pictures there
    if (P.u.u_scene) { gl.uniform1i(P.u.u_scene, 5); gl.uniform1i(P.u.u_sceneDepth, 6); }
    gl.uniformMatrix4fv(P.u.u_viewProj, false, vp); gl.uniformMatrix4fv(P.u.u_model, false, mat.identity());
    gl.uniform3f(P.u.u_camera, view.x, view.y, view.z);
    gl.uniform1f(P.u.u_unit, 16); gl.uniform1f(P.u.u_center, 1); gl.uniform1f(P.u.u_time, env.time); gl.uniform1f(P.u.u_wave, env.wave ? 1 : 0);
    gl.uniform1f(P.u.u_daylight, env.daylight); gl.uniform1f(P.u.u_gamma, env.gamma); gl.uniform1f(P.u.u_flicker, env.flicker); gl.uniform1f(P.u.u_bright, env.bright || 0);
    gl.uniform3fv(P.u.u_skyLight, env.skyLight); gl.uniform3fv(P.u.u_fog, env.fog);
    // the Nether's thick fog: from a twentieth of the view out to half of it, as the game draws it — but never thicker
    // than 56 blocks (the game's view is longer than a phone's, and half of a short one is a wall)
    const fogFar = env.underwater ? 18 : env.nether ? Math.min(view.far, Math.max(56, Math.min(view.far, 192) * 0.5)) : view.far, fogNear = env.underwater ? 1 : env.nether ? view.far * 0.05 : view.far * 0.72;
    gl.uniform1f(P.u.u_fogNear, fogNear); gl.uniform1f(P.u.u_fogFar, fogFar);
    gl.uniform1f(P.u.u_overlay, 0); gl.uniform1f(P.u.u_alpha, 1); gl.uniform1f(P.u.u_cut, 0.5); gl.uniform1f(P.u.u_texSize, this.texSize || 16); gl.uniform1f(P.u.u_behind, 0);
    // where the player stands (relative to the camera): grass and flowers lean away
    const pl = env.player || [view.x, view.y - 1.62, view.z];
    gl.uniform3f(P.u.u_player, pl[0] - view.x, pl[1] - view.y, pl[2] - view.z);
    // the plain look with the distant view: the near land fades over the whole way out
    if (!shaded && view.lodFar && !env.underwater && !env.nether) { gl.uniform1f(P.u.u_fogNear, view.lodFar * 0.3); gl.uniform1f(P.u.u_fogFar, view.lodFar); }
    if (shaded) this.setLit(P, lit, view);
    // visible sections, near to far
    const planes = frustum(vp), list = [];
    for (const s of this.sections.values()) {
      const ox = s.cx * 16 - view.x, oy = -64 + s.sy * 16 - view.y, oz = s.cz * 16 - view.z;
      const dx = ox + 8, dz = oz + 8;
      const d2 = dx * dx + dz * dz;
      if (d2 > (view.far + 24) ** 2) continue;
      if (!boxVisible(planes, ox, oy, oz, ox + 16, oy + 16, oz + 16)) continue;
      list.push([d2 + (oy + 8) ** 2, s, ox, oy, oz]);
    }
    list.sort((a, b) => a[0] - b[0]);
    let tris = 0;
    for (const [, s, ox, oy, oz] of list) if (s.solid) { gl.uniform3f(P.u.u_origin, ox, oy, oz); gl.bindVertexArray(s.solid.vao); gl.drawElements(gl.TRIANGLES, s.solid.count, gl.UNSIGNED_INT, 0); tris += s.solid.count / 3; }
    // the distant view past the columns
    if (lit && this.lods.size && !env.nether) { tris += this.drawLod(view, vp, planes, lit); gl.useProgram(P.p); }
    // things in the world (dropped items, the cracks, particles)
    if (extras.crack) this.drawCrack(extras.crack, view);
    if (extras.things) this.drawThings(extras.things, view);
    if (extras.mobs?.length) this.drawMobs(extras.mobs, vp, env, fogNear, fogFar);
    if (hdr) { gl.depthMask(false); gl.disable(gl.CULL_FACE); sky(); gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
    // water and ice, far to near; with HDR the land as it is now is copied first, for the water to look into
    gl.useProgram(P.p);
    if (hdr && list.some(e => e[1].trans)) {
      const b = this.target('behind', W, H, {fmt: 'RGBA16F', depth: true});
      if (b) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, b.fbo);
        gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, b.color); gl.uniform1i(P.u.u_scene, 5);
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, b.depth); gl.uniform1i(P.u.u_sceneDepth, 6);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(P.u.u_screen, W, H); gl.uniform1f(P.u.u_near, this.near); gl.uniform1f(P.u.u_far, this.far); gl.uniform1f(P.u.u_behind, 1);
      }
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.uniform1f(P.u.u_cut, 0.01); gl.uniformMatrix4fv(P.u.u_model, false, mat.identity()); gl.uniform1f(P.u.u_unit, 16); gl.uniform1f(P.u.u_center, 1);
    gl.disable(gl.CULL_FACE);
    for (let i = list.length - 1; i >= 0; i--) { const [, s, ox, oy, oz] = list[i]; if (s.trans) { gl.uniform3f(P.u.u_origin, ox, oy, oz); gl.bindVertexArray(s.trans.vao); gl.drawElements(gl.TRIANGLES, s.trans.count, gl.UNSIGNED_INT, 0); tris += s.trans.count / 3; } }
    // rain or snow: see-through streaks round the camera
    // with 光影 the streaks are lit like everything else: fainter, or they hang in the air like a curtain
    if (extras.weather?.n) this.drawVerts(extras.weather, {origin: [0, 0, 0], unit: 256, center: 128, cut: 0.01, alpha: shaded ? 0.4 : 1});
    gl.depthMask(true);
    // clouds
    if (env.clouds && this.images.clouds && !(shaded && this.cloudQ)) this.drawClouds(vp, view, env, fogNear, fogFar);
    if (extras.outline) this.drawOutline(extras.outline, view, vp);
    if (extras.lines) this.drawLines(extras.lines, vp);
    if (hdr) {
      gl.disable(gl.BLEND);
      this.finish(vp, lit, view, W, H);
      if (extras.hand) { gl.enable(gl.DEPTH_TEST); this.drawHand(extras.hand, view, env); }
    } else {
      if (extras.hand) this.drawHand(extras.hand, view, env);
      gl.disable(gl.BLEND);
      if (post) this.drawPost(vp, lit, W, H);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.stats = {sections: this.sections.size, drawn: list.length, tris: Math.round(tris)};
  }
  drawSunMoon(vp, env, hdr = false) {
    const gl = this.gl, Q = this.quad;
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.u_viewProj, false, vp); gl.uniform1f(Q.u.u_mode, 0);
    gl.uniform1f(Q.u.u_back, hdr ? 1 : 0); gl.uniform1f(Q.u.u_gain, hdr ? 2.5 : 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const a = env.sunAngle, put = (dir, size, img, uv, color) => {
      if (!this.images[img]) return;
      // a square facing the camera's centre along dir, 100 blocks away
      const [dx, dy, dz] = dir, c = [dx * 100, dy * 100, dz * 100];
      const u = Math.abs(dz) > 0.9 ? [1, 0, 0] : [0, 0, 1], w = [dy * u[2] - dz * u[1], dz * u[0] - dx * u[2], dx * u[1] - dy * u[0]];
      const wl = Math.hypot(...w) || 1, ww = w.map(q => q / wl * size), uu = u.map(q => q * size);
      const p = k => [c[0] + ww[0] * k[0] + uu[0] * k[1], c[1] + ww[1] * k[0] + uu[1] * k[1], c[2] + ww[2] * k[0] + uu[2] * k[1]];
      const [u0, v0, u1, v1] = uv, pts = [p([-1, -1]), p([1, -1]), p([1, 1]), p([-1, 1])], uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const data = new Float32Array([0, 1, 2, 0, 2, 3].flatMap(i => [...pts[i], ...uvs[i]]));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.images[img]); gl.uniform1i(Q.u.u_img, 1);
      gl.uniform4fv(Q.u.u_color, color);
      gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const lean = this.level !== 'off' ? SUN_TILT : 0, sun = [Math.cos(a), Math.sin(a) * Math.cos(lean), Math.sin(a) * Math.sin(lean)], moon = sun.map(v => -v);
    // hidden behind the rain clouds as it rains
    const seen = env.sunMoon ?? 1;
    if (seen <= 0.02) { gl.disable(gl.BLEND); return; }
    // with 光影 the sky already glows round the sun: its picture smaller and softer, or it is a white wall
    if (!hdr) put(sun, lean ? 9 : 18, 'sun', [0, 0, 1, 1], lean ? [1, 0.92, 0.8, seen * 0.6] : [1, 1, 1, seen]);
    const ph = env.moonPhase || 0, mu = (ph % 4) / 4, mv = Math.floor(ph / 4) / 2;
    put(moon, 12, 'moon', [mu, mv, mu + 0.25, mv + 0.5], [1, 1, 1, seen]);
    gl.disable(gl.BLEND); gl.uniform1f(Q.u.u_back, 0); gl.uniform1f(Q.u.u_gain, 0);
  }
  drawClouds(vp, view, env, fogNear, fogFar) {
    const gl = this.gl, Q = this.quad, y = 192.5 - view.y, R = Math.max(view.far * 2, 256);
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.u_viewProj, false, vp); gl.uniform1f(Q.u.u_mode, 1); gl.uniform1f(Q.u.u_back, 0); gl.uniform1f(Q.u.u_gain, 0);
    gl.uniform1f(Q.u.u_fogNear, fogNear * 1.4); gl.uniform1f(Q.u.u_fogFar, R); gl.uniform3fv(Q.u.u_fog, env.fog);
    const scale = 1 / (12 * 256), sx = (view.x + env.cloudShift) * scale, sz = view.z * scale;
    gl.uniform2f(Q.u.u_shift, sx, sz);
    const c = env.cloudColor;
    gl.uniform4f(Q.u.u_color, c[0], c[1], c[2], 0.8);
    const u = R * scale, data = new Float32Array([-R, y, -R, -u, -u, R, y, -R, u, -u, R, y, R, u, u, -R, y, -R, -u, -u, R, y, R, u, u, -R, y, R, -u, u]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.images.clouds); gl.uniform1i(Q.u.u_img, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
  }
  drawOutline(box, view, vp) {
    const gl = this.gl, L = this.line, e = 0.002;
    const pts = [];
    for (const [x0, y0, z0, x1, y1, z1] of box.boxes) {
      const a = [x0 - e - view.x, y0 - e - view.y, z0 - e - view.z], b = [x1 + e - view.x, y1 + e - view.y, z1 + e - view.z];
      const c = (i, j, k) => [i ? b[0] : a[0], j ? b[1] : a[1], k ? b[2] : a[2]];
      for (const [p, q] of [[[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 1, 0]], [[0, 0, 0], [0, 0, 1]], [[1, 1, 1], [0, 1, 1]], [[1, 1, 1], [1, 0, 1]], [[1, 1, 1], [1, 1, 0]],
        [[1, 0, 0], [1, 1, 0]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [1, 1, 0]], [[0, 1, 0], [0, 1, 1]], [[0, 0, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1]]]) pts.push(...c(...p), ...c(...q));
    }
    gl.useProgram(L.p); gl.uniformMatrix4fv(L.u.u_viewProj, false, vp); gl.uniform4f(L.u.u_color, 0, 0, 0, 0.55);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(this.lineVao); gl.drawArrays(gl.LINES, 0, pts.length / 3);
  }
  /** Lines (a fishing line): {pts: [x, y, z, …] in pairs, relative to the camera, color: [r, g, b, a]}. */
  drawLines(lines, vp) {
    const gl = this.gl, L = this.line;
    gl.useProgram(L.p); gl.uniformMatrix4fv(L.u.u_viewProj, false, vp); gl.uniform4fv(L.u.u_color, lines.color);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines.pts), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(this.lineVao); gl.drawArrays(gl.LINES, 0, lines.pts.length / 3);
  }
  /** Draws vertices built on the page (a Verts) with a model matrix at a place (relative to the camera). */
  drawVerts(verts, {origin, model = mat.identity(), unit = 256, center = 32, cut = 0.5, overlay = false, alpha = 1}) {
    const gl = this.gl, P = this.chunk;
    if (!verts.n) return;
    gl.useProgram(P.p);
    gl.uniform3f(P.u.u_origin, origin[0], origin[1], origin[2]); gl.uniformMatrix4fv(P.u.u_model, false, model);
    gl.uniform1f(P.u.u_unit, unit); gl.uniform1f(P.u.u_center, center); gl.uniform1f(P.u.u_cut, cut); gl.uniform1f(P.u.u_overlay, overlay ? 1 : 0); gl.uniform1f(P.u.u_alpha, alpha);
    gl.uniform1f(P.u.u_wave, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.buf); gl.bufferData(gl.ARRAY_BUFFER, verts.u8.subarray(0, verts.n * STRIDE), gl.STREAM_DRAW);
    this.ensureIndex(verts.n / 4);
    gl.bindVertexArray(this.dyn.vao); gl.drawElements(gl.TRIANGLES, verts.n / 4 * 6, gl.UNSIGNED_INT, 0);
  }
  drawCrack(c, view) {
    const gl = this.gl;
    gl.enable(gl.BLEND); gl.blendFunc(gl.DST_COLOR, gl.SRC_COLOR); gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -1);
    const v = (this._crack ||= new Verts(64)).reset();
    v.cube(0.5, [c.layer, c.layer, c.layer, c.layer, c.layer, c.layer], 255, 255, 256, 32);
    this.drawVerts(v, {origin: [c.x + 0.5 - view.x, c.y + 0.5 - view.y, c.z + 0.5 - view.z], overlay: true, cut: 0.01, model: mat.model(1.004)});
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.uniform1f(this.chunk.u.u_overlay, 0);
  }
  /** things: [{verts, x, y, z, model, bright, center}] in world coordinates (center: what the verts were built with). */
  drawThings(things, view) {
    const gl = this.gl;
    for (const t of things) {
      if (t.bright) { gl.useProgram(this.chunk.p); gl.uniform1f(this.chunk.u.u_bright, t.bright); }
      this.drawVerts(t.verts, {origin: [t.x - view.x, t.y - view.y, t.z - view.z], model: t.model, cut: 0.5, center: t.center || 32});
      if (t.bright) gl.uniform1f(this.chunk.u.u_bright, 0);
    }
    gl.uniformMatrix4fv(this.chunk.u.u_model, false, mat.identity());
  }
  /** Mobs: [{skin, verts (x, y, z, u, v, shade; relative to the camera), light: [sky, block], tint, hurt, white}]. */
  drawMobs(list, vp, env, fogNear, fogFar) {
    const gl = this.gl, E = this.ent;
    gl.useProgram(E.p); gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(E.u.u_viewProj, false, vp);
    gl.uniform1f(E.u.u_daylight, env.daylight); gl.uniform1f(E.u.u_gamma, env.gamma); gl.uniform1f(E.u.u_flicker, env.flicker); gl.uniform1f(E.u.u_bright, env.bright || 0);
    gl.uniform3fv(E.u.u_skyLight, env.skyLight); gl.uniform3fv(E.u.u_fog, env.fog); gl.uniform1f(E.u.u_fogNear, fogNear); gl.uniform1f(E.u.u_fogFar, fogFar);
    if (this.lit && this.level !== 'off') this.setLit(E, this.lit, this.view);
    gl.activeTexture(gl.TEXTURE1); gl.uniform1i(E.u.u_img, 1);
    gl.bindVertexArray(this.entVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.entBuf);
    for (const m of list) {
      const img = this.images[`mob:${m.skin}`];
      if (!img || !m.verts.length) continue;
      gl.bindTexture(gl.TEXTURE_2D, img);
      gl.uniform2f(E.u.u_light, m.light[0], m.light[1]); gl.uniform3fv(E.u.u_tint, m.tint); gl.uniform1f(E.u.u_hurt, m.hurt); gl.uniform1f(E.u.u_white, m.white);
      gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STREAM_DRAW);
      const quads = m.verts.length / 24;
      this.ensureIndex(quads);
      gl.bindVertexArray(this.entVao);
      gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_INT, 0);
    }
    gl.enable(gl.CULL_FACE);
    gl.useProgram(this.chunk.p);
  }
  /** What is in the hand, drawn over the world with its own view. */
  drawHand(h, view, env) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height, shaded = this.level !== 'off' && this.lit;
    const P = shaded ? this.prog('chunk:hand', () => chunkShaders({})) : this.chunk;
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    const proj = mat.perspective(70 * Math.PI / 180, W / H, 0.05, 10);
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_viewProj, false, proj); gl.uniform1f(P.u.u_fogNear, 1000); gl.uniform1f(P.u.u_fogFar, 2000);
    if (shaded) {
      this.setLit(P, this.lit, view);
      gl.uniform1f(P.u.u_fogDensity, 0); gl.uniform1f(P.u.u_fogFar, 1e5); gl.uniform1f(P.u.u_underwater, 0); gl.uniform1f(P.u.u_rain, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex); gl.uniform1i(P.u.u_tex, 0);
      gl.uniform3f(P.u.u_camera, view.x, view.y, view.z); gl.uniform1f(P.u.u_texSize, this.texSize || 16);
    }
    const was = this.chunk;
    this.chunk = P;
    this.drawVerts(h.verts, {origin: [0, 0, 0], model: h.model, cut: 0.5});
    this.chunk = was;
  }
}

function frustum(m) {
  const p = [];
  for (const [a, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const x = m[3] + s * m[a], y = m[7] + s * m[4 + a], z = m[11] + s * m[8 + a], w = m[15] + s * m[12 + a], l = Math.hypot(x, y, z);
    p.push([x / l, y / l, z / l, w / l]);
  }
  return p;
}
function boxVisible(planes, x0, y0, z0, x1, y1, z1) {
  for (const [a, b, c, d] of planes) if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + d < 0) return false;
  return true;
}
