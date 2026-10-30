// NovelAI prompt tokens: how much of a model's prompt budget a picture uses, counted the way NovelAI's own counter
// counts, so a prompt can be written right up to the limit without being cut off.
//   V4 / V4.5   T5 (SentencePiece Unigram), ~512 tokens for the base prompt and every character prompt together
//   V5 Full     Qwen 3.5 (byte-level BPE), ~1471;  V5 Curated ~703
//   the negative prompts have a budget of their own, the same size
// NovelAI's quirks are kept on purpose: for T5 the emphasis syntax ({}, [], 1.2::) is dropped first, every
// whitespace-separated word gets its own "▁", and each prompt ends with one end-of-text token; for V5 the text is
// counted as written. The vocabularies (tokenizers/, Apache-2.0: google-t5/t5-base and Qwen/Qwen3.5-0.8B) are loaded
// on first use. V3 (CLIP) is not counted.

/** The tokenizer and budget of a NovelAI model; null when it is not counted. */
export function tokenBudget(model) {
  const m = String(model || '');
  if (m.startsWith('nai-diffusion-5-curated')) return {kind: 'qwen', limit: 703};
  if (m.startsWith('nai-diffusion-5')) return {kind: 'qwen', limit: 1471};
  if (m.startsWith('nai-diffusion-4')) return {kind: 't5', limit: 512};
  return null;
}

// The counters are built by generators that pause every few thousand entries: built on the spot (tests, counters made
// by hand) they run straight through; loaded in the background (loadCounter) the page gets its turn between the parts.
// The V5 vocabulary took 213 ms in one piece on a computer, so a phone stood still for most of a second.
const finish = build => { let step = build.next(); while (!step.done) step = build.next(); return step.value; };
const pause = () => globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
async function finishSoon(build) { let step = build.next(); while (!step.done) { await pause(); step = build.next(); } return step.value; }

// ---------- T5: Unigram ----------
export function t5Counter(vocab) { return finish(t5Build(vocab)); }
function* t5Build({unk, pieces, scores}) {
  const root = new Map(), at = new WeakMap();
  const low = Math.min(...scores) - 10, score = scores.slice();
  score[unk] = low;
  // A trie by code point, walked by UTF-16 code unit (as NovelAI's is): pieces with characters outside the BMP never
  // match, and such characters fall back to one unknown token per code unit.
  for (let id = 0; id < pieces.length; id++) {
    let node = root;
    for (const ch of pieces[id]) { let next = node.get(ch); if (!next) { next = new Map(); node.set(ch, next); } node = next; }
    at.set(node, id);
    if (id % 4000 === 3999) yield;
  }
  function word(w) {
    const n = w.length, ending = Array.from({length: n + 1}, () => []);
    ending[0].push({best: 0, count: 0});
    for (let start = 0; start < n; start++) {
      const edges = [];
      let node = root, single = false;
      for (let end = start + 1; end <= n && node; end++) {
        node = node.get(w[end - 1]);
        const id = node && at.get(node);
        if (id !== undefined) { edges.push([end, score[id]]); if (end === start + 1) single = true; }
      }
      if (!single) edges.push([start + 1, low]);
      // Each piece takes the first way in with the highest total (the sum compared, not the parts).
      for (const [end, s] of edges) {
        let best = -Infinity, count = 0;
        for (const p of ending[start]) { const total = p.best + s; if (total > best) { best = total; count = p.count + 1; } }
        if (best > -Infinity) ending[end].push({best, count});
      }
    }
    let best = -Infinity, count = 0;
    for (const p of ending[n]) if (p.best > best) { best = p.best; count = p.count; }
    return count;
  }
  const cache = new Map();
  return text => {
    // An empty prompt is just the end-of-text token (a prompt that is only brackets still counts its one empty word).
    if (!text) return 1;
    const stripped = String(text ?? '').replace(/[[\]{}]/g, '').replace(/-?\d*\.?\d*::/g, '');
    let total = 1;
    for (const part of stripped.split(/\s+/)) {
      const w = part.startsWith('▁') ? part : '▁' + part;
      let c = cache.get(w);
      if (c === undefined) { c = word(w); if (cache.size > 20000) cache.clear(); cache.set(w, c); }
      total += c;
    }
    return total;
  };
}

// ---------- Qwen 3.5: byte-level BPE ----------
const WS = '\\t-\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000';
// Qwen's pre-tokenizer, with \s written out as Unicode White_Space and the contractions' case spelled out.
const SPLIT = new RegExp([
  "'(?:[sS]|[tT]|[rR][eE]|[vV][eE]|[mM]|[lL][lL]|[dD])",
  '[^\\r\\n\\p{L}\\p{N}]?[\\p{L}\\p{M}]+',
  '\\p{N}',
  ` ?[^${WS}\\p{L}\\p{M}\\p{N}]+[\\r\\n]*`,
  `[${WS}]*[\\r\\n]+`,
  `[${WS}]+(?![^${WS}])`,
  `[${WS}]+`
].join('|'), 'gu');
const SPECIAL = ['<|endoftext|>', '<|im_start|>', '<|im_end|>', '<|object_ref_start|>', '<|object_ref_end|>', '<|box_start|>', '<|box_end|>',
  '<|quad_start|>', '<|quad_end|>', '<|vision_start|>', '<|vision_end|>', '<|vision_pad|>', '<|image_pad|>', '<|video_pad|>', '<tool_call>',
  '</tool_call>', '<|fim_prefix|>', '<|fim_middle|>', '<|fim_suffix|>', '<|fim_pad|>', '<|repo_name|>', '<|file_sep|>', '<tool_response>',
  '</tool_response>', '<think>', '</think>'];
const SPECIAL_SPLIT = new RegExp('(' + SPECIAL.slice().sort((a, b) => b.length - a.length).map(t => t.replace(/[|\\/<>]/g, '\\$&')).join('|') + ')');
// GPT-2's byte-to-character table.
const BYTES = (() => {
  const keep = new Set();
  for (let b = 0x21; b <= 0x7e; b++) keep.add(b);
  for (let b = 0xa1; b <= 0xac; b++) keep.add(b);
  for (let b = 0xae; b <= 0xff; b++) keep.add(b);
  const out = [];
  let extra = 0;
  for (let b = 0; b < 256; b++) out[b] = String.fromCharCode(keep.has(b) ? b : 256 + extra++);
  return out;
})();
export function qwenCounter(merges) { return finish(qwenBuild(merges)); }
function* qwenBuild(merges) {
  const rank = new Map(), text = String(merges);
  let r = 0;
  // Line by line, so a part can stop anywhere. Line ends as git may have written them on Windows (\r\n): a stray \r
  // would make every merge miss.
  for (let at = 0; at < text.length;) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    const line = text.slice(at, end < text.length && end > at && text.charCodeAt(end - 1) === 13 ? end - 1 : end);
    if (line) { rank.set(line, r++); if (r % 10000 === 0) yield; }
    at = end + 1;
  }
  const encoder = new TextEncoder(), cache = new Map();
  function word(w) {
    let c = cache.get(w);
    if (c !== undefined) return c;
    let parts = Array.from(encoder.encode(w), b => BYTES[b]);
    while (parts.length > 1) {
      let best = Infinity, pair = '';
      for (let i = 0; i < parts.length - 1; i++) { const k = parts[i] + ' ' + parts[i + 1], v = rank.get(k); if (v !== undefined && v < best) { best = v; pair = k; } }
      if (best === Infinity) break;
      const [a, b] = pair.split(' '), next = [];
      for (let i = 0; i < parts.length; i++) if (parts[i] === a && parts[i + 1] === b) { next.push(a + b); i++; } else next.push(parts[i]);
      parts = next;
    }
    c = parts.length;
    if (cache.size > 20000) cache.clear();
    cache.set(w, c);
    return c;
  }
  return text => {
    let total = 0;
    String(text ?? '').normalize('NFC').split(SPECIAL_SPLIT).forEach((part, i) => {
      if (i % 2) total += 1;
      else for (const [w] of part.matchAll(SPLIT)) total += word(w);
    });
    return total;
  };
}

// ---------- Prompts ----------
/** One prompt field: inside a ||a|b|| random group only the longest choice counts, and the text is cut at single |
 *  (prompt mixing, at most six parts), each part counted on its own. */
export function countField(count, text) {
  const chosen = String(text ?? '').split('||').map((part, i) => i % 2 ? part.split('|').reduce((a, b) => (a.length >= b.length ? a : b)) : part).join('');
  let parts = chosen.split('|');
  if (parts.length > 6) parts = [...parts.slice(0, 5), parts.slice(5).join('|')];
  return parts.reduce((sum, p) => sum + count(p), 0);
}
/** A picture's use of its budget: {used, negative, limit} — the base prompt with every character's, the negatives apart. */
export function countPicture(count, {prompt = '', negative = '', characters = []}, budget) {
  const used = countField(count, prompt) + characters.reduce((s, c) => s + countField(count, c.prompt || ''), 0);
  const neg = countField(count, negative) + characters.reduce((s, c) => s + countField(count, c.negative || ''), 0);
  return {used, negative: neg, limit: budget.limit};
}

// ---------- Loading ----------
const loaded = new Map();
/** The counter for a kind ('t5' | 'qwen'), loaded once. read(name) gives a vocabulary file's text (tests read the
 *  disk); by default it is fetched from the extension's tokenizers/ folder. */
export function loadCounter(kind, {read} = {}) {
  if (loaded.has(kind)) return loaded.get(kind);
  const file = kind === 't5' ? 't5.json' : 'qwen.txt';
  const get = read || (async name => { const r = await fetch(new URL('../tokenizers/' + name, import.meta.url)); if (!r.ok) throw Error('读不到分词表'); return r.text(); });
  const job = Promise.resolve(get(file)).then(text => finishSoon(kind === 't5' ? t5Build(JSON.parse(text)) : qwenBuild(text)));
  job.catch(() => loaded.delete(kind));
  loaded.set(kind, job);
  return job;
}
/** The counter when it is already loaded (for code that cannot wait), else null — and the loading starts, when the
 *  page is idle (the story's picture rule asks for it while the tavern is still loading; it counts roughly till then). */
const ready = new Map(), asked = new Set();
export function counterNow(kind) {
  if (ready.has(kind)) return ready.get(kind);
  if (!asked.has(kind)) {
    asked.add(kind);
    const load = () => loadCounter(kind).then(c => ready.set(kind, c)).catch(() => {}).finally(() => asked.delete(kind)), idle = globalThis.requestIdleCallback;
    if (idle) idle(load, {timeout: 4000}); else load();
  }
  return null;
}
// What one ordinary tag costs with a tokenizer (its comma and space included), measured on everyday tags.
const TYPICAL = '1girl, solo, long hair, looking at viewer, smile, blush, open mouth, school uniform, pleated skirt, holding umbrella, rain, outdoors, night, city lights, cowboy shot, from side, depth of field, wind, floating hair, hand up';
const costs = new WeakMap();
export function tagCost(count) {
  if (!costs.has(count)) costs.set(count, Math.max(1, (count(TYPICAL) - count('')) / TYPICAL.split(',').length));
  return costs.get(count);
}
/** A rough count when the vocabulary is not loaded yet: about four characters a token for English tags. */
export const estimateTokens = text => { const s = String(text ?? '').trim(); return s ? Math.ceil(s.length / 3.6) + 1 : 1; };
