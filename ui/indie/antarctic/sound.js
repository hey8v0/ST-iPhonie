// 南极结界 · sounds made on the spot with Web Audio (no sound files): steps by the ground underfoot, the tools landing,
// picking things up and setting them down, the bin's coins, doors, the menus, a new page of the 见闻录, going to bed; and,
// quietly round one, the wind (more of it in winter), the waves on the shore, the waterfall when near it, the fire
// indoors, birds by day, crickets on warm nights, gulls over the sea. One volume, kept by this browser (设置 → 音量).
let ctx = null, master = null, sfxBus = null, ambBus = null, noise = null;
const VOL_KEY = 'antarctic-volume';
export const sound = {volume: .7};
try { const v = parseFloat(localStorage.getItem(VOL_KEY)); if (Number.isFinite(v)) sound.volume = Math.max(0, Math.min(1, v)); } catch { /* storage may be off */ }

/** Sound may only start after the player has touched or pressed something: called on each of those (cheap after the first). */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {}); return; }
  try {
    ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = sound.volume; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = .6; ambBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v) {
  sound.volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.setTargetAtTime(sound.volume, ctx.currentTime, .03);
  try { localStorage.setItem(VOL_KEY, String(sound.volume)); } catch { /* storage may be off */ }
}
/** Put away (another tab, the phone locked): silent until back. */
export function pause(on) { if (!ctx) return; (on ? ctx.suspend() : ctx.resume()).catch(() => {}); }

// ── the parts: a tone that glides, and a breath of filtered noise ──
function tone({type = 'sine', f, f2 = f, t = 0, dur = .1, gain = .2, attack = .005, filter = null, q = 1, pan = 0, bus = sfxBus}) {
  const o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, at); if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), at + dur);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter[0]; fl.frequency.value = filter[1]; fl.Q.value = q; o.connect(fl); node = fl; }
  node.connect(g); out(g, pan, bus); o.start(at); o.stop(at + dur + .05);
}
function hiss({t = 0, dur = .1, gain = .2, type = 'bandpass', f = 1000, f2 = f, q = 1, attack = .004, pan = 0, bus = sfxBus}) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), at = ctx.currentTime + t;
  s.buffer = noise; s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, at); if (f2 !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), at + dur); fl.Q.value = q;
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
  s.connect(fl); fl.connect(g); out(g, pan, bus); s.start(at, Math.random() * 1.5); s.stop(at + dur + .05);
}
function out(node, pan, bus) {
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); p.connect(bus); } else node.connect(bus);
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ── what things sound like ──
const SFX = {
  // a step: soft swish in grass, crunch on the path, shush in dry sand, a wet pat on the flat, a knock on floorboards
  step: ground => ground === 'wood' ? (tone({type: 'triangle', f: rnd(130, 150), f2: 90, dur: .06, gain: .06}), hiss({dur: .03, gain: .03, f: 900, q: .8}))
    : ground === 'sand' ? hiss({dur: .09, gain: .05, f: 1700, f2: 800, q: .7, type: 'lowpass'})
    : ground === 'wet' ? hiss({dur: .08, gain: .05, f: 650, f2: 380, q: 1.6})
    : ground === 'path' ? hiss({dur: .06, gain: .065, f: rnd(2200, 2700), q: .9})
    : hiss({dur: .07, gain: .04, f: rnd(3000, 3600), f2: 1800, q: .6}),
  swing: () => hiss({dur: .14, gain: .035, f: 900, f2: 2600, q: 1.2, attack: .05}),
  dig: () => { tone({f: 120, f2: 60, dur: .12, gain: .24}); hiss({t: .01, dur: .18, gain: .13, f: 600, f2: 280, q: .9}); },
  thud: () => tone({f: 95, f2: 60, dur: .1, gain: .14}),
  water: () => { hiss({dur: .5, gain: .07, f: 2300, f2: 1500, q: 1.1, attack: .06}); for (let k = 0; k < 4; k++) tone({f: rnd(900, 1500), f2: 1900, t: .14 + k * .08, dur: .05, gain: .035}); },
  fill: () => { for (let k = 0; k < 6; k++) tone({f: 300 + k * 90, f2: 620 + k * 120, t: k * .06, dur: .08, gain: .05}); },
  sow: () => { for (let k = 0; k < 3; k++) hiss({t: k * .045, dur: .03, gain: .05, f: 4200, q: 2}); },
  harvest: () => { tone({f: 520, f2: 880, dur: .12, gain: .11}); tone({type: 'triangle', f: 1320, t: .06, dur: .1, gain: .045}); },
  chop: () => { tone({type: 'triangle', f: rnd(200, 225), f2: 150, dur: .1, gain: .22}); tone({type: 'square', f: 420, f2: 300, dur: .04, gain: .045, filter: ['lowpass', 1200]}); hiss({dur: .05, gain: .09, f: 1500}); },
  mine: () => { tone({type: 'square', f: rnd(1700, 1900), f2: 1500, dur: .09, gain: .045, filter: ['bandpass', 2400], q: 4}); tone({type: 'triangle', f: 900, f2: 700, dur: .14, gain: .09}); hiss({dur: .06, gain: .09, f: 3500}); },
  fell: () => { tone({type: 'sawtooth', f: 90, f2: 60, dur: .5, gain: .05, filter: ['lowpass', 400]}); hiss({t: .25, dur: .45, gain: .17, f: 300, f2: 110, q: .7, type: 'lowpass'}); tone({f: 70, f2: 40, t: .3, dur: .35, gain: .28}); },
  pickup: () => { const b = rnd(640, 760); tone({f: b, f2: b * 1.5, dur: .09, gain: .09}); },
  place: () => { tone({type: 'triangle', f: 180, f2: 120, dur: .08, gain: .15}); hiss({dur: .05, gain: .05, f: 800}); },
  coin: () => { for (let k = 0; k < 3; k++) tone({type: 'triangle', f: 1568 + k * 220, t: k * .07, dur: .14, gain: .06}); },
  door: () => { tone({type: 'sawtooth', f: 160, f2: 230, dur: .22, gain: .028, filter: ['bandpass', 600], q: 3}); tone({type: 'triangle', f: 110, t: .2, dur: .1, gain: .14}); },
  open: () => tone({f: 520, f2: 700, dur: .06, gain: .05}),
  close: () => tone({f: 600, f2: 420, dur: .06, gain: .045}),
  tick: () => tone({f: 900, dur: .025, gain: .025}),
  lore: () => { [784, 988, 1175, 1568].forEach((f, k) => tone({f, t: k * .07, dur: .35, gain: .05})); },
  sleep: () => { [523, 659, 784, 1047].forEach((f, k) => tone({f, t: k * .18, dur: .7, gain: .05})); },
  pet: () => { tone({f: 700, f2: 1100, dur: .08, gain: .05}); tone({f: 900, f2: 1400, t: .1, dur: .1, gain: .045}); },
  splash: () => hiss({dur: .55, gain: .11, f: 1200, f2: 480, q: .8, attack: .03}),
};
/** A sound by name (step takes the ground: grass, path, sand, wet, wood). */
export function play(name, arg) { if (!ctx || ctx.state !== 'running' || !sound.volume) return; try { SFX[name]?.(arg); } catch { /* a sound is never worth an error */ } }

// ── round one: beds of noise that rise and fall, and calls now and then ──
const amb = {beds: {}, next: {}};
function bed(name, type, f, q) {
  if (amb.beds[name]) return amb.beds[name];
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
  s.connect(fl); fl.connect(g); g.connect(ambBus); s.start(0, Math.random() * 1.5);
  return amb.beds[name] = {g, fl};
}
const level = (b, v, k = .8) => b.g.gain.setTargetAtTime(v, ctx.currentTime, k);
function birdCall() {
  const pan = rnd(-.8, .8), n = 2 + Math.floor(Math.random() * 4), base = rnd(2200, 3400), up = Math.random() < .5;
  for (let k = 0; k < n; k++) tone({f: base * (up ? 1 : 1.3), f2: base * (up ? 1.35 : .95) + k * 40, t: k * rnd(.09, .14), dur: rnd(.05, .09), gain: .022, pan, bus: ambBus});
}
function cricket() { const pan = rnd(-.9, .9), f = rnd(4100, 4600); for (let k = 0; k < 4; k++) tone({f, t: k * .028, dur: .016, gain: .012, attack: .002, pan, bus: ambBus}); }
function gullCry() { const pan = rnd(-.7, .7); for (let k = 0; k < 2; k++) tone({type: 'sawtooth', f: 1450, f2: 880, t: k * .26, dur: .22, gain: .016, filter: ['bandpass', 1600], q: 2, pan, bus: ambBus}); }
function crackle() { for (let k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) hiss({t: k * rnd(.02, .06), dur: .012, gain: rnd(.04, .09), type: 'highpass', f: 2200, q: .7, attack: .001, bus: ambBus}); }
/**
 * Each frame, where one is: {scene: farm | shore | town | house | attic, hour, season (0 春 … 3 冬), fall: 0–1 how near the
 * waterfall is, fire: the hearth burning nearby}.
 */
export function ambient(w) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime, outdoor = w.scene === 'farm' || w.scene === 'shore' || w.scene === 'town', day = w.hour >= 5.5 && w.hour < 19.5;
  const wind = bed('wind', 'lowpass', 520, .6), waves = bed('waves', 'lowpass', 720, .5), fall = bed('fall', 'bandpass', 1400, .4), fire = bed('fire', 'lowpass', 900, .7);
  level(wind, outdoor ? (w.season === 3 ? .07 : .022) * (.7 + .3 * Math.sin(t * .23)) : .005);
  const swell = .5 + .5 * Math.sin(t * 2 * Math.PI / 7.5); // a wave breaks every few seconds
  level(waves, w.scene === 'shore' ? .045 + .12 * swell * swell : w.scene === 'town' ? .02 + .03 * swell * swell : w.scene === 'farm' ? .012 : 0, .4);
  level(fall, w.scene === 'farm' ? .17 * (w.fall || 0) : 0, .3);
  level(fire, w.fire ? .03 : 0, .5);
  const due = (name, gap) => { if ((amb.next[name] ??= t + gap * Math.random()) > t) return false; amb.next[name] = t + gap * rnd(.5, 1.5); return true; };
  if (outdoor && day && w.season !== 3 && due('bird', 2.8)) birdCall();
  if (outdoor && !day && (w.season === 0 || w.season === 1) && due('cricket', .8)) cricket();
  if ((w.scene === 'shore' || w.scene === 'town') && day && due('gull', w.scene === 'shore' ? 9 : 20)) gullCry();
  if (w.fire && due('crackle', .32)) crackle();
}
