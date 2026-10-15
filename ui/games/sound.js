// 游戏音效: short sounds made on the spot with Web Audio (no sound files), soft enough to play over music. One audio
// context for all the games, started by the first touch (browsers keep it silent before that). Sound on or off is
// kept in this browser.

const KEY = 'st-iphonie-game-sound';
const NOTE = n => 440 * 2 ** ((n - 69) / 12);

export function gameSounds(win) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  let audio = null, on = true;
  try { on = win.localStorage.getItem(KEY) !== 'off'; } catch { /* on */ }
  const ready = () => {
    if (!Ctx || !on) return null;
    if (!audio) { try { audio = new Ctx(); } catch { return null; } }
    if (audio.state === 'suspended') audio.resume?.().catch(() => {});
    return audio;
  };
  /** A tone: freq (to: glides there), wave, when (s from now), length (s), level. */
  function tone(a, {freq, to = 0, type = 'sine', at = 0, len = .1, level = .12}) {
    const t = a.currentTime + .005 + at, osc = a.createOscillator(), gain = a.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + len);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level, t + .006); gain.gain.exponentialRampToValueAtTime(.0008, t + len);
    osc.connect(gain).connect(a.destination); osc.start(t); osc.stop(t + len + .02);
  }
  /** A burst of noise through a band: freq (centre), length, level — knocks, flips, a bang. */
  function noise(a, {freq = 1200, at = 0, len = .08, level = .2, q = 1.2}) {
    const t = a.currentTime + .005 + at, frames = Math.max(1, Math.round(a.sampleRate * len)), buffer = a.createBuffer(1, frames, a.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    const src = a.createBufferSource(), band = a.createBiquadFilter(), gain = a.createGain();
    src.buffer = buffer; band.type = 'bandpass'; band.frequency.value = freq; band.Q.value = q; gain.gain.value = level;
    src.connect(band).connect(gain).connect(a.destination); src.start(t);
  }
  const notes = (a, list, {type = 'triangle', gap = .09, len = .16, level = .1} = {}) => list.forEach((n, i) => tone(a, {freq: NOTE(n), type, at: i * gap, len, level}));
  const SOUNDS = {
    tap: a => tone(a, {freq: 880, type: 'triangle', len: .05, level: .06}),
    slide: a => { noise(a, {freq: 900, len: .06, level: .12}); tone(a, {freq: 330, to: 420, type: 'triangle', len: .07, level: .05}); },
    // 2048: higher for bigger tiles.
    merge: (a, {value = 4} = {}) => { const n = 60 + Math.min(14, Math.log2(value)) * 2; tone(a, {freq: NOTE(n), to: NOTE(n + 7), type: 'sine', len: .12, level: .12}); },
    eat: a => notes(a, [76, 83], {type: 'square', gap: .05, len: .07, level: .045}),
    turn: a => tone(a, {freq: 620, type: 'square', len: .035, level: .035}),
    drop: a => { noise(a, {freq: 300, len: .12, level: .25}); tone(a, {freq: 150, to: 70, len: .14, level: .12}); },
    line: (a, {count = 1} = {}) => notes(a, [72, 76, 79, 84].slice(0, 1 + count), {type: 'square', gap: .06, len: .12, level: .05}),
    bounce: a => tone(a, {freq: 440, type: 'square', len: .04, level: .05}),
    brick: a => tone(a, {freq: 990, to: 1250, type: 'triangle', len: .06, level: .07}),
    miss: a => notes(a, [64, 60], {type: 'triangle', gap: .1, len: .16, level: .08}),
    flip: a => noise(a, {freq: 2400, len: .05, level: .16, q: .8}),
    match: a => notes(a, [79, 84], {type: 'sine', gap: .07, len: .18, level: .1}),
    place: a => { noise(a, {freq: 1800, len: .04, level: .3, q: 2}); tone(a, {freq: 220, to: 180, len: .07, level: .08}); },
    open: a => tone(a, {freq: 700, type: 'triangle', len: .04, level: .06}),
    flag: a => notes(a, [81, 86], {type: 'square', gap: .04, len: .05, level: .04}),
    boom: a => { noise(a, {freq: 140, len: .6, level: .7, q: .5}); tone(a, {freq: 90, to: 35, len: .5, level: .15}); },
    win: a => notes(a, [72, 76, 79, 84, 88], {type: 'triangle', gap: .08, len: .24, level: .1}),
    lose: a => notes(a, [67, 63, 60, 55], {type: 'triangle', gap: .12, len: .22, level: .09}),
  };
  return {
    play(name, options) { const a = ready(); if (a && SOUNDS[name]) { try { SOUNDS[name](a, options); } catch { /* a sound is never worth an error */ } } },
    get on() { return on; },
    set on(value) { on = !!value; try { win.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* this visit only */ } if (!on) audio?.suspend?.().catch(() => {}); },
    close() { audio?.close?.().catch(() => {}); audio = null; },
  };
}
