// The shaded look (光影): our own take on what the game's shader packs do. Light is worked out in linear colour — the
// sun's (or the moon's) through a shadow map and through leaves and grass, the sky's from above, block light warm and
// flickering (and from a torch held in the hand), shade under the clouds — and the land fades into air that is thick
// low down, thin up a mountain and dark in a cave. Water bends what is under it, colours by its depth, foams at the
// shore and mirrors the land (marched through the picture) and the sky; rain wets the ground into puddles. The clouds
// are a layer with depth, lit through. With HDR (mid, high) everything goes into a float picture and the end does the
// film: bloom, edge shade (high), light shafts (high), the tone curve and colour, smoothed edges. Low (phones) draws
// straight to the screen with the same light, tone-mapped per pixel. render.js builds the programs from these.

// what the land and the sky share: the light's uniforms, the sky's colour along a direction, the clouds' cover (an
// octave a lookup into a tiling noise picture), and the air between the eye and a point. Per pixel for the land (the
// land has far more vertices than the screen has pixels); mobs, with few vertices, work out their air per vertex.
const SKY = `
#ifndef HDR
#define HDR 0
#endif
uniform vec3 u_lightDir, u_lightCol, u_ambCol, u_blockCol, u_sunTrue, u_zenith, u_horizon, u_glowCol, u_fogLin;
uniform float u_exposure, u_fogDensity, u_fogFar, u_underwater, u_flicker, u_bright, u_rain, u_eyeSky, u_camY, u_held, u_time, u_cover, u_aurora, u_flash, u_storm, u_mist, u_waterY;
uniform sampler2D u_noise;
// the sky's colour along a direction: a thin pale band at the horizon under a deep blue (as the air thins upward),
// the sun's glow (wide, a halo, a bright core), dark below
vec3 skyCol(vec3 d) {
  float y = d.y;
  vec3 c = mix(u_horizon, u_zenith, 1.0 - exp(-max(y, 0.0) * 5.5));
  float s = max(dot(d, u_sunTrue), 0.0);
  c += u_glowCol * (pow(s, 4.0) * 0.12 + pow(s, 32.0) * 0.8 + pow(s, 500.0) * 3.0) * (1.0 - 0.45 * clamp(y, 0.0, 1.0));
  return mix(c, u_horizon * 0.4, smoothstep(0.0, -0.3, y));
}
// how much cloud there is over a place (0 clear … 1 thick): octaves of the noise picture drifting with the wind, each
// a little differently, so the clouds change shape as they go
float cloudCover(vec2 xz, int oct) {
  vec2 p = (xz + vec2(u_time * 2.0, u_time * 0.6)) * 0.0021 / 8.0;
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * textureLod(u_noise, p + float(i) * u_time * vec2(0.00009, -0.00006), 0.0).r; n += a; p = p * 2.03 + 0.37; a *= 0.5; }
  return smoothstep(u_cover, u_cover + 0.25, s / n);
}
// what kind of low cloud is over a place, from a slow wide noise (a kind over some thousand blocks, so a sky shows a
// few): 0 flat sheets (stratocumulus; in rain the grey overcast) … 1 heaps (cumulus); a thunderstorm makes towers
float cloudKind(vec2 xz) {
  float k = smoothstep(0.28, 0.56, textureLod(u_noise, (xz + vec2(u_time * 2.0, u_time * 0.6)) * 0.00011 + 0.31, 0.0).r);
  return max(k * (1.0 - u_rain * 0.7), u_storm);
}
// a morning's mist, seen along a direction: pale, lit by the low sun on its side
vec3 mistCol(vec3 d) { return u_ambCol * 1.4 + u_lightCol * (0.15 + 0.5 * pow(max(dot(d, u_lightDir), 0.0), 4.0)); }
// the air between the eye and a point (camera-relative): its colour, and how much of it there is (alpha). Thicker low
// down (from a mountain the view is clear, the valley hazy), the sky's colour behind (brighter toward the sun, where
// the haze sends its light on) — or a cave's darkness when the eye is out of the sky's reach; some mornings a mist
// lying in the low places, a few blocks deep; under water a blue-green murk.
vec4 airAt(vec3 wp, float dist) {
  if (u_underwater > 0.5) return vec4(u_fogLin, 1.0 - exp(-dist * 2.2 / u_fogFar));
  vec3 d = wp / max(dist, 0.001);
  float k = 0.016, dy = wp.y, h = exp(-clamp(u_camY - 64.0, -24.0, 200.0) * k) * (abs(dy) > 0.05 ? (1.0 - exp(-k * dy)) / (k * dy) : 1.0);
  float t = dist * u_fogDensity * clamp(h, 0.2, 2.5), f = max(1.0 - exp(-t * t), smoothstep(u_fogFar * 0.88, u_fogFar, dist));
  vec3 col = skyCol(d) + u_lightCol * 0.06 * pow(max(dot(d, u_lightDir), 0.0), 6.0);
  if (u_mist > 0.0) {
    // the mist thins upward four times faster than the haze (a valley full, a hilltop over it; never thicker than at sea
    // level): near things clear, the far ones fading
    float km = 0.06, hm = exp(-max(u_camY - 62.0, 0.0) * km) * (abs(dy) > 0.05 ? (1.0 - exp(-km * dy)) / (km * dy) : 1.0);
    float tm = dist * u_mist * 0.012 * min(hm, 1.0), fm = 1.0 - exp(-tm), F = 1.0 - (1.0 - f) * (1.0 - fm);
    // the colour by each one's share
    col = mix(col, mistCol(d), fm / max(F, 1e-4));
    f = F;
  }
  return vec4(mix(u_ambCol * 0.02 + vec3(0.002), col, u_eyeSky), f);
}
`;
// the light of a pixel, after SKY: colours are linear (sRGB squared), lit, then through the film
const LIGHT = SKY + `
vec3 lin(vec3 c) { return c * c; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// the film: a filmic curve with a soft shoulder (the bright parts roll off instead of turning white) and a toe that
// keeps the shade readable (the usual fitted curve takes the dark down to a fifth), a little less colour in the dark
vec3 film(vec3 c) {
  c *= u_exposure;
  // half each channel through the curve (bright colours go toward white, as film does), half the brightness through it
  // with the colour kept (bright sand stays sand-coloured)
  float l0 = luma(c), lc = clamp((l0 * (2.51 * l0 + 0.08)) / (l0 * (2.43 * l0 + 0.59) + 0.14), 0.0, 1.0);
  c = mix(clamp((c * (2.51 * c + 0.08)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0), c * (lc / max(l0, 1e-5)), 0.5);
  float l = luma(c);
  return clamp(mix(vec3(l), c, mix(0.8, 1.05, smoothstep(0.0, 0.25, l))), 0.0, 1.0);
}
#if HDR
vec3 display(vec3 c) { return c; }
#else
vec3 display(vec3 c) { return sqrt(film(c)); }
#endif
// noise from the pixel's place, spread evenly (for jittering samples)
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// smooth noise of about one unit across (one cell of the noise picture is an eighth of it)
float vnoise(vec2 p) { return texture(u_noise, p / 8.0).r; }
// the light the waves gather onto what is under them (caustics): where two drifting noises are nearly equal, a net of
// bright lines a block or two across
float caustic(vec2 p) {
  float a = texture(u_noise, p * 0.085 + u_time * vec2(0.011, 0.006)).r, b = texture(u_noise, p * 0.1 - u_time * vec2(0.007, 0.01) + 0.5).r;
  return pow(1.0 - min(abs(a - b) * 3.0, 1.0), 5.0);
}
`;
// the shadow map: the hardware's 2×2 compare, and taps on a turned spiral round (more and wider on high)
const SHADOW = `
uniform highp sampler2DShadow u_shadow;
uniform float u_shadowOn, u_texel;
// points on a spiral (each at the golden angle from the last, spreading out evenly), turned per pixel by one rotation
#if SHADOWS >= 2
const int N_SH = 12; const float R_SH = 2.4;
const vec2 SPIRAL[12] = vec2[12](vec2(0.204, 0.000), vec2(-0.261, 0.239), vec2(0.040, -0.455), vec2(0.329, 0.429), vec2(-0.603, -0.107), vec2(0.571, -0.363), vec2(-0.191, 0.711), vec2(-0.364, -0.702), vec2(0.791, 0.289), vec2(-0.822, 0.340), vec2(0.396, -0.847), vec2(0.293, 0.934));
#else
const int N_SH = 4; const float R_SH = 1.3;
const vec2 SPIRAL[4] = vec2[4](vec2(0.354, 0.000), vec2(-0.452, 0.414), vec2(0.069, -0.788), vec2(0.569, 0.742));
#endif
float shadowAt(vec4 sp) {
  vec3 p = sp.xyz * 0.5 + 0.5;
  float edge = max(abs(p.x - 0.5), abs(p.y - 0.5)) * 2.0;
  if (edge >= 1.0 || p.z >= 1.0) return 1.0;
  float a = ign(gl_FragCoord.xy) * 6.2832, c = cos(a), sn = sin(a), s = 0.0;
  mat2 rot = mat2(c, sn, -sn, c) * (R_SH * u_texel);
  for (int i = 0; i < N_SH; i++) s += texture(u_shadow, vec3(p.xy + rot * SPIRAL[i], p.z));
  return mix(s / float(N_SH), 1.0, smoothstep(0.85, 1.0, edge));
}
`;
const head = (defs, prec = '') => `#version 300 es\n${Object.entries(defs).map(([k, v]) => `#define ${k} ${v}`).join('\n')}\nprecision highp float;\n${prec}`;
const defsOf = o => ({SHADOWS: o.shadows || 0, HDR: o.hdr ? 1 : 0, GEN: o.gen ? 1 : 0, SSR: o.ssr || 0, CLOUDS: o.clouds || 0});

/**
 * The world's blocks (and things drawn like them). o: {shadows: 0 none | 1 a few taps | 2 soft, hdr (into the float
 * picture; water then reads the land behind it), gen (bumps from the picture), ssr (steps of the water's mirror), clouds}.
 */
export function chunkShaders(o = {}) {
  const defs = defsOf(o);
  const vs = head(defs) + `
layout(location=0) in uvec3 a_pos;
layout(location=1) in uint a_layer;
layout(location=2) in uvec2 a_uv;
layout(location=3) in uvec2 a_light;
layout(location=4) in uint a_shade;
layout(location=5) in vec3 a_tint;
uniform mat4 u_viewProj, u_model;
uniform vec3 u_origin, u_camera, u_lightDir, u_player;
uniform float u_unit, u_center, u_time, u_wave;
// (few outputs: a vertex's results are what this small GPU spends its time on — the land costs about the same at any
// size of picture — so the facing, the distance and the shadow's place are worked out per pixel instead)
out vec3 v_uvl; out vec2 v_light; out float v_ao; out vec3 v_tint; out vec3 v_wp;
flat out uint v_flags; flat out uint v_face;
const float AO[4] = float[4](1.0, 0.8, 0.65, 0.5);
void main() {
  vec3 p = vec3(a_pos) / u_unit - u_center;
  vec3 wp = (u_model * vec4(p, 1.0)).xyz + u_origin;
  uint flags = a_shade >> 5u;
  vec3 world = wp + u_camera;
  if (u_wave > 0.0 && flags == 1u) wp.xz += 0.035 * vec2(sin(u_time * 1.7 + world.x * 0.9 + world.y), cos(u_time * 1.3 + world.z * 0.8 + world.y));
  if (u_wave > 0.0 && flags == 2u) wp.xz += (1.0 - float(a_uv.y) / 16.0) * 0.07 * vec2(sin(u_time * 2.1 + world.x * 0.7 + world.z * 0.3), cos(u_time * 1.7 + world.z * 0.6));
  if (flags == 4u) wp.y += sin(u_time * 1.2 + world.x * 0.6 + world.z * 0.8) * 0.012;
  // grass and flowers lean away from the player walking through them, more toward their tops
  if (flags == 2u) { vec3 d = wp - u_player; float r = length(d.xz); if (r < 1.3 && d.y > -0.3 && d.y < 2.4) wp.xz += d.xz / max(r, 0.05) * (1.0 - r / 1.3) * clamp(d.y, 0.0, 1.0) * 0.45; }
  gl_Position = u_viewProj * vec4(wp, 1.0);
  v_uvl = vec3(vec2(a_uv) / 16.0, float(a_layer));
  v_light = vec2(a_light) / 17.0;
  v_ao = AO[a_shade & 3u];
  v_face = min((a_shade >> 2u) & 7u, 5u);
  v_tint = a_tint; v_wp = wp; v_flags = flags;
}`;
  const fs = head(defs, 'precision highp sampler2DArray;\n') + LIGHT + (defs.SHADOWS ? SHADOW : '') + `
uniform sampler2DArray u_tex;
uniform float u_cut, u_alpha, u_overlay, u_texSize;
uniform vec3 u_camera;
uniform mat4 u_viewProj, u_model;
#if SHADOWS > 0
uniform mat4 u_shadowMat;
#endif
const vec3 N6[6] = vec3[6](vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
// which way the picture's u and v run on each face (the game's texture coordinates, as mesh.js lays them)
const vec3 TU[6] = vec3[6](vec3(0.0, 0.0, -1.0), vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0));
const vec3 TV[6] = vec3[6](vec3(0.0, -1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), vec3(0.0, -1.0, 0.0), vec3(0.0, -1.0, 0.0));
#if HDR
uniform sampler2D u_scene, u_sceneDepth;
uniform vec2 u_screen;
uniform float u_near, u_far, u_behind;
#endif
in vec3 v_uvl; in vec2 v_light; in float v_ao; in vec3 v_tint; in vec3 v_wp;
flat in uint v_flags; flat in uint v_face;
out vec4 o;
float v_dist;
#if CLOUDS > 0
// the clouds' shade on the land: the cover where the light's line from here meets the layer's middle
float cloudShade(vec3 W) { return u_lightDir.y < 0.05 ? 1.0 : 1.0 - (0.6 + 0.3 * u_storm) * cloudCover(W.xz + u_lightDir.xz * (214.0 - W.y) / u_lightDir.y, 3); }
#else
float cloudShade(vec3 W) { return 1.0; }
#endif
// the water's surface slope: two long swells, and ripples with no pattern to them (the slope of the noise picture in
// two sizes, drifting different ways) — the sums of waves alone looked like a woven sheet
vec3 waterNormal(vec3 W) {
  vec2 g = vec2(cos(W.x * 0.9 + u_time * 1.6), cos(W.z * 0.8 + u_time * 1.3)) * 0.03
         + vec2(cos(W.x * 2.3 - W.z * 1.7 + u_time * 2.4), cos(W.z * 2.1 + W.x * 1.3 + u_time * 2.0)) * 0.012;
  vec2 p = W.xz * 0.35 + u_time * vec2(0.06, 0.04), q = W.xz * 0.95 - u_time * vec2(0.05, 0.09);
  float a = vnoise(p), b = vnoise(q);
  g += vec2(vnoise(p + vec2(0.15, 0.0)) - a, vnoise(p + vec2(0.0, 0.15)) - a) * 0.55 + vec2(vnoise(q + vec2(0.15, 0.0)) - b, vnoise(q + vec2(0.0, 0.15)) - b) * 0.3;
  return normalize(vec3(-g.x, 1.0, -g.y));
}
#if HDR
float linearDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
#if SSR > 0
// the mirror: steps along the reflected ray through the picture of the land; where it goes behind something, that
// is what is seen (rgb, how sure). The sky where it leaves without meeting anything.
vec4 mirror(vec3 p, vec3 r) {
  float stride = (0.5 + v_dist * 0.02) * (SSR > 16 ? 1.0 : 1.6);
  vec2 uv = vec2(-1.0);
  for (int i = 0; i < SSR; i++) {
    stride *= 1.22; p += r * stride;
    vec4 c = u_viewProj * vec4(p, 1.0);
    if (c.w <= 0.05) break;
    vec2 q = c.xy / c.w * 0.5 + 0.5;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) break;
    uv = q;
    float d = texture(u_sceneDepth, q).r, behind = c.w - linearDepth(d);
    if (d < 0.99999 && behind > 0.0 && behind < stride * 2.0 + 0.6) {
      vec3 a = p - r * stride, b = p;
      for (int k = 0; k < 4; k++) { vec3 m = (a + b) * 0.5; vec4 cm = u_viewProj * vec4(m, 1.0); vec2 qm = cm.xy / cm.w * 0.5 + 0.5; if (cm.w - linearDepth(texture(u_sceneDepth, qm).r) > 0.0) b = m; else a = m; uv = qm; }
      vec2 e = smoothstep(0.0, 0.07, uv) * smoothstep(1.0, 0.93, uv);
      return vec4(texture(u_scene, uv).rgb, e.x * e.y);
    }
  }
  // left the land behind: the picture's sky there (with its clouds), if it is sky
  if (uv.x >= 0.0 && texture(u_sceneDepth, uv).r >= 0.99999) { vec2 e = smoothstep(0.0, 0.07, uv) * smoothstep(1.0, 0.93, uv); return vec4(texture(u_scene, uv).rgb, e.x * e.y * 0.85); }
  return vec4(0.0);
}
#endif
#endif
void main() {
  vec4 c = texture(u_tex, v_uvl);
  if (c.a < u_cut) discard;
  if (u_overlay > 0.5) { o = vec4(c.rgb, c.a); return; }
  bool leaf = v_flags == 1u, plant = v_flags == 2u || v_flags == 3u, liquid = v_flags == 4u;
  mat3 m = mat3(u_model);
  v_dist = length(v_wp);
  vec3 N0 = normalize(m * N6[v_face]);
  vec3 albedo = lin(c.rgb * v_tint), N = N0, V = v_wp / -max(v_dist, 1e-4), W = v_wp + u_camera, L = u_lightDir;
  // leaves and grass a touch less vivid (their tints squared into linear light glow too green)
  if (leaf || plant) albedo = mix(vec3(luma(albedo)), albedo, 0.82);
  float sky = clamp(v_light.x / 15.0, 0.0, 1.0), blk = clamp(v_light.y / 15.0, 0.0, 1.0);
  // a torch (or anything that shines) in the hand lights round the player, a level less each block away
  blk = max(blk, clamp(u_held - v_dist / 15.0, 0.0, 1.0));
#if GEN
  // bumps from the picture itself: its darker parts lower (only near, where a texel is more than a pixel)
  if (!leaf && !plant && !liquid && v_dist < 26.0) {
    float e = 1.0 / u_texSize, h0 = luma(textureLod(u_tex, v_uvl, 0.0).rgb);
    vec2 g = vec2(luma(textureLod(u_tex, v_uvl + vec3(e, 0.0, 0.0), 0.0).rgb) - h0, luma(textureLod(u_tex, v_uvl + vec3(0.0, e, 0.0), 0.0).rgb) - h0);
    g *= 2.0 * (1.0 - smoothstep(12.0, 26.0, v_dist));
    N = normalize(N - g.x * (m * TU[v_face]) - g.y * (m * TV[v_face]));
  }
#endif
  float ndl = dot(N, L);
  // leaves take light from either side; grass and flowers have no real facing
  float direct = leaf ? clamp(ndl * 0.55 + 0.45, 0.0, 1.0) : plant ? 0.8 : max(ndl, 0.0), sh = 1.0;
#if SHADOWS > 0
  // the shadow map's place: pushed off the surface a little (more far away) so it does not shadow itself; plants
  // (crossed sheets with no real facing) are looked up half a block toward the light instead, or each would sit in
  // its own shadow
  if (u_shadowOn > 0.5 && direct > 0.0) sh = shadowAt(u_shadowMat * vec4(v_wp + (plant ? u_lightDir * 0.5 : N0 * (0.05 + v_dist * 0.002)), 1.0));
#endif
  // sunlight only where the sky reaches (in caves the map may not know), less under clouds
  float open = smoothstep(0.55, 0.95, sky), sunVis = sh * open * (open > 0.0 ? cloudShade(W) : 1.0);
  // under the water (with the eye in it): the sunlight comes down in the net the waves make, less the deeper it is
  if (u_underwater > 0.5 && W.y < u_waterY && !liquid) { float below = u_waterY - W.y; sunVis *= (0.3 + 1.7 * caustic(W.xz + L.xz / max(L.y, 0.2) * below)) * exp(-below * 0.07); }
  vec3 light = u_lightCol * direct * sunVis;
  // leaves and grass let light through: they glow looking toward the sun behind them
  if (leaf || plant) light += u_lightCol * pow(max(dot(-V, L), 0.0), 5.0) * (leaf ? 0.35 : 0.28) * sunVis;
  float ao = mix(1.0, v_ao, 0.8);
  vec3 amb = (u_ambCol + vec3(0.01, 0.05, 0.03) * u_aurora) * sky * sky * (0.62 + 0.38 * (N.y * 0.5 + 0.5)) * ao;
  light += vec3(0.55, 0.58, 0.7) * u_flash * open;
  vec3 bl = u_blockCol * (pow(blk, 2.2) * 1.2 + pow(blk, 9.0) * 1.0) * u_flicker * ao;
  // rain: the open ground darker and shiny, puddles in its hollows
  float wet = liquid ? 0.0 : u_rain * open * smoothstep(0.2, 0.9, N.y);
  albedo *= 1.0 - 0.35 * wet;
  vec3 col = albedo * (light + amb + bl + vec3(0.012 + u_bright));
  // pale ground in full sun (sand, snow, light stone) glares a little whiter, as it does to the eye: only in the direct
  // light — where a cloud's shadow or the land's lies over it, it keeps its colour
  if (!leaf && !plant && !liquid) col += u_lightCol * direct * sunVis * smoothstep(0.35, 0.65, luma(albedo)) * 0.35;
  // an ore's coloured specks shine a little in the dark (the stone round them, grey, does not)
  if (v_flags == 5u) { float hi = max(c.r, max(c.g, c.b)); col += albedo * smoothstep(0.3, 0.6, hi > 0.0 ? (hi - min(c.r, min(c.g, c.b))) / hi : 0.0) * 1.2; }
  if (wet > 0.01) {
    float puddle = smoothstep(0.5, 0.68, vnoise(W.xz * 0.35)) * step(0.9, N.y);
    vec3 n = normalize(mix(N, vec3(0.0, 1.0, 0.0), puddle)), R = reflect(-V, n);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    col = mix(col, skyCol(normalize(vec3(R.x, max(R.y, 0.02), R.z))) * open, fr * wet * (0.3 + 0.7 * puddle));
  }
  float alpha = c.a * u_alpha;
  if (liquid) {
    vec3 n = N.y > 0.5 ? waterNormal(W) : N, R = reflect(-V, n);
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 refl = skyCol(normalize(vec3(R.x, max(R.y, 0.02), R.z))) * mix(0.1, 1.0, sky * sky);
    vec3 glint = u_lightCol * pow(max(dot(R, L), 0.0), 220.0) * 12.0 * sunVis;
    if (u_underwater > 0.5 && N.y > 0.5 && V.y < 0.0) {
      // seen from under it: like water, not a clean round window — the waves (full strength, a finer ripple on top)
      // bend the sky and the sun into a moving bright ceiling, brightest straight up, the sun broken into glints; where
      // the light can no longer get out the edge is broken up by the waves, and past it, the game's way, the world
      // above shows through dimmer (in shallow water, looking across, the bank is seen); the murk over all with the
      // distance
      vec2 fine = vec2(vnoise(W.xz * 2.1 + u_time * vec2(0.3, -0.2)), vnoise(W.xz * 2.1 + vec2(0.5) - u_time * vec2(0.2, 0.25))) - 0.5;
      vec3 nb = normalize(n + vec3(fine.x, 0.0, fine.y) * 0.14), D = -V;
      float ci = max(dot(D, nb), 0.0), s2 = 1.7689 * (1.0 - ci * ci), win = smoothstep(1.0, 0.35, s2);
      vec3 Tn = s2 < 1.0 ? normalize(refract(D, -nb, 1.33)) : normalize(vec3(D.x, max(D.y, 0.05), D.z));
      float r = mix(0.35, 0.02 + 0.98 * pow(1.0 - max(dot(Tn, nb), 0.0), 5.0), win);
      float sd = max(dot(Tn, u_sunTrue), 0.0);
      vec3 up = (skyCol(Tn) + u_lightCol * (pow(sd, 900.0) * (HDR > 0 ? 14.0 : 2.0) + pow(sd, 40.0) * 0.35)) * mix(0.15, 1.0, sky * sky);
      // the crests catch more light, the troughs less: the waves show on it
      up *= 0.7 + 3.5 * length(nb.xz);
#if HDR
      // what stands above the water (the shore, trees) is in the picture already, bent by the waves (the sky is not
      // drawn under water: there it stays the sky worked out here)
      if (u_behind > 0.5) {
        vec2 suv = gl_FragCoord.xy / u_screen + nb.xz * 0.03;
        if (texture(u_sceneDepth, suv).r < 0.99999) up = texture(u_scene, suv).rgb;
      }
#endif
      vec4 air = airAt(v_wp, v_dist);
      o = vec4(display(mix(mix(up, u_fogLin, r), air.rgb, air.a)), 1.0);
      return;
    }
#if HDR
    if (u_behind > 0.5 && u_underwater < 0.5) {
      // what is under the surface, bent by the waves (not where something stands in front of the water)
      vec2 suv = gl_FragCoord.xy / u_screen, ruv = suv + n.xz * 0.05 / max(v_dist * 0.1, 1.0);
      float here = 1.0 / gl_FragCoord.w, bd = linearDepth(texture(u_sceneDepth, ruv).r);
      if (bd < here) { ruv = suv; bd = linearDepth(texture(u_sceneDepth, suv).r); }
      float deep = clamp(bd - here, 0.0, 64.0);
      // the light that gets through: the colours the water lacks go first; what is lost turns to the water's own colour
      vec3 wc = lin(v_tint), absorb = exp(-deep * ((vec3(1.0) - wc) * 0.85 + 0.04));
      // the bed below lit through the waves (caustics), where the sun reaches it
      vec3 bed = v_wp * (bd / here) + u_camera;
      float cst = caustic(bed.xz + L.xz / max(L.y, 0.2) * (W.y - bed.y)) * sunVis * smoothstep(0.1, 0.4, L.y) * exp(-deep * 0.15);
      vec3 body = texture(u_scene, ruv).rgb * absorb * (1.0 + cst * 1.4) + wc * (u_ambCol * 0.5 + u_lightCol * max(L.y, 0.0) * 0.12 * open) * 0.6 * (1.0 - absorb);
#if SSR > 0
      if (fr > 0.06 && R.y > 0.0) { vec4 m = mirror(v_wp, R); refl = mix(refl, m.rgb, m.a); }
#endif
      col = mix(body, refl, fr) + glint;
      // foam where it is shallow, a little patchy and moving
      float foam = (1.0 - smoothstep(0.0, 0.55, deep)) * smoothstep(0.35, 0.8, vnoise(W.xz * 1.8 + u_time * 0.4));
      col = mix(col, (u_lightCol * max(L.y, 0.0) * sunVis + u_ambCol * sky * sky + bl) * 0.85, foam * 0.55 * step(0.5, N.y));
      vec4 air = airAt(v_wp, v_dist);
      o = vec4(display(mix(col, air.rgb, air.a)), 1.0);
      return;
    }
#endif
    col = mix(col * 0.6, refl, fr) + glint;
    alpha = mix(0.62, 0.97, fr) * u_alpha;
  }
  vec4 air = airAt(v_wp, v_dist);
  o = vec4(display(mix(col, air.rgb, air.a)), alpha);
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

/**
 * The sky: its colour, the stars by night, the sun's disc (HDR: bright enough to bloom), and (clouds 1: one flat layer;
 * 2, 3: marched, 3 with more steps)
 * high clouds of three kinds and the low layer from 192 (heaps, sheets, storm towers), marched through, each step lit
 * by how much cloud lies toward the light.
 */
export function skyShaders(o = {}) {
  const defs = defsOf(o);
  const vs = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
uniform mat4 u_invViewProj;
out vec3 v_dir;
void main() { vec2 p = P[gl_VertexID]; gl_Position = vec4(p, 0.9999, 1.0); vec4 w = u_invViewProj * vec4(p, 1.0, 1.0); v_dir = w.xyz / w.w; }`;
  const fs = head(defs) + LIGHT + `
uniform float u_stars, u_moonPhase, u_seen;
uniform vec3 u_camPos, u_sunDisc;
in vec3 v_dir; out vec4 o;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(v_dir);
  vec3 c = skyCol(d);
  if (u_stars > 0.0 && d.y > 0.0) {
    // nebulae: slow clouds of blue and violet across the sky (the noise picture seen on a plane far up)
    vec2 q2 = d.xz / (d.y + 0.25) * 0.35;
    float n1 = texture(u_noise, q2 * 0.6 + 0.13).r, n2 = texture(u_noise, q2 * 1.7 + 0.71).r, n3 = texture(u_noise, q2 * 4.1).r;
    float neb = smoothstep(0.45, 0.85, n1 * 0.6 + n2 * 0.3 + n3 * 0.1);
    c += mix(vec3(0.03, 0.08, 0.25), vec3(0.16, 0.05, 0.2), smoothstep(0.3, 0.7, n2)) * neb * u_stars * smoothstep(0.0, 0.3, d.y) * 0.3;
    // stars: thicker in the nebulae, twinkling, a little warm or blue
    vec3 q = floor(d * 300.0); float s = hash3(q), edge = 0.9955 - neb * 0.004;
    if (s > edge) { float k = (s - edge) / (1.0 - edge); c += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash3(q + 7.0)) * u_stars * k * k * 1.6 * (0.55 + 0.45 * sin(u_time * 3.0 + s * 90.0)) * smoothstep(0.0, 0.2, d.y); }
    // the aurora (snowy places at night): sheets one above another, each lit along a wavy line, green low and violet high
    if (u_aurora > 0.0) {
      // many thin sheets, each pixel's set shifted a little at random, so they blur into hanging curtains
      vec3 au = vec3(0.0);
      float jit = ign(gl_FragCoord.xy);
      for (int i = 0; i < 16; i++) {
        float f = (float(i) + jit) / 16.0;
        vec2 p = d.xz / max(d.y, 0.05) * (0.5 + f * 0.6) + vec2(u_time * 0.004, u_time * 0.002);
        float band = 1.0 - smoothstep(0.0, 0.035, abs(texture(u_noise, p * 0.22).r - 0.5));
        au += mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.2, 0.9), f) * band * pow(1.0 - f, 1.5) * 0.045;
      }
      c += au * u_aurora * u_stars * smoothstep(0.05, 0.35, d.y);
    }
  }
  c = mix(c, vec3(0.6, 0.62, 0.72), u_flash * 0.6);
  // the sun: a round disc (HDR: bright enough to bloom; the plain picture of the game's is square)
  c += u_sunDisc * smoothstep(0.99972, 0.99988, dot(d, u_sunTrue)) * (HDR > 0 ? 45.0 : 6.0) * u_seen;
  // the moon, opposite the sun: a round disc lit by its phase (the game's eight, 0 full … 4 new), greyer seas on it, a
  // soft glow round it (the game's moon picture is a square)
  vec3 md = -u_sunTrue;
  float mc = dot(d, md), th = u_moonPhase / 8.0 * 6.2832;
  c += vec3(0.5, 0.55, 0.7) * exp(-sqrt(max(1.0 - mc, 0.0)) * 26.0) * 0.12 * (0.5 + 0.5 * cos(th)) * u_stars * u_seen;
  if (mc > 0.99 && u_stars > 0.0) {
    vec3 mr = normalize(cross(md, vec3(0.0, 1.0, 0.0) + vec3(0.0, 0.0, 0.001))), mu = cross(mr, md);
    vec2 q = vec2(dot(d, mr), dot(d, mu)) / 0.032;
    float r2 = dot(q, q);
    if (r2 < 1.0) {
      vec3 sp = vec3(q, sqrt(1.0 - r2));
      float lit = smoothstep(-0.06, 0.06, dot(sp, vec3(sin(th), 0.0, cos(th))));
      float sea = smoothstep(0.45, 0.7, textureLod(u_noise, q * 0.18 + 0.33, 0.0).r) * 0.35 + (1.0 - textureLod(u_noise, q * 0.5 + 0.7, 0.0).r) * 0.15;
      vec3 face = vec3(0.92, 0.94, 1.0) * (1.0 - sea) * (HDR > 0 ? 2.6 : 1.4);
      // the dark part shows faintly (earthshine) and hides the stars behind
      c = mix(c * smoothstep(1.0, 0.9, r2), face * (0.008 + 0.992 * lit), smoothstep(1.0, 0.93, r2) * u_seen);
    }
  }
#if CLOUDS > 0
  // high clouds at 300, of three kinds from place to place (a slow wide noise, drifting): wisps drawn out by the wind
  // and bent (cirrus), small flecks (cirrocumulus), a thin even veil (cirrostratus) — with the faint ring that such a
  // veil makes 22° round the sun or the moon, reddish inside
  float ph0 = 0.55 + 1.6 * pow(max(dot(d, u_lightDir), 0.0), 8.0);
  if (d.y > 0.02 && u_camPos.y < 300.0) {
    float t2 = (300.0 - u_camPos.y) / d.y;
    vec2 p2 = u_camPos.xz + d.xz * t2 + vec2(u_time * 3.0, u_time * 0.7);
    float hk = textureLod(u_noise, p2 * 0.0001 + 0.57, 0.0).r, far = exp(-t2 * 0.00025) * (1.0 - u_rain * 0.8);
    vec2 q = vec2(p2.x * 0.00025, p2.y * 0.0012 + textureLod(u_noise, p2 * 0.0005, 0.0).r * 0.4);
    float wisp = smoothstep(u_cover + 0.05, u_cover + 0.45, textureLod(u_noise, q, 0.0).r * 0.65 + textureLod(u_noise, q * 3.3 + 0.2, 0.0).r * 0.35) * smoothstep(0.33, 0.45, hk) * (1.0 - smoothstep(0.62, 0.74, hk));
    // the flecks in patches, soft, of two sizes so they do not sit in a grid
    float fn = textureLod(u_noise, p2 * vec2(0.011, 0.016), 0.0).r * 0.7 + textureLod(u_noise, p2 * 0.037 + 0.4, 0.0).r * 0.3;
    float fleck = smoothstep(0.5, 0.9, fn) * smoothstep(0.5, 0.68, textureLod(u_noise, p2 * 0.0011 + 0.3, 0.0).r) * (1.0 - smoothstep(0.36, 0.44, hk));
    float veil = smoothstep(0.66, 0.8, hk);
    c = mix(c, (u_lightCol * 0.3 * ph0 + vec3(luma(u_ambCol)) * 1.6) * (1.0 - 0.6 * u_stars), clamp(wisp * 0.5 + fleck * 0.16 + veil * 0.3, 0.0, 1.0) * far);
    vec3 ring = exp(-pow((acos(clamp(dot(d, u_lightDir), -1.0, 1.0)) - vec3(0.375, 0.383, 0.392)) / 0.011, vec3(2.0)));
    c += u_lightCol * ring * veil * far * 0.12;
  }
  // the low clouds, from 192 up: flat bottoms; heaps (cumulus) rise highest where the cover is thickest, into round
  // tops; sheets stay low and even; in a thunderstorm they tower up (cumulonimbus). Lumpy sides from a finer noise
  // shifted with the height. Marched through, each step lit by how much cloud lies toward the light; the bottoms of
  // thick ones grey, a storm's dark.
  const float CB = 192.0;
  float CT = CB + 60.0 + 170.0 * u_storm, cy = u_camPos.y;
  vec3 dimAmb = mix(vec3(luma(u_ambCol)), u_ambCol, 0.4);
#if CLOUDS == 1
  // low (phones): the same clouds as one soft layer at 214, not marched through — the cover there, lit by how much
  // lies toward the light
  float tl = abs(d.y) > 0.01 ? (214.0 - cy) / d.y : -1.0;
  if (tl > 0.0 && tl < 6000.0) {
    vec2 xz = (u_camPos + d * tl).xz;
    float cv = cloudCover(xz, 4);
    if (cv > 0.0) {
      float lt = exp(-cloudCover(xz + u_lightDir.xz * 24.0, 2) * 1.6), ph = 0.55 + 1.6 * pow(max(dot(d, u_lightDir), 0.0), 8.0);
      vec3 lum = (u_lightCol * (0.2 + 0.8 * lt) * ph * 0.75 + dimAmb * mix(1.5, 0.9, cv)) * (1.0 - 0.45 * u_storm) * (1.0 - 0.6 * u_stars);
      c = mix(c, lum, smoothstep(0.0, 0.45, cv) * exp(-tl * 0.00035));
    }
  }
#else
  if (abs(d.y) > 0.01) {
    float ta = (CB - cy) / d.y, tb = (CT - cy) / d.y, t0 = max(min(ta, tb), 0.0), t1 = max(ta, tb);
    if (t1 > 0.0 && t0 < 6000.0) {
      t1 = min(t1, t0 + 420.0 + 200.0 * u_storm);
      // more steps where the way through is long (low over the horizon), few looking up through it
      const int NMAX = CLOUDS > 2 ? 24 : 14;
      int N = int(clamp((t1 - t0) / 16.0, 6.0, float(NMAX)));
      float dt = (t1 - t0) / float(N), T = 1.0, j = ign(gl_FragCoord.xy), ph = 0.55 + 1.6 * pow(max(dot(d, u_lightDir), 0.0), 8.0);
      // the kind changes over thousands of blocks: once along the ray
      float kind = cloudKind((u_camPos + d * (t0 + t1) * 0.5).xz);
      vec3 S = vec3(0.0);
      for (int i = 0; i < NMAX; i++) {
        if (i >= N) break;
        vec3 p = u_camPos + d * (t0 + (float(i) + j) * dt);
        float h = clamp((p.y - CB) / (CT - CB), 0.0, 1.0);
        float cv = cloudCover(p.xz, CLOUDS > 2 ? 5 : 4);
        if (cv <= 0.0) continue;
        // a heap's top billows (bumps some thirty blocks across, shifting with the height: the cauliflower look)
        float billow = textureLod(u_noise, p.xz * 0.0045 + vec2(h * 0.5, h * 0.3), 0.0).r;
        float top = mix(0.3, 1.0, kind) * mix(1.0, sqrt(cv), kind) * mix(1.0, 0.65 + 0.7 * billow, kind);
        float lump = textureLod(u_noise, p.xz * 0.012 + vec2(h * 0.8, -h * 0.5), 0.0).r;
        float dens = clamp(cv * 1.5 * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(top - 0.15, top, h)) - (1.0 - lump) * 0.5 * (1.0 - cv * 0.6), 0.0, 1.0);
        if (dens < 0.01) continue;
        // the light's way out goes through what is above (a thin sheet lets it through, a heap's middle not)
        float lt = exp(-cloudCover(p.xz + u_lightDir.xz * 16.0, 2) * 3.2 * max(top - h, 0.0) - 0.15);
        // (by night the moon lights them dimly: dark grey, not bright against the stars)
        vec3 lum = (u_lightCol * lt * ph * 0.85 + dimAmb * (0.35 + 0.85 * h) * 1.7) * (1.0 - 0.45 * u_storm) * (1.0 - 0.6 * u_stars);
        float a = 1.0 - exp(-dens * dt * 0.06);
        S += T * a * lum; T *= 1.0 - a;
        if (T < 0.03) break;
      }
      c = mix(c, c * T + S, exp(-t0 * 0.00035));
    }
  }
#endif
#endif
  // a morning's mist hides the horizon
  if (u_mist > 0.0) c = mix(c, mistCol(d), u_mist * exp(-max(d.y, 0.0) * 9.0) * 0.85);
  o = vec4(display(c), 1.0);
}`;
  return [vs, fs];
}

/** Mobs and the player in third person: lit like the blocks (their own face shading stands in for the sun's angle). */
export function entityShaders(o = {}) {
  const defs = defsOf(o);
  const vs = head(defs) + SKY + `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_shade;
uniform mat4 u_viewProj, u_shadowMat;
out vec2 v_uv; out float v_shade; out float v_dist; out vec3 v_wp; out vec4 v_sh; out vec4 v_air;
void main() {
  gl_Position = u_viewProj * vec4(a_pos, 1.0); v_uv = a_uv; v_shade = a_shade; v_dist = length(a_pos); v_wp = a_pos; v_air = airAt(a_pos, v_dist);
#if SHADOWS > 0
  v_sh = u_shadowMat * vec4(a_pos + vec3(0.0, 0.08, 0.0), 1.0);
#else
  v_sh = vec4(0.0);
#endif
}`;
  const fs = head(defs) + LIGHT + (defs.SHADOWS ? SHADOW : '') + `
uniform sampler2D u_img;
uniform vec2 u_light;
uniform float u_hurt, u_white;
uniform vec3 u_tint;
in vec2 v_uv; in float v_shade; in float v_dist; in vec3 v_wp; in vec4 v_sh; in vec4 v_air; out vec4 o;
void main() {
  vec4 c = texture(u_img, v_uv);
  if (c.a < 0.1) discard;
  float sky = clamp(u_light.x / 15.0, 0.0, 1.0), blk = max(clamp(u_light.y / 15.0, 0.0, 1.0), clamp(u_held - v_dist / 15.0, 0.0, 1.0)), sh = 1.0;
#if SHADOWS > 0
  if (u_shadowOn > 0.5) sh = shadowAt(v_sh);
#endif
  vec3 L = u_lightCol * clamp((v_shade - 0.45) * 1.7, 0.0, 1.0) * max(u_lightDir.y, 0.25) * sh * smoothstep(0.55, 0.95, sky)
    + u_ambCol * sky * sky + u_blockCol * (pow(blk, 2.2) * 1.2 + pow(blk, 9.0) * 1.0) * u_flicker + vec3(0.012 + u_bright);
  vec3 col = lin(c.rgb * u_tint) * L;
  col = mix(col, vec3(1.0, 0.1, 0.06) * max(L, vec3(0.25)), u_hurt * 0.45);
  col = mix(col, vec3(2.0), u_white);
  o = vec4(display(mix(col, v_air.rgb, v_air.a)), 1.0);
}`;
  return [vs, fs];
}

/** The distant view's coarse land: coloured voxels, lit and fogged like the near land; nothing where real columns are. */
export function lodShaders(o = {}) {
  const defs = defsOf(o);
  const vs = head(defs) + `
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
  const fs = head(defs) + LIGHT + `
uniform float u_inner, u_plain;
in vec3 v_wp; in vec3 v_col; in vec3 v_n; in float v_water; out vec4 o;
void main() {
  if (length(v_wp.xz) < u_inner) discard;
  vec3 N = v_n, albedo = lin(v_col);
  vec3 col = albedo * (u_lightCol * max(dot(N, u_lightDir), 0.0) + u_ambCol * (0.62 + 0.38 * (N.y * 0.5 + 0.5)) + vec3(0.012 + u_bright));
  // water: deep and dark under its mirror of the sky, as the near water is (lit like land it was a pale cyan)
  if (v_water > 0.5) { vec3 V = normalize(-v_wp), R = reflect(-V, N); float fr = 0.02 + 0.98 * pow(1.0 - max(V.y, 0.0), 5.0); col = mix(albedo * (u_ambCol * 0.45 + u_lightCol * max(u_lightDir.y, 0.0) * 0.12), skyCol(normalize(vec3(R.x, max(R.y, 0.03), R.z))), fr); }
  if (u_plain > 0.5) { o = vec4(sqrt(clamp(col, 0.0, 1.0)), 1.0); return; }
  vec4 air = airAt(v_wp, length(v_wp));
  o = vec4(display(mix(col, air.rgb, air.a)), 1.0);
}`;
  return [vs, fs];
}

const FULL_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() { vec2 p = P[gl_VertexID]; gl_Position = vec4(p, 0.0, 1.0); v_uv = p * 0.5 + 0.5; }`;

/** Without float pictures (high): light shafts from the sun through gaps (where the sky shows), and a soft dark edge. */
export function postShaders() {
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
  return [FULL_VS, fs];
}

/**
 * Bloom, one step down a chain of half-size pictures (down) or back up (up, added onto the bigger one): a soft blur
 * of five (down) or nine (up) samples. The first step down keeps only what is really bright (the sun, a torch's
 * flame, glints on water), not a sunny beach.
 */
export function bloomShaders(up) {
  const fs = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_px;
uniform float u_first, u_weight;
in vec2 v_uv; out vec4 o;
vec3 at(vec2 d) { return texture(u_src, v_uv + d * u_px).rgb; }
void main() {
${up ? `  vec3 c = at(vec2(0.0)) * 4.0 + (at(vec2(1.0, 0.0)) + at(vec2(-1.0, 0.0)) + at(vec2(0.0, 1.0)) + at(vec2(0.0, -1.0))) * 2.0
    + at(vec2(1.0, 1.0)) + at(vec2(-1.0, 1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, -1.0));
  o = vec4(c / 16.0 * u_weight, 1.0);` : `  vec3 c = (at(vec2(0.0)) * 4.0 + at(vec2(-1.0, -1.0)) + at(vec2(1.0, -1.0)) + at(vec2(-1.0, 1.0)) + at(vec2(1.0, 1.0))) / 8.0;
  if (u_first > 0.5) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c *= 0.02 + 0.98 * smoothstep(1.6, 4.5, l); }
  o = vec4(min(c, vec3(64.0)), 1.0);`}
}`;
  return [FULL_VS, fs];
}

/**
 * The end of a shaded frame (HDR): edge shade (ao: samples), the light the air catches (vol: steps — shafts through
 * the gaps from the shadow map, a morning's mist lit up, under water the shafts from the waves), the bloom, the lens
 * flare, the film (exposure, the curve, colour); out as display colour with its brightness in alpha for the smoothing
 * after.
 */
export function compositeShaders(o = {}) {
  const fs = `#version 300 es
#define AO ${o.ao || 0}
#define VOL ${o.vol || 0}
precision highp float;
uniform sampler2D u_color, u_depth, u_bloom, u_noise;
uniform highp sampler2DShadow u_shadow;
uniform vec2 u_px, u_tanHalf;
uniform float u_bloomAmt, u_near, u_far, u_exposure, u_underwater, u_time, u_flare, u_shadowOn, u_camY, u_mist, u_haze, u_waterY, u_volFar;
uniform vec3 u_lightDir, u_lightCol, u_camPos, u_waterCol;
uniform mat4 u_shadowMat;
uniform mat3 u_toWorld;
in vec2 v_uv; out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float linearDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
vec3 viewPos(vec2 uv) { float z = linearDepth(texture(u_depth, uv).r); return vec3((uv * 2.0 - 1.0) * u_tanHalf * z, -z); }
vec3 film(vec3 c) {
  c *= u_exposure;
  // half each channel through the curve (bright colours go toward white, as film does), half the brightness through it
  // with the colour kept (bright sand stays sand-coloured)
  float l0 = luma(c), lc = clamp((l0 * (2.51 * l0 + 0.08)) / (l0 * (2.43 * l0 + 0.59) + 0.14), 0.0, 1.0);
  c = mix(clamp((c * (2.51 * c + 0.08)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0), c * (lc / max(l0, 1e-5)), 0.5);
  float l = luma(c);
  return clamp(mix(vec3(l), c, mix(0.8, 1.05, smoothstep(0.0, 0.25, l))), 0.0, 1.0);
}
#if VOL
// under water, the shafts: broad soft beams from where the waves gather the light, drifting
float beams(vec2 p) {
  float a = textureLod(u_noise, p * 0.03 + u_time * vec2(0.004, 0.0025), 0.0).r, b = textureLod(u_noise, p * 0.045 - u_time * vec2(0.003, 0.004) + 0.5, 0.0).r;
  return smoothstep(0.45, 0.8, a * 0.6 + b * 0.4);
}
// the light the air on the way to this pixel catches (the shafts through a forest, a lit morning mist): steps along
// the view (closer together near the eye), each lit where the shadow map says the sun or moon reaches it, by how much
// air is there — a little haze, thinning upward, and the mist low down — and much more looking toward the light (the
// haze sends it on forward). Under water: the light comes down in moving shafts from the waves.
vec3 airLight(vec2 uv, float d) {
  vec3 dv = normalize(vec3((uv * 2.0 - 1.0) * u_tanHalf, -1.0)), dir = u_toWorld * dv;
  float far = d >= 0.99999 ? u_volFar : min(linearDepth(d) / -dv.z, u_volFar);
  float j = ign(gl_FragCoord.xy), prev = 0.0, s = 0.0, cosT = dot(dir, u_lightDir);
  bool wet = u_underwater > 0.5;
  for (int i = 0; i < VOL; i++) {
    float f = (float(i) + j) / float(VOL), t = far * f * f, dt = t - prev;
    prev = t;
    vec3 p = dir * t;
    float y = u_camY + p.y, lit, dens;
    if (wet) {
      float below = u_waterY - y;
      if (below < 0.0) continue;
      lit = beams(u_camPos.xz + p.xz + u_lightDir.xz / max(u_lightDir.y, 0.2) * below) * exp(-below * 0.05);
      dens = 0.012;
    } else {
      vec3 q = (u_shadowMat * vec4(p, 1.0)).xyz * 0.5 + 0.5;
      lit = u_shadowOn > 0.5 && q.x > 0.0 && q.y > 0.0 && q.x < 1.0 && q.y < 1.0 && q.z < 1.0 ? textureLod(u_shadow, vec3(q.xy, q.z - 0.0015), 0.0) : 1.0;
      dens = u_haze * exp(-max(y - 63.0, 0.0) * 0.02) + u_mist * 0.012 * exp(-max(y - 62.0, 0.0) * 0.06);
    }
    s += lit * dens * dt;
  }
  float ph = wet ? 0.6 + 2.0 * pow(max(cosT, 0.0), 3.0) : 0.35 + 2.0 * pow(max(cosT, 0.0), 12.0);
  return (wet ? u_waterCol : u_lightCol) * ph * s;
}
#endif
void main() {
  // under water the picture sways a little, slowly
  vec2 uv = v_uv + (u_underwater > 0.5 ? vec2(sin(v_uv.y * 9.0 + u_time * 0.9), cos(v_uv.x * 8.0 + u_time * 0.7)) * 0.0015 : vec2(0.0));
  vec3 c = texture(u_color, uv).rgb;
  float d = texture(u_depth, uv).r;
#if AO
  // edge shade: how much of the half-space in front of this point the nearby land fills (a few samples round it)
  if (d < 0.99999) {
    vec3 P = viewPos(uv), N = normalize(cross(dFdx(P), dFdy(P)));
    float r = 0.55 / (-P.z * u_tanHalf.y), a = ign(gl_FragCoord.xy) * 6.2832, occ = 0.0;
    for (int i = 0; i < AO; i++) {
      float t = (float(i) + 0.5) / float(AO), b = float(i) * 2.39996 + a;
      vec3 v = viewPos(uv + vec2(cos(b), sin(b)) * sqrt(t) * r) - P;
      float l = length(v);
      occ += max(dot(N, v / max(l, 1e-4)) - 0.15, 0.0) * smoothstep(1.6, 0.3, l);
    }
    c *= 1.0 - clamp(occ / float(AO) * 0.9, 0.0, 0.45);
  }
#endif
#if VOL
  if (u_volFar > 0.0) c += airLight(uv, d);
#endif
  c += texture(u_bloom, uv).rgb * u_bloomAmt;
  // the lens's flare: soft ghosts of whatever is brightest (the bloom picture, blurred already, so they are round and
  // soft and shaped like their light) mirrored through the middle of the picture at a few sizes, their rims split
  // into colour; fading as their light nears the picture's edge
  if (u_flare > 0.0) {
    // (size: less than 0 across the middle; strength)
    const vec2 GH[5] = vec2[5](vec2(-0.45, 0.035), vec2(-0.8, 0.02), vec2(0.55, 0.02), vec2(-1.3, 0.012), vec2(-2.1, 0.008));
    const vec3 TINT[5] = vec3[5](vec3(1.0, 0.7, 0.4), vec3(0.45, 1.0, 0.7), vec3(1.0, 0.85, 0.5), vec3(0.6, 0.5, 1.0), vec3(0.4, 0.65, 1.0));
    vec2 m = uv - 0.5, out_ = normalize(m + 1e-5);
    vec3 fl = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      vec2 src = 0.5 + m / GH[i].x, e = abs(src - 0.5);
      if (max(e.x, e.y) > 0.5) continue;
      vec2 fr = out_ * 0.012 / abs(GH[i].x);
      vec3 g = vec3(texture(u_bloom, src + fr).r, texture(u_bloom, src).g, texture(u_bloom, src - fr).b);
      fl += g * TINT[i] * GH[i].y * (1.0 - smoothstep(0.15, 0.48, max(e.x, e.y)));
    }
    c += fl * u_flare;
  }
  c = sqrt(film(c));
  o = vec4(c, luma(c));
}`;
  return [FULL_VS, fs];
}

/**
 * Smoothing the stair-stepped edges (our own small edge blend: where brightness jumps across a pixel, blend along the
 * edge), and the soft dark rim of the picture.
 */
export function edgeShaders() {
  const fs = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform vec2 u_px;
in vec2 v_uv; out vec4 o;
void main() {
  vec4 m = texture(u_img, v_uv);
  float n = texture(u_img, v_uv + vec2(0.0, u_px.y)).a, s = texture(u_img, v_uv - vec2(0.0, u_px.y)).a;
  float e = texture(u_img, v_uv + vec2(u_px.x, 0.0)).a, w = texture(u_img, v_uv - vec2(u_px.x, 0.0)).a;
  float lo = min(m.a, min(min(n, s), min(e, w))), hi = max(m.a, max(max(n, s), max(e, w)));
  vec3 c = m.rgb;
  float k = 0.0;
  if (hi - lo > max(0.05, hi * 0.15)) {
    vec2 g = vec2(e - w, n - s), t = normalize(vec2(-g.y, g.x) + 1e-5) * u_px;
    k = clamp((hi - lo) * 2.0, 0.0, 1.0);
    vec3 along = (texture(u_img, v_uv + t).rgb + texture(u_img, v_uv - t).rgb + texture(u_img, v_uv + t * 2.0).rgb * 0.5 + texture(u_img, v_uv - t * 2.0).rgb * 0.5) / 3.0;
    c = mix(c, along, k * 0.75);
  }
  vec3 around = (texture(u_img, v_uv + vec2(0.0, u_px.y)).rgb + texture(u_img, v_uv - vec2(0.0, u_px.y)).rgb + texture(u_img, v_uv + vec2(u_px.x, 0.0)).rgb + texture(u_img, v_uv - vec2(u_px.x, 0.0)).rgb) * 0.25;
  c = clamp(c + (m.rgb - around) * 0.35 * (1.0 - k), 0.0, 1.0);
  c *= mix(0.85, 1.0, smoothstep(1.15, 0.4, length(v_uv - 0.5) * 1.35));
  o = vec4(c, 1.0);
}`;
  return [FULL_VS, fs];
}
