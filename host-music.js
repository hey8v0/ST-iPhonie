// 音乐 on the tavern page: one <audio> that plays the 歌单, search results, the story's background music (<bgm>) and
// songs characters share, so it goes on while the phone is put away. While a voice line plays it is turned down (when
// 说台词时调小 is on). What is playing is told to the story and the phone chats (一起听), and shown on the island.
import {parseBgm, bgmRule, musicPromptPlan, listeningNote, parseLyrics, lyricAt, matchScore, songKey, MUSIC_LIMITS} from './core/music.js';

const RECENT_KEY = 'sttts.bgmRecent', PLAYED_KEY = 'sttts.bgmPlayed', DUCK = 0.3;
const label = t => t ? (t.artist ? `${t.title} - ${t.artist}` : t.title) : '';
const hash = text => { let h = 0; for (const c of String(text)) h = (h * 31 + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };

export function createMusicHost({context, settings, backend, notice = () => {}, doc = globalThis.document, AudioClass = globalThis.Audio, storage = globalThis.localStorage}) {
  const opts = () => settings()?.music || {};
  let audio = null, queue = [], index = -1, track = null, phase = 'idle', message = '', lyrics = [], ticket = 0, url = '', voiced = false, closed = false, lastEmit = 0;
  // which list plays (歌单, 正文点的歌, both): after a song the story picked, the music goes on with it; the order
  // songs were played in at random (上一首 goes back through it)
  let from = '', shuffled = [];
  let library = [], soundAt = 0;
  const onSound = () => { soundAt = Date.now(); };
  doc?.addEventListener?.('sttts-sound', onSound);
  const loadLibrary = () => backend.listSongs?.().then(rows => { library = rows; }).catch(() => {});
  loadLibrary();
  const unsubscribe = backend.subscribe?.(event => { if (event.type === 'music' && event.library) loadLibrary(); if (event.type === 'music' && event.settings) level(); });
  const remember = (key, fallback) => { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  const keep = (key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* this visit only */ } };
  let recent = remember(RECENT_KEY, []);

  function element() {
    if (!audio && AudioClass && !closed) {
      audio = new AudioClass();
      audio.preload = 'auto';
      audio.addEventListener('playing', () => set('playing'));
      // A pause no one asked for just as a sound starts (some phones do that): the music goes on.
      audio.addEventListener('pause', () => {
        if (phase !== 'playing') return;
        if (Date.now() - soundAt < 3000 && !audio.ended) { audio.play().catch(() => set('paused')); return; }
        set('paused');
      });
      // A song ends: 单曲循环 plays it again; otherwise the list goes on (after the story's song, the list last played,
      // or 正文点的歌)
      audio.addEventListener('ended', () => {
        if (opts().mode === 'one') { audio.currentTime = 0; audio.play().catch(error => set('error', error.message || '续播失败')); return; }
        if (track?.from === 'bgm') { goOn().catch(e => notice(e.message)); return; }
        next(1, true);
      });
      audio.addEventListener('timeupdate', () => { const now = Date.now(); if (now - lastEmit > 900) emit(); });
      // While loading, start() hears of it (play() fails) and tries the other sources.
      audio.addEventListener('error', () => { if (track && ['playing', 'paused'].includes(phase)) set('error', '这首歌放不出来（链接失效，或者是试听版）'); });
      level();
    }
    return audio;
  }
  function level() { if (audio) audio.volume = Math.min(1, Math.max(0, (opts().volume ?? 0.6) * (voiced && opts().duck !== false ? DUCK : 1))); }
  function emit() { lastEmit = Date.now(); backend.listening = phase === 'playing' && track && track.from !== 'bgm' ? {title: track.title, artist: track.artist} : null; backend.emit('music', {status: true}); }
  function set(next, words = '') { if (next === 'error') backend.reportDiagnostic?.('音乐播放', {message: words, track: {title: track?.title, artist: track?.artist}, mediaCode: audio?.error?.code}); phase = next; message = words; emit(); }

  /** The song's file or link: a 歌单 file, a source song (its link is fetched each time: they expire), or a name to look up. */
  async function source(t) {
    if (t.id && t.origin === 'file') { const blob = await backend.songBlob(t.id); if (!blob) throw Error('这首歌已经不在歌单里了'); return {src: URL.createObjectURL(blob), own: true}; }
    if (t.source && t.songId) {
      const src = await backend.musicLink(t.source, t.songId, {title: t.title, artist: t.artist});
      if (backend.musicTrial?.(src)) notice(`「${label(t)}」只拿到 30 秒试听：这首是会员歌，音源后端没登录会员账号`);
      return {src};
    }
    const found = await backend.findSong({title: t.title, artist: t.artist});
    if (!found) throw Error(opts().sources?.some(s => s.enabled) ? `没找到「${label(t)}」` : `歌单里没有「${label(t)}」，也还没有添加音源`);
    // A stand-in (nothing by that name was found) shows as itself: the same song for every pick means the source's
    // search does not use the words it is given.
    const {standIn, ...song} = found;
    if (standIn && found.title) notice(`没搜到「${label(t)}」，先放搜到的「${label(found)}」`);
    Object.assign(t, song, standIn && found.title ? {title: found.title, artist: found.artist || ''} : {title: t.title || found.title, artist: t.artist || found.artist});
    return source(t);
  }
  /** The same song on the enabled sources (same title), the ones not tried yet; other sources first. */
  async function others(t, tried) {
    if (!t.title || !opts().sources?.some(s => s.enabled)) return [];
    const {songs} = await backend.searchMusic([t.title, t.artist].filter(Boolean).join(' ')).catch(() => ({songs: []}));
    return songs.map(s => ({s, n: matchScore(s, t)})).filter(x => x.n >= 2 && !tried.has(x.s.source + '|' + x.s.id))
      .sort((a, b) => b.n - a.n || (a.s.source === t.source) - (b.s.source === t.source)).map(x => x.s);
  }
  async function start(t) {
    const mine = ++ticket, el = element();
    if (!el) throw Error('这个浏览器不能放音乐');
    track = t; lyrics = parseLyrics(t.lyric || ''); set('loading', '正在找这首歌……');
    // Source links expire and a source may refuse a song now and then: the song is then looked for on the other
    // sources (and the same one again under another ID) before giving up.
    const tried = new Set();
    let failure = null, spare = null;
    for (let round = 0; round < 6; round++) {
      try {
        const got = await source(t);
        if (mine !== ticket || closed) { if (got.own) URL.revokeObjectURL(got.src); return; }
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
        url = got.src; el.src = url; level();
        await el.play();
        if (!lyrics.length && t.source && t.songId) backend.musicLyric(t.source, t.songId, {title: t.title, artist: t.artist}).then(text => { if (mine === ticket && text) { lyrics = parseLyrics(text); emit(); } }).catch(error => backend.reportDiagnostic?.('音乐歌词', error, 'warn'));
        return;
      } catch (error) {
        if (mine !== ticket) return;
        if (error?.name === 'NotAllowedError') { set('paused', '浏览器要先点一下页面才能放声音，点播放就好'); return; }
        backend.reportDiagnostic?.('音乐播放尝试', {message: error.message, stack: error.stack, title: t.title, source: t.source}, 'warn');
        failure ||= error;
        if (t.origin === 'file' || !t.source) break;
        if (t.source) tried.add(t.source + '|' + t.songId);
        spare ??= await others(t, tried);
        if (mine !== ticket) return;
        const alt = spare.find(s => !tried.has(s.source + '|' + s.id));
        if (!alt) break;
        Object.assign(t, {origin: 'source', source: alt.source, songId: alt.id});
        set('loading', `换个音源再找（${alt.sourceName || '音源'}）……`);
      }
    }
    const said = failure?.name === 'NotSupportedError' ? '这首歌放不出来（链接失效，或者是试听版）' : failure?.message || '这首歌放不出来';
    const error = Error(tried.size > 1 ? `${said}；别的音源也试过了` : said);
    set('error', error.message);
    throw error;
  }
  /** Plays a list from one of its songs (the 歌单, search results); a single song is a list of one. which: the kind of
   *  list ('library', 'heard', 'mixed'), for the music to go on with after a song the story picks. */
  function playList(list, at = 0, which = '') {
    queue = (Array.isArray(list) ? list : [list]).slice(0, MUSIC_LIMITS.songs).map(t => ({...t}));
    index = Math.min(Math.max(0, at), queue.length - 1);
    shuffled = [index];
    if (which) from = which;
    return start(queue[index]);
  }
  /** The songs of a kind of list as tracks: the 歌单 (all of it, or one the user made: 'playlist:…'), 正文点的歌, or
   *  both ('mixed', or 'playlist:…+heard'); each song once. */
  async function listOf(which) {
    const [base, plus] = String(which || '').split('+');
    let mine = base === 'heard' ? [] : await backend.listSongs?.().catch(() => []) || [];
    if (base.startsWith('playlist:')) {
      const list = (await backend.listPlaylists?.().catch(() => []) || []).find(p => p.id === base), byId = new Map(mine.map(s => [s.id, s]));
      mine = list ? list.songs.map(id => byId.get(id)).filter(Boolean) : [];
    }
    const heard = base === 'heard' || base === 'mixed' || plus === 'heard' ? await backend.listHeard?.().catch(() => []) || [] : [];
    const seen = new Set(), out = [];
    for (const s of [...mine, ...heard]) {
      const k = songKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s.kind === 'heard' ? {title: s.title, artist: s.artist, ...(s.source && s.songId ? {origin: 'source', source: s.source, songId: s.songId} : {})} : s);
    }
    return out;
  }
  /** Plays a whole list (at random from anywhere in it when 随机播放 is on). */
  async function playFrom(which) {
    const list = await listOf(which);
    if (!list.length) throw Error(which === 'heard' ? '正文还没有点过歌' : String(which).startsWith('playlist:') ? '这个歌单还是空的' : '歌单还是空的');
    return playList(list, opts().mode === 'shuffle' ? Math.floor(Math.random() * list.length) : 0, which);
  }
  /** After a song the story picked: the list last played goes on (正文点的歌 when none was), from a song not just played. */
  async function goOn() {
    const done = track, others = async which => (await listOf(which)).filter(s => songKey(s) !== songKey(done));
    let list = await others(from || 'heard');
    // nothing else there (or that 歌单 was deleted): 正文点的歌
    if (!list.length && from && from !== 'heard') list = await others('heard');
    if (!list.length) { if (audio) { audio.currentTime = 0; return audio.play().catch(error => set('error', error.message || '续播失败')); } return; }
    return playList(list, opts().mode === 'shuffle' ? Math.floor(Math.random() * list.length) : 0);
  }
  function next(step = 1, auto = false) {
    if (!queue.length) { if (track?.from === 'bgm') return goOn().catch(e => notice(e.message)); stop(); return Promise.resolve(); }
    const mode = opts().mode;
    if (auto && mode === 'one') return start(queue[index]).catch(e => notice(e.message));
    // at random: another song than this one (上一首: back through the ones played)
    if (mode === 'shuffle' && queue.length > 1) {
      if (step < 0 && shuffled.length > 1) { shuffled.pop(); index = shuffled.at(-1); }
      else { let k = index; while (k === index) k = Math.floor(Math.random() * queue.length); index = k; shuffled = [...shuffled, k].slice(-200); }
    } else index = (index + step + queue.length) % queue.length;
    return start(queue[index]).catch(e => notice(e.message));
  }
  function stop() { ticket++; audio?.pause(); if (audio) audio.removeAttribute('src'); if (url.startsWith('blob:')) URL.revokeObjectURL(url); url = ''; track = null; queue = []; index = -1; lyrics = []; set('idle'); }
  function toggle() {
    if (!track || !audio) return Promise.resolve();
    if (phase === 'playing') { audio.pause(); set('paused'); return Promise.resolve(); }
    if (phase === 'error') return start(track).catch(e => notice(e.message));
    // Paused a long time, the link may have run out: it is fetched again.
    return audio.play().catch(e => e?.name === 'NotAllowedError' ? set('paused', '浏览器还不让放声音，再点一下播放') : start(track).catch(err => notice(err.message)));
  }

  // ---------- 正文点歌 ----------
  const chatKey = () => { const ctx = context(); return ctx?.getCurrentChatId?.() || ctx?.chatId || ''; };
  function bgmOf(id) { const m = context()?.chat?.[Number(id)]; return m && !m.is_user && typeof m.mes === 'string' ? parseBgm(m.mes) : []; }
  function played(key) { const list = remember(PLAYED_KEY, []); if (list.includes(key)) return true; keep(PLAYED_KEY, [...list, key].slice(-300)); return false; }
  async function playBgm(want) {
    if (track?.from === 'bgm' && track.title === want.title && phase === 'playing') return;
    recent = [label(want), ...recent.filter(x => x !== label(want))].slice(0, MUSIC_LIMITS.recent); keep(RECENT_KEY, recent);
    queue = []; index = -1;
    // kept in 正文点的歌 (where it was found too, once it plays)
    backend.heard?.({title: want.title, artist: want.artist}).catch(() => {});
    const t = {title: want.title, artist: want.artist, from: 'bgm'};
    await start(t);
    if (t.source && t.songId && track === t) backend.heard?.(t).catch(() => {});
  }
  /** A story reply was drawn: with 自动放, its last <bgm> plays (once per version of the reply). */
  async function rendered(id) {
    if (opts().bgm !== 'auto') return;
    const tags = bgmOf(id), want = tags.at(-1);
    if (!want) return;
    const m = context()?.chat?.[Number(id)];
    if (played([chatKey(), id, hash(m?.mes || '')].join('|'))) return;
    return playBgm(want).catch(e => notice('背景音乐：' + e.message));
  }
  /** The ♪ chip in the story: plays that song (or pauses it when it is the one playing). */
  async function tap(id, at) {
    const want = bgmOf(id)[at];
    if (!want) return;
    if (track?.from === 'bgm' && track.title === want.title && ['playing', 'paused'].includes(phase)) return toggle();
    return playBgm(want);
  }
  /** 视觉小说: the story reached a <bgm>; the song already playing goes on. */
  function stage(id, at) { const want = bgmOf(id)[at]; return want ? playBgm(want).catch(e => notice('背景音乐：' + e.message)) : undefined; }
  /** The rule for the story request, and 一起听 when the user plays a song themselves. */
  function promptPlan() {
    const user = context()?.name1 || '我', rule = bgmRule(opts(), {prompts: settings()?.promptRules, recent, library, user});
    const listening = backend.listening ? listeningNote(backend.listening, user, settings()?.promptRules) : '';
    return [...musicPromptPlan(rule), ...(listening ? [{key: 'sttts.entry.listening', text: listening, position: 1, depth: 2, role: 0}] : [])];
  }

  function status() {
    const position = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0, duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0, at = lyricAt(lyrics, position);
    return {phase, message, track: track ? {title: track.title, artist: track.artist, from: track.from || '', origin: track.origin || '', id: track.id || '', source: track.source || '', songId: track.songId || ''} : null,
      position, duration, volume: opts().volume ?? 0.6, queue: queue.length, index, mode: opts().mode || 'order', from,
      lyric: at >= 0 ? lyrics[at].text : '', lyricIndex: at, lyrics: lyrics.map(l => ({at: l.at, text: l.text}))};
  }
  return {
    playList, playFrom, next: () => next(1), prev: () => next(-1), toggle, stop, status, rendered, tap, stage, promptPlan,
    /** 顺序播放, 随机播放 or 单曲循环 (kept in the settings). */
    setMode(mode) { backend.saveMusic?.({mode}); emit(); },
    play: t => playList([t], 0),
    seek(seconds) { if (audio && Number.isFinite(seconds)) { audio.currentTime = Math.max(0, seconds); emit(); } },
    /** The voice player's phase: music is turned down while a line is voiced. */
    voice(voicePhase) { const on = ['playing', 'generating'].includes(voicePhase); if (on !== voiced) { voiced = on; level(); } },
    close() { closed = true; unsubscribe?.(); doc?.removeEventListener?.('sttts-sound', onSound); stop(); audio = null; },
  };
}
