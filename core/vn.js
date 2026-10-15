// 视觉小说: the story read as a galgame. Its settings, the story cut into pages (core of the stage in vn-stage.js),
// the 立绘 request for the drawing engine and the cut-out that takes a plain background off a drawn 立绘.
import {skippedRanges, narrationPieces, NARRATION_SKIP} from './narration.js';
import {activeStyle, sizeFor} from './draw.js';

/** What a 立绘 asks of the picture, after the 画风 and before the character's own looks. Editable in the app. */
export const SPRITE_RULE = 'solo, cowboy shot, standing, facing viewer, looking at viewer, arms at sides, simple background, white background';
export const SPRITE_NEGATIVE = 'multiple views, text, watermark, signature, frame, border, scenery, cropped head';
/** Seconds per character typed, from 慢 to 瞬间 (0: the page shows at once). */
export const VN_SPEEDS = Object.freeze([0.07, 0.045, 0.028, 0.015, 0]);
export const VN_SPEED_NAMES = Object.freeze(['慢', '稍慢', '中', '快', '瞬间']);
export const VN_WAITS = Object.freeze([0.6, 1.2, 2, 3]);
export const VN_FONTS = Object.freeze({s: '小', m: '中', l: '大'});
export const VN_BOXES = Object.freeze({night: '夜幕', day: '晴空', sakura: '樱色', ink: '墨染'});
const LIMIT = {cast: 200, rule: 1000, url: 1000, name: 60};

export const defaultVn = () => ({enabled: false, speed: 2, wait: 1, voice: true, font: 'm', box: 'night', opacity: 0.86, effects: true, rule: SPRITE_RULE, cast: {}});
const pick = (value, list, fallback) => list.includes(value) ? value : fallback;
/** cast: {name: {sprite: url, at}} — the 立绘 of each character, a file in the tavern's images (every device sees it). */
export function normalizeVn(value) {
  const base = defaultVn(), v = value && typeof value === 'object' ? value : {};
  const cast = {};
  for (const [name, c] of Object.entries(v.cast && typeof v.cast === 'object' ? v.cast : {}).slice(0, LIMIT.cast)) {
    const key = String(name).trim().slice(0, LIMIT.name), sprite = typeof c?.sprite === 'string' ? c.sprite.slice(0, LIMIT.url) : '';
    if (key && sprite) cast[key] = {sprite, at: Number(c.at) || 0};
  }
  const opacity = Number(v.opacity);
  return {
    enabled: v.enabled === true,
    speed: pick(Number(v.speed), [0, 1, 2, 3, 4], base.speed),
    wait: pick(Number(v.wait), [0, 1, 2, 3], base.wait),
    voice: v.voice !== false,
    font: Object.hasOwn(VN_FONTS, v.font) ? v.font : base.font,
    box: Object.hasOwn(VN_BOXES, v.box) ? v.box : base.box,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0.3, Math.round(opacity * 100) / 100)) : base.opacity,
    effects: v.effects !== false,
    rule: typeof v.rule === 'string' ? v.rule.slice(0, LIMIT.rule) : base.rule,
    cast,
  };
}

/** A text box holds about three lines: longer prose and lines are cut into pages at a sentence end. */
export const PAGE = 90;
const STRONG = ['。', '！', '？', '!', '?', '…', '；', ';', '.'], SOFT = ['，', ',', '、', ' '];
export function pages(text, max = PAGE) {
  const out = [];
  let rest = String(text ?? '').replace(/\s+/g, ' ').trim();
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
 * lines: the message's voice lines with their places (start, end); pics: [{start, url}] (drawn pictures only).
 * The parts not read aloud by 整篇朗读 (thinking, status bars, code, the phone's tags) are not shown either.
 */
export function storySteps(raw, lines = [], {pics = [], skip = NARRATION_SKIP, max = PAGE} = {}) {
  const text = String(raw ?? ''), cut = skippedRanges(text, skip);
  let masked = text;
  for (const [a, b] of cut) masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, ' ') + masked.slice(b);
  const hidden = (a, b) => cut.some(([s, e]) => a < e && b > s);
  const out = [];
  const prose = (a, b) => { if (b > a) for (const piece of narrationPieces(masked.slice(a, b))) for (const page of pages(piece, max)) out.push({kind: 'narrate', text: page}); };
  const events = [
    ...lines.map((l, i) => ({l, i, start: l?.start, end: l?.end})).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end)),
    ...pics.filter(p => p?.url && Number.isFinite(p.start)).map(p => ({pic: p, start: p.start, end: p.start})),
  ].sort((a, b) => a.start - b.start || (a.pic ? -1 : 1));
  let at = 0;
  for (const e of events) {
    if (e.pic) { prose(at, Math.max(at, e.start)); at = Math.max(at, e.start); out.push({kind: 'bg', url: e.pic.url}); continue; }
    if (e.start < at) continue;
    prose(at, e.start);
    if (!hidden(e.start, e.end)) {
      const shown = String(e.l.translation || e.l.text || '').trim();
      pages(shown, max).forEach((page, part) => out.push({kind: 'say', role: String(e.l.role || ''), text: page, line: e.i, part, emotion: String(e.l.emotion || '')}));
    }
    at = e.end;
  }
  prose(at, text.length);
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

/** The drawing request for a character's 立绘: the 画风 first, then the 立绘 rule; their looks as the character. */
export function spriteRequest(settings, name, {appearance, rule} = {}) {
  const draw = settings.draw, style = activeStyle(draw) || {}, vn = normalizeVn(settings.vn);
  const route = (settings.routes || []).find(r => r.name === name);
  const looks = String(appearance ?? route?.appearance ?? '').trim();
  const head = [style.artist, style.positive].map(x => String(x || '').trim()).filter(Boolean);
  const want = String(rule ?? vn.rule).trim();
  return {
    prompt: [...head, want, looks ? '' : name].filter(Boolean).join(', '),
    negative: [String(style.negative || '').trim(), SPRITE_NEGATIVE].filter(Boolean).join(', '),
    characters: looks ? [{prompt: looks, negative: '', position: -1}] : [],
    params: {...draw.params, ...sizeFor(draw.params, '竖')},
  };
}

/**
 * Takes the plain background off a drawn 立绘: from the edges inwards, every pixel close to the background colour (the
 * most common colour of the border) becomes see-through; the edge of the figure is softened a little. data: RGBA
 * bytes (changed in place). tolerance: 0–255. Returns how many pixels were taken.
 */
export function cutBackground(data, width, height, tolerance = 40) {
  const n = width * height;
  if (!n || data.length < n * 4) return 0;
  const counts = new Map();
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  for (const p of border) { const k = (data[p * 4] >> 3) << 10 | (data[p * 4 + 1] >> 3) << 5 | data[p * 4 + 2] >> 3; counts.set(k, (counts.get(k) || 0) + 1); }
  let best = 0, key = 0;
  for (const [k, c] of counts) if (c > best) { best = c; key = k; }
  // The average of the border pixels in that colour bucket.
  let r = 0, g = 0, b = 0, m = 0;
  for (const p of border) { const k = (data[p * 4] >> 3) << 10 | (data[p * 4 + 1] >> 3) << 5 | data[p * 4 + 2] >> 3; if (k === key) { r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; m++; } }
  r /= m; g /= m; b /= m;
  const far = p => Math.max(Math.abs(data[p * 4] - r), Math.abs(data[p * 4 + 1] - g), Math.abs(data[p * 4 + 2] - b));
  const seen = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0, taken = 0;
  for (const p of border) if (!seen[p] && far(p) <= tolerance) { seen[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    data[p * 4 + 3] = 0; taken++;
    for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
      if (q < 0 || q >= n || seen[q]) continue;
      seen[q] = 1;
      if (far(q) <= tolerance) queue[tail++] = q;
    }
  }
  // Soft edge: a kept pixel next to a taken one keeps part of itself, by how unlike the background it is.
  for (let p = 0; p < n; p++) {
    if (seen[p] !== 1 || data[p * 4 + 3] === 0) continue;
    const d = far(p);
    data[p * 4 + 3] = Math.round(data[p * 4 + 3] * Math.min(1, Math.max(0.25, (d - tolerance) / (tolerance + 24))));
  }
  return taken;
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
