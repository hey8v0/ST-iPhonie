// 本机的歌 added many at a time: files picked together or zip packs, sorted out into songs, their .lrc lyrics and
// what cannot be played (with why); each song's title, artist and lyrics read from the tags written in
// the file (ID3 in MP3 and AAC, Vorbis comments in FLAC and Ogg / Opus, the iTunes list in M4A), else from its name;
// an .lrc goes with the song of the same name. No DOM here: the music app (ui/music.js) picks the files and keeps them
// a few at a time (backend addSongFiles).
import {MUSIC_LIMITS, titleFromFile, parseLyrics} from './music.js';
import {readZipBlob} from './model-files.js';

const extOf = name => (/\.([^./\\]+)$/.exec(String(name ?? '')) || [])[1]?.toLowerCase() || '';
/** The audio types browsers play, by file name (a picked file often comes without one: zips, Android). */
export const SONG_TYPES = Object.freeze({mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', weba: 'audio/webm'});
// what music apps download for their own player only (encrypted: 网易云 .ncm, QQ 音乐 .qmc* / .mflac / .mgg, 酷狗 .kgm,
// 酷我 .kwm …), and audio no browser plays
const LOCKED = /^(?:ncm|uc!|qmc\w*|mflac\w*|mgg\w*|mmp4|tkm|bkc\w+|tm\d|kgm|kgma|kgg|vpr|kwm|xm|x2m|x3m|mg3d|m4p)$/;
const UNPLAYABLE = /^(?:ape|wma|dsf|dff|tta|wv|amr|ac3|dts|mid|midi)$/;
/** What a picked file is: 'song', 'lyric' (.lrc), 'zip', 'locked' (a music app's encrypted download), 'unplayable',
 *  'archive' (.rar, .7z) or '' (anything else: pictures, text, playlists). */
export function fileKind(name, type = '') {
  const ext = extOf(name);
  if (ext === 'lrc') return 'lyric';
  if (ext === 'zip' || /^application\/(?:x-)?zip/i.test(type)) return 'zip';
  if (LOCKED.test(ext)) return 'locked';
  if (UNPLAYABLE.test(ext)) return 'unplayable';
  if (ext === 'rar' || ext === '7z') return 'archive';
  return SONG_TYPES[ext] || /^audio\//i.test(type) ? 'song' : '';
}
const why = (kind, ext) => ({
  locked: '是音乐 App 下载的加密格式，只能在那个 App 里放',
  unplayable: `浏览器放不了 .${ext} 格式，转成 MP3 或 FLAC 再加`,
  archive: `只认 zip 压缩包，.${ext} 要先解压或者改压成 zip`
})[kind];

const collator = new Intl.Collator('zh', {numeric: true, sensitivity: 'base'});
const folderOf = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const stemOf = path => path.split('/').pop().replace(/\.[^.]+$/, '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
/**
 * What was picked, sorted out: {songs: [{name, path, size, open(), lyric?}], lyrics: the .lrc files no song here has,
 * skipped: [{name, why}], others: how many other files were left alone}. A zip counts as its files; songs come in the
 * order of their paths (an album's tracks in turn); each gets the .lrc of the same name from its own folder (from
 * anywhere when only one song and one .lrc have that name). open() gives the file (a zip's when asked).
 */
export async function sortPicked(files) {
  const items = [], skipped = [];
  for (const f of files) {
    const name = String(f.name || ''), kind = fileKind(name, f.type);
    if (kind !== 'zip') { items.push({name, path: String(f.webkitRelativePath || name), size: f.size, kind, open: async () => f}); continue; }
    try {
      for (const [path, entry] of await readZipBlob(f)) {
        const inner = path.split('/').pop(), what = fileKind(inner);
        items.push({name: inner, path: name + '/' + path, size: entry.size, kind: what === 'zip' ? '' : what, open: entry.blob});
      }
    } catch (error) { skipped.push({name, why: error.message}); }
  }
  const songs = [], lrcs = [];
  let others = 0;
  for (const it of items) {
    if (it.kind === 'song') {
      if (!it.size) skipped.push({name: it.name, why: '是空文件'});
      else if (it.size > MUSIC_LIMITS.file) skipped.push({name: it.name, why: `太大了（一首最多 ${MUSIC_LIMITS.file / 1024 / 1024} MB）`});
      else songs.push(it);
    } else if (it.kind === 'lyric') lrcs.push(it);
    else if (why(it.kind)) skipped.push({name: it.name, why: why(it.kind, extOf(it.name))});
    else others++;
  }
  songs.sort((a, b) => collator.compare(a.path, b.path));
  const used = new Set(), same = (a, b) => stemOf(a.path) === stemOf(b.path);
  for (const s of songs) {
    const mine = lrcs.filter(l => !used.has(l) && same(l, s));
    const l = mine.find(x => folderOf(x.path) === folderOf(s.path)) || (mine.length === 1 && songs.filter(x => same(x, s)).length === 1 ? mine[0] : null);
    if (l) { s.lyric = l; used.add(l); }
  }
  const pick = ({kind, ...it}) => it;
  return {songs: songs.map(pick), lyrics: lrcs.filter(l => !used.has(l)).map(pick), skipped, others};
}
/** The songs in lots kept together: at most `count` songs and about `bytes` (a lot that would not fit is kept by itself). */
export function lots(songs, {count = 8, bytes = 64 * 1024 * 1024} = {}) {
  const out = [];
  let lot = [], size = 0;
  for (const s of songs) {
    if (lot.length && (lot.length >= count || size + s.size > bytes)) { out.push(lot); lot = []; size = 0; }
    lot.push(s); size += s.size;
  }
  if (lot.length) out.push(lot);
  return out;
}
const loose = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
/** A picked song as a row for the 歌单: {title, artist, lyric?, blob (with its audio type), file: its name}. The tags
 *  win over the name; a name's 歌手 still counts when the tags give only the same title. Lyrics: the .lrc with it, else
 *  timed ones in the tags. */
export async function readPicked(song) {
  const raw = await song.open(), type = /^audio\//i.test(raw.type) ? raw.type : SONG_TYPES[extOf(song.name)] || raw.type || '';
  const blob = raw.type === type ? raw : raw.slice(0, raw.size, type);
  const tags = await readTags(blob).catch(() => ({})), named = titleFromFile(song.name);
  const title = tags.title || named.title, artist = tags.artist || (!tags.title || loose(tags.title) === loose(named.title) ? named.artist : '');
  let lyric = song.lyric ? await song.lyric.open().then(lrcText).catch(() => '') : '';
  if (!lyric && tags.lyric && parseLyrics(tags.lyric).length) lyric = tags.lyric.slice(0, 60000);
  return {title, artist, ...(lyric ? {lyric} : {}), blob, file: song.name};
}
/** An .lrc file's text when it has timed lines ('' when not): UTF-8, UTF-16 (with its mark) or GBK, as written. */
export async function lrcText(file) {
  if (!file?.size || file.size > 1024 * 1024) return '';
  const b = new Uint8Array(await file.arrayBuffer());
  let text;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) text = new TextDecoder().decode(b.subarray(3));
  else if (b[0] === 0xff && b[1] === 0xfe) text = new TextDecoder('utf-16le').decode(b.subarray(2));
  else if (b[0] === 0xfe && b[1] === 0xff) text = new TextDecoder('utf-16be').decode(b.subarray(2));
  else { try { text = new TextDecoder('utf-8', {fatal: true}).decode(b); } catch { text = new TextDecoder('gb18030').decode(b); } }
  return parseLyrics(text).length ? text.slice(0, 60000) : '';
}

// ---------- Tags ----------
const read = async (blob, at, n) => at >= blob.size ? new Uint8Array(0) : new Uint8Array(await blob.slice(at, Math.min(blob.size, at + n)).arrayBuffer());
const latin = b => String.fromCharCode(...b);
const be32 = (b, at) => (b[at] << 24 | b[at + 1] << 16 | b[at + 2] << 8 | b[at + 3]) >>> 0;
const safe32 = (b, at) => (b[at] & 127) << 21 | (b[at + 1] & 127) << 14 | (b[at + 2] & 127) << 7 | b[at + 3] & 127;
// a value that only says nothing is known
const PLACEHOLDER = /^(?:unknown(?: artist| title)?|<unknown>|未知(?:歌手|艺术家|艺人|歌曲|标题)?|track\s*\d*|音轨\s*\d*)$/i;
const clean = value => { const v = String(value ?? '').replace(/\0+$/, '').trim(); return v && !PLACEHOLDER.test(v) ? v.slice(0, 200) : ''; };
/** {title, artist, lyric} written in a song file, those it has; {} when it has none this reads. Only the tags are read,
 *  a little at a time (a cover picture or the sound is skipped, not read). */
export async function readTags(blob) {
  const head = await read(blob, 0, 12);
  let at = 0, tags = {};
  if (latin(head.subarray(0, 3)) === 'ID3') {
    tags = await id3(blob);
    at = 10 + safe32(head, 6) + (head[3] === 4 && head[5] & 0x10 ? 10 : 0);
  }
  const next = at ? await read(blob, at, 12) : head;
  const more = latin(next.subarray(0, 4)) === 'fLaC' ? await flac(blob, at)
    : latin(next.subarray(0, 4)) === 'OggS' ? await ogg(blob)
    : latin(next.subarray(4, 8)) === 'ftyp' ? await mp4(blob) : {};
  const out = {};
  for (const k of ['title', 'artist', 'lyric']) { const v = k === 'lyric' ? String(tags[k] || more[k] || '').trim() : clean(tags[k]) || clean(more[k]); if (v) out[k] = v; }
  return out;
}

// ID3v2.2 / 2.3 / 2.4 (MP3, also in front of AAC and some FLAC)
// (lyrics are also in a TXXX frame named LYRICS or UNSYNCEDLYRICS — foobar2000 — or USLT — ffmpeg)
const ID3_WANT = {TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TPE2: 'band', TP2: 'band', USLT: 'lyric', ULT: 'lyric', TXXX: 'extra', TXX: 'extra'};
/** Undoes ID3's unsynchronisation (FF 00 → FF). */
const unsync = b => { const out = []; for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; } return Uint8Array.from(out); };
/** The strings of a text in an ID3 encoding (0 ISO-8859-1, 1 UTF-16 with its mark, 2 UTF-16BE, 3 UTF-8), split where a
 *  value ends. ISO-8859-1 is kept only as plain ASCII or UTF-8 (which some tools write there): other bytes there are
 *  mostly a local code page (GBK, Big5, Shift-JIS) that cannot be told apart, and the file name is better than a guess. */
function id3Strings(b, enc) {
  const wide = enc === 1 || enc === 2, out = [];
  let from = 0;
  for (let i = 0; i < b.length; i += wide ? 2 : 1) if (b[i] === 0 && (!wide || b[i + 1] === 0)) { out.push(b.subarray(from, i)); from = i + (wide ? 2 : 1); }
  out.push(b.subarray(from));
  return out.map(s => {
    if (!wide) { try { return new TextDecoder('utf-8', {fatal: true}).decode(s); } catch { return enc === 3 ? new TextDecoder().decode(s) : null; } }
    let le = enc === 1;
    if (s[0] === 0xff && s[1] === 0xfe) { le = true; s = s.subarray(2); } else if (s[0] === 0xfe && s[1] === 0xff) { le = false; s = s.subarray(2); }
    return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(s);
  });
}
async function id3(blob) {
  const h = await read(blob, 0, 10), v = h[3], flags = h[5], end = 10 + safe32(h, 6);
  if (v < 2 || v > 4 || (v === 2 && flags & 0x40)) return {};
  // a tag unsynchronised as a whole (before 2.4) is read in one go; else frame by frame, skipping pictures
  const whole = flags & 0x80 && v < 4 ? unsync(await read(blob, 10, Math.min(end, 16 * 1024 * 1024) - 10)) : null;
  const get = whole ? async (at, n) => whole.subarray(at - 10, at - 10 + n) : (at, n) => read(blob, at, n);
  const headLen = v === 2 ? 6 : 10, out = {};
  let at = 10;
  if (flags & 0x40) { const x = await get(at, 4); at += v === 4 ? safe32(x, 0) : 4 + be32(x, 0); }
  while (at + headLen <= end) {
    const f = await get(at, headLen), id = latin(f.subarray(0, v === 2 ? 3 : 4));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    // (some writers put plain sizes in 2.4 tags: a byte with its top bit set cannot be a synchsafe one)
    const n = v === 2 ? f[3] << 16 | f[4] << 8 | f[5] : v === 4 && !(f[4] & 128 || f[5] & 128 || f[6] & 128 || f[7] & 128) ? safe32(f, 4) : be32(f, 4);
    at += headLen;
    if (!n || at + n > end) break;
    const want = ID3_WANT[id];
    // compressed, encrypted or grouped frames are left alone
    const odd = v === 4 ? f[9] & 0x4c : v === 3 ? f[9] & 0xe0 : 0;
    if (want && (want === 'extra' ? !out.lyric : !out[want]) && !odd && n <= 1024 * 1024) {
      let b = await get(at, n);
      if (v === 4 && f[9] & 0x01) b = b.subarray(4);
      if (v === 4 && (f[9] & 0x02 || flags & 0x80)) b = unsync(b);
      if (want === 'lyric') {
        // encoding, language, a description, then the words
        out.lyric = id3Strings(b.subarray(4), b[0]).slice(1).filter(s => s !== null).join('');
      } else if (want === 'extra') {
        // encoding, a name, then the value
        const [name, ...value] = id3Strings(b.subarray(1), b[0]);
        if (/^(?:lyrics|unsyncedlyrics|uslt)$/i.test(name || '')) out.lyric = value.filter(s => s !== null).join('');
      } else out[want] = id3Strings(b.subarray(1), b[0]).filter(s => s && s.trim()).join(' / ');
    }
    at += n;
  }
  return {title: out.title, artist: out.artist || out.band, lyric: out.lyric};
}

/** Vorbis comments (FLAC's, Ogg Vorbis', Opus'): TITLE, ARTIST (or ALBUMARTIST), LYRICS; a cut-off list gives what it has. */
function vorbis(b) {
  const all = {}, v = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
  try {
    let at = 4 + v.getUint32(0, true);
    const count = v.getUint32(at, true);
    at += 4;
    for (let i = 0; i < count && at + 4 <= b.length; i++) {
      const n = v.getUint32(at, true), s = dec.decode(b.subarray(at + 4, at + 4 + n)), eq = s.indexOf('=');
      at += 4 + n;
      if (eq > 0) (all[s.slice(0, eq).toUpperCase()] ||= []).push(s.slice(eq + 1));
    }
  } catch { /* cut off: what was read */ }
  const one = (...keys) => keys.map(k => all[k]).find(x => x?.length);
  return {title: one('TITLE')?.join(' / '), artist: one('ARTIST', 'ALBUMARTIST', 'ALBUM ARTIST')?.join(' / '), lyric: one('LYRICS', 'UNSYNCEDLYRICS')?.[0]};
}
async function flac(blob, at) {
  at += 4;
  for (let n = 0; n < 128; n++) {
    const h = await read(blob, at, 4);
    if (h.length < 4) break;
    const size = h[1] << 16 | h[2] << 8 | h[3];
    if ((h[0] & 127) === 4) return size <= 1024 * 1024 ? vorbis(await read(blob, at + 4, size)) : {};
    if (h[0] & 128) break;
    at += 4 + size;
  }
  return {};
}
/** Ogg Vorbis / Opus: the second packet holds the comments (read from the first MB, across pages). */
async function ogg(blob) {
  const b = await read(blob, 0, 1024 * 1024), packets = [];
  let at = 0, part = [];
  const join = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
  while (packets.length < 2 && at + 27 <= b.length && latin(b.subarray(at, at + 4)) === 'OggS') {
    const segments = b.subarray(at + 27, at + 27 + b[at + 26]);
    let body = at + 27 + segments.length;
    for (const len of segments) {
      part.push(b.subarray(body, body + len));
      body += len;
      if (len < 255) { packets.push(join(part)); part = []; if (packets.length === 2) break; }
    }
    at = body;
  }
  const c = packets[1] || (packets.length === 1 && part.length ? join(part) : null);
  if (!c) return {};
  if (latin(c.subarray(0, 8)) === 'OpusTags') return vorbis(c.subarray(8));
  return c[0] === 3 && latin(c.subarray(1, 7)) === 'vorbis' ? vorbis(c.subarray(7)) : {};
}
/** M4A / MP4: moov › udta › meta › ilst (©nam, ©ART or aART, ©lyr), wherever moov is in the file. */
async function mp4(blob) {
  let at = 0;
  for (let n = 0; n < 64 && at + 8 <= blob.size; n++) {
    const h = await read(blob, at, 16), type = latin(h.subarray(4, 8));
    let size = be32(h, 0), head = 8;
    if (size === 1) { size = be32(h, 8) * 2 ** 32 + be32(h, 12); head = 16; } else if (size === 0) size = blob.size - at;
    if (size < head) break;
    if (type === 'moov') return size <= 16 * 1024 * 1024 ? items(await read(blob, at + head, size - head)) : {};
    at += size;
  }
  return {};
}
/** The boxes inside b[from, to): [{type, from (its content), to}]. */
function boxes(b, from = 0, to = b.length) {
  const out = [];
  for (let at = from; at + 8 <= to;) {
    const size = be32(b, at);
    if (size < 8 || at + size > to) break;
    out.push({type: latin(b.subarray(at + 4, at + 8)), from: at + 8, to: at + size});
    at += size;
  }
  return out;
}
function items(moov) {
  const inside = (list, type) => list.find(x => x.type === type);
  const udta = inside(boxes(moov), 'udta'), meta = udta && inside(boxes(moov, udta.from, udta.to), 'meta');
  if (!meta) return {};
  // meta is a full box (4 bytes of version and flags first), but not in QuickTime files
  const ilst = inside(boxes(moov, latin(moov.subarray(meta.from + 4, meta.from + 8)) === 'hdlr' ? meta.from : meta.from + 4, meta.to), 'ilst');
  if (!ilst) return {};
  const out = {}, dec = new TextDecoder();
  for (const item of boxes(moov, ilst.from, ilst.to)) {
    const key = {'\xa9nam': 'title', '\xa9ART': 'artist', aART: 'band', '\xa9lyr': 'lyric'}[item.type], data = key && inside(boxes(moov, item.from, item.to), 'data');
    // data: a type (1 is UTF-8 text) and a locale, then the value
    if (data && be32(moov, data.from) === 1) out[key] ||= dec.decode(moov.subarray(data.from + 8, data.to));
  }
  return {title: out.title, artist: out.artist || out.band, lyric: out.lyric};
}
