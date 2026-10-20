// 整篇朗读: a reply read through, the story between the voice lines in the 旁白's voice and the lines in their roles'.
// The narration is the reply's own text around the lines (no model request): what is left after the parts not to be
// read — the user's 小剧场 and status bars (tags they list), code, comments, thinking and the phone's own tags (pictures,
// sounds, music, phone messages) — with the markup taken out.
// The 旁白 speaks with the system's voice (系统朗读: the browser's speech, free, played straight, not kept), or as a role
// named 旁白 in the 角色 App (an engine's voice: costs its characters, kept in the cache like any line).

export const NARRATOR = '旁白';
/** Tags read past by default: the usual places for 小剧场, status bars and folded extras. */
export const NARRATION_SKIP = Object.freeze(['小剧场', '状态栏', 'theater', 'status', 'statusbar', 'details']);
/** Tags a preset wraps the story in: when a reply has one, only what is inside it is read. */
export const NARRATION_BODY = Object.freeze(['content', '正文']);
const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];

export const defaultNarration = () => ({enabled: false, voice: 'system', systemVoice: '', rate: 1, skip: [...NARRATION_SKIP], body: [...NARRATION_BODY]});
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
export function normalizeNarration(value) {
  const base = defaultNarration(), v = value && typeof value === 'object' ? value : {};
  const rate = Number(v.rate);
  return {
    enabled: v.enabled === true,
    voice: v.voice === 'role' ? 'role' : 'system',
    systemVoice: String(v.systemVoice ?? '').slice(0, 300),
    rate: RATES.includes(rate) ? rate : base.rate,
    skip: v.skip === undefined ? base.skip : cleanSkip(v.skip),
    body: v.body === undefined ? base.body : cleanBody(v.body),
  };
}
export const NARRATION_RATES = RATES;

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
  for (const tag of ['sfx', 'ambience', 'bgm', 'phone']) add(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'));
  // Status panels written as [HUD_START]…[HUD_END] (any NAME_START / NAME_END pair).
  add(/\[([A-Za-z][\w-]*)_START\][\s\S]*?(?:\[\1_END\]|$)/g);
  // Thinking and the listed tags: to their end, or to the end of the reply when it was never closed; 「开头…结尾」
  // from its opening words to its closing ones.
  for (const tag of ['think', 'thinking', 'style', 'script', ...cleanSkip(skip)]) {
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
    story.push([m.index, end ? end.index + end[0].length : text.length]);
  }
  if (!story.length) return out;
  let from = 0;
  for (const [a, b] of story) { if (a > from) out.push([from, a]);from = b; }
  if (from < text.length) out.push([from, text.length]);
  return out.sort((a, b) => a[0] - b[0]);
}

const MAX = 220;
/** Prose as it is heard: no markup, Markdown marks or entities; one piece per paragraph, long ones cut at a sentence end. */
export function narrationPieces(text) {
  const plain = String(text ?? '')
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*)?\/?>/gi, ' ').replace(/<[^<>\n]{1,300}>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, '')
    .replace(/^\s{0,3}(?:#{1,6}|>+|[-*+]\s)\s*/gm, '').replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/\*+|_{2,}|~~|`+/g, '');
  const out = [];
  for (const para of plain.split(/\n+/)) {
    let rest = para.replace(/\s+/g, ' ').trim();
    while (rest) {
      if (rest.length <= MAX) { out.push(rest); break; }
      const head = rest.slice(0, MAX), cut = Math.max(...['。', '！', '？', '!', '?', '…', '；', ';', '.', '，', ','].map(c => head.lastIndexOf(c)));
      const at = cut > MAX / 3 ? cut + 1 : MAX;
      out.push(rest.slice(0, at).trim()); rest = rest.slice(at).trim();
    }
  }
  return out.filter(p => /[\p{L}\p{N}]/u.test(p));
}

/**
 * The order a reply is read in: [{line: index}] for its voice lines and [{narration: text}] for the story between them.
 * lines: the reply's voice lines with their places (start, end). Lines inside a skipped part are not read either.
 */
export function readingPlan(raw, lines, skip = NARRATION_SKIP, body = NARRATION_BODY) {
  const text = String(raw ?? ''), cut = skippedRanges(text, skip, body);
  // Skipped text becomes blank (new lines kept, so paragraphs stay apart); places do not move.
  let masked = text;
  for (const [a, b] of cut) masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, ' ') + masked.slice(b);
  const hidden = (a, b) => cut.some(([s, e]) => a < e && b > s);
  const out = [], prose = (a, b) => { for (const p of narrationPieces(masked.slice(a, b))) out.push({narration: p}); };
  let at = 0;
  [...lines].map((l, i) => ({l, i})).filter(x => Number.isFinite(x.l?.start)).sort((a, b) => a.l.start - b.l.start).forEach(({l, i}) => {
    if (l.start < at) return;
    prose(at, l.tagOnly&&Number.isFinite(l.displayStart)?Math.max(at,l.displayStart):l.start);
    if (!hidden(l.start, l.end)) out.push({line: i});
    at = l.end;
  });
  prose(at, text.length);
  return out;
}

// ---------- 系统朗读 ----------
const stopped = () => new DOMException('已停止', 'AbortError');
/** The browser's speech (speechSynthesis), or null where there is none. voices(): [{id, name, lang, local}]. */
export function browserSpeech(win = globalThis) {
  const synth = win?.speechSynthesis, Utterance = win?.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return null;
  const list = () => { try { return synth.getVoices() || []; } catch { return []; } };
  const chinese = v => /^(zh|cmn)/i.test(v.lang || '');
  let primed = false;
  return {
    voices: () => list().map(v => ({id: v.voiceURI || v.name, name: v.name, lang: v.lang || '', local: v.localService !== false})),
    /** Says the text; resolves when it is said, rejects as stopped when the signal aborts. */
    speak(text, {voice = '', rate = 1, volume = 1, lang = ''} = {}, signal = new AbortController().signal) {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        try { synth.cancel(); } catch {}
        const u = new Utterance(String(text)), all = list();
        const v = all.find(x => (x.voiceURI || x.name) === voice) || (!voice && all.find(chinese)) || null;
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang || 'zh-CN';
        u.rate = rate; u.volume = Math.max(0, Math.min(1, volume));
        let done = false;
        const finish = error => { if (done) return; done = true; signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
        const abort = () => { try { synth.cancel(); } catch {} finish(stopped()); };
        u.onend = () => finish();
        u.onerror = e => finish(['interrupted', 'canceled'].includes(e?.error) ? stopped() : Error('系统朗读出错' + (e?.error ? '：' + e.error : '')));
        signal.addEventListener('abort', abort, {once: true});
        synth.speak(u);
      });
    },
    /** Inside a tap: a silent word, so a phone lets the speech that comes later (after the lines before it) be heard. */
    prime() { if (primed) return; primed = true; try { const u = new Utterance(' '); u.volume = 0; synth.speak(u); } catch {} },
    pause() { try { synth.pause(); } catch {} },
    resume() { try { synth.resume(); } catch {} },
    stop() { try { synth.cancel(); } catch {} },
  };
}
