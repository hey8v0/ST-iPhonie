import {createView, esc, engines, btn, heading, empty, size, field, input, textArea, groupTitle, avatar} from './common.js';
import {icon, wave, halo} from './icons.js';
import {openAlbum} from './album-viewer.js';
import {saveFile} from '../download.js';
import {decodeMono, joinClips, encodeWav, JOIN_RATE} from '../core/audio-join.js';

const NOTE_COLORS = ['#fff4b0', '#ffd9e6', '#d9ecff', '#e3f5d9', '#efe0ff', '#ffe6cc'];
const hash = text => [...String(text)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
/** Saves the audio or picture a backend call returns ({blob, name}) and says under which name. */
const saveAs = async (ctx, file) => { const {blob, name} = await file; ctx.notify('已下载 ' + await saveFile(ctx.doc, blob, name)); };
const dateLabel = time => new Date(time).toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'});

export function libraryApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'library');
  let tab = 'favorites', role = '', epoch = 0;
  async function render() {
    const ticket = ++epoch;
    const [rows, cache, library] = await Promise.all([tab === 'favorites' ? api.listFavorites() : api.listAudio(), api.cacheStats(), api.libraryStats().catch(() => null)]);
    if (v.disposed || ticket !== epoch) return;
    const roleOf = r => r.role || r.metadata?.line?.role || '';
    const roles = [...new Set(rows.map(roleOf).filter(Boolean))];
    const shown = rows.filter(r => !role || roleOf(r) === role);
    const tabs = `<div class="segmented"><button data-action="tab" data-tab="favorites" aria-pressed="${tab === 'favorites'}">收藏</button><button data-action="tab" data-tab="cache" aria-pressed="${tab === 'cache'}">缓存</button></div>`;
    const filters = roles.length ? `<div class="filter-row"><button data-action="role" data-role="" aria-pressed="${!role}">全部</button>${roles.map(r => `<button data-action="role" data-role="${esc(r)}" aria-pressed="${role === r}">${esc(r)}</button>`).join('')}</div>` : '';
    let body;
    if (tab === 'favorites') {
      body = shown.length
        ? '<div class="group">' + shown.map(r => `<div class="audio-row" data-engine="${esc(r.engine)}">${btn('play-favorite', icon('play', true), 'play-round', `data-id="${esc(r.id)}" aria-label="播放收藏"`)}<div><p>“${esc(r.translation || r.text)}”</p><small>${esc(r.role)} · ${engines[r.engine] || r.engine} · ${size(r.size)} · ${dateLabel(r.createdAt)}</small></div><span class="row-tools">${btn('download-favorite', icon('download'), 'text-button', `data-id="${esc(r.id)}" aria-label="下载到本地"`)}${btn('delete-favorite', icon('trash'), 'text-button', `data-id="${esc(r.id)}" aria-label="删除收藏"`)}</span></div>`).join('') + '</div>'
        : empty('把喜欢的对白留在这里', '在听取里点爱心，就能把生成过的台词收藏起来。', 'heart');
    } else {
      const used = library?.limit ? Math.min(100, cache.bytes / library.limit * 100) : 0, fav = library?.limit ? Math.min(100, library.bytes / library.limit * 100) : 0;
      body = `<div class="group pad"><strong>本机音频</strong><div class="storage-meter"><i style="width:${fav}%;background:var(--pink)"></i><i style="width:${used}%;background:var(--accent)"></i></div>
          <div class="legend"><span style="--c:var(--pink)">收藏与资料 ${library ? size(library.bytes) : '无法读取'}</span><span style="--c:var(--accent)">缓存 ${cache.available ? cache.count + ' 段 · ' + size(cache.bytes) : '不可用'}</span></div></div>`
        + (shown.length
          ? '<div class="group">' + shown.map(r => { const line = r.metadata?.line || {}; return `<div class="audio-row" data-engine="${esc(r.metadata?.route?.engine || 'none')}"><span class="disc">${icon('wave')}</span><div><p>${esc(line.translation ? '“' + line.translation + '”' : '早期缓存的音频')}</p><small>${esc(line.role || '未知角色')} · ${size(r.bytes)}</small></div><span class="row-tools">${btn('download-cache', icon('download'), 'text-button', `data-id="${esc(r.key)}" aria-label="下载到本地"`)}${btn('favorite-cache', icon('heart'), 'text-button', `data-id="${esc(r.key)}" aria-label="收藏"`)}${btn('delete-cache', icon('trash'), 'text-button', `data-id="${esc(r.key)}" aria-label="清理"`)}</span></div>`; }).join('') + '</div>'
          : empty('还没有音频缓存', '点聊天里的声波生成过的台词会暂存在这里。'))
        + `<div class="actions">${btn('clear-cache', icon('trash') + '清理全部缓存', 'danger')}</div><p class="hint">收藏和缓存分开保存，清理缓存不会删掉收藏。</p>`;
    }
    v.draw(heading('音频收藏', '', 'Voice Library') + tabs + filters + body);
  }
  v.refresh = render;
  v.on('click', '[data-action]', async el => {
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'tab': tab = el.dataset.tab; role = ''; await render(); break;
      case 'role': role = el.dataset.role; await render(); break;
      case 'play-favorite': await api.playFavorite(id); break;
      case 'download-favorite': await v.busy(el, () => saveAs(ctx, api.audioFile({favorite: id}))); break;
      case 'download-cache': await v.busy(el, () => saveAs(ctx, api.audioFile({key: id}))); break;
      case 'favorite-cache': await v.busy(el, () => api.favoriteAudio(id)); ctx.notify('已加入收藏'); break;
      case 'delete-cache': if (await ctx.confirm('清理这段缓存？')) { await api.deleteAudio(id); await render(); } break;
      case 'delete-favorite': if (await ctx.confirm('删除这段收藏？')) { await api.deleteFavorite(id); await render(); } break;
      case 'clear-cache':
        if (await ctx.confirm('清理语音缓存？', '正在播放的音频会停止，收藏和其他资料会保留。')) { await v.busy(el, () => api.clearCache()); await render(); ctx.notify('语音缓存已清理'); }
        break;
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}

export function galleryApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'gallery'), urls = new Set();
  // selecting: the photos ticked while choosing several (null when not choosing); shown: the ids in the grid, in order;
  // album: the photo open full screen (album-viewer.js), swiped through in the grid's order.
  let epoch = 0, selecting = null, shown = [], album = null;
  const clear = () => { for (const url of urls) ctx.win.URL.revokeObjectURL(url); urls.clear(); };
  const urlFor = blob => { const url = ctx.win.URL.createObjectURL(blob); urls.add(url); return url; };
  const photoFile = async id => { const photo = await api.getPhoto(id); if (!photo) throw Error('这张照片已经不在了'); return {source: photo.blob, name: photo.name}; };
  const importButton = `<label class="chip-button file-button">${icon('import')}导入<input type="file" data-photo-files multiple accept="image/png,image/jpeg,image/webp,image/avif,image/gif" aria-label="导入照片"></label>`;
  async function render() {
    const ticket = ++epoch;
    const rows = await api.listPhotos();
    if (v.disposed || ticket !== epoch) return;
    clear();
    shown = rows.map(r => r.id);
    if (selecting) selecting = new Set([...selecting].filter(id => shown.includes(id)));
    if (!rows.length) selecting = null;
    const tools = selecting ? btn('select-cancel', '取消', 'chip-button') : (rows.length ? btn('select', icon('check') + '选择', 'chip-button') : '') + importButton;
    v.draw(heading('相册', `<span class="gallery-tools">${tools}</span>`, `Album · ${rows.length}`) + (rows.length
      ? `<div class="photo-grid${selecting ? ' selecting' : ''}">${rows.map(r => `<button data-action="photo" data-id="${esc(r.id)}" aria-label="${selecting ? '选择' : '查看'} ${esc(r.name)}"${selecting ? ` aria-pressed="${selecting.has(r.id)}"` : ''}><img loading="lazy" data-photo="${esc(r.id)}" alt="${esc(r.name)}"></button>`).join('')}</div>`
        + (selecting ? `<div class="select-bar"><span data-select-count>${countText()}</span>${btn('select-all', allText(), 'text-button')}${btn('select-delete', icon('trash') + '删除', 'danger', selecting.size ? '' : 'disabled')}</div>` : '')
      : empty('留住喜欢的画面', '从本地导入照片，也可以设为手机壁纸。', 'image')));
    for (const row of rows) {
      const photo = await api.getPhoto(row.id);
      if (v.disposed || ticket !== epoch) return;
      if (photo) { const img = [...v.root.querySelectorAll('[data-photo]')].find(el => el.dataset.photo === row.id); if (img) img.src = urlFor(photo.blob); }
    }
  }
  const countText = () => selecting.size ? `已选 ${selecting.size} 张` : '点照片来选择';
  const allText = () => selecting.size === shown.length ? '全不选' : '全选';
  /** Ticks change in place (the grid is not drawn again, which would load every picture again). */
  function syncSelection() {
    for (const b of v.root.querySelectorAll('.photo-grid [data-id]')) b.setAttribute('aria-pressed', String(selecting.has(b.dataset.id)));
    const count = v.root.querySelector('[data-select-count]'), all = v.root.querySelector('[data-action=select-all]'), del = v.root.querySelector('[data-action=select-delete]');
    if (count) count.textContent = countText();
    if (all) all.textContent = allText();
    if (del) del.disabled = !selecting.size;
  }
  /** Opens a photo full screen; the others of the grid are a swipe away. */
  function openPhoto(id, from = null) {
    album?.close();
    let changed = false;
    album = openAlbum({ctx, host: v.root.closest('.screen') || ctx.doc.body, ids: shown, index: Math.max(0, shown.indexOf(id)), from,
      load: id => api.getPhoto(id),
      actions: [
        {key: 'wallpaper', icon: 'image', label: '设为壁纸', run: async id => { await api.savePhone({wallpaper: {kind: 'photo', photoId: id}}); ctx.notify('已设为壁纸'); }},
        {key: 'download', icon: 'download', label: '下载', run: async id => { const {source, name} = await photoFile(id); await saveAs(ctx, {blob: source, name}); }},
        {key: 'delete', icon: 'trash', label: '删除', danger: true, run: async id => {
          if (!await ctx.confirm('删除这张照片？', '使用它的壁纸和图标会恢复默认。')) return;
          await api.deletePhoto(id); changed = true; ctx.notify('已删除');
          return 'removed';
        }}
      ],
      onClose: () => { album = null; if (changed) render().catch(e => ctx.notify(e.message)); }});
  }
  v.back = () => {
    if (album) { album.close(); return true; }
    if (selecting) { selecting = null; render().catch(e => ctx.notify(e.message)); return true; }
    return false;
  };
  v.refresh = render;
  const dispose = v.dispose;
  v.dispose = () => { epoch++; album?.close(); clear(); dispose(); };
  v.on('change', '[data-photo-files]', async el => {
    el.disabled = true;
    try {
      for (const file of el.files || []) await api.addPhoto({name: file.name, blob: file});
      await render();
      ctx.notify('照片已保存');
    } finally { if (el.isConnected) { el.value = ''; el.disabled = false; } }
  });
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'photo':
        if (selecting) { const id = el.dataset.id; if (selecting.has(id)) selecting.delete(id); else selecting.add(id); syncSelection(); break; }
        openPhoto(el.dataset.id, (el.querySelector('img') || el).getBoundingClientRect()); break;
      case 'select': selecting = new Set(); await render(); break;
      case 'select-cancel': selecting = null; await render(); break;
      case 'select-all': selecting = selecting.size === shown.length ? new Set() : new Set(shown); syncSelection(); break;
      case 'select-delete': {
        const ids = [...selecting];
        if (!ids.length || !await ctx.confirm(`删除这 ${ids.length} 张照片？`, '用它们当的壁纸、图标、头像和聊天背景会恢复默认；朋友圈配图和查手机照片变回「没画」，想要可以再画。')) break;
        const n = await v.busy(el, () => api.deletePhotos(ids));
        selecting = null; await render(); ctx.notify(`已删除 ${n} 张`);
        break;
      }
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}

export function notesApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'notes'), drafts = new Map();
  let current = null, epoch = 0;
  const color = id => NOTE_COLORS[hash(id || 'new') % NOTE_COLORS.length];
  async function render() {
    const ticket = ++epoch;
    if (current) {
      v.draw(heading(current.id ? '备忘录' : '新备忘录', '', 'Memo')
        + `<div class="note-paper" style="--nc:${color(current.id)}">${field('标题', input('title', current.title, 'text', 'maxlength="200" placeholder="标题"'))}${field('正文', textArea('text', current.text, 'rows="12" placeholder="写点什么…"'))}</div>
          <div class="savebar"><span class="save-state" data-save-state>草稿</span>${btn('save-note', '保存', 'primary')}</div>
          ${current.id ? `<div class="actions">${btn('delete-note', icon('trash') + '删除备忘录', 'danger')}</div>` : ''}`);
      return;
    }
    const rows = await api.listNotes();
    if (v.disposed || ticket !== epoch) return;
    v.draw(heading('备忘录', btn('add-note', icon('add'), 'round-button', 'aria-label="新增备忘录"'), `Memo · ${rows.length}`) + (rows.length
      ? `<div class="notes-grid">${rows.map((n, i) => `<button class="note-card" style="--nc:${color(n.id)};--r:${(hash(n.id) % 5 - 2) * .6}deg" data-action="edit-note" data-id="${esc(n.id)}"><strong>${esc(n.title || '未命名')}</strong><small>${esc(n.text.slice(0, 80) || '空白备忘录')}</small><small>${dateLabel(n.updatedAt)}</small></button>`).join('')}</div>`
      : empty('随手记下这一刻', '备忘录只由你手动记录，不读取聊天，也不会注入提示词。', 'edit')));
  }
  v.back = () => { if (!current) return false; current = null; render().catch(e => ctx.notify(e.message)); return true; };
  v.refresh = () => { if (!current) return render(); };
  v.on('input', '[data-field]', el => {
    current[el.dataset.field] = el.value;
    const s = v.root.querySelector('[data-save-state]');
    if (s) s.textContent = '未保存';
  });
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'add-note': current = drafts.get('new') || {title: '', text: ''}; drafts.set('new', current); await render(); break;
      case 'edit-note': {
        const rows = await api.listNotes(), saved = rows.find(r => r.id === el.dataset.id);
        if (!saved) return;
        current = drafts.get(saved.id) || saved;
        drafts.set(saved.id, current);
        await render();
        break;
      }
      case 'save-note':
        await v.busy(el, async () => {
          // Only what the user edits goes back: a saved note also carries its dates, which saveNote does not take.
          const target = current, saved = await api.saveNote({...(target.id ? {id: target.id} : {}), title: target.title, text: target.text});
          drafts.delete(target.id || 'new');
          drafts.set(saved.id, saved);
          if (current === target) { current = saved; await render(); v.root.querySelector('[data-save-state]').textContent = '已保存'; }
          ctx.notify('备忘录已保存');
        });
        break;
      case 'delete-note': if (await ctx.confirm('删除这条备忘录？')) { await api.deleteNote(current.id); drafts.delete(current.id); current = null; await render(); } break;
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}

export function listenApp(ctx) {
  const {api} = ctx, v = createView(ctx, 'listen');
  let latest = {id: -1, lines: []}, epoch = 0, playbackRevision = 0, currentIndex = -1;
  const ACTIVE = ['playing', 'paused', 'generating', 'waiting'];
  const indexOf = state => state.source !== 'dialogue' || !state.line ? -1 : latest.lines.findIndex((l, i) => l.role === state.line.role && l.text === state.line.text && (state.line.uiIndex === undefined || state.line.uiIndex === i));

  async function render() {
    const ticket = ++epoch;
    latest = api.latest();
    v.draw(heading('听取', btn('refresh', icon('refresh') + '刷新', 'chip-button'), 'Now Playing')
      + `<div class="listen-stage"><div class="portrait"><span class="ring"></span><span class="ring"></span>${halo()}<span data-portrait></span></div><span class="chip emotion" data-emotion hidden></span><div class="visualizer" aria-hidden="true">${'<i></i>'.repeat(32)}</div></div>
        <div class="dialogue-box"><span class="plate" data-speaker-plate><span></span></span><span class="dialogue-engine" data-engine-label></span><p class="play-caption" data-playback-line aria-live="polite"></p><div class="dialogue-foot"><span data-playback-message></span><svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M1 3h12L7 12z"/></svg></div></div>
        <div class="actions" data-waiting hidden>${btn('configure', icon('mic') + '去给这个角色选音色', 'primary')}</div>
        <div class="transport">${btn('favorite', icon('heart'), '', 'aria-label="收藏这一句"')}${btn('download', icon('download'), '', 'aria-label="下载这一句"')}${btn('prev', icon('prev', true), '', 'aria-label="上一句"')}${btn('main-play', icon('play', true), 'main-play', 'aria-label="播放"')}${btn('next', icon('skip', true), '', 'aria-label="下一句"')}${btn('stop', icon('stop', true), '', 'aria-label="停止"')}</div>
        ${latest.lines.length
          ? groupTitle('本条回复', `<span class="title-tools">${btn('export-all', icon('download') + '导出', 'chip-button', 'aria-label="导出整条：把这条回复的台词拼成一个音频文件"')}${btn('play-all', icon('play', true) + '整条播放', 'chip-button')}</span>`)
            + `<div class="group">${latest.lines.map((l, i) => `<div class="dialogue-row" data-row="${i}" data-engine="${ctx.engineOf(l.role)}"><div><small>${esc(l.role)}</small><p>${esc(l.translation)}</p></div>${btn('play-line', wave, 'wave-button', `data-index="${i}" data-state="ungenerated" aria-label="朗读 ${esc(l.role)} 的台词"`)}</div>`).join('')}</div>`
          : empty('等一句真正说出口的话', '回到聊天，点台词旁的声波；最新一条回复的台词会出现在这里。')}`);
    v.onPlayback(api.status());
    for (let i = 0; i < latest.lines.length; i++) {
      const state = await api.lineState(latest.lines[i]);
      if (v.disposed || ticket !== epoch) return;
      const b = v.root.querySelector(`[data-action=play-line][data-index="${i}"]`);
      if (b && !ACTIVE.includes(b.dataset.state)) b.dataset.state = state;
    }
  }

  v.onPlayback = state => {
    const revision = ++playbackRevision, on = ACTIVE.includes(state.phase);
    currentIndex = indexOf(state);
    for (const b of v.root.querySelectorAll('[data-action=play-line]')) {
      const i = Number(b.dataset.index), line = latest.lines[i];
      if (!line) continue;
      const row = b.closest('.dialogue-row');
      row?.toggleAttribute('data-current', i === currentIndex && on);
      if (i === currentIndex && on) b.dataset.state = state.phase;
      else api.lineState(line).then(value => { if (!v.disposed && revision === playbackRevision && b.isConnected) b.dataset.state = value; });
    }
    const speaker = on || state.line ? state.speaker || state.line?.role || '' : '';
    const engine = speaker ? ctx.engineOf(speaker) : 'none';
    v.root.dataset.engine = engine;
    v.root.dataset.phase = state.phase;
    const q = s => v.root.querySelector(s);
    if (q('[data-portrait]')) q('[data-portrait]').outerHTML = `<span data-portrait>${avatar(speaker || '听', engine, 106)}</span>`;
    if (q('[data-speaker-plate] span')) q('[data-speaker-plate] span').textContent = speaker || '听取';
    if (q('[data-engine-label]')) q('[data-engine-label]').textContent = engine === 'none' ? (speaker ? '未配置' : '') : engines[engine];
    if (q('[data-playback-line]')) q('[data-playback-line]').textContent = state.line?.translation ? '“' + state.line.translation + '”' : '点下面的台词，或者按整条播放。';
    if (q('[data-playback-message]')) q('[data-playback-message]').textContent = state.message || (currentIndex >= 0 ? `${currentIndex + 1} / ${latest.lines.length}` : '等待播放');
    const emotion = q('[data-emotion]');
    if (emotion) { emotion.hidden = !state.line?.emotion; emotion.textContent = state.line?.emotion || ''; }
    if (q('[data-waiting]')) q('[data-waiting]').hidden = state.phase !== 'waiting';
    const main = q('[data-action=main-play]');
    if (main) { main.innerHTML = icon(state.phase === 'playing' ? 'pause' : 'play', true); main.setAttribute('aria-label', state.phase === 'playing' ? '暂停' : '播放'); }
    const favorite = q('[data-action=favorite]');
    if (favorite) favorite.disabled = !api.latestAudio();
    const download = q('[data-action=download]');
    if (download) download.disabled = !api.latestAudio();
    const stop = q('[data-action=stop]');
    if (stop) stop.disabled = state.phase === 'idle';
    const prev = q('[data-action=prev]'), next = q('[data-action=next]');
    if (prev) prev.disabled = currentIndex <= 0;
    if (next) next.disabled = !latest.lines.length || currentIndex >= latest.lines.length - 1;
  };
  v.refresh = render;

  // The latest reply as one audio file, from the lines already generated (no new requests, no quota).
  async function exportReply() {
    const now = api.latest();
    if (!now.lines.length) throw Error('最新的回复里没有台词');
    const found = [], missing = [];
    for (const line of now.lines) {
      try { found.push((await api.audioFile({line})).blob); }
      catch (error) { if (/还没有生成/.test(error.message)) missing.push(line); else throw error; }
    }
    if (!found.length) throw Error('这条回复的台词都还没生成语音：先点「整条播放」，生成完再导出');
    if (missing.length && !await ctx.confirm(`有 ${missing.length} 句还没生成`, `只导出已经生成的 ${found.length} 句？想要完整的话，先点「整条播放」把每句都生成一遍，再导出。`)) return;
    const clips = [];
    for (const blob of found) clips.push(await decodeMono(ctx.win, blob));
    const roles = [...new Set(now.lines.map(l => l.role))].join('、');
    const name = await saveFile(ctx.doc, encodeWav(joinClips(clips), JOIN_RATE), `回复 #${now.id} · ${roles}`);
    ctx.notify(`已下载 ${name}（${found.length} 句）`);
  }
  function play(index) {
    const now = api.latest();
    if (JSON.stringify(now) !== JSON.stringify(latest)) { render().catch(e => ctx.notify(e.message)); ctx.notify('聊天内容已变化，请重新选择台词'); return; }
    api.play(latest.id, index);
  }
  v.on('click', '[data-action]', async el => {
    switch (el.dataset.action) {
      case 'refresh': await render(); break;
      case 'play-all': play(); break;
      case 'export-all': await v.busy(el, exportReply); break;
      case 'play-line': play(Number(el.dataset.index)); break;
      case 'main-play': {
        const phase = api.status().phase;
        if (['playing', 'paused', 'generating'].includes(phase)) api.toggle();
        else if (latest.lines.length) play(currentIndex > 0 ? currentIndex : undefined);
        break;
      }
      case 'prev': if (currentIndex > 0) play(currentIndex - 1); break;
      case 'next': play(currentIndex + 1); break;
      case 'stop': api.stop(); break;
      case 'configure': { const name = api.pendingRole(); if (name) ctx.openPendingRole(name); break; }
      case 'download': {
        const audio = api.latestAudio();
        if (!audio) throw Error('先生成一句台词再下载');
        await v.busy(el, () => saveAs(ctx, api.audioFile({key: audio.key})));
        break;
      }
      case 'favorite': {
        const audio = api.latestAudio();
        if (!audio) throw Error('先生成一句台词再收藏');
        await v.busy(el, () => api.favoriteAudio(audio.key));
        ctx.notify('已加入收藏');
        break;
      }
    }
  });
  render().catch(e => ctx.notify(e.message));
  return v;
}
