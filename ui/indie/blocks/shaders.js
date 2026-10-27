// The shaded look (光影), in the spirit of the game's shader packs: sunlight with real shadows (a shadow map from the sun,
// or the moon at night, softened), sky light and block light in colour, a filmic tone curve, air that fades the land
// into the sky's own colour, water that ripples and mirrors the sky and the sun, a sky with a glow round the sun,
// soft clouds, light shafts. Each piece comes in by quality: low (the lighting, the water, the sky), mid (+ shadows,
// clouds), high (+ softer shadows, light shafts). render.js builds the programs from these.

// lighting shared by everything shaded: colours are linear (sRGB squared), lit, then tone-mapped back
const LIGHT = `
uniform vec3 u_lightDir, u_lightCol, u_ambCol, u_blockCol, u_sunTrue, u_zenith, u_horizon, u_glowCol, u_fogLin;
uniform float u_exposure, u_fogDensity, u_fogFar, u_underwater, u_flicker, u_bright;
vec3 lin(vec3 c) { return c * c; }
vec3 aces(vec3 x) { x *= u_exposure; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 display(vec3 c) { return sqrt(aces(c)); }
// the sky's colour along a direction: horizon to zenith, a glow round the sun, darker under the horizon
vec3 skyCol(vec3 d) {
  float y = d.y;
  vec3 c = mix(u_horizon, u_zenith, pow(clamp(y, 0.0, 1.0), 0.5));
  float s = max(dot(d, u_sunTrue), 0.0);
  c += u_glowCol * (pow(s, 5.0) * 0.45 + pow(s, 40.0) * 1.6) * (1.0 - 0.5 * clamp(y, 0.0, 1.0));
  return mix(c, u_horizon * 0.45, smoothstep(0.0, -0.35, y));
}
// the air: thin near, thick far (squared), the sky's colour behind; under water a short blue murk
vec3 airFog(vec3 col, vec3 wp, float dist) {
  if (u_underwater > 0.5) return mix(col, u_fogLin, smoothstep(1.0, u_fogFar, dist));
  float k = dist * u_fogDensity, f = 1.0 - exp(-k * k);
  f = max(f, smoothstep(u_fogFar * 0.9, u_fogFar, dist));
  return mix(col, skyCol(normalize(wp)), f);
}
`;
// the shadow map, looked up with the hardware's 2×2 filter and a few taps round (more on high)
const SHADOW = `
uniform highp sampler2DShadow u_shadow;
uniform float u_shadowOn, u_texel;
const vec2 POISSON[8] = vec2[8](vec2(-0.613, 0.617), vec2(0.17, -0.04), vec2(-0.299, -0.789), vec2(0.645, 0.493), vec2(-0.651, -0.162), vec2(0.421, -0.704), vec2(-0.135, 0.255), vec2(0.86, -0.155));
float shadowAt(vec4 sp) {
  vec3 p = sp.xyz * 0.5 + 0.5;
  float edge = max(abs(p.x - 0.5), abs(p.y - 0.5)) * 2.0;
  if (edge >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
#if SHADOWS >= 2
  float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  mat2 r = mat2(cos(a), sin(a), -sin(a), cos(a));
  for (int i = 0; i < 8; i++) s += texture(u_shadow, vec3(p.xy + r * POISSON[i] * u_texel * 1.8, p.z));
  s /= 8.0;
#else
  for (int i = 0; i < 4; i++) s += texture(u_shadow, vec3(p.xy + POISSON[i * 2] * u_texel, p.z));
  s /= 4.0;
#endif
  return mix(s, 1.0, smoothstep(0.85, 1.0, edge));
}
`;
const head = (defs, prec = '') => `#version 300 es\n${Object.entries(defs).map(([k, v]) => `#define ${k} ${v}`).join('\n')}\nprecision highp float;\n${prec}`;

/** The world's blocks (and things drawn like them). shadows: 0 none, 1 a few taps, 2 soft. */
export function chunkShaders(shadows) {
  const vs = head({SHADOWS: shadows}) + `
layout(location=0) in uvec3 a_pos;
layout(location=1) in uint a_layer;
layout(location=2) in uvec2 a_uv;
layout(location=3) in uvec2 a_light;
layout(location=4) in uint a_shade;
layout(location=5) in vec3 a_tint;
uniform mat4 u_viewProj, u_model, u_shadowMat;
uniform vec3 u_origin, u_camera, u_lightDir;
uniform float u_unit, u_center, u_time, u_wave;
out vec3 v_uvl; out vec2 v_light; out float v_ao; out vec3 v_tint; out float v_dist; out float v_liquid; out vec3 v_wp; out vec3 v_n; out vec4 v_sh;
const float AO[4] = float[4](1.0, 0.8, 0.65, 0.5);
const vec3 N6[6] = vec3[6](vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
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
  v_ao = AO[a_shade & 3u];
  v_n = mat3(u_model) * N6[min((a_shade >> 2u) & 7u, 5u)];
  v_tint = a_tint; v_wp = wp; v_dist = length(wp); v_liquid = flags == 4u ? 1.0 : 0.0;
#if SHADOWS > 0
  // pushed off the surface a little (more far away) so it does not shadow itself; plants (crossed sheets with no real
  // facing) are looked up half a block toward the light instead, or each would sit in its own shadow
  bool plant = flags == 2u || flags == 3u;
  v_sh = u_shadowMat * vec4(wp + (plant ? u_lightDir * 0.5 : normalize(v_n) * (0.05 + v_dist * 0.002)), 1.0);
#else
  v_sh = vec4(0.0);
#endif
}`;
  const fs = head({SHADOWS: shadows}, 'precision highp sampler2DArray;\n') + LIGHT + (shadows ? SHADOW : '') + `
uniform sampler2DArray u_tex;
uniform float u_cut, u_alpha, u_overlay, u_time;
uniform vec3 u_camera;
in vec3 v_uvl; in vec2 v_light; in float v_ao; in vec3 v_tint; in float v_dist; in float v_liquid; in vec3 v_wp; in vec3 v_n; in vec4 v_sh;
out vec4 o;
void main() {
  vec4 c = texture(u_tex, v_uvl);
  if (c.a < u_cut) discard;
  if (u_overlay > 0.5) { o = vec4(c.rgb, c.a); return; }
  vec3 albedo = lin(c.rgb * v_tint), N = normalize(v_n);
  float sky = clamp(v_light.x / 15.0, 0.0, 1.0), blk = clamp(v_light.y / 15.0, 0.0, 1.0);
  float ndl = max(dot(N, u_lightDir), 0.0), sh = 1.0;
#if SHADOWS > 0
  if (u_shadowOn > 0.5 && ndl > 0.0) sh = shadowAt(v_sh);
#endif
  // sunlight only where the sky reaches (in caves the map may not know)
  float sun = ndl * sh * smoothstep(0.55, 0.95, sky);
  vec3 L = u_lightCol * sun + u_ambCol * sky * sky * (0.72 + 0.28 * N.y) * v_ao + u_blockCol * pow(blk, 2.4) * 2.2 * u_flicker * v_ao + vec3(0.01 + u_bright);
  vec3 col = albedo * L;
  float alpha = (v_liquid > 0.5 ? max(c.a, 0.72) : c.a) * u_alpha;
  // water's top: two sets of small waves; the sky and the sun mirrored more at a glance
  if (v_liquid > 0.5 && N.y > 0.5) {
    vec3 W = v_wp + u_camera;
    vec2 g = vec2(cos(W.x * 0.9 + u_time * 1.6), cos(W.z * 0.8 + u_time * 1.3)) * 0.06
           + vec2(cos(W.x * 2.3 - W.z * 1.7 + u_time * 2.4), cos(W.z * 2.1 + W.x * 1.3 + u_time * 2.0)) * 0.03;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y)), V = normalize(-v_wp), R = reflect(-V, n);
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 refl = skyCol(normalize(vec3(R.x, max(R.y, 0.03), R.z))) * mix(0.12, 1.0, sky * sky);
    refl += u_lightCol * pow(max(dot(R, u_lightDir), 0.0), 140.0) * 5.0 * sh * smoothstep(0.55, 0.95, sky);
    col = mix(col * 0.6, refl, fr);
    alpha = mix(0.62, 0.97, fr) * u_alpha;
  }
  o = vec4(display(airFog(col, v_wp, v_dist)), alpha);
}`;
  return [vs, fs];
}

/** The shadow pass: the same vertices seen from the light, cut-out leaves cut. */
export function shadowShaders() {
  const vs = head({}) + `
layout(location=0) in uvec3 a_pos;
layout(location=1) in uint a_layer;
layout(location=2) in uvec2 a_uv;
layout(location=4) in uint a_shade;
uniform mat4 u_lightMat;
uniform vec3 u_origin, u_camera;
uniform float u_time, u_wave;
out vec3 v_uvl;
void main() {
  vec3 wp = vec3(a_pos) / 16.0 - 1.0 + u_origin, world = wp + u_camera;
  uint flags = a_shade >> 5u;
  if (u_wave > 0.0 && flags == 1u) wp.xz += 0.035 * vec2(sin(u_time * 1.7 + world.x * 0.9 + world.y), cos(u_time * 1.3 + world.z * 0.8 + world.y));
  if (u_wave > 0.0 && flags == 2u) wp.xz += (1.0 - float(a_uv.y) / 16.0) * 0.07 * vec2(sin(u_time * 2.1 + world.x * 0.7 + world.z * 0.3), cos(u_time * 1.7 + world.z * 0.6));
  gl_Position = u_lightMat * vec4(wp, 1.0);
  // grass, flowers and crops cast no shadow (as in the shader packs: each would darken its own block); leaves do
  if (flags == 2u || flags == 3u) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
  v_uvl = vec3(vec2(a_uv) / 16.0, float(a_layer));
}`;
  const fs = head({}, 'precision highp sampler2DArray;\n') + `
uniform sampler2DArray u_tex;
in vec3 v_uvl; out vec4 o;
// the sharpest level of the picture: seen edge-on from the light a blurred one makes a sheet of grass solid
void main() { if (textureLod(u_tex, v_uvl, 0.0).a < 0.5) discard; o = vec4(1.0); }`;
  return [vs, fs];
}

/** The sky: its colour, the stars by night, and (clouds 1) soft clouds lit by the sun or the moon. */
export function skyShaders(clouds) {
  const vs = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform mat4 u_invViewProj;
out vec3 v_dir;
void main() { vec2 p = P[gl_VertexID]; gl_Position = vec4(p, 0.9999, 1.0); vec4 w = u_invViewProj * vec4(p, 1.0, 1.0); v_dir = w.xyz / w.w; }`;
  const fs = head({CLOUDS: clouds}) + LIGHT + `
uniform float u_stars, u_time, u_cover;
uniform vec3 u_camPos;
in vec3 v_dir; out vec4 o;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(v_dir);
  vec3 c = skyCol(d);
  if (u_stars > 0.0 && d.y > 0.0) { vec3 q = floor(d * 260.0); float s = hash3(q); if (s > 0.9968) c += vec3(u_stars * (s - 0.9968) / 0.0032) * (0.6 + 0.4 * sin(u_time * 3.0 + s * 90.0)) * smoothstep(0.0, 0.2, d.y); }
#if CLOUDS > 0
  // a layer of clouds at 220: where the view ray meets it, a noise for how thick; thinner toward the sun is brighter
  float H = 220.0 - u_camPos.y;
  if (d.y > 0.015 && H > 2.0) {
    float t = H / d.y;
    vec2 p = (u_camPos.xz + d.xz * t + vec2(u_time * 2.0, u_time * 0.6)) * 0.0021;
    float n = fbm(p), dens = smoothstep(u_cover, u_cover + 0.28, n);
    if (dens > 0.0) {
      float lit = fbm(p + u_lightDir.xz * 0.06);
      float shade = clamp(1.15 - (lit - n) * 3.0 - dens * 0.25, 0.35, 1.25);
      vec3 cc = u_lightCol * 0.42 * shade + u_ambCol * 1.15 + u_glowCol * pow(max(dot(d, u_sunTrue), 0.0), 6.0) * 0.6;
      c = mix(c, cc, dens * exp(-t * 0.00045) * 0.95);
    }
  }
#endif
  o = vec4(display(c), 1.0);
}`;
  return [vs, fs];
}

/** Mobs and the player in third person: lit like the blocks (their own face shading stands in for the sun's angle). */
export function entityShaders(shadows) {
  const vs = head({SHADOWS: shadows}) + `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_shade;
uniform mat4 u_viewProj, u_shadowMat;
out vec2 v_uv; out float v_shade; out float v_dist; out vec3 v_wp; out vec4 v_sh;
void main() {
  gl_Position = u_viewProj * vec4(a_pos, 1.0); v_uv = a_uv; v_shade = a_shade; v_dist = length(a_pos); v_wp = a_pos;
#if SHADOWS > 0
  v_sh = u_shadowMat * vec4(a_pos + vec3(0.0, 0.08, 0.0), 1.0);
#else
  v_sh = vec4(0.0);
#endif
}`;
  const fs = head({SHADOWS: shadows}) + LIGHT + (shadows ? SHADOW : '') + `
uniform sampler2D u_img;
uniform vec2 u_light;
uniform float u_hurt, u_white;
uniform vec3 u_tint;
in vec2 v_uv; in float v_shade; in float v_dist; in vec3 v_wp; in vec4 v_sh; out vec4 o;
void main() {
  vec4 c = texture(u_img, v_uv);
  if (c.a < 0.1) discard;
  float sky = clamp(u_light.x / 15.0, 0.0, 1.0), blk = clamp(u_light.y / 15.0, 0.0, 1.0), sh = 1.0;
#if SHADOWS > 0
  if (u_shadowOn > 0.5) sh = shadowAt(v_sh);
#endif
  vec3 L = u_lightCol * clamp((v_shade - 0.45) * 1.7, 0.0, 1.0) * max(u_lightDir.y, 0.25) * sh * smoothstep(0.55, 0.95, sky)
    + u_ambCol * sky * sky + u_blockCol * pow(blk, 2.4) * 2.2 * u_flicker + vec3(0.012 + u_bright);
  vec3 col = lin(c.rgb * u_tint) * L;
  col = mix(col, vec3(1.0, 0.1, 0.06) * max(L, vec3(0.25)), u_hurt * 0.45);
  col = mix(col, vec3(2.0), u_white);
  o = vec4(display(airFog(col, v_wp, v_dist)), 1.0);
}`;
  return [vs, fs];
}

/** The distant view's coarse land: coloured voxels, lit and fogged like the near land; nothing where real columns are. */
export function lodShaders() {
  const vs = head({}) + `
layout(location=0) in vec3 a_pos;
layout(location=1) in uvec4 a_col;
uniform mat4 u_viewProj;
uniform vec3 u_origin;
out vec3 v_wp; out vec3 v_col; out vec3 v_n; out float v_water;
const vec3 N6[6] = vec3[6](vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
void main() {
  vec3 wp = a_pos + u_origin;
  gl_Position = u_viewProj * vec4(wp, 1.0);
  v_wp = wp; v_col = vec3(a_col.rgb) / 255.0; v_n = N6[min(a_col.a & 7u, 5u)]; v_water = (a_col.a & 8u) > 0u ? 1.0 : 0.0;
}`;
  const fs = head({}) + LIGHT + `
uniform float u_inner, u_plain;
in vec3 v_wp; in vec3 v_col; in vec3 v_n; in float v_water; out vec4 o;
void main() {
  if (length(v_wp.xz) < u_inner) discard;
  vec3 N = v_n, albedo = lin(v_col);
  vec3 col = albedo * (u_lightCol * max(dot(N, u_lightDir), 0.0) + u_ambCol * (0.72 + 0.28 * N.y) + vec3(0.01 + u_bright));
  if (v_water > 0.5) { vec3 V = normalize(-v_wp), R = reflect(-V, N); float fr = 0.02 + 0.98 * pow(1.0 - max(V.y, 0.0), 5.0); col = mix(col, skyCol(normalize(vec3(R.x, max(R.y, 0.03), R.z))), fr); }
  if (u_plain > 0.5) { o = vec4(sqrt(clamp(col, 0.0, 1.0)), 1.0); return; }
  o = vec4(display(airFog(col, v_wp, length(v_wp))), 1.0);
}`;
  return [vs, fs];
}

/** After everything (high): light shafts from the sun through gaps (where the sky shows), and a soft dark edge. */
export function postShaders() {
  const vs = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() { vec2 p = P[gl_VertexID]; gl_Position = vec4(p, 0.0, 1.0); v_uv = p * 0.5 + 0.5; }`;
  const fs = `#version 300 es
precision highp float;
uniform sampler2D u_color, u_depth;
uniform vec2 u_sunUV;
uniform float u_rays;
uniform vec3 u_rayCol;
in vec2 v_uv; out vec4 o;
void main() {
  vec3 c = texture(u_color, v_uv).rgb;
  if (u_rays > 0.0) {
    vec2 dir = (u_sunUV - v_uv) / 28.0, p = v_uv;
    float acc = 0.0, w = 1.0, j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    p += dir * j;
    for (int i = 0; i < 28; i++) { p += dir; if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break; acc += (texture(u_depth, p).r >= 0.99999 ? 1.0 : 0.0) * w; w *= 0.955; }
    c += u_rayCol * (acc / 28.0) * u_rays * smoothstep(1.4, 0.0, length((v_uv - u_sunUV) * vec2(1.6, 1.0)));
  }
  c *= mix(0.8, 1.0, smoothstep(1.15, 0.4, length(v_uv - 0.5) * 1.35));
  o = vec4(c, 1.0);
}`;
  return [vs, fs];
}
