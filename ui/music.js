// 音乐: the phone's music player. 正在播放 at the top (progress, lyrics, 顺序 / 随机 / 单曲循环), the 歌单 (全部: files
// the user added — many at a time, zips too — and songs saved from a search; and 歌单 the user makes of them),
// 正文点的歌 (the songs the story
// picked, to play again or keep), 搜索 over
// the user's own music sources (songs, albums, artists; more pages), and 设置: 背景音乐 (off / tap / auto), its rule,
// the volume and the sources. Playing happens in the tavern page (host-music.js), so it goes on while the phone is put
// away.
import {createView, esc, btn, field, input, textArea, toggle, heading, groupTitle, empty, help} from './common.js';
import {icon} from './icons.js';
import {writePanel} from './music-write.js';
import {BGM_MODES, BGM_MODE_NAMES, DEFAULT_BGM_RULE, SELF_HOSTED, PLAY_MODES, PLAY_MODE_NAMES, GROUP_KINDS, MUSIC_LIMITS, normalizeSource, bestMatch} from '../core/music.js';
import {sortPicked, lots, readPicked, lrcText} from '../core/music-files.js';
import {isGoMusic, GO_PLATFORMS, GO_LOGINS, GO_QR_NAMES, GO_ACCOUNT_LISTS} from '../core/go-music.js';
import {qrMatrix, qrSvg} from '../core/qr.js';
import {saveFile} from '../download.js';

const clock = s => !Number.isFinite(s) || s <= 0 ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const label = t => t ? (t.artist ? `${t.title} - ${t.artist}` : t.title) : '';
const SOURCE_FIELDS = [
  ['name', '名字', '比如：我的音源'],
  ['search', '搜索地址', 'https://…?keyword={{query}}'],
  ['url', '取歌地址', 'https://…?id={{id}}'],
  ['lyric', '歌词地址（可不填）', 'https://…?id={{id}}'],
  ['listPath', '搜索结果列表在哪', '比如 data 或 result.songs，空着自动找'],
  ['idPath', '歌曲 ID 在哪', 'id'],
  ['titlePath', '歌名在哪', 'name'],
  ['artistPath', '歌手在哪', 'artist'],
  ['urlPath', '播放链接在哪', 'url 或 data.url'],
  ['lyricPath', '歌词在哪', 'lyric']
];
// searching albums, artists and playlists (optional): where to search, where the list is, where one's songs are
const GROUP_FIELDS = [
  ['albumSearch', '搜专辑的地址', 'https://…?keywords={{query}}&offset={{offset}}'], ['albumListPath', '专辑列表在哪', 'result.albums'],
  ['albumSongs', '专辑里的歌的地址', 'https://…/album?id={{id}}'], ['albumSongsPath', '专辑的歌在哪', 'songs'],
  ['artistSearch', '搜歌手的地址', 'https://…?keywords={{query}}&offset={{offset}}'], ['artistListPath', '歌手列表在哪', 'result.artists'],
  ['artistSongs', '歌手的歌的地址', 'https://…/artist/songs?id={{id}}&offset={{offset}}'], ['artistSongsPath', '歌手的歌在哪', 'songs'],
  ['playlistSearch', '搜歌单的地址', 'https://…?keywords={{query}}&offset={{offset}}'], ['playlistListPath', '歌单列表在哪', 'result.playlists'],
  ['playlistSongs', '歌单里的歌的地址', 'https://…/playlist/track/all?id={{id}}&limit={{limit}}&offset={{offset}}'], ['playlistSongsPath', '歌单的歌在哪', 'songs']
];
// the songs of a 歌单 shown at a time (more on asking), and of an album, artist or playlist opened from the search
const STEP = 100, GROUP_SHOWN = 200;
const MODE_ICON = {order: 'repeat', shuffle: 'shuffle', one: 'repeat1'};
// 添加本机的歌 takes songs, their .lrc lyrics and zip packs (core/music-files.js)
const ACCEPT = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aac,.lrc,.zip,application/zip';
/** What one 添加本机的歌 did, in a line. */
const NO_SONG = '歌单里没有同名的歌';
function addedText(r) {
  if (!r.added && !r.lyrics && !r.same && !r.skipped.length) return '没有找到能加的歌';
  // .lrc picked alone that found no song of its name: said as lyrics not given, not as 「加了 0 首」
  const unmatched = r.skipped.filter(s => s.why === NO_SONG).length, other = r.skipped.length - unmatched;
  return [r.added ? `加了 ${r.added} 首` : '', r.lyrics ? `配上 ${r.lyrics} 首歌词` : '', r.same ? `${r.same} 首已经有了` : '',
    unmatched ? `${unmatched} 个歌词没配上（${NO_SONG}，和歌一起选就能配上）` : '', other ? `${other} 个没加` : ''].filter(Boolean).join('，');
}
/** Which files were not added, and why (under the line's 小 i). */
const skippedText = r => r.skipped.slice(0, 40).map(s => `「${s.name}」${s.why}`).join('\n') + (r.skipped.length > 40 ? `\n……还有 ${r.skipped.length - 40} 个` : '')
  + (r.others ? `\n\n另外 ${r.others} 个不是歌的文件（图片、文本这些）没管。` : '');

export function musicApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'music');
  let mode = 'main', tab = 'library', songs = [], results = [], searchErrors = [], searchNote = '', query = '', searching = false, epoch = 0, editing = null, showLyrics = false, test = null, sourceTest = 0;
  // 正文点的歌; what the search looks for (单曲 / 专辑 / 歌手), the albums or artists found, the page, whether there is
  // more; an album or artist opened: {g, songs, page, more, loading, error}
  let heard = [], kind = 'song', groups = [], page = 0, more = false, group = null;
  // the 歌单 the user made; the one shown ('' for 全部) and its songs; what the filter looks for in them, how many show;
  // 多选: the songs picked (null when not picking)
  let lists = [], shelf = '', shown = [], filter = '', limit = STEP, picked = null;
  // 添加本机的歌: how far it got ({done, total}) while songs go in; what it did, when not all went in
  let adding = null, addedNote = null;
  const addingText = () => adding.total ? `正在添加 ${adding.done} / ${adding.total} 首…` : '正在看选了哪些歌…';
  /** The line under 添加本机的歌: how far it got, or (when not all went in) what it did, with which and why under 小 i. */
  const addingLine = () => adding ? `<p class="hint music-adding" role="status" data-music-adding>${esc(addingText())}</p>`
    : addedNote && (addedNote.skipped.length || addedNote.error) ? `<p class="hint music-adding" role="status">${esc(addedText(addedNote) + (addedNote.error ? '：' + addedNote.error : ''))}${addedNote.skipped.length || addedNote.others ? help(skippedText(addedNote)) : ''}</p>` : '';
  const state = () => api.getState().music;
  /** 写歌's pages come and go through this: where to be (top: from the start of the page). */
  const go = (where, top = false) => { mode = where; if (where === 'main') tab = 'write'; render(); if (top) v.root.scrollTop = 0; };
  go.mode = () => mode;
  const writer = writePanel(ctx, {v, go});
  const now = () => { try { return api.musicStatus?.() || null; } catch { return null; } };

  // 正在播放: built once per song (and when the lyrics view opens or closes), then only patched — redrawn every second,
  // the turning disc would start over each time.
  const keyOf = s => s?.track ? JSON.stringify([s.track.title, s.track.artist, s.track.from, showLyrics, (s.lyrics || []).length]) : '';
  function nowPlaying() {
    const s = now(), t = s?.track;
    if (!t) return `<div class="music-now idle" data-now-key=""><span class="music-cover" aria-hidden="true">${icon('music')}</span><div class="music-now-text"><strong>没有在放歌</strong><small>点歌单或搜索结果里的歌开始放</small></div></div>`;
    const lines = s.lyrics || [];
    const lyricView = `<div class="music-lyrics" data-music-lyrics>${lines.length ? lines.map((l, i) => `<button type="button" class="music-lyric" data-action="lyric-seek" data-i="${i}" data-at="${l.at}">${esc(l.text || '♪')}</button>`).join('') : `<p class="music-no-lyric">这首歌没有歌词${t.origin === 'file' ? '<br><small>在歌单里点这首歌的「⋯」可以贴 LRC 歌词</small>' : ''}</p>`}</div>`;
    return `<div class="music-now${showLyrics ? ' lyric-view' : ''}" data-now-key="${esc(keyOf(s))}"><div class="music-now-top"><button type="button" class="music-cover" data-action="lyrics" aria-label="${showLyrics ? '收起歌词' : '看歌词'}" title="${showLyrics ? '收起歌词' : '点一下看歌词'}">${icon('music')}</button>
        <div class="music-now-text"><strong>${esc(t.title)}</strong><small>${esc(t.artist || (t.from === 'bgm' ? '背景音乐' : ''))}${t.from === 'bgm' ? ' · 正文点的歌' : ''}</small></div></div>
      ${showLyrics ? lyricView : `<button type="button" class="music-lyric-line" data-action="lyrics" data-music-line aria-label="看歌词"></button>`}
      <div class="music-progress"><span data-music-pos>0:00</span><input type="range" class="slider" min="0" max="1" value="0" data-music-seek aria-label="播放进度"><span data-music-dur>0:00</span></div>
      <div class="music-controls">${btn('music-mode', icon(MODE_ICON[state().mode] || 'repeat'), 'round-button music-mode', `aria-label="${PLAY_MODE_NAMES[state().mode] || '顺序播放'}（点一下换）" title="${PLAY_MODE_NAMES[state().mode] || '顺序播放'}"`)}${btn('music-prev', icon('prev', true), 'round-button', 'aria-label="上一首"')}${btn('music-toggle', '', 'music-main', 'aria-label="播放"')}${btn('music-next', icon('skip', true), 'round-button', 'aria-label="下一首"')}${btn('music-stop', icon('stop', true), 'round-button', 'aria-label="停止"')}</div>
      <p class="hint music-message" role="status" data-music-message hidden></p></div>`;
  }
  /** The parts that change while a song plays: time, progress, play/pause, the lyric line, the message. */
  function paintNow() {
    const card = v.root.querySelector('.music-now'), s = now();
    if (!card || card.dataset.nowKey === undefined) return;
    const playing = s?.phase === 'playing';
    card.dataset.playing = playing ? '1' : '';
    if (!s?.track) return;
    const set = (sel, text) => { const el = card.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    set('[data-music-pos]', clock(s.position)); set('[data-music-dur]', clock(s.duration));
    const seek = card.querySelector('[data-music-seek]');
    if (seek && ctx.doc.activeElement !== seek) { const max = String(Math.max(1, Math.round(s.duration))); if (seek.max !== max) seek.max = max; seek.value = String(Math.round(s.position)); }
    const toggle = card.querySelector('[data-action=music-toggle]');
    if (toggle && toggle.dataset.on !== String(playing)) { toggle.dataset.on = String(playing); toggle.innerHTML = icon(playing ? 'pause' : 'play', true); toggle.setAttribute('aria-label', playing ? '暂停' : '播放'); }
    set('[data-music-line]', s.lyric || ((s.lyrics || []).length ? '♪' : '点这里看歌词'));
    const modeBtn = card.querySelector('[data-action=music-mode]'), m = state().mode || 'order';
    if (modeBtn && modeBtn.dataset.mode !== m) { modeBtn.dataset.mode = m; modeBtn.innerHTML = icon(MODE_ICON[m]); modeBtn.title = PLAY_MODE_NAMES[m]; modeBtn.setAttribute('aria-label', `${PLAY_MODE_NAMES[m]}（点一下换）`); }
    const message = card.querySelector('[data-music-message]');
    if (message) { message.hidden = !s.message; set('[data-music-message]', s.message || ''); }
    const box = card.querySelector('[data-music-lyrics]');
    if (box) {
      const old = box.querySelector('.now'), cur = box.querySelector(`[data-i="${s.lyricIndex}"]`);
      if (old !== cur) { old?.classList.remove('now'); cur?.classList.add('now'); }
      // The line being sung in the middle of the box (measured against the box itself: offsetTop counts from the card).
      // Also right after the lyrics open, when it is already marked.
      if (cur && box.dataset.centered !== String(s.lyricIndex) && box.clientHeight) {
        box.dataset.centered = String(s.lyricIndex);
        const top = box.scrollTop + cur.getBoundingClientRect().top - box.getBoundingClientRect().top - (box.clientHeight - cur.offsetHeight) / 2;
        box.scrollTo({top: Math.max(0, top), behavior: old && old !== cur && !ctx.win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto'});
      }
    }
  }
  const where = (s, list) => list === 'results' || list === 'group' ? ' · ' + esc(s.sourceName || '') : list === 'heard' ? '' : s.origin === 'source' ? ' · ' + esc(state().sources.find(x => x.id === s.source)?.name || '音源') : ' · 本机';
  // (in 多选 a song of the 歌单 is ticked on and off instead of played)
  const songRow = (s, i, list) => `<div class="list-row music-row${list === 'library' && picked?.has(s.id) ? ' picked' : ''}" data-list="${list}" data-i="${i}"><button type="button" class="music-row-main" data-action="play" data-list="${list}" data-i="${i}"${list === 'library' && picked ? ` aria-pressed="${picked.has(s.id)}"` : ''}><span><strong>${esc(s.title)}</strong><small>${esc(s.artist || '未知歌手')}${where(s, list)}</small></span></button>${
    list === 'library' && picked ? `<span class="music-check" aria-hidden="true">${picked.has(s.id) ? icon('check') : ''}</span>`
    : list === 'results' || list === 'group' ? btn('save-song', icon('add'), 'icon-button', `data-list="${list}" data-i="${i}" aria-label="加进歌单"`)
    : list === 'heard' ? btn('heard-save', icon('add'), 'icon-button', `data-i="${i}" aria-label="加进歌单"`) + btn('heard-forget', icon('trash'), 'icon-button', `data-i="${i}" aria-label="从正文点的歌里拿掉"`)
    : btn('song-menu', icon('more'), 'icon-button', `data-i="${i}" aria-label="这首歌的选项"`)}</div>`;
  /** What an album, an artist or a playlist found is: an album's artist, who made a playlist; how many songs. */
  const groupNote = g => [g.kind === 'album' ? g.artist || '专辑' : g.kind === 'playlist' ? (g.artist ? `${g.artist} 的歌单` : '歌单') : '歌手', g.count ? `${g.count} 首` : '', g.sourceName !== g.artist ? g.sourceName : ''].filter(Boolean).join(' · ');
  /** An album, an artist or a playlist found: opens its songs. */
  const groupRow = (g, i) => `<div class="list-row music-row"><button type="button" class="music-row-main" data-action="open-group" data-i="${i}"><span><strong>${esc(g.name)}</strong><small>${esc(groupNote(g))}</small></span></button>${icon('next')}</div>`;
  /** The songs of the 歌单 shown that the filter finds: [[song, its place in the 歌单], …]. */
  const foundRows = () => { const q = filter.trim().toLowerCase(); return shown.map((x, i) => [x, i]).filter(([x]) => !q || `${x.title} ${x.artist}`.toLowerCase().includes(q)); };
  /** The rows of the 歌单 shown (those found, `limit` of them), more on asking; in 多选 the bar of what to do with them. */
  function libraryRows() {
    const found = foundRows(), here = lists.find(p => p.id === shelf), none = picked && !picked.size ? 'disabled' : '';
    return (found.length ? `<div class="group">${found.slice(0, limit).map(([x, i]) => songRow(x, i, 'library')).join('')}</div>` : `<p class="hint">没有找到「${esc(filter.trim())}」</p>`)
      + (found.length > limit ? `<div class="actions">${btn('show-more', `再显示 ${Math.min(STEP, found.length - limit)} 首（还有 ${found.length - limit} 首）`, 'secondary')}</div>` : '')
      + (picked ? `<div class="savebar music-pickbar"><span class="music-picked">已选 ${picked.size} 首</span>${btn('pick-all', found.length && found.every(([x]) => picked.has(x.id)) ? '全不选' : '全选', 'secondary small')}`
        + `${btn('pick-add', '加到歌单', 'secondary small', none)}${here ? btn('pick-out', '拿掉', 'secondary small', none) : ''}${btn('pick-delete', '删除', 'danger small', none)}</div>` : '');
  }
  /** Draws the rows of the 歌单 again (the filter, more of them, ticks), keeping the rest of the page as it is. */
  const redrawRows = () => { const box = v.root.querySelector('[data-music-list]'); if (box) box.innerHTML = libraryRows(); };
  /** The songs of the 正文点的歌 list as the player takes them (found on a source already, or to be looked up by name). */
  const heardTracks = () => heard.map(s => ({title: s.title, artist: s.artist, ...(s.source && s.songId ? {origin: 'source', source: s.source, songId: s.songId} : {})}));

  async function render() {
    const ticket = ++epoch;
    if (mode === 'settings') return renderSettings();
    if (mode === 'source') return renderSource();
    if (mode === 'group') return renderGroup();
    if (mode === 'write-form') return writer.renderForm();
    if (mode === 'draft') return writer.renderDraft();
    songs = await api.listSongs().catch(() => []);
    if (tab === 'write') await writer.load();
    lists = await api.listPlaylists?.().catch(() => []) || [];
    if (tab === 'heard') heard = await api.listHeard?.().catch(() => []) || [];
    if (v.disposed || ticket !== epoch) return;
    const s = state(), sources = s.sources.filter(x => x.enabled), byId = new Map(songs.map(x => [x.id, x]));
    const mine = lists.find(p => p.id === shelf) || null;
    if (!mine) shelf = '';
    shown = mine ? mine.songs.map(id => byId.get(id)).filter(Boolean) : songs;
    const kinds = [['song', '单曲'], ...Object.entries(GROUP_KINDS).filter(([k]) => sources.some(x => x[k + 'Search']))];
    if (!kinds.some(([k]) => k === kind)) kind = 'song';
    const found = kind === 'song' ? results : groups;
    const list = tab === 'write' ? writer.listHTML() : tab === 'heard'
      ? (heard.length ? `<div class="actions music-tools heard-tools" style="margin-top:0">${btn('play-heard', icon('play', true) + '全部播放', 'primary')}${btn('play-mixed', icon('shuffle') + '和歌单一起放', 'secondary')}${btn('heard-clear', icon('trash'), 'icon-button', 'aria-label="清空正文点的歌"')}</div>`
        + `<p class="music-caption">最新的在上面 · 同一首只记一次 · 最多 200 首 · 点 ＋ 加进歌单</p><div class="group">${heard.map((x, i) => songRow(x, i, 'heard')).join('')}</div>`
        : empty('正文还没有点过歌', '在「设置 → 背景音乐」打开点歌后，剧情每次挑的歌都会记在这里，可以再放、加进歌单。', 'music'))
      : tab === 'library'
      ? `<div class="filter-row music-shelves" role="group" aria-label="歌单">${btn('shelf', `全部 <small>${songs.length}</small>`, '', `data-shelf="" aria-pressed="${!mine}"`)}${lists.map(p => p === mine ? btn('list-menu', `${esc(p.name)} <small>${p.songs.filter(id => byId.has(id)).length}</small>${icon('more')}`, '', `data-shelf="${esc(p.id)}" aria-pressed="true" title="再点一下改名字或删掉"`) : btn('shelf', `${esc(p.name)} <small>${p.songs.filter(id => byId.has(id)).length}</small>`, '', `data-shelf="${esc(p.id)}" aria-pressed="false"`)).join('')}${btn('new-list', icon('add') + (lists.length ? '' : '新建歌单'), '', 'aria-label="新建歌单"')}</div>`
        + `<div class="actions music-tools" style="margin-top:0"><label class="primary file-button">${icon('add')}添加本机的歌<input type="file" data-music-file multiple accept="${ACCEPT}" aria-label="选择音乐文件"${adding ? ' disabled' : ''}></label>${shown.length ? btn('play-all', icon('play', true) + '全部播放', 'secondary') + btn('play-mixed', icon('shuffle'), 'icon-button', 'aria-label="和正文点的歌一起放" title="和正文点的歌一起放"') : ''}</div>`
        + addingLine()
        + (shown.length ? `${shown.length > 1 ? `<div class="music-filter"><input type="search" data-music-filter value="${esc(filter)}" placeholder="在这 ${shown.length} 首里找" aria-label="在歌单里找歌">${btn(picked ? 'pick-done' : 'pick-start', picked ? '完成' : icon('check') + '多选', 'secondary small')}</div>` : ''}<div data-music-list>${libraryRows()}</div>`
          : mine ? empty('这个歌单还是空的', '在「搜索」「正文点的歌」里点 ＋ 放进来，或者在「全部」里点歌右边的「⋯」选它；也可以直接添加本机的歌。', 'music')
          : empty('歌单还是空的', '添加手机或电脑里的歌（一次可以选很多首，也可以选 zip 压缩包），或者在「搜索」里找歌加进来。', 'music'))
      : (kinds.length > 1 ? `<div class="segmented music-kinds" role="group" aria-label="搜什么">${kinds.map(([k, l]) => `<button data-action="kind" data-kind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>` : '')
        + `<form class="music-search" data-music-search><input type="search" data-music-query value="${esc(query)}" placeholder="${!sources.length ? '先在设置里添加音源' : GROUP_KINDS[kind] ? GROUP_KINDS[kind] + '名' : '歌名、歌手'}" aria-label="搜歌" ${sources.length ? '' : 'disabled'}>${btn('search', icon('search'), 'round-button', `aria-label="搜索" ${sources.length && !searching ? '' : 'disabled'}`)}</form>`
        + searchErrors.map(e => `<p class="hint">「${esc(e.source)}」：${esc(e.message)}</p>`).join('')
        + (found.length ? `<div class="group">${kind === 'song' ? results.map((x, i) => songRow(x, i, 'results')).join('') : groups.map(groupRow).join('')}</div>`
          : !sources.length ? empty('还没有音源', '插件不自带音源。在右上角「设置 → 音源」里添加你自己的音源地址，就能在这里搜歌。', 'search') : '')
        + (searching ? '<p class="hint" role="status">正在搜……</p>' : more && found.length ? `<div class="actions">${btn('more-results', '加载更多', 'secondary')}</div>` : '')
        + (searchNote && !searching ? `<p class="hint">${esc(searchNote)}</p>` : '')
        + discoverHTML();
    v.draw(heading('音乐', btn('settings', icon('sliders'), 'round-button', 'aria-label="音乐设置"'), `Music · ${songs.length} 首`)
      + nowPlaying()
      + `<div class="segmented" role="group" aria-label="歌单、正文点的歌、搜索或写歌">${[['library', '歌单'], ['heard', '正文点的歌'], ['search', '搜索'], ['write', '写歌']].map(([k, l]) => `<button data-action="tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`
      + list);
    if (tab === 'write') writer.mountList(); else writer.dropList();
    paintNow();
  }
  /** Only the now-playing card changes while a song plays (the lists keep their scroll and taps); a new song or the
   *  lyrics view opening builds it again, anything else is patched. */
  function refreshNow() {
    const card = v.root.querySelector('.music-now');
    if (!card || mode !== 'main') return;
    if (card.dataset.nowKey !== keyOf(now())) { const tpl = ctx.doc.createElement('template'); tpl.innerHTML = nowPlaying(); card.replaceWith(tpl.content.firstElementChild); }
    paintNow();
  }

  /** An album, an artist or a playlist opened from the search: its songs (more pages for sources that give them so;
   *  the first GROUP_SHOWN listed, all of them taken in by 全部加进歌单). */
  function renderGroup() {
    const g = group.g, n = group.songs.length;
    v.draw(heading(g.name, '', {album: 'Album', artist: 'Artist', playlist: 'Playlist'}[g.kind] || 'Album')
      + `<p class="hint" style="margin-top:0">${esc(groupNote(g))}</p>`
      + (n ? `<div class="actions" style="margin-top:0">${btn('group-play', icon('play', true) + '全部播放', 'primary')}${btn('group-save', icon('add') + '全部加进歌单', 'secondary', group.taking ? 'disabled' : '')}</div><div class="group">${group.songs.slice(0, GROUP_SHOWN).map((x, i) => songRow(x, i, 'group')).join('')}</div>`
        + (n > GROUP_SHOWN ? `<p class="hint">这里列出前 ${GROUP_SHOWN} 首（已取到 ${n} 首），「全部加进歌单」会加全部。</p>` : '') : '')
      + (group.note ? `<p class="hint">${esc(group.note)}</p>` : '')
      + (group.loading ? `<p class="hint" role="status">${group.taking ? `正在取歌：${n}${g.count ? ' / ' + g.count : ''} 首……` : '正在取歌……'}</p>` : '')
      + (group.error ? `<p class="hint">${esc(group.error)}</p>` : !group.loading && !group.songs.length ? '<p class="hint">里面没有歌</p>' : '')
      + (group.more && !group.loading ? `<div class="actions">${btn('group-more', '加载更多', 'secondary')}</div>` : ''));
  }
  /**
   * 全部加进歌单: the pages not loaded yet are fetched first (as many at a time as the source's address lets ask for;
   * a source counting in pages keeps its own page size), then all go in at once.
   */
  async function keepGroup() {
    const g = group;
    if (g.more) {
      const tpl = state().sources.find(x => x.id === g.g.source)?.[g.g.kind + 'Songs'] || '', size = /\{\{offset\}\}/.test(tpl) ? MUSIC_LIMITS.bulk : 50;
      g.loading = g.taking = true; renderGroup();
      try {
        while (g.more && group === g && g.songs.length < MUSIC_LIMITS.songs) {
          const got = await api.groupSongs(g.g.source, g.g.kind, g.g.id, ++g.page, {limit: size, offset: g.songs.length, seen: g.songs.map(s => s.id)});
          takeIn(g, got);
          if (group === g && !v.disposed && mode === 'group') renderGroup();
        }
      } catch (error) { g.error = error.message; }
      g.loading = g.taking = false;
      if (group !== g || v.disposed) return;
      renderGroup();
    }
    if (g.songs.length) await keep(g.songs.map(s => ({title: s.title, artist: s.artist, source: s.source, songId: s.id})), `「${g.g.name}」的 ${g.songs.length} 首歌`);
  }
  /** A page of songs taken in, each once: no more after it when the source says so, when as many as it said it holds
   *  are here, or when its address gives no other page (said under the list). */
  function takeIn(g, got) {
    const had = new Set(g.songs.map(s => s.id)), fresh = got.songs.filter(s => !had.has(s.id) && had.add(s.id));
    g.songs = [...g.songs, ...fresh];
    g.more = !!got.more && fresh.length > 0 && !(g.g.count && g.songs.length >= g.g.count);
    if (got.unpaged) g.note = `这个音源只给了这 ${g.songs.length} 首：它的地址没写怎么翻页，插件试了几种常见的翻页写法也没取到更多。在音源设置里给「${GROUP_KINDS[g.g.kind] || '专辑'}里的歌的地址」写上 {{offset}} 或 {{page}}，就能取全部。`;
  }
  async function loadGroup() {
    const g = group, mine = group;
    g.loading = true; renderGroup();
    try { const got = await api.groupSongs(g.g.source, g.g.kind, g.g.id, g.page, {offset: g.songs.length, seen: g.songs.map(s => s.id)}); if (group !== mine) return; takeIn(g, got); g.error = ''; }
    catch (error) { if (group !== mine) return; g.error = error.message; g.more = false; }
    g.loading = false;
    if (!v.disposed && mode === 'group') renderGroup();
  }
  function renderSettings() {
    const s = state();
    v.draw(heading('音乐设置', '', 'Music')
      + groupTitle('背景音乐', help('打开后，剧情模型每次写正文时会按场景和情绪挑一首歌，写在正文开头（正文里显示成一个 ♪ 小标签）。\n\n点一下才放：点 ♪ 才开始放，再点暂停。\n自动放：新回复写完就自动换成它挑的歌。\n\n一首放完，按播放卡片左边的播放方式接着放：单曲循环就一直放这首，顺序或随机就接着放「正文点的歌」（或者你最后放的那个列表）。\n\n插件会先在你的歌单里找这首歌，找不到再用你添加的音源搜。'))
      + `<div class="group pad"><div class="segmented" style="margin:0" role="group" aria-label="背景音乐">${BGM_MODES.map(k => `<button data-action="bgm" data-mode="${k}" aria-pressed="${s.bgm === k}">${BGM_MODE_NAMES[k]}</button>`).join('')}</div>
</div>${s.bgm !== 'off' ? `<details data-group="music-rule"><summary>点歌规则 ${help('发给剧情模型的话。{{最近}} 会换成最近放过的歌（让它别重复），{{用户}} 换成你的名字。打开「点歌时参考我的歌单」时，会随机附上歌单里的一些歌当口味参考（不会让它老从歌单里选）。改完点一下别处就保存了。')}<small class="fold-note">${s.rule === DEFAULT_BGM_RULE ? '默认' : '改过'}</small></summary><div class="fold-body">${textArea('rule', s.rule, 'rows="9" aria-label="点歌规则"')}<div class="actions" style="margin:6px 0 0">${btn('reset-rule', icon('refresh') + '恢复默认', 'text-button')}</div></div></details>` : ''}`
      + groupTitle('播放')
      + `<div class="group pad"><div class="field"><div class="meter-label"><span>音量</span><output>${Math.round(s.volume * 100)}%</output></div><input class="slider" type="range" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}" data-music-volume aria-label="音量"></div>
        ${toggle('duck', '说台词时调小', s.duck, '朗读台词时音乐自动变小，念完恢复。')}
        ${s.bgm !== 'off' ? toggle('taste', '点歌时参考我的歌单', s.taste, '每次随机挑歌单里的一些歌给剧情模型当口味参考，让它选风格相近的别的歌，每次都换不一样的；关掉就完全不带歌单。') : ''}
        ${toggle('share', '角色会给你分享歌', s.share, '手机聊天里，角色偶尔会分享一首歌给你（一张歌曲卡片，点一下就放）；你自己放歌时，手机聊天里的角色也知道你在听什么（一起听；背景音乐不算，正文也不会知道，免得写进剧情）。')}</div>`
      + groupTitle('音源', help('插件不自带任何音源。音源是两个网址：一个用来搜歌（在放搜索词的地方写 {{query}}），一个用来取歌的播放链接（在放歌曲 ID 的地方写 {{id}}）；再告诉插件结果里列表、歌名、歌手、链接分别在哪（用点隔开的路径，比如 data.url）。\n\n音源不让网页直接读取时，会改用酒馆自带的代理（要在酒馆的 config.yaml 里把 enableCorsProxy 改成 true）。'))
      + `<div class="group">${s.sources.map((x, i) => `<div class="list-row music-source"><span><strong>${esc(x.name)}</strong><small>${esc((isGoMusic(x) ? 'Go Music · ' + x.base : x.search).replace(/^(Go Music · )?https?:\/\//, '$1').split('/')[0])}</small></span><input class="switch" type="checkbox" data-source-on="${i}" aria-label="启用 ${esc(x.name)}" ${x.enabled ? 'checked' : ''}>${btn('edit-source', icon('edit'), 'icon-button', `data-i="${i}" aria-label="编辑 ${esc(x.name)}"`)}</div>`).join('') || '<p class="hint" style="padding:12px 16px">还没有音源。</p>'}</div>
        <div class="actions">${btn('add-source', icon('add') + '添加音源', 'secondary')}</div>`);
  }
  function renderSource() {
    if (isGoMusic(editing.draft)) return renderGoSource();
    const d = editing.draft;
    const sourceField = ([k, l, ph]) => field(l, input('src-' + k, d[k] || '', k.endsWith('Path') || k === 'name' ? 'text' : 'url', `placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"`));
    v.draw(heading(editing.index < 0 ? '添加音源' : '编辑音源', '', 'Source')
      + (editing.index < 0 ? groupTitle('自己搭的后端', help('在自己电脑上、或者手机的 Termux 里跑音乐接口程序（比如网易云音乐 API 这一类）的话，填上它的地址，下面的格式会自动填好。酒馆里装了提供音乐接口的服务端插件的话，地址写成酒馆自己的地址（以 / 开头，比如 /api/plugins/插件名/search?…），会带着酒馆的登录去问。插件不带任何别人的服务器地址。\n\n电脑上跑的后端，手机要用电脑的局域网地址（比如 http://192.168.1.5:3000）。会员歌要看你的后端有没有登录。')) + `<div class="group pad">${SELF_HOSTED.map(t => `<div class="field"><span>${esc(t.name)}</span><div class="music-selfhost">${t.local ? '<small class="hint" style="flex:1;margin:0">装在你酒馆里，不用填地址</small>' : input('base-' + t.id, '', 'url', `placeholder="${esc(t.example)}" autocomplete="off" spellcheck="false"`)}${btn('fill-template', t.local ? '填好' : '按这个格式填', 'secondary small', `data-template="${esc(t.id)}"`)}</div></div>`).join('')}</div>` : '')
      + `<div class="group pad">${SOURCE_FIELDS.slice(0, 3).map(sourceField).join('')}</div>
      <details data-group="source-groups"><summary>搜专辑、歌手和歌单（可不填） ${help('音源的接口能搜专辑、歌手、歌单的话，在这里填：搜的地址（写 {{query}}）、结果列表在哪、取专辑、歌手或歌单里的歌的地址（写 {{id}}）、歌在哪。地址里写 {{offset}}（从第几首开始）或 {{page}}（第几页）、{{limit}}（一页几首），就能「加载更多」。用上面「自己搭的后端」时会自动填好。')}</summary><div class="fold-body">${GROUP_FIELDS.map(([k, l, ph]) => field(l, input('src-' + k, d[k] || '', k.endsWith('Path') ? 'text' : 'url', `placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"`))).join('')}</div></details>
      <details data-group="source-paths"><summary>歌词和结果在哪 ${help('按接口文档填：结果里列表、歌曲 ID、歌名、歌手、播放链接、歌词分别在哪（用点隔开的路径，比如 data.url）。用上面「自己搭的后端」一键填的话，这些都填好了。')}<small class="fold-note">${d.listPath || d.urlPath ? '填好了' : '空着自动找'}</small></summary><div class="fold-body">${SOURCE_FIELDS.slice(3).map(sourceField).join('')}
        ${toggle('src-direct', '取歌地址直接就是音频', d.direct === true, '有的接口取歌时不回 JSON，而是直接给音频，或者跳转到音频文件（比如 Meting 这类、go-music-api 的 /stream）。打开后，取歌地址填好歌曲 ID 就直接拿来播放，「播放链接在哪」不用管。不打开时，接口给的是音频也会自动认出来（要能读到它）。')}</div></details>
      <div class="actions">${btn('test-source', icon('search') + '用「晴天」试一试', 'secondary')}</div>
      ${test ? `<div class="group pad music-test">${test.error ? `<p class="hint">${esc(test.error)}</p>` : `<p class="hint">搜到 ${test.songs.length} 首${test.link ? '，第一首的播放链接也拿到了' : ''}：</p>${test.songs.slice(0, 5).map(s => `<p class="music-test-row">${esc(label(s))}</p>`).join('')}${test.linkError ? `<p class="hint">取播放链接时：${esc(test.linkError)}</p>` : ''}`}</div>` : ''}
      ${editing.index >= 0 ? `<div class="actions">${btn('delete-source', icon('trash') + '删除这个音源', 'text-button danger-text')}</div>` : ''}
      <div class="savebar">${btn('cancel-source', '取消', 'secondary')}${btn('save-source', '保存', 'primary')}</div>`);
  }
  const readDraft = () => {
    if (isGoMusic(editing.draft)) {
      for (const k of ['name', 'base']) { const el = v.root.querySelector(`[data-field="src-${k}"]`); if (el) editing.draft[k] = el.value.trim(); }
      return editing.draft;
    }
    for (const [k] of [...SOURCE_FIELDS, ...GROUP_FIELDS]) { const el = v.root.querySelector(`[data-field="src-${k}"]`); if (el) editing.draft[k] = el.value.trim(); }
    const direct = v.root.querySelector('[data-field="src-direct"]'); if (direct) editing.draft.direct = direct.checked;
    return editing.draft;
  };
  function saveSources(list) { api.saveMusic({sources: list}); }

  // ---------- Go Music (core/go-music.js): the user's own go-music-api ----------
  // goLogin: which platforms the backend being edited holds a login for ({base, loading, logins, error});
  // goAccount: per platform, the account's playlists read ({loading, lists, error, done, importing});
  // discover: 发现 in the search tab ({source, view, recommend, categories, platform, category, lists, loading, error})
  let goLogin = null, goAccount = {}, discover = null;
  const goDraft = () => structuredClone(readDraft());
  /** Which platforms the backend holds a login for: asked when its editor opens, after the address changes, after a login. */
  async function loadLogins() {
    const draft = goDraft(), mine = goLogin = {base: draft.base, loading: !!draft.base, logins: {}, error: ''};
    if (!draft.base) return;
    try { mine.logins = await api.goMusicLogins(draft); } catch (error) { mine.error = error.message; }
    mine.loading = false;
    if (goLogin === mine && !v.disposed && mode === 'source') renderSource();
  }
  /** A Go Music source being added or edited: its name, its address, which platforms it searches; then 登录 and, once
   *  saved, the account's own playlists to take in. */
  function renderGoSource() {
    const d = editing.draft, saved = editing.index >= 0;
    if (d.base && goLogin?.base !== d.base) loadLogins();
    const L = goLogin?.base === d.base ? goLogin : null, logins = L?.logins || {};
    const loginRow = l => `<div class="list-row go-login"><span><strong>${esc(l.name)}</strong><small>${!d.base ? '先填地址' : L?.loading ? '正在看……' : logins[l.id] ? '已登录' : '没登录'}</small></span>`
      + (d.base ? `<span class="go-tools">${l.qr.length ? btn('go-qr', '扫码', 'secondary small', `data-login="${l.id}"`) : ''}${btn('go-cookie', '贴 Cookie', 'secondary small', `data-login="${l.id}"`)}${logins[l.id] ? btn('go-logout', '退出', 'text-button small', `data-login="${l.id}"`) : ''}</span>` : '') + '</div>';
    const accountRows = GO_ACCOUNT_LISTS.filter(p => logins[p]).map(p => {
      const a = goAccount[p];
      return `<div class="list-row go-account"><span><strong>${esc(GO_PLATFORMS[p])}账号里的歌单</strong><small>${a?.loading ? '正在读……' : a?.error ? esc(a.error) : a?.lists ? `${a.lists.length} 个` : '包括「我喜欢」'}</small></span>${btn('go-lists', a?.lists ? '再读一次' : '读取', 'secondary small', `data-p="${p}" ${a?.loading ? 'disabled' : ''}`)}</div>`
        + (a?.lists ? a.lists.map((g, i) => `<div class="list-row music-row"><span><strong>${esc(g.name)}</strong><small>${g.count ? g.count + ' 首' : '歌单'}</small></span>${btn('go-import', a.done.has(i) ? '已导入' : a.importing === i ? '导入中' : '导入', 'secondary small', `data-p="${p}" data-i="${i}" ${a.done.has(i) || a.importing !== undefined ? 'disabled' : ''}`)}</div>`).join('') : '');
    }).join('');
    v.draw(heading(saved ? '编辑音源' : '添加音源', '', 'Go Music')
      + `<div class="group pad">${field('名字', input('src-name', d.name || '', 'text', 'maxlength="30" placeholder="Go Music"'))}${field('Go Music 的地址', input('src-base', d.base || '', 'url', 'placeholder="http://127.0.0.1:8080" autocomplete="off" spellcheck="false"'), '你自己跑的 go-music-api：同一台电脑写 127.0.0.1，手机连电脑上的要写电脑的局域网地址（比如 http://192.168.1.5:8080）。')}</div>`
      + groupTitle('搜哪些平台', help('都不选就按后端自己的默认平台搜。选了的话只搜这些，「发现」里的推荐和分类也只看这些平台。'))
      + `<div class="group pad"><div class="filter-row go-platforms" role="group" aria-label="搜哪些平台">${Object.entries(GO_PLATFORMS).map(([k, name]) => btn('go-platform', esc(name), '', `data-p="${k}" aria-pressed="${(d.platforms || []).includes(k)}"`)).join('')}</div></div>`
      + `<div class="actions">${btn('test-source', icon('search') + '用「晴天」试一试', 'secondary')}</div>`
      + (test ? `<div class="group pad music-test">${test.error ? `<p class="hint">${esc(test.error)}</p>` : `<p class="hint">搜到 ${test.songs.length} 首${test.link ? '，第一首也能放' : ''}：</p>${test.songs.slice(0, 5).map(s => `<p class="music-test-row">${esc(label(s))} · ${esc(s.sourceName || '')}</p>`).join('')}${test.linkError ? `<p class="hint">放第一首时：${esc(test.linkError)}</p>` : ''}`}</div>` : '')
      + groupTitle('登录', help('会员歌、账号里的歌单要登录。「扫码」用那个平台的 App 扫；在手机上看时，点「存成图片」，再在 App 的扫一扫里从相册选它。「贴 Cookie」贴从网页版复制的整段 Cookie。登录都交给你自己的后端保存，小手机不存、也不显示。'))
      + `<div class="group">${GO_LOGINS.map(loginRow).join('')}</div>`
      + (L?.error ? `<p class="hint">${esc(L.error)}</p>` : '')
      + (!saved ? '<p class="hint">保存以后，登录了的账号里的歌单能在这里导进小手机。</p>' : accountRows ? groupTitle('账号里的歌单') + `<div class="group">${accountRows}</div>` : '')
      + (saved ? `<div class="actions">${btn('delete-source', icon('trash') + '删除这个音源', 'text-button danger-text')}</div>` : '')
      + `<div class="savebar">${btn('cancel-source', '取消', 'secondary')}${btn('save-source', '保存', 'primary')}</div>`);
  }
  /** QQ 音乐 logs in by QQ or by WeChat: which one. */
  function pickWay(login) {
    return new Promise(resolve => {
      const d = ctx.dialog(`${login.name}扫码登录`, `<div class="group">${login.qr.map(w => `<button type="button" class="list-row music-pick" data-way="${w}"><span><strong>${esc(GO_QR_NAMES[w] || w)}</strong></span></button>`).join('')}</div>`);
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      d.onClose(() => finish(null));
      d.body.addEventListener('click', e => { const b = e.target.closest('[data-way]'); if (b) { finish(b.dataset.way); d.close(); } });
    });
  }
  /** A login link as a picture to show (SVG: crisp at any size, and drawn anywhere). */
  const qrPicture = text => text ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(text, {label: '登录二维码'})) : '';
  /** The picture to keep (存成图片): a PNG, which a phone's gallery shows and a scanning app can pick from it. */
  async function qrFile(text, src) {
    if (!text) { const [head, body] = src.split(','); return new ctx.win.Blob([Uint8Array.from(ctx.win.atob(body), c => c.charCodeAt(0))], {type: head.slice(5).split(';')[0]}); }
    const {size, dark} = qrMatrix(text), scale = 10, full = (size + 8) * scale, canvas = ctx.doc.createElement('canvas');
    canvas.width = canvas.height = full;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, full, full); g.fillStyle = '#000';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark[y][x]) g.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('画不出图片')), 'image/png'));
  }
  /** 扫码登录: the code shown and asked about every 2 seconds while the sheet is open, until it is done or expired. */
  async function qrLogin(login, way) {
    const draft = goDraft();
    let session;
    try { session = await api.goMusicQr(draft, way); } catch (error) { ctx.notify(error.message, {error: true}); return; }
    const src = session.image || qrPicture(session.url);
    if (!src) { ctx.notify('后端没有给出二维码', {error: true}); return; }
    const ask = `${GO_QR_NAMES[way] || '扫一扫'}这个二维码，在 App 里确认登录`;
    const d = ctx.dialog(`${login.name}扫码登录`, `<div class="go-qr"><img src="${esc(src)}" alt="${esc(login.name)}的登录二维码" data-go-qr-img></div><p class="hint go-qr-state" role="status" data-go-qr-state>${esc(ask)}</p>`
      + `<div class="actions">${btn('go-qr-save', icon('download') + '存成图片', 'secondary')}</div><p class="hint">在这台手机上看的话：点「存成图片」，再在 App 的扫一扫里从相册选它。</p>`);
    const line = d.body.querySelector('[data-go-qr-state]');
    let alive = true, misses = 0;
    d.onClose(() => { alive = false; });
    const tick = async () => {
      if (!alive) return;
      let s = null;
      try { s = await api.goMusicQrCheck(draft, way, session.key); misses = 0; }
      catch (error) { if (++misses >= 3) { alive = false; line.textContent = '问不到登录结果：' + error.message; return; } }
      if (!alive) return;
      if (s?.status === 'success') { alive = false; line.textContent = '登录好了'; ctx.notify(`${login.name}登录好了`); loadLogins(); ctx.win.setTimeout(() => d.close(), 900); return; }
      if (s?.status === 'expired') { alive = false; line.textContent = '二维码过期了：关掉再点一次「扫码」'; return; }
      if (s?.status === 'failed') { alive = false; line.textContent = '没登录成功' + (s.message ? '：' + s.message : ''); return; }
      if (s) line.textContent = s.status === 'scanned' ? '扫好了：在 App 里点「确认登录」' : ask;
      ctx.win.setTimeout(tick, 2000);
    };
    ctx.win.setTimeout(tick, 1500);
    d.body.addEventListener('click', async e => {
      if (!e.target.closest('[data-action=go-qr-save]')) return;
      try { ctx.notify('存好了：' + await saveFile(ctx.doc, await qrFile(session.image ? '' : session.url, src), `${login.name}登录二维码`)); } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** 贴 Cookie: sent on to the backend as it is; the phone keeps nothing. */
  function cookieSheet(login) {
    const d = ctx.dialog(`${login.name} · 贴 Cookie`, `<div class="group pad">${field('Cookie', textArea('go-cookie', '', 'rows="5" autocomplete="off" spellcheck="false" placeholder="从网页版复制的整段 Cookie"'), '直接交给你自己的 Go Music 后端保存，小手机不存、也不显示。')}</div>`
      + `<p class="hint">怎么拿：电脑浏览器登录${esc(login.name)}的网页版，按 F12 打开开发者工具，在「网络」里刷新页面，点开一个请求，复制「请求标头」里 Cookie 后面的整段。</p><div class="savebar">${btn('go-cookie-save', '交给后端', 'primary')}</div>`);
    d.body.addEventListener('click', async e => {
      if (!e.target.closest('[data-action=go-cookie-save]')) return;
      const value = d.body.querySelector('[data-field=go-cookie]')?.value.trim() || '';
      if (!value) { ctx.notify('先把 Cookie 贴进来', {error: true}); return; }
      try { await api.goMusicSetCookie(goDraft(), login.id, value); d.close(); ctx.notify(`${login.name}的 Cookie 交给后端了`); loadLogins(); }
      catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }
  /** The Go Music source 发现 reads (the first one turned on). */
  const goOn = () => state().sources.find(x => x.enabled && isGoMusic(x) && x.base) || null;
  /** 发现: what the backend recommends, or its 歌单分类 and a category's playlists. */
  async function loadDiscover(what = 'recommend', options = {}) {
    const s = goOn();
    if (!s) return;
    if (!discover || discover.source !== s.id) discover = {source: s.id, view: 'recommend', recommend: null, categories: null, platform: '', category: '', lists: null, loading: '', error: ''};
    const mine = discover;
    mine.loading = what; mine.error = '';
    try {
      if (what === 'recommend') mine.recommend = await api.goMusicDiscover(s.id, {what});
      if (what === 'categories') { mine.categories = await api.goMusicDiscover(s.id, {what}); mine.platform ||= mine.categories[0]?.platform || ''; }
      if (what === 'category') mine.lists = await api.goMusicDiscover(s.id, {what, platform: options.platform, category: options.category});
    } catch (error) { mine.error = error.message; }
    if (discover !== mine) return;
    mine.loading = '';
    if (!v.disposed && mode === 'main' && tab === 'search') render();
  }
  /** 发现 under the search box while nothing is searched (a Go Music source turned on). */
  function discoverHTML() {
    const s = goOn();
    if (!s || query || results.length || searching || kind !== 'song') return '';
    if (!discover || discover.source !== s.id) { loadDiscover(); return '<p class="hint" role="status">正在看推荐的歌单……</p>'; }
    const D = discover, rows = list => list?.length ? `<div class="group">${list.map((g, i) => `<div class="list-row music-row"><button type="button" class="music-row-main" data-action="open-discover" data-i="${i}"><span><strong>${esc(g.name)}</strong><small>${esc(groupNote(g))}</small></span></button>${icon('next')}</div>`).join('')}</div>` : '';
    const cats = D.categories?.find(c => c.platform === D.platform);
    return groupTitle('发现 · ' + esc(s.name))
      + `<div class="segmented" role="group" aria-label="发现">${[['recommend', '推荐歌单'], ['category', '分类']].map(([k, l]) => `<button data-action="discover-view" data-view="${k}" aria-pressed="${D.view === k}">${l}</button>`).join('')}</div>`
      + (D.view === 'recommend' ? (D.loading === 'recommend' ? '<p class="hint" role="status">正在读……</p>' : rows(D.recommend) || (D.error ? '' : '<p class="hint">后端没有推荐的歌单</p>'))
        : (!D.categories ? (D.loading === 'categories' ? '<p class="hint" role="status">正在读分类……</p>' : '')
          : `<div class="filter-row" role="group" aria-label="平台">${D.categories.map(c => btn('discover-platform', esc(c.name), '', `data-p="${esc(c.platform)}" aria-pressed="${c.platform === D.platform}"`)).join('')}</div>`
            + (cats ? `<div class="filter-row go-cats" role="group" aria-label="分类">${cats.categories.map(c => btn('discover-category', esc(c.name), '', `data-c="${esc(c.id)}" aria-pressed="${c.id === D.category}"`)).join('')}</div>` : '')
            + (D.loading === 'category' ? '<p class="hint" role="status">正在读……</p>' : rows(D.lists))))
      + (D.error ? `<p class="hint">${esc(D.error)}</p>` : '');
  }
  const discoverList = () => discover?.view === 'recommend' ? discover.recommend || [] : discover?.lists || [];

  /** Searches (songs, albums or artists); more: the next page added under the ones found. */
  async function search(next = false) {
    if (!next) { query = v.root.querySelector('[data-music-query]')?.value.trim() || ''; page = 0; results = []; groups = []; more = false; searchNote = ''; }
    if (!query) return;
    searching = true; searchErrors = []; render();
    try {
      // what was found already, so a source whose address does not say how to turn pages can be tried page by page
      const seen = next ? (kind === 'song' ? results : groups).map(x => x.source + '|' + x.id) : [];
      const found = await api.searchMusic(query, '', {kind, page, seen});
      if (kind === 'song') results = [...results, ...found.songs]; else groups = [...groups, ...found.groups];
      more = !!found.more; searchErrors = found.errors;
      searchNote = found.unpaged?.length ? `${found.unpaged.map(n => `「${n}」`).join('、')}只给了第一页：搜索地址没写怎么翻页，插件试了几种常见的翻页写法也没取到更多。在音源设置里给搜索地址加上 {{offset}}（或 {{page}}）和 {{limit}}，就能接着翻。` : '';
      if (!(kind === 'song' ? results : groups).length && !searchErrors.length) searchErrors = [{source: '搜索', message: '没有搜到'}];
    }
    catch (error) { searchErrors = [{source: '搜索', message: error.message}]; more = false; }
    finally { searching = false; if (!v.disposed) render(); }
  }
  const asTrack = s => s.origin || s.id && !s.source ? s : {title: s.title, artist: s.artist, origin: 'source', source: s.source, songId: s.id};
  const play = (list, i, which = '') => api.musicPlayList(list.map(asTrack), i, which).catch(e => ctx.notify(e.message, {error: true}));
  const playFrom = which => (api.musicPlayFrom ? api.musicPlayFrom(which) : Promise.reject(Error('先在酒馆里打开小手机'))).catch(e => ctx.notify(e.message, {error: true}));
  /** A song of 正文点的歌 into the 歌单: as found on a source when it was played, or looked up by its name now. */
  async function keepHeard(s) {
    let row = s.source && s.songId ? {title: s.title, artist: s.artist, source: s.source, songId: s.songId} : null;
    // its lyrics (kept while it played) go along
    const lyric = s.lyric ? {lyric: s.lyric} : {};
    if (row) Object.assign(row, lyric);
    if (!row) {
      const found = await api.searchMusic([s.title, s.artist].filter(Boolean).join(' '));
      const m = bestMatch(found.songs, s);
      if (!m) throw Error(`没在音源里找到「${s.title}」`);
      row = {title: m.title, artist: m.artist, source: m.source, songId: m.id, ...lyric};
    }
    await keep([row], `「${row.title}」`);
  }
  /** Songs found into the 歌单: straight into 全部 while the user has made no 歌单 of their own, else into the one they
   *  pick (or only 全部). what: how the songs are named in the message. */
  async function keep(rows, what) {
    const to = lists.length ? await pickList(what) : {id: '', name: ''};
    if (!to) return;
    try {
      if (to.id) {
        const {kept} = await api.addSongsTo(to.id, rows);
        ctx.notify(!kept ? `「${to.name}」里已经有了` : kept < rows.length ? `放进「${to.name}」${kept} 首（别的已经在里面了）` : `${what}放进「${to.name}」了`);
      } else {
        const n = (await api.addSongs(rows)).length;
        ctx.notify(!n ? (rows.length > 1 ? '这些歌歌单里都有了' : '歌单里已经有这首了') : n < rows.length ? `加了 ${n} 首（别的歌单里已经有了）` : `${what}加进歌单了`);
      }
    } catch (error) { ctx.notify(error.message, {error: true}); }
  }
  /** Which 歌单 songs go into: {id, name} (id '' for only 全部 — not offered when they are in it already), one made
   *  right here, or null when closed. */
  function pickList(what, {only = true} = {}) {
    return new Promise(resolve => {
      const rows = [...lists.map(p => [p.id, p.name, `${p.songs.length} 首`]), ...(only ? [['', '只放进「全部」', '不放进哪个歌单']] : [])];
      const d = ctx.dialog('放进哪个歌单', `<p class="hint" style="margin-top:0">${esc(what)}</p><div class="group">${rows.map(([id, name, note]) => `<button type="button" class="list-row music-pick" data-pick="${esc(id)}"><span><strong>${esc(name)}</strong><small>${esc(note)}</small></span></button>`).join('')}</div>`
        + `<div class="group pad">${field('新建一个歌单', input('new-list-name', '', 'text', 'maxlength="40" placeholder="歌单名字"'))}<div class="actions" style="margin:6px 0 0">${btn('pick-new', icon('add') + '新建并放进去', 'secondary')}</div></div>`);
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      d.onClose(() => finish(null));
      d.body.addEventListener('click', async e => {
        const pick = e.target.closest('[data-pick]');
        if (pick) { finish({id: pick.dataset.pick, name: lists.find(p => p.id === pick.dataset.pick)?.name || ''}); d.close(); return; }
        if (!e.target.closest('[data-action=pick-new]')) return;
        try { const p = await api.savePlaylist({name: d.body.querySelector('[data-field=new-list-name]')?.value || ''}); finish({id: p.id, name: p.name}); d.close(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
      });
    });
  }
  /** How a 歌单 with songs is deleted: 'only' (its songs stay in 全部), 'songs' (they go too), or null. */
  function deleteHow(p) {
    return new Promise(resolve => {
      const d = ctx.dialog(`删除歌单「${p.name}」`, `<p class="hint" style="margin-top:0">里面的 ${p.songs.length} 首歌怎么办？</p><div class="group">${[['only', '只删歌单', '歌还留在「全部」里'], ['songs', '连歌一起删', '这些歌也从「全部」里删掉（别的歌单里也有的会留着）']].map(([k, a, note]) => `<button type="button" class="list-row music-pick" data-del="${k}"><span><strong>${a}</strong><small>${note}</small></span></button>`).join('')}</div>`);
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      d.onClose(() => finish(null));
      d.body.addEventListener('click', e => { const t = e.target.closest('[data-del]'); if (t) { finish(t.dataset.del); d.close(); } });
    });
  }
  /** Makes a 歌单, or (p) renames or deletes one. */
  function listDialog(p = null) {
    const d = ctx.dialog(p ? '歌单' : '新建歌单', `<div class="group pad">${field('名字', input('list-name', p?.name || '', 'text', 'maxlength="40" placeholder="比如：下雨天听的"'))}</div>
      <div class="savebar">${p ? btn('list-delete', '删除歌单', 'danger') : ''}${btn('list-save', p ? '保存' : '新建', 'primary')}</div>`);
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'list-save') shelf = (await api.savePlaylist({id: p?.id || '', name: d.body.querySelector('[data-field=list-name]')?.value || ''})).id;
        if (b.dataset.action === 'list-delete') {
          const how = p.songs.length ? await deleteHow(p) : await ctx.confirm(`删除歌单「${p.name}」？`, '这个歌单是空的。') ? 'only' : null;
          if (!how) return;
          await api.deletePlaylist(p.id, {withSongs: how === 'songs'}); shelf = '';
          ctx.notify(how === 'songs' ? `删掉了歌单「${p.name}」和里面的歌` : `删掉了歌单「${p.name}」`);
        }
        d.close(); render();
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  v.on('submit', '[data-music-search]', (el, e) => { e.preventDefault(); search(); });
  /**
   * 添加本机的歌: songs, .lrc lyrics or zips, kept a few songs at a time — the page says how far it got,
   * and what fit stays when the device is full. Shown a 歌单 of their own, the songs go into it too, in the order picked.
   */
  async function addPicked(files) {
    if (adding) return;
    const into = shelf, ids = [], out = {added: 0, lyrics: 0, same: 0, skipped: [], others: 0, error: ''};
    adding = {done: 0, total: 0}; addedNote = null; render();
    const paint = () => { const el = v.root.querySelector('[data-music-adding]'); if (el) el.textContent = addingText(); };
    try {
      const {songs, lyrics, skipped, others} = await sortPicked(files);
      out.skipped.push(...skipped); out.others = others;
      adding.total = songs.length; paint();
      const start = Date.now();
      for (const lot of lots(songs)) {
        const rows = [];
        for (const s of lot) { try { rows.push(await readPicked(s)); } catch (error) { out.skipped.push({name: s.name, why: '读不出来：' + error.message}); } }
        if (rows.length) {
          let got;
          try { got = await api.addSongFiles(rows, {at: start - adding.done}); }
          catch (error) { throw /空间不足/.test(error.message) ? Error(`设备的空间满了，后面 ${adding.total - adding.done} 首没加`) : error; }
          ids.push(...got.ids); out.added += got.added.length; out.lyrics += got.added.filter(x => x.lyric).length + got.lyrics; out.same += got.same.length; out.skipped.push(...got.skipped);
        }
        adding.done += lot.length; paint();
      }
      // .lrc files with no song picked: to the songs of the same name in the 歌单
      const words = [];
      for (const l of lyrics) { const lyric = await l.open().then(lrcText).catch(() => ''); if (lyric) words.push({file: l.name, lyric}); else out.skipped.push({name: l.name, why: '不是带时间的 LRC 歌词'}); }
      if (words.length) { const got = await api.addLyrics(words); out.lyrics += got.given; out.skipped.push(...got.missed.map(name => ({name, why: NO_SONG}))); }
    } catch (error) { out.error = error.message; }
    if (into && ids.length) await api.addToPlaylist(into, ids).catch(error => { out.error ||= error.message; });
    adding = null; addedNote = out;
    // (the list drawn first, then the message)
    if (!v.disposed) await render();
    ctx.notify(addedText(out) + (out.error ? '：' + out.error : ''), out.error ? {error: true} : {});
  }
  v.on('change', '[data-music-file]', el => {
    const files = [...el.files]; el.value = '';
    if (files.length) addPicked(files);
  });
  // The line of what an import did goes when tapped (its 小 i still opens), and when the app is left.
  v.on('click', '.music-adding', (el, event) => { if (event.target.closest('[data-help]') || adding) return; addedNote = null; render(); });
  v.on('change', '[data-music-seek]', el => api.musicSeek?.(Number(el.value)));
  // a Go Music address typed: the logins are asked of it
  v.on('change', '[data-field=src-base]', () => { if (editing && isGoMusic(editing.draft)) { readDraft(); renderSource(); } });
  // finding songs in a long 歌单 as one types (only its rows are drawn again, the box keeps its focus)
  v.on('input', '[data-music-filter]', el => { filter = el.value; limit = STEP; redrawRows(); });
  v.on('input', '[data-music-seek]', el => { const p = v.root.querySelector('[data-music-pos]'); if (p) p.textContent = clock(Number(el.value)); });
  v.on('change', '[data-music-volume]', el => { api.saveMusic({volume: Number(el.value) / 100}); renderSettings(); });
  v.on('change', '[data-source-on]', el => { const list = structuredClone(state().sources); list[Number(el.dataset.sourceOn)].enabled = el.checked; try { saveSources(list); } catch (error) { ctx.notify(error.message, {error: true}); renderSettings(); } });
  v.on('change', '[data-field=rule]', el => { api.saveMusic({rule: el.value || DEFAULT_BGM_RULE}); const note = el.closest('details')?.querySelector('.fold-note'); if (note) note.textContent = state().rule === DEFAULT_BGM_RULE ? '默认' : '改过'; ctx.notify('点歌规则保存好了'); });
  v.on('change', '[data-field=duck],[data-field=share],[data-field=taste]', el => api.saveMusic({[el.dataset.field]: el.checked}));
  v.on('click', '[data-action]', async el => {
    const i = Number(el.dataset.i);
    if (el.dataset.action.startsWith('write-')) return writer.click(el);
    switch (el.dataset.action) {
      case 'tab': tab = el.dataset.tab; picked = null; addedNote = null; render(); break;
      case 'kind': kind = el.dataset.kind; results = []; groups = []; more = false; searchErrors = []; searchNote = ''; if (query) search(); else render(); break;
      case 'more-results': page++; search(true); break;
      case 'open-group': group = {g: groups[i], songs: [], page: 0, more: false, loading: false, error: ''}; mode = 'group'; loadGroup(); break;
      case 'group-more': group.page++; loadGroup(); break;
      case 'group-play': play(group.songs, 0); break;
      case 'group-save': await keepGroup(); break;
      case 'play-heard': playFrom('heard'); break;
      case 'play-mixed': playFrom(tab === 'library' && shelf ? shelf + '+heard' : 'mixed'); break;
      case 'shelf': shelf = el.dataset.shelf; filter = ''; limit = STEP; picked = null; addedNote = null; render(); break;
      case 'show-more': limit += STEP; redrawRows(); break;
      // 多选: tick songs, then put them in a 歌单, take them out of this one, or delete them
      case 'pick-start': picked = new Set(); render(); break;
      case 'pick-done': picked = null; render(); break;
      case 'pick-all': { const found = foundRows(), all = found.length && found.every(([x]) => picked.has(x.id)); for (const [x] of found) all ? picked.delete(x.id) : picked.add(x.id); redrawRows(); break; }
      case 'pick-add': {
        const ids = [...picked], to = await pickList(`选中的 ${ids.length} 首歌`, {only: false});
        if (!to?.id) break;
        try { const {kept} = await api.addToPlaylist(to.id, ids); ctx.notify(kept ? `放进「${to.name}」${kept} 首` : `「${to.name}」里都有了`); picked = null; render(); }
        catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'pick-out': { const here = lists.find(p => p.id === shelf), ids = [...picked]; if (!here || !ids.length) break; await api.removeFromPlaylist(here.id, ids); ctx.notify(`从「${here.name}」拿掉了 ${ids.length} 首`); picked = null; render(); break; }
      case 'pick-delete': {
        const ids = [...picked];
        if (!ids.length || !await ctx.confirm(`删掉选中的 ${ids.length} 首？`, (lists.length ? '每个歌单里也都没有了。' : '') + (songs.some(x => picked.has(x.id) && x.origin === 'file') ? '本机的歌文件会从这台设备上删掉。' : ''))) break;
        await api.deleteSongs(ids); ctx.notify(`删掉了 ${ids.length} 首`); picked = null; render();
        break;
      }
      case 'new-list': listDialog(); break;
      case 'list-menu': { const p = lists.find(x => x.id === shelf); if (p) listDialog(p); break; }
      case 'heard-save': try { await keepHeard(heard[i]); } catch (error) { ctx.notify(error.message, {error: true}); } break;
      case 'heard-forget': await api.forgetHeard?.([heard[i].id]); render(); break;
      case 'heard-clear': if (await ctx.confirm('清空正文点的歌？', '只是清掉这个列表，歌单不受影响。')) { await api.clearHeard?.(); render(); } break;
      case 'music-mode': {
        const m = PLAY_MODES[(PLAY_MODES.indexOf(state().mode) + 1) % PLAY_MODES.length];
        if (api.musicMode) api.musicMode(m); else api.saveMusic({mode: m});
        ctx.notify(PLAY_MODE_NAMES[m]); paintNow();
        break;
      }
      case 'settings': mode = 'settings'; render(); break;
      case 'search': search(); break;
      case 'play': if (picked && el.dataset.list === 'library') { const s = shown[i]; if (s) { picked.has(s.id) ? picked.delete(s.id) : picked.add(s.id); redrawRows(); } break; }
        el.dataset.list === 'heard' ? play(heardTracks(), i, 'heard') : el.dataset.list === 'group' ? play(group.songs, i) : el.dataset.list === 'results' ? play(results, i) : play(shown, i, shelf || 'library'); break;
      case 'play-all': playFrom(shelf || 'library'); break;
      case 'music-toggle': api.musicToggle?.(); break;
      case 'music-next': api.musicNext?.(); break;
      case 'music-prev': api.musicPrev?.(); break;
      case 'music-stop': api.musicStop?.(); break;
      case 'lyrics': showLyrics = !showLyrics; refreshNow(); break;
      case 'lyric-seek': api.musicSeek?.(Number(el.dataset.at)); break;
      case 'save-song': {
        const s = (el.dataset.list === 'group' ? group.songs : results)[i];
        await keep([{title: s.title, artist: s.artist, source: s.source, songId: s.id}], `「${s.title}」`);
        break;
      }
      case 'song-menu': {
        // in 全部: deleted from everywhere; in a 歌单 of the user's: only taken out of it. Which 歌单 it is in switches on and off.
        const s = shown[i], here = lists.find(p => p.id === shelf);
        const d = ctx.dialog(s.title, `<div class="group pad">${field('歌名', input('song-title', s.title, 'text', 'maxlength="200"'))}${field('歌手', input('song-artist', s.artist, 'text', 'maxlength="200"'))}${s.origin === 'file' ? field('歌词（LRC，可不填）', textArea('song-lyric', s.lyric || '', 'rows="5" placeholder="[00:12.30]第一句歌词"'), '带时间的 LRC 歌词会跟着歌一句句显示，也会显示在音乐小窗里。') : ''}</div>`
          + (lists.length ? `${groupTitle('放在哪些歌单里')}<div class="group pad">${lists.map(p => toggle('in-' + p.id, p.name, p.songs.includes(s.id))).join('')}</div>` : '')
          + `<div class="savebar">${here ? btn('song-out', `从「${esc(here.name)}」拿掉`, 'danger') : btn('song-delete', lists.length ? '删掉这首' : '从歌单删掉', 'danger')}${btn('song-save', '保存', 'primary')}</div>`);
        d.onClose(() => { if (!v.disposed && mode === 'main') render(); });
        d.body.addEventListener('change', async e => {
          const box = e.target.closest('[data-field^="in-"]');
          if (!box) return;
          const id = box.dataset.field.slice(3);
          try { if (box.checked) await api.addToPlaylist(id, [s.id]); else await api.removeFromPlaylist(id, [s.id]); }
          catch (error) { box.checked = !box.checked; ctx.notify(error.message, {error: true}); }
        });
        d.body.addEventListener('click', async e => {
          const b = e.target.closest('[data-action]');
          if (!b) return;
          try {
            if (b.dataset.action === 'song-save') { const val = k => d.body.querySelector(`[data-field=${k}]`)?.value ?? ''; await api.updateSong(s.id, {title: val('song-title'), artist: val('song-artist'), ...(s.origin === 'file' ? {lyric: val('song-lyric')} : {})}); }
            if (b.dataset.action === 'song-out') await api.removeFromPlaylist(here.id, [s.id]);
            if (b.dataset.action === 'song-delete') { if (!await ctx.confirm(`删掉「${s.title}」？`, (s.origin === 'file' ? '这首歌的文件会从这台设备上删掉' : '会从歌单里拿掉') + (lists.length ? '，每个歌单里也都没有了。' : '。'))) return; await api.deleteSongs([s.id]); }
            d.close(); render();
          } catch (error) { ctx.notify(error.message, {error: true}); }
        });
        break;
      }
      case 'go-platform': {
        readDraft();
        const p = el.dataset.p, list = editing.draft.platforms || [];
        editing.draft.platforms = list.includes(p) ? list.filter(x => x !== p) : [...list, p];
        renderSource();
        break;
      }
      case 'go-qr': {
        const login = GO_LOGINS.find(l => l.id === el.dataset.login);
        const way = login && (login.qr.length > 1 ? await pickWay(login) : login.qr[0]);
        if (way) qrLogin(login, way);
        break;
      }
      case 'go-cookie': { const login = GO_LOGINS.find(l => l.id === el.dataset.login); if (login) cookieSheet(login); break; }
      case 'go-logout': {
        const login = GO_LOGINS.find(l => l.id === el.dataset.login);
        if (!login || !await ctx.confirm(`退出${login.name}？`, '后端会删掉这个平台的登录。')) break;
        try { await api.goMusicSetCookie(goDraft(), login.id, ''); ctx.notify(`${login.name}退出了`); loadLogins(); } catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'go-lists': {
        const p = el.dataset.p, a = goAccount[p] = {loading: true, lists: null, error: '', done: new Set(), importing: undefined}, source = state().sources[editing.index];
        renderSource();
        try { a.lists = await api.goMusicAccountLists(source.id, p); } catch (error) { a.error = error.message; }
        a.loading = false;
        if (!v.disposed && mode === 'source') renderSource();
        break;
      }
      case 'go-import': {
        const a = goAccount[el.dataset.p], g = a?.lists?.[i];
        if (!g || a.importing !== undefined) break;
        a.importing = i; renderSource();
        try {
          const {songs: got} = await api.groupSongs(g.source, 'playlist', g.id);
          if (!got.length) throw Error(`「${g.name}」里没读到歌`);
          const list = await api.savePlaylist({name: g.name});
          const {kept} = await api.addSongsTo(list.id, got.map(s => ({title: s.title, artist: s.artist, source: s.source, songId: s.id})));
          a.done.add(i);
          ctx.notify(`「${g.name}」导入了 ${kept} 首，在「歌单」里`);
        } catch (error) { ctx.notify(error.message, {error: true}); }
        a.importing = undefined;
        if (!v.disposed && mode === 'source') renderSource();
        break;
      }
      case 'discover-view': {
        if (!discover) break;
        discover.view = el.dataset.view;
        if (discover.view === 'category' && !discover.categories) loadDiscover('categories');
        render();
        break;
      }
      case 'discover-platform': if (!discover) break; discover.platform = el.dataset.p; discover.category = ''; discover.lists = null; render(); break;
      case 'discover-category': if (!discover) break; discover.category = el.dataset.c; discover.lists = null; render(); loadDiscover('category', {platform: discover.platform, category: discover.category}); break;
      case 'open-discover': { const g = discoverList()[i]; if (g) { group = {g, songs: [], page: 0, more: false, loading: false, error: ''}; mode = 'group'; loadGroup(); } break; }
      case 'bgm': api.saveMusic({bgm: el.dataset.mode}); renderSettings(); break;
      case 'reset-rule': api.saveMusic({rule: DEFAULT_BGM_RULE}); renderSettings(); break;
      case 'add-source': goAccount = {}; editing = {index: -1, draft: normalizeSource({name: '', search: '', url: ''}, state().sources.length)}; editing.draft.name = ''; test = null; mode = 'source'; render(); break;
      case 'edit-source': goAccount = {}; editing = {index: i, draft: structuredClone(state().sources[i])}; test = null; mode = 'source'; render(); break;
      case 'fill-template': {
        const t = SELF_HOSTED.find(x => x.id === el.dataset.template), box = v.root.querySelector(`[data-field="base-${t?.id}"]`);
        const base = (box?.value.trim() || t?.example || '').replace(/\/+$/, '');
        if (!t || (!t.local && !/^https?:\/\/[^\s/]+/i.test(base))) { ctx.notify('先填你后端的地址，比如 ' + t?.example, {error: true}); break; }
        editing.draft = {...readDraft(), ...t.fill(base)}; test = null; renderSource();
        ctx.notify('格式填好了，可以点「用『晴天』试一试」');
        break;
      }
      case 'cancel-source': editing = null; test = null; mode = 'settings'; render(); break;
      case 'save-source': {
        const draft = readDraft(), list = structuredClone(state().sources);
        if (editing.index < 0) list.push({...draft, id: 'source-' + ctx.win.crypto.randomUUID().slice(0, 8), enabled: true}); else list[editing.index] = {...list[editing.index], ...draft};
        try { saveSources(list); editing = null; test = null; mode = 'settings'; render(); } catch (error) { ctx.notify(error.message, {error: true}); }
        break;
      }
      case 'delete-source': {
        if (!await ctx.confirm('删除这个音源？', '歌单里从它加进来的歌会放不出来。')) break;
        saveSources(state().sources.filter((_, k) => k !== editing.index)); editing = null; mode = 'settings'; render();
        break;
      }
      case 'test-source': {
        const draft = structuredClone(readDraft()), editor = editing, ticket = ++sourceTest;
        const current = () => !v.disposed && mode === 'source' && editing === editor && ticket === sourceTest;
        // Test a snapshot of the draft without changing the saved sources.
        await v.busy(el, async () => {
          let result;
          try {
            const found = await api.searchMusic('晴天', draft);
            if (!current()) return;
            if (found.errors.length) throw Error(found.errors[0].message);
            result = {songs: found.songs};
            const song = found.songs[0];
            if (song) { try { result.link = await api.musicLink(draft, song.id, {title: song.title, artist: song.artist}); } catch (error) { result.linkError = error.message; } }
            if (!found.songs.length) result.error = '连上了，但没读出歌：检查「搜索结果列表在哪」「歌曲 ID 在哪」「歌名在哪」';
          } catch (error) { result = {error: error.message}; }
          if (!current()) return;
          test = result;
          readDraft();
          renderSource();
        });
        break;
      }
    }
  });
  v.back = () => {
    if (writer.back()) return true;
    if (mode === 'source') { editing = null; test = null; mode = 'settings'; render(); return true; }
    if (mode === 'group') { group = null; mode = 'main'; render(); return true; }
    if (mode === 'settings') { mode = 'main'; render(); return true; }
    return false;
  };
  v.onMusic = event => {
    if (event.status) refreshNow();
    else if (event.step) writer.step(event);
    else if (mode === 'draft') writer.changed();
    else if (mode === 'write-form') { /* being filled in: nothing else on the page depends on the music */ }
    // while songs go in only the line under 添加本机的歌 changes (a few songs at a time: a thousand would draw the page
    // a hundred times); it is drawn whole once they are in
    else if (adding && !event.heard) { /* drawn at the end */ }
    else if (!event.heard || tab === 'heard') render();
  };
  /** A song written, opened from elsewhere (its card in a chat). */
  v.showDraft = id => writer.open(id);
  v.refresh = v.resume = () => render();
  const left = v.leave;
  v.leave = () => { if (!adding && addedNote) { addedNote = null; v.root.querySelector('.music-adding:not([data-music-adding])')?.remove(); } left?.(); };
  render();
  return v;
}
