// 电话 and 心声: how a line sounds after it is made. The story marks a line by starting its emotion with 「心声」 or
// 「电话」 (心声·难过, 电话·开心), or the way the user's own story preset writes them (a line inside *…*, `…` and the
// like, as the 配音预设 says: markedEffect); the word is taken off before the engine reads the emotion (so the voice and its cache
// are the same as without it), and the line plays through a phone's narrow band, or close and with the echo of a
// voice heard inside one's head. Calls in the phone's 电话 App always sound like a phone.

const WORDS = [
  ['inner', /心声|内心独白|内心|心里话|独白|inner ?voice|inner ?thoughts?/gi],
  ['phone', /电话里|电话|通话|听筒|对讲机|over the phone|on the phone|phone call|telephone|phone/gi],
];
const EDGES = /^[\s·・|,，、:：/\\\-—_()（）]+|[\s·・|,，、:：/\\\-—_()（）]+$/g;
export const VOICE_EFFECTS = Object.freeze({phone: '电话', inner: '心声'});

/** {effect: 'phone' | 'inner' | '', emotion: what is left for the engine (calm when only the word was there)}. */
export function voiceEffect(emotion) {
  const raw = String(emotion ?? '');
  let effect = '', rest = raw;
  for (const [name, re] of WORDS) { re.lastIndex = 0; if (re.test(rest)) { effect ||= name; rest = rest.replace(re, ' '); } }
  if (!effect) return {effect: '', emotion: raw};
  rest = rest.replace(/\s+/g, ' ').replace(EDGES, '').replace(/[·・]\s*[·・]+/g, '·').trim();
  return {effect, emotion: rest || 'calm'};
}
/** The line as the engine should read it: the 心声/电话 word off its emotion. */
export function speakable(line) {
  if (!line || typeof line !== 'object') return line;
  const {effect, emotion} = voiceEffect(line.emotion);
  return effect ? {...line, emotion} : line;
}
/** The effect a line plays with: one it was given (a phone call), else the one its emotion asks for. */
export const lineEffect = line => VOICE_EFFECTS[line?.effect] ? line.effect : voiceEffect(line?.emotion).effect;

// ---------- The story's own way of writing 心声 and 电话 ----------
/** The rule sent with the story (an entry of the 配音预设, which the user can change or turn off). */
export const EFFECTS_PROMPT = '【心声和电话】要念出来的心声，台词照样写成 {{格式}}，情绪字段开头写「心声·」（如 心声·难过）；隔着电话、听筒传来的话，情绪字段开头写「电话·」（如 电话·开心）。插件会把它做成心声的回响或电话里的声音，后面的情绪照朗读规则写。';
/** Ways a story may wrap 心声 or 电话, offered as choices (open…close). */
export const MARK_CHOICES = Object.freeze(['*…*', '`…`', '（…）', '【…】', '『…』', '「…」', '~…~']);
const MARK_LIMIT = 8;
/** One way of wrapping, as written in the 配音预设 ("*…*", "『 』", "<i>...</i>"): [open, close], or null. */
export function markPair(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 24) return null;
  const parts = text.includes('…') ? text.split('…') : text.includes('...') ? text.split('...') : /\s/.test(text) ? text.split(/\s+/) : text.length === 2 ? [...text] : [text, text];
  if (parts.length !== 2) return null;
  const [open, close] = parts.map(t => t.trim());
  return open && close && open.length <= 10 && close.length <= 10 ? [open, close] : null;
}
/** {inner: ['*…*', …], phone: […]}: known, written the same way, no repeats. */
export function normalizeMarks(value) {
  const list = v => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[\s,，、]+/)).map(markPair).filter(Boolean).map(([o, c]) => o + '…' + c))].slice(0, MARK_LIMIT);
  return {inner: list(value?.inner), phone: list(value?.phone)};
}
/** Where text wrapped by [open, close] sits: [[from, to]] (inside one paragraph; ** and `` are bold and code, not marks). */
function spans(text, [open, close]) {
  const out = [];
  let at = 0;
  while (out.length < 200) {
    const from = text.indexOf(open, at);
    if (from < 0) break;
    if (open === close && text.startsWith(open, from + open.length)) { at = from + open.length * 2; while (text.startsWith(open, at)) at += open.length; continue; }
    const to = text.indexOf(close, from + open.length);
    if (to < 0) break;
    const inside = text.slice(from + open.length, to);
    if (/\n\s*\n/.test(inside) || inside.length > 3000) { at = from + open.length; continue; }
    out.push([from, to + close.length]);
    at = to + close.length;
  }
  return out;
}
/**
 * 'inner' or 'phone' when the story wrapped this line (lines from parseDialogue: start, end, translation) the way the
 * preset's marks say — the whole line inside the marks, or its words inside them — else ''.
 */
export function markedEffect(text, line, marks) {
  const m = normalizeMarks(marks), raw = String(text ?? '');
  for (const effect of ['inner', 'phone']) {
    for (const pair of m[effect].map(markPair)) {
      const said = String(line?.translation ?? '').trim();
      if (said.length > pair[0].length + pair[1].length && said.startsWith(pair[0]) && said.endsWith(pair[1])) return effect;
      if (Number.isFinite(line?.start) && spans(raw, pair).some(([a, b]) => line.start >= a && line.end <= b)) return effect;
    }
  }
  return '';
}
/** Lines with the effect the story's marks give them (an effect a line already has stays). */
export const withMarks = (text, lines, marks) => {
  const m = normalizeMarks(marks);
  return m.inner.length || m.phone.length ? lines.map(l => l.effect ? l : (e => e ? {...l, effect: e} : l)(markedEffect(text, l, m))) : lines;
};


// A room's tail, made once per audio context: noise that dies away, a little different in each ear.
const rooms = new WeakMap();
function room(ctx, seconds = 2.4) {
  let buffer = rooms.get(ctx);
  if (buffer) return buffer;
  const length = Math.max(1, Math.round(ctx.sampleRate * seconds));
  buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
  }
  rooms.set(ctx, buffer);
  return buffer;
}
function crunch(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = (1 + amount) * x / (1 + amount * Math.abs(x)); }
  return curve;
}
const filter = (ctx, type, frequency, Q = 0.7, gain = 0) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = Q; f.gain.value = gain; return f; };
const level = (ctx, value) => { const g = ctx.createGain(); g.gain.value = value; return g; };

/**
 * The nodes a line goes through before `out`: {input, tail: seconds it still sounds after the line ends, dispose()}.
 * null for no effect.
 */
export function effectChain(ctx, effect, out) {
  const nodes = [];
  const add = node => { nodes.push(node); return node; };
  const chain = (...list) => { for (let i = 0; i < list.length - 1; i++) list[i].connect(list[i + 1]); return list[0]; };
  let input, tail = 0;
  if (effect === 'phone') {
    // An earpiece: no lows or highs, a forward middle, a little grit.
    const shaper = add(ctx.createWaveShaper());
    shaper.curve = crunch(4); shaper.oversample = '2x';
    input = chain(add(filter(ctx, 'highpass', 380, 0.9)), add(filter(ctx, 'highpass', 380, 0.9)), add(filter(ctx, 'peaking', 1700, 1.1, 6)),
      shaper, add(filter(ctx, 'lowpass', 3300, 1)), add(filter(ctx, 'lowpass', 3300, 1)), add(level(ctx, 0.8)), out);
  } else if (effect === 'inner') {
    // Close and soft, with a room around it that is not quite a real one.
    input = add(level(ctx, 1));
    const dry = add(level(ctx, 0.72)), delay = add(ctx.createDelay(0.2)), verb = add(ctx.createConvolver()), wet = add(level(ctx, 0.55));
    delay.delayTime.value = 0.035;
    verb.buffer = room(ctx);
    chain(input, add(filter(ctx, 'lowpass', 7000, 0.6)), dry, out);
    chain(input, delay, verb, add(filter(ctx, 'highpass', 250, 0.7)), add(filter(ctx, 'lowpass', 4200, 0.7)), wet, out);
    tail = 2.6;
  } else return null;
  let gone = false;
  return {input, tail, dispose() { if (gone) return; gone = true; for (const node of nodes) { try { node.disconnect(); } catch {} } }};
}
