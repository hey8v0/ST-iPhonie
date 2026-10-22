// 音乐: the phone's music player, background music the story picks (<bgm>), and songs characters share. No DOM here:
// settings, the user's own music sources (no source ships with the plugin), the tags, the rule for the story model,
// lyrics and matching a song asked for by name.
//
// A source is two web addresses the user fills in: one that searches ({{query}}) and one that gives a playable link for
// a song id ({{id}}), plus where in their JSON answers the list, the id, the title, the artist and the link are (dotted
// paths such as data.list or data.url). A lyrics address is optional.
import {promptText} from './prompt-rules.js';

export const BGM_MODES = Object.freeze(['off', 'tap', 'auto']);
export const BGM_MODE_NAMES = Object.freeze({off: '关', tap: '点一下才放', auto: '自动放'});
export const MUSIC_LIMITS = Object.freeze({file: 40 * 1024 * 1024, sources: 20, songs: 2000, rule: 6000, recent: 8});

export const DEFAULT_BGM_RULE = [
  '【背景音乐】给这段正文选一首最贴合此刻的歌当背景音乐：',
  '1. 先想清楚现在的场景特征和人物心境，还有上一首放的是什么（不要重复）。',
  '2. 从不同曲风里各想两三首：古典、管弦、传统和风这类；承载回忆的老歌金曲；华语、J-pop、欧美流行；电子、独立、Vocaloid 这类新颖的。',
  '3. 优先选有人声演唱的歌，人声的都不合适才选纯音乐或原声带；不限国家、地区和语言，选最能一瞬间点燃这个场景的那一首。',
  '4. 在正文最开头单独一行写 <bgm>歌名 - 歌手</bgm>，歌名和歌手写原文（方便搜到）。场景和情绪没变时不写，继续放上一首。',
  '最近放过：{{最近}}'
].join('\n');

export function defaultMusic() {
  return {bgm: 'off', rule: DEFAULT_BGM_RULE, volume: 0.6, duck: true, share: true, sources: []};
}
const clip = (value, max) => String(value ?? '').slice(0, max);
const path = value => clip(value, 120).trim().replace(/[^\w.$[\]-]/g, '');
/** One music source as kept: addresses must be http(s) and say where the search words and the song id go. */
export function normalizeSource(value = {}, i = 0) {
  return {
    id: clip(value.id, 60).trim() || `source-${i + 1}`,
    name: clip(value.name, 30).trim() || `音源 ${i + 1}`,
    enabled: value.enabled !== false,
    search: clip(value.search, 1000).trim(), url: clip(value.url, 1000).trim(), lyric: clip(value.lyric, 1000).trim(),
    listPath: path(value.listPath), idPath: path(value.idPath) || 'id', titlePath: path(value.titlePath) || 'name',
    artistPath: path(value.artistPath) || 'artist', urlPath: path(value.urlPath) || 'url', lyricPath: path(value.lyricPath) || 'lyric',
    // 取歌地址 answers with the audio itself (or sends on to it), not with JSON: the address is played as it is.
    direct: value.direct === true
  };
}
export function validateSource(s) {
  // A web address, or one on the tavern itself (/api/plugins/… of a server plugin the user installed).
  const web = v => /^(?:https?:\/\/|\/(?!\/))[^\s]+$/i.test(v);
  if (!web(s.search) || !s.search.includes('{{query}}')) throw Error('「搜索地址」要以 http(s):// 开头（酒馆自己的地址以 / 开头），并且在放搜索词的地方写 {{query}}');
  if (!web(s.url) || !s.url.includes('{{id}}')) throw Error('「取歌地址」要以 http(s):// 开头（酒馆自己的地址以 / 开头），并且在放歌曲 ID 的地方写 {{id}}');
  if (s.lyric && (!web(s.lyric) || !s.lyric.includes('{{id}}'))) throw Error('「歌词地址」要以 http(s):// 或 / 开头，并且写 {{id}}（不需要歌词就空着）');
  return s;
}
/** An address on the tavern itself (a server plugin): asked with the tavern's own login and checks. */
export const onTavern = url => /^\/(?!\/)/.test(String(url));
export function normalizeMusic(value) {
  const base = defaultMusic();
  if (!value || typeof value !== 'object') return base;
  const sources = (Array.isArray(value.sources) ? value.sources : []).slice(0, MUSIC_LIMITS.sources).map(normalizeSource);
  const seen = new Set();
  return {
    bgm: BGM_MODES.includes(value.bgm) ? value.bgm : base.bgm,
    rule: typeof value.rule === 'string' && value.rule.trim() ? clip(value.rule, MUSIC_LIMITS.rule) : base.rule,
    volume: Number.isFinite(Number(value.volume)) ? Math.min(1, Math.max(0, Number(value.volume))) : base.volume,
    duck: value.duck !== false, share: value.share !== false,
    sources: sources.map(s => seen.has(s.id) ? {...s, id: s.id + '-' + seen.size} : s).filter(s => seen.add(s.id))
  };
}

// ---------- Reading what a source answers ----------
/** The value at a dotted path (data.list, data[0].url); the whole value for an empty path. */
export function pick(value, dotted) {
  if (!dotted) return value;
  let at = value;
  for (const key of String(dotted).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) { if (at == null) return undefined; at = at[key]; }
  return at;
}
/** The first list in an answer (when the source does not say where its list is). */
function firstList(value, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object' || depth > 3) return null;
  for (const v of Object.values(value)) { const found = firstList(v, depth + 1); if (found) return found; }
  return null;
}
const names = value => Array.isArray(value) ? value.map(v => typeof v === 'object' && v ? v.name || '' : v).filter(Boolean).join(' / ') : typeof value === 'object' && value ? String(value.name || '') : String(value ?? '');
/** A search answer as songs: [{source, id, title, artist}]. */
export function readSearch(source, json) {
  const list = (source.listPath ? pick(json, source.listPath) : null) || firstList(json) || [];
  return (Array.isArray(list) ? list : []).slice(0, 30).map(item => ({
    source: source.id, id: clip(pick(item, source.idPath) ?? '', 200), title: clip(names(pick(item, source.titlePath)), 200).trim(), artist: clip(names(pick(item, source.artistPath)), 200).trim()
  })).filter(s => s.id && s.title);
}
/** An address with {{query}} / {{id}} (and, for sources that like a hint, {{title}} / {{artist}}) filled in. */
export const fill = (template, values) => String(template).replace(/\{\{(query|id|title|artist)\}\}/g, (m, key) => encodeURIComponent(values[key] ?? ''));
/** The playable link in a 取歌 answer (a plain string answer, or the link itself, counts too). */
export function readLink(source, json) {
  const value = typeof json === 'string' ? json : pick(json, source.urlPath);
  const link = typeof value === 'string' ? value.trim() : '';
  if (/^https?:\/\//i.test(link)) return link;
  // 「链接在哪」 not matching this backend's answer (or pointing at the list around the link): the link is looked for.
  return value === null ? '' : findLink(value !== undefined && typeof value === 'object' ? value : json);
}
const LINK_KEYS = /^(?:url|src|link|play_?url|audio_?url|music_?url|mp3|file)$/i, AUDIO_FILE = /\.(?:mp3|m4a|flac|aac|ogg|opus|wav)(?:[?#]|$)/i;
/** The first web address in an answer that looks like the song: under a key such as url / src, or ending like an audio file. */
function findLink(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return '';
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [key, v] of entries) if (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()) && (LINK_KEYS.test(key) || AUDIO_FILE.test(v))) return v.trim();
  for (const [, v] of entries) { const found = findLink(v, depth + 1); if (found) return found; }
  return '';
}
/** A place for the link that is there but empty (QQ 音乐 API: data.<songmid>.url is ""). */
function emptyLink(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return false;
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  return entries.some(([key, v]) => (LINK_KEYS.test(key) && (v === '' || v === null)) || emptyLink(v, depth + 1));
}
const SAID_KEYS = /^(?:error|err|errmsg|err_?msg|msg|message|reason|tips?)$/i, FINE = /^(?:ok|success|succeed|成功|null|undefined)$/i;
/** What the source itself says in its answer (「无可用直链」), when it says more than ok. */
export function sourceSays(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return '';
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [key, v] of entries) if (SAID_KEYS.test(key) && typeof v === 'string' && v.trim() && !FINE.test(v.trim())) return v.trim().slice(0, 120);
  for (const [, v] of entries) { const said = sourceSays(v, depth + 1); if (said) return said; }
  return '';
}
const LOGIN = '多半是音源后端没登录（或这首要会员）：网易云 API 可以在取歌地址后面加 &cookie=你的登录 cookie；QQ 音乐这类 API 要在它那边登录或填 QQ 的 cookie，具体看那个 API 的说明。没登录时很多歌拿不到链接，会员歌最多只给 30 秒试听';
/** Why a 取歌 answer gave no link, in words: what the source said, an empty value where the link goes, or no such place. */
export function missingLink(source, json) {
  const value = typeof json === 'string' ? json : pick(json, source.urlPath), path = source.urlPath || '整个回答';
  const said = typeof json === 'object' ? sourceSays(json) : '';
  if (value === null || value === '' || (typeof json === 'object' && emptyLink(json))) {
    return `音源回答了，但播放链接是空的${said ? `，音源自己说：「${said}」` : ''}。${LOGIN}。也可能是这首没有版权（换一首试试），或者音源按请求的 IP 判断地区（网页、手机开了代理、云酒馆的转发，都可能不被当成国内）：网易云 API 的取歌地址加上 &randomCNIP=true 就会用国内 IP 去问，插件遇到网易云这种地址已经自动加上再试过了；这个参数要较新的网易云 API 才认，旧版本要更新`;
  }
  let shown = '';
  try { shown = typeof json === 'string' ? json : JSON.stringify(json); } catch { /* not shown */ }
  return `在音源的回答里没找到「${path}」，也没认出别的播放链接${said ? `；音源自己说：「${said}」` : ''}；回答的开头是：${String(shown).replace(/\s+/g, ' ').slice(0, 160)}`;
}
/** A NetEase answer that gives only the 30-second preview of a 会员 song (freeTrialInfo is set). */
export const trialOnly = json => !!(json && typeof json === 'object' && [].concat(json.data ?? []).some(d => d && typeof d === 'object' && d.freeTrialInfo && typeof d.freeTrialInfo === 'object'));
/**
 * The 取歌 address once more as a Chinese IP, for a NeteaseCloudMusicApi-style backend that gave no link: it tells
 * Netease the IP the request came from (the phone, a VPN, the cloud tavern's proxy), and Netease gives nothing to an IP
 * it does not place in China — while the same backend asked on its own server does give the link. null when the
 * address is not that kind, or already says which IP to use.
 */
export function asChina(address) {
  const a = String(address || '');
  if (!/\/song\/url(?:\/v1)?\?/i.test(a) || /[?&](?:randomCNIP|realIP)=/i.test(a)) return null;
  return a + '&randomCNIP=true';
}
/** An answer that is the song itself (a stream, or a redirect that ended at the file) rather than JSON about it. */
export const isAudio = type => /^(?:audio|video)\/|octet-stream|mpegurl/i.test(String(type || ''));
/** A server on this computer or this home network (a backend the user runs: its links stay http). */
export const nearby = link => { try { return /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[::1\]$|[^.]+$)/i.test(new URL(link).hostname); } catch { return false; } };
/** An http link on a page opened over https would be blocked: upgraded, unless it is the user's own nearby server. */
export const playable = (link, pageProtocol = 'http:') => pageProtocol === 'https:' && /^http:\/\//i.test(link) && !nearby(link) ? link.replace(/^http:\/\//i, 'https://') : link;

/**
 * Backends the user runs themselves (on their computer, or in Termux on the phone): only the layout of their answers
 * ships here, never an address — the user types where their own server is.
 */
export const SELF_HOSTED = Object.freeze([
  {id: 'netease-api', name: '网易云音乐 API（NeteaseCloudMusicApi 这类，自己搭的）', example: 'http://localhost:3000',
    fill: base => ({name: '网易云（我的后端）', search: base + '/cloudsearch?keywords={{query}}&limit=20', url: base + '/song/url/v1?id={{id}}&level=standard&randomCNIP=true', lyric: base + '/lyric?id={{id}}',
      listPath: 'result.songs', idPath: 'id', titlePath: 'name', artistPath: 'ar', urlPath: 'data[0].url', lyricPath: 'lrc.lyric'})}
]);

// ---------- Lyrics ----------
/** LRC text as [{at (seconds), text}], in time order; plain lyrics give none. */
export function parseLyrics(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) out.push({at: Number(s[1]) * 60 + Number(s[2].replace(':', '.')), text: words});
  }
  return out.filter(l => Number.isFinite(l.at)).sort((a, b) => a.at - b.at);
}
/** The lyric line playing at `seconds` (index, or -1 before the first). */
export const lyricAt = (lines, seconds) => { let i = -1; for (let k = 0; k < lines.length && lines[k].at <= seconds + 0.2; k++) i = k; return i; };

// ---------- <bgm> ----------
const TAG = /<bgm\b[^>]*>([^<>]{1,200}?)<\/bgm\s*>/gi;
/** 「歌名 - 歌手」 (also 歌名——歌手, 《歌名》歌手, 歌名|歌手) as {title, artist}. */
export function songOf(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  const book = raw.match(/^《([^》]+)》\s*[-—–·|｜/、]?\s*(.*)$/);
  if (book) return {title: book[1].trim(), artist: book[2].trim()};
  const [title, ...rest] = raw.split(/\s+[-—–]+\s+|\s*[|｜]\s*|——/);
  return {title: clip(title, 120).trim(), artist: clip(rest.join(' ').trim(), 120)};
}
/** The <bgm> tags of a reply: [{title, artist, start, end, index}]. */
export function parseBgm(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(TAG)) { const s = songOf(m[1]); if (s.title) out.push({...s, start: m.index, end: m.index + m[0].length, index: out.length}); }
  return out;
}
export const withoutBgm = text => String(text ?? '').replace(TAG, '');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** The reply as shown: each <bgm> becomes a small ♪ chip (tap to play); with background music off it is left out. */
export function renderBgm(text, marker, on = true) {
  const source = String(text ?? '');
  if (!on) return withoutBgm(source);
  const tags = parseBgm(source);
  if (!tags.length) return withoutBgm(source);
  let out = '', at = 0;
  for (const t of tags) {
    const label = t.artist ? `${t.title} - ${t.artist}` : t.title;
    out += withoutBgm(source.slice(at, t.start)) + `<span class="sttts-bgm" data-sttts-bgm="${t.index}" data-sttts-token="${escape(marker)}"><button type="button" class="sttts-bgm-chip" data-sttts-action="bgm" title="背景音乐：${escape(label)}（点一下播放）" aria-label="背景音乐：${escape(label)}">♪ ${escape(label)}</button></span>`;
    at = t.end;
  }
  return out + withoutBgm(source.slice(at));
}
/** The rule for the story request, with the songs played lately (not to repeat) and, when there are any, the user's own. */
export function bgmRule(music, {prompts = {}, recent = [], library = [], user = '我'} = {}) {
  if (!music || music.bgm === 'off') return '';
  const text = String(music.rule || DEFAULT_BGM_RULE).replaceAll('{{用户}}', user).replaceAll('{{最近}}', recent.length ? recent.slice(0, MUSIC_LIMITS.recent).join('、') : '（还没有）');
  const mine = library.slice(0, 60).map(s => s.artist ? `${s.title} - ${s.artist}` : s.title);
  return [text, mine.length ? promptText(prompts, 'music', 'library', {'用户': user, '歌单': mine.join('、')}) : ''].filter(Boolean).join('\n');
}
export function musicPromptPlan(text) { return text ? [{key: 'sttts.entry.bgm', text, position: 1, depth: 0, role: 0}] : []; }
/** What the user is listening to, for the story and the phone chat (一起听). */
export function listeningNote(track, user = '我', prompts = {}) {
  if (!track?.title) return '';
  return promptText(prompts, 'music', 'listening', {'用户': user, '歌': track.artist ? `${track.title} - ${track.artist}` : track.title});
}

// ---------- Matching ----------
const loose = value => String(value ?? '').toLowerCase().normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').replace(/(?:feat|ft)\..*$/i, '');
/** How well a song matches what was asked (0 none … 3 title and artist). */
export function matchScore(song, want) {
  const t = loose(song.title), w = loose(want.title);
  if (!t || !w) return 0;
  const title = t === w ? 2 : t.includes(w) || w.includes(t) ? 1 : 0;
  if (!title) return 0;
  const a = loose(song.artist), b = loose(want.artist);
  return title + (a && b && (a.includes(b) || b.includes(a)) ? 1 : 0);
}
/** The best of `songs` for a request, or null when none has the title. */
export function bestMatch(songs, want) {
  let best = null, score = 0;
  for (const s of songs) { const n = matchScore(s, want); if (n > score) { best = s; score = n; } }
  return best;
}
/** A song row as kept in the library: {id, kind: 'song', at, title, artist, origin: 'file'|'source', size?, mime?, source?, songId?, lyric?}. */
export function songRow(value = {}, at = Date.now()) {
  const title = clip(value.title, 200).trim();
  if (!title) throw Error('给这首歌起个名字');
  const row = {id: clip(value.id, 200) || 'song:' + globalThis.crypto.randomUUID(), kind: 'song', at, title, artist: clip(value.artist, 200).trim(), origin: value.origin === 'source' ? 'source' : 'file'};
  if (row.origin === 'source') { row.source = clip(value.source, 60); row.songId = clip(value.songId, 200); if (!row.source || !row.songId) throw Error('这首歌缺少音源信息'); }
  if (value.lyric) row.lyric = clip(value.lyric, 60000);
  return row;
}
/** A file name as 歌名 and 歌手 (「歌手 - 歌名.mp3」 is the usual way music files are named). */
export function titleFromFile(name) {
  const base = String(name ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').trim();
  const parts = base.split(/\s+-\s+/);
  return parts.length >= 2 ? {title: parts.slice(1).join(' - ').trim(), artist: parts[0].trim()} : {title: base, artist: ''};
}
