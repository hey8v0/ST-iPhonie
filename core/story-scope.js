// Shared narrative extraction. Offsets always refer to the unchanged original reply.
/** Tags read past by default: the usual places for 小剧场, status bars and folded extras. */
export const NARRATION_SKIP = Object.freeze(['小剧场', '状态栏', 'theater', 'status', 'statusbar', 'details']);
/** Tags a preset wraps the story in: when a reply has one, only what is inside it is read. */
export const NARRATION_BODY = Object.freeze(['content', '正文']);
/** Tags other plugins write into a reply for a picture of theirs: never read, never on the 视觉小说 stage, never in
 *  the story the phone's requests carry (core/chat.js plainStory). */
export const OTHER_PICTURES = Object.freeze(['bbi_image']);
/** A tag name as typed (<小剧场>, 小剧场, </theater>): the name alone. */
const tagName = value => String(value ?? '').replace(/[<>/\s]/g, '').slice(0, 40);
/** 「开头…结尾」: a part that opens and closes with words of its own ([HUD_START]…[HUD_END]). */
const PAIR = /…|\.\.\./;
function skipEntry(value) {
  const t = String(value ?? '').trim();
  const comment = /^<!--\s*([^<>]*?)\s*-->$/.exec(t) || /^!--\s*(.*?)\s*--$/.exec(t);
  if (comment?.[1]) return `<!--${comment[1].slice(0, 40)}-->`;
  if (!PAIR.test(t)) return tagName(t);
  const [open, close] = t.split(PAIR).map(x => x.trim().slice(0, 40));
  return open && close ? `${open}…${close}` : '';
}
export function cleanSkip(value) {
  const list = (Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；\n]+/)).map(skipEntry).filter(Boolean);
  return [...new Set(list)].slice(0, 30);
}
/** 正文标签 as typed (content、<正文>): tag names only, no 「开头…结尾」 or comments. */
export function cleanBody(value) {
  const list = (Array.isArray(value) ? value : String(value ?? '').split(/[,，、;；\n]+/)).map(tagName).filter(t => t && !PAIR.test(t) && !t.startsWith('!--'));
  return [...new Set(list)].slice(0, 10);
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Only consume a following, explicitly closed HTML block; never infer that a comment owns the rest of the reply. */
function followingPanelEnd(text, start) {
  let at = start;
  for (;;) {
    const match = /^\s*<([a-z][\w:-]*)\b[^>]*>/i.exec(text.slice(at));
    if (!match || !/^(?:div|details|section|article|aside|table|ul|ol|dl|pre|form|fieldset|figure|style|script)$/i.test(match[1]) || /\/\s*>$/.test(match[0])) return at;
    const tag = escapeRe(match[1]), tokens = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, 'gi');
    tokens.lastIndex = at + match[0].length;let depth = 1, end = 0;
    for (let m; (m = tokens.exec(text));) { depth += m[1] ? -1 : /\/\s*>$/.test(m[0]) ? 0 : 1;if (!depth) { end = tokens.lastIndex;break; } }
    if (!end) return at;
    at = end;
    if (!/^(?:style|script)$/i.test(match[1])) return at;
  }
}
/**
 * The parts of a reply not read: [start, end) ranges, in order. The reply is read from the start, so a tag named inside a
 * part already skipped (a thinking block that lists 「`<details>` -> `<!-- SDC-end -->`」) opens nothing.
 * body: the 正文标签; when the reply wraps its story in one, what is outside it is not read either.
 */
export function skippedRanges(raw, skip = NARRATION_SKIP, body = NARRATION_BODY) {
  const text = String(raw ?? ''), finds = [];
  // A finder gives the first part starting at or after `from`: [start, end], or null.
  const add = re => finds.push(from => { re.lastIndex = from;const m = re.exec(text);return m ? [m.index, m.index + Math.max(1, m[0].length)] : null; });
  add(/<!--[\s\S]*?(?:-->|$)/g);
  add(/```[\s\S]*?(?:```|$)/g);
  // The phone's own tags, with what is inside (a picture's prompt, a sound's name, phone messages).
  add(/<img\b[^<>]*>[^<]*<\/img\s*>|<img\b[^<>]*\/?>/gi);
  for (const tag of ['sfx', 'ambience', 'bgm', 'phone', 'outfit']) add(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'));
  // Pictures other plugins keep in the reply as their prompt, shown in its place as the picture (柏宝绘's <bbi_image>).
  for (const tag of OTHER_PICTURES) add(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, 'gi'));
  // Status panels written as [HUD_START]…[HUD_END] (any NAME_START / NAME_END pair).
  add(/\[([A-Za-z][\w-]*)_START\][\s\S]*?(?:\[\1_END\]|$)/g);
  // Thinking and the listed tags: to their end, or to the end of the reply when it was never closed; 「开头…结尾」
  // from its opening words to its closing ones.
  for (const tag of ['think', 'thinking', 'reasoning', 'analysis', 'style', 'script', ...new Set([...text.matchAll(/<([\w一-鿿:-]+)(?=[\s>/])/g)].map(m=>m[1]).filter(name=>/^(?:bakemono|summary\w*|memory|abstract|options?|choices?|branch\w*|table\w*|update\w*|var\w*|state\w*|status\w*|摘要|总结|选项)$/i.test(name))), ...cleanSkip(skip)]) {
    const marker = /^<!--(.*?)-->$/.exec(tag);
    if (marker) {
      const name = escapeRe(marker[1]), open = new RegExp(`<!--\\s*${name}\\s*-->`, 'gi'), close = new RegExp(`<!--\\s*(?:/\\s*${name}|${name}\\s*(?:结束|END)|(?:结束|END)\\s*${name})\\s*-->`, 'gi'), nextOpen=new RegExp(open.source,'gi');
      finds.push(from => {
        open.lastIndex = from;const m = open.exec(text);
        if (!m) return null;
        close.lastIndex = m.index + m[0].length;const end = close.exec(text);
        nextOpen.lastIndex=m.index+m[0].length;const next=nextOpen.exec(text);
        const panelEnd=followingPanelEnd(text,m.index+m[0].length);
        // Do not borrow a later panel's closing marker across another opening marker.
        return [m.index, end&&(!next||end.index<next.index) ? close.lastIndex : panelEnd];
      });
      continue;
    }
    if (tag.includes('…')) { const [open, close] = tag.split('…').map(escapeRe); add(new RegExp(`${open}[\\s\\S]*?(?:${close}|$)`, 'gi')); continue; }
    const t = escapeRe(tag); add(new RegExp(`<${t}(?=[\\s>/])[^>]*>[\\s\\S]*?(?:<\\/${t}\\s*>|$)`, 'gi'));
  }
  // From the start: the part that opens first (the longer one when two open together), then on from its end.
  const out = [], ahead = finds.map(() => undefined);
  for (let at = 0; ;) {
    let best = null;
    finds.forEach((find, i) => {
      if (ahead[i] === undefined || (ahead[i] && ahead[i][0] < at)) ahead[i] = find(at);
      const r = ahead[i];
      if (r && (!best || r[0] < best[0] || (r[0] === best[0] && r[1] > best[1]))) best = r;
    });
    if (!best) break;
    out.push(best);at = Math.max(best[1], best[0] + 1);
  }
  // A preset that wraps the story in <content> (or another 正文标签): what is outside it (status bars, summaries, extras) is not read.
  const story = [], names = cleanBody(body);
  if (!names.length) return out;
  for (const m of text.matchAll(new RegExp(`<(${names.map(escapeRe).join('|')})(?:\\s[^<>]*)?>`, 'gi'))) {
    if (out.some(([a, b]) => m.index >= a && m.index < b) || (story.length && m.index < story.at(-1)[1])) continue;
    const close = new RegExp(`<\\/${m[1]}\\s*>`, 'gi');close.lastIndex = m.index + m[0].length;
    const end = close.exec(text);
    story.push([m.index + m[0].length, end ? end.index : text.length]);
  }
  if (!story.length) return out;
  let from = 0;
  for (const [a, b] of story) { if (a > from) out.push([from, a]);from = b; }
  if (from < text.length) out.push([from, text.length]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** A masked view keeps original offsets, so consumers can write back without touching excluded blocks. */
export function storyScope(raw, {skip = NARRATION_SKIP, body = NARRATION_BODY} = {}) {
  const text = String(raw ?? ''), ranges = skippedRanges(text, skip, body);
  let masked = '', at = 0;
  for (const [start, end] of ranges) {
    if (end <= at) continue;
    const a = Math.max(at, start);
    masked += text.slice(at, a) + text.slice(a, end).replace(/[^\n\r]/g, ' ');
    at = end;
  }
  masked += text.slice(at);
  return {text, masked, ranges, contains: (a, b) => !ranges.some(([s, e]) => a < e && b > s)};
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed', 'track', 'tts']);
/**
 * Parts of a reply a picture must not be put inside: every tag that spans several lines (a status bar, <details>, a
 * preset's own blocks), code fences and HTML comments, as [start, end, name]. Tags left open are not counted.
 */
/** Blocks that hold something about the story, not the story: pictures never go in them, their lines are not offered. */

export function blockRanges(source) {
  const text = String(source), ranges = [], stack = [];
  for (const m of text.matchAll(/```[\s\S]*?(?:```|$)|<!--[\s\S]*?(?:-->|$)/g)) if (m[0].includes('\n')) ranges.push([m.index, m.index + m[0].length, m[0].startsWith('<') ? '!--' : '```']);
  const hidden = at => ranges.some(([a, b]) => at >= a && at < b);
  for (const m of text.matchAll(/<(\/?)([A-Za-z一-鿿][\w一-鿿:-]*)\b[^<>]*?(\/?)>/g)) {
    if (hidden(m.index)) continue;
    const [, closing, raw, self] = m, name = raw.toLowerCase();
    if (self || (!closing && VOID_TAGS.has(name))) continue;
    if (!closing) { stack.push({name, start: m.index}); continue; }
    const at = stack.map(x => x.name).lastIndexOf(name);
    if (at < 0) continue;
    const open = stack[at];
    stack.length = at;
    const end = m.index + m[0].length;
    if (text.slice(open.start, end).includes('\n')) ranges.push([open.start, end, name]);
  }
  return ranges;
}
/** Transform only included prose; excluded bytes, wrappers and their positions in the reply stay untouched. */
export function mapStory(raw, scope, transform) {
  const {text, ranges} = storyScope(raw, scope);
  let out = '', at = 0;
  for (const [a, b] of ranges) {
    if (b <= at) continue;
    const start = Math.max(at, a);
    out += transform(text.slice(at, start)) + text.slice(start, b);
    at = b;
  }
  return out + transform(text.slice(at));
}

/** Compact text for prompts: inline control tags do not add spaces inside a sentence. */
export function storyText(raw, scope = {}) {
  const {text, ranges} = storyScope(raw, scope);
  let out = '', at = 0;
  for (const [a, b] of ranges) {
    if (b <= at) continue;
    const start = Math.max(at, a), cut = text.slice(start, b);
    out += text.slice(at, start);
    if (/^(?:```|<!--|<(?:style|script|bbi_image)\b)/i.test(cut)) out += ' ';
    else if (cut.includes('\n')) out += '\n';
    at = b;
  }
  return out + text.slice(at);
}
