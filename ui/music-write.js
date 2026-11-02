// 写歌 in 音乐 App: the songs written (a tab of the app), a form for the text model (or nothing, to write the words oneself), and a song's
// page: its words and style, a service to sing it, the versions made, and all of it to take to Suno's site by hand.
import {esc, btn, field, input, textArea, select, toggle, heading, groupTitle, empty, help, copyText} from './common.js';
import {icon} from './icons.js';
import {swipeRow, mountSwipeList} from './swipe-list.js';
import {SONG_LANGUAGES, SONG_GENRES, SONG_WORDINGS, SONG_VOICES, SONG_LENGTHS, SONG_LIMITS, normalizeSongForm} from '../core/song.js';

const AUDIO_FILES = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aac';
const SUNO = 'https://suno.com/create';
const CHOICES = {language: SONG_LANGUAGES, genre: SONG_GENRES, wording: SONG_WORDINGS, voice: SONG_VOICES};
/** Language is one choice; the others can be several. */
const parts = value => String(value ?? '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);

export function writePanel(ctx, {v, go}) {
  const {api} = ctx;
  let drafts = [], form = null, draft = null, options = [], songs = [], swipe = null, working = '', engine = '', undo = null, shownState = '';
  const stateOf = d => JSON.stringify([d?.state || '', d?.note || '', d?.songs || []]);

  // ---------- The songs written ----------
  async function load() { drafts = await api.listSongDrafts().catch(() => []); }
  const noteOf = d => d.state === 'singing' ? '正在唱……' : d.note ? '没做成' : d.songs.length ? (d.songs.length > 1 ? `做好了 ${d.songs.length} 版` : '做好了') : '还没唱';
  const draftRow = d => swipeRow(d.id, `<div class="list-row"><span><strong>${esc(d.title || '没有名字的歌')}</strong><small>${esc([d.who, noteOf(d)].filter(Boolean).join(' · '))}</small></span>${icon('next')}</div>`,
    [{key: 'delete', label: '删除', icon: 'trash', danger: true}], {label: d.title});
  function listHTML() {
    return `<div class="actions music-tools" style="margin-top:0">${btn('write-new', icon('edit') + '写一首', 'primary')}</div>`
      + (drafts.length ? `<div class="group" data-draft-list>${drafts.map(draftRow).join('')}</div>`
        : empty('还没有写过歌', '告诉模型想写什么，它会写好歌词和风格；再选一家唱出来，或者拿去 Suno 做。', 'music'));
  }
  function dropList() { swipe?.dispose(); swipe = null; }
  function mountList() {
    dropList();
    const box = v.root.querySelector('[data-draft-list]');
    if (!box) return;
    swipe = mountSwipeList(box, {ctx, hint: '点一下打开；左滑：删除；右滑：多选', mouseHint: '点一下打开；右键或 ⋯：删除；按住 Ctrl 点：多选',
      onTap: id => open(id).catch(error => ctx.notify(error.message, {error: true})),
      onAction: (key, id) => remove([id]).catch(error => ctx.notify(error.message, {error: true})),
      bulk: [{key: 'delete', label: '删除', icon: 'trash', danger: true}], onBulk: (key, ids) => remove(ids)});
  }
  async function remove(ids) {
    if (!await ctx.confirm(ids.length > 1 ? `删除这 ${ids.length} 首？` : '删除这首？', '只删歌词和风格，做好的歌还留在歌单里。')) return;
    await api.deleteSongDrafts(ids);
    go('main');
  }

  // ---------- The form ----------
  function newForm() {
    form = {...normalizeSongForm(api.getState().music.writing), about: '', who: '', instrumental: false};
    working = '';
    go('write-form', true);
  }
  const chipField = (key, label, placeholder, info = '') => field(label,
    `${input('write-' + key, form[key], 'text', `maxlength="${SONG_LIMITS.field}" placeholder="${esc(placeholder)}" autocomplete="off"`)}<div class="write-chips" role="group" aria-label="${esc(label)}">${CHOICES[key].map(o => `<button type="button" class="combo-chip" data-action="write-chip" data-key="${key}" data-value="${esc(o)}" aria-pressed="${parts(form[key]).includes(o)}">${esc(o)}</button>`).join('')}</div>`, info);
  function renderForm() {
    const names = (api.chatContacts?.() || []).map(c => c.name), busy = working === 'write';
    v.draw(heading('写一首', '', 'Write a song')
      + `<div class="group pad">${field('写什么', textArea('write-about', form.about, `rows="3" maxlength="${SONG_LIMITS.about}" placeholder="比如：下雨那天我们在书店躲雨，写给她的。不填就让模型自己想"`))}
        ${names.length ? field('谁的歌', select('write-who', form.who, [['', '不指定'], ...names.map(n => [n, n])]), '选了人，模型会按 TA 的人设和经历来写，像 TA 自己写的歌。') : ''}
        ${toggle('write-story', '参考最近的剧情', form.story, '让模型读最近的正文、世界书和记忆，从里面取细节。不想和剧情有关就关掉。')}</div>`
      + groupTitle('怎么写', help('这些都可以不填，模型会自己定。点下面的词就填进框里，也可以直接打字，写什么都行。'))
      + `<div class="group pad">${chipField('language', '语言', '比如：中文，也可以写 上海话、中英混合')}
        ${form.instrumental ? '' : chipField('wording', '歌词风格', '比如：直白口语，像发消息')}
        ${chipField('genre', '曲风', '比如：民谣，吉他弹唱，慢一点')}
        ${form.instrumental ? '' : chipField('voice', '人声', '比如：女声，有点沙哑')}
        <div class="field"><span>长度</span><div class="segmented" style="margin:0" role="group" aria-label="长度">${Object.entries(SONG_LENGTHS).map(([k, l]) => `<button type="button" data-action="write-length" data-length="${k}" aria-pressed="${form.length === k}">${l.name}</button>`).join('')}</div></div>
        ${toggle('write-instrumental', '纯音乐（不要歌词）', form.instrumental)}</div>`
      + `<div class="actions">${btn('write-go', icon('star') + (busy ? '正在写……' : '让 AI 写'), 'primary', busy ? 'disabled' : '')}${btn('write-self', '自己写', 'secondary', busy ? 'disabled' : '')}</div>`
      + `<p class="hint">让 AI 写会调用一次文字模型。写好以后可以改，改好了再唱。</p>`);
  }
  const formOut = () => ({about: form.about, who: form.who, story: form.story, instrumental: form.instrumental, language: form.language, genre: form.genre, wording: form.wording, voice: form.voice, length: form.length});

  // ---------- A song ----------
  async function open(id) {
    const row = await api.getSongDraft(id);
    if (!row) throw Error('这首歌的草稿已经删掉了');
    draft = row; working = ''; undo = null; shownState = stateOf(row);
    await readAround();
    go('draft', true);
  }
  /** Who can sing it and the songs it became. */
  async function readAround() {
    songs = await api.listSongs().catch(() => []);
    options = api.singOptions(draft);
    const ready = options.filter(o => o.ready);
    if (!ready.some(o => o.id === engine)) { const last = api.getState().music.sing.engine; engine = (ready.find(o => o.id === last) || ready[0])?.id || ''; }
  }
  const priceOf = id => options.find(o => o.id === id)?.price;
  function singBlock() {
    if (draft.state === 'singing') return `<p class="write-singing" role="status">${icon('music')}<span>正在唱……通常要几十秒到几分钟。可以先去做别的，做好了会提醒你。</span></p><div class="actions" style="margin:6px 0 0">${btn('write-cancel', '不等了', 'secondary small')}</div>`;
    const ready = options.filter(o => o.ready), note = draft.note ? `<p class="hint error-copy" role="alert">${esc(draft.note)}</p>` : '';
    if (!ready.length) return `${note}<p class="hint" style="margin-top:0">还没有能唱的服务，填一家的密钥就能用。${priceOf('stepfun')?.free ? '阶跃星辰限时免费到 11 月 8 日。' : ''}</p><div class="actions" style="margin:6px 0 0">${btn('write-engines', icon('next') + '去填密钥', 'secondary')}</div>`;
    return `${note}${field('用哪家唱', select('draft-engine', engine, ready.map(o => [o.id, o.name])))}<p class="hint" data-sing-price>${esc(priceOf(engine)?.text || '')}</p>
      <div class="actions" style="margin:6px 0 0">${btn('write-sing', icon('play', true) + (draft.songs.length ? '再唱一版' : '唱出来'), 'primary', working ? 'disabled' : '')}</div>`;
  }
  function madeRows() {
    const byId = new Map(songs.map(s => [s.id, s])), made = draft.songs.map(id => byId.get(id)).filter(Boolean);
    return made.length ? groupTitle('做好的歌', help('做好的歌都在「歌单」里，在那里可以改名字、删掉。')) + `<div class="group">${made.map(s => `<button type="button" class="list-row" data-action="write-play" data-id="${esc(s.id)}">${icon('play', true)}<span><strong>${esc(s.title)}</strong><small>${esc(s.artist || '')}</small></span></button>`).join('')}</div>` : '';
  }
  function renderDraft() {
    const busy = working === 'rewrite', words = !draft.instrumental;
    v.draw(heading(draft.title || '写歌', '', 'Song')
      + `<div class="group pad">${field('歌名', input('draft-title', draft.title, 'text', `maxlength="${SONG_LIMITS.title}"`))}
        ${field('风格', textArea('draft-style', draft.style, `rows="3" maxlength="${SONG_LIMITS.style}" placeholder="pop ballad, gentle piano, female vocals, 80 BPM"`), '写给音乐服务看的，英文效果最好：曲风、情绪、速度、乐器、人声。不能写真实歌手和歌名，服务会拒绝。')}
        ${words ? field('歌词', textArea('draft-lyrics', draft.lyrics, `rows="14" maxlength="${SONG_LIMITS.lyrics}" placeholder="[Verse 1]\n第一句\n第二句\n\n[Chorus]\n副歌"`), '[Verse 1]、[Chorus] 这样的标签单独占一行，用来分段，不会被唱出来。') : ''}
        <div class="write-wish"><input data-field="draft-wish" type="text" maxlength="${SONG_LIMITS.wish}" placeholder="想怎么改？比如：副歌再甜一点" aria-label="想怎么改" autocomplete="off">${btn('write-rewrite', icon('refresh') + (busy ? '正在改……' : '让 AI 改'), 'secondary small', busy ? 'disabled' : '')}</div>
        ${undo ? `<div class="actions" style="margin:6px 0 0">${btn('write-undo', '改回去', 'text-button')}</div>` : ''}</div>`
      + groupTitle('唱出来') + `<div class="group pad">${singBlock()}</div>`
      + madeRows()
      + `<details data-group="draft-suno"><summary>拿去 Suno 做 ${help('Suno 没有开放接口，插件接不了，但可以手动做：\n1. 复制歌词和风格，打开 Suno，选 Custom（自定义）模式，分别粘贴进去。\n2. 做好以后下载下来，再点「导入做好的歌」，它会进歌单，歌词按歌的长度估算时间。\n\nSuno 对下载次数有限制（免费账号很少），以它的说明为准。')}</summary><div class="fold-body"><div class="write-copy">
          ${words ? btn('write-copy', icon('copy') + '复制歌词', 'secondary small', 'data-what="lyrics"') : ''}${btn('write-copy', icon('copy') + '复制风格', 'secondary small', 'data-what="style"')}${btn('write-copy', icon('copy') + '复制歌名', 'secondary small', 'data-what="title"')}
          <a class="secondary small write-link" href="${SUNO}" target="_blank" rel="noopener noreferrer">${icon('next')}打开 Suno</a>
          <label class="secondary small file-button">${icon('add')}导入做好的歌<input type="file" data-draft-file accept="${AUDIO_FILES}" aria-label="选择做好的歌"></label></div></div></details>`
      + `<div class="actions">${btn('write-delete', icon('trash') + '删除这首', 'text-button danger-text')}</div>`);
  }
  /** What was typed, kept: the words are what the song is. */
  async function save() {
    if (!draft) return;
    const row = await api.saveSongDraft({id: draft.id, title: draft.title, style: draft.style, lyrics: draft.lyrics});
    if (draft && row) draft = {...draft, updatedAt: row.updatedAt};
  }
  /** Something changed behind the page: how far the singing is goes on the page, what is being typed stays. */
  async function changed() {
    if (!draft) return;
    const row = await api.getSongDraft(draft.id).catch(() => null);
    if (!row || !draft) return;
    const state = stateOf(row);
    if (state === shownState) return;
    shownState = state;
    Object.assign(draft, {songs: row.songs, note: row.note || ''});
    if (row.state) draft.state = row.state; else delete draft.state;
    await readAround();
    if (!v.disposed && go.mode() === 'draft') renderDraft();
  }
  function fail(error) { ctx.notify(error.message, {error: true}); }

  // ---------- What is done on them ----------
  v.on('input', '[data-field^="write-"]', el => {
    const key = el.dataset.field.slice(6);
    if (!form || !(key in form) || el.type === 'checkbox') return;
    form[key] = el.value;
    if (CHOICES[key]) for (const b of el.parentElement.querySelectorAll('[data-action=write-chip]')) b.setAttribute('aria-pressed', String(parts(el.value).includes(b.dataset.value)));
  });
  v.on('change', '[data-field="write-who"]', el => { form.who = el.value; });
  v.on('change', '[data-field="write-story"]', el => { form.story = el.checked; });
  v.on('change', '[data-field="write-instrumental"]', el => { form.instrumental = el.checked; renderForm(); });
  v.on('input', '[data-field="draft-title"],[data-field="draft-style"],[data-field="draft-lyrics"]', el => { if (draft) draft[el.dataset.field.slice(6)] = el.value; });
  v.on('change', '[data-field="draft-title"],[data-field="draft-style"],[data-field="draft-lyrics"]', () => { save().catch(fail); });
  v.on('change', '[data-field="draft-engine"]', el => {
    engine = el.value;
    const line = v.root.querySelector('[data-sing-price]');
    if (line) line.textContent = priceOf(engine)?.text || '';
  });
  v.on('change', '[data-draft-file]', async el => {
    const file = el.files?.[0];
    el.value = '';
    if (!file || !draft) return;
    try { await save(); await api.importSongFile(draft.id, file); ctx.notify('放进歌单了'); }
    catch (error) { fail(error); }
  });
  async function click(el) {
    switch (el.dataset.action) {
      case 'write-new': newForm(); break;
      case 'write-chip': {
        const key = el.dataset.key, box = v.root.querySelector(`[data-field="write-${key}"]`), value = el.dataset.value;
        if (key === 'language') form[key] = value;
        else { const now = parts(form[key]); form[key] = (now.includes(value) ? now.filter(x => x !== value) : [...now, value]).join('、'); }
        box.value = form[key];
        for (const b of el.parentElement.children) b.setAttribute('aria-pressed', String(parts(form[key]).includes(b.dataset.value)));
        break;
      }
      case 'write-length': form.length = el.dataset.length; for (const b of el.parentElement.children) b.setAttribute('aria-pressed', String(b === el)); break;
      case 'write-go': {
        if (!api.songWrite) { ctx.notify('要在酒馆里打开小手机，才能让模型写', {error: true}); break; }
        working = 'write'; renderForm();
        try { const row = await api.songWrite(formOut()); if (go.mode() === 'write-form') await open(row.id); else ctx.notify(`「${row.title}」写好了，在「写歌」里`); }
        catch (error) { fail(error); }
        finally { working = ''; if (!v.disposed && go.mode() === 'write-form') renderForm(); }
        break;
      }
      case 'write-self': {
        const f = formOut();
        try {
          api.saveMusic({writing: normalizeSongForm(f)});
          const row = await api.saveSongDraft({title: '', style: [f.genre, f.voice].filter(Boolean).join(', '), lyrics: '', instrumental: f.instrumental, language: normalizeSongForm(f).language, who: f.who, about: f.about, seconds: SONG_LENGTHS[f.length].seconds});
          await open(row.id);
        } catch (error) { fail(error); }
        break;
      }
      case 'write-sing': {
        try {
          await save();
          options = api.singOptions(draft);
          const price = priceOf(engine);
          if (!price) break;
          if (!price.free && !await ctx.confirm('这首要花钱', `${price.text}，确认后再做。`)) break;
          draft.state = 'singing'; delete draft.note; shownState = stateOf(draft); renderDraft();
          api.singDraft(draft.id, {engine, allowPaid: true}).catch(error => { if (draft) { delete draft.state; draft.note = error.message; shownState = stateOf(draft); if (go.mode() === 'draft') renderDraft(); } fail(error); });
        } catch (error) { fail(error); }
        break;
      }
      case 'write-cancel': if (await ctx.confirm('不等了？', '已经发给服务的这一次，它可能还会照常扣费。')) api.cancelSing(draft.id); break;
      case 'write-rewrite': {
        const box = v.root.querySelector('[data-field="draft-wish"]'), wish = box?.value.trim();
        if (!wish) { ctx.notify('写一下想怎么改', {error: true}); box?.focus(); break; }
        if (!api.songRewrite) { ctx.notify('要在酒馆里打开小手机，才能让模型改', {error: true}); break; }
        const before = {title: draft.title, style: draft.style, lyrics: draft.lyrics}, id = draft.id;
        try {
          await save();
          working = 'rewrite'; renderDraft();
          const row = await api.songRewrite(id, wish);
          if (draft?.id === id) { undo = before; Object.assign(draft, {title: row.title, style: row.style, lyrics: row.lyrics}); }
        } catch (error) { fail(error); }
        finally { working = ''; if (!v.disposed && go.mode() === 'draft') renderDraft(); }
        break;
      }
      case 'write-undo': if (undo) { Object.assign(draft, undo); undo = null; try { await save(); } catch (error) { fail(error); } renderDraft(); } break;
      case 'write-play': { const s = songs.find(x => x.id === el.dataset.id); if (s) api.musicPlayList?.([s], 0, 'library').catch(fail); break; }
      case 'write-copy': {
        const what = el.dataset.what;
        ctx.notify(await copyText(ctx.win, draft[what] || '') ? ({lyrics: '歌词', style: '风格', title: '歌名'}[what] + '复制好了') : '没复制上，长按框里的字手动复制吧');
        break;
      }
      case 'write-engines': ctx.open('engines'); ctx.editEngine?.('stepfun'); break;
      case 'write-delete': if (await ctx.confirm('删除这首？', '只删歌词和风格，做好的歌还留在歌单里。')) { await api.deleteSongDrafts([draft.id]); draft = null; go('main'); } break;
    }
  }
  return {load, listHTML, mountList, dropList, renderForm, renderDraft, click, changed,
    open: id => open(id).catch(fail),
    /** Going back from its own pages: the song is saved first. */
    back() { const m = go.mode(); if (m !== 'draft' && m !== 'write-form') return false; if (m === 'draft') save().catch(fail); draft = null; form = null; go('main'); return true; }};
}
