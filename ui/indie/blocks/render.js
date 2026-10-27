// Drawing with WebGL2: the world's sections (solid and cut-out first, near to far; water and ice after, far to near),
// the sky (colour by the hour, sun, moon, stars), clouds, fog, the outline of the block aimed at and its cracks,
// dropped items, particles and what the player holds. Everything is drawn relative to the camera so far-away places
// keep their precision. All meshes share one vertex layout (mesh.js): positions are 16-bit numbers that the shader
// divides by u_unit and moves by u_center, so chunks (1/16 block) and small things (1/256) use the same program.
import {STRIDE} from './mesh.js';

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
out vec2 v_uv; out float v_dist;
void main() { gl_Position = u_viewProj * vec4(a_pos, 1.0); v_uv = a_uv; v_dist = length(a_pos); }`;
const QUAD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform vec4 u_color; uniform float u_mode, u_fogNear, u_fogFar; uniform vec3 u_fog; uniform vec2 u_shift;
in vec2 v_uv; in float v_dist; out vec4 o;
void main() {
  if (u_mode < 0.5) { vec4 t = texture(u_img, v_uv); o = vec4(t.rgb * u_color.rgb, t.a * u_color.a); if (o.a < 0.01) discard; return; }
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
uniform float u_daylight, u_gamma, u_flicker, u_fogNear, u_fogFar, u_hurt, u_white;
uniform vec3 u_skyLight, u_fog, u_tint;
in vec2 v_uv; in float v_shade; in float v_dist; out vec4 o;
float curve(float l) { float x = clamp(l / 15.0, 0.0, 1.0); float b = x / (4.0 - 3.0 * x); return mix(b, 1.0 - pow(1.0 - b, 4.0), u_gamma); }
void main() {
  vec4 c = texture(u_img, v_uv);
  if (c.a < 0.1) discard;
  float sky = max(u_light.x - (1.0 - u_daylight) * 11.0, 0.0);
  vec3 light = clamp(curve(sky) * u_skyLight + curve(u_light.y) * vec3(1.0, 0.86, 0.68) * u_flicker + 0.05, 0.0, 1.0);
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

// ---------- small matrix helpers (column-major, like WebGL) ----------
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
  /** A flat square in the x–y plane, both sides. */
  flat(h, layer, sky, blk, unit, center, tint = 0xFFFFFF) {
    const P = [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]], UV = [[0, 16], [16, 16], [16, 0], [0, 0]];
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
  /**
   * One frame. view: {x, y, z (eye), yaw, pitch, fov, far}, env: {daylight, skyTop, horizon, fog, sunAngle, stars, glow,
   * glowAmt, skyLight, flicker, gamma, underwater, cloudShift, time, wave}, extras: {outline, crack, items, particles, hand}.
   */
  draw(view, env, extras = {}) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const proj = mat.perspective(view.fov, W / H, 0.05, view.far * 1.2 + 64), rot = mat.view(view.yaw, view.pitch), vp = mat.mul(proj, rot);
    this.vp = vp;
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    if (!env.underwater) {
      gl.useProgram(this.sky.p);
      gl.uniformMatrix4fv(this.sky.u.u_invViewProj, false, mat.invert(vp));
      gl.uniform3fv(this.sky.u.u_top, env.skyTop); gl.uniform3fv(this.sky.u.u_horizon, env.horizon); gl.uniform3fv(this.sky.u.u_glow, env.glow);
      gl.uniform3fv(this.sky.u.u_sunDir, env.sunDir); gl.uniform1f(this.sky.u.u_stars, env.stars); gl.uniform1f(this.sky.u.u_glowAmt, env.glowAmt);
      gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.drawSunMoon(vp, env);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    // world
    const P = this.chunk;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    if (this.mipDirty) { gl.generateMipmap(gl.TEXTURE_2D_ARRAY); this.mipDirty = false; }
    gl.uniform1i(P.u.u_tex, 0);
    gl.uniformMatrix4fv(P.u.u_viewProj, false, vp); gl.uniformMatrix4fv(P.u.u_model, false, mat.identity());
    gl.uniform3f(P.u.u_camera, view.x, view.y, view.z);
    gl.uniform1f(P.u.u_unit, 16); gl.uniform1f(P.u.u_center, 1); gl.uniform1f(P.u.u_time, env.time); gl.uniform1f(P.u.u_wave, env.wave ? 1 : 0);
    gl.uniform1f(P.u.u_daylight, env.daylight); gl.uniform1f(P.u.u_gamma, env.gamma); gl.uniform1f(P.u.u_flicker, env.flicker); gl.uniform1f(P.u.u_bright, env.bright || 0);
    gl.uniform3fv(P.u.u_skyLight, env.skyLight); gl.uniform3fv(P.u.u_fog, env.fog);
    const fogFar = env.underwater ? 18 : view.far, fogNear = env.underwater ? 1 : view.far * 0.72;
    gl.uniform1f(P.u.u_fogNear, fogNear); gl.uniform1f(P.u.u_fogFar, fogFar);
    gl.uniform1f(P.u.u_overlay, 0); gl.uniform1f(P.u.u_alpha, 1); gl.uniform1f(P.u.u_cut, 0.5);
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
    // things in the world (dropped items, the cracks, particles)
    if (extras.crack) this.drawCrack(extras.crack, view);
    if (extras.things) this.drawThings(extras.things, view);
    if (extras.mobs?.length) this.drawMobs(extras.mobs, vp, env, fogNear, fogFar);
    // water and ice, far to near
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(P.p); gl.uniform1f(P.u.u_cut, 0.01); gl.uniformMatrix4fv(P.u.u_model, false, mat.identity()); gl.uniform1f(P.u.u_unit, 16); gl.uniform1f(P.u.u_center, 1);
    gl.disable(gl.CULL_FACE);
    for (let i = list.length - 1; i >= 0; i--) { const [, s, ox, oy, oz] = list[i]; if (s.trans) { gl.uniform3f(P.u.u_origin, ox, oy, oz); gl.bindVertexArray(s.trans.vao); gl.drawElements(gl.TRIANGLES, s.trans.count, gl.UNSIGNED_INT, 0); tris += s.trans.count / 3; } }
    // rain or snow: see-through streaks round the camera
    if (extras.weather?.n) this.drawVerts(extras.weather, {origin: [0, 0, 0], unit: 256, center: 128, cut: 0.01});
    gl.depthMask(true);
    // clouds
    if (env.clouds && this.images.clouds) this.drawClouds(vp, view, env, fogNear, fogFar);
    if (extras.outline) this.drawOutline(extras.outline, view, vp);
    if (extras.hand) this.drawHand(extras.hand, view, env);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    this.stats = {sections: this.sections.size, drawn: list.length, tris: Math.round(tris)};
  }
  drawSunMoon(vp, env) {
    const gl = this.gl, Q = this.quad;
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.u_viewProj, false, vp); gl.uniform1f(Q.u.u_mode, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const a = env.sunAngle, put = (dir, size, img, uv, color) => {
      if (!this.images[img]) return;
      // a square facing the camera's centre along dir, 100 blocks away
      const [dx, dy, dz] = dir, c = [dx * 100, dy * 100, dz * 100];
      const u = [0, 0, 1], w = [dy * u[2] - dz * u[1], dz * u[0] - dx * u[2], dx * u[1] - dy * u[0]];
      const wl = Math.hypot(...w) || 1, ww = w.map(q => q / wl * size), uu = u.map(q => q * size);
      const p = k => [c[0] + ww[0] * k[0] + uu[0] * k[1], c[1] + ww[1] * k[0] + uu[1] * k[1], c[2] + ww[2] * k[0] + uu[2] * k[1]];
      const [u0, v0, u1, v1] = uv, pts = [p([-1, -1]), p([1, -1]), p([1, 1]), p([-1, 1])], uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const data = new Float32Array([0, 1, 2, 0, 2, 3].flatMap(i => [...pts[i], ...uvs[i]]));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.images[img]); gl.uniform1i(Q.u.u_img, 1);
      gl.uniform4fv(Q.u.u_color, color);
      gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const sun = [Math.cos(a), Math.sin(a), 0], moon = [-sun[0], -sun[1], 0];
    // hidden behind the rain clouds as it rains
    const seen = env.sunMoon ?? 1;
    if (seen <= 0.02) { gl.disable(gl.BLEND); return; }
    put(sun, 18, 'sun', [0, 0, 1, 1], [1, 1, 1, seen]);
    const ph = env.moonPhase || 0, mu = (ph % 4) / 4, mv = Math.floor(ph / 4) / 2;
    put(moon, 12, 'moon', [mu, mv, mu + 0.25, mv + 0.5], [1, 1, 1, seen]);
    gl.disable(gl.BLEND);
  }
  drawClouds(vp, view, env, fogNear, fogFar) {
    const gl = this.gl, Q = this.quad, y = 192.5 - view.y, R = Math.max(view.far * 2, 256);
    gl.useProgram(Q.p); gl.uniformMatrix4fv(Q.u.u_viewProj, false, vp); gl.uniform1f(Q.u.u_mode, 1);
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
    gl.uniform1f(E.u.u_daylight, env.daylight); gl.uniform1f(E.u.u_gamma, env.gamma); gl.uniform1f(E.u.u_flicker, env.flicker);
    gl.uniform3fv(E.u.u_skyLight, env.skyLight); gl.uniform3fv(E.u.u_fog, env.fog); gl.uniform1f(E.u.u_fogNear, fogNear); gl.uniform1f(E.u.u_fogFar, fogFar);
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
    const gl = this.gl, P = this.chunk, W = this.canvas.width, H = this.canvas.height;
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    const proj = mat.perspective(70 * Math.PI / 180, W / H, 0.05, 10);
    gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_viewProj, false, proj); gl.uniform1f(P.u.u_fogNear, 1000); gl.uniform1f(P.u.u_fogFar, 2000);
    this.drawVerts(h.verts, {origin: [0, 0, 0], model: h.model, cut: 0.5});
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
