import {esc, heading, field, select, input, btn, menu} from './common.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {saveFile, zipFiles} from '../download.js';
import {decodeMono, joinClips, encodeWav} from '../core/audio-join.js';
import {BEDTIME_TYPES} from '../core/bedtime.js';
import {icon} from './icons.js';

export const bookTabs = bedtime => `<div class="segmented" aria-label="绘本板块">${btn('bk-shelf', '书架', '', `aria-pressed="${!bedtime}"`)}${btn('bk-bedtime', '睡前故事', '', `aria-pressed="${bedtime}"`)}</div>`;

export function bedtimeView(ctx, v) {
  const {api} = ctx;
  let active = false, hidden = false, books = [], saved = [], songs = [], roles = [], source = null, ticket = 0, night = null, creating = false, swipes = null;
  const actions = [{key: 'download', label: '下载', icon: 'download'}, {key: 'delete', label: '删除', icon: 'trash', danger: true}];
  const form = {role: '', kind: '睡前故事', minutes: '3', wish: '', sourceId: '', chapter: '0', paragraph: '0', timer: '0', song: ''};
  const status = () => api.bedtimeStatus?.() || {playing: false};
  function render() {
    if (!active || v.disposed) return;
    const now = status();
    now.busy ||= creating;
    swipes?.dispose(); swipes = null;
    v.draw(heading('睡前故事', '', '晚安') + bookTabs(true)
      + `<section class="bedtime-room">${hidden || now.playing ? '' : `<div class="bedtime-sky" aria-hidden="true"><span class="bedtime-moon"></span><p>把夜晚留给一个温柔的声音</p></div><div class="bedtime-form">
      ${field('讲故事的人', select('bt-role', form.role, [['', '选择有声音的角色'], ...roles.map(r => [r.name, r.name])]))}
      ${field('听什么', select('bt-sourceId', form.sourceId, [['', '讲一个新的'], ...books.map(b => [b.id, `从书架选一本 · ${b.title}`])]))}
      ${form.sourceId && source ? field('从哪一章', select('bt-chapter', form.chapter, source.chapters.map((t, i) => [String(i), t]))) + field('从哪一段', select('bt-paragraph', form.paragraph, source.paragraphs.map((p, i) => [String(i), `${i + 1} · ${p.slice(0, 25)}`]))) : ''}
      ${!form.sourceId ? field('故事类型', select('bt-kind', form.kind, BEDTIME_TYPES.map(x => [x, x]))) + (form.kind === '自己说想听什么' ? field('想听什么', input('bt-wish', form.wish, 'text', 'maxlength="500" placeholder="例如：月亮上的小狐狸"')) : '') : ''}
      ${field('长短', select('bt-minutes', form.minutes, [['3', '约 3 分钟'], ['8', '约 8 分钟'], ['15', '约 15 分钟']]))}
      <div class="actions">${btn('bt-create', now.busy ? '正在写故事…' : form.sourceId ? '准备这段故事' : '讲一个新的', 'primary', now.busy || !form.role ? 'disabled' : '')}</div>
      ${songs.length ? field('配一首轻音乐', select('bt-song', form.song, [['', '不配音乐'], ...songs.map(s => [s.id, s.title])])) : ''}
      ${field('定时关', select('bt-timer', form.timer, [['0', '讲完'], ['15', '15 分钟'], ['30', '30 分钟'], ['60', '60 分钟']]))}
      </div>${saved.length ? `<h3 class="bedtime-h">讲过的故事</h3><div class="bedtime-stories">${saved.map(b => swipeRow(b.id, `<div class="list-row"><span class="bedtime-thumb" aria-hidden="true">${icon('book')}</span><span class="bedtime-title"><strong>${esc(b.title)}</strong><small>${esc(b.bedtime.role)} · ${esc(b.bedtime.kind)}</small></span>${btn('bt-play', icon('play', true), 'text-button', `data-id="${esc(b.id)}" aria-label="再听《${esc(b.title)}》"`)}</div>`, actions, {label: b.title})).join('')}</div>` : ''}`}
      ${now.playing ? hidden ? `<div class="bedtime-playing">${btn('bt-hide', esc(now.text || '故事就要开始了…'), 'bedtime-line', 'aria-label="显示文字和播放控制"')}</div>` : `<div class="bedtime-playing bedtime-sky"><span class="bedtime-moon" aria-hidden="true"></span><small class="bedtime-who">${esc(form.role || '')}正在讲</small><p aria-live="polite">${esc(now.text || '故事就要开始了…')}</p><div class="bedtime-controls">${btn('bt-stop', icon('stop'), 'round-button', 'aria-label="停止"')}${btn('bt-hide', icon('eye'), 'round-button', 'aria-label="隐藏文字"')}</div></div>` : ''}</section>`);
    const list = v.root.querySelector('.bedtime-stories');
    if (list) swipes = mountSwipeList(list, {ctx, onTap: play, onAction: (key, id) => act(key, [id]), bulk: actions, onBulk: act});
    v.root.classList.toggle('bedtime-dark', hidden && now.playing);
    if (hidden && now.playing) {
      if (!night) {
        night = ctx.doc.createElement('div'); night.className = 'bedtime-night';
        const line = ctx.doc.createElement('button'); line.className = 'bedtime-line'; line.dataset.action = 'bt-hide';
        line.setAttribute('aria-label', '显示文字和播放控制');
        line.addEventListener('click', () => { hidden = false; render(); });
        night.append(line); (v.root.closest('.screen') || ctx.doc.body).append(night);
      }
      night.firstChild.textContent = now.text || '故事就要开始了…';
    } else { night?.remove(); night = null; }
  }
  async function loadSource() {
    const mine = ++ticket;
    if (!form.sourceId) { source = null; return; }
    const result = await api.bedtimeSource(form.sourceId, Number(form.chapter));
    if (mine === ticket) { source = result; form.chapter = String(result.chapter); form.paragraph = '0'; }
  }
  async function open() {
    active = true;
    [saved, books, songs] = await Promise.all([api.listBooks(), api.listReadingBooks(), api.listSongs()]);
    saved = saved.filter(b => b.bedtime); books = books.filter(b => b.type !== 'comic');
    roles = api.bedtimeRoles?.() || [];
    if (!form.role) form.role = roles[0]?.name || '';
    render();
  }
  v.root.addEventListener('change', async e => {
    const key = e.target.dataset.field?.replace(/^bt-/, '');
    if (!e.target.dataset.field?.startsWith('bt-') || !(key in form)) return;
    form[key] = e.target.value;
    try { if (key === 'sourceId' || key === 'chapter') { if (key === 'sourceId') form.chapter = '0'; await loadSource(); } render(); }
    catch (e) { ctx.notify(e.message, {error: true}); }
  });
  v.root.addEventListener('input', e => { if (e.target.dataset.field === 'bt-wish') form.wish = e.target.value; });
  v.on('click', '[data-action=bt-create]', async () => {
    if (creating || status().busy) return;
    creating = true; render();
    try { const book = await api.bedtimeCreate({...form}); if (active) { await open(); if (active) play(book.id); } }
    finally { creating = false; render(); }
  });
  async function act(key, ids) {
    if (key === 'delete') {
      if (!await ctx.confirm(`删除这 ${ids.length} 个故事？`, '删除后无法恢复。')) return;
      if (ids.includes(status().id)) api.bedtimeStop();
      for (const id of ids) await api.deleteBook(id);
      await open(); return;
    }
    const kind = await menu(ctx, '下载故事', [{key: 'text', label: '故事文字', icon: 'notes'}, {key: 'audio', label: '讲述音频（WAV）', icon: 'listen', note: '不含背景音乐和音效；未缓存的语音会使用引擎额度生成'}]);
    if (!kind) return;
    const files = [];
    for (const id of ids) {
      const book = await api.getBook(id); if (!book?.bedtime) continue;
      let blob;
      if (kind === 'text') blob = new Blob([book.title + '\n\n' + book.bedtime.steps.filter(s => s.kind === 'say').map(s => s.translation || s.text).join('\n\n')], {type: 'text/plain'});
      else {
        ctx.notify(`正在准备《${book.title}》的声音…`);
        const clips = [];
        for (const b of await api.bedtimeAudio(id)) clips.push(await decodeMono(ctx.win, b, 24000));
        if (!clips.length) throw Error('这个故事还没有可下载的声音');
        blob = encodeWav(joinClips(clips, 24000, .35), 24000);
      }
      files.push({name: `${files.length + 1}-${book.title.replace(/[\\/:*?"<>|]/g, ' ')}.${kind === 'text' ? 'txt' : 'wav'}`, blob});
    }
    if (!files.length) return;
    await saveFile(ctx.doc, files.length === 1 ? files[0].blob : await zipFiles(files), files.length === 1 ? files[0].name : '睡前故事.zip');
  }
  function play(id) { api.bedtimePlay(id, {timer: Number(form.timer), song: form.song}).catch(e => ctx.notify(e.message, {error: true})); }
  v.on('click', '[data-action=bt-play]', el => play(el.dataset.id));
  v.on('click', '[data-action=bt-stop]', () => { api.bedtimeStop(); hidden = false; render(); });
  v.on('click', '[data-action=bt-hide]', () => { hidden = !hidden; render(); });
  const update = () => { if (hidden && !status().playing) hidden = false; render(); };
  const off = api.subscribe?.(e => { if (e.type === 'bedtime') update(); });
  v.onBedtime = update;
  return {open, leave() { active = false; hidden = false; swipes?.dispose(); swipes = null; night?.remove(); night = null; v.root.classList.remove('bedtime-dark'); }, dispose() { active = false; swipes?.dispose(); night?.remove(); off?.(); }};
}
