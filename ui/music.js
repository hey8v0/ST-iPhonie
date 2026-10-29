// 音乐: the phone's music player. 正在播放 at the top (progress, lyrics, 顺序 / 随机 / 单曲循环), the 歌单 (全部: files
// the user added and songs saved from a search; and 歌单 the user makes of them), 正文点的歌 (the songs the story
// picked, to play again or keep), 搜索 over
// the user's own music sources (songs, albums, artists; more pages), and 设置: 背景音乐 (off / tap / auto), its rule,
// the volume and the sources. Playing happens in the tavern page (host-music.js), so it goes on while the phone is put
// away.
import {createView, esc, btn, field, input, textArea, toggle, heading, groupTitle, empty, help} from './common.js';
import {icon} from './icons.js';
import {BGM_MODES, BGM_MODE_NAMES, DEFAULT_BGM_RULE, SELF_HOSTED, PLAY_MODES, PLAY_MODE_NAMES, titleFromFile, normalizeSource, bestMatch} from '../core/music.js';

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
// searching albums and artists (optional): where to search, where the list is, where an album's or artist's songs are
const GROUP_FIELDS = [
  ['albumSearch', '搜专辑的地址', 'https://…?keywords={{query}}&offset={{offset}}'], ['albumListPath', '专辑列表在哪', 'result.albums'],
  ['albumSongs', '专辑里的歌的地址', 'https://…/album?id={{id}}'], ['albumSongsPath', '专辑的歌在哪', 'songs'],
  ['artistSearch', '搜歌手的地址', 'https://…?keywords={{query}}&offset={{offset}}'], ['artistListPath', '歌手列表在哪', 'result.artists'],
  ['artistSongs', '歌手的歌的地址', 'https://…/artist/songs?id={{id}}&offset={{offset}}'], ['artistSongsPath', '歌手的歌在哪', 'songs']
];
const MODE_ICON = {order: 'repeat', shuffle: 'shuffle', one: 'repeat1'};

export function musicApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'music');
  let mode = 'main', tab = 'library', songs = [], results = [], searchErrors = [], query = '', searching = false, epoch = 0, editing = null, showLyrics = false, test = null, sourceTest = 0;
  // 正文点的歌; what the search looks for (单曲 / 专辑 / 歌手), the albums or artists found, the page, whether there is
  // more; an album or artist opened: {g, songs, page, more, loading, error}
  let heard = [], kind = 'song', groups = [], page = 0, more = false, group = null;
  // the 歌单 the user made; the one shown ('' for 全部) and the songs shown
  let lists = [], shelf = '', shown = [];
  const state = () => api.getState().music;
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
  const songRow = (s, i, list) => `<div class="list-row music-row" data-list="${list}" data-i="${i}"><button type="button" class="music-row-main" data-action="play" data-list="${list}" data-i="${i}"><span><strong>${esc(s.title)}</strong><small>${esc(s.artist || '未知歌手')}${where(s, list)}</small></span></button>${
    list === 'results' || list === 'group' ? btn('save-song', icon('add'), 'icon-button', `data-list="${list}" data-i="${i}" aria-label="加进歌单"`)
    : list === 'heard' ? btn('heard-save', icon('add'), 'icon-button', `data-i="${i}" aria-label="加进歌单"`) + btn('heard-forget', icon('trash'), 'icon-button', `data-i="${i}" aria-label="从正文点的歌里拿掉"`)
    : btn('song-menu', icon('more'), 'icon-button', `data-i="${i}" aria-label="这首歌的选项"`)}</div>`;
  /** An album or an artist found: opens its songs. */
  const groupRow = (g, i) => `<div class="list-row music-row"><button type="button" class="music-row-main" data-action="open-group" data-i="${i}"><span><strong>${esc(g.name)}</strong><small>${esc([g.kind === 'album' ? g.artist || '专辑' : '歌手', g.count ? `${g.count} 首` : '', g.sourceName].filter(Boolean).join(' · '))}</small></span></button>${icon('next')}</div>`;
  /** The songs of the 正文点的歌 list as the player takes them (found on a source already, or to be looked up by name). */
  const heardTracks = () => heard.map(s => ({title: s.title, artist: s.artist, ...(s.source && s.songId ? {origin: 'source', source: s.source, songId: s.songId} : {})}));

  async function render() {
    const ticket = ++epoch;
    if (mode === 'settings') return renderSettings();
    if (mode === 'source') return renderSource();
    if (mode === 'group') return renderGroup();
    songs = await api.listSongs().catch(() => []);
    lists = await api.listPlaylists?.().catch(() => []) || [];
    if (tab === 'heard') heard = await api.listHeard?.().catch(() => []) || [];
    if (v.disposed || ticket !== epoch) return;
    const s = state(), sources = s.sources.filter(x => x.enabled), byId = new Map(songs.map(x => [x.id, x]));
    const mine = lists.find(p => p.id === shelf) || null;
    if (!mine) shelf = '';
    shown = mine ? mine.songs.map(id => byId.get(id)).filter(Boolean) : songs;
    const kinds = [['song', '单曲'], ...(sources.some(x => x.albumSearch) ? [['album', '专辑']] : []), ...(sources.some(x => x.artistSearch) ? [['artist', '歌手']] : [])];
    if (!kinds.some(([k]) => k === kind)) kind = 'song';
    const found = kind === 'song' ? results : groups;
    const list = tab === 'heard'
      ? (heard.length ? `<div class="actions" style="margin-top:0">${btn('play-heard', icon('play', true) + '全部播放', 'primary')}${btn('play-mixed', icon('shuffle') + '和歌单一起放', 'secondary')}${btn('heard-clear', icon('trash'), 'icon-button', 'aria-label="清空正文点的歌"')}</div>`
        + `<p class="hint">正文点过的歌都记在这里（最新的在上面，同一首只记一次，最多 200 首）。点 + 加进歌单。</p><div class="group">${heard.map((x, i) => songRow(x, i, 'heard')).join('')}</div>`
        : empty('正文还没有点过歌', '在「设置 → 背景音乐」打开点歌后，剧情每次挑的歌都会记在这里，可以再放、加进歌单。', 'music'))
      : tab === 'library'
      ? `<div class="filter-row music-shelves" role="group" aria-label="歌单">${btn('shelf', `全部 <small>${songs.length}</small>`, '', `data-shelf="" aria-pressed="${!mine}"`)}${lists.map(p => p === mine ? btn('list-menu', `${esc(p.name)} <small>${p.songs.filter(id => byId.has(id)).length}</small>${icon('more')}`, '', `data-shelf="${esc(p.id)}" aria-pressed="true" title="再点一下改名字或删掉"`) : btn('shelf', `${esc(p.name)} <small>${p.songs.filter(id => byId.has(id)).length}</small>`, '', `data-shelf="${esc(p.id)}" aria-pressed="false"`)).join('')}${btn('new-list', icon('add') + (lists.length ? '' : '新建歌单'), '', 'aria-label="新建歌单"')}</div>`
        + `<div class="actions music-tools" style="margin-top:0"><label class="primary file-button">${icon('add')}添加本机的歌<input type="file" data-music-file multiple accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aac" aria-label="选择音乐文件"></label>${shown.length ? btn('play-all', icon('play', true) + '全部播放', 'secondary') + btn('play-mixed', icon('shuffle'), 'icon-button', 'aria-label="和正文点的歌一起放" title="和正文点的歌一起放"') : ''}</div>`
        + (shown.length ? `<div class="group">${shown.map((x, i) => songRow(x, i, 'library')).join('')}</div>`
          : mine ? empty('这个歌单还是空的', '在「搜索」「正文点的歌」里点 ＋ 放进来，或者在「全部」里点歌右边的「⋯」选它；也可以直接添加本机的歌。', 'music')
          : empty('歌单还是空的', '添加手机或电脑里的歌（文件名是「歌手 - 歌名」会自动认出歌手），或者在「搜索」里找歌加进来。', 'music'))
      : (kinds.length > 1 ? `<div class="segmented music-kinds" role="group" aria-label="搜什么">${kinds.map(([k, l]) => `<button data-action="kind" data-kind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>` : '')
        + `<form class="music-search" data-music-search><input type="search" data-music-query value="${esc(query)}" placeholder="${!sources.length ? '先在设置里添加音源' : kind === 'album' ? '专辑名' : kind === 'artist' ? '歌手名' : '歌名、歌手'}" aria-label="搜歌" ${sources.length ? '' : 'disabled'}>${btn('search', icon('search'), 'round-button', `aria-label="搜索" ${sources.length && !searching ? '' : 'disabled'}`)}</form>`
        + searchErrors.map(e => `<p class="hint">「${esc(e.source)}」：${esc(e.message)}</p>`).join('')
        + (found.length ? `<div class="group">${kind === 'song' ? results.map((x, i) => songRow(x, i, 'results')).join('') : groups.map(groupRow).join('')}</div>`
          : !sources.length ? empty('还没有音源', '插件不自带音源。在右上角「设置 → 音源」里添加你自己的音源地址，就能在这里搜歌。', 'search') : '')
        + (searching ? '<p class="hint" role="status">正在搜……</p>' : more && found.length ? `<div class="actions">${btn('more-results', '加载更多', 'secondary')}</div>` : '');
    v.draw(heading('音乐', btn('settings', icon('sliders'), 'round-button', 'aria-label="音乐设置"'), `Music · ${songs.length} 首`)
      + nowPlaying()
      + `<div class="segmented" role="group" aria-label="歌单、正文点的歌或搜索">${[['library', '歌单'], ['heard', '正文点的歌'], ['search', '搜索']].map(([k, l]) => `<button data-action="tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>`
      + list);
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

  /** An album or an artist opened from the search: its songs (more pages for sources that give them so). */
  function renderGroup() {
    const g = group.g;
    v.draw(heading(g.name, '', g.kind === 'album' ? 'Album' : 'Artist')
      + `<p class="hint" style="margin-top:0">${esc([g.kind === 'album' ? g.artist : '歌手', g.count ? `${g.count} 首` : '', g.sourceName].filter(Boolean).join(' · '))}</p>`
      + (group.songs.length ? `<div class="actions" style="margin-top:0">${btn('group-play', icon('play', true) + '全部播放', 'primary')}${btn('group-save', icon('add') + '全部加进歌单', 'secondary')}</div><div class="group">${group.songs.map((x, i) => songRow(x, i, 'group')).join('')}</div>` : '')
      + (group.loading ? '<p class="hint" role="status">正在取歌……</p>' : '')
      + (group.error ? `<p class="hint">${esc(group.error)}</p>` : !group.loading && !group.songs.length ? '<p class="hint">里面没有歌</p>' : '')
      + (group.more && !group.loading ? `<div class="actions">${btn('group-more', '加载更多', 'secondary')}</div>` : ''));
  }
  async function loadGroup() {
    const g = group, mine = group;
    g.loading = true; renderGroup();
    try { const got = await api.groupSongs(g.g.source, g.g.kind, g.g.id, g.page); if (group !== mine) return; g.songs = [...g.songs, ...got.songs]; g.more = !!got.more; g.error = ''; }
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
        ${toggle('share', '角色会给你分享歌', s.share, '手机聊天里，角色偶尔会分享一首歌给你（一张歌曲卡片，点一下就放）；你在放歌时，角色和正文也知道你在听什么（一起听）。')}</div>`
      + groupTitle('音源', help('插件不自带任何音源。音源是两个网址：一个用来搜歌（在放搜索词的地方写 {{query}}），一个用来取歌的播放链接（在放歌曲 ID 的地方写 {{id}}）；再告诉插件结果里列表、歌名、歌手、链接分别在哪（用点隔开的路径，比如 data.url）。\n\n音源不让网页直接读取时，会改用酒馆自带的代理（要在酒馆的 config.yaml 里把 enableCorsProxy 改成 true）。'))
      + `<div class="group">${s.sources.map((x, i) => `<div class="list-row music-source"><span><strong>${esc(x.name)}</strong><small>${esc(x.search.replace(/^https?:\/\//, '').split('/')[0])}</small></span><input class="switch" type="checkbox" data-source-on="${i}" aria-label="启用 ${esc(x.name)}" ${x.enabled ? 'checked' : ''}>${btn('edit-source', icon('edit'), 'icon-button', `data-i="${i}" aria-label="编辑 ${esc(x.name)}"`)}</div>`).join('') || '<p class="hint" style="padding:12px 16px">还没有音源。</p>'}</div>
        <div class="actions">${btn('add-source', icon('add') + '添加音源', 'secondary')}</div>`);
  }
  function renderSource() {
    const d = editing.draft;
    const sourceField = ([k, l, ph]) => field(l, input('src-' + k, d[k] || '', k.endsWith('Path') || k === 'name' ? 'text' : 'url', `placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"`));
    v.draw(heading(editing.index < 0 ? '添加音源' : '编辑音源', '', 'Source')
      + (editing.index < 0 ? groupTitle('自己搭的后端', help('在自己电脑上、或者手机的 Termux 里跑音乐接口程序（比如网易云音乐 API 这一类）的话，填上它的地址，下面的格式会自动填好。酒馆里装了提供音乐接口的服务端插件的话，地址写成酒馆自己的地址（以 / 开头，比如 /api/plugins/插件名/search?…），会带着酒馆的登录去问。插件不带任何别人的服务器地址。\n\n电脑上跑的后端，手机要用电脑的局域网地址（比如 http://192.168.1.5:3000）。会员歌要看你的后端有没有登录。')) + `<div class="group pad">${SELF_HOSTED.map(t => `<div class="field"><span>${esc(t.name)}</span><div class="music-selfhost">${t.local ? '<small class="hint" style="flex:1;margin:0">装在你酒馆里，不用填地址</small>' : input('base-' + t.id, '', 'url', `placeholder="${esc(t.example)}" autocomplete="off" spellcheck="false"`)}${btn('fill-template', t.local ? '填好' : '按这个格式填', 'secondary small', `data-template="${esc(t.id)}"`)}</div></div>`).join('')}</div>` : '')
      + `<div class="group pad">${SOURCE_FIELDS.slice(0, 3).map(sourceField).join('')}</div>
      <details data-group="source-groups"><summary>搜专辑和歌手（可不填） ${help('音源的接口能搜专辑、歌手的话，在这里填：搜的地址（写 {{query}}）、结果列表在哪、取专辑或歌手里的歌的地址（写 {{id}}）、歌在哪。地址里写 {{offset}}（从第几首开始）或 {{page}}（第几页）、{{limit}}（一页几首），就能「加载更多」。用上面「自己搭的后端」时会自动填好。')}</summary><div class="fold-body">${GROUP_FIELDS.map(([k, l, ph]) => field(l, input('src-' + k, d[k] || '', k.endsWith('Path') ? 'text' : 'url', `placeholder="${esc(ph)}" autocomplete="off" spellcheck="false"`))).join('')}</div></details>
      <details data-group="source-paths"><summary>歌词和结果在哪 ${help('按接口文档填：结果里列表、歌曲 ID、歌名、歌手、播放链接、歌词分别在哪（用点隔开的路径，比如 data.url）。用上面「自己搭的后端」一键填的话，这些都填好了。')}<small class="fold-note">${d.listPath || d.urlPath ? '填好了' : '空着自动找'}</small></summary><div class="fold-body">${SOURCE_FIELDS.slice(3).map(sourceField).join('')}
        ${toggle('src-direct', '取歌地址直接就是音频', d.direct === true, '有的接口取歌时不回 JSON，而是直接给音频，或者跳转到音频文件（比如 Meting 这类、go-music-api 的 /stream）。打开后，取歌地址填好歌曲 ID 就直接拿来播放，「播放链接在哪」不用管。不打开时，接口给的是音频也会自动认出来（要能读到它）。')}</div></details>
      <div class="actions">${btn('test-source', icon('search') + '用「晴天」试一试', 'secondary')}</div>
      ${test ? `<div class="group pad music-test">${test.error ? `<p class="hint">${esc(test.error)}</p>` : `<p class="hint">搜到 ${test.songs.length} 首${test.link ? '，第一首的播放链接也拿到了' : ''}：</p>${test.songs.slice(0, 5).map(s => `<p class="music-test-row">${esc(label(s))}</p>`).join('')}${test.linkError ? `<p class="hint">取播放链接时：${esc(test.linkError)}</p>` : ''}`}</div>` : ''}
      ${editing.index >= 0 ? `<div class="actions">${btn('delete-source', icon('trash') + '删除这个音源', 'text-button danger-text')}</div>` : ''}
      <div class="savebar">${btn('cancel-source', '取消', 'secondary')}${btn('save-source', '保存', 'primary')}</div>`);
  }
  const readDraft = () => {
    for (const [k] of [...SOURCE_FIELDS, ...GROUP_FIELDS]) { const el = v.root.querySelector(`[data-field="src-${k}"]`); if (el) editing.draft[k] = el.value.trim(); }
    const direct = v.root.querySelector('[data-field="src-direct"]'); if (direct) editing.draft.direct = direct.checked;
    return editing.draft;
  };
  function saveSources(list) { api.saveMusic({sources: list}); }

  /** Searches (songs, albums or artists); more: the next page added under the ones found. */
  async function search(next = false) {
    if (!next) { query = v.root.querySelector('[data-music-query]')?.value.trim() || ''; page = 0; results = []; groups = []; more = false; }
    if (!query) return;
    searching = true; searchErrors = []; render();
    try {
      const found = await api.searchMusic(query, '', {kind, page});
      if (kind === 'song') results = [...results, ...found.songs]; else groups = [...groups, ...found.groups];
      more = !!found.more; searchErrors = found.errors;
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
    if (!row) {
      const found = await api.searchMusic([s.title, s.artist].filter(Boolean).join(' '));
      const m = bestMatch(found.songs, s);
      if (!m) throw Error(`没在音源里找到「${s.title}」`);
      row = {title: m.title, artist: m.artist, source: m.source, songId: m.id};
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
  /** Which 歌单 songs go into: {id, name} (id '' for only 全部), one made right here, or null when closed. */
  function pickList(what) {
    return new Promise(resolve => {
      const rows = [...lists.map(p => [p.id, p.name, `${p.songs.length} 首`]), ['', '只放进「全部」', '不放进哪个歌单']];
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
  /** Makes a 歌单, or (p) renames or deletes one. */
  function listDialog(p = null) {
    const d = ctx.dialog(p ? '歌单' : '新建歌单', `<div class="group pad">${field('名字', input('list-name', p?.name || '', 'text', 'maxlength="40" placeholder="比如：下雨天听的"'))}</div>
      <div class="savebar">${p ? btn('list-delete', '删除歌单', 'danger') : ''}${btn('list-save', p ? '保存' : '新建', 'primary')}</div>`);
    d.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      try {
        if (b.dataset.action === 'list-save') shelf = (await api.savePlaylist({id: p?.id || '', name: d.body.querySelector('[data-field=list-name]')?.value || ''})).id;
        if (b.dataset.action === 'list-delete') { if (!await ctx.confirm(`删除歌单「${p.name}」？`, '只删掉这个歌单，里面的歌还在「全部」里。')) return; await api.deletePlaylist(p.id); shelf = ''; }
        d.close(); render();
      } catch (error) { ctx.notify(error.message, {error: true}); }
    });
  }

  v.on('submit', '[data-music-search]', (el, e) => { e.preventDefault(); search(); });
  v.on('change', '[data-music-file]', async el => {
    const files = [...el.files]; el.value = '';
    if (!files.length) return;
    try {
      const rows = files.map(f => ({...titleFromFile(f.name), blob: f}));
      // shown a 歌单 of their own: into it too
      const added = shelf ? (await api.addSongsTo(shelf, rows)).added : await api.addSongs(rows);
      ctx.notify(`加了 ${added.length} 首`);
    }
    catch (error) { ctx.notify(error.message, {error: true}); }
    render();
  });
  v.on('change', '[data-music-seek]', el => api.musicSeek?.(Number(el.value)));
  v.on('input', '[data-music-seek]', el => { const p = v.root.querySelector('[data-music-pos]'); if (p) p.textContent = clock(Number(el.value)); });
  v.on('change', '[data-music-volume]', el => { api.saveMusic({volume: Number(el.value) / 100}); renderSettings(); });
  v.on('change', '[data-source-on]', el => { const list = structuredClone(state().sources); list[Number(el.dataset.sourceOn)].enabled = el.checked; try { saveSources(list); } catch (error) { ctx.notify(error.message, {error: true}); renderSettings(); } });
  v.on('change', '[data-field=rule]', el => { api.saveMusic({rule: el.value || DEFAULT_BGM_RULE}); const note = el.closest('details')?.querySelector('.fold-note'); if (note) note.textContent = state().rule === DEFAULT_BGM_RULE ? '默认' : '改过'; ctx.notify('点歌规则保存好了'); });
  v.on('change', '[data-field=duck],[data-field=share],[data-field=taste]', el => api.saveMusic({[el.dataset.field]: el.checked}));
  v.on('click', '[data-action]', async el => {
    const i = Number(el.dataset.i);
    switch (el.dataset.action) {
      case 'tab': tab = el.dataset.tab; render(); break;
      case 'kind': kind = el.dataset.kind; results = []; groups = []; more = false; searchErrors = []; if (query) search(); else render(); break;
      case 'more-results': page++; search(true); break;
      case 'open-group': group = {g: groups[i], songs: [], page: 0, more: false, loading: false, error: ''}; mode = 'group'; loadGroup(); break;
      case 'group-more': group.page++; loadGroup(); break;
      case 'group-play': play(group.songs, 0); break;
      case 'group-save': await keep(group.songs.map(s => ({title: s.title, artist: s.artist, source: s.source, songId: s.id})), `「${group.g.name}」的 ${group.songs.length} 首歌`); break;
      case 'play-heard': playFrom('heard'); break;
      case 'play-mixed': playFrom(tab === 'library' && shelf ? shelf + '+heard' : 'mixed'); break;
      case 'shelf': shelf = el.dataset.shelf; render(); break;
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
      case 'play': el.dataset.list === 'heard' ? play(heardTracks(), i, 'heard') : el.dataset.list === 'group' ? play(group.songs, i) : el.dataset.list === 'results' ? play(results, i) : play(shown, i, shelf || 'library'); break;
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
      case 'bgm': api.saveMusic({bgm: el.dataset.mode}); renderSettings(); break;
      case 'reset-rule': api.saveMusic({rule: DEFAULT_BGM_RULE}); renderSettings(); break;
      case 'add-source': editing = {index: -1, draft: normalizeSource({name: '', search: '', url: ''}, state().sources.length)}; editing.draft.name = ''; test = null; mode = 'source'; render(); break;
      case 'edit-source': editing = {index: i, draft: structuredClone(state().sources[i])}; test = null; mode = 'source'; render(); break;
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
    if (mode === 'source') { editing = null; test = null; mode = 'settings'; render(); return true; }
    if (mode === 'group') { group = null; mode = 'main'; render(); return true; }
    if (mode === 'settings') { mode = 'main'; render(); return true; }
    return false;
  };
  v.onMusic = event => { if (event.status) refreshNow(); else if (!event.heard || tab === 'heard') render(); };
  v.refresh = v.resume = () => render();
  render();
  return v;
}
