// Sounds made on the spot with Web Audio (no sound files): steps, breaking and placing by material, digging taps,
// picking up, splashes, water meeting lava, hurt, eating, the click of the menus. Quiet by default.
import {BLOCKS} from './blocks.js';

let ctx = null, master = null, noiseBuf = null;
export const sound = {volume: 0.7};
export function unlockSound() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = sound.volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v) { sound.volume = v; if (master) master.gain.value = v; }
/** The kind of sound a block makes. */
export function materialOf(v) {
  const b = BLOCKS[v & 0xFFF];
  if (!b) return 'stone';
  const n = b.name;
  if (/_log|_planks|crafting|chest|bookshelf|ladder|oak_slab|pumpkin|melon/.test(n)) return 'wood';
  if (/grass_block|dirt|podzol|farmland|clay|moss|mud|leaves|sapling|short_grass|fern|cactus|sugar_cane|wheat|mushroom|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily|dead_bush/.test(n)) return 'grass';
  if (/sand|gravel/.test(n)) return 'sand';
  if (/glass|ice|glowstone/.test(n)) return 'glass';
  if (/wool/.test(n)) return 'cloth';
  if (/snow/.test(n)) return 'snow';
  return 'stone';
}
const MAT = {stone: [900, 3, 0.9], wood: [420, 6, 0.8], grass: [1800, 1.2, 0.6], sand: [2600, 0.9, 0.55], glass: [3200, 8, 0.7], cloth: [700, 0.7, 0.4], snow: [2200, 0.8, 0.45]};
function burst(freq, q, gain, dur, {pitch = 1, at = 0} = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.playbackRate.value = pitch;
  f.type = 'bandpass'; f.frequency.value = freq * pitch; f.Q.value = q;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function tone(freq, gain, dur, {type = 'sine', slide = 0, at = 0} = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
/** A mob's voice: its own call, higher when hurt, lower and longer when it dies. */
function voice(kind, mood, k) {
  const p = mood === 'hurt' ? 1.35 : mood === 'death' ? 0.75 : 0.9 + Math.random() * 0.2, g = 0.9 * k, long = mood === 'death' ? 1.6 : 1;
  switch (kind) {
    case 'pig': tone(170 * p, 0.16 * g, 0.12 * long, {type: 'square', slide: 0.8}); tone(150 * p, 0.14 * g, 0.12 * long, {type: 'square', slide: 0.75, at: 0.16}); burst(500 * p, 1, 0.08 * g, 0.2); break;
    case 'cow': tone(135 * p, 0.14 * g, 0.7 * long, {type: 'sawtooth', slide: 0.75}); break;
    case 'sheep': for (let i = 0; i < 4; i++) tone(310 * p, 0.08 * g, 0.09 * long, {type: 'square', slide: 0.97, at: i * 0.08}); break;
    case 'chicken': for (let i = 0; i < 3; i++) tone(850 * p, 0.06 * g, 0.05, {type: 'square', slide: 0.7, at: i * 0.09}); break;
    case 'zombie': tone(88 * p, 0.18 * g, 0.9 * long, {type: 'sawtooth', slide: 0.7}); burst(300 * p, 1.5, 0.12 * g, 0.7 * long); break;
    case 'skeleton': for (let i = 0; i < 5; i++) burst(2600 * p, 6, 0.12 * g, 0.04, {at: i * 0.05 + Math.random() * 0.02}); break;
    case 'spider': burst(3800 * p, 1.5, 0.12 * g, 0.4 * long); break;
    case 'creeper': burst(2000, 1, 0.08 * g, 0.2); break;
  }
}
/** Plays a sound: break, place, step, hit (digging), pop, splash, fizz, hurt, eat, burp, click, levelup, and the mobs'. */
export function play(name, v = 0, k = 1) {
  if (!ctx || !sound.volume || k <= 0) return;
  const [kind, mood] = name.split('_');
  if (['pig', 'cow', 'sheep', 'chicken', 'zombie', 'skeleton', 'spider', 'creeper'].includes(kind)) { voice(kind, mood, k); return; }
  const [f, q, g] = MAT[materialOf(v)] || MAT.stone, r = 0.85 + Math.random() * 0.3;
  switch (name) {
    case 'break': burst(f, q, g * 0.9, 0.22, {pitch: r}); burst(f * 0.6, q, g * 0.5, 0.18, {pitch: r, at: 0.03}); break;
    case 'place': burst(f, q, g * 0.7, 0.12, {pitch: r * 1.1}); break;
    case 'step': burst(f, q, g * 0.22 * k, 0.07, {pitch: r}); break;
    case 'hit': burst(f, q, g * 0.3, 0.06, {pitch: r * 1.2}); break;
    case 'pop': tone(700 + Math.random() * 500, 0.12, 0.08, {slide: 1.6}); break;
    case 'splash': burst(1200, 0.7, 0.5, 0.45, {pitch: 0.9}); burst(500, 1, 0.3, 0.6, {at: 0.05}); break;
    case 'swim': burst(900, 0.8, 0.12, 0.25); break;
    case 'fizz': burst(5000, 0.6, 0.35, 0.5); break;
    case 'hurt': tone(240, 0.25, 0.18, {type: 'square', slide: 0.6}); burst(800, 2, 0.15, 0.1); break;
    case 'eat': for (let i = 0; i < 3; i++) burst(1500, 1.5, 0.25, 0.06, {at: i * 0.11, pitch: 0.8 + Math.random() * 0.4}); break;
    case 'burp': tone(110, 0.3, 0.35, {type: 'sawtooth', slide: 0.7}); break;
    case 'click': tone(1300, 0.1, 0.04, {type: 'square'}); break;
    case 'fall': burst(300, 1, 0.5 * k, 0.25); break;
    case 'levelup': [523, 659, 784].forEach((fr, i) => tone(fr, 0.15, 0.25, {at: i * 0.08})); break;
    case 'explode': burst(160, 0.6, 0.9 * k, 1.1); burst(900, 0.8, 0.5 * k, 0.4); tone(55, 0.5 * k, 0.9, {type: 'sawtooth', slide: 0.5}); break;
    case 'fuse': burst(3000, 0.8, 0.25 * k, 1.4); break;
    case 'bow': tone(240, 0.2 * k, 0.15, {type: 'triangle', slide: 0.55}); burst(1800, 2, 0.12 * k, 0.08); break;
    case 'arrow_hit': burst(700, 2, 0.3 * k, 0.07); break;
    case 'shear': burst(6000, 3, 0.25, 0.05); burst(6000, 3, 0.25, 0.05, {at: 0.12}); break;
    case 'ignite': burst(2500, 1, 0.3, 0.25); tone(1600, 0.08, 0.05, {type: 'square'}); break;
    case 'attack': burst(1200, 1.5, 0.25 * k, 0.08, {pitch: r}); break;
    case 'meal': for (let i = 0; i < 4; i++) tone(900 + Math.random() * 900, 0.05, 0.08, {at: i * 0.05}); break;
  }
}
