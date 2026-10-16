// 视觉小说: the story read as a galgame. Its settings, the story cut into pages (core of the stage in vn-stage.js),
// the 立绘 (with their 表情 and 动作) and the requests that draw them, and the cut-out that takes the plain background
// off a drawn 立绘.
import {skippedRanges, narrationPieces, NARRATION_SKIP, cleanSkip} from './narration.js';
import {activeStyle, sizeFor} from './draw.js';

/** What a 立绘 asks of the picture, after the 画风 and before the character's own looks. Editable in the app. The
 *  background is added by the plugin (a flat key colour that is easy to take off), unless the rule names one. */
export const SPRITE_RULE = 'solo, cowboy shot, standing, facing viewer, looking at viewer';
const OLD_RULE = 'solo, cowboy shot, standing, facing viewer, looking at viewer, arms at sides, simple background, white background';
export const SPRITE_NEGATIVE = 'multiple views, text, watermark, signature, frame, border, scenery, cropped head, gradient background, shadow';
/** Seconds per character typed, from 慢 to 瞬间 (0: the page shows at once). */
export const VN_SPEEDS = Object.freeze([0.07, 0.045, 0.028, 0.015, 0]);
export const VN_SPEED_NAMES = Object.freeze(['慢', '稍慢', '中', '快', '瞬间']);
export const VN_WAITS = Object.freeze([0.6, 1.2, 2, 3]);
export const VN_FONTS = Object.freeze({s: '小', m: '中', l: '大'});
/** tavern: the tavern's theme colours; phone: the phone's (a copy kept in palette, taken by the 视觉小说 App). */
export const VN_BOXES = Object.freeze({night: '夜幕', day: '晴空', sakura: '樱色', ink: '墨染', tavern: '跟随酒馆', phone: '跟随小手机'});
const LIMIT = {cast: 200, rule: 1000, url: 1000, name: 60, actions: 12, words: 20, label: 12, tags: 300};

/**
 * 表情: one 立绘 each, picked by a line's 情绪 (a word or a director's note, English or Chinese). tags: what is added
 * to the 立绘's prompt to draw it.
 */
export const EXPRESSIONS = Object.freeze([
  {id: 'happy', label: '开心', tags: 'smile, happy, open mouth', words: /happy|joy|cheer|laugh|smil|giggl|delight|playful|teas|开心|高兴|笑|喜|愉快|雀跃|得意|欢|俏皮|调侃/},
  {id: 'angry', label: '生气', tags: 'angry, frown, v-shaped eyebrows, clenched teeth', words: /angry|annoy|furious|rage|irritat|mad\b|shout|yell|生气|愤|恼|不满|烦|怒|吼|凶/},
  {id: 'sad', label: '难过', tags: 'sad, tears, teary eyes, frown', words: /sad|cry|tear|sob|sorrow|grief|hurt|lonely|melanchol|难过|伤心|哭|泪|悲|委屈|失落|沮丧|心酸|哽咽/},
  {id: 'surprised', label: '惊讶', tags: 'surprised, wide-eyed, open mouth', words: /surpris|shock|startl|amaz|astonish|gasp|scared|panic|惊|吓|震惊|愣|慌/},
  {id: 'shy', label: '害羞', tags: 'blush, embarrassed, looking away, shy', words: /shy|blush|embarrass|fluster|bashful|timid|害羞|脸红|羞|不好意思|扭捏|局促/},
]);
/** The 表情 a 情绪 names; in a longer note (「强忍着眼泪，却努力笑着」) the one named first. */
export function expressionOf(emotion) {
  const e = String(emotion || '').toLowerCase();
  let best = '', at = Infinity;
  for (const x of EXPRESSIONS) { const m = x.words.exec(e); if (m && m.index < at) { at = m.index; best = x.id; } }
  return best;
}

export const defaultVn = () => ({enabled: false, speed: 2, wait: 1, voice: true, narrate: false, font: 'm', box: 'night', opacity: 0.86, effects: true, rule: SPRITE_RULE, palette: null, skip: [], cast: {}});
const pick = (value, list, fallback) => list.includes(value) ? value : fallback;
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\))$/i;
const PALETTE = ['box', 'box2', 'ink', 'soft', 'plate', 'plateInk', 'line'];
function normalizePalette(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of PALETTE) { const c = String(p[k] ?? '').trim(); if (!COLOR.test(c)) return null; out[k] = c; }
  return out;
}
const words = value => [...new Set((Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；\s]+/)).map(w => String(w).trim().slice(0, LIMIT.label)).filter(Boolean))].slice(0, LIMIT.words);
/**
 * cast: {name: {sprite, at, seed, looks: {id: {sprite, at}}, actions: [{id, label, tags, words}]}} — each character's
 * 立绘 (files in the tavern's images, so every device sees them). sprite is the usual one; looks hold the 表情
 * (EXPRESSIONS ids) and 动作 (the character's own actions: what to draw, and the words that bring them on).
 */
function normalizeCast(value) {
  const cast = {};
  for (const [name, c] of Object.entries(value && typeof value === 'object' ? value : {}).slice(0, LIMIT.cast)) {
    const key = String(name).trim().slice(0, LIMIT.name);
    if (!key || !c || typeof c !== 'object') continue;
    const actions = (Array.isArray(c.actions) ? c.actions : []).slice(0, LIMIT.actions).map(a => ({id: text(a?.id, 40), label: text(a?.label, LIMIT.label), tags: text(a?.tags, LIMIT.tags), words: words(a?.words)})).filter(a => /^a-[\w-]+$/.test(a.id) && a.label);
    const ids = new Set([...EXPRESSIONS.map(e => e.id), ...actions.map(a => a.id)]), looks = {};
    for (const [id, look] of Object.entries(c.looks && typeof c.looks === 'object' ? c.looks : {})) {
      const sprite = text(look?.sprite, LIMIT.url);
      if (ids.has(id) && sprite) looks[id] = {sprite, at: Number(look.at) || 0};
    }
    const sprite = text(c.sprite, LIMIT.url), seed = Number(c.seed);
    if (!sprite && !Object.keys(looks).length && !actions.length) continue;
    cast[key] = {sprite, at: Number(c.at) || 0, ...(Number.isInteger(seed) && seed >= 0 ? {seed} : {}), looks, actions};
  }
  return cast;
}
export function normalizeVn(value) {
  const base = defaultVn(), v = value && typeof value === 'object' ? value : {};
  const opacity = Number(v.opacity);
  return {
    enabled: v.enabled === true,
    speed: pick(Number(v.speed), [0, 1, 2, 3, 4], base.speed),
    wait: pick(Number(v.wait), [0, 1, 2, 3], base.wait),
    voice: v.voice !== false,
    narrate: v.narrate === true,
    font: Object.hasOwn(VN_FONTS, v.font) ? v.font : base.font,
    box: Object.hasOwn(VN_BOXES, v.box) ? v.box : base.box,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.3, Math.round(opacity * 100) / 100)) : base.opacity,
    effects: v.effects !== false,
    rule: typeof v.rule === 'string' ? (v.rule === OLD_RULE ? SPRITE_RULE : v.rule.slice(0, LIMIT.rule)) : base.rule,
    palette: normalizePalette(v.palette),
    // 不演的标签: parts of the story the stage leaves out (on top of 整篇朗读's list).
    skip: cleanSkip(v.skip),
    cast: normalizeCast(v.cast),
  };
}

/**
 * The 立绘 to show for a line: a 动作 whose words are in the story just before it (or in its 情绪) first, then the
 * 表情 of its 情绪, then the usual one. Only pictures that were made count; '' when the character has none.
 */
export function pickLook(entry, {emotion = '', context = ''} = {}) {
  if (!entry) return '';
  const looks = entry.looks || {}, said = String(context || '') + '\n' + String(emotion || '');
  for (const a of entry.actions || []) if (looks[a.id]?.sprite && a.words.some(w => said.includes(w))) return looks[a.id].sprite;
  const e = expressionOf(emotion);
  if (e && looks[e]?.sprite) return looks[e].sprite;
  return entry.sprite || Object.values(looks)[0]?.sprite || '';
}

/** A text box holds about three lines: longer prose and lines are cut into pages at a sentence end. */
export const PAGE = 90;
const STRONG = ['。', '！', '？', '!', '?', '…', '；', ';', '.'], SOFT = ['，', ',', '、', ' '];
export function pages(value, max = PAGE) {
  const out = [];
  let rest = String(value ?? '').replace(/\s+/g, ' ').trim();
  while (rest) {
    if (rest.length <= max) { out.push(rest); break; }
    const head = rest.slice(0, max), last = list => Math.max(...list.map(c => head.lastIndexOf(c)));
    let cut = last(STRONG);
    if (cut <= max / 3) cut = Math.max(cut, last(SOFT));
    const at = cut > max / 3 ? cut + 1 : max;
    // Closing quotes and brackets stay with what they close.
    let end = at;
    while (end < rest.length && /[」』”’）)】]/.test(rest[end])) end++;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return out.filter(Boolean);
}

/**
 * One message as the steps of the stage, in story order:
 *   {kind: 'bg', url}                         a picture of the story becomes the background
 *   {kind: 'say', role, text, line, part, emotion}  a voice line (line: its index among the message's lines; part: its page)
 *   {kind: 'narrate', text}                   the story between them
 *   {kind: 'sound', index} / {kind: 'bgm', index}   a sound tag / a <bgm> of the message, where it is in the story
 * lines: the message's voice lines with their places (start, end); pics: [{start, url}] (drawn pictures only);
 * sounds / bgm: [{start, index}].
 * The parts not read aloud by 整篇朗读 (thinking, status bars, code, the phone's tags) are not shown either.
 */
export function storySteps(raw, lines = [], {pics = [], sounds = [], bgm = [], skip = NARRATION_SKIP, max = PAGE} = {}) {
  const source = String(raw ?? ''), cut = skippedRanges(source, skip);
  let masked = source;
  for (const [a, b] of cut) masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, ' ') + masked.slice(b);
  const hidden = (a, b) => cut.some(([s, e]) => a < e && b > s);
  const out = [];
  const prose = (a, b) => { if (b > a) for (const piece of narrationPieces(masked.slice(a, b))) for (const page of pages(piece, max)) out.push({kind: 'narrate', text: page}); };
  const point = (list, kind) => list.filter(p => Number.isFinite(p?.start) && (kind !== 'bg' || p.url)).map(p => ({point: kind, p, start: p.start, end: p.start}));
  const events = [
    ...lines.map((l, i) => ({l, i, start: l?.start, end: l?.end})).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end)),
    ...point(pics, 'bg'), ...point(sounds, 'sound'), ...point(bgm, 'bgm'),
  ].sort((a, b) => a.start - b.start || (a.point ? -1 : 1));
  let at = 0;
  for (const e of events) {
    if (e.point) {
      prose(at, Math.max(at, e.start)); at = Math.max(at, e.start);
      out.push(e.point === 'bg' ? {kind: 'bg', url: e.p.url} : {kind: e.point, index: e.p.index});
      continue;
    }
    if (e.start < at) continue;
    prose(at, e.start);
    if (!hidden(e.start, e.end)) {
      const shown = String(e.l.translation || e.l.text || '').trim();
      pages(shown, max).forEach((page, part) => out.push({kind: 'say', role: String(e.l.role || ''), text: page, line: e.i, part, emotion: String(e.l.emotion || '')}));
    }
    at = e.end;
  }
  prose(at, source.length);
  return out;
}

/** Pictures other plugins put in the story (<img src>, ![](url)): [{start, url}], where they are. */
export function inlinePictures(raw) {
  const text = String(raw ?? ''), out = [];
  for (const m of text.matchAll(/<img\b[^<>]*?\bsrc\s*=\s*["']([^"']+)["'][^<>]*>|!\[[^\]]*\]\(([^)\s]+)[^)]*\)/gi)) {
    const url = (m[1] || m[2] || '').trim();
    if (/^(https?:|\/|data:image\/|blob:)/i.test(url)) out.push({start: m.index, url});
  }
  return out;
}

/** What the user wrote, as pages said by them (their own message has no voice lines). */
export function userSteps(raw, name, max = PAGE) {
  const out = [];
  for (const piece of narrationPieces(String(raw ?? '').replace(/```[\s\S]*?(?:```|$)/g, ' '))) for (const page of pages(piece, max)) out.push({kind: 'say', role: String(name || '你'), text: page, user: true});
  return out;
}

/** How a line is acted on the stage, from its 情绪 (a word or a director's note): 'shake', 'hop' or ''. */
export function stageMove(emotion) {
  const e = String(emotion || '').toLowerCase();
  if (/angry|furious|rage|shout|yell|怒|生气|吼|喊|咆哮|愤/.test(e)) return 'shake';
  if (/surpris|shock|startl|scared|panic|excit|惊|吓|慌|兴奋|激动|雀跃/.test(e)) return 'hop';
  return '';
}

/** The flat background a 立绘 is drawn on: green, unless the character wears it (then blue, then magenta). */
export function keyColorFor(looks) {
  const l = String(looks || '').toLowerCase();
  if (!/green|emerald|jade|lime|olive|mint|绿|翠/.test(l)) return 'green';
  if (!/blue|azure|navy|cyan|蓝|青/.test(l)) return 'blue';
  return 'magenta';
}
/**
 * The drawing request for a character's 立绘: the 画风 first, then the 立绘 rule, the look's own tags (a 表情 or 动作)
 * and a flat key colour background; their looks as the character. seed: the usual 立绘's, so a 表情 keeps the same face
 * and clothes as far as the engine allows (-1: a new one).
 */
export function spriteRequest(settings, name, {appearance, rule, extra = '', seed = -1} = {}) {
  const draw = settings.draw, style = activeStyle(draw) || {}, vn = normalizeVn(settings.vn);
  const route = (settings.routes || []).find(r => r.name === name);
  const looks = String(appearance ?? route?.appearance ?? '').trim();
  const head = [style.artist, style.positive].map(x => String(x || '').trim()).filter(Boolean);
  const want = String(rule ?? vn.rule).trim(), more = String(extra || '').trim();
  const backdrop = /background/i.test(want + ',' + more) ? '' : `simple background, ${keyColorFor(looks)} background`;
  return {
    prompt: [...head, want, more, backdrop, looks ? '' : name].filter(Boolean).join(', '),
    negative: [String(style.negative || '').trim(), SPRITE_NEGATIVE].filter(Boolean).join(', '),
    characters: looks ? [{prompt: looks, negative: '', position: -1}] : [],
    params: {...draw.params, ...sizeFor(draw.params, '竖'), seed: Number.isInteger(seed) && seed >= 0 ? seed : -1},
  };
}

/** The colour most of the border has (in 32-step buckets), averaged: [r, g, b]. */
function borderColor(data, width, height) {
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  const bucket = p => (data[p * 4] >> 3) << 10 | (data[p * 4 + 1] >> 3) << 5 | data[p * 4 + 2] >> 3;
  const counts = new Map();
  for (const p of border) { const k = bucket(p); counts.set(k, (counts.get(k) || 0) + 1); }
  let best = 0, key = 0;
  for (const [k, c] of counts) if (c > best) { best = c; key = k; }
  let r = 0, g = 0, b = 0, m = 0;
  for (const p of border) if (bucket(p) === key) { r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; m++; }
  return {color: [r / m, g / m, b / m], border};
}

/**
 * Takes the plain background off a drawn 立绘 (data: RGBA bytes, changed in place; strength 0–255, more takes more).
 * Two ways, by the background's colour (the most common one on the border):
 *  · a strong colour (the green, blue or magenta 立绘 are drawn on): every pixel of that colour goes, wherever it is
 *    (gaps in the hair too), by how much of the colour it has, so pale clothes stay; the colour's tinge on the edges
 *    is taken out;
 *  · white, grey or anything pale (an uploaded picture): from the edges inwards, what is close to it goes; gaps inside
 *    are taken with eraseAt.
 * Returns how many pixels were taken.
 */
export function cutBackground(data, width, height, strength = 40) {
  const n = width * height;
  if (!n || data.length < n * 4) return 0;
  const {color: bg, border} = borderColor(data, width, height);
  // Already see-through around the figure (a PNG made that way): nothing to take.
  if (border.filter(p => data[p * 4 + 3] < 16).length > border.length * 0.6) return 0;
  const top = Math.max(...bg), low = Math.min(...bg);
  if (top - low >= 70) {
    // The key channels: those well above the middle of the background colour.
    const mid = (top + low) / 2, keyed = [0, 1, 2].filter(c => bg[c] > mid), other = [0, 1, 2].filter(c => bg[c] <= mid);
    const amount = (r, g, b) => { const v = [r, g, b]; return Math.min(...keyed.map(c => v[c])) - Math.max(...other.map(c => v[c])); };
    const full = amount(...bg), from = full * Math.max(0.05, 0.36 - strength / 400), to = from + full * 0.22;
    let taken = 0;
    for (let p = 0; p < n; p++) {
      const i = p * 4, a = amount(data[i], data[i + 1], data[i + 2]);
      if (a <= from * 0.6) continue;
      if (a >= to) { data[i + 3] = 0; taken++; continue; }
      if (a > from) data[i + 3] = Math.round(data[i + 3] * (to - a) / (to - from));
      // The tinge of the key colour on the edge: brought down to the other channels.
      const most = Math.max(...other.map(c => data[i + c]));
      for (const c of keyed) if (data[i + c] > most) data[i + c] = most;
    }
    return taken;
  }
  const [r, g, b] = bg, tolerance = strength;
  const far = p => Math.max(Math.abs(data[p * 4] - r), Math.abs(data[p * 4 + 1] - g), Math.abs(data[p * 4 + 2] - b));
  return flood(data, width, height, border.filter(p => far(p) <= tolerance), far, tolerance);
}
/** From the seeds outwards over pixels within tolerance (far(p)), making them see-through; the edge kept soft. */
function flood(data, width, height, seeds, far, tolerance) {
  const n = width * height, seen = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0, taken = 0;
  for (const p of seeds) if (!seen[p]) { seen[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    data[p * 4 + 3] = 0; taken++;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
      if (q < 0 || q >= n || seen[q]) continue;
      seen[q] = 1;
      if (data[q * 4 + 3] && far(q) <= tolerance) queue[tail++] = q;
    }
  }
  // Soft edge: a kept pixel next to a taken one keeps part of itself, by how unlike the background it is.
  for (let p = 0; p < n; p++) {
    if (seen[p] !== 1 || data[p * 4 + 3] === 0) continue;
    data[p * 4 + 3] = Math.round(data[p * 4 + 3] * Math.min(1, Math.max(0.25, (far(p) - tolerance) / (tolerance + 24))));
  }
  return taken;
}
/** 点一下去掉: the patch around (x, y) in the colour there (a gap in the hair, a corner left) becomes see-through. */
export function eraseAt(data, width, height, x, y, tolerance = 40) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const p0 = y * width + x;
  if (!data[p0 * 4 + 3]) return 0;
  const [r, g, b] = [data[p0 * 4], data[p0 * 4 + 1], data[p0 * 4 + 2]];
  const far = p => Math.max(Math.abs(data[p * 4] - r), Math.abs(data[p * 4 + 1] - g), Math.abs(data[p * 4 + 2] - b));
  return flood(data, width, height, [p0], far, tolerance);
}

/** The box around what is not see-through (alpha above 8), with a little room: {x, y, width, height}; null when empty. */
export function opaqueBounds(data, width, height, pad = 4) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= 8) continue;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) return null;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad); right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}
