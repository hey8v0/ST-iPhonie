// 整篇朗读: a reply read through, the story between the voice lines in the 旁白's voice and the lines in their roles'.
// The narration is the reply's own text around the lines (no model request): what is left after the parts not to be
// read — the user's 小剧场 and status bars (tags they list), code, comments, thinking and the phone's own tags (pictures,
// sounds, music, phone messages) — with the markup taken out.
// The 旁白 speaks with the system's voice (系统朗读: the browser's speech, free, played straight, not kept), or as a role
// named 旁白 in the 角色 App (an engine's voice: costs its characters, kept in the cache like any line).

export const NARRATOR = '旁白';
import {NARRATION_SKIP, NARRATION_BODY, cleanSkip, cleanBody, storyScope} from './story-scope.js';
export {NARRATION_SKIP, NARRATION_BODY, OTHER_PICTURES, cleanSkip, cleanBody, skippedRanges} from './story-scope.js';
const RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];

export const defaultNarration = () => ({enabled: false, voice: 'system', systemVoice: '', rate: 1, skip: [...NARRATION_SKIP], body: [...NARRATION_BODY]});
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
  const {text, masked, contains} = storyScope(raw, {skip, body});
  const hidden = (a, b) => !contains(a, b);
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
