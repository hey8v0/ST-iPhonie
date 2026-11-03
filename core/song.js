// 写歌: songs of the phone's own. The words and the style are written by the text model (it knows the people and the story) or by
// the user; a service only sings them (core/song-engines.js). No DOM here: what a 写歌 form and a draft hold, the request to the text
// model and its answer, and where the lines of a song fall in its time (no service says, so it is worked out from the words).
import {promptText} from './prompt-rules.js';

export const SONG_LIMITS = Object.freeze({drafts: 100, title: 100, style: 1000, lyrics: 5000, about: 2000, wish: 500, versions: 20, field: 200});
export const SONG_LANGUAGES = Object.freeze(['中文', '粤语', '日语', '英语', '韩语']);
export const SONG_GENRES = Object.freeze(['流行', '抒情', '民谣', '摇滚', '古风', 'R&B', '说唱', '电子', '爵士', '动漫', '钢琴', 'City Pop', 'Lo-fi']);
export const SONG_WORDINGS = Object.freeze(['直白口语', '诗意', '古风文言', '讲故事', '押韵工整', '甜', '丧', '发疯']);
export const SONG_VOICES = Object.freeze(['女声', '男声', '对唱', '合唱']);
/** How long a song is asked to be. No service holds to it exactly: it decides how much the text model writes. */
export const SONG_LENGTHS = Object.freeze({
  short: {name: '短', seconds: 60, text: '短，大约 1 分钟：一段主歌加一段副歌'},
  mid: {name: '中', seconds: 120, text: '中等，大约 2 分钟：两段主歌、两遍副歌'},
  long: {name: '长', seconds: 180, text: '完整，大约 3 分钟：主歌、预副歌、副歌、第二段、桥段、最后的副歌'}
});
const clip = (value, max) => String(value ?? '').slice(0, max);

/** What a form starts from: the choices made last time (settings.music.writing). What the song is about is never kept. */
export function normalizeSongForm(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    language: clip(v.language, SONG_LIMITS.field).trim() || SONG_LANGUAGES[0],
    genre: clip(v.genre, SONG_LIMITS.field).trim(), wording: clip(v.wording, SONG_LIMITS.field).trim(), voice: clip(v.voice, SONG_LIMITS.field).trim(),
    length: Object.hasOwn(SONG_LENGTHS, v.length) ? v.length : 'mid',
    story: v.story !== false
  };
}

/** Who sings by default and how each is set: settings.music.sing. The keys are not here. */
export function normalizeSing(value) {
  const v = value && typeof value === 'object' ? value : {};
  const address = String(v.lyriaUrl ?? '').trim().replace(/\/+$/, '');
  return {
    engine: clip(v.engine, 20).trim(), lyriaModel: clip(v.lyriaModel, 60).trim() || 'lyria-3.5',
    lyriaUrl: /^https?:\/\/[^\s]+$/i.test(address) ? clip(address, 500) : '', replicateModel: clip(v.replicateModel, 120).trim() || 'minimax/music-2.5',
    // ComfyUI: offered once it has been set up here; a workflow of one's own, kept whether it is in use or not, and which of its boxes take what.
    comfyOn: v.comfyOn === true, comfyOwn: v.comfyOwn === true, comfyWorkflow: typeof v.comfyWorkflow === 'string' && v.comfyWorkflow.length <= 300000 ? v.comfyWorkflow : '', comfyName: clip(v.comfyName, 60),
    comfyMap: {lyrics: clip(v.comfyMap?.lyrics, 200), style: clip(v.comfyMap?.style, 200)}
  };
}

/** A song being written, kept with the music: words and style, whose it is, what became of it. state is '' or 'singing'; job says how far. */
export function songDraft(value = {}, at = Date.now()) {
  const v = value && typeof value === 'object' ? value : {};
  const draft = {
    id: clip(v.id, 200) || 'draft:' + globalThis.crypto.randomUUID(), kind: 'draft', at: Number.isFinite(v.at) ? v.at : at, updatedAt: at,
    title: clip(v.title, SONG_LIMITS.title).trim(), style: clip(v.style, SONG_LIMITS.style).trim(), lyrics: clip(v.lyrics, SONG_LIMITS.lyrics).replace(/\r\n?/g, '\n').trimEnd(),
    instrumental: v.instrumental === true, language: clip(v.language, SONG_LIMITS.field).trim(), who: clip(v.who, 40).trim(), about: clip(v.about, SONG_LIMITS.about).trim(),
    seconds: Number(v.seconds) > 0 ? Math.min(600, Math.round(Number(v.seconds))) : 0,
    songs: (Array.isArray(v.songs) ? v.songs : []).filter(x => typeof x === 'string' && x).slice(-SONG_LIMITS.versions)
  };
  if (v.state === 'singing') draft.state = 'singing';
  if (v.job && typeof v.job === 'object') draft.job = {engine: clip(v.job.engine, 20), model: clip(v.job.model, 100), task: clip(v.job.task, 200), at: Number(v.job.at) || at};
  if (v.note) draft.note = clip(v.note, 400);
  return draft;
}

// ---------- The words in sections ----------
const TAG = /^\s*\[([^\]\n]{1,60})\]\s*$/;
/** Sections that are only played. */
const PLAYED = /^(intro|outro|instrumental|inst|interlude|break|solo|drop|build ?up|transition)\b/i;
const WIDE = /[぀-ヿ㐀-鿿가-힯豈-﫿]/g;
/** A line only in brackets is a direction for the player ((吉他渐弱)), not something sung. */
const sungLine = line => !/^\s*[(（].*[)）]\s*$/.test(line);

/** The lyrics as [{tag, lines}]: by their [tags], or without any by the blank lines between verses. */
export function songSections(lyrics) {
  const text = String(lyrics ?? '').replace(/\r\n?/g, '\n'), out = [];
  const tagged = text.split('\n').some(line => TAG.test(line));
  let now = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim(), tag = TAG.exec(line);
    if (tag) { now = {tag: tag[1].trim(), lines: []}; out.push(now); continue; }
    if (!line) { if (!tagged) now = null; continue; }
    if (!now) { now = {tag: tagged || !out.length ? 'Verse' : `Verse ${out.length + 1}`, lines: []}; out.push(now); }
    now.lines.push(line);
  }
  return out;
}
/** About how long a line takes to sing, in seconds. */
export function singTime(line) {
  const s = String(line ?? ''), wide = s.match(WIDE)?.length || 0, words = s.replace(WIDE, ' ').split(/[^\p{L}\p{N}']+/u).filter(Boolean).length;
  return Math.max(1.6, (wide + words * 1.4) * 0.36);
}
/** The lengths a song can be asked to be, besides one that follows its words. */
export const SONG_SECONDS = Object.freeze([30, 60, 90, 120, 150, 180, 210, 240, 300]);
/**
 * How long a song is asked to be, in seconds: the length chosen for it; else what its words take, with room for an intro, the breaks between
 * parts and an ending (asked for less, a service cuts the song off before its words are sung); else, with no words, two minutes.
 */
export function songLength(draft = {}) {
  if (Number(draft.seconds) > 0) return Math.min(600, Math.round(Number(draft.seconds)));
  const sections = draft.instrumental ? [] : songSections(draft.lyrics), sung = sections.reduce((n, s) => n + s.lines.filter(sungLine).reduce((m, line) => m + singTime(line), 0), 0);
  return sung ? Math.min(480, Math.max(30, Math.ceil((sung * 1.2 + sections.length * 8 + 16) / 10) * 10)) : SONG_LENGTHS.mid.seconds;
}
const lrcTime = at => { const s = Math.max(0, at), m = Math.floor(s / 60); return `[${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}]`; };
const INSTRUMENTAL_SECONDS = 8;

/** Lines at their times, as LRC, for sections that take known spans: [{lines, seconds}]. Within a span the lines share it by their length. */
function lrcOf(spans, start = 0) {
  const out = [];
  let at = start;
  for (const {lines, seconds} of spans) {
    const sung = lines.filter(sungLine), total = sung.reduce((n, line) => n + singTime(line), 0);
    let t = at;
    for (const line of sung) { out.push(lrcTime(t) + line); t += seconds * (singTime(line) / total); }
    at += seconds;
  }
  return out.join('\n');
}
/**
 * The song's lines at estimated times, as LRC, given how long the song came out: the words sung at an even pace, the played sections about
 * two lines long, a little before the first line when no intro is written (the services tend to begin with one). '' without a length or words.
 */
export function estimateLrc(lyrics, seconds) {
  const sections = songSections(lyrics), total = Number(seconds);
  if (!(total > 0) || !sections.some(s => s.lines.some(sungLine))) return '';
  const need = sections.map(s => s.lines.some(sungLine) ? s.lines.filter(sungLine).reduce((n, line) => n + singTime(line), 0) : INSTRUMENTAL_SECONDS);
  const lead = PLAYED.test(sections[0].tag) ? 0 : Math.min(12, total * .06), tail = total * .04;
  const scale = Math.max(0, total - lead - tail) / need.reduce((a, b) => a + b, 0);
  return lrcOf(sections.map((s, i) => ({lines: s.lines, seconds: need[i] * scale})), lead);
}

// ---------- A style for the services ----------
const VOCALS = {中文: 'Mandarin Chinese vocals', 普通话: 'Mandarin Chinese vocals', 粤语: 'Cantonese vocals', 日语: 'Japanese vocals', 英语: 'English vocals', 韩语: 'Korean vocals'};
/** The language to sing in, in the words a service reads best. */
export const vocalWords = language => { const l = String(language ?? '').trim(); return l ? VOCALS[l] || `${l} vocals` : ''; };
/** The style as it is sent: with the language in it when the words are to be sung and it says none. */
export function styleFor({style, language, instrumental}) {
  const s = String(style ?? '').trim(), vocal = instrumental ? '' : vocalWords(language);
  return instrumental && !/instrumental/i.test(s) ? [s, 'instrumental, no vocals'].filter(Boolean).join(', ') : vocal && !/vocal|人声|演唱|唱/i.test(s) ? [s, vocal].filter(Boolean).join(', ') : s;
}
const styleList = style => String(style ?? '').split(/[,，、;；\n]+/).map(s => s.trim()).filter(Boolean);
const MAX_CHUNKS = 30, MAX_LINES = 30, MAX_LINE = 200, MAX_TOTAL_MS = 300000;
const ms = seconds => Math.round(Math.min(120, Math.max(3, seconds)) * 1000);

/**
 * The song as a plan of chunks (ElevenLabs takes words only this way): a section each, as long as it takes to sing, every chunk within what the
 * service allows; and the lines at the times those chunks give (it keeps to them), as LRC.
 */
export function chunkPlan({lyrics, style}) {
  const parts = [];
  for (const s of songSections(lyrics)) {
    const lines = s.lines.map(line => line.slice(0, MAX_LINE));
    if (!lines.length) { parts.push({tag: s.tag, lines}); continue; }
    for (let i = 0; i < lines.length; i += MAX_LINES) parts.push({tag: s.tag, lines: lines.slice(i, i + MAX_LINES)});
  }
  // Past the most it takes, the last ones go on as one.
  while (parts.length > MAX_CHUNKS) { const last = parts.pop(); parts.at(-1).lines = [...parts.at(-1).lines, ...last.lines].slice(0, MAX_LINES); }
  let spans = parts.map(p => ({...p, ms: ms(p.lines.some(sungLine) ? p.lines.reduce((n, line) => n + (sungLine(line) ? singTime(line) : 0), 0) : INSTRUMENTAL_SECONDS)}));
  const total = spans.reduce((n, p) => n + p.ms, 0);
  if (total > MAX_TOTAL_MS) spans = spans.map(p => ({...p, ms: Math.max(3000, Math.floor(p.ms * MAX_TOTAL_MS / total))}));
  const tags = styleList(style), styles = (tags.length ? tags : ['pop']).slice(0, 14);
  if (styles.length < 6) styles.push('polished production');
  return {
    chunks: spans.map((p, i) => ({text: [`[${p.tag}]`, ...p.lines].join('\n'), duration_ms: p.ms, positive_styles: i ? styles.slice(0, 6) : styles, negative_styles: [], context_adherence: 'high'})),
    seconds: spans.reduce((n, p) => n + p.ms, 0) / 1000,
    lyric: lrcOf(spans.map(p => ({lines: p.lines, seconds: p.ms / 1000})))
  };
}

// ---------- The text model ----------
/**
 * What the text model is told for a song. form: {about, language, genre, wording, voice, length, instrumental}; owner: whose song it is
 * ({name, persona, card}), if anyone's; before and wish: the song as it stands and how to change it.
 */
export function buildSongRequest({prompts = {}, form = {}, owner = null, user = '我', userPersona = '', story = [], lore = '', earlier = '', memory = '', history = [], before = null, wish = ''}) {
  const f = normalizeSongForm(form), now = {'用户': user};
  const whose = owner ? `${owner.name}：${String(owner.persona || owner.card || '').trim() || '（没有资料，按剧情里的表现来）'}${memory ? `\n${owner.name}记得的事：${memory}` : ''}` : '';
  const system = promptText(prompts, 'song', 'system', {...now, '谁的歌': whose, '世界书': lore.trim(), '用户设定': userPersona.trim(), '更早的剧情': earlier.trim(),
    '最近的剧情': story.map(s => `${s.name}：${s.text}`).join('\n'), '最近的聊天': history.join('\n')});
  const ask = promptText(prompts, 'song', 'ask', {...now, '写什么': String(form.about ?? '').trim(), '语言': f.language, '曲风': f.genre, '歌词风格': f.wording, '人声': f.voice,
    '长度': SONG_LENGTHS[f.length].text, '纯音乐': form.instrumental === true,
    '原来的歌': before ? `歌名：${before.title}\n风格：${before.style}\n歌词：\n${before.lyrics}` : '', '想怎么改': String(wish ?? '').trim()});
  return [{role: 'system', content: system}, {role: 'user', content: ask}];
}
const between = (text, tag) => new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i').exec(text)?.[1] ?? null;
/** The model's answer as {title, style, lyrics}. */
export function parseSongReply(reply) {
  const body = String(reply ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^\s*```[a-z]*\s*$/gim, '');
  const title = between(body, 'title'), style = between(body, 'style'), lyrics = between(body, 'lyrics');
  if (title === null && style === null && lyrics === null) throw Error('模型没有按格式写歌，可以再试一次');
  return {
    title: clip(String(title ?? '').replace(/[《》「」"“”]/g, '').trim(), SONG_LIMITS.title),
    style: clip(String(style ?? '').replace(/\s*\n\s*/g, ', ').trim(), SONG_LIMITS.style),
    lyrics: clip(String(lyrics ?? '').trim(), SONG_LIMITS.lyrics)
  };
}
